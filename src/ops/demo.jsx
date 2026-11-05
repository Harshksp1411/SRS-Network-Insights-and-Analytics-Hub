// The demo flow: one store outage from first alarm to closed ticket, in the nine steps an engineer would meet them.
import React, { useEffect, useMemo, useState } from 'react';
import * as I from 'lucide-react';
import * as D from '../data.js';
import { useApp, useNow } from '../store.jsx';
import { LineChart, Spark, C } from '../charts.jsx';
import { Logo, SRC_LOGO, cx } from '../ui.jsx';
import { Box, Pill, T, BarRow } from '../sites/shell.jsx';
import { DEMO, DRIFT, demoStorm, FATE_LABEL, PRIORITY_MAP } from './model.js';
import { hhmmss, hhmm, num, rng } from '../util.js';

export const STEPS = [
  { name: 'One view of a store', show: 'A sample branch with its EdgeConnect appliance, dual ISP circuits, Aruba switches and APs, plus the New Relic view of the ordering application', cap: 'Gateway discovery, topology map, Aruba Central and Orchestrator API integration, New Relic webhook', take: 'Every layer of a store in one place, grouped by store, district and region' },
  { name: 'Normal behaviour', show: 'Live latency, loss, utilisation and top talkers on both circuits, and AP client load', cap: 'Device monitors, NetFlow analytics, learned baselines', take: 'What healthy looks like for that store, and where headroom is thin' },
  { name: 'Break the store', show: 'Simulate an ISP-1 drop: SD-WAN fails over, latency rises on ISP-2, two APs report errors, New Relic flags slow transactions', cap: 'Multi-source alert ingestion', take: 'The raw alarm storm a real outage creates' },
  { name: 'Cut the noise', show: 'Repeat traps collapse into single alerts, maintenance-window alarms are suppressed, and the rest group into one inference', cap: 'De-duplication, first response policies, maintenance windows, alert correlation', take: 'Dozens of alarms become one store-level problem with a probable root cause' },
  { name: 'Prove the AI', show: 'The same policy in Observed mode, showing what it would have suppressed or grouped, then in Recommend mode', cap: 'Policy modes, continuous learning', take: 'SRS stays in control and switches on automation only after it is proven' },
  { name: 'Spot the next one', show: 'A second store whose circuit latency is drifting but has not breached a threshold', cap: 'Anomaly detection, pattern correlation across stores', take: 'Problems are caught before stores call in' },
  { name: 'Auto-ticket', show: 'OpsRamp opens one ServiceNow P1 for the down store, with CI, cause, correlated alerts and a link back, assigned to the carrier team', cap: 'Escalation policy, field and priority mapping, CMDB-linked CI', take: 'Clean, well-routed tickets with no manual triage' },
  { name: 'Fix and close', show: 'A runbook collects diagnostics; the copilot summarises the incident in plain language; the circuit recovers and the ServiceNow ticket closes, closing the OpsRamp incident too', cap: 'Automation runbooks, operations copilot, two-way sync', take: 'The full loop from alarm to resolution, with a record in both systems' },
  { name: 'Report', show: 'The incident appears in the Now, Then and Next dashboards proposed for SRS', cap: 'Shared telemetry and ticket history', take: 'The demo connects directly to the dashboard solution' },
];
const Src = ({ s }) => SRC_LOGO[s] ? <Logo k={SRC_LOGO[s]} h={10} /> : <b className="text-[11px] text-brand">{s}</b>;

export function Demo({ step, setStep }) {
  const now = useNow();
  const [t0, setT0] = useState(null); // when ISP-1 was dropped
  const storm = useMemo(() => demoStorm(t0 || now), [t0]);
  const [play, setPlay] = useState(false);
  useEffect(() => { if (step >= 2 && !t0) setT0(Date.now()); }, [step]);
  useEffect(() => { if (!play) return; if (step >= 8) { setPlay(false); return; } const t = setTimeout(() => setStep(step + 1), 6000); return () => clearTimeout(t); }, [play, step]);
  const S = STEPS[step], Body = [Step1, Step2, Step3, Step4, Step5, Step6, Step7, Step8, Step9][step];
  return (
    <div>
      <div className="bg-panel border border-line rounded-lg p-4">
        <div className="flex flex-wrap items-center gap-2"><div className="text-[11px] font-bold tracking-[0.1em] uppercase text-brand mr-auto">Demo flow · {DEMO.b.name} ({DEMO.b.brand})</div>
          <button onClick={() => { setStep(0); setT0(null); setPlay(false); }} className="h-8 px-2.5 rounded-md border border-line hover:bg-chip text-[12.5px] font-semibold inline-flex items-center gap-1"><I.RotateCcw size={13} />Restart</button>
          <button onClick={() => setPlay(!play)} className="h-8 px-3 rounded-md bg-brand text-white text-[12.5px] font-bold inline-flex items-center gap-1">{play ? <I.Pause size={13} /> : <I.Play size={13} />}{play ? 'Pause' : 'Play all'}</button>
          <button onClick={() => setStep(Math.max(0, step - 1))} disabled={!step} className="h-8 px-2.5 rounded-md border border-line hover:bg-chip text-[12.5px] font-semibold disabled:opacity-40">Back</button>
          <button onClick={() => setStep(Math.min(8, step + 1))} disabled={step >= 8} className="h-8 px-2.5 rounded-md border border-line hover:bg-chip text-[12.5px] font-semibold disabled:opacity-40 inline-flex items-center gap-1">Next step<I.ChevronRight size={13} /></button></div>
        <ol className="grid grid-cols-3 md:grid-cols-9 gap-1 mt-3">{STEPS.map((x, i) => <li key={x.name}><button onClick={() => setStep(i)} className={cx('w-full text-left rounded-md border px-2 py-1.5 h-full', i === step ? 'border-brand bg-brand/10' : i < step ? 'border-line bg-chip/50' : 'border-line')}><span className={cx('inline-grid place-items-center w-5 h-5 rounded-full text-[11px] font-bold mr-1', i <= step ? 'bg-brand text-white' : 'bg-chip text-ink3')}>{i + 1}</span><span className="text-[11.5px] font-semibold text-ink">{x.name}</span></button></li>)}</ol>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3 text-[12.5px]"><div><div className="text-[11px] font-bold uppercase text-ink3">What we show</div><div className="text-ink">{S.show}</div></div><div><div className="text-[11px] font-bold uppercase text-ink3">OpsRamp capability</div><div className="text-ink">{S.cap}</div></div><div><div className="text-[11px] font-bold uppercase text-ink3">What SRS takes away</div><div className="text-ink font-semibold">{S.take}</div></div></div>
      </div>
      <div className="mt-3"><Body key={step} storm={storm} t0={t0 || now} now={now} /></div>
    </div>
  );
}

function Step1() {
  const { act } = useApp(); const { b, ec, sws, aps, isp1, isp2 } = DEMO;
  const Dev = ({ d, sub }) => <button onClick={() => act.drill({ t: 'device', id: d.id })} className="border border-line rounded-md px-2.5 py-1.5 bg-panel hover:bg-chip/60 text-left"><div className="font-mono text-[12px] text-ink">{d.id}</div><div className="text-[11px] text-ink3">{d.model} · {sub}</div></button>;
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-3">
      <Box title={`${b.name}: every layer in one place`} sub={`${b.region} › ${b.state} › store ${b.num}. Discovered by the gateway, mapped with LLDP.`}>
        <div className="flex flex-wrap gap-2">{[isp1, isp2].map((c, k) => <button key={c.id} onClick={() => act.drill({ t: 'circuit', id: c.id })} className="border border-line rounded-md px-2.5 py-1.5 hover:bg-chip/60 text-left"><div className="text-[12.5px] font-bold text-ink">ISP-{k + 1}: {c.carrier} {c.type}</div><div className="text-[11px] text-ink3">{c.id} · {c.bw} Mb/s · via Simplify</div></button>)}</div>
        <div className="ml-4 pl-4 border-l-2 border-line mt-2 pt-1 space-y-2"><Dev d={ec} sub="EdgeConnect SD-WAN, Orchestrator API" />
          <div className="ml-4 pl-4 border-l-2 border-line space-y-2">{sws.map((sw, i) => <div key={sw.id}><Dev d={sw} sub="Aruba CX switch, SNMP" /><div className="ml-4 pl-4 border-l-2 border-line mt-1 flex flex-wrap gap-1.5">{aps.filter((_, k) => k % sws.length === i).map(ap => <Dev key={ap.id} d={ap} sub={`${ap.role}, Aruba Central`} />)}</div></div>)}</div></div>
      </Box>
      <Box title="The ordering application, from New Relic" sub="Application health next to the network, so a slow ERP is not mistaken for a slow network.">
        {[['ERP order entry', '1.1 s', 'normal'], ['Card payment path', '160 ms', 'normal'], ['Pricing and quoting API', '0.4 s', 'normal']].map(([a, v, st]) => <div key={a} className="flex items-center gap-2 py-1.5 border-b border-line/60 last:border-0 text-[12.5px]"><Logo k="newrelic" h={9} /><span className="flex-1 text-ink">{a}</span><b className="tabular-nums">{v}</b><Pill tone="green">{st}</Pill></div>)}
        <div className="text-[11.5px] text-ink3 mt-2">Grouped by store, district ({b.state}) and region ({b.region}).</div>
      </Box>
    </div>
  );
}

function Step2({ now }) {
  const { b, isp1, isp2, aps } = DEMO; const flow = D.netflowOf(b); const R = rng(b.num);
  const series = (base, j) => Array.from({ length: 24 }, (_, i) => +(base + Math.sin(i / 3) * j + R() * j).toFixed(1));
  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
      {[isp1, isp2].map((c, k) => <Box key={c.id} title={`ISP-${k + 1}: ${c.carrier} ${c.type}`} sub="Last 24 hours, with the learned normal range.">
        {[['Latency', series(c.lat, 3), 'ms'], ['Loss', series(c.loss, 0.03), '%'], ['Utilisation', series(c.util * (k ? 0.4 : 1), 8), '%']].map(([l, d, u]) => <div key={l} className="flex items-center gap-2 py-1 text-[12.5px]"><span className="w-20 text-ink2">{l}</span><Spark data={d} w={140} h={24} color={C.s1} /><b className="tabular-nums ml-auto">{d.at(-1)} {u}</b></div>)}
        <div className="text-[11.5px] text-ink3 mt-1">Headroom at peak: {100 - Math.round(c.util * (k ? 0.5 : 1.25))}% of {c.bw} Mb/s{k ? ' (backup carries little until a failover)' : ''}.</div>
      </Box>)}
      <Box title="Top talkers and AP client load" sub="From NetFlow on the EdgeConnect, and Aruba Central.">
        {flow.apps.slice(0, 5).map(a => <BarRow key={a.name} label={a.name} value={`${a.gb} GB`} frac={a.gb / flow.apps[0].gb} tone="info" />)}
        <div className="mt-2">{aps.map((ap, i) => <div key={ap.id} className="flex items-center gap-2 text-[12px] py-0.5"><span className="font-mono text-ink w-24">{ap.id.split('-')[1]}</span><span className="text-ink3 flex-1">{ap.role}</span><b>{12 + ((b.num + i * 7) % 25)} clients</b></div>)}</div>
      </Box>
    </div>
  );
}

function StormList({ rows, now, upto = 2, showFate }) {
  const vis = rows.filter(r => r.t <= now + 200000);
  return (
    <div className="divide-y divide-line/70 border border-line rounded-lg">{vis.map((r, i) => { const [fl, ft] = FATE_LABEL[r.fate]; const gone = showFate && r.fate !== 'root' && r.fate !== 'corr'; return (
      <div key={i} className={cx('grid grid-cols-[60px_80px_minmax(0,1fr)_auto] md:grid-cols-[60px_80px_150px_minmax(0,1fr)_44px_190px] gap-2 items-center px-2.5 py-1.5 text-[12px] feed-in', gone && 'opacity-45')}>
        <code className="text-[11px] text-ink3">{hhmmss(r.t)}</code><span><Src s={r.src} /></span><span className="hidden md:block font-mono text-[11.5px] text-ink truncate">{r.ci}</span><span className={cx('truncate text-ink2', gone && 'line-through')}>{r.msg}</span><b className="hidden md:block text-right tabular-nums">x{r.n}</b><span className="md:text-right">{showFate ? <Pill tone={ft}>{fl}</Pill> : <Pill tone={r.sev === 'Critical' ? 'red' : r.sev === 'Major' ? 'amber' : 'gray'}>{r.sev}</Pill>}</span></div>); })}</div>
  );
}

function Step3({ storm }) {
  const total = storm.reduce((a, r) => a + r.n, 0);
  return (
    <Box title={`Break the store: ISP-1 (${DEMO.isp1.carrier}) drops`} sub={`${total} alarms from ${new Set(storm.map(r => r.src)).size} sources in under three minutes. This is what the NOC would face without event management.`} right={<Pill tone="red">{total} alarms</Pill>}>
      <StormList rows={storm} now={Date.now()} />
    </Box>
  );
}

function Step4({ storm }) {
  const total = storm.reduce((a, r) => a + r.n, 0), dedupN = storm.filter(r => r.fate === 'dedup').reduce((a, r) => a + r.n - 1, 0) + storm.filter(r => r.fate !== 'dedup').reduce((a, r) => a + r.n - 1, 0), supp = storm.filter(r => r.fate === 'window' || r.fate === 'learned').length;
  const alerts = storm.filter(r => r.fate !== 'dedup').length, left = storm.filter(r => r.fate === 'root' || r.fate === 'corr').length;
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-3">
      <Box title="Cut the noise" sub="Each alarm, with what happened to it.">
        <div className="grid grid-cols-4 gap-2 mb-3 text-center">{[[total, 'alarms in'], [alerts, 'after de-duplication'], [left, 'after suppression'], [1, 'inference']].map(([v, l], i) => <div key={l} className={cx('border rounded-lg py-2', i === 3 ? 'border-brand bg-brand/10' : 'border-line')}><div className="text-[22px] font-extrabold tabular-nums text-ink">{v}</div><div className="text-[11px] text-ink3">{l}</div></div>)}</div>
        <StormList rows={storm} now={Date.now()} showFate />
      </Box>
      <Box title="One inference, with a probable root cause" sub={`${dedupN} repeats merged, ${supp} alerts suppressed (maintenance window, learned pattern), ${left} joined on the store topology.`}>
        <div className="border-l-4 border-bad bg-bad/5 rounded-r-lg p-3 text-[12.5px]"><div className="font-bold text-ink">{DEMO.b.name}: ISP-1 down, store degraded on ISP-2</div><div className="text-ink2 mt-1"><b className="text-ink">Probable root cause:</b> {DEMO.isp1.carrier} {DEMO.isp1.type} {DEMO.isp1.id} loss 100% (carrier side; EdgeConnect port up). Confidence 91%.</div><div className="text-ink2 mt-1"><b className="text-ink">Grouped:</b> SD-WAN failover, ISP-2 latency, 2 AP association errors, New Relic slow order entry, payment path slow.</div><div className="text-ink2 mt-1"><b className="text-ink">Joined on:</b> store {DEMO.b.num} topology (circuit › EdgeConnect › switches › APs) and time (3 min).</div></div>
      </Box>
    </div>
  );
}

function Step5({ storm }) {
  const [mode, setMode] = useState('Observed');
  const learned = storm.find(r => r.fate === 'learned');
  return (
    <Box title="Prove the AI on SRS's own data" sub="The learned policy that suppresses AP watchdog reboots, run first in shadow, then as a recommendation, before anyone switches it on.">
      <div className="inline-flex rounded-md border border-line overflow-hidden mb-3">{['Off', 'Observed', 'Recommend', 'On'].map(m => <button key={m} onClick={() => setMode(m)} className={cx('px-3 h-8 text-[12.5px] font-bold', mode === m ? 'bg-info text-white' : 'text-ink2 hover:bg-chip')}>{m}</button>)}</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[12.5px]">
        <div className="border border-line rounded-lg p-3"><div className="font-bold text-ink">{mode === 'Off' ? 'Policy off' : mode === 'Observed' ? 'Observed: what it would have done' : mode === 'Recommend' ? 'Recommend: suggested to the engineer' : 'On: running'}</div>
          <div className="text-ink2 mt-1">{mode === 'Off' ? 'Every AP reboot alarm reaches the NOC.' : mode === 'Observed' ? `Would have suppressed "${learned.msg}" on ${learned.ci}, and 37 like it across the estate this week. Nothing was changed; the alarms still reached the NOC.` : mode === 'Recommend' ? `Suggests suppressing ${learned.ci}'s reboot alarm. The engineer accepts or rejects; 34 of 37 accepted this week (92%).` : 'Suppresses AP reboots that recover inside 3 minutes; unsuppresses automatically if one does not.'}</div></div>
        <div className="border border-line rounded-lg p-3"><div className="font-bold text-ink">Grouping the same way</div><div className="text-ink2 mt-1">In Observed mode the correlation policy showed it would have joined the 6 alarm types at {DEMO.b.name} into one inference, matching what the engineer did by hand on 41 of 43 past outages.</div><div className="mt-2"><Pill tone={mode === 'On' ? 'green' : 'blue'}>{mode === 'On' ? 'switched on after proof' : 'SRS approves before it runs'}</Pill></div></div>
      </div>
    </Box>
  );
}

function Step6() {
  const { act } = useApp(); const d = DRIFT.p.series, base = d.map((_, i) => d[0] + i * 0.3);
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-3">
      <Box title={`Spot the next one: ${DRIFT.b.name}`} sub={`${DRIFT.c.carrier} ${DRIFT.c.type} ${DRIFT.c.id}: latency drifting above its learned baseline; the static threshold has not been crossed.`}>
        <LineChart h={190} labels={d.map((_, i) => `D-${d.length - 1 - i}`)} yFmt={v => `${Math.round(v)} ms`} series={[{ name: 'Latency', color: C.s1, data: d }, { name: 'Baseline', color: C.s3, data: base }]} band={{ lo: base.map(v => v - 3), hi: base.map(v => v + 3), color: C.s3 }} refLines={[{ v: 60, label: 'Threshold 60 ms', color: C.bad }]} yMin={15} yMax={65} />
        <button onClick={() => act.drill({ t: 'prediction', id: DRIFT.p.id })} className="text-[12px] text-info hover:underline mt-1">Open the prediction {DRIFT.p.id}</button>
      </Box>
      <Box title="Pattern correlation across stores" sub="Alarms that co-occur over time, even without a topology link.">
        <div className="text-[12.5px] text-ink2">{DRIFT.c.carrier} lines in {DRIFT.b.region} show the same evening drift at {3 + (DRIFT.b.num % 3)} stores this week: a likely shared carrier segment. One pattern alert raised, carrier review booked; no store has called.</div>
        <div className="mt-2 space-y-1">{D.CIRCUITS.filter(c => c.carrier === DRIFT.c.carrier && D.BR[c.branchId].region === DRIFT.b.region && c.role === 'Primary').slice(0, 4).map(c => <div key={c.id} className="flex items-center gap-2 text-[12px]"><span className="font-mono text-ink">{c.id}</span><span className="text-ink3 flex-1">{D.BR[c.branchId].name}</span><b>+{8 + (c.lat % 9)} ms</b></div>)}</div>
      </Box>
    </div>
  );
}

function Step7({ storm, t0 }) {
  const { b, isp1, ec } = DEMO; const p = PRIORITY_MAP[0];
  return (
    <Box title="Auto-ticket: one ServiceNow incident for the store" sub="Raised by the escalation policy from the inference, not from the raw alarms.">
      <div className="border border-line rounded-lg overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 bg-chip/60 border-b border-line"><Logo k="servicenow" h={12} /><b className="text-[13px] text-ink">Incident INC0385012</b><Pill tone="red">P1</Pill><Pill tone="green">Created by OpsRamp</Pill><span className="ml-auto text-[11.5px] text-ink3">{hhmm(t0 + 3 * 60e3)} CT</span></div>
        <div className="p-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-[12.5px]">{[['Caller', 'OpsRamp integration'], ['Store', `${b.name} (#${b.num})`], ['Configuration item', isp1.id], ['Category', 'Network › WAN circuit'], ['Impact / urgency', `${p.impact} / ${p.urg}`], ['Assignment group', 'Movate Carrier Management'], ['Assigned to', 'Looked up: carrier on-call'], ['State', 'New']].map(([k, v]) => <div key={k}><div className="text-[10.5px] uppercase text-ink3 font-semibold">{k}</div><div className="text-ink font-semibold">{v}</div></div>)}</div>
        <div className="px-3 pb-3 text-[12.5px] space-y-1.5"><div><b className="text-ink">Short description:</b> {b.name}: {isp1.carrier} ISP-1 down; payments and ERP slow on ISP-2</div><div className="text-ink2"><b className="text-ink">Probable cause:</b> carrier fault on {isp1.id} (91%). <b className="text-ink">Correlated alerts:</b> {storm.filter(r => r.fate === 'root' || r.fate === 'corr').length} attached ({storm.reduce((a, r) => a + r.n, 0)} raw alarms). <b className="text-ink">Recent changes:</b> none on this store in 7 days. <b className="text-ink">Affected:</b> {ec.id}, {DEMO.aps.slice(0, 2).map(a => a.id).join(', ')}.</div><div className="text-info flex items-center gap-1"><I.ExternalLink size={12} />Open the live OpsRamp view of {b.code}</div></div>
      </div>
      <div className="text-[11.5px] text-ink3 mt-2">Why P1: the policy treats a store that cannot take card payments as unable to trade. The CI comes from the CMDB that OpsRamp keeps in sync.</div>
    </Box>
  );
}

function Step8({ t0 }) {
  const { b, isp1 } = DEMO;
  const tl = [[3, 'OpsRamp', 'Runbook RB-106 collected diagnostics: 60-minute loss graph, MTR from the EdgeConnect, interface counters'], [4, 'OpsRamp', `Carrier case opened with ${isp1.carrier}, evidence attached; ticket number written to ServiceNow`], [5, 'Copilot', `Summary posted as a work note: "${b.name} lost its ${isp1.carrier} line at ${hhmm(t0)}. The store moved to its backup line in 4 seconds, but card payments are slow on it. Cause: carrier side. Next: carrier repair; keep payments on the backup."`], [62, 'Orchestrator', `${isp1.id} clean for 30 minutes; traffic back on ISP-1`], [63, 'ServiceNow', 'Engineer resolves INC0385012, close code Carrier / LEC'], [63, 'OpsRamp', 'Inference closed by the two-way sync; record in both systems']];
  return (
    <Box title="Fix and close" sub="The full loop from alarm to resolution.">
      <ol className="relative border-l-2 border-line ml-2 space-y-3">{tl.map(([m, who, txt], i) => <li key={i} className="ml-4"><span className="absolute -left-[7px] w-3 h-3 rounded-full bg-brand mt-1" /><div className="text-[11.5px] text-ink3">{hhmm(t0 + m * 60e3)} · <b className="text-ink">{who}</b></div><div className="text-[12.5px] text-ink">{txt}</div></li>)}</ol>
      <div className="mt-3 flex gap-2"><Pill tone="green">Restored in 63 min</Pill><Pill tone="green">Closed in ServiceNow and OpsRamp</Pill></div>
    </Box>
  );
}

function Step9() {
  const { b, isp1 } = DEMO;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">{[
      ['Now: live health', 'OpsRamp, near real time', [`${b.name} shown degraded, then on a single circuit for 63 minutes`, 'Counted once in redundancy exposure', 'Availability: no trading minutes lost (degraded, not down)']],
      ['Then: performance and trends', 'ServiceNow history', [`+1 incident for ${b.name}, root cause Carrier / ISP`, `${isp1.carrier} outage tally and restore time updated in the carrier scorecard`, 'Resolved inside the P1 resolution SLA']],
      ['Next: predictive risk', 'Combined history', [`${b.name} risk score rises (recurring circuit pattern)`, `${isp1.carrier} pattern watched across ${b.region}`, 'If it repeats: proactive problem record and carrier review']],
    ].map(([t, s, items]) => <Box key={t} title={t} sub={s}><ul className="space-y-1 text-[12.5px]">{items.map(x => <li key={x} className="flex gap-1.5"><I.Check size={13} className="text-ok mt-[3px] shrink-0" /><span className="text-ink">{x}</span></li>)}</ul></Box>)}
      <div className="lg:col-span-3 text-[12.5px] text-ink2 bg-chip/60 border border-line rounded-lg px-4 py-2.5">The same telemetry and ticket history feed the Network Intelligence dashboards, the separate page of this hub with the Now, Then and Next views.</div>
    </div>
  );
}
