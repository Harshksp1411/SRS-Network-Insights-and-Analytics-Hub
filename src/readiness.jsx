// Branch opening readiness: per-branch device and path checks (primary internet, backup line, EdgeConnect,
// switches, Wi-Fi, DHCP, config, POS and ERP paths), opening schedule by time zone
// and what Mova iO fixed overnight. Results are derived from live console state; overnight fixes are illustrative.
import React, { useMemo, useState } from 'react';
import * as I from 'lucide-react';
import * as D from './data.js';
import { useApp, useNow, healthOf, circuitOf, branchClock, inScope } from './store.jsx';
import { useLive } from './live.jsx';
import { Card, Badge, Btn, Tabs, cx, Logo } from './ui.jsx';
import { C, Legend, useWidth } from './charts.jsx';
import { rng, parts, tzAbbr, hhmm, hhmmss, num, MIN } from './util.js';

export const COLS = [
  { id: 'wan1', label: 'Primary', logo: 'aruba', tip: 'Primary internet line up and clean (Orchestrator)' },
  { id: 'wan2', label: 'Backup', logo: 'aruba', tip: 'Backup line up; LTE tested weekly' },
  { id: 'ec', label: 'EdgeConnect', logo: 'aruba', tip: 'EdgeConnect reachable, HA state, firmware' },
  { id: 'tun', label: 'Tunnels', logo: 'aruba', tip: 'Overlay tunnels to the data centre and Azure up on the active path' },
  { id: 'sw', label: 'Switches', logo: 'central', tip: 'All switches up, uplinks clean, no port errors' },
  { id: 'wifi', label: 'Wi-Fi', logo: 'central', tip: 'All access points up (office, warehouse, yard)' },
  { id: 'dhcp', label: 'DHCP', logo: 'opsramp', tip: 'Address pools below 85% on every branch VLAN' },
  { id: 'cfg', label: 'Config', logo: 'opsramp', tip: 'Last night\'s config backup taken; no drift from the golden config' },
  { id: 'pos', label: 'POS path', logo: 'opsramp', tip: 'PCI segment path to the payment processor under 400 ms' },
  { id: 'erp', label: 'ERP path', logo: 'opsramp', tip: 'Path to the data centre: latency and loss within limits' },
];
const FIXES = [
  ['wan2', 'LTE backup modem reset and re-test', 'RB-106'], ['wifi', 'Yard AP reboot outside hours', 'RB-104'], ['sw', 'Switch port bounce on an uplink', 'RB-103'],
  ['cfg', 'Config backup re-run (hash verified)', 'RB-109'], ['wan1', 'Carrier case resolved, back on primary', 'RB-102'], ['dhcp', 'Stale DHCP leases cleared on VLAN 30', 'RB-105'],
  ['tun', 'Tunnel to Azure re-keyed', 'RB-108'], ['ec', 'EdgeConnect HA pair re-synced', 'RB-108'],
];

export function branchChecks(s, b) {
  const h = healthOf(s, b); const p = circuitOf(s, b.wan[0]), sc = circuitOf(s, b.wan[1]);
  const incs = s.incidents.filter(i => i.branchId === b.id && i.state !== 'Resolved');
  const has = k => incs.some(i => i.kind === k);
  const R = rng(b.num * 31 + 7);
  const down = h === 'down';
  const c = {};
  const set = (id, st, detail) => { c[id] = { st, detail }; };
  set('wan1', down ? 'fail' : p.status === 'Down' ? 'fail' : p.status === 'Degraded' ? 'warn' : 'pass', `${p.carrier} ${p.type} ${p.bw} Mb/s · ${p.status === 'Up' ? `${p.lat} ms, loss ${p.loss}%` : p.status.toLowerCase()}`);
  set('wan2', down ? 'fail' : sc.status === 'Down' ? (p.status === 'Up' ? 'warn' : 'fail') : sc.status === 'Degraded' ? 'warn' : 'pass', `${sc.carrier} ${sc.type} · ${sc.status === 'Up' ? (sc.type === 'LTE/5G' ? 'weekly failover test passed' : 'up') : sc.status.toLowerCase()}`);
  set('ec', down ? 'fail' : 'pass', down ? 'EdgeConnect unreachable on both paths' : `${b.dev.ec === 2 ? 'HA pair' : 'EC-XS'} up, tunnels on ${p.status === 'Up' ? 'both paths' : 'backup'}`);
  set('tun', down ? 'fail' : p.status !== 'Up' && sc.status !== 'Up' ? 'fail' : p.status !== 'Up' ? 'warn' : 'pass', down ? 'No tunnels' : p.status !== 'Up' ? 'Tunnels up on the backup path only' : 'DC and Azure tunnels up on both paths');
  set('sw', down ? 'fail' : has('crc') || has('cpu') ? 'warn' : 'pass', has('cpu') ? 'Core switch CPU high (broadcast)' : has('crc') ? 'CRC errors on an uplink' : `${b.dev.sw}/${b.dev.sw} switches up, uplinks clean`);
  set('wifi', down ? 'fail' : has('apdown') ? (b.dev.ap <= 1 ? 'fail' : 'warn') : has('scanner') ? 'warn' : 'pass', has('apdown') ? (b.dev.ap <= 1 ? 'The only access point is down' : `${b.dev.ap - 1}/${b.dev.ap} APs up (one yard or warehouse AP down)`) : has('scanner') ? 'Roaming failures in the warehouse aisles' : `${b.dev.ap}/${b.dev.ap} APs up`);
  set('dhcp', down ? 'fail' : has('dhcp') ? 'fail' : 'pass', has('dhcp') ? 'VLAN 30 address pool 100% used' : `Largest pool ${38 + Math.floor(R() * 40)}% used`);
  const drift = R() < 0.01; set('cfg', has('backup') ? 'warn' : drift ? 'warn' : 'pass', has('backup') ? 'Nightly config backup failed' : drift ? 'Drift from golden config (2 lines)' : 'Backup taken 02:00, matches golden config');
  const posMs = 170 + Math.floor(R() * 140) + (p.status !== 'Up' ? 80 : 0);
  set('pos', down ? 'fail' : has('pos') ? 'fail' : has('jitter') ? 'warn' : 'pass', has('pos') ? 'POS path 1.9 s (limit 400 ms)' : `POS path ${posMs} ms`);
  set('erp', down ? 'fail' : has('jitter') ? 'warn' : 'pass', has('jitter') ? `Jitter ${p.jit} ms on the active path` : `${p.lat + 6} ms to DC, loss ${p.loss}%`);
  // overnight fixes: a small share of branches had one issue fixed by Mova iO before opening
  let fixed = null;
  if (!down && R() < 0.045) { const f = FIXES[Math.floor(R() * FIXES.length)]; if (c[f[0]].st === 'pass') { const t = `${String(Math.floor(R() * 5)).padStart(2, '0')}:${String(Math.floor(R() * 60)).padStart(2, '0')}`; fixed = { col: f[0], text: f[1], rb: f[2], t }; c[f[0]] = { ...c[f[0]], fixed: true, detail: `${t} ${f[1]} (${f[2]})` }; } }
  const vals = Object.values(c);
  const result = vals.some(x => x.st === 'fail') ? 'Not ready' : vals.some(x => x.st === 'warn') || incs.length ? 'Needs attention' : fixed ? 'Fixed overnight' : 'Ready';
  return { c, result, fixed, incs };
}

const RES_TONE = { 'Not ready': 'red', 'Needs attention': 'amber', 'Fixed overnight': 'purple', Ready: 'green' };
function Cell({ x }) {
  if (!x) return null;
  if (x.fixed) return <span title={x.detail} className="inline-flex w-5 h-5 rounded bg-brand/10 text-brand items-center justify-center"><I.Wrench size={12} /></span>;
  return <span title={x.detail} className="inline-flex">{x.st === 'pass' ? <I.Check size={15} className="text-ok" /> : x.st === 'warn' ? <I.AlertTriangle size={14} className="text-warn" /> : <I.X size={15} className="text-bad" strokeWidth={3} />}</span>;
}

const TZS = ['ET', 'CT', 'MT', 'MST', 'PT', 'AT', 'HT'];
const TZC = { ET: C.s4, CT: C.s1, MT: C.s5, MST: C.s7, PT: C.s6, AT: C.s2, HT: C.s3 };
const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

export function useReadiness(list) {
  const { s } = useApp(); const now = useNow();
  return useMemo(() => list.map(b => { const clk = branchClock(b, now); const p = parts(now, b.tz); const cur = p.h * 60 + p.m; const o = toMin(b.hours.open); const next = clk.open ? 0 : cur < o ? o - cur : 1440 - cur + o; return { id: b.id, b, clk, next, ...branchChecks(s, b) }; }), [list, s.incidents, s.circuitState, s.branchHealth, Math.floor(now / 30000)]);
}

export function PreopenBanner({ rows }) {
  const now = useNow();
  const toOpen = rows.filter(r => !r.clk.open && r.next <= 12 * 60).sort((a, b) => a.next - b.next);
  const openNow = rows.filter(r => r.clk.open).length;
  const next = toOpen[0];
  const secs = 300 - Math.floor(now / 1000) % 300;
  const p = parts(now);
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border border-ok/40 bg-ok/5 rounded-lg px-4 py-2.5 text-[13px] relative overflow-hidden">
      <span className="inline-flex items-center gap-2 font-bold text-ink"><span className="w-2 h-2 rounded-full bg-ok animate-pulse" />Pre-opening monitoring</span>
      <span className="text-ink2"><b className="text-ink">{num(toOpen.length)}</b> opening in the next 12 hours · <b className="text-ink">{num(openNow)}</b> open now</span>
      {next ? <span className="text-ink2">Next to open: <b className="text-ink">{next.b.name}</b> at {next.b.hours.open} {tzAbbr(next.b.tz)}, in <b className="text-ink">{next.next >= 60 ? `${Math.floor(next.next / 60)} h ${next.next % 60} min` : `${next.next} min`}</b></span> : <span className="text-ink2">No more openings today. Checks run again at 05:30 local.</span>}
      <span className="ml-auto text-ink3 tabular-nums">Last re-check {String(p.h).padStart(2, '0')}:{String(Math.floor(p.m / 5) * 5).padStart(2, '0')} CT · next in {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}</span>
      <span className="absolute left-0 bottom-0 h-[2px] bg-ok transition-all duration-1000" style={{ width: `${(1 - secs / 300) * 100}%` }} />
    </div>
  );
}

export function ReadinessSummary({ rows }) {
  const n = k => rows.filter(r => r.result === k).length;
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-4">
        <div className="mr-4"><div className="text-[12.5px] text-ink2">Branches checked this morning · run 05:30 local</div><div className="text-[36px] font-bold text-ink leading-none mt-1 tabular-nums">{num(rows.length)}</div></div>
        {[['Ready', 'text-ok', 'Ready'], ['Fixed overnight by Mova iO', 'text-brand', 'Fixed overnight'], ['Needs attention', 'text-warn', 'Needs attention'], ['Not ready', 'text-bad', 'Not ready']].map(([l, tc, k]) => (
          <div key={k} className="border border-line rounded-lg px-4 py-2 min-w-[150px]"><div className="text-[12px] text-ink2">{l}</div><div className={cx('text-[26px] font-bold leading-tight tabular-nums', tc)}>{num(n(k))}</div></div>))}
        <div className="flex-1 min-w-[220px]"><div className="flex h-3 rounded overflow-hidden bg-chip">{[['Ready', C.ok], ['Fixed overnight', C.s1], ['Needs attention', C.warn], ['Not ready', C.bad]].map(([k, c]) => <span key={k} title={`${k}: ${n(k)}`} style={{ width: `${n(k) / Math.max(1, rows.length) * 100}%`, background: c }} className="transition-all duration-700" />)}</div><div className="text-[11.5px] text-ink3 mt-1">{(n('Ready') / Math.max(1, rows.length) * 100).toFixed(1)}% ready with nothing to do</div></div>
      </div>
    </Card>
  );
}

export function OpenByTimezone({ rows }) {
  const now = useNow();
  const g = TZS.map(z => { const rs = rows.filter(r => tzAbbr(r.b.tz) === z); return { z, n: rs.length, open: rs.filter(r => r.clk.open).length }; }).filter(x => x.n);
  const tot = g.reduce((a, x) => a + x.n, 0), op = g.reduce((a, x) => a + x.open, 0);
  const S = 190, c0 = S / 2;
  return (
    <Card title="Branches open by time zone" sub={`As of ${hhmmss(now)} CT`} right={<span className="text-[11px] font-bold text-ok inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-ok animate-pulse" />Live</span>}>
      <div className="flex items-center gap-5">
        <svg width={S} height={S} className="shrink-0">{g.map((x, i) => { const r = c0 - 8 - i * 11; const cir = 2 * Math.PI * r; const f = x.open / x.n; return <g key={x.z}><circle cx={c0} cy={c0} r={r} fill="none" stroke="rgb(var(--chip))" strokeWidth="8" /><circle cx={c0} cy={c0} r={r} fill="none" stroke={TZC[x.z]} strokeWidth="8" strokeDasharray={`${cir * f} ${cir}`} strokeLinecap="round" transform={`rotate(-90 ${c0} ${c0})`} className="transition-all duration-700" /></g>; })}
          <text x={c0} y={c0 + 2} textAnchor="middle" fontSize="22" fontWeight="700" fill="rgb(var(--ink))">{Math.round(op / Math.max(1, tot) * 100)}%</text><text x={c0} y={c0 + 18} textAnchor="middle" fontSize="10.5" fill="rgb(var(--ink3))">{op} of {tot} open</text></svg>
        <div className="flex-1 space-y-1.5 text-[12.5px]">{g.map(x => <div key={x.z} className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: TZC[x.z] }} /><span className="text-ink2 flex-1">{{ ET: 'Eastern', CT: 'Central', MT: 'Mountain', MST: 'Arizona', PT: 'Pacific', AT: 'Atlantic', HT: 'Hawaii' }[x.z]}</span><b className="text-ink tabular-nums">{x.open} / {x.n}</b></div>)}</div>
      </div>
    </Card>
  );
}

export function OpeningSchedule({ rows }) {
  const now = useNow(); const [ref, W] = useWidth(600);
  const cp = parts(now); const ctMin = cp.h * 60 + cp.m;
  const off = useMemo(() => { const o = {}; rows.forEach(r => { if (o[r.b.tz] == null) { const p = parts(now, r.b.tz); o[r.b.tz] = ((p.h * 60 + p.m) - ctMin + 1440 + 720) % 1440 - 720; } }); return o; }, [rows.length]);
  const start = 3 * 60 + 30, end = 10 * 60 + 30, step = 15, nb = (end - start) / step;
  const bins = Array.from({ length: nb }, () => ({}));
  rows.forEach(r => { const o = r.clk.opens || r.b.hours.open; const ct = toMin(o) - off[r.b.tz]; const k = Math.floor((ct - start) / step); if (k >= 0 && k < nb) { const z = tzAbbr(r.b.tz); bins[k][z] = (bins[k][z] || 0) + 1; } });
  const mx = Math.max(1, ...bins.map(b => Object.values(b).reduce((a, v) => a + v, 0)));
  const H = 170, L = 30, B = 20, bw = (W - L) / nb;
  const nowX = ctMin >= start && ctMin <= end ? L + (ctMin - start) / (end - start) * (W - L) : null;
  return (
    <Card title="Opening schedule" sub="Branch openings in 15-minute steps, shown in Central time" right={<Legend items={TZS.filter(z => rows.some(r => tzAbbr(r.b.tz) === z)).map(z => [z, TZC[z]])} />}>
      <div ref={ref}><svg width={W} height={H} className="block">
        {[0, 0.5, 1].map(f => <g key={f}><line x1={L} x2={W} y1={(H - B) * (1 - f) + 4} y2={(H - B) * (1 - f) + 4} stroke="rgb(var(--line))" /><text x={L - 5} y={(H - B) * (1 - f) + 8} textAnchor="end" fontSize="10.5" fill="rgb(var(--ink3))">{Math.round(mx * f)}</text></g>)}
        {bins.map((b, i) => { let y = H - B + 4; return <g key={i}>{TZS.map(z => { const v = b[z] || 0; if (!v) return null; const h = v / mx * (H - B - 8); y -= h; const past = nowX != null && L + (i + 1) * bw < nowX; return <rect key={z} x={L + i * bw + bw * 0.18} y={y} width={bw * 0.64} height={Math.max(1, h - 1)} fill={TZC[z]} opacity={past ? 0.45 : 1}><title>{`${z} ${hhmmFromMin(start + i * step)} CT: ${v}`}</title></rect>; })}</g>; })}
        {Array.from({ length: 8 }, (_, i) => <text key={i} x={Math.min(W - 1, L + (i * 4) * bw)} y={H - 4} fontSize="10.5" fill="rgb(var(--ink3))" textAnchor={i === 0 ? 'start' : L + (i * 4) * bw + 16 > W ? 'end' : 'middle'}>{hhmmFromMin(start + i * 60)}</text>)}
        {nowX != null && <g><line x1={nowX} x2={nowX} y1={4} y2={H - B + 4} stroke="rgb(var(--ink))" strokeDasharray="3 3" /><text x={nowX + 4} y={14} fontSize="10.5" fontWeight="700" fill="rgb(var(--ink))">now</text></g>}
      </svg></div>
      {nowX == null && <div className="text-[11.5px] text-ink3">Shows the next opening wave. Checks start at 05:30 local in each time zone.</div>}
    </Card>
  );
}
const hhmmFromMin = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export function ReadinessTable({ rows, onRerun, onRaise, running }) {
  const { act } = useApp();
  const [tab, setTab] = useState('look');
  const [n, setN] = useState(40);
  const order = { 'Not ready': 0, 'Needs attention': 1, 'Fixed overnight': 2, Ready: 3 };
  const sorted = [...rows].sort((a, b) => order[a.result] - order[b.result] || a.next - b.next);
  const shown = sorted.filter(r => tab === 'all' ? true : tab === 'look' ? r.result !== 'Ready' : tab === 'not' ? r.result === 'Not ready' : tab === 'att' ? r.result === 'Needs attention' : r.result === 'Fixed overnight');
  const cnt = k => rows.filter(r => r.result === k).length;
  const first = r => { const x = Object.values(r.c).find(v => v.st === 'fail') || Object.values(r.c).find(v => v.st === 'warn'); return x ? x.detail : r.fixed ? `${r.fixed.t} ${r.fixed.text}` : r.incs[0] ? r.incs[0].title : 'All checks pass'; };
  return (
    <Card title="Readiness by branch" sub={`${Math.min(n, shown.length)} shown of ${num(shown.length)}. Hover any icon for the reading.`} pad={false}
      right={<Tabs size="sm" value={tab} onChange={t => { setTab(t); setN(40); }} tabs={[{ id: 'look', label: 'Needs a look', count: rows.length - cnt('Ready') }, { id: 'not', label: 'Not ready', count: cnt('Not ready') }, { id: 'att', label: 'Attention', count: cnt('Needs attention') }, { id: 'fix', label: 'Fixed overnight', count: cnt('Fixed overnight') }, { id: 'all', label: 'All', count: rows.length }]} />}>
      <div className="overflow-x-auto"><table className="w-full text-[12.5px]">
        <thead><tr className="text-ink3 border-b border-line">
          <th className="text-left font-semibold px-2 py-2">Branch</th><th className="text-left font-semibold px-2">Opens</th><th className="text-left font-semibold px-2">Result</th>
          {COLS.map(c => <th key={c.id} title={c.tip} className="font-semibold px-0.5 py-2 text-center text-[11px] leading-tight">{c.label === 'EdgeConnect' ? <>Edge<br />Connect</> : c.label === 'POS path' ? <>POS<br />path</> : c.label === 'ERP path' ? <>ERP<br />path</> : c.label}</th>)}
          <th className="font-semibold px-1 text-center text-[11px]">Incident</th><th className="text-left font-semibold px-2 text-[11px] leading-tight">Act before<br />opening</th>
        </tr></thead>
        <tbody>{shown.slice(0, n).map(r => (
          <tr key={r.id} className="border-b border-line/70 hover:bg-chip/40">
            <td className="px-3 py-1.5"><button onClick={() => act.openBranch(r.b.id)} className="text-left"><div className="font-semibold text-ink hover:underline whitespace-nowrap">{r.b.name}</div><div className="text-[11.5px] text-ink2 truncate max-w-[180px]" title={`${r.b.brand}. ${first(r)}`}>{first(r)}</div></button></td>
            <td className="px-2 whitespace-nowrap"><div className="text-ink">{r.clk.opens || r.b.hours.open} {tzAbbr(r.b.tz)}</div><div className={cx('text-[11.5px]', r.clk.open ? 'text-ok' : 'text-ink3')}>{r.clk.open ? 'Open now' : `in ${r.next >= 60 ? `${Math.floor(r.next / 60)} h ${r.next % 60} m` : `${r.next} min`}`}</div></td>
            <td className="px-2"><Badge tone={RES_TONE[r.result]}>{r.result}</Badge></td>
            {COLS.map(c => <td key={c.id} className="text-center px-0.5"><Cell x={r.c[c.id]} /></td>)}
            <td className="text-center px-2">{r.incs.length ? <button onClick={() => act.openInc(r.incs[0].id)} title={r.incs[0].title}><I.AlertTriangle size={14} className="text-warn inline" /></button> : <I.Check size={15} className="text-ok inline" />}</td>
            <td className="px-2 whitespace-nowrap">{r.result === 'Ready' || r.result === 'Fixed overnight' ? <span className="text-[12px] text-ink3">No action</span> : <span className="inline-flex items-center gap-1">{r.incs[0] && <button onClick={() => act.openInc(r.incs[0].id)} className="text-[11.5px] text-info hover:underline mr-1">{r.incs[0].id.slice(-4)}</button>}<Btn size="xs" icon={I.RefreshCw} title="Re-run checks" disabled={running[r.b.id]} onClick={() => onRerun(r.b)} /><Btn size="xs" icon={I.TicketPlus} title="Raise ticket" onClick={() => onRaise(r.b)} /><Btn size="xs" icon={I.Send} title="Message branch manager" onClick={() => act.toast(`Message sent to the ${r.b.name} branch manager`, 'info')} /></span>}</td>
          </tr>))}</tbody>
      </table></div>
      <div className="flex items-center gap-3 px-3 py-2 text-[11.5px] text-ink3 border-t border-line">
        <span>Primary, Backup, EdgeConnect, Tunnels: Orchestrator. Switches, Wi-Fi: Aruba Central. DHCP, Config, POS and ERP paths: OpsRamp and synthetic probes. LTE backups are tested weekly. Wrench: fixed overnight by Mova iO.</span>
        {shown.length > n && <Btn size="xs" className="ml-auto" onClick={() => setN(x => x + 40)}>Show 40 more</Btn>}
      </div>
    </Card>
  );
}

export function PreopenStream() {
  const { L } = useLive(); const { act } = useApp();
  const items = L.feed.filter(e => e.cat === 'readiness' || e.cat === 'carriers' || e.cat === 'inventory').slice(0, 9);
  return (
    <Card title="Pre-opening checks" sub={`${Math.round(L.series.raw.at(-1) * 1.6)} readings a minute from Orchestrator, Central, OpsRamp and New Relic`} right={<code className="text-[11.5px] text-ink3 tabular-nums">{hhmmss(L.last)}</code>} pad={false}>
      <div className="px-4 pb-3">{items.map(e => <button key={e.id} onClick={() => act.openBranch(e.branchId)} className="w-full flex items-center gap-2 py-1.5 border-b border-line/60 text-[12px] text-left feed-in hover:bg-chip/40"><code className="text-[11px] text-ink3 w-[56px] shrink-0">{hhmmss(e.t)}</code><span className={cx('w-1.5 h-1.5 rounded-full shrink-0', /Watch|Major/.test(e.out + e.sev) ? 'bg-warn' : 'bg-ok')} /><span className="flex-1 truncate text-ink"><code className="text-[11.5px]">{e.msg}</code> <span className="text-ink3">· {D.BR[e.branchId].name}</span></span></button>)}</div>
    </Card>
  );
}

export function FixedOvernight({ rows }) {
  const fixes = rows.filter(r => r.fixed).sort((a, b) => a.fixed.t.localeCompare(b.fixed.t));
  const { act } = useApp();
  return (
    <Card title="Fixed overnight" sub={`By Mova iO between midnight and 05:30 local, with no engineer woken. ${fixes.length} branches.`} icon={I.Wrench}>
      <div className="relative pl-4"><span className="absolute left-[5px] top-1 bottom-1 w-px bg-line" />
        {fixes.slice(0, 24).map(r => <button key={r.id} onClick={() => act.openBranch(r.b.id)} className="relative w-full flex items-center gap-2 py-1 text-[12.5px] text-left hover:bg-chip/40"><span className="absolute -left-[15px] w-2.5 h-2.5 rounded-full border-2 border-brand bg-panel" /><code className="text-[11.5px] text-ink3 w-10">{r.fixed.t}</code><span className="text-ink">{r.fixed.text}</span><span className="text-ink3">· {r.b.name}</span><span className="ml-auto text-[11px] text-ink3">{r.fixed.rb} {tzAbbr(r.b.tz)}</span></button>)}
        {!fixes.length && <div className="text-[12.5px] text-ink3">Nothing needed fixing overnight in this view.</div>}
      </div>
    </Card>
  );
}
