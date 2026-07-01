Status: done

## Parent

[Overview Section Spec](../spec.md)

## What to build

Extend the global FT/Final toggle (from slice #11) so it *also* updates the Yield by Site histogram and box plot — making the toggle truly global across both Bin Pareto and Yield by Site regions.

Behavior to add:

- When the toggle changes, the Site yield **histogram** rebins from `bySite.map(s => s.ftYield * 100)` to `bySite.map(s => s.finalYield * 100)` (or vice versa) and re-renders
- When the toggle changes, the Site yield **box plot** recomputes its 5-number summary and outliers from the same swapped array and re-renders
- The per-Site main chart (slice #13) continues to show both FT and True bars regardless of toggle (no change to it) — *unless* the implementer prefers to dim the inactive series on toggle, which is acceptable
- The four Bin Pareto charts wired in slice #11 continue to react as before

## Acceptance criteria

- [x] Toggling FT/Final updates Bin Pareto charts (4) AND Yield by Site histogram + box plot (2) in a single user action
- [x] All charts that change on toggle use the precomputed arrays — no recompute, no network
- [x] The per-Site main chart's FT and True bars remain visible across both toggle states (either unchanged, or with the inactive series dimmed)
- [x] On any toggle change, the histogram and box plot empty-state thresholds still apply correctly to whichever scope is active
- [x] Final manual check: from a fresh page load, toggling back and forth several times keeps all 6 reactive charts in sync with the toggle's current state

## Blocked by

- 11-global-toggle-pareto
- 15-site-yield-boxplot
