import { useMemo, useRef, useState } from 'react';
import { Field, Metric, S, btn, wellCell } from './ui.jsx';
import { PLATE_COLS, PLATE_ROWS, fmt, fmtConc, interpretFici } from './calc.js';
import { analyzeReplicates, odFromGrowth, parseOdMatrix } from './analysis.js';
import { download, resultsCsv } from './io.js';

const blankOd = () => Array.from({ length: PLATE_ROWS }, () => Array(PLATE_COLS).fill(1));

export function newReplicate(name) {
  return { id: Math.random().toString(36).slice(2, 8), name, od: blankOd() };
}

function Isobologram({ wells, nameA, nameB }) {
  const W = 260;
  const pad = 36;
  const max = 2;
  const sx = (v) => pad + ((W - 2 * pad) * Math.min(v, max)) / max;
  const sy = (v) => W - pad - ((W - 2 * pad) * Math.min(v, max)) / max;
  return (
    <svg width={W} height={W} role="img" aria-label="Isobologram of interface wells" style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8 }}>
      <line x1={pad} y1={W - pad} x2={W - pad} y2={W - pad} stroke="#9ca3af" />
      <line x1={pad} y1={W - pad} x2={pad} y2={pad} stroke="#9ca3af" />
      {[0, 0.5, 1, 1.5, 2].map((t) => (
        <g key={t} fontSize={9} fill="#6b7280">
          <text x={sx(t)} y={W - pad + 12} textAnchor="middle">{t}</text>
          <text x={pad - 6} y={sy(t) + 3} textAnchor="end">{t}</text>
        </g>
      ))}
      <line x1={sx(1)} y1={sy(0)} x2={sx(0)} y2={sy(1)} stroke="#6b7280" strokeWidth={1.5} />
      <line x1={sx(0.5)} y1={sy(0)} x2={sx(0)} y2={sy(0.5)} stroke="#15803d" strokeDasharray="4 3" />
      <text x={sx(0.52)} y={sy(0.18)} fontSize={8} fill="#15803d">FICI 0.5</text>
      <text x={sx(0.62)} y={sy(0.5)} fontSize={8} fill="#6b7280">additive (1)</text>
      {wells.map((w) => (
        <circle key={`${w.row},${w.col}`} cx={sx(w.ficA)} cy={sy(w.ficB)} r={4} fill="#3b82f6" fillOpacity={0.8}>
          <title>{`A=${fmtConc(w.a)}, B=${fmtConc(w.b)}: FICI ${fmt(w.fici, 3)}`}</title>
        </circle>
      ))}
      <text x={W / 2} y={W - 6} fontSize={9} textAnchor="middle" fill="#374151">FIC {nameA}</text>
      <text x={10} y={W / 2} fontSize={9} textAnchor="middle" fill="#374151" transform={`rotate(-90 10 ${W / 2})`}>FIC {nameB}</text>
    </svg>
  );
}

const heat = (x) => {
  // diverging: green = more inhibition than Bliss (synergy), orange = less (antagonism)
  const a = Math.min(1, Math.abs(x) / 0.6);
  return x >= 0 ? `rgba(34,197,94,${a})` : `rgba(249,115,22,${a})`;
};

export default function AnalysisTab({ plan, colSeries, rowSeries, layout, reps, setReps, call, setCall }) {
  const [sel, setSel] = useState(0);
  const [convention, setConvention] = useState('min');
  const [paste, setPaste] = useState('');
  const [msg, setMsg] = useState('');
  const fileRef = useRef(null);

  const nC = colSeries.length;
  const nR = rowSeries.length;
  const ready = nC > 0 && nR > 0;
  const idx = Math.min(sel, reps.length - 1);
  const rep = reps[idx];

  const analysis = useMemo(
    () => (ready ? analyzeReplicates(reps, colSeries, rowSeries, call) : null),
    [ready, reps, colSeries, rowSeries, call]
  );
  const cur = analysis?.per[idx];

  if (!ready) {
    return (
      <div style={S.card}>
        <div style={S.h}>FICI analysis</div>
        <div style={{ color: '#92400e', fontSize: 13 }}>
          Define one drug titrated across columns and one down rows first.
        </div>
      </div>
    );
  }

  const setOd = (id, od) => setReps((p) => p.map((r) => (r.id === id ? { ...r, od } : r)));
  const gcOd = rep.od[nR][nC];

  const toggle = (r, c) => {
    if (r === nR && c === nC) return; // growth control cannot be toggled
    const growthNow = cur?.growth ? cur.growth[r][c] : true;
    const next = rep.od.map((row) => row.slice());
    next[r][c] = growthNow ? call.blank : gcOd;
    setOd(rep.id, next);
  };

  const load = (text) => {
    const res = parseOdMatrix(text);
    if (res.error) return setMsg(res.error);
    setOd(rep.id, res.matrix);
    setMsg(`Loaded 96 wells into ${rep.name}.`);
  };

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const fr = new FileReader();
    fr.onload = () => load(String(fr.result));
    fr.readAsText(f);
    e.target.value = '';
  };

  const addRep = () => {
    setReps((p) => [...p, newReplicate(`R${p.length + 1}`)]);
    setSel(reps.length);
  };
  const removeRep = () => {
    if (reps.length === 1) return;
    setReps((p) => p.filter((r) => r.id !== rep.id));
    setSel(0);
  };

  const loadExample = () => {
    const make = (name, shiftA, shiftB) => {
      const micA = colSeries[Math.min(3 + shiftA, nC - 1)];
      const micB = rowSeries[Math.min(2 + shiftB, nR - 1)];
      const od = Array.from({ length: PLATE_ROWS }, (_, r) =>
        Array.from({ length: PLATE_COLS }, (_, c) => {
          if (r > nR || c > nC) return 1;
          const a = c < nC ? colSeries[c] : 0;
          const b = r < nR ? rowSeries[r] : 0;
          const inhibited = a >= micA || b >= micB || (a >= micA / 4 && b >= micB / 4);
          return inhibited ? 0.04 : 1;
        })
      );
      return { id: Math.random().toString(36).slice(2, 8), name, od };
    };
    setReps([make('R1 (synthetic)', 0, 0), make('R2 (synthetic)', 1, 0), make('R3 (synthetic)', 0, 1)]);
    setSel(0);
    setMsg('Loaded three synthetic replicates. They are not real data.');
  };

  const S2 = analysis?.summary;
  const convLabel = { min: 'minimum', mean: 'mean', max: 'maximum' }[convention];
  const key = { min: 'ficiMin', mean: 'ficiMean', max: 'ficiMax' }[convention];

  return (
    <div style={S.card}>
      <div style={S.h}>FICI analysis</div>
      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
        Add one replicate per plate. Paste or upload plate-reader OD values (8 × 12 matrix, or a table with
        columns <code>row,col,od</code>), or click wells to mark growth by hand. Wells are called as
        growth when inhibition relative to the drug-free growth-control well is below the cut-off.
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        {reps.map((r, i) => (
          <button key={r.id} onClick={() => setSel(i)} style={{ ...btn, borderColor: i === idx ? '#3b82f6' : '#d1d5db', background: i === idx ? '#eff6ff' : '#fff', fontWeight: i === idx ? 600 : 400 }}>
            {r.name}
          </button>
        ))}
        <button onClick={addRep} style={btn}>+ Replicate</button>
        <button onClick={removeRep} style={btn} disabled={reps.length === 1}>Remove this one</button>
        <button onClick={loadExample} style={btn}>Load synthetic example</button>
      </div>

      <div style={{ ...S.grid(150), marginBottom: 10 }}>
        <Field label="Replicate name">
          <input style={S.inp} value={rep.name} onChange={(e) => setReps((p) => p.map((r) => (r.id === rep.id ? { ...r, name: e.target.value } : r)))} />
        </Field>
        <Field label="Blank OD (medium only)">
          <input type="number" step={0.01} style={S.inp} value={call.blank} onChange={(e) => setCall((c) => ({ ...c, blank: +e.target.value }))} />
        </Field>
        <Field label="No growth if inhibition ≥ (%)">
          <input type="number" min={50} max={100} style={S.inp} value={call.inhibitionCut} onChange={(e) => setCall((c) => ({ ...c, inhibitionCut: +e.target.value }))} />
        </Field>
      </div>

      <textarea
        aria-label="Paste plate reader values"
        placeholder={'Paste 8 rows × 12 columns of OD values here (tab, comma or space separated)'}
        value={paste}
        onChange={(e) => setPaste(e.target.value)}
        style={{ ...S.inp, height: 70, fontFamily: 'ui-monospace, monospace', fontSize: 11 }}
      />
      <div style={{ display: 'flex', gap: 8, margin: '6px 0 10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <button style={btn} onClick={() => load(paste)}>Load pasted values</button>
        <button style={btn} onClick={() => fileRef.current?.click()}>Upload CSV / TXT</button>
        <input ref={fileRef} type="file" accept=".csv,.txt,.tsv" onChange={onFile} style={{ display: 'none' }} />
        <button style={btn} onClick={() => setOd(rep.id, odFromGrowth(Array.from({ length: PLATE_ROWS }, () => Array(PLATE_COLS).fill(true))))}>Reset to all growth</button>
        {msg && <span role="status" style={{ fontSize: 12, color: msg.startsWith('Loaded') ? '#15803d' : '#b91c1c' }}>{msg}</span>}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'inline-grid', gridTemplateColumns: `60px repeat(${layout.nC}, 40px)`, gap: 3, alignItems: 'center' }}>
          <div />
          {Array.from({ length: layout.nC }, (_, c) => (
            <div key={c} style={{ textAlign: 'center', fontSize: 10 }}>
              <b>{c + 1}</b>
              <div style={{ color: '#1d4ed8' }}>{c < nC ? fmtConc(colSeries[c]) : '0'}</div>
            </div>
          ))}
          {Array.from({ length: layout.nR }, (_, r) => (
            <div key={r} style={{ display: 'contents' }}>
              <div style={{ fontSize: 10, textAlign: 'right', paddingRight: 4 }}>
                <b>{String.fromCharCode(65 + r)}</b> <span style={{ color: '#be185d' }}>{r < nR ? fmtConc(rowSeries[r]) : '0'}</span>
              </div>
              {Array.from({ length: layout.nC }, (_, c) => {
                const g = cur?.growth ? cur.growth[r][c] : true;
                const isGc = r === nR && c === nC;
                const iface = cur?.fici?.wells?.some((w) => w.row === r && w.col === c);
                return (
                  <button
                    key={c}
                    disabled={isGc}
                    onClick={() => toggle(r, c)}
                    title={`${String.fromCharCode(65 + r)}${c + 1}: OD ${fmt(rep.od[r][c], 3)}${cur?.inh ? `, inhibition ${fmt(cur.inh[r][c] * 100, 0)}%` : ''}`}
                    aria-label={`Well ${String.fromCharCode(65 + r)}${c + 1}: ${isGc ? 'growth control' : g ? 'growth' : 'no growth'}`}
                    style={wellCell({
                      cursor: isGc ? 'default' : 'pointer',
                      background: isGc ? '#fef3c7' : g ? '#fee2e2' : '#dcfce7',
                      color: isGc ? '#92400e' : g ? '#b91c1c' : '#15803d',
                      fontWeight: 700,
                      outline: iface ? '2px solid #3b82f6' : 'none',
                    })}
                  >
                    {isGc ? 'GC' : g ? '+' : '0'}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 6 }}>
        <b>+</b> growth · <b>0</b> no growth · <b>GC</b> growth control (drug-free; carries only the fixed drug, if any).
        Blue outline: interface wells used for FICI.
      </div>

      {cur?.error && <div role="alert" style={{ marginTop: 12, color: '#b91c1c', fontSize: 13 }}>{cur.error}</div>}
      {cur?.fici?.error && <div style={{ marginTop: 12, color: '#92400e', fontSize: 13 }}>{cur.fici.error}</div>}

      {cur?.fici && !cur.fici.error && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>{rep.name}</div>
          <div style={{ ...S.grid(140), marginBottom: 10 }}>
            <Metric label={`MIC ${plan.colRes.name} alone`} value={`${cur.fici.micA.censored}${fmtConc(cur.fici.micA.mic)} µg/mL`} />
            <Metric label={`MIC ${plan.rowRes.name} alone`} value={`${cur.fici.micB.censored}${fmtConc(cur.fici.micB.mic)} µg/mL`} />
            <Metric label="FICI min / mean / max" value={`${fmt(cur.fici.min, 2)} / ${fmt(cur.fici.mean, 2)} / ${fmt(cur.fici.max, 2)}`} />
            <Metric label="Mean Bliss excess" value={`${fmt(cur.bliss.mean * 100, 1)}%`} />
          </div>
          {(cur.fici.micA.note || cur.fici.micB.note) && (
            <div style={{ fontSize: 12, color: '#92400e', marginBottom: 8 }}>
              {cur.fici.micA.note && <div>{plan.colRes.name}: {cur.fici.micA.note}.</div>}
              {cur.fici.micB.note && <div>{plan.rowRes.name}: {cur.fici.micB.note}.</div>}
            </div>
          )}

          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Isobologram (interface wells)</div>
              <Isobologram wells={cur.fici.wells} nameA={plan.colRes.name} nameB={plan.rowRes.name} />
            </div>
            <div style={{ flex: 1, minWidth: 260, overflowX: 'auto' }}>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
                Excess over Bliss independence (% inhibition; green = more than expected, orange = less)
              </div>
              <table style={{ borderCollapse: 'collapse', fontSize: 10 }}>
                <thead>
                  <tr>
                    <th />
                    {colSeries.map((a, c) => (<th key={c} style={{ padding: '2px 4px', color: '#1d4ed8', fontWeight: 500 }}>{fmtConc(a)}</th>))}
                  </tr>
                </thead>
                <tbody>
                  {cur.bliss.excess.map((row, r) => (
                    <tr key={r}>
                      <th style={{ padding: '2px 6px', color: '#be185d', fontWeight: 500, textAlign: 'right' }}>{fmtConc(rowSeries[r])}</th>
                      {row.map((x, c) => (
                        <td key={c} style={{ background: heat(x), textAlign: 'center', padding: '3px 4px', minWidth: 26, border: '1px solid #fff' }}>{Math.round(x * 100)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
                Wells above +20: {cur.bliss.nSynergistic} · below −20: {cur.bliss.nAntagonistic}. Bliss assumes independent
                action and uses the continuous OD data, so it complements (and can disagree with) FICI.
              </div>
            </div>
          </div>

          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>
                  {['Well', `${plan.colRes.name} (µg/mL)`, `${plan.rowRes.name} (µg/mL)`, 'FIC A', 'FIC B', 'FICI'].map((h) => (<th key={h} style={{ padding: '5px 8px', fontWeight: 500 }}>{h}</th>))}
                </tr>
              </thead>
              <tbody>
                {cur.fici.wells.map((w) => (
                  <tr key={`${w.row},${w.col}`} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '5px 8px', fontWeight: 600 }}>{String.fromCharCode(65 + w.row)}{w.col + 1}</td>
                    <td style={{ padding: '5px 8px' }}>{fmtConc(w.a)}</td>
                    <td style={{ padding: '5px 8px' }}>{fmtConc(w.b)}</td>
                    <td style={{ padding: '5px 8px' }}>{fmt(w.ficA, 3)}</td>
                    <td style={{ padding: '5px 8px' }}>{fmt(w.ficB, 3)}</td>
                    <td style={{ padding: '5px 8px', fontWeight: 600 }}>{fmt(w.fici, 3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {S2 && (
        <div style={{ marginTop: 20, borderTop: '1px solid #e5e7eb', paddingTop: 14 }}>
          <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>Across {S2.n} replicate{S2.n > 1 ? 's' : ''}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
            <span style={{ fontSize: 13 }}>Report FICI as:</span>
            {[['min', 'minimum'], ['mean', 'mean'], ['max', 'maximum']].map(([k, label]) => (
              <label key={k} style={{ fontSize: 13 }}>
                <input type="radio" name="conv" checked={convention === k} onChange={() => setConvention(k)} /> {label}
              </label>
            ))}
          </div>
          <div style={{ background: '#f0f9ff', borderRadius: 8, padding: '10px 14px', fontSize: 14 }}>
            Median FICI ({convLabel}) = <b>{fmt(S2[key].median, 3)}</b> (range {fmt(S2[key].range[0], 3)}–{fmt(S2[key].range[1], 3)}) →{' '}
            <b>{interpretFici(S2[key].median)}</b>
          </div>
          <div style={{ ...S.grid(150), marginTop: 10 }}>
            <Metric label={`Median MIC ${plan.colRes.name}`} value={`${fmtConc(S2.micA.median)} µg/mL`} />
            <Metric label={`Median MIC ${plan.rowRes.name}`} value={`${fmtConc(S2.micB.median)} µg/mL`} />
            <Metric label="Median Bliss excess" value={`${fmt(S2.bliss.median * 100, 1)}%`} />
          </div>
          <div style={{ fontSize: 12, marginTop: 8, color: S2.micWithinOneStep ? '#15803d' : '#b91c1c' }}>
            {S2.micWithinOneStep
              ? 'Single-drug MICs agree within one two-fold step across replicates.'
              : 'Single-drug MICs differ by more than one two-fold step between replicates; check the assay before interpreting FICI.'}
          </div>
          {S2.n < 3 && (
            <div style={{ fontSize: 12, marginTop: 4, color: '#92400e' }}>
              Fewer than three replicates: interpret with caution.
            </div>
          )}
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 8 }}>
            Common convention: ≤ 0.5 synergy; &gt; 0.5 to 4 no interaction; &gt; 4 antagonism. State which FICI you
            report. A summed index hides which drug drives the effect, so report FIC A and FIC B separately as well.
          </div>
          <button
            style={{ ...btn, marginTop: 10 }}
            onClick={() => download('checkerboard_results.csv', resultsCsv(analysis, plan.colRes.name, plan.rowRes.name), 'text/csv')}
          >
            Download results (CSV)
          </button>
        </div>
      )}
    </div>
  );
}
