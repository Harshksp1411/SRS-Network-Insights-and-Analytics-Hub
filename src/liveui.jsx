import React, { useState, useMemo } from 'react';
import * as I from 'lucide-react';
import * as D from './data.js';
import { useApp, useNow, inScope } from './store.jsx';
import { useLive } from './live.jsx';
import { Card, Badge, Btn, Tabs, cx, Logo, SRC_LOGO, Dot } from './ui.jsx';
import { LineChart, Bars, Legend, Spark, C } from './charts.jsx';
import { hhmmss, hhmm, num, rng, HR, MIN } from './util.js';

const outTone = o => /New incident/.test(o) ? 'red' : /Auto-res|Auto-heal|Recovered/.test(o) ? 'green' : /Suppress|Duplicate/.test(o) ? 'gray' : /Watch/.test(o) ? 'amber' : 'blue';

export function LiveBadge({ className }) {
  const { L, paused, setPaused } = useLive(); const now = useNow();
  const secs = Math.max(0, Math.round((now - L.last) / 1000));
  return <button type="button" onClick={() => setPaused(p => !p)} title={paused ? 'Resume live updates' : 'Pause live updates (for presenting)'} className={cx('inline-flex items-center gap-1.5 text-[11px] font-bold rounded px-1.5 py-[3px] border', paused ? 'border-line text-ink3' : 'border-ok/40 text-ok bg-ok/10', className)}>{paused ? <I.Play size={10} /> : <span className="w-1.5 h-1.5 rounded-full bg-ok animate-pulse" />}{paused ? 'PAUSED' : 'LIVE'}<span className="font-normal text-ink3">· {paused ? 'click to resume' : `updated ${secs}s ago`}</span></button>;
}

export function LiveTicker() {
  const { L, paused, setPaused } = useLive(); const { s, act } = useApp();
  const ev = L.feed[0];
  const perMin = Math.round(L.series.raw.at(-1));
  return (
    <div className="bg-black text-white px-5 h-8 flex items-center gap-4 text-[12px] overflow-hidden border-b border-white/10">
      <button onClick={() => setPaused(p => !p)} title={paused ? 'Resume live stream' : 'Pause live stream (for demos)'} className={cx('flex items-center gap-1.5 font-black text-[11px] rounded px-1.5 py-0.5 shrink-0', paused ? 'bg-white/20' : 'bg-[#c8343a]')}>{paused ? <I.Play size={11} /> : <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}{paused ? 'PAUSED' : 'LIVE'}</button>
      <span className="shrink-0 opacity-80"><b className="opacity-100">{perMin}</b> events/min</span>
      <span className="shrink-0 opacity-80"><b className="opacity-100">{num(L.counters.events)}</b> events today</span>
      <span className="shrink-0 opacity-80"><b className="opacity-100">{num(L.counters.suppressed)}</b> suppressed</span>
      <span className="shrink-0 opacity-80"><b className="opacity-100">{L.counters.autoRes}</b> auto-resolved</span>
      <span className="opacity-40">|</span>
      {ev && <button key={ev.id} onClick={() => ev.inc ? act.openInc(ev.inc) : act.openBranch(ev.branchId)} className="flex items-center gap-2 min-w-0 ticker-in text-left hover:underline">
        <span className="font-mono opacity-60 shrink-0">{hhmmss(ev.t)}</span><span className="font-bold shrink-0">{ev.src}</span><span className="truncate opacity-90">{D.BR[ev.branchId].name}, {ev.msg}</span><span className="shrink-0 opacity-70">→ {ev.out}</span>
      </button>}
    </div>
  );
}

export function LiveFeed({ h = 360, compact }) {
  const { L } = useLive(); const { s, act } = useApp();
  const [f, setF] = useState('all');
  const items = L.feed.filter(e => inScope(s, e.branchId) && (f === 'all' || (f === 'action' ? !/Suppress|Duplicate|OK|Info/.test(e.out) : /Suppress|Duplicate/.test(e.out)))).slice(0, 40);
  return (
    <Card title="Live event stream" sub="OpsRamp, Aruba Central, Orchestrator and New Relic, with the correlation outcome" icon={I.Radio} right={<Tabs size="sm" value={f} onChange={setF} tabs={[{ id: 'all', label: 'All' }, { id: 'action', label: 'Actioned' }, { id: 'sup', label: 'Suppressed' }]} />}>
      <div className="overflow-y-auto pr-1 space-y-1" style={{ maxHeight: h }}>
        {items.map(e => { const b = D.BR[e.branchId]; return (
          <button key={e.id} onClick={() => e.inc ? act.openInc(e.inc) : act.openBranch(e.branchId)} className="w-full text-left flex gap-2 items-start text-[12px] py-1.5 border-b border-line/60 feed-in hover:bg-chip/60 rounded px-1">
            <span className="font-mono text-ink3 w-[58px] shrink-0">{hhmmss(e.t)}</span>
            <span className="w-[74px] shrink-0">{SRC_LOGO[e.src] ? <Logo k={SRC_LOGO[e.src]} h={10} /> : <span className="text-[11px] font-bold text-ai">{e.src}</span>}</span>
            <span className="flex-1 min-w-0"><span className="font-semibold text-ink">{b.name}</span> <span className="text-ink3">{b.brand}</span><span className="block text-ink2 truncate">{e.msg}</span></span>
            <Badge tone={outTone(e.out)} title={e.out} className="shrink-0 max-w-[150px] truncate">{e.out.split(' – ')[0]}</Badge>
          </button>); })}
        {!items.length && <div className="text-ink3 text-[12.5px] py-6 text-center">No events in this view yet – they will stream in.</div>}
      </div>
    </Card>
  );
}

function rangeSeries(key, base, vol, n, seed) { const R = rng(seed); let v = base; return Array.from({ length: n }, (_, i) => { v = v + (base - v) * 0.2 + (R() - 0.5) * vol * 2 + (key === 'day' ? Math.sin(i / n * Math.PI * 2 - 1.2) * base * 0.35 : 0); return Math.max(0, +v.toFixed(1)); }); }

export function EventFlowCard() {
  const { L } = useLive(); const now = useNow();
  const [r, setR] = useState('live');
  const data = useMemo(() => {
    if (r === 'live') return { labels: L.ts.map(t => hhmmss(t)), raw: L.series.raw, corr: L.series.corr };
    if (r === '1h') { const raw = rangeSeries('h', 52, 9, 60, 11); return { labels: raw.map((_, i) => hhmm(now - (59 - i) * MIN)), raw, corr: raw.map(x => +(x * 0.29).toFixed(1)) }; }
    const raw = rangeSeries('day', 48, 6, 96, 12); return { labels: raw.map((_, i) => hhmm(now - (95 - i) * 15 * MIN)), raw, corr: raw.map(x => +(x * 0.29).toFixed(1)) };
  }, [r, r === 'live' ? L.ts.at(-1) : 0]);
  const cut = 1 - data.corr.at(-1) / Math.max(1, data.raw.at(-1));
  return (
    <Card title="Event flow" sub="Raw events per minute vs what is left after correlation, suppression and de-dup" icon={I.Filter} right={<Tabs size="sm" value={r} onChange={setR} tabs={[{ id: 'live', label: 'Live 5 m' }, { id: '1h', label: '1 h' }, { id: '24h', label: '24 h' }]} />}>
      <div className="flex gap-5 mb-1 text-[12px]"><div><div className="text-[22px] font-extrabold text-ink leading-none">{Math.round(data.raw.at(-1))}</div><div className="text-ink3">raw / min</div></div><div><div className="text-[22px] font-extrabold text-info leading-none">{Math.round(data.corr.at(-1))}</div><div className="text-ink3">after correlation</div></div><div><div className="text-[22px] font-extrabold text-ok leading-none">{Math.round(cut * 100)}%</div><div className="text-ink3">noise removed (KPI ≥ 50%)</div></div></div>
      <LineChart series={[{ name: 'Raw events / min', data: data.raw, color: C.grey }, { name: 'After correlation', data: data.corr, color: C.info }]} labels={data.labels} h={170} yFmt={v => Math.round(v)} yMin={0} />
    </Card>
  );
}

export function ExperienceCard() {
  const { L } = useLive();
  const S = L.series;
  const tiles = [
    ['POS path p95', `${Math.round(S.pos.at(-1))} ms`, S.pos, S.pos.at(-1) > 400 ? C.bad : S.pos.at(-1) > 260 ? C.warn : C.ok],
    ['Packet loss, fleet', `${S.loss.at(-1).toFixed(2)}%`, S.loss, S.loss.at(-1) > 1 ? C.warn : C.ok],
    ['SD-WAN tunnels up', `${num(Math.round(S.tunnels.at(-1)))} / 1,866`, S.tunnels, C.info],
    ['Fleet WAN latency', `${Math.round(S.wan.at(-1))} ms`, S.wan, S.wan.at(-1) > 32 ? C.warn : C.ok],
  ];
  return (
    <Card title="Branch experience – live" sub="Synthetic probes from every EdgeConnect, 2-second refresh" icon={I.Activity}>
      <div className="grid grid-cols-2 gap-2 mb-2">{tiles.map(([l, v, ser, c]) => <div key={l} className="border border-line rounded-md p-2"><div className="text-[11.5px] text-ink3 font-semibold">{l}</div><div className="flex items-end justify-between gap-2"><div className="text-[17px] font-extrabold text-ink leading-tight tabular-nums">{v}</div><Spark data={ser.slice(-60)} color={c} w={90} h={26} /></div></div>)}</div>
      <LineChart series={[{ name: 'POS path p95 (ms)', data: S.pos, color: C.s1 }]} labels={L.ts.map(t => hhmmss(t))} h={120} yFmt={v => Math.round(v)} refLines={[{ v: 400, label: 'POS threshold 400 ms', color: C.bad }]} yMin={100} />
    </Card>
  );
}

export function AlertsPerMinCard() {
  const { L } = useLive();
  const S = L.series;
  const data = Array.from({ length: 30 }, (_, k) => { const i = S.crit.length - 30 + k; return { label: k % 5 === 0 ? hhmmss(L.ts[i]).slice(0, 5) : '', Critical: Math.round(S.crit[i]), Major: Math.round(S.major[i]), Minor: Math.round(S.minor[i]) }; });
  return (
    <Card title="Alerts per minute – live" sub="After correlation, by severity" icon={I.BarChart3} right={<Legend items={[['Critical', C.bad], ['Major', C.warn], ['Minor', C.minor]]} />}>
      <Bars data={data} keys={['Critical', 'Major', 'Minor']} colors={[C.bad, C.warn, C.minor]} h={170} />
    </Card>
  );
}

export function AppsLive({ open }) {
  const { L } = useLive();
  const S = L.series;
  const rows = [['erp', 'ERP login', S.erp, v => `${v.toFixed(2)} s`], ['pos', 'POS / payments', S.pos, v => `${Math.round(v)} ms`], ['pricing', 'Pricing & quoting', S.erp.map(x => x * 0.62), v => `${v.toFixed(2)} s`], ['roofhub', 'Roof Hub', S.roofhub, v => `${v.toFixed(2)} s`], ['dispatch', 'Delivery tracking', S.dispatch, v => `${v.toFixed(2)} s`], ['scan', 'Scanner roam failures', S.scan, v => `${v.toFixed(1)}/min`], ['voice', 'Voice MOS', S.voice, v => v.toFixed(2)], ['m365', 'Microsoft 365', S.m365, v => `${Math.round(v)} ms`]];
  return (
    <Card title="Business apps from branches – live" sub="Fleet p95 from synthetic probes" icon={I.AppWindow}>
      {rows.map(([id, label, ser, f]) => { const a = D.APPS.find(x => x.id === id); const bad = open.filter(i => i.impact && i.impact.join(' ').toLowerCase().includes((a ? a.short : label).toLowerCase().split(/[ /]/)[0])).length; return (
        <div key={id} className="flex items-center gap-2 py-1.5 border-b border-line/60 last:border-0 text-[12.5px]"><Dot tone={bad ? 'amber' : 'green'} /><span className="flex-1 text-ink font-semibold">{label}</span><span className="text-ink3 text-[11px]">{bad ? `${bad} branch${bad > 1 ? 'es' : ''}` : ''}</span><span className="font-mono text-ink text-[12px] w-16 text-right tabular-nums">{f(ser.at(-1))}</span><Spark data={ser.slice(-60)} color={bad ? C.warn : C.ok} w={80} h={22} /></div>); })}
    </Card>
  );
}

// Module live panel: a moving chart, three live figures and the module's own event stream.
const P = {
  readiness: { title: 'Pre-opening probes – live', sub: 'Synthetic checks from every EdgeConnect: POS path, ERP path, tunnels, DHCP', cats: ['readiness'], chart: [['probes', 'Probes passing (%)', C.ok]], yMin: 95,
    stats: [['Probes passing', 'probes', v => `${v.toFixed(1)}%`, C.ok], ['POS path p95', 'pos', v => `${Math.round(v)} ms`, C.s1], ['ERP login', 'erp', v => `${v.toFixed(2)} s`, C.info]] },
  inventory: { title: 'Device telemetry – live', sub: 'Aruba Central and OpsRamp: devices reporting, clients, backups', cats: ['inventory'], chart: [['clients', 'Wi-Fi clients connected', C.info]],
    stats: [['Devices reporting', 'reporting', v => `${v.toFixed(1)}%`, C.ok], ['Wi-Fi clients', 'clients', v => num(Math.round(v)), C.info], ['Config backups OK', 'backups', v => `${v.toFixed(1)}%`, C.ok]] },
  carriers: { title: 'Circuit quality – live', sub: 'EdgeConnect Orchestrator path statistics and carrier case updates', cats: ['carriers'], chart: [['wan', 'Fleet WAN latency (ms)', C.s1]],
    stats: [['Fleet WAN latency', 'wan', v => `${Math.round(v)} ms`, C.s1], ['Average loss', 'loss', v => `${v.toFixed(2)}%`, C.warn], ['Tunnels up of 1,866', 'tunnels', v => num(Math.round(v)), C.ok]] },
  dispatch: { title: 'Field activity – live', sub: 'Status updates from the technicians\' field app: en route, on site, visit closed', cats: ['dispatch'], chart: [['enroute', 'Field app updates per minute', C.s1]], yMin: 0,
    stats: [['En route', null, (_, S, L, st) => st.workOrders.filter(w => w.status === 'En route').length, C.info], ['On site', null, (_, S, L, st) => st.workOrders.filter(w => w.status === 'On site').length, C.ok], ['Unassigned', null, (_, S, L, st) => st.workOrders.filter(w => !w.tech).length, C.warn]] },
  changes: { title: 'Change activity – live', sub: 'Validation results from the Network-as-Code pipeline and ServiceNow change records', cats: ['changes', 'automation'], chart: [['chg', 'Change validations per minute', C.ai]], yMin: 0,
    stats: [['Validations / min', 'chg', v => v.toFixed(1), C.ai], ['Runbook success', 'success', v => `${v.toFixed(1)}%`, C.ok], ['Runbook runs / min', 'runs', v => v.toFixed(1), C.info]] },
  vuln: { title: 'Firmware and advisory checks – live', sub: 'Aruba Central firmware inventory and Mova iO matching against HPE Aruba Networking bulletins. Patching runs in after-close windows.', cats: ['vuln'], chart: [['exposed', 'Devices checked per minute', C.info]], yMin: 0,
    stats: [['Devices checked / min', 'exposed', v => num(Math.round(v)), C.info], ['Devices reporting', 'reporting', v => `${v.toFixed(1)}%`, C.ok], ['Next patch window', null, () => '22:00 local', C.ok]] },
  predict: { title: 'Risk signals – live', sub: 'Inputs the prediction models are reading now: errors, PoE, temperature, uplink use, LTE signal', cats: ['predict'], chart: [['risk', 'Fleet risk index', C.warn]],
    stats: [['Fleet risk index', 'risk', v => Math.round(v), C.warn], ['Fleet WAN latency', 'wan', v => `${Math.round(v)} ms`, C.s1], ['Wi-Fi roaming failures', 'scan', v => `${v.toFixed(1)}/min`, C.info]] },
  knowledge: { title: 'Knowledge in use – live', sub: 'Articles suggested to engineers on open tickets, and whether they helped', cats: ['knowledge'], chart: [['kbhits', 'Articles suggested per minute', C.ai]], yMin: 0,
    stats: [['Suggested / min', 'kbhits', v => v.toFixed(1), C.ai], ['Runbook runs / min', 'runs', v => v.toFixed(1), C.info], ['Runbook success', 'success', v => `${v.toFixed(1)}%`, C.ok]] },
  automation: { title: 'Runbook runs – live', sub: 'Every run by Mova iO, with its result', cats: ['automation'], chart: [['runs', 'Runs per minute', C.info]], yMin: 0,
    stats: [['Runs / min', 'runs', v => v.toFixed(1), C.info], ['Success rate', 'success', v => `${v.toFixed(1)}%`, C.ok], ['Auto-resolved today', null, (_, S, L) => L.counters.autoRes, C.ok]] },
  sla: { title: 'Service levels – live', sub: 'Response compliance and time to restore, recalculated as tickets move', cats: ['incidents', 'automation'], chart: [['resp', 'Response within SLA (%)', C.ok]], yMin: 95,
    stats: [['Response within SLA', 'resp', v => `${v.toFixed(1)}%`, C.ok], ['Mean time to restore', 'mttr', v => `${Math.round(v)} min`, C.info], ['Events per minute', 'raw', v => Math.round(v), C.ai]] },
  biab: { title: 'Project activity – live', sub: 'Kit staging, surveys, circuit orders and config generation', cats: ['biab'], chart: [['staged', 'Kit devices pre-staged (%)', C.ok]], yMin: 50,
    stats: [['Kit pre-staged', 'staged', v => `${Math.round(v)}%`, C.ok], ['Field techs on site', 'onsite', v => Math.round(v), C.info], ['Probes passing', 'probes', v => `${v.toFixed(1)}%`, C.ok]] },
  graph: { title: 'Network activity – live', sub: 'Events from every layer of the graph: branches, circuits, devices', cats: ['carriers', 'inventory', 'incidents'], chart: [['raw', 'Events per minute', '#a8a8a8'], ['corr', 'After correlation', C.info]], yMin: 0,
    stats: [['Events / min', 'raw', v => Math.round(v), C.ai], ['Tunnels up of 1,866', 'tunnels', v => num(Math.round(v)), C.ok], ['Fleet WAN latency', 'wan', v => `${Math.round(v)} ms`, C.s1]] },
};
export function LivePanel({ kind, className }) {
  const { L } = useLive(); const { s, act } = useApp();
  const cfg = P[kind]; const S = L.series;
  const all = L.feed.filter(e => cfg.cats.includes(e.cat));
  const scoped = all.filter(e => inScope(s, e.branchId));
  const items = (scoped.length ? scoped : all).slice(0, 9);
  const labels = L.ts.slice(-90).map(t => hhmmss(t));
  return (
    <Card className={className} title={<span className="flex items-center gap-2">{cfg.title}<LiveBadge /></span>} sub={cfg.sub} icon={I.Activity}>
      <div className="grid xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] gap-4">
        <div className="min-w-0">
          <div className="grid grid-cols-3 gap-2 mb-2">{cfg.stats.map(([l, k, f, c]) => { const ser = k ? S[k] : S.raw; return (
            <div key={l} className="border border-line rounded-md px-2.5 py-2 min-w-0"><div className="text-[11.5px] text-ink3 font-semibold truncate">{l}</div>
              <div className="flex items-end justify-between gap-2"><div key={L.last} className="text-[17px] font-bold text-ink leading-tight tabular-nums num-flash whitespace-nowrap">{f(k ? ser.at(-1) : 0, S, L, s)}</div>{k && <Spark data={ser.slice(-60)} color={c} w={84} h={24} />}</div></div>); })}</div>
          <LineChart series={cfg.chart.map(([k, n, c]) => ({ name: n, data: S[k].slice(-90), color: c }))} labels={labels} h={150} yMin={cfg.yMin} yFmt={v => (Math.abs(v) >= 100 ? Math.round(v) : +v.toFixed(1))} />
        </div>
        <div className="min-w-0">
          <div className="text-[12px] font-bold text-ink2 mb-1 flex items-center gap-1.5"><I.Radio size={13} className="text-ok" />Latest events{!scoped.length && all.length ? <span className="font-normal text-ink3">(fleet-wide; none in this filter yet)</span> : null}</div>
          <div className="space-y-0.5 max-h-[232px] overflow-y-auto pr-1">{items.map(e => { const b = D.BR[e.branchId]; return (
            <button key={e.id} onClick={() => e.inc ? act.openInc(e.inc) : act.openBranch(e.branchId)} className="w-full text-left flex gap-2 items-start text-[12px] py-1 border-b border-line/60 feed-in hover:bg-chip/60 rounded px-1">
              <span className="font-mono text-ink3 w-[54px] shrink-0">{hhmmss(e.t)}</span>
              <span className="flex-1 min-w-0"><span className="text-ink2">{SRC_LOGO[e.src] ? <Logo k={SRC_LOGO[e.src]} h={9} className="mr-1 align-[-1px]" /> : <b className="text-ai mr-1">{e.src}</b>}</span><span className="text-ink">{e.msg}</span><span className="text-ink3"> · {b.name}</span></span>
              <Badge tone={outTone(e.out)} title={e.out} className="shrink-0 max-w-[150px] truncate">{e.out.split(' – ')[0]}</Badge></button>); })}
            {!items.length && <div className="text-ink3 text-[12.5px] py-4">Events will stream in.</div>}</div>
        </div>
      </div>
    </Card>
  );
}
