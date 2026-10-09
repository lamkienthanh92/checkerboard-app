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

export function Field({ label, children }) {
  return (
    <div>
      <label style={S.lbl}>{label}</label>
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
