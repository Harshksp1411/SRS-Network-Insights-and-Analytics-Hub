import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import * as I from 'lucide-react';
import { useApp, useNow, ROLES, healthOf, circuitOf, branchClock, filteredBranches, cityKey, isMovate, roleOf, SRS_LOCK } from './store.jsx';
import { EscalateDialog, EscalateButton, aboutOf } from './escalate.jsx';
import * as D from './data.js';
import { DemoStage } from './stage.jsx';
import { useLive } from './live.jsx';
import { LiveDemos } from './mod_demos.jsx';
import { DEMOS_ONLY, APP_NAME, OPSRAMP } from './edition.js';
import { Branch360 } from './mod_b360.jsx';
import { Vulns } from './mod_vuln.jsx';
import { CANNED, STORY, MORE, answer } from './ask.js';
import { AskBlock } from './askblocks.jsx';
import { Catalogue, CatalogueTab } from './catalogue.jsx';
import { Policies } from './mod_policies.jsx';
import { OpsAI, IntegrationsPage, CopilotPage } from './mod_opsai.jsx';
import { DrillPanel } from './dash/Drill.jsx';
import { Btn, Badge, Dot, Modal, Select, SearchBox, cx, Logo, healthTone, KV, Pri, Card, RoofMark, OpsCtx, HeadCtx } from './ui.jsx';
export { RoofMark };
import LOGOS from './logos.js';
import { hhmmss, hhmm, ago, dt, num, MIN } from './util.js';
import { Overview, Readiness } from './mod_ops.jsx';
import { Incidents } from './mod_incidents.jsx';
import { Inventory, Carriers, Dispatch } from './mod_assets.jsx';
import { StorageModal } from './mod_cmdb.jsx';
import { Changes } from './mod_changes.jsx';
import { BiaB } from './mod_biab.jsx';
import { Predictive, Knowledge, Automation, SLATracker, Reports } from './mod_more.jsx';
import { LiveOps, Correlation, Agents } from './mod_live.jsx';

export const MODULES = [
  { id: 'overview', label: 'Operations Overview', icon: I.LayoutDashboard, group: 'Operate', C: Overview },
  { id: 'live', label: 'Live Operations', icon: I.Radio, group: 'Operate', C: LiveOps },
  { id: 'correlation', label: 'Correlation', icon: I.GitMerge, group: 'Operate', C: Correlation },
  { id: 'opsai', label: 'OpsRamp AI & Integrations', icon: I.BrainCircuit, group: 'Operate', C: OpsAI, hidden: true },
  { id: 'integrations', label: 'Integrations', icon: I.Plug, group: 'Operate', C: IntegrationsPage, hidden: true },
  { id: 'copilot', label: 'Operations Copilot', icon: I.Sparkles, group: 'Operate', C: CopilotPage, hidden: true },
  { id: 'b360', label: 'Branch 360', icon: I.Store, group: 'Operate', C: Branch360 },
  { id: 'readiness', label: 'Branch Readiness', icon: I.Sunrise, group: 'Operate', C: Readiness },
  { id: 'incidents', label: 'Live Incidents', icon: I.Siren, group: 'Operate', C: Incidents, badge: s => s.incidents.filter(i => i.state !== 'Resolved').length },
  { id: 'inventory', label: 'Device & Circuit Inventory', icon: I.Boxes, group: 'Manage', C: Inventory },
  { id: 'vuln', label: 'Lifecycle & Vulnerabilities', icon: I.ShieldAlert, group: 'Manage', C: Vulns, badge: () => D.DEVICES.filter(d => D.vulnsOf(d).some(a => a.sev === 'Critical')).length, alertBadge: true },
  { id: 'carriers', label: 'Carrier Management', icon: I.RadioTower, group: 'Manage', C: Carriers, badge: s => s.cases.filter(c => !c.closed).length },
  { id: 'dispatch', label: 'Field Dispatch', icon: I.Truck, group: 'Manage', C: Dispatch, badge: s => s.workOrders.filter(w => !w.tech).length, alertBadge: true },
  { id: 'changes', label: 'Approvals & Changes', icon: I.GitPullRequest, group: 'Manage', C: Changes, badge: s => s.approvals.filter(a => a.status === 'Pending').length, alertBadge: true },
  { id: 'policies', label: 'Policies & Templates', icon: I.FileCog, group: 'Manage', C: Policies },
  { id: 'biab', label: 'Branch-in-a-Box', icon: I.PackageCheck, group: 'Manage', C: BiaB },
  { id: 'predict', label: 'Predictive Watchlist', icon: I.TrendingUp, group: 'Improve', C: Predictive },
  { id: 'knowledge', label: 'Knowledge', icon: I.BookOpen, group: 'Improve', C: Knowledge },
  { id: 'agents', label: 'AI & Automation Catalogue', icon: I.Bot, group: 'Improve', C: () => <CatalogueTab tab="agents" />, hidden: true },
  { id: 'automation', label: 'AI & Automation Catalogue', icon: I.Workflow, group: 'Improve', C: () => <CatalogueTab tab="runbooks" />, hidden: true },
  { id: 'catalogue', label: 'AI & Automation Catalogue', icon: I.LibraryBig, group: 'Improve', C: Catalogue },
  { id: 'sla', label: 'Performance', icon: I.Gauge, group: 'Govern', C: SLATracker },
  { id: 'reports', label: 'Reports', icon: I.FileText, group: 'Govern', C: Reports },
];


function Header() {
  const { s, act } = useApp();
  const now = useNow();
  const pendingNotif = isMovate(s) ? s.approvals.filter(a => a.status === 'Pending').length + s.escalations.filter(e => e.status !== 'Answered').length : s.escalations.filter(e => e.status !== 'Sent' && !e.seen).length;
  const hb = 'h-8 rounded-[4px] border border-line text-ink hover:bg-chip';
  return (
    <header className="h-[60px] bg-head text-ink flex items-center pl-4 pr-3 gap-3 [&>*]:shrink-0 sticky top-0 z-40 border-b border-line shadow-[0_1px_3px_rgba(16,24,40,0.06)]">
      <div className="flex items-center gap-3 min-w-0 min-[1440px]:w-[220px] shrink-0">
        <RoofMark />
        <div className="leading-none min-w-0 hidden min-[1280px]:block">
          <div className="font-display text-[22px] font-bold tracking-[0.02em] text-ink">SRS</div>
          <div className="text-[10.5px] text-ink2 mt-0.5 whitespace-nowrap uppercase tracking-[0.12em]">Distribution</div>
        </div>
      </div>
      {/* the name wraps onto two lines when the header is short of room, instead of being cut off */}
      <div className="min-w-[150px] max-w-[460px] !shrink border-l border-line pl-4">
        <div className="font-display text-[16px] leading-[19px] min-[1600px]:text-[19px] min-[1600px]:leading-[23px] font-semibold text-ink line-clamp-2" title={APP_NAME}>{APP_NAME}{DEMOS_ONLY && <span className="text-ink3 font-normal"> · Live demos</span>}</div>
      </div>
      <div className="flex-1 !shrink" />
      <div className="hidden min-[1800px]:flex items-center gap-3 text-[11.5px] text-ink3 mr-1">
        {[['opsramp', 1], ['central', 2], ['servicenow', 1], ['movaio', 0]].map(([k, sec]) => <span key={k} className="inline-flex items-center gap-1.5"><span className="bg-white rounded-[3px] px-1 py-[2px] inline-flex border border-line"><img src={LOGOS[k]} alt={k} style={{ height: 11 }} /></span><span className="w-1.5 h-1.5 rounded-full bg-ok" />{(Math.floor(now / 1000) + sec) % 7 + 1}s</span>)}
      </div>
      {!DEMOS_ONLY && <>
      <button onClick={() => act.set({ askOpen: !s.askOpen })} className="h-8 rounded-[4px] px-3 text-[13px] font-semibold inline-flex items-center gap-1.5 bg-brand hover:brightness-110 text-white"><I.Sparkles size={15} />Ask Mova iO</button>
      <label className={hb + ' relative inline-flex items-center pl-2 pr-7 gap-1.5 text-[13px] max-[1279px]:w-[150px]'}>
        <I.UserRound size={14} className="text-ink3" />
        <select value={s.role} onChange={e => { const v = e.target.value; const r = ROLES.find(x => x.id === v); act.set(st => ({ role: v, module: r.home, selInc: null, askLog: [], tab: r.tab ? { ...st.tab, changes: r.tab } : st.tab, filters: { region: 'All', city: 'All', brand: 'All', branchId: null } })); act.toast(`Viewing as ${r.name} (${r.who})`, 'info'); }} className="bg-transparent outline-none appearance-none font-semibold cursor-pointer min-w-0 w-full truncate">
          <optgroup label="Movate: carries out actions">{ROLES.filter(r => r.org === 'Movate').map(r => <option key={r.id} value={r.id}>{r.name} · Movate</option>)}</optgroup>
          <optgroup label="SRS: sees everything, escalates to Movate">{ROLES.filter(r => r.org === 'SRS').map(r => <option key={r.id} value={r.id}>{r.name} · SRS</option>)}</optgroup>
        </select>
        <I.ChevronDown size={14} className="absolute right-2 text-ink3 pointer-events-none" />
      </label>
      <button onClick={() => act.set({ notifOpen: !s.notifOpen })} className={hb + ' relative w-8 flex items-center justify-center'} title="Notifications">
        <I.Bell size={16} />{pendingNotif > 0 && <span className="absolute -top-1.5 -right-1.5 bg-bad text-white text-[10px] font-bold rounded-full min-w-4 h-4 px-1 flex items-center justify-center">{pendingNotif}</span>}
      </button>
      </>}
      <button onClick={() => act.set({ theme: s.theme === 'dark' ? 'light' : 'dark' })} className={hb + ' w-8 flex items-center justify-center'} title="Toggle light / dark">{s.theme === 'dark' ? <I.Sun size={16} /> : <I.Moon size={16} />}</button>
      {!DEMOS_ONLY && <SpeedControl />}
      <div className="flex items-baseline gap-1.5 px-1 font-mono text-[14px] text-ink tabular"><span className="self-center w-1.5 h-1.5 rounded-full bg-ok animate-pulse" />{hhmmss(now)}<span className="text-[10.5px] text-ink3">CT</span></div>
    </header>
  );
}

function SpeedControl() {
  const { speed, setSpeed } = useLive(); const { act } = useApp();
  return (
    <div className="shrink-0 inline-flex items-center h-8 rounded-[4px] border border-line overflow-hidden text-[12px]" role="group" aria-label="Live data speed" title="How fast live data refreshes">
      <span className="inline-flex items-center gap-1 px-2 text-ink3 font-semibold h-full"><I.Gauge size={13} /><span className="hidden min-[1600px]:inline">Speed</span></span>
      {[1, 5, 10].map(x => <button key={x} onClick={() => { setSpeed(x); act.toast(x === 1 ? 'Live data back to normal speed (every 2 s)' : `Live data at ${x}× speed (every ${(2 / x).toFixed(1)} s)`, 'info'); }} aria-pressed={speed === x} className={cx('px-2 h-full font-bold border-l border-line', speed === x ? 'bg-ink text-canvas' : 'text-ink2 hover:bg-chip')}>{x}×</button>)}
    </div>
  );
}

// Back to where you were: the page, its tab, the open drill-down and the scroll position
function BackBar() {
  const { s, act } = useApp();
  const h = (s.navBack || []).slice(-1)[0];
  if (!h) return null;
  const M = MODULES.find(m => m.id === h.module), O = OPSRAMP && OPS_NAV.find(n => n.id === h.module);
  return <button onClick={act.back} className="mb-3 h-8 px-3 rounded-md border border-line bg-panel hover:bg-chip text-[12.5px] font-semibold text-ink inline-flex items-center gap-1.5 shadow-sm"><I.ArrowLeft size={14} />Back to {O ? O.label : M ? M.label : 'the last page'}{h.drill && h.drill.length ? ' (with the drill-down)' : ''}</button>;
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
        <div key={g} className="mt-3 mx-2 py-0.5">
          {!collapsed ? <div className="px-3 pt-1 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-white/40">{g}</div> : <div className="mx-3 my-1.5 border-t border-white/10" />}
          {MODULES.filter(m => m.group === g && !m.hidden).map(m => {
            const on = s.module === m.id; const b = m.badge ? m.badge(s) : 0;
            return (
              <button key={m.id} onClick={() => act.go(m.id)} title={m.label} className={cx('w-full flex items-center gap-2.5 px-3 h-9 text-[13px] text-left relative rounded-md', on ? 'bg-white/10 text-white font-semibold' : 'hover:bg-white/5 hover:text-white')}>
                                <m.icon size={16} className="shrink-0" />{!collapsed && <span className="flex-1 truncate">{m.label}</span>}
                {!collapsed && b > 0 && <span className={cx('text-[10.5px] font-bold rounded px-1.5', m.alertBadge ? 'bg-brand text-white' : 'bg-white/15 text-white')}>{b}</span>}
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
  const pickBranch = id => { if (!id) { setF({ branchId: null }); return; } const b = D.BR[id]; setF({ branchId: id, city: cityKey(b) }); if (s.module === 'overview' || s.module === 'b360') act.set({ module: 'b360', b360: id }); };
  // the device level: with a branch picked, its lines and devices; otherwise device and line sets for the scope
  const devOptions = f.branchId ? [{ value: '', label: `Device: any (${D.devicesOf(f.branchId).length + D.BR[f.branchId].wan.length})` },
    ...D.BR[f.branchId].wan.map((id, k) => { const c = D.CIR[id]; return { value: `c:${id}`, label: `ISP-${k + 1}: ${c.carrier} ${c.type} (${id})` }; }),
    ...D.devicesOf(f.branchId).map(d => ({ value: `d:${d.id}`, label: `${d.id} · ${d.model}${d.role ? ` · ${d.role}` : ''}` }))]
    : [{ value: '', label: 'Device: any' }, { value: 's:devices:all', label: `All devices in view (${num(list.reduce((a, b) => a + b.dev.ec + b.dev.sw + b.dev.ap, 0))})` }, { value: 's:devices:down', label: 'Devices down now' }, { value: 's:devices:crit', label: 'Devices with a critical flaw' }, { value: 's:devices:eos', label: 'Switches reaching end of support' }, { value: 's:lines:all', label: `All lines in view (${num(list.length * 2)})` }, { value: 's:lines:problem', label: 'Lines down or degraded now' }];
  const pickDevice = v => { if (!v) return; const [k, a, b] = v.split(':'); act.drill(k === 'c' ? { t: 'circuit', id: a } : k === 'd' ? { t: 'device', id: a } : { t: a, k: b }); };
  return (
    <div className="bg-panel border-b border-line px-5 py-2 flex items-center gap-1.5 flex-wrap [&_select]:max-w-[138px]">
      <span className="text-[12px] font-bold text-ink3 mr-1">Showing</span>
      {bm ? <Badge tone="brand" className="!text-[12px] !py-1"><I.Store size={13} />My branch: {D.BR[s.bmBranch].name}</Badge> : <>
        <button onClick={() => setF({ region: 'All', city: 'All', brand: 'All', branchId: null })} className={cx('h-8 px-3 rounded-md text-[13px] font-bold inline-flex items-center gap-1.5 border', f.region === 'All' && (!f.city || f.city === 'All') && !f.branchId ? 'bg-brand text-white border-brand' : 'bg-panel text-ink border-line hover:bg-chip')}><I.Globe2 size={14} />Overall</button>
        <I.ChevronRight size={14} className="text-ink3" />
        <Select icon={I.MapPin} value={f.region} onChange={v => setF({ region: v, city: 'All', branchId: null })} options={[{ value: 'All', label: 'Region: all' }, ...D.REGIONS.map(r => ({ value: r, label: `${r} (${D.BRANCHES.filter(b => b.region === r).length})` }))]} />
        <I.ChevronRight size={14} className="text-ink3" />
        <Select icon={I.Building2} value={f.city || 'All'} onChange={v => setF({ city: v, branchId: null })} options={[{ value: 'All', label: `City: all (${cities.length})` }, ...cities.map(c => ({ value: c, label: `${c} (${cityCounts[c]})` }))]} />
        <I.ChevronRight size={14} className="text-ink3" />
        {f.branchId && <><button onClick={() => pickBranch(null)} title="Clear the branch" className="h-8 px-2.5 rounded-md border border-line bg-chip text-[12.5px] font-semibold text-ink inline-flex items-center gap-1.5"><I.Store size={13} />{D.BR[f.branchId].name}<I.X size={13} className="text-ink3" /></button><I.ChevronRight size={14} className="text-ink3" /></>}
        <Select icon={I.Cpu} value="" onChange={pickDevice} options={devOptions} />
        <div className="relative">
          <SearchBox value={q} onChange={setQ} placeholder="Find a branch" className="w-36" />
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

// ── Ask Mova iO ──────────────────────────────────────────────────────
function copyText(txt, act) {
  const done = () => act.toast('Copied – paste it into your email or report', 'info');
  try { navigator.clipboard.writeText(txt).then(done, () => { fallback(); }); } catch { fallback(); }
  function fallback() { const t = document.createElement('textarea'); t.value = txt; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); done(); } catch { } t.remove(); }
}
function AskPanel() {
  const { s, act } = useApp();
  const { L } = useLive();
  const [q, setQ] = useState('');
  const endRef = useRef(null);
  useEffect(() => { endRef.current && endRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [s.askLog.length]);
  if (!s.askOpen) return null;
  const ask = text => { if (!text.trim()) return; const a = answer(s, text, Date.now(), L); act.set(st => ({ askLog: [...st.askLog, { q: text, a, t: Date.now() }] })); setQ(''); };
  const role = ROLES.find(r => r.id === s.role);
  const go = r => { if (r.inc) act.openInc(r.inc); else if (r.branch) act.openBranch(r.branch); };
  const chip = (c, n) => <button key={c} onClick={() => ask(c)} className="text-[12px] text-left border border-line rounded-md px-2 py-1 hover:bg-chip text-ink inline-flex gap-1.5 items-start">{n && <b className="text-brand tabular-nums">{n}</b>}<span>{c}</span></button>;
  return (
    <aside className="fixed right-0 top-[60px] bottom-0 w-[540px] max-w-full bg-panel border-l border-line shadow-2xl z-50 flex flex-col">
      <div className="px-4 py-3 border-b border-line flex items-center gap-2">
        <Logo k="movaio" h={16} /><div className="flex-1"><div className="font-bold text-ink text-[14px]">Ask Mova iO</div><div className="text-[11.5px] text-ink3">Answers come from live console data, as {role.name}</div></div>
        {s.askLog.length > 0 && <Btn size="sm" kind="ghost" onClick={() => act.set({ askLog: [] })}>Clear</Btn>}
        <Btn size="sm" kind="ghost" icon={I.X} onClick={() => act.set({ askOpen: false })} />
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="space-y-2">
          <div className="text-[12px] text-ink3 font-semibold">Start here</div>
          <div className="flex flex-col gap-1.5">{STORY.map((c, i) => chip(c, i + 1))}</div>
          <div className="text-[12px] text-ink3 font-semibold pt-1">More questions</div>
          <div className="flex flex-wrap gap-1.5">{MORE.map(c => chip(c))}</div>
          <div className="text-[12px] text-ink3 font-semibold pt-1">For {role.name}</div>
          <div className="flex flex-wrap gap-1.5">{CANNED[s.role].map(c => chip(c))}</div>
        </div>
        {s.askLog.map((x, i) => (
          <div key={i} className="space-y-2" ref={i === s.askLog.length - 1 ? endRef : null}>
            <div className="flex justify-end"><div className="bg-ink text-canvas rounded-md rounded-br-sm px-3 py-1.5 text-[13px] max-w-[85%]">{x.q}</div></div>
            <div className="bg-chip border border-line rounded-md rounded-bl-sm p-3 text-[12.5px] space-y-2">
              <div className="font-bold text-ink text-[13.5px] leading-snug">{x.a.title}</div>
              {x.a.lead && <p className="text-ink2 leading-snug">{x.a.lead}</p>}
              {(x.a.blocks || []).map((k, j) => <AskBlock key={j} k={k} go={go} />)}
              {x.a.lines && x.a.lines.length > 0 && <AskBlock go={go} k={{ type: 'list', items: x.a.lines.map(l => typeof l === 'string' ? { k: '', v: l } : l) }} />}
              {x.a.src && <div className="text-[11px] text-ink3 flex items-center gap-1"><I.Database size={11} />Grounded in: {x.a.src}, {hhmm(x.t)} CT</div>}
              {(x.a.links.length > 0 || x.a.copy) && <div className="flex flex-wrap gap-1.5">{x.a.copy && <Btn size="xs" kind="brand" icon={I.Copy} onClick={() => copyText(x.a.copy, act)}>Copy for my report</Btn>}{x.a.links.map(l => <Btn key={l.label} size="xs" icon={I.ArrowRight} onClick={() => act.set(st => ({ module: l.module, selInc: null, ...l.extra, tab: { ...st.tab, ...(l.extra.tab || {}) }, filters: l.extra.filters || st.filters }))}>{l.label}</Btn>)}</div>}
            </div>
          </div>
        ))}
      </div>
      <form onSubmit={e => { e.preventDefault(); ask(q); }} className="p-3 border-t border-line flex gap-2">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder='e.g. "Why was Branch 214 slow this morning?"' className="flex-1 h-9 px-3 rounded-md border border-line bg-canvas text-ink text-[13px] outline-none focus:border-ink3" />
        <Btn kind="brand" icon={I.Send} type="submit">Ask</Btn>
      </form>
    </aside>
  );
}

function Toasts() {
  const { s, act } = useApp();
  if (s.scenario) return null; // the demo stage shows its own events
  return (
    <div className="fixed top-[68px] right-4 z-[90] flex flex-col gap-2 items-end pointer-events-none w-[360px] max-w-[calc(100vw-32px)]">
      {s.toasts.map(t => <div key={t.id} role="status" className={cx('toast-in pointer-events-auto w-full pl-3.5 pr-1.5 py-2 rounded-md shadow-xl text-[13px] font-semibold flex items-start gap-2 border', t.tone === 'bad' ? 'bg-bad text-white border-bad' : t.tone === 'warn' ? 'bg-warn text-white border-warn' : t.tone === 'info' ? 'bg-ink text-canvas border-ink' : 'bg-ok text-white border-ok')}>
        <span className="mt-[2px] shrink-0">{t.tone === 'bad' ? <I.XCircle size={15} /> : t.tone === 'warn' ? <I.AlertTriangle size={15} /> : t.tone === 'info' ? <I.Info size={15} /> : <I.CheckCircle2 size={15} />}</span>
        <span className="flex-1 min-w-0 leading-snug">{t.msg}</span>
        <button onClick={() => act.dismissToast(t.id)} aria-label="Close notification" title="Close" className="shrink-0 w-6 h-6 -my-0.5 rounded flex items-center justify-center opacity-80 hover:opacity-100 hover:bg-white/15"><I.X size={14} /></button>
      </div>)}
    </div>
  );
}

function Notifications() {
  const { s, act } = useApp();
  if (!s.notifOpen) return null;
  const escItems = s.escalations.filter(e => isMovate(s) ? e.status !== 'Answered' : true).map(e => ({ t: e.reply ? e.reply.t : e.ackT || e.t, icon: I.Megaphone, text: isMovate(s) ? `SRS escalation ${e.id} (${e.urgency}) from ${e.from.replace(/ \(.*/, '')}: ${e.about.label}` : `${e.id}: ${e.status === 'Answered' ? `Movate replied: ${e.reply.text}` : e.status === 'Acknowledged' ? `acknowledged by ${e.ackBy}, next update ${hhmm(e.next)} CT` : 'sent to Movate'}`, go: () => { act.set({ notifOpen: false }); const inc = e.about.kind === 'incident' ? e.about.id : e.about.inc; if (inc) act.openInc(inc); else if (e.about.kind === 'workorder') act.drill({ t: 'workpack', id: e.about.id }); else if (e.about.kind === 'branch') act.openBranch(e.about.id); } }));
  const items = [
    ...escItems,
    ...s.approvals.filter(a => a.status === 'Pending' && isMovate(s)).map(a => ({ t: a.created, icon: I.ShieldAlert, text: `Approval needed: ${a.title}`, go: () => act.set(st => ({ module: 'changes', tab: { ...st.tab, changes: 'approvals' }, notifOpen: false })) })),
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
    <Modal open onClose={close} title={<span className="flex items-center gap-2"><Dot tone={healthTone(h)} />{b.name}</span>} sub={`${b.id}, ${b.region}, ${b.segment}, ${clk.local} (${clk.open ? 'open' : 'closed'})`} wide
      footer={<><Btn icon={I.Sunrise} onClick={() => { close(); act.set(st => ({ module: 'readiness', filters: { region: 'All', city: 'All', brand: 'All', branchId: b.id } })); }}>Readiness checks</Btn><Btn icon={I.Boxes} onClick={() => { close(); act.set(st => ({ module: 'inventory', filters: { region: 'All', city: 'All', brand: 'All', branchId: b.id } })); }}>Devices</Btn><div className="flex-1" /><Btn kind="brand" icon={I.Filter} onClick={() => { close(); act.set({ filters: { region: 'All', city: 'All', brand: 'All', branchId: b.id } }); }}>Filter console to this branch</Btn></>}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

// The demos page: the demo library and the demo player, nothing else from the console.
function DemosApp() {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <Header />
      <main className="p-5 max-w-[1680px] mx-auto"><LiveDemos /></main>
      <DemoStage /><Toasts />
    </div>
  );
}

// The drill-down panel in the console: opened from any tile, chart segment or count, it walks down to one branch,
// line, device or incident and can hand over to Branch 360, the incident record or the screen that owns the list.
function ConsoleDrill() {
  const { s, act } = useApp();
  const now = useNow();
  const links = useMemo(() => ({
    branch: id => { act.setDrill([]); act.openBranch(id); },
    incident: (id, tab) => { act.setDrill([]); act.set({ module: 'incidents', selInc: id, incTab: tab || null }); },
    module: m => { act.setDrill([]); act.go(m); },
    act, role: () => act.get().role, // acting on the ticket from the root cause: hand over, dispatch, carrier case
  }), []);
  if (!s.drill || !s.drill.length) return null;
  const M = MODULES.find(m => m.id === s.module);
  return <DrillPanel stack={s.drill} setStack={act.setDrill} now={now} links={links} root={M ? M.label : 'Console'} />;
}


// ── the OpsRamp view (opsramp/index.html): the same live data in the OpsRamp layout ──
// a dark top bar with the client and an OpsQL-style search, a slim icon rail with OpsRamp's sections, a breadcrumb
// in the order the work happens: connect the sources, know the assets and how they are monitored, correlate and
// work the alerts, predict, patch, automate, report; the dashboards sit at the bottom
const OPS_GROUPS = [
  { g: 'Integrations', icon: I.Plug, items: [{ id: 'integrations', label: 'Integration studio' }] },
  { g: 'Infrastructure', icon: I.Server, items: [{ id: 'inventory', label: 'Asset inventory' }, { id: 'policies', label: 'Policies and rules' }] },
  { g: 'Alerts', icon: I.BellRing, items: [{ id: 'correlation', label: 'Correlation' }, { id: 'incidents', label: 'Alert Browser', badge: s => s.incidents.filter(i => i.state !== 'Resolved').length }, { id: 'copilot', label: 'Operations Copilot' }] },
  { g: 'Insights', icon: I.TrendingUp, items: [{ id: 'predict', label: 'Predictive insights' }] },
  { g: 'Patch & Vulnerability', icon: I.ShieldCheck, items: [{ id: 'vuln', label: 'Patch and vulnerability', badge: () => D.DEVICES.filter(d => D.vulnsOf(d).some(a => a.sev === 'Critical')).length }] },
  { g: 'AI & Automation', icon: I.BrainCircuit, items: [{ id: 'catalogue', label: 'AI and automation library' }, { id: 'knowledge', label: 'Knowledge base' }] },
  { g: 'Reporting', icon: I.LayoutDashboard, items: [{ id: 'sla', label: 'Dashboards and reports', also: ['reports'] }] },
];
const OPS_NAV = OPS_GROUPS.flatMap(g => g.items.map(x => ({ ...x, group: g.g })));
const isOn = (n, m) => n.id === m || (n.also || []).includes(m);
// dashboards and reports are one page: the live dashboard and the reports built from the same figures
const DASH_TABS = [{ id: 'sla', label: 'Dashboard', icon: I.LayoutDashboard }, { id: 'reports', label: 'Reports', icon: I.FileBarChart }];
const DASH_TITLES = { Performance: 'sla', Reports: 'reports' };
// the scope set from a drill (a region, a city, one branch); shown only when it narrows the view, with a way to clear it
function ScopeChip() {
  const { s, act } = useApp();
  const f = s.filters || {};
  const label = f.branchId && D.BR[f.branchId] ? D.BR[f.branchId].name : f.city && f.city !== 'All' ? f.city : f.region && f.region !== 'All' ? f.region : f.brand && f.brand !== 'All' ? f.brand : null;
  if (!label || s.role === 'bm') return null;
  return <button onClick={() => act.set({ filters: { region: 'All', city: 'All', brand: 'All', branchId: null } })} title="Show all sites again" className="inline-flex items-center gap-1.5 h-6 px-2 rounded-[4px] border border-line bg-chip text-[12px] text-ink font-semibold"><I.Filter size={12} className="text-ink3" />Scope: {label}<I.X size={12} className="text-ink3" /></button>;
}
function OpsSearch() {
  const { s, act } = useApp();
  const [q, setQ] = useState('');
  const t = q.trim().toLowerCase().replace(/^(name|branch|resource|incident|id)\s*[:=]\s*/, '');
  const hits = t.length < 2 ? [] : [
    ...s.incidents.filter(i => `${i.id} ${i.title}`.toLowerCase().includes(t)).slice(0, 4).map(i => ({ k: i.id, label: i.id, sub: i.title, kind: 'Alert', go: () => act.openInc(i.id) })),
    ...D.BRANCHES.filter(b => `${b.name} ${b.brand} ${b.code}`.toLowerCase().includes(t)).slice(0, 4).map(b => ({ k: b.id, label: b.name, sub: b.brand, kind: 'Site', go: () => act.openBranch(b.id) })),
    ...D.DEVICES.filter(d => d.id.includes(t)).slice(0, 4).map(d => ({ k: d.id, label: d.id, sub: `${d.model} · ${D.BR[d.branchId].name}`, kind: 'Resource', go: () => act.drill({ t: 'device', id: d.id }) })),
  ];
  return (
    <div className="relative flex-1 max-w-[560px] hidden md:block">
      <div className="h-8 rounded-[4px] bg-white/10 border border-white/15 flex items-center gap-2 px-2.5 text-white/80 focus-within:bg-white/15"><I.Search size={14} /><input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && hits[0]) { hits[0].go(); setQ(''); } }} placeholder='Search resources, alerts and sites  (e.g. name: ny0277-ec01)' className="flex-1 bg-transparent outline-none text-[12.5px] text-white placeholder:text-white/45" /><span className="text-[10.5px] font-bold text-white/40">OpsQL</span></div>
      {hits.length > 0 && <div className="absolute top-9 left-0 right-0 bg-panel text-ink border border-line rounded-md shadow-xl py-1 z-50">{hits.map(h => <button key={h.k} onClick={() => { h.go(); setQ(''); }} className="w-full text-left px-3 py-1.5 hover:bg-chip flex items-center gap-2 text-[12.5px]"><span className="text-[10.5px] font-bold uppercase text-ink3 w-16">{h.kind}</span><span className="font-semibold truncate">{h.label}</span><span className="text-ink3 truncate">{h.sub}</span></button>)}</div>}
    </div>
  );
}
function OpsRampApp() {
  const { s, act } = useApp();
  const now = useNow();
  const M = MODULES.find(m => m.id === s.module) || MODULES.find(m => m.id === 'sla');
  const nav = OPS_NAV.find(n => isOn(n, s.module));
  const [railMin, setRailMin] = useState(false);
  const head = useCallback(t => DASH_TITLES[t] && ['sla', 'reports'].includes(s.module) ? { title: 'Dashboards and reports', below: <div className="flex items-center gap-0 mt-3 border-b border-line">{DASH_TABS.map(x => { const on = s.module === x.id; return <button key={x.id} onClick={() => act.nav(x.id)} className={cx('h-9 px-4 -mb-px inline-flex items-center gap-1.5 text-[13px] border-b-2', on ? 'border-[#01A982] text-ink font-semibold' : 'border-transparent text-ink3 hover:text-ink')}><x.icon size={14} />{x.label}</button>; })}</div> } : null, [s.module]);
  const role = ROLES.find(r => r.id === s.role);
  const ib = 'h-8 w-8 rounded-[4px] flex items-center justify-center text-white/75 hover:bg-white/10 hover:text-white';
  return (
    <div className="theme-opsramp opsramp-app min-h-screen bg-canvas text-ink">
      <OpsCtx.Provider value={isMovate(s) ? null : SRS_LOCK}>
      <header className="h-[52px] bg-[#1b2128] text-white flex items-center gap-3 px-3 sticky top-0 z-40 border-b border-black/30">
        <Logo k="opsramp" h={15} className="!border-0 !bg-white/95" />
        <span className="font-semibold text-[14px] tracking-wide whitespace-nowrap">HPE OpsRamp</span>
        <span className="hidden lg:inline-flex items-center gap-1.5 h-7 px-2.5 rounded-[4px] bg-white/10 text-[12px] text-white/85 whitespace-nowrap"><I.Building2 size={13} />Client: SRS Distribution<I.ChevronDown size={13} className="text-white/50" /></span>
        <OpsSearch />
        <div className="flex-1" />
        <button onClick={() => act.go('copilot')} className="h-8 px-2.5 rounded-[4px] bg-[#01A982] hover:brightness-110 text-white text-[12.5px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"><I.Sparkles size={14} />Copilot</button>
        <button onClick={() => act.set({ notifOpen: !s.notifOpen })} className={ib + ' relative'} title="Notifications"><I.Bell size={16} />{s.notif > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-[#e5484d] text-[10px] font-bold grid place-items-center">{s.notif}</span>}</button>
        <button onClick={() => act.set({ theme: s.theme === 'dark' ? 'light' : 'dark' })} className={ib} title="Light or dark">{s.theme === 'dark' ? <I.Sun size={16} /> : <I.Moon size={16} />}</button>
        <button onClick={() => act.set({ storageOpen: true })} className={ib} title="Where the data is saved"><I.Settings size={16} /></button>
        <span className="hidden xl:inline text-[12px] text-white/70 tabular-nums whitespace-nowrap">{hhmm(now)} CT</span>
        <span className="inline-flex items-center gap-2 pl-2 border-l border-white/15"><span className="w-7 h-7 rounded-full bg-[#01A982] text-white text-[11px] font-bold grid place-items-center">{role.who.split(' ').map(x => x[0]).join('')}</span><span className="hidden xl:block leading-tight"><span className="block text-[12px] text-white">{role.who}</span><span className="block text-[10.5px] text-white/55">{role.name}</span></span></span>
      </header>
      <div className="flex">
        <nav className={cx('shrink-0 bg-[#232a33] text-white/70 sticky top-[52px] h-[calc(100vh-52px)] overflow-y-auto flex flex-col py-2', railMin ? 'w-14' : 'w-[224px]')}>
          {OPS_GROUPS.map(g => { const inG = g.items.some(x => isOn(x, s.module)); return (
            <div key={g.g} className="mb-1">
              <div title={g.g} className={cx('flex items-center gap-2 px-4 pt-2 pb-1 text-[11px] font-bold uppercase tracking-[0.08em]', inG ? 'text-white' : 'text-white/45')}><g.icon size={railMin ? 18 : 14} className="shrink-0" />{!railMin && g.g}</div>
              {!railMin && g.items.map(n => { const on = isOn(n, s.module), bd = n.badge ? n.badge(s) : 0; return (
                <button key={n.id} onClick={() => act.nav(n.id)} className={cx('relative w-full text-left flex items-center gap-2 pl-10 pr-3 h-8 text-[13px]', on ? 'bg-white/10 text-white font-semibold' : 'hover:bg-white/5 hover:text-white')}>
                  {on && <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r bg-[#01A982]" />}
                  <span className="flex-1 truncate">{n.label}</span>{bd > 0 && <span className="text-[10.5px] font-bold rounded px-1.5 bg-white/15 text-white">{bd}</span>}
                </button>); })}
            </div>); })}
          <div className="flex-1" />
          <button onClick={() => act.set({ storageOpen: true })} className="flex items-center gap-2 px-4 h-9 text-[13px] hover:bg-white/5 hover:text-white"><I.Settings2 size={16} />{!railMin && 'Setup'}</button>
          <button onClick={() => setRailMin(v => !v)} className="flex items-center gap-2 px-4 h-9 text-[12px] text-white/50 hover:text-white border-t border-white/10">{railMin ? <I.PanelLeftOpen size={15} /> : <><I.PanelLeftClose size={15} />Collapse</>}</button>
        </nav>
        <main className="flex-1 min-w-0">
          <div className="bg-panel border-b border-line px-5 h-10 flex items-center gap-2 text-[12.5px]">
            <span className="text-ink3">SRS Distribution</span><I.ChevronRight size={13} className="text-ink3" />
            {nav && <><span className="text-ink2">{nav.group}</span><I.ChevronRight size={13} className="text-ink3" /></>}<b className="text-ink">{nav ? nav.label : M.label}</b>
            <span className="flex-1" /><ScopeChip /><span className="text-[11.5px] text-ink3">Sample SRS data, operated by Movate</span>
          </div>
          <div className="p-5 max-w-[1680px]"><BackBar /><HeadCtx.Provider value={head}><M.C key={M.id} /></HeadCtx.Provider></div>
        </main>
      </div>
      <AskPanel /><Toasts /><Notifications /><BranchDrawer /><ConsoleDrill /><EscalateDialog /><StorageModal />
      </OpsCtx.Provider>
    </div>
  );
}

export default function App() {
  const { s } = useApp();
  if (DEMOS_ONLY) return <DemosApp />;
  if (OPSRAMP) return <OpsRampApp />;
  const M = MODULES.find(m => m.id === s.module) || MODULES[0];
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <OpsCtx.Provider value={isMovate(s) ? null : SRS_LOCK}>
      <Header />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 min-w-0">
          <div className="sticky top-[60px] z-30"><FilterBar />{!isMovate(s) && <SrsStrip />}</div>
          <div className="p-5 max-w-[1680px]"><BackBar /><M.C key={M.id} /></div>
        </main>
      </div>
      <AskPanel /><Toasts /><Notifications /><BranchDrawer /><ConsoleDrill /><EscalateDialog /><StorageModal />
      </OpsCtx.Provider>
    </div>
  );
}

// for SRS roles: a reminder of what the view allows, and the way to get Movate to act on what is on screen
function SrsStrip() {
  const { s } = useApp();
  const r = roleOf(s);
  const about = () => s.selInc ? aboutOf(s, { t: 'incident', id: s.selInc }) : s.module === 'b360' && s.b360 ? aboutOf(s, { t: 'branch', id: s.b360 }) : { kind: 'general', label: `${(MODULES.find(m => m.id === s.module) || {}).label || 'Console'}: general` };
  const open = s.escalations.filter(e => e.from.indexOf(r.who) === 0 && e.status !== 'Answered').length;
  return (
    <div className="bg-[#1f2a44] text-white px-5 py-1.5 flex items-center gap-3 text-[12.5px]">
      <I.Eye size={14} className="shrink-0" />
      <span className="flex-1 min-w-0"><b>SRS view ({r.name}).</b> You see everything live; actions are carried out by Movate. To get something done, escalate it to Movate.{r.id === 'tech' ? ' As the field technician you also record your onsite work in the work pack.' : ''}{open ? ` ${open} escalation${open === 1 ? '' : 's'} open.` : ''}</span>
      <EscalateButton about={about} size="sm" className="!bg-white !text-[#1f2a44] !border-white" />
    </div>
  );
}
