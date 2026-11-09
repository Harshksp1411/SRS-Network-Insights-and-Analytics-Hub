// OpsRamp AI on the Correlation page: OpsQ working on SRS alerts (learned sequences, continuous learning,
// topology, seasonal suppression, learned first response and routing, Observed / Recommend / On), the sources
// and how they connect, and the ServiceNow ticket at the end of the flow.
import React, { useState, useEffect } from 'react';
import * as I from 'lucide-react';
import { useApp } from './store.jsx';
import { useLive } from './live.jsx';
import { Card, Badge, PageHead, cx } from './ui.jsx';
import { OPSRAMP } from './edition.js';
import { todayCounts } from './viz2.jsx';
import { ServiceNowSyncCard } from './stormui.jsx';
import { IntegrationStudio } from './studio.jsx';
import { TicketSimulator } from './snowsim.jsx';
import { DeviceOnboarding } from './onboard.jsx';
import { num } from './util.js';
import { OperationsCopilot } from './copilot.jsx';

const Th = ({ children, r }) => <th className={cx('py-1.5 pr-3 font-semibold text-ink3 text-[11.5px]', r ? 'text-right' : 'text-left')}>{children}</th>;

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
// ---------- OpsQ: the OpsRamp AI engine, shown working on SRS alerts ----------
const OPSQ_SEASONAL = [['02:00 nightly', 'Config backup spike and TACACS+ timeouts', 'every night', 1260, 'On'], ['06:30 store opening', 'Tills and scanners joining Wi-Fi, ping loss', 'Mon to Sat', 842, 'On'], ['Sun 01:00', 'Carrier maintenance window, line flaps', 'weekly', 318, 'Recommend'], ['1st of month 23:00', 'ERP batch run, WAN use above 90%', 'monthly', 96, 'Observed']];
const OPSQ_FR = [['EdgeConnect tunnel down, backup line up', 'Run RB-101 LTE / broadband failover check', 214, 0.97, 'On'], ['Access point down, switch port up', 'Run RB-104 AP reboot', 133, 0.92, 'Recommend'], ['Config backup failed', 'Run RB-109 backup re-run', 61, 0.95, 'On'], ['Card payment test slow', 'Run RB-110 payment path test, tell StoreOps', 88, 0.9, 'Recommend']];
const OPSQ_ROUTE = [['SD-WAN and lines', 'Movate NOC – L2 Network', 0.96], ['Wi-Fi', 'Wireless team', 0.94], ['Card payments', 'Movate NOC – L2 Network, StoreOps told', 0.91], ['Customer-caused', 'SRS IT service desk', 0.88], ['Security', 'Security Lead', 0.97]];
const MODE_T = { Off: 'gray', Observed: 'blue', Recommend: 'amber', On: 'green' };
const COMPARE = [
  ['Correlation logic', 'Hand-written rules per device and scenario', 'Learns sequences from history; rules only as an override'],
  ['Upkeep', 'Rules break when topology or vendors change', 'Keeps learning as stores and devices are added'],
  ['Something new', 'Missed if no rule exists', 'Caught once it recurs'],
  ['Noise', 'Static thresholds and filters', 'Dedup, flap merging, seasonal and learned suppression'],
  ['Root cause', 'Separate tool or by hand', 'Topology points to the likely cause'],
  ['Routing', 'Static assignment rules', 'Learned routing and priority'],
  ['Going live', 'Rule goes live; you find out if it is wrong', 'Observed, then Recommend, then On, with 7-day back-test'],
  ['Why', 'Readable but rigid', 'Shows which alerts formed each inference and why'],
];
export function OpsQCard() {
  const { s, act } = useApp();
  const [f, setF] = useState('seq');
  const [cmp, setCmp] = useState(false);
  const modes = { 'CP-01': 'On', 'CP-02': 'Recommend', 'CP-03': 'Observed', ...(s.catModes || {}) };
  const promote = id => { const nx = { Observed: 'Recommend', Recommend: 'On' }[modes[id]]; if (!nx) return; act.set(st => ({ catModes: { ...(st.catModes || {}), [id]: nx } })); act.audit(`OpsQ policy ${id} moved to ${nx}`, id); act.toast(`${id} is now ${nx}`); };
  const seqN = SEQ.reduce((a, x) => a + x[1], 0);
  const F = [
    ['seq', 'Learned alert sequences', I.Workflow, `${SEQ.length}`, `${seqN} matches, 90 days`],
    ['learn', 'Continuous learning', I.RefreshCw, '2 h ago', 'last retrain'],
    ['topo', 'Topology-aware', I.Network, '61 → 1', 'child alarms on one root'],
    ['season', 'Seasonal suppression', I.CalendarClock, num(OPSQ_SEASONAL.reduce((a, x) => a + x[3], 0)), 'held back this month'],
    ['fr', 'Learned first response', I.Zap, `${OPSQ_FR.length}`, 'actions learned'],
    ['route', 'Learned routing', I.GitFork, '94%', 'matched the engineer'],
  ];
  const T = ({ head, rows, left }) => <div className="overflow-x-auto"><table className="w-full text-[12.5px]"><thead><tr className="border-b border-line">{head.map((h, i) => <Th key={h || i} r={!left && i > 0 && i < head.length - 1}>{h}</Th>)}</tr></thead><tbody>{rows.map((r, k) => <tr key={k} className="border-b border-line/60 last:border-0">{r.map((c, i) => <td key={i} className={cx('py-1.5 pr-3', !left && i > 0 && i < r.length - 1 && 'text-right tabular-nums')}>{c}</td>)}</tr>)}</tbody></table></div>;
  return (
    <Card title="OpsQ, the AI in OpsRamp event management" sub="Learned from SRS alert history, proved in Observed mode before it acts" right={<button onClick={() => setCmp(v => !v)} className="text-[12px] font-semibold text-ink hover:underline">{cmp ? 'Hide' : 'Compare with'} rule-based tools</button>}>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">{F.map(([k, t, Ic, v, u]) => (
        <button key={k} onClick={() => setF(k)} aria-pressed={f === k} className={cx('text-left rounded-md border px-2.5 py-2', f === k ? 'border-ink ring-1 ring-ink bg-panel' : 'border-line hover:border-ink3')}>
          <div className="flex items-center gap-1.5 text-[11.5px] text-ink2"><Ic size={13} />{t}</div>
          <div className="text-[20px] font-bold text-ink tabular-nums leading-tight mt-0.5">{v}</div><div className="text-[11px] text-ink3">{u}</div>
        </button>))}</div>
      <div className="mt-3">
        {f === 'seq' && <T head={['Sequence it learned', 'Seen, 90 days', 'Typical gap', 'Confidence', 'Policy']} rows={SEQ.map(([q, n, g, c, p]) => [q, n, g, `${Math.round(c * 100)}%`, <span className="inline-flex items-center gap-1.5"><span className="font-mono text-[11.5px]">{p}</span><Badge tone={MODE_T[modes[p]]}>{modes[p]}</Badge>{modes[p] !== 'On' && <button onClick={() => promote(p)} className="text-[11.5px] font-semibold text-ink hover:underline">Promote</button>}</span>])} />}
        {f === 'learn' && <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[12.5px]">{[['Learning from', '12 months of SRS alerts'], ['New this quarter', '31 stores, 3 device types'], ['Retrains', 'continuously, last 2 h ago'], ['Accuracy after retrain', '95.8% (was 94.1%)']].map(([k, v]) => <div key={k} className="rounded bg-chip px-2.5 py-2"><div className="text-ink3 text-[11px]">{k}</div><b className="text-ink">{v}</b></div>)}</div>}
        {f === 'topo' && <TopologyCard />}
        {f === 'season' && <T head={['When', 'What recurs', 'How often', 'Held back, month', 'Mode']} rows={OPSQ_SEASONAL.map(([w, a, h, n, m]) => [<b>{w}</b>, a, h, num(n), <Badge tone={MODE_T[m]}>{m}</Badge>])} />}
        {f === 'fr' && <T head={['Alert', 'First response it learned', 'Times, 90 days', 'Accepted', 'Mode']} rows={OPSQ_FR.map(([a, r, n, c, m]) => [a, r, n, `${Math.round(c * 100)}%`, <Badge tone={MODE_T[m]}>{m}</Badge>])} />}
        {f === 'route' && <T head={['Kind of incident', 'Routed to', 'Matched the engineer', 'Mode']} rows={OPSQ_ROUTE.map(([k, g, c]) => [k, g, `${Math.round(c * 100)}%`, <Badge tone="blue">Observed</Badge>])} />}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px]">
        {[['Observed', 'shadow inferences only'], ['Recommend', 'engineer accepts'], ['On', 'acts on its own']].map(([m, d], i) => <React.Fragment key={m}>{i > 0 && <I.ArrowRight size={14} className="text-ink3" />}<span className="rounded-md border border-line px-2.5 py-1"><Badge tone={MODE_T[m]}>{m}</Badge> <span className="text-ink2">{d}</span> <b className="text-ink">{Object.values(modes).filter(x => x === m).length}</b></span></React.Fragment>)}
        <span className="text-ink3 ml-auto">Back-test, last 7 days: 4,812 alerts into 63 incidents · engineers agreed 96%</span>
      </div>
      {cmp && <div className="mt-3 border-t border-line pt-3">
        <T left head={['', 'Rule-based event management', 'OpsQ']} rows={COMPARE.map(([a, b, c]) => [<b>{a}</b>, <span className="text-ink2">{b}</span>, c])} />
        <div className="mt-2 grid grid-cols-1 md:grid-cols-4 gap-2 text-[12px]">{[['Needs history', 'Seeded with trained sequences at go-live'], ['Guardrails', 'SRS sets scope, similarity and precedence'], ['One site at a time', 'Multi-store events use the Mova iO pattern layer'], ['Fixes', 'Runs runbooks; Operations Copilot adds the agentic layer']].map(([k, v]) => <div key={k} className="rounded bg-chip px-2.5 py-2"><b className="text-ink block">{k}</b><span className="text-ink2">{v}</span></div>)}</div>
      </div>}
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
export function SNow() {
  return (<><TicketSimulator /><div className="mt-3"><ServiceNowSyncCard /></div></>);
}

// the AI tabs, shown on the Correlation page
export const AI_TABS = OPSRAMP ? [] : [{ id: 'copilot', label: 'Operations Copilot' }, { id: 'sources', label: 'Sources and integration' }];
export function OpsAIContent({ tab }) {
  const { s } = useApp(); const { L } = useLive();
  const tc = todayCounts(L, s);
  return tab === 'sources' ? <Integration tc={tc} /> : tab === 'copilot' ? <OperationsCopilot /> : null;
}
// the old page address now opens the Correlation page on its AI tabs
// Integrations as its own page (the OpsRamp view): the studio, device onboarding and the sources
// Operations Copilot as its own page (the OpsRamp view)
export function CopilotPage() { return <div><PageHead icon={I.Sparkles} title="Operations Copilot" /><OperationsCopilot /></div>; }
export function IntegrationsPage() {
  const { s } = useApp(); const { L } = useLive();
  return (<div><PageHead icon={I.Plug} title={OPSRAMP ? "Integration studio" : "Integrations"} /><Integration tc={todayCounts(L, s)} /></div>);
}
export function OpsAI() {
  const { act } = useApp();
  useEffect(() => { act.setTab('correlation', 'live'); act.go('correlation'); }, []);
  return null;
}
