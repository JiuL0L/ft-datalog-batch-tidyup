Status: ready-for-human

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

- [x] `scripts/vendor/echarts.min.js` exists and is the official 5.5.1 minified build (~1 MB raw)
- [x] `scripts/vendor/README.md` exists with version, source URL, SHA-256, and consumer note
- [x] `node scripts/process_ft_datalog.js <sample.zip>` still runs and produces an unchanged `report.html` (this slice does not yet consume the vendored file)
- [x] No new runtime dependency is added — `process_ft_datalog.js` continues to use only Node stdlib

## Blocked by

None - can start immediately

## Comments

### 2026-06-30 — agent implementation

- Downloaded `echarts.min.js` from `https://cdn.jsdelivr.net/npm/echarts@5.5.1/dist/echarts.min.js`
  - Size: 1,030,855 bytes (~1.0 MB)
  - SHA-256: `e84270bd0cd5bdf60fefc26d00c2a391cb2e81f4d26a7a9ee16185a54773a3cf`
  - Apache 2.0 license header preserved verbatim in the file; `version="5.5.1"` confirmed inline.
- Wrote `scripts/vendor/README.md` recording library, version, source URL, SHA-256, size, license, consumer note, and an "Updating" procedure.
- Re-ran `node scripts/process_ft_datalog.js "PY32F410BR1BT7-B=...zip"`:
  - `merged.csv` byte-identical to the baseline (`d1cec8fd...02e02d`).
  - `report.html` differs only on the `Generated · <ISO timestamp>` line at [scripts/process_ft_datalog.js:1230](../../../scripts/process_ft_datalog.js#L1230) — this non-determinism is intrinsic to the existing script (introduced by `new Date()` at [scripts/process_ft_datalog.js:326](../../../scripts/process_ft_datalog.js#L326)), not by this change. Diff against baseline confirmed to be that one line.
- `process_ft_datalog.js` still only imports `node:fs`, `node:path`, `node:child_process`, `node:os` — no `package.json` / `node_modules` introduced.
- Updated [.claude/PROJECT_MAP.md](../../../.claude/PROJECT_MAP.md) to list the new `scripts/vendor/README.md`.
