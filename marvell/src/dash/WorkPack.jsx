// The onsite work pack as the technician sees it on the phone (the same field app as Field Dispatch), with the six
// parts Mova iO assembled beside it: site context, before arrival, diagnostic history, the approved checklist, evidence, and verify + hand-off.
// In the console the Field Technician works the checklist and evidence and runs the return-to-service check; the NOC
// owner accepts the hand-off. Everywhere else it is read-only.
import React, { useContext, useState } from 'react';
import * as I from 'lucide-react';
import { cx, Logo } from '../ui.jsx';
import { ROLES } from '../store.jsx';
import { hhmm } from '../util.js';
import { DrillLinks } from './links.js';
import { MovaChip } from './Mova.jsx';
import { EscalateButton, EscalationBanner, aboutOf } from '../escalate.jsx';
import { PhoneApp } from '../fieldvisit.jsx';
import { packOf, readingOk } from './workpack.js';

// each part of the pack, and the phone tab that holds it
const PH = { summary: 'brief', overview: 'site', before: 'travel', history: 'brief', checklist: 'work', evidence: 'work', handoff: 'done' };
const Sub = ({ children, right }) => <div className="flex items-center gap-2 mt-3 mb-1.5 first:mt-0"><span className="text-[11px] font-bold tracking-[0.08em] uppercase text-ink3 flex-1">{children}</span>{right}</div>;

export function WorkPackView({ n, go, ctx, ui }) {
  const { s, now } = ctx;
  const { Head, Kpis } = ui;
  const L = useContext(DrillLinks);
  const wo = s.workOrders.find(w => w.id === n.id);
  const [ptab, setPtab] = useState(PH[n.tab || 'summary'] || 'brief');
  if (!wo) return <p>Work order not found.</p>;
  const P = packOf(s, wo, now);
  const act = L && L.act, role = L && L.role ? L.role() : null;
  const roleName = role && (ROLES.find(r => r.id === role) || {}).name;
  const closed = wo.status === 'Completed';
  const canWork = !!(act && role === 'tech' && !closed), canAccept = !!(act && ['noc', 'l3'].includes(role) && !closed);
  const pk = P.pk, check = pk.check;
  const okReadings = P.plan.readings.filter(r => readingOk(r, (pk.readings || {})[r.key]) === true).length;
  const parts = [
    { id: 'overview', n: 1, title: 'Site context', text: 'Branch, circuit ID, demarc and device inventory', done: true },
    { id: 'before', n: 2, title: 'Before arrival', text: `Authorised access, appointment${P.before.parts.length ? ` and ${P.before.parts.map(x => x.part).join(', ')}` : ''}`, done: true },
    { id: 'history', n: 3, title: 'Diagnostic history', text: P.history ? `OpsRamp findings, Mova iO's root cause and ${P.history.prior.length} earlier ServiceNow incident${P.history.prior.length === 1 ? '' : 's'}` : 'Planned work: no fault history', done: true },
    { id: 'checklist', n: 4, title: 'Approved checklist', text: `${P.done} of ${P.plan.steps.length} steps done, inside the approved scope`, done: P.done === P.plan.steps.length },
    { id: 'evidence', n: 5, title: 'Capture evidence', text: `${(pk.photos || []).length} photo${(pk.photos || []).length === 1 ? '' : 's'}, ${okReadings} of ${P.plan.readings.length} readings, ${pk.findings ? 'findings written' : 'no findings yet'}`, done: (pk.photos || []).length >= Math.min(2, P.plan.photos.length) && okReadings === P.plan.readings.length },
    { id: 'handoff', n: 6, title: 'Verify + hand-off', text: pk.accepted ? `Accepted by ${pk.accepted.by.replace(/ \(.*/, '')}` : check ? (check.pass ? 'Return check passed; waiting for the owner to accept' : 'Return check not passed yet') : 'Return-to-service check, then the owner accepts', done: !!pk.accepted },
  ];
  return (
    <div>
      <Head kicker={<button className="hover:underline" onClick={() => go({ t: 'branch', id: P.b.id })}>{P.b.name}</button>} title={`Onsite work pack · ${wo.id}`}
        sub={`Mova iO assembled this pack for ${P.tech ? P.tech.name : 'the technician'} (${P.service.toLowerCase()}), so the visit starts prepared instead of starting the investigation again.`}
        right={L && L.module ? <div className="pt-5"><button onClick={() => L.module('dispatch')} className="h-8 px-2.5 rounded-md border border-line bg-panel hover:bg-chip text-[12px] font-semibold text-ink inline-flex items-center gap-1.5 whitespace-nowrap"><I.ExternalLink size={13} />Open Field Dispatch</button></div> : null}>
        <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12.5px] text-ink2"><span>Assembled by</span><MovaChip agent="dispatch" /><span>from OpsRamp findings, the ServiceNow CMDB and history, Orchestrator, Aruba Central and the carrier case; kept up to date by the</span><MovaChip agent="ticket" /></div>
      </Head>
      <Kpis go={go} items={[
        { label: 'Technician', value: P.tech ? P.tech.name : 'Not assigned', tone: P.tech ? null : 'warn', sub: P.tech ? `${P.tech.base} · ${wo.status.toLowerCase()}` : 'waiting for a match' },
        { label: 'Arrives', value: closed ? 'Done' : wo.status === 'On site' ? 'On site' : wo.eta ? hhmm(wo.eta) : '—', sub: !closed && wo.status !== 'On site' && wo.eta ? 'Central time' : wo.window },
        { label: 'Checklist', value: `${P.done}/${P.plan.steps.length}`, tone: P.done === P.plan.steps.length ? 'ok' : P.done ? 'warn' : null },
        { label: 'Evidence', value: String(P.ev), sub: 'photos, readings, findings' },
        { label: 'Return check', value: check ? (check.pass ? 'Passed' : 'Not yet') : 'Pending', tone: check ? (check.pass ? 'ok' : 'warn') : null },
        { label: 'Owner accepts', value: pk.accepted ? 'Accepted' : 'Waiting', tone: pk.accepted ? 'ok' : null, sub: P.owner || 'NOC', go: P.inc ? { t: 'incident', id: P.inc.id } : null },
      ]} />
      <EscalationBanner id={wo.id} inc={wo.inc} className="mt-4" />
      <Flow />
      <div className="grid lg:grid-cols-[338px_minmax(0,1fr)] gap-5 mt-5 items-start">
        <PhoneApp wo={wo} s={s} now={now} act={act} role={role} go={go} tab={ptab} setTab={setPtab} />
        <div>
        <ol className="space-y-2">
          <li><button onClick={() => setPtab('brief')} className={cx('w-full text-left rounded-md border overflow-hidden flex bg-brand/[0.06]', ptab === 'brief' ? 'border-brand ring-1 ring-brand/30' : 'border-brand/40 hover:border-brand')}>
            <span className="w-11 shrink-0 grid place-items-center bg-[#1f2a44] text-white"><I.Sparkles size={18} /></span>
            <span className="px-3 py-2 min-w-0"><span className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-ink"><MovaChip h={8} className="normal-case tracking-normal" />Summary for the technician</span><span className="block text-[12.5px] text-ink2 leading-snug">{P.brief ? `Probable problem, ${P.brief.done.length} things already checked or tried remotely, the fix on site and what to bring` : 'Planned work: the task and what to bring'}</span></span>
          </button></li>
          {parts.map(x => (
          <li key={x.id}><button onClick={() => setPtab(PH[x.id])} className={cx('w-full text-left rounded-md border bg-panel overflow-hidden flex', ptab === PH[x.id] ? 'border-brand ring-1 ring-brand/30' : 'border-line hover:border-ink3')}>
            <span className={cx('w-11 shrink-0 grid place-items-center text-[16px] font-bold text-white', x.done && x.n > 3 ? 'bg-ok' : 'bg-brand')}>{x.done && x.n > 3 ? <I.Check size={18} /> : x.n}</span>
            <span className="px-3 py-2 min-w-0"><span className="block text-[12px] font-bold uppercase tracking-wide text-ink">{x.title}</span><span className="block text-[12.5px] text-ink2 leading-snug">{x.text}</span></span>
          </button></li>))}
          <li className="rounded-md bg-brand text-white text-[13px] font-semibold px-3 py-2.5 text-center">Less repeated investigation. Better repair preparation. Visible ownership.</li>
        </ol>
            {act && !canWork && !closed && <div className="rounded-md border border-line bg-panel px-3 py-2 mt-2 text-[11.5px] text-ink3 flex items-center gap-2 flex-wrap">{role === 'tech' ? null : <><I.Info size={13} /><span>{roleName}: {['noc', 'l3'].includes(role) ? 'you accept the hand-off; the technician works the checklist and evidence.' : 'SRS view: escalate to Movate if you need something done.'}</span>{!['noc', 'l3'].includes(role) && <EscalateButton about={() => aboutOf(s, { t: 'workpack', id: wo.id })} />}{['noc', 'l3'].includes(role) && <button onClick={() => act.set({ role: 'tech' })} className="font-semibold text-brand hover:underline">See it as the technician</button>}</>}</div>}
            {!act && <div className="rounded-md border border-line bg-panel px-3 py-2 mt-2 text-[11.5px] text-ink3 flex items-center gap-2 flex-wrap"><I.Eye size={13} /><span className="flex-1">SRS view: the technician works this pack in the field app and Movate accepts the hand-off.</span><EscalateButton about={() => aboutOf(s, { t: 'workpack', id: wo.id })} /></div>}
        </div>
      </div>
    </div>
  );
}

function Flow() {
  const Step = ({ logo, icon: Ic, title, text }) => <div className="flex items-center gap-2 min-w-0">{logo ? <Logo k={logo} h={12} /> : <Ic size={18} className="text-ink shrink-0" />}{title && <b className="text-[12.5px] text-ink whitespace-nowrap">{title}</b>}<span className="text-[12px] text-ink2 leading-tight">{text}</span></div>;
  const Arrow = () => <I.ArrowRight size={16} className="text-brand shrink-0 hidden md:block" />;
  return (
    <div className="mt-5 rounded-md border border-line bg-panel px-3 py-2.5 flex flex-col md:flex-row md:items-center gap-2 md:gap-3">
      <Step logo="opsramp" text="Findings and checks" /><Arrow />
      <Step logo="movaio" text="Assembles and explains the work pack" /><Arrow />
      <Step logo="servicenow" text="Work order and evidence" /><Arrow />
      <Step icon={I.Users} text="Technician + engineer: repair authority" />
    </div>
  );
}

// Mova iO's summary for the technician: the probable problem, what was already checked or tried remotely and what it
// showed, the fix to carry out on site, and what to bring. Also shown, shorter, when the NOC reviews the dispatch.
const DONE_ICON = { bad: [I.XCircle, 'text-bad', 'found the fault here'], ok: [I.CheckCircle2, 'text-ok', 'ruled out or done'], info: [I.Clock, 'text-info', 'under way'] };
export function Brief({ brief, P, go, compact }) {
  const pct = x => `${Math.round((x || 0) * 100)}%`;
  return (
    <div className={compact ? 'text-[12.5px]' : ''}>
      <div className="rounded-md border border-bad/40 bg-bad/5 px-3 py-2">
        <div className="flex items-center gap-1.5 flex-wrap text-[11px] font-bold uppercase tracking-wider text-bad"><MovaChip agent="diagnosis" h={8} className="normal-case tracking-normal" />Probable problem · {brief.problem.layer} · {pct(brief.problem.conf)}</div>
        <div className="text-[14px] font-semibold text-ink leading-snug">{go && P && P.inc ? <button onClick={() => go({ t: 'rca', id: P.inc.id })} className="text-left hover:underline">{brief.problem.text}</button> : brief.problem.text}</div>
        {brief.problem.ev && <div className="text-[12px] text-ink2">{brief.problem.ev}</div>}
        {brief.unlikely.length > 0 && <div className="text-[11.5px] text-ink3 mt-1">Less likely: {brief.unlikely.map(u => `${u.text} (${pct(u.conf)})`).join('; ')}</div>}
      </div>
      <Sub right={!compact && <span className="flex items-center gap-2 text-[10.5px] text-ink3 normal-case tracking-normal font-normal">{Object.values(DONE_ICON).map(([Ic, c, l]) => <span key={l} className="inline-flex items-center gap-1"><Ic size={11} className={c} />{l}</span>)}</span>}>Already checked or tried remotely</Sub>
      <ul className="space-y-1">{brief.done.map((x, i) => { const [Ic, c] = DONE_ICON[x.tone] || DONE_ICON.info; return (
        <li key={i} className="flex items-start gap-2 text-[12.5px]"><Ic size={15} className={cx('mt-[1px] shrink-0', c)} /><span className="min-w-0"><span className="text-ink font-semibold">{x.what}.</span> <span className="text-ink2">{x.found}</span></span></li>); })}</ul>
      <Sub right={<MovaChip agent="triage" h={8} />}>Fix on site</Sub>
      <div className="rounded-md border border-brand/40 bg-brand/[0.04] px-3 py-2">
        <div className="text-[13.5px] font-bold text-ink leading-snug flex items-start gap-1.5"><I.Wrench size={15} className="mt-0.5 shrink-0 text-brand" />{brief.fix}</div>
        <div className="text-[12px] text-ink2 mt-1"><b className="text-ink">Plan B:</b> {brief.ifNot}</div>
      </div>
      <Sub right={<MovaChip agent="dispatch" h={8} />}>Bring</Sub>
      <ul className="space-y-1 text-[12.5px]">
        {brief.parts.length ? brief.parts.map(x => { const r = P && P.before.parts.find(y => y.part === x.part); return <li key={x.part} className="flex items-center gap-1.5 flex-wrap"><I.Package size={14} className="text-info shrink-0" /><b className="text-ink">1 × {x.part}</b><span className="text-ink2">the replacement</span>{r ? <span className={cx('text-[11px] font-semibold', r.reserved ? 'text-ok' : 'text-ink3')}>{r.reserved ? `reserved at ${r.from}` : P.tech ? 'from the nearest depot' : 'reserved at the depot once a technician is assigned'}</span> : <span className="text-[11px] text-ink3">reserved at the depot when the visit is approved</span>}</li>; }) : <li className="text-ink2">No replacement part needed.</li>}
        {brief.extra.length > 0 && <li className="flex items-start gap-1.5"><I.PackagePlus size={14} className="text-ink3 shrink-0 mt-0.5" /><span className="text-ink2"><b className="text-ink">Also bring:</b> {brief.extra.join(', ')}</span></li>}
        {P && !compact && P.before.tools.filter(t => !brief.extra.includes(t)).length > 0 && <li className="flex items-start gap-1.5"><I.Hammer size={14} className="text-ink3 shrink-0 mt-0.5" /><span className="text-ink2"><b className="text-ink">Tools:</b> {P.before.tools.filter(t => !brief.extra.includes(t)).join(', ')}</span></li>}
      </ul>
    </div>
  );
}
