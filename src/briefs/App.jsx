// The briefs page: sign in with a demo account, then read your own edition like a newspaper front page, and
// download the daily, weekly or monthly edition as a PDF. Each account sees only its own edition (role-based access).
import React, { useEffect, useMemo, useState } from 'react';
import * as I from 'lucide-react';
import { useApp } from '../store.jsx';
import { useLive } from '../live.jsx';
import { AskBlock } from '../askblocks.jsx';
import { cx, RoofMark } from '../ui.jsx';
import { PERSONAS, personaById } from './personas.js';
import { compose } from './compose.js';
import { downloadEdition } from './pdf.js';
import { Scene, StoryArt, BranchMap, WEATHER_ICON, TONES } from './art.jsx';
import { hhmm } from '../util.js';
import { APP_NAME } from '../edition.js';

const KEY = 'srs-brief-user';
const load = () => { try { return sessionStorage.getItem(KEY); } catch { return null; } };
const save = v => { try { v ? sessionStorage.setItem(KEY, v) : sessionStorage.removeItem(KEY); } catch { } };
const serif = { fontFamily: 'Georgia, "Times New Roman", Times, serif' };
const head = { fontFamily: '"Playfair Display", Georgia, "Times New Roman", serif' };
const plate = { fontFamily: '"UnifrakturMaguntia", "Old English Text MT", Georgia, serif', fontWeight: 400 };
const TONE = { ok: 'text-ok', warn: 'text-warn', bad: 'text-bad', info: 'text-info' };
// icons named by compose.js for the numbers; listed here so the page carries only the icons it uses
const NUM_ICON = { Activity: I.Activity, AlarmClock: I.AlarmClock, ArrowLeftRight: I.ArrowLeftRight, Cable: I.Cable, CircleCheck: I.CircleCheck, ClipboardCheck: I.ClipboardCheck, Cpu: I.Cpu, DoorClosed: I.DoorClosed, GitCompare: I.GitCompare, Hand: I.Hand, HardDrive: I.HardDrive, Inbox: I.Inbox, ListChecks: I.ListChecks, ShieldAlert: I.ShieldAlert, Sparkles: I.Sparkles, Store: I.Store, Timer: I.Timer, WifiOff: I.WifiOff };
const KIND = { Change: I.Wrench, Decision: I.ListChecks, Visit: I.Truck, Carrier: I.Cable, Project: I.Building2, Freeze: I.Snowflake, Prevent: I.Telescope };
const longDate = t => new Date(t).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Chicago' });
const dayNo = t => Math.floor((t - Date.UTC(new Date(t).getUTCFullYear(), 0, 0)) / 864e5);
const Kicker = ({ children, className }) => <div className={cx('text-[10.5px] font-bold tracking-[0.16em] uppercase text-brand', className)}>{children}</div>;
// column rules between stories, drawn in the gap so every column is the same width
const SEP_SM = "sm:before:content-[''] sm:before:absolute sm:before:-left-6 sm:before:inset-y-0 sm:before:w-px sm:before:bg-line", SEP_XL = "xl:before:content-[''] xl:before:absolute xl:before:-left-6 xl:before:inset-y-0 xl:before:w-px xl:before:bg-line";
const Section = ({ children, className }) => <div className={cx('text-[12px] font-bold tracking-[0.14em] uppercase text-ink border-b-2 border-ink pb-1', className)}>{children}</div>;

function SignIn({ onIn }) {
  const [u, setU] = useState(''), [pw, setPw] = useState(''), [err, setErr] = useState('');
  const go = e => { e.preventDefault(); const p = PERSONAS.find(x => x.user === u.trim().toLowerCase() && x.password === pw); if (p) onIn(p.id); else setErr('That username and password do not match a demo account.'); };
  return (
    <div className="max-w-[980px] mx-auto px-4 py-10">
      <div className="text-center border-b-[3px] border-double border-ink pb-4">
        <div className="text-[11px] font-bold tracking-[0.18em] text-ink3 uppercase">SRS {APP_NAME}</div>
        <h1 className="text-[48px] sm:text-[64px] text-ink leading-none mt-2" style={plate}>The Morning Brief</h1>
        <p className="text-[15px] text-ink2 mt-3" style={serif}>Your network news in two minutes, written for your role at the start of the day. Sign in to read your edition.</p>
      </div>
      <div className="grid md:grid-cols-[minmax(0,340px)_minmax(0,1fr)] gap-8 mt-8">
        <form onSubmit={go} className="space-y-3">
          <div className="text-[13px] font-bold text-ink">Sign in</div>
          <label className="block text-[12px] text-ink2">Username<input value={u} onChange={e => { setU(e.target.value); setErr(''); }} autoComplete="username" className="mt-1 w-full h-10 px-3 rounded-md border border-line bg-panel text-ink text-[14px] outline-none focus:border-ink3" /></label>
          <label className="block text-[12px] text-ink2">Password<input type="password" value={pw} onChange={e => { setPw(e.target.value); setErr(''); }} autoComplete="current-password" className="mt-1 w-full h-10 px-3 rounded-md border border-line bg-panel text-ink text-[14px] outline-none focus:border-ink3" /></label>
          {err && <div className="text-[12.5px] text-bad">{err}</div>}
          <button type="submit" className="h-10 w-full rounded-md bg-brand text-white font-bold text-[14px] hover:brightness-110">Sign in</button>
          <p className="text-[11.5px] text-ink3 leading-snug">Demo accounts only. This page holds sample data and the passwords are shown here, so the sign-in shows how access is split by role; it is not a security control.</p>
        </form>
        <div>
          <div className="text-[13px] font-bold text-ink mb-2">Demo accounts <span className="font-normal text-ink3">– click one to fill the form</span></div>
          <div className="border border-line rounded-md overflow-hidden bg-panel">
            <table className="w-full text-[12.5px]"><thead><tr className="text-left text-ink3 border-b border-line"><th className="px-3 py-2 font-semibold">Role</th><th className="px-3 py-2 font-semibold">Username</th><th className="px-3 py-2 font-semibold">Password</th></tr></thead>
              <tbody>{PERSONAS.map(p => <tr key={p.id} onClick={() => { setU(p.user); setPw(p.password); setErr(''); }} className="border-b border-line/60 last:border-0 cursor-pointer hover:bg-chip/60"><td className="px-3 py-2"><div className="font-semibold text-ink">{p.title}</div><div className="text-[11.5px] text-ink3">{p.name}</div></td><td className="px-3 py-2 font-mono text-ink">{p.user}</td><td className="px-3 py-2 font-mono text-ink">{p.password}</td></tr>)}</tbody></table>
          </div>
        </div>
      </div>
    </div>
  );
}

// the whole answer behind a story, for readers who want the detail
function FullStory({ x, onClose }) {
  useEffect(() => { const k = e => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);
  return (
    <div className="fixed inset-0 z-50 bg-black/45 flex items-start justify-center p-3 sm:p-8 overflow-y-auto" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={x.sum.title} className="w-full max-w-[860px] rounded-md shadow-2xl p-5 sm:p-7" style={{ background: '#fbfaf6' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0"><Kicker>{x.kicker}</Kicker><h2 className="text-[26px] font-bold text-ink leading-tight mt-1" style={head}>{x.sum.title}</h2></div>
          <button onClick={onClose} aria-label="Close" className="h-9 w-9 shrink-0 rounded-md border border-line hover:bg-chip grid place-items-center text-ink"><I.X size={16} /></button>
        </div>
        {x.a.lead && <p className="text-[15px] text-ink2 leading-relaxed mt-2" style={serif}>{x.a.lead}</p>}
        <div className="space-y-2 mt-3 text-[12.5px]">{(x.a.blocks || []).map((k, j) => <AskBlock key={j} k={k} maxRows={12} />)}</div>
        {x.a.src && <div className="text-[11px] text-ink3 italic mt-3">Source: {x.a.src}</div>}
      </div>
    </div>
  );
}

function Story({ x, onOpen, className }) {
  const { sum } = x;
  return (
    <article className={cx('min-w-0', className)}>
      <button onClick={onOpen} className="block w-full text-left group">
        <figure><StoryArt kicker={x.kicker} className="w-full h-auto block border border-ink/15" role="img" aria-label={x.kicker} /></figure>
        <Kicker className="mt-3">{x.kicker}</Kicker>
        <h3 className="text-[20px] font-bold text-ink leading-snug mt-1 group-hover:underline decoration-1 underline-offset-2" style={head}>{sum.title}</h3>
      </button>
      {sum.line && <p className="text-[14.5px] text-ink2 leading-relaxed mt-1.5" style={serif}>{sum.line}</p>}
      {sum.stats.length > 0 && <div className="flex gap-4 mt-2.5">{sum.stats.map(s => <div key={s.label} className="min-w-0"><div className={cx('font-bold leading-none tabular-nums whitespace-nowrap', s.value.length > 6 ? 'text-[17px]' : 'text-[22px]', TONE[s.tone] || 'text-ink')} style={head}>{s.value}</div><div className="text-[11px] text-ink3 mt-0.5 leading-tight">{s.label}</div></div>)}</div>}
      {sum.bars && <div className="mt-2.5 space-y-1.5">{sum.bars.items.map(b => { const mx = sum.bars.max || Math.max(1, ...sum.bars.items.map(v => v.value)); return <div key={b.label} className="text-[11.5px]"><div className="flex justify-between gap-2 text-ink2"><span className="truncate">{b.label}</span><b className="text-ink tabular-nums">{b.display ?? b.value}</b></div><div className="h-1.5 bg-ink/10 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.max(3, b.value / mx * 100)}%`, background: TONES[b.tone] || TONES.info }} /></div></div>; })}</div>}
      {sum.points.length > 0 && <ul className="mt-2.5 space-y-1 text-[12.5px] text-ink2">{sum.points.map((p, i) => <li key={i} className="flex gap-2"><span className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: TONES[p.tone] || '#16191D' }} /><span className="min-w-0">{p.b && <b className="text-ink font-semibold">{p.b}</b>}{p.b && p.t ? ' – ' : ''}{p.t}</span></li>)}</ul>}
      <button onClick={onOpen} className="mt-2.5 text-[12.5px] font-semibold text-brand hover:underline inline-flex items-center gap-1">Read the full story<I.ArrowRight size={13} /></button>
    </article>
  );
}

function Edition({ p, onOut }) {
  const { s } = useApp(); const { L } = useLive();
  const [period, setPeriod] = useState('daily');
  const [ver, setVer] = useState(0);
  const [busy, setBusy] = useState('');
  const [open, setOpen] = useState(null);
  // an edition is printed once and stays still while you read it; Refresh prints a new one from live data
  const ed = useMemo(() => compose(p, s, Date.now(), L, period), [p.id, period, ver]);
  const pdf = async per => { setBusy(per); try { await downloadEdition(per === period ? ed : compose(p, s, Date.now(), L, per)); } finally { setBusy(''); } };
  const W = WEATHER_ICON[ed.weather.kind];
  const shown = ed.map.points.filter(x => x.in), cnt = t => shown.filter(x => x.tone === t).length;
  return (
    <div className="max-w-[1240px] mx-auto px-4 sm:px-6 pb-12">
      <div className="flex items-center gap-3 py-2 border-b border-line text-[12px] text-ink2">
        <RoofMark size={26} /><span className="font-bold tracking-[0.12em] uppercase text-ink3 text-[10.5px] hidden sm:inline">SRS {APP_NAME}</span>
        <span className="flex-1" />
        <span className="hidden md:inline">Signed in as <b className="text-ink">{p.name}</b>, {p.title}</span>
        <button onClick={onOut} className="h-8 px-3 rounded-md border border-line hover:bg-chip font-semibold text-ink inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"><I.LogOut size={14} />Sign out</button>
      </div>

      {/* masthead: weather ear, nameplate, edition ear, dateline */}
      <header className="pt-4">
        <div className="grid grid-cols-1 md:grid-cols-[180px_minmax(0,1fr)_180px] items-center gap-3">
          <div className="hidden md:flex items-center gap-2.5 border border-ink/70 p-2"><W size={30} className="text-warn shrink-0" /><div className="leading-tight"><div className="text-[10px] font-bold tracking-[0.14em] uppercase text-ink3">Network weather</div><div className="text-[14px] font-bold text-ink" style={serif}>{ed.weather.word}</div><div className="text-[11px] text-ink3">{ed.weather.line}</div></div></div>
          <h1 className="text-center text-[44px] sm:text-[64px] lg:text-[76px] text-ink leading-none" style={plate}>The {ed.label}</h1>
          <div className="hidden md:block border border-ink/70 p-2 text-right leading-tight"><div className="text-[10px] font-bold tracking-[0.14em] uppercase text-ink3">Edition for</div><div className="text-[14px] font-bold text-ink" style={serif}>{p.title}</div><div className="text-[11px] text-ink3">A two-minute read</div></div>
        </div>
        <div className="mt-3 border-y-[3px] border-double border-ink py-1.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11.5px] uppercase tracking-[0.1em] text-ink">
          <span>Vol. I · No. {dayNo(ed.at)}</span>
          <span className="font-bold">{period === 'daily' ? longDate(ed.at) : ed.range}</span>
          <span className="inline-flex items-center gap-3">Printed {hhmm(ed.at)} CT<button onClick={() => setVer(v => v + 1)} className="normal-case tracking-normal text-info hover:underline inline-flex items-center gap-1"><I.RefreshCw size={12} />Refresh</button></span>
        </div>
        <div className="md:hidden flex items-center gap-2 py-2 border-b border-line text-[12.5px]"><W size={20} className="text-warn" /><b className="text-ink">{ed.weather.word}</b><span className="text-ink3">– {ed.weather.line}</span></div>
      </header>

      <div className="flex flex-wrap items-center gap-2 py-3">
        <div className="inline-flex rounded-md border border-ink/40 overflow-hidden text-[13px]" role="tablist">{[['daily', 'Today'], ['weekly', 'This week'], ['monthly', 'This month']].map(([k, l]) => <button key={k} role="tab" aria-selected={period === k} onClick={() => setPeriod(k)} className={cx('px-3 h-9 font-semibold', period === k ? 'bg-ink text-canvas' : 'text-ink hover:bg-chip')}>{l}</button>)}</div>
        <span className="flex-1" />
        <span className="text-[12px] text-ink3 mr-1">Download PDF</span>
        {[['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly']].map(([k, l]) => <button key={k} onClick={() => pdf(k)} disabled={!!busy} className="h-9 px-3 rounded-md border border-ink/40 bg-panel hover:bg-chip text-ink text-[13px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"><I.FileDown size={15} />{busy === k ? 'Preparing…' : l}</button>)}
      </div>

      {/* front page */}
      <div className="grid lg:grid-cols-[minmax(0,1fr)_300px] gap-x-8 gap-y-6 border-t border-ink pt-5">
        <section className="min-w-0">
          <h2 className="text-[34px] sm:text-[46px] font-black text-ink leading-[1.05]" style={head}>{ed.headline}</h2>
          <p className="text-[18px] sm:text-[20px] text-ink2 italic leading-snug mt-3" style={serif}>{ed.deck}</p>
          <figure className="mt-4">
            <Scene weather={ed.weather.kind} sign={ed.pic.sign} badge={ed.pic.badge} className="w-full h-auto block border border-ink/20" role="img" aria-label="Illustration: a row of branches under today's network weather" />
            <figcaption className="text-[12.5px] text-ink2 mt-1.5 leading-snug border-b border-line pb-2" style={serif}>{ed.pic.caption} <span className="text-ink3 italic">Illustration: Mova iO</span></figcaption>
          </figure>
          <div className="mt-4">
            <div className="text-[12px] font-bold tracking-[0.14em] uppercase text-ink mb-2">What you need to know</div>
            <ul className="grid sm:grid-cols-3 gap-4">{ed.know.map((t, i) => <li key={i} className="text-[15px] text-ink leading-snug border-t-2 border-brand pt-2" style={serif}>{t}</li>)}</ul>
          </div>
        </section>
        <aside className="space-y-6 lg:border-l lg:border-line lg:pl-8">
          <div>
            <Section className="mb-3">At a glance</Section>
            <div className="grid grid-cols-2 gap-x-4 gap-y-4">{ed.numbers.map(x => { const Ic = NUM_ICON[x.icon] || I.Circle; return <div key={x.label}><Ic size={18} className={TONE[x.tone] || 'text-ink2'} /><div className={cx('text-[30px] font-black leading-none tabular-nums mt-1', TONE[x.tone] || 'text-ink')} style={head}>{x.value}</div><div className="text-[12px] text-ink2 mt-1 leading-tight">{x.label}</div></div>; })}</div>
          </div>
          <div>
            <Section className="mb-1">{period === 'daily' ? 'Your day' : 'Coming up'}</Section>
            {ed.agenda.length ? <ol className="divide-y divide-line">{ed.agenda.map((x, i) => { const Ic = KIND[x.kind] || I.Clock; return <li key={i} className="flex gap-2.5 py-2"><span className={cx('h-7 w-7 shrink-0 rounded-full grid place-items-center', x.late ? 'bg-bad/15 text-bad' : 'bg-ink/[0.07] text-ink2')}><Ic size={14} /></span><span className="min-w-0"><span className={cx('block text-[11.5px] font-bold', x.late ? 'text-bad' : 'text-ink3')}>{x.when} · {x.kind}</span><span className="block text-[13px] text-ink leading-snug line-clamp-2">{x.what}</span></span></li>; })}</ol> : <p className="text-[13px] text-ink3 pt-2" style={serif}>Nothing on your calendar that needs you today.</p>}
          </div>
        </aside>
      </div>

      {/* inside pages */}
      <div className="mt-8 border-t-[3px] border-double border-ink pt-2">
        <div className="text-[12px] font-bold tracking-[0.14em] uppercase text-ink mb-4">Inside this edition</div>
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-x-12 gap-y-8">
          {ed.stories.map((x, i) => <Story key={i} x={x} onOpen={() => setOpen(x)} className={cx('relative', i % 2 === 1 && SEP_SM, i > 0 && SEP_XL)} />)}
        </div>
      </div>

      <div className="mt-8 border-t border-ink pt-4 grid lg:grid-cols-[minmax(0,1fr)_340px] gap-x-8 gap-y-6">
        <figure className="min-w-0">
          <div className="text-[12px] font-bold tracking-[0.14em] uppercase text-ink mb-2">Where the trouble is</div>
          <BranchMap points={ed.map.points} focus={ed.map.focus} className="w-full h-auto block border border-ink/15" role="img" aria-label="Map of branches by status" />
          <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink2">
            {[['bad', 'Offline'], ['warn', 'Open with a problem'], ['info', 'On backup line'], ['ok', 'Trading normally']].map(([t, l]) => <span key={t} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: t === 'ok' ? '#9c9483' : TONES[t] }} />{l} <b className="text-ink tabular-nums">{cnt(t)}</b></span>)}
          </figcaption>
        </figure>
        <aside className="lg:border-l lg:border-line lg:pl-8 space-y-5">
          {ed.inBrief.length > 0 && <div>
            <Section className="mb-1">In brief</Section>
            <ul className="divide-y divide-line">{ed.inBrief.map((x, i) => <li key={i}><button onClick={() => setOpen(x)} className="w-full text-left py-2 group"><Kicker>{x.kicker}</Kicker><span className="block text-[15px] font-bold text-ink leading-snug group-hover:underline" style={head}>{x.sum.title}</span></button></li>)}</ul>
          </div>}
          <div className="bg-ink/[0.04] p-3">
            <div className="text-[10.5px] font-bold tracking-[0.14em] uppercase text-ink3 mb-1">Your edition covers</div>
            <p className="text-[13px] text-ink2 italic mb-2" style={serif}>{p.focus}</p>
            <div className="flex flex-wrap gap-1">{p.can.map(c => <span key={c} className="text-[11px] border border-line rounded px-1.5 py-0.5 text-ink2 bg-panel">{c}</span>)}</div>
          </div>
        </aside>
      </div>
      <footer className="mt-8 pt-3 border-t border-ink text-[11.5px] text-ink3 text-center">Sample data; branch names, figures and incidents are illustrative. Every number comes from the same data as the console.</footer>
      {open && <FullStory x={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

export default function BriefsApp() {
  const [who, setWho] = useState(load());
  const p = who && personaById(who);
  return (
    <div className="force-light min-h-screen text-ink" style={{ background: '#f7f5ef' }}>
      {p ? <Edition key={p.id} p={p} onOut={() => { save(null); setWho(null); }} /> : <SignIn onIn={id => { save(id); setWho(id); }} />}
    </div>
  );
}
