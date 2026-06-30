Status: ready-for-human

## Parent

[Overview Section Spec](../spec.md)

## What to build

Render the Yield region in the top-left half of the Overview section, showing three KPI numbers side-by-side:

- **FT** — `agg.ftYield` as a percentage with 2 decimals
- **True** — `agg.trueYield` as a percentage with 2 decimals
- **Rescue** — `(trueYield − ftYield)` expressed as percentage points (pp), 2 decimals, with a `+` sign when positive

Use pure DOM/CSS — no ECharts in this slice. Match the typographic and color conventions of the existing report:

- FT and True numbers neutral (`--ink`)
- Rescue colored `--accent` when positive, `--mute` when zero
- Reuse the existing `pct` / `hero-stat-num` font scale where appropriate ([scripts/process_ft_datalog.js:1237-1262](../../../scripts/process_ft_datalog.js#L1237-L1262))

This slice covers the *numbers* only. The RT cumulative yield line below them comes in the next slice.

## Acceptance criteria

- [ ] Top-left region of `01 · Overview` shows three labeled numbers: FT / True / Rescue
- [ ] Numeric values match what `agg.ftYield`, `agg.trueYield`, and the rescue delta would compute on the sample lot
- [ ] Layout sits in the left half of the section, with the right half empty (Bin Loss will fill it later)
- [ ] On a 1280px-wide viewport the three numbers fit on one row without wrapping
- [ ] Existing report content unchanged

## Blocked by

- 02-inline-echarts-and-section-shell
