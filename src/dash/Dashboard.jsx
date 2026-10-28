// Real-time role-based dashboards: sign in with a role's account and see only that role's dashboard (RBAC). The
// numbers, charts, insights and live activity refresh from the same live data as the console every few seconds;
// every number, chart part and insight opens the drill-down. Export PDF saves the current view.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as I from 'lucide-react';
import * as D from '../data.js';
import { useApp } from '../store.jsx';
import { useLive } from '../live.jsx';
import { AskBlock } from '../askblocks.jsx';
import { cx, RoofMark } from '../ui.jsx';
import { PERSONAS, personaById } from './personas.js';
import { compose } from './compose.js';
import { downloadEdition } from './pdf.js';
import { hhmm, hhmmss, dateShort } from '../util.js';
import { APP_NAME } from '../edition.js';
import { DrillPanel } from './Drill.jsx';
import { ChartCards } from './Charts.jsx';
import { Spark, C } from '../charts.jsx';

const KEY = 'srs-dash-user';
const load = () => { try { return sessionStorage.getItem(KEY); } catch { return null; } };
const save = v => { try { v ? sessionStorage.setItem(KEY, v) : sessionStorage.removeItem(KEY); } catch { } };
// Aptos where it is installed (Windows and Microsoft 365); the nearest system sans elsewhere
const APTOS = { fontFamily: 'Aptos, "Segoe UI", "Helvetica Neue", Arial, sans-serif' };
const DISPLAY = { fontFamily: '"Aptos Display", Aptos, "Segoe UI", "Helvetica Neue", Arial, sans-serif' };
const TONE = { ok: 'text-ok', warn: 'text-warn', bad: 'text-bad', info: 'text-info' };
const BAR = { ok: '#2E8540', warn: '#C46A00', bad: '#C62A1E', info: '#2F6DB5' };
const VIEWS = [['daily', 'Live now'], ['weekly', 'Last 7 days'], ['monthly', 'Last month']];
const AHEAD = { daily: 'Next 24 hours', weekly: 'Next 7 days', monthly: 'Next 30 days' };
const STATUS_PILL = { ok: 'bg-ok/10 text-ok border-ok/30', minor: 'bg-info/10 text-info border-info/30', warn: 'bg-warn/10 text-warn border-warn/30', bad: 'bg-bad/10 text-bad border-bad/30' };
const longDate = t => new Date(t).toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', timeZone: 'America/Chicago' });
const Kicker = ({ children, className }) => <div className={cx('text-[11px] font-bold tracking-[0.1em] uppercase text-brand', className)}>{children}</div>;
// a dashboard card
function Card({ title, icon: Ic, right, children, className, id }) {
  return (
    <section id={id} className={cx('bg-panel border border-line rounded-md min-w-0 flex flex-col', className)}>
      {title && <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-line">{Ic && <Ic size={15} className="text-ink3" />}<h3 className="flex-1 text-[13px] font-bold text-ink">{title}</h3>{right}</div>}
      <div className="p-4 flex-1 min-h-0">{children}</div>
    </section>
  );
}

function SignIn({ onIn }) {
  const [u, setU] = useState(''), [pw, setPw] = useState(''), [err, setErr] = useState('');
  const go = e => { e.preventDefault(); const p = PERSONAS.find(x => x.user === u.trim().toLowerCase() && x.password === pw); if (p) onIn(p.id); else setErr('That username and password do not match a demo account.'); };
  return (
    <div className="min-h-screen">
      <div className="bg-panel border-b border-line"><div className="max-w-[1100px] mx-auto px-4 sm:px-6 h-14 flex items-center gap-3"><RoofMark size={30} /><span className="font-bold text-ink text-[15px]">{APP_NAME}</span><span className="text-ink3 text-[13px] hidden sm:inline">· Role dashboards</span></div></div>
      <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-10">
        <h1 className="text-[32px] font-bold text-ink leading-tight" style={DISPLAY}>Role dashboards</h1>
        <p className="text-[15px] text-ink2 mt-2 max-w-[760px]">Real-time network dashboards for each leader, from the same live data as the console. Sign in with your role: each account sees only its own dashboard, its own scope and the detail its access allows, and every number opens the detail behind it.</p>
        <div className="grid md:grid-cols-[minmax(0,340px)_minmax(0,1fr)] gap-6 mt-8">
          <form onSubmit={go} className="bg-panel border border-line rounded-md p-5 space-y-3 self-start">
            <div className="text-[14px] font-bold text-ink flex items-center gap-2"><I.Lock size={15} className="text-ink3" />Sign in</div>
            <label className="block text-[12px] text-ink2">Username<input value={u} onChange={e => { setU(e.target.value); setErr(''); }} autoComplete="username" className="mt-1 w-full h-10 px-3 rounded-md border border-line bg-panel text-ink text-[14px] outline-none focus:border-ink3" /></label>
            <label className="block text-[12px] text-ink2">Password<input type="password" value={pw} onChange={e => { setPw(e.target.value); setErr(''); }} autoComplete="current-password" className="mt-1 w-full h-10 px-3 rounded-md border border-line bg-panel text-ink text-[14px] outline-none focus:border-ink3" /></label>
            {err && <div className="text-[12.5px] text-bad">{err}</div>}
            <button type="submit" className="h-10 w-full rounded-md bg-brand text-white font-bold text-[14px] hover:brightness-110">Sign in</button>
            <p className="text-[11.5px] text-ink3 leading-snug">Demo accounts only. This page holds sample data and the passwords are shown here, so the sign-in shows how access is split by role; it is not a security control.</p>
          </form>
          <div className="bg-panel border border-line rounded-md overflow-hidden self-start">
            <div className="px-4 py-3 border-b border-line text-[13px] font-bold text-ink">Demo accounts <span className="font-normal text-ink3">– click one to fill the form</span></div>
            <div className="overflow-x-auto"><table className="w-full text-[12.5px]"><thead><tr className="text-left text-ink3 border-b border-line"><th className="px-3 py-2 font-semibold">Role</th><th className="px-3 py-2 font-semibold">Scope</th><th className="px-3 py-2 font-semibold">Username</th><th className="px-3 py-2 font-semibold">Password</th></tr></thead>
              <tbody>{PERSONAS.map(p => <tr key={p.id} onClick={() => { setU(p.user); setPw(p.password); setErr(''); }} className="border-b border-line/60 last:border-0 cursor-pointer hover:bg-chip/60"><td className="px-3 py-2 font-semibold text-ink">{p.title}</td><td className="px-3 py-2 text-ink2">{p.region || 'All regions'}</td><td className="px-3 py-2 font-mono text-ink">{p.user}</td><td className="px-3 py-2 font-mono text-ink">{p.password}</td></tr>)}</tbody></table></div>
          </div>
        </div>
      </div>
    </div>
  );
}

// the whole answer behind an insight
function InsightDetail({ x, onClose, go }) {
  useEffect(() => { const k = e => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);
  return (
    <div className="fixed inset-0 z-50 bg-black/45 flex items-start justify-center p-3 sm:p-8 overflow-y-auto" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={x.sum.title} className="w-full max-w-[860px] rounded-md shadow-2xl p-5 sm:p-7 bg-canvas" onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0"><Kicker>{x.kicker}</Kicker><h2 className="text-[22px] font-bold text-ink leading-tight mt-1" style={DISPLAY}>{x.sum.title}</h2></div>
          <button onClick={onClose} aria-label="Close" className="h-9 w-9 shrink-0 rounded-md border border-line hover:bg-chip grid place-items-center text-ink"><I.X size={16} /></button>
        </div>
        {x.a.lead && <p className="text-[14.5px] text-ink2 leading-relaxed mt-2">{x.a.lead}</p>}
        {x.go && <button onClick={() => go(x.go)} className="mt-3 h-9 px-3 rounded-md bg-brand text-white text-[13px] font-semibold inline-flex items-center gap-1.5 hover:brightness-110"><I.Layers size={15} />Drill down<I.ArrowRight size={14} /></button>}
        <div className="space-y-2 mt-3 text-[12.5px]">{(x.a.blocks || []).map((k, j) => <AskBlock key={j} k={k} maxRows={12} go={r => go(r.inc ? { t: 'incident', id: r.inc } : { t: 'branch', id: r.branch })} />)}</div>
        <p className="text-[11.5px] text-ink3 mt-2">Click a branch or incident in the tables to open its full detail.</p>
        {x.a.src && <div className="text-[11px] text-ink3 italic mt-3">Source: {x.a.src}</div>}
      </div>
    </div>
  );
}

function Insight({ x, onOpen, go }) {
  const { sum } = x;
  return (
    <article className="bg-panel border border-line rounded-md p-4 flex flex-col min-w-0">
      <Kicker>{x.kicker}</Kicker>
      <h3 className="text-[16px] font-bold text-ink leading-snug mt-1" style={DISPLAY}>{sum.title}</h3>
      {sum.line && <p className="text-[13px] text-ink2 leading-snug mt-1">{sum.line}</p>}
      {sum.stats.length > 0 && <div className="flex gap-5 mt-2">{sum.stats.map(s => <button key={s.label} onClick={() => go(x.go)} className="min-w-0 text-left hover:opacity-80"><div className={cx('font-bold leading-none tabular-nums whitespace-nowrap', s.value.length > 6 ? 'text-[17px]' : 'text-[21px]', TONE[s.tone] || 'text-ink')} style={DISPLAY}>{s.value}</div><div className="text-[11px] text-ink3 mt-0.5 leading-tight">{s.label}</div></button>)}</div>}
      {sum.bars && <div className="mt-2 space-y-1.5">{sum.bars.items.map(b => { const mx = sum.bars.max || Math.max(1, ...sum.bars.items.map(v => v.value)); return <div key={b.label} className="text-[11.5px]"><div className="flex justify-between gap-2 text-ink2"><span className="truncate">{b.label}</span><b className="text-ink tabular-nums">{b.display ?? b.value}</b></div><div className="h-1.5 bg-ink/10 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.max(3, b.value / mx * 100)}%`, background: BAR[b.tone] || BAR.info }} /></div></div>; })}</div>}
      {sum.points.length > 0 && <ul className="mt-2 space-y-1 text-[12.5px] text-ink2">{sum.points.map((p, i) => <li key={i} className="flex gap-2"><span className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: BAR[p.tone] || '#16191D' }} /><span className="min-w-0">{p.b && <b className="text-ink font-semibold">{p.b}</b>}{p.b && p.t ? ' – ' : ''}{p.t}</span></li>)}</ul>}
      <div className="mt-auto pt-3 flex flex-wrap gap-2">
        <button onClick={onOpen} className="h-8 px-2.5 rounded border border-line text-[12.5px] font-semibold text-ink hover:bg-chip inline-flex items-center gap-1"><I.FileText size={13} />Details</button>
        {x.go && <button onClick={() => go(x.go)} className="h-8 px-2.5 rounded border border-line text-[12.5px] font-semibold text-ink hover:bg-chip inline-flex items-center gap-1"><I.Layers size={13} />Drill down</button>}
      </div>
    </article>
  );
}

// the live events this role sees, newest first
function Activity({ p, go, ver }) {
  const { L } = useLive();
  const seen = useRef(null);
  const items = L.feed.filter(e => (!p.feed || p.feed.includes(e.cat)) && (!p.region || (D.BR[e.branchId] && D.BR[e.branchId].region === p.region))).slice(0, 14);
  const isNew = id => seen.current && !seen.current.has(id);
  useEffect(() => { seen.current = new Set(items.map(e => e.id)); }, [ver]);
  const tone = sev => ({ Critical: 'bg-bad', Major: 'bg-warn', Minor: 'bg-[#F0CF6B]' }[sev] || 'bg-ok');
  const perMin = Math.round(L.series.raw.at(-1));
  return (<>
    <div className="flex items-center gap-3 -mt-1 mb-3"><div><div className="text-[22px] font-bold text-ink leading-none tabular-nums" style={DISPLAY}>{perMin}</div><div className="text-[11px] text-ink3">network events per minute</div></div><div className="flex-1 min-w-0"><Spark data={L.series.raw.slice(-60)} h={36} color={C.s1} /></div></div>
    <ul className="divide-y divide-line -mx-4 -mb-4 border-t border-line max-h-[600px] overflow-y-auto">
      {items.map(e => (
        <li key={e.id} className={cx(isNew(e.id) && 'feed-in')}>
          <button onClick={() => go(e.inc ? { t: 'incident', id: e.inc } : { t: 'branch', id: e.branchId })} className="w-full text-left px-4 py-2 hover:bg-chip/60 flex gap-2.5 group">
            <span className={cx('mt-[6px] w-2 h-2 rounded-full shrink-0', tone(e.sev))} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-[11px] text-ink3"><span className="font-mono tabular-nums">{hhmmss(e.t)}</span><span className="font-semibold text-ink2">{e.src}</span>{e.branchId && D.BR[e.branchId] && <span className="truncate">{D.BR[e.branchId].name}</span>}</span>
              <span className="block text-[12.5px] text-ink leading-snug group-hover:underline decoration-ink/30">{e.msg}</span>
              {e.out && <span className="block text-[11px] text-ink3">{e.out}</span>}
            </span>
          </button>
        </li>
      ))}
      {!items.length && <li className="px-4 py-3 text-[12.5px] text-ink3">No activity for this role yet.</li>}
    </ul>
  </>);
}

function Dash({ p, onOut }) {
  const { s } = useApp(); const { L, ver, paused, setPaused, speed, setSpeed } = useLive();
  const sRef = useRef(s); sRef.current = s;
  const [period, setPeriod] = useState('daily');
  const [stamp, setStamp] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(null);
  const [drill, setDrill] = useState([]);
  const [access, setAccess] = useState(false);
  const go = node => { if (node) { setOpen(null); setDrill([node]); } };
  // real time: the dashboard is worked out again every third live tick (about every 6 seconds at 1×)
  useEffect(() => { if (ver % 3 === 0) setStamp(Date.now()); }, [ver]);
  const ed = useMemo(() => compose(p, sRef.current, stamp, L, period), [p.id, period, stamp]);
  const pdf = () => { setBusy(true); setTimeout(() => { try { downloadEdition(ed); } finally { setBusy(false); } }, 30); };
  const scope = p.region || 'All regions';
  return (
    <div className="min-h-screen pb-12">
      <header className="md:sticky md:top-0 z-30 bg-panel border-b border-line">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 min-h-14 py-2 flex flex-wrap items-center gap-x-3 gap-y-2">
          <RoofMark size={30} />
          <div className="min-w-0 mr-auto"><div className="font-bold text-ink text-[15px] leading-tight truncate">{APP_NAME}</div><div className="text-[12px] text-ink3 leading-tight">Role dashboard</div></div>
          <div className="relative">
            <button onClick={() => setAccess(a => !a)} className="h-8 px-2.5 rounded-md border border-line hover:bg-chip text-[12.5px] text-ink inline-flex items-center gap-1.5"><I.ShieldCheck size={14} className="text-ok" /><b className="font-semibold">{p.title}</b><span className="text-ink3 hidden md:inline">· {scope}</span><I.ChevronDown size={13} className="text-ink3" /></button>
            {access && <div className="absolute right-0 top-10 z-40 w-[320px] bg-panel border border-line rounded-md shadow-xl p-3 text-[12.5px]" onMouseLeave={() => setAccess(false)}>
              <div className="font-bold text-ink">Your access</div>
              <div className="text-ink2 mt-1">Role: <b className="text-ink">{p.title}</b></div>
              <div className="text-ink2">Scope: <b className="text-ink">{scope}</b></div>
              <div className="text-ink2 mt-1">This dashboard answers: {p.focus}</div>
              <div className="flex flex-wrap gap-1 mt-2">{p.can.map(c => <span key={c} className="text-[11px] border border-line rounded px-1.5 py-0.5 text-ink2 bg-chip/50">{c}</span>)}</div>
              <div className="text-[11px] text-ink3 mt-2">Other roles' dashboards are not visible to this account.{p.region ? ` Every list and drill-down stays inside ${p.region}.` : ''}</div>
            </div>}
          </div>
          <button onClick={() => setPaused(!paused)} title={paused ? 'Resume live updates' : 'Pause live updates'} className={cx('h-8 px-2.5 rounded-md border text-[12px] font-bold inline-flex items-center gap-1.5', paused ? 'border-warn/40 text-warn bg-warn/10' : 'border-ok/40 text-ok bg-ok/10')}>
            {paused ? <I.Pause size={13} /> : <span className="relative w-2 h-2"><span className="absolute inset-0 rounded-full bg-ok animate-ping opacity-60" /><span className="absolute inset-0 rounded-full bg-ok" /></span>}{paused ? 'PAUSED' : 'LIVE'}<span className="font-normal text-ink3 hidden sm:inline">· {hhmmss(ed.at)} CT</span>
          </button>
          <div className="inline-flex items-center h-8 rounded-md border border-line overflow-hidden text-[12px]" role="group" aria-label="Live data speed">{[1, 5, 10].map(x => <button key={x} onClick={() => setSpeed(x)} className={cx('px-2 h-full font-semibold', speed === x ? 'bg-ink text-canvas' : 'text-ink2 hover:bg-chip')}>{x}×</button>)}</div>
          <button onClick={pdf} disabled={busy} className="h-8 px-2.5 rounded-md border border-line hover:bg-chip text-ink text-[12.5px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"><I.FileDown size={14} />{busy ? 'Preparing…' : 'Export PDF'}</button>
          <button onClick={onOut} className="h-8 px-2.5 rounded-md border border-line hover:bg-chip font-semibold text-ink text-[12.5px] inline-flex items-center gap-1.5"><I.LogOut size={14} />Sign out</button>
        </div>
      </header>

      <div className="max-w-[1440px] mx-auto px-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-3 pt-4">
          <div className="inline-flex rounded-md border border-line overflow-hidden text-[13px] bg-panel" role="tablist">{VIEWS.map(([k, l]) => <button key={k} role="tab" aria-selected={period === k} onClick={() => setPeriod(k)} className={cx('px-3 h-9 font-semibold', period === k ? 'bg-ink text-canvas' : 'text-ink hover:bg-chip')}>{l}</button>)}</div>
          <span className="text-[12.5px] text-ink2">{period === 'daily' ? `${longDate(ed.at)} · refreshes every ${(6 / speed).toFixed(speed === 1 ? 0 : 1)} s` : ed.range}</span>
          <span className="flex-1" />
          <button onClick={() => go({ t: 'set', k: 'all', ...(p.region ? { region: p.region } : {}) })} className="h-9 px-3 rounded-md border border-line bg-panel hover:bg-chip text-[12.5px] font-semibold text-ink inline-flex items-center gap-1.5"><I.Layers size={14} />Explore {p.region ? `all ${p.region} branches` : 'all 900 branches'}</button>
        </div>

        <section id="summary" className="mt-4 bg-panel border border-line rounded-md p-4 sm:p-5 border-l-4 border-l-brand">
          <div className="flex flex-wrap items-center gap-2">
            {ed.status ? <span className={cx('text-[11.5px] font-bold px-2 py-0.5 rounded border', STATUS_PILL[ed.status.kind])}>Network status: {ed.status.word}</span> : <span className="text-[11.5px] font-bold px-2 py-0.5 rounded border border-line text-ink2 bg-chip">{ed.label}</span>}
            <span className="text-[12px] text-ink3">{p.title} · {scope}</span>
          </div>
          <h1 className="text-[22px] sm:text-[26px] font-bold text-ink leading-tight mt-2" style={DISPLAY}>{ed.headline}</h1>
          <p className="text-[14.5px] text-ink2 leading-snug mt-1">{ed.deck}</p>
          <button onClick={() => go(ed.focusGo)} className="mt-2 text-left text-[13px] text-ink2 hover:text-ink group flex items-start gap-1.5"><I.Sparkles size={14} className="mt-[2px] text-brand shrink-0" /><span><b className="text-ink">Spotlight:</b> <span className="group-hover:underline">{ed.inFocus}</span></span></button>
        </section>

        <div id="kpis" className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4">{ed.numbers.map(x => (
          <button key={x.label} onClick={() => go(x.go)} className="text-left bg-panel border border-line rounded-md p-4 hover:border-ink3 group">
            <div className="text-[12.5px] text-ink2 flex items-start gap-1"><span className="flex-1">{x.label}</span><I.ChevronRight size={14} className="text-ink3 group-hover:text-brand" /></div>
            <div key={x.value} className={cx('text-[32px] font-bold leading-none tabular-nums mt-2 num-flash', TONE[x.tone] || 'text-ink')} style={DISPLAY}>{x.value}</div>
          </button>))}</div>

        <div className="grid lg:grid-cols-3 gap-4 mt-4">
            <Card id="attention" title="Needs attention" icon={I.AlertTriangle}>
              <ul className="space-y-1 -my-1">{ed.fixes.map((t, i) => <li key={i}><button onClick={() => go(ed.fixesGo[i])} className="w-full text-left flex gap-2 text-[13.5px] text-ink leading-snug py-1.5 -mx-1 px-1 rounded hover:bg-chip/60 group"><I.CircleAlert size={15} className="mt-[2px] shrink-0 text-warn" /><span className="flex-1 group-hover:underline decoration-ink/30">{t}</span><I.ChevronRight size={14} className="mt-[3px] shrink-0 text-ink3" /></button></li>)}</ul>
            </Card>
            <Card id="going-well" title="Going well" icon={I.CheckCircle2}>
              <ul className="space-y-1 -my-1">{ed.wins.map((t, i) => <li key={i}><button onClick={() => go(ed.winsGo[i])} className="w-full text-left flex gap-2 text-[13.5px] text-ink leading-snug py-1.5 -mx-1 px-1 rounded hover:bg-chip/60 group"><I.Check size={15} className="mt-[2px] shrink-0 text-ok" strokeWidth={3} /><span className="flex-1 group-hover:underline decoration-ink/30">{t}</span><I.ChevronRight size={14} className="mt-[3px] shrink-0 text-ink3" /></button></li>)}</ul>
            </Card>
            <Card id="coming-up" title={AHEAD[period]} icon={I.CalendarClock}>
              {ed.agenda.length ? <ol className="divide-y divide-line -my-2">{ed.agenda.map((x, i) => <li key={i}><button onClick={() => go(x.go)} className="w-full text-left grid grid-cols-[88px_minmax(0,1fr)_14px] gap-2 py-2 text-[12.5px] hover:bg-chip/60 group"><span className={cx('font-semibold tabular-nums', x.late ? 'text-bad' : 'text-ink')}>{x.when}<span className="block text-[11px] font-normal text-ink3">{x.kind}</span></span><span className="text-ink leading-snug group-hover:underline decoration-ink/30">{x.what}</span><I.ChevronRight size={14} className="mt-[2px] text-ink3" /></button></li>)}</ol> : <p className="text-[13px] text-ink3">Nothing scheduled that needs this role.</p>}
            </Card>
        </div>

        <div className="mt-4"><ChartCards visuals={ed.visuals} go={go} /></div>

        <div className="grid xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4 mt-4">
          <div className="min-w-0">
            <div id="insights" className="grid md:grid-cols-2 gap-4">{ed.stories.map((x, i) => <Insight key={i} x={x} go={go} onOpen={() => setOpen(x)} />)}</div>
            {ed.inBrief.length > 0 && <Card title="More insights" icon={I.Lightbulb} className="mt-4">
              <ul className="divide-y divide-line -my-2">{ed.inBrief.map((x, i) => <li key={i}><button onClick={() => setOpen(x)} className="w-full text-left py-2 group flex items-start gap-2"><span className="min-w-0 flex-1"><Kicker className="text-[10.5px]">{x.kicker}</Kicker><span className="block text-[14px] font-semibold text-ink leading-snug group-hover:underline">{x.sum.title}</span></span><I.ChevronRight size={14} className="mt-[14px] text-ink3" /></button></li>)}</ul>
            </Card>}
          </div>
          <Card id="activity" title="Live activity" icon={I.Activity} right={<span className="text-[11px] text-ink3">{paused ? 'paused' : 'streaming'} · your role's events</span>}>
            <Activity p={p} go={go} ver={ver} />
          </Card>
        </div>
        <footer className="mt-8 pt-3 border-t border-line text-[11.5px] text-ink3 text-center">Role-based access: this dashboard shows only what the {p.title} role can see. Every number comes from the same live data as the console; click any number, chart, insight or event to see the detail behind it.</footer>
      </div>
      {open && <InsightDetail x={open} go={go} onClose={() => setOpen(null)} />}
      {drill.length > 0 && <DrillPanel stack={drill} setStack={setDrill} now={ed.at} scope={p.region} snap={ed.snap} />}
    </div>
  );
}

export default function DashboardsApp() {
  const [who, setWho] = useState(load());
  const p = who && personaById(who);
  return (
    <div className="force-light min-h-screen text-ink bg-canvas" style={APTOS}>
      {p ? <Dash key={p.id} p={p} onOut={() => { save(null); setWho(null); }} /> : <SignIn onIn={id => { save(id); setWho(id); }} />}
    </div>
  );
}
