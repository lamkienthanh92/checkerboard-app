import { useEffect, useMemo, useRef, useState } from 'react';
import { FloatWin, Field, PicChoice, ComboLegend, ShareBar, Metric, S, STOCK_BG, STOCK_COLORS, SciInput, SeriesPicker, StockBadge, Why, roleOf, wellCell, btn } from './ui.jsx';
import AnalysisTab, { newReplicate } from './AnalysisTab.jsx';
import { DEFAULT_CALL } from './analysis.js';
import SimTab from './SimTab.jsx';
import { LoadingFigure } from './LoadingFigure.jsx';
import ProtocolTab from './ProtocolTab.jsx';
import { decodeShare, encodeShare, download, parseState, serializeState } from './io.js';
import DiagramView from './DiagramView.jsx';
import PlateBoard from './PlateBoard.jsx';
import { InoculumFlow, LadderFlow, PipetteBars, PlateThumb, SeriesBars, WellComposition } from './Visuals.jsx';
import {
  DEFAULT_SETTINGS,
  APP_SETTINGS,
  brothBreakdown,
  buildDilutionSeries,
  PLATE_COLS,
  PLATE_ROWS,
  buildLayout,
  planReservoirLoading, planCapacity,
  calcPrimaryStock,
  fmt,
  fmtConc,
  planExperiment,
} from './calc.js';

const NO_PARTNER = { partnerName: '', partnerMainParts: 2, partnerParts: 1, partnerPurityPct: 100, partnerMode: 'together', partnerSplitPct: 50 };

// Combination products. 'ratio' (default for checkerboards): the partner follows the dilution series at a fixed
// weight ratio and is dissolved together with the main drug, as for fixed-ratio products tested as single agents.
// The ratios are the formulation ratios; confirm them against the product label and your protocol.
// 'fixed': alternative convention of reference susceptibility testing, the inhibitor is held at one concentration
// in every well and is added as a fixed-concentration drug; confirm values in the current CLSI M100 / EUCAST tables.
const COMBO_PRESETS = [
  { k: 'ams', label: 'Ampicillin–sulbactam 2:1', mode: 'ratio', main: 'Ampicillin', partner: 'Sulbactam', mainParts: 2, parts: 1 },
  { k: 'amc', label: 'Amoxicillin–clavulanate 2:1', mode: 'ratio', main: 'Amoxicillin', partner: 'Clavulanate', mainParts: 2, parts: 1 },
  { k: 'tzp', label: 'Piperacillin–tazobactam 8:1', mode: 'ratio', main: 'Piperacillin', partner: 'Tazobactam', mainParts: 8, parts: 1 },
  { k: 'cza', label: 'Ceftazidime–avibactam 4:1', mode: 'ratio', main: 'Ceftazidime', partner: 'Avibactam', mainParts: 4, parts: 1 },
  { k: 'czt', label: 'Ceftolozane–tazobactam 2:1', mode: 'ratio', main: 'Ceftolozane', partner: 'Tazobactam', mainParts: 2, parts: 1 },
  { k: 'imr', label: 'Imipenem–relebactam 2:1', mode: 'ratio', main: 'Imipenem', partner: 'Relebactam', mainParts: 2, parts: 1 },
  { k: 'mev', label: 'Meropenem–vaborbactam 1:1', mode: 'ratio', main: 'Meropenem', partner: 'Vaborbactam', mainParts: 1, parts: 1 },
  { k: 'sxt', label: 'Trimethoprim–sulfamethoxazole 1:19', mode: 'ratio', main: 'Trimethoprim', partner: 'Sulfamethoxazole', mainParts: 1, parts: 19 },
  { k: 'fz_tzp', label: 'Piperacillin–tazobactam, tazobactam fixed 4 µg/mL', mode: 'fixed', main: 'Piperacillin', partner: 'Tazobactam', conc: 4 },
  { k: 'fz_cza', label: 'Ceftazidime–avibactam, avibactam fixed 4 µg/mL', mode: 'fixed', main: 'Ceftazidime', partner: 'Avibactam', conc: 4 },
  { k: 'fz_czt', label: 'Ceftolozane–tazobactam, tazobactam fixed 4 µg/mL', mode: 'fixed', main: 'Ceftolozane', partner: 'Tazobactam', conc: 4 },
  { k: 'fz_imr', label: 'Imipenem–relebactam, relebactam fixed 4 µg/mL', mode: 'fixed', main: 'Imipenem', partner: 'Relebactam', conc: 4 },
  { k: 'fz_mev', label: 'Meropenem–vaborbactam, vaborbactam fixed 8 µg/mL', mode: 'fixed', main: 'Meropenem', partner: 'Vaborbactam', conc: 8 },
];

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
    ...NO_PARTNER,
  },
  {
    id: 2,
    name: 'Colistin',
    powderMg: 1.28,
    dissolveVolMl: 20,
    purityPct: 100,
    micMin: 0.03125,
    micMax: 2,
    fixed: false,
    fixedConc: '',
    fixedBasis: '',
    axis: 'row',
    ...NO_PARTNER,
  },
  {
    id: 3,
    name: 'Ampicillin',
    powderMg: 25.6,
    dissolveVolMl: 5,
    purityPct: 100,
    micMin: '',
    micMax: '',
    fixed: true,
    fixedConc: 8,
    fixedBasis: 'ampicillin component',
    axis: 'fixed',
    partnerName: 'Sulbactam',
    partnerMainParts: 2,
    partnerParts: 1,
    partnerPurityPct: 100,
  },
];

function PrePrimary({ r }) {
  const pr = r.partner.pre;
  return (
    <ol style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 12, lineHeight: 1.7, color: '#374151' }}>
      <li><b>Pre-primary {r.name}:</b> weigh <b>{r.powderMg} mg</b> {r.name} and dissolve in <b>{fmt(pr.mainVolMl, 2)} mL</b> → <b>{fmtConc(pr.mainConc)} µg/mL</b>.</li>
      <li><b style={{ color: '#7c3aed' }}>Pre-primary {r.partner.name}:</b> weigh <b>{fmt(r.partner.weighMg, 1)} mg</b> {r.partner.name} (potency {r.partnerPurityPct}%) in its <b>own tube</b> and dissolve in <b>{fmt(pr.partVolMl, 2)} mL</b> → <b>{fmtConc(pr.partConc)} µg/mL</b>.</li>
      <li><b>Mix</b> the two: {fmt(pr.mainVolMl, 2)} mL {r.name} pre-primary + {fmt(pr.partVolMl, 2)} mL {r.partner.name} pre-primary = <b>{fmt(pr.totalMl, 2)} mL Primary</b>: {r.name} <b>{fmtConc(r.primaryStock)}</b>, <span style={{ color: '#7c3aed' }}>{r.partner.name} <b>{fmtConc(r.partner.primaryStock)}</b></span> µg/mL. Check that the pre-primaries dissolve fully and the mix stays clear.</li>
    </ol>
  );
}

export default function App() {
  const nextId = useRef(100);
  const shared = useMemo(
    () => (window.location.hash.length > 3 ? decodeShare(window.location.hash).state : null),
    []
  );
  const [abs, setAbs] = useState(shared?.abs || DEFAULT_ABS);
  const [cfgIn, setCfg] = useState({ ...APP_SETTINGS, ...(shared?.cfg || {}) });
  const [showViz, setShowViz] = useState(false);
  const [view, setView] = useState('layout');
  const [wins, setWins] = useState([]);
  const [zs, setZs] = useState({});
  const zTop = useRef(100);
  const focusWin = (k) => { zTop.current += 1; setZs((z) => ({ ...z, [k]: zTop.current })); };
  const [abFocus, setAbFocus] = useState(null);
  useEffect(() => { if (abFocus != null) setTimeout(() => document.getElementById('abcard-' + abFocus)?.scrollIntoView({ block: 'nearest' }), 60); }, [abFocus, wins]);
  const onEdit = (k, id) => {
    if (k === 'add') { addAb(); k = 'abs'; id = nextId.current - 1; } setWins((w) => (w.includes(k) ? w : [...w, k])); focusWin(k); if (id != null) setAbFocus(id); };
  const toggleWin = (k) => { setWins((w) => (w.includes(k) ? w.filter((x) => x !== k) : [...w, k])); focusWin(k); };
  const [reps, setReps] = useState(() => [newReplicate('R1')]);
  const [call, setCall] = useState(DEFAULT_CALL);
  const [notice, setNotice] = useState('');
  const fileRef = useRef(null);
  const setC = (k) => (e) => setCfg((p) => ({ ...p, [k]: +e.target.value }));
  const setCv = (k, v) => setCfg((p) => ({ ...p, [k]: v }));
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
        ...NO_PARTNER,
      },
    ]);

  const applyCombo = (ab, k) => {
    if (k === 'custom') { updateAb(ab.id, { partnerName: 'Partner', partnerMainParts: 2, partnerParts: 1, partnerPurityPct: 100, partnerMode: 'together' }); return; }
    const p = COMBO_PRESETS.find((x) => x.k === k);
    if (!p) { updateAb(ab.id, { ...NO_PARTNER }); return; }
    if (p.mode === 'ratio') {
      updateAb(ab.id, { name: p.main, partnerName: p.partner, partnerMainParts: p.mainParts, partnerParts: p.parts, partnerPurityPct: 100, partnerMode: 'together' });
    } else {
      updateAb(ab.id, { name: ab.name || p.main, ...NO_PARTNER });
      setAbs((q) =>
        q.some((x) => x.name === p.partner)
          ? q
          : [...q, { id: nextId.current++, name: p.partner, powderMg: '', dissolveVolMl: 5, purityPct: 100, micMin: '', micMax: '', fixed: true, fixedConc: p.conc, fixedBasis: `inhibitor of ${p.main}, fixed concentration`, axis: 'fixed', ...NO_PARTNER }]
      );
    }
  };

  // The number of plates is not an input: the plan is sized for the largest number of plates the material supplies.
  const num0 = (v) => (Number.isFinite(+v) ? +v : 0);
  const capacity = useMemo(() => planCapacity(abs, cfgIn), [abs, cfgIn]);
  const cfg = useMemo(() => ({ ...cfgIn, numPlates: capacity && capacity.best >= 1 ? capacity.best : 1 }), [cfgIn, capacity]);
  const plan = useMemo(() => planExperiment(abs, cfg), [abs, cfg]);
  const errors = plan.messages.filter((m) => m.level === 'error');
  const warnings = plan.messages.filter((m) => m.level === 'warning');
  const { abResults } = plan;

  const colSeries = plan.colRes?.series || [];
  const rowSeries = plan.rowRes?.series || [];
  const broth = useMemo(() => brothBreakdown(plan), [plan]);
  const rr = useMemo(() => planReservoirLoading(plan, cfg), [plan, cfg]);
  const layout = useMemo(
    () => buildLayout(colSeries, rowSeries),
    [colSeries, rowSeries]
  );
  const TABS = [
    ['batch', '⚙️', 'Plate and batch'],
    ['abs', '💊', 'Antibiotics'],
    ['inocset', '🧫', 'Inoculum settings'],
    ['summary', '🧪', 'Chemical plan'],
    ['stocks', '⚗️', 'Stocks & tubes'],
    ['inoculum', '🦠', 'Inoculum plan'],
    ['layout', '▦', 'Plate layout'],
    ['protocol', '📋', 'Protocol & export'],
    ['analysis', '📈', 'FICI analysis'],
    ['sim', '🎲', 'Error simulation'],
  ];
  const win = (k, content) => {
    if (!wins.includes(k)) return null;
    const t = TABS.find((x) => x[0] === k);
    return (
      <FloatWin key={k} title={t[2]} icon={t[1]} z={zs[k] || 100} index={wins.indexOf(k)} onFocus={() => focusWin(k)} onClose={() => toggleWin(k)}>
        {content}
      </FloatWin>
    );
  };

  const saveConfig = () =>
    download('checkerboard_config.json', serializeState({ abs, cfg: cfgIn, reps, call }), 'application/json');
  const loadConfig = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const fr = new FileReader();
    fr.onload = () => {
      const r = parseState(String(fr.result));
      if (r.error) return setNotice(r.error);
      setAbs(r.state.abs);
      setCfg({ ...APP_SETTINGS, ...r.state.cfg });
      if (Array.isArray(r.state.reps) && r.state.reps.length) setReps(r.state.reps);
      if (r.state.call) setCall(r.state.call);
      nextId.current = Math.max(nextId.current, ...r.state.abs.map((a) => a.id + 1));
      setNotice('Configuration loaded.');
    };
    fr.readAsText(f);
    e.target.value = '';
  };
  const copyLink = async () => {
    const url = `${window.location.origin}${window.location.pathname}#s=${encodeShare({ abs, cfg: cfgIn })}`;
    try {
      await navigator.clipboard.writeText(url);
      setNotice('Link copied (plan inputs only; plate data is not included).');
    } catch {
      window.location.hash = `s=${encodeShare({ abs, cfg: cfgIn })}`;
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
      <style>{`@media print{.fwin{position:static!important;width:auto!important;height:auto!important;max-width:none!important;box-shadow:none!important;border:0!important;resize:none!important;overflow:visible!important}.fwin-body{overflow:visible!important;padding:0!important}}`}</style>
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
      {win('batch', (<>
        <div style={S.grid(150)}>
          <Field label="Well volume (µL)" pic="wellVol" picA={cfg.plateVol} help="Total volume in each well once drug and inoculum are in. 100 µL is the CLSI/ISO microdilution format. 200 µL (the default here) makes every pipetting step larger, which lowers relative pipetting error, but it uses more drug and broth.">
            <select style={S.inp} value={cfg.plateVol} onChange={setC('plateVol')}>
              {[50, 100, 200].map((v) => (
                <option key={v} value={v}>{v} µL</option>
              ))}
            </select>
          </Field>
          <Field label="Drug : inoculum volume" pic="drugFrac" picA={cfg.abFracPct} help="How a well is filled: part drug solution, part bacterial suspension. At 50 : 50 the drug is diluted 1:2 when the inoculum is added, and with two titrated drugs each gets a quarter of the well, so the working tubes must be 4× the final concentration. A smaller drug share means more concentrated tubes.">
            <select style={S.inp} value={cfg.abFracPct} onChange={setC('abFracPct')}>
              <option value={50}>50 : 50</option>
              <option value={25}>25 : 75</option>
              <option value={75}>75 : 25</option>
              <option value={90}>90 : 10</option>
            </select>
          </Field>
          <Field label="Overage (%)" pic="overage" picA={cfg.bufferPct} help="Extra volume made on top of what the wells use, to cover pipetting loss, mixing and priming. It is applied once, to each working tube and to the inoculum suspension. 10–20% is typical.">
            <input
              type="number" min={0} style={S.inp} value={cfg.bufferPct} onChange={setC('bufferPct')}
              title="Extra volume prepared on top of what the wells need, to cover pipetting loss and mixing. 10–20% is typical."
            />
          </Field>
          <Field label="Dead volume per tube (mL)" pic="deadMl" help="Liquid that stays in the tube and the tip and cannot be taken out, about 0.5 mL for a 15–50 mL conical tube with a P1000. It is added to every tube so the last wells are not short.">
            <input type="number" min={0} step={0.1} style={S.inp} value={cfg.deadMl} onChange={setC('deadMl')} />
          </Field>
          <Field label="Inoculum vessel dead volume (mL)" pic="inocDead" help="Liquid that stays in the Petri dish or trough and cannot be taken up by the tips (a 12-tip head needs the liquid to be deep enough to cover all tips). It is added to the inoculum suspension, with the McFarland suspension and broth scaled in proportion, so the concentration stays exact. The default of 10 mL is an estimate for a 150-mm dish; check it with your own dish. Leave blank to use the tube dead volume.">
            <input type="number" min={0} step={1} style={S.inp} value={cfg.inocDeadMl} onChange={(e) => setCv('inocDeadMl', e.target.value)} placeholder="same as tube" />
          </Field>
          <Field label="Broth available (mL)" pic="broth" help="Optional. Volume of CAMHB you have. Leave blank if broth is not limiting. The Chemical plan panel then also counts the broth for stocks, working tubes and inoculum when it works out how many plates you can make.">
            <input type="number" min={0} step={50} style={S.inp} value={cfg.camhbAvailMl} onChange={(e) => setCv('camhbAvailMl', e.target.value)} placeholder="not limiting" />
          </Field>
          <Field label="Reservoir well (mL)" pic="reservoir" help="Working capacity of one well of a 12-well reagent reservoir (typically 8–10 mL; check your product). It is used only in the Plate layout panel, to check that the liquid for your plates fits and to say how many fills you need.">
            <input type="number" min={1} step={0.5} style={S.inp} value={cfg.reservoirCapMl} onChange={setC('reservoirCapMl')} />
          </Field>
          <Field label="Tube size (mL)" pic="tubeSize" picA={cfg.tubeMl} help="The largest volume one tube can hold. A working tube or stock that would need more is rejected. Choose the smallest tube that fits so that the dead volume stays small.">
            <select style={S.inp} value={cfg.tubeMl} onChange={setC('tubeMl')}>
              {[5, 10, 15, 30, 40, 50].map((v) => (
                <option key={v} value={v}>{v} mL</option>
              ))}
            </select>
          </Field>
          <Field label="Min. pipetting vol. (µL)" pic="minVol" picA={cfg.minVolUl} help="Pipetting error is roughly proportional to 1 / volume, so very small volumes are inaccurate (50 µL is often used as a practical floor for a P200 or P1000). When a tube would need less than this from a stock, the tool adds a more dilute stock so every transfer stays above it.">
            <select style={S.inp} value={cfg.minVolUl} onChange={setC('minVolUl')}>
              {[10, 20, 50, 100, 200].map((v) => (
                <option key={v} value={v}>{v} µL</option>
              ))}
            </select>
          </Field>
          <Field label="Stock preparation" wide help="Automatic searches for the fewest stock levels, then the least surplus volume, then round dilutions (1:10, 1:20, 1:100 …), so you make fewer steps and waste less. CLSI follows M07 Table 8A: stocks 8-fold apart and tubes made 1+1, 1+3 and 1+7. Choose CLSI when your protocol or reviewers expect that scheme.">
            <PicChoice kind="scheme" value={cfg.stockScheme} onChange={(v) => setCv('stockScheme', v)}
            options={[{ value: 'auto', label: 'Automatic', hint: 'fewest stocks' }, { value: 'clsi', label: 'CLSI M07', hint: 'Table 8A' }]} />
          </Field>
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280', background: '#f0f9ff', borderRadius: 6, padding: '6px 10px' }}>
          <b>Overage</b> is the extra volume made on top of what the wells need, to cover pipetting loss
          and mixing (10–20% is typical); <b>dead volume</b> is what stays in each tube. Both are added to every working tube.
          {cfg.tubeMl > 15 && ' The robot export has no rack for tubes above 15 mL and uses the 50 mL layout.'}
          {cfg.stockScheme === 'clsi' &&
            ' CLSI pattern: stocks 8-fold apart (the first made from the primary stock), each serving the tubes 1+1, 1+3 and 1+7 below it. A stock and the working tube of the same concentration can be made in one tube if you prepare both volumes together.'}
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280', background: '#f0f9ff', borderRadius: 6, padding: '6px 10px' }}>
          Per well: drug <b>{fmt(plan.volAbPerWell, 0)} µL</b> (
          {fmt(plan.volAbPerWellEach, 1)} µL per titrated drug) + inoculum{' '}
          <b>{fmt(plan.volBacPerWell, 0)} µL</b> = <b>{cfg.plateVol} µL</b>. Working
          tubes are therefore{' '}
          <b>{fmt(cfg.plateVol / plan.volAbPerWellEach, 1)}×</b> the final
          concentration.
        </div>
      </>))}

      {/* 2. DRUGS */}
      {win('abs', (<>
        <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 8 }}>
          <input type="checkbox" checked={showViz} onChange={(e) => setShowViz(e.target.checked)} /> Show concentration bars and plate preview
        </label>
        {abs.map((ab, idx) => {
          const res = abResults.find((r) => r.id === ab.id);
          const clsiAuto = !!res?.autoPrimary;
          const primary = res?.primaryStock ?? calcPrimaryStock(ab.powderMg, ab.dissolveVolMl, ab.purityPct);
          return (
            <div key={ab.id} id={'abcard-' + ab.id} style={{ border: abFocus === ab.id ? '2px solid #3b82f6' : '1px solid #e5e7eb', borderRadius: 8, padding: '12px 14px', marginBottom: 10 }}>
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
                <Field label="Name" pic="name">
                  <input style={S.inp} value={ab.name} placeholder="Meropenem" onChange={(e) => updateAb(ab.id, { name: e.target.value })} />
                </Field>
                <Field
                  label={cfg.stockScheme === 'clsi' ? 'Pack size (mg per vial)' : 'Powder (mg)'}
                  pic="powder"
                  help={
                    cfg.stockScheme === 'clsi'
                      ? 'How much powder the manufacturer put in the vial. With the CLSI scheme the whole vial is dissolved, in the volume that makes the primary stock 10× the highest tube, and the stocks below it follow Table 8A, so you do not choose a solvent volume. Enter the weight of powder, not of active drug.'
                      : 'Mass weighed out. Enter the weight of powder, not of active drug: the tool corrects for potency.'
                  }
                >
                  <input type="number" style={S.inp} value={ab.powderMg} onChange={(e) => updateAb(ab.id, { powderMg: e.target.value })} />
                </Field>
                {cfg.stockScheme !== 'clsi' && (
                <Field label="Dissolved in (mL)" pic="dissolve" help="Solvent volume. Stock concentration = mass × potency ÷ volume. Drug mass is conserved, so adding more solvent only dilutes the stock; it does not make more drug.">
                  <input type="number" style={S.inp} value={ab.dissolveVolMl} onChange={(e) => updateAb(ab.id, { dissolveVolMl: e.target.value })} />
                </Field>
                )}
                <Field label="Potency (%)" pic="potency" picA={ab.purityPct} help="Active drug per 100 mg of powder, from the certificate (salts and hydrates contain less than 100%). The tool divides by it so concentrations refer to active drug, which is what an MIC refers to.">
                  <input type="number" min={50} max={100} step={0.1} style={S.inp} value={ab.purityPct} onChange={(e) => updateAb(ab.id, { purityPct: e.target.value })} />
                </Field>
                <Field label="Role" wide help="A checkerboard titrates one drug across the columns and one down the rows. A third drug can be held at one fixed concentration in every well, for example the inhibitor of a combination product.">
                  <PicChoice kind="role" value={ab.fixed ? 'fixed' : ab.axis}
                    onChange={(v) => updateAb(ab.id, v === 'fixed' ? { fixed: true, axis: 'fixed' } : { fixed: false, axis: v })}
                    options={[{ value: 'column', label: 'Across columns', hint: 'varies left → right' }, { value: 'row', label: 'Down rows', hint: 'varies top → bottom' }, { value: 'fixed', label: 'Fixed conc.', hint: 'same in all wells' }]} />
                </Field>
                <Field label="Combination product" wide help="Fixed-ratio products (beta-lactam–beta-lactamase inhibitors, trimethoprim–sulfamethoxazole) are tested as one agent: the partner follows the dilution series at a fixed ratio, both powders are dissolved together, and concentrations refer to the main drug. The ratios in the presets are formulation ratios; check them against the product and your protocol. Alternatively, reference susceptibility testing holds some inhibitors at one concentration (for example avibactam 4 µg/mL); that option adds a separate fixed-concentration drug. State the convention you used when reporting.">
                  <select style={S.inp} value="" onChange={(e) => applyCombo(ab, e.target.value)}>
                    <option value="">{ab.partnerName ? `Partner: ${ab.partnerName} ${ab.partnerMainParts}:${ab.partnerParts}` : 'None / preset…'}</option>
                    <optgroup label="Partner at a fixed ratio (follows the dilutions)">
                      {COMBO_PRESETS.filter((x) => x.mode === 'ratio').map((x) => <option key={x.k} value={x.k}>{x.label}</option>)}
                    </optgroup>
                    <optgroup label="Alternative: inhibitor at a fixed concentration (adds a fixed drug)">
                      {COMBO_PRESETS.filter((x) => x.mode === 'fixed').map((x) => <option key={x.k} value={x.k}>{x.label}</option>)}
                    </optgroup>
                    <option value="custom">Other partner at a fixed ratio…</option>
                    <option value="none">Remove partner</option>
                  </select>
                  <ComboLegend current={ab.fixed ? 'fixed' : ab.partnerName ? 'ratio' : ''} />
                </Field>
                {ab.partnerName !== '' && ab.partnerName !== undefined && (
                  <>
                    <Field label="Partner name" pic="partnerName">
                      <input style={S.inp} value={ab.partnerName} onChange={(e) => updateAb(ab.id, { partnerName: e.target.value })} />
                    </Field>
                    <Field label="Ratio main : partner" pic="ratio" picA={ab.partnerMainParts} picB={ab.partnerParts} help="Parts of the main drug to parts of the partner, for example 2 : 1 for ampicillin : sulbactam or 4 : 1 for a 4:1 protocol.">
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input type="number" min={0} step="any" style={{ ...S.inp, width: 56 }} value={ab.partnerMainParts} onChange={(e) => updateAb(ab.id, { partnerMainParts: e.target.value })} />
                        <span>:</span>
                        <input type="number" min={0} step="any" style={{ ...S.inp, width: 56 }} value={ab.partnerParts} onChange={(e) => updateAb(ab.id, { partnerParts: e.target.value })} />
                      </div>
                    </Field>
                    <Field label="Partner potency (%)" pic="potency" picA={ab.partnerPurityPct} help="Active partner per 100 mg of its powder; used to work out how much partner powder to weigh.">
                      <input type="number" min={50} max={100} step={0.1} style={S.inp} value={ab.partnerPurityPct} onChange={(e) => updateAb(ab.id, { partnerPurityPct: e.target.value })} />
                    </Field>
                    <Field label="Stock preparation" wide help="Together: both powders are dissolved in one solvent and one ladder carries both drugs (simplest; needs a solvent in which both dissolve and stay stable). Separate: each drug gets its own stock and the same dilution steps are repeated for the partner; the two are mixed in every working tube. Use this when the powders need different solvents (for example trimethoprim and sulfamethoxazole). Separate stocks use about twice the tubes and the automatic ladder.">
                      <PicChoice kind="partner" value={ab.partnerMode || 'together'} onChange={(v) => updateAb(ab.id, { partnerMode: v })}
                        options={[{ value: 'together', label: 'Mix into one Primary', hint: 'weigh each, then combine' }, { value: 'separate', label: 'Parallel stocks', hint: 'two ladders, mixed per tube' }]} />
                    </Field>
                    {(ab.partnerMode || 'together') === 'together' && (
                      <Field label="Partner share (%)" help="Each powder is first dissolved on its own (a pre-primary stock); the two solutions are then mixed to make the Primary. This sets what share of the Primary volume is the partner pre-primary (the rest is the main drug pre-primary). The weights are unchanged; a larger share gives a more dilute partner pre-primary.">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <input type="number" min={5} max={95} step={5} style={{ ...S.inp, width: 80 }} value={ab.partnerSplitPct ?? 50} onChange={(e) => updateAb(ab.id, { partnerSplitPct: +e.target.value })} />
                          <ShareBar pct={ab.partnerSplitPct ?? 50} />
                        </div>
                      </Field>
                    )}
                  </>
                )}
                {ab.fixed ? (
                  <>
                    <Field label="Final conc. (µg/mL)" pic="fixedConc" help="Concentration in every well. The drug goes into the inoculum suspension, not into the tubes, so every well receives the same amount.">
                      <input type="number" style={S.inp} value={ab.fixedConc} onChange={(e) => updateAb(ab.id, { fixedConc: e.target.value })} />
                    </Field>
                    <Field label="Concentration refers to" pic="basis" help="Say which component the number refers to (for example sulbactam in ampicillin/sulbactam), because combination products are dosed on one component.">
                      <input style={S.inp} value={ab.fixedBasis} placeholder="e.g. ampicillin component" onChange={(e) => updateAb(ab.id, { fixedBasis: e.target.value })} />
                    </Field>
                  </>
                ) : (
                  <>
                    <SeriesPicker min={ab.micMin} max={ab.micMax} onChange={(patch) => updateAb(ab.id, patch)} />
                    {(() => {
                      const ser = buildDilutionSeries(Number(ab.micMax), Number(ab.micMin));
                      const isRow = ab.axis === 'row';
                      return !showViz ? null : (
                        <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                          <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                            <SeriesBars series={ser} axis={isRow ? 'row' : 'column'} />
                          </div>
                          <div style={{ flex: '0 1 auto', minWidth: 0 }}>
                            <PlateThumb
                              only={isRow ? 'row' : 'col'}
                              colSeries={isRow ? [] : ser}
                              rowSeries={isRow ? ser : []}
                              colName={ab.name || 'Drug'}
                              rowName={ab.name || 'Drug'}
                              cell={17}
                            />
                          </div>
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>
              {primary && (
                <div style={{ marginTop: 8, fontSize: 12, color: '#6b7280', background: '#fafafa', borderRadius: 6, padding: '4px 10px' }}>
                  {clsiAuto ? (
                    <>Dissolve the whole vial ({ab.powderMg} mg) in <b>{fmt(res.dissolveVolMl, 2)} mL</b> → primary stock <b>{fmtConc(primary)} µg/mL</b>
                      {ab.fixed ? ', 100× the concentration needed in the inoculum.' : ', 10× the highest tube (1 + 9, CLSI M07 Table 8A).'}
                      {res.powderUsedMg > 0 && res.powderUsedMg < 0.5 * Number(ab.powderMg) && <> Only {fmt(res.powderUsedMg, 1)} mg of the vial is used; the rest stays in the stock.</>}</>
                  ) : (
                    <>Primary stock: <b>{fmtConc(primary)} µg/mL</b> · volume: <b>{ab.dissolveVolMl} mL</b></>
                  )}
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
      </>))}

      {/* 3. INOCULUM */}
      {win('inocset', (<>
        <div style={S.grid(200)}>
          <Field label="Target in well (CFU/mL)" pic="targetCfu" help="CLSI broth microdilution aims for about 5 × 10⁵ CFU/mL in the well. Too few cells give weak growth and uncertain endpoints; too many cause the inoculum effect, which raises MICs.">
            <SciInput ariaLabel="Target in well" value={cfg.bacTargetCfu} onChange={(v) => setCv('bacTargetCfu', v)} />
          </Field>
          <Field label="0.5 McFarland suspension (CFU/mL)" pic="mcfarland" help="CFU/mL of your 0.5 McFarland suspension. It is about 1–2 × 10⁸ for many bacteria but varies by species and by densitometer, and the dilution to the target depends on it, so confirm it with a colony count.">
            <SciInput ariaLabel="McFarland suspension" value={cfg.bacStockCfu} onChange={(v) => setCv('bacStockCfu', v)} />
          </Field>
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: '#6b7280' }}>
          0.5 McFarland corresponds to roughly 1–2 × 10⁸ CFU/mL and varies by
          organism; confirm the real value with a colony count.
        </div>
      </>))}

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

      {/* MAIN VIEW (always visible) */}
      <div className="np" style={{ ...S.card, padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <b style={{ fontSize: 15, flex: '1 1 auto' }}>{view === 'layout' ? 'Plate layout and preparation' : 'Dilution flow diagram'}</b>
          {[['layout', '▦ Layout'], ['flow', '🔬 Flow diagram']].map(([k, lb]) => (
            <button key={k} type="button" aria-pressed={view === k} onClick={() => setView(k)} style={{ border: '1px solid', borderColor: view === k ? '#3b82f6' : '#d1d5db', background: view === k ? '#eff6ff' : '#fff', color: view === k ? '#1d4ed8' : '#374151', fontWeight: view === k ? 600 : 400, borderRadius: 8, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}>{lb}</button>
          ))}
          {view === 'layout' && [['➕', 'Add antibiotic', 'add'], ['🧪', 'Chemical plan', 'summary'], ['📋', 'Protocol & export', 'protocol']].map(([ic, lb, k]) => (
            <button key={k} type="button" title={lb} onClick={() => onEdit(k)} style={{ border: '1px solid #d1d5db', background: '#fff', borderRadius: 8, padding: '4px 10px', fontSize: 12, cursor: 'pointer', color: '#374151' }}>{ic} {lb}</button>
          ))}
        </div>
        {view === 'layout' ? (
          <PlateBoard plan={plan} cfg={cfg} onEdit={onEdit} />
        ) : (
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
            onEdit={onEdit}
          />
        )}
      </div>

      {/* TOOLBAR */}
      <div className="np" role="toolbar" aria-label="Detail panels" style={{ display: 'flex', gap: 8, margin: '16px 0', flexWrap: 'wrap' }}>
        {TABS.map(([k, icon, label]) => {
          const on = wins.includes(k);
          return (
            <button key={k} type="button" aria-pressed={on} onClick={() => toggleWin(k)} style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid', borderColor: on ? '#3b82f6' : '#d1d5db', borderRadius: 10, padding: '8px 14px', fontSize: 13, cursor: 'pointer', background: on ? '#eff6ff' : '#fff', color: on ? '#1d4ed8' : '#374151', fontWeight: on ? 600 : 500 }}>
              <span aria-hidden style={{ fontSize: 16 }}>{icon}</span>{label}
            </button>
          );
        })}
      </div>

      {/* SUMMARY */}
      {win('summary', (
        <div style={S.card}>
          <div style={S.h}>Summary<Why>Check the last column first. Powder needed against powder available tells you whether the plan can be made, and the stock ladder shows how many dilution steps each drug needs.</Why></div>
          <div style={{ ...S.grid(130), marginBottom: 16 }}>
            <Metric label="Plates" value={cfg.numPlates} />
            <Metric label="Well volume" value={`${cfg.plateVol} µL`} />
            <Metric label="Drug per well" value={`${fmt(plan.volAbPerWell, 0)} µL`} />
            <Metric label="Inoculum per well" value={`${fmt(plan.volBacPerWell, 0)} µL`} />
            <Metric label="Inoculum to prepare" value={`${fmt(plan.bacVolMl, 1)} mL`} />
            <Metric label="Min. pipetting" value={`${cfg.minVolUl} µL`} />
          </div>
          <div style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '10px 14px', margin: '0 0 14px' }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>What to prepare for {cfg.numPlates} plate{cfg.numPlates === 1 ? '' : 's'}</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <tbody>
                {plan.displayResults.map((r) => (
                  <tr key={r.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '4px 6px', color: r.isPartner ? '#7c3aed' : undefined }}>{r.name} powder{r.isPartner ? <span style={{ color: '#6b7280' }}> (partner of {r.mainName}, {r.ratioText})</span> : null}</td>
                    <td style={{ padding: '4px 6px', textAlign: 'right' }}>{r.powderUsedMg != null ? `${fmt(r.powderUsedMg, 1)} mg` : '—'} <span style={{ color: '#6b7280' }}>of {fmt(r.powderMg, 1)} mg weighed</span></td>
                  </tr>
                ))}
                <tr style={{ borderBottom: '1px solid #f3f4f6', fontWeight: 700 }}>
                  <td style={{ padding: '4px 6px' }}>CAMHB in total</td>
                  <td style={{ padding: '4px 6px', textAlign: 'right' }}>{fmt(Math.ceil(broth.total / 10) * 10, 0)} mL <span style={{ fontWeight: 400, color: '#6b7280' }}>(computed {fmt(broth.total, 1)} mL, rounded up to 10 mL)</span></td>
                </tr>
                <tr><td style={{ padding: '2px 6px 2px 20px', color: '#6b7280' }}>working tubes</td><td style={{ padding: '2px 6px', textAlign: 'right', color: '#6b7280' }}>{fmt(broth.tubes, 1)} mL</td></tr>
                <tr><td style={{ padding: '2px 6px 2px 20px', color: '#6b7280' }}>intermediate stocks</td><td style={{ padding: '2px 6px', textAlign: 'right', color: '#6b7280' }}>{fmt(broth.stocks, 1)} mL</td></tr>
                <tr style={{ borderBottom: '1px solid #f3f4f6' }}><td style={{ padding: '2px 6px 2px 20px', color: '#6b7280' }}>inoculum suspension</td><td style={{ padding: '2px 6px', textAlign: 'right', color: '#6b7280' }}>{fmt(broth.inoculum, 1)} mL</td></tr>
                <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '4px 6px' }}>0.5 McFarland suspension</td>
                  <td style={{ padding: '4px 6px', textAlign: 'right' }}>{fmt(plan.volMcFarlandMl * 1000, 0)} µL</td>
                </tr>
                <tr>
                  <td style={{ padding: '4px 6px' }}>Inoculum suspension to prepare</td>
                  <td style={{ padding: '4px 6px', textAlign: 'right' }}>{fmt(plan.bacVolMl, 1)} mL <span style={{ color: '#6b7280' }}>(wells {fmt((cfg.numPlates * 96 * plan.volBacPerWell) / 1000, 1)} mL + {cfg.bufferPct}% overage + {fmt(num0(cfg.inocDeadMl) || cfg.deadMl, 1)} mL left in the vessel)</span></td>
                </tr>
              </tbody>
            </table>
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 6, lineHeight: 1.5 }}>
              The McFarland suspension and the broth for the inoculum scale with the total volume, so the final concentration stays at {fmt(cfg.bacTargetCfu / 1e5, 1)} × 10⁵ CFU/mL before mixing in the well however much extra you make.
              Pour the suspension into the dish or trough in portions as you go: the volume per plate is {fmt((96 * plan.volBacPerWell) / 1000, 1)} mL, more than a 150-mm dish should hold.
            </div>
          </div>
          {capacity && (
            <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '10px 14px', margin: '0 0 14px' }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>How many plates can you make with what you have?</div>
              <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                <b>{capacity.best} plate{capacity.best === 1 ? '' : 's'}</b> can be made{capacity.capped ? ' (search stopped at 500)' : ''}, limited by {capacity.limiting.join(' and ')}. The whole plan below (tube volumes, stocks, protocol) is sized for this number.
              </div>
              <ul style={{ margin: '6px 0 6px', paddingLeft: 18, fontSize: 12, color: '#374151' }}>
                {capacity.perResource.map((r) => (<li key={r.name}>{r.name}: enough for {r.max} plate{r.max === 1 ? '' : 's'}</li>))}
              </ul>
              {capacity.best >= 1 && (
                <div style={{ fontSize: 12, color: '#374151', marginBottom: 6 }}>
                  At {capacity.best} plates, powder used / weighed: {capacity.leftover.map((l) => `${l.name} ${fmt(l.usedMg || 0, 1)} / ${fmt(l.weighedMg || 0, 1)} mg`).join('; ')}.
                </div>
              )}
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 6 }}>
                Each plate count is re-planned in full, so stock steps and tube volumes change with the number of plates. A tube holds at most {cfg.tubeMl} mL; pick a larger tube size if tube size is the limit.
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', margin: '4px 0 14px' }}>
            <PlateThumb
              colSeries={abResults.find((x) => x.type === 'variable' && x.axis === 'column')?.series || []}
              rowSeries={abResults.find((x) => x.type === 'variable' && x.axis === 'row')?.series || []}
              colName={abResults.find((x) => x.type === 'variable' && x.axis === 'column')?.name}
              rowName={abResults.find((x) => x.type === 'variable' && x.axis === 'row')?.name}
            />
            <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.6, flex: '1 1 220px', minWidth: 0 }}>
              Plate preview: outer disc = column drug (red), inner disc = row drug (blue); the darker, the more drug. Concentration is highest at the left and at the top.
              The last used column and row are drug-free controls, and unused wells are grey.
            </div>
          </div>
          <div style={{ margin: '0 0 14px', maxWidth: 560 }}>
            <WellComposition plateVol={cfg.plateVol} volAbEach={plan.volAbPerWell / Math.max(1, abResults.filter((x) => x.type === 'variable').length)} nTitrated={abResults.filter((x) => x.type === 'variable').length} volBac={plan.volBacPerWell} />
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
                {plan.displayResults.map((r) => (
                  <tr key={r.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: 8, fontWeight: 500 }}>{r.name}{r.isPartner ? <span style={{ color: '#7c3aed', fontWeight: 400 }}> (partner of {r.mainName})</span> : null}</td>
                    <td style={{ padding: 8, color: '#6b7280' }}>{roleOf(r)}</td>
                    <td style={{ padding: 8 }}>{r.primaryStock ? `${fmtConc(r.primaryStock)} µg/mL` : '—'}</td>
                    <td style={{ padding: 8 }}>
                      {r.type === 'fixed'
                        ? 'n/a'
                        : r.ladder
                        ? r.ladder.stocks.map((s, si) => (
                            <span key={si}>
                              <StockBadge name={fmtConc(s.conc)} idx={si} />
                              {si < r.ladder.stocks.length - 1 ? ' → ' : ' µg/mL'}
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
      ))}

      {/* STOCKS */}
      {win('stocks', (
        <div>
          {plan.displayResults.map((r) => (
            <div key={r.id} style={{ ...S.card, borderColor: r.volWarning ? '#fca5a5' : r.isPartner ? '#c4b5fd' : '#e5e7eb', marginLeft: r.isPartner ? 18 : 0 }}>
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

              {r.ladder && r.type !== 'fixed' && <LadderFlow r={r} vialMg={r.powderMg} />}
              {r.ladder && r.type !== 'fixed' && <PipetteBars ladder={r.ladder} minVolUl={cfg.minVolUl} />}

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
                    <b style={{ fontSize: 11, color: r.isPartner ? '#7c3aed' : '#3b82f6' }}>Primary stock</b>
                    <div style={{ marginTop: 2 }}>
                      {r.isPartner && r.coDissolved
                        ? <>Pre-primary: weigh <b>{fmt(r.powderMg, 1)} mg {r.name}</b> (potency {r.purityPct}%) in its own tube and dissolve in <b>{r.pre ? fmt(r.pre.partVolMl, 2) : '—'} mL</b> → <b>{r.pre ? fmtConc(r.pre.partConc) : '—'} µg/mL</b>. It is mixed with the {r.mainName} pre-primary to make the Primary ({r.name} <b>{r.primaryStock ? fmtConc(r.primaryStock) : '—'} µg/mL</b>); see the {r.mainName} card.</>
                        : r.partner && r.partner.pre ? <PrePrimary r={r} />
                        : <>Dissolve <b>{r.isPartner ? fmt(r.powderMg, 1) : r.powderMg} mg</b>{r.isPartner ? <> (potency {r.purityPct}%)</> : null} {r.isPartner ? <>{r.name} </> : null}in <b>{r.dissolveVolMl} mL</b> →{' '}
                          <b>{r.primaryStock ? fmtConc(r.primaryStock) : '—'} µg/mL</b>
                          {r.fixedBasis ? ` (${r.fixedBasis})` : ''}.</>}
                    </div>
                  </div>
                  <div style={S.step}>
                    <b style={{ fontSize: 11, color: '#3b82f6' }}>Add to inoculum suspension</b>
                    <div style={{ marginTop: 2 }}>
                      Add <b>{r.volNeededFromPrimaryMl ? fmt(r.volNeededFromPrimaryMl * 1000, 1) : '—'} µL</b>{' '}
                      {r.isPartner && r.coDissolved ? <>(the same draw as {r.mainName}, it already contains {r.name}) </> : null}
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
                          {si > 0 && <Why>This stock exists because some tubes would otherwise need less than the minimum pipetting volume from the stock above it. Its dilution factor is chosen to give the fewest stocks, the least leftover volume and round pipetting volumes. The volume is rounded up to 0.1 mL; the overage and dead volume are already in the tubes, so they are not added twice.</Why>}
                        </div>
                        {r.isPartner && r.coDissolved ? (
                          <div style={{ fontSize: 12, color: '#374151' }}>
                            {si === 0
                              ? <>Pre-primary: weigh <b>{fmt(r.powderMg, 1)} mg {r.name}</b> (potency {r.purityPct}%) in its own tube and dissolve in <b>{r.pre ? fmt(r.pre.partVolMl, 2) : '—'} mL</b> → <b>{r.pre ? fmtConc(r.pre.partConc) : '—'} µg/mL</b>. Mix it with the {r.mainName} pre-primary: the <b>Primary</b> then holds {r.name} <b>{fmtConc(s.conc)} µg/mL</b> (this tube is the same as the {r.mainName} Primary). </>
                              : <>Not a separate tube: it is already in the <b>{r.mainName} {s.name.toLowerCase()} stock</b> (same tube, same pipetting) at <b>{fmtConc(s.conc)} µg/mL</b>. </>}
                          </div>
                        ) : si === 0 && r.partner && r.partner.pre ? (
                          <div style={{ fontSize: 12, color: '#374151' }}>
                            <PrePrimary r={r} />
                            <div style={{ marginTop: 4 }}>Draw <b>{fmt(s.volNeeded_mL, 2)} mL</b> of the Primary (uses {fmt(r.powderUsedMg, 1)} mg {r.name}).</div>
                          </div>
                        ) : si === 0 ? (
                          <div style={{ fontSize: 12, color: '#374151' }}>
                            {r.isPartner ? <>Weigh <b>{fmt(r.powderMg, 1)} mg {r.name}</b> (potency {r.purityPct}%) into its <b>own tube</b>. </> : null}
                            Dissolve <b>{r.isPartner ? '' : r.powderMg + ' mg'}</b> powder in <b>{r.dissolveVolMl} mL</b> solvent →{' '}
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

                  {r.partner && (
                    <div style={{ ...S.step, borderLeftColor: '#7c3aed', fontSize: 12, color: '#374151' }}>
                      <b style={{ fontSize: 11, color: '#7c3aed' }}>Combination product: {r.name} + {r.partner.name} ({r.name}:{r.partner.name} {r.partner.parts})</b>
                      <div style={{ marginTop: 4 }}>
                        {r.partner.mode === 'separate'
                          ? <>{r.partner.name} is a second drug with its own powder, stock tube and ladder (card below). Make every {r.name} stock and its {r.partner.name} counterpart with the same volumes, and put the same volume from each into the working tube.</>
                          : <>Each powder is weighed and dissolved separately (pre-primary stocks); mixing the two makes the Primary, so every stock and tube below carries both drugs. The {r.partner.name} card below gives its weight and pre-primary.</>}
                      </div>
                    </div>
                  )}
                  <div style={{ ...S.step, borderLeftColor: '#6b7280' }}>
                    <b style={{ fontSize: 11, color: '#374151' }}>
                      {r.isPartner ? `${r.name} in the working tubes` : 'Working tubes'} — {r.series.length} × {fmt(r.workVolMl, 1)} mL, each made independently
                    </b>
                    <Why>Each tube is made in one step from a stock, not from the previous tube. In serial dilution a pipetting error in one step is carried into every later tube; here it stays in that tube. A stock is made more dilute only when a tube would otherwise need less than the minimum pipetting volume.</Why>
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
                                {r.isPartner && r.coDissolved ? <span style={{ fontWeight: 400, color: '#7c3aed' }}> (same draw as {r.mainName})</span> : null}
                              </td>
                              <td style={{ padding: '6px 10px' }}>{r.isPartner ? <span style={{ color: '#9ca3af' }}>in the same tube</span> : `${fmt(f.camhb_mL, 2)} mL`}</td>
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
      ))}

      {/* INOCULUM */}
      {win('inoculum', (
        <div style={S.card}>
          <div style={S.h}>Inoculum preparation<Why>A 0.5 McFarland suspension is far too dense for the assay, so it is diluted in broth to twice the well target (the other half of each well is drug solution, which halves it again). A fixed-concentration drug is added to this suspension so every well receives the same amount.</Why></div>
          <InoculumFlow plan={plan} cfg={cfg} />
          <div style={{ ...S.grid(140), margin: '12px 0 16px' }}>
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
      ))}

      {/* LAYOUT */}
      {win('layout', (
        <div style={S.card}>
          <div style={S.h}>Plate layout<Why>One drug runs across the columns and the other down the rows, so every well holds a different pair. The last column and row carry no drug, which gives each drug’s MIC alone and the growth control used to call growth.</Why></div>
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
              {rr && (
                <div style={{ ...S.step, marginTop: 16 }}>
                  <b style={{ fontSize: 11, color: '#3b82f6' }}>High-throughput loading: 12-well reservoirs and a multichannel pipette</b>
                  <div style={{ margin: '4px 0 8px', fontSize: 13 }}>
                    Pour each working tube into one well of a 12-well reservoir (tube 1 → well 1, and so on; the drug-free column is a well of plain broth).
                    Then the pipette fills a whole row or column at a time: <b>{rr.steps.multi} dispenses per plate instead of {rr.steps.single}</b> with a single-channel pipette
                    ({fmt(rr.steps.ratio, 1)}× fewer).
                  </div>
                  <LoadingFigure colConcs={rr.col.wells.map((w) => w.conc)} rowConcs={rr.row.wells.map((w) => w.conc)} colName={rr.col.name} rowName={rr.row.name} />
                  {plan.abResults.some((x) => x.partner && x.type === 'variable') && (
                    <div style={{ fontSize: 12, color: '#7c3aed', margin: '6px 0 0' }}>
                      Combination products: numbers are of the main drug; {plan.abResults.filter((x) => x.partner && x.type === 'variable').map((x) => `${x.partner.name} is ${fmt(x.partner.f * 100, 0)}% of ${x.name} in every well`).join('; ')}.
                    </div>
                  )}
                  <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>
                    <li>
                      <b style={{ color: '#b91c1c' }}>{rr.col.name}</b> (across columns): 12-channel pipette, {fmt(plan.volAbPerWellEach, 1)} µL per well, <b>{rr.col.passes} passes</b> (one per row);
                      each reservoir well gives {fmt(rr.col.drawPerPlateMl, 2)} mL per plate. Pour <b>{rr.col.pourMl ?? '—'} mL</b> per well
                      {rr.col.fills > 1 ? `, ${rr.col.fills} fills of ${rr.col.platesPerFill} plates` : ` (all ${cfg.numPlates} plates in one fill)`}.
                    </li>
                    <li>
                      <b style={{ color: '#1d4ed8' }}>{rr.row.name}</b> (down rows): tips 1–{rr.nR} of the pipette (a 12-channel with 8 tips fitted works), {fmt(plan.volAbPerWellEach, 1)} µL per well, <b>{rr.row.passes} passes</b> (one per column);
                      each well gives {fmt(rr.row.drawPerPlateMl, 2)} mL per plate. Pour <b>{rr.row.pourMl ?? '—'} mL</b> per well
                      {rr.row.fills > 1 ? `, ${rr.row.fills} fills of ${rr.row.platesPerFill} plates` : ` (all ${cfg.numPlates} plates in one fill)`}.
                    </li>
                    <li>
                      Inoculum: single-well trough, {fmt(plan.volBacPerWell, 0)} µL per well, <b>{rr.inoc.passes} passes</b>; {fmt(rr.inoc.drawPerPlateMl, 1)} mL per plate.
                    </li>
                  </ul>
                  {rr.issues.map((t, i) => (
                    <div key={i} style={{ marginTop: 6, fontSize: 12, color: '#b91c1c' }}>{t}</div>
                  ))}
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 6, lineHeight: 1.6 }}>
                    Every channel keeps drawing from its own well, so a tip never meets another concentration and the same tips can serve all passes of one plate.
                    Dispense the drugs first and the inoculum last, with fresh tips for the inoculum. Check the dispensed volume of your multichannel gravimetrically
                    (the 12 channels do not all deliver the same volume), and pour the liquid in just before you start to limit evaporation from the reservoir.
                  </div>
                </div>
              )}
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
      ))}

      {win('protocol', <ProtocolTab plan={plan} cfg={cfg} capacity={capacity} />)}

      {win('analysis', (
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
      ))}

      {win('sim', <SimTab plan={plan} cfg={cfg} />)}
    </div>
  );
}
