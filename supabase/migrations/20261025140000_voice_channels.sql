-- INTENT Communities: voice channels (metadata only). Apply after 20261025130000.
-- Additive and safe to repeat: three columns with defaults, one RPC, two replaced
-- policies (same names, so the 20261024000000 allow-list is unaffected).
-- Real audio/video is NOT implemented; this stores the channel and its settings.
-- access: 'open' = every member may join; 'closed' = only owner/admin/moderator.
-- NOTE: as with 20261025100000, do not replay access_hardening afterwards.
BEGIN;

ALTER TABLE public.community_channels ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'text';
ALTER TABLE public.community_channels ADD COLUMN IF NOT EXISTS access text NOT NULL DEFAULT 'open';
ALTER TABLE public.community_channels ADD COLUMN IF NOT EXISTS max_participants integer NOT NULL DEFAULT 10;
ALTER TABLE public.community_channels DROP CONSTRAINT IF EXISTS community_channels_kind_check;
ALTER TABLE public.community_channels ADD CONSTRAINT community_channels_kind_check CHECK (kind IN ('text','voice'));
ALTER TABLE public.community_channels DROP CONSTRAINT IF EXISTS community_channels_access_check;
ALTER TABLE public.community_channels ADD CONSTRAINT community_channels_access_check CHECK (access IN ('open','closed'));
ALTER TABLE public.community_channels DROP CONSTRAINT IF EXISTS community_channels_max_participants_check;
ALTER TABLE public.community_channels ADD CONSTRAINT community_channels_max_participants_check CHECK (max_participants BETWEEN 2 AND 99);

-- Creation (text or voice) stays behind the manage_channels threshold; values are
-- validated by the CHECK constraints above. Text channels keep the neutral defaults.
DROP POLICY IF EXISTS channels_create ON public.community_channels;
CREATE POLICY channels_create ON public.community_channels FOR INSERT TO authenticated
 WITH CHECK (intent_private.can_act(community_id,'manage_channels')
  AND (kind='voice' OR (access='open' AND max_participants=10)));

-- Messages only in text channels.
DROP POLICY IF EXISTS messages_create ON public.community_messages;
CREATE POLICY messages_create ON public.community_messages FOR INSERT TO authenticated
 WITH CHECK (author_id=(SELECT auth.uid()) AND EXISTS (SELECT 1 FROM public.community_channels ch
 JOIN public.communities c ON c.id=ch.community_id WHERE ch.id=channel_id AND ch.kind='text' AND c.channels_enabled AND
 public.intent_member(ch.community_id,(SELECT auth.uid()))));

-- Voice settings change only through this RPC (no UPDATE grant on the table).
CREATE OR REPLACE FUNCTION intent_private.intent_update_voice_channel(chid uuid, new_name text, new_access text, new_max integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE cid uuid; k text; n text := btrim(coalesce(new_name,''));
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;
 SELECT community_id, kind INTO cid, k FROM public.community_channels WHERE id=chid FOR UPDATE;
 IF cid IS NULL OR NOT intent_private.can_act(cid,'manage_channels') THEN RAISE EXCEPTION 'Not authorized'; END IF;
 IF k <> 'voice' THEN RAISE EXCEPTION 'Not a voice channel'; END IF;
 IF char_length(n) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'Invalid name'; END IF;
 IF new_access IS NULL OR new_access NOT IN ('open','closed') THEN RAISE EXCEPTION 'Invalid access'; END IF;
 IF new_max IS NULL OR new_max NOT BETWEEN 2 AND 99 THEN RAISE EXCEPTION 'Invalid capacity'; END IF;
 UPDATE public.community_channels SET name=n, access=new_access, max_participants=new_max WHERE id=chid;
END; $$;
CREATE OR REPLACE FUNCTION public.intent_update_voice_channel(chid uuid, new_name text, new_access text, new_max integer) RETURNS void
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = '' AS $$ SELECT intent_private.intent_update_voice_channel(chid,new_name,new_access,new_max); $$;

REVOKE ALL ON FUNCTION intent_private.intent_update_voice_channel(uuid,text,text,integer),
 public.intent_update_voice_channel(uuid,text,text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION intent_private.intent_update_voice_channel(uuid,text,text,integer),
 public.intent_update_voice_channel(uuid,text,text,integer) TO authenticated;
COMMIT;
