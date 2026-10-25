-- Multiple shared pins; personal pins stay account-scoped on the device.
DO $$ BEGIN
 IF NOT EXISTS(SELECT FROM pg_constraint WHERE conrelid='public.message_group_messages'::regclass AND conname='message_group_messages_group_id_id_key') THEN
  ALTER TABLE public.message_group_messages ADD CONSTRAINT message_group_messages_group_id_id_key UNIQUE(group_id,id);
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS public.group_message_pins (
 group_id uuid NOT NULL REFERENCES public.message_groups(id) ON DELETE CASCADE,
 message_id uuid NOT NULL,
 pinned_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(group_id,message_id),
 CONSTRAINT group_message_pins_message_fkey FOREIGN KEY(group_id,message_id) REFERENCES public.message_group_messages(group_id,id) ON DELETE CASCADE
);
ALTER TABLE public.group_message_pins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.group_message_pins FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,DELETE ON public.group_message_pins TO authenticated;
DROP POLICY IF EXISTS pins_read ON public.group_message_pins;
CREATE POLICY pins_read ON public.group_message_pins FOR SELECT TO authenticated USING(intent_private.is_message_group_member(group_id));
DROP POLICY IF EXISTS pins_create ON public.group_message_pins;
CREATE POLICY pins_create ON public.group_message_pins FOR INSERT TO authenticated WITH CHECK(pinned_by=(SELECT auth.uid()) AND intent_private.is_message_group_member(group_id));
DROP POLICY IF EXISTS pins_remove ON public.group_message_pins;
CREATE POLICY pins_remove ON public.group_message_pins FOR DELETE TO authenticated USING(intent_private.is_message_group_member(group_id) AND (pinned_by=(SELECT auth.uid()) OR intent_private.can_manage_message_group(group_id)));
CREATE INDEX IF NOT EXISTS group_message_pins_pinned_by_idx ON public.group_message_pins(pinned_by);
NOTIFY pgrst,'reload schema';
