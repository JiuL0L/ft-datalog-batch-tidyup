Status: ready-for-agent

## Parent

[Overview Section Spec](../spec.md)

## What to build

Add the **global FT/Final toggle** at the top of the Overview section, and wire it to swap the data shown in the four Bin Pareto charts (SW Pareto, SW histogram, SW box plot, HW Pareto).

UI:

- Place a segmented control at the top-right of the `01 · Overview` section header (next to the section title), with two options: `FT` and `Final`
- Default selected: `Final`
- Visual style: pill-shaped, the active option gets `--accent-soft` background and `--ink` text; the inactive option is `--mute` text on transparent
- Implement with a `<input type="radio" name="overview-scope" value="ft|final">` pair behind labels, or a single `<input type="checkbox">` — implementer's call, just keep it accessible via keyboard

Behavior:

- On change, call an `applyScope(isFinal)` function that updates the ECharts options of the four Bin Pareto charts using the precomputed `OVERVIEW_BIN_PARETO.sw[ft|final]` / `.hw[ft|final]` arrays from slice #06
- The swap must be instant (sub-frame), with no network or recompute
- Color contract preserved across the swap: bars still `--fail`, line still `--ink-2`, etc.

Scope: only the four Bin Pareto charts react in this slice. The Yield by Site charts come online with slice #16.

## Acceptance criteria

- [ ] At the top of the `01 · Overview` header, a two-option `FT | Final` toggle is visible, with `Final` selected by default
- [ ] Clicking `FT` instantly swaps SW Pareto, SW histogram, SW box plot, and HW Pareto to the FT-scope data
- [ ] Clicking `Final` swaps them back
- [ ] No network requests are issued on toggle (verify in DevTools Network tab)
- [ ] Bin Loss top-3 and Yield region are unaffected by the toggle (intentional in this slice)
- [ ] Toggle is keyboard-operable

## Blocked by

- 09-sw-count-boxplot
- 10-hw-pareto-main
