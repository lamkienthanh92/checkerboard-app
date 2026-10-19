import { S, btn } from './ui.jsx';
import { fmt, fmtConc, planReservoirLoading } from './calc.js';
import { download, planCsv } from './io.js';
import { buildPlanPdf } from './pdfPlan.js';
import { assignTubes, opentronsScript, worklist } from './robot.js';

export default function ProtocolTab({ plan, cfg, capacity }) {
  const titrated = plan.displayResults.filter((r) => r.type === 'variable' && r.ladder && !(r.isPartner && r.coDissolved));
  const fixed = plan.displayResults.filter((r) => r.type === 'fixed' && !(r.isPartner && r.coDissolved));
  const blocked = plan.messages.some((m) => m.level === 'error');
  const sepPartner = plan.abResults.some((r) => r.partner?.mode === 'separate');
  const canRobot = plan.colRes?.ladder && plan.rowRes?.ladder && !sepPartner;
  const rack = canRobot ? assignTubes(plan, cfg) : null;
  const rr = planReservoirLoading(plan, cfg);
  let n = 0;
  const num = () => ++n;

  return (
    <div>
      <div className="np" style={S.card}>
        <div style={S.h}>Export</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={btn} onClick={() => download('checkerboard_plan.pdf', buildPlanPdf(plan, cfg, capacity).output('blob'), 'application/pdf')}>Detailed plan (PDF)</button>
          <button style={btn} onClick={() => window.print()}>Print protocol</button>
          <button style={btn} onClick={() => download('checkerboard_plan.csv', planCsv(plan), 'text/csv')}>Plan (CSV)</button>
          <button style={btn} disabled={!canRobot} onClick={() => download('checkerboard_worklist.csv', worklist(plan, cfg), 'text/csv')}>
            Liquid-handler worklist (CSV)
          </button>
          <button style={btn} disabled={!canRobot} onClick={() => download('checkerboard_opentrons.py', opentronsScript(plan, cfg), 'text/x-python')}>
            Opentrons script (.py)
          </button>
        </div>
        {blocked && (
          <div style={{ marginTop: 8, fontSize: 12, color: '#b91c1c' }}>
            The plan has unresolved problems; fix them before using the exported files.
          </div>
        )}
        {sepPartner && (
          <div style={{ marginTop: 8, fontSize: 12, color: '#92400e', lineHeight: 1.6 }}>
            Liquid-handler files are not available when a partner is prepared as separate parallel stocks (the worklist would leave the partner out). Use the PDF or the protocol, or choose pre-primary stocks mixed into one Primary.
          </div>
        )}
        {canRobot && (
          <div style={{ marginTop: 8, fontSize: 12, color: '#6b7280', lineHeight: 1.6 }}>
            The worklist lists every dispense (source tube and rack position, destination well, volume). The Opentrons
            script loads one plate and needs {rack.rackCount} tube rack{rack.rackCount > 1 ? 's' : ''}; its syntax has been
            checked but it has not been run on hardware, so dry-run it with <code>opentrons_simulate</code> first.
          </div>
        )}
      </div>

      <div id="protocol" style={S.card}>
        <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 2 }}>Checkerboard protocol</div>
        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 14 }}>
          {plan.colRes?.name} × {plan.rowRes?.name}{fixed.length ? ` + ${fixed.map((f) => f.name).join(', ')} (fixed)` : ''} · {cfg.numPlates} plate
          {cfg.numPlates > 1 ? 's' : ''} · {cfg.plateVol} µL wells · printed {new Date().toISOString().slice(0, 10)}
        </div>

        <div style={S.step}>
          <b>{num()}. Weigh and dissolve</b>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13 }}>
            {plan.displayResults.map((r) => {
              const pre = r.isPartner ? r.pre : r.partner?.pre;
              if (pre) {
                const mine = r.isPartner;
                return (
                  <li key={r.id}>
                    ☐ Pre-primary {r.name}: {mine ? fmt(r.powderMg, 1) : r.powderMg} mg{mine ? ` (potency ${r.purityPct}%)` : ''} in its own tube, dissolved in {fmt(mine ? pre.partVolMl : pre.mainVolMl, 2)} mL → {fmtConc(mine ? pre.partConc : pre.mainConc)} µg/mL
                    {mine ? ` · partner of ${r.mainName}, ratio ${r.ratioText}` : ''}
                  </li>
                );
              }
              return (
                <li key={r.id}>
                  ☐ {r.name}: {r.isPartner ? fmt(r.powderMg, 1) : r.powderMg} mg in {r.dissolveVolMl} mL → {r.primaryStock ? fmtConc(r.primaryStock) : '—'} µg/mL
                  {r.powderUsedMg != null ? ` (about ${fmt(r.powderUsedMg, 1)} mg used)` : ''}
                  {r.isPartner ? ` · partner of ${r.mainName}, ratio ${r.ratioText}, potency ${r.purityPct}%` : ''}
                </li>
              );
            })}
            {plan.abResults.filter((r) => r.partner?.pre).map((r) => (
              <li key={'mix' + r.id}>
                ☐ Mix {fmt(r.partner.pre.mainVolMl, 2)} mL {r.name} pre-primary + {fmt(r.partner.pre.partVolMl, 2)} mL {r.partner.name} pre-primary = {fmt(r.partner.pre.totalMl, 2)} mL <b>Primary</b> ({r.name} {fmtConc(r.primaryStock)}, {r.partner.name} {fmtConc(r.partner.primaryStock)} µg/mL; about {fmt(r.powderUsedMg, 1)} + {fmt(r.partner.usedMg, 1)} mg used)
              </li>
            ))}
          </ul>
        </div>

        {titrated.map((r) => (
          <div key={r.id} style={S.step}>
            <b>{num()}. {r.name}: stocks and tubes</b>{r.isPartner ? ` (partner of ${r.mainName}, separate parallel stocks)` : ''}
            {r.partner && (
              <div style={{ fontSize: 12, color: '#374151', marginTop: 4 }}>
                {r.partner.mode === 'separate'
                  ? <>☐ Combination product, separate stocks: dissolve <b>{fmt(r.partner.weighMg, 1)} mg {r.partner.name}</b> apart from the {r.powderMg} mg {r.name} (ratio {r.partner.parts}); repeat every stock dilution for the partner with the same volumes, and add the same volume from both stocks to each tube. Concentrations below are of {r.name}; {r.partner.name} is {fmt(r.partner.f * 100, 0)}% of each.</>
                  : <>☐ Combination product (ratio {r.partner.parts}): the two pre-primaries from step 1 are mixed into one Primary, which then carries both drugs. Concentrations below are of {r.name}; {r.partner.name} is {fmt(r.partner.f * 100, 0)}% of each.</>}
              </div>
            )}
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13 }}>
              {r.ladder.stocks.slice(1).map((s) => (
                <li key={s.name}>
                  ☐ {s.name} {fmtConc(s.conc)} µg/mL: {fmt(s.fromPrev_uL, 1)} µL {r.ladder.stocks[s.fromStockIdx].name} + {fmt(s.camhb_mL * 1000, 0)} µL CAMHB
                </li>
              ))}
              {r.ladder.falcons.map((f) => (
                <li key={f.falconIdx}>
                  ☐ Tube {r.axis === 'row' ? String.fromCharCode(64 + f.falconIdx) : f.falconIdx} ({fmtConc(f.finalConc)} µg/mL final, {fmtConc(f.concInFalcon)} in tube):{' '}
                  {f.volFromStock_uL >= 900 ? `${fmt(f.volFromStock_mL, 2)} mL` : `${fmt(f.volFromStock_uL, 1)} µL`} {f.stockName}{r.isPartner ? ` into the same tube as ${r.mainName} (no extra CAMHB)` : ` + ${fmt(f.camhb_mL, 2)} mL CAMHB = ${fmt(f.totalMl, 1)} mL`}{r.partner ? ` (contains ${r.partner.name} ${fmtConc(f.partnerInFalcon)} µg/mL)` : ''}
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div style={S.step}>
          <b>{num()}. Inoculum</b>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13 }}>
            <li>☐ Adjust to 0.5 McFarland.</li>
            <li>
              ☐ {fmt(plan.volMcFarlandMl * 1000, 1)} µL McFarland suspension + {fmt(plan.camhbForBacMl, 2)} mL CAMHB
              {fixed.map((f) => ` + ${fmt((f.volNeededFromPrimaryMl || 0) * 1000, 1)} µL ${f.name} primary`).join('')} = {fmt(plan.bacVolMl, 1)} mL
            </li>
            <li>☐ Plate a dilution and count colonies to confirm the inoculum.</li>
          </ul>
        </div>

        <div style={S.step}>
          <b>{num()}. Load plates</b>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13 }}>
            <li>☐ {plan.colRes?.name}: {fmt(plan.volAbPerWellEach, 1)} µL per well, one tube per column (1 → {plan.colRes ? plan.colRes.series.length : '—'}; last column drug-free).</li>
            <li>☐ {plan.rowRes?.name}: {fmt(plan.volAbPerWellEach, 1)} µL per well, one tube per row (A → {plan.rowRes ? String.fromCharCode(64 + plan.rowRes.series.length) : '—'}; last row drug-free).</li>
            <li>☐ Inoculum: {fmt(plan.volBacPerWell, 0)} µL per well, within the time limit of your reference standard.</li>
            {rr && (
              <li>
                ☐ With 12-well reservoirs: pour each tube into its own well ({rr.col.name} {rr.col.pourMl} mL per well; {rr.row.name} {rr.row.pourMl} mL per well; one well of plain broth for the drug-free column and row);
                12-channel, {rr.col.passes} passes for {rr.col.name}; tips 1–{rr.nR}, {rr.row.passes} passes for {rr.row.name}; inoculum last, {rr.inoc.passes} passes
                ({rr.steps.multi} dispenses per plate instead of {rr.steps.single}).
              </li>
            )}
            <li>☐ Controls: sterility, drug-free growth{fixed.length ? ' (without the fixed drug)' : ''}, QC strain.</li>
          </ul>
        </div>

        <div style={S.step}>
          <b>{num()}. Incubate and read</b>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13 }}>
            <li>☐ Incubate per CLSI M07 / ISO 20776-1 (check the current edition).</li>
            <li>☐ Read OD or growth; record in the FICI analysis tab.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
