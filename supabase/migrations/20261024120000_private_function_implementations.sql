-- Preserve public RPC/RLS contracts while moving elevation outside the API schema.
-- intent_private must never be added to PostgREST/Supabase exposed schemas.
-- Apply after 20261024000000; this migration does not change table data.
BEGIN;
CREATE SCHEMA IF NOT EXISTS intent_private;
REVOKE ALL ON SCHEMA intent_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA intent_private TO anon, authenticated;
-- Wrappers need USAGE/EXECUTE, never CREATE. HTTP RPC exposure is controlled by
-- exposed schemas (public only), not by obscurity or database schema USAGE.
ALTER DEFAULT PRIVILEGES IN SCHEMA intent_private REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE OR REPLACE FUNCTION intent_private.intent_member(cid uuid, uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT uid = auth.uid() AND EXISTS (SELECT 1 FROM public.community_members WHERE community_id=cid AND user_id=auth.uid());
$$;

CREATE OR REPLACE FUNCTION intent_private.intent_staff(cid uuid, uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT uid = auth.uid() AND EXISTS (SELECT 1 FROM public.community_members WHERE community_id=cid AND user_id=auth.uid() AND role IN ('owner','admin','editor'));
$$;

CREATE OR REPLACE FUNCTION intent_private.intent_manager(cid uuid, uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT uid = auth.uid() AND EXISTS (SELECT 1 FROM public.community_members WHERE community_id=cid AND user_id=auth.uid() AND role IN ('owner','admin'));
$$;

CREATE OR REPLACE FUNCTION intent_private.intent_can_view(cid uuid, uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT uid IS NOT DISTINCT FROM auth.uid() AND EXISTS (
  SELECT 1 FROM public.communities c WHERE c.id=cid AND
   (c.privacy <> 'private' OR c.owner_id=auth.uid() OR intent_private.intent_member(cid,auth.uid()))
 );
$$;

CREATE OR REPLACE FUNCTION intent_private.intent_approve_request(cid uuid, applicant uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT intent_private.intent_manager(cid,auth.uid()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.community_join_requests WHERE community_id=cid AND user_id=applicant AND status='pending') THEN RAISE EXCEPTION 'No pending request'; END IF;
 INSERT INTO public.community_members(community_id,user_id,role) VALUES(cid,applicant,'member') ON CONFLICT DO NOTHING;
 UPDATE public.community_join_requests SET status='approved' WHERE community_id=cid AND user_id=applicant;
END; $$;

create or replace function intent_private.is_message_group_member(p_group_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.message_group_members where group_id=p_group_id and user_id=(select auth.uid()));
$$;

create or replace function intent_private.can_manage_message_group(p_group_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.message_group_members where group_id=p_group_id and user_id=(select auth.uid()) and role in ('owner','admin'));
$$;

create or replace function intent_private.create_message_group(p_title text,p_description text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare new_id uuid; actor uuid := auth.uid();
begin
 if actor is null then raise exception 'Authentication required'; end if;
 if char_length(trim(p_title)) not between 3 and 80 or char_length(coalesce(p_description,''))>300 then raise exception 'Invalid group details'; end if;
 insert into public.message_groups(title,description,created_by) values(trim(p_title),p_description,actor) returning id into new_id;
 insert into public.message_group_members(group_id,user_id,role) values(new_id,actor,'owner');
 return new_id;
end;$$;

create or replace function intent_private.add_message_group_member(p_group_id uuid,p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if not intent_private.can_manage_message_group(p_group_id) then raise exception 'Not authorized'; end if;
 if not exists(select 1 from auth.users where id=p_user_id) then raise exception 'User not found'; end if;
 insert into public.message_group_members(group_id,user_id,role) values(p_group_id,p_user_id,'member') on conflict do nothing;
end;$$;

REVOKE ALL ON FUNCTION
 intent_private.intent_member(uuid,uuid), intent_private.intent_staff(uuid,uuid),
 intent_private.intent_manager(uuid,uuid), intent_private.intent_can_view(uuid,uuid),
 intent_private.is_message_group_member(uuid), intent_private.can_manage_message_group(uuid),
 intent_private.intent_approve_request(uuid,uuid), intent_private.create_message_group(text,text),
 intent_private.add_message_group_member(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION intent_private.intent_can_view(uuid,uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION
 intent_private.intent_member(uuid,uuid), intent_private.intent_staff(uuid,uuid),
 intent_private.intent_manager(uuid,uuid), intent_private.is_message_group_member(uuid),
 intent_private.can_manage_message_group(uuid), intent_private.intent_approve_request(uuid,uuid),
 intent_private.create_message_group(text,text), intent_private.add_message_group_member(uuid,uuid)
 TO authenticated;

-- Hosted Supabase may have explicit service/custom-role EXECUTE grants in
-- addition to the anon/authenticated contract. Preserve those callers too,
-- without granting PUBLIC or broadening permissions on unrelated functions.
DO $$
DECLARE caller record;
BEGIN
 FOR caller IN
  SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, r.rolname
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
  JOIN pg_roles r ON r.oid=a.grantee
  WHERE n.nspname='public' AND p.proname IN
   ('intent_member','intent_staff','intent_manager','intent_can_view',
    'is_message_group_member','can_manage_message_group','intent_approve_request',
    'create_message_group','add_message_group_member')
   AND a.privilege_type='EXECUTE' AND a.grantee<>p.proowner
   AND r.rolname NOT IN ('anon','authenticated')
 LOOP
  EXECUTE format('GRANT USAGE ON SCHEMA intent_private TO %I',caller.rolname);
  EXECUTE format('GRANT EXECUTE ON FUNCTION intent_private.%I(%s) TO %I',caller.proname,caller.args,caller.rolname);
 END LOOP;
END $$;

-- CREATE OR REPLACE preserves original OIDs, signatures/defaults, owner and ACL.
-- Existing policies continue to reference their original public function OIDs.
-- Do not DROP/recreate functions or widen the wrappers' existing grants.
CREATE OR REPLACE FUNCTION public.intent_member(cid uuid, uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$ SELECT intent_private.intent_member(cid,uid); $$;
CREATE OR REPLACE FUNCTION public.intent_staff(cid uuid, uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$ SELECT intent_private.intent_staff(cid,uid); $$;
CREATE OR REPLACE FUNCTION public.intent_manager(cid uuid, uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$ SELECT intent_private.intent_manager(cid,uid); $$;
CREATE OR REPLACE FUNCTION public.intent_can_view(cid uuid, uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$ SELECT intent_private.intent_can_view(cid,uid); $$;
CREATE OR REPLACE FUNCTION public.is_message_group_member(p_group_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$ SELECT intent_private.is_message_group_member(p_group_id); $$;
CREATE OR REPLACE FUNCTION public.can_manage_message_group(p_group_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$ SELECT intent_private.can_manage_message_group(p_group_id); $$;
CREATE OR REPLACE FUNCTION public.intent_approve_request(cid uuid, applicant uuid) RETURNS void
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = '' AS $$ SELECT intent_private.intent_approve_request(cid,applicant); $$;
CREATE OR REPLACE FUNCTION public.create_message_group(p_title text, p_description text DEFAULT '') RETURNS uuid
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = '' AS $$ SELECT intent_private.create_message_group(p_title,p_description); $$;
CREATE OR REPLACE FUNCTION public.add_message_group_member(p_group_id uuid, p_user_id uuid) RETURNS void
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = '' AS $$ SELECT intent_private.add_message_group_member(p_group_id,p_user_id); $$;

-- A STABLE helper that re-reads communities cannot see a row being inserted in
-- INSERT ... RETURNING. Authorize the current row directly, before the owner
-- membership AFTER trigger has necessarily run. Keep anonymous policies separate:
-- anon must not gain EXECUTE on the member helper just to browse public content.
DROP POLICY IF EXISTS community_read ON public.communities;
DROP POLICY IF EXISTS community_read_anon ON public.communities;
DROP POLICY IF EXISTS community_read_authenticated ON public.communities;
CREATE POLICY community_read_anon ON public.communities FOR SELECT TO anon
 USING (privacy <> 'private');
CREATE POLICY community_read_authenticated ON public.communities FOR SELECT TO authenticated
 USING (privacy <> 'private' OR owner_id=(SELECT auth.uid()) OR public.intent_member(id,(SELECT auth.uid())));
COMMIT;
