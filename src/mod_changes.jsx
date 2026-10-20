import React, { useState, useMemo } from 'react';
import * as I from 'lucide-react';
import { LivePanel } from './liveui.jsx';
import * as D from './data.js';
import { useApp, useNow, gate, activeFreeze, branchClock } from './store.jsx';
import { Card, Badge, Btn, Table, PageHead, Tabs, Stat, Conf, GateBox, Modal, KV, cx, Progress, Select, Illus } from './ui.jsx';
import { Bars, Legend, C } from './charts.jsx';
import { num, pct, dur, ago, dt, dateShort, dayName, hhmm, MIN, HR, DAY, parts } from './util.js';
import { ChangeTrendCard, RiskHistCard, FirmwareProjectionCard } from './viz.jsx';

const NAC = [
  { id: 'MR-512', title: 'Branch template v42: enable BPDU guard on back-office access ports', file: 'templates/branch-switch.yaml', author: 'Knowledge Agent (from KB-DRAFT-77)', status: 'Open', scope: '1,792 standalone switches', diff: ['  interface-profile back-office:', '    vlan-access: 10', '+   bpdu-guard: enable', '+   loop-protect: enable', '    poe: enable'], checks: [['YAML lint', 'pass'], ['Policy: PCI segment untouched', 'pass'], ['Blast radius: access ports only, no uplinks', 'pass'], ['Freeze windows', 'warn', 'Month-end freeze in 10 days – schedule before'], ['Canary plan present', 'pass']] },
  { id: 'MR-515', title: 'SRS-SCAN: 2.4 GHz enabled for sites with legacy handhelds', file: 'templates/wlan/srs-scan.yaml', author: 'Marcus L.', status: 'Open', scope: '38 acquired branches', diff: ['  ssid: SRS-SCAN', '  opmode: wpa2-enterprise', '- bands: [5GHz]', '+ bands: [2.4GHz, 5GHz]', '+ min-rssi: -75', '  vlan: 30'], checks: [['YAML lint', 'pass'], ['Policy: PCI segment untouched', 'pass'], ['RF: co-channel risk on 2.4 GHz', 'warn', 'Use 20 MHz, channels 1/6/11 only'], ['Canary plan present', 'pass']] },
  { id: 'MR-509', title: 'Business intent policy: cloud application class priority (CHG0031881)', file: 'sdwan/bio/cloud-apps.yaml', author: 'Network Eng L3', status: 'Merged', scope: '933 EdgeConnects', diff: ['  overlays:', '    - name: RealTime', '    - name: CriticalApps', '+     match: [app:azure-apps, app:erp, app:pricing]', '+     path: [wan1, wan2]  # loss>2% → steer', '    - name: BulkApps'], checks: [['YAML lint', 'pass'], ['Orchestrator dry-run', 'pass'], ['Canary 20 sites', 'pass']] },
];

export function Changes() {
  const { s, act } = useApp();
  const now = useNow();
  const [tab, setTab] = useState(s.tab.changes || 'approvals');
  const [chg, setChg] = useState(null);
  const [mr, setMr] = useState(NAC[0].id);
  const [mrState, setMrState] = useState({});
  const [comment, setComment] = useState({});
  const go = t => { setTab(t); act.setTab('changes', t); };
  React.useEffect(() => { if (s.tab.changes && s.tab.changes !== tab) setTab(s.tab.changes); }, [s.tab.changes]);
  const pending = s.approvals.filter(a => a.status === 'Pending');
  const decided = s.approvals.filter(a => a.status !== 'Pending');

  const decide = (a, ok) => {
    act.upd('approvals', a.id, { status: ok ? 'Approved' : 'Rejected', by: act.me(), at: Date.now(), comment: comment[a.id] || '' });
    act.audit(`${ok ? 'Approved' : 'Rejected'} ${a.id}: ${a.title}`, a.id);
    if (ok && a.inc) { act.upd('incidents', a.inc, x => ({ rbState: 'done', notes: [...x.notes, { t: Date.now(), who: act.me(), text: `Approved ${a.id}. Executed with verification; rollback: ${a.rollback}` }], verify: x.verify.map(v => ({ ...v, st: 'pass', val: v.val || 'OK' })) })); }
    if (ok && a.type === 'Prediction') { act.upd('predictions', s.predictions.find(p => p.branchId === a.branchId)?.id, { status: 'Actioned' }); if (/carrier case/i.test(a.title)) { const b = D.BR[a.branchId]; const c = D.CIR[b.wan[0]]; const no = D.caseNo(c.carrier); act.add('cases', { id: no, carrier: c.carrier, circuit: c.id, inc: null, branchId: b.id, opened: Date.now(), status: 'Open – proactive (pre-failure)', eta: Date.now() + 8 * HR, lastUpdate: Date.now(), evidence: ['5-day loss trend', 'Prior outage signature'], escal: 0 }); } }
    if (ok && a.type === 'Change') { const id = `CHG00${31900 + Math.floor(Math.random() * 90)}`; act.add('changes', { id, title: a.title, type: 'Normal', risk: a.risk, state: 'Scheduled', start: now + 2 * DAY, end: now + 2 * DAY + 2 * HR, window: 'After branch close', scope: D.BR[a.branchId] ? D.BR[a.branchId].region : 'All regions', devices: 1, owner: act.me(), validation: 'Pending', nac: 'sites/override.yaml' }); }
    act.toast(`${a.id} ${ok ? 'approved' : 'rejected'}`, ok ? 'ok' : 'warn');
  };

  // firmware
  const fwRows = useMemo(() => {
    const g = {};
    D.DEVICES.forEach(d => { const k = d.type === 'AP' ? 'Access points (AOS 10)' : d.model === 'EC-XS' ? 'EdgeConnect EC-XS (ECOS)' : d.model === '2530' ? 'Aruba 2530 (AOS-S)' : `Aruba CX ${d.model} (AOS-CX)`; const list = D.FW_TARGET[d.type === 'AP' ? 'AP' : d.model]; const lvl = list.indexOf(d.fw); (g[k] = g[k] || { id: k, crit: d.type === 'SD-WAN', target: list[0], n: 0, l: [0, 0, 0, 0] }); g[k].n++; g[k].l[lvl]++; });
    return Object.values(g).map(r => ({ ...r, ok: r.crit ? r.l[0] + r.l[1] : r.l[0] + r.l[1] + r.l[2], below: r.crit ? r.l[2] + r.l[3] : r.l[3] }));
  }, []);
  const totOk = fwRows.reduce((a, r) => a + r.ok, 0), totN = fwRows.reduce((a, r) => a + r.n, 0);

  // calendar
  const pn = parts(now); const sod = now - ((pn.h * 60 + pn.m) * 60 + pn.s) * 1000;
  const days = Array.from({ length: 14 }, (_, k) => ({ k, start: sod + k * DAY, label: `${dayName(sod + k * DAY + 12 * HR)} ${dateShort(sod + k * DAY + 12 * HR)}` }));
  const chOn = d => s.changes.filter(c => (c.start >= d.start && c.start < d.start + DAY) || (d.k === 0 && c.start < sod && c.end > now));
  const frOn = d => s.freezes.filter(f => f.start < d.start + DAY && f.end > d.start);

  const cur = NAC.find(x => x.id === mr);
  return (
    <div>
      <PageHead icon={I.GitPullRequest} title="Approvals & Changes" sub="Human-in-the-loop queue for agent actions, the change calendar with freeze windows, Network-as-Code diffs, drift detection and firmware compliance." />
      <div className="kpi-strip grid grid-cols-2 lg:grid-cols-5 mb-3">
        <Stat label="Waiting for approval" icon={I.Hand} value={pending.length} tone={pending.length ? 'amber' : 'green'} onClick={() => go('approvals')} />
        <Stat label="Changes next 7 days" icon={I.CalendarRange} value={s.changes.filter(c => c.start > now && c.start < now + 7 * DAY).length} onClick={() => go('calendar')} />
        <Stat label="Freeze windows" icon={I.Snowflake} value={s.freezes.length} sub={s.freezes.find(f => now >= f.start && now <= f.end) ? 'one active now' : 'none active now'} />
        <Stat label="Config drift" icon={I.GitCompare} value={s.drift.filter(d => !d.done).length} tone="amber" sub={`${s.drift.filter(d => d.sev === 'High' && !d.done).length} high severity`} onClick={() => go('drift')} />
        <Stat label="Firmware policy" icon={I.ShieldCheck} value={pct(totOk / totN)} sub={`Annexure B #32 target 98%, ${num(totN - totOk)} below`} onClick={() => go('firmware')} tone={totOk / totN >= 0.92 ? 'green' : 'red'} />
      </div>
      <LivePanel kind="changes" className="mb-3 mt-3" />
      <Tabs value={tab} onChange={go} className="mb-3" tabs={[{ id: 'approvals', label: 'Approvals', count: pending.length }, { id: 'calendar', label: 'Change calendar' }, { id: 'nac', label: 'Network-as-Code', count: NAC.filter(m => (mrState[m.id] || m.status) === 'Open').length }, { id: 'drift', label: 'Drift', count: s.drift.filter(d => !d.done).length }, { id: 'firmware', label: 'Firmware compliance' }]} />

      {tab === 'approvals' && <div className="space-y-3">
        {pending.map(a => { const g = gate(s, { kind: a.type === 'Prediction' ? 'readonly' : 'change', conf: a.conf, branchId: a.branchId, now }); const b = D.BR[a.branchId]; return (
          <Card key={a.id} pad={false}><div className="p-4 grid lg:grid-cols-[minmax(0,1fr)_320px] gap-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap"><span className="font-mono text-[12px] text-ink3">{a.id}</span><Badge tone="purple"><I.Bot size={11} />{D.AGENTS[a.agent].name}</Badge><Badge>{a.type}</Badge><Badge tone={a.risk === 'High' ? 'red' : a.risk === 'Medium' ? 'amber' : 'green'}>Risk {a.risk}</Badge><span className="text-[11.5px] text-ink3">{ago(a.created, now)}</span></div>
              <div className="text-[15px] font-bold text-ink mt-1">{a.title}</div>
              {b && <div className="text-[12px] text-ink2">{b.name}, {b.brand}, local {branchClock(b, now).local}</div>}
              <div className="grid md:grid-cols-3 gap-3 mt-3 text-[12.5px]">
                <div><div className="text-[11px] font-bold text-ink3 mb-1">Evidence</div>{a.evidence.map(e => <div key={e} className="flex gap-1 text-ink"><I.Check size={13} className="text-ok mt-0.5 shrink-0" />{e}</div>)}</div>
                <div><div className="text-[11px] font-bold text-ink3 mb-1">Rollback</div><div className="text-ink2">{a.rollback}</div></div>
                <div><div className="text-[11px] font-bold text-ink3 mb-1">Verification</div>{a.verify.map(v => <div key={v} className="text-ink2">• {v}</div>)}</div>
              </div>
              {a.inc && <Btn size="xs" className="mt-2" icon={I.ExternalLink} onClick={() => act.openInc(a.inc)}>Open {a.inc}</Btn>}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between"><span className="text-[12px] text-ink3 font-semibold">Confidence</span><Conf value={a.conf} /></div>
              <GateBox g={{ auto: false, reasons: a.why }} compact />
              <input value={comment[a.id] || ''} onChange={e => setComment(c => ({ ...c, [a.id]: e.target.value }))} placeholder="Comment (optional)" className="w-full h-8 px-2 rounded-md border border-line bg-canvas text-[12.5px] text-ink outline-none" />
              <div className="flex gap-2"><Btn kind="ok" icon={I.Check} onClick={() => decide(a, true)} className="flex-1">Approve</Btn><Btn kind="danger" icon={I.X} onClick={() => decide(a, false)} className="flex-1">Reject</Btn></div>
            </div>
          </div></Card>); })}
        {!pending.length && <Card><div className="text-center py-8 text-ink3"><I.CheckCircle2 size={26} className="mx-auto mb-2 text-ok" />Queue is clear.</div></Card>}
        {decided.length > 0 && <Card title="Decided this shift" icon={I.History}><Table dense rows={decided} cols={[{ key: 'id', label: 'ID' }, { key: 'title', label: 'Action' }, { key: 'status', label: 'Decision', render: a => <Badge tone={a.status === 'Approved' ? 'green' : 'red'}>{a.status}</Badge> }, { key: 'by', label: 'By' }, { key: 'at', label: 'When', render: a => a.at ? hhmm(a.at) : '' }, { key: 'comment', label: 'Comment' }]} /></Card>}
      </div>}

      {tab === 'calendar' && <div className="grid xl:grid-cols-2 gap-3 mb-3"><ChangeTrendCard /><RiskHistCard /></div>}
      {tab === 'calendar' && <div className="grid xl:grid-cols-[minmax(0,1fr)_360px] gap-3">
        <Card title="Change calendar – next 14 days" sub="Shaded rows are freeze windows. Click a change for details and actions." icon={I.CalendarDays} pad={false}>
          <div className="px-4 pb-4">{days.map(d => { const fr = frOn(d); const uniq = chOn(d); return (
            <div key={d.k} className={cx('flex gap-3 border-b border-line/60 py-2 items-start', fr.length && 'bg-[repeating-linear-gradient(135deg,transparent,transparent_6px,rgb(var(--info)/0.07)_6px,rgb(var(--info)/0.07)_12px)]')}>
              <div className="w-24 shrink-0 text-[12.5px] font-bold text-ink">{d.k === 0 ? 'Today' : d.label}{d.k === 0 && <div className="text-[11px] font-normal text-ink3">{d.label}</div>}</div>
              <div className="flex-1 flex flex-wrap gap-1.5">
                {fr.map(f => <Badge key={f.id} tone="blue"><I.Snowflake size={11} />{f.name}</Badge>)}
                {uniq.map(c => <button key={c.id} onClick={() => setChg(c)} className={cx('text-left border rounded-md px-2 py-1 text-[12px] hover:shadow', c.state.startsWith('Paused') ? 'border-bad/50 bg-bad/5' : c.state === 'Implemented' ? 'border-ok/40 bg-ok/5' : 'border-line bg-panel')}><div className="font-semibold text-ink">{c.id}, {c.title}</div><div className="text-ink3">{c.window}, {c.state}, validation {c.validation}</div></button>)}
                {!fr.length && !uniq.length && <span className="text-[12px] text-ink3">—</span>}
              </div>
            </div>); })}</div>
        </Card>
        <div className="space-y-3">
          <Card title="Rules" icon={I.Scale}>
            {[['No autonomous changes during branch hours', 'Agents can recommend; a human approves anything that touches a trading branch.'], ['Freeze windows block normal changes', 'Only emergency changes with CAB chair approval.'], ['Below 80% confidence = human gate', 'Applies to every agent action.'], ['Stopping is always allowed', 'Change Validation can pause a rollout without approval; rollbacks follow the CHG plan.']].map(([h, t]) => <div key={h} className="py-1.5 border-b border-line/60 last:border-0"><div className="text-[12.5px] font-bold text-ink">{h}</div><div className="text-[12px] text-ink2">{t}</div></div>)}
          </Card>
          <Card title="Freeze windows" icon={I.Snowflake}>{s.freezes.map(f => <div key={f.id} className="text-[12.5px] py-1.5 border-b border-line/60 last:border-0"><div className="font-semibold text-ink">{f.name}</div><div className="text-ink3">{dt(f.start)} → {dt(f.end)}, {f.scope}</div><div className="text-ink2">{f.reason}</div></div>)}</Card>
        </div>
      </div>}

      {tab === 'nac' && <div className="grid xl:grid-cols-[300px_minmax(0,1fr)] gap-3">
        <Card title="Merge requests" icon={I.GitMerge} pad={false}><div className="p-2 space-y-1">{NAC.map(m => <button key={m.id} onClick={() => setMr(m.id)} className={cx('w-full text-left rounded-md px-2.5 py-2 text-[12.5px] border', mr === m.id ? 'border-ink3 bg-chip' : 'border-transparent hover:bg-chip')}><div className="flex items-center gap-1.5"><span className="font-mono text-ink3">{m.id}</span><Badge tone={(mrState[m.id] || m.status) === 'Merged' ? 'green' : (mrState[m.id] || m.status) === 'Changes requested' ? 'amber' : 'blue'}>{mrState[m.id] || m.status}</Badge></div><div className="font-semibold text-ink mt-0.5">{m.title}</div></button>)}</div></Card>
        <Card title={cur.title} sub={`${cur.file}, ${cur.author}, scope ${cur.scope}`} icon={I.FileCode2}>
          <pre className="bg-chip border border-line rounded-md p-3 text-[12px] font-mono leading-6 overflow-x-auto">{cur.diff.map((l, i) => <div key={i} className={l.startsWith('+') ? 'text-ok bg-ok/10 -mx-3 px-3' : l.startsWith('-') ? 'text-bad bg-bad/10 -mx-3 px-3' : 'text-ink'}>{l}</div>)}</pre>
          <div className="text-[12px] font-bold text-ink3 mt-3 mb-1">Change Validation Agent checks</div>
          {cur.checks.map(([n, st, note]) => <div key={n} className="flex items-center gap-2 text-[12.5px] py-1">{st === 'pass' ? <I.CheckCircle2 size={15} className="text-ok" /> : <I.AlertTriangle size={15} className="text-warn" />}<span className="text-ink">{n}</span>{note && <span className="text-ink3">– {note}</span>}</div>)}
          {(mrState[cur.id] || cur.status) === 'Open' && <div className="flex gap-2 mt-3"><Btn kind="ok" icon={I.GitMerge} onClick={() => { setMrState(x => ({ ...x, [cur.id]: 'Merged' })); const id = `CHG00${31950 + Math.floor(Math.random() * 40)}`; act.add('changes', { id, title: cur.title, type: 'Normal', risk: 'Low', state: 'Scheduled', start: now + 3 * DAY, end: now + 3 * DAY + 3 * HR, window: 'After branch close, canary first', scope: 'All regions', devices: 0, owner: act.me(), validation: 'Passed', nac: cur.file }); act.audit(`Merged ${cur.id} → ${id}`, cur.id); act.toast(`${cur.id} merged – ${id} scheduled with canary`); }}>Approve & merge (creates CHG)</Btn><Btn icon={I.MessageSquareWarning} onClick={() => { setMrState(x => ({ ...x, [cur.id]: 'Changes requested' })); act.audit(`Requested changes on ${cur.id}`, cur.id); }}>Request changes</Btn></div>}
        </Card>
      </div>}

      {tab === 'drift' && <Card title="Drift from golden configuration" sub="Nightly backups compared with the Network-as-Code repo" icon={I.GitCompare} pad={false}><div className="p-3">
        <Table rows={s.drift.map(d => ({ ...d, id: d.device }))} cols={[
          { key: 'device', label: 'Device', render: d => <span className="font-mono text-[12px] font-semibold">{d.device}</span> },
          { key: 'branch', label: 'Branch', get: d => D.BR[d.branchId].name, render: d => <div><div className="font-semibold whitespace-nowrap">{D.BR[d.branchId].name}</div><div className="text-[11px] text-ink3 truncate max-w-[200px]" title="">{D.BR[d.branchId].brand}</div></div> },
          { key: 'item', label: 'Drift' }, { key: 'sev', label: 'Severity', render: d => <Badge tone={d.sev === 'High' ? 'red' : d.sev === 'Medium' ? 'amber' : 'gray'}>{d.sev}</Badge> },
          { key: 'source', label: 'Source', render: d => <span className="text-[12px] text-ink2">{d.source}</span> },
          { key: 'since', label: 'Since', render: d => <span className="text-[12px] text-ink3">{ago(d.since, now)}</span> },
          { key: 'act', label: '', sortable: false, render: d => d.done ? <Badge tone="green">{d.done}</Badge> : <div className="flex gap-1 justify-end"><Btn size="xs" kind="brand" icon={I.Undo2} onClick={() => { const b = D.BR[d.branchId]; const g = gate(s, { kind: 'change', conf: 0.95, branchId: b.id, now }); act.upd('drift', d.device, { done: g.auto ? 'Restored to golden' : 'Remediation after close' }); act.audit(`Drift remediation ${g.auto ? 'run' : 'scheduled after branch close'}: ${d.device}`, d.device); act.toast(g.auto ? `${d.device} restored to golden config` : `Branch open – remediation scheduled after ${b.hours.close} local`, g.auto ? 'ok' : 'info'); }}>Restore golden</Btn><Btn size="xs" onClick={() => { act.upd('drift', d.device, { done: 'Accepted as baseline' }); act.audit(`Drift accepted as new baseline: ${d.device}`, d.device); }}>Accept</Btn></div> },
        ]} />
      </div></Card>}

      {tab === 'firmware' && <div className="mb-3"><FirmwareProjectionCard cur={totOk / totN} /></div>}
      {tab === 'firmware' && <div className="grid xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-3">
        <Card title="Firmware compliance by platform" sub="Policy (Annexure B #32): critical devices at N-1 or newer, others at N-2 or newer; Day-0 critical patches in the emergency window" icon={I.ShieldCheck}>
          <Table rows={fwRows} cols={[
            { key: 'id', label: 'Platform', render: r => <div><b>{r.id}</b>{r.crit && <Badge tone="brand" className="ml-1">critical</Badge>}</div> },
            { key: 'target', label: 'Target (N)', render: r => <span className="font-mono text-[12px]">{r.target}</span> },
            { key: 'n', label: 'Devices', right: true, render: r => num(r.n) },
            { key: 'dist', label: 'N / N-1 / N-2 / older', sortable: false, render: r => <div className="w-48"><div className="flex h-2 rounded-full overflow-hidden">{r.l.map((v, k) => <span key={k} style={{ width: `${v / r.n * 100}%`, background: [C.ok, C.info, C.warn, C.bad][k] }} />)}</div><div className="text-[11px] text-ink3 mt-0.5">{r.l.map(v => num(v)).join(' / ')}</div></div> },
            { key: 'ok', label: 'Compliant', right: true, render: r => <b className={r.ok / r.n >= 0.98 ? 'text-ok' : r.ok / r.n >= 0.92 ? 'text-warn' : 'text-bad'}>{pct(r.ok / r.n)}</b> },
            { key: 'below', label: 'Below policy', right: true, render: r => <span className={r.below ? 'text-bad font-semibold' : ''}>{num(r.below)}</span> },
          ]} />
          <Btn className="mt-3" kind="brand" icon={I.CalendarPlus} onClick={() => { const id = `CHG00${31960 + Math.floor(Math.random() * 30)}`; act.add('changes', { id, title: `Firmware remediation – ${num(totN - totOk)} devices below policy (waves by region)`, type: 'Normal', risk: 'Medium', state: 'Awaiting CAB', start: now + 6 * DAY, end: now + 6 * DAY + 5 * HR, window: 'Sat 21:00–02:00 local, canary first', scope: 'All regions', devices: totN - totOk, owner: act.me(), validation: 'Pending', nac: 'firmware/remediation.yaml' }); act.audit(`Created ${id} firmware remediation plan`, id); act.toast(`${id} created – awaiting CAB`); go('calendar'); }}>Plan remediation waves</Btn>
        </Card>
        <Card title="Day-0 critical advisories" icon={I.Siren}>
          {[['ECOS security advisory', 'EdgeConnect EC-XS', 'Applied to 933/933 within the emergency window', 'green'], ['AOS-CX advisory', 'CX 6100/6200/6300', '1,128 of 1,128 patched', 'green'], ['AOS 10 advisory', 'Access points', 'Rollout paused by validation – see CHG0031874', 'amber']].map(([t, p, st, tone]) => <div key={t} className="py-2 border-b border-line/60 last:border-0 text-[12.5px]"><div className="font-semibold text-ink">{t}</div><div className="text-ink3">{p}</div><Badge tone={tone} className="mt-1">{st}</Badge></div>)}
        </Card>
      </div>}

      <Modal open={!!chg} onClose={() => setChg(null)} title={chg && `${chg.id}, ${chg.title}`} sub={chg && `${chg.type} change, risk ${chg.risk}, ${chg.window}`} wide
        footer={chg && <>{['Awaiting CAB'].includes(chg.state) && <Btn kind="ok" icon={I.Check} onClick={() => { act.upd('changes', chg.id, { state: 'Approved' }); act.audit(`CAB approved ${chg.id}`, chg.id); setChg(null); }}>CAB approve</Btn>}<Btn icon={I.FlaskConical} onClick={() => { act.upd('changes', chg.id, { validation: 'Passed' }); act.audit(`Validation re-run ${chg.id}`, chg.id); act.toast('Change Validation Agent: pre-checks passed', 'info'); setChg(null); }}>Run validation</Btn><Btn icon={I.CalendarClock} onClick={() => { act.upd('changes', chg.id, x => ({ start: x.start + DAY, end: x.end + DAY })); act.audit(`Rescheduled ${chg.id} +1 day`, chg.id); setChg(null); }}>Move +1 day</Btn>{chg.state.startsWith('Paused') && <Btn kind="brand" icon={I.Play} onClick={() => { act.toast('Resume needs the revised plan approved first (APR-2241)', 'warn'); }}>Resume</Btn>}<div className="flex-1" /><Btn kind="danger" icon={I.Ban} onClick={() => { act.upd('changes', chg.id, { state: 'Cancelled' }); act.audit(`Cancelled ${chg.id}`, chg.id); setChg(null); }}>Cancel change</Btn></>}>
        {chg && <div className="grid md:grid-cols-2 gap-4">
          <div><KV k="State" v={chg.state} /><KV k="Window" v={`${dt(chg.start)} → ${dt(chg.end)} CT`} /><KV k="Scope" v={`${chg.scope}, ${num(chg.devices)} devices`} /><KV k="Owner" v={chg.owner} /><KV k="NaC file" v={<span className="font-mono">{chg.nac}</span>} /><KV k="Validation" v={chg.validation} />{chg.progress != null && <KV k="Progress" v={`${chg.progress} devices`} />}</div>
          <div className="space-y-2">{(() => { const f = s.freezes.find(f => chg.start < f.end && chg.end > f.start && (f.scope === 'All regions' || f.scope === chg.scope)); return f && !chg.title.includes('cutover') ? <div className="rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-[12.5px] text-ink"><b className="text-bad">Clashes with freeze:</b> {f.name}</div> : <div className="rounded-md border border-ok/40 bg-ok/10 px-3 py-2 text-[12.5px] text-ink">No freeze clash.</div>; })()}
            {chg.note && <div className="rounded-md border border-line bg-chip px-3 py-2 text-[12.5px] text-ink">{chg.note}</div>}
            <div className="text-[12.5px] text-ink2">Rollback: revert NaC commit and re-push previous version; canary first, then waves of ≤ 50 devices.</div></div>
        </div>}
      </Modal>
    </div>
  );
}
