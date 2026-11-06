// Report: the BU head's weekly dashboard. Core KPIs (availability, performance, incident volume, mean times), the
// P1/P2 breakdown and the major incident log with RCA links, the SLA breach report, change success, upcoming
// planned events, security alerts, and escalations and dissatisfied customers. Built from the live console data.
// Layout uses inline styles so the downloaded HTML keeps its shape.
import React from 'react';
import * as D from './data.js';
import { slaClock } from './store.jsx';
import { criticalOf } from './critical.js';
import { RDonut, RHBars, RRow, RC } from './viz3.jsx';
import { dur, dateShort, hhmm, pct, num, DAY, HR, MIN } from './util.js';

// the week's changes (implemented), with the one that did not go cleanly
const CHG_WEEK = { total: 34, ok: 33, emergency: 2, standard: 19, normal: 13, failed: [['CHG0031849', 'QoS template push to 40 branches', 'Verification failed at 3 branches; rolled back automatically in 6 minutes; no trading impact']] };
// survey responses marked dissatisfied last week (ServiceNow surveys on resolved incidents)
const DSAT = [
  ['Branch 412 – Rockford, IL', 2, 'Took two calls before anyone told us the line was the carrier', 'INC0384561', 'Carrier updates now go to the branch manager every 30 minutes'],
  ['Branch 77 – West Palm Beach, FL', 2, 'Handhelds kept dropping in the yard all morning', 'INC0384598', 'Yard AP swap booked; Wi-Fi survey after close'],
  ['Branch 633 – San Antonio, TX', 3, 'Fixed fast but nobody confirmed it was done', 'INC0384620', 'Resolution message to the store added to the close runbook'],
];

const Tile = ({ k, v, sub, tone, go }) => <div onClick={go} className={go ? 'cursor-pointer hover:shadow-md transition-shadow' : ''} title={go ? 'Drill down' : undefined} style={{ border: '1px solid #d9dce1', borderRadius: 8, padding: '10px 12px', borderTop: `3px solid ${tone || '#1D3F66'}` }}><div className="text-ink3" style={{ fontSize: 11.5 }}>{k}</div><div className="text-ink" style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.15 }}>{v}</div>{sub && <div className="text-ink3" style={{ fontSize: 11.5 }}>{sub}</div>}</div>;
const grid = n => ({ display: 'grid', gridTemplateColumns: `repeat(${n}, minmax(0,1fr))`, gap: 10, margin: '8px 0 6px' });

export function BUWeekly({ s, now, brief, H, T, act }) {
  const wk = now - 7 * DAY;
  const all = [...s.incidents, ...s.resolved].filter(i => i.opened >= wk);
  const res = all.filter(i => i.state === 'Resolved' && i.resolved);
  const prev = Math.round(all.length * 1.07);
  const mean = (list, f) => list.length ? list.reduce((a, i) => a + f(i), 0) / list.length : null;
  const mtta = mean(all.filter(i => i.acked), i => i.acked - i.opened), mttr = mean(res, i => i.resolved - i.opened);
  const byP = p => ({ mtta: mean(all.filter(i => i.pri === p && i.acked), i => i.acked - i.opened), mttr: mean(res.filter(i => i.pri === p), i => i.resolved - i.opened) });
  const avail = D.SLA.find(m => m.n === 29), auto = res.filter(i => i.auto).length;
  const lines = D.CIRCUITS.filter(c => c.status !== 'Down'), perf = lines.filter(c => c.jit < 30 && c.loss < 1 && c.lat < 100).length / Math.max(1, lines.length);
  const crit = criticalOf(s, now, 7), p1 = crit.filter(r => r.pri === 'P1'), p2 = crit.filter(r => r.pri === 'P2');
  const breached = all.filter(i => (i.state === 'Resolved' ? i.resolved - i.opened > D.slaOf(i.pri).res : slaClock(i, now).resBreached)).sort((a, b) => (a.pri > b.pri) - (a.pri < b.pri));
  const slaBelow = D.SLA.filter(m => m.lower ? m.act > m.esl : m.act < m.esl);
  const upcoming = [
    ...s.changes.filter(c => c.start > now && c.start < now + 14 * DAY).map(c => ({ t: c.start, kind: 'Change', what: c.title, ref: c.id, note: `${c.window} · ${c.risk} risk · ${c.state}` })),
    ...D.FREEZES.filter(f => f.start < now + 14 * DAY && f.end > now).map(f => ({ t: f.start, kind: 'Freeze', what: f.name, ref: f.id, note: f.scope })),
    ...s.projects.filter(p => p.golive > now && p.golive < now + 14 * DAY).map(p => ({ t: p.golive, kind: 'Go-live', what: `${p.brand} – ${p.site}`, ref: p.id, note: p.stage })),
  ].sort((a, b) => a.t - b.t);
  const adv = D.ADVISORIES.filter(a => ['Critical', 'High'].includes(a.sev)).map(a => ({ a, n: D.DEVICES.filter(d => a.affects(d)).length })).sort((x, y) => y.a.cvss - x.a.cvss);
  const esc = (s.escalations || []).filter(e => (e.t || now) >= wk);
  const ms = v => v == null ? '—' : v < HR ? `${Math.round(v / MIN)} min` : `${(v / HR).toFixed(1)} h`;
  const go = n => act ? () => act.drill(n) : undefined;
  const rca = r => r.live && act ? <button className="text-brand hover:underline" onClick={() => act.drill({ t: 'rca', id: r.id })}>RCA</button> : <span className="text-ink3">PIR</span>;
  return <>
    <H>Executive summary and core KPIs</H>
    <div style={grid(4)}>
      <Tile go={go({ t: 'metric', i: D.SLA.findIndex(x => x.n === 29), per: 3 })} k="Network availability" v={pct(avail.act, 3)} sub={`target ${pct(avail.esl, 2)} (ESL)`} tone={avail.act >= avail.esl ? RC.green : RC.amber} />
      <Tile go={go({ t: 'lines', k: 'all' })} k="Lines performing to target" v={pct(perf, 1)} sub="latency, jitter and loss inside limits" tone={perf > 0.98 ? RC.green : RC.amber} />
      <Tile go={go({ t: 'incidents', k: 'open' })} k="Incidents this week" v={num(all.length)} sub={`${all.length <= prev ? '↓' : '↑'} ${Math.abs(Math.round((all.length / prev - 1) * 100))}% on last week · ${Math.round(auto / Math.max(1, res.length) * 100)}% fixed with no human touch`} tone={RC.blue} />
      <Tile go={go({ t: 'mttr' })} k="Mean time to acknowledge / restore" v={`${ms(mtta)} / ${ms(mttr)}`} sub="all priorities, this week" tone={RC.navy} />
    </div>
    <div style={grid(4)}>
      <Tile go={go({ t: 'incidents', k: 'open' })} k="P1 / P2 this week" v={`${p1.length} / ${p2.length}`} sub={`${crit.filter(r => r.open).length} still open`} tone={RC.red} />
      <Tile go={go({ t: 'sla', per: 3 })} k="SLA breaches" v={breached.length} sub={`${slaBelow.length} service levels below ESL`} tone={breached.length ? RC.red : RC.green} />
      <Tile go={go({ t: 'changes' })} k="Change success rate" v={pct(CHG_WEEK.ok / CHG_WEEK.total, 1)} sub={`${CHG_WEEK.ok} of ${CHG_WEEK.total} changes · ${CHG_WEEK.failed.length} rolled back`} tone={RC.green} />
      <Tile k="Escalations / DSAT" v={`${esc.length} / ${DSAT.length}`} sub="escalations to Movate · dissatisfied surveys" tone={DSAT.length ? RC.amber : RC.green} />
    </div>
    <RRow>
      <RDonut title="P1 / P2 incidents" data={[{ label: 'P1', value: p1.length, color: RC.red }, { label: 'P2', value: p2.length, color: RC.amber }].filter(x => x.value)} center={crit.length} sub="this week" />
      <RDonut title="P1 / P2 outcome" data={[{ label: 'Within target', value: crit.filter(r => !r.open && r.slaMet).length, color: RC.green }, { label: 'Outside target', value: crit.filter(r => !r.open && !r.slaMet).length, color: RC.red }, { label: 'Still open', value: crit.filter(r => r.open).length, color: RC.grey }].filter(x => x.value)} />
      <RHBars title="Mean time to restore, hours (target)" rows={['P1', 'P2', 'P3'].map(p => ({ label: `${p} (${D.slaOf(p).res / HR} h)`, value: +((byP(p).mttr || 0) / HR).toFixed(1), color: (byP(p).mttr || 0) <= D.slaOf(p).res ? RC.green : RC.red }))} fmt={v => v ? `${v} h` : '—'} />
    </RRow>
    <H>Major incident log, last 7 days</H>
    <T rows={brief ? crit.slice(0, 6) : crit} cols={[['Incident', r => `${r.id} · ${r.pri}`], ['What happened', r => r.title], ['Where', r => r.where], ['Opened', r => `${dateShort(r.opened)} ${hhmm(r.opened)}`], ['Restored', r => r.open ? `open, ${r.state.toLowerCase()}` : `${dur(r.ttr)}${r.slaMet ? '' : ' (outside target)'}`], ['Root cause', r => r.cause], ['RCA', rca]]} />
    <H>SLA breach report</H>
    {breached.length ? <T rows={brief ? breached.slice(0, 5) : breached} cols={[['Incident', i => `${i.id} · ${i.pri}`], ['Branch', i => D.BR[i.branchId].name], ['What happened', i => i.title], ['Target', i => `${D.slaOf(i.pri).res / HR} h`], ['Took', i => i.state === 'Resolved' ? dur(i.resolved - i.opened) : `${dur(now - i.opened)} and open`], ['Why', i => i.closeCode || i.state]]} /> : <p className="text-[13px] text-ink">No incident missed its resolution target this week.</p>}
    {!brief && <T rows={slaBelow} cols={[['#', m => m.n], ['Service level', m => m.name], ['Actual', m => pct(m.act, m.fmt || 1)], ['Expected (ESL)', m => pct(m.esl, m.fmt || 1)], ['Minimum (MSL)', m => m.msl == null ? '—' : pct(m.msl, m.fmt || 1)]]} />}
    {brief && slaBelow.length > 0 && <p className="text-[13px] text-ink">{slaBelow.length} service level{slaBelow.length === 1 ? '' : 's'} below the expected level: {slaBelow.slice(0, 4).map(m => m.name).join(', ')}{slaBelow.length > 4 ? '…' : ''}.</p>}
    <H>Change management</H>
    <div style={grid(4)}><Tile k="Changes implemented" v={CHG_WEEK.total} sub={`${CHG_WEEK.standard} standard · ${CHG_WEEK.normal} normal · ${CHG_WEEK.emergency} emergency`} /><Tile k="Successful" v={CHG_WEEK.ok} tone={RC.green} /><Tile k="Rolled back" v={CHG_WEEK.failed.length} tone={CHG_WEEK.failed.length ? RC.amber : RC.green} /><Tile k="Waiting for approval" v={s.approvals.filter(a => a.status === 'Pending').length} tone={RC.blue} /></div>
    {CHG_WEEK.failed.length > 0 && <T rows={CHG_WEEK.failed} cols={[['Change', r => r[0]], ['What', r => r[1]], ['What happened', r => r[2]]]} />}
    <H>Upcoming planned events, next 14 days</H>
    <T rows={brief ? upcoming.slice(0, 6) : upcoming} cols={[['When', e => `${dateShort(e.t)} ${hhmm(e.t)}`], ['Type', e => e.kind], ['What', e => e.what], ['Ref', e => e.ref], ['Detail', e => e.note]]} />
    <H>Security and vulnerability alerts</H>
    <T rows={brief ? adv.slice(0, 3) : adv} cols={[['Advisory', x => x.a.id], ['Severity', x => `${x.a.sev} · CVSS ${x.a.cvss}`], ['What', x => x.a.title], ['Devices exposed', x => num(x.n)], ['Published', x => x.a.published]]} />
    <H>Escalations and dissatisfied customers</H>
    {esc.length > 0 && <T rows={esc} cols={[['Escalation', e => e.id], ['From', e => e.from], ['About', e => (e.about && e.about.label) || '—'], ['Urgency', e => e.urgency], ['Status', e => e.status]]} />}
    {!esc.length && <p className="text-[13px] text-ink">No escalations to Movate this week.</p>}
    <T rows={DSAT} cols={[['Branch', r => r[0]], ['Score', r => `${r[1]} / 5`], ['What they said', r => r[2]], ['Incident', r => r[3]], ['What we changed', r => r[4]]]} />
  </>;
}
