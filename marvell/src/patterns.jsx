// Pattern correlation across stores, and anomaly detection against each line's learned normal.
// Patterns: stores with the same kind of trouble that share a carrier and region, a local exchange carrier, or a
// device model and firmware, with no topology link between them. Anomalies: lines drifting from their own normal
// range while still under the static alert threshold, so a threshold alone would not alert yet.
import React, { useMemo, useState } from 'react';
import * as I from 'lucide-react';
import * as D from './data.js';
import { useApp } from './store.jsx';
import { Card, Badge, Btn, cx } from './ui.jsx';
import { LineChart, Spark, C } from './charts.jsx';
import { rng, num } from './util.js';

const seed = s => s.split('').reduce((a, c) => a * 31 + c.charCodeAt(0) >>> 0, 11);
const bad = c => c.tickets90 >= 2 || c.flaps30 >= 2 || c.loss > 0.3;

export function patternsOf() {
  const out = [], pri = D.CIRCUITS.filter(c => c.role === 'Primary');
  const add = (kind, key, title, members, of, node, why, match = () => false) => {
    const n = new Set(members.map(m => m.branchId)).size, share = n / Math.max(1, of); if (n < 4) return;
    const R = rng(seed(key)), nights = 6 + Math.floor(R() * 7);
    out.push({ id: `PAT-${String(seed(key) % 9000 + 1000)}`, kind, title, n, of, share, nights, conf: Math.min(0.95, 0.52 + share * 0.9 + n * 0.012), members, node, why: why(nights), problem: D.PROBLEMS.find(p => match(p.title)) });
  };
  // the same carrier in the same region
  const byCR = {}; pri.forEach(c => { const k = `${c.carrier}|${D.BR[c.branchId].region}`; (byCR[k] = byCR[k] || []).push(c); });
  Object.entries(byCR).forEach(([k, l]) => { const [car, reg] = k.split('|'); const m = l.filter(bad); add('Carrier and region', k, `${car} lines in ${reg}`, m, l.length, { t: 'lines', k: 'all', carrier: car, region: reg }, nights => `Loss, flaps and repeat tickets rise together on ${nights} of the last 14 evenings, at stores with no shared site or device`, t => t.includes(car) && t.includes(reg)); });
  // the same local exchange carrier
  const byL = {}; pri.filter(c => c.lec).forEach(c => { const k = `${c.lec}|${D.BR[c.branchId].region}`; (byL[k] = byL[k] || []).push(c); });
  Object.entries(byL).forEach(([k, l]) => { const [lec, reg] = k.split('|'); const m = l.filter(bad); add('Shared local exchange', `L${k}`, `${lec} local loops in ${reg}`, m, l.length, { t: 'lines', k: 'all', region: reg }, nights => `Different carriers, same ${lec} local loop: drops start within 15 minutes of each other on ${nights} of the last 14 days`); });
  // the same device model and firmware
  const byM = {}; [...D.INCIDENTS, ...D.RESOLVED].forEach(i => { const d = D.DEV[i.ci]; if (!d) return; const k = `${d.model}|${d.fw}`; (byM[k] = byM[k] || []).push({ branchId: i.branchId, id: d.id }); });
  const rateOf = (model, pred) => { const st = new Set(D.DEVICES.filter(d => d.model === model && pred(d.fw)).map(d => d.branchId)).size; const hit = new Set(Object.entries(byM).filter(([kk]) => kk.split('|')[0] === model && pred(kk.split('|')[1])).flatMap(([, v]) => v.map(x => x.branchId))).size; return { st, hit, r: hit / Math.max(1, st) }; };
  Object.entries(byM).forEach(([k, m]) => { const [model, fw] = k.split('|'); const of = new Set(D.DEVICES.filter(d => d.model === model && d.fw === fw).map(d => d.branchId)).size; const n = new Set(m.map(x => x.branchId)).size; const rest = rateOf(model, f => f !== fw); if (n / Math.max(1, of) < Math.max(0.03, rest.r * 2)) return; add('Model and firmware', `M${k}`, `${model} on ${fw}`, m, of, { t: 'devices', k: 'all', model }, nights => `The same fault (reboots, port errors) on this model and release across stores, ${nights} days running; other releases of the same model are quiet`, t => t.includes(model)); });
  return out.sort((a, b) => b.conf * b.n - a.conf * a.n).slice(0, 6);
}

export function PatternsCard() {
  const { s, act } = useApp();
  const pats = useMemo(() => patternsOf(), []);
  const raised = s.patternProblems || {};
  const raise = p => { const id = `PRB000${4240 + Object.keys(raised).length}`; act.add('problems', { id, title: `Pattern across stores: ${p.title}`, incidents: p.n, state: 'Root cause analysis', owner: 'Network Eng L3', opened: Date.now() }); act.set({ patternProblems: { ...raised, [p.id]: id } }); act.audit(`${id} opened from pattern ${p.id} (${p.n} stores)`, id); act.toast(`${id} opened: ${p.title}, ${p.n} stores`); };
  return (
    <Card title="Patterns across stores" sub="Alarms that recur together with no topology link between the stores" icon={I.Waypoints} right={<Badge tone="blue">machine-learning co-occurrence</Badge>}>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">{pats.map(p => { const pid = raised[p.id] || (p.problem && p.problem.id); return (
        <div key={p.id} className="border border-line rounded-lg p-3 flex flex-col">
          <div className="flex items-center gap-2"><Badge tone={p.kind === 'Model and firmware' ? 'purple' : 'amber'}>{p.kind}</Badge><span className="font-mono text-[11.5px] text-ink3">{p.id}</span><span className="ml-auto text-[12px] font-bold text-ink tabular-nums">{Math.round(p.conf * 100)}% confident</span></div>
          <button onClick={() => act.drill(p.node)} className="text-left text-[14.5px] font-bold text-ink mt-1 hover:underline">{p.title}</button>
          <div className="flex items-baseline gap-4 mt-1"><div><span className="text-[22px] font-bold text-warn tabular-nums">{p.n}</span><span className="text-[12px] text-ink3"> stores</span></div><div className="text-[12px] text-ink3">{Math.round(p.share * 100)}% of the {num(p.of)} in the group</div></div>
          <div className="text-[12.5px] text-ink2 mt-1 leading-snug">{p.why}.</div>
          <div className="flex flex-wrap gap-1 mt-2">{[...new Set(p.members.map(m => m.branchId))].slice(0, 5).map(id => <button key={id} onClick={() => act.drill({ t: 'branch', id })} className="text-[11.5px] border border-line rounded px-1.5 py-0.5 hover:bg-chip text-ink">{D.BR[id].name.split(' – ')[1] || D.BR[id].name}</button>)}{p.n > 5 && <span className="text-[11.5px] text-ink3 px-1 py-0.5">+{p.n - 5} more</span>}</div>
          <div className="flex gap-2 mt-auto pt-3">{pid ? <Badge tone="green"><I.Check size={11} />{pid} open</Badge> : <Btn op size="sm" icon={I.FilePlus2} onClick={() => raise(p)}>Open problem record</Btn>}<Btn size="sm" icon={I.Layers} onClick={() => act.drill(p.node)}>See the stores</Btn></div>
        </div>); })}</div>
    </Card>
  );
}

// lines drifting from their learned normal, still under the static threshold
const LIMIT = { lat: 100, jit: 30, loss: 1 };
export function anomaliesOf() {
  return D.CIRCUITS.filter(c => c.role === 'Primary' && c.status !== 'Down').map(c => {
    const R = rng(seed(c.id)), base = c.rtt || 28, dev = (c.lat - base) / base;
    const jb = Math.max(0.6, D.AVG_JIT * (0.7 + R() * 0.4)), lb = Math.max(0.01, D.AVG_LOSS * (0.6 + R() * 0.6));
    const metric = c.loss / lb > 4 && c.loss < LIMIT.loss ? 'loss' : c.jit / jb > 2.2 && c.jit < LIMIT.jit ? 'jit' : 'lat';
    const now = metric === 'lat' ? c.lat : metric === 'jit' ? c.jit : c.loss, normal = metric === 'lat' ? base : metric === 'jit' ? jb : lb;
    const z = metric === 'lat' ? (normal >= 15 ? (now - normal) / Math.max(2, normal * 0.08) : 0) : (now / normal - 1) / 0.35;
    const days = 14, series = Array.from({ length: days }, (_, i) => +(normal + (now - normal) * Math.pow(i / (days - 1), 1.6) + (R() - 0.5) * normal * 0.06).toFixed(metric === 'loss' ? 3 : 1));
    const slope = (now - series[days - 8]) / 7, eta = slope > 0 ? Math.round((LIMIT[metric] - now) / slope) : null;
    return { c, b: D.BR[c.branchId], metric, now, normal, z, series, eta, pct: now / normal - 1 };
  }).filter(a => a.z >= 3 && a.now < LIMIT[a.metric] && a.now - a.normal >= ({ lat: 8, jit: 3, loss: 0.2 })[a.metric]).sort((a, b) => b.z - a.z)
    .filter((a, i, arr) => arr.slice(0, i).filter(x => x.b.city === a.b.city).length < 1)
    .reduce((acc, a) => { const n = acc.filter(x => x.metric === a.metric).length; if (n < ({ lat: 4, jit: 2, loss: 2 })[a.metric]) acc.push(a); return acc; }, []).slice(0, 8);
}
const LBL = { lat: 'Latency', jit: 'Jitter', loss: 'Packet loss' }, UNIT = { lat: ' ms', jit: ' ms', loss: '%' };
const fv = (v, m) => `${m === 'loss' ? v.toFixed(2) : Math.round(v * 10) / 10}${UNIT[m]}`;

export function AnomaliesCard() {
  const { s, act } = useApp();
  const list = useMemo(() => anomaliesOf(), []);
  const [sel, setSel] = useState(0); const a = list[sel] || list[0];
  const watched = id => s.watches.some(w => w.id === `W-AN-${id}`);
  const watch = x => { act.add('watches', { id: `W-AN-${x.c.id}`, what: `${LBL[x.metric]} drift on ${x.c.id}`, branchId: x.b.id, created: Date.now(), by: act.me() }); act.audit(`Watch on ${x.c.id}: ${LBL[x.metric].toLowerCase()} ${fv(x.now, x.metric)} against a normal ${fv(x.normal, x.metric)}`, x.c.id); act.toast(`Watching ${x.c.id}: alert if it keeps drifting`); };
  if (!a) return null;
  return (
    <Card title="Anomaly detection" sub="Lines drifting from their own learned normal, still under the static threshold" icon={I.Activity} right={<Badge tone="blue">{list.length} drifting now</Badge>}>
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-4">
        <div className="divide-y divide-line">{list.map((x, i) => (
          <button key={x.c.id} onClick={() => setSel(i)} className={cx('w-full text-left grid grid-cols-[minmax(0,1fr)_80px_92px] gap-2 items-center py-2 px-1 rounded', i === sel ? 'bg-chip' : 'hover:bg-chip/50')}>
            <span className="min-w-0"><span className="block text-[12.5px] font-semibold text-ink truncate">{x.b.name}</span><span className="block text-[11.5px] text-ink3 truncate">{x.c.carrier} {x.c.type} · {LBL[x.metric]}</span></span>
            <Spark data={x.series} w={80} h={22} color={C.warn} fill={false} />
            <span className="text-right"><b className="text-[13px] text-warn tabular-nums">+{Math.round(x.pct * 100)}%</b><span className="block text-[11px] text-ink3">{fv(x.now, x.metric)} vs {fv(x.normal, x.metric)}</span></span>
          </button>))}</div>
        <div>
          <div className="flex items-center gap-2 flex-wrap"><b className="text-[14px] text-ink">{a.b.name}</b><span className="font-mono text-[11.5px] text-ink3">{a.c.id}</span><span className="ml-auto text-[12px] text-ink3">{LBL[a.metric]}, last 14 days</span></div>
          <LineChart h={190} labels={a.series.map((_, i) => `D-${a.series.length - 1 - i}`)} yFmt={v => fv(v, a.metric)} yMin={a.normal * 0.7} series={[{ name: LBL[a.metric], color: C.warn, data: a.series }, { name: 'Learned normal', color: C.s3, data: a.series.map(() => a.normal) }]} band={{ lo: a.series.map(() => a.normal * 0.9), hi: a.series.map(() => a.normal * 1.1), color: C.s3 }} />
          <div className="grid grid-cols-3 gap-2 mt-2 text-[12px]">{[['Normal', fv(a.normal, a.metric)], ['Now', fv(a.now, a.metric)], ['Static alert at', fv(LIMIT[a.metric], a.metric)]].map(([k, v]) => <div key={k} className="border border-line rounded px-2 py-1"><div className="text-ink3">{k}</div><b className="text-ink tabular-nums">{v}</b></div>)}</div>
          <div className="text-[12.5px] text-ink2 mt-2">{a.eta && a.eta > 0 && a.eta < 120 ? `At this rate it crosses the static threshold in about ${a.eta} days; the anomaly flags it now.` : 'Well outside its own normal range, though a static threshold would not alert.'}</div>
          <div className="flex gap-2 mt-2">{watched(a.c.id) ? <Badge tone="green"><I.Eye size={11} />Watching</Badge> : <Btn op size="sm" icon={I.Eye} onClick={() => watch(a)}>Watch this line</Btn>}<Btn size="sm" icon={I.Layers} onClick={() => act.drill({ t: 'circuit', id: a.c.id })}>Open the line</Btn></div>
        </div>
      </div>
    </Card>
  );
}
