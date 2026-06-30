Status: ready-for-agent

## Parent

[Overview Section Spec](../spec.md)

## What to build

Add the **per-Site FT vs True bar pair main chart** as the first chart of the third Overview row (full-width Yield by Site region). Initial scope: shows both FT and True bars side-by-side (no toggle dependency for this chart — it always shows both).

Use ECharts (replacing the DOM/CSS bars used in the existing section). Consume `OVERVIEW_BY_SITE.bySite`.

Chart configuration:

- ECharts `bar` series with grouped bars
- X axis: Site IDs as labels (`Site 1`, `Site 2`, ...)
- Y axis: yield percentage (0–100)
- Two series per Site: `FT yield` (color `--mute`) and `True yield` (color `--accent`)
- Tooltip shows site, FT pass/total, FT %, True pass/total, True %, and Δpp
- Title: `Per-Site yield`

Note: this chart visually parallels the existing `02 · By first-test Site` section but uses ECharts for consistency with the rest of Overview. The existing section's DOM/CSS rendering is unchanged.

The toggle wiring (showing only FT *or* only True for the rest of the by-Site charts) is slice #16. This main chart always shows both, so it doesn't strictly need to react to the toggle — but if it's cleaner to dim the non-active series on toggle, that's acceptable.

## Acceptance criteria

- [ ] Below the Bin Pareto region, a new full-width region `Yield by Site` renders
- [ ] The main chart shows two grouped bars per Site (FT in mute, True in accent green)
- [ ] Tooltip on hover shows accurate FT pass/total, True pass/total, and Δpp
- [ ] Chart resizes on window resize
- [ ] Existing `02 · By first-test Site` section is unchanged

## Blocked by

- 12-aggregate-overview-by-site
