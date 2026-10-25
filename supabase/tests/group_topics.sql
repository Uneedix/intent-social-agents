\set ON_ERROR_STOP on
-- Group topics/avatar/roles (20261025110000). Local disposable database only; rolled back.
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
-- Expect an RPC to fail with a specific message.
CREATE FUNCTION pg_temp.rejects(command text, expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE command; EXCEPTION WHEN raise_exception OR insufficient_privilege THEN
  IF SQLERRM=expected OR SQLSTATE='42501' AND expected='denied' THEN RETURN; END IF;
  RAISE EXCEPTION 'FAIL: % raised "%" instead of "%"',command,SQLERRM,expected; END;
 RAISE EXCEPTION 'FAIL: operation unexpectedly allowed: %',command;
END $$;
DO $$ BEGIN EXECUTE format('GRANT USAGE ON SCHEMA %I TO anon, authenticated', pg_my_temp_schema()::regnamespace); END $$;

-- owner=...1, admin=...2, member=...3, outsider=...4, invitee=...5
INSERT INTO auth.users(id,email) VALUES
 ('12000000-0000-0000-0000-000000000001','topics-owner@example.invalid'),
 ('12000000-0000-0000-0000-000000000002','topics-admin@example.invalid'),
 ('12000000-0000-0000-0000-000000000003','topics-member@example.invalid'),
 ('12000000-0000-0000-0000-000000000004','topics-outsider@example.invalid'),
 ('12000000-0000-0000-0000-000000000005','topics-invitee@example.invalid');

-- Structural contract: no API-callable public SECURITY DEFINER; wrappers are INVOKER.
DO $$ BEGIN
 IF EXISTS(SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prosecdef AND
  (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE'))) THEN
  RAISE EXCEPTION 'FAIL: API-callable public SECURITY DEFINER'; END IF;
 IF has_function_privilege('anon','public.create_message_group_v2(text,text,text,smallint,boolean,uuid[])','EXECUTE') THEN
  RAISE EXCEPTION 'FAIL: anon can create groups'; END IF;
 IF has_table_privilege('authenticated','public.message_group_topics','INSERT') OR has_table_privilege('authenticated','public.message_group_topics','UPDATE')
  OR has_table_privilege('anon','public.message_group_topics','SELECT') THEN RAISE EXCEPTION 'FAIL: topic table grants too broad'; END IF;
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','12000000-0000-0000-0000-000000000001',true);
DO $$ DECLARE gid uuid; BEGIN
 gid:=public.create_message_group_v2('Topic fixture','Telegram-like','data:image/png;base64,iVBORw0KGgo=',3::smallint,true,
  ARRAY['12000000-0000-0000-0000-000000000002','12000000-0000-0000-0000-000000000003']::uuid[]);
 PERFORM set_config('intent_test.gid',gid::text,true);
END $$;
SELECT pg_temp.assert_true((SELECT count(*)=3 FROM public.message_group_members WHERE group_id=current_setting('intent_test.gid')::uuid),'creator plus two members');
SELECT pg_temp.assert_true(EXISTS(SELECT FROM public.message_groups WHERE id=current_setting('intent_test.gid')::uuid AND topics_enabled AND avatar_color=3 AND avatar_url LIKE 'data:image/png%'),'profile stored');
SELECT pg_temp.assert_true((SELECT count(*)=1 FROM public.message_group_topics WHERE group_id=current_setting('intent_test.gid')::uuid AND is_general),'General topic always exists');
SELECT pg_temp.rejects($q$SELECT public.create_message_group_v2('Bad avatar','', 'javascript:alert(1)')$q$,'Invalid group avatar');
SELECT pg_temp.rejects($q$SELECT public.create_message_group_v2('Ghost member','',NULL,0::smallint,false,ARRAY['12000000-0000-0000-0000-0000000000ff']::uuid[])$q$,'User not found');
SELECT public.set_message_group_member_role(current_setting('intent_test.gid')::uuid,'12000000-0000-0000-0000-000000000002','admin');
-- Messages without topic_id (older clients) land in General.
INSERT INTO public.message_group_messages(group_id,body) VALUES(current_setting('intent_test.gid')::uuid,'hello general');
SELECT pg_temp.assert_true(EXISTS(SELECT FROM public.message_group_messages m JOIN public.message_group_topics t ON t.id=m.topic_id WHERE m.body='hello general' AND t.is_general),'default topic is General');

-- Outsider: cannot read topics/messages, post, create topics or manage members.
SELECT set_config('request.jwt.claim.sub','12000000-0000-0000-0000-000000000004',true);
SELECT pg_temp.assert_true(NOT EXISTS(SELECT FROM public.message_group_topics WHERE group_id=current_setting('intent_test.gid')::uuid),'outsider cannot read topics');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT FROM public.message_group_messages WHERE body='hello general'),'outsider cannot read topic history');
SELECT pg_temp.denied(format($q$INSERT INTO public.message_group_messages(group_id,body) VALUES(%L,'outsider post')$q$,current_setting('intent_test.gid')));
SELECT pg_temp.rejects(format($q$SELECT public.create_message_group_topic(%L,'Hijack')$q$,current_setting('intent_test.gid')),'Not authorized');
SELECT pg_temp.rejects(format($q$SELECT public.leave_message_group(%L)$q$,current_setting('intent_test.gid')),'Not a member');
SELECT pg_temp.rejects(format($q$SELECT public.delete_message_group(%L)$q$,current_setting('intent_test.gid')),'Not authorized');
SELECT pg_temp.assert_true(NOT intent_private.message_group_topic_open(current_setting('intent_test.gid')::uuid,(SELECT NULL::uuid)),'outsider cannot probe topics');
SELECT pg_temp.denied('INSERT INTO public.message_group_topics(group_id,title) VALUES(gen_random_uuid(),''x'')');

-- Member: reads, posts in open topic; cannot create/close topics or manage roles.
SELECT set_config('request.jwt.claim.sub','12000000-0000-0000-0000-000000000003',true);
SELECT pg_temp.assert_true(EXISTS(SELECT FROM public.message_group_topics WHERE group_id=current_setting('intent_test.gid')::uuid),'member reads topics');
SELECT pg_temp.rejects(format($q$SELECT public.create_message_group_topic(%L,'Member topic')$q$,current_setting('intent_test.gid')),'Not authorized');
SELECT pg_temp.rejects(format($q$SELECT public.update_message_group(%L,'Renamed by member')$q$,current_setting('intent_test.gid')),'Not authorized');
SELECT pg_temp.rejects(format($q$SELECT public.set_message_group_member_role(%L,'12000000-0000-0000-0000-000000000003','admin')$q$,current_setting('intent_test.gid')),'Not authorized');
SELECT pg_temp.rejects(format($q$SELECT public.remove_message_group_member(%L,'12000000-0000-0000-0000-000000000002')$q$,current_setting('intent_test.gid')),'Not authorized');
SELECT pg_temp.denied(format($q$UPDATE public.message_group_topics SET closed=true WHERE group_id=%L$q$,current_setting('intent_test.gid')));

-- Admin: creates topic, member posts there, admin closes it, posts are rejected server-side.
SELECT set_config('request.jwt.claim.sub','12000000-0000-0000-0000-000000000002',true);
DO $$ DECLARE tid uuid; BEGIN
 tid:=public.create_message_group_topic(current_setting('intent_test.gid')::uuid,'Design','🎨',2::smallint);
 PERFORM set_config('intent_test.tid',tid::text,true);
END $$;
SELECT pg_temp.rejects(format($q$SELECT public.create_message_group_topic(%L,'   ')$q$,current_setting('intent_test.gid')),'Invalid topic details');
SELECT set_config('request.jwt.claim.sub','12000000-0000-0000-0000-000000000003',true);
INSERT INTO public.message_group_messages(group_id,topic_id,body) VALUES(current_setting('intent_test.gid')::uuid,current_setting('intent_test.tid')::uuid,'member in open topic');
SELECT pg_temp.rejects(format($q$SELECT public.update_message_group_topic(%L,'Design','🎨',2::smallint,true,false)$q$,current_setting('intent_test.tid')),'Not authorized');
SELECT set_config('request.jwt.claim.sub','12000000-0000-0000-0000-000000000002',true);
SELECT public.update_message_group_topic(current_setting('intent_test.tid')::uuid,'Design','🎨',2::smallint,true,true);
SELECT pg_temp.rejects(format($q$SELECT public.update_message_group_topic(t.id,'General','#',0::smallint,true,false) FROM public.message_group_topics t WHERE t.group_id=%L AND t.is_general$q$,current_setting('intent_test.gid')),'General topic cannot be closed');
SELECT set_config('request.jwt.claim.sub','12000000-0000-0000-0000-000000000003',true);
SELECT pg_temp.denied(format($q$INSERT INTO public.message_group_messages(group_id,topic_id,body) VALUES(%L,%L,'closed topic')$q$,current_setting('intent_test.gid'),current_setting('intent_test.tid')));
SELECT set_config('request.jwt.claim.sub','12000000-0000-0000-0000-000000000002',true);
SELECT pg_temp.denied(format($q$INSERT INTO public.message_group_messages(group_id,topic_id,body) VALUES(%L,%L,'admin in closed topic')$q$,current_setting('intent_test.gid'),current_setting('intent_test.tid')));
-- A topic from another group can never be used (composite FK / policy).
SELECT set_config('request.jwt.claim.sub','12000000-0000-0000-0000-000000000001',true);
DO $$ DECLARE other uuid; ot uuid; BEGIN
 other:=public.create_message_group_v2('Other group','',NULL,0::smallint,true,'{}');
 SELECT id INTO ot FROM public.message_group_topics WHERE group_id=other AND is_general;
 BEGIN
  INSERT INTO public.message_group_messages(group_id,topic_id,body) VALUES(current_setting('intent_test.gid')::uuid,ot,'cross-group');
  RAISE EXCEPTION 'FAIL: cross-group topic accepted';
 EXCEPTION WHEN insufficient_privilege OR foreign_key_violation THEN NULL; END;
END $$;
-- Admin manages members; cannot remove owner, cannot promote (owner-only).
SELECT set_config('request.jwt.claim.sub','12000000-0000-0000-0000-000000000002',true);
SELECT public.add_message_group_member(current_setting('intent_test.gid')::uuid,'12000000-0000-0000-0000-000000000005');
SELECT public.remove_message_group_member(current_setting('intent_test.gid')::uuid,'12000000-0000-0000-0000-000000000005');
SELECT pg_temp.rejects(format($q$SELECT public.remove_message_group_member(%L,'12000000-0000-0000-0000-000000000001')$q$,current_setting('intent_test.gid')),'Not authorized');
SELECT pg_temp.rejects(format($q$SELECT public.set_message_group_member_role(%L,'12000000-0000-0000-0000-000000000003','admin')$q$,current_setting('intent_test.gid')),'Not authorized');
SELECT public.update_message_group(current_setting('intent_test.gid')::uuid,'Topic fixture renamed','New description',NULL,5::smallint,true);
SELECT pg_temp.assert_true(EXISTS(SELECT FROM public.message_groups WHERE title='Topic fixture renamed' AND avatar_url IS NULL AND avatar_color=5),'admin edits profile');
SELECT pg_temp.rejects(format($q$SELECT public.delete_message_group(%L)$q$,current_setting('intent_test.gid')),'Not authorized');
-- Member leaves; owner cannot leave; only owner deletes.
SELECT set_config('request.jwt.claim.sub','12000000-0000-0000-0000-000000000003',true);
SELECT public.leave_message_group(current_setting('intent_test.gid')::uuid);
SELECT pg_temp.assert_true(NOT EXISTS(SELECT FROM public.message_group_messages WHERE body='member in open topic'),'former member loses access');
SELECT set_config('request.jwt.claim.sub','12000000-0000-0000-0000-000000000001',true);
SELECT pg_temp.rejects(format($q$SELECT public.leave_message_group(%L)$q$,current_setting('intent_test.gid')),'Owner cannot leave; delete the group instead');
SELECT public.delete_message_group(current_setting('intent_test.gid')::uuid);
RESET ROLE;
SELECT pg_temp.assert_true(NOT EXISTS(SELECT FROM public.message_group_topics WHERE group_id=current_setting('intent_test.gid')::uuid),'delete cascades to topics');
ROLLBACK;
\echo 'Group topic, avatar and role assertions passed; fixture transaction rolled back.'
