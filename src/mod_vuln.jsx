import React, { useState, useMemo } from 'react';
import * as I from 'lucide-react';
import { LivePanel } from './liveui.jsx';
import * as D from './data.js';
import { useApp, useNow, inScope, filteredBranches } from './store.jsx';
import { Card, Badge, Btn, Table, PageHead, Tabs, Stat, cx, Progress, Illus, Dot, Modal, KV } from './ui.jsx';
import { Bars, Legend, LineChart, HBars, Heatmap, Donut, C } from './charts.jsx';
import { num, pct, dateShort, DAY, HR, exportCSV } from './util.js';

const sevTone = s => s === 'Critical' ? 'red' : s === 'High' ? 'amber' : 'gray';

const fmtD = iso => new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const monthsLeft = iso => { const m = Math.round((new Date(iso) - Date.now()) / (30.44 * 864e5)); return m > 0 ? `${m} months left` : 'support ended'; };

export function Vulns() {
  const { s, act } = useApp();
  const now = useNow();
  const [tab, setTab] = useState('advisories');
  const [open, setOpen] = useState(null);
  const devs = useMemo(() => D.DEVICES.filter(d => inScope(s, d.branchId)), [s.filters, s.role]);
  const plan = s.vplan || {};
  const rows = useMemo(() => D.ADVISORIES.map(a => { const ds = devs.filter(d => a.affects(d)); const br = new Set(ds.map(d => d.branchId)); return { ...a, ds, n: ds.length, branches: br.size }; }), [devs]);
  const crit = rows.filter(r => r.sev === 'Critical'), high = rows.filter(r => r.sev === 'High'), life = rows.filter(r => r.sev === 'Lifecycle');
  const critDevs = new Set(crit.flatMap(r => r.ds.map(d => d.id))).size;
  const anyDevs = new Set(rows.filter(r => r.cvss).flatMap(r => r.ds.map(d => d.id))).size;
  const exposedBranches = new Set(rows.filter(r => r.cvss).flatMap(r => r.ds.map(d => d.branchId))).size;
  const endingDevs = life.reduce((a, r) => a + r.n, 0);
  const nearEos = devs.filter(d => { const e = D.lifeInfo(d).eosup; return e && (new Date(e) - now) < 365 * 864e5; }).length;
  const soldOut = devs.filter(d => D.lifeInfo(d).eos).length;
  const patched = devs.length - anyDevs;
  const byRegion = useMemo(() => D.REGIONS.map(rg => rows.filter(r => r.cvss || r.sev === 'Lifecycle').map(r => r.ds.filter(d => D.BR[d.branchId].region === rg).length)), [rows]);
  const lifeYears = [2026, 2027, 2028, 2029, 2030, 2031].map(y => ({ label: String(y), 'End of sale': devs.filter(d => { const e = D.lifeInfo(d).eos; return e && new Date(e).getFullYear() === y; }).length, 'End of support': devs.filter(d => { const e = D.lifeInfo(d).eosup; return e && new Date(e).getFullYear() === y; }).length, 'Warranty ends': devs.filter(d => new Date(d.warranty).getFullYear() === y).length }));
  const burn = useMemo(() => { const labels = [], act0 = [], fc = [], lo = [], hi = []; const cur = anyDevs; for (let i = -6; i <= 8; i++) { labels.push(i === 0 ? 'now' : i < 0 ? `W${i}` : `+${i}w`); if (i <= 0) { act0.push(Math.round(cur * (1 + (-i) * 0.09))); fc.push(i === 0 ? cur : null); lo.push(i === 0 ? cur : null); hi.push(i === 0 ? cur : null); } else { const v = Math.max(0, Math.round(cur * Math.pow(0.68, i))); act0.push(null); fc.push(v); lo.push(Math.max(0, Math.round(v * 0.7))); hi.push(Math.round(v * 1.35 + 6)); } } return { labels, act0, fc, lo, hi }; }, [anyDevs]);
  const topBranches = useMemo(() => { const m = {}; rows.filter(r => r.cvss).forEach(r => r.ds.forEach(d => { m[d.branchId] = (m[d.branchId] || 0) + (r.sev === 'Critical' ? 3 : 2); })); return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, v]) => ({ label: `${D.BR[id].name}`, sub: D.BR[id].brand, value: v, id, color: v >= 9 ? C.bad : v >= 6 ? C.warn : C.s1 })); }, [rows]);
  const sevMix = [{ label: 'Critical (CVSS 9.0+)', value: critDevs, color: C.bad }, { label: 'High (7.0 to 8.9)', value: high.reduce((a, r) => a + r.n, 0), color: C.warn }, { label: 'Lifecycle only', value: endingDevs, color: '#8a8f96' }, { label: 'No known issue', value: Math.max(0, devs.length - anyDevs - endingDevs), color: '#1f7a3a' }];
  const planWaves = r => {
    const regions = [...new Set(r.ds.map(d => D.BR[d.branchId].region))];
    regions.forEach((rg, k) => { const n = r.ds.filter(d => D.BR[d.branchId].region === rg).length; act.add('changes', { id: `CHG00${32300 + Math.floor(Math.random() * 600)}`, title: `${r.id} remediation wave ${k + 1}: ${rg} (${n} devices)`, type: r.sev === 'Critical' ? 'Emergency' : 'Normal', risk: 'Medium', state: 'Scheduled', start: now + (k + 1) * DAY, end: now + (k + 1) * DAY + 4 * HR, window: '22:00–02:00 local, after branch close, canary first', scope: rg, devices: n, owner: act.me(), validation: 'Pending', nac: `firmware/${r.id.toLowerCase()}.yaml` }); });
    act.set(st => ({ vplan: { ...(st.vplan || {}), [r.id]: 'Waves scheduled' } }));
    act.audit(`Planned ${regions.length} remediation waves for ${r.id} (${r.n} devices)`, r.id);
    act.toast(`${regions.length} waves scheduled after branch close; see Approvals & Changes`);
  };
  const mitigate = r => { act.set(st => ({ vplan: { ...(st.vplan || {}), [r.id + ':m']: true } })); act.audit(`Mitigation pushed for ${r.id}: ${r.mitigation}`, r.id); act.toast('Mitigation pushed from Network-as-Code; verification running'); };

  return (
    <div>
      <PageHead title="Lifecycle and vulnerabilities" sub="Every device matched against HPE Aruba Networking security bulletins and end-of-life notices, with exposure by branch and a plan to close it without touching trading hours."
        right={<Btn size="sm" icon={I.Download} onClick={() => exportCSV('srs-vulnerable-devices.csv', rows.flatMap(r => r.ds.map(d => ({ ...d, adv: r }))), [{ label: 'Advisory', get: d => d.adv.id }, { label: 'CVEs', get: d => d.adv.cves.join(' ') }, { label: 'CVSS', get: d => d.adv.cvss || '' }, { label: 'Hostname', key: 'id' }, { label: 'Model', key: 'desc' }, { label: 'Firmware', key: 'fw' }, { label: 'Branch', get: d => D.BR[d.branchId].name }, { label: 'Brand', get: d => D.BR[d.branchId].brand }, { label: 'Region', get: d => D.BR[d.branchId].region }])}>Export affected devices</Btn>} />
      <div className="kpi-strip grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-6">
        <Stat label="Devices with a critical CVE" onClick={() => act.drill({ t: 'devices', k: 'crit' })} value={num(critDevs)} tone={critDevs ? 'red' : 'green'} sub={`of ${num(devs.length)} in view`} />
        <Stat label="Open advisories" value={rows.filter(r => r.cvss && r.n).length} sub={`${crit.filter(r => r.n).length} critical, ${high.filter(r => r.n).length} high`} />
        <Stat label="Branches exposed" onClick={() => act.drill({ t: 'set', k: 'exposed' })} value={num(exposedBranches)} tone="amber" sub={`of ${num(filteredBranches(s).length)}`} />
        <Stat label="End of support within 12 months" onClick={() => act.drill({ t: 'devices', k: 'eos' })} value={num(nearEos)} tone={nearEos ? 'amber' : 'green'} sub="Aruba 2530: 31 Jan 2027 (48G), 31 Mar 2027 (24G)" />
        <Stat label="Patch compliance" value={pct(patched / Math.max(1, devs.length))} sub="no known CVE on running firmware" />
        <Stat label="Mean time to patch, critical" value="9 d" sub="target 14 d, last 90 days" />
      </div>
      <LivePanel kind="vuln" className="mb-3 mt-3" />
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 mt-3">
        <Card title="Exposure by severity" sub="Each device counted once at its worst finding"><Donut data={sevMix} center={num(anyDevs)} sub="with a CVE" /></Card>
        <Card title="Vulnerable devices, now and projected" sub="If the scheduled remediation waves run as planned">
          <LineChart labels={burn.labels} series={[{ name: 'Vulnerable devices', data: burn.act0, color: C.bad }, { name: 'Projected', data: burn.fc, color: C.bad, forecastFrom: 6 }]} band={{ lo: burn.lo, hi: burn.hi, color: C.bad }} forecastFrom={6} h={170} yMin={0} yFmt={v => Math.round(v)} />
        </Card>
        <Card title="End of sale, end of support and warranty, by year" sub="Devices reaching each date, from HPE Aruba Networking notices">
          <Bars data={lifeYears} keys={['End of sale', 'End of support', 'Warranty ends']} colors={[C.warn, C.bad, C.s1]} h={170} />
        </Card>
      </div>
      <Tabs value={tab} onChange={setTab} className="mt-3 mb-2" tabs={[{ id: 'advisories', label: 'Advisories', count: rows.filter(r => r.n).length }, { id: 'models', label: 'Models and lifecycle' }, { id: 'regions', label: 'Exposure by region' }, { id: 'branches', label: 'Most exposed branches' }]} />
      {tab === 'advisories' && <div className="space-y-2">{rows.filter(r => r.n).map(r => <Card key={r.id} pad={false}><div className="grid-cols-1 p-4 grid lg:grid-cols-[minmax(0,1fr)_300px] gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap"><Badge tone={sevTone(r.sev)}>{r.sev}{r.cvss ? ` CVSS ${r.cvss}` : ''}</Badge><span className="text-[12px] text-ink3">{r.id}, published {r.published}</span>{plan[r.id] && <Badge tone="blue">{plan[r.id]}</Badge>}{plan[r.id + ':m'] && <Badge tone="green">Mitigated</Badge>}</div>
          <div className="text-[15px] font-bold text-ink mt-1">{r.title}</div>
          {r.cves.length > 0 && <div className="text-[12.5px] text-ink2 mt-0.5">{r.cves.join(', ')}</div>}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2 text-[12.5px]"><div><div className="text-ink3">Product</div><div className="text-ink">{r.product}</div></div><div><div className="text-ink3">Fixed in</div><div className="text-ink">{r.fixed}</div></div><div><div className="text-ink3">Mitigation until patched</div><div className="text-ink">{r.mitigation}</div></div></div>
          <div className="text-[11.5px] text-ink3 mt-2">Source: {D.SRC[r.src]}</div>
        </div>
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2"><div className="bg-chip/60 rounded-md p-2"><div className="text-[11.5px] text-ink3">Devices affected</div><div className="text-[22px] font-bold text-ink">{num(r.n)}</div></div><div className="bg-chip/60 rounded-md p-2"><div className="text-[11.5px] text-ink3">Branches</div><div className="text-[22px] font-bold text-ink">{num(r.branches)}</div></div></div>
          <div className="flex flex-wrap gap-1.5">{r.sev !== 'Lifecycle' ? <Btn size="sm" kind="brand" icon={I.CalendarPlus} disabled={!!plan[r.id]} onClick={() => planWaves(r)}>Plan patch waves</Btn> : <Btn size="sm" kind="brand" icon={I.PackagePlus} onClick={() => { act.audit(`Lifecycle refresh plan raised for ${r.id} (${r.n} devices)`, r.id); act.set(st => ({ vplan: { ...(st.vplan || {}), [r.id]: 'Refresh plan raised' } })); act.toast('Refresh plan raised: Branch-in-a-Box kit, busiest branches first'); }}>Plan refresh</Btn>}<Btn size="sm" icon={I.ShieldCheck} disabled={!!plan[r.id + ':m']} onClick={() => mitigate(r)}>Mitigate now</Btn><Btn size="sm" icon={I.List} onClick={() => setOpen(r)}>Devices</Btn></div>
          <Progress value={plan[r.id] ? 0.35 : plan[r.id + ':m'] ? 0.15 : 0.02} tone={plan[r.id] ? 'blue' : 'amber'} /><div className="text-[11.5px] text-ink3">{plan[r.id] ? 'Waves scheduled after branch close, canary first' : 'Not yet scheduled'}</div>
        </div>
      </div></Card>)}</div>}
      {tab === 'models' && <Card pad={false}><div className="p-3"><Table rows={[...Object.keys(D.MODEL_INFO).flatMap(k => k === '2530' ? [['2530', 'J9772A'], ['2530', 'J9773A']] : [[k, null]])].map(([k, sku]) => { const m = sku ? { ...D.MODEL_INFO[k], ...(D.SKU_INFO[sku] || {}) } : D.MODEL_INFO[k]; const ds = devs.filter(d => d.model === k && (!sku || (d.sku || 'J9772A') === sku)); return { id: k + (sku || ''), ...m, n: ds.length, v: ds.filter(d => D.vulnsOf(d).some(a => a.cvss)).length, w: ds.filter(d => d.warranty < now).length }; }).filter(r => r.n)} cols={[
        { key: 'name', label: 'Model', render: r => <div><b className="text-ink">{r.name}</b>{r.sku && <span className="text-ink3"> {r.sku}</span>}<div className="text-[11.5px] text-ink3">{r.make}, {r.family}</div></div> },
        { key: 'os', label: 'Software' }, { key: 'n', label: 'Devices', right: true, render: r => num(r.n) },
        { key: 'status', label: 'Lifecycle', render: r => <Badge tone={r.status === 'Current' ? 'green' : r.eosup && (new Date(r.eosup) - now) < 365 * 864e5 ? 'red' : 'amber'}>{r.status}</Badge> },
        { key: 'eos', label: 'End of sale', render: r => r.eos ? <b className="text-ink">{fmtD(r.eos)}</b> : <span className="text-ink3">Not announced</span> },
        { key: 'eosup', label: 'End of support', render: r => r.eosup ? <span><b className="text-ink">{fmtD(r.eosup)}</b><span className="block text-[11.5px] text-ink3">{monthsLeft(r.eosup)}</span></span> : <span className="text-ink3">Not announced</span> },
        { key: 'v', label: 'With open CVE', right: true, render: r => <span className={r.v ? 'text-bad font-bold' : 'text-ink3'}>{num(r.v)}</span> },
        { key: 'w', label: 'Warranty or contract lapsed', right: true, render: r => num(r.w) },
        { key: 'replace', label: 'Replacement', render: r => r.replace || '—' },
      ]} /><div className="text-[11.5px] text-ink3 mt-2 space-y-0.5"><div>Sources: {D.SRC.eol2530}. {D.SRC.ecxs}. No end of sale has been announced for the CX 6100, 6200M and 6300M switches or the AP-634, AP-635, AP-565, AP-567, AP-575 and AP-585 access points.</div><div>The 728 Aruba 2530 switches need replacing before their end of support; refresh waves use the Branch-in-a-Box kit. EC-XS units stay supported until 31 Jan 2031; new and replacement units are EdgeConnect 10104.</div></div></div></Card>}
      {tab === 'regions' && <Card title="Affected devices by region and advisory" sub="Darker cells need the earliest patch waves">
        <Heatmap rows={D.REGIONS} cols={rows.filter(r => r.cvss || r.sev === 'Lifecycle').map(r => r.cves[0] || r.id)} values={byRegion} cell={96} rowW={170} fmt={v => `${v} devices`} />
      </Card>}
      {tab === 'branches' && <Card title="Most exposed branches" sub="Weighted by severity of open findings; click to open Branch 360">
        <HBars rows={topBranches} labelW={220} onRow={r => act.openBranch(r.id)} />
      </Card>}
      <Modal open={!!open} onClose={() => setOpen(null)} title={open && `${open.id}: affected devices`} sub={open && `${open.n} devices at ${open.branches} branches`} wide>
        {open && <Table dense pageSize={15} rows={open.ds} onRow={d => { setOpen(null); act.openBranch(d.branchId); }} cols={[{ key: 'id', label: 'Hostname', render: d => <span className="font-mono font-bold">{d.id}</span> }, { key: 'desc', label: 'Model' }, { key: 'fw', label: 'Firmware' }, { key: 'b', label: 'Branch', get: d => D.BR[d.branchId].name, render: d => <span>{D.BR[d.branchId].name}<span className="text-ink3">, {D.BR[d.branchId].brand}</span></span> }, { key: 'r', label: 'Region', get: d => D.BR[d.branchId].region }]} />}
      </Modal>
    </div>
  );
}
