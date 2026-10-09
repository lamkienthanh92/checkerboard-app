// io.js — CSV export, state save/load, share links, file download helpers.

import { fmtConc } from './calc.js';

const q = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(rows) {
  return rows.map((r) => r.map(q).join(',')).join('\n') + '\n';
}

/** One row per working tube plus one row per intermediate stock. */
export function planCsv(plan) {
  const rows = [
    ['drug', 'role', 'item', 'final_conc_ug_per_mL', 'tube_conc_ug_per_mL', 'source', 'take_uL', 'diluent_uL', 'total_uL'],
  ];
  for (const r of plan.abResults) {
    if (r.type === 'fixed') {
      rows.push([r.name, 'fixed', 'add to inoculum', r.finalConc, '', 'Primary', r.volNeededFromPrimaryMl ? +(r.volNeededFromPrimaryMl * 1000).toFixed(2) : '', '', '']);
      continue;
    }
    if (!r.ladder) continue;
    r.ladder.stocks.forEach((s, i) => {
      rows.push([
        r.name,
        r.axis,
        `stock ${s.name}`,
        '',
        +s.conc.toPrecision(4),
        i === 0 ? 'powder' : r.ladder.stocks[s.fromStockIdx].name,
        i === 0 ? '' : +s.fromPrev_uL.toFixed(2),
        i === 0 ? '' : +(s.camhb_mL * 1000).toFixed(2),
        i === 0 ? '' : +(s.volNeeded_mL * 1000).toFixed(1),
      ]);
    });
    r.ladder.falcons.forEach((f) => {
      rows.push([
        r.name,
        r.axis,
        `tube ${r.axis === 'row' ? String.fromCharCode(64 + f.falconIdx) : f.falconIdx}`,
        f.finalConc,
        +f.concInFalcon.toPrecision(4),
        f.stockName,
        +f.volFromStock_uL.toFixed(2),
        +(f.camhb_mL * 1000).toFixed(1),
        +(f.totalMl * 1000).toFixed(0),
      ]);
    });
  }
  return toCsv(rows);
}

/** Per-replicate results table. */
export function resultsCsv(analysis, colName, rowName) {
  const rows = [['replicate', `mic_${colName}`, `mic_${rowName}`, 'fici_min', 'fici_mean', 'fici_max', 'bliss_mean_excess']];
  for (const p of analysis.per) {
    if (p.error || !p.fici || p.fici.error) {
      rows.push([p.name, '', '', '', '', '', '']);
      continue;
    }
    rows.push([
      p.name,
      `${p.fici.micA.censored}${fmtConc(p.fici.micA.mic)}`,
      `${p.fici.micB.censored}${fmtConc(p.fici.micB.mic)}`,
      +p.fici.min.toFixed(4),
      +p.fici.mean.toFixed(4),
      +p.fici.max.toFixed(4),
      +p.bliss.mean.toFixed(4),
    ]);
  }
  return toCsv(rows);
}

// ───────────────────────── state ─────────────────────────

export function serializeState(state) {
  return JSON.stringify({ app: 'checkerboard-planner', version: 1, ...state });
}

export function parseState(text) {
  let d;
  try {
    d = JSON.parse(text);
  } catch {
    return { error: 'Not valid JSON.' };
  }
  if (!d || d.app !== 'checkerboard-planner' || !Array.isArray(d.abs) || typeof d.cfg !== 'object') {
    return { error: 'This file is not a Checkerboard Planner configuration.' };
  }
  return { state: d };
}

const b64 = {
  enc: (s) => {
    const bytes = new TextEncoder().encode(s);
    let bin = '';
    bytes.forEach((b) => (bin += String.fromCharCode(b)));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  dec: (t) => {
    const s = t.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  },
};

/** Only the plan inputs go into links (not plate data) to keep URLs short. */
export function encodeShare(state) {
  return b64.enc(serializeState(state));
}

export function decodeShare(hash) {
  try {
    return parseState(b64.dec(hash.replace(/^#/, '').replace(/^s=/, '')));
  } catch {
    return { error: 'Could not read the link.' };
  }
}

// ───────────────────────── browser helpers ─────────────────────────

export function download(filename, text, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
