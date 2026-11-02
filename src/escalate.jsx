// Escalate to Movate: the one thing SRS people do instead of acting. They pick what it is about, how urgent it is and
// why; Mova iO's Smart Triage Agent routes it to the ticket owner and the Movate engagement lead (and the major
// incident manager when critical), and the owner acknowledges with the time of the next update. Escalations show on
// the incident, the root-cause view and the work pack for Movate, who reply from there. Shared by the console and the
// role dashboards (kept in the browser, so both pages see the same escalations).
import React, { useState } from 'react';
import * as I from 'lucide-react';
import * as D from './data.js';
import { useApp, isMovate, roleOf, ESC_URGENCY } from './store.jsx';
import { cx, Btn } from './ui.jsx';
import { hhmm } from './util.js';

const REASONS = ['Need an update', 'Taking too long', 'Business impact is bigger than shown', 'Please act on this', 'Disagree with the plan', 'Other'];
const incOf = (s, id) => [...s.incidents, ...s.resolved].find(i => i.id === id);
const owner = inc => inc && inc.assignee && !/Agent|Mova iO/.test(inc.assignee) ? { owner: inc.assignee, ownerTeam: (D.teamOf(inc.group) || {}).name || inc.group } : {};

// what an escalation is about, from a drill-down level, the open incident or the screen
export function aboutOf(s, n) {
  if (!n) return { kind: 'general', label: 'General' };
  if (n.t === 'incident' || n.t === 'rca') { const i = incOf(s, n.id); if (i) return { kind: 'incident', id: i.id, label: `${i.id} · ${i.title} (${D.BR[i.branchId].name.replace(/ – .*/, '')})`, ...owner(i) }; }
  if (n.t === 'workpack') { const w = s.workOrders.find(x => x.id === n.id); if (w) { const i = w.inc && incOf(s, w.inc); return { kind: 'workorder', id: w.id, inc: w.inc, label: `${w.id} · field visit at ${D.BR[w.branchId].name.replace(/ – .*/, '')}`, ...owner(i) }; } }
  if (n.t === 'branch' || n.t === 'b360') { const b = D.BR[n.id]; const i = b && s.incidents.filter(x => x.branchId === b.id && x.state !== 'Resolved').sort((a, c) => a.pri.localeCompare(c.pri))[0]; if (b) return { kind: 'branch', id: b.id, inc: i && i.id, label: `${b.name}, ${b.brand}`, ...owner(i) }; }
  if (n.t === 'change') { const c = s.changes.find(x => x.id === n.id); if (c) return { kind: 'change', id: c.id, label: `${c.id} · ${c.title}`, owner: 'Marcus L.', ownerTeam: 'Network SME team' }; }
  if (n.t === 'approval') { const a = s.approvals.find(x => x.id === n.id); if (a) return { kind: 'approval', id: a.id, label: `${a.id} · ${a.title}`, owner: 'Marcus L.', ownerTeam: 'Network SME team' }; }
  return { kind: 'general', label: n.label || 'General' };
}
// who is escalating: the console role, or the leader signed in to the dashboards
export const escFrom = s => s.dashUser ? `${s.dashUser} (SRS)` : `${roleOf(s).who} (${roleOf(s).name}, SRS)`;
// an SRS viewer escalates instead of acting: in the console for SRS roles, always on the dashboards
export const canEscalate = s => !!s.dashUser || !isMovate(s);

export function EscalateButton({ about, size = 'sm', kind = 'brand', className, label = 'Escalate to Movate' }) {
  const { s, act } = useApp();
  if (!canEscalate(s)) return null;
  return <Btn size={size} kind={kind} icon={I.Megaphone} className={className} onClick={() => act.escalateOpen(typeof about === 'function' ? about() : about)}>{label}</Btn>;
}

export function EscalateDialog() {
  const { s, act } = useApp();
  const ab = s.escalating;
  const [urgency, setUrgency] = useState('High');
  const [reason, setReason] = useState(REASONS[0]);
  const [text, setText] = useState('');
  const [sent, setSent] = useState(null);
  if (!ab) return null;
  const from = escFrom(s);
  const mine = s.escalations.filter(e => e.from === from).slice(0, 5);
  const close = () => { setSent(null); setText(''); act.escalateClose(); };
  const route = [`${ab.owner || 'Priya S.'} (${ab.ownerTeam || 'NOC L2 Network'}), who owns ${ab.kind === 'incident' ? 'the ticket' : ab.kind === 'workorder' ? 'the ticket behind the visit' : ab.kind === 'general' ? 'the NOC queue' : 'it'}`, 'the Movate engagement lead', ...(urgency === 'Critical' ? ['Arjun M., the major incident manager'] : [])];
  const send = () => { const id = act.escalate({ about: ab, urgency, reason, text: text.trim(), from, owner: ab.owner, ownerTeam: ab.ownerTeam }); setSent(id); };
  const rec = sent && s.escalations.find(e => e.id === sent);
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center p-4 pt-[8vh]" role="dialog" aria-modal="true" aria-label="Escalate to Movate">
      <div className="absolute inset-0 bg-black/45" onClick={close} />
      <div className="relative w-full max-w-[620px] bg-panel border border-line rounded-lg shadow-2xl max-h-[84vh] overflow-y-auto">
        <div className="px-4 py-3 border-b border-line flex items-center gap-2"><I.Megaphone size={17} className="text-brand" /><b className="text-[15px] text-ink flex-1">Escalate to Movate</b><button onClick={close} aria-label="Close" className="h-8 w-8 grid place-items-center rounded hover:bg-chip"><I.X size={16} /></button></div>
        <div className="p-4">
          <p className="text-[12.5px] text-ink2 mb-3">SRS sees everything and escalates; Movate carries out the action. Mova iO routes your escalation to the people who own it.</p>
          <div className="text-[11px] font-bold tracking-[0.08em] uppercase text-ink3 mb-1">About</div>
          <div className="text-[13px] text-ink font-semibold mb-3">{ab.label}</div>
          {!rec ? <>
            <div className="text-[11px] font-bold tracking-[0.08em] uppercase text-ink3 mb-1">How urgent</div>
            <div className="grid sm:grid-cols-3 gap-1.5 mb-3">{Object.entries(ESC_URGENCY).map(([k, v]) => <button key={k} type="button" onClick={() => setUrgency(k)} aria-pressed={urgency === k} className={cx('text-left rounded-md border px-2.5 py-2', urgency === k ? 'border-brand bg-brand/5' : 'border-line hover:bg-chip/60')}><b className={cx('block text-[13px]', k === 'Critical' ? 'text-bad' : k === 'High' ? 'text-warn' : 'text-ink')}>{k}</b><span className="block text-[11.5px] text-ink2 leading-snug">{v.text}</span></button>)}</div>
            <div className="text-[11px] font-bold tracking-[0.08em] uppercase text-ink3 mb-1">Why</div>
            <div className="flex flex-wrap gap-1.5 mb-3">{REASONS.map(r => <button key={r} type="button" onClick={() => setReason(r)} aria-pressed={reason === r} className={cx('h-7 px-2.5 rounded-full border text-[12px] font-semibold', reason === r ? 'bg-brand text-white border-brand' : 'border-line text-ink2 hover:bg-chip')}>{r}</button>)}</div>
            <textarea value={text} onChange={e => setText(e.target.value)} rows={3} placeholder="What the business is seeing, and what you need from Movate" className="w-full rounded-md border border-line bg-canvas text-ink text-[13px] px-3 py-2 outline-none focus:border-brand" />
            <div className="mt-3 rounded-md border border-line bg-chip/50 px-3 py-2 text-[12px] text-ink2 flex items-start gap-2"><I.Route size={14} className="mt-0.5 shrink-0 text-ink3" /><span>Mova iO's Smart Triage Agent sends it to {route.join(', ')}. Movate will {ESC_URGENCY[urgency].text}.</span></div>
            <div className="flex gap-2 mt-3"><Btn kind="brand" icon={I.Send} onClick={send}>Send to Movate</Btn><Btn onClick={close}>Cancel</Btn></div>
          </> : <div className="rounded-md border border-ok/40 bg-ok/5 px-3 py-3 text-[13px] text-ink">
            <div className="flex items-center gap-2 font-semibold"><I.CheckCircle2 size={16} className="text-ok" />{rec.id} sent to Movate ({rec.urgency})</div>
            <div className="text-[12.5px] text-ink2 mt-1">Sent to {rec.to.join(', ')}.</div>
            <div className="text-[12.5px] mt-1">{rec.status === 'Sent' ? <span className="text-ink2 inline-flex items-center gap-1.5"><I.Loader2 size={13} className="animate-spin" />Waiting for Movate to acknowledge…</span> : <span className="text-ok font-semibold">Acknowledged by {rec.ackBy} at {hhmm(rec.ackT)} CT; next update by {hhmm(rec.next)} CT.</span>}</div>
            <div className="flex gap-2 mt-3"><Btn onClick={close}>Close</Btn></div>
          </div>}
          {mine.length > 0 && <div className="mt-4">
            <div className="text-[11px] font-bold tracking-[0.08em] uppercase text-ink3 mb-1">Your escalations</div>
            <ul className="divide-y divide-line/70 border border-line rounded-md">{mine.map(e => <li key={e.id} className="px-3 py-1.5 text-[12px]"><b className="text-ink">{e.id}</b> <span className="text-ink2">{e.about.label}</span><span className="block text-ink3">{e.urgency} · {e.reason} · {e.status === 'Answered' ? `answered by ${e.reply.who.replace(/ \(.*/, '')}` : e.status === 'Acknowledged' ? `acknowledged by ${e.ackBy}, next update ${hhmm(e.next)} CT` : 'sent'}</span></li>)}</ul>
          </div>}
        </div>
      </div>
    </div>
  );
}

// escalations about a record, shown to everyone; Movate answers from here
export function EscalationBanner({ id, inc, className }) {
  const { s, act } = useApp();
  const [reply, setReply] = useState({});
  const list = s.escalations.filter(e => e.about && (e.about.id === id || (inc && (e.about.inc === inc || e.about.id === inc))));
  if (!list.length) return null;
  const movate = isMovate(s) && !s.dashUser;
  return (
    <div className={cx('space-y-1.5', className)}>{list.map(e => (
      <div key={e.id} className={cx('rounded-md border px-3 py-2 text-[12.5px]', e.status === 'Answered' ? 'border-ok/40 bg-ok/5' : e.urgency === 'Critical' ? 'border-bad/50 bg-bad/5' : 'border-warn/50 bg-warn/5')}>
        <div className="flex items-center gap-2 flex-wrap"><I.Megaphone size={14} className={e.urgency === 'Critical' ? 'text-bad' : 'text-warn'} /><b className="text-ink">SRS escalation {e.id} · {e.urgency}</b><span className="text-ink2">from {e.from.replace(/, SRS\)$/, ')').replace(/ \(SRS\)$/, '')} at {hhmm(e.t)} CT</span>
          <span className="ml-auto text-[11.5px] font-semibold text-ink2">{e.status === 'Answered' ? `Answered by ${e.reply.who.replace(/ \(.*/, '')}` : e.status === 'Acknowledged' ? `Acknowledged by ${e.ackBy}; next update ${hhmm(e.next)} CT` : 'Waiting for Movate'}</span></div>
        <div className="text-ink mt-0.5"><b>{e.reason}.</b> {e.text}</div>
        {e.reply && <div className="text-ink2 mt-0.5"><b className="text-ink">Movate:</b> {e.reply.text}</div>}
        {movate && e.status !== 'Answered' && <form className="flex gap-2 mt-1.5" onSubmit={ev => { ev.preventDefault(); const t = (reply[e.id] || '').trim(); if (!t) return; act.escalationReply(e.id, t); setReply(r => ({ ...r, [e.id]: '' })); }}>
          <input value={reply[e.id] || ''} onChange={ev => setReply(r => ({ ...r, [e.id]: ev.target.value }))} placeholder="Reply to SRS: what Movate is doing and when" className="flex-1 h-8 px-2.5 rounded-md border border-line bg-canvas text-ink text-[12.5px] outline-none focus:border-brand" />
          <Btn kind="brand" size="sm" icon={I.Send} type="submit">Reply</Btn></form>}
      </div>))}</div>
  );
}
