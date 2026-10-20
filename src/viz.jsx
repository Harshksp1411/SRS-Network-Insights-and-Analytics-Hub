// Predictive and preventive panels used across modules.
import React, { useState, useMemo } from 'react';
import * as I from 'lucide-react';
import * as D from './data.js';
import * as P from './predict.js';
import { useApp, useNow, slaClock, inScope, healthOf } from './store.jsx';
import { useLive } from './live.jsx';
import { Card, Badge, Btn, Tabs, cx, Dot, Pri, Progress } from './ui.jsx';
import { LineChart, Bars, Legend, Spark, C, HBars, Heatmap, Donut, RiskMatrix, Ring } from './charts.jsx';
import { num, pct, dur, ago, hhmm, dt, dateShort, MIN, HR, DAY } from './util.js';

const Pct = ({ p }) => <span className={cx('font-semibold tabular', p >= 0.7 ? 'text-bad' : p >= 0.45 ? 'text-warn' : 'text-ink2')}>{Math.round(p * 100)}%</span>;
const ModelNote = ({ children }) => <div className="text-[11.5px] text-ink3 mt-2 leading-snug">{children}</div>;

// ─────────────── Overview ───────────────
export function IncidentForecastCard() {
  const { s } = useApp(); const now = useNow();
  const storm = s.incidents.some(i => i.major && i.state !== 'Resolved');
  const f = useMemo(() => P.incidentForecast(now, storm ? 2.5 : 0), [Math.floor(now / 60000), storm]);
  const next12 = f.fc.slice(24).reduce((a, b) => a + b, 0);
  const peak = f.fc.slice(24).reduce((m, v, i) => v > m.v ? { v, i } : m, { v: 0, i: 0 });
  return (
    <Card title="Incident outlook, next 12 hours" sub="Last 24 hours of new incidents and the model forecast, with the 80% likely range">
      <div className="flex flex-wrap gap-x-6 gap-y-1 mb-1 text-[12.5px]">
        <div><span className="font-display text-[24px] font-semibold text-ink">{Math.round(next12)}</span> <span className="text-ink3">expected new incidents</span></div>
        <div><span className="font-display text-[24px] font-semibold text-ink">{f.labels[24 + peak.i]}</span> <span className="text-ink3">busiest hour</span></div>
        <div><span className="font-display text-[24px] font-semibold text-ink">{storm ? 'High' : 'Normal'}</span> <span className="text-ink3">weather risk (DFW)</span></div>
      </div>
      <LineChart labels={f.labels} series={[{ name: 'New incidents', data: f.actual, color: C.s1 }, { name: 'Forecast', data: f.fc, color: C.s1, forecastFrom: 23 }]} band={{ lo: f.lo, hi: f.hi, color: C.s1 }} forecastFrom={23} h={190} yMin={0} yFmt={v => Math.round(v)} />
      <div className="flex items-center justify-between mt-1"><Legend items={[['Actual', C.s1], ['Forecast', C.s1, true], ['Likely range', '#d6dee8']]} /><span className="text-[11.5px] text-ink3">Model: seasonal hourly + weather + open changes</span></div>
    </Card>
  );
}

export function PreventiveCard() {
  const { s, act } = useApp(); const now = useNow();
  const cal = P.preventiveCalendar(now).filter(x => x.day <= 2);
  const counts = [
    ['Proactive carrier cases', s.cases.filter(c => /proactive/i.test(c.status)).length + 3, 'carriers'],
    ['Predicted failures with a watch', s.predictions.filter(p => p.status === 'Watching').length + s.watches.length, 'predict'],
    ['Preventive changes this week', s.changes.filter(c => c.start > now && c.start < now + 7 * DAY).length, 'changes'],
    ['Spares pre-staged for risk', 6, 'dispatch'],
  ];
  return (
    <Card title="Prevention in flight" sub="Work scheduled to stop the next outage before a branch notices" right={<Btn size="sm" onClick={() => act.go('predict')}>Watchlist</Btn>}>
      <div className="grid grid-cols-2 gap-px bg-line border border-line rounded-[4px] overflow-hidden mb-3">
        {counts.map(([l, n, m]) => <button key={l} onClick={() => act.go(m)} className="bg-panel px-3 py-2 text-left hover:bg-chip/60"><div className="font-display text-[22px] font-semibold text-ink leading-none">{n}</div><div className="text-[12px] text-ink2 mt-1">{l}</div></button>)}
      </div>
      <div className="text-[12.5px] font-semibold text-ink mb-1">Next 48 hours</div>
      <div className="divide-y divide-line/70">
        {cal.map(x => <div key={x.id} className="flex items-center gap-2 py-1.5 text-[12.5px]"><span className="w-[74px] shrink-0 text-ink3 tabular">{x.day === 0 ? 'Tonight' : x.day === 1 ? 'Tomorrow' : dateShort(x.when)} {x.t}</span><span className="flex-1 min-w-0 truncate text-ink">{x.what}{x.b && <span className="text-ink3">, {x.b.name}</span>}</span><Badge>{x.kind}</Badge></div>)}
      </div>
    </Card>
  );
}

export function RegionHourHeat() {
  const v = useMemo(() => P.regionHourHeat(), []);
  return (
    <Card title="When incidents happen" sub="New incidents by region and hour of day (CT), last 7 days. Evenings and early mornings dominate – most incidents are fixed after hours.">
      <Heatmap rows={D.REGIONS} cols={Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'))} values={v} colLabelEvery={3} cell={22} rowW={150} fmt={x => `${x} incidents`} />
    </Card>
  );
}

// ─────────────── Readiness ───────────────
export function ReadinessTrendCard() {
  const now = useNow(); const t = useMemo(() => P.readinessTrend(now), []);
  return (
    <Card title="Ready at opening, 14 days" sub="Share of branches passing every pre-opening check">
      <LineChart labels={t.map(x => x.label)} series={[{ name: 'All checks pass', data: t.map(x => x.pass), color: C.s1, area: true }]} h={170} yFmt={v => `${v.toFixed(1)}%`} refLines={[{ v: 96, label: 'Target 96%', color: C.ok }]} />
      <ModelNote>The dip 4 days ago was the Spectrum HFC outage in Columbus; 11 branches opened on LTE.</ModelNote>
    </Card>
  );
}
export function OpeningRiskCard() {
  const { s, act } = useApp();
  const rows = P.openingRisk(s).filter(r => inScope(s, r.id));
  const [done, setDone] = useState({});
  return (
    <Card title="Tomorrow's opening risk" sub="Branches the model expects to fail a pre-opening check, and the preventive step to take tonight">
      <div className="divide-y divide-line/70">
        {rows.map(r => <div key={r.id + r.kind} className="py-2 flex items-start gap-3 text-[12.5px]">
          <div className="w-12 shrink-0 pt-0.5"><Pct p={r.p} /></div>
          <div className="flex-1 min-w-0"><button onClick={() => act.openBranch(r.b.id)} className="font-semibold text-ink hover:underline">{r.b.name}</button> <span className="text-ink3">{r.b.brand}</span><div className="text-ink2">{r.why}</div><div className="text-ink3">Prevent: {r.action}</div></div>
          {done[r.id + r.kind] ? <Badge tone="green"><I.Check size={11} />Scheduled</Badge> : <Btn size="xs" onClick={() => { setDone(d => ({ ...d, [r.id + r.kind]: true })); act.audit(`Preventive step scheduled for ${r.b.name}: ${r.action}`, r.id); act.toast(`Scheduled for tonight: ${r.action}`); }}>Schedule</Btn>}
        </div>)}
      </div>
    </Card>
  );
}

// ─────────────── Incidents ───────────────
export function QueueForecastCard() {
  const now = useNow(); const d = useMemo(() => P.queueForecast(now), [Math.floor(now / 600000)]);
  const tot = d.reduce((a, x) => a + x.P1 + x.P2 + x.P3 + x.P4, 0);
  return (
    <Card title="Expected arrivals, next 8 hours" sub={`About ${tot} new incidents; the evening shift carries most of it`} right={<Legend items={[['P1', C.bad], ['P2', C.serious], ['P3', C.s4], ['P4', C.grey]]} />}>
      <Bars data={d} keys={['P1', 'P2', 'P3', 'P4']} colors={[C.bad, C.serious, C.s4, C.grey]} h={150} />
    </Card>
  );
}
export function BreachRiskCard() {
  const { s, act } = useApp(); const now = useNow();
  const rows = s.incidents.filter(i => i.state !== 'Resolved' && inScope(s, i.branchId)).map(i => ({ i, p: P.breachProb(i, slaClock(i, now)) })).sort((a, b) => b.p - a.p).slice(0, 6);
  return (
    <Card title="Most likely to breach" sub="Probability the resolution SLA is missed, from time used and how this kind of incident usually goes">
      <div className="space-y-1.5">{rows.map(({ i, p }) => <button key={i.id} onClick={() => act.openInc(i.id)} className="w-full flex items-center gap-2 text-[12.5px] hover:bg-chip/60 rounded px-1 py-0.5 text-left"><Pri p={i.pri} /><span className="font-mono text-[11.5px] text-ink3 w-[84px] shrink-0">{i.id}</span><span className="flex-1 truncate text-ink">{i.title}</span><span className="w-24 shrink-0"><Progress value={p} tone={p >= 0.7 ? 'red' : p >= 0.45 ? 'amber' : 'blue'} h={5} /></span><span className="w-10 text-right"><Pct p={p} /></span></button>)}</div>
    </Card>
  );
}
const METRIC = {
  circuit: ['Primary path packet loss', '%', 0.1, 100, 0.08], jitter: ['Primary path jitter', 'ms', 3.2, 38, 0.8], pos: ['POS path p95', 'ms', 210, 1900, 18],
  apdown: ['Clients on the AP', '', 18, 0, 3], crc: ['Uplink CRC errors per 5 min', '', 2, 1240, 2], lte: ['Backup path loss', '%', 0.1, 100, 0.08],
  scanner: ['SRS-SCAN deauths per 10 min', '', 3, 41, 1.2], dhcp: ['VLAN 30 scope used', '%', 62, 100, 1.5], backup: ['Backup jobs succeeding', '%', 100, 83, 0.4],
  cpu: ['Core switch CPU', '%', 22, 94, 3], edgedown: ['EdgeConnect heartbeats per 5 min', '', 10, 0, 0.3],
};
export function IncidentTelemetryCard({ inc }) {
  const now = useNow();
  const m = METRIC[inc.kind] || (/jitter|POS/i.test(inc.title) ? METRIC.jitter : /EdgeConnect|unreachable/i.test(inc.title) ? METRIC.circuit : METRIC.circuit);
  const [label, unit, base, fault, noise] = m;
  const step = 5 * MIN, before = 24, total = 48;
  const start = inc.opened - before * step;
  const fixed = inc.state === 'Resolved' || inc.rbState === 'done';
  const pts = useMemo(() => { let seed = inc.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0); const r = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }; return Array.from({ length: total }, (_, i) => { const t = start + i * step; const n = (r() - 0.5) * 2 * noise; if (t > now) return null; if (i < before - 2) return +(base + n).toFixed(1); if (i < before) return +(base + (fault - base) * 0.25 * (i - before + 3) + n).toFixed(1); const endT = inc.resolved || (fixed ? inc.opened + 40 * MIN : Infinity); if (t > endT) return +(base + n).toFixed(1); return +(fault + n * 3).toFixed(1); }); }, [inc.id, inc.state, inc.rbState, Math.floor(now / step)]);
  const labels = pts.map((_, i) => hhmm(start + i * step));
  const lo = pts.map(() => +(base - noise * 3).toFixed(1)), hi = pts.map(() => +(base + noise * 3).toFixed(1));
  const ttr = P.predictedTTR(inc); const eta = inc.opened + ttr; const bp = P.breachProb(inc, slaClock(inc, now));
  const f = v => `${Math.round(v * 10) / 10}${unit ? ' ' + unit : ''}`;
  return (
    <Card title={`${label}, ${inc.ci}`} sub="Two hours either side of the incident. Shaded band is this device's normal range for the time of day.">
      <div className="flex flex-wrap gap-x-6 gap-y-1 mb-1 text-[12.5px]">
        <div><span className="font-display text-[22px] font-semibold text-ink">{f(pts.filter(v => v != null).at(-1) ?? base)}</span> <span className="text-ink3">now, normal {f(base)}</span></div>
        <div><span className="font-display text-[22px] font-semibold text-ink">{inc.state === 'Resolved' ? 'Restored' : hhmm(eta)}</span> <span className="text-ink3">{inc.state === 'Resolved' ? '' : 'predicted restore (CT)'}</span></div>
        <div><span className={cx('font-display text-[22px] font-semibold', bp >= 0.6 ? 'text-bad' : bp >= 0.35 ? 'text-warn' : 'text-ok')}>{Math.round(bp * 100)}%</span> <span className="text-ink3">chance of SLA breach</span></div>
      </div>
      <LineChart labels={labels} series={[{ name: label, data: pts, color: C.s2 }]} band={{ lo, hi, color: C.s3 }} refLines={[{ v: base, label: 'normal', color: C.ok }]} h={170} yMin={Math.min(base, fault) >= 0 ? 0 : undefined} yFmt={v => Math.round(v)} />
    </Card>
  );
}

export function PreventRecurrence({ inc }) {
  const { act } = useApp();
  const [done, setDone] = useState({});
  const recs = {
    'Carrier / LEC': [['Add circuit to carrier monthly review', 'carrier'], ['Open problem record for repeat LEC faults', 'problem'], ['Order diverse backup (different carrier)', 'change']],
    Wireless: [['Push channel plan + 2.4 GHz scanner profile to site', 'change'], ['Pre-stage spare AP at nearest depot', 'spare'], ['Add RF survey to next site visit', 'visit']],
    Switching: [['Enable BPDU guard on access ports (template)', 'change'], ['Replace optics on uplinks with rising CRC', 'spare']],
    'Customer-caused': [['Enable BPDU guard on back-office ports', 'change'], ['Add IPAM check to device rollout runbook', 'kb']],
    'SD-WAN': [['Pre-stage spare EdgeConnect at nearest depot', 'spare'], ['Open problem record with Aruba TAC', 'problem']],
    'Config management': [['Move backup window off TACACS+ peak', 'change'], ['Open problem record with Security', 'problem']],
  }[inc.cat] || [['Open problem record', 'problem'], ['Write KB from this incident', 'kb']];
  return (
    <Card title="Prevent it happening again" sub="Suggested by the Knowledge and Change Validation agents from similar incidents">
      {recs.map(([t, k]) => <div key={t} className="flex items-center gap-2 py-1.5 border-b border-line/60 last:border-0 text-[12.5px]"><I.ShieldPlus size={15} className="text-ink3 shrink-0" /><span className="flex-1 text-ink">{t}</span>{done[t] ? <Badge tone="green">Raised</Badge> : <Btn size="xs" onClick={() => { setDone(d => ({ ...d, [t]: true })); if (k === 'problem') act.add('problems', { id: `PRB000${4300 + Math.floor(Math.random() * 99)}`, title: `${inc.title} (from ${inc.id})`, incidents: 1, state: 'New', owner: 'Network Eng L3', opened: Date.now() }); act.audit(`Preventive action raised from ${inc.id}: ${t}`, inc.id); act.toast(`Raised: ${t}`); }}>Raise</Btn>}</div>)}
    </Card>
  );
}

// ─────────────── Inventory ───────────────
export function FirmwareMixCard() {
  const rows = useMemo(() => { const g = {}; D.DEVICES.forEach(d => { const k = d.type === 'AP' ? 'Access points' : d.model === 'EC-XS' ? 'EdgeConnect EC-XS' : d.model === '2530' ? '2530 (AOS-S)' : `CX ${d.model}`; const l = D.FW_TARGET[d.type === 'AP' ? 'AP' : d.model].indexOf(d.fw); (g[k] = g[k] || { label: k, N: 0, 'N-1': 0, 'N-2': 0, Older: 0 }); g[k][['N', 'N-1', 'N-2', 'Older'][l]]++; }); return Object.values(g); }, []);
  const ord = ['#184f95', '#3987e5', '#a9bcd0', C.bad];
  return (
    <Card title="Firmware levels by platform" sub="Share of devices at the target release (N) and behind it" right={<Legend items={[['N', ord[0]], ['N-1', ord[1]], ['N-2', ord[2]], ['Older', ord[3]]]} />}>
      <div className="space-y-2.5">{rows.map(r => { const t = r.N + r['N-1'] + r['N-2'] + r.Older; return <div key={r.label} className="text-[12.5px]"><div className="flex justify-between"><span className="text-ink">{r.label}</span><span className="text-ink3 tabular">{num(t)} devices</span></div><div className="flex h-3 gap-[2px] mt-1">{['N', 'N-1', 'N-2', 'Older'].map((k, j) => r[k] > 0 && <span key={k} title={`${k}: ${r[k]}`} className={cx(j === 0 && 'rounded-l-[3px]', j === 3 && 'rounded-r-[3px]')} style={{ width: `${r[k] / t * 100}%`, background: ord[j] }} />)}</div></div>; })}</div>
    </Card>
  );
}
export function WarrantyCard() {
  const now = useNow(); const q = useMemo(() => P.warrantyByQuarter(now), []);
  return (
    <Card title="Warranty ending, next 8 quarters" sub="Plan refresh budgets before support lapses" right={<Legend items={[['EdgeConnect', C.s1], ['Switches', C.s2], ['APs', C.s3]]} />}>
      <Bars data={q.map(x => ({ ...x, EdgeConnect: x['SD-WAN'], Switches: x.Switch, APs: x.AP }))} keys={['EdgeConnect', 'Switches', 'APs']} colors={[C.s1, C.s2, C.s3]} h={170} />
    </Card>
  );
}
export function BackupTrendCard() {
  const now = useNow(); const t = useMemo(() => P.backupTrend(now), []);
  return (
    <Card title="Config backup success, 14 days" sub="Annexure B #33: minimum 95%, expected 98%">
      <LineChart labels={t.map(x => x.label)} series={[{ name: 'Success', data: t.map(x => x.v), color: C.s1 }]} h={150} yFmt={v => `${v.toFixed(1)}%`} refLines={[{ v: 98, label: 'Expected 98%', color: C.ok }, { v: 95, label: 'Minimum 95%', color: C.bad }]} yMin={94} yMax={100} />
    </Card>
  );
}
export function DeviceRiskCard() {
  const { act } = useApp(); const rows = useMemo(() => P.deviceRisk(), []);
  const [done, setDone] = useState({});
  return (
    <Card title="Hardware likely to fail in 30 days" sub="From reboots, temperature, fan and PSU telemetry, error counters and age">
      <div className="divide-y divide-line/70">{rows.map(r => <div key={r.id} className="flex items-center gap-3 py-1.5 text-[12.5px]"><span className="w-10"><Pct p={r.p} /></span><span className="font-mono text-[12px] w-[120px] shrink-0 text-ink">{r.id}</span><span className="text-ink3 w-[150px] shrink-0 truncate">{r.b.name}, {r.d.model}</span><span className="flex-1 min-w-0 text-ink2 truncate" title={r.why}>{r.why}</span>{done[r.id] ? <Badge tone="green">Spare staged</Badge> : <Btn size="xs" onClick={() => { setDone(d => ({ ...d, [r.id]: true })); act.audit(`Preventive: ${r.action} (${r.id})`, r.id); act.toast(`${r.action}`); }}>Pre-stage spare</Btn>}</div>)}</div>
    </Card>
  );
}

// ─────────────── Carriers ───────────────
export function CarrierTrendCard() {
  const t = P.carrierMTTRTrend();
  return (
    <Card title="Carrier restore time, 6 months" sub="Mean time to restore in hours, four largest carriers" right={<Legend items={t.series.map(([n], i) => [n, [C.s1, C.s2, C.s3, C.s4][i]])} />}>
      <LineChart labels={t.months} series={t.series.map(([n, d], i) => ({ name: n, data: d, color: [C.s1, C.s2, C.s3, C.s4][i] }))} h={190} yFmt={v => `${v.toFixed(1)} h`} />
      <ModelNote>Spectrum and Lumen are trending the wrong way; both are on the November service review agenda.</ModelNote>
    </Card>
  );
}
export function CarrierHeatCard() {
  const now = useNow(); const h = useMemo(() => P.carrierHeat(now), []);
  return <Card title="Circuit trouble by carrier, 14 days" sub="Circuits with loss above 1% for 5+ minutes, per day"><Heatmap rows={h.rows} cols={h.cols} values={h.values} cell={26} rowW={80} fmt={x => `${x} circuits`} /></Card>;
}
export function CarrierForecastCard() {
  const { act } = useApp(); const rows = P.carrierFaultForecast();
  const [done, setDone] = useState({});
  return (
    <Card title="Circuits likely to fail this week" sub="Raise a proactive case while the branch is still on its primary path">
      <div className="divide-y divide-line/70">{rows.map(r => <div key={r.b.id} className="py-2 flex items-start gap-3 text-[12.5px]"><span className="w-10 pt-0.5"><Pct p={r.p} /></span><div className="flex-1 min-w-0"><span className="font-semibold text-ink">{r.b.name}</span> <span className="text-ink3">{r.carrier}, {r.when}</span><div className="text-ink2">{r.why}</div></div>{done[r.b.id] ? <Badge tone="green">Case open</Badge> : <Btn size="xs" onClick={() => { setDone(d => ({ ...d, [r.b.id]: true })); const no = D.caseNo(r.carrier); act.add('cases', { id: no, carrier: r.carrier, circuit: r.b.wan[0], inc: null, branchId: r.b.id, opened: Date.now(), status: 'Open – proactive (pre-failure)', eta: Date.now() + 24 * HR, lastUpdate: Date.now(), evidence: ['Trend graph', 'Prior outage signature'], escal: 0 }); act.audit(`Proactive ${r.carrier} case ${no} for ${r.b.name}`, no); act.toast(`Proactive case ${no} opened`); }}>{r.act === 'Watch' ? 'Watch' : 'Raise case'}</Btn>}</div>)}</div>
    </Card>
  );
}

// ─────────────── Dispatch ───────────────
export function FieldDemandCard() {
  const { s } = useApp(); const now = useNow(); const storm = s.incidents.some(i => i.major && i.state !== 'Resolved');
  const f = useMemo(() => P.fieldDemand(now, true), [Math.floor(now / 3600000)]);
  return (
    <Card title="Field visits, last and next 7 days" sub="Forecast includes the hail outlook for Texas and Oklahoma (post-storm site checks)">
      <LineChart labels={f.labels} series={[{ name: 'Visits', data: f.actual, color: C.s1 }, { name: 'Forecast', data: f.fc, color: C.s1, forecastFrom: 7 }]} band={{ lo: f.lo, hi: f.hi, color: C.s1 }} forecastFrom={7} h={180} yMin={0} yFmt={v => Math.round(v)} nowLabel="today" />
    </Card>
  );
}
export function SparesCoverCard() {
  const { s, act } = useApp();
  const rows = s.depots.map(d => { const days = Math.min(...Object.entries(d.spares).map(([k, v]) => v / (P.SPARE_USE[k] || 0.2) * 7)); const worst = Object.entries(d.spares).sort((a, b) => a[1] / (P.SPARE_USE[a[0]] || 0.2) - b[1] / (P.SPARE_USE[b[0]] || 0.2))[0]; return { label: d.city, sub: `tightest: ${worst[0]}`, value: Math.round(days), color: days < 14 ? C.bad : days < 30 ? C.s4 : C.s1, mark: 21, markLabel: '21-day target' }; }).sort((a, b) => a.value - b.value);
  return (
    <Card title="Spares cover by depot" sub="Days until the tightest spare runs out at the forecast usage; black tick is the 21-day target" right={<Btn size="sm" onClick={() => { act.audit('Restock orders raised for depots under 21 days cover', 'depots'); act.toast('Restock raised for depots under 21 days'); }}>Restock under 21 days</Btn>}>
      <HBars rows={rows} fmt={v => `${v} d`} labelW={140} />
    </Card>
  );
}
export function TechUtilCard() {
  const { s } = useApp();
  const rows = D.REGIONS.map(r => { const ts = s.techs.filter(t => t.region === r); const busy = ts.filter(t => t.status !== 'Available').length; return { label: r, value: ts.length ? Math.round(busy / ts.length * 100) : 0, sub: `${ts.length} techs` }; });
  return <Card title="Technician load by region" sub="Share of technicians on a job or off shift right now"><HBars rows={rows} fmt={v => `${v}%`} max={100} labelW={160} /></Card>;
}

// ─────────────── Changes ───────────────
export function ChangeTrendCard() {
  return (
    <Card title="Change outcomes, 6 months" right={<Legend items={[['Successful', C.s1], ['Rolled back', C.s4], ['Failed', C.bad]]} />}>
      <Bars data={P.changeTrend()} keys={['Successful', 'Rolled back', 'Failed']} colors={[C.s1, C.s4, C.bad]} h={170} />
      <ModelNote>Success rate 96.8% this month. Rollbacks were planned exits triggered by canary checks.</ModelNote>
    </Card>
  );
}
export function RiskHistCard() {
  return <Card title="Change risk scores, last 90 days" sub="Change Impact Analyzer score; above 60 needs CAB plus a canary"><Bars data={P.riskHistogram()} keys={['Changes']} colors={[C.s1]} h={160} /></Card>;
}
export function FirmwareProjectionCard({ cur }) {
  const f = P.firmwareProjection(cur);
  return (
    <Card title="Firmware compliance projection" sub="If the scheduled waves run as planned. Annexure B #32 expects 98%.">
      <LineChart labels={f.labels} series={[{ name: 'Compliant', data: f.actual, color: C.s1 }, { name: 'Projection', data: f.fc, color: C.s1, forecastFrom: 5 }]} band={{ lo: f.lo, hi: f.hi, color: C.s1 }} forecastFrom={5} h={180} yFmt={v => `${(v * 100).toFixed(0)}%`} refLines={[{ v: 0.98, label: 'Expected 98%', color: C.ok }, { v: 0.92, label: 'Minimum 92%', color: C.bad }]} yMin={0.88} yMax={1} />
    </Card>
  );
}

// ─────────────── Branch-in-a-Box ───────────────
export function ThroughputCard() {
  return (
    <Card title="Branches onboarded per month" sub="Actual to October, then the plan from signed deals and lease dates" right={<Legend items={[['Acquired', C.s7], ['Greenfield', C.s1]]} />}>
      <Bars data={P.onboardingThroughput()} keys={['Acquired', 'Greenfield']} colors={[C.s7, C.s1]} h={170} forecastFrom={6} />
      <ModelNote>November peaks with Mingledorff's wave 2 plus LS Building Products; the kit and gate list stay the same at any volume.</ModelNote>
    </Card>
  );
}
export function SlipCard() {
  const { s } = useApp(); const now = useNow();
  const rows = s.projects.filter(p => p.stage !== 'BAU' && p.stage !== 'Hypercare').map(p => { const v = P.slipProb(p, now); return { label: p.brand, sub: p.site, value: Math.round(v * 100), color: v >= 0.6 ? C.bad : v >= 0.3 ? C.s4 : C.s1 }; }).sort((a, b) => b.value - a.value);
  return <Card title="Chance of missing go-live" sub="From RAG, open blockers, failed gates and time left"><HBars rows={rows} fmt={v => `${v}%`} max={100} labelW={190} /></Card>;
}

// ─────────────── Predictive ───────────────
export function RiskMatrixCard({ onPick }) {
  const { s } = useApp();
  const kinds = { 'Degrading circuit': C.s1, 'Capacity forecast': C.s2, other: C.s3 };
  const impact = { 'Degrading circuit': 0.78, 'AP failure risk': 0.42, 'Switch failure risk': 0.7, 'Capacity forecast': 0.55, 'Backup path risk': 0.62 };
  const pts = s.predictions.map((p, i) => ({ id: p.id, x: p.conf * (p.horizon.includes('h') ? 1 : p.horizon.includes('30') ? 0.7 : 0.88), y: Math.min(0.95, (impact[p.kind] || 0.5) + (p.branchId ? 0 : 0.2) + (i % 3) * 0.03), label: `${p.id} ${p.kind}`, tag: p.id.replace('PRD-', ''), color: kinds[p.kind] || kinds.other }));
  return (
    <Card title="Risk matrix" sub="Every open prediction by likelihood and business impact. Top-right gets acted on first." right={<Legend items={[['Circuit', C.s1], ['Capacity', C.s2], ['Hardware and backup path', C.s3]]} />}>
      <RiskMatrix points={pts} onPoint={onPick} />
    </Card>
  );
}
export function ModelAccuracyCard() {
  const m = P.modelAccuracy();
  return (
    <Card title="Prediction quality, 6 months" sub="Precision: predictions that came true. Recall: real failures that were predicted." right={<Legend items={[['Precision', C.s1], ['Recall', C.s2]]} />}>
      <LineChart labels={m.labels} series={[{ name: 'Precision', data: m.precision, color: C.s1 }, { name: 'Recall', data: m.recall, color: C.s2 }]} h={170} yFmt={v => `${Math.round(v * 100)}%`} refLines={[{ v: 0.75, label: 'KPI 38 target 75%', color: C.ok }]} yMin={0.5} yMax={0.85} />
    </Card>
  );
}
export function PreventiveCalendarCard() {
  const { act } = useApp(); const now = useNow(); const cal = P.preventiveCalendar(now);
  const days = [...new Set(cal.map(c => c.day))];
  return (
    <Card title="Preventive maintenance, next 9 days" sub="All work runs after branch close or in agreed windows">
      <div className="space-y-2">{days.map(d => <div key={d} className="flex gap-3"><div className="w-20 shrink-0 text-[12.5px] font-semibold text-ink pt-1">{d === 0 ? 'Tonight' : d === 1 ? 'Tomorrow' : dateShort(now + d * DAY)}</div><div className="flex-1 space-y-1">{cal.filter(c => c.day === d).map(c => <div key={c.id} className="flex items-center gap-2 text-[12.5px] border border-line rounded-[4px] px-2 py-1"><span className="tabular text-ink3 w-10">{c.t}</span><span className="flex-1 text-ink truncate">{c.what}{c.b && <span className="text-ink3">, {c.b.name}</span>}</span><span className="text-[11.5px] text-ink3">{c.ref}</span><Badge>{c.kind}</Badge></div>)}</div></div>)}</div>
    </Card>
  );
}
export function ForecastMini({ p }) {
  const n = p.series.length, last = p.series[n - 1], slope = (p.series[n - 1] - p.series[0]) / (n - 1);
  const fcLen = 4; const labels = Array.from({ length: n + fcLen }, (_, i) => i < n ? `D-${n - 1 - i}` : `+${i - n + 1}d`);
  const actual = [...p.series, ...Array(fcLen).fill(null)];
  const fc = [...Array(n - 1).fill(null), last, ...Array.from({ length: fcLen }, (_, i) => +(last + slope * (i + 1)).toFixed(2))];
  const spread = Math.abs(slope) * 1.2 + Math.abs(last) * 0.04 + 0.05;
  const lo = fc.map((v, i) => v == null ? null : i === n - 1 ? v : +Math.max(0, v - spread * (i - n + 1)).toFixed(2)), hi = fc.map((v, i) => v == null ? null : i === n - 1 ? v : +(v + spread * (i - n + 1)).toFixed(2));
  return <LineChart labels={labels} series={[{ name: 'Signal', data: actual, color: C.s2 }, { name: 'Projection', data: fc, color: C.s2, forecastFrom: n - 1 }]} band={{ lo, hi, color: C.s2 }} forecastFrom={n - 1} h={120} yMin={Math.min(...p.series) >= 0 ? 0 : undefined} yFmt={v => (Math.abs(v) < 10 ? v.toFixed(1) : Math.round(v))} nowLabel="today" />;
}

// ─────────────── Knowledge ───────────────
export function ClustersCard() {
  return <Card title="What keeps coming back" sub="Incident clusters from the Similar-Case Indexer, last 90 days"><HBars rows={P.recurringClusters()} fmt={v => `${v}`} labelW={230} /></Card>;
}
export function DeflectionCard() {
  const d = P.kbDeflection();
  return <Card title="Self-service deflection" sub="Branch requests solved from a KB article without a ticket (KPI 39 target 35%)"><LineChart labels={d.labels} series={[{ name: 'Deflection', data: d.v, color: C.s1, area: true }]} h={160} yFmt={v => `${Math.round(v * 100)}%`} refLines={[{ v: 0.35, label: 'Target 35%', color: C.ok }]} yMin={0} yMax={0.4} /></Card>;
}

// ─────────────── Automation ───────────────
export function AutomationRunsCard() {
  const now = useNow(); const d = useMemo(() => P.automationRuns(now), []);
  return <Card title="Runbook runs, 14 days" right={<Legend items={[['Zero touch', C.s1], ['Human approved', C.s7]]} />}><Bars data={d} keys={['Zero touch', 'Human approved']} colors={[C.s1, C.s7]} h={170} /></Card>;
}
export function HoursSavedCard() {
  const h = P.hoursSaved();
  return <Card title="Engineer hours given back" sub="Time not spent on steps automation now handles"><div className="font-display text-[28px] font-semibold text-ink leading-none mb-1">{h.v[h.v.length - 1]} h <span className="text-[13px] font-normal text-ink3">in October</span></div><LineChart labels={h.labels} series={[{ name: 'Hours saved', data: h.v, color: C.s1, area: true }]} h={130} yFmt={v => Math.round(v)} yMin={0} /></Card>;
}
export function CandidatesCard() {
  const { act } = useApp(); const [done, setDone] = useState({});
  return (
    <Card title="What to automate next" sub="Repeated manual sequences found in work notes and command logs">
      <div className="divide-y divide-line/70">{P.AUTO_CANDIDATES.map(c => <div key={c.pattern} className="py-2 flex items-start gap-3 text-[12.5px]"><div className="flex-1"><div className="font-semibold text-ink">{c.pattern}</div><div className="text-ink2">{c.note}</div><div className="text-ink3">{c.freq} times in 30 days, about {c.saved} h a month, risk {c.risk.toLowerCase()}</div></div>{done[c.pattern] ? <Badge tone="green">Drafted</Badge> : <Btn size="xs" onClick={() => { setDone(d => ({ ...d, [c.pattern]: true })); act.audit(`Draft runbook requested: ${c.pattern}`, 'automation'); act.toast('Draft runbook sent for review'); }}>Draft runbook</Btn>}</div>)}</div>
    </Card>
  );
}

// ─────────────── SLA ───────────────
export function SLAProjectionCard({ m }) {
  const f = P.slaProjection(m);
  const fm = v => `${(v * 100).toFixed(m.fmt || 1)}%`;
  const end = f.fc[7]; const meets = m.lower ? end <= m.esl : end >= m.esl;
  return (
    <Card title={m.name} sub={`#${m.n}, ${m.def}. Two-month projection with likely range.`}>
      <div className="text-[12.5px] mb-1">Projected December: <b className={meets ? 'text-ok' : 'text-warn'}>{fm(end)}</b> <span className="text-ink3">({meets ? 'meets' : 'below'} expected {fm(m.esl)})</span></div>
      <LineChart labels={f.labels} series={[{ name: 'Actual', data: f.actual, color: C.s1 }, { name: 'Projection', data: f.fc, color: C.s1, forecastFrom: 5 }]} band={{ lo: f.lo, hi: f.hi, color: C.s1 }} forecastFrom={5} h={200} yFmt={fm} refLines={[...(m.msl != null ? [{ v: m.msl, label: 'Minimum', color: C.bad }] : []), { v: m.esl, label: 'Expected', color: C.ok }]} />
    </Card>
  );
}
