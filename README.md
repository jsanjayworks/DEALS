# YOLO Deals

Hyperlocal deals marketplace for Bengaluru. One Expo app carries both the
customer and merchant modes; a Next.js admin console comes later.

Designs started from a Figma Make export (`docs/design/figma-make/index.css`,
plum and lime). The app now ships **teal + marigold**: every colour resolves
through `src/theme/tokens.ts`, which holds five main colours and six accents,
selected by `ACTIVE_PALETTE` and `ACTIVE_ACCENT`. The Figma palette is kept as
`plum`. In a development build on web, `?palette=blue&accent=coral` on the URL
previews any pairing; comparisons are in `docs/design/palette-options*.png` and
`docs/design/accent-options.png`.

---

## Where this is right now

**The whole app works end to end on the local adapter**, on phones and in a
desktop browser from one codebase:

- **Customers** browse, search, filter by category and subheading, claim or book a deal, show the code at the counter, and cancel.
- **Merchants** create deals in a seven-step wizard, submit them, redeem codes and read their insights.
- **Admins** approve or reject submissions.

The app runs on either backend: the in-memory seed (no setup) or Supabase, with
sign-in by email or phone code. The remaining list, in build order, is
[`docs/CHECKLIST.md`](docs/CHECKLIST.md), and UI/UX quality is scored in
[`docs/UX-SCORECARD.md`](docs/UX-SCORECARD.md) (baseline 73/100).

### Done

| Area | Files | State |
|---|---|---|
| Database schema | `supabase/migrations/0001_init.sql` | 30 tables, enums, indexes, partitioned `deal_events`, lifecycle transition table |
| Business logic | `supabase/migrations/0002_functions.sql` | All five PRD engines as `SECURITY DEFINER` RPCs |
| New-user profiles | `supabase/migrations/0004_new_user_profiles.sql` | Trigger on `auth.users` creates the `profiles` row at sign-up |
| Merchant onboarding | `supabase/migrations/0006_merchant_onboarding.sql` | `create_business`; YOLO Verified requests with GSTIN (check digit), or PAN plus Udyam / Shop & Establishment / trade licence, FSSAI for food; admin queue; direct writes to `businesses` closed |
| Scheduled jobs | `supabase/migrations/0005_cron.sql` | pg_cron: activate and expire deals every minute, analytics rollup, partitions. Skipped where pg_cron is absent |
| Security | `supabase/migrations/0003_rls.sql` | RLS on every table, plus table-level write lockdown routing all writes through RPCs |
| Seed SQL | `supabase/seed.sql` | Generated from the TypeScript seed by `npm run gen:seed`. Not a migration, so Supabase never applies it to production |
| Backend tests | `supabase/local/0{1,2}_*.sql` | **176 assertions, all passing** against Postgres 16.4 + PostGIS 3.4.3; the migrations and seed also apply cleanly on the Supabase CLI stack (Postgres 17) |
| Domain types | `src/data/types.ts` | Field names mirror the SQL one-to-one |
| Mapping layer | `src/data/mapping.ts` | SQL `deal_card` row ↔ nested `DealCardModel`, both directions |
| Data contract | `src/data/api.ts` | The single interface every screen will call |
| Local adapter | `src/data/local.ts` | In-memory, enforces the same rules as the SQL |
| Supabase adapter | `src/data/supabase.ts` | Every `DataSource` method over the RPCs; `P0001`/`42501` errors become `RuleViolation`s |
| Auth | `src/data/supabase.ts`, `src/app/sign-in.tsx` | Email or phone one-time code, session in AsyncStorage, refresh while foregrounded, sign-out |
| Backend switch | `src/data/index.ts` | Supabase when `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are set, otherwise the local seed |
| Lifecycle | `src/domain/lifecycle.ts` | Mirror of `deal_transitions` |
| Ranking | `src/domain/ranking.ts` | Mirror of `deal_score()` — same 8 weights |
| Action rules | `src/domain/rules.ts` | Mirror of `take_deal_action()` eligibility |
| NL search | `src/search/parser.ts` | Rule-based parser, no API key needed |
| Seed content | `src/data/seed-*.ts` | 10 localities, 34 categories (7 top-level), 32 businesses, 59 live deals + pipeline/queue deals |
| Taxonomy facets | `categories.attribute_schema` | `x-facet` attributes (cuisine, BHK, furnishing, vehicle) become category subheadings |
| Design tokens | `src/theme/tokens.ts` | Palette and accent system, Inter scale, chart colours validated for colour-blind separation |
| Component library | `src/components/` | Line icon set, Button, Chip, Badges, Price, DealCard (4 variants with hover), Glass, Sheet (dialog on wide screens), RollingNumber, layout primitives |
| App chrome | `src/ui/` | Responsive layout hook, scroll-aware header and floating tab bar |
| Customer screens | `src/app/` | Home, Search, Results, Category, Deal detail, My Deals, Profile, Notifications |
| Merchant mode | `src/app/merchant/`, `src/merchant/` | Dashboard, deals, 7-step wizard, deal lifecycle, redeem, insights |
| Admin | `src/app/admin/` | Review queue: approve, or reject with a reason |
| Claim flow | `src/deal/ClaimSheet.tsx` | Quantity, IST slots, eligibility preflight, code and QR |
| Search UI | `src/search/` | Parser, filter sheet, data-driven subheadings (`facets.ts`) |
| Session | `src/state/session.ts` | Account, locality, radius, recent searches; persisted |

`npm run typecheck`, `npm run lint` and `npm run db:verify` all pass. A browser run
against the local Supabase stack covers sign-in, claim, My Deals, merchant redeem
and admin approval end to end.

### Bugs the test suite caught

Worth recording, because all three would have shipped silently and two were
security holes:

1. **A customer claiming the last unit could not sell the deal out.**
   `take_deal_action` expired the deal via `transition_deal`, which re-derives
   the actor from the session — and a customer may not move deals. Same flaw
   broke `review_deal`'s `PUBLISHED → ACTIVE` step. Fixed by splitting the
   trusted core (`transition_deal_internal`, never granted to clients) from the
   public wrapper that resolves the real actor.

2. **`deals.status` was writable by any authenticated user.** Column-level
   `REVOKE UPDATE (status)` is a no-op while a table-wide `UPDATE` grant
   exists, and Supabase grants exactly that by default. The lifecycle could
   have been bypassed entirely. Fixed by revoking table-level writes on `deals`
   and `customer_actions` and granting nothing back — every write goes through
   an RPC.

3. **A customer could make themselves an admin.** `profiles_self_write` allowed
   updating any column of your own row, including `is_admin` and
   `is_yolo_verified`. Fixed by revoking `UPDATE` on `profiles` and granting
   back only the fields a person legitimately edits.

Wiring against Supabase and merchant onboarding found six more, all fixed and now under test:

4. **Anyone could read unpublished deals** through the `deal_card_base` view,
   which ran with its owner's rights. It is now `security_invoker`.
5. **`get_deal` returned drafts and submissions** to any caller who knew the id.
   It now checks visibility: live deals, your own business, admins, or a deal
   you already acted on.
6. **`merchant_stats` answered for any business.** It now requires membership.
7. **Any signed-in customer could add themselves to any business** through the
   `business_members` insert policy. Only existing members and admins can now.
8. **Anyone could insert a business already marked verified**, and
9. **an owner could verify or rate their own business**: `businesses` kept
   Supabase's table-wide write grants. Creation now goes through
   `create_business()` and only contact fields are editable (0006).

### Not done yet

- **Production auth setup.** Phone codes need an SMS provider (Twilio,
  MessageBird, Vonage or Textlocal) under Authentication → Providers → Phone.
  Email codes need the two templates in `supabase/templates/` pasted into
  Authentication → Email Templates (the CLI's `config.toml` only covers local).
- Deal media upload (Storage bucket) and device location.

---

## Running it

```bash
npm install
npm run typecheck     # tsc --noEmit
npm run db:up         # start the local PostGIS container (once)
npm run db:verify     # rebuild the schema, then run 176 assertions
```

| Command | What it does |
|---|---|
| `npm run db:up` | Starts `postgis/postgis:16-3.4` on port 55432 |
| `npm run db:reset` | Drops and rebuilds the schema, applying every migration in order |
| `npm run db:test` | Runs the two SQL suites (needs a freshly reset database) |
| `npm run db:verify` | `db:reset` then `db:test` — the one to use |
| `npm run gen:seed` | Regenerates `supabase/seed.sql` from `src/data/seed-*.ts` |

The seed's dates are relative to generation time, so the Today and Ending Soon
rails go stale after a few days — rerun `npm run gen:seed`.

`supabase/local/` is test scaffolding only. It fakes the `auth` schema and the
`anon` / `authenticated` roles that Supabase provides for real, so
**never run it against the real project**.

### Against the Supabase CLI stack

Needs Docker. This runs the real Auth, PostgREST and Postgres locally, applies
`supabase/migrations/` and then `supabase/seed.sql`:

```bash
npx supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor,realtime,storage-api,postgres-meta
npx supabase db reset      # reapply migrations + seed
npx supabase status        # prints the API URL and publishable key
```

Start the app pointed at it:

```bash
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key from status> npx expo start
```

Sign in with `customer@yolodeals.in`, `merchant@yolodeals.in` or
`admin@yolodeals.in`; the code arrives in Mailpit at http://127.0.0.1:54324.
Stop the stack with `npx supabase stop`.

### Against the hosted project

The Supabase GitHub integration applies `supabase/migrations/` when `main`
changes, if "Deploy to production" is on. It never runs `seed.sql`, and nobody
should run it there by hand. Only the publishable key belongs in
`EXPO_PUBLIC_` variables — never the secret or service-role key.

---

## Architecture notes worth keeping in mind

**Two adapters, one contract.** Screens import from `src/data` and call the
`DataSource` interface. `local.ts` serves the seed with no network; `supabase.ts`
calls the RPCs. `src/data/index.ts` picks one from the environment, and no screen
changes.

**The mirrors must stay in step.** Four pairs of files deliberately duplicate
logic across SQL and TypeScript, so the app behaves the same with or without a
database:

| SQL | TypeScript |
|---|---|
| `deal_transitions` table | `src/domain/lifecycle.ts` |
| `deal_score()` | `src/domain/ranking.ts` |
| `take_deal_action()` checks | `src/domain/rules.ts` |
| `deal_card` composite | `DealCardRow` in `src/data/mapping.ts` |

Change one side, change the other.

**The database owns the lifecycle.** `deals.status` has `UPDATE` revoked from
`anon` and `authenticated`, so a deal can only move through `transition_deal()`,
which checks the transition table and the caller's real role. Same for
`capacity_remaining`, which only `take_deal_action()` decrements, under a row
lock, so two people cannot both claim the last unit.

**Events are transactional.** Every state change writes an `outbox_events` row
in the same transaction as the data. Phase 2 points Debezium at that table and
gets Kafka topics with no schema change.

---

## Store submission reality

Shipping to both stores is not a same-day operation, regardless of how fast the
build goes:

- Apple review is typically 24 hours or more after upload.
- A **new personal** Google Play account must run a closed test with 12 testers
  for 14 days before it can go to production. An organization account skips this.

What is achievable quickly once the UI exists: a working build on a real device
through Expo Go, then TestFlight and Play internal testing via `eas build`.
