import { useMemo, useRef, useState } from 'react';
import { Field, Metric, S, STOCK_BG, STOCK_COLORS, StockBadge, roleOf, wellCell, btn } from './ui.jsx';
import AnalysisTab, { newReplicate } from './AnalysisTab.jsx';
import { DEFAULT_CALL } from './analysis.js';
import SimTab from './SimTab.jsx';
import ProtocolTab from './ProtocolTab.jsx';
import { decodeShare, encodeShare, download, parseState, serializeState } from './io.js';
import DiagramView from './DiagramView.jsx';
import {
  DEFAULT_SETTINGS,
  PLATE_COLS,
  PLATE_ROWS,
  buildLayout,
  calcPrimaryStock,
  fmt,
  fmtConc,
  planExperiment,
} from './calc.js';

const DEFAULT_ABS = [
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
    fixedBasis: '',
    axis: 'column',
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
    fixedBasis: '',
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
    fixedBasis: 'sulbactam component',
    axis: 'fixed',
  },
];

export default function App() {
  const nextId = useRef(100);
  const shared = useMemo(
    () => (window.location.hash.length > 3 ? decodeShare(window.location.hash).state : null),
    []
  );
  const [abs, setAbs] = useState(shared?.abs || DEFAULT_ABS);
  const [cfg, setCfg] = useState({ ...DEFAULT_SETTINGS, ...(shared?.cfg || {}) });
  const [tab, setTab] = useState('summary');
  const [reps, setReps] = useState(() => [newReplicate('R1')]);
  const [call, setCall] = useState(DEFAULT_CALL);
  const [notice, setNotice] = useState('');
  const fileRef = useRef(null);
  const setC = (k) => (e) => setCfg((p) => ({ ...p, [k]: +e.target.value }));
  const updateAb = (id, patch) =>
    setAbs((p) => p.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  const addAb = () =>
    setAbs((p) => [
      ...p,
      {
        id: nextId.current++,
        name: '',
        powderMg: '',
        dissolveVolMl: 5,
        purityPct: 100,
        micMin: '',
        micMax: '',
        fixed: false,
        fixedConc: '',
        fixedBasis: '',
        axis: 'column',
      },
    ]);

  const plan = useMemo(() => planExperiment(abs, cfg), [abs, cfg]);
  const errors = plan.messages.filter((m) => m.level === 'error');
  const warnings = plan.messages.filter((m) => m.level === 'warning');
  const { abResults } = plan;

  const colSeries = plan.colRes?.series || [];
  const rowSeries = plan.rowRes?.series || [];
  const layout = useMemo(
    () => buildLayout(colSeries, rowSeries),
    [colSeries, rowSeries]
  );
  const TABS = [
    ['summary', 'Summary'],
    ['stocks', 'Stocks & tubes'],
    ['inoculum', 'Inoculum'],
    ['layout', 'Plate layout'],
    ['diagram', 'Diagram'],
    ['protocol', 'Protocol & export'],
    ['analysis', 'FICI analysis'],
    ['sim', 'Error simulation'],
  ];

  const saveConfig = () =>
    download('checkerboard_config.json', serializeState({ abs, cfg, reps, call }), 'application/json');
  const loadConfig = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const fr = new FileReader();
    fr.onload = () => {
      const r = parseState(String(fr.result));
      if (r.error) return setNotice(r.error);
      setAbs(r.state.abs);
      setCfg({ ...DEFAULT_SETTINGS, ...r.state.cfg });
      if (Array.isArray(r.state.reps) && r.state.reps.length) setReps(r.state.reps);
      if (r.state.call) setCall(r.state.call);
      nextId.current = Math.max(nextId.current, ...r.state.abs.map((a) => a.id + 1));
      setNotice('Configuration loaded.');
    };
    fr.readAsText(f);
    e.target.value = '';
  };
  const copyLink = async () => {
    const url = `${window.location.origin}${window.location.pathname}#s=${encodeShare({ abs, cfg })}`;
    try {
      await navigator.clipboard.writeText(url);
      setNotice('Link copied (plan inputs only; plate data is not included).');
    } catch {
      window.location.hash = `s=${encodeShare({ abs, cfg })}`;
      setNotice('Link placed in the address bar.');
    }
  };

  return (
    <div
      style={{
        maxWidth: 1000,
        margin: '0 auto',
        padding: '24px 20px',
        fontFamily: 'system-ui, sans-serif',
        color: '#111',
        fontSize: 14,
        textAlign: 'left',
      }}
    >
      <h1 className="np" style={{ fontSize: 22, fontWeight: 600, margin: '0 0 4px' }}>
        Checkerboard Assay Planner
      </h1>
      <p className="np" style={{ color: '#6b7280', marginBottom: 20, fontSize: 13 }}>
        Plan stock ladders and working dilutions, lay out the plate, and
        calculate FIC indices for broth-microdilution checkerboard assays (two
        titrated drugs plus optional fixed-concentration drugs).
      </p>
      <div className="np" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <button style={btn} onClick={saveConfig}>Save configuration</button>
        <button style={btn} onClick={() => fileRef.current?.click()}>Load configuration</button>
        <input ref={fileRef} type="file" accept=".json" onChange={loadConfig} style={{ display: 'none' }} />
        <button style={btn} onClick={copyLink}>Copy share link</button>
        {notice && <span role="status" style={{ fontSize: 12, color: notice.startsWith('Config') || notice.startsWith('Link') ? '#15803d' : '#b91c1c' }}>{notice}</span>}
      </div>

      {/* 1. SETTINGS */}
      <div className="np" style={S.card}>
        <div style={S.h}>1. Plate and batch</div>
        <div style={S.grid(150)}>
          <Field label="Well volume (µL)">
            <select style={S.inp} value={cfg.plateVol} onChange={setC('plateVol')}>
              {[50, 100, 200].map((v) => (
                <option key={v} value={v}>{v} µL</option>
              ))}
            </select>
          </Field>
          <Field label="Drug : inoculum volume">
            <select style={S.inp} value={cfg.abFracPct} onChange={setC('abFracPct')}>
              <option value={50}>50 : 50</option>
              <option value={25}>25 : 75</option>
              <option value={75}>75 : 25</option>
              <option value={90}>90 : 10</option>
            </select>
          </Field>
          <Field label="Plates (replicates)">
            <input type="number" min={1} style={S.inp} value={cfg.numPlates} onChange={setC('numPlates')} />
          </Field>
          <Field label="Overage (%)">
            <input type="number" min={0} style={S.inp} value={cfg.bufferPct} onChange={setC('bufferPct')} />
          </Field>
          <Field label="Dead volume per tube (mL)">
            <input type="number" min={0} step={0.1} style={S.inp} value={cfg.deadMl} onChange={setC('deadMl')} />
          </Field>
          <Field label="Tube size (mL)">
            <select style={S.inp} value={cfg.tubeMl} onChange={setC('tubeMl')}>
              {[5, 10, 15, 50].map((v) => (
                <option key={v} value={v}>{v} mL</option>
              ))}
            </select>
          </Field>
          <Field label="Minimum pipetting volume (µL)">
            <select style={S.inp} value={cfg.minVolUl} onChange={setC('minVolUl')}>
              {[10, 20, 50, 100, 200].map((v) => (
                <option key={v} value={v}>{v} µL</option>
              ))}
            </select>
          </Field>
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280', background: '#f0f9ff', borderRadius: 6, padding: '6px 10px' }}>
          Per well: drug <b>{fmt(plan.volAbPerWell, 0)} µL</b> (
          {fmt(plan.volAbPerWellEach, 1)} µL per titrated drug) + inoculum{' '}
          <b>{fmt(plan.volBacPerWell, 0)} µL</b> = <b>{cfg.plateVol} µL</b>. Working
          tubes are therefore{' '}
          <b>{fmt(cfg.plateVol / plan.volAbPerWellEach, 1)}×</b> the final
          concentration.
        </div>
      </div>

      {/* 2. DRUGS */}
      <div className="np" style={S.card}>
        <div style={S.h}>2. Antibiotics</div>
        {abs.map((ab, idx) => {
          const primary = calcPrimaryStock(ab.powderMg, ab.dissolveVolMl, ab.purityPct);
          return (
            <div key={ab.id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '12px 14px', marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontWeight: 500, fontSize: 13 }}>Antibiotic {idx + 1}</span>
                <button
                  aria-label={`Remove antibiotic ${idx + 1}`}
                  onClick={() => setAbs((p) => p.filter((a) => a.id !== ab.id))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 16 }}
                >
                  ✕
                </button>
              </div>
              <div style={S.grid(130)}>
                <Field label="Name">
                  <input style={S.inp} value={ab.name} placeholder="Meropenem" onChange={(e) => updateAb(ab.id, { name: e.target.value })} />
                </Field>
                <Field label="Powder (mg)">
                  <input type="number" style={S.inp} value={ab.powderMg} onChange={(e) => updateAb(ab.id, { powderMg: e.target.value })} />
                </Field>
                <Field label="Dissolved in (mL)">
                  <input type="number" style={S.inp} value={ab.dissolveVolMl} onChange={(e) => updateAb(ab.id, { dissolveVolMl: e.target.value })} />
                </Field>
                <Field label="Potency (%)">
                  <input type="number" min={50} max={100} step={0.1} style={S.inp} value={ab.purityPct} onChange={(e) => updateAb(ab.id, { purityPct: e.target.value })} />
                </Field>
                <Field label="Role">
                  <select
                    style={S.inp}
                    value={ab.fixed ? 'fixed' : ab.axis}
                    onChange={(e) => {
                      const v = e.target.value;
                      updateAb(ab.id, v === 'fixed' ? { fixed: true, axis: 'fixed' } : { fixed: false, axis: v });
                    }}
                  >
                    <option value="column">Titrated across columns</option>
                    <option value="row">Titrated down rows</option>
                    <option value="fixed">Fixed concentration</option>
                  </select>
                </Field>
                {ab.fixed ? (
                  <>
                    <Field label="Final conc. (µg/mL)">
                      <input type="number" style={S.inp} value={ab.fixedConc} onChange={(e) => updateAb(ab.id, { fixedConc: e.target.value })} />
                    </Field>
                    <Field label="Concentration refers to">
                      <input style={S.inp} value={ab.fixedBasis} placeholder="e.g. sulbactam component" onChange={(e) => updateAb(ab.id, { fixedBasis: e.target.value })} />
                    </Field>
                  </>
                ) : (
                  <>
                    <Field label="Lowest final conc. (µg/mL)">
                      <input type="number" style={S.inp} value={ab.micMin} onChange={(e) => updateAb(ab.id, { micMin: e.target.value })} />
                    </Field>
                    <Field label="Highest final conc. (µg/mL)">
                      <input type="number" style={S.inp} value={ab.micMax} onChange={(e) => updateAb(ab.id, { micMax: e.target.value })} />
                    </Field>
                  </>
                )}
              </div>
              {primary && (
                <div style={{ marginTop: 8, fontSize: 12, color: '#6b7280', background: '#fafafa', borderRadius: 6, padding: '4px 10px' }}>
                  Primary stock: <b>{fmtConc(primary)} µg/mL</b> · volume: <b>{ab.dissolveVolMl} mL</b>
                </div>
              )}
            </div>
          );
        })}
        <button
          onClick={addAb}
          style={{ width: '100%', border: '1px dashed #d1d5db', borderRadius: 8, background: 'none', padding: 8, fontSize: 13, cursor: 'pointer', color: '#6b7280' }}
        >
          + Add antibiotic
        </button>
      </div>

      {/* 3. INOCULUM */}
      <div className="np" style={S.card}>
        <div style={S.h}>3. Inoculum</div>
        <div style={S.grid(200)}>
          <Field label="Target in well (CFU/mL)">
            <input type="number" step={10000} style={S.inp} value={cfg.bacTargetCfu} onChange={setC('bacTargetCfu')} />
          </Field>
          <Field label="0.5 McFarland suspension (CFU/mL)">
            <input type="number" step={1000000} style={S.inp} value={cfg.bacStockCfu} onChange={setC('bacStockCfu')} />
          </Field>
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: '#6b7280' }}>
          0.5 McFarland corresponds to roughly 1–2 × 10⁸ CFU/mL and varies by
          organism; confirm the real value with a colony count.
        </div>
      </div>

      {/* MESSAGES */}
      {errors.length > 0 && (
        <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10, padding: '12px 18px', marginBottom: 12 }}>
          <div style={{ fontWeight: 700, color: '#b91c1c', marginBottom: 6 }}>
            {errors.length} problem{errors.length > 1 ? 's' : ''} to fix
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#7f1d1d' }}>
            {errors.map((m, i) => (<li key={i}>{m.text}</li>))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="np" style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10, padding: '12px 18px', marginBottom: 12 }}>
          <div style={{ fontWeight: 700, color: '#92400e', marginBottom: 6 }}>Warnings</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#78350f' }}>
            {warnings.map((m, i) => (<li key={i}>{m.text}</li>))}
          </ul>
        </div>
      )}

      {/* TABS */}
      <div role="tablist" style={{ display: 'flex', gap: 6, margin: '16px 0', flexWrap: 'wrap' }}>
        {TABS.map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            style={{
              border: '1px solid',
              borderColor: tab === k ? '#3b82f6' : '#d1d5db',
              borderRadius: 20,
              padding: '5px 14px',
              fontSize: 13,
              cursor: 'pointer',
              background: tab === k ? '#eff6ff' : '#fff',
              color: tab === k ? '#1d4ed8' : '#374151',
              fontWeight: tab === k ? 600 : 400,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* SUMMARY */}
      {tab === 'summary' && (
        <div style={S.card}>
          <div style={S.h}>Summary</div>
          <div style={{ ...S.grid(130), marginBottom: 16 }}>
            <Metric label="Plates" value={cfg.numPlates} />
            <Metric label="Well volume" value={`${cfg.plateVol} µL`} />
            <Metric label="Drug per well" value={`${fmt(plan.volAbPerWell, 0)} µL`} />
            <Metric label="Inoculum per well" value={`${fmt(plan.volBacPerWell, 0)} µL`} />
            <Metric label="Inoculum to prepare" value={`${fmt(plan.bacVolMl, 1)} mL`} />
            <Metric label="Min. pipetting" value={`${cfg.minVolUl} µL`} />
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e5e7eb', textAlign: 'left', color: '#6b7280', fontSize: 12 }}>
                  {['Antibiotic', 'Role', 'Primary stock', 'Stock ladder', 'Tubes × volume', 'Range (µg/mL)', 'Powder needed / available', ''].map((h) => (
                    <th key={h} style={{ padding: '6px 8px', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {abResults.map((r) => (
                  <tr key={r.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: 8, fontWeight: 500 }}>{r.name}</td>
                    <td style={{ padding: 8, color: '#6b7280' }}>{roleOf(r)}</td>
                    <td style={{ padding: 8 }}>{r.primaryStock ? `${fmtConc(r.primaryStock)} µg/mL` : '—'}</td>
                    <td style={{ padding: 8 }}>
                      {r.type === 'fixed'
                        ? 'n/a'
                        : r.ladder
                        ? r.ladder.stocks.map((s, si) => (
                            <span key={si}>
                              <StockBadge name={s.name} idx={si} />
                              {si < r.ladder.stocks.length - 1 ? ' → ' : ''}
                            </span>
                          ))
                        : '—'}
                    </td>
                    <td style={{ padding: 8 }}>
                      {r.type === 'fixed' ? '—' : `${r.series.length} × ${fmt(r.workVolMl, 1)} mL`}
                    </td>
                    <td style={{ padding: 8, fontSize: 12 }}>
                      {r.type === 'fixed'
                        ? fmtConc(r.finalConc)
                        : r.series.length
                        ? `${fmtConc(r.series[r.series.length - 1])} – ${fmtConc(r.series[0])}`
                        : '—'}
                    </td>
                    <td style={{ padding: 8 }}>
                      {r.powderUsedMg != null
                        ? `${fmt(r.powderUsedMg, 1)} / ${fmt(Number(r.powderMg), 1)} mg`
                        : '—'}
                    </td>
                    <td style={{ padding: 8, color: r.volWarning ? '#b91c1c' : '#15803d', fontWeight: 600 }}>
                      {r.volWarning ? 'Short' : 'OK'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* STOCKS */}
      {tab === 'stocks' && (
        <div>
          {abResults.map((r) => (
            <div key={r.id} style={{ ...S.card, borderColor: r.volWarning ? '#fca5a5' : '#e5e7eb' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 600, fontSize: 15 }}>{r.name}</span>
                <span style={{ fontSize: 11, background: r.type === 'fixed' ? '#fef3c7' : '#eff6ff', color: r.type === 'fixed' ? '#92400e' : '#1d4ed8', borderRadius: 10, padding: '2px 8px', fontWeight: 500 }}>
                  {roleOf(r)}
                </span>
                {r.volWarning && (
                  <span style={{ fontSize: 11, background: '#fef2f2', color: '#b91c1c', borderRadius: 10, padding: '2px 8px', fontWeight: 600 }}>
                    Not enough drug
                  </span>
                )}
              </div>

              {r.volWarning && (
                <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#7f1d1d' }}>
                  Needs <b>{fmt(r.volWarning.neededPowderMg, 1)} mg</b> of powder
                  ({fmt(r.volWarning.neededMl, 2)} mL of primary stock); only{' '}
                  <b>{fmt(r.volWarning.availablePowderMg, 1)} mg</b> is available.
                  Adding more solvent does not create more drug — weigh more
                  powder, use fewer plates, or reduce the overage.
                </div>
              )}

              {r.type === 'fixed' ? (
                <>
                  <div style={{ ...S.grid(140), marginBottom: 14 }}>
                    <Metric label="Primary stock" value={r.primaryStock ? `${fmtConc(r.primaryStock)} µg/mL` : '—'} />
                    <Metric label="Final conc. in well" value={`${fmtConc(r.finalConc)} µg/mL`} />
                    <Metric label="Conc. in inoculum" value={`${fmtConc(r.concInBacSusp)} µg/mL`} />
                    <Metric label="Primary to add" value={r.volNeededFromPrimaryMl ? `${fmt(r.volNeededFromPrimaryMl * 1000, 1)} µL` : '—'} />
                  </div>
                  <div style={S.step}>
                    <b style={{ fontSize: 11, color: '#3b82f6' }}>Primary stock</b>
                    <div style={{ marginTop: 2 }}>
                      Dissolve <b>{r.powderMg} mg</b> in <b>{r.dissolveVolMl} mL</b> →{' '}
                      <b>{r.primaryStock ? fmtConc(r.primaryStock) : '—'} µg/mL</b>
                      {r.fixedBasis ? ` (${r.fixedBasis})` : ''}.
                    </div>
                  </div>
                  <div style={S.step}>
                    <b style={{ fontSize: 11, color: '#3b82f6' }}>Add to inoculum suspension</b>
                    <div style={{ marginTop: 2 }}>
                      Add <b>{r.volNeededFromPrimaryMl ? fmt(r.volNeededFromPrimaryMl * 1000, 1) : '—'} µL</b>{' '}
                      to the <b>{fmt(plan.bacVolMl, 1)} mL</b> inoculum suspension →{' '}
                      <b>{fmtConc(r.finalConc)} µg/mL</b> in every well.
                    </div>
                  </div>
                </>
              ) : r.ladder ? (
                <>
                  {r.ladder.stocks.map((s, si) => {
                    const ci = si % STOCK_COLORS.length;
                    const col = STOCK_COLORS[ci];
                    return (
                      <div key={si} style={{ borderLeft: `3px solid ${col}`, paddingLeft: 12, marginBottom: 14 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <StockBadge name={s.name} idx={si} />
                          <b style={{ fontSize: 13, color: col }}>{fmtConc(s.conc)} µg/mL</b>
                        </div>
                        {si === 0 ? (
                          <div style={{ fontSize: 12, color: '#374151' }}>
                            Dissolve <b>{r.powderMg} mg</b> powder in <b>{r.dissolveVolMl} mL</b> solvent →{' '}
                            <b>{fmtConc(s.conc)} µg/mL</b>. Draw{' '}
                            <b>{fmt(s.volNeeded_mL, 2)} mL</b> from it (uses {fmt(r.powderUsedMg, 1)} mg).
                          </div>
                        ) : (
                          <div style={{ fontSize: 12, color: '#374151' }}>
                            Take <b>{fmt(s.fromPrev_uL, 1)} µL</b> {r.ladder.stocks[s.fromStockIdx].name} (
                            {fmtConc(r.ladder.stocks[s.fromStockIdx].conc)} µg/mL) + <b>{fmt(s.camhb_mL * 1000, 0)} µL</b> CAMHB ={' '}
                            <b>{fmt(s.volNeeded_mL * 1000, 0)} µL</b> {s.name} stock.
                          </div>
                        )}
                        <div style={{ marginTop: 8, fontSize: 11, color: '#6b7280' }}>
                          Tubes using this stock:{' '}
                          {r.ladder.falcons.filter((f) => f.stockIdx === si).map((f) => (
                            <span key={f.falconIdx} style={{ marginRight: 4, display: 'inline-block', background: STOCK_BG[ci], color: col, border: `1px solid ${col}44`, borderRadius: 6, padding: '1px 6px', fontSize: 10, fontWeight: 600 }}>
                              {r.axis === 'row' ? String.fromCharCode(64 + f.falconIdx) : f.falconIdx}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}

                  <div style={{ ...S.step, borderLeftColor: '#6b7280' }}>
                    <b style={{ fontSize: 11, color: '#374151' }}>
                      Working tubes — {r.series.length} × {fmt(r.workVolMl, 1)} mL, each made independently
                    </b>
                    <div style={{ fontSize: 12, color: '#6b7280', margin: '4px 0 8px' }}>
                      Volume = tube concentration × {fmt(r.workVolMl, 1)} mL / stock concentration, topped up with CAMHB.
                      {' '}Volume sized for {cfg.numPlates} plates × {r.wellsPerConc} wells × {fmt(plan.volAbPerWellEach, 1)} µL + {cfg.bufferPct}% overage + {cfg.deadMl} mL dead volume.
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%', minWidth: 540 }}>
                        <thead>
                          <tr style={{ borderBottom: '2px solid #e5e7eb', background: '#f9fafb', textAlign: 'left' }}>
                            {[r.axis === 'row' ? 'Row' : 'Column', 'Final in well', 'Tube conc.', 'Stock', 'Take', 'CAMHB', 'Total'].map((h) => (
                              <th key={h} style={{ padding: '7px 10px', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {r.ladder.falcons.map((f, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid #f3f4f6', background: i % 2 ? '#fafafa' : '#fff' }}>
                              <td style={{ padding: '6px 10px', fontWeight: 700 }}>{r.axis === 'row' ? String.fromCharCode(65 + i) : i + 1}</td>
                              <td style={{ padding: '6px 10px', color: '#1d4ed8', fontWeight: 600 }}>{fmtConc(f.finalConc)} µg/mL</td>
                              <td style={{ padding: '6px 10px' }}>{fmtConc(f.concInFalcon)} µg/mL</td>
                              <td style={{ padding: '6px 10px' }}><StockBadge name={f.stockName} idx={f.stockIdx} /></td>
                              <td style={{ padding: '6px 10px', fontWeight: 700, color: f.belowMinPipette ? '#b91c1c' : undefined }}>
                                {f.volFromStock_uL >= 900 ? `${fmt(f.volFromStock_mL, 2)} mL` : `${fmt(f.volFromStock_uL, 1)} µL`}
                              </td>
                              <td style={{ padding: '6px 10px' }}>{fmt(f.camhb_mL, 2)} mL</td>
                              <td style={{ padding: '6px 10px', color: '#9ca3af' }}>{fmt(f.totalMl, 1)} mL</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {/* INOCULUM */}
      {tab === 'inoculum' && (
        <div style={S.card}>
          <div style={S.h}>Inoculum preparation</div>
          <div style={{ ...S.grid(140), marginBottom: 16 }}>
            <Metric label="Target in well" value={`${fmt(cfg.bacTargetCfu / 1e5, 1)} × 10⁵ CFU/mL`} />
            <Metric label="Suspension needed" value={`${fmt(plan.bacVolMl, 1)} mL`} />
            <Metric label="Conc. in suspension" value={`${fmt(cfg.bacTargetCfu / plan.bacFrac / 1e5, 1)} × 10⁵ CFU/mL`} />
            <Metric label="Dilution of McFarland" value={`1 : ${fmt(1 / plan.dilFactor, 0)}`} />
          </div>
          <div style={S.step}>
            <b style={{ fontSize: 11, color: '#3b82f6' }}>Step 1 — 0.5 McFarland</b>
            <div style={{ marginTop: 2 }}>
              Adjust colonies from an overnight plate to 0.5 McFarland (assumed{' '}
              <b>{fmt(cfg.bacStockCfu / 1e8, 2)} × 10⁸ CFU/mL</b>).
            </div>
          </div>
          <div style={S.step}>
            <b style={{ fontSize: 11, color: '#3b82f6' }}>Step 2 — dilute into CAMHB</b>
            <div style={{ marginTop: 2 }}>
              Mix <b>{fmt(plan.volMcFarlandMl * 1000, 1)} µL</b> McFarland suspension with{' '}
              <b>{fmt(plan.camhbForBacMl, 2)} mL</b> CAMHB
              {abResults.some((r) => r.type === 'fixed') ? ' (after adding the fixed-concentration drug(s))' : ''} →{' '}
              <b>{fmt(plan.bacVolMl, 1)} mL</b> at ~<b>{fmt(cfg.bacTargetCfu / plan.bacFrac / 1e5, 1)} × 10⁵ CFU/mL</b>.
            </div>
          </div>
          {abResults.filter((r) => r.type === 'fixed').map((r) => (
            <div key={r.id} style={S.step}>
              <b style={{ fontSize: 11, color: '#3b82f6' }}>Fixed drug — {r.name}</b>
              <div style={{ marginTop: 2 }}>
                Add <b>{r.volNeededFromPrimaryMl ? fmt(r.volNeededFromPrimaryMl * 1000, 1) : '—'} µL</b>{' '}
                primary stock to the suspension (<b>{fmtConc(r.concInBacSusp)} µg/mL</b> in suspension →{' '}
                <b>{fmtConc(r.finalConc)} µg/mL</b>{r.fixedBasis ? `, ${r.fixedBasis}` : ''} in the well).
              </div>
            </div>
          ))}
          <div style={S.step}>
            <b style={{ fontSize: 11, color: '#3b82f6' }}>Step 3 — verify</b>
            <div style={{ marginTop: 2 }}>
              Plate a dilution of the final suspension and count colonies to confirm the inoculum (CLSI M07 accepts a
              range around 5 × 10⁵ CFU/mL). Inoculate plates within the time limit in your reference standard (CLSI M07 / ISO 20776-1).
            </div>
          </div>
        </div>
      )}

      {/* LAYOUT */}
      {tab === 'layout' && (
        <div style={S.card}>
          <div style={S.h}>Plate layout</div>
          {!plan.colRes || !plan.rowRes ? (
            <div style={{ color: '#92400e', fontSize: 13 }}>
              Define one drug titrated across columns and one down rows to see the layout.
            </div>
          ) : (
            <>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
                Columns: <b>{plan.colRes.name}</b> (µg/mL, high → low, last column drug-free). Rows:{' '}
                <b>{plan.rowRes.name}</b> (µg/mL, high → low, last row drug-free). Each cell is the final concentration pair in the well.
              </div>
              <div style={{ overflowX: 'auto' }}>
                <div style={{ display: 'inline-grid', gridTemplateColumns: `60px repeat(${PLATE_COLS}, 40px)`, gap: 3, alignItems: 'center' }}>
                  <div />
                  {Array.from({ length: PLATE_COLS }, (_, c) => (
                    <div key={c} style={{ textAlign: 'center', fontSize: 10, color: '#374151' }}>
                      <div style={{ fontWeight: 700 }}>{c + 1}</div>
                      <div style={{ color: '#1d4ed8' }}>{c < layout.nC ? (c < colSeries.length ? fmtConc(colSeries[c]) : '0') : ''}</div>
                    </div>
                  ))}
                  {layout.grid.map((line, r) => (
                    <div key={r} style={{ display: 'contents' }}>
                      <div style={{ fontSize: 10, textAlign: 'right', paddingRight: 4, color: '#374151' }}>
                        <b>{String.fromCharCode(65 + r)}</b>{' '}
                        <span style={{ color: '#be185d' }}>{r < layout.nR ? (r < rowSeries.length ? fmtConc(rowSeries[r]) : '0') : ''}</span>
                      </div>
                      {line.map((cell, c) => {
                        if (!cell.used) return <div key={c} style={wellCell({ background: '#f3f4f6', color: '#9ca3af' })}>—</div>;
                        const gc = cell.a === 0 && cell.b === 0;
                        const aOnly = cell.b === 0 && cell.a > 0;
                        const bOnly = cell.a === 0 && cell.b > 0;
                        return (
                          <div
                            key={c}
                            title={`A=${cell.a} µg/mL, B=${cell.b} µg/mL`}
                            style={wellCell({
                              background: gc ? '#fef3c7' : aOnly ? '#dbeafe' : bOnly ? '#fce7f3' : '#f0fdf4',
                              fontWeight: gc ? 700 : 400,
                            })}
                          >
                            {gc ? 'GC' : aOnly ? 'A' : bOnly ? 'B' : '+'}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 10, lineHeight: 1.6 }}>
                <b>A</b> = {plan.colRes.name} alone (MIC row) · <b>B</b> = {plan.rowRes.name} alone (MIC column) ·{' '}
                <b>+</b> = combination · <b>GC</b> = growth control
                {abResults.some((r) => r.type === 'fixed') ? ' (contains only the fixed-concentration drug(s))' : ''}. Unused wells: —.
              </div>
              <div style={{ marginTop: 12, fontSize: 13, background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: '8px 12px' }}>
                <b>Controls to add on a separate plate or row:</b> sterility (medium only), drug-free growth
                {abResults.some((r) => r.type === 'fixed') ? ' (without the fixed drug)' : ''}, and a QC strain with a published MIC range for each drug.
              </div>
              <div style={{ ...S.step, marginTop: 16 }}>
                <b style={{ fontSize: 11, color: '#3b82f6' }}>Loading</b>
                <div style={{ marginTop: 2 }}>
                  Dispense <b>{fmt(plan.volAbPerWellEach, 1)} µL</b> of each titrated drug per well from its tubes
                  (multichannel; {plan.colRes.name} by column, {plan.rowRes.name} by row), then{' '}
                  <b>{fmt(plan.volBacPerWell, 0)} µL</b> of inoculum. Incubate per your reference standard
                  (CLSI M07 / ISO 20776-1) and read.
                </div>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 8 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: '#6b7280', fontSize: 12, borderBottom: '1px solid #e5e7eb' }}>
                    {['Component', 'µL / well', 'mL / plate', `mL for ${cfg.numPlates} plates`].map((h) => (
                      <th key={h} style={{ padding: '5px 8px', fontWeight: 500 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    [plan.colRes.name, plan.volAbPerWellEach],
                    [plan.rowRes.name, plan.volAbPerWellEach],
                    ['Inoculum', plan.volBacPerWell],
                    ['Total', cfg.plateVol],
                  ].map(([l, ul]) => (
                    <tr key={l} style={{ borderBottom: '1px solid #f3f4f6', fontWeight: l === 'Total' ? 600 : 400 }}>
                      <td style={{ padding: '5px 8px' }}>{l}</td>
                      <td style={{ padding: '5px 8px' }}>{fmt(ul, 1)}</td>
                      <td style={{ padding: '5px 8px' }}>{fmt((ul * PLATE_ROWS * PLATE_COLS) / 1000, 2)}</td>
                      <td style={{ padding: '5px 8px' }}>{fmt((ul * PLATE_ROWS * PLATE_COLS * cfg.numPlates) / 1000, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>Totals assume all 96 wells are filled.</div>
            </>
          )}
        </div>
      )}

      {tab === 'diagram' && (
        <DiagramView
          results={plan}
          plateVol={cfg.plateVol}
          abFrac={plan.abFrac}
          bacFrac={plan.bacFrac}
          numPlates={cfg.numPlates}
          volAbPerWell={plan.volAbPerWell}
          volBacPerWell={plan.volBacPerWell}
          minVolUl={cfg.minVolUl}
          bufferPct={cfg.bufferPct}
        />
      )}

      {tab === 'protocol' && <ProtocolTab plan={plan} cfg={cfg} />}

      {tab === 'analysis' && (
        <AnalysisTab
          plan={plan}
          colSeries={colSeries}
          rowSeries={rowSeries}
          layout={layout}
          reps={reps}
          setReps={setReps}
          call={call}
          setCall={setCall}
        />
      )}

      {tab === 'sim' && <SimTab plan={plan} cfg={cfg} />}
    </div>
  );
}
