-- Apply after both 20261023 migrations. No remote execution is performed by the app.
BEGIN;
-- Permissive policies combine with OR. Do not silently trust legacy policies:
-- abort without changes if an installation has policies outside this contract.
DO $$
DECLARE unexpected text;
BEGIN
 SELECT string_agg(tablename || '.' || policyname, ', ') INTO unexpected
 FROM pg_policies WHERE schemaname='public' AND (
  (tablename='communities' AND policyname NOT IN ('community_read','community_create','community_update')) OR
  (tablename='community_members' AND policyname NOT IN ('members_read','members_join_open','members_leave')) OR
  (tablename='community_join_requests' AND policyname NOT IN ('requests_read','requests_create','requests_cancel','requests_retry')) OR
  (tablename='community_posts' AND policyname NOT IN ('posts_read','posts_create','posts_delete')) OR
  (tablename='community_channels' AND policyname NOT IN ('channels_read','channels_create')) OR
  (tablename='community_messages' AND policyname NOT IN ('messages_read','messages_create')) OR
  (tablename='message_groups' AND policyname <> 'members read groups') OR
  (tablename='message_group_members' AND policyname <> 'members read group roster') OR
  (tablename='message_group_messages' AND policyname NOT IN ('members read group messages','members send group messages'))
 );
 IF unexpected IS NOT NULL THEN RAISE EXCEPTION 'Review unexpected policies before hardening: %', unexpected; END IF;
END $$;
-- SECURITY DEFINER helpers must only answer for the current caller. Keep their
-- signatures for existing policies/RPCs, but reject queries about another user.
CREATE OR REPLACE FUNCTION public.intent_member(cid uuid, uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT uid = auth.uid() AND EXISTS (SELECT 1 FROM public.community_members WHERE community_id=cid AND user_id=auth.uid());
$$;
CREATE OR REPLACE FUNCTION public.intent_staff(cid uuid, uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT uid = auth.uid() AND EXISTS (SELECT 1 FROM public.community_members WHERE community_id=cid AND user_id=auth.uid() AND role IN ('owner','admin','editor'));
$$;
CREATE OR REPLACE FUNCTION public.intent_manager(cid uuid, uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT uid = auth.uid() AND EXISTS (SELECT 1 FROM public.community_members WHERE community_id=cid AND user_id=auth.uid() AND role IN ('owner','admin'));
$$;
CREATE OR REPLACE FUNCTION public.intent_can_view(cid uuid, uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT uid IS NOT DISTINCT FROM auth.uid() AND EXISTS (
  SELECT 1 FROM public.communities c WHERE c.id=cid AND
   (c.privacy <> 'private' OR c.owner_id=auth.uid() OR public.intent_member(cid,auth.uid()))
 );
$$;
REVOKE ALL ON FUNCTION public.intent_member(uuid,uuid), public.intent_staff(uuid,uuid), public.intent_manager(uuid,uuid), public.intent_can_view(uuid,uuid) FROM PUBLIC, anon, authenticated;
-- Public feed policies need can_view; its membership lookup runs internally.
GRANT EXECUTE ON FUNCTION public.intent_can_view(uuid,uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.intent_member(uuid,uuid), public.intent_staff(uuid,uuid), public.intent_manager(uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.intent_community_owner_member() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.intent_approve_request(uuid,uuid), public.is_message_group_member(uuid),
 public.can_manage_message_group(uuid), public.create_message_group(text,text),
 public.add_message_group_member(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.intent_approve_request(uuid,uuid), public.is_message_group_member(uuid),
 public.can_manage_message_group(uuid), public.create_message_group(text,text),
 public.add_message_group_member(uuid,uuid) TO authenticated;

-- Explicit privileges, independent of Supabase's default table grants.
REVOKE ALL ON public.communities, public.community_members, public.community_join_requests,
 public.community_posts, public.community_channels, public.community_messages,
 public.message_groups, public.message_group_members, public.message_group_messages
 FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.communities, public.community_posts, public.community_channels TO anon;
GRANT SELECT, INSERT ON public.communities TO authenticated;
GRANT UPDATE (name,description,privacy,channels_enabled,posting_permission,comments_permission,cover_url,avatar_url) ON public.communities TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.community_members, public.community_posts TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.community_join_requests TO authenticated;
-- The client uses upsert with these three fields. RLS prevents spoofing or approval.
GRANT UPDATE (community_id,user_id,status) ON public.community_join_requests TO authenticated;
GRANT SELECT, INSERT ON public.community_channels, public.community_messages TO authenticated;
GRANT SELECT ON public.message_groups, public.message_group_members TO authenticated;
GRANT SELECT, INSERT ON public.message_group_messages TO authenticated;

DROP POLICY IF EXISTS requests_retry ON public.community_join_requests;
CREATE POLICY requests_retry ON public.community_join_requests FOR UPDATE TO authenticated
 USING (user_id=(SELECT auth.uid()) AND status IN ('pending','rejected'))
 WITH CHECK (user_id=(SELECT auth.uid()) AND status='pending' AND EXISTS
  (SELECT 1 FROM public.communities c WHERE c.id=community_id AND c.privacy='request'));

CREATE INDEX IF NOT EXISTS communities_owner_idx ON public.communities(owner_id);
CREATE INDEX IF NOT EXISTS communities_created_idx ON public.communities(created_at DESC,id);
CREATE INDEX IF NOT EXISTS community_members_user_idx ON public.community_members(user_id);
CREATE INDEX IF NOT EXISTS community_requests_user_idx ON public.community_join_requests(user_id);
CREATE INDEX IF NOT EXISTS community_requests_pending_idx ON public.community_join_requests(community_id,status);
CREATE INDEX IF NOT EXISTS community_posts_cursor_idx ON public.community_posts(community_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS community_posts_author_idx ON public.community_posts(author_id);
CREATE INDEX IF NOT EXISTS community_channels_community_idx ON public.community_channels(community_id);
CREATE INDEX IF NOT EXISTS community_messages_cursor_idx ON public.community_messages(channel_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS community_messages_author_idx ON public.community_messages(author_id);
CREATE INDEX IF NOT EXISTS message_groups_creator_idx ON public.message_groups(created_by);
CREATE INDEX IF NOT EXISTS message_group_messages_sender_idx ON public.message_group_messages(sender_id);
CREATE INDEX IF NOT EXISTS message_group_messages_cursor_idx ON public.message_group_messages(group_id,created_at DESC,id DESC);
COMMIT;
