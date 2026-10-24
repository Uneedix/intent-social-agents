# INTENT database: installation and access-control checks

These scripts target Supabase PostgreSQL (`auth.users`, `auth.uid()`, `anon`
and `authenticated` must already exist). The application never applies SQL
automatically. No remote database has been accessed to prepare these changes.

## Fresh local installation

Use a disposable **local** Supabase database and a database administrator connection.
Install PostgreSQL `psql` separately if it is unavailable. Do not use production
credentials or a remote connection URL for these tests.

```powershell
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -v ON_ERROR_STOP=1 -f supabase/tests/fresh_install.sql
```

The example is the usual local Supabase address; use the actual local port and
password for your instance. The SQL guard accepts only a loopback server address
or a Unix socket. Docker port forwarding can make `inet_server_addr()` report the
container's bridge address even when the client URL is localhost; in that case the
guard intentionally refuses the run. Execute psql inside the local database
container over its Unix socket with the `supabase` directory mounted/copied there,
or use the project's in-memory PostgreSQL test runner when available. Do not weaken
the guard or substitute a remote database to bypass it.

The test refuses to run
if any INTENT table exists. It applies these files in explicit order:

1. `migrations/20261022_communities_baseline.sql`
2. `migrations/20261023_communities_v04.sql`
3. `migrations/20261023_message_groups_v06.sql`
4. `migrations/20261024_access_hardening.sql`

Historical migration names are preserved. Two historical files share the version
prefix `20261023`, so do **not** assume this directory is already a valid Supabase
CLI migration history or run `supabase db push`. Reconcile migration tracking in a
separate reviewed change before using CLI automation.

## Existing installations

Review/backup the development database first. If both 20261023 migrations have
already been applied, apply **only** `20261024_access_hardening.sql` as administrator.
Do not replay historical migrations: the Communities migration is not idempotent.
The baseline is for fresh installation and deliberately does not repair or replace
an existing table. A legacy schema missing expected columns requires a separately
reviewed migration after inspecting its definition.

Hardening runs inside one transaction. It refuses to proceed if it finds policy
names outside the known contract on these nine tables. PostgreSQL combines
permissive policies with OR, so unknown policies must be inspected before retrying;
the script does not silently delete custom policies. Known policy definitions must
match the checked-in historical migrations. Custom column-level grants and role
inheritance should also be reviewed in an existing installation: this migration
resets table grants for PUBLIC/anon/authenticated, not every possible custom role.

## Security contract

- Anonymous users can read public/request Communities, their posts and enabled
  channel metadata; private Communities remain invisible. Anonymous users cannot
  read membership rosters, channel messages or private group tables.
- Authenticated community members can read their permitted content; staff-only
  posting is enforced by RLS. Only the owner changes Community settings. Ownership
  and server timestamps cannot be changed using the granted update columns.
- Membership helpers retain their existing signatures but answer only for
  `auth.uid()`. They cannot be used to probe another user's private memberships.
- Applicants may repeat a pending/rejected request with the existing client upsert.
  They cannot approve themselves, edit someone else's request, or retry an approved
  row. Owner/admin approval remains an atomic RPC.
- Group membership is managed only by RPC with owner/admin authorization. Members
  can send only as themselves. Direct membership writes are not granted.
- Group grants are explicit, independent of default Supabase table privileges.
- Cursor-oriented composite indexes cover message/post timelines; user/author
  indexes support membership and foreign-key lookups. Client pagination must still
  be implemented by the application.

## RLS regression checks on an existing local schema

```powershell
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -v ON_ERROR_STOP=1 -f supabase/tests/access_control.sql
```

The script creates deterministic test users and fixtures inside a transaction,
switches to actual `anon`/`authenticated` database roles and sets the JWT subject.
Checks cover anonymous visibility, outsiders, members, admins, owners, author
spoofing, helper probing, repeated requests, self-approval denial and owner
protection. The transaction is rolled back on success; an error stops psql and the
connection rollback discards fixtures. A fixture UUID collision causes failure,
never fixture replacement. Custom `auth.users` triggers may require additional
fixture fields for your local installation.

These SQL assertions do not exercise email delivery, browser cookies, HTTP/PostgREST
behavior, Realtime or concurrent requests. They do not replace an end-to-end test
against an isolated development project. SQL execution requires a local database;
source review alone must not be reported as a passing database test.
