// OpsRamp Platform Capabilities: overview, integration, event management, ServiceNow and AI, and outcomes.
import React, { useMemo, useState } from 'react';
import * as I from 'lucide-react';
import * as D from '../data.js';
import { useApp, useNow } from '../store.jsx';
import { useLive } from '../live.jsx';
import { todayCounts } from '../viz2.jsx';
import { LineChart, Spark, C } from '../charts.jsx';
import { Logo, SRC_LOGO, cx } from '../ui.jsx';
import { Box, Pill, T, Tile, BarRow, DISPLAY } from '../sites/shell.jsx';
import { SOURCES, PLATFORM, INTEGRATION_CAPS, PIPE, POLICIES, MODES, PRIORITY_MAP, CATEGORY_MAP, ESCALATION, DEMO, DRIFT, copilot } from './model.js';
import { num, hhmm, hhmmss, dur, ago, MIN, HR } from '../util.js';

const Src = ({ s }) => SRC_LOGO[s] ? <Logo k={SRC_LOGO[s]} h={10} /> : <b className="text-[11px] text-brand whitespace-nowrap">{s}</b>;
const Hero = ({ kicker, title, children }) => <section className="bg-panel border border-line rounded-lg p-5 border-l-4 border-l-brand"><div className="text-[11px] font-bold tracking-[0.1em] uppercase text-brand">{kicker}</div><h1 className="text-[24px] font-bold text-ink leading-tight mt-1" style={DISPLAY}>{title}</h1><div className="text-[14px] text-ink2 mt-1.5 max-w-[1000px]">{children}</div></section>;

// ───────── overview ─────────
export function Overview({ go }) {
  const { s } = useApp(); const { L } = useLive(); const tc = todayCounts(L, s);
  return (
    <div>
      <Hero kicker="Second demo · OpsRamp for SRS" title="One operations layer across the store network">OpsRamp connects to the Aruba and EdgeConnect estate SRS already runs, turns raw alarms into a short list of real problems, and hands those problems to ServiceNow with full context. Today: <b className="text-ink">{num(tc.events)} events in, {tc.inc} incidents out</b>, {Math.round(tc.noise * 100)}% of the noise removed before anyone looks.</Hero>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mt-3">{[
        ['integration', I.Plug, 'Integration', 'Aruba switches and APs, Aruba Central, Silver Peak EdgeConnect SD-WAN and New Relic in one console, with Cisco ready to add', 'One view of every store, regardless of tool or vendor'],
        ['events', I.Filter, 'Event management', 'Aggregation, de-duplication, suppression, correlation, pattern correlation, anomaly detection and AI false-positive reduction', 'Engineers work on a few real incidents, not thousands of alarms'],
        ['snow', I.Ticket, 'ServiceNow and AI', 'Two-way incident sync, CMDB updates, AI-assisted root cause and an operations copilot', 'Faster, better-routed tickets, and a path to autonomous operations'],
      ].map(([k, Ic, t, w, why]) => <button key={k} onClick={() => go(k)} className="text-left bg-panel border border-line rounded-lg p-4 hover:border-ink3 group"><div className="flex items-center gap-2"><span className="w-8 h-8 rounded-lg bg-brand/10 text-brand grid place-items-center"><Ic size={16} /></span><b className="text-[16px] text-ink flex-1">{t}</b><I.ChevronRight size={15} className="text-ink3 group-hover:text-brand" /></div><div className="text-[12.5px] text-ink3 mt-2 uppercase font-bold tracking-wide">What SRS will see</div><div className="text-[13px] text-ink">{w}</div><div className="text-[12.5px] text-ink3 mt-2 uppercase font-bold tracking-wide">Why it matters</div><div className="text-[13px] text-ink">{why}</div></button>)}</div>
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-3 mt-3">
        <Box title="The demo walks one store outage, first alarm to closed ticket" sub={`At ${DEMO.b.name}: each capability in the order an engineer would meet it.`}>
          <ol className="grid grid-cols-1 sm:grid-cols-3 gap-2">{['One view of a store', 'Normal behaviour', 'Break the store', 'Cut the noise', 'Prove the AI', 'Spot the next one', 'Auto-ticket', 'Fix and close', 'Report'].map((x, i) => <li key={x}><button onClick={() => go('demo', i)} className="w-full text-left flex items-center gap-2 border border-line rounded-md px-2.5 py-1.5 hover:bg-chip/50 text-[12.5px]"><span className="w-5 h-5 rounded-full bg-brand text-white text-[11px] font-bold grid place-items-center shrink-0">{i + 1}</span><span className="text-ink font-semibold">{x}</span></button></li>)}</ol>
          <button onClick={() => go('demo', 0)} className="mt-3 h-9 px-4 rounded-md bg-brand text-white font-bold text-[13px] inline-flex items-center gap-1.5"><I.Play size={14} />Start the walk-through</button>
        </Box>
        <Box title="Why OpsRamp, for SRS" sub="OpsRamp is an HPE company.">
          <p className="text-[13px] text-ink2">It shares a roadmap with HPE Aruba Networking, the vendor behind most of SRS's store network: the EdgeConnect SD-WAN appliances, the CX switches and the access points. Aruba Central and OpsRamp integrate natively.</p>
          <div className="grid grid-cols-3 gap-2 mt-3 text-center">{[[D.DEVICES.filter(d => d.type === 'SD-WAN').length, 'EdgeConnect'], [D.DEVICES.filter(d => d.type === 'Switch').length, 'Aruba switches'], [D.DEVICES.filter(d => d.type === 'AP').length, 'Aruba APs']].map(([v, l]) => <div key={l} className="border border-line rounded-md py-2"><div className="text-[20px] font-bold text-ink tabular-nums">{num(v)}</div><div className="text-[11.5px] text-ink3">{l}</div></div>)}</div>
        </Box>
      </div>
    </div>
  );
}

// ───────── integration ─────────
export function Integration() {
  const { s, act } = useApp(); const { L } = useLive(); const now = useNow();
  const [pick, setPick] = useState(DEMO.b.id);
  const b = D.BR[pick], devs = D.devicesOf(b.id), flow = D.netflowOf(b);
  const perMin = srcs => L.feed.filter(e => srcs.includes(e.src) && now - e.t < 60e3).length * 6 + (srcs.length ? 8 : 0);
  const totalGb = flow.apps.reduce((a, x) => a + x.gb, 0);
  const evid = {
    gateway: <span><Pill tone="green">2 of 2 up</Pill> virtual collectors in the McKinney and DR data centres; last heartbeat {hhmmss(now - 4000)}</span>,
    agentless: <span>{num(D.DEVICES.length)} devices on SNMP v3; {num(Math.round(D.DEVICES.length * 12))} polls a minute; {num(L.counters.events)} traps and syslog lines today</span>,
    flow: <span>{b.name}: top talker {flow.apps[0].name} ({flow.apps[0].gb} GB today); primary line at {flow.line.util}%</span>,
    topology: <span>{num(D.BRANCHES.length)} store maps; {b.name}: {devs.length} devices, {b.wan.length} circuits linked</span>,
    ncm: <span>Backups {(L.series.backups.at(-1) || 99).toFixed(1)}% last night; {D.DRIFT.length} devices differ from the standard template</span>,
    api: <span>Aruba Central, Orchestrator, New Relic and ServiceNow connected; Cisco template ready</span>,
    group: <span>{num(D.BRANCHES.length)} stores, {new Set(D.BRANCHES.map(x => x.state)).size} districts (states and provinces), {D.REGIONS.length} regions</span>,
  };
  return (
    <div>
      <Hero kicker="Integration with SRS's network estate" title="Every SRS network source feeds one OpsRamp platform">OpsRamp brings every part of the store network into one view without replacing any tool SRS already uses. Store devices are reached through an OpsRamp gateway; cloud platforms connect through their APIs.</Hero>
      <Box className="mt-3" title="5 sources, 2 consumers" sub="Live: events a minute from each source right now.">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_48px_minmax(0,0.9fr)_48px_minmax(0,0.8fr)] gap-2 items-center">
          <div className="space-y-2">{SOURCES.map(x => <div key={x.k} className={cx('border rounded-lg px-3 py-2', x.future ? 'border-dashed border-line text-ink3' : 'border-line bg-panel')}><div className="flex items-center gap-2"><b className="text-[13.5px] text-ink flex-1">{x.name}</b>{!x.future && <span className="text-[11.5px] text-ok font-bold tabular-nums">{perMin(x.src)}/min</span>}</div><div className="text-[12px] text-ink3">{x.how}</div><div className="text-[11.5px] text-ink2">{x.n()} · {x.via}</div></div>)}</div>
          <div className="hidden lg:flex flex-col items-center text-ink3"><I.ArrowRight size={22} /></div>
          <div className="border-2 border-info rounded-xl bg-info/5 p-4"><div className="text-[17px] font-bold text-ink">HPE OpsRamp</div><div className="text-[12.5px] text-ink3">SaaS platform</div><div className="border-t border-line my-2" />{PLATFORM.map(p => <div key={p} className="text-[13.5px] text-ink py-0.5 flex items-center gap-2"><I.Check size={13} className="text-ok" />{p}</div>)}<div className="text-[11.5px] text-ink3 mt-2">{num(L.counters.events)} events today · {Math.round(L.series.raw.at(-1) || 0)} a minute now</div></div>
          <div className="hidden lg:flex flex-col items-center text-ink3"><I.ArrowLeftRight size={22} /></div>
          <div className="space-y-2"><div className="border border-line rounded-lg px-3 py-2 bg-panel"><div className="flex items-center gap-2"><Logo k="servicenow" h={11} /><b className="text-[13.5px] text-ink">ServiceNow</b></div><div className="text-[12px] text-ink3">Two-way incidents, CMDB</div><div className="text-[11.5px] text-ink2">{s.incidents.filter(i => i.state !== 'Resolved').length} open incidents in sync</div></div><div className="border border-line rounded-lg px-3 py-2 bg-panel"><b className="text-[13.5px] text-ink">Movate NOC</b><div className="text-[12px] text-ink3">Dashboards and alerts</div><div className="text-[11.5px] text-ink2">24x7, L1, L2 and major incident</div></div></div>
        </div>
      </Box>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 mt-3">
        <Box title="How each source connects" sub="What OpsRamp reads from each part of the estate.">
          <ul className="space-y-2 text-[12.5px] text-ink2">
            <li><b className="text-ink">Aruba switching and Wi-Fi.</b> The Aruba CX switches and AP-635 access points are discovered and polled through the gateway, with traps, syslog and NetFlow for traffic analysis.</li>
            <li><b className="text-ink">Aruba Central.</b> Central and OpsRamp integrate natively, so Central's Aruba-specific insight and OpsRamp's multi-vendor view share the same data.</li>
            <li><b className="text-ink">Silver Peak EdgeConnect.</b> Tunnel, path and appliance health come from the Orchestrator API and the appliances themselves, so a circuit failover is visible next to the store's LAN and Wi-Fi.</li>
            <li><b className="text-ink">New Relic.</b> Application alerts arrive by webhook and sit alongside network alarms, so SRS can tell a slow ordering application from a slow network.</li>
            <li><b className="text-ink">Cisco, in future.</b> New vendors are added through the same SNMP and API framework; OpsRamp already covers Cisco, so expansion needs no new tooling.</li>
          </ul>
        </Box>
        <Box title="Store topology, from auto-discovery" sub="Which AP sits behind which switch and circuit, so correlation knows the parent of every alarm." right={<select value={pick} onChange={e => setPick(e.target.value)} className="h-8 rounded-md border border-line bg-panel px-2 text-[12.5px] text-ink">{[DEMO.b, ...D.BRANCHES.filter(x => x.dev.ap >= 4).slice(0, 8)].map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}>
          <Topology b={b} s={s} onPick={id => act.drill({ t: 'device', id })} onLine={id => act.drill({ t: 'circuit', id })} />
        </Box>
      </div>
      <Box className="mt-3" title="OpsRamp integration capabilities" sub="What each one gives SRS, with what it is doing now.">
        <T cols={[{ k: 'name', l: 'Capability', f: r => <b className="text-ink">{r.name}</b> }, { k: 'gives', l: 'What it gives SRS', cls: 'text-ink2' }, { k: 'now', l: 'Now', f: r => <span className="text-ink text-[12px]">{evid[r.k]}</span> }]} rows={INTEGRATION_CAPS} />
      </Box>
      <Box className="mt-3" title={`Flow analytics: ${b.name}`} sub="Top talkers and application traffic today, from NetFlow on the SD-WAN appliance.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">{flow.apps.slice(0, 8).map(a => <BarRow key={a.name} label={a.name} sub={a.cls} value={`${a.gb} GB`} frac={a.gb / flow.apps[0].gb} tone={a.cls === 'Business' ? 'info' : 'ink'} />)}</div>
        <div className="text-[12px] text-ink3 mt-1">{totalGb.toFixed(1)} GB in total; primary {flow.line.carrier} {flow.line.type} at {flow.line.util}% of {flow.line.bw} Mb/s.</div>
      </Box>
    </div>
  );
}

function Topology({ b, s, onPick, onLine }) {
  const devs = D.devicesOf(b.id), ec = devs.filter(d => d.type === 'SD-WAN'), sws = devs.filter(d => d.type === 'Switch'), aps = devs.filter(d => d.type === 'AP');
  const Node = ({ d, sub }) => <button onClick={() => onPick(d.id)} className="border border-line rounded-md px-2 py-1 text-left hover:bg-chip/60 bg-panel"><div className="font-mono text-[11.5px] text-ink">{d.id}</div><div className="text-[10.5px] text-ink3">{d.model}{sub ? ` · ${sub}` : ''}</div></button>;
  return (
    <div className="text-[12px]">
      <div className="flex gap-2 flex-wrap">{b.wan.map((id, k) => { const c = D.CIR[id]; return <button key={id} onClick={() => onLine(id)} className="border border-line rounded-md px-2 py-1 hover:bg-chip/60 text-left"><div className="font-semibold text-ink">ISP-{k + 1}: {c.carrier} {c.type}</div><div className="text-[10.5px] text-ink3">{id}, {c.bw} Mb/s</div></button>; })}</div>
      <div className="pl-4 border-l-2 border-line ml-3 mt-1 pt-1 space-y-1">{ec.map(d => <Node key={d.id} d={d} sub="SD-WAN edge" />)}
        <div className="pl-4 border-l-2 border-line ml-3 space-y-1">{sws.map((sw, i) => <div key={sw.id}><Node d={sw} sub={i === 0 ? 'core' : 'access'} /><div className="pl-4 border-l-2 border-line ml-3 mt-1 flex flex-wrap gap-1">{aps.filter((_, k) => k % sws.length === i).map(ap => <Node key={ap.id} d={ap} sub={ap.role} />)}</div></div>)}</div>
      </div>
    </div>
  );
}

// ───────── event management ─────────
export function Events() {
  const { s, act } = useApp(); const { L } = useLive(); const now = useNow();
  const tc = todayCounts(L, s);
  const [modes, setModes] = useState(() => Object.fromEntries(POLICIES.map(p => [p.id, p.mode])));
  // what each stage leaves or finds today: alerts left after 1 to 4, then cross-store groups, drifting assets and alerts screened out
  const fp = Math.max(2, Math.round(tc.inc * 0.35));
  const stage = [[tc.events, 'events in, one alert model'], [Math.round(tc.events * 0.56), 'alerts left after repeats merged'], [tc.raw, 'alerts left after suppression'], [tc.corr, 'alerts grouped into inferences'], [Math.max(1, Math.round(tc.inc * 0.12)), 'inferences spanning several stores'], [s.predictions.filter(p => ['New', 'Watching'].includes(p.status)).length + 6, 'assets drifting from baseline'], [fp, 'inferences screened out as needing no action']];
  const policyHits = p => Math.round(tc.events * p.share);
  return (
    <div>
      <Hero kicker="Event management" title="From alarm storm to one incident">The flood of alarms a store outage creates becomes one incident with a probable cause. Each stage removes noise or adds meaning. Live counts since midnight CT.</Hero>
      <Box className="mt-3" title="Raw store alarms become one actionable incident per issue" sub="7 stages to one incident, today.">
        {['Reduce the noise', 'Find the cause'].map((g, gi) => <div key={g} className={gi ? 'mt-3' : ''}><div className="text-[12px] font-bold text-ink3 mb-1.5">{g}</div><div className="grid grid-cols-2 lg:grid-cols-4 gap-2">{PIPE.filter(p => p.group === g).map(p => <div key={p.k} className="border border-line rounded-lg p-3 bg-panel relative"><div className="flex items-center gap-1.5"><b className="text-[14px] text-ink">{p.n} {p.name}</b><span className="ml-auto text-[15px] font-extrabold tabular-nums text-ink">{num(stage[p.n - 1][0])}</span></div><div className="text-[12px] text-ink2 leading-snug mt-0.5">{p.short}</div><div className="text-[10.5px] text-ink3 mt-0.5">{stage[p.n - 1][1]}</div></div>)}{gi === 1 && <div className="border-2 border-info rounded-lg p-3 bg-info/5"><div className="flex items-center"><b className="text-[14px] text-ink">Real incident</b><span className="ml-auto text-[15px] font-extrabold tabular-nums">{tc.inc}</span></div><div className="text-[12px] text-ink2 mt-0.5">One ticket per store issue, with probable cause, to ServiceNow</div></div>}</div></div>)}
      </Box>
      <Box className="mt-3" title="OpsRamp event management capabilities" sub="How each stage works, with an SRS example.">
        <T cols={[{ k: 'name', l: 'Capability', f: r => <b className="text-ink">{r.name}</b> }, { k: 'how', l: 'How OpsRamp does it', cls: 'text-ink2' }, { k: 'ex', l: 'SRS example', cls: 'text-ink2' }]} rows={[{ ...PIPE[0], name: 'Aggregation' }, { ...PIPE[1], name: 'De-duplication' }, { ...PIPE[2], name: 'Suppression' }, { ...PIPE[3], name: 'Correlation' }, { ...PIPE[4], name: 'Pattern correlation' }, { ...PIPE[5], name: 'Anomaly detection' }, { ...PIPE[6], name: 'AI false-positive reduction' }]} />
      </Box>
      <AlertBrowser L={L} now={now} act={act} />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 mt-3">
        <Box title="Alert correlation policies and first response policies" sub="Every AI policy can run in shadow first. Off, Observed (shows what it would do), Recommend (suggests, a person approves) and On.">
          <div className="space-y-2">{POLICIES.map(p => <div key={p.id} className="border border-line rounded-lg p-2.5"><div className="flex items-start gap-2"><div className="flex-1 min-w-0"><div className="text-[12.5px] font-semibold text-ink">{p.name}</div><div className="text-[11.5px] text-ink3">{p.id} · {p.kind} · {p.by}</div></div><div className="inline-flex rounded-md border border-line overflow-hidden shrink-0">{MODES.map(m => <button key={m} onClick={() => { setModes(x => ({ ...x, [p.id]: m })); act.toast(`${p.id} set to ${m}`, 'info'); }} className={cx('px-1.5 h-6 text-[10.5px] font-bold', modes[p.id] === m ? (m === 'On' ? 'bg-ok text-white' : m === 'Off' ? 'bg-ink3 text-white' : 'bg-info text-white') : 'text-ink2 hover:bg-chip')}>{m}</button>)}</div></div>
            <div className="text-[11.5px] mt-1 text-ink2">{modes[p.id] === 'Off' ? 'Not running.' : modes[p.id] === 'Observed' ? `Shadow: would have ${p.kind === 'Correlation' ? 'grouped' : 'suppressed'} ${num(policyHits(p))} alerts today. Nothing changed.` : modes[p.id] === 'Recommend' ? `Suggested ${num(policyHits(p))} ${p.kind === 'Correlation' ? 'groupings' : 'suppressions'} today; engineers accepted ${Math.round(88 + p.share * 100)}%.` : `${p.kind === 'Correlation' ? 'Grouped' : 'Suppressed'} ${num(policyHits(p))} alerts today.`}</div></div>)}</div>
          <div className="text-[11.5px] text-ink3 mt-2"><b className="text-ink">Automatic unsuppression:</b> a suppressed alert that stays open past its normal duration is brought back. Today: {Math.max(1, Math.round(tc.inc * 0.15))} alerts unsuppressed, for example an AP reboot that did not recover in 3 minutes.</div>
        </Box>
        <div className="space-y-3">
          <Box title="Maintenance windows" sub="Planned store work, carrier maintenance and change windows silence expected alarms automatically.">
            <T dense cols={[{ k: 'id', l: 'Window', f: c => <span className="font-mono text-[11.5px]">{c.id}</span> }, { k: 'title', l: 'What', cls: 'text-ink2' }, { k: 'window', l: 'When', cls: 'text-ink2' }]} rows={[...s.changes.filter(c => /Scheduled|Approved/.test(c.state)).slice(0, 4), { id: 'CXM-AT&T-1107', title: 'AT&T core maintenance, Southeast metro (carrier notice)', window: 'Sun 01:00–05:00 ET' }, { id: 'STORE-MAINT', title: 'Store closed-hours work: port-security template', window: 'Nightly 00:00–04:00 local' }]} />
          </Box>
          <Box title="Alert enrichment" sub="Custom attributes added to every alert for routing and reporting.">
            {(() => { const e = L.feed.find(x => x.branchId) || { branchId: DEMO.b.id, msg: 'wan1 loss 3%', src: 'Orchestrator', sev: 'Major' }; const b = D.BR[e.branchId], c = D.CIR[b.wan[0]]; return <div className="font-mono text-[11.5px] bg-chip/60 border border-line rounded-md p-2.5 leading-relaxed">{[['alert', e.msg], ['source', e.src], ['severity', e.sev], ['store_number', b.num], ['store', b.name], ['region', b.region], ['district', b.state], ['circuit_id', c.cid], ['carrier', `${c.carrier} ${c.type}`], ['business_hours', `${b.hours.open}–${b.hours.close} local`], ['ci', `${b.code}-ec01`]].map(([k, v]) => <div key={k}><span className="text-ink3">{k}:</span> <span className="text-ink">{String(v)}</span></div>)}</div>; })()}
          </Box>
        </div>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 mt-3">
        <Box title="Alert escalation policies" sub="Time-based escalation from L1 to L2 to on-call, with continuous learning to route each incident to the right team.">
          {ESCALATION.map(e => <div key={e.p} className="flex items-center gap-2 py-1.5 text-[12px]"><Pill tone={e.p === 'P1' ? 'red' : e.p === 'P2' ? 'amber' : 'gray'}>{e.p}</Pill><div className="flex-1 flex items-center gap-1 flex-wrap">{e.steps.map(([w, m], i) => <React.Fragment key={w}>{i > 0 && <I.ChevronRight size={12} className="text-ink3" />}<span className="border border-line rounded px-1.5 py-0.5"><b className="text-ink">{w}</b> <span className="text-ink3">{m ? `+${m >= 60 ? `${m / 60} h` : `${m} min`}` : 'at once'}</span></span></React.Fragment>)}</div></div>)}
        </Box>
        <Box title="Automated first response" sub="Runbooks triggered from an alert, for example gathering diagnostics or bouncing a port, before a human is involved.">
          <T dense cols={[{ k: 'id', l: 'Runbook', f: r => <b>{r.id}</b> }, { k: 'name', l: 'What it does' }, { k: 'runs30', l: 'Runs, 30 d', r: true }, { k: 'success', l: 'Success', r: true, f: r => `${Math.round(r.success * 100)}%` }, { k: 'kind', l: 'Gate', f: r => r.kind === 'readonly' ? <Pill tone="green">runs on its own</Pill> : <Pill tone="amber">approval</Pill> }]} rows={D.RUNBOOKS} />
        </Box>
      </div>
    </div>
  );
}

const dtype = msg => /-ec0|tunnel|wan[12]/i.test(msg) ? 'SD-WAN' : /-sw0|PoE|uplink|port/i.test(msg) ? 'Switch' : /-ap0|Wi-Fi|AP /i.test(msg) ? 'AP' : /ERP|Payment|POS|path/i.test(msg) ? 'Application' : 'Other';
function AlertBrowser({ L, now, act }) {
  const [f, setF] = useState({ q: '', region: 'All', type: 'All', src: 'All', st: 'All' });
  const rows = L.feed.filter(e => e.branchId && D.BR[e.branchId]).map(e => ({ ...e, b: D.BR[e.branchId], type: dtype(e.msg), status: e.inc ? 'Incident' : /Duplicate|grouped/i.test(e.out || '') ? 'De-duplicated' : /recovered|next poll OK|back in/i.test(e.msg) ? 'Auto-cleared' : /Info|OK|no action|healthy|complete|passed/i.test(e.out || '') ? 'Suppressed (info)' : /Auto-healed|Recovered/i.test(e.out || '') || /recovered|next poll OK|back in/i.test(e.msg) ? 'Auto-cleared' : 'Open' }));
  const opts = k => ['All', ...new Set(rows.map(r => k === 'region' ? r.b.region : r[k]))];
  const shown = rows.filter(r => (!f.q || `${r.b.name} ${r.b.num} ${r.msg}`.toLowerCase().includes(f.q.toLowerCase())) && (f.region === 'All' || r.b.region === f.region) && (f.type === 'All' || r.type === f.type) && (f.src === 'All' || r.src === f.src) && (f.st === 'All' || r.status === f.st)).slice(0, 14);
  const Sel = ({ k, label }) => <label className="text-[11.5px] text-ink3 flex flex-col">{label}<select value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} className="h-8 mt-0.5 rounded-md border border-line bg-panel px-2 text-[12.5px] text-ink">{opts(k === 'st' ? 'status' : k).map(o => <option key={o} value={o}>{o}</option>)}</select></label>;
  return (
    <Box className="mt-3" title="Unified alert browser" sub={`One console for every alert, filterable by store, region, device type, source and status, with full alert history. ${rows.length} in the live window.`}>
      <div className="flex flex-wrap gap-2 mb-2 items-end"><label className="text-[11.5px] text-ink3 flex flex-col">Store<input value={f.q} onChange={e => setF({ ...f, q: e.target.value })} placeholder="number or name" className="h-8 mt-0.5 rounded-md border border-line bg-panel px-2 text-[12.5px] text-ink w-[150px]" /></label><Sel k="region" label="Region" /><Sel k="type" label="Device type" /><Sel k="src" label="Source" /><Sel k="st" label="Status" /></div>
      <div className="divide-y divide-line/70 border border-line rounded-lg">{shown.map(e => <button key={e.id} onClick={() => e.inc ? act.drill({ t: 'incident', id: e.inc }) : act.drill({ t: 'branch', id: e.branchId })} className="w-full text-left grid grid-cols-[54px_70px_minmax(0,1fr)_auto] md:grid-cols-[54px_70px_170px_minmax(0,1fr)_80px_120px] gap-2 items-center px-2.5 py-1.5 text-[12px] hover:bg-chip/50 feed-in">
        <code className="text-[11px] text-ink3">{hhmmss(e.t)}</code><span><Src s={e.src} /></span><span className="hidden md:block truncate text-ink">{e.b.name}</span><span className="truncate text-ink2">{e.msg}</span><span className="hidden md:block text-ink3">{e.type}</span><Pill tone={e.status === 'Incident' ? 'red' : e.status === 'Open' ? 'amber' : e.status === 'Auto-cleared' ? 'green' : 'gray'}>{e.status}</Pill></button>)}{!shown.length && <div className="p-3 text-[12.5px] text-ink3">No alert matches.</div>}</div>
    </Box>
  );
}

// ───────── ServiceNow and AI ─────────
export function SnowAI() {
  const { s, act } = useApp(); const { L } = useLive(); const now = useNow();
  const tc = todayCounts(L, s);
  const open = s.incidents.filter(i => i.state !== 'Resolved').sort((a, b) => a.pri.localeCompare(b.pri));
  const [sel, setSel] = useState(null); const inc = open.find(i => i.id === sel) || open[0];
  const cp = inc && copilot(inc);
  const sent = tc.inc, upd = tc.inc * 6 + open.length * 2, recv = Math.round(upd * 0.45);
  const drift = DRIFT.p.series, base = drift.map((_, i) => drift[0] + i * 0.3);
  const log = useMemo(() => [...open.slice(0, 6).flatMap(i => [{ t: i.opened + 30e3, dir: 'out', w: 'Incident created', i }, ...(i.acked ? [{ t: i.acked, dir: 'in', w: `Assigned to ${i.assignee || i.group}`, i }] : [])]), ...s.resolved.slice(-4).map(i => ({ t: i.resolved, dir: 'in', w: 'Closed in ServiceNow, OpsRamp incident closed', i }))].filter(x => x.t <= now).sort((a, b) => b.t - a.t).slice(0, 10), [open.length, s.resolved.length, Math.floor(now / 20000)]);
  return (
    <div>
      <Hero kicker="ServiceNow integration and AI" title="Every real network problem becomes a well-formed, correctly routed ticket">OpsRamp connects to SRS's ServiceNow through a certified ServiceNow Store app, and stays in sync both ways. Only correlated, non-suppressed inferences reach ServiceNow, not raw alarms.</Hero>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
        <Tile label="Incidents sent today" value={num(sent)} sub={`from ${num(tc.events)} alarms, one per problem`} tone="ok" onClick={() => act.drill({ t: 'incidents', k: 'today' })} />
        <Tile label="Updates both ways" value={num(upd)} sub={`${num(recv)} came back from ServiceNow`} tone="info" />
        <Tile label="CIs kept current" value={num(D.DEVICES.length + D.CIRCUITS.length)} sub="devices and circuits pushed to the CMDB, nightly and on change" tone="ok" />
        <Tile label="Integration health" value="OK" sub="0 failed calls in 24 h; OAuth 2.0 token valid" tone="ok" />
      </div>
      <Box className="mt-3" title="Integration" sub="What each part of the ServiceNow connection does for SRS.">
        <T cols={[{ k: 'a', l: 'Integration', f: r => <b className="text-ink">{r.a}</b> }, { k: 'b', l: 'Direction', f: r => <Pill tone="blue">{r.b}</Pill> }, { k: 'c', l: 'What it does for SRS', cls: 'text-ink2' }, { k: 'd', l: 'Now', cls: 'text-ink text-[12px]' }]} rows={[
          { a: 'Incident', b: 'Two-way', c: 'OpsRamp opens the ServiceNow incident from an escalation policy, with the correlated alerts, store, device and probable cause attached. Updates flow both ways, and closing in either system closes the other.', d: `${open.length} open incidents in sync; last update ${hhmmss(now - 7000)}` },
          { a: 'CMDB', b: 'OpsRamp to ServiceNow', c: 'Store devices that OpsRamp discovers are pushed into the ServiceNow CMDB as configuration items, keeping the store asset record current.', d: `${num(D.DEVICES.length)} devices, ${num(D.CIRCUITS.length)} circuits; ${Math.max(1, Math.round(D.DEVICES.length * 0.002))} changed last night` },
          { a: 'Navigation', b: 'Two-way', c: 'Engineers jump from a ServiceNow ticket to the live OpsRamp view of that device, and back.', d: 'Deep link on every ticket' },
          { a: 'Security', b: 'n/a', c: 'OAuth 2.0 authentication, with integration health and audit logs.', d: 'Token refreshed 42 min ago; audit log on' },
        ]} />
      </Box>
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] gap-3 mt-3">
        <Box title="ServiceNow auto-ticketing: escalation policy and field mapping" sub="Policy decides when an inference becomes an incident; OpsRamp severity, store and category map to ServiceNow priority, assignment group, category and CI.">
          <T dense cols={[{ k: 'cond', l: 'When the inference is', f: r => <b className="text-ink">{r.cond}</b> }, { k: 'after', l: 'After' }, { k: 'sev', l: 'OpsRamp' }, { k: 'impact', l: 'Impact / urgency', f: r => `${r.impact} / ${r.urg}` }, { k: 'pri', l: 'Priority', f: r => <Pill tone={r.pri === 'P1' ? 'red' : r.pri === 'P2' ? 'amber' : 'gray'}>{r.pri}</Pill> }, { k: 'group', l: 'Assignment group', cls: 'text-ink2' }]} rows={PRIORITY_MAP} />
          <div className="text-[12px] font-bold text-ink mt-3 mb-1">Category mapping</div>
          <T dense cols={[{ k: 0, l: 'OpsRamp category', f: r => r[0] }, { k: 1, l: 'ServiceNow category', f: r => r[1] }, { k: 2, l: 'Assignment group (looked up in ServiceNow)', f: r => r[2] }]} rows={CATEGORY_MAP} />
        </Box>
        <Box title="What every ticket carries" sub="One ticket per problem, raised from the correlated inference, with rich context.">
          <ul className="space-y-1.5 text-[12.5px]">{[
            ['One ticket per problem', `A store outage creates one incident, not one per alarm: ${num(Math.max(0, tc.corr - tc.inc))} alerts were attached to existing tickets today.`],
            ['Rich context', 'Store, affected devices, probable cause, correlated alerts, recent changes and a link back to the live OpsRamp view.'],
            ['Configuration item association', 'Each incident links to the right CI, because OpsRamp keeps the CMDB in sync.'],
            ['Two-way lifecycle sync', 'Work notes, status and resolution flow both ways; closing in either system closes the other.'],
            ['Assignment lookup', 'OpsRamp looks up the ServiceNow user or group and routes the ticket directly.'],
            ['Integration health', 'Audit logs and monitoring show every ticket sent and received.'],
          ].map(([a, b]) => <li key={a} className="flex gap-2"><I.CheckCircle2 size={14} className="text-ok mt-[2px] shrink-0" /><span><b className="text-ink">{a}.</b> <span className="text-ink2">{b}</span></span></li>)}</ul>
          <div className="text-[12px] font-bold text-ink mt-3 mb-1">Sync log and audit</div>
          <div className="divide-y divide-line/70 border border-line rounded-md">{log.map((x, k) => <button key={k} onClick={() => act.drill({ t: 'incident', id: x.i.id })} className="w-full text-left flex items-center gap-2 px-2 py-1 text-[11.5px] hover:bg-chip/50"><code className="text-ink3">{hhmm(x.t)}</code>{x.dir === 'out' ? <I.ArrowRight size={12} className="text-brand" /> : <I.ArrowLeft size={12} className="text-info" />}<span className="font-mono text-ink">{x.i.id}</span><span className="text-ink2 truncate">{x.w}</span></button>)}</div>
        </Box>
      </div>
      <h2 className="text-[15px] font-bold text-ink mt-5 mb-2">AI capabilities</h2>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <Box title="Operations copilot" sub="A generative AI assistant that explains incidents in plain language, answers questions about the estate and suggests remediation." right={<select value={inc ? inc.id : ''} onChange={e => setSel(e.target.value)} className="h-8 rounded-md border border-line bg-panel px-2 text-[12px] text-ink max-w-[220px]">{open.slice(0, 15).map(i => <option key={i.id} value={i.id}>{i.id} {i.pri} {D.BR[i.branchId].name.split(' – ')[1]}</option>)}</select>}>
          {cp && <div className="space-y-2 text-[12.5px]"><div className="flex gap-2"><span className="w-7 h-7 rounded-full bg-chip grid place-items-center shrink-0"><I.User size={14} /></span><div className="bg-chip/60 rounded-lg px-3 py-2 text-ink">What is going on with {inc.id}, and what should we do?</div></div>
            <div className="flex gap-2"><span className="w-7 h-7 rounded-full bg-brand text-white grid place-items-center shrink-0"><I.Sparkles size={14} /></span><div className="border border-line rounded-lg px-3 py-2 text-ink2 space-y-1"><p><b className="text-ink">What:</b> {cp.what}</p><p><b className="text-ink">Why:</b> {cp.why}</p><p><b className="text-ink">Impact:</b> {cp.impact}</p><p><b className="text-ink">Next:</b> {cp.next}</p><p className="text-ink3">{cp.grouped}</p></div></div>
            <div className="text-[11.5px] text-ink3">HPE is extending the copilot to an agentic copilot for root-cause analysis and automated remediation, with human oversight.</div></div>}
        </Box>
        <Box title="Anomaly and change detection" sub={`Flags devices and circuits behaving outside their normal baseline before a threshold is crossed. ${DRIFT.b.name}, ${DRIFT.c.carrier} ${DRIFT.c.type}: latency drifting, no threshold broken yet.`}>
          <LineChart h={170} labels={drift.map((_, i) => `D-${drift.length - 1 - i}`)} yFmt={v => `${Math.round(v)} ms`} series={[{ name: 'Latency', color: C.s1, data: drift }, { name: 'Learned baseline', color: C.s3, data: base }]} band={{ lo: base.map(v => v - 3), hi: base.map(v => v + 3), color: C.s3 }} refLines={[{ v: 60, label: 'Static threshold 60 ms', color: C.bad }]} yMin={15} yMax={65} />
          <div className="text-[12px] text-ink2 mt-1">Out of its baseline for {drift.filter((v, i) => v > base[i] + 3).length} of the last {drift.length} days; a static threshold would not alert for weeks. Raised as a watch, with a carrier review.</div>
        </Box>
        <Box title="Machine-learning correlation and first response" sub="Groups related alarms and learns which ones to suppress, from SRS's own history.">
          {[['Alerts grouped by learned co-occurrence today', num(Math.round(tc.events * 0.07))], ['Suppressions learned from 12 months of history', `${POLICIES.filter(p => /learning|Training|seasonal/i.test(p.by)).length} policies`], ['Engineer acceptance of recommendations', '91%'], ['Inferences with a probable root-cause alert', `${Math.round(open.filter(i => (i.rca || []).length).length / Math.max(1, open.length) * 100)}%`]].map(([a, b]) => <div key={a} className="flex justify-between text-[12.5px] py-1 border-b border-line/60 last:border-0"><span className="text-ink2">{a}</span><b className="text-ink">{b}</b></div>)}
        </Box>
        <Box title="Automation" sub="Runbooks triggered from alerts, with approval gates for higher-risk actions.">
          {[['Collect diagnostics (evidence pack)', 'RB-106'], ['Restart an AP', 'RB-104'], ['Test SD-WAN failover and the payment path', 'RB-110'], ['Fail traffic over to the backup line', 'RB-101']].map(([a, rb]) => { const r = D.RB[rb]; return <div key={rb} className="flex items-center gap-2 text-[12.5px] py-1 border-b border-line/60 last:border-0"><span className="flex-1 text-ink">{a}</span><span className="text-ink3">{rb} · {r.runs30} runs, {Math.round(r.success * 100)}%</span>{r.kind === 'readonly' ? <Pill tone="green">automatic</Pill> : <Pill tone="amber">approval gate</Pill>}</div>; })}
          <div className="text-[11.5px] text-ink3 mt-2">This is the same telemetry and ticket history that feeds the Network Intelligence dashboards (Now, Then and Next).</div>
        </Box>
      </div>
    </div>
  );
}

// ───────── outcomes ─────────
export function Outcomes() {
  const { s } = useApp(); const { L } = useLive(); const tc = todayCounts(L, s);
  return (
    <div>
      <Hero kicker="What SRS gains" title="Outcomes, and how OpsRamp delivers them">Measured on SRS's own data during the pilot. Today's live figures from this console are shown alongside.</Hero>
      <Box className="mt-3" title="Outcome for SRS">
        <T cols={[{ k: 'a', l: 'Outcome', f: r => <b className="text-ink">{r.a}</b> }, { k: 'b', l: 'How OpsRamp delivers it', cls: 'text-ink2' }, { k: 'c', l: 'Measured here today', f: r => <b className="text-ink">{r.c}</b> }]} rows={[
          { a: 'Far fewer alarms to triage', b: "De-duplication plus ML correlation. OpsRamp's own analysis across 100+ customer environments found up to 92% alert-volume reduction.", c: `${Math.round(tc.noise * 100)}% of ${num(tc.events)} events removed; ${tc.inc} incidents` },
          { a: 'Faster restoration', b: 'One correlated incident with probable cause, routed to the right team first time.', c: `${D.MTTR_MONTHS.P1.at(-1)} h P1 restore, down from ${D.MTTR_MONTHS.P1[0]} h in ${D.MTTR_MONTHS.months[0]}` },
          { a: 'Trust before automation', b: 'Observed and Recommend modes prove each policy on SRS data first.', c: `${POLICIES.filter(p => p.mode !== 'On').length} of ${POLICIES.length} policies still in shadow or recommend` },
          { a: 'Clean ServiceNow records', b: 'Only real incidents ticketed; CMDB kept current from discovery.', c: `0 duplicate tickets; ${num(D.DEVICES.length)} CIs current` },
          { a: 'Ready for Cisco and growth', b: 'New vendors added through the same integration framework.', c: 'Cisco SNMP and API templates ready' },
        ]} />
        <div className="text-[12px] text-ink3 mt-2 border-l-4 border-warn pl-3">The 92% figure is a vendor-measured upper bound; SRS's actual reduction will be baselined during the pilot.</div>
      </Box>
    </div>
  );
}
