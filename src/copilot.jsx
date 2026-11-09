// OpsRamp Operations Copilot, as it works on SRS data: one assistant with channels (Search, Command Center, the
// probable-root-cause agent, the Dashboard Assistant and the Documentation Assistant), an orchestrator that hands
// each question to specialised agents, one-click Recommend-mode actions, and usage insights by agent and model.
import React, { useState, useMemo } from 'react';
import * as I from 'lucide-react';
import * as D from './data.js';
import { useApp, useNow, healthOf, slaClock } from './store.jsx';
import { useLive } from './live.jsx';
import { Card, Badge, Btn, Select, Pri, cx } from './ui.jsx';
import { HBars, Bars, Donut, C } from './charts.jsx';
import { answer } from './ask.js';
import { AskBlock } from './askblocks.jsx';
import { rootOf } from './dash/drilldata.js';
import { num, ago, hhmm } from './util.js';

const CH = [
  { id: 'search', name: 'Search', icon: I.Search, agent: 'Search agent', llm: 'Hosted LLM, large', sub: 'Ask about alerts, devices, lines and incidents in plain English' },
  { id: 'cc', name: 'Command Center', icon: I.Siren, agent: 'Command Center agent', llm: 'Hosted LLM, large', sub: 'Critical alerts waiting for a decision, with OpsQ recommendations' },
  { id: 'prc', name: 'Root cause agent', icon: I.Microscope, agent: 'Probable root cause agent', llm: 'Hosted LLM, large', sub: 'Probable root cause across the alerts of one incident' },
  { id: 'dash', name: 'Dashboard Assistant', icon: I.LayoutDashboard, agent: 'Dashboard agent', llm: 'Hosted LLM, small', sub: 'Describe a tile; review it; add it to your dashboard' },
  { id: 'docs', name: 'Documentation Assistant', icon: I.BookOpen, agent: 'Documentation agent', llm: 'Hosted LLM, small', sub: 'Answers from the OpsRamp docs and the SRS knowledge base, with sources' },
];
const BASE = { search: [412, 0.94, 1.8, 2100], cc: [188, 0.97, 2.4, 2600], prc: [96, 0.91, 4.1, 5200], dash: [57, 0.89, 3.2, 1800], docs: [143, 0.96, 1.5, 1300] };
const RATE = { 'Hosted LLM, large': 0.012, 'Hosted LLM, small': 0.002 }; // dollars per 1,000 tokens (illustrative)
const PROMPTS = {
  search: ['Which branches are down right now?', 'Show P1 and P2 incidents', 'Which lines are flapping?', 'Devices with a critical vulnerability'],
  dash: ['Open incidents by priority', 'Alerts by region in the last 24 hours', 'Top 10 branches by tickets', 'Lines with loss above 1%'],
  docs: ['What is Observed mode?', 'How does first response work?', 'How do I raise a carrier case?', 'What does the NextGen gateway do?'],
};
// OpsRamp concepts the Documentation Assistant can cite, besides the SRS knowledge base
const DOCS = [
  { id: 'DOC-OPSQ-MODES', title: 'OpsQ policy modes: Off, Observed, Recommend, On', tags: ['observed', 'recommend', 'mode', 'shadow', 'promote'], body: 'Observed mode records shadow inferences without touching live alerts, so you can check accuracy. Recommend mode suggests the action and an engineer accepts it with one click. On applies the policy automatically.' },
  { id: 'DOC-FRP', title: 'First response policies', tags: ['first response', 'suppress', 'learned', 'training'], body: 'First response runs before or after correlation. It suppresses known noise and can run a process for a given alert. It learns from user rules first, then a training file, then machine learning on alert history.' },
  { id: 'DOC-ACP', title: 'Alert correlation policies', tags: ['correlation', 'topology', 'cluster', 'sequence', 'time window'], body: 'Correlation groups alerts by time window, clustering on attributes, co-occurrence learned from history, and topology and dependency. Correlation stays within the scope the policy defines.' },
  { id: 'DOC-AEP', title: 'Alert escalation policies', tags: ['escalation', 'servicenow', 'incident', 'ticket'], body: 'An alert with no correlation or first response policy goes straight to escalation. Otherwise escalation starts when correlation finishes, and opens or updates the ServiceNow incident.' },
  { id: 'DOC-GW', title: 'NextGen gateway', tags: ['gateway', 'discovery', 'collector', 'snmp'], body: 'The gateway collects from devices inside the network (SNMP, SSH, WMI, APIs) and sends metrics, events and discovery results to OpsRamp over an outbound connection.' },
];
const W = s => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !['the', 'and', 'how', 'what', 'does', 'for', 'with', 'are', 'which'].includes(w));

// a dashboard tile from a plain-English request
function makeTile(q, s, now) {
  const t = q.toLowerCase(), open = s.incidents.filter(i => i.state !== 'Resolved');
  if (/priorit/.test(t)) return { kind: 'donut', title: 'Open incidents by priority', q: 'incidents | state != Resolved | group by priority', data: ['P1', 'P2', 'P3', 'P4'].map((p, k) => ({ label: p, value: open.filter(i => i.pri === p).length, color: [C.bad, C.warn, C.s1, C.s3][k] })) };
  if (/region/.test(t)) { const m = {}; open.forEach(i => { const r = D.BR[i.branchId].region; m[r] = (m[r] || 0) + 1 + i.corr; }); return { kind: 'hbars', title: 'Alerts by region, last 24 hours', q: 'alerts | last 24h | group by region', data: Object.entries(m).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value })) }; }
  if (/ticket|branch/.test(t)) { const rows = D.BRANCHES.map(b => ({ label: b.name, value: D.CIR[b.wan[0]].tickets90 + D.CIR[b.wan[1]].tickets90 })).sort((a, b) => b.value - a.value).slice(0, 10); return { kind: 'hbars', title: 'Top 10 branches by tickets, 90 days', q: 'tickets | last 90d | group by branch | top 10', data: rows }; }
  if (/loss|line|circuit/.test(t)) { const rows = D.CIRCUITS.filter(c => c.loss >= 1 || c.flaps30 >= 3).slice(0, 10).map(c => ({ label: `${c.carrier} ${c.id}`, value: Math.max(c.loss, c.flaps30 || 0) })); return { kind: 'hbars', title: 'Lines with loss above 1% or flapping', q: 'circuits | loss > 1% or flaps30 >= 3', data: rows.length ? rows : [{ label: 'None right now', value: 0 }] }; }
  const st = { up: 0, degraded: 0, down: 0 }; D.BRANCHES.forEach(b => { const h = healthOf(s, b); st[h === 'up' ? 'up' : h === 'down' ? 'down' : 'degraded']++; });
  return { kind: 'donut', title: 'Branch health now', q: 'branches | group by health', data: [{ label: 'Healthy', value: st.up, color: C.ok }, { label: 'Degraded', value: st.degraded, color: C.warn }, { label: 'Down', value: st.down, color: C.bad }] };
}
function Tile({ t, onRemove }) {
  return (
    <div className="border border-line rounded-lg p-3 bg-panel min-w-0">
      <div className="flex items-start gap-2 mb-2"><div className="flex-1 min-w-0"><b className="text-[13px] text-ink block">{t.title}</b><code className="text-[11px] text-ink3 block truncate">{t.q}</code></div>{onRemove && <button onClick={onRemove} title="Remove the tile" className="text-ink3 hover:text-ink"><I.X size={14} /></button>}</div>
      {t.kind === 'donut' ? <Donut data={t.data} size={110} stroke={16} center={num(t.data.reduce((a, d) => a + d.value, 0))} /> : <HBars rows={t.data} labelW={170} fmt={v => num(v)} />}
    </div>
  );
}

export function OperationsCopilot() {
  const { s, act } = useApp(); const { L } = useLive(); const now = useNow();
  const [ch, setCh] = useState('search');
  const [q, setQ] = useState('');
  const [log, setLog] = useState({ search: [], dash: [], docs: [] });
  const [done, setDone] = useState({});
  const open = s.incidents.filter(i => i.state !== 'Resolved').sort((a, b) => a.pri.localeCompare(b.pri) || a.opened - b.opened);
  const [inc, setInc] = useState(open[0] ? open[0].id : null);
  const use = s.copilotUse || {};
  const C0 = CH.find(x => x.id === ch);
  const track = (id, tok, ok = true) => act.set(x => { const u = { ...(x.copilotUse || {}) }; const v = u[id] || { n: 0, tok: 0, ok: 0 }; u[id] = { n: v.n + 1, tok: v.tok + tok, ok: v.ok + (ok ? 1 : 0) }; return { copilotUse: u }; });
  const trace = id => ({ search: ['Orchestrator', 'Search agent', 'Network data agent'], prc: ['Orchestrator', 'Root cause agent', 'Topology agent', 'Change agent'], dash: ['Orchestrator', 'Dashboard agent', 'Query builder'], docs: ['Orchestrator', 'Documentation agent'], cc: ['Orchestrator', 'Command Center agent', 'OpsQ'] }[id]);
  const ask = text => {
    if (!text.trim()) return;
    if (ch === 'search') { const a = answer(s, text, now, L); setLog(l => ({ ...l, search: [...l.search, { q: text, a, t: now }] })); track('search', 1800 + text.length * 20, !!a); }
    if (ch === 'dash') { const t = makeTile(text, s, now); setLog(l => ({ ...l, dash: [...l.dash, { q: text, tile: t, t: now }] })); track('dash', 1600); }
    if (ch === 'docs') { const ws = W(text); const all = [...DOCS, ...s.kb.map(k => ({ id: k.id, title: k.title, tags: k.tags || [], body: k.body || '' }))]; const hits = all.map(d => ({ d, sc: ws.reduce((a, w) => a + ((d.title + ' ' + d.tags.join(' ') + ' ' + d.body).toLowerCase().includes(w) ? 1 : 0), 0) })).filter(x => x.sc > 0).sort((a, b) => b.sc - a.sc).slice(0, 3); setLog(l => ({ ...l, docs: [...l.docs, { q: text, hits, t: now }] })); track('docs', 1200, hits.length > 0); }
    setQ('');
  };
  // Recommend mode: OpsQ's suggestion for each critical alert, applied with one click
  const recOf = i => { const r = rootOf(i).top; return i.kind === 'circuit' || i.kind === 'lte' ? ['Escalate to incident', `Carrier fault (${Math.round(r.conf * 100)}%): raise the carrier case`] : i.kind === 'backup' ? ['Suppress', 'Known nightly backup pattern; RB-109 already re-ran it'] : i.kind === 'apdown' ? ['Run first response', 'RB-103 port bounce fixes this 9 times in 10'] : ['Escalate to incident', `${r.layer}: ${r.text}`]; };
  const decide = (i, what) => {
    setDone(d => ({ ...d, [i.id]: what })); track('cc', 900);
    if (what === 'Escalate to incident') { act.upd('incidents', i.id, { acked: i.acked || Date.now() }); act.audit(`Copilot Recommend: ${i.id} escalated to a ServiceNow incident`, i.id); act.toast(`${i.id} escalated to ServiceNow`); }
    else if (what === 'Suppress') { act.audit(`Copilot Recommend: ${i.id} suppressed (known pattern)`, i.id); act.toast(`${i.id} suppressed; the alerts stay visible on it`); }
    else { act.add('runs', { id: Date.now(), rb: i.runbook, t: Date.now(), branchId: i.branchId, branch: D.BR[i.branchId].name, by: act.me(), res: 'Success', dur: '22 s' }); act.audit(`Copilot Recommend: first response ${i.runbook} ran on ${i.id}`, i.id); act.toast(`${i.runbook} ran on ${i.ci}`); }
  };
  const I0 = open.find(x => x.id === inc) || open[0];
  const usage = CH.map(c => { const b = BASE[c.id], u = use[c.id] || { n: 0, tok: 0, ok: 0 }; const n = b[0] + u.n, tok = b[0] * b[3] + u.tok; return { ...c, n, ok: (b[0] * b[1] + u.ok) / n, lat: b[2], tok, cost: tok / 1000 * RATE[c.llm] }; });
  const tokAll = usage.reduce((a, x) => a + x.tok, 0), costAll = usage.reduce((a, x) => a + x.cost, 0);
  return (
    <Card title="Operations Copilot" sub="One assistant for the NOC: ask, investigate, decide and build, on live SRS data" icon={I.Bot} pad={false}>
      <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_280px] min-h-[560px]">
        <nav className="border-b lg:border-b-0 lg:border-r border-line p-2 space-y-0.5">{CH.map(c => (
          <button key={c.id} onClick={() => setCh(c.id)} className={cx('w-full text-left rounded-md px-2.5 py-2 flex items-start gap-2', ch === c.id ? 'bg-chip' : 'hover:bg-chip/60')}>
            <c.icon size={15} className="mt-[2px] shrink-0 text-ink2" /><span className="min-w-0"><b className="text-[12.5px] text-ink block">{c.name}</b><span className="text-[11px] text-ink3 leading-tight block">{c.sub}</span></span>
          </button>))}
          <div className="pt-2 mt-2 border-t border-line px-2.5 text-[11px] text-ink3">Every question goes through an orchestrator that hands it to the right agents; each answer shows which ones worked on it.</div>
        </nav>
        <section className="p-3 min-w-0 flex flex-col">
          <div className="flex items-center gap-2 mb-2"><C0.icon size={15} className="text-ink2" /><b className="text-[13.5px] text-ink">{C0.name}</b><span className="text-[11.5px] text-ink3 hidden md:inline">· {trace(ch).join(' → ')}</span></div>
          {(ch === 'search' || ch === 'dash' || ch === 'docs') && <>
            <div className="flex flex-wrap gap-1.5 mb-2">{PROMPTS[ch].map(p => <button key={p} onClick={() => ask(p)} className="text-[12px] border border-line rounded-md px-2 py-1 hover:bg-chip text-ink">{p}</button>)}</div>
            <div className="flex-1 space-y-3 overflow-y-auto max-h-[520px] pr-1">
              {log[ch].length === 0 && <div className="text-[12.5px] text-ink3 py-6 text-center">Pick a suggestion or type below.</div>}
              {ch === 'search' && log.search.map((x, k) => <div key={k} className="space-y-1.5"><div className="flex justify-end"><div className="bg-ink text-canvas rounded-md px-3 py-1.5 text-[12.5px]">{x.q}</div></div>
                <div className="bg-chip/60 border border-line rounded-md p-3 text-[12.5px] space-y-2"><b className="text-ink text-[13px] block">{x.a.title}</b>{x.a.lead && <p className="text-ink2">{x.a.lead}</p>}{(x.a.blocks || []).map((b, j) => <AskBlock key={j} k={b} maxRows={8} go={r => r.inc ? act.openInc(r.inc) : r.branch && act.openBranch(r.branch)} />)}
                  <div className="text-[11px] text-ink3">Search agent · {hhmm(x.t)} CT{x.a.src ? ` · from ${x.a.src}` : ''}</div></div></div>)}
              {ch === 'dash' && log.dash.map((x, k) => <div key={k} className="space-y-1.5"><div className="flex justify-end"><div className="bg-ink text-canvas rounded-md px-3 py-1.5 text-[12.5px]">{x.q}</div></div>
                <Tile t={x.tile} /><div className="flex gap-2"><Btn size="xs" kind="brand" icon={I.Plus} onClick={() => { act.set(st => ({ copilotTiles: [...(st.copilotTiles || []), { ...x.tile, id: Date.now() }] })); act.toast('Tile added to your dashboard'); }}>Add to my dashboard</Btn><span className="text-[11px] text-ink3 self-center">Review the query before you add it.</span></div></div>)}
              {ch === 'docs' && log.docs.map((x, k) => <div key={k} className="space-y-1.5"><div className="flex justify-end"><div className="bg-ink text-canvas rounded-md px-3 py-1.5 text-[12.5px]">{x.q}</div></div>
                <div className="bg-chip/60 border border-line rounded-md p-3 text-[12.5px] space-y-2">{x.hits.length ? <>{<p className="text-ink">{x.hits[0].d.body}</p>}<div className="text-[11px] text-ink3">Sources: {x.hits.map(h => <span key={h.d.id} className="mr-2"><span className="font-mono">{h.d.id}</span> {h.d.title}</span>)}</div></> : <p className="text-ink2">Nothing in the docs or the knowledge base matches. Try other words.</p>}</div></div>)}
            </div>
            <form onSubmit={e => { e.preventDefault(); ask(q); }} className="mt-2 flex gap-2"><input value={q} onChange={e => setQ(e.target.value)} placeholder={ch === 'dash' ? 'e.g. "Open incidents by priority"' : ch === 'docs' ? 'e.g. "How does Recommend mode work?"' : 'e.g. "Which branches are down right now?"'} className="flex-1 h-9 px-3 rounded-md border border-line bg-canvas text-ink text-[13px] outline-none focus:border-ink3" /><Btn kind="brand" icon={I.Send} type="submit">Ask</Btn></form>
            {ch === 'dash' && (s.copilotTiles || []).length > 0 && <div className="mt-3 border-t border-line pt-3"><div className="text-[11px] font-bold uppercase text-ink3 mb-2">My dashboard</div><div className="grid grid-cols-1 md:grid-cols-2 gap-2">{s.copilotTiles.map(t => <Tile key={t.id} t={t} onRemove={() => act.set(st => ({ copilotTiles: st.copilotTiles.filter(x => x.id !== t.id) }))} />)}</div></div>}
          </>}
          {ch === 'cc' && <div className="space-y-1.5 overflow-y-auto max-h-[560px] pr-1">{open.slice(0, 12).map(i => { const [rec, why] = recOf(i), d = done[i.id], c = slaClock(i, now); return (
            <div key={i.id} className={cx('border rounded-md px-3 py-2', d ? 'border-line bg-chip/40' : 'border-line')}>
              <div className="flex items-center gap-2 flex-wrap"><Pri p={i.pri} /><button onClick={() => act.openInc(i.id)} className="font-mono text-[12px] text-ink hover:underline">{i.id}</button><span className="text-[12.5px] text-ink font-semibold flex-1 min-w-[200px] truncate">{i.title}</span><span className="text-[11.5px] text-ink3">{D.BR[i.branchId].name} · opened {ago(i.opened, now)}</span></div>
              <div className="flex items-center gap-2 flex-wrap mt-1 text-[12px]"><Badge tone="amber">OpsQ recommends</Badge><b className="text-ink">{rec}</b><span className="text-ink2 flex-1 min-w-[200px]">{why}</span>
                {d ? <span className="text-ok font-semibold inline-flex items-center gap-1"><I.CheckCircle2 size={13} />{d}</span> : <span className="inline-flex gap-1"><Btn op size="xs" kind="brand" onClick={() => decide(i, rec)}>{rec}</Btn>{['Escalate to incident', 'Suppress', 'Run first response'].filter(x => x !== rec).map(x => <Btn op key={x} size="xs" onClick={() => decide(i, x)}>{x}</Btn>)}</span>}</div>
            </div>); })}</div>}
          {ch === 'prc' && I0 && (() => { const R = rootOf(I0); return <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap"><span className="text-[12px] text-ink3">Incident</span><Select value={I0.id} onChange={v => { setInc(v); track('prc', 5200); }} options={open.slice(0, 20).map(i => ({ value: i.id, label: `${i.id} · ${i.pri} · ${i.title.slice(0, 48)}` }))} /></div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">{R.layers.map(l => <div key={l.layer} className={cx('rounded-md border px-3 py-2', l.cause ? 'border-bad/50 bg-bad/5' : 'border-line')}><div className="text-[11px] font-bold uppercase text-ink3">{l.layer}</div><b className={cx('text-[12.5px]', l.cause ? 'text-bad' : 'text-ok')}>{l.cause ? 'Probable cause here' : 'Ruled out'}</b><div className="text-[11.5px] text-ink2">{l.r ? l.r.ev || l.r.text : l.plain}</div></div>)}</div>
            <div><div className="text-[11px] font-bold uppercase text-ink3 mb-1">Probable causes, ranked</div><HBars rows={R.causes.map(c => ({ label: c.text, value: Math.round(c.conf * 100), sub: c.ev }))} max={100} labelW={260} fmt={v => `${v}%`} /></div>
            <div><div className="text-[11px] font-bold uppercase text-ink3 mb-1">Alerts it looked at ({I0.signals.length} plus {I0.corr} correlated)</div><ul className="text-[12px] space-y-0.5">{I0.signals.map((g, k) => <li key={k} className="flex gap-2"><code className="text-ink3 w-12 shrink-0">{hhmm(g.t)}</code><b className="text-ink w-28 shrink-0 truncate">{g.src}</b><span className="text-ink2">{g.msg}</span></li>)}</ul></div>
            <div className="flex gap-2"><Btn size="sm" icon={I.Layers} onClick={() => act.drill({ t: 'rca', id: I0.id })}>Open the full root cause</Btn><Btn size="sm" icon={I.Ticket} onClick={() => act.openInc(I0.id)}>Open the incident</Btn></div>
          </div>; })()}
        </section>
        <aside className="border-t xl:border-t-0 xl:border-l border-line p-3 text-[12.5px]">
          <div className="text-[11px] font-bold uppercase text-ink3 mb-2">Agents and usage today</div>
          <div className="grid grid-cols-2 gap-2 mb-3">{[['Requests', num(usage.reduce((a, x) => a + x.n, 0))], ['Answered well', `${Math.round(usage.reduce((a, x) => a + x.ok * x.n, 0) / usage.reduce((a, x) => a + x.n, 0) * 100)}%`], ['Tokens', `${(tokAll / 1e6).toFixed(2)} M`], ['Cost', `$${costAll.toFixed(2)}`]].map(([k, v]) => <div key={k} className="rounded border border-line px-2 py-1.5"><div className="text-[11px] text-ink3">{k}</div><b className="text-ink tabular-nums">{v}</b></div>)}</div>
          <table className="w-full text-[12px]"><thead><tr className="text-left text-ink3 text-[11px] border-b border-line"><th className="py-1 font-semibold">Agent</th><th className="py-1 font-semibold text-right">Runs</th><th className="py-1 font-semibold text-right">Good</th></tr></thead>
            <tbody>{usage.map(u => <tr key={u.id} className="border-b border-line/60 last:border-0"><td className="py-1"><span className="text-ink">{u.agent}</span><span className="block text-[10.5px] text-ink3">{u.llm} · {u.lat}s · ${u.cost.toFixed(2)}</span></td><td className="py-1 text-right tabular-nums">{num(u.n)}</td><td className="py-1 text-right tabular-nums">{Math.round(u.ok * 100)}%</td></tr>)}</tbody></table>
          <p className="text-[11px] text-ink3 mt-2">Token budget for the month: {Math.round(tokAll * 22 / 1e6)} M of 60 M. Costs are illustrative.</p>
        </aside>
      </div>
    </Card>
  );
}
