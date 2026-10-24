# Hosted Supabase preview setup plan

This is a review plan, not an automatic migration or production connection.

## Target selection
1. Authenticate through a working Supabase connector or official CLI browser login. Never paste access tokens, passwords or verification codes into chat.
2. List organizations/projects read-only. Prefer a newly created isolated project named INTENT Preview; do not reuse an unknown or production project based only on its name.
3. Check project creation cost/quota. Obtain explicit approval for nonzero charges; no automatic plan upgrade or production branching.
4. Record the exact organization, project name/ref, region and environment before requesting migration approval.

## Schema change to approve
For a confirmed fresh test project, apply the four canonical files in order:
- supabase/migrations/20261022000000_communities_baseline.sql
- supabase/migrations/20261023000000_communities_v04.sql
- supabase/migrations/20261023010000_message_groups_v06.sql
- supabase/migrations/20261024000000_access_hardening.sql

These create the communities/group-message schema, constraints, indexes, grants, RLS and authorized RPC functions. Their hashes and synthetic PostgreSQL/RLS assertions already pass locally. Existing projects require separate schema/migration-history inspection and reconciliation. Do not apply the fresh-install chain to an existing database.

The user's informed approval must identify the exact fresh project and these changes. Merely connecting a plugin or authorizing resource discovery is not migration approval.

## Preview-only application settings
- Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY on Vercel Preview only. Frontend publishable configuration is public by design; no service-role key or database password is exposed to the browser, source or CI logs.
- Configure Supabase Auth Site URL to a verified INTENT preview URL and restrict redirect patterns to this project/account. Do not allow every vercel.app deployment.
- Keep email confirmation enabled. Verify email delivery/account ownership before claiming signup/reset E2E has passed; do not email unrelated people.
- Rebuild only a preview after changing build-time public configuration. Leave production variables and the approved empty placeholder unchanged.

## Acceptance
- Verify actual remote table grants, RLS and security/performance advisors after approval/application.
- Run nonmember/member/owner permission checks with disposable test identities.
- Verify cookie refresh, login/logout, confirmation/reset redirects, community creation and multi-user group messages against the isolated project.
- Record separately what was checked through SQL, HTTP and a browser; report missing SMTP/test-account access honestly.
