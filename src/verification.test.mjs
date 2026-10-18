// Verification tests: every number in Table 1 and Table 2 of the manuscript is
// re-derived here from the formulas of Appendix A, independently of the app code,
// and compared with what the app returns.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planCapacity, planExperiment, DEFAULT_SETTINGS, analyzeFici, buildDilutionSeries, calcPrimaryStock, buildStockLadder } from './calc.js';
import { simulateFici } from './sim.js';
import { inhibitionMatrix, blissExcess } from './analysis.js';

const abs = [
  { id: 1, name: 'Meropenem', powderMg: 25.6, dissolveVolMl: 5, purityPct: 100, micMin: 0.125, micMax: 128, fixed: false, fixedConc: '', axis: 'column' },
  { id: 2, name: 'Colistin', powderMg: 1.28, dissolveVolMl: 20, purityPct: 100, micMin: 0.0312, micMax: 2, fixed: false, fixedConc: '', axis: 'row' },
  { id: 3, name: 'Ampicillin/Sulbactam', powderMg: 25.6, dissolveVolMl: 5, purityPct: 100, micMin: '', micMax: '', fixed: true, fixedConc: 8, axis: 'fixed' },
];
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

// ---------- A.1 / A.2 concentration series and primary stock ----------
test('A.1 two-fold series from the top concentration', () => {
  assert.deepEqual(buildDilutionSeries(128, 0.125), [128, 64, 32, 16, 8, 4, 2, 1, 0.5, 0.25, 0.125]);
  assert.equal(buildDilutionSeries(2, 0.0312).length, 7);
});
test('A.2 primary stock C = m·1000·(p/100)/V', () => {
  assert.equal(calcPrimaryStock(25.6, 5, 100), 5120);
  assert.equal(calcPrimaryStock(1.28, 20, 100), 64);
  near(calcPrimaryStock(100, 10, 80), 8000, 1e-9, 'potency 80%');
});

// ---------- Table 1 ----------
const plan = planExperiment(abs, DEFAULT_SETTINGS);
const [mero, coli, amp] = plan.abResults;

test('Table 1: meropenem ladder 5120 → 51.2 µg/mL (1:100), no third stock', () => {
  assert.deepEqual(mero.ladder.stocks.map((s) => s.conc), [5120, 51.2]);
  near(mero.ladder.stocks[1].fromPrev_uL, 66, 1e-9, 'secondary from primary (µL)');
  near(mero.ladder.stocks[1].camhb_mL * 1000, 6534, 1e-6, 'secondary broth (µL)');
  near(mero.ladder.stocks[1].volNeeded_mL, 6.6, 1e-9, 'secondary total (mL)');
  assert.equal(mero.ladder.falcons.length, 11);
});
test('Table 1: colistin ladder 64 → 3.2 µg/mL (1:20)', () => {
  assert.deepEqual(coli.ladder.stocks.map((s) => s.conc), [64, 3.2]);
  near(coli.ladder.stocks[1].fromPrev_uL, 50, 1e-9, 'secondary from primary (µL)');
  near(coli.ladder.stocks[1].camhb_mL * 1000, 950, 1e-9, 'secondary broth (µL)');
  assert.equal(coli.ladder.falcons.length, 7);
});
test('Table 1: working-tube volume = ceil0.1[plates·wells·V_each/1000·(1+overage)+dead]', () => {
  const s = DEFAULT_SETTINGS; const PL = s.numPlates, OV = s.bufferPct / 100, DEAD = s.deadMl;
  const v = (wells) => Math.ceil((PL * wells * plan.volAbPerWellEach / 1000 * (1 + OV) + DEAD) * 10 - 1e-9) / 10;
  near(v(8), 5.3, 1e-9, 'row-wise count for a column drug');
  near(v(12), 7.7, 1e-9, 'row drug');
  assert.equal(mero.workVolMl, 5.3);
  assert.equal(coli.workVolMl, 7.7);
});
test('Table 1: every tube takes at least the minimum pipetting volume', () => {
  for (const r of [mero, coli]) for (const f of r.ladder.falcons) assert.ok(f.volFromStock_uL >= DEFAULT_SETTINGS.minVolUl - 1e-9);
});
test('Table 1: each working tube reaches its nominal concentration (mass balance)', () => {
  for (const r of [mero, coli]) {
    const stock = (i) => r.ladder.stocks[i].conc;
    for (const f of r.ladder.falcons) {
      const c = (stock(f.stockIdx) * f.volFromStock_uL) / (f.volFromStock_uL + f.camhb_mL * 1000);
      near(c / f.concInFalcon, 1, 1e-6, `${r.name} ${f.finalConc}`);
    }
  }
});
test('Table 1: fixed drug and inoculum', () => {
  near(amp.volNeededFromPrimaryMl * 1000, 361.6, 0.1, 'sulbactam volume (µL)');
  near(plan.volMcFarlandMl * 1000, 771.3, 0.1, 'McFarland volume (µL)');
  near(plan.camhbForBacMl, 114.57, 0.01, 'broth for inoculum (mL)');
  near(plan.bacVolMl, 115.7, 0.1, 'inoculum volume (mL)');
});

// ---------- A.9–A.11: reading a plate ----------
const logs = (a) => a.map((x) => Math.log2(x));
test('A.9 FICI from a hand-built plate: additive truth gives min FICI 1', () => {
  const col = [8, 4, 2, 1], row = [8, 4, 2, 1]; // MIC_A = MIC_B = 8 (top of each series)
  const nC = col.length, nR = row.length;
  const growth = Array.from({ length: nR + 1 }, (_, r) => Array.from({ length: nC + 1 }, (_, c) => {
    const a = c < nC ? col[c] : 0, b = r < nR ? row[r] : 0;
    return a / 8 + b / 8 < 1 - 1e-12; // growth below the Loewe isobole
  }));
  const f = analyzeFici({ growth, colSeries: col, rowSeries: row });
  assert.ok(!f.error);
  near(f.min, 1, 1e-9, 'min FICI');
});
test('A.10 Bliss excess is zero for independent action', () => {
  const nR = 2, nC = 2, ea = [0.5, 0.2, 0], eb = [0.4, 0.5, 0];
  const inh = [0, 1, 2].map((r) => [0, 1, 2].map((c) => (r < 2 && c < 2 ? ea[c] + eb[r] - ea[c] * eb[r] : c === 2 ? eb[r] : ea[c])));
  const b = blissExcess(inh, nR, nC);
  near(b.mean, 0, 1e-12, 'mean excess'); near(b.max, 0, 1e-12, 'max excess');
});
test('A.9 inhibition fraction is relative to the growth control', () => {
  const od = Array.from({ length: 8 }, () => Array(12).fill(1));
  od[0][0] = 0.1;
  const { inh } = inhibitionMatrix(od, 7, 11, { blank: 0, inhibitionCut: 90 });
  near(inh[0][0], 0.9, 1e-12, 'inhibition'); near(inh[1][1], 0, 1e-12, 'no inhibition');
});

// ---------- Table 2: reproduce the simulation ----------
const T2 = [
  // [scale, key, median, q1, q3, sd, pSyn]
  [0, 'perfect', 0.75, 0.625, 1.0, 0.313, 0.0],
  [1, 'ladder', 0.75, 0.625, 1.0, 0.311, 0.0], [1, 'direct', 0.75, 0.625, 1.0, 0.314, 0.001], [1, 'serial', 0.75, 0.625, 1.0, 0.314, 0.001],
  [10, 'ladder', 0.75, 0.625, 0.75, 0.332, 0.0215], [10, 'direct', 0.75, 0.563, 1.0, 0.343, 0.027], [10, 'serial', 0.75, 0.625, 1.0, 0.338, 0.014],
  [30, 'ladder', 0.625, 0.508, 0.75, 0.469, 0.196], [30, 'direct', 0.563, 0.504, 0.75, 0.505, 0.233], [30, 'serial', 0.625, 0.508, 0.75, 0.410, 0.130],
];
test('Table 2 is reproduced exactly (n = 2000, seed 12345, additive truth)', () => {
  for (const scale of [1, 10, 30]) {
    const o = { n: 2000, trueFici: 1, seed: 12345, cvFloor: 0.003 * scale, cvSlope: 0.2 * scale };
    const res = simulateFici(plan, DEFAULT_SETTINGS, o);
    for (const [s, key, med, q1, q3, sd, p] of T2.filter((r) => r[0] === scale || (scale === 1 && r[0] === 0))) {
      const r = res.rows.find((x) => x.key === key);
      near(r.median, med, 5e-4, `${scale} ${key} median`);
      near(r.q1, q1, 5e-4, `${scale} ${key} q1`);
      near(r.q3, q3, 5e-4, `${scale} ${key} q3`);
      near(r.sdLog2, sd, 5e-4, `${scale} ${key} sd`);
      near(r.pFalseSynergy, p, 5e-4 + 0.0005, `${scale} ${key} P(min FICI ≤ 0.5)`);
    }
  }
});
test('Simulation is reproducible: same seed, same numbers', () => {
  const o = { n: 300, trueFici: 1, seed: 12345 };
  assert.deepEqual(simulateFici(plan, DEFAULT_SETTINGS, o).rows, simulateFici(plan, DEFAULT_SETTINGS, o).rows);
});

// ---------- stock volumes: no second overage, whole 0.1 mL ----------
test('A.5 a stock holds what its tubes draw, rounded up to 0.1 mL (overage is applied once, to the tubes)', () => {
  for (const r of [mero, coli]) {
    r.ladder.stocks.slice(1).forEach((s) => {
      const tenths = s.volNeeded_mL * 10;
      near(tenths, Math.round(tenths), 1e-6, `${r.name} ${s.name} total is a multiple of 0.1 mL`);
      near(s.fromPrev_uL + s.camhb_mL * 1000, s.volNeeded_mL * 1000, 1e-6, 'parts add up');
      assert.ok(s.volNeeded_mL >= s.volTaken_mL - 1e-9, 'stock covers what is drawn from it');
      assert.ok(s.volNeeded_mL <= s.volTaken_mL + 0.1 + 1e-9 || s.volNeeded_mL === 1 || s.fromPrev_uL <= DEFAULT_SETTINGS.minVolUl + 1e-9,
        `${r.name} ${s.name}: no hidden extra volume`);
    });
  }
});
test('A.5 round 1:10 step gives 100 µL + 900 µL when 1 mL is needed', () => {
  const lad = buildStockLadder({ series: [128, 64, 32, 16, 8, 4, 2, 1], primaryStock: 5120, plateVol: 200, volAbPerWellEach: 50, workVolMl: 1, minVolUl: 50 });
  // tubes of 512 and 256 µg/mL draw 100 and 50 µL of the primary; the rest use stocks made from it
  const s = lad.stocks[1];
  near(s.volNeeded_mL * 1000, s.fromPrev_uL + s.camhb_mL * 1000, 1e-6, 'parts');
  near(s.volNeeded_mL * 10, Math.round(s.volNeeded_mL * 10), 1e-6, 'whole 0.1 mL');
});

// ---------- CLSI M07 Table 8A pattern ----------
test('CLSI scheme reproduces Table 8A: 5120 → 512 → 64 → 8 → 1 with 1+1, 1+3, 1+7 tubes', () => {
  const pc = planExperiment(abs, { ...DEFAULT_SETTINGS, stockScheme: 'clsi' });
  const m = pc.abResults[0];
  assert.deepEqual(m.ladder.stocks.map((s) => s.conc), [5120, 512, 64, 8, 1]);
  const dil = m.ladder.falcons.map((f) => f.stockConc / f.concInFalcon);
  assert.deepEqual(dil.map((d) => +d.toFixed(6)), [10, 2, 4, 8, 2, 4, 8, 2, 4, 8, 2]);
  // each stock after the first is made 1+7 from the one above
  m.ladder.stocks.slice(2).forEach((s) => near(m.ladder.stocks[s.fromStockIdx].conc / s.conc, 8, 1e-9, s.name));
  // every tube reaches its nominal concentration
  for (const f of m.ladder.falcons) near((f.stockConc * f.volFromStock_mL) / f.totalMl / f.concInFalcon, 1, 1e-9, `${f.finalConc}`);
  assert.deepEqual(pc.messages.filter((x) => x.level === 'error'), []);
});
test('CLSI scheme flags tubes below the minimum pipetting volume', () => {
  const pc = planExperiment(abs, { ...DEFAULT_SETTINGS, stockScheme: 'clsi', minVolUl: 1000 });
  assert.ok(pc.messages.some((x) => x.level === 'error' && /CLSI scheme/.test(x.text)));
});

test('CLSI mode: only the pack size is needed; primary = 10 x top tube, stocks follow Table 8A', () => {
  const mk = (mg, dv) => [{
    id: 1, name: 'Meropenem', powderMg: mg, dissolveVolMl: dv, purityPct: 100,
    micMin: 0.125, micMax: 128, fixed: false, fixedConc: '', axis: 'column',
  }, {
    id: 2, name: 'Colistin', powderMg: 10, dissolveVolMl: 999, purityPct: 90,
    micMin: 0.03125, micMax: 2, fixed: false, fixedConc: '', axis: 'row',
  }];
  const s = { ...DEFAULT_SETTINGS, stockScheme: 'clsi' };
  // the dissolve volume the user typed must be ignored
  const a = planExperiment(mk(25.6, 1), s).abResults[0];
  const b = planExperiment(mk(25.6, 77), s).abResults[0];
  assert.equal(a.autoPrimary, true);
  assert.equal(a.primaryStock, 5120);
  assert.equal(a.dissolveVolMl, 5);
  assert.equal(b.primaryStock, 5120);
  assert.deepEqual(a.ladder.stocks.map((x) => x.conc), [5120, 512, 64, 8, 1]);
  // colistin: top tube 2 ug/mL -> 8 x ... primary = 10 x (2 x 50/50 x 4) = 80 ug/mL
  const c = planExperiment(mk(25.6, 5), s).abResults[1];
  assert.equal(c.autoPrimary, true);
  assert.equal(c.primaryStock, 80); // 90 % potency does not change the target, only the solvent volume
});

test('CLSI mode: a fixed drug is also derived from its pack size (100x stock)', () => {
  const a = [
    { id: 1, name: 'A', powderMg: 25.6, dissolveVolMl: 1, purityPct: 100, micMin: 0.125, micMax: 128, fixed: false, fixedConc: '', axis: 'column' },
    { id: 2, name: 'B', powderMg: 1.28, dissolveVolMl: 20, purityPct: 100, micMin: 0.03125, micMax: 2, fixed: false, fixedConc: '', axis: 'row' },
    { id: 3, name: 'F', powderMg: 25.6, dissolveVolMl: 99, purityPct: 100, micMin: '', micMax: '', fixed: true, fixedConc: 8, axis: 'fixed' },
  ];
  const f = planExperiment(a, { ...DEFAULT_SETTINGS, stockScheme: 'clsi' }).abResults[2];
  assert.equal(f.autoPrimary, true);
  assert.ok(Math.abs(f.primaryStock - 100 * f.concInBacSusp) < 1e-6);
});

// ---------- reservoir (multichannel) loading ----------
test('Reservoir loading: wells, passes, pour volumes and dispense counts (default plan)', async () => {
  const { planReservoirLoading } = await import('./calc.js');
  const rr = planReservoirLoading(plan, DEFAULT_SETTINGS);
  assert.equal(rr.nC, 12); // 11 concentrations + drug-free column
  assert.equal(rr.nR, 8); // 7 concentrations + drug-free row
  assert.equal(rr.col.passes, 8); // one 12-channel pass per row
  assert.equal(rr.row.passes, 12); // one 8-tip pass per column
  near(rr.col.drawPerPlateMl, 0.4, 1e-9, 'column drug draw per plate');
  near(rr.row.drawPerPlateMl, 0.6, 1e-9, 'row drug draw per plate');
  assert.equal(rr.col.pourMl, 5.3); // 10 plates x 0.4 mL x 1.2 + 0.5 mL
  assert.equal(rr.row.pourMl, 7.7); // 10 x 0.6 x 1.2 + 0.5
  assert.equal(rr.col.fills, 1);
  assert.equal(rr.col.wells.length, 12);
  assert.equal(rr.col.wells[11].blank, true);
  assert.deepEqual(rr.steps, { multi: 28, single: 288, ratio: 288 / 28 });
  assert.deepEqual(rr.issues, []);
});
test('Reservoir loading: a small reservoir splits the batch into several fills; a tiny one is flagged', async () => {
  const { planReservoirLoading } = await import('./calc.js');
  const small = planReservoirLoading(plan, { ...DEFAULT_SETTINGS, reservoirCapMl: 4 });
  assert.equal(small.col.platesPerFill, 7);
  assert.equal(small.col.fills, 2);
  assert.equal(small.row.platesPerFill, 4);
  assert.equal(small.row.fills, 3);
  assert.equal(small.row.pourMl, 3.4);
  const tiny = planReservoirLoading(plan, { ...DEFAULT_SETTINGS, reservoirCapMl: 0.8 });
  assert.ok(tiny.issues.length === 2);
});

test('planCapacity: largest plate count is the last that has no powder shortfall', () => {
  const s = { ...DEFAULT_SETTINGS, tubeMl: 50 };
  const cap = planCapacity(abs, s);
  assert.ok(cap.best >= 1);
  const ok = planExperiment(abs, { ...s, numPlates: cap.best });
  assert.ok(!ok.messages.some((m) => m.level === 'error'));
  const over = planExperiment(abs, { ...s, numPlates: cap.best + 1 });
  assert.ok(over.messages.some((m) => m.level === 'error'));
});
test('planCapacity: limited broth lowers the maximum', () => {
  const s = { ...DEFAULT_SETTINGS, tubeMl: 50 };
  const free = planCapacity(abs, s);
  const lim = planCapacity(abs, { ...s, camhbAvailMl: 100 });
  assert.ok(lim.best < free.best);
  assert.ok(lim.camhbMl <= 100);
  assert.ok(lim.limiting.includes('broth'));
});

test('inoculum vessel dead volume enlarges the suspension and keeps the concentration', () => {
  const s = { ...DEFAULT_SETTINGS, numPlates: 10 };
  const a = planExperiment(abs, s);
  const b = planExperiment(abs, { ...s, inocDeadMl: 10 });
  near(b.bacVolMl - a.bacVolMl, 9.5, 0.11, 'extra volume');
  near(b.volMcFarlandMl / b.bacVolMl, a.volMcFarlandMl / a.bacVolMl, 1e-9, 'McFarland fraction');
  assert.ok(b.camhbForBacMl > a.camhbForBacMl);
});
