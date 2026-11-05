// OpsRamp Platform Capabilities: the data behind the integration, event management, ServiceNow and AI pages and the
// nine-step demo, drawn from the console's own branches, devices, circuits, incidents and live feed.
import * as D from '../data.js';
import { MIN } from '../util.js';

// the demo store: a healthy branch with dual ISP circuits, two switches and several APs
export const DEMO = (() => {
  const b = D.BRANCHES.find(x => x.health === 'up' && x.dev.sw >= 2 && x.dev.ap >= 3 && D.CIR[x.wan[0]].type === 'DIA' && D.CIR[x.wan[0]].status === 'Up' && !D.INCIDENTS.some(i => i.branchId === x.id)) || D.BRANCHES[10];
  const devs = D.devicesOf(b.id), isp1 = D.CIR[b.wan[0]], isp2 = D.CIR[b.wan[1]];
  return { b, devs, isp1, isp2, ec: devs.find(d => d.type === 'SD-WAN'), sws: devs.filter(d => d.type === 'Switch'), aps: devs.filter(d => d.type === 'AP') };
})();
// the second store whose latency is drifting, not yet over its threshold
export const DRIFT = (() => { const p = D.PREDICTIONS.find(x => x.id === 'PRD-502'); const b = D.BR[p.branchId]; return { p, b, c: D.CIR[p.target] }; })();

// the five sources and two consumers
export const SOURCES = [
  { k: 'aruba', name: 'Aruba CX switches, APs', how: 'SNMP, traps, syslog, NetFlow', src: ['OpsRamp'], n: () => `${(D.DEVICES.filter(d => d.type !== 'SD-WAN').length).toLocaleString()} devices`, via: 'OpsRamp gateway' },
  { k: 'central', name: 'Aruba Central', how: 'Cloud API integration (native since HPE brought OpsRamp and Aruba together)', src: ['Aruba Central'], n: () => `${D.CENTRAL_N || 1286} APs and switches`, via: 'API' },
  { k: 'ec', name: 'Silver Peak EdgeConnect', how: 'Orchestrator API, SNMP', src: ['Orchestrator'], n: () => `${D.DEVICES.filter(d => d.type === 'SD-WAN').length} appliances, ${D.CIRCUITS.length.toLocaleString()} circuits`, via: 'API + gateway' },
  { k: 'nr', name: 'New Relic', how: 'Alert webhook into OpsRamp', src: ['New Relic', 'Synthetic'], n: () => `${D.APPS.length} applications`, via: 'Webhook' },
  { k: 'cisco', name: 'Cisco (future)', how: 'SNMP and API templates', src: [], n: () => 'ready to add', via: 'Same framework', future: true },
];
export const PLATFORM = ['Discovery and topology', 'Performance, NetFlow', 'Event management', 'Automation, runbooks', 'Operations copilot'];

export const INTEGRATION_CAPS = [
  { k: 'gateway', name: 'OpsRamp Gateway', gives: 'A virtual collector inside the SRS network that reaches store devices securely, so nothing is exposed to the internet' },
  { k: 'agentless', name: 'Agentless device monitoring', gives: 'SNMP v1/v2c/v3 polling, SNMP traps and syslog from switches, APs and SD-WAN appliances, with vendor templates and thresholds' },
  { k: 'flow', name: 'Flow analytics', gives: 'NetFlow v5/v9, IPFIX and sFlow to show top talkers, application traffic and circuit utilisation per store' },
  { k: 'topology', name: 'Auto-discovery and topology', gives: 'Finds devices and maps how they connect (LLDP/CDP), so correlation knows which AP sits behind which switch and circuit' },
  { k: 'ncm', name: 'Network configuration management', gives: 'Backs up device configs, detects changes and checks them against the SRS standard template' },
  { k: 'api', name: 'API, webhook and SDK framework', gives: 'Brings in cloud tools such as Aruba Central, EdgeConnect Orchestrator and New Relic, and lets new vendors be added without custom code' },
  { k: 'group', name: 'Service and site grouping', gives: 'Groups every device and circuit by store, district and region, which feeds the dashboards and correlation' },
];

// the seven stages from alarm storm to one incident; share = part of today's events each stage removes
export const PIPE = [
  { k: 'agg', n: 1, name: 'Aggregate', short: 'Every source in one stream, tagged by store and device', how: 'Ingests native monitoring, third-party and webhook events into one alert model', ex: 'Aruba, EdgeConnect and New Relic alarms for a branch in one queue', group: 'Reduce the noise' },
  { k: 'dedup', n: 2, name: 'De-duplicate', short: 'Repeated SNMP traps from a flapping link become one alert', how: 'Groups repeats of an alert that is already open', ex: 'A flapping ISP circuit sends hundreds of traps; the NOC sees one alert', group: 'Reduce the noise', share: 0.44 },
  { k: 'suppress', n: 3, name: 'Suppress', short: 'Maintenance windows, known noise, learned seasonal alerts', how: 'First-response policies suppress by rule, by training file, or by learning seasonal and attribute patterns; an alert that stays open past its normal duration is automatically unsuppressed', ex: 'Planned maintenance at a store, or nightly backup traffic spikes', group: 'Reduce the noise', share: 0.2 },
  { k: 'corr', n: 4, name: 'Correlate', short: 'Circuit drop, failover and AP alarms join on store topology', how: 'Groups alerts that share a cause into one inference, using site, region and topology dependencies', ex: 'Circuit drop, SD-WAN failover and AP alarms at one store become one inference', group: 'Reduce the noise', share: 0.07 },
  { k: 'pattern', n: 5, name: 'Pattern correlate', short: 'Learns alarms that recur together across stores and regions', how: 'Machine learning finds alarms that co-occur over time, even without a known topology link', ex: 'A recurring carrier issue hitting several stores in one region', group: 'Find the cause' },
  { k: 'anomaly', n: 6, name: 'Detect anomalies', short: 'Flags drift from each device baseline before a threshold breaks', how: 'Change and anomaly detection against each device\'s learned baseline', ex: 'Latency creeping up on a circuit before it fails', group: 'Find the cause' },
  { k: 'ai', n: 7, name: 'AI false positives', short: 'Learns which alerts need no action, tested in Observed mode', how: 'Continuous learning on SRS history; Observed mode shows what the AI would do, and Recommend mode suggests actions before anything runs automatically', ex: 'SRS approves each policy after seeing it work on its own data', group: 'Find the cause' },
];

// first-response and correlation policies, each with a mode
export const MODES = ['Off', 'Observed', 'Recommend', 'On'];
export const POLICIES = [
  { id: 'FR-01', kind: 'First response', name: 'Suppress SD-WAN tunnel re-key info messages', by: 'User rule', mode: 'On', share: 0.06 },
  { id: 'FR-02', kind: 'First response', name: 'Suppress nightly config-backup traffic spikes 01:00 to 03:00 local', by: 'Learned seasonal pattern', mode: 'On', share: 0.04 },
  { id: 'FR-03', kind: 'First response', name: 'Suppress AP watchdog reboots that recover inside 3 minutes', by: 'Training file (12 months of SRS history)', mode: 'Recommend', share: 0.05 },
  { id: 'FR-04', kind: 'First response', name: 'Suppress PoE renegotiation on yard APs', by: 'Continuous learning', mode: 'Observed', share: 0.03 },
  { id: 'CP-01', kind: 'Correlation', name: 'Store topology: circuit, SD-WAN appliance, switches and APs behind it', by: 'Topology (LLDP/CDP) and site', mode: 'On', share: 0.05 },
  { id: 'CP-02', kind: 'Correlation', name: 'Same carrier, same region, inside 15 minutes', by: 'ML co-occurrence, region aware', mode: 'Recommend', share: 0.02 },
  { id: 'CP-03', kind: 'Correlation', name: 'Application slowness with WAN latency at the same store', by: 'ML co-occurrence, site aware', mode: 'Observed', share: 0.01 },
];

// OpsRamp to ServiceNow mapping
export const PRIORITY_MAP = [
  { cond: 'Store fully down (cannot trade)', sev: 'Critical', impact: '1 – High', urg: '1 – High', pri: 'P1', group: 'Movate NOC – Major Incident', after: 'at once' },
  { cond: 'Card payments or ERP failing at a store', sev: 'Critical', impact: '2 – Medium', urg: '1 – High', pri: 'P2', group: 'Movate NOC – L2 Network', after: '5 min' },
  { cond: 'Circuit degraded (loss, latency or jitter over the store profile)', sev: 'Major', impact: '2 – Medium', urg: '2 – Medium', pri: 'P3', group: 'Movate Carrier Management', after: '15 min' },
  { cond: 'Store on its backup line', sev: 'Major', impact: '3 – Low', urg: '2 – Medium', pri: 'P3', group: 'Movate Carrier Management', after: 'at once' },
  { cond: 'One AP or switch port down', sev: 'Minor', impact: '3 – Low', urg: '3 – Low', pri: 'P4', group: 'Movate NOC – L1', after: '10 min' },
  { cond: 'Config backup failed', sev: 'Warning', impact: '3 – Low', urg: '3 – Low', pri: 'P4', group: 'Movate NOC – L1', after: 'next run fails' },
];
export const CATEGORY_MAP = [['Access link / carrier', 'Network › WAN circuit', 'Movate Carrier Management'], ['SD-WAN appliance', 'Network › SD-WAN', 'Movate NOC – L2 Network'], ['Switching', 'Network › LAN', 'Movate NOC – L2 Network'], ['Wireless', 'Network › Wi-Fi', 'Movate NOC – L1'], ['Application (New Relic)', 'Application › Performance', 'SRS Application Support']];
export const ESCALATION = [
  { p: 'P1', steps: [['L1 NOC', 0], ['L2 Network', 5], ['Major incident manager', 10], ['On-call engineer', 15]] },
  { p: 'P2', steps: [['L1 NOC', 0], ['L2 Network', 15], ['On-call engineer', 45]] },
  { p: 'P3', steps: [['L1 NOC', 0], ['L2 Network', 60], ['On-call engineer', 240]] },
  { p: 'P4', steps: [['L1 NOC', 0], ['L2 Network', 480]] },
];

// the alarm storm an ISP-1 drop creates at the demo store, with what each stage does to it
export function demoStorm(t0) {
  const { b, ec, sws, aps, isp1, isp2 } = DEMO, a2 = aps.slice(0, 2);
  const at = s => t0 + s * 1000;
  const rows = [
    { t: at(0), src: 'Orchestrator', ci: isp1.id, msg: `${isp1.carrier} ${isp1.type} (ISP-1) loss 100%, tunnel down`, sev: 'Critical', n: 1, fate: 'root' },
    { t: at(2), src: 'OpsRamp', ci: `${ec.id}`, msg: 'SNMP trap: wan1 interface down', sev: 'Critical', n: 24, fate: 'dedup' },
    { t: at(4), src: 'Orchestrator', ci: ec.id, msg: `SD-WAN failover: card payments, ERP and voice moved to ISP-2 (${isp2.carrier})`, sev: 'Info', n: 1, fate: 'corr' },
    { t: at(30), src: 'Orchestrator', ci: isp2.id, msg: `ISP-2 latency ${isp2.lat + 140} ms (normal ${isp2.lat} ms), jitter 31 ms`, sev: 'Major', n: 12, fate: 'corr' },
    ...a2.map((d, i) => ({ t: at(45 + i * 6), src: 'Aruba Central', ci: d.id, msg: 'AP reporting client association errors', sev: 'Minor', n: 9, fate: 'corr' })),
    { t: at(60), src: 'New Relic', ci: `${b.code} ERP`, msg: 'Slow transactions: order entry 4.2 s (normal 1.1 s)', sev: 'Major', n: 6, fate: 'corr' },
    { t: at(75), src: 'Synthetic', ci: `${b.code} POS`, msg: 'Card payment path test 1.9 s', sev: 'Critical', n: 6, fate: 'corr' },
    { t: at(90), src: 'OpsRamp', ci: sws[0].id, msg: 'Uplink utilisation spike during the failover', sev: 'Minor', n: 4, fate: 'dedup' },
    { t: at(95), src: 'OpsRamp', ci: sws[1] ? sws[1].id : sws[0].id, msg: 'Scheduled port-security change in window CHG-STORE-MAINT', sev: 'Minor', n: 8, fate: 'window' },
    { t: at(120), src: 'Aruba Central', ci: aps[2] ? aps[2].id : a2[0].id, msg: 'AP watchdog reboot, back in 40 s', sev: 'Minor', n: 2, fate: 'learned' },
    { t: at(150), src: 'OpsRamp', ci: ec.id, msg: 'Repeat: wan1 still down (each poll)', sev: 'Critical', n: 30, fate: 'dedup' },
  ];
  return rows;
}
export const FATE_LABEL = { root: ['Probable root cause', 'red'], dedup: ['De-duplicated', 'gray'], corr: ['Correlated into the inference', 'blue'], window: ['Suppressed: maintenance window', 'blue'], learned: ['Suppressed: learned pattern', 'gray'] };

// the plain-language summary the operations copilot writes for an incident
export function copilot(inc) {
  const b = D.BR[inc.branchId]; const top = (inc.rca || [])[0];
  return {
    what: `${b.name} (${b.brand}): ${inc.title}. Opened ${inc.pri}, ${inc.state.toLowerCase()}.`,
    why: top ? `Most likely ${top.cause.replace(/^(Network|ISP|Application):\s*/, '').toLowerCase()} (${Math.round(top.conf * 100)}% confident): ${top.ev}.` : 'The probable cause is still being worked out.',
    impact: (inc.impact || []).join('; ') || 'No business impact reported.',
    next: inc.runbook ? `Suggested: ${inc.runbook} ${D.RB[inc.runbook].name}${D.RB[inc.runbook].kind === 'change' ? ' (needs approval)' : ' (safe to run now)'}.` : 'Suggested: assign to the L2 network team.',
    grouped: `${(inc.corr || 0) + inc.signals.length} alarms were grouped into this incident.`,
  };
}
export const minsAgo = (t, now) => Math.max(0, Math.round((now - t) / MIN));
