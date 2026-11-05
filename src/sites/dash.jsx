// The role dashboards' visual language, for the two solution sites: the period bar, the headline with a status pill
// and spotlight, big KPI numbers, the attention / going well / coming up trio, chart cards (the dashboards' own
// ChartCards), insight cards with details and drill-down, and the live activity feed.
import React, { useEffect, useRef, useState } from 'react';
import * as I from 'lucide-react';
import * as D from '../data.js';
import { useApp } from '../store.jsx';
import { useLive } from '../live.jsx';
import { Spark, C } from '../charts.jsx';
import { cx } from '../ui.jsx';
import { hhmmss } from '../util.js';
export { ChartCards } from '../dash/Charts.jsx';

export const DISPLAY = { fontFamily: '"Aptos Display", Aptos, "Segoe UI", "Helvetica Neue", Arial, sans-serif' };
const TONE = { ok: 'text-ok', warn: 'text-warn', bad: 'text-bad', info: 'text-info' };
const BAR = { ok: '#2E8540', warn: '#C46A00', bad: '#C62A1E', info: '#2F6DB5' };
const PILL = { ok: 'bg-ok/10 text-ok border-ok/30', minor: 'bg-info/10 text-info border-info/30', warn: 'bg-warn/10 text-warn border-warn/30', bad: 'bg-bad/10 text-bad border-bad/30' };
export const COLORS = { ok: BAR.ok, warn: BAR.warn, bad: BAR.bad, info: BAR.info, grey: C.s3, navy: C.s1, teal: C.s4 };
export const Kicker = ({ children, className }) => <div className={cx('text-[11px] font-bold tracking-[0.1em] uppercase text-brand', className)}>{children}</div>;

// period picker (black when active, as on the dashboards), region picker, a note and a right-hand action
export function PeriodBar({ views, value, onChange, note, region, onRegion, regions, right }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {views && <div className="inline-flex rounded-md border border-line overflow-hidden text-[13px] bg-panel" role="tablist">{views.map(([k, l]) => <button key={k} role="tab" aria-selected={value === k} onClick={() => onChange(k)} className={cx('px-3 h-9 font-semibold', value === k ? 'bg-ink text-canvas' : 'text-ink2 hover:bg-chip')}>{l}</button>)}</div>}
      {regions && <label className="relative inline-flex items-center h-9 rounded-md border border-line bg-panel px-3 text-[13px] font-semibold text-ink"><I.MapPin size={14} className="text-ink3 mr-1.5" /><select value={region} onChange={e => onRegion(e.target.value)} className="bg-transparent outline-none appearance-none pr-5 cursor-pointer" aria-label="Region"><option value="All">All regions</option>{regions.map(r => <option key={r} value={r}>{r}</option>)}</select><I.ChevronDown size={14} className="absolute right-2 text-ink3 pointer-events-none" /></label>}
      {note && <span className="text-[12.5px] text-ink2">{note}</span>}
      <span className="flex-1" />{right}
    </div>
  );
}
export const ExploreBtn = ({ onClick, children, icon: Ic = I.Layers }) => <button onClick={onClick} className="h-9 px-3 rounded-md border border-line bg-panel hover:bg-chip text-[12.5px] font-semibold text-ink inline-flex items-center gap-1.5"><Ic size={14} />{children}</button>;

// the headline block: status pill, scope, one-line headline, deck and a spotlight that opens its detail
export function Headline({ status, scope, headline, deck, spotlight, onSpot }) {
  return (
    <section className="mt-4 bg-panel border border-line rounded-md p-4 sm:p-5 border-l-4 border-l-brand">
      <div className="flex flex-wrap items-center gap-2">{status && <span className={cx('text-[11.5px] font-bold px-2 py-0.5 rounded border', PILL[status.kind])}>{status.label || 'Network status'}: {status.word}</span>}<span className="text-[12px] text-ink3">{scope}</span></div>
      <h1 className="text-[22px] sm:text-[26px] font-bold text-ink leading-tight mt-2" style={DISPLAY}>{headline}</h1>
      {deck && <p className="text-[14.5px] text-ink2 leading-snug mt-1">{deck}</p>}
      {spotlight && <button onClick={onSpot} className="mt-2 text-left text-[13px] text-ink2 hover:text-ink group flex items-start gap-1.5"><I.Sparkles size={14} className="mt-[2px] text-brand shrink-0" /><span><b className="text-ink">Spotlight:</b> <span className="group-hover:underline decoration-ink/30">{spotlight}</span></span></button>}
    </section>
  );
}

// big KPI numbers; each opens its detail
export function Kpis({ items, cols = 4 }) {
  return (
    <div className={cx('grid grid-cols-2 gap-4 mt-4', cols === 5 ? 'lg:grid-cols-5' : cols === 6 ? 'md:grid-cols-3 xl:grid-cols-6' : 'lg:grid-cols-4')}>{items.map(x => (
      <button key={x.label} onClick={x.go} className="text-left bg-panel border border-line rounded-md p-4 hover:border-ink3 group min-w-0">
        <div className="text-[12.5px] text-ink2 flex items-start gap-1"><span className="flex-1">{x.label}</span><I.ChevronRight size={14} className="text-ink3 group-hover:text-brand" /></div>
        <div key={String(x.value)} className={cx('text-[32px] font-bold leading-none tabular-nums mt-2 num-flash', TONE[x.tone] || 'text-ink')} style={DISPLAY}>{x.value}</div>
        {x.sub && <div className="text-[12px] text-ink3 mt-1.5 leading-snug">{x.sub}</div>}
        {x.spark && <div className="mt-2"><Spark data={x.spark} w={180} h={26} color={BAR[x.tone] || C.s1} /></div>}
      </button>))}</div>
  );
}

// a dashboard card with a title row
export function DCard({ title, icon: Ic, right, children, className, id }) {
  return (
    <section id={id} className={cx('bg-panel border border-line rounded-md min-w-0 flex flex-col', className)}>
      {title && <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-line">{Ic && <Ic size={15} className="text-ink3" />}<h3 className="flex-1 text-[13px] font-bold text-ink">{title}</h3>{right}</div>}
      <div className="p-4 flex-1 min-h-0">{children}</div>
    </section>
  );
}

// needs attention / going well / coming up
export function Trio({ attention, well, ahead, aheadTitle = 'Coming up' }) {
  return (
    <div className="grid lg:grid-cols-3 gap-4 mt-4">
      <DCard title="Needs attention" icon={I.AlertTriangle}><ul className="space-y-1 -my-1">{attention.map((x, i) => <li key={i}><button onClick={x.go} className={cx('w-full text-left flex gap-2 text-[13.5px] text-ink leading-snug py-1.5 -mx-1 px-1 rounded hover:bg-chip/60 group', i === 0 && 'bg-chip/50')}><I.CircleAlert size={15} className="mt-[2px] text-warn shrink-0" /><span className="flex-1 group-hover:underline decoration-ink/30">{x.text}</span><I.ChevronRight size={14} className="mt-[3px] text-ink3 shrink-0" /></button></li>)}</ul>{!attention.length && <div className="text-[13px] text-ink3">Nothing needs attention.</div>}</DCard>
      <DCard title="Going well" icon={I.CheckCircle2}><ul className="space-y-1 -my-1">{well.map((x, i) => <li key={i}><button onClick={x.go} className="w-full text-left flex gap-2 text-[13.5px] text-ink leading-snug py-1.5 -mx-1 px-1 rounded hover:bg-chip/60 group"><I.Check size={15} className="mt-[2px] text-ok shrink-0" /><span className="flex-1 group-hover:underline decoration-ink/30">{x.text}</span><I.ChevronRight size={14} className="mt-[3px] text-ink3 shrink-0" /></button></li>)}</ul></DCard>
      <DCard title={aheadTitle} icon={I.CalendarClock}><ol className="divide-y divide-line -my-2">{ahead.map((x, i) => <li key={i}><button onClick={x.go} className="w-full text-left grid grid-cols-[88px_minmax(0,1fr)_14px] gap-2 py-2 text-[12.5px] hover:bg-chip/60 group"><span><b className="block text-ink">{x.when}</b><span className="text-[11px] text-ink3">{x.kind}</span></span><span className="text-ink leading-snug group-hover:underline decoration-ink/30">{x.what}</span><I.ChevronRight size={14} className="text-ink3 mt-[2px]" /></button></li>)}</ol></DCard>
    </div>
  );
}

// an insight card: kicker, title, line, big stats, bars, points, Details and Drill down
export function Insight({ x }) {
  const [open, setOpen] = useState(false);
  return (
    <article className="bg-panel border border-line rounded-md p-4 flex flex-col min-w-0">
      <Kicker>{x.kicker}</Kicker>
      <h3 className="text-[16px] font-bold text-ink leading-snug mt-1" style={DISPLAY}>{x.title}</h3>
      {x.line && <p className="text-[13px] text-ink2 leading-snug mt-1">{x.line}</p>}
      {x.stats && <div className="flex gap-5 mt-2 flex-wrap">{x.stats.map(s => <div key={s.label} className="min-w-0"><div className={cx('font-bold leading-none tabular-nums whitespace-nowrap', String(s.value).length > 6 ? 'text-[17px]' : 'text-[21px]', TONE[s.tone] || 'text-ink')} style={DISPLAY}>{s.value}</div><div className="text-[11px] text-ink3 mt-0.5">{s.label}</div></div>)}</div>}
      {x.bars && <div className="mt-2 space-y-1.5">{x.bars.map(b => { const mx = Math.max(1, ...x.bars.map(v => v.value)); return <div key={b.label} className="text-[11.5px]"><div className="flex justify-between gap-2 text-ink2"><span className="truncate">{b.label}</span><b className="text-ink tabular-nums">{b.text ?? b.value}</b></div><div className="h-1.5 bg-chip rounded-full mt-0.5"><div className="h-full rounded-full" style={{ width: `${b.value / mx * 100}%`, background: BAR[b.tone] || C.s1 }} /></div></div>; })}</div>}
      {x.points && <ul className="mt-2 space-y-1 text-[12.5px] text-ink2">{x.points.map((p, i) => <li key={i} className="flex gap-2"><span className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: BAR[p.tone] || '#16191D' }} /><span className="min-w-0">{p.b && <b className="text-ink font-semibold">{p.b}</b>}{p.b && p.t ? ' – ' : ''}{p.t}</span></li>)}</ul>}
      {open && x.detail && <div className="mt-3 pt-3 border-t border-line text-[12.5px] text-ink2 space-y-1">{x.detail}</div>}
      <div className="mt-auto pt-3 flex flex-wrap gap-2">
        {x.detail && <button onClick={() => setOpen(!open)} className="h-8 px-2.5 rounded border border-line text-[12.5px] font-semibold text-ink hover:bg-chip inline-flex items-center gap-1"><I.FileText size={13} />{open ? 'Hide details' : 'Details'}</button>}
        {x.go && <button onClick={x.go} className="h-8 px-2.5 rounded border border-line text-[12.5px] font-semibold text-ink hover:bg-chip inline-flex items-center gap-1"><I.Layers size={13} />Drill down</button>}
      </div>
    </article>
  );
}

// the live feed, newest first, filtered to what the page is about
export function LiveActivity({ filter = () => true, title = 'Live activity', note = 'streaming' }) {
  const { act } = useApp(); const { L } = useLive();
  const items = L.feed.filter(filter).slice(0, 12);
  const tone = sev => ({ Critical: 'bg-bad', Major: 'bg-warn', Minor: 'bg-[#F0CF6B]' }[sev] || 'bg-ok');
  return (
    <DCard title={title} icon={I.Activity} right={<span className="text-[11px] text-ink3">{note}</span>}>
      <div className="flex items-center gap-3 -mt-1 mb-3"><div><div className="text-[22px] font-bold text-ink leading-none tabular-nums" style={DISPLAY}>{Math.round(L.series.raw.at(-1) || 0)}</div><div className="text-[11px] text-ink3">network events per minute</div></div><div className="flex-1 min-w-0"><Spark data={L.series.raw.slice(-40)} w={180} h={30} color={C.s1} /></div></div>
      <ul className="divide-y divide-line -mx-4 -mb-4 border-t border-line max-h-[560px] overflow-y-auto">{items.map(e => (
        <li key={e.id} className="feed-in"><button onClick={() => act.drill(e.inc ? { t: 'incident', id: e.inc } : { t: 'branch', id: e.branchId })} className="w-full text-left px-4 py-2 hover:bg-chip/60 flex gap-2.5 group">
          <span className={cx('mt-[6px] w-2 h-2 rounded-full shrink-0', tone(e.sev))} />
          <span className="min-w-0 flex-1"><span className="flex items-center gap-2 text-[11px] text-ink3"><span className="font-mono tabular-nums">{hhmmss(e.t)}</span><span className="font-semibold text-ink2">{e.src}</span>{e.branchId && D.BR[e.branchId] && <span className="truncate">{D.BR[e.branchId].name}</span>}</span><span className="block text-[12.5px] text-ink leading-snug group-hover:underline decoration-ink/30">{e.msg}</span>{e.out && <span className="block text-[11px] text-ink3">{e.out}</span>}</span>
        </button></li>))}</ul>
    </DCard>
  );
}

// a quiet section heading between the dashboard and the detail below it
export const SectionHead = ({ children, sub }) => <div className="mt-8 mb-3 flex items-end gap-3 border-b border-line pb-2"><h2 className="text-[17px] font-bold text-ink" style={DISPLAY}>{children}</h2>{sub && <span className="text-[12.5px] text-ink3 pb-[2px]">{sub}</span>}</div>;
