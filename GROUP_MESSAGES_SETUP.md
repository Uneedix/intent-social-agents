# INTENT v0.6 — Group chats

This adds private group conversations to Messages, **not** Communities. Existing direct-message demo remains unchanged.

## Setup
1. Back up the development Supabase project.
2. In Supabase SQL Editor, run `supabase/migrations/20261023_message_groups_v06.sql` once.
3. Keep `.env.local` in the root of the app (never upload it).
4. Run `npm.cmd install`, then `npm.cmd run dev`.
5. Sign in, open **Messages → Group chats → New group**.
6. Create a group; send a message. Refresh: the group and messages should persist in Supabase.
7. To add another member, register/sign in a second test account. Copy its **Auth user UUID** from Supabase Authentication → Users; as the group owner, paste it into the group invitation field and select Add. This version adds immediately; invitations and acceptance are not implemented.

## Security tests to perform
- Unauthenticated user cannot read `message_groups`, `message_group_members`, `message_group_messages`.
- A different signed-in user cannot read another group's rows, even via direct REST queries.
- Non-member cannot insert into `message_group_messages` for that group.
- Member cannot spoof `sender_id` or add a participant.
- Admin/owner can add a registered user; ordinary member cannot.
- The group owner cannot be reassigned through client API.

## Limitations
- Polling every 5 seconds instead of realtime subscription.
- Group participants added by UUID; no username directory or invitations yet.
- No removal, admin promotion, file attachments, read receipts, moderation, message editing, or end-to-end encryption.
- No independent security review or RLS test suite has been run.
- Existing direct messages are still local demos; group messages use Supabase.
- Run `npm.cmd run build` and verify SQL/RLS in a development environment before production.
