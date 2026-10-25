# INTENT design system

Shared primitives live in `components/ui` (Button, Modal, Field, Choice, Toggle, Menu). Use them for every button, popup, dropdown and form so the app looks like one product.

## 2. Design system (use exactly)
- Page background `#000`/`#050505`; card `#0b0b0c`; card border `1px solid #1f1f22`; raised surface `#141416`; hover `#151517`.
- Text `#fff`; secondary `#a5a5ab`; muted `#8d8d93`; link-ish accent only `#5ea0ff` / `#9cc3ff` (sparingly). Danger `#ff6b6b`. Online dot `#2ecc71`.
- Radius: cards 18–20px, inner tiles 12–14px, pills/chips 999px.
- Chips (filters/tabs): height 36px (32px on phone), padding 0 15px, border `1px solid #2a2a2e`, bg `#0d0d0e`; **active = white bg, black text**.
- Primary button: white pill, black bold text. Outline button: transparent, `1px solid #333338`, white text.
- Page title h1: 40px desktop, weight 700, letter-spacing −0.03em; subtitle 16px `#a5a5ab`.
- Verified badge: lucide `BadgeCheck` with `fill="#fff" color="#000"`.
- Icons: lucide-react only, 20–24px, stroke default.
- Font: inherited (Inter is loaded). Spacing scale 4/8/12/16/20/24/32.
- Prefix every CSS class you create with your area prefix (see §6) so nothing collides. Put CSS in your own file under `app/` — never edit `globals.css`, `social.css`, `header.css`, `messenger.css`, `polish.css`, `stories.css`.

## 3. Symmetry & proportion rules (the owner explicitly demands this — it will be measured)
- Grids: equal column widths, equal gaps; cards in one row have identical heights (use CSS grid + `align-items:stretch`; push footers to bottom with flex).
- Left and right page gutters equal; content edges align to one vertical line; rail cards same width and gap.
- Icons vertically centred with their labels; avatars, buttons and text in a row share one centre line.
- Images use fixed aspect ratios (`aspect-ratio` + `object-fit:cover`) so cards never jump.
- Long text never overflows: ellipsis or clamp. Test all 8 languages (English, Русский, Українська, Polski, Magyar, Deutsch, Français, Español) — switch with `localStorage.setItem('intent-language', JSON.stringify('Русский'))`.
- Verify with a Playwright script that measures bounding boxes (row heights equal within 1px, centres aligned within 2px, `scrollWidth <= clientWidth` for containers, no element wider than the viewport on phones).

## 4. Product & honesty rules (non-negotiable — from the owner)
- Work with the existing project; don't rewrite unrelated code; don't remove functionality.
- **Demo content** (sample people, posts, listings, communities, notifications) may carry plausible invented numbers (likes, members, ratings, views) — the owner asked for this. Keep all demo data in your own `lib/demo/<area>.ts` file, clearly commented as illustrative demo data. **Content created by the real user shows only real counts** (never a fake rating/likes on the user's own listing or post).
- Do not present stubs as working features. If something needs a backend that doesn't exist (payments, delivery, calls, push, global search, real moderation), the button either works locally and says so, or shows a short honest toast ("… is not available yet").
- No fake payment flows, no fake delivery options or prices, no self-made money holding/escrow. Payment status never changes from client requests. No JS float as source of truth for money (prices in whole złoty integers are fine for display).
- Never claim end-to-end encryption. Never translate private messages automatically. Never use private messages, sensitive data or exact geolocation for ad targeting; no ads inside private chats.
- Never store passwords, card numbers or CVV. Don't log tokens/passwords/private message content.
- Security is server-side: never rely on hidden buttons or client checks as protection.
- Don't mark a language as fully supported unless translated; add every new UI string to your i18n file (§5).

