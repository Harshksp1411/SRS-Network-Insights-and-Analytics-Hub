// The console's data as a structured database: CMDB configuration items (branches, network devices, circuits,
// resources added by onboarding), the relationships between them, and the operational tables (incidents,
// changes, problems, work orders, carrier cases, the audit log). Each table has typed columns, so the same
// definition builds the SQL schema, the rows written to the cloud database and the CMDB pages.
import * as D from './data.js';

const iso = t => t ? new Date(t).toISOString() : null;
// [column, type, label]; the first column is the key
export const TABLES = [
  { name: 'cmdb_ci_site', label: 'Branches', group: 'CMDB', cls: 'Site', cols: [['id', 'text', 'Sys ID'], ['number', 'int', 'Branch number'], ['name', 'text', 'Name'], ['brand', 'text', 'Brand'], ['segment', 'text', 'Business'], ['city', 'text', 'City'], ['state', 'text', 'State'], ['region', 'text', 'Region'], ['size', 'text', 'Profile'], ['timezone', 'text', 'Time zone'], ['opens', 'text', 'Opens'], ['closes', 'text', 'Closes']],
    rows: () => D.BRANCHES.map(b => ({ id: b.id, number: b.num, name: b.name, brand: b.brand, segment: b.segment, city: b.city, state: b.state, region: b.region, size: b.size, timezone: b.tz, opens: b.hours.open, closes: b.hours.close })) },
  { name: 'cmdb_ci_netgear', label: 'Network devices', group: 'CMDB', cls: 'Network gear', cols: [['id', 'text', 'Sys ID'], ['name', 'text', 'Host name'], ['class', 'text', 'Class'], ['model', 'text', 'Model'], ['make', 'text', 'Make'], ['firmware', 'text', 'Firmware'], ['serial', 'text', 'Serial / MAC'], ['site_id', 'text', 'Branch'], ['role', 'text', 'Role'], ['managed_by', 'text', 'Managed by'], ['backup_state', 'text', 'Config backup'], ['warranty_end', 'timestamptz', 'Warranty / contract end']],
    rows: s => D.DEVICES.map(d => { const ds = (s.devState || {})[d.id] || {}; const bk = ds.backup || d.backup; return { id: d.id, name: d.id, class: { 'SD-WAN': 'SD-WAN appliance', Switch: 'IP switch', AP: 'Wireless access point' }[d.type] || d.type, model: d.model, make: 'HPE Aruba Networking', firmware: d.fw, serial: d.serial, site_id: d.branchId, role: d.role, managed_by: d.mode, backup_state: bk ? bk.st : null, warranty_end: d.warranty >= D.LIFETIME ? null : iso(d.warranty) }; }) },
  { name: 'cmdb_ci_circuit', label: 'Circuits', group: 'CMDB', cls: 'WAN circuit', cols: [['id', 'text', 'Sys ID'], ['site_id', 'text', 'Branch'], ['role', 'text', 'Role'], ['type', 'text', 'Type'], ['carrier', 'text', 'Carrier'], ['carrier_ref', 'text', 'Carrier circuit ID'], ['bandwidth_mbps', 'int', 'Bandwidth (Mb/s)'], ['status', 'text', 'Status']],
    rows: s => D.CIRCUITS.map(c => ({ id: c.id, site_id: c.branchId, role: c.role, type: c.type, carrier: c.carrier, carrier_ref: c.cid, bandwidth_mbps: c.bw, status: ((s.circuitState || {})[c.id] || {}).status || c.status || 'Up' })) },
  { name: 'cmdb_ci_onboarded', label: 'Added by onboarding', group: 'CMDB', cls: 'Onboarded resource', cols: [['id', 'text', 'Sys ID'], ['name', 'text', 'Name'], ['kind', 'text', 'Kind'], ['vendor', 'text', 'Vendor'], ['model', 'text', 'Model'], ['ip', 'text', 'IP address'], ['site', 'text', 'Site or account'], ['source', 'text', 'Source'], ['template', 'text', 'Template'], ['via', 'text', 'Added by'], ['added_at', 'timestamptz', 'Added']],
    rows: s => (s.invAdded || []).map(r => ({ id: r.id, name: r.name, kind: r.kind, vendor: r.vendor, model: r.model, ip: r.ip || null, site: r.site, source: r.source, template: r.template || null, via: r.via, added_at: iso(r.t) })) },
  { name: 'cmdb_rel_ci', label: 'CI relationships', group: 'CMDB', cls: 'Relationship', cols: [['id', 'text', 'Sys ID'], ['parent', 'text', 'Parent CI'], ['type', 'text', 'Relationship'], ['child', 'text', 'Child CI']],
    rows: () => RELS },
  { name: 'incident', label: 'Incidents', group: 'Operations', cols: [['id', 'text', 'Number'], ['priority', 'text', 'Priority'], ['short_description', 'text', 'Short description'], ['category', 'text', 'Category'], ['ci', 'text', 'Configuration item'], ['site_id', 'text', 'Branch'], ['state', 'text', 'State'], ['assignment_group', 'text', 'Assignment group'], ['assigned_to', 'text', 'Assigned to'], ['opened_at', 'timestamptz', 'Opened'], ['resolved_at', 'timestamptz', 'Resolved']],
    rows: s => [...s.incidents, ...s.resolved].map(i => ({ id: i.id, priority: i.pri, short_description: i.title, category: i.cat, ci: i.ci, site_id: i.branchId, state: i.state || (i.resolved ? 'Resolved' : 'New'), assignment_group: i.group || null, assigned_to: i.assignee || null, opened_at: iso(i.opened), resolved_at: iso(i.resolved) })) },
  { name: 'change_request', label: 'Changes', group: 'Operations', cols: [['id', 'text', 'Number'], ['title', 'text', 'Short description'], ['type', 'text', 'Type'], ['risk', 'text', 'Risk'], ['state', 'text', 'State'], ['start_at', 'timestamptz', 'Planned start'], ['end_at', 'timestamptz', 'Planned end'], ['owner', 'text', 'Owner']],
    rows: s => s.changes.map(c => ({ id: c.id, title: c.title, type: c.type, risk: c.risk, state: c.state, start_at: iso(c.start), end_at: iso(c.end), owner: c.owner || null })) },
  { name: 'problem', label: 'Problems', group: 'Operations', cols: [['id', 'text', 'Number'], ['title', 'text', 'Short description'], ['state', 'text', 'State'], ['owner', 'text', 'Owner'], ['incidents', 'int', 'Related incidents'], ['opened_at', 'timestamptz', 'Opened']],
    rows: s => s.problems.map(p => ({ id: p.id, title: p.title, state: p.state, owner: p.owner, incidents: p.incidents || 0, opened_at: iso(p.opened) })) },
  { name: 'wm_order', label: 'Work orders', group: 'Operations', cols: [['id', 'text', 'Number'], ['site_id', 'text', 'Branch'], ['task', 'text', 'Task'], ['priority', 'text', 'Priority'], ['status', 'text', 'Status'], ['technician', 'text', 'Technician'], ['incident', 'text', 'Incident']],
    rows: s => s.workOrders.map(w => ({ id: w.id, site_id: w.branchId, task: w.task, priority: w.priority || null, status: w.status, technician: w.tech || null, incident: w.inc || null })) },
  { name: 'carrier_case', label: 'Carrier cases', group: 'Operations', cols: [['id', 'text', 'Case number'], ['carrier', 'text', 'Carrier'], ['circuit', 'text', 'Circuit'], ['site_id', 'text', 'Branch'], ['status', 'text', 'Status'], ['opened_at', 'timestamptz', 'Opened'], ['eta', 'timestamptz', 'Promised by']],
    rows: s => s.cases.map(c => ({ id: c.id, carrier: c.carrier, circuit: c.circuit, site_id: c.branchId, status: c.status, opened_at: iso(c.opened), eta: iso(c.eta) })) },
  { name: 'audit_log', label: 'Audit log', group: 'Operations', cols: [['id', 'text', 'Sys ID'], ['at', 'timestamptz', 'When'], ['who', 'text', 'Who'], ['what', 'text', 'What'], ['ref', 'text', 'Record']],
    rows: s => s.audit.map((a, k) => ({ id: `AUD-${a.t}-${k}`, at: iso(a.t), who: a.who, what: a.what, ref: a.ref || null })) },
];
export const TABLE = Object.fromEntries(TABLES.map(t => [t.name, t]));

// relationships: a branch contains its edge; the edge uses both circuits and feeds the core switch; the core
// switch feeds the other switches; access points draw power from a switch port
export const RELS = [];
D.BRANCHES.forEach(b => {
  const ds = D.devicesOf(b.id), ecs = ds.filter(d => d.type === 'SD-WAN'), sws = ds.filter(d => d.type === 'Switch'), aps = ds.filter(d => d.type === 'AP');
  const add = (p, t, c) => RELS.push({ id: `${p}>${c}`, parent: p, type: t, child: c });
  ecs.forEach(e => { add(b.id, 'Contains', e.id); b.wan.forEach(w => add(e.id, 'Uses', w)); });
  if (ecs[0] && sws[0]) add(ecs[0].id, 'Feeds', sws[0].id);
  sws.slice(1).forEach(sw => add(sws[0].id, 'Feeds', sw.id));
  aps.forEach((a, k) => sws.length && add(sws[k % sws.length].id, 'Powers (PoE)', a.id));
});
export const relsOf = id => ({ up: RELS.filter(r => r.child === id), down: RELS.filter(r => r.parent === id) });

// the SQL for every table, ready for the Supabase SQL editor (demo policy: anyone with the anon key can read and write)
export function schemaSQL() {
  return TABLES.map(t => `create table if not exists ${t.name} (\n${t.cols.map(([c, ty], i) => `  ${c} ${ty}${i === 0 ? ' primary key' : ''}`).join(',\n')}\n);\nalter table ${t.name} enable row level security;\ncreate policy "${t.name} demo" on ${t.name} for all using (true) with check (true);`).join('\n\n') + `\n\n-- the whole console as one saved document (restored after a refresh)\ncreate table if not exists console_state (\n  id text primary key,\n  saved_at timestamptz,\n  data jsonb\n);\nalter table console_state enable row level security;\ncreate policy "console_state demo" on console_state for all using (true) with check (true);`;
}
