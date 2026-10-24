# INTENT v0.5 — Search, Profile, Settings

This update is based on INTENT Communities v0.4. It does not replace the Supabase communities implementation.

## New features
- Left navigation: Messages now appears immediately before Market (desktop). Mobile navigation remains the existing five-item layout.
- Explore: unified search over available sample/local posts, intentions, people and demo marketplace products; category tabs, popularity/newest sorting, followed-person filter, city filter for marketplace, saved search queries.
- Profile: editable display name, handle, pronouns, bio, location, website, interests, avatar and cover image (image upload capped at 2 MB), separate Posts / Intentions / About tabs.
- Settings: appearance (right sidebar, compact layout, reduced motion), privacy preferences, preferred currency, content languages, notifications, local JSON export and confirmation before resetting local demo state.

## Boundaries
- Search is client-side over content available in the current browser, **not** a global index of Supabase users, communities or listings.
- Profile edits and settings are stored in browser localStorage; they do **not** update Supabase user records or enforce access controls.
- Existing communities and authentication code remains unchanged. Existing RLS policies still determine server access.
- No new SQL migration is required.
- The project has not been built in this environment because npm dependencies were unavailable offline. Run `npm.cmd install` and `npm.cmd run build` on your computer before deploying.

## Install
1. Unzip to a new directory.
2. Copy `.env.local` from your working project; never commit or share it.
3. Run `npm.cmd install`, then `npm.cmd run dev`.
4. Open Explore, Profile and Settings; check Messages before Market in left sidebar.

If you made local changes to v0.4, merge the new `components/Experience.tsx`, `app/page.tsx`, and appended styles in `app/globals.css` instead of replacing those edits.
