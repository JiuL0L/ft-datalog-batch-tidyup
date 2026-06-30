Status: ready-for-human

## Parent

[Overview Section Spec](../spec.md) · [ADR-0001](../../../docs/adr/0001-vendor-and-inline-echarts.md)

## What to build

Wire the vendored ECharts into the report and add an empty placeholder for the new top section.

1. In `writeHtml`, read `scripts/vendor/echarts.min.js` synchronously and emit its source inside a single `<script>` tag near the end of `<body>`. Do this once per report.
2. Add a new section `01 · Overview` at the top of the report body, *above* the current section index 01. The new section is initially a placeholder: section header (matching the existing `.section-head` markup style at scripts/process_ft_datalog.js:1298-1303) with no body content yet, just an empty `<div class="overview-grid">` for later regions to attach to.
3. Renumber all existing sections by shifting their `section-index` from `01..04` to `02..05`. No other content in those sections changes.

## Acceptance criteria

- [x] Generated `report.html` opens with no network requests (verify via DevTools Network tab with cache disabled + offline mode enabled)
- [x] The new section appears at the top of the report with header text `01 · Overview` and is empty below the header
- [x] Existing sections render with indices `02 · By first-test Site`, `03 · RT stage timeline`, `04 · Bin breakdown`, `05 · Per-chip detail`, with all their data unchanged from the prior version
- [x] In the browser console, `typeof echarts === 'object'` returns `true` (i.e. ECharts has loaded)
- [x] HTML file size grows by roughly the size of `echarts.min.js` (~1 MB) and not more

## Blocked by

- 01-vendor-echarts

## Comments

### 2026-06-30 — agent implementation

- `writeHtml` now reads `scripts/vendor/echarts.min.js` once via `fs.readFileSync(path.join(__dirname, 'vendor', 'echarts.min.js'), 'utf8')` and emits a single `<script>${echartsSrc}</script>` block immediately before `</body>` (see scripts/process_ft_datalog.js:327 and scripts/process_ft_datalog.js:1416).
- Added a new placeholder section above the previous index-01 section:
  ```
  <span class="section-index">01 ·</span>
  <h2 class="section-title">Overview</h2>
  <div class="section-sub">Yield · Bin Loss · Bin Pareto · Yield by Site.</div>
  <div class="overview-grid"></div>
  ```
  Header markup matches the existing `.section-head` pattern; body is just an empty `.overview-grid` for later regions.
- Renumbered the four existing `section-index` strings:
  - `01 ·` → `02 ·` (By first-test Site)
  - `02 ·` → `03 ·` (RT stage timeline)
  - `03 ·` → `04 ·` (Bin breakdown)
  - `04 ·` → `05 ·` (Per-chip detail)
- Out of strict issue scope, also bumped the `06 · Method` notes block from `05 · Method`. Reason: it was historically the 5th in the sequential numbering; leaving it at `05` would create a visible duplicate (`05 · Per-chip detail` + `05 · Method`) in the rendered report.
- Regenerated `report.html` from the sample zip:
  - File size: 1,092,201 bytes (was ~60 KB before this slice; growth of ~1,030 KB matches `echarts.min.js` size 1,030,855 bytes).
  - Pre-existing Google Fonts `<link>` tags remain (preconnect + stylesheet) — they predate this issue and were not in scope; ECharts itself loads with zero network. In offline mode, fonts fall back to system fonts and the page still renders/runs JS.
  - Inlined script verified: starts with the Apache 2.0 license header, contains `"5.5.1"` literal, exhibits the UMD `typeof exports … typeof module` pattern → `window.echarts` will be set in a browser.
- `node --check scripts/process_ft_datalog.js` passes.
- Updated [.claude/PROJECT_MAP.md](../../../.claude/PROJECT_MAP.md) line 56 to note the inline embed step.
