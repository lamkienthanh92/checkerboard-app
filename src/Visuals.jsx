import { STOCK_COLORS } from './ui.jsx';
import { fmtConc } from './calc.js';

const mix = (hex, a) => `${hex}${Math.round(a * 255).toString(16).padStart(2, '0')}`;
const vol = (mL) => (mL < 1 ? `${Math.round(mL * 1000)} µL` : `${Number(mL.toFixed(2))} mL`);
const ul = (u) => (u >= 1000 ? `${Number((u / 1000).toFixed(2))} mL` : `${Number(u.toFixed(1))} µL`);

/** A test tube drawn with its liquid level. fill 0–1; drugFrac = share of drug (dark) vs broth (light). */
function Tube({ x, y, w = 30, h = 70, fill, color, drugFrac = 1, label, sub }) {
  const lh = Math.max(4, h * Math.min(1, fill));
  const dh = lh * Math.min(1, drugFrac);
  const id = `c${Math.round(x)}-${Math.round(y)}`;
  return (
    <g>
      <clipPath id={id}><path d={`M${x},${y} h${w} v${h - w / 2} a${w / 2},${w / 2} 0 0 1 ${-w},0 z`} /></clipPath>
      <g clipPath={`url(#${id})`}>
        <rect x={x} y={y + h - lh} width={w} height={lh} fill={mix(color, 0.18)} />
        <rect x={x} y={y + h - dh} width={w} height={dh} fill={mix(color, 0.7)} />
      </g>
      <path d={`M${x},${y} h${w} v${h - w / 2} a${w / 2},${w / 2} 0 0 1 ${-w},0 z`} fill="none" stroke="#9ca3af" strokeWidth="1.5" />
      <text x={x + w / 2} y={y + h + 14} textAnchor="middle" fontSize="11" fontWeight="600" fill="#374151">{label}</text>
      {sub && <text x={x + w / 2} y={y + h + 27} textAnchor="middle" fontSize="9.5" fill="#6b7280">{sub}</text>}
    </g>
  );
}

/** Vial → stock tubes → working tubes. */
export function LadderFlow({ r, vialMg }) {
  const L = r.ladder;
  if (!L) return null;
  const n = L.stocks.length;
  const gap = 118;
  const x0 = 70;
  const wTubes = L.falcons.length;
  const wStep = 40;
  const width = Math.max(x0 + n * gap + 20, 24 + wTubes * wStep + 10, 360);
  const maxV = Math.max(...L.stocks.map((s) => s.volNeeded_mL), 1);
  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={width} height={285} role="img" aria-label={`Dilution scheme for ${r.name}`} style={{ display: 'block' }}>
        <text x="6" y="14" fontSize="11" fontWeight="600" fill="#6b7280">STOCKS</text>
        {/* vial */}
        <g>
          <rect x="12" y="38" width="30" height="44" rx="4" fill="#f3f4f6" stroke="#9ca3af" strokeWidth="1.5" />
          <rect x="16" y="30" width="22" height="9" rx="2" fill="#9ca3af" />
          <rect x="15" y="62" width="24" height="17" fill="#e5e7eb" />
          <text x="27" y="97" textAnchor="middle" fontSize="10.5" fontWeight="600" fill="#374151">
            {vialMg ? `${Number(vialMg)} mg` : 'powder'}
          </text>
        </g>
        {L.stocks.map((s, k) => {
          const c = STOCK_COLORS[k % STOCK_COLORS.length];
          const x = x0 + k * gap;
          return (
            <g key={k}>
              <text x={x - 24} y="62" fontSize="16" fill="#9ca3af">→</text>
              {k === 0 ? (
                <text x={x - 52} y="50" fontSize="9" fill="#6b7280" textAnchor="start">{vol(r.dissolveVolMl || s.volNeeded_mL)}</text>
              ) : (
                <>
                  <text x={x - 56} y="40" fontSize="9" fill="#374151">{ul(s.fromPrev_uL)}</text>
                  <text x={x - 56} y="50" fontSize="9" fill="#6b7280">+ {vol(s.camhb_mL)}</text>
                </>
              )}
              <Tube
                x={x} y={26} w={32} h={72}
                fill={0.2 + 0.7 * (s.volNeeded_mL / maxV)} color={c}
                drugFrac={k === 0 ? 1 : (s.fromPrev_uL / 1000) / s.volNeeded_mL + 0.08}
                label={`${fmtConc(s.conc)}`}
                sub={k === 0 ? 'primary' : `${s.name.toLowerCase()} · 1:${s.dilution}`}
              />
            </g>
          );
        })}
        <line x1="6" x2={width - 6} y1="148" y2="148" stroke="#e5e7eb" />
        <text x="6" y="168" fontSize="11" fontWeight="600" fill="#6b7280">WORKING TUBES (µg/mL, 4× final) — colour = stock used</text>
        {L.falcons.map((f, i) => {
          const c = STOCK_COLORS[f.stockIdx % STOCK_COLORS.length];
          const x = 24 + i * wStep;
          return (
            <Tube
              key={i} x={x} y={178} w={22} h={56} fill={0.9} color={c}
              drugFrac={Math.max(0.06, f.volFromStock_mL / f.totalMl)}
              label={fmtConc(f.finalConc)}
            />
          );
        })}
        <text x="6" y="278" fontSize="9.5" fill="#6b7280">dark = drug stock, light = CAMHB. Volumes taken are in the table below.</text>
      </svg>
    </div>
  );
}

const COL_C = '#ef4444';
const ROW_C = '#3b82f6';

/**
 * The series laid out like the plate: a column drug runs left→right (one bar per column),
 * a row drug runs top→bottom (one bar per row, A, B, C…).
 */
export function SeriesBars({ series, axis = 'column' }) {
  if (!series?.length) return null;
  const hi = Math.log2(series[0]);
  const lo = Math.log2(series[series.length - 1]);
  const span = Math.max(1, hi - lo);
  const frac = (c) => (Math.log2(c) - lo) / span;
  const color = axis === 'row' ? ROW_C : COL_C;
  const letters = 'ABCDEFGH';
  if (axis === 'row') {
    return (
      <div aria-hidden="true" style={{ display: 'grid', gap: 3, margin: '6px 0', maxWidth: 420 }}>
        {[...series, 0].map((c, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, color: '#6b7280' }}>
            <span style={{ width: 14, fontWeight: 600 }}>{letters[i]}</span>
            <div style={{ height: 10, borderRadius: 3, width: `${c ? 10 + 70 * frac(c) : 3}%`, background: c ? mix(color, 0.3 + 0.65 * frac(c)) : '#d1d5db' }} />
            <span>{c ? fmtConc(c) : 'drug-free'}</span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div aria-hidden="true" style={{ display: 'flex', alignItems: 'flex-end', gap: 3, margin: '6px 0' }}>
      {[...series, 0].map((c, i) => (
        <div key={i} style={{ flex: '1 1 0', maxWidth: 44, minWidth: 14, textAlign: 'center', fontSize: 9.5, color: '#6b7280' }}>
          <div style={{ height: c ? 8 + 40 * frac(c) : 4, background: c ? mix(color, 0.3 + 0.65 * frac(c)) : '#d1d5db', borderRadius: '3px 3px 0 0' }} />
          <div style={{ fontWeight: 600 }}>{i + 1}</div>
          <div>{c ? fmtConc(c) : '0'}</div>
        </div>
      ))}
    </div>
  );
}

/**
 * 8 × 12 plate. Outer disc = column drug (red), inner disc = row drug (blue).
 * `only` shows a single drug, which makes the stripes obvious.
 */
export function PlateThumb({ colSeries = [], rowSeries = [], colName = 'Column drug', rowName = 'Row drug', only, cell = 22 }) {
  // a drug shown alone is present in every row (column drug) or every column (row drug)
  const cols = only === 'row' ? 12 : colSeries.length + 1;
  const rows = only === 'col' ? 8 : rowSeries.length + 1;
  const ox = 26;
  const oy = only ? 34 : 46;
  const lvl = (v, s) => (v > 0 && s.length ? 0.2 + 0.8 * (s.length > 1 ? (Math.log2(v) - Math.log2(s[s.length - 1])) / (Math.log2(s[0]) - Math.log2(s[s.length - 1])) : 1) : 0);
  const W = ox + 12 * cell + 6;
  const H = oy + 8 * cell + 6;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Plate preview" style={{ maxWidth: '100%', height: 'auto' }}>
      {only !== 'row' && (
        <text x={ox} y="12" fontSize="10.5" fontWeight="600" fill={COL_C}>{colName} → across columns (1–12)</text>
      )}
      {only !== 'col' && (
        <text x={ox} y={only ? 12 : 26} fontSize="10.5" fontWeight="600" fill={ROW_C}>{rowName} ↓ down rows (A–H)</text>
      )}
      {Array.from({ length: 12 }).map((_, c) => (
        <text key={c} x={ox + c * cell + cell / 2} y={oy - 3} textAnchor="middle" fontSize="8.5" fill="#9ca3af">{c + 1}</text>
      ))}
      {Array.from({ length: 8 }).map((_, r) => (
        <g key={r}>
          <text x={ox - 8} y={oy + r * cell + cell / 2 + 3} textAnchor="middle" fontSize="8.5" fill="#9ca3af">{'ABCDEFGH'[r]}</text>
          {Array.from({ length: 12 }).map((__, c) => {
            const used = r < rows && c < cols;
            const a = used && c < colSeries.length ? lvl(colSeries[c], colSeries) : 0;
            const b = used && r < rowSeries.length ? lvl(rowSeries[r], rowSeries) : 0;
            const cx = ox + c * cell + cell / 2;
            const cy = oy + r * cell + cell / 2;
            return (
              <g key={c}>
                <circle cx={cx} cy={cy} r={cell / 2 - 1.5} fill={used ? (only === 'row' ? '#fff' : mix(COL_C, a * 0.85)) : '#f3f4f6'} stroke={used ? '#9ca3af' : '#e5e7eb'} strokeWidth="1" />
                {used && only !== 'col' && b > 0 && <circle cx={cx} cy={cy} r={(cell / 2 - 1.5) * (only === 'row' ? 0.95 : 0.55)} fill={mix(ROW_C, b * 0.9)} />}
              </g>
            );
          })}
        </g>
      ))}
    </svg>
  );
}

/** What one well contains, drawn to scale. */
export function WellComposition({ plateVol, volAbEach, nTitrated, volBac }) {
  const parts = [
    ...Array.from({ length: nTitrated }, (_, i) => ({ label: i === 0 ? 'column drug' : 'row drug', v: volAbEach, c: i === 0 ? COL_C : ROW_C })),
    { label: 'inoculum', v: volBac, c: '#10b981' },
  ];
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', height: 30, borderRadius: 6, overflow: 'hidden', border: '1px solid #d1d5db' }}>
        {parts.map((p, i) => (
          <div key={i} style={{ width: `${(100 * p.v) / plateVol}%`, background: mix(p.c, 0.35), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: '#374151', borderLeft: i ? '1px solid #fff' : 'none' }}>
            {Number(p.v.toFixed(1))} µL
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', fontSize: 10.5, color: '#6b7280' }}>
        {parts.map((p, i) => (<div key={i} style={{ width: `${(100 * p.v) / plateVol}%`, textAlign: 'center' }}>{p.label}</div>))}
      </div>
      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>One well = {plateVol} µL, so every drug is diluted by the added volumes: working tubes are {Math.round(plateVol / volAbEach)}× the final concentration.</div>
    </div>
  );
}

/** McFarland tube → broth → inoculum suspension → wells. */
export function InoculumFlow({ plan, cfg }) {
  const mc = plan.volMcFarlandMl;
  const total = plan.bacVolMl;
  const broth = plan.camhbForBacMl;
  const vol = (mL) => (mL < 1 ? `${Number((mL * 1000).toFixed(1))} µL` : `${Number(mL.toFixed(2))} mL`);
  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={560} height={170} role="img" aria-label="Inoculum preparation" style={{ display: 'block' }}>
        <Tube x={20} y={20} w={34} h={80} fill={0.8} color="#10b981" drugFrac={1} label="0.5 McFarland" sub={`${Number((cfg.bacStockCfu / 1e8).toFixed(2))}×10⁸ CFU/mL`} />
        <text x="62" y="62" fontSize="11" fill="#374151" fontWeight="600">{vol(mc)}</text>
        <text x="62" y="76" fontSize="16" fill="#9ca3af">→</text>
        <Tube x={170} y={20} w={34} h={80} fill={0.9} color="#6b7280" drugFrac={0} label="CAMHB" sub={vol(Math.max(broth, 0))} />
        <text x="212" y="62" fontSize="16" fill="#9ca3af">+</text>
        <text x="232" y="62" fontSize="16" fill="#9ca3af">→</text>
        <Tube x={290} y={20} w={42} h={80} fill={0.9} color="#10b981" drugFrac={Math.max(0.05, mc / total) * 8} label="Inoculum" sub={`${vol(total)} · ${Number((cfg.bacTargetCfu / plan.bacFrac / 1e5).toFixed(1))}×10⁵ CFU/mL`} />
        <text x="345" y="62" fontSize="16" fill="#9ca3af">→</text>
        {Array.from({ length: 6 }).map((_, c) => Array.from({ length: 4 }).map((__, r) => (
          <circle key={`${r}${c}`} cx={380 + c * 18} cy={30 + r * 18} r="7" fill="#10b98155" stroke="#9ca3af" />
        )))}
        <text x="380" y="118" fontSize="11" fontWeight="600" fill="#374151">{fmtNum(plan.volBacPerWell)} µL per well</text>
        <text x="380" y="132" fontSize="10" fill="#6b7280">→ {Number((cfg.bacTargetCfu / 1e5).toFixed(1))}×10⁵ CFU/mL in the well</text>
        <text x="20" y="160" fontSize="10" fill="#6b7280">Dilution of the McFarland suspension 1 : {Math.round(1 / plan.dilFactor)} (dark green = bacteria, light = broth).</text>
      </svg>
    </div>
  );
}
const fmtNum = (v) => Number(v.toFixed(1));

/** How much each working tube takes from its stock (log scale), against the minimum pipetting volume. */
export function PipetteBars({ ladder, minVolUl }) {
  const fs = ladder?.falcons;
  if (!fs?.length) return null;
  const vals = fs.map((f) => f.volFromStock_uL);
  const lo = Math.log10(Math.min(minVolUl * 0.5, ...vals));
  const hi = Math.log10(Math.max(...vals) * 1.1);
  const pos = (v) => `${(100 * (Math.log10(v) - lo)) / (hi - lo)}%`;
  const label = (u) => (u >= 1000 ? `${Number((u / 1000).toFixed(2))} mL` : `${Number(u.toFixed(1))} µL`);
  return (
    <div aria-label="Volume taken from stock per working tube" style={{ margin: '4px 0 12px' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>VOLUME TAKEN FROM STOCK PER TUBE (log scale; dashed line = minimum pipetting volume)</div>
      <div style={{ position: 'relative', display: 'grid', gap: 3 }}>
        {fs.map((f, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5 }}>
            <span style={{ width: 50, color: '#6b7280', textAlign: 'right' }}>{fmtConc(f.finalConc)}</span>
            <div style={{ position: 'relative', flex: 1, height: 12, background: '#f3f4f6', borderRadius: 3 }}>
              <div style={{ width: pos(f.volFromStock_uL), height: '100%', borderRadius: 3, background: mix(STOCK_COLORS[f.stockIdx % STOCK_COLORS.length], 0.75) }} />
              <div style={{ position: 'absolute', left: pos(minVolUl), top: -2, bottom: -2, borderLeft: '1.5px dashed #b91c1c' }} />
            </div>
            <span style={{ width: 62, color: '#374151' }}>{label(f.volFromStock_uL)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
