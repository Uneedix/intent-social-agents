\set ON_ERROR_STOP on
-- Local disposable Supabase only; everything is rolled back, including fixtures.
BEGIN;
DO $$ BEGIN
 IF inet_server_addr() IS NOT NULL AND inet_server_addr() NOT IN (inet '127.0.0.1',inet '::1') THEN
  RAISE EXCEPTION 'Tests are restricted to a local database';
 END IF;
END $$;
CREATE FUNCTION pg_temp.assert_true(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.denied(command text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE command; EXCEPTION WHEN insufficient_privilege THEN RETURN; END;
 RAISE EXCEPTION 'FAIL: operation unexpectedly allowed: %',command;
END $$;
GRANT USAGE ON SCHEMA pg_temp TO anon, authenticated;

-- owner=...001, admin=...002, member=...003, outsider/applicant=...004.
INSERT INTO auth.users(id,email) VALUES
 ('10000000-0000-0000-0000-000000000001','intent-owner@example.invalid'),
 ('10000000-0000-0000-0000-000000000002','intent-admin@example.invalid'),
 ('10000000-0000-0000-0000-000000000003','intent-member@example.invalid'),
 ('10000000-0000-0000-0000-000000000004','intent-outsider@example.invalid');
INSERT INTO public.communities(id,owner_id,name,privacy,channels_enabled,posting_permission) VALUES
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Private fixture','private',true,'staff'),
 ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','Request fixture','request',false,'members');
INSERT INTO public.community_members(community_id,user_id,role) VALUES
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','admin'),
 ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','admin'),
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003','member');
INSERT INTO public.message_groups(id,title,created_by) VALUES
 ('30000000-0000-0000-0000-000000000001','Private group','10000000-0000-0000-0000-000000000001');
INSERT INTO public.message_group_members(group_id,user_id,role) VALUES
 ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','owner'),
 ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','admin'),
 ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003','member');

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT pg_temp.assert_true(NOT EXISTS(SELECT FROM public.communities WHERE id='20000000-0000-0000-0000-000000000001'),'anon cannot read private community');
SELECT pg_temp.assert_true(EXISTS(SELECT FROM public.communities WHERE id='20000000-0000-0000-0000-000000000002'),'anon can read request community');
SELECT pg_temp.denied('SELECT * FROM public.message_groups');
SELECT pg_temp.denied('SELECT * FROM public.community_members');
SELECT pg_temp.denied($q$SELECT public.intent_member('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001')$q$);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000004',true);
SELECT pg_temp.assert_true(NOT EXISTS(SELECT FROM public.communities WHERE id='20000000-0000-0000-0000-000000000001'),'outsider cannot read private community');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT FROM public.message_groups WHERE id='30000000-0000-0000-0000-000000000001'),'outsider cannot read group');
SELECT pg_temp.assert_true(NOT public.intent_member('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001'),'cannot probe owner membership');
SELECT pg_temp.assert_true(NOT public.intent_can_view('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001'),'cannot impersonate owner in visibility helper');
SELECT pg_temp.denied($q$INSERT INTO public.message_group_messages(group_id,body) VALUES('30000000-0000-0000-0000-000000000001','forbidden')$q$);
INSERT INTO public.community_join_requests(community_id,user_id,status) VALUES
 ('20000000-0000-0000-0000-000000000002',auth.uid(),'pending')
 ON CONFLICT(community_id,user_id) DO UPDATE SET status=excluded.status;
-- Same upsert twice must succeed without allowing self approval.
INSERT INTO public.community_join_requests(community_id,user_id,status) VALUES
 ('20000000-0000-0000-0000-000000000002',auth.uid(),'pending')
 ON CONFLICT(community_id,user_id) DO UPDATE SET status=excluded.status;
SELECT pg_temp.denied($q$UPDATE public.community_join_requests SET status='approved' WHERE user_id=auth.uid()$q$);
RESET ROLE;
UPDATE public.community_join_requests SET status='rejected' WHERE community_id='20000000-0000-0000-0000-000000000002';
SET LOCAL ROLE authenticated;
INSERT INTO public.community_join_requests(community_id,user_id,status) VALUES
 ('20000000-0000-0000-0000-000000000002',auth.uid(),'pending')
 ON CONFLICT(community_id,user_id) DO UPDATE SET status=excluded.status;
SELECT pg_temp.assert_true(EXISTS(SELECT FROM public.community_join_requests WHERE user_id=auth.uid() AND status='pending'),'rejected applicant can retry');

SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
SELECT pg_temp.assert_true(EXISTS(SELECT FROM public.communities WHERE id='20000000-0000-0000-0000-000000000001'),'member can read private community');
INSERT INTO public.message_group_messages(group_id,body) VALUES('30000000-0000-0000-0000-000000000001','member message');
SELECT pg_temp.denied($q$INSERT INTO public.message_group_messages(group_id,sender_id,body) VALUES('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','spoof')$q$);
SELECT pg_temp.denied($q$INSERT INTO public.community_posts(community_id,author_id,body) VALUES('20000000-0000-0000-0000-000000000001',auth.uid(),'staff only')$q$);
SELECT pg_temp.denied($q$INSERT INTO public.message_group_members(group_id,user_id,role) VALUES('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000004','owner')$q$);
INSERT INTO public.community_join_requests(community_id,user_id,status) VALUES
 ('20000000-0000-0000-0000-000000000002',auth.uid(),'pending');
DO $$ BEGIN
 BEGIN PERFORM public.add_message_group_member('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000004');
 EXCEPTION WHEN raise_exception THEN IF SQLERRM='Not authorized' THEN RETURN; END IF; RAISE; END;
 RAISE EXCEPTION 'FAIL: ordinary member added participant';
END $$;

SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
SELECT pg_temp.assert_true(public.intent_manager('20000000-0000-0000-0000-000000000001',auth.uid()),'admin is manager');
INSERT INTO public.community_posts(community_id,author_id,body) VALUES('20000000-0000-0000-0000-000000000001',auth.uid(),'admin post');
SELECT public.add_message_group_member('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000004');
SELECT public.intent_approve_request('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000004');
SELECT pg_temp.assert_true(EXISTS(SELECT FROM public.community_join_requests WHERE user_id='10000000-0000-0000-0000-000000000004' AND status='approved'),'admin approval succeeds');

SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
SELECT public.intent_approve_request('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000003');
SELECT pg_temp.assert_true(EXISTS(SELECT FROM public.community_members WHERE community_id='20000000-0000-0000-0000-000000000002' AND user_id='10000000-0000-0000-0000-000000000003'),'owner approval creates membership');
SELECT pg_temp.assert_true(public.create_message_group('Owner-created group','') IS NOT NULL,'owner can create group atomically');
UPDATE public.communities SET channels_enabled=false WHERE id='20000000-0000-0000-0000-000000000001';
SELECT pg_temp.denied($q$UPDATE public.communities SET owner_id='10000000-0000-0000-0000-000000000004' WHERE id='20000000-0000-0000-0000-000000000001'$q$);
SELECT pg_temp.assert_true(EXISTS(SELECT FROM public.community_members WHERE community_id='20000000-0000-0000-0000-000000000001' AND user_id=auth.uid() AND role='owner'),'owner trigger populated membership');
ROLLBACK;
\echo 'Access-control assertions passed; fixture transaction rolled back.'
