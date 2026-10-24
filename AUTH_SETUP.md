# INTENT — Supabase authentication update

## Install

1. Unzip this archive to a NEW folder. Do not copy your `.env.local` into a public repository.
2. Copy your existing `.env.local` from your current local INTENT project to the root of the updated project. Or copy `.env.example` to `.env.local` and fill in your own URL and **publishable** key.
3. Run `npm.cmd install` and `npm.cmd run dev` in VS Code.
4. Visit `/register`, `/login`, `/forgot-password`, `/reset-password`.

## Supabase dashboard

- Authentication > Sign In / Providers: Email and Confirm email enabled.
- Authentication > URL Configuration: Site URL `http://localhost:3000`; Redirect URLs include `http://localhost:3000/**` (development only).
- In Auth email templates, default confirmation links usually point to Supabase's verification endpoint and redirect to the requested `emailRedirectTo`; `/auth/callback` exchanges a PKCE code when provided. If customizing templates to use token hashes, target `/auth/confirm?token_hash={{ .TokenHash }}&type=signup` (recovery: `type=recovery`).
- Default Supabase SMTP has rate limits; production requires configured email delivery and proper domain URLs.

## What works

- Supabase email/password registration, login, logout, password reset request and authenticated password update.
- Cookie-based browser auth with `@supabase/ssr`, middleware session refresh, server client helper, auth callback routes.
- Logged-in account shown in the existing header; existing UI preserved.

## What is NOT implemented

- Existing localStorage demo posts/chats/communities are not connected to Supabase.
- No community creation, RLS migration, email template testing, production deployment, passkeys or MFA in this update.
- Auth callbacks and security have NOT been end-to-end tested against your actual Supabase project; do not deploy without testing.
- This is not an independent security audit. Never use secret/service-role keys in NEXT_PUBLIC_ variables.

## Testing checklist

1. Register with an email you control; verify confirmation arrives.
2. Click confirmation link and log in. Check header shows your email prefix.
3. Reload and verify session persists; log out and verify it disappears.
4. Request password reset, follow link, set new password, log in again.
5. Verify unconfirmed users cannot log in (with confirmation enabled).
6. Verify Supabase > Authentication > Users shows the registered account.

## Files added/changed

- Added `lib/supabase/client.ts`, `lib/supabase/server.ts`, `middleware.ts`.
- Added `app/auth/callback/route.ts`, `app/auth/confirm/route.ts`.
- Added auth pages and `components/AuthForm.tsx`, `components/AuthStatus.tsx`.
- Modified `app/page.tsx`, `app/globals.css`, `package.json`.
- Added `.env.example`, `.gitignore`.
