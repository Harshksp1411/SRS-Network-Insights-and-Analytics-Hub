import * as D from './data.js';
import { MIN, HR, DAY } from './util.js';

// Each scenario replays a realistic sequence. Timestamps are anchored so the last step lands at "now".
const branchBy = (city, brand, pred) => D.BRANCHES.find(b => b.city === city && (!brand || b.brand === brand) && (!pred || pred(b))) || D.BRANCHES.find(b => b.city === city);

export function baseInc(o) {
  return {
    kind: 'scenario', cat: 'Branch connectivity', state: 'New', group: 'Movate NOC – L2 Network', assignee: null, acked: null,
    signals: [], corr: 0, suppressed: 0, rca: [], conf: 0, agentSteps: [], runbook: null, rbState: 'proposed', impact: [], verify: [], notes: [], carrierCase: null, workOrder: null, major: false, children: [], ...o,
  };
}
export const sig = (t, src, msg, sev = 'Major') => ({ t, src, msg, sev });
export const step = (agent, t, text, st = 'done') => ({ agent, t, text, st });

export function addSignals(act, id, list, corrAdd = 0, supAdd = 0) {
  act.upd('incidents', id, x => ({ signals: [...x.signals, ...list], corr: x.corr + corrAdd, suppressed: x.suppressed + supAdd }));
}
export function addStep(act, id, s) { act.upd('incidents', id, x => ({ agentSteps: [...x.agentSteps, s] })); }

export const SCENARIOS = [
  // 1 ─────────────────────────────────────────────────────────────
  {
    id: 'mpls', title: 'Branch MPLS jitter', icon: 'Activity', sub: '40+ events become one incident, traffic steers to broadband, carrier case raised and the incident closes in under 2 minutes',
    span: 150,
    setup(ctx) {
      ctx.b = branchBy('Houston', 'SRS Building Products');
      ctx.p = ctx.b.wan[0]; ctx.s = ctx.b.wan[1];
      ctx.id = D.nextInc();
    },
    steps: [
      { at: 0, label: '09:12:00 OpsRamp: jitter, loss and latency rising on the AT&T MPLS primary', run(act, c, T) {
        act.map('circuitState', c.p, { status: 'Degraded', type: 'MPLS', carrier: 'AT&T', jit: 34, loss: 1.2 });
        act.map('branchHealth', c.b.id, 'degraded');
        act.add('incidents', baseInc({ id: c.id, pri: 'P3', title: 'MPLS jitter 34 ms / loss 1.2% – AT&T (raw events arriving)', branchId: c.b.id, ci: c.p, opened: T, cat: 'Carrier / LEC',
          signals: [sig(T, 'Orchestrator', `${c.p} jitter 34 ms, loss 1.2%, latency 96 ms (AT&T MPLS)`, 'Major')], corr: 1 }));
      } },
      { at: 10, label: 'More events: BFD flaps, tunnel quality, ERP and POS path latency', run(act, c, T) {
        addSignals(act, c.id, [sig(T, 'OpsRamp', 'BFD session flap on overlay tunnel to Primary DC (x6)', 'Minor'), sig(T + 2e3, 'Orchestrator', 'Tunnel quality score 61 (was 98)', 'Major'), sig(T + 4e3, 'New Relic', 'ERP path latency 180 ms from this branch (baseline 40 ms)', 'Major'), sig(T + 6e3, 'Synthetic', 'POS path RTT 640 ms (threshold 400 ms)', 'Critical')], 26);
      } },
      { at: 15, label: '09:12:15 Correlation Agent: 43 events → 1 incident; CI and site mapped', run(act, c, T) {
        act.upd('incidents', c.id, x => ({ pri: 'P2', title: 'SD-WAN degradation – AT&T MPLS: POS and ERP at risk', corr: 43, suppressed: 41, state: 'In Progress', acked: T, assignee: 'Mova iO', group: 'Movate NOC – L2 Network', impact: ['Card payments at risk of slowing at the counter', 'ERP order entry at risk'] }));
        addStep(act, c.id, step('correlation', T, '43 raw events from the EdgeConnect, switches and Wi-Fi grouped into one incident; duplicates and flaps suppressed. ServiceNow incident opened with the CI and site mapped. Priority P2: branch open, POS at risk.'));
      } },
      { at: 40, label: '09:12:40 Diagnosis: path tests, carrier portal and golden-config check point to the carrier (87%)', run(act, c, T) {
        act.upd('incidents', c.id, { conf: 0.87, rca: [{ cause: 'Carrier-side degradation on the AT&T MPLS path', conf: 0.87, ev: 'Path and interface tests run in parallel; AT&T portal shows congestion on the aggregation; running config matches the golden template; local utilisation 29%' }, { cause: 'Local WAN saturation', conf: 0.06, ev: 'wan1 utilisation 29%' }, { cause: 'EdgeConnect CPU or QoS', conf: 0.03, ev: 'CPU 11%, no queue drops' }] });
        addStep(act, c.id, step('diagnosis', T, 'Automated path and interface tests, carrier circuit health pulled from the AT&T portal, running config compared with the golden template. Not a local device or config fault: carrier-side degradation (87%).'));
      } },
      { at: 60, label: '09:13:00 RB-101 self-heals: traffic to broadband, QoS re-applied, tunnel verified', run(act, c, T) {
        addSignals(act, c.id, [sig(T, 'Orchestrator', `POS, ERP and voice moved to ${c.s}; QoS re-applied for voice and ERP; tunnel re-established (pre-approved RB-101, Act tier)`, 'Info')]);
        addStep(act, c.id, step('runbook', T, 'Broadband path tested healthy first. RB-101 is a pre-approved Act-tier action inside guardrails and change policy, so it ran during trading hours and notified the NOC.'));
        act.upd('incidents', c.id, { runbook: 'RB-101', rbState: 'done' });
      } },
      { at: 85, label: '09:13:25 Verification: synthetic POS and voice pass; evidence pack; AT&T ticket raised', run(act, c, T) {
        act.upd('incidents', c.id, { verify: [{ v: 'POS RTT < 400 ms', st: 'pass', val: '180 ms' }, { v: 'ERP path < 80 ms', st: 'pass', val: '42 ms' }, { v: 'Voice MOS > 3.8', st: 'pass', val: '4.2' }] });
        addSignals(act, c.id, [sig(T, 'Synthetic', 'POS path RTT 180 ms via wan2; voice MOS 4.2', 'Info')]);
        const no = D.caseNo('AT&T');
        act.add('cases', { id: no, carrier: 'AT&T', circuit: c.p, inc: c.id, branchId: c.b.id, opened: T, status: 'Open – carrier testing', eta: T + 4 * HR, lastUpdate: T, evidence: ['60-min jitter/loss graph (Orchestrator)', 'MTR from EdgeConnect to PE', 'Config diff vs golden (none)', 'Synthetic test results', 'Timestamps UTC/CT'], escal: 0 });
        act.upd('incidents', c.id, { carrierCase: no });
        addStep(act, c.id, step('carrier', T, `Evidence Collector attached telemetry, config diff and test results. AT&T ticket ${no} raised automatically with the circuit ID.`));
        act.audit(`Carrier case ${no} opened for ${c.p}`, c.id, 'Carrier Agent');
      } },
      { at: 100, label: '09:13:40 Closed on its own in under 2 minutes; StoreOps told', run(act, c, T) {
        act.upd('incidents', c.id, { state: 'Resolved', resolved: T, closeCode: 'Auto-resolved (zero touch)' });
        addStep(act, c.id, step('comms', T, `StoreOps and the ${c.b.name} manager told: "Card payments and ERP moved to the backup line before the counter noticed. AT&T is working the main line." No action needed.`));
        act.note(c.id, 'Closed autonomously 1 m 40 s after the first signal: zero human touch, no user-reported impact.', 'Mova iO');
        act.audit('RB-101 ran under policy (Act tier); incident closed autonomously', c.id, 'Runbook Agent');
      } },
      { at: 130, label: 'Prevention: pattern rule for other AT&T MPLS branches; return-to-primary watch armed', run(act, c, T) {
        act.add('watches', { id: `W-${c.id}`, what: `Return ${c.p} to primary after 30 clean minutes`, branchId: c.b.id, created: T, by: 'Runbook Agent', rb: 'RB-102' });
        addStep(act, c.id, step('change', T, 'Change and Prevention Agent: the same degradation signature now pre-empts failover at 3 other AT&T MPLS branches in Houston. Return to primary waits for 30 clean minutes (RB-102).'));
      } },
    ],
    focus: c => ({ module: 'incidents', selInc: c.id }),
  },
  // 3 ─────────────────────────────────────────────────────────────
  {
    id: 'ec', title: 'EdgeConnect hardware failure', icon: 'Server', sub: 'Remote recovery fails, a work order goes out with a pre-staged spare',
    span: 95 * 60,
    setup(ctx) { ctx.b = branchBy('Phoenix', 'American Roofing Supply'); ctx.id = D.nextInc(); ctx.ec = `${ctx.b.code}-ec01`; },
    steps: [
      { at: 0, label: 'Orchestrator: EC unreachable, both tunnels down', run(act, c, T) {
        act.map('branchHealth', c.b.id, 'down');
        act.add('incidents', baseInc({ id: c.id, pri: 'P1', cat: 'Hardware', title: 'Branch down – EdgeConnect EC-XS unreachable, both paths', branchId: c.b.id, ci: c.ec, opened: T, signals: [sig(T, 'Orchestrator', `${c.ec} heartbeat lost; tunnels down on wan1 and wan2`, 'Critical'), sig(T + 15e3, 'OpsRamp', 'Switches/APs at site unreachable (children)', 'Critical')], corr: 19, suppressed: 18, impact: ['ERP, POS and voice down at branch'] }));
      } },
      { at: 50, label: 'Diagnosis: not the carriers – both circuits up at the modems', run(act, c, T) {
        act.upd('incidents', c.id, { state: 'In Progress', acked: T, assignee: 'Arjun M.', group: 'Movate NOC – Major Incident', conf: 0.74, rca: [{ cause: 'EdgeConnect hardware / OS fault', conf: 0.74, ev: 'Carrier portals show both circuits up; LTE router online via OOB; switch port to the EdgeConnect up but no LLDP neighbour' }, { cause: 'Switch port or patch lead', conf: 0.15, ev: 'Port up, no LLDP' }, { cause: 'Carrier outage', conf: 0.03, ev: 'Both carriers clean' }] });
        addStep(act, c.id, step('diagnosis', T, 'Both carriers clean, LTE router reachable over OOB. EC drawing 9 W – likely hardware. Confidence 74%: remote recovery first.'));
        addStep(act, c.id, step('comms', T, 'StoreOps + branch manager: branch offline, use downtime procedure for orders; next update 30 min.'));
      } },
      { at: 120, label: 'Remote recovery (RB-108): soft reboot via Orchestrator – no response', run(act, c, T) {
        act.upd('incidents', c.id, { runbook: 'RB-108', rbState: 'running' });
        addSignals(act, c.id, [sig(T, 'Orchestrator', 'Soft reboot command – no acknowledgement', 'Major')]);
      } },
      { at: 520, label: 'OOB console: boot loop, disk I/O errors', run(act, c, T) {
        addSignals(act, c.id, [sig(T, 'OOB console', 'Boot loop: "EXT4-fs error … I/O error, dev sda"', 'Critical')]);
        addStep(act, c.id, step('runbook', T, 'Console shows disk I/O errors in boot loop. Reload from the backup partition attempted next.'));
      } },
      { at: 700, label: 'Reload from the backup partition fails POST. Remote recovery failed', run(act, c, T) {
        act.upd('incidents', c.id, { rbState: 'failed', conf: 0.93, rca: [{ cause: 'EdgeConnect hardware failure (storage)', conf: 0.93, ev: 'Disk I/O errors in boot; fails POST from both partitions' }, { cause: 'Switch port or patch lead', conf: 0.03, ev: 'Port and lead tested from the switch' }] });
        addSignals(act, c.id, [sig(T, 'OOB console', 'Reload from backup partition: POST failed (storage)', 'Critical')]);
      } },
      { at: 760, label: 'Dispatch Agent: WO with pre-staged spare EC-XS from Phoenix depot', run(act, c, T) {
        const tech = D.TECHS.find(t => t.skills.includes('EdgeConnect swap') && (t.region === 'Mountain West' || t.region === 'Pacific')) || D.TECHS[0];
        const wo = `WO00${42010 + Math.floor(Math.random() * 80)}`;
        act.add('workOrders', { id: wo, branchId: c.b.id, inc: c.id, task: 'Swap EdgeConnect EC-XS (hardware fault). Spare pre-staged: zero-touch profile bound to site. Return faulty unit (RMA).', skills: ['EdgeConnect swap'], parts: ['EC-XS'], tech: tech.id, status: 'Dispatched', created: T, eta: T + 80 * MIN, window: 'Now (P1)', priority: 'P1' });
        act.upd('depots', 'DEP-PHX', x => ({ spares: { ...x.spares, 'EC-XS': x.spares['EC-XS'] - 1 } }));
        act.upd('incidents', c.id, { workOrder: wo });
        addStep(act, c.id, step('dispatch', T, `${wo}: ${tech.name} (EdgeConnect swap) from ${tech.base}; spare EC-XS from DEP-PHX (3 → 2); ETA 80 min. HPE RMA case opened for the faulty unit.`));
        act.audit(`P1 dispatch ${wo} with spare EC-XS`, c.id, 'Dispatch Agent');
      } },
      { at: 5200, label: 'Tech on site; spare installed; zero-touch registers', run(act, c, T) {
        addSignals(act, c.id, [sig(T, 'Orchestrator', `${c.ec} (new serial) registered; template applied`, 'Info'), sig(T + 60e3, 'Orchestrator', 'Tunnels up on wan1 and wan2', 'Info')]);
        act.map('branchHealth', c.b.id, 'up');
        act.upd('incidents', c.id, { verify: [{ v: 'EC registered (zero-touch)', st: 'pass', val: 'template v41' }, { v: 'Tunnels both paths', st: 'pass', val: 'up' }, { v: 'POS / ERP / voice probes', st: 'pass', val: 'OK' }, { v: 'CMDB serial updated', st: 'pass', val: 'auto' }], rbState: 'done' });
      } },
      { at: 5700, label: 'Resolved – P1 restored inside 4 h', run(act, c, T) {
        act.upd('incidents', c.id, { state: 'Resolved', resolved: T, closeCode: 'Hardware replaced' });
        addStep(act, c.id, step('knowledge', T, 'Similar-case index updated; RMA tracked in CMDB.'));
      } },
    ],
    focus: c => ({ module: 'incidents', selInc: c.id }),
  },
  // 4 ─────────────────────────────────────────────────────────────
  {
    id: 'storm', title: 'Storm-region surge (DFW)', icon: 'CloudLightning', sub: 'Severe weather hits many branches at once; they are grouped as one major incident',
    span: 40 * 60,
    setup(ctx) {
      const dfw = D.BRANCHES.filter(b => ['Dallas', 'Fort Worth', 'McKinney', 'Waxahachie'].includes(b.city));
      const spec = dfw.filter(b => D.CIR[b.wan[0]].carrier === 'Spectrum');
      ctx.list = [...spec.slice(0, 5), ...dfw.filter(b => !spec.slice(0, 5).includes(b))].slice(0, 12);
      ctx.id = D.nextInc();
    },
    steps: [
      { at: 0, label: 'Weather feed: severe thunderstorm + hail warning, Dallas–Fort Worth', run(act, c, T) {
        act.add('incidents', baseInc({ id: c.id, pri: 'P2', cat: 'Major incident', title: 'Severe weather – DFW branches: carrier cable outages', branchId: c.list[0].id, ci: 'Region: DFW', opened: T, major: true, signals: [sig(T, 'Weather feed', 'Severe thunderstorm warning, hail up to 2", DFW metro until 18:00', 'Major')], corr: 1, children: [] }));
      } },
      { at: 300, label: '5 branches lose primary (Spectrum area outage); move to LTE', run(act, c, T) {
        c.list.slice(0, 5).forEach(b => { act.map('branchHealth', b.id, 'degraded'); act.map('circuitState', b.wan[0], { status: 'Down' }); });
        addSignals(act, c.id, c.list.slice(0, 5).map((b, i) => sig(T + i * 7e3, 'Orchestrator', `${b.name}: wan1 down, traffic on ${D.CIR[b.wan[1]].type}`, 'Critical')), 37, 30);
      } },
      { at: 480, label: '1 branch loses both paths, 1 more on its backup', run(act, c, T) {
        act.map('branchHealth', c.list[5].id, 'down'); act.map('branchHealth', c.list[6].id, 'degraded');
        addSignals(act, c.id, [sig(T, 'Orchestrator', `${c.list[5].name}: both paths down, EdgeConnect unreachable`, 'Critical'), sig(T + 30e3, 'Orchestrator', `${c.list[6].name}: wan1 down, traffic on ${D.CIR[c.list[6].wan[1]].type}`, 'Major')], 26, 24);
      } },
      { at: 560, label: 'Correlation: 64 events, 7 branches → one major incident (P1)', run(act, c, T) {
        act.upd('incidents', c.id, { pri: 'P1', title: 'MAJOR – Severe weather DFW: 7 branches impacted (6 on backup, 1 down)', state: 'In Progress', acked: T, assignee: 'Arjun M.', group: 'Movate NOC – Major Incident', children: c.list.slice(0, 7).map(b => b.id), corr: 64, conf: 0.95, rca: [{ cause: 'Regional weather: Spectrum HFC outage', conf: 0.95, ev: 'Spectrum outage map covers 5 of 7 sites; timing matches the storm cell track' }, { cause: 'Independent faults', conf: 0.03, ev: 'Unlikely – same 9-minute window' }], impact: ['1 branch offline', '6 branches on backup lines (POS and ERP OK, less bandwidth)', 'LTE data pool burn rate ×3'] });
        addStep(act, c.id, step('correlation', T, '64 events across 7 branches grouped as one major incident; child incidents not created. Major-incident bridge opened; leadership updates every 60 min.'));
      } },
      { at: 600, label: 'Storm response freeze added for Texas & South Central', run(act, c, T) {
        act.add('freezes', { id: 'FRZ-STORM', name: 'Storm response freeze – Texas & South Central', start: T, end: T + 2 * DAY, scope: 'Texas & South Central', reason: 'Severe weather – emergency changes only' });
        act.audit('Freeze window added: Storm response – Texas & South Central', c.id, 'Arjun M. (Major Incident Manager)');
      } },
      { at: 700, label: 'Carrier Agent: one master Spectrum case for 5 circuits', run(act, c, T) {
        const no = D.caseNo('Spectrum');
        act.add('cases', { id: no, carrier: 'Spectrum', circuit: c.list.slice(0, 5).map(b => b.wan[0]).join(', '), inc: c.id, branchId: c.list[0].id, opened: T, status: 'Open – area outage acknowledged', eta: T + 5 * HR, lastUpdate: T, evidence: ['5 circuits down within 9 min', 'Area outage reference from carrier', 'Per-site light levels'], escal: 0, master: true });
        act.upd('incidents', c.id, { carrierCase: no });
        addStep(act, c.id, step('carrier', T, `Master case ${no} (5 circuits) instead of 5 separate tickets. Spectrum confirms HFC node outage, ETR 5 h.`));
      } },
      { at: 900, label: 'Comms: leadership + StoreOps update #1', run(act, c, T) {
        addStep(act, c.id, step('comms', T, 'Update #1 to leadership & StoreOps: 7 DFW branches affected, 6 trading on backup lines, 1 offline. Next update in 60 min.'));
      } },
      { at: 1500, label: 'Prediction Agent: LTE pool will exceed plan in 2 days at this burn', run(act, c, T) {
        act.add('approvals', { id: 'APR-2230', type: 'Prediction', title: 'Temporary LTE pool uplift with Verizon/AT&T for DFW storm', branchId: c.list[0].id, agent: 'prediction', conf: 0.9, risk: 'Low', created: T, status: 'Pending', why: ['Predictions never act directly – approval needed'], evidence: ['5 sites on LTE for est. 5 h', 'Pool at 81% before storm', 'Post-storm roofing demand surge expected (busy branches for weeks)'], rollback: 'Revert plan next billing cycle', verify: ['Carrier confirms uplift'] });
        addStep(act, c.id, step('prediction', T, 'Hail = roofing demand surge in the coming weeks: watch WAN capacity at DFW branches; LTE pool uplift sent for approval.'));
      } },
      { at: 2100, label: 'Dispatch: tech queued for offline branch once storm cell passes', run(act, c, T) {
        const wo = `WO00${42100 + Math.floor(Math.random() * 80)}`;
        act.add('workOrders', { id: wo, branchId: c.list[5].id, inc: c.id, task: 'Post-storm site check: EdgeConnect, circuits at the demarc, yard AP poles', skills: ['EdgeConnect swap', 'Outdoor AP / lift'], parts: ['EC-XS', 'AP-585'], tech: null, status: 'Unassigned', created: T, window: 'After storm warning expires', priority: 'P1' });
        addStep(act, c.id, step('dispatch', T, `${wo} created – held until the storm warning expires (safety). Matching techs in Texas & South Central.`));
      } },
    ],
    focus: c => ({ module: 'incidents', selInc: c.id }),
  },
  // 5 ─────────────────────────────────────────────────────────────
  {
    id: 'cutover', title: 'Branch-in-a-Box cutover weekend', icon: 'Package', sub: 'LS Building Products acquired branch, Friday 17:00 close to Monday 06:00 open (rehearsal replay): one gate fails and is fixed live',
    span: 60 * 60,
    setup(ctx) { ctx.pid = 'BIB-0141'; },
    steps: [
      ...[0, 1, 2, 3, 4, 5, 6, 7].map(i => ({ at: i * 300, when: D.GATE_TEMPLATE[i][0], label: `Gate ${i + 1}: ${D.GATE_TEMPLATE[i][1]}`, run(act, c, T) {
        act.upd('projects', c.pid, x => ({ gates: x.gates.map(g => g.i === i ? { ...g, st: 'Pass', at: T, note: g.evidence } : g) }));
        if (i === 4) act.audit('EdgeConnect zero-touch registered at LS Building Products', c.pid, 'Movate Network Eng');
      } })),
      { at: 2550, when: 'Sat 15:00', label: 'Gate 9 FAILS: 9 of 14 handhelds cannot join SRS-SCAN', run(act, c, T) {
        act.upd('projects', c.pid, x => ({ rag: 'Red', gates: x.gates.map(g => g.i === 8 ? { ...g, st: 'Fail', at: T, note: '9/14 legacy handhelds fail to associate. They are 2.4 GHz-only; SRS-SCAN template is 5 GHz-only. Rollback plan armed: legacy APs kept on shelf until Monday 05:30.' } : g) }));
        act.audit('Gate 9 failed – rollback plan armed', c.pid, 'StoreOps + Field Tech');
      } },
      { at: 2700, when: 'Sat 15:40', label: 'Change Validation Agent: fix = enable 2.4 GHz on SRS-SCAN for this site (NaC)', await: { label: 'Approve site override (Network Eng L3)', run(act, c) {
        act.audit('Approved NaC override: SRS-SCAN 2.4 GHz enabled for LS Building Products site', c.pid, 'Marcus L. (Network Engineer L3)');
      } }, run(act, c, T) {
        act.upd('projects', c.pid, x => ({ gates: x.gates.map(g => g.i === 8 ? { ...g, fix: 'NaC change: sites/ls-building-products/il-01.yaml → ssid SRS-SCAN bands [5GHz] → [2.4GHz, 5GHz]; min-RSSI -75. Low risk; site not trading.' } : g) }));
      } },
      { at: 2900, when: 'Sat 17:10', label: 'Re-test gate 9: 14/14 handhelds online – PASS', run(act, c, T) {
        act.upd('projects', c.pid, x => ({ rag: 'Amber', gates: x.gates.map(g => g.i === 8 ? { ...g, st: 'Pass', at: T, note: 'Re-tested after NaC fix: 14/14 handhelds online, roaming walk-test passed. Fix added to kit template for acquired sites with legacy handhelds.' } : g) }));
      } },
      ...[9, 10, 11, 12].map((i, k) => ({ at: 3100 + k * 160, when: D.GATE_TEMPLATE[i][0], label: `Gate ${i + 1}: ${D.GATE_TEMPLATE[i][1]}`, run(act, c, T) {
        act.upd('projects', c.pid, x => ({ gates: x.gates.map(g => g.i === i ? { ...g, st: 'Pass', at: T, note: g.evidence } : g), ...(i === 12 ? { stage: 'Hypercare', rag: 'Green', blockers: [] } : {}) }));
        if (i === 12) act.audit('StoreOps sign-off – LS Building Products opens Monday 06:00 on SRS standard', c.pid, 'Branch Manager + StoreOps');
      } })),
    ],
    focus: c => ({ module: 'biab', tab: { biab: 'cutover' }, biabProject: c.pid }),
  },
  // 6 ─────────────────────────────────────────────────────────────
  {
    id: 'fw', title: 'AP firmware rollout paused', icon: 'PauseCircle', sub: 'Change validation stops a firmware wave when the canary group misbehaves',
    span: 50 * 60,
    setup(ctx) { ctx.chg = 'CHG0031874'; ctx.b = branchBy('Orlando'); },
    steps: [
      { at: 0, label: 'CHG0031874 starts: canary 10 APs (Florida, off-hours)', run(act, c, T) { act.upd('changes', c.chg, { state: 'In progress', start: T, validation: 'Running', progress: 10 }); } },
      { at: 900, label: 'Canary upgraded to 10.7.1.0; post-checks running', run(act, c, T) { act.upd('changes', c.chg, { progress: 10, note: 'Canary 10/10 upgraded' }); } },
      { at: 1800, label: 'Change Validation Agent: handheld fast-roam failures +18% on canary', run(act, c, T) {
        act.upd('changes', c.chg, { validation: 'Failed', note: 'Canary: 802.11r fast-transition failures +18% for older handhelds on SRS-SCAN (vs control group). Office/PC clients normal.' });
      } },
      { at: 1830, label: 'Rollout paused automatically (stop is always allowed)', run(act, c, T) {
        act.upd('changes', c.chg, { state: 'Paused – validation failed' });
        act.audit('CHG0031874 paused by Change Validation Agent (canary regression)', c.chg, 'Change Validation Agent');
      } },
      { at: 2100, label: 'Canary rolled back to 10.6.0.3 (pre-approved rollback in CHG, off-hours)', run(act, c, T) { act.upd('changes', c.chg, { note: 'Canary rolled back to 10.6.0.3 per CHG rollback plan (off-hours, pre-approved). Handheld roaming back to baseline.' }); } },
      { at: 2400, label: 'Revised plan sent for approval: disable 11r on SRS-SCAN for wave', run(act, c, T) {
        act.add('approvals', { id: 'APR-2241', type: 'Change', title: 'CHG0031874 revised: disable 802.11r on SRS-SCAN before 10.7.1.0', branchId: c.b.id, agent: 'change', conf: 0.76, risk: 'Medium', created: T, status: 'Pending', why: ['Confidence 76% is below the 80% gate', 'Firmware wave needs CAB re-approval'], evidence: ['Canary: FT failures +18%', 'Vendor release notes mention FT changes', 'Control group unchanged'], rollback: 'Re-enable 11r; firmware stays at 10.6.0.3', verify: ['Canary roam failures within ±2% of control'] });
        act.add('problems', { id: 'PRB0004241', title: 'AOS 10.7.1.0: fast-transition failures for older handhelds', incidents: 0, state: 'Root cause analysis', owner: 'Wireless team', opened: T });
      } },
    ],
    focus: c => ({ module: 'changes', tab: { changes: 'calendar' } }),
  },
];
