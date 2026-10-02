# YOLO Deals

Hyperlocal deals marketplace for Bengaluru. One Expo app carries both the
customer and merchant modes; a Next.js admin console comes later.

Designs come from Figma Make; the token source is committed at
`docs/design/figma-make/index.css` and `src/theme/tokens.ts` is derived from it.

**A naming trap worth knowing about.** The Figma tokens kept their original
teal-era *names* after the palette moved to plum, lilac and lime.
`--color-aqua` is plum `#4B1D6B`. `--color-citrus` is lime `#C8EB2A`.
`--color-seafoam` is lilac. Nothing in the palette is aqua or seafoam any more.
`tokens.ts` renames them semantically (`brand`, `cta`, `surfaceSoft`) and notes
the mapping on each one.

---

## Where this is right now

**Backend foundation and the mapping layer are in place. No UI yet** — screens
are waiting on the Figma designs, and the data layer is built so they can be
dropped straight on top.

### Done

| Area | Files | State |
|---|---|---|
| Database schema | `supabase/migrations/0001_init.sql` | 30 tables, enums, indexes, partitioned `deal_events`, lifecycle transition table |
| Business logic | `supabase/migrations/0002_functions.sql` | All five PRD engines as `SECURITY DEFINER` RPCs |
| Security | `supabase/migrations/0003_rls.sql` | RLS on every table, plus table-level write lockdown routing all writes through RPCs |
| Seed SQL | `supabase/migrations/0004_seed.sql` | Generated from the TypeScript seed by `npm run gen:seed` |
| Backend tests | `supabase/local/0{1,2}_*.sql` | **110 assertions, all passing** against Postgres 16.4 + PostGIS 3.4.3 |
| Domain types | `src/data/types.ts` | Field names mirror the SQL one-to-one |
| Mapping layer | `src/data/mapping.ts` | SQL `deal_card` row ↔ nested `DealCardModel`, both directions |
| Data contract | `src/data/api.ts` | The single interface every screen will call |
| Local adapter | `src/data/local.ts` | In-memory, enforces the same rules as the SQL |
| Lifecycle | `src/domain/lifecycle.ts` | Mirror of `deal_transitions` |
| Ranking | `src/domain/ranking.ts` | Mirror of `deal_score()` — same 8 weights |
| Action rules | `src/domain/rules.ts` | Mirror of `take_deal_action()` eligibility |
| NL search | `src/search/parser.ts` | Rule-based parser, no API key needed |
| Seed content | `src/data/seed-*.ts` | 10 localities, 30 categories, 32 businesses, 56 live deals + pipeline/queue deals |
| Design tokens | `src/theme/tokens.ts` | Plum / lilac / lime palette, Inter scale, derived from the Figma export |
| Component library | `src/components/` | Icon set (30 paths ported 1:1), Button, Chip, Badges, StatusPill, Price, DealCard (3 variants), Header, Section, Field, EmptyState |
| Navigation | `src/app/` | Expo Router: customer tabs, deal detail, results. Home reads live feed data |

`npm run typecheck` and `npm run db:verify` both pass.

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

### Not done yet

- **All screens.** Waiting on Figma.
- **Supabase adapter** (`src/data/supabase.ts`) — the contract is defined, the
  RPC calls are not written yet.
- `App.tsx` is still the Expo template. Expo Router is installed but not wired,
  and per `AGENTS.md` routes belong in `src/app/`.
- Migrations have only run against local Postgres, not the real Supabase
  project. `0004_seed.sql` inserts into `auth.users` directly, which Supabase
  discourages — on the real project, create the three demo accounts through
  Auth first, then run the seed with those ids.
- pg_cron is not scheduled yet. `activate_due_deals()`, `expire_due_deals()`
  and `rollup_deal_analytics()` exist and are tested, but nothing calls them on
  a timer.

---

## Running it

```bash
npm install
npm run typecheck     # tsc --noEmit
npm run db:up         # start the local PostGIS container (once)
npm run db:verify     # rebuild the schema, then run 110 assertions
```

| Command | What it does |
|---|---|
| `npm run db:up` | Starts `postgis/postgis:16-3.4` on port 55432 |
| `npm run db:reset` | Drops and rebuilds the schema, applying every migration in order |
| `npm run db:test` | Runs the two SQL suites (needs a freshly reset database) |
| `npm run db:verify` | `db:reset` then `db:test` — the one to use |
| `npm run gen:seed` | Regenerates `0004_seed.sql` from `src/data/seed-*.ts` |

The seed's dates are relative to generation time, so the Today and Ending Soon
rails go stale after a few days — rerun `npm run gen:seed`.

`supabase/local/` is test scaffolding only. It fakes the `auth` schema and the
`anon` / `authenticated` roles that Supabase provides for real, so
**never run it against the real project**.

### Against real Supabase

Apply `0001` → `0002` → `0003` through the SQL editor. Skip the stub: the
project already has `auth` and the roles.

---

## Architecture notes worth keeping in mind

**Two adapters, one contract.** Screens import from `src/data` and call the
`DataSource` interface. `local.ts` serves the seed with no network; `supabase.ts`
will call the RPCs. Swapping is one line in `src/data/index.ts`, and no screen
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
