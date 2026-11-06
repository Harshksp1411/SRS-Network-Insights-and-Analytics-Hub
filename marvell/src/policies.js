// OpsRamp policies and templates for the SRS estate: how each kind of device and line is monitored, the
// policies that act on what is collected, how access is controlled, the standard (golden) configurations the
// network is checked against, and how a new make or model is brought in.
import * as D from './data.js';

const count = pred => D.DEVICES.filter(pred).length;
const BIZ = D.BRANCHES.reduce((a, b) => ({ ...a, [b.size]: (a[b.size] || 0) + 1 }), {});
export const PROFILES = [
  { k: 'S', label: 'Small branch', n: BIZ.S || 0 },
  { k: 'M', label: 'Standard branch', n: BIZ.M || 0 },
  { k: 'L', label: 'High-volume yard', n: BIZ.L || 0 },
];

// one monitoring template per kind of device or line
export const TEMPLATES = [
  { id: 'TPL-EC', name: 'HPE Aruba EdgeConnect (SD-WAN)', cls: 'SD-WAN edge', models: ['EC-XS'], n: count(d => d.type === 'SD-WAN'), how: [['Orchestrator API', 'REST, every 1 min'], ['SNMPv3', 'every 5 min'], ['Syslog', 'live']], metrics: ['Tunnel state, both paths', 'Path loss, latency and jitter', 'Business intent policy in force', 'Failover events', 'CPU and memory', 'Interface status'], parent: 'Store root (the circuits sit above it)', snow: ['Network › SD-WAN', 'Movate NOC – L2 Network', 'SD-WAN edge (cmdb_ci_ip_router)'], ver: 'v3.4' },
  { id: 'TPL-CX', name: 'Aruba CX switches', cls: 'Access switch', models: ['6100', '6200M', '6300'], n: count(d => ['6100', '6200M', '6300'].includes(d.model)), how: [['SNMPv3', 'every 5 min'], ['AOS-CX REST', 'every 15 min'], ['Traps and syslog', 'live']], metrics: ['CPU, memory, PSU, fan, temperature', 'Interface errors (CRC) and drops', 'PoE budget and per-port draw', 'Port up and down', 'Loop protect and STP', 'Uplink use'], parent: 'EdgeConnect at the same store', snow: ['Network › LAN', 'Movate NOC – L2 Network', 'IP switch (cmdb_ci_ip_switch)'], ver: 'v5.1' },
  { id: 'TPL-2530', name: 'Aruba 2530 switches (legacy)', cls: 'Access switch', models: ['2530'], n: count(d => d.model === '2530'), how: [['SNMPv3', 'every 5 min'], ['Traps and syslog', 'live']], metrics: ['CPU, memory, PSU, fan', 'Interface errors', 'PoE budget', 'Port up and down'], parent: 'EdgeConnect at the same store', snow: ['Network › LAN', 'Movate NOC – L2 Network', 'IP switch (cmdb_ci_ip_switch)'], ver: 'v2.7', note: 'End of support 2027; refresh to CX 6100 in the lifecycle plan' },
  { id: 'TPL-AP', name: 'Aruba indoor access points', cls: 'Wi-Fi AP', models: ['AP-635', 'AP-634'], n: count(d => ['AP-635', 'AP-634'].includes(d.model)), how: [['Aruba Central API', 'every 5 min'], ['Central webhooks', 'live']], metrics: ['AP up and down', 'Clients and airtime use', 'Channel, interference, retries', 'Reboots', 'PoE draw at the switch port'], parent: 'Switch port it is plugged into', snow: ['Network › Wi-Fi', 'Movate NOC – L1', 'Wireless access point (cmdb_ci_wap_network)'], ver: 'v4.2' },
  { id: 'TPL-APO', name: 'Aruba outdoor access points (yards)', cls: 'Wi-Fi AP', models: ['AP-565', 'AP-567', 'AP-575', 'AP-585'], n: count(d => ['AP-565', 'AP-567', 'AP-575', 'AP-585'].includes(d.model)), how: [['Aruba Central API', 'every 5 min'], ['Central webhooks', 'live']], metrics: ['Everything in the indoor template', 'Radio temperature (higher limits for heat)', 'Ethernet errors on long outdoor runs'], parent: 'Switch port it is plugged into', snow: ['Network › Wi-Fi', 'Movate NOC – L1', 'Wireless access point (cmdb_ci_wap_network)'], ver: 'v4.2' },
  { id: 'TPL-CIR', name: 'ISP circuits (DIA, broadband, MPLS, LTE/5G)', cls: 'Access link', models: ['DIA', 'Broadband', 'MPLS', 'LTE/5G'], n: D.CIRCUITS.length, how: [['Orchestrator path stats', 'every 1 min'], ['Simplify access-link feed', 'live'], ['Carrier portals', 'on change']], metrics: ['Up and down, flaps', 'Loss, latency, jitter', 'Use at peak (95th percentile)', 'Carrier SLA against contract'], parent: 'EdgeConnect port it lands on', snow: ['Network › WAN circuit', 'Movate Carrier Management', 'Circuit (cmdb_ci_circuit)'], ver: 'v3.0' },
  { id: 'TPL-APP', name: 'Store applications (New Relic and synthetics)', cls: 'Application path', models: ['ERP', 'POS path', 'Pricing', 'Azure apps'], n: D.APPS.length * D.BRANCHES.length, how: [['New Relic webhook', 'live'], ['Synthetic tests', 'every 15 min']], metrics: ['Response time from each branch', 'Card payment path round trip', 'Errors and timeouts'], parent: 'The store whose path it tests', snow: ['Application › Performance', 'SRS Application Support', 'Application (cmdb_ci_appl)'], ver: 'v1.8' },
];

// who and what can reach the devices, and what each role can do in OpsRamp
export const ACCESS = [
  { k: 'SNMPv3 (authPriv)', what: 'Switches and EdgeConnects polled with SHA-256 authentication and AES-128 privacy; v1 and v2c disabled', who: 'OpsRamp gateways only', rotate: '180 days' },
  { k: 'Aruba Central API', what: 'OAuth 2.0 client credentials, read scope for monitoring; write only through approved runbooks', who: 'OpsRamp integration account', rotate: '90 days' },
  { k: 'EdgeConnect Orchestrator API', what: 'API token, read for monitoring; policy changes only through approved runbooks', who: 'OpsRamp integration account', rotate: '90 days' },
  { k: 'ServiceNow integration', what: 'OAuth 2.0; create and update incidents, write CIs to the CMDB', who: 'OpsRamp integration user (ITIL role)', rotate: '90 days' },
  { k: 'Device CLI (TACACS+)', what: 'Named engineer accounts with MFA, every command logged; no shared or local accounts', who: 'Movate L2 and L3 engineers', rotate: 'per person' },
  { k: 'OpsRamp gateway', what: 'Two virtual collectors (McKinney data centre and DR); outbound TLS 443 to the OpsRamp tenant only', who: 'Nothing inbound from the internet', rotate: 'certificate yearly' },
  { k: 'Management network', what: 'Device management on its own VLAN; ACL allows only the gateways and the jump hosts', who: 'Enforced in the golden config', rotate: '—' },
];
export const ROLES = [
  { r: 'Movate NOC L1', can: 'See everything, acknowledge alerts, run read-only runbooks (diagnostics, tests)' },
  { r: 'Movate NOC L2 Network', can: 'Everything L1 can, plus run change runbooks inside the gate rules, open carrier cases' },
  { r: 'Movate Network SME L3', can: 'Edit templates, thresholds and policies; move AI policies between Observed, Recommend and On' },
  { r: 'SRS IT and leadership', can: 'Read-only dashboards and reports; escalate to Movate' },
  { r: 'Integration accounts', can: 'Least privilege, one per system; no interactive login' },
];

// what the network enforces; OpsRamp checks each one against its template every day
export const NET_POLICIES = [
  { area: 'SD-WAN business intent', rule: 'Card payments (POS) and voice in the top class; ERP next; camera backup and updates as bulk, off-peak', where: 'EdgeConnect Orchestrator', file: 'sdwan/bio/roofhub.yaml' },
  { area: 'Failover', rule: 'Move POS, ERP and voice to the second line when loss passes 2% or jitter 30 ms; return after 30 clean minutes', where: 'EdgeConnect Orchestrator', file: 'sdwan/bio/roofhub.yaml' },
  { area: 'Wi-Fi networks', rule: 'SRS-SCAN (handhelds, 2.4 and 5 GHz), SRS-CORP (staff, 802.1X), SRS-GUEST (isolated, rate-limited)', where: 'Aruba Central group template', file: 'wireless/templates/srs-scan.yaml' },
  { area: 'VLAN plan', rule: '10 data · 20 voice · 30 handhelds · 40 POS (PCI) · 50 cameras · 60 guest · 99 management', where: 'Switch golden config', file: 'switching/templates/cx-access.yaml' },
  { area: 'PCI segmentation', rule: 'POS VLAN reaches only the payment processor; no east-west traffic; guest never on the POS uplink', where: 'Switch ACLs and SD-WAN zones', file: 'switching/acl/vlan50.yaml' },
  { area: 'Device baseline', rule: 'NTP, TACACS+, SNMPv3 only, syslog to OpsRamp, login banner, loop protect, PoE priority for APs and phones', where: 'Every switch and EdgeConnect', file: 'switching/templates/cx-access.yaml' },
  { area: 'Firmware', rule: 'One approved release per model; no more than one release behind (two for switches) outside a change', where: 'Network-as-Code, rolled out in waves', file: 'aps/firmware/wave3.yaml' },
];

// standard (golden) configurations and compliance against them
const DRIFT_CLS = d => /ap\d/.test(d.device) ? 'TPL-AP' : /ec\d/.test(d.device) ? 'TPL-EC' : (D.DEV[d.device] && D.DEV[d.device].model === '2530') ? 'TPL-2530' : 'TPL-CX';
export const CONFIGS = [
  { tpl: 'TPL-CX', file: 'switching/templates/cx-access.yaml', ver: '2026.10', models: ['6100', '6200M', '6300'], checks: ['NTP servers', 'TACACS+', 'SNMPv3 only', 'Syslog to OpsRamp', 'VLAN plan', 'Loop protect', 'PoE priority', 'Management ACL'] },
  { tpl: 'TPL-2530', file: 'switching/templates/2530-legacy.yaml', ver: '2026.06', models: ['2530'], checks: ['NTP servers', 'TACACS+', 'SNMPv3 only', 'VLAN plan', 'Management ACL'] },
  { tpl: 'TPL-EC', file: 'sdwan/bio/roofhub.yaml', ver: 'v41', models: ['EC-XS'], checks: ['Business intent classes', 'Failover thresholds', 'Zones (POS isolated)', 'NTP', 'Syslog'] },
  { tpl: 'TPL-AP', label: 'Aruba access points (indoor and outdoor)', file: 'wireless/templates/srs-scan.yaml', ver: '2026.09', models: ['AP-635', 'AP-634', 'AP-565', 'AP-567', 'AP-575', 'AP-585'], checks: ['SSIDs and roles', 'Minimum RSSI', 'Band steering', 'Channel plan (AirMatch)', 'Guest isolation'] },
].map(c => {
  const devs = D.DEVICES.filter(d => c.models.includes(d.model));
  const drift = D.DRIFT.filter(d => DRIFT_CLS(d) === c.tpl);
  const fwKey = c.tpl === 'TPL-AP' ? 'AP' : c.models[0];
  const target = (D.FW_TARGET[fwKey] || [])[0];
  const onTarget = devs.filter(d => d.fw === target).length;
  return { ...c, n: devs.length, drift, target, onTarget, compliant: 1 - drift.length / Math.max(1, devs.length) };
});

// bringing in a new make or model: what carries over, what needs setting up
export const VENDORS = [
  { id: 'cat9k', name: 'Cisco Catalyst 9200 / 9300 switch', cls: 'Access switch', like: 'TPL-CX', lib: 'Cisco Catalyst (IOS-XE) template in the OpsRamp library', access: 'SNMPv3 authPriv + NETCONF/RESTCONF for config', map: [['CPU', 'CISCO-PROCESS-MIB cpmCPUTotal5minRev'], ['Memory', 'CISCO-MEMORY-POOL-MIB'], ['Interface errors', 'IF-MIB ifInErrors, ifOutErrors'], ['PoE budget', 'CISCO-POWER-ETHERNET-EXT-MIB'], ['PSU, fan, temperature', 'CISCO-ENVMON-MIB'], ['Neighbours (topology)', 'CDP-MIB and LLDP-MIB'], ['Config backup', 'SSH or NETCONF pull']] },
  { id: 'meraki-mr', name: 'Cisco Meraki MR access point', cls: 'Wi-Fi AP', like: 'TPL-AP', lib: 'Cisco Meraki template in the OpsRamp library', access: 'Meraki Dashboard API key (read), per organisation', map: [['AP up and down', 'Dashboard API device status'], ['Clients and airtime', 'Dashboard API wireless usage and channel utilisation'], ['Reboots', 'Dashboard API events'], ['Neighbours (topology)', 'LLDP/CDP via the Dashboard API'], ['Config', 'Dashboard API network settings']] },
  { id: 'cat-sdwan', name: 'Cisco Catalyst SD-WAN edge', cls: 'SD-WAN edge', like: 'TPL-EC', lib: 'Cisco SD-WAN (vManage) template in the OpsRamp library', access: 'vManage API (read) + SNMPv3', map: [['Tunnel state', 'vManage API BFD sessions'], ['Path loss, latency, jitter', 'vManage API app-route statistics'], ['Policy in force', 'vManage API centralised policy'], ['CPU and memory', 'vManage API device status'], ['Failover events', 'vManage alarms webhook']] },
  { id: 'fortigate', name: 'Fortinet FortiGate (branch firewall)', cls: 'Firewall', like: null, lib: 'Fortinet FortiGate template in the OpsRamp library', access: 'SNMPv3 + FortiOS REST API (read)', map: [['CPU, memory, sessions', 'FORTINET-FORTIGATE-MIB'], ['VPN tunnel state', 'FortiOS REST API'], ['Interface errors', 'IF-MIB'], ['Policy hits', 'FortiOS REST API']] },
];
// the order OpsRamp applies alert policies (default; first response can be set to run before correlation)
export const POLICY_ORDER = [
  ['Alert correlation (ACP)', 'Topology · region · learned sequences'],
  ['First response (FRP)', 'Suppress known noise · Off, Observed, Recommend, On'],
  ['Alert escalation (AEP)', 'ServiceNow ticket · L1 → L2 → on-call'],
];
export const ONBOARD = [
  ['SNMP walk and MIBs', 'Full walk, vendor MIBs, resource type', 'lib'],
  ['Template', 'From the OpsRamp library or the SDK', 'lib'],
  ['Access', 'Credential set on the resource group', 'access'],
  ['Discovery and assignment', 'sysObjectID or API · template-based alert definition', 'auto'],
  ['Same metric names', 'Vendor metrics → SRS standard names', 'map'],
  ['Thresholds', 'Same kind of device, by store profile', 'like'],
  ['Topology', 'LLDP/CDP parent and child links', 'auto'],
  ['ServiceNow', 'CI class, category, assignment group', 'like'],
  ['Golden config', 'Config template and compliance checks', 'decide'],
  ['Pilot', '2 stores · Observed · 2 weeks · then by region', 'decide'],
];

// metric definitions per template: what is collected, from where, how the value is worked out, the warning and
// critical levels (by store profile where a busy yard is judged differently), when an alert fires and clears,
// what happens at each level, and what the metric feeds. th: [warn, crit] for every store, P(S, M, L) by profile,
// or { w, c } text for state metrics.
const P = (S, M, L) => ({ S, M, L });
const AVAIL = (what, parentNote) => ({ k: 'availability', m: 'Reachable', unit: '', src: 'ICMP ping from the OpsRamp gateway; SNMP sysUpTime as a second check', every: '1 min', calc: `${what} is down when 3 pings in a row fail and SNMP does not answer`, th: { w: '1 to 2 pings missed', c: 'Down: 3 in a row missed' }, when: '3 min', clear: '2 good polls', warn: 'No alert; shown on Branch 360', crit: `Critical alert; ${parentNote}`, feeds: 'Availability SLA, Branch Readiness' });

const MET_EC = [
  AVAIL('The EdgeConnect', 'P1 if the store has no other way out; everything behind it is suppressed under this alert'),
  { k: 'ec.tunnel.state', m: 'Tunnel state, each path', unit: '', src: 'Orchestrator API, tunnel status (overlay and underlay)', every: '1 min', calc: 'State of each tunnel to the hubs, per line (primary, secondary, LTE)', th: { w: 'One path down, store running on the other', c: 'All paths down' }, when: '2 polls (2 min)', clear: '3 good polls', warn: 'Warning; first response checks the carrier status page and opens a carrier case', crit: 'Critical, P1; Movate L2 paged', feeds: 'Availability SLA, Carrier Management' },
  { k: 'ec.path.latency', m: 'Latency, each path', unit: 'ms', src: 'Orchestrator API, tunnel statistics (round trip)', every: '1 min', calc: 'Average of the five 1-minute samples in each 5-minute window, per path', th: P([100, 120], [80, 100], [60, 80]), when: '3 windows in a row (15 min)', clear: '2 windows under warning', warn: 'Warning; watched on the anomaly view', crit: 'Critical, P3; business intent moves card payments and voice to the better path', feeds: 'Network performance KPIs, card payment experience' },
  { k: 'ec.path.jitter', m: 'Jitter, each path', unit: 'ms', src: 'Orchestrator API, tunnel statistics', every: '1 min', calc: 'Mean variation in delay between packets, averaged over 5 minutes, per path', th: P([20, 30], [15, 30], [10, 20]), when: '3 windows in a row (15 min)', clear: '2 windows under warning', warn: 'Warning alert in OpsRamp; no ticket', crit: 'Critical, P3; voice moves to the other path', feeds: 'Network performance KPIs, voice quality' },
  { k: 'ec.path.loss', m: 'Packet loss, each path', unit: '%', src: 'Orchestrator API, tunnel statistics (after error correction)', every: '1 min', calc: 'Packets lost ÷ packets sent over 5 minutes, per path', th: P([1, 1.5], [0.5, 1], [0.3, 0.5]), when: '2 windows in a row (10 min)', clear: '2 windows under warning', warn: 'Warning alert in OpsRamp; no ticket', crit: 'Critical, P3; failover policy moves traffic when loss passes 2%', feeds: 'Network performance KPIs, card payment experience' },
  { k: 'ec.bio.drift', m: 'Business intent policy in force', unit: '', src: 'Orchestrator API, applied overlay against sdwan/bio/roofhub.yaml', every: '15 min', calc: 'Applied policy compared with the golden version (v41)', th: { w: 'Differs from golden', c: 'POS not in the top class' }, when: '1 check', clear: 'Matches again', warn: 'Warning; listed under config drift', crit: 'Critical, P2; card payments are not protected', feeds: 'Config compliance' },
  { k: 'ec.failover.count', m: 'Failovers', unit: 'per hour', src: 'Orchestrator alarms and syslog', every: 'live', calc: 'Path changes in a rolling hour', th: [3, 6], when: 'As soon as the count is reached', clear: 'Under warning for 1 hour', warn: 'Warning; line marked as flapping', crit: 'Critical, P3; carrier case opened for the flapping line', feeds: 'Carrier SLA, problem records' },
  { k: 'ec.cpu', m: 'CPU', unit: '%', src: 'SNMPv3 HOST-RESOURCES-MIB hrProcessorLoad', every: '5 min', calc: 'Average across all cores', th: [80, 90], when: '3 polls in a row (15 min)', clear: '2 polls under warning', warn: 'Warning alert in OpsRamp; no ticket', crit: 'Critical, P3; top talkers captured for L2', feeds: 'Capacity and lifecycle' },
  { k: 'ec.memory', m: 'Memory', unit: '%', src: 'SNMPv3 HOST-RESOURCES-MIB hrStorageUsed ÷ hrStorageSize (RAM)', every: '5 min', calc: 'Used ÷ total RAM', th: [85, 95], when: '3 polls in a row (15 min)', clear: '2 polls under warning', warn: 'Warning alert in OpsRamp; no ticket', crit: 'Critical, P3', feeds: 'Capacity and lifecycle' },
  { k: 'ec.if.status', m: 'Interface status', unit: '', src: 'SNMPv3 IF-MIB ifOperStatus against ifAdminStatus; linkDown trap', every: '5 min and live', calc: 'Port set up but not passing traffic', th: { w: 'LAN port down', c: 'WAN port down' }, when: 'Trap or 1 poll', clear: 'Port back up', warn: 'Warning alert in OpsRamp; no ticket', crit: 'Critical; correlated with the tunnel state on that line', feeds: 'Availability SLA' },
];
const SW_ENV = (src) => [
  { k: 'sw.psu', m: 'Power supplies', unit: '', src: src.psu, every: '5 min and trap', calc: 'State of each power supply', th: { w: 'One of two failed', c: 'Only supply failed' }, when: 'Trap or 1 poll', clear: 'Supply OK', warn: 'Warning; replacement part ordered', crit: 'Critical, P2; dispatch with the part', feeds: 'Field Dispatch' },
  { k: 'sw.fan', m: 'Fans', unit: '', src: src.fan, every: '5 min and trap', calc: 'State of each fan tray', th: { w: 'One fan failed', c: 'Two or more failed' }, when: 'Trap or 1 poll', clear: 'Fans OK', warn: 'Warning alert in OpsRamp; no ticket', crit: 'Critical, P3; dispatch', feeds: 'Field Dispatch' },
];
const MET_CX = [
  AVAIL('The switch', 'P2; APs and POS ports behind it are suppressed under this alert'),
  { k: 'sw.cpu', m: 'CPU', unit: '%', src: 'AOS-CX REST, management module resource_utilization', every: '5 min', calc: 'Average over the poll', th: P([70, 90], [70, 90], [65, 85]), when: '3 polls in a row (15 min)', clear: '2 polls under warning', warn: 'Warning alert in OpsRamp; no ticket', crit: 'Critical, P3; control-plane log captured', feeds: 'Capacity and lifecycle' },
  { k: 'sw.memory', m: 'Memory', unit: '%', src: 'AOS-CX REST, management module resource_utilization', every: '5 min', calc: 'Used ÷ total', th: [80, 90], when: '3 polls in a row (15 min)', clear: '2 polls under warning', warn: 'Warning alert in OpsRamp; no ticket', crit: 'Critical, P3', feeds: 'Capacity and lifecycle' },
  ...SW_ENV({ psu: 'SNMPv3 ARUBAWIRED-POWERSUPPLY-MIB', fan: 'SNMPv3 ARUBAWIRED-FAN-MIB' }),
  { k: 'sw.temp', m: 'Temperature', unit: '°C', src: 'SNMPv3 ARUBAWIRED-TEMPSENSOR-MIB', every: '5 min', calc: 'Highest sensor reading', th: [60, 70], when: '2 polls in a row (10 min)', clear: '2 polls under warning', warn: 'Warning; store asked to check the cabinet', crit: 'Critical, P3', feeds: 'Field Dispatch' },
  { k: 'sw.if.crc', m: 'CRC errors, each port', unit: 'per 5 min', src: 'SNMPv3 IF-MIB ifInErrors', every: '5 min', calc: 'Increase in the counter since the last poll', th: P([50, 500], [50, 500], [25, 250]), when: '3 polls in a row (15 min)', clear: '3 clean polls', warn: 'Warning; runbook tests the cable', crit: 'Critical, P3; dispatch to re-terminate or replace the cable', feeds: 'Problem records' },
  { k: 'sw.if.discards', m: 'Output drops, each port', unit: 'per 5 min', src: 'SNMPv3 IF-MIB ifOutDiscards', every: '5 min', calc: 'Increase in the counter since the last poll', th: [100, 1000], when: '3 polls in a row (15 min)', clear: '3 clean polls', warn: 'Warning alert in OpsRamp; no ticket', crit: 'Critical, P4; QoS checked on the uplink', feeds: 'Network performance KPIs' },
  { k: 'sw.poe.budget', m: 'PoE budget used', unit: '%', src: 'SNMPv3 ARUBAWIRED-POE-MIB (power drawn ÷ power available)', every: '5 min', calc: 'Power drawn ÷ budget for the switch', th: P([80, 95], [80, 95], [75, 90]), when: '2 polls in a row (10 min)', clear: '2 polls under warning', warn: 'Warning; listed on capacity', crit: 'Critical, P3; PoE priority keeps APs and phones powered', feeds: 'Capacity and lifecycle' },
  { k: 'sw.port.status', m: 'Port up and down', unit: '', src: 'SNMPv3 linkDown and linkUp traps; IF-MIB ifOperStatus', every: 'live', calc: 'Port state; more than 5 changes in 10 minutes is flapping', th: { w: 'AP, POS or printer port down, or flapping', c: 'Uplink port down' }, when: 'Trap', clear: 'Up for 5 min', warn: 'Warning; correlated with the device on that port', crit: 'Critical, P2', feeds: 'Branch Readiness' },
  { k: 'sw.stp', m: 'Loop protect and spanning tree', unit: 'per hour', src: 'Syslog loop-protect events; STP topology changes', every: 'live', calc: 'Loop events and topology changes in a rolling hour', th: [10, 30], when: 'Count reached, or any loop-protect event', clear: 'Quiet for 1 hour', warn: 'Warning alert in OpsRamp; no ticket', crit: 'Critical, P2; port shut by loop protect, store told which port', feeds: 'Problem records' },
  { k: 'sw.uplink.use', m: 'Uplink use', unit: '%', src: 'SNMPv3 IF-MIB ifHCInOctets and ifHCOutOctets ÷ ifHighSpeed', every: '5 min', calc: 'Bits per second over the poll ÷ port speed, the higher direction', th: [70, 85], when: '3 polls in a row (15 min)', clear: '2 polls under warning', warn: 'Warning alert in OpsRamp; no ticket', crit: 'Critical, P4; listed on capacity', feeds: 'Capacity and lifecycle' },
];
const MET_2530 = [
  AVAIL('The switch', 'P2; APs and POS ports behind it are suppressed under this alert'),
  { k: 'sw.cpu', m: 'CPU', unit: '%', src: 'SNMPv3 STATISTICS-MIB hpSwitchCpuStat', every: '5 min', calc: 'Average over the last minute, read every poll', th: P([70, 90], [70, 90], [65, 85]), when: '3 polls in a row (15 min)', clear: '2 polls under warning', warn: 'Warning alert in OpsRamp; no ticket', crit: 'Critical, P3', feeds: 'Capacity and lifecycle' },
  { k: 'sw.memory', m: 'Memory', unit: '%', src: 'SNMPv3 NETSWITCH-MIB hpLocalMemFreeBytes and hpLocalMemTotalBytes', every: '5 min', calc: '1 − free ÷ total', th: [80, 90], when: '3 polls in a row (15 min)', clear: '2 polls under warning', warn: 'Warning alert in OpsRamp; no ticket', crit: 'Critical, P3', feeds: 'Capacity and lifecycle' },
  ...SW_ENV({ psu: 'SNMPv3 HP-ICF-CHASSIS hpicfSensorStatus (power)', fan: 'SNMPv3 HP-ICF-CHASSIS hpicfSensorStatus (fan)' }),
  { k: 'sw.if.crc', m: 'CRC errors, each port', unit: 'per 5 min', src: 'SNMPv3 IF-MIB ifInErrors', every: '5 min', calc: 'Increase in the counter since the last poll', th: P([50, 500], [50, 500], [25, 250]), when: '3 polls in a row (15 min)', clear: '3 clean polls', warn: 'Warning; runbook tests the cable', crit: 'Critical, P3; dispatch', feeds: 'Problem records' },
  { k: 'sw.poe.budget', m: 'PoE budget used', unit: '%', src: 'SNMPv3 POWER-ETHERNET-MIB pethMainPseConsumptionPower ÷ pethMainPsePower', every: '5 min', calc: 'Power drawn ÷ budget for the switch', th: P([80, 95], [80, 95], [75, 90]), when: '2 polls in a row (10 min)', clear: '2 polls under warning', warn: 'Warning alert in OpsRamp; no ticket', crit: 'Critical, P3', feeds: 'Capacity and lifecycle' },
  { k: 'sw.port.status', m: 'Port up and down', unit: '', src: 'SNMPv3 linkDown and linkUp traps', every: 'live', calc: 'Port state; more than 5 changes in 10 minutes is flapping', th: { w: 'AP, POS or printer port down, or flapping', c: 'Uplink port down' }, when: 'Trap', clear: 'Up for 5 min', warn: 'Warning alert in OpsRamp; no ticket', crit: 'Critical, P2', feeds: 'Branch Readiness' },
];
const MET_AP = [
  { k: 'ap.status', m: 'AP up and down', unit: '', src: 'Aruba Central API, AP status; Central webhook on AP down', every: '5 min and live', calc: 'Down when Central loses the AP for 2 polls', th: { w: 'One AP down at the store', c: 'Half or more of the store’s APs down' }, when: '2 polls (10 min) or webhook', clear: 'Up for 5 min', warn: 'Warning; checked against the switch port first', crit: 'Critical, P2; handheld scanning at risk', feeds: 'Availability SLA, Branch Readiness' },
  { k: 'ap.clients', m: 'Clients connected', unit: '', src: 'Aruba Central API, client count per AP and SSID', every: '5 min', calc: 'Count, compared with the same hour last week', th: { w: 'Under half of the usual count in store hours', c: 'No clients on SRS-SCAN in store hours' }, when: '3 polls in a row (15 min)', clear: 'Back to the usual range', warn: 'Warning; anomaly view', crit: 'Critical, P2', feeds: 'Store experience' },
  { k: 'ap.airtime', m: 'Airtime use at peak', unit: '%', src: 'Aruba Central API, radio channel utilisation', every: '5 min', calc: 'Busiest radio, average over the poll', th: P([75, 90], [70, 85], [65, 80]), when: '3 polls in a row (15 min)', clear: '2 polls under warning', warn: 'Warning alert in OpsRamp; no ticket', crit: 'Critical, P4; channel plan reviewed (AirMatch)', feeds: 'Capacity, store experience' },
  { k: 'ap.noise', m: 'Noise floor', unit: 'dBm', src: 'Aruba Central API, radio noise floor', every: '5 min', calc: 'Highest of the two radios; a higher (less negative) value is worse', th: [-85, -75], when: '3 polls in a row (15 min)', clear: '2 polls under warning', warn: 'Warning alert in OpsRamp; no ticket', crit: 'Critical, P4; interference source looked for', feeds: 'Store experience' },
  { k: 'ap.retries', m: 'Retries', unit: '%', src: 'Aruba Central API, radio retry rate', every: '5 min', calc: 'Frames sent again ÷ frames sent', th: [15, 25], when: '3 polls in a row (15 min)', clear: '2 polls under warning', warn: 'Warning alert in OpsRamp; no ticket', crit: 'Critical, P4', feeds: 'Store experience' },
  { k: 'ap.reboots', m: 'Reboots', unit: 'per day', src: 'Aruba Central webhook (AP up after down) and uptime', every: 'live', calc: 'Reboots in a rolling 24 hours', th: [2, 4], when: 'Count reached', clear: 'None for 24 hours', warn: 'Warning; first response FR-03 ignores watchdog reboots that recover in 3 minutes', crit: 'Critical, P3; firmware and power checked', feeds: 'Problem records, firmware waves' },
  { k: 'ap.poe', m: 'Power at the switch port', unit: '', src: 'Switch PoE MIB for the port the AP is on', every: '5 min', calc: 'Power class given against what the model needs', th: { w: 'AP running on reduced power', c: 'Port gives no power' }, when: '2 polls (10 min)', clear: 'Full power', warn: 'Warning; radios may be limited', crit: 'Critical, P3', feeds: 'Capacity' },
];
const MET_APO = [
  ...MET_AP,
  { k: 'ap.temp', m: 'Radio temperature', unit: '°C', src: 'Aruba Central API, AP temperature', every: '5 min', calc: 'Highest reading', th: P([65, 75], [65, 75], [68, 78]), when: '2 polls in a row (10 min)', clear: '2 polls under warning', warn: 'Warning alert in OpsRamp; no ticket', crit: 'Critical, P3; shade or mount checked', feeds: 'Field Dispatch' },
  { k: 'ap.eth.errors', m: 'Errors on the outdoor cable run', unit: 'per 5 min', src: 'Switch IF-MIB ifInErrors for the AP port', every: '5 min', calc: 'Increase in the counter since the last poll', th: [25, 250], when: '3 polls in a row (15 min)', clear: '3 clean polls', warn: 'Warning alert in OpsRamp; no ticket', crit: 'Critical, P3; dispatch to check the surge protector and cable', feeds: 'Problem records' },
];
const MET_CIR = [
  { k: 'line.status', m: 'Up and down, flaps', unit: '', src: 'Orchestrator underlay state; Simplify access-link feed', every: '1 min and live', calc: 'Down when the underlay is down for 2 polls; more than 3 drops in an hour is flapping', th: { w: 'Flapping, or backup line down', c: 'Primary line down' }, when: '2 polls (2 min)', clear: 'Up for 10 min', warn: 'Warning; carrier case opened if flapping', crit: 'Critical, P2; carrier case opened automatically', feeds: 'Carrier SLA, availability SLA' },
  { k: 'line.latency', m: 'Latency on the active path', unit: 'ms', src: 'Orchestrator underlay statistics', every: '1 min', calc: 'Average of five 1-minute samples in each 5-minute window', th: P([100, 120], [80, 100], [60, 80]), when: '3 windows in a row (15 min)', clear: '2 windows under warning', warn: 'Warning; anomaly view', crit: 'Critical, P3; carrier case with the readings attached', feeds: 'Carrier SLA, network performance KPIs' },
  { k: 'line.jitter', m: 'Jitter', unit: 'ms', src: 'Orchestrator underlay statistics', every: '1 min', calc: 'Mean variation in delay, averaged over 5 minutes', th: P([20, 30], [15, 30], [10, 20]), when: '3 windows in a row (15 min)', clear: '2 windows under warning', warn: 'Warning alert in OpsRamp; no ticket', crit: 'Critical, P3', feeds: 'Network performance KPIs' },
  { k: 'line.loss', m: 'Packet loss', unit: '%', src: 'Orchestrator underlay statistics', every: '1 min', calc: 'Packets lost ÷ packets sent over 5 minutes', th: P([1, 1.5], [0.5, 1], [0.3, 0.5]), when: '2 windows in a row (10 min)', clear: '2 windows under warning', warn: 'Warning alert in OpsRamp; no ticket', crit: 'Critical, P3; carrier case', feeds: 'Carrier SLA, network performance KPIs' },
  { k: 'line.use.p95', m: 'Use at peak', unit: '%', src: 'EdgeConnect WAN port octets ÷ contracted speed', every: '5 min', calc: '95th percentile of the 5-minute samples in each hour', th: P([80, 90], [75, 85], [70, 80]), when: '3 hours in a day', clear: 'A day under warning', warn: 'Warning; listed on capacity', crit: 'Critical, P4; upgrade proposed in Carrier Management', feeds: 'Capacity, carrier forecast' },
  { k: 'line.sla', m: 'Carrier SLA against contract', unit: '%', src: 'Up and down history for the month', every: 'hourly', calc: 'Minutes up ÷ minutes in the month, against the contracted availability', th: { w: 'Within 0.05% of the contract', c: 'Below the contract' }, when: 'Each hour', clear: 'Next month', warn: 'Warning alert in OpsRamp; no ticket', crit: 'Credit claim prepared for the carrier', feeds: 'Carrier SLA, service credits' },
];
const MET_APP = [
  { k: 'app.synthetic', m: 'Synthetic test passes', unit: '', src: 'Synthetic tests from each branch (ERP, Pricing, Azure apps)', every: '15 min', calc: 'Pass or fail for each test', th: { w: '1 test failed', c: '2 runs in a row failed' }, when: '2 runs (30 min)', clear: '1 pass', warn: 'Warning alert in OpsRamp; no ticket', crit: 'Critical, P2; correlated with WAN latency at the same store (CP-03)', feeds: 'Application SLA' },
  { k: 'app.response', m: 'Response time from the branch', unit: 'ms', src: 'New Relic webhook; synthetic timings', every: '15 min and live', calc: 'Median of the runs in the hour, per app', th: [1500, 3000], when: '2 runs in a row (30 min)', clear: '2 runs under warning', warn: 'Warning alert in OpsRamp; no ticket', crit: 'Critical, P3; app team or network, decided by correlation', feeds: 'Application SLA' },
  { k: 'app.pos.rtt', m: 'Card payment path round trip', unit: 'ms', src: 'Synthetic test to the payment processor', every: '15 min', calc: 'Round trip for a test authorisation', th: P([400, 800], [400, 800], [300, 600]), when: '2 runs in a row (30 min)', clear: '2 runs under warning', warn: 'Warning alert in OpsRamp; no ticket', crit: 'Critical, P2; card payments at risk', feeds: 'Card payment experience' },
  { k: 'app.errors', m: 'Errors and timeouts', unit: '%', src: 'New Relic error rate per app and branch', every: 'live', calc: 'Failed requests ÷ all requests over 15 minutes', th: [2, 5], when: '15 min', clear: '15 min under warning', warn: 'Warning alert in OpsRamp; no ticket', crit: 'Critical, P3', feeds: 'Application SLA' },
];
export const METRICS = { 'TPL-EC': MET_EC, 'TPL-CX': MET_CX, 'TPL-2530': MET_2530, 'TPL-AP': MET_AP, 'TPL-APO': MET_APO, 'TPL-CIR': MET_CIR, 'TPL-APP': MET_APP };

// where each metric comes from on a new make or model; metrics not listed keep the standard source (ping, IF-MIB)
export const VENDOR_SRC = {
  cat9k: { 'sw.cpu': 'SNMPv3 CISCO-PROCESS-MIB cpmCPUTotal5minRev', 'sw.memory': 'SNMPv3 CISCO-MEMORY-POOL-MIB ciscoMemoryPoolUsed ÷ (used + free)', 'sw.psu': 'SNMPv3 CISCO-ENVMON-MIB ciscoEnvMonSupplyState', 'sw.fan': 'SNMPv3 CISCO-ENVMON-MIB ciscoEnvMonFanState', 'sw.temp': 'SNMPv3 CISCO-ENVMON-MIB ciscoEnvMonTemperatureStatusValue', 'sw.poe.budget': 'SNMPv3 CISCO-POWER-ETHERNET-EXT-MIB (power drawn ÷ power available)', 'sw.stp': 'Syslog STP and loop-guard events; BRIDGE-MIB topology changes' },
  'meraki-mr': { 'ap.status': 'Meraki Dashboard API, device status; Meraki webhook on AP down', 'ap.clients': 'Meraki Dashboard API, clients per AP and SSID', 'ap.airtime': 'Meraki Dashboard API, channel utilisation per radio', 'ap.noise': 'Meraki Dashboard API, RF health', 'ap.retries': 'Meraki Dashboard API, wireless packet loss and retries', 'ap.reboots': 'Meraki webhook (AP up after down) and uptime' },
  'cat-sdwan': { 'ec.tunnel.state': 'vManage API, BFD session state per path', 'ec.path.latency': 'vManage API, app-route statistics (latency)', 'ec.path.jitter': 'vManage API, app-route statistics (jitter)', 'ec.path.loss': 'vManage API, app-route statistics (loss)', 'ec.bio.drift': 'vManage API, applied centralised policy against the golden version', 'ec.failover.count': 'vManage alarms and syslog' },
};
