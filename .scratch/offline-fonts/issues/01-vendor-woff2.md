Status: ready-for-agent

## Parent

Follow-up to [Overview Section Spec](../../overview-section/spec.md) "Done means" item 1.
Discovered during [/verify session on 2026-07-01](../../overview-section/verify-shots/) — the regenerated report still initiates 3 network requests to `fonts.googleapis.com` / `fonts.gstatic.com` (2 preconnect + 1 stylesheet), which fails item 1's "no network requests" contract. Deletion of the three `<link>` tags was landed in the Overview commit that closes this spec; this issue is about **restoring Geist visually via a vendored WOFF2 subset** so the report keeps its designed typography without any external fetches.

## What to build

Bring the Geist / Geist Mono typeface back into the report **fully offline**, matching the ADR-0001 pattern already used for Apache ECharts.

1. Download the following WOFF2 files (SIL Open Font License 1.1 — free to redistribute):
   - `Geist-Regular.woff2`   (weight 400)
   - `Geist-Medium.woff2`    (weight 500)
   - `Geist-SemiBold.woff2`  (weight 600, used by `.section-title` etc.)
   - `GeistMono-Regular.woff2` (weight 400)
   - `GeistMono-Medium.woff2`  (weight 500)
   Source options:
   - Vercel's `geist` npm package (`node_modules/geist/dist/fonts/geist-sans/` and `.../geist-mono/`), or
   - GitHub Release: [`vercel/geist-font`](https://github.com/vercel/geist-font/releases) → `Geist-*.woff2` inside the `.zip`.
2. Place them under `scripts/vendor/fonts/`.
3. Extend `scripts/vendor/README.md` with a `## Geist fonts` section recording:
   - Version tag (whatever release you pulled)
   - Source URL
   - SHA-256 of each `.woff2`
   - License (`SIL OFL 1.1`) and a one-line consumer note (inlined into every report by `process_ft_datalog.js`).
4. In `writeHtml` (`scripts/process_ft_datalog.js`), inside the `<style>` block near the top of `<head>`:
   - Read each `.woff2` synchronously, `base64`-encode it.
   - Emit five `@font-face` rules using `src: url("data:font/woff2;base64,...") format("woff2")`, matching the weight (400/500/600) and family (`Geist` vs `Geist Mono`).
   - No new `<link>` tags. Do not reintroduce `https://fonts.googleapis.com` in any form.
5. Keep the existing `--font` / `--mono` CSS-variable fallback stacks intact — they are the safety net if a future refactor forgets a weight.

## Acceptance criteria

- [ ] `scripts/vendor/fonts/` contains the 5 WOFF2 files.
- [ ] `scripts/vendor/README.md` documents each font (version, source URL, SHA-256, license, consumer note).
- [ ] Regenerated `report.html` contains **no** occurrences of `fonts.googleapis.com`, `fonts.gstatic.com`, `<link rel="preconnect">`, or any `https://` URL that resolves during page load (grep `report.html` for `https?://` — only license header URLs in the ECharts source should remain).
- [ ] Chrome netlog with `--host-resolver-rules="MAP fonts.googleapis.com 127.0.0.1, MAP fonts.gstatic.com 127.0.0.1"` records **zero** URL requests to those hosts.
- [ ] Visual: rendered report matches the pre-deletion baseline (see [.scratch/overview-section/verify-shots/01-baseline-final.png](../../overview-section/verify-shots/01-baseline-final.png)) — headings and numbers render in Geist, monospace cells in Geist Mono.
- [ ] Report file size increase ≤ 250 KB (five WOFF2 subsets typically total ~120–200 KB base64-encoded; each Geist WOFF2 is ~30 KB on disk).
- [ ] `node scripts/process_ft_datalog.js "<sample.zip>"` still exits 0 and writes `merged.csv` byte-identical to the pre-change baseline.

## Blocked by

Network access to a mirror that carries the Geist font distribution. As of 2026-07-01 the local environment has no path to `fonts.googleapis.com`, `cdn.jsdelivr.net`, `unpkg.com`, `registry.npmmirror.com`, or GitHub Releases (only Tsinghua's `mirrors.tuna.tsinghua.edu.cn` is reachable, and it does not carry Geist). Whoever picks this issue up needs one of:

- A machine on an unrestricted network, or
- A proxy/VPN pointed at `github.com` / `cdn.jsdelivr.net`, or
- The WOFF2 files handed over out-of-band.

## Comments

### 2026-07-01 — file placed, deferred

`process_ft_datalog.js:576-578` had 3 `<link>` tags loading Geist from Google Fonts. Deleted in the same commit that closes the Overview Section spec so the shipped report is 100% offline; visual falls back to the CSS-var second-choice stack (`-apple-system` / `Segoe UI` / `PingFang SC` / `Microsoft YaHei` — Windows renders Segoe UI). This issue restores the intended Geist appearance without reintroducing the network dependency.
