import React, { useState, useMemo } from 'react';
import * as I from 'lucide-react';
import * as D from './data.js';
import { useApp, useNow, slaClock, gate, branchClock, circuitOf, inScope, healthOf, ROLES } from './store.jsx';
import { Card, Badge, Btn, Table, Dot, Pri, PageHead, Tabs, Progress, Conf, GateBox, cx, Logo, SRC_LOGO, KV, SearchBox, Select, Empty, ExportBtn, Modal } from './ui.jsx';
import { dur, ago, hhmmss, hhmm, dt, MIN, exportCSV } from './util.js';
import { useLive } from './live.jsx';
import { LiveBadge } from './liveui.jsx';
import { QueueForecastCard, BreachRiskCard, PreventRecurrence, RegionHourHeat, IncidentTelemetryCard } from './viz.jsx';

function SlaTimer({ inc, now, compact }) {
  const c = slaClock(inc, now);
  const tone = c.resLeft < 0 ? 'red' : c.used > 0.75 ? 'amber' : 'green';
  if (inc.state === 'Resolved') return <span className={cx('text-[12px] font-semibold', c.resBreached ? 'text-bad' : 'text-ok')}>{c.resBreached ? 'Breached' : 'Met'}, {dur(inc.resolved - inc.opened)}</span>;
  return (
    <div className={compact ? 'w-28' : 'w-36'}>
      <div className={cx('text-[12px] font-mono font-semibold', tone === 'red' ? 'text-bad' : tone === 'amber' ? 'text-warn' : 'text-ink')}>{c.resLeft < 0 ? `-${dur(-c.resLeft)}` : dur(c.resLeft)}</div>
      <Progress value={c.used} tone={tone} h={4} />
    </div>
  );
}
function RespTimer({ inc, now }) {
  const c = slaClock(inc, now);
  if (inc.acked) return <span className={cx('text-[12px] font-semibold inline-flex items-center gap-1', c.respBreached ? 'text-bad' : 'text-ok')}>{c.respBreached ? <I.XCircle size={13} /> : <I.CheckCircle2 size={13} />}{dur(inc.acked - inc.opened)}</span>;
  return <span className={cx('text-[12px] font-mono font-bold', c.respLeft < 0 ? 'text-bad' : c.respLeft < 5 * MIN ? 'text-warn' : 'text-ink')}>{c.respLeft < 0 ? `-${dur(-c.respLeft)}` : dur(c.respLeft)}</span>;
}

export function Incidents() {
  const { s, act } = useApp();
  const now = useNow();
  if (s.selInc) return <IncidentDetail id={s.selInc} />;
  return <Queue />;
}

function Queue() {
  const { s, act } = useApp();
  const now = useNow();
  const { L } = useLive();
  const me = ROLES.find(r => r.id === s.role).who;
  const [tab, setTab] = useState('open');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const all = [...s.incidents, ...s.resolved].filter(i => inScope(s, i.branchId));
  const open = all.filter(i => i.state !== 'Resolved');
  const lists = {
    open, mine: open.filter(i => i.assignee === me), p12: open.filter(i => i.pri === 'P1' || i.pri === 'P2'), unacked: open.filter(i => !i.acked), carrier: open.filter(i => i.state === 'On Hold – Carrier'),
    resolved: all.filter(i => i.state === 'Resolved').sort((a, b) => b.resolved - a.resolved),
  };
  let rows = lists[tab];
  if (cat !== 'All') rows = rows.filter(i => i.cat === cat);
  if (q) rows = rows.filter(i => `${i.id} ${i.title} ${D.BR[i.branchId].name} ${D.BR[i.branchId].brand} ${i.ci}`.toLowerCase().includes(q.toLowerCase()));
  if (tab !== 'resolved') rows = rows.slice().sort((a, b) => (!!a.acked - !!b.acked) || (!a.acked && !b.acked ? slaClock(a, now).respLeft - slaClock(b, now).respLeft : 0) || a.pri.localeCompare(b.pri) || slaClock(a, now).resLeft - slaClock(b, now).resLeft);
  const cats = ['All', ...new Set(all.map(i => i.cat))];
  const ack = i => { act.upd('incidents', i.id, { acked: Date.now(), state: 'In Progress', assignee: me }); act.audit(`Acknowledged ${i.id}`, i.id); act.toast(`${i.id} acknowledged and assigned to you`); };
  return (
    <div>
      <PageHead icon={I.Siren} title="Live Incidents" sub="ServiceNow incident queue with SLA clocks from Annexure B: P1 15 min / 4 h, P2 15 min / 8 h, P3 30 min / 24 h, P4 30 min / 96 h."
        right={<><LiveBadge /><Btn icon={I.PlayCircle} onClick={() => act.set({ scenarioPicker: true })}>Scenarios</Btn><ExportBtn onClick={() => exportCSV('srs-incidents.csv', rows, [{ label: 'Number', key: 'id' }, { label: 'Priority', key: 'pri' }, { label: 'Title', key: 'title' }, { label: 'Branch', get: i => D.BR[i.branchId].name }, { label: 'Brand', get: i => D.BR[i.branchId].brand }, { label: 'Category', key: 'cat' }, { label: 'State', key: 'state' }, { label: 'Assigned', key: 'assignee' }, { label: 'Opened', get: i => dt(i.opened) }])} /></>} />
      <div className="grid xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-3 mb-3">
        <QueueForecastCard />
        <BreachRiskCard />
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Tabs value={tab} onChange={setTab} tabs={[{ id: 'open', label: 'All open', count: lists.open.length }, { id: 'mine', label: 'Assigned to me', count: lists.mine.length }, { id: 'unacked', label: 'Not acknowledged', count: lists.unacked.length }, { id: 'p12', label: 'P1 / P2', count: lists.p12.length }, { id: 'carrier', label: 'On hold – carrier', count: lists.carrier.length }, { id: 'resolved', label: 'Resolved (7 d)', count: lists.resolved.length }]} />
        <div className="flex-1" />
        <Select label="Category" value={cat} onChange={setCat} options={cats} />
        <SearchBox value={q} onChange={setQ} placeholder="Number, title, branch, CI" className="w-64" />
      </div>
      <Card pad={false}><div className="p-3">
        <Table pageSize={20} rows={rows} onRow={i => act.set({ selInc: i.id })} rowClass={i => L.newIncs[i.id] ? 'bg-info/10 feed-in' : i.pri === 'P1' && i.state !== 'Resolved' ? 'bg-alert/5' : ''} sortable={false} cols={[
          { key: 'pri', label: 'Pri', render: i => <Pri p={i.pri} /> },
          { key: 'id', label: 'Number', render: i => <span className="font-mono text-[12px] text-ink2">{i.id}</span> },
          { key: 'title', label: 'Short description', render: i => <div className="max-w-[420px]"><div className="font-semibold text-ink line-clamp-1">{i.major && <Badge tone="alert" className="mr-1">MAJOR</Badge>}{L.newIncs[i.id] && <Badge tone="blue" className="mr-1">NEW</Badge>}{i.title}</div><div className="text-[11.5px] text-ink3">{i.cat}, {i.corr} events{i.suppressed ? `, ${i.suppressed} suppressed` : ''}</div></div> },
          { key: 'branch', label: 'Branch', render: i => { const b = D.BR[i.branchId]; return <div><div className="text-ink font-semibold whitespace-nowrap">{b.name}</div><div className="text-[11.5px] text-ink3 truncate max-w-[200px]" title="">{b.brand}</div></div>; } },
          { key: 'state', label: 'State', render: i => <Badge tone={i.state === 'New' ? 'red' : i.state.startsWith('On Hold') ? 'amber' : i.state === 'Resolved' ? 'green' : 'blue'}>{i.state}</Badge> },
          { key: 'assignee', label: 'Assigned to', render: i => i.assignee ? <span className="text-[12px]">{i.assignee}</span> : <Btn size="xs" kind="brand" onClick={e => { e.stopPropagation(); ack(i); }}>Acknowledge</Btn> },
          { key: 'resp', label: 'Response', render: i => <RespTimer inc={i} now={now} /> },
          { key: 'res', label: 'Resolution SLA', render: i => <SlaTimer inc={i} now={now} compact /> },
          { key: 'age', label: 'Opened', render: i => <span className="text-[12px] text-ink3 whitespace-nowrap">{ago(i.opened, now)}</span> },
        ]} />
      </div></Card>
      <div className="mt-3"><RegionHourHeat /></div>
    </div>
  );
}

const AG = D.AGENTS;
function AgentChip({ a }) { const x = AG[a] || { name: a, color: '#6b6b6b' }; return <span className="inline-flex items-center gap-1 text-[11.5px] font-bold" style={{ color: x.color }}><I.Bot size={13} />{x.name}</span>; }

function IncidentDetail({ id }) {
  const { s, act } = useApp();
  const now = useNow();
  const inc = s.incidents.find(i => i.id === id) || s.resolved.find(i => i.id === id);
  const [tab, setTab] = useState('timeline');
  const [note, setNote] = useState('');
  const [running, setRunning] = useState(-1);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [code, setCode] = useState('Carrier / LEC');
  if (!inc) return <Empty icon={I.SearchX} title="Incident not found"><Btn className="mt-3" onClick={() => act.set({ selInc: null })}>Back to queue</Btn></Empty>;
  const b = D.BR[inc.branchId];
  const clk = branchClock(b, now);
  const c = slaClock(inc, now);
  const rb = inc.runbook && s.runbooks.find(r => r.id === inc.runbook);
  const g = rb ? gate(s, { kind: rb.kind, conf: inc.conf || 0, branchId: b.id, now, emergency: inc.pri === 'P1' && healthOf(s, b) === 'down' }) : null;
  const me = act.me();
  const isRes = inc.state === 'Resolved';
  const key = s.incidents.some(i => i.id === id) ? 'incidents' : 'resolved';
  const upd = p => act.upd(key, id, p);

  const timeline = [
    ...inc.signals.map(x => ({ t: x.t, kind: 'signal', ...x })),
    ...inc.agentSteps.map(x => ({ t: x.t, kind: 'agent', ...x })),
    ...inc.notes.map(x => ({ t: x.t, kind: 'note', ...x })),
  ].sort((a, b) => a.t - b.t);

  const runRunbook = (approved) => {
    if (!rb) return;
    if (approved) act.audit(`Approved ${rb.id} ${rb.name} on ${inc.id}`, inc.id);
    upd({ rbState: 'running' });
    setRunning(0);
    rb.steps.forEach((st, k) => setTimeout(() => setRunning(k + 1), 700 * (k + 1)));
    setTimeout(() => {
      setRunning(-1);
      upd(x => ({ rbState: 'done', verify: (x.verify.length ? x.verify : rb.verify.map(v => ({ v, st: 'pending' }))).map(v => ({ ...v, st: 'pass', val: v.val || 'OK' })), notes: [...x.notes, { t: Date.now(), who: approved ? me : 'Runbook Agent', text: `${rb.id} ${rb.name} completed. Verification passed. Rollback available: ${rb.rollback}` }] }));
      if (rb.id === 'RB-101') act.map('branchHealth', b.id, 'degraded');
      if (['RB-103', 'RB-104', 'RB-105'].includes(rb.id)) act.map('branchHealth', b.id, 'up');
      if (rb.id === 'RB-106' && !inc.carrierCase) raiseCase();
      act.toast(`${rb.id} completed – verification passed`);
    }, 700 * (rb.steps.length + 1));
  };
  const rollback = () => { upd(x => ({ rbState: 'rolled back', notes: [...x.notes, { t: Date.now(), who: me, text: `Rolled back ${rb.id}: ${rb.rollback}` }] })); act.audit(`Rolled back ${rb.id} on ${inc.id}`, inc.id); act.toast('Rollback complete', 'warn'); };
  const toApproval = () => { const aid = `APR-${2300 + Math.floor(Math.random() * 600)}`; act.add('approvals', { id: aid, type: 'Runbook', title: `${rb.id} ${rb.name} on ${inc.ci}`, inc: inc.id, branchId: b.id, agent: 'runbook', conf: inc.conf || 0, risk: rb.kind === 'change' ? 'Medium' : 'Low', created: Date.now(), status: 'Pending', why: g.reasons, evidence: inc.rca.slice(0, 2).map(r => `${r.cause} – ${r.ev}`), rollback: rb.rollback, verify: rb.verify }); upd({ rbState: 'awaiting approval' }); act.toast(`${aid} sent to approvals queue`, 'info'); };
  const raiseCase = () => { const cir = circuitOf(s, D.CIR[inc.ci] ? inc.ci : b.wan[0]); const no = D.caseNo(cir.carrier); act.add('cases', { id: no, carrier: cir.carrier, circuit: cir.id, inc: inc.id, branchId: b.id, opened: Date.now(), status: 'Open – carrier testing', eta: Date.now() + 4 * 36e5, lastUpdate: Date.now(), evidence: ['60-min loss/jitter graph', 'MTR from EdgeConnect', 'Interface counters', 'Timestamps'], escal: 0 }); upd(x => ({ carrierCase: no, state: 'On Hold – Carrier', agentSteps: [...x.agentSteps, { agent: 'carrier', t: Date.now(), text: `Evidence pack built; ${cir.carrier} case ${no} opened`, st: 'done' }] })); act.audit(`Opened carrier case ${no}`, inc.id); act.toast(`${cir.carrier} case ${no} opened`); };
  const makeWO = () => { const wo = `WO00${42200 + Math.floor(Math.random() * 700)}`; act.add('workOrders', { id: wo, branchId: b.id, inc: inc.id, task: `Site visit for ${inc.id}: ${inc.title}`, skills: inc.cat === 'Wireless' ? ['Aruba wireless'] : inc.cat === 'SD-WAN' ? ['EdgeConnect swap'] : ['Aruba switching'], parts: [], tech: null, status: 'Unassigned', created: Date.now(), window: clk.open ? `After ${b.hours.close} local unless P1/P2` : 'Any time', priority: inc.pri }); upd({ workOrder: wo }); act.audit(`Created ${wo}`, inc.id); act.toast(`${wo} created – match a technician in Field Dispatch`); };
  const resolve = () => { const done = { ...inc, state: 'Resolved', resolved: Date.now(), closeCode: code }; act.del('incidents', id); act.add('resolved', done); act.map('branchHealth', b.id, 'up'); act.audit(`Resolved ${inc.id} (${code})`, inc.id); act.toast(`${inc.id} resolved`); setResolveOpen(false); act.set({ selInc: id }); };
  const similar = s.resolved.filter(x => x.kind === inc.kind && x.id !== inc.id).slice(0, 4);
  const kbs = s.kb.filter(k => (inc.cat === 'Carrier / LEC' && k.tags.includes('carrier')) || (inc.cat === 'Wireless' && k.tags.includes('wireless')) || (inc.kind === 'pos' && k.tags.includes('pos')) || (inc.cat === 'SD-WAN' && k.tags.includes('edgeconnect')) || (inc.kind === 'backup' && k.tags.includes('backup'))).slice(0, 3);
  const corrBy = {}; inc.signals.forEach(x => corrBy[x.src] = (corrBy[x.src] || 0) + 1);

  return (
    <div>
      <button onClick={() => act.set({ selInc: null })} className="text-[12.5px] text-ink2 hover:text-ink inline-flex items-center gap-1 mb-2"><I.ArrowLeft size={14} />Back to queue</button>
      <div className="bg-panel border border-line rounded-md p-4 mb-3">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex-1 min-w-[300px]">
            <div className="flex items-center gap-2 flex-wrap"><Pri p={inc.pri} /><span className="font-mono text-[13px] text-ink2">{inc.id}</span>{inc.major && <Badge tone="alert">MAJOR INCIDENT</Badge>}<Badge tone={inc.state === 'New' ? 'red' : inc.state.startsWith('On Hold') ? 'amber' : isRes ? 'green' : 'blue'}>{inc.state}</Badge><Badge>{inc.cat}</Badge><Logo k="servicenow" h={10} /></div>
            <h1 className="text-[20px] font-extrabold text-ink mt-1 leading-snug">{inc.title}</h1>
            <div className="text-[12.5px] text-ink2 mt-1 flex flex-wrap gap-x-3"><button onClick={() => act.openBranch(b.id)} className="font-semibold text-info hover:underline">{b.name}, {b.brand}</button><span>{b.city}, {b.state}</span><span>CI <span className="font-mono">{inc.ci}</span></span><span>{inc.group}</span><span>Assigned: <b>{inc.assignee || '—'}</b></span><span>Opened {dt(inc.opened)} CT</span></div>
          </div>
          <div className="flex gap-4">
            <div><div className="text-[11px] text-ink3 font-semibold">Response</div><RespTimer inc={inc} now={now} /></div>
            <div><div className="text-[11px] text-ink3 font-semibold">Resolution ({inc.pri})</div><SlaTimer inc={inc} now={now} /></div>
          </div>
        </div>
        {!isRes && <div className="flex flex-wrap gap-2 mt-3">
          {!inc.acked && <Btn kind="brand" icon={I.Hand} onClick={() => { upd({ acked: Date.now(), state: 'In Progress', assignee: ROLES.find(r => r.id === s.role).who }); act.audit(`Acknowledged ${inc.id}`, inc.id); }}>Acknowledge & take</Btn>}
          <Select label="Priority" value={inc.pri} onChange={v => { upd({ pri: v, group: v === 'P1' ? 'Movate NOC – Major Incident' : inc.group }); act.audit(`Priority ${inc.pri} → ${v} on ${inc.id}`, inc.id); }} options={['P1', 'P2', 'P3', 'P4']} />
          <Select label="State" value={inc.state} onChange={v => { upd({ state: v }); act.audit(`State → ${v} on ${inc.id}`, inc.id); }} options={['New', 'In Progress', 'On Hold – Carrier', 'On Hold – Branch', 'On Hold – Vendor']} />
          <Select label="Assign" value={inc.assignee || ''} onChange={v => { upd({ assignee: v }); act.audit(`Assigned ${inc.id} to ${v}`, inc.id); }} options={[{ value: '', label: '—' }, ...D.ENGINEERS.map(e => ({ value: e, label: e }))]} />
          {!inc.major && <Btn icon={I.Megaphone} onClick={() => { upd({ major: true, pri: 'P1', group: 'Movate NOC – Major Incident' }); act.audit(`Declared major incident ${inc.id}`, inc.id); act.toast('Major incident declared – leadership updates every 60 min', 'warn'); }}>Declare major</Btn>}
          {inc.cat === 'Carrier / LEC' && !inc.carrierCase && <Btn icon={I.RadioTower} onClick={raiseCase}>Raise carrier case</Btn>}
          {!inc.workOrder && <Btn icon={I.Truck} onClick={makeWO}>Create work order</Btn>}
          <div className="flex-1" />
          <Btn kind="ok" icon={I.CheckCheck} onClick={() => setResolveOpen(true)}>Resolve</Btn>
        </div>}
      </div>

      <div className="grid xl:grid-cols-[minmax(0,1fr)_360px] gap-3">
        <div>
          <div className="mb-3"><IncidentTelemetryCard inc={inc} /></div>
          <Tabs value={tab} onChange={setTab} className="mb-3" tabs={[{ id: 'timeline', label: 'Signal timeline', count: timeline.length }, { id: 'corr', label: 'Correlated events', count: inc.corr }, { id: 'rca', label: 'Root cause', count: inc.rca.length }, { id: 'agents', label: 'Agent steps', count: inc.agentSteps.length }, { id: 'runbook', label: 'Runbook' }, { id: 'verify', label: 'Verification', count: inc.verify.length }, { id: 'notes', label: 'Work notes', count: inc.notes.length }]} />
          {tab === 'timeline' && <Card pad={false}><div className="p-4"><ol className="relative border-l-2 border-line ml-2 space-y-3">
            {timeline.map((x, k) => (
              <li key={k} className="ml-4">
                <span className={cx('absolute -left-[7px] w-3 h-3 rounded-full border-2 border-panel', x.kind === 'signal' ? (x.sev === 'Critical' ? 'bg-bad' : x.sev === 'Major' ? 'bg-warn' : x.sev === 'Info' ? 'bg-info' : 'bg-ink3') : x.kind === 'agent' ? 'bg-ai' : 'bg-ink')} />
                <div className="flex items-center gap-2 text-[11.5px]"><span className="font-mono text-ink3">{hhmmss(x.t)}</span>{x.kind === 'signal' ? <>{SRC_LOGO[x.src] && <Logo k={SRC_LOGO[x.src]} h={10} />}<span className="text-ink3">{x.src}</span><Badge tone={x.sev === 'Critical' ? 'red' : x.sev === 'Major' ? 'amber' : x.sev === 'Info' ? 'blue' : 'gray'}>{x.sev}</Badge></> : x.kind === 'agent' ? <AgentChip a={x.agent} /> : <span className="font-bold text-ink">{x.who}</span>}</div>
                <div className="text-[13px] text-ink mt-0.5">{x.msg || x.text}</div>
              </li>
            ))}
          </ol></div></Card>}
          {tab === 'corr' && <Card title={`${inc.corr} raw events → 1 incident`} sub={`${inc.suppressed} suppressed as duplicates, flaps or children of the parent fault (OpsRamp correlation + Mova iO Graph Builder)`}>
            <div className="grid md:grid-cols-3 gap-2 mb-3">{Object.entries(corrBy).map(([src, n]) => <div key={src} className="border border-line rounded-md p-2 flex items-center gap-2">{SRC_LOGO[src] ? <Logo k={SRC_LOGO[src]} h={12} /> : <I.Radio size={14} className="text-ink3" />}<span className="text-[12.5px] text-ink flex-1">{src}</span><b className="text-ink">{n}</b></div>)}</div>
            <Table dense rows={inc.signals.map((x, k) => ({ ...x, id: k }))} cols={[{ key: 't', label: 'Time', render: x => <span className="font-mono text-[12px]">{hhmmss(x.t)}</span> }, { key: 'src', label: 'Source' }, { key: 'sev', label: 'Severity', render: x => <Badge tone={x.sev === 'Critical' ? 'red' : x.sev === 'Major' ? 'amber' : 'gray'}>{x.sev}</Badge> }, { key: 'msg', label: 'Event' }, { key: 'role', label: 'Role', render: (x) => <span className="text-[11.5px] text-ink3">{x.id === 0 ? 'Parent' : 'Child / duplicate'}</span> }]} />
            {inc.children && inc.children.length > 0 && <div className="mt-3"><div className="text-[12px] font-bold text-ink3 mb-1">Branches grouped into this major incident</div><div className="flex flex-wrap gap-1.5">{inc.children.map(id => <button key={id} onClick={() => act.openBranch(id)}><Badge tone={healthOf(s, D.BR[id]) === 'down' ? 'red' : 'amber'}>{D.BR[id].name}, {D.BR[id].brand}</Badge></button>)}</div></div>}
          </Card>}
          {tab === 'rca' && <Card title="Root-cause ranking" sub="Diagnosis Agent over the network knowledge graph, topology, recent changes and carrier status" icon={I.Microscope}>
            {inc.rca.length ? inc.rca.map((r, k) => (
              <div key={k} className={cx('border rounded-md p-3 mb-2', k === 0 ? 'border-ai/40 bg-ai/5' : 'border-line')}>
                <div className="flex items-center gap-2"><span className="text-[12px] font-bold text-ink3">#{k + 1}</span><span className="font-bold text-ink text-[13.5px] flex-1">{r.cause}</span><Conf value={r.conf} showGate={k === 0} /></div>
                <div className="text-[12.5px] text-ink2 mt-1"><b>Evidence:</b> {r.ev}</div>
              </div>)) : <Empty icon={I.Hourglass} title="Diagnosis in progress" sub="Signals still arriving" />}
            {inc.rca[0] && inc.rca[0].conf < 0.8 && <div className="text-[12px] text-warn mt-2 flex items-center gap-1.5"><I.ShieldAlert size={14} />Top cause is below 80% – the agent will only recommend; an engineer decides.</div>}
          </Card>}
          {tab === 'agents' && <Card title="Mova iO agent steps" sub="Every agent action is logged with its evidence">
            <ol className="space-y-2">{inc.agentSteps.map((x, k) => <li key={k} className="flex gap-3 border border-line rounded-md p-2.5"><span className="font-mono text-[11.5px] text-ink3 w-16 shrink-0">{hhmmss(x.t)}</span><div className="flex-1"><AgentChip a={x.agent} /><div className="text-[12.5px] text-ink mt-0.5">{x.text}</div><div className="text-[11px] text-ink3 mt-0.5">{AG[x.agent] && AG[x.agent].also}</div></div><I.CheckCircle2 size={15} className="text-ok shrink-0" /></li>)}</ol>
          </Card>}
          {tab === 'runbook' && (rb ? <Card title={`${rb.id}, ${rb.name}`} sub={rb.desc} icon={I.Workflow} right={<Badge tone="purple">{rb.autonomy} – {D.AUTONOMY[rb.autonomy]}</Badge>}>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <div className="text-[12px] font-bold text-ink3 mb-1">Steps</div>
                <ol className="space-y-1.5">{rb.steps.map((st, k) => <li key={k} className="flex items-start gap-2 text-[12.5px]">{running > k || inc.rbState === 'done' ? <I.CheckCircle2 size={15} className="text-ok mt-0.5" /> : running === k ? <I.Loader2 size={15} className="text-info animate-spin mt-0.5" /> : <I.Circle size={15} className="text-ink3 mt-0.5" />}<span className="text-ink">{st}</span></li>)}</ol>
                <div className="text-[12px] font-bold text-ink3 mt-3 mb-1">Rollback</div><div className="text-[12.5px] text-ink2">{rb.rollback}</div>
                <div className="text-[12px] font-bold text-ink3 mt-3 mb-1">Track record</div><div className="text-[12.5px] text-ink2">{rb.runs30} runs in 30 days, {Math.round(rb.success * 100)}% success, avg {rb.avg}</div>
              </div>
              <div className="space-y-3">
                <div><div className="text-[12px] font-bold text-ink3 mb-1">Confidence</div><Conf value={inc.conf || 0} /></div>
                <GateBox g={g} />
                <div className="text-[12px] text-ink2">Status: <b className="text-ink">{inc.rbState}</b></div>
                {!isRes && <div className="flex flex-wrap gap-2">
                  {inc.rbState !== 'done' && inc.rbState !== 'running' && (g.auto ? <Btn kind="ok" icon={I.Play} onClick={() => runRunbook(false)}>Run now</Btn> : <Btn kind="ok" icon={I.ShieldCheck} onClick={() => runRunbook(true)}>Approve & run</Btn>)}
                  {inc.rbState !== 'done' && inc.rbState !== 'running' && !g.auto && <Btn icon={I.Send} onClick={toApproval}>Send to approvals queue</Btn>}
                  {inc.rbState !== 'running' && <Btn icon={I.FlaskConical} onClick={() => { act.note(inc.id, `Dry run of ${rb.id}: all pre-checks pass; ${rb.steps.length} steps would execute; no changes made.`); act.toast('Dry run complete – see work notes', 'info'); }}>Dry run</Btn>}
                  {inc.rbState === 'done' && rb.kind === 'change' && <Btn kind="danger" icon={I.Undo2} onClick={rollback}>Rollback</Btn>}
                </div>}
              </div>
            </div>
          </Card> : <Card><Empty icon={I.Workflow} title="No runbook recommended yet" sub="The Runbook Agent proposes one once the root cause is above the evidence threshold." /></Card>)}
          {tab === 'verify' && <Card title="Verification" sub="Checks that must pass before the incident can be resolved">
            {inc.verify.length ? inc.verify.map((v, k) => <div key={k} className="flex items-center gap-2 py-2 border-b border-line/60 last:border-0 text-[13px]">{v.st === 'pass' ? <I.CheckCircle2 size={16} className="text-ok" /> : v.st === 'fail' ? <I.XCircle size={16} className="text-bad" /> : <I.Circle size={16} className="text-ink3" />}<span className="flex-1 text-ink">{v.v}</span><span className="text-ink3 text-[12px]">{v.val || 'pending'}</span></div>) : <Empty title="No checks yet" />}
            {!isRes && <Btn className="mt-3" icon={I.RefreshCw} onClick={() => { upd(x => ({ verify: x.verify.map(v => ({ ...v, st: x.rbState === 'done' ? 'pass' : v.st, val: x.rbState === 'done' ? (v.val || 'OK') : v.val })) })); act.toast('Verification re-run', 'info'); }}>Re-run checks</Btn>}
          </Card>}
          {tab === 'notes' && <Card title="Work notes">
            <div className="space-y-2 mb-3">{inc.notes.map((n, k) => <div key={k} className="border border-line rounded-md p-2.5"><div className="text-[11.5px] text-ink3"><b className="text-ink">{n.who}</b>, {dt(n.t)} CT</div><div className="text-[13px] text-ink mt-0.5">{n.text}</div></div>)}{!inc.notes.length && <div className="text-ink3 text-[13px]">No notes yet.</div>}</div>
            <form onSubmit={e => { e.preventDefault(); if (!note.trim()) return; act.note(inc.id, note); setNote(''); }} className="flex gap-2"><input value={note} onChange={e => setNote(e.target.value)} placeholder="Add a work note…" className="flex-1 h-9 px-3 rounded-md border border-line bg-canvas text-ink text-[13px] outline-none" /><Btn kind="brand" icon={I.Send} type="submit">Post</Btn></form>
          </Card>}
        </div>
        <div className="space-y-3">
          {!isRes && <PreventRecurrence inc={inc} />}
          <Card title="Business impact" icon={I.Store}>
            {inc.impact.map((x, k) => <div key={k} className="text-[12.5px] text-ink flex gap-1.5 py-0.5"><I.Dot size={16} className="text-ink3 shrink-0" />{x}</div>)}
            <div className="mt-2 text-[12px] text-ink2">Branch local time <b className="text-ink">{clk.local}</b> – {clk.open ? <span className="text-warn font-semibold">open, trading</span> : 'closed'}</div>
            <Btn size="sm" className="mt-2" icon={I.Network} onClick={() => act.set({ module: 'graph', graphBranch: b.id, selInc: null })}>Blast radius in graph</Btn>
          </Card>
          <Card title="WAN at this branch" icon={I.Cable}>
            {b.wan.map(cid => { const cc = circuitOf(s, cid); return <div key={cid} className="text-[12.5px] py-1 border-b border-line/60 last:border-0"><div className="flex items-center gap-1.5"><Dot tone={cc.status === 'Up' ? 'green' : cc.status === 'Degraded' ? 'amber' : 'red'} /><b className="text-ink">{cc.role}</b><span className="text-ink2">{cc.carrier} {cc.type}</span><span className="ml-auto text-ink3">{cc.status}</span></div><div className="text-[11.5px] text-ink3 ml-3.5">{cc.lat} ms, jitter {cc.jit} ms, loss {cc.loss}%</div></div>; })}
          </Card>
          <Card title="Linked records" icon={I.Link}>
            <KV k="Carrier case" v={inc.carrierCase ? <button className="text-info hover:underline" onClick={() => act.go('carriers')}>{inc.carrierCase}</button> : '—'} />
            <KV k="Work order" v={inc.workOrder ? <button className="text-info hover:underline" onClick={() => act.go('dispatch')}>{inc.workOrder}</button> : '—'} />
            <KV k="Runbook" v={rb ? `${rb.id} (${inc.rbState})` : '—'} />
            {isRes && <KV k="Close code" v={inc.closeCode} />}
          </Card>
          <Card title="Knowledge & similar incidents" icon={I.BookOpen}>
            {kbs.map(k => <button key={k.id} onClick={() => act.set({ module: 'knowledge', kbOpen: k.id, selInc: null })} className="block text-left text-[12.5px] py-1 text-info hover:underline">{k.id} – {k.title}</button>)}
            {similar.map(x => <button key={x.id} onClick={() => act.set({ selInc: x.id })} className="block text-left text-[12px] py-1 text-ink2 hover:text-ink"><span className="font-mono">{x.id}</span>, {D.BR[x.branchId].name}, {x.closeCode}, {dur(x.resolved - x.opened)}</button>)}
            {!kbs.length && !similar.length && <div className="text-[12.5px] text-ink3">No close matches.</div>}
          </Card>
        </div>
      </div>
      <Modal open={resolveOpen} onClose={() => setResolveOpen(false)} title={`Resolve ${inc.id}`} sub="Close code feeds the ticket-mix and NTF reporting" footer={<><Btn kind="ok" icon={I.CheckCheck} onClick={resolve}>Resolve incident</Btn><Btn onClick={() => setResolveOpen(false)}>Cancel</Btn></>}>
        <Select label="Close code" value={code} onChange={setCode} options={['Carrier / LEC', 'No trouble found (NTF)', 'After-hours mended', 'Customer-caused', 'Reboot', 'Hardware replaced', 'Config change']} />
        <div className="mt-3 text-[12.5px] text-ink2">Verification: {inc.verify.filter(v => v.st === 'pass').length}/{inc.verify.length} passed. {inc.verify.some(v => v.st !== 'pass') && <span className="text-warn font-semibold">Some checks have not passed – resolving anyway will be noted.</span>}</div>
      </Modal>
    </div>
  );
}
