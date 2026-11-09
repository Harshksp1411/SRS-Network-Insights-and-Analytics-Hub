// Alert storms, step by step: what arrives from every tool during one event, what is merged as a duplicate,
// what is suppressed and why, what is correlated into one incident, what is added to it, and the ticket that
// lands in ServiceNow. Four replays built from the console's own branches, devices, circuits and changes.
import * as D from './data.js';

export const STAGES = [
  { k: 'raw', label: 'Events in', short: 'Raw events from every tool' },
  { k: 'dedup', label: 'Deduplicated', short: 'Repeats and the same fault seen by two tools merged' },
  { k: 'suppress', label: 'Suppressed', short: 'Symptoms of a known cause, planned work, flaps and info held back' },
  { k: 'corr', label: 'Correlated', short: 'What is left grouped into one event' },
  { k: 'enrich', label: 'Enriched', short: 'CI, branch hours, impact, changes, history and KB added' },
  { k: 'ticket', label: 'ServiceNow', short: 'One ticket created, or an existing one updated' },
];

// why an event stops, and at which stage
export const FATE = {
  dup: { stage: 1, label: 'Duplicate', tone: 'gray', note: n => `${n} repeats added to the count on the alert already open` },
  xdup: { stage: 1, label: 'Same fault, other tool', tone: 'gray', note: () => 'Already reported by another tool' },
  child: { stage: 2, label: 'Child of a down parent', tone: 'purple', note: () => 'Behind a device that is already down' },
  window: { stage: 2, label: 'Planned work', tone: 'blue', note: () => 'Inside an approved change window' },
  flap: { stage: 2, label: 'Flapping', tone: 'amber', note: () => 'Held as one flapping alert' },
  info: { stage: 2, label: 'Information only', tone: 'gray', note: () => 'Goes to the digest, no ticket' },
  clear: { stage: 2, label: 'Cleared by itself', tone: 'green', note: () => 'Recovered inside the 5-minute hold-down' },
  upstream: { stage: 2, label: 'Upstream already ticketed', tone: 'blue', note: () => 'Simplify raised the ServiceNow ticket for this access link' },
  root: { stage: 9, label: 'Root cause', tone: 'red', note: () => 'Opens the incident' },
  impact: { stage: 9, label: 'Impact evidence', tone: 'amber', note: () => 'Attached to the incident to show impact' },
};

const brOf = id => D.BR[id];
const devs = (b, type) => D.DEVICES.filter(d => d.branchId === b.id && d.type === type);
const range = list => list.length > 1 ? `${list[0].id}…${list[list.length - 1].id.split('-').pop()}` : list[0] ? list[0].id : '';

// ── 1. A branch goes dark: the EdgeConnect stops answering, everything behind it alarms ──
function branchDark() {
  const inc = D.INCIDENTS.find(i => i.kind === 'edgedown'); const b = brOf(inc ? inc.branchId : D.BRANCHES[276].id);
  const ec = `${b.code}-ec01`, sws = devs(b, 'Switch'), aps = devs(b, 'AP');
  const rows = [
    { src: 'Orchestrator', ci: ec, msg: 'EdgeConnect lost contact with Orchestrator', sev: 'Critical', n: 10, fate: 'root' },
    { src: 'OpsRamp', ci: ec, msg: 'Ping and SNMP to the EdgeConnect failed', sev: 'Critical', n: 20, fate: 'xdup' },
    { src: 'Orchestrator', ci: ec, msg: 'Tunnels to DC1, DC2 and cloud down', sev: 'Critical', n: 30, fate: 'child' },
    { src: 'OpsRamp', ci: range(sws), msg: `${sws.length} switch${sws.length > 1 ? 'es' : ''} unreachable (SNMP timeout)`, sev: 'Major', n: 10 * sws.length, fate: 'child', devices: sws.length },
    { src: 'Aruba Central', ci: range(aps), msg: `${aps.length} access point${aps.length > 1 ? 's' : ''} disconnected from Central`, sev: 'Major', n: 2 * aps.length, fate: 'child', devices: aps.length },
    { src: 'OpsRamp', ci: range(sws), msg: 'Interface down on switch uplinks', sev: 'Minor', n: 2 * sws.length, fate: 'child' },
    { src: 'Synthetic', ci: `${b.code} POS`, msg: 'Card payment path test failed', sev: 'Critical', n: 10, fate: 'impact' },
    { src: 'New Relic', ci: `${b.code} ERP`, msg: 'ERP login test from the branch failed', sev: 'Major', n: 10, fate: 'impact' },
    { src: 'OpsRamp', ci: ec, msg: 'Repeat: EdgeConnect still unreachable (each poll)', sev: 'Critical', n: 10, fate: 'dup' },
  ];
  return {
    id: 'dark', name: 'A branch goes dark', b, icon: 'Unplug', mins: 10,
    story: `The SD-WAN appliance at ${b.name} stops answering. Every switch, access point and test behind it alarms too, once a minute, from four tools.`,
    rows, incidents: 1,
    corr: [`Topology: every alarm is on the path behind ${ec}`, 'Time: all inside the same 10 minutes', 'Same branch, one event'],
    enrich: [
      ['CI from the CMDB', `${ec}, EC-XS, ${b.name}`],
      ['Branch hours', `Open now (${b.hours.open} to ${b.hours.close} local)`],
      ['Impact', 'Card payments and ERP down at the branch'],
      ['Circuits', 'Both carrier lines up at the modems, so not a carrier fault'],
      ['Open changes', 'None on this branch'],
      ['History', '2 similar EdgeConnect hangs in 90 days, both fixed by remote recovery'],
      ['Knowledge', 'KB0012102 Branch unreachable: treat the EdgeConnect as parent'],
      ['Next step', 'RB-108 EdgeConnect remote recovery (needs approval)'],
    ],
    ticket: { action: 'Created', number: inc ? inc.id : 'INC0384702', impact: 'Medium (one branch down)', urgency: 'High (branch open)', pri: 'P2', cat: 'SD-WAN', ci: ec, group: 'Movate NOC – L2 Network', state: 'New', short: 'Branch unreachable – EdgeConnect not responding', desc: `OpsRamp grouped the alarms from Orchestrator, OpsRamp, Aruba Central, synthetics and New Relic into this incident. ${ec} stopped answering; the switches and access points behind it were suppressed as child alarms. Card payment and ERP tests from the branch fail.`, branchId: b.id, incId: inc && inc.id },
  };
}

// ── 2. A carrier fibre cut takes the primary line at several branches ──
function fibreCut() {
  const cs = D.CIRCUITS.filter(c => c.role === 'Primary' && c.carrier === 'Spectrum' && brOf(c.branchId).city === 'Dallas' && !/LTE|5G/.test(c.type)).slice(0, 9);
  const n = cs.length, b = brOf(cs[0].branchId);
  const rows = [
    { src: 'Orchestrator', ci: `${n} Spectrum circuits`, msg: 'wan1 loss 100%, tunnel down', sev: 'Critical', n: 6 * n, fate: 'upstream', devices: n },
    { src: 'OpsRamp', ci: `${n} EdgeConnects`, msg: 'wan1 interface down', sev: 'Critical', n: 6 * n, fate: 'xdup', devices: n },
    { src: 'Simplify', ci: `${n} access links`, msg: 'Access link down: ServiceNow ticket raised by Simplify', sev: 'Major', n: n, fate: 'upstream', devices: n },
    { src: 'Orchestrator', ci: `${n} EdgeConnects`, msg: 'Card payments, ERP and voice moved to LTE backup', sev: 'Info', n: n, fate: 'info' },
    { src: 'Synthetic', ci: `${n} branches`, msg: 'Card payment test OK on the backup path', sev: 'Info', n: 3 * n, fate: 'info' },
    { src: 'New Relic', ci: `${n} branches`, msg: 'ERP response 1.9 s on backup (normal 1.2 s)', sev: 'Minor', n: 4 * n, fate: 'dup' },
    { src: 'Carrier portal', ci: 'Spectrum Dallas', msg: 'Fibre cut by third-party excavation, crew dispatched', sev: 'Major', n: 1, fate: 'info' },
    { src: 'Orchestrator', ci: `${n} LTE links`, msg: 'Backup LTE healthy, 24 to 41 Mb/s', sev: 'Info', n: 2 * n, fate: 'info' },
  ];
  return {
    id: 'fibre', name: 'Carrier fibre cut', b, icon: 'Scissors', mins: 15,
    story: `A Spectrum fibre is cut in Dallas. ${n} branches lose their primary line at the same moment and move to LTE backup. Simplify watches the access links and raises the tickets.`,
    rows, incidents: 0,
    corr: [`Carrier and location: ${n} branches on the same Spectrum segment in Dallas`, 'Time: all inside 40 seconds', 'Upstream: Simplify already raised a ServiceNow ticket for each access link'],
    enrich: [
      ['CIs', `${n} Spectrum circuits, ${n} EdgeConnects`],
      ['Branch hours', 'Open now at all of them'],
      ['Impact', 'None: every branch is running on LTE backup; ERP a little slower'],
      ['Carrier', 'Spectrum confirms a fibre cut, crew dispatched'],
      ['Backup health', 'All LTE links healthy and inside the data plan'],
      ['Watch', 'Alert if any branch loses the backup too, or the cut lasts over 4 hours'],
    ],
    ticket: { action: 'Updated, not created', number: `${n} Simplify tickets`, caller: 'Simplify integration', impact: 'Low (on backup)', urgency: 'High (branches open)', pri: 'P3', cat: 'Carrier / LEC', ci: `${n} Spectrum circuits`, group: 'Simplify (upstream)', state: 'In Progress', short: `Spectrum fibre cut, Dallas: ${n} branches on LTE backup`, desc: `Simplify raised the access-link tickets. OpsRamp created no ticket of its own, so SRS sees each outage once. It added the evidence (loss, failover times, backup health) to Simplify's tickets as work notes and tagged them with one correlation ID so the NOC handles them as one event.`, branchId: b.id },
  };
}

// ── 3. A firmware wave reboots every access point in its change window ──
function firmwareWave() {
  const chg = D.CHANGES.find(c => c.id === 'CHG0031902') || D.CHANGES[0];
  const n = chg.devices || 96, branches = 31;
  const b = D.BRANCHES.find(x => x.state === 'GA') || D.BRANCHES[0];
  const rows = [
    { src: 'Aruba Central', ci: `${n} APs`, msg: 'Access point down (rebooting to new firmware)', sev: 'Major', n, fate: 'window', devices: n },
    { src: 'Aruba Central', ci: `${n} APs`, msg: 'Access point up', sev: 'Info', n, fate: 'info' },
    { src: 'OpsRamp', ci: `${branches} switches`, msg: 'PoE port down and up on AP ports', sev: 'Minor', n: 2 * n, fate: 'window' },
    { src: 'Aruba Central', ci: `${branches} branches`, msg: 'Clients disconnected', sev: 'Minor', n: branches * 3, fate: 'window' },
    { src: 'Aruba Central', ci: `${n} APs`, msg: 'Repeat: AP not checked in (each poll)', sev: 'Major', n: n * 2, fate: 'dup' },
    { src: 'Aruba Central', ci: `${b.code}-ap03, ${b.code}-ap05`, msg: 'Still down 15 minutes after the window closed', sev: 'Major', n: 2, fate: 'root', devices: 2 },
  ];
  return {
    id: 'firmware', name: 'Firmware wave', b, icon: 'CalendarClock', mins: 240,
    story: `${chg.id} upgrades ${n} access points at ${branches} Georgia branches overnight. Every AP reboots, so every AP alarms. The change window holds those back; only APs that do not come back are raised.`,
    rows, incidents: 1,
    corr: [`Change: both APs are in scope of ${chg.id}`, 'Same branch, same symptom after the window', 'Checked 15 minutes after the window closed'],
    enrich: [
      ['CIs', `${b.code}-ap03, ${b.code}-ap05 (AP-515)`],
      ['Branch hours', `Closed now; opens at ${b.hours.open} local`],
      ['Impact', 'Yard Wi-Fi reduced when the branch opens'],
      ['Change', `${chg.id} ${chg.title}`],
      ['History', 'Same model needed a second reboot in wave 1 at 3 APs'],
      ['Next step', 'RB-104 AP reboot from Aruba Central (runs without approval: branch closed)'],
    ],
    ticket: { action: 'Created', number: 'INC0384811', impact: 'Low (two APs)', urgency: 'Low (branch closed)', pri: 'P4', cat: 'Wireless', ci: `${b.code}-ap03`, group: 'Movate Network SME – L3 (change owner)', state: 'New', short: `2 APs did not return after ${chg.id}`, desc: `The change window suppressed ${n} AP reboots and the alarms that came with them. Two APs at ${b.name} were still down 15 minutes after it closed, so OpsRamp raised one ticket linked to ${chg.id} for the change owner.`, branchId: b.id, chg: chg.id },
  };
}

// ── 4. A noisy night at one branch: a flapping line, blips that clear, and info ──
function noisyNight() {
  const b = D.BR[D.CIRCUITS.find(c => c.flaps30 >= 4 && c.role === 'Primary')?.branchId] || D.BRANCHES[10];
  const c = D.CIRCUITS.find(x => x.id === b.wan[0]);
  const rows = [
    { src: 'Orchestrator', ci: c.id, msg: 'wan1 down / up: flapped 14 times in 30 minutes', sev: 'Major', n: 28, fate: 'flap' },
    { src: 'OpsRamp', ci: `${b.code}-ec01`, msg: 'wan1 interface down / up', sev: 'Major', n: 28, fate: 'xdup' },
    { src: 'Orchestrator', ci: c.id, msg: 'Line still flapping after 30 minutes', sev: 'Major', n: 1, fate: 'root' },
    { src: 'Orchestrator', ci: `${b.code}-ec01`, msg: 'Traffic moved between wan1 and LTE', sev: 'Info', n: 14, fate: 'info' },
    { src: 'OpsRamp', ci: `${b.code}-sw01`, msg: 'CPU 86% for 2 minutes (nightly backup)', sev: 'Minor', n: 2, fate: 'clear' },
    { src: 'Aruba Central', ci: `${b.code}-ap02`, msg: 'AP rebooted, back in 40 seconds', sev: 'Minor', n: 2, fate: 'clear' },
    { src: 'OpsRamp', ci: `${b.code}-sw01`, msg: 'Config backup completed', sev: 'Info', n: 3, fate: 'info' },
  ];
  return {
    id: 'flap', name: 'Flapping line', b, icon: 'Repeat', mins: 30,
    story: `Before opening at ${b.name}, the primary line goes up and down every two minutes. Each flap alarms twice from two tools, and a few unrelated blips arrive too.`,
    rows, incidents: 1,
    corr: ['Flap rule: more than 4 changes in 30 minutes becomes one flapping alert', 'Blips that recovered inside 5 minutes closed with no ticket', 'Same circuit, one event'],
    enrich: [
      ['CI', `${c.id}, ${c.carrier} ${c.type}`],
      ['Branch hours', `Opens at ${b.hours.open} local, in under an hour`],
      ['Impact', 'Card payments would drop on every flap; the SD-WAN policy pinned traffic to LTE'],
      ['Circuit history', `${c.tickets90} tickets in 90 days, ${c.flaps30} flaps in 30 days`],
      ['Carrier', `Evidence pack ready for a ${c.carrier} case (RB-106)`],
    ],
    ticket: { action: 'Created', number: 'INC0384812', impact: 'Medium (payments at risk)', urgency: 'Medium (opens within 2 hours)', pri: 'P3', cat: 'Carrier / LEC', ci: c.id, group: 'Movate NOC – L2 Network', state: 'New', short: `${c.carrier} ${c.type} flapping – traffic held on LTE backup`, desc: `56 up and down alarms from Orchestrator and OpsRamp became one flapping alert. OpsRamp pinned card payments and ERP to LTE so the flaps do not reach the counter, and built the evidence pack for a ${c.carrier} case.`, branchId: b.id },
  };
}

export const SCENARIOS = [branchDark(), fibreCut(), firmwareWave(), noisyNight()];

// counts left after each stage
export function stageCounts(sc) {
  const raw = sc.rows.reduce((a, r) => a + r.n, 0);
  const afterDedup = sc.rows.filter(r => FATE[r.fate].stage > 1).length;
  const afterSuppress = sc.rows.filter(r => FATE[r.fate].stage > 2).length;
  const inc = sc.incidents;
  const ev = Math.max(1, inc);
  return [raw, afterDedup, afterSuppress, ev, ev, sc.ticket.action === 'Created' ? 1 : 0];
}

// ── the rules the console applies, with their share of today's noise ──
export const RULES = [
  { k: 'dup', name: 'Duplicate', how: 'Same device and same alarm inside 15 minutes: the count goes up on the alert already open', ex: 'an EdgeConnect polled every minute while it is unreachable', share: 0.44 },
  { k: 'xdup', name: 'Same fault, two tools', how: 'Orchestrator and OpsRamp report the same interface or device: keep one, link the other', ex: 'wan1 down in both Orchestrator and OpsRamp', share: 0.12 },
  { k: 'child', name: 'Child of a down parent', how: 'When an EdgeConnect or switch is down, the devices behind it are suppressed and listed on the parent alert', ex: 'the APs and switches behind a dead EdgeConnect', share: 0.16 },
  { k: 'window', name: 'Planned work', how: 'Devices in scope of an approved change are held during its window and checked 15 minutes after it closes', ex: 'AP reboots during a firmware wave', share: 0.08 },
  { k: 'flap', name: 'Flapping', how: 'More than 4 state changes in 30 minutes: one flapping alert instead of one per change', ex: 'a line going up and down every two minutes', share: 0.05 },
  { k: 'info', name: 'Information only', how: 'Failover done, link restored, backup completed: logged and sent to the digest', ex: 'traffic moved to the backup path', share: 0.11 },
  { k: 'upstream', name: 'Upstream already ticketed', how: 'Simplify watches the ISP access links and raises their tickets; Movate takes them as information and adds evidence', ex: 'an access link down at the carrier', share: 0.04 },
];

// ── what OpsQ (the OpsRamp AI) does at each step of each use case ──
// in: anomaly detection on the way in · dedup: merging · suppress: why alerts are held back · seq/topo/mode: how the
// event is formed · fr/route: first response and routing it learned · snow: how the ticket is handled
function opsqOf(sc) {
  const b = sc.b, rows = sc.rows;
  const nSw = (rows.find(r => /switch/.test(r.msg) && r.devices) || {}).devices || 0, nAp = (rows.find(r => /access point/.test(r.msg) && r.devices) || {}).devices || 0;
  const n = (rows[0] || {}).devices || 0;
  const pl = (k, w, ws) => `${k} ${k === 1 ? w : ws}`;
  return {
    dark: {
      in: ['Anomaly detection', `The EdgeConnect heartbeat at ${b.name} slowed to three times its learned normal two minutes before it stopped. The learned-normal model flagged it; a fixed threshold would not have.`],
      dedup: ['Merging', `Each poll of the same alarm added to one alert, and OpsRamp and Orchestrator reporting the same EdgeConnect were linked as one.`],
      suppress: [['Topology: parent down', `${pl(nSw, 'switch', 'switches')}, ${pl(nAp, 'access point', 'access points')} and the tunnels sit behind ${b.code}-ec01, so they are held on its alert`], ['Learned sequence', 'Tunnels down right after the EdgeConnect is lost is learned as one event, not a new fault']],
      seq: ['EdgeConnect lost → tunnels down → switches and APs unreachable, same branch', 38, '30 s', 0.95, 'CP-01'],
      topo: [['Carrier lines', 'wan1 and wan2', 'ok', 'Up at the modems'], ['SD-WAN appliance', `${b.code}-ec01`, 'bad', 'Not answering'], ['Core switch', `${b.code}-sw01`, 'warn', 'Unreachable'], ['Access layer', `${pl(nSw, 'switch', 'switches')}, ${pl(nAp, 'AP', 'APs')}`, 'warn', 'Unreachable'], ['Tills and ERP', 'Card payments, ERP', 'warn', 'Tests failing']],
      fr: ['RB-108 EdgeConnect remote recovery', 'Recommend', 0.86, 'an engineer approves, then Mova iO runs it'],
      route: ['Movate NOC – L2 Network', 0.96, 'SD-WAN events at one open branch'],
      snow: 'Opened by the OpsRamp escalation policy in 4 seconds; every later alert is added as a work note, so there is one ticket for the branch.',
    },
    fibre: {
      in: ['Anomaly detection', `Loss on ${n} Spectrum lines jumped from a learned normal of 0.1% to 100% inside 40 seconds: a sudden break, not a drift, so no forecast was possible.`],
      dedup: ['Merging', `Orchestrator and OpsRamp both reported wan1 down on ${n} EdgeConnects; the second report of each was linked to the first.`],
      suppress: [['Upstream already ticketed', `Simplify raised a ticket for each of the ${n} access links, so OpsRamp adds evidence instead of opening its own`], ['Information only', 'Failover to LTE and the card payment tests on backup go to the digest']],
      seq: ['Primary down at 3 or more branches, same carrier and region, within 15 minutes', 61, '4 min', 0.96, 'CP-02'],
      topo: [['Spectrum fibre', 'Dallas segment', 'bad', 'Cut'], ['Access lines', `${n} primaries`, 'warn', 'Down'], ['EdgeConnects', `${n} branches`, 'ok', 'Moved to LTE'], ['Branches', `${n} open`, 'ok', 'Trading on backup']],
      fr: ['RB-107 StoreOps notify, then watch the LTE data pool', 'On', 0.99, 'runs on its own'],
      route: ['Simplify (upstream), Movate watches', 0.94, 'access-link faults belong to Simplify'],
      snow: `No new ticket: OpsRamp updates the ${n} Simplify tickets with the outage evidence and watches the backup lines.`,
    },
    firmware: {
      in: ['Anomaly detection', 'Nothing raised on the way in: the baseline knows the change window, so AP reboots inside it are expected, not unusual.'],
      dedup: ['Merging', 'Each AP\'s down and up during its reboot were merged into one pair, and repeat polls counted on it.'],
      suppress: [['Change window', 'Every AP in scope of the change is held during its window and checked 15 minutes after it closes'], ['Learned pattern', 'AP down inside a firmware window, back within 10 minutes: learned from earlier waves']],
      seq: ['AP down inside a change window → AP up within 10 minutes, same AP', 1840, '6 min', 0.98, 'CP-04'],
      topo: [['Change', 'CHG0031902', 'ok', 'Window closed'], ['Switch ports', '31 switches', 'ok', 'PoE back'], ['Access points', '94 of 96', 'ok', 'Back on new firmware'], ['Two APs', `${b.code}-ap03, ap05`, 'bad', 'Not back']],
      fr: ['RB-104 AP reboot from Aruba Central', 'On', 0.92, 'runs on its own: the branch is closed'],
      route: ['Movate Network SME – L3 (change owner)', 0.97, 'faults after a change go to the change owner'],
      snow: 'One P4 ticket for the two APs, linked to the change record, so the change review sees it.',
    },
    flap: {
      in: ['Anomaly detection', `Loss on ${b.wan[0]} drifted above its learned normal for three nights before the flaps; the forecast flagged the line two days ago.`],
      dedup: ['Merging (flaps)', '28 down and up changes in 30 minutes were merged into one flapping alert instead of 28 alarms.'],
      suppress: [['Seasonal (learned)', 'Switch CPU at 86% during the nightly backup happens every night at 02:00, so it is held back'], ['Cleared by itself', 'The AP reboot came back in 40 seconds, inside the 5-minute hold-down'], ['Information only', 'Traffic moving between wan1 and LTE goes to the digest']],
      seq: ['wan1 loss above 2% → BFD flap → ERP slower than 1.5 s, same store', 214, '40 s', 0.93, 'CP-03'],
      topo: [['Carrier line', b.wan[0], 'bad', 'Flapping'], ['EdgeConnect', `${b.code}-ec01`, 'ok', 'Pinned to LTE'], ['Branch LAN', `${b.code}-sw01, ap02`, 'ok', 'Blips cleared'], ['Tills', 'Card payments', 'ok', 'Working on LTE']],
      fr: ['RB-106 carrier case with the evidence pack', 'Recommend', 0.9, 'an engineer accepts, then it is raised'],
      route: ['Movate NOC – L2 Network, case to the carrier', 0.95, 'carrier faults at one branch'],
      snow: 'One P3 ticket on the circuit; the carrier case number is added to it when the case is raised.',
    },
  }[sc.id];
}
SCENARIOS.forEach(sc => { sc.opsq = opsqOf(sc); });
export const OPSQ_MODES = { 'CP-01': 'On', 'CP-02': 'Recommend', 'CP-03': 'Observed', 'CP-04': 'On' };
export const OPSQ_COMPARE = [
  ['Correlation logic', 'Hand-written rules per device and scenario', 'Learns sequences from history; rules only as an override'],
  ['Upkeep', 'Rules break when topology or vendors change', 'Keeps learning as stores and devices are added'],
  ['Something new', 'Missed if no rule exists', 'Caught once it recurs'],
  ['Noise', 'Static thresholds and filters', 'Dedup, flap merging, seasonal and learned suppression'],
  ['Root cause', 'Separate tool or by hand', 'Topology points to the likely cause'],
  ['Routing', 'Static assignment rules', 'Learned routing and priority'],
  ['Going live', 'Rule goes live; you find out if it is wrong', 'Observed, then Recommend, then On, with a 7-day back-test'],
  ['Transparency', 'Rules are readable but rigid', 'Shows which alerts formed each inference and why'],
];

// ── what OpsQ has learned lately and is still proving (Learn and promote) ──
// mode: Learning (not enough history yet) → Observed (shadow inferences only) → Recommend (engineer accepts) → On
export const OPSQ_CANDIDATES = [
  { id: 'CP-11', what: 'Comcast node maintenance (Tue 00:00 to 04:00) → wan1 flaps at Atlanta branches', seen: 9, branches: 6, where: 'Southeast', learned: '6 days ago', bt: { alerts: 212, inc: 9, agree: 0.97 }, mode: 'Observed' },
  { id: 'CP-12', what: 'Outdoor AP-585 reboots when the yard is above 38 °C, same branch, 13:00 to 17:00', seen: 14, branches: 11, where: 'Sun Belt yards', learned: '11 days ago', bt: { alerts: 96, inc: 14, agree: 0.93 }, mode: 'Observed' },
  { id: 'CP-13', what: 'Card payment path above 400 ms when wan1 use is above 85% after 08:00', seen: 31, branches: 4, where: 'Texas & South Central', learned: '19 days ago', bt: { alerts: 188, inc: 31, agree: 0.95 }, mode: 'Recommend' },
  { id: 'CP-15', what: 'ERP slower than 1.5 s at the same time on every branch → New Relic app alert, not the network', seen: 22, branches: 140, where: 'All regions', learned: '9 days ago', bt: { alerts: 640, inc: 22, agree: 0.88 }, mode: 'Observed' },
  { id: 'CP-14', what: '2530 port flaps after a power event at acquired branches (LS Building Products)', seen: 3, branches: 2, where: 'Great Lakes', learned: '2 days ago', bt: null, mode: 'Learning', need: 5 },
];
export const OPSQ_SEASONAL = [['02:00 every night', 'Config backup spike and TACACS+ timeouts'], ['06:30 Mon to Sat', 'Tills and handhelds joining Wi-Fi at opening, ping loss'], ['Sun 01:00', 'Carrier maintenance windows, line flaps']];
export const OPSQ_CAVEATS = [
  ['Needs history', 'Until a policy is trained, OpsQ behaves more like a rules engine. It is seeded with trained sequences at go-live.'],
  ['Policy-driven', 'SRS sets scope, similarity rules and precedence; the AI works inside those guardrails. AI-assisted, not fully autonomous.'],
  ['One site at a time', 'Correlation stays within a branch, so multi-store events use the Mova iO pattern layer on top.'],
  ['Runbook-based fixes', 'OpsQ decides what to run; it does not invent new fixes. Operations Copilot adds the generative and agentic layer.'],
];
