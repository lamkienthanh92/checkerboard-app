// DiagramView.jsx — stock ladder (primary → secondary → tertiary → …), working tubes and plates

function fmt(n, dec = 2) {
  if (n === undefined || n === null || isNaN(n)) return "—";
  return parseFloat(n.toFixed(dec));
}
function hexToRgb(h) {
  if (!h) return [180, 180, 180];
  if (h.startsWith("rgb")) {
    const m = h.match(/\d+/g);
    return m ? [+m[0], +m[1], +m[2]] : [180, 180, 180];
  }
  return [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
}
function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}
function interp(c1, c2, t) {
  const [r1, g1, b1] = hexToRgb(c1),
    [r2, g2, b2] = hexToRgb(c2);
  return `rgb(${lerp(r1, r2, t)},${lerp(g1, g2, t)},${lerp(b1, b2, t)})`;
}

const STOCK_COLORS = [
  "#3b82f6",
  "#f59e0b",
  "#10b981",
  "#8b5cf6",
  "#ec4899",
  "#f97316",
];
const STOCK_LIGHTS = [
  "#dbeafe",
  "#fef3c7",
  "#d1fae5",
  "#ede9fe",
  "#fce7f3",
  "#ffedd5",
];
const STOCK_NAMES = [
  "Primary",
  "Secondary",
  "Tertiary",
  "Quaternary",
  "Quinary",
  "Senary",
];

// ── Falcon tube ──────────────────────────────────────────────────────────────
function Falcon({
  x,
  y,
  w = 34,
  color = "#fbbf24",
  capColor,
  label,
  sublabel,
  lines = [],
  warning = false,
}) {
  const capH = 10,
    neckW = w * 0.44,
    bodyH = 60,
    tipH = 13,
    cx = w / 2;
  const cc = capColor || color;
  const totalH = capH + 4 + bodyH + tipH;
  return (
    <g transform={`translate(${x},${y})`}>
      {warning && (
        <rect
          x={-4}
          y={-4}
          width={w + 8}
          height={totalH + 30}
          rx={6}
          fill="#fef2f2"
          stroke="#fca5a5"
          strokeWidth={1}
          strokeDasharray="3 2"
        />
      )}
      <rect
        x={cx - neckW / 2}
        y={0}
        width={neckW}
        height={capH}
        rx={3}
        fill={cc}
        stroke="#555"
        strokeWidth={0.6}
      />
      <rect
        x={cx - neckW / 2 - 1}
        y={capH}
        width={neckW + 2}
        height={4}
        fill={cc}
        opacity={0.8}
      />
      <rect
        x={0}
        y={capH + 4}
        width={w}
        height={bodyH}
        rx={4}
        fill="rgba(255,255,255,0.55)"
        stroke="#aaa"
        strokeWidth={0.7}
      />
      <rect
        x={2}
        y={capH + 8}
        width={w - 4}
        height={bodyH - 16}
        rx={3}
        fill={color}
        opacity={0.38}
      />
      {[0.28, 0.56, 0.84].map((f, i) => (
        <line
          key={i}
          x1={w - 5}
          y1={capH + 8 + (bodyH - 16) * f}
          x2={w - 2}
          y2={capH + 8 + (bodyH - 16) * f}
          stroke="#ccc"
          strokeWidth={0.5}
        />
      ))}
      <polygon
        points={`2,${capH + 4 + bodyH} ${w - 2},${capH + 4 + bodyH} ${cx},${
          capH + 4 + bodyH + tipH
        }`}
        fill="rgba(200,200,200,0.4)"
        stroke="#aaa"
        strokeWidth={0.6}
      />
      {lines.map((ln, i) => (
        <text
          key={i}
          x={cx}
          y={capH + 18 + i * 10}
          textAnchor="middle"
          fontSize={6.5}
          fill={i === 0 ? "#1e40af" : "#7c3aed"}
        >
          {ln}
        </text>
      ))}
      <text
        x={cx}
        y={totalH + 13}
        textAnchor="middle"
        fontSize={8.5}
        fontWeight={700}
        fill={warning ? "#b91c1c" : "#1f2937"}
      >
        {label}
      </text>
      {sublabel && (
        <text
          x={cx}
          y={totalH + 23}
          textAnchor="middle"
          fontSize={7.5}
          fill="#6b7280"
        >
          {sublabel}
        </text>
      )}
    </g>
  );
}

// ── 96-well plate ────────────────────────────────────────────────────────────
function Plate({ x, y, cs = 4.5, gap = 1.4, colorFn }) {
  const cols = 12,
    rows = 8,
    W = cols * (cs + gap),
    H = rows * (cs + gap);
  return (
    <g>
      <rect
        x={x - 5}
        y={y - 7}
        width={W + 10}
        height={H + 12}
        rx={3}
        fill="#f9fafb"
        stroke="#d1d5db"
        strokeWidth={0.6}
      />
      {Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => (
          <circle
            key={`${r}-${c}`}
            cx={x + c * (cs + gap) + cs / 2}
            cy={y + r * (cs + gap) + cs / 2}
            r={cs / 2}
            fill={colorFn ? colorFn(r, c) : "#e5e7eb"}
            stroke="#e5e7eb"
            strokeWidth={0.2}
          />
        ))
      )}
      {Array.from({ length: cols }, (_, c) => (
        <text
          key={c}
          x={x + c * (cs + gap) + cs / 2}
          y={y - 3}
          textAnchor="middle"
          fontSize={4.5}
          fill="#9ca3af"
        >
          {c + 1}
        </text>
      ))}
      {Array.from({ length: rows }, (_, r) => (
        <text
          key={r}
          x={x - 2}
          y={y + r * (cs + gap) + cs / 2 + 1.5}
          textAnchor="end"
          fontSize={4.5}
          fill="#9ca3af"
        >
          {String.fromCharCode(65 + r)}
        </text>
      ))}
    </g>
  );
}

function Arr({
  x1,
  y1,
  x2,
  y2,
  dashed,
  markerId = "arrDef",
  stroke = "#9ca3af",
  w = 1,
}) {
  return (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke={stroke}
      strokeWidth={w}
      strokeDasharray={dashed ? "4 2" : undefined}
      markerEnd={`url(#${markerId})`}
    />
  );
}

function SectionBox({ x, y, w, h, color, label }) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={8}
        fill={color + "0d"}
        stroke={color + "55"}
        strokeWidth={1}
        strokeDasharray="5 3"
      />
      <text x={x + 10} y={y - 5} fontSize={9} fontWeight={700} fill={color}>
        {label}
      </text>
    </g>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function DiagramView({
  results,
  plateVol,
  abFrac,
  bacFrac,
  numPlates,
  volAbPerWell,
  volBacPerWell,
  minVolUl,
  bufferPct,
}) {
  if (!results) return null;
  const { abResults } = results;
  const variableAbs = abResults.filter((r) => r.type === "variable");
  const fixedAbs = abResults.filter((r) => r.type === "fixed");

  const AB_COLORS = [
    "#f59e0b",
    "#10b981",
    "#3b82f6",
    "#ec4899",
    "#8b5cf6",
    "#f97316",
  ];
  const AB_DARK = [
    "#92400e",
    "#065f46",
    "#1e40af",
    "#831843",
    "#4c1d95",
    "#7c2d12",
  ];

  // Layout
  const FW = 44,
    FH_TOTAL = 10 + 4 + 60 + 13,
    FLABEL = 26,
    F_SLOT_H = FH_TOTAL + FLABEL;
  const FSLOT = FW + 16; // horizontal spacing between adjacent falcons in a group
  const CS = 4.5,
    CGAP = 1.4,
    PW = 12 * (CS + CGAP),
    PH = 8 * (CS + CGAP);
  const MARGIN = 30;

  // Y positions
  // Row 0: stock ladder (primary, secondary, tertiary...) — each level stacked vertically
  const STOCK_ROW_H = F_SLOT_H + 36; // height of each stock row
  const getStockY = (level) => 48 + level * STOCK_ROW_H;

  // We'll compute max stock levels across all abs
  const maxLevels = Math.max(
    1,
    ...variableAbs.map((r) => (r.ladder ? r.ladder.stocks.length : 1))
  );
  const ROW_FALCONS = getStockY(maxLevels) + 16;
  const ROW_PLATE1 = ROW_FALCONS + F_SLOT_H + 44;
  const ROW_PLATE2 = ROW_PLATE1 + PH + 40;
  const SVG_H = ROW_PLATE2 + PH + 44;

  // Build sections
  let sections = [],
    curX = MARGIN + 16;
  variableAbs.forEach((r, ai) => {
    const color = AB_COLORS[ai % AB_COLORS.length];
    const dark = AB_DARK[ai % AB_DARK.length];
    const nF = r.series?.length || 0;
    const ladder = r.ladder;
    const nStocks = ladder ? ladder.stocks.length : 1;

    // Stock chain: each stock below the previous, left-aligned
    const stockX = curX; // x for all stocks in chain (vertically stacked)

    // Falcons start after the stock chain + gap
    const falconsStartX = stockX + FW + 36;
    const falconsEndX = falconsStartX + nF * FSLOT - (FSLOT - FW);
    const falconsCX = (falconsStartX + falconsEndX) / 2;
    const plateX = falconsCX - PW / 2;
    const sectionRight = Math.max(falconsEndX, plateX + PW) + MARGIN;

    sections.push({
      r,
      ai,
      color,
      dark,
      stockX,
      falconsStartX,
      falconsEndX,
      plateX,
      sectionRight,
    });
    curX = sectionRight;
  });

  const BAC_X = curX + 8;
  const SVG_W = BAC_X + FW * 2 + 130 + MARGIN;

  function makePlateColor(r) {
    return (row, col) => {
      // Color each well by which stock it came from
      const n = r.series?.length || 1;
      const idx = r.axis === "row" ? row : col;
      if (idx >= n) return "#f3f4f6";
      const f = r.ladder?.falcons[idx];
      const si = f?.stockIdx || 0;
      const lightColor = STOCK_LIGHTS[si % STOCK_LIGHTS.length];
      const darkColor = STOCK_COLORS[si % STOCK_COLORS.length];
      const t = idx / Math.max(n - 1, 1);
      return interp(lightColor, darkColor, t * 0.7);
    };
  }
  function blendBac(base, t) {
    const [r1, g1, b1] = hexToRgb(base);
    return `rgb(${lerp(r1, 134, t)},${lerp(g1, 239, t)},${lerp(b1, 172, t)})`;
  }

  return (
    <div
      style={{
        overflowX: "auto",
        background: "#fff",
        borderRadius: 10,
        border: "1px solid #e5e7eb",
        padding: "16px 20px",
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>
        Dilution and plate-loading diagram
      </div>
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 14 }}>
        Stock ladder: Primary → Secondary → Tertiary… · Each working tube is{" "}
        made <b>independently</b> from its stock
      </div>

      <svg
        width={SVG_W}
        height={SVG_H}
        style={{ display: "block", minWidth: 500 }}
      >
        <defs>
          {[
            ...STOCK_COLORS.map((c, i) => [`arr${i}`, c]),
            ["arrGreen", "#4ade80"],
            ["arrGray", "#9ca3af"],
          ].map(([id, fill]) => (
            <marker
              key={id}
              id={id}
              markerWidth={6}
              markerHeight={6}
              refX={5}
              refY={3}
              orient="auto"
            >
              <path d="M0,0 L0,6 L6,3 z" fill={fill} />
            </marker>
          ))}
        </defs>

        {/* ═══ ANTIBIOTIC SECTIONS ═══ */}
        {sections.map((sec) => {
          const { r, color, dark, stockX, falconsStartX, falconsEndX, plateX } =
            sec;
          const ladder = r.ladder;
          if (!ladder) return null;
          const nF = r.series?.length || 0;
          const nStocks = ladder.stocks.length;

          const boxX = stockX - 10;
          const boxW = sec.sectionRight - boxX - MARGIN + 10;

          return (
            <g key={r.id}>
              <SectionBox
                x={boxX}
                y={getStockY(0) - 22}
                w={boxW}
                h={SVG_H - getStockY(0) + 16}
                color={color}
                label={`${r.name}  ${r.axis === "row" ? "↕ rows" : "↔ columns"}`}
              />

              {/* ── STOCK CHAIN (vertical) ── */}
              {ladder.stocks.map((s, si) => {
                const sc = STOCK_COLORS[si % STOCK_COLORS.length];
                const sy = getStockY(si);
                const midY = sy + FH_TOTAL / 2;
                const prevMidY =
                  si > 0 ? getStockY(si - 1) + FH_TOTAL / 2 : null;

                return (
                  <g key={si}>
                    {/* Arrow from previous stock down to this one */}
                    {si > 0 && (
                      <>
                        <Arr
                          x1={stockX + FW / 2}
                          y1={getStockY(si - 1) + FH_TOTAL + FLABEL}
                          x2={stockX + FW / 2}
                          y2={sy - 16}
                          stroke={sc}
                          markerId={`arr${si % STOCK_COLORS.length}`}
                          w={1.2}
                        />
                        <text
                          x={stockX + FW + 4}
                          y={getStockY(si - 1) + FH_TOTAL + FLABEL + 14}
                          fontSize={7}
                          fill={sc}
                          fontWeight={600}
                        >
                          dilute
                        </text>
                      </>
                    )}

                    {/* Stock label */}
                    <text
                      x={stockX + FW / 2}
                      y={sy - 6}
                      textAnchor="middle"
                      fontSize={8}
                      fontWeight={700}
                      fill={sc}
                    >
                      {s.name}
                    </text>

                    {/* Falcon icon */}
                    <Falcon
                      w={FW}
                      x={stockX}
                      y={sy}
                      color={STOCK_LIGHTS[si % STOCK_LIGHTS.length]}
                      capColor={sc}
                      warning={!!r.volWarning && si === 0}
                      label={`${fmt(s.conc)} µg/mL`}
                      sublabel={
                        si === 0
                          ? `${r.powderMg}mg/${r.dissolveVolMl}mL`
                          : `${fmt(s.fromPrev_uL, 1)}µL+${fmt(
                              s.camhb_mL * 1000,
                              1
                            )}µL`
                      }
                      lines={
                        si === 0
                          ? [
                              `${r.powderMg}mg powder`,
                              `${r.dissolveVolMl}mL solvent`,
                            ]
                          : [
                              `${fmt(s.fromPrev_uL, 1)}µL prev`,
                              `+${fmt(s.camhb_mL * 1000, 1)}µL CAM`,
                            ]
                      }
                    />

                    {/* Horizontal arrows from THIS stock → falcons that use it */}
                    {ladder.falcons
                      .filter((f) => f.stockIdx === si)
                      .map((f) => {
                        const fi = f.falconIdx - 1;
                        const fx = falconsStartX + fi * FSLOT;
                        const dstX = fx + FW / 2;
                        const dstY = ROW_FALCONS;
                        const srcX = stockX + FW;
                        const srcY = midY;
                        const cp1x = srcX + (falconsStartX - stockX - FW) * 0.5;
                        return (
                          <path
                            key={fi}
                            d={`M${srcX},${srcY} C${cp1x},${srcY} ${dstX},${
                              dstY - 20
                            } ${dstX},${dstY}`}
                            fill="none"
                            stroke={sc}
                            strokeWidth={0.8}
                            strokeDasharray="4 2"
                            markerEnd={`url(#arr${si % STOCK_COLORS.length})`}
                            opacity={0.7}
                          />
                        );
                      })}
                  </g>
                );
              })}

              {/* ── FALCON ROW LABEL ── */}
              <text
                x={falconsStartX}
                y={ROW_FALCONS - 8}
                fontSize={8}
                fill="#6b7280"
                fontWeight={500}
              >
                {nF} tubes × {fmt(ladder.workVolMl, 1)} mL — each made independently
              </text>

              {/* ── INDIVIDUAL FALCONS ── */}
              {ladder.falcons.map((f, i) => {
                const fi = f.falconIdx - 1;
                const fx = falconsStartX + fi * FSLOT;
                const si = f.stockIdx;
                const sc = STOCK_COLORS[si % STOCK_COLORS.length];
                const sl = STOCK_LIGHTS[si % STOCK_LIGHTS.length];

                // Color: blend within stock group
                const groupFalcons = ladder.falcons.filter(
                  (ff) => ff.stockIdx === si
                );
                const posInGroup = groupFalcons.findIndex(
                  (ff) => ff.falconIdx === f.falconIdx
                );
                const t = posInGroup / Math.max(groupFalcons.length - 1, 1);
                const fColor = interp(sl, sc, t * 0.8);

                const plateTargetX =
                  plateX +
                  (r.axis === "row" ? PW / 2 : i * (CS + CGAP) + CS / 2);

                return (
                  <g key={i}>
                    <Falcon
                      w={FW}
                      x={fx}
                      y={ROW_FALCONS}
                      color={fColor}
                      capColor={sc}
                      label={`${fmt(f.concInFalcon, 4)} µg/mL`}
                      sublabel={
                        f.volFromStock_uL >= 900
                          ? `${fmt(f.volFromStock_mL, 2)}mL`
                          : `${fmt(f.volFromStock_uL, 1)}µL`
                      }
                      lines={[
                        f.volFromStock_uL >= 900
                          ? `${fmt(f.volFromStock_mL, 2)}mL stk`
                          : `${fmt(f.volFromStock_uL, 1)}µL stk`,
                        `+${fmt(f.camhb_mL, 2)}mL CAM`,
                      ]}
                    />
                    {/* label badge */}
                    <rect
                      x={fx}
                      y={ROW_FALCONS + FH_TOTAL + FLABEL - 2}
                      width={FW}
                      height={13}
                      rx={4}
                      fill={sc}
                      opacity={0.8}
                    />
                    <text
                      x={fx + FW / 2}
                      y={ROW_FALCONS + FH_TOTAL + FLABEL + 8}
                      textAnchor="middle"
                      fontSize={8}
                      fontWeight={700}
                      fill="#fff"
                    >
                      {r.axis === "row" ? String.fromCharCode(65 + i) : i + 1}
                    </text>
                    {/* arrow to plate */}
                    <line
                      x1={fx + FW / 2}
                      y1={ROW_FALCONS + FH_TOTAL + FLABEL + 13}
                      x2={plateTargetX}
                      y2={ROW_PLATE1 - 4}
                      stroke={sc}
                      strokeWidth={0.7}
                      strokeDasharray="3 2"
                      markerEnd={`url(#arr${si % STOCK_COLORS.length})`}
                      opacity={0.6}
                    />
                  </g>
                );
              })}

              {/* ── PLATE: AB ── */}
              <text
                x={plateX + PW + 66}
                y={ROW_PLATE1 + 10}
                fontSize={8}
                fontWeight={600}
                fill="#374151"
                stroke="#fff"
                strokeWidth={3}
                paintOrder="stroke"
              >
                Plate — after drug loading
              </text>
              <Plate x={plateX} y={ROW_PLATE1} colorFn={makePlateColor(r)} />

              <line
                x1={plateX + PW / 2}
                y1={ROW_PLATE1 + PH + 8}
                x2={plateX + PW / 2}
                y2={ROW_PLATE2 - 5}
                stroke="#86efac"
                strokeWidth={1.5}
                markerEnd="url(#arrGreen)"
              />
              <rect
                x={plateX + PW + 4}
                y={ROW_PLATE1 + PH + 4}
                width={52}
                height={14}
                rx={4}
                fill="#dcfce7"
              />
              <text
                x={plateX + PW + 30}
                y={ROW_PLATE1 + PH + 14}
                textAnchor="middle"
                fontSize={8}
                fontWeight={600}
                fill="#15803d"
              >
                + inoculum
              </text>

              {/* ── PLATE: after bac ── */}
              <text
                x={plateX + PW + 12}
                y={ROW_PLATE2 + 10}
                fontSize={8}
                fontWeight={600}
                fill="#374151"
                stroke="#fff"
                strokeWidth={3}
                paintOrder="stroke"
              >
                Plate — after inoculum
              </text>
              <Plate
                x={plateX}
                y={ROW_PLATE2}
                colorFn={(row, col) =>
                  blendBac(makePlateColor(r)(row, col), 0.3)
                }
              />
            </g>
          );
        })}

        {/* ═══ BACTERIA SECTION ═══ */}
        {(() => {
          const bx = BAC_X,
            bx2 = bx + FW + 70;
          const midY = getStockY(0) + FH_TOTAL / 2;
          const FIX_DY = 22;
          const arrowY1 =
            getStockY(0) + FH_TOTAL + FLABEL + (fixedAbs.length ? FIX_DY + fixedAbs.length * 34 + 14 : 20);
          return (
            <g>
              <SectionBox
                x={bx - 10}
                y={getStockY(0) - 22}
                w={FW * 2 + 70 + 44}
                h={SVG_H - getStockY(0) + 16}
                color="#15803d"
                label="Inoculum"
              />
              <text
                x={bx + FW / 2}
                y={getStockY(0) - 6}
                textAnchor="middle"
                fontSize={8}
                fontWeight={600}
                fill="#15803d"
              >
                McFarland 0.5
              </text>
              <Falcon
                      w={FW}
                x={bx}
                y={getStockY(0)}
                color="#4ade80"
                label="1.5×10⁸ CFU/mL"
                sublabel="stock"
                lines={["McFarland 0.5", "stock"]}
              />
              <Arr
                x1={bx + FW}
                y1={midY}
                x2={bx2}
                y2={midY}
                stroke="#4ade80"
                markerId="arrGreen"
                w={1.2}
              />
              <text
                x={bx2 + FW / 2}
                y={getStockY(0) - 6}
                textAnchor="middle"
                fontSize={8}
                fontWeight={600}
                fill="#15803d"
              >
                Working susp.
              </text>
              <Falcon
                      w={FW}
                x={bx2}
                y={getStockY(0)}
                color="#86efac"
                label="~5×10⁵ CFU/mL"
                sublabel={`${
                  results.volMcFarlandMl
                    ? fmt(results.volMcFarlandMl * 1000, 1)
                    : "—"
                }µL stk`}
                lines={[
                  `${
                    results.volMcFarlandMl
                      ? fmt(results.volMcFarlandMl * 1000, 1)
                      : "—"
                  }µL stk`,
                  `+${
                    results.camhbForBacMl ? fmt(results.camhbForBacMl, 2) : "—"
                  }mL CAM`,
                ]}
              />
              {fixedAbs.length > 0 && (
                <g>
                  <rect
                    x={bx - 2}
                    y={getStockY(0) + FH_TOTAL + FLABEL + FIX_DY}
                    width={FW * 2 + 74}
                    height={fixedAbs.length * 34 + 14}
                    rx={6}
                    fill="#f5f3ff"
                    stroke="#c4b5fd"
                    strokeWidth={0.7}
                  />
                  <text
                    x={bx + 4}
                    y={getStockY(0) + FH_TOTAL + FLABEL + 12 + FIX_DY}
                    fontSize={8}
                    fontWeight={600}
                    fill="#7c3aed"
                  >
                    Fixed drug (added to inoculum)
                  </text>
                  {fixedAbs.map((fa, fi) => (
                    <g key={fa.id}>
                      <text
                        x={bx + 4}
                        y={getStockY(0) + FH_TOTAL + FLABEL + 25 + FIX_DY + fi * 32}
                        fontSize={8}
                        fontWeight={600}
                        fill="#5b21b6"
                      >
                        {fa.name}
                      </text>
                      <text
                        x={bx + 4}
                        y={getStockY(0) + FH_TOTAL + FLABEL + 36 + FIX_DY + fi * 32}
                        fontSize={7.5}
                        fill="#6b7280"
                      >
                        {fa.volNeededFromPrimaryMl
                          ? fmt(fa.volNeededFromPrimaryMl * 1000, 1)
                          : "—"}
                        µL ({fmt(fa.primaryStock)} µg/mL) → {fmt(fa.finalConc)}{" "}
                        µg/mL
                      </text>
                    </g>
                  ))}
                </g>
              )}
              {sections.map((sec) => (
                <line
                  key={sec.r.id}
                  x1={bx2 + FW / 2}
                  y1={arrowY1}
                  x2={sec.plateX + PW / 2}
                  y2={ROW_PLATE2 - 5}
                  stroke="#86efac"
                  strokeWidth={1}
                  strokeDasharray="5 3"
                  markerEnd="url(#arrGreen)"
                />
              ))}
              <text
                x={bx2 + FW / 2}
                y={getStockY(0) + FH_TOTAL + FLABEL + 13}
                textAnchor="middle"
                fontSize={8}
                fill="#15803d"
                fontWeight={600}
              >
                {fmt(volBacPerWell, 0)} µL/well
              </text>
            </g>
          );
        })()}

        {/* Row axis labels */}
        {[
          [getStockY(0) + FH_TOTAL / 2, "① Stock"],
          ...(maxLevels > 1
            ? [[getStockY(maxLevels - 1) + FH_TOTAL / 2, "⬇ Diluted stocks"]]
            : []),
          [ROW_FALCONS + FH_TOTAL / 2, "② Tubes"],
          [ROW_PLATE1 + PH / 2, "③ Plate(drug)"],
          [ROW_PLATE2 + PH / 2, "④ Plate(+inoculum)"],
        ].map(([y, txt]) => (
          <g key={txt}>
            <line
              x1={10}
              y1={y}
              x2={MARGIN + 2}
              y2={y}
              stroke="#e5e7eb"
              strokeWidth={0.6}
            />
            <text
              x={8}
              y={y + 1}
              textAnchor="middle"
              fontSize={7}
              fill="#9ca3af"
              transform={`rotate(-90,8,${y})`}
            >
              {txt}
            </text>
          </g>
        ))}

        {/* Legend */}
        <g transform={`translate(${MARGIN + 16},${SVG_H - 22})`}>
          {[
            ...STOCK_NAMES.slice(0, 3).map((n, i) => [
              STOCK_LIGHTS[i],
              STOCK_COLORS[i],
              n + " stock",
            ]),
            ["#86efac", null, "Inoculum"],
            ["#fca5a5", null, "Warning"],
          ].map(([fill, stroke, label], i) => (
            <g key={label} transform={`translate(${i * 100},0)`}>
              <rect
                x={0}
                y={0}
                width={10}
                height={10}
                rx={2}
                fill={fill}
                stroke={stroke || fill}
                strokeWidth={0.5}
              />
              <text x={14} y={9} fontSize={8} fill="#6b7280">
                {label}
              </text>
            </g>
          ))}
        </g>
      </svg>

      {/* Summary cards */}
      <div
        style={{ marginTop: 20, display: "flex", flexWrap: "wrap", gap: 10 }}
      >
        {sections.map((sec) => (
          <div
            key={sec.r.id}
            style={{
              border: `2px solid ${sec.color}`,
              borderRadius: 8,
              padding: "12px 14px",
              minWidth: 210,
              flex: "1 1 210px",
              background: "#fff",
            }}
          >
            <div
              style={{
                fontWeight: 700,
                fontSize: 13,
                color: sec.dark,
                marginBottom: 6,
              }}
            >
              {sec.r.name}
            </div>
            <div style={{ fontSize: 11, color: "#374151", lineHeight: 1.8 }}>
              {sec.r.ladder?.stocks.map((s, si) => (
                <div key={si}>
                  <span
                    style={{
                      display: "inline-block",
                      width: 70,
                      color: STOCK_COLORS[si % STOCK_COLORS.length],
                      fontWeight: 600,
                    }}
                  >
                    {s.name}:
                  </span>
                  <b>{fmt(s.conc)} µg/mL</b>
                  {si > 0 && (
                    <span style={{ color: "#9ca3af", fontSize: 10 }}>
                      {" "}
                      ({fmt(s.fromPrev_uL, 1)}µL prev +{" "}
                      {fmt(s.camhb_mL * 1000, 1)}µL CAM)
                    </span>
                  )}
                </div>
              ))}
              <div style={{ marginTop: 4 }}>
                {sec.r.series?.length} tubes × <b>{fmt(sec.r.ladder.workVolMl, 1)} mL</b> · Range:{" "}
                <b>
                  {sec.r.series?.[sec.r.series.length - 1]} →{" "}
                  {sec.r.series?.[0]} µg/mL
                </b>
              </div>
              {sec.r.volWarning && (
                <div
                  style={{ color: "#b91c1c", fontWeight: 600, marginTop: 4 }}
                >
                  ⚠️ Needs {fmt(sec.r.volWarning.neededPowderMg, 1)} mg powder (have{" "}
                  {fmt(sec.r.volWarning.availablePowderMg, 1)} mg)
                </div>
              )}
            </div>
          </div>
        ))}
        <div
          style={{
            border: "2px solid #86efac",
            borderRadius: 8,
            padding: "12px 14px",
            minWidth: 210,
            flex: "1 1 210px",
            background: "#fff",
          }}
        >
          <div
            style={{
              fontWeight: 700,
              fontSize: 13,
              color: "#15803d",
              marginBottom: 6,
            }}
          >
            Inoculum
          </div>
          <div style={{ fontSize: 11, color: "#374151", lineHeight: 1.8 }}>
            <div>
              Take <b>{fmt(results.volMcFarlandMl * 1000, 1)} µL</b> McFarland
              suspension
            </div>
            <div>
              + CAMHB: <b>{fmt(results.camhbForBacMl, 2)} mL</b>
            </div>
            <div>
              → Load: <b>{fmt(volBacPerWell, 0)} µL</b>/well
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}