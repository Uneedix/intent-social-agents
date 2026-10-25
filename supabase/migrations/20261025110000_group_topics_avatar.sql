-- INTENT: Telegram-style group chats — avatar, description, topics (subgroups)
-- and member role management. Apply after 20261024120000. The app never applies
-- this remotely; it feature-detects the new columns and shows a notice until an
-- approved upgrade has run. Transactional and safe to repeat.
BEGIN;

-- ---------- group profile ----------
ALTER TABLE public.message_groups
 ADD COLUMN IF NOT EXISTS avatar_url text,
 ADD COLUMN IF NOT EXISTS avatar_color smallint NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS topics_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.message_groups DROP CONSTRAINT IF EXISTS message_groups_avatar_check;
-- Small compressed data URLs (or https URLs) only; no storage bucket is required.
ALTER TABLE public.message_groups ADD CONSTRAINT message_groups_avatar_check CHECK (
 avatar_url IS NULL OR (char_length(avatar_url) <= 200000 AND
  (avatar_url ~ '^https://' OR avatar_url ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$')));
ALTER TABLE public.message_groups DROP CONSTRAINT IF EXISTS message_groups_avatar_color_check;
ALTER TABLE public.message_groups ADD CONSTRAINT message_groups_avatar_color_check CHECK (avatar_color BETWEEN 0 AND 7);

-- ---------- topics ----------
CREATE TABLE IF NOT EXISTS public.message_group_topics (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 group_id uuid NOT NULL REFERENCES public.message_groups(id) ON DELETE CASCADE,
 title text NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 60),
 icon text NOT NULL DEFAULT '💬' CHECK (char_length(icon) BETWEEN 1 AND 8),
 color smallint NOT NULL DEFAULT 0 CHECK (color BETWEEN 0 AND 7),
 is_general boolean NOT NULL DEFAULT false,
 closed boolean NOT NULL DEFAULT false,
 pinned boolean NOT NULL DEFAULT false,
 created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT message_group_topics_general_open CHECK (NOT (is_general AND closed)),
 CONSTRAINT message_group_topics_group_id_id UNIQUE (group_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS message_group_topics_one_general ON public.message_group_topics(group_id) WHERE is_general;
ALTER TABLE public.message_group_topics ENABLE ROW LEVEL SECURITY;

-- Every group has exactly one General topic, including groups created before this upgrade.
INSERT INTO public.message_group_topics(group_id,title,icon,is_general,created_by)
 SELECT g.id,'General','#',true,g.created_by FROM public.message_groups g
 WHERE NOT EXISTS (SELECT 1 FROM public.message_group_topics t WHERE t.group_id=g.id AND t.is_general);

ALTER TABLE public.message_group_messages ADD COLUMN IF NOT EXISTS topic_id uuid;
UPDATE public.message_group_messages m SET topic_id=t.id FROM public.message_group_topics t
 WHERE m.topic_id IS NULL AND t.group_id=m.group_id AND t.is_general;
ALTER TABLE public.message_group_messages ALTER COLUMN topic_id SET NOT NULL;
ALTER TABLE public.message_group_messages DROP CONSTRAINT IF EXISTS message_group_messages_topic_fk;
-- Composite key: a message's topic always belongs to the message's group.
ALTER TABLE public.message_group_messages ADD CONSTRAINT message_group_messages_topic_fk
 FOREIGN KEY (group_id, topic_id) REFERENCES public.message_group_topics(group_id, id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS message_group_messages_topic_cursor_idx ON public.message_group_messages(topic_id,created_at DESC,id DESC);

-- ---------- private implementations (SECURITY DEFINER, fixed search_path) ----------
CREATE OR REPLACE FUNCTION intent_private.message_group_add_general() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 INSERT INTO public.message_group_topics(group_id,title,icon,is_general,created_by) VALUES(NEW.id,'General','#',true,NEW.created_by)
 ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS message_groups_general_topic ON public.message_groups;
CREATE TRIGGER message_groups_general_topic AFTER INSERT ON public.message_groups
 FOR EACH ROW EXECUTE FUNCTION intent_private.message_group_add_general();

-- Messages without a topic go to General (older clients keep working). RLS still decides.
CREATE OR REPLACE FUNCTION intent_private.message_group_message_topic() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF NEW.topic_id IS NULL THEN
  SELECT t.id INTO NEW.topic_id FROM public.message_group_topics t WHERE t.group_id=NEW.group_id AND t.is_general;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS message_group_messages_topic ON public.message_group_messages;
CREATE TRIGGER message_group_messages_topic BEFORE INSERT ON public.message_group_messages
 FOR EACH ROW EXECUTE FUNCTION intent_private.message_group_message_topic();

CREATE OR REPLACE FUNCTION intent_private.message_group_role(p_group_id uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT role FROM public.message_group_members WHERE group_id=p_group_id AND user_id=(SELECT auth.uid());
$$;

-- Answers only for the caller's own groups, so outsiders cannot probe topic state.
CREATE OR REPLACE FUNCTION intent_private.message_group_topic_open(p_group_id uuid, p_topic_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT intent_private.is_message_group_member(p_group_id) AND EXISTS(
  SELECT 1 FROM public.message_group_topics WHERE id=p_topic_id AND group_id=p_group_id AND NOT closed);
$$;

CREATE OR REPLACE FUNCTION intent_private.message_group_check_avatar(p_avatar_url text, p_avatar_color smallint) RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
BEGIN
 IF p_avatar_color IS NULL OR p_avatar_color NOT BETWEEN 0 AND 7 THEN RAISE EXCEPTION 'Invalid group details'; END IF;
 IF p_avatar_url IS NOT NULL AND (char_length(p_avatar_url)>200000 OR NOT (p_avatar_url ~ '^https://' OR p_avatar_url ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$')) THEN
  RAISE EXCEPTION 'Invalid group avatar'; END IF;
END $$;

CREATE OR REPLACE FUNCTION intent_private.create_message_group_v2(p_title text, p_description text, p_avatar_url text, p_avatar_color smallint, p_topics_enabled boolean, p_member_ids uuid[])
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE new_id uuid; actor uuid := auth.uid(); member uuid;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 IF char_length(trim(coalesce(p_title,''))) NOT BETWEEN 3 AND 80 OR char_length(coalesce(p_description,''))>300 THEN RAISE EXCEPTION 'Invalid group details'; END IF;
 PERFORM intent_private.message_group_check_avatar(nullif(p_avatar_url,''), coalesce(p_avatar_color,0::smallint));
 IF coalesce(array_length(p_member_ids,1),0)>200 THEN RAISE EXCEPTION 'Too many members'; END IF;
 INSERT INTO public.message_groups(title,description,created_by,avatar_url,avatar_color,topics_enabled)
  VALUES(trim(p_title),nullif(trim(coalesce(p_description,'')),''),actor,nullif(p_avatar_url,''),coalesce(p_avatar_color,0::smallint),coalesce(p_topics_enabled,false))
  RETURNING id INTO new_id;
 INSERT INTO public.message_group_members(group_id,user_id,role) VALUES(new_id,actor,'owner');
 FOREACH member IN ARRAY coalesce(p_member_ids,'{}'::uuid[]) LOOP
  CONTINUE WHEN member=actor;
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=member) THEN RAISE EXCEPTION 'User not found'; END IF;
  INSERT INTO public.message_group_members(group_id,user_id,role) VALUES(new_id,member,'member') ON CONFLICT DO NOTHING;
 END LOOP;
 RETURN new_id;
END $$;

CREATE OR REPLACE FUNCTION intent_private.update_message_group(p_group_id uuid, p_title text, p_description text, p_avatar_url text, p_avatar_color smallint, p_topics_enabled boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF NOT intent_private.can_manage_message_group(p_group_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
 IF char_length(trim(coalesce(p_title,''))) NOT BETWEEN 3 AND 80 OR char_length(coalesce(p_description,''))>300 THEN RAISE EXCEPTION 'Invalid group details'; END IF;
 PERFORM intent_private.message_group_check_avatar(nullif(p_avatar_url,''), coalesce(p_avatar_color,0::smallint));
 UPDATE public.message_groups SET title=trim(p_title), description=nullif(trim(coalesce(p_description,'')),''),
  avatar_url=nullif(p_avatar_url,''), avatar_color=coalesce(p_avatar_color,0::smallint), topics_enabled=coalesce(p_topics_enabled,false)
 WHERE id=p_group_id;
END $$;

CREATE OR REPLACE FUNCTION intent_private.create_message_group_topic(p_group_id uuid, p_title text, p_icon text, p_color smallint)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE new_id uuid;
BEGIN
 IF NOT intent_private.can_manage_message_group(p_group_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.message_groups WHERE id=p_group_id AND topics_enabled) THEN RAISE EXCEPTION 'Topics are disabled'; END IF;
 IF (SELECT count(*) FROM public.message_group_topics WHERE group_id=p_group_id)>=100 THEN RAISE EXCEPTION 'Too many topics'; END IF;
 IF char_length(trim(coalesce(p_title,''))) NOT BETWEEN 1 AND 60 OR char_length(coalesce(p_icon,'')) NOT BETWEEN 1 AND 8 OR coalesce(p_color,-1) NOT BETWEEN 0 AND 7 THEN
  RAISE EXCEPTION 'Invalid topic details'; END IF;
 INSERT INTO public.message_group_topics(group_id,title,icon,color,created_by) VALUES(p_group_id,trim(p_title),p_icon,p_color,auth.uid()) RETURNING id INTO new_id;
 RETURN new_id;
END $$;

CREATE OR REPLACE FUNCTION intent_private.update_message_group_topic(p_topic_id uuid, p_title text, p_icon text, p_color smallint, p_closed boolean, p_pinned boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE topic public.message_group_topics;
BEGIN
 SELECT * INTO topic FROM public.message_group_topics WHERE id=p_topic_id;
 IF topic.id IS NULL OR NOT intent_private.can_manage_message_group(topic.group_id) THEN RAISE EXCEPTION 'Not authorized'; END IF;
 IF char_length(trim(coalesce(p_title,''))) NOT BETWEEN 1 AND 60 OR char_length(coalesce(p_icon,'')) NOT BETWEEN 1 AND 8 OR coalesce(p_color,-1) NOT BETWEEN 0 AND 7 THEN
  RAISE EXCEPTION 'Invalid topic details'; END IF;
 IF topic.is_general AND coalesce(p_closed,false) THEN RAISE EXCEPTION 'General topic cannot be closed'; END IF;
 UPDATE public.message_group_topics SET title=trim(p_title), icon=p_icon, color=p_color, closed=coalesce(p_closed,false), pinned=coalesce(p_pinned,false)
 WHERE id=p_topic_id;
END $$;

CREATE OR REPLACE FUNCTION intent_private.set_message_group_member_role(p_group_id uuid, p_user_id uuid, p_role text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF intent_private.message_group_role(p_group_id) IS DISTINCT FROM 'owner' THEN RAISE EXCEPTION 'Not authorized'; END IF;
 IF p_role NOT IN ('admin','member') OR p_user_id=auth.uid() THEN RAISE EXCEPTION 'Invalid role change'; END IF;
 UPDATE public.message_group_members SET role=p_role WHERE group_id=p_group_id AND user_id=p_user_id AND role<>'owner';
 IF NOT FOUND THEN RAISE EXCEPTION 'Member not found'; END IF;
END $$;

CREATE OR REPLACE FUNCTION intent_private.remove_message_group_member(p_group_id uuid, p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE mine text := intent_private.message_group_role(p_group_id); target text;
BEGIN
 SELECT role INTO target FROM public.message_group_members WHERE group_id=p_group_id AND user_id=p_user_id;
 IF mine IS NULL OR mine='member' OR p_user_id=auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
 IF target IS NULL THEN RAISE EXCEPTION 'Member not found'; END IF;
 -- Admins remove members; only the owner removes admins; nobody removes the owner.
 IF target='owner' OR (target='admin' AND mine<>'owner') THEN RAISE EXCEPTION 'Not authorized'; END IF;
 DELETE FROM public.message_group_members WHERE group_id=p_group_id AND user_id=p_user_id;
END $$;

CREATE OR REPLACE FUNCTION intent_private.leave_message_group(p_group_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE mine text := intent_private.message_group_role(p_group_id);
BEGIN
 IF mine IS NULL THEN RAISE EXCEPTION 'Not a member'; END IF;
 IF mine='owner' THEN RAISE EXCEPTION 'Owner cannot leave; delete the group instead'; END IF;
 DELETE FROM public.message_group_members WHERE group_id=p_group_id AND user_id=auth.uid();
END $$;

CREATE OR REPLACE FUNCTION intent_private.delete_message_group(p_group_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF intent_private.message_group_role(p_group_id) IS DISTINCT FROM 'owner' THEN RAISE EXCEPTION 'Not authorized'; END IF;
 DELETE FROM public.message_groups WHERE id=p_group_id;
END $$;

REVOKE ALL ON FUNCTION
 intent_private.message_group_add_general(), intent_private.message_group_message_topic(),
 intent_private.message_group_role(uuid), intent_private.message_group_topic_open(uuid,uuid),
 intent_private.message_group_check_avatar(text,smallint),
 intent_private.create_message_group_v2(text,text,text,smallint,boolean,uuid[]),
 intent_private.update_message_group(uuid,text,text,text,smallint,boolean),
 intent_private.create_message_group_topic(uuid,text,text,smallint),
 intent_private.update_message_group_topic(uuid,text,text,smallint,boolean,boolean),
 intent_private.set_message_group_member_role(uuid,uuid,text),
 intent_private.remove_message_group_member(uuid,uuid),
 intent_private.leave_message_group(uuid), intent_private.delete_message_group(uuid)
 FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
 intent_private.message_group_role(uuid), intent_private.message_group_topic_open(uuid,uuid),
 intent_private.message_group_check_avatar(text,smallint),
 intent_private.create_message_group_v2(text,text,text,smallint,boolean,uuid[]),
 intent_private.update_message_group(uuid,text,text,text,smallint,boolean),
 intent_private.create_message_group_topic(uuid,text,text,smallint),
 intent_private.update_message_group_topic(uuid,text,text,smallint,boolean,boolean),
 intent_private.set_message_group_member_role(uuid,uuid,text),
 intent_private.remove_message_group_member(uuid,uuid),
 intent_private.leave_message_group(uuid), intent_private.delete_message_group(uuid)
 TO authenticated;

-- ---------- public SECURITY INVOKER wrappers (the RPC surface) ----------
CREATE OR REPLACE FUNCTION public.create_message_group_v2(p_title text, p_description text DEFAULT '', p_avatar_url text DEFAULT NULL, p_avatar_color smallint DEFAULT 0, p_topics_enabled boolean DEFAULT false, p_member_ids uuid[] DEFAULT '{}')
RETURNS uuid LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
 SELECT intent_private.create_message_group_v2(p_title,p_description,p_avatar_url,p_avatar_color,p_topics_enabled,p_member_ids); $$;
CREATE OR REPLACE FUNCTION public.update_message_group(p_group_id uuid, p_title text, p_description text DEFAULT '', p_avatar_url text DEFAULT NULL, p_avatar_color smallint DEFAULT 0, p_topics_enabled boolean DEFAULT false)
RETURNS void LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
 SELECT intent_private.update_message_group(p_group_id,p_title,p_description,p_avatar_url,p_avatar_color,p_topics_enabled); $$;
CREATE OR REPLACE FUNCTION public.create_message_group_topic(p_group_id uuid, p_title text, p_icon text DEFAULT '💬', p_color smallint DEFAULT 0)
RETURNS uuid LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
 SELECT intent_private.create_message_group_topic(p_group_id,p_title,p_icon,p_color); $$;
CREATE OR REPLACE FUNCTION public.update_message_group_topic(p_topic_id uuid, p_title text, p_icon text, p_color smallint, p_closed boolean DEFAULT false, p_pinned boolean DEFAULT false)
RETURNS void LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
 SELECT intent_private.update_message_group_topic(p_topic_id,p_title,p_icon,p_color,p_closed,p_pinned); $$;
CREATE OR REPLACE FUNCTION public.set_message_group_member_role(p_group_id uuid, p_user_id uuid, p_role text)
RETURNS void LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
 SELECT intent_private.set_message_group_member_role(p_group_id,p_user_id,p_role); $$;
CREATE OR REPLACE FUNCTION public.remove_message_group_member(p_group_id uuid, p_user_id uuid)
RETURNS void LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
 SELECT intent_private.remove_message_group_member(p_group_id,p_user_id); $$;
CREATE OR REPLACE FUNCTION public.leave_message_group(p_group_id uuid)
RETURNS void LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
 SELECT intent_private.leave_message_group(p_group_id); $$;
CREATE OR REPLACE FUNCTION public.delete_message_group(p_group_id uuid)
RETURNS void LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
 SELECT intent_private.delete_message_group(p_group_id); $$;
REVOKE ALL ON FUNCTION
 public.create_message_group_v2(text,text,text,smallint,boolean,uuid[]),
 public.update_message_group(uuid,text,text,text,smallint,boolean),
 public.create_message_group_topic(uuid,text,text,smallint),
 public.update_message_group_topic(uuid,text,text,smallint,boolean,boolean),
 public.set_message_group_member_role(uuid,uuid,text), public.remove_message_group_member(uuid,uuid),
 public.leave_message_group(uuid), public.delete_message_group(uuid)
 FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
 public.create_message_group_v2(text,text,text,smallint,boolean,uuid[]),
 public.update_message_group(uuid,text,text,text,smallint,boolean),
 public.create_message_group_topic(uuid,text,text,smallint),
 public.update_message_group_topic(uuid,text,text,smallint,boolean,boolean),
 public.set_message_group_member_role(uuid,uuid,text), public.remove_message_group_member(uuid,uuid),
 public.leave_message_group(uuid), public.delete_message_group(uuid)
 TO authenticated;

-- ---------- grants and RLS ----------
REVOKE ALL ON public.message_group_topics FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.message_group_topics TO authenticated;
DROP POLICY IF EXISTS "members read group topics" ON public.message_group_topics;
CREATE POLICY "members read group topics" ON public.message_group_topics FOR SELECT TO authenticated
 USING (public.is_message_group_member(group_id));
-- Same policy name as before (hardening's allow-list), now also requiring an open topic.
DROP POLICY IF EXISTS "members send group messages" ON public.message_group_messages;
CREATE POLICY "members send group messages" ON public.message_group_messages FOR INSERT TO authenticated
 WITH CHECK (sender_id=(SELECT auth.uid()) AND public.is_message_group_member(group_id)
  AND intent_private.message_group_topic_open(group_id, topic_id));
COMMIT;
