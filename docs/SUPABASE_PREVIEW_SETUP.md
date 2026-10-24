# Hosted Supabase preview setup and open acceptance checks

Status snapshot: 2026-10-24. Setup below was separately approved and performed against a newly created isolated preview project. This document does not authorize production changes, an additional migration, a plan upgrade or changes to an existing project.

## Confirmed target
- Official CLI: Supabase 2.122.0, authenticated as Uneedix. Never paste tokens, passwords or verification codes into chat or commit them.
- User-confirmed organization: intent-development, ref kbvnbvlgaqbqtzcepenw, Free plan. No paid upgrade was purchased.
- New project: INTENT Preview, ref lrhsncjjwamdgqafzgpj, Frankfurt, ACTIVE_HEALTHY, PostgreSQL 17.11.
- Existing project fvzsgxpxizvbueolgitd was left untouched. Do not reuse it or reconcile its migrations without separate inspection and approval.

## Approved schema changes already applied
The user approved these four canonical migrations for the fresh project lrhsncjjwamdgqafzgpj; they were applied in order:
1. supabase/migrations/20261022000000_communities_baseline.sql
2. supabase/migrations/20261023000000_communities_v04.sql
3. supabase/migrations/20261023010000_message_groups_v06.sql
4. supabase/migrations/20261024000000_access_hardening.sql

The chain creates communities/group-message tables, constraints, indexes, grants, RLS and RPC functions. Nine public tables were confirmed to have RLS enabled. Local migration/hash/RLS tests and table-level RLS flags do not establish hosted RPC correctness or successful multi-user behavior.

The hosted security advisor reports 10 WARN findings for publicly executable SECURITY DEFINER functions. A further backend hardening migration is in preparation. Its final contents, approval/application and advisor recheck remain outstanding in this snapshot; do not describe these findings as fixed.

## Preview-only configuration already bound
- The isolated project's NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are now bound only to the Vercel Preview environment. Publishable configuration is public by design; no service-role key, database password or other privileged key was placed there.
- Auth Site URL now targets the verified stable branch alias https://intent-social-agents-git-chore-agent-workflow-uneedix.vercel.app . Callbacks should use this alias after the next preview push containing the new configuration. The older immutable p9i61ykzr deployment lacks the new Supabase environment values. Allowed redirects use the project's account-specific preview wildcard and localhost; no all-vercel.app redirect wildcard was enabled. The one-property Auth update left seven undeclared remote properties untouched.
- Minimum password length: 12. Email confirmation: enabled.
- Production variables and the separately approved empty production placeholder remain outside this database connection. Build-time configuration requires a new preview build; verify the exact deployment before claiming it consumed the new values.

## Checks completed and unresolved
- Hosted authentication succeeded for three disposable test identities; cleanup succeeded for all three.
- Hosted community creation is failing. QA reproduced error 42501 for INSERT communities RETURNING in PGlite, attributed to the STABLE self-lookup read policy. The backend correction is in preparation and is not yet confirmed applied. Do not report communities/group-message acceptance as passed.
- Remote performance advisors (--level warn --fail-onerror) returned results: [] (no issues); security-advisor warnings remain separate and unresolved.
- Latest published commit 920323e has successful quality/dependency-security/preview-readiness/Vercel checks. This does not resolve the hosted community-creation failure.
- The regression suite now contains 16 tests, including three fail-closed hosted-test configuration cases from 262fd85. These guards prevent an unconfirmed target from being used; they are not hosted application acceptance.
- Pending: resolve the community-creation failure, review the security correction, obtain any required target-specific approval before application, and rerun advisors and remote permission/RPC checks.
- Pending: nonmember/member/owner scenarios, multi-user group messaging, cookie refresh, login/logout, confirmation/reset redirects, email delivery and Realtime, with browser results recorded separately from SQL/HTTP results.
- Record the final integrated test run and exact successful preview deployment after these investigations. Until then, this is a configured preview with unresolved acceptance checks.

Keep disposable tests restricted to lrhsncjjwamdgqafzgpj and clean up their identities/data. Never infer approval for a different target, main merge or production release from preview setup approval.
