import { FieldPic } from './pics.jsx';
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
  lbl: { display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 3 },
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

/** Small (!) button that opens a short "why" popover next to it. The popover can be dragged by its top bar. */
export function Why({ children }) {
  const [open, setOpen] = useState(false);
  const [shift, setShift] = useState(0);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const [pinned, setPinned] = useState(false);
  const wrap = useRef(null);
  const box = useRef(null);
  const drag = useRef(null);
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
      if (e.type === 'keydown') {
        if (e.key === 'Escape') setOpen(false);
      } else if (!pinned && !wrap.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open, pinned]);
  const down = (e) => {
    drag.current = { sx: e.clientX, sy: e.clientY, ox: off.x, oy: off.y };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setPinned(true);
  };
  const move = (e) => {
    const d = drag.current;
    if (d) setOff({ x: d.ox + e.clientX - d.sx, y: d.oy + e.clientY - d.sy });
  };
  const up = () => { drag.current = null; };
  return (
    <span ref={wrap} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        aria-label="Why is this needed?"
        aria-expanded={open}
        title="Why is this needed?"
        onClick={() => { setOpen((o) => !o); setPinned(false); setOff({ x: 0, y: 0 }); }}
        style={helpBtn(open)}
      >
        !
      </button>
      {open && (
        <span ref={box} role="note" style={{ ...helpBox, transform: `translate(${shift + off.x}px, ${off.y}px)`, padding: 0, zIndex: 60 }}>
          <span
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            title="Drag to move"
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'grab', touchAction: 'none', background: '#fef3c7', borderRadius: '8px 8px 0 0', padding: '2px 8px', fontSize: 10, color: '#92400e', userSelect: 'none' }}
          >
            <span>⠿ drag</span>
            <button type="button" aria-label="Close" onPointerDown={(e) => e.stopPropagation()} onClick={() => setOpen(false)} style={{ border: 0, background: 'transparent', cursor: 'pointer', fontSize: 13, lineHeight: 1, color: '#92400e' }}>×</button>
          </span>
          <span style={{ display: 'block', padding: '8px 12px' }}>{children}</span>
        </span>
      )}
    </span>
  );
}

/** Floating, draggable, resizable window used for the detail panels. */
export function FloatWin({ title, icon, onClose, onFocus, z, index = 0, children }) {
  const narrow = typeof window !== 'undefined' && window.innerWidth < 720;
  const w0 = narrow ? Math.min(window.innerWidth - 16, 640) : Math.min(760, window.innerWidth - 40);
  const [pos, setPos] = useState(() => ({
    x: narrow ? 8 : Math.max(12, window.innerWidth - w0 - 24 - index * 28),
    y: 70 + index * 28,
  }));
  const [min, setMin] = useState(false);
  const drag = useRef(null);
  const down = (e) => {
    onFocus?.();
    drag.current = { sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    setPos({
      x: Math.min(window.innerWidth - 80, Math.max(-w0 + 120, d.ox + e.clientX - d.sx)),
      y: Math.min(window.innerHeight - 40, Math.max(0, d.oy + e.clientY - d.sy)),
    });
  };
  const up = () => { drag.current = null; };
  return (
    <div
      className="fwin"
      onMouseDown={onFocus}
      style={{
        position: 'fixed', left: pos.x, top: pos.y, width: w0, maxWidth: 'calc(100vw - 16px)', zIndex: z,
        background: '#f4f5f7', border: '1px solid #9ca3af', borderRadius: 10, boxShadow: '0 12px 36px rgba(0,0,0,0.28)',
        display: 'flex', flexDirection: 'column', height: min ? 'auto' : '62vh', minWidth: 280, minHeight: min ? 0 : 160,
        resize: min ? 'none' : 'both', overflow: 'hidden',
      }}
    >
      <div
        className="np"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: '#1f2937', color: '#fff', cursor: 'grab', touchAction: 'none', userSelect: 'none', fontSize: 13, fontWeight: 600 }}
      >
        <span aria-hidden>{icon}</span>
        <span style={{ flex: 1 }}>{title}</span>
        <button type="button" aria-label="Minimise" onPointerDown={(e) => e.stopPropagation()} onClick={() => setMin((m) => !m)} style={winBtn}>{min ? '▢' : '–'}</button>
        <button type="button" aria-label="Close" onPointerDown={(e) => e.stopPropagation()} onClick={onClose} style={winBtn}>×</button>
      </div>
      {!min && <div className="fwin-body" style={{ overflow: 'auto', padding: 12, flex: 1 }}>{children}</div>}
    </div>
  );
}
const winBtn = { border: 0, background: 'rgba(255,255,255,0.15)', color: '#fff', borderRadius: 5, width: 24, height: 22, cursor: 'pointer', fontSize: 14, lineHeight: 1 };

export function Field({ label, help, children, wide, pic, picA, picB }) {
  return (
    <div style={wide ? { gridColumn: '1 / -1' } : undefined}>
      <label style={S.lbl}>
        {label}
        {help && <Why>{help}</Why>}
      </label>
      {pic && <FieldPic kind={pic} a={picA} b={picB} />}
      {children}
    </div>
  );
}

export const roleOf = (r) =>
  (r.isPartner ? 'Partner, ' : '') + (r.type === 'fixed' ? 'fixed' : r.axis === 'row' ? 'rows' : 'columns');


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
      <Field label="Highest final conc." pic="hiConc" help="The two-fold series runs from here down to the lowest concentration. Choose a range that brackets the MIC of the drug alone with at least two steps above it and two below, so the MIC is read from the series and not guessed. A drug-free column or row is added automatically.">
        <select style={S.inp} value={hi} onChange={(e) => onChange({ micMax: +e.target.value })}>
          {hi === '' && <option value="">choose…</option>}
          {TWO_FOLD.filter((v) => lo === '' || v >= lo).map(opt)}
        </select>
      </Field>
      <Field label="Lowest final conc." pic="loConc" help="Low end of the series. A plate has 12 columns and 8 rows, and one is kept drug-free, so a column drug can have up to 11 concentrations and a row drug up to 7.">
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

/* ---------- small illustrations for option fields ---------- */
const BLUE = '#3b82f6', PINK = '#ec4899', PURPLE = '#8b5cf6', GREY = '#d1d5db', AMBER = '#f59e0b';

function PlateMini({ mode }) {
  // 4 x 5 well grid; highlights show where each drug varies
  const cells = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 5; c++) {
      let fill = '#fff', stroke = GREY, op = 1;
      if (mode === 'column') { fill = BLUE; op = 0.15 + c * 0.2; stroke = BLUE; }
      if (mode === 'row') { fill = PINK; op = 0.15 + r * 0.25; stroke = PINK; }
      if (mode === 'fixed') { fill = PURPLE; op = 0.45; stroke = PURPLE; }
      cells.push(<circle key={r + '-' + c} cx={14 + c * 8} cy={8 + r * 8} r={3} fill={fill} fillOpacity={op} stroke={stroke} strokeWidth={0.8} />);
    }
  }
  return (
    <svg width={64} height={44} viewBox="0 0 64 44" aria-hidden="true">
      <rect x={1.5} y={1.5} width={61} height={41} rx={5} fill="#f9fafb" stroke={GREY} />
      {cells}
      {mode === 'column' && <path d="M14 39 H50 M46 36 L50 39 L46 42" stroke={BLUE} strokeWidth={1.4} fill="none" />}
      {mode === 'row' && <path d="M6 6 V34 M3 30 L6 34 L9 30" stroke={PINK} strokeWidth={1.4} fill="none" />}
      {mode === 'fixed' && <text x={32} y={41} fontSize={6} textAnchor="middle" fill={PURPLE}>same in every well</text>}
    </svg>
  );
}

function Tube({ x, y, color, h = 16, fill = 0.7 }) {
  return (
    <g>
      <rect x={x} y={y} width={9} height={h} rx={2.5} fill="#fff" stroke="#9ca3af" strokeWidth={1} />
      <rect x={x + 1} y={y + h * (1 - fill)} width={7} height={h * fill - 1} rx={1.5} fill={color} fillOpacity={0.75} />
    </g>
  );
}
const Arrow = ({ x1, y1, x2, y2 }) => (
  <path d={`M${x1} ${y1} L${x2} ${y2} M${x2 - 3} ${y2 - 2.5} L${x2} ${y2} L${x2 - 3} ${y2 + 2.5}`} stroke="#6b7280" strokeWidth={1.2} fill="none" />
);

function PartnerPic({ mode }) {
  return mode === 'separate' ? (
    <svg width={64} height={44} viewBox="0 0 64 44" aria-hidden="true">
      <rect x={1.5} y={1.5} width={61} height={41} rx={5} fill="#f9fafb" stroke={GREY} />
      {[0, 1, 2].map((i) => <Tube key={'a' + i} x={8 + i * 13} y={6} color={BLUE} h={13} fill={0.8 - i * 0.2} />)}
      {[0, 1, 2].map((i) => <Tube key={'b' + i} x={8 + i * 13} y={24} color={PURPLE} h={13} fill={0.8 - i * 0.2} />)}
      <text x={56} y={15} fontSize={6} fill={BLUE}>A</text>
      <text x={56} y={33} fontSize={6} fill={PURPLE}>P</text>
    </svg>
  ) : (
    <svg width={64} height={44} viewBox="0 0 64 44" aria-hidden="true">
      <rect x={1.5} y={1.5} width={61} height={41} rx={5} fill="#f9fafb" stroke={GREY} />
      <Tube x={5} y={5} color={BLUE} h={14} fill={0.6} />
      <Tube x={5} y={25} color={PURPLE} h={14} fill={0.6} />
      <Arrow x1={16} y1={14} x2={27} y2={21} />
      <Arrow x1={16} y1={30} x2={27} y2={24} />
      <rect x={30} y={10} width={13} height={24} rx={3.5} fill="#fff" stroke="#9ca3af" strokeWidth={1} />
      <rect x={31} y={22} width={11} height={11} rx={2} fill={PURPLE} fillOpacity={0.55} />
      <rect x={31} y={15} width={11} height={7} rx={1} fill={BLUE} fillOpacity={0.55} />
      <Arrow x1={46} y1={22} x2={58} y2={22} />
      <text x={51} y={17} fontSize={5.5} textAnchor="middle" fill="#6b7280">dilute</text>
    </svg>
  );
}

function SchemePic({ mode }) {
  const n = mode === 'clsi' ? [0, 1, 2] : [0, 1];
  return (
    <svg width={64} height={44} viewBox="0 0 64 44" aria-hidden="true">
      <rect x={1.5} y={1.5} width={61} height={41} rx={5} fill="#f9fafb" stroke={GREY} />
      {n.map((i) => <Tube key={i} x={9 + i * 16} y={8} color={STOCK_COLORS[i]} h={20} fill={0.85 - i * 0.2} />)}
      {n.slice(1).map((i) => <Arrow key={'a' + i} x1={20 + (i - 1) * 16} y1={18} x2={24 + (i - 1) * 16} y2={18} />)}
      <text x={32} y={39} fontSize={6} textAnchor="middle" fill="#6b7280">{mode === 'clsi' ? '8-fold steps' : 'fewest levels'}</text>
    </svg>
  );
}

function ComboPic({ mode }) {
  // ratio: both bars shrink together; fixed: inhibitor bar constant
  const hs = [18, 12, 7, 4];
  return (
    <svg width={64} height={44} viewBox="0 0 64 44" aria-hidden="true">
      <rect x={1.5} y={1.5} width={61} height={41} rx={5} fill="#f9fafb" stroke={GREY} />
      {hs.map((h, i) => (
        <g key={i}>
          <rect x={7 + i * 14} y={30 - h} width={5} height={h} fill={BLUE} fillOpacity={0.8} />
          <rect x={12 + i * 14} y={mode === 'fixed' ? 30 - 8 : 30 - h / 3} width={5} height={mode === 'fixed' ? 8 : h / 3} fill={PURPLE} fillOpacity={0.85} />
        </g>
      ))}
      <path d="M5 30 H60" stroke="#9ca3af" strokeWidth={1} />
      <text x={32} y={39} fontSize={6} textAnchor="middle" fill="#6b7280">{mode === 'fixed' ? 'inhibitor constant' : 'ratio kept'}</text>
    </svg>
  );
}

function ShareBar({ pct }) {
  const p = Math.min(95, Math.max(5, +pct || 50));
  return (
    <svg width={64} height={26} viewBox="0 0 64 26" aria-hidden="true">
      <rect x={1.5} y={4} width={61} height={12} rx={3} fill="#fff" stroke="#9ca3af" />
      <rect x={2} y={4.5} width={(60 * (100 - p)) / 100} height={11} rx={2.5} fill={BLUE} fillOpacity={0.7} />
      <rect x={2 + (60 * (100 - p)) / 100} y={4.5} width={(60 * p) / 100} height={11} rx={2.5} fill={PURPLE} fillOpacity={0.7} />
      <text x={32} y={24} fontSize={6} textAnchor="middle" fill="#6b7280">main {100 - p}% · partner {p}%</text>
    </svg>
  );
}
export { ShareBar };

const PICS = { role: PlateMini, partner: PartnerPic, scheme: SchemePic, combo: ComboPic };

/** Visual option picker: cards with a small picture, caption, and a one-line hint. */
export function PicChoice({ kind, value, onChange, options }) {
  const Pic = PICS[kind];
  return (
    <div role="radiogroup" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            style={{
              flex: '1 1 92px', minWidth: 92, maxWidth: 150, cursor: 'pointer', textAlign: 'center', padding: '5px 4px 6px',
              border: on ? '2px solid #2563eb' : '1px solid #d1d5db', background: on ? '#eff6ff' : '#fff', borderRadius: 8,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, font: 'inherit',
            }}
          >
            <Pic mode={o.value} />
            <span style={{ fontSize: 12, fontWeight: on ? 700 : 600, color: '#111827', lineHeight: 1.2 }}>{o.label}</span>
            {o.hint && <span style={{ fontSize: 10.5, color: '#6b7280', lineHeight: 1.2 }}>{o.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Explains the two combination-product modes with pictures. */
export function ComboLegend({ current }) {
  const items = [
    { m: 'ratio', t: 'Fixed ratio', d: 'Partner follows every dilution (e.g. 4:1)' },
    { m: 'fixed', t: 'Fixed concentration', d: 'Inhibitor same in every well (e.g. 4 µg/mL)' },
  ];
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
      {items.map((o) => (
        <div key={o.m} style={{ flex: '1 1 130px', display: 'flex', gap: 6, alignItems: 'center', border: current === o.m ? '2px solid #2563eb' : '1px solid #e5e7eb', background: current === o.m ? '#eff6ff' : '#fafafa', borderRadius: 8, padding: 4 }}>
          <ComboPic mode={o.m} />
          <div style={{ fontSize: 11, lineHeight: 1.25 }}><b>{o.t}</b><br /><span style={{ color: '#6b7280' }}>{o.d}</span></div>
        </div>
      ))}
    </div>
  );
}
