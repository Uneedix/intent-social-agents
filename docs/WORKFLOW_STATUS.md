# Workflow status — 2026-10-24

## Created
- Repository: https://github.com/Uneedix/intent-social-agents (public by explicit user approval; initially created private).
- Vercel project: uneedix/intent-social-agents (Next.js, Node.js 24).
- Integration branch: chore/agent-workflow. Frontend, backend and QA worked in separate agent/* branches/worktrees; reviewed commits were cherry-picked here.
- Five role contracts are in .agents/team/. No autonomous background services or scheduled agents have been enabled.
- A local pre-push hook rejects updates/deletions targeting main; npm run hooks:install enables it in a new clone.

## Verified locally
- TypeScript: passed.
- ESLint: zero errors, 39 existing image-optimization warnings; no rules disabled.
- Regression tests: 13 passed, covering actual React session/storage transitions, delayed auth response, chat history beyond 200 messages, tie-breaking pagination, stale responses, push policy and the preview-only build guard.
- In-memory PostgreSQL: fresh canonical migration chain, archive hashes, hardening rerun and RLS/grants assertions passed. No remote SQL was executed.
- Secret scan: no findings in the staged snapshot (heuristic scanner, not a guarantee).
- Dependency audit: zero vulnerabilities after pinning the fixed PostCSS 8.5.31 override.
- Next.js production build: passed locally. A build is not a production deployment.

## External configuration and limitations
- The user explicitly approved publishing the repository and its history. A scan of all 193 reachable Git objects / 123 blobs found no secrets before visibility changed. The repository is now public; no subscription was purchased.
- Server-side main protection was created and read back successfully (HTTP 200): PR required, strict up-to-date checks quality/dependency-security/Preview readiness (Git integration)/Vercel, conversation resolution, enforce_admins=true, force-push=false, deletion=false. Auto-merge remains off; vulnerability alerts are enabled.
- The required approving-review count is zero because the PR author and user share one GitHub identity. GitHub cannot accept a self-approval. Explicit user approval before merge remains mandatory; a distinct bot author or independent reviewer is needed for a separate server-enforced human approval.
- Vercel project has an ignored-build command that skips production Git builds and auto-assignment of production domains disabled. vercel.json additionally disables automatic main deployment.
- A CLI command explicitly requesting preview was classified as production by Vercel on the new project's first deployment. It was canceled while BUILDING: dpl_2wi1DemmjrBznFQsX2aCALX4RnvD, confirmed CANCELED with aliasAssigned=false. No application was released. Official Vercel documentation confirms the first deployment is production: https://vercel.com/docs/domains/working-with-domains/deploying-and-redirecting
- The user subsequently explicitly approved one empty production bootstrap only. Deployment dpl_CBKFnM7XnhJrnamswLsMGygfXUhv is READY and its immutable URL returned HTTP 200 with the placeholder HTML. It contained only index.html and vercel.json, with no INTENT application, secrets, database or external resources. Vercel created a platform alias despite --skip-domain; that alias was removed and the active project-alias inventory was confirmed empty. This one-time approval is consumed; any further production action requires new explicit approval.
- The app build still fails closed unless the Vercel environment is preview. Main auto-deployment and production-domain auto-assignment remain disabled. Next.js settings were restored after the static bootstrap.
- User granted GitHub App access; Git connection is verified to Uneedix/intent-social-agents. Automatic previews are enabled, and GitHub variable VERCEL_GIT_PREVIEW_ENABLED=true is configured. The documentation push tests Git-triggered preview creation; results are attached to the PR.
- Manual preview dpl_5kkY1SSzZyfzjjAoaW8iLgTFk3u7 is READY, target=null (Vercel's preview representation), productionUrl=null, HTTP 200: https://intent-social-agents-r2d3cfaof-uneedix.vercel.app . Vercel Authentication remains enabled.
- Supabase development/preview credentials are not configured. Current preview can verify only the local-demo shell. Hosted Auth, email, PostgREST, Realtime and browser multi-user scenarios remain unverified.
- Supabase plugin installation is confirmed, but no Supabase tools are exposed in this session. Official CLI 2.122.0 is available; it reports AccessTokenRequiredError. Browser login must be completed by the user locally, without sending credentials or verification codes in chat. No hosted project has been selected or modified.
- No remote database migration, main push, PR merge or INTENT production release has occurred. The only successful production deployment is the separately approved empty infrastructure placeholder.

Draft PR: https://github.com/Uneedix/intent-social-agents/pull/1. Quality/security Actions passed on the application/guard commit and run on push/PR updates. Preview/CI results are attached to the PR. Server-side main enforcement is now active. Hosted Supabase/E2E and independent reviewer identity remain explicit limitations.
