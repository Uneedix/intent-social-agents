\set ON_ERROR_STOP on
-- Voice channels (20261025140000_voice_channels.sql). Local disposable DB only; rolled back.
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

-- owner=1 admin=2 moderator=3 member=4 outsider=5; community V (open), text T, voice X.
INSERT INTO auth.users(id,email) VALUES
 ('13000000-0000-0000-0000-000000000001','voice-owner@example.invalid'),
 ('13000000-0000-0000-0000-000000000002','voice-admin@example.invalid'),
 ('13000000-0000-0000-0000-000000000003','voice-mod@example.invalid'),
 ('13000000-0000-0000-0000-000000000004','voice-member@example.invalid'),
 ('13000000-0000-0000-0000-000000000005','voice-outsider@example.invalid');
INSERT INTO public.communities(id,owner_id,name,privacy,channels_enabled) VALUES
 ('23000000-0000-0000-0000-000000000001','13000000-0000-0000-0000-000000000001','Voice fixture','public',true);
INSERT INTO public.community_members(community_id,user_id,role) VALUES
 ('23000000-0000-0000-0000-000000000001','13000000-0000-0000-0000-000000000002','admin'),
 ('23000000-0000-0000-0000-000000000001','13000000-0000-0000-0000-000000000003','moderator'),
 ('23000000-0000-0000-0000-000000000001','13000000-0000-0000-0000-000000000004','member');
INSERT INTO public.community_channels(id,community_id,name) VALUES
 ('43000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000001','general');
INSERT INTO public.community_channels(id,community_id,name,kind,access,max_participants) VALUES
 ('43000000-0000-0000-0000-000000000002','23000000-0000-0000-0000-000000000001','lounge','voice','open',10);

SELECT pg_temp.assert_true((SELECT kind='text' AND access='open' AND max_participants=10 FROM public.community_channels WHERE id='43000000-0000-0000-0000-000000000001'),'existing/plain channels default to open text');
SELECT pg_temp.violates($q$INSERT INTO public.community_channels(community_id,name,kind) VALUES('23000000-0000-0000-0000-000000000001','x','video')$q$);
SELECT pg_temp.violates($q$INSERT INTO public.community_channels(community_id,name,kind,max_participants) VALUES('23000000-0000-0000-0000-000000000001','x','voice',1)$q$);
SELECT pg_temp.violates($q$INSERT INTO public.community_channels(community_id,name,kind,max_participants) VALUES('23000000-0000-0000-0000-000000000001','x','voice',100)$q$);
SELECT pg_temp.violates($q$INSERT INTO public.community_channels(community_id,name,kind,access) VALUES('23000000-0000-0000-0000-000000000001','x','voice','secret')$q$);

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT pg_temp.denied($q$SELECT public.intent_update_voice_channel('43000000-0000-0000-0000-000000000002','x','open',5)$q$);
SELECT pg_temp.denied($q$SELECT intent_private.intent_update_voice_channel('43000000-0000-0000-0000-000000000002','x','open',5)$q$);
SELECT pg_temp.assert_true((SELECT kind='voice' FROM public.community_channels WHERE id='43000000-0000-0000-0000-000000000002'),'anon sees public voice channel metadata');

SET LOCAL ROLE authenticated;
-- Outsider: no creation, no settings, no messages.
SELECT set_config('request.jwt.claim.sub','13000000-0000-0000-0000-000000000005',true);
SELECT pg_temp.denied($q$INSERT INTO public.community_channels(community_id,name,kind) VALUES('23000000-0000-0000-0000-000000000001','o','voice')$q$);
SELECT pg_temp.raises($q$SELECT public.intent_update_voice_channel('43000000-0000-0000-0000-000000000002','o','closed',5)$q$,'Not authorized');
SELECT pg_temp.denied($q$INSERT INTO public.community_messages(channel_id,author_id,body) VALUES('43000000-0000-0000-0000-000000000001',auth.uid(),'no')$q$);

-- Member: text messages yes; voice channel messages, creation and settings no.
SELECT set_config('request.jwt.claim.sub','13000000-0000-0000-0000-000000000004',true);
INSERT INTO public.community_messages(channel_id,author_id,body) VALUES('43000000-0000-0000-0000-000000000001',auth.uid(),'text still works');
SELECT pg_temp.denied($q$INSERT INTO public.community_messages(channel_id,author_id,body) VALUES('43000000-0000-0000-0000-000000000002',auth.uid(),'voice text')$q$);
SELECT pg_temp.denied($q$INSERT INTO public.community_channels(community_id,name,kind) VALUES('23000000-0000-0000-0000-000000000001','m','voice')$q$);
SELECT pg_temp.raises($q$SELECT public.intent_update_voice_channel('43000000-0000-0000-0000-000000000002','m','closed',5)$q$,'Not authorized');
SELECT pg_temp.denied($q$UPDATE public.community_channels SET access='closed' WHERE id='43000000-0000-0000-0000-000000000002'$q$);

-- Moderator: denied under the default 'admin' threshold.
SELECT set_config('request.jwt.claim.sub','13000000-0000-0000-0000-000000000003',true);
SELECT pg_temp.denied($q$INSERT INTO public.community_channels(community_id,name,kind) VALUES('23000000-0000-0000-0000-000000000001','mod','voice')$q$);
SELECT pg_temp.raises($q$SELECT public.intent_update_voice_channel('43000000-0000-0000-0000-000000000002','mod','closed',5)$q$,'Not authorized');

-- Admin: creates and edits voice channels; validation is server-side.
SELECT set_config('request.jwt.claim.sub','13000000-0000-0000-0000-000000000002',true);
INSERT INTO public.community_channels(id,community_id,name,kind,access,max_participants) VALUES
 ('43000000-0000-0000-0000-000000000003','23000000-0000-0000-0000-000000000001','stage','voice','closed',25);
SELECT pg_temp.denied($q$INSERT INTO public.community_channels(community_id,name,kind,access) VALUES('23000000-0000-0000-0000-000000000001','t','text','closed')$q$);
SELECT public.intent_update_voice_channel('43000000-0000-0000-0000-000000000002','  Main lounge ','closed',42);
SELECT pg_temp.assert_true((SELECT name='Main lounge' AND access='closed' AND max_participants=42 FROM public.community_channels WHERE id='43000000-0000-0000-0000-000000000002'),'admin updates voice settings');
SELECT pg_temp.raises($q$SELECT public.intent_update_voice_channel('43000000-0000-0000-0000-000000000002','x','open',100)$q$,'Invalid capacity');
SELECT pg_temp.raises($q$SELECT public.intent_update_voice_channel('43000000-0000-0000-0000-000000000002','x','open',1)$q$,'Invalid capacity');
SELECT pg_temp.raises($q$SELECT public.intent_update_voice_channel('43000000-0000-0000-0000-000000000002','x','public',5)$q$,'Invalid access');
SELECT pg_temp.raises($q$SELECT public.intent_update_voice_channel('43000000-0000-0000-0000-000000000002','   ','open',5)$q$,'Invalid name');
SELECT pg_temp.raises($q$SELECT public.intent_update_voice_channel('43000000-0000-0000-0000-000000000001','x','open',5)$q$,'Not a voice channel');
SELECT pg_temp.raises($q$SELECT public.intent_update_voice_channel('43000000-0000-0000-0000-0000000000ff','x','open',5)$q$,'Not authorized');
SELECT pg_temp.denied($q$INSERT INTO public.community_messages(channel_id,author_id,body) VALUES('43000000-0000-0000-0000-000000000003',auth.uid(),'staff voice text')$q$);

-- Owner lowers the threshold; moderator may now manage voice channels.
SELECT set_config('request.jwt.claim.sub','13000000-0000-0000-0000-000000000001',true);
UPDATE public.communities SET manage_channels_role='moderator' WHERE id='23000000-0000-0000-0000-000000000001';
SELECT public.intent_update_voice_channel('43000000-0000-0000-0000-000000000003','stage','open',99);
SELECT set_config('request.jwt.claim.sub','13000000-0000-0000-0000-000000000003',true);
SELECT public.intent_update_voice_channel('43000000-0000-0000-0000-000000000003','stage','closed',2);
SELECT pg_temp.assert_true((SELECT access='closed' AND max_participants=2 FROM public.community_channels WHERE id='43000000-0000-0000-0000-000000000003'),'moderator updates when threshold allows');
-- Member still cannot, owner deletes.
SELECT set_config('request.jwt.claim.sub','13000000-0000-0000-0000-000000000004',true);
SELECT pg_temp.raises($q$SELECT public.intent_update_voice_channel('43000000-0000-0000-0000-000000000003','m','open',5)$q$,'Not authorized');
DELETE FROM public.community_channels WHERE id='43000000-0000-0000-0000-000000000003';
SELECT set_config('request.jwt.claim.sub','13000000-0000-0000-0000-000000000001',true);
SELECT pg_temp.assert_true(EXISTS(SELECT FROM public.community_channels WHERE id='43000000-0000-0000-0000-000000000003'),'member delete had no effect');
DELETE FROM public.community_channels WHERE id='43000000-0000-0000-0000-000000000003';
SELECT pg_temp.assert_true(NOT EXISTS(SELECT FROM public.community_channels WHERE id='43000000-0000-0000-0000-000000000003'),'owner deletes voice channel');
RESET ROLE;
SELECT pg_temp.assert_true(NOT (SELECT prosecdef FROM pg_proc WHERE oid='public.intent_update_voice_channel(uuid,text,text,integer)'::regprocedure),'public wrapper is INVOKER');
SELECT pg_temp.assert_true((SELECT prosecdef FROM pg_proc WHERE oid='intent_private.intent_update_voice_channel(uuid,text,text,integer)'::regprocedure),'private implementation is DEFINER');
ROLLBACK;
\echo 'Voice channel assertions passed; fixtures rolled back.'
