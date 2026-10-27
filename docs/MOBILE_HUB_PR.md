# Mobile chat and community update

This update preserves the latest Explore, media, marketplace and group-topic work on the shared Preview branch. It adds explicit multi-person selection for group creation, reorderable chat folders, Home navigation from mobile branding, a mobile post button, a movable and hideable widget launcher with profile restore, owner-confirmed community deletion, and multiple message pins with an audience dialog.

Personal/direct chats and local groups remain device-local: the audience dialog explicitly says other devices are not notified. Shared Supabase group pins are stored on the server and readable only by members. Pins can be removed by the author or a group owner/admin. Personal group pins are account-scoped local preferences.

Community discovery separates owned communities from others. New schema migrations preserve historical files, enforce ownership and RLS, and were applied only to isolated INTENT Preview lrhsncjjwamdgqafzgpj.

Validation: 106 automated tests; TypeScript; ESLint (existing image optimization warnings); isolated PostgreSQL migration and access-control suites; secret scan; npm dependency audit. Hosted ephemeral tests verify shared pins, membership boundaries and exact owner deletion, with cleanup of all three run-owned accounts.

Production and main are not updated. This PR records the feature Preview work for review.
