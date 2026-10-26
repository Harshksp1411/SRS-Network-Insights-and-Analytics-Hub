# SRS Network Insights and Analytics Hub

Three self-contained, offline web pages: the operations console, the live demos and the role-based morning briefs. Both cover the SRS Distribution managed network service, operated by Movate. The console is the working screen for the NOC, network engineers, StoreOps, field technicians, the M&A integration team and Security.

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

The **live demos** are a separate page (`demos/`) with its own link; the two pages do not link to each other. Each scripted SRS branch situation plays on one screen showing every system involved (Detect → Correlate → Decide → Act → Verify → Record), with a Business view and a Technical view explanation.

Filter everything by Region › City › Branch › Brand. Switch role (NOC Engineer, Network Engineer L3, StoreOps Lead, Branch Manager, Field Technician, M&A Integration Lead, Security Lead) from the header; each role has its own landing page and suggested questions for "Ask Mova iO".

Branches are numbered 1 to 900 across the estate, with their location in the name: "Branch 214 – Virginia Beach, VA" is BR-0214.

## Morning briefs (`briefs/`)

A third page, separate from the console and the demos: a two-minute newspaper front page for six roles, written in plain words from the same live data. Each role signs in and sees only its own edition (role-based access): the network weather, a headline, an illustrated front-page picture of the branch in the news, three things to know, four numbers at a glance, "Your day" (up to five changes, decisions, visits, carrier restore times, go-lives and freezes), four illustrated stories, a map of where the trouble is and the rest in brief. Detail stays out of the way: "Read the full story" opens the whole answer. "This week" and "This month" switch the edition, and the Daily, Weekly and Monthly buttons download the same edition, pictures included, as a short PDF generated in the browser. The nameplate and headline fonts load from Google Fonts; offline the page falls back to Georgia.

| Role | Username | Password |
|---|---|---|
| Chief Information Officer | `cio` | `Brief@CIO1` |
| Head of Networks | `head.networks` | `Brief@NET1` |
| Head of Stores & Branches | `head.stores` | `Brief@STR1` |
| Head of IT Service & NOC | `head.itservice` | `Brief@ITS1` |
| Head of Security | `head.security` | `Brief@SEC1` |
| Regional Manager, Southeast | `regional.se` | `Brief@REG1` |

The accounts are demo accounts shown on the sign-in screen: the page is static with sample data, so the sign-in shows how access is split by role; it is not a security control. Personas and their stories are in `src/briefs/personas.js`; each story is an Ask Mova iO question, so the brief, the PDFs and the console agree.

## Ask Mova iO

The assistant in the console header answers from the same live data as every screen: stores down or degraded, backup ISP, root cause by layer (network, ISP or application), changes and drift, NetFlow top talkers, flapping circuits and carrier SLA credits, auto-remediation, uptime and MTTR against target, capacity in the next 90 days, a copyable leadership summary, and any branch, incident, change, approval, work order, runbook, article, prediction, project, device, circuit, advisory or SLA metric by number. "Start here" lists the questions in walkthrough order. Questions can be typed in your own words and with typos ("why was 214 slow", "what got fixed automatically this week", "brach degarded"); a bare number names a branch.

Five branches carry scripted, connected stories so these answers are never empty (all illustrative):

| Branch | Story |
|---|---|
| 214 | Policy change CHG0031907 slowed ERP at opening; the change check rolled it back on its own and paused the wave |
| 73 | AT&T fibre cut; trading on the backup ISP with a carrier case open; the line flapped earlier in the month |
| 118 | AP firmware wave last night plus an unrecorded DHCP relay change (drift); handhelds lose addresses; rollback waits for approval |
| 45 | NetFlow top talkers: cloud camera backup and Windows Update during trading hours; WAN capacity forecast |
| 309 | Warehouse AP stopped answering; a port bounce fixed it with no human touch |

Vulnerability data is matched against public HPE Aruba Networking bulletins HPESBNW04712, HPESBNW05027 and HPESBNW04943, plus the Aruba 2530 end-of-sale notice. The 2530 end-of-support date and the CX fixed build are estimates; confirm with HPE.

## Build

Requires Node 18 or newer.

```bash
npm ci
npm run build        # writes dist/site/index.html (console), dist/site/demos/index.html (demos) and dist/site/briefs/index.html (briefs)
```

Open either file directly in a browser. No server and no network calls are needed. Both pages come from the same source: `src/edition.js` holds the name and the flag the build sets for the demos page.

`npm run map` regenerates `src/mapdata.json` (projected US and Canada outlines and branch city points) from `src/cities.mjs`.

## Publishing

`.github/workflows/pages.yml` builds on every push to `main` and publishes all three pages to GitHub Pages: the console at the site root, the demos at `demos/` and the briefs at `briefs/`. Turn it on once in **Settings → Pages → Build and deployment → Source: GitHub Actions**. Note: a Pages site is reachable by anyone with the link, even from a private repository (except on GitHub Enterprise with private Pages).

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
