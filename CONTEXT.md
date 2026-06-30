# CONTEXT — FT_DATALOG_due

Glossary of domain and report-layout terms used in this project.
Implementation details belong in code; decisions belong in `docs/adr/`.

## Domain

- **Chip** — a single die under test, identified across the lot by RT0 `Serial#`. Retest rows reassign serials starting at 1, so chips are re-linked by fingerprint match, not by serial.
- **Site (Site#)** — the tester socket the DUT is in for *that* run. A chip can be tested at different Sites across RT0/RT1/... The "by-Site" attribution always uses **rt0Site** (first-test socket).
- **Bin** — pass/fail category. `Bin#` in CSV is the **SW bin**; HW pass/fail comes from the `HW:SW_BIN_MAPPING_LIST` table in the `.ifm` file.
- **RT0 / RT\<n\>** — first test (RT0) and the n-th retest. A *batch* / *lot* is one RT0 plus zero or more retests.
- **Any-pass-wins** — the rule that decides a chip's final P/F: if any RT pass shows P, the chip is P.
- **First-test yield (FT yield)** — pass-rate using only RT0.
- **True yield** — pass-rate after any-pass-wins is applied.
- **Rescued chip** — RT0 fail that became P at some retest.
- **Bin Loss** — fail-count broken down by bin. For each bin classified as F via [[HW:SW_BIN_MAPPING_LIST]], the number of chips that landed in that bin. Two flavors:
    - **FT Bin Loss** — counts based on RT0 bin (`c.rt0Bin` of every chip with `rt0PF === 'F'`)
    - **Final Bin Loss** — counts based on final bin after any-pass-wins (`c.final.bin` of every chip with `c.final.pf === 'F'`)
  Loss percentage = `binFailCount / total chips`. Not to be confused with **Bin Pareto**, which is the *same data, sorted descending with a cumulative-% curve* (see below).
- **Bin Pareto** — Bin Loss data, but presented as a Pareto chart: bars sorted descending by count, plus a cumulative-% line crossing the 80%/100% marks. Drives the "which N bins explain 80% of loss" question.

## Report layout

- **Section** — one of the numbered blocks in `report.html` (`01 · By first-test Site`, `02 · RT stage timeline`, ...). Each section is full-width.
- **Region (区域)** — a sub-zone *inside* a section. A section can be a single region or a grid of regions. (Not a wafer/zone concept — it is purely a UI layout term.)
- **Overview section** — new top section (`01 · Overview`) holding 4 regions in the "top-light / bottom-heavy" layout:
    1. **Yield region** (top half-width) — three numbers (FT / True / Rescue) + RT-cumulative-yield mini line chart. The line uses *cumulative any-pass-wins* yield at each RT stage (RT0 = FT yield; final = True yield), with per-segment Δpp labels to highlight marginal gain per retest round.
    2. **Bin Loss region** (top half-width) — Top-3 fail bins as mini bars (intentionally a coarse "glance" view; the full distribution lives in Bin Pareto).
    3. **Bin Pareto region** (full width) — for each bin scope: **SW** gets three charts (Pareto bar + cumulative-% line, count histogram, count box plot); **HW** gets only the Pareto chart (too few HW bins for histogram/box plot to be meaningful). Both **FT bin** and **Final bin** datasets are precomputed and inlined; a *global* FT/Final toggle (shared with Yield by Site) swaps the active dataset client-side.
    4. **Yield by Site region** (full width) — per-Site FT-vs-True bar pair (reuses the existing `01 · By first-test Site` shape) + Site-yield histogram + Site-yield box plot. Reacts to the same global FT/Final toggle.

## Visualization conventions

- **Chart library** — Apache ECharts (full build, ~250 KB gzip) is vendored at `scripts/vendor/echarts.min.js` and **inlined** into every generated `report.html`. The script reads the file at generation time and embeds its source inside a `<script>` tag, so reports remain fully offline-capable. Rationale: see [[adr-0001]].
- **Color contract** — ECharts default palette is overridden to match the existing report semantics: `--accent` green = pass / yield gain; `--warn` orange = rescued / intermediate; `--fail` red = fail / loss; `--mute` grays = neutral / counts / grid. The contract holds across FT/Final toggle (data changes, color meaning doesn't).
- **Bin scopes** — SW bin = direct `Bin#` column from CSV; HW bin = SW bin mapped through `HW:SW_BIN_MAPPING_LIST`. Both are used in Bin Pareto; the rest of the report uses SW bin (unchanged).

## Non-terms (avoid)

- "Wafer zone" / "wafer region" — the script does not currently use ProberX/ProberY. If we ever partition by wafer position, give it a distinct name (e.g. **WaferZone**) so it does not collide with the UI-layout sense of "Region" above.
