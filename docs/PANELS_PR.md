Fixed-width columns could squeeze the conversation/composer and leave uneven spacing. This adds independent, account-scoped width preferences for the feed sidebar, direct-chat list, chat details and group list, with bounded responsive geometry.

Resize using captured pointer gestures or the keyboard; double-click/Enter resets a width and Escape cancels a drag. Rendered widths shrink to preserve the conversation without overwriting the saved preference. Details become an overlay when three columns cannot fit; mobile keeps the existing stacked navigation.

The composer grows with its content and uses a separate actions row in narrow conversations. Headers, profile actions, group states and scroll regions are aligned; the navigation footer has an 18px minimum gap before Create. Group history remains height-bounded in stacked layouts.

This PR is based on the user's already uploaded `feature/layout-emoji-gif` branch. Existing EmojiPicker, GifPicker, GIF routes/validators, media data and dependency configuration are preserved; no duplicate media library, provider setup or database migration is introduced.

Validation: TypeScript and ESLint passed (0 errors, 39 existing image warnings), 70 tests passed, isolated SQL/RLS and secret scan passed, dependency audit returned 0 vulnerabilities, and the Next.js build completed. Tests cover invalid saved widths, desktop/mobile bounds, keyboard changes, primary/foreign pointer isolation, capture release and cancellation. The group regression also checks scoped width persistence while retaining history/pagination/stale-response assertions. Browser checks verified actual feed/list/details resizing and reset, readable narrow composer, the navigation gap and a 390px mobile chat without horizontal overflow.

Cloud CI/preview results will be attached after publication. Keep this PR unmerged pending explicit user approval; no main push or production release is included. See [PANEL_LAYOUT.md](https://github.com/Uneedix/intent-social-agents/blob/agent/lead/panels-media/docs/PANEL_LAYOUT.md).
