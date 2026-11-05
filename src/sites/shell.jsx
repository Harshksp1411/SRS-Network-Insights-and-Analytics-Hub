// Shared frame for the two solution sites (Network Intelligence, OpsRamp Platform): the same header, colours,
// live clock, light and dark theme, drill-down panel and notifications as the console and the role dashboards.
import React, { useEffect } from 'react';
import * as I from 'lucide-react';
import { useApp, useNow } from '../store.jsx';
import { useLive } from '../live.jsx';
import { cx, RoofMark } from '../ui.jsx';
import { DrillPanel } from '../dash/Drill.jsx';
import { hhmmss } from '../util.js';
import { APP_NAME } from '../edition.js';

export const DISPLAY = { fontFamily: '"Aptos Display", Aptos, "Segoe UI", "Helvetica Neue", Arial, sans-serif' };
export const TONE_TX = { ok: 'text-ok', warn: 'text-warn', bad: 'text-bad', info: 'text-info', ink: 'text-ink' };
export const TONE_BAR = { ok: 'bg-ok', warn: 'bg-warn', bad: 'bg-bad', info: 'bg-info', brand: 'bg-brand', ink: 'bg-ink3' };

// read the open tab from the address (#now, #then …) so a link opens the right page
export function useHashTab(tabs, def) {
  const read = () => { const h = (location.hash || '').slice(1); return tabs.some(t => t.id === h) ? h : def; };
  const [tab, setTab] = React.useState(read);
  useEffect(() => { const f = () => setTab(read()); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
  const go = id => { if (id !== tab) { history.replaceState(null, '', `#${id}`); setTab(id); window.scrollTo({ top: 0 }); } };
  return [tab, go];
}

export function SiteShell({ site, sub, tabs, tab, onTab, children, foot }) {
  const { s, act } = useApp(); const now = useNow(); const { L } = useLive();
  useEffect(() => { document.title = `${site} – ${APP_NAME}`; }, [site]);
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="sticky top-0 z-40 bg-panel/95 backdrop-blur border-b border-line">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
          <RoofMark size={30} />
          <div className="min-w-0 mr-auto"><div className="font-bold text-ink text-[15px] leading-tight truncate">{site}</div><div className="text-[12px] text-ink3 leading-tight truncate">{APP_NAME} · {sub}</div></div>
          <span className="h-8 px-2.5 rounded-md border border-ok/40 text-ok bg-ok/10 text-[12px] font-bold inline-flex items-center gap-1.5"><span className="relative w-2 h-2"><span className="absolute inset-0 rounded-full bg-ok animate-ping opacity-60" /><span className="absolute inset-0 rounded-full bg-ok" /></span>LIVE<span className="font-normal text-ink3 hidden sm:inline">· {hhmmss(now)} CT · {Math.round(L.series.raw.at(-1) || 0)} events/min</span></span>
          <button onClick={() => act.set({ theme: s.theme === 'dark' ? 'light' : 'dark' })} title="Light or dark" aria-label="Switch light or dark" className="h-8 w-8 rounded-md border border-line hover:bg-chip grid place-items-center text-ink2">{s.theme === 'dark' ? <I.Sun size={15} /> : <I.Moon size={15} />}</button>
        </div>
        <nav className="max-w-[1440px] mx-auto px-4 sm:px-6 flex gap-1 overflow-x-auto" role="tablist">{tabs.map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => onTab(t.id)} className={cx('h-10 px-3 text-[13px] font-semibold whitespace-nowrap border-b-2 -mb-px inline-flex items-center gap-1.5', tab === t.id ? 'border-brand text-ink' : 'border-transparent text-ink3 hover:text-ink')}>{t.icon && <t.icon size={14} />}{t.label}{t.tag && <span className="text-[10.5px] font-bold text-ink3 border border-line rounded px-1">{t.tag}</span>}</button>))}</nav>
      </header>
      <main className="max-w-[1440px] mx-auto px-4 sm:px-6 py-5">{children}</main>
      <footer className="max-w-[1440px] mx-auto px-4 sm:px-6 pb-8 text-[11.5px] text-ink3">{foot}</footer>
      {s.drill.length > 0 && <DrillPanel stack={s.drill} setStack={act.setDrill} now={now} root={site} />}
      <div className="fixed top-[108px] right-4 z-[90] flex flex-col gap-2 items-end pointer-events-none w-[360px] max-w-[calc(100vw-32px)]">
        {s.toasts.map(t => <div key={t.id} role="status" className={cx('toast-in pointer-events-auto w-full pl-3.5 pr-1.5 py-2 rounded-md shadow-xl text-[13px] font-semibold flex items-start gap-2 border', t.tone === 'info' ? 'bg-ink text-canvas border-ink' : t.tone === 'warn' ? 'bg-warn text-white border-warn' : 'bg-ok text-white border-ok')}><I.CheckCircle2 size={15} className="mt-[2px] shrink-0" /><span className="flex-1 min-w-0 leading-snug">{t.msg}</span><button onClick={() => act.dismissToast(t.id)} aria-label="Close notification" className="shrink-0 w-6 h-6 rounded grid place-items-center hover:bg-white/15"><I.X size={14} /></button></div>)}
      </div>
    </div>
  );
}

// a lens header: title, source line, range pills and region picker, like the sample screens
export function LensHead({ title, src, ranges, range, onRange, region, onRegion, regions, right }) {
  return (
    <div className="bg-info/10 border border-line rounded-t-lg px-4 sm:px-5 py-3 flex flex-wrap items-center gap-3">
      <div className="min-w-0 mr-auto"><h1 className="text-[20px] sm:text-[22px] font-bold text-ink leading-tight" style={DISPLAY}>{title}</h1><div className="text-[12.5px] text-ink2">{src}</div></div>
      {ranges && <div className="inline-flex gap-1.5" role="tablist">{ranges.map(([k, l]) => <button key={k} role="tab" aria-selected={range === k} onClick={() => onRange(k)} className={cx('h-8 px-3 rounded-full border text-[12.5px] font-semibold', range === k ? 'bg-info/20 border-info text-ink' : 'bg-panel border-line text-ink2 hover:bg-chip')}>{l}</button>)}</div>}
      {regions && <label className="relative inline-flex items-center h-8 rounded-full border border-line bg-panel px-3 text-[12.5px] font-semibold text-ink"><I.MapPin size={13} className="text-ink3 mr-1" /><select value={region} onChange={e => onRegion(e.target.value)} className="bg-transparent outline-none appearance-none pr-4 cursor-pointer" aria-label="Region"><option value="All">All regions</option>{regions.map(r => <option key={r} value={r}>{r}</option>)}</select><I.ChevronDown size={13} className="absolute right-2 text-ink3 pointer-events-none" /></label>}
      {right}
    </div>
  );
}

// the blue-edged summary line under a lens header
export function Summary({ children, label = 'Executive summary' }) {
  return <div className="bg-chip/70 border-x border-line px-4 sm:px-5 py-3"><div className="border-l-4 border-info pl-3"><div className="text-[11px] font-bold tracking-[0.08em] uppercase text-ink3">{label}</div><div className="text-[15px] text-ink leading-snug mt-0.5">{children}</div></div></div>;
}

// a KPI tile with a coloured edge, as in the samples; clicking opens its drill-down
export function Tile({ label, value, sub, tone = 'ok', onClick, title }) {
  const El = onClick ? 'button' : 'div';
  return (
    <El onClick={onClick} title={title} className={cx('text-left bg-panel border border-line rounded-lg pl-4 pr-3 py-3 relative overflow-hidden min-w-0', onClick && 'hover:border-ink3 group')}>
      <span className={cx('absolute left-0 inset-y-0 w-1', TONE_BAR[tone] || 'bg-ok')} />
      <div className="text-[12.5px] text-ink2 flex items-start gap-1"><span className="flex-1">{label}</span>{onClick && <I.ChevronRight size={13} className="text-ink3 group-hover:text-brand mt-[2px]" />}</div>
      <div className="text-[28px] font-bold leading-tight tabular-nums text-ink mt-1" style={DISPLAY}>{value}</div>
      {sub && <div className="text-[12px] text-ink3 leading-snug">{sub}</div>}
    </El>
  );
}

// a simple labelled horizontal bar row
export function BarRow({ label, sub, value, frac, tone = 'info', right, onClick, target }) {
  const El = onClick ? 'button' : 'div';
  return (
    <El onClick={onClick} className={cx('w-full text-left grid grid-cols-[minmax(0,1.1fr)_minmax(0,1.3fr)_auto] gap-3 items-center py-1.5', onClick && 'hover:bg-chip/60 rounded px-1 -mx-1')}>
      <span className="min-w-0"><span className="block text-[13px] font-semibold text-ink truncate">{label}</span>{sub && <span className="block text-[11.5px] text-ink3 truncate">{sub}</span>}</span>
      <span className="relative h-2.5 bg-chip rounded-full"><span className={cx('absolute inset-y-0 left-0 rounded-full', TONE_BAR[tone])} style={{ width: `${Math.max(2, Math.min(100, frac * 100))}%` }} />{target != null && <span className="absolute -top-1 -bottom-1 border-l-2 border-dashed border-info" style={{ left: `${target * 100}%` }} />}</span>
      <span className="text-[13px] font-bold tabular-nums text-ink text-right min-w-[52px]">{value}{right}</span>
    </El>
  );
}

// a section box with a title row, for every card on the solution pages
export function Box({ title, right, sub, children, className, id, icon: Ic }) {
  return (
    <section id={id} className={cx('bg-panel border border-line rounded-lg min-w-0 flex flex-col', className)}>
      {title && <div className="flex items-start gap-2 px-4 pt-3 pb-2"><div className="flex-1 min-w-0"><h3 className="text-[14.5px] font-bold text-ink flex items-center gap-1.5">{Ic && <Ic size={15} className="text-ink3" />}{title}</h3>{sub && <div className="text-[12px] text-ink3 leading-snug mt-0.5">{sub}</div>}</div>{right && <div className="text-[12px] text-ink3 shrink-0">{right}</div>}</div>}
      <div className="px-4 pb-4 pt-1 flex-1 min-h-0">{children}</div>
    </section>
  );
}

export const Pill = ({ tone = 'gray', children }) => { const c = { red: 'bg-bad/10 text-bad border-bad/30', amber: 'bg-warn/10 text-warn border-warn/30', green: 'bg-ok/10 text-ok border-ok/30', blue: 'bg-info/10 text-info border-info/30', gray: 'bg-chip text-ink2 border-line' }[tone]; return <span className={cx('inline-flex items-center justify-center text-[11.5px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap', c)}>{children}</span>; };

// a plain table
export function T({ cols, rows, onRow, dense }) {
  return (
    <div className="overflow-x-auto"><table className="w-full text-[12.5px]"><thead><tr className="text-left text-ink3 text-[11.5px] border-b border-line">{cols.map(c => <th key={c.k} className={cx('py-1.5 pr-3 font-semibold', c.r && 'text-right')}>{c.l}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={r.key || i} onClick={onRow ? () => onRow(r) : undefined} className={cx('border-b border-line/60 last:border-0 align-top', onRow && 'cursor-pointer hover:bg-chip/50')}>{cols.map(c => <td key={c.k} className={cx(dense ? 'py-1' : 'py-1.5', 'pr-3', c.r && 'text-right tabular-nums', c.cls)}>{c.f ? c.f(r) : r[c.k]}</td>)}</tr>)}</tbody></table></div>
  );
}
