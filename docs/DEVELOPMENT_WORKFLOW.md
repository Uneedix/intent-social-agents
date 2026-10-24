# Semi-autonomous development

## Working agreement
The user owns PR merge, persistent migrations and production-release approval. The lead may plan, delegate, implement in worktrees, test, publish feature branches, create PRs and deploy non-production previews within the approved task.

No production/remote-migration workflow is included. An empty private repository may initialize a README via GitHub; application code is published only to a feature branch through a PR.

## Lifecycle
1. Lead defines scope, behavior, dependencies and acceptance criteria.
2. Create a worktree on `agent/<role>/<task>` from the agreed base.
3. Agent reads AGENTS.md and its role; edits only assigned files.
4. Agent commits/reports tests. Lead reviews/cherry-picks into a feature integration branch.
5. Run `npm run verify`; add browser/Auth tests when those behaviors change.
6. Publish branch/PR with test results and preview. Failing checks remain explicit.
7. User explicitly authorizes merge; production release needs separate target approval.

Worktrees live in ignored `.worktrees/`. Never remove one before preserving its work. Credentials, `.env*`, generated artifacts and temporary tooling stay ignored.

## GitHub
Visibility changes require explicit user approval. This repository is public by the user's informed choice after a full-history secret scan; never apply that choice automatically to another repository. Application changes require PRs, successful quality/security/preview checks and resolved conversations. Force-push/delete and administrator bypass are disabled; auto-merge remains disabled.

GitHub requires the quality, dependency-security, Preview readiness (Git integration) and Vercel contexts to pass against an up-to-date branch. Required approving-review count is zero because the PR author and current user share the Uneedix GitHub identity; a person cannot approve their own PR. This does not authorize automatic merge: explicit user approval is still mandatory under AGENTS.md. To enforce a separate human review at GitHub level, introduce a distinct bot author or another reviewer first.

Actions permissions are read-only by default. Untrusted PR code receives no production/deployment secrets. CI checks the actual PR commit, not merely an earlier local version. Run `npm run hooks:install` in a new clone to install the local main-push guard; this is not server-side protection.

## Preview
Use a dedicated Vercel project and isolated development Supabase. Verify team/project before mutations. Git integration may build feature branches without giving deployment tokens to PR code.

Disable automatic main deployment, or use a separate manually gated production project. Leaving PRs unmerged alone is not a technical production gate. Verify this behavior before connecting Git.

The repository build fails closed on Vercel unless both system environment indicators identify preview. Vercel classifies a new project's first deployment as production, even for an explicit preview request. Stop and obtain explicit approval for a separate placeholder bootstrap; never silently bootstrap production or weaken this guard to obtain a preview URL.

Preview uses its own NEXT_PUBLIC_SUPABASE_URL/publishable key only. Service-role keys/passwords must never have NEXT_PUBLIC_ names. Restrict Auth redirects to intended preview URLs. Without isolated Supabase, preview verifies the local-demo shell only; do not claim live Auth/database verification or create fake credentials.

## Database
`npm run test:db` uses in-memory PostgreSQL/synthetic identity, without remote connections. It does not verify email, cookies, PostgREST, Realtime or concurrency. Canonical fresh migrations have unique timestamps and hashed historical copies. Existing hosted migration tracking requires separately approved reconciliation; never automatically db push/migration repair against it.

## Operations
Use official device login or an existing connector; never paste tokens into chat/repository. Do not publish auth state/environment files as artifacts. Record exact checks, deployment targets and remaining blockers in WORKFLOW_STATUS.md.
