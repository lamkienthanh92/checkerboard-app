import test from 'node:test';
import assert from 'node:assert/strict';
import { planExperiment, DEFAULT_SETTINGS, buildDilutionSeries } from './calc.js';
import {
  parseOdMatrix, growthFromOd, inhibitionMatrix, blissExcess, analyzeReplicates, median, DEFAULT_CALL,
} from './analysis.js';
import { encodeShare, decodeShare, parseState, serializeState, planCsv, toCsv } from './io.js';
import { assignTubes, worklist, opentronsScript } from './robot.js';
import { simulateFici, mulberry32 } from './sim.js';

const abs = [
  { id: 1, name: 'Meropenem', powderMg: 25.6, dissolveVolMl: 5, purityPct: 100, micMin: 0.125, micMax: 128, fixed: false, fixedConc: '', axis: 'column' },
  { id: 2, name: 'Colistin', powderMg: 1.28, dissolveVolMl: 20, purityPct: 100, micMin: 0.0312, micMax: 2, fixed: false, fixedConc: '', axis: 'row' },
  { id: 3, name: 'Amp/Sul', powderMg: 25.6, dissolveVolMl: 5, purityPct: 100, micMin: '', micMax: '', fixed: true, fixedConc: 8, axis: 'fixed' },
];
const plan = planExperiment(abs, DEFAULT_SETTINGS);
const colS = plan.colRes.series;
const rowS = plan.rowRes.series;

const matrixText = (fn, sep = '\t') =>
  Array.from({ length: 8 }, (_, r) => Array.from({ length: 12 }, (_, c) => fn(r, c)).join(sep)).join('\n');

test('parseOdMatrix: plain, labelled, header and decimal comma', () => {
  assert.equal(parseOdMatrix(matrixText(() => 0.5, ',')).matrix[7][11], 0.5);
  const labelled = ['1 2 3 4 5 6 7 8 9 10 11 12']
    .concat(Array.from({ length: 8 }, (_, r) => `${'ABCDEFGH'[r]} ${Array(12).fill(0.25).join(' ')}`))
    .join('\n');
  assert.equal(parseOdMatrix(labelled).matrix[0][0], 0.25);
  const comma = matrixText(() => '0,75', ';');
  assert.equal(parseOdMatrix(comma).matrix[3][3], 0.75);
});

test('parseOdMatrix: clear errors', () => {
  assert.match(parseOdMatrix('1 2 3').error, /Expected 8 rows/);
  assert.match(parseOdMatrix(matrixText((r, c) => (r === 2 && c === 4 ? 'x' : 1))).error, /Row 3, column 5/);
  assert.match(parseOdMatrix('').error, /Nothing/);
});

test('parseOdMatrix: long format', () => {
  let t = 'row,col,od\n';
  for (let r = 0; r < 8; r++) for (let c = 0; c < 12; c++) t += `${'ABCDEFGH'[r]},${c + 1},${r + c / 100}\n`;
  const m = parseOdMatrix(t).matrix;
  assert.equal(m[2][5], 2.05);
  assert.match(parseOdMatrix(t.split('\n').slice(0, 50).join('\n')).error, /missing/);
});

test('growth calls follow inhibition relative to growth control', () => {
  const od = matrixText((r, c) => (c < 3 ? 0.05 : 1.0)).split('\n').map((l) => l.split('\t').map(Number));
  const g = growthFromOd(od, rowS.length, colS.length, DEFAULT_CALL);
  assert.equal(g.growth[0][0], false);
  assert.equal(g.growth[0][5], true);
  // blank subtraction
  const od2 = od.map((row) => row.map((v) => v + 0.1));
  const g2 = growthFromOd(od2, rowS.length, colS.length, { blank: 0.1, inhibitionCut: 90 });
  assert.deepEqual(g2.growth, g.growth);
  assert.match(inhibitionMatrix(od.map((r) => r.map(() => 0)), rowS.length, colS.length).error, /growth-control/);
});

test('Bliss excess is zero for independent action and positive for synergy', () => {
  const nR = rowS.length, nC = colS.length;
  const inh = Array.from({ length: nR + 1 }, (_, r) =>
    Array.from({ length: nC + 1 }, (_, c) => {
      const ea = c < nC ? Math.min(1, colS[c] / colS[0]) : 0;
      const eb = r < nR ? Math.min(1, rowS[r] / rowS[0]) : 0;
      return ea + eb - ea * eb;
    })
  );
  const b = blissExcess(inh, nR, nC);
  assert.ok(Math.abs(b.mean) < 1e-9);
  const syn = inh.map((row, r) => row.map((v, c) => (r < nR && c < nC ? Math.min(1, v + 0.3) : v)));
  assert.ok(blissExcess(syn, nR, nC).mean > 0.1);
});

test('replicates: median and range across plates', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  const mk = (micIdxA) =>
    ({ name: 'r', od: Array.from({ length: 8 }, (_, r) => Array.from({ length: 12 }, (_, c) => {
      if (r > rowS.length || c > colS.length) return 1;
      const a = c < colS.length ? colS[c] : 0;
      const b = r < rowS.length ? rowS[r] : 0;
      return a >= colS[micIdxA] || b >= rowS[2] ? 0.02 : 1;
    })) });
  const res = analyzeReplicates([mk(3), mk(3), mk(4)], colS, rowS);
  assert.equal(res.summary.n, 3);
  assert.equal(res.summary.micA.range[0], colS[4]);
  assert.equal(res.summary.micA.range[1], colS[3]);
  assert.equal(res.summary.micWithinOneStep, true);
});

test('share links and config files round-trip', () => {
  const state = { abs, cfg: DEFAULT_SETTINGS };
  const link = encodeShare(state);
  assert.ok(/^[A-Za-z0-9_-]+$/.test(link));
  assert.deepEqual(decodeShare('#s=' + link).state.abs, abs);
  assert.ok(parseState('{"a":1}').error);
  assert.ok(parseState('nope').error);
  assert.equal(parseState(serializeState(state)).state.cfg.numPlates, 10);
  const unicode = { abs: [{ ...abs[0], name: 'Meropenem µ ✓' }], cfg: {} };
  assert.equal(decodeShare(encodeShare(unicode)).state.abs[0].name, 'Meropenem µ ✓');
});

test('plan CSV has one row per tube and quotes commas', () => {
  const rows = planCsv(plan).trim().split('\n');
  const tubes = rows.filter((r) => /,tube /.test(r));
  assert.equal(tubes.length, colS.length + rowS.length);
  assert.equal(toCsv([['a,b', 'c"d']]), '"a,b","c""d"\n');
});

test('worklist: every dispense accounted for, volumes add up', () => {
  const lines = worklist(plan, DEFAULT_SETTINGS).trim().split('\n').slice(1).map((l) => l.split(','));
  const nC = colS.length + 1, nR = rowS.length + 1;
  assert.equal(lines.length, colS.length * nR + rowS.length * nC + nC * nR);
  const total = lines.reduce((a, l) => a + Number(l[l.length - 1]), 0);
  const expected = colS.length * nR * plan.volAbPerWellEach + rowS.length * nC * plan.volAbPerWellEach + nC * nR * plan.volBacPerWell;
  assert.ok(Math.abs(total - expected) < 1e-6);
  // each well gets exactly the well volume once all components are in (except the GC well: inoculum only)
  const per = {};
  for (const l of lines) per[l[4]] = (per[l[4]] || 0) + Number(l[5]);
  assert.equal(per.A1, 200);
  assert.equal(per.H12, plan.volBacPerWell);
  assert.equal(per.H1, 50 + 100);
});

test('tube racks scale with tube size', () => {
  assert.equal(assignTubes(plan, { ...DEFAULT_SETTINGS, tubeMl: 15 }).rackCount, 2);
  assert.equal(assignTubes(plan, { ...DEFAULT_SETTINGS, tubeMl: 50 }).rackCount, 3);
});

test('opentrons script is well formed text', () => {
  const s = opentronsScript(plan, DEFAULT_SETTINGS);
  assert.match(s, /def run\(protocol: protocol_api.ProtocolContext\)/);
  assert.match(s, /apiLevel": "2.13"/);
  assert.equal((s.match(/^    \("/gm) || []).length, colS.length + rowS.length);
});

test('simulation is deterministic and responds to the true interaction', () => {
  const a = mulberry32(1)(), b = mulberry32(1)();
  assert.equal(a, b);
  const syn = simulateFici(plan, DEFAULT_SETTINGS, { n: 300, trueFici: 0.5 });
  const add = simulateFici(plan, DEFAULT_SETTINGS, { n: 300, trueFici: 1 });
  const row = (r, k) => r.rows.find((x) => x.key === k);
  assert.ok(row(syn, 'perfect').median < row(add, 'perfect').median);
  assert.equal(row(syn, 'perfect').pFalseSynergy, 1);
  assert.equal(row(add, 'perfect').pFalseSynergy, 0);
  const again = simulateFici(plan, DEFAULT_SETTINGS, { n: 300, trueFici: 1 });
  assert.deepEqual(again.rows, add.rows);
});

test('simulation: at realistic pipetting error, preparation does not move FICI variability', () => {
  const r = simulateFici(plan, DEFAULT_SETTINGS, { n: 3000, trueFici: 1 });
  const ref = r.rows.find((x) => x.key === 'perfect');
  const se = ref.sdLog2 / Math.sqrt(2 * 3000);
  for (const x of r.rows) assert.ok(Math.abs(x.sdLog2 - ref.sdLog2) < 3 * se + 0.01, `${x.key}`);
});

test('series helper still tolerant', () => {
  assert.equal(buildDilutionSeries(2, 0.0312).length, 7);
});
