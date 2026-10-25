# INTENT design audit (agent/design/polish)

Goal: the app looks like one product. Primitives: `components/ui` (kit). Legacy global classes are brought in line by `app/design.css`, which is imported last in `app/layout.tsx`. It overrides tokens only and changes no markup that other teams own.

## Inventory → decision

| Control | Where | Before | Decision |
|---|---|---|---|
| Primary button `.primary` | page.tsx (Market, ADS, headings), Experience, Composer | 25px radius, padding-based height (36–44px), lifts on hover | 42px pill, white/black, no lift, the same `:active` scale everywhere |
| Outline `.outline` | Experience settings, header Log in, ADS | `#555` border, padding-based height | 42px pill, `#333338` border, `#151517` hover |
| `.pill-btn` (+ `.light/.ghost/.glass`) | PostCard, Market cards, rail Follow | 38px, `#141414` fill | 34px (sm), outline style; `.light` = primary |
| `.danger-button` | delete confirm | red fill | kit `Button variant="danger"` (red text, dark red border) |
| `.icon-button` | everywhere | no hover | 999px radius, `#151517` hover |
| Header Log in / Sign up | AuthStatus | ~32px | 34px sm |
| Account menu `.acct-menu` | AuthStatus | `#141414` / `#2a2a2a` | the shared menu style |
| Post ⋯ `.post-options` | PostCard | `#1a1a20`, `#41414a`, radius 13 | the shared menu style |
| Popovers `.pop` | PostCard share/react, social | `#161616`, radius 14 | the shared menu style |
| Messenger `.ms-pop`, `.ms-menu-list`, `.ms-attach-pop` | Messenger (not editable) | already close | tokens only via design.css |
| Explore `.pop` (CSS module) | explore/* | radius 14 | left as is (already `#141416`/`#2a2a2e`); remaining difference is radius 14 vs 16 |
| Delete post confirm | page.tsx | ad-hoc `.modal-backdrop` | **kit `Modal`** |
| Edit post | page.tsx | ad-hoc | **kit `Modal`** + `inputClass` textarea |
| Share to chat | page.tsx | ad-hoc | **kit `Modal`** |
| List an item | page.tsx | ad-hoc + `.ads-workspace` form | **kit `Modal`** + `Field`; the disclaimer becomes the subtitle; the action is in the footer |
| Composer shell `.modal` | Composer.tsx | `#111`/`#333`, radius 20 | kit look through CSS (blurred backdrop, `#0f0f11`, radius 22; a bottom sheet on phones) |
| Story viewer sheet `.sv-sheet` | Stories | flat | slides up, radius 24 |
| Chips `.chips`, `.modal-types`, `.experience-tabs`, `.ms-chips` | Market, Composer, Search, Messenger | 3 different paddings/colours | 36px (32px on phones), `#0d0d0e`/`#2a2a2e`, active = white |
| Segmented `.switcher` | Home | 12px padding | 42px segments, the same hover |
| Underline tabs `.feed-tabs`, `.community-tabs` | Home, Communities | no hover | hover → white (tokens only) |
| Selects | Market currency, ADS, Settings, Composer, WidgetPanel | native UA chrome | 42px, radius 12, custom chevron, dark options |
| Inputs | ADS, modals | mixed | 46px, radius 12, `#2a2a2e`, focus `#5a5a62` |
| Checkboxes | Settings languages, Communities | UA blue | `accent-color:#fff` |
| Toggle | kit | – | unchanged (kit) |
| Toast `.toast` | page.tsx | static | pill, 14.5px semibold, rises in, sits above the mobile nav on phones |
| Focus | all | inconsistent | one 2px `#5ea0ff` ring for `:focus-visible` |
| Motion | menus/modals/toast | mixed keyframes | `ds-pop` / `ds-sheet` / `ds-toast`; all turned off under `prefers-reduced-motion` |

## Alignment
- `.page-heading`: title and action are top-aligned (the action sits on the title line instead of being centred against the title and subtitle).
- Your activity: 5 stat cards in an `auto-fit` grid, so there is no orphan card on a second row.
- Market controls: margins adjusted to the 4/8 scale.
- Measured (Playwright, `scratchpad/scripts/measure.js`) on 12 pages × 4 viewports: h1 left offset from the main column is 0 on every desktop page (Settings and Profile are inset on purpose, inside their cards). Document horizontal overflow is 0 everywhere, before and after. Card rows differ in height by 0px. The only elements wider than the main column are inside intentional horizontal scrollers (stories, Explore chips, Messenger chips).

## Not changed (owned by others)
Communities.tsx, communities/*, GroupMessages.tsx, Messenger.tsx, MsgParts.tsx, groups/*: these get only the global tokens.
