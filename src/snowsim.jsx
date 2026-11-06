// A working ServiceNow ticket, end to end and automatic: alerts arrive from the tools, OpsRamp folds the repeats,
// suppresses known noise and creates the ServiceNow incident itself (a real console incident); later alerts land as
// work notes; Mova iO adds the root cause, assigns it and runs the recovery runbook; when the alarm clears OpsRamp
// resolves it in both systems. Nobody clicks anything; Pause and Replay only.
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

// the run, step by step: [ms after start, what happens]
const RUN = [
  [700, 'a1'], [1600, 'a2'], [2300, 'a5'], [2900, 'a6'], [3600, 'a3'], [4300, 'a4'],
  [5400, 'diag'], [6400, 'assign'], [7600, 'runbook'], [9800, 'clear'],
];
export function TicketSimulator() {
  const { s, act } = useApp();
  const [seed, setSeed] = useState(0);
  const b = useMemo(() => pickBranch(s), [seed]); // eslint-disable-line
  const ALERTS = useMemo(() => alertsFor(b), [b]);
  const [sent, setSent] = useState([]);
  const [incId, setIncId] = useState(null), [opener, setOpener] = useState(null);
  const [paused, setPaused] = useState(false), [step, setStep] = useState(0);
  const ref = React.useRef({}); ref.current = { s, incId, b, ALERTS };
  const live = incId && (s.incidents.find(i => i.id === incId) || s.resolved.find(i => i.id === incId));
  const closed = live && live.state === 'Resolved';
  const notes = live ? (live.notes || []).filter(n => n.sim) : [];
  const note = (id, who, text, patch = {}) => act.upd('incidents', id, x => ({ ...patch, notes: [...x.notes, { t: Date.now(), who, sim: 1, text }] }));
  const doStep = k => {
    const { incId: id, b: br, ALERTS: AL } = ref.current, now = Date.now();
    const a = AL.find(x => x.id === k);
    if (a) {
      setSent(v => [...v, { id: k, t: now }]);
      if (a.fate === 'open' && !id) {
        const inc = D.buildIncident('edgedown', br, T0 - now, { pri: 'P2', title: 'Branch unreachable – EdgeConnect not responding' });
        inc.corr = 1; inc.notes = [{ t: now, who: 'OpsRamp', sim: 1, text: `Created automatically from ${a.tool}: ${a.msg}` }];
        act.add('incidents', inc); setIncId(inc.id); setOpener(k); ref.current.incId = inc.id;
        act.audit(`OpsRamp created ${inc.id} in ServiceNow automatically (${a.tool})`, inc.id, 'OpsRamp');
      } else if (id && a.fate === 'attach') act.upd('incidents', id, x => ({ corr: (x.corr || 0) + 1, notes: [...x.notes, { t: now, who: 'OpsRamp', sim: 1, text: `Work note from ${a.tool}: ${a.msg}` }] }));
      else if (id && a.fate === 'dedup') note(id, 'OpsRamp', 'Repeat of the open alert: count 2, no new ticket');
      return;
    }
    if (!id) return;
    if (k === 'diag') note(id, 'Mova iO Diagnosis Agent', 'Root cause: SD-WAN appliance hang (72%). Both lines up at the modems; the carrier is not the cause');
    if (k === 'assign') { note(id, 'Mova iO Triage Agent', 'Assigned to Movate NOC – L2 Network; remote recovery first (state In Progress)', { assignee: 'Mova iO', acked: Date.now(), state: 'In Progress' }); act.audit(`Mova iO assigned ${id} and started remote recovery`, id, 'Mova iO'); }
    if (k === 'runbook') note(id, 'Mova iO Runbook Agent', 'RB-108 remote recovery: reload from the backup partition');
    if (k === 'clear') {
      const inc = ref.current.s.incidents.find(i => i.id === id); if (!inc) return;
      const t = Date.now();
      const done = { ...inc, state: 'Resolved', resolved: t, auto: true, closeCode: 'Auto-resolved (zero touch)', notes: [...inc.notes, { t, who: 'OpsRamp', sim: 1, text: 'Alarm cleared: SD-WAN appliance back online. Resolved in ServiceNow automatically (Auto-resolved, zero touch)' }] };
      act.del('incidents', id); act.add('resolved', done);
      act.audit(`OpsRamp resolved ${id} in ServiceNow automatically after RB-108`, id, 'OpsRamp');
    }
  };
  // the run plays by itself; pause stops the clock, replay starts a new event at another branch
  React.useEffect(() => {
    if (paused || step >= RUN.length) return;
    const prev = step ? RUN[step - 1][0] : 0;
    const t = setTimeout(() => { doStep(RUN[step][1]); setStep(x => x + 1); }, RUN[step][0] - prev);
    return () => clearTimeout(t);
  }, [step, paused, seed]); // eslint-disable-line
  const replay = () => { setSent([]); setIncId(null); setOpener(null); setStep(0); setPaused(false); setSeed(x => x + 1); };
  const sentSet = new Set(sent.map(x => x.id));
  const out = sent.map(x => ({ ...x, a: ALERTS.find(y => y.id === x.id) }));
  const finished = step >= RUN.length;
  const field = (k, v) => <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-2 py-1 border-b border-[#e3e8e8] text-[12px]"><span className="text-[#5b6b6c]">{k}</span><span className="text-[#1c2b2c] font-medium truncate">{v}</span></div>;
  return (
    <Card title="Alert to ServiceNow ticket, automatically" right={<div className="flex items-center gap-2"><span className="text-[12px] text-ink3">{b.name}</span>{!finished && <Btn size="sm" icon={paused ? I.Play : I.Pause} onClick={() => setPaused(p => !p)}>{paused ? 'Resume' : 'Pause'}</Btn>}<Btn size="sm" icon={I.RotateCcw} onClick={replay}>Replay</Btn></div>}>
      <div className="h-1 bg-chip rounded mb-3"><div className="h-1 bg-brand rounded transition-all duration-500" style={{ width: `${step / RUN.length * 100}%` }} /></div>
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1.15fr)] gap-3 items-start">
        <div>
          <div className="text-[10.5px] font-bold uppercase text-ink3 mb-1.5">Alerts from the tools</div>
          <div className="space-y-1.5">{ALERTS.map(a => { const on = sentSet.has(a.id); return (
            <div key={a.id} className={cx('rounded-lg border px-2.5 py-2 flex items-center gap-2 text-[12px] transition-all', on ? 'border-brand/50 bg-brand/[0.05]' : 'border-line opacity-50')}>
              <Logo k={a.src} h={11} className="!px-0.5 !py-0 shrink-0" />
              <span className="flex-1 min-w-0"><span className={cx('text-[10px] font-bold mr-1', a.sev === 'Critical' ? 'text-bad' : a.sev === 'Major' ? 'text-warn' : 'text-ink3')}>{a.sev.toUpperCase()}</span><span className="text-ink">{a.msg}</span></span>
              {on ? <I.ArrowRight size={14} className="text-brand shrink-0" /> : <span className="text-[10.5px] text-ink3 shrink-0">waiting</span>}
            </div>); })}</div>
        </div>
        <div className="rounded-xl border-2 border-brand/40 bg-brand/[0.03] p-3 min-h-[300px]">
          <div className="flex items-center gap-2 mb-2"><span className="w-8 h-8 rounded-full bg-[#263040] grid place-items-center"><Logo k="opsramp" h={9} className="!border-0 !px-0.5" /></span><b className="text-[13px] text-ink flex-1">OpsRamp</b><Badge tone="blue">{sent.length} in</Badge></div>
          <div className="space-y-1.5">{out.map(x => { const [l, t] = FATE[x.id === opener ? 'open' : x.a.fate === 'open' ? 'attach' : x.a.fate]; return (
            <div key={x.id} className="rounded-md border border-line bg-panel px-2 py-1.5 text-[11.5px] feed-in">
              <div className="flex items-center gap-1.5"><code className="text-ink3 text-[10.5px]">{hhmmss(x.t)}</code><span className="text-ink2 flex-1 truncate">{x.a.tool}</span><Badge tone={t}>{x.id === opener ? 'Ticket created' : l}</Badge></div>
              <div className={cx('text-ink truncate', ['dedup', 'suppress'].includes(x.a.fate) && 'line-through text-ink3')}>{x.a.msg}</div>
            </div>); })}</div>
          {live && <div className="mt-3 rounded-lg border border-ai/40 bg-ai/[0.05] p-2.5 text-[12px]">
            <div className="flex items-center gap-1.5"><I.GitMerge size={14} className="text-ai" /><b className="text-ink flex-1">Alert group</b>{closed ? <Badge tone="green">Closed</Badge> : <Badge tone="amber">{live.state}</Badge>}</div>
            <div className="text-ink2 mt-0.5">{(live.corr || 1)} alerts · 1 ticket · {sent.filter(x => ['dedup', 'suppress'].includes(ALERTS.find(y => y.id === x.id).fate)).length} removed</div>
          </div>}
        </div>
        <div className="rounded-xl overflow-hidden border border-[#cfd8d8] bg-white">
          <div className="px-3 py-2 flex items-center gap-2" style={{ background: SN }}><Logo k="servicenow" h={10} className="!border-0" /><span className="text-white/80 text-[11.5px] flex-1">Incident</span>{live && <span className={cx('text-[11px] font-bold rounded px-1.5 py-0.5', closed ? 'bg-[#62d84e] text-[#0b2a14]' : 'bg-white/15 text-white')}>{live.state}</span>}</div>
          {!live ? <div className="p-6 text-center text-[12px] text-[#5b6b6c]"><I.Ticket size={22} className="mx-auto mb-1" />Waiting for the first alert</div> : <div className="p-3">
            <div className="flex items-center gap-2 mb-1.5"><b className="text-[15px] text-[#1c2b2c] font-mono">{live.id}</b><Pri p={live.pri} /><span className="flex-1" /><button onClick={() => act.openInc(live.id)} className="text-[11.5px] font-semibold text-[#1f7a6b] hover:underline">Open in console</button></div>
            {field('Short description', live.title)}
            {field('Opened by', 'OpsRamp integration (automatic)')}
            {field('Configuration item', live.ci)}
            {field('Location', b.name.replace(/ – .*/, '') + ', ' + b.city)}
            {field('Assignment group', live.group)}
            {field('Assigned to', live.assignee || '—')}
            {closed && field('Close code', live.closeCode)}
            <div className="text-[10.5px] font-bold uppercase text-[#5b6b6c] mt-2 mb-1">Activity</div>
            <div className="space-y-1 max-h-[180px] overflow-y-auto">{notes.slice().reverse().map((n, i) => <div key={i} className="text-[11.5px] rounded bg-[#f3f6f6] px-2 py-1"><span className="font-semibold text-[#1c2b2c]">{n.who}</span> <code className="text-[#5b6b6c] text-[10.5px]">{hhmmss(n.t)}</code><div className="text-[#2c3d3e]">{n.text}</div></div>)}</div>
          </div>}
        </div>
      </div>
    </Card>
  );
}
