import { useState } from 'react';
import { Field, Metric, S, btn } from './ui.jsx';
import { fmt } from './calc.js';
import { DEFAULT_SIM, simulateFici } from './sim.js';
import { download, toCsv } from './io.js';

const PRESETS = [
  { k: 1, label: 'Illustrative (about 0.7% CV at 50 µL, 2.3% at 10 µL)' },
  { k: 10, label: 'Poor technique (×10 error: 7% at 50 µL)' },
  { k: 30, label: 'Very poor (×30 error: 21% at 50 µL)' },
];

export default function SimTab({ plan, cfg }) {
  const [truth, setTruth] = useState(1);
  const [preset, setPreset] = useState(1);
  const [n, setN] = useState(DEFAULT_SIM.n);
  const [seed, setSeed] = useState(DEFAULT_SIM.seed);
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);

  const run = () => {
    setBusy(true);
    setTimeout(() => {
      const out = simulateFici(plan, cfg, {
        n,
        seed,
        trueFici: truth,
        cvFloor: DEFAULT_SIM.cvFloor * preset,
        cvSlope: DEFAULT_SIM.cvSlope * preset,
      });
      setRes({ ...out, truth, preset, n });
      setBusy(false);
    }, 20);
  };

  const ref = res?.rows?.find((r) => r.key === 'perfect');
  const se = ref ? ref.sdLog2 / Math.sqrt(2 * res.n) : NaN;

  return (
    <div style={S.card}>
      <div style={S.h}>Preparation-error simulation</div>
      <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, marginBottom: 12 }}>
        How much does the way tubes are prepared change the reported FICI? The simulation draws a true interaction
        (Loewe additivity with a chosen true FICI), makes the tubes with random pipetting error using this plan, reads the
        simulated plate and computes FICI exactly as for real data. Three preparation strategies are compared with an
        error-free reference. Weighing and potency errors scale every tube of a drug equally, cancel in FIC = C / MIC,
        and are therefore not simulated.
      </div>
      <div style={S.grid(190)}>
        <Field label="True interaction (FICI)">
          <select style={S.inp} value={truth} onChange={(e) => setTruth(+e.target.value)}>
            <option value={0.5}>Synergy (0.5)</option>
            <option value={1}>Additive (1)</option>
            <option value={2}>Mild antagonism (2)</option>
          </select>
        </Field>
        <Field label="Pipetting error model">
          <select style={S.inp} value={preset} onChange={(e) => setPreset(+e.target.value)}>
            {PRESETS.map((p) => (<option key={p.k} value={p.k}>{p.label}</option>))}
          </select>
        </Field>
        <Field label="Simulated plates">
          <input type="number" min={200} step={500} style={S.inp} value={n} onChange={(e) => setN(Math.max(200, +e.target.value))} />
        </Field>
        <Field label="Random seed">
          <input type="number" style={S.inp} value={seed} onChange={(e) => setSeed(+e.target.value)} />
        </Field>
      </div>
      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 6 }}>
        CV(V) = {fmt(DEFAULT_SIM.cvFloor * preset * 100, 2)}% + {fmt(DEFAULT_SIM.cvSlope * preset, 2)} / V(µL). These values
        are illustrative; use your pipettes' specification for a real study.
      </div>
      <div style={{ margin: '12px 0' }}>
        <button style={{ ...btn, background: '#3b82f6', color: '#fff', borderColor: '#3b82f6', fontWeight: 600 }} onClick={run} disabled={busy}>
          {busy ? 'Running…' : 'Run simulation'}
        </button>
      </div>

      {res?.error && <div role="alert" style={{ color: '#b91c1c', fontSize: 13 }}>{res.error}</div>}

      {res && !res.error && (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#6b7280', fontSize: 12, borderBottom: '1px solid #e5e7eb' }}>
                  {['Strategy', 'Median FICI (min)', 'IQR', 'SD of log₂ FICI', 'Excess SD vs reference', 'P(FICI ≤ 0.5)', 'P(FICI > 4)'].map((h) => (
                    <th key={h} style={{ padding: '6px 8px', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {res.rows.map((r) => {
                  const excess = r.sdLog2 - ref.sdLog2;
                  return (
                    <tr key={r.key} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: 8, fontWeight: r.key === 'ladder' ? 700 : 400 }}>{r.label}</td>
                      <td style={{ padding: 8 }}>{fmt(r.median, 2)}</td>
                      <td style={{ padding: 8 }}>{fmt(r.q1, 2)}–{fmt(r.q3, 2)}</td>
                      <td style={{ padding: 8 }}>{fmt(r.sdLog2, 3)}</td>
                      <td style={{ padding: 8 }}>{r.key === 'perfect' ? '—' : `${excess >= 0 ? '+' : ''}${fmt(excess, 3)}`}</td>
                      <td style={{ padding: 8 }}>{fmt(r.pFalseSynergy * 100, 1)}%</td>
                      <td style={{ padding: 8 }}>{fmt(r.pFalseAntagonism * 100, 1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ ...S.grid(170), margin: '12px 0' }}>
            <Metric label="Monte Carlo error of an SD" value={`± ${fmt(se, 3)}`} />
            <Metric label="Plates per strategy" value={res.n} />
            <Metric label="True FICI simulated" value={res.truth} />
          </div>
          <div style={{ background: '#f0f9ff', borderRadius: 8, padding: '10px 14px', fontSize: 13, lineHeight: 1.6 }}>
            {(() => {
              const others = res.rows.filter((r) => r.key !== 'perfect');
              const maxEx = Math.max(...others.map((r) => r.sdLog2 - ref.sdLog2));
              return maxEx < 2 * se
                ? `With this error model no strategy differs from the error-free reference by more than twice the Monte Carlo error (±${fmt(se, 3)}): the two-fold readout, not the pipetting, limits FICI reproducibility.`
                : `At this error level preparation starts to matter: the strategies add up to ${fmt(maxEx, 3)} to the SD of log₂ FICI (Monte Carlo error ±${fmt(se, 3)}). Compare the rows to see which one suffers least.`;
            })()}
          </div>
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 8, lineHeight: 1.6 }}>
            The error-free row shows the floor set by the two-fold readout itself: even a perfect plate reports a median
            minimum FICI that differs from the true value, because MICs and interface wells are only known to the nearest
            dilution. Gross errors (wrong dilution, carry-over, degraded drug, evaporation) are not modelled.
          </div>
          <button
            style={{ ...btn, marginTop: 10 }}
            onClick={() =>
              download(
                'preparation_error_simulation.csv',
                toCsv([
                  ['strategy', 'n', 'median_fici', 'q1', 'q3', 'sd_log2_fici', 'p_fici_le_0.5', 'p_fici_gt_4'],
                  ...res.rows.map((r) => [r.label, r.n, r.median, r.q1, r.q3, r.sdLog2, r.pFalseSynergy, r.pFalseAntagonism]),
                ]),
                'text/csv'
              )
            }
          >
            Download table (CSV)
          </button>
        </>
      )}
    </div>
  );
}
