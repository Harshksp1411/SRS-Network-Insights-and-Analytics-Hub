// Live demos: the six original scenarios plus thirteen more, each with a story card (problem, impact,
// resolution, who decides, runbook, systems) and a scripted replay that drives the real console state.
import * as D from './data.js';
import { SCENARIOS, baseInc, sig, step, addSignals, addStep } from './scenarios.js';
import { MIN, HR, DAY } from './util.js';

export const AREAS = ['SD-WAN and carriers', 'LAN and Wi-Fi', 'Security and lifecycle', 'Predict and prevent', 'StoreOps and field', 'Branch-in-a-Box'];
const byName = n => D.BRANCHES.find(b => b.name === n);
const pickB = (city, brand, k = 0) => (D.BRANCHES.filter(b => b.city === city && (!brand || b.brand === brand))[k]) || D.BRANCHES.find(b => b.city === city);

function H(act, c, T) {
  const id = c.id, b = c.b;
  return {
    b, id, T,
    open: o => act.add('incidents', baseInc({ id, branchId: b.id, opened: T, signals: [], ...o })),
    sig: (src, msg, sev = 'Major', corr = 1, sup = 0) => addSignals(act, id, [sig(T, src, msg, sev)], corr, sup),
    agent: (a, text) => addStep(act, id, step(a, T, text)),
    set: p => act.upd('incidents', id, p),
    note: (text, who) => act.note(id, text, who),
    rca: (list) => act.upd('incidents', id, { rca: list.map(([cause, conf, ev]) => ({ cause, conf, ev })), conf: list[0][1] }),
    verify: list => act.upd('incidents', id, { verify: list.map(([v, val]) => ({ v, st: 'pass', val })) }),
    resolve: code => act.upd('incidents', id, { state: 'Resolved', resolved: T, closeCode: code }),
    health: st => act.map('branchHealth', b.id, st),
    circ: (k, patch) => act.map('circuitState', b.wan[k], patch),
    wo: (task, skills, parts, pri, extra = {}) => { const wo = `WO00${44000 + Math.floor(Math.random() * 900)}`; act.add('workOrders', { id: wo, branchId: b.id, inc: id, task, skills, parts, tech: null, status: 'Unassigned', created: T, window: `After ${b.hours.close} local`, priority: pri, ...extra }); act.upd('incidents', id, { workOrder: wo }); return wo; },
    kase: (carrier, status, evidence) => { const no = D.caseNo(carrier); act.add('cases', { id: no, carrier, circuit: b.wan[0], inc: id, branchId: b.id, opened: T, status, eta: T + 4 * HR, lastUpdate: T, evidence, escal: 0 }); act.upd('incidents', id, { carrierCase: no }); return no; },
    approval: o => act.add('approvals', { created: T, status: 'Pending', branchId: b.id, inc: id, ...o }),
    change: o => act.add('changes', { id: `CHG00${32700 + Math.floor(Math.random() * 900)}`, type: 'Normal', risk: 'Low', state: 'Scheduled', start: T + DAY, end: T + DAY + 2 * HR, window: `After ${b.hours.close} local`, scope: b.region, devices: 1, owner: 'Network Eng L3', validation: 'Pending', nac: `sites/${b.code}.yaml`, ...o }),
    audit: (t, who) => act.audit(t, id, who),
  };
}
// mk turns a compact definition into a scenario the player understands
function mk(def) {
  const steps = def.steps.map(([at, label, fn, aw]) => ({ at, label, run: (act, c, T) => fn(H(act, c, T), act), ...(aw ? { await: { label: aw[0], run: (act, c) => aw[1](H(act, c, Date.now()), act) } } : {}) }));
  return { ...def, sub: def.story.problem, steps, span: def.steps[def.steps.length - 1][0] + 20, setup(ctx) { ctx.b = def.branch(); ctx.id = D.nextInc(); }, focus: def.focus || (c => ({ module: 'incidents', selInc: c.id })) };
}

const NEW = [
  mk({ id: 'failback', area: 'SD-WAN and carriers', title: 'Branch stuck on LTE after the circuit recovers', icon: 'Shuffle', who: 'A person approves', runbook: 'RB-102', systems: ['aruba', 'opsramp', 'servicenow', 'movaio'],
    story: { problem: 'Phoenix #12 moved to LTE during a Cox fault this morning. The primary has been clean for 40 minutes but the branch is still on LTE.', impact: 'Roof Hub orders are 0.3 s slower and the pooled LTE plan is burning data at the busiest time of day.', resolution: 'The Runbook Agent proves the primary is stable, asks for approval because the branch is trading, moves traffic back and verifies POS and ERP.' },
    branch: () => byName('Phoenix #12') || pickB('Phoenix', null, 2),
    steps: [
      [0, 'Orchestrator: wan1 clean for 40 min, branch still on wan2 (LTE)', h => { h.open({ pri: 'P4', cat: 'SD-WAN', title: 'Branch still on LTE after primary recovered', ci: h.b.wan[0], impact: ['Roof Hub slower on LTE', 'LTE pool data burn'] }); h.circ(0, { status: 'Up' }); h.health('degraded'); h.sig('Orchestrator', `${h.b.wan[0]} loss 0.02%, jitter 1.4 ms for 40 min; business intent override still pins POS/ERP to wan2`, 'Minor'); }],
      [40, 'Runbook Agent: RB-102 return to primary is eligible', h => { h.set({ state: 'In Progress', acked: h.T, assignee: 'Runbook Agent', runbook: 'RB-102', rbState: 'proposed', conf: 0.94, rca: [{ cause: 'Override left in place after carrier fix', conf: 0.94, ev: 'Carrier case closed 41 min ago; 40 clean minutes on wan1' }] }); h.agent('runbook', 'Checks pass: 40 clean minutes, carrier case closed, LTE healthy as fallback. Branch is open, so a person must approve.'); }],
      [80, 'Decision: approve return to primary', () => {}, ['Approve RB-102 as NOC Engineer', h => { h.set({ rbState: 'done' }); h.audit('Approved RB-102 return to primary', 'Priya S. (NOC Engineer)'); }]],
      [120, 'Traffic back on primary; POS 190 ms, Roof Hub 0.7 s', h => { h.health('up'); h.verify([['POS path < 400 ms', '190 ms'], ['ERP login probe', 'OK'], ['Tunnels on wan1', 'up']]); h.sig('Orchestrator', 'Override removed; all classes on wan1', 'Info'); }],
      [150, 'Resolved; LTE kept as hot standby', h => { h.agent('comms', 'Branch told: back on the main line, nothing to do.'); h.resolve('Auto-resolved (zero touch)'); }],
    ] }),
  mk({ id: 'fibercut', area: 'SD-WAN and carriers', title: 'Fibre cut: carrier case opened with proof, not a guess', icon: 'RadioTower', who: 'Runs on its own', runbook: 'RB-106', systems: ['aruba', 'opsramp', 'servicenow', 'movaio'],
    story: { problem: 'The AT&T DIA circuit at Atlanta #3 drops to 100% loss. The branch fails over to its Comcast broadband line in 4 seconds.', impact: 'No trading impact, but without proof the carrier often closes these as no trouble found (875 NTF tickets in the last 6 months).', resolution: 'The Carrier Agent attaches loss graphs, MTR from the EdgeConnect and a demarc loopback result before opening the case, so AT&T dispatches on the first call.' },
    branch: () => byName('Atlanta #3') || pickB('Atlanta', null, 3),
    steps: [
      [0, 'Orchestrator: wan1 loss 100%, failover to wan2 in 4 s', h => { h.open({ pri: 'P3', cat: 'Carrier / LEC', title: 'Primary circuit down – AT&T DIA, branch on broadband', ci: h.b.wan[0], impact: ['Trading normally on backup'] }); h.circ(0, { status: 'Down' }); h.health('degraded'); h.sig('Orchestrator', `${h.b.wan[0]} loss 100%, both directions; traffic on wan2`, 'Critical', 14, 12); }],
      [30, 'Diagnosis: fault is upstream of the demarc (91%)', h => { h.set({ state: 'In Progress', acked: h.T, assignee: 'Carrier Agent' }); h.rca([['Carrier fault upstream of demarc', 0.91, 'EC port up/up; NTE shows LOS on line side; 2 other AT&T circuits in the same CO alarmed'], ['Branch power / NTE power', 0.05, 'UPS normal']]); h.agent('diagnosis', 'Line-side loss of signal on the NTE; the branch side is clean.'); }],
      [60, 'Carrier Agent: demarc loopback test fails on the carrier side', h => { h.sig('LEC portal', 'Loopback from AT&T test head: FAIL at CO side; branch NTE loop: PASS', 'Major'); }],
      [90, 'Case opened with evidence pack; AT&T dispatches on first call', h => { const no = h.kase('AT&T', 'Dispatched – LEC tech', ['60-min loss graph', 'MTR from EdgeConnect', 'Demarc loopback result', 'Timestamps UTC/CT']); h.set({ state: 'On Hold – Carrier' }); h.agent('carrier', `${no} opened with proof of a line-side fault. Classified as carrier fault, not NTF.`); }],
      [120, 'StoreOps told: trading normally on backup', h => { h.agent('comms', 'Branch manager: main line down, you are on the backup and everything works. We will tell you when it is fixed.'); }],
    ] }),
  mk({ id: 'lte', area: 'Predict and prevent', title: 'Weekly failover test finds a dead backup before it is needed', icon: 'ShieldAlert', who: 'Runs on its own', runbook: 'RB-106', systems: ['aruba', 'opsramp', 'servicenow', 'movaio'],
    story: { problem: 'The Sunday night failover test at Tulsa #5 shows the Verizon LTE backup passes no traffic. The SIM was suspended after a plan change.', impact: 'If the primary fails this week the branch goes fully offline: no POS, ERP or delivery tracking.', resolution: 'The agent opens an account case (not a repair ticket) with the PDP reject code, the SIM is reactivated and the re-test passes, all before Monday 06:30.' },
    branch: () => byName('Tulsa #5') || pickB('Tulsa', null, 1),
    steps: [
      [0, 'Synthetic failover test: wan2 passes no traffic', h => { h.open({ pri: 'P3', cat: 'Carrier / LEC', title: 'Backup LTE/5G not passing traffic – Verizon SIM suspended', ci: h.b.wan[1], impact: ['No failover path if the primary fails'] }); h.circ(1, { status: 'Down' }); h.health('degraded'); h.sig('Synthetic', 'Weekly failover test FAILED on wan2', 'Major'); }],
      [30, 'Diagnosis: PDP reject cause 33, line suspended on the account', h => { h.set({ state: 'In Progress', acked: h.T, assignee: 'Carrier Agent' }); h.rca([['SIM suspended on carrier account', 0.92, 'PDP reject cause 33; same modem firmware works at 212 branches'], ['Modem fault', 0.04, 'Modem responds on OOB']]); }],
      [60, 'Account case with Verizon business (not a repair ticket)', h => { h.kase('Verizon', 'Open – account team', ['PDP reject log', 'ICCID', 'Plan history']); h.agent('carrier', 'Routed to the account team, which fixes suspensions in hours instead of days.'); }],
      [110, 'SIM reactivated; failover test re-run', h => { h.circ(1, { status: 'Up' }); h.sig('Synthetic', 'Failover test PASS: POS 260 ms, ERP OK on LTE', 'Info'); }],
      [140, 'Resolved before opening; preventive fix noted', h => { h.health('up'); h.verify([['wan2 passes failover test', 'PASS'], ['POS path over LTE', '260 ms']]); h.agent('knowledge', 'KB updated: plan changes must include a SIM status check.'); h.resolve('Carrier / LEC'); }],
    ] }),
  mk({ id: 'yardap', area: 'LAN and Wi-Fi', title: 'Yard access point drops: fixed with a port bounce', icon: 'Wifi', who: 'Runs on its own', runbook: 'RB-103', systems: ['central', 'opsramp', 'servicenow', 'movaio'],
    story: { problem: 'The outdoor AP covering the yard at Houston #5 goes offline. Its PoE port is drawing 0 W.', impact: 'Yard handhelds lose signal; loaders fall back to paper pick tickets.', resolution: 'The AP is already down, so bouncing its port cannot make anything worse. The agent runs RB-103 straight away and the AP is back in 3 minutes.' },
    branch: () => pickB('Houston', null, 4),
    steps: [
      [0, 'Aruba Central: yard AP down, PoE 0 W', h => { const ap = D.devicesOf(h.b.id).find(d => d.role === 'Outdoor yard') || D.devicesOf(h.b.id).find(d => d.type === 'AP'); h.open({ pri: 'P3', cat: 'Wireless', title: 'Yard AP offline – handhelds losing signal', ci: ap.id, impact: ['Yard scanners offline', 'Paper pick tickets in use'] }); h.health('degraded'); h.sig('Aruba Central', `${ap.id} down; switch port PoE draw 0 W`, 'Major', 3, 2); }],
      [30, 'Diagnosis: PoE negotiation hung (84%)', h => { h.set({ state: 'In Progress', acked: h.T, assignee: 'Runbook Agent', runbook: 'RB-103', conf: 0.84 }); h.rca([['PoE negotiation hung after brown-out', 0.84, 'UPS logged a 2 s sag at 10:12; port up, 0 W'], ['Cable damage in yard', 0.1, 'No CRC errors before the drop']]); h.agent('runbook', 'Device already down, so the port bounce is allowed during branch hours (autonomy L3).'); }],
      [60, 'RB-103: shut / no-shut, LLDP neighbour back', h => { h.set({ rbState: 'done' }); h.sig('Aruba Central', 'PoE 22.4 W, AP booting', 'Info'); }],
      [100, 'AP online, 11 handhelds re-associated', h => { h.health('up'); h.verify([['AP up in Central', 'yes'], ['Handhelds re-associated', '11']]); h.agent('comms', 'Yard lead told: scanners are back.'); h.resolve('Auto-resolved (zero touch)'); }],
    ] }),
  mk({ id: 'scanners', area: 'LAN and Wi-Fi', title: 'Handheld scanners keep dropping in the racking aisles', icon: 'ScanLine', who: 'A person approves', runbook: 'RB-104', systems: ['central', 'servicenow', 'movaio'],
    story: { problem: 'Receiving at Orlando #2 reports handhelds losing their session halfway down aisles 4 to 7.', impact: 'Goods-in is slower and stock gets scanned twice.', resolution: 'Diagnosis finds co-channel interference and late roaming by older handhelds. Confidence is 62%, so an engineer approves a new radio profile; drops fall from 41 to 3 per 10 minutes.' },
    branch: () => pickB('Orlando', null, 1),
    steps: [
      [0, 'Branch call + 41 deauths in 10 min on SRS-SCAN', h => { h.open({ pri: 'P3', cat: 'Wireless', title: 'Handheld scanners dropping in warehouse aisles', ci: `${h.b.code}-ap02`, impact: ['Receiving slower, double scans'] }); h.health('degraded'); h.sig('Aruba Central', '41 deauth events on SRS-SCAN in 10 min, aisles 4–7', 'Minor', 6, 4); }],
      [40, 'Diagnosis: co-channel on ch 36 + late roaming (62%)', h => { h.set({ state: 'In Progress', acked: h.T, assignee: 'Neha R.', conf: 0.62 }); h.rca([['Co-channel interference and late roaming of older handhelds', 0.62, 'ap02 and ap03 both on ch 36; handheld RSSI drops to -78 before roam'], ['DHCP lease exhaustion', 0.12, 'Scope 61% used']]); h.agent('runbook', 'Recommends: AirMatch re-plan, enable 2.4 GHz on SRS-SCAN for this site, min RSSI -72. Below 80% confidence, so a person decides.'); }],
      [80, 'Decision: approve radio profile change', () => {}, ['Approve as Network Engineer L3', h => { h.set({ runbook: 'RB-104', rbState: 'done' }); h.audit('Approved radio profile change for SRS-SCAN', 'Marcus L. (Network Engineer L3)'); }]],
      [120, 'Profile pushed; walk test by branch lead', h => { h.sig('Aruba Central', 'ap02 ch 36 → 52, ap03 ch 36 → 149; 2.4 GHz enabled on SRS-SCAN', 'Info'); }],
      [160, 'Deauths 3 per 10 min; resolved', h => { h.health('up'); h.verify([['Deauths per 10 min', '3'], ['Branch complaints, 2 h', 'none']]); h.resolve('Config change'); }],
    ] }),
  mk({ id: 'loop', area: 'LAN and Wi-Fi', title: 'A desk switch causes a broadcast storm in the back office', icon: 'Repeat', who: 'Runs unless stopped', runbook: 'RB-103', systems: ['central', 'opsramp', 'servicenow', 'movaio'],
    story: { problem: 'Core switch CPU at Miami #3 jumps to 94%. Someone plugged an unmanaged desk switch into two wall ports.', impact: 'Back-office PCs and printers crawl; the counter is starting to feel it.', resolution: 'Loop-protect has already blocked one port; the agent keeps it blocked, asks the branch to remove the desk switch and opens a template change to turn on BPDU guard everywhere.' },
    branch: () => pickB('Miami', null, 2),
    steps: [
      [0, 'OpsRamp: CPU 94%, broadcast 48k pps on 1/1/17', h => { h.open({ pri: 'P2', cat: 'Customer-caused', title: 'Broadcast storm – core switch CPU 94%', ci: `${h.b.code}-sw01`, impact: ['Back-office PCs and printers slow'] }); h.health('degraded'); h.sig('OpsRamp', 'CPU 94%, broadcast 48k pps on 1/1/17', 'Critical', 31, 28); }],
      [30, 'Loop-protect blocked 1/1/17; MAC flapping 1/1/17 ↔ 1/1/18', h => { h.set({ state: 'In Progress', acked: h.T, assignee: 'Runbook Agent', conf: 0.88 }); h.rca([['Loop through an unmanaged desk switch on two wall ports', 0.88, 'MAC flapping between 1/1/17 and 1/1/18; both patch to back office desk 4']]); }],
      [60, 'RB-103 keeps the port shut (stop available for 5 min)', h => { h.set({ runbook: 'RB-103', rbState: 'done' }); h.agent('runbook', 'Port 1/1/17 stays disabled. Runs unless an engineer stops it within 5 minutes.'); }],
      [90, 'Branch asked to unplug the desk switch', h => { h.agent('comms', 'Branch manager: please unplug the small switch under desk 4. Nothing else needed.'); h.sig('OpsRamp', 'CPU 18%, broadcast 600 pps', 'Info'); h.health('up'); }],
      [130, 'Prevention: BPDU guard template change raised', h => { h.change({ title: 'Branch template v42: BPDU guard on back-office ports (all sites)', scope: 'All regions', devices: 1792, owner: 'Knowledge Agent' }); h.verify([['CPU < 40%', '18%'], ['Broadcast < 1k pps', '600 pps']]); h.resolve('Customer-caused'); }],
    ] }),
  mk({ id: 'drift', area: 'Security and lifecycle', title: 'Unapproved local admin account found on a switch', icon: 'GitCompare', who: 'A person approves', runbook: 'RB-105', systems: ['central', 'servicenow', 'movaio'],
    story: { problem: 'The nightly backup at Charlotte #2 shows a local admin account "branchtech" that is not in the golden config.', impact: 'A shared local login bypasses TACACS+ and MFA, and breaks PCI access rules.', resolution: 'Security approves restoring the golden config after the branch closes; the account is removed and the change is logged against the person who added it.' },
    branch: () => pickB('Charlotte', null, 1),
    steps: [
      [0, 'Drift: local admin "branchtech" not in golden config', h => { h.open({ pri: 'P3', cat: 'Config management', title: 'Config drift – unapproved local admin account', ci: `${h.b.code}-sw02`, impact: ['Access outside TACACS+/MFA'] }); h.sig('OpsRamp', 'Diff vs NaC golden v41: + user branchtech group administrators', 'Major'); }],
      [30, 'Change history: added by CLI at 14:12 yesterday, no CHG', h => { h.set({ state: 'In Progress', acked: h.T, assignee: 'Omar N.', conf: 0.97 }); h.rca([['Manual CLI change outside change control', 0.97, 'TACACS+ accounting shows the session; no matching CHG']]); h.agent('change', 'Restore golden config after close (branch open now). Security approval required.'); }],
      [60, 'Decision: approve restore after branch close', () => {}, ['Approve as Security Lead', h => { h.change({ title: `Restore golden config ${h.b.code}-sw02 (remove local admin)` }); h.audit('Approved golden-config restore after close', 'Omar N. (Security Lead)'); }]],
      [100, 'Restored at 17:05 local; diff = 0', h => { h.set({ runbook: 'RB-105', rbState: 'done' }); h.verify([['Diff vs golden', '0 lines'], ['TACACS+ login test', 'OK']]); h.resolve('Config change'); }],
    ] }),
  mk({ id: 'dhcp', area: 'LAN and Wi-Fi', title: 'New handhelds cannot get an address after a rollout', icon: 'Network', who: 'A person approves', runbook: 'RB-105', systems: ['central', 'opsramp', 'servicenow', 'movaio'],
    story: { problem: 'Dallas #4 received 24 new handhelds. The scanner VLAN DHCP scope is now 100% used.', impact: 'New handhelds cannot connect; the old ones still work.', resolution: 'The agent proposes widening the scope from /25 to /24 and shortening the lease. Confidence is 79%, so an engineer approves; the new handhelds connect within minutes.' },
    branch: () => pickB('Dallas', null, 3),
    steps: [
      [0, 'OpsRamp: VLAN 30 scope 100% used', h => { h.open({ pri: 'P3', cat: 'Customer-caused', title: 'DHCP scope exhausted on VLAN 30 (scanners/handhelds)', ci: `${h.b.code}-sw01`, impact: ['New handhelds cannot connect'] }); h.health('degraded'); h.sig('OpsRamp', 'DHCP scope 10.x.30.0/25 100% used; 24 new MACs in 2 days', 'Major', 4, 3); }],
      [40, 'Proposal: /25 → /24, lease 8 d → 1 d (79%)', h => { h.set({ state: 'In Progress', acked: h.T, assignee: 'Sanjay K.', conf: 0.79 }); h.rca([['Handheld rollout without IPAM update', 0.79, '24 new MACs; no IPAM request']]); }],
      [80, 'Decision: approve the scope change', () => {}, ['Approve as Network Engineer L3', h => { h.set({ runbook: 'RB-105', rbState: 'done' }); h.audit('Approved DHCP scope change VLAN 30', 'Marcus L. (Network Engineer L3)'); }]],
      [120, '24 new handhelds online; resolved', h => { h.health('up'); h.verify([['Scope used', '58%'], ['New handhelds online', '24/24']]); h.agent('knowledge', 'Readiness check added: scanner scope utilisation over 85% flags before opening.'); h.resolve('Config change'); }],
    ] }),
  mk({ id: 'cve', area: 'Security and lifecycle', title: 'Critical access point vulnerability: exposure to patched in waves', icon: 'Bug', who: 'A person approves', runbook: 'HPESBNW04712', systems: ['central', 'servicenow', 'movaio'],
    story: { problem: 'HPE Aruba Networking bulletin HPESBNW04712 (CVE-2024-42505/6/7, CVSS 9.8) covers unauthenticated command injection over PAPI on AOS 10 below 10.6.0.3.', impact: 'Every access point on AOS 10.4 or 10.5 is exposed until patched.', resolution: 'The agent counts the exposed APs by branch, Security approves a fleet mitigation, and patch waves run region by region after branch close with a canary first.' },
    branch: () => pickB('Tampa', null, 0),
    focus: () => ({ module: 'vuln' }),
    steps: [
      [0, 'Bulletin matched against running firmware', h => { const n = D.DEVICES.filter(d => D.ADVISORIES[0].affects(d)).length; const br = new Set(D.DEVICES.filter(d => D.ADVISORIES[0].affects(d)).map(d => d.branchId)).size; h.open({ pri: 'P2', cat: 'Security', title: `HPESBNW04712 – ${n} access points exposed at ${br} branches`, ci: 'AP fleet (AOS 10.4/10.5)', impact: [`${n} APs exposed`, 'No branch impact yet'] }); h.sig('Mova iO', `${n} APs on AOS 10.5.1.4 / 10.4.1.2 match CVE-2024-42505/6/7`, 'Critical'); }],
      [40, 'Mitigation proposed: block UDP 8211 from untrusted networks', h => { h.set({ state: 'In Progress', acked: h.T, assignee: 'Omar N.', conf: 0.95 }); h.agent('change', 'Mitigation is a policy change with no client impact; patches need reboots, so they wait for branch close.'); }],
      [80, 'Decision: approve fleet mitigation', () => {}, ['Approve as Security Lead', h => { h.audit('Approved fleet mitigation for HPESBNW04712', 'Omar N. (Security Lead)'); h.sig('Aruba Central', 'Cluster security policy pushed: UDP 8211 blocked from untrusted networks', 'Info'); }]],
      [120, 'Patch waves scheduled region by region after close', act => {}, null],
      [150, 'Canary wave (20 APs) upgraded to 10.7.1.0, clients back in 3 min', h => { h.verify([['Canary APs on 10.7.1.0', '20/20'], ['Client re-association', '3 min'], ['PAPI exposure on canary', 'none']]); h.agent('comms', 'Security and StoreOps told: mitigation in place, waves nightly 22:00 local.'); }],
    ].map((st, i) => i === 3 ? [st[0], st[1], (h, act) => { ['Southeast', 'Texas & South Central', 'Great Lakes', 'Pacific'].forEach((rg, k) => act.add('changes', { id: `CHG00${32900 + k}`, title: `HPESBNW04712 AP patch wave ${k + 1}: ${rg}`, type: 'Emergency', risk: 'Medium', state: 'Scheduled', start: h.T + (k + 1) * DAY, end: h.T + (k + 1) * DAY + 4 * HR, window: '22:00–02:00 local, canary first', scope: rg, devices: 30 + k * 7, owner: 'Security Lead', validation: 'Passed', nac: 'aps/firmware/papi.yaml' })); h.agent('change', '4 regional waves scheduled after close; a failed canary stops the wave.'); }] : st) }),
  mk({ id: 'eol', area: 'Security and lifecycle', title: '728 Aruba 2530 switches near end of support: refresh plan', icon: 'CalendarClock', who: 'A person approves', runbook: 'Branch-in-a-Box kit', systems: ['central', 'servicenow', 'movaio'],
    story: { problem: 'The Aruba 2530 G models went end of sale in October 2021. Support is expected to end around now, after which no security fixes ship.', impact: '728 switches across the branch fleet would run unpatched; several are already showing PoE port faults.', resolution: 'The Prediction Agent ranks branches by failure risk and traffic; an engineer approves the first refresh wave using the standard CX 6100 kit, with spares pre-staged.' },
    branch: () => pickB('Columbus', null, 0),
    focus: () => ({ module: 'vuln' }),
    steps: [
      [0, 'Lifecycle check: 728 switches on end-of-sale model', h => { h.open({ pri: 'P4', cat: 'Lifecycle', title: 'Aruba 2530 end of support – 728 switches', ci: 'Aruba 2530 fleet', impact: ['No security fixes after end of support'] }); h.sig('Mova iO', '728 x 2530 on YA.16.x; end of sale 2021-10-31; support end est. 2026-10-31', 'Major'); }],
      [40, 'Ranking: 64 branches with PoE faults or > 70% port use first', h => { h.set({ state: 'In Progress', acked: h.T, assignee: 'Marcus L.', conf: 0.86 }); h.agent('prediction', '64 branches ranked first: PoE renegotiations, 2+ reboots in 90 days, or ports over 70% used.'); }],
      [80, 'Decision: approve refresh wave 1 (64 branches)', () => {}, ['Approve as Network Engineer L3', h => { h.change({ title: 'Lifecycle refresh wave 1: 2530 → CX 6100 at 64 branches', devices: 64, scope: 'All regions', window: 'Branch-by-branch after close', risk: 'Medium' }); h.audit('Approved 2530 refresh wave 1', 'Marcus L. (Network Engineer L3)'); }]],
      [120, 'Spares pre-staged at depots; golden configs generated', h => { h.agent('dispatch', 'CX 6100 spares allocated to 6 depots; Network-as-Code configs generated per branch.'); h.verify([['Configs generated', '64/64'], ['Depot spares', 'allocated']]); }],
    ] }),
  mk({ id: 'ups', area: 'Predict and prevent', title: 'UPS battery predicted to fail: replaced before an outage', icon: 'BatteryWarning', who: 'A person approves', runbook: 'PRD-507', systems: ['opsramp', 'servicenow', 'movaio'],
    story: { problem: 'UPS self-tests at Atlanta #1 show runtime falling from 41 to 18 minutes over four weeks.', impact: 'The next utility blip would take the branch network down instead of riding through it.', resolution: 'The Prediction Agent asks for approval, a technician swaps the battery after close and the next self-test shows 44 minutes of runtime.' },
    branch: () => pickB('Atlanta', null, 0),
    steps: [
      [0, 'Prediction: runtime 41 → 18 min over 4 self-tests (86%)', h => { h.open({ pri: 'P4', cat: 'Power', title: 'UPS battery degrading – predicted failure within 30 days', ci: `${h.b.code}-ups01`, impact: ['Next power blip would drop the branch'] }); h.set({ conf: 0.86, rca: [{ cause: 'Battery end of life', conf: 0.86, ev: 'Runtime 41→18 min; battery age 4.2 years' }] }); h.sig('UPS (SNMP)', 'Self-test runtime 18 min at full load', 'Minor'); }],
      [40, 'Decision: approve battery work order', () => {}, ['Approve as NOC Engineer', h => { h.wo('Replace UPS battery pack after close; run self-test', ['Rack & power'], ['UPS battery pack']); h.audit('Approved UPS battery replacement', 'Priya S. (NOC Engineer)'); }]],
      [80, 'Technician matched; visit after 17:00 local', h => { h.set({ state: 'In Progress', acked: h.T, assignee: 'Dispatch Agent' }); h.agent('dispatch', 'Matched a Rack & power technician; spare battery from DEP-ATL.'); }],
      [120, 'Battery swapped; self-test 44 min', h => { h.verify([['UPS self-test', '44 min runtime'], ['Network stayed up during swap', 'yes (bypass)']]); h.resolve('Hardware replaced'); }],
    ] }),
  mk({ id: 'capacity', area: 'Predict and prevent', title: 'Hail season pushes a branch WAN toward its limit', icon: 'TrendingUp', who: 'A person approves', runbook: 'PRD-505', systems: ['aruba', 'opsramp', 'servicenow', 'movaio'],
    story: { problem: 'Primary WAN at Dallas #1 runs at 78% p95 and is rising 2% a week since the hail season started.', impact: 'At this rate it hits 90% in about three weeks, when Roof Hub orders and POS start to queue.', resolution: 'An engineer approves a bandwidth upgrade order and, until it lands, a business-intent policy that protects POS and ERP over bulk traffic.' },
    branch: () => pickB('Dallas', 'SRS Building Products', 0),
    steps: [
      [0, 'Forecast: p95 78%, +2.1%/week, 90% in ~3 weeks (88%)', h => { h.open({ pri: 'P4', cat: 'Capacity', title: 'WAN capacity forecast – 90% in ~3 weeks', ci: h.b.wan[0], impact: ['Queueing for POS and Roof Hub if nothing changes'] }); h.set({ conf: 0.88 }); h.sig('OpsRamp', 'wan1 p95 78% (10-week trend +2.1%/week)', 'Minor'); }],
      [40, 'Decision: approve bandwidth upgrade + interim QoS', () => {}, ['Approve as Network Engineer L3', h => { h.change({ title: `Bandwidth upgrade ${h.b.wan[0]} ${D.CIR[h.b.wan[0]].bw} → ${D.CIR[h.b.wan[0]].bw * 2} Mb/s`, window: 'Carrier install date' }); h.change({ title: 'Interim BIO: protect POS/ERP over bulk at this branch', window: 'Tonight after close' }); h.audit('Approved capacity upgrade and interim QoS', 'Marcus L. (Network Engineer L3)'); }]],
      [80, 'Carrier order placed; install in 12 days', h => { h.set({ state: 'In Progress', acked: h.T, assignee: 'Carrier Agent' }); h.agent('carrier', 'Upgrade order placed with the carrier, install date in 12 days, well before the forecast limit.'); }],
    ] }),
  mk({ id: 'notready', area: 'StoreOps and field', title: 'Branch fails its 05:30 check and opens on time anyway', icon: 'Sunrise', who: 'Runs on its own', runbook: 'RB-103', systems: ['central', 'opsramp', 'servicenow', 'movaio'],
    story: { problem: 'At 05:30 the readiness run at Denver #2 fails two checks: the warehouse label printer and two truck tablets are offline.', impact: 'Without fixes, the first deliveries leave late with handwritten labels.', resolution: 'The branch is still closed, so the agent bounces the printer port and restarts the tablet dock straight away. A re-run at 05:52 passes and StoreOps sees the branch as ready.' },
    branch: () => pickB('Denver', null, 1),
    focus: c => ({ module: 'incidents', selInc: c.id }),
    steps: [
      [0, '05:30 readiness: printer and 2 truck tablets fail', h => { h.open({ pri: 'P3', cat: 'Branch readiness', title: 'Readiness check failed before opening: label printer, truck tablets', ci: `${h.b.code}-sw01`, impact: ['First deliveries at risk'] }); h.health('degraded'); h.sig('OpsRamp', 'Label printer (warehouse) not responding', 'Major'); h.sig('OpsRamp', '2 truck tablets not reporting', 'Minor'); }],
      [30, 'Branch closed: RB-103 runs on its own', h => { h.set({ state: 'In Progress', acked: h.T, assignee: 'Runbook Agent', runbook: 'RB-103', rbState: 'done', conf: 0.9 }); h.agent('runbook', 'Branch opens at 06:30, so port bounces are allowed now (no trading).'); }],
      [70, 'Printer back; tablets re-check in after dock restart', h => { h.sig('OpsRamp', 'Label printer responding; test label printed', 'Info'); h.sig('OpsRamp', 'Truck tablets 2/2 reporting', 'Info'); }],
      [100, '05:52 re-run: all six checks pass', h => { h.health('up'); h.verify([['Readiness re-run', '6/6 pass'], ['Test label', 'printed']]); h.agent('comms', 'StoreOps: Denver #2 ready to open at 06:30.'); h.resolve('After-hours mended'); }],
    ] }),
];

const META = {
  mpls: { area: 'SD-WAN and carriers', who: 'A person approves', runbook: 'RB-101', systems: ['aruba', 'opsramp', 'newrelic', 'servicenow', 'movaio'], story: { problem: 'AT&T MPLS at Houston #1 shows 34 ms jitter and 1.2% loss during trading hours. 43 alerts arrive in two minutes.', impact: 'Card payments and Roof Hub orders slow down at the counter.', resolution: 'Correlation makes it one P2, SD-WAN steers POS/ERP/Roof Hub to broadband, AT&T gets a case with evidence and StoreOps is told inside 6 minutes.' } },
  power: { area: 'StoreOps and field', who: 'Runs on its own', runbook: 'RB-107', systems: ['opsramp', 'aruba', 'servicenow', 'movaio'], story: { problem: 'Tampa #1 loses utility power; the UPS carries the network for 38 minutes.', impact: '23 downstream alarms would normally flood the NOC; the branch eventually goes dark.', resolution: 'Power is treated as the parent, 23 alarms are suppressed, the branch is kept informed and a technician is dispatched for the restore.' } },
  ec: { area: 'SD-WAN and carriers', who: 'A person approves', runbook: 'RB-108', systems: ['aruba', 'opsramp', 'servicenow', 'movaio'], story: { problem: 'The EdgeConnect at Phoenix #1 stops answering on both paths.', impact: 'ERP, POS, Roof Hub and delivery tracking are down at the branch: a P1.', resolution: 'Remote recovery is tried and fails, a technician is sent with a pre-staged spare, zero-touch brings it up and the CMDB serial updates itself.' } },
  storm: { area: 'SD-WAN and carriers', who: 'A person approves', runbook: 'Major incident', systems: ['aruba', 'opsramp', 'servicenow', 'movaio'], story: { problem: 'Hail and thunderstorms hit Dallas–Fort Worth: 64 alerts from 7 branches in 9 minutes.', impact: 'One branch offline, five on LTE, one on battery; LTE data burn triples.', resolution: 'One major incident instead of seven, one master Spectrum case, a regional change freeze, hourly leadership updates and a temporary LTE uplift for approval.' } },
  cutover: { area: 'Branch-in-a-Box', who: 'A person approves', runbook: '13 cutover gates', systems: ['aruba', 'central', 'servicenow', 'movaio'], story: { problem: 'LS Building Products (acquired) moves onto the SRS standard over a weekend.', impact: 'The branch must open Monday 06:00 with POS, ERP, Roof Hub and delivery tracking working.', resolution: 'Thirteen timed gates with evidence; gate 9 fails on legacy handhelds, a site override is approved and the re-test passes, StoreOps signs off.' } },
  fw: { area: 'LAN and Wi-Fi', who: 'Runs on its own', runbook: 'CHG0031874', systems: ['central', 'servicenow', 'movaio'], story: { problem: 'The Florida AP firmware wave upgrades a canary group of 10 APs.', impact: 'Older handhelds start failing fast roaming; a full wave would hit 112 APs.', resolution: 'Change Validation stops the rollout on its own, the canary rolls back off-hours and a revised plan goes for approval.' } },
};
// Control modes (see the Live demos page for the rules):
//   Autonomous         – runs on its own inside a policy people set and audit (human over the loop)
//   Human-on-the-loop  – runs on its own; a person watches live and can stop it in the stop window
//   Human-in-the-loop  – waits until a named person approves
const MODE = { 'Runs on its own': 'Autonomous', 'Runs unless stopped': 'Human-on-the-loop', 'A person approves': 'Human-in-the-loop' };
const MODE_OVR = { failback: 'Human-on-the-loop', fw: 'Human-on-the-loop' };
const TITLE = {
  mpls: 'MPLS jitter during trading hours', power: 'Utility power loss at a branch', ec: 'EdgeConnect hardware failure', storm: 'Severe weather across Dallas–Fort Worth',
  cutover: 'Acquired branch cutover weekend', fw: 'Access point firmware wave stopped at canary', failback: 'Return to primary circuit after carrier repair',
  fibercut: 'Primary circuit down: carrier fault', lte: 'Backup LTE fails the weekly failover test', yardap: 'Yard access point offline',
  scanners: 'Handheld scanners dropping in the warehouse', loop: 'Broadcast storm from an unmanaged desk switch', drift: 'Unapproved local admin account on a switch',
  dhcp: 'DHCP scope full after a handheld rollout', cve: 'Critical access point vulnerability (HPESBNW04712)', eol: 'Aruba 2530 end of support: refresh wave 1',
  ups: 'UPS battery predicted to fail', capacity: 'WAN capacity forecast for hail season', notready: 'Branch fails its 05:30 readiness check',
};
export const MODES = ['Autonomous', 'Human-on-the-loop', 'Human-in-the-loop'];
export const DEMOS = [...SCENARIOS.map(sc => ({ ...sc, ...META[sc.id] })), ...NEW].map(d => ({ ...d, title: TITLE[d.id] || d.title, who: MODE_OVR[d.id] || MODE[d.who] || d.who }));
export const demoById = id => DEMOS.find(d => d.id === id);
