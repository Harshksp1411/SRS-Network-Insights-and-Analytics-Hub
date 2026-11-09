// More on the Predictive Watchlist: which branches are most likely to have a problem next, how many incidents to
// expect each day this week, and what is coming (capacity, lifecycle and licences, service levels, weather and
// season, tomorrow's store openings), each with an action that creates the record.
import React, { useMemo, useState } from 'react';
import * as I from 'lucide-react';
import * as D from './data.js';
import { useApp, useNow, healthOf } from './store.jsx';
import { Card, Badge, Btn, Tabs, cx } from './ui.jsx';
import { Bars, Legend, C } from './charts.jsx';
import * as HIST from './history.js';
import { num, DAY, HR } from './util.js';

const rnd = (a, n) => a + Math.floor(Math.random() * n);
// one record-making helper for every action on this page
function useActs() {
  const { act } = useApp();
  return {
    watch: (what, branchId) => { const id = `W-${rnd(6000, 3000)}`; act.add('watches', { id, what, branchId, created: Date.now(), by: act.me() }); act.audit(`Watch ${id}: ${what}`, id); act.toast(`Watch set: ${what}`); },
    change: (title, scope, n = 1) => { const id = `CHG00${rnd(33100, 800)}`; act.add('changes', { id, title, type: 'Normal', risk: 'Low', state: 'Scheduled', start: Date.now() + 2 * DAY, end: Date.now() + 2 * DAY + 2 * HR, window: 'After branch close', scope, devices: n, owner: act.me(), validation: 'Pending' }); act.audit(`Planned ${id}: ${title}`, id); act.toast(`${id} planned after branch close`); },
    approve: (title, branchId) => { const id = `APR-${rnd(3600, 600)}`; act.add('approvals', { id, type: 'Prevention plan', title, branchId, agent: 'prediction', conf: 0.85, risk: 'Low', created: Date.now(), status: 'Pending', why: ['Prevents a predicted problem'], evidence: [], rollback: 'Cancel the plan', verify: [] }); act.audit(`Prevention ${id} sent for approval: ${title}`, id); act.toast(`${id} sent for approval`); },
  };
}

// a risk score per branch from what tends to come before a problem
function branchRisk(s) {
  const vuln = {}, old = {}, drift = {};
  D.DEVICES.forEach(d => { if (D.vulnsOf(d).some(a => a.sev === 'Critical')) vuln[d.branchId] = (vuln[d.branchId] || 0) + 1; if (d.model === '2530') old[d.branchId] = (old[d.branchId] || 0) + 1; });
  s.drift.forEach(x => { drift[x.branchId] = (drift[x.branchId] || 0) + 1; });
  const open = {}; s.incidents.forEach(i => { if (i.state !== 'Resolved') open[i.branchId] = (open[i.branchId] || 0) + 1; });
  return D.BRANCHES.map(b => {
    const p = D.CIR[b.wan[0]], s2 = D.CIR[b.wan[1]];
    const parts = [
      ['Repeat line faults', Math.min(30, (p.tickets90 || 0) * 5 + (p.flaps30 || 0) * 3)],
      ['Backup line weak', s2.tickets90 >= 2 || s2.loss > 0.2 ? 12 : 0],
      ['Critical CVE on a device', Math.min(18, (vuln[b.id] || 0) * 6)],
      ['Legacy 2530 switches', Math.min(12, (old[b.id] || 0) * 4)],
      ['Config differs from standard', Math.min(10, (drift[b.id] || 0) * 10)],
      ['Open incidents now', Math.min(16, (open[b.id] || 0) * 8)],
      ['Line near capacity', p.util >= 55 ? Math.round((p.util - 50) / 2) : 0],
    ].filter(x => x[1] > 0);
    return { b, score: Math.min(99, parts.reduce((a, x) => a + x[1], 0)), parts: parts.sort((x, y) => y[1] - x[1]) };
  }).sort((a, b) => b.score - a.score);
}
export function BranchRiskCard() {
  const { s, act } = useApp(); const A = useActs();
  const rows = useMemo(() => branchRisk(s), [s.incidents, s.drift]);
  const top = rows.slice(0, 12), high = rows.filter(r => r.score >= 40).length;
  return (
    <Card className="fit-row" title="Branches most likely to have a problem next" sub={`${high} branches score 40 or more out of 99, from line history, backup health, CVEs, legacy kit, config drift, open incidents and capacity`} icon={I.Radar} pad={false}>
      <div className="divide-y divide-line/70">{top.map((r, k) => (
        <div key={r.b.id} className="px-4 py-2 flex items-center gap-3 text-[12.5px] hover:bg-chip/40">
          <span className="w-5 text-ink3 tabular-nums">{k + 1}</span>
          <button onClick={() => act.drill({ t: 'branch', id: r.b.id })} className="w-[230px] shrink-0 text-left min-w-0"><b className="block text-ink truncate hover:underline">{r.b.name}</b><span className="block text-[11px] text-ink3 truncate">{r.b.brand} · {r.b.region}</span></button>
          <span className="w-28 shrink-0"><span className="block h-2 rounded bg-chip overflow-hidden"><span className="block h-2 rounded" style={{ width: `${r.score}%`, background: r.score >= 60 ? C.bad : r.score >= 40 ? C.warn : C.s1 }} /></span><span className="text-[11px] text-ink3 tabular-nums">risk {r.score}</span></span>
          <span className="flex-1 min-w-0 flex flex-wrap gap-1">{r.parts.slice(0, 3).map(([t]) => <span key={t} className="text-[11px] rounded border border-line px-1.5 py-[1px] text-ink2">{t}</span>)}</span>
          <Btn op size="xs" icon={I.ShieldCheck} onClick={() => A.approve(`Prevent: ${r.parts[0] ? r.parts[0][0].toLowerCase() : 'risk'} at ${r.b.name}`, r.b.id)}>Prevent</Btn>
        </div>))}</div>
    </Card>
  );
}

// incidents to expect each day this week, against the last seven days
export function IncidentOutlookCard() {
  const { s } = useApp(); const now = useNow();
  const data = useMemo(() => {
    const P = HIST.period(3), perDay = P.tickets / (P.n * 30);
    const wk = [1.08, 1.12, 1.1, 1.06, 1.02, 0.62, 0.38];
    const day = t => new Date(t).toLocaleDateString('en-US', { weekday: 'short' });
    const past = Array.from({ length: 7 }, (_, k) => { const t = now - (7 - k) * DAY; const dow = (new Date(t).getDay() + 6) % 7; return { label: day(t), Actual: Math.round(perDay * wk[dow] * (0.9 + ((k * 37) % 20) / 100)) }; });
    const next = Array.from({ length: 7 }, (_, k) => { const t = now + (k + 1) * DAY; const dow = (new Date(t).getDay() + 6) % 7; return { label: day(t), Forecast: Math.round(perDay * wk[dow] * 1.04) }; });
    return [...past, ...next];
  }, [Math.floor(now / DAY)]);
  const fc = data.slice(7), peak = fc.reduce((m, x) => x.Forecast > m.Forecast ? x : m, fc[0]);
  return (
    <Card title="Incidents expected, next 7 days" sub={`About ${num(fc.reduce((a, x) => a + x.Forecast, 0))} expected; busiest ${peak.label} with ${peak.Forecast}. Weekdays carry most; Saturday mornings are light.`} icon={I.CalendarRange} right={<Legend items={[['Last 7 days', C.s3], ['Forecast', C.s1]]} />}>
      <Bars data={data} keys={['Actual', 'Forecast']} colors={[C.s3, C.s1]} h={190} forecastFrom={7} />
      <div className="grid grid-cols-3 gap-2 mt-2 text-[12px]">{[['Line faults', '46%', 'carrier'], ['Wi-Fi and access points', '27%', 'wireless'], ['Switching and config', '27%', 'switching']].map(([k, v]) => <div key={k} className="rounded border border-line px-2 py-1.5"><div className="text-ink3 text-[11px]">{k}</div><b className="text-ink">{v} of the forecast</b></div>)}</div>
    </Card>
  );
}

// what is coming, by kind; each row has the action that heads it off
export function ComingCard() {
  const { s } = useApp(); const now = useNow(); const A = useActs();
  const [tab, setTab] = useState('capacity');
  const rows = useMemo(() => {
    const prim = D.CIRCUITS.filter(c => c.role === 'Primary');
    const cap = prim.filter(c => c.util >= 52).sort((a, b) => b.util - a.util).slice(0, 8).map(c => { const b = D.BR[c.branchId], weeks = Math.max(2, Math.round((90 - c.util) / 2.6)); return { k: c.id, what: `${b.name} primary line (${c.carrier} ${c.type}, ${c.bw} Mb/s)`, now: `${c.util}% at peak`, when: `90% in about ${weeks} weeks`, conf: 0.7 + (c.util % 20) / 100, act: ['Plan an upgrade', () => A.change(`Bandwidth upgrade ${c.id} (${b.name})`, b.region)], branchId: b.id }; });
    cap.push({ k: 'lte', what: 'Verizon LTE data pool (all backup lines)', now: '81% of the monthly pool', when: 'pool used up in 9 days', conf: 0.9, act: ['Top up the pool', () => A.approve('Top up the Verizon LTE data pool by 2 TB')] });
    cap.push({ k: 'dhcp', what: 'Warehouse Wi-Fi address pools (VLAN 30), 14 branches', now: '78 to 86% used', when: 'full within 3 weeks at the new handheld rollout', conf: 0.82, act: ['Widen the scopes', () => A.change('Widen DHCP scope VLAN 30 at 14 branches', 'Multiple', 14)] });
    const life = [
      { k: 'eos2530', what: `${num(D.DEVICES.filter(d => d.model === '2530').length)} Aruba 2530 switches`, now: 'end of sale since 2022', when: 'support ends 2027-01-31', conf: 1, act: ['Plan the refresh', () => A.approve('Replace Aruba 2530 switches with CX 6100 before support ends')] },
      { k: 'ecxs', what: `${num(D.DEVICES.filter(d => d.type === 'SD-WAN').length)} EdgeConnect EC-XS`, now: 'end of sale 2026-01-31', when: 'support ends 2031-01-31', conf: 1, act: ['Watch it', () => A.watch('EdgeConnect EC-XS end of support 2031')] },
      { k: 'lic', what: 'EdgeConnect licences, 212 branches (Texas and Southeast)', now: 'renew with the annual term', when: `expire in ${Math.max(5, 41 - (Math.floor(now / DAY) % 30))} days`, conf: 1, act: ['Start the renewal', () => A.approve('Renew EdgeConnect licences for 212 branches')] },
      { k: 'cert', what: 'RADIUS server certificate (802.1X staff Wi-Fi)', now: 'valid', when: 'expires in 23 days', conf: 1, act: ['Plan the renewal', () => A.change('Renew the RADIUS server certificate for 802.1X', 'All regions', 2)] },
      { k: 'warr', what: `${num(D.DEVICES.filter(d => d.warranty < now + 90 * DAY && d.warranty > now && d.type === 'SD-WAN').length)} EdgeConnect support contracts`, now: 'active', when: 'end within 90 days', conf: 1, act: ['Renew the contracts', () => A.approve('Renew EdgeConnect support contracts ending in 90 days')] },
    ];
    const P = HIST.period(6);
    const sla = P.sla.map((x, i) => { const sr = x.series, slope = (sr[sr.length - 1] - sr[0]) / Math.max(1, sr.length - 1), next = sr[sr.length - 1] + slope, m = x.m; const miss = m.lower ? next > m.esl : next < m.esl; return { x, next, miss, i }; }).filter(r => r.miss).slice(0, 8)
      .map(r => { const m = r.x.m, f = v => `${(v * 100).toFixed(m.esl > 0.999 ? 3 : 1)}%`; return { k: `sla${r.i}`, what: `#${m.n} ${m.name}`, now: `${f(r.x.latest)} last month`, when: `heading for ${f(r.next)} next month (ESL ${f(m.esl)})`, conf: 0.75, act: ['Start an improvement plan', () => A.approve(`Improve #${m.n} ${m.name} before it misses next month`)] }; });
    const reg = (r, n) => D.BRANCHES.filter(b => b.region === r).length;
    const weather = [
      { k: 'snow', what: `Winter storm, Great Lakes and Northeast (${reg('Great Lakes') + reg('Northeast')} branches)`, now: 'forecast Thursday to Friday', when: 'power and line faults likely; LTE backups carry the load', conf: 0.7, act: ['Check every backup line', () => A.change('Pre-storm backup line tests, Great Lakes and Northeast', 'Great Lakes', reg('Great Lakes') + reg('Northeast'))] },
      { k: 'ice', what: `Ice risk, Texas & South Central (${reg('Texas & South Central')} branches)`, now: 'cold front next week', when: 'aerial fibre damage risk on rural lines', conf: 0.55, act: ['Watch the region', () => A.watch('Ice risk on Texas and South Central lines')] },
      { k: 'season', what: 'Winter roofing slowdown, all regions', now: 'store traffic down 18% on last month', when: 'lower line use; good window for upgrades', conf: 0.8, act: ['Plan the upgrades now', () => A.change('Use the winter window for firmware waves', 'All regions', 120)] },
    ];
    const open = D.BRANCHES.filter(b => { const h = healthOf(s, b); return h !== 'up'; }).slice(0, 10).map(b => { const inc = s.incidents.find(i => i.branchId === b.id && i.state !== 'Resolved'); return { k: b.id, what: `${b.name}, opens ${b.hours.open} local`, now: inc ? inc.title : 'line or device degraded', when: 'may not be ready at opening', conf: 0.8, act: ['Send a field engineer first', () => A.approve(`Pre-opening visit at ${b.name}`, b.id)], branchId: b.id }; });
    return { capacity: cap, lifecycle: life, sla, weather, openings: open };
  }, [s.incidents, Math.floor(now / HR)]);
  const T = { capacity: 'Capacity', lifecycle: 'Lifecycle and licences', sla: 'Service levels', weather: 'Weather and season', openings: "Tomorrow's store openings" };
  const list = rows[tab];
  return (
    <Card title="What is coming" sub="Forecasts that need a decision before they turn into incidents" icon={I.Telescope} right={<Tabs size="sm" value={tab} onChange={setTab} tabs={Object.entries(T).map(([id, label]) => ({ id, label, count: rows[id].length }))} />} pad={false}>
      {list.length ? <div className="overflow-x-auto"><table className="w-full text-[12.5px]"><thead><tr className="border-b border-line text-left text-ink3 text-[11.5px]">{['What', 'Now', 'When', 'Confidence', ''].map(h => <th key={h} className="px-4 py-1.5 font-semibold">{h}</th>)}</tr></thead>
        <tbody>{list.map(r => <tr key={r.k} className="border-b border-line/60 last:border-0"><td className="px-4 py-2 text-ink font-semibold">{r.what}</td><td className="px-4 py-2 text-ink2">{r.now}</td><td className="px-4 py-2 text-ink2">{r.when}</td><td className="px-4 py-2 tabular-nums">{Math.round(Math.min(1, r.conf) * 100)}%</td><td className="px-4 py-2 text-right whitespace-nowrap"><Btn op size="xs" icon={I.ShieldCheck} onClick={r.act[1]}>{r.act[0]}</Btn></td></tr>)}</tbody></table></div>
        : <div className="px-4 py-6 text-[12.5px] text-ink3">Nothing coming in this category.</div>}
    </Card>
  );
}
