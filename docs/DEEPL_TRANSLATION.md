# Conversation translation through DeepL

The conversation toolbar offers an explicit, off-by-default DeepL translation mode for personal chats, local groups, Supabase group chats and community text channels. The user chooses a target language and confirms that loaded and newly received message text in this conversation may be sent to DeepL. Original messages are preserved. Enabling translation automatically loads earlier pages with the existing authenticated Supabase client and RLS. Pages contain at most 100 messages, ordered by timestamp and ID; each pass loads at most 50 pages. If more remain, the toolbar explicitly offers Continue loading history. There is no fixed total-history truncation: each pass resumes from the saved cursor. Switching conversations or stopping translation cancels the loader and ignores pending stale responses. A group with topics loads the complete history of the selected topic; other topics can be translated separately. Local chats already contain their complete device history. Files, photos, audio and GIF payloads are excluded. Translation is paused during history loading to avoid duplicate provider requests as pages arrive. Translations stay only in component memory and are cleared on conversation/account changes or when disabled.

## Preview configuration

Set these server-only environment variables in the intended Vercel **Preview** environment, then rebuild that Preview:

- `DEEPL_API_KEY`: a DeepL API authentication key (Free or Pro). Never prefix it with `NEXT_PUBLIC_`, put it in a browser bundle, paste it into chat, or commit it.
- `DEEPL_API_PLAN`: `free` (default, api-free.deepl.com) or `pro` (api.deepl.com), matching the key's plan.

The route also requires the configured Supabase user session. Guests receive a sign-in notice; no anonymous paid translation proxy is exposed. With no key, the UI shows an honest not-connected message and preserves originals. This change does not create a DeepL account, purchase a plan, configure a real key or contact DeepL with actual conversations.

Before enabling public access, set DeepL account usage/cost limits and, for deployments spanning multiple instances, add a distributed per-user budget. The route's in-memory limit is defence in depth: 30 requests/minute and 200,000 source characters/hour per authenticated user per instance. Each request has at most 50 items, 20,000 total characters and 100,000 UTF-8 bytes; individual messages have at most 10,000 characters. Requests are sequential and contain plain text. Provider quota, auth and availability failures are surfaced without leaking raw responses or credentials. No provider response or message text is logged.

## Provider references

- [DeepL translate text](https://developers.deepl.com/api-reference/translate/request-translation)
- [DeepL authentication](https://developers.deepl.com/docs/getting-started/auth)

The provider request uses a fixed HTTPS endpoint, server-side `DeepL-Auth-Key` authorization, `text[]`, `target_lang` and `preserve_formatting`. The client only receives matched message IDs and translated text; the original message order is preserved. Redirects and oversized responses are rejected. Translation quality is not guaranteed.
