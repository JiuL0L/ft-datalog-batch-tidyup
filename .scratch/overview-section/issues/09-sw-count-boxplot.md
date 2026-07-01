Status: done

## Parent

[Overview Section Spec](../spec.md)

## What to build

Add the **SW bin count box plot** to the right of the SW histogram, completing the SW three-chart row in the Bin Pareto region. Initial scope: FT (toggle wiring is slice #11).

Box plot input: same `count` values as the histogram (one per fail SW bin). Reveals: median bin loss, IQR, and outlier bins (huge-count bins relative to the rest).

Chart configuration:

- ECharts `boxplot` series
- Compute the standard 5-number summary (min, Q1, median, Q3, max) and outliers (points outside `Q1 − 1.5·IQR` or `Q3 + 1.5·IQR`)
- Single box on the X axis labeled `SW bins`
- Y axis: count
- Box stroke: `--ink-2`; box fill: light tint of `--mute`; median line: `--accent`; outlier dots: `--fail`
- Title: `Bin count box plot`
- Empty state: if input array length < 5, render `Need ≥5 fail bins for box plot stats` instead

## Acceptance criteria

- [ ] Right of the SW histogram, a box plot renders with a single vertical box and whiskers
- [ ] Median line is `--accent` green
- [ ] Outlier dots (if any) are `--fail` red
- [ ] With < 5 fail bins, the empty-state note renders instead of a chart
- [ ] Hovering the box shows tooltip with min/Q1/median/Q3/max
- [ ] The SW three-chart row (Pareto + histogram + box plot) shares the full-width Bin Pareto region with reasonable column widths (suggested 5/4/3 ratio of the row)

## Blocked by

- 08-sw-count-histogram
