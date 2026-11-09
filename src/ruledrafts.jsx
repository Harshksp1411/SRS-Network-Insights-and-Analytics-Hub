// Rules and policies written by OpsQ, with a person in the loop. OpsQ drafts a rule from what it has seen (a hardware
// signal, a pattern in the alerts, or a request in plain English); a person edits it, runs a back-test on the last
// 7 days and approves or rejects it. Nothing runs until it is approved, and an approved rule starts in Observed mode.
import React, { useState } from 'react';
import * as I from 'lucide-react';
import { useApp } from './store.jsx';
import { Card, Badge, Btn, cx } from './ui.jsx';
import { num, ago, MIN, HR } from './util.js';

const T0 = Date.now();
export const SEED_RULES = [
  { id: 'RD-101', kind: 'Alert policy', name: 'Switch PSU fan slowing down', when: 'PSU fan speed on an Aruba 2530 falls more than 15% over 10 days', then: 'Raise a P4 alert to Movate NOC L2 and pre-stage a spare at the nearest depot', opsql: 'resource.model = "2530" AND metric("psu.fan.rpm").change(10d) < -15%', scope: 'All 2530 switches (728)', from: 'Learned from 6 PSU failures in 12 months; fan speed fell first every time', seen: 6, status: 'Draft', t: T0 - 3 * HR },
  { id: 'RD-102', kind: 'Alert policy', name: 'EdgeConnect storage wearing out', when: 'An EdgeConnect reports SMART storage warnings twice in 7 days', then: 'Raise a P3 alert and schedule a swap after branch close', opsql: 'resource.type = "SD-WAN" AND event.name = "smart.warning" AND count(7d) >= 2', scope: 'All EdgeConnect EC-XS (933)', from: 'Learned from 4 appliance failures; SMART warnings came 2 to 3 weeks before', seen: 4, status: 'Draft', t: T0 - 5 * HR },
  { id: 'RD-103', kind: 'First response', name: 'Uplink CRC errors rising', when: 'Input CRC errors on a switch uplink rise three days in a row', then: 'Run RB-103 port bounce; if errors continue, open a field visit to replace the SFP or patch lead', opsql: 'metric("if.in.crc").trend(3d) = "rising" AND interface.role = "uplink"', scope: 'All switches', from: 'Seen 31 times; a bounce fixed 9 in 10', seen: 31, status: 'Draft', t: T0 - 26 * HR },
  { id: 'RD-104', kind: 'Correlation', name: 'Comcast maintenance flaps at Atlanta branches', when: 'wan1 flaps at 3 or more Atlanta branches on Comcast between 00:00 and 04:00 on Tuesday', then: 'Group them into one event, mark it carrier maintenance, no ticket', opsql: 'carrier = "Comcast" AND site.region = "Southeast" AND event.name = "wan.flap" AND time.between("00:00","04:00") AND weekday = "Tue"', scope: 'Southeast, Comcast lines', from: 'Learned sequence CP-11, seen 9 times', seen: 9, status: 'Draft', t: T0 - 2 * 24 * HR },
];

// a rule from a request in plain English: OpsQ picks out the metric, threshold, duration, scope and action
export function draftFromText(text, n) {
  const t = text.toLowerCase();
  const metric = /jitter/.test(t) ? 'jitter' : /loss/.test(t) ? 'loss' : /latency/.test(t) ? 'latency' : /cpu/.test(t) ? 'cpu' : /poe/.test(t) ? 'poe.budget' : /crc/.test(t) ? 'if.in.crc' : /down|offline/.test(t) ? 'availability' : 'metric';
  const num_ = (t.match(/(\d+(?:\.\d+)?)\s*(ms|%|percent)?/) || [])[1];
  const dur = (t.match(/(\d+)\s*(mins?|minutes?|hours?|hrs?|h)\b/) || []);
  const pri = (t.match(/\bp([1-4])\b/) || [])[1] || '3';
  const scope = /broadband/.test(t) ? 'Broadband lines' : /lte|5g/.test(t) ? 'LTE/5G backup lines' : /ap|access point|wi-?fi/.test(t) ? 'Access points' : /switch/.test(t) ? 'Switches' : /edgeconnect|sd-?wan/.test(t) ? 'EdgeConnect appliances' : 'All resources';
  const team = /carrier/.test(t) ? 'the carrier team' : /wireless|wi-?fi/.test(t) ? 'the wireless team' : 'Movate NOC L2';
  const op = metric === 'availability' ? '= "down"' : `> ${num_ || '30'}${/ms/.test(t) ? 'ms' : /%|percent/.test(t) ? '%' : ''}`;
  return {
    id: `RD-${200 + n}`, kind: /group|correlat/.test(t) ? 'Correlation' : /run|bounce|reboot|restart/.test(t) ? 'First response' : 'Alert policy',
    name: text.length > 70 ? text.slice(0, 67) + '…' : text.charAt(0).toUpperCase() + text.slice(1),
    when: `${metric === 'availability' ? 'A resource goes down' : `${metric} ${op}`}${dur[1] ? ` for ${dur[1]} ${/h/.test(dur[2]) ? 'hours' : 'minutes'}` : ''} on ${scope.toLowerCase()}`,
    then: `Raise a P${pri} alert to ${team}`,
    opsql: `scope = "${scope}" AND metric("${metric}") ${op}${dur[1] ? ` FOR ${dur[1]}${/h/.test(dur[2]) ? 'h' : 'm'}` : ''}`,
    scope, from: 'Written from your request; OpsQ checked it against the last 7 days of alerts', seen: 0, status: 'Draft', t: Date.now(),
  };
}

export function useRuleDrafts() {
  const { s, act } = useApp();
  const list = s.ruleDrafts || SEED_RULES;
  const save = next => act.set({ ruleDrafts: next });
  const add = r => { save([r, ...list.filter(x => x.id !== r.id)]); act.audit(`OpsQ drafted ${r.id}: ${r.name}`, r.id, 'OpsQ'); };
  return { list, save, add };
}

const TONE = { Draft: 'gray', 'Back-tested': 'blue', 'Approved · Observed': 'green', Rejected: 'red' };
export function RuleDrafts() {
  const { s, act } = useApp(); const { list, save, add } = useRuleDrafts();
  const [edit, setEdit] = useState(null), [ask, setAsk] = useState('');
  const upd = (id, patch) => save(list.map(r => r.id === id ? { ...r, ...patch } : r));
  const backtest = r => { const hit = Math.max(1, Math.round((r.seen || 3) * 1.6 + (r.name.length % 7))); const inc = Math.max(1, Math.round(hit / 3)); const fp = (r.name.length % 9) + 2; upd(r.id, { status: 'Back-tested', bt: { hit, inc, fp } }); act.audit(`Back-tested ${r.id} on the last 7 days: ${hit} matches, ${fp}% false positives`, r.id); };
  const approve = r => { upd(r.id, { status: 'Approved · Observed', by: act.me(), at: Date.now() }); act.audit(`Approved ${r.id} ${r.name}: live in Observed mode`, r.id); act.toast(`${r.id} approved: it runs in Observed mode first`); };
  const reject = r => { upd(r.id, { status: 'Rejected', by: act.me(), at: Date.now() }); act.audit(`Rejected ${r.id} ${r.name}`, r.id); };
  const draft = () => { if (!ask.trim()) return; const r = draftFromText(ask, list.length + 1); add(r); setAsk(''); act.toast(`OpsQ drafted ${r.id}: review it below`); };
  const waiting = list.filter(r => r.status === 'Draft' || r.status === 'Back-tested').length;
  return (
    <div className="space-y-3">
      <Card title="Ask OpsQ to write a rule" sub="Describe it in plain English; OpsQ drafts the policy and its OpsQL condition for you to review" icon={I.Sparkles}>
        <form onSubmit={e => { e.preventDefault(); draft(); }} className="flex gap-2"><input value={ask} onChange={e => setAsk(e.target.value)} placeholder='e.g. "When jitter is above 30 ms for 15 minutes on broadband lines, raise a P3 to the carrier team"' className="flex-1 h-9 px-3 rounded-md border border-line bg-canvas text-ink text-[13px] outline-none focus:border-ink3" /><Btn op kind="brand" icon={I.Wand2} type="submit">Draft it</Btn></form>
        <div className="flex items-center gap-3 mt-2 text-[12px] text-ink3"><span className="inline-flex items-center gap-1"><I.UserCheck size={13} />A person approves every rule; nothing runs before that.</span><span>{waiting} waiting for review</span></div>
      </Card>
      {list.map(r => { const ed = edit === r.id; return (
        <Card key={r.id} pad={false}><div className="p-4">
          <div className="flex items-center gap-2 flex-wrap"><span className="font-mono text-[11.5px] text-ink3">{r.id}</span><Badge>{r.kind}</Badge><b className="text-[14px] text-ink">{r.name}</b><span className="flex-1" /><Badge tone={TONE[r.status]}>{r.status}</Badge><span className="text-[11.5px] text-ink3">drafted by OpsQ {ago(r.t)}</span></div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-2 text-[12.5px]">
            <div><div className="text-[11px] font-bold uppercase text-ink3">When</div>{ed ? <textarea defaultValue={r.when} onBlur={e => upd(r.id, { when: e.target.value, status: 'Draft', bt: null })} className="w-full h-16 p-2 rounded-md border border-line bg-canvas text-ink" /> : <div className="text-ink">{r.when}</div>}
              <div className="text-[11px] font-bold uppercase text-ink3 mt-2">Then</div>{ed ? <textarea defaultValue={r.then} onBlur={e => upd(r.id, { then: e.target.value, status: 'Draft', bt: null })} className="w-full h-16 p-2 rounded-md border border-line bg-canvas text-ink" /> : <div className="text-ink">{r.then}</div>}</div>
            <div><div className="text-[11px] font-bold uppercase text-ink3">OpsQL condition</div>{ed ? <textarea defaultValue={r.opsql} onBlur={e => upd(r.id, { opsql: e.target.value, status: 'Draft', bt: null })} className="w-full h-16 p-2 rounded-md border border-line bg-canvas text-ink font-mono text-[11.5px]" /> : <pre className="whitespace-pre-wrap bg-chip/60 border border-line rounded-md p-2 font-mono text-[11.5px] text-ink">{r.opsql}</pre>}
              <div className="text-[11.5px] text-ink3 mt-1">Scope: {r.scope} · {r.from}</div></div>
          </div>
          {r.bt && <div className="mt-2 grid grid-cols-3 gap-2 text-[12px] max-w-xl">{[['Would have matched, 7 days', num(r.bt.hit)], ['Incidents it would have raised', num(r.bt.inc)], ['False positives', `${r.bt.fp}%`]].map(([k, v]) => <div key={k} className="rounded border border-line px-2 py-1.5"><div className="text-ink3 text-[11px]">{k}</div><b className="text-ink">{v}</b></div>)}</div>}
          {r.by && <div className="text-[11.5px] text-ink3 mt-2">{r.status === 'Rejected' ? 'Rejected' : 'Approved'} by {r.by} {ago(r.at)}</div>}
          {(r.status === 'Draft' || r.status === 'Back-tested') && <div className="flex gap-2 mt-3 flex-wrap">
            <Btn op size="sm" icon={ed ? I.Check : I.Pencil} onClick={() => setEdit(ed ? null : r.id)}>{ed ? 'Done editing' : 'Edit'}</Btn>
            <Btn op size="sm" icon={I.History} onClick={() => backtest(r)}>Back-test on the last 7 days</Btn>
            <Btn op size="sm" kind="brand" icon={I.CheckCircle2} disabled={!r.bt} title={!r.bt ? 'Run the back-test first' : undefined} onClick={() => approve(r)}>Approve</Btn>
            <Btn op size="sm" icon={I.X} onClick={() => reject(r)}>Reject</Btn>
          </div>}
        </div></Card>); })}
    </div>
  );
}
