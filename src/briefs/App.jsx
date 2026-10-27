// The briefs page: sign in with a demo account, then read your own edition like a newspaper, and download the
// daily, weekly or monthly edition as a PDF. Each account sees only its own edition (role-based access).
import React, { useEffect, useMemo, useState } from 'react';
import * as I from 'lucide-react';
import { useApp } from '../store.jsx';
import { useLive } from '../live.jsx';
import { AskBlock } from '../askblocks.jsx';
import { cx, RoofMark } from '../ui.jsx';
import { PERSONAS, personaById } from './personas.js';
import { compose } from './compose.js';
import { downloadEdition } from './pdf.js';
import { hhmm } from '../util.js';
import { APP_NAME } from '../edition.js';
import { DrillPanel } from './Drill.jsx';
import { Picture } from './Picture.jsx';

const KEY = 'srs-brief-user';
const load = () => { try { return sessionStorage.getItem(KEY); } catch { return null; } };
const save = v => { try { v ? sessionStorage.setItem(KEY, v) : sessionStorage.removeItem(KEY); } catch { } };
// Aptos where it is installed (Windows and Microsoft 365); the nearest system sans elsewhere
const APTOS = { fontFamily: 'Aptos, "Segoe UI", "Helvetica Neue", Arial, sans-serif' };
const DISPLAY = { fontFamily: '"Aptos Display", Aptos, "Segoe UI", "Helvetica Neue", Arial, sans-serif' };
const TONE = { ok: 'text-ok', warn: 'text-warn', bad: 'text-bad', info: 'text-info' };
const BAR = { ok: '#2E8540', warn: '#C46A00', bad: '#C62A1E', info: '#2F6DB5' };
const longDate = t => new Date(t).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Chicago' });
const Kicker = ({ children, className }) => <div className={cx('text-[11px] font-bold tracking-[0.12em] uppercase text-brand', className)}>{children}</div>;
const Section = ({ children, className }) => <div className={cx('text-[12px] font-bold tracking-[0.12em] uppercase text-ink border-b-2 border-ink pb-1', className)}>{children}</div>;

function SignIn({ onIn }) {
  const [u, setU] = useState(''), [pw, setPw] = useState(''), [err, setErr] = useState('');
  const go = e => { e.preventDefault(); const p = PERSONAS.find(x => x.user === u.trim().toLowerCase() && x.password === pw); if (p) onIn(p.id); else setErr('That username and password do not match a demo account.'); };
  return (
    <div className="max-w-[980px] mx-auto px-4 py-10">
      <div className="text-center border-b-2 border-ink pb-4">
        <div className="text-[11px] font-bold tracking-[0.18em] text-ink3 uppercase">SRS {APP_NAME}</div>
        <h1 className="text-[44px] font-bold text-ink leading-none mt-2" style={DISPLAY}>The Morning Brief</h1>
        <p className="text-[15px] text-ink2 mt-2">Your network news in two minutes, written for your role at the start of the day. Sign in to read your edition.</p>
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
              <tbody>{PERSONAS.map(p => <tr key={p.id} onClick={() => { setU(p.user); setPw(p.password); setErr(''); }} className="border-b border-line/60 last:border-0 cursor-pointer hover:bg-chip/60"><td className="px-3 py-2 font-semibold text-ink">{p.title}</td><td className="px-3 py-2 font-mono text-ink">{p.user}</td><td className="px-3 py-2 font-mono text-ink">{p.password}</td></tr>)}</tbody></table>
          </div>
        </div>
      </div>
    </div>
  );
}

// the whole answer behind a story, for readers who want the detail
function FullStory({ x, onClose, go }) {
  useEffect(() => { const k = e => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);
  return (
    <div className="fixed inset-0 z-50 bg-black/45 flex items-start justify-center p-3 sm:p-8 overflow-y-auto" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={x.sum.title} className="w-full max-w-[860px] rounded-md shadow-2xl p-5 sm:p-7" style={{ background: '#fbfaf6' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0"><Kicker>{x.kicker}</Kicker><h2 className="text-[24px] font-bold text-ink leading-tight mt-1" style={DISPLAY}>{x.sum.title}</h2></div>
          <button onClick={onClose} aria-label="Close" className="h-9 w-9 shrink-0 rounded-md border border-line hover:bg-chip grid place-items-center text-ink"><I.X size={16} /></button>
        </div>
        {x.a.lead && <p className="text-[14.5px] text-ink2 leading-relaxed mt-2">{x.a.lead}</p>}
        {x.go && <button onClick={() => go(x.go)} className="mt-3 h-9 px-3 rounded-md bg-brand text-white text-[13px] font-semibold inline-flex items-center gap-1.5 hover:brightness-110"><I.Layers size={15} />Explore the detail<I.ArrowRight size={14} /></button>}
        <div className="space-y-2 mt-3 text-[12.5px]">{(x.a.blocks || []).map((k, j) => <AskBlock key={j} k={k} maxRows={12} go={r => go(r.inc ? { t: 'incident', id: r.inc } : { t: 'branch', id: r.branch })} />)}</div>
        <p className="text-[11.5px] text-ink3 mt-2">Click a branch or incident in the tables to open its full picture.</p>
        {x.a.src && <div className="text-[11px] text-ink3 italic mt-3">Source: {x.a.src}</div>}
      </div>
    </div>
  );
}

function Story({ x, onOpen, go }) {
  const { sum } = x;
  return (
    <article className="break-inside-avoid mb-7 border-t border-ink/70 pt-2">
      <Kicker>{x.kicker}</Kicker>
      <h3 className="text-[19px] font-bold text-ink leading-snug mt-1" style={DISPLAY}>{sum.title}</h3>
      {sum.line && <p className="text-[14px] text-ink2 leading-relaxed mt-1">{sum.line}</p>}
      {sum.stats.length > 0 && <div className="flex gap-5 mt-2">{sum.stats.map(s => <div key={s.label} role="button" tabIndex={0} onClick={() => go(x.go)} className="min-w-0 cursor-pointer hover:opacity-80"><div className={cx('font-bold leading-none tabular-nums whitespace-nowrap', s.value.length > 6 ? 'text-[17px]' : 'text-[21px]', TONE[s.tone] || 'text-ink')} style={DISPLAY}>{s.value}</div><div className="text-[11px] text-ink3 mt-0.5 leading-tight">{s.label}</div></div>)}</div>}
      {sum.bars && <div className="mt-2 space-y-1.5">{sum.bars.items.map(b => { const mx = sum.bars.max || Math.max(1, ...sum.bars.items.map(v => v.value)); return <div key={b.label} className="text-[11.5px]"><div className="flex justify-between gap-2 text-ink2"><span className="truncate">{b.label}</span><b className="text-ink tabular-nums">{b.display ?? b.value}</b></div><div className="h-1.5 bg-ink/10 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.max(3, b.value / mx * 100)}%`, background: BAR[b.tone] || BAR.info }} /></div></div>; })}</div>}
      {sum.points.length > 0 && <ul className="mt-2 space-y-1 text-[12.5px] text-ink2">{sum.points.map((p, i) => <li key={i} className="flex gap-2"><span className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: BAR[p.tone] || '#16191D' }} /><span className="min-w-0">{p.b && <b className="text-ink font-semibold">{p.b}</b>}{p.b && p.t ? ' – ' : ''}{p.t}</span></li>)}</ul>}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1"><button onClick={onOpen} className="text-[12.5px] font-semibold text-brand hover:underline inline-flex items-center gap-1">Read the full story<I.ArrowRight size={13} /></button>{x.go && <button onClick={() => go(x.go)} className="text-[12.5px] font-semibold text-info hover:underline inline-flex items-center gap-1"><I.Layers size={13} />Explore the detail</button>}</div>
    </article>
  );
}

function Edition({ p, onOut }) {
  const { s } = useApp(); const { L } = useLive();
  const [period, setPeriod] = useState('daily');
  const [ver, setVer] = useState(0);
  const [busy, setBusy] = useState('');
  const [open, setOpen] = useState(null);
  const [drill, setDrill] = useState([]);
  const go = node => { if (node) { setOpen(null); setDrill([node]); } };
  // an edition is printed once and stays still while you read it; Refresh prints a new one from live data
  const ed = useMemo(() => compose(p, s, Date.now(), L, period), [p.id, period, ver]);
  const pdf = per => { setBusy(per); setTimeout(() => { try { downloadEdition(per === period ? ed : compose(p, s, Date.now(), L, per)); } finally { setBusy(''); } }, 30); };
  return (
    <div className="max-w-[1240px] mx-auto px-4 sm:px-6 pb-12">
      <div className="flex items-center gap-3 py-2 border-b border-line text-[12px] text-ink2">
        <RoofMark size={26} /><span className="font-bold tracking-[0.12em] uppercase text-ink3 text-[10.5px] hidden sm:inline">SRS {APP_NAME}</span>
        <span className="flex-1" />
        <span className="hidden md:inline">Signed in as <b className="text-ink">{p.title}</b></span>
        <button onClick={onOut} className="h-8 px-3 rounded-md border border-line hover:bg-chip font-semibold text-ink inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"><I.LogOut size={14} />Sign out</button>
      </div>
      <header className="text-center pt-5 pb-3 border-b-[3px] border-double border-ink">
        <h1 className="text-[42px] sm:text-[56px] font-bold text-ink leading-none tracking-tight" style={DISPLAY}>The {ed.label}</h1>
        <div className="mt-2 text-[12.5px] text-ink2 flex flex-wrap justify-center gap-x-4 gap-y-1">
          <span className="font-semibold text-ink">{period === 'daily' ? longDate(ed.at) : ed.range}</span><span>Edition for {p.title}</span>{ed.weather && <span>Network weather: <b className="text-ink">{ed.weather.word}</b></span>}<span>Printed {hhmm(ed.at)} CT</span>
          <button onClick={() => setVer(v => v + 1)} className="text-info hover:underline inline-flex items-center gap-1"><I.RefreshCw size={12} />Refresh</button>
          <button onClick={() => go({ t: 'set', k: 'all', ...(p.region ? { region: p.region } : {}) })} className="text-info hover:underline inline-flex items-center gap-1"><I.Layers size={12} />Explore {p.region ? `all ${p.region} branches` : 'all 900 branches'}</button>
        </div>
      </header>
      <div className="flex flex-wrap items-center gap-2 py-3 border-b border-line">
        <div className="inline-flex rounded-md border border-line overflow-hidden text-[13px]" role="tablist">{[['daily', 'Today'], ['weekly', 'This week'], ['monthly', 'This month']].map(([k, l]) => <button key={k} role="tab" aria-selected={period === k} onClick={() => setPeriod(k)} className={cx('px-3 h-9 font-semibold', period === k ? 'bg-ink text-canvas' : 'text-ink hover:bg-chip')}>{l}</button>)}</div>
        <span className="flex-1" />
        <span className="text-[12px] text-ink3 mr-1">Download PDF</span>
        {[['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly']].map(([k, l]) => <button key={k} onClick={() => pdf(k)} disabled={!!busy} className="h-9 px-3 rounded-md border border-line bg-panel hover:bg-chip text-ink text-[13px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"><I.FileDown size={15} />{busy === k ? 'Preparing…' : l}</button>)}
      </div>

      <div className="grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-8 pt-6">
        <section className="min-w-0">
          <Kicker>Lead story</Kicker>
          <h2 className="text-[30px] sm:text-[38px] font-bold text-ink leading-tight mt-1" style={DISPLAY}>{ed.headline}</h2>
          <p className="text-[17px] text-ink2 leading-snug mt-2">{ed.deck}</p>
          <div className="mt-5">
            <div className="grid sm:grid-cols-2 gap-6">
              <div>
                <Section className="mb-3 !border-ok !text-ok">Going well</Section>
                <ul className="space-y-1">{ed.wins.map((t, i) => <li key={i}><button onClick={() => go(ed.winsGo[i])} className="w-full text-left flex gap-2.5 text-[15px] text-ink leading-snug py-1 -mx-1 px-1 rounded hover:bg-ink/[0.05] group"><I.Check size={16} className="mt-[2px] shrink-0 text-ok" strokeWidth={3} /><span className="flex-1 group-hover:underline decoration-ink/30 underline-offset-2">{t}</span><I.ChevronRight size={15} className="mt-[3px] shrink-0 text-ink3 opacity-0 group-hover:opacity-100" /></button></li>)}</ul>
              </div>
              <div>
                <Section className="mb-3 !border-warn !text-warn">To fix</Section>
                <ul className="space-y-1">{ed.fixes.map((t, i) => <li key={i}><button onClick={() => go(ed.fixesGo[i])} className="w-full text-left flex gap-2.5 text-[15px] text-ink leading-snug py-1 -mx-1 px-1 rounded hover:bg-ink/[0.05] group"><I.ArrowRight size={16} className="mt-[2px] shrink-0 text-warn" strokeWidth={2.5} /><span className="flex-1 group-hover:underline decoration-ink/30 underline-offset-2">{t}</span><I.ChevronRight size={15} className="mt-[3px] shrink-0 text-ink3 opacity-0 group-hover:opacity-100" /></button></li>)}</ul>
              </div>
            </div>
          </div>
          <div className="mt-5 border-l-4 border-brand pl-4 py-1">
            <Kicker>In focus</Kicker>
            <p className="text-[15px] text-ink leading-relaxed mt-1">{ed.inFocus}</p>
            <button onClick={() => go(ed.focusGo)} className="mt-1 text-[12.5px] font-semibold text-brand hover:underline inline-flex items-center gap-1">See the detail<I.ArrowRight size={13} /></button>
          </div>
        </section>
        <aside className="space-y-6 min-w-0">
          <div>
            <Section className="mb-3">By the numbers</Section>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">{ed.numbers.map(x => <button key={x.label} onClick={() => go(x.go)} className="text-left rounded-md -mx-1.5 px-1.5 py-1.5 hover:bg-ink/[0.05] group"><div className={cx('text-[30px] font-bold leading-none tabular-nums', TONE[x.tone] || 'text-ink')} style={DISPLAY}>{x.value}</div><div className="text-[12px] text-ink2 mt-1 leading-tight flex items-start gap-0.5"><span className="group-hover:underline">{x.label}</span><I.ChevronRight size={13} className="shrink-0 text-ink3 group-hover:text-brand" /></div></button>)}</div>
          </div>
          <div>
            <Section className="mb-1">{{ daily: 'Your day', weekly: 'Next week', monthly: 'The month ahead' }[period]}</Section>
            {ed.agenda.length ? <ol className="divide-y divide-line">{ed.agenda.map((x, i) => <li key={i}><button onClick={() => go(x.go)} className="w-full text-left grid grid-cols-[92px_minmax(0,1fr)_14px] gap-2 py-2 text-[13px] hover:bg-ink/[0.04] group"><span className={cx('font-semibold tabular-nums', x.late ? 'text-bad' : 'text-ink')}>{x.when}<span className="block text-[11px] font-normal text-ink3">{x.kind}</span></span><span className="text-ink leading-snug group-hover:underline decoration-ink/30">{x.what}</span><I.ChevronRight size={14} className="mt-[2px] text-ink3 opacity-0 group-hover:opacity-100" /></button></li>)}</ol> : <p className="text-[13px] text-ink3 pt-2">Nothing on your calendar that needs you today.</p>}
          </div>
        </aside>
      </div>

      <Picture visuals={ed.visuals} go={go} />

      <div id="inside" className="mt-8 border-t-[3px] border-double border-ink pt-3">
        <Section className="mb-4 border-b-0">Inside this edition</Section>
        <div className="md:columns-2 xl:columns-4 gap-8">{ed.stories.map((x, i) => <Story key={i} x={x} go={go} onOpen={() => setOpen(x)} />)}</div>
      </div>

      <div className="mt-4 border-t border-ink pt-4 grid md:grid-cols-2 gap-8">
        {ed.inBrief.length > 0 && <div>
          <Section className="mb-1">In brief</Section>
          <ul className="divide-y divide-line">{ed.inBrief.map((x, i) => <li key={i}><button onClick={() => setOpen(x)} className="w-full text-left py-2 group"><Kicker>{x.kicker}</Kicker><span className="block text-[15px] font-bold text-ink leading-snug group-hover:underline" style={DISPLAY}>{x.sum.title}</span></button></li>)}</ul>
        </div>}
        <div className="bg-ink/[0.04] p-3 self-start">
          <div className="text-[10.5px] font-bold tracking-[0.12em] uppercase text-ink3 mb-1">Your edition covers</div>
          <p className="text-[13px] text-ink2 mb-2">{p.focus}</p>
          <div className="flex flex-wrap gap-1">{p.can.map(c => <span key={c} className="text-[11px] border border-line rounded px-1.5 py-0.5 text-ink2 bg-panel">{c}</span>)}</div>
        </div>
      </div>
      <footer className="mt-8 pt-3 border-t border-ink text-[11.5px] text-ink3 text-center">Every number comes from the same live data as the console. Click any number, chart or story to see the detail behind it.</footer>
      {open && <FullStory x={open} go={go} onClose={() => setOpen(null)} />}
      {drill.length > 0 && <DrillPanel stack={drill} setStack={setDrill} now={ed.at} scope={p.region} snap={ed.snap} />}
    </div>
  );
}

export default function BriefsApp() {
  const [who, setWho] = useState(load());
  const p = who && personaById(who);
  return (
    <div className="force-light min-h-screen text-ink" style={{ ...APTOS, background: '#f7f5ef' }}>
      {p ? <Edition key={p.id} p={p} onOut={() => { save(null); setWho(null); }} /> : <SignIn onIn={id => { save(id); setWho(id); }} />}
    </div>
  );
}
