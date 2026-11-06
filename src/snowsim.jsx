// A working ServiceNow ticket, end to end. Send alerts from the tools into OpsRamp (drag or press Send): repeats are
// folded, known noise suppressed, and the first real alert opens a real console incident, shown as a ServiceNow
// ticket. Later alerts land on it as work notes. Assign or resolve in ServiceNow and OpsRamp follows; clear the alarm
// in OpsRamp and ServiceNow follows.
import React, { useState, useMemo } from 'react';
import * as I from 'lucide-react';
import * as D from './data.js';
import { useApp } from './store.jsx';
import { Card, Badge, Btn, Logo, Pri, cx } from './ui.jsx';
import { hhmmss, T0 } from './util.js';

const pickBranch = s => {
  const busy = new Set(s.incidents.map(i => i.branchId));
  return D.BRANCHES.find((b, i) => i > 300 && b.health === 'up' && !busy.has(b.id) && b.region !== 'Canada') || D.BRANCHES[412];
};
const alertsFor = b => [
  { id: 'a1', src: 'aruba', tool: 'Orchestrator', sev: 'Critical', msg: `${b.code}-ec01 lost contact on both paths`, fate: 'open' },
  { id: 'a2', src: 'opsramp', tool: 'OpsRamp SNMP', sev: 'Critical', msg: '3 switches unreachable (SNMP timeout)', fate: 'attach' },
  { id: 'a3', src: 'central', tool: 'Aruba Central', sev: 'Major', msg: '4 access points disconnected', fate: 'attach' },
  { id: 'a4', src: 'newrelic', tool: 'New Relic', sev: 'Major', msg: 'ERP login test failing from the branch', fate: 'attach' },
  { id: 'a5', src: 'aruba', tool: 'Orchestrator', sev: 'Critical', msg: `${b.code}-ec01 lost contact (repeat)`, fate: 'dedup' },
  { id: 'a6', src: 'aruba', tool: 'Orchestrator', sev: 'Info', msg: 'Tunnel re-key completed', fate: 'suppress' },
];
const FATE = { open: ['Opened incident', 'green'], attach: ['Work note on the incident', 'blue'], dedup: ['Folded into the open alert', 'gray'], suppress: ['Suppressed (FR-01)', 'gray'] };
const SN = '#293E40';

export function TicketSimulator() {
  const { s, act } = useApp();
  const [seed, setSeed] = useState(0);
  const b = useMemo(() => pickBranch(s), [seed]); // eslint-disable-line
  const ALERTS = useMemo(() => alertsFor(b), [b]);
  const [sent, setSent] = useState([]); // { id, t }
  const [incId, setIncId] = useState(null), [opener, setOpener] = useState(null);
  const [over, setOver] = useState(false);
  const live = incId && (s.incidents.find(i => i.id === incId) || s.resolved.find(i => i.id === incId));
  const closed = live && live.state === 'Resolved';
  const notes = live ? (live.notes || []).filter(n => n.sim) : [];
  const send = id => {
    if (closed || sent.some(x => x.id === id)) return;
    const a = ALERTS.find(x => x.id === id), now = Date.now();
    setSent(v => [...v, { id, t: now }]);
    const real = a.fate === 'open' || a.fate === 'attach';
    if (real && !incId) {
      const inc = D.buildIncident('edgedown', b, T0 - now, { pri: 'P2', title: 'Branch unreachable – EdgeConnect not responding' });
      inc.corr = 1; inc.notes = [{ t: now, who: 'OpsRamp', sim: 1, text: `Opened from ${a.tool}: ${a.msg}` }];
      act.add('incidents', inc); setIncId(inc.id); setOpener(id);
      act.audit(`OpsRamp opened ${inc.id} in ServiceNow from ${a.tool}`, inc.id, 'OpsRamp');
      act.toast(`${inc.id} created in ServiceNow`);
    } else if (real && incId) {
      act.upd('incidents', incId, x => ({ corr: (x.corr || 0) + 1, notes: [...x.notes, { t: now, who: 'OpsRamp', sim: 1, text: `Work note from ${a.tool}: ${a.msg}` }] }));
    } else if (a.fate === 'dedup' && incId) {
      act.upd('incidents', incId, x => ({ notes: [...x.notes, { t: now, who: 'OpsRamp', sim: 1, text: 'Repeat of the open alert: count 2, no new ticket' }] }));
    }
  };
  const assign = () => { const me = act.me().replace(/ \(.*/, ''); act.upd('incidents', incId, x => ({ assignee: me, acked: Date.now(), state: 'In Progress', notes: [...x.notes, { t: Date.now(), who: 'ServiceNow', sim: 1, text: `Assigned to ${me}; state In Progress (synced to OpsRamp)` }] })); act.toast('Assigned in ServiceNow; OpsRamp in step'); };
  const resolve = from => {
    const now = Date.now(), inc = s.incidents.find(i => i.id === incId); if (!inc) return;
    const closedInc = { ...inc, state: 'Resolved', resolved: now, closeCode: 'Remote recovery', notes: [...inc.notes, { t: now, who: from, sim: 1, text: from === 'ServiceNow' ? 'Resolved in ServiceNow; OpsRamp alert group closed' : 'Alarm cleared in OpsRamp; ServiceNow incident resolved' }] };
    act.del('incidents', incId); act.add('resolved', closedInc);
    act.audit(`${incId} resolved from ${from} (both systems closed)`, incId); act.toast(`${incId} resolved in both`);
  };
  const reset = () => { setSent([]); setIncId(null); setOpener(null); setSeed(x => x + 1); };
  const sentSet = new Set(sent.map(x => x.id));
  const out = sent.map(x => ({ ...x, a: ALERTS.find(y => y.id === x.id) }));
  const field = (k, v) => <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-2 py-1 border-b border-[#e3e8e8] text-[12px]"><span className="text-[#5b6b6c]">{k}</span><span className="text-[#1c2b2c] font-medium truncate">{v}</span></div>;
  return (
    <Card title="Alert to ServiceNow ticket" right={<div className="flex items-center gap-2"><span className="text-[12px] text-ink3">{b.name}</span><Btn size="sm" icon={I.RotateCcw} onClick={reset}>Reset</Btn></div>}>
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1.15fr)] gap-3 items-start">
        {/* the tools */}
        <div>
          <div className="text-[10.5px] font-bold uppercase text-ink3 mb-1.5">Alerts from the tools</div>
          <div className="space-y-1.5">{ALERTS.map(a => { const done = sentSet.has(a.id); return (
            <div key={a.id} draggable={!done && !closed} onDragStart={e => e.dataTransfer.setData('text/plain', a.id)} className={cx('rounded-lg border px-2.5 py-2 flex items-center gap-2 text-[12px]', done ? 'opacity-40 border-line' : 'border-dashed border-ink3/60 bg-panel cursor-grab hover:border-brand')}>
              <Logo k={a.src} h={11} className="!px-0.5 !py-0 shrink-0" />
              <span className="flex-1 min-w-0"><span className={cx('text-[10px] font-bold mr-1', a.sev === 'Critical' ? 'text-bad' : a.sev === 'Major' ? 'text-warn' : 'text-ink3')}>{a.sev.toUpperCase()}</span><span className="text-ink">{a.msg}</span></span>
              {!done && !closed && <button onClick={() => send(a.id)} className="text-[11px] font-bold text-brand hover:underline shrink-0">Send</button>}
            </div>); })}</div>
        </div>
        {/* OpsRamp */}
        <div onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={e => { e.preventDefault(); setOver(false); send(e.dataTransfer.getData('text/plain')); }}
          className={cx('rounded-xl border-2 border-dashed p-3 min-h-[300px] transition-colors', over ? 'border-brand bg-brand/10' : 'border-brand/40 bg-brand/[0.03]')}>
          <div className="flex items-center gap-2 mb-2"><span className="w-8 h-8 rounded-full bg-[#263040] grid place-items-center"><Logo k="opsramp" h={9} className="!border-0 !px-0.5" /></span><b className="text-[13px] text-ink flex-1">OpsRamp</b><Badge tone="blue">{sent.length} in</Badge></div>
          {!out.length && <div className="text-center text-[12px] text-ink3 py-10"><I.MousePointerClick size={22} className="mx-auto mb-1" />Drop alerts here</div>}
          <div className="space-y-1.5">{out.map(x => { const [l, t] = FATE[x.id === opener ? 'open' : x.a.fate === 'open' ? 'attach' : x.a.fate]; return (
            <div key={x.id} className="rounded-md border border-line bg-panel px-2 py-1.5 text-[11.5px] feed-in">
              <div className="flex items-center gap-1.5"><code className="text-ink3 text-[10.5px]">{hhmmss(x.t)}</code><span className="text-ink2 flex-1 truncate">{x.a.tool}</span><Badge tone={t}>{l}</Badge></div>
              <div className={cx('text-ink truncate', ['dedup', 'suppress'].includes(x.a.fate) && 'line-through text-ink3')}>{x.a.msg}</div>
            </div>); })}</div>
          {live && <div className="mt-3 rounded-lg border border-ai/40 bg-ai/[0.05] p-2.5 text-[12px]">
            <div className="flex items-center gap-1.5"><I.GitMerge size={14} className="text-ai" /><b className="text-ink flex-1">Alert group</b>{closed ? <Badge tone="green">Closed</Badge> : <Badge tone="amber">{live.state}</Badge>}</div>
            <div className="text-ink2 mt-0.5">{(live.corr || 1)} alert{(live.corr || 1) === 1 ? '' : 's'} · 1 ticket · {sent.filter(x => ['dedup', 'suppress'].includes(ALERTS.find(y => y.id === x.id).fate)).length} removed</div>
            {!closed && <Btn size="sm" className="mt-2" icon={I.CircleCheck} onClick={() => resolve('OpsRamp')}>Alarm clears</Btn>}
          </div>}
        </div>
        {/* ServiceNow */}
        <div className="rounded-xl overflow-hidden border border-[#cfd8d8] bg-white">
          <div className="px-3 py-2 flex items-center gap-2" style={{ background: SN }}><Logo k="servicenow" h={10} className="!border-0" /><span className="text-white/80 text-[11.5px] flex-1">Incident</span>{live && <span className={cx('text-[11px] font-bold rounded px-1.5 py-0.5', closed ? 'bg-[#62d84e] text-[#0b2a14]' : 'bg-white/15 text-white')}>{live.state}</span>}</div>
          {!live ? <div className="p-6 text-center text-[12px] text-[#5b6b6c]"><I.Ticket size={22} className="mx-auto mb-1" />No ticket yet</div> : <div className="p-3">
            <div className="flex items-center gap-2 mb-1.5"><b className="text-[15px] text-[#1c2b2c] font-mono">{live.id}</b><Pri p={live.pri} /><span className="flex-1" /><button onClick={() => act.openInc(live.id)} className="text-[11.5px] font-semibold text-[#1f7a6b] hover:underline">Open in console</button></div>
            {field('Short description', live.title)}
            {field('Caller', 'OpsRamp integration')}
            {field('Configuration item', live.ci)}
            {field('Location', b.name.replace(/ – .*/, '') + ', ' + b.city)}
            {field('Category', live.cat)}
            {field('Assignment group', live.group)}
            {field('Assigned to', live.assignee || '—')}
            <div className="text-[10.5px] font-bold uppercase text-[#5b6b6c] mt-2 mb-1">Activity</div>
            <div className="space-y-1 max-h-[150px] overflow-y-auto">{notes.slice().reverse().map((n, i) => <div key={i} className="text-[11.5px] rounded bg-[#f3f6f6] px-2 py-1"><span className="font-semibold text-[#1c2b2c]">{n.who}</span> <code className="text-[#5b6b6c] text-[10.5px]">{hhmmss(n.t)}</code><div className="text-[#2c3d3e]">{n.text}</div></div>)}</div>
            {!closed && <div className="flex gap-2 mt-2.5">{!live.assignee && <Btn size="sm" icon={I.UserCheck} onClick={assign}>Assign to me</Btn>}<Btn size="sm" kind="ok" icon={I.CircleCheck} onClick={() => resolve('ServiceNow')}>Resolve</Btn></div>}
          </div>}
        </div>
      </div>
    </Card>
  );
}
