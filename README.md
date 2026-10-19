# SRS Network Intelligence Hub

A single-file, offline web console for the SRS Distribution managed network service, operated by Movate. It is the working screen for the NOC, network engineers, StoreOps, field technicians, the M&A integration team and Security.

**Everything runs in the browser with sample data.** Fleet totals match the SRS RFP inventory (900 branches, 933 EdgeConnect EC-XS, 4,075 devices, 1,800 circuits) and the 6-month ticket history. Per-branch placement, firmware, serials, schedules and trend histories are illustrative and are labelled as such on screen.

> Demonstration console. Fleet totals follow the RFP inventory; branch names, per-branch figures, incidents and runbook code are illustrative.

## What is in it

| Area | Screens |
|---|---|
| Start here | Live Demos: 19 scripted demos. Each plays on one screen showing every system involved (Detect → Correlate → Decide → Act → Verify → Record), with a Business view and a Technical view explanation, and replays into the live console |
| Operate | Operations Overview (all 900 branches on the map), Branch 360, Branch Readiness, Live Incidents, Network Graph |
| Manage | Device & Circuit Inventory, Lifecycle & Vulnerabilities, Carrier Management, Field Dispatch, Approvals & Changes |
| Grow | Branch-in-a-Box (greenfield and acquired branches, cutover weekend gates, Day-1 parity) |
| Improve | Predictive Watchlist, Knowledge, Automation Library |
| Govern | SLA & KPI Tracker (Annexure B), Reports |

Filter everything by Region › City › Branch › Brand. Switch role (NOC Engineer, Network Engineer L3, StoreOps Lead, Branch Manager, Field Technician, M&A Integration Lead, Security Lead) from the header; each role has its own landing page and suggested questions for "Ask Mova iO".

Vulnerability data is matched against public HPE Aruba Networking bulletins HPESBNW04712, HPESBNW05027 and HPESBNW04943, plus the Aruba 2530 end-of-sale notice. The 2530 end-of-support date and the CX fixed build are estimates; confirm with HPE.

## Build

Requires Node 18 or newer.

```bash
npm ci
npm run build        # writes dist/SRS-Network-Intelligence-Hub.html (self-contained, ~0.9 MB)
```

Open the HTML file directly in a browser. No server and no network calls are needed.

`npm run map` regenerates `src/mapdata.json` (projected US and Canada outlines and branch city points) from `src/cities.mjs`.

## Publishing

`.github/workflows/pages.yml` builds on every push to `main` and publishes the page to GitHub Pages. Turn it on once in **Settings → Pages → Build and deployment → Source: GitHub Actions**. Note: a Pages site is reachable by anyone with the link, even from a private repository (except on GitHub Enterprise with private Pages).

## Source layout

| File | Purpose |
|---|---|
| `src/data.js` | Branches, devices, circuits, incidents, carriers, SLA metrics, advisories and lifecycle |
| `src/live.jsx`, `src/liveui.jsx` | Live engine: 2-second telemetry stream, incidents that arrive and resolve, live charts |
| `src/scenarios.js`, `src/demos.js` | Scripted demos, their story cards and console steps |
| `src/stagedata.js` | Per-demo stage scripts: telemetry, alerts, evidence, runbook, checks, business and technical explanation |
| `src/stage.jsx` | The demo stage player and the explanation panel |
| `src/mod_*.jsx` | One file per screen |
| `src/predict.js`, `src/viz.jsx` | Forecasts and predictive / preventive panels |
| `src/charts.jsx`, `src/ui.jsx` | Chart and UI components |
| `build.mjs` | esbuild + Tailwind, inlined into one HTML file |
