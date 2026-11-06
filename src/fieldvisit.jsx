// The technician's view of a field visit: the work pack as it looks in the field app on the phone, the route from the
// technician's base through the depot that holds the spare to the store, and the store layout with where each device
// sits, the way in and the fault marked.
import React, { useState } from 'react';
import * as I from 'lucide-react';
import * as D from './data.js';
import MAP from './mapdata.json';
import { useApp, useNow } from './store.jsx';
import { Card, Badge, Btn, Pri, cx } from './ui.jsx';
import { rankTechs } from './dash/fix.js';
import { packOf, readingOk, tickStep, addPhoto, setReading, returnCheck } from './dash/workpack.js';
import { hhmm, MIN } from './util.js';

const MILES = 2.9; // map units to road miles, the same scale the technician matching uses
const ROADS = { TX: ['I-35', 'I-45', 'I-20', 'US-75'], FL: ['I-75', 'I-4', 'I-95'], GA: ['I-75', 'I-85', 'I-20'], IL: ['I-55', 'I-90', 'I-294'], AZ: ['I-10', 'I-17'], NC: ['I-85', 'I-77', 'I-40'], SC: ['I-26', 'I-85'], CO: ['I-25', 'I-70'], PA: ['I-76', 'I-476', 'I-95'], WA: ['I-5', 'I-405'], TN: ['I-40', 'I-24', 'I-65'], AL: ['I-65', 'I-20'], OH: ['I-71', 'I-75'], VA: ['I-64', 'I-95'], LA: ['I-10', 'I-12'], OK: ['I-35', 'I-44'], MO: ['I-70', 'I-44'], IN: ['I-65', 'I-70'], MI: ['I-75', 'I-96'], NJ: ['I-95', 'NJ Turnpike'], NY: ['I-87', 'I-90'], CA: ['I-5', 'I-405'], NV: ['I-15', 'US-95'], UT: ['I-15', 'I-80'], KS: ['I-35', 'I-70'], MN: ['I-94', 'I-35W'] };
const cityXY = label => { const [c, st] = label.split(',').map(x => x.trim()); const m = [...MAP.cities, ...MAP.hawaii].find(x => x[0] === c && x[1] === st); if (m) return { x: m[2], y: m[3] }; const b = D.BRANCHES.find(x => x.city === c); return b ? { x: b.cx, y: b.cy } : null; };

// the trip: from the technician's base, through the depot when a spare is needed, to the store
export function tripOf(s, wo, now) {
  const b = D.BR[wo.branchId];
  const suggested = !wo.tech && rankTechs(s, wo)[0];
  const tech = wo.tech ? s.techs.find(t => t.id === wo.tech) : suggested && suggested.t;
  if (!tech) return null;
  const home = D.BRANCHES.find(x => x.city === tech.base) || b;
  const depot = wo.parts.length ? (s.depots.find(d => d.id === wo.depot) || (suggested && suggested.depot) || s.depots.find(d => (D.DEPOT_REGION[b.region] || []).includes(d.id))) : null;
  const Z = { x: b.x, y: b.y, label: b.name.replace(/ – .*/, ''), kind: 'store' };
  const dxy = depot && cityXY(depot.city);
  // a technician already travelling or booked from far away has flown in and starts from the depot near the store
  const far = Math.hypot(home.cx - b.x, home.cy - b.y) * MILES > 250, inRegion = far && dxy && wo.tech && ['En route', 'On site', 'Assigned', 'Dispatched', 'Scheduled'].includes(wo.status);
  const A = inRegion ? { ...dxy, label: `${tech.name} at ${depot.city.split(',')[0]} depot`, kind: 'tech' } : { x: home.cx, y: home.cy, label: `${tech.name}, ${tech.base}`, kind: 'tech' };
  const pts = [A, ...(dxy && !inRegion ? [{ ...dxy, label: `${depot.city.split(',')[0]} depot`, kind: 'depot' }] : []), Z];
  const roads = ROADS[b.state] || ['the interstate', 'the state highway'];
  const legs = pts.slice(1).map((p, i) => { const a = pts[i], mi = Math.max(3, Math.round(Math.hypot(p.x - a.x, p.y - a.y) * MILES)); return { from: a, to: p, mi, min: Math.round(mi / 50 * 60) + (p.kind === 'depot' ? 15 : 10), fly: mi > 250 }; });
  const total = legs.reduce((a, l) => a + l.min, 0), miles = legs.reduce((a, l) => a + l.mi, 0), fly = legs.some(l => l.fly);
  // where the technician is now: at the base before travel, along the route while en route, at the store on site
  let at = 0;
  if (wo.status === 'En route' && wo.eta) at = Math.max(0.05, Math.min(0.95, 1 - (wo.eta - now) / (total * MIN)));
  if (['On site', 'Completed'].includes(wo.status)) at = 1;
  const dirs = [];
  legs.forEach((l, i) => {
    const r = roads[(b.num + i) % roads.length];
    if (l.fly) { dirs.push({ icon: I.Plane, text: `Fly in to ${l.to.kind === 'store' ? b.city : l.to.label}; hire car from the airport`, mi: l.mi, min: null }); return; }
    if (i === 0 && inRegion) dirs.push({ icon: I.Warehouse, text: `Flown in from ${tech.base}; ${wo.parts.length ? `collect ${wo.parts.join(', ')} at the ${depot.city.split(',')[0]} depot` : 'start at the depot'}`, mi: null, min: 15 });
    dirs.push({ icon: I.Navigation, text: `Leave ${i === 0 ? (inRegion ? `the ${depot.city.split(',')[0]} depot` : tech.base) : l.from.label}, join ${r}`, mi: Math.round(l.mi * 0.15), min: Math.round(l.min * 0.15) });
    dirs.push({ icon: I.MoveRight, text: `Follow ${r} for ${Math.round(l.mi * 0.75)} mi`, mi: Math.round(l.mi * 0.75), min: Math.round(l.min * 0.7) });
    dirs.push(l.to.kind === 'depot' ? { icon: I.Warehouse, text: `${l.to.label}: collect ${wo.parts.join(', ')} (reserved on ${wo.id})`, mi: null, min: 15 } : { icon: I.MapPin, text: `Exit for ${b.city}; ${b.yard ? 'enter the yard gate and park by the receiving door' : 'park in the contractor bays at the side'}`, mi: Math.round(l.mi * 0.1), min: Math.round(l.min * 0.15) });
  });
  return { b, tech, suggested: !!suggested, depot, pts, legs, total, miles, fly, at, dirs, flewIn: inRegion };
}

// a road-like line between two points: a gentle bend so it does not read as a straight ruler line
const bend = (a, z, k) => { const mx = (a.x + z.x) / 2, my = (a.y + z.y) / 2, dx = z.x - a.x, dy = z.y - a.y, o = 0.18 * (k % 2 ? 1 : -1); return `M${a.x},${a.y} Q${mx - dy * o},${my + dx * o} ${z.x},${z.y}`; };
const quadAt = (a, z, k, t) => { const mx = (a.x + z.x) / 2, my = (a.y + z.y) / 2, dx = z.x - a.x, dy = z.y - a.y, o = 0.18 * (k % 2 ? 1 : -1), cx = mx - dy * o, cy = my + dx * o; return { x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * cx + t * t * z.x, y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * cy + t * t * z.y }; };

export function RouteMap({ trip, h = 300, aspect = 3.4, pxw = 900 }) {
  if (!trip) return null;
  const xs = trip.pts.map(p => p.x), ys = trip.pts.map(p => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  // fit the whole trip with a margin, in the shape of the frame it is drawn in
  const w0 = Math.max(60, (x1 - x0) * 1.35), h0 = Math.max(36, (y1 - y0) * 1.5 + 24);
  const W = Math.max(w0, h0 * aspect), hh = W / aspect;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const vb = [cx - W / 2, cy - hh / 2, W, hh];
  const r = 8.5 * W / pxw; // markers and labels keep the same size on screen whatever the zoom
  // the technician's position along the whole trip
  const lens = trip.legs.map(l => l.min), tot = lens.reduce((a, v) => a + v, 0) || 1;
  let rem = trip.at * tot, pos = trip.pts[0];
  for (let i = 0; i < trip.legs.length; i++) { if (rem <= lens[i] || i === trip.legs.length - 1) { pos = quadAt(trip.legs[i].from, trip.legs[i].to, i, Math.min(1, rem / lens[i])); break; } rem -= lens[i]; }
  const near = D.BRANCHES.filter(x => x.x > vb[0] && x.x < vb[0] + vb[2] && x.y > vb[1] && x.y < vb[1] + vb[3]);
  const MK = { tech: [I.HardHat, '#2F6DB5'], depot: [I.Warehouse, '#E07B00'], store: [I.Store, '#762123'] };
  return (
    <svg viewBox={vb.join(' ')} className="w-full rounded-md bg-[#dfeaf3] dark:bg-[#1b2633]" style={{ height: h }} preserveAspectRatio="xMidYMid meet">
      {MAP.states.map(st => <path key={st.id} d={st.d} className="fill-mapland stroke-line" strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
      {near.map(x => <circle key={x.id} cx={x.x} cy={x.y} r={r * 0.3} fill="#A3ACB8" opacity={0.7} />)}
      {trip.legs.map((l, i) => <g key={i}>
        <path d={bend(l.from, l.to, i)} fill="none" stroke="#fff" strokeWidth={9} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <path d={bend(l.from, l.to, i)} fill="none" stroke={l.fly ? '#5E6B78' : '#2F6DB5'} strokeWidth={5} strokeLinecap="round" strokeDasharray={l.fly ? '2 8' : undefined} vectorEffect="non-scaling-stroke" />
      </g>)}
      {trip.pts.map((p, i) => { const [Ic, col] = MK[p.kind]; return <g key={i} transform={`translate(${p.x},${p.y})`}>
        <circle r={r * 1.6} fill={col} stroke="#fff" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        <Ic x={-r * 0.95} y={-r * 0.95} width={r * 1.9} height={r * 1.9} color="#fff" strokeWidth={2.4} />
        <text y={trip.pts.some((q, j) => j < i && Math.hypot(q.x - p.x, q.y - p.y) < r * 8) ? r * 3.4 : -r * 2.2} textAnchor="middle" fontSize={r * 1.25} fontWeight={700} className="fill-ink" paintOrder="stroke" stroke="rgb(var(--panel))" strokeWidth={r * 0.5}>{p.label}</text>
      </g>; })}
      {trip.at > 0 && trip.at < 1 && <g transform={`translate(${pos.x},${pos.y})`}><circle r={r * 2.4} fill="#2F6DB5" opacity={0.2}><animate attributeName="r" values={`${r * 1.4};${r * 2.8};${r * 1.4}`} dur="2s" repeatCount="indefinite" /></circle><circle r={r * 0.9} fill="#2F6DB5" stroke="#fff" strokeWidth={2} vectorEffect="non-scaling-stroke" /></g>}
    </svg>
  );
}

export function RouteCard({ wo }) {
  const { s } = useApp(); const now = useNow();
  const trip = tripOf(s, wo, now);
  if (!trip) return <Card title="Route to the store"><div className="text-[12.5px] text-ink2">No technician matched yet.</div></Card>;
  const eta = wo.eta && wo.status !== 'Completed' ? wo.eta : now + trip.total * MIN;
  return (
    <Card title="Route to the store" right={<Badge tone={trip.fly ? 'amber' : 'blue'}>{trip.fly ? 'Fly-in, next day' : `${trip.miles} mi · ${trip.total >= 60 ? `${Math.floor(trip.total / 60)} h ${trip.total % 60} min` : `${trip.total} min`}`}</Badge>}>
      <RouteMap trip={trip} h={260} />
      <div className="grid grid-cols-3 gap-2 mt-2 text-[12px]">{[
        ['From', trip.flewIn ? `${trip.tech.name}, ${trip.depot.city.split(',')[0]} depot` : `${trip.tech.name}${trip.suggested ? ' (best match)' : ''}, ${trip.tech.base}`],
        ['Spares from', trip.depot ? `${trip.depot.city.split(',')[0]} depot` : 'None needed'],
        ['Arrives', wo.status === 'On site' ? 'On site now' : wo.status === 'Completed' ? 'Visit done' : `${hhmm(eta, trip.b.tz)} local`],
      ].map(([k, v]) => <div key={k} className="border border-line rounded px-2 py-1"><div className="text-ink3 text-[11px]">{k}</div><b className="text-ink">{v}</b></div>)}</div>
      <ol className="mt-2 divide-y divide-line/60">{trip.dirs.map((d, i) => <li key={i} className="flex items-center gap-2 py-1.5 text-[12.5px]"><d.icon size={14} className="text-info shrink-0" /><span className="flex-1 text-ink">{d.text}</span><span className="text-ink3 tabular-nums whitespace-nowrap">{[d.mi ? `${d.mi} mi` : null, d.min ? `${d.min} min` : null].filter(Boolean).join(' · ')}</span></li>)}</ol>
    </Card>
  );
}

// ---------- the store layout ----------
const ZONES = { office: [16, 16, 170, 96, 'Back office'], closet: [16, 124, 84, 70, 'IT closet'], counter: [16, 206, 170, 108, 'Sales counter'], warehouse: [200, 16, 250, 196, 'Warehouse'], docks: [200, 224, 250, 90, 'Loading docks'] };
const ZONE_OF = { 'Back office': 'office', Counter: 'counter', Warehouse: 'warehouse', 'Loading docks': 'docks' };

export function layoutOf(b, inc, demarc) {
  const devs = D.devicesOf(b.id);
  const fault = inc && inc.ci;
  const items = [];
  // the rack in the IT closet: SD-WAN appliances and switches
  const rack = devs.filter(d => d.type !== 'AP');
  rack.slice(0, 5).forEach((d, i) => items.push({ d, x: 32 + (i % 2) * 34, y: 148 + Math.floor(i / 2) * 14, kind: d.type === 'SD-WAN' ? 'ec' : 'sw' }));
  // the access points, spread across the zone each one serves
  const byZone = {};
  devs.filter(d => d.type === 'AP').forEach(d => { const z = d.role === 'Outdoor yard' ? 'yard' : ZONE_OF[d.role] || 'warehouse'; (byZone[z] = byZone[z] || []).push(d); });
  Object.entries(byZone).forEach(([z, list]) => list.forEach((d, i) => {
    if (z === 'yard') { items.push({ d, x: 500 + (i % 2) * 70, y: 60 + Math.floor(i / 2) * 80, kind: 'ap', pole: true }); return; }
    const [x, y, w, h] = ZONES[z]; const n = list.length, cols = Math.min(n, z === 'warehouse' ? 3 : 2), rows = Math.ceil(n / cols);
    items.push({ d, x: x + (w / (cols + 1)) * ((i % cols) + 1), y: y + 18 + ((h - 18) / (rows + 1)) * (Math.floor(i / cols) + 1), kind: 'ap' });
  }));
  const dm = /receiving/.test(demarc) ? { x: 440, y: 300 } : /Back office/.test(demarc) ? { x: 170, y: 30 } : { x: 90, y: 134 };
  const target = items.find(it => it.d.id === fault) || (inc && /circuit|jitter|pos/.test(inc.kind) ? { x: dm.x, y: dm.y } : { x: 58, y: 166 });
  return { items, more: Math.max(0, rack.length - 5), dm, target, fault };
}

export function StoreLayout({ b, inc, demarc, compact, onDevice }) {
  const L = layoutOf(b, inc, demarc || '');
  const W = b.yard ? 640 : 470;
  const path = L.target ? `M 440 330 L 440 316 L 300 316 L 300 ${L.target.y > 212 ? L.target.y : 218} ${L.target.x < 200 ? `L 193 218 L 193 ${L.target.y} ` : ''}L ${L.target.x} ${L.target.y}` : null;
  const fs = compact ? 13 : 10;
  return (
    <svg viewBox={`0 0 ${W} 340`} className="w-full" style={compact ? undefined : { maxHeight: 340 }}>
      {/* the building and its rooms */}
      <rect x={8} y={8} width={450} height={314} rx={4} className="fill-panel stroke-ink3" strokeWidth={2} />
      {Object.entries(ZONES).map(([k, [x, y, w, h, n]]) => <g key={k}>
        <rect x={x} y={y} width={w} height={h} rx={3} className={cx(k === 'closet' ? 'fill-info/10 stroke-info' : 'fill-chip stroke-line')} strokeWidth={1.2} />
        <text x={x + 6} y={y + 13} fontSize={fs} fontWeight={700} className="fill-ink2">{n}</text>
      </g>)}
      {/* warehouse racking and dock doors */}
      {[0, 1, 2, 3, 4].map(i => <rect key={i} x={222 + i * 46} y={44} width={12} height={150} className="fill-line" opacity={0.7} />)}
      {[0, 1, 2, 3].map(i => <rect key={i} x={222 + i * 58} y={310} width={40} height={8} className="fill-ink3" />)}
      {/* POS terminals at the counter */}
      {[0, 1, 2].map(i => <g key={i} transform={`translate(${40 + i * 50},${286})`}><rect x={-9} y={-7} width={18} height={14} rx={2} fill="#2A9D8F" /><text y={4} textAnchor="middle" fontSize={7} fill="#fff" fontWeight={700}>POS</text></g>)}
      {/* entrances */}
      <g transform="translate(100,322)"><rect x={-22} y={-4} width={44} height={8} fill="#2E8540" /><text y={16} textAnchor="middle" fontSize={fs} className="fill-ink2">Customer entrance</text></g>
      <g transform="translate(440,322)"><rect x={-14} y={-4} width={28} height={8} fill="#2F6DB5" /><text y={16} textAnchor="end" x={14} fontSize={fs} className="fill-info" fontWeight={700}>Contractor door</text></g>
      {/* the yard */}
      {b.yard && <g><rect x={470} y={8} width={162} height={314} rx={4} fill="none" className="stroke-ink3" strokeDasharray="6 4" strokeWidth={1.5} /><text x={478} y={24} fontSize={fs} fontWeight={700} className="fill-ink2">Outdoor yard</text>
        {[0, 1, 2].map(i => <rect key={i} x={486} y={200 + i * 34} width={130} height={14} className="fill-line" opacity={0.6} />)}</g>}
      {/* demarc */}
      <g transform={`translate(${L.dm.x},${L.dm.y})`}><rect x={-7} y={-7} width={14} height={14} rx={2} fill="#E07B00" /><text x={10} y={4} fontSize={fs - 1} className="fill-warn" fontWeight={700}>Demarc</text></g>
      {/* the technician's way in */}
      {path && <path d={path} fill="none" stroke="#2F6DB5" strokeWidth={2.2} strokeDasharray="5 4" markerEnd="url(#arr)" />}
      <defs><marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#2F6DB5" /></marker></defs>
      {/* devices */}
      {L.items.map(it => { const bad = it.d.id === L.fault; const col = it.kind === 'ec' ? '#762123' : it.kind === 'sw' ? '#1D3F66' : '#2F6DB5'; return (
        <g key={it.d.id} transform={`translate(${it.x},${it.y})`} onClick={onDevice ? () => onDevice(it.d) : undefined} className={onDevice ? 'cursor-pointer' : undefined}>
          <title>{`${it.d.id} · ${it.d.model}${it.d.role ? ` · ${it.d.role}` : ''}`}</title>
          {bad && <circle r={14} fill="#D62D20" opacity={0.25}><animate attributeName="r" values="9;17;9" dur="1.6s" repeatCount="indefinite" /></circle>}
          {it.pole && <line x1={0} y1={6} x2={0} y2={30} className="stroke-ink3" strokeWidth={2} />}
          {it.kind === 'ap' ? <circle r={6.5} fill={bad ? '#D62D20' : col} stroke="#fff" strokeWidth={1.5} /> : <rect x={-14} y={-5} width={28} height={10} rx={2} fill={bad ? '#D62D20' : col} />}
          {it.kind === 'ap' ? <path d="M-3,-1 a4,4 0 0 1 6,0 M-1.4,1 a2,2 0 0 1 2.8,0" fill="none" stroke="#fff" strokeWidth={1.1} /> : <text y={3} textAnchor="middle" fontSize={6.5} fill="#fff" fontWeight={700}>{it.kind === 'ec' ? 'SD-WAN' : it.d.model}</text>}
          {(!compact || bad) && it.kind === 'ap' && <text y={-10} textAnchor="middle" fontSize={fs - 2} className={bad ? 'fill-bad' : 'fill-ink3'} fontWeight={bad ? 700 : 400}>{it.d.id.split('-').pop()}</text>}
        </g>); })}
      {L.more > 0 && <text x={32} y={190} fontSize={fs - 2} className="fill-ink3">+{L.more} more in the rack</text>}
    </svg>
  );
}

export function StoreLayoutCard({ wo }) {
  const { s, act } = useApp(); const now = useNow();
  const P = packOf(s, wo, now);
  const demarc = (P.site.find(x => x[0] === 'Demarc') || [])[1];
  const fault = P.inc && D.DEV[P.inc.ci];
  const devs = D.devicesOf(P.b.id);
  return (
    <Card title={`Store layout: ${P.b.name.replace(/ – .*/, '')}`} right={fault ? <Badge tone="red">{fault.id} · {fault.type === 'AP' ? fault.role : 'IT closet'}</Badge> : P.inc ? <Badge tone="amber">Demarc: {demarc}</Badge> : <Badge>Planned work</Badge>}>
      <StoreLayout b={P.b} inc={P.inc} demarc={demarc} onDevice={d => act.drill({ t: 'device', id: d.id })} />
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-ink2 mt-1">
        {[['#762123', 'SD-WAN', devs.filter(d => d.type === 'SD-WAN').length], ['#1D3F66', 'Switch', devs.filter(d => d.type === 'Switch').length], ['#2F6DB5', 'Access point', devs.filter(d => d.type === 'AP').length], ['#2A9D8F', 'POS', 3], ['#E07B00', 'Demarc', 1], ['#D62D20', 'Fault', P.inc ? 1 : 0]].map(([c, l, n]) => <span key={l} className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: c }} />{l} <b className="text-ink">{n}</b></span>)}
        <span className="inline-flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-info" />Way in</span>
      </div>
    </Card>
  );
}

// ---------- the work pack in the field app ----------
export function PhoneApp({ wo }) {
  const { s, act } = useApp(); const now = useNow();
  const [tab, setTab] = useState('job');
  const P = packOf(s, wo, now);
  const trip = tripOf(s, wo, now);
  const canWork = s.role === 'tech' && wo.status !== 'Completed';
  const demarc = (P.site.find(x => x[0] === 'Demarc') || [])[1];
  const adv = st => { act.upd('workOrders', wo.id, { status: st }); act.audit(`${wo.id} → ${st} (field app)`, wo.id); act.toast(`${wo.id}: ${st}`); };
  const TABS = [['job', 'Job', I.Briefcase], ['route', 'Route', I.Navigation], ['store', 'Store', I.Map], ['steps', 'Steps', I.ListChecks], ['done', 'Hand-off', I.ShieldCheck]];
  const doneN = Object.keys(P.pk.steps || {}).length;
  const Row = ({ k, v }) => <div className="flex justify-between gap-2 py-1 border-b border-line/60 last:border-0 text-[12px]"><span className="text-ink3">{k}</span><span className="text-ink text-right">{v}</span></div>;
  return (
    <div className="mx-auto w-[318px] shrink-0">
      <div className="rounded-[40px] bg-[#16191D] p-[10px] shadow-2xl ring-1 ring-black/10 dark:ring-white/20">
        <div className="rounded-[32px] overflow-hidden bg-canvas h-[640px] flex flex-col relative">
          {/* status bar */}
          <div className="h-8 px-6 flex items-center justify-between text-[11.5px] font-semibold text-ink bg-panel"><span>{hhmm(now, P.b.tz)}</span><span className="absolute left-1/2 -translate-x-1/2 top-1.5 w-24 h-5 rounded-full bg-[#16191D]" /><span className="flex items-center gap-1"><I.Signal size={12} /><I.Wifi size={12} /><I.BatteryFull size={14} /></span></div>
          {/* app bar */}
          <div className="bg-brand text-white px-4 py-2.5">
            <div className="flex items-center gap-2 text-[11px] opacity-90"><I.HardHat size={13} />Mova iO Field<span className="flex-1" />{P.tech ? P.tech.name : 'Unassigned'}</div>
            <div className="flex items-center gap-2 mt-1"><b className="text-[15px] font-mono">{wo.id}</b><Pri p={wo.priority} /><span className="flex-1" /><span className="text-[11px] bg-white/20 rounded px-1.5 py-0.5">{wo.status}</span></div>
            <div className="text-[12.5px] mt-0.5 font-semibold leading-snug">{P.service}</div>
            <div className="text-[11.5px] opacity-90">{P.b.name}</div>
          </div>
          {/* content */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 text-ink">
            {tab === 'job' && <>
              <div className="bg-panel rounded-xl border border-line p-3"><Row k="Brand" v={P.b.brand} /><Row k="Local time" v={`${P.clk.local}, ${P.clk.open ? 'open' : 'closed'}`} /><Row k="Window" v={wo.window || '—'} /><Row k="Status" v={P.status} />{(P.before.appointment || []).filter(x => x[0] === 'Arrives').map(x => <Row key={x[0]} k="Arrive by" v={x[1]} />)}</div>
              <div className="bg-panel rounded-xl border border-line p-3"><div className="text-[11px] font-bold uppercase text-ink3 mb-1">Bring</div>{P.before.parts.map(p => <div key={p.part} className="flex items-center gap-2 text-[12.5px] py-0.5"><I.Package size={13} className="text-info" /><span className="flex-1">{p.part}</span><span className={cx('text-[11px]', p.reserved ? 'text-ok' : 'text-warn')}>{p.reserved ? `reserved, ${p.from}` : p.from}</span></div>)}{P.before.tools.slice(0, 4).map(t => <div key={t} className="flex items-center gap-2 text-[12px] text-ink2 py-0.5"><I.Wrench size={12} className="text-ink3" />{t}</div>)}</div>
              {P.brief && <div className="bg-panel rounded-xl border border-line p-3"><div className="text-[11px] font-bold uppercase text-ai mb-1 flex items-center gap-1"><I.Sparkles size={12} />Mova iO checked remotely</div>{(P.brief.done || []).slice(0, 4).map((d, i) => <div key={i} className="text-[12px] py-0.5 flex gap-1.5"><span className={cx('w-1.5 h-1.5 rounded-full mt-1.5 shrink-0', d.tone === 'bad' ? 'bg-bad' : d.tone === 'ok' ? 'bg-ok' : 'bg-info')} /><span><b className="font-semibold">{d.what}.</b> <span className="text-ink2">{d.found}</span></span></div>)}</div>}
              <div className="bg-panel rounded-xl border border-line p-3"><div className="text-[11px] font-bold uppercase text-ink3 mb-1">On arrival</div>{P.before.access.slice(0, 3).map(a => <div key={a} className="text-[12px] text-ink2 py-0.5">{a}</div>)}</div>
            </>}
            {tab === 'route' && trip && <>
              <div className="rounded-xl overflow-hidden border border-line"><RouteMap trip={trip} h={230} aspect={1.25} pxw={290} /></div>
              <div className="bg-panel rounded-xl border border-line p-3 flex items-center gap-3"><I.Clock size={18} className="text-info" /><div className="flex-1"><b className="text-[15px]">{trip.fly ? 'Next day' : trip.total >= 60 ? `${Math.floor(trip.total / 60)} h ${trip.total % 60} min` : `${trip.total} min`}</b><div className="text-[11.5px] text-ink3">{trip.miles} mi{trip.depot ? `, via ${trip.depot.city.split(',')[0]} depot` : ''}</div></div><Btn size="sm" kind="primary" icon={I.Navigation} onClick={() => act.toast('Opening directions in the maps app')}>Go</Btn></div>
              <div className="bg-panel rounded-xl border border-line px-3 py-1">{trip.dirs.map((d, i) => <div key={i} className="flex items-center gap-2 py-1.5 border-b border-line/60 last:border-0 text-[12px]"><d.icon size={13} className="text-info shrink-0" /><span className="flex-1">{d.text}</span>{d.mi ? <span className="text-ink3 text-[11px]">{d.mi} mi</span> : null}</div>)}</div>
            </>}
            {tab === 'store' && <>
              <div className="bg-panel rounded-xl border border-line p-2"><StoreLayout b={P.b} inc={P.inc} demarc={demarc} compact /></div>
              <div className="bg-panel rounded-xl border border-line p-3">{P.devices.map(d => <div key={d.id} className={cx('flex items-center gap-2 py-1 text-[12px] border-b border-line/60 last:border-0', P.inc && d.id === P.inc.ci && 'text-bad font-semibold')}><span className="flex-1">{d.kind} <span className="font-mono text-[11px]">{d.id.split('-').pop()}</span></span><span className="text-ink3 text-[11px]">{d.where}</span></div>)}<div className="flex items-center gap-2 py-1 text-[12px]"><span className="flex-1">Demarc</span><span className="text-ink3 text-[11px]">{demarc}</span></div></div>
            </>}
            {tab === 'steps' && <>
              <div className="text-[11.5px] text-ink3">{doneN} of {P.plan.steps.length} done</div>
              {P.plan.steps.map((st, i) => { const ok = (P.pk.steps || {})[i]; return <button key={i} disabled={!canWork} onClick={() => tickStep(act, wo, i, act.me())} className={cx('w-full text-left bg-panel rounded-xl border p-2.5 flex gap-2 text-[12.5px]', ok ? 'border-ok/50' : 'border-line')}><span className={cx('w-5 h-5 rounded-full border-2 grid place-items-center shrink-0', ok ? 'bg-ok border-ok text-white' : 'border-ink3')}>{ok && <I.Check size={12} />}</span><span className={ok ? 'text-ink2 line-through' : ''}>{st}</span></button>; })}
              <div className="grid grid-cols-2 gap-2">{P.plan.photos.map(l => { const has = (P.pk.photos || []).some(x => x.label === l); return <button key={l} disabled={!canWork} onClick={() => addPhoto(act, wo, l)} className={cx('rounded-xl border-2 border-dashed h-16 text-[11px] flex flex-col items-center justify-center gap-0.5 px-1 text-center', has ? 'border-ok text-ok' : 'border-line text-ink3')}>{has ? <I.ImageIcon size={15} /> : <I.Camera size={15} />}{l}</button>; })}</div>
              {P.plan.readings.map(r => { const v = (P.pk.readings || {})[r.key], ok = readingOk(r, v); return <div key={r.key} className="bg-panel rounded-xl border border-line p-2.5 text-[12px]"><div className="flex items-center"><span className="flex-1">{r.label}</span>{ok != null && <Badge tone={ok ? 'green' : 'red'}>{ok ? 'in range' : 'out of range'}</Badge>}</div>
                {r.kind === 'pass' ? <div className="flex gap-1.5 mt-1">{['Pass', 'Fail'].map(o => <button key={o} disabled={!canWork} onClick={() => setReading(act, wo, r.key, o)} className={cx('flex-1 rounded-lg border py-1', v === o ? (o === 'Pass' ? 'bg-ok text-white border-ok' : 'bg-bad text-white border-bad') : 'border-line')}>{o}</button>)}</div>
                  : <input disabled={!canWork} value={v ?? ''} onChange={e => setReading(act, wo, r.key, e.target.value)} placeholder={r.unit ? `${r.lo} to ${r.hi} ${r.unit}` : 'Enter'} className="mt-1 w-full rounded-lg border border-line bg-canvas px-2 py-1" />}</div>; })}
            </>}
            {tab === 'done' && <>
              <div className="bg-panel rounded-xl border border-line p-3"><div className="text-[11px] font-bold uppercase text-ink3 mb-1">Return to service</div>{P.verify.map(v => <div key={v} className="flex items-center gap-2 text-[12px] py-0.5"><I.CircleCheck size={13} className={P.pk.check && P.pk.check.pass ? 'text-ok' : 'text-ink3'} />{v}</div>)}</div>
              {P.pk.check && <div className={cx('rounded-xl border p-3 text-[12px]', P.pk.check.pass ? 'border-ok/50 bg-ok/10' : 'border-warn/50 bg-warn/10')}><b>{P.pk.check.pass ? 'Check passed: the NOC accepts the hand-off' : 'Not passed yet'}</b>{!P.pk.check.pass && P.pk.check.missing.slice(0, 4).map(m => <div key={m} className="text-ink2">{m}</div>)}</div>}
              {P.pk.accepted && <div className="rounded-xl border border-ok/50 bg-ok/10 p-3 text-[12px]"><b>Accepted by {P.pk.accepted.by}</b></div>}
              <Btn kind="brand" className="w-full justify-center" icon={I.ShieldCheck} disabled={!canWork} onClick={() => returnCheck(act, s, wo, P)}>Run the return check</Btn>
            </>}
            {!canWork && wo.status !== 'Completed' && <div className="text-[11px] text-ink3 text-center">The technician works this on the phone; the Field Technician role can tick it here.</div>}
          </div>
          {/* travel buttons and the tab bar */}
          {canWork && ['Assigned', 'Dispatched', 'Scheduled', 'En route'].includes(wo.status) && <div className="px-3 pb-2"><Btn kind="primary" className="w-full justify-center" icon={wo.status === 'En route' ? I.MapPinCheck : I.Navigation} onClick={() => adv(wo.status === 'En route' ? 'On site' : 'En route')}>{wo.status === 'En route' ? "I've arrived" : 'Start travel'}</Btn></div>}
          <div className="h-14 border-t border-line bg-panel grid grid-cols-5">{TABS.map(([k, l, Ic]) => <button key={k} onClick={() => setTab(k)} className={cx('flex flex-col items-center justify-center gap-0.5 text-[10.5px]', tab === k ? 'text-brand font-bold' : 'text-ink3')}><Ic size={17} />{l}</button>)}</div>
        </div>
      </div>
    </div>
  );
}

// ---------- the technician view on Field Dispatch ----------
export function FieldVisit() {
  const { s, act } = useApp();
  const open = s.workOrders.filter(w => w.status !== 'Completed');
  const list = open.length ? open : s.workOrders;
  const sel = list.find(w => w.id === s.fieldWo) || list.find(w => w.status === 'En route') || list[0];
  if (!sel) return <Card title="Technician view"><div className="text-[12.5px] text-ink2">No work orders.</div></Card>;
  return (<>
    <div className="flex gap-2 overflow-x-auto pb-2 mb-1">{list.map(w => { const b = D.BR[w.branchId]; return (
      <button key={w.id} onClick={() => act.set({ fieldWo: w.id })} className={cx('shrink-0 text-left rounded-lg border px-3 py-2 min-w-[200px]', w.id === sel.id ? 'border-ink ring-1 ring-ink bg-panel' : 'border-line bg-panel hover:border-ink3')}>
        <div className="flex items-center gap-2"><b className="font-mono text-[12px]">{w.id}</b><Pri p={w.priority} /><span className="flex-1" /><Badge tone={w.status === 'Unassigned' ? 'amber' : w.status === 'En route' ? 'blue' : w.status === 'On site' ? 'green' : 'gray'}>{w.status}</Badge></div>
        <div className="text-[12px] text-ink mt-0.5 truncate">{b.name.replace(/ – .*/, '')}, {b.city}</div>
      </button>); })}</div>
    <div className="grid grid-cols-1 xl:grid-cols-[338px_minmax(0,1fr)] gap-3 items-start">
      <PhoneApp key={sel.id} wo={sel} />
      <div className="space-y-3 min-w-0">
        <RouteCard wo={sel} />
        <StoreLayoutCard wo={sel} />
      </div>
    </div>
  </>);
}
