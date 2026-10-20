import React, { useState, useMemo } from 'react';
import * as I from 'lucide-react';
import { LivePanel } from './liveui.jsx';
import { useLive } from './live.jsx';
import * as D from './data.js';
import { useApp, healthOf, circuitOf, filteredBranches } from './store.jsx';
import { Card, Badge, Btn, Dot, PageHead, Select, cx, KV, Logo, Illus, Tabs } from './ui.jsx';
import { C, useWidth } from './charts.jsx';

// Topology: branches (left) → carrier networks → hosting (DC / cloud) → business applications (right).
// Each branch shows its LAN, EdgeConnect and both WAN ports; links carry live status and moving traffic.
const HOSTS = [
  { id: 'dc:primary', label: 'Primary data centre', sub: 'ERP, pricing', apps: ['erp', 'pricing'], kind: 'dc' },
  { id: 'dc:azure', label: 'Azure (SRS tenant)', sub: 'Cloud applications, Mova iO', apps: ['azure'], kind: 'cloud' },
  { id: 'dc:pci', label: 'Payment processor', sub: 'PCI segment only', apps: ['pos'], kind: 'dc' },
  { id: 'dc:saas', label: 'SaaS breakout', sub: 'Microsoft 365, voice', apps: ['m365', 'voice'], kind: 'cloud' },
];
const ST = st => st === 'down' ? C.bad : st === 'degraded' ? C.warn : C.ok;
const cirSt = c => c.status === 'Up' ? 'up' : c.status === 'Degraded' ? 'degraded' : 'down';

function CloudShape({ w, h, fill, stroke, sw = 1.2 }) {
  // carrier network drawn as a simple cloud outline
  const r = h / 2;
  return <path d={`M${r},${h} a${r * 0.9},${r * 0.9} 0 0 1 0,-${r * 1.6} a${r},${r} 0 0 1 ${w * 0.32},-${r * 0.25} a${r * 1.05},${r * 1.05} 0 0 1 ${w * 0.4},${r * 0.1} a${r * 0.85},${r * 0.85} 0 0 1 ${w - r - w * 0.72},${r * 1.75} z`} fill={fill} stroke={stroke} strokeWidth={sw} />;
}

export function NetGraph() {
  const { s, act } = useApp();
  const { L } = useLive();
  const scopeList = filteredBranches(s);
  const cities = useMemo(() => { const m = {}; scopeList.forEach(b => { const k = `${b.city}, ${b.state}`; m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ value: k, label: `${k} (${n})` })); }, [scopeList]);
  const gb = s.graphBranch && D.BR[s.graphBranch];
  const [city, setCity] = useState(gb ? `${gb.city}, ${gb.state}` : (cities.find(c => c.value.startsWith('Houston')) || cities[0] || { value: '' }).value);
  const [sel, setSel] = useState(gb ? `b:${gb.id}` : null);
  const [mode, setMode] = useState('status');
  const [hover, setHover] = useState(null);
  const branches = useMemo(() => scopeList.filter(b => `${b.city}, ${b.state}` === city).slice(0, 14).sort((x, y) => circuitOf(s, x.wan[0]).carrier.localeCompare(circuitOf(s, y.wan[0]).carrier) || circuitOf(s, x.wan[1]).carrier.localeCompare(circuitOf(s, y.wan[1]).carrier) || x.num - y.num), [scopeList, city, s.circuitState]);

  const carriers = useMemo(() => [...new Set(branches.flatMap(b => b.wan.map(id => circuitOf(s, id).carrier)))].sort(), [branches, s.circuitState]);
  const risk = (kind, ref) => {
    if (kind === 'cir') return Math.min(1, ref.tickets90 / 6 + (s.predictions.some(p => p.target === ref.id) ? 0.45 : 0) + (ref.status !== 'Up' ? 0.3 : 0));
    if (kind === 'car') { const sc = D.SCORECARD.find(x => x.carrier === ref); return sc ? Math.min(1, (0.97 - sc.slaMet) * 6) : 0.1; }
    if (kind === 'ec') return ref.dev.ec === 2 ? 0.05 : 0.25;
    if (kind === 'branch') { const cs = ref.wan.map(id => circuitOf(s, id)); return Math.min(1, cs.reduce((a, c) => a + c.tickets90, 0) / 8 + (cs[0].carrier === cs[1].carrier ? 0.4 : 0)); }
    return 0.05;
  };
  const riskColor = v => v >= 0.6 ? C.bad : v >= 0.3 ? C.warn : C.grey;

  // blast radius / dependency highlight
  const blast = useMemo(() => {
    if (!sel) return null;
    const [kind, id] = [sel.split(':')[0], sel.slice(sel.indexOf(':') + 1)];
    const out = { kind, down: [], backup: [], lan: [], apps: new Set(), hl: new Set([sel]), title: '', sub: '', text: '' };
    const path = (b, cirIds) => { out.hl.add(`b:${b.id}`); cirIds.forEach(c => { out.hl.add(`c:${c}`); out.hl.add(`k:${circuitOf(s, c).carrier}`); }); };
    if (kind === 'k') {
      branches.forEach(b => { const on = b.wan.filter(x => circuitOf(s, x).carrier === id); if (!on.length) return; if (on.length === 2) { out.down.push(b); D.APPS.forEach(a => out.apps.add(a.id)); } else out.backup.push(b); path(b, on); });
      out.title = id; out.sub = `${D.CIRCUITS.filter(c => c.carrier === id).length} circuits in total`;
      out.text = `If ${id} fails in ${city}, branches with both lines on ${id} go down. The others fail over to their second carrier.`;
    } else if (kind === 'c') {
      const c = circuitOf(s, id); const b = D.BR[c.branchId]; const other = circuitOf(s, b.wan.find(x => x !== id));
      if (other.status === 'Down') { out.down.push(b); D.APPS.forEach(a => out.apps.add(a.id)); } else out.backup.push(b);
      path(b, [id]); out.title = `${b.name} ${c.role === 'Primary' ? 'wan1' : 'wan2'}`; out.sub = `${c.carrier} ${c.type} ${c.bw} Mb/s · ${c.cid}`;
      out.text = `Losing this line moves ${b.name} onto ${other.carrier} ${other.type}${other.type === 'LTE/5G' ? ' (ERP slower on LTE, POS fine)' : ''}.`;
    } else if (kind === 'e') {
      const b = D.BR[id]; path(b, b.wan); out.title = `${b.code}-ec01`; out.sub = b.dev.ec === 2 ? 'EC-XS HA pair' : 'EC-XS (single)';
      if (b.dev.ec === 2) { out.backup.push(b); out.text = 'HA pair: the second EdgeConnect takes over. No outage.'; } else { out.down.push(b); D.APPS.forEach(a => out.apps.add(a.id)); out.text = 'Single EdgeConnect: the branch loses its WAN until the unit is swapped (spare pre-staged, zero-touch).'; }
    } else if (kind === 'l') {
      const b = D.BR[id]; out.lan.push(b); out.hl.add(`b:${b.id}`); ['pos', 'voice'].forEach(a => out.apps.add(a)); out.title = `${b.name} LAN`; out.sub = `${b.dev.sw} switches, ${b.dev.ap} access points`;
      out.text = 'LAN fault: the WAN stays up, but POS terminals, handhelds and phones on the affected switch or access point lose service.';
    } else if (kind === 'b') {
      const b = D.BR[id]; path(b, b.wan); D.APPS.forEach(a => out.hl.add(`a:${a.id}`)); HOSTS.forEach(h => out.hl.add(h.id)); out.title = b.name; out.sub = `${b.brand} · ${b.code}`;
      out.text = 'Full dependency path for this branch: LAN, EdgeConnect, both lines, carriers, hosting and applications.';
    } else if (kind === 'dc') {
      const h = HOSTS.find(x => x.id === sel); h.apps.forEach(a => out.apps.add(a)); branches.forEach(b => out.hl.add(`b:${b.id}`)); carriers.forEach(k => out.hl.add(`k:${k}`));
      out.title = h.label; out.sub = h.sub; out.text = `If ${h.label} is down, every branch loses ${h.apps.map(a => D.APPS.find(x => x.id === a).short).join(' and ')}. Network paths stay up.`;
    } else if (kind === 'a') {
      const a = D.APPS.find(x => x.id === id); const h = HOSTS.find(x => x.apps.includes(id)); out.hl.add(h.id); out.apps.add(id); carriers.forEach(k => out.hl.add(`k:${k}`)); branches.forEach(b => out.hl.add(`b:${b.id}`));
      out.title = a.name; out.sub = `${a.crit} criticality`; out.text = `${a.name} is reached through ${h.label}. ${branches.length} branches in view depend on it.`;
    }
    out.apps.forEach(a => out.hl.add(`a:${a}`));
    return out;
  }, [sel, branches, carriers, s.circuitState]);

  // layout: branches sorted by primary carrier so lines stay in bundles; carriers sit beside the branches that use them
  const [wref, cw] = useWidth(1000);
  const W = Math.max(940, cw), rowH = 62, top = 52;
  const bx = 14, bw = 292, appW = 132, appX = W - appW - 14;
  const span = appX - (bx + bw);
  const carX = Math.round(bx + bw + span * 0.36), hostX = Math.round(bx + bw + span * 0.74);
  const H = Math.max(480, top + branches.length * rowH + 16);
  const lineY = (i, k) => top + i * rowH + 17 + k * 18;
  const cy = {}; {
    const want = carriers.map(k => { let sw = 0, sy = 0; branches.forEach((b, i) => b.wan.forEach((id, j) => { if (circuitOf(s, id).carrier === k) { const w = j ? 1 : 3; sw += w; sy += w * lineY(i, j); } })); return [k, sw ? sy / sw : H / 2]; }).sort((x, y) => x[1] - y[1]);
    let prev = top - 10; want.forEach(([k, y]) => { const yy = Math.max(y, prev + 64); cy[k] = yy; prev = yy; });
    const over = prev + 30 - H; if (over > 0) carriers.forEach(k => { cy[k] -= over; });
  }
  const hy = {}; HOSTS.forEach((h, i) => { hy[h.id] = top + 40 + (i + 0.5) * ((H - top - 70) / HOSTS.length); });
  const ay = {}; D.APPS.forEach((a, i) => { ay[a.id] = top + 24 + (i + 0.5) * ((H - top - 40) / D.APPS.length); });
  const on = id => !blast || blast.hl.has(id);
  const curve = (x1, y1, x2, y2) => `M${x1},${y1} C${x1 + (x2 - x1) * 0.55},${y1} ${x1 + (x2 - x1) * 0.45},${y2} ${x2},${y2}`;
  const impact = b => blast ? (blast.down.includes(b) ? 'down' : blast.backup.includes(b) ? 'backup' : blast.lan.includes(b) ? 'lan' : null) : null;
  const pick = id => setSel(sel === id ? null : id);
  const NEUT = 'rgb(var(--ink3))';
  const carState = k => { const cs = branches.flatMap(b => b.wan.map(id => circuitOf(s, id))).filter(c => c.carrier === k); return cs.some(c => c.status === 'Down') ? 'down' : cs.some(c => c.status === 'Degraded') ? 'degraded' : 'up'; };
  const cut = (t, n) => t.length > n ? t.slice(0, n - 1) + '…' : t;
  const upLinks = branches.reduce((a, b) => a + b.wan.filter(id => circuitOf(s, id).status === 'Up').length, 0);
  const onBackup = branches.filter(b => circuitOf(s, b.wan[0]).status !== 'Up').length;

  return (
    <div>
      <PageHead icon={I.Network} title="Network Graph" sub="How each branch reaches the business: LAN and EdgeConnect, both WAN lines, the carrier networks, hosting and applications. Built from OpsRamp, Orchestrator and the ServiceNow CMDB. Click anything to see what depends on it."
        right={<><Tabs size="sm" value={mode} onChange={setMode} tabs={[{ id: 'status', label: 'Live status' }, { id: 'risk', label: '30-day failure risk' }]} /><Select icon={I.MapPin} label="Metro" value={city} onChange={v => { setCity(v); setSel(null); }} options={cities} /></>} />
      <div className="kpi-strip grid grid-cols-2 lg:grid-cols-5 mb-3">
        {[['Branches in view', branches.length, `${city}`], ['WAN lines up', `${upLinks} / ${branches.length * 2}`, 'both paths per branch'], ['On backup line', onBackup, onBackup ? 'primary line down or degraded' : 'all on primary'], ['Carriers', carriers.length, carriers.join(', ')], ['HA EdgeConnect', branches.filter(b => b.dev.ec === 2).length, 'branches with a second unit']].map(([l, v, sub]) => (
          <div key={l} className="px-4 py-3 min-w-0"><div className="text-[12px] text-ink3 font-semibold">{l}</div><div className="text-[24px] font-bold text-ink leading-tight tabular-nums">{v}</div><div className="text-[11.5px] text-ink3 truncate">{sub}</div></div>))}
      </div>
      <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_320px] gap-3 items-start">
        <Card pad={false}>
          <div ref={wref} className="overflow-x-auto">
            <svg width={W} height={H} className="block select-none">
              <defs><marker id="arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="rgb(var(--ink3))" /></marker></defs>
              {[[bx + 2, 'Branch, LAN and EdgeConnect', 'start'], [carX, 'Carrier', 'middle'], [hostX, 'Hosting', 'middle'], [appX + appW / 2, 'Application', 'middle']].map(([x, t, an]) => <text key={t} x={x} y={26} textAnchor={an} fontSize="11" fontWeight="700" fill="rgb(var(--ink3))" letterSpacing=".06em">{t.toUpperCase()}</text>)}
              <line x1={8} x2={W - 8} y1={36} y2={36} stroke="rgb(var(--line))" />

              {/* carrier → hosting, hosting → application */}
              {carriers.map(k => HOSTS.map(h => { const lit = blast && on(`k:${k}`) && on(h.id); return <path key={k + h.id} d={curve(carX + 70, cy[k], hostX - 90, hy[h.id])} fill="none" stroke={lit ? C.brand : NEUT} strokeWidth={lit ? 1.6 : 0.9} opacity={blast ? (lit ? 0.9 : 0.12) : 0.28} />; }))}
              {HOSTS.map(h => h.apps.map(a => { const lit = blast && on(h.id) && on(`a:${a}`); return <path key={h.id + a} d={curve(hostX + 90, hy[h.id], appX - 2, ay[a])} fill="none" stroke={lit ? C.brand : NEUT} strokeWidth={lit ? 1.6 : 1} opacity={blast ? (lit ? 0.9 : 0.15) : 0.5} markerEnd="url(#arr)" />; }))}

              {/* WAN lines: branch → carrier */}
              {branches.map((b, i) => b.wan.map((id, k) => {
                const c = circuitOf(s, id); const st = cirSt(c); const y1 = lineY(i, k), x1 = bx + bw; const y2 = cy[c.carrier] + (k ? 6 : -6), x2 = carX - 70;
                const d = curve(x1, y1, x2, y2); const dim = blast && !blast.hl.has(`c:${id}`);
                const col = mode === 'risk' ? riskColor(risk('cir', c)) : st === 'down' ? C.bad : st === 'degraded' ? C.warn : NEUT;
                const strong = mode === 'risk' ? risk('cir', c) >= 0.3 : st !== 'up';
                return (
                  <g key={id} opacity={dim ? 0.1 : 1} onMouseEnter={() => setHover({ id, c, b })} onMouseLeave={() => setHover(null)} onClick={() => pick(`c:${id}`)} className="cursor-pointer">
                    <path d={d} fill="none" stroke="transparent" strokeWidth="10" />
                    <path d={d} fill="none" stroke={col} strokeWidth={strong ? 2 : k === 0 ? 1.3 : 1.1} strokeDasharray={st === 'down' ? '2 4' : k === 1 ? '5 4' : undefined} opacity={strong ? 1 : k === 0 ? 0.55 : 0.4} />
                    {mode === 'status' && st !== 'down' && k === 0 && !dim && <circle r="2.2" fill={st === 'degraded' ? C.warn : C.s1} opacity=".85"><animateMotion dur={`${st === 'degraded' ? 5 : 3 + (i % 5) * 0.3}s`} begin={`${(i * 0.37) % 3}s`} repeatCount="indefinite" path={d} /></circle>}
                  </g>);
              }))}

              {/* branch rows */}
              {branches.map((b, i) => {
                const h = healthOf(s, b); const y = top + i * rowH + 4; const imp = impact(b); const dim = blast && !blast.hl.has(`b:${b.id}`) && !imp; const flash = !!L.flash[b.id];
                const bc = imp === 'down' ? C.bad : imp ? C.warn : sel === `b:${b.id}` ? 'rgb(var(--ink))' : 'rgb(var(--line))';
                const ec = mode === 'risk' ? riskColor(risk('ec', b)) : ST(h === 'down' ? 'down' : 'up');
                const rh = rowH - 10;
                return (
                  <g key={b.id} transform={`translate(${bx},${y})`} opacity={dim ? 0.3 : 1}>
                    <rect width={bw} height={rh} rx="6" fill="rgb(var(--panel))" stroke={bc} strokeWidth={imp || sel === `b:${b.id}` ? 2 : 1} />
                    {flash && <rect width={bw} height={rh} rx="3" fill="none" stroke={C.s1} strokeWidth="2"><animate attributeName="opacity" values=".8;0" dur="1.8s" repeatCount="1" fill="freeze" /></rect>}
                    <circle cx="11" cy="16" r="3.5" fill={mode === 'risk' ? riskColor(risk('branch', b)) : ST(h)} />
                    <g onClick={() => pick(`b:${b.id}`)} className="cursor-pointer">
                      <text x="20" y="20" fontSize="12.5" fontWeight="700" fill="rgb(var(--ink))">{b.name}</text>
                      <text x="20" y="36" fontSize="10.5" fill="rgb(var(--ink3))">{cut(b.brand, 20)}</text>
                    </g>
                    <g transform="translate(146,8)" onClick={() => pick(`l:${b.id}`)} className="cursor-pointer">
                      <rect width="64" height="36" rx="2" fill="rgb(var(--chip))" stroke={sel === `l:${b.id}` ? 'rgb(var(--ink))' : 'none'} />
                      <text x="32" y="14" textAnchor="middle" fontSize="9" fill="rgb(var(--ink3))" fontWeight="700" letterSpacing=".05em">LAN</text>
                      <text x="32" y="28" textAnchor="middle" fontSize="10.5" fill="rgb(var(--ink))" fontWeight="600">{b.dev.sw} sw · {b.dev.ap} AP</text>
                    </g>
                    <g transform="translate(214,8)" onClick={() => pick(`e:${b.id}`)} className="cursor-pointer">
                      <rect width="50" height="36" rx="2" fill="rgb(var(--chip))" stroke={sel === `e:${b.id}` ? 'rgb(var(--ink))' : 'none'} />
                      <circle cx="8" cy="10" r="2.6" fill={ec} />
                      <text x="27" y="14" textAnchor="middle" fontSize="9" fill="rgb(var(--ink3))" fontWeight="700" letterSpacing=".05em">EDGE</text>
                      <text x="25" y="28" textAnchor="middle" fontSize="10.5" fill="rgb(var(--ink))" fontWeight="600">{b.dev.ec === 2 ? 'HA ×2' : 'EC-XS'}</text>
                    </g>
                    {b.wan.map((id, k) => { const c = circuitOf(s, id); const st = cirSt(c); return (
                      <g key={id} transform={`translate(${bw - 24},${lineY(i, k) - y - 7})`} onClick={() => pick(`c:${id}`)} className="cursor-pointer">
                        <rect width="22" height="14" rx="2" fill={mode === 'risk' ? riskColor(risk('cir', c)) : st === 'up' ? 'rgb(var(--ink2))' : ST(st)} />
                        <text x="11" y="10.5" textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#fff">{k ? 'W2' : 'W1'}</text>
                        <title>{`${k ? 'wan2' : 'wan1'}: ${c.carrier} ${c.type} ${c.bw} Mb/s, ${c.status}. ${c.lat} ms, jitter ${c.jit} ms, loss ${c.loss}%`}</title>
                      </g>); })}
                  </g>);
              })}

              {/* carriers */}
              {carriers.map(k => { const y = cy[k]; const dim = blast && !blast.hl.has(`k:${k}`); const sc = D.SCORECARD.find(x => x.carrier === k); const cs = carState(k);
                const n = branches.reduce((a, b) => a + b.wan.filter(id => circuitOf(s, id).carrier === k).length, 0); const acc = mode === 'risk' ? riskColor(risk('car', k)) : cs === 'up' ? 'rgb(var(--ink2))' : ST(cs);
                return (
                  <g key={k} transform={`translate(${carX - 70},${y - 24})`} opacity={dim ? 0.3 : 1} onClick={() => pick(`k:${k}`)} className="cursor-pointer">
                    <rect width="140" height="48" rx="6" fill="rgb(var(--panel))" stroke={sel === `k:${k}` ? 'rgb(var(--ink))' : 'rgb(var(--line))'} strokeWidth={sel === `k:${k}` ? 2 : 1} />
                    <circle cx="128" cy="15" r="3.5" fill={acc} />
                    <text x="12" y="20" fontSize="12.5" fontWeight="700" fill="rgb(var(--ink))">{k}</text>
                    <text x="12" y="36" fontSize="10" fill="rgb(var(--ink3))">{n} line{n === 1 ? '' : 's'}{sc ? ` · restore SLA ${Math.round(sc.slaMet * 100)}%` : ''}</text>
                  </g>); })}

              {/* hosting */}
              {HOSTS.map(h => { const y = hy[h.id]; const dim = blast && !blast.hl.has(h.id); return (
                <g key={h.id} transform={`translate(${hostX - 90},${y - 24})`} opacity={dim ? 0.3 : 1} onClick={() => pick(h.id)} className="cursor-pointer">
                  <rect width="180" height="48" rx="6" fill="rgb(var(--panel))" stroke={sel === h.id ? 'rgb(var(--ink))' : 'rgb(var(--line))'} strokeWidth={sel === h.id ? 2 : 1} />
                  {h.kind === 'dc' ? <g transform="translate(11,15)">{[0, 1, 2].map(r => <rect key={r} y={r * 6.5} width="15" height="4.5" rx="1" fill="rgb(var(--ink2))" />)}</g>
                    : <g transform="translate(9,16)"><path d="M4,14 a4,4 0 0 1 0,-8 a6,6 0 0 1 11,-2 a4.5,4.5 0 0 1 4,10 z" fill="none" stroke="rgb(var(--ink2))" strokeWidth="1.5" /></g>}
                  <text x="36" y="21" fontSize="11.5" fontWeight="700" fill="rgb(var(--ink))">{cut(h.label, 22)}</text>
                  <text x="36" y="36" fontSize="10" fill="rgb(var(--ink3))">{cut(h.sub, 26)}</text>
                </g>); })}

              {/* applications */}
              {D.APPS.map(a => { const y = ay[a.id]; const dim = blast && !blast.hl.has(`a:${a.id}`); const hit = blast && blast.apps.has(a.id); return (
                <g key={a.id} transform={`translate(${appX},${y - 13})`} opacity={dim ? 0.3 : 1} onClick={() => pick(`a:${a.id}`)} className="cursor-pointer">
                  <rect width={appW} height="26" rx="3" fill={hit ? C.bad : sel === `a:${a.id}` ? 'rgb(var(--ink))' : 'rgb(var(--panel))'} stroke={hit ? C.bad : 'rgb(var(--line))'} />
                  <text x="10" y="17" fontSize="11" fontWeight="700" fill={hit || sel === `a:${a.id}` ? '#fff' : 'rgb(var(--ink))'}>{cut(a.short, 18)}</text>
                </g>); })}
            </svg>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-4 py-2.5 border-t border-line text-[12px] text-ink2">
            {mode === 'status' ? <><span className="inline-flex items-center gap-1.5"><span className="w-6 h-0.5 bg-ink3" />Line up (moving dots show traffic)</span><span className="inline-flex items-center gap-1.5"><span className="w-6 h-0.5" style={{ background: C.warn }} />Degraded</span><span className="inline-flex items-center gap-1.5"><span className="w-6 border-t-2 border-dotted" style={{ borderColor: C.bad }} />Down</span><span className="inline-flex items-center gap-1.5"><span className="w-6 border-t-2 border-dashed border-ink3" />wan2 (backup)</span></>
              : <><span className="inline-flex items-center gap-1.5"><Dot tone="red" />High 30-day risk</span><span className="inline-flex items-center gap-1.5"><Dot tone="amber" />Elevated</span><span className="inline-flex items-center gap-1.5"><Dot tone="gray" />Normal</span><span className="text-ink3">Blends 90-day tickets, open predictions, carrier restore record and single points of failure.</span></>}
          </div>
        </Card>
        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-1 gap-3">
          <Card title={blast ? blast.title : 'What depends on it'} sub={blast ? blast.sub : 'Select a branch, line, carrier, host or application'} icon={I.Radar} right={blast && <Btn size="xs" kind="ghost" icon={I.X} onClick={() => setSel(null)} />}>
            {!blast ? <div className="text-[12.5px] text-ink2 space-y-2"><p>Click a carrier to see which branches would go down and which would fail over. Click a branch's LAN, EdgeConnect or W1 / W2 port to see what depends on it.</p><p className="text-ink3">Showing {branches.length} branches in {city}{scopeList.filter(b => `${b.city}, ${b.state}` === city).length > branches.length ? ' (first 14)' : ''}. Pick another metro above or use the filters.</p></div> : <>
              <p className="text-[12.5px] text-ink2 mb-2">{blast.text}</p>
              <KV k="Branches down" v={<span className={blast.down.length ? 'text-bad' : ''}>{blast.down.length}</span>} />
              <KV k="Branches on backup line" v={<span className={blast.backup.length ? 'text-warn' : ''}>{blast.backup.length}</span>} />
              <KV k="LAN-only impact" v={blast.lan.length} />
              <KV k="Applications affected" v={blast.apps.size} />
              {[...blast.down, ...blast.backup].length > 0 && <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">{[...blast.down.map(b => [b, 'down']), ...blast.backup.map(b => [b, 'backup'])].map(([b, t]) => <button key={b.id} onClick={() => act.openBranch(b.id)} className="w-full flex items-center gap-1.5 text-[12px] hover:bg-chip rounded px-1 py-0.5"><Dot tone={t === 'down' ? 'red' : 'amber'} /><span className="text-ink font-semibold">{b.name}</span><span className="text-ink3 truncate">{b.brand}</span><span className="ml-auto text-ink3">{t}</span></button>)}</div>}
              {blast.apps.size > 0 && <div className="flex flex-wrap gap-1 mt-2">{[...blast.apps].map(a => <Badge key={a} tone="red">{D.APPS.find(x => x.id === a).short}</Badge>)}</div>}
              {blast.kind === 'b' && <Btn size="sm" className="mt-3" icon={I.Store} onClick={() => act.openBranch(sel.slice(2))}>Open Branch 360</Btn>}
            </>}
          </Card>
          <Card title="Line detail" sub={hover ? `${hover.b.name}, ${hover.c.role === 'Primary' ? 'wan1' : 'wan2'}` : 'Hover a line in the graph'} icon={I.Cable}>
            {hover ? <><KV k="Carrier and type" v={`${hover.c.carrier} ${hover.c.type}`} /><KV k="Bandwidth" v={`${hover.c.bw} Mb/s`} /><KV k="Status" v={<span style={{ color: ST(cirSt(hover.c)) }}>{hover.c.status}</span>} /><KV k="Latency / jitter / loss" v={`${hover.c.lat} ms / ${hover.c.jit} ms / ${hover.c.loss}%`} /><KV k="Circuit ID" v={<code className="text-[11.5px]">{hover.c.cid}</code>} /><KV k="Tickets, 90 days" v={hover.c.tickets90} /></>
              : <div className="text-[12.5px] text-ink3">Carrier, bandwidth, live latency, jitter and loss for any WAN line.</div>}
          </Card>
        </div>
      </div>
      <LivePanel kind="graph" className="mt-3" />
    </div>
  );
}
