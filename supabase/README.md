# INTENT database: local setup, migrations and access-control tests

`config.toml` defines the **local** `intent-local` stack, PostgreSQL 15, local
API/Studio ports and a local email inbox with confirmation enabled. It contains no
hosted project reference or credentials. Fields follow the [official Supabase CLI
configuration reference](https://supabase.com/docs/guides/local-development/cli/config).
The CLI/Docker stack has not been started as part of this change.

## Isolated tests without a database server

From the repository root after installing the lockfile dependencies:

```powershell
npm run test:db
```

The runner uses a fresh in-memory PGlite PostgreSQL instance. It does not read
`.env.local`, contact Supabase or apply anything to a real project. Only
`auth.users(id,email)` and the JWT subject contract of `auth.uid()` are emulated;
the actual PostgreSQL `anon` and `authenticated` roles, grants and RLS are exercised.
`tests/fresh_install.sql` installs the schema, repeats hardening and runs the
transactional access assertions. Test fixture data is synthetic.

The SHA-256 mappings in `migration-manifest.json` record every archived script and
its canonical counterpart. They must remain byte-identical to their recorded hash.
New SQL changes belong in a new uniquely versioned migration, rather than editing
an archive/canonical pair. The SQL runner validates this manifest and requires
unique 14-digit canonical version prefixes.

## Canonical chronology for fresh local projects

`migrations/` is now the only directory used by the Supabase CLI:

1. `20261022000000_communities_baseline.sql`
2. `20261023000000_communities_v04.sql`
3. `20261023010000_message_groups_v06.sql`
4. `20261024000000_access_hardening.sql`
5. `20261024120000_private_function_implementations.sql`
6. `20261025100000_community_roles.sql` (pending owner review; not applied anywhere)

The fifth migration moves nine elevated RPC/helper implementations into
`intent_private`. Public functions become SECURITY INVOKER wrappers, retaining
their OIDs, named arguments/defaults, ownership and ACLs. Only schema USAGE and
the necessary per-function EXECUTE are granted for wrapper calls; API roles
cannot create private objects and PUBLIC receives no private privileges. Existing
explicit service/custom-role callers retain the corresponding implementation
access. Do not add `intent_private` to API/PostgREST exposed schemas; local config
exposes only `public`. This does not rely on a schema name hiding a callable RPC.

It also fixes authenticated Community `INSERT ... RETURNING`: the SELECT policy
checks the current row inline rather than re-reading the new row through a STABLE
helper. Separate anonymous/authenticated policies keep public browsing working
without granting anonymous access to membership helpers.

The local suite snapshots and compares the exact nine public contracts before
and after the upgrade, checks private DEFINER/search_path/ACLs and public INVOKER
status, tests real authenticated INSERT RETURNING for all three privacy modes and
owner trigger creation, then reruns the five-role RLS suite. A synthetic trigger
failure verifies group creation cannot leave an orphan group. These remain local
database tests; hosted API schema exposure must be verified separately.

The original scripts, including both `20261023` files, are preserved **byte for
byte** in `legacy-migrations/`. This removes the duplicate version prefix from
CLI discovery without silently rewriting the meaning of an old script. Both sets
are part of the repository for auditing; do not run both copies on one database.

For a new disposable local stack with Supabase CLI and Docker installed:

```powershell
supabase start
supabase status
```

Use the reported **local** API URL and publishable/anon key for a separate local
app environment. No `supabase login`, `link` or hosted project is required. The
usual API port is 54321; the email inbox is on port 54324. The local config enables
email confirmation, so registration/recovery still requires following the local
inbox link. These Auth/browser paths need separate end-to-end verification.

This work does not execute the commands above. Avoid starting several worktrees
with the same local `project_id` and ports at once. If a disposable local stack
must be reset, `supabase db reset --local` destroys that stack's local data; use it
only after confirming the stack is disposable. Never use `--linked` or `--db-url`
for the local development steps.

## Existing-project upgrade: no automatic history reconciliation

Existing installations **must not run `supabase db push`, `migration repair` or
replay the canonical history** until their actual schema and migration tracking
have been reviewed and a reconciliation plan explicitly approved. Renaming files
in this repository does not rewrite `supabase_migrations.schema_migrations` in any
existing database. No migration repair or remote access has been performed.

For an existing *development* database that already has both legacy 20261023
changes, first apply the reviewed
`legacy-migrations/20261024_access_hardening.sql` (identical canonical counterpart:
`migrations/20261024000000_access_hardening.sql`), then the new fifth migration.
An installation whose recorded canonical history already matches all first four
migrations needs only `20261024120000_private_function_implementations.sql`.
Use one copy of hardening, never both. First
back up the database, inspect its table definitions, policies, grants and migration
history, and test that upgrade on an isolated copy. This document does not authorize
or execute an upgrade against any hosted project.

The baseline is exclusively for fresh installation. It never replaces existing
tables or repairs missing legacy columns. The old Communities migration is not
idempotent and must not be replayed. Hardening is transactional and can be reapplied.
It refuses unknown policy names because permissive PostgreSQL policies combine
with OR. It does not delete custom policies; their intent needs manual review.
Known policy definitions must match the archived scripts. Custom role inheritance
and column-level grants also need review: hardening resets table grants for
PUBLIC/anon/authenticated, not every possible custom role or legacy column ACL.

## Security contract and regression coverage

- Anonymous users can read public/request Communities, their posts and enabled
  channel metadata; private Communities stay invisible. They cannot read rosters,
  channel messages or group tables.
- Members can access permitted community/channel content. Staff-only publication
  and disabled channels are enforced by RLS. Only owners change Community settings;
  the granted update columns exclude ownership and creation timestamps.
- The membership helpers answer only for `auth.uid()`; passing another person's
  UUID cannot probe that person's membership or staff/manager role.
- A requester can upsert their pending/rejected request, including the same fields
  used by the client. They cannot self-approve, retry approved rows or directly join
  a request-only community. Owner/admin approval uses the existing atomic RPC.
- Group owners/admins add members through RPC. Direct membership writes, sender
  spoofing and unimplemented message edits remain denied. The test uses populated
  private histories to verify outsiders cannot read them.
- Owner membership creation, admin and owner approval, duplicate-approval failure,
  public joining and disabled-channel visibility are covered by SQL assertions.
- Grants no longer depend on Supabase default table privileges. Timeline and
  membership indexes support the application's cursor queries.

The suite uses sequential transactions; it is **not a concurrency/race test**.
It does not verify HTTP/PostgREST, hosted Auth configuration, email delivery,
cookies, Realtime or browser session reset. PGlite tests are useful database
regression checks, not proof that a hosted Supabase project is correctly configured.

## Running assertions with psql on a local Supabase database

```powershell
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -v ON_ERROR_STOP=1 -f supabase/tests/access_control.sql
```

Use actual local credentials and administrator privileges. The SQL guard accepts
only a loopback server address or Unix socket. Docker forwarding may report a
bridge address even with a localhost URL; in that case use the in-memory runner,
or psql inside the local database container over its Unix socket with the source
files available there. Do not weaken the guard or substitute a remote database.

`access_control.sql` creates deterministic fixtures in a transaction and rolls
back on success; ON_ERROR_STOP plus disconnection rolls back failures. UUID
collisions fail without replacing existing users. Custom `auth.users` triggers may
need additional fixture fields on your local Supabase instance. `fresh_install.sql`
requires no preexisting INTENT tables and intentionally persists only the new
schema. It should run only in a disposable database.

## Community roles v0.7 (`20261025100000_community_roles.sql`)

Additive. Adds the `moderator` role (legacy `editor` stays valid and equals moderator),
`communities.category/tags`, and owner-controlled thresholds
`manage_channels_role`, `approve_requests_role`, `remove_members_role` (`admin` by
default = previous behaviour, or `moderator`). New RPCs `intent_decline_request`,
`intent_set_member_role`, `intent_remove_member` are SECURITY INVOKER wrappers over
`intent_private` definers. Policies `requests_read`, `channels_create`, `posts_delete`
are replaced; `channels_delete` and `messages_delete` are new. Image columns get a
`NOT VALID` check (https or small inline data URL). `tests/community_roles.sql`
covers every role, then the earlier suites rerun for compatibility. Do not replay
`20261024000000_access_hardening.sql` afterwards: its policy whitelist predates v0.7.

## Voice channels (`20261025140000_voice_channels.sql`)

Additive, repeatable (pending owner review; not applied anywhere). `community_channels`
gets `kind` (`text`/`voice`), `access` (`open` = all members, `closed` = owner/admin/moderator)
and `max_participants` (2–99, default 10). Existing rows become open text channels. Settings
change only via `intent_update_voice_channel` (INVOKER wrapper over an `intent_private`
definer, authenticated only, authorized by the `manage_channels` threshold). `channels_create`
and `messages_create` are replaced under the same names (no new names for the hardening
allow-list), so messages cannot be inserted into voice channels. This stores metadata
only: no audio/video provider exists. `tests/voice_channels.sql` covers outsider, member,
moderator (both thresholds), admin and owner. The version `20261025120000` was already
used by `owner_community_delete`, hence `20261025140000`. Do not replay access hardening afterwards.
