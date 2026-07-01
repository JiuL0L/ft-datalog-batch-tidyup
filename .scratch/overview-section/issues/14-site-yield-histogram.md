Status: done

## Parent

[Overview Section Spec](../spec.md)

## What to build

Add the **Site yield histogram** to the right of the per-Site main chart inside the Yield by Site region. Initial display uses **FT yield** values (toggle wiring is slice #16).

Input: `OVERVIEW_BY_SITE.bySite.map(s => s.ftYield * 100)` — one yield% value per Site. Reveals: yield distribution shape across the tester's sockets.

Chart configuration:

- ECharts `bar` series fed from a histogram-binned dataset
- Bucket the yield% values; given typical Site counts (4 / 8 / 16), use a coarse bucketing rule, e.g. `bucketCount = max(3, min(8, ceil(N / 2)))` — document the choice in code
- X axis: yield% buckets (e.g. `90–92`, `92–94`, …); 2-decimal labels
- Y axis: count of Sites in each bucket
- Bar color: `--mute-2`
- Title: `Site yield distribution`
- Empty state: if `bySite.length < 2`, render `Need ≥2 Sites to show distribution`

## Acceptance criteria

- [ ] To the right of the per-Site main chart, a histogram appears
- [ ] Histogram bars use `--mute-2` color
- [ ] Sum of histogram bar heights equals `bySite.length`
- [ ] With only 1 Site, the empty-state note renders
- [ ] Initial data is FT yield (will swap to Final-only on toggle in slice #16)

## Blocked by

- 13-by-site-main
