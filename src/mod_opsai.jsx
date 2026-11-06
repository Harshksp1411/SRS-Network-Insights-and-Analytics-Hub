// OpsRamp AI and integrations: where the machine learning sits in the event pipeline, how many alerts it turns
// into how few incidents (with each step switchable to see what the NOC would get without it), how correlation
// uses topology, attributes, learned sequences and time, how anomaly detection works, how each SRS source connects,
// and how incidents and the CMDB flow to and from ServiceNow.
import React, { useState } from 'react';
import * as I from 'lucide-react';
import { useApp } from './store.jsx';
import { useLive } from './live.jsx';
import { Card, Badge, PageHead, Stat, Tabs, cx } from './ui.jsx';
import { todayCounts } from './viz2.jsx';
import { AnomaliesCard, anomaliesOf } from './patterns.jsx';
import { ServiceNowSyncCard } from './stormui.jsx';
import { num } from './util.js';

const KIND = { ml: ['Machine learning', 'bg-ai/10 text-ai border-ai/30'], topo: ['Topology', 'bg-info/10 text-info border-info/30'], rule: ['Rules', 'bg-chip text-ink2 border-line'], agent: ['Mova iO agents', 'bg-brand/10 text-brand border-brand/30'] };
const Tag = ({ k }) => <span className={cx('text-[10.5px] font-bold px-1.5 py-[1px] rounded border whitespace-nowrap', KIND[k][1])}>{KIND[k][0]}</span>;
const Th = ({ children, r }) => <th className={cx('py-1.5 pr-3 font-semibold text-ink3 text-[11.5px]', r ? 'text-right' : 'text-left')}>{children}</th>;

// ---------- where the AI works ----------
function Pipeline({ tc, nAnom }) {
  const dedup = Math.round(tc.suppressed * 0.55), fr = tc.suppressed - dedup;
  const stages = [
    ['Collect', ['rule'], 'NextGen gateway, APIs, SNMPv3, syslog and webhooks from every source', `${num(tc.events)} events in`],
    ['Spot anomalies', ['ml'], 'Learned normal for every line and device; forecasts and change detection', `${nAnom} drifting now`],
    ['Deduplicate', ['rule'], 'A repeat of an open alert is added to it, not raised again', `${num(dedup)} repeats folded`],
    ['First response', ['ml', 'rule'], 'Known noise suppressed: user rules, a training file of SRS history, learned periodic patterns', `${num(fr)} suppressed`],
    ['Correlate', ['ml', 'topo'], 'Topology, carrier and location, learned alert sequences, time window', `${num(tc.raw)} alerts → ${num(tc.inc)} incidents`],
    ['Diagnose and act', ['agent'], 'Root cause, the approved runbook, verification', `${num(tc.autoRes || 0)} fixed with no human touch`],
    ['ServiceNow', ['rule'], 'One incident per correlated group; updates both ways', `${num(tc.inc)} tickets`],
  ];
  return (
    <Card title="Where the AI works, today" right={<Badge tone="blue">HPE OpsRamp</Badge>}>
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2">{stages.map(([n, ks, d, v], i) => (
        <div key={n} className={cx('rounded-lg border p-2.5 flex flex-col', ks.includes('ml') ? 'border-ai/40 bg-ai/[0.04]' : 'border-line')}>
          <div className="flex items-center gap-1.5"><span className="w-5 h-5 rounded-full bg-ink text-white text-[11px] font-bold grid place-items-center shrink-0">{i + 1}</span><b className="text-[13px] text-ink">{n}</b></div>
          <div className="flex flex-wrap gap-1 mt-1.5">{ks.map(k => <Tag key={k} k={k} />)}</div>
          <div className="text-[11.5px] text-ink2 mt-1.5 flex-1">{d}</div>
          <div className="text-[12.5px] font-bold text-ink mt-2 tabular-nums">{v}</div>
        </div>))}</div>
    </Card>
  );
}

const SCEN = {
  busy: { label: 'Busy hour across the estate', n: [1184, 512, 236, 41, 12, 5], note: 'Monday 07:00–08:00 CT, all regions opening' },
  dark: { label: 'A branch goes dark (fibre cut)', n: [62, 24, 19, 2, 2, 1], note: 'Everything behind the SD-WAN appliance alarms at once' },
  region: { label: 'Regional carrier outage, 23 branches', n: [214, 96, 71, 23, 1, 1], note: 'One AT&T central office, 23 branches on backup' },
  fw: { label: 'Firmware wave: APs rebooting at 6 stores', n: [96, 58, 31, 6, 6, 1], note: 'Same model and release, six different carriers' },
};
const STEPS = [['dedup', 'Deduplication', 'rule'], ['fr', 'First response (suppression)', 'ml'], ['topo', 'Topology', 'topo'], ['attr', 'Carrier and location', 'ml'], ['ml', 'Learned alert sequences', 'ml']];
function BeforeAfter() {
  const [sc, setSc] = useState('busy');
  const [on, setOn] = useState({ dedup: true, fr: true, topo: true, attr: true, ml: true });
  const S = SCEN[sc];
  const counts = [S.n[0]];
  STEPS.forEach(([k], i) => { const r = S.n[i + 1] / S.n[i]; counts.push(Math.max(1, Math.round(counts[i] * (on[k] ? r : 1)))); });
  const without = S.n[0], withAI = counts[counts.length - 1], max = S.n[0];
  return (
    <Card title="Before and after the AI" right={<div className="flex rounded-md border border-line overflow-hidden text-[12px]">{Object.entries(SCEN).map(([k, v]) => <button key={k} onClick={() => setSc(k)} className={cx('px-2.5 py-1', sc === k ? 'bg-ink text-white' : 'text-ink2 hover:bg-chip')}>{v.label.split(':')[0].split(' (')[0]}</button>)}</div>}>
      <div className="text-[12px] text-ink3 mb-3">{S.label}: {S.note}. Switch a step off to see what reaches the NOC without it.</div>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-5 items-center">
        <div className="space-y-1.5">
          <div className="flex items-center gap-3 text-[12.5px]"><span className="w-56 shrink-0 text-ink">Events in</span><div className="flex-1 h-5 bg-chip rounded"><div className="h-5 rounded bg-ink3" style={{ width: '100%' }} /></div><b className="w-14 text-right tabular-nums">{num(S.n[0])}</b></div>
          {STEPS.map(([k, l, kind], i) => (
            <div key={k} className="flex items-center gap-3 text-[12.5px]">
              <label className="w-56 shrink-0 flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={on[k]} onChange={() => setOn(o => ({ ...o, [k]: !o[k] }))} className="accent-[rgb(var(--brand))]" /><span className={on[k] ? 'text-ink' : 'text-ink3 line-through'}>{l}</span><Tag k={kind} /></label>
              <div className="flex-1 h-5 bg-chip rounded"><div className={cx('h-5 rounded transition-all', kind === 'rule' ? 'bg-ink2' : kind === 'topo' ? 'bg-info' : 'bg-ai')} style={{ width: `${Math.max(0.6, counts[i + 1] / max * 100)}%` }} /></div>
              <b className="w-14 text-right tabular-nums">{num(counts[i + 1])}</b>
            </div>))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-line p-3"><div className="text-[12px] text-ink3">Without OpsRamp AI</div><div className="text-[28px] font-bold text-bad tabular-nums leading-tight">{num(without)}</div><div className="text-[12px] text-ink2">tickets or alerts for a person to read</div></div>
          <div className="rounded-lg border border-ok/40 bg-ok/5 p-3"><div className="text-[12px] text-ink3">With the steps switched on</div><div className="text-[28px] font-bold text-ok tabular-nums leading-tight">{num(withAI)}</div><div className="text-[12px] text-ink2">incident{withAI === 1 ? '' : 's'} in ServiceNow</div></div>
          <div className="col-span-2 rounded-lg bg-chip px-3 py-2 text-[12.5px] text-ink"><b>{(() => { const r = (1 - withAI / without) * 100; return r > 99 ? r.toFixed(1) : Math.round(r); })()}% fewer</b> things to look at; at 4 minutes of triage each that is <b>{Math.round((without - withAI) * 4 / 60)} hours</b> of NOC time saved in this example.</div>
        </div>
      </div>
    </Card>
  );
}

// ---------- correlation and topology ----------
function Methods({ open }) {
  const M = [
    ['Topology', 'topo', I.Network, 0.42, 'Relationships OpsRamp discovers (LLDP/CDP, ARP, the SD-WAN overlay): circuit → SD-WAN appliance → switches → access points and tills. When a parent is down, its children are grouped under its alert.', 'CP-01'],
    ['Carrier and location', 'ml', I.MapPin, 0.18, 'Clustering on attributes, no topology needed: same carrier segment, central office, region or storm area.', 'CP-02'],
    ['Learned alert sequences', 'ml', I.Sparkles, 0.1, 'Machine learning finds sequences that keep happening together in SRS history (co-occurrence), keeps learning from new data, and is site and region aware.', 'CP-03'],
    ['Time window', 'rule', I.Clock, 0.22, 'Fixed windows when nothing else applies: same branch inside 10 minutes; same carrier and region inside 15.', null],
    ['Change', 'rule', I.GitPullRequest, 0.08, 'A change on a related device in the previous 60 minutes is linked to the incident.', null],
  ];
  return (
    <Card title="How alerts are grouped" sub="Share of today's correlation groups by method">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">{M.map(([n, k, Ic, f, d, p]) => (
        <div key={n} className="border border-line rounded-lg p-3 flex flex-col">
          <div className="flex items-center gap-2"><Ic size={15} className="text-brand" /><b className="text-ink text-[13px] flex-1">{n}</b><span className="text-[18px] font-bold text-ink tabular-nums">{Math.round(f * 100)}%</span></div>
          <div className="mt-1"><Tag k={k} />{p && <span className="ml-1.5 text-[10.5px] font-mono text-ink3">{p}</span>}</div>
          <div className="text-[12px] text-ink2 mt-1.5">{d}</div>
        </div>))}</div>
    </Card>
  );
}

function TopologyCard() {
  const chain = [['Carrier circuit', 'AT&T DIA wan1', 'bad', 'Loss 100%'], ['SD-WAN appliance', 'EdgeConnect ec01', 'warn', 'Tunnel down'], ['Core switch', 'CX 6300 sw01', 'warn', 'Uplink flap'], ['Access switches', 'sw02, sw03', 'warn', '6 port alarms'], ['Access points and tills', '4 APs, 3 POS', 'warn', '11 down alarms'], ['Applications', 'ERP, card payments', 'warn', 'Slow, from New Relic']];
  return (
    <Card title="Topology at one branch" sub="One fault, many alarms, one inference">
      <div className="flex flex-col md:flex-row md:items-stretch gap-1.5">{chain.map(([n, d, st, a], i) => <React.Fragment key={n}>
        {i > 0 && <div className="hidden md:flex items-center text-ink3"><I.ChevronRight size={16} /></div>}
        <div className={cx('flex-1 rounded-lg border p-2.5', st === 'bad' ? 'border-bad/50 bg-bad/5' : 'border-line bg-chip/50')}>
          <div className="text-[10.5px] font-bold uppercase text-ink3">{i === 0 ? 'Parent: root cause' : 'Child: grouped'}</div>
          <b className="text-[12.5px] text-ink block">{n}</b><div className="text-[11.5px] text-ink2">{d}</div>
          <div className={cx('text-[11.5px] font-semibold mt-1', st === 'bad' ? 'text-bad' : 'text-warn')}>{a}</div>
        </div></React.Fragment>)}</div>
      <div className="mt-3 rounded-lg border border-ai/40 bg-ai/[0.04] px-3 py-2 text-[12.5px] text-ink flex gap-2"><I.GitMerge size={15} className="text-ai mt-0.5 shrink-0" /><span><b>One inference:</b> 62 events → 1 incident on the circuit, with the 61 child alarms attached as evidence. ServiceNow gets one ticket on the right CI, assigned to carrier management.</span></div>
    </Card>
  );
}

const SEQ = [
  ['wan1 loss above 2% → BFD flap → ERP slower than 1.5 s, same store', 214, '40 s', 0.93, 'CP-03'],
  ['Primary down at 3 or more branches, same carrier and region, within 15 min', 61, '4 min', 0.96, 'CP-02'],
  ['PoE budget above 90% → access point reboots, same switch', 77, '3 min', 0.84, 'CP-03'],
  ['Config backup failures → TACACS+ timeouts, same region and hour', 46, '1 min', 0.88, 'CP-02'],
  ['Storm warning → power-loss traps → branches unreachable, same area', 12, '20 min', 0.71, 'CP-02'],
];
function LearnedCard() {
  const { s } = useApp(); const modes = s.catModes || {};
  const M = { 'CP-01': 'On', 'CP-02': 'Recommend', 'CP-03': 'Observed' };
  const T = { Off: 'gray', Observed: 'blue', Recommend: 'amber', On: 'green' };
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-3 items-stretch [&>*]:h-full">
      <Card title="Alert sequences the model has learned" sub="From 12 months of SRS history, still learning">
        <div className="overflow-x-auto"><table className="w-full text-[12.5px]"><thead><tr className="border-b border-line"><Th>Sequence</Th><Th r>Seen, 90 days</Th><Th r>Typical gap</Th><Th r>Confidence</Th><Th>Policy</Th></tr></thead>
          <tbody>{SEQ.map(([q, n, g, c, p]) => <tr key={q} className="border-b border-line/60 last:border-0"><td className="py-1.5 pr-3 text-ink">{q}</td><td className="py-1.5 pr-3 text-right tabular-nums">{n}</td><td className="py-1.5 pr-3 text-right">{g}</td><td className="py-1.5 pr-3 text-right font-semibold tabular-nums">{Math.round(c * 100)}%</td><td className="py-1.5 whitespace-nowrap"><span className="font-mono text-[11px] text-ink3 mr-1">{p}</span><Badge tone={T[modes[p] || M[p]]}>{modes[p] || M[p]}</Badge></td></tr>)}</tbody></table></div>
      </Card>
      <Card title="How a correlation policy earns trust">
        <ol className="space-y-2">{[['Observed', 'blue', 'Runs in the shadow: it records the groups it would have made, and they are compared with how engineers grouped the same alerts.'], ['Recommend', 'amber', 'Suggests the grouping on the incident; an engineer accepts or rejects it, and that feedback trains the model.'], ['On', 'green', 'Groups automatically. It keeps learning from new data; it can be moved back at any time in the AI & Automation Catalogue.']].map(([m, t, d], i) => <li key={m} className="flex gap-2.5 text-[12.5px]"><span className="w-6 h-6 rounded-full bg-ink text-white text-[11.5px] font-bold grid place-items-center shrink-0">{i + 1}</span><span><Badge tone={t}>{m}</Badge> <span className="text-ink2">{d}</span></span></li>)}</ol>
        <div className="mt-3 text-[12px] text-ink2 border-t border-line pt-2">A policy is used once it shows <b className="text-ink">Ready</b>: enough history to learn from. Filtering too much before correlation stops related alerts being grouped, so filters stay narrow.</div>
      </Card>
    </div>
  );
}

// ---------- anomaly detection ----------
function AnomalyModels({ n, ex }) {
  const M = [
    ['Learned normal', I.Activity, 'A baseline for every line and device metric by hour of the week. Flags a drift away from normal while the reading is still under the fixed limit.', `${n} lines drifting now`, 'Latency, jitter, loss, CPU, Wi-Fi airtime'],
    ['Forecast', I.TrendingUp, 'Projects the trend forward and alerts before a limit is reached, with the days left.', '4 capacity forecasts open', 'Line use at peak, PoE budget, address pools'],
    ['Change detection', I.GitCompare, 'Spots a step change after a change, a firmware wave or a carrier event, and links it to the change.', 'Used on every change window', 'Firmware waves, policy changes'],
    ['Learned patterns', I.CalendarClock, 'Learns what repeats on a schedule and is harmless, so first response can suppress it.', 'FR-02 on: nightly backup spikes', 'Backups, store opening and closing'],
  ];
  return (
    <Card title="How OpsRamp finds anomalies" sub="Finding problems before a fixed threshold would">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">{M.map(([t, Ic, d, v, u]) => <div key={t} className="border border-ai/30 bg-ai/[0.03] rounded-lg p-3 flex flex-col"><div className="flex items-center gap-2"><Ic size={15} className="text-ai" /><b className="text-[13px] text-ink">{t}</b></div><div className="text-[12px] text-ink2 mt-1.5 flex-1">{d}</div><div className="text-[12.5px] font-bold text-ink mt-2">{v}</div><div className="text-[11px] text-ink3">{u}</div></div>)}</div>
      <div className="mt-3 rounded-lg bg-chip px-3 py-2 text-[12.5px] text-ink flex gap-2"><I.Lightbulb size={15} className="text-warn mt-0.5 shrink-0" /><span>{ex ? `${ex.b.name.replace(/ – .*/, '')} (${ex.b.city}) normally runs at ${Math.round(ex.normal)} ms and now runs at ${Math.round(ex.now)} ms. A 100 ms threshold raises nothing; the learned normal flags it today${ex.eta ? `, about ${ex.eta} days before it would breach` : ''}.` : 'A line drifting from its own normal is flagged while it is still under the fixed limit, days before it would breach.'}</span></div>
    </Card>
  );
}

// ---------- sources and integration ----------
const SOURCES = [
  ['HPE Aruba EdgeConnect Orchestrator', 'Tunnel and path statistics, alarms, business intent', 'REST API polled by the gateway; alarms pushed by the Orchestrator notification service (HTTPS) to an OpsRamp webhook', 'Medium', 0.31],
  ['HPE Aruba Central', 'Access points and switches, clients, Wi-Fi health, webhooks', 'Aruba Central API and webhooks; OpsRamp is built into Central for other vendors', 'Low', 0.24],
  ['Aruba CX and 2530 switches', 'Health, interfaces, PoE, traps and syslog', 'NextGen gateway over SNMPv3; AOS-CX REST for CX', 'Low', 0.17],
  ['ISP circuits (Simplify access-link feed)', 'Line up and down, carrier tickets', 'Token-based webhook into OpsRamp', 'Low', 0.08],
  ['Carrier portals', 'Case updates and restore times', 'REST or email-to-event, per carrier', 'Medium', 0.02],
  ['New Relic', 'Application response, errors', 'Out-of-the-box integration with default attributes', 'Low', 0.1],
  ['Synthetic tests', 'Card payment path, ERP, cloud apps', 'OpsRamp synthetic monitors from each branch', 'Low', 0.06],
  ['Microsoft Azure', 'Cloud applications SRS runs', 'Native cloud integration', 'Low', 0.02],
  ['ServiceNow', 'Incidents and the CMDB', 'Certified ServiceNow Store app, OAuth 2.0, both ways', 'Medium', 0],
  ['Microsoft Teams and email', 'Notifications to StoreOps and engineers', 'Outbound integration', 'Low', 0],
];
function Integration({ tc }) {
  const steps = [['Install the NextGen gateway', 'One per data centre: OVA or ISO, or on Kubernetes with zero-touch onboarding. It keeps 24 hours of alerts if the link drops.', '2 hours'], ['Add credentials', 'SNMPv3 and API keys, attached to resource groups with least privilege.', '1 hour'], ['Discover', 'Discovery profiles find devices and their relationships over SNMP and the vendor APIs.', 'Overnight, automatic'], ['Assign templates', 'Template-based alert definitions give each device its metrics and levels by type and store group.', 'Automatic'], ['Connect event sources', 'In Integrations: add the tool, copy the webhook URL and token, map its fields to alerts, check the inbound log.', '30 minutes per tool'], ['Connect ServiceNow', 'Install the certified app and authorise with OAuth 2.0 from the OpsRamp screen.', 'Half a day with the SRS ServiceNow admin']];
  return (<>
    <Card title="How easy it is to connect a source" className="mb-3">
      <ol className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-2">{steps.map(([t, d, h], i) => <li key={t} className="border border-line rounded-lg p-3 flex flex-col"><div className="flex items-center gap-1.5"><span className="w-5 h-5 rounded-full bg-brand text-white text-[11px] font-bold grid place-items-center shrink-0">{i + 1}</span><b className="text-[12.5px] text-ink">{t}</b></div><div className="text-[11.5px] text-ink2 mt-1.5 flex-1">{d}</div><div className="text-[12px] font-bold text-ink mt-2">{h}</div></li>)}</ol>
      <div className="mt-3 text-[12px] text-ink2">Anything with a REST API can be added as a custom integration, and SDK apps cover custom discovery and monitoring. OpsRamp lists more than 2,500 integrations out of the box.</div>
    </Card>
    <Card title="SRS sources" sub={`${SOURCES.length} connected, ${num(tc.events)} events in today`}>
      <div className="overflow-x-auto"><table className="w-full text-[12.5px]"><thead><tr className="border-b border-line"><Th>Source</Th><Th>What comes in</Th><Th>How it connects</Th><Th>Effort</Th><Th r>Events today</Th></tr></thead>
        <tbody>{SOURCES.map(([n, w, h, e, f]) => <tr key={n} className="border-b border-line/60 last:border-0 align-top"><td className="py-1.5 pr-3 font-semibold text-ink"><span className="inline-flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-ok" />{n}</span></td><td className="py-1.5 pr-3 text-ink2">{w}</td><td className="py-1.5 pr-3 text-ink2">{h}</td><td className="py-1.5 pr-3"><Badge tone={e === 'Low' ? 'green' : 'amber'}>{e}</Badge></td><td className="py-1.5 text-right tabular-nums">{f ? num(Math.round(tc.events * f)) : '—'}</td></tr>)}</tbody></table></div>
    </Card>
  </>);
}

// ---------- ServiceNow ----------
function SNow() {
  const map = [['Correlated group (inference) subject', 'Short description'], ['Priority from impact and branch hours (P1–P4)', 'Priority, impact and urgency'], ['Resource the root cause sits on', 'Configuration item (cmdb_ci)'], ['Assignment group from the monitoring template', 'Assignment group'], ['Alerts correlated into the group', 'Work notes on the same ticket, no new ticket'], ['Root cause and confidence from Mova iO', 'Description'], ['Branch', 'Location'], ['State', 'State, both ways'], ['Close code', 'Resolution code, both ways']];
  const flow = [['Alert group formed', 'OpsRamp'], ['Incident created', 'ServiceNow'], ['Assigned and worked', 'Both ways'], ['More alerts attached', 'Work notes'], ['Resolved in either', 'Closes in both']];
  return (<>
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 mb-3 items-stretch [&>*]:h-full">
      <Card title="Incidents: both ways">
        <div className="flex flex-wrap items-center gap-1.5">{flow.map(([a, b], i) => <React.Fragment key={a}>{i > 0 && <I.ArrowRight size={14} className="text-ink3" />}<span className="rounded-md border border-line px-2 py-1 text-[12px]"><b className="text-ink">{a}</b><span className="text-ink3"> · {b}</span></span></React.Fragment>)}</div>
        <ul className="mt-3 space-y-1.5 text-[12.5px] text-ink">{['One ticket per correlated group, on the right CI and assignment group.', 'State, assignment and work notes stay in step in both directions.', 'Closing the incident in either system closes it in the other.', 'Certified ServiceNow Store app, authorised with OAuth 2.0; the integration user has the ITIL role.'].map(t => <li key={t} className="flex gap-1.5"><I.Check size={14} className="text-ok mt-[2px] shrink-0" />{t}</li>)}</ul>
      </Card>
      <Card title="CMDB">
        <ul className="space-y-1.5 text-[12.5px] text-ink">{['Devices and circuits OpsRamp discovers are pushed into the ServiceNow CMDB with their CI class from the monitoring template.', 'Relationships (which switch sits behind which SD-WAN appliance) stay in OpsRamp topology, which is what correlation uses; every incident carries the CI it is about.', 'The nightly reconciliation in Device & Circuit Inventory flags anything found on the network but missing from the CMDB.'].map(t => <li key={t} className="flex gap-1.5"><I.Database size={14} className="text-info mt-[2px] shrink-0" />{t}</li>)}</ul>
      </Card>
    </div>
    <Card title="Field mapping, OpsRamp to ServiceNow" className="mb-3">
      <div className="overflow-x-auto"><table className="w-full text-[12.5px]"><thead><tr className="border-b border-line"><Th>OpsRamp</Th><Th>ServiceNow</Th></tr></thead><tbody>{map.map(([a, b]) => <tr key={a} className="border-b border-line/60 last:border-0"><td className="py-1.5 pr-3 text-ink">{a}</td><td className="py-1.5 text-ink2">{b}</td></tr>)}</tbody></table></div>
    </Card>
    <ServiceNowSyncCard />
  </>);
}

export function OpsAI() {
  const { s, act } = useApp(); const { L } = useLive();
  const tc = todayCounts(L, s);
  const anom = anomaliesOf(), nAnom = anom.length, ex = anom.find(a => a.metric === 'lat');
  const tab = s.tab.opsai || 'where', setTab = t => act.setTab('opsai', t);
  return (
    <div>
      <PageHead icon={I.BrainCircuit} title="OpsRamp AI & Integrations" right={<Badge tone="blue">HPE OpsRamp</Badge>} />
      <div className="kpi-strip grid grid-cols-2 lg:grid-cols-5 mb-3">
        <Stat label="Events in today" icon={I.Bell} value={num(tc.events)} sub="from every source" onClick={() => setTab('sources')} />
        <Stat label="Removed by the AI" icon={I.Filter} value={`${Math.round(tc.noise * 100)}%`} tone="green" sub="repeats and known noise" onClick={() => setTab('where')} />
        <Stat label="Incidents today" icon={I.Ticket} value={num(tc.inc)} sub={`${num(Math.round(tc.events / Math.max(1, tc.inc)))} events per incident`} onClick={() => setTab('correlation')} />
        <Stat label="Lines drifting from normal" icon={I.Activity} value={nAnom} tone={nAnom ? 'amber' : 'green'} sub="still under the limit" onClick={() => setTab('anomaly')} />
        <Stat label="Sources connected" icon={I.Plug} value={SOURCES.length} sub="ServiceNow both ways" onClick={() => setTab('servicenow')} />
      </div>
      <Tabs value={tab} onChange={setTab} className="mb-3" tabs={[{ id: 'where', label: 'Where the AI works' }, { id: 'correlation', label: 'Correlation and topology' }, { id: 'anomaly', label: 'Anomaly detection' }, { id: 'sources', label: 'Sources and integration' }, { id: 'servicenow', label: 'ServiceNow' }]} />
      {tab === 'where' && <><Pipeline tc={tc} nAnom={nAnom} /><div className="mt-3"><BeforeAfter /></div></>}
      {tab === 'correlation' && <><Methods /><div className="mt-3"><TopologyCard /></div><div className="mt-3"><LearnedCard /></div></>}
      {tab === 'anomaly' && <><AnomalyModels n={nAnom} ex={ex} /><div className="mt-3"><AnomaliesCard /></div></>}
      {tab === 'sources' && <Integration tc={tc} />}
      {tab === 'servicenow' && <SNow />}
    </div>
  );
}
