# INTENT — expanded local prototype v0.2

## Run on Windows PowerShell

```powershell
npm.cmd install
npm.cmd run dev
```

Open http://localhost:3000.

## Included
- Responsive dark Home with Feeds / Intentions tabs, stories preview, posts, reactions, local comments, repost toggles, saves and composer.
- Explore, Intentions, Communities (local join state), Market (local listings, sample catalog and approximate currency display), Messages (local-only chat), Notifications, Profile, Saved, Your activity.
- Instant ADS workspace: campaign drafts, objectives, daily budget, delete drafts. **No real advertising or billing.**
- Advanced Settings: local preferences for privacy, language, messages, mentions, email notifications, demo data export and reset. **These do not enforce server-side access controls.**
- Sidebar toggle and preferred currency.

## Important limitations
This is an **interactive frontend prototype**, not a deployed multi-user social network. All state is stored in the current browser's localStorage; users do not communicate with each other. Images and example profiles are illustrative. No authentication, database, server-side authorization, upload processing, payments, actual ad delivery, messaging transport, moderation or GDPR compliance is implemented. Do not use this for sensitive information or real transactions.

## Recommended production phases
1. Database design (PostgreSQL), authentication, sessions, authorization and Row Level Security.
2. Real profiles, follows, posts, media uploads, comments, reactions, notifications and search.
3. Real-time messaging, community memberships, roles, moderation and reporting.
4. Marketplace: listings, order state machine, payment provider, shipping, currency FX and dispute resolution.
5. Advertising: campaign approval, targeting safeguards, delivery, attribution, billing and fraud prevention.
6. Internationalization, accessibility, privacy/export/deletion workflows, tests, monitoring and security audit.
