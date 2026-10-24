INTENT had no Git history, isolated agent workflow or verified quality pipeline. This bootstraps a reviewed GitHub PR workflow and stabilizes the interrupted local prototype setup.

Changes:
- Separate agent worktrees/branches, five role contracts, documented approval boundaries and a local hook blocking direct main pushes/deletions.
- Account-scoped local state, drafts, language, appearance, export/reset and session remounts; corrected stories timing, chat pagination and stale-response handling.
- Reproducible fresh Supabase migrations with byte-preserved legacy copies, grants/RLS hardening and isolated PostgreSQL regression tests. After separate target-specific user approval, the four canonical migrations were applied to the new isolated INTENT Preview project; nine public tables have RLS enabled. Hosted community creation and security-advisor findings remain unresolved.
- Pinned Actions, read-only CI permissions, dependency/secret checks, regression tests, Dependabot and PR template. PostCSS upgraded to a fixed compatible version through an explicit override.
- Dedicated Next.js Vercel preview project with automatic main deployment disabled; no production workflow or credentials in PR jobs.

Validation on the integrated branch:
- TypeScript passed; ESLint has 0 errors and 39 existing image warnings.
- The earlier 13-test regression run passed. The suite now has 16 tests, including three additional fail-closed hosted-test configuration cases (262fd85); the final integrated run remains to be recorded. Integration baseline: 506a7dd.
- In-memory migration/hash/RLS suite passed, including hardening rerun.
- Secret scan: 0 findings. npm audit: 0 vulnerabilities.
- Next.js production build passed locally.

Review boundaries:
- Keep this PR unmerged until explicitly approved. This PR itself does not authorize a main push, production deployment or further hosted Supabase change. The isolated preview setup below had separate user approval.
- After explicit user approval and a full-history secret scan, the repository was made public. Main protection is now enforced server-side for administrators too: PR, strict quality/security/preview checks and resolved conversations required; force-push and deletion prohibited. Auto-merge is off. The approval count is zero because the PR author shares the user's identity; AGENTS.md still requires explicit user merge approval, and independent GitHub approval requires another identity.
- Initial push/PR quality and dependency-security jobs passed remotely. Vercel Git App access is now granted and the Git connection verified. Isolated Supabase URL/publishable configuration is now bound to Vercel Preview only; no privileged key was placed there.
- Vercel's first-deployment issue was resolved by the user's separate one-time approval of an empty static production bootstrap. The placeholder is READY, contains no app/database/secrets, and its automatically created alias was removed. Approval is consumed; the INTENT application remains blocked from production builds. Official reference: https://vercel.com/docs/domains/working-with-domains/deploying-and-redirecting
- An earlier preview was READY and verified HTTP 200: https://intent-social-agents-r2d3cfaof-uneedix.vercel.app . Its production URL is null; Vercel Authentication remains enabled. This evidence predates the new Supabase binding and does not verify hosted browser integration. Git integration and automatic previews are enabled; results of the Git-triggered documentation push will be recorded here.
- Supabase CLI 2.122.0 is authenticated as Uneedix. The user confirmed the Free intent-development organization (kbvnbvlgaqbqtzcepenw). Newly created INTENT Preview (lrhsncjjwamdgqafzgpj, Frankfurt, ACTIVE_HEALTHY, PostgreSQL 17.11) is the only hosted database target changed; existing fvzsgxpxizvbueolgitd remains untouched. No paid upgrade was purchased.
- All four canonical migrations were separately approved and applied. Auth uses the approved p9i61ykzr preview Site URL, project/account-specific wildcard redirects and localhost; minimum password length is 12 and email confirmation remains enabled. A fresh preview must be verified to have consumed the newly bound public configuration.
- Hosted Auth succeeded for three disposable identities; cleanup succeeded for all three. Community creation is currently failing and under investigation. The security advisor reports 10 WARN findings for publicly executable SECURITY DEFINER functions; a backend correction is in preparation, not yet confirmed applied or rechecked.
- Do not mark hosted acceptance complete: multi-user communities/group messages, remaining Auth/cookie/redirect/browser flows, email delivery and Realtime are not established by the passing identity checks. React tests use experimental Node module mocks and the deprecated React test renderer; full browser E2E remains pending.

See docs/WORKFLOW_STATUS.md for configuration state and limitations. Keep this PR draft while hosted failures/advisor findings and final integrated verification remain open. Record final preview and CI evidence after the current investigation.
