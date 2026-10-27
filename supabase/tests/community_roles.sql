\set ON_ERROR_STOP on
-- Roles/permissions for 20261025100000_community_roles.sql. Local disposable DB only; rolled back.
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
-- Expect a RAISE EXCEPTION with this exact message (RPC authorization failures).
CREATE FUNCTION pg_temp.raises(command text, message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE command; EXCEPTION WHEN raise_exception THEN IF SQLERRM=message THEN RETURN; END IF; RAISE; END;
 RAISE EXCEPTION 'FAIL: expected "%": %',message,command;
END $$;
CREATE FUNCTION pg_temp.violates(command text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE command; EXCEPTION WHEN check_violation THEN RETURN; END;
 RAISE EXCEPTION 'FAIL: constraint did not reject: %',command;
END $$;
DO $$ BEGIN EXECUTE format('GRANT USAGE ON SCHEMA %I TO anon, authenticated', pg_my_temp_schema()::regnamespace); END $$;

-- owner=1 admin=2 moderator=3 member=4 outsider=5 applicant=6, community R (request) and O (open).
INSERT INTO auth.users(id,email) VALUES
 ('12000000-0000-0000-0000-000000000001','roles-owner@example.invalid'),
 ('12000000-0000-0000-0000-000000000002','roles-admin@example.invalid'),
 ('12000000-0000-0000-0000-000000000003','roles-mod@example.invalid'),
 ('12000000-0000-0000-0000-000000000004','roles-member@example.invalid'),
 ('12000000-0000-0000-0000-000000000005','roles-outsider@example.invalid'),
 ('12000000-0000-0000-0000-000000000006','roles-applicant@example.invalid');
INSERT INTO public.communities(id,owner_id,name,privacy,channels_enabled,posting_permission) VALUES
 ('22000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000001','Roles request fixture','request',true,'staff'),
 ('22000000-0000-0000-0000-000000000002','12000000-0000-0000-0000-000000000001','Roles open fixture','public',true,'members');
INSERT INTO public.community_members(community_id,user_id,role) VALUES
 ('22000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000002','admin'),
 ('22000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000003','moderator'),
 ('22000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000004','member');
INSERT INTO public.community_join_requests(community_id,user_id,status) VALUES
 ('22000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000006','pending'),
 ('22000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000005','pending');
INSERT INTO public.community_channels(id,community_id,name) VALUES
 ('42000000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000001','general');
INSERT INTO public.community_messages(id,channel_id,author_id,body) VALUES
 ('52000000-0000-0000-0000-000000000001','42000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000004','hello');
INSERT INTO public.community_posts(id,community_id,author_id,body) VALUES
 ('62000000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000002','admin post');

-- Defaults and constraints.
SELECT pg_temp.assert_true((SELECT category='other' AND tags='{}' AND approve_requests_role='admin' FROM public.communities WHERE id='22000000-0000-0000-0000-000000000001'),'safe defaults');
SELECT pg_temp.violates($q$UPDATE public.communities SET category='casino' WHERE id='22000000-0000-0000-0000-000000000001'$q$);
SELECT pg_temp.violates($q$UPDATE public.communities SET tags=ARRAY['a','b','c','d','e','f'] WHERE id='22000000-0000-0000-0000-000000000001'$q$);
SELECT pg_temp.violates($q$UPDATE public.communities SET tags=ARRAY['  '] WHERE id='22000000-0000-0000-0000-000000000001'$q$);
SELECT pg_temp.violates($q$UPDATE public.communities SET approve_requests_role='member' WHERE id='22000000-0000-0000-0000-000000000001'$q$);
SELECT pg_temp.violates($q$UPDATE public.communities SET cover_url='javascript:alert(1)' WHERE id='22000000-0000-0000-0000-000000000001'$q$);
SELECT pg_temp.violates($q$UPDATE public.community_members SET role='superuser' WHERE user_id='12000000-0000-0000-0000-000000000004'$q$);

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT pg_temp.denied($q$SELECT public.intent_remove_member('22000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000004')$q$);
SELECT pg_temp.denied($q$SELECT intent_private.my_rank('22000000-0000-0000-0000-000000000001')$q$);

SET LOCAL ROLE authenticated;
-- Owner creates a community with discovery fields via INSERT RETURNING.
SELECT set_config('request.jwt.claim.sub','12000000-0000-0000-0000-000000000001',true);
DO $$ DECLARE r public.communities; BEGIN
 INSERT INTO public.communities(owner_id,name,privacy,category,tags,channels_enabled)
  VALUES(auth.uid(),'Wizard fixture','public','travel',ARRAY['hiking','europe'],true) RETURNING * INTO STRICT r;
 IF r.category<>'travel' OR r.tags<>ARRAY['hiking','europe'] THEN RAISE EXCEPTION 'FAIL: discovery fields not stored'; END IF;
 INSERT INTO public.community_channels(community_id,name) VALUES(r.id,'general'),(r.id,'introductions');
END $$;

-- Ordinary member: no queue, no moderation, no role changes, cannot post when staff-only.
SELECT set_config('request.jwt.claim.sub','12000000-0000-0000-0000-000000000004',true);
SELECT pg_temp.assert_true(NOT EXISTS(SELECT FROM public.community_join_requests WHERE user_id='12000000-0000-0000-0000-000000000006'),'member cannot read request queue');
SELECT pg_temp.raises($q$SELECT public.intent_approve_request('22000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000006')$q$,'Not authorized');
SELECT pg_temp.raises($q$SELECT public.intent_decline_request('22000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000006')$q$,'Not authorized');
SELECT pg_temp.raises($q$SELECT public.intent_set_member_role('22000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000003','member')$q$,'Not authorized');
SELECT pg_temp.raises($q$SELECT public.intent_remove_member('22000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000003')$q$,'Not authorized');
SELECT pg_temp.denied($q$INSERT INTO public.community_posts(community_id,author_id,body) VALUES('22000000-0000-0000-0000-000000000001',auth.uid(),'x')$q$);
SELECT pg_temp.denied($q$INSERT INTO public.community_channels(community_id,name) VALUES('22000000-0000-0000-0000-000000000001','member-made')$q$);
SELECT pg_temp.denied($q$UPDATE public.community_members SET role='admin' WHERE user_id=auth.uid()$q$);
UPDATE public.communities SET approve_requests_role='moderator' WHERE id='22000000-0000-0000-0000-000000000001';
RESET ROLE;
SELECT pg_temp.assert_true((SELECT approve_requests_role FROM public.communities WHERE id='22000000-0000-0000-0000-000000000001')='admin','member cannot change permissions');
SET LOCAL ROLE authenticated;
DELETE FROM public.community_posts WHERE id='62000000-0000-0000-0000-000000000001';
SELECT pg_temp.assert_true(EXISTS(SELECT FROM public.community_posts WHERE id='62000000-0000-0000-0000-000000000001'),'member cannot delete others posts');
DELETE FROM public.community_messages WHERE id='52000000-0000-0000-0000-000000000001';
SELECT pg_temp.assert_true(NOT EXISTS(SELECT FROM public.community_messages WHERE id='52000000-0000-0000-0000-000000000001'),'author can delete own message');

-- Moderator: staff for posting, may delete posts, but approvals/removals need opt-in thresholds.
SELECT set_config('request.jwt.claim.sub','12000000-0000-0000-0000-000000000003',true);
INSERT INTO public.community_posts(community_id,author_id,body) VALUES('22000000-0000-0000-0000-000000000001',auth.uid(),'moderator post');
DELETE FROM public.community_posts WHERE id='62000000-0000-0000-0000-000000000001';
SELECT pg_temp.assert_true(NOT EXISTS(SELECT FROM public.community_posts WHERE id='62000000-0000-0000-0000-000000000001'),'moderator removes a post');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT FROM public.community_join_requests WHERE user_id='12000000-0000-0000-0000-000000000006'),'moderator cannot read queue by default');
SELECT pg_temp.raises($q$SELECT public.intent_approve_request('22000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000006')$q$,'Not authorized');
SELECT pg_temp.raises($q$SELECT public.intent_remove_member('22000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000004')$q$,'Not authorized');
SELECT pg_temp.denied($q$INSERT INTO public.community_channels(community_id,name) VALUES('22000000-0000-0000-0000-000000000001','mod-made')$q$);

-- Owner delegates approvals, removals and channels to moderators.
SELECT set_config('request.jwt.claim.sub','12000000-0000-0000-0000-000000000001',true);
UPDATE public.communities SET approve_requests_role='moderator', remove_members_role='moderator', manage_channels_role='moderator'
 WHERE id='22000000-0000-0000-0000-000000000001';
SELECT set_config('request.jwt.claim.sub','12000000-0000-0000-0000-000000000002',true);
UPDATE public.communities SET remove_members_role='admin' WHERE id='22000000-0000-0000-0000-000000000001';
RESET ROLE;
SELECT pg_temp.assert_true((SELECT remove_members_role FROM public.communities WHERE id='22000000-0000-0000-0000-000000000001')='moderator','admin cannot change owner settings');
SET LOCAL ROLE authenticated;

SELECT set_config('request.jwt.claim.sub','12000000-0000-0000-0000-000000000003',true);
SELECT pg_temp.assert_true((SELECT count(*) FROM public.community_join_requests WHERE community_id='22000000-0000-0000-0000-000000000001' AND status='pending')=2,'delegated moderator sees queue');
SELECT public.intent_approve_request('22000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000006');
SELECT public.intent_decline_request('22000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000005');
SELECT pg_temp.assert_true(EXISTS(SELECT FROM public.community_join_requests WHERE user_id='12000000-0000-0000-0000-000000000005' AND status='rejected'),'decline marks rejected');
SELECT pg_temp.raises($q$SELECT public.intent_decline_request('22000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000005')$q$,'No pending request');
INSERT INTO public.community_channels(id,community_id,name) VALUES('42000000-0000-0000-0000-000000000002','22000000-0000-0000-0000-000000000001','mod-made');
DELETE FROM public.community_channels WHERE id='42000000-0000-0000-0000-000000000002';
SELECT pg_temp.assert_true(NOT EXISTS(SELECT FROM public.community_channels WHERE id='42000000-0000-0000-0000-000000000002'),'delegated moderator deletes channel');
SELECT public.intent_remove_member('22000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000006');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT FROM public.community_members WHERE community_id='22000000-0000-0000-0000-000000000001' AND user_id='12000000-0000-0000-0000-000000000006'),'moderator removes member');
SELECT pg_temp.raises($q$SELECT public.intent_remove_member('22000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000002')$q$,'Not authorized');
SELECT pg_temp.raises($q$SELECT public.intent_set_member_role('22000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000004','moderator')$q$,'Not authorized');

-- Admin: manage lower ranks only; cannot promote to admin, touch owner/self.
SELECT set_config('request.jwt.claim.sub','12000000-0000-0000-0000-000000000002',true);
SELECT public.intent_set_member_role('22000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000004','moderator');
SELECT pg_temp.assert_true(EXISTS(SELECT FROM public.community_members WHERE user_id='12000000-0000-0000-0000-000000000004' AND community_id='22000000-0000-0000-0000-000000000001' AND role='moderator'),'admin promotes member to moderator');
SELECT pg_temp.raises($q$SELECT public.intent_set_member_role('22000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000004','admin')$q$,'Not authorized');
SELECT pg_temp.raises($q$SELECT public.intent_set_member_role('22000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000001','member')$q$,'Not authorized');
SELECT pg_temp.raises($q$SELECT public.intent_set_member_role('22000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000002','member')$q$,'Cannot change your own role');
SELECT pg_temp.raises($q$SELECT public.intent_set_member_role('22000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000004','owner')$q$,'Invalid role');
SELECT pg_temp.raises($q$SELECT public.intent_remove_member('22000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000001')$q$,'Not authorized');
SELECT pg_temp.raises($q$SELECT public.intent_set_member_role('22000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000005','member')$q$,'Not a member');

-- Outsider: cannot act on another community even with crafted calls.
SELECT set_config('request.jwt.claim.sub','12000000-0000-0000-0000-000000000005',true);
SELECT pg_temp.raises($q$SELECT public.intent_remove_member('22000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000004')$q$,'Not authorized');
SELECT pg_temp.assert_true(intent_private.my_rank('22000000-0000-0000-0000-000000000001')=0,'outsider rank is zero');
SELECT pg_temp.assert_true(NOT intent_private.can_act('22000000-0000-0000-0000-000000000001','unknown_action'),'unknown action is denied');

-- Owner: promotes to admin, demotes admin; owner row is immutable.
SELECT set_config('request.jwt.claim.sub','12000000-0000-0000-0000-000000000001',true);
SELECT public.intent_set_member_role('22000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000003','admin');
SELECT public.intent_set_member_role('22000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000002','member');
SELECT pg_temp.assert_true((SELECT role FROM public.community_members WHERE community_id='22000000-0000-0000-0000-000000000001' AND user_id='12000000-0000-0000-0000-000000000002')='member','owner demotes admin');
SELECT pg_temp.raises($q$SELECT public.intent_set_member_role('22000000-0000-0000-0000-000000000001','12000000-0000-0000-0000-000000000001','admin')$q$,'Cannot change your own role');
DELETE FROM public.community_members WHERE user_id=auth.uid() AND community_id='22000000-0000-0000-0000-000000000001';
SELECT pg_temp.assert_true(EXISTS(SELECT FROM public.community_members WHERE user_id=auth.uid() AND community_id='22000000-0000-0000-0000-000000000001' AND role='owner'),'owner cannot leave or be removed');
ROLLBACK;
\echo 'Community roles, permissions and request-queue assertions passed; fixtures rolled back.'
