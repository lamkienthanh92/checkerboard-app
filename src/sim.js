// sim.js — Monte Carlo study of how preparation error propagates into FICI.
//
// Question: with a known true interaction, how often does a checkerboard report
// the wrong class (false synergy / false antagonism) when tube concentrations
// are made (a) with the stock ladder of this tool, (b) in one step straight
// from the primary stock, or (c) by classic serial two-fold dilution?
//
// Model
//  - Every pipetting step has a random volume error with CV(V) = cvFloor + cvSlope / V(µL).
//    The defaults are illustrative; replace them with the specification of your pipettes.
//  - Common-mode errors (weighing, potency) scale every tube of a drug by the same
//    factor, so they cancel in FIC = C / MIC and are not simulated.
//  - Truth is Loewe additivity with a chosen true FICI: a well is inhibited when
//    a/MIC_A* + b/MIC_B* ≥ trueFici, using the ACTUAL concentrations in the well.
//  - The simulated plate is analysed exactly like real data (analyzeFici).

import { analyzeFici } from './calc.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(rng) {
  let u = 0;
  while (u === 0) u = rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export const DEFAULT_SIM = {
  n: 2000,
  seed: 12345,
  trueFici: 1, // 1 = additive, 0.5 = synergy threshold, 2 = mild antagonism
  cvFloor: 0.003,
  cvSlope: 0.2, // fraction·µL → 2.3% at 10 µL, 20% at 1 µL
  wellDispenseError: true,
};

const cvOf = (vUl, o) => o.cvFloor + o.cvSlope / Math.max(vUl, 1e-9);
const jitter = (vUl, rng, o) => Math.max(1e-9, vUl * (1 + cvOf(vUl, o) * normal(rng)));
const ratio = (take, dil) => take / (take + dil);

/** Relative error (actual / nominal) of each tube made with the stock ladder. */
function ladderMultipliers(r, rng, o) {
  const { stocks, falcons } = r.ladder;
  const sm = [1];
  for (let k = 1; k < stocks.length; k++) {
    const s = stocks[k];
    const t = s.fromPrev_uL;
    const d = s.camhb_mL * 1000;
    sm[k] = (sm[s.fromStockIdx] * ratio(jitter(t, rng, o), jitter(d, rng, o))) / ratio(t, d);
  }
  return falcons.map((f) => {
    const t = f.volFromStock_uL;
    const d = f.camhb_mL * 1000;
    return (sm[f.stockIdx] * ratio(jitter(t, rng, o), jitter(d, rng, o))) / ratio(t, d);
  });
}

/** One step from the primary stock, whatever the volume (no minimum). */
function directMultipliers(r, rng, o) {
  const Cp = r.primaryStock;
  const Vw = r.workVolMl;
  return r.ladder.falcons.map((f) => {
    const t = (f.concInFalcon * Vw * 1000) / Cp;
    const d = Vw * 1000 - t;
    return ratio(jitter(t, rng, o), jitter(d, rng, o)) / ratio(t, d);
  });
}

/** Classic serial two-fold dilution; errors accumulate down the series. */
function serialMultipliers(r, rng, o) {
  const Cp = r.primaryStock;
  const Vw = r.workVolMl;
  const out = [];
  let prev = 1;
  r.ladder.falcons.forEach((f, i) => {
    if (i === 0) {
      const t = (f.concInFalcon * Vw * 1000) / Cp;
      const d = Vw * 1000 - t;
      prev = ratio(jitter(t, rng, o), jitter(d, rng, o)) / ratio(t, d);
    } else {
      const half = Vw * 500;
      prev = (prev * ratio(jitter(half, rng, o), jitter(half, rng, o))) / 0.5;
    }
    out.push(prev);
  });
  return out;
}

const STRATEGIES = {
  perfect: { label: 'Error-free reference', fn: (r) => r.ladder.falcons.map(() => 1) },
  ladder: { label: 'Stock ladder (this tool)', fn: ladderMultipliers },
  direct: { label: 'One step from primary, no minimum volume', fn: directMultipliers },
  serial: { label: 'Serial two-fold dilution', fn: serialMultipliers },
};

function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * Run the study for the two titrated drugs of a plan.
 * @returns {rows: [{key,label,n,pFalseSynergy,pFalseAntagonism,median,q1,q3,sdLog2}], error?}
 */
export function simulateFici(plan, cfg, options = {}) {
  const o = { ...DEFAULT_SIM, ...options };
  const A = plan.colRes;
  const B = plan.rowRes;
  if (!A?.ladder || !B?.ladder) {
    return { rows: [], error: 'Define one valid drug across columns and one down rows.' };
  }
  const colSeries = A.series;
  const rowSeries = B.series;
  const nC = colSeries.length;
  const nR = rowSeries.length;
  const wellUl = plan.volAbPerWellEach;
  const rows = [];

  for (const [key, strat] of Object.entries(STRATEGIES)) {
    const rng = mulberry32(o.seed); // same random truth for every strategy
    const rngErr = mulberry32(o.seed + 7919);
    const values = [];
    let falseSyn = 0;
    let falseAnt = 0;
    let used = 0;

    for (let rep = 0; rep < o.n; rep++) {
      // true MICs, uniformly placed (in log2) between two grid points
      const micA = colSeries[Math.min(2, nC - 1)] * Math.pow(2, -rng() * 2) * 1; // between grid values
      const micB = rowSeries[Math.min(2, nR - 1)] * Math.pow(2, -rng() * 2);
      const mA = strat.fn(A, rngErr, o);
      const mB = strat.fn(B, rngErr, o);

      const growth = [];
      for (let r = 0; r <= nR; r++) {
        growth.push([]);
        for (let c = 0; c <= nC; c++) {
          let a = c < nC ? colSeries[c] * mA[c] : 0;
          let b = r < nR ? rowSeries[r] * mB[r] : 0;
          if (o.wellDispenseError && key !== 'perfect') {
            const cv = cvOf(wellUl, o);
            if (a) a *= 1 + cv * normal(rngErr);
            if (b) b *= 1 + cv * normal(rngErr);
          }
          // single-drug wells always follow the drug's own MIC; the interaction
          // index only changes the threshold in combination wells
          const threshold = a > 0 && b > 0 ? o.trueFici : 1;
          growth[r].push(!(a / micA + b / micB >= threshold));
        }
      }
      const res = analyzeFici({ growth, colSeries, rowSeries });
      if (res.error || !Number.isFinite(res.min)) continue;
      used++;
      values.push(res.min);
      if (res.min <= 0.5) falseSyn++;
      if (res.min > 4) falseAnt++;
    }
    const sorted = [...values].sort((x, y) => x - y);
    const logs = values.map((v) => Math.log2(v));
    const mean = logs.reduce((a, b) => a + b, 0) / (logs.length || 1);
    const sd = Math.sqrt(logs.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, logs.length - 1));
    rows.push({
      key,
      label: strat.label,
      n: used,
      pFalseSynergy: used ? falseSyn / used : NaN,
      pFalseAntagonism: used ? falseAnt / used : NaN,
      median: quantile(sorted, 0.5),
      q1: quantile(sorted, 0.25),
      q3: quantile(sorted, 0.75),
      sdLog2: sd,
    });
  }
  return { rows, options: o };
}
