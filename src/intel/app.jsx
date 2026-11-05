// Network Intelligence & Analytics: three connected lenses on the same store network (Now, Then, Next), with the
// overview, governance and KPI pages from the solution response. Same data, look and drill-downs as the console.
import React, { useMemo, useState } from 'react';
import * as I from 'lucide-react';
import * as D from '../data.js';
import { useApp, useNow, healthOf } from '../store.jsx';
import { useLive } from '../live.jsx';
import { todayCounts } from '../viz2.jsx';
import { statusOf } from '../dash/drilldata.js';
import { SiteShell, useHashTab, Box, Pill, T, DISPLAY } from '../sites/shell.jsx';
import { NowLens } from './now.jsx';
import { ThenLens } from './then.jsx';
import { NextLens } from './next.jsx';
import { nowModel, thenModel, nextModel, riskOf, KPIS } from './model.js';
import { num, dur } from '../util.js';
import { cx } from '../ui.jsx';

const TABS = [
  { id: 'overview', label: 'Overview', icon: I.LayoutGrid },
  { id: 'now', label: 'Now: live health', icon: I.Activity, tag: 'OpsRamp' },
  { id: 'then', label: 'Then: performance and trends', icon: I.History, tag: 'ServiceNow' },
  { id: 'next', label: 'Next: predictive risk', icon: I.Telescope, tag: 'AI' },
  { id: 'gov', label: 'Governance and KPIs', icon: I.Users },
];
const pc = (v, d = 2) => `${(v * 100).toFixed(d)}%`;

export default function IntelApp() {
  const [tab, setTab] = useHashTab(TABS, 'overview');
  const [region, setRegion] = useState('All');
  return (
    <SiteShell site="Network Intelligence & Analytics" sub="Now, Then, Next" tabs={TABS} tab={tab} onTab={setTab}
      foot="Sample data for the SRS demo, built from the same live data as the console. OpsRamp and ServiceNow remain the systems of record; nothing here replaces them. Every number opens its detail.">
      {tab === 'overview' && <Overview go={setTab} />}
      {tab === 'now' && <NowLens region={region} setRegion={setRegion} />}
      {tab === 'then' && <ThenLens region={region} setRegion={setRegion} />}
      {tab === 'next' && <NextLens region={region} setRegion={setRegion} />}
      {tab === 'gov' && <Governance go={setTab} />}
    </SiteShell>
  );
}

const LENSES = [
  { id: 'then', name: 'Then: Trends', src: 'ServiceNow managed services', q: 'How have we performed?', items: ['SLA, MTTA and MTTR trends', 'Repeat-offender stores', 'Root cause and carrier mix', 'Field dispatch analysis'], aud: 'IT leadership, service owners, vendor management', when: 'Past' },
  { id: 'now', name: 'Now: Live Health', src: 'OpsRamp, near real time', q: 'Are stores trading now?', items: ['Stores up, degraded, down', 'Device and circuit health', 'Capacity and utilization', 'Redundancy exposure'], aud: 'SRS IT leadership, network operations', when: 'Present' },
  { id: 'next', name: 'Next: Predicted Risk', src: 'AI models on combined history', q: 'What will break next?', items: ['Store and device risk scores', '30/60/90-day capacity view', 'End-of-support exposure', 'Proactive tickets and visits'], aud: 'Network engineering, field services, planning', when: 'Future' },
];

function Overview({ go }) {
  const { s, act } = useApp(); const now = useNow(); const { L } = useLive();
  const nm = useMemo(() => nowModel(s, now, 'today', 'All'), [s.incidents, s.branchHealth, s.circuitState, Math.floor(now / 30000)]);
  const tm = useMemo(() => thenModel('90d', 'All'), []);
  const xm = useMemo(() => nextModel(s, now, '7d', 'All'), [s.incidents, s.predictions, Math.floor(now / 60000)]);
  const live = { now: `${num(nm.trading)}/${num(nm.list.length)} trading`, then: `SLA ${pc(tm.sla, 1)}, 90 days`, next: `${xm.high.length} high-risk this week` };
  const tc = todayCounts(L, s);
  return (
    <div>
      <section className="bg-panel border border-line rounded-lg p-5 border-l-4 border-l-brand">
        <div className="text-[11px] font-bold tracking-[0.1em] uppercase text-brand">Network Intelligence layer for SRS Distribution</div>
        <h1 className="text-[26px] font-bold text-ink leading-tight mt-1" style={DISPLAY}>How the store network is performing now, how it has performed, and where it will break next</h1>
        <p className="text-[14px] text-ink2 mt-1.5 max-w-[980px]">Three purpose-built dashboards, fed from the tools SRS already runs, that move network operations from reactive firefighting to planned, evidence-based action. They share one data foundation, one store and device hierarchy and one set of KPI definitions, so a store's outage, its ticket history and its risk score all point to the same store record.</p>
      </section>
      <h2 className="text-[15px] font-bold text-ink mt-5 mb-2">One store view across past, present and future</h2>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">{LENSES.map(l => (
        <button key={l.id} onClick={() => go(l.id)} className={cx('text-left bg-panel border rounded-lg p-4 hover:border-ink3 group', l.id === 'now' ? 'border-info ring-1 ring-info/40' : 'border-line')}>
          <div className="text-[11px] font-bold uppercase tracking-wide text-ink3">{l.when}</div>
          <div className="text-[17px] font-bold text-ink mt-0.5">{l.name}</div><div className="text-[12.5px] text-ink3">{l.src}</div>
          <ul className="mt-2 space-y-0.5 text-[13px] text-ink">{l.items.map(x => <li key={x} className="flex gap-1.5"><I.Check size={13} className="text-ok mt-[3px] shrink-0" />{x}</li>)}</ul>
          <div className="border-t border-line mt-3 pt-2 flex items-center gap-2"><b className="text-[13px] text-ink flex-1">{l.q}</b><span className="text-[12px] text-brand font-semibold">{live[l.id]}</span><I.ChevronRight size={14} className="text-ink3 group-hover:text-brand" /></div>
        </button>))}</div>
      <div className="bg-chip/70 border border-line rounded-lg px-4 py-2.5 mt-3 text-center text-[13px] text-ink"><b>Shared foundation:</b> one store and device hierarchy ({num(D.BRANCHES.length)} stores, {num(D.DEVICES.length)} devices, {num(D.CIRCUITS.length)} circuits), one KPI dictionary ({KPIS.length} KPIs, defined the same way for everyone).</div>
      <FollowStore />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 mt-3">
        <Box title="The three lenses" sub="Each answers a different question, from a different source, for a different audience.">
          <T cols={[{ k: 'name', l: 'Lens', f: l => <button onClick={() => go(l.id)} className="font-bold text-ink hover:underline text-left">{l.name}</button> }, { k: 'q', l: 'Question it answers' }, { k: 'src', l: 'Primary source', cls: 'text-ink2' }, { k: 'aud', l: 'Primary audience', cls: 'text-ink2' }]} rows={[LENSES[1], LENSES[0], LENSES[2]]} />
        </Box>
        <Box title="Intended outcomes for SRS" sub="What changes when the three lenses are in use.">
          <ul className="space-y-2 text-[13px]">{[
            ['Fewer surprise outages at branches', `Risks surface days ahead, so unplanned truck rolls become planned visits. ${xm.acc.avoided} outages avoided this month so far.`, () => go('next')],
            ['Faster restoration', `Correlated, store-level views shorten triage and route the right resolver team first time. P1 restore ${tm.mttrP1.toFixed(1)} h over 90 days.`, () => go('then')],
            ['A factual basis for decisions', 'Circuit upgrades, hardware refresh and vendor reviews rest on trended data, not anecdote.', () => go('next')],
            ['One version of the truth', 'Executives, network engineers and service owners read the same numbers, defined the same way.', () => go('gov')],
          ].map(([a, b, f]) => <li key={a}><button onClick={f} className="w-full text-left flex gap-2 hover:bg-chip/50 rounded p-1"><I.Target size={15} className="text-brand mt-[2px] shrink-0" /><span><b className="text-ink">{a}.</b> <span className="text-ink2">{b}</span></span></button></li>)}</ul>
        </Box>
      </div>
      <Box className="mt-3" title="SRS's network environment" sub="Every store depends on the network to quote, order, invoice, dispatch and load trucks. Each follows a standard pattern, which suits estate-wide analytics.">
        <T cols={[{ k: 'l', l: 'Layer', f: r => <b className="text-ink">{r.l}</b> }, { k: 'b', l: 'Standard store build' }, { k: 'w', l: 'What we monitor', cls: 'text-ink2' }, { k: 'n', l: 'In the estate', r: true }, { k: 'h', l: 'Healthy now', r: true }]} rows={[
          { l: 'Access links', b: 'Dual ISP circuits per store', w: 'Up/down, latency, jitter, loss, utilization, carrier SLA', n: num(D.CIRCUITS.length), h: pc(nm.layers[0].up / nm.layers[0].total, 1) },
          { l: 'SD-WAN edge', b: 'Silver Peak (HPE Aruba EdgeConnect) EC-XS', w: 'Tunnel health, path selection, overlay performance, failover events', n: num(nm.layers[1].total), h: pc(nm.layers[1].up / nm.layers[1].total, 1) },
          { l: 'LAN switching', b: 'Aruba CX 6100 access switches', w: 'Port status, PoE budget, errors, uplink utilization', n: num(nm.layers[2].total), h: pc(nm.layers[2].up / nm.layers[2].total, 1) },
          { l: 'Wireless', b: 'Aruba AP-635 access points', w: 'Client counts, RF health, AP availability, roaming', n: num(nm.layers[3].total), h: pc(nm.layers[3].up / nm.layers[3].total, 1) },
          { l: 'Service layer', b: 'ServiceNow ITSM', w: 'Incidents, requests, changes, problems, SLAs', n: `${num(tm.tickets)} incidents, 90 d`, h: `${s.incidents.filter(i => i.state !== 'Resolved').length} open` },
        ]} />
      </Box>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 mt-3">
        <Box title="What SRS needs to solve, and where it is solved" sub="Each problem maps to the lens that answers it.">
          <T dense cols={[{ k: 'a', l: 'Problem', f: r => <b className="text-ink">{r.a}</b> }, { k: 'b', l: 'How the dashboards answer it', cls: 'text-ink2' }, { k: 'c', l: 'Lens', f: r => <button onClick={() => go(r.c)} className="text-info hover:underline capitalize">{r.c}</button> }]} rows={[
            { a: 'Fragmented visibility', b: `Device, circuit and ticket data in one store view; ${num(tc.events)} events today reduced to ${tc.inc} incidents before stores call.`, c: 'now' },
            { a: 'Reactive field operations', b: 'Risk-ranked worklist turns break-fix dispatches into planned visits in quiet hours.', c: 'next' },
            { a: 'Limited trend insight', b: 'Repeat-offender stores, circuits and devices fixed as patterns, not one ticket at a time.', c: 'then' },
            { a: 'No forward view', b: 'Every store scored 0 to 100 daily, ranked for this week, 30 and 90 days.', c: 'next' },
            { a: 'Multi-party operations', b: 'Simplify (access links), Movate (wider network), carriers and field services in one joined-up picture.', c: 'then' },
          ]} />
        </Box>
        <Box title="Design principles" sub="How every screen is built.">
          <ul className="space-y-2 text-[13px]">{[
            [I.Store, 'Store-first, not device-first', 'Every metric rolls up to the branch, because a branch is what trades.'],
            [I.BadgeDollarSign, 'Business impact over raw alerts', 'Stores are ranked by trading impact, not alarm count.'],
            [I.MousePointerClick, 'Action at every level', 'Every red or amber item links to an owner, a ticket or a recommended next step.'],
            [I.Plug, "Built on SRS's existing tools", 'OpsRamp and ServiceNow remain the systems of record; no rip-and-replace.'],
          ].map(([Ic, a, b]) => <li key={a} className="flex gap-2.5"><span className="w-7 h-7 rounded-md bg-brand/10 text-brand grid place-items-center shrink-0"><Ic size={15} /></span><span><b className="text-ink">{a}.</b> <span className="text-ink2">{b}</span></span></li>)}</ul>
        </Box>
      </div>
    </div>
  );
}

// "from what is red right now, to has this happened before, to will it happen again, in three clicks"
function FollowStore() {
  const { s, act } = useApp(); const now = useNow();
  const cands = useMemo(() => D.BRANCHES.filter(b => statusOf(s, b) !== 'up').slice(0, 12), [s.branchHealth, s.incidents]);
  const [id, setId] = useState(null);
  const b = D.BR[id] || cands[0] || D.BRANCHES[72];
  const st = statusOf(s, b), r = riskOf(s, b, 30, now);
  const hist = [...s.incidents, ...s.resolved].filter(i => i.branchId === b.id).sort((a, c) => c.opened - a.opened);
  const tm = thenModel('90d', 'All'), rank = tm.repeatStores.findIndex(x => x.b.id === b.id);
  const tickets = (tm.P.branches.find(x => x.b.id === b.id) || {}).tickets || 0;
  return (
    <Box className="mt-3" title="Follow one store: now, then, next" sub="From what is red right now, to has this happened before, to will it happen again, in three clicks." right={<select value={b.id} onChange={e => setId(e.target.value)} className="h-8 rounded-md border border-line bg-panel px-2 text-[12.5px] text-ink">{[...cands, ...(cands.includes(b) ? [] : [b])].map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[12.5px]">
        <button onClick={() => act.drill({ t: 'branch', id: b.id })} className="text-left border border-line rounded-lg p-3 hover:bg-chip/40"><div className="text-[11px] font-bold uppercase text-ink3">1 · Now</div><div className="mt-1"><Pill tone={st === 'up' ? 'green' : st === 'down' ? 'red' : 'amber'}>{{ up: 'Trading', degraded: 'Degraded', backup: 'On backup', down: 'Down' }[st]}</Pill></div><div className="text-ink mt-1.5">{hist[0] && hist[0].state !== 'Resolved' ? hist[0].title : 'No open problem'}</div><div className="text-ink3">{hist[0] && hist[0].state !== 'Resolved' ? `${hist[0].id}, open ${dur(now - hist[0].opened)}` : 'live from OpsRamp'}</div></button>
        <button onClick={() => hist[0] && act.drill({ t: 'incident', id: hist[0].id })} className="text-left border border-line rounded-lg p-3 hover:bg-chip/40"><div className="text-[11px] font-bold uppercase text-ink3">2 · Then</div><div className="text-[20px] font-bold text-ink tabular-nums">{tickets} <span className="text-[12px] font-normal text-ink3">tickets in 90 days</span></div><div className="text-ink">{rank >= 0 ? `#${rank + 1} repeat offender` : 'Not a repeat offender'}</div><div className="text-ink3">{hist.length} incidents in the last 7 days{hist.length ? `, last: ${hist[0].title.slice(0, 50)}` : ''}</div></button>
        <button onClick={() => act.drill({ t: 'branch', id: b.id })} className="text-left border border-line rounded-lg p-3 hover:bg-chip/40"><div className="text-[11px] font-bold uppercase text-ink3">3 · Next</div><div className="text-[20px] font-bold tabular-nums" style={{ color: r.score >= 70 ? 'rgb(var(--bad))' : undefined }}>{r.score} <span className="text-[12px] font-normal text-ink3">risk score, 30 days</span></div><div className="text-ink">{r.driver}</div><div className="text-ink3">Do: {r.action}</div></button>
      </div>
    </Box>
  );
}

const PERSONAS = [
  { p: 'SRS CIO / VP IT', lens: ['now', 'then'], use: 'Estate health, SLA attainment, business impact', cad: 'Live; monthly executive summary' },
  { p: 'SRS Network leadership', lens: ['now', 'then', 'next'], use: 'Prioritisation, carrier and refresh decisions', cad: 'Weekly risk review; monthly service review' },
  { p: 'SRS Field and depot services', lens: ['next'], use: 'Planned visits, spares pre-positioning', cad: 'Daily worklist' },
  { p: 'Movate NOC', lens: ['now', 'next'], use: 'Live triage, proactive action', cad: '24x7' },
  { p: 'Movate Service Delivery Manager', lens: ['then'], use: 'Service reviews and improvement plans', cad: 'Monthly and quarterly' },
  { p: 'Carrier and partner managers', lens: ['then'], use: 'Circuit and partner performance', cad: 'Quarterly' },
];

function Governance({ go }) {
  const { s } = useApp(); const now = useNow(); const { L } = useLive();
  const nm = useMemo(() => nowModel(s, now, '30d', 'All'), [s.incidents, s.branchHealth, Math.floor(now / 60000)]);
  const tm = useMemo(() => thenModel('90d', 'All'), []), t12 = useMemo(() => thenModel('12m', 'All'), []);
  const xm = useMemo(() => nextModel(s, now, '7d', 'All'), [s.incidents, Math.floor(now / 60000)]);
  const x90 = useMemo(() => nextModel(s, now, '90d', 'All'), [s.incidents, Math.floor(now / 60000)]);
  const tc = todayCounts(L, s);
  const dark7 = [...s.incidents, ...s.resolved].filter(i => i.kind === 'edgedown' && now - i.opened < 7 * 86400e3).length, planned = Math.round(tm.rolls * 0.28) + xm.acc.visits;
  const overnight = s.incidents.filter(i => now - i.opened < 12 * 3600e3).length;
  const base = {
    avail: [pc(nm.avail['30d'], 3), 'month to date'], outages: [`${Math.round(dark7 * 30 / 7)}`, `stores down unplanned, from the last 7 days (${dark7})`], mttr: [`${tm.mttrP1.toFixed(1)} h P1, ${tm.mttrP.P3.toFixed(1)} h P3`, '90 days'],
    planned: [`${Math.round(planned / Math.max(1, tm.rolls) * 100)}% planned`, `${num(planned)} of ${num(tm.rolls)} visits, 90 days`], prevented: [`${xm.acc.avoided} of ${xm.acc.flagged}`, 'month to date'], repeat: [`${tm.repeatStores.filter(x => x.repeat).length} stores, ${tm.repeatLines.length} lines`, '90 days'],
    slaAtt: [pc(tm.sla, 1), '90 days, resolution'], noise: [`${Math.round(tc.events / Math.max(1, tc.inc))} : 1`, `today: ${num(tc.events)} events, ${tc.inc} incidents`],
  };
  return (
    <div>
      <section className="bg-panel border border-line rounded-lg p-5 border-l-4 border-l-brand"><h1 className="text-[24px] font-bold text-ink" style={DISPLAY}>Governance, personas and reporting cadence</h1><p className="text-[14px] text-ink2 mt-1 max-w-[980px]">The dashboards become part of how SRS and Movate run the service together, with each audience getting the view and the rhythm it needs. Success is measured by fewer store outages, faster restoration and more planned work over unplanned work.</p></section>
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-3 mt-3">
        <Box title="Personas" sub="Who uses which lens, for what, and how often. Click a lens to open it.">
          <T cols={[{ k: 'p', l: 'Persona', f: r => <b className="text-ink">{r.p}</b> }, { k: 'lens', l: 'Primary lens', f: r => <div className="flex gap-1 flex-wrap">{r.lens.map(l => <button key={l} onClick={() => go(l)} className="text-[11.5px] font-semibold border border-line rounded px-1.5 py-0.5 hover:bg-chip capitalize">{l}</button>)}</div> }, { k: 'use', l: 'What they use it for', cls: 'text-ink2' }, { k: 'cad', l: 'Cadence', cls: 'text-ink2' }]} rows={PERSONAS} />
        </Box>
        <Box title="Governance rhythm" sub="What each meeting looks at, from today's data.">
          <ol className="space-y-2 text-[12.5px]">{[
            ['Daily', 'NOC stand-up', `Overnight events (${overnight} incidents opened in the last 12 hours) and today's ${xm.high.length} high-risk stores.`, 'now'],
            ['Weekly', 'Joint risk review with SRS network engineering', `Agree the proactive actions for ${xm.high.length + xm.med.length} at-risk stores and the field schedule.`, 'next'],
            ['Monthly', 'Service review', `SLAs (${pc(tm.sla, 1)}), trends, ${tm.repeatStores.length} repeat offenders, improvements delivered.`, 'then'],
            ['Quarterly', 'Business review', `Availability outcomes, ${xm.acc.avoided} avoided outages, ${x90.upgrades.length} capacity upgrades due in 90 days and the refresh plan (${num(xm.eos.length)} devices), roadmap.`, 'then'],
          ].map(([a, b, c, l]) => <li key={a}><button onClick={() => go(l)} className="w-full text-left flex gap-2.5 hover:bg-chip/50 rounded p-1"><Pill tone="blue">{a}</Pill><span><b className="text-ink">{b}.</b> <span className="text-ink2">{c}</span></span></button></li>)}</ol>
        </Box>
      </div>
      <Box className="mt-3" title="Business outcomes and KPIs" sub="Each KPI is baselined from SRS's own OpsRamp and ServiceNow history in the first phase; targets are agreed jointly against that baseline. The definitions are the shared KPI dictionary.">
        <T cols={[{ k: 'name', l: 'KPI', f: r => <b className="text-ink">{r.name}</b> }, { k: 'lens', l: 'Lens that drives it' }, { k: 'dir', l: 'Target direction', f: r => <Pill tone="green">{r.dir}</Pill> }, { k: 'base', l: 'Baseline today', f: r => <span><b className="text-ink">{base[r.k][0]}</b><span className="block text-[11px] text-ink3">{base[r.k][1]}</span></span> }, { k: 'def', l: 'Definition', cls: 'text-ink2 text-[12px]' }]} rows={KPIS} />
      </Box>
      <Box className="mt-3" title="Data governance and security" sub="How access, definitions and hosting are controlled.">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 text-[12.5px]">{[
          [I.KeyRound, 'Role-based access with SSO', 'Aligned to SRS identity, so each persona sees only what it needs. The role dashboards already work this way.'],
          [I.BookOpen, 'Agreed KPI definitions', `Documented and agreed with SRS: how availability, MTTR and avoided outages are calculated. ${KPIS.length} KPIs in the dictionary above.`],
          [I.Cloud, 'SRS-approved cloud tenant', 'Data hosted in an SRS-approved tenant, with retention and audit logging set to SRS policy.'],
          [I.Lock, 'Read-only integration accounts', 'On OpsRamp and ServiceNow, following least-privilege principles.'],
        ].map(([Ic, a, b]) => <div key={a} className="border border-line rounded-lg p-3"><div className="flex items-center gap-1.5 font-bold text-ink"><Ic size={14} className="text-brand" />{a}</div><div className="text-ink2 mt-1">{b}</div></div>)}</div>
      </Box>
    </div>
  );
}
