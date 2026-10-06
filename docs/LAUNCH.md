# Launch day: website

Goal: the customer site and merchant login live on the web, on the real
Supabase project, with real deals. Phone apps come after.

Status (2026-10-06): the build side is done and tested for all four user
types (241 database checks; 13 browser test runs on demo data and the local
Supabase stack; lint and typecheck clean; a UI/UX review on phone and desktop
with its fixes in). What is left needs the owner's accounts and details, then
one push and one deploy command. The full checklist with the end-to-end test
script is in the shared deployment doc.

## Owner (only you can do these)

- [ ] **1. Production Supabase keys** (5 min). Dashboard → Project Settings → API. Put the Project URL and the *publishable* key in `.env.production.local` (copy `.env.example`; the file is git-ignored). Never use the secret or service_role key there.
- [ ] **2. Database deploy path** (10 min). Integrations → GitHub: confirm the project is linked to `jsanjayworks/DEALS` with "Deploy to production" on for `main`. If it is not, run `npx supabase link` yourself (it asks for the database password), then `npx supabase db push`.
- [ ] **3. Expo account** (5 min). Sign up at expo.dev (free), then in the project folder: `npx eas-cli@latest login`, then `npx eas-cli@latest init` once (it adds the project id to `app.json`).
- [ ] **4. Business details** (10 min). Fill `src/lib/legal.ts`: operator name, address, support email, grievance officer's name and email. The deploy refuses to run while any is empty, and the privacy and terms pages show a draft warning until then. Have a lawyer review the two pages when you can.
- [ ] **5. Say "push"**. Claude commits and pushes to `main`; the GitHub integration applies migrations 0001–0013 to production (reference data, search, taste, deal photos, reports queue, business details, support threads). Check Database → Migrations shows them.
- [ ] **6. Email sign-in codes** (30 min). Create a free Brevo or Resend account and verify a sender address. Supabase → Authentication → SMTP Settings: host, port, user, password, sender. Paste the two templates from `supabase/templates/` into Authentication → Email Templates. Without this, Supabase sends 2 emails an hour, only to team addresses.
- [ ] **7. Phone sign-in off** (2 min). Authentication → Providers → Phone: off. The app shows email only unless `EXPO_PUBLIC_PHONE_SIGNIN=on`.
- [ ] **8. Deploy** (10 min). `npm run deploy:web`. The first run asks you to pick the site's address (`<name>.expo.app`); run it in your own terminal so you can answer. Later runs can be done by Claude.
- [ ] **9. Auth URLs** (5 min). Authentication → URL Configuration: Site URL = the new address; add it to Redirect URLs.
- [ ] **10. Make yourself admin** (2 min). Sign up on the live site, then SQL Editor: `update profiles set is_admin = true where email = 'you@…';`
- [ ] **11. Real deals**. Fill a copy of `docs/import-template.csv`, run `npx -y tsx scripts/import-deals.mts deals.csv > import.sql`, paste `import.sql` into the SQL Editor and run it. Or have merchants sign up through "List your business" and approve their deals.
- [ ] **12. Read deletion requests**. Account deletions arrive as support tickets (Admin → Support inbox). Remove the login in Authentication → Users within a few days, as the privacy policy promises.
- [ ] **Own domain (later)**. A custom domain on EAS Hosting needs a paid plan. Launch on `.expo.app` first.

## Build (done)

- [x] Deal photos: merchants upload their own (Supabase Storage, `deal-photos` bucket, only members of the business can write; migration 0010) or search the photo library. A deal without its own photo gets one matched to its title, never a blank card or a generic one
- [x] Photo library: 309 free Unsplash photos across 103 topics (dishes, services, vehicles, property…), each checked by eye; matching tested on 120 real and sample titles
- [x] Sign-in: email only; phone behind `EXPO_PUBLIC_PHONE_SIGNIN=on`
- [x] Privacy policy and terms (`/legal/privacy`, `/legal/terms`), linked from sign-in, Profile and business sign-up
- [x] Web build: server output so shared links like `/deal/<id>` open directly; page title, description, theme colour; new blue-and-gold icon set (`docs/design/icon-options.png`, option 2)
- [x] `npm run deploy:web`: refuses to build without production keys, with a local or secret key, or with empty business details, and checks the bundle points at production
- [x] Deal importer (`scripts/import-deals.mts`) with matched photos, group sizes and vehicles; safe to run twice
- [x] Form fields are now labelled for screen readers
- [x] UI/UX review of every user type on phone and desktop: maps and chat open in a new tab, share copies the link, booking skips days with no times left, searches widen to the whole city when needed, card titles and buttons are never cut off, clearer quantities and Buy Now wording, larger tap areas on the website
- [ ] Smoke test on the live site after step 8: sign up, list a business, create a deal with a photo, approve it, claim it, redeem it, search, group and vehicle filters

## After launch

- [ ] Google sign-in (needs the live privacy page and domain for the consent screen)
- [ ] Crash reporting (Sentry)
- [ ] Account deletion: Edge Function to remove the login automatically
- [ ] Own domain
- [ ] Device location, push notifications, QR scanning
- [ ] Phone apps: EAS builds, store listings, TestFlight and Play testing
