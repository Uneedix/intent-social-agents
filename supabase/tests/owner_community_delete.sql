\set ON_ERROR_STOP on
-- Synthetic local transactions only; these fixtures never reach a hosted project.
BEGIN;
DO $$ BEGIN
 IF inet_server_addr() IS NOT NULL AND inet_server_addr() NOT IN (inet '127.0.0.1',inet '::1') THEN
  RAISE EXCEPTION 'Tests are restricted to a local database'; END IF;
END $$;
CREATE FUNCTION pg_temp.assert_true(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.denied(command text, expected text DEFAULT '42501') RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE command; EXCEPTION WHEN OTHERS THEN IF SQLSTATE=expected THEN RETURN; END IF; RAISE; END;
 RAISE EXCEPTION 'FAIL: operation unexpectedly allowed: %',command;
END $$;
DO $$ BEGIN EXECUTE format('GRANT USAGE ON SCHEMA %I TO anon, authenticated', pg_my_temp_schema()::regnamespace); END $$;

INSERT INTO auth.users(id,email) VALUES
 ('13000000-0000-0000-0000-000000000001','delete-owner@example.invalid'),
 ('13000000-0000-0000-0000-000000000002','delete-admin@example.invalid'),
 ('13000000-0000-0000-0000-000000000003','delete-member@example.invalid'),
 ('13000000-0000-0000-0000-000000000004','delete-outsider@example.invalid'),
 ('13000000-0000-0000-0000-000000000005','delete-other-owner@example.invalid');
INSERT INTO public.communities(id,owner_id,name,privacy,channels_enabled) VALUES
 ('23000000-0000-0000-0000-000000000001','13000000-0000-0000-0000-000000000001','Delete target','public',true),
 ('23000000-0000-0000-0000-000000000002','13000000-0000-0000-0000-000000000005','Keep other community','public',true);
INSERT INTO public.community_members(community_id,user_id,role) VALUES
 ('23000000-0000-0000-0000-000000000001','13000000-0000-0000-0000-000000000002','admin'),
 ('23000000-0000-0000-0000-000000000001','13000000-0000-0000-0000-000000000003','member');
INSERT INTO public.community_join_requests(community_id,user_id) VALUES
 ('23000000-0000-0000-0000-000000000001','13000000-0000-0000-0000-000000000004');
INSERT INTO public.community_posts(community_id,author_id,body) VALUES
 ('23000000-0000-0000-0000-000000000001','13000000-0000-0000-0000-000000000001','Remove this post'),
 ('23000000-0000-0000-0000-000000000002','13000000-0000-0000-0000-000000000005','Keep this post');
INSERT INTO public.community_channels(id,community_id,name) VALUES
 ('43000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000001','remove-channel');
INSERT INTO public.community_messages(channel_id,author_id,body) VALUES
 ('43000000-0000-0000-0000-000000000001','13000000-0000-0000-0000-000000000003','Remove channel history');

SELECT pg_temp.assert_true(NOT has_table_privilege('authenticated','public.communities','DELETE'),'no direct authenticated table DELETE');
SELECT pg_temp.assert_true(NOT has_function_privilege('anon','public.delete_community(uuid)','EXECUTE'),'no anonymous public RPC');
SELECT pg_temp.assert_true(NOT has_function_privilege('anon','intent_private.delete_community(uuid)','EXECUTE'),'no anonymous private implementation');
SELECT pg_temp.assert_true((SELECT NOT prosecdef FROM pg_proc WHERE oid='public.delete_community(uuid)'::regprocedure),'public RPC is invoker');
SELECT pg_temp.assert_true((SELECT prosecdef AND array_to_string(proconfig,',')='search_path=""' FROM pg_proc WHERE oid='intent_private.delete_community(uuid)'::regprocedure),'private implementation has fixed path');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
 WHERE p.oid IN ('public.delete_community(uuid)'::regprocedure,'intent_private.delete_community(uuid)'::regprocedure) AND a.grantee=0),'no PUBLIC function ACL');

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT pg_temp.denied($q$SELECT public.delete_community('23000000-0000-0000-0000-000000000001')$q$);
SET LOCAL ROLE authenticated;
SELECT pg_temp.denied($q$SELECT public.delete_community('23000000-0000-0000-0000-000000000001')$q$);
SELECT set_config('request.jwt.claim.sub','13000000-0000-0000-0000-000000000004',true);
SELECT pg_temp.denied($q$SELECT public.delete_community('23000000-0000-0000-0000-000000000001')$q$);
SELECT pg_temp.denied($q$SELECT intent_private.delete_community('23000000-0000-0000-0000-000000000001')$q$);
SELECT set_config('request.jwt.claim.sub','13000000-0000-0000-0000-000000000003',true);
SELECT pg_temp.denied($q$SELECT public.delete_community('23000000-0000-0000-0000-000000000001')$q$);
SELECT set_config('request.jwt.claim.sub','13000000-0000-0000-0000-000000000002',true);
SELECT pg_temp.denied($q$SELECT public.delete_community('23000000-0000-0000-0000-000000000001')$q$);
SELECT pg_temp.denied($q$DELETE FROM public.communities WHERE id='23000000-0000-0000-0000-000000000001'$q$);

-- Even a misleading membership 'owner' row does not grant ownership of the entity.
RESET ROLE;
UPDATE public.community_members SET role='owner' WHERE community_id='23000000-0000-0000-0000-000000000001' AND user_id='13000000-0000-0000-0000-000000000002';
SET LOCAL ROLE authenticated;
SELECT pg_temp.denied($q$SELECT public.delete_community('23000000-0000-0000-0000-000000000001')$q$);
SELECT set_config('request.jwt.claim.sub','13000000-0000-0000-0000-000000000001',true);
SELECT pg_temp.denied($q$DELETE FROM public.communities WHERE id='23000000-0000-0000-0000-000000000001'$q$);
SELECT pg_temp.denied($q$SELECT public.delete_community(NULL)$q$,'22023');
SELECT pg_temp.denied($q$SELECT public.delete_community('not-a-uuid')$q$,'22P02');
SELECT pg_temp.denied($q$SELECT public.delete_community('23000000-0000-0000-0000-000000000099')$q$);
SELECT pg_temp.denied($q$SELECT public.delete_community('23000000-0000-0000-0000-000000000002')$q$);
SELECT pg_temp.assert_true(public.delete_community('23000000-0000-0000-0000-000000000001')='23000000-0000-0000-0000-000000000001'::uuid,'owner receives exactly the deleted id');
SELECT pg_temp.denied($q$SELECT public.delete_community('23000000-0000-0000-0000-000000000001')$q$);
RESET ROLE;
-- Administrator inspection prevents RLS-hidden rows from masquerading as cascades.
SELECT pg_temp.assert_true(NOT EXISTS(SELECT FROM public.communities WHERE id='23000000-0000-0000-0000-000000000001'),'community really removed');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT FROM public.community_members WHERE community_id='23000000-0000-0000-0000-000000000001'),'members cascade');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT FROM public.community_join_requests WHERE community_id='23000000-0000-0000-0000-000000000001'),'requests cascade');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT FROM public.community_posts WHERE community_id='23000000-0000-0000-0000-000000000001'),'posts cascade');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT FROM public.community_channels WHERE community_id='23000000-0000-0000-0000-000000000001'),'channels cascade');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT FROM public.community_messages WHERE channel_id='43000000-0000-0000-0000-000000000001'),'messages cascade through channel');
SELECT pg_temp.assert_true(EXISTS(SELECT FROM public.communities WHERE id='23000000-0000-0000-0000-000000000002'),'other community remains');
SELECT pg_temp.assert_true(EXISTS(SELECT FROM public.community_posts WHERE body='Keep this post'),'other content remains');
SELECT pg_temp.assert_true((SELECT count(*)=5 FROM auth.users WHERE id::text LIKE '13000000-%'),'users are not deleted');
ROLLBACK;
\echo 'Owner-only community deletion and child cascades passed.'
