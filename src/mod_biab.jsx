import React, { useState, useMemo, useEffect } from 'react';
import * as I from 'lucide-react';
import * as D from './data.js';
import { useApp, useNow } from './store.jsx';
import { Card, Badge, Btn, Table, PageHead, Tabs, Stat, Modal, KV, cx, Progress, Select, Illus, ExportBtn, Dot, Logo } from './ui.jsx';
import { Bars, Legend, C, Ring } from './charts.jsx';
import { num, pct, dur, ago, dt, dateShort, MIN, HR, DAY, exportCSV } from './util.js';
import { ThroughputCard, SlipCard } from './viz.jsx';

const RAG = { Green: 'green', Amber: 'amber', Red: 'red' };
const daysTo = (t, now) => Math.round((t - now) / DAY);

export function BiaB() {
  const { s, act } = useApp();
  const now = useNow();
  const [tab, setTab] = useState(s.tab.biab || 'portfolio');
  useEffect(() => { if (s.tab.biab && s.tab.biab !== tab) setTab(s.tab.biab); }, [s.tab.biab]);
  const go = t => { setTab(t); act.setTab('biab', t); };
  const [pid, setPid] = useState(s.biabProject || 'BIB-0141');
  useEffect(() => { if (s.biabProject) setPid(s.biabProject); }, [s.biabProject]);
  const [track, setTrack] = useState('All');
  const [open, setOpen] = useState(null);
  const P = s.projects;
  const inflight = P.filter(p => p.stage !== 'BAU');
  const cut = P.filter(p => p.stage === 'Cutover');
  const gatesPassed = cut.reduce((a, p) => a + p.gates.filter(g => g.st === 'Pass').length, 0), gatesTot = cut.length * 13;
  const proj = P.find(p => p.id === pid) || P[0];

  return (
    <div>
      <PageHead icon={I.PackageCheck} title="Branch-in-a-Box" sub="One standard kit and one board for every new or acquired branch. Brings a site onto the SRS standard network – usually over a weekend – without disrupting trade. Acquired brands keep their names."
        right={<><ExportBtn label="Onboarding report" onClick={() => exportCSV('srs-branch-in-a-box-portfolio.csv', P, [{ label: 'ID', key: 'id' }, { label: 'Track', key: 'track' }, { label: 'Brand', key: 'brand' }, { label: 'Site', key: 'site' }, { label: 'Stage', key: 'stage' }, { label: 'RAG', key: 'rag' }, { label: 'Gates passed', get: p => p.gates.filter(g => g.st === 'Pass').length }, { label: 'Go-live', get: p => new Date(p.golive).toISOString().slice(0, 10) }, { label: 'Blockers', get: p => p.blockers.join('; ') }])} /><Btn kind="brand" icon={I.Plus} onClick={() => act.set({ wizard: true })}>Start new Branch-in-a-Box</Btn></>} />
      <div className="kpi-strip grid grid-cols-2 lg:grid-cols-6 mb-3">
        <Stat label="In flight" icon={I.Rocket} value={inflight.length} sub={`${inflight.filter(p => p.track === 'Acquired').length} acquired, ${inflight.filter(p => p.track === 'Greenfield').length} greenfield`} />
        <Stat label="Acquisitions running at once" icon={I.Building2} value={new Set(inflight.filter(p => p.track === 'Acquired').map(p => p.brand)).size} sub="brands keep their names" />
        <Stat label="Cutover now" icon={I.CalendarClock} value={cut.length} sub="Fri close → Mon 06:00" onClick={() => go('cutover')} />
        <Stat label="Cutover gates passed" icon={I.ListChecks} value={gatesTot ? `${gatesPassed}/${gatesTot}` : '—'}><Progress value={gatesTot ? gatesPassed / gatesTot : 0} className="mt-2" /></Stat>
        <Stat label="Amber / red" icon={I.AlertTriangle} value={<span><span className="text-warn">{P.filter(p => p.rag === 'Amber').length}</span><span className="text-ink3 text-[18px]"> / </span><span className="text-bad">{P.filter(p => p.rag === 'Red').length}</span></span>} sub="each with owner + fix date" />
        <Stat label="In hypercare" icon={I.HeartHandshake} value={P.filter(p => p.stage === 'Hypercare').length} sub="14 days, tighter thresholds" />
      </div>
      <Tabs value={tab} onChange={go} className="mb-3" tabs={[{ id: 'portfolio', label: 'Portfolio', icon: I.LayoutGrid }, { id: 'tracks', label: 'Two tracks', icon: I.Split }, { id: 'kit', label: 'Kit & VLANs', icon: I.Package }, { id: 'floor', label: 'Floor plan', icon: I.Map }, { id: 'steps', label: 'Acquired-branch steps', icon: I.ListTodo }, { id: 'cutover', label: 'Cutover weekend', icon: I.Timer }, { id: 'parity', label: 'Day-1 parity', icon: I.Scale }]} />
      {tab === 'portfolio' && <Portfolio track={track} setTrack={setTrack} onOpen={setOpen} now={now} />}
      {tab === 'tracks' && <TracksView onOpen={setOpen} now={now} />}
      {tab === 'kit' && <Kit />}
      {tab === 'floor' && <FloorPlan />}
      {tab === 'steps' && <Steps pid={pid} setPid={setPid} />}
      {tab === 'cutover' && <Cutover pid={pid} setPid={setPid} now={now} />}
      {tab === 'parity' && <Parity pid={pid} setPid={setPid} />}
      <ProjectModal p={open && P.find(x => x.id === open)} onClose={() => setOpen(null)} go={(t, id) => { setPid(id); go(t); setOpen(null); }} now={now} />
      <Wizard />
    </div>
  );
}

function ProjCard({ p, onOpen, now }) {
  const pass = p.gates.filter(g => g.st === 'Pass').length; const d = daysTo(p.golive, now);
  return (
    <button onClick={() => onOpen(p.id)} className="w-full text-left bg-panel border border-line rounded-md p-2.5 hover:border-ink3">
      <div className="flex items-center gap-1.5"><span className="text-[10.5px] font-mono text-ink3">{p.id}</span><span className="flex-1" /><Dot tone={RAG[p.rag]} /></div>
      <div className="text-[13px] font-bold text-ink leading-tight mt-0.5">{p.brand}</div>
      <div className="text-[11.5px] text-ink2">{p.site}</div>
      <div className="flex items-center gap-1 mt-1.5 flex-wrap"><Badge tone={p.track === 'Acquired' ? 'purple' : 'blue'}>{p.track === 'Acquired' ? <I.Building2 size={10} /> : <I.Sprout size={10} />}{p.track}</Badge><Badge>{p.size}</Badge><span className="text-[11px] text-ink3 ml-auto">{d >= 0 ? `go-live in ${d}d` : `live ${-d}d`}</span></div>
      <div className="flex gap-[2px] mt-2">{p.gates.map(g => <span key={g.i} className={cx('h-1.5 flex-1 rounded-sm', g.st === 'Pass' ? 'bg-ok' : g.st === 'Fail' ? 'bg-bad' : 'bg-chip')} />)}</div>
      {p.blockers[0] && <div className="text-[11px] text-warn mt-1.5 flex gap-1"><I.AlertTriangle size={12} className="shrink-0 mt-[1px]" />{p.blockers[0]}</div>}
    </button>
  );
}

function Portfolio({ track, setTrack, onOpen, now }) {
  const { s } = useApp();
  const P = s.projects.filter(p => track === 'All' || p.track === track);
  const data = D.STAGES.map(st => ({ label: st, Greenfield: s.projects.filter(p => p.stage === st && p.track === 'Greenfield').length, Acquired: s.projects.filter(p => p.stage === st && p.track === 'Acquired').length }));
  return (<>
    <Card title="Projects by stage" sub="Greenfield and acquired, from planned to business as usual" icon={I.BarChart3} right={<Legend items={[['Greenfield', C.info], ['Acquired', C.ai]]} />}>
      <Bars data={data} keys={['Greenfield', 'Acquired']} colors={[C.info, C.ai]} h={150} />
    </Card>
    <div className="grid xl:grid-cols-[1.3fr_1fr] gap-3 mt-3"><ThroughputCard /><SlipCard /></div>
    <div className="flex items-center gap-2 mt-3 mb-2"><Tabs size="sm" value={track} onChange={setTrack} tabs={[{ id: 'All', label: 'Both tracks', count: s.projects.length }, { id: 'Greenfield', label: 'Greenfield', count: s.projects.filter(p => p.track === 'Greenfield').length }, { id: 'Acquired', label: 'Acquired', count: s.projects.filter(p => p.track === 'Acquired').length }]} /><span className="text-[12px] text-ink3">Schedules and greenfield sites are <Illus />. Acquisitions are SRS public announcements.</span></div>
    <div className="grid grid-flow-col auto-cols-[minmax(210px,1fr)] gap-2 overflow-x-auto pb-2">
      {D.STAGES.map(st => { const list = P.filter(p => p.stage === st); return (
        <div key={st} className="bg-chip/60 border border-line rounded-md p-2 min-h-[200px]">
          <div className="flex items-center gap-1.5 px-1 pb-2"><span className="text-[12.5px] font-bold text-ink">{st}</span><Badge>{list.length}</Badge></div>
          <div className="space-y-2">{list.map(p => <ProjCard key={p.id} p={p} onOpen={onOpen} now={now} />)}</div>
        </div>); })}
    </div>
  </>);
}

function TracksView({ onOpen, now }) {
  const { s } = useApp();
  const acq = s.projects.filter(p => p.track === 'Acquired'), gf = s.projects.filter(p => p.track === 'Greenfield');
  const col = (title, sub, icon, steps, list, tone) => (
    <Card title={title} sub={sub} icon={icon}>
      <ol className="relative border-l-2 border-line ml-2 space-y-3 mb-3">{steps.map((st, k) => <li key={st.id} className="ml-4"><span className={cx('absolute -left-[9px] w-4 h-4 rounded-full text-[9px] font-bold text-white flex items-center justify-center', tone === 'purple' ? 'bg-ai' : 'bg-info')}>{k + 1}</span><div className="text-[13px] font-bold text-ink">{st.name}</div><div className="text-[12px] text-ink2">{st.desc}</div></li>)}</ol>
      <div className="text-[11.5px] font-bold text-ink3 mb-1.5">Projects on this track</div>
      <div className="grid sm:grid-cols-2 gap-2">{list.map(p => <ProjCard key={p.id} p={p} onOpen={onOpen} now={now} />)}</div>
    </Card>);
  return (<div className="grid xl:grid-cols-2 gap-3">
    {col('Greenfield branch', 'A new SRS branch on a blank site', I.Sprout, D.GREEN_STEPS, gf, 'blue')}
    {col('Acquired branch', 'An acquired distributor where staff, yard and customers stay – and the brand name stays', I.Building2, D.ACQ_STEPS, acq, 'purple')}
  </div>);
}

function Kit() {
  const [size, setSize] = useState('M');
  const groups = [...new Set(D.KIT.map(k => k.group))];
  const gi = { WAN: I.Globe, LAN: I.Network, Wireless: I.Wifi, Power: I.BatteryCharging, Management: I.Terminal, Physical: I.Cable };
  return (<div className="grid xl:grid-cols-[1.4fr_1fr] gap-3">
    <Card title="Kit contents – bill of materials" sub="Same kit, same golden config, every site. Quantities follow the size profile." icon={I.Package} right={<Tabs size="sm" value={size} onChange={setSize} tabs={[{ id: 'S', label: 'Small' }, { id: 'M', label: 'Medium' }, { id: 'L', label: 'Large' }]} />}>
      <div className="grid md:grid-cols-2 gap-2">{groups.map(g => { const Ic = gi[g] || I.Box; return (
        <div key={g} className="border border-line rounded-md p-2.5"><div className="flex items-center gap-1.5 text-[12px] font-bold text-ink3 mb-1.5"><Ic size={14} />{g}</div>
          {D.KIT.filter(k => k.group === g).map(k => { const q = k.qty.includes('·') ? (k.qty.split('·').map(x => x.trim()).find(x => x.startsWith(size + ':') || x.startsWith(size === 'L' ? 'L' : 'S/M')) || k.qty) : k.qty; return <div key={k.item} className="py-1.5 border-b border-line/60 last:border-0"><div className="flex gap-2"><span className="text-[12.5px] font-semibold text-ink flex-1">{k.item}</span><Badge tone="dark">{q.replace(/^[SML/]+:\s*/, '')}</Badge></div><div className="text-[11.5px] text-ink2">{k.note}</div></div>; })}
        </div>); })}</div>
    </Card>
    <div className="space-y-3">
      <Card title="Standard VLANs" sub="Applied from Network-as-Code at the VLAN gate" icon={I.Layers}>
        {D.VLANS.map(v => <div key={v.id} className="flex items-center gap-2 py-1.5 border-b border-line/60 last:border-0"><span className="w-9 text-center text-[11px] font-bold text-white rounded py-0.5" style={{ background: v.color }}>{v.id}</span><div className="flex-1"><div className="text-[12.5px] font-semibold text-ink">{v.name}</div><div className="text-[11.5px] text-ink2">{v.note}</div></div></div>)}
      </Card>
      <Card title="PCI: POS / payment segment" icon={I.ShieldCheck}>
        <div className="text-[12.5px] text-ink2 space-y-1.5"><p>VLAN 20 is kept apart: own firewall zone on the EdgeConnect, no routes to corporate, scanners, cameras or guest. Payment terminals reach only the processor.</p><p>Gate 8 (POS / payment test) must pass before StoreOps can sign off. Legacy POS from an acquired branch is replaced, not re-used.</p></div>
      </Card>
    </div>
  </div>);
}

function FloorPlan() {
  const [z, setZ] = useState('warehouse');
  const zone = D.ZONES.find(x => x.id === z);
  const vl = id => D.VLANS.find(v => v.id === id);
  const apDots = { counter: [[200, 115]], office: [[95, 245]], warehouse: [[340, 110], [420, 200], [510, 110]], docks: [[640, 170]], yard: [[130, 390], [430, 390]], trucks: [[610, 360]] };
  return (<div className="grid xl:grid-cols-[1.5fr_1fr] gap-3">
    <Card title="Standard branch floor plan (medium profile)" sub="Click a zone to see devices, drops and VLANs. Layout is a template, not a specific SRS site." icon={I.Map} right={<Illus>Template</Illus>}>
      <svg viewBox="0 0 760 470" className="w-full">
        <rect x="10" y="10" width="740" height="450" rx="8" className="fill-chip stroke-line" />
        {D.ZONES.map(zz => <g key={zz.id} onClick={() => setZ(zz.id)} className="cursor-pointer">
          <rect x={zz.x} y={zz.y} width={zz.w} height={zz.h} rx="6" className={cx(z === zz.id ? 'fill-brand/15 stroke-brand' : zz.id === 'yard' || zz.id === 'trucks' ? 'fill-ok/10 stroke-line' : 'fill-panel stroke-line')} strokeWidth={z === zz.id ? 2.5 : 1.2} strokeDasharray={zz.id === 'yard' || zz.id === 'trucks' ? '6 4' : undefined} />
          <text x={zz.x + 10} y={zz.y + 20} fontSize="13" fontWeight="800" className="fill-ink">{zz.short}</text>
          <text x={zz.x + 10} y={zz.y + 35} fontSize="10.5" className="fill-ink3">{zz.drops ? `${zz.drops} drops` : 'rack'}</text>
          <text x={zz.x + 10} y={zz.y + 48} fontSize="10.5" className="fill-ink3">VLAN {zz.vlans.join(', ')}</text>
          {zz.id === 'closet' && <g transform={`translate(${zz.x + 22},${zz.y + 60})`}>{[0, 1, 2, 3].map(k => <rect key={k} y={k * 14} width="34" height="10" rx="2" fill={['#762123', '#334155', '#334155', '#16a34a'][k]} />)}</g>}
          {(apDots[zz.id] || []).map(([x, y], k) => <g key={k} transform={`translate(${x},${y})`}><circle r="11" fill={zz.id === 'yard' || zz.id === 'trucks' ? C.ok : C.info} opacity="0.18" /><circle r="5" fill={zz.id === 'yard' || zz.id === 'trucks' ? C.ok : C.info} /></g>)}
          {zz.id === 'docks' && [60, 120, 180, 240].map(y => <rect key={y} x={zz.x + zz.w - 12} y={zz.y + y - 20} width="10" height="26" className="fill-ink3" />)}
          {zz.id === 'trucks' && [0, 1].map(k => <rect key={k} x={zz.x + 30 + k * 56} y={zz.y + 86} width="44" height="58" rx="4" className="fill-panel stroke-ink3" />)}
        </g>)}
      </svg>
      <div className="flex gap-4 text-[11.5px] text-ink2 mt-1"><span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: C.info }} />Indoor AP-635</span><span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: C.ok }} />Rugged outdoor AP (AP-565/585)</span><span className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-ink3" />Outdoor</span></div>
    </Card>
    <Card title={zone.name} sub={`${zone.drops} cabled drops`} icon={I.MapPin}>
      <div className="text-[11.5px] font-bold text-ink3 mb-1">Devices</div>
      {zone.devices.map(d => <div key={d} className="text-[12.5px] text-ink flex gap-1.5 py-0.5"><I.Cpu size={14} className="text-ink3 mt-0.5" />{d}</div>)}
      <div className="text-[11.5px] font-bold text-ink3 mt-3 mb-1">VLANs present</div>
      <div className="space-y-1">{zone.vlans.map(id => { const v = vl(id); return <div key={id} className="flex items-center gap-2 text-[12.5px]"><span className="w-8 text-center text-[11px] font-bold text-white rounded" style={{ background: v.color }}>{id}</span><span className="text-ink font-semibold">{v.name}</span><span className="text-ink3 truncate">{v.note}</span></div>; })}</div>
      <div className="text-[11.5px] font-bold text-ink3 mt-3 mb-1">What is tested at cutover</div>
      <div className="text-[12.5px] text-ink2">{{ counter: 'POS / payment test (gate 8), label printer, phones.', office: 'ERP login, MFP print, phones.', closet: 'EdgeConnect zero-touch, switch stack, UPS on line, OOB console reachable over cellular.', warehouse: 'All handhelds online, roaming walk-test down each aisle, label printers (gate 9).', docks: 'Handheld coverage at every dock door, door sensors on VLAN 70.', yard: 'Outdoor AP coverage across the yard for scanners; cameras on VLAN 50.', trucks: 'Truck tablets post location and proof-of-delivery photo (gate 11).' }[zone.id]}</div>
    </Card>
  </div>);
}

function ProjectPicker({ pid, setPid, filter = () => true }) {
  const { s } = useApp();
  return <Select icon={I.FolderKanban} label="Project" value={pid} onChange={setPid} options={s.projects.filter(filter).map(p => ({ value: p.id, label: `${p.brand} – ${p.site}` }))} />;
}

function Steps({ pid, setPid }) {
  const { s, act } = useApp();
  const acq = s.projects.filter(p => p.track === 'Acquired');
  const p = acq.find(x => x.id === pid) || acq[0];
  const [sel, setSel] = useState(Object.entries(p.steps).find(([, v]) => v === 'active')?.[0] || 'discovery');
  const [onb, setOnb] = useState({});
  const step = D.ACQ_STEPS.find(x => x.id === sel);
  const complete = id => { const idx = D.ACQ_STEPS.findIndex(x => x.id === id); act.upd('projects', p.id, x => ({ steps: { ...x.steps, [id]: 'done', ...(D.ACQ_STEPS[idx + 1] ? { [D.ACQ_STEPS[idx + 1].id]: 'active' } : {}) } })); act.audit(`${p.brand}: step "${D.ACQ_STEPS[idx].name}" completed`, p.id); act.toast(`${D.ACQ_STEPS[idx].name} complete`); if (D.ACQ_STEPS[idx + 1]) setSel(D.ACQ_STEPS[idx + 1].id); };
  const onbItems = ['OpsRamp: discovery + agentless SNMP/API monitors', 'Aruba Central: devices claimed, group = SRS-Branch-' + p.size, 'Orchestrator: EC bound to branch template', 'ServiceNow CMDB: CIs + relationships created', 'Runbooks RB-101…110 enabled for site', 'Readiness checks scheduled 05:30 local', 'Mova iO agents scoped to site'];
  const runOnb = () => onbItems.forEach((it, k) => setTimeout(() => setOnb(o => ({ ...o, [it]: true })), 450 * (k + 1)));
  return (<div>
    <div className="flex items-center gap-2 mb-3"><ProjectPicker pid={p.id} setPid={id => { setPid(id); }} filter={x => x.track === 'Acquired'} /><Badge tone="purple">Acquired, brand kept</Badge><span className="text-[12px] text-ink3">{p.acquired}</span></div>
    <div className="grid xl:grid-cols-[300px_1fr] gap-3">
      <Card title="Steps" icon={I.ListTodo} pad={false}><div className="p-2">{D.ACQ_STEPS.map((st, k) => { const v = p.steps[st.id] || 'todo'; return <button key={st.id} onClick={() => setSel(st.id)} className={cx('w-full text-left flex items-start gap-2 rounded-md px-2 py-2', sel === st.id ? 'bg-chip' : 'hover:bg-chip/60')}>{v === 'done' ? <I.CheckCircle2 size={17} className="text-ok mt-0.5" /> : v === 'active' ? <I.CircleDot size={17} className="text-info mt-0.5" /> : <I.Circle size={17} className="text-ink3 mt-0.5" />}<div><div className="text-[13px] font-semibold text-ink">{k + 1}. {st.name}</div><div className="text-[11.5px] text-ink3">{v}</div></div></button>; })}</div></Card>
      <Card title={step.name} sub={step.desc} icon={I.ClipboardList} right={(p.steps[sel] === 'active') && <Btn kind="ok" icon={I.Check} onClick={() => complete(sel)}>Complete step</Btn>}>
        {sel === 'discovery' && <div className="grid md:grid-cols-2 gap-3">
          <div><div className="text-[11.5px] font-bold text-ink3 mb-1">Legacy kit found</div>{(p.legacy.length ? p.legacy : [['Discovery scan pending', '—', '—']]).map(([k]) => <div key={k} className="text-[12.5px] py-1 border-b border-line/60 text-ink">{k}</div>)}</div>
          <div><div className="text-[11.5px] font-bold text-ink3 mb-1">Carriers & contracts</div>{(p.carriers.length ? p.carriers : ['Collecting invoices from acquired finance team']).map(c => <div key={c} className="text-[12.5px] py-1 border-b border-line/60 text-ink">{c}</div>)}<div className="text-[11.5px] text-ink3 mt-2">Imported into ServiceNow as "acquired – pending" CIs; nothing is monitored as SRS standard until cutover.</div></div>
        </div>}
        {sel === 'audit' && <Table dense rows={[['Power: dedicated 20 A circuit in closet', 'pass'], ['Cooling: closet under 27 °C at 15:00', p.id === 'BIB-0142' ? 'fail' : 'pass'], ['Closet lockable, wall-mount rack space', p.id === 'BIB-0142' ? 'fail' : 'pass'], ['Cabling: Cat6 to counter, office, warehouse', 'pass'], ['Yard: pole / wall mounts for outdoor APs', 'pass'], ['Photos uploaded to ServiceNow', 'pass']].map(([n, st]) => ({ id: n, n, st }))} cols={[{ key: 'n', label: 'Check' }, { key: 'st', label: 'Result', render: r => <Badge tone={r.st === 'pass' ? 'green' : 'red'}>{r.st}</Badge> }]} />}
        {sel === 'triage' && <Table dense rows={(p.legacy.length ? p.legacy : [['No legacy kit recorded', '—', '—']]).map(([n, d, c]) => ({ id: n, n, d, c: (s.certs || {})[p.id + n] || c }))} cols={[{ key: 'n', label: 'Legacy item' }, { key: 'd', label: 'Decision', render: r => <Badge tone={r.d.startsWith('Keep') ? 'green' : r.d.startsWith('Replace') ? 'blue' : 'amber'}>{r.d}</Badge> }, { key: 'c', label: 'Data destruction certificate', render: r => r.c === 'Cert pending' ? <Btn size="xs" icon={I.FileCheck2} onClick={() => { act.map('certs', p.id + r.n, `Cert DDC-${Math.floor(10000 + Math.random() * 89999)} attached`); act.audit(`Data destruction certificate attached: ${r.n}`, p.id); }}>Attach certificate</Btn> : <span className="text-[12px] text-ink2">{r.c}</span> }]} />}
        {sel === 'erp' && <div className="space-y-1.5">{['Branch set up in SRS ERP (branch code, pricing zone)', 'Customer accounts migrated and checked with branch manager', 'POS terminals re-keyed on PCI segment (VLAN 20)', 'Roof Hub: branch selectable for orders and delivery tracking', 'Label printers and pick tickets print from SRS ERP', 'Staff log-ins and training complete'].map((t, k) => <div key={t} className="flex items-center gap-2 text-[12.5px]">{k < (p.steps.erp === 'done' ? 6 : 3) ? <I.CheckCircle2 size={15} className="text-ok" /> : <I.Circle size={15} className="text-ink3" />}<span className="text-ink">{t}</span></div>)}</div>}
        {sel === 'onboard' && <div><div className="space-y-1.5 mb-3">{onbItems.map(it => <div key={it} className="flex items-center gap-2 text-[12.5px]">{onb[it] || p.steps.onboard === 'done' ? <I.CheckCircle2 size={15} className="text-ok" /> : <I.Circle size={15} className="text-ink3" />}<span className="text-ink">{it}</span></div>)}</div><div className="flex items-center gap-2"><Btn icon={I.Play} onClick={runOnb}>Run onboarding automation</Btn><Logo k="opsramp" h={12} /><Logo k="central" h={12} /><Logo k="servicenow" h={9} /><Logo k="movaio" h={12} /></div></div>}
        {sel === 'hypercare' && <Table dense rows={[['Packet loss alert', '> 2% for 5 min', '> 0.5% for 2 min'], ['Latency alert', '+50 ms over baseline', '+20 ms over baseline'], ['AP down', 'P4', 'P3'], ['Readiness check failure', 'Ticket', 'Ticket + call branch manager'], ['Branch manager check-in', '—', 'Daily, 07:30 local'], ['Owner', 'NOC queue', 'Named wave owner']].map(([k, a, b]) => ({ id: k, k, a, b }))} cols={[{ key: 'k', label: 'Setting' }, { key: 'a', label: 'Normal (BAU)' }, { key: 'b', label: 'Hypercare – 14 days', render: r => <b className="text-ink">{r.b}</b> }]} />}
      </Card>
    </div>
  </div>);
}

function Cutover({ pid, setPid, now }) {
  const { s, act } = useApp();
  const cands = s.projects.filter(p => p.gates && (p.stage === 'Cutover' || p.stage === 'Kit staged' || p.stage === 'Hypercare'));
  const p = cands.find(x => x.id === pid) || cands.find(x => x.stage === 'Cutover') || cands[0];
  const fail = p.gates.find(g => g.st === 'Fail');
  const pass = p.gates.filter(g => g.st === 'Pass').length;
  const setGate = (g, st) => { act.upd('projects', p.id, x => ({ gates: x.gates.map(y => y.i === g.i ? { ...y, st, at: Date.now(), note: st === 'Pass' ? y.evidence : 'Failed – see rollback plan' } : y), rag: st === 'Fail' ? 'Red' : x.rag, ...(st === 'Pass' && g.i === 12 ? { stage: 'Hypercare', rag: 'Green' } : {}) })); act.audit(`${p.brand}: gate ${g.i + 1} ${st}`, p.id); act.toast(`Gate ${g.i + 1} ${st === 'Pass' ? 'passed' : 'FAILED – rollback plan armed'}`, st === 'Pass' ? 'ok' : 'bad'); };
  const rollback = () => { act.upd('projects', p.id, x => ({ stage: 'Kit staged', rag: 'Red', gates: D.makeGates(0), blockers: [`Rolled back ${dateShort(Date.now())}: ${fail ? fail.name : 'manual'}`, ...x.blockers] })); act.audit(`ROLLBACK executed for ${p.brand} – legacy network restored for Monday trade`, p.id); act.toast('Rollback executed – legacy network restored for Monday', 'warn'); };
  const pos = k => 4 + (k / 12) * 92;
  return (<div>
    <div className="flex flex-wrap items-center gap-2 mb-3"><ProjectPicker pid={p.id} setPid={setPid} filter={x => cands.includes(x)} /><Badge tone={RAG[p.rag]}>{p.rag}</Badge><Badge tone={p.track === 'Acquired' ? 'purple' : 'blue'}>{p.track}</Badge><div className="flex-1" /><Btn icon={I.PlayCircle} onClick={() => act.set({ scenario: { id: 'cutover', run: Date.now() } })}>Play cutover scenario</Btn></div>
    <Card title={`${p.brand} – ${p.site}`} sub="Friday 17:00 close → Monday 06:00 opening. Any failed gate arms the rollback plan." icon={I.Timer}>
      <div className="relative h-16 mt-2 mb-1">
        <div className="absolute left-[4%] right-[4%] top-7 h-1.5 bg-chip rounded-full" />
        <div className="absolute left-[4%] top-7 h-1.5 bg-ok rounded-full transition-all" style={{ width: `${(pass / 13) * 92}%` }} />
        {['Fri 17:00', 'Sat 08:00', 'Sun 10:00', 'Mon 06:00'].map((l, k) => <div key={l} className={cx('absolute top-0 text-[11px] font-bold text-ink3 whitespace-nowrap', k === 0 ? '' : k === 3 ? '-translate-x-full' : '-translate-x-1/2')} style={{ left: `${[4, 40, 70, 96][k]}%` }}>{l}</div>)}
        {p.gates.map(g => <div key={g.i} title={`${g.i + 1}. ${g.name}`} className={cx('absolute top-[22px] w-4 h-4 rounded-full border-2 border-panel -translate-x-1/2', g.st === 'Pass' ? 'bg-ok' : g.st === 'Fail' ? 'bg-bad animate-pulse' : 'bg-ink3/40')} style={{ left: `${pos(g.i)}%` }} />)}
      </div>
      <div className="text-[12.5px] text-ink2 mb-3">{pass} of 13 gates passed{fail ? <span className="text-bad font-bold">, gate {fail.i + 1} failed</span> : ''}</div>
      {fail && <div className="rounded-md border border-bad/40 bg-bad/10 p-3 mb-3 text-[12.5px]">
        <div className="font-bold text-bad flex items-center gap-1.5"><I.Undo2 size={15} />Rollback plan armed – gate {fail.i + 1}: {fail.name}</div>
        <div className="text-ink mt-1">{fail.note}</div>
        {fail.fix && <div className="text-ink mt-1"><b>Proposed fix:</b> {fail.fix}</div>}
        <div className="text-ink2 mt-1">If not fixed by Sun 16:00: re-install legacy edge and APs (kept on site until Mon 05:30), restore legacy config from Friday backup, StoreOps confirms branch trades Monday on the old network.</div>
        <div className="flex gap-2 mt-2"><Btn size="sm" kind="ok" icon={I.Check} onClick={() => setGate(fail, 'Pass')}>Fix verified – re-test passes</Btn><Btn size="sm" kind="danger" icon={I.Undo2} onClick={rollback}>Execute rollback</Btn></div>
      </div>}
      <Table rows={p.gates.map(g => ({ ...g, id: g.i }))} sortable={false} cols={[
        { key: 'i', label: '#', render: g => <b>{g.i + 1}</b> }, { key: 'when', label: 'Time', render: g => <span className="font-mono text-[12px]">{g.when}</span> },
        { key: 'name', label: 'Gate', render: g => <span className="font-semibold">{g.name}</span> }, { key: 'owner', label: 'Owner', render: g => <span className="text-[12px] text-ink2">{g.owner}</span> },
        { key: 'evidence', label: 'Evidence', render: g => <span className="text-[12px] text-ink2">{g.st !== 'Pending' ? g.note || g.evidence : g.evidence}</span> },
        { key: 'st', label: 'Result', render: g => <Badge tone={g.st === 'Pass' ? 'green' : g.st === 'Fail' ? 'red' : 'gray'}>{g.st}</Badge> },
        { key: 'act', label: '', render: g => g.st === 'Pending' && (g.i === 0 || p.gates[g.i - 1].st === 'Pass') ? <div className="flex gap-1 justify-end"><Btn size="xs" kind="ok" onClick={() => setGate(g, 'Pass')}>Pass</Btn><Btn size="xs" kind="danger" onClick={() => setGate(g, 'Fail')}>Fail</Btn></div> : null },
      ]} />
    </Card>
  </div>);
}

function Parity({ pid, setPid }) {
  const { s, act } = useApp();
  const cands = s.projects.filter(p => ['Cutover', 'Hypercare', 'BAU'].includes(p.stage));
  const p = cands.find(x => x.id === pid) || cands.find(x => x.stage === 'Hypercare') || cands[0];
  const [run, setRun] = useState(0);
  const gate12 = p.gates[11] && p.gates[11].st === 'Pass';
  const rows = [
    ['Telemetry', 'OpsRamp monitors (SNMP/API, syslog, NetFlow)', '100%', gate12], ['Telemetry', 'Aruba Central + Orchestrator', '100%', gate12], ['Telemetry', 'Synthetic probes: POS, ERP, Roof Hub, delivery tracking', '4/4', gate12], ['Telemetry', 'UPS power + closet temperature', 'Yes', gate12],
    ['Automation', 'Runbooks enabled (RB-101…110)', '10/10', gate12], ['Automation', 'Readiness checks at 05:30 local', '6/6', true], ['Automation', 'Nightly config backup with integrity check', 'Yes', gate12],
    ['AI coverage', 'Mova iO agents scoped to site', '9/9', gate12], ['AI coverage', 'Network knowledge graph – site topology', 'Built', gate12],
    ['Service', 'ServiceNow CMDB CIs + relationships', `${p.size === 'L' ? 14 : p.size === 'M' ? 9 : 6} CIs`, gate12], ['Service', 'SLA clocks (Annexure B)', 'Active', true], ['Service', 'KB articles + branch contacts', 'Linked', gate12],
  ];
  const ok = rows.filter(r => r[3]).length;
  const doRun = () => { setRun(1); setTimeout(() => setRun(2), 1600); act.audit(`Day-1 parity check run: ${p.brand}`, p.id); };
  return (<div>
    <div className="flex items-center gap-2 mb-3"><ProjectPicker pid={p.id} setPid={setPid} filter={x => cands.includes(x)} /><Btn icon={I.RefreshCw} onClick={doRun}>{run === 1 ? 'Checking…' : 'Run parity check'}</Btn></div>
    <div className="grid xl:grid-cols-[280px_1fr] gap-3">
      <Card title="Parity with fleet" icon={I.Scale}><div className="flex flex-col items-center py-2"><Ring value={ok / rows.length} size={120} stroke={11} color={ok === rows.length ? C.ok : C.warn} label={pct(ok / rows.length, 0)} /><div className="text-[12.5px] text-ink2 mt-2 text-center">{ok === rows.length ? 'This branch sees the same telemetry, automation, runbooks and AI coverage as every other branch from day one.' : 'Parity completes at gate 12 of the cutover (Sun 16:00).'}</div></div></Card>
      <Card title={`${p.brand} – ${p.site}`} sub="New branch vs fleet baseline" icon={I.ListChecks}>
        <Table dense sortable={false} rows={rows.map((r, k) => ({ id: k, g: r[0], n: r[1], v: r[2], ok: run === 1 ? null : r[3] }))} cols={[{ key: 'g', label: 'Area', render: r => <span className="text-ink3 text-[12px]">{r.g}</span> }, { key: 'n', label: 'Check', render: r => <span className="font-semibold">{r.n}</span> }, { key: 'fleet', label: 'Fleet baseline', render: r => r.v }, { key: 'v', label: 'This branch', render: r => r.ok === null ? <I.Loader2 size={14} className="animate-spin text-info" /> : r.ok ? <span className="text-ok font-semibold">{r.v}</span> : <span className="text-warn font-semibold">pending</span> }, { key: 'ok', label: '', render: r => r.ok === null ? null : r.ok ? <I.CheckCircle2 size={15} className="text-ok" /> : <I.Clock size={15} className="text-warn" /> }]} />
      </Card>
    </div>
  </div>);
}

function ProjectModal({ p, onClose, go, now }) {
  const { act } = useApp();
  if (!p) return null;
  const idx = D.STAGES.indexOf(p.stage);
  return (
    <Modal open onClose={onClose} title={<span className="flex items-center gap-2">{p.brand}<Badge tone={p.track === 'Acquired' ? 'purple' : 'blue'}>{p.track}</Badge><Badge tone={RAG[p.rag]}>{p.rag}</Badge></span>} sub={`${p.id}, ${p.site}, ${p.region}, size ${p.size}`} wide
      footer={<><Btn icon={I.Timer} onClick={() => go('cutover', p.id)}>Cutover tracker</Btn>{p.track === 'Acquired' && <Btn icon={I.ListTodo} onClick={() => go('steps', p.id)}>Steps</Btn>}<Btn icon={I.Scale} onClick={() => go('parity', p.id)}>Day-1 parity</Btn><div className="flex-1" /><Select label="RAG" value={p.rag} onChange={v => { act.upd('projects', p.id, { rag: v }); act.audit(`${p.id} RAG → ${v}`, p.id); }} options={['Green', 'Amber', 'Red']} />{idx < D.STAGES.length - 1 && <Btn kind="brand" icon={I.ArrowRight} onClick={() => { act.upd('projects', p.id, { stage: D.STAGES[idx + 1] }); act.audit(`${p.id} moved to ${D.STAGES[idx + 1]}`, p.id); act.toast(`${p.brand} → ${D.STAGES[idx + 1]}`); onClose(); }}>Move to {D.STAGES[idx + 1]}</Btn>}</>}>
      <div className="flex gap-1 mb-4">{D.STAGES.map((st, k) => <div key={st} className="flex-1"><div className={cx('h-1.5 rounded-full', k < idx ? 'bg-ok' : k === idx ? 'bg-info' : 'bg-chip')} /><div className={cx('text-[11px] mt-1', k === idx ? 'font-bold text-ink' : 'text-ink3')}>{st}</div></div>)}</div>
      <div className="grid md:grid-cols-2 gap-4">
        <div><KV k="Go-live" v={`${dt(p.golive)} (${daysTo(p.golive, now) >= 0 ? `in ${daysTo(p.golive, now)} days` : `${-daysTo(p.golive, now)} days ago`})`} /><KV k="Gates passed" v={`${p.gates.filter(g => g.st === 'Pass').length}/13`} />{p.acquired && <KV k="Acquisition" v={p.acquired} />}<KV k="Brand on the door" v={p.brand} />{p.note && <KV k="Note" v={p.note} />}</div>
        <div><div className="text-[11.5px] font-bold text-ink3 mb-1">Blockers</div>{p.blockers.length ? p.blockers.map(b => <div key={b} className="text-[12.5px] text-warn flex gap-1.5 py-0.5"><I.AlertTriangle size={14} className="mt-0.5 shrink-0" />{b}</div>) : <div className="text-[12.5px] text-ok">None</div>}
          <div className="text-[11.5px] font-bold text-ink3 mt-3 mb-1">Carriers</div>{p.carriers.length ? p.carriers.map(c => <div key={c} className="text-[12.5px] text-ink">{c}</div>) : <div className="text-[12.5px] text-ink3">To be confirmed</div>}</div>
      </div>
    </Modal>
  );
}

function Wizard() {
  const { s, act } = useApp();
  const [st, setSt] = useState(0);
  const [f, setF] = useState({ track: 'Acquired', brand: '', newBrand: '', site: '', state: 'TX', size: 'M', weeks: 6 });
  if (!s.wizard) return null;
  const close = () => { act.set({ wizard: false }); setSt(0); };
  const brand = f.brand === '__new' ? f.newBrand : f.brand;
  const ok = [true, brand && f.site, true, true][st];
  const create = () => {
    const id = `BIB-0${150 + s.projects.length}`;
    act.add('projects', { id, track: f.track, brand, site: f.site, state: f.state, region: D.REGION_OF[f.state] || '—', stage: 'Planned', rag: 'Green', golive: Date.now() + f.weeks * 7 * DAY, size: f.size, blockers: [], gates: D.makeGates(0), steps: f.track === 'Acquired' ? { discovery: 'active', audit: 'todo', triage: 'todo', erp: 'todo', onboard: 'todo', hypercare: 'todo' } : {}, legacy: [], carriers: [], acquired: f.track === 'Acquired' ? 'New acquisition' : undefined, note: f.track === 'Acquired' ? 'Brand name stays on the branch.' : '' }, false);
    act.audit(`Created Branch-in-a-Box ${id} for ${brand} – ${f.site}`, id); act.toast(`${id} created from the ${f.track.toLowerCase()} template`); close();
  };
  const STEPS = ['Track', 'Brand & site', 'Size & date', 'Review'];
  return (
    <Modal open onClose={close} title="Start new Branch-in-a-Box" sub="Creates a project from the standard template: kit, VLANs, steps, cutover gates, hypercare" wide
      footer={<>{st > 0 && <Btn icon={I.ArrowLeft} onClick={() => setSt(st - 1)}>Back</Btn>}<div className="flex-1" />{st < 3 ? <Btn kind="brand" disabled={!ok} onClick={() => setSt(st + 1)}>Next</Btn> : <Btn kind="brand" icon={I.Rocket} onClick={create}>Create project</Btn>}</>}>
      <div className="flex gap-2 mb-4">{STEPS.map((x, k) => <div key={x} className="flex-1"><div className={cx('h-1.5 rounded-full', k <= st ? 'bg-brand' : 'bg-chip')} /><div className={cx('text-[11.5px] mt-1', k === st ? 'font-bold text-ink' : 'text-ink3')}>{k + 1}. {x}</div></div>)}</div>
      {st === 0 && <div className="grid md:grid-cols-2 gap-3">{[['Greenfield', I.Sprout, 'A new SRS branch on a blank site'], ['Acquired', I.Building2, 'An acquired distributor – staff, yard, customers and brand name stay']].map(([t, Ic, d]) => <button key={t} onClick={() => setF({ ...f, track: t })} className={cx('text-left border-2 rounded-md p-4', f.track === t ? 'border-brand bg-brand/5' : 'border-line hover:border-ink3')}><Ic size={22} className="text-brand dark:text-[#e8a3a5]" /><div className="font-bold text-ink mt-2">{t} branch</div><div className="text-[12.5px] text-ink2">{d}</div></button>)}</div>}
      {st === 1 && <div className="space-y-3">
        <div><div className="text-[12px] font-semibold text-ink2 mb-1">Brand on the door</div><Select value={f.brand} onChange={v => setF({ ...f, brand: v })} options={[{ value: '', label: 'Choose…' }, ...D.BRANDS.map(b => ({ value: b, label: b })), { value: "Mingledorff's", label: "Mingledorff's" }, { value: 'Lohmiller & Company', label: 'Lohmiller & Company' }, { value: 'LS Building Products', label: 'LS Building Products' }, { value: '__new', label: '+ New acquired brand…' }]} className="w-full" /></div>
        {f.brand === '__new' && <input value={f.newBrand} onChange={e => setF({ ...f, newBrand: e.target.value })} placeholder="Acquired company name (kept on the branch)" className="w-full h-9 px-3 rounded-md border border-line bg-canvas text-ink text-[13px] outline-none" />}
        <div className="grid grid-cols-[1fr_120px] gap-2"><input value={f.site} onChange={e => setF({ ...f, site: e.target.value })} placeholder="Site name / city" className="h-9 px-3 rounded-md border border-line bg-canvas text-ink text-[13px] outline-none" /><Select value={f.state} onChange={v => setF({ ...f, state: v })} options={Object.keys(D.REGION_OF)} /></div>
      </div>}
      {st === 2 && <div className="space-y-3"><div className="text-[12px] font-semibold text-ink2">Size profile</div><div className="grid grid-cols-3 gap-2">{[['S', 'Small', '1 EC, 1 switch, 2–3 APs'], ['M', 'Medium', '1 EC, 2 switches, 4–6 APs'], ['L', 'Large', 'HA EC pair, switch stack, 8+ APs']].map(([k, n, d]) => <button key={k} onClick={() => setF({ ...f, size: k })} className={cx('border-2 rounded-md p-3 text-left', f.size === k ? 'border-brand bg-brand/5' : 'border-line')}><div className="font-bold text-ink">{n}</div><div className="text-[12px] text-ink2">{d}</div></button>)}</div>
        <div className="text-[12px] font-semibold text-ink2">Target go-live (cutover weekend)</div><Select value={String(f.weeks)} onChange={v => setF({ ...f, weeks: +v })} options={[2, 4, 6, 8, 10, 12].map(w => ({ value: String(w), label: `${w} weeks from now – ${dateShort(Date.now() + w * 7 * DAY)}` }))} /></div>}
      {st === 3 && <div className="grid md:grid-cols-2 gap-4"><div><KV k="Track" v={f.track} /><KV k="Brand" v={brand} /><KV k="Site" v={`${f.site}, ${f.state}`} /><KV k="Region" v={D.REGION_OF[f.state]} /><KV k="Size" v={f.size} /><KV k="Go-live" v={dateShort(Date.now() + f.weeks * 7 * DAY)} /></div><div className="text-[12.5px] text-ink2 space-y-1"><div className="font-bold text-ink">The template adds</div><div>• Kit BOM ({f.size} profile) and circuit orders</div><div>• 8 standard VLANs incl. isolated PCI segment</div><div>• {f.track === 'Acquired' ? '6 acquired-branch steps incl. legacy triage' : '6 greenfield steps'}</div><div>• 13 cutover gates, rollback plan</div><div>• 14-day hypercare + Day-1 parity check</div></div></div>}
    </Modal>
  );
}
