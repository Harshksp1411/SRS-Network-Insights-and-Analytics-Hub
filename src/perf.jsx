// Performance: the stores and branches view, and the AI and automation additions. Everything clicks through to the
// drill-down, where each level has its own Take action bar.
import React, { useMemo, useState } from 'react';
import * as I from 'lucide-react';
import * as D from './data.js';
import { healthOf } from './store.jsx';
import { Card, Badge, Table, Stat, Tabs, cx } from './ui.jsx';
import { Spark, LineChart, Bars, HBars, C } from './charts.jsx';
import { num } from './util.js';
import * as HIST from './history.js';

export const pa = (v, d = 2) => `${(v * 100).toFixed(d)}%`;
const hrs = v => v >= 100 ? num(Math.round(v)) : v.toFixed(1);
export const STORE_TARGET = 0.995;

// roll a list of branch rows into one figure
export function rollup(rows, n) {
  const lost = rows.reduce((a, x) => a + x.lost, 0), tickets = rows.reduce((a, x) => a + x.tickets, 0);
  return { n: rows.length, lost, tickets, avail: 1 - lost / Math.max(1, rows.length * HIST.TRADE_H * n), below: rows.filter(x => x.avail < STORE_TARGET).length, repeat: rows.filter(x => x.repeat).length };
}
const monthly = (rows, P) => P.months.map((mo, i) => { const lost = rows.reduce((a, x) => a + x.hrsPer[i], 0), t = rows.reduce((a, x) => a + x.per[i], 0); return { label: mo.m, lost, tickets: t, avail: 1 - lost / Math.max(1, rows.length * HIST.TRADE_H) }; });

export function StoresPerf({ P, s, act, exec, noTiles }) {
  const [by, setBy] = useState('region');
  const rows = P.branches, R = rollup(rows, P.n), M = monthly(rows, P);
  const groups = useMemo(() => {
    const key = by === 'region' ? (x => x.b.region) : by === 'segment' ? (x => x.b.segment) : (x => x.b.brand);
    const g = {}; rows.forEach(x => { (g[key(x)] = g[key(x)] || []).push(x); });
    return Object.entries(g).map(([k, l]) => ({ k, ...rollup(l, P.n) })).sort((a, b) => a.avail - b.avail);
  }, [rows, by, P.n]);
  const worst = [...rows].sort((a, b) => b.lost - a.lost);
  const first = M[0], last = M[M.length - 1];
  const moved = rows.map(x => ({ ...x, d: x.per[x.per.length - 1] - x.per[0] }));
  const better = [...moved].sort((a, b) => a.d - b.d).slice(0, 5), worse = [...moved].sort((a, b) => b.d - a.d).slice(0, 5);
  const open = (f, extra = {}) => act.drill({ t: 'storeperf', per: P.n, f, ...extra });
  return (
    <>
      {!noTiles && <div className="kpi-strip grid grid-cols-2 lg:grid-cols-4 mb-3">
        <Stat label={`Store availability, ${P.n} months`} icon={I.Store} onClick={() => open('all')} value={pa(R.avail)} tone={R.avail >= STORE_TARGET ? 'green' : 'amber'} sub={`trading hours the network was there for the store; target ${pa(STORE_TARGET, 1)}`} />
        <Stat label="Store hours lost" icon={I.Clock} onClick={() => open('all', { sort: 'lost' })} value={hrs(R.lost)} tone="amber" sub={`across ${num(R.n)} branches; ${last.lost < first.lost ? 'down' : 'up'} from ${hrs(first.lost)} to ${hrs(last.lost)} a month`} />
        <Stat label={`Branches below ${pa(STORE_TARGET, 1)}`} icon={I.TrendingDown} onClick={() => open('below')} value={num(R.below)} tone={R.below ? 'red' : 'green'} sub="open the list and act on each one" />
        <Stat label="Repeat-problem branches" icon={I.Repeat} onClick={() => open('repeat')} value={num(R.repeat)} tone={R.repeat ? 'amber' : 'green'} sub="same fault three times or more in 90 days" />
      </div>}
      <div className={cx('grid grid-cols-1 gap-3 mb-3 items-stretch [&>*]:h-full', !exec && 'xl:grid-cols-2')}>
        <Card title={`Store hours lost per branch, by ${by}`} icon={I.MapPin} sub="Worst first. Click one to see its branches." right={<Tabs size="sm" value={by} onChange={setBy} tabs={[{ id: 'region', label: 'Region' }, { id: 'segment', label: 'Business' }, { id: 'brand', label: 'Brand' }]} />}>
          <HBars rows={groups.sort((a, b) => b.lost / b.n - a.lost / a.n).slice(0, by === 'brand' ? 12 : 10).map(g => ({ label: g.k, sub: `${num(g.n)} branches · ${pa(g.avail)} available · ${g.below} below target`, value: g.lost / g.n, color: C.s1, k: g.k }))}
            fmt={v => `${v.toFixed(2)} h`} labelW={210} onRow={r => open('all', { [by]: r.k })} />
        </Card>
        {!exec && <Card title="Month by month" icon={I.CalendarRange} sub="Store hours lost each month. Click a month for its worst branches.">
          <Bars data={M.map((x, i) => ({ label: x.label, lost: Math.round(x.lost), i }))} keys={['lost']} colors={[C.warn]} h={190} onBar={d => open('all', { sort: 'lost', month: d.i })} fmt={v => `${v} h`} />
          <div className="text-[12px] text-ink3 mt-1">Availability {pa(first.avail)} in {first.label}, {pa(last.avail)} in {last.label}.</div>
        </Card>}
      </div>
      <Card title="Branches that cost the most store time" icon={I.AlertTriangle} sub={`Ranked by store hours lost in the last ${P.n} months. Click a branch to drill in and act.`} pad={false} className="mb-3"
        right={<button onClick={() => open('all', { sort: 'lost' })} className="text-[12px] font-semibold text-ink hover:underline">All {num(rows.length)} branches</button>}>
        <div className="p-2"><Table dense sortable={false} rows={worst.slice(0, exec ? 8 : 15).map((x, i) => ({ ...x, id: x.b.id, rank: i + 1 }))} onRow={x => act.drill({ t: 'branch', id: x.b.id })} cols={[
          { key: 'rank', label: '#', render: x => <span className="text-ink3">{x.rank}</span> },
          { key: 'b', label: 'Branch', render: x => <div><div className="font-semibold">{x.b.name}</div><div className="text-[11px] text-ink3">{x.b.brand} · {x.b.region}</div></div> },
          { key: 'av', label: 'Availability', right: true, render: x => <b className={x.avail < STORE_TARGET ? 'text-warn' : 'text-ok'}>{pa(x.avail)}</b> },
          { key: 'lost', label: 'Hours lost', right: true, render: x => hrs(x.lost) },
          { key: 'tickets', label: 'Tickets', right: true, render: x => x.tickets },
          { key: 'tr', label: `${P.n} mo`, render: x => <Spark data={x.per} w={70} h={20} color={C.warn} fill={false} /> },
          { key: 'driver', label: 'Main cause', render: x => <div className="text-[12px]">{x.driver}{x.repeat && <div><Badge tone="amber">Repeat</Badge></div>}</div> },
          { key: 'h', label: 'Now', render: x => { const h = healthOf(s, x.b); return <Badge tone={h === 'up' ? 'green' : h === 'down' ? 'red' : 'amber'}>{h === 'up' ? 'Healthy' : h === 'down' ? 'Down' : 'Degraded'}</Badge>; } },
        ]} /></div>
      </Card>
      {!exec && <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 mb-3 items-stretch [&>*]:h-full">
        {[['Getting better', better, 'ok', I.TrendingDown], ['Getting worse', worse, 'warn', I.TrendingUp]].map(([t, l, tone, Ic]) => (
          <Card key={t} title={t} icon={Ic} sub={`Tickets in ${P.months[0].m} against ${P.months[P.months.length - 1].m}`}>
            <div className="divide-y divide-line">{l.map(x => <button key={x.b.id} onClick={() => act.drill({ t: 'branch', id: x.b.id })} className="w-full flex items-center gap-2 py-1.5 text-left text-[12.5px] hover:bg-chip/60 rounded px-1">
              <span className="flex-1 min-w-0 truncate font-semibold text-ink">{x.b.name}</span><span className="text-ink3 text-[11.5px] hidden md:inline">{x.driver}</span>
              <Spark data={x.per} w={60} h={18} color={tone === 'ok' ? C.ok : C.warn} fill={false} /><b className={cx('w-10 text-right tabular-nums', tone === 'ok' ? 'text-ok' : 'text-warn')}>{x.d > 0 ? '+' : ''}{x.d}</b>
            </button>)}</div>
          </Card>))}
      </div>}
    </>
  );
}

// the automations behind the AI and automation numbers: each opens its own drill-down
export function AutomationsCard({ act, s }) {
  const rows = D.RUNBOOKS.map(r => ({ ...r, mine: s.runs.filter(x => x.rb === r.id).length })).sort((a, b) => b.runs30 - a.runs30);
  return (
    <Card title="Automations at work" icon={I.Bot} sub="Mova iO runbooks, runs in the last 30 days. Click one to see where it ran and widen it." pad={false}>
      <div className="p-2"><Table dense sortable={false} rows={rows} onRow={r => act.drill({ t: 'automation', id: r.id })} cols={[
        { key: 'name', label: 'Automation', render: r => <div><div className="font-semibold">{r.name}</div><div className="text-[11px] text-ink3">{r.id} · {r.kind === 'readonly' ? 'read-only check' : 'makes a change'}</div></div> },
        { key: 'autonomy', label: 'Autonomy', render: r => <Badge tone={r.autonomy >= 'L3' ? 'green' : 'amber'}>{r.autonomy}</Badge> },
        { key: 'runs30', label: 'Runs', right: true, render: r => <b>{num(r.runs30 + r.mine)}</b> },
        { key: 'success', label: 'Success', right: true, render: r => <span className={r.success >= 0.95 ? 'text-ok font-semibold' : 'text-warn font-semibold'}>{pa(r.success, 1)}</span> },
        { key: 'avg', label: 'Takes', right: true, render: r => r.avg },
      ]} /></div>
    </Card>
  );
}

// the call drivers as a clickable ranking
export function DriversCard({ P, act }) {
  const mx = Math.max(...P.drivers.map(d => d.tickets));
  return (
    <Card title="What the tickets were about" icon={I.PhoneCall} sub={`${num(P.tickets)} network tickets, ${P.from} to ${P.to}. Click a cause to drill in and automate it.`}>
      <div className="space-y-1">{P.drivers.map((d, i) => (
        <button key={d.k} onClick={() => act.drill({ t: 'driver', k: d.k, per: P.n, label: d.label, tickets: d.tickets })} className="w-full text-left text-[12px] hover:bg-chip/60 rounded px-1 py-1">
          <div className="flex items-baseline gap-2"><span className="text-ink3 w-4 text-right tabular-nums">{i + 1}</span><span className="flex-1 min-w-0 truncate font-semibold text-ink">{d.label}</span><b className="tabular-nums text-ink">{num(d.tickets)}</b><span className="text-ink3 w-11 text-right tabular-nums">{(d.share * 100).toFixed(0)}%</span><I.ChevronRight size={13} className="text-ink3" /></div>
          <div className="ml-6 h-2 rounded bg-chip overflow-hidden relative"><div className="absolute inset-y-0 left-0 bg-ink3/40" style={{ width: `${d.tickets / mx * 100}%` }} /><div className="absolute inset-y-0 left-0 bg-ink3" style={{ width: `${d.storeCalls / mx * 100}%` }} /></div>
          <div className="ml-6 text-[11px] text-ink3">{num(d.storeCalls)} store calls · {d.auto ? `${num(d.autoFixed)} fixed by Mova iO` : 'needs an engineer or carrier'}</div>
        </button>))}</div>
    </Card>
  );
}

// AI and automation headline tiles from the period
export function AITiles({ P, act }) {
  const saved = Math.round(P.auto * 0.75);
  return [
    <Stat key="auto" label={`Tickets fixed by Mova iO, ${P.n} months`} icon={I.Bot} onClick={() => act.drill({ t: 'automation', id: 'all', per: P.n })} value={num(P.auto)} tone="green" sub={`${pa(P.autoShare, 0)} of ${num(P.tickets)} tickets, no engineer needed`} />,
    <Stat key="hrs" label="Engineer hours saved" icon={I.Timer} onClick={() => act.drill({ t: 'automation', id: 'all', per: P.n })} value={num(saved)} tone="green" sub="about 45 minutes per ticket fixed automatically" />,
  ];
}
