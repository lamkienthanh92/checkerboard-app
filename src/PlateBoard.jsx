import { STOCK_BG, STOCK_COLORS } from './ui.jsx';
import { fmt, fmtConc } from './calc.js';

const ul = (u) => (u >= 1000 ? `${fmt(u / 1000, 2)} mL` : `${fmt(u, 1)} µL`);
const dims = () => {
  const narrow = typeof window !== 'undefined' && window.innerWidth < 640;
  return narrow ? { CELL_W: 54, ROWW: 128 } : { CELL_W: 62, ROWW: 196 };
};
const CELL_H = 46;

function Icon({ label, onClick, children }) {
  if (!onClick) return null;
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick} style={{ border: '1px solid #d1d5db', background: '#fff', borderRadius: 6, padding: '1px 7px', fontSize: 12, cursor: 'pointer', color: '#374151', lineHeight: 1.5 }}>
      {children}
    </button>
  );
}

/** One tube chip (above a column or left of a row). */
function TubeChip({ f, label, vertical, color, partner }) {
  const { CELL_W, ROWW } = dims();
  const col = STOCK_COLORS[f.stockIdx % STOCK_COLORS.length];
  const bg = STOCK_BG[f.stockIdx % STOCK_BG.length];
  return (
    <div
      title={`Tube ${label}: ${fmtConc(f.concInFalcon)} µg/mL in the tube; ${ul(f.volFromStock_uL)} ${f.stockName} + ${fmt(f.camhb_mL, 2)} mL CAMHB`}
      style={{ boxSizing: 'border-box', width: vertical ? CELL_W - 4 : ROWW - 8, height: vertical ? (partner ? 108 : 92) : CELL_H - 4, background: bg, border: `2px solid ${col}`, borderRadius: 8, padding: vertical ? '4px 3px' : '3px 6px', display: 'flex', flexDirection: vertical ? 'column' : 'row', alignItems: 'center', justifyContent: vertical ? 'flex-start' : 'flex-start', gap: vertical ? 1 : 6, textAlign: 'center', overflow: 'hidden' }}
    >
      <span style={{ background: col, color: '#fff', borderRadius: 10, fontSize: 12, fontWeight: 700, minWidth: 20, padding: '0 6px', lineHeight: '18px' }}>{label}</span>
      <span style={{ fontSize: vertical ? 15 : 14, fontWeight: 700, color: color, whiteSpace: 'nowrap' }}>{fmtConc(f.finalConc)}</span>
      <span style={{ fontSize: 11, color: '#374151', lineHeight: 1.25 }}>
        {vertical ? <>take {ul(f.volFromStock_uL)}<br />{f.stockName}</> : <span style={{ whiteSpace: 'nowrap', fontSize: 10, lineHeight: 1.15, textAlign: 'left' }}>{ul(f.volFromStock_uL)} · {f.stockName}{partner ? <><br /><b style={{ color: '#7c3aed' }}>+ {partner.name.slice(0, 10)} {fmtConc(f.partnerFinal)}</b></> : null}</span>}
      </span>
      {partner && vertical && (
        <span style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', whiteSpace: 'nowrap', lineHeight: 1.2 }}>
          +{fmtConc(f.partnerFinal)}
        </span>
      )}
    </div>
  );
}

function Blank({ vertical, label, tall }) {
  const { CELL_W, ROWW } = dims();
  return (
    <div style={{ boxSizing: 'border-box', width: vertical ? CELL_W - 4 : ROWW - 8, height: vertical ? (tall ? 108 : 92) : CELL_H - 4, border: '2px dashed #cbd5e1', borderRadius: 8, padding: 4, display: 'flex', flexDirection: vertical ? 'column' : 'row', alignItems: 'center', gap: 6, justifyContent: 'center', fontSize: 11, color: '#6b7280', textAlign: 'center' }}>
      <b style={{ fontSize: 14 }}>{label}</b>
      <span>0 · drug-free</span>
    </div>
  );
}

function StockCard({ r, s, si, onEdit }) {
  const col = STOCK_COLORS[si % STOCK_COLORS.length];
  const bg = STOCK_BG[si % STOCK_BG.length];
  const pre = r.partner?.pre;
  return (
    <div style={{ background: bg, border: `2px solid ${col}`, borderRadius: 10, padding: '8px 12px', minWidth: 150, flex: '0 0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
        <b style={{ color: col, fontSize: 12 }}>{s.name}</b>
        {si === 0 && <Icon label={`Edit ${r.name}`} onClick={onEdit && (() => onEdit('abs', r.isPartner ? r.mainId : r.id))}>✎</Icon>}
        {si > 0 && <Icon label="Stocks and tubes: details" onClick={onEdit && (() => onEdit('stocks'))}>⚗️</Icon>}
      </div>
      <div style={{ fontSize: 17, fontWeight: 700 }}>{fmtConc(s.conc)} <span style={{ fontSize: 11, fontWeight: 400 }}>µg/mL</span></div>
      <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.4 }}>
        {si === 0 ? (
          pre && !r.isPartner ? (
            <>pre-primaries {fmt(r.powderMg, 1)} mg + {fmt(r.partner.weighMg, 1)} mg {r.partner.name}, mixed to {r.dissolveVolMl} mL</>
          ) : (
            <>{fmt(r.powderMg, 1)} mg in {r.dissolveVolMl} mL</>
          )
        ) : (
          <>{ul(s.fromPrev_uL)} {r.ladder.stocks[s.fromStockIdx].name.toLowerCase()} + {ul(s.camhb_mL * 1000)} CAMHB</>
        )}
      </div>
      {r.partner && !r.isPartner && (
        <div style={{ fontSize: 12, color: '#7c3aed', marginTop: 2 }}>
          + {r.partner.name} {fmtConc(s.partnerConc)}
        </div>
      )}
    </div>
  );
}

/** Plate-centred view: tube chips on the axes, the plate in the middle, stocks and inoculum underneath. */
export default function PlateBoard({ plan, cfg, onEdit }) {
  const { CELL_W, ROWW } = dims();
  const { colRes, rowRes } = plan;
  const fixed = plan.displayResults.filter((r) => r.type === 'fixed');
  const titrated = plan.abResults.filter((r) => r.type === 'variable' && r.ladder);
  if (!colRes?.ladder || !rowRes?.ladder) {
    return (
      <div style={{ padding: 20, color: '#92400e', fontSize: 14 }}>
        Define one drug across the columns and one down the rows (⚙️ Antibiotics) to see the plate.
      </div>
    );
  }
  const nC = colRes.series.length;
  const nR = rowRes.series.length;
  const colName = colRes.name + (colRes.partner ? ` + ${colRes.partner.name}` : '');
  const rowName = rowRes.name + (rowRes.partner ? ` + ${rowRes.partner.name}` : '');
  const cellTint = (a, b) => (a && b ? '#f5f3ff' : a ? '#eff6ff' : b ? '#fdf2f8' : '#f3f4f6');

  return (
    <div>
      {fixed.length > 0 && (
        <div style={{ background: '#f5f3ff', border: '1px solid #c4b5fd', borderRadius: 8, padding: '6px 12px', marginBottom: 10, fontSize: 13, color: '#5b21b6', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <b>In every well (added to the inoculum):</b>
          {fixed.map((f) => (
            <span key={f.id}>{f.name} {fmtConc(f.finalConc)} µg/mL ({fmt(f.volNeededFromPrimaryMl * 1000, 1)} µL of {fmtConc(f.primaryStock)} µg/mL)</span>
          ))}
          <Icon label="Edit fixed drug" onClick={onEdit && (() => onEdit('abs', fixed[0].isPartner ? fixed[0].mainId : fixed[0].id))}>✎</Icon>
        </div>
      )}

      <div style={{ overflowX: 'auto', paddingBottom: 6 }}>
        <div style={{ display: 'inline-block', minWidth: 'min-content' }}>
          {/* column drug title */}
          <div style={{ marginLeft: ROWW + 8, width: (nC + 1) * CELL_W, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <b style={{ color: '#1d4ed8', fontSize: 14 }}>{colName}</b>
            <span style={{ fontSize: 12, color: '#6b7280' }}>↔ columns, final µg/mL in the well</span>
            <Icon label={`Edit ${colRes.name}`} onClick={onEdit && (() => onEdit('abs', colRes.id))}>✎</Icon>
          </div>
          {/* column chips */}
          <div style={{ display: 'flex', marginLeft: ROWW + 8, marginBottom: 6 }}>
            {colRes.ladder.falcons.map((f, i) => (
              <div key={i} style={{ width: CELL_W }}><TubeChip f={f} label={i + 1} vertical color="#1d4ed8" partner={colRes.partner} /></div>
            ))}
            <div style={{ width: CELL_W }}><Blank vertical label={nC + 1} tall={!!colRes.partner} /></div>
          </div>

          <div style={{ display: 'flex' }}>
            {/* row chips */}
            <div style={{ width: ROWW + 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: 22, marginBottom: 2 }}>
                <b style={{ color: '#be185d', fontSize: 14 }}>{rowName}</b>
                <Icon label={`Edit ${rowRes.name}`} onClick={onEdit && (() => onEdit('abs', rowRes.id))}>✎</Icon>
              </div>
              {rowRes.ladder.falcons.map((f, i) => (
                <div key={i} style={{ height: CELL_H, display: 'flex', alignItems: 'center' }}>
                  <TubeChip f={f} label={String.fromCharCode(65 + i)} color="#be185d" partner={rowRes.partner} />
                </div>
              ))}
              <div style={{ height: CELL_H, display: 'flex', alignItems: 'center' }}>
                <Blank label={String.fromCharCode(65 + nR)} />
              </div>
            </div>
            {/* plate */}
            <div style={{ border: '2px solid #9ca3af', borderRadius: 10, background: '#fff', padding: 0, alignSelf: 'flex-start', marginTop: 24 }}>
              {Array.from({ length: nR + 1 }, (_, ri) => (
                <div key={ri} style={{ display: 'flex' }}>
                  {Array.from({ length: nC + 1 }, (_, ci) => {
                    const a = ci < nC ? colRes.series[ci] : 0;
                    const b = ri < nR ? rowRes.series[ri] : 0;
                    const gc = ci === nC && ri === nR;
                    return (
                      <div
                        key={ci}
                        title={`${String.fromCharCode(65 + ri)}${ci + 1}: ${colRes.name} ${fmtConc(a)} + ${rowRes.name} ${fmtConc(b)} µg/mL${colRes.partner && a ? ` (+ ${colRes.partner.name} ${fmtConc(a * colRes.partner.f)})` : ''}${rowRes.partner && b ? ` (+ ${rowRes.partner.name} ${fmtConc(b * rowRes.partner.f)})` : ''}`}
                        style={{ boxSizing: 'border-box', width: CELL_W, height: CELL_H, border: '1px solid #e5e7eb', background: cellTint(a, b), display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1.2 }}
                      >
                        {gc ? (
                          <b style={{ fontSize: 12, color: '#92400e' }}>GC</b>
                        ) : (
                          <>
                            <span style={{ fontSize: 13, fontWeight: 700, color: a ? '#1d4ed8' : '#9ca3af' }}>{a ? fmtConc(a) : '0'}</span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: b ? '#be185d' : '#9ca3af' }}>{b ? fmtConc(b) : '0'}</span>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          <div style={{ marginLeft: ROWW + 8, marginTop: 6, fontSize: 12, color: '#6b7280', display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <span><b style={{ color: '#1d4ed8' }}>blue</b> = {colRes.name}</span>
            <span><b style={{ color: '#be185d' }}>pink</b> = {rowRes.name}</span>
            <span><b style={{ color: '#7c3aed' }}>purple +n</b> = partner in the same tube</span>
            <span><b>GC</b> = growth control (no drug{fixed.length ? ', fixed drug only' : ''})</span>
            <span>Each chip: tube number · final concentration · volume to take from the stock shown (colour = stock)</span>
            <Icon label="Edit plate and batch" onClick={onEdit && (() => onEdit('batch'))}>⚙️ plate / batch</Icon>
            <Icon label="Plate layout and FICI analysis" onClick={onEdit && (() => onEdit('analysis'))}>📈 FICI</Icon>
          </div>
        </div>
      </div>

      {/* stocks */}
      <div style={{ marginTop: 18 }}>
        {titrated.map((r) => (
          <div key={r.id} style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>
              {r.name}{r.partner ? ` + ${r.partner.name} (${r.partner.parts})` : ''} <span style={{ fontWeight: 400, color: '#6b7280', fontSize: 12 }}>stocks</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'stretch', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
              {r.ladder.stocks.map((s, si) => (
                <div key={si} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {si > 0 && <span style={{ fontSize: 18, color: '#6b7280' }}>→</span>}
                  <StockCard r={r} s={s} si={si} onEdit={onEdit} />
                </div>
              ))}
              {r.partner?.mode === 'separate' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 12, paddingLeft: 12, borderLeft: '2px dashed #c4b5fd' }}>
                  {r.ladder.stocks.map((s, si) => (
                    <div key={si} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {si > 0 && <span style={{ fontSize: 18, color: '#7c3aed' }}>→</span>}
                      <div style={{ background: '#f5f3ff', border: '2px solid #7c3aed', borderRadius: 10, padding: '8px 12px', minWidth: 130 }}>
                        <b style={{ color: '#7c3aed', fontSize: 12 }}>{r.partner.name} · {s.name}</b>
                        <div style={{ fontSize: 17, fontWeight: 700 }}>{fmtConc(s.partnerConc)} <span style={{ fontSize: 11, fontWeight: 400 }}>µg/mL</span></div>
                        <div style={{ fontSize: 12, color: '#374151' }}>{si === 0 ? `${fmt(r.partner.weighMg, 1)} mg in ${r.dissolveVolMl} mL` : `${ul(s.fromPrev_uL)} + ${ul(s.camhb_mL * 1000)} CAMHB`}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* inoculum */}
        <div style={{ background: '#f0fdf4', border: '2px solid #4ade80', borderRadius: 10, padding: '8px 12px', display: 'inline-block' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <b style={{ color: '#15803d', fontSize: 13 }}>Inoculum</b>
            <Icon label="Edit inoculum" onClick={onEdit && (() => onEdit('inocset'))}>✎</Icon>
            <Icon label="Inoculum plan" onClick={onEdit && (() => onEdit('inoculum'))}>🦠</Icon>
          </div>
          <div style={{ fontSize: 13, color: '#14532d', lineHeight: 1.5 }}>
            {fmt(plan.volMcFarlandMl * 1000, 0)} µL 0.5 McFarland + {fmt(plan.camhbForBacMl, 1)} mL CAMHB
            {fixed.filter((f) => !(f.isPartner && f.coDissolved)).map((f) => ` + ${fmt(f.volNeededFromPrimaryMl * 1000, 1)} µL ${f.name}`).join('')} = {fmt(plan.bacVolMl, 1)} mL → {fmt(plan.volBacPerWell, 0)} µL per well
          </div>
        </div>
      </div>
    </div>
  );
}
