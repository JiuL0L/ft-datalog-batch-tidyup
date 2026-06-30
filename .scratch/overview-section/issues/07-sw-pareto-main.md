Status: ready-for-agent

## Parent

[Overview Section Spec](../spec.md)

## What to build

Add the **SW Bin Pareto main chart** as the first chart of the second Overview row (full-width Bin Pareto region). Initial display uses the **FT scope** (no toggle yet — that lands in slice #11).

Use ECharts. Consume `OVERVIEW_BIN_PARETO.sw.ft` from slice #06.

Chart configuration:

- **Type**: bar + line on shared X axis, dual Y axes
- **X axis**: bin labels (`BIN0007`, `BIN0012`, ...) sorted as in the input array (already count-desc)
- **Left Y axis**: count (integer ticks)
- **Right Y axis**: cumulative percentage 0–100
- **Bar series**: counts, color `--fail`
- **Line series**: `cumPct`, color `--ink-2`, with markers; a dashed gridline (or markLine) at y=80% on the right axis
- Tooltip on hover shows bin name, count, percentage of total fails, and `cumPct`
- Palette override (no ECharts defaults): set `color: ['#be123c', '#18181b']` (the `--fail` and `--ink-2` hex values)
- Title above the chart: `SW Bin Pareto`

Slice scope: only SW Pareto. Histogram (#08), boxplot (#09), HW Pareto (#10), and toggle (#11) are separate.

## Acceptance criteria

- [ ] Below the Yield + Bin Loss row, a full-width region appears with a section title (e.g. `Bin Pareto`)
- [ ] Inside, the SW Pareto chart renders with red bars (counts) and a near-black cumulative-% line
- [ ] The 80% horizontal marker on the right axis is visible
- [ ] Tooltip shows bin, count, % of total fails, and cumulative %
- [ ] Chart resizes on window resize
- [ ] On a 0-fail lot, the chart shows an empty plot area gracefully (no JS error)

## Blocked by

- 06-aggregate-overview-bin-pareto
