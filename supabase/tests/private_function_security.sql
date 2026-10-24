\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE f record; priv oid;
BEGIN
 IF (SELECT count(*) FROM intent_function_contract_before)<>9 THEN RAISE EXCEPTION 'Missing original contracts'; END IF;
 FOR f IN SELECT * FROM intent_function_contract_before LOOP
  IF NOT EXISTS (
   SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.oid=f.oid AND p.proname=f.proname
   AND NOT p.prosecdef AND p.proacl IS NOT DISTINCT FROM f.proacl
   AND p.proowner=f.proowner AND p.prorettype=f.prorettype AND p.proretset=f.proretset
   AND p.provolatile=f.provolatile
   AND pg_get_function_identity_arguments(p.oid)=f.identity_args
   AND pg_get_function_arguments(p.oid)=f.args_with_defaults
  ) THEN RAISE EXCEPTION 'Public contract changed or wrapper not INVOKER: %',f.proname; END IF;
  SELECT p.oid INTO priv FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='intent_private' AND p.proname=f.proname
    AND pg_get_function_identity_arguments(p.oid)=f.identity_args AND p.prosecdef
    AND array_to_string(p.proconfig,',')='search_path=""';
  IF priv IS NULL THEN RAISE EXCEPTION 'Missing fixed-path private DEFINER: %',f.proname; END IF;
  IF EXISTS(SELECT FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
   WHERE p.oid=priv AND a.grantee=0 AND a.privilege_type='EXECUTE') THEN
   RAISE EXCEPTION 'PUBLIC can execute private implementation: %',f.proname;
  END IF;
  IF NOT has_function_privilege('authenticated',priv,'EXECUTE') THEN RAISE EXCEPTION 'Authenticated grant missing: %',f.proname; END IF;
  IF has_function_privilege('anon',priv,'EXECUTE') IS DISTINCT FROM (f.proname='intent_can_view') THEN
   RAISE EXCEPTION 'Wrong anonymous private grant: %',f.proname;
  END IF;
 END LOOP;
 IF NOT has_schema_privilege('anon','intent_private','USAGE') OR NOT has_schema_privilege('authenticated','intent_private','USAGE') THEN
  RAISE EXCEPTION 'Invoker wrappers cannot resolve private schema'; END IF;
 IF has_schema_privilege('anon','intent_private','CREATE') OR has_schema_privilege('authenticated','intent_private','CREATE') THEN
  RAISE EXCEPTION 'API roles can create private objects'; END IF;
 IF EXISTS(SELECT FROM pg_namespace n CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
   WHERE n.nspname='intent_private' AND a.grantee=0) THEN RAISE EXCEPTION 'PUBLIC has private schema privileges'; END IF;
 IF EXISTS(SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.prosecdef AND
   (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE'))) THEN
  RAISE EXCEPTION 'An API-callable public SECURITY DEFINER remains'; END IF;
END $$;

-- Unlike administrator fixtures, these are the application's INSERT RETURNING
-- code path and exercise SELECT policy before/alongside owner membership trigger.
INSERT INTO auth.users(id,email) VALUES
 ('11000000-0000-0000-0000-000000000001','intent-new-owner@example.invalid'),
 ('11000000-0000-0000-0000-000000000002','intent-new-outsider@example.invalid');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11000000-0000-0000-0000-000000000001',true);
DO $$
DECLARE privacy_setting text; cid uuid; returned_row public.communities;
BEGIN
 FOREACH privacy_setting IN ARRAY ARRAY['public','request','private'] LOOP
  INSERT INTO public.communities(owner_id,name,privacy)
   VALUES(auth.uid(),'Owner-created '||privacy_setting,privacy_setting) RETURNING * INTO STRICT returned_row;
  cid:=returned_row.id;
  IF returned_row.owner_id<>auth.uid() OR returned_row.privacy<>privacy_setting THEN RAISE EXCEPTION 'Wrong returned community'; END IF;
  IF NOT EXISTS(SELECT FROM public.community_members WHERE community_id=cid AND user_id=auth.uid() AND role='owner') THEN
   RAISE EXCEPTION 'Owner trigger or private membership visibility broken: %',privacy_setting; END IF;
 END LOOP;
END $$;
-- The default description must still work by named public RPC argument.
DO $$ DECLARE gid uuid; BEGIN
 gid:=public.create_message_group(p_title=>'Default description group');
 PERFORM set_config('intent_test.group_id',gid::text,true);
 IF NOT EXISTS(SELECT FROM public.message_group_members WHERE group_id=gid AND user_id=auth.uid() AND role='owner') THEN
  RAISE EXCEPTION 'RPC group/owner transaction failed'; END IF;
END $$;
-- Force failure in the second half of group creation. The definer operation
-- must roll back the first group INSERT too, through its public invoker wrapper.
RESET ROLE;
CREATE FUNCTION pg_temp.reject_fixture_group_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT FROM public.message_groups WHERE id=NEW.group_id AND title='Atomicity failure fixture') THEN
  RAISE EXCEPTION 'Synthetic membership failure';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER intent_test_group_atomicity BEFORE INSERT ON public.message_group_members
 FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_fixture_group_owner();
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN
  PERFORM public.create_message_group('Atomicity failure fixture');
  RAISE EXCEPTION 'FAIL: expected synthetic failure';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM<>'Synthetic membership failure' THEN RAISE; END IF;
 END;
 IF EXISTS(SELECT FROM public.message_groups WHERE title='Atomicity failure fixture') THEN
  RAISE EXCEPTION 'Failed RPC left orphan group'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','11000000-0000-0000-0000-000000000002',true);
DO $$ BEGIN
 IF EXISTS(SELECT FROM public.communities WHERE name='Owner-created private') THEN RAISE EXCEPTION 'Outsider reads private community'; END IF;
 IF (SELECT count(*) FROM public.communities WHERE name LIKE 'Owner-created %')<>2 THEN RAISE EXCEPTION 'Outsider public/request reads broken'; END IF;
 BEGIN
  PERFORM intent_private.add_message_group_member(
   current_setting('intent_test.group_id')::uuid,'11000000-0000-0000-0000-000000000002');
  RAISE EXCEPTION 'FAIL: private implementation allowed outsider';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM<>'Not authorized' THEN RAISE; END IF;
 END;
END $$;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub','',true);
DO $$ BEGIN
 IF EXISTS(SELECT FROM public.communities WHERE name='Owner-created private') THEN RAISE EXCEPTION 'Anonymous reads private community'; END IF;
 IF (SELECT count(*) FROM public.communities WHERE name LIKE 'Owner-created %')<>2 THEN RAISE EXCEPTION 'Anonymous public/request reads broken'; END IF;
 BEGIN
  PERFORM intent_private.intent_member('00000000-0000-0000-0000-000000000001',NULL);
 EXCEPTION WHEN insufficient_privilege THEN RETURN; END;
 RAISE EXCEPTION 'Anonymous can call private membership implementation';
END $$;
ROLLBACK;
\echo 'Private implementations, exact public contracts and INSERT RETURNING passed.'
