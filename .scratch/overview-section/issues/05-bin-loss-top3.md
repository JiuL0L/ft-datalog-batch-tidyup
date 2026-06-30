Status: ready-for-agent

## Parent

[Overview Section Spec](../spec.md)

## What to build

Render the Bin Loss region in the top-right half of the Overview section, showing the **Top-3 fail bins** by count.

Data:

- Use the **FT bin** scope (RT0 fail rows) by default — i.e. take every chip with `c.rt0PF === 'F'`, group by `c.rt0Bin`, sort by count desc, take top 3.
- Each entry: `{bin, count, pctOfTotal = count / total chips}`.
- The Final-scope version is the responsibility of the FT/Final toggle slice (#11); this slice only renders the FT default.

Render (pure DOM/CSS, no ECharts):

- Three stacked rows, each: `BIN0000`-formatted bin number, a horizontal bar whose width = `pctOfTotal` of the full Bin Loss region width, and a `XX.XX%` label
- Bar color: `--fail`
- Reuse the existing `.bin-row` / `.bin-bar` styling pattern at [scripts/process_ft_datalog.js:365-374](../../../scripts/process_ft_datalog.js#L365-L374) so the visual style matches the existing Bin breakdown section
- A small section title `Top fail bins` at the top of the region

If the lot has 0 fails, show an empty-state line: `No fail bins · 100% yield`.

## Acceptance criteria

- [ ] Top-right region of `01 · Overview` shows the title `Top fail bins`
- [ ] Below the title, up to 3 rows show bin number, a red bar, and the bin's percentage of total chips
- [ ] Bins are sorted by count descending
- [ ] On a lot with 0 fails, the empty-state line renders
- [ ] On a 1280px-wide viewport the region fits in the right half of the row without overflowing into the Yield region

## Blocked by

- 02-inline-echarts-and-section-shell
