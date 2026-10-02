# YOLO Deals

Hyperlocal deals marketplace for Bengaluru. One Expo app carries both the
customer and merchant modes; a Next.js admin console comes later.

The engineering plan and the Figma design prompt are not in the repo yet — they
live outside it for now. Worth committing them under `docs/` so the spec and
the code travel together.

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
| Security | `supabase/migrations/0003_rls.sql` | RLS on every table, plus column-level revokes on `deals.status` |
| Domain types | `src/data/types.ts` | Field names mirror the SQL one-to-one |
| Mapping layer | `src/data/mapping.ts` | SQL `deal_card` row ↔ nested `DealCardModel`, both directions |
| Data contract | `src/data/api.ts` | The single interface every screen will call |
| Local adapter | `src/data/local.ts` | In-memory, enforces the same rules as the SQL |
| Lifecycle | `src/domain/lifecycle.ts` | Mirror of `deal_transitions` |
| Ranking | `src/domain/ranking.ts` | Mirror of `deal_score()` — same 8 weights |
| Action rules | `src/domain/rules.ts` | Mirror of `take_deal_action()` eligibility |
| NL search | `src/search/parser.ts` | Rule-based parser, no API key needed |
| Seed content | `src/data/seed-*.ts` | 10 localities, 31 categories, 32 businesses, 56 live deals + pipeline/queue deals |
| Design tokens | `src/theme/tokens.ts` | PRD section 28 palette and type scale |

`npx tsc --noEmit` passes clean.

### Not done yet

- **All screens.** Waiting on Figma.
- **Supabase adapter** (`src/data/supabase.ts`) — the contract is defined, the
  RPC calls are not written yet.
- **Seed SQL** (`0004_seed.sql`) — the TypeScript seed exists; the SQL version
  that loads the same rows into Postgres does not.
- **Migrations have not been executed against a real Postgres.** They are
  written but unverified: Docker Desktop would not start on this machine, so
  nothing has run them yet. Treat the SQL as draft until it does.
- `App.tsx` is still the Expo template. Expo Router is installed but not wired.

---

## Resuming after a restart

```bash
npm install          # if node_modules is missing
npx tsc --noEmit     # should exit 0
```

### To verify the SQL (the next thing worth doing)

Either start Docker Desktop and run:

```bash
docker run -d --name yolo-pg -e POSTGRES_PASSWORD=yolo -e POSTGRES_DB=yolo \
  -p 55432:5432 postgis/postgis:16-3.4
```

…then apply `0001` → `0002` → `0003` in that order. The schema references
`auth.users` and the `anon` / `authenticated` roles, so a local run needs a
small Supabase stub first (not written yet).

Or point it at the real Supabase project, which already has `auth` and the
roles, and apply the three migrations through the SQL editor.

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
