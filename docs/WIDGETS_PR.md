The feed's right column currently contains fixed recommendations. This adds a configurable personal widget panel on Home while preserving the existing sidebar on other sections.

Users can add, collapse, reorder and remove eight working widget types: calendar/events, tasks, notes, focus timer, countdown, daily reference exchange rates, quick links and goal tracking. Searchable presets for study, research and work add missing tools without replacing personal content. Removing a widget asks for confirmation before deleting its local content.

The same panel opens in a focus-managed mobile drawer below the sidebar breakpoint. State is isolated by the existing account-scoped local storage and validated before rendering. It is stored on this device, not synchronized across devices. The calendar is local only, as explicitly chosen by the user; no Google OAuth configuration or permissions are added.

The public rates route fetches only a fixed Frankfurter v2 endpoint, restricts currencies, pins the requested UTC date, bounds response size/time, validates the complete payload and returns safe errors without fabricated fallback quotes. The card shows the observation date and source.

Validation results and the verified preview will be appended after the integrated checks finish. Regression coverage includes damaged persisted state, account switching, additive presets, ordering, timer drift, unsafe links, catalog keyboard interactions and upstream error boundaries. Existing image optimization warnings are tracked rather than suppressed.

This PR is stacked on `chore/agent-workflow` because the initial infrastructure PR is still unmerged. No new dependencies, database migrations, production changes or merge are included. See [FEED_WIDGETS.md](https://github.com/Uneedix/intent-social-agents/blob/agent/lead/feed-widgets/docs/FEED_WIDGETS.md) for behavior and future extensions.
