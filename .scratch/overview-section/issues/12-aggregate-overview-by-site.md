Status: ready-for-agent

## Parent

[Overview Section Spec](../spec.md)

## What to build

Compute and inline the data payloads for the Yield by Site region. No chart rendering — just data flowing into the HTML.

Extend the overview aggregation (added in slice #06) to produce, per Site:

- `bySite[]`: array of `{site, total, ftPass, ftYield, finalPass, finalYield}`, sorted by `site` ascending. This is essentially the existing `agg.sites` shape ([scripts/process_ft_datalog.js:256-266](../../../scripts/process_ft_datalog.js#L256-L266)) with `ftYield` and `finalYield` precomputed as 0–1 fractions.

Wiring:

- Emit as `const OVERVIEW_BY_SITE = { bySite: [...] };` in the same inlined script block as `OVERVIEW_BIN_PARETO`
- No DOM/chart rendering in this slice. Future slices read `OVERVIEW_BY_SITE.bySite.map(s => s.ftYield)` and `.map(s => s.finalYield)` for chart inputs

## Acceptance criteria

- [ ] `OVERVIEW_BY_SITE` is defined in the inlined script with the shape above
- [ ] On the sample lot, `OVERVIEW_BY_SITE.bySite` has the same site IDs and counts as the existing `agg.sites` (cross-check totals match)
- [ ] `ftYield` and `finalYield` are 0–1 fractions, not percentages
- [ ] `merged.csv` output is byte-identical to the prior version

## Blocked by

- 02-inline-echarts-and-section-shell
