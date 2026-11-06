// OpsRamp Policies & Templates: how each kind of device and line is monitored (templates and thresholds), the
// policies that act on alerts, who and what can reach the devices, the network policies and golden configs
// checked every day, and how a new make or model such as Cisco is brought in.
import React, { useState } from 'react';
import * as I from 'lucide-react';
import * as D from './data.js';
import { useApp } from './store.jsx';
import { Card, Badge, Btn, Stat, Tabs, Pri, OpsRampHead, cx } from './ui.jsx';
import { TEMPLATES, METRICS, VENDOR_SRC, PROFILES, ACCESS, ROLES, NET_POLICIES, CONFIGS, VENDORS, ONBOARD, POLICY_ORDER } from './policies.js';
import { num, pct } from './util.js';

const TABS = [{ id: 'templates', label: 'Monitoring templates' }, { id: 'policies', label: 'Alert policies' }, { id: 'access', label: 'Access' }, { id: 'network', label: 'Network policies and configs' }, { id: 'new', label: 'New make or model' }];
const Th = ({ children, r }) => <th className={cx('py-1.5 pr-3 font-semibold text-ink3 text-[11.5px]', r ? 'text-right' : 'text-left')}>{children}</th>;
const ESC = [['P1', [['L1 NOC', 0], ['L2 Network', 5], ['Major incident manager', 10], ['On-call engineer', 15]]], ['P2', [['L1 NOC', 0], ['L2 Network', 15], ['On-call engineer', 45]]], ['P3', [['L1 NOC', 0], ['L2 Network', 60], ['On-call engineer', 240]]], ['P4', [['L1 NOC', 0], ['L2 Network', 480]]]];

export function Policies() {
  const { s, act } = useApp();
  const tab = s.tab.policies || 'templates', setTab = t => act.setTab('policies', t);
  const pilots = s.pilotTemplates || [];
  const devs = D.DEVICES.length, covered = TEMPLATES.filter(t => t.cls !== 'Access link' && t.cls !== 'Application path').reduce((a, t) => a + t.n, 0);
  const drift = CONFIGS.reduce((a, c) => a + c.drift.length, 0);
  return (
    <div className="theme-opsramp">
      <OpsRampHead title="Policies & Templates" sub="HPE OpsRamp monitoring templates, alert policies, access and network policies" />
      <div className="kpi-strip grid grid-cols-2 lg:grid-cols-5 mb-3">
        <Stat label="Monitoring templates" icon={I.LayoutTemplate} value={TEMPLATES.length + pilots.length} sub={pilots.length ? `${pilots.length} in pilot` : 'one per kind of device or line'} onClick={() => setTab('templates')} />
        <Stat label="Devices covered" icon={I.ShieldCheck} value={pct(covered / devs, 1)} sub={`${num(covered)} of ${num(devs)} devices on a template`} tone="green" onClick={() => setTab('templates')} />
        <Stat label="Alert policies" icon={I.Filter} value={3 + 7 + 4} sub="correlation, first response, escalation" onClick={() => setTab('policies')} />
        <Stat label="Config compliance" icon={I.FileCheck2} value={pct(1 - drift / devs, 1)} sub={`${drift} devices differ from the golden config`} tone={drift ? 'amber' : 'green'} onClick={() => setTab('network')} />
        <Stat label="Ready for a new vendor" icon={I.PlugZap} value={VENDORS.length} sub="Cisco and others, from the OpsRamp library" onClick={() => setTab('new')} />
      </div>
      <Tabs value={tab} onChange={setTab} className="mb-3" tabs={TABS} />
      {tab === 'templates' && <Templates pilots={pilots} />}
      {tab === 'policies' && <AlertPolicies />}
      {tab === 'access' && <Access />}
      {tab === 'network' && <Network />}
      {tab === 'new' && <NewVendor pilots={pilots} />}
    </div>
  );
}

function Templates({ pilots }) {
  const { act } = useApp();
  const [sel, setSel] = useState(TEMPLATES[1].id);
  const all = [...TEMPLATES, ...pilots];
  const t = all.find(x => x.id === sel) || TEMPLATES[0];
  const vs = VENDOR_SRC[t.vendor] || {};
  const mets = (METRICS[t.like || t.id] || []).map(m => vs[m.k] ? { ...m, src: vs[m.k] } : m);
  return (<>
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-3 items-stretch [&>*]:h-full mb-3">
      <Card title="Monitoring templates" sub="Assigned automatically by a template-based alert definition, by resource type and store group">
        <div className="divide-y divide-line">{all.map(x => (
          <button key={x.id} onClick={() => setSel(x.id)} className={cx('w-full text-left py-2 px-2 rounded flex items-center gap-3', x.id === sel ? 'bg-chip' : 'hover:bg-chip/50')}>
            <span className="w-8 h-8 rounded-md bg-brand/10 text-brand grid place-items-center shrink-0">{x.cls === 'SD-WAN edge' ? <I.Router size={15} /> : x.cls === 'Access switch' ? <I.Network size={15} /> : x.cls === 'Wi-Fi AP' ? <I.Wifi size={15} /> : x.cls === 'Access link' ? <I.Cable size={15} /> : x.cls === 'Firewall' ? <I.Shield size={15} /> : <I.AppWindow size={15} />}</span>
            <span className="flex-1 min-w-0"><span className="flex items-center gap-2"><b className="text-[13px] text-ink truncate">{x.name}</b>{x.pilot && <Badge tone="amber">pilot</Badge>}</span><span className="block text-[11.5px] text-ink3 truncate">{x.models.join(', ')} · {x.how.map(h => h[0]).join(', ')}</span></span>
            <span className="text-right shrink-0"><b className="text-[13px] text-ink tabular-nums">{num(x.n)}</b><span className="block text-[11px] text-ink3">{x.cls === 'Access link' ? 'lines' : x.cls === 'Application path' ? 'paths' : 'devices'}</span></span>
          </button>))}</div>
      </Card>
      <Card title={t.name} sub={`${t.id} · ${t.ver || 'pilot'} · ${t.cls}`} right={t.pilot ? <Badge tone="amber">Observed mode, 2 stores</Badge> : <Badge tone="green">in use</Badge>}>
        {t.note && <div className="text-[12px] text-warn mb-2">{t.note}</div>}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[12.5px]">
          <div><div className="text-[11px] font-bold uppercase text-ink3 mb-1">How it is collected</div>{t.how.map(([a, b]) => <div key={a} className="flex justify-between gap-2 py-0.5 border-b border-line/60"><span className="text-ink">{a}</span><span className="text-ink3">{b}</span></div>)}</div>
          <div><div className="text-[11px] font-bold uppercase text-ink3 mb-1">What is monitored</div><ul className="space-y-0.5">{t.metrics.map(m => <li key={m} className="flex gap-1.5 text-ink"><I.Check size={13} className="text-ok mt-[2px] shrink-0" />{m}</li>)}</ul></div>
          <div><div className="text-[11px] font-bold uppercase text-ink3 mb-1">Parent for correlation</div><div className="text-ink">{t.parent}</div><div className="text-ink3 text-[11.5px]">When the parent is down, its children are suppressed and listed on it.</div></div>
          <div><div className="text-[11px] font-bold uppercase text-ink3 mb-1">ServiceNow mapping</div><div className="text-ink">{t.snow[0]}</div><div className="text-ink2">{t.snow[1]}</div><div className="text-ink3 text-[11.5px]">CI class: {t.snow[2]}</div></div>
        </div>
        <div className="grid grid-cols-4 gap-2 mt-3 text-[12px]">{[['Metrics defined', mets.length], ['Levels by store profile', mets.filter(m => m.th && m.th.S).length], ['State checks', mets.filter(m => m.th && !Array.isArray(m.th) && !m.th.S).length], ['Fastest poll', mets.some(m => /1 min/.test(m.every)) ? '1 min' : mets.length ? '5 min' : '—']].map(([k, v]) => <div key={k} className="border border-line rounded px-2 py-1"><div className="text-ink3 text-[11px]">{k}</div><b className="text-ink tabular-nums">{v}</b></div>)}</div>
        <div className="flex gap-2 mt-3"><Btn size="sm" icon={I.Layers} onClick={() => act.drill(t.cls === 'Access link' ? { t: 'lines', k: 'all' } : { t: 'devices', k: 'all', ...(t.models.length === 1 && t.cls !== 'Application path' ? { model: t.models[0] } : {}) })}>See what uses it</Btn></div>
      </Card>
    </div>
    <MetricDefs t={t} mets={mets} />
  </>);
}

const fmtTh = (th, prof, i, unit) => { if (!th) return '—'; if (Array.isArray(th)) return `${th[i]}${unit && unit.length < 4 ? ' ' + unit : ''}`; if (th.S) return `${th[prof][i]}${unit && unit.length < 4 ? ' ' + unit : ''}`; return i ? th.c : th.w; };
function MetricDefs({ t, mets }) {
  const [prof, setProf] = useState('M');
  const [open, setOpen] = useState(null);
  if (!mets.length) return <Card title={`Metric definitions: ${t.name}`}><div className="text-[12.5px] text-ink2">Set when the template is built for this new class: metric, source, interval, levels and actions, reviewed by SRS and Movate before the pilot.</div></Card>;
  return (
    <Card title={`Metric definitions: ${t.name}`} sub={t.like ? `Levels from ${t.like}; sources for ${t.name.split(' ')[0]}` : `${mets.length} metrics; click one for the full rule`}
      right={<div className="flex rounded-md border border-line overflow-hidden text-[12px]">{PROFILES.map(p => <button key={p.k} onClick={() => setProf(p.k)} className={cx('px-2.5 py-1', prof === p.k ? 'bg-ink text-white' : 'text-ink2 hover:bg-chip')}>{p.label}</button>)}</div>}>
      <div className="overflow-x-auto"><table className="w-full text-[12.5px]">
        <thead><tr className="border-b border-line"><Th>Metric</Th><Th>Collected from</Th><Th>Every</Th><Th>Worked out as</Th><Th r>Warning</Th><Th r>Critical</Th><Th>Alert after</Th></tr></thead>
        <tbody>{mets.map(m => { const o = open === m.k + m.m; return (<React.Fragment key={m.k + m.m}>
          <tr onClick={() => setOpen(o ? null : m.k + m.m)} className={cx('border-b border-line/60 cursor-pointer align-top', o ? 'bg-chip' : 'hover:bg-chip/50')}>
            <td className="py-1.5 pr-3"><span className="flex items-start gap-1"><I.ChevronRight size={13} className={cx('mt-[3px] shrink-0 text-ink3 transition-transform', o && 'rotate-90')} /><span><b className="text-ink font-semibold">{m.m}</b>{m.unit && <span className="text-ink3"> ({m.unit})</span>}{m.th && m.th.S && <span className="block text-[10.5px] text-brand">by store profile</span>}</span></span></td>
            <td className="py-1.5 pr-3 text-ink2 max-w-[260px]">{m.src}</td>
            <td className="py-1.5 pr-3 text-ink2 whitespace-nowrap">{m.every}</td>
            <td className="py-1.5 pr-3 text-ink2 max-w-[280px]">{m.calc}</td>
            <td className="py-1.5 pr-3 text-right text-warn font-semibold tabular-nums max-w-[150px]">{fmtTh(m.th, prof, 0, m.unit)}</td>
            <td className="py-1.5 pr-3 text-right text-bad font-semibold tabular-nums max-w-[150px]">{fmtTh(m.th, prof, 1, m.unit)}</td>
            <td className="py-1.5 text-ink2">{m.when}</td>
          </tr>
          {o && <tr className="border-b border-line/60 bg-chip/40"><td colSpan={7} className="px-3 py-2.5">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-[12px]">
              <div><div className="text-[11px] font-bold uppercase text-ink3">OpsRamp metric</div><div className="font-mono text-ink">{t.like ? m.k.replace(/^\w+/, t.id.replace('TPL-', '').toLowerCase()) : m.k}</div><div className="text-[11px] font-bold uppercase text-ink3 mt-2">Clears after</div><div className="text-ink">{m.clear}</div></div>
              <div><div className="text-[11px] font-bold uppercase text-warn">On warning</div><div className="text-ink">{m.warn}</div></div>
              <div><div className="text-[11px] font-bold uppercase text-bad">On critical</div><div className="text-ink">{m.crit}</div></div>
              <div><div className="text-[11px] font-bold uppercase text-ink3">Feeds</div><div className="text-ink">{m.feeds}</div>{m.th && m.th.S && <><div className="text-[11px] font-bold uppercase text-ink3 mt-2">All profiles (warning / critical)</div>{PROFILES.map(p => <div key={p.k} className="flex justify-between gap-2"><span className="text-ink2">{p.label}</span><span className="tabular-nums"><span className="text-warn font-semibold">{m.th[p.k][0]}</span> / <span className="text-bad font-semibold">{m.th[p.k][1]}</span></span></div>)}</>}</div>
            </div>
          </td></tr>}
        </React.Fragment>); })}</tbody>
      </table></div>
    </Card>
  );
}

function AlertPolicies() {
  const { s, act } = useApp();
  const fr = [['FR-01', 'Suppress SD-WAN tunnel re-key info messages', 'User rule', 'On'], ['FR-02', 'Suppress nightly config-backup traffic spikes, 01:00 to 03:00 local', 'Learned seasonal pattern', 'On'], ['FR-03', 'Suppress AP watchdog reboots that recover inside 3 minutes', 'Training file', 'Recommend'], ['FR-04', 'Suppress PoE renegotiation on yard APs', 'Machine learning', 'Observed']];
  const cp = [['CP-01', 'Store topology: circuit, EdgeConnect, switches and APs behind it', 'Topology and site', 'On'], ['CP-02', 'Same carrier, same region, inside 15 minutes', 'ML co-occurrence, region aware', 'Recommend'], ['CP-03', 'Application slowness with WAN latency at the same store', 'ML co-occurrence, site aware', 'Observed']];
  const modes = s.catModes || {};
  const MT = { Off: 'gray', Observed: 'blue', Recommend: 'amber', On: 'green' };
  const row = ([id, n, by, m]) => <div key={id} className="flex items-center gap-2 py-1.5 border-b border-line/60 last:border-0 text-[12.5px]"><span className="font-mono text-ink3 w-12">{id}</span><span className="flex-1 min-w-0"><span className="text-ink">{n}</span><span className="block text-[11px] text-ink3">{by}</span></span><Badge tone={MT[modes[id] || m]}>{modes[id] || m}</Badge></div>;
  return (<>
    <Card title="The order OpsRamp applies alert policies" className="mb-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">{POLICY_ORDER.map(([n, d], i) => <div key={n} className="border border-line rounded-lg p-3 relative"><div className="flex items-center gap-2"><span className="w-6 h-6 rounded-full bg-brand text-white text-[12px] font-bold grid place-items-center">{i + 1}</span><b className="text-[13.5px] text-ink">{n}</b></div><div className="text-[12px] text-ink2 mt-1">{d}</div></div>)}</div>
      <div className="text-[12px] text-ink3 mt-2">Default order. First response can be set to run before correlation, so suppressed alerts never reach correlation or escalation.</div>
    </Card>
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 mb-3 items-stretch [&>*]:h-full">
      <Card title="Alert correlation policies" right={<Btn size="sm" icon={I.LibraryBig} onClick={() => act.go('catalogue')}>Change modes</Btn>}>{cp.map(row)}</Card>
      <Card title="First response policies" right={<Btn size="sm" icon={I.LibraryBig} onClick={() => act.go('catalogue')}>Change modes</Btn>}>{fr.map(row)}</Card>
    </div>
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-stretch [&>*]:h-full">
      <Card title="Alert escalation policies">{ESC.map(([p, steps]) => <div key={p} className="flex items-center gap-2 py-1.5 text-[12px]"><Pri p={p} /><div className="flex-1 flex items-center gap-1 flex-wrap">{steps.map(([w, m], i) => <React.Fragment key={w}>{i > 0 && <I.ChevronRight size={12} className="text-ink3" />}<span className="border border-line rounded px-1.5 py-0.5"><b className="text-ink">{w}</b> <span className="text-ink3">{m ? `+${m >= 60 ? `${m / 60} h` : `${m} min`}` : 'at once'}</span></span></React.Fragment>)}</div></div>)}
        <div className="text-[12px] text-ink3 mt-2">Escalates when nobody acknowledges in time; the incident is raised in ServiceNow by OpsRamp with the correlated alerts attached.</div></Card>
      <Card title="Maintenance windows">
        <div className="divide-y divide-line/70">{[...s.changes.filter(c => /Scheduled|Approved/.test(c.state)).slice(0, 4).map(c => [c.id, c.title, c.window]), ['STORE-CLOSED', 'Store closed-hours work (templates, backups)', 'Nightly 00:00–04:00 local'], ['CARRIER', 'Carrier planned works from the carrier portals', 'As notified']].map(([a, b, w]) => <div key={a} className="flex gap-2 py-1.5 text-[12.5px]"><span className="font-mono text-ink3 w-[110px] shrink-0 text-[11.5px]">{a}</span><span className="flex-1 text-ink">{b}</span><span className="text-ink3 shrink-0">{w}</span></div>)}</div>
        <div className="text-[12px] text-ink3 mt-2">Alarms from devices in scope are held during the window and checked again 15 minutes after it closes.</div></Card>
    </div>
  </>);
}

function Access() {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-3 items-stretch [&>*]:h-full">
      <Card title="Credentials and access to devices" sub="Credential sets attached to resource groups; least privilege, rotated on schedule">
        <div className="overflow-x-auto"><table className="w-full text-[12.5px]"><thead><tr className="border-b border-line"><Th>Access</Th><Th>How</Th><Th>Who or what</Th><Th>Rotated</Th></tr></thead>
          <tbody>{ACCESS.map(a => <tr key={a.k} className="border-b border-line/60 last:border-0 align-top"><td className="py-1.5 pr-3 font-semibold text-ink whitespace-nowrap">{a.k}</td><td className="py-1.5 pr-3 text-ink2">{a.what}</td><td className="py-1.5 pr-3 text-ink2">{a.who}</td><td className="py-1.5 text-ink3 whitespace-nowrap">{a.rotate}</td></tr>)}</tbody></table></div>
      </Card>
      <Card title="Who can do what in OpsRamp" sub="Role-based access, signed in with SSO">
        <div className="divide-y divide-line/70">{ROLES.map(r => <div key={r.r} className="py-2 text-[12.5px]"><b className="text-ink">{r.r}</b><div className="text-ink2">{r.can}</div></div>)}</div>
        <div className="text-[12px] text-ink3 mt-2">Every action, by a person or a runbook, is in the audit log.</div>
      </Card>
    </div>
  );
}

function Network() {
  const { act } = useApp();
  return (<>
    <Card title="Network policies" sub="What the network enforces, where it is enforced, and the template it comes from" className="mb-3">
      <div className="overflow-x-auto"><table className="w-full text-[12.5px]"><thead><tr className="border-b border-line"><Th>Area</Th><Th>Policy</Th><Th>Enforced in</Th><Th>Template (Network-as-Code)</Th></tr></thead>
        <tbody>{NET_POLICIES.map(p => <tr key={p.area} className="border-b border-line/60 last:border-0 align-top"><td className="py-1.5 pr-3 font-semibold text-ink whitespace-nowrap">{p.area}</td><td className="py-1.5 pr-3 text-ink2">{p.rule}</td><td className="py-1.5 pr-3 text-ink2 whitespace-nowrap">{p.where}</td><td className="py-1.5 font-mono text-[11.5px] text-ink3">{p.file}</td></tr>)}</tbody></table></div>
    </Card>
    <Card title="Golden configurations and compliance" sub="Running configs checked against the template every night">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{CONFIGS.map(c => { const T = TEMPLATES.find(t => t.id === c.tpl); return (
        <div key={c.tpl} className="border border-line rounded-lg p-3 flex flex-col">
          <div className="flex items-center gap-2"><b className="text-[13.5px] text-ink flex-1">{c.label || T.name}</b><span className="font-mono text-[11px] text-ink3">{c.ver}</span></div>
          <div className="font-mono text-[11.5px] text-ink3">{c.file}</div>
          <div className="grid grid-cols-3 gap-2 mt-2 text-[12px]">{[['Devices', num(c.n), 'text-ink'], ['Config compliant', pct(c.compliant, 1), c.drift.length ? 'text-warn' : 'text-ok'], ['On target firmware', pct(c.onTarget / Math.max(1, c.n), 0), c.onTarget / Math.max(1, c.n) > 0.9 ? 'text-ok' : 'text-warn']].map(([k, v, tc]) => <div key={k} className="border border-line rounded px-2 py-1"><div className="text-ink3 text-[11px]">{k}</div><b className={cx('tabular-nums', tc)}>{v}</b></div>)}</div>
          <div className="text-[11.5px] text-ink3 mt-1">Target release {c.target}</div>
          <div className="flex flex-wrap gap-1 mt-2">{c.checks.map(k => <span key={k} className="text-[11px] border border-line rounded px-1.5 py-0.5 text-ink2">{k}</span>)}</div>
          {c.drift.length > 0 && <div className="mt-2 text-[12px]"><div className="text-[11px] font-bold uppercase text-ink3 mb-0.5">Differs from golden</div>{c.drift.map(d => <button key={d.device + d.item} onClick={() => act.drill({ t: 'device', id: d.device })} className="w-full text-left flex gap-2 py-0.5 hover:underline"><span className="font-mono text-ink">{d.device}</span><span className="text-ink2 truncate">{d.item}</span></button>)}</div>}
        </div>); })}</div>
    </Card>
  </>);
}

function NewVendor({ pilots }) {
  const { act } = useApp();
  const [v, setV] = useState(VENDORS[0].id);
  const x = VENDORS.find(y => y.id === v), like = TEMPLATES.find(t => t.id === x.like);
  const started = pilots.some(p => p.vendor === x.id);
  const st = k => k === 'auto' ? ['Automatic', 'green'] : k === 'like' ? [like ? `Inherited from ${like.id}` : 'Set for the new class', like ? 'green' : 'amber'] : k === 'lib' ? ['Ready in the OpsRamp library', 'green'] : k === 'access' ? ['Configure', 'amber'] : k === 'map' ? ['Mapping on the left', 'blue'] : ['SRS and Movate decide', 'amber'];
  const pilot = () => { act.set(s => ({ pilotTemplates: [...(s.pilotTemplates || []), { id: `TPL-${x.id.toUpperCase()}`, name: x.name, cls: x.cls, models: [x.name.split(' ').slice(-2).join(' ')], n: 0, pilot: true, vendor: x.id, like: x.like, how: [[x.access.split(' + ')[0], 'every 5 min'], ...(x.access.includes(' + ') ? [[x.access.split(' + ')[1], 'every 15 min']] : [])], metrics: x.map.map(m => m[0]), parent: like ? like.parent : 'EdgeConnect at the same store', snow: like ? like.snow : ['Network › Security', 'SRS Security Operations', 'Firewall (cmdb_ci_ip_firewall)'] }] })); act.audit(`Pilot onboarding started: ${x.name} (2 stores, Observed mode)`, x.id); act.toast(`${x.name}: pilot template created, 2 stores in Observed mode`); };
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-3 items-start">
      <div className="space-y-3">
      <Card title="Bring in a new make or model" sub="SRS runs HPE Aruba today; another vendor joins through the same framework">
        <div className="space-y-2">{VENDORS.map(y => <button key={y.id} onClick={() => setV(y.id)} className={cx('w-full text-left border rounded-lg p-3', y.id === v ? 'border-ink ring-1 ring-ink' : 'border-line hover:border-ink3')}>
          <div className="flex items-center gap-2"><b className="text-[13.5px] text-ink flex-1">{y.name}</b><Badge>{y.cls}</Badge></div>
          <div className="text-[12px] text-ink2 mt-0.5">{y.lib}</div>
          <div className="text-[11.5px] text-ink3">Access: {y.access}</div>
        </button>)}</div>
      </Card>
      <Card title={`Same metric names: SRS standard to ${x.name.split(' ').slice(0, 2).join(' ')}`}>
                <div className="overflow-x-auto"><table className="w-full text-[12.5px]"><thead><tr className="border-b border-line"><Th>SRS standard metric</Th><Th>Where it comes from</Th></tr></thead>
          <tbody>{x.map.map(([a, b]) => <tr key={a} className="border-b border-line/60 last:border-0"><td className="py-1 pr-3 text-ink">{a}</td><td className="py-1 font-mono text-[11.5px] text-ink2">{b}</td></tr>)}</tbody></table></div>
        <div className="text-[12px] text-ink2 mt-2">{like ? `Because the metric names match ${like.name}, the dashboards, SLAs, correlation and auto-ticketing work for the new devices without change.` : 'A new class: thresholds, a parent link and a ServiceNow CI class are set once for it; the rest of the console works unchanged.'}</div>
      </Card>
      </div>
      <Card title={`Onboarding ${x.name}`} right={started ? <Badge tone="amber">pilot running</Badge> : <Btn op size="sm" kind="brand" icon={I.Rocket} onClick={pilot}>Start a pilot (2 stores)</Btn>}>
        <ol className="space-y-1.5">{ONBOARD.map(([n, d, k], i) => { const [lab, tone] = st(k); return <li key={n} className="flex gap-2.5 text-[12.5px] border-b border-line/60 pb-1.5 last:border-0"><span className="w-6 h-6 rounded-full bg-brand/10 text-brand text-[11.5px] font-bold grid place-items-center shrink-0">{i + 1}</span><span className="flex-1"><b className="text-ink">{n}.</b> <span className="text-ink2">{d}</span></span><Badge tone={tone}>{lab}</Badge></li>; })}</ol>
      </Card>
    </div>
  );
}
