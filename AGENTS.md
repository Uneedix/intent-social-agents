# INTENT engineering workflow

## Authority
- The Engineering Lead coordinates frontend, backend, UI/UX and QA/security agents with independent scopes and acceptance criteria.
- Implementation uses an `agent/<role>/<task>` branch and a separate Git worktree. Integrate reviewed commits into a feature branch, never main.
- Never push directly to main, merge a PR or deploy/promote production without explicit approval identifying the target. General setup approval is not production-release approval.
- Ask before destructive operations or applying migrations to a persistent database. Disposable in-memory SQL tests are approved; they never connect to Supabase.
- Never print, commit or upload credentials. Use official login or credential managers. Preview never receives production Supabase data or server credentials.
- Never bypass failing tests/security checks or weaken approval gates. Fix the cause or report the blocker.

## Roles and process
Read your role in `.agents/team/`. Roles are reusable instructions, not automatically running services. The lead may combine UI/UX review with frontend work within available concurrency.

1. Inspect Git state, instructions and dependencies; preserve user changes.
2. Agree shared data/UI contracts before parallel work. Avoid concurrent ownership of a file.
3. Work only in the assigned worktree; do not switch another checkout's branch.
4. Add meaningful regressions for behavior, identity boundaries, permissions and async errors.
5. Run `npm run verify` on the integrated checkout plus checks appropriate to the change.
6. Commit scoped files; report commit, checks and limitations. Preserve unfinished work before cleanup.
7. PRs describe behavior, validation, risks, migrations and preview. Drafts identify pending/failing checks.

## Architecture and delivery
Next.js App Router, React and TypeScript; Supabase Auth, communities and group chats. Feed/profile/direct messaging/market/ads remain local demos. Browser state is scoped by account identity; legacy unscoped data is not adopted automatically. RLS is the server authorization boundary.

See `docs/DEVELOPMENT_WORKFLOW.md`. CI uses no production credentials. No production or remote-migration workflow is included.
