# Build checklist

What is left to ship YOLO Deals, split into front end, back end and shipping.
"Done" means typecheck and lint pass and it runs; for the back end it also means
covered by `npm run db:verify` or the end-to-end run on the Supabase CLI stack.
UI/UX quality is scored separately in [`UX-SCORECARD.md`](UX-SCORECARD.md).

## Where we are (2026-10-04)

"Items" counts the boxes below. "Estimate" weights them by effort: the
database, the wiring and the screens were the heavy part and are done, while
most open items are setup, native features and polish rather than new screens.

| Area | Items | Estimate | What is holding it back |
|---|---|---|---|
| **Front end** | 78 / 90 | **~82%** | Location, native features (camera, maps, push), error and offline states, no automated tests |
| **Back end** | 27 / 39 | **~82%** | All logic and wiring done and tested; production setup is not: migrations not deployed, no SMS provider, no deal-photo storage, no push delivery |
| **Ship** | 0 / 12 | **~5%** | No `eas.json`, store assets, privacy policy, crash reporting or CI yet |
| **Overall MVP** | 105 / 141 | **~72%** | The demo loop is code-complete; production setup and shipping are barely started |

The demo loop works end to end today, on both backends: customer finds and
claims a deal, merchant redeems it, admin approves a new one.

---

# Front end

## F1. Foundation · 9 / 9

- [x] Expo Router shell: customer tabs, stack screens, merchant and admin areas, sign-in modal
- [x] Data contract (`src/data/api.ts`), full local adapter (`src/data/local.ts`)
- [x] Domain mirrors of the SQL: lifecycle, ranking, action rules (`src/domain/`)
- [x] Rule-based natural-language search parser (`src/search/parser.ts`)
- [x] Component library: Button, Chip, Badges, Price, DealCard (4 variants), Glass, Sheet, RollingNumber, line icon set
- [x] Session store: account, locality, radius, recent searches, persisted
- [x] One codebase for phone, tablet and desktop: grids, two-column deal page, sheets become dialogs
- [x] ESLint (`eslint.config.js`); `npx expo lint` and `npx tsc --noEmit` clean
- [x] Viewer hooks (`useViewer`, `useDisplayName`) shared by both backends

## F2. Design system and look · 17 / 20

- [x] Theme system: one colour family per theme, one accent, display font; `?theme=` preview on web
- [x] Five directions rendered for comparison: `docs/design/theme-options.png`
- [x] No black fills; selected states use the theme's own deep shade
- [x] Display fonts loaded: Fraunces, Bricolage Grotesque
- [x] Line icons instead of emoji; category icons come from the `icon` column
- [x] Motion: sliding distance thumb, rolling deal counts, greeting fold, hover lift on web
- [x] Distance thumb starts gliding on the tap itself, labels stay readable under it, and the feed reloads in the background (memoised Home sections, results applied as a transition)
- [x] Header and floating tab bar hide on scroll down, return on scroll up
- [x] Discount pill in the accent, badges otherwise neutral
- [x] **Theme picked: premium blue and gold, Bento layout** (dev branch; `docs/design/redesign-blue-gold.png`). Navy for structure, gold for the one action and the saving
- [x] Bento Home: navy count card with the distance selector, spotlight tile, live "Ending soon" countdown, "Under ₹200" tile; header no longer repeats the count
- [x] Bento deal page: photo card, price / left / when / where tiles, only the price highlighted (gold save chip)
- [x] Cards as white tiles; navy-and-gold discount pill; gold pill buttons
- [x] Real photos for every seed deal (Unsplash), each matching its deal
- [x] Merchant tab bar rebuilt: pill and label aligned at every width, centred on desktop
- [x] Web focus rings: none after a click or tap, a brand ring for keyboard users
- [x] Wide screens: merchant and admin in a centred 960 px column, profile 720 px, capped search tiles and distance track
- [ ] Carry the chosen theme into sign-in, profile, notifications and the merchant header
- [ ] App icon and splash in the chosen theme; `app.json` still has the template assets
- [ ] Respect Reduce Motion in Reanimated animations

## F3. Customer app · 24 / 28

- [x] Home: greeting, deal count by the address, distance selector, search, 7 categories without scrolling, spotlight carousel, rails
- [x] Category pages with data-driven subheadings (taxonomy children plus `x-facet` attributes) and a separate filter sheet
- [x] Search: natural-language input, "Understood as" chips, suggestions, recent searches
- [x] Results: removable filter chips, filter sheet, four sorts, pagination, empty state
- [x] Deal detail: photo, price and saving, capacity, availability, address, call, directions, WhatsApp, eligibility, terms, save, share, report
- [x] Claim sheet: quantity, IST day and time slots, enquiry message, eligibility preflight, code and QR, haptics
- [x] My Deals: Active / Saved / Past, code plus QR sheet, cancel with confirmation
- [x] Profile from the header avatar, activity, entry to merchant and admin modes
- [x] Notifications screen, unread dot on the bell
- [x] Sign-in: email or phone one-time code (`src/app/sign-in.tsx`)
- [x] Signed-out states: Home browsable, claim/save/My Deals/Profile ask to sign in
- [x] Locality picker
- [x] Taxonomy: Makeup, Facials, Home Cleaning, Nightlife, Villas; Local removed
- [x] Customer journey verified in headless Chrome, zero console errors
- [x] Same journey verified against the Supabase CLI stack
- [x] Deep links land on a deal or category with Home underneath
- [x] Savings ("You save ₹…") and capacity bar on the deal page
- [ ] Device location (`expo-location`) in place of the locality centre
- [ ] Map view of results (`react-native-maps`, needs a development build)
- [ ] Retry on every failed load, offline banner
- [ ] 44 pt touch targets for applied-filter chips and distance options
- [x] Profile: reorganised into Activity, Help and Account
- [x] Edit profile (`src/app/account/edit.tsx`): picture (pick, crop square, upload), name, email, date of birth (DD/MM/YYYY, unlocks 18+/21+ deals); phone shown, locked
- [x] Order history (`src/app/account/history.tsx`): every claim and booking by month, status, code, "You have saved ₹X", Get help per row
- [x] Help and support (`src/app/account/help.tsx`): FAQs (payments and refunds explained honestly: YOLO takes no payments), contact form with a claim attached, your requests and replies
- [x] Delete account (`src/app/account/delete.tsx`), as App Store and Play require
- [x] Spotlight and Ending soon tiles swipe (dots too); rails scroll at every width with arrows on desktop; Trending shows a top 20
- [x] Screen readers get selected / checked / disabled state on web (`aria-*`; RN Web ignores `accessibilityState`)

## F3b. Launch features · 6 / 6

- [x] Smart search: every word counts on its own (a stray word no longer empties the list), word-prefix matching ("biry" finds biryani, "veg" no longer finds non-veg, "kebabs" finds kebab), dish words set Food, filler words dropped. "I want chicken foods under 200" finds the two chicken deals under ₹200
- [x] Live matches under the search box while typing; when nothing matches, Results loosens the search a step at a time (distance, then price, then time, then words) and says what it changed, with Undo
- [x] Group deals: deals carry a group size (`party_min`/`party_max`); "dinner for 4-5 people", "group of 6", "couple", "family" are understood; "Who's going" chips in Filters; "For 4–6" on cards and "Priced for a group of 4 to 6" on the deal page
- [x] My vehicle: pick a bike, scooter or car once (`/vehicle`), see every deal for it across categories, specialists first; Home card, Profile row, vehicle chip in Filters; typing "royal enfield service", "activa" or "car wash" works too. New Vehicle Care category
- [x] Taste learning: views, saves and claims (fading with age) rank a "Picked for you" rail on Home, with the reason; Profile shows "Your interests"
- [x] Category pages open with the tapped tile growing into the header; skipped under Reduce Motion

## F4. Merchant app · 16 / 19

- [x] Gated on business membership; tabs with a raised Create button
- [x] Dashboard: 7 / 30-day stats, status buckets, needs-attention list
- [x] Deals list by bucket: live, in review, drafts, ended
- [x] Deal screen: lifecycle progress, history, pause / resume / duplicate / delete draft, customer list
- [x] 7-step create and edit wizard, saves on every Next, resubmits rejected deals
- [x] Redeem by typed code; double redemption refused
- [x] Insights: claims / bookings / enquiries split, per-deal views and conversion
- [x] Rejection reason shown to the merchant verbatim
- [x] Merchant journey verified locally and against the Supabase CLI stack
- [x] Separate merchant door, "YOLO for Business" at `/business` (`src/app/business.tsx`): same account and one-time code as customers; owners land on the dashboard, new accounts on setup. Customer sign-in links to it
- [x] "List your business" setup (`src/app/list-business.tsx`), from the merchant door or Profile
- [x] The app remembers the last mode, so a merchant reopens into the dashboard
- [x] YOLO Verified request with real registration details (`src/app/merchant/verify.tsx`): registered name, business type, GSTIN (format, state code and check digit checked as you type), or PAN plus Udyam / Shop & Establishment / trade licence when not under GST, FSSAI for food, registered address, applicant and role, declaration
- [x] A declined request shows the admin's reason on the dashboard and comes back pre-filled
- [x] Onboarding verified end to end, locally and on the Supabase CLI stack with a brand-new account
- [x] Wizard: group size and "for which vehicles" (kinds and brands); other attributes are kept on edit
- [ ] Photo upload in the wizard (needs the Storage bucket, see B3)
- [ ] QR scanning on Redeem (`expo-camera`, needs a development build)
- [ ] Business profile editing (hours, address, phone)

## F5. Admin · 4 / 5

- [x] Review queue: approve, or reject with a reason
- [x] Admin approval verified against the Supabase CLI stack
- [x] Support inbox (`src/app/admin/support.tsx`): reply, or reply and close; the customer is notified
- [ ] Reports queue: the `reports` table fills from "Report" on deals, but nobody can see it
- [x] Business verification queue (`src/app/admin/businesses.tsx`): all registration details, GSTIN state, link to the GST portal's taxpayer search, a flag when the same GSTIN or PAN is on another business; verify, or decline with a reason

## F6. Quality · 2 / 3

- [x] Typecheck and lint clean
- [x] Headless Chrome journeys: customer, merchant → admin → customer → merchant loop, categories
- [ ] Automated UI tests (none yet; the Chrome journeys live in a scratch folder, not the repo)

---

# Back end

## B1. Database · 17 / 17

- [x] Schema: 30 tables, enums, indexes, partitioned `deal_events`, lifecycle transition table (`0001_init.sql`)
- [x] All five PRD engines as `SECURITY DEFINER` RPCs (`0002_functions.sql`)
- [x] RLS on every table, writes only through RPCs (`0003_rls.sql`)
- [x] RPCs the app needed: `business_deals`, `review_queue`, `saved_deal_cards`, `my_action_deals`, `get_business`, `list_localities`
- [x] Profile row created on sign-up (`0004_new_user_profiles.sql`)
- [x] pg_cron: activate and expire deals every minute, analytics rollup, partitions (`0005_cron.sql`)
- [x] Notifications written by the database on lifecycle events (`notify_profile`)
- [x] Demo data in `supabase/seed.sql`, outside `migrations/`, with auth rows Supabase Auth accepts
- [x] Merchant onboarding: `create_business`, `submit_business_verification`, `business_verification_queue` (`0006_merchant_onboarding.sql`)
- [x] Verification rules in SQL: `gstin_is_valid` (check digit), PAN holder type must match the business type, FSSAI for food, Udyam format; approval records the registered name and GSTIN on the business, owners are notified either way
- [x] Support tickets, account deletion and profile pictures (`0007_support_and_account.sql`): `create_support_ticket`, `support_queue`, `reply_support_ticket`, `request_account_deletion`; public `avatars` bucket, owner-folder writes only, `profiles.avatar_path` checked to the owner's folder
- [x] 196 SQL assertions passing (`npm run db:verify`)
- [x] Migrations and seed apply cleanly on the Supabase CLI stack (Postgres 17)
- [x] Nine security holes found and fixed: customer making themselves admin, writable `deals.status`, sell-out transition, unpublished deals via the view, `get_deal` leaking drafts, `merchant_stats` for any business, joining any business, inserting an already-verified business, an owner verifying or rating their own business
- [x] Category facets in `categories.attribute_schema` (cuisine, BHK, furnishing, vehicle)
- [x] Reference data as a migration (`0008`): localities, deal types and categories reach production without `seed.sql`
- [x] `0009`: search v2 (any-word, word prefix, group size, vehicles, specialists first), `my_taste()`, `feed_for_you()`, attribute shape check; 20 new assertions (216 in all)

## B2. Mapping and wiring · 9 / 9

- [x] Mapping layer: SQL `deal_card` row ↔ nested `DealCardModel` (`src/data/mapping.ts`)
- [x] Supabase adapter: every `DataSource` method over the RPCs (`src/data/supabase.ts`)
- [x] Database rule errors (`P0001`, `42501`) become readable messages in the app
- [x] Backend chosen from `EXPO_PUBLIC_SUPABASE_URL` / `_PUBLISHABLE_KEY`; local seed otherwise
- [x] Auth: email and phone code, session in AsyncStorage, refresh while foregrounded, sign-out
- [x] Viewer (admin flag, business memberships) loaded after sign-in and on auth changes
- [x] Local email-code templates (`supabase/templates/`, `config.toml`)
- [x] Test phone numbers with fixed codes for local development
- [x] End-to-end on the CLI stack: sign-in, claim, My Deals, redeem, rejection reason, admin approve

## B3. Production setup · 1 / 13

- [x] GitHub integration connected to the Supabase project
- [ ] Confirm "Deploy to production" applies `supabase/migrations/`, then push. Never run `seed.sql` against production
- [ ] SMS provider (Twilio, MessageBird, Vonage or Textlocal) for phone codes
- [ ] Paste `supabase/templates/*.html` into the dashboard email templates
- [ ] Environment variables in EAS for each build profile (URL and publishable key only)
- [ ] Storage bucket for deal media, with RLS, and an upload path in the adapter (copy the avatars bucket and `setAvatar`)
- [ ] Finish account deletion: an Edge Function with the service role removes the auth user for each deletion request
- [ ] Admin RPCs for the reports queue (business verification is done, B1)
- [ ] Automatic GSTIN lookup (legal name, status, address) through a GST data provider, in place of the admin checking the GST portal by hand
- [ ] Document upload for verification (GST certificate, ID) once the Storage bucket exists
- [ ] Push delivery: device tokens table and a sender (Edge Function or webhook) for `notifications`
- [ ] Enquiries outside the deal's time window: allow them (product call; change the SQL and `domain/rules.ts` together)
- [ ] Backups and usage alerts checked on the hosted project

---

# Ship · 0 / 12

- [ ] `eas.json` with development, preview and production profiles
- [ ] Development build (needed for camera, maps and push)
- [ ] `npx expo-doctor` clean
- [ ] Crash reporting (for example Sentry) and basic product analytics
- [ ] Privacy policy and terms pages, linked from sign-in and the stores
- [ ] Store listing: name, screenshots, description, content rating
- [ ] Load only the font weights in use
- [ ] Measure on a low-end Android phone
- [ ] Check text contrast again once the theme is picked (AA is 4.5:1)
- [ ] Five-person usability test (`UX-SCORECARD.md`, Part 2)
- [ ] CI: typecheck, lint and `db:verify` on every push
- [ ] TestFlight and Play internal testing builds

---

## Known issues

- [ ] The parser reads "combo" as the Bundle deal type, a hard filter, so "thali combo" misses a
      discount thali. Consider making deal-type words soft (ranking) rather than hard filters.
- [ ] Expo CLI on Windows writes wrong typed routes when files are added while `expo start` runs
      (`/merchant/index`, `/../state/session`). Restart the dev server to regenerate them.
- [ ] The Figma Make screen files (`ui.tsx`, `customer.tsx`, `merchant.tsx`) were never committed.
