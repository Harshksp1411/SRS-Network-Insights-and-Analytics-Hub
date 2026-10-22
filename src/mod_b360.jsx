import React, { useState, useMemo, useRef } from 'react';
import * as I from 'lucide-react';
import * as D from './data.js';
import * as P from './predict.js';
import { useApp, useNow, healthOf, circuitOf, branchClock, gate, slaClock, cityKey } from './store.jsx';
import { useLive } from './live.jsx';
import { Card, Badge, Btn, Table, Dot, Pri, KV, Progress, Logo, Modal, Tabs, cx, healthTone, Illus } from './ui.jsx';
import { Spark, LineChart, Bars, Legend, Ring, C, useWidth, useTween } from './charts.jsx';
import { num, pct, dur, ago, hhmm, hhmmss, dt, dateShort, rng, MIN, HR, DAY, T0, exportCSV } from './util.js';
import { baseReadiness } from './mod_ops.jsx';

// ───────── gauge with normal / warning / critical outer bands ─────────
function Gauge({ value: v0, min = 0, max, warn, crit, label, sub, unit, fmt = v => v, invert }) {
  const value = useTween(v0, 1400);
  const W = 180, H = 136, cx0 = 90, cy0 = 88, R = 64;
  const a0 = -210, a1 = 30; // degrees
  const ang = v => a0 + (Math.max(min, Math.min(max, v)) - min) / (max - min) * (a1 - a0);
  const pt = (deg, r) => [cx0 + r * Math.cos(deg * Math.PI / 180), cy0 + r * Math.sin(deg * Math.PI / 180)];
  const arc = (d0, d1, r) => { const [x0, y0] = pt(d0, r), [x1, y1] = pt(d1, r); return `M${x0},${y0} A${r},${r} 0 ${d1 - d0 > 180 ? 1 : 0} 1 ${x1},${y1}`; };
  const bad = invert ? value < crit : value > crit, mid = invert ? value < warn : value > warn;
  const col = bad ? C.bad : mid ? C.warn : '#1f7a3a';
  const bands = invert ? [[min, crit, C.bad], [crit, warn, C.warn], [warn, max, '#1f7a3a']] : [[min, warn, '#1f7a3a'], [warn, crit, C.warn], [crit, max, C.bad]];
  const [nx, ny] = pt(ang(value), R - 20);
  return (
    <div className="flex flex-col items-center min-w-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full h-auto" style={{ maxWidth: W }}>
        {bands.map(([f, t, c], i) => <path key={i} d={arc(ang(f), ang(t), R + 7)} stroke={c} strokeWidth="4" fill="none" opacity="0.55" />)}
        <path d={arc(a0, a1, R - 5)} className="stroke-chip" strokeWidth="11" fill="none" />
        <path d={arc(a0, ang(value), R - 5)} stroke={col} strokeWidth="11" fill="none" strokeLinecap="butt" style={{ transition: 'all .6s' }} />
        <line x1={cx0} y1={cy0} x2={nx} y2={ny} className="stroke-ink" strokeWidth="2.4" strokeLinecap="round" style={{ transition: 'all .6s' }} />
        <circle cx={cx0} cy={cy0} r="4.5" className="fill-ink" />
        <text x={cx0} y={cy0 + 34} textAnchor="middle" fontSize="21" fontWeight="700" className="fill-ink">{fmt(value)}<tspan fontSize="11" fontWeight="400" className="fill-ink3">{unit ? ` ${unit}` : ''}</tspan></text>
      </svg>
      <div className="text-[13px] font-bold text-ink">{label}</div>
      <div className="text-[11.5px] text-ink3">{sub}</div>
    </div>
  );
}

const hashOf = b => b.num * 2654435761 % 1000 / 1000;

function useBranchLive(s, b) {
  const { L, ver } = useLive();
  const hist = useRef({ id: null, lat: [], loss: [], jit: [], pos: [], ev: [] });
  const h = hist.current;
  const p = circuitOf(s, b.wan[0]), sc = circuitOf(s, b.wan[1]);
  const incs = s.incidents.filter(i => i.branchId === b.id && i.state !== 'Resolved');
  const steer = s.steer && s.steer[b.id];
  const onBackup = p.status === 'Down' || !!steer;
  const path = onBackup ? sc : p;
  // One consistent picture of the line the branch is using. A degraded line (congestion or a carrier fault)
  // shows higher latency, jitter and loss together; Wi-Fi is measured inside the branch and does not depend on the WAN.
  const dW = (L.series.wan.at(-1) - D.AVG_LAT) * 0.3;
  const R = Math.random;
  const deg = path.status === 'Degraded';
  const jT = deg ? (path.jit || 30) : path.jit || 1.5, lT = deg ? (path.loss || 2) : path.loss || 0.05;
  const latT = path.lat + (deg ? 18 + jT * 0.9 : 0);
  const base = { lat: Math.max(2, latT + dW + (R() - 0.5) * (deg ? jT * 0.5 : Math.max(1, path.jit))), loss: Math.max(0, lT + (R() - 0.5) * (deg ? 0.6 : 0.04)), jit: Math.max(0.2, jT + (R() - 0.5) * (deg ? 5 : 0.6)) };
  const useT = onBackup ? (path.type === 'LTE/5G' ? 52 + hashOf(b) * 30 : Math.min(85, p.util * 1.3 + 12)) : path.util + (deg ? 14 : 0);
  const util = Math.min(98, Math.max(2, useT + (R() - 0.5) * 6));
  // What the business feels, worked out from the line: payment round trip, ERP login, call quality
  const pay = 2 * base.lat + 70 + base.loss * 140;
  const erp = 0.8 + base.lat * 0.006 + base.loss * 0.35;
  const mos = Math.max(1, Math.min(4.4, 4.4 - base.jit * 0.02 - base.loss * 0.4 - Math.max(0, base.lat - 150) * 0.004));
  const pos = pay;
  const wifi = 93 - incs.filter(i => i.kind === 'apdown').length * 11 - incs.filter(i => ['scanner', 'dhcp'].includes(i.kind)).length * 14 + (R() - 0.5) * 2;
  const roof = erp;
  const down = healthOf(s, b) === 'down';
  if (h.id !== b.id) { // seed 3 minutes of history
    h.id = b.id; h.ev = []; const r = rng(b.num);
    h.lat = Array.from({ length: 90 }, () => +(latT + (r() - 0.5) * (deg ? jT * 0.5 : Math.max(1, path.jit))).toFixed(1)); h.loss = Array.from({ length: 90 }, () => +Math.max(0, lT + (r() - 0.5) * (deg ? 0.6 : 0.04)).toFixed(2)); h.jit = Array.from({ length: 90 }, () => +Math.max(0.2, jT + (r() - 0.5) * (deg ? 5 : 0.6)).toFixed(1)); h.pos = Array.from({ length: 90 }, () => Math.round(useT + (r() - 0.5) * 6));
    h.ver = ver;
  }
  if (h.ver !== ver) {
    h.ver = ver;
    const push = (k, v) => { h[k] = [...h[k].slice(1), v]; };
    push('lat', down ? null : +base.lat.toFixed(1)); push('loss', down ? null : +base.loss.toFixed(2)); push('jit', down ? null : +base.jit.toFixed(1)); push('pos', down ? null : Math.round(util));
    const devs = D.devicesOf(b.id);
    const ap = devs.find(d => d.type === 'AP') || devs[0], sw = devs.find(d => d.type === 'Switch') || devs[0];
    const tpl = [
      ['OpsRamp', `${sw.id} interfaces: InErrors = 0, PortsUp = ${18 + (b.num % 20)}`],
      ['Orchestrator', `${b.code}-ec01 ${onBackup ? 'wan2' : 'wan1'}: latency ${Math.round(base.lat)} ms, loss ${base.loss.toFixed(2)}%`],
      ['Aruba Central', `${ap.id} clients = ${6 + Math.floor(R() * 14)}, channel util ${20 + Math.floor(R() * 30)}%`],
      ['Synthetic', `Payment path test ${Math.round(pay)} ms, ERP login ${erp.toFixed(1)} s`],
      ['Orchestrator', `${b.code}-ec01 ${onBackup ? 'wan2' : 'wan1'} jitter ${base.jit.toFixed(1)} ms, WAN use ${Math.round(util)}%`],
      ['Aruba Central', `${sw.id} uplink 1/1/49 up, CRC errors 0, utilisation ${12 + Math.floor(R() * 30)}%`],
    ];
    if (!down) { const k = h.ev.length < 6 ? 6 : 1; const add = []; for (let j = 0; j < k; j++) { const t = tpl[(Math.floor(R() * tpl.length) + j) % tpl.length]; add.push({ id: `${Date.now()}-${j}`, t: Date.now() - j * 1700, src: t[0], msg: t[1] }); } h.ev = [...add, ...h.ev].slice(0, 30); }
  }
  return { L, ver, h, p, sc, path, onBackup, steer, down, cur: { lat: down ? 0 : base.lat, loss: down ? 100 : base.loss, jit: down ? 0 : base.jit, pos: down ? 0 : pos, pay: down ? 0 : pay, erp: down ? 0 : erp, mos: down ? 0 : mos, util: down ? 0 : util, wifi: down ? 0 : wifi, roof: down ? 0 : roof, deg }, incs };
}

export function healthBreakdown(s, b, x) {
  const devs = D.devicesOf(b.id);
  const vul = devs.filter(d => D.vulnsOf(d).some(a => a.sev === 'Critical')).length;
  const life = devs.filter(d => { const l = D.lifecycleOf(d); return l.status === 'End of support' || (l.status === 'End of sale' && l.tone === 'red'); }).length;
  const rd = (s.readiness[b.id] || baseReadiness(s, b)).results;
  const net = x.down ? 10 : Math.max(20, 100 - (x.p.status === 'Down' ? 22 : x.p.status === 'Degraded' ? 14 : 0) - (x.sc.status !== 'Up' ? 14 : 0) - Math.max(0, x.cur.loss - 0.3) * 8 - Math.max(0, x.cur.jit - 10) * 0.4);
  const parts = [
    ['Network', Math.round(net)], ['Wi-Fi', Math.round(Math.max(10, Math.min(100, x.cur.wifi + 4)))], ['Devices', x.down ? 10 : 100 - x.incs.filter(i => ['apdown', 'crc', 'cpu'].includes(i.kind)).length * 9],
    ['Applications', x.down ? 10 : (x.cur.pay > 400 || x.cur.mos < 3.6 || x.cur.erp > 2) ? 62 : 98], ['Security', Math.max(40, 100 - vul * 7)], ['Lifecycle', Math.max(45, 100 - life * 9)],
    ['Open incidents', Math.max(30, 100 - x.incs.length * 12)], ['Readiness', Math.round(100 * rd.filter(r => r.st === 'pass').length / rd.length)],
  ];
  const score = Math.round(parts.reduce((a, p, i) => a + p[1] * [0.22, 0.12, 0.12, 0.16, 0.1, 0.06, 0.14, 0.08][i], 0));
  return { parts, score, vul, life };
}

function riskNext4h(s, b, x, hb) {
  const drivers = [];
  const p = x.p;
  if (p.tickets90 >= 3) drivers.push([`Primary ${p.carrier} ${p.type} is a repeat offender (${p.tickets90} tickets in 90 days)`, 14]);
  if (s.predictions.some(q => q.branchId === b.id && ['New', 'Watching'].includes(q.status))) drivers.push(['Open prediction on a device or circuit at this branch', 18]);
  if (x.sc.status !== 'Up') drivers.push(['Backup path not passing traffic: no failover if primary drops', 22]);
  if (x.cur.deg && !x.onBackup) drivers.push([`Main line unstable now: ${x.cur.loss.toFixed(1)}% loss, ${Math.round(x.cur.jit)} ms jitter`, 26]);
  if (x.onBackup) drivers.push(['Trading on the backup line: no second line if it drops', 16]);
  if (x.incs.length) drivers.push([`${x.incs.length} open incident${x.incs.length > 1 ? 's' : ''} at the branch`, 10 * x.incs.length]);
  if (hb.vul) drivers.push([`${hb.vul} device${hb.vul > 1 ? 's' : ''} with a critical vulnerability unpatched`, 6]);
  if (s.incidents.some(i => i.major && i.state !== 'Resolved' && D.BR[i.branchId].region === b.region)) drivers.push(['Severe weather major incident open in this region', 20]);
  const clk = branchClock(b, Date.now());
  if (clk.open && b.size === 'L') drivers.push(['Large branch trading now: busiest counter and yard hours', 4]);
  const score = Math.min(95, 4 + drivers.reduce((a, d) => a + d[1], 0) + (x.down ? 40 : 0));
  return { score, drivers };
}

function Ev({ e }) { return <div className="flex items-center gap-2 px-3 py-1.5 text-[12.5px] border-b border-line/70 feed-in"><span className="font-mono text-ink3 w-[58px] shrink-0">{hhmmss(e.t)}</span><Dot tone="green" /><span className="w-[92px] shrink-0 text-ink3 text-[11.5px]">{e.src}</span><span className="text-ink truncate">{e.msg}</span></div>; }

function DepGraph({ s, b, x }) {
  const devs = D.devicesOf(b.id);
  const sw = devs.filter(d => d.type === 'Switch').length, ap = devs.filter(d => d.type === 'AP').length;
  const cols = [
    ['Business service', [['Branch trading', `${b.name}`, 'up']]],
    ['Applications', D.APPS.map(a => [a.short, a.host, x.down ? 'down' : (a.id === 'pos' && x.cur.pay > 400) || (a.id === 'voice' && x.cur.mos < 3.6) || (a.id === 'erp' && x.cur.erp > 2) ? 'degraded' : 'up'])],
    ['Branch infrastructure', [[`${sw} switch${sw > 1 ? 'es' : ''}`, 'Aruba CX / 2530', x.down ? 'down' : 'up'], [`${ap} access points`, 'office, warehouse, yard', x.down ? 'down' : x.incs.some(i => i.kind === 'apdown') ? 'degraded' : 'up'], ['PCI segment', 'VLAN 20, payment path', x.down ? 'down' : 'up'], ['VLANs and DHCP', 'VLANs 10, 30, 40', x.down ? 'down' : x.incs.some(i => ['scanner', 'dhcp'].includes(i.kind)) ? 'degraded' : 'up']]],
    ['Connectivity', [[`${b.code}-ec01`, b.dev.ec === 2 ? 'EdgeConnect HA pair' : 'EdgeConnect EC-XS', x.down ? 'down' : 'up'], [b.wan[0], `${x.p.carrier} ${x.p.type}, ${x.onBackup ? 'standby' : 'active'}`, x.p.status === 'Up' ? 'up' : x.p.status === 'Degraded' ? 'degraded' : 'down'], [b.wan[1], `${x.sc.carrier} ${x.sc.type}, ${x.onBackup ? 'active' : 'standby'}`, x.sc.status === 'Up' ? 'up' : 'down']]],
    ['Core', [['Orchestrator overlay', 'business intent policies', 'up'], ['Primary DC hub', 'ERP and pricing', 'up'], ['Azure (SRS tenant)', 'cloud applications', 'up']]],
    ['Destinations', [['ERP / pricing', 'Primary DC', 'up'], ['Payment processor', 'PCI path only', 'up'], ['Cloud applications', 'Azure', 'up'], ['Internet / M365', 'local breakout', 'up']]],
  ];
  const [wref, mw] = useWidth(1100);
  const W = Math.max(900, mw), colW = W / cols.length, H = 360;
  const col = st => st === 'down' ? C.bad : st === 'degraded' ? C.warn : C.ok;
  const pos = cols.map(([, items], ci) => items.map((_, k) => ({ x: ci * colW + 14, y: 34 + (k + 0.5) * ((H - 44) / items.length) })));
  return (
    <div ref={wref} className="overflow-x-auto"><svg width={W} height={H} className="block">
      {cols.map(([t], ci) => <text key={t} x={ci * colW + 14} y={16} fontSize="12" fontWeight="700" className="fill-ink3">{t}</text>)}
      {pos.slice(0, -1).map((ps, ci) => ps.map((a, i) => pos[ci + 1].map((bb, j) => (cols[ci + 1][1].length <= 3 || cols[ci][1].length <= 3 || (i + j) % 3 === 0) && <path key={`${ci}-${i}-${j}`} d={`M${a.x + colW - 34},${a.y} C${a.x + colW - 10},${a.y} ${bb.x - 14},${bb.y} ${bb.x},${bb.y}`} fill="none" className="stroke-line" strokeWidth="1" />)))}
      {cols.map(([, items], ci) => items.map(([n, sub, st], k) => { const p = pos[ci][k]; return <g key={n} transform={`translate(${p.x},${p.y - 15})`}><rect width={colW - 34} height="30" rx="6" className="fill-panel stroke-line" /><circle cx={colW - 45} cy="9" r="3" fill={col(st)} /><text x="10" y="13" fontSize="11.5" fontWeight="700" className="fill-ink" {...fitLen(n, 6.4, colW - 62)}>{n.length > 26 ? n.slice(0, 25) + '…' : n}</text><text x="10" y="25" fontSize="10" className="fill-ink3" {...fitLen(sub, 5.1, colW - 50)}>{sub.length > 30 ? sub.slice(0, 29) + '…' : sub}</text></g>; }))}
    </svg></div>
  );
}

// Squeeze an SVG label into its node when the estimated width is too wide
const fitLen = (t, cw, avail) => (Math.min(t.length, 30) * cw > avail ? { textLength: Math.max(20, avail), lengthAdjust: 'spacingAndGlyphs' } : {});

const fmtD = iso => iso ? new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';

export function Branch360() {
  const { s, act } = useApp();
  const now = useNow();
  const fallback = useMemo(() => (D.BR[(s.incidents.find(i => i.kind === 'jitter') || s.incidents[0] || {}).branchId] || D.BRANCHES[0]).id, []);
  const id = s.role === 'bm' ? s.bmBranch : (s.b360 || s.filters.branchId || fallback);
  const b = D.BR[id];
  const x = useBranchLive(s, b);
  const [tab, setTab] = useState('devices');
  const [msgOpen, setMsgOpen] = useState(false);
  const [diag, setDiag] = useState(null);
  const [steerOpen, setSteerOpen] = useState(false);
  const clk = branchClock(b, now);
  const h = healthOf(s, b);
  const hb = healthBreakdown(s, b, x);
  const risk = riskNext4h(s, b, x, hb);
  const devs = D.devicesOf(b.id);
  const maint = s.maint && s.maint[b.id];
  const wos = s.workOrders.filter(w => w.branchId === b.id && w.status !== 'Completed');
  const cases = s.cases.filter(c => c.branchId === b.id && !c.closed);
  const hist30 = useMemo(() => { const r = rng(b.num * 7); return Array.from({ length: 30 }, (_, i) => ({ label: i % 5 === 4 ? dateShort(now - (29 - i) * DAY) : '', tip: dateShort(now - (29 - i) * DAY), Incidents: r() < 0.12 ? 1 + Math.floor(r() * 2) : 0, 'Auto-resolved': r() < 0.18 ? 1 : 0 })); }, [b.id]);
  const recent = s.resolved.filter(i => i.branchId === b.id).slice(0, 5);
  const health24 = useMemo(() => { const r = rng(b.num); return Array.from({ length: 48 }, (_, i) => Math.min(100, hb.score + (r() - 0.5) * 4 + (i > 40 ? 0 : 2))); }, [b.id, hb.score]);
  const guidance = x.down ? `The network at ${b.name} is down on both lines. Please use the downtime procedure for orders and card payments. A technician is being arranged; next update in 30 minutes.`
    : x.onBackup ? `${b.name} is running on its backup line (${x.path.carrier} ${x.path.type}). Card payments, ERP and calls are working; large downloads may be slower. No action needed from the branch.`
    : x.cur.deg ? `The main line at ${b.name} (${x.p.carrier}) is unstable: ${x.cur.loss.toFixed(1)}% packet loss and ${Math.round(x.cur.jit)} ms jitter. Card payments and ERP may be slower and calls may break up. We are moving them to the backup line within a few minutes; no action needed unless we contact you.`
    : x.incs.length ? `We are working on: ${x.incs.map(i => i.title.toLowerCase()).slice(0, 2).join('; ')}. Card payments and ERP are working normally.` : 'Both lines are healthy and all systems are working. No action needed.';
  const [guide, setGuide] = useState(null);
  const vulnRows = D.ADVISORIES.map(a => ({ a, devs: devs.filter(d => a.affects(d)) })).filter(r => r.devs.length);
  const devRows = devs.map(d => ({ ...d, life: D.lifecycleOf(d), vulns: D.vulnsOf(d) }));
  const lifeYears = useMemo(() => { const yrs = [2026, 2027, 2028, 2029, 2030, 2031]; return yrs.map(y => ({ label: String(y), 'Warranty ends': devs.filter(d => new Date(d.warranty).getFullYear() === y).length, 'End of support': devs.filter(d => { const e = D.lifeInfo(d).eosup; return e && new Date(e).getFullYear() === y; }).length })); }, [b.id]);
  const runDiag = () => { const base = baseReadiness(s, b); setDiag(base.results.map(r => ({ ...r, st: 'running' }))); base.results.forEach((r, k) => setTimeout(() => setDiag(cur => cur && cur.map(y => y.id === r.id ? r : y)), 350 * (k + 1))); act.audit(`Branch diagnostics run: ${b.name}`, b.id); };
  const toolOpen = t => { act.toast(`${t}: opened ${b.code} (deep link)`, 'info'); act.audit(`Opened ${t} for ${b.name}`, b.id); };
  const g = gate(s, { kind: 'change', conf: 1, branchId: b.id, now });

  return (
    <div>
      <div className="flex items-start gap-3 flex-wrap mb-3">
        <span className="w-11 h-11 rounded-md bg-panel border border-line flex items-center justify-center text-brand dark:text-[#e8a3a5]"><I.Store size={22} /></span>
        <div className="flex-1 min-w-[300px]">
          <h1 className="text-[24px] font-bold text-ink leading-tight">{b.name}, {b.brand}</h1>
          <div className="text-[13px] text-ink2 mt-0.5 flex items-center gap-2 flex-wrap">
            <span>{b.id}, {b.city}, {b.state}, {b.region}, {b.segment}</span>
            <span className="font-mono text-ink">{clk.local}</span>
            <Badge tone={clk.open ? 'green' : 'gray'}>{clk.open ? 'Open' : 'Closed'} {b.hours.open}–{b.hours.close}</Badge>
            <Badge tone={healthTone(h)}>{h === 'up' ? 'Healthy' : h === 'degraded' ? 'Degraded' : 'Down'}</Badge>
            {maint && <Badge tone="purple"><I.Wrench size={11} />In maintenance, alerts held</Badge>}
            {x.onBackup && <Badge tone="amber">On backup path</Badge>}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        <Btn size="sm" onClick={() => toolOpen('OpsRamp')}><Logo k="opsramp" h={11} className="!p-0 !border-0" />Open in OpsRamp</Btn>
        <Btn size="sm" onClick={() => toolOpen('Aruba Central')}><Logo k="central" h={11} className="!p-0 !border-0" />Open in Aruba Central</Btn>
        <Btn size="sm" onClick={() => toolOpen('EdgeConnect Orchestrator')}><Logo k="aruba" h={11} className="!p-0 !border-0" />Open in Orchestrator</Btn>
        <Btn size="sm" onClick={() => toolOpen('ServiceNow')}><Logo k="servicenow" h={9} className="!p-0 !border-0" />Open in ServiceNow</Btn>
        <Btn size="sm" icon={I.Activity} onClick={runDiag}>Run branch diagnostics</Btn>
        <Btn size="sm" icon={I.Wrench} onClick={() => { act.map('maint', b.id, !maint); act.audit(`${maint ? 'Ended' : 'Started'} maintenance mode at ${b.name}`, b.id); act.toast(maint ? 'Maintenance ended, alerting resumed' : 'Maintenance mode: alerts held, SLA clocks paused for planned work', 'info'); }}>{maint ? 'End maintenance' : 'Put in maintenance'}</Btn>
        <Btn size="sm" icon={I.Truck} onClick={() => { const wo = `WO00${43000 + Math.floor(Math.random() * 900)}`; act.add('workOrders', { id: wo, branchId: b.id, inc: x.incs[0] ? x.incs[0].id : null, task: `Site visit requested from Branch 360: ${x.incs[0] ? x.incs[0].title : 'general check'}`, skills: ['Aruba switching'], parts: [], tech: null, status: 'Unassigned', created: Date.now(), window: clk.open ? `After ${b.hours.close} local unless urgent` : 'Any time', priority: x.incs[0] ? x.incs[0].pri : 'P4' }); act.audit(`Dispatch requested ${wo} for ${b.name}`, wo); act.toast(`${wo} created, match a technician in Field Dispatch`); }}>Dispatch</Btn>
        <Btn size="sm" icon={I.MessageSquare} onClick={() => setMsgOpen(true)}>Message branch manager</Btn>
      </div>

      <Card title="Branch metrics" sub="Live from Orchestrator, synthetic probes and Aruba Central. Outer bands show normal, warning and critical." right={<span className="text-[12px] text-ok font-bold flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-ok animate-pulse" />Live</span>}>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <Gauge value={x.cur.lat} max={200} warn={x.path.lat + 25} crit={x.path.lat + 60} unit="ms" fmt={v => Math.round(v)} label="Latency to data centre" sub={`${x.path.carrier} ${x.path.type}, line in use (normal ${x.path.lat} ms)`} />
          <Gauge value={x.cur.loss} max={5} warn={1} crit={2} unit="%" fmt={v => v >= 10 ? '100' : v.toFixed(2)} label="Packet loss" sub="line in use, Orchestrator" />
          <Gauge value={x.cur.jit} max={60} warn={20} crit={30} unit="ms" fmt={v => v.toFixed(1)} label="Jitter" sub="line in use, Orchestrator" />
          <Gauge value={x.cur.util} max={100} warn={70} crit={85} unit="%" fmt={v => Math.round(v)} label="WAN use" sub={`of ${x.path.bw} Mb/s on the line in use`} />
          <Gauge value={x.cur.wifi} max={100} warn={80} crit={65} invert fmt={v => Math.round(v)} label="Wi-Fi experience" sub="inside the branch, Aruba Central" />
        </div>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-3 mt-3">
        <Card title="Health score">
          <div className="flex items-center gap-3"><Ring value={hb.score / 100} size={92} stroke={9} color={hb.score >= 85 ? '#1f7a3a' : hb.score >= 70 ? C.warn : C.bad} label={String(hb.score)} /><div className="flex-1 min-w-0"><div className="text-[11.5px] text-ink3">Last 24 hours</div><Spark data={health24} w={150} h={40} color={hb.score >= 85 ? '#1f7a3a' : C.warn} /></div></div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-2 text-[12.5px]">{hb.parts.map(([k, v]) => <div key={k} className="flex justify-between"><span className="text-ink2">{k}</span><b className={v < 70 ? 'text-bad' : v < 85 ? 'text-warn' : 'text-ink'}>{v}</b></div>)}</div>
        </Card>
        <Card title="Risk, next 4 hours">
          <div className="flex items-baseline gap-2"><span className={cx('text-[32px] font-bold', risk.score >= 50 ? 'text-bad' : risk.score >= 25 ? 'text-warn' : 'text-ok')}>{risk.score}</span><span className="text-ink3 text-[12.5px]">out of 100</span></div>
          <Progress value={risk.score / 100} tone={risk.score >= 50 ? 'red' : risk.score >= 25 ? 'amber' : 'green'} className="mt-1" />
          <div className="text-[12px] text-ink3 mt-2 mb-1">Top drivers</div>
          <ol className="list-decimal pl-5 text-[12.5px] text-ink space-y-0.5">{risk.drivers.length ? risk.drivers.sort((a, c) => c[1] - a[1]).slice(0, 4).map(d => <li key={d[0]}>{d[0]}</li>) : <li>No active risk drivers</li>}</ol>
        </Card>
        <Card title="Who is working on it">
          {x.incs.length + wos.length + cases.length === 0 ? <div className="text-[12.5px] text-ok flex items-center gap-1.5"><I.CheckCircle2 size={15} />No open work for this branch.</div> : <div className="space-y-1.5">
            {x.incs.map(i => <button key={i.id} onClick={() => act.openInc(i.id)} className="w-full text-left text-[12.5px] flex gap-1.5 items-start hover:underline"><Pri p={i.pri} /><span className="flex-1"><span className="text-ink">{i.title}</span><span className="block text-ink3">{i.assignee || 'Unassigned'}, {i.state}</span></span></button>)}
            {wos.map(w => <div key={w.id} className="text-[12.5px] flex gap-1.5"><I.Truck size={14} className="text-ink3 mt-0.5" /><span><span className="text-ink">{w.id}: {w.status}</span><span className="block text-ink3">{w.tech ? s.techs.find(t => t.id === w.tech).name : 'Not yet matched'}</span></span></div>)}
            {cases.map(c => <div key={c.id} className="text-[12.5px] flex gap-1.5"><I.RadioTower size={14} className="text-ink3 mt-0.5" /><span className="text-ink">{c.carrier} {c.id}: {c.status}</span></div>)}
          </div>}
        </Card>
        <Card title="Branch guidance" right={<span className="text-[11.5px] text-ink3">auto-written, editable</span>}>
          <textarea value={guide ?? guidance} onChange={e => setGuide(e.target.value)} className="w-full h-24 p-2 text-[12.5px] rounded-md border border-line bg-canvas text-ink" />
          <Btn size="sm" kind="brand" icon={I.Send} className="mt-1.5" onClick={() => { act.audit(`Guidance sent to ${b.name} branch manager`, b.id); act.toast('Sent to branch manager (Teams + SMS)'); }}>Send to branch manager</Btn>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-3 mt-3">
        <Card title="Event stream, this branch" sub={`${12 + (b.num % 9)} events/min across OpsRamp, Central, Orchestrator and New Relic`} pad={false}>
          <div className="max-h-[230px] overflow-y-auto">{x.h.ev.length ? x.h.ev.slice(0, 12).map(e => <Ev key={e.id} e={e} />) : <div className="text-[12.5px] text-ink3 p-4">{x.down ? 'No telemetry: branch unreachable.' : 'Waiting for the next event…'}</div>}</div>
        </Card>
        <Card title="Automation in progress" sub="Runbooks running or waiting at this branch">
          {x.incs.filter(i => i.runbook).length ? x.incs.filter(i => i.runbook).map(i => { const rb = D.RB[i.runbook]; return <div key={i.id} className="flex items-center gap-2 py-1.5 border-b border-line/60 text-[12.5px]"><I.Workflow size={14} className="text-ink3" /><span className="flex-1 text-ink">{rb.id} {rb.name}</span><Badge tone={i.rbState === 'done' ? 'green' : i.rbState === 'proposed' ? 'amber' : 'blue'}>{i.rbState}</Badge></div>; }) : <div className="text-[12.5px] text-ink3 flex items-center gap-1.5"><Dot tone="green" />No runbooks running. Monitoring continues.</div>}
          <div className="text-[12px] text-ink3 mt-3">Change gate for this branch now</div>
          <div className="text-[12.5px] mt-1">{g.auto ? <span className="text-ok font-semibold">Changes can run automatically (branch closed, no freeze).</span> : <span className="text-warn font-semibold">{g.reasons[0]}</span>}</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 mt-3">
        <Card title="Connectivity" right={<Btn size="sm" kind={x.steer ? 'dark' : 'brand'} icon={I.Shuffle} onClick={() => setSteerOpen(true)}>{x.steer ? 'Return to primary' : 'Steer to backup'}</Btn>}>
          <div className="grid grid-cols-2 gap-2">{[x.p, x.sc].map((c, i) => { const active = (i === 0) !== x.onBackup; return <div key={c.id} className={cx('rounded-md border p-2', active ? 'border-ink2' : 'border-line')}><div className="text-[12.5px] font-bold text-ink">{i ? 'Backup' : 'Primary'}, {c.carrier}</div><div className="text-[11px] text-ink3 font-mono break-all">{c.cid}</div><div className="text-[11.5px] text-ink2">{c.type}, {c.bw} Mb/s</div><div className="flex flex-wrap gap-1 mt-1"><Badge tone={c.status === 'Up' ? 'green' : c.status === 'Degraded' ? 'amber' : 'red'}>{c.status}</Badge>{active && <Badge tone="blue">Active path</Badge>}</div></div>; })}</div>
          <div className="grid grid-cols-3 gap-2 mt-2">{[['Latency', x.h.lat, 'ms', 0], ['Jitter', x.h.jit, 'ms', 1], ['Loss', x.h.loss, '%', 2]].map(([l, ser, u, d]) => { const v = ser.filter(y => y != null).at(-1); return <div key={l} className="bg-chip/60 rounded-md p-2"><div className="text-[11.5px] text-ink3">{l}</div><div className="text-[17px] font-bold text-ink">{v == null ? '—' : (+v).toFixed(d === 2 ? 2 : 0)} <span className="text-[11px] font-normal text-ink3">{u}</span></div><Spark data={ser.filter(y => y != null).slice(-60)} w={100} h={26} color="#1f7a3a" /></div>; })}</div>
          <div className="text-[12px] text-ink2 mt-2 flex items-center gap-1.5"><Dot tone={x.down ? 'red' : 'green'} /><span className="font-mono">{b.code}-ec01</span> EdgeConnect {b.dev.ec === 2 ? 'HA pair' : 'EC-XS'}, ECOS {(devs.find(d => d.type === 'SD-WAN') || {}).fw}</div>
        </Card>
        <Card title="Applications" sub="As this branch sees them">
          {[['ERP (order, inventory, invoicing)', `${x.cur.erp.toFixed(1)} s login`, 'Primary DC'], ['Card payments', `${Math.round(x.cur.pay)} ms round trip`, 'PCI segment'], ['Pricing and quoting', `${(0.4 + x.cur.erp * 0.35).toFixed(1)} s`, 'Primary DC'], ['Cloud applications (Azure)', `${Math.round(x.cur.lat * 0.9 + 4)} ms path`, 'Azure'], ['Voice', `call quality ${x.cur.mos.toFixed(1)} of 4.4`, 'Cloud voice'], ['Microsoft 365', `${Math.round(x.cur.lat * 0.5 + 22 + x.cur.loss * 30)} ms`, 'Local breakout']].map(([n, v, w], i) => { const bad = x.down || (i === 0 && x.cur.erp > 2) || (i === 1 && x.cur.pay > 400) || (i === 4 && x.cur.mos < 3.6); return <div key={n} className="flex items-center gap-2 py-1 border-b border-line/60 last:border-0 text-[12.5px]"><Dot tone={bad ? (x.down ? 'red' : 'amber') : 'green'} /><span className="flex-1 text-ink">{n}</span><span className="text-ink2">{x.down ? 'unreachable' : v}</span><span className="text-ink3 w-24 text-right text-[11.5px]">{w}</span></div>; })}
        </Card>
        <Card title="Network today" sub="Traffic and clients at this branch since opening">
          <div className="grid grid-cols-2 gap-2">{[['WAN use, peak', `${38 + (b.num % 41)}%`], ['Data through EdgeConnect', `${(4 + (b.num % 17) * 0.6).toFixed(1)} GB`], ['Wi-Fi clients now', 12 + (b.num % 30) + (b.size === 'L' ? 25 : 0)], ['Path changes today', (b.num % 4)], ['Switch ports in use', `${60 + (b.num % 33)}%`], ['Config backup', '02:00, matches golden']].map(([k, v]) => <div key={k} className="bg-chip/60 rounded-md px-2.5 py-2"><div className="text-[11.5px] text-ink3">{k}</div><div className="text-[16px] font-bold text-ink tabular-nums">{v}</div></div>)}</div>
          <div className="text-[12px] text-ink2 mt-2">Branch manager: {['Rick D.', 'Maria G.', 'Tom W.', 'Angela P.', 'Luis F.'][b.num % 5]}, yard {b.yard ? 'with outdoor APs' : 'none'}</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-3 mt-3">
        <Card title="LAN and Wi-Fi" sub={`${b.dev.sw} switches, ${b.dev.ap} access points (${b.dev.apOut} outdoor)`}>
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] gap-x-4 text-[12.5px]">
            {['', 'Switch', 'Role', 'Port errors', 'Throughput'].map((h, i) => <div key={i} className="text-[11.5px] font-semibold text-ink3 pb-1 border-b border-line">{h}</div>)}
            {devs.filter(d => d.type === 'Switch').map(d => { const bad = x.incs.some(i => i.ci === d.id); return <React.Fragment key={d.id}>
              <div className="py-1.5 border-b border-line/60 flex items-center"><Dot tone={x.down ? 'red' : bad ? 'amber' : 'green'} /></div>
              <div className="py-1.5 border-b border-line/60 min-w-0 truncate"><span className="font-bold text-ink">{d.id}</span> <span className="text-ink3">{d.desc}</span></div>
              <div className="py-1.5 border-b border-line/60 text-ink2 whitespace-nowrap">{d.role}</div>
              <div className="py-1.5 border-b border-line/60 text-ink2 tabular-nums text-right">{x.down ? '–' : (b.num + d.id.length) % 3}</div>
              <div className="py-1.5 border-b border-line/60 text-ink2 tabular-nums text-right whitespace-nowrap">{x.down ? 'no data' : `${20 + (b.num * 7 + d.id.length * 3) % 60} Mb/s`}</div>
            </React.Fragment>; })}
          </div>
          <div className="flex flex-wrap gap-1.5 mt-3">{devs.filter(d => d.type === 'AP').map(d => { const bad = x.down || x.incs.some(i => i.ci === d.id); return <span key={d.id} title={`${d.desc}, ${d.role}, AOS ${d.fw}`} className={cx('inline-flex items-center gap-1 text-[12px] rounded border px-2 py-1', bad ? 'border-bad/50 text-bad bg-bad/5' : 'border-line text-ink')}><I.Wifi size={12} />{d.id.split('-').pop()}<span className="text-ink3">{d.role === 'Outdoor yard' ? 'yard' : d.role.toLowerCase()}</span>{!bad && <span className="text-ink3">{4 + (b.num + d.id.length) % 18} clients</span>}</span>; })}</div>
        </Card>
        <Card title="Dependencies" sub="What this branch relies on, from the counter to the data centre">
          <DepGraph s={s} b={b} x={x} />
        </Card>
      </div>

      <div className="mt-3">
        <Tabs value={tab} onChange={setTab} className="mb-2" tabs={[{ id: 'devices', label: 'Devices and lifecycle', count: devs.length }, { id: 'vulns', label: 'Vulnerabilities', count: vulnRows.reduce((a, r) => a + r.devs.length, 0) }, { id: 'work', label: 'Open work and history' }]} />
        {tab === 'devices' && <div className="grid grid-cols-1 min-[1700px]:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-3">
          <Card pad={false} title="Every device at this branch" sub="Make, model, firmware, lifecycle and open vulnerabilities" right={<Btn size="sm" icon={I.Download} onClick={() => exportCSV(`${b.code}-devices.csv`, devRows, [{ label: 'Hostname', key: 'id' }, { label: 'Make', get: d => (D.MODEL_INFO[d.model] || {}).make }, { label: 'Model', key: 'desc' }, { label: 'SKU', get: d => d.sku || '' }, { label: 'Serial/MAC', key: 'serial' }, { label: 'Firmware', key: 'fw' }, { label: 'Lifecycle', get: d => d.life.status }, { label: 'Warranty end', get: d => D.warrantyText(d) }, { label: 'Advisories', get: d => d.vulns.map(v => v.id).join(' ') }])}>Export</Btn>}>
            <div className="px-3 pb-3"><Table dense rows={devRows} cols={[
              { key: 'id', label: 'Hostname', render: d => <span className="font-mono font-bold">{d.id}</span> },
              { key: 'make', label: 'Make', get: d => 'HPE Aruba', className: 'whitespace-nowrap', render: () => <span className="text-[12px] text-ink2" title="HPE Aruba Networking">HPE Aruba</span> },
              { key: 'desc', label: 'Model', className: 'whitespace-nowrap', render: d => <span><span className="text-ink">{d.desc}</span><span className="block text-[11px] text-ink3">{d.sku ? `${d.sku} · ` : ''}{d.role}</span></span> },
              { key: 'fw', label: 'Firmware', className: 'whitespace-nowrap', render: d => <span className="font-mono text-[12px]">{d.fw}</span> },
              { key: 'life', label: 'Lifecycle', className: 'whitespace-nowrap', get: d => d.life.status, render: d => <span title={d.life.note}><Badge tone={d.life.tone}>{d.life.status}</Badge>{d.life.eosup && <span className="block text-[11px] text-ink3">End of sale {fmtD(d.life.eos)} · End of support {fmtD(d.life.eosup)}</span>}</span> },
              { key: 'warranty', label: 'Warranty / contract end', render: d => <span className={cx('text-[12px]', d.warranty < now ? 'text-bad font-semibold' : 'text-ink2')}>{D.warrantyText(d)}</span> },
              { key: 'v', label: 'Vulnerabilities', get: d => d.vulns.length, render: d => d.vulns.length ? <div className="flex flex-wrap gap-1">{d.vulns.map(v => <Badge key={v.id} tone={v.sev === 'Critical' ? 'red' : v.sev === 'High' ? 'amber' : 'gray'} title={v.title}>{v.cvss ? `${v.cvss} ` : ''}{v.cves[0] || v.id}</Badge>)}</div> : <span className="text-[12px] text-ok">None known</span> },
            ]} /></div>
          </Card>
          <div className="space-y-3">
            <Card title="Lifecycle outlook" sub="Devices at this branch reaching warranty end or end of support, by year" right={<Legend items={[['Warranty ends', C.grey], ['End of support', C.s1]]} />}>
              <Bars data={lifeYears} keys={['Warranty ends', 'End of support']} colors={[C.grey, C.s1]} stacked={false} h={160} />
            </Card>
            <Card title="Make and model mix">
              {Object.entries(devs.reduce((m, d) => { m[d.desc] = (m[d.desc] || 0) + 1; return m; }, {})).map(([k, n]) => <div key={k} className="flex justify-between text-[12.5px] py-0.5"><span className="text-ink">{k}</span><b className="text-ink">{n}</b></div>)}
              <div className="text-[11.5px] text-ink3 mt-2">All devices are HPE Aruba Networking.</div>
            </Card>
          </div>
        </div>}
        {tab === 'vulns' && <Card title="Vulnerabilities and lifecycle risks at this branch" sub="Matched from HPE Aruba Networking security bulletins against each device's running firmware">
          {vulnRows.length ? vulnRows.map(({ a, devs: ds }) => <div key={a.id} className="border border-line rounded-md p-3 mb-2">
            <div className="flex items-center gap-2 flex-wrap"><Badge tone={a.sev === 'Critical' ? 'red' : a.sev === 'High' ? 'amber' : 'gray'}>{a.sev}{a.cvss ? ` ${a.cvss}` : ''}</Badge><b className="text-ink text-[13.5px]">{a.title}</b></div>
            <div className="text-[12px] text-ink2 mt-1">{a.cves.length ? a.cves.join(', ') + '. ' : ''}{a.id}, published {a.published}. {a.vector}.</div>
            <div className="text-[12.5px] mt-1"><span className="text-ink3">Affected here:</span> <span className="font-mono">{ds.map(d => `${d.id} (${d.fw})`).join(', ')}</span></div>
            <div className="text-[12.5px]"><span className="text-ink3">Fix:</span> {a.fixed}. <span className="text-ink3">Mitigation now:</span> {a.mitigation}</div>
            <div className="flex gap-2 mt-2"><Btn size="sm" kind="brand" icon={I.CalendarPlus} onClick={() => { const cid = `CHG00${32100 + Math.floor(Math.random() * 800)}`; act.add('changes', { id: cid, title: `${a.id} remediation at ${b.name} (${ds.length} device${ds.length > 1 ? 's' : ''})`, type: 'Normal', risk: 'Low', state: 'Scheduled', start: now + DAY, end: now + DAY + 2 * HR, window: `After ${b.hours.close} local`, scope: b.region, devices: ds.length, owner: act.me(), validation: 'Pending', nac: `sites/${b.code}/firmware.yaml` }); act.audit(`Scheduled ${a.id} remediation at ${b.name}: ${cid}`, cid); act.toast(`${cid} scheduled after branch close`); }}>Schedule fix after close</Btn><Btn size="sm" icon={I.ShieldCheck} onClick={() => { act.audit(`Mitigation applied for ${a.id} at ${b.name}: ${a.mitigation}`, b.id); act.toast('Mitigation pushed from Network-as-Code (management ACL)'); }}>Apply mitigation</Btn></div>
          </div>) : <div className="text-[12.5px] text-ok flex items-center gap-1.5"><I.ShieldCheck size={15} />No known vulnerabilities or lifecycle risks on this branch's devices.</div>}
          <div className="text-[11.5px] text-ink3 mt-2">Sources: {Object.values(D.SRC).join('; ')}.</div>
        </Card>}
        {tab === 'work' && <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          <Card title="History, last 30 days" right={<Legend items={[['Incidents', C.s2], ['Auto-resolved', C.s1]]} />}>
            <Bars data={hist30} keys={['Incidents', 'Auto-resolved']} colors={[C.s2, C.s1]} h={150} />
            <div className="mt-2">{recent.length ? recent.map(i => <button key={i.id} onClick={() => act.openInc(i.id)} className="w-full text-left text-[12.5px] py-1 border-b border-line/60 flex gap-2"><span className="font-mono text-ink3">{i.id}</span><span className="flex-1 text-ink truncate">{i.title}</span><span className="text-ink3">{i.closeCode}</span></button>) : <div className="text-[12.5px] text-ink3">No incidents resolved here in the last 7 days.</div>}</div>
          </Card>
          <Card title="Open work across every team">
            {x.incs.length + wos.length + cases.length ? <>
              {x.incs.map(i => { const c = slaClock(i, now); return <button key={i.id} onClick={() => act.openInc(i.id)} className="w-full text-left text-[12.5px] py-1.5 border-b border-line/60 flex gap-2 items-center"><Pri p={i.pri} /><span className="font-mono text-ink3">{i.id}</span><span className="flex-1 text-ink truncate">{i.title}</span><span className={c.resLeft < 0 ? 'text-bad' : 'text-ink2'}>{c.resLeft < 0 ? 'breached' : dur(c.resLeft)}</span></button>; })}
              {wos.map(w => <div key={w.id} className="text-[12.5px] py-1.5 border-b border-line/60">{w.id}: {w.task} ({w.status})</div>)}
              {cases.map(c => <div key={c.id} className="text-[12.5px] py-1.5 border-b border-line/60">{c.carrier} case {c.id}: {c.status}</div>)}
            </> : <div className="text-[12.5px] text-ok">No open incidents, work orders, carrier cases or changes.</div>}
          </Card>
        </div>}
      </div>

      <Modal open={msgOpen} onClose={() => setMsgOpen(false)} title={`Message ${b.name} branch manager`} sub="Teams and SMS, logged on the incident if one is open" footer={<><Btn kind="brand" icon={I.Send} onClick={() => { setMsgOpen(false); act.audit(`Message sent to ${b.name} branch manager`, b.id); if (x.incs[0]) act.note(x.incs[0].id, 'Branch manager messaged from Branch 360.'); act.toast('Message sent'); }}>Send</Btn><Btn onClick={() => setMsgOpen(false)}>Cancel</Btn></>}>
        <textarea defaultValue={guide ?? guidance} className="w-full h-32 p-2 text-[13px] rounded-md border border-line bg-canvas text-ink" />
      </Modal>
      <Modal open={!!diag} onClose={() => setDiag(null)} title={`Branch diagnostics, ${b.name}`} sub="The same checks as the 05:30 readiness run, on demand">
        {diag && diag.map(r => <div key={r.id} className="flex items-center gap-2 py-1.5 border-b border-line/60 text-[13px]">{r.st === 'running' ? <I.Loader2 size={15} className="animate-spin text-info" /> : r.st === 'pass' ? <I.CheckCircle2 size={15} className="text-ok" /> : r.st === 'warn' ? <I.AlertTriangle size={15} className="text-warn" /> : <I.XCircle size={15} className="text-bad" />}<span className="flex-1 text-ink">{r.name}</span><span className="text-ink3 text-[12px]">{r.st === 'running' ? 'checking' : r.detail}</span></div>)}
      </Modal>
      <Modal open={steerOpen} onClose={() => setSteerOpen(false)} title={x.steer ? 'Return traffic to the primary path' : 'Steer critical apps to the backup path'} sub={`${b.name}. POS, ERP and voice business-intent classes move; guest and bulk stay put.`} footer={<><Btn kind="brand" icon={I.Check} onClick={() => { act.map('steer', b.id, !x.steer); act.audit(`${x.steer ? 'Returned to primary' : 'Steered to backup'} at ${b.name} (engineer action, RB-10${x.steer ? 2 : 1})`, b.id); act.toast(x.steer ? 'Traffic back on primary, verification running' : 'Critical apps on backup path, verification running'); setSteerOpen(false); }}>{x.steer ? 'Return to primary' : 'Steer now'}</Btn><Btn onClick={() => setSteerOpen(false)}>Cancel</Btn></>}>
        <div className="text-[13px] text-ink space-y-2"><p>Runbook RB-10{x.steer ? 2 : 1}. Rollback: {x.steer ? 're-apply the override' : 'remove the override; traffic returns to primary'}. Verification: payment path under 400 ms, ERP login probe OK.</p><p className="text-ink2">You are making this change yourself, so the agent autonomy gate does not apply; it is recorded in the audit log against your name.</p></div>
      </Modal>
    </div>
  );
}
