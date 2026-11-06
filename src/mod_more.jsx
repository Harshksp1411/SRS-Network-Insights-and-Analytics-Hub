import React, { useState, useMemo, useRef } from 'react';
import * as I from 'lucide-react';
import { LivePanel } from './liveui.jsx';
import { ErrorBudgets, CalendarHeat } from './viz2.jsx';
import * as D from './data.js';
import { clockState } from './dash/drilldata.js';
import { useApp, useNow, gate, slaClock, branchClock, healthOf, circuitOf, ROLES } from './store.jsx';
import { Card, Badge, Btn, Table, PageHead, Tabs, Stat, Conf, GateBox, Modal, KV, cx, Progress, Select, SearchBox, Illus, ExportBtn, Pri, Dot, Logo } from './ui.jsx';
import { Spark, LineChart, Bars, Legend, C } from './charts.jsx';
import { num, pct, dur, ago, dt, hhmm, dateShort, MIN, HR, DAY, exportCSV, downloadFile, rng, parts } from './util.js';
import { KnowledgeUseCards, SLAScorecard, SLAStatusCard, SLAPriorityCard, SLAHeatCard, CreditHeadroomCard, MTTRTrendCard, TicketsAutoCard, RDonut, RBars, RHBars, RRow, RC } from './viz3.jsx';
import { lineOf, onBackupOf } from './store.jsx';
import * as HIST from './history.js';
import { downloadSlaReport } from './slapdf.js';
import { basisLine } from './predictbasis.js';
import { PredictionPipelineCard, DataCollectedCard, PredictionBasisModal } from './predictui.jsx';
import { AnomaliesCard } from './patterns.jsx';
import { MovaActions, PredictionActionsCard } from './predictact.jsx';
import { CriticalReport } from './critreport.jsx';
import { RiskMatrixCard, ModelAccuracyCard, PreventiveCalendarCard, ForecastMini, ClustersCard, DeflectionCard, AutomationRunsCard, HoursSavedCard, CandidatesCard, SLAProjectionCard } from './viz.jsx';

// ───────────────────────── Predictive watchlist ─────────────────────────
export function Predictive() {
  const { s, act } = useApp();
  const now = useNow();
  const [kind, setKind] = useState('All');
  const list = s.predictions.filter(p => kind === 'All' || p.kind === kind);
  const watch = p => { act.upd('predictions', p.id, { status: 'Watching' }); act.add('watches', { id: `W-${p.id}`, what: `${p.kind}: ${p.target}`, branchId: p.branchId, created: Date.now(), by: act.me() }); act.audit(`Watch created for ${p.id}`, p.id); act.toast('Watch created – alert if the trend crosses threshold'); };
  const approval = p => { const id = `APR-${2400 + Math.floor(Math.random() * 500)}`; act.add('approvals', { id, type: 'Prediction', title: `${p.suggest.replace(' (approval)', '')} – ${p.target}`, branchId: p.branchId, agent: 'prediction', conf: p.conf, risk: 'Low', created: Date.now(), status: 'Pending', why: ['Predictions never change anything directly – a human approves the action'], evidence: [p.signal], rollback: 'Cancel the request', verify: ['Trend returns to baseline'] }); act.upd('predictions', p.id, { status: 'Approval requested' }); act.audit(`Approval ${id} requested from ${p.id}`, p.id); act.toast(`${id} sent to Approvals`, 'info'); };
  const dismiss = p => { act.upd('predictions', p.id, { status: 'Dismissed (false positive)' }); act.audit(`${p.id} marked false positive – fed back to model`, p.id); };
  const [why, setWhy] = useState(null);
  const prevent = (p, x) => { const id = `APR-${2400 + Math.floor(Math.random() * 500)}`; act.add('approvals', { id, type: 'Prevention plan', title: `Prevent: ${p.kind.toLowerCase()} – ${p.target}`, branchId: p.branchId, agent: 'prediction', conf: p.conf, risk: 'Low', created: Date.now(), status: 'Pending', why: [x.why, `If nothing is done: ${x.ifNothing}`], evidence: [p.signal, ...x.sources.map(s => `${s.tool}: ${s.what} (${s.window})`)], steps: x.prevent.map(st => `${st.step} (${st.owner}, ${st.when.toLowerCase()})`), rollback: 'Cancel the plan; nothing has changed on the network yet', verify: [x.prevent[x.prevent.length - 1].step] }); act.upd('predictions', p.id, { status: 'Prevention started' }); if (!s.watches.some(w => w.id === `W-${p.id}`)) act.add('watches', { id: `W-${p.id}`, what: `${p.kind}: ${p.target}`, branchId: p.branchId, created: Date.now(), by: act.me() }); act.audit(`Prevention plan ${id} started from ${p.id}`, p.id); act.toast(`${id}: prevention plan sent to Approvals, watch kept on the trend`); setWhy(null); };
  const dal = s.predictions.find(p => p.id === 'PRD-505');
  const fc = [...dal.series, ...Array.from({ length: 4 }, (_, k) => +(dal.series[9] + (k + 1) * 3).toFixed(0))];
  return (
    <div>
      <PageHead icon={I.TrendingUp} title="Predictive Watchlist" sub="Degrading circuits, AP and switch failure risk, capacity forecasts. Each one shows the data it is based on and a plan to prevent it. Every prediction creates a watch or an approval, never a direct change." />
      <div className="kpi-strip grid grid-cols-2 lg:grid-cols-4 mb-3">
        <Stat label="Open predictions" icon={I.Telescope} onClick={() => act.drill({ t: 'predictions' })} value={s.predictions.filter(p => ['New', 'Watching'].includes(p.status)).length} />
        <Stat onClick={() => act.drill({ t: 'predictions' })} label="Predictive accuracy (KPI 38)" icon={I.Target} value="78%" sub="true positives, target 75%" tone="green" />
        <Stat label="Active watches" icon={I.Eye} onClick={() => act.drill({ t: 'predictions' })} value={s.watches.length + s.predictions.filter(p => p.status === 'Watching').length} />
        <Stat onClick={() => act.drill({ t: 'predictions' })} label="False positive rate" icon={I.ThumbsDown} value="14%" sub="target ≤ 20%" tone="green" />
      </div>
      <LivePanel kind="predict" className="mb-3 mt-3" />
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-3 mb-3"><RiskMatrixCard onPick={pt => { const el = document.getElementById(pt.id); el && el.scrollIntoView({ behavior: "smooth", block: "center" }); }} /><ModelAccuracyCard /></div>
      <div className="mb-3"><AnomaliesCard /></div>
      <div className="mb-3"><PredictionActionsCard list={s.predictions} onPick={id => { const el = document.getElementById(id); el && el.scrollIntoView({ behavior: "smooth", block: "center" }); }} /></div>
      <div className="mb-3"><DataCollectedCard /></div>
      <div className="mb-3"><PreventiveCalendarCard /></div>
      <div className="flex items-center gap-2 mb-3"><Tabs size="sm" value={kind} onChange={setKind} tabs={['All', ...new Set(s.predictions.map(p => p.kind))].map(k => ({ id: k, label: k, count: k === 'All' ? s.predictions.length : s.predictions.filter(p => p.kind === k).length }))} /></div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {list.map(p => { const b = p.branchId && D.BR[p.branchId]; const done = !['New', 'Watching'].includes(p.status); return (
          <Card key={p.id} pad={false}><div className="p-4 scroll-mt-32" id={p.id}>
            <div className="flex items-center gap-2 flex-wrap"><span className="font-mono text-[11.5px] text-ink3">{p.id}</span><Badge tone="amber">{p.kind}</Badge><Badge>{p.horizon}</Badge><span className="flex-1" /><Badge tone={p.status === 'New' ? 'blue' : p.status === 'Watching' ? 'purple' : done ? 'green' : 'gray'}>{p.status}</Badge></div>
            <div className="text-[14px] font-bold text-ink mt-1 font-mono">{p.target}</div>
            {b && <button onClick={() => act.openBranch(b.id)} className="text-[12px] text-info hover:underline">{b.name}, {b.brand}</button>}
            <div className="text-[12.5px] text-ink2 mt-1">{p.signal}</div><div className="mt-1"><ForecastMini p={p} /></div>
            <div className="flex items-center gap-3 mt-2 flex-wrap"><Conf value={p.conf} /><span className="text-[12px] text-ink2">Suggests: <b className="text-ink">{p.suggest}</b></span></div>
            <div className="mt-2 text-[11.5px] text-ink3 flex items-start gap-1.5"><I.Database size={12} className="mt-[2px] shrink-0" /><span>Based on {basisLine(p)}</span></div>
            <MovaActions p={p} compact />
            <div className="flex gap-2 mt-3 flex-wrap"><Btn size="sm" kind="brand" icon={I.ShieldCheck} onClick={() => setWhy(p.id)}>Why, and how to prevent it</Btn>{!done && <><Btn op size="sm" icon={I.Eye} onClick={() => watch(p)} disabled={p.status === 'Watching'}>Create watch</Btn><Btn op size="sm" icon={I.Send} onClick={() => approval(p)}>Request approval</Btn><Btn op size="sm" kind="ghost" icon={I.ThumbsDown} onClick={() => dismiss(p)}>False positive</Btn></>}</div>
          </div></Card>); })}
      </div>
      <PredictionBasisModal p={why && s.predictions.find(p => p.id === why)} onClose={() => setWhy(null)} onPrevent={prevent} onWatch={p => { watch(p); setWhy(null); }} onDismiss={p => { dismiss(p); setWhy(null); }} />
      <Card title={`Capacity forecast – ${D.BR[dal.branchId].name} (${D.BR[dal.branchId].brand}) primary WAN`} sub="p95 utilisation, 10 weeks actual + 4 weeks forecast. Hail season drives roofing demand and traffic." icon={I.LineChart} className="mt-3">
        <LineChart series={[{ name: 'p95 utilisation %', data: fc, color: C.info }]} labels={fc.map((_, k) => k < 10 ? `W-${10 - k}` : `+${k - 9}w`)} h={200} refLines={[{ v: 90, label: '90% upgrade threshold', color: C.bad }]} yFmt={v => `${Math.round(v)}%`} yMin={50} yMax={100} forecastFrom={9} />
      </Card>
    </div>
  );
}

// ───────────────────────── Knowledge ─────────────────────────
export function Knowledge() {
  const { s, act } = useApp();
  const [tab, setTab] = useState('search');
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState(null);
  const art = s.kbOpen && s.kb.find(k => k.id === s.kbOpen);
  const res = s.kb.filter(k => !q || `${k.title} ${k.body} ${k.tags.join(' ')}`.toLowerCase().includes(q.toLowerCase()));
  const sim = q.length > 2 ? s.resolved.filter(i => `${i.title} ${i.cat}`.toLowerCase().includes(q.toLowerCase()) || q.toLowerCase().split(' ').some(w => w.length > 3 && i.title.toLowerCase().includes(w))).slice(0, 8) : [];
  const publish = d => { const id = `KB00${12140 + s.kb.length}`; act.add('kb', { id, title: d.title, tags: ['auto-generated'], views: 0, rating: 0, updated: Date.now(), status: 'Published', body: d.body }); act.upd('kbDrafts', d.id, { status: 'Published as ' + id }); act.audit(`Published ${id} from ${d.id}`, id); act.toast(`${id} published`); };
  return (
    <div>
      <PageHead icon={I.BookOpen} title="Knowledge" sub="KB search, similar past incidents, problem records, and articles the Knowledge Agent wrote from resolved incidents – waiting for an engineer to review." />
      <div className="kpi-strip grid grid-cols-2 lg:grid-cols-4 mb-3">
        <Stat onClick={() => setTab('search')} label="Published articles" icon={I.FileText} value={s.kb.length} />
        <Stat label="Drafts awaiting review" icon={I.FilePen} value={s.kbDrafts.filter(d => d.status === 'Awaiting review').length} tone="amber" onClick={() => setTab('drafts')} />
        <Stat onClick={() => setTab('search')} label="Recommendation accuracy" icon={I.Target} value="83%" sub="KPI 39 target 80%" tone="green" />
        <Stat label="Problem records open" icon={I.Bug} value={s.problems.filter(p => p.state !== 'Closed').length} onClick={() => setTab('problems')} />
      </div>
      <LivePanel kind="knowledge" className="mb-3 mt-3" />
      <Tabs value={tab} onChange={setTab} className="mb-3" tabs={[{ id: 'search', label: 'Search' }, { id: 'drafts', label: 'Auto-generated drafts', count: s.kbDrafts.filter(d => d.status === 'Awaiting review').length }, { id: 'problems', label: 'Problem records', count: s.problems.length }]} />
      {tab === 'search' && <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 mb-3"><ClustersCard /><DeflectionCard /></div>}
      {tab === 'search' && <KnowledgeUseCards kb={s.kb} />}
      {tab === 'search' && <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-3">
        <Card title="Knowledge base" icon={I.Search}><SearchBox value={q} onChange={setQ} placeholder="Symptom, device, carrier… e.g. roaming, LTE, POS" className="w-full mb-3" />
          {res.map(k => <button key={k.id} onClick={() => act.set({ kbOpen: k.id })} className="w-full text-left py-2 border-b border-line/60 last:border-0 hover:bg-chip/50 px-1 rounded"><div className="flex items-center gap-2"><span className="font-mono text-[11.5px] text-ink3">{k.id}</span>{k.tags.map(t => <Badge key={t}>{t}</Badge>)}<span className="ml-auto text-[11.5px] text-ink3">★ {k.rating || '—'}, {num(k.views)} views</span></div><div className="text-[13px] font-semibold text-ink mt-0.5">{k.title}</div></button>)}
          {!res.length && <div className="text-ink3 text-[13px] py-4">No articles match.</div>}
        </Card>
        <Card title="Similar past incidents" sub="Similar-Case Indexer over resolved incidents" icon={I.History}>
          {q.length < 3 ? <div className="text-[12.5px] text-ink3">Type a symptom to see how similar incidents were fixed.</div> : sim.length ? sim.map(i => <button key={i.id} onClick={() => act.openInc(i.id)} className="w-full text-left py-1.5 border-b border-line/60 last:border-0 text-[12.5px]"><div className="flex gap-2"><span className="font-mono text-ink3">{i.id}</span><Pri p={i.pri} /><span className="ml-auto text-ink3">{i.closeCode}</span></div><div className="text-ink font-semibold">{i.title}</div><div className="text-ink3">{D.BR[i.branchId].name}, fixed in {dur(i.resolved - i.opened)}</div></button>) : <div className="text-[12.5px] text-ink3">No similar incidents in the last 7 days.</div>}
        </Card>
      </div>}
      {tab === 'drafts' && <div className="space-y-3">{s.kbDrafts.map(d => <Card key={d.id} pad={false}><div className="p-4">
        <div className="flex items-center gap-2"><span className="font-mono text-[11.5px] text-ink3">{d.id}</span><Badge tone="purple"><I.Bot size={11} />Knowledge Agent</Badge><span className="text-[11.5px] text-ink3">from {d.from}, {ago(d.created)}</span><span className="flex-1" /><Badge tone={d.status === 'Awaiting review' ? 'amber' : d.status.startsWith('Published') ? 'green' : 'gray'}>{d.status}</Badge></div>
        <div className="text-[14px] font-bold text-ink mt-1">{d.title}</div>
        {edit === d.id ? <textarea defaultValue={d.body} onBlur={e => { act.upd('kbDrafts', d.id, { body: e.target.value }); setEdit(null); }} className="w-full mt-2 h-28 p-2 rounded-md border border-line bg-canvas text-ink text-[12.5px]" autoFocus /> : <p className="text-[12.5px] text-ink2 mt-1">{d.body}</p>}
        <div className="flex items-center gap-3 mt-2"><Conf value={d.conf} />{d.status === 'Awaiting review' && <><Btn op size="sm" kind="ok" icon={I.Check} onClick={() => publish(d)}>Approve & publish</Btn><Btn op size="sm" icon={I.Pencil} onClick={() => setEdit(d.id)}>Edit</Btn><Btn op size="sm" kind="ghost" icon={I.X} onClick={() => { act.upd('kbDrafts', d.id, { status: 'Rejected' }); act.audit(`Rejected ${d.id}`, d.id); }}>Reject</Btn></>}</div>
      </div></Card>)}</div>}
      {tab === 'problems' && <Card pad={false}><div className="p-3"><Table rows={s.problems} cols={[{ key: 'id', label: 'Problem', render: p => <span className="font-mono text-[12px] font-semibold">{p.id}</span> }, { key: 'title', label: 'Title' }, { key: 'incidents', label: 'Linked incidents', right: true }, { key: 'owner', label: 'Owner' }, { key: 'opened', label: 'Opened', render: p => <span className="text-[12px] text-ink3">{ago(p.opened)}</span> }, { key: 'state', label: 'State', render: p => <Select op value={p.state} onChange={v => { act.upd('problems', p.id, { state: v }); act.audit(`${p.id} → ${v}`, p.id); }} options={['New', 'Root cause analysis', 'Known error', 'Fix in progress', 'Closed']} /> }]} /></div></Card>}
      <Modal open={!!art} onClose={() => act.set({ kbOpen: null })} title={art && art.title} sub={art && `${art.id}, updated ${dateShort(art.updated)}, ${art.tags.join(', ')}`} footer={art && <><Btn icon={I.ThumbsUp} onClick={() => { act.toast('Thanks – feedback recorded'); act.set({ kbOpen: null }); }}>Helpful</Btn><Btn icon={I.ThumbsDown} onClick={() => { act.toast('Feedback recorded – sent to Knowledge Agent', 'info'); act.set({ kbOpen: null }); }}>Not helpful</Btn></>}>
        {art && <div className="text-[13px] text-ink leading-6 whitespace-pre-line">{art.body.replace(/(\d\))/g, '\n$1')}</div>}
      </Modal>
    </div>
  );
}

// ───────────────────────── Automation library ─────────────────────────
export function Automation({ embedded }) {
  const { s, act } = useApp();
  const now = useNow();
  const [sel, setSel] = useState(s.autoSel && s.runbooks.some(r => r.id === s.autoSel) ? s.autoSel : 'RB-101');
  const [target, setTarget] = useState(D.BRANCHES[10].id);
  const [prog, setProg] = useState(-1);
  const rb = s.runbooks.find(r => r.id === sel);
  const b = D.BR[target];
  const g = gate(s, { kind: rb.kind, conf: 0.9, branchId: target, now });
  const hist = useMemo(() => { const R = rng(sel.length * 97 + sel.charCodeAt(4)); return Array.from({ length: 8 }, (_, k) => { const bb = D.BRANCHES[R.int(0, 899)]; return { id: k, t: Date.now() - (k + 1) * R.int(2, 9) * HR, branch: `${bb.name}, ${bb.brand}`, by: R() < 0.6 ? 'Agent (auto)' : R.pick(D.ENGINEERS), res: R() < rb.success ? 'Success' : 'Failed', dur: rb.avg }; }); }, [sel]);
  const runs = [...s.runs.filter(r => r.rb === sel), ...hist];
  const run = approved => { setProg(0); rb.steps.forEach((_, k) => setTimeout(() => setProg(k + 1), 600 * (k + 1))); setTimeout(() => { setProg(-1); act.add('runs', { id: Date.now(), rb: sel, t: Date.now(), branchId: b.id, branch: `${b.name}, ${b.brand}`, by: approved ? act.me() : 'Agent (auto)', res: 'Success', dur: `${(rb.steps.length * 0.6).toFixed(1)} s` }); act.audit(`${approved ? 'Approved and ran' : 'Ran'} ${sel} on ${b.name}`, sel); act.toast(`${sel} completed on ${b.name}`); }, 600 * (rb.steps.length + 1)); };
  return (
    <div>
      {!embedded && <PageHead icon={I.Workflow} title="Automation Library" sub="Runbooks with run history, success rate and autonomy level. Autonomy is capped by the gates: below 80% confidence, branch hours and freeze windows always need a human." />}
      <div className="kpi-strip grid grid-cols-2 lg:grid-cols-4 mb-3">
        <Stat onClick={() => act.setTab('catalogue', 'list')} label="Runbooks" icon={I.BookMarked} value={s.runbooks.length} />
        <Stat onClick={() => act.drill({ t: 'incidents', k: 'auto7' })} label="Runs (30 days)" icon={I.Play} value={num(s.runbooks.reduce((a, r) => a + r.runs30, 0))} />
        <Stat label="Auto-resolution rate" icon={I.Bot} onClick={() => act.drill({ t: 'incidents', k: 'auto7' })} value="23.1%" sub="KPI 37 target 25% – trending up" tone="amber" />
        <Stat onClick={() => act.setTab('catalogue', 'list')} label="Automation coverage" icon={I.Layers} value="42%" sub="KPI 37 target 40%" tone="green" />
      </div>
      <LivePanel kind="automation" className="mb-3 mt-3" />
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 mb-3 items-start"><AutomationRunsCard /><HoursSavedCard /><CandidatesCard /></div>
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_440px] gap-3">
        <Card pad={false}><div className="p-3"><Table rows={s.runbooks} onRow={r => setSel(r.id)} rowClass={r => r.id === sel ? 'bg-chip' : ''} cols={[
          { key: 'id', label: 'ID', className: 'whitespace-nowrap', render: r => <span className="font-mono text-[12px] font-semibold">{r.id}</span> },
          { key: 'name', label: 'Runbook', render: r => <div><div className="font-semibold">{r.name}</div><div className="text-[11px] text-ink3">{r.kind === 'change' ? 'Makes a change' : 'Read-only / notify'}</div></div> },
          { key: 'autonomy', label: 'Autonomy', render: r => <div><Badge tone={r.autonomy === 'L4' ? 'brand' : r.autonomy === 'L3' ? 'purple' : 'blue'}>{r.autonomy}</Badge><div className="text-[11px] text-ink3 leading-tight mt-0.5 max-w-[120px]">{D.AUTONOMY[r.autonomy]}</div></div> },
          { key: 'runs30', label: 'Runs 30d', right: true, render: r => num(r.runs30) },
          { key: 'success', label: 'Success', right: true, render: r => <span className={r.success < 0.9 ? 'text-bad font-semibold' : 'text-ok font-semibold'}>{pct(r.success)}</span> },
          { key: 'avg', label: 'Avg', right: true },
        ]} /></div></Card>
        <Card title={`${rb.id}, ${rb.name}`} sub={rb.desc} icon={I.Workflow}>
          <div className="flex items-center gap-2 mb-2"><span className="text-[12px] text-ink3 font-semibold">Autonomy</span><Select op value={rb.autonomy} onChange={v => { act.upd('runbooks', rb.id, { autonomy: v }); act.audit(`${rb.id} autonomy → ${v}`, rb.id); act.toast(`${rb.id} set to ${v} – ${D.AUTONOMY[v]}`, 'info'); }} options={Object.entries(D.AUTONOMY).map(([k, v]) => ({ value: k, label: `${k} – ${v}` }))} /></div>
          {rb.autonomy === 'L4' && rb.kind === 'change' && <div className="text-[12px] text-warn mb-2">L4 change runbooks only run on their own outside branch hours and freeze windows.</div>}
          <div className="text-[11.5px] font-bold text-ink3 mb-1">Steps</div>
          <ol className="space-y-1 mb-2">{rb.steps.map((st, k) => <li key={k} className="flex gap-2 text-[12.5px]">{prog > k ? <I.CheckCircle2 size={14} className="text-ok mt-0.5" /> : prog === k ? <I.Loader2 size={14} className="text-info animate-spin mt-0.5" /> : <span className="w-3.5 text-ink3 text-[11px] mt-0.5">{k + 1}.</span>}<span className="text-ink">{st}</span></li>)}</ol>
          <KV k="Rollback" v={<span className="font-normal">{rb.rollback}</span>} />
          <KV k="Verification" v={<span className="font-normal">{rb.verify.join(', ')}</span>} />
          <div className="mt-3 p-2.5 rounded-md bg-chip border border-line">
            <div className="text-[12px] font-bold text-ink mb-1.5">Run against a branch</div>
            <Select icon={I.Store} value={target} onChange={setTarget} options={D.BRANCHES.slice(0, 120).map(x => ({ value: x.id, label: `${x.name}, ${x.brand}` }))} className="w-full mb-2" />
            <div className="text-[11.5px] text-ink3 mb-2">Local time {branchClock(b, now).local} – {branchClock(b, now).open ? 'open' : 'closed'}</div>
            <GateBox g={g} compact />
            <div className="flex gap-2 mt-2">{g.auto ? <Btn kind="ok" icon={I.Play} disabled={prog >= 0} onClick={() => run(false)}>Run</Btn> : <Btn kind="ok" icon={I.ShieldCheck} disabled={prog >= 0} onClick={() => run(true)}>Approve & run</Btn>}<Btn op icon={I.FlaskConical} onClick={() => act.toast(`Dry run of ${rb.id}: pre-checks pass, no change made`, 'info')}>Dry run</Btn></div>
          </div>
          <div className="text-[11.5px] font-bold text-ink3 mt-3 mb-1">Run history</div>
          <div className="max-h-48 overflow-y-auto">{runs.map(r => <div key={r.id} className="flex items-center gap-2 text-[12px] py-1 border-b border-line/60"><span className="text-ink3 w-16">{ago(r.t, now)}</span><span className="flex-1 truncate text-ink">{r.branch}</span><span className="text-ink3">{r.by}</span><Badge tone={r.res === 'Success' ? 'green' : 'red'}>{r.res}</Badge></div>)}</div>
        </Card>
      </div>
    </div>
  );
}

// ───────────────────────── SLA & KPI tracker ─────────────────────────
const SL_TONE = { 'Meets ESL': 'green', 'Above MSL': 'amber', 'Below MSL': 'red', 'Below target': 'amber' };
const slPct = (v, m) => v == null ? '—' : `${(v * 100).toFixed(m.fmt || (m.esl > 0.999 ? 3 : 1))}%`;

// the AI and automation SLAs: Mova iO triage and routing, auto-remediation, AIOps and knowledge
function AIAutomationCard({ P, onSel }) {
  const rows = P.sla.filter(x => x.ai);
  return (
    <Card title="AI and automation SLAs" icon={I.Sparkles} sub={`The ${P.n}-month average against the expected level, month by month. ${rows.filter(x => x.status === 'Meets ESL').length} of ${rows.length} meet ESL.`}>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-6">{rows.map(x => (
        <button key={x.m.name} onClick={() => onSel(D.SLA.indexOf(x.m))} className="w-full grid grid-cols-[minmax(0,1fr)_70px_96px] gap-2 items-center py-2 text-left hover:bg-chip/60 rounded px-1 border-b border-line">
          <span className="min-w-0"><span className="block text-[12.5px] font-semibold text-ink truncate">{x.m.name}</span><span className="block text-[11px] text-ink3">{x.m.line.replace('Network ', '')} · ESL {x.m.lower ? '≤ ' : ''}{slPct(x.m.esl, x.m)} · {x.met} of {P.n} months · this month {slPct(x.latest, x.m)}</span></span>
          <Spark data={x.series} w={70} h={22} color={x.status === 'Meets ESL' ? C.ok : C.warn} fill={false} />
          <span className="text-right"><b className={cx('text-[14px] tabular-nums', x.status === 'Meets ESL' ? 'text-ok' : 'text-warn')}>{slPct(x.avg, x.m)}</b><span className="block"><Badge tone={SL_TONE[x.status]}>{x.status}</Badge></span></span>
        </button>))}</div>
    </Card>
  );
}

// what the tickets were about, and how many came in as store calls
function CallDriversCard({ P }) {
  const mx = Math.max(...P.drivers.map(d => d.tickets));
  return (
    <Card title="Top call drivers" icon={I.PhoneCall} sub={`${num(P.tickets)} network tickets, ${P.from} to ${P.to}. Bars are tickets; the darker part came in as store calls.`}>
      <div className="space-y-2">{P.drivers.map((d, i) => (
        <div key={d.k} className="text-[12px]">
          <div className="flex items-baseline gap-2"><span className="text-ink3 w-4 text-right tabular-nums">{i + 1}</span><span className="flex-1 min-w-0 truncate font-semibold text-ink">{d.label}</span><b className="tabular-nums text-ink">{num(d.tickets)}</b><span className="text-ink3 w-11 text-right tabular-nums">{(d.share * 100).toFixed(0)}%</span></div>
          <div className="ml-6 h-2 rounded bg-chip overflow-hidden relative"><div className="absolute inset-y-0 left-0 bg-info/45" style={{ width: `${d.tickets / mx * 100}%` }} /><div className="absolute inset-y-0 left-0 bg-info" style={{ width: `${d.storeCalls / mx * 100}%` }} /></div>
          <div className="ml-6 text-[11px] text-ink3">{num(d.storeCalls)} store calls · {d.auto ? `${num(d.autoFixed)} auto-resolved` : 'needs an engineer or carrier'}</div>
        </div>))}</div>
    </Card>
  );
}

// the branches with the most network tickets in the period
function ProblemBranchesCard({ P }) {
  const { s, act } = useApp();
  return (
    <Card title="Branches with the most problems" icon={I.Store} sub={`Network tickets in the last ${P.n} months. Click a branch to open Branch 360.`} pad={false}>
      <div className="p-2"><Table dense sortable={false} rows={P.branches.slice(0, 12).map((x, i) => ({ ...x, id: x.b.id, rank: i + 1 }))} onRow={x => act.openBranch(x.b.id)} cols={[
        { key: 'rank', label: '#', render: x => <span className="text-ink3">{x.rank}</span> },
        { key: 'b', label: 'Branch', render: x => <div><div className="font-semibold">{x.b.name}</div><div className="text-[11px] text-ink3">{x.b.brand} · {x.b.region}</div></div> },
        { key: 'driver', label: 'Main cause', render: x => <div><div className="text-[12px]">{x.driver}</div>{x.repeat && <Badge tone="amber">Repeat-offender line</Badge>}</div> },
        { key: 'tickets', label: 'Tickets', right: true, render: x => <b>{x.tickets}</b> },
        { key: 'h', label: 'Now', render: x => { const h = healthOf(s, x.b); return <Badge tone={h === 'up' ? 'green' : h === 'down' ? 'red' : 'amber'}>{h === 'up' ? 'Healthy' : h === 'down' ? 'Down' : 'Degraded'}</Badge>; } },
      ]} /></div>
    </Card>
  );
}

const VIEW = {
  service: { label: 'Service SLAs and KPIs', icon: I.Headset, sub: 'Response, resolution, alerts, credits', lines: l => /Operations & Incident|Monitoring & Event/.test(l) },
  network: { label: 'Network performance', icon: I.Network, sub: 'Availability, firmware, backups', lines: l => /Device Management/.test(l) },
  ai: { label: 'AI and automation', icon: I.Sparkles, sub: 'Triage, auto-resolution, AIOps, knowledge', lines: l => HIST.AI_LINE.test(l) },
};
export function SLATracker() {
  const { s, act } = useApp();
  const now = useNow();
  const [view, setView] = useState(s.tab.sla && VIEW[s.tab.sla] ? s.tab.sla : 'service');
  const [sel, setSel] = useState(0);
  const [per, setPer] = useState(6);
  const P = useMemo(() => HIST.period(per), [per]);
  const status = m => { if (m.lower) return m.act <= m.esl ? 'Meets ESL' : 'Below target'; if (m.act >= m.esl) return 'Meets ESL'; if (m.msl != null && m.act >= m.msl) return 'Above MSL'; return m.msl == null ? 'Below target' : 'Below MSL'; };
  const tone = st => ({ 'Meets ESL': 'green', 'Above MSL': 'amber', 'Below MSL': 'red', 'Below target': 'amber' }[st]);
  const f = (v, m) => v == null ? '—' : `${(v * 100).toFixed(m.fmt || 1)}%`;
  const open = s.incidents.filter(i => i.state !== 'Resolved');
  const queues = ['P1', 'P2', 'P3', 'P4'].map(p => { const l = open.filter(i => i.pri === p).map(i => ({ i, c: slaClock(i, now) })); return { p, n: l.length, risk: l.filter(x => clockState(x.i, now) === 'atRisk').length, breached: l.filter(x => x.c.resLeft <= 0).length, respRisk: l.filter(x => !x.i.acked && x.c.respLeft < 5 * MIN).length, list: l }; });
  const m = D.SLA[sel];
  const lines = [...new Set(D.SLA.map(x => x.line))];
  // every SLA figure on this page is for the period picked: the average of its months (the current month is shown alongside)
  const when = `average of the last ${per} months`;
  const L = useMemo(() => D.SLA.map((x, k) => ({ ...x, act: P.sla[k].avg, trend: P.sla[k].series, month: x.act })), [P]);
  const meets = L.filter(x => status(x) === 'Meets ESL').length, meetsNow = D.SLA.filter(x => status(x) === 'Meets ESL').length;
  const dipped = P.sla.filter(x => x.series.some(v => HIST.slaStatusAt(x.m, v) === 'Below MSL'));
  const dipMonths = P.sla.reduce((a, x) => a + x.series.filter(v => HIST.slaStatusAt(x.m, v) === 'Below MSL').length, 0);
  const SHARE = { P1: 0.02, P2: 0.08, P3: 0.45, P4: 0.45 };
  const late = Math.round(P.byMonth.reduce((a, mo, i) => a + mo.total * ['P1', 'P2', 'P3', 'P4'].reduce((b, q) => { const r = P.sla.find(x => x.m.queue === q && /resolution/.test(x.m.name)); return b + SHARE[q] * (1 - r.series[i]); }, 0), 0));
  const avail = L.find(x => x.n === 29), availNow = D.SLA.find(x => x.n === 29);
  // three views of the same service levels; each shows only its own metrics and the cards that matter for it
  const vcount = k => L.filter(x => VIEW[k].lines(x.line));
  const LV = vcount(view).map(x => ({ ...x, _i: D.SLA.findIndex(y => y.n === x.n && y.name === x.name) }));
  const selV = LV.findIndex(x => x._i === sel) >= 0 ? sel : LV[0]._i;
  const onSelV = k => setSel(LV[k]._i);
  const mv = D.SLA[selV];
  const vMeets = LV.filter(x => status(x) === 'Meets ESL').length, vDipped = dipped.filter(x => VIEW[view].lines(x.m.line));
  const tileOf = (n, name, label) => { const x = L.find(y => y.n === n && (!name || name.test(y.name))); if (!x) return null; const st = status(x); return <Stat key={label} label={`${label}, ${per} months`} icon={I.Activity} onClick={() => act.drill({ t: 'metric', i: D.SLA.indexOf(D.SLA.find(y => y.n === x.n && y.name === x.name)), per })} value={f(x.act, x)} sub={`${x.lower ? '≤ ' : ''}ESL ${f(x.esl, x)}; this month ${f(x.month, x)}`} tone={tone(st)} />; };
  const head = [
    <Stat key="meet" label={`Meeting ESL, ${per} months`} icon={I.CheckCircle2} onClick={() => act.drill({ t: 'sla', per })} value={`${vMeets}/${LV.length}`} tone={vMeets >= LV.length * 0.75 ? 'green' : 'amber'} sub={`of the ${LV.length} ${view === "ai" ? "AI and automation" : view === "network" ? "network" : "service"} metrics, on the ${per}-month average`} />,
    ...(view === 'service' ? [
      <Stat key="late" label={`Tickets resolved outside SLA, ${per} months`} icon={I.AlarmClock} onClick={() => act.drill({ t: 'incidents', k: 'atRisk' })} value={num(late)} tone="amber" sub={`${pct(late / Math.max(1, P.tickets), 1)} of ${num(P.tickets)} tickets; ${queues.reduce((a, q) => a + q.risk, 0)} open now at breach risk`} />,
      <Stat key="mttr" label={`Time to restore P1, ${per} months`} icon={I.Timer} onClick={() => act.drill({ t: 'mttr' })} value={`${(P.mttr.P1.reduce((a, v) => a + v, 0) / P.mttr.P1.length).toFixed(1)} h`} sub="target 4 h" tone="green" />,
      <Stat key="dip" label={`Below MSL, ${per} months`} icon={I.XCircle} onClick={() => act.drill({ t: 'sla', per })} value={vDipped.length} tone={vDipped.length ? 'red' : 'green'} sub={vDipped.length ? 'metrics below MSL in at least one month' : `none in the last ${per} months`} />,
    ] : view === 'network' ? [
      <Stat key="av" label={`Critical availability (#29), ${per} months`} icon={I.Activity} onClick={() => act.drill({ t: 'metric', i: D.SLA.findIndex(x => x.n === 29), per })} value={f(avail.act, { fmt: 3 })} sub={`this month ${f(availNow.act, { fmt: 3 })}; MSL 99%, ESL 99.99%`} tone={tone(status(avail))} />,
      tileOf(32, null, 'Firmware compliance (#32)'), tileOf(33, null, 'Config backup success (#33)'),
    ] : [
      tileOf(37, /Auto-resolution/, 'Auto-resolution rate'), tileOf(38, /noise/, 'Alert noise reduction'), tileOf(38, /Predictive/, 'Predictive alert accuracy'),
    ])].filter(Boolean);
  return (
    <div>
      <PageHead icon={I.Gauge} title="SLA & KPI Tracker" sub="Pick what to look at: the service SLAs and KPIs, network performance, or the AI and automation SLAs. Every figure is the average of the 3, 6, 9 or 12 months you pick, with this month alongside." right={<><Tabs size="sm" value={per} onChange={setPer} tabs={HIST.PERIODS.map(n => ({ id: n, label: `${n} months` }))} /><Btn size="sm" kind="primary" icon={I.FileDown} onClick={() => { downloadSlaReport(per, s, healthOf); act.audit(`Downloaded the SLA & KPI report, last ${per} months`, 'sla'); act.toast(`SLA & KPI report, last ${per} months, downloaded`); }}>Download PDF report</Btn><ExportBtn onClick={() => exportCSV(`srs-annexure-b-sla-${per}-months.csv`, L, [{ label: '#', key: 'n' }, { label: 'Service line', key: 'line' }, { label: 'Metric', key: 'name' }, { label: 'Definition', key: 'def' }, { label: 'MSL', get: x => x.msl == null ? '' : x.msl }, { label: 'ESL', key: 'esl' }, { label: `Average, last ${per} months`, get: x => +x.act.toFixed(5) }, { label: 'This month', key: 'month' }, ...P.months.map((mo, i) => ({ label: mo.label, get: x => x.trend[i] })), { label: 'Class', key: 'cls' }, { label: `Status (${per}-month average)`, get: status }])} /></>} />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">{Object.entries(VIEW).map(([k, v]) => { const xs = vcount(k), met = xs.filter(x => status(x) === 'Meets ESL').length, on = view === k; return (
        <button key={k} onClick={() => { setView(k); act.setTab('sla', k); }} aria-pressed={on} className={cx('text-left rounded-md border p-3 bg-panel', on ? 'border-ink ring-1 ring-ink' : 'border-line hover:border-ink3')}>
          <div className="flex items-center gap-2"><v.icon size={16} className="text-brand" /><span className="font-bold text-[14px] text-ink flex-1">{v.label}</span><span className={cx('text-[12px] font-bold rounded px-1.5', met === xs.length ? 'bg-ok/15 text-ok' : 'bg-warn/15 text-warn')}>{met}/{xs.length} meet ESL</span></div>
          <div className="text-[12px] text-ink2 mt-1 leading-[16px]">{v.sub}</div>
        </button>); })}</div>
      <div className="kpi-strip grid grid-cols-2 lg:grid-cols-4 mb-3">{head}</div>
      <div className="mb-3"><SLAScorecard sel={LV.findIndex(x => x._i === selV)} onSel={onSelV} list={LV} when={when} /></div>
      {view === 'service' && <>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 mb-3 items-stretch [&>*]:h-full"><SLAPriorityCard list={L} when={when} /><CreditHeadroomCard list={LV} when={when} /></div>
      <Card title="Breach risk by queue (live)" icon={I.AlarmClock} className="mb-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">{queues.map(q => <div key={q.p} className="border border-line rounded-md p-3">
          <div className="flex items-center gap-2"><Pri p={q.p} /><span className="text-[12px] text-ink3">{D.slaOf(q.p).resp / MIN} min / {dur(D.slaOf(q.p).res)}</span></div>
          <div className="flex gap-4 mt-2 text-[12.5px]"><div><div className="text-[20px] font-extrabold text-ink">{q.n}</div><div className="text-ink3">open</div></div><div><div className="text-[20px] font-extrabold text-warn">{q.risk}</div><div className="text-ink3">at risk</div></div><div><div className="text-[20px] font-extrabold text-bad">{q.breached}</div><div className="text-ink3">breached</div></div></div>
          {q.respRisk > 0 && <div className="text-[11.5px] text-bad mt-1">{q.respRisk} close to missing response</div>}
          <div className="mt-2 space-y-1">{q.list.filter(x => x.c.used > 0.5).slice(0, 3).map(x => <button key={x.i.id} onClick={() => act.openInc(x.i.id)} className="w-full text-left text-[11.5px] flex gap-1.5 hover:underline"><span className="font-mono text-ink3">{x.i.id}</span><span className={x.c.resLeft < 0 ? 'text-bad' : 'text-warn'}>{x.c.resLeft < 0 ? 'breached' : dur(x.c.resLeft)}</span></button>)}</div>
        </div>)}</div>
      </Card>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 mb-3"><MTTRTrendCard P={P} /><TicketsAutoCard P={P} /></div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 mb-3 items-start"><CallDriversCard P={P} /><ProblemBranchesCard P={P} /></div>
      </>}
      {view === 'network' && <>
                <div className="mb-3"><ErrorBudgets /></div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 mb-3 items-start"><ProblemBranchesCard P={P} /><CallDriversCard P={P} /></div>
      </>}
      {view === 'ai' && <>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 mb-3 items-stretch"><TicketsAutoCard P={P} /><MTTRTrendCard P={P} /></div>
      </>}
      {view === 'network' ? <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-3 mb-3 items-stretch [&>*]:h-full"><CalendarHeat P={P} /><SLAHeatCard onSel={onSelV} list={LV} months={P.months.map(x => x.m)} /></div>
        : <div className="mb-3"><SLAHeatCard onSel={onSelV} list={LV} months={P.months.map(x => x.m)} /></div>}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 mb-3 items-stretch [&>*]:h-full">
        <SLAProjectionCard m={mv} series={P.sla[selV].series} labels={P.months.map(x => x.m)} />
        {(() => { const x = L.find(y => y.n === mv.n && y.name === mv.name), st = status(x), met = P.sla[selV].series.filter(v => HIST.slaStatusAt(mv, v) === 'Meets ESL').length; return (
          <Card title={`#${mv.n} ${mv.name}`} sub={mv.line.replace('Network ', '')} right={<Badge tone={tone(st)}>{st}</Badge>}>
            <div className="text-[12.5px] text-ink2 mb-3">{mv.def}</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">{[['Minimum (MSL)', mv.msl == null ? 'None (KPI)' : f(mv.msl, mv)], ['Expected (ESL)', `${mv.lower ? '≤ ' : ''}${f(mv.esl, mv)}`], [`Average, ${per} months`, f(x.act, mv)], ['This month', f(mv.act, mv)]].map(([k, v]) => <div key={k} className="border border-line rounded-md px-3 py-2"><div className="text-[11.5px] text-ink3">{k}</div><div className="text-[17px] font-bold text-ink tabular-nums">{v}</div></div>)}</div>
            <div className="grid grid-cols-2 gap-2 mt-2 text-[12.5px]"><div className="border border-line rounded-md px-3 py-2"><div className="text-[11.5px] text-ink3">Months at ESL</div><div className="text-[17px] font-bold tabular-nums" style={{ color: met === per ? 'rgb(var(--ok))' : 'rgb(var(--warn))' }}>{met} of {per}</div></div><div className="border border-line rounded-md px-3 py-2"><div className="text-[11.5px] text-ink3">Class</div><div className="text-[14px] font-bold text-ink">{mv.cls}</div></div></div>
            <div className="flex gap-2 mt-3"><Btn size="sm" icon={I.Layers} onClick={() => act.drill({ t: 'metric', i: selV, per })}>Open the detail</Btn>{mv.queue && <Btn size="sm" icon={I.Siren} onClick={() => act.drill({ t: 'incidents', k: 'open', pri: mv.queue })}>Open {mv.queue} incidents</Btn>}</div>
          </Card>); })()}
      </div>
      <div>
        <Card pad={false}><div className="p-3">{lines.filter(l => VIEW[view].lines(l)).map(l => <div key={l} className="mb-3"><div className="text-[12px] font-bold text-ink3 px-2 py-1">{l}</div>
          <Table dense sortable={false} rows={L.map((x, k) => ({ ...x, id: k })).filter(x => x.line === l)} onRow={x => setSel(x.id)} rowClass={x => x.id === sel ? 'bg-chip' : ''} cols={[
            { key: 'n', label: '#', render: x => <span className="text-ink3">{x.n}</span> },
            { key: 'name', label: 'Metric', render: x => <div><div className="font-semibold">{x.name}</div><div className="text-[11px] text-ink3">{x.def}</div></div> },
            { key: 'msl', label: 'MSL', right: true, render: x => f(x.msl, x) }, { key: 'esl', label: 'ESL', right: true, render: x => x.lower ? `≤ ${f(x.esl, x)}` : f(x.esl, x) },
            { key: 'act', label: `Actual, ${per} mo avg`, right: true, render: x => <div><b>{f(x.act, x)}</b><div className="text-[10.5px] text-ink3">this month {f(x.month, x)}</div></div> },
            { key: 'trend', label: `${per} mo`, render: x => <Spark data={HIST.SLA12[x.id].series.slice(-per)} w={70} h={20} color={tone(status(x)) === 'green' ? C.ok : C.warn} fill={false} /> },
            { key: 'st', label: 'Status', render: x => <Badge tone={tone(status(x))}>{status(x)}</Badge> },
            { key: 'cls', label: 'Class', render: x => <span className="text-[11px] text-ink3">{x.cls}</span> },
          ]} /></div>)}</div></Card>
      </div>
    </div>
  );
}

// ───────────────────────── Reports ─────────────────────────
export function Reports() {
  const { s, act } = useApp();
  const now = useNow();
  const [tab, setTab] = useState(s.tab.reports || 'handover');
  React.useEffect(() => { if (s.tab.reports) setTab(s.tab.reports); }, [s.tab.reports]);
  const ref = useRef(null);
  // executive summary for leaders (CEO, CIO): the picture and the key points; full detail adds every table and timeline
  const brief = s.tab.reportsLevel === 'exec';
  const [critDays, setCritDays] = useState(30);
  const open = s.incidents.filter(i => i.state !== 'Resolved');
  const res24 = s.resolved.filter(i => i.resolved > now - DAY);
  const titles = { handover: 'Shift handover', daily: 'Daily operations summary', weekly: 'Weekly service review pack', critical: 'Critical incidents (P1 / P2)', biab: 'Branch-in-a-Box onboarding report', audit: 'Audit log' };
  const exportHtml = () => { const html = `<!doctype html><html><head><meta charset="utf-8"><title>SRS – ${titles[tab]}</title><style>body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:32px;max-width:960px}h1{color:#762123}h2{border-bottom:2px solid #762123;padding-bottom:4px;margin-top:24px}table{border-collapse:collapse;width:100%;font-size:12px}td,th{border:1px solid #ddd;padding:5px 7px;text-align:left}th{background:#f3f3f3}.muted{color:#666}</style></head><body>${ref.current.innerHTML}</body></html>`; downloadFile(`srs-${tab}-${new Date().toISOString().slice(0, 10)}.html`, html, 'text/html'); act.audit(`Exported report: ${titles[tab]}`, tab); act.toast('Report downloaded'); };
  const H = ({ children }) => <h2 className="text-[15px] font-extrabold text-ink border-b-2 border-brand pb-1 mt-5 mb-2">{children}</h2>;
  const T = ({ rows, cols }) => <table className="w-full text-[12px] border-collapse"><thead><tr>{cols.map(c => <th key={c[0]} className="text-left border border-line bg-chip px-2 py-1 font-semibold text-ink">{c[0]}</th>)}</tr></thead><tbody>{rows.map((r, k) => <tr key={k}>{cols.map(c => <td key={c[0]} className="border border-line px-2 py-1 text-ink align-top">{c[1](r)}</td>)}</tr>)}</tbody></table>;
  const bl = id => `${D.BR[id].name}, ${D.BR[id].brand}`;
  const PRI_C = { P1: RC.red, P2: RC.amber, P3: RC.blue, P4: RC.grey };
  const allInc = [...s.incidents, ...s.resolved];
  const hourly = (hrs, list, keyFn) => Array.from({ length: hrs }, (_, k) => { const t0 = now - (hrs - k) * HR; const row = { label: String(parts(t0 + HR).h).padStart(2, '0') }; list.filter(x => x.t >= t0 && x.t < t0 + HR).forEach(x => { const kk = keyFn(x); row[kk] = (row[kk] || 0) + 1; }); return row; });
  return (
    <div>
      <PageHead icon={I.FileText} title="Reports" sub="Built from live console data. Download as HTML (opens in Word or a browser), CSV, or print to PDF."
        right={tab !== 'audit' ? <><Btn icon={I.Download} onClick={exportHtml}>Download HTML</Btn><Btn icon={I.Printer} onClick={() => window.print()}>Print / PDF</Btn></> : <ExportBtn onClick={() => exportCSV('srs-audit-log.csv', s.audit, [{ label: 'Time', get: a => dt(a.t) }, { label: 'Who', key: 'who' }, { label: 'What', key: 'what' }, { label: 'Ref', key: 'ref' }])} />} />
      <Tabs value={tab} onChange={t => { setTab(t); act.setTab('reports', t); }} className="mb-3" tabs={Object.entries(titles).map(([id, label]) => ({ id, label }))} />
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="inline-flex rounded-md bg-chip p-0.5 text-[12.5px] font-bold" role="group" aria-label="Level of detail">{[['exec', 'Executive summary'], ['full', 'Full detail']].map(([k, l]) => <button key={k} aria-pressed={(brief ? 'exec' : 'full') === k} onClick={() => act.setTab('reportsLevel', k)} className={cx('px-3 py-1.5 rounded', (brief ? 'exec' : 'full') === k ? 'bg-panel text-ink shadow-sm' : 'text-ink3 hover:text-ink')}>{l}</button>)}</div>
        <span className="text-[12px] text-ink3">{brief ? 'For leaders: the picture and the key points.' : 'Every table and timeline.'}</span>
        {tab === 'critical' && <div className="inline-flex rounded-md bg-chip p-0.5 text-[12.5px] font-bold ml-auto" role="group" aria-label="Period">{[7, 30, 90].map(d => <button key={d} aria-pressed={critDays === d} onClick={() => setCritDays(d)} className={cx('px-3 py-1.5 rounded', critDays === d ? 'bg-panel text-ink shadow-sm' : 'text-ink3 hover:text-ink')}>Last {d} days</button>)}</div>}
      </div>
      <div className="bg-panel border border-line rounded-md p-6 print-area" ref={ref}>
        <div className="flex items-start gap-3 border-b border-line pb-3"><div className="flex-1"><h1 className="text-[22px] font-black text-brand dark:text-[#e8a3a5]">SRS Distribution – {titles[tab]}{brief && tab !== 'audit' ? ': executive summary' : ''}</h1><div className="text-[12px] text-ink3">Managed Network Services, operated by Movate, generated {dt(now)} CT by {act.me()}{tab === 'critical' ? ` · last ${critDays} days` : ''}</div></div></div>
        {tab === 'handover' && <>
          <RRow>
            <RDonut title="Open incidents by priority" data={['P1', 'P2', 'P3', 'P4'].map(p => ({ label: p, value: open.filter(i => i.pri === p).length, color: PRI_C[p] }))} center={open.length} sub="open" />
            <RHBars title="SLA clock used, P1 and P2" rows={open.filter(i => i.pri <= 'P2').slice(0, 8).map(i => { const c = slaClock(i, now); const u = Math.round(c.used * 100); return { label: `${i.id.slice(-4)} ${D.BR[i.branchId].name}`, value: u, color: u >= 100 ? RC.red : u > 75 ? RC.amber : RC.green }; })} max={100} fmt={v => `${v}%`} mark={75} markLabel="75% used: at risk" />
            <RBars title="Incidents opened per hour, last 12 hours" data={hourly(12, allInc.map(i => ({ t: i.opened, pri: i.pri })), x => x.pri)} keys={['P1', 'P2', 'P3', 'P4']} colors={[RC.red, RC.amber, RC.blue, RC.grey]} />
          </RRow>
          <H>Summary</H>
          <p className="text-[13px] text-ink">{open.length} incidents open ({['P1', 'P2', 'P3', 'P4'].map(p => `${open.filter(i => i.pri === p).length} ${p}`).join(', ')}). {res24.length} resolved in the last 24 h. {s.approvals.filter(a => a.status === 'Pending').length} actions waiting for approval. {s.cases.filter(c => !c.closed).length} carrier cases open. {s.workOrders.filter(w => w.status !== 'Completed').length} field visits open.</p>
          <H>Open P1 / P2 and anything near breach</H>
          <T rows={open.filter(i => i.pri <= 'P2' || slaClock(i, now).used > 0.6)} cols={[['Number', i => i.id], ['Pri', i => i.pri], ['Branch', i => bl(i.branchId)], ['Title', i => i.title], ['State', i => i.state], ['Owner', i => i.assignee || '—'], ['Time left', i => { const c = slaClock(i, now); return c.resLeft < 0 ? 'BREACHED' : dur(c.resLeft); }], ['Next step', i => i.carrierCase ? `Chase ${i.carrierCase}` : i.workOrder ? `Field: ${i.workOrder}` : i.rbState === 'proposed' ? `Decide on ${i.runbook}` : 'Monitor']]} />
          {!brief && <><H>Waiting on a human</H>
          <T rows={s.approvals.filter(a => a.status === 'Pending')} cols={[['ID', a => a.id], ['Action', a => a.title], ['Why', a => a.why.join('; ')], ['Confidence', a => `${Math.round(a.conf * 100)}%`]]} />
          <H>Carrier cases</H>
          <T rows={s.cases.filter(c => !c.closed)} cols={[['Ticket', c => c.id], ['Carrier', c => c.carrier], ['Branch', c => bl(c.branchId)], ['Status', c => c.status], ['ETA', c => c.eta ? (now > c.eta ? `late ${dur(now - c.eta)}` : dur(c.eta - now)) : '—']]} /></>}
        </>}
        {tab === 'daily' && <>
          {(() => { const h = { up: 0, degraded: 0, down: 0 }; D.BRANCHES.forEach(b => h[healthOf(s, b)]++); const byCar = {}; D.BRANCHES.forEach(b => [0, 1].forEach(k => { const c = lineOf(s, b, k); if (c.status !== 'Up') byCar[c.carrier] = (byCar[c.carrier] || 0) + 1; })); const cats = {}; [...res24, ...open.filter(i => i.opened > now - DAY)].forEach(i => { cats[i.cat] = (cats[i.cat] || 0) + 1; }); const pal = [RC.blue, RC.navy, RC.teal, RC.amber, RC.brand, RC.grey, RC.green]; return <RRow>
            <RDonut title="Branch health now" data={[{ label: 'Healthy', value: h.up, color: RC.green }, { label: 'Degraded', value: h.degraded, color: RC.amber }, { label: 'Down', value: h.down, color: RC.red }]} center={num(h.up)} sub="healthy" />
            <RBars title="Incidents opened per hour, last 24 hours" data={hourly(24, allInc.map(i => ({ t: i.opened, st: i.state === 'Resolved' ? 'Resolved' : 'Still open' })), x => x.st)} keys={['Resolved', 'Still open']} colors={[RC.green, RC.amber]} />
            <RDonut title="Incidents by category, last 24 hours" data={Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v], i) => ({ label: k, value: v, color: pal[i] }))} />
            <RHBars title="Lines down or degraded, by carrier" rows={Object.entries(byCar).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: k, value: v, color: RC.amber }))} />
          </RRow>; })()}
          <H>Network health</H>
          {(() => { const h = { up: 0, degraded: 0, down: 0 }; D.BRANCHES.forEach(b => h[healthOf(s, b)]++); return <p className="text-[13px] text-ink">{num(h.up)} branches healthy, {h.degraded} degraded, {h.down} down. {D.BRANCHES.filter(b => circuitOf(s, b.wan[0]).status !== 'Up').length} branches on their backup path. Alert noise reduced 71% by correlation.</p>; })()}
          {brief ? <p className="text-[13px] text-ink">{res24.length + open.filter(i => i.opened > now - DAY).length} incidents in the last 24 hours, {[...res24, ...open.filter(i => i.opened > now - DAY)].filter(i => i.pri <= 'P2').length} of them P1 or P2. The full report lists each one.</p> : <><H>Incidents – last 24 hours</H>
          <T rows={[...res24, ...open.filter(i => i.opened > now - DAY)]} cols={[['Number', i => i.id], ['Pri', i => i.pri], ['Branch', i => bl(i.branchId)], ['Title', i => i.title], ['Result', i => i.state === 'Resolved' ? `${i.closeCode} (${dur(i.resolved - i.opened)})` : i.state]]} /></>}
          <H>Readiness this morning</H>
          <p className="text-[13px] text-ink">Pre-opening checks ran at 05:30 local across all time zones. See Branch Readiness for the branches that did not fully pass.</p>
        </>}
        {tab === 'weekly' && <>
          {(() => { const st = { 'Meets ESL': 0, 'Between MSL and ESL': 0, 'Below target': 0, 'Below MSL': 0 }; D.SLA.forEach(m => { const v = m.lower ? (m.act <= m.esl ? 'Meets ESL' : 'Below target') : m.act >= m.esl ? 'Meets ESL' : m.msl != null && m.act >= m.msl ? 'Between MSL and ESL' : m.msl == null ? 'Below target' : 'Below MSL'; st[v]++; }); const tm = D.TICKET_MONTHS.slice(-6).map(t => ({ label: t.m, 'After-hours mended': t.afterHours, NTF: t.ntf, 'Carrier / LEC': t.carrier, Other: t.customer + t.reboot })); return <>
            <RRow>
              <RDonut title="Annexure B metrics this month" data={[{ label: 'Meets ESL', value: st['Meets ESL'], color: RC.green }, { label: 'Between MSL and ESL', value: st['Between MSL and ESL'], color: RC.amber }, { label: 'Below target (KPI)', value: st['Below target'], color: '#F0B35A' }, { label: 'Below MSL', value: st['Below MSL'], color: RC.red }].filter(x => x.value)} center={`${st['Meets ESL']}/${D.SLA.length}`} sub="meet ESL" />
              <RHBars title="Risk-reward SLAs, actual" rows={D.SLA.filter(m => m.cls === 'Risk Reward SLA').map(m => ({ label: `#${m.n} ${m.name}`, value: +(m.act * 100).toFixed(2), color: m.act >= m.esl ? RC.green : m.act >= m.msl ? RC.amber : RC.red }))} max={100} fmt={v => `${v.toFixed(1)}%`} />
            </RRow>
            <RRow>
              <RBars title="Network tickets per month, by close code" data={tm} keys={['After-hours mended', 'NTF', 'Carrier / LEC', 'Other']} colors={[RC.blue, RC.amber, RC.brand, RC.grey]} h={150} />
              <RHBars title="Carrier restore commitment met, 6 months" rows={D.SCORECARD.map(x => ({ label: x.carrier, value: Math.round(x.slaMet * 100), color: x.slaMet >= 0.9 ? RC.green : RC.amber }))} max={100} fmt={v => `${v}%`} mark={90} markLabel="90% commitment" />
              <RHBars title="Carrier mean time to restore, hours" rows={D.SCORECARD.map(x => ({ label: x.carrier, value: x.mttr, color: RC.navy }))} fmt={v => `${v} h`} />
            </RRow>
          </>; })()}
          <H>{brief ? 'Service levels not at the expected level (ESL)' : 'Service levels (Annexure B)'}</H>
          <T rows={brief ? D.SLA.filter(m => m.lower ? m.act > m.esl : m.act < m.esl) : D.SLA} cols={[['#', m => m.n], ['Metric', m => m.name], ['MSL', m => m.msl == null ? '—' : pct(m.msl, m.fmt || 1)], ['ESL', m => pct(m.esl, m.fmt || 1)], ['Actual', m => pct(m.act, m.fmt || 1)]]} />
          {!brief && <><H>Ticket mix, last 6 months</H>
          <T rows={D.CLOSE_CODES} cols={[['Close code', r => r[0]], ['Tickets', r => num(r[1])], ['Share', r => pct(r[1] / 3773, 0)]]} />
          <H>Carriers</H>
          <T rows={D.SCORECARD} cols={[['Carrier', x => x.carrier], ['Circuits', x => x.circuits], ['Faults (6m)', x => x.cases6m], ['NTF (6m)', x => x.ntf], ['MTTR h', x => x.mttr], ['Restore commit met', x => pct(x.slaMet, 0)]]} />
          <H>Problems and improvements</H>
          <T rows={s.problems} cols={[['Problem', p => p.id], ['Title', p => p.title], ['State', p => p.state], ['Owner', p => p.owner]]} /></>}
        </>}
        {tab === 'critical' && <CriticalReport s={s} now={now} days={critDays} brief={brief} H={H} T={T} openInc={act.openInc} />}
        {tab === 'biab' && <>
          <RRow>
            <RBars title="Projects by stage" data={D.STAGES.map(st => ({ label: st.replace('Site audit', 'Audit').replace('Kit staged', 'Kit').replace('Hypercare', 'Hyper'), Greenfield: s.projects.filter(p => p.stage === st && p.track === 'Greenfield').length, Acquired: s.projects.filter(p => p.stage === st && p.track === 'Acquired').length }))} keys={['Greenfield', 'Acquired']} colors={[RC.blue, RC.brand]} h={140} />
            <RDonut title="Project health (RAG)" data={[['Green', RC.green], ['Amber', RC.amber], ['Red', RC.red]].map(([k, c]) => ({ label: k, value: s.projects.filter(p => p.rag === k).length, color: c })).filter(x => x.value)} center={s.projects.length} sub="projects" />
            <RHBars title="Cutover gates passed, of 13" rows={s.projects.slice(0, 9).map(p => { const n = p.gates.filter(g => g.st === 'Pass').length; return { label: `${p.brand.split(' ')[0]} – ${p.site}`, value: n, color: n === 13 ? RC.green : RC.blue }; })} max={13} />
          </RRow>
          <H>{brief ? 'Projects needing attention (amber or red)' : 'Portfolio'}</H>
          <T rows={brief ? s.projects.filter(p => p.rag !== 'Green') : s.projects} cols={[['ID', p => p.id], ['Track', p => p.track], ['Brand', p => p.brand], ['Site', p => p.site], ['Stage', p => p.stage], ['RAG', p => p.rag], ['Gates', p => `${p.gates.filter(g => g.st === 'Pass').length}/13`], ['Go-live', p => dateShort(p.golive)], ['Blockers', p => p.blockers.join('; ') || '—']]} />
          {!brief && <><H>This weekend's cutover gates</H>
          {s.projects.filter(p => p.stage === 'Cutover').map(p => <div key={p.id}><div className="text-[13px] font-bold text-ink mb-1">{p.brand} – {p.site}</div><T rows={p.gates} cols={[['#', g => g.i + 1], ['Time', g => g.when], ['Gate', g => g.name], ['Owner', g => g.owner], ['Result', g => g.st]]} /></div>)}</>}
        </>}
        {tab === 'audit' && <>
          {(() => { const kind = a => /Agent|Mova iO/.test(a.who || '') ? 'Mova iO agents' : /system|Console/i.test(a.who || '') ? 'System' : 'People'; const by = { 'Mova iO agents': 0, People: 0, System: 0 }; s.audit.forEach(a => { by[kind(a)]++; }); return <RRow>
            <RDonut title="Who acted" data={[{ label: 'Mova iO agents', value: by['Mova iO agents'], color: RC.brand }, { label: 'People', value: by.People, color: RC.blue }, { label: 'System', value: by.System, color: RC.grey }].filter(x => x.value)} center={s.audit.length} sub="actions" />
            <RBars title="Actions per hour, last 12 hours" data={hourly(12, s.audit.map(a => ({ t: a.t, k: kind(a) })), x => x.k)} keys={['Mova iO agents', 'People', 'System']} colors={[RC.brand, RC.blue, RC.grey]} />
          </RRow>; })()}
          <H>{brief ? 'The latest 10 actions' : 'Every human and agent action this session'}</H>
          <T rows={brief ? s.audit.slice(0, 10) : s.audit} cols={[['Time (CT)', a => dt(a.t)], ['Who', a => a.who], ['Action', a => a.what], ['Ref', a => a.ref]]} />
        </>}
      </div>
    </div>
  );
}
