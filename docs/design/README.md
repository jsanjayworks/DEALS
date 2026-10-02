# Design exports

Drop Figma exports here. PNG at 2x, one file per frame.

## Naming

`<mode>-<nn>-<screen>.png` — the number is the order in the flow, so the files
sort the way the journey runs.

```
system-01-colors.png          design system: colour variables
system-02-type.png            type scale
system-03-components.png      buttons, chips, cards, status pills

customer-01-onboarding.png
customer-02-login.png
customer-03-home.png
customer-04-search-focused.png
customer-05-search-results.png
customer-06-map.png
customer-07-filters.png
customer-08-deal-details.png
customer-09-claim-sheet.png
customer-10-my-deals.png
customer-11-profile.png

merchant-01-signup.png
merchant-02-dashboard.png
merchant-03-wizard-step1.png   … through step7
merchant-04-my-deals.png
merchant-05-deal-timeline.png
merchant-06-analytics.png

states-01-empty.png            no deals in radius, offline, location denied
```

Partial sets are fine — send the design system plus Home and Deal Details and
there is enough to start.

## Also useful, if you can get it

`tokens.json` — Figma variables exported with a plugin such as "Design Tokens"
or "Variables to JSON". With that, `src/theme/tokens.ts` becomes generated from
the real source instead of transcribed from the PRD, and the two cannot drift.
