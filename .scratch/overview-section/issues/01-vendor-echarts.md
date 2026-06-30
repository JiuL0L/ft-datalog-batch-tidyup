Status: ready-for-agent

## Parent

[Overview Section Spec](../spec.md) · [ADR-0001](../../../docs/adr/0001-vendor-and-inline-echarts.md)

## What to build

Vendor the Apache ECharts 5.5.1 minified bundle into the repo so the report generator can inline it later. No script behavior changes in this slice.

Place the file at `scripts/vendor/echarts.min.js`. Add a short `scripts/vendor/README.md` recording:

- Library name and version (Apache ECharts 5.5.1)
- Source URL the file was downloaded from
- SHA-256 of the downloaded file
- One-line note that it is consumed by `process_ft_datalog.js` and inlined into generated reports (see ADR-0001)

## Acceptance criteria

- [ ] `scripts/vendor/echarts.min.js` exists and is the official 5.5.1 minified build (~1 MB raw)
- [ ] `scripts/vendor/README.md` exists with version, source URL, SHA-256, and consumer note
- [ ] `node scripts/process_ft_datalog.js <sample.zip>` still runs and produces an unchanged `report.html` (this slice does not yet consume the vendored file)
- [ ] No new runtime dependency is added — `process_ft_datalog.js` continues to use only Node stdlib

## Blocked by

None - can start immediately
