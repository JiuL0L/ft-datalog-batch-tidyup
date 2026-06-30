Status: ready-for-agent

## Parent

[Overview Section Spec](../spec.md)

## What to build

Add the RT cumulative-yield mini line chart below the three KPI numbers in the Yield region. This is the first ECharts chart in the report.

Data to compute:

- For each chip, find the **earliest RT** at which it passed (any-pass-wins). Chips that never pass are counted as failing at "final".
- Let `cumulativeByRT[k] = (count of chips passing at RT0..RTk) / total`.
- `deltaPp[k] = (cumulativeByRT[k] − cumulativeByRT[k−1]) * 100`, in percentage points; `deltaPp[0]` is undefined (no previous).
- The first point equals `agg.ftYield`; the last point equals `agg.trueYield`.

Render:

- X axis: `RT0, RT1, ..., RT_n` (one tick per RT stage present in `retests`)
- Y axis: yield % (range 0–100, with a tight axis if helpful)
- One line in `--accent` green, with markers on each point
- Above each segment between consecutive points, label `+X.XXpp` (omit on the first point). Use `--accent` if delta > 0, `--mute` if ~0.
- Inline the chart's ECharts `option` JSON inside a `<script>` block that runs `echarts.init(...)` against a chart container in the Yield region.

## Acceptance criteria

- [ ] Below the three KPI numbers, a small line chart renders with one data point per RT stage
- [ ] First point's Y value matches `(ftYield * 100).toFixed(2)`; last point matches `(trueYield * 100).toFixed(2)`
- [ ] Each segment shows a `+X.XXpp` delta label
- [ ] Chart colors: line + markers in `--accent`; axis/grid in `--line`/`--mute-2`
- [ ] Chart re-flows on window resize (call `chart.resize()` on `window.resize`)
- [ ] On a single-retest sample (RT0 + RT1) the chart shows two points and one delta label

## Blocked by

- 03-yield-region-numbers
