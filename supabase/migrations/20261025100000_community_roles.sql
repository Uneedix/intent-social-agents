-- INTENT Communities v0.7: roles, member permissions, request queue, discovery fields.
-- Apply after 20261024120000. Additive: no table, row or existing column is deleted.
-- Safe to repeat. Elevated logic lives in intent_private (never an exposed schema);
-- public RPCs are SECURITY INVOKER wrappers, matching the 20261024120000 pattern.
-- NOTE: re-running 20261024000000_access_hardening.sql after this migration would
-- abort on its policy whitelist (channels_delete, messages_delete). Do not replay it.
BEGIN;

-- 1. Roles: owner > admin > moderator > member. 'editor' stays valid as a legacy
--    alias of moderator so existing rows and the intent_staff contract keep working.
DO $$ DECLARE c text; BEGIN
 FOR c IN SELECT conname FROM pg_constraint
  WHERE conrelid='public.community_members'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%role%'
 LOOP EXECUTE format('ALTER TABLE public.community_members DROP CONSTRAINT %I',c); END LOOP;
END $$;
ALTER TABLE public.community_members ADD CONSTRAINT community_members_role_check
 CHECK (role IN ('owner','admin','moderator','editor','member'));

-- 2. Discovery fields and per-action permission thresholds on communities.
ALTER TABLE public.communities ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'other';
ALTER TABLE public.communities ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.communities ADD COLUMN IF NOT EXISTS manage_channels_role text NOT NULL DEFAULT 'admin';
ALTER TABLE public.communities ADD COLUMN IF NOT EXISTS approve_requests_role text NOT NULL DEFAULT 'admin';
ALTER TABLE public.communities ADD COLUMN IF NOT EXISTS remove_members_role text NOT NULL DEFAULT 'admin';

CREATE OR REPLACE FUNCTION intent_private.community_tags_valid(tags text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
 SELECT tags IS NOT NULL AND cardinality(tags) <= 5 AND NOT EXISTS
  (SELECT 1 FROM unnest(tags) AS t(tag) WHERE tag IS NULL OR char_length(btrim(tag)) NOT BETWEEN 1 AND 24);
$$;
CREATE OR REPLACE FUNCTION intent_private.role_rank(r text) RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
 SELECT CASE r WHEN 'owner' THEN 4 WHEN 'admin' THEN 3 WHEN 'moderator' THEN 2 WHEN 'editor' THEN 2 WHEN 'member' THEN 1 ELSE 0 END;
$$;

ALTER TABLE public.communities DROP CONSTRAINT IF EXISTS communities_category_check;
ALTER TABLE public.communities ADD CONSTRAINT communities_category_check CHECK (category IN
 ('business','technology','lifestyle','self-improvement','travel','creative','finance','health','music','photography','city','other'));
ALTER TABLE public.communities DROP CONSTRAINT IF EXISTS communities_tags_check;
ALTER TABLE public.communities ADD CONSTRAINT communities_tags_check CHECK (intent_private.community_tags_valid(tags));
ALTER TABLE public.communities DROP CONSTRAINT IF EXISTS communities_permission_roles_check;
ALTER TABLE public.communities ADD CONSTRAINT communities_permission_roles_check CHECK (
 manage_channels_role IN ('admin','moderator') AND approve_requests_role IN ('admin','moderator') AND remove_members_role IN ('admin','moderator'));
-- No file storage is configured: images are https URLs or small inline data URLs.
-- NOT VALID: existing rows are not rechecked, new writes are.
ALTER TABLE public.communities DROP CONSTRAINT IF EXISTS communities_images_check;
ALTER TABLE public.communities ADD CONSTRAINT communities_images_check CHECK (
 (cover_url IS NULL OR (char_length(cover_url) <= 400000 AND (cover_url ~ '^https://' OR cover_url ~ '^data:image/(png|jpeg|webp|gif);base64,'))) AND
 (avatar_url IS NULL OR (char_length(avatar_url) <= 120000 AND (avatar_url ~ '^https://' OR avatar_url ~ '^data:image/(png|jpeg|webp|gif);base64,')))) NOT VALID;

-- 3. Caller-only role helpers (they never answer about another user).
CREATE OR REPLACE FUNCTION intent_private.my_rank(cid uuid) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT coalesce((SELECT intent_private.role_rank(role) FROM public.community_members
  WHERE community_id=cid AND user_id=auth.uid()),0);
$$;
CREATE OR REPLACE FUNCTION intent_private.can_act(cid uuid, action text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT auth.uid() IS NOT NULL AND action IN ('manage_channels','approve_requests','remove_members')
  AND EXISTS (SELECT 1 FROM public.communities c WHERE c.id=cid AND
  intent_private.my_rank(cid) >= intent_private.role_rank(CASE action
   WHEN 'manage_channels' THEN c.manage_channels_role
   WHEN 'approve_requests' THEN c.approve_requests_role
   WHEN 'remove_members' THEN c.remove_members_role END));
$$;
-- Moderators are staff (posting when "staff only"). Same signature/contract as before.
CREATE OR REPLACE FUNCTION intent_private.intent_staff(cid uuid, uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT uid = auth.uid() AND EXISTS (SELECT 1 FROM public.community_members WHERE community_id=cid AND user_id=auth.uid() AND role IN ('owner','admin','moderator','editor'));
$$;
-- Approval now honours approve_requests_role (default 'admin' = previous behaviour).
CREATE OR REPLACE FUNCTION intent_private.intent_approve_request(cid uuid, applicant uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT intent_private.can_act(cid,'approve_requests') THEN RAISE EXCEPTION 'Not authorized'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.community_join_requests WHERE community_id=cid AND user_id=applicant AND status='pending') THEN RAISE EXCEPTION 'No pending request'; END IF;
 INSERT INTO public.community_members(community_id,user_id,role) VALUES(cid,applicant,'member') ON CONFLICT DO NOTHING;
 UPDATE public.community_join_requests SET status='approved' WHERE community_id=cid AND user_id=applicant;
END; $$;

CREATE OR REPLACE FUNCTION intent_private.intent_decline_request(cid uuid, applicant uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT intent_private.can_act(cid,'approve_requests') THEN RAISE EXCEPTION 'Not authorized'; END IF;
 UPDATE public.community_join_requests SET status='rejected' WHERE community_id=cid AND user_id=applicant AND status='pending';
 IF NOT FOUND THEN RAISE EXCEPTION 'No pending request'; END IF;
END; $$;

-- Owner assigns admin/moderator/member; admin assigns moderator/member to lower ranks.
-- Nobody changes their own role, the owner's role, or grants 'owner'.
CREATE OR REPLACE FUNCTION intent_private.intent_set_member_role(cid uuid, target uuid, new_role text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE mine integer := intent_private.my_rank(cid); theirs integer;
BEGIN
 IF auth.uid() IS NULL OR mine < 3 THEN RAISE EXCEPTION 'Not authorized'; END IF;
 IF new_role NOT IN ('admin','moderator','member') THEN RAISE EXCEPTION 'Invalid role'; END IF;
 IF target = auth.uid() THEN RAISE EXCEPTION 'Cannot change your own role'; END IF;
 SELECT intent_private.role_rank(role) INTO theirs FROM public.community_members WHERE community_id=cid AND user_id=target FOR UPDATE;
 IF theirs IS NULL THEN RAISE EXCEPTION 'Not a member'; END IF;
 IF theirs >= mine OR intent_private.role_rank(new_role) >= mine THEN RAISE EXCEPTION 'Not authorized'; END IF;
 UPDATE public.community_members SET role=new_role WHERE community_id=cid AND user_id=target;
END; $$;

CREATE OR REPLACE FUNCTION intent_private.intent_remove_member(cid uuid, target uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE theirs integer;
BEGIN
 IF auth.uid() IS NULL OR NOT intent_private.can_act(cid,'remove_members') THEN RAISE EXCEPTION 'Not authorized'; END IF;
 IF target = auth.uid() THEN RAISE EXCEPTION 'Use leave instead'; END IF;
 SELECT intent_private.role_rank(role) INTO theirs FROM public.community_members WHERE community_id=cid AND user_id=target FOR UPDATE;
 IF theirs IS NULL THEN RAISE EXCEPTION 'Not a member'; END IF;
 IF theirs >= intent_private.my_rank(cid) THEN RAISE EXCEPTION 'Not authorized'; END IF;
 DELETE FROM public.community_members WHERE community_id=cid AND user_id=target;
END; $$;

CREATE OR REPLACE FUNCTION public.intent_decline_request(cid uuid, applicant uuid) RETURNS void
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = '' AS $$ SELECT intent_private.intent_decline_request(cid,applicant); $$;
CREATE OR REPLACE FUNCTION public.intent_set_member_role(cid uuid, target uuid, new_role text) RETURNS void
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = '' AS $$ SELECT intent_private.intent_set_member_role(cid,target,new_role); $$;
CREATE OR REPLACE FUNCTION public.intent_remove_member(cid uuid, target uuid) RETURNS void
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = '' AS $$ SELECT intent_private.intent_remove_member(cid,target); $$;

REVOKE ALL ON FUNCTION intent_private.community_tags_valid(text[]), intent_private.role_rank(text),
 intent_private.my_rank(uuid), intent_private.can_act(uuid,text),
 intent_private.intent_decline_request(uuid,uuid), intent_private.intent_set_member_role(uuid,uuid,text),
 intent_private.intent_remove_member(uuid,uuid),
 public.intent_decline_request(uuid,uuid), public.intent_set_member_role(uuid,uuid,text),
 public.intent_remove_member(uuid,uuid) FROM PUBLIC, anon, authenticated;
-- CHECK constraints evaluate as the writing role; these two are pure, INVOKER functions.
GRANT EXECUTE ON FUNCTION intent_private.community_tags_valid(text[]), intent_private.role_rank(text) TO authenticated;
GRANT EXECUTE ON FUNCTION intent_private.my_rank(uuid), intent_private.can_act(uuid,text),
 intent_private.intent_decline_request(uuid,uuid), intent_private.intent_set_member_role(uuid,uuid,text),
 intent_private.intent_remove_member(uuid,uuid),
 public.intent_decline_request(uuid,uuid), public.intent_set_member_role(uuid,uuid,text),
 public.intent_remove_member(uuid,uuid) TO authenticated;

-- 4. Policies enforcing the thresholds server-side.
DROP POLICY IF EXISTS requests_read ON public.community_join_requests;
CREATE POLICY requests_read ON public.community_join_requests FOR SELECT TO authenticated
 USING (user_id=(SELECT auth.uid()) OR intent_private.can_act(community_id,'approve_requests'));
DROP POLICY IF EXISTS channels_create ON public.community_channels;
CREATE POLICY channels_create ON public.community_channels FOR INSERT TO authenticated
 WITH CHECK (intent_private.can_act(community_id,'manage_channels'));
DROP POLICY IF EXISTS channels_delete ON public.community_channels;
CREATE POLICY channels_delete ON public.community_channels FOR DELETE TO authenticated
 USING (intent_private.can_act(community_id,'manage_channels'));
DROP POLICY IF EXISTS posts_delete ON public.community_posts;
CREATE POLICY posts_delete ON public.community_posts FOR DELETE TO authenticated
 USING (author_id=(SELECT auth.uid()) OR intent_private.my_rank(community_id) >= 2);
DROP POLICY IF EXISTS messages_delete ON public.community_messages;
CREATE POLICY messages_delete ON public.community_messages FOR DELETE TO authenticated
 USING (author_id=(SELECT auth.uid()) OR EXISTS (SELECT 1 FROM public.community_channels ch
  WHERE ch.id=channel_id AND intent_private.my_rank(ch.community_id) >= 2));

-- 5. Privileges. Owner-only settings UPDATE stays enforced by community_update.
GRANT UPDATE (category,tags,manage_channels_role,approve_requests_role,remove_members_role) ON public.communities TO authenticated;
GRANT DELETE ON public.community_channels, public.community_messages TO authenticated;
CREATE INDEX IF NOT EXISTS communities_category_idx ON public.communities(category);
COMMIT;
