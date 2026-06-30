Status: ready-for-agent

## Parent

[Overview Section Spec](../spec.md)

## What to build

Add the **HW Bin Pareto** chart as a second row inside the Bin Pareto region, below the SW three-chart row. HW bins are too few for histogram/box plot to be meaningful (typically 2–5), so this slice renders only the Pareto chart.

Use ECharts. Consume `OVERVIEW_BIN_PARETO.hw.ft`. Initial scope FT; toggle wiring is slice #11.

Chart configuration (mirrors the SW Pareto main chart):

- Bar + line on shared X axis, dual Y axes
- X axis: HW bin labels
- Left Y axis: count; Right Y axis: cumulative %
- Bars `--fail`; line `--ink-2` with markers; 80% gridline on right axis
- Title: `HW Bin Pareto`
- Width: full Bin Pareto region width (it's alone on its row)
- Height: comparable to but slightly shorter than the SW Pareto row to reflect its supporting role

## Acceptance criteria

- [ ] Inside the Bin Pareto region, below the SW row of three charts, a new full-width row appears containing only the HW Pareto chart
- [ ] Bars are red, line is near-black, 80% line visible
- [ ] On a lot whose HW bins are only `P` and one `F`, the chart renders one bar (the F bin) without errors
- [ ] On a 0-fail lot, the chart renders an empty plot area gracefully

## Blocked by

- 07-sw-pareto-main
