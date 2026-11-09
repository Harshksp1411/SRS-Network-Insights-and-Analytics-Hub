// CMDB Lite: the asset inventory run as a light CMDB inside the monitoring tool (OpsRamp, or the proposed tool).
// Discovery finds the configuration items (gateways scan with SNMP, vendor APIs and cloud APIs pull the rest), every
// item is identified and reconciled against what is already known, given a class, relationships and a monitoring
// template, and the result is synchronised one way to the ServiceNow CMDB through its identification and
// reconciliation engine (IRE). Mappings show exactly how each class, attribute and relationship lands in ServiceNow.
import React, { useMemo, useState, useEffect, useRef } from 'react';
import * as I from 'lucide-react';
import * as D from './data.js';
import { useApp } from './store.jsx';
import { Card, Badge, Btn, Tabs, cx } from './ui.jsx';
import { RELS } from './cmdb.js';
import { num, ago, HR, DAY, MIN } from './util.js';

const T0 = Date.now();
const byType = t => D.DEVICES.filter(d => d.type === t).length;

// ── the CI classes CMDB Lite holds, and where each one lands in ServiceNow (proposed) ──
export function classes(s) {
  return [
    { cls: 'Branch (site)', or: 'Site', snow: 'cmn_location', n: D.BRANCHES.length, src: 'SRS store master + Orchestrator', idr: 'Branch number', icon: I.Store, q: 1 },
    { cls: 'SD-WAN edge', or: 'EdgeConnect appliance', snow: 'cmdb_ci_ip_router', n: byType('SD-WAN'), src: 'Orchestrator REST API', idr: 'Serial number, then MAC', icon: I.Router, q: 0.998 },
    { cls: 'Switch', or: 'Network switch', snow: 'cmdb_ci_ip_switch', n: byType('Switch'), src: 'Aruba Central API + SNMPv3', idr: 'Serial number, then MAC', icon: I.Network, q: 0.991 },
    { cls: 'Access point', or: 'Wireless access point', snow: 'cmdb_ci_wap_network', n: byType('AP'), src: 'Aruba Central API', idr: 'Serial number, then MAC', icon: I.Wifi, q: 0.987 },
    { cls: 'WAN circuit', or: 'Circuit', snow: 'cmdb_ci_circuit', n: D.CIRCUITS.length, src: 'Orchestrator paths + carrier portals', idr: 'Carrier circuit ID', icon: I.Cable, q: 0.982 },
    { cls: 'Business application', or: 'Application service', snow: 'cmdb_ci_business_app', n: D.APPS.length, src: 'New Relic + synthetic tests', idr: 'Name', icon: I.AppWindow, q: 1 },
    { cls: 'Cloud resource', or: 'Azure resource', snow: 'cmdb_ci_vm_instance', n: 6, src: 'Azure Monitor API', idr: 'Azure resource ID', icon: I.Cloud, q: 1 },
    { cls: 'Added by onboarding', or: 'Discovered resource', snow: 'by its own class', n: (s.invAdded || []).length, src: 'Integration studio, scans, CSV', idr: 'Serial, MAC or name + IP', icon: I.PackagePlus, q: 0.95 },
  ];
}

// ── discovery: profiles, gateways, credentials (names only) ──
const PROFILES = [
  { id: 'DP-01', name: 'EdgeConnect fleet', method: 'Orchestrator REST API', gw: 'gw-dal-dc1', scope: 'Orchestrator: all appliances', cred: 'orchestrator-api-ro', sched: 'Every 4 h + change webhook', found: () => byType('SD-WAN'), cls: 'SD-WAN edge, WAN circuit' },
  { id: 'DP-02', name: 'Aruba CX and 2530 switches', method: 'SNMPv3 + AOS-CX REST', gw: 'Regional gateways (9)', scope: 'Seed: core switch per branch, LLDP crawl depth 3', cred: 'srs-snmpv3-authpriv, cx-rest-ro', sched: 'Daily 01:00 CT', found: () => byType('Switch'), cls: 'Switch' },
  { id: 'DP-03', name: 'Aruba access points', method: 'Aruba Central API (OAuth)', gw: 'Cloud collector', scope: 'Central: SRS customer', cred: 'central-oauth-ro', sched: 'Hourly', found: () => byType('AP'), cls: 'Access point' },
  { id: 'DP-04', name: 'ISP circuits', method: 'Orchestrator paths + Simplify webhook', gw: 'Cloud collector', scope: 'Primary and backup line per branch', cred: 'simplify-webhook', sched: 'Live (webhook)', found: () => D.CIRCUITS.length, cls: 'WAN circuit' },
  { id: 'DP-05', name: 'Branch LAN sweep (unmanaged)', method: 'Ping sweep + SNMP probe', gw: 'Regional gateways (9)', scope: 'IP range: 10.x.y.0/24 store LANs', cred: 'srs-snmpv3-authpriv', sched: 'Weekly, Sun 03:00 CT', found: () => 37, cls: 'Unmanaged switch, printer, camera' },
  { id: 'DP-06', name: 'Store applications', method: 'New Relic API + synthetics', gw: 'Cloud collector', scope: 'ERP, POS, pricing, Azure apps, voice, M365', cred: 'newrelic-api-ro', sched: 'Every 15 min', found: () => D.APPS.length, cls: 'Business application' },
  { id: 'DP-07', name: 'Azure tenant', method: 'Azure Monitor API', gw: 'Cloud collector', scope: 'SRS subscription', cred: 'azure-sp-reader', sched: 'Hourly', found: () => 6, cls: 'Cloud resource' },
];
const GATEWAYS = [
  ['gw-dal-dc1', 'NextGen gateway', 'Dallas DC1', 'Up', 2210], ['gw-atl-dc2', 'NextGen gateway', 'Atlanta DC2', 'Up', 1865],
  ['Regional gateways (9)', 'NextGen gateway, one per region', 'Region hubs', '9 of 9 up', 1856], ['Cloud collector', 'OpsRamp cloud', 'OpsRamp SaaS', 'Up', 3092],
];
const CREDS = [
  ['srs-snmpv3-authpriv', 'SNMPv3 authPriv (SHA-256 / AES-256)', 'DP-02, DP-05', 34], ['cx-rest-ro', 'AOS-CX REST, read only', 'DP-02', 34],
  ['orchestrator-api-ro', 'API token, read only', 'DP-01', 61], ['central-oauth-ro', 'OAuth client, read only', 'DP-03', 12],
  ['simplify-webhook', 'Signed webhook secret', 'DP-04', 88], ['newrelic-api-ro', 'User API key, read only', 'DP-06', 40], ['azure-sp-reader', 'Service principal, Reader role', 'DP-07', 19],
];
const STAGES = [
  ['Reach', 'Ping sweep and port check from the gateway', I.Radar],
  ['Probe', 'SNMP sysObjectID, vendor API or cloud API', I.ScanSearch],
  ['Classify', 'Resource type and CI class from make and model', I.Tags],
  ['Identify', 'Match to an existing CI by serial, MAC, then name + IP', I.Fingerprint],
  ['Reconcile', 'Each attribute from the source that owns it', I.GitMerge],
  ['Relate', 'LLDP neighbours, uplinks, PoE ports, circuits', I.Share2],
  ['Monitor', 'Monitoring template and alert routing applied', I.Activity],
  ['Sync', 'Pushed to ServiceNow through the IRE', I.RefreshCw],
];

// the review queue: what discovery found that a person should look at before the CMDB changes
function seedQueue() {
  const dev = (t, k) => D.DEVICES.filter(d => d.type === t)[k];
  const b214 = D.BR[`BR-${String(D.HERO.config).padStart(4, '0')}`] || D.BRANCHES[213];
  const sw = dev('Switch', 3), ap = dev('AP', 40), ap2 = dev('AP', 77), sw2 = dev('Switch', 120);
  return [
    { id: 'DQ-1', kind: 'New', title: `Unmanaged switch HPE 1820-24G at ${b214.name}`, detail: `Seen by LLDP on ${b214.code}-sw01 port 1/1/12; answers SNMP; not in the CMDB`, prof: 'DP-02', rec: { id: `${b214.code}-unm01`, name: `${b214.code}-unm01`, kind: 'Switch (unmanaged)', vendor: 'HPE', model: '1820-24G', ip: '10.214.0.41', site: `${b214.brand} – ${b214.name}`, source: 'Discovery DP-02', template: 'Generic SNMP', via: 'Discovery' } },
    { id: 'DQ-2', kind: 'New', title: `Network printer at ${D.BRANCHES[87].name}`, detail: 'Found by the weekly LAN sweep (DP-05); HP LaserJet, SNMP v2c only', prof: 'DP-05', rec: { id: `${D.BRANCHES[87].code}-prn01`, name: `${D.BRANCHES[87].code}-prn01`, kind: 'Printer', vendor: 'HP', model: 'LaserJet M507', ip: '10.88.0.60', site: `${D.BRANCHES[87].brand} – ${D.BRANCHES[87].name}`, source: 'Discovery DP-05', template: 'Generic SNMP', via: 'Discovery' } },
    { id: 'DQ-3', kind: 'Changed', title: `${ap.id}: serial number changed`, detail: 'RMA swap on site; the new unit keeps the same name, location and relationships, the old serial is kept in history', prof: 'DP-03' },
    { id: 'DQ-4', kind: 'Changed', title: `${sw.id}: firmware ${sw.fw} → 10.16.1030`, detail: 'Upgraded in the last wave (CHG0033120); Aruba Central owns firmware', prof: 'DP-02' },
    { id: 'DQ-5', kind: 'Missing', title: `${ap2.id} not seen for 9 days`, detail: 'Central shows it offline since the store remodel; retire, or keep if it is coming back', prof: 'DP-03' },
    { id: 'DQ-6', kind: 'Duplicate', title: `${sw2.id} and ${sw2.id}.srs.local`, detail: 'Same serial from SNMP and from a CSV import; merge keeps the SNMP record and its history', prof: 'DP-02' },
  ].map(x => ({ ...x, status: 'Review', t: T0 - (x.id.charCodeAt(3) % 5) * HR }));
}
export function useCmdbQueue() {
  const { s, act } = useApp();
  const q = s.cmdbQueue || seedQueue();
  const decide = (x, status, note) => {
    act.set({ cmdbQueue: q.map(y => y.id === x.id ? { ...y, status, by: act.me(), at: Date.now() } : y) });
    if (status === 'Added to CMDB' && x.rec) act.addInventory([{ ...x.rec, t: Date.now() }]);
    act.audit(`CMDB Lite ${x.id} ${x.title}: ${status}${note ? ` (${note})` : ''}`, x.id); act.toast(`${x.id}: ${status}`);
  };
  return { q, decide };
}

// ── health of the CMDB: the four checks ServiceNow uses (complete, correct, compliant, current) ──
function health(s, q) {
  const total = D.DEVICES.length + D.CIRCUITS.length + D.BRANCHES.length + (s.invAdded || []).length;
  const linked = new Set(); RELS.forEach(r => { linked.add(r.parent); linked.add(r.child); });
  const orphans = D.DEVICES.filter(d => !linked.has(d.id)).length + (s.invAdded || []).length;
  const open = q.filter(x => x.status === 'Review');
  const missingAttr = D.DEVICES.filter((d, i) => i % 97 === 5).length;
  return [
    { k: 'Complete', v: 1 - missingAttr / total, sub: `${num(missingAttr)} CIs missing a required attribute (owner group or rack)` },
    { k: 'Correct', v: 1 - (open.filter(x => x.kind === 'Duplicate').length + orphans) / total, sub: `${open.filter(x => x.kind === 'Duplicate').length} duplicate to merge, ${num(orphans)} without a relationship` },
    { k: 'Compliant', v: 0.986, sub: 'Every CI on a monitoring template; 57 below firmware policy' },
    { k: 'Current', v: 1 - (open.filter(x => x.kind === 'Missing').length + 11) / total, sub: `${open.filter(x => x.kind === 'Missing').length + 11} not seen by discovery in 7 days` },
  ];
}
const tone = v => v >= 0.99 ? 'text-ok' : v >= 0.97 ? 'text-warn' : 'text-bad';

// ─────────────────────────────── Overview ───────────────────────────────
export function CmdbOverview({ go }) {
  const { s } = useApp(); const { q } = useCmdbQueue();
  const C = classes(s), H = health(s, q), total = C.reduce((a, c) => a + c.n, 0), open = q.filter(x => x.status === 'Review');
  const flow = [
    ['Sources', '7 discovery profiles', 'SNMPv3, Orchestrator, Aruba Central, carrier feeds, New Relic, Azure', I.Plug, 'journey'],
    ['Discovery', '4 gateways and collectors', 'Reach, probe, classify, identify, reconcile, relate', I.ScanSearch, 'discovery'],
    ['CMDB Lite', `${num(total)} CIs, ${num(RELS.length)} relationships`, `${C.length} classes, each with a monitoring template`, I.Database, 'rels'],
    ['ServiceNow CMDB', 'One way, through the IRE', 'Incidents and changes point at the same CIs', I.RefreshCw, 'sync'],
  ];
  return (
    <div className="space-y-3">
      <Card title="How assets reach the CMDB" sub="Click a step to open it">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">{flow.map(([t, n, sub, Ic, tab], i) => (
          <div key={t} className="relative"><button onClick={() => go(tab)} className="w-full h-full text-left rounded-lg border border-line bg-panel hover:bg-chip/50 p-3">
            <div className="flex items-center gap-2"><span className="w-7 h-7 rounded-md bg-chip grid place-items-center text-ink2"><Ic size={15} /></span><b className="text-[13px] text-ink">{t}</b></div>
            <div className="text-[13px] font-semibold text-ink mt-2">{n}</div><div className="text-[11.5px] text-ink3 mt-0.5">{sub}</div>
          </button>{i < 3 && <I.ChevronRight size={18} className="hidden md:block absolute -right-[13px] top-1/2 -translate-y-1/2 text-ink3 z-10 bg-canvas rounded-full" />}</div>))}</div>
      </Card>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{H.map(h => <Card key={h.k} title={h.k} sub={h.sub}><div className={cx('text-[28px] font-bold tabular-nums', tone(h.v))}>{(h.v * 100).toFixed(1)}%</div></Card>)}</div>
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-3">
        <Card title="Configuration items by class" sub="Click a class for its mapping" pad={false}>
          <div className="overflow-x-auto"><table className="w-full text-[12.5px]"><thead><tr className="text-left text-ink3 text-[11.5px] border-b border-line">{['Class', 'CIs', 'Discovered by', 'Identified by', 'ServiceNow class', 'Quality'].map(h => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
            <tbody>{C.map(c => <tr key={c.cls} onClick={() => go('mappings')} className="border-b border-line/60 last:border-0 cursor-pointer hover:bg-chip/40">
              <td className="px-3 py-2"><span className="inline-flex items-center gap-2 font-semibold text-ink"><c.icon size={14} className="text-ink3" />{c.cls}</span></td><td className="px-3 py-2 tabular-nums font-semibold">{num(c.n)}</td>
              <td className="px-3 py-2 text-ink2">{c.src}</td><td className="px-3 py-2 text-ink2">{c.idr}</td><td className="px-3 py-2"><code className="text-[11.5px]">{c.snow}</code></td><td className={cx('px-3 py-2 tabular-nums font-semibold', c.n ? tone(c.q) : 'text-ink3')}>{c.n ? `${(c.q * 100).toFixed(1)}%` : '—'}</td></tr>)}
              <tr className="border-t-2 border-line font-bold"><td className="px-3 py-2">Total</td><td className="px-3 py-2 tabular-nums">{num(total)}</td><td colSpan={4} className="px-3 py-2 text-ink3 font-normal">{num(RELS.length)} relationships between them</td></tr></tbody></table></div>
        </Card>
        <Card title="Waiting for review" sub={`${open.length} findings from discovery; nothing changes the CMDB until a person decides`} right={<Btn size="sm" icon={I.ListChecks} onClick={() => go('discovery')}>Review</Btn>}>
          <div className="divide-y divide-line/60">{open.slice(0, 6).map(x => <div key={x.id} className="py-1.5 flex items-start gap-2 text-[12.5px]"><Badge tone={KTONE[x.kind]}>{x.kind}</Badge><span className="flex-1 min-w-0 text-ink">{x.title}</span></div>)}
            {!open.length && <div className="py-3 text-[12.5px] text-ink3">Nothing waiting. Every finding has a decision.</div>}</div>
        </Card>
      </div>
    </div>
  );
}
const KTONE = { New: 'blue', Changed: 'amber', Missing: 'red', Duplicate: 'gray' };

// ─────────────────────────────── Discovery ───────────────────────────────
export function CmdbDiscovery() {
  const { s, act } = useApp(); const { q, decide } = useCmdbQueue();
  const [sel, setSel] = useState('DP-02'); const [run, setRun] = useState(null); const tm = useRef(null);
  useEffect(() => () => clearInterval(tm.current), []);
  const runs = s.discRuns || {};
  const p = PROFILES.find(x => x.id === sel);
  const start = () => { clearInterval(tm.current); setRun({ id: p.id, k: 0 }); tm.current = setInterval(() => setRun(r => { if (!r) return r; if (r.k >= STAGES.length - 1) { clearInterval(tm.current); const n = p.found(); act.set(st => ({ discRuns: { ...(st.discRuns || {}), [p.id]: { t: Date.now(), found: n, nw: p.id === 'DP-05' ? 2 : 0, ch: p.id === 'DP-02' ? 3 : 1 } } })); act.audit(`Discovery ${p.id} ${p.name}: ${num(n)} found`, p.id); act.toast(`${p.name}: ${num(n)} found, results in the review queue`); return { ...r, k: STAGES.length, done: true }; } return { ...r, k: r.k + 1 }; }), 450); };
  const live = run && run.id === p.id;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] gap-3">
        <Card title="Discovery profiles" sub="What is scanned, how, from where and how often" pad={false}>
          <div className="divide-y divide-line/60">{PROFILES.map(x => { const r = runs[x.id]; return (
            <button key={x.id} onClick={() => setSel(x.id)} className={cx('w-full text-left px-4 py-2 flex items-center gap-3 text-[12.5px]', sel === x.id ? 'bg-chip/70' : 'hover:bg-chip/40')}>
              <span className="font-mono text-[11px] text-ink3 w-11">{x.id}</span>
              <span className="flex-1 min-w-0"><b className="block text-ink truncate">{x.name}</b><span className="block text-[11.5px] text-ink3 truncate">{x.method} · {x.sched}</span></span>
              <span className="text-right shrink-0"><b className="block tabular-nums text-ink">{num(x.found())}</b><span className="block text-[11px] text-ink3">{r ? `ran ${ago(r.t)}` : 'found'}</span></span>
            </button>); })}</div>
        </Card>
        <Card title={p.name} sub={`${p.id} · finds ${p.cls}`} right={<Btn size="sm" kind="brand" icon={I.Play} onClick={start} disabled={live && !run.done}>Run discovery now</Btn>}>
          <dl className="grid grid-cols-[120px_minmax(0,1fr)] gap-x-3 gap-y-1 text-[12.5px] mb-3">{[['Method', p.method], ['Gateway', p.gw], ['Scope', p.scope], ['Credentials', p.cred], ['Schedule', p.sched]].map(([k, v]) => <React.Fragment key={k}><dt className="text-ink3">{k}</dt><dd className="text-ink">{v}</dd></React.Fragment>)}</dl>
          <ol className="space-y-1">{STAGES.map(([t, sub, Ic], i) => { const st = !live ? 'idle' : run.k > i || run.done ? 'done' : run.k === i ? 'now' : 'idle'; return (
            <li key={t} className="flex items-center gap-2 text-[12.5px]"><span className={cx('w-6 h-6 rounded-full grid place-items-center shrink-0', st === 'done' ? 'bg-ok/15 text-ok' : st === 'now' ? 'bg-info/15 text-info' : 'bg-chip text-ink3')}>{st === 'done' ? <I.Check size={13} /> : st === 'now' ? <I.Loader2 size={13} className="animate-spin" /> : <Ic size={12} />}</span><b className="w-20 text-ink">{t}</b><span className="text-ink2">{sub}</span></li>); })}</ol>
          {runs[p.id] && <div className="mt-3 grid grid-cols-3 gap-2 text-[12px]">{[['Found', num(runs[p.id].found)], ['New', runs[p.id].nw], ['Changed', runs[p.id].ch]].map(([k, v]) => <div key={k} className="rounded border border-line px-2 py-1.5"><div className="text-ink3 text-[11px]">{k}</div><b className="text-ink">{v}</b></div>)}</div>}
        </Card>
      </div>
      <Card title="Review queue" sub="New, changed, missing and duplicate items from discovery. A person decides; the decision is written to the CMDB and the audit log" pad={false}>
        <div className="divide-y divide-line/60">{q.map(x => (
          <div key={x.id} className="px-4 py-2 flex items-center gap-3 text-[12.5px]">
            <span className="w-20 shrink-0"><Badge tone={KTONE[x.kind]}>{x.kind}</Badge></span>
            <span className="flex-1 min-w-0"><b className="block text-ink">{x.title}</b><span className="block text-[11.5px] text-ink3">{x.detail} · {x.prof}</span></span>
            {x.status !== 'Review' ? <span className="text-[11.5px] text-ink3 text-right shrink-0"><Badge tone="green">{x.status}</Badge><span className="block mt-0.5">{x.by} {ago(x.at)}</span></span> : <span className="flex gap-1 shrink-0">
              {x.kind === 'New' && <><Btn op size="xs" kind="brand" icon={I.Plus} onClick={() => decide(x, 'Added to CMDB')}>Add to CMDB</Btn><Btn op size="xs" onClick={() => decide(x, 'Ignored')}>Ignore</Btn></>}
              {x.kind === 'Changed' && <><Btn op size="xs" kind="brand" icon={I.Check} onClick={() => decide(x, 'Accepted')}>Accept change</Btn><Btn op size="xs" onClick={() => decide(x, 'Sent to investigate')}>Investigate</Btn></>}
              {x.kind === 'Missing' && <><Btn op size="xs" kind="brand" icon={I.Archive} onClick={() => decide(x, 'Retired')}>Retire CI</Btn><Btn op size="xs" onClick={() => decide(x, 'Kept')}>Keep</Btn></>}
              {x.kind === 'Duplicate' && <><Btn op size="xs" kind="brand" icon={I.GitMerge} onClick={() => decide(x, 'Merged')}>Merge</Btn><Btn op size="xs" onClick={() => decide(x, 'Not a duplicate')}>Not a duplicate</Btn></>}
            </span>}
          </div>))}</div>
      </Card>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <Card title="Gateways and collectors" pad={false}><table className="w-full text-[12.5px]"><tbody>{GATEWAYS.map(([n, k, loc, st, r]) => <tr key={n} className="border-b border-line/60 last:border-0"><td className="px-4 py-2"><b className="text-ink block">{n}</b><span className="text-[11.5px] text-ink3">{k} · {loc}</span></td><td className="px-4 py-2"><Badge tone="green">{st}</Badge></td><td className="px-4 py-2 text-right tabular-nums">{num(r)} <span className="text-ink3">resources</span></td></tr>)}</tbody></table></Card>
        <Card title="Credential sets" sub="Read only, held encrypted in the tool; values are never shown" pad={false}><table className="w-full text-[12.5px]"><tbody>{CREDS.map(([n, k, u, d]) => <tr key={n} className="border-b border-line/60 last:border-0"><td className="px-4 py-2"><code className="text-[12px] text-ink">{n}</code><span className="block text-[11.5px] text-ink3">{k}</span></td><td className="px-4 py-2 text-ink2">{u}</td><td className="px-4 py-2 text-right text-ink3 whitespace-nowrap">rotated {d} d ago</td></tr>)}</tbody></table></Card>
      </div>
    </div>
  );
}

// ─────────────────────────────── Relationships ───────────────────────────────
export function CmdbRelationships() {
  const { act } = useApp();
  const heroes = Object.values(D.HERO).map(n => D.BR[`BR-${String(n).padStart(4, '0')}`]).filter(Boolean);
  const [bid, setBid] = useState((heroes[0] || D.BRANCHES[0]).id);
  const b = D.BR[bid], ds = D.devicesOf(bid), ecs = ds.filter(d => d.type === 'SD-WAN'), sws = ds.filter(d => d.type === 'Switch'), aps = ds.filter(d => d.type === 'AP');
  const types = useMemo(() => { const m = {}; RELS.forEach(r => { m[r.type] = (m[r.type] || 0) + 1; }); return Object.entries(m); }, []);
  const Node = ({ t, sub, onClick, Ic }) => <button onClick={onClick} className="w-full text-left rounded-md border border-line bg-panel hover:bg-chip/60 px-2.5 py-1.5"><span className="flex items-center gap-1.5 text-[12px] font-semibold text-ink truncate"><Ic size={13} className="text-ink3 shrink-0" />{t}</span>{sub && <span className="block text-[11px] text-ink3 truncate">{sub}</span>}</button>;
  const Col = ({ title, rel, children }) => <div className="min-w-0"><div className="text-[11px] font-bold uppercase text-ink3 mb-1">{title}</div>{rel && <div className="text-[10.5px] text-ink3 mb-1.5 italic">{rel}</div>}<div className="space-y-1.5">{children}</div></div>;
  return (
    <div className="space-y-3">
      <Card title={`Service map: ${b.name}`} sub="Business services depend on the branch; the branch contains its edge; the edge uses the lines and feeds the switches; switches power the access points. Click any CI to drill in"
        right={<select value={bid} onChange={e => setBid(e.target.value)} className="h-8 px-2 rounded-md border border-line bg-canvas text-ink text-[12.5px] max-w-[260px]">{[...heroes, ...D.BRANCHES.slice(0, 40)].filter((x, i, a) => a.indexOf(x) === i).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <Col title="Business services" rel="Depends on">{D.APPS.slice(0, 4).map(a => <Node key={a.id} t={a.short} sub={a.host} Ic={I.AppWindow} onClick={() => act.drill({ t: 'branch', id: bid })} />)}</Col>
          <Col title="Site" rel="Contains"><Node t={b.name} sub={`${b.brand} · ${b.region}`} Ic={I.Store} onClick={() => act.drill({ t: 'branch', id: bid })} /></Col>
          <Col title="SD-WAN edge" rel="Uses">{ecs.map(d => <Node key={d.id} t={d.id} sub={`${d.model} · ${d.role}`} Ic={I.Router} onClick={() => act.drill({ t: 'device', id: d.id })} />)}</Col>
          <Col title="WAN circuits" rel="Connects to">{b.wan.map((w, k) => { const c = D.CIR[w]; return <Node key={w} t={`ISP-${k + 1} ${c.carrier}`} sub={`${c.type} · ${w}`} Ic={I.Cable} onClick={() => act.drill({ t: 'circuit', id: w })} />; })}</Col>
          <Col title="Switches" rel="Feeds">{sws.map(d => <Node key={d.id} t={d.id} sub={`${d.model} · ${d.role}`} Ic={I.Network} onClick={() => act.drill({ t: 'device', id: d.id })} />)}</Col>
          <Col title="Access points" rel="Powered by (PoE)">{aps.slice(0, 8).map(d => <Node key={d.id} t={d.id} sub={`${d.model} · ${d.role}`} Ic={I.Wifi} onClick={() => act.drill({ t: 'device', id: d.id })} />)}{aps.length > 8 && <div className="text-[11px] text-ink3">+{aps.length - 8} more</div>}</Col>
        </div>
      </Card>
      <Card title="Relationship types across the estate" sub="Found by discovery (LLDP, uplinks, PoE ports, Orchestrator paths) and kept current on every run">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">{types.map(([t, n]) => <div key={t} className="rounded-md border border-line px-3 py-2"><div className="text-[11.5px] text-ink3">{t}</div><b className="text-[18px] tabular-nums text-ink">{num(n)}</b></div>)}</div>
      </Card>
    </div>
  );
}

// ─────────────────────────────── Mappings ───────────────────────────────
const ATTRS = [
  ['Resource ID', 'u_opsramp_resource_id', 'Identifier', 'OpsRamp', 'Required on cmdb_ci for the sync'],
  ['Serial number', 'serial_number', 'Identifier (1st)', 'Device API', ''],
  ['MAC address', 'mac_address', 'Identifier (2nd)', 'Device API', ''],
  ['Host name', 'name', 'Identifier (3rd, with IP)', 'Device API', ''],
  ['IP address', 'ip_address', 'Identifier (3rd, with name)', 'SNMP / API', ''],
  ['Make', 'manufacturer', '', 'Device API', 'Reference to core_company'],
  ['Model', 'model_id', '', 'Device API', 'Reference to cmdb_model'],
  ['Firmware', 'firmware_version', '', 'Aruba Central / Orchestrator', ''],
  ['Site', 'location', '', 'ServiceNow', 'ServiceNow owns locations'],
  ['State', 'operational_status', '', 'OpsRamp', 'Up, down, retired'],
  ['Client', 'company', '', 'OpsRamp', 'SRS Distribution'],
  ['Brand (custom attribute)', 'u_srs_brand', '', 'SRS store master', 'One of the SRS brands'],
  ['Region (custom attribute)', 'u_srs_region', '', 'SRS store master', ''],
  ['Support group', 'support_group', '', 'ServiceNow', 'Drives alert routing'],
  ['Warranty end', 'warranty_expiration', '', 'HPE contract feed', ''],
];
const RELMAP = [
  ['Branch contains edge', 'Contains::Contained by', 'cmn_location → cmdb_ci_ip_router'],
  ['Edge uses circuit', 'Uses::Used by', 'cmdb_ci_ip_router → cmdb_ci_circuit'],
  ['Edge feeds core switch', 'Connects to::Connected by', 'cmdb_ci_ip_router → cmdb_ci_ip_switch'],
  ['Switch feeds switch', 'Connects to::Connected by', 'cmdb_ci_ip_switch → cmdb_ci_ip_switch'],
  ['Switch powers access point', 'Powers::Powered by', 'cmdb_ci_ip_switch → cmdb_ci_wap_network'],
  ['Application depends on branch', 'Depends on::Used by', 'cmdb_ci_business_app → cmn_location'],
];
const PRECEDENCE = [
  ['Firmware', ['Aruba Central', 'Orchestrator', 'SNMP']], ['Serial and MAC', ['Device API', 'SNMP', 'CSV import']],
  ['Location and owner', ['ServiceNow', 'SRS store master']], ['Operational state', ['OpsRamp monitoring']],
  ['Warranty and contract', ['HPE contract feed', 'ServiceNow']], ['Circuit ID and carrier', ['Carrier portal', 'Orchestrator']],
];
const TEMPL = [
  ['SD-WAN edge', 'TPL-EC v4.2', 'Movate NOC – L2 Network', 'Tunnels, paths, CPU, storage, HA state'],
  ['Switch (CX)', 'TPL-CX v5.1', 'Movate NOC – L2 Network', 'Reachability, CRC, PoE budget, PSU, fan'],
  ['Switch (2530)', 'TPL-2530 v2.3', 'Movate NOC – L2 Network', 'Reachability, errors, PSU, fan'],
  ['Access point', 'TPL-AP v3.0', 'Movate NOC – L1', 'Up, clients, radio, channel, reboots'],
  ['WAN circuit', 'TPL-CIR v2.6', 'Movate NOC – Carrier', 'Loss, latency, jitter, availability'],
  ['Business application', 'TPL-APP v1.4', 'SRS Applications', 'Synthetic transaction, response time'],
  ['Unmanaged device', 'Generic SNMP', 'Movate NOC – L1', 'Reachability only'],
];
export function CmdbMappings() {
  const { s } = useApp(); const [t, setT] = useState('class'); const C = classes(s);
  const head = cols => <thead><tr className="text-left text-ink3 text-[11.5px] border-b border-line">{cols.map(h => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead>;
  const td = 'px-3 py-2 align-top';
  return (
    <div className="space-y-3">
      <Tabs size="sm" value={t} onChange={setT} tabs={[{ id: 'class', label: 'CI classes' }, { id: 'attr', label: 'Attributes' }, { id: 'rel', label: 'Relationships' }, { id: 'id', label: 'Identification' }, { id: 'prec', label: 'Source precedence' }, { id: 'tpl', label: 'Templates and routing' }]} />
      {t === 'class' && <Card title="Resource type to ServiceNow CI class" sub="Proposed mapping for SRS; the class decides where IRE writes the CI" pad={false}><div className="overflow-x-auto"><table className="w-full text-[12.5px]">{head(['CMDB Lite class', 'Resource type in the tool', 'ServiceNow class', 'CIs', 'Discovered by'])}
        <tbody>{C.map(c => <tr key={c.cls} className="border-b border-line/60 last:border-0"><td className={cx(td, 'font-semibold text-ink')}>{c.cls}</td><td className={cx(td, 'text-ink2')}>{c.or}</td><td className={td}><code className="text-[11.5px]">{c.snow}</code></td><td className={cx(td, 'tabular-nums')}>{num(c.n)}</td><td className={cx(td, 'text-ink2')}>{c.src}</td></tr>)}</tbody></table></div></Card>}
      {t === 'attr' && <Card title="Attribute mapping" sub="Tool attribute to ServiceNow field; identifiers decide whether a CI is new or already known" pad={false}><div className="overflow-x-auto"><table className="w-full text-[12.5px]">{head(['Attribute', 'ServiceNow field', 'Used to identify', 'Owned by', 'Note'])}
        <tbody>{ATTRS.map(([a, f, idf, own, n]) => <tr key={a} className="border-b border-line/60 last:border-0"><td className={cx(td, 'font-semibold text-ink')}>{a}</td><td className={td}><code className="text-[11.5px]">{f}</code></td><td className={td}>{idf ? <Badge tone="blue">{idf}</Badge> : <span className="text-ink3">—</span>}</td><td className={cx(td, 'text-ink2')}>{own}</td><td className={cx(td, 'text-ink3')}>{n}</td></tr>)}</tbody></table></div></Card>}
      {t === 'rel' && <Card title="Relationship mapping" sub="The standard store app syncs CIs and attributes; relationships are written through the IRE API so impact analysis works in ServiceNow" pad={false}><div className="overflow-x-auto"><table className="w-full text-[12.5px]">{head(['In CMDB Lite', 'ServiceNow relationship type', 'Between classes', 'Count'])}
        <tbody>{RELMAP.map(([a, r, c], i) => { const n = [D.DEVICES.filter(d => d.type === 'SD-WAN').length, RELS.filter(x => x.type === 'Uses').length, RELS.filter(x => x.type === 'Feeds' && x.parent.includes('-ec')).length, RELS.filter(x => x.type === 'Feeds' && x.parent.includes('-sw')).length, RELS.filter(x => x.type === 'Powers (PoE)').length, D.APPS.length * D.BRANCHES.length][i]; return <tr key={a} className="border-b border-line/60 last:border-0"><td className={cx(td, 'font-semibold text-ink')}>{a}</td><td className={td}><code className="text-[11.5px]">{r}</code></td><td className={cx(td, 'text-ink2')}><code className="text-[11px]">{c}</code></td><td className={cx(td, 'tabular-nums')}>{num(n)}</td></tr>; })}</tbody></table></div></Card>}
      {t === 'id' && <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">{C.filter(c => c.n).map(c => <Card key={c.cls} title={c.cls} sub={<code className="text-[11px]">{c.snow}</code>}><ol className="space-y-1 text-[12.5px]">{c.idr.split(/, then | or /).map((r, i) => <li key={r} className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-chip text-ink2 grid place-items-center text-[11px] font-bold">{i + 1}</span><span className="text-ink">{r}</span></li>)}<li className="flex items-center gap-2 text-ink3"><I.CornerDownRight size={13} />No match: a new CI is created; two matches: sent to review as a duplicate</li></ol></Card>)}</div>}
      {t === 'prec' && <Card title="Which source wins, attribute by attribute" sub="Reconciliation keeps the value from the highest source that reported it; lower sources only fill gaps" pad={false}><div className="divide-y divide-line/60">{PRECEDENCE.map(([a, srcs]) => <div key={a} className="px-4 py-2 flex items-center gap-3 text-[12.5px]"><b className="w-48 shrink-0 text-ink">{a}</b><span className="flex items-center gap-1.5 flex-wrap">{srcs.map((x, i) => <React.Fragment key={x}>{i > 0 && <I.ChevronRight size={13} className="text-ink3" />}<Badge tone={i === 0 ? 'green' : 'gray'}>{x}</Badge></React.Fragment>)}</span></div>)}</div></Card>}
      {t === 'tpl' && <Card title="Class to monitoring template and alert routing" sub="Once a CI is classified it is monitored and its alerts go to the right team, with no manual step" pad={false}><div className="overflow-x-auto"><table className="w-full text-[12.5px]">{head(['Class', 'Monitoring template', 'Alerts go to', 'Monitors'])}
        <tbody>{TEMPL.map(([c, tp, g, m]) => <tr key={c} className="border-b border-line/60 last:border-0"><td className={cx(td, 'font-semibold text-ink')}>{c}</td><td className={td}><code className="text-[11.5px]">{tp}</code></td><td className={cx(td, 'text-ink2')}>{g}</td><td className={cx(td, 'text-ink3')}>{m}</td></tr>)}</tbody></table></div></Card>}
    </div>
  );
}

// ─────────────────────────────── ServiceNow sync ───────────────────────────────
const LOG0 = [0, 1, 2, 3, 4, 5].map(i => ({ t: T0 - (i * 4 + 1) * HR - 7 * MIN, ins: [2, 0, 1, 0, 0, 3][i], upd: [41, 18, 26, 9, 33, 57][i], same: 9910 - i * 3, skip: [1, 0, 0, 2, 0, 1][i], err: 0 }));
export function CmdbSync() {
  const { s, act } = useApp(); const log = s.snowSync || LOG0; const [busy, setBusy] = useState(false);
  const total = classes(s).reduce((a, c) => a + c.n, 0);
  const sync = () => { setBusy(true); setTimeout(() => { const added = (s.invAdded || []).length; const row = { t: Date.now(), ins: Math.min(added, 9) || 0, upd: 12, same: total - 12, skip: 0, err: 0 }; act.set({ snowSync: [row, ...log].slice(0, 12) }); act.audit(`CMDB Lite synced to ServiceNow: ${row.ins} inserted, ${row.upd} updated`, 'snow-sync'); act.toast('Synced to ServiceNow through the IRE'); setBusy(false); }, 1400); };
  const last = log[0];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">{[['Last sync', ago(last.t)], ['Direction', 'Tool → ServiceNow'], ['CIs in ServiceNow', num(total)], ['Inserted, last run', last.ins], ['Updated, last run', last.upd]].map(([k, v]) => <Card key={k} title={k}><div className="text-[20px] font-bold text-ink tabular-nums">{v}</div></Card>)}</div>
      <Card title="Sync runs" sub="Every 4 hours and after each discovery run. Uses the certified store app with OAuth 2.0; ServiceNow's IRE decides insert or update" right={<Btn size="sm" kind="brand" icon={busy ? I.Loader2 : I.RefreshCw} onClick={sync} disabled={busy}>{busy ? 'Syncing…' : 'Sync now'}</Btn>} pad={false}>
        <div className="overflow-x-auto"><table className="w-full text-[12.5px]"><thead><tr className="text-left text-ink3 text-[11.5px] border-b border-line">{['When', 'Inserted', 'Updated', 'Unchanged', 'Skipped', 'Errors'].map(h => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
          <tbody>{log.map((r, i) => <tr key={i} className="border-b border-line/60 last:border-0"><td className="px-3 py-1.5 text-ink">{ago(r.t)}</td><td className="px-3 py-1.5 tabular-nums">{r.ins}</td><td className="px-3 py-1.5 tabular-nums">{r.upd}</td><td className="px-3 py-1.5 tabular-nums text-ink3">{num(r.same)}</td><td className="px-3 py-1.5 tabular-nums">{r.skip}</td><td className={cx('px-3 py-1.5 tabular-nums', r.err ? 'text-bad font-bold' : 'text-ok')}>{r.err}</td></tr>)}</tbody></table></div>
      </Card>
      <Card title="What the sync does and does not cover">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[12.5px]">
          <div><b className="text-ink">Covered by the store app</b><ul className="mt-1 space-y-1 text-ink2">{['CIs and their attributes, one way into ServiceNow', 'Resource ID kept on every CI, so incidents point at the right CI', 'Supported on Utah, Vancouver, Washington DC and Yokohama'].map(x => <li key={x} className="flex gap-2"><I.Check size={14} className="text-ok mt-0.5 shrink-0" />{x}</li>)}</ul></div>
          <div><b className="text-ink">Added for SRS</b><ul className="mt-1 space-y-1 text-ink2">{['Relationships written through the IRE API, for impact analysis', 'Custom attributes (brand, region, store hours) to u_ fields', 'Retired CIs marked non-operational, never deleted'].map(x => <li key={x} className="flex gap-2"><I.Plus size={14} className="text-info mt-0.5 shrink-0" />{x}</li>)}</ul></div>
        </div>
      </Card>
    </div>
  );
}

// ─────────────────────────────── Asset journey ───────────────────────────────
// One asset, end to end: the monitoring tool reports it, the tool onboards it as a resource, CMDB Lite classifies,
// identifies, reconciles and relates it, maps it field by field and writes it to the ServiceNow CMDB.
function samples() {
  const b = D.storeOf(D.HERO.config) || D.BRANCHES[213], b2 = D.storeOf(D.HERO.autoAP) || D.BRANCHES[308], b3 = D.storeOf(D.HERO.bandwidth) || D.BRANCHES[44];
  const net = n => `10.${(n % 200) + 20}.0`;
  return {
    sw: { label: 'Aruba CX switch', tool: 'Aruba Central', via: 'Webhook: device added', prof: 'DP-02', b, host: `${b.code}-sw03`, ip: `${net(b.number || 214)}.13`, make: 'HPE Aruba Networking', model: 'CX 6100 24G CL4 (JL679A)', serial: 'CN4BKSP0Q2', mac: '88:3a:30:9c:41:e2', fw: '10.16.1030', type: 'Network switch', cls: 'Switch', snow: 'cmdb_ci_ip_switch', tpl: 'TPL-CX v5.1', group: 'Movate NOC – L2 Network', kind: 'Switch',
      rels: [[`${b.code}-sw01`, 'Connects to::Connected by', 'Uplink 1/1/49 by LLDP'], [b.name, 'Contains::Contained by', 'Site from the Central group'], [`${b.code}-ap05`, 'Powers::Powered by', 'PoE port 1/1/7']] },
    ap: { label: 'Aruba access point', tool: 'Aruba Central', via: 'API poll: new AP joined', prof: 'DP-03', b: b2, host: `${b2.code}-ap09`, ip: `${net(b2.number || 309)}.59`, make: 'HPE Aruba Networking', model: 'AP-635 (R7J27A)', serial: 'CNR4KX20B7', mac: '20:4c:03:7a:18:c4', fw: '10.6.0.2', type: 'Wireless access point', cls: 'Access point', snow: 'cmdb_ci_wap_network', tpl: 'TPL-AP v3.0', group: 'Movate NOC – L1', kind: 'Access point',
      rels: [[`${b2.code}-sw02`, 'Powers::Powered by', 'PoE port 1/1/18 by LLDP'], [b2.name, 'Contains::Contained by', 'Site from the Central group']] },
    ec: { label: 'EdgeConnect appliance', tool: 'Orchestrator', via: 'REST API: appliance approved', prof: 'DP-01', b: b3, host: `${b3.code}-ec02`, ip: `${net(b3.number || 45)}.2`, make: 'HPE Aruba Networking', model: 'EdgeConnect EC-XS', serial: '001BBC2F7D44', mac: '00:1b:bc:2f:7d:44', fw: 'ECOS 9.5.4.1', type: 'EdgeConnect appliance', cls: 'SD-WAN edge', snow: 'cmdb_ci_ip_router', tpl: 'TPL-EC v4.2', group: 'Movate NOC – L2 Network', kind: 'SD-WAN',
      rels: [[b3.name, 'Contains::Contained by', 'Site from the Orchestrator group'], [b3.wan[0], 'Uses::Used by', 'WAN1 path'], [b3.wan[1], 'Uses::Used by', 'WAN2 path'], [`${b3.code}-sw01`, 'Connects to::Connected by', 'LAN port lan0']] },
    cir: { label: 'ISP circuit', tool: 'Carrier portal + Orchestrator', via: 'Webhook: circuit turned up', prof: 'DP-04', b, host: `${b.code}-wan3`, ip: '—', make: 'Lumen', model: 'DIA 500 Mb/s', serial: 'LMN/DIA/77310482', mac: '—', fw: '—', type: 'Circuit', cls: 'WAN circuit', snow: 'cmdb_ci_circuit', tpl: 'TPL-CIR v2.6', group: 'Movate NOC – Carrier', kind: 'Circuit',
      rels: [[`${b.code}-ec01`, 'Uses::Used by', 'Seen as a new path on the edge'], [b.name, 'Contains::Contained by', 'Site from the order']] },
    vm: { label: 'Azure virtual machine', tool: 'Azure Monitor', via: 'API: resource created', prof: 'DP-07', b: null, host: 'srs-pricing-vm03', ip: '10.240.4.23', make: 'Microsoft Azure', model: 'Standard_D4s_v5', serial: '/subscriptions/…/srs-pricing-vm03', mac: '00:0d:3a:91:5e:20', fw: 'Ubuntu 22.04', type: 'Azure resource', cls: 'Cloud resource', snow: 'cmdb_ci_vm_instance', tpl: 'TPL-AZ-VM v1.2', group: 'SRS Cloud', kind: 'Cloud VM',
      rels: [['Pricing & quoting', 'Depends on::Used by', 'Tag app=pricing'], ['SRS Azure subscription', 'Hosted on::Hosts', 'Azure resource group']] },
  };
}
const JSTEPS = [
  ['Seen', 'The monitoring tool reports it', I.Radio],
  ['Onboarded', 'Becomes a resource in the tool', I.PackagePlus],
  ['Classified', 'Type, class, template, routing', I.Tags],
  ['Identified', 'New CI or one we already have', I.Fingerprint],
  ['Reconciled', 'Each value from its owner', I.GitMerge],
  ['Related', 'How it connects to other CIs', I.Share2],
  ['Mapped', 'Field by field to ServiceNow', I.ArrowRightLeft],
  ['In the CMDB', 'Written through the IRE', I.Database],
];
export function CmdbJourney({ go }) {
  const { s, act } = useApp();
  const S = useMemo(samples, []);
  const [k, setK] = useState('sw'), [st, setSt] = useState(0), [play, setPlay] = useState(false);
  const a = S[k], site = a.b ? a.b.name : 'Azure (SRS tenant)', rid = `R-${(a.serial.replace(/\W/g, '').slice(-6) || '000000').toUpperCase()}`;
  const sysId = useMemo(() => Array.from({ length: 32 }, (_, i) => '0123456789abcdef'[(a.serial.charCodeAt(i % a.serial.length) * (i + 7)) % 16]).join(''), [k]);
  const done = (s.journeyDone || {})[k];
  useEffect(() => { if (!play) return; if (st >= JSTEPS.length - 1) { setPlay(false); return; } const t = setTimeout(() => setSt(x => x + 1), 1700); return () => clearTimeout(t); }, [play, st]);
  useEffect(() => { if (st === JSTEPS.length - 1 && !done) {
    act.addInventory([{ id: `J-${a.host}`, name: a.host, kind: a.kind, vendor: a.make.split(' ')[0], model: a.model, ip: a.ip === '—' ? null : a.ip, site: a.b ? `${a.b.brand} – ${a.b.name}` : site, source: `${a.tool} (${a.prof})`, template: a.tpl, via: 'CMDB Lite', t: Date.now() }]);
    act.set(x => ({ journeyDone: { ...(x.journeyDone || {}), [k]: { sysId, t: Date.now() } } }));
    act.audit(`${a.host} onboarded from ${a.tool}, classified ${a.cls}, written to ServiceNow ${a.snow} (${sysId.slice(0, 8)}…)`, a.host);
  } }, [st, k]);
  const pick = x => { setK(x); setSt(0); setPlay(false); };
  const KV = ({ rows }) => <dl className="grid grid-cols-[150px_minmax(0,1fr)] gap-x-3 text-[12.5px]">{rows.map(([kk, v]) => <React.Fragment key={kk}><dt className="text-ink3 py-1 border-b border-line/60">{kk}</dt><dd className="text-ink py-1 border-b border-line/60 break-words">{v}</dd></React.Fragment>)}</dl>;
  const Code = ({ o }) => <pre className="bg-chip/60 border border-line rounded-md p-3 text-[11.5px] font-mono text-ink overflow-x-auto max-h-[300px]">{JSON.stringify(o, null, 2)}</pre>;
  const body = [
    () => <><p className="text-[12.5px] text-ink2 mb-2"><b className="text-ink">{a.tool}</b> sends: <b className="text-ink">{a.via}</b>. Nothing in the CMDB knows this asset yet.</p>
      <Code o={k === 'vm' ? { eventType: 'Microsoft.Resources.ResourceWriteSuccess', subject: a.serial, data: { resourceName: a.host, vmSize: a.model, location: 'centralus', tags: { app: 'pricing', env: 'prod' } } } : k === 'cir' ? { event: 'circuit.active', carrier: a.make, circuitId: a.serial, service: a.model, siteRef: a.b.code, handoff: `${a.b.code}-ec01 wan3` } : { event: k === 'ec' ? 'appliance.approved' : 'device.added', serial: a.serial, macaddr: a.mac, model: a.model, firmware: a.fw, name: a.host, ip_address: a.ip, group: a.b ? `SRS/${a.b.region}/${a.b.code}` : '' }} /></>,
    () => <><p className="text-[12.5px] text-ink2 mb-2">Discovery profile <b className="text-ink">{a.prof}</b> picks it up and the tool creates a resource for client SRS Distribution.</p>
      <KV rows={[['Resource ID', rid], ['Name', a.host], ['Resource type', a.type], ['IP address', a.ip], ['Make', a.make], ['Model', a.model], ['Serial number', a.serial], ['Firmware / OS', a.fw], ['Site', site], ['Client', 'SRS Distribution'], ['Discovered by', `${a.prof} via ${a.tool}`]]} /></>,
    () => <><p className="text-[12.5px] text-ink2 mb-2">Make and model decide the class. The class brings the monitoring template and where its alerts go.</p>
      <div className="flex items-center gap-2 flex-wrap mb-3">{[[a.type, 'Resource type'], [a.cls, 'CMDB Lite class'], [a.snow, 'ServiceNow class']].map(([v, l], i) => <React.Fragment key={l}>{i > 0 && <I.ArrowRight size={15} className="text-ink3" />}<span className="rounded-md border border-line px-2.5 py-1.5"><span className="block text-[10.5px] text-ink3">{l}</span><b className="text-[12.5px] text-ink font-mono">{v}</b></span></React.Fragment>)}</div>
      <KV rows={[['Monitoring template', a.tpl], ['Alerts go to', a.group], ['Monitoring started', 'Yes, first poll in under a minute']]} /></>,
    () => <><p className="text-[12.5px] text-ink2 mb-2">The identification rules for <code>{a.snow}</code> run in order. No match on any rule, so this is a new CI.</p>
      <ol className="space-y-1.5 text-[12.5px]">{[['Serial number', a.serial], ['MAC address', a.mac], ['Name + IP address', `${a.host} / ${a.ip}`]].map(([r, v], i) => <li key={r} className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-chip text-ink2 grid place-items-center text-[11px] font-bold">{i + 1}</span><b className="w-40 text-ink">{r}</b><code className="text-[11.5px] text-ink2 flex-1 truncate">{v}</code><Badge tone="gray">no match</Badge></li>)}
        <li className="flex items-center gap-2 pt-1"><I.CornerDownRight size={14} className="text-ink3" /><Badge tone="blue">New CI</Badge><span className="text-ink2">would be an update if any rule had matched; two matches would go to review as a duplicate</span></li></ol></>,
    () => <><p className="text-[12.5px] text-ink2 mb-2">Each attribute keeps the value from the source that owns it.</p>
      <table className="w-full text-[12.5px]"><thead><tr className="text-left text-ink3 text-[11.5px] border-b border-line"><th className="py-1.5">Attribute</th><th>Value kept</th><th>From</th></tr></thead><tbody>{[['Serial number', a.serial, a.tool], ['Firmware / OS', a.fw, a.tool], ['Location', site, 'ServiceNow (owns locations)'], ['Support group', a.group, 'ServiceNow'], ['Operational status', 'Operational', 'Monitoring'], ['Brand / region', a.b ? `${a.b.brand} / ${a.b.region}` : 'Cloud', 'SRS store master']].map(([x, v, f]) => <tr key={x} className="border-b border-line/60 last:border-0"><td className="py-1.5 font-semibold text-ink">{x}</td><td className="text-ink2">{v}</td><td><Badge tone="green">{f}</Badge></td></tr>)}</tbody></table></>,
    () => <><p className="text-[12.5px] text-ink2 mb-2">Discovery finds how it connects, so impact analysis works from day one.</p>
      <div className="space-y-1.5">{a.rels.map(([to, t, how]) => <div key={to + t} className="flex items-center gap-2 text-[12.5px] rounded-md border border-line px-2.5 py-1.5"><b className="text-ink font-mono">{a.host}</b><I.ArrowRight size={14} className="text-ink3" /><code className="text-[11.5px] text-info">{t}</code><I.ArrowRight size={14} className="text-ink3" /><b className="text-ink">{to}</b><span className="ml-auto text-[11.5px] text-ink3">{how}</span></div>)}</div></>,
    () => <><p className="text-[12.5px] text-ink2 mb-2">The attribute mapping turns the resource into a <code>{a.snow}</code> record.</p>
      <table className="w-full text-[12.5px]"><thead><tr className="text-left text-ink3 text-[11.5px] border-b border-line"><th className="py-1.5">In the tool</th><th>Value</th><th>ServiceNow field</th></tr></thead><tbody>{[['Resource ID', rid, 'u_opsramp_resource_id'], ['Name', a.host, 'name'], ['Serial number', a.serial, 'serial_number'], ['MAC address', a.mac, 'mac_address'], ['IP address', a.ip, 'ip_address'], ['Make', a.make, 'manufacturer'], ['Model', a.model, 'model_id'], ['Firmware / OS', a.fw, 'firmware_version'], ['Site', site, 'location'], ['Support group', a.group, 'support_group'], ['Brand', a.b ? a.b.brand : '—', 'u_srs_brand']].map(([x, v, f]) => <tr key={x} className="border-b border-line/60 last:border-0"><td className="py-1.5 text-ink">{x}</td><td className="text-ink2 font-mono text-[11.5px]">{v}</td><td><code className="text-[11.5px] text-info">{f}</code></td></tr>)}</tbody></table></>,
    () => <><p className="text-[12.5px] text-ink2 mb-2">Sent to ServiceNow through the IRE. It inserts the CI and its relationships, and the asset is now in CMDB Lite too.</p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3"><Code o={{ items: [{ className: a.snow, values: { name: a.host, serial_number: a.serial, mac_address: a.mac, ip_address: a.ip, firmware_version: a.fw, u_opsramp_resource_id: rid } }], relations: a.rels.map(([to, t]) => ({ parent: 0, type: t, child: to })) }} />
        <div><KV rows={[['Operation', 'INSERT'], ['ServiceNow class', a.snow], ['sys_id', sysId], ['Relationships created', a.rels.length], ['In CMDB Lite', done ? `yes, ${ago(done.t)}` : 'yes']]} />
          <div className="flex gap-2 mt-3 flex-wrap"><Btn size="sm" icon={I.PackagePlus} onClick={() => go('onboarded')}>See it in Added by onboarding</Btn><Btn size="sm" icon={I.Share2} onClick={() => go('rels')}>Relationships</Btn><Btn size="sm" icon={I.RefreshCw} onClick={() => go('sync')}>ServiceNow sync</Btn></div></div></div></>,
  ];
  return (
    <div className="space-y-3">
      <Card title="From the monitoring tool to the CMDB" sub="Follow one asset through onboarding, classification, identification, reconciliation, relationships and mapping"
        right={<div className="flex items-center gap-2"><Btn size="sm" icon={I.RotateCcw} onClick={() => { setSt(0); setPlay(false); }}>Reset</Btn><Btn size="sm" kind="brand" icon={play ? I.Pause : I.Play} onClick={() => { if (st >= JSTEPS.length - 1) setSt(0); setPlay(p => !p); }}>{play ? 'Pause' : 'Play'}</Btn><Btn size="sm" icon={I.SkipForward} onClick={() => setSt(x => Math.min(JSTEPS.length - 1, x + 1))} disabled={st >= JSTEPS.length - 1}>Next step</Btn></div>}>
        <div className="flex items-center gap-2 flex-wrap mb-3"><span className="text-[12px] font-semibold text-ink3">Asset</span><Tabs size="sm" value={k} onChange={pick} tabs={Object.entries(S).map(([id, x]) => ({ id, label: x.label }))} /><span className="text-[12px] text-ink3">{a.host} · {site}</span>{done && <Badge tone="green">In the CMDB</Badge>}</div>
        <div className="grid grid-cols-4 lg:grid-cols-8 gap-1.5">{JSTEPS.map(([t, sub, Ic], i) => (
          <button key={t} onClick={() => { setSt(i); setPlay(false); }} className={cx('text-left rounded-md border px-2 py-1.5', i === st ? 'border-[#01A982] bg-[#01A982]/10' : i < st ? 'border-line bg-chip/50' : 'border-line bg-panel hover:bg-chip/40')}>
            <span className="flex items-center gap-1.5"><span className={cx('w-5 h-5 rounded-full grid place-items-center text-[10.5px] font-bold shrink-0', i < st ? 'bg-ok/15 text-ok' : i === st ? 'bg-[#01A982] text-white' : 'bg-chip text-ink3')}>{i < st ? <I.Check size={11} /> : i + 1}</span><b className="text-[12px] text-ink truncate">{t}</b></span>
            <span className="block text-[10.5px] text-ink3 mt-0.5 leading-tight">{sub}</span>
          </button>))}</div>
      </Card>
      <Card title={`${st + 1}. ${JSTEPS[st][0]}: ${a.host}`} sub={JSTEPS[st][1]} icon={JSTEPS[st][2]}>{body[st]()}</Card>
    </div>
  );
}
