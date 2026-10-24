# INTENT

Next.js 15 / React 19 / TypeScript social-network prototype with Supabase authentication, communities and private group conversations.

## Product boundaries
The feed, intentions, profiles, follows, reactions, stories, direct-message UI, marketplace and ad drafts are local demos. They are not yet a complete multi-user social network. Browser data is isolated by account/guest identity. Legacy unscoped data is preserved but not adopted automatically.

Auth, communities and group chats have Supabase integrations and require a configured isolated development project. Demo privacy preferences are not server authorization. Payments, advertising delivery and calls are not connected.

## Checks
Use Node.js 24 and the committed npm lockfile:

```powershell
npm.cmd ci --ignore-scripts
npm.cmd run verify
```

Verification runs TypeScript, ESLint, regression tests, in-memory PostgreSQL/RLS tests, secret scanning, dependency audit and a production build. It never applies SQL to a remote database. See package.json for individual commands and docs/WORKFLOW_STATUS.md for actual results.

## Environment
Use .env.example only with a separate development/preview Supabase project. Never use production credentials or data in preview. See supabase/README.md for local SQL and existing-project migration boundaries.

For Vercel-linked development, authenticate/link the intended project and verify environment configuration before running npm.cmd run dev. A build/test run without Supabase verifies the local-demo shell, not hosted Auth or multi-user behavior.

## Agent workflow
AGENTS.md and .agents/team/ define the Engineering Lead, Frontend, Backend, UI/UX and QA/security roles. Each implementation task uses a separate branch/worktree. Reviewed changes go through PR checks and a non-production preview. Never push directly to main.

PR merge, persistent database migrations and production deployment require explicit approval. See docs/DEVELOPMENT_WORKFLOW.md. Older versioned setup notes are historical context; current workflow/database instructions take precedence where they differ.
