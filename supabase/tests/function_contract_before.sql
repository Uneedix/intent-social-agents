\set ON_ERROR_STOP on
-- Capture before applying the new migration; snapshots survive its transaction.
CREATE TEMP TABLE intent_function_contract_before AS
 SELECT p.oid,p.proname,p.proacl,p.proowner,p.prorettype,p.proretset,p.provolatile,
        pg_get_function_identity_arguments(p.oid) AS identity_args,
        pg_get_function_arguments(p.oid) AS args_with_defaults
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN
 ('intent_member','intent_staff','intent_manager','intent_can_view',
  'is_message_group_member','can_manage_message_group','intent_approve_request',
  'create_message_group','add_message_group_member');
DO $$ BEGIN
 IF (SELECT count(*) FROM intent_function_contract_before)<>9 THEN
  RAISE EXCEPTION 'Expected exactly nine original public contracts';
 END IF;
END $$;
