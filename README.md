# SRS Networks Insights and Analytics Hub

Two self-contained, offline web pages: the operations console and the live demos. Both cover the SRS Distribution managed network service, operated by Movate. The console is the working screen for the NOC, network engineers, StoreOps, field technicians, the M&A integration team and Security.

**Everything runs in the browser with sample data.** Fleet totals match the SRS RFP inventory (900 branches, 933 EdgeConnect EC-XS, 4,075 devices, 1,800 circuits) and the 6-month ticket history. Per-branch placement, firmware, serials, schedules and trend histories are illustrative and are labelled as such on screen.

> Demonstration console. Fleet totals follow the RFP inventory; branch names, per-branch figures, incidents and runbook code are illustrative.

## Control modes

Every demo and runbook runs in one of three modes:

- **Autonomous**: acts on its own inside a policy people set and audit (people stay over the loop). For low-risk, easy-to-undo actions with confidence of 80% or more, no freeze window, and the branch closed or the device already down. Also anything that changes nothing on the network.
- **Human-on-the-loop**: acts on its own while a person watches and can stop it during a stop window (5 minutes in production, 10 seconds in the demo). For standard, pre-approved changes that should not wait.
- **Human-in-the-loop**: waits for a named person to approve. For confidence below 80%, changes during trading hours, security or fleet-wide changes, and anything that costs money.

## What is in it

| Area | Screens |
|---|---|
| Operate | Operations Overview (all 900 branches on the map, business services, error budgets, unified timeline), Live Operations, Correlation, Branch 360, Branch Readiness, Live Incidents, Network Graph |
| Manage | Device & Circuit Inventory, Lifecycle & Vulnerabilities, Carrier Management, Field Dispatch, Approvals & Changes |
| Grow | Branch-in-a-Box (greenfield and acquired branches, cutover weekend gates, Day-1 parity) |
| Improve | Predictive Watchlist, Knowledge, Mova iO Agents, Automation Library |
| Govern | SLA & KPI Tracker (Annexure B), Reports |

The **live demos** are a separate page (`demos/`), linked from the console header. Each scripted SRS branch situation plays on one screen showing every system involved (Detect → Correlate → Decide → Act → Verify → Record), with a Business view and a Technical view explanation. A demo links to the matching console screen, which opens in a new tab.

Filter everything by Region › City › Branch › Brand. Switch role (NOC Engineer, Network Engineer L3, StoreOps Lead, Branch Manager, Field Technician, M&A Integration Lead, Security Lead) from the header; each role has its own landing page and suggested questions for "Ask Mova iO".

Vulnerability data is matched against public HPE Aruba Networking bulletins HPESBNW04712, HPESBNW05027 and HPESBNW04943, plus the Aruba 2530 end-of-sale notice. The 2530 end-of-support date and the CX fixed build are estimates; confirm with HPE.

## Build

Requires Node 18 or newer.

```bash
npm ci
npm run build        # writes dist/site/index.html (console) and dist/site/demos/index.html (demos)
```

Open either file directly in a browser; the links between them work from disk too. No server and no network calls are needed. Both pages come from the same source: `src/edition.js` holds the name and the flag the build sets for the demos page.

`npm run map` regenerates `src/mapdata.json` (projected US and Canada outlines and branch city points) from `src/cities.mjs`.

## Publishing

`.github/workflows/pages.yml` builds on every push to `main` and publishes both pages to GitHub Pages: the console at the site root and the demos at `demos/`. Turn it on once in **Settings → Pages → Build and deployment → Source: GitHub Actions**. Note: a Pages site is reachable by anyone with the link, even from a private repository (except on GitHub Enterprise with private Pages).

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
