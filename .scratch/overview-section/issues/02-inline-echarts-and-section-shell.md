Status: ready-for-agent

## Parent

[Overview Section Spec](../spec.md) · [ADR-0001](../../../docs/adr/0001-vendor-and-inline-echarts.md)

## What to build

Wire the vendored ECharts into the report and add an empty placeholder for the new top section.

1. In `writeHtml`, read `scripts/vendor/echarts.min.js` synchronously and emit its source inside a single `<script>` tag near the end of `<body>`. Do this once per report.
2. Add a new section `01 · Overview` at the top of the report body, *above* the current section index 01. The new section is initially a placeholder: section header (matching the existing `.section-head` markup style at scripts/process_ft_datalog.js:1298-1303) with no body content yet, just an empty `<div class="overview-grid">` for later regions to attach to.
3. Renumber all existing sections by shifting their `section-index` from `01..04` to `02..05`. No other content in those sections changes.

## Acceptance criteria

- [ ] Generated `report.html` opens with no network requests (verify via DevTools Network tab with cache disabled + offline mode enabled)
- [ ] The new section appears at the top of the report with header text `01 · Overview` and is empty below the header
- [ ] Existing sections render with indices `02 · By first-test Site`, `03 · RT stage timeline`, `04 · Bin breakdown`, `05 · Per-chip detail`, with all their data unchanged from the prior version
- [ ] In the browser console, `typeof echarts === 'object'` returns `true` (i.e. ECharts has loaded)
- [ ] HTML file size grows by roughly the size of `echarts.min.js` (~1 MB) and not more

## Blocked by

- 01-vendor-echarts
