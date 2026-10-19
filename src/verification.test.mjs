// Verification tests: every number in Table 1 and Table S1 of the manuscript is
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

// ---------- Table S1: reproduce the simulation ----------
const T2 = [
  // [scale, key, median, q1, q3, sd, pSyn]
  [0, 'perfect', 0.75, 0.625, 1.0, 0.313, 0.0],
  [1, 'ladder', 0.75, 0.625, 1.0, 0.311, 0.0], [1, 'direct', 0.75, 0.625, 1.0, 0.314, 0.001], [1, 'serial', 0.75, 0.625, 1.0, 0.314, 0.001],
  [10, 'ladder', 0.75, 0.625, 0.75, 0.332, 0.0215], [10, 'direct', 0.75, 0.563, 1.0, 0.343, 0.027], [10, 'serial', 0.75, 0.625, 1.0, 0.338, 0.014],
  [30, 'ladder', 0.625, 0.508, 0.75, 0.469, 0.196], [30, 'direct', 0.563, 0.504, 0.75, 0.505, 0.233], [30, 'serial', 0.625, 0.508, 0.75, 0.410, 0.130],
];
test('Table S1 (simulation) is reproduced exactly (n = 2000, seed 12345, additive truth)', () => {
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


// ---------- Combination products with a partner at a fixed ratio ----------
test('Partner at a fixed ratio: co-dissolved powder, share of each concentration', () => {
  const abs = [
    { id: 1, name: 'Ampicillin', powderMg: 25.6, dissolveVolMl: 5, purityPct: 100, micMin: 0.5, micMax: 64, fixed: false, axis: 'column', partnerName: 'Sulbactam', partnerMainParts: 2, partnerParts: 1, partnerPurityPct: 100 },
    { id: 2, name: 'Colistin', powderMg: 1.28, dissolveVolMl: 20, purityPct: 100, micMin: 0.0625, micMax: 2, fixed: false, axis: 'row' },
  ];
  const p = planExperiment(abs, { ...DEFAULT_SETTINGS, numPlates: 5 });
  const r = p.abResults[0];
  near(r.partner.f, 0.5, 1e-12, 'f');
  near(r.partner.weighMg, 12.8, 1e-9, 'sulbactam to weigh (mg)');
  near(r.ladder.falcons[0].partnerFinal, r.ladder.falcons[0].finalConc / 2, 1e-9, 'partner final');
  near(r.ladder.falcons[0].partnerInFalcon, r.ladder.falcons[0].concInFalcon / 2, 1e-9, 'partner in tube');
  near(r.partner.usedMg, r.powderUsedMg / 2, 1e-9, 'partner powder used');
  assert.equal(p.abResults[1].partner, undefined);
});

test('Partner potency scales the powder to weigh; ratio 1:19 gives 19 parts', () => {
  const abs = [
    { id: 1, name: 'Trimethoprim', powderMg: 10, dissolveVolMl: 5, purityPct: 100, micMin: 0.25, micMax: 8, fixed: false, axis: 'column', partnerName: 'Sulfamethoxazole', partnerMainParts: 1, partnerParts: 19, partnerPurityPct: 95 },
    { id: 2, name: 'Colistin', powderMg: 1.28, dissolveVolMl: 20, purityPct: 100, micMin: 0.0625, micMax: 2, fixed: false, axis: 'row' },
  ];
  const r = planExperiment(abs, { ...DEFAULT_SETTINGS, numPlates: 2 }).abResults[0];
  near(r.partner.weighMg, (10 * 19) / 0.95, 1e-6, 'partner powder with 95% potency');
});

test('Fixed drug with a ratio partner reports the partner concentration in the well', () => {
  const abs = [
    { id: 1, name: 'Meropenem', powderMg: 25.6, dissolveVolMl: 5, purityPct: 100, micMin: 0.125, micMax: 128, fixed: false, axis: 'column' },
    { id: 2, name: 'Colistin', powderMg: 1.28, dissolveVolMl: 20, purityPct: 100, micMin: 0.03125, micMax: 2, fixed: false, axis: 'row' },
    { id: 3, name: 'Ampicillin', powderMg: 25.6, dissolveVolMl: 5, purityPct: 100, fixed: true, fixedConc: 8, axis: 'fixed', partnerName: 'Sulbactam', partnerMainParts: 2, partnerParts: 1, partnerPurityPct: 100 },
  ];
  const f = planExperiment(abs, { ...DEFAULT_SETTINGS, numPlates: 10 }).abResults[2];
  near(f.partnerFinalConc, 4, 1e-9, 'sulbactam in the well (ug/mL)');
  near(f.partner.weighMg, 12.8, 1e-9, 'sulbactam to weigh (mg)');
  near(f.volNeededFromPrimaryMl * 1000, 361.6, 0.1, 'primary volume is unchanged by the partner');
});

test('Old saved plans without partner fields still plan unchanged', () => {
  const abs = [
    { id: 1, name: 'Meropenem', powderMg: 25.6, dissolveVolMl: 5, purityPct: 100, micMin: 0.125, micMax: 128, fixed: false, axis: 'column' },
    { id: 2, name: 'Colistin', powderMg: 1.28, dissolveVolMl: 20, purityPct: 100, micMin: 0.03125, micMax: 2, fixed: false, axis: 'row' },
  ];
  const p = planExperiment(abs, { ...DEFAULT_SETTINGS, numPlates: 10 });
  assert.ok(p.abResults.every((r) => r.partner === undefined));
});

test('Separate parallel stocks: partner takes the same volume, broth shrinks, ladder limits each draw to 40%', () => {
  const mk = (mode) => [
    { id: 1, name: 'Ampicillin', powderMg: 25.6, dissolveVolMl: 5, purityPct: 100, micMin: 0.5, micMax: 64, fixed: false, axis: 'column', partnerName: 'Sulbactam', partnerMainParts: 2, partnerParts: 1, partnerPurityPct: 100, partnerMode: mode },
    { id: 2, name: 'Colistin', powderMg: 1.28, dissolveVolMl: 20, purityPct: 100, micMin: 0.0625, micMax: 2, fixed: false, axis: 'row' },
  ];
  const sep = planExperiment(mk('separate'), { ...DEFAULT_SETTINGS, numPlates: 5 }).abResults[0];
  const tog = planExperiment(mk('together'), { ...DEFAULT_SETTINGS, numPlates: 5 }).abResults[0];
  assert.equal(sep.partner.mode, 'separate');
  near(sep.partner.primaryStock, sep.primaryStock / 2, 1e-9, 'partner primary stock');
  sep.ladder.falcons.forEach((f) => {
    near(f.partnerDrawMl, f.volFromStock_mL, 1e-12, 'same volume from the partner stock');
    near(f.camhb_mL, f.totalMl - 2 * f.volFromStock_mL, 1e-9, 'broth');
    assert.ok(f.camhb_mL >= -1e-9, 'no negative broth');
    assert.ok(f.volFromStock_mL <= 0.4 * f.totalMl + 1e-9, 'each draw at most 40% of the tube');
  });
  tog.ladder.falcons.forEach((f) => near(f.camhb_mL, f.totalMl - f.volFromStock_mL, 1e-9, 'together: broth'));
});

test('Partner is a drug in its own right in displayResults (together and separate)', async () => {
  
  const base = (mode) => [
    { id: 1, name: 'Ampicillin', powderMg: 25.6, dissolveVolMl: 5, purityPct: 100, micMin: 0.5, micMax: 64, fixed: false, axis: 'column', partnerName: 'Sulbactam', partnerMainParts: 2, partnerParts: 1, partnerPurityPct: 95, partnerMode: mode },
    { id: 2, name: 'Gentamicin', powderMg: 10, dissolveVolMl: 5, purityPct: 100, micMin: 0.25, micMax: 8, fixed: false, axis: 'row' },
  ];
  for (const mode of ['together', 'separate']) {
    const p = planExperiment(base(mode), { ...DEFAULT_SETTINGS, numPlates: 2, stockScheme: "auto" });
    assert.equal(p.displayResults.length, 3);
    const [m, q] = p.displayResults;
    assert.equal(q.isPartner, true);
    assert.equal(q.name, 'Sulbactam');
    assert.equal(q.coDissolved, mode === 'together');
    near(q.powderMg, (25.6 * 0.5) / 0.95, 1e-3, 'partner weigh');
    near(q.primaryStock, m.primaryStock / 2, 1e-9, 'partner primary stock');
    q.ladder.falcons.forEach((f, i) => near(f.concInFalcon, m.ladder.falcons[i].concInFalcon / 2, 1e-9, 'tube conc'));
    q.ladder.stocks.forEach((s, i) => near(s.conc, m.ladder.stocks[i].conc / 2, 1e-9, 'stock conc'));
    assert.equal(p.abResults.length, 2); // the partner never becomes a plate axis
  }
});

// ---------- Pre-primary stocks (partner dissolved separately, then mixed into the Primary) ----------
test('Pre-primary: mass balance, volumes and concentrations of the mixed Primary', () => {
  for (const split of [undefined, 25, 50, 80]) {
    const abs = [
      { id: 1, name: 'Ceftazidime', powderMg: 40, dissolveVolMl: 10, purityPct: 90, micMin: 0.5, micMax: 64, fixed: false, axis: 'column', partnerName: 'Avibactam', partnerMainParts: 4, partnerParts: 1, partnerPurityPct: 98, partnerMode: 'together', partnerSplitPct: split },
      { id: 2, name: 'Gentamicin', powderMg: 10, dissolveVolMl: 5, purityPct: 100, micMin: 0.25, micMax: 8, fixed: false, axis: 'row' },
    ];
    const p = planExperiment(abs, { ...DEFAULT_SETTINGS, numPlates: 3, stockScheme: 'auto' });
    const m = p.abResults[0];
    const pre = m.partner.pre;
    assert.ok(pre, 'pre-primary block exists');
    const sp = split ?? 50;
    near(pre.partVolMl / pre.totalMl, sp / 100, 1e-12, 'partner share of volume');
    near(pre.mainVolMl + pre.partVolMl, 10, 1e-12, 'volumes add to the Primary volume');
    // mass balance: active drug weighed = concentration x volume of each pre-primary
    near((pre.mainConc * pre.mainVolMl) / 1000, 40 * 0.9, 1e-9, 'ceftazidime active mg');
    near((pre.partConc * pre.partVolMl) / 1000, (40 * 0.9) / 4, 1e-9, 'avibactam active mg');
    near(m.partner.weighMg * 0.98, (40 * 0.9) / 4, 1e-9, 'avibactam powder to weigh');
    // mixing the two gives the Primary
    near((pre.mainConc * pre.mainVolMl) / pre.totalMl, m.primaryStock, 1e-9, 'main Primary');
    near((pre.partConc * pre.partVolMl) / pre.totalMl, m.partner.primaryStock, 1e-9, 'partner Primary');
    near(m.partner.primaryStock / m.primaryStock, 0.25, 1e-12, 'ratio is kept in the Primary');
    const q = p.displayResults[1];
    assert.equal(q.isPartner, true);
    near(q.pre.partConc, pre.partConc, 1e-12, 'partner result carries its pre-primary');
  }
});

test('Separate mode has no pre-primary; every display result is finite', () => {
  const mk = (mode, fixedMain) => [
    { id: 1, name: 'Ampicillin', powderMg: 25.6, dissolveVolMl: 5, purityPct: 100, micMin: 0.5, micMax: 64, fixed: !!fixedMain, fixedConc: 8, axis: fixedMain ? 'fixed' : 'column', partnerName: 'Sulbactam', partnerMainParts: 2, partnerParts: 1, partnerPurityPct: 100, partnerMode: mode },
    { id: 2, name: 'Gentamicin', powderMg: 10, dissolveVolMl: 5, purityPct: 100, micMin: 0.25, micMax: 8, fixed: false, axis: 'row' },
    { id: 3, name: 'Meropenem', powderMg: 25, dissolveVolMl: 5, purityPct: 100, micMin: 0.125, micMax: 16, fixed: false, axis: 'column' },
  ];
  const finite = (o, path = '') => {
    if (typeof o === 'number') assert.ok(Number.isFinite(o), `non-finite number at ${path}`);
    else if (Array.isArray(o)) o.forEach((x, i) => finite(x, `${path}[${i}]`));
    else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) finite(v, `${path}.${k}`);
  };
  for (const mode of ['together', 'separate']) {
    for (const fixedMain of [false, true]) {
      const abs = fixedMain ? mk(mode, true).slice(0, 2) : mk(mode, false).slice(0, 2);
      const p = planExperiment(abs, { ...DEFAULT_SETTINGS, numPlates: 2, stockScheme: 'auto' });
      const m = p.abResults[0];
      assert.equal(!!m.partner.pre, mode === 'together', `${mode} fixed=${fixedMain}`);
      p.displayResults.forEach((r, i) => finite({ ...r, ladder: r.ladder }, `display[${i}]`));
    }
  }
});
