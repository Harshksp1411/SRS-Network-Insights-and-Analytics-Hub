// Dashboard 1: Near Real-Time Network Health (Now). Are our stores online, and is the network performing right now?
import React, { useMemo, useState } from 'react';
import * as I from 'lucide-react';
import * as D from '../data.js';
import { useApp, useNow } from '../store.jsx';
import { useLive } from '../live.jsx';
import { NAMap, Legend, C } from '../charts.jsx';
import { statusOf } from '../dash/drilldata.js';
import { BarRow, Box, Pill, T } from '../sites/shell.jsx';
import { PeriodBar, ExploreBtn, Headline, Kpis, Trio, ChartCards, Insight, LiveActivity, SectionHead, COLORS } from '../sites/dash.jsx';
import { STATUS } from '../dash/drilldata.js';
import { useLive as useLive2 } from '../live.jsx';
import { nowModel, NOW_RANGES, REGIONS, PROFILES } from './model.js';
import { num, dur, hhmm } from '../util.js';
import { cx } from '../ui.jsx';

const pc = (v, d = 2) => `${(v * 100).toFixed(d)}%`;
const COL = { up: C.ok, degraded: C.warn, backup: C.s7 || C.warn, down: C.bad };
const ST_PILL = { down: ['red', 'Down'], degraded: ['amber', 'Degraded'], backup: ['amber', 'On backup'] };

export function NowLens({ region, setRegion }) {
  const { s, act } = useApp(); const now = useNow(); useLive();
  const [range, setRange] = useState('today');
  const m = useMemo(() => nowModel(s, now, range, region), [s.incidents, s.resolved, s.branchHealth, s.circuitState, Math.floor(now / 15000), range, region]);
  const dr = n => act.drill(region === 'All' ? n : { ...n, region });
  const av = m.avail[range], target = 0.999, longest = m.attention.filter(a => a.k === 'down').sort((a, b) => b.mins - a.mins)[0];
  const regionOut = m.regions.filter(r => r.down >= 3);
  const rangeWord = { today: 'today', '7d': 'over 7 days', '30d': 'over 30 days' }[range];
  const points = useMemo(() => D.BRANCHES.map(b => { const k = statusOf(s, b), sc = region === 'All' || b.region === region; return { id: b.id, x: b.x, y: b.y, r: 3.4, color: COL[k], pulse: k === 'down' && sc, dim: !sc || k === 'up', label: <span><b>{b.name}</b>, {b.brand}<br /><span className="text-ink3">{{ up: 'Trading normally', degraded: 'Degraded', backup: 'Trading on the backup line', down: 'Down' }[k]}. Click for the store detail</span></span> }; }).sort((a, b) => (b.dim - a.dim)), [s.branchHealth, s.circuitState, s.incidents, region]);
  const { L } = useLive2();
  const ahead = [
    ...m.majors.map(({ i, b, etr }) => ({ when: hhmm(Math.max(etr, now + 20 * 60e3)), kind: 'Restore due', what: `${b.name}: ${i.title}`, go: () => act.drill({ t: 'incident', id: i.id }) })),
    ...s.cases.filter(c => c.eta > now && (region === 'All' || D.BR[c.branchId].region === region)).sort((a, b) => a.eta - b.eta).slice(0, 2).map(c => ({ when: hhmm(c.eta), kind: 'Carrier ETA', what: `${c.carrier} repair, ${D.BR[c.branchId].name}`, go: () => act.drill({ t: 'circuit', id: c.circuit }) })),
    ...s.changes.filter(c => c.start > now && c.start < now + 3 * 86400e3).slice(0, 2).map(c => ({ when: c.window.split(' ')[0], kind: 'Change window', what: c.title, go: () => act.drill({ t: 'change', id: c.id }) })),
  ].slice(0, 5);
  const below = m.regions.filter(r => r.avail < target);
  const status = m.st.down >= 5 || regionOut.length ? { word: 'Outage', kind: 'bad' } : m.st.down ? { word: 'Minor issues', kind: 'minor' } : m.st.degraded > 20 ? { word: 'Degraded', kind: 'warn' } : { word: 'All trading', kind: 'ok' };
  const R = region === 'All' ? {} : { region };
  const visuals = [
    { id: 'status', kind: 'stack', title: 'Every store right now', go: { t: 'set', k: 'all', ...R }, caption: `${pc(m.trading / m.list.length, 1)} of stores trading; ${m.st.backup} kept trading on the backup line.`,
      parts: ['up', 'backup', 'degraded', 'down'].map(k => ({ label: STATUS[k].label, value: m.st[k], color: STATUS[k].color, go: { t: 'set', k: { up: 'healthy', backup: 'backup', degraded: 'degraded', down: 'down' }[k], ...R } })),
      top: m.attention.slice(0, 4).map(a => ({ label: a.b.name, why: a.why, color: STATUS[a.k].color, go: { t: 'branch', id: a.b.id } })), topTitle: 'Top impacted, by business impact' },
    { id: 'map', kind: 'map', title: 'Where the problems are', go: { t: 'set', k: 'issues', ...R }, focus: region !== 'All', caption: `${num(m.list.length - m.st.up)} stores degraded, on backup or down, shown in colour. Click a dot for the store.`,
      points: m.list.map(b => { const k = statusOf(s, b); return { id: b.id, x: b.x, y: b.y, st: k, color: STATUS[k].color, label: `${b.name} · ${STATUS[k].label}` }; }) },
    { id: 'regions', kind: 'hbars', title: `Trading minutes lost, by region, ${rangeWord}`, go: { t: 'metric', i: D.SLA.findIndex(x => x.n === 29) }, fmt: 'n', caption: `Store-minutes without trading. Availability: ${m.regions.map(r => `${r.r} ${pc(r.avail)}`).join(', ')}. Target ${pc(target)}.`,
      rows: m.regions.map(r => ({ label: r.r, value: Math.round((1 - r.avail) * r.n * m.winMins), sub: `${pc(r.avail)} available · ${r.n} stores${r.down ? `, ${r.down} down` : ''}`, color: r.avail >= target ? COLORS.ok : COLORS.warn, go: { t: 'set', k: 'all', region: r.r } })).sort((x, y) => y.value - x.value) },
    { id: 'layers', kind: 'cols', title: 'Open issues by estate layer', go: { t: 'incidents', k: 'open', ...R }, keys: ['Open issues'], colors: [C.s1], caption: m.layers.map(l => `${l.label} ${pc(l.avail)}`).join(' · ') + ' availability month to date.',
      data: m.layers.map(l => ({ label: l.label.replace('Wi-Fi access points', 'Wi-Fi APs'), 'Open issues': l.open })), goes: m.layers.map(l => l.k === 'links' ? { t: 'lines', k: 'problem', ...R } : { t: 'devices', k: 'down', ...R }) },
    { id: 'online', kind: 'line', title: 'Stores offline and on backup, live', go: { t: 'set', k: 'issues', ...R }, labels: L.series.online.slice(-40).map((_, i, a) => i === a.length - 1 ? 'now' : ''), fmt: 'n', yMin: 0, caption: 'Refreshed every few seconds from OpsRamp, across all 900 stores. Stores on backup are trading but one failure away.',
      series: [{ name: 'Offline', color: C.bad, data: L.series.online.slice(-40).map(v => 900 - v) }, { name: 'On backup', color: C.s1, data: L.series.onbackup.slice(-40) }] },
    { id: 'carriers', kind: 'hbars', title: 'Latency on the lines in use, by carrier', go: { t: 'lines', k: 'all', ...R }, fmt: 'ms', caption: 'Average round trip on each carrier\'s lines right now. Jitter and loss are in the detail below.',
      rows: m.dims.performance.link.map(([n, v]) => ({ label: n, value: +v.split(' ')[0], color: +v.split(' ')[0] < 35 ? COLORS.ok : C.s1, go: { t: 'carrier', carrier: n } })) },
  ];
  const insights = [
    { kicker: 'Redundancy exposure', title: `${m.single.length} stores one failure away from an outage`, line: 'Still trading, but on a single circuit after a failover, or with the backup line down.', stats: [{ value: m.st.backup, label: 'on backup only', tone: 'warn' }, { value: m.single.length - m.st.backup, label: 'backup line down', tone: 'warn' }, { value: s.cases.filter(c => /Open/.test(c.status)).length, label: 'carrier cases open' }],
      points: m.single.slice(0, 4).map(b => ({ b: b.name, t: statusOf(s, b) === 'backup' ? 'main line down' : 'backup line down', tone: 'warn' })), go: () => dr({ t: 'set', k: 'backup' }) },
    { kicker: 'Major incidents', title: m.majors.length ? `${m.majors.length} major incident${m.majors.length > 1 ? 's' : ''} open, each with an owner and a restore time` : 'No major incident open', line: 'Linked to the live ServiceNow ticket.', stats: [{ value: m.st.down, label: 'stores down', tone: m.st.down ? 'bad' : 'ok' }, { value: longest ? dur(longest.mins * 60e3) : '–', label: 'longest outage' }],
      points: m.majors.map(({ i, b, etr }) => ({ b: i.id, t: `${b.name.split(' – ')[1]}, ${i.assignee || i.group}, restore by ${hhmm(Math.max(etr, now + 20 * 60e3))}`, tone: 'bad' })), go: () => dr({ t: 'incidents', k: 'open', pri: 'P2' }) },
    { kicker: 'Capacity', title: `${m.dims.capacity.link[2][1]} need more capacity within 90 days`, line: `Peak bandwidth ${m.dims.capacity.link[0][1]}; ${m.dims.capacity.link[1][1]}.`, bars: [{ label: 'PoE power budget used', value: +m.dims.capacity.dev[0][1].match(/\d+/)[0], text: m.dims.capacity.dev[0][1].split(';')[0] }, { label: 'Switch ports in use', value: +m.dims.capacity.dev[1][1].match(/\d+/)[0], text: m.dims.capacity.dev[1][1] }, { label: 'AP airtime at peak', value: +m.dims.capacity.dev[2][1].match(/\d+/)[0], text: m.dims.capacity.dev[2][1].split(';')[0] }], go: () => dr({ t: 'set', k: 'capacity' }) },
    { kicker: 'Failover', title: `${m.failovers[range]} failover events ${rangeWord}; stores kept trading`, line: 'When a main line drops, SD-WAN moves card payments, ERP and voice to the second line in seconds.', stats: [{ value: m.failovers.today, label: 'today' }, { value: m.failovers['7d'], label: '7 days' }, { value: m.failovers['30d'], label: '30 days' }], points: m.dims.availability.link.map(([a, b]) => ({ b: a, t: b, tone: 'info' })), go: () => dr({ t: 'lines', k: 'down' }) },
  ];
  return (
    <div>
      <PeriodBar views={NOW_RANGES} value={range} onChange={setRange} note={`${num(m.list.length)} stores · live from OpsRamp · updated ${hhmm(now)} CT`} region={region} onRegion={setRegion} regions={REGIONS} right={<ExploreBtn onClick={() => dr({ t: 'set', k: 'all' })}>Explore all {num(m.list.length)} stores</ExploreBtn>} />
      <Headline status={status} scope={`Near real-time network health · ${region === 'All' ? 'All regions' : region}`} headline={`${num(m.trading)} of ${num(m.list.length)} stores trading right now`} deck={`${m.st.down} store${m.st.down === 1 ? '' : 's'} down, ${m.single.length} on a single circuit, ${regionOut.length ? `outage cluster in ${regionOut.map(r => r.r).join(', ')}` : 'no regional outage'}. Availability ${pc(av)} ${rangeWord}.`} spotlight={m.attention[0] && `${m.attention[0].b.name}: ${m.attention[0].why}${m.attention[0].inc ? `, ${m.attention[0].inc.pri} open for ${dur(m.attention[0].mins * 60e3)}` : ''}.`} onSpot={() => m.attention[0] && act.drill({ t: 'branch', id: m.attention[0].b.id })} />
      <Kpis cols={6} items={[
        { label: 'Stores trading', value: `${num(m.trading)}/${num(m.list.length)}`, tone: 'ok', sub: `${m.st.up} fully up`, spark: L.series.online.slice(-30), go: () => dr({ t: 'set', k: 'online' }) },
        { label: `Availability, ${range === 'today' ? 'today' : range === '7d' ? 'week to date' : 'month to date'}`, value: pc(av), tone: av >= target ? 'ok' : 'warn', sub: `target ${pc(target)} · today ${pc(m.avail.today)} · WTD ${pc(m.avail['7d'])} · MTD ${pc(m.avail['30d'])}`, go: () => act.drill({ t: 'metric', i: D.SLA.findIndex(x => x.n === 29) }) },
        { label: 'Stores degraded', value: m.st.degraded, tone: 'warn', sub: 'trading with a problem being fixed', go: () => dr({ t: 'set', k: 'degraded' }) },
        { label: 'Stores down', value: m.st.down, tone: m.st.down ? 'bad' : 'ok', sub: longest ? `longest ${dur(longest.mins * 60e3)}` : 'none', go: () => dr({ t: 'set', k: 'down' }) },
        { label: 'Single circuit', value: m.single.length, tone: m.single.length ? 'warn' : 'ok', sub: 'at risk of outage', spark: L.series.onbackup.slice(-30), go: () => dr({ t: 'set', k: 'backup' }) },
        { label: 'Major incidents', value: m.majors.length, tone: m.majors.length ? 'bad' : 'ok', sub: m.majors[0] ? `${m.majors[0].i.id}, ${m.majors[0].b.name.split(' – ')[1]}` : 'none open', go: () => dr({ t: 'incidents', k: 'open', pri: 'P2' }) },
      ]} />
      <Trio
        attention={[...(m.st.down ? [{ text: `${m.st.down} store${m.st.down > 1 ? 's' : ''} down; engineers and carriers are on it.`, go: () => dr({ t: 'set', k: 'down' }) }] : []), ...(m.single.length ? [{ text: `${m.single.length} stores on a single circuit, one failure from an outage.`, go: () => dr({ t: 'set', k: 'backup' }) }] : []), ...below.map(r => ({ text: `${r.r} below the availability target at ${pc(r.avail)}.`, go: () => setRegion(r.r) })), ...m.layers.filter(l => l.avail < 0.999).map(l => ({ text: `${l.label} at ${pc(l.avail)} month to date, ${l.open} issues open.`, go: () => dr(l.k === 'links' ? { t: 'lines', k: 'problem' } : { t: 'devices', k: 'down' }) }))].slice(0, 5)}
        well={[{ text: `${num(m.st.up)} of ${num(m.list.length)} stores trading normally.`, go: () => dr({ t: 'set', k: 'healthy' }) }, { text: `${m.st.backup} stores lost their main line and kept trading on the backup; customers did not notice.`, go: () => dr({ t: 'set', k: 'backup' }) }, { text: `${m.regions.filter(r => r.avail >= target).length} of ${m.regions.length} regions on the availability target.`, go: () => act.drill({ t: 'metric', i: D.SLA.findIndex(x => x.n === 29) }) }, { text: `${num(L.counters.events)} events today became ${s.incidents.filter(i => now - i.opened < 86400e3).length} incidents after correlation.`, go: () => dr({ t: 'incidents', k: 'today' }) }]}
        ahead={ahead} aheadTitle="Next 24 hours" />
      <div className="mt-4"><ChartCards visuals={visuals} go={n => act.drill(n)} /></div>
      <div className="grid xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4 mt-4">
        <div className="grid md:grid-cols-2 gap-4 content-start">{insights.map(x => <Insight key={x.kicker} x={x} />)}</div>
        <LiveActivity filter={e => !!e.branchId && (region === 'All' || (D.BR[e.branchId] && D.BR[e.branchId].region === region))} note="streaming · OpsRamp events" />
      </div>
      <SectionHead sub="the rest of the Now view">Estate, capacity and how it works</SectionHead>
      <div>
        <Box title="Estate layers at a glance" right="availability MTD, bar scale 98 to 100%" sub="Each layer of the standard store build, with the issues open on it now.">
          <T cols={[{ k: 'label', l: 'Layer', f: x => <b className="text-ink">{x.label}</b> }, { k: 'bar', l: 'Availability', f: x => <div className="flex items-center gap-3"><span className="relative h-2.5 bg-chip rounded-full flex-1 min-w-[120px]"><span className={cx('absolute inset-y-0 left-0 rounded-full', x.avail >= 0.999 ? 'bg-ok' : 'bg-warn')} style={{ width: `${Math.max(2, (x.avail - 0.98) / 0.02 * 100)}%` }} /></span><b className="tabular-nums text-ink w-[62px] text-right">{pc(x.avail)}</b></div> }, { k: 'up', l: 'Up now', r: true, f: x => `${num(x.up)} of ${num(x.total)}` }, { k: 'open', l: 'Open issues', r: true }, { k: 'delta', l: 'vs last month', r: true, f: x => <span className={x.delta >= 0 ? 'text-ok' : 'text-warn'}>{x.delta >= 0 ? '+' : ''}{x.delta.toFixed(2)} pts</span> }]} rows={m.layers} onRow={x => dr(x.k === 'links' ? { t: 'lines', k: 'problem' } : { t: 'devices', k: 'down' })} />
        </Box>
        <Box className="mt-3" title="Capacity, availability and performance" sub={`For the store devices and the access links. Failover counts follow the range picked (${rangeWord}); the rest is live.`}>
          <div className="overflow-x-auto"><table className="w-full text-[12.5px] min-w-[640px]"><thead><tr className="text-left text-ink3 text-[11.5px] border-b border-line"><th className="py-1.5 pr-3 font-semibold w-[120px]">Dimension</th><th className="py-1.5 pr-3 font-semibold">Store devices (SD-WAN, switches, APs)</th><th className="py-1.5 font-semibold">Access links (dual ISP)</th></tr></thead>
            <tbody>{[['availability', 'Availability'], ['performance', 'Performance'], ['capacity', 'Capacity']].map(([k, l]) => <tr key={k} className="border-b border-line/60 last:border-0 align-top"><td className="py-2 pr-3 font-bold text-ink">{l}</td>{['dev', 'link'].map(side => <td key={side} className="py-2 pr-3"><div className="space-y-0.5">{m.dims[k][side].map(([a, b]) => <div key={a} className="flex gap-2"><span className="text-ink3 min-w-[150px]">{a}</span><b className="text-ink">{b}</b></div>)}</div></td>)}</tr>)}</tbody></table></div>
          {m.dims.performance.link.length > 0 && <div className="text-[11.5px] text-ink3 mt-1">Access-link performance is shown by carrier: average latency, jitter and loss on the lines in use.</div>}
        </Box>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 mt-3">
          <Box title="Drill-down path" sub="From the whole estate to one device in four clicks. Each level is live.">
            <ol className="space-y-2">{[
              ['Estate', 'All stores, by region and district', () => act.drill({ t: 'set', k: 'all' })],
              ['Region or district', region === 'All' ? 'Pick a region above, or click a region bar' : `${region}: stores ranked by health and impact`, () => region === 'All' ? setRegion(REGIONS[0]) : dr({ t: 'set', k: 'issues' })],
              ['Store', 'Every device and circuit at that branch, with live status and the last 24 hours of performance', () => m.attention[0] && act.drill({ t: 'branch', id: m.attention[0].b.id })],
              ['Device or circuit', 'Metrics, recent events, open tickets and the predictive risk score for the same asset', () => m.attention[0] && act.drill({ t: 'circuit', id: m.attention[0].b.wan[0] })],
            ].map(([a, b, f], i) => <li key={a}><button onClick={f} className="w-full text-left flex items-start gap-2.5 hover:bg-chip/50 rounded p-1"><span className="w-6 h-6 rounded-full bg-brand text-white text-[12px] font-bold grid place-items-center shrink-0">{i + 1}</span><span className="flex-1"><b className="text-ink text-[13px]">{a}</b><span className="block text-[12px] text-ink2">{b}</span></span><I.ChevronRight size={14} className="text-ink3 mt-1" /></button></li>)}</ol>
          </Box>
          <Box title="How it works" sub="OpsRamp is the system of record for the live view.">
            <ul className="space-y-1.5 text-[12.5px] text-ink2">
              <li className="flex gap-2"><I.Radar size={14} className="text-brand mt-[2px] shrink-0" /><span><b className="text-ink">Collect.</b> OpsRamp collects device and flow telemetry from every store through SNMP, APIs, syslog and NetFlow, refreshed every few minutes.</span></li>
              <li className="flex gap-2"><I.Cable size={14} className="text-brand mt-[2px] shrink-0" /><span><b className="text-ink">Access links included.</b> Circuit data from SRS's access-link monitoring partner (Simplify) is ingested alongside, so the circuit view is complete.</span></li>
              <li className="flex gap-2"><I.GitMerge size={14} className="text-brand mt-[2px] shrink-0" /><span><b className="text-ink">One event per store.</b> Related alerts are correlated: a circuit drop, the SD-WAN failover and a latency spike become one store-level event, not three.</span></li>
              <li className="flex gap-2"><I.SlidersHorizontal size={14} className="text-brand mt-[2px] shrink-0" /><span><b className="text-ink">Thresholds by store profile.</b> A high-volume yard is not judged against a small branch:</span></li>
            </ul>
            <T dense cols={[{ k: 'label', l: 'Profile' }, { k: 'n', l: 'Stores', r: true, f: x => x.n() }, { k: 'lat', l: 'Latency alert', r: true, f: x => `${x.lat} ms` }, { k: 'loss', l: 'Loss alert', r: true, f: x => `${x.loss}%` }, { k: 'util', l: 'Peak use alert', r: true, f: x => `${x.util}%` }, { k: 'wifi', l: 'Wi-Fi airtime', r: true, f: x => `${x.wifi}%` }]} rows={PROFILES} />
          </Box>
        </div>
      </div>
    </div>
  );
}
