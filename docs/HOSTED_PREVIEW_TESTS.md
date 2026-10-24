# Hosted preview HTTP tests

This opt-in harness is restricted to the isolated Supabase project `lrhsncjjwamdgqafzgpj`.
It is deliberately absent from npm scripts and default CI. It does not apply SQL,
change Auth settings, deploy Vercel, discover credentials, or access another project.

After the approved schema and Auth configuration are ready, supply these environment
variables to the process through your trusted terminal/session or secret manager:

- `SUPABASE_PREVIEW_TEST_URL`: `https://lrhsncjjwamdgqafzgpj.supabase.co`
- `SUPABASE_PREVIEW_TEST_PUBLISHABLE_KEY`: that preview project's public key
- `SUPABASE_PREVIEW_TEST_SECRET_KEY`: that preview project's privileged secret key

Never paste privileged keys into chat, commit them, save them to a test runner, or
expose them to untrusted PR jobs. Do not substitute production credentials. This
script neither reads Supabase CLI credential storage nor invokes the CLI.

```powershell
# Once the three variables have been provided privately to this process:
node scripts/test-hosted-preview.mjs --help
node scripts/test-hosted-preview.mjs
```

The URL must use HTTPS, the exact allowed hostname, and no credentials, nonstandard
port, path, query, or fragment. Missing configuration or another target fails before
any request. There are no command-line options for supplying keys or overriding the
project. SDK requests reject redirects and have a 20-second timeout each.

The harness creates three random `example.com` accounts using Admin `createUser`
with `email_confirm: true`; it sends no confirmation/reset/invite emails. Passwords,
JWT sessions and keys remain in memory. All permission tests use separate clients
with the publishable key and the relevant user session. The privileged client is
used only for creating/deleting the run's accounts and read-only cleanup checks.

Coverage includes login and authenticated identity; a PGRST106 HTTP rejection of the unexposed `intent_private.intent_can_view(cid, uid)` RPC; owner membership triggers;
public joining and role escalation denial; pending/repeated join requests, denial
of self/outsider approval, owner approval and membership; staff-only publishing;
private community/post/channel restrictions; group create/add-member RPCs; member
messaging; sender spoofing and outsider read/write/invite denial. Expected denial
requires PostgreSQL authorization error codes rather than accepting any HTTP error.

`finally` signs out temporary sessions and deletes only Auth IDs returned by this
run's successful `createUser` requests. Foreign-key cascades remove those users'
test communities, groups and messages. It never enumerates or deletes other users
or uses broad table deletes. Read-only checks verify removal of run-owned parent
fixtures. Any test or cleanup failure sets a nonzero exit code. Logs contain fixed
PASS/FAIL labels, a random run ID, target hostname, account counts, an allowlisted error code and HTTP status; raw response
errors, emails, passwords, keys and sessions are never printed.

A forced kill or lost create-user response can prevent complete cleanup. The run ID
is recorded in `app_metadata.intent_preview_test_run` and fixture names for authorized
manual investigation. Do not run broad cleanup commands or delete unrelated data.
Keep the process alive until its cleanup summary appears. Rate limits, mail delivery,
OAuth flows, browser cookie redirects, concurrent approvals and the Vercel interface
require separate checks; this harness does not claim to cover them.
