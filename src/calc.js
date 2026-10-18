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

/** Dilution factors that give round pipetting volumes (1 mL = 100 + 900 µL, 50 + 4950 µL, …). */
const NICE_D = [2, 4, 5, 8, 10, 16, 20, 25, 32, 40, 50, 64, 80, 100, 125, 128, 160, 200, 250, 320, 400, 500, 640, 800, 1000];
/** A tube may take at most this share of its volume from a stock (the rest is CAMHB). */
const MAX_TAKE_FRACTION = 0.8;
const MAX_SEARCH_LEAVES = 20000;
/** CLSI M07 Table 8A: the highest tube is 1 part stock + 9 parts broth. */
const CLSI_FIRST_STEP = 10;

const ceil1 = (x) => Math.ceil(x * 10 - 1e-9) / 10;

// ───────────────────────── stock ladder ─────────────────────────

/**
 * Build the stock ladder for one titrated drug.
 *
 * Tubes are visited from the highest to the lowest concentration. A tube takes
 * from the current stock while the volume to pipette is at least minVolUl.
 * Otherwise a new, more dilute stock is made from the current one (a linear
 * chain: Primary → Secondary → Tertiary → …). The dilution factor of each new
 * stock is searched among round factors so that the whole ladder has
 *   1. the fewest stock levels (each level adds a pipetting step),
 *   2. the least volume prepared beyond what the tubes draw,
 *   3. the least extreme dilution steps.
 * Volumes are then accumulated backwards so every parent stock carries what its
 * children need; a stock is rounded up to 0.1 mL.
 */
export function buildStockLadder({
  series,
  primaryStock,
  plateVol,
  volAbPerWellEach,
  workVolMl,
  minVolUl,
  minStockMl = 1,
  tubeMl = 50,
  scheme = 'auto',
}) {
  const issues = [];
  const falconConcs = series.map((s) => (s * plateVol) / volAbPerWellEach);
  const V = workVolMl;
  const n = falconConcs.length;

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

  /** Volumes for a given chain of stocks and tube → stock assignment. */
  const finalize = (chain, fIdx) => {
    const stocks = chain.map((c, k) => ({
      name: STOCK_NAMES[k] || `Level ${k + 1}`,
      conc: c.conc,
      fromStockIdx: c.from,
      volTaken_mL: 0,
      volNeeded_mL: 0,
    }));
    fIdx.forEach((si, i) => {
      stocks[si].volTaken_mL += (falconConcs[i] * V) / stocks[si].conc;
    });
    let waste = 0;
    let tooBig = null;
    for (let k = stocks.length - 1; k >= 0; k--) {
      const st = stocks[k];
      // The tube volume already carries the overage and the dead volume, so a
      // stock only needs what its tubes draw, rounded up to 0.1 mL.
      let vol = k > 0 ? ceil1(st.volTaken_mL) : st.volTaken_mL;
      if (k > 0) {
        const parent = stocks[st.fromStockIdx];
        const D = parent.conc / st.conc;
        vol = Math.max(vol, minStockMl, (minVolUl * D) / 1000);
        waste += vol - st.volTaken_mL;
        if (vol > tubeMl + 1e-9 && !tooBig) tooBig = { name: st.name, vol };
        st.fromPrev_uL = (vol * 1000) / D;
        st.camhb_mL = vol - st.fromPrev_uL / 1000;
        parent.volTaken_mL += st.fromPrev_uL / 1000;
        st.dilution = D;
      }
      st.volNeeded_mL = vol;
    }
    return { stocks, waste, tooBig };
  };

  let chosen; // { stocks, fIdx, notes }
  if (scheme === 'clsi') {
    // CLSI M07 Table 8A pattern: the top tube comes straight from the primary
    // stock; below it the stocks sit at the top concentration and then every
    // three two-fold steps (8-fold apart). Each stock serves the tubes 1:2,
    // 1:4 and 1:8 below it (1+1, 1+3 and 1+7 parts).
    const chain = [{ conc: primaryStock, from: null }];
    const fIdx = [];
    for (let i = 0; i < n; i++) {
      let cur = 0;
      if (i > 0) {
        cur = Math.floor((i - 1) / 3) + 1;
        while (chain.length <= cur) {
          const j = chain.length;
          chain.push({ conc: falconConcs[3 * (j - 1)], from: j - 1 });
        }
      }
      fIdx.push(cur);
    }
    chosen = { ...finalize(chain, fIdx), fIdx, notes: [] };
  } else {
    let best = null;
    let leaves = 0;
    const better = (a, b) => {
      // a, b: { levels, waste, sumLogD }
      if (a.levels !== b.levels) return a.levels < b.levels;
      const wa = Math.round(a.waste * 100);
      const wb = Math.round(b.waste * 100);
      if (wa !== wb) return wa < wb;
      return a.sumLogD < b.sumLogD - 1e-9;
    };
    const walk = (i0, chain, fIdx0) => {
      if (leaves > MAX_SEARCH_LEAVES) return;
      const cur = chain.length - 1;
      let i = i0;
      let fIdx = fIdx0;
      while (i < n) {
        const takeUl = (falconConcs[i] * V * 1000) / chain[cur].conc;
        if (takeUl < minVolUl - 1e-6) break;
        fIdx = [...fIdx, cur];
        i++;
      }
      if (i === n) {
        leaves++;
        const f = finalize(chain, fIdx);
        const cand = {
          ...f,
          fIdx,
          levels: chain.length,
          sumLogD: chain.reduce((a, c, k) => a + (k ? Math.log(chain[c.from].conc / c.conc) : 0), 0),
          notes: chain.map((c) => c.note).filter(Boolean),
          ok: !f.tooBig,
        };
        if (!best || (cand.ok && !best.ok) || (cand.ok === best.ok && better(cand, best))) best = cand;
        return;
      }
      if (best && best.ok && chain.length + 1 > best.levels) return; // cannot beat the best
      const fc = falconConcs[i];
      const parent = chain[cur].conc;
      const cMax = (fc * V * 1000) / minVolUl; // the tube must take ≥ minVolUl
      const cMin = fc / MAX_TAKE_FRACTION; // and at most 80% of its volume
      const options = NICE_D.filter((D) => parent / D <= cMax * (1 + 1e-9) && parent / D >= cMin * (1 - 1e-9))
        .sort((a, b) => b - a)
        .map((D) => ({ conc: parent / D, from: cur }));
      if (!options.length) {
        // No round factor fits: fall back to a 1–2–5 concentration inside the window.
        const upper = Math.min(cMax, parent / 2);
        const lower = Math.max(cMin, parent / 1000);
        let cNew = niceAbove(lower);
        if (cNew > upper) cNew = niceBelow(upper);
        let note;
        if (cNew < fc) {
          note = `Cannot find a stock for ${fmtConc(fc)} µg/mL that satisfies the ${minVolUl} µL minimum; using ${fmtConc(upper)} µg/mL.`;
          cNew = upper;
        }
        options.push({ conc: cNew, from: cur, note });
      }
      for (const o of options) walk(i, [...chain, o], fIdx);
    };
    walk(0, [{ conc: primaryStock, from: null }], []);
    chosen = best;
  }

  const { stocks, fIdx, tooBig } = chosen;
  (chosen.notes || []).forEach((t) => issues.push(t));
  if (tooBig) {
    issues.push(
      `${tooBig.name} stock would need ${fmt(tooBig.vol, 1)} mL, more than the ${tubeMl} mL tube. Use a larger tube, a larger minimum stock step or fewer plates.`
    );
  }

  const falcons = falconConcs.map((fc, i) => {
    const si = fIdx[i];
    const stockConc = stocks[si].conc;
    const volFromStock_mL = (fc * V) / stockConc;
    return {
      falconIdx: i + 1,
      finalConc: series[i],
      concInFalcon: fc,
      stockIdx: si,
      stockName: stocks[si].name,
      stockConc,
      volFromStock_uL: volFromStock_mL * 1000,
      volFromStock_mL,
      camhb_mL: V - volFromStock_mL,
      totalMl: V,
      belowMinPipette: volFromStock_mL * 1000 < minVolUl - 1e-6,
    };
  });

  if (scheme === 'clsi') {
    const low = falcons.find((f) => f.belowMinPipette);
    if (low) {
      issues.push(
        `With the CLSI scheme the tube of ${fmtConc(low.finalConc)} µg/mL needs ${fmt(low.volFromStock_uL, 1)} µL from its stock, below the ${minVolUl} µL minimum. Use a larger working volume (more plates) or switch to the automatic ladder.`
      );
    }
  }

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
  reservoirCapMl: 8, // working capacity of one well of a 12-well reagent reservoir (check the product)
  minStockMl: 1,
  inocDeadMl: '', // dead volume of the inoculum vessel (tube, Petri dish or trough); blank = same as deadMl
  camhbAvailMl: '', // optional: broth available (mL); blank = not limiting
  stockScheme: 'auto', // 'auto' (fewest steps above the minimum pipetting volume) or 'clsi' (M07 Table 8A pattern)
  bacTargetCfu: 500000,
  bacStockCfu: 150000000,
};

/** Defaults of the web interface: the inoculum goes into a Petri dish or trough, which holds back more liquid than a tube. */
export const APP_SETTINGS = { ...DEFAULT_SETTINGS, inocDeadMl: 10 };

/** Broth (CAMHB) to prepare, split by use. Stock dilutions, working tubes and the inoculum suspension. */
export function brothBreakdown(plan) {
  let stocks = 0;
  let tubes = 0;
  plan.abResults.forEach((r) => {
    if (r.ladder) {
      r.ladder.stocks.slice(1).forEach((st) => { stocks += st.camhb_mL || 0; });
      r.ladder.falcons.forEach((f) => { tubes += f.camhb_mL || 0; });
    }
  });
  const inoculum = plan.camhbForBacMl || 0;
  return { stocks, tubes, inoculum, total: stocks + tubes + inoculum };
}

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
        (num(s.inocDeadMl) || s.deadMl)
    );

  const abResults = abs.map((ab0) => {
    // CLSI scheme: the user gives the pack size (mg in the vial); the tool dissolves
    // the whole vial so that the primary stock is 10× the highest tube (1 + 9, Table 8A).
    let ab = ab0;
    let autoPrimary = false;
    if (s.stockScheme === 'clsi' && ab0.fixed) {
      // A fixed drug goes into the inoculum, not into a ladder: dissolve the whole
      // vial as a 100× stock of its concentration in the bacterial suspension.
      const mg = num(ab0.powderMg);
      const pot = num(ab0.purityPct);
      const fc = num(ab0.fixedConc);
      if (mg > 0 && pot > 0 && fc > 0) {
        const target = (fc / bacFrac) * 100;
        ab = { ...ab0, dissolveVolMl: Number(((mg * 1000 * (pot / 100)) / target).toPrecision(6)) };
        autoPrimary = true;
      }
    }
    if (s.stockScheme === 'clsi' && !ab0.fixed) {
      const ser = buildDilutionSeries(num(ab0.micMax), num(ab0.micMin));
      const mg = num(ab0.powderMg);
      const pot = num(ab0.purityPct);
      if (ser.length && mg > 0 && pot > 0) {
        const target = ((ser[0] * s.plateVol) / volAbPerWellEach) * CLSI_FIRST_STEP;
        ab = { ...ab0, dissolveVolMl: Number(((mg * 1000 * (pot / 100)) / target).toPrecision(6)) };
        autoPrimary = true;
      }
    }
    const name = ab.name || 'Antibiotic';
    const primaryStock = calcPrimaryStock(
      ab.powderMg,
      ab.dissolveVolMl,
      ab.purityPct
    );
    const base = { ...ab, name, primaryStock, autoPrimary };
    if (!primaryStock) {
      add(
        'error',
        `${name}: enter ${s.stockScheme === 'clsi' && !ab.fixed ? 'pack size, potency and a valid concentration range' : 'powder mass, solvent volume and potency'}.`,
        ab.id
      );
    }
    const availableMl = num(ab.dissolveVolMl) || 0;
    if (autoPrimary && availableMl > 50) {
      add(
        'warning',
        `${name}: the whole vial needs ${fmt(availableMl, 0)} mL of solvent for this primary stock. Dissolve only part of the vial (keep the ratio mg : mL) if that is impractical.`,
        ab.id
      );
    }

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
        minStockMl: s.minStockMl,
        tubeMl: s.tubeMl,
        scheme: s.stockScheme,
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
    if (maxLevels > 3 && s.stockScheme !== 'clsi') {
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


/**
 * How many plates can the weighed material supply? Re-plans for 1, 2, 3 … plates and
 * reports, for each resource, the last plate count that is still feasible.
 * Resources: powder of each drug, tube size (volume of one working tube) and,
 * if entered, the broth available. Returns null when the base plan cannot be made.
 */
export function planCapacity(abs, s, maxN = 500) {
  const broth = num(s.camhbAvailMl) || 0;
  const probe = (n) => {
    const p = planExperiment(abs, { ...s, numPlates: n });
    let camhb = p.camhbForBacMl || 0;
    p.abResults.forEach((r) => {
      if (r.ladder) {
        r.ladder.stocks.slice(1).forEach((st) => { camhb += st.camhb_mL || 0; });
        r.ladder.falcons.forEach((f) => { camhb += f.camhb_mL || 0; });
      }
    });
    const limits = {};
    p.abResults.forEach((r) => {
      limits['powder:' + r.id] = !r.volWarning;
      if (r.type === 'variable') limits['tube'] = (limits['tube'] ?? true) && r.workVolMl <= s.tubeMl;
    });
    if (broth > 0) limits['camhb'] = camhb <= broth;
    return { p, limits, camhb };
  };
  const first = probe(1);
  const other = first.p.messages.some((m) => m.level === 'error' && !/powder|exceeds the|needs .* mL of/.test(m.text));
  if (other) return null;
  const names = Object.fromEntries(first.p.abResults.map((r) => ['powder:' + r.id, r.name + ' powder']));
  names.tube = 'tube size'; names.camhb = 'broth';
  const max = {};
  const open = new Set(Object.keys(first.limits));
  Object.keys(first.limits).forEach((k) => { max[k] = 0; });
  for (let n = 1; n <= maxN && open.size; n++) {
    const { limits } = n === 1 ? first : probe(n);
    [...open].forEach((k) => {
      if (limits[k]) max[k] = n; else open.delete(k);
    });
  }
  const best = Math.min(...Object.values(max));
  const limiting = Object.keys(max).filter((k) => max[k] === best).map((k) => names[k]);
  const atBest = best >= 1 ? probe(best) : null;
  const leftover = atBest
    ? atBest.p.abResults.map((r) => ({
        name: r.name,
        weighedMg: num(abs.find((a) => a.id === r.id)?.powderMg),
        usedMg: r.powderUsedMg,
      }))
    : [];
  return {
    best,
    limiting,
    perResource: Object.keys(max).map((k) => ({ name: names[k], max: max[k] })),
    leftover,
    camhbMl: atBest?.camhb ?? null,
    capped: best >= maxN,
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

// ───────────────────────── reservoir (multichannel) loading ─────────────────────────

/**
 * Loading with 12-well reagent reservoirs and a multichannel pipette.
 *  - Column drug: one reservoir well per column, a 12-channel pipette fills one row per pass
 *    (nR passes per plate; the drug-free column is a well of plain broth).
 *  - Row drug: one reservoir well per row, tips 1..nR fill one column per pass (nC passes per plate).
 *  - Inoculum: one trough, a row per pass (nR passes).
 * Each channel keeps drawing from the same well, so no tip ever meets another concentration.
 */
export function planReservoirLoading(plan, s) {
  const { colRes, rowRes } = plan;
  if (!colRes?.series?.length || !rowRes?.series?.length) return null;
  const nC = colRes.series.length + 1;
  const nR = rowRes.series.length + 1;
  const cap = num(s.reservoirCapMl) || 8;
  const dead = num(s.deadMl) || 0;
  const over = 1 + (num(s.bufferPct) || 0) / 100;
  const V = plan.volAbPerWellEach / 1000; // mL per well per drug
  const issues = [];

  const reservoir = (concs, passes, name, labelOf) => {
    const drawPerPlate = passes * V;
    const fit = Math.floor((cap - dead) / (drawPerPlate * over) + 1e-9);
    const platesPerFill = Math.max(0, Math.min(fit, s.numPlates));
    const fills = platesPerFill > 0 ? Math.ceil(s.numPlates / platesPerFill) : null;
    const pourMl = platesPerFill > 0 ? ceil1(platesPerFill * drawPerPlate * over + dead) : null;
    if (platesPerFill < 1) {
      issues.push(`${name}: one plate needs ${fmt(drawPerPlate * over + dead, 1)} mL per reservoir well, above the ${cap} mL capacity. Use a larger reservoir or a lower well volume.`);
    }
    return {
      name,
      passes,
      channels: concs.length,
      drawPerPlateMl: drawPerPlate,
      platesPerFill,
      fills,
      pourMl,
      wells: concs.map((c, i) => ({ label: labelOf(i), conc: c, blank: c === 0 })),
    };
  };

  const col = reservoir([...colRes.series, 0], nR, colRes.name, (i) => String(i + 1));
  const row = reservoir([...rowRes.series, 0], nC, rowRes.name, (i) => String.fromCharCode(65 + i));
  const inoc = {
    passes: nR,
    drawPerPlateMl: (nR * nC * plan.volBacPerWell) / 1000,
    perWellMl: (nR * plan.volBacPerWell) / 1000, // if the same suspension fills all wells of a 12-well reservoir
  };
  const multi = col.passes + row.passes + inoc.passes;
  const single = 3 * nR * nC;
  return { nC, nR, col, row, inoc, steps: { multi, single, ratio: single / multi }, cap, issues };
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
