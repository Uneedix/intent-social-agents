# Workflow status — 2026-10-24

## Created
- Private repository: https://github.com/Uneedix/intent-social-agents
- Vercel project: uneedix/intent-social-agents (Next.js, Node.js 24).
- Integration branch: chore/agent-workflow. Frontend, backend and QA worked in separate agent/* branches/worktrees; reviewed commits were cherry-picked here.
- Five role contracts are in .agents/team/. No autonomous background services or scheduled agents have been enabled.
- A local pre-push hook rejects updates/deletions targeting main; npm run hooks:install enables it in a new clone.

## Verified locally
- TypeScript: passed.
- ESLint: zero errors, 39 existing image-optimization warnings; no rules disabled.
- Regression tests: 13 tests cover actual React session/storage transitions, delayed auth response, chat history beyond 200 messages, tie-breaking pagination, stale responses, push policy and the preview-only build guard.
- In-memory PostgreSQL: fresh canonical migration chain, archive hashes, hardening rerun and RLS/grants assertions passed. No remote SQL was executed.
- Secret scan: no findings in the staged snapshot (heuristic scanner, not a guarantee).
- Dependency audit: zero vulnerabilities after pinning the fixed PostCSS 8.5.31 override.
- Next.js production build: passed locally. A build is not a production deployment.

## External configuration and limitations
- Repository stays private; auto-merge is disabled. GitHub returned HTTP 403 when configuring private main protection: the current plan requires GitHub Pro or a public repository. No subscription was purchased and source was not made public. Local hooks/instructions are not server-side protection.
- An independent reviewer cannot approve a PR authored by their own GitHub identity. Before enforcing a review-count policy, establish a separate bot/app author or a second reviewer.
- Vercel project has an ignored-build command that skips production Git builds and auto-assignment of production domains disabled. vercel.json additionally disables automatic main deployment.
- A CLI command explicitly requesting preview was classified as production by Vercel on the new project's first deployment. It was canceled while BUILDING: dpl_2wi1DemmjrBznFQsX2aCALX4RnvD, confirmed CANCELED with aliasAssigned=false. No application was released. Official Vercel documentation confirms the first deployment is production: https://vercel.com/docs/domains/working-with-domains/deploying-and-redirecting
- The build now fails closed on Vercel unless the environment is preview. Do not retry the first deployment, remove this guard, or create a production bootstrap without explicit target approval. An initial production bootstrap, if approved, should be an isolated placeholder without Supabase/data/domains, not an unreviewed INTENT release.
- User granted GitHub App access; Vercel Git connection is now verified to Uneedix/intent-social-agents. Automatic previews are temporarily paused at project level until the first-deployment production classification has been explicitly resolved.
- Supabase development/preview credentials are not configured. Current preview can verify only the local-demo shell. Hosted Auth, email, PostgREST, Realtime and browser multi-user scenarios remain unverified.
- No remote database migration, main push, PR merge or production release has occurred.

Draft PR: https://github.com/Uneedix/intent-social-agents/pull/1. Quality/security Actions run on both push and PR. The remaining infrastructure boundaries must stay visible; do not mark previews operational while platform bootstrapping is unresolved. A separate ignored static placeholder has been prepared for explicit production-bootstrap approval; it is not part of the application build or release.
