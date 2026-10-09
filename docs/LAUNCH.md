# Launch: production

Goal: the real YOLO Deals on the web, on the production Supabase project.
Merchants sign up by voice and post live deals; customers find, book and
rate them; the app learns from activity only with consent. A labelled
"Explore the demo" mode stays for people who want to see how it works; it
runs on sample data in the visitor's own browser and never touches the real
database. Phone apps come after.

Status (2026-10-08): migrations 0001–0020 written and tested (410 database
checks across six suites, including RLS), and applied cleanly to a local
Supabase stack (Postgres 17). An independent review of 0016–0019 found two
critical holes and about fifty smaller ones; 0020 and the app fix them. The
app runs on the real backend when it is configured. What is left needs the
owner's accounts and details.

## Owner (only you can do these)

- [ ] **1. Production keys** (5 min). Dashboard → Project Settings → API. Put the Project URL and the *publishable* key in `.env.production.local` (copy `.env.example`; git-ignored); the build reads them from there. Never use the secret or service_role key anywhere in the app.
- [ ] **2. Push the database** (15 min). The GitHub integration did not deploy before, so use the CLI in your own terminal (it asks for the database password):
  ```
  npx.cmd supabase login
  npx.cmd supabase link --project-ref <your-project-ref>
  npx.cmd supabase db push --dry-run     # read the list: 0001 … 0020
  npx.cmd supabase db push
  ```
  Then mark it as production, once, in Dashboard → SQL Editor. The deploy refuses until this is done, and the sample seed refuses to run on a marked database:
  ```sql
  insert into app_settings (key, value) values ('environment', 'production');
  ```
  If you later put the project behind a custom domain, also add `('storage_origin', 'https://<that domain>')` so photos uploaded through it are accepted.
  **Never** run `db push --include-seed`, `db reset --linked` or `config push` against production: the seed has demo accounts (one is an admin) and sample businesses. Seeding is off in `config.toml`, and `seed.sql` refuses to run on a marked database or one that has accounts, but do not test that. Afterwards check Database → Migrations lists 0001–0020, Database → Cron has the jobs, Storage has `deal-photos` and `avatars`, and run Advisors → Security.
- [ ] **3. Sign-in by number (testing phase)** (5 min). While employees test, a mobile number alone signs in: no code, no password; a new number asks for a name and makes the account. In Supabase: Authentication → Providers (Sign In / Providers) → **Phone**: turn it on; choose **Twilio** and fill in placeholders (Account SID `AC00000000000000000000000000000000`, Auth Token `placeholder`, Message Service SID `MG00000000000000000000000000000000`); turn **off** "Enable phone confirmations" (Confirm phone); Save. No text is ever sent while confirmations are off. Anyone who types a number opens that account, the admin's included, so keep the site to testers.
  **Before real customers (end stage):** real SMS provider and confirmations on, `EXPO_PUBLIC_SIGNIN=phone`, and clear the testing passwords in the SQL Editor: `update auth.users set encrypted_password = null where phone is not null;`
- [ ] **3b. Phone codes for launch** (you chose phone OTP). In India real SMS needs DLT registration (Principal Entity, a 6-character sender header and an OTP template; days to weeks) and a provider: Twilio Verify works with Supabase directly; MSG91 needs the Send SMS hook. Then Authentication → Providers → Phone: on, with the provider. **Until then** add test numbers with fixed codes under Phone → Test phone numbers so you and the employer can sign in, or set `EXPO_PUBLIC_SIGNIN=phone,email` to offer email codes too (email needs step 4).
- [ ] **4. Email codes, if offered** (30 min). Brevo or Resend with a verified sender domain (SPF, DKIM). Authentication → SMTP Settings; paste both files from `supabase/templates/` into Email Templates; set Email OTP length to 6.
- [ ] **5. Auth URLs** (10 min). Authentication → URL Configuration: Site URL = the live address, and add it to Redirect URLs. Leave **captcha off** under Attack Protection: the sign-in form does not send a captcha token yet, so turning it on stops every sign-in. Keep Supabase's default rate limits for sign-in codes. (Turnstile in the sign-in form is on the after-launch list.)
- [ ] **6. Business details** (10 min). Fill `src/lib/legal.ts`: operator, address, support email, grievance officer and email. The deploy refuses to run while any is empty. Have a lawyer read `/legal/privacy` and `/legal/terms`.
- [ ] **7. Server settings for the website** (10 min). The website's server (the voice assistant at `/api/assist`) reads only the EAS production environment, never `.env` files on your computer. It needs one AI key: **Groq** (free tier, no card: console.groq.com → API Keys; turn on Zero Data Retention under Settings → Data Controls) or **Anthropic** (a dedicated workspace with a monthly spend limit; used instead of Groq when set). Then run these in your own terminal (each asks for the value; never paste the key in chat or in a committed file):
  ```
  npx.cmd eas-cli@latest env:create --name GROQ_API_KEY --environment production --visibility sensitive
  npx.cmd eas-cli@latest env:create --name EXPO_PUBLIC_SUPABASE_URL --environment production --visibility plaintext
  npx.cmd eas-cli@latest env:create --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --environment production --visibility plaintext
  ```
  (Or `--name ANTHROPIC_API_KEY` for Claude.) Use `sensitive`, not `secret`: EAS Hosting cannot read secret variables. Groq's free tier allows about 1,000 voice requests and 200,000 tokens a day; beyond that, or without a key, voice uses the built-in rules. Without the two Supabase values the voice assistant refuses everyone rather than run unchecked. Only signed-in people can use voice, within a daily allowance (migration 0017).
- [ ] **8. Deploy** (10 min). `npm run deploy:web`. It refuses unless the key works, the database is on migration 20 and marked as production, and the privacy details are filled in. It builds in production mode (it will not run as the demo by accident), deploys with only the EAS production environment, then checks that `/api/assist` refuses callers who are not signed in.
- [ ] **9. Make yourself admin** (2 min). Sign up on the live site, then in the SQL Editor, by your login's id (a profile email can be edited, so never grant by it):
  ```sql
  update profiles set is_admin = true
  where id = (select id from auth.users where phone = '91XXXXXXXXXX');   -- or: where email = 'you@…'
  ```
  Add a second admin so the review queue is always covered.
- [ ] **10. Go-live rule** (your choice: live once verified). A new merchant's deals wait until you verify the business (Admin → Businesses); then they all go live at once, and later deals go live the moment they are posted. Admins get an in-app notification for every deal or business to review.
- [ ] **11. Plan**. Move the project to Supabase Pro before real merchants join (daily backups, no pausing). Set usage alerts on Supabase, EAS and the AI provider.
- [ ] **12. Payments**. Launch is pay-at-the-shop: customers get a code and pay the merchant. For Razorpay (free test mode, no KYC for test keys), share the decision and Claude builds order creation, signature checks and refunds; live keys need Razorpay's KYC.

## What the database now does (0016–0020)

- Shop pages: every voice- or form-captured detail is stored (about, hours, cost for two, amenities, cuisines, menu, photos, pin); photos only from YOLO's storage or the sample library.
- Go-live: verified business → live on submit; unverified → waits, admins told; verifying the business publishes its waiting deals; a deal YOLO paused after reports goes back through review.
- Alerts: merchants are notified of every new order, booking, enquiry and cancellation; customers of their confirmation and, after the visit, asked to rate it. Notifications stream live to open apps.
- Honest payments: the app cannot mark an order paid; only a verified gateway can. "Buy now" gets a code like a claim.
- Reviews: only for a redeemed visit, one per deal, averages kept by trigger, kept after a deal ends, first name and initial shown.
- Activity and consent (DPDP Act 2023): a consent ledger per purpose; activity linked to a person only with their consent and 18+; "not for me"; "clear my activity"; erasure on withdrawal and on account deletion; 180-day retention.
- Voice: signed-in only, with a daily allowance per person.
- Hardening: profiles cannot be inserted by clients, activity partitions are locked, a deal's details change only in draft, the deletion mark and date of birth cannot be changed by their owner, storage folders are not listable, and the seed refuses to run outside a local database.
- Review fixes (0020): only a signed-in member or admin, or the server itself, moves deals (the public key alone cannot); a deal YOLO paused or turned down keeps a needs-review mark that copies inherit, so it cannot be resumed or published without review; only complete deals go out, and one whose dates passed while it waited goes back to its owner; photos only from this project's storage, in the shop's own folder, or the sample library, deal photos included; a business cannot review itself, and the reviews table cannot be read directly; activity needs a session when signed out, counts only live deals and is limited per network address; one open enquiry per deal, taking no stock; a date of birth under 18 erases what was learned; "not for me" survives a change of consent; taste also learns from shop pages and searches; `schema_version()` and `is_production()` for the deploy.

## After launch

- [ ] Razorpay test mode, then live after KYC; payouts with Razorpay Route
- [ ] Cloudflare Turnstile in the sign-in form (send `captchaToken`), then turn captcha on in Supabase
- [ ] Push notifications (phone builds), and email alerts to merchants from the outbox
- [ ] Account deletion: an Edge Function that removes the login after the grace period
- [ ] Staff logins for counter staff; merchants replying to enquiries and reviews
- [ ] Flash deals by voice, weekly merchant briefing, voice reviews with aspects
- [ ] One recommender in SQL for Home, voice and notifications; pgvector "similar nearby"
- [ ] Phone apps: EAS builds with a native speech recogniser
