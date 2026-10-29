import React, { useState, useMemo } from 'react';
import * as I from 'lucide-react';
import * as D from './data.js';
import { useApp, useNow, healthOf, circuitOf, branchClock, filteredBranches, inScope, slaClock, lineOf, onBackupOf } from './store.jsx';
import { Card, Badge, Btn, Stat, Table, Dot, Pri, PageHead, Section, Progress, cx, healthTone, Modal, Illus, ExportBtn, Tabs, Hit } from './ui.jsx';
import { clockState, rootOf } from './dash/drilldata.js';
import { NAMap, Bars, Legend, Spark, C, LineChart } from './charts.jsx';
import { num, pct, dur, ago, hhmm, rng, exportCSV, MIN, HR, groupBy, T0 } from './util.js';
import { useLive } from './live.jsx';
import { LiveBadge, LiveFeed, EventFlowCard, ExperienceCard, AlertsPerMinCard, AppsLive, LivePanel } from './liveui.jsx';
import { IncidentForecastCard, PreventiveCard, ReadinessTrendCard, OpeningRiskCard } from './viz.jsx';
import { ErrorBudgets, TopBranches, UnifiedTimeline, MapFlows } from './viz2.jsx';
import { useReadiness, branchChecks, COLS, PreopenBanner, ReadinessSummary, OpenByTimezone, OpeningSchedule, ReadinessTable, PreopenStream, FixedOvernight } from './readiness.jsx';

const sevColor = h => ({ up: C.ok, degraded: C.warn, down: C.bad }[h]);

export function Overview() {
  const { s, act } = useApp();
  const now = useNow();
  const { L, ver } = useLive();
  const list = filteredBranches(s);
  const ids = new Set(list.map(b => b.id));
  const [cityPick, setCityPick] = useState(null);
  const open = s.incidents.filter(i => i.state !== 'Resolved' && ids.has(i.branchId));
  const byPri = { P1: 0, P2: 0, P3: 0, P4: 0 }; open.forEach(i => byPri[i.pri]++);
  const health = { up: 0, degraded: 0, down: 0 }; list.forEach(b => health[healthOf(s, b)]++);
  const openNow = list.filter(b => branchClock(b, now).open).length;
  const circ = list.flatMap(b => [0, 1].map(k => lineOf(s, b, k)));
  const circDown = circ.filter(c => c.status === 'Down'), circDeg = circ.filter(c => c.status === 'Degraded');
  const downDevices = list.filter(b => healthOf(s, b) === 'down').reduce((a, b) => a + b.dev.ec + b.dev.sw + b.dev.ap, 0) + open.filter(i => i.kind === 'apdown').length;
  const suppressed = L.counters.suppressed;
  const clocks = open.map(i => clockState(i, now));
  const atRisk = clocks.filter(c => c === 'atRisk').length, breached = clocks.filter(c => c === 'breached').length;
  const dr = node => act.drill(node);
  const onBackup = list.filter(b => onBackupOf(s, b)).length;

  // every branch on the map
  const points = useMemo(() => D.BRANCHES.map(b => {
    const h = healthOf(s, b); const sc = ids.has(b.id);
    return { id: b.id, b, x: b.x, y: b.y, r: list.length === 1 ? 9 : 3.4, color: sevColor(h), pulse: h === 'down' && sc, flash: sc && !!L.flash[b.id], dim: !sc, label: <span><b>{b.name}</b>, {b.brand}<br /><span className="text-ink3">{h === 'up' ? 'Healthy' : h === 'degraded' ? 'Degraded' : 'Down'}. Click for Branch 360</span></span> };
  }).sort((a, b) => (b.dim - a.dim) || ({ up: 0, degraded: 1, down: 2 }[healthOf(s, a.b)] - { up: 0, degraded: 1, down: 2 }[healthOf(s, b.b)])), [list, s.branchHealth, ver]);
  const focusPts = list.length < 900 ? list.map(b => ({ x: b.x, y: b.y })) : null;
  const regionRows = D.REGIONS.map(r => {
    const bs = list.filter(b => b.region === r); if (!bs.length) return null;
    const hs = bs.map(b => healthOf(s, b));
    return { id: r, region: r, n: bs.length, up: hs.filter(h => h === 'up').length, deg: hs.filter(h => h === 'degraded').length, down: hs.filter(h => h === 'down').length, inc: open.filter(i => D.BR[i.branchId].region === r).length, backup: bs.filter(b => circuitOf(s, b.wan[0]).status !== 'Up').length, openNow: bs.filter(b => branchClock(b, now).open).length };
  }).filter(Boolean);
  const bm = s.role === 'bm';

  return (
    <div>
      <PageHead icon={I.LayoutDashboard} title={bm ? `My branch – ${list[0].name}` : 'Operations Overview'} sub={bm ? `${list[0].brand}. What the NOC sees for your branch, in plain terms.` : 'Live state of the in-scope SRS branch network. Filter by region, brand or branch from the bar above.'}
        right={<><LiveBadge /><ExportBtn onClick={() => exportCSV('srs-branch-health.csv', list, [{ label: 'Branch ID', key: 'id' }, { label: 'Branch', key: 'name' }, { label: 'Brand', key: 'brand' }, { label: 'City', key: 'city' }, { label: 'State', key: 'state' }, { label: 'Region', key: 'region' }, { label: 'Health', get: b => healthOf(s, b) }, { label: 'Primary', get: b => { const c = circuitOf(s, b.wan[0]); return `${c.carrier} ${c.type} ${c.status}`; } }, { label: 'Backup', get: b => { const c = circuitOf(s, b.wan[1]); return `${c.carrier} ${c.type} ${c.status}`; } }])} /></>} />
      <div className="kpi-strip grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7">
        <Stat label="Branches open now" icon={I.Store} value={num(openNow)} sub={`of ${num(list.length)}, local hours`} onClick={() => dr({ t: 'set', k: 'openNow' })} />
        <Stat label="Healthy / degraded / down" icon={I.HeartPulse} onClick={() => dr({ t: 'set', k: 'all' })} value={<span><Hit title="Healthy branches" onClick={() => dr({ t: 'set', k: 'healthy' })} className="text-ok">{num(health.up)}</Hit><span className="text-ink3 text-[18px]"> / </span><Hit title="Degraded branches" onClick={() => dr({ t: 'set', k: 'degraded' })} className="text-warn">{health.degraded}</Hit><span className="text-ink3 text-[18px]"> / </span><Hit title="Branches down" onClick={() => dr({ t: 'set', k: 'down' })} className="text-bad">{health.down}</Hit></span>}>
          <div className="flex h-1.5 rounded-full overflow-hidden mt-2.5 bg-chip"><span className="bg-ok" style={{ width: `${health.up / list.length * 100}%` }} /><span className="bg-warn" style={{ width: `${health.degraded / list.length * 100}%` }} /><span className="bg-bad" style={{ width: `${health.down / list.length * 100}%` }} /></div>
        </Stat>
        <Stat label="Open incidents" icon={I.Siren} value={<span className="flex items-center gap-2">{open.length}{Object.keys(L.newIncs).length > 0 && <Badge tone="alert" className="pulse-alert">+{Object.keys(L.newIncs).length} new</Badge>}</span>} onClick={() => dr({ t: 'incidents', k: 'open' })} tone={byPri.P1 ? 'alert' : undefined}>
          <div className="flex flex-wrap gap-x-1.5 gap-y-1 mt-2">{Object.entries(byPri).map(([p, n]) => <Hit key={p} title={`Open ${p} incidents`} onClick={() => dr({ t: 'incidents', k: 'open', pri: p })} className="flex items-center gap-1 text-[11.5px]"><Pri p={p} /><b className="text-ink">{n}</b></Hit>)}</div>
        </Stat>
        <Stat label="Devices down" icon={I.ServerCrash} value={downDevices} tone={downDevices ? 'red' : 'green'} sub={`of ${num(list.reduce((a, b) => a + b.dev.ec + b.dev.sw + b.dev.ap, 0))} in view`} onClick={() => dr({ t: 'devices', k: 'down' })} />
        <Stat label="Circuits down / degraded" icon={I.Cable} value={<span><Hit title="Circuits down" onClick={() => dr({ t: 'lines', k: 'down' })} className="text-bad">{circDown.length}</Hit><span className="text-ink3 text-[18px]"> / </span><Hit title="Circuits degraded" onClick={() => dr({ t: 'lines', k: 'degraded' })} className="text-warn">{circDeg.length}</Hit></span>} sub={<Hit onClick={() => dr({ t: 'set', k: 'backup' })} className="text-left">{onBackup} branches on the backup line</Hit>} onClick={() => dr({ t: 'lines', k: 'problem' })} />
        <Stat label="Noise removed today" icon={I.BellOff} onClick={() => act.go('correlation')} value={num(suppressed)} sub={`of ${num(L.counters.events)} events (${Math.round(suppressed / Math.max(1, L.counters.events) * 100)}%); ${Math.round(L.series.raw.at(-1))} events/min now`}><Spark data={L.series.raw.slice(-60)} color={C.info} w={150} h={22} className="mt-1.5" /></Stat>
        <Stat label="SLA clocks" icon={I.Timer} value={<span><Hit title="On track" onClick={() => dr({ t: 'incidents', k: 'onTrack' })} className="text-ok">{clocks.length - atRisk - breached}</Hit><span className="text-ink3 text-[18px]"> / </span><Hit title="At risk" onClick={() => dr({ t: 'incidents', k: 'atRisk' })} className="text-warn">{atRisk}</Hit><span className="text-ink3 text-[18px]"> / </span><Hit title="Breached" onClick={() => dr({ t: 'incidents', k: 'breached' })} className="text-bad">{breached}</Hit></span>} sub="on track / at risk / breached" onClick={() => dr({ t: 'incidents', k: 'open' })} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-3 mt-3">
        <Card title="Branch health map" sub={`All 900 branches. Each dot is one branch, coloured by health; pick a region or city above to zoom. Click a branch for Branch 360.`} icon={I.Map} right={<Legend items={[['Healthy', C.ok], ['Degraded', C.warn], ['Down', C.bad]]} />}>
          <NAMap points={points} focus={focusPts} onPoint={p => act.openBranch(p.id)} h={440}>{!focusPts && <MapFlows />}</NAMap>
        </Card>
        <Card title="Open incidents" sub="Sorted by priority, then SLA time left, new ones flash" icon={I.ListOrdered} right={<Btn size="sm" onClick={() => act.go('incidents')}>Queue</Btn>}>
          <div className="space-y-1.5 max-h-[440px] overflow-y-auto pr-1">
            {open.slice().sort((a, b) => a.pri.localeCompare(b.pri) || slaClock(a, now).resLeft - slaClock(b, now).resLeft).slice(0, 14).map(i => {
              const c = slaClock(i, now); const b = D.BR[i.branchId];
              return (
                <div key={i.id} role="button" tabIndex={0} onClick={() => act.openInc(i.id)} onKeyDown={e => e.key === 'Enter' && act.openInc(i.id)} className={cx('w-full text-left border rounded-md px-2.5 py-2 hover:bg-chip/70 cursor-pointer', L.newIncs[i.id] ? 'border-alert/60 bg-alert/5 feed-in' : 'border-line')}>
                  <div className="flex items-center gap-2"><Pri p={i.pri} /><span className="text-[11.5px] font-mono text-ink3">{i.id}</span>{i.major && <Badge tone="alert">MAJOR</Badge>}{L.newIncs[i.id] && <Badge tone="alert">NEW</Badge>}<span className="flex-1" /><span className={cx('text-[11.5px] font-mono font-semibold', c.resLeft < 0 ? 'text-bad' : c.used > 0.75 ? 'text-warn' : 'text-ink2')}>{c.resLeft < 0 ? 'breached' : dur(c.resLeft)}</span></div>
                  <div className="text-[12.5px] text-ink font-semibold mt-0.5 line-clamp-1">{i.title}</div>
                  <div className="text-[11.5px] text-ink3">{b.name}, {b.brand}, {i.state}</div>
                  {i.rca && i.rca[0] && <Hit title="Open the root cause" onClick={() => dr({ t: 'rca', id: i.id })} className="block text-left text-[11.5px] text-ink2 mt-0.5 hover:text-bad"><b className="text-bad">Root cause, {rootOf(i).top.layer}:</b> {rootOf(i).top.text} ({Math.round(rootOf(i).top.conf * 100)}%)</Hit>}
                </div>
              );
            })}
            {!open.length && <div className="text-[13px] text-ink3 py-6 text-center">No open incidents in this view.</div>}
          </div>
        </Card>
      </div>

      <div className="flex items-center gap-2 mt-4 mb-2"><h2 className="text-[15px] font-bold text-ink">Service levels and error budgets</h2><span className="text-[12px] text-ink3">30-day window</span></div>
      <ErrorBudgets />

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-3 mt-3 items-start">
        <IncidentForecastCard />
        <PreventiveCard />
      </div>


      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 mt-3">
        <EventFlowCard />
        <ExperienceCard />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-3 mt-3">
        <LiveFeed h={380} />
        <TopBranches />
      </div>

      <div className="mt-3">
        <Card title="By region" sub="Click a row to filter the console; click a count to see those branches or incidents" icon={I.Globe2}>
          <Table dense rows={regionRows} onRow={r => act.set(st => ({ filters: { ...st.filters, region: r.region, city: 'All', branchId: null } }))} cols={[
            { key: 'region', label: 'Region', render: r => <span className="font-semibold whitespace-nowrap">{r.region}</span> },
            { key: 'n', label: 'Branches', right: true },
            { key: 'openNow', label: 'Open now', right: true },
            { key: 'health', label: 'Health', sortable: false, render: r => <div className="flex h-2 w-28 rounded-full overflow-hidden bg-chip"><span className="bg-ok" style={{ width: `${r.up / r.n * 100}%` }} /><span className="bg-warn" style={{ width: `${r.deg / r.n * 100}%` }} /><span className="bg-bad" style={{ width: `${r.down / r.n * 100}%` }} /></div> },
            { key: 'deg', label: 'Degr.', right: true, render: r => r.deg ? <Hit title="Degraded branches" onClick={() => dr({ t: 'set', k: 'degraded', region: r.region })} className="text-warn font-semibold">{r.deg}</Hit> : <span className="text-ink3">0</span> },
            { key: 'down', label: 'Down', right: true, render: r => r.down ? <Hit title="Branches down" onClick={() => dr({ t: 'set', k: 'down', region: r.region })} className="text-bad font-semibold">{r.down}</Hit> : <span className="text-ink3">0</span> },
            { key: 'backup', label: 'On backup', right: true, render: r => r.backup ? <Hit title="Branches on the backup line" onClick={() => dr({ t: 'set', k: 'backup', region: r.region })} className="text-info font-semibold">{r.backup}</Hit> : <span className="text-ink3">0</span> },
            { key: 'inc', label: 'Incidents', right: true, render: r => r.inc ? <Hit title="Open incidents" onClick={() => dr({ t: 'incidents', k: 'open', region: r.region })} className="font-semibold text-ink">{r.inc}</Hit> : <span className="text-ink3">0</span> },
            { key: 'go', label: '', sortable: false, render: r => <Hit title="Drill down into the region" onClick={() => dr({ t: 'set', k: 'all', region: r.region })} className="text-ink3 hover:text-brand"><I.Layers size={14} /></Hit> },
          ]} />
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 mt-3">
        <AlertsPerMinCard />
        <Card title="Circuits down or degraded" icon={I.Cable} right={<div className="flex gap-1.5"><Btn size="sm" icon={I.Layers} onClick={() => dr({ t: 'lines', k: 'problem' })}>Drill down</Btn><Btn size="sm" onClick={() => act.go('carriers')}>Carriers</Btn></div>}>
          <div className="space-y-1 max-h-[260px] overflow-y-auto">
            {[...circDown, ...circDeg].map(c => { const b = D.BR[c.branchId]; return <button key={c.id} onClick={() => dr({ t: 'circuit', id: c.id })} className="w-full text-left flex items-center gap-2 text-[12.5px] py-1 border-b border-line/60 hover:bg-chip/60"><Dot tone={c.status === 'Down' ? 'red' : 'amber'} /><span className="font-semibold text-ink w-28 truncate">{b.name}</span><span className="text-ink2 flex-1 min-w-0 leading-snug">{c.role}, {c.carrier} {c.type}</span><span className="text-ink3 text-[11.5px]">{c.status}</span></button>; })}
            {!circDown.length && !circDeg.length && <div className="text-ink3 text-[13px]">All circuits clean.</div>}
          </div>
        </Card>
        <Card title="Ticket mix – last 6 months" sub="3,773 tickets, last 6 months" icon={I.PieChart}>
          {[['After-hours mended', D.FACTS.tickets6m.afterHours, C.info], ['No trouble found (NTF)', D.FACTS.tickets6m.ntf, C.warn], ['Carrier / LEC', D.FACTS.tickets6m.carrier, C.brand], ['Customer-caused', D.FACTS.tickets6m.customer, C.ai], ['Reboot etc.', D.FACTS.tickets6m.reboot, C.grey]].map(([l, n, c]) => (
            <div key={l} className="py-1"><div className="flex text-[12.5px]"><span className="text-ink flex-1">{l}</span><b className="text-ink">{num(n)}</b><span className="text-ink3 w-12 text-right">{pct(n / D.FACTS.tickets6m.total, 0)}</span></div><div className="h-1.5 bg-chip rounded-full mt-1"><div className="h-full rounded-full" style={{ width: `${n / D.FACTS.tickets6m.total * 100}%`, background: c }} /></div></div>))}
        </Card>
      </div>

      <Modal open={!!cityPick} onClose={() => setCityPick(null)} title={cityPick ? `${cityPick.bs[0].city}, ${cityPick.bs[0].state}` : ''} sub={cityPick ? `${cityPick.bs.length} branches` : ''}>
        {cityPick && <Table dense rows={cityPick.bs} onRow={b => { setCityPick(null); act.openBranch(b.id); }} cols={[{ key: 'h', label: '', sortable: false, render: b => <Dot tone={healthTone(healthOf(s, b))} /> }, { key: 'name', label: 'Branch' }, { key: 'brand', label: 'Brand' }, { key: 'id', label: 'ID' }, { key: 'inc', label: 'Open inc.', get: b => s.incidents.filter(i => i.branchId === b.id && i.state !== 'Resolved').length }]} />}
      </Modal>
      <div className="mt-3"><UnifiedTimeline /></div>
    </div>
  );
}

// ───────────────────────── Branch Readiness ─────────────────────────
export function baseReadiness(s, b) {
  const h = healthOf(s, b); const p = circuitOf(s, b.wan[0]), sc = circuitOf(s, b.wan[1]);
  const incs = s.incidents.filter(i => i.branchId === b.id && i.state !== 'Resolved');
  const has = k => incs.some(i => i.kind === k);
  const R = rng(b.num * 13);
  const res = [
    { id: 'sdwan', st: h === 'down' ? 'fail' : (p.status !== 'Up' || sc.status !== 'Up') ? 'warn' : 'pass', detail: h === 'down' ? 'EdgeConnect unreachable' : p.status !== 'Up' ? `Primary ${p.carrier} ${p.status.toLowerCase()} – on backup` : sc.status !== 'Up' ? `Backup ${sc.carrier} ${sc.type} failed test` : 'Both paths up, tunnels to DC and Azure OK' },
    { id: 'erp', st: h === 'down' ? 'fail' : has('pos') ? 'fail' : 'pass', detail: h === 'down' ? 'No path' : has('pos') ? 'Payment path 1.9 s (limit 0.4 s)' : `ERP login 1.${Math.floor(R() * 9)} s, payment path ${100 + Math.floor(R() * 90)} ms` },
    { id: 'wifi', st: h === 'down' ? 'fail' : has('apdown') ? 'warn' : 'pass', detail: has('apdown') ? 'One AP offline (yard/warehouse)' : `${b.dev.ap}/${b.dev.ap} APs up` },
    { id: 'scan', st: h === 'down' ? 'fail' : has('dhcp') ? 'fail' : 'pass', detail: has('dhcp') ? 'VLAN 30 pool full: new devices cannot get an address' : `Largest pool ${55 + Math.floor(R() * 25)}% used` },
    { id: 'print', st: h === 'down' ? 'fail' : has('scanner') ? 'warn' : 'pass', detail: has('scanner') ? 'Roaming failures above baseline in the aisles' : 'Roaming within baseline' },
    { id: 'track', st: has('backup') ? 'warn' : 'pass', detail: has('backup') ? 'Last night\'s backup failed' : 'Backup taken 02:00, matches golden config' },
  ];
  res.forEach(r => { r.name = D.READY_CHECKS.find(c => c.id === r.id).name; });
  return { at: null, results: res };
}
const stIcon = st => st === 'pass' ? <I.CheckCircle2 size={15} className="text-ok" /> : st === 'warn' ? <I.AlertTriangle size={15} className="text-warn" /> : st === 'fail' ? <I.XCircle size={15} className="text-bad" /> : <I.Loader2 size={15} className="text-info animate-spin" />;

export function Readiness() {
  const { s, act } = useApp();
  const now = useNow();
  const list = filteredBranches(s);
  const [view, setView] = useState('attention');
  const [running, setRunning] = useState({});
  const rows = list.map(b => { const r = s.readiness[b.id] || baseReadiness(s, b); const worst = r.results.some(x => x.st === 'fail') ? 'fail' : r.results.some(x => x.st === 'warn') ? 'warn' : 'pass'; return { id: b.id, b, r, worst, clk: branchClock(b, now) }; });
  const shown = view === 'attention' ? rows.filter(r => r.worst !== 'pass') : view === 'soon' ? rows.filter(r => r.clk.minsToOpen != null && r.clk.minsToOpen < 180) : rows;
  const rerun = (b) => {
    setRunning(x => ({ ...x, [b.id]: true }));
    const base = baseReadiness(s, b);
    act.map('readiness', b.id, { at: Date.now(), results: base.results.map(r => ({ ...r, st: 'running' })) });
    base.results.forEach((r, k) => setTimeout(() => {
      const fixed = (r.id === 'print' || r.id === 'track') && r.st !== 'pass' && Math.random() < 0.5 ? { st: 'pass', detail: 'Passed on re-run (transient)' } : {};
      act.map('readiness', b.id, prev => ({ at: Date.now(), results: prev.results.map(x => x.id === r.id ? { ...r, ...fixed } : x) }));
      if (k === base.results.length - 1) { setRunning(x => ({ ...x, [b.id]: false })); act.audit(`Readiness re-run: ${b.name}, ${b.brand}`, b.id); }
    }, 350 * (k + 1)));
  };
  const raise = (b, r) => {
    const fails = r.results.filter(x => x.st !== 'pass');
    const id = D.nextInc();
    act.add('incidents', { id, kind: 'readiness', pri: fails.some(f => f.id === 'erp' || f.id === 'sdwan') ? 'P2' : 'P3', title: `Readiness check failed before opening: ${fails.map(f => f.name).join(', ')}`, cat: 'Branch readiness', branchId: b.id, ci: `${b.code}-ec01`, opened: Date.now(), acked: null, state: 'New', group: 'Movate NOC – L2 Network', assignee: null, signals: fails.map(f => ({ t: Date.now(), src: D.READY_CHECKS.find(c => c.id === f.id).src, msg: `${f.name}: ${f.detail}`, sev: f.st === 'fail' ? 'Major' : 'Minor' })), corr: fails.length, suppressed: 0, rca: [], conf: 0, agentSteps: [{ agent: 'correlation', t: Date.now(), text: 'Created from Branch Readiness by ' + act.me(), st: 'done' }], runbook: null, rbState: 'proposed', impact: fails.map(f => f.detail), verify: fails.map(f => ({ v: `${f.name} passes on re-run`, st: 'pending' })), notes: [], carrierCase: null, workOrder: null });
    act.audit(`Raised ${id} from readiness check`, b.id); act.toast(`${id} raised for ${b.name}`);
  };
  const regionMatrix = D.REGIONS.map(rg => { const rs = rows.filter(r => r.b.region === rg); if (!rs.length) return null; return { rg, n: rs.length, cells: D.READY_CHECKS.map(c => { const p = rs.filter(r => r.r.results.find(x => x.id === c.id).st === 'pass').length; return { id: c.id, p, n: rs.length }; }) }; }).filter(Boolean);
  const total = rows.length, passAll = rows.filter(r => r.worst === 'pass').length;
  const waves = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles'].map(tz => { const b = list.find(x => x.tz === tz); if (!b) return null; const c = branchClock(b, now); return { tz, c, n: list.filter(x => x.tz === tz).length }; }).filter(Boolean);
  const bulk = () => { act.audit('Readiness check run on demand (all branches in view)', ''); act.toast(`Re-running pre-opening checks on ${list.length} branches`, 'info'); };

  const R = useReadiness(list);
  const raise2 = b => { const ch = branchChecks(s, b); const fails = Object.entries(ch.c).filter(([, x]) => x.st !== 'pass').map(([id, x]) => ({ id, ...x, name: COLS.find(c => c.id === id).label })); if (!fails.length) { act.toast(`${b.name}: all checks pass, nothing to raise`, 'info'); return; } const id = D.nextInc();
    act.add('incidents', { id, kind: 'readiness', pri: fails.some(f => ['wan1', 'ec', 'tun', 'pos'].includes(f.id) && f.st === 'fail') ? 'P2' : 'P3', title: `Readiness check failed before opening: ${fails.map(f => f.name).join(', ')}`, cat: 'Branch readiness', branchId: b.id, ci: `${b.code}-ec01`, opened: Date.now(), acked: null, state: 'New', group: 'Movate NOC – L2 Network', assignee: null, signals: fails.map(f => ({ t: Date.now(), src: 'Synthetic', msg: `${f.name}: ${f.detail}`, sev: f.st === 'fail' ? 'Major' : 'Minor' })), corr: fails.length, suppressed: 0, rca: [], conf: 0, agentSteps: [], runbook: null, rbState: 'proposed', impact: fails.map(f => f.detail), verify: [], notes: [], carrierCase: null, workOrder: null, major: false, children: [] });
    act.audit(`Raised ${id} from readiness check`, b.id); act.toast(`${id} raised for ${b.name}`); };
  const rerun2 = b => { setRunning(x => ({ ...x, [b.id]: true })); setTimeout(() => { setRunning(x => ({ ...x, [b.id]: false })); const ch = branchChecks(s, b); act.audit(`Readiness re-run: ${b.name}`, b.id); act.toast(`${b.name}: ${ch.result === 'Ready' || ch.result === 'Fixed overnight' ? 'all checks pass' : ch.result.toLowerCase()}`, ch.result === 'Not ready' ? 'bad' : ch.result === 'Needs attention' ? 'warn' : 'ok'); }, 1800); };
  return (
    <div>
      <PageHead icon={I.Sunrise} title="Branch Readiness" sub="Network checks run at 05:30 local for every branch: primary and backup internet, EdgeConnect, tunnels, switches, Wi-Fi, DHCP pools, config compliance and the POS and ERP paths. Issues are fixed overnight or given an owner before opening."
        right={<><Btn icon={I.RefreshCw} onClick={bulk}>Run check now</Btn><ExportBtn onClick={() => exportCSV('srs-readiness.csv', R, [{ label: 'Branch', get: r => r.b.name }, { label: 'Brand', get: r => r.b.brand }, { label: 'Region', get: r => r.b.region }, { label: 'Opens', get: r => `${r.clk.opens || r.b.hours.open} ${r.b.tz}` }, { label: 'Result', key: 'result' }, ...COLS.map(c => ({ label: c.label, get: r => `${r.c[c.id].fixed ? 'fixed' : r.c[c.id].st}: ${r.c[c.id].detail}` }))])} /></>} />
      <PreopenBanner rows={R} />
      <div className="mt-3"><ReadinessSummary rows={R} /></div>
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-3 mt-3"><OpenByTimezone rows={R} /><OpeningSchedule rows={R} /></div>
      <div className="mt-3"><ReadinessTable rows={R} onRerun={rerun2} onRaise={raise2} running={running} /></div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 mt-3 items-start"><PreopenStream /><FixedOvernight rows={R} /></div>
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-3 mt-3 items-start">
        <ReadinessTrendCard />
        <OpeningRiskCard />
      </div>
      <Card title="Pass rate by region and check" sub="Click a cell to filter the console to that region" icon={I.Grid3x3} className="mt-3">
        <div className="overflow-x-auto"><table className="w-full text-[12.5px]"><thead><tr className="text-ink3 text-left"><th className="py-1.5 pr-2">Region</th>{COLS.map(c => <th key={c.id} className="px-1 py-1.5 font-semibold text-center">{c.label}</th>)}</tr></thead>
          <tbody>{D.REGIONS.map(rg => { const rs = R.filter(r => r.b.region === rg); if (!rs.length) return null; return <tr key={rg} className="border-t border-line/60"><td className="py-1.5 pr-2 font-semibold text-ink whitespace-nowrap">{rg} <span className="text-ink3 font-normal">({rs.length})</span></td>{COLS.map(c => { const v = rs.filter(r => r.c[c.id].st === 'pass').length / rs.length; return <td key={c.id} className="px-0.5 py-1"><button onClick={() => act.set(st => ({ filters: { ...st.filters, region: rg, city: 'All', branchId: null } }))} title={`${rg}, ${c.label}: ${(v * 100).toFixed(1)}% pass`} className={cx('w-full rounded px-1 py-1 font-bold text-center text-[11.5px]', v === 1 ? 'bg-ok/10 text-ok' : v >= 0.97 ? 'bg-warn/10 text-warn' : 'bg-bad/10 text-bad')}>{v === 1 ? '100' : (v * 100).toFixed(1)}</button></td>; })}</tr>; })}</tbody></table></div>
      </Card>
    </div>
  );
}
