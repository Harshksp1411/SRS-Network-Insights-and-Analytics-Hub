import React, { useState, useMemo, useRef } from 'react';
import * as I from 'lucide-react';
import { LivePanel } from './liveui.jsx';
import * as D from './data.js';
import { useApp, useNow, gate, slaClock, branchClock, healthOf, circuitOf, ROLES } from './store.jsx';
import { Card, Badge, Btn, Table, PageHead, Tabs, Stat, Conf, GateBox, Modal, KV, cx, Progress, Select, SearchBox, Illus, ExportBtn, Pri, Dot, Logo } from './ui.jsx';
import { Spark, LineChart, Bars, Legend, C } from './charts.jsx';
import { num, pct, dur, ago, dt, hhmm, dateShort, MIN, HR, DAY, exportCSV, downloadFile, rng } from './util.js';
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
  const dal = s.predictions.find(p => p.id === 'PRD-505');
  const fc = [...dal.series, ...Array.from({ length: 4 }, (_, k) => +(dal.series[9] + (k + 1) * 3).toFixed(0))];
  return (
    <div>
      <PageHead icon={I.TrendingUp} title="Predictive Watchlist" sub="Degrading circuits, AP and switch failure risk, capacity forecasts. Every prediction creates a watch or an approval – never a direct change." />
      <div className="kpi-strip grid grid-cols-2 lg:grid-cols-4 mb-3">
        <Stat label="Open predictions" icon={I.Telescope} value={s.predictions.filter(p => ['New', 'Watching'].includes(p.status)).length} />
        <Stat label="Predictive accuracy (KPI 38)" icon={I.Target} value="78%" sub="true positives, target 75%" tone="green" />
        <Stat label="Active watches" icon={I.Eye} value={s.watches.length + s.predictions.filter(p => p.status === 'Watching').length} />
        <Stat label="False positive rate" icon={I.ThumbsDown} value="14%" sub="target ≤ 20%" tone="green" />
      </div>
      <LivePanel kind="predict" className="mb-3 mt-3" />
      <div className="grid xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-3 mb-3"><RiskMatrixCard onPick={pt => { const el = document.getElementById(pt.id); el && el.scrollIntoView({ behavior: "smooth", block: "center" }); }} /><ModelAccuracyCard /></div>
      <div className="mb-3"><PreventiveCalendarCard /></div>
      <div className="flex items-center gap-2 mb-3"><Tabs size="sm" value={kind} onChange={setKind} tabs={['All', ...new Set(s.predictions.map(p => p.kind))].map(k => ({ id: k, label: k, count: k === 'All' ? s.predictions.length : s.predictions.filter(p => p.kind === k).length }))} /></div>
      <div className="grid xl:grid-cols-2 gap-3">
        {list.map(p => { const b = p.branchId && D.BR[p.branchId]; const done = !['New', 'Watching'].includes(p.status); return (
          <Card key={p.id} pad={false}><div className="p-4 scroll-mt-32" id={p.id}>
            <div className="flex items-center gap-2 flex-wrap"><span className="font-mono text-[11.5px] text-ink3">{p.id}</span><Badge tone="amber">{p.kind}</Badge><Badge>{p.horizon}</Badge><span className="flex-1" /><Badge tone={p.status === 'New' ? 'blue' : p.status === 'Watching' ? 'purple' : done ? 'green' : 'gray'}>{p.status}</Badge></div>
            <div className="text-[14px] font-bold text-ink mt-1 font-mono">{p.target}</div>
            {b && <button onClick={() => act.openBranch(b.id)} className="text-[12px] text-info hover:underline">{b.name}, {b.brand}</button>}
            <div className="text-[12.5px] text-ink2 mt-1">{p.signal}</div><div className="mt-1"><ForecastMini p={p} /></div>
            <div className="flex items-center gap-3 mt-2 flex-wrap"><Conf value={p.conf} /><span className="text-[12px] text-ink2">Suggests: <b className="text-ink">{p.suggest}</b></span></div>
            {!done && <div className="flex gap-2 mt-3"><Btn size="sm" icon={I.Eye} onClick={() => watch(p)} disabled={p.status === 'Watching'}>Create watch</Btn><Btn size="sm" kind="brand" icon={I.Send} onClick={() => approval(p)}>Request approval</Btn><Btn size="sm" kind="ghost" icon={I.ThumbsDown} onClick={() => dismiss(p)}>False positive</Btn></div>}
          </div></Card>); })}
      </div>
      <Card title={`Capacity forecast – ${D.BR[dal.branchId].name} (${D.BR[dal.branchId].brand}) primary WAN`} sub="p95 utilisation, 10 weeks actual + 4 weeks forecast. Hail season drives roofing demand and traffic." icon={I.LineChart} className="mt-3">
        <LineChart series={[{ name: 'p95 utilisation %', data: fc, color: C.info }]} labels={fc.map((_, k) => k < 10 ? `W-${10 - k}` : `+${k - 9}w`)} h={200} refLines={[{ v: 90, label: '90% upgrade threshold', color: C.bad }]} yFmt={v => `${Math.round(v)}%`} yMin={50} yMax={100} />
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
        <Stat label="Published articles" icon={I.FileText} value={s.kb.length} />
        <Stat label="Drafts awaiting review" icon={I.FilePen} value={s.kbDrafts.filter(d => d.status === 'Awaiting review').length} tone="amber" onClick={() => setTab('drafts')} />
        <Stat label="Recommendation accuracy" icon={I.Target} value="83%" sub="KPI 39 target 80%" tone="green" />
        <Stat label="Problem records open" icon={I.Bug} value={s.problems.filter(p => p.state !== 'Closed').length} onClick={() => setTab('problems')} />
      </div>
      <LivePanel kind="knowledge" className="mb-3 mt-3" />
      <Tabs value={tab} onChange={setTab} className="mb-3" tabs={[{ id: 'search', label: 'Search' }, { id: 'drafts', label: 'Auto-generated drafts', count: s.kbDrafts.filter(d => d.status === 'Awaiting review').length }, { id: 'problems', label: 'Problem records', count: s.problems.length }]} />
      {tab === 'search' && <div className="grid xl:grid-cols-2 gap-3 mb-3"><ClustersCard /><DeflectionCard /></div>}
      {tab === 'search' && <div className="grid xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-3">
        <Card title="Knowledge base" icon={I.Search}><SearchBox value={q} onChange={setQ} placeholder="Symptom, device, carrier… e.g. scanner, LTE, POS" className="w-full mb-3" />
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
        <div className="flex items-center gap-3 mt-2"><Conf value={d.conf} />{d.status === 'Awaiting review' && <><Btn size="sm" kind="ok" icon={I.Check} onClick={() => publish(d)}>Approve & publish</Btn><Btn size="sm" icon={I.Pencil} onClick={() => setEdit(d.id)}>Edit</Btn><Btn size="sm" kind="ghost" icon={I.X} onClick={() => { act.upd('kbDrafts', d.id, { status: 'Rejected' }); act.audit(`Rejected ${d.id}`, d.id); }}>Reject</Btn></>}</div>
      </div></Card>)}</div>}
      {tab === 'problems' && <Card pad={false}><div className="p-3"><Table rows={s.problems} cols={[{ key: 'id', label: 'Problem', render: p => <span className="font-mono text-[12px] font-semibold">{p.id}</span> }, { key: 'title', label: 'Title' }, { key: 'incidents', label: 'Linked incidents', right: true }, { key: 'owner', label: 'Owner' }, { key: 'opened', label: 'Opened', render: p => <span className="text-[12px] text-ink3">{ago(p.opened)}</span> }, { key: 'state', label: 'State', render: p => <Select value={p.state} onChange={v => { act.upd('problems', p.id, { state: v }); act.audit(`${p.id} → ${v}`, p.id); }} options={['New', 'Root cause analysis', 'Known error', 'Fix in progress', 'Closed']} /> }]} /></div></Card>}
      <Modal open={!!art} onClose={() => act.set({ kbOpen: null })} title={art && art.title} sub={art && `${art.id}, updated ${dateShort(art.updated)}, ${art.tags.join(', ')}`} footer={art && <><Btn icon={I.ThumbsUp} onClick={() => { act.toast('Thanks – feedback recorded'); act.set({ kbOpen: null }); }}>Helpful</Btn><Btn icon={I.ThumbsDown} onClick={() => { act.toast('Feedback recorded – sent to Knowledge Agent', 'info'); act.set({ kbOpen: null }); }}>Not helpful</Btn></>}>
        {art && <div className="text-[13px] text-ink leading-6 whitespace-pre-line">{art.body.replace(/(\d\))/g, '\n$1')}</div>}
      </Modal>
    </div>
  );
}

// ───────────────────────── Automation library ─────────────────────────
export function Automation() {
  const { s, act } = useApp();
  const now = useNow();
  const [sel, setSel] = useState('RB-101');
  const [target, setTarget] = useState(D.BRANCHES[10].id);
  const [prog, setProg] = useState(-1);
  const rb = s.runbooks.find(r => r.id === sel);
  const b = D.BR[target];
  const g = gate(s, { kind: rb.kind, conf: 0.9, branchId: target, now });
  const hist = useMemo(() => { const R = rng(sel.length * 97 + sel.charCodeAt(4)); return Array.from({ length: 8 }, (_, k) => { const bb = D.BRANCHES[R.int(0, 899)]; return { id: k, t: Date.now() - (k + 1) * R.int(2, 9) * HR, branch: `${bb.name}, ${bb.brand}`, by: R() < 0.6 ? 'Agent (auto)' : R.pick(D.ENGINEERS), res: R() < rb.success ? 'Success' : 'Failed', dur: rb.avg }; }); }, [sel]);
  const runs = [...s.runs.filter(r => r.rb === sel), ...hist];
  const run = approved => { setProg(0); rb.steps.forEach((_, k) => setTimeout(() => setProg(k + 1), 600 * (k + 1))); setTimeout(() => { setProg(-1); act.add('runs', { id: Date.now(), rb: sel, t: Date.now(), branch: `${b.name}, ${b.brand}`, by: approved ? act.me() : 'Agent (auto)', res: 'Success', dur: `${(rb.steps.length * 0.6).toFixed(1)} s` }); act.audit(`${approved ? 'Approved and ran' : 'Ran'} ${sel} on ${b.name}`, sel); act.toast(`${sel} completed on ${b.name}`); }, 600 * (rb.steps.length + 1)); };
  return (
    <div>
      <PageHead icon={I.Workflow} title="Automation Library" sub="Runbooks with run history, success rate and autonomy level. Autonomy is capped by the gates: below 80% confidence, branch hours and freeze windows always need a human." />
      <div className="kpi-strip grid grid-cols-2 lg:grid-cols-4 mb-3">
        <Stat label="Runbooks" icon={I.BookMarked} value={s.runbooks.length} />
        <Stat label="Runs (30 days)" icon={I.Play} value={num(s.runbooks.reduce((a, r) => a + r.runs30, 0))} />
        <Stat label="Auto-resolution rate" icon={I.Bot} value="23.1%" sub="KPI 37 target 25% – trending up" tone="amber" />
        <Stat label="Automation coverage" icon={I.Layers} value="42%" sub="KPI 37 target 40%" tone="green" />
      </div>
      <LivePanel kind="automation" className="mb-3 mt-3" />
      <div className="grid xl:grid-cols-3 gap-3 mb-3 items-start"><AutomationRunsCard /><HoursSavedCard /><CandidatesCard /></div>
      <div className="grid xl:grid-cols-[minmax(0,1fr)_440px] gap-3">
        <Card pad={false}><div className="p-3"><Table rows={s.runbooks} onRow={r => setSel(r.id)} rowClass={r => r.id === sel ? 'bg-chip' : ''} cols={[
          { key: 'id', label: 'ID', className: 'whitespace-nowrap', render: r => <span className="font-mono text-[12px] font-semibold">{r.id}</span> },
          { key: 'name', label: 'Runbook', render: r => <div><div className="font-semibold">{r.name}</div><div className="text-[11px] text-ink3">{r.kind === 'change' ? 'Makes a change' : 'Read-only / notify'}</div></div> },
          { key: 'autonomy', label: 'Autonomy', render: r => <Badge tone={r.autonomy === 'L4' ? 'brand' : r.autonomy === 'L3' ? 'purple' : 'blue'}>{r.autonomy}, {D.AUTONOMY[r.autonomy]}</Badge> },
          { key: 'runs30', label: 'Runs 30d', right: true, render: r => num(r.runs30) },
          { key: 'success', label: 'Success', right: true, render: r => <span className={r.success < 0.9 ? 'text-bad font-semibold' : 'text-ok font-semibold'}>{pct(r.success)}</span> },
          { key: 'avg', label: 'Avg', right: true },
        ]} /></div></Card>
        <Card title={`${rb.id}, ${rb.name}`} sub={rb.desc} icon={I.Workflow}>
          <div className="flex items-center gap-2 mb-2"><span className="text-[12px] text-ink3 font-semibold">Autonomy</span><Select value={rb.autonomy} onChange={v => { act.upd('runbooks', rb.id, { autonomy: v }); act.audit(`${rb.id} autonomy → ${v}`, rb.id); act.toast(`${rb.id} set to ${v} – ${D.AUTONOMY[v]}`, 'info'); }} options={Object.entries(D.AUTONOMY).map(([k, v]) => ({ value: k, label: `${k} – ${v}` }))} /></div>
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
            <div className="flex gap-2 mt-2">{g.auto ? <Btn kind="ok" icon={I.Play} disabled={prog >= 0} onClick={() => run(false)}>Run</Btn> : <Btn kind="ok" icon={I.ShieldCheck} disabled={prog >= 0} onClick={() => run(true)}>Approve & run</Btn>}<Btn icon={I.FlaskConical} onClick={() => act.toast(`Dry run of ${rb.id}: pre-checks pass, no change made`, 'info')}>Dry run</Btn></div>
          </div>
          <div className="text-[11.5px] font-bold text-ink3 mt-3 mb-1">Run history</div>
          <div className="max-h-48 overflow-y-auto">{runs.map(r => <div key={r.id} className="flex items-center gap-2 text-[12px] py-1 border-b border-line/60"><span className="text-ink3 w-16">{ago(r.t, now)}</span><span className="flex-1 truncate text-ink">{r.branch}</span><span className="text-ink3">{r.by}</span><Badge tone={r.res === 'Success' ? 'green' : 'red'}>{r.res}</Badge></div>)}</div>
        </Card>
      </div>
    </div>
  );
}

// ───────────────────────── SLA & KPI tracker ─────────────────────────
export function SLATracker() {
  const { s, act } = useApp();
  const now = useNow();
  const [sel, setSel] = useState(0);
  const months = ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];
  const status = m => { if (m.lower) return m.act <= m.esl ? 'Meets ESL' : 'Below target'; if (m.act >= m.esl) return 'Meets ESL'; if (m.msl != null && m.act >= m.msl) return 'Above MSL'; return m.msl == null ? 'Below target' : 'Below MSL'; };
  const tone = st => ({ 'Meets ESL': 'green', 'Above MSL': 'amber', 'Below MSL': 'red', 'Below target': 'amber' }[st]);
  const f = (v, m) => v == null ? '—' : `${(v * 100).toFixed(m.fmt || 1)}%`;
  const open = s.incidents.filter(i => i.state !== 'Resolved');
  const queues = ['P1', 'P2', 'P3', 'P4'].map(p => { const l = open.filter(i => i.pri === p).map(i => ({ i, c: slaClock(i, now) })); return { p, n: l.length, risk: l.filter(x => x.c.used > 0.75 && x.c.resLeft > 0).length, breached: l.filter(x => x.c.resLeft <= 0).length, respRisk: l.filter(x => !x.i.acked && x.c.respLeft < 5 * MIN).length, list: l }; });
  const m = D.SLA[sel];
  const lines = [...new Set(D.SLA.map(x => x.line))];
  return (
    <div>
      <PageHead icon={I.Gauge} title="SLA & KPI Tracker" sub="Annexure B service levels and KPIs: minimum (MSL), expected (ESL) and actual for the current month, six-month trend, and breach risk by queue." right={<ExportBtn onClick={() => exportCSV('srs-annexure-b-sla.csv', D.SLA, [{ label: '#', key: 'n' }, { label: 'Service line', key: 'line' }, { label: 'Metric', key: 'name' }, { label: 'Definition', key: 'def' }, { label: 'MSL', get: x => x.msl == null ? '' : x.msl }, { label: 'ESL', key: 'esl' }, { label: 'Actual', key: 'act' }, { label: 'Class', key: 'cls' }, { label: 'Status', get: status }])} />} />
      <div className="kpi-strip grid grid-cols-2 lg:grid-cols-4 mb-3">
        <Stat label="Metrics meeting ESL" icon={I.CheckCircle2} value={`${D.SLA.filter(x => status(x) === 'Meets ESL').length}/${D.SLA.length}`} tone="green" />
        <Stat label="Below MSL" icon={I.XCircle} value={D.SLA.filter(x => status(x) === 'Below MSL').length} tone={D.SLA.some(x => status(x) === 'Below MSL') ? 'red' : 'green'} />
        <Stat label="Open incidents at breach risk" icon={I.AlarmClock} value={queues.reduce((a, q) => a + q.risk, 0)} tone="amber" sub="> 75% of resolution clock used" />
        <Stat label="Critical availability (#29)" icon={I.Activity} value={f(0.99962, { fmt: 3 })} sub="MSL 99%, ESL 99.99%" tone="amber" />
      </div>
      <LivePanel kind="sla" className="mb-3 mt-3" />
      <Card title="Breach risk by queue (live)" icon={I.AlarmClock} className="mb-3">
        <div className="grid md:grid-cols-4 gap-3">{queues.map(q => <div key={q.p} className="border border-line rounded-md p-3">
          <div className="flex items-center gap-2"><Pri p={q.p} /><span className="text-[12px] text-ink3">{D.slaOf(q.p).resp / MIN} min / {dur(D.slaOf(q.p).res)}</span></div>
          <div className="flex gap-4 mt-2 text-[12.5px]"><div><div className="text-[20px] font-extrabold text-ink">{q.n}</div><div className="text-ink3">open</div></div><div><div className="text-[20px] font-extrabold text-warn">{q.risk}</div><div className="text-ink3">at risk</div></div><div><div className="text-[20px] font-extrabold text-bad">{q.breached}</div><div className="text-ink3">breached</div></div></div>
          {q.respRisk > 0 && <div className="text-[11.5px] text-bad mt-1">{q.respRisk} close to missing response</div>}
          <div className="mt-2 space-y-1">{q.list.filter(x => x.c.used > 0.5).slice(0, 3).map(x => <button key={x.i.id} onClick={() => act.openInc(x.i.id)} className="w-full text-left text-[11.5px] flex gap-1.5 hover:underline"><span className="font-mono text-ink3">{x.i.id}</span><span className={x.c.resLeft < 0 ? 'text-bad' : 'text-warn'}>{x.c.resLeft < 0 ? 'breached' : dur(x.c.resLeft)}</span></button>)}</div>
        </div>)}</div>
      </Card>
      <div className="grid xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-3">
        <Card pad={false}><div className="p-3">{lines.map(l => <div key={l} className="mb-3"><div className="text-[12px] font-bold text-ink3 px-2 py-1">{l}</div>
          <Table dense sortable={false} rows={D.SLA.map((x, k) => ({ ...x, id: k })).filter(x => x.line === l)} onRow={x => setSel(x.id)} rowClass={x => x.id === sel ? 'bg-chip' : ''} cols={[
            { key: 'n', label: '#', render: x => <span className="text-ink3">{x.n}</span> },
            { key: 'name', label: 'Metric', render: x => <div><div className="font-semibold">{x.name}</div><div className="text-[11px] text-ink3">{x.def}</div></div> },
            { key: 'msl', label: 'MSL', right: true, render: x => f(x.msl, x) }, { key: 'esl', label: 'ESL', right: true, render: x => x.lower ? `≤ ${f(x.esl, x)}` : f(x.esl, x) },
            { key: 'act', label: 'Actual', right: true, render: x => <b>{f(x.act, x)}</b> },
            { key: 'trend', label: '6 mo', render: x => <Spark data={x.trend} w={70} h={20} color={tone(status(x)) === 'green' ? C.ok : C.warn} fill={false} /> },
            { key: 'st', label: 'Status', render: x => <Badge tone={tone(status(x))}>{status(x)}</Badge> },
            { key: 'cls', label: 'Class', render: x => <span className="text-[11px] text-ink3">{x.cls}</span> },
          ]} /></div>)}</div></Card>
        <SLAProjectionCard m={m} />
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
  const open = s.incidents.filter(i => i.state !== 'Resolved');
  const res24 = s.resolved.filter(i => i.resolved > now - DAY);
  const titles = { handover: 'Shift handover', daily: 'Daily operations summary', weekly: 'Weekly service review pack', biab: 'Branch-in-a-Box onboarding report', audit: 'Audit log' };
  const exportHtml = () => { const html = `<!doctype html><html><head><meta charset="utf-8"><title>SRS – ${titles[tab]}</title><style>body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:32px;max-width:960px}h1{color:#762123}h2{border-bottom:2px solid #762123;padding-bottom:4px;margin-top:24px}table{border-collapse:collapse;width:100%;font-size:12px}td,th{border:1px solid #ddd;padding:5px 7px;text-align:left}th{background:#f3f3f3}.muted{color:#666}</style></head><body>${ref.current.innerHTML.replace(/<svg[\s\S]*?<\/svg>/g, '')}</body></html>`; downloadFile(`srs-${tab}-${new Date().toISOString().slice(0, 10)}.html`, html, 'text/html'); act.audit(`Exported report: ${titles[tab]}`, tab); act.toast('Report downloaded'); };
  const H = ({ children }) => <h2 className="text-[15px] font-extrabold text-ink border-b-2 border-brand pb-1 mt-5 mb-2">{children}</h2>;
  const T = ({ rows, cols }) => <table className="w-full text-[12px] border-collapse"><thead><tr>{cols.map(c => <th key={c[0]} className="text-left border border-line bg-chip px-2 py-1 font-semibold text-ink">{c[0]}</th>)}</tr></thead><tbody>{rows.map((r, k) => <tr key={k}>{cols.map(c => <td key={c[0]} className="border border-line px-2 py-1 text-ink align-top">{c[1](r)}</td>)}</tr>)}</tbody></table>;
  const bl = id => `${D.BR[id].name}, ${D.BR[id].brand}`;
  return (
    <div>
      <PageHead icon={I.FileText} title="Reports" sub="Built from live console data. Download as HTML (opens in Word or a browser), CSV, or print to PDF."
        right={tab !== 'audit' ? <><Btn icon={I.Download} onClick={exportHtml}>Download HTML</Btn><Btn icon={I.Printer} onClick={() => window.print()}>Print / PDF</Btn></> : <ExportBtn onClick={() => exportCSV('srs-audit-log.csv', s.audit, [{ label: 'Time', get: a => dt(a.t) }, { label: 'Who', key: 'who' }, { label: 'What', key: 'what' }, { label: 'Ref', key: 'ref' }])} />} />
      <Tabs value={tab} onChange={t => { setTab(t); act.setTab('reports', t); }} className="mb-3" tabs={Object.entries(titles).map(([id, label]) => ({ id, label }))} />
      <div className="bg-panel border border-line rounded-md p-6 print-area" ref={ref}>
        <div className="flex items-start gap-3 border-b border-line pb-3"><div className="flex-1"><h1 className="text-[22px] font-black text-brand dark:text-[#e8a3a5]">SRS Distribution – {titles[tab]}</h1><div className="text-[12px] text-ink3">Managed Network Services, operated by Movate, generated {dt(now)} CT by {act.me()}</div></div></div>
        {tab === 'handover' && <>
          <H>Summary</H>
          <p className="text-[13px] text-ink">{open.length} incidents open ({['P1', 'P2', 'P3', 'P4'].map(p => `${open.filter(i => i.pri === p).length} ${p}`).join(', ')}). {res24.length} resolved in the last 24 h. {s.approvals.filter(a => a.status === 'Pending').length} actions waiting for approval. {s.cases.filter(c => !c.closed).length} carrier cases open. {s.workOrders.filter(w => w.status !== 'Completed').length} field visits open.</p>
          <H>Open P1 / P2 and anything near breach</H>
          <T rows={open.filter(i => i.pri <= 'P2' || slaClock(i, now).used > 0.6)} cols={[['Number', i => i.id], ['Pri', i => i.pri], ['Branch', i => bl(i.branchId)], ['Title', i => i.title], ['State', i => i.state], ['Owner', i => i.assignee || '—'], ['Time left', i => { const c = slaClock(i, now); return c.resLeft < 0 ? 'BREACHED' : dur(c.resLeft); }], ['Next step', i => i.carrierCase ? `Chase ${i.carrierCase}` : i.workOrder ? `Field: ${i.workOrder}` : i.rbState === 'proposed' ? `Decide on ${i.runbook}` : 'Monitor']]} />
          <H>Waiting on a human</H>
          <T rows={s.approvals.filter(a => a.status === 'Pending')} cols={[['ID', a => a.id], ['Action', a => a.title], ['Why', a => a.why.join('; ')], ['Confidence', a => `${Math.round(a.conf * 100)}%`]]} />
          <H>Carrier cases</H>
          <T rows={s.cases.filter(c => !c.closed)} cols={[['Ticket', c => c.id], ['Carrier', c => c.carrier], ['Branch', c => bl(c.branchId)], ['Status', c => c.status], ['ETA', c => c.eta ? (now > c.eta ? `late ${dur(now - c.eta)}` : dur(c.eta - now)) : '—']]} />
        </>}
        {tab === 'daily' && <>
          <H>Network health</H>
          {(() => { const h = { up: 0, degraded: 0, down: 0 }; D.BRANCHES.forEach(b => h[healthOf(s, b)]++); return <p className="text-[13px] text-ink">{num(h.up)} branches healthy, {h.degraded} degraded, {h.down} down. {D.BRANCHES.filter(b => circuitOf(s, b.wan[0]).status !== 'Up').length} branches on their backup path. Alert noise reduced 71% by correlation.</p>; })()}
          <H>Incidents – last 24 hours</H>
          <T rows={[...res24, ...open.filter(i => i.opened > now - DAY)]} cols={[['Number', i => i.id], ['Pri', i => i.pri], ['Branch', i => bl(i.branchId)], ['Title', i => i.title], ['Result', i => i.state === 'Resolved' ? `${i.closeCode} (${dur(i.resolved - i.opened)})` : i.state]]} />
          <H>Readiness this morning</H>
          <p className="text-[13px] text-ink">Pre-opening checks ran at 05:30 local across all time zones. See Branch Readiness for the branches that did not fully pass.</p>
        </>}
        {tab === 'weekly' && <>
          <H>Service levels (Annexure B)</H>
          <T rows={D.SLA} cols={[['#', m => m.n], ['Metric', m => m.name], ['MSL', m => m.msl == null ? '—' : pct(m.msl, m.fmt || 1)], ['ESL', m => pct(m.esl, m.fmt || 1)], ['Actual', m => pct(m.act, m.fmt || 1)]]} />
          <H>Ticket mix (6 months, RFP data)</H>
          <T rows={D.CLOSE_CODES} cols={[['Close code', r => r[0]], ['Tickets', r => num(r[1])], ['Share', r => pct(r[1] / 3773, 0)]]} />
          <H>Carriers</H>
          <T rows={D.SCORECARD} cols={[['Carrier', x => x.carrier], ['Circuits', x => x.circuits], ['Faults (6m)', x => x.cases6m], ['NTF (6m)', x => x.ntf], ['MTTR h', x => x.mttr], ['Restore commit met', x => pct(x.slaMet, 0)]]} />
          <H>Problems and improvements</H>
          <T rows={s.problems} cols={[['Problem', p => p.id], ['Title', p => p.title], ['State', p => p.state], ['Owner', p => p.owner]]} />
          <p className="text-[11.5px] text-ink3 mt-2">Carrier split and monthly trends are illustrative.</p>
        </>}
        {tab === 'biab' && <>
          <H>Portfolio</H>
          <T rows={s.projects} cols={[['ID', p => p.id], ['Track', p => p.track], ['Brand', p => p.brand], ['Site', p => p.site], ['Stage', p => p.stage], ['RAG', p => p.rag], ['Gates', p => `${p.gates.filter(g => g.st === 'Pass').length}/13`], ['Go-live', p => dateShort(p.golive)], ['Blockers', p => p.blockers.join('; ') || '—']]} />
          <H>This weekend's cutover gates</H>
          {s.projects.filter(p => p.stage === 'Cutover').map(p => <div key={p.id}><div className="text-[13px] font-bold text-ink mb-1">{p.brand} – {p.site}</div><T rows={p.gates} cols={[['#', g => g.i + 1], ['Time', g => g.when], ['Gate', g => g.name], ['Owner', g => g.owner], ['Result', g => g.st]]} /></div>)}
        </>}
        {tab === 'audit' && <>
          <H>Every human and agent action this session</H>
          <T rows={s.audit} cols={[['Time (CT)', a => dt(a.t)], ['Who', a => a.who], ['Action', a => a.what], ['Ref', a => a.ref]]} />
        </>}
      </div>
    </div>
  );
}
