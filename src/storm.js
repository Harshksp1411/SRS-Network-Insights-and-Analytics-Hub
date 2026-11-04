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
    ticket: { action: 'Created', number: inc ? inc.id : 'INC0384702', impact: 'Medium (one branch down)', urgency: 'High (branch open)', pri: 'P2', cat: 'SD-WAN', ci: ec, group: 'Movate NOC – L2 Network', state: 'New', short: 'Branch unreachable – EdgeConnect not responding', desc: `Mova iO grouped the alarms from Orchestrator, OpsRamp, Aruba Central, synthetics and New Relic into this incident. ${ec} stopped answering; the switches and access points behind it were suppressed as child alarms. Card payment and ERP tests from the branch fail.`, branchId: b.id, incId: inc && inc.id },
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
    ticket: { action: 'Updated, not created', number: `${n} Simplify tickets`, caller: 'Simplify integration', impact: 'Low (on backup)', urgency: 'High (branches open)', pri: 'P3', cat: 'Carrier / LEC', ci: `${n} Spectrum circuits`, group: 'Simplify (upstream)', state: 'In Progress', short: `Spectrum fibre cut, Dallas: ${n} branches on LTE backup`, desc: `Simplify raised the access-link tickets. Mova iO created no ticket of its own, so SRS sees each outage once. It added the evidence (loss, failover times, backup health) to Simplify's tickets as work notes and tagged them with one correlation ID so the NOC handles them as one event.`, branchId: b.id },
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
    ticket: { action: 'Created', number: 'INC0384811', impact: 'Low (two APs)', urgency: 'Low (branch closed)', pri: 'P4', cat: 'Wireless', ci: `${b.code}-ap03`, group: 'Movate Network SME – L3 (change owner)', state: 'New', short: `2 APs did not return after ${chg.id}`, desc: `The change window suppressed ${n} AP reboots and the alarms that came with them. Two APs at ${b.name} were still down 15 minutes after it closed, so Mova iO raised one ticket linked to ${chg.id} for the change owner.`, branchId: b.id, chg: chg.id },
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
      ['Impact', 'Card payments would drop on every flap; Mova iO pinned traffic to LTE'],
      ['Circuit history', `${c.tickets90} tickets in 90 days, ${c.flaps30} flaps in 30 days`],
      ['Carrier', `Evidence pack ready for a ${c.carrier} case (RB-106)`],
    ],
    ticket: { action: 'Created', number: 'INC0384812', impact: 'Medium (payments at risk)', urgency: 'Medium (opens within 2 hours)', pri: 'P3', cat: 'Carrier / LEC', ci: c.id, group: 'Movate NOC – L2 Network', state: 'New', short: `${c.carrier} ${c.type} flapping – traffic held on LTE backup`, desc: `56 up and down alarms from Orchestrator and OpsRamp became one flapping alert. Mova iO pinned card payments and ERP to LTE so the flaps do not reach the counter, and built the evidence pack for a ${c.carrier} case.`, branchId: b.id },
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
