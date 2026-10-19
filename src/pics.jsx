/* Small illustrations shown beside form fields. Pure SVG, no dependencies. */
const B = '#3b82f6', P = '#8b5cf6', G = '#10b981', A = '#f59e0b', R = '#ec4899', LINE = '#9ca3af', BG = '#f9fafb', TX = '#6b7280';

const Frame = ({ children, w = 64, h = 40 }) => (
  <svg width={w * 1.7} height={h * 1.7} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" style={{ display: 'block', flex: 'none' }}>
    <rect x={0.75} y={0.75} width={w - 1.5} height={h - 1.5} rx={5} fill={BG} stroke="#e5e7eb" />
    {children}
  </svg>
);
const T = ({ x, y, children, fill = TX, size = 6, anchor = 'middle' }) => (
  <text x={x} y={y} fontSize={size} textAnchor={anchor} fill={fill}>{children}</text>
);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const n = (v, d) => (Number.isFinite(+v) && v !== '' ? +v : d);

// vertical tube (conical) used by several pictures: x,y top-left, w,h
const TubeShape = ({ x, y, w, h, level = 0, color = B, op = 0.6 }) => {
  const ly = y + h * (1 - level);
  return (
    <g>
      <clipPath id={`c${x}${y}${w}${h}`}><path d={`M${x} ${y} H${x + w} V${y + h - w / 2} Q${x + w / 2} ${y + h + w / 4} ${x} ${y + h - w / 2} Z`} /></clipPath>
      <g clipPath={`url(#c${x}${y}${w}${h})`}><rect x={x} y={ly} width={w} height={y + h - ly + 4} fill={color} fillOpacity={op} /></g>
      <path d={`M${x} ${y} V${y + h - w / 2} Q${x + w / 2} ${y + h + w / 4} ${x + w} ${y + h - w / 2} V${y}`} fill="none" stroke={LINE} strokeWidth={1.1} />
      <path d={`M${x - 1.5} ${y} H${x + w + 1.5}`} stroke={LINE} strokeWidth={1.1} />
    </g>
  );
};

const Well = ({ x, y, w, h, fills }) => {
  // fills: [{h: fraction, color}] stacked from bottom
  let acc = 0;
  return (
    <g>
      {fills.map((f, i) => {
        const hh = h * f.h; const yy = y + h - acc - hh; acc += hh;
        return <rect key={i} x={x + 1} y={yy} width={w - 2} height={hh} fill={f.color} fillOpacity={f.op ?? 0.6} />;
      })}
      <path d={`M${x} ${y} V${y + h} H${x + w} V${y}`} fill="none" stroke={LINE} strokeWidth={1.3} />
    </g>
  );
};

const PICS = {
  wellVol: (v) => {
    const f = clamp(n(v, 200) / 200, 0.15, 1);
    return <Frame><Well x={20} y={5} w={24} h={24} fills={[{ h: f * 0.95, color: B }]} /><T x={32} y={38} size={6.5}>{n(v, '')} µL / well</T></Frame>;
  },
  drugFrac: (v) => {
    const d = clamp(n(v, 50), 5, 95);
    return (
      <Frame>
        <Well x={18} y={6} w={28} h={22} fills={[{ h: (100 - d) / 100 * 0.95, color: G, op: 0.55 }, { h: d / 100 * 0.95, color: B }]} />
        <T x={52} y={14} fill={G} size={5.5}>cells</T><T x={52} y={24} fill={B} size={5.5}>drug</T>
        <T x={32} y={37} size={6}>drug {d} : cells {100 - d}</T>
      </Frame>
    );
  },
  overage: (v) => {
    const o = clamp(n(v, 20), 0, 60) / 100;
    const need = 0.6, extra = need * o;
    return (
      <Frame>
        <TubeShape x={22} y={5} w={16} h={28} level={need + extra} color={B} op={0.55} />
        <rect x={23} y={5 + 28 * (1 - need - extra)} width={14} height={28 * extra} fill={A} fillOpacity={0.8} />
        <T x={48} y={12} fill={A} size={5.5}>extra</T><T x={50} y={26} fill={B} size={5.5}>wells</T>
        <T x={32} y={39} size={6}>+{n(v, 0)}%</T>
      </Frame>
    );
  },
  deadMl: () => (
    <Frame>
      <TubeShape x={14} y={4} w={16} h={26} level={0.75} color={B} op={0.55} />
      <rect x={15} y={24} width={14} height={4} fill="#6b7280" fillOpacity={0.55} />
      <path d="M32 26 H38" stroke={LINE} /><T x={39} y={28} size={5.5} anchor="start">dead</T>
      <T x={32} y={39} size={6}>stays in tube</T>
    </Frame>
  ),
  inocDead: () => (
    <Frame>
      <path d="M12 22 L16 32 H48 L52 22" fill="#fff" stroke={LINE} strokeWidth={1.3} />
      <path d="M13.5 26 L16 32 H48 L50.5 26 Z" fill={G} fillOpacity={0.55} />
      <rect x={20} y={29} width={24} height={3} fill="#6b7280" fillOpacity={0.5} />
      {[22, 28, 34, 40].map((x) => <path key={x} d={`M${x} 6 V20 M${x - 1.5} 17 L${x} 20 L${x + 1.5} 17`} stroke={LINE} strokeWidth={1} fill="none" />)}
      <T x={32} y={39} size={6}>tips can't reach</T>
    </Frame>
  ),
  broth: () => (
    <Frame>
      <path d="M24 12 H40 V32 Q40 35 37 35 H27 Q24 35 24 32 Z" fill="#fff" stroke={LINE} strokeWidth={1.3} />
      <path d="M24.7 20 H39.3 V32 Q39.3 34.3 37 34.3 H27 Q24.7 34.3 24.7 32 Z" fill={A} fillOpacity={0.45} />
      <rect x={28} y={6} width={8} height={6} fill="#fff" stroke={LINE} strokeWidth={1.2} />
      <T x={32} y={28} size={6} fill="#92400e">CAMHB</T>
    </Frame>
  ),
  reservoir: () => (
    <Frame>
      {Array.from({ length: 12 }, (_, i) => (
        <rect key={i} x={4 + i * 4.8} y={8} width={4} height={22} rx={1} fill={i === 3 ? B : '#fff'} fillOpacity={i === 3 ? 0.5 : 1} stroke={i === 3 ? B : LINE} strokeWidth={0.9} />
      ))}
      <T x={32} y={38} size={6}>one well = capacity</T>
    </Frame>
  ),
  tubeSize: (v) => {
    const h = 8 + clamp(n(v, 50), 5, 50) / 50 * 22;
    return (
      <Frame>
        <TubeShape x={26} y={34 - h} w={12} h={h} level={0.8} color={B} />
        <T x={50} y={26} size={6.5} fill="#111827">{n(v, '')} mL</T>
      </Frame>
    );
  },
  minVol: (v) => (
    <Frame>
      <path d="M26 4 H38 L35 24 L32 33 L29 24 Z" fill="#fff" stroke={LINE} strokeWidth={1.2} />
      <path d="M30.4 27 L32 32 L33.6 27 Z" fill={B} fillOpacity={0.7} />
      <T x={32} y={39} size={6}>{n(v, '')} µL = smallest</T>
    </Frame>
  ),
  name: () => (
    <Frame>
      <g transform="rotate(-35 32 20)">
        <rect x={16} y={14} width={32} height={12} rx={6} fill="#fff" stroke={LINE} strokeWidth={1.2} />
        <path d="M32 14 H42 a6 6 0 0 1 0 12 H32 Z" fill={B} fillOpacity={0.6} />
      </g>
    </Frame>
  ),
  powder: () => (
    <Frame>
      <path d="M12 32 H52" stroke={LINE} strokeWidth={1.4} />
      <rect x={18} y={26} width={28} height={5} rx={1.5} fill="#e5e7eb" stroke={LINE} />
      <path d="M24 26 Q32 10 40 26 Z" fill="#fff" stroke={LINE} strokeWidth={1.1} />
      <T x={32} y={39} size={6}>weigh powder</T>
    </Frame>
  ),
  dissolve: () => (
    <Frame>
      <path d="M26 6 H38 V14 L46 30 Q47 33 44 33 H20 Q17 33 18 30 L26 14 Z" fill="#fff" stroke={LINE} strokeWidth={1.2} />
      <path d="M22 24 H42 L46 30 Q47 32.4 44 32.4 H20 Q17 32.4 18 30 Z" fill={B} fillOpacity={0.5} />
      <path d="M50 8 q-3 4 0 6 q3 -2 0 -6 Z" fill={B} />
      <T x={32} y={39} size={6}>+ solvent</T>
    </Frame>
  ),
  potency: (v) => {
    const p = clamp(n(v, 100), 1, 100);
    return (
      <Frame>
        <rect x={8} y={8} width={48} height={10} rx={3} fill="#e5e7eb" />
        <rect x={8} y={8} width={48 * p / 100} height={10} rx={3} fill={B} fillOpacity={0.75} />
        <T x={32} y={15.5} size={6} fill={p > 55 ? '#fff' : '#111'}>active {n(v, '')}%</T>
        <T x={32} y={31} size={5.5}>rest = salt / water</T>
      </Frame>
    );
  },
  ratio: (a, b) => {
    const x = Math.max(0, n(a, 1)), y = Math.max(0, n(b, 1)), m = Math.max(x, y, 0.001);
    return (
      <Frame>
        <rect x={10} y={30 - 22 * x / m} width={16} height={22 * x / m} fill={B} fillOpacity={0.75} />
        <rect x={38} y={30 - 22 * y / m} width={16} height={22 * y / m} fill={P} fillOpacity={0.75} />
        <path d="M6 30 H58" stroke={LINE} /><T x={18} y={38} size={5.5} fill={B}>main {x}</T><T x={46} y={38} size={5.5} fill={P}>partner {y}</T>
      </Frame>
    );
  },
  partnerName: () => (
    <Frame>
      <g transform="rotate(-35 32 20)">
        <rect x={16} y={14} width={32} height={12} rx={6} fill="#fff" stroke={LINE} strokeWidth={1.2} />
        <path d="M32 14 H42 a6 6 0 0 1 0 12 H32 Z" fill={P} fillOpacity={0.65} />
      </g>
    </Frame>
  ),
  fixedConc: () => (
    <Frame>
      {[10, 24, 38].map((x) => (
        <g key={x}><Well x={x} y={8} w={14} height={18} h={18} fills={[{ h: 0.7, color: P, op: 0.5 }]} /><circle cx={x + 7} cy={21} r={1.4} fill={P} /></g>
      ))}
      <T x={32} y={37} size={6}>same in every well</T>
    </Frame>
  ),
  basis: () => (
    <Frame>
      <path d="M12 10 H40 L52 20 L40 30 H12 Z" fill="#fff" stroke={LINE} strokeWidth={1.2} />
      <circle cx={18} cy={20} r={2} fill={LINE} /><T x={32} y={22} size={6}>which part?</T>
    </Frame>
  ),
  hiConc: () => (
    <Frame>
      {[22, 17, 13, 9, 6, 4].map((h, i) => <rect key={i} x={8 + i * 9} y={32 - h} width={6} height={h} fill={B} fillOpacity={i === 0 ? 0.95 : 0.35} />)}
      <T x={32} y={39} size={6}>highest first</T>
    </Frame>
  ),
  loConc: () => (
    <Frame>
      {[22, 17, 13, 9, 6, 4].map((h, i) => <rect key={i} x={8 + i * 9} y={32 - h} width={6} height={h} fill={B} fillOpacity={i === 5 ? 0.95 : 0.35} />)}
      <T x={32} y={39} size={6}>lowest last</T>
    </Frame>
  ),
  targetCfu: () => (
    <Frame>
      <Well x={22} y={6} w={20} h={22} fills={[{ h: 0.85, color: G, op: 0.25 }]} />
      {[[27, 20], [32, 14], [36, 22], [30, 24], [35, 16]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={1.3} fill={G} />)}
      <T x={32} y={37} size={6}>cells per mL in well</T>
    </Frame>
  ),
  mcfarland: () => (
    <Frame>
      <TubeShape x={18} y={5} w={12} h={26} level={0.85} color="#a3a3a3" op={0.55} />
      <TubeShape x={34} y={5} w={12} h={26} level={0.85} color="#a3a3a3" op={0.22} />
      <T x={24} y={38} size={5.5}>0.5</T><T x={40} y={38} size={5.5}>clear</T>
    </Frame>
  ),
};

export function FieldPic({ kind, a, b }) {
  const f = PICS[kind];
  if (!f) return null;
  return <div style={{ marginBottom: 4 }}>{f(a, b)}</div>;
}
