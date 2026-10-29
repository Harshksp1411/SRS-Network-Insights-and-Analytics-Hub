import { rankTechs } from './dash/fix.js';
import React, { useState, useMemo } from 'react';
import * as I from 'lucide-react';
import { LivePanel } from './liveui.jsx';
import { CarrierNetworks, ToolsStrip, TopBranches } from './viz2.jsx';
import * as D from './data.js';
import { useApp, useNow, healthOf, circuitOf, branchClock, inScope } from './store.jsx';
import { Card, Badge, Btn, Table, Dot, Pri, PageHead, Tabs, Stat, Select, SearchBox, Modal, KV, cx, Illus, ExportBtn, Progress, Logo } from './ui.jsx';
import { Bars, Legend, Spark, C, LineChart } from './charts.jsx';
import { num, pct, dur, ago, dt, hhmm, exportCSV, MIN, HR, DAY, T0, rng } from './util.js';
import { FirmwareMixCard, WarrantyCard, BackupTrendCard, DeviceRiskCard, CarrierForecastCard, CarrierTrendCard, CarrierHeatCard, FieldDemandCard, SparesCoverCard, TechUtilCard } from './viz.jsx';

const fwLevel = d => { const list = D.FW_TARGET[d.type === 'AP' ? 'AP' : d.model]; return list.indexOf(d.fw); };
const fwBadge = d => { const l = fwLevel(d); const crit = d.type === 'SD-WAN'; const ok = l <= (crit ? 1 : 2); return <Badge tone={l === 0 ? 'green' : ok ? 'blue' : 'red'}>{['N', 'N-1', 'N-2', 'N-3'][l]}{!ok && ', below policy'}</Badge>; };

export function Inventory() {
  const { s, act } = useApp();
  const now = useNow();
  const [tab, setTab] = useState('devices');
  const [q, setQ] = useState('');
  const [type, setType] = useState('All');
  const [model, setModel] = useState('All');
  const [bk, setBk] = useState('All');
  const [war, setWar] = useState('All');
  const [fw, setFw] = useState('All');
  const [carrier, setCarrier] = useState('All');
  const [cstat, setCstat] = useState('All');
  const [dev, setDev] = useState(null);
  const ds = s.devState || {};
  const devs = useMemo(() => D.DEVICES.filter(d => inScope(s, d.branchId)), [s.filters, s.role]);
  const devRows = devs.filter(d => {
    const backup = (ds[d.id] && ds[d.id].backup) || d.backup;
    if (type !== 'All' && d.type !== type) return false;
    if (model !== 'All' && d.model !== model) return false;
    if (bk !== 'All' && backup.st !== bk) return false;
    if (war === 'Expired' && d.warranty > now) return false;
    if (war === '< 90 days' && (d.warranty < now || d.warranty > now + 90 * DAY)) return false;
    if (fw === 'Below policy' && fwLevel(d) <= (d.type === 'SD-WAN' ? 1 : 2)) return false;
    if (q && !`${d.id} ${d.serial} ${d.model} ${D.BR[d.branchId].name} ${D.BR[d.branchId].brand} ${d.fw}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
  const cirs = useMemo(() => D.CIRCUITS.filter(c => inScope(s, c.branchId)), [s.filters, s.role]);
  const cirRows = cirs.map(c => circuitOf(s, c.id)).filter(c => (carrier === 'All' || c.carrier === carrier) && (cstat === 'All' || (cstat === 'Repeat offenders' ? c.tickets90 >= 3 : c.status === cstat)) && (!q || `${c.id} ${c.cid} ${c.carrier} ${D.BR[c.branchId].name}`.toLowerCase().includes(q.toLowerCase())));
  const failed = devs.filter(d => ((ds[d.id] && ds[d.id].backup) || d.backup).st === 'Failed');
  const retry = (d, quiet) => { act.map('devState', d.id, { backup: { st: 'Running', at: Date.now() } }); setTimeout(() => { act.map('devState', d.id, { backup: { st: 'OK', at: Date.now(), note: 'RB-109 retry, hash verified' } }); if (!quiet) { act.audit(`Config backup re-run OK: ${d.id}`, d.id); act.toast(`Backup OK – ${d.id}`); } }, 1400); };
  const retryAll = () => { const n = Math.min(60, failed.length); failed.slice(0, 60).forEach((d, i) => setTimeout(() => retry(d, true), i * 40)); act.toast(`Retrying ${n} failed backups (RB-109)`, 'info'); setTimeout(() => { act.audit(`RB-109 re-ran ${n} failed config backups – all OK, hashes verified`, 'RB-109'); act.toast(`${n} backups re-run – all OK`); }, n * 40 + 1600); };
  const models = ['All', ...new Set(D.DEVICES.map(d => d.model))];
  const expiring = devs.filter(d => d.warranty > now && d.warranty < now + 90 * DAY).length, expired = devs.filter(d => d.warranty < now).length;
  const below = devs.filter(d => fwLevel(d) > (d.type === 'SD-WAN' ? 1 : 2)).length;

  return (
    <div>
      <PageHead icon={I.Boxes} title="Device & Circuit Inventory" sub="CMDB view of every in-scope device and circuit. Totals: 933 EdgeConnect EC-XS, 1,856 switches, 1,286 APs (4,075 total) and 1,800 circuits across 900 branches."
        right={<ExportBtn onClick={() => tab === 'circuits' ? exportCSV('srs-circuits.csv', cirRows, [{ label: 'Circuit', key: 'id' }, { label: 'Branch', get: c => D.BR[c.branchId].name }, { label: 'Role', key: 'role' }, { label: 'Type', key: 'type' }, { label: 'Carrier', key: 'carrier' }, { label: 'Carrier ID', key: 'cid' }, { label: 'Mb/s', key: 'bw' }, { label: 'Status', key: 'status' }, { label: 'Tickets 90d', key: 'tickets90' }]) : exportCSV('srs-devices.csv', devRows, [{ label: 'Hostname', key: 'id' }, { label: 'Type', key: 'type' }, { label: 'Model', key: 'model' }, { label: 'Role', key: 'role' }, { label: 'Branch', get: d => D.BR[d.branchId].name }, { label: 'Brand', get: d => D.BR[d.branchId].brand }, { label: 'Firmware', key: 'fw' }, { label: 'Backup', get: d => d.backup.st }, { label: 'Warranty / contract end', get: d => D.warrantyText(d) }, { label: 'Serial', key: 'serial' }])} />} />
      <div className="kpi-strip grid grid-cols-2 lg:grid-cols-5 mb-3">
        <Stat label="Devices in view" icon={I.HardDrive} onClick={() => act.drill({ t: 'devices', k: 'all' })} value={num(devs.length)} sub={`${devs.filter(d => d.type === 'SD-WAN').length} EC, ${devs.filter(d => d.type === 'Switch').length} sw, ${devs.filter(d => d.type === 'AP').length} AP`} />
        <Stat label="Circuits in view" icon={I.Cable} onClick={() => act.drill({ t: 'lines', k: 'all' })} value={num(cirs.length)} sub="primary + backup per branch" />
        <Stat label="Config backups failed" icon={I.DatabaseBackup} value={failed.length} tone={failed.length ? 'red' : 'green'} sub="last nightly run 02:00 CT" onClick={() => { setTab('devices'); setBk('Failed'); }} />
        <Stat label="Below firmware policy" icon={I.ShieldAlert} value={below} tone={below ? 'amber' : 'green'} sub="EC: N-1, others: N-2" onClick={() => { setTab('devices'); setFw('Below policy'); }} />
        <Stat label="Support contracts (EdgeConnect)" icon={I.CalendarClock} value={<span><span className="text-bad">{expired}</span><span className="text-ink3 text-[18px]"> / </span><span className="text-warn">{expiring}</span></span>} sub="lapsed / renewing in 90 days. Switches and APs have a lifetime warranty" onClick={() => { setTab('devices'); setWar('Expired'); }} />
      </div>
      <LivePanel kind="inventory" className="mb-3 mt-3" />
      <div className="mb-3"><ToolsStrip only={['aruba', 'central', 'opsramp']} /></div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 mb-3">
        <FirmwareMixCard />
        <WarrantyCard />
        <BackupTrendCard />
      </div>
      <div className="mb-3"><DeviceRiskCard /></div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Tabs value={tab} onChange={setTab} tabs={[{ id: 'devices', label: 'Devices', count: devRows.length }, { id: 'circuits', label: 'Circuits', count: cirRows.length }, { id: 'recon', label: 'Reconciliation' }]} />
        <div className="flex-1" />
        {tab !== 'recon' && <SearchBox value={q} onChange={setQ} placeholder={tab === 'devices' ? 'Hostname, serial, branch, firmware' : 'Circuit, carrier ID, branch'} className="w-72" />}
      </div>
      {tab === 'devices' && <Card pad={false}><div className="p-3">
        <div className="flex flex-wrap gap-2 mb-2">
          <Select label="Type" value={type} onChange={setType} options={['All', 'SD-WAN', 'Switch', 'AP']} />
          <Select label="Model" value={model} onChange={setModel} options={models} />
          <Select label="Backup" value={bk} onChange={setBk} options={['All', 'OK', 'Failed', 'Stale', 'N/A']} />
          <Select label="Firmware" value={fw} onChange={setFw} options={['All', 'Below policy']} />
          <Select label="Warranty" value={war} onChange={setWar} options={['All', '< 90 days', 'Expired']} />
          <div className="flex-1" />
          {failed.length > 0 && <Btn size="sm" icon={I.RefreshCw} onClick={retryAll}>Retry failed backups (RB-109)</Btn>}
        </div>
        <Table pageSize={40} rows={devRows} onRow={setDev} cols={[
          { key: 'id', label: 'Hostname', render: d => <span className="font-mono text-[12px] font-semibold">{d.id}</span> },
          { key: 'type', label: 'Type' },
          { key: 'model', label: 'Model', className: 'whitespace-nowrap', render: d => <span>{d.model}</span> },
          { key: 'role', label: 'Role / zone', render: d => <span className="text-[12px] text-ink2">{d.role}</span> },
          { key: 'branch', label: 'Branch', get: d => D.BR[d.branchId].name, render: d => <div><div className="font-semibold whitespace-nowrap">{D.BR[d.branchId].name}</div><div className="text-[11px] text-ink3 truncate max-w-[150px]" title="">{D.BR[d.branchId].brand}</div></div> },
          { key: 'fw', label: 'Firmware', className: 'whitespace-nowrap', render: d => <div className="flex items-center gap-1.5"><span className="font-mono text-[12px]">{d.fw}</span>{fwBadge(d)}</div> },
          { key: 'backup', label: 'Config backup', get: d => ((ds[d.id] && ds[d.id].backup) || d.backup).st, render: d => { const b = (ds[d.id] && ds[d.id].backup) || d.backup; return b.st === 'N/A' ? <span className="text-ink3 text-[12px]">Central-managed</span> : <span className="flex flex-wrap items-center gap-x-1.5 max-w-[120px]"><Badge tone={b.st === 'OK' ? 'green' : b.st === 'Running' ? 'blue' : b.st === 'Stale' ? 'amber' : 'red'}>{b.st}</Badge><span className="text-[11px] text-ink3">{b.at ? ago(b.at, now) : ''}</span></span>; } },
          { key: 'warranty', label: 'Warranty / contract end', className: 'whitespace-nowrap', render: d => <span className={cx('text-[12px]', d.warranty < now ? 'text-bad font-semibold' : d.warranty < now + 90 * DAY ? 'text-warn font-semibold' : 'text-ink2')}>{D.warrantyText(d)}</span> },
          { key: 'cir', label: 'Circuits / serial', sortable: false, render: d => d.type === 'SD-WAN' ? <span className="text-[11px] font-mono text-ink2 block truncate max-w-[110px]" title={D.BR[d.branchId].wan.map(id => `${D.CIR[id].carrier}: ${D.CIR[id].cid}`).join(', ')}>{D.BR[d.branchId].wan.map(id => `${D.CIR[id].carrier}: ${D.CIR[id].cid}`).join(', ')}</span> : <span className="text-[11px] font-mono text-ink3">{d.serial}</span> },
        ]} />
      </div></Card>}
      {tab === 'circuits' && <Card pad={false}><div className="p-3">
        <div className="flex flex-wrap gap-2 mb-2"><Select label="Carrier" value={carrier} onChange={setCarrier} options={['All', ...D.CARRIERS]} /><Select label="Status" value={cstat} onChange={setCstat} options={['All', 'Up', 'Degraded', 'Down', 'Repeat offenders']} /></div>
        <Table pageSize={40} rows={cirRows} onRow={c => act.openBranch(c.branchId)} cols={[
          { key: 'id', label: 'Circuit', render: c => <span className="font-mono text-[12px] font-semibold">{c.id}</span> },
          { key: 'branch', label: 'Branch', get: c => D.BR[c.branchId].name, render: c => <div><div className="font-semibold whitespace-nowrap">{D.BR[c.branchId].name}</div><div className="text-[11px] text-ink3 truncate max-w-[150px]" title="">{D.BR[c.branchId].brand}</div></div> },
          { key: 'role', label: 'Role' }, { key: 'type', label: 'Type' }, { key: 'carrier', label: 'Carrier' },
          { key: 'cid', label: 'Carrier circuit ID', render: c => <span className="font-mono text-[11.5px]">{c.cid}</span> },
          { key: 'lec', label: 'LEC', render: c => <span className="text-[12px] text-ink2">{c.lec || '—'}</span> },
          { key: 'bw', label: 'Mb/s', right: true },
          { key: 'status', label: 'Status', render: c => <Badge tone={c.status === 'Up' ? 'green' : c.status === 'Degraded' ? 'amber' : 'red'}>{c.status}</Badge> },
          { key: 'perf', label: 'Lat / jit / loss', sortable: false, render: c => <span className="text-[11.5px] text-ink2">{c.lat} ms, {c.jit}, {c.loss}%</span> },
          { key: 'tickets90', label: 'Tickets 90d', right: true, render: c => <span className={c.tickets90 >= 3 ? 'text-bad font-bold' : ''}>{c.tickets90}</span> },
        ]} />
      </div></Card>}
      {tab === 'recon' && <Recon />}
      <Modal open={!!dev} onClose={() => setDev(null)} title={dev && <span className="font-mono">{dev.id}</span>} sub={dev && `${dev.model}, ${dev.type}, ${D.BR[dev.branchId].name}, ${D.BR[dev.branchId].brand}`} wide
        footer={dev && <><Btn icon={I.DatabaseBackup} disabled={dev.type === 'AP'} onClick={() => retry(dev)}>Back up config now</Btn><Btn icon={I.Store} onClick={() => { setDev(null); act.openBranch(dev.branchId); }}>Open branch</Btn><Btn icon={I.Network} onClick={() => { setDev(null); act.set({ module: 'graph', graphBranch: dev.branchId }); }}>Show in graph</Btn></>}>
        {dev && <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div><KV k="Model" v={dev.model} /><KV k="Role / zone" v={dev.role} /><KV k="Managed by" v={dev.type === 'SD-WAN' ? 'EdgeConnect Orchestrator' : dev.mode === 'Central' ? 'Aruba Central' : 'Standalone (polled by OpsRamp; not yet in Aruba Central)'} /><KV k="Firmware" v={<span className="flex items-center gap-1.5">{dev.fw}{fwBadge(dev)}</span>} /><KV k="Target (N)" v={D.FW_TARGET[dev.type === 'AP' ? 'AP' : dev.model][0]} /><KV k="Serial / MAC" v={<span className="font-mono">{dev.serial}</span>} /><KV k={D.warrantyKind(dev)} v={D.warrantyText(dev)} /><KV k="CMDB CI" v={`cmdb_ci_netgear, ${dev.id}`} /></div>
          <div>
            <div className="text-[12px] font-bold text-ink3 mb-1">Running config vs golden (Network-as-Code)</div>
            <pre className="bg-chip border border-line rounded-md p-2.5 text-[11.5px] font-mono leading-5 overflow-x-auto text-ink">{(s.drift.find(x => x.device === dev.id) ? [`  hostname ${dev.id}`, `- ntp server 10.10.1.5`, `+ ntp server 10.20.4.9`, `  vlan 20 name POS-PCI`, `  vlan 30 name WAREHOUSE-WIFI`] : [`  hostname ${dev.id}`, `  ntp server 10.10.1.5`, `  vlan 20 name POS-PCI`, `  vlan 30 name WAREHOUSE-WIFI`, `  # no drift – matches golden v41`]).map((l, i) => <div key={i} className={l.startsWith('+') ? 'text-ok' : l.startsWith('-') ? 'text-bad' : ''}>{l}</div>)}</pre>
          </div>
        </div>}
      </Modal>
    </div>
  );
}

function Recon() {
  const rfp = [
    ['Access Point', 474, [['AP-565-US', 24], ['AP-567-US', 1], ['AP-575-US', 1], ['AP-585-US', 20], ['AP-635-US', 428]]],
    ['Access Point; Standalone', 812, [['AP-565-US', 56], ['AP-585-US', 20], ['AP-634-US', 2], ['AP-635-US', 734]]],
    ['Switch', 524, [['2530', 47], ['6100', 473], ['6300', 2], ['6200M', 2]]],
    ['Switch; Stack (Conductor)', 17, [['6300', 5], ['6200M', 12]]],
    ['Switch; Stack (Member)', 30, [['6200M', 30]]],
    ['Switch; Stack (Standby)', 17, [['6300', 5], ['6200M', 12]]],
    ['Switch; Standalone', 1268, [['2530', 681], ['6100', 585], ['6300', 1], ['6200M', 1]]],
  ];
  const cm = m => D.DEVICES.filter(d => d.model === m).length;
  const models = [['EC-XS (SilverPeak/Aruba SD-WAN)', 933, cm('EC-XS')], ['AP-635', 1162, cm('AP-635')], ['AP-565', 80, cm('AP-565')], ['AP-585', 40, cm('AP-585')], ['AP-634', 2, cm('AP-634')], ['AP-567', 1, cm('AP-567')], ['AP-575', 1, cm('AP-575')], ['6100', 1058, cm('6100')], ['2530', 728, cm('2530')], ['6200M', 57, cm('6200M')], ['6300', 13, cm('6300')]];
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
      <Card title="Contracted inventory" sub="HPE Aruba Networking pivot – 3,142 devices + 933 EC-XS = 4,075; 1,800 circuits; 900 branch locations" icon={I.FileSpreadsheet}>
        <table className="w-full text-[12.5px]"><tbody>
          {rfp.map(([g, n, ms]) => <React.Fragment key={g}><tr className="border-t border-line"><td className="py-1.5 font-bold text-ink">{g}</td><td className="text-right font-bold">{num(n)}</td></tr>{ms.map(([m, k]) => <tr key={g + m}><td className="pl-5 py-0.5 text-ink2">{m}</td><td className="text-right text-ink2">{num(k)}</td></tr>)}</React.Fragment>)}
          <tr className="border-t-2 border-ink"><td className="py-1.5 font-extrabold">Total HPE Aruba Networking</td><td className="text-right font-extrabold">3,142</td></tr>
          <tr><td className="py-1 font-bold">SilverPeak/Aruba SD-WAN (EC-XS)</td><td className="text-right font-bold">933</td></tr>
          <tr><td className="py-1 font-bold">Total SD-WAN, switches and APs</td><td className="text-right font-bold">4,075</td></tr>
          <tr><td className="py-1 font-bold">Total circuits</td><td className="text-right font-bold">1,800</td></tr>
        </tbody></table>
      </Card>
      <Card title="CMDB vs contracted inventory, by model" sub="What the console holds, checked against the contracted device counts" icon={I.ListChecks}>
        <table className="w-full text-[12.5px]"><thead><tr className="text-ink3 text-left"><th className="py-1">Model</th><th className="text-right">Contract</th><th className="text-right">CMDB</th><th className="text-right">Match</th></tr></thead><tbody>
          {models.map(([m, r, c]) => <tr key={m} className="border-t border-line/60"><td className="py-1.5 text-ink">{m}</td><td className="text-right">{num(r)}</td><td className="text-right">{num(c)}</td><td className="text-right">{r === c ? <I.CheckCircle2 size={15} className="text-ok inline" /> : <I.XCircle size={15} className="text-bad inline" />}</td></tr>)}
          <tr className="border-t-2 border-ink font-bold"><td className="py-1.5">Total devices</td><td className="text-right">4,075</td><td className="text-right">{num(D.DEVICES.length)}</td><td className="text-right">{D.DEVICES.length === 4075 ? <I.CheckCircle2 size={15} className="text-ok inline" /> : '✗'}</td></tr>
          <tr className="font-bold"><td className="py-1.5">Circuits</td><td className="text-right">1,800</td><td className="text-right">{num(D.CIRCUITS.length)}</td><td className="text-right"><I.CheckCircle2 size={15} className="text-ok inline" /></td></tr>
          <tr className="font-bold"><td className="py-1.5">Branches</td><td className="text-right">900</td><td className="text-right">{num(D.BRANCHES.length)}</td><td className="text-right"><I.CheckCircle2 size={15} className="text-ok inline" /></td></tr>
        </tbody></table>

      </Card>
    </div>
  );
}

// ───────────────────────── Carrier management ─────────────────────────
export function Carriers() {
  const { s, act } = useApp();
  const now = useNow();
  const [tab, setTab] = useState(s.tab.carriers || 'cases');
  const [ev, setEv] = useState(null);
  const [raise, setRaise] = useState(false);
  const [rq, setRq] = useState('');
  const open = s.cases.filter(c => !c.closed && inScope(s, c.branchId));
  const closed = s.cases.filter(c => c.closed && inScope(s, c.branchId));
  const late = open.filter(c => c.eta && now > c.eta);
  const repeat = D.CIRCUITS.filter(c => c.tickets90 >= 3 && inScope(s, c.branchId)).sort((a, b) => b.tickets90 - a.tickets90);
  const doRaise = cid => { const c = circuitOf(s, cid); const no = D.caseNo(c.carrier); act.add('cases', { id: no, carrier: c.carrier, circuit: c.id, inc: null, branchId: c.branchId, opened: Date.now(), status: 'Open – carrier testing', eta: Date.now() + 4 * HR, lastUpdate: Date.now(), evidence: ['60-min loss/jitter graph', 'MTR from EdgeConnect', 'Interface counters', 'Timestamps'], escal: 0 }); act.audit(`Opened ${c.carrier} case ${no} on ${c.id}`, no); act.toast(`${c.carrier} case ${no} opened with evidence pack`); setRaise(false); };
  const months = D.TICKET_MONTHS.map(m => ({ label: m.m, NTF: m.ntf, 'Carrier/LEC': m.carrier }));
  return (
    <div>
      <PageHead icon={I.RadioTower} title="Carrier Management" sub="Carrier cases with auto-built evidence packs, carrier scorecard, repeat-offender circuits and no-trouble-found tracking. 6-month history: 533 carrier/LEC and 875 NTF tickets."
        right={<Btn kind="brand" icon={I.Plus} onClick={() => setRaise(true)}>Raise carrier case</Btn>} />
      <div className="kpi-strip grid grid-cols-2 lg:grid-cols-4 mb-3">
        <Stat label="Open carrier cases" icon={I.FolderOpen} value={open.length} onClick={() => act.drill({ t: 'cases' })} />
        <Stat label="Past carrier restore commitment" icon={I.AlarmClockOff} onClick={() => act.drill({ t: 'cases' })} value={late.length} tone={late.length ? 'red' : 'green'} sub="escalate per carrier matrix" />
        <Stat label="Repeat-offender circuits" icon={I.Repeat} value={repeat.length} tone="amber" sub="≥ 3 tickets in 90 days" onClick={() => setTab('repeat')} />
        <Stat label="NTF share (6 months)" icon={I.SearchX} value={pct(875 / 3773, 0)} sub="875 of 3,773 tickets" onClick={() => setTab('ntf')} />
      </div>
      <LivePanel kind="carriers" className="mb-3 mt-3" />
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-3 mb-3 items-start"><CarrierNetworks /><TopBranches /></div>
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-3 mb-3">
        <CarrierForecastCard />
        <CarrierTrendCard />
      </div>
      <Tabs value={tab} onChange={t => { setTab(t); act.setTab('carriers', t); }} className="mb-3" tabs={[{ id: 'cases', label: 'Open cases', count: open.length }, { id: 'closed', label: 'Closed (7 d)', count: closed.length }, { id: 'scorecard', label: 'Scorecard' }, { id: 'repeat', label: 'Repeat offenders', count: repeat.length }, { id: 'ntf', label: 'NTF tracking' }]} />
      {(tab === 'cases' || tab === 'closed') && <Card pad={false}><div className="p-3"><Table rows={tab === 'cases' ? open : closed} cols={[
        { key: 'id', label: 'Carrier ticket', render: c => <span className="font-mono text-[12px] font-semibold">{c.id}{c.master && <Badge tone="purple" className="ml-1">master</Badge>}</span> },
        { key: 'carrier', label: 'Carrier' },
        { key: 'circuit', label: 'Circuit(s)', render: c => <span className="font-mono text-[11.5px] line-clamp-1 max-w-[200px] block">{c.circuit}</span> },
        { key: 'branch', label: 'Branch', get: c => D.BR[c.branchId].name, render: c => <button onClick={() => act.openBranch(c.branchId)} className="text-left hover:underline"><div className="font-semibold whitespace-nowrap">{D.BR[c.branchId].name}</div><div className="text-[11px] text-ink3 truncate max-w-[150px]" title="">{D.BR[c.branchId].brand}</div></button> },
        { key: 'inc', label: 'Incident', render: c => c.inc ? <button className="font-mono text-[12px] text-info hover:underline" onClick={() => act.openInc(c.inc)}>{c.inc}</button> : '—' },
        { key: 'status', label: 'Status', render: c => <Badge tone={c.closed ? (c.status.includes('NTF') ? 'amber' : 'green') : 'blue'} className="!whitespace-normal max-w-[170px] leading-tight py-0.5">{c.status}</Badge> },
        { key: 'eta', label: 'Carrier ETA', render: c => c.closed ? <span className="text-ink3 text-[12px]">closed {ago(c.lastUpdate, now)}</span> : <span className={cx('text-[12px] font-mono font-semibold', now > c.eta ? 'text-bad' : 'text-ink')}>{now > c.eta ? `late ${dur(now - c.eta)}` : dur(c.eta - now)}</span> },
        { key: 'escal', label: 'Esc.', right: true },
        { key: 'act', label: '', sortable: false, render: c => <div className="flex gap-1 justify-end"><Btn size="xs" icon={I.FileSearch} onClick={() => setEv(c)}>Evidence</Btn>{!c.closed && <><Btn size="xs" icon={I.ArrowUpCircle} onClick={() => { act.upd('cases', c.id, x => ({ escal: x.escal + 1, status: `Escalated L${x.escal + 1} – carrier`, lastUpdate: Date.now() })); act.audit(`Escalated ${c.id} to L${c.escal + 1}`, c.id); act.toast(`${c.carrier} case escalated to level ${c.escal + 1}`, 'warn'); }}>Escalate</Btn><Btn size="xs" kind="ok" icon={I.Check} onClick={() => { act.upd('cases', c.id, { closed: true, status: 'Closed – carrier fault fixed', lastUpdate: Date.now() }); act.audit(`Closed ${c.id}`, c.id); }}>Close</Btn></>}</div> },
      ]} /></div></Card>}
      {tab === 'scorecard' && <div className="mb-3"><CarrierHeatCard /></div>}
      {tab === 'scorecard' && <div className="grid grid-cols-1 min-[1700px]:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-3">
        <Card title="Carrier scorecard – last 6 months" sub="533 carrier/LEC and 875 no-trouble-found tickets, by carrier" icon={I.Trophy}>
          <Table rows={D.SCORECARD.map(x => ({ ...x, id: x.carrier }))} cols={[
            { key: 'carrier', label: 'Carrier', render: x => <b>{x.carrier}</b> }, { key: 'circuits', label: 'Circuits', right: true }, { key: 'cases6m', label: 'Carrier faults', right: true }, { key: 'ntf', label: 'NTF', right: true },
            { key: 'rate', label: 'Faults / 100 circuits', right: true, get: x => +(x.cases6m / x.circuits * 100).toFixed(1) },
            { key: 'mttr', label: 'MTTR (h)', right: true, render: x => <span className={x.mttr > 7 ? 'text-bad font-semibold' : ''}>{x.mttr}</span> },
            { key: 'slaMet', label: 'Restore commit met', right: true, render: x => <span className={x.slaMet < 0.9 ? 'text-bad font-semibold' : 'text-ok font-semibold'}>{pct(x.slaMet, 0)}</span> },
            { key: 'repeat', label: 'Repeat ckts', right: true },
          ]} />
        </Card>
        <Card title="Faults vs NTF by carrier" icon={I.BarChart3}>
          <Bars data={D.SCORECARD.map(x => ({ label: x.carrier.split(' ')[0], 'Carrier fault': x.cases6m, NTF: x.ntf }))} keys={['Carrier fault', 'NTF']} colors={[C.s1, C.warn]} stacked={false} h={220} />
          <Legend items={[['Carrier fault', C.s1], ['No trouble found', C.warn]]} />
        </Card>
      </div>}
      {tab === 'repeat' && <Card pad={false}><div className="p-3"><Table rows={repeat.map(c => circuitOf(s, c.id))} cols={[
        { key: 'id', label: 'Circuit', render: c => <span className="font-mono text-[12px] font-semibold">{c.id}</span> },
        { key: 'branch', label: 'Branch', get: c => D.BR[c.branchId].name, render: c => <div><div className="font-semibold whitespace-nowrap">{D.BR[c.branchId].name}</div><div className="text-[11px] text-ink3 truncate max-w-[150px]" title="">{D.BR[c.branchId].brand}</div></div> },
        { key: 'carrier', label: 'Carrier' }, { key: 'type', label: 'Type' }, { key: 'lec', label: 'LEC', render: c => c.lec || '—' },
        { key: 'tickets90', label: 'Tickets 90d', right: true, render: c => <b className="text-bad">{c.tickets90}</b> }, { key: 'ntf90', label: 'NTF 90d', right: true },
        { key: 'act', label: '', sortable: false, render: c => <div className="flex gap-1 justify-end"><Btn size="xs" icon={I.FilePlus2} onClick={() => { const id = `PRB000${4250 + Math.floor(Math.random() * 99)}`; act.add('problems', { id, title: `Repeat faults on ${c.carrier} ${c.type} ${c.id} (${D.BR[c.branchId].name})`, incidents: c.tickets90, state: 'New', owner: 'Network Eng L3', opened: Date.now() }); act.audit(`Opened problem ${id} for ${c.id}`, id); act.toast(`${id} opened`); }}>Problem record</Btn><Btn size="xs" icon={I.Handshake} onClick={() => { act.audit(`Requested ${c.carrier} account review for ${c.id}`, c.id); act.toast(`Added to ${c.carrier} monthly service review`, 'info'); }}>Carrier review</Btn></div> },
      ]} /></div></Card>}
      {tab === 'ntf' && <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-3">
        <Card title="NTF and carrier/LEC tickets by month" sub="Last 6 months" icon={I.TrendingDown}>
          <Bars data={months} keys={['NTF', 'Carrier/LEC']} colors={[C.warn, C.s1]} h={220} />
          <Legend items={[['No trouble found', C.warn], ['Carrier / LEC', C.s1]]} />
        </Card>
        <Card title="How NTF is driven down" icon={I.ListChecks}>
          {[['Evidence first', 'Every case carries a 60-minute loss/jitter graph, MTR and timestamps so the carrier can see the fault.'], ['Stability check before dispatch', 'Carrier dispatch only after 15 min of sustained loss – brief flaps are watched, not ticketed.'], ['Demarc test with LEC', 'Where the LEC supports it, a loopback test result is attached before the case opens.'], ['Close-code discipline', 'NTF vs carrier fault is set by the evidence, not the carrier’s closing note.'], ['Repeat offender review', 'Circuits with 3+ tickets go to the monthly carrier service review.']].map(([h, t]) => <div key={h} className="py-1.5 border-b border-line/60 last:border-0"><div className="text-[13px] font-bold text-ink">{h}</div><div className="text-[12.5px] text-ink2">{t}</div></div>)}
        </Card>
      </div>}
      <Modal open={!!ev} onClose={() => setEv(null)} title={ev && `Evidence pack – ${ev.id}`} sub={ev && `${ev.carrier}, ${ev.circuit}, built by Carrier Agent`} wide>
        {ev && (() => { const R = rng(ev.id.length * 31); const loss = Array.from({ length: 60 }, (_, i) => i > 32 ? 2 + R() * 6 : R() * 0.3); const jit = Array.from({ length: 60 }, (_, i) => i > 30 ? 25 + R() * 18 : 2 + R() * 3); return <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3"><div className="border border-line rounded-md p-2"><div className="text-[12px] font-semibold text-ink2 mb-1">Packet loss % – last 60 min</div><LineChart series={[{ name: 'Loss %', data: loss, color: C.bad }]} labels={loss.map((_, i) => `-${60 - i}m`)} h={120} yFmt={v => v.toFixed(1)} /></div><div className="border border-line rounded-md p-2"><div className="text-[12px] font-semibold text-ink2 mb-1">Jitter ms – last 60 min</div><LineChart series={[{ name: 'Jitter', data: jit, color: C.warn }]} labels={jit.map((_, i) => `-${60 - i}m`)} h={120} yFmt={v => v.toFixed(0)} /></div></div>
          <pre className="bg-chip border border-line rounded-md p-2.5 text-[11.5px] font-mono text-ink overflow-x-auto">{`MTR from ${String(ev.circuit).split(',')[0].replace('-wan1', '-ec01').replace('-wan2', '-ec01')} (wan path under test)
HOST                         Loss%   Snt   Avg   Best  Wrst
1. CPE gateway                0.0%    100   1.1   0.8   2.3
2. ${ev.carrier} access PE              ${(3 + R() * 4).toFixed(1)}%    100  ${(28 + R() * 20).toFixed(1)}  12.0  88.4
3. ${ev.carrier} aggregation            ${(3 + R() * 4).toFixed(1)}%    100  ${(31 + R() * 20).toFixed(1)}  13.1  92.0
4. DC edge (SRS)              ${(3 + R() * 4).toFixed(1)}%    100  ${(33 + R() * 20).toFixed(1)}  14.2  95.7`}</pre>
          <div className="flex flex-wrap gap-1.5">{ev.evidence.map(e => <Badge key={e} tone="blue"><I.Paperclip size={11} />{e}</Badge>)}</div>
          <div className="text-[12px] text-ink3">Loss starts at hop 2 (carrier access) and carries through – local LAN and CPE are clean. Timestamps in UTC and CT included.</div>
        </div>; })()}
      </Modal>
      <Modal open={raise} onClose={() => setRaise(false)} title="Raise carrier case" sub="Pick the circuit; the Carrier Agent builds the evidence pack and opens the ticket">
        <SearchBox value={rq} onChange={setRq} placeholder="Branch, circuit or carrier ID" className="w-full" />
        <div className="mt-2 max-h-80 overflow-y-auto">{D.CIRCUITS.filter(c => rq.length > 1 && `${c.id} ${c.cid} ${D.BR[c.branchId].name} ${D.BR[c.branchId].brand} ${c.carrier}`.toLowerCase().includes(rq.toLowerCase())).slice(0, 20).map(c => <button key={c.id} onClick={() => doRaise(c.id)} className="w-full text-left flex items-center gap-2 px-2 py-1.5 hover:bg-chip rounded text-[12.5px]"><span className="font-mono font-semibold">{c.id}</span><span className="text-ink2">{c.carrier} {c.type}</span><span className="text-ink3 truncate">{D.BR[c.branchId].name}, {D.BR[c.branchId].brand}</span></button>)}{rq.length < 2 && <div className="text-ink3 text-[12.5px] p-2">Type at least 2 characters.</div>}</div>
      </Modal>
    </div>
  );
}

// ───────────────────────── Field dispatch ─────────────────────────
export function Dispatch() {
  const { s, act } = useApp();
  const now = useNow();
  const [tab, setTab] = useState(s.tab.dispatch || 'orders');
  const [match, setMatch] = useState(null);
  const wos = s.workOrders.filter(w => inScope(s, w.branchId));
  const rank = w => rankTechs(s, w); // the same matching the root-cause view uses to send a technician
  const assign = (w, r) => {
    act.upd('workOrders', w.id, { tech: r.t.id, status: 'Assigned', eta: Date.now() + r.eta * MIN, depot: r.depot && r.depot.id });
    if (r.depot) w.parts.forEach(p => act.upd('depots', r.depot.id, x => ({ spares: { ...x.spares, [p]: Math.max(0, (x.spares[p] || 0) - 1) } })));
    act.upd('techs', r.t.id, { status: 'On site' });
    act.audit(`Assigned ${w.id} to ${r.t.name}`, w.id); act.toast(`${w.id} → ${r.t.name}, ETA ${r.eta} min`); setMatch(null);
  };
  const adv = (w, st) => { act.upd('workOrders', w.id, { status: st, ...(st === 'Completed' ? { done: Date.now() } : {}) }); act.audit(`${w.id} → ${st}`, w.id); if (st === 'Completed') { act.toast(`${w.id} completed`); const t = s.techs.find(x => x.id === w.tech); if (t) act.upd('techs', t.id, { status: 'Available' }); } };
  return (
    <div>
      <PageHead icon={I.Truck} title="Field Dispatch" sub="Work orders matched to technician skills, depot spares, branch hours and ETA. Visits during branch hours only for P1/P2 or when the device is already down." />
      <div className="kpi-strip grid grid-cols-2 lg:grid-cols-4 mb-3">
        <Stat label="Unassigned" icon={I.CircleDashed} value={wos.filter(w => !w.tech).length} tone={wos.filter(w => !w.tech).length ? 'amber' : 'green'} />
        <Stat label="En route / on site" icon={I.Navigation} value={wos.filter(w => ['Assigned', 'En route', 'On site', 'Dispatched'].includes(w.status)).length} />
        <Stat label="Technicians available" icon={I.HardHat} value={s.techs.filter(t => t.status === 'Available').length} sub={`of ${s.techs.length}`} />
        <Stat label="Low-stock depot lines" icon={I.PackageX} value={s.depots.reduce((a, d) => a + Object.values(d.spares).filter(v => v <= 1).length, 0)} tone="amber" onClick={() => setTab('depots')} />
      </div>
      <LivePanel kind="dispatch" className="mb-3 mt-3" />
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 mb-3">
        <FieldDemandCard />
        <SparesCoverCard />
        <TechUtilCard />
      </div>
      <Tabs value={tab} onChange={setTab} className="mb-3" tabs={[{ id: 'orders', label: 'Work orders', count: wos.length }, { id: 'techs', label: 'Technicians', count: s.techs.length }, { id: 'depots', label: 'Depot spares', count: s.depots.length }]} />
      {tab === 'orders' && <Card pad={false}><div className="p-3"><Table rows={wos} cols={[
        { key: 'id', label: 'Work order', render: w => <span className="font-mono text-[12px] font-semibold">{w.id}</span> },
        { key: 'priority', label: 'Pri', render: w => <Pri p={w.priority} /> },
        { key: 'branch', label: 'Branch', get: w => D.BR[w.branchId].name, render: w => { const b = D.BR[w.branchId]; const c = branchClock(b, now); return <div><div className="font-semibold">{b.name}</div><div className="text-[11px] text-ink3 truncate max-w-[150px]" title="">{b.brand}, {c.local}, {c.open ? 'open' : 'closed'}</div></div>; } },
        { key: 'task', label: 'Task', render: w => <div className="max-w-[340px] text-[12.5px]">{w.task}<div className="flex flex-wrap gap-1 mt-1">{w.skills.map(k => <Badge key={k}>{k}</Badge>)}{w.parts.map(p => <Badge key={p} tone="blue"><I.Package size={10} />{p}</Badge>)}</div></div> },
        { key: 'window', label: 'Window', render: w => <span className="text-[12px] text-ink2">{w.window}</span> },
        { key: 'tech', label: 'Technician', render: w => w.tech ? <span className="font-semibold">{s.techs.find(t => t.id === w.tech).name}</span> : <Btn size="xs" kind="brand" icon={I.Wand2} onClick={() => setMatch(w)}>Match</Btn> },
        { key: 'status', label: 'Status', render: w => <Badge tone={w.status === 'Unassigned' ? 'amber' : w.status === 'Completed' ? 'green' : 'blue'}>{w.status}</Badge> },
        { key: 'eta', label: 'ETA', render: w => w.eta && w.status !== 'Completed' ? <span className="font-mono text-[12px]">{w.eta > now ? dur(w.eta - now) : 'due'}</span> : '—' },
        { key: 'act', label: '', sortable: false, render: w => w.tech && w.status !== 'Completed' ? <div className="flex gap-1 justify-end">{['Assigned', 'Dispatched', 'Scheduled'].includes(w.status) && <Btn size="xs" onClick={() => adv(w, 'En route')}>En route</Btn>}{w.status === 'En route' && <Btn size="xs" onClick={() => adv(w, 'On site')}>On site</Btn>}<Btn size="xs" kind="ok" icon={I.Check} onClick={() => adv(w, 'Completed')}>Complete</Btn></div> : null },
      ]} /></div></Card>}
      {tab === 'techs' && <Card pad={false}><div className="p-3"><Table rows={s.techs} cols={[{ key: 'name', label: 'Technician', render: t => <b>{t.name}</b> }, { key: 'region', label: 'Region' }, { key: 'base', label: 'Base' }, { key: 'skills', label: 'Skills', sortable: false, render: t => <div className="flex flex-wrap gap-1">{t.skills.map(k => <Badge key={k}>{k}</Badge>)}</div> }, { key: 'status', label: 'Status', render: t => <Badge tone={t.status === 'Available' ? 'green' : t.status === 'On site' ? 'blue' : 'gray'}>{t.status}</Badge> }, { key: 'jobs30', label: 'Jobs 30d', right: true }, { key: 'rating', label: 'Rating', right: true }]} /></div></Card>}
      {tab === 'depots' && <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">{s.depots.map(d => <Card key={d.id} title={d.city} sub={d.id} icon={I.Warehouse} right={<Btn size="xs" icon={I.PackagePlus} onClick={() => { act.upd('depots', d.id, x => ({ spares: Object.fromEntries(Object.entries(x.spares).map(([k, v]) => [k, Math.max(v, 3)])) })); act.audit(`Restock requested for ${d.id}`, d.id); act.toast(`Restock ordered for ${d.city}`); }}>Restock</Btn>}>
        {Object.entries(d.spares).map(([k, v]) => <div key={k} className="flex items-center gap-2 py-1 text-[12.5px] border-b border-line/60 last:border-0"><span className="flex-1 text-ink">{k}</span><span className={cx('font-bold', v <= 1 ? 'text-bad' : v <= 2 ? 'text-warn' : 'text-ink')}>{v}</span>{v <= 1 && <Badge tone="red">low</Badge>}</div>)}
      </Card>)}</div>}
      <Modal open={!!match} onClose={() => setMatch(null)} title={match && `Match technician – ${match.id}`} sub={match && `${D.BR[match.branchId].name}, ${D.BR[match.branchId].brand}, needs ${match.skills.join(', ')}${match.parts.length ? `, parts ${match.parts.join(', ')}` : ''}`} wide>
        {match && (() => { const b = D.BR[match.branchId]; const c = branchClock(b, now); return <>
          <div className={cx('rounded-md px-3 py-2 text-[12.5px] mb-3 border', c.open && !['P1', 'P2'].includes(match.priority) ? 'bg-warn/10 border-warn/40 text-ink' : 'bg-chip border-line text-ink2')}><I.Clock size={13} className="inline mr-1" />Branch local time {c.local} ({c.open ? 'open' : 'closed'}). Hours {b.hours.open}–{b.hours.close}{b.hours.sat ? `, Sat ${b.hours.sat}` : ''}. {c.open && !['P1', 'P2'].includes(match.priority) ? 'Non-urgent work: schedule after close.' : 'OK to attend now.'}</div>
          <Table rows={rank(match).map(r => ({ ...r, id: r.t.id }))} cols={[
            { key: 'name', label: 'Technician', render: r => <div><b>{r.t.name}</b><div className="text-[11px] text-ink3">{r.t.base}, {r.t.region}</div></div> },
            { key: 'score', label: 'Match', render: r => <div className="w-24"><div className="text-[12px] font-bold">{Math.round(r.score * 100)}%</div><Progress value={r.score} tone={r.score > 0.75 ? 'green' : 'amber'} h={4} /></div> },
            { key: 'skill', label: 'Skills', render: r => <span className="text-[12px]">{Math.round(r.skill * 100)}%</span> },
            { key: 'avail', label: 'Status', render: r => <Badge tone={r.t.status === 'Available' ? 'green' : 'gray'}>{r.t.status}</Badge> },
            { key: 'depot', label: 'Spares from', render: r => r.depot ? <span className="text-[12px]">{r.depot.city}</span> : <span className="text-[12px] text-bad">none in region</span> },
            { key: 'eta', label: 'ETA', render: r => r.eta > 300 ? <span className="text-warn font-semibold">next day (fly-in)</span> : <b>{r.eta < 90 ? `${r.eta} min` : `${Math.floor(r.eta / 60)} h ${r.eta % 60} m`}</b> },
            { key: 'go', label: '', sortable: false, render: r => <Btn size="xs" kind="brand" onClick={() => assign(match, r)}>Assign</Btn> },
          ]} />
        </>; })()}
      </Modal>
    </div>
  );
}
