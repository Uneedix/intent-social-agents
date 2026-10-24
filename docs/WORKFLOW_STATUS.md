# Workflow status — 2026-10-24

## Created
- Repository: https://github.com/Uneedix/intent-social-agents (public by explicit user approval; initially created private).
- Vercel project: uneedix/intent-social-agents (Next.js, Node.js 24).
- Integration branch: chore/agent-workflow. Frontend, backend and QA worked in separate agent/* branches/worktrees; reviewed commits were cherry-picked here.
- Five role contracts are in .agents/team/. No autonomous background services or scheduled agents have been enabled.
- A local pre-push hook rejects updates/deletions targeting main; npm run hooks:install enables it in a new clone.

## Verified locally
- Application/infrastructure integration baseline: 506a7dd; latest QA configuration regressions: 262fd85. Final results from the ongoing hosted investigation and any subsequent security migration are not included yet.
- TypeScript: passed.
- ESLint: zero errors, 39 existing image-optimization warnings; no rules disabled.
- The earlier local regression run passed 13 tests covering React session/storage transitions, delayed auth responses, chat history beyond 200 messages, tie-breaking pagination, stale responses, push policy and the preview-only build guard. The suite now contains 16 tests, including three additional fail-closed hosted-test configuration checks (262fd85); record the final integrated run separately.
- In-memory PostgreSQL: fresh canonical migration chain, archive hashes, hardening rerun and RLS/grants assertions passed. The separately approved hosted application of the four canonical migrations is recorded below.
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
- Earlier manual preview dpl_5kkY1SSzZyfzjjAoaW8iLgTFk3u7 is READY, target=null (Vercel's preview representation), productionUrl=null, HTTP 200: https://intent-social-agents-r2d3cfaof-uneedix.vercel.app . Vercel Authentication remains enabled.
- Official Supabase CLI 2.122.0 is authenticated as Uneedix. The user confirmed the Free organization intent-development (kbvnbvlgaqbqtzcepenw); no paid plan or upgrade was purchased. Connector tools remain unavailable, so setup used the official CLI.
- A newly created, isolated INTENT Preview project is ACTIVE_HEALTHY: ref lrhsncjjwamdgqafzgpj, Frankfurt, PostgreSQL 17.11. The existing project fvzsgxpxizvbueolgitd was left untouched.
- The user explicitly approved applying the four canonical migrations to lrhsncjjwamdgqafzgpj. All four were applied; nine public tables have RLS enabled. This does not establish that every hosted permission/RPC scenario passes.
- The approved Auth Site URL uses the INTENT preview deployment identified by p9i61ykzr. Redirects are restricted to the project/account preview wildcard and localhost, rather than all vercel.app deployments. Minimum password length is 12; email confirmation remains enabled.
- NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY for the isolated project are now bound to Vercel Preview only. No privileged key was placed there. Production settings and the separately approved empty placeholder were not connected to this database. A fresh preview build/inspection must confirm that the intended build consumed these values before claiming browser integration passes.
- Hosted checks authenticated three disposable test identities successfully; cleanup passed for all three. Community creation is failing and under investigation. Multi-user communities/group-chat acceptance, cookie/redirect behavior, browser flows, email delivery and Realtime must not be reported as passed on this evidence.
- The hosted security advisor currently reports 10 WARN findings for publicly executable SECURITY DEFINER functions. A backend security migration is being prepared. It has not yet been applied or rechecked in this status snapshot; the warnings are unresolved.
- No main push, PR merge or INTENT production release has occurred. Hosted changes were limited to the separately approved isolated preview project. The only successful production deployment remains the separately approved empty infrastructure placeholder.

Draft PR: https://github.com/Uneedix/intent-social-agents/pull/1. Quality/security Actions passed on the application/guard commit and run on push/PR updates. Preview/CI results are attached to the PR. Server-side main enforcement is now active. Hosted community creation, advisor warnings and remaining Auth/browser/multi-user E2E checks are open; an independent reviewer identity is also still absent. Do not treat this as release acceptance.
