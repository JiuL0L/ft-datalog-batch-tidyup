# ADR-0001 — Inline a full ECharts build for the Overview section

- Date: 2026-06-30
- Status: Accepted
- Driver: feature in [[scratch-overview-section]] needs Pareto with dual Y-axis, histogram, and box plot in one HTML report.

## Context

The report generator [scripts/process_ft_datalog.js](../../scripts/process_ft_datalog.js) currently has a strict "Node + stdlib only, no third-party deps" rule (see [scripts/README.md](../../scripts/README.md) and [PROJECT_MAP.md](../../.claude/PROJECT_MAP.md)). Existing visualizations are pure DOM/CSS bars in `<div>` elements — no SVG, no JS charts.

The new Overview section adds ~10 charts including:

- Pareto charts (bars + cumulative % line on a secondary Y-axis)
- Count histograms
- Box plots (with quartiles and outlier dots)
- Mini RT-cumulative-yield line chart with per-segment Δpp labels

These cannot be produced cleanly with CSS bars alone, and hand-writing SVG for all of them (especially box plots and dual-Y Pareto) would be substantial bespoke code.

## Decision

Vendor **Apache ECharts 5.5.1 full build** at `scripts/vendor/echarts.min.js` and **inline it** verbatim into every generated `report.html` inside a `<script>` tag. The Node script reads the file at generation time via `fs.readFileSync` and embeds it.

## Alternatives considered

1. **Pure hand-written inline SVG** — preserves the zero-dep rule, but box plots and dual-Y Pareto are non-trivial. Rejected: ongoing maintenance cost exceeds the library cost.
2. **External CDN `<script src="...">`** — small HTML, but reports are routinely emailed and archived; offline opening is a hard requirement. Rejected: breaks offline use.
3. **uPlot inlined (~20 KB)** — no native box plot support. Rejected: forces re-introducing hand-written SVG anyway.
4. **Chart.js v4 + chartjs-chart-boxplot plugin inlined** — workable, but two-package coordination and the plugin's stability is shakier than ECharts' built-in `boxplot` series. Rejected.
5. **Plotly basic inlined (~200 KB)** — comparable size, less ergonomic config format than ECharts' declarative JSON for our codegen flow. Rejected.
6. **Custom ECharts bundle (only used components)** — would save ~150 KB. Deferred as a future optimization; not worth the build-tooling complexity for the first iteration.
7. **npm install + bundler** — would introduce `node_modules` and a build step into a previously zero-dep repo. Rejected: too invasive for one feature.

## Consequences

- **+1 MB per generated `report.html`** (raw; ~250 KB over the wire if served gzipped). Acceptable: reports open instantly on any laptop and 1 MB is trivial for email/archival in 2026.
- **One vendored binary in the repo** at `scripts/vendor/echarts.min.js`. Repo size grows ~1 MB; git handles this fine.
- **No network at run-time, ever** — preserves the offline-everywhere property the rest of the pipeline has.
- **ECharts color palette must be explicitly overridden** to match the existing report's `--accent` / `--warn` / `--fail` semantic palette ([scripts/process_ft_datalog.js:457-485](../../scripts/process_ft_datalog.js#L457-L485)). Stated in [[context]] under "Visualization conventions".
- **Version is pinned** to 5.5.1. Upgrades are a deliberate act: download the new file, replace the vendored copy, regenerate a sample report, verify visually.
- The "stdlib only" rule still applies to **runtime dependencies**. `vendor/echarts.min.js` is an asset that gets stamped into output HTML, not a Node-side import — the script itself stays stdlib-only.

## Verification

After applying:

1. `scripts/vendor/echarts.min.js` exists, ~1 MB, version 5.5.1.
2. Running `node scripts/process_ft_datalog.js <sample.zip>` produces a `report.html` that opens with no network requests (verify via DevTools Network tab with cache disabled and offline mode).
3. All Overview charts render with the project's green/orange/red palette, not ECharts' default blue/purple.
