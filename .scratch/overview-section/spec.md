# Overview Section — Spec

Status: done
Owner: human (xiaojie) → agent (implementation)
Anchor: `/grill-with-docs` session 2026-06-30; decisions logged in [CONTEXT.md](../../CONTEXT.md) and [docs/adr/0001-vendor-and-inline-echarts.md](../../docs/adr/0001-vendor-and-inline-echarts.md).
Closed: 2026-07-01 via `/verify` against §"Done means"; item 1 net-request violation resolved by removing the Google Fonts `<link>` tags (see [.scratch/offline-fonts/issues/01-vendor-woff2.md](../offline-fonts/issues/01-vendor-woff2.md) for the vendored-Geist follow-up).

## Goal

Add a new top-of-report section `01 · Overview` to `report.html` produced by [scripts/process_ft_datalog.js](../../scripts/process_ft_datalog.js). The section contains 4 regions visualizing **Yield**, **Bin Loss**, **Bin Pareto**, **Yield by Site**, with histograms and box plots where indicated. Existing sections shift to `02..05` and remain unchanged.

## Done means

A regenerated `report.html` from the existing sample zip:

1. Opens offline with no network requests (verify with DevTools, cache disabled, offline mode).
2. Has a top section `01 · Overview` laid out as in §Layout below.
3. All charts use the project palette (`--accent` green for pass/yield, `--warn` orange for rescued, `--fail` red for fail/loss, `--mute` grays for counts/grid).
4. The FT/Final toggle (single global control at the top of Overview) instantly swaps both Bin Pareto and Yield by Site between **FT bin/yield** and **Final bin/yield** datasets without re-running the script.
5. Existing sections `02..05` (was `01..04`) render unchanged.

## Layout

```
═══════════════════════════════════════════════════════════════
01 · Overview                                  [ FT | ●Final ]   ← global toggle
═══════════════════════════════════════════════════════════════
┌────────────────────────────┬────────────────────────────────┐
│  Yield                     │  Bin Loss                      │
│  ┌────┬────┬────┐          │  Top-3 fail bins (mini bars):  │
│  │ FT │True│Resc│          │  BIN0007 ████████ 4.1%         │
│  │94.8│96.2│ 1.4│ pp       │  BIN0012 ████     2.0%         │
│  └────┴────┴────┘          │  BIN0003 ██       0.9%         │
│  RT cumulative yield:      │                                │
│   ●━━●━━●  (Δ +1.2pp,     │                                │
│            Δ +0.2pp)       │                                │
└────────────────────────────┴────────────────────────────────┘
┌──────────────────────────────────────────────────────────────┐
│  Bin Pareto                                                  │
│                                                              │
│  ┌──────────────────────┐ ┌──────────┐ ┌──────────┐         │
│  │ SW Pareto            │ │ SW count │ │ SW count │         │
│  │ bars + cum-% line    │ │ histogram│ │ boxplot  │         │
│  └──────────────────────┘ └──────────┘ └──────────┘         │
│  ┌──────────────────────┐                                    │
│  │ HW Pareto            │                                    │
│  └──────────────────────┘                                    │
└──────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────┐
│  Yield by Site                                               │
│                                                              │
│  ┌──────────────────────┐ ┌──────────┐ ┌──────────┐         │
│  │ per-Site FT vs True  │ │  Site    │ │  Site    │         │
│  │ bar pair             │ │  yield   │ │  yield   │         │
│  │                      │ │  histogr.│ │  boxplot │         │
│  └──────────────────────┘ └──────────┘ └──────────┘         │
└──────────────────────────────────────────────────────────────┘
```

## Required data (computed in `aggregate` or a new sibling fn)

1. **`overviewYield`**:
   - `ftYield`, `trueYield`, `rescued`, `rescueRate = rescued/ftFail`
   - `cumulativeByRT`: array of `{rt: 'RT0'|...|'RT_n', yield: 0..1, delta: pp_vs_prev}`, computed by counting "for each chip, the earliest RT at which it passed (any-pass-wins)".
2. **`overviewBinLoss`**:
   - `top3FT`: top 3 fail bins by count when scope = FT bin (`c.rt0Bin` of chips with `c.rt0PF === 'F'`)
   - `top3Final`: top 3 fail bins by count when scope = Final bin
   - Each entry: `{bin, count, pctOfTotal}`
3. **`overviewBinPareto`** (two scopes, each with SW and HW views):
   - `sw.ft[]` / `sw.final[]`: sorted-desc array of `{bin, count, cumPct}` for all *fail* SW bins
   - `hw.ft[]` / `hw.final[]`: same for HW bins (computed from `HW:SW_BIN_MAPPING_LIST`)
   - Histogram input = the SW count array itself; box plot input = same array (quartiles + outliers).
4. **`overviewYieldBySite`**:
   - `bySite[]`: `{site, total, ftPass, ftYield, finalPass, finalYield}` (reuse the existing `agg.sites` shape — already in [scripts/process_ft_datalog.js:256-266](../../scripts/process_ft_datalog.js#L256-L266))
   - Histogram input = `bySite.map(s => s.ftYield)` and `bySite.map(s => s.finalYield)`
   - Box plot input = same as histogram

## Implementation outline

1. **Vendor ECharts**: download `echarts@5.5.1` minified, save to `scripts/vendor/echarts.min.js`. Add a brief `scripts/vendor/README.md` noting version + source URL + SHA256.
2. **Compute** the four `overview*` aggregates in [scripts/process_ft_datalog.js](../../scripts/process_ft_datalog.js) — extend `aggregate()` or add `aggregateOverview(chipList, retests, agg)`.
3. **Embed** ECharts: in `writeHtml`, read `vendor/echarts.min.js` and emit `<script>${echartsSource}</script>` once near `</body>`.
4. **Emit** the `01 · Overview` section HTML, with:
   - A `<form>`/`<label>` toggle at the top binding to a `<input type="checkbox" id="ovw-final">`.
   - Four region containers, each with a `<div id="...">` placeholder for ECharts to mount.
   - A trailing `<script>` block that:
     - Embeds the precomputed JSON payloads (`overviewBinPareto.sw.ft`, `.sw.final`, etc.) as JS object literals.
     - Initializes each ECharts instance with the project palette and an `applyScope(isFinal)` function.
     - Wires the toggle's `change` event to call `applyScope` on every chart.
5. **Renumber** existing sections: `01 → 02`, `02 → 03`, `03 → 04`, `04 → 05`. Update `section-index` strings only — no logic changes.
6. **Verify**: open the regenerated `report.html` offline; click the toggle; confirm SW/HW Pareto, histogram, box plot, and Site charts all swap data with FT/Final color contract preserved.

## Out of scope

- Wafer-position partitioning (deferred; ProberX/Y not used).
- Per-test-parameter histograms (Q6's option B; deferred — only count-based stats in this iteration).
- CLI flag to disable Overview (per Q11: always on).
- Dark theme.
- Custom-built minimal ECharts bundle (deferred per ADR-0001 §Alternatives 6).

## Risks / known unknowns

- **HW bin uniqueness**: if a lot's HW bins are very few (e.g. just `P`/`F` mapped), the HW Pareto becomes a single bar. Acceptable — still informative.
- **Empty fail set**: if a lot has 0 fails, Bin Pareto and Bin Loss show empty states. The chart code must handle `series.data = []` gracefully (ECharts does, but verify on a synthetic perfect-yield input).
- **Site count of 1**: histogram/box plot of a single Site is degenerate. Show the chart anyway; statistics are honestly meaningless but the data is rare.
