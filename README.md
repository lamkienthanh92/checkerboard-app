# Checkerboard Assay Planner

A React + Vite tool for planning, running and analysing broth-microdilution **checkerboard** assays
(two titrated drugs plus optional fixed-concentration drugs).

## Features

| Tab / area | What it does |
| --- | --- |
| Plate and batch, Antibiotics, Inoculum | Inputs; the plan recalculates as you type and flags problems (drug shortage, tube too small, layout limits, sub-minimum pipetting volumes). |
| Summary, Stocks & tubes | Stock ladder (Primary → Secondary → Tertiary …) so every working tube is made with at least the minimum pipetting volume; tube volumes sized from plates × wells × volume + overage + dead volume; powder needed vs. available. |
| Inoculum | McFarland dilution including fixed-drug volume. |
| Plate layout | 8 × 12 map: drug-free row/column, drug-alone wells, growth control. |
| Diagram | Stock → tube → plate flow. |
| Protocol & export | Printable checklist; plan CSV; liquid-handler worklist CSV; Opentrons Python script (one plate per run). |
| FICI analysis | Import plate-reader OD (8 × 12 matrix or `row,col,od` table) or mark wells by hand; several replicates; MIC of each drug alone; interface wells; FIC of each drug; FICI min / mean / max with median and range across replicates; isobologram; excess over Bliss independence; results CSV. |
| Error simulation | Monte Carlo comparison of stock ladder, one-step and serial dilution against an error-free reference. |
| Header buttons | Save / load configuration (JSON); copy share link (plan inputs only). |

## Run

```bash
npm install
npm run dev      # development
npm test         # 28 unit tests (calculation, analysis, export, robot, simulation)
npm run build    # production build
```

## What the simulation shows (and does not show)

With the default illustrative pipetting error (about 0.7% CV at 50 µL), the way tubes are prepared does **not** measurably
change FICI variability: the two-fold readout dominates. Preparation only matters at error levels about ten times
larger, and even then the stock ladder is not better than serial dilution. The value of the ladder is practical
(pipettable volumes, right-sized tubes, drug-shortage checks), not a gain in FICI accuracy. Gross errors and biological
variability are not simulated. Replace the error model with your pipettes' specification before drawing conclusions.

## Assumptions and limits

- Concentrations in µg/mL; working tubes are (well volume / per-drug volume) × the final concentration.
- Drug mass is conserved: if the tool reports a shortage, more solvent does not help.
- Incubation conditions and time limits are not hard-coded; follow the current CLSI M07 / ISO 20776-1.
- FICI classes (≤ 0.5 synergy, > 0.5–4 no interaction, > 4 antagonism) are a common convention; state which FICI
  (min, mean, max) you report and use independent replicates.
- The Opentrons script was syntax-checked but not simulated or run on hardware.
- Not validated against laboratory measurements. Check first runs with a QC strain.
