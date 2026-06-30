Status: ready-for-agent

## Parent

[Overview Section Spec](../spec.md)

## What to build

Compute and inline the data payloads that future slices (07–11) will consume to render the Bin Pareto region. No charts in this slice — just the data flowing into the HTML.

Add an `aggregateOverviewBins(chipList, retests, agg)` (or extend `aggregate`) that produces, for each combination of **scope ∈ {ft, final}** and **binKind ∈ {sw, hw}**:

- An array of `{bin, count, cumPct}` for all *fail* bins of that scope/kind, sorted desc by count
- `cumPct` is the running cumulative percentage (0–100) computed over the sorted array

Definitions:

- **SW bin** is the row's `Bin#` column
- **HW bin** is the row's SW bin mapped via the `HW:SW_BIN_MAPPING_LIST` table from the `.ifm` (the same map used to derive P/F at [scripts/process_ft_datalog.js:69](../../../scripts/process_ft_datalog.js#L69)). Reuse or extend the existing builder to also surface the HW bin number.
- **FT scope** uses chips with `c.rt0PF === 'F'` and groups by `c.rt0Bin` (SW) or its HW mapping
- **Final scope** uses chips with `c.final.pf === 'F'` and groups by `c.final.bin` (SW) or its HW mapping

Wiring:

- Pass the result through `writeHtml` and emit it as a JSON object literal in a `<script>` block, e.g. `const OVERVIEW_BIN_PARETO = {...};` near the top of the inlined script for the Overview section.
- No DOM rendering in this slice. Future slices will read `OVERVIEW_BIN_PARETO.sw.ft`, etc.

## Acceptance criteria

- [ ] In the generated HTML's inlined script, `OVERVIEW_BIN_PARETO` is defined with shape `{ sw: { ft: [...], final: [...] }, hw: { ft: [...], final: [...] } }`
- [ ] Each inner array is sorted desc by `count` and includes `cumPct` running 0–100
- [ ] On the sample lot, the SW.ft array's bins and counts match the existing `agg.binsFirstTest` fail subset (cross-check)
- [ ] HW bin numbers are derived via the `.ifm` `HW:SW_BIN_MAPPING_LIST` mapping, not the raw CSV bin
- [ ] `merged.csv` output is byte-identical to the prior version

## Blocked by

- 02-inline-echarts-and-section-shell
