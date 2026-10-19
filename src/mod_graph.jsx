import React, { useState, useMemo } from 'react';
import * as I from 'lucide-react';
import * as D from './data.js';
import { useApp, useNow, healthOf, circuitOf, filteredBranches } from './store.jsx';
import { Card, Badge, Btn, Dot, PageHead, Select, cx, KV, Logo, Illus } from './ui.jsx';
import { C } from './charts.jsx';

const COLS = [
  { id: 'branch', label: 'Branches' },
  { id: 'lan', label: 'Switches & APs' },
  { id: 'ec', label: 'EdgeConnect' },
  { id: 'cir', label: 'Circuits' },
  { id: 'car', label: 'Carriers' },
  { id: 'dc', label: 'DC / cloud' },
  { id: 'app', label: 'Applications' },
];
const HOSTS = [
  { id: 'dc:primary', label: 'Primary DC', sub: 'illustrative', apps: ['erp', 'pricing'] },
  { id: 'dc:azure', label: 'Azure (SRS tenant)', sub: 'Mova iO, Roof Hub, dispatch', apps: ['roofhub', 'dispatch'] },
  { id: 'dc:pci', label: 'Payment processor', sub: 'PCI segment only', apps: ['pos'] },
  { id: 'dc:saas', label: 'SaaS (M365, voice)', sub: 'direct internet breakout', apps: ['m365', 'voice'] },
];

export function NetGraph() {
  const { s, act } = useApp();
  const now = useNow();
  const scopeList = filteredBranches(s);
  const cities = useMemo(() => { const m = {}; scopeList.forEach(b => { const k = `${b.city}, ${b.state}`; m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ value: k, label: `${k} (${n})` })); }, [scopeList]);
  const gb = s.graphBranch && D.BR[s.graphBranch];
  const [city, setCity] = useState(gb ? `${gb.city}, ${gb.state}` : (cities.find(c => c.value.startsWith('Houston')) || cities[0] || { value: '' }).value);
  const [sel, setSel] = useState(gb ? `b:${gb.id}` : null);
  const [risk, setRisk] = useState(false);
  const riskOf = n => { if (n.col === 'cir') { const pr = s.predictions.some(p => p.target === n.ref.id) ? 0.45 : 0; return Math.min(1, n.ref.tickets90 / 6 + pr + (n.status !== 'up' ? 0.3 : 0)); } if (n.col === 'car') { const sc = D.SCORECARD.find(x => x.carrier === n.label); return sc ? Math.min(1, (0.97 - sc.slaMet) * 6) : 0.1; } if (n.col === 'e' || n.col === 'ec') return n.ref.dev.ec === 2 ? 0.05 : 0.25; if (n.col === 'branch') { const cs = n.ref.wan.map(id => circuitOf(s, id)); return Math.min(1, cs.reduce((a, c) => a + c.tickets90, 0) / 8 + (cs.every(c => c.type !== 'LTE/5G') && cs[0].carrier === cs[1].carrier ? 0.4 : 0)); } return 0.05; };
  const riskColor = v => v >= 0.6 ? '#d03b3b' : v >= 0.3 ? '#e09a00' : '#9aa1a9';
  const branches = scopeList.filter(b => `${b.city}, ${b.state}` === city).slice(0, 16);

  const g = useMemo(() => {
    const nodes = [], edges = [];
    const carriers = new Set();
    branches.forEach(b => {
      const h = healthOf(s, b);
      nodes.push({ id: `b:${b.id}`, col: 'branch', label: b.name, sub: b.brand, status: h, ref: b });
      nodes.push({ id: `l:${b.id}`, col: 'lan', label: `${b.dev.sw} sw, ${b.dev.ap} AP`, sub: b.code, status: h === 'down' ? 'down' : 'up', ref: b });
      nodes.push({ id: `e:${b.id}`, col: 'ec', label: b.dev.ec === 2 ? 'EC-XS ×2 (HA)' : 'EC-XS', sub: `${b.code}-ec01`, status: h === 'down' ? 'down' : 'up', ref: b });
      edges.push([`b:${b.id}`, `l:${b.id}`], [`l:${b.id}`, `e:${b.id}`]);
      b.wan.forEach(id => { const c = circuitOf(s, id); carriers.add(c.carrier); nodes.push({ id: `c:${id}`, col: 'cir', label: `${c.role === 'Primary' ? 'wan1' : 'wan2'} ${c.type}`, sub: c.carrier, status: c.status === 'Up' ? 'up' : c.status === 'Degraded' ? 'degraded' : 'down', ref: c }); edges.push([`e:${b.id}`, `c:${id}`], [`c:${id}`, `k:${c.carrier}`]); });
    });
    [...carriers].sort().forEach(k => { nodes.push({ id: `k:${k}`, col: 'car', label: k, sub: `${D.CIRCUITS.filter(c => c.carrier === k).length} circuits fleet-wide`, status: 'up' }); HOSTS.forEach(h => edges.push([`k:${k}`, h.id])); });
    HOSTS.forEach(h => { nodes.push({ id: h.id, col: 'dc', label: h.label, sub: h.sub, status: 'up' }); h.apps.forEach(a => edges.push([h.id, `a:${a}`])); });
    D.APPS.forEach(a => nodes.push({ id: `a:${a.id}`, col: 'app', label: a.short, sub: a.crit + ' criticality', status: 'up', ref: a }));
    return { nodes, edges };
  }, [branches, s.branchHealth, s.circuitState]);

  // blast radius
  const blast = useMemo(() => {
    if (!sel) return null;
    const n = g.nodes.find(x => x.id === sel); if (!n) return null;
    const out = { node: n, down: [], backup: [], lanImpact: [], apps: new Set(), hl: new Set([sel]), text: '' };
    const brOf = b => [`b:${b.id}`, `l:${b.id}`, `e:${b.id}`];
    const pathFor = (b, cirIds) => { brOf(b).forEach(x => out.hl.add(x)); cirIds.forEach(c => { out.hl.add(`c:${c}`); out.hl.add(`k:${circuitOf(s, c).carrier}`); }); };
    if (n.col === 'car') {
      branches.forEach(b => { const on = b.wan.filter(id => circuitOf(s, id).carrier === n.label); if (!on.length) return; if (on.length === 2) { out.down.push(b); D.APPS.forEach(a => out.apps.add(a.id)); } else out.backup.push(b); pathFor(b, on); });
      out.text = `If ${n.label} fails in ${city}: branches with both paths on ${n.label} go down; others fail over to their second carrier.`;
    } else if (n.col === 'cir') {
      const b = D.BR[n.ref.branchId]; const other = circuitOf(s, b.wan.find(x => x !== n.ref.id));
      if (other.status === 'Down') { out.down.push(b); D.APPS.forEach(a => out.apps.add(a.id)); } else out.backup.push(b);
      pathFor(b, [n.ref.id]); out.text = `Losing ${n.ref.id} moves ${b.name} onto ${other.carrier} ${other.type}${other.type === 'LTE/5G' ? ' (Roof Hub/ERP slower, POS fine)' : ''}.`;
    } else if (n.col === 'ec') {
      const b = n.ref; if (b.dev.ec === 2) { out.backup.push(b); out.text = 'HA pair: the second EdgeConnect takes over; no outage.'; } else { out.down.push(b); D.APPS.forEach(a => out.apps.add(a.id)); out.text = 'Single EdgeConnect: the whole branch loses WAN until a swap (pre-staged spare, zero-touch).'; }
      pathFor(b, b.wan);
    } else if (n.col === 'lan') {
      out.lanImpact.push(n.ref); brOf(n.ref).forEach(x => out.hl.add(x)); ['pos', 'scan', 'voice'].forEach(a => out.apps.add(a)); out.text = 'LAN fault: WAN stays up, but POS terminals, scanners and phones on the affected switch/AP lose service.';
    } else if (n.col === 'branch') {
      pathFor(n.ref, n.ref.wan); D.APPS.forEach(a => out.hl.add(`a:${a.id}`)); HOSTS.forEach(h => out.hl.add(h.id)); out.text = 'Full dependency path for this branch.';
    } else if (n.col === 'dc') {
      const h = HOSTS.find(x => x.id === n.id); h.apps.forEach(a => out.apps.add(a)); branches.forEach(b => brOf(b).forEach(x => out.hl.add(x)));
      out.text = `${h.label} down: every branch loses ${h.apps.map(a => D.APPS.find(x => x.id === a).short).join(' and ')}. Network paths stay up.`;
    } else if (n.col === 'app') {
      const h = HOSTS.find(x => x.apps.includes(n.ref.id)); out.hl.add(h.id); out.apps.add(n.ref.id); g.nodes.filter(x => x.col === 'car').forEach(x => out.hl.add(x.id));
      out.text = `${n.ref.name} is reached via ${h.label}. Branches in view: ${branches.length}.`;
    }
    out.apps.forEach(a => out.hl.add(`a:${a}`));
    out.down.forEach(b => out.hl.add(`b:${b.id}`)); out.backup.forEach(b => out.hl.add(`b:${b.id}`));
    return out;
  }, [sel, g]);

  // layout
  const W = 1180, colW = W / COLS.length;
  const byCol = {}; g.nodes.forEach(n => (byCol[n.col] = byCol[n.col] || []).push(n));
  const maxRows = Math.max(...Object.values(byCol).map(a => a.length));
  const H = Math.max(420, Math.min(1100, maxRows * 26 + 60));
  const pos = {};
  COLS.forEach((c, ci) => { const arr = byCol[c.id] || []; arr.forEach((n, k) => { pos[n.id] = { x: ci * colW + colW / 2, y: 44 + (k + 0.5) * ((H - 54) / arr.length) }; }); });
  const stColor = st => st === 'down' ? C.bad : st === 'degraded' ? C.warn : C.ok;
  const impactedB = blast ? new Set([...blast.down, ...blast.backup, ...blast.lanImpact].map(b => b.id)) : new Set();

  return (
    <div>
      <PageHead icon={I.Network} title="Network Graph" sub="Branch → LAN → EdgeConnect → circuits → carriers → DC / cloud → applications, built from OpsRamp Network Graph, Orchestrator and the ServiceNow CMDB. Click any node for its blast radius."
        right={<><Btn kind={risk ? 'dark' : 'secondary'} icon={I.TrendingUp} onClick={() => setRisk(r => !r)}>{risk ? 'Showing 30-day failure risk' : 'Show failure risk'}</Btn><Select icon={I.MapPin} label="Metro" value={city} onChange={v => { setCity(v); setSel(null); }} options={cities} /><Logo k="opsramp" h={14} /></>} />
      <div className="grid xl:grid-cols-[1fr_340px] gap-3">
        <Card pad={false}>
          <div className="overflow-x-auto">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[900px]" style={{ height: H * 0.85 }}>
              {COLS.map((c, ci) => <text key={c.id} x={ci * colW + colW / 2} y={22} textAnchor="middle" fontSize="13" fontWeight="600" className="fill-ink2">{c.label}</text>)}
              {g.edges.map(([a, b], k) => { const p = pos[a], q = pos[b]; if (!p || !q) return null; const on = blast && blast.hl.has(a) && blast.hl.has(b); return <path key={k} d={`M${p.x + 58},${p.y} C${(p.x + q.x) / 2},${p.y} ${(p.x + q.x) / 2},${q.y} ${q.x - 58},${q.y}`} fill="none" stroke={on ? (blast.down.length ? C.bad : C.warn) : 'currentColor'} className={on ? '' : 'text-line'} strokeWidth={on ? 2 : 1} opacity={blast && !on ? 0.25 : 1} />; })}
              {g.nodes.map(n => { const p = pos[n.id]; const dim = blast && !blast.hl.has(n.id); const isSel = sel === n.id; const imp = n.col === 'branch' && impactedB.has(n.ref.id);
                return (
                  <g key={n.id} transform={`translate(${p.x - 58},${p.y - 11})`} onClick={() => setSel(isSel ? null : n.id)} className="cursor-pointer" opacity={dim ? 0.3 : 1}>
                    <rect width="116" height="22" rx="5" className={cx(isSel ? 'fill-ink' : 'fill-panel', 'stroke-line')} strokeWidth={imp ? 2 : 1} stroke={imp ? (blast.down.some(b => b.id === n.ref.id) ? C.bad : C.warn) : undefined} />
                    <circle cx="9" cy="11" r="3.5" fill={risk ? riskColor(riskOf(n)) : stColor(n.status)} />
                    <text x="17" y="14.5" fontSize="10.5" fontWeight="600" className={isSel ? 'fill-canvas' : 'fill-ink'}>{n.label.length > 17 ? n.label.slice(0, 16) + '…' : n.label}</text>
                    <title>{`${n.label} – ${n.sub || ''}`}</title>
                  </g>);
              })}
            </svg>
          </div>
        </Card>
        <div className="space-y-3">
          <Card title={blast ? blast.node.label : 'Blast radius'} sub={blast ? (blast.node.sub || '') : 'Select a node in the graph'} icon={I.Radar}>
            {!blast ? <div className="text-[12.5px] text-ink2 space-y-2"><p>Click a carrier to see which branches would go down versus fail over. Click a circuit, EdgeConnect, LAN, DC or application to see what depends on it.</p><p className="text-ink3">Showing {branches.length} branches in {city}. Pick another metro above, or use the global filters.</p></div> : <>
              <p className="text-[12.5px] text-ink2 mb-2">{blast.text}</p>
              <KV k="Branches down" v={<span className={blast.down.length ? 'text-bad' : ''}>{blast.down.length}</span>} />
              <KV k="Branches on backup path" v={<span className={blast.backup.length ? 'text-warn' : ''}>{blast.backup.length}</span>} />
              <KV k="LAN-only impact" v={blast.lanImpact.length} />
              <KV k="Applications affected" v={blast.apps.size} />
              {[...blast.down, ...blast.backup].length > 0 && <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">{[...blast.down.map(b => [b, 'down']), ...blast.backup.map(b => [b, 'backup'])].map(([b, t]) => <button key={b.id} onClick={() => act.openBranch(b.id)} className="w-full flex items-center gap-1.5 text-[12px] hover:bg-chip rounded px-1 py-0.5"><Dot tone={t === 'down' ? 'red' : 'amber'} /><span className="text-ink font-semibold">{b.name}</span><span className="text-ink3 truncate">{b.brand}</span><span className="ml-auto text-ink3">{t}</span></button>)}</div>}
              {blast.apps.size > 0 && <div className="flex flex-wrap gap-1 mt-2">{[...blast.apps].map(a => <Badge key={a} tone="red">{D.APPS.find(x => x.id === a).short}</Badge>)}</div>}
            </>}
          </Card>
          <Card title="Legend" icon={I.Info}>
            <div className="text-[12px] space-y-1 text-ink2">{risk ? <><div className="flex items-center gap-2"><Dot tone="red" />High risk of failure in 30 days</div><div className="flex items-center gap-2"><Dot tone="amber" />Elevated risk</div><div className="flex items-center gap-2"><Dot tone="gray" />Normal</div><div className="text-ink3 mt-1">Risk blends 90-day ticket history, open predictions, carrier restore record and single points of failure (same carrier on both paths, no HA edge).</div></> : <><div className="flex items-center gap-2"><Dot tone="green" />Healthy</div><div className="flex items-center gap-2"><Dot tone="amber" />Degraded / on backup</div><div className="flex items-center gap-2"><Dot tone="red" />Down</div></>}<div className="mt-2 text-ink3">Live status from Orchestrator and Aruba Central. Primary DC location and app hosting are <Illus />.</div></div>
          </Card>
        </div>
      </div>
    </div>
  );
}
