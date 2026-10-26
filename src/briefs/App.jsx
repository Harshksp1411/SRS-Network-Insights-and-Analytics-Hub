// The briefs page: sign in with a demo account, then read your own edition like a newspaper, and download the
// daily, weekly or monthly report as a PDF. Each account sees only its own edition (role-based access).
import React, { useMemo, useState } from 'react';
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

const KEY = 'srs-brief-user';
const load = () => { try { return sessionStorage.getItem(KEY); } catch { return null; } };
const save = v => { try { v ? sessionStorage.setItem(KEY, v) : sessionStorage.removeItem(KEY); } catch { } };
const serif = { fontFamily: 'Georgia, "Times New Roman", Times, serif' };
const TONE = { ok: 'text-ok', warn: 'text-warn', bad: 'text-bad' };
const longDate = t => new Date(t).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Chicago' });

function SignIn({ onIn }) {
  const [u, setU] = useState(''), [pw, setPw] = useState(''), [err, setErr] = useState('');
  const go = e => { e.preventDefault(); const p = PERSONAS.find(x => x.user === u.trim().toLowerCase() && x.password === pw); if (p) onIn(p.id); else setErr('That username and password do not match a demo account.'); };
  return (
    <div className="max-w-[980px] mx-auto px-4 py-10">
      <div className="text-center border-b-2 border-ink pb-4">
        <div className="text-[11px] font-bold tracking-[0.18em] text-ink3 uppercase">SRS {APP_NAME}</div>
        <h1 className="text-[44px] font-bold text-ink leading-none mt-2" style={serif}>The Morning Brief</h1>
        <p className="text-[14px] text-ink2 mt-2" style={serif}>One edition per role, written from live network data at the start of the day. Sign in to read yours.</p>
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

function Story({ id, kicker, a }) {
  return (
    <article id={id} className="break-inside-avoid mb-6 border-t border-ink/70 pt-2 scroll-mt-4">
      <div className="text-[10.5px] font-bold tracking-[0.14em] uppercase text-brand">{kicker}</div>
      <h3 className="text-[20px] font-bold text-ink leading-snug mt-1" style={serif}>{a.title}</h3>
      {a.lead && <p className="text-[13.5px] text-ink2 leading-relaxed mt-1.5" style={serif}>{a.lead}</p>}
      <div className="space-y-2 mt-2 text-[12.5px]">{(a.blocks || []).map((k, j) => <AskBlock key={j} k={k} maxRows={8} />)}</div>
      {a.src && <div className="text-[11px] text-ink3 italic mt-2">Source: {a.src}</div>}
    </article>
  );
}

function Edition({ p, onOut }) {
  const { s } = useApp(); const { L } = useLive();
  const [period, setPeriod] = useState('daily');
  const [ver, setVer] = useState(0);
  const [busy, setBusy] = useState('');
  // an edition is printed once and stays still while you read it; Refresh prints a new one from live data
  const ed = useMemo(() => compose(p, s, Date.now(), L, period), [p.id, period, ver]);
  const pdf = per => { setBusy(per); setTimeout(() => { try { downloadEdition(per === period ? ed : compose(p, s, Date.now(), L, per)); } finally { setBusy(''); } }, 30); };
  return (
    <div className="max-w-[1320px] mx-auto px-4 sm:px-6 pb-12">
      <div className="flex items-center gap-3 py-2 border-b border-line text-[12px] text-ink2">
        <RoofMark size={26} /><span className="font-bold tracking-[0.12em] uppercase text-ink3 text-[10.5px]">SRS {APP_NAME}</span>
        <span className="flex-1" />
        <span className="hidden sm:inline">Signed in as <b className="text-ink">{p.name}</b>, {p.title}</span>
        <button onClick={onOut} className="h-8 px-3 rounded-md border border-line hover:bg-chip font-semibold text-ink inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"><I.LogOut size={14} />Sign out</button>
      </div>
      <header className="text-center pt-5 pb-3 border-b-[3px] border-double border-ink">
        <h1 className="text-[46px] sm:text-[56px] font-bold text-ink leading-none" style={serif}>The {ed.label}</h1>
        <div className="mt-2 text-[12.5px] text-ink2 flex flex-wrap justify-center gap-x-4 gap-y-1">
          <span>{period === 'daily' ? longDate(ed.at) : ed.range}</span><span>Edition for {p.title}</span><span>Printed {hhmm(ed.at)} CT</span>
          <button onClick={() => setVer(v => v + 1)} className="text-info hover:underline inline-flex items-center gap-1"><I.RefreshCw size={12} />Refresh</button>
        </div>
      </header>
      <div className="flex flex-wrap items-center gap-2 py-3 border-b border-line">
        <div className="inline-flex rounded-md border border-line overflow-hidden text-[13px]" role="tablist">{[['daily', 'Today'], ['weekly', 'This week'], ['monthly', 'This month']].map(([k, l]) => <button key={k} role="tab" aria-selected={period === k} onClick={() => setPeriod(k)} className={cx('px-3 h-9 font-semibold', period === k ? 'bg-ink text-canvas' : 'text-ink hover:bg-chip')}>{l}</button>)}</div>
        <span className="flex-1" />
        <span className="text-[12px] text-ink3 mr-1">Download PDF</span>
        {[['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly']].map(([k, l]) => <button key={k} onClick={() => pdf(k)} disabled={!!busy} className="h-9 px-3 rounded-md border border-line bg-panel hover:bg-chip text-ink text-[13px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"><I.FileDown size={15} />{busy === k ? 'Preparing…' : l}</button>)}
      </div>

      <div className="grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-8 pt-6">
        <section>
          <div className="text-[10.5px] font-bold tracking-[0.14em] uppercase text-brand">Lead story</div>
          <h2 className="text-[30px] sm:text-[36px] font-bold text-ink leading-tight mt-1" style={serif}>{ed.headline}</h2>
          <p className="text-[17px] text-ink2 italic leading-snug mt-3" style={serif}>{ed.deck}</p>
          <div className="mt-4 sm:columns-2 gap-6 text-[14.5px] text-ink leading-relaxed" style={serif}>{ed.lead.map((x, i) => <p key={i} className={cx('mb-3', i === 0 && 'first-letter:text-[42px] first-letter:font-bold first-letter:float-left first-letter:leading-[0.9] first-letter:mr-1.5')}>{x}</p>)}</div>
          <div className="mt-5 border-t border-ink/70 pt-3">
            <div className="text-[10.5px] font-bold tracking-[0.14em] uppercase text-ink mb-2">In this edition</div>
            <ol className="grid sm:grid-cols-2 gap-x-6 gap-y-2">{ed.stories.map((x, i) => <li key={i}><a href={`#story-${i}`} className="group block"><span className="text-[10px] font-bold tracking-[0.12em] uppercase text-brand">{x.kicker}</span><span className="block text-[15px] font-bold text-ink leading-snug group-hover:underline" style={serif}>{x.a.title}</span>{x.a.lead && <span className="block text-[12.5px] text-ink3 leading-snug line-clamp-2" style={serif}>{x.a.lead}</span>}</a></li>)}</ol>
          </div>
        </section>
        <aside className="space-y-6">
          <div className="border-y-2 border-ink py-3">
            <div className="text-[10.5px] font-bold tracking-[0.14em] uppercase text-ink mb-2">By the numbers</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">{ed.numbers.map(x => <div key={x.label}><div className={cx('text-[26px] font-bold leading-none tabular-nums', TONE[x.tone] || 'text-ink')} style={serif}>{x.value}</div><div className="text-[11.5px] text-ink3 mt-0.5">{x.label}</div></div>)}</div>
          </div>
          <div>
            <div className="text-[10.5px] font-bold tracking-[0.14em] uppercase text-ink mb-2">{period === 'daily' ? 'Your day' : 'Coming up'}</div>
            {ed.agenda.length ? <ol className="space-y-2">{ed.agenda.map((x, i) => <li key={i} className="grid grid-cols-[86px_minmax(0,1fr)] gap-2 text-[12.5px] border-b border-line/70 pb-2"><span className={cx('font-semibold tabular-nums', x.late ? 'text-bad' : 'text-ink')}>{x.when}<span className="block text-[10.5px] font-normal text-ink3">{x.kind}</span></span><span><span className="text-ink">{x.what}</span><span className="block text-[11.5px] text-ink3">{x.where}</span></span></li>)}</ol> : <p className="text-[12.5px] text-ink3">Nothing scheduled that needs you today.</p>}
          </div>
          <div className="bg-chip/60 rounded-md p-3">
            <div className="text-[10.5px] font-bold tracking-[0.14em] uppercase text-ink3 mb-1">Your access</div>
            <p className="text-[12px] text-ink2 italic mb-1.5" style={serif}>{p.focus}</p>
            <div className="flex flex-wrap gap-1">{p.can.map(c => <span key={c} className="text-[11px] border border-line rounded px-1.5 py-0.5 text-ink2 bg-panel">{c}</span>)}</div>
          </div>
        </aside>
      </div>

      <div className="mt-8 border-t-[3px] border-double border-ink pt-5 md:columns-2 xl:columns-3 gap-8">
        {ed.stories.map((x, i) => <Story key={i} id={`story-${i}`} kicker={x.kicker} a={x.a} />)}
      </div>
      <footer className="mt-6 pt-3 border-t border-line text-[11.5px] text-ink3 text-center">Sample data; branch names, figures and incidents are illustrative. Every number comes from the same data as the console.</footer>
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
