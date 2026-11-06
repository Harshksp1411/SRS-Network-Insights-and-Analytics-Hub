// Live Operations, Correlation and Mova iO Agents: the "watch it happen" screens.
import React from 'react';
import * as I from 'lucide-react';
import * as D from './data.js';
import { useApp, healthOf, filteredBranches, inScope, onBackupOf } from './store.jsx';
import { useLive } from './live.jsx';
import { Card, Badge, PageHead, Dot, Tabs, OpsRampHead, cx } from './ui.jsx';
import { OpsAIContent, AI_TABS } from './mod_opsai.jsx';
import { C } from './charts.jsx';
import { LiveBadge, LiveFeed, AlertsPerMinCard, EventFlowCard } from './liveui.jsx';
import { todayCounts, LiveKpis, AreaTimeline, HeartbeatGrid, AreaHourHeat, ScoreHistogram, CorrelationEngine, AlertFunnel, AlertSankey, GroupingSwimlane, CorrMatrix, AgentActivity, AgentCards, AgentStream, ToolsStrip, TopBranches } from './viz2.jsx';
import { AGENT_DEF } from './liveext.js';
import { AgentMixCards } from './viz3.jsx';
import { AlertStormReplay, SuppressionRulesCard, ServiceNowSyncCard } from './stormui.jsx';
import { PatternsCard } from './patterns.jsx';
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
        { label: 'Branches online', value: num(Math.max(0, list.length - list.filter(b => healthOf(s, b) === 'down').length)), sub: `of ${num(list.length)}: at least one working line, so the branch can trade`, series: S.online, color: C.ok, icon: I.Store, go: { t: 'set', k: 'online' } },
        { label: 'Branches on backup line', value: num(list.filter(b => onBackupOf(s, b)).length), sub: 'trading on the second line or LTE: works, but slower and metered', series: S.onbackup, color: C.warn, icon: I.Shuffle, go: { t: 'set', k: 'backup' } },
        { label: 'Average latency to data centre', value: Math.round(S.wan.at(-1)), unit: ' ms', sub: `normal ${D.AVG_LAT} ms; above +25 ms ERP and pricing screens feel slow`, series: S.wan, color: C.s1, icon: I.Timer, go: { t: 'set', k: 'latency' }, tone: S.wan.at(-1) > D.AVG_LAT + 10 ? 'warn' : undefined },
        { label: 'Average packet loss', value: S.loss.at(-1).toFixed(2), unit: '%', sub: 'on the lines in use; above 1% card payments retry and calls break up', series: S.loss, color: C.s4, icon: I.Activity, go: { t: 'lines', k: 'problem' }, tone: S.loss.at(-1) > 0.5 ? 'warn' : undefined },
        { label: 'Average jitter', value: S.jit.at(-1).toFixed(1), unit: ' ms', sub: 'variation in delay; above 30 ms voice calls become choppy', series: S.jit, color: C.s2, icon: I.Waves, go: { t: 'lines', k: 'problem' }, tone: S.jit.at(-1) > 10 ? 'warn' : undefined },
        { label: 'SD-WAN tunnels up', value: num(Math.round(S.tunnels.at(-1))), sub: 'of 1,866: two secure paths per EdgeConnect; one down leaves a branch on a single line', series: S.tunnels, color: C.ok, icon: I.Cable, go: { t: 'lines', k: 'down' } },
      ]} />
      <div className="mt-3"><AreaTimeline /></div>
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-3 mt-3 items-start">
        <LiveFeed h={430} />
        <div className="space-y-3">
          <Card title="Mova iO agents" sub="Latest decisions across the estate" right={<button onClick={() => act.go('agents')} className="text-[12px] font-semibold text-brand hover:underline">All agents</button>} pad={false}>
            <div className="px-4 pb-3 max-h-[210px] overflow-y-auto">{L.x.agentStream.slice(0, 8).map(e => <div key={e.id} className="flex gap-2 py-1 text-[12px] border-b border-line/60 feed-in"><code className="text-[11px] text-ink3 w-[54px] shrink-0">{hhmmss(e.t)}</code><span className="text-ink"><b>{AGENT_DEF.find(a => a.id === e.agent).name}:</b> {e.text}</span></div>)}</div>
          </Card>
          <Card title="Needs attention" sub="Open incidents in this view, highest priority first" pad={false}>
            <div className="px-4 pb-3">{attention.map(i => <button key={i.id} onClick={() => act.openInc(i.id)} className="w-full flex items-center gap-2 py-1.5 text-[12.5px] border-b border-line/60 text-left hover:bg-chip/50"><Dot tone={i.pri <= 'P2' ? 'red' : 'amber'} /><b className="text-ink w-[225px] shrink-0 truncate">{D.BR[i.branchId].name}</b><span className="text-ink2 truncate flex-1">{i.title}</span></button>)}{!attention.length && <div className="text-[12.5px] text-ink3 py-2">Nothing open in this view.</div>}</div>
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
  const { s, act } = useApp(); const { L } = useLive();
  const tab = s.tab.correlation || 'live', setTab = t => act.setTab('correlation', t);
  const S = L.series; const tc = todayCounts(L, s); const raw = tc.raw; const open = s.incidents.filter(i => i.state !== 'Resolved');
  return (
    <div className="theme-opsramp">
      <OpsRampHead title="Correlation" sub="HPE OpsRamp · event management and AIOps" right={<LiveBadge />} />
      <LiveKpis cols={5} items={[
        { label: 'Events in today', value: num(tc.events), sub: 'traps, syslog and threshold crossings from every tool', series: S.raw, color: C.s2, icon: I.Bell },
        { label: 'Noise removed', value: `${Math.round(tc.noise * 100)}%`, sub: `${num(tc.suppressed)} duplicates, flaps and info events (KPI 50%)`, series: S.raw.map((v, i) => 1 - S.corr[i] / v), color: C.ok, icon: I.Filter },
        { label: 'Alerts left', value: num(raw), sub: `${num(tc.auto)} auto-cleared, ${num(tc.digest)} to the digest`, series: S.corr, color: C.s1, icon: I.Shrink },
        { label: 'Incidents today', value: tc.inc, sub: `${Math.round(tc.corr / Math.max(1, tc.inc))} correlated alerts per incident on average`, series: S.corr.map(v => v / 3), color: C.s1, icon: I.Ticket, go: { t: 'incidents', k: 'today' } },
        { label: 'Open correlation groups', value: open.length, sub: `average confidence ${Math.round(open.reduce((a, i) => a + (i.conf || 0.85), 0) / Math.max(1, open.length) * 100)}%`, series: S.major, color: C.s4, icon: I.Layers, go: { t: 'incidents', k: 'open' } },
      ]} />
      <Tabs value={tab} onChange={setTab} className="mt-3 mb-3" tabs={[{ id: 'live', label: 'Live correlation' }, ...AI_TABS]} />
      {tab !== 'live' && <OpsAIContent tab={tab} />}
      {tab === 'live' && <>
      <div><AlertStormReplay /></div>
      <div className="mt-3"><PatternsCard /></div>
      <div className="mt-3"><SuppressionRulesCard /></div>
      <div className="mt-3"><ServiceNowSyncCard /></div>
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-3 mt-3 items-start"><CorrelationEngine /><div className="space-y-3"><AlertsPerMinCard /><EventFlowCard /></div></div>
      <div className="mt-3"><GroupingSwimlane /></div>
      <div className="mt-3"><AlertFunnel /></div>
      <div className="mt-3"><AlertSankey /></div>
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-3 mt-3 items-start"><AreaHourHeat /><CorrMatrix /></div>
      </>}
    </div>
  );
}

export function Agents({ embedded }) {
  const { L } = useLive();
  const today = Object.values(L.x.agents).reduce((a, g) => a + g.today, 0);
  const working = Object.values(L.x.agents).filter(g => Date.now() - g.lastT < 4000).length;
  return (
    <div>
      {!embedded && <PageHead icon={I.Bot} title="Mova iO Agents" sub="Thirteen agents: what each one is doing now, how often it acts and how often it gets it right. Every action follows the gate rules and lands in the audit log." right={<span className="inline-flex items-center gap-3 text-[12.5px]"><Badge tone="brand"><span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />{working} working now</Badge><span className="text-ink2"><b className="text-ink tabular-nums">{num(today)}</b> actions today</span></span>}  />}
      <AgentActivity />
      <AgentMixCards L={L} defs={AGENT_DEF} />
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-3 mt-3 items-start"><AgentCards /><AgentStream /></div>
    </div>
  );
}
