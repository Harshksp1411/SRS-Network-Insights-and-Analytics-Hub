// Acting on a prediction before it fails: open a ServiceNow ticket, or hand it to Mova iO, which opens the ticket,
// does the safe steps itself and asks a person for anything that changes the network. Each "likely to fail" list can
// also run on its own: Auto off, Auto ticket (a proactive ticket for every row above the line) or Auto ticket and
// Mova iO (the ticket plus the safe steps).
import React, { useEffect, useRef } from 'react';
import * as I from 'lucide-react';
import * as D from './data.js';
import { useApp } from './store.jsx';
import { Badge, Btn, cx } from './ui.jsx';
import { DAY, HR } from './util.js';

const rnd = (a, n) => a + Math.floor(Math.random() * n);
const pct = p => `${Math.round(p * 100)}%`;
// an incident template that fits the kind of thing that is failing (so the ticket opens like any other)
const KIND = { AP: 'apdown', Switch: 'crc', 'SD-WAN': 'edgedown', line: 'circuit', branch: 'circuit' };

// it = { key, b, type, ci, title, why, p, pri, plan: [first step Mova iO does itself, change that needs approval] }
export function useProact() {
  const { s, act } = useApp();
  const P = s.proact || {};
  const save = (key, patch) => act.set(st => ({ proact: { ...(st.proact || {}), [key]: { ...((st.proact || {})[key] || {}), ...patch } } }));
  const ticket = (it, auto = false, quiet = false) => {
    if (P[it.key] && P[it.key].inc) return P[it.key].inc;
    const now = Date.now(), who = auto ? 'Mova iO' : act.me();
    const inc = D.buildIncident(KIND[it.type] || 'circuit', it.b, 0, {
      pri: it.pri || (it.p >= 0.75 ? 'P3' : 'P4'), title: `Predicted: ${it.title}`, ci: it.ci, opened: now, acked: null, assignee: null, state: 'New', proactive: true,
      signals: [{ t: now, src: 'OpsQ', msg: `${it.why} (failure risk ${pct(it.p)})`, sev: 'warn' }], corr: 1, suppressed: 0,
      rca: [{ cause: it.why, conf: it.p, ev: 'Trend in the telemetry; not failed yet' }], conf: it.p,
      impact: ['None yet: raised before the failure, while the branch is still working'],
      agentSteps: [{ agent: 'Prediction', text: `Failure risk ${pct(it.p)}: ${it.why}`, t: now, st: 'done' }, { agent: 'Mova iO', text: `Opened this proactive ticket${auto ? ' automatically (above the auto-ticket line)' : ''}`, t: now, st: 'done' }],
      notes: [{ t: now, who, text: auto ? `Opened automatically: failure risk ${pct(it.p)} is above the auto-ticket line.` : `Opened from the prediction by ${who}.` }],
    });
    act.add('incidents', inc);
    save(it.key, { inc: inc.id, auto, t: now });
    act.audit(`Proactive ticket ${inc.id} for ${it.ci}: ${it.why}${auto ? ' (auto)' : ''}`, inc.id, who);
    if (!quiet) act.toast(`ServiceNow ${inc.id} opened before the failure`);
    return inc.id;
  };
  const mova = (it, auto = false, quiet = false) => {
    if (P[it.key] && P[it.key].steps) return;
    const now = Date.now(), inc = ticket(it, auto, true);
    const chg = `CHG00${rnd(33100, 800)}`, apr = `APR-${rnd(3600, 600)}`;
    const [doIt, change] = it.plan || ['Checked the spares at the nearest depot', 'Fix it after branch close'];
    act.add('approvals', { id: apr, type: 'Prevention plan', title: `${change}: ${it.ci}`, branchId: it.b.id, agent: 'prediction', conf: it.p, risk: 'Low', created: now, status: 'Pending', why: [it.why, `Failure risk ${pct(it.p)} in the next 30 days`], evidence: [inc], rollback: 'Cancel the change; nothing has been touched yet', verify: ['Device healthy for 24 hours after the work'] });
    act.add('changes', { id: chg, title: `${change}: ${it.ci}`, type: 'Normal', risk: 'Low', state: 'Awaiting CAB', start: now + 2 * DAY, end: now + 2 * DAY + 2 * HR, window: 'After branch close', scope: it.b.name, devices: 1, owner: 'Mova iO', validation: 'Pending' });
    save(it.key, { inc, steps: [
      { text: `Opened ServiceNow ${inc}`, st: 'done' },
      { text: doIt, st: 'done' },
      { text: `Told the branch manager at ${it.b.name}`, st: 'done' },
      { text: `${change} (${chg}) waits for your approval (${apr})`, st: 'wait' },
      { text: 'Checks the device for 24 hours after, then closes the ticket', st: 'next' },
    ], apr, chg });
    act.audit(`Mova iO took ${inc} for ${it.ci}: ${doIt}; ${chg} waits for approval ${apr}`, inc, 'Mova iO');
    if (!quiet) act.toast(`Mova iO is on it: ${inc} opened, ${chg} waits for your approval`);
  };
  return { P, ticket, mova };
}

const DOT = { done: 'bg-ok', wait: 'bg-warn', next: 'bg-info' };
// the actions on one row: what Mova iO has done so far, or the buttons to start
export function ProactActions({ it, extra }) {
  const { act } = useApp(); const { P, ticket, mova } = useProact(); const x = P[it.key] || {};
  return (
    <span onClick={e => e.stopPropagation()} className="flex items-center gap-1 flex-wrap justify-end">
      {x.inc ? <button onClick={() => act.openInc(x.inc)} title="Open the ticket" className="inline-flex"><Badge tone={x.steps ? 'brand' : 'blue'}><I.Ticket size={11} />{x.inc}{x.auto ? ' · auto' : ''}</Badge></button>
        : <Btn op size="xs" icon={I.Ticket} onClick={() => ticket(it)}>Open ticket</Btn>}
      {!x.steps && <Btn op size="xs" kind="brand" icon={I.Bot} onClick={() => mova(it)}>Mova iO, handle it</Btn>}
      {extra}
    </span>
  );
}
// a one-line trail under a row once Mova iO has it
export function ProactTrail({ it }) {
  const { act } = useApp(); const { P } = useProact(); const x = P[it.key];
  if (!x || !x.steps) return null;
  return (
    <div onClick={e => e.stopPropagation()} className="flex items-center gap-x-3 gap-y-0.5 flex-wrap text-[11.5px] text-ink2 pl-1 pb-1">
      <span className="inline-flex items-center gap-1 font-semibold text-ink"><I.Bot size={12} className="text-brand" />Mova iO</span>
      {x.steps.map((st, i) => <span key={i} className="inline-flex items-center gap-1"><span className={cx('w-1.5 h-1.5 rounded-full', DOT[st.st])} />{st.text}</span>)}
      {x.apr && <button onClick={() => act.go('changes')} className="text-info hover:underline">Approve</button>}
    </div>
  );
}

// the switch in each list's header: off, auto ticket, or auto ticket and Mova iO, for every row at or above the line
export function AutoTicket({ id, items, th = 0.6 }) {
  const { s, act } = useApp(); const { P, ticket, mova } = useProact();
  const mode = (s.autoTicket || {})[id] || 'off';
  const doneRef = useRef(new Set());
  useEffect(() => {
    if (mode === 'off') return;
    const due = items.filter(it => it.p >= th && !doneRef.current.has(it.key + mode) && !(mode === 'ticket' ? (P[it.key] || {}).inc : (P[it.key] || {}).steps));
    if (!due.length) return;
    due.forEach(it => { doneRef.current.add(it.key + mode); mode === 'mova' ? mova(it, true, true) : ticket(it, true, true); });
    act.toast(mode === 'mova' ? `Mova iO opened ${due.length} tickets and started the safe steps; changes wait for approval` : `Mova iO opened ${due.length} proactive tickets`);
  }, [mode, items.length]);
  const set = m => act.set(st => ({ autoTicket: { ...(st.autoTicket || {}), [id]: m } }));
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] text-ink3" title={`Rows at ${pct(th)} or more`}>
      Auto at {pct(th)}+
      <span className="inline-flex rounded-md bg-chip p-0.5 font-semibold" role="group" aria-label="Automatic tickets">{[['off', 'Off'], ['ticket', 'Ticket'], ['mova', 'Ticket + Mova iO']].map(([k, l]) => <button key={k} aria-pressed={mode === k} onClick={() => set(k)} className={cx('px-2 py-0.5 rounded', mode === k ? 'bg-panel text-ink shadow-sm' : 'hover:text-ink')}>{l}</button>)}</span>
    </span>
  );
}
