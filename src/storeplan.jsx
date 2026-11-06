// Store floor plans. Every branch gets a plan drawn from what it is: the kind of business (roofing and exteriors,
// pool, landscape, building products), its size (small, standard, high-volume), whether it has a yard, and two
// per-branch variations (the building is mirrored on odd branch numbers; the IT closet moves). The devices from the
// inventory are placed in the zone each one serves, with the fault, the demarc and the way in from the contractor door.
import React from 'react';
import * as D from './data.js';

const KIND = { 'Roofing & exteriors': 'roof', Pool: 'pool', Landscape: 'land', 'Building products': 'build', HVAC: 'build' };
const KIND_LABEL = { roof: 'Roofing and exteriors', pool: 'Pool supply', land: 'Landscape supply', build: 'Building products' };
const SIZE_LABEL = { S: 'small branch', M: 'standard branch', L: 'high-volume branch' };

export function planOf(b) {
  const kind = KIND[b.segment] || 'roof', size = b.size, yard = b.yard, flip = b.num % 2 === 1, v = b.num % 3;
  const BW = { S: 300, M: 390, L: 450 }[size];
  const YW = !yard ? 0 : kind === 'land' ? { S: 220, M: 250, L: 280 }[size] : kind === 'pool' ? 120 : { S: 150, M: 180, L: 210 }[size];
  const W = 8 + BW + (yard ? 12 + YW : 0) + 8, H = 340;
  const ix = 16, iy = 16, iw = BW - 16, ih = 298;
  const z = {}, deco = [];
  let doors = [], contractor, customer;
  if (kind === 'pool') {
    const cw = Math.round(iw * 0.38);
    z.office = [ix, iy, cw, 86, 'Back office'];
    z.closet = [ix + (v === 2 ? cw - Math.round(cw * 0.6) : 0), iy + 94, Math.round(cw * 0.6), 62, 'IT closet'];
    z.warehouse = [ix + cw + 10, iy, iw - cw - 10, 156, 'Warehouse'];
    z.chem = [ix + iw - 84, iy + 98, 78, 52, 'Chemical store'];
    z.counter = [ix, iy + 166, iw, ih - 166, 'Showroom and counter'];
    const sx = ix + Math.round(iw * 0.42);
    for (let k = 0; k < 4; k++) deco.push({ t: 'rect', x: sx, y: iy + 190 + k * 24, w: iw - (sx - ix) - 14, h: 7, c: 'shelf' });
    deco.push({ t: 'box', x: ix + 10, y: iy + 186, w: 64, h: 22, label: 'Water test' });
    doors = [[z.warehouse[0] + 24, 8, 40]];
    contractor = { x: z.warehouse[0] + z.warehouse[2] - 20, y: 8, label: 'Receiving', top: true };
    customer = { x: ix + iw / 2, y: 322 };
  } else {
    const cw = Math.round(iw * (kind === 'land' ? 0.48 : size === 'S' ? 0.46 : 0.4));
    const wh = Math.round(ih * (kind === 'land' ? 0.6 : 0.64));
    z.office = [ix, iy, cw, 92, 'Back office'];
    z.closet = [ix + (v === 2 ? cw - Math.round(cw * 0.52) : 0), iy + 100, Math.round(cw * 0.52), 66, 'IT closet'];
    z.counter = [ix, iy + 176, cw, ih - 176, 'Sales counter'];
    z.warehouse = [ix + cw + 10, iy, iw - cw - 10, wh, kind === 'build' ? 'Warehouse and millwork' : kind === 'land' ? 'Irrigation and parts' : 'Warehouse'];
    z.docks = [ix + cw + 10, iy + wh + 8, iw - cw - 10, ih - wh - 8, 'Loading docks'];
    const [wx, wy, ww, whh] = z.warehouse, racks = Math.max(2, Math.floor((ww - 20) / 46));
    for (let k = 0; k < racks; k++) deco.push({ t: 'rect', x: wx + 18 + k * ((ww - 30) / racks), y: wy + 26, w: 11, h: whh - (size === 'L' ? 96 : 40), c: 'rack' });
    if (kind === 'build') deco.push({ t: 'box', x: size === 'L' ? wx + 10 : wx + ww - 92, y: wy + whh - 40, w: 84, h: 30, label: 'Millwork shop' });
    const nd = { S: 1, M: 2, L: 4 }[size] + (kind === 'land' ? 0 : 0);
    const [dx, , dw] = z.docks;
    doors = Array.from({ length: nd }, (_, k) => [dx + 14 + k * ((dw - 28) / nd), 318, Math.min(40, (dw - 28) / nd - 10)]);
    contractor = { x: dx + dw - 16, y: 322, label: 'Contractor door' };
    customer = { x: ix + cw / 2, y: 322 };
  }
  if (size === 'L') { const [x, y, w, h] = z.warehouse; z.idf = kind === 'pool' ? [x + 8, y + h - 54, 62, 46, 'IDF'] : [x + w - 70, y + h - 52, 62, 44, 'IDF']; }
  // the yard
  let yz = null;
  if (yard) {
    const yx = 8 + BW + 12;
    yz = [yx, 8, YW, 314];
    if (kind === 'land') {
      ['Mulch', 'Stone', 'Soil', 'Sand', 'Gravel', 'Pavers'].forEach((m, k) => deco.push({ t: 'bin', x: yx + 14 + (k % 3) * ((YW - 28) / 3), y: 40 + Math.floor(k / 3) * 58, w: (YW - 28) / 3 - 8, h: 46, label: m }));
      for (let k = 0; k < 14; k++) deco.push({ t: 'plant', x: yx + 22 + (k % 7) * ((YW - 40) / 6), y: 190 + Math.floor(k / 7) * 26 });
      deco.push({ t: 'label', x: yx + 14, y: 178, text: 'Nursery' });
    } else if (kind === 'pool') {
      deco.push({ t: 'box', x: yx + 14, y: 60, w: YW - 28, h: 70, label: 'Equipment pad' });
    } else if (kind === 'build') {
      deco.push({ t: 'shed', x: yx + 14, y: 40, w: YW - 28, h: 150, label: 'Lumber shed (covered)' });
    } else {
      const rows = { S: 3, M: 4, L: 5 }[size];
      for (let k = 0; k < rows; k++) deco.push({ t: 'rect', x: yx + 16, y: 150 + k * 30, w: YW - 70, h: 12, c: 'rack' });
      deco.push({ t: 'label', x: yx + 16, y: 142, text: 'Shingle and lumber racks' });
      deco.push({ t: 'lane', x: yx + YW - 30, y1: 40, y2: 310 });
      deco.push({ t: 'box', x: yx + 14, y: 40, w: Math.min(90, YW - 60), h: 26, label: 'Forklift charging' });
    }
  }
  // flip the whole plan on odd branch numbers (text stays readable)
  const FX = (x, w = 0) => flip ? W - x - w : x;
  const R = r => r && [FX(r[0], r[2]), r[1], r[2], r[3], r[4]];
  Object.keys(z).forEach(k => { z[k] = R(z[k]); });
  if (yz) yz = R(yz);
  deco.forEach(d => { if ('w' in d) d.x = FX(d.x, d.w); else { d.x = FX(d.x); if (flip && d.t === 'label') d.anchor = 'end'; } });
  doors = doors.map(([x, y, w]) => [FX(x, w), y, w]);
  contractor = { ...contractor, x: FX(contractor.x) }; customer = { ...customer, x: FX(customer.x) };
  const features = [kind === 'pool' ? 'showroom with aisles, water-test station and a chemical store' : kind === 'land' ? 'bulk material bins and a nursery in the yard' : kind === 'build' ? 'warehouse with a millwork shop and a covered lumber shed' : 'racked warehouse, truck lane and shingle racks in the yard',
    `${doors.length} dock door${doors.length === 1 ? '' : 's'}`, size === 'L' ? 'a second network closet (IDF) in the warehouse' : null].filter(Boolean);
  return { kind, size, W, H, BW, z, yz, deco, doors, contractor, customer, flip, pos: { S: 2, M: 3, L: 4 }[size],
    desc: `${KIND_LABEL[kind]}, ${SIZE_LABEL[size]}${yard ? ', with a yard' : ', no yard'}`, features };
}

// where each device sits on the plan
export function placeDevices(b, plan) {
  const devs = D.devicesOf(b.id), out = [];
  const rack = devs.filter(d => d.type !== 'AP');
  const mdf = plan.z.idf ? rack.filter((d, i) => d.type === 'SD-WAN' || i < 2) : rack, idf = plan.z.idf ? rack.filter(d => !mdf.includes(d)) : [];
  const stack = (list, zr) => list.slice(0, 6).forEach((d, i) => out.push({ d, x: zr[0] + 18 + (i % 2) * 32, y: zr[1] + 26 + Math.floor(i / 2) * 13, kind: d.type === 'SD-WAN' ? 'ec' : 'sw' }));
  stack(mdf, plan.z.closet); if (idf.length) stack(idf, plan.z.idf);
  const ZONE = { 'Back office': 'office', Counter: 'counter', Warehouse: 'warehouse', 'Loading docks': plan.z.docks ? 'docks' : 'warehouse' };
  const by = {};
  devs.filter(d => d.type === 'AP').forEach(d => { const k = d.role === 'Outdoor yard' ? (plan.yz ? 'yard' : 'warehouse') : ZONE[d.role] || 'warehouse'; (by[k] = by[k] || []).push(d); });
  Object.entries(by).forEach(([k, list]) => {
    const zr = k === 'yard' ? [plan.yz[0], 30, plan.yz[2], 120] : plan.z[k];
    const n = list.length, cols = Math.min(n, k === 'warehouse' || k === 'yard' ? 3 : 2), rows = Math.ceil(n / cols);
    list.forEach((d, i) => out.push({ d, kind: 'ap', pole: k === 'yard', x: zr[0] + (zr[2] / (cols + 1)) * ((i % cols) + 1), y: zr[1] + 20 + ((zr[3] - 24) / (rows + 1)) * (Math.floor(i / cols) + 1) }));
  });
  return { items: out, more: Math.max(0, mdf.length - 6) + Math.max(0, idf.length - 6) };
}

export function StoreLayout({ b, inc, demarc, compact, onDevice }) {
  const P = planOf(b), { items, more } = placeDevices(b, P);
  const fault = inc && inc.ci;
  const dm = /receiving/i.test(demarc || '') ? { x: P.contractor.x + (P.flip ? 26 : -26), y: P.contractor.top ? 52 : 290 } : /Back office/.test(demarc || '') ? { x: P.z.office[0] + P.z.office[2] - 22, y: P.z.office[1] + P.z.office[3] - 30 } : { x: P.z.closet[0] + P.z.closet[2] - 12, y: P.z.closet[1] + P.z.closet[3] - 26 };
  const tgt = items.find(it => it.d.id === fault) || (inc && /circuit|jitter|pos/.test(inc.kind) ? dm : { x: P.z.closet[0] + P.z.closet[2] / 2, y: P.z.closet[1] + P.z.closet[3] / 2 });
  const c0 = P.contractor, sy = c0.top ? 24 : 306;
  const path = `M ${c0.x} ${c0.top ? 4 : 334} L ${c0.x} ${sy} L ${c0.x} ${tgt.y} L ${tgt.x} ${tgt.y}`;
  const fs = compact ? 12.5 : 10;
  const zoneCls = k => k === 'closet' || k === 'idf' ? 'fill-info/10 stroke-info' : k === 'chem' ? 'fill-warn/10 stroke-warn' : 'fill-chip stroke-line';
  return (
    <svg viewBox={`0 0 ${P.W} ${P.H + 14}`} className="w-full" style={compact ? undefined : { maxHeight: 360 }}>
      <defs><marker id={`arr-${b.id}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#2F6DB5" /></marker>
        <pattern id={`hatch-${b.id}`} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="#A3ACB8" strokeWidth="2" /></pattern></defs>
      <rect x={P.flip ? P.W - 8 - P.BW : 8} y={8} width={P.BW} height={314} rx={4} className="fill-panel stroke-ink3" strokeWidth={2} />
      {Object.entries(P.z).filter(([k, r]) => r && k !== 'idf' && k !== 'chem').map(([k, [x, y, w, h, n]]) => { const right = P.contractor.top && P.flip && k === 'warehouse'; return <g key={k}><rect x={x} y={y} width={w} height={h} rx={3} className={zoneCls(k)} strokeWidth={1.2} /><text x={right ? x + w - 6 : x + 6} y={y + 13} textAnchor={right ? 'end' : 'start'} fontSize={fs} fontWeight={700} className="fill-ink2">{n}</text></g>; })}
      {P.yz && <g><rect x={P.yz[0]} y={P.yz[1]} width={P.yz[2]} height={P.yz[3]} rx={4} fill="none" className="stroke-ink3" strokeDasharray="6 4" strokeWidth={1.5} /><text x={P.yz[0] + 8} y={24} fontSize={fs} fontWeight={700} className="fill-ink2">Outdoor yard</text>
        <g transform={`translate(${P.yz[0] + P.yz[2] / 2},322)`}><rect x={-20} y={-3} width={40} height={6} className="fill-ink3" /><text y={14} textAnchor="middle" fontSize={fs - 1} className="fill-ink3">Yard gate</text></g></g>}
      {P.deco.map((d, k) => d.t === 'rect' ? <rect key={k} x={d.x} y={d.y} width={d.w} height={d.h} rx={1.5} className="fill-line" opacity={0.75} />
        : d.t === 'box' ? <g key={k}><rect x={d.x} y={d.y} width={d.w} height={d.h} rx={3} className="fill-panel stroke-line" strokeDasharray="3 2" /><text x={d.x + d.w / 2} y={d.y + d.h / 2 + 3} textAnchor="middle" fontSize={fs - 2} className="fill-ink3">{d.label}</text></g>
        : d.t === 'bin' ? <g key={k}><rect x={d.x} y={d.y} width={d.w} height={d.h} rx={2} fill="#C9A36B" opacity={0.35} className="stroke-ink3" strokeWidth={0.8} /><text x={d.x + d.w / 2} y={d.y + d.h / 2 + 3} textAnchor="middle" fontSize={fs - 1.5} className="fill-ink2">{d.label}</text></g>
        : d.t === 'plant' ? <circle key={k} cx={d.x} cy={d.y} r={6} fill="#2E8540" opacity={0.45} />
        : d.t === 'shed' ? <g key={k}><rect x={d.x} y={d.y} width={d.w} height={d.h} rx={2} fill={`url(#hatch-${b.id})`} className="stroke-ink3" opacity={0.8} /><text x={d.x + 6} y={d.y + d.h + 12} fontSize={fs - 1.5} className="fill-ink3">{d.label}</text></g>
        : d.t === 'lane' ? <g key={k}><line x1={d.x} y1={d.y1} x2={d.x} y2={d.y2} className="stroke-ink3" strokeWidth={1.2} strokeDasharray="8 6" /><text x={d.x} y={d.y1 - 4} textAnchor="middle" fontSize={fs - 2} className="fill-ink3">Truck lane</text></g>
        : <text key={k} x={d.x} y={d.y} textAnchor={d.anchor || 'start'} fontSize={fs - 1.5} className="fill-ink3">{d.text}</text>)}
      {Object.entries(P.z).filter(([k, r]) => r && (k === 'idf' || k === 'chem')).map(([k, [x, y, w, h, n]]) => <g key={k}><rect x={x} y={y} width={w} height={h} rx={3} className={zoneCls(k)} strokeWidth={1.2} /><text x={x + 6} y={y + 13} fontSize={fs} fontWeight={700} className={k === 'chem' ? 'fill-warn' : 'fill-info'}>{n}</text></g>)}
      {P.doors.map(([x, y, w], k) => <rect key={k} x={x} y={y - 4} width={w} height={8} className="fill-ink3" />)}
      {Array.from({ length: P.pos }, (_, i) => { const [x, y, w, h] = P.z.counter; return <g key={i} transform={`translate(${x + 22 + i * Math.min(46, (Math.min(w, 220) - 40) / Math.max(1, P.pos - 1))},${y + h - 20})`}><rect x={-9} y={-7} width={18} height={14} rx={2} fill="#2A9D8F" /><text y={3} textAnchor="middle" fontSize={6.5} fill="#fff" fontWeight={700}>POS</text></g>; })}
      <g transform={`translate(${P.customer.x},322)`}><rect x={-22} y={-4} width={44} height={8} fill="#2E8540" /><text y={16} textAnchor="middle" fontSize={fs} className="fill-ink2">Customer entrance</text></g>
      <g transform={`translate(${P.contractor.x},${P.contractor.top ? 8 : 322})`}><rect x={-14} y={-4} width={28} height={8} fill="#2F6DB5" /><text x={P.contractor.top ? (P.flip ? 18 : -18) : 0} y={P.contractor.top ? 18 : 16} textAnchor={P.contractor.top ? (P.flip ? 'start' : 'end') : 'middle'} fontSize={fs} className="fill-info" fontWeight={700}>{P.contractor.label}</text></g>
      <g transform={`translate(${dm.x},${dm.y})`}><rect x={-7} y={-7} width={14} height={14} rx={2} fill="#E07B00" /><text y={18} textAnchor="middle" fontSize={fs - 1.5} className="fill-warn" fontWeight={700}>Demarc</text></g>
      <path d={path} fill="none" stroke="#2F6DB5" strokeWidth={2.2} strokeDasharray="5 4" markerEnd={`url(#arr-${b.id})`} />
      {items.map(it => { const bad = it.d.id === fault, col = it.kind === 'ec' ? '#762123' : it.kind === 'sw' ? '#1D3F66' : '#2F6DB5'; return (
        <g key={it.d.id} transform={`translate(${it.x},${it.y})`} onClick={onDevice ? () => onDevice(it.d) : undefined} className={onDevice ? 'cursor-pointer' : undefined}>
          <title>{`${it.d.id} · ${it.d.model}${it.d.role ? ` · ${it.d.role}` : ''}`}</title>
          {bad && <circle r={14} fill="#D62D20" opacity={0.25}><animate attributeName="r" values="9;17;9" dur="1.6s" repeatCount="indefinite" /></circle>}
          {it.pole && <line x1={0} y1={6} x2={0} y2={28} className="stroke-ink3" strokeWidth={2} />}
          {it.kind === 'ap' ? <circle r={6.5} fill={bad ? '#D62D20' : col} stroke="#fff" strokeWidth={1.5} /> : <rect x={-14} y={-5} width={28} height={10} rx={2} fill={bad ? '#D62D20' : col} />}
          {it.kind === 'ap' ? <path d="M-3,-1 a4,4 0 0 1 6,0 M-1.4,1 a2,2 0 0 1 2.8,0" fill="none" stroke="#fff" strokeWidth={1.1} /> : <text y={3} textAnchor="middle" fontSize={6.5} fill="#fff" fontWeight={700}>{it.kind === 'ec' ? 'SD-WAN' : it.d.model}</text>}
          {(!compact || bad) && it.kind === 'ap' && <text y={-10} textAnchor="middle" fontSize={fs - 2} className={bad ? 'fill-bad' : 'fill-ink3'} fontWeight={bad ? 700 : 400}>{it.d.id.split('-').pop()}</text>}
        </g>); })}
      {more > 0 && <text x={P.z.closet[0] + 6} y={P.z.closet[1] + P.z.closet[3] - 5} fontSize={fs - 2} className="fill-ink3">+{more} more</text>}
    </svg>
  );
}
