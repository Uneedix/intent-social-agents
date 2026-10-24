-- Baseline for fresh installations. Existing tables/data are never replaced.
BEGIN;
CREATE TABLE IF NOT EXISTS public.communities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 3 AND 100),
 description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 10000),
 privacy text NOT NULL DEFAULT 'public' CHECK (privacy IN ('public','request','private')),
 channels_enabled boolean NOT NULL DEFAULT false,
 posting_permission text NOT NULL DEFAULT 'members' CHECK (posting_permission IN ('members','staff')),
 cover_url text,
 avatar_url text,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;
-- Fail closed until the subsequent migrations install the reviewed policies.
REVOKE ALL ON public.communities FROM PUBLIC, anon, authenticated;
COMMIT;
