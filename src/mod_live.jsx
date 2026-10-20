// Live Operations, Correlation and Mova iO Agents: the "watch it happen" screens.
import React from 'react';
import * as I from 'lucide-react';
import * as D from './data.js';
import { useApp, healthOf, filteredBranches, inScope, onBackupOf } from './store.jsx';
import { useLive } from './live.jsx';
import { Card, Badge, PageHead, Dot, cx } from './ui.jsx';
import { C } from './charts.jsx';
import { LiveBadge, LiveFeed, AlertsPerMinCard, EventFlowCard } from './liveui.jsx';
import { todayCounts, LiveKpis, AreaTimeline, HeartbeatGrid, AreaHourHeat, ScoreHistogram, CorrelationEngine, AlertFunnel, AlertSankey, GroupingSwimlane, CorrMatrix, AgentActivity, AgentCards, AgentStream, ToolsStrip, TopBranches } from './viz2.jsx';
import { AGENT_DEF } from './liveext.js';
import { AgentMixCards } from './viz3.jsx';
import { num, hhmmss } from './util.js';

export function LiveOps() {
  const { s, act } = useApp(); const { L } = useLive();
  const S = L.series; const list = filteredBranches(s);
  const open = s.incidents.filter(i => i.state !== 'Resolved' && inScope(s, i.branchId));
  const attention = open.slice().sort((a, b) => a.pri.localeCompare(b.pri)).slice(0, 7);
  return (
    <div>
      <PageHead icon={I.Radio} title="Live Operations" sub="The network as it runs: lines, tunnels, alerts and automation for every branch in view, with what each reading means for trading." right={<LiveBadge />} />
      <LiveKpis items={[
        { label: 'Branches online', value: num(Math.max(0, list.length - list.filter(b => healthOf(s, b) === 'down').length)), sub: `of ${num(list.length)}: at least one working line, so the branch can trade`, series: S.online, color: C.ok, icon: I.Store },
        { label: 'Branches on backup line', value: num(list.filter(b => onBackupOf(s, b)).length), sub: 'trading on the second line or LTE: works, but slower and metered', series: S.onbackup, color: C.warn, icon: I.Shuffle },
        { label: 'Average latency to data centre', value: Math.round(S.wan.at(-1)), unit: ' ms', sub: `normal ${D.AVG_LAT} ms; above +25 ms ERP and pricing screens feel slow`, series: S.wan, color: C.s1, icon: I.Timer, tone: S.wan.at(-1) > D.AVG_LAT + 10 ? 'warn' : undefined },
        { label: 'Average packet loss', value: S.loss.at(-1).toFixed(2), unit: '%', sub: 'on the lines in use; above 1% card payments retry and calls break up', series: S.loss, color: C.s4, icon: I.Activity, tone: S.loss.at(-1) > 0.5 ? 'warn' : undefined },
        { label: 'Average jitter', value: S.jit.at(-1).toFixed(1), unit: ' ms', sub: 'variation in delay; above 30 ms voice calls become choppy', series: S.jit, color: C.s2, icon: I.Waves, tone: S.jit.at(-1) > 10 ? 'warn' : undefined },
        { label: 'SD-WAN tunnels up', value: num(Math.round(S.tunnels.at(-1))), sub: 'of 1,866: two secure paths per EdgeConnect; one down leaves a branch on a single line', series: S.tunnels, color: C.ok, icon: I.Cable },
      ]} />
      <div className="mt-3"><AreaTimeline /></div>
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-3 mt-3 items-start">
        <LiveFeed h={430} />
        <div className="space-y-3">
          <Card title="Mova iO agents" sub="Latest decisions across the estate" right={<button onClick={() => act.go('agents')} className="text-[12px] font-semibold text-brand hover:underline">All agents</button>} pad={false}>
            <div className="px-4 pb-3 max-h-[210px] overflow-y-auto">{L.x.agentStream.slice(0, 8).map(e => <div key={e.id} className="flex gap-2 py-1 text-[12px] border-b border-line/60 feed-in"><code className="text-[11px] text-ink3 w-[54px] shrink-0">{hhmmss(e.t)}</code><span className="text-ink"><b>{AGENT_DEF.find(a => a.id === e.agent).name}:</b> {e.text}</span></div>)}</div>
          </Card>
          <Card title="Needs attention" sub="Open incidents in this view, highest priority first" pad={false}>
            <div className="px-4 pb-3">{attention.map(i => <button key={i.id} onClick={() => act.openInc(i.id)} className="w-full flex items-center gap-2 py-1.5 text-[12.5px] border-b border-line/60 text-left hover:bg-chip/50"><Dot tone={i.pri <= 'P2' ? 'red' : 'amber'} /><b className="text-ink w-[110px] truncate">{D.BR[i.branchId].name}</b><span className="text-ink2 truncate flex-1">{i.title}</span></button>)}{!attention.length && <div className="text-[12.5px] text-ink3 py-2">Nothing open in this view.</div>}</div>
          </Card>
        </div>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 mt-3"><AreaHourHeat /><AlertsPerMinCard /></div>
      <div className="mt-3"><ToolsStrip /></div>
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-3 mt-3 items-start"><HeartbeatGrid /><div className="space-y-3"><ScoreHistogram /><TopBranches /></div></div>
    </div>
  );
}

export function Correlation() {
  const { s } = useApp(); const { L } = useLive();
  const S = L.series; const tc = todayCounts(L, s); const raw = tc.raw; const open = s.incidents.filter(i => i.state !== 'Resolved');
  return (
    <div>
      <PageHead icon={I.GitMerge} title="Correlation" sub="Alerts normalised, de-duplicated and correlated into one incident per branch per event. Orchestrator, Aruba Central, OpsRamp and New Relic in; ServiceNow out." right={<LiveBadge />} />
      <LiveKpis cols={5} items={[
        { label: 'Events in today', value: num(tc.events), sub: 'traps, syslog and threshold crossings from every tool', series: S.raw, color: C.s2, icon: I.Bell },
        { label: 'Noise removed', value: `${Math.round(tc.noise * 100)}%`, sub: `${num(tc.suppressed)} duplicates, flaps and info events (KPI 50%)`, series: S.raw.map((v, i) => 1 - S.corr[i] / v), color: C.ok, icon: I.Filter },
        { label: 'Alerts left', value: num(raw), sub: `${num(tc.auto)} auto-cleared, ${num(tc.digest)} to the digest`, series: S.corr, color: C.s1, icon: I.Shrink },
        { label: 'Incidents today', value: tc.inc, sub: `${Math.round(tc.corr / Math.max(1, tc.inc))} correlated alerts per incident on average`, series: S.corr.map(v => v / 3), color: C.s1, icon: I.Ticket },
        { label: 'Open correlation groups', value: open.length, sub: `average confidence ${Math.round(open.reduce((a, i) => a + (i.conf || 0.85), 0) / Math.max(1, open.length) * 100)}%`, series: S.major, color: C.s4, icon: I.Layers },
      ]} />
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-3 mt-3 items-start"><CorrelationEngine /><div className="space-y-3"><AlertsPerMinCard /><EventFlowCard /></div></div>
      <div className="mt-3"><GroupingSwimlane /></div>
      <div className="mt-3"><AlertFunnel /></div>
      <div className="mt-3"><AlertSankey /></div>
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-3 mt-3 items-start"><AreaHourHeat /><CorrMatrix /></div>
      <Card className="mt-3" title="Correlation methods" sub="How signals were grouped today, by rule">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">{[['Topology', 'Signals on the same path: device, switch, EdgeConnect, circuit, carrier.', I.Network, 0.42], ['Time window', 'Same branch inside 10 minutes; same carrier and region inside 15.', I.Clock, 0.22], ['Change', 'A change on a related device in the previous 60 minutes.', I.GitPullRequest, 0.08], ['Carrier and location', 'Branches sharing a carrier segment, central office or storm area.', I.MapPin, 0.18], ['Similarity', 'Matches a known pattern from resolved incidents.', I.Copy, 0.1]].map(([n, d, Ic, f]) => (
          <div key={n} className="border border-line rounded-lg p-3"><div className="flex items-center gap-2"><Ic size={15} className="text-brand" /><b className="text-ink text-[13px] flex-1">{n}</b><span className="text-[18px] font-bold text-ink tabular-nums">{Math.max(1, Math.round(open.length * f * 3))}</span></div><div className="text-[12px] text-ink2 mt-1 leading-snug">{d}</div><div className="h-1.5 bg-chip rounded mt-2"><div className="h-full bg-brand rounded" style={{ width: `${f * 100 / 0.42}%` }} /></div></div>))}</div>
      </Card>
    </div>
  );
}

export function Agents() {
  const { L } = useLive();
  const today = Object.values(L.x.agents).reduce((a, g) => a + g.today, 0);
  const working = Object.values(L.x.agents).filter(g => Date.now() - g.lastT < 4000).length;
  return (
    <div>
      <PageHead icon={I.Bot} title="Mova iO Agents" sub="Thirteen agents: what each one is doing now, how often it acts and how often it gets it right. Every action follows the gate rules and lands in the audit log." right={<span className="inline-flex items-center gap-3 text-[12.5px]"><Badge tone="brand"><span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />{working} working now</Badge><span className="text-ink2"><b className="text-ink tabular-nums">{num(today)}</b> actions today</span></span>} />
      <AgentActivity />
      <AgentMixCards L={L} defs={AGENT_DEF} />
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-3 mt-3 items-start"><AgentCards /><AgentStream /></div>
    </div>
  );
}
