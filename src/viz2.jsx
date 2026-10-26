// Live visuals: tiles, error budgets, branch heartbeat, hex maps, lane timelines, correlation flow,
// agent activity and tool event rates. Everything reads the live engine, so it moves every 2 seconds.
import React, { useMemo, useState } from 'react';
import * as I from 'lucide-react';
import * as D from './data.js';
import { useApp, useNow, healthOf, inScope, filteredBranches, circuitOf } from './store.jsx';
import { useLive } from './live.jsx';
import { Card, Badge, Btn, Tabs, cx, Logo, SRC_LOGO, Dot } from './ui.jsx';
import { Spark, Legend, C, useWidth, SEQ, TweenNum, FitText, useScale, useSlide } from './charts.jsx';
import { AREAS, TL_LANES, AGENT_DEF, AGENT_GROUPS, TOOLS, outcomeOf, MONITOR_SRC, BEAT } from './liveext.js';
import { hhmm, hhmmss, num, rng, MIN, HR, ago } from './util.js';

const LiveTag = () => <span className="inline-flex items-center gap-1 text-[11px] font-bold text-ok"><span className="w-1.5 h-1.5 rounded-full bg-ok animate-pulse" />Live</span>;
const HEALTH_C = { up: C.ok, degraded: C.warn, down: C.bad };
const fmtN = (v, dec = 0) => Number(v).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });

// ── KPI tiles with live sparklines ───────────────────────────────────
export function LiveKpis({ items, cols = 3 }) {
  const { L } = useLive();
  return (
    <div className={cx('grid gap-3', cols === 3 ? 'md:grid-cols-3' : cols === 4 ? 'md:grid-cols-2 xl:grid-cols-4' : 'md:grid-cols-3 xl:grid-cols-5')}>
      {items.map(it => { const Ic = it.icon || I.Activity; return (
        <div key={it.label} className="card bg-panel border border-line rounded-lg px-4 py-3 min-w-0">
          <div className="flex items-center gap-1.5 text-[12.5px] text-ink2"><Ic size={14} className="text-ink3" /><span className="truncate flex-1">{it.label}</span><span className="w-1.5 h-1.5 rounded-full bg-ok animate-pulse" /></div>
          <div className="flex items-end justify-between gap-3 mt-1">
            <div className="min-w-0 flex-1"><FitText className={cx('text-[28px] font-bold leading-none tabular-nums', it.tone === 'warn' ? 'text-warn' : it.tone === 'bad' ? 'text-bad' : 'text-ink')}><TweenNum value={it.value} />{it.unit && <span className="text-[14px] font-semibold text-ink3 ml-0.5">{it.unit}</span>}</FitText></div>
            {it.series && <Spark data={it.series.slice(-50)} color={it.color || C.s1} w={110} h={32} />}
          </div>
          <div className="text-[12px] text-ink3 mt-1.5 leading-snug">{it.sub}</div>
        </div>); })}
    </div>
  );
}

// ── Business services: one tile per application, live ────────────────
export function ServiceTiles() {
  const { L } = useLive(); const { s } = useApp();
  const S = L.series;
  const open = s.incidents.filter(i => i.state !== 'Resolved');
  const hits = k => open.filter(i => (i.impact || []).join(' ').toLowerCase().includes(k)).length;
  const tiles = [
    ['ERP and invoicing', 'ERP login, synthetic', S.erp, v => `${v.toFixed(2)} s`, 'erp', 1.8],
    ['Card payments (POS)', 'POS path p95', S.pos, v => `${Math.round(v)} ms`, 'pos', 400],
    ['Cloud applications', 'Azure, p95 from branches', S.roofhub, v => `${v.toFixed(2)} s`, 'cloud', 1.2],
    ['Pricing and quoting', 'Pricing API p95', S.erp.map(x => x * 0.62), v => `${v.toFixed(2)} s`, 'pricing', 1.2],
    ['Branch WAN', 'Average latency to data centre', S.wan, v => `${Math.round(v)} ms`, 'branch', 40],
    ['Warehouse Wi-Fi', 'Roam failures per min', S.scan, v => v.toFixed(1), 'roaming', 3],
    ['Voice', 'Call quality (MOS)', S.voice, v => v.toFixed(2), 'phone', null],
    ['Microsoft 365', 'Response from branches', S.m365, v => `${Math.round(v)} ms`, 'm365', 250],
  ];
  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
      {tiles.map(([name, sub, ser, f, key, thr]) => { const n = hits(key); const v = ser.at(-1); const warn = n > 0 || (thr != null && v > thr); return (
        <div key={name} className={cx('card bg-panel border border-line rounded-lg p-3 min-w-0 border-l-[3px]', warn ? 'border-l-warn' : 'border-l-ok')}>
          <div className="flex items-center gap-1.5 text-[12.5px]"><Dot tone={warn ? 'amber' : 'green'} /><span className="font-bold text-ink truncate flex-1">{name}</span><span className={cx('text-[11px] font-semibold whitespace-nowrap', warn ? 'text-warn' : 'text-ok')}>{n ? `${n} branch${n > 1 ? 'es' : ''}` : 'Healthy'}</span></div>
          <div className="flex items-end justify-between gap-2 mt-1"><div><div className="text-[20px] font-bold text-ink tabular-nums leading-tight"><TweenNum value={f(v)} /></div><div className="text-[11.5px] text-ink3">{sub}</div></div><Spark data={ser.slice(-60)} color={warn ? C.warn : C.ok} w={120} h={34} /></div>
        </div>); })}
    </div>
  );
}

// ── Error budgets ────────────────────────────────────────────────────
function BudgetSpark({ data, color, w = 240, h = 46 }) {
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - 2 - v * (h - 6)]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
  return <svg viewBox={`0 0 ${w} ${h}`} className="w-full block" style={{ height: h }} preserveAspectRatio="none"><path d={`${d}L${w},${h}L0,${h}Z`} fill={color} opacity=".14" /><path d={d} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" /><circle cx={pts.at(-1)[0] - 2} cy={pts.at(-1)[1]} r="3" fill={color} /></svg>;
}
export function ErrorBudgets() {
  const { L } = useLive();
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
      {L.x.budgets.map(b => { const left = b.series.at(-1); const recent = (b.series.at(-6) - left) / 5; const avg = (1 - left) / 30; const rate = avg > 0 ? recent / avg : 0; const burning = rate > 1.5 || left < 0.2; const col = left < 0.2 ? C.bad : burning ? C.warn : C.ok; const mins = Math.round(left * (100 - b.target) / 100 * 30 * 24 * 60);
        return (
          <div key={b.name} className="card bg-panel border border-line rounded-lg p-3 min-w-0">
            <div className="flex items-start gap-2"><div className="text-[13px] font-bold text-ink flex-1 leading-tight">{b.name}</div><Badge tone={left < 0.2 ? 'red' : burning ? 'amber' : 'green'}>{burning ? `Burning ${Math.max(1.5, rate).toFixed(1)}×` : 'On track'}</Badge></div>
            <div className="flex items-baseline gap-2 mt-1"><span className="text-[22px] font-bold text-ink tabular-nums"><TweenNum value={`${b.actual.toFixed(b.actual > 99.9 ? 3 : 2)}%`} /></span><span className="text-[11.5px] text-ink3">target {b.target}% · 30 days</span></div>
            <div className="h-1.5 bg-chip rounded mt-1.5 overflow-hidden"><div className="h-full rounded transition-all duration-700" style={{ width: `${left * 100}%`, background: col }} /></div>
            <div className="flex text-[11.5px] text-ink2 mt-1"><span>Error budget left <b className="text-ink">{mins >= 120 ? `${(mins / 60).toFixed(1)} h` : `${mins} min`}</b></span><span className="ml-auto tabular-nums"><TweenNum value={`${(left * 100).toFixed(1)}%`} /></span></div>
            <div className="mt-1.5"><BudgetSpark data={b.series} color={col} /></div>
            <div className="text-[11px] text-ink3 mt-1">{b.sub}. Budget left over 30 days; the last point moves while an incident is open.</div>
          </div>); })}
    </div>
  );
}

// ── Branch heartbeat: one cell per branch, lights up when a reading arrives ──
// The delay is fixed when the glow mounts: changing animation-delay later would restart it mid-glow.
function Beat({ at, color }) {
  const [delay] = useState(() => Math.round(at - Date.now()));
  return <span className="hb-beat" style={{ background: color, animationDelay: `${delay}ms`, animationDuration: `${BEAT}ms` }} />;
}
export function HeartbeatGrid() {
  const { L } = useLive(); const { s, act } = useApp(); const now = useNow();
  const [hv, setHv] = useState(null);
  const groups = useMemo(() => D.REGIONS.map(r => ({ r, bs: D.BRANCHES.filter(b => b.region === r) })), []);
  return (
    <Card title="Branch heartbeat" sub="One cell per branch, all 900. A cell lights up when a reading from that branch arrives." right={<div className="flex items-center gap-3"><Legend items={[['Healthy', C.ok], ['Degraded', C.warn], ['Down', C.bad]]} /><span className="text-[11.5px] text-ink2 tabular-nums" ><b className="text-ink"><TweenNum value={Math.round(L.x.rate * 15)} /></b> readings / 30 s</span></div>}>
      <div className="space-y-1.5">{groups.map(g => (
        <div key={g.r} className="flex gap-2 items-start">
          <div className="w-[132px] shrink-0 text-[11.5px] text-ink2 leading-tight pt-0.5">{g.r}<span className="text-ink3"> {g.bs.length}</span></div>
          <div className="flex flex-wrap gap-[2px] flex-1">{g.bs.map(b => { const h = healthOf(s, b); const p = L.x.pulse[b.id]; const sc = inScope(s, b.id); return (
            <button key={b.id} onClick={() => act.openBranch(b.id)} onMouseEnter={() => setHv(b)} onMouseLeave={() => setHv(null)} title={b.name} className="relative w-[9px] h-[9px]">
              <span className="absolute inset-0 rounded-[1.5px] transition-[background-color,opacity] duration-700" style={{ background: HEALTH_C[h], opacity: sc ? (h === 'up' ? 0.42 : 1) : 0.12 }} />
              {p && sc && <Beat key={p} at={p} color={HEALTH_C[h]} />}
            </button>); })}</div>
        </div>))}</div>
      <div className="text-[11.5px] text-ink3 mt-2 h-4">{hv ? <span><b className="text-ink">{hv.name}</b>, {hv.brand}. {healthOf(s, hv) === 'up' ? 'Healthy' : healthOf(s, hv) === 'degraded' ? 'Degraded' : 'Down'}. Click for Branch 360.</span> : 'Hover a cell for the branch. Click to open Branch 360.'}</div>
    </Card>
  );
}

// ── Hex map by region (generic) ──────────────────────────────────────
export function HexMap({ groups, legend, onPick, size = 7 }) {
  const [ref, W] = useWidth(900);
  const [hv, setHv] = useState(null);
  const r = size, dx = r * Math.sqrt(3), dy = r * 1.5;
  const perRow = Math.max(10, Math.floor((W - 150 - dx) / dx));
  return (
    <div ref={ref}>
      <div className="space-y-2">{groups.map(g => { const rows = Math.ceil(g.items.length / perRow); const h = rows * dy + r * 0.6; return (
        <div key={g.label} className="flex gap-2 items-start">
          <div className="w-[140px] shrink-0 text-[11.5px] leading-tight pt-0.5"><div className="font-semibold text-ink">{g.label}</div><div className="text-ink3">{g.sub}</div></div>
          <svg width={perRow * dx + dx} height={h} className="block shrink-0">
            {g.items.map((it, i) => { const row = Math.floor(i / perRow), col = i % perRow; const cx0 = col * dx + (row % 2 ? dx / 2 : 0) + dx / 2, cy0 = row * dy + r; const pts = Array.from({ length: 6 }, (_, k) => { const a = Math.PI / 180 * (60 * k - 30); return `${(cx0 + (r - 0.7) * Math.cos(a)).toFixed(1)},${(cy0 + (r - 0.7) * Math.sin(a)).toFixed(1)}`; }).join(' ');
              return <polygon key={it.id} points={pts} fill={it.color} opacity={it.dim ? 0.15 : 1} stroke={hv === it ? 'rgb(var(--ink))' : 'none'} strokeWidth="1.5" className="cursor-pointer transition-[fill] duration-700" onMouseEnter={() => setHv(it)} onMouseLeave={() => setHv(null)} onClick={() => onPick && onPick(it)} />; })}
          </svg>
        </div>); })}</div>
      <div className="flex items-center gap-3 mt-2 text-[11.5px] text-ink3 min-h-[18px]">{legend}<span className="ml-auto text-ink2 truncate">{hv ? hv.title : 'Hover a cell for detail'}</span></div>
    </div>
  );
}
export function LatencyHex() {
  const { L } = useLive(); const { s, act } = useApp();
  const t = Math.floor(L.last / 2000);
  const groups = useMemo(() => D.REGIONS.map(rg => { const bs = D.BRANCHES.filter(b => b.region === rg); const items = bs.map(b => { const c = circuitOf(s, b.wan[0]); const h = healthOf(s, b); const lat = h === 'down' ? 999 : Math.round(c.lat * (1 + 0.12 * Math.sin(t * 0.7 + b.num))) + (c.status === 'Degraded' ? 60 : 0); return { id: b.id, b, lat, color: lat >= 150 ? C.bad : lat >= 80 ? C.warn : lat >= 45 ? '#8fb98f' : '#c9dfc9', dim: !inScope(s, b.id), title: `${b.name}: ${lat >= 999 ? 'unreachable' : `${lat} ms to DC`} on ${c.carrier} ${c.type}` }; }); return { label: rg, sub: `${bs.length} branches · ${items.filter(i => i.lat >= 80).length} slow`, items }; }), [t, s.circuitState, s.branchHealth, s.filters]);
  return (
    <Card title="Latency to the data centre, by branch" sub="Each hexagon is a branch, grouped by region. Warning at 80 ms, critical at 150 ms. Click one to open it." right={<LiveTag />}>
      <HexMap groups={groups} onPick={it => act.openBranch(it.id)} legend={<Legend items={[['under 45 ms', '#c9dfc9'], ['45 to 80', '#8fb98f'], ['80 to 150', C.warn], ['150+ or down', C.bad]]} />} />
    </Card>
  );
}

// ── Area timeline: one lane per area, last 60 min, with event markers ──
const MK = { inc: [C.bad, 'Incident opened'], res: [C.ok, 'Resolved'], chg: [C.info, 'Change'], run: [C.s1, 'Mova iO run'] };
export function AreaTimeline() {
  const { L } = useLive(); const now = useNow();
  const [ref, W] = useWidth(1000);
  const [hx, setHx] = useState(null);
  const lw = 190, rw = 70, laneH = 46, top = 6, n = 60;
  const H = top + AREAS.length * laneH + 22;
  const X = i => lw + (i / (n - 1)) * (W - lw - rw);
  const tX = t => lw + (1 - (now - t) / (60 * MIN)) * (W - lw - rw);
  const cols = [C.s4, C.s1, C.s5, C.s7, C.s6, C.s2];
  return (
    <Card title="Area timeline" sub="Key metric per area, last 60 minutes, with incidents, changes and Mova iO runs" right={<LiveTag />}>
      <div ref={ref} className="relative" onMouseLeave={() => setHx(null)} onMouseMove={e => { const b = e.currentTarget.getBoundingClientRect(); const x = e.clientX - b.left; const i = Math.round((x - lw) / (W - lw - rw) * (n - 1)); setHx(i >= 0 && i < n ? i : null); }}>
        <svg width={W} height={H} className="block">
          {AREAS.map((a, k) => <AreaLane key={a.id} a={a} s={L.x.lanes[a.id]} y0={top + k * laneH} laneH={laneH} X={X} n={n} lw={lw} W={W} rw={rw} col={cols[k]} />)}
          {L.x.markers.map((m, i) => { const x = tX(m.t); if (x < lw) return null; return <g key={m.t + '-' + i} style={{ transform: `translateX(${x.toFixed(1)}px)`, transition: 'transform var(--tickh, 1s) linear' }}><line x1={0} x2={0} y1={top} y2={H - 20} stroke={MK[m.kind][0]} strokeWidth="1" opacity=".6" /><rect x={-4} y={H - 18} width="8" height="8" fill={MK[m.kind][0]} transform={m.kind === 'chg' ? `rotate(45 0 ${H - 14})` : undefined} /></g>; })}
          <text x={lw} y={H - 1} fontSize="10.5" fill="rgb(var(--ink3))">{hhmm(now - 60 * MIN)}</text><text x={(lw + W - rw) / 2} y={H - 1} textAnchor="middle" fontSize="10.5" fill="rgb(var(--ink3))">{hhmm(now - 30 * MIN)}</text><text x={W - rw} y={H - 1} textAnchor="end" fontSize="10.5" fill="rgb(var(--ink3))">now</text>
          {hx != null && <line x1={X(hx)} x2={X(hx)} y1={top} y2={H - 20} stroke="rgb(var(--ink))" strokeWidth="1" />}
        </svg>
        {hx != null && <div className="absolute top-0 pointer-events-none bg-panel border border-line rounded px-2 py-1 text-[11.5px] shadow-lg z-10" style={{ left: Math.min(W - 220, X(hx) + 10) }}><div className="font-semibold text-ink">{hhmm(now - (n - 1 - hx) * MIN)}</div>{AREAS.map(a => <div key={a.id} className="flex gap-3"><span className="text-ink2">{a.label}</span><b className="ml-auto text-ink tabular-nums">{fmtN(L.x.lanes[a.id][hx], a.dec)}{a.unit}</b></div>)}</div>}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-[11.5px] text-ink2">{Object.entries(MK).map(([k, [c, l]]) => <span key={k} className="inline-flex items-center gap-1.5"><span className={cx('w-2 h-2', k === 'chg' && 'rotate-45')} style={{ background: c }} />{l}</span>)}<span className="text-ink3">Hover a lane to read every area at that minute.</span></div>
    </Card>
  );
}

// One lane of the area timeline. The y range eases between readings, the line morphs to each new
// reading, and when a new minute starts the whole lane slides left by one step instead of jumping.
function AreaLane({ a, s, y0, laneH, X, n, lw, W, rw, col }) {
  const k = useSlide(s); const cid = React.useId().replace(/:/g, '');
  const [lo, hi] = useScale(Math.min(...s), Math.max(...s)); const rr = (hi - lo) || 1;
  const Y = v => y0 + laneH - 6 - ((v - lo) / rr) * (laneH - 14);
  const d = s.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('');
  const yl = Y(s[n - 1]), glide = { transition: 'transform var(--tickh, 1s) ease-out' };
  return (
    <g>
      <rect x={lw} y={y0 + 2} width={W - lw - rw} height={laneH - 4} fill="rgb(var(--chip))" opacity=".55" />
      <text x={4} y={y0 + 18} fontSize="12" fontWeight="700" fill="rgb(var(--ink))">{a.label}</text>
      <text x={4} y={y0 + 33} fontSize="10.5" fill="rgb(var(--ink3))">{a.metric.length > 30 ? a.metric.slice(0, 29) + '…' : a.metric}</text>
      <defs><clipPath id={`al${cid}`}><rect x={lw} y={y0} width={W - lw - rw + 6} height={laneH} /></clipPath></defs>
      <g clipPath={`url(#al${cid})`}><g key={k} className={k ? 'slide-x' : ''} style={{ '--dx': `${((W - lw - rw) / (n - 1)).toFixed(2)}px` }}>
        <path className="morph" d={`${d}L${X(n - 1)},${y0 + laneH - 2}L${X(0)},${y0 + laneH - 2}Z`} fill={col} opacity=".14" />
        <path className="morph" d={d} fill="none" stroke={col} strokeWidth="1.8" strokeLinejoin="round" />
        <circle cx={0} cy={0} r="3.5" fill={col} style={{ transform: `translate(${X(n - 1).toFixed(1)}px, ${yl.toFixed(1)}px)`, ...glide }} />
      </g></g>
      <text x={W - rw + 8} y={4} fontSize="12" fontWeight="700" fill="rgb(var(--ink))" style={{ transform: `translateY(${yl.toFixed(1)}px)`, ...glide }}><TweenNum value={fmtN(s[n - 1], a.dec)} />{a.unit}</text>
    </g>
  );
}

// ── Unified timeline, last 4 hours, every area plus Mova iO ──────────
export function UnifiedTimeline() {
  const { L } = useLive(); const now = useNow();
  const [ref, W] = useWidth(1000);
  const lw = 150, rw = 14, laneH = 22, top = 22;
  const H = top + TL_LANES.length * laneH + 20;
  const span = 4 * HR; const X = t => lw + (1 - (now - t) / span) * (W - lw - rw);
  const ticks = Array.from({ length: 9 }, (_, i) => now - (8 - i) * 30 * MIN);
  return (
    <Card title="Unified timeline" sub="Last 4 hours across every area and Mova iO. Each dot is an event; red squares are incidents; diamonds are changes." right={<Legend items={[['Event', C.s5], ['Incident', C.bad], ['Change', C.info]]} />}>
      <div ref={ref}><svg width={W} height={H} className="block">
        {ticks.map((t, i) => <g key={i}><line x1={X(t)} x2={X(t)} y1={top - 6} y2={H - 18} stroke="rgb(var(--line))" /><text x={X(t)} y={12} textAnchor="middle" fontSize="10.5" fill="rgb(var(--ink3))">{i === 8 ? 'now' : hhmm(t)}</text></g>)}
        {TL_LANES.map((l, k) => <g key={l.id}><rect x={lw} y={top + k * laneH + 2} width={W - lw - rw} height={laneH - 4} fill={k % 2 ? 'transparent' : 'rgb(var(--chip))'} opacity=".5" /><text x={4} y={top + k * laneH + 15} fontSize="11.5" fill="rgb(var(--ink2))" fontWeight={l.id === 'mova' ? 700 : 400}>{l.label}</text></g>)}
        {L.x.dots.map((d, i) => { const k = TL_LANES.findIndex(l => l.id === d.lane); if (k < 0) return null; const x = X(d.t), y = top + k * laneH + laneH / 2 + ((i * 7) % 7) - 3; const fresh = now - d.t < 6000;
          const mv = { transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`, transition: 'transform var(--tickh, 1s) linear' };
          return d.kind === 'inc' ? <rect key={d.t + '-' + i} x={-3.5} y={-3.5} width="7" height="7" fill={C.bad} style={mv} /> : d.kind === 'chg' ? <g key={d.t + '-' + i} style={mv}><rect x={-3} y={-3} width="6" height="6" fill={C.info} transform="rotate(45)" /></g> : <circle key={d.t + '-' + i} cx={0} cy={0} r={fresh ? 4 : 2.4} fill={d.lane === 'mova' ? C.s1 : C.s5} opacity={fresh ? 1 : 0.75} style={mv} />; })}
        <line x1={X(now)} x2={X(now)} y1={top - 6} y2={H - 18} stroke={C.bad} strokeWidth="1.5" />
      </svg></div>
    </Card>
  );
}

// ── Top branches, tabbed, live ───────────────────────────────────────
export function TopBranches() {
  const { L } = useLive(); const { act } = useApp();
  const [m, setM] = useState('wan');
  const cfg = { wan: ['WAN use', v => `${Math.round(v)}%`, 100, 80], lat: ['Latency', v => `${Math.round(v)} ms`, 150, 80], loss: ['Loss', v => `${v.toFixed(2)}%`, 3, 1], cpu: ['EdgeConnect CPU', v => `${Math.round(v)}%`, 100, 75] }[m];
  const rows = [...L.x.cands].sort((a, b) => b[m] - a[m]).slice(0, 8);
  return (
    <Card title="Top branches" sub={`By ${cfg[0].toLowerCase()}, worst first`} right={<Tabs size="sm" value={m} onChange={setM} tabs={[{ id: 'wan', label: 'WAN' }, { id: 'lat', label: 'Latency' }, { id: 'loss', label: 'Loss' }, { id: 'cpu', label: 'CPU' }]} />}>
      <div className="space-y-[7px]">{rows.map((r, i) => { const b = D.BR[r.id]; const v = r[m]; const bad = v >= cfg[3]; return (
        <button key={r.id} onClick={() => act.openBranch(r.id)} className="w-full flex items-center gap-2 text-[12.5px] hover:bg-chip/60 rounded px-0.5">
          <span className="w-4 text-ink3 text-right">{i + 1}</span><span className="w-[225px] shrink-0 truncate text-left text-ink font-semibold">{b.name}</span>
          <span className="flex-1 h-2.5 bg-chip rounded-sm overflow-hidden"><span className="block h-full rounded-sm transition-all duration-700" style={{ width: `${Math.min(100, v / cfg[2] * 100)}%`, background: bad ? C.warn : C.s4 }} /></span>
          <span className="w-16 text-right font-semibold tabular-nums text-ink"><TweenNum value={cfg[1](v)} /></span></button>); })}</div>
    </Card>
  );
}

// ── Correlation engine: each alert and what Mova iO did with it ──────
const OC = { 'Auto-cleared': 'green', 'To the digest': 'gray', Grouped: 'purple', Watching: 'amber' };
export function CorrelationEngine() {
  const { L } = useLive(); const { act } = useApp();
  const items = L.feed.filter(e => MONITOR_SRC.has(e.src) || e.inc).slice(0, 14);
  const lastMin = L.feed.filter(e => (MONITOR_SRC.has(e.src) || e.inc) && Date.now() - e.t < 60e3);
  const cnt = o => lastMin.filter(e => outcomeOf(e) === o).length;
  return (
    <Card title="Correlation engine" sub="Each alert as it arrives and what Mova iO did with it" right={<LiveTag />}>
      <div className="flex flex-wrap gap-1.5 mb-2">{Object.keys(OC).map(o => <Badge key={o} tone={OC[o]}>{o} <b className="tabular-nums">{cnt(o)}</b></Badge>)}<span className="ml-auto text-[11.5px] text-ink3">last minute</span></div>
      <div className="divide-y divide-line/70">{items.map(e => { const o = outcomeOf(e); const b = D.BR[e.branchId]; return (
        <button key={e.id} onClick={() => e.inc ? act.openInc(e.inc) : act.openBranch(e.branchId)} className="w-full flex items-center gap-2 py-1.5 text-[12px] text-left feed-in hover:bg-chip/50">
          <code className="text-ink3 text-[11px] w-[54px] shrink-0">{hhmmss(e.t)}</code>
          <span className={cx('w-1.5 h-1.5 rounded-full shrink-0', e.sev === 'Critical' ? 'bg-bad' : e.sev === 'Major' ? 'bg-warn' : 'bg-ink3')} />
          <span className="w-[62px] shrink-0">{SRC_LOGO[e.src] ? <Logo k={SRC_LOGO[e.src]} h={9} /> : <b className="text-[11px] text-brand">{e.src}</b>}</span>
          <span className="flex-1 min-w-0 truncate text-ink">{e.msg} <span className="text-ink3">· {b.name}</span></span>
          <I.ArrowRight size={12} className="text-ink3 shrink-0" />
          <Badge tone={OC[o]} className="shrink-0 w-[118px] justify-center">{e.inc ? `Grouped into ${e.inc.slice(-4)}` : o}</Badge></button>); })}</div>
    </Card>
  );
}

// ── From alerts to tickets (funnel) ──────────────────────────────────
function todayCounts(L, s) {
  // One pipeline for every screen: events in, noise removed (duplicates, flaps, info), alerts left,
  // then alerts auto-cleared, rolled to the digest or correlated into incidents.
  const events = L.counters.events, suppressed = Math.min(events, L.counters.suppressed);
  const raw = Math.max(0, events - suppressed), auto = Math.round(raw * 0.70), digest = Math.round(raw * 0.17), corr = Math.max(0, raw - auto - digest);
  const sod = new Date(); sod.setHours(0, 0, 0, 0);
  const inc = [...s.incidents, ...s.resolved].filter(i => i.opened >= sod.getTime()).length || s.incidents.length;
  return { events, suppressed, noise: suppressed / Math.max(1, events), raw, auto, digest, corr, inc, autoRes: L.counters.autoRes };
}
export { todayCounts };
export function AlertFunnel() {
  const { L } = useLive(); const { s } = useApp();
  const c = todayCounts(L, s);
  const rows = [['Events received', c.events, C.grey, 'Every trap, syslog line and threshold crossing from Orchestrator, Aruba Central, OpsRamp and New Relic'], ['Alerts', c.raw, C.s2, `Left after noise removal: ${Math.round(c.noise * 100)}% were duplicates, flaps or information only`], ['Auto-cleared', c.auto, C.ok, 'Recovered by themselves: checked by ping and SNMP after the hold-down'], ['Rolled to digest', c.digest, C.s3, 'Warnings bundled into the morning digest instead of tickets'], ['Correlated', c.corr, C.s1, 'Grouped by topology, time, change and carrier into incidents'], ['Incidents', c.inc, C.brand, 'One ServiceNow incident per branch per event']];
  const max = c.events || 1;
  return (
    <Card title="From events to incidents" sub="Live counts since 00:00 CT" right={<LiveTag />}>
      <div className="space-y-2">{rows.map(([l, v, col, note]) => (
        <div key={l} className="grid grid-cols-[130px_minmax(0,1fr)] md:grid-cols-[130px_minmax(0,1fr)_minmax(0,0.9fr)] items-center gap-3 text-[12.5px]">
          <span className="text-ink font-semibold text-right">{l}</span>
          <span className="h-7 bg-chip/60 rounded-sm relative"><span className="absolute inset-y-0 left-0 rounded-sm transition-all duration-700 flex items-center justify-end pr-2 text-white font-bold tabular-nums text-[12px]" style={{ width: `${Math.max(5, Math.sqrt(v / max) * 100)}%`, background: col }} key={l}>{num(v)}</span></span>
          <span className="hidden md:block text-[11.5px] text-ink3 leading-tight">{note}</span>
        </div>))}</div>
      <div className="text-[11px] text-ink3 mt-2">Bar length uses a square-root scale so small stages stay visible.</div>
    </Card>
  );
}

// ── Alert flow (Sankey): source → handling → outcome ─────────────────
export function AlertSankey() {
  const { L } = useLive(); const { s } = useApp();
  const [ref, W] = useWidth(1000);
  const c = todayCounts(L, s);
  const src = [['Orchestrator', 0.36], ['OpsRamp', 0.3], ['Aruba Central', 0.22], ['New Relic and synthetics', 0.12]].map(([n, f]) => [n, Math.round(c.raw * f)]);
  const watch = Math.round(c.corr * 0.12), corrd = c.corr - watch;
  const mid = [['Auto-cleared', c.auto, C.ok], ['Rolled to digest', c.digest, C.s3], ['Correlated', corrd, C.s1], ['Being watched', watch, C.warn]];
  const fixed = Math.round(corrd * 0.28), person = corrd - fixed;
  const out = [['No ticket needed', c.auto + c.digest + watch, C.s3], ['Fixed by Mova iO', fixed, C.ok], ['With an engineer', person, C.s1]];
  const H = 300, nw = 12, gap = 10, tot = c.raw || 1;
  const col = (list, x) => { const usable = H - gap * (list.length - 1); let y = 0; return list.map(([n, v, color]) => { const h = Math.max(3, v / tot * usable); const o = { n, v, color, x, y, h }; y += h + gap; return o; }); };
  const A = col(src.map(([n, v]) => [n, v, C.s2]), 0), B = col(mid, W * 0.42), Cc = col(out, W - nw - 160);
  // flows source → handling proportional; handling → outcome
  const links = []; const bOff = B.map(() => 0); const aOff = A.map(() => 0);
  A.forEach((a, i) => B.forEach((b, j) => { const f = (b.v / tot) * a.h; links.push({ x1: a.x + nw, y1: a.y + aOff[i] + f / 2, x2: b.x, y2: b.y + bOff[j] + (a.v / tot) * b.h / 2, w: f, c: b.color }); aOff[i] += f; bOff[j] += (a.v / tot) * b.h; }));
  const map2 = [[0, 0, 1], [1, 0, 1], [2, 1, fixed / Math.max(1, corrd)], [2, 2, person / Math.max(1, corrd)], [3, 0, 1]]; const b2 = B.map(() => 0), c2 = Cc.map(() => 0);
  map2.forEach(([bi, ci, f]) => { const b = B[bi], cc = Cc[ci]; const w = b.h * f; links.push({ x1: b.x + nw, y1: b.y + b2[bi] + w / 2, x2: cc.x, y2: cc.y + c2[ci] + w / 2, w, c: cc.color }); b2[bi] += w; c2[ci] += w; });
  const curve = l => `M${l.x1},${l.y1} C${(l.x1 + l.x2) / 2},${l.y1} ${(l.x1 + l.x2) / 2},${l.y2} ${l.x2},${l.y2}`;
  const label = (o, side) => <text x={side === 'r' ? o.x + nw + 6 : o.x + nw + 6} y={o.y + o.h / 2 + 4} fontSize="11.5" fill="rgb(var(--ink))"><tspan fontWeight="700">{o.n}</tspan><tspan fill="rgb(var(--ink3))"> {num(o.v)}</tspan></text>;
  return (
    <Card title="Alert flow, today" sub="Source, handling and outcome. Widths are live counts since midnight." right={<LiveTag />}>
      <div ref={ref}><svg width={W} height={H + 4} className="block">
        {links.map((l, i) => <path key={i} d={curve(l)} fill="none" stroke={l.c} strokeOpacity=".22" strokeWidth={Math.max(1, l.w)} />)}
        {[...A, ...B, ...Cc].map(o => <rect key={o.n} x={o.x} y={o.y} width={nw} height={o.h} fill={o.color} rx="1" />)}
        {A.map(o => label(o))}{B.map(o => label(o))}{Cc.map(o => label(o, 'r'))}
      </svg></div>
    </Card>
  );
}

// ── How alerts were grouped: one lane per open incident ──────────────
export function GroupingSwimlane() {
  const { s, act } = useApp(); const now = useNow();
  const [ref, W] = useWidth(900);
  const incs = s.incidents.filter(i => i.state !== 'Resolved').sort((a, b) => b.opened - a.opened).slice(0, 8);
  const lw = 230, rw = 10, laneH = 24, H = incs.length * laneH + 26, span = 90 * MIN;
  const X = t => lw + Math.max(0, 1 - (now - t) / span) * (W - lw - rw);
  const srcC = { Orchestrator: C.s1, OpsRamp: C.s4, 'Aruba Central': C.s5, 'New Relic': C.s7, Synthetic: C.s7 };
  return (
    <Card title="How alerts were grouped" sub="Last 90 minutes. One lane per open incident; each dot is an alert grouped into it." right={<Legend items={[['Orchestrator', C.s1], ['OpsRamp', C.s4], ['Central', C.s5], ['New Relic', C.s7]]} />}>
      <div ref={ref}><svg width={W} height={H} className="block">
        {incs.map((inc, k) => { const R = rng(inc.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)); const y = k * laneH + laneH / 2; const n = Math.min(26, Math.max(inc.signals.length, Math.round((inc.corr || 3) * 0.6)));
          const t0 = Math.max(inc.opened - 4 * MIN, now - span); const dots = [...inc.signals.map(x => ({ t: x.t, src: x.src })), ...Array.from({ length: Math.max(0, n - inc.signals.length) }, () => ({ t: t0 + R() * Math.min(12 * MIN, now - t0), src: ['Orchestrator', 'OpsRamp', 'Aruba Central', 'New Relic'][Math.floor(R() * 4)] }))];
          return <g key={inc.id} onClick={() => act.openInc(inc.id)} className="cursor-pointer"><rect x={lw} y={y - laneH / 2 + 2} width={W - lw - rw} height={laneH - 4} fill={k % 2 ? 'transparent' : 'rgb(var(--chip))'} opacity=".5" />
            <text x={0} y={y + 4} fontSize="11.5" fill="rgb(var(--ink))"><tspan fontWeight="700">{inc.id.slice(-4)}</tspan><tspan fill="rgb(var(--ink2))"> {inc.title.length > 30 ? inc.title.slice(0, 29) + '…' : inc.title}</tspan></text>
            {dots.map((d, j) => <circle key={j} cx={0} cy={0} r="3.2" fill={srcC[d.src] || C.s3} opacity=".9" style={{ transform: `translate(${X(d.t).toFixed(1)}px, ${(y + ((j * 5) % 9) - 4).toFixed(1)}px)`, transition: 'transform var(--tickh, 1s) linear' }} />)}</g>; })}
        {[90, 60, 30, 0].map(m => <text key={m} x={X(now - m * MIN)} y={H - 4} textAnchor={m === 90 ? 'start' : m === 0 ? 'end' : 'middle'} fontSize="10.5" fill="rgb(var(--ink3))">{m ? `-${m} min` : 'now'}</text>)}
      </svg></div>
    </Card>
  );
}

// ── Area-to-area correlation matrix ──────────────────────────────────
const CAT2 = c => /Carrier|SD-WAN|Major/.test(c) ? 0 : /Wireless|Switch|LAN|Customer|Config/.test(c) ? 2 : /Hardware|SD-WAN/.test(c) ? 3 : /Security|Lifecycle/.test(c) ? 4 : /readiness/i.test(c) ? 5 : 1;
export function CorrMatrix() {
  const { s, act } = useApp();
  const names = ['WAN', 'Apps', 'LAN', 'Edge', 'Security', 'Field'];
  const M = names.map(() => names.map(() => 0));
  s.incidents.filter(i => i.state !== 'Resolved').forEach(i => { const a = CAT2(i.cat); const imp = (i.impact || []).join(' '); const b = /POS|ERP|payment/i.test(imp) ? 1 : /handheld|AP|Wi-Fi|LAN/i.test(imp) ? 2 : /EdgeConnect|appliance|tunnel/i.test(imp) ? 3 : i.workOrder ? 5 : a; M[a][b]++; if (a !== b) M[b][a]++; });
  const max = Math.max(1, ...M.flat());
  return (
    <Card title="Area-to-area correlations" sub="Open incidents that link two areas. The diagonal is incidents inside one area.">
      <div className="overflow-x-auto"><table className="border-separate" style={{ borderSpacing: 3 }}><tbody>
        {names.map((r, i) => <tr key={r}><td className="text-[11.5px] text-ink2 pr-2 text-right">{r}</td>{names.map((c, j) => { const v = M[i][j]; return <td key={c} title={`${r} × ${c}: ${v}`} className="w-9 h-8 text-center text-[11.5px] font-bold rounded-[2px] cursor-default" style={{ background: v ? SEQ[Math.min(7, 2 + Math.round(v / max * 5))] : 'rgb(var(--chip))', color: v / max > 0.5 ? '#fff' : 'rgb(var(--ink))' }}>{v || ''}</td>; })}</tr>)}
        <tr><td />{names.map(c => <td key={c} className="text-[10.5px] text-ink3 text-center">{c}</td>)}</tr>
      </tbody></table></div>
    </Card>
  );
}

// ── Mova iO agents ───────────────────────────────────────────────────
const GC = [C.s4, C.s1, C.s5, C.s7, C.s6];
export function AgentActivity() {
  const { L } = useLive(); const now = useNow();
  const [ref, W] = useWidth(1000);
  const S = L.x.agentSeries; const n = S[0].length; const H = 170, L0 = 34, B = 20, T = 8;
  const tot = Array.from({ length: n }, (_, i) => S.reduce((a, s) => a + s[i], 0)); const hi = useScale(0, Math.max(10, ...tot) * 1.1)[1];
  const sk = useSlide(S[0]); const cid = React.useId().replace(/:/g, '');
  const X = i => L0 + (i / (n - 1)) * (W - L0 - 8), Y = v => T + (1 - v / hi) * (H - T - B);
  let acc = Array(n).fill(0);
  const layers = S.map((s, k) => { const lo = acc.slice(); acc = acc.map((v, i) => v + s[i]); const top = acc.slice(); return { k, d: top.map((v, i) => `${i ? 'L' : 'M'}${X(i)},${Y(v)}`).join('') + lo.map((v, i) => `L${X(n - 1 - i)},${Y(lo[n - 1 - i])}`).join('') + 'Z' }; });
  return (
    <Card title="Agent activity" sub={`Actions per minute, last 30 minutes. ${tot[n - 1]} so far this minute.`} right={<LiveTag />}>
      <Legend className="mb-1" items={AGENT_GROUPS.map((g, k) => [g, GC[k]])} />
      <div ref={ref}><svg width={W} height={H} className="block">
        {[0, 0.5, 1].map(f => <g key={f}><line x1={L0} x2={W - 8} y1={Y(hi * f)} y2={Y(hi * f)} stroke="rgb(var(--line))" /><text x={L0 - 6} y={Y(hi * f) + 4} textAnchor="end" fontSize="10.5" fill="rgb(var(--ink3))">{Math.round(hi * f)}</text></g>)}
        <defs><clipPath id={`aa${cid}`}><rect x={L0} y={0} width={W - L0 - 8} height={H} /></clipPath></defs>
        <g clipPath={`url(#aa${cid})`}><g key={sk} className={sk ? 'slide-x' : ''} style={{ '--dx': `${((W - L0 - 8) / (n - 1)).toFixed(2)}px` }}>
          {layers.map(l => <path key={l.k} className="morph" d={l.d} fill={GC[l.k]} opacity=".85" stroke="rgb(var(--panel))" strokeWidth=".6" />)}
        </g></g>
        <text x={L0} y={H - 4} fontSize="10.5" fill="rgb(var(--ink3))">{hhmm(now - 29 * MIN)}</text><text x={W - 8} y={H - 4} textAnchor="end" fontSize="10.5" fill="rgb(var(--ink3))">now</text>
      </svg></div>
    </Card>
  );
}
export function AgentCards() {
  const { L } = useLive(); const now = useNow();
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {AGENT_DEF.map((a, i) => { const g = L.x.agents[a.id]; const working = now - g.lastT < 4000; return (
        <div key={a.id} className={cx('bg-panel border rounded-lg p-3 min-w-0 transition-colors', working ? 'border-brand shadow-[0_0_0_1px_rgb(var(--brand))]' : 'border-line')}>
          <div className="flex items-start gap-2"><span className="w-8 h-8 rounded-lg bg-chip flex items-center justify-center text-brand shrink-0"><I.Bot size={16} /></span><div className="flex-1 min-w-0"><div className="text-[13.5px] font-bold text-ink">{a.name} <span className="text-ink3 font-normal text-[11.5px]">#{i + 1}</span></div><div className="text-[11.5px] text-ink3 leading-tight">{a.does}</div></div>
            <Badge tone={working ? 'brand' : 'gray'} className="shrink-0">{working ? <><span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />Working</> : 'Idle'}</Badge></div>
          <div className="grid grid-cols-2 gap-2 mt-2"><div className="bg-chip/60 rounded px-2 py-1"><div className="text-[11px] text-ink3">Actions today</div><div className="text-[18px] font-bold text-ink tabular-nums"><TweenNum value={num(g.today)} /></div></div><div className="bg-chip/60 rounded px-2 py-1"><div className="text-[11px] text-ink3">Success rate</div><div className="text-[18px] font-bold text-ink tabular-nums">{(g.ok * 100).toFixed(1)}%</div></div></div>
          <div className="text-[12px] text-ink2 mt-2 leading-snug line-clamp-2" title={g.last}><span className="text-ink3">Last:</span> {g.last}</div>
          <div className="flex items-center gap-1 mt-1.5">{a.tools.map(t => <Logo key={t} k={t} h={9} />)}<span className="ml-auto text-[11px] text-ink3">{ago(g.lastT, now)}</span></div>
        </div>); })}
    </div>
  );
}
export function AgentStream({ h = 820 }) {
  const { L } = useLive();
  const by = Object.fromEntries(AGENT_DEF.map(a => [a.id, a]));
  return (
    <Card title="Agent activity stream" right={<LiveTag />} pad={false}>
      <div className="overflow-y-auto px-3 pb-3" style={{ maxHeight: h }}>{L.x.agentStream.slice(0, 40).map(e => (
        <div key={e.id} className="py-1.5 border-b border-line/60 text-[12px] feed-in"><div className="flex items-center gap-1.5"><b className="text-ink">{by[e.agent].name}</b><code className="text-[11px] text-ink3">{hhmmss(e.t)}</code></div><div className="text-ink2 leading-snug">{e.text}</div></div>))}</div>
    </Card>
  );
}

// Event-rate columns for one tool: each new reading slides in from the right over one tick, and the
// height scale eases, so the columns drift left instead of every column re-growing at once.
function ToolBars({ ser }) {
  const k = useSlide(ser); const mx = useScale(0, Math.max(...ser))[1] || 1;
  return (
    <div className="h-9 mt-auto pt-1.5 overflow-hidden">
      <div key={k} className={cx('flex items-end gap-[2px] h-full', k && 'slide-x')} style={{ '--dx': `calc((100% + 2px) / ${ser.length})` }}>{ser.map((v, i) => <span key={i} className="flex-1 rounded-t-[1px]" style={{ height: `${Math.max(8, Math.min(100, v / mx * 100))}%`, background: i === ser.length - 1 ? C.s1 : 'rgb(var(--ink3) / .45)' }} />)}</div>
    </div>
  );
}

// ── Tools: status and event rate per source system ───────────────────
export function ToolsStrip({ only }) {
  const { L } = useLive(); const { s } = useApp(); const now = useNow();
  const head = { aruba: [`${num(Math.round(L.series.tunnels.at(-1)))} tunnels up`, '933 EdgeConnects, both paths'], central: [`${num(D.CENTRAL_N - Math.round((100 - L.series.reporting.at(-1)) * 10))} devices reporting`, `of ${num(D.CENTRAL_N)} in Central; 2,080 standalone`], opsramp: ['4,075 devices polled', 'SNMP, syslog, config backups'], newrelic: [`${D.APPS.length * 900} checks / 10 min`, 'synthetic app probes'], servicenow: [`${s.incidents.filter(i => i.state !== 'Resolved').length} open incidents`, `${s.approvals.filter(a => a.status === 'Pending').length} approvals waiting`], carrier: [`${s.cases.filter(c => !c.closed).length} carrier cases open`, 'AT&T, Lumen, Spectrum, Comcast, Verizon, Cox'] };
  const list = TOOLS.filter(t => !only || only.includes(t.id));
  return (
    <div className={cx('grid grid-cols-1 md:grid-cols-3 gap-3', list.length > 3 ? 'xl:grid-cols-6' : '')}>
      {list.map((t, k) => { const ser = L.x.tools[t.id]; return (
        <div key={t.id} className="card bg-panel border border-line rounded-lg p-3 min-w-0 flex flex-col">
          <div className="flex items-center gap-1.5 h-[18px]">{t.id === 'carrier' ? <I.RadioTower size={14} className="text-ink2" /> : <Logo k={t.id} h={11} />}<span className="flex-1" /><span className="w-2 h-2 rounded-full bg-ok" /></div>
          <div className="text-[12px] font-bold text-ink leading-tight mt-1">{t.name}</div>
          <div className="text-[14px] font-bold text-ink mt-1.5 leading-tight"><TweenNum value={head[t.id][0]} /></div><div className="text-[11px] text-ink3 leading-snug line-clamp-2">{head[t.id][1]}</div>
          <div className="text-[11px] text-ink2 mt-1"><b className="text-ink tabular-nums"><TweenNum value={ser.at(-1)} /></b> events/min · synced {(Math.floor(now / 1000) + k) % 6 + 1}s ago</div>
          <ToolBars ser={ser} />
        </div>); })}
    </div>
  );
}

// ── Branch health score distribution ─────────────────────────────────
export function ScoreHistogram() {
  const { s } = useApp(); const { L } = useLive();
  const list = filteredBranches(s);
  const scoreOf = b => { const h = healthOf(s, b); return h === 'down' ? 30 : h === 'degraded' ? 70 + (b.num % 10) : b.score; };
  const bins = Array.from({ length: 15 }, (_, i) => ({ lo: 30 + i * 5, n: 0 })); list.forEach(b => { const v = scoreOf(b); const k = Math.min(14, Math.max(0, Math.floor((v - 30) / 5))); bins[k].n++; });
  const mx = Math.max(1, ...bins.map(b => b.n)); const avg = list.reduce((a, b) => a + scoreOf(b), 0) / Math.max(1, list.length);
  return (
    <Card title="Branch health score distribution" sub={`${num(list.length)} branches. Good from 80, warning 60 to 79, critical below 60.`} right={<span className="text-[12px] text-ink2">Average <b className="text-ink text-[15px] tabular-nums" ><TweenNum value={avg.toFixed(1)} /></b></span>}>
      <div className="flex items-end gap-1 h-[150px] border-b border-line relative">
        {bins.map(b => <div key={b.lo} className="flex-1 flex flex-col items-center justify-end h-full group"><span className="text-[10.5px] text-ink2 mb-0.5 opacity-0 group-hover:opacity-100">{b.n}</span><span className="w-full rounded-t-[2px] transition-all duration-700" style={{ height: `${Math.max(b.n ? 2 : 0, Math.sqrt(b.n / mx) * 100)}%`, background: b.lo >= 80 ? C.s4 : b.lo >= 60 ? C.warn : C.bad }} /></div>)}
        <span className="absolute top-0 bottom-0 border-l border-dashed border-ink3" style={{ left: `${(50 / 75) * 100}%` }}><span className="absolute -top-0.5 left-1 text-[10.5px] text-ink3 whitespace-nowrap">good from 80</span></span>
      </div>
      <div className="flex justify-between text-[10.5px] text-ink3 mt-1"><span>30</span><span>50</span><span>70</span><span>90</span><span>100</span></div>
      <div className="text-[11px] text-ink3 mt-1">Bar height uses a square-root scale so the few critical branches stay visible.</div>
    </Card>
  );
}

// ── Calendar heat: incidents per day, last 12 weeks ──────────────────
export function CalendarHeat() {
  const now = useNow();
  const days = useMemo(() => { const R = rng(77); return Array.from({ length: 84 }, (_, i) => { const t = now - (83 - i) * 86400000; const dow = new Date(t).getDay(); const base = dow === 0 ? 9 : dow === 6 ? 13 : 23; const storm = i > 60 && i < 64 ? 18 : 0; return { t, v: Math.max(2, Math.round(base + (R() - 0.5) * 10 + storm)) }; }); }, []);
  const mx = Math.max(...days.map(d => d.v)); const tot = days.reduce((a, d) => a + d.v, 0);
  const [hv, setHv] = useState(null);
  return (
    <Card title="Incidents per day, last 12 weeks" sub={`${num(tot)} incidents, about ${Math.round(tot / 84)} a day. Weekends are quieter; the dark run is the hail storms.`}>
      <div className="flex gap-2"><div className="grid grid-rows-7 gap-[3px] text-[10px] text-ink3 pt-[1px]">{['Sun', '', 'Tue', '', 'Thu', '', 'Sat'].map((d, i) => <span key={i} className="h-[15px] leading-[15px]">{d}</span>)}</div>
        <div className="grid grid-flow-col grid-rows-7 gap-[3px]">{Array.from({ length: new Date(days[0].t).getDay() }).map((_, i) => <span key={`p${i}`} />)}{days.map(d => <span key={d.t} onMouseEnter={() => setHv(d)} onMouseLeave={() => setHv(null)} className="w-[15px] h-[15px] rounded-[2px]" style={{ background: SEQ[Math.min(7, Math.floor(d.v / mx * 7.99))] }} />)}</div></div>
      <div className="flex items-center gap-1 mt-2 text-[11px] text-ink3"><span className="mr-1">Fewer</span>{SEQ.map(c => <span key={c} className="w-3.5 h-2.5 rounded-[2px]" style={{ background: c }} />)}<span className="ml-1">More</span>{hv && <span className="ml-auto text-ink2">{new Date(hv.t).toDateString().slice(0, 10)}: <b className="text-ink">{hv.v}</b></span>}</div>
    </Card>
  );
}

// ── Alerts by area and hour (24 h) ───────────────────────────────────
export function AreaHourHeat() {
  const { L } = useLive(); const now = useNow();
  const vals = useMemo(() => { const R = rng(31); return AREAS.map((a, k) => Array.from({ length: 24 }, (_, h) => Math.round((k === 0 ? 30 : k === 2 ? 22 : k === 1 ? 14 : 8) * (0.55 + 0.6 * Math.sin((h - 5) / 24 * Math.PI * 2) ** 2) + R() * 6))); }, []);
  const hr = new Date(now).getHours();
  const live = vals.map((r, k) => r.map((v, h) => h === 23 ? Math.round(v * 0.4 + (L.x.lanes[AREAS[k].id].at(-1) > AREAS[k].base ? 6 : 2) + (L.counters.events % 7)) : v));
  const cols = Array.from({ length: 24 }, (_, i) => { const h = (hr - 23 + i + 24) % 24; return i === 23 ? 'now' : String(h).padStart(2, '0'); });
  const m = Math.max(...live.flat());
  const colr = v => SEQ[Math.min(7, Math.floor(v / m * 7.99))];
  return (
    <Card title="Alerts by area and hour" sub="Last 24 hours; the right-hand column fills as alerts arrive" right={<LiveTag />}>
      <div className="overflow-hidden"><table className="border-separate w-full table-fixed" style={{ borderSpacing: 1 }}><colgroup><col style={{ width: 126 }} />{cols.map((c, j) => <col key={j} />)}</colgroup><tbody>
        {AREAS.map((a, k) => <tr key={a.id}><td className="text-[11.5px] text-ink2 pr-2 whitespace-nowrap truncate">{a.label}</td>{live[k].map((v, j) => <td key={j} title={`${a.label}, ${cols[j]}: ${v}`} className="h-[17px] rounded-[2px] p-0 transition-colors duration-700" style={{ background: colr(v), boxShadow: j === 23 ? 'inset 0 0 0 1px rgb(var(--ink3))' : undefined }} />)}</tr>)}
        <tr><td />{cols.map((c, j) => <td key={j} className="text-[10px] text-ink3 text-center pt-1">{j % 3 === 2 || j === 23 ? c : ''}</td>)}</tr>
      </tbody></table></div>
    </Card>
  );
}

// ── Map overlay: live traffic arcs from busy branches to hosting ─────
export function MapFlows() {
  const { L } = useLive(); const { s } = useApp();
  const hubOf = n => D.BRANCHES.find(b => b.city === n);
  const hubs = [['Primary DC', hubOf('McKinney') || hubOf('Dallas')], ['Azure South Central', hubOf('San Antonio')], ['Azure East', hubOf('Richmond') || hubOf('Raleigh')]].filter(h => h[1]);
  const srcs = [...L.x.cands].sort((a, b) => b.wan - a.wan).slice(0, 18).map(c => D.BR[c.id]);
  const extra = s.incidents.filter(i => i.state !== 'Resolved').slice(0, 8).map(i => D.BR[i.branchId]);
  const all = [...new Map([...srcs, ...extra].map(b => [b.id, b])).values()];
  return (
    <g>
      {all.map((b, i) => { const h = hubs[i % hubs.length][1]; const hl = healthOf(s, b); const mx = (b.x + h.x) / 2, my = Math.min(b.y, h.y) - Math.abs(b.x - h.x) * 0.22 - 10; const col = hl === 'down' ? C.bad : hl === 'degraded' ? C.warn : C.s1;
        return <path key={b.id} d={`M${b.x},${b.y} Q${mx},${my} ${h.x},${h.y}`} fill="none" stroke={col} strokeWidth={hl === 'up' ? 1.1 : 1.6} strokeOpacity={hl === 'up' ? 0.55 : 0.85} strokeDasharray="3 5" className="flow-dash" style={{ animationDuration: `${1.4 + (i % 5) * 0.3}s` }} />; })}
      {hubs.map(([n, h]) => <g key={n} transform={`translate(${h.x},${h.y})`}><rect x="-6" y="-6" width="12" height="12" fill="rgb(var(--ink))" transform="rotate(45)" /><text x="10" y="4" fontSize="11" fontWeight="700" fill="rgb(var(--ink))" stroke="rgb(var(--panel))" strokeWidth="3" paintOrder="stroke">{n}</text></g>)}
    </g>
  );
}

export function ReadinessHex({ readinessOf }) {
  const { s, act } = useApp(); const { L } = useLive();
  const groups = useMemo(() => D.REGIONS.map(rg => { const bs = D.BRANCHES.filter(b => b.region === rg); const items = bs.map(b => { const r = readinessOf(b); const fail = r.results.filter(x => x.st === 'fail'), warn = r.results.filter(x => x.st === 'warn'); const st = fail.length ? 'fail' : warn.length ? 'warn' : 'pass'; return { id: b.id, st, color: st === 'fail' ? C.bad : st === 'warn' ? C.warn : '#a9cba9', dim: !inScope(s, b.id), title: `${b.name}: ${st === 'pass' ? 'all checks pass' : (fail[0] || warn[0]).detail}` }; }); return { label: rg, sub: `${bs.length} branches · ${items.filter(i => i.st !== 'pass').length} with issues`, items }; }), [s.incidents, s.branchHealth, s.circuitState, s.readiness, s.filters, Math.floor(L.last / 10000)]);
  return (
    <Card title="Readiness by branch" sub="Each hexagon is a branch, grouped by region, coloured by its worst pre-opening check. Click one to open it." right={<LiveTag />}>
      <HexMap groups={groups} onPick={it => act.openBranch(it.id)} legend={<Legend items={[['All checks pass', '#a9cba9'], ['Can trade, something degraded', C.warn], ['Not ready', C.bad]]} />} />
    </Card>
  );
}

// ── Carrier networks, live: one row per carrier ──────────────────────
export function CarrierNetworks() {
  const { L } = useLive(); const { s, act } = useApp();
  const t = Math.floor(L.last / 2000);
  const rows = useMemo(() => D.CARRIERS.map((k, i) => {
    const cs = D.CIRCUITS.filter(c => c.carrier === k).map(c => circuitOf(s, c.id)).filter(c => inScope(s, c.branchId));
    if (!cs.length) return null;
    const up = cs.filter(c => c.status === 'Up').length, deg = cs.filter(c => c.status === 'Degraded').length, dn = cs.filter(c => c.status === 'Down').length;
    const lat = cs.reduce((a, c) => a + c.lat, 0) / cs.length; const loss = cs.reduce((a, c) => a + c.loss, 0) / cs.length;
    const R = rng(i * 17 + 3); const series = Array.from({ length: 40 }, (_, j) => +(lat * (1 + 0.06 * Math.sin((t + j) * 0.5 + i) + (R() - 0.5) * 0.05)).toFixed(1));
    const sc = D.SCORECARD.find(x => x.carrier === k); const cases = s.cases.filter(c => c.carrier === k && !c.closed).length;
    return { k, n: cs.length, up, deg, dn, lat: series.at(-1), loss, series, sla: sc ? sc.slaMet : null, cases, types: [...new Set(cs.map(c => c.type))].join(', ') };
  }).filter(Boolean).sort((a, b) => b.n - a.n), [t, s.circuitState, s.cases, s.filters]);
  return (
    <Card title="Carrier networks, live" sub="Every circuit in view, grouped by carrier: status, latency to the data centre and open cases" right={<LiveTag />} pad={false}>
      <div className="overflow-x-auto"><table className="w-full text-[12.5px]">
        <thead><tr className="text-ink3 border-b border-line text-left"><th className="px-4 py-2 font-semibold">Carrier</th><th className="px-2 font-semibold text-right">Circuits</th><th className="px-2 font-semibold w-[200px]">Status</th><th className="px-2 font-semibold">Latency, live</th><th className="px-2 font-semibold text-right">Avg loss</th><th className="px-2 font-semibold text-right">Restore SLA</th><th className="px-2 font-semibold text-right">Open cases</th></tr></thead>
        <tbody>{rows.map(r => (
          <tr key={r.k} className="border-b border-line/70">
            <td className="px-4 py-2"><div className="font-bold text-ink">{r.k}</div><div className="text-[11px] text-ink3">{r.types}</div></td>
            <td className="px-2 text-right tabular-nums text-ink">{num(r.n)}</td>
            <td className="px-2"><div className="flex h-2.5 rounded-sm overflow-hidden bg-chip"><span style={{ width: `${r.up / r.n * 100}%`, background: C.ok }} /><span style={{ width: `${Math.max(r.deg ? 2 : 0, r.deg / r.n * 100)}%`, background: C.warn }} /><span style={{ width: `${Math.max(r.dn ? 2 : 0, r.dn / r.n * 100)}%`, background: C.bad }} /></div><div className="text-[11px] text-ink3 mt-0.5">{r.up} up{r.deg ? <span className="text-warn"> · {r.deg} degraded</span> : ''}{r.dn ? <span className="text-bad"> · {r.dn} down</span> : ''}</div></td>
            <td className="px-2"><div className="flex items-center gap-2"><Spark data={r.series} color={r.lat > 45 ? C.warn : C.s4} w={110} h={26} /><b className="tabular-nums text-ink whitespace-nowrap"><TweenNum value={`${Math.round(r.lat)} ms`} /></b></div></td>
            <td className="px-2 text-right tabular-nums">{r.loss.toFixed(2)}%</td>
            <td className={cx('px-2 text-right tabular-nums font-semibold', r.sla != null && r.sla < 0.9 ? 'text-warn' : 'text-ink')}>{r.sla != null ? `${Math.round(r.sla * 100)}%` : '—'}</td>
            <td className="px-2 text-right">{r.cases ? <button onClick={() => act.go('carriers')} className="font-bold text-ink tabular-nums">{r.cases}</button> : <span className="text-ink3">0</span>}</td>
          </tr>))}</tbody>
      </table></div>
    </Card>
  );
}
