// What each reader needs. The CEO: trading hours and money, what hurt the business, the value of the service, risk,
// growth and the decisions waiting. The CIO: business services, value, provider performance, security, execution
// and experience. The operations manager: backlog, ageing, what is at risk now, repeats, workload. The network lead:
// top offenders, capacity, firmware and config drift. Every figure drills into the detail.
import React from 'react';
import * as D from './data.js';
import { slaClock, onBackupOf } from './store.jsx';
import { actionsOf } from './predictact.jsx';
import { CHG_WEEK, DSAT } from './bureport.jsx';
import { RDonut, RHBars, RRow, RC } from './viz3.jsx';
import { dur, dateShort, hhmm, pct, num, DAY, HR, MIN, parts } from './util.js';

export const REV_HOUR = 3300; // assumed revenue per store trading hour; set with Finance
const hrsOf = t => { const [h, m] = t.split(':').map(Number); return h + m / 60; };
const weekHours = b => (hrsOf(b.hours.close) - hrsOf(b.hours.open)) * 5 + (b.hours.sat ? (hrsOf(b.hours.sat.split('-')[1]) - hrsOf(b.hours.sat.split('-')[0])) : 0);
// how much of trading an incident takes away, by kind (1 = the store cannot trade)
const HIT = { edgedown: 1, 'hero-config': 0.25, pos: 0.35, dhcp: 0.3, scanner: 0.2, cpu: 0.15, jitter: 0.1, apdown: 0.05, crc: 0.05, circuit: 0, lte: 0, backup: 0 };
const SERVICE = { pos: ['edgedown', 'pos'], erp: ['edgedown', 'hero-config', 'jitter'], wifi: ['edgedown', 'apdown', 'scanner', 'dhcp'], wan: ['edgedown', 'circuit', 'jitter', 'lte'] };

export function businessWeek(s, now, rev = REV_HOUR) {
  const wk = now - 7 * DAY;
  const all = [...s.incidents, ...s.resolved].filter(i => i.opened >= wk);
  const scheduled = D.BRANCHES.reduce((a, b) => a + weekHours(b), 0);
  const durH = i => Math.min(10, ((i.resolved || now) - i.opened) / HR);
  const trading = i => { const h = parts(i.opened, D.BR[i.branchId].tz).h; return h >= 6 && h < 17 ? 1 : 0.2; };
  const lostOf = i => (HIT[i.kind] ?? 0.1) * durH(i) * trading(i);
  const lost = all.reduce((a, i) => a + lostOf(i), 0);
  const kept = all.filter(i => ['circuit', 'jitter', 'lte', 'pos'].includes(i.kind)).reduce((a, i) => a + durH(i) * trading(i) * (i.kind === 'pos' ? 0.65 : 1), 0);
  const auto = all.filter(i => i.auto).length;
  const protectedH = kept + auto * 0.75;
  const hurt = all.map(i => ({ i, h: lostOf(i) })).filter(x => x.h > 0.05).sort((a, b) => b.h - a.h).slice(0, 3);
  const svc = Object.fromEntries(Object.entries(SERVICE).map(([k, kinds]) => [k, 1 - all.filter(i => kinds.includes(i.kind)).reduce((a, i) => a + (k === 'wan' && ['circuit', 'lte'].includes(i.kind) ? 0.02 : (HIT[i.kind] || 0.1)) * durH(i) * trading(i), 0) / scheduled]));
  return { all, scheduled, lost, lostRev: lost * rev, protectedH, protectedRev: protectedH * rev, delivered: 1 - lost / scheduled, auto, hurt, svc, customer: all.filter(i => (HIT[i.kind] || 0) >= 0.25).length, rev };
}
const money = v => v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${Math.round(v / 1e3)}k` : `$${Math.round(v)}`;
const Tile = ({ k, v, sub, tone, go }) => <div onClick={go} title={go ? 'Drill down' : undefined} className={go ? 'cursor-pointer hover:shadow-md transition-shadow' : ''} style={{ border: '1px solid #d9dce1', borderRadius: 8, padding: '10px 12px', borderTop: `3px solid ${tone || '#1D3F66'}` }}><div className="text-ink3" style={{ fontSize: 11.5 }}>{k}</div><div className="text-ink" style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.15 }}>{v}</div>{sub && <div className="text-ink3" style={{ fontSize: 11.5 }}>{sub}</div>}</div>;
const grid = n => ({ display: 'grid', gridTemplateColumns: `repeat(${n}, minmax(0,1fr))`, gap: 10, margin: '8px 0 6px' });
const plainOf = i => `${D.BR[i.branchId].name.replace(/ – .*/, '')} (${D.BR[i.branchId].city}): ${(i.impact && i.impact[0]) || i.title}`;
const fixOf = i => i.state !== 'Resolved' ? `being fixed now (${i.state.toLowerCase()})` : i.auto ? 'fixed automatically' : `fixed in ${dur(i.resolved - i.opened)}`;

function shared(s, now) {
  const critDev = D.DEVICES.filter(d => D.vulnsOf(d).some(a => a.sev === 'Critical'));
  const eos = D.DEVICES.filter(d => d.model === '2530').length;
  const onBackup = D.BRANCHES.filter(b => onBackupOf(s, b)).length;
  const acq = s.projects.filter(p => p.track === 'Acquired'), acqLive = acq.filter(p => ['Hypercare', 'Live'].includes(p.stage)).length;
  const nextLive = s.projects.filter(p => p.golive > now).sort((a, b) => a.golive - b.golive)[0];
  // decisions for leaders are about money, risk and growth; runbook and change approvals stay with the engineers
  const biz = [
    { what: 'Fund the refresh of 728 end-of-support 2530 switches (wave 2, 64 branches)', ref: 'Lifecycle plan', cost: '$0.9M' },
    { what: 'Add a second, diverse line at 12 stores that share one duct for both lines', ref: 'PRB0040117', cost: '$8k a month' },
    { what: 'Upgrade the Dallas yard line 100 → 200 Mb/s before hail season', ref: 'RITM0049120', cost: '$600 a month' },
    { what: 'Top up the pooled LTE plan for failovers this month', ref: 'PRD-506', cost: '$4k' },
  ];
  const cab = s.changes.filter(c => c.state === 'Awaiting CAB' || c.risk === 'High').map(c => ({ what: `${c.title} (${c.risk} risk, ${c.window})`, ref: c.id, cost: '—' }));
  const waits = biz, waitsCio = [...biz, ...cab];
  const slaMet = D.SLA.filter(m => m.lower ? m.act <= m.esl : m.act >= m.esl).length, belowMsl = D.SLA.filter(m => m.msl != null && !m.lower && m.act < m.msl).length;
  const rr = D.SLA.filter(m => m.cls === 'Risk Reward SLA'), rrRisk = rr.filter(m => m.act < m.esl).length;
  const carrierMet = D.SCORECARD.reduce((a, x) => a + x.slaMet, 0) / D.SCORECARD.length, worst = D.SCORECARD.slice().sort((a, b) => a.slaMet - b.slaMet)[0];
  return { critDev, critBranches: new Set(critDev.map(d => d.branchId)).size, eos, onBackup, acq, acqLive, nextLive, waits, waitsCio, slaMet, belowMsl, rr, rrRisk, carrierMet, worst };
}

// ---------- CEO ----------
export function CEOReport({ s, now, H, T, act, rev = REV_HOUR, setRev }) {
  const B = businessWeek(s, now, rev), X = shared(s, now);
  const go = n => act ? () => act.drill(n) : undefined;
  return <>
    <div style={grid(4)}>
      <Tile go={go({ t: 'set', k: 'all' })} k="Store trading hours delivered" v={pct(B.delivered, 2)} sub={`${num(Math.round(B.scheduled))} store-hours this week`} tone={B.delivered > 0.999 ? RC.green : RC.amber} />
      <Tile go={go({ t: 'incidents', k: 'open' })} k="Trading hours lost" v={`${num(Math.round(B.lost))} h`} sub={`about ${money(B.lostRev)} of sales at risk`} tone={RC.red} />
      <Tile go={go({ t: 'incidents', k: 'open' })} k="Trading kept going" v={`${num(Math.round(B.protectedH))} h`} sub={`about ${money(B.protectedRev)} protected by backup lines and automation`} tone={RC.green} />
      <Tile go={go({ t: 'incidents', k: 'open' })} k="Checkout working" v={pct(B.svc.pos, 2)} sub={`${B.customer} disruptions customers could feel`} tone={B.svc.pos > 0.999 ? RC.green : RC.amber} />
    </div>
    <H>What hurt the business this week</H>
    <T rows={B.hurt} cols={[['', x => <b>{plainOf(x.i)}</b>], ['Trading lost', x => `${x.h.toFixed(1)} h · ${money(x.h * rev)}`], ['Now', x => fixOf(x.i)]]} />
    <H>Value, risk and growth</H>
    <div style={grid(4)}>
      <Tile go={act ? () => act.go('catalogue') : undefined} k="Work done without a person" v={`${num(Math.round(B.auto * 0.75 + B.all.length * 0.1))} h`} sub={`${B.auto} problems fixed automatically`} tone={RC.green} />
      <Tile go={act ? () => act.go('predict') : undefined} k="Problems stopped before they hit" v={s.predictions.filter(p => actionsOf(p).some(a => a.st !== 'wait' && a.who !== 'Prediction Agent')).length} sub="acted on from predictions" tone={RC.green} />
      <Tile go={act ? () => act.go('vuln') : undefined} k="Security exposure" v={`${X.critBranches} stores`} sub={`${num(X.critDev.length)} devices with a critical vulnerability, patching in waves`} tone={X.critDev.length ? RC.amber : RC.green} />
      <Tile go={act ? () => act.go('biab') : undefined} k="Acquisitions" v={`${X.acqLive} of ${X.acq.length} live`} sub={X.nextLive ? `next go-live ${dateShort(X.nextLive.golive)}: ${X.nextLive.brand}` : 'no go-live in view'} tone={RC.blue} />
    </div>
    <H>Decisions waiting for you</H>
    <T rows={X.waits} cols={[['Decision', w => w.what], ['Cost', w => w.cost], ['Ref', w => w.ref]]} />
    {setRev && <div className="text-[11.5px] text-ink3 mt-3">Sales at risk use <label>$<input type="number" value={rev} onChange={e => setRev(Math.max(0, +e.target.value || 0))} className="w-20 mx-1 px-1 rounded border border-line bg-canvas text-ink" /></label> per store trading hour (set with Finance).</div>}
  </>;
}

// ---------- CIO ----------
export function CIOReport({ s, now, brief, H, T, act, rev = REV_HOUR }) {
  const B = businessWeek(s, now, rev), X = shared(s, now);
  const go = n => act ? () => act.drill(n) : undefined, to = m => act ? () => act.go(m) : undefined;
  const fw = D.SLA.find(m => m.n === 32), bk = D.SLA.find(m => m.n === 33), autoR = D.SLA.find(m => /Auto-resolution/.test(m.name)), noise = D.SLA.find(m => /noise/.test(m.name));
  return <>
    <H>Business services, this week</H>
    <div style={grid(4)}>{[['Card payments', B.svc.pos], ['ERP and ordering', B.svc.erp], ['Warehouse Wi-Fi', B.svc.wifi], ['Store network', B.svc.wan]].map(([k, v]) => <Tile key={k} go={go({ t: 'incidents', k: 'open' })} k={k} v={pct(v, 2)} sub="of trading hours working" tone={v > 0.999 ? RC.green : v > 0.995 ? RC.amber : RC.red} />)}</div>
    <H>Value and provider performance</H>
    <div style={grid(4)}>
      <Tile go={to('catalogue')} k="Fixed with no human touch" v={pct(autoR.act, 0)} sub={`noise removed ${pct(noise.act, 0)}`} tone={RC.green} />
      <Tile go={go({ t: 'sla', per: 3 })} k="Movate service levels met" v={`${X.slaMet} of ${D.SLA.length}`} sub={`${X.belowMsl} below minimum · ${X.rrRisk} risk-reward SLAs short of target`} tone={X.belowMsl ? RC.red : RC.amber} />
      <Tile go={to('carriers')} k="Carrier restore promises kept" v={pct(X.carrierMet, 0)} sub={`weakest: ${X.worst.carrier} ${pct(X.worst.slaMet, 0)}`} tone={X.carrierMet > 0.9 ? RC.green : RC.amber} />
      <Tile go={to('carriers')} k="Trading kept going" v={`${num(Math.round(B.protectedH))} h`} sub={`${money(B.protectedRev)} protected`} tone={RC.green} />
    </div>
    <H>Security and compliance</H>
    <div style={grid(4)}>
      <Tile go={to('vuln')} k="Critical vulnerabilities" v={num(X.critDev.length)} sub={`devices at ${X.critBranches} stores`} tone={X.critDev.length ? RC.amber : RC.green} />
      <Tile go={go({ t: 'metric', i: D.SLA.indexOf(fw), per: 3 })} k="Firmware compliance" v={pct(fw.act, 1)} sub={`target ${pct(fw.esl, 0)}`} tone={fw.act >= fw.esl ? RC.green : RC.amber} />
      <Tile go={go({ t: 'metric', i: D.SLA.indexOf(bk), per: 3 })} k="Config backups" v={pct(bk.act, 1)} sub={`target ${pct(bk.esl, 0)}`} tone={bk.act >= bk.esl ? RC.green : RC.amber} />
      <Tile go={to('vuln')} k="End-of-support kit" v={num(X.eos)} sub="2530 switches; refresh in waves" tone={RC.amber} />
    </div>
    <H>Execution and experience</H>
    <div style={grid(4)}>
      <Tile go={to('changes')} k="Change success" v={pct(CHG_WEEK.ok / CHG_WEEK.total, 1)} sub={`${CHG_WEEK.total} changes, ${CHG_WEEK.failed.length} rolled back`} tone={RC.green} />
      <Tile go={to('biab')} k="Projects" v={`${s.projects.filter(p => p.rag === 'Green').length} green · ${s.projects.filter(p => p.rag !== 'Green').length} amber/red`} sub={`${X.acq.length} acquisitions in flight`} tone={RC.blue} />
      <Tile k="Dissatisfied surveys" v={DSAT.length} sub="this week" tone={DSAT.length ? RC.amber : RC.green} />
      <Tile go={to('reports')} k="Escalations to Movate" v={(s.escalations || []).length} sub="this week" tone={RC.blue} />
    </div>
    <H>Risks and decisions</H>
    <T rows={X.waitsCio.slice(0, brief ? 5 : 12)} cols={[['Decision', w => w.what], ['Cost', w => w.cost], ['Ref', w => w.ref]]} />
  </>;
}

// ---------- operations manager ----------
export function OpsMgrReport({ s, now, H, T, act }) {
  const open = s.incidents.filter(i => i.state !== 'Resolved');
  const age = i => now - i.opened, buckets = [['Under 4 h', 0, 4 * HR], ['4–24 h', 4 * HR, DAY], ['1–3 days', DAY, 3 * DAY], ['Over 3 days', 3 * DAY, 1e15]];
  const risk = open.filter(i => slaClock(i, now).used > 0.6).sort((a, b) => slaClock(b, now).used - slaClock(a, now).used);
  const wk = [...s.incidents, ...s.resolved].filter(i => i.opened >= now - 7 * DAY);
  const rep = Object.entries(wk.reduce((a, i) => ({ ...a, [i.branchId]: (a[i.branchId] || 0) + 1 }), {})).filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]);
  const teams = Object.entries(open.reduce((a, i) => ({ ...a, [i.group]: (a[i.group] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1]);
  const breached = wk.filter(i => (i.resolved || now) - i.opened > D.slaOf(i.pri).res).length;
  const wos = s.workOrders.filter(w => w.status !== 'Completed');
  return <>
    <div style={grid(4)}>
      <Tile go={act && (() => act.drill({ t: 'incidents', k: 'open' }))} k="Backlog" v={open.length} sub={`${open.filter(i => !i.acked).length} not acknowledged`} />
      <Tile go={act && (() => act.drill({ t: 'incidents', k: 'atRisk' }))} k="At risk of breach now" v={risk.length} sub="over 60% of the clock used" tone={risk.length ? RC.red : RC.green} />
      <Tile k="Breached this week" v={breached} sub={`of ${wk.length} incidents`} tone={breached ? RC.amber : RC.green} />
      <Tile go={act && (() => act.go('dispatch'))} k="Field work open" v={wos.length} sub={`${wos.filter(w => !w.tech).length} unassigned`} tone={RC.blue} />
    </div>
    <RRow>
      <RHBars title="Backlog by age" rows={buckets.map(([l, a, b], k) => ({ label: l, value: open.filter(i => age(i) >= a && age(i) < b).length, color: [RC.green, RC.blue, RC.amber, RC.red][k] }))} />
      <RHBars title="Open by team" rows={teams.map(([g, n]) => ({ label: g.replace('Movate ', ''), value: n, color: RC.navy }))} />
      <RDonut title="This week by priority" data={['P1', 'P2', 'P3', 'P4'].map((p, k) => ({ label: p, value: wk.filter(i => i.pri === p).length, color: [RC.red, RC.amber, RC.blue, RC.grey][k] })).filter(x => x.value)} center={wk.length} sub="incidents" />
    </RRow>
    <H>At risk of breach now</H>
    <T rows={risk.slice(0, 10)} cols={[['Incident', i => `${i.id} · ${i.pri}`], ['Branch', i => D.BR[i.branchId].name], ['What', i => i.title], ['Clock used', i => pct(slaClock(i, now).used, 0)], ['Owner', i => i.assignee || 'unassigned']]} />
    <H>Repeat problems this week</H>
    <T rows={rep.slice(0, 8)} cols={[['Branch', ([id]) => D.BR[id].name], ['Incidents', ([, n]) => n], ['Latest', ([id]) => (wk.filter(i => i.branchId === id).sort((a, b) => b.opened - a.opened)[0] || {}).title]]} />
    <H>Changes this week</H>
    <T rows={s.changes.filter(c => c.start > now - 2 * DAY && c.start < now + 7 * DAY)} cols={[['Change', c => c.id], ['What', c => c.title], ['When', c => c.window], ['Risk', c => c.risk], ['State', c => c.state]]} />
  </>;
}

// ---------- network lead ----------
export function LeadReport({ s, now, H, T, act }) {
  const offenders = D.CIRCUITS.filter(c => c.tickets90 >= 3).sort((a, b) => b.tickets90 - a.tickets90).slice(0, 10);
  const hot = D.CIRCUITS.filter(c => c.util >= 70).sort((a, b) => b.util - a.util).slice(0, 10);
  const fwOff = D.DEVICES.filter(d => { const t = (D.FW_TARGET[d.type === 'AP' ? 'AP' : d.model] || [])[0]; return t && d.fw !== t; });
  const byModel = Object.entries(fwOff.reduce((a, d) => ({ ...a, [d.model]: (a[d.model] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1]);
  return <>
    <div style={grid(4)}>
      <Tile go={act && (() => act.go('carriers'))} k="Repeat-offender lines" v={offenders.length} sub="3 or more tickets in 90 days" tone={RC.amber} />
      <Tile go={act && (() => act.go('carriers'))} k="Lines above 70% at peak" v={hot.length} sub="capacity hot spots" tone={hot.length ? RC.amber : RC.green} />
      <Tile go={act && (() => act.go('vuln'))} k="Devices off target firmware" v={num(fwOff.length)} sub={`of ${num(D.DEVICES.length)}`} tone={RC.amber} />
      <Tile go={act && (() => act.go('changes'))} k="Config drift" v={D.DRIFT.length} sub="devices differ from golden" tone={D.DRIFT.length ? RC.amber : RC.green} />
    </div>
    <RRow><RHBars title="Off target firmware, by model" rows={byModel.map(([m, n]) => ({ label: m, value: n, color: RC.amber }))} /></RRow>
    <H>Repeat-offender lines</H>
    <T rows={offenders} cols={[['Line', c => c.id], ['Branch', c => D.BR[c.branchId].name], ['Carrier', c => `${c.carrier} ${c.type}`], ['Tickets, 90 days', c => c.tickets90], ['No trouble found', c => c.ntf90]]} />
    <H>Capacity hot spots</H>
    <T rows={hot} cols={[['Line', c => c.id], ['Branch', c => D.BR[c.branchId].name], ['Speed', c => `${c.bw} Mb/s`], ['Peak use', c => `${c.util}%`]]} />
    <H>Config drift</H>
    <T rows={D.DRIFT} cols={[['Device', d => d.device], ['What differs', d => d.item], ['Severity', d => d.sev], ['Since', d => dateShort(d.since)], ['Source', d => d.source]]} />
  </>;
}

// the SLA & KPI Tracker for the CEO: what the service delivered for the business, provider performance in one line
export function BusinessView({ s, now, act, rev = REV_HOUR }) {
  const B = businessWeek(s, now, rev), X = shared(s, now);
  return (
    <div className="space-y-3">
      <div style={grid(4)}>
        <Tile go={() => act.drill({ t: 'set', k: 'all' })} k="Store trading hours delivered" v={pct(B.delivered, 2)} sub="this week" tone={B.delivered > 0.999 ? RC.green : RC.amber} />
        <Tile go={() => act.drill({ t: 'incidents', k: 'open' })} k="Sales at risk from network problems" v={money(B.lostRev)} sub={`${num(Math.round(B.lost))} trading hours lost`} tone={RC.red} />
        <Tile go={() => act.drill({ t: 'incidents', k: 'open' })} k="Sales protected" v={money(B.protectedRev)} sub="backup lines and automation kept stores trading" tone={RC.green} />
        <Tile go={() => act.drill({ t: 'sla', per: 3 })} k="Movate delivered" v={`${X.slaMet} of ${D.SLA.length}`} sub={`service levels met · ${X.belowMsl} below minimum`} tone={X.belowMsl ? RC.red : RC.amber} />
      </div>
      <div style={grid(4)}>{[['Card payments', B.svc.pos], ['ERP and ordering', B.svc.erp], ['Warehouse Wi-Fi', B.svc.wifi], ['Store network', B.svc.wan]].map(([k, v]) => <Tile key={k} go={() => act.drill({ t: 'incidents', k: 'open' })} k={k} v={pct(v, 2)} sub="of trading hours working" tone={v > 0.999 ? RC.green : v > 0.995 ? RC.amber : RC.red} />)}</div>
    </div>
  );
}
