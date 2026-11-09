// Integration studio: every source OpsRamp monitors for SRS and every one ready in the OpsRamp library (Cisco and
// others), and the acquired branches waiting to be onboarded. Drag one onto OpsRamp (or press Connect) and watch it
// come online: gateway, credentials, discovery, templates, events, ServiceNow.
import React, { useState, useEffect, useRef } from 'react';
import * as I from 'lucide-react';
import * as D from './data.js';
import { useApp } from './store.jsx';
import { Card, Badge, Btn, Logo, cx } from './ui.jsx';
import { num } from './util.js';
import { stepsOf, tplId, templateOf, isDesk, resourcesFor } from './srctpl.js';
import { VENDORS } from './policies.js';

const cnt = f => D.DEVICES.filter(f).length;
// [id, name, category, connected?, devices or lines, logo key, the template it uses]
// [id, name, category, connected for SRS?, devices or lines, logo, template, how it connects]
export const SRC = [
  ['ec', 'HPE Aruba EdgeConnect SD-WAN', 'HPE', true, cnt(d => d.type === 'SD-WAN'), 'aruba', 'TPL-EC', 'Custom: Orchestrator REST + webhook'],
  ['central', 'HPE Aruba Central', 'HPE', true, cnt(d => d.type === 'AP'), 'central', 'TPL-AP', 'Native'],
  ['cx', 'HPE Aruba CX and 2530 switches', 'HPE', true, cnt(d => d.type === 'Switch'), null, 'TPL-CX', 'SNMPv3 + REST'],
  ['airwave', 'HPE Aruba AirWave', 'HPE', false, 0, null, null, 'Native'],
  ['cnx', 'HPE Aruba CNX (GreenLake)', 'HPE', false, 0, null, null, 'Native, GreenLake'],
  ['proliant', 'HPE ProLiant and Synergy servers', 'HPE', false, 24, null, null, 'Native: iLO Redfish'],
  ['alletra', 'HPE Alletra and Primera storage', 'HPE', false, 6, null, null, 'Native'],
  ['simplivity', 'HPE SimpliVity and StoreOnce', 'HPE', false, 4, null, null, 'Native'],
  ['azure', 'Azure Monitor', 'Cloud', true, 6, 'azure', null, 'Native'],
  ['aws', 'AWS CloudWatch', 'Cloud', false, 9, null, null, 'Native'],
  ['gcp', 'Google Cloud', 'Cloud', false, 0, null, null, 'Native'],
  ['oci', 'Oracle Cloud (OCI)', 'Cloud', false, 0, null, null, 'Native'],
  ['vmware', 'VMware vCenter', 'Cloud', false, 14, null, null, 'Native'],
  ['newrelic', 'New Relic', 'Monitoring tools', true, D.APPS.length, 'newrelic', 'TPL-APP', 'Native'],
  ['appd', 'AppDynamics', 'Monitoring tools', false, 0, null, null, 'Native'],
  ['datadog', 'Datadog', 'Monitoring tools', false, 0, null, null, 'Native'],
  ['dyna', 'Dynatrace', 'Monitoring tools', false, 0, null, null, 'Native'],
  ['prom', 'Prometheus', 'Monitoring tools', false, 0, null, null, 'Native'],
  ['splunk', 'Splunk', 'Monitoring tools', false, 0, null, null, 'Native'],
  ['solarwinds', 'SolarWinds', 'Monitoring tools', false, 0, null, null, 'Native'],
  ['zabbix', 'Zabbix', 'Monitoring tools', false, 0, null, null, 'Native'],
  ['circuits', 'ISP circuits (Simplify)', 'Lines and carriers', true, D.CIRCUITS.length, null, 'TPL-CIR', 'Custom: webhook'],
  ['carriers', 'Carrier portals', 'Lines and carriers', true, 9, null, null, 'Custom: REST or email'],
  ['snow', 'ServiceNow (incidents and CMDB)', 'Service management', true, 0, 'servicenow', null, 'Native, both ways'],
  ['teams', 'Microsoft Teams and email', 'Service management', true, 0, null, null, 'Webhook and email'],
  ['jira', 'Jira Service Management', 'Service management', false, 0, null, null, 'Native'],
  ['bmc', 'BMC Helix', 'Service management', false, 0, null, null, 'Native'],
  ['fresh', 'Freshservice', 'Service management', false, 0, null, null, 'Native'],
  ['slack', 'Slack', 'Service management', false, 0, null, null, 'Process automation'],
  ['cat9k', 'Cisco Catalyst', 'Other network vendors', false, 46, null, null, 'Native'],
  ['meraki', 'Cisco Meraki', 'Other network vendors', false, 61, null, null, 'Native: Dashboard API'],
  ['juniper', 'Juniper', 'Other network vendors', false, 12, null, null, 'Native'],
  ['forti', 'Fortinet', 'Other network vendors', false, 18, null, null, 'Native'],
  ['arista', 'Arista', 'Other network vendors', false, 0, null, null, 'Native'],
  ['extreme', 'Extreme Networks', 'Other network vendors', false, 0, null, null, 'Native'],
  ['infoblox', 'Infoblox', 'Other network vendors', false, 0, null, null, 'Native'],
  ['palo', 'Palo Alto Networks', 'Other network vendors', false, 4, null, null, 'SNMP'],
  ['snmp', 'Any SNMP device', 'Other network vendors', false, 0, null, null, 'SNMP v1/v2c/v3'],
];
const CATS = ['HPE', 'Cloud', 'Monitoring tools', 'Lines and carriers', 'Service management', 'Other network vendors', 'Acquired branches'];
const STEP_IC = { 'Cloud account': I.Cloud, 'Regions and services': I.Globe, 'Resource discovery': I.Radar, Template: I.LayoutTemplate, 'Alarms to events': I.Webhook, 'ServiceNow CMDB': I.Database, 'API key': I.KeyRound, 'Apps and services': I.Boxes, 'Alert webhook': I.Webhook, 'Alert mapping': I.LayoutTemplate, 'Correlation with the network': I.GitMerge, ServiceNow: I.Ticket, Connect: I.KeyRound, 'Field mapping': I.ListTree, Sync: I.RefreshCw, 'Assignment groups': I.Users, 'Test ticket': I.Ticket, 'Portal or API': I.Plug, 'Circuit IDs matched': I.Cable, 'Ticket sync': I.RefreshCw, Gateway: I.Server, Credentials: I.KeyRound, Discovery: I.Radar, Events: I.Webhook };
// the template a connected source adds to Policies & Templates (vendor kit uses the OpsRamp library template)
export function sourceTemplate(id, n) {
  const v = VENDORS.find(x => x.id === (id === 'meraki' ? 'meraki-mr' : id === 'forti' ? 'fortigate' : id));
  if (v) return { id: tplId(id), src: id, name: v.name, cls: v.cls, models: [v.name.split(' ').slice(-2).join(' ')], n, vendor: v.id, like: v.like, how: [[v.access.split(' + ')[0], 'every 5 min'], ...(v.access.includes(' + ') ? [[v.access.split(' + ')[1], 'every 15 min']] : [])], metrics: v.map.map(m => m[0]), parent: 'EdgeConnect at the same store', snow: ['Network › LAN', 'Movate NOC – L2 Network', 'Network gear (cmdb_ci_netgear)'], ver: 'v1.0' };
  return templateOf(id, n);
}
export function connectedTemplates(s) {
  const on = new Set([...SRC.filter(x => x[3]).map(x => x[0]), ...(s.studioConnected || [])]);
  return SRC.filter(x => on.has(x[0]) && !x[6]).map(x => sourceTemplate(x[0], x[4])).filter(Boolean);
}
const STEPS_ACQ = [['Gateway at the site', I.Server], ['Discover legacy kit', I.Radar], ['Generic and vendor templates', I.LayoutTemplate], ['Topology', I.Network], ['ServiceNow CMDB', I.Database], ['Monitored, day one', I.CircleCheck]];

// the legacy kit and lines found at an acquired site, as inventory records
function acqResources(p) {
  if (!p) return [];
  const out = [], now = Date.now();
  (p.legacy || []).forEach((l, k) => { const name = String(l[0]).replace(/\s*×\d+.*$/, ''), n = +((String(l[0]).match(/×(\d+)/) || [])[1]) || 1; for (let i = 0; i < n; i++) out.push({ id: `${p.id}-${k}-${i + 1}`, name: `${p.id.toLowerCase()}-${name.replace(/[^A-Za-z0-9]+/g, '').toLowerCase().slice(0, 10)}-${String(i + 1).padStart(2, '0')}`, kind: 'Legacy device', vendor: name.split(' ')[0], model: name, ip: `10.${70 + k}.1.${10 + i}`, site: `${p.brand} – ${p.site}`, source: 'Acquired site discovery', template: 'Generic SNMP', via: 'Integration studio', t: now }); });
  (p.carriers || []).forEach((c, k) => out.push({ id: `${p.id}-line-${k + 1}`, name: `${p.id.toLowerCase()}-wan${k + 1}`, kind: 'Circuit', vendor: String(c).split(' ')[0], model: String(c).replace(/\s*\(.*\)$/, ''), ip: null, site: `${p.brand} – ${p.site}`, source: 'Acquired site discovery', template: 'TPL-CIR', via: 'Integration studio', t: now }));
  return out;
}
export function IntegrationStudio() {
  const { s, act } = useApp();
  const conn = new Set([...SRC.filter(x => x[3]).map(x => x[0]), ...(s.studioConnected || [])]);
  const acq = s.projects.filter(p => p.track === 'Acquired');
  const acqDone = new Set([...acq.filter(p => p.steps && p.steps.onboard === 'done').map(p => p.id), ...(s.studioOnboarded || [])]);
  const [over, setOver] = useState(false);
  const [run, setRun] = useState(null); // { id, kind, name, step, steps, found }
  const tm = useRef(null);
  useEffect(() => () => clearInterval(tm.current), []);
  const start = id => {
    if (run && run.step < run.steps.length) return;
    const src = SRC.find(x => x[0] === id), p = acq.find(x => x.id === id);
    if (src && conn.has(id)) { act.toast(`${src[1]} is already connected`); return; }
    if (p && acqDone.has(id)) { act.toast(`${p.brand} is already monitored`); return; }
    const kind = src ? 'src' : 'acq';
    const found = src ? src[4] : (p.legacy || []).reduce((a, l) => a + (+((l[0].match(/×(\d+)/) || [])[1]) || 1), 0) + (p.carriers || []).length;
    setRun({ id, kind, name: src ? src[1] : `${p.brand} – ${p.site}`, step: 0, steps: kind === 'src' ? stepsOf(id, src[2], found).map(([t, d]) => [t, STEP_IC[t] || I.Circle, d]) : STEPS_ACQ, found, tpl: src && (src[6] || (sourceTemplate(id, found) || {}).id || (src[2] === 'Lines and carriers' ? 'TPL-CIR' : undefined)), desk: src && isDesk(id) });
    clearInterval(tm.current);
    tm.current = setInterval(() => setRun(r => {
      if (!r) return r;
      const n = r.step + 1;
      if (n >= r.steps.length) {
        clearInterval(tm.current);
        if (r.kind === 'src') act.set(st => ({ studioConnected: [...new Set([...(st.studioConnected || []), r.id])] }));
        else act.set(st => ({ studioOnboarded: [...new Set([...(st.studioOnboarded || []), r.id])] }));
        // what the connection found goes into the inventory (and the database)
        const recs = r.kind === 'src' ? resourcesFor(r.id, r.name, (SRC.find(x => x[0] === r.id) || [])[2], r.found) : acqResources(acq.find(x => x.id === r.id));
        act.addInventory(recs); r = { ...r, added: recs };
        act.audit(`${r.kind === 'src' ? 'Connected to OpsRamp' : 'Onboarded to OpsRamp monitoring'}: ${r.name}`, r.id);
        act.toast(`${r.name}: ${r.kind === 'src' ? 'connected' : 'monitored from day one'}`);
      }
      return { ...r, step: n };
    }), 650);
  };
  const Tile = ({ id, name, sub, on, logo, acqP }) => (
    <div draggable={!on} onDragStart={e => { e.dataTransfer.setData('text/plain', id); e.dataTransfer.effectAllowed = 'copy'; }}
      className={cx('rounded-lg border px-2.5 py-2 flex items-center gap-2 text-[12.5px] select-none', on ? 'border-ok/40 bg-ok/5' : 'border-dashed border-ink3/60 bg-panel cursor-grab hover:border-brand')}>
      {logo ? <Logo k={logo} h={12} className="!px-0.5 !py-0 shrink-0" /> : acqP ? <I.Store size={15} className="text-warn shrink-0" /> : <I.Plug size={15} className={on ? 'text-ok shrink-0' : 'text-ink3 shrink-0'} />}
      <span className="flex-1 min-w-0"><b className="block text-ink truncate">{name}</b><span className="block text-[11px] text-ink3 truncate">{sub}</span></span>
      {on ? <I.CircleCheck size={15} className="text-ok shrink-0" /> : <button onClick={() => start(id)} className="text-[11px] font-bold text-brand hover:underline shrink-0">Connect</button>}
    </div>
  );
  const total = SRC.filter(x => conn.has(x[0])).reduce((a, x) => a + x[4], 0) + (s.onboarded || []).length;
  const busy = run && run.step < run.steps.length;
  return (
    <Card title="Integration studio" right={<span className="text-[12px] text-ink3"><b className="text-ink">{SRC.filter(x => conn.has(x[0])).length}</b> connected · <b className="text-ink">{SRC.filter(x => !conn.has(x[0])).length}</b> more from the OpsRamp catalogue (3,000+) · <b className="text-ink">{num(total)}</b> devices and lines monitored</span>}>
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-4 items-start">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{CATS.map(c => (
          <div key={c}>
            <div className="text-[10.5px] font-bold uppercase text-ink3 mb-1.5">{c === 'HPE' ? 'HPE (OpsRamp is an HPE product)' : c}</div>
            <div className="space-y-1.5">
              {c !== 'Acquired branches' ? SRC.filter(x => x[2] === c).map(x => <Tile key={x[0]} id={x[0]} name={x[1]} logo={x[5]} on={conn.has(x[0])} sub={`${x[7]} · ${conn.has(x[0]) ? (x[4] ? `${num(x[4])} monitored` : 'connected') : x[4] ? `${x[4]} found${x[2] === 'Other network vendors' ? ' at acquired sites' : ''}` : 'ready'}`} />)
                : acq.map(p => <Tile key={p.id} id={p.id} acqP name={p.brand} on={acqDone.has(p.id)} sub={acqDone.has(p.id) ? `${p.site} · monitored` : `${p.site} · ${p.stage}`} />)}
            </div>
          </div>))}</div>
        <div>
          <div onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={e => { e.preventDefault(); setOver(false); start(e.dataTransfer.getData('text/plain')); }}
            className={cx('rounded-xl border-2 border-dashed p-4 text-center transition-colors', over ? 'border-brand bg-brand/10' : 'border-brand/40 bg-brand/[0.04]')}>
            <div className="mx-auto w-16 h-16 rounded-full bg-[#263040] grid place-items-center ring-4 ring-brand/30"><Logo k="opsramp" h={14} className="!border-0" /></div>
            <div className="text-[14px] font-bold text-ink mt-2">{busy ? `Connecting ${run.name}` : 'Drop a source or a branch here'}</div>
            <div className="text-[11.5px] text-ink3">{busy ? `${run.step} of ${run.steps.length}` : 'or press Connect'}</div>
            <button onClick={() => act.set({ storageOpen: true })} className="mt-2 inline-flex items-center gap-1 text-[11.5px] text-ink2 hover:underline"><I.Database size={12} />Saved to {s.db.mode === 'cloud' ? 'the cloud database' : 'this browser'} · {num((s.invAdded || []).length)} in inventory</button>
          </div>
          {run && <div className="mt-3 rounded-lg border border-line p-3">
            <div className="flex items-center gap-2 mb-2"><b className="text-[13px] text-ink flex-1 truncate">{run.name}</b>{run.step >= run.steps.length ? <Badge tone="green">{run.kind === 'src' ? 'Connected' : 'Monitored'}</Badge> : <Badge tone="blue">Running</Badge>}</div>
            <div className="h-1.5 bg-chip rounded mb-2"><div className="h-1.5 bg-brand rounded transition-all" style={{ width: `${Math.min(100, run.step / run.steps.length * 100)}%` }} /></div>
            <ol className="space-y-1">{run.steps.map(([t, Ic], i) => { const st = i < run.step ? 'done' : i === run.step ? 'now' : 'todo'; return (
              <li key={t} className={cx('flex items-center gap-2 text-[12.5px]', st === 'todo' && 'text-ink3')}>
                {st === 'done' ? <I.CircleCheck size={15} className="text-ok" /> : st === 'now' ? <I.Loader2 size={15} className="text-brand animate-spin" /> : <Ic size={15} />}
                <span className="flex-1">{t}</span>
                {st === 'done' && run.kind === 'src' && run.steps[i][2] && <span className="text-[11.5px] text-ink2 text-right truncate max-w-[60%]" title={run.steps[i][2]}>{run.steps[i][2]}</span>}
                {st === 'done' && run.kind === 'acq' && i === 1 && <span className="text-[11.5px] text-ink2 tabular-nums">{run.found} found</span>}
              </li>); })}</ol>
            {run.step >= run.steps.length && run.added && (run.added.length ? <div className="mt-3 border-t border-line pt-2">
              <div className="flex items-center gap-2 text-[12.5px] mb-1"><I.Database size={13} className="text-ink2" /><b className="text-ink">{run.added.length} added to the inventory</b><span className="text-ink3">and stored in {s.db.mode === 'cloud' ? 'the cloud database' : 'this browser'}</span></div>
              <ul className="text-[12px] space-y-0.5">{run.added.slice(0, 5).map(x => <li key={x.id} className="flex gap-2"><span className="font-mono text-ink truncate">{x.name}</span><span className="text-ink3 truncate">{x.model} · {x.site}</span></li>)}{run.added.length > 5 && <li className="text-ink3">and {run.added.length - 5} more</li>}</ul>
              <Btn size="sm" className="mt-2" icon={I.Boxes} onClick={() => { act.setTab('inventory', 'onboarded'); act.go('inventory'); }}>Open in inventory</Btn>
            </div> : <div className="mt-3 text-[12px] text-ink3">No new resources: this connection carries tickets or notices, not devices.</div>)}
            {run.step >= run.steps.length && <div className="flex gap-2 mt-3">{run.kind === 'acq' ? <Btn size="sm" icon={I.PackageCheck} onClick={() => act.go('biab')}>Open Branch-in-a-Box</Btn> : (run.desk ? <Btn size="sm" icon={I.Ticket} onClick={() => { act.setTab('correlation', 'live'); act.go('correlation'); }}>See tickets flow</Btn> : <Btn size="sm" icon={I.FileCog} onClick={() => { act.setTab('polTpl', run.tpl); act.setTab('policies', 'templates'); act.go('policies'); }}>See its template{run.tpl ? ` (${run.tpl})` : ''}</Btn>)}</div>}
          </div>}
        </div>
      </div>
    </Card>
  );
}
