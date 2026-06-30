Status: ready-for-agent

## Parent

[Overview Section Spec](../spec.md)

## What to build

Add the **SW bin count histogram** to the right of the SW Pareto main chart inside the Bin Pareto region. Initial scope: FT (toggle wiring is slice #11).

Histogram input: the `count` values from `OVERVIEW_BIN_PARETO.sw.ft` (one value per fail SW bin). Answer: "what is the distribution of fail counts across SW bins?"

Chart configuration:

- ECharts `bar` series fed from a histogram-binned dataset
- Bin the input counts into ≤10 buckets using a simple rule (Sturges' formula or fixed `bucketCount = min(10, ceil(sqrt(N)))`, whichever is simpler — document the choice in code)
- X axis: count ranges (e.g. `0–5`, `6–10`, …); rotate labels if they overlap
- Y axis: number of SW bins falling in each bucket
- Bar color: `--mute-2` (neutral; this is a distribution, not pass/fail)
- Title: `Bin count distribution`
- Empty state: if input array length < 2, render a centered note `Not enough fail bins to show distribution` instead of a chart

## Acceptance criteria

- [ ] To the right of the SW Pareto chart, a histogram appears with bucketed bars
- [ ] Histogram bars use `--mute-2` color
- [ ] Sum of histogram bar heights equals the number of fail SW bins
- [ ] With fewer than 2 fail bins, the empty-state note renders
- [ ] Histogram, SW Pareto, and the empty Bin Loss / Yield regions above all line up cleanly on a 1280px viewport

## Blocked by

- 07-sw-pareto-main
