import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { buildDilutionSeries, fmtConc } from './calc.js';

export const STOCK_COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#f97316'];
export const STOCK_BG = ['#eff6ff', '#fffbeb', '#f0fdf4', '#f5f3ff', '#fdf2f8', '#fff7ed'];

export const S = {
  inp: {
    width: '100%',
    padding: '6px 10px',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    fontSize: 13,
    background: '#fff',
    boxSizing: 'border-box',
  },
  lbl: { display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 3, whiteSpace: 'nowrap' },
  card: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 10,
    padding: '16px 20px',
    marginBottom: 14,
  },
  metric: { background: '#f9fafb', borderRadius: 8, padding: '10px 14px' },
  step: { borderLeft: '3px solid #3b82f6', paddingLeft: 12, marginBottom: 14 },
  h: { fontWeight: 600, marginBottom: 12, fontSize: 15 },
  grid: (min) => ({
    display: 'grid',
    gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`,
    gap: 12,
  }),
};

export function StockBadge({ name, idx }) {
  const ci = idx % STOCK_COLORS.length;
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 600,
        background: STOCK_BG[ci],
        color: STOCK_COLORS[ci],
        border: `1px solid ${STOCK_COLORS[ci]}44`,
        borderRadius: 8,
        padding: '1px 7px',
      }}
    >
      {name}
    </span>
  );
}

export function Metric({ label, value }) {
  return (
    <div style={S.metric}>
      <div style={{ fontSize: 17, fontWeight: 600 }}>{value}</div>
      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{label}</div>
    </div>
  );
}

const helpBtn = (open) => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 16,
  height: 16,
  marginLeft: 6,
  padding: 0,
  borderRadius: '50%',
  border: '1px solid #f59e0b',
  background: open ? '#f59e0b' : '#fffbeb',
  color: open ? '#fff' : '#b45309',
  fontSize: 10,
  fontWeight: 700,
  lineHeight: 1,
  cursor: 'pointer',
  verticalAlign: 'middle',
});
const helpBox = {
  position: 'absolute',
  top: 22,
  left: 0,
  zIndex: 30,
  width: 300,
  maxWidth: 'calc(100vw - 32px)',
  boxSizing: 'border-box',
  background: '#fffbeb',
  border: '1px solid #fcd34d',
  borderRadius: 8,
  boxShadow: '0 6px 18px rgba(0,0,0,0.14)',
  padding: '8px 12px',
  fontSize: 12,
  fontWeight: 400,
  lineHeight: 1.5,
  color: '#44403c',
  textAlign: 'left',
  textTransform: 'none',
  letterSpacing: 0,
  whiteSpace: 'normal',
};

/** Small (!) button that opens a short "why" popover next to it. */
export function Why({ children }) {
  const [open, setOpen] = useState(false);
  const [shift, setShift] = useState(0);
  const wrap = useRef(null);
  const box = useRef(null);
  useLayoutEffect(() => {
    if (!open || !box.current) return;
    box.current.style.transform = 'none';
    const r = box.current.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    let dx = 0;
    if (r.right > vw - 12) dx = vw - 12 - r.right;
    if (r.left + dx < 12) dx = 12 - r.left;
    setShift(dx);
  }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (e.type === 'keydown' ? e.key === 'Escape' : !wrap.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);
  return (
    <span ref={wrap} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        aria-label="Why is this needed?"
        aria-expanded={open}
        title="Why is this needed?"
        onClick={() => setOpen((o) => !o)}
        style={helpBtn(open)}
      >
        !
      </button>
      {open && (
        <span ref={box} role="note" style={{ ...helpBox, transform: `translateX(${shift}px)` }}>
          {children}
        </span>
      )}
    </span>
  );
}

export function Field({ label, help, children }) {
  return (
    <div>
      <label style={S.lbl}>
        {label}
        {help && <Why>{help}</Why>}
      </label>
      {children}
    </div>
  );
}

export const roleOf = (r) =>
  r.type === 'fixed' ? 'Fixed' : r.axis === 'row' ? 'Rows' : 'Columns';


export const wellCell = (extra) => ({
  width: 40,
  height: 34,
  borderRadius: 6,
  fontSize: 10,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px solid #e5e7eb',
  ...extra,
});

export const btn = {
  border: '1px solid #d1d5db',
  background: '#fff',
  borderRadius: 6,
  padding: '5px 12px',
  fontSize: 12,
  cursor: 'pointer',
  color: '#374151',
};


/** Number entered as mantissa × 10^exponent (e.g. 1.5 × 10^8 CFU/mL). */
export function SciInput({ value, onChange, ariaLabel }) {
  const split = (v) => {
    if (!(v > 0)) return { m: '', e: '' };
    const e = Math.floor(Math.log10(v) + 1e-12);
    return { m: String(Number((v / Math.pow(10, e)).toPrecision(6))), e: String(e) };
  };
  const [t, setT] = useState(() => split(value));
  useEffect(() => {
    const cur = parseFloat(t.m) * Math.pow(10, parseInt(t.e, 10));
    if (!(Math.abs(cur - value) <= Math.abs(value) * 1e-9)) setT(split(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const push = (n) => {
    setT(n);
    const v = parseFloat(n.m) * Math.pow(10, parseInt(n.e, 10));
    if (Number.isFinite(v) && v > 0) onChange(v);
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <input
        type="number" step="any" aria-label={`${ariaLabel} mantissa`} style={{ ...S.inp, width: 90 }}
        value={t.m} onChange={(e) => push({ ...t, m: e.target.value })}
      />
      <span style={{ fontSize: 13, whiteSpace: 'nowrap' }}>× 10 ^</span>
      <input
        type="number" step={1} aria-label={`${ariaLabel} exponent`} style={{ ...S.inp, width: 64 }}
        value={t.e} onChange={(e) => push({ ...t, e: e.target.value })}
      />
    </div>
  );
}

const TWO_FOLD = Array.from({ length: 22 }, (_, i) => Math.pow(2, 11 - i)); // 2048 … 0.000977
const nearestTwoFold = (v) => {
  const x = parseFloat(v);
  return x > 0 ? Math.pow(2, Math.round(Math.log2(x))) : '';
};

/** Choose the two-fold series by its highest and lowest concentration. */
export function SeriesPicker({ min, max, onChange }) {
  const hi = nearestTwoFold(max);
  const lo = nearestTwoFold(min);
  const series = buildDilutionSeries(hi, lo);
  const opt = (v) => (
    <option key={v} value={v}>{fmtConc(v)} µg/mL</option>
  );
  return (
    <>
      <Field label="Highest final conc." help="The two-fold series runs from here down to the lowest concentration. Choose a range that brackets the MIC of the drug alone with at least two steps above it and two below, so the MIC is read from the series and not guessed. A drug-free column or row is added automatically.">
        <select style={S.inp} value={hi} onChange={(e) => onChange({ micMax: +e.target.value })}>
          {hi === '' && <option value="">choose…</option>}
          {TWO_FOLD.filter((v) => lo === '' || v >= lo).map(opt)}
        </select>
      </Field>
      <Field label="Lowest final conc." help="Low end of the series. A plate has 12 columns and 8 rows, and one is kept drug-free, so a column drug can have up to 11 concentrations and a row drug up to 7.">
        <select style={S.inp} value={lo} onChange={(e) => onChange({ micMin: +e.target.value })}>
          {lo === '' && <option value="">choose…</option>}
          {TWO_FOLD.filter((v) => hi === '' || v <= hi).map(opt)}
        </select>
      </Field>
      <div style={{ gridColumn: '1 / -1', fontSize: 12, color: series.length ? '#374151' : '#b91c1c' }}>
        {series.length
          ? <>Two-fold series, <b>{series.length}</b> concentrations: {series.map((c) => fmtConc(c)).join(' · ')} µg/mL</>
          : 'Choose a highest concentration that is at least the lowest.'}
      </div>
    </>
  );
}
