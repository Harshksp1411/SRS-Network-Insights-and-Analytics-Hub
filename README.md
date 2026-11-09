# SRS Network Insights and Analytics Hub

Three self-contained, offline web pages: the operations console, the live demos and the real-time role-based dashboards. All cover the SRS Distribution managed network service, operated by Movate. The console is the working screen for the NOC, network engineers, StoreOps, field technicians, the M&A integration team and Security.

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
| Operate | Operations Overview (all 900 branches on the map, business services, error budgets, unified timeline), Live Operations, Correlation (Live correlation is one top-to-bottom page: the correlation workflow for four use cases, where the OpsQ line under each step names the OpsQ features at work there, and step 7, Learn and promote, shows the patterns OpsQ learned lately with a 7-day back-test, Promote and Reject, the correlations running at one branch, rule-based vs OpsQ and the guardrails; then the engine on today's live alerts, patterns across stores and the live ServiceNow sync log. Operations Copilot: Search, Command Center with one-click Recommend-mode actions, the root cause agent, the Dashboard Assistant and the Documentation Assistant, with usage by agent and model. Plus sources and integration, where each source onboards its own way and gets its own template), Branch 360, Branch Readiness, Live Incidents |
| Manage | Device & Circuit Inventory, Lifecycle & Vulnerabilities, Carrier Management, Field Dispatch (with a technician view: the work pack in the field app on a phone (the same phone view opens wherever a work pack opens), the route from the base and depot to the store, and the store layout, drawn for the kind and size of branch, with the fault and the way in), Approvals & Changes, Policies & Templates (OpsRamp monitoring templates, alert policies, access, network policies and golden configs, onboarding a new make or model), Branch-in-a-Box (greenfield and acquired branches, cutover weekend gates, Day-1 parity) |
| Improve | Predictive Watchlist, Knowledge, AI & Automation Catalogue (catalogue, agents at work, runbooks and runs) |
| Govern | Performance (Network, Stores and branches, AI and automation, Services and engagement SLAs and KPIs from Annexure B; 3, 6, 9 or 12 months; PDF, HTML and CSV downloads) and Reports, both set by audience (CEO, CIO, Network BU head, IT manager, Network lead; leaders get headlines that drill down). Reports: BU head weekly (KPIs, P1/P2, major incident log with RCA, SLA breaches, change success, upcoming events, security, escalations and DSAT), shift handover, daily summary, weekly service review, critical incidents P1/P2 with how each was solved, Branch-in-a-Box, audit log; each as an executive summary or in full detail) |

The **live demos** are a separate page (`demos/`) with its own link; the two pages do not link to each other. Each scripted SRS branch situation plays on one screen showing every system involved (Detect → Correlate → Decide → Act → Verify → Record), with a Business view and a Technical view explanation.

Filter everything by Region › City › Device, and find any branch by name or number. Switch role (NOC Engineer, Network Engineer L3, StoreOps Lead, Branch Manager, Field Technician, M&A Integration Lead, Security Lead) from the header; each role has its own landing page and suggested questions for "Ask Mova iO".

Branches are numbered 1 to 900 across the estate, with their location in the name: "Branch 214 – Virginia Beach, VA" is BR-0214.

**Drill down to any level, and to the root cause.** Every count in the console opens the detail behind it: a tile with an arrow (›) opens its list, and in a tile with several numbers (healthy / degraded / down, circuits down / degraded, SLA clocks on track / at risk / breached, open incidents by priority) each number opens its own list, so clicking the red **3** on the Operations Overview shows the three branches that are down. The panel walks on to a region, a state, a city, one branch, one internet line, one device or one incident, carries the filter bar with it, and hands over to Branch 360, the incident record or the screen that owns the list. From any problem branch, line or incident, **See the root cause** shows where the fault is (network inside SRS, the ISP or the application) on the path from the tills to the data centre, the evidence that rules the other layers out, the ranked causes, how it was found, the change behind it if a change caused it, wider carrier problems in the same region, repeats and the problem record. Lists of branches with problems start with their root causes, grouped by where the fault is.

**Mova iO decides who fixes it, and does the work.** Every root cause and next step comes from Mova iO, and each part names the agent behind it. The Correlation Agent groups the alerts, the Diagnosis Agent finds the root cause and traces it along the branch's path, and the Smart Triage Agent picks the route: a runbook, an NOC L1/L2 engineer, a US-based network SME, an SRS field technician on site, HPE Aruba TAC, the carrier, application support or security. It also says whether Mova iO can fix it remotely, and marks each route as recommended, try first, in hand, tried, only if needed or not needed. The Runbook, Dispatch, Carrier, Ticket Update and Change Validation agents prepare each step: the hand-off package, the field visit with the job, skills, spare and ranked technicians, the carrier case or escalation, the HPE case, or the security request. Mova iO acts on its own where the gate rules allow. Otherwise an engineer reviews and approves (the only human step), and the agent carries it out and records it on the ticket, the work order or case, and the audit log. Movate keeps the ticket until the Verification Agent's checks pass. Roles that cannot approve, and the role dashboards, see the same plan read-only. The logic is in `src/dash/fix.js`; the panel is `src/dash/TakeAction.jsx`.

**Onsite work pack.** Every field visit carries a work pack that Mova iO assembles, so the technician arrives prepared instead of starting the investigation again. It opens with Mova iO's summary for the technician: the probable problem and what is less likely, what was already checked or tried remotely and what each showed, the fix to carry out on site with a plan B, and what to bring (the replacement part reserved at the depot, extras and tools). The NOC sees the same summary when it reviews the dispatch. Then come six parts: site context (circuit IDs from the CMDB, demarc, network path, key devices); before arrival (authorised access, appointment, parts reserved at the depot, tools); diagnostic history (Mova iO's root cause, OpsRamp findings, what was tried, earlier ServiceNow incidents); the approved checklist; evidence (photos, readings with their ranges, findings); and verify + hand-off. The Field Technician works it in the phone view of the field app (*My jobs today* or the *Technician view* in Field Dispatch) and the Verification Agent runs the return-to-service check. The NOC owner then accepts the hand-off, which closes the work order and resolves the incident. Code: `src/dash/workpack.js` and `src/dash/WorkPack.jsx`.

**SRS sees, Movate acts.** Each role belongs to an organisation. Movate roles (NOC Engineer, Network Engineer L3) carry out actions. SRS roles (StoreOps Lead, Branch Manager, Field Technician, M&A Integration Lead, Security Lead) and the role dashboards see everything live, but every action control is disabled with the reason: acknowledge, assign, priority and state, approve, run, raise, resolve, roll back, restock, re-run, start a project. In its place is *Escalate to Movate*, which records what it is about, the urgency (Normal 4 h, High 30 min, Critical 15 min plus the major incident manager) and the reason. Mova iO routes it to the ticket owner and the Movate engagement lead; the owner acknowledges and Movate replies on the incident. The field technician still records the onsite work in the work pack. Escalations are kept in the browser, so the dashboards and the console share them. Controls marked `op` are the actions (`src/ui.jsx`); the dialog and banner are in `src/escalate.jsx`.

## Performance and Reports, in sync

Both pages take their KPIs from one definition (`src/kpis.js`). Each of the four areas has four KPIs, headline first, in this order:

| Area | KPIs |
|---|---|
| Network | critical availability #29, firmware #32, config backup #33, network SLAs at ESL |
| Stores and branches | store availability, store hours lost, branches below 99.5%, repeat-problem branches |
| AI and automation | tickets fixed by Mova iO, engineer hours saved, noise reduction, auto-resolution |
| Services and engagement | service SLAs at ESL, P1 time to restore, tickets outside SLA, SLAs below minimum |

Performance shows each area in the same order: headline KPIs, scorecard, trend, breakdown, then detail. Each card appears once. Reports → *Performance summary* shows the same KPIs in the same order, with the metric table for each area. Both pages share one 3/6/9/12-month period, and every tile and row drills down.

## OpsRamp view (`opsramp/`)

A fourth link with the same live data, laid out like the HPE OpsRamp product.

**Frame:**
- a dark top bar with the client, an OpsQL-style search across resources, alerts and sites, Copilot, notifications, settings and the user;
- a grouped left menu that collapses to icons, where every item's name is the page's title, with breadcrumbs;
- HPE green throughout.

**Menu:**

| Group | Pages |
|---|---|
| Dashboards | Network performance |
| Infrastructure | Resources (devices, circuits, onboarding, CMDB), Integration studio (studio, device onboarding, sources), Policies and rules |
| Alerts | Alert Browser, Correlation (the OpsQ workflow), Operations Copilot |
| Insights | Predictive insights |
| Patch & Vulnerability | Patch and vulnerability |
| Automation | Process automation, Knowledge base |
| Reports | Reporting Apps |

It is built from the same code as the console (edition `opsramp`) and keeps its own saved copy.

## Role dashboards (`dashboards/`)

A third page, separate from the console and the demos: real-time dashboards with role-based access (RBAC) for six leaders. Each role signs in and sees only its own dashboard, its own scope and the detail its access allows. The dashboard is worked out again from the same live data as the console every few seconds (every third live tick: about 6 s at 1×, faster at 5× and 10×); **LIVE** in the header shows the time of the last update and pauses or resumes it.

Three views: **Live now** (what is happening right now: who is down, what is due in the next 24 hours, the decisions waiting), **Last 7 days** (problems fixed, how fast, what automation saved, changes made, and the next 7 days) and **Last month** (the last full month against target, the six-month trend and the next 30 days). Each view has:

- a summary with the network status (healthy, minor issues, degraded or major disruption) and a spotlight on one branch event;
- four key numbers;
- **Needs attention**, **Going well** and what is coming up (changes, decisions, technician visits, carrier restore times, go-lives and freezes);
- four interactive charts chosen for the view and the role: every branch's status with the worst first, a map of the problems, trading normally by region, and one chart for the role (automatic fixes, delay to the data centre, readiness to open, the incident queue or device health); fixes day by day, what went wrong, how long fixes took, trouble-free branches or changes; six months of uptime and time to fix, service levels, and carrier lines below their promise, capacity or switches reaching end of support;
- four insights (each an Ask Mova iO answer) with **Details** and **Drill down**, and more insights;
- **Live activity**: the role's own stream of network events, with events per minute.

**Drill down to any level.** Every number, sentence, calendar entry, chart bar, slice, column, map dot, insight and event opens a panel that goes as deep as the console: the estate, a region, a state, a city, one branch (lines, the last 24 hours of delay, loss and use, opening checks, incidents, devices, what uses the line, visits, carrier repairs, decisions and changes), one internet line, one device (software, security advisories, lifecycle, warranty, backups), one incident (timeline, likely cause, fix, deadline) and on to the carrier, the change, the decision, the service level, the six-month trend, the project or the prediction behind it. A breadcrumb shows the path; Back or any crumb steps out, Escape closes. The regional manager's dashboard stays inside its region.

**Export PDF** saves the current view, with the same four charts drawn in the PDF (in Helvetica, since Aptos cannot be embedded). The page is set in Aptos where it is installed. The old `briefs/` link forwards to `dashboards/`.

| Role | Scope | Username | Password |
|---|---|---|---|
| Chief Information Officer | All regions | `cio` | `Dash@CIO1` |
| Head of Networks | All regions | `head.networks` | `Dash@NET1` |
| Head of Stores & Branches | All regions | `head.stores` | `Dash@STR1` |
| Head of IT Service & NOC | All regions | `head.itservice` | `Dash@ITS1` |
| Head of Security | All regions | `head.security` | `Dash@SEC1` |
| Regional Manager, Southeast | Southeast | `regional.se` | `Dash@REG1` |

The accounts are demo accounts shown on the sign-in screen: the page is static with sample data, so the sign-in shows how access is split by role; it is not a security control. Roles, their access and their insights are in `src/dash/personas.js`; each insight is an Ask Mova iO question, so the dashboards, the PDF export and the console agree.

## Saved automatically, and the inventory as the CMDB

**Nothing is lost on refresh.** The console saves itself a moment after anything changes, in the browser's own database (IndexedDB).

| After a refresh | What comes back |
|---|---|
| Always | Settings and the records people create: onboarding, OpsQ promotions, Copilot tiles, knowledge articles, problems, filters, the page and tab you were on |
| If saved within the last 12 hours | The live picture: incidents, approvals, changes, work orders, carrier cases, the audit log |

New incident numbers carry on from the saved ones.

The *Saved* indicator on Device & Circuit Inventory opens the storage settings. There you can also connect a free Supabase Postgres project:
1. Run the schema SQL in the Supabase SQL editor.
2. Paste the project URL and the anon key (they are kept in the browser only).

The console then saves itself there too, in `console_state`, and every table can be synced. The schema's policy is for demos only: anyone with the anon key can read and write.

**Device & Circuit Inventory is the CMDB:**
- **A device's or circuit's detail** shows:
  - its CMDB record: class, management IP, location, owner, support group, monitoring template, lifecycle;
  - its relationships: a branch contains its EdgeConnect, which uses both circuits and feeds the core switch, and switches power the access points;
  - related incidents, carrier cases and changes.
- **The CMDB tab** has every table (branches, devices, circuits, onboarded resources, relationships, incidents, changes, problems, work orders, cases, audit log), with search and CSV, and a CI explorer.
- **Added by onboarding** lists what the Integration studio, discovery scans and CSV imports added.

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

## Unbranded copy (`marvell/`)

`marvell/src` is a separate copy of the console and the live demos with no logos (no SRS mark and no owner's mark) and neutral colours. It builds to `dist/site/marvell/` (console) and `dist/site/marvell/demos/` (demos). Changes to `src/` do not reach it; the two sites do not link to each other.

## Build

Requires Node 18 or newer.

```bash
npm ci
npm run build        # writes dist/site/index.html (console), dist/site/demos/index.html (demos) and dist/site/dashboards/index.html (role dashboards)
```

Open either file directly in a browser. No server and no network calls are needed. Both pages come from the same source: `src/edition.js` holds the name and the flag the build sets for the demos page.

`npm run map` regenerates `src/mapdata.json` (projected US and Canada outlines and branch city points) from `src/cities.mjs`.

## Publishing

`.github/workflows/pages.yml` builds on every push to `main` and publishes all three pages to GitHub Pages: the console at the site root, the demos at `demos/` and the role dashboards at `dashboards/` (the old `briefs/` link forwards there). Turn it on once in **Settings → Pages → Build and deployment → Source: GitHub Actions**. Note: a Pages site is reachable by anyone with the link, even from a private repository (except on GitHub Enterprise with private Pages).

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
| `src/dash/*` | The role dashboards: roles and access, the view for each role, charts, drill-down and PDF export |
| `build.mjs` | esbuild + Tailwind, inlined into one HTML file |

