\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.assert_pin(ok boolean) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'pin assertion failed'; END IF; END $$;
CREATE FUNCTION pg_temp.reject_pin(command text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN BEGIN EXECUTE command; EXCEPTION WHEN insufficient_privilege OR foreign_key_violation THEN RETURN; END; RAISE EXCEPTION 'pin operation unexpectedly allowed'; END $$;
DO $$ BEGIN EXECUTE format('GRANT USAGE ON SCHEMA %I TO authenticated,anon',pg_my_temp_schema()::regnamespace); END $$;
INSERT INTO auth.users(id,email) VALUES
 ('13000000-0000-0000-0000-000000000001','pin-owner@example.invalid'),
 ('13000000-0000-0000-0000-000000000002','pin-member@example.invalid'),
 ('13000000-0000-0000-0000-000000000003','pin-outsider@example.invalid');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','13000000-0000-0000-0000-000000000001',true);
DO $$ DECLARE gid uuid;otherid uuid; BEGIN
 gid:=public.create_message_group('Pins fixture','');otherid:=public.create_message_group('Other pins','');
 PERFORM set_config('intent_test.pin_group',gid::text,true);PERFORM set_config('intent_test.pin_other',otherid::text,true);
 PERFORM public.add_message_group_member(gid,'13000000-0000-0000-0000-000000000002');
 INSERT INTO public.message_group_messages(group_id,sender_id,body) VALUES(gid,auth.uid(),'one'),(gid,auth.uid(),'two'),(otherid,auth.uid(),'other');
END $$;
INSERT INTO public.group_message_pins(group_id,message_id) SELECT group_id,id FROM public.message_group_messages WHERE group_id=current_setting('intent_test.pin_group')::uuid;
SELECT pg_temp.assert_pin((SELECT count(*)=2 FROM public.group_message_pins));
SELECT pg_temp.reject_pin($q$INSERT INTO public.group_message_pins(group_id,message_id) SELECT current_setting('intent_test.pin_group')::uuid,id FROM public.message_group_messages WHERE group_id=current_setting('intent_test.pin_other')::uuid$q$);
SELECT set_config('request.jwt.claim.sub','13000000-0000-0000-0000-000000000002',true);
SELECT pg_temp.assert_pin((SELECT count(*)=2 FROM public.group_message_pins));
DELETE FROM public.group_message_pins;
SELECT pg_temp.assert_pin((SELECT count(*)=2 FROM public.group_message_pins));
SELECT pg_temp.reject_pin($q$UPDATE public.group_message_pins SET created_at=now()$q$);
SELECT pg_temp.reject_pin($q$INSERT INTO public.group_message_pins(group_id,message_id,pinned_by) VALUES(current_setting('intent_test.pin_group')::uuid,gen_random_uuid(),'13000000-0000-0000-0000-000000000001')$q$);
SELECT set_config('request.jwt.claim.sub','13000000-0000-0000-0000-000000000003',true);
SELECT pg_temp.assert_pin((SELECT count(*)=0 FROM public.group_message_pins));
SELECT pg_temp.reject_pin($q$INSERT INTO public.group_message_pins(group_id,message_id) VALUES(current_setting('intent_test.pin_group')::uuid,gen_random_uuid())$q$);
SELECT set_config('request.jwt.claim.sub','13000000-0000-0000-0000-000000000001',true);
DELETE FROM public.group_message_pins;
SELECT pg_temp.assert_pin((SELECT count(*)=0 FROM public.group_message_pins));
INSERT INTO public.group_message_pins(group_id,message_id) SELECT group_id,id FROM public.message_group_messages WHERE group_id=current_setting('intent_test.pin_group')::uuid;
RESET ROLE;
DELETE FROM public.message_group_messages WHERE group_id=current_setting('intent_test.pin_group')::uuid;
SELECT pg_temp.assert_pin((SELECT count(*)=0 FROM public.group_message_pins));
SELECT pg_temp.assert_pin(NOT has_table_privilege('anon','public.group_message_pins','SELECT'));
ROLLBACK;
