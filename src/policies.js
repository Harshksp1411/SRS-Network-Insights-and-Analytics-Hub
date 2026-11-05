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

// thresholds by store profile: a busy yard is not judged against a small branch
export const THRESHOLDS = [
  { m: 'Latency on the active path', unit: 'ms', S: [100, 120], M: [80, 100], L: [60, 80], tpl: 'TPL-CIR' },
  { m: 'Packet loss', unit: '%', S: [1, 1.5], M: [0.5, 1], L: [0.3, 0.5], tpl: 'TPL-CIR' },
  { m: 'Jitter', unit: 'ms', S: [20, 30], M: [15, 30], L: [10, 20], tpl: 'TPL-CIR' },
  { m: 'Line use at peak', unit: '%', S: [80, 90], M: [75, 85], L: [70, 80], tpl: 'TPL-CIR' },
  { m: 'Switch CPU', unit: '%', S: [70, 90], M: [70, 90], L: [65, 85], tpl: 'TPL-CX' },
  { m: 'PoE budget used', unit: '%', S: [80, 95], M: [80, 95], L: [75, 90], tpl: 'TPL-CX' },
  { m: 'CRC errors per 5 min', unit: '', S: [50, 500], M: [50, 500], L: [25, 250], tpl: 'TPL-CX' },
  { m: 'Wi-Fi airtime at peak', unit: '%', S: [75, 90], M: [70, 85], L: [65, 80], tpl: 'TPL-AP' },
  { m: 'AP radio temperature', unit: '°C', S: [65, 75], M: [65, 75], L: [68, 78], tpl: 'TPL-APO' },
  { m: 'Card payment path round trip', unit: 'ms', S: [400, 800], M: [400, 800], L: [300, 600], tpl: 'TPL-APP' },
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
  ['Alert correlation (ACP)', 'Groups related alerts into one inference by store topology, region and machine-learning co-occurrence'],
  ['First response (FRP)', 'Suppresses or snoozes known noise by user rule, training file or machine learning; modes Off, Observed, Recommend, On'],
  ['Alert escalation (AEP)', 'Raises the ServiceNow incident and escalates L1 to L2 to on-call if nobody acknowledges in time'],
];
export const ONBOARD = [
  ['SNMP walk and MIBs', 'Take an SNMP full walk of a sample device and load the vendor MIBs; register the SNMP resource type definition', 'lib'],
  ['Template', 'Copy the vendor template from the OpsRamp library into the SRS client scope, or build one with the SDK', 'lib'],
  ['Access', 'Create the credential set and attach it to the resource group: least privilege, rotated on schedule', 'access'],
  ['Discovery and assignment', 'Discovery profile by vendor and model (SNMP sysObjectID or API); a template-based alert definition assigns the template by resource type and store group', 'auto'],
  ['Same metric names', 'Map the vendor metrics to the SRS standard names, so dashboards, SLAs and correlation work unchanged', 'map'],
  ['Thresholds', 'Inherit the thresholds of the same kind of device, by store profile', 'like'],
  ['Topology', 'Parent and child links from LLDP/CDP, so a down parent suppresses its children', 'auto'],
  ['ServiceNow', 'Map to the CI class, category and assignment group; discovered devices pushed to the CMDB', 'like'],
  ['Golden config', 'Add the config template and the compliance checks for the new model', 'decide'],
  ['Pilot', 'Two stores with every new policy in Observed mode for two weeks, then roll out by region', 'decide'],
];
