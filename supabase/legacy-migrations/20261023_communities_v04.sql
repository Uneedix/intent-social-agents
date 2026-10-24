-- INTENT Communities v0.4. Apply once to the existing public.communities table.
-- Review on a development project first. Does not delete existing data.
ALTER TABLE public.communities ADD COLUMN IF NOT EXISTS comments_permission text NOT NULL DEFAULT 'members';
ALTER TABLE public.communities ADD CONSTRAINT communities_comments_permission_check CHECK (comments_permission IN ('members','staff','disabled'));

CREATE TABLE IF NOT EXISTS public.community_members (
 community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','editor','member')),
 joined_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (community_id,user_id)
);
CREATE TABLE IF NOT EXISTS public.community_join_requests (
 community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (community_id,user_id)
);
CREATE TABLE IF NOT EXISTS public.community_posts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
 author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 10000),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.community_channels (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
 name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
 category text NOT NULL DEFAULT 'General',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.community_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 channel_id uuid NOT NULL REFERENCES public.community_channels(id) ON DELETE CASCADE,
 author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
 created_at timestamptz NOT NULL DEFAULT now()
);

-- Owner role is established by a trigger; never trust client-supplied role.
CREATE OR REPLACE FUNCTION public.intent_community_owner_member() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 INSERT INTO public.community_members(community_id,user_id,role) VALUES (NEW.id,NEW.owner_id,'owner') ON CONFLICT DO NOTHING;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS intent_community_owner_member_trigger ON public.communities;
CREATE TRIGGER intent_community_owner_member_trigger AFTER INSERT ON public.communities
FOR EACH ROW EXECUTE FUNCTION public.intent_community_owner_member();
INSERT INTO public.community_members(community_id,user_id,role)
 SELECT id,owner_id,'owner' FROM public.communities ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.intent_member(cid uuid, uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS (SELECT 1 FROM public.community_members WHERE community_id=cid AND user_id=uid);
$$;
CREATE OR REPLACE FUNCTION public.intent_staff(cid uuid, uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS (SELECT 1 FROM public.community_members WHERE community_id=cid AND user_id=uid AND role IN ('owner','admin','editor'));
$$;
CREATE OR REPLACE FUNCTION public.intent_manager(cid uuid, uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS (SELECT 1 FROM public.community_members WHERE community_id=cid AND user_id=uid AND role IN ('owner','admin'));
$$;
CREATE OR REPLACE FUNCTION public.intent_can_view(cid uuid, uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS (SELECT 1 FROM public.communities c WHERE c.id=cid AND (c.privacy <> 'private' OR c.owner_id=uid OR public.intent_member(cid,uid)));
$$;
REVOKE ALL ON FUNCTION public.intent_member(uuid,uuid), public.intent_staff(uuid,uuid), public.intent_manager(uuid,uuid), public.intent_can_view(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.intent_member(uuid,uuid), public.intent_staff(uuid,uuid), public.intent_manager(uuid,uuid), public.intent_can_view(uuid,uuid) TO authenticated, anon;

ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_join_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners can view communities" ON public.communities;
CREATE POLICY community_read ON public.communities FOR SELECT USING (public.intent_can_view(id,(SELECT auth.uid())));
CREATE POLICY community_create ON public.communities FOR INSERT TO authenticated WITH CHECK (owner_id=(SELECT auth.uid()));
CREATE POLICY community_update ON public.communities FOR UPDATE TO authenticated USING (owner_id=(SELECT auth.uid())) WITH CHECK (owner_id=(SELECT auth.uid()));

CREATE POLICY members_read ON public.community_members FOR SELECT USING (public.intent_can_view(community_id,(SELECT auth.uid())));
-- Users may join open communities only; roles are restricted to 'member'.
CREATE POLICY members_join_open ON public.community_members FOR INSERT TO authenticated
 WITH CHECK (user_id=(SELECT auth.uid()) AND role='member' AND EXISTS
 (SELECT 1 FROM public.communities c WHERE c.id=community_id AND c.privacy='public'));
CREATE POLICY members_leave ON public.community_members FOR DELETE TO authenticated
 USING (user_id=(SELECT auth.uid()) AND role<>'owner');

CREATE POLICY requests_read ON public.community_join_requests FOR SELECT TO authenticated
 USING (user_id=(SELECT auth.uid()) OR public.intent_manager(community_id,(SELECT auth.uid())));
CREATE POLICY requests_create ON public.community_join_requests FOR INSERT TO authenticated
 WITH CHECK (user_id=(SELECT auth.uid()) AND status='pending' AND EXISTS
 (SELECT 1 FROM public.communities c WHERE c.id=community_id AND c.privacy='request'));
CREATE POLICY requests_cancel ON public.community_join_requests FOR DELETE TO authenticated
 USING (user_id=(SELECT auth.uid()));

CREATE POLICY posts_read ON public.community_posts FOR SELECT USING (public.intent_can_view(community_id,(SELECT auth.uid())));
CREATE POLICY posts_create ON public.community_posts FOR INSERT TO authenticated
 WITH CHECK (author_id=(SELECT auth.uid()) AND public.intent_member(community_id,(SELECT auth.uid())) AND
 EXISTS (SELECT 1 FROM public.communities c WHERE c.id=community_id AND
 (c.posting_permission='members' OR public.intent_staff(community_id,(SELECT auth.uid())))));
CREATE POLICY posts_delete ON public.community_posts FOR DELETE TO authenticated
 USING (author_id=(SELECT auth.uid()) OR public.intent_manager(community_id,(SELECT auth.uid())));

CREATE POLICY channels_read ON public.community_channels FOR SELECT
 USING (EXISTS (SELECT 1 FROM public.communities c WHERE c.id=community_id AND c.channels_enabled AND public.intent_can_view(c.id,(SELECT auth.uid()))));
CREATE POLICY channels_create ON public.community_channels FOR INSERT TO authenticated
 WITH CHECK (public.intent_manager(community_id,(SELECT auth.uid())));
CREATE POLICY messages_read ON public.community_messages FOR SELECT
 USING (EXISTS (SELECT 1 FROM public.community_channels ch WHERE ch.id=channel_id AND
 public.intent_member(ch.community_id,(SELECT auth.uid())) AND EXISTS
 (SELECT 1 FROM public.communities c WHERE c.id=ch.community_id AND c.channels_enabled)));
CREATE POLICY messages_create ON public.community_messages FOR INSERT TO authenticated
 WITH CHECK (author_id=(SELECT auth.uid()) AND EXISTS (SELECT 1 FROM public.community_channels ch
 JOIN public.communities c ON c.id=ch.community_id WHERE ch.id=channel_id AND c.channels_enabled AND
 public.intent_member(ch.community_id,(SELECT auth.uid()))));

-- Approval is atomic and server-controlled; caller must be owner/admin.
CREATE OR REPLACE FUNCTION public.intent_approve_request(cid uuid, applicant uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.intent_manager(cid,auth.uid()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.community_join_requests WHERE community_id=cid AND user_id=applicant AND status='pending') THEN RAISE EXCEPTION 'No pending request'; END IF;
 INSERT INTO public.community_members(community_id,user_id,role) VALUES(cid,applicant,'member') ON CONFLICT DO NOTHING;
 UPDATE public.community_join_requests SET status='approved' WHERE community_id=cid AND user_id=applicant;
END; $$;
REVOKE ALL ON FUNCTION public.intent_approve_request(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.intent_approve_request(uuid,uuid) TO authenticated;

-- Restrict grants; RLS is not a substitute for column privileges.
GRANT SELECT, INSERT, UPDATE ON public.communities TO authenticated;
GRANT SELECT ON public.communities TO anon;
GRANT SELECT, INSERT, DELETE ON public.community_members TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.community_join_requests TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.community_posts TO authenticated;
GRANT SELECT ON public.community_posts TO anon;
GRANT SELECT, INSERT ON public.community_channels TO authenticated;
GRANT SELECT ON public.community_channels TO anon;
GRANT SELECT, INSERT ON public.community_messages TO authenticated;
