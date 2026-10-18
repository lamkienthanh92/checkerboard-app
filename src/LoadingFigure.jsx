// Loading with 12-well reservoirs and a multichannel pipette, drawn as an oblique scene.
// Objects are drawn to scale (1 unit = 9 mm, the pitch of a 96-well plate); the same drawing is Figure 6 of the manuscript.
// The concentrations, the number of columns and rows and the drug names come from the plan.
const VE = '#D55E00'; // column drug
const BL = '#0072B2'; // row drug
const GR = '#009E73'; // inoculum
const TOP = '#b8efcf', FRONT = '#72d79e', SIDE = '#52bb81', EDGE = '#2f7d52';
const INK = '#1f2937', GREY = '#6b7280';
const PT = 1 / 14; // one typographic point in drawing units
const H = 1.9, CH = 7.6; // reservoir height and channel length
const PW = 12.4, PD = 9.6, PH = 0.7; // plate width, depth, height
const CONE = 2.3;

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const tint = (hex, a) => {
  const c = rgb(hex).map((x) => Math.round((1 - (1 - x) * a) * 255));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
};
const liquid = (c, mx, col) => (c > 0 ? tint(col, 0.3 + (0.65 * c) / mx) : '#d1d5db');
const fmtc = (c) => (c === 0 ? '0' : String(Number(c.toPrecision(3))));

/** A tiny scene graph: items are collected with a z-order and drawn back to front. y points up, as in the drawing script. */
function scene(W, Hh) {
  const items = [];
  const Y = (y) => Hh - y;
  const add = (z, el) => items.push({ z, el, n: items.length });
  const api = {
    W, H: Hh,
    poly(pts, fc, ec = EDGE, z = 2, lw = 0.7) {
      add(z, <polygon points={pts.map(([x, y]) => `${x},${Y(y)}`).join(' ')} fill={fc} stroke={ec} strokeWidth={lw * PT} strokeLinejoin="round" />);
    },
    ellipse(cx, cy, rx, ry, fc, ec = GREY, z = 1, lw = 0.6) {
      add(z, <ellipse cx={cx} cy={Y(cy)} rx={rx} ry={ry} fill={fc} stroke={ec} strokeWidth={lw * PT} />);
    },
    rrect(x, y, w, h, fc, ec = INK, lw = 0.7, r = 0.12, z = 8) {
      add(z, <rect x={x} y={Y(y + h)} width={w} height={h} rx={r} fill={fc} stroke={ec} strokeWidth={lw * PT} />);
    },
    text(t, x, y, { size = 6.6, color = INK, anchor = 'start', weight = 400, z = 20, halo = false, base = 'central' } = {}) {
      add(z, (
        <text x={x} y={Y(y)} fontSize={size * PT} fill={color} textAnchor={anchor} fontWeight={weight} dominantBaseline={base}
          fontFamily="system-ui, 'Segoe UI', sans-serif"
          {...(halo ? { stroke: '#fff', strokeWidth: 0.28, paintOrder: 'stroke' } : {})}>{t}</text>
      ));
    },
    line(p, q, color = GREY, lw = 0.6, z = 25, cap = 'butt') {
      add(z, <line x1={p[0]} y1={Y(p[1])} x2={q[0]} y2={Y(q[1])} stroke={color} strokeWidth={lw * PT} strokeLinecap={cap} />);
    },
    arrow(p, q, lw = 0.8, head = 0.28, z = 25) {
      const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy) || 1;
      const ux = dx / L, uy = dy / L;
      const b = [q[0] - ux * head, q[1] - uy * head];
      api.line(p, b, GREY, lw, z);
      api.poly([q, [b[0] - uy * head * 0.45, b[1] + ux * head * 0.45], [b[0] + uy * head * 0.45, b[1] - ux * head * 0.45]], GREY, 'none', z, 0);
    },
    callout(t, xy, xyt, anchor = 'start') {
      api.line(xy, xyt, GREY, 0.6, 29);
      api.text(t, xyt[0], xyt[1], { anchor, z: 30, halo: true });
    },
    render() {
      return items.slice().sort((a, b) => a.z - b.z || a.n - b.n).map((it, i) => <g key={i}>{it.el}</g>);
    },
  };
  return api;
}

function makeProj(ax, ay) {
  return (x, y, z = 0, off = [0, 0]) => [x + y * ax + off[0], z + y * ay + off[1]];
}

function reservoir(s, P, x0, y0, concs, color, orient, off = [0, 0], zb = 0) {
  const n = concs.length;
  const mx = Math.max(...concs, 1e-9);
  const info = [];
  const Dp = CH + 0.9;
  if (orient === 'x') {
    const W = 12.8;
    s.poly([P(x0 + W, y0, 0, off), P(x0 + W, y0 + Dp, 0, off), P(x0 + W, y0 + Dp, H, off), P(x0 + W, y0, H, off)], SIDE, EDGE, zb + 1);
    s.poly([P(x0, y0, H, off), P(x0 + W, y0, H, off), P(x0 + W, y0 + Dp, H, off), P(x0, y0 + Dp, H, off)], TOP, EDGE, zb + 2);
    for (let i = 0; i < 12; i++) {
      const xa = x0 + 0.4 + i + 0.08, xb = xa + 0.84, ya = y0 + 0.45, yb = ya + CH;
      s.poly([P(xa, ya, H, off), P(xb, ya, H, off), P(xb, yb, H, off), P(xa, yb, H, off)], i < n ? liquid(concs[i], mx, color) : '#f3f4f6', EDGE, zb + 3, 0.6);
      info.push([x0 + 0.4 + i + 0.5, y0 + 1.7]);
    }
    s.poly([P(x0, y0, 0, off), P(x0 + W, y0, 0, off), P(x0 + W, y0, H, off), P(x0, y0, H, off)], FRONT, EDGE, zb + 6);
    for (let i = 0; i < 12; i++) {
      const [sx, sy] = P(x0 + 0.4 + i + 0.5, y0, 0, off);
      s.text(String(i + 1), sx, sy + 1.28, { size: 6.6, color: '#fff', anchor: 'middle', weight: 700, z: zb + 7 });
      if (i < n) s.text(fmtc(concs[i]), sx, sy + 0.55, { size: 5, color: '#064e3b', anchor: 'middle', z: zb + 7 });
    }
    return { pts: info, W };
  }
  const W = CH + 0.9, D = 12.8;
  s.poly([P(x0 + W, y0, 0, off), P(x0 + W, y0 + D, 0, off), P(x0 + W, y0 + D, H, off), P(x0 + W, y0, H, off)], SIDE, EDGE, zb + 1);
  s.poly([P(x0, y0, H, off), P(x0 + W, y0, H, off), P(x0 + W, y0 + D, H, off), P(x0, y0 + D, H, off)], TOP, EDGE, zb + 2);
  for (let i = 0; i < 12; i++) {
    const ya = y0 + D - 0.4 - (i + 1) + 0.08, yb = ya + 0.84, xa = x0 + 0.45, xb = xa + CH;
    s.poly([P(xa, ya, H, off), P(xb, ya, H, off), P(xb, yb, H, off), P(xa, yb, H, off)], i < n ? liquid(concs[i], mx, color) : '#f3f4f6', EDGE, zb + 3, 0.6);
    const yc = (ya + yb) / 2;
    info.push([x0 + 1.7, yc]);
    const [lx, ly] = P(x0 - 0.15, yc, H, off);
    s.text(String(i + 1), lx, ly, { size: 6.3, color: '#065f46', anchor: 'end', weight: 700, z: zb + 7 });
    if (i < n) {
      const [tx, ty] = P(x0 + 0.45 + CH * 0.72, yc, H, off);
      s.text(fmtc(concs[i]), tx, ty, { size: 5.6, anchor: 'middle', z: zb + 4 });
    }
  }
  s.poly([P(x0, y0, 0, off), P(x0 + W, y0, 0, off), P(x0 + W, y0, H, off), P(x0, y0, H, off)], FRONT, EDGE, zb + 6);
  return { pts: info, W };
}

function plate(s, P, x0, y0, { fillsRow, fillsCol, off = [0, 0], zb = 0, ghost = false, baseCols, blueCols = 1, nC = 12 } = {}) {
  s.poly([P(x0 + PW, y0, 0, off), P(x0 + PW, y0 + PD, 0, off), P(x0 + PW, y0 + PD, PH, off), P(x0 + PW, y0, PH, off)], '#cfd4dc', GREY, zb + 1, 0.8);
  s.poly([P(x0, y0, PH, off), P(x0 + PW, y0, PH, off), P(x0 + PW, y0 + PD, PH, off), P(x0, y0 + PD, PH, off)], '#f9fafb', GREY, zb + 2, 0.8);
  const wells = {};
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 12; c++) {
      let fc = baseCols && c < nC ? baseCols[c] : 'white';
      if (!ghost && fillsRow && r === 0) fc = fillsRow[c] || 'white';
      const wx = x0 + 0.7 + c, wy = y0 + 0.8 + (7 - r);
      const [sx, sy] = P(wx, wy, PH, off);
      s.ellipse(sx, sy, 0.36, 0.17, fc, '#9ca3af', zb + 3, 0.5);
      if (!ghost && fillsCol && c < blueCols && fillsCol[r]) s.ellipse(sx, sy, 0.23, 0.11, fillsCol[r], 'none', zb + 3.1, 0);
      wells[`${r},${c}`] = [wx, wy];
    }
  }
  s.poly([P(x0, y0, 0, off), P(x0 + PW, y0, 0, off), P(x0 + PW, y0, PH, off), P(x0, y0, PH, off)], '#e5e7eb', GREY, zb + 6, 0.8);
  return wells;
}

function cone(s, sx, sy, col, z = 9) {
  s.poly([[sx - 0.21, sy + CONE], [sx + 0.21, sy + CONE], [sx + 0.06, sy], [sx - 0.06, sy]], '#f9fafb', GREY, z, 0.6);
  s.poly([[sx - 0.14, sy + 1.0], [sx + 0.14, sy + 1.0], [sx + 0.05, sy + 0.03], [sx - 0.05, sy + 0.03]], col, 'none', z + 0.1, 0);
}

function body(s, xc, yb, accent, w = 1.1, label, z = 10) {
  s.rrect(xc - w / 2 - 0.2, yb + 0.55, w + 0.4, 0.9, '#9aa3b2', INK, 0.7, 0.12, z);
  s.rrect(xc - w / 2, yb + 1.35, w, 2.5, '#2d3748', INK, 0.7, 0.12, z);
  s.rrect(xc - w / 2, yb + 1.75, w, 0.45, accent, INK, 0.7, 0.05, z + 0.1);
  s.rrect(xc - 0.3, yb + 2.5, 0.6, 0.7, '#e5e7eb', INK, 0.7, 0.05, z + 0.1);
  s.poly([[xc + w / 2, yb + 2.9], [xc + w / 2 + 0.6, yb + 2.6], [xc + w / 2 + 0.6, yb + 2.25], [xc + w / 2, yb + 2.35]], '#9aa3b2', INK, z, 0.7);
  s.rrect(xc - 0.22, yb + 3.85, 0.44, 0.5, '#f3f4f6', INK, 0.7, 0.06, z);
  s.rrect(xc - 0.4, yb + 4.3, 0.8, 0.3, accent, INK, 0.7, 0.1, z + 0.1);
  if (label) s.text(label, xc + w / 2 + 0.9, yb + 3.6, { anchor: 'start', z: z + 1 });
}

function pipetteX(s, P, pts, zend, cols, accent, off, label) {
  const sxs = pts.map(([x, y]) => P(x, y, zend, off));
  sxs.forEach(([sx, sy], i) => cone(s, sx, sy, cols[i]));
  const yb = sxs[0][1] + CONE;
  const xl = sxs[0][0] - 0.45, xr = sxs[sxs.length - 1][0] + 0.45;
  s.rrect(xl, yb, xr - xl, 0.55, '#4b5563', INK, 0.7, 0.12, 11);
  body(s, (xl + xr) / 2, yb, accent, 1.1, label);
}

function pipetteY(s, P, pts, zend, cols, accent, off, label) {
  const sxs = pts.map(([x, y]) => P(x, y, zend, off));
  sxs.map((p, i) => [p, cols[i]]).sort((a, b) => b[0][1] - a[0][1]).forEach(([[sx, sy], c]) => cone(s, sx, sy, c));
  const s0 = sxs[0], s1 = sxs[sxs.length - 1];
  const b0 = [s0[0], s0[1] + CONE + 0.28], b1 = [s1[0], s1[1] + CONE + 0.28];
  s.line(b0, b1, INK, 9.5, 11, 'round');
  s.line(b0, b1, '#4b5563', 7.5, 11.1, 'round');
  body(s, (b0[0] + b1[0]) / 2, (b0[1] + b1[1]) / 2 - 0.28, accent, 0.9, label);
}

function tube(s, sx, sy, col, w = 0.62, h = 1.9, z = 12) {
  s.poly([[sx - w / 2, sy + h], [sx + w / 2, sy + h], [sx + w / 2, sy + 0.6], [sx + 0.08, sy], [sx - 0.08, sy], [sx - w / 2, sy + 0.6]], 'white', GREY, z, 0.7);
  s.poly([[sx - w / 2 + 0.04, sy + 1.05], [sx + w / 2 - 0.04, sy + 1.05], [sx + w / 2 - 0.04, sy + 0.6], [sx + 0.075, sy + 0.03], [sx - 0.075, sy + 0.03], [sx - w / 2 + 0.04, sy + 0.6]], col, 'none', z + 0.1, 0);
  s.rrect(sx - w / 2 - 0.03, sy + h, w + 0.06, 0.26, '#9ca3af', GREY, 0.6, 0.07, z + 0.2);
}

function setup(s, letter, title) {
  s.text(letter, 0, s.H - 0.3, { size: 11, weight: 700, base: 'central' });
  s.text(title, 0.8, s.H - 0.3, { size: 7.6, weight: 700 });
}

const LEFT = [0.26, 0.19], RIGHT = [0.2, 0.36];
const X0 = 0.4, Y0 = 1.2;
const PAD = '#e5e7eb';

function Panel({ w = 17.6, h = 12.2, children }) {
  const s = scene(w, h);
  children(s);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 'auto', display: 'block', marginTop: 8 }} role="img">
      {s.render()}
    </svg>
  );
}

export function LoadingFigure({ colConcs, rowConcs, colName, rowName }) {
  const nC = colConcs.length, nR = rowConcs.length;
  const cmx = Math.max(...colConcs, 1e-9), rmx = Math.max(...rowConcs, 1e-9);
  const cC = colConcs.map((c) => liquid(c, cmx, VE));
  const rC = rowConcs.map((c) => liquid(c, rmx, BL));
  const cCpad = Array.from({ length: 12 }, (_, i) => cC[i] || PAD);
  const rCpad = Array.from({ length: 8 }, (_, i) => rC[i] || PAD);
  const lastRow = String.fromCharCode(64 + nR);
  const blueCols = Math.min(6, nC);

  const A = () => (
    <Panel>{(s) => {
      const P = makeProj(...LEFT);
      setup(s, 'a', 'Pour each tube into one channel');
      const R = reservoir(s, P, X0, Y0, colConcs, VE, 'x');
      R.pts.slice(0, nC).forEach(([x, y], i) => {
        const [sx, sy] = P(x, y, H + 3.2);
        tube(s, sx, sy, cC[i]);
        s.arrow([sx, sy - 0.1], P(x, y, H + 0.15));
      });
      const last = R.pts[nC - 1], q = P(last[0], last[1], H + 4.6);
      s.callout('working tubes', [q[0] + 0.3, q[1]], [12.6, 10.2]);
      s.callout('12-well reservoir', P(X0 + 12.8, Y0 + 3, H * 0.5), [12.3, 0.3]);
    }}</Panel>
  );
  const B = () => (
    <Panel>{(s) => {
      const P = makeProj(...LEFT);
      setup(s, 'b', 'Aspirate: one tip per channel');
      const R = reservoir(s, P, X0, Y0, colConcs, VE, 'x');
      pipetteX(s, P, R.pts, H - 0.05, cCpad, VE, [0, 0], '12-channel pipette');
      const q = P(R.pts[0][0], R.pts[0][1], H + 1.2);
      s.callout('tips', [q[0] - 0.2, q[1]], [0.0, 6.2]);
    }}</Panel>
  );
  const C = () => (
    <Panel>{(s) => {
      const P = makeProj(...LEFT);
      setup(s, 'c', `Dispense row A, then B … ${lastRow}, then the next plates`);
      [2, 1].forEach((k) => plate(s, P, X0, Y0, { off: [0.7 * k, 0.8 * k], zb: -20 * k, ghost: true }));
      const Wl = plate(s, P, X0, Y0, { fillsRow: cCpad.map((c, i) => (i < nC ? c : 'white')) });
      pipetteX(s, P, Array.from({ length: 12 }, (_, c) => Wl[`0,${c}`]), PH + 0.05, cCpad, VE, [0, 0], '12-channel pipette');
      s.callout('plates 2, 3 …', P(X0 + PW, Y0 + PD * 0.7, PH * 0.5, [2.0, 1.6]), [14.2, 10.4]);
    }}</Panel>
  );
  const D = () => (
    <Panel>{(s) => {
      const P = makeProj(...RIGHT);
      setup(s, 'd', 'Pour each tube into one channel');
      const R = reservoir(s, P, 2.4, Y0, rowConcs, BL, 'y');
      let sx = 0;
      for (let i = 0; i < nR; i++) {
        sx = 2.4 + i * 1.35;
        tube(s, sx, 9.0, rC[i]);
        s.text(fmtc(rowConcs[i]), sx, 8.72, { size: 5.6, color: '#374151', anchor: 'middle', base: 'hanging' });
      }
      s.arrow([5.9, 8.3], [5.9, 7.55], 1.6, 0.4);
      s.text('tube i → channel i', 6.35, 7.95, {});
      s.callout(`${nR} working tubes`, [sx + 0.2, 10.4], [13.2, 11.0]);
      s.callout('second reservoir', P(2.4 + R.W, Y0 + 5, H * 0.5), [12.0, 0.5]);
    }}</Panel>
  );
  const E = () => (
    <Panel>{(s) => {
      const P = makeProj(...RIGHT);
      setup(s, 'e', `Aspirate: ${nR} tips`);
      const R = reservoir(s, P, 2.4, Y0, rowConcs, BL, 'y');
      pipetteY(s, P, R.pts.slice(0, 8), H - 0.05, rCpad, BL, [0, 0], `${nR}-tip pipette`);
      if (nR < 12) s.callout(`channels ${nR + 1}–12 stay empty`, P(2.4 + 3.5, Y0 + 1.6, H), [8.2, 0.45]);
    }}</Panel>
  );
  const F = () => (
    <Panel>{(s) => {
      const P = makeProj(...RIGHT);
      setup(s, 'f', `Dispense column 1, then 2 … ${nC}, then the next plates`);
      [2, 1].forEach((k) => plate(s, P, X0, Y0, { off: [0.7 * k, 0.8 * k], zb: -20 * k, ghost: true, baseCols: cC, nC }));
      const Wl = plate(s, P, X0, Y0, { fillsCol: rC, baseCols: cC, blueCols, nC });
      const pts = Array.from({ length: 8 }, (_, r) => Wl[`${r},${blueCols - 1}`]);
      pipetteY(s, P, pts, PH + 0.05, rCpad, BL, [0, 0], `${nR}-tip pipette`);
      [[0, 'A'], [7, 'H']].forEach(([r, l]) => {
        const [lx, ly] = P(X0 + 0.12, pts[r][1], PH);
        s.text(l, lx, ly, { size: 6.2, color: '#374151', anchor: 'middle', weight: 700, z: 5 });
      });
      s.callout('plates 2, 3 …', P(X0 + PW, Y0 + PD * 0.7, PH * 0.5, [1.4, 1.6]), [14.4, 10.6]);
      s.callout(blueCols > 1 ? `columns 1–${blueCols - 1} done; column ${blueCols} now` : 'column 1 now', P(X0 + 0.7 + 2, Y0 + 0.8 + 1, PH), [0.4, 0.2]);
      s.callout('column drug only', P(X0 + 0.7 + 9, Y0 + 0.8 + 2, PH), [9.3, 0.2]);
    }}</Panel>
  );
  const G = () => (
    <Panel w={35.2} h={10.6}>{(s) => {
      s.text('g', 0, 10.2, { size: 11, weight: 700 });
      s.text('Inoculum last: Petri dish, 12 tips, one row per pass', 0.8, 10.2, { size: 7.6, weight: 700 });
      const cx = 17.6, cy = 2.9, dw = 16.7, dh = dw * 0.3;
      s.ellipse(cx, cy, dw / 2, dh / 2, '#e5e7eb', GREY, 1, 0.8);
      s.poly([[cx - dw / 2, cy], [cx - dw / 2, cy + 0.55], [cx + dw / 2, cy + 0.55], [cx + dw / 2, cy]], '#f3f4f6', GREY, 1, 0.8);
      s.ellipse(cx, cy + 0.55, dw / 2, dh / 2, '#f9fafb', GREY, 2, 0.8);
      s.ellipse(cx, cy + 0.5, (dw - 0.5) / 2, (dh - 0.4) / 2, tint(GR, 0.5), tint(GR, 0.9), 3, 0.6);
      for (let i = 0; i < 12; i++) cone(s, cx - 5.5 + i, cy + 0.8, tint(GR, 0.5), 9);
      s.rrect(cx - 5.95, cy + 0.8 + CONE, 11.9, 0.55, '#4b5563', INK, 0.7, 0.12, 11);
      body(s, cx, cy + 0.8 + CONE, GR, 1.1, '12-channel pipette');
      s.callout('150-mm Petri dish', [cx + dw / 2 - 0.8, cy], [cx + dw / 2 + 1.0, 1.4]);
      s.text('(or a single-well trough)', cx + dw / 2 + 1.0, 0.6, { z: 30, halo: true });
    }}</Panel>
  );

  const head = (color, text) => (
    <div style={{ fontSize: 11, fontWeight: 700, color, letterSpacing: 0.3, margin: '0 0 2px' }}>{text}</div>
  );
  return (
    <div style={{ margin: '10px 0' }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
          {head(VE, `${colName} · across columns · 12 tips`)}
          <A /><B /><C />
        </div>
        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
          {head(BL, `${rowName} · down rows · ${nR} tips`)}
          <D /><E /><F />
        </div>
      </div>
      <G />
      <div style={{ fontSize: 11, color: GREY, marginTop: 4, lineHeight: 1.5 }}>
        Schematic, drawn to scale (1 unit = 9 mm). Colour depth shows concentration; numbers are final concentrations in the well (µg/mL); the drug-free well is plain broth.
      </div>
    </div>
  );
}
