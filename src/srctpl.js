// What onboarding looks like for each kind of source, and the OpsRamp template each source gets. A cloud account
// connects with a read-only role and its own metrics; a monitoring tool sends its alerts in; a service desk maps
// fields both ways; network kit is discovered through the gateway. Each source opens its own template.
const M = (k, m, unit, src, every, calc, th, crit, feeds) => ({ k, m, unit, src, every, calc, th, when: every === 'live' ? 'as it arrives' : '2 polls in a row', clear: '2 polls under warning', warn: 'Warning alert in OpsRamp; no ticket', crit, feeds });

const CLOUD = {
  aws: { name: 'AWS CloudWatch', models: ['EC2', 'RDS', 'ELB', 'Lambda', 'Site-to-Site VPN'], acct: 'IAM role OpsRampReadOnly (read-only, external ID) in 2 accounts', regions: 'us-east-1, us-west-2 · EC2, RDS, ELB, Lambda, VPN', events: 'CloudWatch alarms through EventBridge to the OpsRamp webhook', api: 'CloudWatch GetMetricData', inv: 'AWS Config inventory', ci: 'cmdb_ci_cloud_service_account', parent: 'Site-to-Site VPN tunnel to the data centre',
    mets: [M('aws.ec2.cpu', 'EC2 CPU', '%', 'CloudWatch AWS/EC2 CPUUtilization', '5 min', 'Average over 5 minutes', [85, 95], 'Critical, P3; cloud team', 'Cloud availability'),
      M('aws.ec2.status', 'EC2 status checks', '', 'CloudWatch AWS/EC2 StatusCheckFailed', '1 min', 'Any failed check', { w: '1 failed', c: '3 failed in a row' }, 'Critical, P2 if a store app runs on it', 'Cloud availability'),
      M('aws.rds.conn', 'RDS connections', '%', 'CloudWatch AWS/RDS DatabaseConnections ÷ max', '5 min', 'Connections ÷ the instance limit', [80, 95], 'Critical, P3', 'ERP availability'),
      M('aws.elb.5xx', 'Load balancer 5xx', '%', 'CloudWatch AWS/ApplicationELB HTTPCode_ELB_5XX_Count ÷ requests', '1 min', 'Errors ÷ requests over 5 minutes', [2, 5], 'Critical, P2; checked against store WAN first', 'Application SLA'),
      M('aws.lambda.err', 'Lambda errors and throttles', '%', 'CloudWatch AWS/Lambda Errors, Throttles', '5 min', 'Errors ÷ invocations', [1, 5], 'Critical, P3', 'Application SLA'),
      M('aws.vpn.tunnel', 'VPN tunnel to the data centre', '', 'CloudWatch AWS/VPN TunnelState', '1 min', 'Up or down, per tunnel', { w: '1 tunnel down', c: 'both tunnels down' }, 'Critical, P2; stores lose cloud apps', 'Cloud availability')] },
  azure: { name: 'Azure Monitor', models: ['Virtual machines', 'App Service', 'Azure SQL', 'VPN gateway'], acct: 'Service principal with Monitoring Reader on 3 subscriptions', regions: 'East US 2, Central US · VMs, App Service, SQL, VPN gateway', events: 'Azure Monitor alerts through an action group webhook', api: 'Azure Monitor metrics API', inv: 'Azure Resource Graph', ci: 'cmdb_ci_azure_subscription', parent: 'VPN gateway to the data centre',
    mets: [M('az.vm.cpu', 'VM CPU', '%', 'Azure Monitor Percentage CPU', '5 min', 'Average over 5 minutes', [85, 95], 'Critical, P3; cloud team', 'Cloud availability'),
      M('az.app.http5xx', 'App Service 5xx', '%', 'Azure Monitor Http5xx ÷ Requests', '1 min', 'Errors ÷ requests', [2, 5], 'Critical, P2', 'Application SLA'),
      M('az.sql.dtu', 'Azure SQL DTU use', '%', 'Azure Monitor dtu_consumption_percent', '5 min', 'Average over 5 minutes', [80, 95], 'Critical, P3', 'ERP availability'),
      M('az.vpn.tunnel', 'VPN gateway tunnel', '', 'Azure Monitor TunnelAverageBandwidth and connection state', '1 min', 'Up or down', { w: 'degraded', c: 'down' }, 'Critical, P2', 'Cloud availability')] },
  gcp: { name: 'Google Cloud Monitoring', models: ['Compute Engine', 'Cloud SQL', 'Load balancing', 'Cloud VPN'], acct: 'Service account with Monitoring Viewer', regions: 'us-central1 · Compute, Cloud SQL, LB, VPN', events: 'Alerting policies through a Pub/Sub push to OpsRamp', api: 'Cloud Monitoring API', inv: 'Cloud Asset Inventory', ci: 'cmdb_ci_cloud_service_account', parent: 'Cloud VPN to the data centre',
    mets: [M('gcp.vm.cpu', 'VM CPU', '%', 'compute.googleapis.com/instance/cpu/utilization', '5 min', 'Average', [85, 95], 'Critical, P3', 'Cloud availability'), M('gcp.sql.conn', 'Cloud SQL connections', '%', 'cloudsql.googleapis.com/database/network/connections', '5 min', 'Connections ÷ limit', [80, 95], 'Critical, P3', 'Application SLA')] },
  oci: { name: 'Oracle Cloud Monitoring', models: ['Compute', 'Autonomous Database', 'FastConnect'], acct: 'API signing key for a read-only group', regions: 'us-ashburn-1 · Compute, ADB, FastConnect', events: 'Alarms through Notifications to the OpsRamp webhook', api: 'OCI Monitoring API', inv: 'OCI Search', ci: 'cmdb_ci_cloud_service_account', parent: 'FastConnect to the data centre',
    mets: [M('oci.vm.cpu', 'Compute CPU', '%', 'oci_computeagent CpuUtilization', '5 min', 'Average', [85, 95], 'Critical, P3', 'Cloud availability'), M('oci.fc.state', 'FastConnect state', '', 'oci_fastconnect ConnectionState', '1 min', 'Up or down', { w: 'degraded', c: 'down' }, 'Critical, P2', 'Cloud availability')] },
  vmware: { name: 'VMware vCenter', models: ['ESXi hosts', 'VMs', 'Datastores'], acct: 'vCenter read-only user', regions: 'Dallas and Atlanta data centres · 2 vCenters', events: 'vCenter alarms and events through the gateway', api: 'vSphere API', inv: 'vCenter inventory', ci: 'cmdb_ci_esx_server', parent: 'ESXi host',
    mets: [M('vm.host.cpu', 'Host CPU', '%', 'vSphere cpu.usage.average', '5 min', 'Average', [85, 95], 'Critical, P3', 'Data centre'), M('vm.ds.free', 'Datastore free', '%', 'vSphere disk.capacity and provisioned', '15 min', 'Free ÷ capacity', [15, 5], 'Critical, P3', 'Data centre')] },
};
const TOOLS = {
  appd: ['AppDynamics', 'Health rule violations', 'AppDynamics HTTP request action to OpsRamp'], datadog: ['Datadog', 'Monitors', 'Datadog webhook integration'], dyna: ['Dynatrace', 'Problems', 'Dynatrace problem notification webhook'],
  prom: ['Prometheus', 'Alertmanager alerts', 'Alertmanager webhook receiver'], splunk: ['Splunk', 'Saved-search alerts', 'Splunk alert action webhook'], solarwinds: ['SolarWinds', 'Alerts', 'SolarWinds alert action HTTP POST'], zabbix: ['Zabbix', 'Triggers', 'Zabbix media type webhook'],
};
const DESKS = {
  snow: ['ServiceNow', 'OAuth app in the SRS instance', 'Incident: short description, CI, impact, urgency, assignment group, work notes', 'Incident, problem, change; CMDB both ways'],
  jira: ['Jira Service Management', 'API token for a service account', 'Request type, summary, components, priority, comments', 'Issues both ways'],
  bmc: ['BMC Helix', 'REST user with incident rights', 'Summary, CI, impact, urgency, support group, notes', 'Incidents both ways'],
  fresh: ['Freshservice', 'API key for an agent group', 'Subject, asset, priority, group, notes', 'Tickets both ways'],
  teams: ['Microsoft Teams and email', 'Incoming webhook and SMTP relay', 'Card: priority, branch, what happened, link', 'Notices one way'],
  slack: ['Slack', 'Slack app with chat:write', 'Message: priority, branch, what happened, link', 'Notices one way'],
};
const HW = {
  proliant: ['HPE ProLiant and Synergy servers', 'iLO Redfish', 'iLO user, read-only', ['Health, fans, power supplies, temperature', 'Drive and array state', 'Memory and CPU errors', 'Firmware level']],
  alletra: ['HPE Alletra and Primera storage', 'Array REST API', 'Array user, browse role', ['Capacity used', 'Latency and IOPS', 'Replication state', 'Controller and drive health']],
  simplivity: ['HPE SimpliVity and StoreOnce', 'REST API', 'Read-only user', ['Backup jobs', 'Capacity and dedup ratio', 'Node health']],
  airwave: ['HPE Aruba AirWave', 'AirWave API', 'AirWave read-only user', ['AP up and down', 'Clients', 'Rogue APs', 'Controller health']],
  cnx: ['HPE Aruba CNX (GreenLake)', 'GreenLake API', 'GreenLake API client', ['Devices up and down', 'Site health', 'Firmware compliance']],
};
const SNMP_V = { forti: 'Fortinet FortiGate', arista: 'Arista switches', extreme: 'Extreme switches', infoblox: 'Infoblox DDI', palo: 'Palo Alto firewalls', snmp: 'Any SNMP device' };

// the onboarding steps for a source: [label, what happened]
export function stepsOf(id, cat, found) {
  const c = CLOUD[id], t = TOOLS[id], d = DESKS[id], h = HW[id];
  if (c) return [['Cloud account', c.acct], ['Regions and services', c.regions], ['Resource discovery', found ? `${found} resources found (${c.inv})` : `no SRS resources there yet (${c.inv})`], ['Template', `${tplId(id)} ${c.name}`], ['Alarms to events', c.events], ['ServiceNow CMDB', `cloud resources as ${c.ci}`]];
  if (t) return [['API key', `${t[0]} API key, read-only`], ['Apps and services', `${t[0]} services matched to SRS apps`], ['Alert webhook', t[2]], ['Alert mapping', `${t[1]} mapped to OpsRamp alerts, severity and CI`], ['Correlation with the network', 'app alerts grouped with WAN problems at the same store'], ['ServiceNow', 'tickets through the OpsRamp escalation policy']];
  if (d) return [['Connect', d[1]], ['Field mapping', d[2]], ['Sync', d[3]], ['Assignment groups', 'OpsRamp routing mapped to the groups'], ['Test ticket', 'created and closed back in OpsRamp']];
  if (cat === 'Lines and carriers') return [['Portal or API', id === 'circuits' ? 'Simplify access-link feed (webhook)' : 'carrier portals by REST or email'], ['Circuit IDs matched', `${found} circuits matched to branches`], ['Ticket sync', 'carrier case numbers on the incident'], ['Template', 'TPL-CIR ISP circuits'], ['ServiceNow', 'carrier cases linked to incidents']];
  if (h) return [['Gateway', 'NextGen gateway in the data centre'], ['Credentials', h[2]], ['Discovery', `${found} found through ${h[1]}`], ['Template', `${tplId(id)} ${h[0]}`], ['Events', `${h[1]} events and alerts`], ['ServiceNow', 'CIs and incidents']];
  if (id === 'cat9k' || id === 'meraki') return [['Gateway', id === 'meraki' ? 'no gateway: Meraki Dashboard API' : 'NextGen gateway at the site'], ['Credentials', id === 'meraki' ? 'Dashboard API key, read' : 'SNMPv3 authPriv + RESTCONF'], ['Discovery', `${found} found${id === 'cat9k' ? ', sysObjectID 1.3.6.1.4.1.9' : ''}`], ['Template', id === 'meraki' ? 'TPL-MERAKI-MR Cisco Meraki MR' : 'TPL-CAT9K Cisco Catalyst 9200 / 9300'], ['Events', id === 'meraki' ? 'Meraki webhooks' : 'traps and syslog'], ['ServiceNow', 'CIs and incidents']];
  if (SNMP_V[id] || id === 'juniper') return [['Gateway', 'NextGen gateway at the site'], ['Credentials', 'SNMPv3 authPriv'], ['Discovery', `${found} found by sysObjectID`], ['Template', `${tplId(id)} ${SNMP_V[id] || 'Juniper'}`], ['Events', 'traps and syslog'], ['ServiceNow', 'CIs and incidents']];
  return [['Gateway', 'NextGen gateway at the site'], ['Credentials', 'SNMPv3 + REST'], ['Discovery', `${found} found`], ['Template', 'the matching template'], ['Events', 'traps, syslog and webhooks'], ['ServiceNow', 'CIs and incidents']];
}
export const tplId = id => ({ aws: 'TPL-AWS', azure: 'TPL-AZ', gcp: 'TPL-GCP', oci: 'TPL-OCI', vmware: 'TPL-VMW', cat9k: 'TPL-CAT9K', meraki: 'TPL-MERAKI-MR', forti: 'TPL-FORTIGATE' }[id] || `TPL-${id.toUpperCase()}`);
// the template a source gets once it is connected, in the same shape as the device templates
export function templateOf(id, n) {
  const c = CLOUD[id], t = TOOLS[id], h = HW[id];
  if (c) return { id: tplId(id), src: id, name: c.name, cls: 'Cloud resources', models: c.models, n, how: [[c.api, 'every 1 to 5 min'], [c.events.split(' through ')[0], 'live'], [c.inv, 'every 1 h']], metrics: c.mets.map(m => m.m), parent: c.parent, snow: ['Cloud › ' + c.name.split(' ')[0], 'SRS Cloud team', c.ci], ver: 'v1.0', mets: c.mets };
  if (t) return { id: tplId(id), src: id, name: `${t[0]} alerts`, cls: 'Application path', models: [t[1]], n, how: [[t[2], 'live']], metrics: [`${t[1]} as OpsRamp alerts`, 'Severity and CI mapped', 'Grouped with WAN problems at the same store'], parent: 'The store or app the alert names', snow: ['Application › Performance', 'SRS Application Support', 'Application (cmdb_ci_appl)'], ver: 'v1.0',
    mets: [M(`${id}.alert`, `${t[1]}`, '', t[2], 'live', 'Each alert from the tool, deduplicated', { w: 'warning in the tool', c: 'critical in the tool' }, 'Critical, P3; correlated with the store network first', 'Application SLA')] };
  if (h) return { id: tplId(id), src: id, name: h[0], cls: id === 'airwave' || id === 'cnx' ? 'Wi-Fi AP' : 'Data centre', models: [h[0].replace(/^HPE (Aruba )?/, '')], n, how: [[h[1], 'every 5 min'], ['Events', 'live']], metrics: h[3], parent: id === 'airwave' || id === 'cnx' ? 'Switch port it is plugged into' : 'Data centre rack and power', snow: ['Data centre', 'SRS Infrastructure', 'Server or storage (cmdb_ci_server)'], ver: 'v1.0' };
  if (SNMP_V[id] || id === 'juniper') return { id: tplId(id), src: id, name: SNMP_V[id] || 'Juniper', cls: /firewall|FortiGate/i.test(SNMP_V[id] || '') ? 'Firewall' : 'Access switch', models: [SNMP_V[id] || 'Juniper EX'], n, how: [['SNMPv3', 'every 5 min'], ['Traps and syslog', 'live']], metrics: ['Up and down (ping, sysUpTime)', 'Interfaces (IF-MIB)', 'CPU and memory (HOST-RESOURCES-MIB)', 'Vendor health MIBs'], parent: 'EdgeConnect at the same store', snow: ['Network › LAN', 'Movate NOC – L2 Network', 'Network gear (cmdb_ci_netgear)'], ver: 'v1.0' };
  return null;
}
export const isDesk = id => !!DESKS[id];
export const deskOf = id => DESKS[id];
