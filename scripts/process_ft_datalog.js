#!/usr/bin/env node
// FT datalog batch tidy-up: merge RT0 first test with RT1..RTn retests, compute
// true yield using "any-pass-wins" per physical chip, attribute by first-test Site.
//
// Usage:
//   node process_ft_datalog.js <input.zip|extracted_dir> [-o output_dir]
//
// Inputs   : a zip containing FT datalog files named
//            ...=RT<n>=<idx>=<ts>.{csv,ifm,std,sum,xml}, OR a directory with
//            those files already extracted.
// Outputs  : <output_dir>/report.html + <output_dir>/merged.csv

const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const os = require('node:os');

// ---------- CLI ----------
function parseArgs(argv) {
  const args = { input: null, out: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '-o' || argv[i] === '--out') args.out = argv[++i];
    else if (!args.input) args.input = argv[i];
    else throw new Error(`Unexpected arg: ${argv[i]}`);
  }
  if (!args.input) {
    console.error('Usage: node process_ft_datalog.js <input.zip|dir> [-o out_dir]');
    process.exit(2);
  }
  return args;
}

// ---------- Zip extraction ----------
function ensureExtracted(input) {
  const stat = fs.statSync(input);
  if (stat.isDirectory()) return { dir: input, isTemp: false };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-datalog-'));
  // Try bsdtar (Windows 10+) first, then unzip.
  try {
    cp.execFileSync('tar', ['-xf', input, '-C', tmp], { stdio: 'pipe' });
  } catch {
    cp.execFileSync('unzip', ['-o', input, '-d', tmp], { stdio: 'pipe' });
  }
  return { dir: tmp, isTemp: true };
}

// ---------- ifm parser (INI-like) ----------
function parseIfm(content) {
  const result = {};
  let section = null;
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (!line) continue;
    if (line.startsWith('[/')) { section = null; continue; }
    if (line.startsWith('[') && line.endsWith(']')) {
      section = line.slice(1, -1);
      result[section] = result[section] || {};
      continue;
    }
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim();
    if (section) result[section][key] = val;
  }
  return result;
}

// Build {swBin -> 'P'|'F'} from the HW:SW_BIN_MAPPING_LIST section.
function buildBinPFMap(ifm) {
  const m = {};
  const list = ifm['HW:SW_BIN_MAPPING_LIST'] || {};
  for (const mapping of Object.values(list)) {
    for (const entry of mapping.split(';')) {
      const [sw, pf] = entry.split(':');
      if (sw && pf) m[Number(sw)] = pf.trim().toUpperCase();
    }
  }
  return m;
}

// ---------- CSV parser (FT datalog wide format) ----------
function parseCsv(content) {
  const lines = content.split(/\r?\n/);
  const meta = {};
  // L0..L4 : metadata key:value rows (e.g. "Test_Program  :,...")
  for (let i = 0; i < 5; i++) {
    if (!lines[i]) continue;
    const colonIdx = lines[i].indexOf(':,');
    if (colonIdx < 0) continue;
    meta[lines[i].slice(0, colonIdx).trim()] = lines[i].slice(colonIdx + 2).trim();
  }
  const splitTrim = (s) => (s ?? '').split(',').map(c => c.trim());
  const upLimit   = splitTrim(lines[6]);   // L6
  const downLimit = splitTrim(lines[7]);   // L7
  const units     = splitTrim(lines[8]);   // L8
  const headers   = splitTrim(lines[9]);   // L9
  const rows = [];
  for (let i = 10; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;
    const cols = line.split(',').map(c => c.trim());
    if (cols.length < 5) continue;
    const serial = Number(cols[0]);
    if (!Number.isFinite(serial)) continue;
    const measurements = cols.slice(5).map(v => {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    });
    rows.push({
      serial,
      site: Number(cols[1]),
      proberX: Number(cols[2]),
      proberY: Number(cols[3]),
      bin: Number(cols[4]),
      measurements,
    });
  }
  return { meta, upLimit, downLimit, units, headers, rows };
}

// ---------- Discover RT files ----------
function discoverRtFiles(dir) {
  const all = fs.readdirSync(dir);
  const seen = new Map();
  for (const f of all) {
    const m = f.match(/=RT(\d+)=.*\.csv$/i);
    if (!m) continue;
    const rt = Number(m[1]);
    if (!seen.has(rt)) {
      seen.set(rt, {
        rt,
        csv: path.join(dir, f),
        ifm: path.join(dir, f.replace(/\.csv$/i, '.ifm')),
      });
    }
  }
  return [...seen.values()].sort((a, b) => a.rt - b.rt);
}

// ---------- Fingerprint matching (same physical chip across RT files) ----------
// Pick measurement columns that are numeric on ALL RT0 rows and have non-trivial
// spread, so retest rows can be distinguished by closeness in those values.
function pickFingerprintCols(rt0Rows, maxN = 30) {
  if (!rt0Rows.length) return [];
  const M = rt0Rows[0].measurements.length;
  const picks = [];
  for (let c = 0; c < M && picks.length < maxN; c++) {
    let ok = true, min = Infinity, max = -Infinity;
    for (const r of rt0Rows) {
      const v = r.measurements[c];
      if (v === null) { ok = false; break; }
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (!ok) continue;
    if (max - min < 1e-9) continue;
    picks.push({ idx: c, scale: Math.max(Math.abs(max), Math.abs(min), 1e-9) });
  }
  return picks;
}

function fingerprintDistance(a, b, cols) {
  // Scale-normalized L2.
  let sum = 0;
  for (const { idx, scale } of cols) {
    const av = a.measurements[idx], bv = b.measurements[idx];
    if (av === null || bv === null) return Infinity;
    const d = (av - bv) / scale;
    sum += d * d;
  }
  return Math.sqrt(sum);
}

// Greedy 1-to-1 best-match between retest rows and the RT0 fail pool.
// N is tiny (typically <=10) so a Hungarian solver is overkill.
function matchRetestToRT0Fails(rt0Fails, retestRows, fpCols) {
  const used = new Set();
  const assignments = [];
  const pairs = [];
  for (let i = 0; i < retestRows.length; i++) {
    for (let j = 0; j < rt0Fails.length; j++) {
      pairs.push({ i, j, dist: fingerprintDistance(retestRows[i], rt0Fails[j], fpCols) });
    }
  }
  pairs.sort((a, b) => a.dist - b.dist);
  const usedI = new Set();
  for (const p of pairs) {
    if (usedI.has(p.i) || used.has(p.j)) continue;
    usedI.add(p.i); used.add(p.j);
    assignments.push(p);
  }
  // Any retest rows we couldn't pair off go in with a null.
  for (let i = 0; i < retestRows.length; i++) {
    if (!usedI.has(i)) assignments.push({ i, j: null, dist: Infinity });
  }
  return assignments.sort((a, b) => a.i - b.i);
}

// ---------- Per-chip merge ----------
function buildChipTimeline(rt0, retests, fpCols) {
  const rt0Fails = rt0.csv.rows.filter(r => r.pf === 'F');
  for (const rt of retests) {
    rt.assignments = matchRetestToRT0Fails(rt0Fails, rt.csv.rows, fpCols);
  }
  const chips = new Map();
  for (const row of rt0.csv.rows) {
    chips.set(row.serial, {
      rt0Serial: row.serial,
      rt0Site: row.site,
      rt0Bin: row.bin,
      rt0PF: row.pf,
      retests: {},
    });
  }
  for (const rt of retests) {
    for (const a of rt.assignments) {
      if (a.j === null) continue;
      const failRow = rt0Fails[a.j];
      const retestRow = rt.csv.rows[a.i];
      chips.get(failRow.serial).retests[rt.rt] = {
        serial: retestRow.serial,
        site: retestRow.site,
        bin: retestRow.bin,
        pf: retestRow.pf,
        dist: a.dist,
      };
    }
  }
  // Final decision per chip: any-pass-wins.
  for (const c of chips.values()) {
    if (c.rt0PF === 'P') {
      c.final = { source: 'RT0', bin: c.rt0Bin, pf: 'P', site: c.rt0Site, retestSite: null };
      continue;
    }
    let chosen = { source: 'RT0', bin: c.rt0Bin, pf: c.rt0PF, site: c.rt0Site, retestSite: null };
    for (const rt of retests) {
      const rr = c.retests[rt.rt];
      if (!rr) continue;
      // Capture the latest retest as fallback; promote to PASS if any retest passes.
      chosen = { source: `RT${rt.rt}`, bin: rr.bin, pf: rr.pf, site: c.rt0Site, retestSite: rr.site };
      if (rr.pf === 'P') break; // any-pass-wins: stop at the first PASS
    }
    c.final = chosen;
  }
  return [...chips.values()];
}

// ---------- Aggregates ----------
function aggregate(chipList, retests) {
  const total = chipList.length;
  const ftPass = chipList.filter(c => c.rt0PF === 'P').length;
  const finalPass = chipList.filter(c => c.final.pf === 'P').length;
  const rescued = chipList.filter(c => c.rt0PF !== 'P' && c.final.pf === 'P').length;

  const sitesMap = new Map();
  for (const c of chipList) {
    if (!sitesMap.has(c.rt0Site)) {
      sitesMap.set(c.rt0Site, { site: c.rt0Site, total: 0, ftPass: 0, finalPass: 0 });
    }
    const s = sitesMap.get(c.rt0Site);
    s.total += 1;
    if (c.rt0PF === 'P') s.ftPass += 1;
    if (c.final.pf === 'P') s.finalPass += 1;
  }
  const sites = [...sitesMap.values()].sort((a, b) => a.site - b.site);

  // Bin breakdown (first-test and final).
  const tally = (key) => {
    const m = new Map();
    for (const c of chipList) {
      const bin = key === 'rt0' ? c.rt0Bin : c.final.bin;
      const pf = key === 'rt0' ? c.rt0PF : c.final.pf;
      const k = bin;
      if (!m.has(k)) m.set(k, { bin: k, pf, count: 0 });
      m.get(k).count += 1;
    }
    return [...m.values()].sort((a, b) => a.bin - b.bin);
  };

  return {
    total, ftPass, ftFail: total - ftPass,
    finalPass, finalFail: total - finalPass,
    rescued,
    ftYield: total ? ftPass / total : 0,
    trueYield: total ? finalPass / total : 0,
    sites,
    binsFirstTest: tally('rt0'),
    binsFinal: tally('final'),
  };
}

// ---------- Outputs ----------
function writeMergedCsv(filePath, chipList, retests) {
  const cols = ['rt0_serial', 'rt0_site', 'rt0_bin', 'rt0_pf'];
  for (const rt of retests) {
    cols.push(`rt${rt.rt}_serial`, `rt${rt.rt}_site`, `rt${rt.rt}_bin`, `rt${rt.rt}_pf`, `rt${rt.rt}_match_dist`);
  }
  cols.push('final_source', 'final_site_firsttest', 'final_site_retest', 'final_bin', 'final_pf');
  const lines = [cols.join(',')];
  for (const c of chipList.sort((a, b) => a.rt0Serial - b.rt0Serial)) {
    const r = [c.rt0Serial, c.rt0Site, c.rt0Bin, c.rt0PF];
    for (const rt of retests) {
      const rr = c.retests[rt.rt];
      if (rr) r.push(rr.serial, rr.site, rr.bin, rr.pf, rr.dist.toFixed(6));
      else r.push('', '', '', '', '');
    }
    r.push(c.final.source, c.final.site, c.final.retestSite ?? '', c.final.bin, c.final.pf);
    lines.push(r.join(','));
  }
  fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf8');
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, ch =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
const pct = (n, d) => (d ? (100 * n / d).toFixed(2) + '%' : '0.00%');

function writeHtml(filePath, ctx) {
  const { input, rt0, retests, chipList, agg } = ctx;
  const lotMeta = rt0.ifm.TesterInfo || {};
  const yieldDelta = (agg.trueYield - agg.ftYield) * 100;
  const rtCount = retests.length;
  const device = (lotMeta.LotID || '').split('-')[0] || '';
  const generated = new Date().toISOString().replace('T', ' ').slice(0, 19) + 'Z';
  const echartsSrc = fs.readFileSync(path.join(__dirname, 'vendor', 'echarts.min.js'), 'utf8');

  // ----- Per-site rows (refined: bar pair + delta arrow) -----
  const siteRows = agg.sites.map(s => {
    const ftPct = s.total ? (100 * s.ftPass / s.total) : 0;
    const finalPct = s.total ? (100 * s.finalPass / s.total) : 0;
    const delta = finalPct - ftPct;
    const deltaCls = delta > 0.005 ? 'up' : (delta < -0.005 ? 'down' : 'flat');
    const deltaTxt = delta > 0.005 ? `+${delta.toFixed(2)}%`
                   : delta < -0.005 ? `${delta.toFixed(2)}%`
                   : '±0.00%';
    return `
        <div class="site-row">
          <div class="site-name">Site ${esc(s.site)}</div>
          <div class="site-bars">
            <div class="site-bars-track">
              <div class="site-bars-ft" style="--w:${ftPct.toFixed(2)}%"></div>
              <div class="site-bars-final" style="--w:${finalPct.toFixed(2)}%"></div>
            </div>
            <div class="site-bars-labels">
              <span><i class="dot dot-ft"></i>FT ${ftPct.toFixed(2)}% · ${s.ftPass}/${s.total}</span>
              <span><i class="dot dot-final"></i>True ${finalPct.toFixed(2)}% · ${s.finalPass}/${s.total}</span>
            </div>
          </div>
          <div class="site-delta ${deltaCls}">${deltaTxt}</div>
          <div class="site-stat">
            <div class="site-stat-value">${finalPct.toFixed(2)}<span class="pct">%</span></div>
            <div class="site-stat-sub">${s.finalPass} pass · ${s.total - s.finalPass} fail</div>
          </div>
        </div>`;
  }).join('');

  // ----- Bin rows (compact bar+pct) -----
  const binRows = (bins) => {
    const total = bins.reduce((acc, b) => acc + b.count, 0) || 1;
    return bins.map(b => {
      const pctNum = 100 * b.count / total;
      const cls = b.pf === 'P' ? 'p' : 'f';
      return `
        <div class="bin-row">
          <div class="bin-name">BIN${String(b.bin).padStart(4, '0')}</div>
          <div><span class="pill ${cls}">${b.pf === 'P' ? 'PASS' : 'FAIL'}</span></div>
          <div class="bin-bar"><div class="bin-bar-fill ${cls}" style="--w:${pctNum.toFixed(2)}%"></div></div>
          <div class="bin-stat">
            <div class="bin-pct">${pctNum.toFixed(2)}%</div>
            <div class="bin-count">n=${b.count}</div>
          </div>
        </div>`;
    }).join('');
  };

  // ----- Per-RT timeline rows -----
  const rtRows = [rt0, ...retests].map(rt => {
    const ti = rt.ifm.TesterInfo || {};
    const isRetest = rt.rt > 0;
    const tested = Number(ti.TotalTest || rt.csv.rows.length) || 0;
    const passed = Number(ti.TotalPass || 0) || 0;
    const failed = Number(ti.TotalFail || 0) || 0;
    const passRate = tested ? (100 * passed / tested) : 0;
    const status = (ti.RunStatus || '').trim();
    const statusCls = status === 'P' ? 'pass' : status === 'E' ? 'warn' : 'idle';
    return `
        <div class="rt-row ${isRetest ? 'is-retest' : 'is-rt0'}">
          <div class="rt-stage">
            <div class="rt-stage-pip"></div>
            <div class="rt-stage-name">
              <div class="rt-stage-tag">RT${rt.rt}</div>
              <div class="rt-stage-kind">${isRetest ? 'retest' : 'first test'}</div>
            </div>
          </div>
          <div class="rt-start">${esc(ti.TestStartTime || '—')}</div>
          <div class="rt-metric">
            <span class="rt-num">${tested}</span><span class="rt-label">tested</span>
          </div>
          <div class="rt-metric pass">
            <span class="rt-num">${passed}</span><span class="rt-label">pass · ${passRate.toFixed(1)}%</span>
          </div>
          <div class="rt-metric ${failed ? 'fail' : ''}">
            <span class="rt-num">${failed}</span><span class="rt-label">fail</span>
          </div>
          <div class="rt-status ${statusCls}">${esc(status || '—')}</div>
        </div>`;
  }).join('');

  // ----- Per-chip detail table -----
  const rtHeaderCells = retests.map(r => `
          <th class="grp grp-rt">RT${r.rt} Serial</th>
          <th class="grp">RT${r.rt} Site</th>
          <th class="grp">RT${r.rt} Bin</th>
          <th class="grp">RT${r.rt} P/F</th>
          <th class="grp grp-rt-end">RT${r.rt} fp-dist</th>`
  ).join('');

  const chipRows = chipList.sort((a, b) => a.rt0Serial - b.rt0Serial).map(c => {
    const rtCells = retests.map(rt => {
      const rr = c.retests[rt.rt];
      if (!rr) return `<td colspan="5" class="muted hyphen">—</td>`;
      return `<td class="num grp-rt">${rr.serial}</td>` +
        `<td class="num">${rr.site}</td>` +
        `<td class="num">${rr.bin}</td>` +
        `<td><span class="pill ${rr.pf === 'P' ? 'p' : 'f'}">${rr.pf}</span></td>` +
        `<td class="num muted grp-rt-end">${rr.dist === Infinity ? '∞' : rr.dist.toFixed(4)}</td>`;
    }).join('');
    const rowCls = c.rt0PF !== 'P'
      ? (c.final.pf === 'P' ? 'rescued' : 'final-fail')
      : '';
    const finalSrcCls = c.final.source === 'RT0' ? 'src-rt0' : 'src-retest';
    return `
        <tr class="${rowCls}">
          <td class="num strong">${c.rt0Serial}</td>
          <td class="num">${c.rt0Site}</td>
          <td class="num">${c.rt0Bin}</td>
          <td><span class="pill ${c.rt0PF === 'P' ? 'p' : 'f'}">${c.rt0PF}</span></td>
          ${rtCells}
          <td><span class="src-tag ${finalSrcCls}">${esc(c.final.source)}</span></td>
          <td class="num">${c.final.bin}</td>
          <td><span class="pill ${c.final.pf === 'P' ? 'p' : 'f'}">${c.final.pf}</span></td>
        </tr>`;
  }).join('');

  const deltaSign = yieldDelta > 0 ? '+' : '';

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>FT Yield · ${esc(lotMeta.LotID || input)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root {
    --ink:        #09090b;
    --ink-2:      #18181b;
    --mute:       #52525b;
    --mute-2:     #a1a1aa;
    --line:       rgba(15, 23, 42, 0.06);
    --line-soft:  rgba(15, 23, 42, 0.04);
    --surface:    #ffffff;
    --bg:         #fafaf9;
    --bg-2:       #f5f5f4;
    --accent:     #059669;
    --accent-2:   #047857;
    --accent-soft: rgba(5, 150, 105, 0.08);
    --warn:       #b45309;
    --warn-2:     #92400e;
    --warn-soft:  rgba(180, 83, 9, 0.10);
    --fail:       #be123c;
    --fail-2:     #9f1239;
    --fail-soft:  rgba(190, 18, 60, 0.08);
    --shadow-1:   0 1px 0 rgba(15, 23, 42, 0.02), 0 8px 24px -12px rgba(15, 23, 42, 0.08);
    --shadow-2:   0 1px 0 rgba(15, 23, 42, 0.02), 0 18px 44px -18px rgba(15, 23, 42, 0.14);
    --radius:     20px;
    --radius-lg:  28px;
    --radius-sm:  12px;
    --radius-pill: 999px;
    --font:       'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
    --mono:       'Geist Mono', 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: var(--bg); color: var(--ink); }
  body {
    font-family: var(--font);
    line-height: 1.55;
    font-size: 14px;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
    font-feature-settings: 'ss01', 'ss02', 'cv11';
  }

  .page {
    max-width: 1280px;
    margin: 0 auto;
    padding: 28px 28px 80px;
    min-height: 100dvh;
  }

  /* ---------- Topbar ---------- */
  .topbar {
    display: flex; align-items: center; justify-content: space-between;
    gap: 18px;
    padding: 16px 22px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    box-shadow: var(--shadow-1);
  }
  .topbar-left { display: flex; align-items: center; gap: 14px; min-width: 0; }
  .status-pip {
    flex: none; width: 8px; height: 8px; border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 0 4px var(--accent-soft);
    animation: pulse 2.4s ease-in-out infinite;
  }
  @keyframes pulse {
    0%, 100% { box-shadow: 0 0 0 4px var(--accent-soft); }
    50%      { box-shadow: 0 0 0 8px rgba(5,150,105,0); }
  }
  .topbar-brand {
    font-family: var(--mono);
    font-size: 11px;
    text-transform: uppercase;
    font-weight: 500;
    color: var(--ink-2);
    letter-spacing: 0.1em;
  }
  .topbar-divider { width: 1px; height: 18px; background: var(--line); }
  .topbar-lot {
    font-family: var(--mono);
    font-size: 12.5px;
    color: var(--ink-2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  .topbar-meta {
    font-family: var(--mono);
    font-size: 11.5px;
    color: var(--mute);
    white-space: nowrap;
  }

  /* ---------- Hero ---------- */
  .hero {
    margin-top: 18px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-2);
    padding: 48px 48px 44px;
    display: grid;
    grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr);
    gap: 48px;
    align-items: end;
    position: relative;
    overflow: hidden;
  }
  .hero::before {
    content: '';
    position: absolute; inset: 0; pointer-events: none; z-index: 0;
    background:
      radial-gradient(900px 280px at 0% 0%, rgba(5, 150, 105, 0.045), transparent 60%),
      radial-gradient(600px 240px at 100% 100%, rgba(15, 23, 42, 0.035), transparent 60%);
  }
  .hero-left { position: relative; z-index: 1; }
  .hero-eyebrow {
    font-family: var(--mono);
    font-size: 10.5px;
    font-weight: 500;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--mute);
    display: inline-flex; align-items: center; gap: 8px;
  }
  .hero-eyebrow::before {
    content: ''; width: 16px; height: 1px; background: var(--mute-2);
  }
  .hero-stat {
    margin-top: 22px;
    display: flex;
    align-items: baseline;
    gap: 22px;
    flex-wrap: wrap;
  }
  .hero-stat-num {
    font-family: var(--font);
    font-weight: 600;
    font-size: clamp(64px, 9vw, 112px);
    letter-spacing: -0.045em;
    line-height: 0.92;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
  }
  .hero-stat-num .pct {
    font-size: 0.42em;
    margin-left: 6px;
    color: var(--mute);
    letter-spacing: -0.02em;
    font-weight: 500;
  }
  .hero-stat-delta {
    font-family: var(--mono);
    color: var(--accent-2);
    font-size: 13.5px;
    font-weight: 500;
    padding: 8px 14px;
    background: var(--accent-soft);
    border: 1px solid rgba(5, 150, 105, 0.18);
    border-radius: var(--radius-pill);
    display: inline-flex; align-items: center; gap: 8px;
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.4);
    position: relative;
    overflow: hidden;
  }
  .hero-stat-delta::after {
    content: ''; position: absolute; inset: 0;
    background: linear-gradient(120deg, transparent 30%, rgba(255,255,255,0.45) 50%, transparent 70%);
    transform: translateX(-100%);
    animation: shimmer 4.5s ease-in-out infinite;
  }
  @keyframes shimmer { 0%, 60% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
  .hero-stat-delta .arrow {
    width: 10px; height: 10px; display: inline-block;
    border-right: 2px solid currentColor;
    border-top: 2px solid currentColor;
    transform: rotate(45deg) translateY(1px);
  }
  .hero-body {
    margin-top: 28px;
    max-width: 56ch;
    color: var(--mute);
    font-size: 14px;
    line-height: 1.7;
  }
  .hero-body em { font-style: normal; color: var(--ink-2); font-weight: 500; }
  .hero-body code {
    font-family: var(--mono); font-size: 13px;
    background: var(--bg-2); padding: 1px 6px; border-radius: 5px;
    color: var(--ink-2);
  }

  .hero-right {
    position: relative;
    z-index: 1;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
  }
  .tile {
    background: var(--surface);
    border: 1px solid var(--line-soft);
    border-radius: var(--radius-sm);
    padding: 18px 20px;
    transition: border-color .2s ease, transform .2s cubic-bezier(0.16, 1, 0.3, 1);
    position: relative;
  }
  .tile::before {
    content: ''; position: absolute; inset: 0;
    border-radius: inherit;
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.5);
    pointer-events: none;
  }
  .tile:hover { border-color: var(--line); transform: translateY(-1px); }
  .tile-label {
    font-family: var(--mono);
    font-size: 10.5px;
    font-weight: 500;
    letter-spacing: 0.1em;
    color: var(--mute);
    text-transform: uppercase;
  }
  .tile-value {
    font-family: var(--font);
    font-size: 32px;
    font-weight: 600;
    margin-top: 10px;
    color: var(--ink);
    letter-spacing: -0.025em;
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }
  .tile-value .of {
    font-family: var(--mono);
    font-size: 14px;
    font-weight: 400;
    color: var(--mute-2);
    margin-left: 4px;
    letter-spacing: 0;
  }
  .tile.accent .tile-value { color: var(--accent-2); }
  .tile.fail .tile-value { color: var(--fail-2); }
  .tile-sub {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--mute);
    margin-top: 6px;
  }

  /* ---------- Meta strip ---------- */
  .meta-strip {
    margin-top: 20px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    box-shadow: var(--shadow-1);
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    overflow: hidden;
  }
  .meta-cell {
    padding: 18px 24px;
    border-right: 1px solid var(--line-soft);
    border-bottom: 1px solid var(--line-soft);
  }
  .meta-cell:nth-child(3n) { border-right: none; }
  .meta-cell:nth-last-child(-n+3) { border-bottom: none; }
  .meta-key {
    font-family: var(--mono);
    font-size: 10.5px;
    letter-spacing: 0.1em;
    color: var(--mute);
    text-transform: uppercase;
    font-weight: 500;
  }
  .meta-val {
    margin-top: 6px;
    font-family: var(--font);
    font-size: 14px;
    font-weight: 500;
    color: var(--ink);
    letter-spacing: -0.01em;
    word-break: break-all;
  }
  .meta-val.mono { font-family: var(--mono); font-size: 13px; }

  /* ---------- Section header ---------- */
  .section { margin-top: 40px; }
  .section-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 16px;
    padding: 0 6px 16px;
    flex-wrap: wrap;
  }
  .section-title-wrap { display: flex; align-items: baseline; gap: 14px; min-width: 0; }
  .section-index {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--mute-2);
    letter-spacing: 0.1em;
    font-weight: 500;
  }
  .section-title {
    font-family: var(--font);
    font-size: 20px;
    font-weight: 600;
    letter-spacing: -0.022em;
    color: var(--ink);
  }
  .section-sub {
    font-size: 12.5px;
    color: var(--mute);
    max-width: 64ch;
    line-height: 1.55;
  }

  .surface {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    box-shadow: var(--shadow-1);
  }

  /* ---------- Sites ---------- */
  .site-row {
    display: grid;
    grid-template-columns: 88px minmax(0, 1fr) 96px 140px;
    gap: 28px;
    align-items: center;
    padding: 22px 28px;
    border-bottom: 1px solid var(--line-soft);
    transition: background .2s ease;
  }
  .site-row:last-child { border-bottom: none; }
  .site-row:hover { background: var(--bg-2); }
  .site-name {
    font-family: var(--mono);
    font-size: 13px;
    font-weight: 500;
    color: var(--ink);
    letter-spacing: 0.04em;
  }
  .site-bars { min-width: 0; }
  .site-bars-track {
    height: 8px;
    background: rgba(15, 23, 42, 0.045);
    border-radius: var(--radius-pill);
    position: relative;
    overflow: hidden;
    box-shadow: inset 0 1px 0 rgba(15, 23, 42, 0.03);
  }
  .site-bars-ft, .site-bars-final {
    position: absolute; top: 0; left: 0; height: 100%;
    border-radius: var(--radius-pill);
    width: 0;
    animation: bar-grow 1.1s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }
  .site-bars-ft   { background: rgba(15, 23, 42, 0.22); z-index: 1; animation-delay: 50ms; }
  .site-bars-final{ background: var(--accent); z-index: 2; animation-delay: 280ms; }
  @keyframes bar-grow { from { width: 0; } to { width: var(--w); } }
  .site-bars-labels {
    display: flex; justify-content: space-between; gap: 14px;
    margin-top: 9px;
    font-family: var(--mono); font-size: 11px; color: var(--mute);
  }
  .site-bars-labels .dot {
    display: inline-block; width: 8px; height: 8px; border-radius: 50%;
    vertical-align: middle; margin-right: 5px;
  }
  .dot-ft { background: rgba(15, 23, 42, 0.32); }
  .dot-final { background: var(--accent); }
  .site-delta {
    font-family: var(--mono);
    font-size: 12px;
    font-weight: 500;
    text-align: right;
    color: var(--mute);
  }
  .site-delta.up { color: var(--accent-2); }
  .site-delta.down { color: var(--fail-2); }
  .site-stat { text-align: right; }
  .site-stat-value {
    font-family: var(--font);
    font-weight: 600;
    font-size: 22px;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.02em;
  }
  .site-stat-value .pct { color: var(--mute); font-size: 14px; margin-left: 2px; font-weight: 500; }
  .site-stat-sub {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--mute);
    margin-top: 4px;
  }

  /* ---------- RT timeline ---------- */
  .rt-row {
    display: grid;
    grid-template-columns: 160px 150px 1fr 1fr 1fr 60px;
    gap: 20px;
    align-items: center;
    padding: 20px 28px;
    border-bottom: 1px solid var(--line-soft);
  }
  .rt-row:last-child { border-bottom: none; }
  .rt-stage { display: flex; align-items: center; gap: 14px; }
  .rt-stage-pip {
    width: 10px; height: 10px; border-radius: 50%;
    background: var(--ink-2);
    box-shadow: 0 0 0 4px rgba(24, 24, 27, 0.06);
  }
  .rt-row.is-retest .rt-stage-pip { background: var(--warn); box-shadow: 0 0 0 4px var(--warn-soft); }
  .rt-stage-tag {
    font-family: var(--mono);
    font-size: 13px;
    font-weight: 500;
    color: var(--ink);
    letter-spacing: 0.04em;
  }
  .rt-stage-kind {
    font-family: var(--mono);
    font-size: 10.5px;
    color: var(--mute);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-top: 2px;
  }
  .rt-start {
    font-family: var(--mono);
    font-size: 12.5px;
    color: var(--mute);
  }
  .rt-metric { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
  .rt-num {
    font-family: var(--font);
    font-weight: 600;
    font-size: 22px;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.02em;
  }
  .rt-label {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--mute);
    letter-spacing: 0.04em;
  }
  .rt-metric.pass .rt-num { color: var(--accent-2); }
  .rt-metric.fail .rt-num { color: var(--fail-2); }
  .rt-status {
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 500;
    text-align: center;
    padding: 4px 0;
    border-radius: var(--radius-pill);
    letter-spacing: 0.05em;
  }
  .rt-status.pass { color: var(--accent-2); background: var(--accent-soft); }
  .rt-status.warn { color: var(--warn-2); background: var(--warn-soft); }
  .rt-status.idle { color: var(--mute); background: var(--bg-2); }

  /* ---------- Bins ---------- */
  .bin-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 18px;
  }
  .bin-card { padding: 26px 28px 18px; }
  .bin-card-head {
    display: flex; align-items: baseline; justify-content: space-between;
    margin-bottom: 6px;
    gap: 16px;
  }
  .bin-card-title {
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: 0.1em;
    font-weight: 500;
    color: var(--mute);
    text-transform: uppercase;
  }
  .bin-card-sub {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--mute-2);
  }
  .bin-row {
    display: grid;
    grid-template-columns: 96px 72px minmax(0, 1fr) 80px;
    gap: 16px;
    align-items: center;
    padding: 14px 0;
    border-bottom: 1px solid var(--line-soft);
  }
  .bin-row:last-child { border-bottom: none; }
  .bin-name {
    font-family: var(--mono);
    font-size: 13px;
    color: var(--ink);
    font-weight: 500;
    letter-spacing: 0.02em;
  }
  .bin-bar {
    height: 5px;
    background: rgba(15, 23, 42, 0.045);
    border-radius: var(--radius-pill);
    position: relative;
    overflow: hidden;
    box-shadow: inset 0 1px 0 rgba(15, 23, 42, 0.03);
  }
  .bin-bar-fill {
    position: absolute; top: 0; left: 0; height: 100%;
    border-radius: var(--radius-pill);
    width: 0;
    animation: bar-grow 1.1s cubic-bezier(0.16, 1, 0.3, 1) 200ms forwards;
  }
  .bin-bar-fill.p { background: var(--accent); }
  .bin-bar-fill.f { background: var(--fail); }
  .bin-stat { text-align: right; }
  .bin-pct {
    font-family: var(--font);
    font-size: 15px;
    font-weight: 600;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.01em;
  }
  .bin-count {
    font-family: var(--mono);
    font-size: 10.5px;
    color: var(--mute);
    margin-top: 2px;
    letter-spacing: 0.04em;
  }

  /* ---------- Pills / tags ---------- */
  .pill {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 3px 9px;
    border-radius: var(--radius-pill);
    font-family: var(--mono);
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    border: 1px solid transparent;
  }
  .pill.p { background: var(--accent-soft); color: var(--accent-2); border-color: rgba(5, 150, 105, 0.18); }
  .pill.f { background: var(--fail-soft); color: var(--fail-2); border-color: rgba(190, 18, 60, 0.18); }
  .src-tag {
    display: inline-flex; align-items: center;
    padding: 3px 9px;
    border-radius: var(--radius-pill);
    font-family: var(--mono);
    font-size: 10.5px;
    font-weight: 500;
    letter-spacing: 0.05em;
    border: 1px solid var(--line);
  }
  .src-tag.src-rt0 { background: var(--bg-2); color: var(--ink-2); }
  .src-tag.src-retest { background: var(--warn-soft); color: var(--warn-2); border-color: rgba(180, 83, 9, 0.20); }

  /* ---------- Chip details ---------- */
  .chips-summary {
    list-style: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 16px 26px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    font-family: var(--font);
    box-shadow: var(--shadow-1);
    transition: transform .2s cubic-bezier(0.16, 1, 0.3, 1), border-color .2s ease;
  }
  .chips-summary:hover { transform: translateY(-1px); border-color: rgba(15, 23, 42, 0.12); }
  .chips-summary::-webkit-details-marker { display: none; }
  .chips-summary-left { display: flex; align-items: center; gap: 14px; }
  .summary-pip {
    width: 8px; height: 8px; border-radius: 2px;
    background: var(--ink-2);
    transition: transform .25s ease, background .25s ease, border-radius .25s ease;
  }
  details[open] .summary-pip { background: var(--accent); border-radius: 50%; transform: rotate(180deg); }
  .chips-summary-label {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--mute);
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .chips-summary-title {
    font-size: 14px;
    font-weight: 500;
    color: var(--ink);
    letter-spacing: -0.01em;
  }
  .chips-summary-hint {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--mute);
  }

  details[open] .chips-summary { margin-bottom: 14px; }
  .chip-table-wrap {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    overflow: auto;
    box-shadow: var(--shadow-1);
  }
  table.chips {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    font-family: var(--mono);
    font-size: 12px;
  }
  table.chips thead th {
    position: sticky; top: 0; z-index: 2;
    background: var(--surface);
    color: var(--mute);
    font-family: var(--mono);
    font-weight: 500;
    font-size: 10.5px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 14px 12px;
    text-align: left;
    border-bottom: 1px solid var(--line);
    white-space: nowrap;
  }
  table.chips thead th.grp-rt { border-left: 1px solid var(--line); }
  table.chips td {
    padding: 11px 12px;
    font-variant-numeric: tabular-nums;
    color: var(--ink);
    border-bottom: 1px solid var(--line-soft);
    white-space: nowrap;
  }
  table.chips td.grp-rt { border-left: 1px solid var(--line-soft); }
  table.chips td.num { text-align: right; }
  table.chips td.muted { color: var(--mute-2); }
  table.chips td.strong { font-weight: 600; color: var(--ink); }
  table.chips td.hyphen { text-align: center; }
  table.chips tbody tr:last-child td { border-bottom: none; }
  table.chips tbody tr.rescued { background: var(--warn-soft); }
  table.chips tbody tr.final-fail { background: var(--fail-soft); }
  table.chips tbody tr:hover { background: rgba(15, 23, 42, 0.03); }
  table.chips tbody tr.rescued:hover { background: rgba(180, 83, 9, 0.14); }
  table.chips tbody tr.final-fail:hover { background: rgba(190, 18, 60, 0.12); }

  .chip-legend {
    display: flex; gap: 18px; padding: 12px 22px;
    font-family: var(--mono); font-size: 11px; color: var(--mute);
    border-top: 1px solid var(--line-soft);
  }
  .chip-legend .swatch {
    display: inline-block; width: 10px; height: 10px;
    border-radius: 3px; margin-right: 6px; vertical-align: -1px;
  }
  .chip-legend .swatch.rescued { background: var(--warn-soft); border: 1px solid rgba(180, 83, 9, 0.3); }
  .chip-legend .swatch.failed  { background: var(--fail-soft); border: 1px solid rgba(190, 18, 60, 0.3); }

  /* ---------- Method notes ---------- */
  .notes {
    margin-top: 40px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    box-shadow: var(--shadow-1);
    padding: 30px 36px;
    display: grid;
    grid-template-columns: 220px 1fr;
    gap: 40px;
  }
  .notes-head .notes-title {
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: 0.12em;
    font-weight: 500;
    color: var(--mute);
    text-transform: uppercase;
  }
  .notes-head .notes-sub {
    font-family: var(--font);
    font-size: 16px;
    margin-top: 8px;
    color: var(--ink);
    font-weight: 500;
    letter-spacing: -0.015em;
  }
  .notes ul { list-style: none; display: grid; gap: 18px; }
  .notes li {
    font-size: 13.5px;
    color: var(--mute);
    line-height: 1.7;
    padding-left: 22px;
    position: relative;
  }
  .notes li::before {
    content: '';
    position: absolute; left: 0; top: 11px;
    width: 6px; height: 6px;
    border-radius: 50%;
    background: var(--ink-2);
    box-shadow: 0 0 0 3px var(--bg-2);
  }
  .notes li strong { color: var(--ink); font-weight: 600; }
  .notes li em { font-style: normal; color: var(--ink-2); font-weight: 500; }
  .notes li code {
    font-family: var(--mono);
    font-size: 12px;
    background: var(--bg-2);
    padding: 2px 7px;
    border-radius: 5px;
    color: var(--ink-2);
  }

  /* ---------- Footer ---------- */
  .footer {
    margin-top: 28px;
    padding: 6px 6px;
    display: flex; justify-content: space-between; align-items: center;
    font-family: var(--mono); font-size: 11px; color: var(--mute-2);
    letter-spacing: 0.04em;
  }

  /* ---------- Responsive ---------- */
  @media (max-width: 1080px) {
    .hero { grid-template-columns: 1fr; padding: 36px 32px 32px; gap: 28px; }
    .hero-right { grid-template-columns: 1fr 1fr; }
    .rt-row { grid-template-columns: 140px 1fr 1fr 1fr 60px; }
    .rt-start { display: none; }
  }
  @media (max-width: 760px) {
    .page { padding: 20px 16px 60px; }
    .topbar { flex-direction: column; align-items: flex-start; gap: 10px; }
    .meta-strip { grid-template-columns: 1fr 1fr; }
    .meta-cell:nth-child(3n) { border-right: 1px solid var(--line-soft); }
    .meta-cell:nth-child(2n) { border-right: none; }
    .hero { padding: 28px 24px; gap: 24px; }
    .hero-stat-num { font-size: clamp(48px, 13vw, 76px); }
    .site-row { grid-template-columns: 1fr 1fr; row-gap: 14px; padding: 18px 20px; gap: 18px; }
    .site-bars { grid-column: 1 / -1; }
    .site-delta { text-align: left; }
    .rt-row { grid-template-columns: 1fr 1fr; row-gap: 12px; padding: 16px 20px; }
    .rt-start { display: block; grid-column: 1 / -1; }
    .bin-grid { grid-template-columns: 1fr; }
    .notes { grid-template-columns: 1fr; gap: 20px; padding: 22px 24px; }
  }
</style>
</head>
<body>
  <main class="page">

    <header class="topbar">
      <div class="topbar-left">
        <div class="status-pip" title="Report ready"></div>
        <div class="topbar-brand">FT · Yield Report</div>
        <div class="topbar-divider"></div>
        <div class="topbar-lot">${esc(lotMeta.LotID || input)}</div>
      </div>
      <div class="topbar-meta">Generated · ${esc(generated)}</div>
    </header>

    <section class="hero">
      <div class="hero-left">
        <div class="hero-eyebrow">True yield · post-retest</div>
        <div class="hero-stat">
          <span class="hero-stat-num">${(agg.trueYield*100).toFixed(2)}<span class="pct">%</span></span>
          ${yieldDelta > 0.005 ? `<span class="hero-stat-delta"><span class="arrow"></span>${deltaSign}${yieldDelta.toFixed(2)}% vs first-test</span>` : ''}
        </div>
        <p class="hero-body">
          <em>${agg.finalPass}</em> of <em>${agg.total}</em> chips PASS using any-pass-wins per physical chip.
          <em>${agg.rescued}</em> chip(s) rescued from RT0 fail across <em>${rtCount}</em> retest cycle${rtCount === 1 ? '' : 's'};
          attribution by first-test <code>Site</code> regardless of which socket the rescue occurred in.
        </p>
      </div>
      <div class="hero-right">
        <div class="tile">
          <div class="tile-label">Total chips</div>
          <div class="tile-value">${agg.total}</div>
          <div class="tile-sub">from RT0 first test</div>
        </div>
        <div class="tile">
          <div class="tile-label">First-test pass</div>
          <div class="tile-value">${agg.ftPass}<span class="of">/${agg.total}</span></div>
          <div class="tile-sub">${(agg.ftYield*100).toFixed(2)}% FT yield</div>
        </div>
        <div class="tile accent">
          <div class="tile-label">Rescued by retest</div>
          <div class="tile-value">${agg.rescued}</div>
          <div class="tile-sub">RT0 fail → final pass</div>
        </div>
        <div class="tile ${agg.finalFail ? 'fail' : ''}">
          <div class="tile-label">Final fail</div>
          <div class="tile-value">${agg.finalFail}</div>
          <div class="tile-sub">${agg.finalFail === 0 ? 'zero escapes' : 'after all retests'}</div>
        </div>
      </div>
    </section>

    <section class="meta-strip">
      <div class="meta-cell">
        <div class="meta-key">Device</div>
        <div class="meta-val">${esc(device)}</div>
      </div>
      <div class="meta-cell">
        <div class="meta-key">Test step</div>
        <div class="meta-val">${esc(lotMeta.TestStep || '—')}</div>
      </div>
      <div class="meta-cell">
        <div class="meta-key">Parallel sites</div>
        <div class="meta-val mono">${esc(lotMeta.ParallelSiteNo || '—')}</div>
      </div>
      <div class="meta-cell">
        <div class="meta-key">Test program</div>
        <div class="meta-val mono">${esc(lotMeta.TestPrj || '—')}</div>
      </div>
      <div class="meta-cell">
        <div class="meta-key">Tester</div>
        <div class="meta-val mono">${esc(lotMeta.TesterName || '—')} · ${esc(lotMeta.HostName || '—')}</div>
      </div>
      <div class="meta-cell">
        <div class="meta-key">First test start</div>
        <div class="meta-val mono">${esc(lotMeta.TestStartTime || '—')}</div>
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <div class="section-title-wrap">
          <span class="section-index">01 ·</span>
          <h2 class="section-title">Overview</h2>
        </div>
        <div class="section-sub">Yield · Bin Loss · Bin Pareto · Yield by Site.</div>
      </div>
      <div class="overview-grid"></div>
    </section>

    <section class="section">
      <div class="section-head">
        <div class="section-title-wrap">
          <span class="section-index">02 ·</span>
          <h2 class="section-title">By first-test Site</h2>
        </div>
        <div class="section-sub">True-yield attribution: each chip stays under its first-test socket even if rescued elsewhere.</div>
      </div>
      <div class="surface">
        ${siteRows}
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <div class="section-title-wrap">
          <span class="section-index">03 ·</span>
          <h2 class="section-title">RT stage timeline</h2>
        </div>
        <div class="section-sub">First test + ${rtCount} retest pass(es). RunStatus reported by the tester.</div>
      </div>
      <div class="surface">
        ${rtRows}
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <div class="section-title-wrap">
          <span class="section-index">04 ·</span>
          <h2 class="section-title">Bin breakdown</h2>
        </div>
        <div class="section-sub">First-test bins vs. final bins after any-pass-wins resolution.</div>
      </div>
      <div class="bin-grid">
        <div class="surface bin-card">
          <div class="bin-card-head">
            <div class="bin-card-title">First test · RT0</div>
            <div class="bin-card-sub">n=${agg.total}</div>
          </div>
          ${binRows(agg.binsFirstTest)}
        </div>
        <div class="surface bin-card">
          <div class="bin-card-head">
            <div class="bin-card-title">Final · any-pass-wins</div>
            <div class="bin-card-sub">n=${agg.total}</div>
          </div>
          ${binRows(agg.binsFinal)}
        </div>
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <div class="section-title-wrap">
          <span class="section-index">05 ·</span>
          <h2 class="section-title">Per-chip detail</h2>
        </div>
        <div class="section-sub">${chipList.length} chips · retest rows fingerprint-matched to RT0 fail rows. <code>fp-dist</code> ≈ 0 means a confident match.</div>
      </div>
      <details>
        <summary class="chips-summary">
          <div class="chips-summary-left">
            <div class="summary-pip"></div>
            <div>
              <div class="chips-summary-label">Chip-level timeline</div>
              <div class="chips-summary-title">Show full chip table (${chipList.length} rows)</div>
            </div>
          </div>
          <div class="chips-summary-hint">${agg.rescued} rescued · ${agg.finalFail} fail-final</div>
        </summary>
        <div class="chip-table-wrap">
          <table class="chips">
            <thead>
              <tr>
                <th>RT0 Serial</th>
                <th>RT0 Site</th>
                <th>RT0 Bin</th>
                <th>RT0 P/F</th>
                ${rtHeaderCells}
                <th class="grp-rt">Final source</th>
                <th>Final Bin</th>
                <th>Final P/F</th>
              </tr>
            </thead>
            <tbody>${chipRows}</tbody>
          </table>
          <div class="chip-legend">
            <span><span class="swatch rescued"></span>Rescued (RT0 fail → final pass)</span>
            <span><span class="swatch failed"></span>Fail after all retests</span>
          </div>
        </div>
      </details>
    </section>

    <section class="notes">
      <div class="notes-head">
        <div class="notes-title">06 · Method</div>
        <div class="notes-sub">How the numbers are computed</div>
      </div>
      <ul>
        <li><strong>True yield rule.</strong> Any-pass-wins per physical chip. A chip counts PASS in the final yield if it passed in RT0 <em>or</em> any retest.</li>
        <li><strong>By-site attribution.</strong> Each chip stays under its <em>first-test</em> Site even when a retest moves it to a different socket — this reflects the chip's true position in the original handler load.</li>
        <li><strong>Cross-RT chip identity.</strong> Retest <code>Serial#</code> is reassigned starting at 1 each retest, so it does not map directly. Retest rows are fingerprint-matched to the most similar RT0 fail row using a scale-normalized L2 distance over numeric measurement columns. <code>fp-dist</code> near 0 means a confident match; anomalously large values warrant a manual check.</li>
        <li><strong>Bin → P/F mapping.</strong> Read from the <code>HW:SW_BIN_MAPPING_LIST</code> section of each <code>.ifm</code> file. <code>Bin#</code> in CSV is the SW bin, not HW.</li>
      </ul>
    </section>

    <footer class="footer">
      <span>FT_DATALOG_due · static report</span>
      <span>${esc(input)}</span>
    </footer>

  </main>
<script>${echartsSrc}</script>
</body>
</html>
`;
  fs.writeFileSync(filePath, html, 'utf8');
}

// ---------- Main ----------
function main() {
  const args = parseArgs(process.argv);
  const input = path.resolve(args.input);
  const baseName = path.basename(input, path.extname(input)) || 'report';
  const outDir = path.resolve(args.out || path.join(path.dirname(input), `report-${baseName}`));
  fs.mkdirSync(outDir, { recursive: true });

  const { dir: extractedDir, isTemp } = ensureExtracted(input);
  try {
    const rtFiles = discoverRtFiles(extractedDir);
    if (!rtFiles.length) throw new Error('No FT datalog RT*.csv files found in input.');

    const rts = rtFiles.map(f => {
      const csv = parseCsv(fs.readFileSync(f.csv, 'utf8'));
      const ifm = fs.existsSync(f.ifm) ? parseIfm(fs.readFileSync(f.ifm, 'utf8')) : {};
      const binPF = buildBinPFMap(ifm);
      for (const row of csv.rows) {
        row.pf = (binPF[row.bin] === 'P') ? 'P' : 'F';
      }
      return { rt: f.rt, csv, ifm, binPF };
    });

    const rt0 = rts.find(r => r.rt === 0);
    if (!rt0) throw new Error('RT0 (first test) not found.');
    const retests = rts.filter(r => r.rt > 0);

    const fpCols = pickFingerprintCols(rt0.csv.rows, 30);
    const chipList = buildChipTimeline(rt0, retests, fpCols);
    const agg = aggregate(chipList, retests);

    const htmlPath = path.join(outDir, 'report.html');
    const csvPath = path.join(outDir, 'merged.csv');
    writeHtml(htmlPath, { input: path.basename(input), rt0, retests, chipList, agg });
    writeMergedCsv(csvPath, chipList, retests);

    console.log(`Out dir : ${outDir}`);
    console.log(`HTML    : ${htmlPath}`);
    console.log(`CSV     : ${csvPath}`);
    console.log('');
    console.log(`Total chips        : ${agg.total}`);
    console.log(`First-test yield   : ${agg.ftPass}/${agg.total} = ${(agg.ftYield*100).toFixed(2)}%`);
    console.log(`True yield (final) : ${agg.finalPass}/${agg.total} = ${(agg.trueYield*100).toFixed(2)}%`);
    console.log(`Rescued by retests : ${agg.rescued}`);
    for (const s of agg.sites) {
      console.log(`  Site ${s.site}: FT ${s.ftPass}/${s.total} (${(100*s.ftPass/s.total).toFixed(2)}%) → True ${s.finalPass}/${s.total} (${(100*s.finalPass/s.total).toFixed(2)}%)`);
    }
  } finally {
    if (isTemp) fs.rmSync(extractedDir, { recursive: true, force: true });
  }
}

main();
