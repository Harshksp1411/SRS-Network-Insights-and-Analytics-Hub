// Dashboard 1: Near Real-Time Network Health (Now). Are our stores online, and is the network performing right now?
import React, { useMemo, useState } from 'react';
import * as I from 'lucide-react';
import * as D from '../data.js';
import { useApp, useNow } from '../store.jsx';
import { useLive } from '../live.jsx';
import { NAMap, Legend, C } from '../charts.jsx';
import { statusOf } from '../dash/drilldata.js';
import { LensHead, Summary, Tile, BarRow, Box, Pill, T } from '../sites/shell.jsx';
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
  return (
    <div>
      <LensHead title="SRS Network Health" src={`Executive view · ${num(m.list.length)} stores · live from OpsRamp, updated ${hhmm(now)} CT`} ranges={NOW_RANGES} range={range} onRange={setRange} region={region} onRegion={setRegion} regions={REGIONS} />
      <Summary>{num(m.trading)} of {num(m.list.length)} stores trading. {m.st.down} store{m.st.down === 1 ? '' : 's'} down, {m.single.length} on a single circuit, {regionOut.length ? `outage cluster in ${regionOut.map(r => r.r).join(', ')}` : 'no regional outage'}. Availability {pc(av)} {rangeWord}{m.majors.length ? `; ${m.majors.length} major incident${m.majors.length > 1 ? 's' : ''} open` : ''}.</Summary>
      <div className="border border-t-0 border-line rounded-b-lg p-3 sm:p-4 bg-canvas">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <Tile label="Stores trading" value={`${num(m.trading)}/${num(m.list.length)}`} sub={`${m.st.up} fully up, ${m.st.backup} on backup`} tone="ok" onClick={() => dr({ t: 'set', k: 'online' })} />
          <Tile label={`Availability ${range === 'today' ? 'today' : range === '7d' ? 'week to date' : 'month to date'}`} value={pc(av)} sub={`target ${pc(target)}; today ${pc(m.avail.today)}, WTD ${pc(m.avail['7d'])}, MTD ${pc(m.avail['30d'])}`} tone={av >= target ? 'ok' : 'warn'} onClick={() => act.drill({ t: 'metric', i: D.SLA.findIndex(x => x.n === 29) })} />
          <Tile label="Stores degraded" value={m.st.degraded} sub="trading with a problem being fixed" tone="warn" onClick={() => dr({ t: 'set', k: 'degraded' })} />
          <Tile label="Stores down" value={m.st.down} sub={longest ? `longest ${dur(longest.mins * 60e3)}` : 'none'} tone={m.st.down ? 'bad' : 'ok'} onClick={() => dr({ t: 'set', k: 'down' })} />
          <Tile label="Single circuit" value={m.single.length} sub="at risk of outage: one failure away" tone={m.single.length ? 'warn' : 'ok'} onClick={() => dr({ t: 'set', k: 'backup' })} />
          <Tile label="Active major incidents" value={m.majors.length} sub={m.majors[0] ? `${m.majors[0].i.id}, ${m.majors[0].b.name.split(' – ')[1]}` : 'none open'} tone={m.majors.length ? 'bad' : 'ok'} onClick={() => dr({ t: 'incidents', k: 'open', pri: 'P2' })} />
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 mt-3">
          <Box title="Availability by region" right={`target ${pc(target)}`} sub={`Share of trading minutes, ${rangeWord}. The dashed line is the target.`}>
            {m.regions.map(r => <BarRow key={r.r} label={r.r} sub={`${r.n} stores${r.down ? `, ${r.down} down` : ''}${r.single ? `, ${r.single} on one circuit` : ''}`} value={pc(r.avail)} frac={(r.avail - 0.98) / 0.02} target={(target - 0.98) / 0.02} tone={r.avail >= target ? 'ok' : 'warn'} onClick={() => setRegion(r.r)} />)}
            <div className="flex justify-between text-[11px] text-ink3 mt-1 pl-[45%]"><span>98.0%</span><span>100%</span></div>
          </Box>
          <Box title="Stores needing attention" right="by business impact" sub="Ranked by outage length, whether the store is trading now, and how many devices are affected. The top 10 are shown.">
            <div className="divide-y divide-line/70">{m.attention.slice(0, 10).map(a => <button key={a.b.id} onClick={() => act.drill({ t: 'branch', id: a.b.id })} className="w-full text-left grid grid-cols-[92px_minmax(0,1fr)_auto] gap-3 items-center py-1.5 hover:bg-chip/50 rounded px-1">
              <Pill tone={ST_PILL[a.k][0]}>{ST_PILL[a.k][1]}</Pill>
              <span className="min-w-0"><span className="block text-[13px] font-semibold text-ink truncate">{a.b.name}</span><span className="block text-[11.5px] text-ink3 truncate">{a.why}{a.inc ? ` · ${a.inc.pri} open` : ''}{a.openNow ? '' : ' · closed now'}{a.devs > 1 ? ` · ${a.devs} devices` : ''}</span></span>
              <span className="text-[13px] font-bold tabular-nums text-ink">{dur(a.mins * 60e3)}</span></button>)}</div>
            {!m.attention.length && <div className="text-[13px] text-ink3">Every store is trading normally.</div>}
          </Box>
        </div>
        <Box className="mt-3" title="Estate layers at a glance" right="availability MTD, bar scale 98 to 100%" sub="Each layer of the standard store build, with the issues open on it now.">
          <T cols={[{ k: 'label', l: 'Layer', f: x => <b className="text-ink">{x.label}</b> }, { k: 'bar', l: 'Availability', f: x => <div className="flex items-center gap-3"><span className="relative h-2.5 bg-chip rounded-full flex-1 min-w-[120px]"><span className={cx('absolute inset-y-0 left-0 rounded-full', x.avail >= 0.999 ? 'bg-ok' : 'bg-warn')} style={{ width: `${Math.max(2, (x.avail - 0.98) / 0.02 * 100)}%` }} /></span><b className="tabular-nums text-ink w-[62px] text-right">{pc(x.avail)}</b></div> }, { k: 'up', l: 'Up now', r: true, f: x => `${num(x.up)} of ${num(x.total)}` }, { k: 'open', l: 'Open issues', r: true }, { k: 'delta', l: 'vs last month', r: true, f: x => <span className={x.delta >= 0 ? 'text-ok' : 'text-warn'}>{x.delta >= 0 ? '+' : ''}{x.delta.toFixed(2)} pts</span> }]} rows={m.layers} onRow={x => dr(x.k === 'links' ? { t: 'lines', k: 'problem' } : { t: 'devices', k: 'down' })} />
        </Box>
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-3 mt-3">
          <Box title="Store map" sub="Every branch, coloured by health. Healthy stores are faded so problems stand out. Click a store for its detail." right={<Legend items={[['Trading', C.ok], ['Degraded or on backup', C.warn], ['Down', C.bad]]} />}>
            <NAMap points={points} h={380} focus={region === 'All' ? null : D.BRANCHES.filter(b => b.region === region).map(b => ({ x: b.x, y: b.y }))} onPoint={p => act.drill({ t: 'branch', id: p.id })} />
          </Box>
          <div className="space-y-3">
            <Box title="Redundancy exposure" sub="Stores trading on a single circuit after a failover, or with the backup line down. Still trading, but one failure away from an outage.">
              <div className="divide-y divide-line/70">{m.single.slice(0, 7).map(b => { const k = statusOf(s, b); return <button key={b.id} onClick={() => act.drill({ t: 'branch', id: b.id })} className="w-full text-left flex items-center gap-2 py-1.5 text-[12.5px] hover:bg-chip/50 rounded px-1"><I.Unplug size={13} className="text-warn shrink-0" /><span className="flex-1 min-w-0 truncate"><b className="text-ink">{b.name}</b> <span className="text-ink3">{k === 'backup' ? 'main line down, on backup' : 'backup line down'}</span></span><I.ChevronRight size={13} className="text-ink3" /></button>; })}</div>
              {!m.single.length && <div className="text-[12.5px] text-ink3">Every store has both lines working.</div>}
            </Box>
            <Box title="Active major incidents" sub="Linked to the live ServiceNow ticket, owner and estimated restoration time.">
              {m.majors.length ? <div className="divide-y divide-line/70">{m.majors.map(({ i, b, etr }) => <button key={i.id} onClick={() => act.drill({ t: 'incident', id: i.id })} className="w-full text-left py-1.5 text-[12.5px] hover:bg-chip/50 rounded px-1"><div className="flex items-center gap-2"><span className="font-mono font-semibold text-ink">{i.id}</span><Pill tone="red">{i.pri}</Pill><span className="text-ink3 ml-auto">restore by {hhmm(Math.max(etr, now + 20 * 60e3))} CT</span></div><div className="text-ink truncate">{b.name}: {i.title}</div><div className="text-ink3">{i.assignee ? `${i.assignee}, ` : ''}{i.group}</div></button>)}</div> : <div className="text-[12.5px] text-ink3">No major incident open.</div>}
            </Box>
          </div>
        </div>
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
