import React, { useState, useRef, useEffect } from 'react';
import MAP from './mapdata.json';
import { cx } from './ui.jsx';

// Chart palette: reference categorical order + fixed status steps (validated – see dataviz skill)
export const C = {
  s1: '#2F6DB5', s2: '#1D3F66', s3: '#A3ACB8', s4: '#2A9D8F', s5: '#E08A1E', s6: '#7FB3E0', s7: '#5E6B78', s8: '#16191D',
  ok: '#2E8540', warn: '#E07B00', minor: '#F0CF6B', serious: '#E07B00', bad: '#D62D20', alert: '#D62D20', info: '#2F6DB5', ai: '#762123', brand: '#762123', grey: '#A3ACB8', teal: '#2A9D8F',
};
export const SEQ = ['#EEF4FB', '#D4E4F5', '#AECBEB', '#82ACDC', '#5A8CCB', '#3A6FB5', '#25549A', '#163A6E'];

export function useWidth(def = 640) {
  const ref = useRef(null); const [w, setW] = useState(def);
  useEffect(() => { if (!ref.current || typeof ResizeObserver === 'undefined') return; const ro = new ResizeObserver(e => { const x = Math.round(e[0].contentRect.width); if (x > 40) setW(x); }); ro.observe(ref.current); return () => ro.disconnect(); }, []);
  return [ref, w];
}
const niceMax = v => { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; };

export function Spark({ data, w = 110, h = 30, color = C.info, fill = true, min, max, className }) {
  if (!data || !data.length) return null;
  const lo = min ?? Math.min(...data), hi = max ?? Math.max(...data), r = hi - lo || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * (w - 4) + 1, h - 3 - ((v - lo) / r) * (h - 6)]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
  return (
    <svg width={w} height={h} className={className} viewBox={`0 0 ${w} ${h}`}>
      {fill && <path d={`${d}L${w - 3},${h}L1,${h}Z`} fill={color} opacity="0.1" />}
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.6" fill={color} className="stroke-panel" strokeWidth="1.5" />
    </svg>
  );
}

// Time series with optional forecast segment (dashed) and confidence band. One y-axis only.
export function LineChart({ series, labels, h = 180, yFmt = v => v, refLines = [], yMin, yMax, band, forecastFrom, nowLabel = 'now' }) {
  const [hover, setHover] = useState(null);
  const [wref, W] = useWidth();
  const H = h, L = 44, Rr = 12, T = 12, B = 24;
  const all = series.flatMap(s => s.data).concat(refLines.map(r => r.v)).concat(band ? [...band.lo, ...band.hi] : []).filter(v => v != null);
  let lo = yMin ?? Math.min(...all), hi = yMax ?? Math.max(...all);
  if (yMax == null) hi = yMin === 0 ? niceMax(hi) : hi + (hi - lo) * 0.08;
  if (yMin == null) lo = lo - (hi - lo) * 0.08;
  const r = hi - lo || 1;
  const n = labels.length;
  const X = i => L + (i / Math.max(1, n - 1)) * (W - L - Rr), Y = v => T + (1 - (v - lo) / r) * (H - T - B);
  const ticks = [lo, lo + r / 2, hi];
  const path = (data, a = 0, b = data.length - 1) => { let out = '', started = false; for (let i = a; i <= b; i++) { const v = data[i]; if (v == null) { started = false; continue; } out += `${started ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`; started = true; } return out; };
  const bandPath = band ? (() => { const idx = band.hi.map((v, i) => i).filter(i => band.hi[i] != null); if (!idx.length) return ''; return idx.map((i, k) => `${k ? 'L' : 'M'}${X(i)},${Y(band.hi[i])}`).join('') + idx.slice().reverse().map(i => `L${X(i)},${Y(band.lo[i])}`).join('') + 'Z'; })() : '';
  return (
    <div className="relative" ref={wref}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full block" style={{ height: h }} onMouseLeave={() => setHover(null)}
        onMouseMove={e => { const b = e.currentTarget.getBoundingClientRect(); const x = (e.clientX - b.left) / b.width * W; const i = Math.round((x - L) / (W - L - Rr) * (n - 1)); setHover(i >= 0 && i < n ? i : null); }}>
        {ticks.map((t, i) => <g key={i}><line x1={L} x2={W - Rr} y1={Y(t)} y2={Y(t)} className="stroke-line" strokeWidth="1" /><text x={L - 7} y={Y(t) + 3.5} textAnchor="end" className="fill-ink3" fontSize="10.5">{yFmt(t)}</text></g>)}
        {forecastFrom != null && <g><rect x={X(forecastFrom)} y={T} width={W - Rr - X(forecastFrom)} height={H - T - B} className="fill-chip" opacity="0.6" /><line x1={X(forecastFrom)} x2={X(forecastFrom)} y1={T} y2={H - B} className="stroke-ink3" strokeWidth="1" /><text x={X(forecastFrom) + 5} y={T + 11} fontSize="10.5" className="fill-ink2" fontWeight="600">{nowLabel}</text><text x={W - Rr - 4} y={T + 11} fontSize="10.5" textAnchor="end" className="fill-ink3">forecast</text></g>}
        {band && <path d={bandPath} fill={band.color || C.info} opacity="0.15" />}
        {refLines.map(rl => <g key={rl.label}><line x1={L} x2={W - Rr} y1={Y(rl.v)} y2={Y(rl.v)} stroke={rl.color} strokeDasharray="5 4" strokeWidth="1.3" /><text x={L + 4} y={Y(rl.v) - 4} fontSize="10.5" className="fill-ink2" fontWeight="600">{rl.label}</text></g>)}
        {labels.map((l, i) => (n <= 12 || i % Math.ceil(n / 7) === 0) && <text key={i} x={X(i)} y={H - 7} textAnchor="middle" className="fill-ink3" fontSize="10.5">{l}</text>)}
        {series.map(s => { const f = s.forecastFrom ?? forecastFrom; return <g key={s.name}>
          {s.area && <path d={path(s.data) + `L${X(n - 1)},${Y(Math.max(lo, 0))}L${X(0)},${Y(Math.max(lo, 0))}Z`} fill={s.color} opacity="0.1" />}
          {f != null ? <><path d={path(s.data, 0, f)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" /><path d={path(s.data, f)} fill="none" stroke={s.color} strokeWidth="2" strokeDasharray="5 4" strokeLinecap="round" /></> : <path d={path(s.data)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
          {s.data[n - 1] != null && <circle cx={X(n - 1)} cy={Y(s.data[n - 1])} r="4" fill={s.color} className="stroke-panel" strokeWidth="2" />}
        </g>; })}
        {hover != null && <line x1={X(hover)} x2={X(hover)} y1={T} y2={H - B} className="stroke-ink3" strokeWidth="1" />}
        {hover != null && series.map(s => s.data[hover] != null && <circle key={s.name} cx={X(hover)} cy={Y(s.data[hover])} r="4" fill={s.color} className="stroke-panel" strokeWidth="2" />)}
      </svg>
      {hover != null && (
        <div className="absolute top-1 pointer-events-none bg-panel border border-line rounded px-2 py-1 text-[11.5px] shadow-lg z-10 min-w-[130px]" style={{ left: `${Math.min(72, (X(hover) / W) * 100)}%` }}>
          <div className="font-semibold text-ink">{labels[hover]}{forecastFrom != null && hover > forecastFrom ? ' (forecast)' : ''}</div>
          {series.map(s => s.data[hover] != null && <div key={s.name} className="flex items-center gap-1.5"><span className="w-2.5 h-[2px]" style={{ background: s.color }} /><span className="text-ink2">{s.name}</span><span className="font-semibold text-ink ml-auto pl-3 tabular">{yFmt(s.data[hover])}</span></div>)}
          {band && band.lo[hover] != null && <div className="text-ink3">likely range {yFmt(band.lo[hover])} to {yFmt(band.hi[hover])}</div>}
        </div>
      )}
    </div>
  );
}

// Columns: thin (<=24px), 2px surface gaps between stacked segments, rounded data-end
export function Bars({ data, keys, colors, h = 170, stacked = true, onBar, fmt = v => v, forecastFrom }) {
  const [hover, setHover] = useState(null);
  const [wref, W] = useWidth();
  const H = h, L = 38, T = 10, B = 24;
  const tot = d => stacked ? keys.reduce((s, k) => s + (d[k] || 0), 0) : Math.max(...keys.map(k => d[k] || 0));
  const hi = niceMax(Math.max(1, ...data.map(tot)));
  const bw = (W - L) / data.length;
  const ph = H - T - B;
  const colW = Math.min(24, bw * 0.62);
  const col = (x, y, w, hh, rr) => `M${x},${y + hh}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + hh}Z`;
  return (
    <div className="relative" ref={wref}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full block" style={{ height: h }}>
        {[0, 0.5, 1].map(f => <g key={f}><line x1={L} x2={W} y1={T + (1 - f) * ph} y2={T + (1 - f) * ph} className="stroke-line" strokeWidth="1" /><text x={L - 6} y={T + (1 - f) * ph + 3.5} textAnchor="end" fontSize="10.5" className="fill-ink3">{fmt(Math.round(hi * f))}</text></g>)}
        {forecastFrom != null && <rect x={L + forecastFrom * bw} y={T} width={W - L - forecastFrom * bw} height={ph} className="fill-chip" opacity="0.7" />}
        {data.map((d, i) => {
          let y = T + ph; const cx0 = L + i * bw + bw / 2; const isF = forecastFrom != null && i >= forecastFrom;
          const segs = keys.map((k, j) => ({ k, j, v: d[k] || 0 })).filter(x => x.v > 0);
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => onBar && onBar(d)} className={onBar ? 'cursor-pointer' : ''}>
              <rect x={L + i * bw} y={T} width={bw} height={ph} fill="transparent" />
              {stacked ? segs.map((sg, idx) => { const gap = idx ? 2 : 0; const hh = Math.max(0, (sg.v / hi) * ph - gap); y -= hh + gap; const top = idx === segs.length - 1; return <path key={sg.k} d={col(cx0 - colW / 2, y, colW, hh, top ? Math.min(3, hh) : 0)} fill={colors[sg.j]} opacity={(hover == null || hover === i ? 1 : 0.55) * (isF ? 0.5 : 1)} />; })
                : keys.map((k, j) => { const hh = ((d[k] || 0) / hi) * ph; const ww = Math.min(14, (colW + 6) / keys.length); const x = cx0 - (ww * keys.length + 2 * (keys.length - 1)) / 2 + j * (ww + 2); return <path key={k} d={col(x, T + ph - hh, ww, hh, Math.min(3, hh))} fill={colors[j]} opacity={hover == null || hover === i ? 1 : 0.55} />; })}
              {d.label && <text x={cx0} y={H - 8} textAnchor="middle" fontSize="10.5" className="fill-ink3">{d.label}</text>}
            </g>
          );
        })}
        <line x1={L} x2={W} y1={T + ph} y2={T + ph} className="stroke-ink3" strokeWidth="1" />
      </svg>
      {hover != null && (
        <div className="absolute top-0 pointer-events-none bg-panel border border-line rounded px-2 py-1 text-[11.5px] shadow-lg z-10 min-w-[130px]" style={{ left: `${Math.min(70, ((L + hover * bw) / W) * 100)}%` }}>
          <div className="font-semibold text-ink">{data[hover].tip || data[hover].label}{forecastFrom != null && hover >= forecastFrom ? ' (forecast)' : ''}</div>
          {keys.map((k, j) => <div key={k} className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ background: colors[j] }} /><span className="text-ink2">{k}</span><span className="font-semibold text-ink ml-auto pl-3 tabular">{fmt(data[hover][k] || 0)}</span></div>)}
        </div>
      )}
    </div>
  );
}

export function Legend({ items, className }) {
  return <div className={cx('flex flex-wrap gap-x-3.5 gap-y-1 text-[12px] text-ink2', className)}>{items.map(([l, c, dash]) => <span key={l} className="inline-flex items-center gap-1.5">{dash ? <span className="w-3.5 border-t-2 border-dashed" style={{ borderColor: c }} /> : <span className="w-2.5 h-2.5 rounded-[2px]" style={{ background: c }} />}{l}</span>)}</div>;
}

export function Ring({ value, size = 56, stroke = 6, color = C.ok, label }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" className="stroke-chip" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={`${c * value} ${c}`} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      {label && <text x="50%" y="56%" textAnchor="middle" fontSize={size > 90 ? 24 : 14} fontWeight="600" className="fill-ink" style={{ fontFamily: 'Arial' }}>{label}</text>}
    </svg>
  );
}

// Horizontal bars, value at the tip, optional marker (target / threshold)
export function HBars({ rows, fmt = v => v, max, color = C.s1, onRow, labelW = 150 }) {
  const m = max || Math.max(1, ...rows.map(r => Math.max(r.value, r.mark || 0)));
  return (
    <div className="space-y-2">
      {rows.map(r => (
        <div key={r.label} onClick={onRow ? () => onRow(r) : undefined} className={cx('flex items-center gap-2 text-[12.5px]', onRow && 'cursor-pointer hover:bg-chip/60 rounded')}>
          <span className="text-ink truncate shrink-0 leading-tight" style={{ width: labelW }} title={r.label}>{r.label}{r.sub && <span className="block text-[11px] text-ink3 truncate">{r.sub}</span>}</span>
          <span className="flex-1 h-3 relative"><span className="absolute inset-y-0 left-0 rounded-r-[3px]" style={{ width: `${Math.max(0.6, (r.value / m) * 100)}%`, background: r.color || color }} />{r.mark != null && <span className="absolute -top-1 -bottom-1 w-[2px] bg-ink" style={{ left: `${(r.mark / m) * 100}%` }} title={r.markLabel} />}</span>
          <span className="w-16 text-right font-semibold text-ink tabular shrink-0">{fmt(r.value)}</span>
        </div>
      ))}
    </div>
  );
}

// Sequential heatmap (one hue, light to dark) with hover readout
export function Heatmap({ rows, cols, values, fmt = v => v, colLabelEvery = 1, cell = 18, onCell, max, rowW }) {
  const [hv, setHv] = useState(null);
  const m = max || Math.max(1, ...values.flat());
  const colr = v => SEQ[Math.min(SEQ.length - 1, Math.floor((v / m) * (SEQ.length - 0.01)))];
  return (
    <div className="relative overflow-x-auto">
      <table className="border-separate" style={{ borderSpacing: 2 }}>
        <tbody>
          {rows.map((r, i) => <tr key={r}><td className="text-[11.5px] text-ink2 pr-2 whitespace-nowrap" style={{ minWidth: rowW }}>{r}</td>{cols.map((c, j) => <td key={j} onMouseEnter={() => setHv([i, j])} onMouseLeave={() => setHv(null)} onClick={() => onCell && onCell(i, j)} style={{ background: colr(values[i][j]), width: cell, height: cell - 3, minWidth: cell }} className={cx('rounded-[2px] p-0', hv && hv[0] === i && hv[1] === j && 'outline outline-2 outline-ink')} />)}</tr>)}
          <tr><td />{cols.map((c, j) => <td key={j} className="text-[10px] text-ink3 text-center pt-1 whitespace-nowrap">{j % colLabelEvery === 0 ? c : ''}</td>)}</tr>
        </tbody>
      </table>
      <div className="flex items-center gap-1 mt-1.5 text-[11px] text-ink3"><span className="mr-1">Fewer</span>{SEQ.map(c => <span key={c} className="w-4 h-2.5 rounded-[2px]" style={{ background: c }} />)}<span className="ml-1">More</span>{hv && <span className="ml-auto text-ink2"><b className="text-ink">{rows[hv[0]]}</b>, {cols[hv[1]]}: <b className="text-ink tabular">{fmt(values[hv[0]][hv[1]])}</b></span>}</div>
    </div>
  );
}

export function Donut({ data, size = 132, stroke = 18, center, sub }) {
  const tot = data.reduce((s, d) => s + d.value, 0) || 1; const r = (size - stroke) / 2, c = 2 * Math.PI * r; let acc = 0;
  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} className="shrink-0">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" className="stroke-chip" strokeWidth={stroke} />
        {data.map(d => { const len = (d.value / tot) * c; const el = <circle key={d.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={d.color} strokeWidth={stroke} strokeDasharray={`${Math.max(0, len - 2)} ${c}`} strokeDashoffset={-acc} transform={`rotate(-90 ${size / 2} ${size / 2})`}><title>{`${d.label}: ${d.value}`}</title></circle>; acc += len; return el; })}
        {center && <text x="50%" y="52%" textAnchor="middle" fontSize="24" fontWeight="600" className="fill-ink" style={{ fontFamily: 'Arial' }}>{center}</text>}
        {sub && <text x="50%" y="65%" textAnchor="middle" fontSize="11" className="fill-ink3">{sub}</text>}
      </svg>
      <div className="space-y-1 text-[12.5px] min-w-0 flex-1">{data.map(d => <div key={d.label} className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-[2px] shrink-0" style={{ background: d.color }} /><span className="text-ink2 truncate">{d.label}</span><b className="text-ink ml-auto pl-2 tabular">{d.value.toLocaleString()}</b></div>)}</div>
    </div>
  );
}

// Likelihood x impact; colour = up to 3 categories
export function RiskMatrix({ points, onPoint, h = 270 }) {
  const [hv, setHv] = useState(null);
  const [wref, W] = useWidth(560);
  const H = h, L = 40, B = 34, T = 10, R = 12;
  const X = v => L + v * (W - L - R), Y = v => T + (1 - v) * (H - T - B);
  return (
    <div className="relative" ref={wref}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full block" style={{ height: h }}>
        <rect x={X(0.5)} y={Y(1)} width={X(1) - X(0.5)} height={Y(0.5) - Y(1)} fill={C.bad} opacity="0.07" />
        {[0, 0.5, 1].map(v => <g key={v}><line x1={X(0)} x2={X(1)} y1={Y(v)} y2={Y(v)} className="stroke-line" /><line x1={X(v)} x2={X(v)} y1={Y(0)} y2={Y(1)} className="stroke-line" /></g>)}
        <text x={X(0.5)} y={H - 8} textAnchor="middle" fontSize="11" className="fill-ink2">Likelihood within horizon</text>
        <text x={13} y={Y(0.5)} textAnchor="middle" fontSize="11" className="fill-ink2" transform={`rotate(-90 13 ${Y(0.5)})`}>Business impact</text>
        <text x={X(0.99)} y={Y(0.96)} textAnchor="end" fontSize="11" className="fill-ink2" fontWeight="600">Act first</text>
        <text x={X(0.01)} y={Y(0.03)} fontSize="11" className="fill-ink3">Watch</text>
        {points.map(p => <g key={p.id} onMouseEnter={() => setHv(p)} onMouseLeave={() => setHv(null)} onClick={() => onPoint && onPoint(p)} className="cursor-pointer"><circle cx={X(p.x)} cy={Y(p.y)} r="13" fill="transparent" /><circle cx={X(p.x)} cy={Y(p.y)} r={hv && hv.id === p.id ? 7 : 5.5} fill={p.color} className="stroke-panel" strokeWidth="2" />{p.tag && <text x={X(p.x) + 9} y={Y(p.y) + 4} fontSize="10.5" className="fill-ink2">{p.tag}</text>}</g>)}
      </svg>
      {hv && <div className="absolute pointer-events-none bg-panel border border-line rounded px-2 py-1 text-[11.5px] shadow-lg z-10" style={{ left: `${Math.min(66, X(hv.x) / W * 100)}%`, top: `${Math.max(0, Y(hv.y) / H * 100 - 18)}%` }}><b className="text-ink">{hv.label}</b><div className="text-ink2">likelihood {Math.round(hv.x * 100)}%, impact {Math.round(hv.y * 100)}/100</div></div>}
    </div>
  );
}

// US + southern Canada map; points = [{id,x,y,r,color,label,pulse,flash}]
export function NAMap({ points, onPoint, h = 420, highlightStates = [], children, focus, legendNote }) {
  const [hover, setHover] = useState(null);
  let vb = [0, 0, MAP.w, MAP.h];
  if (focus && focus.length && focus.length < 880) {
    const xs = focus.map(p => p.x), ys = focus.map(p => p.y);
    let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    let w = Math.max(60, x1 - x0) * 1.35, hh = Math.max(40, y1 - y0) * 1.35;
    const ar = MAP.w / MAP.h; if (w / hh > ar) hh = w / ar; else w = hh * ar;
    const cx0 = (x0 + x1) / 2, cy0 = (y0 + y1) / 2; vb = [cx0 - w / 2, cy0 - hh / 2, w, hh];
  }
  const k = vb[2] / MAP.w;
  return (
    <div className="relative">
      <svg viewBox={vb.join(' ')} className="w-full transition-all" style={{ maxHeight: h }}>
        <path d={MAP.canada} className="fill-chip stroke-line" strokeWidth={0.7 * k} />
        {MAP.states.map(st => <path key={st.id} d={st.d} className={cx('stroke-panel', highlightStates.includes(st.name) ? 'fill-warn/25' : 'fill-mapland')} strokeWidth={0.8 * k} />)}
        {k > 0.9 && <g transform="translate(10,505)"><rect width="120" height="80" rx="4" className="fill-chip stroke-line" /><text x="8" y="17" fontSize="11" className="fill-ink3" fontWeight="600">Hawaii (Kauai)</text></g>}
        {children}
        {points.map(p => { const r = p.r * Math.max(k, 0.12) * (k < 0.9 ? 1.5 : 1); return (
          <g key={p.id} transform={`translate(${p.x},${p.y})`} onMouseEnter={() => setHover(p)} onMouseLeave={() => setHover(null)} onClick={() => onPoint && onPoint(p)} className="cursor-pointer">
            {p.pulse && <circle r={r + 6 * k} fill={p.color} opacity="0.25" className="map-pulse" />}
            {p.flash && <circle r={r + 3 * k} fill="none" stroke={C.s1} strokeWidth={2 * k} className="map-ping" />}
            {p.risk && <circle r={r + 3.5 * k} fill="none" stroke={C.s7} strokeWidth={1.6 * k} strokeDasharray={`${2.5 * k} ${2 * k}`} />}
            <circle r={r} fill={p.color} fillOpacity={p.dim ? 0.18 : 0.9} className="stroke-panel" strokeWidth={0.8 * k} />
          </g>); })}
      </svg>
      {hover && (
        <div className="absolute pointer-events-none bg-panel border border-line rounded-md px-2.5 py-1.5 text-[12px] shadow-lg z-10 whitespace-nowrap" style={{ left: `${((hover.x - vb[0]) / vb[2]) * 100}%`, top: `${((hover.y - vb[1]) / vb[3]) * 100}%`, transform: 'translate(-50%, -118%)' }}>
          {hover.label}
        </div>
      )}
    </div>
  );
}
