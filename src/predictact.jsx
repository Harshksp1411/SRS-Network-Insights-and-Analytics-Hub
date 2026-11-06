// What Mova iO did about each prediction: the steps its agents took, when, and where each one stands now.
import React from 'react';
import * as I from 'lucide-react';
import * as D from './data.js';
import { Card, Badge, cx } from './ui.jsx';
import { ago, HR, T0 } from './util.js';

const car = p => p.branchId && D.BR[p.branchId] ? (D.CIR[D.BR[p.branchId].wan[0]] || {}).carrier || 'the carrier' : 'Verizon';
// [hours ago, agent, what, state: done | wait | next]
const PLAN = {
  'PRD-501': p => [[50, 'Prediction Agent', 'Loss trend left its normal range; prediction raised', 'done'], [49, 'Carrier Agent', `Proactive case opened with ${car(p)}: 5 days of loss and path tests attached`, 'done'], [48, 'Mova iO', 'ServiceNow proactive incident INC0384390 created automatically, linked to the carrier case', 'done'], [26, 'Runbook Agent', 'Card payments and voice pinned to the backup line at the evening peak (RB-101)', 'done'], [-14, 'Carrier Agent', `${car(p)} technician booked for 07:00 tomorrow`, 'next']],
  'PRD-502': p => [[30, 'Prediction Agent', 'Latency drift +14 ms on a repeat-offender line', 'done'], [29, 'Carrier Agent', `Case opened with ${car(p)} with the 90-day ticket history`, 'done'], [28, 'Mova iO', 'Watch every 5 minutes; alert at 80 ms', 'done']],
  'PRD-503': p => [[40, 'Prediction Agent', 'Five reboots in 7 days and 71 °C at midday', 'done'], [39, 'Runbook Agent', 'Radio power lowered 2 dB to cut heat (RB-104)', 'done'], [20, 'Dispatch Agent', 'Spare AP reserved at the Tampa depot', 'done'], [19, 'Mova iO', 'ServiceNow work order WO0041890 created automatically', 'done'], [-6, 'Dispatch Agent', 'Swap booked after branch close (17:00)', 'next']],
  'PRD-504': p => [[60, 'Prediction Agent', 'Fan speed falling, chassis at 61 °C', 'done'], [58, 'Runbook Agent', 'Config backed up and verified', 'done'], [40, 'Dispatch Agent', 'Spare CX 6100 reserved at the Phoenix depot', 'done'], [0, 'Change Validation Agent', 'ServiceNow change CHG0031912 raised automatically for Saturday 06:00, waiting for approval', 'wait']],
  'PRD-505': p => [[72, 'Prediction Agent', 'Peak use 78%, rising 2.1% a week; 90% in about 3 weeks', 'done'], [70, 'Runbook Agent', 'Card payments kept in the top class; backups moved to 02:00', 'done'], [48, 'Carrier Agent', `Upgrade quote requested from ${car(p)}: 100 → 200 Mb/s`, 'done'], [0, 'Mova iO', 'ServiceNow request RITM0049120 raised automatically, waiting for SRS approval (cost)', 'wait']],
  'PRD-506': () => [[20, 'Prediction Agent', 'LTE pool at 81% of the monthly plan', 'done'], [19, 'Runbook Agent', 'During failover LTE carries only tills, ERP and voice', 'done'], [18, 'Mova iO', 'Finance told: plan may need a top-up in 9 days', 'done']],
  'PRD-507': () => [[34, 'Prediction Agent', 'Backup throughput fell from 41 to 18 Mb/s in the weekly test', 'done'], [33, 'Runbook Agent', 'Failover test re-run: 18 Mb/s confirmed', 'done'], [30, 'Carrier Agent', 'Verizon case opened: tower congestion', 'done'], [30, 'Mova iO', 'ServiceNow incident INC0384402 created automatically for the case', 'done'], [-24, 'Dispatch Agent', 'Antenna check at the next visit', 'next']],
  'PRD-508': () => [[16, 'Prediction Agent', 'Ethernet errors and 2 PoE renegotiations a day on a yard AP', 'done'], [15, 'Mova iO', 'Watch every 15 minutes on errors and PoE', 'done'], [0, 'Mova iO', 'Cable test recommended, waiting for approval', 'wait']],
};
export const actionsOf = p => {
  const base = (PLAN[p.id] || (() => [[10, 'Prediction Agent', 'Prediction raised', 'done'], [9, 'Mova iO', 'Watch created', 'done']]))(p).map(([h, who, text, st]) => ({ t: T0 - h * HR, who, text, st }));
  if (p.status === 'Watching') base.push({ t: T0, who: 'You', text: 'Watch started from the console', st: 'done' });
  if (/Dismissed/.test(p.status || '')) base.push({ t: T0, who: 'You', text: 'Marked a false alarm; fed back to the model', st: 'done' });
  if (/approval|Approval/.test(p.status || '')) base.push({ t: T0, who: 'You', text: 'Sent for approval', st: 'wait' });
  return base;
};
const stOf = acts => acts.some(a => a.st === 'wait') ? ['Waiting for approval', 'amber'] : acts.some(a => a.st === 'next') ? ['Action taken, next step booked', 'blue'] : ['Action taken', 'green'];
const DOT = { done: 'bg-ok', wait: 'bg-warn', next: 'bg-info' };

export function MovaActions({ p, compact }) {
  const acts = actionsOf(p), [l, t] = stOf(acts);
  return (
    <div className="mt-2 rounded-lg border border-brand/30 bg-brand/[0.04] px-3 py-2">
      <div className="flex items-center gap-1.5 mb-1"><I.Bot size={14} className="text-brand" /><b className="text-[12px] text-ink flex-1">Mova iO did</b><Badge tone={t}>{l}</Badge></div>
      <ol className="space-y-0.5">{(compact ? acts.slice(-3) : acts).map((a, i) => <li key={i} className="flex items-start gap-2 text-[12px]"><span className={cx('w-1.5 h-1.5 rounded-full mt-[6px] shrink-0', DOT[a.st])} /><span className="flex-1"><b className="font-semibold text-ink">{a.who}:</b> <span className="text-ink2">{a.text}</span></span><span className="text-[11px] text-ink3 whitespace-nowrap">{a.st === 'next' ? 'booked' : a.st === 'wait' ? 'waiting' : ago(a.t)}</span></li>)}</ol>
    </div>
  );
}

export function PredictionActionsCard({ list, onPick }) {
  const all = list.flatMap(p => actionsOf(p).map(a => ({ ...a, p })));
  const done = all.filter(a => a.st === 'done' && a.who !== 'Prediction Agent' && a.who !== 'You').length, wait = list.filter(p => actionsOf(p).some(a => a.st === 'wait')).length, next = all.filter(a => a.st === 'next').length;
  const recent = all.filter(a => a.who !== 'Prediction Agent').sort((a, b) => b.t - a.t).slice(0, 8);
  return (
    <Card title="What Mova iO did about the predictions">
      <div className="grid grid-cols-3 gap-2 mb-3">{[['Actions taken', done, 'text-ok'], ['Waiting for approval', wait, 'text-warn'], ['Next steps booked', next, 'text-info']].map(([k, v, c]) => <div key={k} className="rounded-lg border border-line p-2.5"><div className="text-[12px] text-ink3">{k}</div><div className={cx('text-[24px] font-bold tabular-nums leading-tight', c)}>{v}</div></div>)}</div>
      <div className="divide-y divide-line/60">{recent.map((a, i) => <button key={i} onClick={() => onPick && onPick(a.p.id)} className="w-full text-left flex items-center gap-2 py-1.5 text-[12.5px] hover:bg-chip/50">
        <span className={cx('w-2 h-2 rounded-full shrink-0', DOT[a.st])} /><span className="font-mono text-[11px] text-ink3 w-16 shrink-0">{a.p.id}</span><b className="text-ink shrink-0">{a.who}</b><span className="text-ink2 flex-1 truncate">{a.text}</span><span className="text-[11px] text-ink3 whitespace-nowrap">{a.st === 'next' ? 'booked' : a.st === 'wait' ? 'waiting' : ago(a.t)}</span></button>)}</div>
    </Card>
  );
}
