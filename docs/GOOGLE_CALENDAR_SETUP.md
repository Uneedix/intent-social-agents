# Google Calendar: requirements for a future integration

The current calendar is local to INTENT. It does not connect, sync, import or write
Google events. No Google Cloud project, OAuth client, consent screen, billing
setting, token store or database migration is created by the widgets feature.

Before implementation, the owner must provide an approved Google Cloud project,
enable Calendar API, configure the OAuth consent screen/audience and test users,
create Web application OAuth credentials, and approve the exact development and
stable preview callback URLs. Users must explicitly grant Calendar access; signing
into INTENT or Supabase is not Calendar consent. Public release may require Google's
verification. Follow the [official web-server OAuth setup](https://developers.google.com/identity/protocols/oauth2/web-server).

Start with read-only events on calendars the user owns using
`https://www.googleapis.com/auth/calendar.events.owned.readonly`. The UI must
describe that boundary rather than imply all shared calendars will sync. Request
additional read-only scopes only for a separately approved need, such as listing
calendars (`calendar.calendarlist.readonly`). Do not request write access or the
full `calendar` scope for an agenda widget. See Google's
[Calendar scope definitions](https://developers.google.com/workspace/calendar/api/auth).

The future server flow must:

- Authenticate the INTENT user server-side before both connect and callback.
  Create cryptographically random, expiring, single-use OAuth state bound to that
  user and session. Use authorization code flow with PKCE S256 and a server-held
  verifier; verify state/session and exchange the code server-side. Reject missing,
  expired or replayed state, account changes and mismatched redirect origins.
- Use a fixed HTTPS callback registered **exactly** in Google Cloud and configured
  server-side; never construct it from an untrusted Host header or `returnTo`.
  Use a stable preview hostname instead of arbitrary per-commit URLs or wildcard
  callbacks. Keep development/preview credentials and test accounts separate from
  production. Confirm selected Google identity when linking so a user's connection
  cannot silently be attached to another INTENT account.
- Store access/refresh tokens only on the server, encrypted with managed keys.
  Bind each connection and token refresh to the verified INTENT subject and Google
  account; enforce ownership for every read/refresh/disconnect. Never return tokens
  to React, localStorage, logs, query strings or client-visible environment variables.
  Keep the client secret and encryption keys out of the repository. Use the minimum
  token lifetime and request offline access only if background refresh is required.
- Fetch a bounded agenda window, handle timezone/all-day events, recurrence,
  pagination, cancellations, expired permissions and provider errors. Minimize
  cached event fields, isolate caches by user and return private/no-store responses.
  Do not describe reference/local entries as synchronized provider events.
- Provide Disconnect: stop refresh/background work, revoke Google authorization,
  delete encrypted tokens, cached events and sync metadata, and reflect the
  disconnected state. Respect external revocation and INTENT account deletion.
  Deleting local INTENT data must never silently delete a Google calendar/event.

Acceptance requires isolated test users, approved credentials and callback URLs,
security review of encrypted storage and subject-bound access, and end-to-end
tests for consent denial, state/PKCE failures, cross-account isolation, refresh,
revocation and deletion. These are prerequisites, not claims of functionality
already delivered. No credentials should be pasted into chat or committed.
