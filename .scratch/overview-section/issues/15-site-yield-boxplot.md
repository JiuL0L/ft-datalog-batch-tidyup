Status: done

## Parent

[Overview Section Spec](../spec.md)

## What to build

Add the **Site yield box plot** to the right of the histogram, completing the three-chart row in the Yield by Site region. Initial display: FT yield values (toggle wiring is slice #16).

Input: `OVERVIEW_BY_SITE.bySite.map(s => s.ftYield * 100)` — same array as the histogram.

Chart configuration:

- ECharts `boxplot` series
- Compute 5-number summary and outliers using the standard `Q1 − 1.5·IQR` / `Q3 + 1.5·IQR` rule
- Single box on the X axis labeled `Sites`
- Y axis: yield% (range tight around the data, not forced 0–100)
- Box stroke: `--ink-2`; box fill: light tint of `--accent` (this is a *yield* distribution, lean toward green); median line: `--accent-2`; outlier dots: `--fail`
- Title: `Site yield box plot`
- Empty state: if `bySite.length < 4`, render `Need ≥4 Sites for box plot stats`

## Acceptance criteria

- [ ] Right of the Site yield histogram, a box plot renders with a single vertical box, whiskers, and any outliers as dots
- [ ] Median line is `--accent-2` (slightly darker green)
- [ ] Outlier Sites (yield far from the median) are marked with `--fail` red dots
- [ ] With < 4 Sites, the empty-state note renders
- [ ] Tooltip on the box shows min/Q1/median/Q3/max
- [ ] The Yield by Site three-chart row (main + histogram + box plot) shares the full-width region with reasonable column widths (suggested 5/4/3 ratio)

## Blocked by

- 14-site-yield-histogram
