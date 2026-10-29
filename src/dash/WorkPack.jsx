// The onsite work pack as the technician sees it on a tablet, with the six parts Mova iO assembled beside it:
// site context, before arrival, diagnostic history, the approved checklist, evidence, and verify + hand-off.
// In the console the Field Technician works the checklist and evidence and runs the return-to-service check; the NOC
// owner accepts the hand-off. Everywhere else it is read-only.
import React, { useContext, useState } from 'react';
import * as I from 'lucide-react';
import * as D from '../data.js';
import { cx, Btn, Logo } from '../ui.jsx';
import { ROLES } from '../store.jsx';
import { hhmm, dateShort, ago } from '../util.js';
import { DrillLinks } from './links.js';
import { MovaChip } from './Mova.jsx';
import { packOf, briefOf, readingOk, tickStep, addPhoto, setReading, setFindings, returnCheck, acceptHandoff } from './workpack.js';

const TABS = [['summary', 'Summary'], ['overview', 'Overview'], ['before', 'Before arrival'], ['history', 'History'], ['checklist', 'Checklist'], ['evidence', 'Evidence'], ['handoff', 'Hand-off']];
const ST_COL = { ok: 'bg-ok/15 border-ok/40 text-ok', warn: 'bg-warn/15 border-warn/50 text-warn', bad: 'bg-bad/15 border-bad/50 text-bad', fixed: 'bg-ok/15 border-ok/40 text-ok' };
const Sub = ({ children, right }) => <div className="flex items-center gap-2 mt-3 mb-1.5 first:mt-0"><span className="text-[11px] font-bold tracking-[0.08em] uppercase text-ink3 flex-1">{children}</span>{right}</div>;
const KV = ({ rows }) => <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[12.5px]">{rows.map(([k, v]) => <React.Fragment key={k}><dt className="text-ink3 font-semibold whitespace-nowrap">{k}</dt><dd className="text-ink min-w-0 break-words">{v}</dd></React.Fragment>)}</dl>;

export function WorkPackView({ n, go, ctx, ui }) {
  const { s, now } = ctx;
  const { Head, Kpis } = ui;
  const L = useContext(DrillLinks);
  const wo = s.workOrders.find(w => w.id === n.id);
  const [tab, setTab] = useState(n.tab || 'summary');
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
      <Flow />
      <div className="grid lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] gap-5 mt-5 items-start">
        <div className="rounded-[22px] border-[9px] border-[#1d2333] bg-panel shadow-xl overflow-hidden">
          <div className="bg-[#1f2a44] text-white px-4 py-3 flex items-center gap-3">
            <I.ListChecks size={20} className="shrink-0" />
            <div className="min-w-0"><div className="text-[13px] font-bold tracking-wide uppercase truncate">{P.head}</div><div className="text-[12px] text-white/80 truncate">{P.sub}</div></div>
            <span className="ml-auto"><MovaChip h={9} /></span>
          </div>
          <div role="tablist" className="flex overflow-x-auto border-b border-line bg-panel">{TABS.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={cx('px-3 h-10 text-[12.5px] font-semibold whitespace-nowrap border-b-2 -mb-px', tab === id ? 'border-brand text-brand' : 'border-transparent text-ink2 hover:text-ink')}>{label}</button>)}</div>
          <div className="p-4 min-h-[440px]">
            {tab === 'summary' && (P.brief ? <Brief brief={P.brief} P={P} go={go} /> : <p className="text-[13px] text-ink2">Planned work: {wo.task}. Nothing has failed, so there is nothing to diagnose; the parts, steps and hand-off are in the other tabs.</p>)}
            {tab === 'overview' && <Overview P={P} go={go} />}
            {tab === 'before' && <Before P={P} />}
            {tab === 'history' && <History P={P} go={go} />}
            {tab === 'checklist' && <Checklist P={P} wo={wo} act={act} canWork={canWork} />}
            {tab === 'evidence' && <Evidence P={P} wo={wo} act={act} canWork={canWork} />}
            {tab === 'handoff' && <Handoff P={P} wo={wo} s={s} act={act} canWork={canWork} canAccept={canAccept} />}
          </div>
          {act && !canWork && !closed && <div className="border-t border-line px-4 py-2 text-[11.5px] text-ink3 flex items-center gap-2 flex-wrap">{role === 'tech' ? null : <><I.Info size={13} /><span>{roleName}: {['noc', 'l3'].includes(role) ? 'you accept the hand-off; the technician works the checklist and evidence.' : 'view only.'}</span>{['noc', 'l3'].includes(role) && <button onClick={() => act.set({ role: 'tech' })} className="font-semibold text-brand hover:underline">See it as the technician</button>}</>}</div>}
          {!act && <div className="border-t border-line px-4 py-2 text-[11.5px] text-ink3 flex items-center gap-2"><I.Eye size={13} />Read-only view. The technician works this pack in the field app; the NOC owner accepts the hand-off in the console.</div>}
        </div>
        <ol className="space-y-2">
          <li><button onClick={() => setTab('summary')} className={cx('w-full text-left rounded-md border overflow-hidden flex bg-brand/[0.06]', tab === 'summary' ? 'border-brand ring-1 ring-brand/30' : 'border-brand/40 hover:border-brand')}>
            <span className="w-11 shrink-0 grid place-items-center bg-[#1f2a44] text-white"><I.Sparkles size={18} /></span>
            <span className="px-3 py-2 min-w-0"><span className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-ink"><MovaChip h={8} className="normal-case tracking-normal" />Summary for the technician</span><span className="block text-[12.5px] text-ink2 leading-snug">{P.brief ? `Probable problem, ${P.brief.done.length} things already checked or tried remotely, the fix on site and what to bring` : 'Planned work: the task and what to bring'}</span></span>
          </button></li>
          {parts.map(x => (
          <li key={x.id}><button onClick={() => setTab(x.id)} className={cx('w-full text-left rounded-md border bg-panel overflow-hidden flex', tab === x.id ? 'border-brand ring-1 ring-brand/30' : 'border-line hover:border-ink3')}>
            <span className={cx('w-11 shrink-0 grid place-items-center text-[16px] font-bold text-white', x.done && x.n > 3 ? 'bg-ok' : 'bg-brand')}>{x.done && x.n > 3 ? <I.Check size={18} /> : x.n}</span>
            <span className="px-3 py-2 min-w-0"><span className="block text-[12px] font-bold uppercase tracking-wide text-ink">{x.title}</span><span className="block text-[12.5px] text-ink2 leading-snug">{x.text}</span></span>
          </button></li>))}
          <li className="rounded-md bg-brand text-white text-[13px] font-semibold px-3 py-2.5 text-center">Less repeated investigation. Better repair preparation. Visible ownership.</li>
        </ol>
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

function Overview({ P, go }) {
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      <div><Sub>Site</Sub><KV rows={P.site} /></div>
      <div>
        <Sub>Network path</Sub>
        <div className="flex items-center gap-1">{P.path.map((x, i) => <React.Fragment key={x.label}>{i > 0 && <span className="w-2 h-px bg-ink3" />}<span className={cx('flex-1 text-center text-[11px] font-semibold rounded border px-1 py-1.5', ST_COL[x.st] || ST_COL.ok)}>{x.label}</span></React.Fragment>)}</div>
        <p className="text-[11px] text-ink3 mt-1">Red: where Mova iO found the fault. Amber: affected.</p>
        <Sub>Key devices</Sub>
        <ul className="space-y-1.5">{P.devices.map(d => (
          <li key={d.id}><button onClick={() => go({ t: 'device', id: d.id })} className="w-full text-left flex items-start gap-2 text-[12.5px] hover:bg-chip/60 rounded px-1 -mx-1 py-0.5">
            {d.kind === 'SD-WAN appliance' ? <I.Globe size={15} className="mt-0.5 shrink-0 text-ink2" /> : d.kind === 'Access point' ? <I.Wifi size={15} className="mt-0.5 shrink-0 text-ink2" /> : <I.Server size={15} className="mt-0.5 shrink-0 text-ink2" />}
            <span className="min-w-0"><b className="text-ink">{d.kind}</b> <span className="font-mono text-ink2">{d.id}</span>{d.fault && <span className="ml-1 text-[10.5px] font-bold text-bad uppercase">fault</span>}<span className="block text-[11.5px] text-ink3">{d.model} · serial {d.serial} · {d.where}</span></span>
          </button></li>))}</ul>
      </div>
    </div>
  );
}

function Before({ P }) {
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      <div>
        <Sub>Authorised access</Sub>
        <ul className="space-y-1 text-[12.5px]">{P.before.access.map(x => <li key={x} className="flex items-start gap-1.5"><I.CheckCircle2 size={14} className="mt-0.5 text-ok shrink-0" /><span className="text-ink">{x}</span></li>)}</ul>
        <Sub>Appointment</Sub><KV rows={P.before.appointment} />
      </div>
      <div>
        <Sub right={<MovaChip agent="dispatch" h={8} />}>Parts checklist</Sub>
        {P.before.parts.length ? <ul className="space-y-1 text-[12.5px]">{P.before.parts.map(x => <li key={x.part} className="flex items-center gap-1.5"><I.Package size={14} className="text-info shrink-0" /><b className="text-ink">{x.qty} × {x.part}</b><span className="text-ink2">from {x.from}</span>{x.reserved && <span className="ml-auto text-[10.5px] font-bold text-ok uppercase">reserved</span>}</li>)}</ul> : <p className="text-[12.5px] text-ink2">No parts needed.</p>}
        <Sub>Tools</Sub>
        <div className="flex flex-wrap gap-1.5">{P.before.tools.map(x => <span key={x} className="text-[11.5px] px-1.5 py-[1px] rounded border border-line bg-chip text-ink2">{x}</span>)}</div>
      </div>
    </div>
  );
}

function History({ P, go }) {
  const h = P.history;
  if (!h) return <p className="text-[13px] text-ink2">Planned work with no fault behind it, so there is no diagnostic history. The checklist and the install notes are in the other tabs.</p>;
  return (
    <div>
      <div className="rounded-md border border-bad/40 bg-bad/5 px-3 py-2">
        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-bad"><MovaChip agent="diagnosis" h={8} className="normal-case tracking-normal" />Root cause · {h.cause.layer} · {Math.round(h.cause.conf * 100)}%</div>
        <button onClick={() => go({ t: 'rca', id: P.inc.id })} className="text-left text-[13.5px] font-semibold text-ink hover:underline">{h.cause.text}</button>
        {h.cause.ev && <div className="text-[12px] text-ink2">{h.cause.ev}</div>}
      </div>
      <Sub right={<Logo k="opsramp" h={10} />}>Findings</Sub>
      <ol className="space-y-1">{h.findings.map((x, i) => <li key={i} className="grid grid-cols-[42px_minmax(0,1fr)] gap-2 text-[12.5px]"><span className="font-mono text-ink3">{hhmm(x.t)}</span><span><span className="text-ink">{x.text}</span><span className="text-ink3"> · {x.src}</span></span></li>)}</ol>
      {h.tried.length > 0 && <><Sub>Already tried or under way</Sub><ul className="space-y-0.5 text-[12.5px] text-ink">{h.tried.map(x => <li key={x} className="flex items-start gap-1.5"><I.Dot size={16} className="text-ink3 shrink-0" />{x}</li>)}</ul></>}
      <Sub right={<Logo k="servicenow" h={10} />}>Earlier incidents here, 90 days</Sub>
      {h.prior.length ? <ul className="space-y-1">{h.prior.map(x => <li key={x.id}><button onClick={() => go({ t: 'incident', id: x.id })} className="text-left text-[12.5px] hover:underline"><span className="font-mono text-ink2">{x.id}</span> <span className="text-ink">{x.title}</span><span className="text-ink3"> · {dateShort(x.opened)} · {x.closeCode}</span></button></li>)}</ul> : <p className="text-[12.5px] text-ink2">None: this is the first fault here in 90 days.</p>}
    </div>
  );
}

function Checklist({ P, wo, act, canWork }) {
  const st = P.pk.steps || {};
  return (
    <div>
      <div className="rounded-md border border-ok/40 bg-ok/5 px-3 py-2 text-[12.5px] text-ink flex items-start gap-2"><I.ShieldCheck size={15} className="text-ok mt-0.5 shrink-0" /><span><b>Approved scope.</b> Approved by {P.scope.by.replace(/ \(NOC Engineer\)| \(Network Engineer L3\)/, '')} at {hhmm(P.scope.at)} CT. Safe steps stay inside this scope: anything else (config changes, other devices, cabling not listed) needs the NOC engineer's OK first.</span></div>
      <ol className="mt-3 space-y-1.5">{P.plan.steps.map((x, i) => {
        const d = st[i];
        return (
          <li key={i}><button disabled={!canWork} onClick={() => tickStep(act, wo, i, act.me())} className={cx('w-full text-left flex items-start gap-2.5 rounded-md border px-3 py-2 text-[12.5px]', d ? 'border-ok/40 bg-ok/5' : 'border-line', canWork && 'hover:bg-chip/60')}>
            <span className={cx('w-5 h-5 rounded-full border-2 grid place-items-center shrink-0 mt-[1px]', d ? 'bg-ok border-ok text-white' : 'border-ink3 text-ink3')}>{d ? <I.Check size={12} /> : <span className="text-[10px] font-bold">{i + 1}</span>}</span>
            <span className="min-w-0 flex-1"><span className="text-ink">{x}</span>{d && <span className="block text-[11px] text-ink3">Done {hhmm(d.t)} CT</span>}</span>
          </button></li>);
      })}</ol>
      {!canWork && <p className="text-[11.5px] text-ink3 mt-2">The technician ticks each step on site.</p>}
    </div>
  );
}

function Evidence({ P, wo, act, canWork }) {
  const pk = P.pk, got = Object.fromEntries((pk.photos || []).map(x => [x.label, x]));
  const [txt, setTxt] = useState(pk.findings || '');
  return (
    <div>
      <Sub>Photos</Sub>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{P.plan.photos.map(l => got[l] ? (
        <div key={l} className="rounded-md border border-ok/40 overflow-hidden"><div className="h-16 bg-gradient-to-br from-ink3/30 to-ink3/10 grid place-items-center"><I.Image size={22} className="text-ink2" /></div><div className="px-2 py-1 text-[11px] text-ink"><b>{l}</b><span className="block text-ink3">{hhmm(got[l].t)} CT</span></div></div>
      ) : (
        <button key={l} disabled={!canWork} onClick={() => addPhoto(act, wo, l)} className={cx('rounded-md border-2 border-dashed border-line h-[92px] flex flex-col items-center justify-center gap-1 text-[11px] text-ink2 px-2 text-center', canWork && 'hover:border-brand hover:text-brand')}><I.Camera size={20} />{l}</button>
      ))}</div>
      <Sub right={<MovaChip agent="verify" h={8} />}>Readings</Sub>
      <div className="space-y-2">{P.plan.readings.map(r => {
        const v = (pk.readings || {})[r.key], ok = readingOk(r, v);
        return (
          <div key={r.key} className="flex flex-wrap items-center gap-2 text-[12.5px]">
            <span className="text-ink flex-1 min-w-[180px]">{r.label}{r.unit && <span className="text-ink3"> ({r.lo === r.hi ? `${r.hi}` : `${r.lo} to ${r.hi}`} {r.unit})</span>}</span>
            {r.kind === 'pass' ? ['Pass', 'Fail'].map(o => <button key={o} disabled={!canWork} onClick={() => setReading(act, wo, r.key, o)} className={cx('h-7 px-2.5 rounded border text-[12px] font-semibold', v === o ? (o === 'Pass' ? 'bg-ok text-white border-ok' : 'bg-bad text-white border-bad') : 'border-line text-ink2')}>{o}</button>)
              : <input disabled={!canWork} value={v ?? ''} onChange={e => setReading(act, wo, r.key, e.target.value)} inputMode={r.kind === 'text' ? 'text' : 'decimal'} placeholder={r.kind === 'text' ? 'type it' : r.unit} className="h-7 w-32 px-2 rounded border border-line bg-canvas text-ink text-[12.5px] outline-none focus:border-brand disabled:opacity-70" />}
            <span className={cx('w-5', ok === true ? 'text-ok' : ok === false ? 'text-bad' : 'text-ink3')}>{ok === true ? <I.CheckCircle2 size={16} /> : ok === false ? <I.XCircle size={16} /> : <I.Circle size={16} />}</span>
          </div>);
      })}</div>
      <Sub>Technician findings</Sub>
      <textarea disabled={!canWork} value={canWork ? txt : (pk.findings || '')} onChange={e => setTxt(e.target.value)} onBlur={() => canWork && setFindings(act, wo, txt)} rows={3} placeholder={canWork ? 'What you found and what you did' : 'Written by the technician on site'} className="w-full rounded-md border border-line bg-canvas text-ink text-[12.5px] px-3 py-2 outline-none focus:border-brand disabled:opacity-80" />
    </div>
  );
}

function Handoff({ P, wo, s, act, canWork, canAccept }) {
  const pk = P.pk, check = pk.check;
  return (
    <div>
      <Sub right={<MovaChip agent="verify" h={8} />}>Return-to-service check</Sub>
      <ul className="space-y-1 text-[12.5px]">{P.verify.map(v => { const pass = check && check.pass; return <li key={v} className="flex items-center gap-2">{pass ? <I.CheckCircle2 size={15} className="text-ok" /> : <I.Circle size={15} className="text-ink3" />}<span className="text-ink">{v}</span></li>; })}</ul>
      {check && !check.pass && <div className="mt-2 rounded-md border border-warn/40 bg-warn/5 px-3 py-2 text-[12px] text-ink"><b>Not passed yet:</b> {check.missing.join('; ')}.</div>}
      {check && check.pass && <div className="mt-2 rounded-md border border-ok/40 bg-ok/5 px-3 py-2 text-[12px] text-ink flex items-center gap-2"><I.CheckCircle2 size={15} className="text-ok" />Passed at {hhmm(check.t)} CT: every step done, readings in range, photos and findings on the work order.</div>}
      {canWork && !pk.accepted && <Btn className="mt-3" kind="brand" icon={I.ShieldCheck} onClick={() => returnCheck(act, s, wo, P)}>Run the return-to-service check</Btn>}
      <Sub>Receiving owner</Sub>
      <p className="text-[12.5px] text-ink">{P.owner ? <><b>{P.owner}</b>{P.team ? ` (${P.team.name})` : ''} owns the ticket and accepts the work.</> : 'The NOC accepts the work.'}</p>
      {pk.accepted ? <div className="mt-2 rounded-md border border-ok/40 bg-ok/5 px-3 py-2 text-[12.5px] text-ink flex items-center gap-2"><I.BadgeCheck size={16} className="text-ok" />Accepted by {pk.accepted.by}{pk.accepted.for ? ` for ${pk.accepted.for}` : ''} at {hhmm(pk.accepted.t)} CT. {wo.id} closed{P.inc ? `; ${P.inc.id} resolved` : ''}.</div>
        : canAccept ? <Btn className="mt-2" kind="ok" icon={I.BadgeCheck} disabled={!(check && check.pass)} title={check && check.pass ? undefined : 'Waits for the return-to-service check to pass'} onClick={() => acceptHandoff(act, s, wo, P)}>{P.owner && act.me().indexOf(P.owner) !== 0 ? `Accept the hand-off for ${P.owner}` : 'Accept the hand-off'}</Btn>
          : <p className="text-[11.5px] text-ink3 mt-1">The owner accepts once the return check passes.</p>}
      {wo.parts.length > 0 && <><Sub>Returns</Sub><p className="text-[12.5px] text-ink2">The faulty {wo.parts.join(', ')} goes back {P.inc && P.inc.vendorCase ? `to HPE on case ${P.inc.vendorCase}` : 'to the depot'} with the RMA label from the pack.</p></>}
      <Sub>Something outside the approved steps?</Sub>
      <p className="text-[12.5px] text-ink2">Call the NOC engineer from the ticket. Mova iO adds the change to the pack once the engineer approves it.</p>
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
