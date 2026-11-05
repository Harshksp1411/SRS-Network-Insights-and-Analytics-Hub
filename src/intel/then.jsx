// Dashboard 2: Managed Services Performance and Trends (Then). How well has the network and the service been run,
// and what keeps recurring? From ServiceNow history, enriched with OpsRamp events.
import React, { useMemo, useState } from 'react';
import * as I from 'lucide-react';
import * as D from '../data.js';
import { useApp, useNow } from '../store.jsx';
import { Bars, LineChart, Spark, Legend, C } from '../charts.jsx';
import { BarRow, Box, Pill, T } from '../sites/shell.jsx';
import { PeriodBar, ExploreBtn, Headline, Kpis, Trio, ChartCards, Insight, SectionHead, COLORS } from '../sites/dash.jsx';
import { thenModel, THEN_RANGES, REGIONS, CAUSES } from './model.js';
import { num, dur, dateShort, hhmm, MIN, HR, DAY } from '../util.js';
import { cx } from '../ui.jsx';
import { execPdf } from './pdf.js';

const pc = (v, d = 1) => `${(v * 100).toFixed(d)}%`;
const hm = h => h < 1 ? `${Math.round(h * 60)}m` : `${Math.floor(h)}h ${String(Math.round((h % 1) * 60)).padStart(2, '0')}m`;
const AUD = [['exec', 'Executive summary'], ['owner', 'Service owner'], ['vendor', 'Vendor and carrier']];

export function ThenLens({ region, setRegion }) {
  const { s, act } = useApp(); const now = useNow();
  const [range, setRange] = useState('90d');
  const [aud, setAud] = useState('exec');
  const m = useMemo(() => thenModel(range, region), [range, region]);
  const dr = n => act.drill(region === 'All' ? n : { ...n, region });
  const word = { '30d': 'last 30 days', '90d': 'last 90 days', '12m': 'last 12 months' }[range];
  const vs = { '30d': 'vs last month', '90d': 'vs last qtr', '12m': 'vs a year ago' }[range];
  const topCarrier = m.carriers[0], carrierShare = topCarrier ? topCarrier.outages / Math.max(1, m.carriers.reduce((a, c) => a + c.outages, 0)) : 0;
  const mttrDelta = m.prevMttrP1 != null ? (m.mttrP1 - m.prevMttrP1) * 60 : (m.P.mttr.P1.at(-1) - m.P.mttr.P1[0]) * 60;
  const incDelta = m.prevTickets ? m.tickets / m.prevTickets - 1 : m.byMonth.at(-1).total / Math.max(1, m.byMonth[0].total) - 1;
  const credits = m.carriers.filter(c => c.credits > 0);
  const slaM = m.P.months.map((_, i) => ['P1', 'P2', 'P3', 'P4'].reduce((acc, q) => acc + { P1: 0.02, P2: 0.08, P3: 0.45, P4: 0.45 }[q] * m.sla12.find(x => x.q === q).res.series[i], 0));
  const R = region === 'All' ? {} : { region };
  const go = n => act.drill(n);
  const autoShare = m.byMonth.reduce((a, x) => a + x.auto, 0) / Math.max(1, m.tickets);
  const metP = m.sla12.filter(x => x.res.avg >= x.res.m.esl).length;
  const CAUSE_C = { isp: C.s1, hw: C.s4, cfg: C.s5, power: COLORS.warn, user: C.s3 };
  const visuals = [
    { id: 'inc', kind: 'cols', title: 'Incidents per month', go: { t: 'incidents', k: 'resolved7', ...R }, keys: ['Auto-resolved', 'By an engineer'], colors: [C.ok, C.s1], caption: `${pc(autoShare, 0)} resolved by automation with no engineer. ${m.byMonth.at(-1).total <= m.byMonth[0].total ? 'Down' : 'Up'} ${Math.abs(Math.round((m.byMonth.at(-1).total / Math.max(1, m.byMonth[0].total) - 1) * 100))}% since ${m.byMonth[0].label}.`,
      data: m.byMonth.map(x => ({ label: x.label, 'Auto-resolved': x.auto, 'By an engineer': x.total - x.auto })), goes: m.byMonth.map(() => ({ t: 'incidents', k: 'resolved7', ...R })) },
    { id: 'repeat', kind: 'hbars', title: `Repeat-offender stores, ${word}`, go: { t: 'set', k: 'trouble7', ...R }, fmt: 'n', caption: 'The branches with the most incidents, and their main cause. Decision: targeted remediation or a site survey.',
      rows: m.repeatStores.slice(0, 8).map(x => ({ label: x.b.name, value: x.tickets, sub: x.driver, color: COLORS.warn, go: { t: 'branch', id: x.b.id } })) },
    { id: 'cause', kind: 'donut', title: 'Where incidents come from', go: { t: 'incidents', k: 'resolved7', ...R }, center: pc(m.cause.isp / m.causeTot, 0), sub: 'carrier / ISP', caption: 'Root cause after AI-assisted classification of the ticket text. Decision: where to invest, in carriers, refresh or process.',
      parts: CAUSES.map(([k, l]) => ({ label: l, value: Math.round(m.cause[k]), color: CAUSE_C[k], go: { t: 'incidents', k: 'resolved7', ...R } })) },
    { id: 'carriers', kind: 'hbars', title: `Carrier outages, ${word}`, go: { t: 'lines', k: 'all', ...R }, fmt: 'n', caption: `Outages against contract; ${m.carriers.filter(c => c.credits > 0).length} carriers owe SLA credits ($${num(Math.round(m.carriers.reduce((a, c) => a + c.credits, 0)))}).`,
      rows: m.carriers.map(c => ({ label: c.n, value: c.outages, sub: `${(c.avail * 100).toFixed(2)}% available · restore ${hm(c.restore)}`, color: c.avail >= c.contract ? C.s1 : COLORS.warn, go: { t: 'carrier', carrier: c.n } })) },
    { id: 'mttr', kind: 'line', title: 'Time to restore by priority, month by month', go: { t: 'mttr' }, labels: m.P.months.map(x => x.m), fmt: 'h', yMin: 0, caption: `P1 ${hm(m.mttrP1)} on average over the period; targets P1 4 h, P2 8 h, P3 24 h.`,
      series: [{ name: 'P1', color: C.bad, data: m.P.mttr.P1 }, { name: 'P2', color: COLORS.warn, data: m.P.mttr.P2 }, { name: 'P3', color: C.s1, data: m.P.mttr.P3 }] },
    { id: 'volume', kind: 'line', title: 'Volume trends, 12 months', go: { t: 'incidents', k: 'opened7', ...R }, labels: m.months12.map(x => x.label), fmt: 'n', yMin: 0, caption: `Incidents, requests and changes by month. Peak season (spring roofing): ${m.months12.filter(x => x.season).map(x => x.label).join(', ')}.`,
      series: [{ name: 'Incidents', color: C.s1, data: m.months12.map(x => x.incidents) }, { name: 'Requests', color: C.s4, data: m.months12.map(x => x.requests) }, { name: 'Changes', color: C.s5, data: m.months12.map(x => x.changes) }] },
  ];
  const insights = [
    { kicker: 'SLA', title: `${metP} of 4 priorities met their resolution level on average`, line: `${m.breaches.length} priority-months fell short; each is explained.`, stats: m.sla12.map(x => ({ value: pc(x.res.avg), label: `${x.q} resolution`, tone: x.res.avg >= x.res.m.esl ? 'ok' : 'warn' })), points: m.breaches.slice(0, 3).map(b => ({ b: `${b.q}, ${b.month}`, t: `${pc(b.v)} vs ${pc(b.esl, 0)}; main driver: ${b.why}`, tone: 'warn' })), go: () => act.drill({ t: 'sla', per: m.n }) },
    { kicker: 'Field dispatch', title: `${num(m.rolls)} truck rolls, about ${num(Math.round(m.avoidable))} avoidable`, line: 'By reason; the avoidable share is the case for remote fixes and depot sparing.', bars: m.rollReasons.slice(0, 4).map(r => ({ label: r.label, value: r.n, tone: 'info' })), go: () => act.drill({ t: 'incidents', k: 'resolved7' }) },
    { kicker: 'Repeat offenders', title: `${m.repeatLines.length} circuits keep failing for the same reason`, line: 'Decision: replace, re-cable or escalate to the carrier.', points: m.repeatLines.slice(0, 4).map(c => ({ b: c.id, t: `${c.carrier} ${c.type}, ${c.tickets90} tickets in 90 days`, tone: 'warn' })), go: () => act.drill({ t: 'lines', k: 'repeat', ...R }) },
    { kicker: 'Changes', title: `${pc(m.chg.ok / m.chg.total)} of ${m.chg.total} changes succeeded`, stats: [{ value: m.chg.ok, label: 'successful', tone: 'ok' }, { value: m.chg.failed, label: 'failed', tone: 'bad' }, { value: m.chg.emergency, label: 'emergency', tone: 'warn' }, { value: m.chg.inc, label: 'caused an incident' }], go: () => act.drill({ t: 'changes', k: 'next7' }) },
  ];
  const status = m.sla >= 0.95 ? { label: 'Service status', word: 'On target', kind: 'ok' } : { label: 'Service status', word: 'Below target', kind: 'warn' };
  return (
    <div>
      <PeriodBar views={THEN_RANGES} value={range} onChange={setRange} note={`${m.P.from} to ${m.P.to} · source ServiceNow, enriched with OpsRamp events`} region={region} onRegion={setRegion} regions={REGIONS}
        right={<ExploreBtn icon={I.FileDown} onClick={() => { execPdf(m, region, word); act.toast('Monthly executive summary downloaded'); }}>Executive summary PDF</ExploreBtn>} />
      <Headline status={status} scope={`Managed services performance and trends · ${region === 'All' ? 'All regions' : region} · ${word}`} headline={`SLA at ${pc(m.sla)}, MTTR for P1 ${mttrDelta <= 0 ? `down ${Math.round(-mttrDelta)} min` : `up ${Math.round(mttrDelta)} min`} ${vs}`} deck={`${num(m.tickets)} incidents, ${pc(autoShare, 0)} resolved by automation. ${topCarrier ? `${topCarrier.n} drives ${Math.round(carrierShare * 100)}% of carrier outages${carrierShare > 0.25 ? '; raise it at the QBR' : ''}.` : ''}`} spotlight={m.repeatStores[0] && `${m.repeatStores[0].b.name} is the top repeat offender: ${m.repeatStores[0].tickets} incidents, main cause: ${m.repeatStores[0].driver}.`} onSpot={() => m.repeatStores[0] && act.drill({ t: 'branch', id: m.repeatStores[0].b.id })} />
      <Kpis cols={5} items={[
        { label: 'SLA attainment', value: pc(m.sla), tone: m.sla >= 0.95 ? 'ok' : 'warn', sub: `${m.prevSla != null ? `${m.sla >= m.prevSla ? '▲' : '▼'} ${Math.abs((m.sla - m.prevSla) * 100).toFixed(1)} pts, ` : ''}target 95%`, spark: slaM.length > 1 ? slaM : null, go: () => act.drill({ t: 'sla', per: m.n }) },
        { label: 'MTTR, P1', value: hm(m.mttrP1), tone: 'ok', sub: `${mttrDelta <= 0 ? '▼' : '▲'} ${Math.abs(Math.round(mttrDelta))} min ${vs}`, spark: m.P.mttr.P1.length > 1 ? m.P.mttr.P1 : null, go: () => act.drill({ t: 'mttr' }) },
        { label: 'Incidents', value: num(m.tickets), tone: 'info', sub: `${incDelta <= 0 ? '▼' : '▲'} ${Math.abs(Math.round(incDelta * 100))}% ${m.prevTickets ? vs : 'first to last month'}`, spark: m.byMonth.length > 1 ? m.byMonth.map(x => x.total) : null, go: () => dr({ t: 'incidents', k: 'resolved7' }) },
        { label: 'Remote fix rate', value: pc(m.remote, 0), tone: m.remote >= 0.8 ? 'ok' : 'warn', sub: `target 80%; ${num(m.rolls)} truck rolls`, go: () => dr({ t: 'incidents', k: 'resolved7' }) },
        { label: 'Change success', value: pc(m.chg.ok / m.chg.total), tone: m.chg.ok / m.chg.total >= 0.98 ? 'ok' : 'warn', sub: `${m.chg.failed} failed of ${m.chg.total}`, go: () => act.drill({ t: 'changes', k: 'next7' }) },
      ]} />
      <Trio
        attention={[...m.breaches.slice(0, 2).map(b => ({ text: `${b.q} resolution ${b.month}: ${pc(b.v)} against ${pc(b.esl, 0)}.`, go: () => act.drill({ t: 'sla', per: m.n }) })), ...(topCarrier ? [{ text: `${topCarrier.n}: ${topCarrier.outages} outages, ${Math.round(carrierShare * 100)}% of carrier outages; restore ${hm(topCarrier.restore)}.`, go: () => act.drill({ t: 'carrier', carrier: topCarrier.n }) }] : []), { text: `${m.repeatLines.length} repeat-offender circuits to replace or escalate.`, go: () => act.drill({ t: 'lines', k: 'repeat', ...R }) }, { text: `About ${num(Math.round(m.avoidable))} truck rolls could have been avoided.`, go: () => dr({ t: 'incidents', k: 'resolved7' }) }].slice(0, 5)}
        well={[{ text: `P1 time to restore ${mttrDelta <= 0 ? 'down' : 'up'} ${Math.abs(Math.round(mttrDelta))} min ${vs}, now ${hm(m.mttrP1)}.`, go: () => act.drill({ t: 'mttr' }) }, { text: `${pc(autoShare, 0)} of incidents resolved by automation with no engineer.`, go: () => dr({ t: 'incidents', k: 'auto7' }) }, { text: `${m.chg.ok} of ${m.chg.total} changes went in cleanly.`, go: () => act.drill({ t: 'changes', k: 'next7' }) }, { text: `${pc(m.remote, 0)} of issues fixed remotely, without a truck roll.`, go: () => dr({ t: 'incidents', k: 'resolved7' }) }]}
        ahead={[{ when: 'Monthly', kind: 'Service review', what: `SLAs, trends, ${m.repeatStores.length} repeat offenders and improvements delivered`, go: () => setAud('exec') }, { when: 'Quarterly', kind: 'Business review', what: 'Availability outcomes, carrier performance and the refresh plan', go: () => setAud('vendor') }, ...s.problems.filter(p => p.state !== 'Closed').slice(0, 3).map(p => ({ when: p.id.slice(-4), kind: 'Problem record', what: p.title, go: () => setAud('owner') }))]} aheadTitle="Reviews and open problems" />
      <div className="mt-4"><ChartCards visuals={visuals} go={go} /></div>
      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4 mt-4">{insights.map(x => <Insight key={x.kicker} x={x} />)}</div>
      <SectionHead sub="the same numbers, cut for each audience">Views by audience</SectionHead>
      <div className="flex flex-wrap items-center gap-2 mb-3">{AUD.map(([k, l]) => <button key={k} onClick={() => setAud(k)} className={cx('h-9 px-3 rounded-md border text-[13px] font-semibold', aud === k ? 'bg-ink text-canvas border-ink' : 'bg-panel border-line text-ink2 hover:bg-chip')}>{l}</button>)}</div>
      {aud === 'exec' && <ExecView m={m} act={act} dr={dr} word={word} />}
      {aud === 'owner' && <OwnerView m={m} s={s} now={now} act={act} word={word} />}
      {aud === 'vendor' && <VendorView m={m} act={act} word={word} credits={credits} />}
      <HowThen m={m} />
    </div>
  );
}

function ExecView({ m, act, word }) {
  return (<>
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-3"><SlaByPriority m={m} /><CarrierCard m={m} act={act} /></div>
    <Insights m={m} act={act} word={word} />
  </>);
}

function CarrierCard({ m, act }) {
  return (
    <Box title="Carrier scorecard" sub="Availability across each carrier's lines, outages and average restore time, against the contracted level.">
      <T cols={[{ k: 'n', l: 'Carrier', f: c => <b className="text-ink">{c.n}</b> }, { k: 'avail', l: 'Availability', f: c => <div className="flex items-center gap-2"><span className="relative h-2 bg-chip rounded-full w-[90px]"><span className={cx('absolute inset-y-0 left-0 rounded-full', c.avail >= c.contract ? 'bg-ok' : 'bg-warn')} style={{ width: `${Math.max(3, (c.avail - 0.998) / 0.002 * 100)}%` }} /></span><b className="tabular-nums">{(c.avail * 100).toFixed(2)}%</b></div> }, { k: 'contract', l: 'Contract', r: true, f: c => `${(c.contract * 100).toFixed(2)}%` }, { k: 'outages', l: 'Outages', r: true }, { k: 'restore', l: 'Restore', r: true, f: c => hm(c.restore) }]} rows={m.carriers} onRow={c => act.drill({ t: 'carrier', carrier: c.n })} />
      <div className="text-[12px] text-ink2 mt-2">SLA credits due from {m.carriers.filter(c => c.credits > 0).length} carriers this period: <b className="text-ink">${num(Math.round(m.carriers.reduce((a, c) => a + c.credits, 0)))}</b>.</div>
    </Box>
  );
}

function SlaByPriority({ m }) {
  return (
    <Box title="SLA attainment by priority, month by month" sub="Response and resolution inside the Annexure B time. Months below the expected level are explained underneath.">
      <T dense cols={[{ k: 'q', l: 'Priority', f: x => <b>{x.q}</b> }, { k: 'resp', l: 'Response', f: x => <div className="flex items-center gap-2"><Spark data={x.resp.series} w={70} h={18} color={C.s1} fill={false} /><b className="tabular-nums">{pc(x.resp.avg)}</b></div> }, { k: 'res', l: 'Resolution', f: x => <div className="flex items-center gap-2"><Spark data={x.res.series} w={70} h={18} color={C.s4} fill={false} /><b className="tabular-nums">{pc(x.res.avg)}</b></div> }, { k: 'esl', l: 'Expected', r: true, f: x => pc(x.res.m.esl, 0) }, { k: 'met', l: 'Months met', r: true, f: x => `${x.res.met} of ${m.n}` }]} rows={m.sla12} />
      <div className="mt-2 text-[12px]"><div className="font-bold text-ink mb-1">Breaches explained</div>{m.breaches.length ? <ul className="space-y-0.5">{m.breaches.slice(0, 5).map((b, i) => <li key={i} className="text-ink2"><b className="text-ink">{b.q} resolution, {b.month}:</b> {pc(b.v)} against {pc(b.esl, 0)}, {b.late >= 1 ? `about ${b.late} ticket${b.late > 1 ? 's' : ''} late` : 'under one ticket late'}; the main driver that month: {b.why}.</li>)}</ul> : <div className="text-ink3">No month below the expected level.</div>}{m.breaches.length > 5 && <div className="text-ink3 mt-0.5">and {m.breaches.length - 5} more priority-months.</div>}</div>
    </Box>
  );
}

function VolumeChart({ m }) {
  return (<>
    <LineChart h={190} labels={m.months12.map(x => x.label)} yFmt={v => num(Math.round(v))} series={[{ name: 'Incidents', color: C.s1, data: m.months12.map(x => x.incidents) }, { name: 'Requests', color: C.s4, data: m.months12.map(x => x.requests) }, { name: 'Changes', color: C.s5, data: m.months12.map(x => x.changes) }, { name: 'Problems', color: C.bad, data: m.months12.map(x => x.problems * 10) }]} />
    <div className="flex flex-wrap items-center gap-3 mt-1"><Legend items={[['Incidents', C.s1], ['Requests', C.s4], ['Changes', C.s5], ['Problems (x10)', C.bad]]} /><span className="text-[11.5px] text-ink3">Peak season: {m.months12.filter(x => x.season).map(x => x.label).join(', ')}</span></div>
  </>);
}

function Insights({ m, act, word }) {
  const maxRoll = Math.max(...m.rollReasons.map(r => r.n), 1);
  return (<>
    <h2 className="text-[15px] font-bold text-ink mt-5 mb-2">Network insights from ticket history</h2>
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      <Box title="Repeat-offender devices and circuits" sub="Assets with recurring tickets and the same root cause. Decision: replace, re-cable or escalate to the carrier.">
        {m.repeatLines.slice(0, 6).map(c => <button key={c.id} onClick={() => act.drill({ t: 'circuit', id: c.id })} className="w-full text-left flex items-center gap-2 py-1 text-[12.5px] hover:bg-chip/50 rounded px-1"><span className="font-mono text-ink">{c.id}</span><span className="text-ink3 truncate flex-1">{c.carrier} {c.type}, {c.flaps30} drops in 30 d</span><b className="tabular-nums">{c.tickets90}</b><Pill tone="amber">escalate</Pill></button>)}
      </Box>
      <Box title="Root cause mix" sub="Decision: where to invest, in carriers, hardware refresh or process.">
        {CAUSES.map(([k, l]) => <div key={k} className="flex items-center gap-2 text-[12.5px] py-0.5"><span className="flex-1 text-ink">{l}</span><b className="tabular-nums">{num(Math.round(m.cause[k]))}</b><span className="text-ink3 w-10 text-right">{pc(m.cause[k] / m.causeTot, 0)}</span></div>)}
        <div className="text-[11.5px] text-ink3 mt-1">{pc(m.cause.isp / m.causeTot, 0)} sits with the carriers: the case for the carrier reviews.</div>
      </Box>
      <Box title="Field dispatch analysis" sub={`Truck rolls by reason and store, and how many could have been avoided, ${word}. Decision: depot sparing and field capacity.`}>
        <div className="flex items-baseline gap-2 mb-1"><span className="text-[22px] font-bold text-ink tabular-nums">{num(m.rolls)}</span><span className="text-[12px] text-ink3">truck rolls, about {num(Math.round(m.avoidable))} avoidable ({pc(m.avoidable / Math.max(1, m.rolls), 0)})</span></div>
        {m.rollReasons.slice(0, 5).map(r => <BarRow key={r.k} label={r.label} sub={`${pc(r.avoid, 0)} avoidable`} value={r.n} frac={r.n / maxRoll} tone="ink" />)}
        <div className="text-[11.5px] text-ink3 mt-1">Most visits: {m.rollStores.slice(0, 3).map(x => `${x.b.name.split(' – ')[1]} (${x.n})`).join(', ')}.</div>
      </Box>
      <Box title="Request patterns" sub="Moves, adds, changes and new-store requests by volume and cycle time. Decision: standard catalog items and automation.">
        <T dense cols={[{ k: 'l', l: 'Request' }, { k: 'n', l: 'Volume', r: true, f: r => num(r.n) }, { k: 'days', l: 'Cycle', r: true, f: r => `${r.days} d` }, { k: 'cat', l: '', f: r => r.cat ? <Pill tone="green">catalog</Pill> : <Pill>review</Pill> }]} rows={m.requests} />
      </Box>
      <Box title="First-time fix and remote resolution" sub="How often an issue is closed without a truck roll, and without a second visit.">
        <div className="grid grid-cols-2 gap-3">{[['Remote resolution', m.remote, 0.8], ['First-time fix', m.firstFix, 0.85]].map(([l, v, t]) => <div key={l} className="border border-line rounded-lg p-3"><div className="text-[12px] text-ink3">{l}</div><div className={cx('text-[24px] font-bold tabular-nums', v >= t ? 'text-ok' : 'text-warn')}>{pc(v, 0)}</div><div className="text-[11.5px] text-ink3">target {pc(t, 0)}</div></div>)}</div>
        <div className="text-[12px] text-ink2 mt-2">A remote fix takes <b className="text-ink">{hm(m.remoteH)}</b> on average; a field visit <b className="text-ink">{hm(m.fieldH)}</b>.</div>
      </Box>
      <Box title="Change success" sub="Successful, failed and emergency changes, and incidents caused by changes.">
        <div className="grid grid-cols-2 gap-2 text-[12.5px]">{[['Successful', m.chg.ok, 'text-ok'], ['Failed', m.chg.failed, 'text-bad'], ['Emergency', m.chg.emergency, 'text-warn'], ['Caused an incident', m.chg.inc, 'text-ink']].map(([l, v, c]) => <div key={l} className="border border-line rounded px-2.5 py-1.5"><div className={cx('text-[20px] font-bold tabular-nums', c)}>{v}</div><div className="text-ink3">{l}</div></div>)}</div>
        <button onClick={() => act.drill({ t: 'changes', k: 'next7' })} className="text-[12px] text-info hover:underline mt-2">See the changes coming up</button>
      </Box>
    </div>
  </>);
}

function OwnerView({ m, s, now, act, word }) {
  const open = s.incidents.filter(i => i.state !== 'Resolved');
  const buckets = [['Under 4 h', 0, 4], ['4 to 24 h', 4, 24], ['1 to 3 days', 24, 72], ['Over 3 days', 72, 1e9]].map(([l, a, z]) => ({ l, n: open.filter(i => { const h = (now - i.opened) / HR; return h >= a && h < z; }).length }));
  const max = Math.max(...buckets.map(b => b.n), 1);
  return (<>
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
      <Box title="Backlog ageing" sub={`${open.length} open incidents now, by age.`}>
        {buckets.map(b => <BarRow key={b.l} label={b.l} value={b.n} frac={b.n / max} tone={b.l === 'Over 3 days' ? 'warn' : 'info'} onClick={() => act.drill({ t: 'incidents', k: 'open' })} />)}
      </Box>
      <Box title="MTTA and MTTR by priority" sub={`Average time to acknowledge and to restore, ${word}.`}>
        <T dense cols={[{ k: 'q', l: 'Priority', f: q => <b>{q}</b> }, { k: 'a', l: 'MTTA', r: true, f: q => `${m.mtta[q]} min` }, { k: 'r', l: 'MTTR', r: true, f: q => hm(m.mttrP[q]) }, { k: 't', l: 'Target', r: true, f: q => q === 'P4' ? '96h' : `${D.MTTR_MONTHS.target[q]}h` }]} rows={['P1', 'P2', 'P3', 'P4']} />
        <div className="text-[12px] text-ink2 mt-2">Field dispatch fixes average <b className="text-ink">{hm(m.fieldH)}</b>, remote fixes <b className="text-ink">{hm(m.remoteH)}</b>.</div>
      </Box>
      <Box title="Breaches" sub="Priority-months below the expected resolution level, with the cause.">
        {m.breaches.length ? m.breaches.slice(0, 7).map((b, i) => <div key={i} className="flex items-center gap-2 text-[12.5px] py-0.5"><Pill tone="amber">{b.q}</Pill><span className="text-ink">{b.month}</span><span className="text-ink3 truncate flex-1">{b.why}</span><b className="tabular-nums">{pc(b.v)}</b></div>) : <div className="text-[12.5px] text-ink3">None.</div>}
      </Box>
    </div>
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 mt-3">
      <Box title="Resolver-group performance" sub="Tickets resolved and average restore time by group.">
        <T dense cols={[{ k: 'k', l: 'Group' }, { k: 'n', l: 'Share', r: true, f: x => pc(x.n / m.byGroup.reduce((a, g) => a + g.n, 0), 0) }, { k: 'h', l: 'MTTR', r: true, f: x => hm(x.h) }]} rows={m.byGroup} />
      </Box>
      <Box title="MTTR by region" sub="Average time to restore, by region.">
        {m.byRegion.map(x => <BarRow key={x.k} label={x.k} value={hm(x.h)} frac={x.h / Math.max(...m.byRegion.map(r => r.h))} tone="info" />)}
      </Box>
      <Box title="MTTR by issue category" sub="Average time to restore, by category.">
        {m.byCat.map(x => <BarRow key={x.k} label={x.k} value={hm(x.h)} frac={x.h / Math.max(...m.byCat.map(r => r.h))} tone="ink" />)}
      </Box>
    </div>
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 mt-3"><SlaByPriority m={m} /><Box title="Volume trends" sub="Incidents, service requests, changes and problems by month. Shaded months are spring roofing season."><VolumeChart m={m} /></Box></div>
  </>);
}

function VendorView({ m, act, word, credits }) {
  const partners = [
    { n: 'Simplify (access-link monitoring)', what: 'Watches the ISP access links upstream and raises their tickets', kpi: `${num(Math.round(m.cause.isp * 0.7))} access-link tickets raised, ${word}`, ok: true },
    { n: 'HPE Aruba TAC', what: 'Replacement hardware (RMA) and software faults', kpi: `${Math.max(2, Math.round(m.rolls * 0.08))} RMAs, average 1.4 days to ship`, ok: true },
    { n: 'SRS field technical services', what: 'On-site work booked by the Movate NOC', kpi: `${num(m.rolls)} visits, ${pc(1 - m.avoidable / Math.max(1, m.rolls), 0)} needed`, ok: m.avoidable / Math.max(1, m.rolls) < 0.35 },
  ];
  return (<>
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
      <CarrierCard m={m} act={act} />
      <Box title="Carrier performance against contract" sub="Outages and restore time by ISP, for governance meetings.">
        <T dense cols={[{ k: 'n', l: 'Carrier', f: c => <b>{c.n}</b> }, { k: 'lines', l: 'Lines', r: true }, { k: 'slaMet', l: 'Repairs on time', r: true, f: c => pc(c.slaMet, 0) }, { k: 'repeat', l: 'Repeat lines', r: true }, { k: 'credits', l: 'Credits due', r: true, f: c => c.credits ? `$${num(Math.round(c.credits))}` : '–' }]} rows={m.carriers} onRow={c => act.drill({ t: 'carrier', carrier: c.n })} />
        <div className="text-[12px] text-ink2 mt-2">{credits.length ? `Raise credits with ${credits.map(c => c.n).join(', ')} at the next review.` : 'No credits due this period.'}</div>
      </Box>
    </div>
    <Box className="mt-3" title="Partner performance" sub="Each party that owns a layer, measured the same way, so the picture is joined up whoever runs the layer.">
      <T cols={[{ k: 'n', l: 'Partner', f: p => <b className="text-ink">{p.n}</b> }, { k: 'what', l: 'Owns' }, { k: 'kpi', l: `Performance, ${word}` }, { k: 'ok', l: '', f: p => <Pill tone={p.ok ? 'green' : 'amber'}>{p.ok ? 'on track' : 'review'}</Pill> }]} rows={partners} />
    </Box>
  </>);
}

function HowThen({ m }) {
  const ex = D.RESOLVED.find(i => i.kind === 'circuit') || D.RESOLVED[0];
  const lag = Math.max(4, Math.round((ex.signals[ex.signals.length - 1].t - ex.signals[0].t) / MIN) + 11);
  const samples = D.RESOLVED.slice(0, 40).filter((x, i) => i % 9 === 0).slice(0, 4);
  return (
    <Box className="mt-3" title="How it works" sub="ServiceNow stays the system of record for the service history.">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-[12.5px]">
        <div><div className="font-bold text-ink mb-1">Scheduled extraction</div><T dense cols={[{ k: 'a', l: 'ServiceNow table' }, { k: 'b', l: 'Every' }]} rows={[{ a: 'Incidents', b: '15 min' }, { a: 'Requests', b: '15 min' }, { a: 'Changes', b: '1 hour' }, { a: 'Problems', b: '1 hour' }, { a: 'Configuration items', b: 'nightly' }]} /><div className="text-ink3 mt-1">Through the ServiceNow REST APIs, with a read-only account. Each record maps to the same store and device hierarchy as the Now view.</div></div>
        <div><div className="font-bold text-ink mb-1">Outage measured from the network event</div><div className="text-ink2">Tickets are enriched with OpsRamp event data, so the real outage starts at the first network alarm, not when the ticket was raised. Example <span className="font-mono">{ex.id}</span>: the first alarm came {lag} min before the ticket, so the outage is {lag} min longer than the ticket shows.</div></div>
        <div><div className="font-bold text-ink mb-1">AI-assisted classification</div><div className="text-ink2 mb-1">Free-text descriptions are normalised into one set of root-cause categories, closing the gap left by inconsistent manual categorisation:</div>{samples.map(i => <div key={i.id} className="flex items-start gap-1.5 py-0.5"><span className="text-ink3 flex-1 truncate">"{i.title}"</span><I.ArrowRight size={12} className="text-ink3 mt-[3px] shrink-0" /><Pill tone="blue">{i.cat}</Pill></div>)}</div>
      </div>
    </Box>
  );
}
