// The CMDB inside Device & Circuit Inventory (tables of every CI and operational record, and the CI explorer with
// relationships), and the window that says where the console's data is saved (this browser, or a free cloud
// Postgres database).
import React, { useMemo, useState } from 'react';
import * as I from 'lucide-react';
import * as D from './data.js';
import { useApp, saveInfo } from './store.jsx';
import { Card, Badge, Btn, Stat, Tabs, PageHead, SearchBox, Modal, cx } from './ui.jsx';
import { TABLES, TABLE, relsOf, schemaSQL } from './cmdb.js';
import { cloudCfg, saveCloudCfg, cloudTest, cloudUpsertRows, cloudCount, localSet, localGet, cloudWhy } from './db.js';
import { num, ago, downloadFile } from './util.js';

const CI_TABLES = ['cmdb_ci_site', 'cmdb_ci_netgear', 'cmdb_ci_circuit', 'cmdb_ci_onboarded'];
const fmt = (v, ty) => v == null || v === '' ? '—' : ty === 'timestamptz' ? new Date(v).toISOString().slice(0, 10) : String(v);
const toCSV = (t, rows) => [t.cols.map(c => c[0]).join(','), ...rows.map(r => t.cols.map(([c]) => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');

const useCmdbData = s => useMemo(() => Object.fromEntries(TABLES.map(t => [t.name, t.rows(s)])), [s.incidents, s.resolved, s.changes, s.problems, s.workOrders, s.cases, s.audit, s.invAdded, s.devState, s.circuitState]);
// the CMDB tab of the inventory
export function CmdbTab() {
  const { s } = useApp(); const data = useCmdbData(s);
  const [v, setV] = useState('tables'); const [ci, setCi] = useState(null);
  return (<>
    <Tabs size="sm" value={v} onChange={setV} className="mb-3" tabs={[{ id: 'tables', label: `Tables (${TABLES.length})` }, { id: 'explorer', label: 'CI explorer' }]} />
    {v === 'tables' ? <Tables data={data} openCi={id => { setCi(id); setV('explorer'); }} /> : <Explorer data={data} ci={ci} setCi={setCi} />}
  </>);
}
// a small indicator: the console saves itself; click for where and how
export function SavedChip() {
  const { s, act } = useApp();
  return <button onClick={() => act.set({ storageOpen: true })} title="Where the console's data is saved" className="h-8 px-2.5 rounded-md border border-line bg-panel hover:bg-chip text-[12px] text-ink2 inline-flex items-center gap-1.5"><I.CloudCheck size={14} className={s.db.status === 'error' ? 'text-bad' : 'text-ok'} />{s.db.status === 'error' ? 'Not saved to the cloud' : `Saved ${saveInfo.t ? ago(saveInfo.t) : 'automatically'}`} · {s.db.mode === 'cloud' ? 'cloud database' : 'this browser'}</button>;
}
// not shown anywhere on screen; an admin opens it by adding #data to the address (to connect the cloud database)
export function StorageModal() {
  const { s, act } = useApp();
  React.useEffect(() => { const f = () => { if (window.location.hash === '#data') act.set({ storageOpen: true }); }; f(); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
  if (!s.storageOpen) return null;
  return <Modal open onClose={() => act.set({ storageOpen: false })} title="Where the console's data is saved" sub="Everything you do is saved automatically and comes back after a refresh" wide><StorageBody /></Modal>;
}
function StorageBody() { const { s } = useApp(); const data = useCmdbData(s); return <Database data={data} />; }

function Tables({ data, openCi }) {
  const [sel, setSel] = useState('cmdb_ci_netgear');
  const [q, setQ] = useState(''); const [page, setPage] = useState(0);
  const t = TABLE[sel], all = data[sel];
  const rows = q.length > 1 ? all.filter(r => Object.values(r).some(v => String(v ?? '').toLowerCase().includes(q.toLowerCase()))) : all;
  const view = rows.slice(page * 25, page * 25 + 25), pages = Math.max(1, Math.ceil(rows.length / 25));
  const cols = t.cols.slice(0, 8);
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[250px_minmax(0,1fr)] gap-3">
      <Card pad={false}><div className="p-2">{['CMDB', 'Operations'].map(g => <div key={g} className="mb-2"><div className="text-[10.5px] font-bold uppercase text-ink3 px-2 py-1">{g}</div>
        {TABLES.filter(x => x.group === g).map(x => <button key={x.name} onClick={() => { setSel(x.name); setPage(0); setQ(''); }} className={cx('w-full text-left rounded-md px-2 py-1.5 flex items-center gap-2', sel === x.name ? 'bg-chip' : 'hover:bg-chip/60')}>
          <span className="min-w-0 flex-1"><b className="text-[12.5px] text-ink block truncate">{x.label}</b><code className="text-[10.5px] text-ink3">{x.name}</code></span><span className="text-[12px] tabular-nums text-ink2">{num(data[x.name].length)}</span></button>)}</div>)}</div></Card>
      <Card title={t.label} sub={`${t.name} · ${t.cols.length} columns · ${num(all.length)} rows`} pad={false} right={<div className="flex items-center gap-2"><SearchBox value={q} onChange={v => { setQ(v); setPage(0); }} placeholder="Search this table" className="w-56" /><Btn size="sm" icon={I.FileDown} onClick={() => downloadFile(`${t.name}.csv`, toCSV(t, rows), 'text/csv')}>CSV</Btn></div>}>
        <div className="overflow-x-auto"><table className="w-full text-[12px]"><thead><tr className="border-b border-line text-left text-ink3">{cols.map(([c, ty, l]) => <th key={c} className="px-3 py-1.5 font-semibold whitespace-nowrap">{l}<span className="block text-[10px] font-normal font-mono">{c} · {ty}</span></th>)}</tr></thead>
          <tbody>{view.map(r => <tr key={r.id} onClick={() => CI_TABLES.includes(sel) && openCi(r.id)} className={cx('border-b border-line/60 last:border-0', CI_TABLES.includes(sel) && 'cursor-pointer hover:bg-chip/50')}>{cols.map(([c, ty]) => <td key={c} className={cx('px-3 py-1.5 max-w-[260px] truncate', c === 'id' ? 'font-mono text-ink' : 'text-ink2')}>{c === 'site_id' && D.BR[r[c]] ? D.BR[r[c]].name : fmt(r[c], ty)}</td>)}</tr>)}</tbody></table></div>
        <div className="flex items-center gap-2 px-3 py-2 text-[12px] text-ink3 border-t border-line"><span className="flex-1">{num(rows.length)} rows{t.cols.length > cols.length ? ` · showing ${cols.length} of ${t.cols.length} columns (all are in the CSV)` : ''}</span><Btn size="xs" icon={I.ChevronLeft} disabled={page === 0} onClick={() => setPage(p => p - 1)} /><span>Page {page + 1} of {pages}</span><Btn size="xs" icon={I.ChevronRight} disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)} /></div>
      </Card>
    </div>
  );
}

function Explorer({ data, ci, setCi }) {
  const { s, act } = useApp();
  const [q, setQ] = useState('');
  const index = useMemo(() => CI_TABLES.flatMap(n => data[n].map(r => ({ id: r.id, name: r.name || r.id, cls: TABLE[n].cls, table: n, row: r }))), [data]);
  const byId = useMemo(() => Object.fromEntries(index.map(x => [x.id, x])), [index]);
  const hits = q.length > 1 ? index.filter(x => `${x.id} ${x.name}`.toLowerCase().includes(q.toLowerCase())).slice(0, 8) : [];
  const cur = byId[ci] || byId[D.HERO ? D.storeOf(D.HERO.failover).id : D.BRANCHES[0].id] || index[0];
  const r = relsOf(cur.id);
  const incs = data.incident.filter(i => i.ci === cur.id || i.site_id === cur.id || (cur.table !== 'cmdb_ci_site' && cur.row.site_id && i.ci === cur.id));
  const t = TABLE[cur.table];
  const Link = ({ id, type, dir }) => { const x = byId[id]; return <button onClick={() => setCi(id)} className="w-full text-left flex items-center gap-2 py-1 px-1.5 rounded hover:bg-chip/60 text-[12.5px]"><span className="text-[11px] text-ink3 w-28 shrink-0">{dir === 'up' ? `${type} this` : type}</span><span className="font-mono text-ink truncate">{x ? x.name : id}</span><span className="text-[11px] text-ink3 ml-auto shrink-0">{x ? x.cls : ''}</span></button>; };
  return (
    <div className="space-y-3">
      <div className="relative max-w-xl"><SearchBox value={q} onChange={setQ} placeholder="Find a CI: branch, host name, circuit, onboarded resource" className="w-full" />
        {hits.length > 0 && <div className="absolute z-20 top-10 left-0 right-0 bg-panel border border-line rounded-md shadow-xl py-1">{hits.map(h => <button key={h.id} onClick={() => { setCi(h.id); setQ(''); }} className="w-full text-left px-3 py-1.5 hover:bg-chip text-[12.5px] flex gap-2"><span className="font-mono text-ink">{h.name}</span><span className="text-ink3 ml-auto">{h.cls}</span></button>)}</div>}</div>
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
        <Card title={cur.name} sub={`${cur.cls} · ${t.name} · ${cur.id}`} right={cur.table === 'cmdb_ci_site' ? <Btn size="sm" icon={I.Store} onClick={() => act.openBranch(cur.id)}>Branch 360</Btn> : cur.table === 'cmdb_ci_netgear' ? <Btn size="sm" icon={I.Layers} onClick={() => act.drill({ t: 'device', id: cur.id })}>Drill down</Btn> : cur.table === 'cmdb_ci_circuit' ? <Btn size="sm" icon={I.Layers} onClick={() => act.drill({ t: 'circuit', id: cur.id })}>Drill down</Btn> : null}>
          <dl className="grid grid-cols-[150px_minmax(0,1fr)] gap-x-3 text-[12.5px]">{t.cols.map(([c, ty, l]) => <React.Fragment key={c}><dt className="text-ink3 py-1 border-b border-line/60">{l}</dt><dd className="text-ink py-1 border-b border-line/60 truncate">{c === 'site_id' && D.BR[cur.row[c]] ? <button className="hover:underline" onClick={() => setCi(cur.row[c])}>{D.BR[cur.row[c]].name}</button> : fmt(cur.row[c], ty)}</dd></React.Fragment>)}</dl>
        </Card>
        <div className="space-y-3">
          <Card title="Relationships" sub={`${r.up.length} upstream, ${r.down.length} downstream`}>
            {r.up.length > 0 && <div className="mb-2"><div className="text-[11px] font-bold uppercase text-ink3 mb-0.5">Upstream</div>{r.up.map(x => <Link key={x.id} id={x.parent} type={x.type} dir="up" />)}</div>}
            {r.down.length > 0 && <div><div className="text-[11px] font-bold uppercase text-ink3 mb-0.5">Downstream</div><div className="max-h-[260px] overflow-y-auto">{r.down.map(x => <Link key={x.id} id={x.child} type={x.type} />)}</div></div>}
            {!r.up.length && !r.down.length && <div className="text-[12.5px] text-ink3">No relationships recorded for this CI yet.{cur.table === 'cmdb_ci_onboarded' ? ' Resources added by onboarding get them once discovery maps their neighbours.' : ''}</div>}
          </Card>
          <Card title="Incidents on this CI" sub={`${incs.length} in the last 7 days`}>
            {incs.length ? incs.slice(0, 8).map(i => <button key={i.id} onClick={() => act.openInc(i.id)} className="w-full text-left flex gap-2 py-1 text-[12.5px] border-b border-line/60 last:border-0 hover:bg-chip/50"><span className="font-mono text-ink3">{i.id}</span><Badge tone={i.priority <= 'P2' ? 'red' : 'amber'}>{i.priority}</Badge><span className="text-ink truncate flex-1">{i.short_description}</span><span className="text-ink3">{i.state}</span></button>) : <div className="text-[12.5px] text-ink3">None.</div>}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Database({ data }) {
  const { s, act } = useApp();
  const c0 = cloudCfg();
  const [url, setUrl] = useState(c0 ? c0.url : ''), [key, setKey] = useState(c0 ? c0.key : '');
  const [busy, setBusy] = useState(null), [prog, setProg] = useState({}), [counts, setCounts] = useState({}), [snap, setSnap] = useState(null), [sql, setSql] = useState(false);
  const setDb = patch => act.set(st => ({ db: { ...st.db, ...patch } }));
  const connect = async () => {
    const c = { url: url.trim(), key: key.trim() }; if (!c.url || !c.key) { act.toast('Enter the project URL and the anon key', 'warn'); return; }
    setBusy('test');
    try { await cloudTest(c); saveCloudCfg(c); setDb({ mode: 'cloud', status: 'ok', url: c.url, msg: null }); act.audit('Connected the console to the cloud database (Supabase)', 'db'); act.toast('Connected to the cloud database'); }
    catch (e) { setDb({ status: 'error', msg: `Could not connect: ${cloudWhy(e.message)}.` }); act.toast(`Could not connect: ${cloudWhy(e.message)}`, 'bad'); }
    setBusy(null);
  };
  const disconnect = () => { saveCloudCfg(null); setDb({ mode: 'local', status: 'ok', msg: null }); act.toast('Disconnected: data is kept in this browser'); };
  const syncAll = async () => {
    const c = cloudCfg(); if (!c) return; setBusy('sync'); setProg({});
    try {
      for (const t of TABLES) { setProg(p => ({ ...p, [t.name]: 0 })); await cloudUpsertRows(c, t.name, data[t.name], n => setProg(p => ({ ...p, [t.name]: n }))); }
      const cs = {}; for (const t of TABLES) cs[t.name] = await cloudCount(c, t.name); setCounts(cs);
      setDb({ status: 'ok', last: Date.now() }); act.audit(`Synced ${TABLES.length} tables to the cloud database`, 'db'); act.toast('All tables synced to the cloud database');
    } catch (e) { setDb({ status: 'error', msg: cloudWhy(e.message) }); act.toast(`Sync stopped: ${cloudWhy(e.message)}`, 'bad'); }
    setBusy(null);
  };
  const saveLocal = async () => { setBusy('local'); for (const t of TABLES) await localSet(`table:${t.name}`, data[t.name]); const v = await localGet(`table:cmdb_ci_netgear`); setSnap({ t: Date.now(), n: (v || []).length }); setBusy(null); act.toast('Snapshot of every table saved in this browser'); };
  const total = TABLES.reduce((a, t) => a + data[t.name].length, 0);
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-3">
      <Card title="Where the data is stored" icon={I.HardDrive}>
        <div className="space-y-3 text-[12.5px]">
          <div className={cx('rounded-md border px-3 py-2', s.db.mode === 'local' ? 'border-ink' : 'border-line')}><b className="text-ink">This browser (IndexedDB)</b><p className="text-ink2">Always on. The whole console is saved here a moment after anything changes: onboarding, approvals, notes, work orders, changes, cases, settings and the page you were on. After a refresh it comes back; the live incident picture comes back if it was saved in the last 12 hours. Each browser keeps its own copy.</p>
            <div className="flex items-center gap-2 mt-1.5"><Btn size="sm" icon={I.Save} onClick={saveLocal} disabled={!!busy}>Save a snapshot of all {TABLES.length} tables</Btn>{snap && <span className="text-ink3">saved {ago(snap.t)}, {num(snap.n)} devices read back</span>}</div></div>
          <div className={cx('rounded-md border px-3 py-2', s.db.mode === 'cloud' ? 'border-ink' : 'border-line')}><b className="text-ink">Cloud database (Supabase, free tier)</b><p className="text-ink2">A hosted Postgres database everyone can share. Create a free project at supabase.com, run the schema SQL in its SQL editor, then paste the project URL and the anon key here. The console then saves itself there too, and the tables can be synced. The key stays in this browser.</p>
            <div className="grid grid-cols-1 gap-1.5 mt-1.5"><input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://your-project.supabase.co" className="h-8 px-2 rounded-md border border-line bg-canvas text-ink text-[12.5px]" /><input value={key} onChange={e => setKey(e.target.value)} placeholder="anon or publishable key" type="password" className="h-8 px-2 rounded-md border border-line bg-canvas text-ink text-[12.5px]" /></div>
            <div className="flex flex-wrap items-center gap-2 mt-2">{s.db.mode === 'cloud' ? <><Btn size="sm" kind="brand" icon={I.UploadCloud} onClick={syncAll} disabled={!!busy}>{busy === 'sync' ? 'Syncing…' : `Sync all ${TABLES.length} tables (${num(total)} rows)`}</Btn><Btn size="sm" icon={I.Unplug} onClick={disconnect}>Disconnect</Btn></> : <Btn size="sm" kind="brand" icon={I.PlugZap} onClick={connect} disabled={!!busy}>{busy === 'test' ? 'Testing…' : 'Test and connect'}</Btn>}
              {s.db.status === 'error' && <span className="text-bad">{s.db.msg}</span>}{s.db.mode === 'cloud' && s.db.status === 'ok' && <span className="text-ok inline-flex items-center gap-1"><I.CheckCircle2 size={13} />connected{s.db.last ? `, last sync ${ago(s.db.last)}` : ''}</span>}</div></div>
          <div><button onClick={() => setSql(v => !v)} className="text-[12.5px] font-semibold text-ink hover:underline">{sql ? 'Hide' : 'Show'} the schema SQL ({TABLES.length} tables)</button>
            {sql && <><pre className="mt-1.5 max-h-[260px] overflow-auto text-[11px] bg-chip/60 border border-line rounded-md p-2 text-ink">{schemaSQL()}</pre><div className="flex gap-2 mt-1.5"><Btn size="xs" icon={I.Copy} onClick={() => { try { navigator.clipboard.writeText(schemaSQL()); act.toast('Schema SQL copied'); } catch { act.toast('Copy is blocked here: download it instead', 'warn'); } }}>Copy</Btn><Btn size="xs" icon={I.FileDown} onClick={() => downloadFile('srs-hub-schema.sql', schemaSQL(), 'text/plain')}>Download .sql</Btn></div></>}</div>
          <p className="text-[11.5px] text-ink3">The schema's demo policy lets anyone with the anon key read and write. Use it for the demo only, not for real SRS data.</p>
        </div>
      </Card>
      <Card title="Tables" sub={`${TABLES.length} tables, ${num(total)} rows in the console now`} pad={false} right={<Btn size="sm" icon={I.FileJson} onClick={() => downloadFile('srs-hub-database.json', JSON.stringify(Object.fromEntries(TABLES.map(t => [t.name, data[t.name]]))), 'application/json')}>Download all as JSON</Btn>}>
        <table className="w-full text-[12.5px]"><thead><tr className="border-b border-line text-left text-ink3 text-[11.5px]"><th className="px-3 py-1.5 font-semibold">Table</th><th className="px-3 py-1.5 font-semibold text-right">Rows here</th><th className="px-3 py-1.5 font-semibold text-right">In the cloud</th><th className="px-3 py-1.5 font-semibold">Sync</th></tr></thead>
          <tbody>{TABLES.map(t => { const n = data[t.name].length, p = prog[t.name]; return <tr key={t.name} className="border-b border-line/60 last:border-0"><td className="px-3 py-1.5"><b className="text-ink">{t.label}</b><code className="block text-[10.5px] text-ink3">{t.name}</code></td><td className="px-3 py-1.5 text-right tabular-nums">{num(n)}</td><td className="px-3 py-1.5 text-right tabular-nums">{counts[t.name] != null ? num(counts[t.name]) : '—'}</td>
            <td className="px-3 py-1.5 w-40">{p != null ? <div className="h-1.5 bg-chip rounded"><div className="h-1.5 bg-ok rounded" style={{ width: `${n ? p / n * 100 : 100}%` }} /></div> : <span className="text-ink3 text-[11.5px]">{s.db.mode === 'cloud' ? 'not synced yet' : 'browser only'}</span>}</td></tr>; })}</tbody></table>
      </Card>
    </div>
  );
}
