// The four chart cards on each role's dashboard. Every bar, slice, column and dot opens the detail behind it in the
// drill-down; the drill-down button on each card opens the whole chart's detail.
import React, { useState } from 'react';
import * as I from 'lucide-react';
import { cx } from '../ui.jsx';
import { C, HBars, Bars, LineChart, NAMap, Legend } from '../charts.jsx';
import { num } from '../util.js';
import { FMT } from './visuals.js';

const DISPLAY = { fontFamily: '"Aptos Display", Aptos, "Segoe UI", "Helvetica Neue", Arial, sans-serif' };


function Stack({ v, go }) {
  const tot = v.parts.reduce((a, p) => a + p.value, 0) || 1;
  return (
    <div className="pt-2">
      <div className="text-[34px] font-bold leading-none text-ok tabular-nums" style={DISPLAY}>{Math.round(v.parts[0].value / tot * 1000) / 10}%</div>
      <div className="text-[12px] text-ink2 mt-1">{v.parts[0].label.toLowerCase()}</div>
      <div className="flex h-9 rounded overflow-hidden mt-4 border border-line bg-panel">{v.parts.filter(p => p.value).map(p => <button key={p.label} title={`${p.label}: ${num(p.value)}`} onClick={() => go(p.go)} className="h-full hover:brightness-110" style={{ width: `${Math.max(1.2, p.value / tot * 100)}%`, background: p.color }} />)}</div>
      <ul className="mt-4 grid sm:grid-cols-2 gap-x-6 gap-y-2">{v.parts.map(p => <li key={p.label}><button onClick={() => go(p.go)} className="w-full flex items-center gap-2 text-[12.5px] text-ink2 hover:text-ink group"><span className="w-2.5 h-2.5 rounded-[2px] shrink-0" style={{ background: p.color }} /><span className="group-hover:underline">{p.label}</span><b className="ml-auto text-ink tabular-nums">{num(p.value)}</b><span className="w-12 text-right text-ink3 tabular-nums">{(p.value / tot * 100).toFixed(1)}%</span></button></li>)}</ul>
    </div>
  );
}
function Donut({ v, go }) {
  const [hv, setHv] = useState(null);
  const tot = v.parts.reduce((a, p) => a + p.value, 0) || 1, S = 170, sw = 24, r = (S - sw) / 2, c = 2 * Math.PI * r; let acc = 0;
  return (
    <div className="flex items-center gap-4 pt-2">
      <svg width={S} height={S} className="shrink-0">
        <circle cx={S / 2} cy={S / 2} r={r} fill="none" className="stroke-chip" strokeWidth={sw} />
        {v.parts.map((p, i) => { const len = p.value / tot * c; const el = p.value > 0 && <circle key={p.label} cx={S / 2} cy={S / 2} r={r} fill="none" stroke={p.color} strokeWidth={hv === i ? sw + 5 : sw} strokeDasharray={`${Math.max(0, len - (tot > p.value ? 2 : 0))} ${c}`} strokeDashoffset={-acc} transform={`rotate(-90 ${S / 2} ${S / 2})`} className="cursor-pointer transition-all" onMouseEnter={() => setHv(i)} onMouseLeave={() => setHv(null)} onClick={() => go(p.go)}><title>{`${p.label}: ${num(p.value)}`}</title></circle>; acc += len; return el; })}
        <text x="50%" y="50%" textAnchor="middle" fontSize="22" fontWeight="700" className="fill-ink" style={DISPLAY}>{hv != null ? num(v.parts[hv].value) : v.center}</text>
        <text x="50%" y="63%" textAnchor="middle" fontSize="11" className="fill-ink3">{hv != null ? v.parts[hv].label.toLowerCase().slice(0, 18) : v.sub}</text>
      </svg>
      <ul className="space-y-1.5 min-w-0 flex-1">{v.parts.map((p, i) => <li key={p.label}><button onMouseEnter={() => setHv(i)} onMouseLeave={() => setHv(null)} onClick={() => go(p.go)} className="w-full flex items-center gap-2 text-[12.5px] text-ink2 hover:text-ink group text-left"><span className="w-2.5 h-2.5 rounded-[2px] shrink-0" style={{ background: p.color }} /><span className="group-hover:underline min-w-0 leading-tight">{p.label}</span><b className="ml-auto pl-1 text-ink tabular-nums">{num(p.value)}</b></button></li>)}</ul>
    </div>
  );
}
function Chart({ v, go }) {
  switch (v.kind) {
    case 'stack': return <Stack v={v} go={go} />;
    case 'donut': return <Donut v={v} go={go} />;
    case 'hbars': return <div className="pt-2"><HBars rows={v.rows} max={v.max} fmt={FMT[v.fmt] || FMT.n} labelW={200} onRow={r => go(r.go)} /></div>;
    case 'cols': return <div className="pt-1"><Bars h={240} data={v.data.map((d, i) => ({ ...d, __i: i }))} keys={v.keys} colors={v.colors} onBar={d => go(v.goes[d.__i])} /><Legend className="mt-1" items={v.keys.map((k, i) => [k, v.colors[i]])} /></div>;
    case 'line': return <div className="pt-1 cursor-pointer" onClick={() => go(v.go)}><LineChart h={210} padL={v.padL || 44} labels={v.labels} yMin={v.yMin} yFmt={FMT[v.fmt] || FMT.n} series={v.series} refLines={v.refLines} />{v.series.length > 1 && <Legend className="mt-1" items={v.series.map(x => [x.name, x.color])} />}</div>;
    case 'map': return <div className="pt-1"><NAMap h={290} focus={v.focus ? v.points : null} onPoint={p => go({ t: 'branch', id: p.id })} points={v.points.map(p => ({ ...p, r: p.st === 'up' ? 2.4 : 6, dim: p.st === 'up', pulse: p.st === 'down' }))} /></div>;
    default: return null;
  }
}

export function ChartCards({ visuals, go }) {
  return (
    <div id="charts" className="grid lg:grid-cols-2 gap-4">
      {visuals.map(v => (
        <figure key={v.id} className="min-w-0 bg-panel border border-line rounded-md p-4 flex flex-col">
          <figcaption className="flex items-start gap-2 mb-1">
            <h3 className="flex-1 text-[15px] font-bold text-ink leading-snug" style={DISPLAY}>{v.title}</h3>
            <button onClick={() => go(v.go)} title="Drill down" className="h-7 px-2 rounded border border-line text-[12px] font-semibold text-ink2 hover:bg-chip hover:text-ink inline-flex items-center gap-1 shrink-0"><I.Layers size={13} />Drill down</button>
          </figcaption>
          <div className="flex-1"><Chart v={v} go={go} />{v.top && v.top.length > 0 && <div className="mt-3"><div className="text-[11px] font-bold tracking-[0.08em] uppercase text-ink3 mb-1">{v.topTitle || 'Worst first'}</div><ul className="divide-y divide-line border-y border-line">{v.top.map(t => <li key={t.label}><button onClick={() => go(t.go)} className="w-full text-left flex items-start gap-2 py-1.5 text-[12.5px] hover:bg-chip/60 group"><span className="mt-[5px] w-2 h-2 rounded-full shrink-0" style={{ background: t.color }} /><span className="min-w-0 flex-1"><b className="text-ink group-hover:underline">{t.label}</b><span className="text-ink2"> – {t.why}</span></span><I.ChevronRight size={14} className="mt-[2px] text-ink3 shrink-0" /></button></li>)}</ul></div>}</div>
          <p className="text-[12px] text-ink3 leading-snug mt-2 pt-2 border-t border-line">{v.caption}</p>
        </figure>
      ))}
    </div>
  );
}
