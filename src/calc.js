// calc.js — pure calculation and analysis logic (no React).
//
// Conventions
//  - Concentrations are in µg/mL, volumes in mL unless the name ends in _uL.
//  - "final" concentration = concentration in the well after all additions.
//  - "working" (falcon) concentration = concentration in the tube that is
//    dispensed into the plate (final × plateVol / volume of that drug per well).

export const PLATE_ROWS = 8;
export const PLATE_COLS = 12;
export const STOCK_NAMES = [
  'Primary',
  'Secondary',
  'Tertiary',
  'Quaternary',
  'Quinary',
  'Senary',
];

// ───────────────────────── formatting ─────────────────────────

export function fmt(n, dec = 2) {
  if (n === undefined || n === null || !Number.isFinite(n)) return '—';
  return Number(n.toFixed(dec)).toLocaleString('en-US', {
    maximumFractionDigits: dec,
  });
}

/** Concentration with up to 4 significant digits, no grouping (0.03125, 5120). */
export function fmtConc(n) {
  if (n === undefined || n === null || !Number.isFinite(n)) return '—';
  return String(Number(n.toPrecision(4)));
}

const num = (v) => {
  const x = parseFloat(v);
  return Number.isFinite(x) ? x : NaN;
};

// ───────────────────────── basic helpers ─────────────────────────

/** Two-fold series from max down to (about) min, inclusive. */
export function buildDilutionSeries(max, min) {
  if (!(max > 0) || !(min > 0) || max < min) return [];
  const series = [];
  let v = max;
  // 1% tolerance so that e.g. 0.0312 (typed) includes 0.03125 (true 2-fold step)
  while (v >= min * 0.99 && series.length < 24) {
    series.push(Number(v.toPrecision(4)));
    v /= 2;
  }
  return series;
}

/** Primary stock concentration (µg/mL) = mg × 1000 × potency / mL. */
export function calcPrimaryStock(powderMg, dissolveVolMl, purityPct) {
  const m = num(powderMg);
  const v = num(dissolveVolMl);
  const p = num(purityPct);
  if (!(m > 0) || !(v > 0) || !(p > 0)) return null;
  return (m * 1000 * (p / 100)) / v;
}

/** Largest value of the form {1,2,5}×10^k that is ≤ x. */
export function niceBelow(x) {
  if (!(x > 0)) return 0;
  const base = Math.pow(10, Math.floor(Math.log10(x)));
  for (const m of [5, 2, 1]) {
    if (m * base <= x * (1 + 1e-9)) return m * base;
  }
  return base;
}

/** Smallest value of the form {1,2,5}×10^k that is ≥ x. */
export function niceAbove(x) {
  if (!(x > 0)) return 0;
  const base = Math.pow(10, Math.floor(Math.log10(x)));
  for (const m of [1, 2, 5, 10]) {
    if (m * base >= x * (1 - 1e-9)) return m * base;
  }
  return 10 * base;
}

const MAX_DILUTION_STEP = 100;

const ceil1 = (x) => Math.ceil(x * 10 - 1e-9) / 10;

// ───────────────────────── stock ladder ─────────────────────────

/**
 * Build the stock ladder for one titrated drug.
 *
 * Falcons are visited from the highest to the lowest concentration. Each falcon
 * takes from the current stock as long as the volume to pipette is at least
 * minVolUl; otherwise a new, more dilute stock is made from the current one
 * (a linear chain: Primary → Secondary → Tertiary → …). Volumes are then
 * accumulated backwards so every parent stock carries what its children need.
 */
export function buildStockLadder({
  series,
  primaryStock,
  plateVol,
  volAbPerWellEach,
  workVolMl,
  minVolUl,
  bufferPct,
  minStockMl = 1,
}) {
  const issues = [];
  const buffer = 1 + bufferPct / 100;
  const falconConcs = series.map((s) => (s * plateVol) / volAbPerWellEach);

  if (falconConcs[0] > primaryStock) {
    issues.push(
      `Primary stock (${fmtConc(primaryStock)} µg/mL) is lower than the highest working concentration (${fmtConc(falconConcs[0])} µg/mL). Dissolve the powder in less solvent or lower the top concentration.`
    );
  }
  if ((workVolMl * 1000) / minVolUl < 2) {
    issues.push(
      `Working volume (${fmt(workVolMl, 1)} mL) is less than twice the minimum pipetting volume (${minVolUl} µL); a stock ladder cannot be built.`
    );
  }

  const stocks = [
    {
      name: STOCK_NAMES[0],
      conc: primaryStock,
      fromStockIdx: null,
      volTaken_mL: 0,
      volNeeded_mL: 0,
    },
  ];
  const falconStockIdx = [];
  let cur = 0;

  for (let i = 0; i < falconConcs.length; i++) {
    const fc = falconConcs[i];
    let takeUl = (fc * workVolMl * 1000) / stocks[cur].conc;
    if (takeUl < minVolUl - 1e-6) {
      // A stock of concentration C serves every falcon whose pipetting volume
      // fc·V/C lies between minVolUl and the tube volume. To serve as many of
      // the following (lower) falcons as possible, take C as low as is still
      // practical: the current falcon draws ≤ ~50% of the tube, and a single
      // dilution step is at most MAX_DILUTION_STEP-fold.
      const parentConc = stocks[cur].conc;
      const maxByPipette = (fc * workVolMl * 1000) / minVolUl;
      const upper = Math.min(maxByPipette, parentConc / 2);
      const lower = Math.max(2 * fc, parentConc / MAX_DILUTION_STEP);
      let cNew = niceAbove(lower);
      if (cNew > upper) cNew = niceBelow(upper);
      if (cNew < fc) {
        issues.push(
          `Cannot find a stock for ${fmtConc(fc)} µg/mL that satisfies the ${minVolUl} µL minimum; using ${fmtConc(upper)} µg/mL.`
        );
        cNew = upper;
      }
      stocks.push({
        name: STOCK_NAMES[stocks.length] || `Level ${stocks.length + 1}`,
        conc: cNew,
        fromStockIdx: cur,
        volTaken_mL: 0,
        volNeeded_mL: 0,
      });
      cur = stocks.length - 1;
      takeUl = (fc * workVolMl * 1000) / stocks[cur].conc;
    }
    falconStockIdx.push(cur);
    stocks[cur].volTaken_mL += takeUl / 1000;
  }

  // Backward accumulation of the volume each stock must hold.
  for (let k = stocks.length - 1; k >= 0; k--) {
    const s = stocks[k];
    let vol = s.volTaken_mL * buffer;
    if (k > 0) {
      const parent = stocks[s.fromStockIdx];
      const D = parent.conc / s.conc; // dilution factor
      vol = Math.max(vol, minStockMl, (minVolUl * D) / 1000);
      s.fromPrev_uL = (vol * 1000) / D;
      s.camhb_mL = vol - s.fromPrev_uL / 1000;
      parent.volTaken_mL += s.fromPrev_uL / 1000;
    }
    s.volNeeded_mL = vol;
  }

  const falcons = falconConcs.map((fc, i) => {
    const si = falconStockIdx[i];
    const stockConc = stocks[si].conc;
    const volFromStock_mL = (fc * workVolMl) / stockConc;
    return {
      falconIdx: i + 1,
      finalConc: series[i],
      concInFalcon: fc,
      stockIdx: si,
      stockName: stocks[si].name,
      stockConc,
      volFromStock_uL: volFromStock_mL * 1000,
      volFromStock_mL,
      camhb_mL: workVolMl - volFromStock_mL,
      totalMl: workVolMl,
      belowMinPipette: volFromStock_mL * 1000 < minVolUl - 1e-6,
    };
  });

  return {
    stocks,
    falcons,
    falconConcs,
    workVolMl,
    totalFromPrimary_mL: stocks[0].volNeeded_mL,
    issues,
  };
}

// ───────────────────────── full plan ─────────────────────────

export const DEFAULT_SETTINGS = {
  plateVol: 200,
  abFracPct: 50,
  numPlates: 10,
  bufferPct: 20,
  tubeMl: 50,
  minVolUl: 50,
  deadMl: 0.5,
  minStockMl: 1,
  bacTargetCfu: 500000,
  bacStockCfu: 150000000,
};

function powderNeededMg(volMl, primaryStock, purityPct) {
  // active mg = mL × (µg/mL) / 1000; powder mg = active / potency
  return (volMl * primaryStock) / 1000 / (num(purityPct) / 100);
}

/**
 * Compute the whole plan.
 * @param abs array of antibiotic definitions (see DEFAULT_ABS in App.jsx)
 * @param s   settings (see DEFAULT_SETTINGS)
 */
export function planExperiment(abs, s) {
  const messages = []; // {level: 'error' | 'warning', text, abId?}
  const add = (level, text, abId) => messages.push({ level, text, abId });

  const abFrac = s.abFracPct / 100;
  const bacFrac = 1 - abFrac;
  const volAbPerWell = s.plateVol * abFrac;
  const volBacPerWell = s.plateVol * bacFrac;

  const variable = abs.filter((a) => !a.fixed);
  const colDrugs = variable.filter((a) => a.axis === 'column');
  const rowDrugs = variable.filter((a) => a.axis === 'row');
  if (colDrugs.length !== 1 || rowDrugs.length !== 1) {
    add(
      'warning',
      `A checkerboard needs exactly one drug titrated across columns and one down rows (currently ${colDrugs.length} column, ${rowDrugs.length} row). Extra drugs should be fixed-concentration.`
    );
  }
  // Two titrated drugs share the drug volume of each well equally.
  const nTitrated = Math.max(1, Math.min(2, variable.length));
  const volAbPerWellEach = volAbPerWell / nTitrated;

  // Inoculum suspension volume covers every well of every plate.
  const bacVolMl =
    ceil1(
      (s.numPlates * PLATE_ROWS * PLATE_COLS * volBacPerWell) / 1000 *
        (1 + s.bufferPct / 100) +
        s.deadMl
    );

  const abResults = abs.map((ab) => {
    const name = ab.name || 'Antibiotic';
    const primaryStock = calcPrimaryStock(
      ab.powderMg,
      ab.dissolveVolMl,
      ab.purityPct
    );
    const base = { ...ab, name, primaryStock };
    if (!primaryStock) {
      add(
        'error',
        `${name}: enter powder mass, solvent volume and potency.`,
        ab.id
      );
    }
    const availableMl = num(ab.dissolveVolMl) || 0;

    if (ab.fixed) {
      const finalConc = num(ab.fixedConc) || 0;
      if (!(finalConc > 0)) add('error', `${name}: enter a fixed concentration.`, ab.id);
      const concInBacSusp = finalConc / bacFrac;
      const volNeededFromPrimaryMl = primaryStock
        ? (concInBacSusp * bacVolMl) / primaryStock
        : null;
      let volWarning = null;
      if (volNeededFromPrimaryMl && volNeededFromPrimaryMl > availableMl) {
        volWarning = {
          neededMl: volNeededFromPrimaryMl,
          availableMl,
          neededPowderMg: powderNeededMg(
            volNeededFromPrimaryMl,
            primaryStock,
            ab.purityPct
          ),
          availablePowderMg: num(ab.powderMg),
        };
        add(
          'error',
          `${name}: needs ${fmt(volWarning.neededPowderMg, 1)} mg of powder but only ${fmt(volWarning.availablePowderMg, 1)} mg is available.`,
          ab.id
        );
      }
      if (volNeededFromPrimaryMl && volNeededFromPrimaryMl * 1000 < s.minVolUl) {
        add(
          'warning',
          `${name}: ${fmt(volNeededFromPrimaryMl * 1000, 1)} µL of primary stock is below the ${s.minVolUl} µL minimum; make an intermediate dilution first.`,
          ab.id
        );
      }
      return {
        ...base,
        type: 'fixed',
        finalConc,
        concInBacSusp,
        volNeededFromPrimaryMl,
        powderUsedMg: volNeededFromPrimaryMl
          ? powderNeededMg(volNeededFromPrimaryMl, primaryStock, ab.purityPct)
          : null,
        volWarning,
      };
    }

    const series = buildDilutionSeries(num(ab.micMax), num(ab.micMin));
    if (!series.length) {
      add('error', `${name}: enter a valid concentration range (max ≥ min > 0).`, ab.id);
    }
    const wellsPerConc = ab.axis === 'row' ? PLATE_COLS : PLATE_ROWS;
    const workVolMl = ceil1(
      (s.numPlates * wellsPerConc * volAbPerWellEach) / 1000 *
        (1 + s.bufferPct / 100) +
        s.deadMl
    );
    if (workVolMl > s.tubeMl) {
      add(
        'error',
        `${name}: each concentration needs ${fmt(workVolMl, 1)} mL (${s.numPlates} plates × ${wellsPerConc} wells), which exceeds the ${s.tubeMl} mL tube. Use a larger tube or fewer plates per batch.`,
        ab.id
      );
    }

    let ladder = null;
    let volWarning = null;
    if (series.length && primaryStock) {
      ladder = buildStockLadder({
        series,
        primaryStock,
        plateVol: s.plateVol,
        volAbPerWellEach,
        workVolMl,
        minVolUl: s.minVolUl,
        bufferPct: s.bufferPct,
        minStockMl: s.minStockMl,
      });
      ladder.issues.forEach((t) => add('error', `${name}: ${t}`, ab.id));
      const needed = ladder.totalFromPrimary_mL;
      if (needed > availableMl + 1e-9) {
        // Mass is conserved: dissolving in more solvent does NOT help.
        volWarning = {
          neededMl: needed,
          availableMl,
          neededPowderMg: powderNeededMg(needed, primaryStock, ab.purityPct),
          availablePowderMg: num(ab.powderMg),
        };
        add(
          'error',
          `${name}: needs ${fmt(volWarning.neededPowderMg, 1)} mg of powder (${fmt(needed, 2)} mL of primary stock) but only ${fmt(volWarning.availablePowderMg, 1)} mg is available. Dissolving in more solvent does not add drug; weigh more powder, use fewer plates, or lower the overage.`,
          ab.id
        );
      }
    }

    const maxLevels = ladder ? ladder.stocks.length : 0;
    if (maxLevels > 3) {
      add(
        'warning',
        `${name}: the ladder needs ${maxLevels} stock levels; each extra level adds pipetting error. Consider a narrower range.`,
        ab.id
      );
    }

    return {
      ...base,
      type: 'variable',
      series,
      ladder,
      wellsPerConc,
      workVolMl,
      volWarning,
      powderUsedMg: ladder
        ? powderNeededMg(ladder.totalFromPrimary_mL, primaryStock, ab.purityPct)
        : null,
    };
  });

  // Layout checks (zero-drug row/column is added automatically).
  const colRes = abResults.find((r) => r.type === 'variable' && r.axis === 'column');
  const rowRes = abResults.find((r) => r.type === 'variable' && r.axis === 'row');
  if (colRes && colRes.series.length + 1 > PLATE_COLS) {
    add(
      'error',
      `${colRes.name}: ${colRes.series.length} concentrations + 1 drug-free column exceeds ${PLATE_COLS} columns.`,
      colRes.id
    );
  }
  if (rowRes && rowRes.series.length + 1 > PLATE_ROWS) {
    add(
      'error',
      `${rowRes.name}: ${rowRes.series.length} concentrations + 1 drug-free row exceeds ${PLATE_ROWS} rows.`,
      rowRes.id
    );
  }

  // Inoculum
  const dilFactor = s.bacTargetCfu / bacFrac / s.bacStockCfu;
  const volMcFarlandMl = dilFactor * bacVolMl;
  const fixedVolMl = abResults
    .filter((r) => r.type === 'fixed')
    .reduce((a, r) => a + (r.volNeededFromPrimaryMl || 0), 0);
  const camhbForBacMl = bacVolMl - volMcFarlandMl - fixedVolMl;
  if (dilFactor >= 1) {
    add('error', 'Target inoculum is higher than the McFarland stock; check the CFU values.');
  }
  if (camhbForBacMl < 0) {
    add('error', 'Fixed-drug and McFarland volumes exceed the suspension volume.');
  }
  if (volMcFarlandMl * 1000 < s.minVolUl) {
    add(
      'warning',
      `Only ${fmt(volMcFarlandMl * 1000, 1)} µL of McFarland suspension is needed, below the ${s.minVolUl} µL minimum. Make an intermediate 1:10 dilution of the McFarland suspension and use ${fmt(volMcFarlandMl * 10000, 0)} µL of it.`
    );
  }

  return {
    abFrac,
    bacFrac,
    volAbPerWell,
    volAbPerWellEach,
    volBacPerWell,
    bacVolMl,
    abResults,
    dilFactor,
    volMcFarlandMl,
    camhbForBacMl,
    messages,
    colRes,
    rowRes,
  };
}

// ───────────────────────── plate layout ─────────────────────────

/**
 * 8×12 grid. Column drug runs left→right (highest first), row drug runs
 * top→bottom (highest first). The last used column/row is drug-free (0).
 */
export function buildLayout(colSeries = [], rowSeries = []) {
  const nC = colSeries.length + 1;
  const nR = rowSeries.length + 1;
  const grid = [];
  for (let r = 0; r < PLATE_ROWS; r++) {
    const line = [];
    for (let c = 0; c < PLATE_COLS; c++) {
      if (r < nR && c < nC) {
        line.push({
          used: true,
          a: c < colSeries.length ? colSeries[c] : 0,
          b: r < rowSeries.length ? rowSeries[r] : 0,
        });
      } else {
        line.push({ used: false });
      }
    }
    grid.push(line);
  }
  return { grid, nC, nR };
}

// ───────────────────────── FICI analysis ─────────────────────────

/** Concentration at which a series becomes inhibited, scanning from the top. */
function micFromAxis(inhibitedFlags, concs) {
  let idx = -1;
  for (let i = 0; i < concs.length; i++) {
    if (!inhibitedFlags[i]) break;
    idx = i;
  }
  if (idx === -1) {
    return { mic: 2 * concs[0], censored: '>', note: 'no inhibition at the top concentration; MIC taken as 2× the top concentration' };
  }
  if (idx === concs.length - 1) {
    return { mic: concs[idx], censored: '≤', note: 'inhibited at the lowest concentration; true MIC may be lower' };
  }
  return { mic: concs[idx], censored: '', note: '' };
}

/**
 * Analyse a checkerboard.
 * @param growth boolean[row][col], true = visible growth
 * @param colSeries concentrations of the column drug (highest first, no zero)
 * @param rowSeries concentrations of the row drug (highest first, no zero)
 */
export function analyzeFici({ growth, colSeries, rowSeries }) {
  const nC = colSeries.length;
  const nR = rowSeries.length;
  if (!nC || !nR) return { error: 'Both drugs need a concentration series.' };

  const inh = (r, c) => !growth[r][c];
  // Drug-alone rows/columns: drug-free row is index nR, drug-free column nC.
  const micA = micFromAxis(
    colSeries.map((_, c) => inh(nR, c)),
    colSeries
  );
  const micB = micFromAxis(
    rowSeries.map((_, r) => inh(r, nC)),
    rowSeries
  );

  // Interface wells: per row, the lowest A concentration still inhibiting
  // (contiguous from the top); per column, the lowest B likewise.
  const wells = new Map();
  const put = (r, c) => {
    const a = colSeries[c];
    const b = rowSeries[r];
    const fa = a / micA.mic;
    const fb = b / micB.mic;
    wells.set(`${r},${c}`, {
      row: r,
      col: c,
      a,
      b,
      ficA: fa,
      ficB: fb,
      fici: fa + fb,
    });
  };
  for (let r = 0; r < nR; r++) {
    let last = -1;
    for (let c = 0; c < nC; c++) {
      if (!inh(r, c)) break;
      last = c;
    }
    if (last >= 0) put(r, last);
  }
  for (let c = 0; c < nC; c++) {
    let last = -1;
    for (let r = 0; r < nR; r++) {
      if (!inh(r, c)) break;
      last = r;
    }
    if (last >= 0) put(last, c);
  }
  const list = [...wells.values()].sort((x, y) => x.fici - y.fici);
  if (!list.length) {
    return { micA, micB, wells: [], error: 'No inhibited combination wells were marked.' };
  }
  const values = list.map((w) => w.fici);
  const min = values[0];
  const max = values[values.length - 1];
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return { micA, micB, wells: list, min, max, mean, best: list[0] };
}

/** Common interpretation: ≤0.5 synergy, >0.5–4 no interaction, >4 antagonism. */
export function interpretFici(f) {
  if (!Number.isFinite(f)) return '—';
  if (f <= 0.5) return 'Synergy';
  if (f <= 4) return 'No interaction (additive / indifferent)';
  return 'Antagonism';
}
