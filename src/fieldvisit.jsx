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
import { packOf, readingOk, tickStep, addPhoto, setReading, setFindings, returnCheck, acceptHandoff } from './dash/workpack.js';
import { hhmm, MIN } from './util.js';
import { StoreLayout, planOf } from './storeplan.jsx';
import { useMapZoom } from './charts.jsx';

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

export const RouteMap = props => props.trip ? <RouteMapInner {...props} /> : null;
function RouteMapInner({ trip, h = 300, aspect = 3.4, pxw = 900 }) {
  const xs = trip.pts.map(p => p.x), ys = trip.pts.map(p => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  // fit the whole trip with a margin, in the shape of the frame it is drawn in
  const w0 = Math.max(60, (x1 - x0) * 1.35), h0 = Math.max(36, (y1 - y0) * 1.5 + 24);
  const W = Math.max(w0, h0 * aspect), hh = W / aspect;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  // zoom: starts fitted to the trip; zoom out (4×) for the region, in for the streets
  const Z = useMapZoom([cx - W * 2, cy - hh * 2, W * 4, hh * 4], `${Math.round(cx)},${Math.round(cy)},${Math.round(W)}`, 4);
  const vb = Z.vb;
  const r = 8.5 * vb[2] / pxw; // markers and labels keep the same size on screen whatever the zoom
  // the technician's position along the whole trip
  const lens = trip.legs.map(l => l.min), tot = lens.reduce((a, v) => a + v, 0) || 1;
  let rem = trip.at * tot, pos = trip.pts[0];
  for (let i = 0; i < trip.legs.length; i++) { if (rem <= lens[i] || i === trip.legs.length - 1) { pos = quadAt(trip.legs[i].from, trip.legs[i].to, i, Math.min(1, rem / lens[i])); break; } rem -= lens[i]; }
  const near = D.BRANCHES.filter(x => x.x > vb[0] && x.x < vb[0] + vb[2] && x.y > vb[1] && x.y < vb[1] + vb[3]);
  const MK = { tech: [I.HardHat, '#2F6DB5'], depot: [I.Warehouse, '#E07B00'], store: [I.Store, '#762123'] };
  return (<div className="relative">{Z.controls}
    <svg viewBox={vb.join(' ')} className="w-full rounded-md bg-[#dfeaf3] dark:bg-[#1b2633] select-none" style={{ height: h, ...Z.bind.style }} preserveAspectRatio="xMidYMid meet" ref={Z.bind.ref} onDoubleClick={Z.bind.onDoubleClick} onPointerDown={Z.bind.onPointerDown} onPointerMove={Z.bind.onPointerMove} onPointerUp={Z.bind.onPointerUp} onPointerLeave={Z.bind.onPointerLeave} onClickCapture={Z.bind.onClickCapture}>
      {MAP.states.map(st => <path key={st.id} d={st.d} className="fill-mapland stroke-line" strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
      {near.map(x => <circle key={x.id} cx={x.x} cy={x.y} r={r * 0.3} fill="#A3ACB8" opacity={0.7} />)}
      {trip.legs.map((l, i) => <g key={i}>
        <path d={bend(l.from, l.to, i)} fill="none" stroke="#fff" strokeWidth={9} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <path d={bend(l.from, l.to, i)} fill="none" stroke={l.fly ? '#5E6B78' : '#2F6DB5'} strokeWidth={5} strokeLinecap="round" strokeDasharray={l.fly ? '2 8' : undefined} vectorEffect="non-scaling-stroke" />
      </g>)}
      {trip.pts.map((p, i) => { const [Ic, col] = MK[p.kind]; return <g key={i} transform={`translate(${p.x},${p.y})`}>
        <circle r={r * 1.6} fill={col} stroke="#fff" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        <Ic x={-r * 0.95} y={-r * 0.95} width={r * 1.9} height={r * 1.9} color="#fff" strokeWidth={2.4} />
        <text y={p.kind === 'store' ? r * 3.6 : -r * 2.2} textAnchor="middle" fontSize={r * 1.25} fontWeight={700} className="fill-ink" paintOrder="stroke" stroke="rgb(var(--panel))" strokeWidth={r * 0.5}>{p.label}</text>
      </g>; })}
      {trip.at > 0 && trip.at < 1 && <g transform={`translate(${pos.x},${pos.y})`}><circle r={r * 2.4} fill="#2F6DB5" opacity={0.2}><animate attributeName="r" values={`${r * 1.4};${r * 2.8};${r * 1.4}`} dur="2s" repeatCount="indefinite" /></circle><circle r={r * 0.9} fill="#2F6DB5" stroke="#fff" strokeWidth={2} vectorEffect="non-scaling-stroke" /></g>}
    </svg>
  </div>);
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

// ---------- the store layout: see storeplan.jsx ----------
export function StoreLayoutCard({ wo }) {
  const { s, act } = useApp(); const now = useNow();
  const P = packOf(s, wo, now);
  const demarc = (P.site.find(x => x[0] === 'Demarc') || [])[1];
  const fault = P.inc && D.DEV[P.inc.ci];
  const devs = D.devicesOf(P.b.id), plan = planOf(P.b);
  return (
    <Card title={`Store layout: ${P.b.name.replace(/ – .*/, '')}`} sub={plan.desc} right={fault ? <Badge tone="red">{fault.id} · {fault.type === 'AP' ? fault.role : 'IT closet'}</Badge> : P.inc ? <Badge tone="amber">Demarc: {demarc}</Badge> : <Badge>Planned work</Badge>}>
      <StoreLayout b={P.b} inc={P.inc} demarc={demarc} onDevice={d => act.drill({ t: 'device', id: d.id })} />
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-ink2 mt-1">
        {[['#762123', 'SD-WAN', devs.filter(d => d.type === 'SD-WAN').length], ['#1D3F66', 'Switch', devs.filter(d => d.type === 'Switch').length], ['#2F6DB5', 'Access point', devs.filter(d => d.type === 'AP').length], ['#2A9D8F', 'POS', plan.pos], ['#E07B00', 'Demarc', 1], ['#D62D20', 'Fault', P.inc ? 1 : 0]].map(([c, l, n]) => <span key={l} className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: c }} />{l} <b className="text-ink">{n}</b></span>)}
        <span className="inline-flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-info" />Way in</span>
      </div>
      <div className="text-[11.5px] text-ink3 mt-1">Layout: {plan.features.join('; ')}.</div>
    </Card>
  );
}

// ---------- the work pack in the field app ----------
// One work pack, as the technician carries it on the phone. It holds all six parts Mova iO assembles: site context,
// before arrival, diagnostic history, the approved checklist, evidence, and verify + hand-off, with Mova iO's summary
// on top. The Field Technician works the checklist and evidence and runs the return check; the NOC owner accepts the
// hand-off; everyone else reads it. It takes the state and actions as props so the drill-down can use it too.
export const PHONE_TABS = [['brief', 'Brief', I.Sparkles], ['site', 'Site', I.Store], ['travel', 'Travel', I.Navigation], ['work', 'Work', I.ListChecks], ['done', 'Hand-off', I.ShieldCheck]];
const DONE_IC = { bad: [I.XCircle, 'text-bad'], ok: [I.CheckCircle2, 'text-ok'], info: [I.Clock, 'text-info'] };
const PATH_COL = { ok: 'bg-ok/15 border-ok/40 text-ok', warn: 'bg-warn/15 border-warn/50 text-warn', bad: 'bg-bad/15 border-bad/50 text-bad', fixed: 'bg-ok/15 border-ok/40 text-ok' };
const Box = ({ title, right, children, tone }) => <div className={cx('bg-panel rounded-xl border p-3', tone === 'bad' ? 'border-bad/40' : tone === 'ok' ? 'border-ok/40' : tone === 'brand' ? 'border-brand/40' : 'border-line')}>{title && <div className="flex items-center gap-1.5 mb-1.5"><span className={cx('text-[10.5px] font-bold uppercase tracking-wide flex-1', tone === 'bad' ? 'text-bad' : tone === 'brand' ? 'text-brand' : 'text-ink3')}>{title}</span>{right}</div>}{children}</div>;
const Row = ({ k, v }) => <div className="flex justify-between gap-3 py-1 border-b border-line/60 last:border-0 text-[12px]"><span className="text-ink3 shrink-0">{k}</span><span className="text-ink text-right min-w-0 break-words">{v}</span></div>;

export function PhoneApp({ wo, s, now, act, role, go, tab: tabIn, setTab: setTabIn }) {
  const [tabLocal, setTabLocal] = useState('brief');
  const tab = tabIn || tabLocal, setTab = setTabIn || setTabLocal;
  const P = packOf(s, wo, now);
  const trip = tripOf(s, wo, now);
  const closed = wo.status === 'Completed';
  const canWork = !!(act && role === 'tech' && !closed), canAccept = !!(act && ['noc', 'l3'].includes(role) && !closed);
  const demarc = (P.site.find(x => x[0] === 'Demarc') || [])[1];
  const pk = P.pk, check = pk.check;
  const [txt, setTxt] = useState(pk.findings || '');
  const adv = st => { act.upd('workOrders', wo.id, { status: st }); act.audit(`${wo.id} → ${st} (field app)`, wo.id); act.toast(`${wo.id}: ${st}`); };
  const doneN = Object.keys(pk.steps || {}).length;
  const got = Object.fromEntries((pk.photos || []).map(x => [x.label, x]));
  const h = P.history, br = P.brief;
  const link = (n, label, cls) => go ? <button onClick={() => go(n)} className={cx('text-left hover:underline', cls)}>{label}</button> : <span className={cls}>{label}</span>;
  return (
    <div className="mx-auto w-[318px] shrink-0">
      <div className="rounded-[40px] bg-[#16191D] p-[10px] shadow-2xl ring-1 ring-black/10 dark:ring-white/20">
        <div className="rounded-[32px] overflow-hidden bg-canvas h-[660px] flex flex-col relative">
          <div className="h-8 px-6 flex items-center justify-between text-[11.5px] font-semibold text-ink bg-panel shrink-0"><span>{hhmm(now, P.b.tz)}</span><span className="absolute left-1/2 -translate-x-1/2 top-1.5 w-24 h-5 rounded-full bg-[#16191D]" /><span className="flex items-center gap-1"><I.Signal size={12} /><I.Wifi size={12} /><I.BatteryFull size={14} /></span></div>
          <div className="bg-brand text-white px-4 py-2.5 shrink-0">
            <div className="flex items-center gap-2 text-[11px] opacity-90"><I.HardHat size={13} />Mova iO Field · work pack<span className="flex-1" />{P.tech ? P.tech.name : 'Unassigned'}</div>
            <div className="flex items-center gap-2 mt-1"><b className="text-[15px] font-mono">{wo.id}</b><Pri p={wo.priority} /><span className="flex-1" /><span className="text-[11px] bg-white/20 rounded px-1.5 py-0.5">{wo.status}</span></div>
            <div className="text-[12.5px] mt-0.5 font-semibold leading-snug">{P.service}</div>
            <div className="text-[11.5px] opacity-90">{P.b.name}</div>
            <div className="flex gap-1 mt-2">{[['Site', true], ['Before', true], ['History', true], ['Steps', doneN === P.plan.steps.length], ['Evidence', (pk.photos || []).length >= Math.min(2, P.plan.photos.length)], ['Hand-off', !!pk.accepted]].map(([l, d], i) => <span key={l} title={l} className={cx('flex-1 h-1.5 rounded-full', d && i > 2 ? 'bg-white' : i <= 2 ? 'bg-white/70' : 'bg-white/25')} />)}</div>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 text-ink">
            {tab === 'brief' && <>
              {br ? <>
                <Box title={`Probable problem · ${br.problem.layer} · ${Math.round(br.problem.conf * 100)}%`} tone="bad"><div className="text-[13px] font-semibold leading-snug">{P.inc ? link({ t: 'rca', id: P.inc.id }, br.problem.text) : br.problem.text}</div>{br.problem.ev && <div className="text-[11.5px] text-ink2 mt-0.5">{br.problem.ev}</div>}{br.unlikely.length > 0 && <div className="text-[11px] text-ink3 mt-1">Less likely: {br.unlikely.map(u => `${u.text} (${Math.round(u.conf * 100)}%)`).join('; ')}</div>}</Box>
                <Box title="Mova iO checked remotely">{br.done.map((d, i) => { const [Ic, c] = DONE_IC[d.tone] || DONE_IC.info; return <div key={i} className="flex gap-1.5 text-[12px] py-0.5"><Ic size={14} className={cx('mt-[1px] shrink-0', c)} /><span><b className="font-semibold">{d.what}.</b> <span className="text-ink2">{d.found}</span></span></div>; })}</Box>
                <Box title="Fix on site" tone="brand"><div className="text-[12.5px] font-bold flex gap-1.5"><I.Wrench size={14} className="text-brand mt-[1px] shrink-0" />{br.fix}</div><div className="text-[11.5px] text-ink2 mt-1"><b className="text-ink">Plan B:</b> {br.ifNot}</div></Box>
              </> : <Box title="Planned work"><div className="text-[12.5px]">{wo.task}</div><div className="text-[11.5px] text-ink3 mt-1">Nothing has failed, so there is nothing to diagnose.</div></Box>}
              <Box title="Bring">{P.before.parts.map(p => <div key={p.part} className="flex items-center gap-2 text-[12.5px] py-0.5"><I.Package size={13} className="text-info" /><span className="flex-1">{p.qty} × {p.part}</span><span className={cx('text-[11px]', p.reserved ? 'text-ok' : 'text-warn')}>{p.reserved ? `reserved, ${p.from}` : p.from}</span></div>)}{br && br.extra.length > 0 && <div className="text-[12px] text-ink2 py-0.5"><b className="text-ink">Also:</b> {br.extra.join(', ')}</div>}<div className="flex flex-wrap gap-1 mt-1">{P.before.tools.map(t => <span key={t} className="text-[10.5px] px-1.5 py-[1px] rounded border border-line bg-chip text-ink2">{t}</span>)}</div></Box>
              {h && <>
                <Box title="Diagnostic history · OpsRamp findings">{h.findings.map((x, i) => <div key={i} className="grid grid-cols-[38px_minmax(0,1fr)] gap-1.5 text-[11.5px] py-0.5"><span className="font-mono text-ink3">{hhmm(x.t)}</span><span>{x.text}<span className="text-ink3"> · {x.src}</span></span></div>)}{h.tried.length > 0 && <><div className="text-[10.5px] font-bold uppercase text-ink3 mt-2 mb-0.5">Already tried</div>{h.tried.map(x => <div key={x} className="text-[11.5px] text-ink2 py-0.5">{x}</div>)}</>}</Box>
                <Box title="Earlier incidents here, 90 days">{h.prior.length ? h.prior.map(x => <div key={x.id} className="text-[11.5px] py-0.5">{link({ t: 'incident', id: x.id }, <><span className="font-mono text-ink2">{x.id}</span> {x.title}</>)}<span className="text-ink3"> · {x.closeCode}</span></div>) : <div className="text-[11.5px] text-ink3">None in the last 90 days.</div>}</Box>
              </>}
            </>}
            {tab === 'site' && <>
              <Box title="Site">{P.site.map(([k, v]) => <Row key={k} k={k} v={v} />)}</Box>
              <Box title="Network path"><div className="flex items-center gap-0.5">{P.path.map((x, i) => <React.Fragment key={x.label}>{i > 0 && <span className="w-1.5 h-px bg-ink3" />}<span className={cx('flex-1 text-center text-[10px] font-semibold rounded border px-0.5 py-1', PATH_COL[x.st] || PATH_COL.ok)}>{x.label}</span></React.Fragment>)}</div></Box>
              <Box title="Store layout"><StoreLayout b={P.b} inc={P.inc} demarc={demarc} compact /><div className="text-[11px] text-ink3 mt-1">{planOf(P.b).desc}</div></Box>
              <Box title="Key devices">{P.devices.map(d => <div key={d.id} className={cx('py-1 border-b border-line/60 last:border-0 text-[12px]', d.fault && 'text-bad')}>{link({ t: 'device', id: d.id }, <><b>{d.kind}</b> <span className="font-mono text-[11px]">{d.id}</span>{d.fault ? ' · fault' : ''}</>)}<div className="text-[11px] text-ink3">{d.model} · {d.where}</div></div>)}</Box>
            </>}
            {tab === 'travel' && <>
              <Box title="Authorised access">{P.before.access.map(a => <div key={a} className="flex gap-1.5 text-[12px] py-0.5"><I.CheckCircle2 size={13} className="text-ok mt-[2px] shrink-0" />{a}</div>)}</Box>
              <Box title="Appointment">{P.before.appointment.map(([k, v]) => <Row key={k} k={k} v={v} />)}</Box>
              {trip && <>
                <div className="rounded-xl overflow-hidden border border-line"><RouteMap trip={trip} h={200} aspect={1.45} pxw={290} /></div>
                <div className="bg-panel rounded-xl border border-line p-3 flex items-center gap-3"><I.Clock size={18} className="text-info" /><div className="flex-1"><b className="text-[15px]">{trip.fly ? 'Next day' : trip.total >= 60 ? `${Math.floor(trip.total / 60)} h ${trip.total % 60} min` : `${trip.total} min`}</b><div className="text-[11.5px] text-ink3">{trip.miles} mi{trip.depot ? `, via ${trip.depot.city.split(',')[0]} depot` : ''}</div></div>{act && <Btn size="sm" kind="primary" icon={I.Navigation} onClick={() => act.toast('Opening directions in the maps app')}>Go</Btn>}</div>
                <Box>{trip.dirs.map((d, i) => <div key={i} className="flex items-center gap-2 py-1.5 border-b border-line/60 last:border-0 text-[12px]"><d.icon size={13} className="text-info shrink-0" /><span className="flex-1">{d.text}</span>{d.mi ? <span className="text-ink3 text-[11px]">{d.mi} mi</span> : null}</div>)}</Box>
              </>}
            </>}
            {tab === 'work' && <>
              <Box tone="ok"><div className="text-[11.5px] flex gap-1.5"><I.ShieldCheck size={14} className="text-ok mt-[1px] shrink-0" /><span><b>Approved scope</b> by {P.scope.by.replace(/ \(NOC Engineer\)| \(Network Engineer L3\)/, '')} at {hhmm(P.scope.at)} CT. Anything outside these steps needs the NOC engineer's OK.</span></div></Box>
              <div className="text-[11.5px] text-ink3">{doneN} of {P.plan.steps.length} steps done</div>
              {P.plan.steps.map((st, i) => { const d = (pk.steps || {})[i]; return <button key={i} disabled={!canWork} onClick={() => tickStep(act, wo, i, act.me())} className={cx('w-full text-left bg-panel rounded-xl border p-2.5 flex gap-2 text-[12.5px]', d ? 'border-ok/50' : 'border-line')}><span className={cx('w-5 h-5 rounded-full border-2 grid place-items-center shrink-0', d ? 'bg-ok border-ok text-white' : 'border-ink3 text-ink3')}>{d ? <I.Check size={12} /> : <span className="text-[10px] font-bold">{i + 1}</span>}</span><span className="min-w-0"><span className={d ? 'text-ink2 line-through' : ''}>{st}</span>{d && <span className="block text-[10.5px] text-ink3">Done {hhmm(d.t)} CT</span>}</span></button>; })}
              <div className="text-[10.5px] font-bold uppercase tracking-wide text-ink3 pt-1">Photos</div>
              <div className="grid grid-cols-2 gap-2">{P.plan.photos.map(l => got[l] ? <div key={l} className="rounded-xl border border-ok/50 overflow-hidden bg-panel"><div className="h-12 bg-gradient-to-br from-ink3/30 to-ink3/10 grid place-items-center"><I.ImageIcon size={18} className="text-ink2" /></div><div className="px-2 py-1 text-[10.5px]"><b>{l}</b><span className="block text-ink3">{hhmm(got[l].t)} CT</span></div></div>
                : <button key={l} disabled={!canWork} onClick={() => addPhoto(act, wo, l)} className="rounded-xl border-2 border-dashed border-line h-[70px] text-[10.5px] flex flex-col items-center justify-center gap-0.5 px-1 text-center text-ink3"><I.Camera size={15} />{l}</button>)}</div>
              <div className="text-[10.5px] font-bold uppercase tracking-wide text-ink3 pt-1">Readings</div>
              {P.plan.readings.map(r => { const v = (pk.readings || {})[r.key], ok = readingOk(r, v); return <div key={r.key} className="bg-panel rounded-xl border border-line p-2.5 text-[12px]"><div className="flex items-center gap-2"><span className="flex-1">{r.label}{r.unit && <span className="text-ink3"> ({r.lo === r.hi ? r.hi : `${r.lo} to ${r.hi}`} {r.unit})</span>}</span>{ok != null && <Badge tone={ok ? 'green' : 'red'}>{ok ? 'in range' : 'out'}</Badge>}</div>
                {r.kind === 'pass' ? <div className="flex gap-1.5 mt-1">{['Pass', 'Fail'].map(o => <button key={o} disabled={!canWork} onClick={() => setReading(act, wo, r.key, o)} className={cx('flex-1 rounded-lg border py-1', v === o ? (o === 'Pass' ? 'bg-ok text-white border-ok' : 'bg-bad text-white border-bad') : 'border-line')}>{o}</button>)}</div>
                  : <input disabled={!canWork} value={v ?? ''} onChange={e => setReading(act, wo, r.key, e.target.value)} inputMode={r.kind === 'text' ? 'text' : 'decimal'} placeholder={r.kind === 'text' ? 'Type it' : r.unit} className="mt-1 w-full rounded-lg border border-line bg-canvas px-2 py-1" />}</div>; })}
              <div className="text-[10.5px] font-bold uppercase tracking-wide text-ink3 pt-1">Findings</div>
              <textarea disabled={!canWork} value={canWork ? txt : (pk.findings || '')} onChange={e => setTxt(e.target.value)} onBlur={() => canWork && setFindings(act, wo, txt)} rows={3} placeholder={canWork ? 'What you found and what you did' : 'Written by the technician on site'} className="w-full rounded-xl border border-line bg-panel text-[12px] px-2.5 py-2" />
            </>}
            {tab === 'done' && <>
              <Box title="Return-to-service check">{P.verify.map(v => <div key={v} className="flex items-center gap-2 text-[12px] py-0.5">{check && check.pass ? <I.CheckCircle2 size={14} className="text-ok" /> : <I.Circle size={14} className="text-ink3" />}{v}</div>)}</Box>
              {check && <div className={cx('rounded-xl border p-3 text-[12px]', check.pass ? 'border-ok/50 bg-ok/10' : 'border-warn/50 bg-warn/10')}><b>{check.pass ? `Passed at ${hhmm(check.t)} CT` : 'Not passed yet'}</b>{!check.pass && check.missing.slice(0, 5).map(m => <div key={m} className="text-ink2">{m}</div>)}</div>}
              {canWork && !pk.accepted && <Btn kind="brand" className="w-full justify-center" icon={I.ShieldCheck} onClick={() => returnCheck(act, s, wo, P)}>Run the return check</Btn>}
              <Box title="Receiving owner"><div className="text-[12px]">{P.owner ? <><b>{P.owner}</b>{P.team ? ` (${P.team.name})` : ''} accepts the work.</> : 'The NOC accepts the work.'}</div></Box>
              {pk.accepted ? <div className="rounded-xl border border-ok/50 bg-ok/10 p-3 text-[12px]"><b>Accepted by {pk.accepted.by}</b>{pk.accepted.for ? ` for ${pk.accepted.for}` : ''} at {hhmm(pk.accepted.t)} CT. {wo.id} closed{P.inc ? `; ${P.inc.id} resolved` : ''}.</div>
                : canAccept && <Btn kind="ok" className="w-full justify-center" icon={I.BadgeCheck} disabled={!(check && check.pass)} title={check && check.pass ? undefined : 'Waits for the return check to pass'} onClick={() => acceptHandoff(act, s, wo, P)}>Accept the hand-off</Btn>}
              {wo.parts.length > 0 && <Box title="Returns"><div className="text-[12px] text-ink2">The faulty {wo.parts.join(', ')} goes back {P.inc && P.inc.vendorCase ? `to HPE on case ${P.inc.vendorCase}` : 'to the depot'} with the RMA label.</div></Box>}
            </>}
            {!closed && !canWork && <div className="text-[11px] text-ink3 text-center px-2">{canAccept ? 'You accept the hand-off here; the technician works the steps and evidence.' : role === 'tech' ? '' : 'Read-only: the Field Technician works this pack on the phone.'}</div>}
          </div>
          {canWork && ['Assigned', 'Dispatched', 'Scheduled', 'En route'].includes(wo.status) && <div className="px-3 pb-2 shrink-0"><Btn kind="primary" className="w-full justify-center" icon={wo.status === 'En route' ? I.MapPinCheck : I.Navigation} onClick={() => adv(wo.status === 'En route' ? 'On site' : 'En route')}>{wo.status === 'En route' ? "I've arrived" : 'Start travel'}</Btn></div>}
          <div className="h-14 border-t border-line bg-panel grid grid-cols-5 shrink-0">{PHONE_TABS.map(([k, l, Ic]) => <button key={k} onClick={() => setTab(k)} className={cx('flex flex-col items-center justify-center gap-0.5 text-[10.5px]', tab === k ? 'text-brand font-bold' : 'text-ink3')}><Ic size={17} />{l}</button>)}</div>
        </div>
      </div>
    </div>
  );
}

// ---------- the technician view on Field Dispatch ----------
function FieldPhone({ wo }) { const { s, act } = useApp(); const now = useNow(); return <PhoneApp wo={wo} s={s} now={now} act={act} role={s.role} go={act.drill} />; }

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
      <FieldPhone key={sel.id} wo={sel} />
      <div className="space-y-3 min-w-0">
        <RouteCard wo={sel} />
        <StoreLayoutCard wo={sel} />
      </div>
    </div>
  </>);
}
