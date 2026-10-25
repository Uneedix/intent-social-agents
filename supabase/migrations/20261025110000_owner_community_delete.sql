-- Owner-only community deletion. No table DELETE grant is exposed to clients.
-- Apply after community_roles. Cascades use the existing child foreign keys.
BEGIN;
CREATE OR REPLACE FUNCTION intent_private.delete_community(cid uuid) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE deleted_id uuid; actor uuid := auth.uid();
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF cid IS NULL THEN RAISE EXCEPTION 'Invalid community id' USING ERRCODE='22023'; END IF;
 DELETE FROM public.communities WHERE id=cid AND owner_id=actor RETURNING id INTO deleted_id;
 IF deleted_id IS NULL THEN
  RAISE EXCEPTION 'Not authorized or community not found' USING ERRCODE='42501';
 END IF;
 RETURN deleted_id;
END $$;
CREATE OR REPLACE FUNCTION public.delete_community(cid uuid) RETURNS uuid
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = '' AS $$
 SELECT intent_private.delete_community(cid);
$$;
REVOKE ALL ON FUNCTION intent_private.delete_community(uuid), public.delete_community(uuid) FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA intent_private TO authenticated;
GRANT EXECUTE ON FUNCTION intent_private.delete_community(uuid), public.delete_community(uuid) TO authenticated;
REVOKE DELETE ON public.communities FROM PUBLIC, anon, authenticated;
COMMIT;
