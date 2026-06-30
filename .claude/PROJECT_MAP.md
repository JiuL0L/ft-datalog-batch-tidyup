# PROJECT_MAP — FT_DATALOG_due

Scope: integrate FT (Final Test) datalog batches (first test + N retests) and compute a defensible **true yield** (per-chip "any-pass-wins") together with **by first-test Site** attribution.

## Layout

```
FT_DATALOG_due/
├── CLAUDE.md                      Project-level Claude rules (agent skills config)
├── CONTEXT.md                     Domain & report-layout glossary (lazy, /domain-modeling)
├── docs/
│   ├── agents/                    Agent skill docs (issue-tracker, triage, domain)
│   └── adr/                       Architecture Decision Records
│       └── 0001-vendor-and-inline-echarts.md
├── scripts/
│   ├── process_ft_datalog.js      Main reusable script (Node, stdlib only)
│   ├── vendor/
│   │   ├── echarts.min.js         Vendored Apache ECharts 5.5.1 (inlined into reports)
│   │   └── README.md              Provenance: version, source URL, SHA-256, consumer note
│   └── README.md                  Usage and data-format notes
├── .scratch/
│   └── <feature>/                 Spec / issue files for in-flight work
├── PY32F410BR1BT7-B=...=FT1=...zip   Sample input batch (one lot)
└── report-<basename>/             Generated outputs
    ├── report.html                Yield report (open in browser; ECharts inlined)
    └── merged.csv                 Per-chip RT0..RTn merge with fingerprint match
```

## Input data shape

Each batch zip contains 5 files per RT (Retest index, `RT0` = first test):

| Ext  | Role |
|------|------|
| .csv | Wide measurement table — L0..L4 metadata, L6..L8 limits/units, L9 header (`Serial#,Site#,ProberX#,ProberY#,Bin#,<test1>,<test2>,...`), L10+ one DUT per row |
| .ifm | INI-like — `[TesterInfo]`, `[HW:SW_BIN_MAPPING_LIST]` (SW bin → P/F), `[SoftwareBin]`, `[HardwareBin]` (per-site counts) |
| .std | STDF binary (not consumed by this script) |
| .sum | Human-readable test summary (not consumed) |
| .xml | Schema descriptor (not consumed) |

Critical schema quirks:
- **Retest Serial# is reassigned** starting at 1 each retest, so it does not map directly to RT0 Serial#.
- **CSV `Bin#` is the SW bin**, not the HW bin. Use `HW:SW_BIN_MAPPING_LIST` to look up P/F.
- Cell values are right-padded with spaces — trim every cell after split.

## Script flow (`process_ft_datalog.js`)

1. `ensureExtracted` — accepts `.zip` (auto-extract via `tar` / `unzip`) or a pre-extracted directory.
2. `discoverRtFiles` — finds `*=RT<n>=*.csv` siblings and matches each with its `.ifm`.
3. `parseCsv` / `parseIfm` — strict format parsers (no third-party deps).
4. `buildBinPFMap` — SW bin → `'P'|'F'`, then attach `pf` to each row.
5. `pickFingerprintCols` — choose ≤30 RT0 measurement columns that are numeric across all rows and have non-zero spread.
6. `matchRetestToRT0Fails` — greedy 1-to-1 assignment minimizing scale-normalized L2 distance over fingerprint columns (RT0 fail rows ↔ retest rows).
7. `buildChipTimeline` — for each RT0 row, attach matched retest entries; apply **any-pass-wins** to pick the final state.
8. `aggregate` — overall yield, by first-test Site yield, bin breakdown (first-test vs final).
9. `writeMergedCsv` + `writeHtml` — outputs. `writeHtml` reads `scripts/vendor/echarts.min.js` synchronously and inlines it as a single `<script>` block before `</body>` so reports stay offline-capable.

## Key calls / call sites

- CLI entry: [scripts/process_ft_datalog.js:main](scripts/process_ft_datalog.js)
- Yield decision: `buildChipTimeline` — "any retest PASS → chip is PASS"
- By-site attribution: `aggregate` uses `c.rt0Site` (first-test Site) for every chip
- Match quality signal: `rt<n>_match_dist` column in `merged.csv` — values near 0 are confident matches

## Output semantics

`merged.csv` per-chip columns:
```
rt0_serial, rt0_site, rt0_bin, rt0_pf,
rt<n>_serial, rt<n>_site, rt<n>_bin, rt<n>_pf, rt<n>_match_dist,  ... (one block per retest)
final_source, final_site_firsttest, final_site_retest, final_bin, final_pf
```

`final_site_firsttest` is the by-site attribution key; `final_site_retest` records where the chip physically landed during the rescue (different socket).

## Future extensions

- Multi-zip / multi-lot batch mode (loop over inputs, aggregate at the lot/batch level).
- STDF parsing if Bin# in CSV ever diverges from the binary record.
- Optional Hungarian assignment if fingerprint distances are non-trivial (current greedy is fine for ≤10 fails).
