// Draws the blocks of an Ask Mova iO answer (kpis, table, bars, layers, timeline, spark, list, heading, text).
// Shared by the Ask panel and the morning briefs; `go` (optional) makes rows with a branch or incident clickable.
import React from 'react';
import { cx } from './ui.jsx';
import { C } from './charts.jsx';

const TONE_TX = { ok: 'text-ok', warn: 'text-warn', bad: 'text-bad', muted: 'text-ink3', info: 'text-info' };
const TONE_C = { ok: C.ok, warn: C.warn, bad: C.bad, info: C.s1, muted: C.s3 };
function Cell({ c }) {
  if (c == null || typeof c !== 'object') return <span className="text-ink2">{c}</span>;
  return <span><span className={cx(c.bold ? 'font-semibold text-ink' : 'text-ink2', TONE_TX[c.tone], c.tone && 'font-semibold')}>{c.text}</span>{c.sub && <span className="block text-[11px] text-ink3 leading-tight">{c.sub}</span>}</span>;
}
export function AskBlock({ k, go, maxRows }) {
  const click = r => { if (go && (r.inc || r.branch)) go(r); };
  switch (k.type) {
    case 'kpis': return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">{k.items.map(x => (
        <div key={x.label} className="bg-panel border border-line rounded px-2 py-1.5 min-w-0"><div className="text-[10.5px] text-ink3 leading-tight truncate">{x.label}</div><div className={cx('text-[16px] font-bold tabular-nums leading-tight truncate', TONE_TX[x.tone] || 'text-ink')}>{x.value}</div>{x.sub && <div className="text-[10.5px] text-ink3 truncate">{x.sub}</div>}</div>))}</div>);
    case 'table': { const rows = maxRows ? k.rows.slice(0, maxRows) : k.rows; return (<>
      <div className="bg-panel border border-line rounded overflow-x-auto"><table className="w-full text-[11.5px]"><thead><tr className="text-left text-ink3 border-b border-line">{k.cols.map(c => <th key={c} className="px-2 py-1 font-semibold whitespace-nowrap">{c}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} onClick={() => click(r)} className={cx('border-b border-line/60 last:border-0 align-top', go && (r.inc || r.branch) && 'cursor-pointer hover:bg-chip/60')}>{r.cells.map((c, j) => <td key={j} className="px-2 py-1">{<Cell c={c} />}</td>)}</tr>)}</tbody></table></div>
      {rows.length < k.rows.length && <div className="text-[11px] text-ink3 mt-1">…and {k.rows.length - rows.length} more in the PDF report</div>}</>); }
    case 'bars': { const mx = k.max || Math.max(1, ...k.items.map(x => x.value)); return (
      <div className="bg-panel border border-line rounded p-2">{k.title && <div className="text-[11px] font-bold text-ink3 mb-1">{k.title}</div>}<div className="space-y-1">{k.items.map(x => (
        <div key={x.label} className="grid grid-cols-[minmax(0,150px)_minmax(0,1fr)_auto] items-center gap-2 text-[11.5px]"><span className="truncate text-ink" title={x.label}>{x.label}{x.sub && <span className="block text-[10.5px] text-ink3 truncate">{x.sub}</span>}</span><span className="h-2 bg-chip rounded-sm overflow-hidden"><span className="block h-full rounded-sm" style={{ width: `${Math.max(2, x.value / mx * 100)}%`, background: TONE_C[x.tone] || C.s1 }} /></span><b className="tabular-nums text-ink">{x.display ?? x.value}</b></div>))}</div></div>); }
    case 'layers': return (
      <div className="space-y-1">{k.items.map(x => (
        <div key={x.name} className={cx('bg-panel border rounded px-2 py-1.5 border-l-[3px]', x.tone === 'bad' ? 'border-l-bad border-line' : x.tone === 'warn' ? 'border-l-warn border-line' : 'border-l-ok border-line')}><div className="flex items-center gap-2"><b className="text-ink text-[12.5px]">{x.name}</b><span className={cx('text-[11px] font-bold', TONE_TX[x.tone])}>{x.verdict}</span></div><div className="text-[11.5px] text-ink2 leading-snug">{x.text}</div></div>))}</div>);
    case 'timeline': return (
      <div className="bg-panel border border-line rounded p-2"><div className="relative pl-3"><span className="absolute left-[3px] top-1 bottom-1 w-px bg-line" />{k.items.map((x, i) => (
        <div key={i} className="relative pb-1.5 last:pb-0 text-[11.5px]"><span className={cx('absolute -left-[12px] top-[5px] w-[7px] h-[7px] rounded-full', x.tone === 'bad' ? 'bg-bad' : x.tone === 'warn' ? 'bg-warn' : x.tone === 'ok' ? 'bg-ok' : 'bg-ink3')} /><span className="font-mono text-ink3 mr-1.5">{x.t}</span><span className="text-ink">{x.text}</span>{x.src && <span className="block text-[10.5px] text-ink3">{x.src}</span>}</div>))}</div></div>);
    case 'spark': { const mx = k.max || Math.max(1, ...k.values); const w = 300, h = 46, st = w / Math.max(1, k.values.length - 1); const pts = k.values.map((v, i) => `${(i * st).toFixed(1)},${(h - 3 - v / mx * (h - 8)).toFixed(1)}`).join(' '); return (
      <div className="bg-panel border border-line rounded p-2"><div className="text-[11px] font-bold text-ink3 mb-1">{k.label}</div><svg viewBox={`0 0 ${w} ${h}`} className="w-full block" style={{ height: h }} preserveAspectRatio="none">{k.mark && <line x1="0" x2={w} y1={h - 3 - k.mark / mx * (h - 8)} y2={h - 3 - k.mark / mx * (h - 8)} stroke={C.bad} strokeDasharray="4 3" strokeWidth="1" vectorEffect="non-scaling-stroke" />}<polyline points={`0,${h} ${pts} ${w},${h}`} fill={C.s1} opacity=".12" /><polyline points={pts} fill="none" stroke={C.s1} strokeWidth="1.6" vectorEffect="non-scaling-stroke" /></svg>{k.values.length === 24 && <div className="flex justify-between text-[10px] text-ink3"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:00</span></div>}</div>); }
    case 'list': return (
      <div className="space-y-0.5">{k.items.map((l, j) => (
        <div key={j} className="flex gap-2 text-[12px]"><span className={cx('font-semibold shrink-0', go && (l.inc || l.branch) ? 'text-info cursor-pointer hover:underline' : 'text-ink')} onClick={() => click(l)}>{l.k}</span><span className="text-ink2">{l.v}</span></div>))}</div>);
    case 'heading': return <div className="text-[11.5px] font-bold text-ink pt-1">{k.text}</div>;
    case 'text': return <p className={cx('text-[12px] leading-snug', k.tone === 'muted' ? 'text-ink3 text-[11px]' : TONE_TX[k.tone] || 'text-ink2')}>{k.text}</p>;
    default: return null;
  }
}
