import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as I from 'lucide-react';
import { useApp, useNow, ROLES, healthOf, circuitOf, branchClock, filteredBranches, cityKey } from './store.jsx';
import * as D from './data.js';
import { DEMOS as SCENARIOS } from './demos.js';
import { DemoStage } from './stage.jsx';
import { DEMOS } from './demos.js';
import { LiveDemos } from './mod_demos.jsx';
import { Branch360 } from './mod_b360.jsx';
import { Vulns } from './mod_vuln.jsx';
import { CANNED, answer } from './ask.js';
import { Btn, Badge, Dot, Modal, Select, SearchBox, cx, Logo, healthTone, KV, Pri, Card } from './ui.jsx';
import LOGOS from './logos.js';
import { hhmmss, hhmm, ago, dt, num, MIN } from './util.js';
import { Overview, Readiness } from './mod_ops.jsx';
import { Incidents } from './mod_incidents.jsx';
import { NetGraph } from './mod_graph.jsx';
import { Inventory, Carriers, Dispatch } from './mod_assets.jsx';
import { Changes } from './mod_changes.jsx';
import { BiaB } from './mod_biab.jsx';
import { Predictive, Knowledge, Automation, SLATracker, Reports } from './mod_more.jsx';
import { LiveOps, Correlation, Agents } from './mod_live.jsx';

export const MODULES = [
  { id: 'overview', label: 'Operations Overview', icon: I.LayoutDashboard, group: 'Operate', C: Overview },
  { id: 'live', label: 'Live Operations', icon: I.Radio, group: 'Operate', C: LiveOps },
  { id: 'correlation', label: 'Correlation', icon: I.GitMerge, group: 'Operate', C: Correlation },
  { id: 'b360', label: 'Branch 360', icon: I.Store, group: 'Operate', C: Branch360 },
  { id: 'readiness', label: 'Branch Readiness', icon: I.Sunrise, group: 'Operate', C: Readiness },
  { id: 'incidents', label: 'Live Incidents', icon: I.Siren, group: 'Operate', C: Incidents, badge: s => s.incidents.filter(i => i.state !== 'Resolved').length },
  { id: 'graph', label: 'Network Graph', icon: I.Network, group: 'Operate', C: NetGraph },
  { id: 'inventory', label: 'Device & Circuit Inventory', icon: I.Boxes, group: 'Manage', C: Inventory },
  { id: 'vuln', label: 'Lifecycle & Vulnerabilities', icon: I.ShieldAlert, group: 'Manage', C: Vulns, badge: () => D.DEVICES.filter(d => D.vulnsOf(d).some(a => a.sev === 'Critical')).length, alertBadge: true },
  { id: 'carriers', label: 'Carrier Management', icon: I.RadioTower, group: 'Manage', C: Carriers, badge: s => s.cases.filter(c => !c.closed).length },
  { id: 'dispatch', label: 'Field Dispatch', icon: I.Truck, group: 'Manage', C: Dispatch, badge: s => s.workOrders.filter(w => !w.tech).length, alertBadge: true },
  { id: 'changes', label: 'Approvals & Changes', icon: I.GitPullRequest, group: 'Manage', C: Changes, badge: s => s.approvals.filter(a => a.status === 'Pending').length, alertBadge: true },
  { id: 'biab', label: 'Branch-in-a-Box', icon: I.PackageCheck, group: 'Grow', C: BiaB },
  { id: 'predict', label: 'Predictive Watchlist', icon: I.TrendingUp, group: 'Improve', C: Predictive },
  { id: 'knowledge', label: 'Knowledge', icon: I.BookOpen, group: 'Improve', C: Knowledge },
  { id: 'agents', label: 'Mova iO Agents', icon: I.Bot, group: 'Improve', C: Agents },
  { id: 'automation', label: 'Automation Library', icon: I.Workflow, group: 'Improve', C: Automation },
  { id: 'sla', label: 'SLA & KPI Tracker', icon: I.Gauge, group: 'Govern', C: SLATracker },
  { id: 'reports', label: 'Reports', icon: I.FileText, group: 'Govern', C: Reports },
  { id: 'demos', label: 'Live Demos', icon: I.PlayCircle, group: 'Demos', C: LiveDemos, badge: () => DEMOS.length },
];

export function RoofMark({ size = 40, dark = false }) {
  const ink = dark ? '#ffffff' : 'rgb(var(--ink))';
  return (
    <svg width={size} height={size * 0.8} viewBox="0 0 45 36" aria-label="SRS roof mark">
      <path d="M2.5 19 L22.5 4.5 L42.5 19" fill="none" stroke="#762123" strokeWidth="4.6" strokeLinejoin="miter" strokeMiterlimit="10" />
      <path d="M22.5 4.5 L42.5 19" fill="none" stroke={ink} strokeWidth="4.6" />
      <path d="M9.5 21 V33.5 H35.5 V21" fill="none" stroke={ink} strokeWidth="2.4" />
      <path d="M18.5 33.5 V26 H26.5 V33.5" fill="none" stroke="#762123" strokeWidth="2.4" />
    </svg>
  );
}

function Header() {
  const { s, act } = useApp();
  const now = useNow();
  const pendingNotif = s.approvals.filter(a => a.status === 'Pending').length;
  const hb = 'h-8 rounded-[4px] border border-line text-ink hover:bg-chip';
  return (
    <header className="h-[60px] bg-head text-ink flex items-center pl-4 pr-3 gap-3 sticky top-0 z-40 border-b border-line shadow-[0_1px_3px_rgba(16,24,40,0.06)]">
      <div className="flex items-center gap-3 min-w-0 w-[220px] shrink-0">
        <RoofMark />
        <div className="leading-none min-w-0">
          <div className="font-display text-[22px] font-bold tracking-[0.02em] text-ink">SRS</div>
          <div className="text-[10.5px] text-ink2 mt-0.5 whitespace-nowrap uppercase tracking-[0.12em]">Distribution</div>
        </div>
      </div>
      <div className="leading-tight min-w-0 border-l border-line pl-4">
        <div className="font-display text-[19px] font-semibold text-ink whitespace-nowrap">Network Intelligence Hub</div>
      </div>
      <div className="flex-1" />
      <div className="hidden 2xl:flex items-center gap-3 text-[11.5px] text-ink3 mr-1">
        {[['opsramp', 1], ['central', 2], ['servicenow', 1], ['movaio', 0]].map(([k, sec]) => <span key={k} className="inline-flex items-center gap-1.5"><span className="bg-white rounded-[3px] px-1 py-[2px] inline-flex border border-line"><img src={LOGOS[k]} alt={k} style={{ height: 11 }} /></span><span className="w-1.5 h-1.5 rounded-full bg-ok" />{(Math.floor(now / 1000) + sec) % 7 + 1}s</span>)}
      </div>
      <button onClick={() => act.go('demos')} className={hb + ' px-2.5 text-[13px] font-semibold inline-flex items-center gap-1.5'}><I.PlayCircle size={15} />Live demos</button>
      <button onClick={() => act.set({ askOpen: !s.askOpen })} className="h-8 rounded-[4px] px-3 text-[13px] font-semibold inline-flex items-center gap-1.5 bg-brand hover:brightness-110 text-white"><I.Sparkles size={15} />Ask Mova iO</button>
      <label className={hb + ' relative inline-flex items-center pl-2 pr-7 gap-1.5 text-[13px]'}>
        <I.UserRound size={14} className="text-ink3" />
        <select value={s.role} onChange={e => { const v = e.target.value; const r = ROLES.find(x => x.id === v); act.set(st => ({ role: v, module: r.home, selInc: null, askLog: [], tab: r.tab ? { ...st.tab, changes: r.tab } : st.tab, filters: { region: 'All', city: 'All', brand: 'All', branchId: null } })); act.toast(`Viewing as ${r.name} (${r.who})`, 'info'); }} className="bg-transparent outline-none appearance-none font-semibold cursor-pointer">
          {ROLES.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <I.ChevronDown size={14} className="absolute right-2 text-ink3 pointer-events-none" />
      </label>
      <button onClick={() => act.set({ notifOpen: !s.notifOpen })} className={hb + ' relative w-8 flex items-center justify-center'} title="Notifications">
        <I.Bell size={16} />{pendingNotif > 0 && <span className="absolute -top-1.5 -right-1.5 bg-bad text-white text-[10px] font-bold rounded-full min-w-4 h-4 px-1 flex items-center justify-center">{pendingNotif}</span>}
      </button>
      <button onClick={() => act.set({ theme: s.theme === 'dark' ? 'light' : 'dark' })} className={hb + ' w-8 flex items-center justify-center'} title="Toggle light / dark">{s.theme === 'dark' ? <I.Sun size={16} /> : <I.Moon size={16} />}</button>
      <div className="flex items-baseline gap-1.5 px-1 font-mono text-[14px] text-ink tabular"><span className="self-center w-1.5 h-1.5 rounded-full bg-ok animate-pulse" />{hhmmss(now)}<span className="text-[10.5px] text-ink3">CT</span></div>
    </header>
  );
}

function Sidebar() {
  const { s, act } = useApp();
  const [collapsed, setCollapsed] = useState(false);
  const groups = [...new Set(MODULES.map(m => m.group))];
  const role = ROLES.find(r => r.id === s.role);
  return (
    <nav className={cx('bg-side text-white/80 flex flex-col shrink-0 sticky top-[60px] h-[calc(100vh-60px)] overflow-y-auto', collapsed ? 'w-14' : 'w-[236px]')}>
      {!collapsed && <div className="px-4 pt-4 pb-2"><div className="text-[10.5px] text-white/45 font-bold">Signed in as</div><div className="text-[13px] text-white font-semibold">{role.who}</div><div className="text-[11.5px] text-white/60">{role.name}</div></div>}
      {groups.map(g => (
        <div key={g} className="mt-2">
          {!collapsed && <div className="px-4 py-1.5 text-[10.5px] text-white/45 font-bold">{g}</div>}
          {MODULES.filter(m => m.group === g).map(m => {
            const on = s.module === m.id; const b = m.badge ? m.badge(s) : 0;
            return (
              <button key={m.id} onClick={() => act.go(m.id)} title={m.label} className={cx('w-full flex items-center gap-2.5 px-4 h-9 text-[13px] text-left relative', on ? 'bg-white/10 text-white font-semibold' : 'hover:bg-white/5 hover:text-white')}>
                {on && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] bg-[#b23a3f] rounded-r" />}
                <m.icon size={16} className="shrink-0" />{!collapsed && <span className="flex-1 truncate">{m.label}</span>}
                {!collapsed && b > 0 && <span className={cx('text-[10.5px] font-bold rounded px-1.5', m.alertBadge ? 'bg-brand text-white' : 'bg-white/15 text-white')}>{b}</span>}
                {m.id === 'biab' && !collapsed && <span className="text-[9.5px] font-bold bg-brand text-white rounded px-1">FLAGSHIP</span>}
              </button>
            );
          })}
        </div>
      ))}
      <div className="flex-1" />
      {!collapsed && <div className="px-4 py-3 border-t border-white/10 text-[11px] text-white/50 space-y-1.5">
        <div className="flex items-center gap-1.5 flex-wrap">Tools: <Logo k="opsramp" h={11} /><Logo k="central" h={11} /><Logo k="servicenow" h={9} /><Logo k="movaio" h={11} /></div>
        
      </div>}
      <button onClick={() => setCollapsed(c => !c)} className="h-9 border-t border-white/10 text-white/50 hover:text-white flex items-center justify-center gap-2 text-[12px]">{collapsed ? <I.PanelLeftOpen size={15} /> : <><I.PanelLeftClose size={15} />Collapse</>}</button>
    </nav>
  );
}

function FilterBar() {
  const { s, act } = useApp();
  const [q, setQ] = useState('');
  const list = filteredBranches(s);
  const counts = { up: 0, degraded: 0, down: 0 }; list.forEach(b => counts[healthOf(s, b)]++);
  const openInc = s.incidents.filter(i => i.state !== 'Resolved' && list.some(b => b.id === i.branchId)).length;
  const matches = q.length > 1 ? D.BRANCHES.filter(b => `${b.name} ${b.brand} ${b.city} ${b.state} ${b.id}`.toLowerCase().includes(q.toLowerCase())).slice(0, 8) : [];
  const f = s.filters;
  const setF = p => act.set(st => ({ filters: { ...st.filters, ...p } }));
  const bm = s.role === 'bm';
  const inRegion = D.BRANCHES.filter(b => (f.region === 'All' || b.region === f.region) && (f.brand === 'All' || b.brand === f.brand));
  const cityCounts = {}; inRegion.forEach(b => { const k = cityKey(b); cityCounts[k] = (cityCounts[k] || 0) + 1; });
  const cities = Object.keys(cityCounts).sort();
  const inCity = inRegion.filter(b => !f.city || f.city === 'All' || cityKey(b) === f.city);
  const pickBranch = id => { if (!id) { setF({ branchId: null }); return; } const b = D.BR[id]; setF({ branchId: id, city: cityKey(b) }); if (s.module === 'overview' || s.module === 'b360') act.set({ module: 'b360', b360: id }); };
  return (
    <div className="bg-panel border-b border-line px-5 py-2 flex items-center gap-1.5 flex-wrap">
      <span className="text-[12px] font-bold text-ink3 mr-1">Showing</span>
      {bm ? <Badge tone="brand" className="!text-[12px] !py-1"><I.Store size={13} />My branch: {D.BR[s.bmBranch].name}, {D.BR[s.bmBranch].brand}</Badge> : <>
        <button onClick={() => setF({ region: 'All', city: 'All', brand: 'All', branchId: null })} className={cx('h-8 px-3 rounded-md text-[13px] font-bold inline-flex items-center gap-1.5 border', f.region === 'All' && (!f.city || f.city === 'All') && !f.branchId && f.brand === 'All' ? 'bg-brand text-white border-brand' : 'bg-panel text-ink border-line hover:bg-chip')}><I.Globe2 size={14} />Overall</button>
        <I.ChevronRight size={14} className="text-ink3" />
        <Select icon={I.MapPin} value={f.region} onChange={v => setF({ region: v, city: 'All', branchId: null })} options={[{ value: 'All', label: 'Region: all' }, ...D.REGIONS.map(r => ({ value: r, label: `${r} (${D.BRANCHES.filter(b => b.region === r).length})` }))]} />
        <I.ChevronRight size={14} className="text-ink3" />
        <Select icon={I.Building2} value={f.city || 'All'} onChange={v => setF({ city: v, branchId: null })} options={[{ value: 'All', label: `City: all (${cities.length})` }, ...cities.map(c => ({ value: c, label: `${c} (${cityCounts[c]})` }))]} />
        <I.ChevronRight size={14} className="text-ink3" />
        <Select icon={I.Store} value={f.branchId || ''} onChange={pickBranch} options={[{ value: '', label: `Branch: any (${inCity.length})` }, ...inCity.map(b => ({ value: b.id, label: `${b.name}, ${b.brand}` }))]} />
        <Select icon={I.Tag} value={f.brand} onChange={v => setF({ brand: v, city: 'All', branchId: null })} options={[{ value: 'All', label: 'Brand: all' }, ...D.BRANDS.map(b => ({ value: b, label: b }))]} />
        <div className="relative">
          <SearchBox value={q} onChange={setQ} placeholder="Find a branch" className="w-44" />
          {matches.length > 0 && (
            <div className="absolute top-9 left-0 w-80 bg-panel border border-line rounded-md shadow-xl z-50 py-1">
              {matches.map(b => <button key={b.id} onClick={() => { act.set(st => ({ filters: { region: 'All', city: cityKey(b), brand: 'All', branchId: b.id } })); act.openBranch(b.id); setQ(''); }} className="w-full text-left px-3 py-1.5 hover:bg-chip text-[12.5px] flex items-center gap-2"><Dot tone={healthTone(healthOf(s, b))} /><span className="font-semibold text-ink">{b.name}</span><span className="text-ink3 truncate">{b.brand}, {b.state}</span><span className="ml-auto text-ink3 text-[11px]">{b.id}</span></button>)}
            </div>
          )}
        </div>
      </>}
      <div className="flex-1" />
      <div className="flex items-center gap-3 text-[12.5px] text-ink2">
        <span className="font-bold text-ink">{f.branchId ? D.BR[f.branchId].name : f.city && f.city !== 'All' ? f.city : f.region !== 'All' ? f.region : 'All branches'}</span>
        <span>{num(list.length)} branches</span>
        <span className="flex items-center gap-1"><Dot tone="green" />{num(counts.up)}</span>
        <span className="flex items-center gap-1"><Dot tone="amber" />{counts.degraded}</span>
        <span className="flex items-center gap-1"><Dot tone="red" />{counts.down}</span>
        <span><b className="text-ink">{openInc}</b> open incidents</span>
      </div>
    </div>
  );
}

function AskPanel() {
  const { s, act } = useApp();
  const now = useNow();
  const [q, setQ] = useState('');
  const endRef = useRef(null);
  useEffect(() => { endRef.current && endRef.current.scrollIntoView({ behavior: 'smooth' }); }, [s.askLog.length]);
  if (!s.askOpen) return null;
  const ask = text => { if (!text.trim()) return; const a = answer(s, text, Date.now()); act.set(st => ({ askLog: [...st.askLog, { q: text, a, t: Date.now() }] })); setQ(''); };
  const role = ROLES.find(r => r.id === s.role);
  return (
    <aside className="fixed right-0 top-16 bottom-0 w-[440px] max-w-full bg-panel border-l border-line shadow-2xl z-50 flex flex-col">
      <div className="px-4 py-3 border-b border-line flex items-center gap-2">
        <Logo k="movaio" h={16} /><div className="flex-1"><div className="font-bold text-ink text-[14px]">Ask Mova iO</div><div className="text-[11.5px] text-ink3">Answers come from live console data, as {role.name}</div></div>
        <Btn size="sm" kind="ghost" icon={I.X} onClick={() => act.set({ askOpen: false })} />
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="text-[12px] text-ink3 font-semibold">Suggested for {role.name}</div>
        <div className="flex flex-wrap gap-1.5">{CANNED[s.role].map(c => <button key={c} onClick={() => ask(c)} className="text-[12px] text-left border border-line rounded-full px-2.5 py-1 hover:bg-chip text-ink">{c}</button>)}</div>
        {s.askLog.map((x, i) => (
          <div key={i} className="space-y-2">
            <div className="flex justify-end"><div className="bg-ink text-canvas rounded-md rounded-br-sm px-3 py-1.5 text-[13px] max-w-[85%]">{x.q}</div></div>
            <div className="bg-chip border border-line rounded-md rounded-bl-sm p-3 text-[12.5px]">
              <div className="font-bold text-ink mb-1.5">{x.a.title}</div>
              <div className="space-y-1">{x.a.lines.map((l, j) => typeof l === 'string' ? <p key={j} className="text-ink2">{l}</p> : (
                <div key={j} className="flex gap-2"><span className={cx('font-semibold shrink-0', l.inc || l.branch ? 'text-info cursor-pointer hover:underline' : 'text-ink')} onClick={() => { if (l.inc) act.openInc(l.inc); if (l.branch) act.openBranch(l.branch); }}>{l.k}</span><span className="text-ink2">{l.v}</span></div>))}</div>
              {x.a.src && <div className="mt-2 text-[11px] text-ink3 flex items-center gap-1"><I.Database size={11} />Grounded in: {x.a.src}, {hhmm(x.t)} CT</div>}
              {x.a.links.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{x.a.links.map(l => <Btn key={l.label} size="xs" icon={I.ArrowRight} onClick={() => act.set(st => ({ module: l.module, selInc: null, ...l.extra, tab: { ...st.tab, ...(l.extra.tab || {}) }, filters: l.extra.filters || st.filters }))}>{l.label}</Btn>)}</div>}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form onSubmit={e => { e.preventDefault(); ask(q); }} className="p-3 border-t border-line flex gap-2">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder='e.g. "Is Tampa #2 ready to open?"' className="flex-1 h-9 px-3 rounded-md border border-line bg-canvas text-ink text-[13px] outline-none focus:border-ink3" />
        <Btn kind="brand" icon={I.Send} type="submit">Ask</Btn>
      </form>
    </aside>
  );
}

const SC_ICONS = { Activity: I.Activity, Zap: I.Zap, Server: I.Server, CloudLightning: I.CloudLightning, Package: I.Package, PauseCircle: I.PauseCircle, Shuffle: I.Shuffle, RadioTower: I.RadioTower, ShieldAlert: I.ShieldAlert, Wifi: I.Wifi, ScanLine: I.ScanLine, Repeat: I.Repeat, GitCompare: I.GitCompare, Network: I.Network, Bug: I.Bug, CalendarClock: I.CalendarClock, BatteryWarning: I.BatteryWarning, TrendingUp: I.TrendingUp, Sunrise: I.Sunrise, Unplug: I.Unplug, Cable: I.Cable, RefreshCw: I.RefreshCw, DatabaseBackup: I.DatabaseBackup, Plug: I.Plug, TrendingDown: I.TrendingDown, MoonStar: I.MoonStar };
function ScenarioPicker() {
  const { s, act } = useApp();
  return (
    <Modal open={!!s.scenarioPicker} onClose={() => act.set({ scenarioPicker: false })} title="Scripted scenarios" sub="Each one replays a realistic event sequence into the live console. Timestamps are anchored so the last step lands at the current time." wide>
      <div className="grid md:grid-cols-2 gap-3">
        {SCENARIOS.map(sc => { const Ic = SC_ICONS[sc.icon] || I.Play; return (
          <button key={sc.id} onClick={() => { act.set({ scenarioPicker: false, scenario: { id: sc.id, run: Date.now() } }); }} className="text-left border border-line rounded-md p-3.5 hover:border-brand hover:bg-chip/60 flex gap-3">
            <span className="w-9 h-9 rounded-md bg-brand/10 text-brand dark:text-[#e8a3a5] flex items-center justify-center shrink-0"><Ic size={18} /></span>
            <span><span className="block font-bold text-ink text-[14px]">{sc.title}</span><span className="block text-[12.5px] text-ink2 mt-0.5">{sc.sub}</span><span className="block text-[11px] text-ink3 mt-1">{sc.steps.length} steps, {Math.round(sc.span / 60)} min of events</span></span>
          </button>); })}
      </div>
    </Modal>
  );
}

function Toasts() {
  const { s } = useApp();
  return (
    <div className="fixed bottom-4 left-[252px] z-[90] flex flex-col gap-2 items-start pointer-events-none">
      {s.toasts.map(t => <div key={t.id} className={cx('pointer-events-auto px-3.5 py-2 rounded-md shadow-xl text-[13px] font-semibold flex items-center gap-2 border', t.tone === 'bad' ? 'bg-bad text-white border-bad' : t.tone === 'warn' ? 'bg-warn text-white border-warn' : t.tone === 'info' ? 'bg-ink text-canvas border-ink' : 'bg-ok text-white border-ok')}>{t.tone === 'bad' ? <I.XCircle size={15} /> : t.tone === 'warn' ? <I.AlertTriangle size={15} /> : <I.CheckCircle2 size={15} />}{t.msg}</div>)}
    </div>
  );
}

function Notifications() {
  const { s, act } = useApp();
  if (!s.notifOpen) return null;
  const items = [
    ...s.approvals.filter(a => a.status === 'Pending').map(a => ({ t: a.created, icon: I.ShieldAlert, text: `Approval needed: ${a.title}`, go: () => act.set(st => ({ module: 'changes', tab: { ...st.tab, changes: 'approvals' }, notifOpen: false })) })),
    ...s.incidents.filter(i => i.state !== 'Resolved' && (i.pri === 'P1' || i.pri === 'P2')).map(i => ({ t: i.opened, icon: I.Siren, text: `${i.pri} ${i.id}: ${i.title}`, go: () => { act.openInc(i.id); act.set({ notifOpen: false }); } })),
  ].sort((a, b) => b.t - a.t);
  return (
    <div className="fixed right-4 top-16 mt-1 w-[380px] bg-panel border border-line rounded-md shadow-2xl z-[55]">
      <div className="px-3 py-2 border-b border-line flex items-center"><span className="font-bold text-ink text-[13px] flex-1">Notifications</span><Btn size="xs" kind="ghost" icon={I.X} onClick={() => act.set({ notifOpen: false })} /></div>
      <div className="max-h-[420px] overflow-y-auto">{items.map((n, k) => <button key={k} onClick={n.go} className="w-full text-left px-3 py-2 border-b border-line/60 hover:bg-chip flex gap-2 text-[12.5px]"><n.icon size={15} className="text-ink2 mt-0.5 shrink-0" /><span className="flex-1 text-ink">{n.text}</span><span className="text-ink3 text-[11px] whitespace-nowrap">{ago(n.t)}</span></button>)}{!items.length && <div className="p-4 text-ink3 text-[12.5px]">All clear.</div>}</div>
    </div>
  );
}

export function BranchDrawer() {
  const { s, act } = useApp();
  const now = useNow();
  const b = s.selBranch && D.BR[s.selBranch];
  if (!b) return null;
  const clk = branchClock(b, now);
  const h = healthOf(s, b);
  const incs = s.incidents.filter(i => i.branchId === b.id && i.state !== 'Resolved');
  const devs = D.devicesOf(b.id);
  const close = () => act.set({ selBranch: null });
  return (
    <Modal open onClose={close} title={<span className="flex items-center gap-2"><Dot tone={healthTone(h)} />{b.name}, {b.brand}</span>} sub={`${b.id}, ${b.city}, ${b.state}, ${b.region}, ${b.segment}, ${clk.local} (${clk.open ? 'open' : 'closed'})`} wide
      footer={<><Btn icon={I.Sunrise} onClick={() => { close(); act.set(st => ({ module: 'readiness', filters: { region: 'All', city: 'All', brand: 'All', branchId: b.id } })); }}>Readiness checks</Btn><Btn icon={I.Network} onClick={() => { close(); act.set({ module: 'graph', graphBranch: b.id }); }}>Show in network graph</Btn><Btn icon={I.Boxes} onClick={() => { close(); act.set(st => ({ module: 'inventory', filters: { region: 'All', city: 'All', brand: 'All', branchId: b.id } })); }}>Devices</Btn><div className="flex-1" /><Btn kind="brand" icon={I.Filter} onClick={() => { close(); act.set({ filters: { region: 'All', city: 'All', brand: 'All', branchId: b.id } }); }}>Filter console to this branch</Btn></>}>
      <div className="grid md:grid-cols-3 gap-4">
        <div>
          <div className="text-[12px] font-bold text-ink3 mb-1">Branch</div>
          <KV k="Hours" v={`${b.hours.open}–${b.hours.close}${b.hours.sat ? `, Sat ${b.hours.sat}` : ''}`} />
          <KV k="Size profile" v={{ S: 'Small', M: 'Medium', L: 'Large' }[b.size]} />
          <KV k="Yard" v={b.yard ? 'Yes – outdoor APs' : 'No'} />
          <KV k="Health score" v={`${h === 'up' ? b.score : h === 'degraded' ? 78 : 30}/100`} />
        </div>
        <div>
          <div className="text-[12px] font-bold text-ink3 mb-1">WAN</div>
          {b.wan.map(id => { const c = circuitOf(s, id); return <div key={id} className="border border-line rounded-md p-2 mb-2 text-[12px]"><div className="flex items-center gap-1.5 font-semibold text-ink"><Dot tone={c.status === 'Up' ? 'green' : c.status === 'Degraded' ? 'amber' : 'red'} />{c.role}: {c.carrier} {c.type} {c.bw} Mb/s</div><div className="text-ink3 font-mono text-[11px] mt-0.5">{c.cid}</div><div className="text-ink2 mt-0.5">{c.lat} ms, jitter {c.jit} ms, loss {c.loss}%</div></div>; })}
        </div>
        <div>
          <div className="text-[12px] font-bold text-ink3 mb-1">Devices ({devs.length})</div>
          <KV k="EdgeConnect EC-XS" v={b.dev.ec} /><KV k="Switches" v={b.dev.sw} /><KV k="Access points" v={`${b.dev.ap} (${b.dev.apOut} outdoor)`} />
          <div className="text-[12px] font-bold text-ink3 mt-3 mb-1">Open incidents</div>
          {incs.length ? incs.map(i => <button key={i.id} onClick={() => { close(); act.openInc(i.id); }} className="w-full text-left text-[12px] flex gap-1.5 py-1 hover:underline"><Pri p={i.pri} /><span className="text-ink">{i.title}</span></button>) : <div className="text-[12px] text-ink3">None</div>}
        </div>
      </div>
    </Modal>
  );
}

export default function App() {
  const { s } = useApp();
  const M = MODULES.find(m => m.id === s.module) || MODULES[0];
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <Header />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 min-w-0">
          <div className="sticky top-[60px] z-30"><FilterBar /></div>
          <div className="p-5 max-w-[1680px]"><M.C key={M.id} /></div>
        </main>
      </div>
      <AskPanel /><ScenarioPicker /><DemoStage /><Toasts /><Notifications /><BranchDrawer />
    </div>
  );
}
