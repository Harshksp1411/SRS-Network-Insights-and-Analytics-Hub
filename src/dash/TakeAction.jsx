// "Take action": the step after the root cause. It recommends who fixes it (automation, an NOC engineer, a network SME,
// a field engineer on site, the carrier, application support or security), says whether it can be fixed remotely,
// and in the console lets the NOC hand the ticket over, book a technician with the spare, or open or escalate a
// carrier case. Each action writes to the ticket, the work order or the carrier case and the audit log. On the role
// dashboards, and for roles that cannot act, it shows the same plan read-only.
import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as I from 'lucide-react';
import * as D from '../data.js';
import { cx, Btn } from '../ui.jsx';
import { ROLES } from '../store.jsx';
import { hhmm } from '../util.js';
import { rootOf } from './drilldata.js';
import { DrillLinks } from './links.js';
import { fixPlan, peopleOf, rankTechs, visitWindow, etaText, arriveText, trailOf, handOff, dispatchVisit, carrierCase, vendorCase, tellSecurity, STATE, CAN } from './fix.js';

const TONE = { brand: 'bg-brand text-white border-brand', info: 'bg-info/10 text-info border-info/30', ok: 'bg-ok/10 text-ok border-ok/30', warn: 'bg-warn/10 text-warn border-warn/30', muted: 'bg-chip text-ink3 border-line', bad: 'bg-bad/10 text-bad border-bad/30' };
const Tag = ({ st }) => <span className={cx('inline-flex items-center text-[10.5px] font-bold px-1.5 py-[1px] rounded border whitespace-nowrap uppercase tracking-wide', TONE[STATE[st].tone])}>{STATE[st].label}</span>;
const CAN_TEXT = { yes: ['Yes', 'ok'], partly: ['Partly', 'warn'], maybe: ['Maybe', 'warn'], no: ['No', 'bad'] };
const pct = x => `${Math.round((x || 0) * 100)}%`;
const SME_FOR = { scanner: 'Wi-Fi and radio', apdown: 'Wi-Fi and radio', dhcp: 'Change and config', backup: 'Change and config', 'hero-config': 'Change and config', cpu: 'Change and config' };
const label = 'text-[11px] font-bold tracking-[0.08em] uppercase text-ink3';

export function TakeAction({ inc, s, now, go, focus }) {
  const L = useContext(DrillLinks);
  const box = useRef(null);
  const [open, setOpen] = useState(null); // the form that is open: a route id
  const [done, setDone] = useState(null);
  useEffect(() => { if (focus && box.current) { const t = setTimeout(() => box.current && box.current.scrollIntoView({ block: 'start', behavior: 'smooth' }), 80); return () => clearTimeout(t); } }, []);
  const plan = fixPlan(s, inc, now);
  const fixed = inc.state === 'Resolved';
  const trail = trailOf(s, inc);
  const act = L && L.act, role = L && L.role ? L.role() : null;
  const may = what => !!(act && role && (CAN[role] || []).includes(what));
  const roleName = role && (ROLES.find(r => r.id === role) || {}).name;
  const finish = msg => { setOpen(null); setDone(msg); };

  if (fixed) {
    const t = D.teamOf(inc.group);
    return (
      <section ref={box} className="mt-7 scroll-mt-16" aria-label="Who fixed it">
        <Header title="Who fixed it" />
        <div className="rounded-md border border-ok/40 bg-ok/5 p-4">
          <div className="text-[16px] font-bold text-ink leading-snug">{inc.auto ? `Fixed automatically by Mova iO${inc.autoAction ? `: ${inc.autoAction}` : ''}` : `Fixed by ${inc.assignee || 'the NOC'}${t ? ` (${t.name})` : ''}: ${inc.closeCode}`}</div>
          <p className="text-[13px] text-ink2 mt-1">{inc.auto ? 'No ticket was handed to a person: the fix was inside the automation rules, and the checks passed before it closed.' : 'The ticket was closed once the checks passed.'}</p>
        </div>
        <Trail items={trail} />
      </section>
    );
  }

  const recRoute = plan.routes.find(r => r.id === plan.rec);
  const next = plan.routes.filter(r => ['rec', 'first', 'also'].includes(r.st) || r.id === plan.rec).sort((a, b) => (b.id === plan.rec) - (a.id === plan.rec));
  const can = CAN_TEXT[plan.remote.can];
  const nocTeam = plan.team && ['l1', 'l2', 'mim'].includes(plan.team.id);
  // the button each route offers, if the role may use it
  const actionOf = r => {
    if (r.st === 'no' || (r.st === 'on' && !['field', 'carrier', 'noc', 'sme'].includes(r.id))) return null;
    if (r.id === 'remote') {
      if (plan.apr) return { text: `Open approval ${plan.apr.id}`, icon: I.ShieldCheck, need: 'run', run: () => L.module('changes') };
      if (!plan.rb || !r.run || !['rec', 'first'].includes(r.st)) return null;
      return { text: plan.rbOk ? `Run ${plan.rb.id}` : `Approve and run ${plan.rb.id}`, icon: I.Play, need: 'run', run: () => L.incident(inc.id, 'runbook') };
    }
    if (r.id === 'field') return plan.tech ? { text: 'Track the visit', icon: I.Navigation, need: null, run: () => L.module('dispatch') } : { text: plan.wo ? 'Assign a technician' : 'Dispatch an engineer', icon: I.Truck, need: 'field', form: 'field' };
    if (r.id === 'carrier') return { text: plan.cs ? 'Escalate with the carrier' : 'Open a carrier case', icon: plan.cs ? I.ArrowUpCircle : I.RadioTower, need: 'carrier', form: 'carrier' };
    if (r.id === 'noc') return { text: plan.owner && nocTeam ? 'Hand to another engineer' : 'Hand to the NOC', icon: I.UserPlus, need: 'hand', form: 'noc' };
    if (r.id === 'sme') return { text: plan.team && plan.team.id === 'sme' ? 'Hand to another expert' : 'Hand to a network expert', icon: I.GraduationCap, need: 'hand', form: 'sme' };
    if (r.id === 'app') return { text: 'Hand to application support', icon: I.AppWindow, need: 'hand', form: 'app' };
    if (r.id === 'mim') return { text: 'Hand to the major incident manager', icon: I.Megaphone, need: 'hand', form: 'mim' };
    if (r.id === 'oem') return r.st === 'on' ? null : { text: 'Open an HPE case', icon: I.Factory, need: 'vendor', form: 'oem' };
    if (r.id === 'sec') return r.st === 'on' ? null : { text: 'Ask security to review', icon: I.ShieldAlert, need: 'sec', form: 'sec' };
    return null;
  };
  const Action = ({ r, primary, size = 'sm' }) => {
    const a = actionOf(r); if (!a) return null;
    if (!act) return null; // the dashboards are read-only
    const ok = !a.need || may(a.need);
    return <Btn size={size} kind={primary ? 'brand' : 'secondary'} icon={a.icon} disabled={!ok} title={ok ? undefined : `${roleName || 'This role'} can see this but not act on it`} onClick={() => { setDone(null); a.form ? setOpen(open === a.form ? null : a.form) : a.run(); }}>{a.text}</Btn>;
  };

  return (
    <section ref={box} className="mt-7 scroll-mt-16" aria-label="Take action">
      <Header title="Take action: who fixes it" right={<span className="text-[12px] text-ink2 truncate">Ticket owner: <b className="text-ink">{plan.ownerText || 'nobody yet'}</b></span>} />
      <div className="rounded-md border-2 border-brand/40 bg-brand/[0.04] p-4">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={label}>Next step</span>
          {recRoute && <span className="text-[11.5px] font-semibold text-brand">{recRoute.label}</span>}
          <span className="flex-1" />
          <span className="inline-flex items-center gap-1.5 text-[12px] text-ink2">Can it be fixed remotely? <span className={cx('text-[11px] font-bold px-1.5 py-[1px] rounded border', TONE[can[1]])}>{can[0]}</span></span>
        </div>
        <div className="text-[19px] font-bold text-ink leading-snug mt-1">{plan.head}</div>
        <p className="text-[13.5px] text-ink2 leading-relaxed mt-1 max-w-[900px]">{plan.why}</p>
        <p className="text-[12.5px] text-ink2 mt-1.5 flex items-start gap-1.5"><I.Laptop size={14} className="mt-[2px] shrink-0 text-ink3" /><span>{plan.remote.text.replace(/^(Yes|No|Partly|Maybe)\.\s*/, '')}</span></p>
        {act && <div className="flex flex-wrap gap-2 mt-3">{next.map((r, i) => <Action key={r.id} r={r} primary={i === 0} size="md" />)}</div>}
        <p className="text-[12px] text-ink3 mt-3 flex items-start gap-1.5"><I.ShieldCheck size={13} className="mt-[2px] shrink-0" /><span>Movate keeps the ticket end to end, whoever does the work: SRS field services, the carrier or HPE. It closes only after the checks pass.</span></p>
        {done && <div className="mt-3 text-[12.5px] font-semibold text-ok flex items-center gap-1.5" role="status"><I.CheckCircle2 size={15} />{done}</div>}
        {!act && <p className="text-[12px] text-ink3 mt-3 flex items-center gap-1.5"><I.Eye size={13} />Read-only view. The NOC hands tickets over, books field visits and escalates carriers from the operations console; every hand-off shows here as it happens.</p>}
        {act && role && !(CAN[role] || []).length && <p className="text-[12px] text-ink3 mt-3 flex items-center gap-1.5"><I.Lock size={13} />Your role ({roleName}) can see who has the ticket and what happens next. NOC and network engineers hand over, dispatch and escalate.</p>}
      </div>

      {open && <div className="mt-3 rounded-md border border-brand/40 bg-panel p-4">
        {open === 'field' && <FieldForm s={s} inc={inc} plan={plan} now={now} act={act} onCancel={() => setOpen(null)} onDone={finish} />}
        {open === 'carrier' && <CarrierForm s={s} inc={inc} plan={plan} now={now} act={act} onCancel={() => setOpen(null)} onDone={finish} />}
        {open === 'sec' && <SecForm inc={inc} act={act} onCancel={() => setOpen(null)} onDone={finish} />}
        {open === 'oem' && <VendorForm inc={inc} now={now} act={act} onCancel={() => setOpen(null)} onDone={finish} />}
        {['noc', 'sme', 'app', 'mim'].includes(open) && <HandForm s={s} inc={inc} plan={plan} route={open} act={act} onCancel={() => setOpen(null)} onDone={finish} />}
      </div>}

      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2 mt-3">
        {plan.routes.map(r => {
          const Ic = I[r.icon] || I.Circle;
          return (
            <div key={r.id} className={cx('rounded-md border bg-panel p-3 flex flex-col', r.id === plan.rec ? 'border-brand/60 ring-1 ring-brand/30' : 'border-line', r.st === 'no' && 'opacity-60')}>
              <div className="flex items-center gap-2"><Ic size={15} className={r.id === plan.rec ? 'text-brand' : 'text-ink3'} /><b className="text-[13px] text-ink flex-1 min-w-0 truncate">{r.label}</b><Tag st={r.st} /></div>
              <div className="text-[11px] text-ink3 mt-0.5">{r.who}</div>
              <p className="text-[12.5px] text-ink2 leading-snug mt-1.5 flex-1">{r.text}</p>
              {act && actionOf(r) && <div className="mt-2"><Action r={r} /></div>}
            </div>
          );
        })}
      </div>
      <Trail items={trail} />
    </section>
  );
}

function Header({ title, right }) {
  return <div className="flex items-end gap-2 border-b border-line pb-1 mb-2.5"><h3 className="text-[12px] font-bold tracking-[0.1em] uppercase text-ink flex-1">{title}</h3>{right}</div>;
}
function Trail({ items }) {
  return (
    <div className="mt-4">
      <div className={cx(label, 'mb-1.5')}>The ticket so far</div>
      <ol className="border border-line rounded-md bg-panel px-3 py-1.5">{items.map((x, i) => (
        <li key={i} className="grid grid-cols-[52px_minmax(0,1fr)] gap-2 py-1 text-[12.5px] border-b border-line/50 last:border-0">
          <span className="font-mono text-ink3 tabular-nums">{hhmm(x.t)}</span>
          <span className="min-w-0"><span className="text-ink">{x.text}</span><span className="text-ink3"> · {x.who}</span></span>
        </li>))}</ol>
      <p className="text-[11px] text-ink3 mt-1">Central time. Every step is also in the ticket's work notes and the audit log.</p>
    </div>
  );
}
const Radio = ({ on, onClick, children }) => (
  <button type="button" onClick={onClick} aria-pressed={on} className={cx('w-full text-left rounded-md border px-3 py-2 flex items-center gap-2.5 text-[12.5px]', on ? 'border-brand bg-brand/5' : 'border-line hover:bg-chip/60')}>
    <span className={cx('w-3.5 h-3.5 rounded-full border-2 shrink-0', on ? 'border-brand bg-brand' : 'border-ink3')} />{children}
  </button>
);
const Field = ({ title, children, hint }) => <div className="mb-3"><div className="flex items-baseline gap-2 mb-1"><span className={label}>{title}</span>{hint && <span className="text-[11px] text-ink3">{hint}</span>}</div>{children}</div>;
const Area = ({ value, onChange, rows = 3 }) => <textarea value={value} onChange={e => onChange(e.target.value)} rows={rows} className="w-full rounded-md border border-line bg-canvas text-ink text-[12.5px] px-3 py-2 outline-none focus:border-brand leading-snug" />;

// hand the ticket to someone, with the package they need so nobody starts from zero
function HandForm({ s, inc, plan, route, act, onCancel, onDone }) {
  const teams = route === 'noc' ? ['l2', 'l1'] : [route];
  const [tm, setTm] = useState(route === 'noc' ? (plan.team && ['l1', 'l2'].includes(plan.team.id) ? plan.team.id : inc.pri === 'P4' ? 'l1' : 'l2') : route);
  const people = peopleOf(s, tm, route === 'sme' ? (SME_FOR[inc.kind] || 'SD-WAN and routing') : null);
  const firstPick = (people.find(p => p.name !== inc.assignee) || people[0] || {}).name;
  const [who, setWho] = useState(firstPick);
  const { top } = rootOf(inc);
  const r = plan.routes.find(x => x.id === route);
  const tried = [inc.rbState === 'done' && inc.runbook && `${inc.runbook} ran without fixing it`, plan.wo && `field visit ${plan.wo.id}`, plan.cs && `carrier case ${plan.cs.id}`].filter(Boolean);
  const [note, setNote] = useState(`Root cause: ${top.text} (${pct(top.conf)}). ${tried.length ? `Done so far: ${tried.join('; ')}. ` : ''}${r ? `Next: ${r.text.replace(/^Nobody owns it yet\. /, '')}.` : ''}`.replace(/\.\./g, '.'));
  const pick = people.find(p => p.name === who) || people[0];
  return (
    <div>
      <div className="flex items-center gap-2 mb-3"><I.UserPlus size={16} className="text-brand" /><b className="text-[14px] text-ink">Hand {inc.id} to {D.TEAM[tm].name}</b><span className="text-[12px] text-ink3 hidden sm:inline">· {D.TEAM[tm].does}</span></div>
      {teams.length > 1 && <div className="inline-flex rounded-md border border-line overflow-hidden mb-3">{teams.map(t => <button key={t} type="button" onClick={() => { setTm(t); setWho((peopleOf(s, t)[0] || {}).name); }} className={cx('px-3 h-8 text-[12.5px] font-semibold', tm === t ? 'bg-brand text-white' : 'bg-panel text-ink2 hover:bg-chip')}>{D.TEAM[t].name}</button>)}</div>}
      <Field title="Who" hint="least busy first">
        <div className="grid sm:grid-cols-2 gap-1.5">{people.map(p => (
          <Radio key={p.name} on={who === p.name} onClick={() => setWho(p.name)}>
            <span className="flex-1 min-w-0"><b className="text-ink">{p.name}</b>{p.skill && <span className="text-ink3"> · {p.skill}</span>}<span className="block text-[11.5px] text-ink3">{p.status} · {p.load} open ticket{p.load === 1 ? '' : 's'}{p.name === inc.assignee ? ' · has it now' : ''}</span></span>
            {p.match && <span className="text-[10.5px] font-bold text-brand uppercase">Best fit</span>}
          </Radio>))}</div>
      </Field>
      <Field title="Hand-off note" hint="goes on the ticket with the evidence and what was tried"><Area value={note} onChange={setNote} /></Field>
      <div className="flex flex-wrap gap-2">
        <Btn kind="brand" icon={I.Send} disabled={!pick || pick.name === inc.assignee} onClick={() => { handOff(act, inc, tm, pick.name, note); onDone(`Handed to ${pick.name} (${D.TEAM[tm].name}). The hand-off note and the evidence are on the ticket.`); }}>Hand to {pick ? pick.name : '…'}</Btn>
        <Btn onClick={onCancel}>Cancel</Btn>
      </div>
    </div>
  );
}

// book a technician: the job, when the visit may happen, and who can get there with the spare
function FieldForm({ s, inc, plan, now, act, onCancel, onDone }) {
  const base = plan.wo ? { task: plan.wo.task, skills: plan.wo.skills, parts: plan.wo.parts } : plan.job || { task: `Site visit for ${inc.id}: ${inc.title}`, skills: ['Aruba switching'], parts: [] };
  const [task, setTask] = useState(base.task);
  const job = { ...base, task };
  const win0 = visitWindow(s, inc, now);
  const [early, setEarly] = useState(false);
  const win = win0.now || !early ? win0 : { now: true, label: 'Now', why: 'brought forward by the NOC; the branch is told first' };
  const techs = useMemo(() => rankTechs(s, { branchId: inc.branchId, skills: job.skills, parts: job.parts }).slice(0, 4), [inc.id]);
  const [k, setK] = useState(0);
  const r = techs[k];
  const b = D.BR[inc.branchId];
  return (
    <div>
      <div className="flex items-center gap-2 mb-3"><I.Truck size={16} className="text-brand" /><b className="text-[14px] text-ink">{plan.wo ? `Assign a technician to ${plan.wo.id}` : 'Send a field engineer'}</b><span className="text-[12px] text-ink3 hidden sm:inline">· {b.name}, {b.brand}</span></div>
      <Field title="The job" hint="what the technician does on site"><Area value={task} onChange={setTask} rows={2} />
        <div className="flex flex-wrap gap-1.5 mt-1.5 text-[11.5px]">{job.skills.map(x => <span key={x} className="px-1.5 py-[1px] rounded border border-line bg-chip text-ink2">{x}</span>)}{job.parts.map(x => <span key={x} className="px-1.5 py-[1px] rounded border border-info/30 bg-info/10 text-info inline-flex items-center gap-1"><I.Package size={11} />{x}</span>)}</div>
      </Field>
      <Field title="When">
        <div className="text-[12.5px] text-ink2"><b className="text-ink">{win.label}</b>: {win.why}.</div>
        {!win0.now && <label className="mt-1 inline-flex items-center gap-2 text-[12.5px] text-ink2 cursor-pointer"><input type="checkbox" checked={early} onChange={e => setEarly(e.target.checked)} />Go now anyway (the branch manager is told first)</label>}
      </Field>
      <Field title="Technician" hint="skills, distance, who is free and where the spare is">
        <div className="grid sm:grid-cols-2 gap-1.5">{techs.map((x, i) => (
          <Radio key={x.t.id} on={k === i} onClick={() => setK(i)}>
            <span className="flex-1 min-w-0"><b className="text-ink">{x.t.name}</b><span className="text-ink3"> · {x.t.base}</span>
              <span className="block text-[11.5px] text-ink3">{x.t.status} · {Math.round(x.skill * 100)}% of skills · {job.parts.length ? (x.depot ? `spare from ${x.depot.city.split(',')[0]}` : 'no spare in the region') : 'no parts needed'}</span></span>
            <span className="text-right shrink-0"><b className={cx('text-[13px]', x.eta > 300 ? 'text-warn' : 'text-ink')}>{etaText(x.eta)}</b><span className="block text-[10.5px] text-ink3">{Math.round(x.score * 100)}% match</span></span>
          </Radio>))}</div>
      </Field>
      <div className="flex flex-wrap gap-2">
        <Btn kind="brand" icon={I.Truck} disabled={!r} onClick={() => { const id = dispatchVisit(act, s, inc, r, job, win); onDone(`${id}: ${r.t.name} ${win.now ? `is on the way, ${arriveText(r.eta)}` : `is booked ${win.label.toLowerCase()}`}${job.parts.length && r.depot ? `, with the spare from ${r.depot.city.split(',')[0]}` : ''}. It is in Field Dispatch.`); }}>{win.now ? `Dispatch ${r ? r.t.name : ''}` : `Book ${r ? r.t.name : ''} ${win.label.toLowerCase()}`}</Btn>
        <Btn onClick={onCancel}>Cancel</Btn>
      </div>
    </div>
  );
}

// open a carrier case with the evidence, or escalate the one that is open
function CarrierForm({ s, inc, plan, now, act, onCancel, onDone }) {
  const b = D.BR[inc.branchId];
  const cir = D.CIR[inc.ci] || D.CIR[b.wan[0]];
  const reasons = ['Past the promised restore time', 'No update from the carrier for 2 hours', 'Third fault on this line in 30 days', 'Branch trading on its backup line at a busy time'];
  const [why, setWhy] = useState(plan.cs && plan.cs.eta && plan.cs.eta < now ? reasons[0] : (cir.flaps30 || 0) >= 3 ? reasons[2] : reasons[3]);
  if (plan.cs) {
    const lvl = (plan.cs.escal || 0) + 1, to = ['', 'carrier duty manager', 'carrier account manager', 'carrier service director'][Math.min(lvl, 3)];
    return (
      <div>
        <div className="flex items-center gap-2 mb-3"><I.ArrowUpCircle size={16} className="text-brand" /><b className="text-[14px] text-ink">Escalate {plan.cs.carrier} case {plan.cs.id} to the {to}</b></div>
        <p className="text-[12.5px] text-ink2 mb-3">{plan.cs.status}{plan.cs.eta ? `; restore promised by ${hhmm(plan.cs.eta)} CT${plan.cs.eta < now ? ', now late' : ''}` : ''}. Escalations so far: {plan.cs.escal || 0}.</p>
        <Field title="Why"><div className="grid sm:grid-cols-2 gap-1.5">{reasons.map(x => <Radio key={x} on={why === x} onClick={() => setWhy(x)}><span className="text-ink">{x}</span></Radio>)}</div></Field>
        <div className="flex flex-wrap gap-2"><Btn kind="brand" icon={I.ArrowUpCircle} onClick={() => { carrierCase(act, s, inc, why.toLowerCase()); onDone(`${plan.cs.carrier} case ${plan.cs.id} escalated to the ${to}.`); }}>Escalate</Btn><Btn onClick={onCancel}>Cancel</Btn></div>
      </div>
    );
  }
  return (
    <div>
      <div className="flex items-center gap-2 mb-3"><I.RadioTower size={16} className="text-brand" /><b className="text-[14px] text-ink">Open a case with {cir.carrier}</b><span className="text-[12px] text-ink3">· {cir.id}, {cir.type}</span></div>
      <Field title="Evidence sent with the case" hint="so the carrier cannot close it as no fault found">
        <ul className="text-[12.5px] text-ink2 grid sm:grid-cols-2 gap-x-4">{['An hour of loss and delay readings', 'Path test (MTR) from the SD-WAN appliance', 'Interface counters at both ends', 'Timestamps in UTC and Central time'].map(x => <li key={x} className="flex items-center gap-1.5 py-0.5"><I.Check size={13} className="text-ok" />{x}</li>)}</ul>
      </Field>
      <div className="flex flex-wrap gap-2"><Btn kind="brand" icon={I.Send} onClick={() => { const no = carrierCase(act, s, inc); onDone(`${cir.carrier} case ${no} opened with the evidence pack. The ticket is on hold for the carrier.`); }}>Open the case</Btn><Btn onClick={onCancel}>Cancel</Btn></div>
    </div>
  );
}

function SecForm({ inc, act, onCancel, onDone }) {
  const [note, setNote] = useState(`${rootOf(inc).top.text}. Please review the account that made it and whether it should exist.`);
  return (
    <div>
      <div className="flex items-center gap-2 mb-3"><I.ShieldAlert size={16} className="text-brand" /><b className="text-[14px] text-ink">Ask security to review</b><span className="text-[12px] text-ink3">· Omar N., SRS Security Operations. The ticket stays where it is.</span></div>
      <Field title="Note"><Area value={note} onChange={setNote} rows={2} /></Field>
      <div className="flex flex-wrap gap-2"><Btn kind="brand" icon={I.Send} onClick={() => { tellSecurity(act, inc, note); onDone('Security asked to review the change. The ticket stays with its owner.'); }}>Send to security</Btn><Btn onClick={onCancel}>Cancel</Btn></div>
    </div>
  );
}

// a replacement unit or a software fault: the case goes to HPE with what they need to ship on the first call
function VendorForm({ inc, now, act, onCancel, onDone }) {
  const d = D.DEV[inc.ci];
  return (
    <div>
      <div className="flex items-center gap-2 mb-3"><I.Factory size={16} className="text-brand" /><b className="text-[14px] text-ink">Open a case with HPE Aruba TAC</b><span className="text-[12px] text-ink3">· {inc.ci}{d ? `, ${d.type === 'SD-WAN' ? 'EdgeConnect EC-XS' : `Aruba ${d.model}`}` : ''}</span></div>
      <Field title="Sent with the case">
        <ul className="text-[12.5px] text-ink2 grid sm:grid-cols-2 gap-x-4">{[d ? `Serial ${d.serial}` : 'Device details', d ? `${D.warrantyKind(d)}: ${D.warrantyText(d) === 'Lifetime' ? 'covered' : `until ${D.warrantyText(d)}`}` : 'Support contract', 'Fault logs and the last heartbeat', 'The ranked causes and what was tried'].map(x => <li key={x} className="flex items-center gap-1.5 py-0.5"><I.Check size={13} className="text-ok" />{x}</li>)}</ul>
      </Field>
      <div className="flex flex-wrap gap-2"><Btn kind="brand" icon={I.Send} onClick={() => { const no = vendorCase(act, inc); onDone(`HPE Aruba TAC case ${no} opened for the replacement unit. The NOC keeps the ticket.`); }}>Open the HPE case</Btn><Btn onClick={onCancel}>Cancel</Btn></div>
    </div>
  );
}
