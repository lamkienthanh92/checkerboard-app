import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDilutionSeries,
  calcPrimaryStock,
  niceBelow,
  planExperiment,
  buildLayout,
  analyzeFici,
  interpretFici,
  DEFAULT_SETTINGS,
} from './calc.js';

const abs = (over = {}) => [
  {
    id: 1,
    name: 'Meropenem',
    powderMg: 25.6,
    dissolveVolMl: 5,
    purityPct: 100,
    micMin: 0.125,
    micMax: 128,
    fixed: false,
    fixedConc: '',
    axis: 'column',
    ...over,
  },
  {
    id: 2,
    name: 'Colistin',
    powderMg: 1.28,
    dissolveVolMl: 20,
    purityPct: 100,
    micMin: 0.0312,
    micMax: 2,
    fixed: false,
    fixedConc: '',
    axis: 'row',
  },
  {
    id: 3,
    name: 'Ampicillin/Sulbactam',
    powderMg: 25.6,
    dissolveVolMl: 5,
    purityPct: 100,
    micMin: '',
    micMax: '',
    fixed: true,
    fixedConc: 8,
    axis: 'fixed',
  },
];

test('dilution series is two-fold and tolerant of rounded minima', () => {
  assert.deepEqual(buildDilutionSeries(128, 0.125).length, 11);
  assert.equal(buildDilutionSeries(2, 0.0312).length, 7);
  assert.deepEqual(buildDilutionSeries(0, 1), []);
});

test('primary stock accounts for potency', () => {
  assert.equal(calcPrimaryStock(25.6, 5, 100), 5120);
  assert.equal(calcPrimaryStock(10, 1, 90), 9000);
  assert.equal(calcPrimaryStock('', 1, 100), null);
});

test('niceBelow picks 1-2-5 values', () => {
  assert.equal(niceBelow(512), 500);
  assert.equal(niceBelow(199), 100);
  assert.equal(niceBelow(0.7), 0.5);
});

test('defaults: no pipetting-limit violations, no drug shortage', () => {
  const p = planExperiment(abs(), DEFAULT_SETTINGS);
  const errors = p.messages.filter((m) => m.level === 'error');
  assert.deepEqual(errors, []);
  for (const r of p.abResults.filter((x) => x.type === 'variable')) {
    for (const f of r.ladder.falcons) {
      assert.ok(
        f.volFromStock_uL >= DEFAULT_SETTINGS.minVolUl - 1e-6,
        `${r.name} ${f.finalConc}: ${f.volFromStock_uL} µL`
      );
      assert.ok(f.volFromStock_mL <= f.totalMl + 1e-9);
    }
  }
});

test('working volume follows the number of plates (not the tube size)', () => {
  const p10 = planExperiment(abs(), DEFAULT_SETTINGS);
  const p2 = planExperiment(abs(), { ...DEFAULT_SETTINGS, numPlates: 2 });
  const mero10 = p10.abResults[0].workVolMl;
  const mero2 = p2.abResults[0].workVolMl;
  // 10 plates × 8 wells × 50 µL × 1.2 + 0.5 mL dead = 5.3 mL
  assert.equal(mero10, 5.3);
  assert.ok(mero2 < mero10);
  assert.ok(p2.abResults[0].powderUsedMg < p10.abResults[0].powderUsedMg);
});

test('meropenem needs a third stock level but not more', () => {
  const p = planExperiment(abs(), { ...DEFAULT_SETTINGS, numPlates: 10 });
  const l = p.abResults[0].ladder;
  assert.equal(l.stocks.length, 3, `levels: ${l.stocks.length}`);
  for (const s of l.stocks.slice(1)) {
    assert.ok(s.fromPrev_uL >= DEFAULT_SETTINGS.minVolUl - 1e-6);
  }
  const last = l.falcons[l.falcons.length - 1];
  assert.ok(last.volFromStock_uL >= 50);
});

test('drug mass is conserved: more solvent does not cure a shortage', () => {
  const short = { powderMg: 5 };
  const a = planExperiment(abs(short), DEFAULT_SETTINGS).abResults[0];
  const b = planExperiment(
    abs({ ...short, dissolveVolMl: 15 }),
    DEFAULT_SETTINGS
  ).abResults[0];
  assert.ok(a.volWarning, 'shortage must be flagged');
  assert.ok(b.volWarning, 'shortage persists with more solvent');
  // Required powder is (almost) independent of the solvent volume; small
  // differences come from minimum-volume rules for secondary stocks.
  assert.ok(
    Math.abs(a.volWarning.neededPowderMg - b.volWarning.neededPowderMg) /
      a.volWarning.neededPowderMg <
      0.1
  );
});

test('oversized batches are rejected against the tube size', () => {
  const p = planExperiment(abs(), {
    ...DEFAULT_SETTINGS,
    numPlates: 100,
    tubeMl: 15,
  });
  assert.ok(p.messages.some((m) => m.level === 'error' && /exceeds/.test(m.text)));
});

test('layout limits are enforced', () => {
  const p = planExperiment(abs({ micMin: 0.01 }), DEFAULT_SETTINGS);
  assert.ok(p.messages.some((m) => /exceeds 12 columns/.test(m.text)));
});

test('inoculum: 5e5 CFU/mL in well from 1.5e8 stock', () => {
  const p = planExperiment(abs(), DEFAULT_SETTINGS);
  assert.ok(Math.abs(p.dilFactor - 1 / 150) < 1e-12);
  assert.ok(p.camhbForBacMl > 0);
  assert.ok(Math.abs(p.volMcFarlandMl * 150 - p.bacVolMl) < 1e-9);
});

// ── FICI ──
const series = (n, top) => Array.from({ length: n }, (_, i) => top / 2 ** i);
function makeGrid(colS, rowS, inhibited) {
  const nR = rowS.length + 1;
  const nC = colS.length + 1;
  const g = [];
  for (let r = 0; r < nR; r++) {
    g.push([]);
    for (let c = 0; c < nC; c++) {
      const a = c < colS.length ? colS[c] : 0;
      const b = r < rowS.length ? rowS[r] : 0;
      g[r].push(!inhibited(a, b)); // true = growth
    }
  }
  return g;
}

test('additive interaction gives FICI = 1', () => {
  const colS = series(6, 32); // MIC_A = 8
  const rowS = series(6, 32); // MIC_B = 8
  const g = makeGrid(colS, rowS, (a, b) => a / 8 + b / 8 >= 1);
  const r = analyzeFici({ growth: g, colSeries: colS, rowSeries: rowS });
  assert.equal(r.micA.mic, 8);
  assert.equal(r.micB.mic, 8);
  assert.equal(r.min, 1);
  assert.equal(interpretFici(r.min), 'No interaction (additive / indifferent)');
});

test('strong synergy gives FICI ≤ 0.5', () => {
  const colS = series(6, 32);
  const rowS = series(6, 32);
  // Each drug alone: MIC 8. Together, 1 + 1 inhibits.
  const g = makeGrid(colS, rowS, (a, b) =>
    a >= 8 || b >= 8 || (a >= 1 && b >= 1)
  );
  const r = analyzeFici({ growth: g, colSeries: colS, rowSeries: rowS });
  assert.equal(r.min, 0.25);
  assert.equal(interpretFici(r.min), 'Synergy');
  assert.equal(r.best.ficA, 0.125);
  assert.equal(r.best.ficB, 0.125);
});

test('layout puts the drug-free row/column last', () => {
  const { grid, nC, nR } = buildLayout([4, 2, 1], [8, 4]);
  assert.equal(nC, 4);
  assert.equal(nR, 3);
  assert.deepEqual(grid[2][3], { used: true, a: 0, b: 0 });
  assert.equal(grid[3][0].used, false);
});

test('censored MIC is flagged', () => {
  const colS = series(4, 8);
  const rowS = series(4, 8);
  const allGrowth = makeGrid(colS, rowS, () => false);
  const r = analyzeFici({ growth: allGrowth, colSeries: colS, rowSeries: rowS });
  assert.equal(r.micA.censored, '>');
  assert.equal(r.micA.mic, 16);
});
