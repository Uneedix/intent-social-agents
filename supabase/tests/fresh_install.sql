\set ON_ERROR_STOP on
-- Run only against a disposable, local Supabase database with auth initialized.
-- Migrations intentionally persist here; access_control.sql rolls its fixtures back.
DO $$ BEGIN
 IF inet_server_addr() IS NOT NULL AND inet_server_addr() NOT IN (inet '127.0.0.1',inet '::1') THEN
  RAISE EXCEPTION 'Fresh-install test is restricted to a local database';
 END IF;
 IF EXISTS (SELECT FROM pg_tables WHERE schemaname='public' AND tablename IN
  ('communities','community_members','community_join_requests','community_posts',
   'community_channels','community_messages','message_groups','message_group_members','message_group_messages')) THEN
  RAISE EXCEPTION 'Fresh-install test requires an empty INTENT schema; no tables were changed';
 END IF;
 IF to_regclass('auth.users') IS NULL OR to_regprocedure('auth.uid()') IS NULL THEN
  RAISE EXCEPTION 'Use a local Supabase database with auth initialized';
 END IF;
END $$;
\ir ../migrations/20261022000000_communities_baseline.sql
\ir ../migrations/20261023000000_communities_v04.sql
\ir ../migrations/20261023010000_message_groups_v06.sql
\ir ../migrations/20261024000000_access_hardening.sql
-- Also prove hardening can be applied again without duplicating policies/indexes.
\ir ../migrations/20261024000000_access_hardening.sql
\ir function_contract_before.sql
\ir ../migrations/20261024120000_private_function_implementations.sql
-- The new migration itself is safe to repeat; old historical migrations must
-- never be replayed after a subsequent schema upgrade.
\ir ../migrations/20261024120000_private_function_implementations.sql
\ir private_function_security.sql
\ir access_control.sql
-- v0.7 roles: apply twice (idempotent), test it, then rerun earlier suites for compatibility.
\ir ../migrations/20261025100000_community_roles.sql
\ir ../migrations/20261025100000_community_roles.sql
\ir community_roles.sql
\ir private_function_security.sql
\ir access_control.sql
-- Telegram-style groups: topics, avatar and roles. Repeatable; older clients
-- (no topic_id) keep working, so the legacy suite is rerun on the new schema.
\ir ../migrations/20261025110000_group_topics_avatar.sql
\ir ../migrations/20261025110000_group_topics_avatar.sql
\ir access_control.sql
\ir group_topics.sql
