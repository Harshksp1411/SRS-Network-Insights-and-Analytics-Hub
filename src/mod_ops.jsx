import React, { useState, useMemo } from 'react';
import * as I from 'lucide-react';
import * as D from './data.js';
import { useApp, useNow, healthOf, circuitOf, branchClock, filteredBranches, inScope, slaClock } from './store.jsx';
import { Card, Badge, Btn, Stat, Table, Dot, Pri, PageHead, Section, Progress, cx, healthTone, Modal, Illus, ExportBtn, Tabs } from './ui.jsx';
import { NAMap, Bars, Legend, Spark, C, LineChart } from './charts.jsx';
import { num, pct, dur, ago, hhmm, rng, exportCSV, MIN, HR, groupBy, T0 } from './util.js';
import { useLive } from './live.jsx';
import { LiveBadge, LiveFeed, EventFlowCard, ExperienceCard, AlertsPerMinCard, AppsLive, LivePanel } from './liveui.jsx';
import { IncidentForecastCard, PreventiveCard, ReadinessTrendCard, OpeningRiskCard } from './viz.jsx';

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
  const circ = list.flatMap(b => b.wan.map(id => circuitOf(s, id)));
  const circDown = circ.filter(c => c.status === 'Down'), circDeg = circ.filter(c => c.status === 'Degraded');
  const downDevices = list.filter(b => healthOf(s, b) === 'down').reduce((a, b) => a + b.dev.ec + b.dev.sw + b.dev.ap, 0) + open.filter(i => i.kind === 'apdown').length;
  const suppressed = L.counters.suppressed;
  const clocks = open.map(i => slaClock(i, now));
  const atRisk = clocks.filter(c => c.used > 0.75 && c.resLeft > 0).length, breached = clocks.filter(c => c.resLeft <= 0 || c.respBreached).length;
  const onBackup = list.filter(b => circuitOf(s, b.wan[0]).status !== 'Up').length;

  // every branch on the map
  const points = useMemo(() => D.BRANCHES.map(b => {
    const h = healthOf(s, b); const sc = ids.has(b.id);
    return { id: b.id, b, x: b.x, y: b.y, r: list.length === 1 ? 9 : 3.4, color: sevColor(h), pulse: h === 'down' && sc, flash: sc && !!L.flash[b.id], dim: !sc, label: <span><b>{b.name}</b>, {b.brand}<br /><span className="text-ink3">{b.city}, {b.state}. {h === 'up' ? 'Healthy' : h === 'degraded' ? 'Degraded' : 'Down'}. Click for Branch 360</span></span> };
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
      <PageHead icon={I.LayoutDashboard} title={bm ? `My branch – ${list[0].name}` : 'Operations Overview'} sub={bm ? `${list[0].brand}, ${list[0].city}, ${list[0].state}. What the NOC sees for your branch, in plain terms.` : 'Live state of the in-scope SRS branch network. Filter by region, brand or branch from the bar above.'}
        right={<><LiveBadge /><Btn icon={I.PlayCircle} onClick={() => act.set({ scenarioPicker: true })}>Run a scenario</Btn><ExportBtn onClick={() => exportCSV('srs-branch-health.csv', list, [{ label: 'Branch ID', key: 'id' }, { label: 'Branch', key: 'name' }, { label: 'Brand', key: 'brand' }, { label: 'City', key: 'city' }, { label: 'State', key: 'state' }, { label: 'Region', key: 'region' }, { label: 'Health', get: b => healthOf(s, b) }, { label: 'Primary', get: b => { const c = circuitOf(s, b.wan[0]); return `${c.carrier} ${c.type} ${c.status}`; } }, { label: 'Backup', get: b => { const c = circuitOf(s, b.wan[1]); return `${c.carrier} ${c.type} ${c.status}`; } }])} /></>} />
      <div className="kpi-strip grid grid-cols-2 md:grid-cols-4 2xl:grid-cols-7">
        <Stat label="Branches open now" icon={I.Store} value={num(openNow)} sub={`of ${num(list.length)}, local hours`} />
        <Stat label="Healthy / degraded / down" icon={I.HeartPulse} value={<span><span className="text-ok">{num(health.up)}</span><span className="text-ink3 text-[18px]"> / </span><span className="text-warn">{health.degraded}</span><span className="text-ink3 text-[18px]"> / </span><span className="text-bad">{health.down}</span></span>}>
          <div className="flex h-1.5 rounded-full overflow-hidden mt-2.5 bg-chip"><span className="bg-ok" style={{ width: `${health.up / list.length * 100}%` }} /><span className="bg-warn" style={{ width: `${health.degraded / list.length * 100}%` }} /><span className="bg-bad" style={{ width: `${health.down / list.length * 100}%` }} /></div>
        </Stat>
        <Stat label="Open incidents" icon={I.Siren} value={<span className="flex items-center gap-2">{open.length}{Object.keys(L.newIncs).length > 0 && <Badge tone="alert" className="pulse-alert">+{Object.keys(L.newIncs).length} new</Badge>}</span>} onClick={() => act.go('incidents')} tone={byPri.P1 ? 'alert' : undefined}>
          <div className="flex gap-1 mt-2">{Object.entries(byPri).map(([p, n]) => <span key={p} className="flex items-center gap-1 text-[11.5px]"><Pri p={p} /><b className="text-ink">{n}</b></span>)}</div>
        </Stat>
        <Stat label="Devices down" icon={I.ServerCrash} value={downDevices} tone={downDevices ? 'red' : 'green'} sub={`of ${num(list.reduce((a, b) => a + b.dev.ec + b.dev.sw + b.dev.ap, 0))} in view`} />
        <Stat label="Circuits down / degraded" icon={I.Cable} value={<span><span className="text-bad">{circDown.length}</span><span className="text-ink3 text-[18px]"> / </span><span className="text-warn">{circDeg.length}</span></span>} sub={`${onBackup} branches on backup path`} onClick={() => act.go('carriers')} />
        <Stat label="Alerts suppressed today" icon={I.BellOff} value={num(suppressed)} sub={`${Math.round(L.series.raw.at(-1))} events/min now, 71% cut`}><Spark data={L.series.raw.slice(-60)} color={C.info} w={150} h={22} className="mt-1.5" /></Stat>
        <Stat label="SLA clocks" icon={I.Timer} value={<span><span className="text-ok">{clocks.length - atRisk - breached}</span><span className="text-ink3 text-[18px]"> / </span><span className="text-warn">{atRisk}</span><span className="text-ink3 text-[18px]"> / </span><span className="text-bad">{breached}</span></span>} sub="on track / at risk / breached" onClick={() => act.go('sla')} />
      </div>

      <div className="grid xl:grid-cols-[minmax(0,1fr)_420px] gap-3 mt-3">
        <Card title="Branch health map" sub={`All 900 branches. Each dot is one branch, coloured by health; pick a region or city above to zoom. Click a branch for Branch 360.`} icon={I.Map} right={<Legend items={[['Healthy', C.ok], ['Degraded', C.warn], ['Down', C.bad]]} />}>
          <NAMap points={points} focus={focusPts} onPoint={p => act.openBranch(p.id)} h={440} />
        </Card>
        <Card title="Open incidents" sub="Sorted by priority, then SLA time left, new ones flash" icon={I.ListOrdered} right={<Btn size="sm" onClick={() => act.go('incidents')}>Queue</Btn>}>
          <div className="space-y-1.5 max-h-[440px] overflow-y-auto pr-1">
            {open.slice().sort((a, b) => a.pri.localeCompare(b.pri) || slaClock(a, now).resLeft - slaClock(b, now).resLeft).slice(0, 14).map(i => {
              const c = slaClock(i, now); const b = D.BR[i.branchId];
              return (
                <button key={i.id} onClick={() => act.openInc(i.id)} className={cx('w-full text-left border rounded-md px-2.5 py-2 hover:bg-chip/70', L.newIncs[i.id] ? 'border-alert/60 bg-alert/5 feed-in' : 'border-line')}>
                  <div className="flex items-center gap-2"><Pri p={i.pri} /><span className="text-[11.5px] font-mono text-ink3">{i.id}</span>{i.major && <Badge tone="alert">MAJOR</Badge>}{L.newIncs[i.id] && <Badge tone="alert">NEW</Badge>}<span className="flex-1" /><span className={cx('text-[11.5px] font-mono font-semibold', c.resLeft < 0 ? 'text-bad' : c.used > 0.75 ? 'text-warn' : 'text-ink2')}>{c.resLeft < 0 ? 'breached' : dur(c.resLeft)}</span></div>
                  <div className="text-[12.5px] text-ink font-semibold mt-0.5 line-clamp-1">{i.title}</div>
                  <div className="text-[11.5px] text-ink3">{b.name}, {b.brand}, {i.state}</div>
                </button>
              );
            })}
            {!open.length && <div className="text-[13px] text-ink3 py-6 text-center">No open incidents in this view.</div>}
          </div>
        </Card>
      </div>

      <div className="grid xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-3 mt-3 items-start">
        <IncidentForecastCard />
        <PreventiveCard />
      </div>


      <div className="grid xl:grid-cols-2 gap-3 mt-3">
        <EventFlowCard />
        <ExperienceCard />
      </div>

      <div className="grid xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-3 mt-3">
        <LiveFeed h={380} />
        <AppsLive open={open} />
      </div>

      <div className="grid xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] gap-3 mt-3">
        <Card title="By region" sub="Click a row to filter the console" icon={I.Globe2}>
          <Table dense rows={regionRows} onRow={r => act.set(st => ({ filters: { ...st.filters, region: r.region, city: 'All', branchId: null } }))} cols={[
            { key: 'region', label: 'Region', render: r => <span className="font-semibold whitespace-nowrap">{r.region}</span> },
            { key: 'n', label: 'Branches', right: true },
            { key: 'openNow', label: 'Open now', right: true },
            { key: 'health', label: 'Health', sortable: false, render: r => <div className="flex h-2 w-28 rounded-full overflow-hidden bg-chip"><span className="bg-ok" style={{ width: `${r.up / r.n * 100}%` }} /><span className="bg-warn" style={{ width: `${r.deg / r.n * 100}%` }} /><span className="bg-bad" style={{ width: `${r.down / r.n * 100}%` }} /></div> },
            { key: 'deg', label: 'Degr.', right: true, render: r => <span className={r.deg ? 'text-warn font-semibold' : 'text-ink3'}>{r.deg}</span> },
            { key: 'down', label: 'Down', right: true, render: r => <span className={r.down ? 'text-bad font-semibold' : 'text-ink3'}>{r.down}</span> },
            { key: 'backup', label: 'On backup', right: true },
            { key: 'inc', label: 'Incidents', right: true },
          ]} />
        </Card>
        <AlertsPerMinCard />
      </div>

      <div className="grid xl:grid-cols-2 gap-3 mt-3">
        <Card title="Circuits down or degraded" icon={I.Cable} right={<Btn size="sm" onClick={() => act.go('carriers')}>Carriers</Btn>}>
          <div className="space-y-1 max-h-[260px] overflow-y-auto">
            {[...circDown, ...circDeg].map(c => { const b = D.BR[c.branchId]; return <button key={c.id} onClick={() => act.openBranch(b.id)} className="w-full text-left flex items-center gap-2 text-[12.5px] py-1 border-b border-line/60 hover:bg-chip/60"><Dot tone={c.status === 'Down' ? 'red' : 'amber'} /><span className="font-semibold text-ink w-28 truncate">{b.name}</span><span className="text-ink2 flex-1 truncate">{c.role}, {c.carrier} {c.type}</span><span className="text-ink3 text-[11.5px]">{c.status}</span></button>; })}
            {!circDown.length && !circDeg.length && <div className="text-ink3 text-[13px]">All circuits clean.</div>}
          </div>
        </Card>
        <Card title="Ticket mix – last 6 months" sub="From the RFP ticket history (3,773 tickets)" icon={I.PieChart}>
          {[['After-hours mended', D.FACTS.tickets6m.afterHours, C.info], ['No trouble found (NTF)', D.FACTS.tickets6m.ntf, C.warn], ['Carrier / LEC', D.FACTS.tickets6m.carrier, C.brand], ['Customer-caused', D.FACTS.tickets6m.customer, C.ai], ['Reboot etc.', D.FACTS.tickets6m.reboot, C.grey]].map(([l, n, c]) => (
            <div key={l} className="py-1"><div className="flex text-[12.5px]"><span className="text-ink flex-1">{l}</span><b className="text-ink">{num(n)}</b><span className="text-ink3 w-12 text-right">{pct(n / D.FACTS.tickets6m.total, 0)}</span></div><div className="h-1.5 bg-chip rounded-full mt-1"><div className="h-full rounded-full" style={{ width: `${n / D.FACTS.tickets6m.total * 100}%`, background: c }} /></div></div>))}
        </Card>
      </div>

      <Modal open={!!cityPick} onClose={() => setCityPick(null)} title={cityPick ? `${cityPick.bs[0].city}, ${cityPick.bs[0].state}` : ''} sub={cityPick ? `${cityPick.bs.length} branches` : ''}>
        {cityPick && <Table dense rows={cityPick.bs} onRow={b => { setCityPick(null); act.openBranch(b.id); }} cols={[{ key: 'h', label: '', sortable: false, render: b => <Dot tone={healthTone(healthOf(s, b))} /> }, { key: 'name', label: 'Branch' }, { key: 'brand', label: 'Brand' }, { key: 'id', label: 'ID' }, { key: 'inc', label: 'Open inc.', get: b => s.incidents.filter(i => i.branchId === b.id && i.state !== 'Resolved').length }]} />}
      </Modal>
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
    { id: 'erp', st: h === 'down' ? 'fail' : has('pos') ? 'fail' : 'pass', detail: h === 'down' ? 'No path' : has('pos') ? 'POS RTT 1.9 s (limit 0.4 s)' : `ERP login 1.${Math.floor(R() * 9)} s, POS RTT ${180 + Math.floor(R() * 120)} ms` },
    { id: 'wifi', st: h === 'down' ? 'fail' : has('apdown') ? 'warn' : 'pass', detail: has('apdown') ? 'One AP offline (yard/warehouse)' : `${b.dev.ap}/${b.dev.ap} APs up` },
    { id: 'scan', st: h === 'down' ? 'fail' : has('scanner') || has('dhcp') ? 'fail' : 'pass', detail: has('dhcp') ? 'Scanners cannot get IP (VLAN 30 scope full)' : has('scanner') ? 'Roaming drops in aisles' : 'All handhelds checked in' },
    { id: 'print', st: h === 'down' ? 'fail' : R() < 0.005 ? 'fail' : 'pass', detail: 'MFP + label printers respond' },
    { id: 'track', st: h === 'down' ? 'fail' : R() < 0.004 ? 'warn' : 'pass', detail: 'Truck tablets / telematics reporting' },
  ];
  res.forEach(r => { r.name = D.READY_CHECKS.find(c => c.id === r.id).name; if (r.id === 'print' && r.st === 'fail') r.detail = 'Label printer offline (warehouse)'; if (r.id === 'track' && r.st === 'warn') r.detail = '1 truck tablet not reporting'; });
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
  const bulk = () => { const targets = shown.slice(0, 40); targets.forEach((r, i) => setTimeout(() => rerun(r.b), i * 120)); act.toast(`Re-running checks on ${targets.length} branches`, 'info'); };

  return (
    <div>
      <PageHead icon={I.Sunrise} title="Branch Readiness" sub="Automated pre-opening checks run at 05:30 local for every branch: SD-WAN, ERP/POS path, Wi-Fi, handheld scanners, printers and delivery-tracking devices."
        right={<><Btn icon={I.RefreshCw} onClick={bulk}>Re-run {view === 'all' ? 'first 40' : 'shown'}</Btn><ExportBtn onClick={() => exportCSV('srs-readiness.csv', rows, [{ label: 'Branch', get: r => r.b.name }, { label: 'Brand', get: r => r.b.brand }, { label: 'Region', get: r => r.b.region }, ...D.READY_CHECKS.map(c => ({ label: c.name, get: r => r.r.results.find(x => x.id === c.id).st }))])} /></>} />
      <div className="kpi-strip grid grid-cols-2 lg:grid-cols-4">
        <Stat label="Ready (all checks pass)" icon={I.CheckCircle2} value={num(passAll)} tone="green" sub={`${pct(passAll / Math.max(1, total))} of ${num(total)}`} />
        <Stat label="Ready with issues" icon={I.AlertTriangle} value={rows.filter(r => r.worst === 'warn').length} tone="amber" sub="can trade; something degraded" />
        <Stat label="Not ready" icon={I.XCircle} value={rows.filter(r => r.worst === 'fail').length} tone="red" sub="needs action before opening" />
        <Card title="Next opening waves" icon={I.Clock} className="!p-0" pad>
          <div className="space-y-1">{waves.map(w => <div key={w.tz} className="flex items-center text-[12px]"><span className="w-12 font-bold text-ink">{w.c.local.split(' ')[1]}</span><span className="text-ink2 flex-1">{w.n} branches, now {w.c.local.split(' ')[0]}</span><Badge tone={w.c.open ? 'green' : 'gray'}>{w.c.open ? 'Open' : w.c.minsToOpen != null ? `opens in ${Math.floor(w.c.minsToOpen / 60)}h ${w.c.minsToOpen % 60}m` : 'Closed'}</Badge></div>)}</div>
        </Card>
      </div>
      <LivePanel kind="readiness" className="mb-3 mt-3" />
      <div className="grid xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-3 mt-3">
        <ReadinessTrendCard />
        <OpeningRiskCard />
      </div>
      <Card title="Pass rate by region and check" sub="Click a cell to list the branches failing that check" icon={I.Grid3x3} className="mt-3">
        <div className="overflow-x-auto"><table className="w-full text-[12.5px]"><thead><tr className="text-ink3 text-left"><th className="py-1.5 pr-2">Region</th>{D.READY_CHECKS.map(c => <th key={c.id} className="px-1 py-1.5 font-semibold">{c.name}<div className="text-[10.5px] font-normal">{c.src}</div></th>)}</tr></thead>
          <tbody>{regionMatrix.map(r => <tr key={r.rg} className="border-t border-line/60"><td className="py-1.5 pr-2 font-semibold text-ink whitespace-nowrap">{r.rg} <span className="text-ink3 font-normal">({r.n})</span></td>{r.cells.map(c => { const v = c.p / c.n; return <td key={c.id} className="px-1 py-1"><button onClick={() => { act.set(st => ({ filters: { ...st.filters, region: r.rg, branchId: null } })); setView('attention'); }} className={cx('w-full rounded px-2 py-1 font-bold text-left', v === 1 ? 'bg-ok/10 text-ok' : v >= 0.97 ? 'bg-warn/10 text-warn' : 'bg-bad/10 text-bad')}>{pct(v, 1)}<span className="font-normal text-ink3 ml-1">{c.n - c.p ? `${c.n - c.p} not passing` : ''}</span></button></td>; })}</tr>)}</tbody></table></div>
      </Card>
      <Section title="Branches" right={<Tabs size="sm" value={view} onChange={setView} tabs={[{ id: 'attention', label: 'Needs attention', count: rows.filter(r => r.worst !== 'pass').length }, { id: 'soon', label: 'Opening in < 3 h', count: rows.filter(r => r.clk.minsToOpen != null && r.clk.minsToOpen < 180).length }, { id: 'all', label: 'All', count: rows.length }]} />}>
        <Card pad={false}><div className="p-3">
          <Table pageSize={25} rows={shown} cols={[
            { key: 'b', label: 'Branch', get: r => r.b.name, render: r => <button onClick={() => act.openBranch(r.b.id)} className="text-left"><div className="font-semibold text-ink hover:underline whitespace-nowrap">{r.b.name}</div><div className="text-[11.5px] text-ink3 truncate max-w-[200px]" title="">{r.b.brand}, {r.b.state}</div></button> },
            { key: 'clk', label: 'Local', get: r => r.clk.local, render: r => <div className="text-[12px] whitespace-nowrap"><div className="font-mono">{r.clk.local}</div><div className="text-ink3">{r.clk.open ? 'Open' : r.clk.minsToOpen != null ? `Opens in ${Math.floor(r.clk.minsToOpen / 60)}h ${r.clk.minsToOpen % 60}m` : 'Closed'}</div></div> },
            ...D.READY_CHECKS.map(c => ({ key: c.id, label: { 'SD-WAN tunnels': 'SD-WAN', 'ERP / POS path': 'ERP/POS', 'Wi-Fi': 'Wi-Fi', 'Handheld scanners': 'Scanners', 'Printers': 'Printers', 'Delivery-tracking devices': 'Trucks' }[c.name.split(' (')[0]] || c.name.split(' (')[0], sortable: false, render: r => { const x = r.r.results.find(y => y.id === c.id); return <span title={x.detail} className="inline-flex">{stIcon(x.st)}</span>; } })),
            { key: 'issue', label: 'First issue', sortable: false, className: 'min-w-[180px]', render: r => <span className="text-[12px] text-ink2">{(r.r.results.find(x => x.st === 'fail') || r.r.results.find(x => x.st === 'warn') || { detail: '—' }).detail}</span> },
            { key: 'at', label: 'Last run', get: r => r.r.at || 0, render: r => <span className="text-[11.5px] text-ink3">{r.r.at ? ago(r.r.at, now) : '05:30 local'}</span> },
            { key: 'act', label: '', sortable: false, render: r => <div className="flex gap-1 justify-end whitespace-nowrap"><Btn size="xs" icon={I.RefreshCw} title="Re-run checks" disabled={running[r.b.id]} onClick={() => rerun(r.b)}>Re-run</Btn>{r.worst !== 'pass' && <Btn size="xs" kind="danger" icon={I.TicketPlus} title="Raise ticket" onClick={() => raise(r.b, r.r)}>Ticket</Btn>}</div> },
          ]} />
        </div></Card>
      </Section>
    </div>
  );
}
