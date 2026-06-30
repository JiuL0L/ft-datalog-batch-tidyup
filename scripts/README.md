# FT Datalog Batch Tidy-Up

Merge a single batch's first test (RT0) and N retests (RT1..RTn) into a yield report.
"True yield" uses **any-pass-wins** per physical chip; by-site yields are attributed by
**first-test Site** (the socket the chip occupied during RT0).

## Run

```bash
# from project root
node scripts/process_ft_datalog.js <input.zip|extracted_dir> [-o <out_dir>]
```

- Default output dir: `report-<basename>/` next to the input.
- Input may be either the original `.zip` (auto-extracted via Windows `tar.exe` or `unzip`) or a directory that already contains the extracted files.

### Example

```bash
node scripts/process_ft_datalog.js "PY32F410BR1BT7-B=...=FT1=...zip"
```

Outputs:
- `report-<basename>/report.html` — open in browser
- `report-<basename>/merged.csv` — per-chip RT0..RTn merge

## Method, in one screen

| Step | What it does |
|------|--------------|
| 1. Parse RT files | Find every `*=RT<n>=*.csv` + sibling `.ifm`; trim padded cells; numeric-cast measurements. |
| 2. Bin → P/F | Read `[HW:SW_BIN_MAPPING_LIST]` from `.ifm`. CSV `Bin#` is the SW bin; lookup gives the chip's P/F flag. |
| 3. Match retests ↔ RT0 fails | Retest Serial# is re-assigned, so we **fingerprint-match** each retest row to the closest RT0 fail row, using scale-normalized L2 distance over ≤30 numeric measurement columns with non-zero spread. Greedy 1-to-1 assignment. |
| 4. Per-chip decision | "any retest PASS → final PASS". `final_source` records which RT settled the verdict; `rt<n>_match_dist` lets you sanity-check confidence (values near 0 are confident). |
| 5. By-site yield | Each chip stays under its **first-test Site** even if a rescue moved it to a different socket. This is the chip-level view, not the socket-level view. |

## Reading `merged.csv`

```
rt0_serial, rt0_site, rt0_bin, rt0_pf,
rt1_serial, rt1_site, rt1_bin, rt1_pf, rt1_match_dist,
... (one block per retest) ...
final_source, final_site_firsttest, final_site_retest, final_bin, final_pf
```

- `rt0_pf == 'F'` and `final_pf == 'P'` → chip was **rescued** by a retest.
- `final_site_retest` is the socket the chip physically sat in during the rescue (may differ from `rt0_site`).
- `rt<n>_match_dist`:
  - `< 0.1` — very confident match
  - `0.1 – 1.0` — plausible (chip characteristics may have shifted post-rescue)
  - `> 1.0` — worth a manual look at the underlying measurements

## When to question the output

- All RT0 fails are in one Site (this happens) → rescue attribution is unambiguous.
- RT0 fails span multiple Sites → fingerprint quality matters more; check `rt<n>_match_dist`.
- A retest has more rows than RT0 has fails → an unmatched retest row will show in the script's stderr as a `j === null` assignment (no RT0 fail to attribute to). Investigate the batch before trusting the report.

## No external dependencies

Pure Node.js stdlib. Works on the Node version that comes with the project (`v24.16.0` tested).
