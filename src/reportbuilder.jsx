// Reports anyone can build from the console's live tables: pick a source, group it, filter it, click a bar to go
// into that group and a row to open the record. Saved reports come back after a refresh. And a question box that
// answers from live data on any report.
import React, { useMemo, useState } from 'react';
import * as I from 'lucide-react';
import * as D from './data.js';
import { useApp, useNow } from './store.jsx';
import { useLive } from './live.jsx';
import { Card, Btn, Select, cx } from './ui.jsx';
import { HBars, C } from './charts.jsx';
import { TABLES, TABLE } from './cmdb.js';
import { answer } from './ask.js';
import { AskBlock } from './askblocks.jsx';
import { num, downloadFile } from './util.js';

const SOURCES = ['incident', 'cmdb_ci_netgear', 'cmdb_ci_circuit', 'cmdb_ci_site', 'change_request', 'wm_order', 'carrier_case', 'problem', 'cmdb_ci_onboarded', 'audit_log'];
const label = v => v == null || v === '' ? '(empty)' : String(v);
const brName = id => D.BR[id] ? D.BR[id].name : id;
const show = (c, v) => c === 'site_id' ? brName(v) : /_at$|^eta$|^at$|warranty_end/.test(c) && v ? String(v).slice(0, 10) : label(v);
const PRESETS = [
  { name: 'Open incidents by branch', table: 'incident', by: 'site_id', f: [['state', 'In Progress']] },
  { name: 'Devices by firmware', table: 'cmdb_ci_netgear', by: 'firmware', f: [] },
  { name: 'Circuits by carrier', table: 'cmdb_ci_circuit', by: 'carrier', f: [] },
  { name: 'Failed config backups by model', table: 'cmdb_ci_netgear', by: 'model', f: [['backup_state', 'Failed']] },
  { name: 'Incidents by category', table: 'incident', by: 'category', f: [] },
];

export function ReportBuilder() {
  const { s, act } = useApp();
  const [r, setR] = useState(() => s.tab.reportDraft || PRESETS[0]);
  const set = x => { const n = { ...r, ...x }; setR(n); act.setTab('reportDraft', n); };
  const t = TABLE[r.table];
  const all = useMemo(() => t.rows(s), [r.table, s.incidents, s.resolved, s.changes, s.workOrders, s.cases, s.problems, s.invAdded, s.audit, s.devState, s.circuitState]);
  const rows = all.filter(x => r.f.every(([c, v]) => label(x[c]) === v));
  const groups = useMemo(() => { const m = {}; rows.forEach(x => { const k = /_at$|^at$/.test(r.by) && x[r.by] ? String(x[r.by]).slice(0, 10) : label(x[r.by]); m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]); }, [rows, r.by]);
  const textCols = t.cols.filter(([c, ty]) => c !== 'id' && ty !== 'int');
  const fCol = r.fc || textCols[0][0];
  const fVals = [...new Set(all.map(x => label(x[fCol])))].slice(0, 60);
  const open = x => { if (/^INC/.test(x.id) || r.table === 'incident') act.openInc(x.id); else if (D.DEV[x.id]) act.drill({ t: 'device', id: x.id }); else if (D.CIR[x.id]) act.drill({ t: 'circuit', id: x.id }); else if (D.BR[x.id]) act.drill({ t: 'branch', id: x.id }); else if (x.site_id && D.BR[x.site_id]) act.drill({ t: 'branch', id: x.site_id }); };
  const saved = s.savedReports || [];
  const save = () => { const name = r.name && !PRESETS.some(p => p.name === r.name) ? r.name : `${t.label} by ${(t.cols.find(c => c[0] === r.by) || [, , r.by])[2].toLowerCase()}${r.f.length ? `, ${r.f.map(([c, v]) => v).join(', ')}` : ''}`; act.set(st => ({ savedReports: [...(st.savedReports || []).filter(x => x.name !== name), { ...r, name, t: Date.now() }] })); act.toast(`Saved "${name}"`); };
  const cols = t.cols.slice(0, 7);
  const csv = () => downloadFile(`srs-${r.table}-report.csv`, [t.cols.map(c => c[0]).join(','), ...rows.map(x => t.cols.map(([c]) => `"${String(x[c] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n'), 'text/csv');
  return (
    <div className="space-y-3">
      <Card title="Build a report" sub="From the console's live tables. Click a bar to go into that group, a row to open the record." right={<div className="flex gap-2"><Btn size="sm" icon={I.Save} onClick={save}>Save report</Btn><Btn size="sm" icon={I.FileDown} onClick={csv}>CSV ({num(rows.length)})</Btn></div>}>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-[12px] text-ink3">Start from</span>{PRESETS.map(p => <button key={p.name} onClick={() => setR(p)} className={cx('text-[12px] border rounded-md px-2 py-1', r.name === p.name ? 'border-ink bg-chip' : 'border-line hover:bg-chip')}>{p.name}</button>)}
          {saved.map(p => <span key={p.name} className="inline-flex items-center gap-1 text-[12px] border border-line rounded-md pl-2 pr-1 py-0.5 bg-chip/50"><button onClick={() => setR(p)} className="font-semibold text-ink hover:underline"><I.Bookmark size={11} className="inline -mt-0.5 mr-1" />{p.name}</button><button title="Delete" onClick={() => act.set(st => ({ savedReports: (st.savedReports || []).filter(x => x.name !== p.name) }))} className="text-ink3 hover:text-ink"><I.X size={12} /></button></span>)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select label="Source" value={r.table} onChange={v => set({ table: v, by: TABLE[v].cols.find(([c, ty]) => c !== 'id' && ty === 'text')[0], f: [], fc: null, name: null })} options={SOURCES.map(n => ({ value: n, label: TABLE[n].label }))} />
          <Select label="Group by" value={r.by} onChange={v => set({ by: v, name: null })} options={t.cols.filter(([c]) => c !== 'id').map(([c, , l]) => ({ value: c, label: l }))} />
          <span className="text-[12px] text-ink3 ml-2">Filter</span>
          <Select value={fCol} onChange={v => set({ fc: v })} options={textCols.map(([c, , l]) => ({ value: c, label: l }))} />
          <Select value="" onChange={v => v && set({ f: [...r.f.filter(([c]) => c !== fCol), [fCol, v]], name: null })} options={[{ value: '', label: 'is…' }, ...fVals.map(v => ({ value: v, label: fCol === 'site_id' ? brName(v) : v }))]} />
          {r.f.map(([c, v]) => <span key={c} className="inline-flex items-center gap-1 text-[12px] rounded-md bg-chip px-2 py-1"><span className="text-ink3">{(t.cols.find(x => x[0] === c) || [, , c])[2]}:</span><b className="text-ink">{c === 'site_id' ? brName(v) : v}</b><button onClick={() => set({ f: r.f.filter(x => x[0] !== c), name: null })} className="text-ink3 hover:text-ink"><I.X size={12} /></button></span>)}
        </div>
      </Card>
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-3">
        <Card title={`${t.label} by ${((t.cols.find(c => c[0] === r.by) || [, , r.by])[2]).toLowerCase()}`} sub={`${num(rows.length)} rows · ${groups.length} groups · click a bar to drill in`}>
          {groups.length ? <HBars rows={groups.slice(0, 15).map(([k, v]) => ({ label: r.by === 'site_id' ? brName(k) : k, value: v, k }))} labelW={190} fmt={v => num(v)} color={C.s1} onRow={x => set({ f: [...r.f.filter(([c]) => c !== r.by), [r.by, x.k]], name: null })} /> : <div className="text-[12.5px] text-ink3">No rows match.</div>}
          {groups.length > 15 && <div className="text-[11.5px] text-ink3 mt-2">and {groups.length - 15} smaller groups (all are in the CSV)</div>}
        </Card>
        <Card title="The rows" sub="Click a row to open it" pad={false}>
          <div className="overflow-x-auto max-h-[420px] overflow-y-auto"><table className="w-full text-[12px]"><thead className="sticky top-0 bg-panel"><tr className="border-b border-line text-left text-ink3">{cols.map(([c, , l]) => <th key={c} className="px-3 py-1.5 font-semibold whitespace-nowrap">{l}</th>)}</tr></thead>
            <tbody>{rows.slice(0, 100).map(x => <tr key={x.id} onClick={() => open(x)} className="border-b border-line/60 cursor-pointer hover:bg-chip/50">{cols.map(([c]) => <td key={c} className={cx('px-3 py-1.5 max-w-[240px] truncate', c === 'id' ? 'font-mono text-ink' : 'text-ink2')}>{show(c, x[c])}</td>)}</tr>)}</tbody></table></div>
          {rows.length > 100 && <div className="px-3 py-2 text-[11.5px] text-ink3 border-t border-line">First 100 of {num(rows.length)}; the CSV has them all.</div>}
        </Card>
      </div>
    </div>
  );
}

// a question box for any report: answers from live data, with links into the records
const ASK = { default: ['Which branches are down right now?', 'Show P1 and P2 incidents', 'Which lines are flapping?', 'Which changes are scheduled this week?'], critical: ['Show P1 and P2 incidents', 'What caused the last P2?', 'Which branches had repeat outages?'], lead: ['Which lines are flapping?', 'Devices with a critical vulnerability', 'Which switches are below firmware policy?'], ceo: ['Which branches are down right now?', 'How many stores were affected this week?'] };
export function AskReport({ tab }) {
  const { s, act } = useApp(); const { L } = useLive(); const now = useNow();
  const [q, setQ] = useState(''); const [log, setLog] = useState([]);
  const ask = text => { if (!text.trim()) return; setLog(l => [{ q: text, a: answer(s, text, now, L) }, ...l].slice(0, 4)); setQ(''); };
  return (
    <Card title="Ask about this report" sub="Answers come from live console data; click a row to drill in" icon={I.MessageSquareText}>
      <div className="flex flex-wrap gap-1.5 mb-2">{(ASK[tab] || ASK.default).map(x => <button key={x} onClick={() => ask(x)} className="text-[12px] border border-line rounded-md px-2 py-1 hover:bg-chip text-ink">{x}</button>)}</div>
      <form onSubmit={e => { e.preventDefault(); ask(q); }} className="flex gap-2 mb-2"><input value={q} onChange={e => setQ(e.target.value)} placeholder='e.g. "Why was Branch 214 slow this morning?"' className="flex-1 h-9 px-3 rounded-md border border-line bg-canvas text-ink text-[13px] outline-none focus:border-ink3" /><Btn kind="brand" icon={I.Send} type="submit">Ask</Btn></form>
      <div className="space-y-3">{log.map((x, k) => <div key={k} className="border border-line rounded-md p-3 text-[12.5px] space-y-2"><div className="text-ink3">{x.q}</div><b className="text-ink text-[13px] block">{x.a.title}</b>{x.a.lead && <p className="text-ink2">{x.a.lead}</p>}{(x.a.blocks || []).map((b, j) => <AskBlock key={j} k={b} maxRows={8} go={r => r.inc ? act.openInc(r.inc) : r.branch && act.drill({ t: 'branch', id: r.branch })} />)}</div>)}</div>
    </Card>
  );
}
