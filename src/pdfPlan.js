// Detailed plan as a PDF (A4). Built in the browser with jsPDF; no data leaves the page.
import { jsPDF } from 'jspdf';
import { fmt, fmtConc, brothBreakdown, planReservoirLoading } from './calc.js';

const clean = (t) =>
  String(t)
    .replace(/→/g, '->').replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/−/g, '-').replace(/☐/g, '[ ]')
    .replace(/×\s?10⁵/g, 'x 10^5').replace(/×\s?10⁶/g, 'x 10^6').replace(/×\s?10⁸/g, 'x 10^8').replace(/⁻/g, '-')
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (c) => '^' + '⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(c)).replace(/…/g, '...').replace(/·/g, '-')
    .replace(/[^\x00-\xFF]/g, '?');

export function buildPlanPdf(plan, cfg, capacity, today = new Date().toISOString().slice(0, 10)) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, M = 15, CW = W - 2 * M;
  let y = M;
  const broth = brothBreakdown(plan);
  const rr = planReservoirLoading(plan, cfg);
  const fixed = plan.displayResults.filter((r) => r.type === 'fixed' && !(r.isPartner && r.coDissolved));
  const titrated = plan.displayResults.filter((r) => r.type === 'variable' && r.ladder && !(r.isPartner && r.coDissolved));

  const need = (h) => { if (y + h > 285) { doc.addPage(); y = M; } };
  const h1 = (t) => { need(12); doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(17, 24, 39); doc.text(clean(t), M, y); y += 2; doc.setDrawColor(59, 130, 246); doc.setLineWidth(0.5); doc.line(M, y, W - M, y); y += 6; };
  const para = (t, { size = 9.5, bold = false, color = [31, 41, 55], gap = 1.5 } = {}) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(...color);
    const lines = doc.splitTextToSize(clean(t), CW);
    lines.forEach((l) => { need(size * 0.5); doc.text(l, M, y); y += size * 0.45; });
    y += gap;
  };
  const check = (t) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(31, 41, 55);
    const lines = doc.splitTextToSize(clean(t), CW - 9);
    need(lines.length * 4.5 + 1);
    doc.setDrawColor(107, 114, 128); doc.setLineWidth(0.3); doc.rect(M, y - 3, 3.2, 3.2);
    lines.forEach((l) => { doc.text(l, M + 6, y); y += 4.4; });
    y += 0.8;
  };
  const table = (head, rows, widths, { bold = [] } = {}) => {
    const tot = widths.reduce((a, b) => a + b, 0);
    const w = widths.map((x) => (x / tot) * CW);
    const row = (cells, isHead, rowBold) => {
      doc.setFont('helvetica', isHead || rowBold ? 'bold' : 'normal'); doc.setFontSize(8.5);
      const wrapped = cells.map((c, i) => doc.splitTextToSize(clean(c), w[i] - 2.4));
      const hh = Math.max(...wrapped.map((l) => l.length)) * 3.7 + 2.2;
      need(hh);
      if (isHead) { doc.setFillColor(243, 244, 246); doc.rect(M, y - 3.6, CW, hh, 'F'); }
      let x = M;
      wrapped.forEach((ls, i) => { doc.setTextColor(31, 41, 55); ls.forEach((l, k) => doc.text(l, x + 1.2, y + k * 3.7)); x += w[i]; });
      doc.setDrawColor(229, 231, 235); doc.setLineWidth(0.2); doc.line(M, y - 3.6 + hh, W - M, y - 3.6 + hh);
      y += hh;
    };
    row(head, true);
    rows.forEach((r, i) => row(r, false, bold.includes(i)));
    y += 3;
  };


  // ---- drawing helpers for the preparation diagrams ----
  const COLS = [[59, 130, 246], [245, 158, 11], [16, 185, 129], [139, 92, 246], [236, 72, 153], [249, 115, 22]];
  const lite = (c, a) => c.map((v) => Math.round(255 - (255 - v) * a));
  const txt = (t, x, yy, { size = 7, bold = false, color = [55, 65, 81], align = 'center' } = {}) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(...color); doc.text(clean(t), x, yy, { align });
  };
  /** Conical tube: cx centre, top y, width w, height h; fill is the share of the tube that is liquid; dark is the share of the liquid that is drug stock. */
  const drawTube = (cx, top, w, h, col, fill = 0.8, dark = 0.3) => {
    const cone = h * 0.28, bodyH = h - cone, liq = h * fill;
    doc.setDrawColor(107, 114, 128); doc.setLineWidth(0.3); doc.setFillColor(255, 255, 255);
    doc.lines([[w, 0], [0, bodyH], [-(w / 2 - 0.5), cone], [-1, 0], [-(w / 2 - 0.5), -cone]], cx - w / 2, top, [1, 1], 'FD', true);
    // liquid, clipped to the tube by drawing the same outline shape from the bottom up
    const lt = top + h - liq;
    doc.setFillColor(...lite(col, 0.28));
    if (liq > cone) {
      doc.lines([[w, 0], [0, liq - cone], [-(w / 2 - 0.5), cone], [-1, 0], [-(w / 2 - 0.5), -cone]], cx - w / 2, lt, [1, 1], 'F', true);
    } else {
      const ww = 1 + (w - 1) * (liq / cone);
      doc.lines([[ww, 0], [-(ww / 2 - 0.5), liq], [-1, 0]], cx - ww / 2, lt, [1, 1], 'F', true);
    }
    if (dark > 0.02 && liq > cone) {
      const dh = Math.min(liq - cone, Math.max(1.2, (liq - cone) * dark));
      doc.setFillColor(...col);
      doc.rect(cx - w / 2 + 0.3, top + h - cone - dh, w - 0.6, dh, 'F');
    }
    doc.setFillColor(156, 163, 175); doc.setDrawColor(107, 114, 128);
    doc.roundedRect(cx - w / 2 - 0.4, top - 1.6, w + 0.8, 1.8, 0.4, 0.4, 'FD');
  };
  const arrowH = (x1, x2, yy) => {
    doc.setDrawColor(107, 114, 128); doc.setLineWidth(0.4); doc.line(x1, yy, x2 - 1.2, yy);
    doc.setFillColor(107, 114, 128); doc.triangle(x2, yy, x2 - 1.6, yy - 0.9, x2 - 1.6, yy + 0.9, 'F');
  };
  const drawLadder = (r) => {
    const L = r.ladder, n = L.stocks.length;
    const hgt = 76; need(hgt + 4);
    const top = y;
    txt(`${r.name}: how to make it`, M, top + 1, { size: 8.5, bold: true, align: 'left' });
    // vial
    const vx = M + 8;
    doc.setDrawColor(107, 114, 128); doc.setFillColor(243, 244, 246); doc.roundedRect(vx - 5, top + 10, 10, 14, 1.2, 1.2, 'FD');
    doc.setFillColor(156, 163, 175); doc.rect(vx - 3.6, top + 7.6, 7.2, 3, 'F');
    doc.setFillColor(209, 213, 219); doc.rect(vx - 4.4, top + 17, 8.8, 6.4, 'F');
    txt(`${r.powderMg} mg`, vx, top + 28.5, { size: 7, bold: true });
    txt(r.partner?.pre ? `+ ${fmt(r.partner.weighMg, 1)} mg ${r.partner.name.slice(0, 8)}` : 'powder', vx, top + 31.6, { size: 6, color: [107, 114, 128] });
    // stock tubes
    const sx0 = M + 38, sw = Math.min(30, (CW - 40) / n);
    L.stocks.forEach((s, k) => {
      const cx = sx0 + k * sw, col = COLS[k % COLS.length];
      arrowH(cx - sw + (k === 0 ? 14 : 10) , cx - 6, top + 17);
      if (k === 0) txt(r.partner?.pre ? `mix to ${fmt(r.dissolveVolMl, 2)} mL` : `+ ${fmt(r.dissolveVolMl, 2)} mL`, (vx + 5 + cx - 6) / 2 + 2, top + 13.5, { size: 6.2 });
      else {
        txt(`${fmt(s.fromPrev_uL, 1)} uL`, cx - sw / 2 - 1, top + 12.8, { size: 6.2 });
        txt(`+ ${fmt(s.camhb_mL * 1000, 0)} uL CAMHB`, cx - sw / 2 - 1, top + 15.6, { size: 5.6, color: [107, 114, 128] });
      }
      drawTube(cx, top + 8, 9, 24, col, 0.7, k === 0 ? 1 : Math.min(0.9, (s.fromPrev_uL / 1000) / s.volNeeded_mL + 0.08));
      txt(`${fmtConc(s.conc)}`, cx, top + 36, { size: 6.8, bold: true });
      if (r.partner) txt(`+ ${fmtConc(s.partnerConc)} ${r.partner.name.slice(0, 10)}`, cx, top + 42.2, { size: 5.4, color: [124, 58, 237] });
      txt(k === 0 ? 'primary' : `${s.name.toLowerCase()} 1:${s.dilution}`, cx, top + 39.2, { size: 5.8, color: [107, 114, 128] });
    });
    // working tubes
    const nT = L.falcons.length, tw = Math.min(14, (CW - 4) / nT);
    doc.setDrawColor(229, 231, 235); doc.setLineWidth(0.2); doc.line(M, top + 44, W - M, top + 44);
    txt(`WORKING TUBES (ug/mL, 4x final); colour = stock used`, M, top + 48, { size: 6.5, bold: true, color: [107, 114, 128], align: 'left' });
    L.falcons.forEach((f, i) => {
      const cx = M + 3 + tw * i + tw / 2, col = COLS[f.stockIdx % COLS.length];
      drawTube(cx, top + 52, 6.5, 12, col, 0.85, Math.max(0.08, f.volFromStock_mL / f.totalMl));
      txt(fmtConc(f.finalConc), cx, top + 67, { size: 6, bold: true });
      if (r.partner) txt(fmtConc(f.partnerFinal), cx, top + 70.2, { size: 5.4, color: [124, 58, 237] });
    });
    y = top + hgt;
  };
  const drawInoculum = () => {
    const hgt = 40; need(hgt + 4); const top = y;
    txt('Inoculum: how to make it', M, top + 1, { size: 8.5, bold: true, align: 'left' });
    const items = [
      { t: '0.5 McFarland', s: `${fmt(plan.volMcFarlandMl * 1000, 1)} uL`, col: [34, 197, 94] },
      { t: 'CAMHB', s: `${fmt(plan.camhbForBacMl, 1)} mL`, col: [59, 130, 246] },
      ...fixed.map((f) => ({ t: `${f.name} primary`, s: `${fmt((f.volNeededFromPrimaryMl || 0) * 1000, 1)} uL`, col: [245, 158, 11] })),
    ];
    const step = Math.min(34, (CW - 50) / items.length);
    items.forEach((it, i) => {
      const cx = M + 10 + i * step;
      drawTube(cx, top + 8, 8, 18, it.col, 0.6, 0.5);
      txt(it.t, cx, top + 30, { size: 6.3, bold: true }); txt(it.s, cx, top + 33.2, { size: 6.3 });
      if (i < items.length - 1) txt('+', cx + step / 2, top + 19, { size: 10, bold: true });
    });
    const ex = M + 10 + items.length * step + 2;
    arrowH(ex - 8, ex + 6, top + 19);
    drawTube(ex + 16, top + 6, 10, 24, [16, 185, 129], 0.85, 0.2);
    txt(`${fmt(plan.bacVolMl, 1)} mL suspension`, ex + 16, top + 34, { size: 6.5, bold: true });
    txt(`${fmt(cfg.bacTargetCfu / plan.bacFrac / 1e5, 1)} x 10^5 CFU/mL`, ex + 16, top + 37.2, { size: 6, color: [107, 114, 128] });
    arrowH(ex + 27, ex + 41, top + 19);
    txt(`${fmt(plan.volBacPerWell, 0)} uL per well`, ex + 52, top + 17, { size: 6.5, bold: true });
    txt(`-> ${fmt(cfg.bacTargetCfu / 1e5, 1)} x 10^5 CFU/mL`, ex + 52, top + 20.4, { size: 6, color: [107, 114, 128] });
    y = top + hgt;
  };

  // ---- title ----
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(17, 24, 39);
  doc.text('Checkerboard assay plan', M, y + 4); y += 10;
  const names = `${plan.colRes?.name || '?'} x ${plan.rowRes?.name || '?'}${fixed.length ? ' + ' + fixed.map((f) => f.name).join(', ') + ' (fixed)' : ''}`;
  para(names, { size: 11, bold: true });
  para(`${cfg.numPlates} plate${cfg.numPlates === 1 ? '' : 's'} of 96 wells, ${cfg.plateVol} uL per well (${fmt(plan.volAbPerWellEach, 1)} uL of each titrated drug + ${fmt(plan.volBacPerWell, 0)} uL inoculum). Prepared ${today} with Checkerboard Assay Planner.`, { color: [75, 85, 99] });
  if (capacity) para(`Number of plates: the largest that the material supports (${capacity.best}); limited by ${capacity.limiting.join(' and ')}.`, { color: [75, 85, 99] });
  const issues = plan.messages.filter((m) => m.level === 'error');
  if (issues.length) { para('Unresolved problems - fix before use:', { bold: true, color: [185, 28, 28] }); issues.forEach((m) => para('- ' + m.text, { color: [185, 28, 28] })); }
  y += 2;

  // ---- materials ----
  h1('1. Materials to prepare');
  const dish = Number(cfg.inocDeadMl) || cfg.deadMl;
  table(['Item', 'Amount', 'Note'], [
    ...plan.abResults.flatMap((r) => [[`${r.name} powder`, r.powderUsedMg != null ? `${fmt(r.powderUsedMg, 1)} mg used` : '-', `${r.powderMg} mg weighed, dissolved in ${r.dissolveVolMl} mL -> ${r.primaryStock ? fmtConc(r.primaryStock) : '-'} ug/mL`],
      ...(r.partner ? [[`${r.partner.name} powder (partner of ${r.name}, ${r.partner.parts})`, r.partner.usedMg != null ? `${fmt(r.partner.usedMg, 1)} mg used` : '-', `${r.partner.weighMg != null ? fmt(r.partner.weighMg, 1) : '-'} mg weighed and dissolved on its own (pre-primary), then mixed with the ${r.name} pre-primary to make the Primary; concentrations are of ${r.name}`]] : [])]),
    ['CAMHB in total', `${fmt(Math.ceil(broth.total / 10) * 10, 0)} mL`, `computed ${fmt(broth.total, 1)} mL, rounded up to 10 mL`],
    ['  working tubes', `${fmt(broth.tubes, 1)} mL`, ''],
    ['  intermediate stocks', `${fmt(broth.stocks, 1)} mL`, ''],
    ['  inoculum suspension', `${fmt(broth.inoculum, 1)} mL`, ''],
    ['0.5 McFarland suspension', `${fmt(plan.volMcFarlandMl * 1000, 0)} uL`, `${fmt(cfg.bacStockCfu / 1e8, 2)} x 10^8 CFU/mL assumed`],
    ['Inoculum suspension', `${fmt(plan.bacVolMl, 1)} mL`, `wells ${fmt((cfg.numPlates * 96 * plan.volBacPerWell) / 1000, 1)} mL + ${cfg.bufferPct}% overage + ${fmt(dish, 1)} mL left in the vessel`],
  ], [4, 3, 6], { bold: [plan.abResults.length] });

  // ---- layout ----
  const colS = plan.colRes?.series || [], rowS = plan.rowRes?.series || [];
  if (colS.length && rowS.length) {
    h1('2. Plate layout');
    para(`${plan.colRes.name} across columns (highest at the left), ${plan.rowRes.name} down rows (highest at the top). Final concentrations in the well, ug/mL. The last column and row are drug-free.`);
    const cs = [...colS, 0], rs = [...rowS, 0];
    const cw = Math.min(13, (CW - 12) / 12), ch = 7;
    need(ch * 9 + 8);
    doc.setFontSize(7); doc.setFont('helvetica', 'bold'); doc.setTextColor(185, 80, 0);
    cs.forEach((c, i) => doc.text(c === 0 ? '0' : String(Number(c.toPrecision(3))), M + 12 + i * cw + cw / 2, y, { align: 'center' }));
    y += 2;
    const maxC = Math.max(...colS), maxR = Math.max(...rowS);
    rs.forEach((rv, r) => {
      doc.setTextColor(0, 80, 140); doc.setFont('helvetica', 'bold'); doc.setFontSize(7);
      doc.text(`${String.fromCharCode(65 + r)}  ${rv === 0 ? '0' : Number(rv.toPrecision(3))}`, M + 11, y + ch / 2 + 1, { align: 'right' });
      cs.forEach((cv, c) => {
        const a = cv > 0 ? 0.15 + 0.5 * (cv / maxC) : 0, b = rv > 0 ? 0.15 + 0.5 * (rv / maxR) : 0;
        const R = Math.round(255 - 40 * a - 255 * b * 0.45), G = Math.round(255 - 120 * a - 90 * b), B = Math.round(255 - 255 * a * 0.9 - 40 * b * 0.0);
        doc.setFillColor(Math.max(R, 120), Math.max(G, 120), Math.max(B, 120));
        doc.setDrawColor(156, 163, 175); doc.setLineWidth(0.2);
        doc.roundedRect(M + 12 + c * cw + 0.4, y + 0.4, cw - 0.8, ch - 0.8, 1.5, 1.5, 'FD');
      });
      y += ch;
    });
    y += 3;
    para(`Growth control: the drug-free / drug-free well (${String.fromCharCode(65 + rs.length - 1)}${cs.length})${fixed.length ? ', which contains only the fixed drug' : ''}. Include a sterility control and a QC strain.`);
  }

  // ---- stocks and tubes ----
  titrated.forEach((r, k) => {
    need(90);
    h1(`${3 + k}. ${r.name}${r.isPartner ? ` (partner of ${r.mainName}, separate stocks)` : ''}: stocks and working tubes`);
    drawLadder(r);
    para(`Primary stock ${r.primaryStock ? fmtConc(r.primaryStock) : '-'} ug/mL (${r.isPartner ? fmt(r.powderMg, 1) : r.powderMg} mg${r.isPartner ? ` of ${r.name}, potency ${r.purityPct}%,` : ''} in ${r.dissolveVolMl} mL${r.isPartner ? `, in its own tube; ratio ${r.mainName}:${r.name} ${r.ratioText}` : ''}). ${r.axis === 'row' ? 'Tubes A, B, ... are used down the rows.' : 'Tubes 1, 2, ... are used across the columns.'}`);
    if (r.partner) {
      if (r.partner.mode === 'separate') {
        para(`Combination product (separate stocks): weigh ${fmt(r.partner.weighMg, 1)} mg ${r.partner.name} and dissolve it in ${r.dissolveVolMl} mL (${r.partner.primaryStock ? fmtConc(r.partner.primaryStock) : '-'} ug/mL), apart from the ${r.name}. Make every stock below twice with the same volumes, once for each drug, and give each working tube the same volume from the ${r.name} stock and from the matching ${r.partner.name} stock (CAMHB column already reduced). Concentrations are given for ${r.name}; ${r.partner.name} is ${fmt(r.partner.f * 100, 0)}% of each value (purple numbers in the diagram, last column of the tube table).`);
      } else {
        para(`Combination product (pre-primary stocks mixed into one Primary): ${r.partner.pre ? `weigh ${r.powderMg} mg ${r.name} and dissolve in ${fmt(r.partner.pre.mainVolMl, 2)} mL (${fmtConc(r.partner.pre.mainConc)} ug/mL); weigh ${fmt(r.partner.weighMg, 1)} mg ${r.partner.name} separately and dissolve in ${fmt(r.partner.pre.partVolMl, 2)} mL (${fmtConc(r.partner.pre.partConc)} ug/mL); mix the two to make ${fmt(r.partner.pre.totalMl, 2)} mL of Primary.` : `weigh ${fmt(r.partner.weighMg, 1)} mg ${r.partner.name} separately.`} Every stock and tube then carries both drugs; no extra pipetting. Concentrations are given for ${r.name}; ${r.partner.name} is ${fmt(r.partner.f * 100, 0)}% of each value (purple numbers in the diagram, last column of the tube table).`);
      }
    }
    const stocks = r.ladder.stocks.slice(1);
    if (stocks.length) {
      table(['Stock', 'Concentration (ug/mL)', 'Made from'], stocks.map((s) => [s.name, fmtConc(s.conc), `${fmt(s.fromPrev_uL, 1)} uL ${r.ladder.stocks[s.fromStockIdx].name} + ${fmt(s.camhb_mL * 1000, 0)} uL CAMHB`]), [2, 3, 7]);
    }
    table(['Tube', 'Final in well', 'In tube (4x)', 'Take from stock', 'CAMHB', 'Total', ...(r.partner ? [`${r.partner.name} in tube`] : [])], r.ladder.falcons.map((f) => [
      r.axis === 'row' ? String.fromCharCode(64 + f.falconIdx) : String(f.falconIdx),
      fmtConc(f.finalConc), fmtConc(f.concInFalcon),
      `${f.volFromStock_uL >= 900 ? fmt(f.volFromStock_mL, 2) + ' mL' : fmt(f.volFromStock_uL, 1) + ' uL'} ${f.stockName}`,
      (r.isPartner ? 'in the ' + r.mainName + ' tube' : `${fmt(f.camhb_mL, 2)} mL`), `${fmt(f.totalMl, 1)} mL`,
      ...(r.partner ? [fmtConc(f.partnerInFalcon)] : []),
    ]), r.partner ? [1.1, 1.8, 1.8, 3.6, 1.8, 1.8, 2.4] : [1.2, 2, 2, 4, 2, 2]);
  });

  // ---- inoculum ----
  const base = 3 + titrated.length;
  need(60);
  h1(`${base}. Inoculum`);
  drawInoculum();
  check('Adjust to 0.5 McFarland.');
  check(`${fmt(plan.volMcFarlandMl * 1000, 1)} uL McFarland suspension + ${fmt(plan.camhbForBacMl, 2)} mL CAMHB${fixed.map((f) => ` + ${fmt((f.volNeededFromPrimaryMl || 0) * 1000, 1)} uL ${f.name} primary`).join('')} = ${fmt(plan.bacVolMl, 1)} mL.`);
  para(`Target ${fmt(cfg.bacTargetCfu / 1e5, 1)} x 10^5 CFU/mL in the wells after mixing (${fmt(cfg.bacTargetCfu / plan.bacFrac / 1e5, 1)} x 10^5 CFU/mL in the suspension).`, { color: [75, 85, 99] });
  check('Plate a dilution and count colonies to confirm the inoculum.');
  y += 2;

  // ---- loading ----
  h1(`${base + 1}. Loading the plates`);
  check(`${plan.colRes?.name}: ${fmt(plan.volAbPerWellEach, 1)} uL per well, one tube per column.`);
  check(`${plan.rowRes?.name}: ${fmt(plan.volAbPerWellEach, 1)} uL per well, one tube per row.`);
  check(`Inoculum: ${fmt(plan.volBacPerWell, 0)} uL per well, added last, within the time limit of your reference standard.`);
  if (rr) {
    para('With 12-well reservoirs and a multichannel pipette:', { bold: true });
    check(`${rr.col.name}: pour ${rr.col.pourMl ?? '-'} mL per reservoir well${rr.col.fills > 1 ? ` (${rr.col.fills} fills of ${rr.col.platesPerFill} plates)` : ''}; 12-channel pipette, ${rr.col.passes} passes per plate, ${fmt(rr.col.drawPerPlateMl, 2)} mL drawn per well per plate.`);
    check(`${rr.row.name}: pour ${rr.row.pourMl ?? '-'} mL per reservoir well${rr.row.fills > 1 ? ` (${rr.row.fills} fills of ${rr.row.platesPerFill} plates)` : ''}; tips 1-${rr.nR}, ${rr.row.passes} passes per plate, ${fmt(rr.row.drawPerPlateMl, 2)} mL drawn per well per plate.`);
    check(`Inoculum: Petri dish (150 mm for a 12-tip head) or trough, ${rr.inoc.passes} passes per plate, ${fmt(rr.inoc.drawPerPlateMl, 1)} mL per plate; fresh tips; refill the dish in portions.`);
    para(`${rr.steps.multi} dispensing movements per plate instead of ${rr.steps.single} with a single-channel pipette.`, { color: [75, 85, 99] });
    rr.issues.forEach((t) => para(t, { color: [185, 28, 28] }));
  }
  check(`Controls: sterility, drug-free growth${fixed.length ? ' (without the fixed drug)' : ''}, QC strain.`);
  y += 2;
  h1(`${base + 2}. Incubate and read`);
  check('Incubate per CLSI M07 / ISO 20776-1 (check the current edition).');
  check('Read OD or growth; enter the values in the FICI analysis tab.');

  // ---- footer ----
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(107, 114, 128);
    doc.text('Planning aid: check against your laboratory protocol and the reference standard before use.', M, 292);
    doc.text(`${i} / ${n}`, W - M, 292, { align: 'right' });
  }
  return doc;
}
