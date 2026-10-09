// analysis.js — plate-reader import, growth calls, replicates, Bliss excess.

import { PLATE_COLS, PLATE_ROWS, analyzeFici } from './calc.js';

// ───────────────────────── parsing ─────────────────────────

const toNum = (t) => {
  const x = parseFloat(String(t).trim().replace(',', '.'));
  return Number.isFinite(x) ? x : NaN;
};

function splitTokens(line) {
  // Tab or semicolon separated → commas are decimal commas. Otherwise split on comma/space.
  if (/[\t;]/.test(line)) return line.split(/[\t;]/).map((t) => t.trim());
  return line.trim().split(/[,\s]+/);
}

/** Parse a long-format table with columns row, col (or column), od/value. */
function parseLong(lines) {
  const header = splitTokens(lines[0]).map((h) => h.toLowerCase());
  const iRow = header.findIndex((h) => h === 'row');
  const iCol = header.findIndex((h) => h === 'col' || h === 'column');
  const iOd = header.findIndex((h) => h === 'od' || h === 'od600' || h === 'value');
  if (iRow < 0 || iCol < 0 || iOd < 0) return null;
  const m = Array.from({ length: PLATE_ROWS }, () => Array(PLATE_COLS).fill(null));
  for (const line of lines.slice(1)) {
    const t = splitTokens(line);
    const rawRow = String(t[iRow]).trim().toUpperCase();
    const r = /^[A-H]$/.test(rawRow) ? rawRow.charCodeAt(0) - 65 : parseInt(rawRow, 10) - 1;
    const c = parseInt(t[iCol], 10) - 1;
    const v = toNum(t[iOd]);
    if (r >= 0 && r < PLATE_ROWS && c >= 0 && c < PLATE_COLS && Number.isFinite(v)) m[r][c] = v;
  }
  return m;
}

/**
 * Parse pasted/uploaded plate-reader output.
 * Accepts an 8×12 matrix (optional A–H row labels and a 1–12 header row)
 * or a long table with columns row, col, od.
 * @returns {{matrix?: number[][], error?: string}}
 */
export function parseOdMatrix(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return { error: 'Nothing to parse.' };

  if (/[a-z]/i.test(lines[0]) && /row/i.test(lines[0]) && /col/i.test(lines[0])) {
    const m = parseLong(lines);
    if (!m) return { error: 'Long format needs columns named row, col and od.' };
    const missing = m.flat().filter((v) => v === null).length;
    if (missing) return { error: `Long format is missing ${missing} of 96 wells.` };
    return { matrix: m };
  }

  let rows = lines.map(splitTokens);
  // header row 1..12 (possibly with an empty first cell)
  if (rows.length === PLATE_ROWS + 1) {
    const h = rows[0].filter((t) => t !== '');
    if (h.length === PLATE_COLS && h.every((t, i) => parseInt(t, 10) === i + 1)) rows = rows.slice(1);
  }
  if (rows.length !== PLATE_ROWS) {
    return { error: `Expected ${PLATE_ROWS} rows, found ${rows.length}.` };
  }
  const matrix = [];
  for (let r = 0; r < rows.length; r++) {
    let t = rows[r];
    if (/^[A-Ha-h]$/.test(t[0])) t = t.slice(1);
    t = t.filter((x) => x !== '');
    if (t.length !== PLATE_COLS) {
      return { error: `Row ${r + 1} has ${t.length} values, expected ${PLATE_COLS}.` };
    }
    const nums = t.map(toNum);
    const bad = nums.findIndex((v) => !Number.isFinite(v));
    if (bad >= 0) return { error: `Row ${r + 1}, column ${bad + 1}: "${t[bad]}" is not a number.` };
    matrix.push(nums);
  }
  return { matrix };
}

/** Binary growth plate → pseudo-OD matrix (1 = growth, 0 = no growth). */
export function odFromGrowth(growth) {
  return growth.map((row) => row.map((g) => (g ? 1 : 0)));
}

// ───────────────────────── growth calls ─────────────────────────

export const DEFAULT_CALL = { blank: 0, inhibitionCut: 90 };

/** Inhibition fraction per well relative to the growth-control well. */
export function inhibitionMatrix(od, nR, nC, call = DEFAULT_CALL) {
  const gc = od[nR][nC] - call.blank;
  if (!(gc > 0)) return { error: 'The growth-control well (drug-free row × drug-free column) has no signal above the blank.' };
  const inh = od.map((row) =>
    row.map((v) => Math.min(1, Math.max(0, 1 - (v - call.blank) / gc)))
  );
  return { inh, gc };
}

/** growth[r][c] = true when inhibition is below the cut-off. */
export function growthFromOd(od, nR, nC, call = DEFAULT_CALL) {
  const m = inhibitionMatrix(od, nR, nC, call);
  if (m.error) return m;
  const cut = call.inhibitionCut / 100;
  return { growth: m.inh.map((row) => row.map((e) => e < cut - 1e-12)), inh: m.inh, gc: m.gc };
}

// ───────────────────────── Bliss independence ─────────────────────────

/**
 * Excess over Bliss independence for each combination well:
 *   E_exp = Ea + Eb − Ea·Eb,   excess = E_obs − E_exp   (inhibition fractions).
 * Single-drug effects come from the drug-free row/column of the same plate.
 */
export function blissExcess(inh, nR, nC) {
  const excess = [];
  const flat = [];
  for (let r = 0; r < nR; r++) {
    excess.push([]);
    for (let c = 0; c < nC; c++) {
      const ea = inh[nR][c];
      const eb = inh[r][nC];
      const exp = ea + eb - ea * eb;
      const x = inh[r][c] - exp;
      excess[r].push(x);
      flat.push(x);
    }
  }
  const mean = flat.reduce((a, b) => a + b, 0) / (flat.length || 1);
  return {
    excess,
    mean,
    max: Math.max(...flat),
    min: Math.min(...flat),
    nSynergistic: flat.filter((x) => x > 0.2).length,
    nAntagonistic: flat.filter((x) => x < -0.2).length,
  };
}

// ───────────────────────── replicates ─────────────────────────

export function median(values) {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return NaN;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/**
 * Analyse every replicate and summarise across them.
 * @param reps [{name, od: number[8][12]}]
 */
export function analyzeReplicates(reps, colSeries, rowSeries, call = DEFAULT_CALL) {
  const nC = colSeries.length;
  const nR = rowSeries.length;
  const per = reps.map((rep) => {
    const g = growthFromOd(rep.od, nR, nC, call);
    if (g.error) return { name: rep.name, error: g.error };
    const fici = analyzeFici({ growth: g.growth, colSeries, rowSeries });
    const bliss = blissExcess(g.inh, nR, nC);
    return { name: rep.name, fici, bliss, inh: g.inh, growth: g.growth };
  });
  const ok = per.filter((p) => p.fici && !p.fici.error);
  const pick = (f) => ok.map(f);
  const range = (a) => {
    const v = a.filter(Number.isFinite);
    return v.length ? [Math.min(...v), Math.max(...v)] : [NaN, NaN];
  };
  const summary = ok.length
    ? {
        n: ok.length,
        ficiMin: { median: median(pick((p) => p.fici.min)), range: range(pick((p) => p.fici.min)) },
        ficiMean: { median: median(pick((p) => p.fici.mean)), range: range(pick((p) => p.fici.mean)) },
        ficiMax: { median: median(pick((p) => p.fici.max)), range: range(pick((p) => p.fici.max)) },
        micA: { median: median(pick((p) => p.fici.micA.mic)), range: range(pick((p) => p.fici.micA.mic)) },
        micB: { median: median(pick((p) => p.fici.micB.mic)), range: range(pick((p) => p.fici.micB.mic)) },
        bliss: { median: median(pick((p) => p.bliss.mean)), range: range(pick((p) => p.bliss.mean)) },
        // reproducibility: MICs should agree within one two-fold step
        micWithinOneStep:
          Math.log2(range(pick((p) => p.fici.micA.mic))[1] / range(pick((p) => p.fici.micA.mic))[0]) <= 1 &&
          Math.log2(range(pick((p) => p.fici.micB.mic))[1] / range(pick((p) => p.fici.micB.mic))[0]) <= 1,
      }
    : null;
  return { per, summary };
}
