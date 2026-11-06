// Every drill-down level can act on what it shows: raise the record in ServiceNow, send someone, run a Mova iO
// runbook, open a carrier case, schedule a change, set a watch or put it on the review agenda. Each button creates the
// real record in the console (work order, case, problem, change, watch, run) and shows its number with a link.
import React, { useState } from 'react';
import * as I from 'lucide-react';
import * as D from '../data.js';
import { useApp, circuitOf } from '../store.jsx';
import { cx } from '../ui.jsx';
import { DAY, HR } from '../util.js';
import { branchesOf, incidentsOf, labelOf } from './drilldata.js';

const rnd = (a, n) => a + Math.floor(Math.random() * n);
const csv = (name, head, rows) => {
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const blob = new Blob([[head, ...rows].map(r => r.map(esc).join(',')).join('\n')], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};

// record makers: each returns { id, msg, open? }
function makers(s, act, now) {
  const me = act.me();
  return {
    wo: (b, task, pri = 'P3', inc = null) => { const id = `WO00${rnd(43100, 800)}`; act.add('workOrders', { id, branchId: b.id, inc, task, skills: ['Aruba switching'], parts: [], tech: null, status: 'Unassigned', created: Date.now(), window: `After ${b.hours.close} local unless urgent`, priority: pri }); return { id, msg: `${id} created and sent to Field Dispatch`, open: 'dispatch' }; },
    prb: (title, incidents = 0, owner = 'Network Eng L3') => { const id = `PRB000${rnd(4300, 600)}`; act.add('problems', { id, title, incidents, state: 'New', owner, opened: Date.now() }); return { id, msg: `${id} problem record opened in ServiceNow, owner ${owner}`, open: 'knowledge' }; },
    chg: (title, scope, devices = 1, risk = 'Low') => { const id = `CHG00${rnd(32900, 900)}`; act.add('changes', { id, title, type: 'Normal', risk, state: 'Scheduled', start: now + DAY, end: now + DAY + 2 * HR, window: 'After branch close', scope, devices, owner: me, validation: 'Pending' }); return { id, msg: `${id} scheduled for tomorrow after branch close`, open: 'changes' }; },
    watch: (what, branchId = null) => { const id = `W-${rnd(5000, 4000)}`; act.add('watches', { id, what, branchId, created: Date.now(), by: me }); return { id, msg: `Watch ${id} set: Mova iO alerts you if it gets worse` }; },
    run: (rbId, b, label) => { const rb = D.RB[rbId]; act.add('runs', { id: Date.now() + Math.random(), rb: rbId, t: Date.now(), branchId: b && b.id, branch: b ? `${b.name}, ${b.brand}` : 'estate', by: me, res: 'Success', dur: rb ? rb.avg : '20 s' }); return { id: rbId, msg: `${label || rb.name} ran${b ? ` at ${b.name}` : ''}: success in ${rb ? rb.avg : '20 s'}`, open: 'catalogue' }; },
    case: (cid, inc = null) => { const c = circuitOf(s, cid); const id = D.caseNo(c.carrier); act.add('cases', { id, carrier: c.carrier, circuit: c.id, inc, branchId: c.branchId, opened: Date.now(), status: 'Open – carrier testing', eta: Date.now() + 4 * HR, lastUpdate: Date.now(), evidence: ['60-min loss/jitter graph', 'MTR from EdgeConnect', 'Interface counters', 'Timestamps'], escal: 0 }); return { id, msg: `${c.carrier} case ${id} opened with the evidence pack`, open: 'carriers' }; },
    review: what => { const id = `REV-${rnd(700, 300)}`; return { id, msg: `Added to the next service review agenda: ${what}`, open: 'reports' }; },
    notify: (who, what) => ({ id: 'MSG', msg: `${who} notified on Teams: ${what}` }),
  };
}

// which actions each kind of drill-down offers
function actionsFor(n, s, now, m, act0) {
  const B = id => D.BR[id];
  const A = (key, label, Ic, run, tone) => ({ key, label, Ic, run, tone });
  const set = () => { try { return branchesOf(s, n, now) || []; } catch { return []; } };
  const incs = () => { try { return incidentsOf(s, n, now) || []; } catch { return []; } };
  switch (n.t) {
    case 'branch': { const b = B(n.id); if (!b) return []; return [
      A('hc', 'Run a Mova iO health check', I.Stethoscope, () => m.run('RB-110', b, 'Health check (path, POS, Wi-Fi, LTE)'), 'brand'),
      A('wo', 'Send a field engineer', I.Truck, () => m.wo(b, `Site check requested from the drill-down: ${b.name}`)),
      A('chg', 'Schedule a fix after close', I.CalendarPlus, () => m.chg(`Remediation at ${b.name}`, b.region)),
      A('prb', 'Open a problem record', I.FilePlus2, () => m.prb(`Recurring issues at ${b.name}`)),
      A('notify', 'Tell the store manager', I.MessageSquare, () => m.notify(`${b.name} store manager`, 'status and next steps')),
      A('watch', 'Watch this branch', I.Eye, () => m.watch(`Branch ${b.name}`, b.id)),
    ]; }
    case 'circuit': { const c = D.CIR[n.id]; if (!c) return []; const b = B(c.branchId); return [
      A('case', `Open a carrier case with ${c.carrier}`, I.Phone, () => m.case(c.id), 'brand'),
      A('test', 'Run a path test', I.Activity, () => m.run('RB-110', b, `Path test on ${c.id}`)),
      A('fo', 'Move traffic to the backup line', I.Shuffle, () => m.run('RB-101', b)),
      A('prb', 'Open a problem record for repeats', I.FilePlus2, () => m.prb(`Repeat faults on ${c.carrier} ${c.type} ${c.id} (${b.name})`, c.tickets90 || 0)),
      A('watch', 'Watch this line', I.Eye, () => m.watch(`${c.carrier} ${c.id}`, b.id)),
    ]; }
    case 'device': { const d = D.DEV[n.id]; if (!d) return []; const b = B(d.branchId); const ap = /AP/.test(d.type || d.model || ''); return [
      A('diag', 'Run diagnostics', I.Stethoscope, () => m.run(ap ? 'RB-104' : 'RB-103', b, `Diagnostics on ${d.id}`), 'brand'),
      A('bk', 'Back up the config now', I.Save, () => m.run('RB-109', b, `Config backup of ${d.id}`)),
      A('fw', 'Schedule a firmware upgrade', I.CalendarPlus, () => m.chg(`Firmware upgrade on ${d.id} (${d.model}) at ${b.name}`, b.region)),
      A('wo', 'Send a replacement', I.Truck, () => m.wo(b, `Swap ${d.model} ${d.id}`, 'P3')),
      A('watch', 'Watch this device', I.Eye, () => m.watch(`${d.id} at ${b.name}`, b.id)),
    ]; }
    case 'devices': { const l = set(); return [
      A('diag', `Run diagnostics${l.length ? ` at ${l.length} branches` : ''}`, I.Stethoscope, () => { l.slice(0, 50).forEach(b => m.run('RB-103', b, 'Diagnostics')); return { id: 'RB-103', msg: `Mova iO diagnostics ran at ${Math.min(50, l.length)} branches`, open: 'catalogue' }; }, 'brand'),
      A('chg', 'Schedule the fix after close', I.CalendarPlus, () => m.chg(`Fix: ${labelOf(n)}`, n.region || 'All regions', l.length || 1)),
      A('prb', 'Open a problem record', I.FilePlus2, () => m.prb(`${labelOf(n)}`)),
      A('csv', 'Download the list', I.FileDown, () => { csv('srs-devices.csv', ['Branch', 'Brand', 'City', 'Region'], l.map(b => [b.name, b.brand, b.city, b.region])); return { id: 'CSV', msg: `${l.length} branches downloaded` }; }),
    ]; }
    case 'lines': { const l = set(); return [
      A('case', 'Open carrier cases for these lines', I.Phone, () => { const ids = l.slice(0, 20).map(b => m.case(b.wan[0]).id); return { id: ids[0] || 'CASE', msg: `${ids.length} carrier cases opened with evidence packs`, open: 'carriers' }; }, 'brand'),
      A('test', 'Run path tests', I.Activity, () => { l.slice(0, 50).forEach(b => m.run('RB-110', b, 'Path test')); return { id: 'RB-110', msg: `Path tests ran on ${Math.min(50, l.length)} branches`, open: 'catalogue' }; }),
      A('prb', 'Open a problem record', I.FilePlus2, () => m.prb(`${labelOf(n)}`, l.length, 'Carrier management')),
    ]; }
    case 'carrier': return [
      A('rev', 'Put it on the carrier review', I.ClipboardList, () => m.review(`${n.id || 'carrier'} performance`), 'brand'),
      A('prb', 'Open a problem record', I.FilePlus2, () => m.prb(`${n.id || 'Carrier'} repeat faults`, 0, 'Carrier management')),
      A('notify', 'Escalate to the account manager', I.Megaphone, () => m.notify(`${n.id || 'Carrier'} account manager`, 'service credits and repeat faults')),
    ];
    case 'metric': case 'sla': case 'mttr': { const x = n.t === 'metric' ? D.SLA[n.i] : null; const name = x ? `#${x.n} ${x.name}` : n.t === 'mttr' ? 'time to restore' : 'service levels'; return [
      A('plan', 'Create an improvement plan', I.FilePlus2, () => m.prb(`Improve ${name}${n.per ? ` (last ${n.per} months)` : ''}`, 0, 'Movate service manager'), 'brand'),
      A('watch', 'Alert me before it misses', I.BellRing, () => m.watch(`${name} nearing its minimum`)),
      A('rev', 'Add to the service review', I.ClipboardList, () => m.review(name)),
      A('notify', 'Ask the owner for an update', I.MessageSquare, () => m.notify('Movate service manager', name)),
    ]; }
    case 'incidents': { const l = incs(); if (!l.length) return [A('watch', 'Alert me when one appears', I.BellRing, () => m.watch(labelOf(n) || 'incidents'))]; return [
      A('esc', `Escalate ${l.length} to the duty manager`, I.Megaphone, () => m.notify('Duty manager', `${l.length} incidents: ${labelOf(n)}`), 'brand'),
      A('prb', 'Group them in a problem record', I.FilePlus2, () => m.prb(`${labelOf(n)} (${l.length} incidents)`, l.length)),
      A('csv', 'Download the list', I.FileDown, () => { csv(`srs-${(labelOf(n) || 'incidents').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`, ['Incident', 'Priority', 'Branch', 'Title', 'State'], l.map(i => [i.id, i.pri, B(i.branchId)?.name, i.title, i.state])); return { id: 'CSV', msg: `${l.length} incidents downloaded` }; }),
    ]; }
    case 'incident': return [];
    case 'prediction': { const p = s.predictions.find(x => x.id === n.id); if (!p) return []; const b = B(p.branchId); return [
      A('prev', 'Approve the prevention plan', I.ShieldCheck, () => { const id = `APR-${rnd(2900, 500)}`; act0.add('approvals', { id, type: 'Prevention plan', title: `Prevent: ${p.kind.toLowerCase()} – ${p.target}`, branchId: p.branchId, agent: 'prediction', conf: p.conf, risk: 'Low', created: Date.now(), status: 'Pending' }); act0.upd('predictions', p.id, { status: 'Actioned' }); return { id, msg: `${id} sent for approval`, open: 'changes' }; }, 'brand'),
      b && A('wo', 'Send a field engineer', I.Truck, () => m.wo(b, `Prevent: ${p.kind} (${p.target})`)),
      A('watch', 'Watch the trend', I.Eye, () => m.watch(`${p.kind}: ${p.target}`, p.branchId)),
    ].filter(Boolean); }
    case 'drift': return [
      A('fix', 'Put the devices back to standard', I.Undo2, () => m.chg(`Restore the approved config on ${s.drift.length} devices`, 'All regions', s.drift.length), 'brand'),
      A('prb', 'Open a problem record', I.FilePlus2, () => m.prb('Changes made without a change record')),
    ];
    case 'cases': return [
      A('chase', 'Chase every late case', I.Megaphone, () => m.notify('Carrier account managers', 'cases past the promised time'), 'brand'),
      A('rev', 'Add to the carrier review', I.ClipboardList, () => m.review('carrier repairs')),
    ];
    case 'driver': return [
      A('auto', 'Automate the fix with Mova iO', I.Sparkles, () => { const id = `APR-${rnd(3400, 500)}`; act0.add('approvals', { id, type: 'Automation', title: `Automate: ${n.label}`, agent: 'automation', conf: 0.9, risk: 'Low', created: Date.now(), status: 'Pending' }); return { id, msg: `${id} sent for approval: a Mova iO runbook for ${n.label.toLowerCase()}`, open: 'changes' }; }, 'brand'),
      A('prb', 'Open a problem record', I.FilePlus2, () => m.prb(`Reduce ${n.label.toLowerCase()}`, n.tickets || 0)),
      A('kb', 'Write a knowledge article', I.BookOpen, () => { const id = `KB00${rnd(18000, 900)}`; act0.add('kbDrafts', { id, title: `How to fix: ${n.label}`, by: 'Mova iO', created: Date.now(), status: 'Draft' }); return { id, msg: `${id} drafted by Mova iO, waiting for review`, open: 'knowledge' }; }),
    ];
    case 'automation': return [
      A('wider', 'Turn it on for more branches', I.Rocket, () => { const id = `APR-${rnd(3900, 500)}`; act0.add('approvals', { id, type: 'Automation', title: `Widen ${n.label}`, agent: 'automation', conf: 0.95, risk: 'Low', created: Date.now(), status: 'Pending' }); return { id, msg: `${id} sent for approval`, open: 'changes' }; }, 'brand'),
      n.rb && A('run', 'Run it now', I.Play, () => m.run(n.rb, null)),
      A('rev', 'Add to the service review', I.ClipboardList, () => m.review(n.label)),
    ].filter(Boolean);
    default: { const l = set(); if (!l.length) return [
      A('rev', 'Add to the service review', I.ClipboardList, () => m.review(labelOf(n) || 'this view')),
      A('watch', 'Watch this', I.Eye, () => m.watch(labelOf(n) || 'this view')),
    ]; return [
      A('hc', `Health check ${l.length} branches`, I.Stethoscope, () => { l.slice(0, 50).forEach(b => m.run('RB-110', b, 'Health check')); return { id: 'RB-110', msg: `Mova iO health check ran on ${Math.min(50, l.length)} branches: no new faults`, open: 'catalogue' }; }, 'brand'),
      A('prb', 'Open a problem record', I.FilePlus2, () => m.prb(`${labelOf(n)} (${l.length} branches)`)),
      A('csv', 'Download the list', I.FileDown, () => { csv(`srs-${(labelOf(n) || 'branches').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`, ['Branch', 'Brand', 'City', 'Region'], l.map(b => [b.name, b.brand, b.city, b.region])); return { id: 'CSV', msg: `${l.length} branches downloaded` }; }),
      A('notify', 'Tell the regional managers', I.MessageSquare, () => m.notify('Regional managers', labelOf(n))),
    ]; }
  }
}
export function DrillActions({ n, s, now, links }) {
  const { act } = useApp();
  const [done, setDone] = useState([]);
  const m = makers(s, act, now);
  const list = actionsFor(n, s, now, m, act);
  if (!list.length) return null;
  const fire = x => { const r = x.run(); if (!r) return; act.audit(r.msg, r.id); act.toast(r.msg); setDone(d => [{ ...r, label: x.label, key: x.key, t: Date.now() }, ...d].slice(0, 5)); };
  return (
    <div className="mb-5 border border-line rounded-md bg-panel px-3 py-2.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink3 mr-1 inline-flex items-center gap-1"><I.Zap size={12} />Take action</span>
        {list.map(x => <button key={x.key} onClick={() => fire(x)} className={cx('h-8 px-2.5 rounded-md text-[12.5px] font-semibold inline-flex items-center gap-1.5 border', x.tone === 'brand' ? 'bg-ink text-canvas border-ink hover:opacity-90' : 'bg-panel text-ink border-line hover:bg-chip')}><x.Ic size={14} />{x.label}</button>)}
      </div>
      {done.length > 0 && <ul className="mt-2 space-y-1">{done.map(r => <li key={r.t} className="text-[12px] text-ink2 flex items-center gap-1.5"><I.CheckCircle2 size={13} className="text-ok shrink-0" /><span className="flex-1">{r.msg}</span>{r.open && links && links.module && <button onClick={() => links.module(r.open)} className="text-[12px] font-semibold text-ink hover:underline">Open</button>}</li>)}</ul>}
    </div>
  );
}
