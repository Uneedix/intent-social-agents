# Hosted Supabase preview setup and open acceptance checks

Status snapshot: 2026-10-24. Setup below was separately approved and performed against a newly created isolated preview project. This document does not authorize production changes, an additional migration, a plan upgrade or changes to an existing project.

## Confirmed target
- Official CLI: Supabase 2.122.0, authenticated as Uneedix. Never paste tokens, passwords or verification codes into chat or commit them.
- User-confirmed organization: intent-development, ref kbvnbvlgaqbqtzcepenw, Free plan. No paid upgrade was purchased.
- New project: INTENT Preview, ref lrhsncjjwamdgqafzgpj, Frankfurt, ACTIVE_HEALTHY, PostgreSQL 17.11.
- Existing project fvzsgxpxizvbueolgitd was left untouched. Do not reuse it or reconcile its migrations without separate inspection and approval.

## Approved schema changes already applied
The first four canonical migrations were approved for the fresh project lrhsncjjwamdgqafzgpj and applied in order; the subsequent private-function correction was then applied to that isolated project only:
1. supabase/migrations/20261022000000_communities_baseline.sql
2. supabase/migrations/20261023000000_communities_v04.sql
3. supabase/migrations/20261023010000_message_groups_v06.sql
4. supabase/migrations/20261024000000_access_hardening.sql
5. supabase/migrations/20261024120000_private_function_implementations.sql

The chain creates communities/group-message tables, constraints, indexes, grants, RLS and RPC functions. Nine public tables were confirmed to have RLS enabled. Local migration/hash/RLS tests and table-level RLS flags do not establish hosted RPC correctness or successful multi-user behavior.

The fifth migration moves nine implementations into the private schema and leaves nine public SECURITY INVOKER wrappers, preserving exact ACLs, signatures and OIDs and fixing implementation search paths. It also splits the community read policy for anonymous/authenticated callers, correcting the reproduced INSERT communities RETURNING error 42501. The post-migration security and performance advisors both returned results: [] at warning level; the earlier 10 security WARN findings are resolved on this checked target.

## Preview-only configuration already bound
- The isolated project's NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are now bound only to the Vercel Preview environment. Publishable configuration is public by design; no service-role key, database password or other privileged key was placed there.
- Auth Site URL now targets the verified stable branch alias https://intent-social-agents-git-chore-agent-workflow-uneedix.vercel.app . Callbacks should use this alias after the next preview push containing the new configuration. The older immutable p9i61ykzr deployment lacks the new Supabase environment values. Allowed redirects use the project's account-specific preview wildcard and localhost; no all-vercel.app redirect wildcard was enabled. The one-property Auth update left seven undeclared remote properties untouched.
- Minimum password length: 12. Email confirmation: enabled.
- Production variables and the separately approved empty production placeholder remain outside this database connection. Build-time configuration requires a new preview build; verify the exact deployment before claiming it consumed the new values.

## Checks completed and unresolved
- Hosted HTTP run 513862f1: all Auth, community and group-message checks passed, including community creation, member/nonmember boundaries, sender spoofing, self-role escalation and private reads. Requests to the private schema were denied with HTTP 406 / PGRST106.
- All three disposable test identities were cleaned up successfully. The post-test read-only check confirmed nine RLS-enabled tables and zero auth.users, communities and message_groups rows.
- Remote security and performance advisors after migration: results: [] at warning level. These are bounded advisor results, not a guarantee against every possible issue.
- Integrated regressions: 17 passed. The five-migration PGlite chain, reapplication/rollback and RLS assertions passed; secret scan found 0 findings and dependency audit reported 0 vulnerabilities.
- Previously published 920323e has successful quality/dependency-security/preview-readiness/Vercel checks. The next push and its CI/preview result are pending; do not reuse historical checks as evidence for the new revision.
- Final npm run verify passed (exit 0): TypeScript, lint (0 errors, 39 existing image warnings), 17 regressions, five-migration PGlite suite, secret scan (0 findings), audit (0 vulnerabilities) and local Next.js production build. This was not a production deployment.
- Pending: verify the exact new preview consumes the bound public configuration, then browser login/logout, session cookie refresh, confirmation/reset redirects, actual email delivery, account switching and Realtime. These were not established by the hosted HTTP run.
- The final integrated local build is recorded above; record the exact new preview/CI evidence separately. Hosted HTTP acceptance is complete for the checked scenarios; browser/email/SSR/Realtime acceptance remains open.

Keep disposable tests restricted to lrhsncjjwamdgqafzgpj and clean up their identities/data. Never infer approval for a different target, main merge or production release from preview setup approval.
