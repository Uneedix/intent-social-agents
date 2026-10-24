# INTENT v0.4 — Communities

## Install

1. Make a backup of your Supabase development database.
2. In Supabase SQL Editor, review and run `supabase/migrations/20261023_communities_v04.sql` **once**. It extends the existing `public.communities` table created earlier; do not run the earlier incompatible draft migration over it.
3. Keep your existing `.env.local` in the project root; never upload it. Required keys: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
4. `npm.cmd install` then `npm.cmd run dev`.
5. Sign in at `/login`, open Communities, and create a community.

## Implemented

- Communities stored in Supabase with owner assignment, mandatory vertical feed, members, optional text channels, posting permissions, open/request/private access.
- Server RLS for reads/writes; request approval is an authenticated SECURITY DEFINER RPC with explicit manager check.
- Disabling channels hides them from reads and posting without deleting records.
- No client-side fake community creation.

## Important limitations / security follow-up

- No invitation issuance for private communities yet: private communities are owner-only until invite flow is implemented.
- Channel categories, reactions, per-channel permissions, comments, moderation and media uploads are not yet implemented.
- Only owner can edit settings in the current UI; manager/admin role assignment UI is not yet implemented.
- Public and approval-required community feeds are readable by nonmembers. Private feeds are member-only. Channel messages require membership.
- Existing social feed, ads, marketplace and DMs are still demo/local features.
- Do not deploy as production without testing RLS with multiple real accounts, security review and dependency audit.

## Manual checks

1. Create account A and community A. Confirm row in `communities` and owner membership row.
2. With account B, verify public join works and B can post only when allowed.
3. Switch to staff-only; verify B's direct `community_posts` insert is rejected by RLS.
4. Switch to request-only; verify new account C can request, not directly join; A can approve.
5. Switch to private; verify outsider cannot read community, posts or channels through API.
6. Disable channels; verify even a member cannot read old channels or messages, then re-enable to restore them.
7. Confirm no `service_role`/secret key appears in client bundle or `.env.local` checked into Git.
