# INTENT — deployment checklist

This archive contains the restored v0.6 project and fixes for the previously reported Next.js client directive and Supabase cookie callback TypeScript errors.

## Local setup (Windows PowerShell)
1. Extract this folder; open `intent-starter` in VS Code.
2. Copy `.env.example` to `.env.local` and fill in your own Supabase project URL and publishable key. Do not commit `.env.local`.
3. Run `npm.cmd install`, `npm.cmd run build`, then `npm.cmd run dev`.
4. Apply the required SQL migrations in `supabase/migrations` to a **test** Supabase project after reviewing and backing up the database. Follow the included setup documents. Migration execution and RLS security have not been independently verified.
5. Run `npm.cmd audit` and resolve reported advisories before public launch. Do not blindly run `npm audit fix --force`.

## GitHub
Create a **private** empty GitHub repository. In the project directory run:
```
git init
git branch -M main
git remote add origin https://github.com/Uneedix/intent-social.git
git add .
git status
```
Ensure `.env.local`, `.next`, and `node_modules` are not staged. Inspect `.env.example` and any other files for secrets before committing.
Then run `git commit -m "INTENT initial release"` and `git push -u origin main`.

## Vercel
Import the GitHub repository into Vercel. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in project environment variables. Set the Supabase Authentication Site URL and allowed redirects for your final HTTPS domain; keep localhost for development. Test email signup, confirmation, sign-in, sign-out, password recovery, communities, and group messages with multiple accounts before opening public access.

## Validation status
Source files and ZIP structure were checked; the package installation/build could not be completed in this environment because npm dependency installation timed out. This archive is not a guarantee of a passing build or secure production deployment.
