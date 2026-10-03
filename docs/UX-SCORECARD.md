# UI/UX scorecard

How to rank YOLO Deals' UI and UX, the same way every release, so "is it
better?" has a number behind it. Part 1 is the scorecard with today's baseline.
Part 2 is a five-person usability test that checks the score against real
people. Part 3 covers what moves the app up the App Store and Play Store once
it is live.

## How scoring works

Each item scores **0** (missing), **1** (partly there) or **2** (done and
verified). A category's score is earned ÷ possible, multiplied by its weight.
Weights add up to 100.

| Total | Reading |
|---|---|
| 90–100 | Store-ready polish |
| 75–89 | Strong beta: ship to testers |
| 60–74 | Good alpha: core flows work, rough edges show |
| under 60 | Prototype |

Score from the running app, not from the code. Use a real phone for the
touch, performance and accessibility items, and a desktop browser for the
responsive ones.

---

## Part 1 — Scorecard

### A. Visual design · weight 15

| # | Check | Now | Evidence or gap |
|---|---|---|---|
| A1 | One distinct brand palette, applied everywhere through tokens | 2 | Teal + marigold, `src/theme/tokens.ts`; no stray hex values in screens |
| A2 | Home answers "where, how many, what" above the fold | 2 | Location, deal count, distance, search and all 7 categories visible without scrolling |
| A3 | Real, relevant photos on every deal | 0 | Seed uses random `picsum.photos` images, so a chai deal shows a street lamp |
| A4 | One consistent icon set, no emoji | 2 | Custom stroke icons, category icons read from data |
| A5 | Motion explains change instead of decorating | 2 | Sliding distance indicator, rolling counts, folding greeting, chrome that hides on scroll |
| A6 | App icon and splash on brand | 0 | `app.json` still points at the Expo template assets |
| | **Subtotal** | **8 / 12** | **10.0 of 15** |

### B. Navigation and structure · weight 10

| # | Check | Now | Evidence or gap |
|---|---|---|---|
| B1 | Three or fewer primary tabs, always one tap away | 2 | Home, Search, My Deals on the floating bar |
| B2 | Chrome gets out of the way while reading | 2 | Header and tab bar hide on scroll down, return on scroll up |
| B3 | Back works everywhere, including from a shared link | 2 | Deep links are anchored on the tabs (`unstable_settings.anchor`) |
| B4 | Category → subheading → filtered list in three taps or fewer | 2 | Home tile, subheading pill, results |
| B5 | Profile and notifications reachable from every tab | 1 | Only from the Home header |
| | **Subtotal** | **9 / 10** | **9.0 of 10** |

### C. Discovery and search · weight 15

| # | Check | Now | Evidence or gap |
|---|---|---|---|
| C1 | Typed search shows how it was understood | 2 | "Understood as" chips, live as you type |
| C2 | Every applied filter is visible and removable in one tap | 2 | Removable chips on Results and category pages |
| C3 | Subheadings separate from refinements (price, rating, distance) | 2 | Category subheadings from data; Filters sheet for the rest |
| C4 | Empty results offer a next step | 2 | Clear filters, or widen to 10 km |
| C5 | Map view of nearby deals | 0 | Not built; needs `react-native-maps` and a development build |
| C6 | Uses the device's real location | 0 | Uses the chosen locality's centre |
| | **Subtotal** | **8 / 12** | **10.0 of 15** |

### D. Getting a deal · weight 15

| # | Check | Now | Evidence or gap |
|---|---|---|---|
| D1 | The button says why it is disabled before it is tapped | 2 | Eligibility runs locally first, e.g. "available Mon–Fri · 12–3 PM" |
| D2 | Claim in three taps or fewer from the deal page | 2 | Claim → confirm → code |
| D3 | Code and QR shown immediately and kept in My Deals | 2 | Success sheet, My Deals, QR sheet |
| D4 | Booking times respect time zone and notice period | 2 | Slots built in IST; advance-booking hours honoured |
| D5 | Server refusals shown in plain words | 2 | `RuleViolation` messages shown verbatim, e.g. "Only 2 left" |
| | **Subtotal** | **10 / 10** | **15.0 of 15** |

Payment is deliberately out of scope (customers pay at the counter), so it is
not scored.

### E. Feedback and states · weight 10

| # | Check | Now | Evidence or gap |
|---|---|---|---|
| E1 | Loading shows the shape of what is coming | 2 | Skeleton cards match the real card footprint |
| E2 | Every empty screen says what to do next | 2 | My Deals, Results, category pages, notifications |
| E3 | Every failed load can be retried | 1 | Results has retry; other screens do not show load errors |
| E4 | Works sensibly offline | 0 | No offline detection or cached data |
| E5 | Success is felt, not just seen | 2 | Haptics on claim, redeem and submit (native) |
| | **Subtotal** | **7 / 10** | **7.0 of 10** |

### F. Accessibility · weight 15

| # | Check | Now | Evidence or gap |
|---|---|---|---|
| F1 | Every control has a screen-reader label and role | 2 | Labels and roles throughout; rolling numbers read as one value |
| F2 | Touch targets at least 44 pt | 1 | Most are; applied-filter chips (32 pt) and distance pills (34 pt) are smaller |
| F3 | Text contrast meets WCAG AA | 1 | Body and headings pass; `textMuted` (#93A6A9) on the background (#F2F8F8) is about 2.4:1, under the 4.5:1 AA minimum. Use it for decoration only, or darken it |
| F4 | Respects the system Reduce Motion setting | 0 | Animations always run |
| F5 | Layouts survive 200% text size | 1 | React Native scales text, but layouts are untested at large sizes |
| F6 | Dark mode | 0 | Light only (`userInterfaceStyle: light`) |
| | **Subtotal** | **5 / 12** | **6.25 of 15** |

### G. Performance · weight 10

| # | Check | Now | Evidence or gap |
|---|---|---|---|
| G1 | Lean bundle | 1 | Web bundle about 2.5 MB; all 18 Inter faces are pulled in for the 5 in use |
| G2 | Images never flash blank | 2 | Blurhash placeholders and fade-in (placeholder bug fixed) |
| G3 | Long lists are virtualised | 1 | Results and My Deals use FlatList; category grid does not |
| G4 | Smooth on a low-end Android phone | 0 | Not yet measured on a device |
| G5 | Animations run off the JS thread | 2 | Reanimated worklets throughout |
| | **Subtotal** | **6 / 10** | **6.0 of 10** |

### H. Phone, tablet and web from one codebase · weight 5

| # | Check | Now | Evidence or gap |
|---|---|---|---|
| H1 | Layouts adapt at phone, tablet and desktop widths | 2 | Grids, two-column deal page, capped content width |
| H2 | Sheets become dialogs on wide screens | 2 | `Sheet` switches at 640 px |
| H3 | Hover feedback on web | 2 | Cards lift, photos zoom, tiles rise |
| | **Subtotal** | **6 / 6** | **5.0 of 5** |

### I. Trust · weight 5

| # | Check | Now | Evidence or gap |
|---|---|---|---|
| I1 | Verified businesses are marked | 2 | YOLO Verified badge |
| I2 | Anyone can report a deal | 2 | Report sheet on every deal |
| I3 | Terms and eligibility are clear before claiming | 2 | "Who can use it" and Terms on the deal page |
| | **Subtotal** | **6 / 6** | **5.0 of 5** |

### Baseline: 73 / 100, a good alpha close to beta

| Category | Weight | Score |
|---|---|---|
| A. Visual design | 15 | 10.0 |
| B. Navigation | 10 | 9.0 |
| C. Discovery | 15 | 10.0 |
| D. Getting a deal | 15 | 15.0 |
| E. Feedback and states | 10 | 7.0 |
| F. Accessibility | 15 | 6.25 |
| G. Performance | 10 | 6.0 |
| H. Responsive | 5 | 5.0 |
| I. Trust | 5 | 5.0 |
| **Total** | **100** | **73.25** |

### The shortest path to 85+

In order of points per effort:

1. **Real deal photos** (A3) and **app icon and splash** (A6): about +5.
2. **Reduce Motion, contrast fixes, 44 pt targets** (F2–F4): about +5.
3. **Retry on every load, an offline banner** (E3, E4): about +3.
4. **Device location** (C6): about +2.5.

That gets to roughly 89. Dark mode and the map view are larger pieces of work
for the next round.

---

## Part 2 — Test it with five people

A score from the team is a guess until people use the app. Five participants
find most usability problems. Give each one these tasks on a real phone and
say nothing while they work:

1. "Find a lunch deal under ₹300 near you and claim it."
2. "Book a haircut or facial for tomorrow afternoon."
3. "You claimed something earlier. Show the code you would give the cashier."
4. "Find a 2 BHK flat for rent."
5. As the merchant account: "Create a deal for a weekday thali and submit it."

Record for each task:

| Measure | Target |
|---|---|
| Completed without help | 5 of 5 people |
| Time to complete | Task 1 under 60 s, task 5 under 3 min |
| Wrong turns (back presses, dead ends) | 1 or fewer per task |
| Confidence, asked afterwards, 1–5 | 4 or higher |

Finish with the ten-question System Usability Scale (SUS). Above 68 is
average; above 80 is excellent. Any task that fails for two or more people
outranks everything in Part 1.

---

## Part 3 — Store ranking (once live)

Store position depends mostly on behaviour after install, then on the
listing. Check these before each release:

**Listing**

- [ ] App name and subtitle carry the main search terms ("deals near me", "offers Bengaluru")
- [ ] First two screenshots show the value: Home with live deals, then the claim code
- [ ] A 15–30 second preview video of claiming a deal
- [ ] Localised listing for Hindi and Kannada
- [ ] Category set to Lifestyle or Shopping, matching the strongest keywords

**Quality signals the stores weigh**

- [ ] User-perceived crash rate well under 1.09%, Play's bad-behaviour threshold
      (8% on any single phone model). It is a core vital and affects
      discoverability on Google Play.
- [ ] User-perceived ANR rate under 0.47%, Play's overall threshold
      ([Android vitals](https://developer.android.com/vitals),
      [Play Console help](https://support.google.com/googleplay/android-developer/answer/9844486))
- [ ] Cold start under 2 seconds on a mid-range phone
- [ ] Average rating 4.3 or higher, asked for at a happy moment (after a successful redemption), never on first launch
- [ ] Reviews answered within 48 hours

**Engagement (the strongest ranking signal)**

- [ ] Day-1 retention 30% or higher, day-7 15% or higher
- [ ] Claim conversion: share of deal views that end in a claim, tracked from `deal_events`
- [ ] Search success: share of searches followed by a deal view
- [ ] Notifications that bring people back (deal ending soon, new deal nearby), without spamming

Track these from the analytics events the backend already records
(`deal_events`, `outbox_events`) and review them alongside the Part 1 score
each release.
