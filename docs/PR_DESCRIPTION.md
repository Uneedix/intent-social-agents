INTENT had no Git history, isolated agent workflow or verified quality pipeline. This bootstraps a private-repository PR workflow and stabilizes the interrupted local prototype setup.

Changes:
- Separate agent worktrees/branches, five role contracts, documented approval boundaries and a local hook blocking direct main pushes/deletions.
- Account-scoped local state, drafts, language, appearance, export/reset and session remounts; corrected stories timing, chat pagination and stale-response handling.
- Reproducible fresh Supabase migrations with byte-preserved legacy copies, grants/RLS hardening and isolated PostgreSQL regression tests. No hosted database migration was applied.
- Pinned Actions, read-only CI permissions, dependency/secret checks, regression tests, Dependabot and PR template. PostCSS upgraded to a fixed compatible version through an explicit override.
- Dedicated Next.js Vercel preview project with automatic main deployment disabled; no production workflow or credentials in PR jobs.

Validation on the integrated branch:
- TypeScript passed; ESLint has 0 errors and 39 existing image warnings.
- 13 regression tests cover session/storage, paging/races, scanning, main push policy and a fail-closed preview-only build guard.
- In-memory migration/hash/RLS suite passed, including hardening rerun.
- Secret scan: 0 findings. npm audit: 0 vulnerabilities.
- Next.js production build passed locally.

Review boundaries:
- Keep this PR unmerged until explicitly approved. No main push, production deployment or hosted Supabase change is authorized by this PR.
- GitHub private branch protection was refused with HTTP 403 on the current plan. Auto-merge is off, but the local hook is not equivalent to server enforcement.
- Initial push/PR quality and dependency-security jobs passed remotely. Vercel Git App access is now granted and the Git connection verified. Isolated preview Supabase configuration remains unconfigured.
- Preview creation is blocked by Vercel's first-deployment behavior: an explicit preview request was classified production. That build was immediately canceled before alias assignment; no release occurred. A guard now refuses non-preview Vercel builds, and automatic previews are paused at project level. A separate empty placeholder is prepared for approval; do not deploy that production bootstrap or remove the app guard without explicit target approval. Official reference: https://vercel.com/docs/domains/working-with-domains/deploying-and-redirecting
- Without Supabase configuration, any future preview verifies only the local-demo shell, not live Auth/database behavior.
- Existing hosted migration history requires separately approved reconciliation. React tests use experimental Node module mocks and the deprecated React test renderer; full browser/Auth E2E remains a follow-up.

See docs/WORKFLOW_STATUS.md for configuration state and limitations. Preview and remote CI results will be attached to this PR after publication.
