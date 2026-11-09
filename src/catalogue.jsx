// AI and Automation Catalogue: everything in the service that decides or acts on its own, in one list. HPE OpsRamp's
// own AI (OpsQ and the Operations Copilot agents), Mova iO agents,
// automation runbooks, AI event policies (correlation, suppression, de-duplication), predictive models, the copilot
// and knowledge, and the ServiceNow auto-ticketing rules. Each shows what it does, what sets it off, how much control a
// person keeps (its mode or autonomy level and the gate), how often it ran and how often it was right.
import React, { useEffect, useMemo, useState } from 'react';
import * as I from 'lucide-react';
import * as D from './data.js';
import { useApp } from './store.jsx';
import { useLive } from './live.jsx';
import { AGENT_DEF } from './liveext.js';
import { RULES } from './storm.js';
import { todayCounts } from './viz2.jsx';
import { Card, Badge, PageHead, Stat, Tabs, SearchBox, Select, Btn, cx, ExportBtn } from './ui.jsx';
import { num, exportCSV } from './util.js';
import { Agents } from './mod_live.jsx';
import { Automation } from './mod_more.jsx';

export const TYPES = [
  { id: 'opsq', one: 'OpsRamp AI', label: 'OpsRamp OpsQ and Copilot', icon: I.BrainCircuit, go: 'correlation' },
  { id: 'agent', one: 'AI agent', label: 'AI agents', icon: I.Bot, tab: 'agents' },
  { id: 'runbook', one: 'Runbook', label: 'Automation runbooks', icon: I.Workflow, tab: 'runbooks' },
  { id: 'policy', one: 'AI event policy', label: 'AI event policies', icon: I.Filter, go: 'correlation' },
  { id: 'model', one: 'Predictive model', label: 'Predictive models', icon: I.TrendingUp, go: 'predict' },
  { id: 'copilot', one: 'Copilot', label: 'Copilot and knowledge', icon: I.Sparkles, go: 'knowledge' },
  { id: 'ticket', one: 'Auto-ticketing rule', label: 'Auto-ticketing rules', icon: I.Ticket, go: 'correlation' },
];
export const MODES = ['Off', 'Observed', 'Recommend', 'On'];
const MODE_TONE = { Off: 'gray', Observed: 'blue', Recommend: 'amber', On: 'green' };
const MODE_TEXT = { Off: 'not running', Observed: 'shadow: shows what it would do, changes nothing', Recommend: 'suggests; a person accepts or rejects', On: 'running' };

const POLICIES = [
  ['FR-01', 'Suppress SD-WAN tunnel re-key info messages', 'User rule', 'On', 0.06],
  ['FR-02', 'Suppress nightly config-backup traffic spikes, 01:00 to 03:00 local', 'Learned seasonal pattern', 'On', 0.04],
  ['FR-03', 'Suppress AP watchdog reboots that recover inside 3 minutes', 'Training file (12 months of SRS history)', 'Recommend', 0.05],
  ['FR-04', 'Suppress PoE renegotiation on yard APs', 'Continuous learning', 'Observed', 0.03],
  ['CP-01', 'Correlate on store topology: circuit, SD-WAN appliance, switches and APs behind it', 'Topology (LLDP/CDP) and site', 'On', 0.05],
  ['CP-02', 'Correlate same carrier, same region, inside 15 minutes', 'ML co-occurrence, region aware', 'Recommend', 0.02],
  ['CP-03', 'Correlate application slowness with WAN latency at the same store', 'ML co-occurrence, site aware', 'Observed', 0.01],
];
const MODELS = [
  ['M-01', 'Degrading circuit', 'Failure classifier on 14 months of circuit history: loss and latency trend, evening peaks, repeat tickets, carrier segment', 'Degrading circuit', 0.84],
  ['M-02', 'AP failure risk', 'Failure classifier on every AP replacement in 3 years: reboots, radio temperature, PoE errors, model and age', 'AP failure risk', 0.79],
  ['M-03', 'Switch failure risk', 'Failure classifier on PSU and switch replacements: chassis temperature, fan speed, closet, age', 'Switch failure risk', 0.73],
  ['M-04', 'Backup path risk', 'Classifier on backup-path faults: weekly failover test speed and LTE signal quality', 'Backup path risk', 0.86],
  ['M-05', 'Capacity forecast', 'Trend projection of peak (95th percentile) use, 10 weeks back, with a widening range', 'Capacity forecast', 0.85],
  ['M-06', 'Anomaly detection', 'Learned normal range per circuit and device by hour and weekday; flags drift before a threshold breaks', null, 0.81],
  ['M-07', 'Breach prediction', 'Chance an open incident misses its SLA, from time used against the typical curve for its category', null, 0.77],
];
const COPILOT = [
  ['CO-01', 'Ask Mova iO (operations copilot)', 'Answers questions about the estate in plain language, explains incidents and suggests the next step', 'Engineer asks', 'Recommend', 1840, 0.91, 'ask'],
  ['CO-02', 'Knowledge Agent: article drafts', 'Writes a KB draft from each resolved incident; an engineer reviews before it is published', 'Incident resolved', 'Recommend', 212, 0.83, 'knowledge'],
  ['CO-03', 'Similar-case indexer', 'Finds past incidents like this one and how they were fixed', 'Incident opened', 'On', 2650, 0.83, 'knowledge'],
  ['CO-04', 'Plain-language incident summary', 'Writes the work note and the Store Ops update in plain words', 'Incident updated', 'On', 3100, 0.95, 'incidents'],
];
// HPE OpsRamp's own AI: the OpsQ engine in event management, and the Operations Copilot agents
const OPSQ_AI = [
  ['OQ-01', 'OpsQ learned alert sequences', 'Finds alerts that keep occurring together in SRS history and correlates them, so nobody writes "if the tunnel is down, hold the AP alarms"', 'Every alert', 'On', 5120, 0.95, 'correlation'],
  ['OQ-02', 'OpsQ continuous learning', 'Retrains on recent alerts every few hours, so new branches and new device types are learned without new rules', 'Every few hours', 'On', 180, 0.96, 'correlation'],
  ['OQ-03', 'OpsQ topology-aware correlation', 'Uses the store topology so an upstream failure explains the downstream symptoms and opens one incident', 'Every alert with a parent', 'On', 4380, 0.97, 'correlation'],
  ['OQ-04', 'OpsQ seasonal suppression', 'Spots alerts that recur at the same time (the 02:00 backup spike, store opening) and holds them back', 'Recurring alerts', 'On', 2516, 0.98, 'correlation'],
  ['OQ-05', 'OpsQ learned first response', 'Learns which process to run for which alert and, in Recommend mode, suggests it for an engineer to accept', 'Matching alert', 'Recommend', 496, 0.93, 'correlation'],
  ['OQ-06', 'OpsQ learned routing and priority', 'Recommends the assignment group, priority and category from how past incidents were handled', 'New incident', 'Observed', 1310, 0.94, 'correlation'],
  ['OQ-07', 'OpsQ Observed mode and back-test', 'Shadow inferences show what a new pattern would have done; a 7-day back-test is required before promotion', 'New learned pattern', 'Observed', 5, 0.96, 'correlation'],
  ['OQ-08', 'Operations Copilot: Search agent', 'Answers plain-English questions about alerts, devices, lines and incidents', 'Engineer asks', 'Recommend', 413, 0.94, 'copilot'],
  ['OQ-09', 'Operations Copilot: Command Center agent', 'Puts OpsQ\'s recommendation next to each critical alert: escalate, suppress or run first response', 'Critical alert', 'Recommend', 189, 0.97, 'copilot'],
  ['OQ-10', 'Operations Copilot: probable root cause agent', 'Ranks the probable causes across one incident\'s alerts, with network, ISP and application verdicts', 'Engineer opens an incident', 'Recommend', 96, 0.91, 'copilot'],
  ['OQ-11', 'Operations Copilot: Dashboard Assistant', 'Builds a dashboard tile from a plain-English request, for review before saving', 'Engineer asks', 'Recommend', 57, 0.89, 'copilot'],
  ['OQ-12', 'Operations Copilot: Documentation Assistant', 'Answers from the OpsRamp docs and the SRS knowledge base, with sources', 'Engineer asks', 'Recommend', 143, 0.96, 'copilot'],
];
const TICKETS = [
  ['TK-01', 'Store fully down: P1 at once to the major incident team', 'Inference: store cannot trade', 'On'],
  ['TK-02', 'Card payments or ERP failing: P2 after 5 minutes', 'Inference: payment or ERP path failing', 'On'],
  ['TK-03', 'Circuit degraded past the store profile: P3 after 15 minutes, carrier team', 'Inference: loss, latency or jitter over threshold', 'On'],
  ['TK-04', 'One AP or switch port down: P4 after 10 minutes', 'Inference: single device', 'On'],
  ['TK-05', 'Access link already ticketed by Simplify: attach, do not create', 'Upstream ticket open', 'On'],
  ['TK-06', 'Same fault back within 24 hours: reopen the old ticket', 'Recurrence', 'Recommend'],
];

function useItems() {
  const { s } = useApp(); const { L } = useLive(); const tc = todayCounts(L, s);
  const modes = s.catModes || {};
  return useMemo(() => {
    const out = [];
    AGENT_DEF.forEach(a => { const g = L.x.agents[a.id] || {}; out.push({ id: `AG-${a.id}`, type: 'agent', name: `${a.name} Agent`, does: a.does, trigger: 'Every event or incident it is responsible for', mode: 'On', gate: 'Follows the gate rules; risky actions need approval', runs: Math.round((g.today || 0) * 30), ok: g.ok || 0.95, owner: 'Mova iO', last: g.last }); });
    D.RUNBOOKS.forEach(r => out.push({ id: r.id, type: 'runbook', name: `${r.id} ${r.name}`, does: r.desc, trigger: 'Recommended by the Diagnosis Agent for a matching incident', mode: modes[r.id] || 'On', level: r.autonomy, gate: r.kind === 'readonly' ? 'Runs on its own (read-only)' : `${D.AUTONOMY[r.autonomy]}`, runs: r.runs30, ok: r.success, owner: 'Movate NOC', undo: r.rollback }));
    RULES.forEach((r, i) => out.push({ id: `EV-0${i + 1}`, type: 'policy', name: `${r.name} (de-duplication and suppression)`, does: r.how, trigger: `For example: ${r.ex}`, mode: modes[`EV-0${i + 1}`] || 'On', gate: 'Held-back alerts stay visible on their parent', runs: Math.round(tc.suppressed * r.share * 30), ok: 0.97, owner: 'HPE OpsRamp (OpsQ)' }));
    POLICIES.forEach(([id, n, by, m, sh]) => out.push({ id, type: 'policy', name: n, does: `${id.startsWith('CP') ? 'Correlation' : 'First-response'} policy. Learned from: ${by}. An alert that outlives its normal duration is brought back automatically.`, trigger: by, mode: modes[id] || m, gate: 'SRS approves before it goes from Recommend to On', runs: Math.round(tc.events * sh * 30), ok: 0.9 + sh, owner: 'HPE OpsRamp (OpsQ)' }));
    MODELS.forEach(([id, n, how, kind, conf]) => { const open = kind ? s.predictions.filter(p => p.kind === kind && ['New', 'Watching'].includes(p.status)).length : null; out.push({ id, type: 'model', name: n, does: how, trigger: 'Scored daily; anomalies every 5 minutes', mode: modes[id] || 'On', gate: 'Never changes anything: creates a watch or an approval', runs: kind ? 30 * (open + 3) : 900 * 30, ok: conf, owner: 'Mova iO, predictive', open }); });
    COPILOT.forEach(([id, n, does, trig, m, runs, ok, go]) => out.push({ id, type: 'copilot', name: n, does, trigger: trig, mode: modes[id] || m, gate: m === 'Recommend' ? 'A person accepts or edits before anything is sent' : 'Writes notes only', runs, ok, owner: 'Mova iO', go }));
    OPSQ_AI.forEach(([id, n, does, trig, m, runs, ok, go]) => out.push({ id, type: 'opsq', name: n, does, trigger: trig, mode: modes[id] || m, gate: m === 'On' ? 'Acts inside the policy scope SRS sets; every decision is listed on the incident' : m === 'Recommend' ? 'A person accepts or rejects' : 'Shadow only: changes nothing', runs, ok, owner: 'HPE OpsRamp', go }));
    TICKETS.forEach(([id, n, trig, m]) => out.push({ id, type: 'ticket', name: n, does: 'Raises or updates the ServiceNow incident from the correlated inference, with CI, store, probable cause and the alerts attached.', trigger: trig, mode: modes[id] || m, gate: 'Only correlated, non-suppressed inferences are ticketed', runs: Math.round(tc.inc * 30 / TICKETS.length), ok: 0.99, owner: 'HPE OpsRamp escalation policy to ServiceNow' }));
    return out;
  }, [s.catModes, s.predictions, Math.floor(tc.events / 50)]);
}

// old links to Mova iO Agents and the Automation Library open the matching catalogue tab
export function CatalogueTab({ tab }) {
  const { act } = useApp();
  useEffect(() => { act.setTab('catalogue', tab); act.go('catalogue'); }, []);
  return null;
}
const CTABS = [{ id: 'list', label: 'Catalogue' }, { id: 'agents', label: 'Agents at work' }, { id: 'runbooks', label: 'Runbooks and runs' }];
export function Catalogue() {
  const { s, act } = useApp();
  const items = useItems();
  const ctab = s.tab.catalogue || 'list', setCtab = t => act.setTab('catalogue', t);
  const [type, setType] = useState('all'), [mode, setMode] = useState('All'), [q, setQ] = useState(''), [open, setOpen] = useState(null);
  const list = items.filter(x => (type === 'all' || x.type === type) && (mode === 'All' || x.mode === mode) && (!q || `${x.id} ${x.name} ${x.does}`.toLowerCase().includes(q.toLowerCase())));
  const setItemMode = (x, m) => { act.set(st => ({ catModes: { ...(st.catModes || {}), [x.id]: m } })); act.audit(`${x.id} ${x.name}: mode ${x.mode} → ${m}`, x.id); act.toast(`${x.id} set to ${m}: ${MODE_TEXT[m]}`, 'info'); };
  const goTo = x => { const T = TYPES.find(t => t.id === x.type); if (x.go === 'ask') act.set({ askOpen: true }); else if (!x.go && T.tab) { setCtab(T.tab); if (T.tab === 'runbooks') act.set({ autoSel: x.id }); window.scrollTo({ top: 0 }); } else act.go(x.go || T.go); };
  const runs = items.reduce((a, x) => a + (x.runs || 0), 0);
  const shadow = items.filter(x => x.mode === 'Observed' || x.mode === 'Recommend');
  return (
    <div>
      <PageHead icon={I.LibraryBig} title="AI & Automation Catalogue" sub="Everything in the service that decides or acts on its own, in one list: what it does, what sets it off, how much control a person keeps, how often it ran and how often it was right. Every policy can run Off, Observed, Recommend or On." right={<ExportBtn onClick={() => exportCSV('srs-ai-automation-catalogue.csv', items, [{ label: 'ID', key: 'id' }, { label: 'Type', get: x => TYPES.find(t => t.id === x.type).label }, { label: 'Name', key: 'name' }, { label: 'What it does', key: 'does' }, { label: 'Trigger', key: 'trigger' }, { label: 'Mode', key: 'mode' }, { label: 'Autonomy', get: x => x.level || '' }, { label: 'Gate', key: 'gate' }, { label: 'Runs, 30 days', key: 'runs' }, { label: 'Right', get: x => Math.round(x.ok * 100) + '%' }, { label: 'Owner', key: 'owner' }])} />} />
      <Tabs value={ctab} onChange={setCtab} className="mb-3" tabs={CTABS.map(t => ({ ...t, count: t.id === 'list' ? items.length : t.id === 'agents' ? items.filter(x => x.type === 'agent').length : items.filter(x => x.type === 'runbook').length }))} />
      {ctab === 'agents' && <Agents embedded />}
      {ctab === 'runbooks' && <Automation embedded />}
      {ctab === 'list' && <>
      <div className="kpi-strip grid grid-cols-2 lg:grid-cols-5 mb-3">
        <Stat onClick={() => { setType('all'); setMode('All'); setQ(''); }} label="In the catalogue" icon={I.LibraryBig} value={items.length} sub={`${TYPES.length} kinds`} />
        <Stat label="Running (On)" icon={I.Play} value={items.filter(x => x.mode === 'On').length} tone="green" onClick={() => setMode('On')} />
        <Stat label="Proving themselves" icon={I.Eye} value={shadow.length} sub="Observed or Recommend" tone="amber" onClick={() => setMode(shadow.length && mode !== 'Recommend' ? 'Recommend' : 'Observed')} />
        <Stat onClick={() => { setType('all'); setMode('All'); }} label="Actions, last 30 days" icon={I.Zap} value={num(runs)} sub="runs, suppressions, tickets, scores" />
        <Stat onClick={() => { setType('all'); setMode('On'); }} label="Right first time" icon={I.Target} value={`${Math.round(items.reduce((a, x) => a + x.ok * (x.runs || 1), 0) / Math.max(1, items.reduce((a, x) => a + (x.runs || 1), 0)) * 100)}%`} sub="weighted by volume" tone="green" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2 mb-3">{TYPES.map(t => { const n = items.filter(x => x.type === t.id); return (
        <button key={t.id} onClick={() => setType(type === t.id ? 'all' : t.id)} aria-pressed={type === t.id} className={cx('text-left rounded-md border p-3 bg-panel', type === t.id ? 'border-ink ring-1 ring-ink' : 'border-line hover:border-ink3')}>
          <div className="flex items-center gap-2"><t.icon size={15} className="text-brand" /><b className="text-[13px] text-ink flex-1">{t.label}</b><span className="text-[12px] font-bold text-ink2 bg-chip rounded px-1.5">{n.length}</span></div>
          <div className="text-[11.5px] text-ink3 mt-1">{n.filter(x => x.mode === 'On').length} on · {n.filter(x => x.mode === 'Observed' || x.mode === 'Recommend').length} in shadow or recommend</div>
        </button>); })}</div>
      <Card pad={false} title={`${type === 'all' ? 'All' : TYPES.find(t => t.id === type).label} (${list.length})`} right={<div className="flex gap-2"><Select value={mode} onChange={setMode} options={['All', ...MODES].map(m => ({ value: m, label: m === 'All' ? 'Mode: all' : `Mode: ${m}` }))} /><SearchBox value={q} onChange={setQ} placeholder="Search the catalogue" className="w-52" /></div>}>
        <div className="divide-y divide-line">{list.map(x => { const T = TYPES.find(t => t.id === x.type); const isOpen = open === x.id; return (
          <div key={x.id} className="px-4 py-2.5">
            <div className="flex items-start gap-3 cursor-pointer" onClick={() => setOpen(isOpen ? null : x.id)}>
              <span className="w-8 h-8 rounded-md bg-brand/10 text-brand grid place-items-center shrink-0"><T.icon size={15} /></span>
              <div className="flex-1 min-w-0"><div className="flex items-center gap-2 flex-wrap"><span className="font-mono text-[11.5px] text-ink3">{x.id}</span><b className="text-[13.5px] text-ink">{x.name}</b><Badge>{T.one}</Badge>{x.owner && <span className="text-[11px] text-ink3">{x.owner}</span>}</div><div className="text-[12.5px] text-ink2 leading-snug mt-0.5 line-clamp-2">{x.does}</div></div>
              <div className="text-right shrink-0 hidden md:block w-[110px]"><div className="text-[13px] font-bold text-ink tabular-nums">{num(x.runs || 0)}</div><div className="text-[11px] text-ink3">30 days</div></div>
              <div className="text-right shrink-0 hidden md:block w-[70px]"><div className="text-[13px] font-bold text-ok tabular-nums">{Math.round(x.ok * 100)}%</div><div className="text-[11px] text-ink3">right</div></div>
              <div className="shrink-0 w-[96px] text-right"><Badge tone={MODE_TONE[x.mode]}>{x.mode}</Badge>{x.level && <div className="text-[11px] text-ink3 mt-0.5">{x.level}</div>}</div>
              <I.ChevronDown size={15} className={cx('text-ink3 mt-1 transition-transform', isOpen && 'rotate-180')} />
            </div>
            {isOpen && <div className="mt-2 ml-11 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-3 text-[12.5px]">
              <div><div className="text-[11px] font-bold uppercase text-ink3">What sets it off</div><div className="text-ink">{x.trigger}</div>{x.last && <div className="text-ink3 mt-1">Last: {x.last}</div>}{x.open != null && <div className="text-ink3 mt-1">{x.open} open predictions from this model</div>}</div>
              <div><div className="text-[11px] font-bold uppercase text-ink3">Control and gate</div><div className="text-ink">{x.gate}</div>{x.undo && <div className="text-ink3 mt-1">Undo: {x.undo}</div>}<div className="text-ink3 mt-1">Owner: {x.owner}. Mode {x.mode}: {MODE_TEXT[x.mode]}.</div></div>
              <div className="flex flex-col gap-2 items-start">
                {x.type !== 'agent' && <div className="inline-flex rounded-md border border-line overflow-hidden">{MODES.map(m => <Btn key={m} op size="sm" kind={x.mode === m ? 'brand' : 'ghost'} className="!rounded-none !h-7 !px-2" onClick={() => x.mode !== m && setItemMode(x, m)}>{m}</Btn>)}</div>}
                <Btn size="sm" icon={I.ArrowRight} onClick={() => goTo(x)}>Open {x.go === 'ask' ? 'Ask Mova iO' : x.go === 'knowledge' ? 'Knowledge' : x.go === 'copilot' ? 'Operations Copilot' : x.go === 'incidents' ? 'Live Incidents' : { agent: 'Agents at work', runbook: 'Runbooks and runs', policy: 'Correlation', model: 'Predictive Watchlist', copilot: 'Knowledge', ticket: 'Correlation' }[x.type]}</Btn>
              </div>
            </div>}
          </div>); })}
          {!list.length && <div className="p-6 text-[13px] text-ink3">Nothing matches. Clear the search or pick another kind.</div>}
        </div>
      </Card>
      </>}
    </div>
  );
}
