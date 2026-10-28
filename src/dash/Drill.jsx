// The drill-down behind every number, chart and insight on the role dashboards: peel the onion from the whole estate to a
// region, a state, a city, one branch, one internet line, one device and one incident, then on to the carrier, the
// change or the decision behind it. A breadcrumb shows where you are; any step back is one click.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as I from 'lucide-react';
import * as D from '../data.js';
import { useApp, healthOf, circuitOf, slaClock, branchClock } from '../store.jsx';
import { cx } from '../ui.jsx';
import { C, HBars, Bars, LineChart, NAMap, Ring, Legend } from '../charts.jsx';
import { num, dateShort, hhmm, dt, ago, dur, DAY, HR, MIN, sum, parts } from '../util.js';
import {
  SETS, INC_SETS, LINE_SETS, DEV_SETS, CHG_SETS, STATUS, KIND_PLAIN, CHECK_NAME, TTR_BUCKETS,
  statusOf, activeLine, openIncs, readyOf, capOf, capDays, branchesOf, incidentsOf, linesOf, devicesOf, changesOf,
  lineDay, fwLevel, fwBehind, creditOf, labelOf, scopeOf, stateName, isAutoInc, dayIdx, dayLabel, modelName,
} from './drilldata.js';
import { MONTHS_SO_FAR } from './visuals.js';

const DISPLAY = { fontFamily: '"Aptos Display", Aptos, "Segoe UI", "Helvetica Neue", Arial, sans-serif' };
const TX = { ok: 'text-ok', warn: 'text-warn', bad: 'text-bad', info: 'text-info', muted: 'text-ink3' };
const P = (x, d = 1) => `${(x * 100).toFixed(d)}%`;
const ms = v => `${Math.round(v)} ms`;
const latTone = v => v == null ? 'bad' : v < 60 ? 'ok' : v < 100 ? 'warn' : 'bad';
const lossTone = v => v == null ? 'bad' : v < 0.5 ? 'ok' : v < 1 ? 'warn' : 'bad';
const jitTone = v => v == null ? 'bad' : v < 10 ? 'ok' : v < 30 ? 'warn' : 'bad';
const hrs = t => t >= 90 * MIN ? `${(t / HR).toFixed(1)} h` : `${Math.max(1, Math.round(t / MIN))} min`;
const fwText = d => { const l = fwLevel(d); return l <= 0 ? 'Latest approved' : fwBehind(d) ? `${l} releases behind` : `${l} behind, allowed`; };
const regionOrder = bs => [...new Set(bs.map(b => b.region))].sort((a, b) => D.REGIONS.indexOf(a) - D.REGIONS.indexOf(b));

// ---------- building blocks ----------
const Kicker = ({ children }) => <div className="text-[11px] font-bold tracking-[0.12em] uppercase text-brand">{children}</div>;
function Head({ kicker, title, sub, right, children }) {
  return (
    <div className="flex flex-wrap items-start gap-3 pb-3 border-b border-line">
      <div className="flex-1 min-w-[260px]">
        <Kicker>{kicker}</Kicker>
        <h2 className="text-[26px] sm:text-[30px] font-bold text-ink leading-tight mt-0.5" style={DISPLAY}>{title}</h2>
        {sub && <p className="text-[14.5px] text-ink2 leading-relaxed mt-1 max-w-[820px]">{sub}</p>}
        {children}
      </div>
      {right}
    </div>
  );
}
function Kpis({ items, go }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:[grid-template-columns:repeat(var(--n),minmax(0,1fr))] gap-px bg-line border border-line rounded-md overflow-hidden mt-4" style={{ '--n': items.filter(Boolean).length }}>
      {items.filter(Boolean).map(x => {
        const El = x.go ? 'button' : 'div';
        return (
          <El key={x.label} onClick={x.go ? () => go(x.go) : undefined} className={cx('bg-panel text-left px-3 py-2.5 min-w-0', x.go && 'hover:bg-chip/70 group')}>
            <div className={cx('font-bold leading-none tabular-nums truncate', String(x.value).length > 11 ? 'text-[18px] py-[3px]' : 'text-[24px]', TX[x.tone] || 'text-ink')} style={DISPLAY} title={String(x.value)}>{x.value}</div>
            <div className="text-[11.5px] text-ink2 mt-1 leading-tight flex items-start gap-1">{x.label}{x.go && <I.ChevronRight size={12} className="mt-[1px] shrink-0 text-ink3 group-hover:text-brand" />}</div>
            {x.sub && <div className="text-[10.5px] text-ink3 leading-tight mt-0.5 truncate">{x.sub}</div>}
          </El>
        );
      })}
    </div>
  );
}
function Panel({ title, hint, children, className, right }) {
  return (
    <section className={cx('min-w-0', className)}>
      <div className="flex items-end gap-2 border-b border-line pb-1 mb-2.5">
        <h3 className="text-[12px] font-bold tracking-[0.1em] uppercase text-ink flex-1">{title}</h3>
        {hint && <span className="text-[11px] text-ink3 hidden sm:inline">{hint}</span>}
        {right}
      </div>
      {children}
    </section>
  );
}
const Grid = ({ children, cols = 2 }) => <div className={cx('grid gap-x-8 gap-y-7 mt-6', cols === 2 ? 'lg:grid-cols-2' : cols === 3 ? 'lg:grid-cols-3' : '')}>{children}</div>;
function Pill({ tone, children }) {
  const c = { ok: 'bg-ok/10 text-ok border-ok/30', warn: 'bg-warn/10 text-warn border-warn/30', bad: 'bg-bad/10 text-bad border-bad/30', info: 'bg-info/10 text-info border-info/30', muted: 'bg-chip text-ink2 border-line' }[tone] || 'bg-chip text-ink2 border-line';
  return <span className={cx('inline-flex items-center text-[11px] font-bold px-1.5 py-[1px] rounded border whitespace-nowrap', c)}>{children}</span>;
}
const stTone = st => ({ up: 'ok', backup: 'info', degraded: 'warn', down: 'bad' }[st]);
// a table whose rows open the next level down
function Rows({ cols, rows, onRow, page = 12, empty = 'Nothing to show.' }) {
  const [n, setN] = useState(page);
  if (!rows.length) return <p className="text-[13px] text-ink3 py-2">{empty}</p>;
  return (
    <div>
      <div className="overflow-x-auto border border-line rounded-md bg-panel">
        <table className="w-full text-[12.5px]">
          <thead><tr className="text-left text-ink3 border-b border-line">{cols.map(c => <th key={c} className="px-2.5 py-1.5 font-semibold whitespace-nowrap">{c}</th>)}{onRow && <th className="w-6" />}</tr></thead>
          <tbody>{rows.slice(0, n).map((r, i) => (
            <tr key={r.key || i} onClick={onRow && r.go !== false ? () => onRow(r) : undefined} className={cx('border-b border-line/60 last:border-0 align-top', onRow && r.go !== false && 'cursor-pointer hover:bg-chip/70 group')}>
              {r.cells.map((c, j) => <td key={j} className="px-2.5 py-1.5">{c}</td>)}
              {onRow && <td className="pr-2 py-1.5 text-ink3 group-hover:text-brand">{r.go !== false && <I.ChevronRight size={14} />}</td>}
            </tr>))}</tbody>
        </table>
      </div>
      {rows.length > n && <button onClick={() => setN(n + page * 2)} className="mt-2 text-[12.5px] font-semibold text-brand hover:underline">{rows.length - n <= page * 2 ? `Show the other ${num(rows.length - n)}` : `Show ${page * 2} more (${num(rows.length - n)} left)`}</button>}
    </div>
  );
}
const Name = ({ t, sub }) => <span><span className="font-semibold text-ink">{t}</span>{sub && <span className="block text-[11px] text-ink3 leading-tight">{sub}</span>}</span>;
function KV({ items }) {
  return <dl className="grid grid-cols-[minmax(120px,auto)_minmax(0,1fr)] gap-x-4 text-[12.5px] border border-line rounded-md bg-panel px-3 py-1">{items.filter(Boolean).map(([k, v]) => <React.Fragment key={k}><dt className="text-ink3 py-1.5 border-b border-line/60">{k}</dt><dd className="text-ink py-1.5 border-b border-line/60 min-w-0 break-words">{v}</dd></React.Fragment>)}</dl>;
}
// a single status bar of the whole set; each part opens the branches in it
function StackBar({ parts: ps, go, unit = 'branches' }) {
  const tot = sum(ps, p => p.value) || 1;
  return (
    <div>
      <div className="flex h-7 rounded-md overflow-hidden border border-line bg-panel">
        {ps.filter(p => p.value > 0).map(p => <button key={p.label} title={`${p.label}: ${num(p.value)}`} onClick={p.go ? () => go(p.go) : undefined} className="h-full hover:brightness-110 transition-[filter]" style={{ width: `${Math.max(0.8, p.value / tot * 100)}%`, background: p.color }} />)}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[12.5px]">{ps.map(p => <button key={p.label} onClick={p.go ? () => go(p.go) : undefined} className={cx('inline-flex items-center gap-1.5 text-ink2', p.go && 'hover:text-ink hover:underline')}><span className="w-2.5 h-2.5 rounded-[2px]" style={{ background: p.color }} />{p.label}<b className="text-ink tabular-nums">{num(p.value)}</b></button>)}<span className="text-ink3 ml-auto">{num(tot)} {unit}</span></div>
    </div>
  );
}
function Clickable({ items, go }) {
  return <ul className="divide-y divide-line/70 border border-line rounded-md bg-panel">{items.map((x, i) => (
    <li key={i}><button onClick={x.go ? () => go(x.go) : undefined} className={cx('w-full text-left px-3 py-2 flex items-start gap-2 text-[12.5px]', x.go && 'hover:bg-chip/70 group')}>
      {x.tone && <span className="mt-[5px] w-2 h-2 rounded-full shrink-0" style={{ background: { ok: C.ok, warn: C.warn, bad: C.bad, info: C.s1 }[x.tone] || C.s3 }} />}
      <span className="flex-1 min-w-0"><span className="font-semibold text-ink">{x.title}</span>{x.sub && <span className="block text-ink2 leading-snug">{x.sub}</span>}</span>
      {x.right && <span className="text-ink3 whitespace-nowrap">{x.right}</span>}
      {x.go && <I.ChevronRight size={14} className="mt-[2px] text-ink3 group-hover:text-brand shrink-0" />}
    </button></li>))}</ul>;
}
const Note = ({ children }) => <p className="text-[12px] text-ink3 mt-2 leading-snug">{children}</p>;

// ---------- geography: estate → region → state → city → branch ----------
function nextGeo(n) { return !n.region ? 'region' : !n.state ? 'state' : !n.city ? 'city' : null; }
function groupBy(bs, level) {
  const m = {}; bs.forEach(b => { const k = level === 'region' ? b.region : level === 'state' ? b.state : b.city; (m[k] = m[k] || []).push(b); }); return m;
}
const narrow = (n, level, key, all) => level === 'region' ? { ...n, region: key } : level === 'state' ? { ...n, state: key } : { ...n, city: key, state: all[0].state };

function SetView({ n, go, ctx }) {
  const { s, now } = ctx;
  const set = SETS[n.k] || SETS.all;
  const scopeAll = useMemo(() => branchesOf(s, { ...n, k: 'all' }, now), [n.region, n.state, n.city]);
  const bs = useMemo(() => branchesOf(s, n, now), [n.k, n.region, n.state, n.city]);
  const st = useMemo(() => Object.fromEntries(scopeAll.map(b => [b.id, statusOf(s, b)])), [scopeAll]);
  const cnt = k => scopeAll.filter(b => st[b.id] === k).length;
  const base = { t: 'set', region: n.region, state: n.state, city: n.city };
  const readiness = ['readiness', 'notReady', 'attention'].includes(n.k), week = ['trouble7', 'clean7'].includes(n.k);
  const rd = readiness ? scopeAll.map(b => readyOf(s, b).result) : [];
  const w7 = week ? new Set(branchesOf(s, { ...n, k: 'trouble7' }, now).map(b => b.id)) : null;
  const lat = b => activeLine(s, b).lat;
  // what the set looks like as a whole
  const parts = readiness ? [
    { label: 'Ready', value: rd.filter(r => r === 'Ready').length, color: C.ok },
    { label: 'Fixed overnight', value: rd.filter(r => r === 'Fixed overnight').length, color: C.teal },
    { label: 'Can open, one check to watch', value: rd.filter(r => r === 'Needs attention').length, color: C.warn, go: { ...base, k: 'attention' } },
    { label: 'Not ready', value: rd.filter(r => r === 'Not ready').length, color: C.bad, go: { ...base, k: 'notReady' } },
  ] : week ? [
    { label: 'Trouble-free', value: scopeAll.length - w7.size, color: C.ok, go: { ...base, k: 'clean7' } },
    { label: 'Had a problem', value: w7.size, color: C.warn, go: { ...base, k: 'trouble7' } },
  ] : [
    { label: STATUS.up.label, value: cnt('up'), color: STATUS.up.color, go: { ...base, k: 'healthy' } },
    { label: STATUS.backup.label, value: cnt('backup'), color: STATUS.backup.color, go: { ...base, k: 'backup' } },
    { label: STATUS.degraded.label, value: cnt('degraded'), color: STATUS.degraded.color, go: { ...base, k: 'degraded' } },
    { label: STATUS.down.label, value: cnt('down'), color: STATUS.down.color, go: { ...base, k: 'down' } },
  ];
  // the next level down
  const level = nextGeo(n), groups = level ? groupBy(scopeAll, level) : {};
  const inSet = new Set(bs.map(b => b.id));
  const metric = n.k === 'all' || n.k === 'healthy' ? { f: g => g.filter(b => st[b.id] === 'up').length / g.length, fmt: v => P(v, 0), what: 'share trading normally', max: 1 }
    : n.k === 'readiness' ? { f: g => g.filter(b => ['Ready', 'Fixed overnight'].includes(readyOf(s, b).result)).length / g.length, fmt: v => P(v, 0), what: 'share ready to open', max: 1 }
    : n.k === 'latency' ? { f: g => sum(g, lat) / g.length, fmt: ms, what: 'average delay to the data centre' }
    : n.k === 'clean7' ? { f: g => g.filter(b => inSet.has(b.id)).length / g.length, fmt: v => P(v, 0), what: 'share trouble-free', max: 1 }
    : { f: g => g.filter(b => inSet.has(b.id)).length, fmt: v => num(v), what: `branches ${set.label.toLowerCase()}`, count: true };
  const geoRows = Object.entries(groups).map(([k, g]) => ({ label: level === 'state' ? stateName(k) : k, key: k, value: metric.f(g), sub: `${num(g.length)} branches`, g }))
    .filter(r => !metric.count || r.value > 0)
    .sort((a, b) => level === 'region' && !metric.count ? D.REGIONS.indexOf(a.key) - D.REGIONS.indexOf(b.key) : b.value - a.value);
  const geoColor = r => n.k === 'latency' ? (r.value < 45 ? C.ok : r.value < 60 ? C.s1 : C.warn) : metric.count ? (n.k === 'down' ? C.bad : ['degraded', 'issues', 'notReady', 'trouble7', 'capacity', 'eos', 'attention'].includes(n.k) ? C.warn : C.s1) : Math.round(r.value * 100) >= 97 ? C.ok : Math.round(r.value * 100) >= 94 ? C.s1 : C.warn;
  // the branches themselves, worst first
  const sev = { down: 0, degraded: 1, backup: 2, up: 3 };
  const list = bs.slice().sort((a, b) => n.k === 'latency' ? lat(b) - lat(a) : n.k === 'capacity' ? capDays(capOf(s, a)) - capDays(capOf(s, b)) : sev[st[a.id]] - sev[st[b.id]] || a.num - b.num);
  const why = b => {
    const i = openIncs(s, b)[0];
    if (n.k === 'capacity') { const c = capOf(s, b); return `${c.wanDays <= c.wifiDays ? `Internet line at ${c.wanP95}% at peak` : `Wi-Fi at ${c.wifiPeak}% at peak`}; limit in ${capDays(c)} days`; }
    if (readiness) { const r = readyOf(s, b); const f = Object.entries(r.c).find(([, x]) => x.st === 'fail') || Object.entries(r.c).find(([, x]) => x.st === 'warn'); return f ? `${CHECK_NAME[f[0]] || f[0]}: ${f[1].detail}` : r.result; }
    if (n.k === 'eos') { const d = D.devicesOf(b.id).filter(x => /2530/.test(x.model)); return `${d.length} Aruba 2530 switch${d.length > 1 ? 'es' : ''}`; }
    return i ? i.title : st[b.id] === 'backup' ? 'Main line down; trading on the backup' : st[b.id] === 'up' ? 'No open problem' : (b.watch ? b.watch.why : b.why || 'Being watched after a fix');
  };
  const pts = scopeAll.map(b => ({ id: b.id, x: b.x, y: b.y, r: inSet.has(b.id) && n.k !== 'all' ? 5 : st[b.id] === 'up' ? 2.6 : 4.5, color: STATUS[st[b.id]].color, dim: n.k !== 'all' && n.k !== 'latency' && n.k !== 'readiness' && !inSet.has(b.id), label: `${b.name} · ${STATUS[st[b.id]].label}`, b }));
  const kpis = readiness ? parts.map(p => ({ label: p.label, value: num(p.value), tone: p.label === 'Not ready' ? (p.value ? 'bad' : 'ok') : p.label.startsWith('Can open') ? (p.value ? 'warn' : 'ok') : 'ok', go: p.go }))
    : n.k === 'capacity' ? [{ label: 'Need capacity within 90 days', value: num(bs.length), tone: 'warn' }, { label: 'Within 30 days', value: num(bs.filter(b => capDays(capOf(s, b)) <= 30).length), tone: 'bad' }, { label: 'Internet line first', value: num(bs.filter(b => capOf(s, b).wanDays <= capOf(s, b).wifiDays).length) }, { label: 'Wi-Fi first', value: num(bs.filter(b => capOf(s, b).wifiDays < capOf(s, b).wanDays).length) }, { label: 'Room to grow', value: num(scopeAll.length - bs.length), tone: 'ok' }]
    : n.k === 'latency' ? (() => { const v = scopeAll.map(lat); return [{ label: 'Average delay to the data centre', value: ms(sum(v) / v.length), tone: 'ok' }, { label: 'Under 60 ms', value: P(v.filter(x => x < 60).length / v.length, 0), tone: 'ok' }, { label: 'Slowest branch', value: ms(Math.max(...v)), tone: latTone(Math.max(...v)) }, { label: 'Branches', value: num(scopeAll.length) }]; })()
    : n.k === 'eos' ? (() => { const d = devicesOf(s, { k: 'eos', region: n.region, state: n.state }); return [{ label: 'Branches affected', value: num(bs.length), tone: 'warn' }, { label: 'Switches to replace', value: num(d.length), tone: 'warn', go: { t: 'devices', k: 'eos', region: n.region, state: n.state } }, { label: '48-port, support ends 31 Jan 2027', value: num(d.filter(x => x.sku === 'J9772A').length) }, { label: '24-port, support ends 31 Mar 2027', value: num(d.filter(x => x.sku !== 'J9772A').length) }]; })()
    : [...parts.map(p => ({ label: p.label, value: num(p.value), tone: p.label === STATUS.down.label ? (p.value ? 'bad' : 'ok') : p.label === STATUS.degraded.label || p.label === 'Had a problem' ? (p.value ? 'warn' : 'ok') : p.label === STATUS.backup.label ? 'info' : 'ok', go: p.go })), { label: 'Open incidents', value: num(incidentsOf(s, { k: 'open', region: n.region, state: n.state }, now).filter(i => !n.city || D.BR[i.branchId].city === n.city).length), go: { t: 'incidents', k: 'open', region: n.region, state: n.state } }];
  return (
    <div>
      <Head kicker={n.city ? 'City' : n.state ? 'State' : n.region ? 'Region' : 'All branches'} title={n.k === 'all' ? scopeOf(n) : `${set.label}${n.region || n.state ? ` – ${scopeOf(n)}` : ''}`} sub={n.k === 'all' ? `${num(scopeAll.length)} branches. ${set.plain}` : set.plain} />
      <Kpis items={kpis} go={go} />
      {!['capacity', 'latency', 'eos'].includes(n.k) && <div className="mt-5"><StackBar parts={parts} go={go} /></div>}
      <Grid>
        {level && geoRows.length > 0 && <Panel title={`By ${level}`} hint={`${metric.what} · click to go in`}>
          <HBars rows={geoRows.slice(0, 14).map(r => ({ ...r, color: geoColor(r) }))} max={metric.max} fmt={metric.fmt} labelW={170} onRow={r => go(narrow(n, level, r.key, r.g))} />
          {geoRows.length > 14 && <Note>{geoRows.length - 14} more {level === 'city' ? 'cities' : `${level}s`} in the table below.</Note>}
        </Panel>}
        <Panel title="Where" hint="each dot is a branch · click one">
          <NAMap points={pts} h={300} focus={n.region || n.state ? scopeAll : null} onPoint={p => go({ t: 'branch', id: p.id })} />
          <Legend className="mt-1" items={Object.values(STATUS).map(x => [x.label, x.color])} />
        </Panel>
      </Grid>
      <div className="mt-7">
        <Panel title={n.k === 'all' ? 'Branches, problems first' : `${set.label} (${num(bs.length)})`} hint="click a branch for its full picture">
          <Rows cols={['Branch', 'Now', n.k === 'latency' ? 'Delay to data centre' : 'Line in use', n.k === 'capacity' ? 'When it fills' : 'Why']} page={15}
            rows={list.map(b => { const al = activeLine(s, b); return { key: b.id, id: b.id, cells: [<Name t={b.name} sub={b.brand} />, <Pill tone={stTone(st[b.id])}>{STATUS[st[b.id]].label}</Pill>, st[b.id] === 'down' ? <span className="text-bad font-semibold">No line reachable</span> : <span className="tabular-nums"><b className={TX[latTone(al.lat)]}>{al.lat} ms</b><span className="text-ink3"> · {al.line.carrier} {al.line.type}</span></span>, <span className="text-ink2">{why(b)}</span>] }; })}
            onRow={r => go({ t: 'branch', id: r.id })} empty="No branch in this group right now." />
        </Panel>
      </div>
    </div>
  );
}

// ---------- one branch ----------
function BranchView({ n, go, ctx }) {
  const { s, now } = ctx;
  const b = D.BR[n.id];
  const st = statusOf(s, b), al = activeLine(s, b), incs = openIncs(s, b), ready = readyOf(s, b), cap = capOf(s, b), clk = branchClock(b, now);
  const lines = b.wan.map(id => circuitOf(s, id));
  const day = useMemo(() => lineDay(s, al.line, now), [b.id]);
  const devs = D.devicesOf(b.id), nf = useMemo(() => D.netflowOf(b), [b.id]);
  const fixed = s.resolved.filter(i => i.branchId === b.id && (i.resolved || 0) >= now - 30 * DAY).sort((a, c) => c.resolved - a.resolved);
  const checks = Object.entries(ready.c);
  const pass = checks.filter(([, x]) => x.st === 'pass').length;
  const down = st === 'down';
  const around = [
    ...s.workOrders.filter(w => w.branchId === b.id && w.status !== 'Completed').map(w => ({ title: `Technician visit: ${w.task}`, sub: `${w.status}${w.eta ? `, arriving ${hhmm(w.eta)} CT` : ''} · ${w.window}`, tone: 'info', go: w.inc ? { t: 'incident', id: w.inc } : null })),
    ...s.cases.filter(c => c.branchId === b.id && !c.closed && /^Open|^Dispatched/.test(c.status || '')).map(c => ({ title: `${c.carrier} repair ${c.id}`, sub: `${c.status}${c.eta ? ` · promised by ${hhmm(c.eta)} CT${c.eta < now ? ' (late)' : ''}` : ''}`, tone: c.eta && c.eta < now ? 'bad' : 'warn', go: { t: 'circuit', id: c.circuit } })),
    ...s.approvals.filter(a => a.status === 'Pending' && a.branchId === b.id).map(a => ({ title: `Decision waiting: ${a.title}`, sub: `${Math.round(a.conf * 100)}% confidence · ${a.why[0]}`, tone: 'warn', go: { t: 'approval', id: a.id } })),
    ...s.drift.filter(d => d.branchId === b.id).map(d => ({ title: `Differs from the standard setup: ${d.item}`, sub: `${d.device} · ${d.source}`, tone: d.sev === 'High' ? 'bad' : 'warn', go: { t: 'device', id: d.device } })),
    ...s.predictions.filter(p => p.branchId === b.id && p.status !== 'Dismissed').map(p => ({ title: `Predicted: ${p.kind}`, sub: `${p.signal} · ${p.horizon}`, tone: 'warn', go: { t: 'prediction', id: p.id } })),
    ...s.changes.filter(c => c.start > now && c.start < now + 7 * DAY && (c.scope === b.region || c.scope === 'All regions')).map(c => ({ title: `Planned change: ${c.title}`, sub: `${dateShort(c.start)} · ${c.window} · ${c.risk} risk`, tone: 'info', go: { t: 'change', id: c.id } })),
  ];
  const byType = ['SD-WAN', 'Switch', 'AP'].map(t => devs.filter(d => d.type === t));
  const labels = day.map(x => `${String(parts(x.t, b.tz).h).padStart(2, '0')}:00`);
  return (
    <div>
      <Head kicker={<span className="inline-flex flex-wrap gap-x-1.5"><button className="hover:underline" onClick={() => go({ t: 'set', k: 'all', region: b.region })}>{b.region}</button>›<button className="hover:underline" onClick={() => go({ t: 'set', k: 'all', region: b.region, state: b.state })}>{stateName(b.state)}</button>›<button className="hover:underline" onClick={() => go({ t: 'set', k: 'all', region: b.region, state: b.state, city: b.city })}>{b.city}</button></span>}
        title={b.name} sub={`${b.brand} · ${{ S: 'small', M: 'medium', L: 'large' }[b.size]} branch · local time ${clk.local} · ${clk.closedToday ? 'closed today' : `open ${clk.opens}–${clk.closes}`}${clk.open ? ' (open now)' : ''}`}
        right={<div className="pt-5"><Pill tone={stTone(st)}>{STATUS[st].label}</Pill></div>}>
        {st !== 'up' && !incs.length && b.why && <p className="mt-2 text-[13px] text-warn font-semibold flex items-center gap-1.5"><I.Eye size={14} />Being watched: {b.why}</p>}
      </Head>
      <Kpis go={go} items={[
        { label: 'Delay to data centre', value: down ? '—' : ms(al.lat), tone: latTone(down ? null : al.lat), sub: down ? 'unreachable' : `on the ${al.line.role === 'Primary' ? 'main' : 'backup'} line` },
        { label: 'Packet loss', value: down ? '—' : `${al.loss.toFixed(2)}%`, tone: lossTone(down ? null : al.loss), sub: 'under 0.5% is healthy' },
        { label: 'Jitter', value: down ? '—' : `${al.jit} ms`, tone: jitTone(down ? null : al.jit), sub: 'under 10 ms for calls' },
        { label: 'Open incidents', value: num(incs.length), tone: incs.length ? 'warn' : 'ok', go: incs.length === 1 ? { t: 'incident', id: incs[0].id } : incs.length ? { t: 'incidents', k: 'open', branch: b.id } : null },
        { label: 'Opening checks passed', value: `${pass} of ${checks.length}`, tone: ready.result === 'Not ready' ? 'bad' : pass < checks.length ? 'warn' : 'ok', sub: ready.result },
        { label: 'Room to grow', value: capDays(cap) > 90 ? '90 days +' : `${capDays(cap)} days`, tone: capDays(cap) <= 30 ? 'bad' : capDays(cap) <= 90 ? 'warn' : 'ok', sub: 'before a line or Wi-Fi fills' },
      ]} />
      <Grid>
        <Panel title="Internet lines" hint="click a line">
          <div className="grid sm:grid-cols-2 gap-3">{lines.map(c => { const ecDown = down && incs.some(i => i.kind === 'edgedown'); const lst = ecDown ? 'Unreachable' : down ? 'Down' : c.status; const tone = lst === 'Up' ? 'ok' : lst === 'Degraded' ? 'warn' : 'bad'; const av = D.availOf(c); return (
            <button key={c.id} onClick={() => go({ t: 'circuit', id: c.id })} className="text-left border border-line rounded-md bg-panel p-3 hover:bg-chip/70 group">
              <div className="flex items-center gap-2"><span className="text-[11px] font-bold uppercase tracking-wider text-ink3 flex-1">{c.role === 'Primary' ? 'Main line' : 'Backup line'}</span><Pill tone={tone}>{lst === 'Up' ? (al.line.id === c.id ? 'In use' : 'Standing by') : lst}</Pill></div>
              <div className="text-[15px] font-bold text-ink mt-1">{c.carrier} {c.type}</div>
              <div className="text-[12px] text-ink2">{c.bw} Mb/s · {ecDown ? 'up at the modem; the SD-WAN appliance is not answering' : lst === 'Down' ? 'no traffic' : `${c.lat} ms, loss ${c.loss}%`}</div>
              <div className="text-[11.5px] text-ink3 mt-1">Up {P(av, 2)} of the last 30 days (promise {P(D.LINE_SLA[c.type], 2)}) · {c.flaps30} drop{c.flaps30 === 1 ? '' : 's'}</div>
            </button>); })}</div>
        </Panel>
        <Panel title="The last 24 hours" hint={`${al.line.carrier} ${al.line.type}, local time`}>
          <LineChart h={170} labels={labels} yFmt={v => `${Math.round(v)} ms`} yMin={0} refLines={[{ v: 60, label: '60 ms – payments start to slow', color: C.warn }]}
            series={[{ name: 'Delay to data centre', color: C.s1, area: !day.some(x => x.lat == null), data: day.map(x => x.lat) }]} />
          <Note>{down ? 'The gap is the time since the branch went offline.' : al.deg ? 'The rise is the open fault on this line; the fix is under way.' : 'Busier in trading hours, quiet overnight. Steady is good.'}</Note>
        </Panel>
        <Panel title="Opening checks" hint={ready.result}>
          <ul className="border border-line rounded-md bg-panel divide-y divide-line/70">{checks.map(([k, x]) => (
            <li key={k} className="flex items-start gap-2 px-3 py-1.5 text-[12.5px]">
              {x.st === 'pass' ? <I.CheckCircle2 size={15} className="text-ok mt-[1px] shrink-0" /> : x.st === 'warn' ? <I.AlertTriangle size={15} className="text-warn mt-[1px] shrink-0" /> : <I.XCircle size={15} className="text-bad mt-[1px] shrink-0" />}
              <span className="font-semibold text-ink w-[170px] shrink-0">{CHECK_NAME[k] || k}</span><span className="text-ink2 min-w-0">{x.detail}</span>
            </li>))}</ul>
        </Panel>
        <Panel title="Incidents" hint="open first, then the last 30 days">
          <Rows page={8} cols={['Incident', 'What', 'State']} onRow={r => go({ t: 'incident', id: r.id })} empty="No incident at this branch in the last 30 days."
            rows={[...incs, ...fixed].map(i => ({ key: i.id, id: i.id, cells: [<Name t={i.id} sub={i.pri} />, <span className="text-ink2">{i.title}</span>, i.state === 'Resolved' ? <span className="text-ink3 whitespace-nowrap">{isAutoInc(i) ? <b className="text-ok">Fixed automatically</b> : 'Fixed'} · {dateShort(i.resolved)}</span> : <Pill tone={slaClock(i, now).used > 0.5 ? 'warn' : 'info'}>{i.state}</Pill>] }))} />
        </Panel>
        <Panel title="Devices" hint={`${devs.length} at this branch`}>
          <Rows page={8} cols={['Device', 'Model', 'Software', 'Lifecycle']} onRow={r => go({ t: 'device', id: r.id })}
            rows={byType.flat().map(d => { const lc = D.lifecycleOf(d), crit = D.vulnsOf(d).some(a => a.sev === 'Critical'); return { key: d.id, id: d.id, cells: [<Name t={d.id} sub={d.role} />, <span className="text-ink2">{modelName(d)}</span>, <span className={fwBehind(d) || crit ? 'text-warn font-semibold' : 'text-ink2'}>{fwText(d)}{crit ? ' · critical flaw' : ''}</span>, <Pill tone={{ red: 'bad', amber: 'warn', green: 'ok' }[lc.tone]}>{lc.status}</Pill>] }; })} />
        </Panel>
        <Panel title="What uses the line" hint="yesterday, gigabytes">
          <HBars rows={nf.apps.slice(0, 6).map(a => ({ label: a.name, value: a.gb, sub: a.cls, color: a.cls === 'Business' ? C.s1 : a.cls === 'Guest' ? C.s3 : C.s5 }))} fmt={v => `${v} GB`} labelW={190} />
          <Note>Peak use {nf.peak}% of the main line at {nf.peakAt}. {nf.note || 'Business traffic leads; nothing unusual.'}</Note>
        </Panel>
      </Grid>
      {around.length > 0 && <div className="mt-7"><Panel title="Around this branch" hint="visits, carrier repairs, decisions, changes and predictions"><Clickable items={around} go={go} /></Panel></div>}
    </div>
  );
}

// ---------- one internet line, and carriers ----------
function CircuitView({ n, go, ctx }) {
  const { s, now } = ctx;
  const c = circuitOf(s, n.id), b = D.BR[c.branchId];
  const down = c.status === 'Down' || healthOf(s, b) === 'down';
  const day = useMemo(() => lineDay(s, c, now), [c.id]);
  const inc = s.incidents.find(i => i.state !== 'Resolved' && (i.ci === c.id || (i.kind === 'edgedown' && i.branchId === b.id)));
  const cs = s.cases.filter(x => x.circuit === c.id).sort((a, x) => x.opened - a.opened);
  const av = D.availOf(c), promise = D.LINE_SLA[c.type], credit = creditOf(c);
  const ecDown = inc && inc.kind === 'edgedown';
  const labels = day.map(x => `${String(parts(x.t, b.tz).h).padStart(2, '0')}:00`);
  return (
    <div>
      <Head kicker={<button className="hover:underline" onClick={() => go({ t: 'branch', id: b.id })}>{b.name}</button>} title={`${c.carrier} ${c.type} – ${c.role === 'Primary' ? 'main line' : 'backup line'}`}
        sub={`${c.bw} Mb/s. ${c.role === 'Primary' ? 'Card payments, the ordering system and voice use this line while it is healthy.' : 'Takes over in seconds if the main line fails.'}`}
        right={<div className="pt-5"><Pill tone={down ? 'bad' : c.status === 'Degraded' ? 'warn' : 'ok'}>{ecDown ? 'Unreachable' : down ? 'Down' : c.status}</Pill></div>}>
        {ecDown && <p className="mt-2 text-[13px] text-bad font-semibold">The line is up at the carrier's modem; the branch's SD-WAN appliance has stopped answering, so no traffic passes. Recovery is under way.</p>}
      </Head>
      <Kpis go={go} items={[
        { label: 'Delay to data centre', value: down ? '—' : ms(c.lat + (c.status === 'Degraded' ? 18 + c.jit * 0.9 : 0)), tone: down ? 'bad' : latTone(c.lat) },
        { label: 'Packet loss', value: down ? '—' : `${c.loss}%`, tone: down ? 'bad' : lossTone(c.loss) },
        { label: 'Jitter', value: down ? '—' : `${c.jit} ms`, tone: down ? 'bad' : jitTone(c.jit) },
        { label: 'Up, last 30 days', value: P(av, 2), tone: av >= promise ? 'ok' : 'bad', sub: `promise ${P(promise, 2)}` },
        { label: 'Drops, 30 days', value: num(c.flaps30), tone: c.flaps30 >= 3 ? 'warn' : 'ok', go: c.flaps30 >= 3 ? { t: 'lines', k: 'flap', carrier: c.carrier } : null },
        { label: 'Fault tickets, 90 days', value: num(c.tickets90), tone: c.tickets90 >= 3 ? 'warn' : 'ok', sub: c.ntf90 ? `${c.ntf90} closed "no fault found"` : null, go: c.tickets90 >= 3 ? { t: 'lines', k: 'repeat', carrier: c.carrier } : null },
      ]} />
      <Grid>
        <Panel title="Delay, last 24 hours" hint="local time">
          <LineChart h={160} labels={labels} yMin={0} yFmt={v => `${Math.round(v)} ms`} refLines={[{ v: 60, label: '60 ms', color: C.warn }]} series={[{ name: 'Delay', color: C.s1, area: !day.some(x => x.lat == null), data: day.map(x => x.lat) }]} />
        </Panel>
        <Panel title="Packet loss, last 24 hours" hint="under 0.5% is healthy">
          <LineChart h={160} labels={labels} yMin={0} yFmt={v => `${v.toFixed(2)}%`} refLines={[{ v: 1, label: '1% – calls and payments suffer', color: C.bad }]} series={[{ name: 'Packet loss', color: C.bad, data: day.map(x => x.loss) }]} />
        </Panel>
        <Panel title="How full the line is, last 24 hours" hint="share of its speed in use">
          <LineChart h={150} labels={labels} yMin={0} yMax={100} yFmt={v => `${Math.round(v)}%`} refLines={[{ v: 80, label: '80% – time to plan an upgrade', color: C.warn }]} series={[{ name: 'In use', color: C.s4, area: !day.some(x => x.use == null), data: day.map(x => x.use) }]} />
        </Panel>
        <Panel title="The line">
          <KV items={[['Carrier', <button className="text-brand font-semibold hover:underline" onClick={() => go({ t: 'carrier', carrier: c.carrier })}>{c.carrier}</button>], ['Circuit ID', <span className="font-mono">{c.cid}</span>], ['Type and speed', `${c.type}, ${c.bw} Mb/s`], c.lec && ['Local exchange company', c.lec], ['Monthly cost (est.)', `$${num(Math.round(D.lineMRC(c)))}`], ['Service credit due', credit ? <b className="text-ok">${num(Math.round(credit))}</b> : 'None – inside the promise'], ['Outage this month', `${num(c.outage30)} min`]]} />
        </Panel>
        <Panel title="Faults and carrier repairs">
          <Clickable go={go} items={[
            ...(inc ? [{ title: `Open: ${inc.title}`, sub: `${inc.id} · ${inc.pri} · opened ${ago(inc.opened, now)}`, tone: 'bad', go: { t: 'incident', id: inc.id } }] : []),
            ...cs.map(x => ({ title: `${x.carrier} case ${x.id}`, sub: `${x.status} · opened ${dateShort(x.opened)}${x.eta ? ` · promised ${hhmm(x.eta)} CT` : ''}`, tone: /Closed/.test(x.status) ? 'ok' : x.eta && x.eta < now ? 'bad' : 'warn', go: x.inc ? { t: 'incident', id: x.inc } : null })),
            ...(!inc && !cs.length ? [{ title: 'No open fault and no carrier case on record', tone: 'ok' }] : []),
          ]} />
        </Panel>
      </Grid>
    </div>
  );
}

function CarrierView({ n, go, ctx }) {
  const { s } = ctx;
  const ls = linesOf(s, { carrier: n.carrier, region: n.region });
  const sc = D.SCORECARD.find(x => x.carrier === n.carrier || (x.carrier === 'Canadian carriers' && ['Bell', 'Rogers', 'Telus'].includes(n.carrier)));
  const breach = ls.filter(c => D.availOf(c) < D.LINE_SLA[c.type]), flap = ls.filter(c => c.flaps30 >= 3), down = ls.filter(c => c.status === 'Down');
  const types = Object.entries(ls.reduce((m, c) => ({ ...m, [c.type]: (m[c.type] || 0) + 1 }), {}));
  const regs = regionOrder(ls.map(c => D.BR[c.branchId])).map(r => { const g = ls.filter(c => D.BR[c.branchId].region === r); return { label: r, value: sum(g, D.availOf) / g.length, sub: `${g.length} lines`, key: r }; });
  return (
    <div>
      <Head kicker="Carrier" title={n.carrier} sub={`${num(ls.length)} lines${n.region ? ` in ${n.region}` : ' across the estate'}: how they are doing right now and against their uptime promise this month.`} />
      <Kpis go={go} items={[
        { label: 'Lines', value: num(ls.length), go: { t: 'lines', k: 'all', carrier: n.carrier, region: n.region } },
        { label: 'Down now', value: num(down.length), tone: down.length ? 'bad' : 'ok', go: down.length ? { t: 'lines', k: 'down', carrier: n.carrier, region: n.region } : null },
        { label: 'Below promise this month', value: num(breach.length), tone: breach.length ? 'warn' : 'ok', go: breach.length ? { t: 'lines', k: 'breach', carrier: n.carrier, region: n.region } : null },
        { label: 'Unstable (3+ drops)', value: num(flap.length), tone: flap.length ? 'warn' : 'ok', go: flap.length ? { t: 'lines', k: 'flap', carrier: n.carrier, region: n.region } : null },
        { label: 'Credits due', value: `$${num(Math.round(sum(breach, creditOf)))}`, tone: 'ok' },
        sc && { label: 'Promise met, 6 months', value: P(sc.slaMet, 0), tone: sc.slaMet >= 0.9 ? 'ok' : 'warn', sub: `${sc.cases6m} cases · ${sc.mttr} h to restore` },
      ]} />
      <Grid>
        <Panel title="Uptime by region" hint="average of the lines, last 30 days · click to go in">
          <HBars rows={regs.map(r => ({ ...r, color: r.value >= 0.9995 ? C.ok : r.value >= 0.999 ? C.s1 : C.warn }))} fmt={v => P(v, 2)} max={1} labelW={170} onRow={r => go({ t: 'lines', k: 'all', carrier: n.carrier, region: r.key })} />
        </Panel>
        <Panel title="Line types">
          <HBars rows={types.map(([t, v]) => ({ label: t, value: v, sub: `promise ${P(D.LINE_SLA[t], 2)}`, color: C.s1 }))} labelW={130} onRow={r => go({ t: 'lines', k: 'all', carrier: n.carrier, region: n.region, type: r.label })} />
          {sc && <Note>Last 6 months: {sc.cases6m} carrier cases, {sc.ntf} closed as "no fault found", {sc.repeat} repeat-offender lines, {sc.mttr} hours on average to restore.</Note>}
        </Panel>
      </Grid>
      <div className="mt-7"><Panel title="Lines, least reliable first" hint="click a line">
        <LineRows ls={ls.slice().sort((a, c) => D.availOf(a) - D.availOf(c) || c.flaps30 - a.flaps30)} go={go} s={s} />
      </Panel></div>
    </div>
  );
}
function LineRows({ ls, go, s, page = 12 }) {
  return <Rows page={page} cols={['Line', 'Branch', 'Now', 'Up, 30 days', 'Drops', 'Credit']} onRow={r => go({ t: 'circuit', id: r.id })}
    rows={ls.map(c => { const b = D.BR[c.branchId], dn = c.status === 'Down' || healthOf(s, b) === 'down', av = D.availOf(c); return { key: c.id, id: c.id, cells: [<Name t={`${c.carrier} ${c.type}`} sub={c.role === 'Primary' ? 'main line' : 'backup line'} />, <span className="text-ink2">{b.name}</span>, <Pill tone={dn ? 'bad' : c.status === 'Degraded' ? 'warn' : 'ok'}>{dn ? 'Down' : c.status}</Pill>, <b className={av >= D.LINE_SLA[c.type] ? 'text-ok' : 'text-bad'}>{P(av, 2)}</b>, <span className="tabular-nums">{c.flaps30}</span>, creditOf(c) ? `$${num(Math.round(creditOf(c)))}` : '—'] }; })} />;
}
function LinesView({ n, go, ctx }) {
  const { s } = ctx;
  const set = LINE_SETS[n.k] || LINE_SETS.all;
  const ls = linesOf(s, n);
  const byCar = Object.entries(ls.reduce((m, c) => ({ ...m, [c.carrier]: (m[c.carrier] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1]);
  const geo = !n.region ? 'region' : 'state';
  const byGeo = Object.entries(ls.reduce((m, c) => { const b = D.BR[c.branchId], k = geo === 'region' ? b.region : b.state; return { ...m, [k]: (m[k] || 0) + 1 }; }, {})).sort((a, b) => b[1] - a[1]);
  const sorted = ls.slice().sort((a, c) => n.k === 'flap' ? c.flaps30 - a.flaps30 : n.k === 'repeat' ? c.tickets90 - a.tickets90 : D.availOf(a) - D.availOf(c));
  return (
    <div>
      <Head kicker="Internet lines" title={`${set.label}${n.carrier ? ` – ${n.carrier}` : ''}${n.region ? ` – ${scopeOf(n)}` : ''}`} sub={set.plain} />
      <Kpis go={go} items={[
        { label: n.k === 'all' ? 'Lines' : 'Lines in this list', value: num(ls.length), tone: n.k === 'all' ? null : 'warn' },
        { label: 'Main lines', value: num(ls.filter(c => c.role === 'Primary').length) },
        { label: 'Backup lines', value: num(ls.filter(c => c.role !== 'Primary').length) },
        { label: 'Branches affected', value: num(new Set(ls.map(c => c.branchId)).size) },
        { label: 'Credits due', value: `$${num(Math.round(sum(ls, creditOf)))}`, tone: 'ok' },
      ]} />
      <Grid>
        {!n.carrier && <Panel title="By carrier" hint="click for the carrier's picture"><HBars rows={byCar.map(([k, v]) => ({ label: k, value: v, color: C.s1 }))} labelW={130} onRow={r => go({ t: 'carrier', carrier: r.label, region: n.region })} /></Panel>}
        <Panel title={`By ${geo}`} hint="click to go in"><HBars rows={byGeo.slice(0, 12).map(([k, v]) => ({ label: geo === 'state' ? stateName(k) : k, key: k, value: v, color: n.k === 'all' ? C.s1 : C.warn }))} labelW={170} onRow={r => go({ ...n, [geo]: r.key })} /></Panel>
      </Grid>
      <div className="mt-7"><Panel title="The lines" hint="click a line"><LineRows ls={sorted} go={go} s={s} page={15} /></Panel></div>
    </div>
  );
}

// ---------- devices ----------
function DeviceView({ n, go, ctx }) {
  const { s, now } = ctx;
  const d = D.DEV[n.id]; if (!d) return <p>Device not found.</p>;
  const b = D.BR[d.branchId], lc = D.lifecycleOf(d), vulns = D.vulnsOf(d), info = D.lifeInfo(d);
  const drift = s.drift.filter(x => x.device === d.id), preds = s.predictions.filter(p => p.target === d.id);
  const incs = [...s.incidents, ...s.resolved].filter(i => i.ci === d.id).sort((a, c) => c.opened - a.opened);
  const target = D.FW_TARGET[d.type === 'AP' ? 'AP' : d.model][0];
  const crit = vulns.filter(a => a.sev === 'Critical');
  return (
    <div>
      <Head kicker={<button className="hover:underline" onClick={() => go({ t: 'branch', id: b.id })}>{b.name}</button>} title={d.id} sub={`${modelName(d)} · ${d.role}. ${d.type === 'SD-WAN' ? 'The SD-WAN appliance joins the branch to the data centre over both lines and moves traffic between them.' : d.type === 'Switch' ? 'Connects the branch’s computers, tills, access points and cameras.' : 'Wi-Fi for handhelds, laptops and the yard.'}`} />
      <Kpis go={go} items={[
        { label: 'Software', value: fwText(d), tone: fwBehind(d) ? 'warn' : 'ok', sub: `running ${d.fw}; approved ${target}` },
        { label: 'Critical security flaws', value: num(crit.length), tone: crit.length ? 'bad' : 'ok', go: crit.length ? { t: 'devices', k: 'crit', model: d.model } : null },
        { label: 'Lifecycle', value: lc.status, tone: { red: 'bad', amber: 'warn', green: 'ok' }[lc.tone], go: /2530/.test(d.model) ? { t: 'devices', k: 'eos' } : null },
        { label: D.warrantyKind(d), value: D.warrantyText(d), tone: d.warranty < now ? 'warn' : 'ok' },
        { label: 'Last config backup', value: d.backup.st === 'N/A' ? 'Central' : d.backup.st, tone: d.backup.st === 'Failed' ? 'bad' : d.backup.st === 'Stale' ? 'warn' : 'ok', sub: d.backup.at ? ago(d.backup.at, now) : 'kept by Aruba Central' },
        { label: 'Incidents on record', value: num(incs.length), tone: incs.some(i => i.state !== 'Resolved') ? 'warn' : 'ok' },
      ]} />
      <Grid>
        <Panel title="The device">
          <KV items={[['Model', `${modelName(d)}${d.sku ? ` (${d.sku})` : ''}`], ['Role', d.role], ['Serial / MAC', <span className="font-mono">{d.serial}</span>], ['Managed by', d.mode === 'Central' ? 'Aruba Central' : d.mode === 'Orchestrator' ? 'EdgeConnect Orchestrator' : d.mode === 'Standalone' ? 'Standalone (not yet in Aruba Central)' : d.mode], ['Software', `${d.fw} (approved ${target})`], ['End of sale', info.eos || 'Not announced'], ['End of support', info.eosup || 'Not announced'], info.replace && ['Replacement', info.replace], d.backup.why && ['Backup error', d.backup.why]]} />
        </Panel>
        <Panel title="Security advisories" hint="from HPE Aruba Networking">
          {vulns.length ? <Clickable go={go} items={vulns.map(a => ({ title: `${a.id}: ${a.title}`, sub: `${a.sev}${a.cvss ? ` · CVSS ${a.cvss}` : ''}${a.fixed ? ` · fixed in ${a.fixed}` : ''}${a.cves.length ? ` · ${a.cves.join(', ')}` : ''}`, tone: a.sev === 'Critical' ? 'bad' : 'warn', go: { t: 'devices', k: a.sev === 'Critical' ? 'crit' : /2530/.test(d.model) ? 'eos' : 'fw', model: d.model } }))} /> : <p className="text-[13px] text-ok font-semibold">No published advisory affects this device's software.</p>}
        </Panel>
        {(drift.length > 0 || preds.length > 0 || incs.length > 0) && <Panel title="Changes, predictions and incidents" className="lg:col-span-2">
          <Clickable go={go} items={[
            ...drift.map(x => ({ title: `Differs from the standard setup: ${x.item}`, sub: `found ${ago(x.since, now)} · source: ${x.source}`, tone: x.sev === 'High' ? 'bad' : 'warn' })),
            ...preds.map(p => ({ title: `Predicted: ${p.kind}`, sub: `${p.signal} · ${p.horizon}`, tone: 'warn', go: { t: 'prediction', id: p.id } })),
            ...incs.map(i => ({ title: `${i.id}: ${i.title}`, sub: `${i.pri} · ${i.state === 'Resolved' ? `fixed ${dateShort(i.resolved)}` : i.state}`, tone: i.state === 'Resolved' ? 'ok' : 'warn', go: { t: 'incident', id: i.id } })),
          ]} />
        </Panel>}
      </Grid>
    </div>
  );
}
function DevicesView({ n, go, ctx }) {
  const { s } = ctx;
  const set = DEV_SETS[n.k] || DEV_SETS.all;
  const ds = useMemo(() => devicesOf(s, n), [n.k, n.model, n.region, n.state, n.type]);
  const byModel = Object.entries(ds.reduce((m, d) => ({ ...m, [d.model]: (m[d.model] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1]);
  const geo = !n.region ? 'region' : 'state';
  const byGeo = Object.entries(ds.reduce((m, d) => { const b = D.BR[d.branchId], k = geo === 'region' ? b.region : b.state; return { ...m, [k]: (m[k] || 0) + 1 }; }, {})).sort((a, b) => b[1] - a[1]);
  const tone = n.k === 'all' ? C.s1 : n.k === 'crit' ? C.bad : C.warn;
  return (
    <div>
      <Head kicker="Devices" title={`${set.label}${n.model ? ` – ${n.model}` : ''}${n.region ? ` – ${scopeOf(n)}` : ''}`} sub={set.plain} />
      <Kpis go={go} items={[
        { label: 'Devices', value: num(ds.length), tone: n.k === 'all' ? null : 'warn' },
        { label: 'Branches affected', value: num(new Set(ds.map(d => d.branchId)).size) },
        { label: 'SD-WAN appliances', value: num(ds.filter(d => d.type === 'SD-WAN').length), go: { ...n, type: 'SD-WAN' } },
        { label: 'Switches', value: num(ds.filter(d => d.type === 'Switch').length), go: { ...n, type: 'Switch' } },
        { label: 'Access points', value: num(ds.filter(d => d.type === 'AP').length), go: { ...n, type: 'AP' } },
        { label: 'Share of all devices', value: P(ds.length / D.DEVICES.length, 1) },
      ]} />
      <Grid>
        {!n.model && <Panel title="By model" hint="click to narrow"><HBars rows={byModel.map(([k, v]) => ({ label: k === 'EC-XS' ? 'EdgeConnect EC-XS' : `Aruba ${k}`, key: k, value: v, color: tone }))} labelW={160} onRow={r => go({ ...n, model: r.key })} /></Panel>}
        <Panel title={`By ${geo}`} hint="click to go in"><HBars rows={byGeo.slice(0, 12).map(([k, v]) => ({ label: geo === 'state' ? stateName(k) : k, key: k, value: v, color: tone }))} labelW={170} onRow={r => go({ ...n, [geo]: r.key })} /></Panel>
      </Grid>
      <div className="mt-7"><Panel title="The devices" hint="click a device">
        <Rows page={15} cols={['Device', 'Branch', 'Model', 'Software', 'Lifecycle']} onRow={r => go({ t: 'device', id: r.id })}
          rows={ds.map(d => { const lc = D.lifecycleOf(d); return { key: d.id, id: d.id, cells: [<Name t={d.id} sub={d.role} />, <span className="text-ink2">{D.BR[d.branchId].name}</span>, <span className="text-ink2">{modelName(d)}</span>, <span className={fwBehind(d) ? 'text-warn font-semibold' : 'text-ink2'}>{fwText(d)}</span>, <Pill tone={{ red: 'bad', amber: 'warn', green: 'ok' }[lc.tone]}>{lc.status}</Pill>] }; })} />
      </Panel></div>
    </div>
  );
}

// ---------- incidents ----------
function IncidentView({ n, go, ctx }) {
  const { s, now } = ctx;
  const inc = [...s.incidents, ...s.resolved].find(i => i.id === n.id); if (!inc) return <p>Incident not found.</p>;
  const b = D.BR[inc.branchId], clk = slaClock(inc, now), done = inc.state === 'Resolved';
  const rb = D.RB[inc.runbook];
  const ci = D.CIR[inc.ci] ? { t: 'circuit', id: inc.ci } : D.DEV[inc.ci] ? { t: 'device', id: inc.ci } : null;
  const events = [
    ...inc.signals.map(x => ({ t: x.t, text: x.msg, src: x.src, tone: x.sev === 'Critical' ? 'bad' : x.sev === 'Major' ? 'warn' : 'info' })),
    ...(inc.agentSteps || []).map(x => ({ t: x.t, text: x.text, src: `Mova iO ${x.agent} agent`, tone: 'ai' })),
    ...(inc.notes || []).map(x => ({ t: x.t, text: x.text, src: x.who, tone: 'muted' })),
    ...(inc.acked ? [{ t: inc.acked, text: `Picked up by ${inc.assignee || 'the NOC'}`, src: 'ServiceNow', tone: 'info' }] : []),
    ...(done ? [{ t: inc.resolved, text: inc.autoAction || `Fixed and closed: ${inc.closeCode}`, src: isAutoInc(inc) ? 'Mova iO (automatic)' : inc.assignee, tone: 'ok' }] : []),
  ].sort((a, c) => a.t - c.t);
  const DOT = { bad: C.bad, warn: C.warn, info: C.s1, ai: C.brand, muted: C.s3, ok: C.ok };
  return (
    <div>
      <Head kicker={<button className="hover:underline" onClick={() => go({ t: 'branch', id: b.id })}>{b.name}</button>} title={inc.title} sub={`${inc.id} · ${inc.cat}. ${(inc.impact || [])[0] ? `What the branch feels: ${inc.impact[0].replace(/\.$/, '')}.` : ''}`}
        right={<div className="pt-5 flex gap-1.5"><Pill tone={inc.pri === 'P1' || inc.pri === 'P2' ? 'bad' : 'warn'}>{inc.pri}</Pill><Pill tone={done ? 'ok' : 'info'}>{done ? (isAutoInc(inc) ? 'Fixed automatically' : 'Fixed') : inc.state}</Pill></div>} />
      <Kpis go={go} items={[
        { label: done ? 'Took' : 'Open for', value: hrs((inc.resolved || now) - inc.opened), tone: clk.resBreached ? 'bad' : 'ok', sub: `opened ${dt(inc.opened)} CT` },
        { label: 'Deadline to fix', value: done ? (clk.resBreached ? 'Missed' : 'Met') : clk.resLeft > 0 ? `${hrs(clk.resLeft)} left` : 'Passed', tone: clk.resBreached ? 'bad' : clk.used > 0.5 ? 'warn' : 'ok', sub: `${inc.pri} allows ${hrs(D.slaOf(inc.pri).res)}` },
        { label: 'Owner', value: inc.assignee || 'Not yet', tone: inc.assignee ? null : 'warn', sub: inc.group },
        { label: 'Alerts grouped into this one', value: num((inc.corr || 0) + inc.signals.length), sub: `${num(inc.suppressed || 0)} kept quiet as noise` },
        { label: 'Likely cause', value: P(inc.rca[0].conf, 0), tone: inc.rca[0].conf >= 0.8 ? 'ok' : 'warn', sub: 'confidence' },
        ci && { label: D.CIR[inc.ci] ? 'The line' : 'The device', value: D.CIR[inc.ci] ? D.CIR[inc.ci].carrier : inc.ci.split('-').pop(), go: ci },
      ]} />
      {!done && <div className="mt-4"><div className="flex justify-between text-[11.5px] text-ink3 mb-1"><span>Time used of the {hrs(D.slaOf(inc.pri).res)} allowed</span><b className={TX[clk.used > 0.75 ? 'bad' : clk.used > 0.5 ? 'warn' : 'ok']}>{P(Math.min(1, clk.used), 0)}</b></div><div className="h-2 bg-ink/10 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.min(100, clk.used * 100)}%`, background: clk.used > 0.75 ? C.bad : clk.used > 0.5 ? C.warn : C.ok }} /></div></div>}
      <Grid>
        <Panel title="What happened" hint="Central time">
          <ol className="relative border border-line rounded-md bg-panel px-3 py-2">{events.map((e, i) => (
            <li key={i} className="grid grid-cols-[46px_12px_minmax(0,1fr)] gap-2 py-1 text-[12.5px]">
              <span className="font-mono text-ink3 tabular-nums">{hhmm(e.t)}</span><span className="mt-[6px] w-2 h-2 rounded-full" style={{ background: DOT[e.tone] }} />
              <span className="min-w-0"><span className="text-ink">{e.text}</span><span className="block text-[11px] text-ink3">{e.src}</span></span>
            </li>))}</ol>
        </Panel>
        <div className="space-y-7 min-w-0">
          <Panel title="Likely cause" hint="ranked by Mova iO">
            <HBars rows={inc.rca.map(r => ({ label: r.cause, value: r.conf, sub: r.ev, color: r === inc.rca[0] ? C.brand : C.s3 }))} max={1} fmt={v => P(v, 0)} labelW={220} />
          </Panel>
          <Panel title="The fix">
            <KV items={[['Runbook', rb ? `${rb.id} ${rb.name}` : inc.runbook], ['Status', done ? (inc.autoAction || inc.closeCode) : inc.rbState === 'done' ? 'Ran; checking the result' : 'Proposed'], ['Checks before closing', (inc.verify || []).map(v => v.v).join(' · ') || '—'], inc.carrierCase && ['Carrier case', inc.carrierCase], inc.workOrder && ['Technician visit', inc.workOrder]]} />
          </Panel>
          <Panel title="Related">
            <Clickable go={go} items={[
              { title: `Everything at ${b.name}`, sub: 'lines, devices, checks and other incidents', go: { t: 'branch', id: b.id } },
              ci && { title: D.CIR[inc.ci] ? `The ${D.CIR[inc.ci].carrier} ${D.CIR[inc.ci].type} line` : `The device ${inc.ci}`, sub: 'readings, history and repairs', go: ci },
              { title: `Other "${(KIND_PLAIN[inc.kind] || inc.kind).toLowerCase()}" in the last 7 days`, sub: 'how often it happens and how it was fixed', go: { t: 'incidents', k: 'opened7', kind: inc.kind } },
            ].filter(Boolean)} />
          </Panel>
        </div>
      </Grid>
    </div>
  );
}
function IncidentsView({ n, go, ctx }) {
  const { s, now } = ctx;
  const set = INC_SETS[n.k] || INC_SETS.open;
  const list = useMemo(() => incidentsOf(s, n, now), [JSON.stringify(n)]);
  const closed = list.filter(i => i.state === 'Resolved'), auto = closed.filter(isAutoInc);
  const ttr = closed.map(i => i.resolved - i.opened).sort((a, b) => a - b);
  const weekly = ['resolved7', 'auto7', 'carrier7', 'opened7'].includes(n.k) && n.day == null;
  const days = Array.from({ length: 7 }, (_, k) => { const g = list.filter(i => dayIdx(i.resolved || i.opened, now) === k); return { label: dayLabel(k, now), k, Automatic: g.filter(isAutoInc).length, 'By an engineer': g.filter(i => !isAutoInc(i) && i.state === 'Resolved').length, 'Still open': g.filter(i => i.state !== 'Resolved').length }; });
  const kinds = Object.entries(list.reduce((m, i) => ({ ...m, [i.kind]: (m[i.kind] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1]);
  const pris = ['P1', 'P2', 'P3', 'P4'].map(p => { const g = list.filter(i => i.pri === p); return { label: p, 'On track': g.filter(i => i.state === 'Resolved' ? !slaClock(i, now).resBreached : slaClock(i, now).used <= 0.5).length, 'To watch': g.filter(i => i.state === 'Resolved' ? slaClock(i, now).resBreached : slaClock(i, now).used > 0.5).length }; });
  const geo = !n.region ? 'region' : 'state';
  const byGeo = Object.entries(list.reduce((m, i) => { const b = D.BR[i.branchId], k = geo === 'region' ? b.region : b.state; return { ...m, [k]: (m[k] || 0) + 1 }; }, {})).sort((a, b) => b[1] - a[1]);
  const buckets = TTR_BUCKETS.map(([l, [a, b]]) => ({ label: l, value: closed.filter(i => i.resolved - i.opened >= a && i.resolved - i.opened < b).length }));
  return (
    <div>
      <Head kicker="Incidents" title={labelOf(n)} sub={set.plain} />
      <Kpis go={go} items={[
        { label: 'Incidents', value: num(list.length) },
        { label: 'Still open', value: num(list.filter(i => i.state !== 'Resolved').length), tone: list.some(i => i.state !== 'Resolved') ? 'warn' : 'ok' },
        closed.length > 0 && { label: 'Fixed automatically', value: P(auto.length / closed.length, 0), tone: 'ok', sub: `${num(auto.length)} of ${num(closed.length)} fixed`, go: n.auto == null ? { ...n, auto: true } : null },
        closed.length > 0 && { label: 'Half fixed within', value: hrs(ttr[ttr.length >> 1] || 0), tone: 'ok' },
        { label: 'Urgent (P1 and P2)', value: num(list.filter(i => i.pri === 'P1' || i.pri === 'P2').length), tone: list.some(i => i.pri === 'P1') ? 'bad' : null },
        { label: 'Branches', value: num(new Set(list.map(i => i.branchId)).size) },
      ]} />
      <Grid>
        {weekly ? <Panel title="Day by day" hint="click a day">
          <Bars h={170} data={days} keys={['Automatic', 'By an engineer', 'Still open']} colors={[C.ok, C.s1, C.warn]} onBar={d => go({ ...n, day: d.k, dayLabel: d.label })} />
          <Legend className="mt-1" items={[['Fixed automatically', C.ok], ['Fixed by an engineer', C.s1], ['Still open', C.warn]]} />
        </Panel> : <Panel title="By priority" hint="click a priority">
          <Bars h={170} data={pris} keys={['On track', 'To watch']} colors={[C.ok, C.warn]} onBar={d => go({ ...n, pri: d.label })} />
          <Legend className="mt-1" items={[['On track against the deadline', C.ok], ['To watch', C.warn]]} />
        </Panel>}
        <Panel title="What kind of problem" hint="click to narrow">
          <HBars rows={kinds.map(([k, v]) => ({ label: KIND_PLAIN[k] || k, key: k, value: v, color: C.s1 }))} labelW={200} onRow={r => go({ ...n, kind: r.key })} />
        </Panel>
        {closed.length > 2 && <Panel title="How long fixes took" hint="click a band"><HBars rows={buckets.map(r => ({ ...r, color: C.s4 }))} labelW={120} onRow={r => go({ ...n, ttr: r.label })} /></Panel>}
        {!n.branch && byGeo.length > 1 && <Panel title={`By ${geo}`} hint="click to go in"><HBars rows={byGeo.slice(0, 10).map(([k, v]) => ({ label: geo === 'state' ? stateName(k) : k, key: k, value: v, color: C.s1 }))} labelW={170} onRow={r => go({ ...n, [geo]: r.key })} /></Panel>}
      </Grid>
      <div className="mt-7"><Panel title="The incidents" hint="click one for its full detail">
        <Rows page={15} cols={['Incident', 'Branch', 'What', 'Outcome']} onRow={r => go({ t: 'incident', id: r.id })} empty="No incident matches."
          rows={list.map(i => ({ key: i.id, id: i.id, cells: [<Name t={i.id} sub={`${i.pri} · ${dt(i.opened)}`} />, <span className="text-ink2">{D.BR[i.branchId].name}</span>, <span className="text-ink2">{i.title}</span>, i.state === 'Resolved' ? <span className="whitespace-nowrap">{isAutoInc(i) ? <b className="text-ok">Automatic</b> : <span className="text-ink2">Engineer</span>}<span className="text-ink3"> · {hrs(i.resolved - i.opened)}</span></span> : <Pill tone={slaClock(i, now).used > 0.5 ? 'warn' : 'info'}>{i.state}</Pill>] }))} />
      </Panel></div>
    </div>
  );
}

// ---------- changes and decisions ----------
function ChangesView({ n, go, ctx }) {
  const { s, now } = ctx;
  const set = CHG_SETS[n.k] || CHG_SETS.next7;
  const list = changesOf(s, n, now);
  const freezes = s.freezes.filter(f => f.end > now && f.start < now + 30 * DAY && (!n.region || f.scope === n.region || f.scope === 'All regions'));
  return (
    <div>
      <Head kicker="Changes" title={`${set.label}${n.region ? ` – ${n.region}` : ''}`} sub={`${set.plain} Every change is tested before it goes in and checked after; a change that slows a branch rolls back on its own.`} />
      <Kpis go={go} items={[
        { label: 'Changes', value: num(list.length) },
        { label: 'High risk', value: num(list.filter(c => c.risk === 'High').length), tone: list.some(c => c.risk === 'High') ? 'warn' : 'ok' },
        { label: 'Devices touched', value: num(sum(list, c => c.devices || 0)) },
        { label: 'Checks passed before start', value: `${list.filter(c => c.validation === 'Passed').length} of ${list.length}`, tone: 'ok' },
        { label: 'Change freezes ahead', value: num(freezes.length), tone: freezes.length ? 'info' : null },
      ]} />
      <div className="mt-7"><Panel title="The calendar" hint="click a change">
        <Rows cols={['When', 'Change', 'Where', 'Risk', 'State']} onRow={r => go({ t: 'change', id: r.id })} empty="No change in this window."
          rows={list.map(c => ({ key: c.id, id: c.id, cells: [<Name t={dateShort(c.start)} sub={c.window} />, <Name t={c.title} sub={c.id} />, <span className="text-ink2">{c.scope}</span>, <Pill tone={c.risk === 'High' ? 'bad' : c.risk === 'Medium' ? 'warn' : 'ok'}>{c.risk}</Pill>, <span className="text-ink2">{c.state}</span>] }))} />
      </Panel></div>
      {freezes.length > 0 && <div className="mt-7"><Panel title="Change freezes"><Clickable go={go} items={freezes.map(f => ({ title: f.name, sub: `${dateShort(f.start)} – ${dateShort(f.end)} · ${f.scope} · ${f.reason}`, tone: 'info' }))} /></Panel></div>}
    </div>
  );
}
function ChangeView({ n, go, ctx }) {
  const { s, now } = ctx;
  const c = s.changes.find(x => x.id === n.id); if (!c) return <p>Change not found.</p>;
  const clash = s.freezes.filter(f => c.start < f.end && c.end > f.start && (f.scope === c.scope || f.scope === 'All regions' || c.scope === 'All regions'));
  const region = D.REGIONS.includes(c.scope) ? c.scope : null;
  return (
    <div>
      <Head kicker="Change" title={c.title} sub={`${c.id} · ${c.type} change · owner ${c.owner}.`} right={<div className="pt-5"><Pill tone={c.risk === 'High' ? 'bad' : c.risk === 'Medium' ? 'warn' : 'ok'}>{c.risk} risk</Pill></div>} />
      <Kpis go={go} items={[
        { label: c.start > now ? 'Starts' : 'Started', value: dateShort(c.start), sub: c.window },
        { label: 'State', value: c.state, tone: /fail|roll/i.test(c.state) ? 'bad' : 'ok' },
        { label: 'Devices', value: num(c.devices || 0) },
        { label: 'Checked before start', value: c.validation, tone: c.validation === 'Passed' ? 'ok' : 'warn' },
        { label: 'Where', value: c.scope, go: { t: 'set', k: 'all', region: region || undefined } },
      ]} />
      <Grid>
        <Panel title="The change"><KV items={[['Window', c.window], ['Ends', dt(c.end)], ['Type', c.type], ['Owner', c.owner], ['Configuration file', <span className="font-mono">{c.nac}</span>]]} /></Panel>
        <Panel title="Before it starts"><Clickable go={go} items={[
          { title: c.validation === 'Passed' ? 'Pre-checks passed in the test lab' : `Pre-checks: ${c.validation}`, tone: c.validation === 'Passed' ? 'ok' : 'warn' },
          ...(clash.length ? clash.map(f => ({ title: `Overlaps the ${f.name} freeze`, sub: 'Needs an exception or a new date', tone: 'bad' })) : [{ title: 'No change freeze in the window', tone: 'ok' }]),
          { title: 'Branches it touches', sub: region ? `All branches in ${region}` : 'All regions', go: { t: 'set', k: 'all', region: region || undefined } },
        ]} /></Panel>
      </Grid>
    </div>
  );
}
function ApprovalsView({ go, ctx }) {
  const { s } = ctx;
  const list = s.approvals.filter(a => a.status === 'Pending');
  return (
    <div>
      <Head kicker="Decisions" title="Decisions waiting for a person" sub="Mova iO acts on its own only when it is at least 80% sure, the change is low risk and easy to undo, and nothing is trading on it. Everything else waits here with its evidence and a recommendation." />
      <div className="mt-6"><Clickable go={go} items={list.map(a => ({ title: a.title, sub: `${a.type} · ${Math.round(a.conf * 100)}% confidence · ${a.why.join('; ')}`, right: a.branchId ? D.BR[a.branchId].name : '', tone: a.risk === 'High' ? 'bad' : 'warn', go: { t: 'approval', id: a.id } }))} /></div>
    </div>
  );
}
function ApprovalView({ n, go, ctx }) {
  const { s, now } = ctx;
  const a = s.approvals.find(x => x.id === n.id); if (!a) return <p>Decision not found.</p>;
  return (
    <div>
      <Head kicker="Decision waiting" title={a.title} sub={`${a.id} · ${a.type} · raised ${ago(a.created, now)} by the ${a.agent} agent.`} right={<div className="pt-3"><Ring value={a.conf} size={78} stroke={8} color={a.conf >= 0.8 ? C.ok : C.warn} label={`${Math.round(a.conf * 100)}%`} /></div>} />
      <Grid>
        <Panel title="Why it needs a person"><Clickable go={go} items={a.why.map(w => ({ title: w, tone: 'warn' }))} /></Panel>
        <Panel title="The evidence"><Clickable go={go} items={(a.evidence || []).map(e => ({ title: e, tone: 'info' }))} /></Panel>
        <Panel title="Related"><Clickable go={go} items={[a.inc && { title: `Incident ${a.inc}`, sub: 'what triggered it', go: { t: 'incident', id: a.inc } }, a.branchId && { title: D.BR[a.branchId].name, sub: 'the branch it affects', go: { t: 'branch', id: a.branchId } }].filter(Boolean)} /></Panel>
      </Grid>
    </div>
  );
}

// ---------- service levels and trends ----------
const slaState = m => m.lower ? (m.act <= m.esl ? 'met' : 'below') : m.act >= m.esl ? 'met' : m.msl != null && m.act < m.msl ? 'min' : 'below';
function SlaView({ go }) {
  const rows = D.SLA.map((m, i) => ({ m, i, st: slaState(m) }));
  const lines = [...new Set(D.SLA.map(m => m.line))];
  const fmt = m => v => m.fmt ? P(v, m.fmt) : P(v, 1);
  return (
    <div>
      <Head kicker="Service levels" title={`${rows.filter(r => r.st === 'met').length} of ${rows.length} service levels met`} sub="The Annexure B service levels and KPIs, last month against the expected level. The black mark on each bar is the target." />
      <Kpis go={go} items={[
        { label: 'Met the expected level', value: num(rows.filter(r => r.st === 'met').length), tone: 'ok' },
        { label: 'Above minimum, below expected', value: num(rows.filter(r => r.st === 'below').length), tone: 'warn' },
        { label: 'Below the minimum', value: num(rows.filter(r => r.st === 'min').length), tone: rows.some(r => r.st === 'min') ? 'bad' : 'ok' },
        { label: 'Network uptime', value: P(D.SLA.find(m => m.n === 29).act, 3), tone: 'ok', go: { t: 'metric', i: D.SLA.findIndex(m => m.n === 29) } },
        { label: 'Time to fix major outages', value: `${D.MTTR_MONTHS.P1[4]} h`, tone: 'ok', go: { t: 'mttr' } },
      ]} />
      <div className="grid lg:grid-cols-2 gap-x-8 gap-y-7 mt-6">{lines.map(l => (
        <Panel key={l} title={l} hint="click a line">
          <div className="space-y-1">{rows.filter(r => r.m.line === l).map(({ m, i, st }) => { const lo = m.lower ? 0 : Math.min(m.msl ?? m.esl, m.act) - 0.05, hi = m.lower ? 0.4 : 1; const pos = v => Math.max(0, Math.min(100, (v - lo) / (hi - lo) * 100)); return (
            <button key={i} onClick={() => go({ t: 'metric', i })} className="w-full text-left grid grid-cols-[minmax(0,1fr)_120px_64px] items-center gap-2 text-[12.5px] px-1 py-1 rounded hover:bg-chip/70">
              <span className="truncate text-ink" title={m.name}>{m.name}</span>
              <span className="relative h-2.5 bg-ink/10 rounded-sm"><span className="absolute inset-y-0 left-0 rounded-sm" style={{ width: `${pos(m.act)}%`, background: st === 'met' ? C.ok : st === 'min' ? C.bad : C.warn }} /><span className="absolute -top-1 -bottom-1 w-[2px] bg-ink" style={{ left: `${pos(m.esl)}%` }} /></span>
              <b className={cx('text-right tabular-nums', st === 'met' ? 'text-ok' : st === 'min' ? 'text-bad' : 'text-warn')}>{fmt(m)(m.act)}</b>
            </button>); })}</div>
        </Panel>))}</div>
    </div>
  );
}
function MetricView({ n, go }) {
  const m = D.SLA[n.i]; if (!m) return null;
  const st = slaState(m), f = v => P(v, m.fmt || 1);
  return (
    <div>
      <Head kicker={m.line} title={m.name} sub={`${m.def}. ${m.cls}. ${st === 'met' ? 'Met the expected level last month.' : st === 'min' ? 'Below the minimum last month.' : 'Above the minimum, short of the expected level.'}`} />
      <Kpis go={go} items={[
        { label: 'Last month', value: f(m.act), tone: st === 'met' ? 'ok' : st === 'min' ? 'bad' : 'warn' },
        { label: 'Expected level', value: f(m.esl) },
        { label: 'Minimum level', value: m.msl != null ? f(m.msl) : 'None (KPI)' },
        { label: 'Six months ago', value: f(m.trend[0]), sub: m.trend[5] > m.trend[0] === !m.lower ? 'improving' : 'worse than then', tone: m.trend[5] > m.trend[0] === !m.lower ? 'ok' : 'warn' },
        m.queue && { label: `Open ${m.queue} incidents`, value: 'See them', go: { t: 'incidents', k: 'open', pri: m.queue } },
      ]} />
      <div className="mt-6"><Panel title="Six months" hint="the dashed lines are the targets">
        <LineChart h={220} padL={66} labels={MONTHS_SO_FAR} yFmt={f} series={[{ name: m.name, color: C.s1, area: true, data: m.trend }]} refLines={[{ v: m.esl, label: 'Expected', color: C.ok }, ...(m.msl != null && m.msl > Math.min(...m.trend) - 0.05 ? [{ v: m.msl, label: 'Minimum', color: C.bad }] : [])]} />
      </Panel></div>
    </div>
  );
}
function MttrView({ go }) {
  const M = D.MTTR_MONTHS;
  return (
    <div>
      <Head kicker="Time to fix" title={`Major outages fixed in ${M.P1[4]} hours on average in ${M.months[4]}`} sub="Mean time to restore by priority, month by month, against the contract targets (P1 4 hours, P2 8 hours, P3 24 hours). Faster every month since May." />
      <Kpis go={go} items={['P1', 'P2', 'P3'].map(p => ({ label: `${p}, ${M.months[4]}`, value: `${M[p][4]} h`, tone: 'ok', sub: `target ${M.target[p]} h · was ${M[p][0]} h in ${M.months[0]}`, go: { t: 'incidents', k: 'resolved7', pri: p } }))} />
      <Grid>
        {['P1', 'P2', 'P3'].map(p => <Panel key={p} title={`${p} – ${{ P1: 'major outage', P2: 'urgent', P3: 'standard' }[p]}`} hint="hours"><LineChart h={160} labels={MONTHS_SO_FAR} yMin={0} yFmt={v => `${v.toFixed(1)} h`} series={[{ name: p, color: C.s1, area: true, data: M[p] }]} refLines={[{ v: M.target[p], label: `Target ${M.target[p]} h`, color: C.bad }]} /></Panel>)}
        <Panel title="Fixes in the last 7 days" hint="click to see them"><Clickable go={go} items={['P1', 'P2', 'P3', 'P4'].map(p => ({ title: `${p} incidents fixed in the last 7 days`, go: { t: 'incidents', k: 'resolved7', pri: p } }))} /></Panel>
      </Grid>
    </div>
  );
}

// ---------- new branches, predictions, drift, carrier repairs ----------
function ProjectsView({ n, go, ctx }) {
  const { s, now } = ctx;
  const list = s.projects.filter(p => !n.region || p.region === n.region).sort((a, b) => a.golive - b.golive);
  return (
    <div>
      <Head kicker="Branch-in-a-Box" title="New and acquired branches" sub="Every new branch goes in with the same kit, the same setup and the same checks as the 900 already running." />
      <Kpis go={go} items={[{ label: 'Projects', value: num(list.length) }, { label: 'On track', value: num(list.filter(p => p.rag === 'Green').length), tone: 'ok' }, { label: 'At risk', value: num(list.filter(p => p.rag === 'Amber').length), tone: 'warn' }, { label: 'Need help', value: num(list.filter(p => p.rag === 'Red').length), tone: 'bad' }, { label: 'Going live in 30 days', value: num(list.filter(p => p.golive > now && p.golive < now + 30 * DAY).length) }]} />
      <div className="mt-6"><Panel title="Projects" hint="click one"><Rows cols={['Project', 'Stage', 'Go-live', 'Status']} onRow={r => go({ t: 'project', id: r.id })}
        rows={list.map(p => ({ key: p.id, id: p.id, cells: [<Name t={`${p.brand} – ${p.site}`} sub={`${p.id} · ${p.track}`} />, <span className="text-ink2">{p.stage}</span>, <span className="text-ink2 whitespace-nowrap">{dateShort(p.golive)}</span>, <Pill tone={{ Green: 'ok', Amber: 'warn', Red: 'bad' }[p.rag]}>{{ Green: 'On track', Amber: 'At risk', Red: 'Needs help' }[p.rag]}</Pill>] }))} /></Panel></div>
    </div>
  );
}
function ProjectView({ n, go, ctx }) {
  const { s, now } = ctx;
  const p = s.projects.find(x => x.id === n.id); if (!p) return null;
  const si = D.STAGES.indexOf(p.stage), passed = (p.gates || []).filter(g => g.st === 'Pass').length;
  return (
    <div>
      <Head kicker={`${p.track} branch · ${p.region}`} title={`${p.brand} – ${p.site}`} sub={`${p.id}. Go-live ${dateShort(p.golive)} (${p.golive > now ? `in ${Math.round((p.golive - now) / DAY)} days` : `${Math.round((now - p.golive) / DAY)} days ago`}).`} right={<div className="pt-5"><Pill tone={{ Green: 'ok', Amber: 'warn', Red: 'bad' }[p.rag]}>{{ Green: 'On track', Amber: 'At risk', Red: 'Needs help' }[p.rag]}</Pill></div>} />
      <div className="mt-5 flex gap-1">{D.STAGES.map((x, i) => <div key={x} className="flex-1 min-w-0"><div className="h-2 rounded-sm" style={{ background: i < si ? C.ok : i === si ? C.brand : '#e4e0d6' }} /><div className={cx('text-[11px] mt-1 truncate', i === si ? 'text-ink font-bold' : 'text-ink3')}>{x}</div></div>)}</div>
      <Grid>
        <Panel title="Blockers">{p.blockers.length ? <Clickable go={go} items={p.blockers.map(b => ({ title: b, tone: 'warn' }))} /> : <p className="text-[13px] text-ok font-semibold">No blockers.</p>}</Panel>
        <Panel title="Cutover gates" hint={`${passed} of ${(p.gates || []).length} passed`}><Clickable go={go} items={(p.gates || []).slice(0, 14).map(g => ({ title: g.name, sub: `${g.when} · ${g.owner}`, tone: g.st === 'Pass' ? 'ok' : 'muted' }))} /></Panel>
      </Grid>
    </div>
  );
}
function PredictionView({ n, go, ctx }) {
  const { s } = ctx;
  const p = s.predictions.find(x => x.id === n.id); if (!p) return null;
  const target = D.CIR[p.target] ? { t: 'circuit', id: p.target } : D.DEV[p.target] ? { t: 'device', id: p.target } : null;
  return (
    <div>
      <Head kicker="Predicted problem" title={p.kind} sub={`${p.signal}. Expected within ${p.horizon}.`} right={<div className="pt-3"><Ring value={p.conf} size={78} stroke={8} color={p.conf >= 0.8 ? C.ok : C.warn} label={`${Math.round(p.conf * 100)}%`} /></div>} />
      <Grid>
        <Panel title="The trend" hint="last 10 readings"><LineChart h={170} labels={p.series.map((_, i) => i === p.series.length - 1 ? 'now' : `-${p.series.length - 1 - i}`)} series={[{ name: p.kind, color: C.warn, area: true, data: p.series }]} /></Panel>
        <Panel title="What to do"><Clickable go={go} items={[{ title: p.suggest, sub: `Status: ${p.status}`, tone: 'info' }, p.branchId && { title: D.BR[p.branchId].name, sub: 'the branch', go: { t: 'branch', id: p.branchId } }, target && { title: p.target, sub: 'the line or device', go: target }].filter(Boolean)} /></Panel>
      </Grid>
    </div>
  );
}
function PredictionsView({ go, ctx }) {
  const { s } = ctx;
  return (<div><Head kicker="Predictions" title="Problems spotted before they happen" sub="Mova iO watches trends on every line and device and flags the ones heading for trouble, with how sure it is and what to do." />
    <div className="mt-6"><Clickable go={go} items={s.predictions.map(p => ({ title: `${p.kind}: ${p.branchId ? D.BR[p.branchId].name : p.target}`, sub: `${p.signal} · ${p.horizon}`, right: `${Math.round(p.conf * 100)}%`, tone: p.conf >= 0.8 ? 'warn' : 'info', go: { t: 'prediction', id: p.id } }))} /></div></div>);
}
function DriftView({ n, go, ctx }) {
  const { s, now } = ctx;
  const list = s.drift.filter(d => !n.region || D.BR[d.branchId].region === n.region);
  return (<div><Head kicker="Configuration" title="Differences from the standard setup" sub="Settings found on a device that are not in its approved configuration. High-risk ones are corrected first; changes made with no change record are traced to who made them." />
    <Kpis go={go} items={[{ label: 'Devices', value: num(list.length), tone: 'warn' }, { label: 'High risk', value: num(list.filter(d => d.sev === 'High').length), tone: 'bad' }, { label: 'Made with no change record', value: num(list.filter(d => /no CHG/i.test(d.source || '')).length), tone: 'warn' }, { label: 'Match the standard', value: P(1 - list.length / D.DEVICES.length, 1), tone: 'ok' }]} />
    <div className="mt-6"><Rows cols={['Device', 'Branch', 'Difference', 'Risk', 'Source']} onRow={r => go({ t: 'device', id: r.id })}
      rows={list.map(d => ({ key: d.device, id: d.device, cells: [<Name t={d.device} sub={`found ${ago(d.since, now)}`} />, <span className="text-ink2">{D.BR[d.branchId].name}</span>, <span className="text-ink2">{d.item}</span>, <Pill tone={d.sev === 'High' ? 'bad' : d.sev === 'Medium' ? 'warn' : 'muted'}>{d.sev}</Pill>, <span className="text-ink3">{d.source}</span>] }))} /></div></div>);
}
function CasesView({ n, go, ctx }) {
  const { s, now } = ctx;
  const list = s.cases.filter(c => !c.closed && /^Open|^Dispatched/.test(c.status || '') && (!n.region || D.BR[c.branchId].region === n.region));
  return (<div><Head kicker="Carriers" title="Carrier repairs in progress" sub="Each open case has the evidence pack the carrier needs (an hour of loss and delay readings, path tests and timestamps) and a promised restore time." />
    <Kpis go={go} items={[{ label: 'Open cases', value: num(list.length) }, { label: 'On schedule', value: num(list.filter(c => !c.eta || c.eta >= now).length), tone: 'ok' }, { label: 'Past the promised time', value: num(list.filter(c => c.eta && c.eta < now).length), tone: list.some(c => c.eta && c.eta < now) ? 'bad' : 'ok' }]} />
    <div className="mt-6"><Rows cols={['Case', 'Branch', 'Status', 'Promised by']} onRow={r => go({ t: 'circuit', id: r.id })}
      rows={list.map(c => ({ key: c.id, id: c.circuit, cells: [<Name t={`${c.carrier} ${c.id}`} sub={c.circuit} />, <span className="text-ink2">{D.BR[c.branchId].name}</span>, <span className="text-ink2">{c.status}</span>, c.eta ? <b className={c.eta < now ? 'text-bad' : 'text-ink'}>{hhmm(c.eta)} CT{c.eta < now ? ' (late)' : ''}</b> : '—'] }))} /></div></div>);
}

const VIEWS = { set: SetView, branch: BranchView, circuit: CircuitView, carrier: CarrierView, lines: LinesView, device: DeviceView, devices: DevicesView, incident: IncidentView, incidents: IncidentsView, changes: ChangesView, change: ChangeView, approvals: ApprovalsView, approval: ApprovalView, sla: SlaView, metric: MetricView, mttr: MttrView, projects: ProjectsView, project: ProjectView, predictions: PredictionsView, prediction: PredictionView, drift: DriftView, cases: CasesView };

// The panel: slides in from the right over the dashboard; Escape closes it, the breadcrumb or Back steps out a level.
export function DrillPanel({ stack, setStack, now, scope, snap }) {
  const app = useApp();
  const s = snap || app.s;
  const box = useRef(null);
  const n = stack[stack.length - 1];
  // the regional dashboard stays inside its region
  const go = node => setStack(st => [...st, scope && !node.region && ['set', 'incidents', 'lines', 'devices', 'changes', 'drift', 'cases', 'projects'].includes(node.t) ? { ...node, region: scope } : node]);
  const back = () => setStack(st => st.slice(0, -1));
  useEffect(() => { const k = e => { if (e.key === 'Escape') setStack([]); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);
  useEffect(() => { if (box.current) box.current.scrollTop = 0; }, [stack.length, n]);
  const V = VIEWS[n.t] || SetView;
  const ctx = { s, now };
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={labelOf(n)}>
      <div className="absolute inset-0 bg-black/40" onClick={() => setStack([])} />
      <div ref={box} className="relative h-full w-full max-w-[1180px] overflow-y-auto shadow-2xl drill-in bg-canvas" >
        <div className="sticky top-0 z-10 border-b border-line px-4 sm:px-6 py-2 flex items-center gap-2 bg-panel" >
          <button onClick={back} className="h-8 px-2.5 rounded-md border border-line hover:bg-chip text-[12.5px] font-semibold text-ink inline-flex items-center gap-1 shrink-0"><I.ArrowLeft size={14} />{stack.length > 1 ? 'Back' : 'Close'}</button>
          <nav aria-label="Where you are" className="flex-1 min-w-0 flex items-center gap-1 text-[12px] overflow-x-auto whitespace-nowrap py-1">
            <button onClick={() => setStack([])} className="text-ink3 hover:text-ink hover:underline">Dashboard</button>
            {stack.map((x, i) => <React.Fragment key={i}><I.ChevronRight size={12} className="text-ink3 shrink-0" />{i === stack.length - 1 ? <span className="font-bold text-ink">{labelOf(x)}</span> : <button onClick={() => setStack(stack.slice(0, i + 1))} className="text-ink2 hover:text-ink hover:underline">{labelOf(x)}</button>}</React.Fragment>)}
          </nav>
          <span className="text-[11px] text-ink3 hidden md:inline shrink-0">Level {stack.length}</span>
          <button onClick={() => setStack([])} aria-label="Close" className="h-8 w-8 rounded-md border border-line hover:bg-chip grid place-items-center text-ink shrink-0"><I.X size={15} /></button>
        </div>
        <div className="px-4 sm:px-6 pt-5 pb-14" key={stack.length + labelOf(n)}><V n={n} go={go} ctx={ctx} /></div>
      </div>
    </div>
  );
}
