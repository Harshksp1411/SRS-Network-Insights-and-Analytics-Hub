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
  const { L, paused } = useLive(); const now = useNow();
  const secs = Math.max(0, Math.round((now - L.last) / 1000));
  return <span className={cx('inline-flex items-center gap-1.5 text-[11px] font-bold rounded px-1.5 py-[2px] border', paused ? 'border-line text-ink3' : 'border-ok/40 text-ok bg-ok/10', className)}><span className={cx('w-1.5 h-1.5 rounded-full', paused ? 'bg-ink3' : 'bg-ok animate-pulse')} />{paused ? 'PAUSED' : 'LIVE'}<span className="font-normal text-ink3">· {paused ? 'stream paused' : `updated ${secs}s ago`}</span></span>;
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
    <Card title="Live event stream" sub="OpsRamp, Aruba Central, Orchestrator, New Relic, UPS, with the correlation outcome" icon={I.Radio} right={<Tabs size="sm" value={f} onChange={setF} tabs={[{ id: 'all', label: 'All' }, { id: 'action', label: 'Actioned' }, { id: 'sup', label: 'Suppressed' }]} />}>
      <div className="overflow-y-auto pr-1 space-y-1" style={{ maxHeight: h }}>
        {items.map(e => { const b = D.BR[e.branchId]; return (
          <button key={e.id} onClick={() => e.inc ? act.openInc(e.inc) : act.openBranch(e.branchId)} className="w-full text-left flex gap-2 items-start text-[12px] py-1.5 border-b border-line/60 feed-in hover:bg-chip/60 rounded px-1">
            <span className="font-mono text-ink3 w-[58px] shrink-0">{hhmmss(e.t)}</span>
            <span className="w-[74px] shrink-0">{SRC_LOGO[e.src] ? <Logo k={SRC_LOGO[e.src]} h={10} /> : <span className="text-[11px] font-bold text-ai">{e.src}</span>}</span>
            <span className="flex-1 min-w-0"><span className="font-semibold text-ink">{b.name}</span> <span className="text-ink3">{b.brand}</span><span className="block text-ink2 truncate">{e.msg}</span></span>
            <Badge tone={outTone(e.out)} className="shrink-0 max-w-[150px] truncate">{e.out}</Badge>
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
      <LineChart series={[{ name: 'Raw events / min', data: data.raw, color: '#94a3b8' }, { name: 'After correlation', data: data.corr, color: C.info }]} labels={data.labels} h={170} yFmt={v => Math.round(v)} yMin={0} />
    </Card>
  );
}

export function ExperienceCard() {
  const { L } = useLive();
  const S = L.series;
  const tiles = [
    ['POS path p95', `${Math.round(S.pos.at(-1))} ms`, S.pos, S.pos.at(-1) > 400 ? C.bad : S.pos.at(-1) > 260 ? C.warn : C.ok],
    ['Roof Hub API p95', `${S.roofhub.at(-1).toFixed(2)} s`, S.roofhub, S.roofhub.at(-1) > 1.2 ? C.warn : C.ok],
    ['SD-WAN tunnels up', `${num(Math.round(S.tunnels.at(-1)))} / 1,866`, S.tunnels, C.info],
    ['Fleet WAN latency', `${Math.round(S.wan.at(-1))} ms`, S.wan, S.wan.at(-1) > 32 ? C.warn : C.ok],
  ];
  return (
    <Card title="Branch experience – live" sub="Synthetic probes from every EdgeConnect, 2-second refresh" icon={I.Activity}>
      <div className="grid grid-cols-2 gap-2 mb-2">{tiles.map(([l, v, ser, c]) => <div key={l} className="border border-line rounded-md p-2"><div className="text-[11.5px] text-ink3 font-semibold">{l}</div><div className="flex items-end justify-between gap-2"><div className="text-[17px] font-extrabold text-ink leading-tight tabular-nums">{v}</div><Spark data={ser.slice(-60)} color={c} w={90} h={26} /></div></div>)}</div>
      <LineChart series={[{ name: 'POS path p95 (ms)', data: S.pos, color: C.brand }]} labels={L.ts.map(t => hhmmss(t))} h={120} yFmt={v => Math.round(v)} refLines={[{ v: 400, label: 'POS threshold 400 ms', color: C.bad }]} yMin={100} />
    </Card>
  );
}

export function AlertsPerMinCard() {
  const { L } = useLive();
  const S = L.series;
  const data = Array.from({ length: 30 }, (_, k) => { const i = S.crit.length - 30 + k; return { label: k % 5 === 0 ? hhmmss(L.ts[i]).slice(0, 5) : '', Critical: Math.round(S.crit[i]), Major: Math.round(S.major[i]), Minor: Math.round(S.minor[i]) }; });
  return (
    <Card title="Alerts per minute – live" sub="After correlation, by severity" icon={I.BarChart3} right={<Legend items={[['Critical', C.bad], ['Major', C.warn], ['Minor', '#94a3b8']]} />}>
      <Bars data={data} keys={['Critical', 'Major', 'Minor']} colors={[C.bad, C.warn, '#94a3b8']} h={170} />
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
