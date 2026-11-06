// OpsRamp AI and integrations: where the machine learning sits in the event pipeline, how many alerts it turns
// into how few incidents (with each step switchable to see what the NOC would get without it), how correlation
// uses topology, attributes, learned sequences and time, how anomaly detection works, how each SRS source connects,
// and how incidents and the CMDB flow to and from ServiceNow.
import React, { useState, useEffect } from 'react';
import * as I from 'lucide-react';
import { useApp } from './store.jsx';
import { useLive } from './live.jsx';
import { Card, Badge, cx } from './ui.jsx';
import { todayCounts } from './viz2.jsx';
import { AnomaliesCard, anomaliesOf } from './patterns.jsx';
import { ServiceNowSyncCard } from './stormui.jsx';
import { IntegrationStudio } from './studio.jsx';
import { TicketSimulator } from './snowsim.jsx';
import { DeviceOnboarding } from './onboard.jsx';
import { num } from './util.js';

const KIND = { ml: ['Machine learning', 'bg-ai/10 text-ai border-ai/30'], topo: ['Topology', 'bg-info/10 text-info border-info/30'], rule: ['Rules', 'bg-chip text-ink2 border-line'], agent: ['Mova iO agents', 'bg-brand/10 text-brand border-brand/30'] };
const Tag = ({ k }) => <span className={cx('text-[10.5px] font-bold px-1.5 py-[1px] rounded border whitespace-nowrap', KIND[k][1])}>{KIND[k][0]}</span>;
const Th = ({ children, r }) => <th className={cx('py-1.5 pr-3 font-semibold text-ink3 text-[11.5px]', r ? 'text-right' : 'text-left')}>{children}</th>;

// ---------- where the AI works ----------
function Pipeline({ tc, nAnom }) {
  const dedup = Math.round(tc.suppressed * 0.55), fr = tc.suppressed - dedup;
  const stages = [
    ['Collect', ['rule'], num(tc.events), 'events in', I.Download],
    ['Spot anomalies', ['ml'], nAnom, 'lines drifting', I.Activity],
    ['Deduplicate', ['rule'], num(dedup), 'repeats folded', I.Copy],
    ['First response', ['ml', 'rule'], num(fr), 'suppressed', I.Filter],
    ['Correlate', ['ml', 'topo'], `${num(tc.raw)} → ${num(tc.inc)}`, 'alerts → incidents', I.GitMerge],
    ['Diagnose and act', ['agent'], num(tc.autoRes || 0), 'fixed, no human touch', I.Wand2],
    ['ServiceNow', ['rule'], num(tc.inc), 'tickets', I.Ticket],
  ];
  return (
    <Card title="Where the AI works, today" right={<Badge tone="blue">HPE OpsRamp</Badge>}>
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2">{stages.map(([n, ks, v, u, Ic], i) => (
        <div key={n} className={cx('rounded-lg border p-2.5 flex flex-col relative', ks.includes('ml') ? 'border-ai/40 bg-ai/[0.04]' : 'border-line')}>
          <div className="flex items-center gap-1.5"><span className="w-5 h-5 rounded-full bg-ink text-white text-[11px] font-bold grid place-items-center shrink-0">{i + 1}</span><b className="text-[13px] text-ink">{n}</b><Ic size={14} className="ml-auto text-ink3" /></div>
          <div className="flex flex-wrap gap-1 mt-1.5">{ks.map(k => <Tag key={k} k={k} />)}</div>
          <div className="text-[20px] font-bold text-ink mt-3 tabular-nums leading-none">{v}</div>
          <div className="text-[11.5px] text-ink3 mt-0.5">{u}</div>
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
      <div className="text-[12px] text-ink3 mb-3">{S.note}</div>
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
          <div className="rounded-lg border border-line p-3"><div className="text-[12px] text-ink3">Without OpsRamp AI</div><div className="text-[28px] font-bold text-bad tabular-nums leading-tight">{num(without)}</div><div className="text-[12px] text-ink2">to read</div></div>
          <div className="rounded-lg border border-ok/40 bg-ok/5 p-3"><div className="text-[12px] text-ink3">With the steps switched on</div><div className="text-[28px] font-bold text-ok tabular-nums leading-tight">{num(withAI)}</div><div className="text-[12px] text-ink2">incident{withAI === 1 ? '' : 's'}</div></div>
          <div className="rounded-lg border border-line p-3"><div className="text-[12px] text-ink3">Fewer to look at</div><div className="text-[22px] font-bold text-ink tabular-nums leading-tight">{(() => { const r = (1 - withAI / without) * 100; return r > 99 ? r.toFixed(1) : Math.round(r); })()}%</div></div>
          <div className="rounded-lg border border-line p-3"><div className="text-[12px] text-ink3">NOC time saved</div><div className="text-[22px] font-bold text-ink tabular-nums leading-tight">{Math.round((without - withAI) * 4 / 60)} h</div><div className="text-[11px] text-ink3">at 4 min each</div></div>
        </div>
      </div>
    </Card>
  );
}

// ---------- correlation and topology ----------
function Methods() {
  const M = [
    ['Topology', 'topo', I.Network, 0.42, 'circuit → appliance → switch → AP', 'CP-01'],
    ['Carrier and location', 'ml', I.MapPin, 0.18, 'carrier · central office · region', 'CP-02'],
    ['Learned alert sequences', 'ml', I.Sparkles, 0.1, 'co-occurrence in SRS history', 'CP-03'],
    ['Time window', 'rule', I.Clock, 0.22, 'branch 10 min · region 15 min', null],
    ['Change', 'rule', I.GitPullRequest, 0.08, 'related change in 60 min', null],
  ];
  return (
    <Card title="How alerts are grouped today">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">{M.map(([n, k, Ic, f, d, p]) => (
        <div key={n} className="border border-line rounded-lg p-3 flex flex-col">
          <div className="flex items-center gap-2"><Ic size={15} className="text-brand" /><b className="text-ink text-[13px] flex-1">{n}</b></div>
          <div className="text-[26px] font-bold text-ink tabular-nums leading-tight mt-1">{Math.round(f * 100)}%</div>
          <div className="h-1.5 bg-chip rounded mt-1"><div className={cx('h-1.5 rounded', k === 'ml' ? 'bg-ai' : k === 'topo' ? 'bg-info' : 'bg-ink3')} style={{ width: `${f * 100 / 0.42}%` }} /></div>
          <div className="mt-2 flex items-center gap-1.5"><Tag k={k} />{p && <span className="text-[10.5px] font-mono text-ink3">{p}</span>}</div>
          <div className="text-[11.5px] text-ink3 mt-1.5">{d}</div>
        </div>))}</div>
    </Card>
  );
}

function TopologyCard() {
  const chain = [['Carrier circuit', 'AT&T DIA wan1', 'bad', 'Loss 100%'], ['SD-WAN appliance', 'EdgeConnect ec01', 'warn', 'Tunnel down'], ['Core switch', 'CX 6300 sw01', 'warn', 'Uplink flap'], ['Access switches', 'sw02, sw03', 'warn', '6 port alarms'], ['Access points and tills', '4 APs, 3 POS', 'warn', '11 down alarms'], ['Applications', 'ERP, card payments', 'warn', 'Slow, from New Relic']];
  return (
    <Card title="Topology at one branch">
      <div className="flex flex-col md:flex-row md:items-stretch gap-1.5">{chain.map(([n, d, st, a], i) => <React.Fragment key={n}>
        {i > 0 && <div className="hidden md:flex items-center text-ink3"><I.ChevronRight size={16} /></div>}
        <div className={cx('flex-1 rounded-lg border p-2.5', st === 'bad' ? 'border-bad/50 bg-bad/5' : 'border-line bg-chip/50')}>
          <div className="text-[10.5px] font-bold uppercase text-ink3">{i === 0 ? 'Root cause' : 'Grouped'}</div>
          <b className="text-[12.5px] text-ink block">{n}</b><div className="text-[11.5px] text-ink2">{d}</div>
          <div className={cx('text-[11.5px] font-semibold mt-1', st === 'bad' ? 'text-bad' : 'text-warn')}>{a}</div>
        </div></React.Fragment>)}</div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px]">{[['62', 'events'], ['1', 'incident on the circuit'], ['61', 'child alarms attached'], ['1', 'ServiceNow ticket']].map(([v, l], i) => <React.Fragment key={l}>{i > 0 && <I.ArrowRight size={14} className="text-ink3" />}<span className="rounded-md border border-ai/40 bg-ai/[0.05] px-2.5 py-1"><b className="text-ink tabular-nums">{v}</b> <span className="text-ink2">{l}</span></span></React.Fragment>)}</div>
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
      <Card title="Alert sequences the model has learned">
        <div className="overflow-x-auto"><table className="w-full text-[12.5px]"><thead><tr className="border-b border-line"><Th>Sequence</Th><Th r>Seen, 90 days</Th><Th r>Typical gap</Th><Th r>Confidence</Th><Th>Policy</Th></tr></thead>
          <tbody>{SEQ.map(([q, n, g, c, p]) => <tr key={q} className="border-b border-line/60 last:border-0"><td className="py-1.5 pr-3 text-ink">{q}</td><td className="py-1.5 pr-3 text-right tabular-nums">{n}</td><td className="py-1.5 pr-3 text-right">{g}</td><td className="py-1.5 pr-3 text-right font-semibold tabular-nums">{Math.round(c * 100)}%</td><td className="py-1.5 whitespace-nowrap"><span className="font-mono text-[11px] text-ink3 mr-1">{p}</span><Badge tone={T[modes[p] || M[p]]}>{modes[p] || M[p]}</Badge></td></tr>)}</tbody></table></div>
      </Card>
      <Card title="Correlation policy modes">
        <div className="flex items-stretch gap-1.5">{[['Observed', 'blue', 'shadow'], ['Recommend', 'amber', 'engineer accepts'], ['On', 'green', 'automatic']].map(([m, t, d], i) => { const ids = ['CP-01', 'CP-02', 'CP-03'].filter(p => (modes[p] || M[p]) === m); return <React.Fragment key={m}>{i > 0 && <div className="flex items-center text-ink3"><I.ChevronRight size={16} /></div>}<div className="flex-1 border border-line rounded-lg p-2.5 text-center"><Badge tone={t}>{m}</Badge><div className="text-[24px] font-bold text-ink tabular-nums mt-1">{ids.length}</div><div className="text-[11px] text-ink3">{d}</div><div className="flex flex-wrap justify-center gap-1 mt-1">{ids.map(p => <span key={p} className="font-mono text-[10.5px] text-ink2 border border-line rounded px-1">{p}</span>)}</div></div></React.Fragment>; })}</div>
        <div className="grid grid-cols-3 gap-2 mt-3 text-[12px]">{[['Learning from', '12 months'], ['Status', 'Ready'], ['Retrains', 'continuously']].map(([k, v]) => <div key={k} className="rounded bg-chip px-2 py-1.5"><div className="text-ink3 text-[11px]">{k}</div><b className="text-ink">{v}</b></div>)}</div>
      </Card>
    </div>
  );
}

// ---------- anomaly detection ----------
function AnomalyModels({ n, ex }) {
  const M = [
    ['Learned normal', I.Activity, `${n}`, 'lines drifting now', ['Latency', 'Jitter', 'Loss', 'CPU', 'Airtime']],
    ['Forecast', I.TrendingUp, '4', 'capacity forecasts open', ['Line use', 'PoE budget', 'Address pools']],
    ['Change detection', I.GitCompare, '100%', 'of change windows checked', ['Firmware', 'Policy', 'Carrier']],
    ['Learned patterns', I.CalendarClock, 'FR-02', 'nightly backup spikes', ['Backups', 'Opening', 'Closing']],
  ];
  return (
    <Card title="How OpsRamp finds anomalies">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">{M.map(([t, Ic, v, u, chips]) => <div key={t} className="border border-ai/30 bg-ai/[0.03] rounded-lg p-3 flex flex-col"><div className="flex items-center gap-2"><Ic size={15} className="text-ai" /><b className="text-[13px] text-ink">{t}</b><Tag k="ml" /></div><div className="text-[24px] font-bold text-ink tabular-nums mt-2 leading-none">{v}</div><div className="text-[11.5px] text-ink3 mt-0.5">{u}</div><div className="flex flex-wrap gap-1 mt-2">{chips.map(c => <span key={c} className="text-[10.5px] px-1.5 py-[1px] rounded border border-line bg-panel text-ink2">{c}</span>)}</div></div>)}</div>
      {ex && <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-[12.5px]">{[['Line', `${ex.b.name.replace(/ – .*/, '')}, ${ex.b.city}`], ['Normal', `${Math.round(ex.normal)} ms`], ['Now', `${Math.round(ex.now)} ms`], ['Fixed limit', `100 ms${ex.eta ? ` · ~${ex.eta} days away` : ''}`]].map(([k, v], i) => <div key={k} className={cx('rounded-lg border px-3 py-2', i === 2 ? 'border-warn/50 bg-warn/5' : 'border-line')}><div className="text-[11px] text-ink3">{k}</div><b className="text-ink">{v}</b></div>)}</div>}
    </Card>
  );
}

// ---------- sources and integration ----------
const SOURCES = [
  ['HPE Aruba EdgeConnect Orchestrator', 'Paths, tunnels, alarms', ['REST API', 'Webhook'], 'Medium', 0.31],
  ['HPE Aruba Central', 'APs, switches, Wi-Fi', ['API', 'Webhook', 'Built in'], 'Low', 0.24],
  ['Aruba CX and 2530 switches', 'Health, ports, PoE, traps', ['SNMPv3', 'AOS-CX REST'], 'Low', 0.17],
  ['ISP circuits (Simplify)', 'Line state, carrier tickets', ['Webhook'], 'Low', 0.08],
  ['Carrier portals', 'Case updates', ['REST', 'Email'], 'Medium', 0.02],
  ['New Relic', 'App response, errors', ['Native'], 'Low', 0.1],
  ['Synthetic tests', 'Payments, ERP, cloud', ['Native'], 'Low', 0.06],
  ['Azure Monitor', 'Cloud apps and services', ['Native'], 'Low', 0.02],
  ['ServiceNow', 'Incidents, CMDB', ['Store app', 'OAuth 2.0', 'Both ways'], 'Medium', 0],
  ['Microsoft Teams and email', 'Notifications', ['Outbound'], 'Low', 0],
];
function Integration({ tc }) {
  return (<>
    <div className="mb-3"><IntegrationStudio /></div>
    <div className="mb-3"><DeviceOnboarding /></div>
    <Card title="SRS sources" right={<span className="text-[12px] text-ink3"><b className="text-ink">{SOURCES.length}</b> connected · <b className="text-ink">{num(tc.events)}</b> events today</span>}>
      <div className="overflow-x-auto"><table className="w-full text-[12.5px]"><thead><tr className="border-b border-line"><Th>Source</Th><Th>Data</Th><Th>Connects by</Th><Th>Effort</Th><Th r>Events today</Th></tr></thead>
        <tbody>{SOURCES.map(([n, w, h, e, f]) => <tr key={n} className="border-b border-line/60 last:border-0"><td className="py-1.5 pr-3 font-semibold text-ink"><span className="inline-flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-ok" />{n}</span></td><td className="py-1.5 pr-3 text-ink2">{w}</td><td className="py-1.5 pr-3"><span className="flex flex-wrap gap-1">{h.map(x => <span key={x} className="text-[11px] px-1.5 py-[1px] rounded border border-line bg-chip text-ink2">{x}</span>)}</span></td><td className="py-1.5 pr-3"><Badge tone={e === 'Low' ? 'green' : 'amber'}>{e}</Badge></td><td className="py-1.5 text-right tabular-nums">{f ? num(Math.round(tc.events * f)) : '—'}</td></tr>)}</tbody></table></div>
    </Card>
  </>);
}

// ---------- ServiceNow ----------
function SNow() {
  return (<><TicketSimulator /><div className="mt-3"><ServiceNowSyncCard /></div></>);
}

// the AI tabs, shown on the Correlation page
export const AI_TABS = [{ id: 'where', label: 'Where the AI works' }, { id: 'correlation', label: 'Correlation and topology' }, { id: 'anomaly', label: 'Anomaly detection' }, { id: 'sources', label: 'Sources and integration' }, { id: 'servicenow', label: 'ServiceNow' }];
export function OpsAIContent({ tab }) {
  const { s } = useApp(); const { L } = useLive();
  const tc = todayCounts(L, s);
  const anom = anomaliesOf(), nAnom = anom.length, ex = anom.find(a => a.metric === 'lat');
  return (<>
    {tab === 'where' && <><Pipeline tc={tc} nAnom={nAnom} /><div className="mt-3"><BeforeAfter /></div></>}
    {tab === 'correlation' && <><Methods /><div className="mt-3"><TopologyCard /></div><div className="mt-3"><LearnedCard /></div></>}
    {tab === 'anomaly' && <><AnomalyModels n={nAnom} ex={ex} /><div className="mt-3"><AnomaliesCard /></div></>}
    {tab === 'sources' && <Integration tc={tc} />}
    {tab === 'servicenow' && <SNow />}
  </>);
}
// the old page address now opens the Correlation page on its AI tabs
export function OpsAI() {
  const { act } = useApp();
  useEffect(() => { act.setTab('correlation', 'where'); act.go('correlation'); }, []);
  return null;
}
