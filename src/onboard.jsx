// Onboard devices into OpsRamp monitoring, the way OpsRamp does it: a discovery profile (IP range or seed IP,
// credential sets, a gateway) scanned now, or a bulk import file; every device found is identified from its SNMP
// sysObjectID, given its monitoring template, dragged onto a resource group and added to monitoring.
import React, { useState, useRef, useEffect } from 'react';
import * as I from 'lucide-react';
import { useApp } from './store.jsx';
import { Card, Badge, Btn, cx } from './ui.jsx';
import { downloadFile } from './util.js';

// vendor by SNMP enterprise number (the prefix of sysObjectID) and the template OpsRamp assigns
const VENDOR = [
  [/47196/, 'HPE Aruba CX', 'TPL-CX'], [/14823/, 'HPE Aruba AP', 'TPL-AP'], [/23867/, 'HPE Aruba EdgeConnect', 'TPL-EC'], [/\.9\./, 'Cisco', 'TPL-CAT9K'],
  [/29671/, 'Cisco Meraki', 'TPL-MERAKI'], [/12356/, 'Fortinet FortiGate', 'TPL-FORTI'], [/25461/, 'Palo Alto', 'TPL-PANOS'], [/.*/, 'Unknown', 'Generic SNMP'],
];
const ident = oid => VENDOR.find(([re]) => re.test(oid));
const CREDS = ['SNMPv3 SRS-NOC (authPriv)', 'SNMPv3 acquired-sites', 'Aruba Central API', 'Orchestrator API'];
const GROUPS = [['Acquired: LS Building Products', 'amber'], ['Hypercare (tighter thresholds)', 'blue'], ['Great Lakes stores', 'gray'], ['Southeast stores', 'gray']];

// what a scan of the acquired site's management range finds
const SCAN = [
  ['10.61.4.1', 'ls-ilb1-rtr01', '1.3.6.1.4.1.9.1.2068', 'ISR 1111 router', 'ok'],
  ['10.61.4.2', 'ls-ilb1-fw01', '1.3.6.1.4.1.12356.101.1.604', 'FortiGate 60F', 'ok'],
  ['10.61.4.10', 'ls-ilb1-sw01', '1.3.6.1.4.1.9.1.2694', 'Catalyst 9200-24P', 'ok'],
  ['10.61.4.11', 'ls-ilb1-sw02', '1.3.6.1.4.1.9.1.2694', 'Catalyst 9200-24P', 'ok'],
  ['10.61.4.12', '—', '—', 'Unmanaged switch (no SNMP)', 'noresp'],
  ['10.61.4.20', 'ls-ilb1-mr01', '1.3.6.1.4.1.29671.2.130', 'Meraki MR36', 'ok'],
  ['10.61.4.21', 'ls-ilb1-mr02', '1.3.6.1.4.1.29671.2.130', 'Meraki MR36', 'ok'],
  ['10.61.4.22', 'ls-ilb1-mr03', '1.3.6.1.4.1.29671.2.130', 'Meraki MR36', 'ok'],
  ['10.61.4.30', 'ls-ilb1-nvr01', '1.3.6.1.4.1.8072.3.2.10', 'Camera recorder (Linux SNMP)', 'ok'],
  ['10.61.4.31', 'ls-ilb1-ups01', '—', 'UPS (community string only)', 'cred'],
];
const SAMPLE_CSV = `hostname,ip,vendor,model,site,group
ls-ilb1-rtr01,10.61.4.1,Cisco,ISR 1111,Central Illinois – Branch 1,Acquired: LS Building Products
ls-ilb1-fw01,10.61.4.2,Fortinet,FortiGate 60F,Central Illinois – Branch 1,Acquired: LS Building Products
ls-ilb1-sw01,10.61.4.10,Cisco,Catalyst 9200-24P,Central Illinois – Branch 1,Acquired: LS Building Products
ls-ilb1-sw02,10.61.4.11,Cisco,Catalyst 9200-24P,Central Illinois – Branch 1,Acquired: LS Building Products
ls-ilb1-mr01,10.61.4.20,Cisco Meraki,MR36,Central Illinois – Branch 1,Acquired: LS Building Products
ls-ilb1-mr02,10.61.4.21,Cisco Meraki,MR36,Central Illinois – Branch 1,Acquired: LS Building Products
ls-ilb1-mr03,10.61.4.21,Cisco Meraki,MR36,Central Illinois – Branch 1,Acquired: LS Building Products
ls-ilb1-ups01,10.61.4.31,APC,Smart-UPS 1500,,Acquired: LS Building Products`;
const TPL_OF_VENDOR = v => /meraki/i.test(v) ? 'TPL-MERAKI' : /forti/i.test(v) ? 'TPL-FORTI' : /cisco/i.test(v) ? 'TPL-CAT9K' : /aruba/i.test(v) ? 'TPL-CX' : /palo/i.test(v) ? 'TPL-PANOS' : 'Generic SNMP';

function parseCSV(txt) {
  const lines = txt.trim().split(/\r?\n/).filter(Boolean); if (lines.length < 2) return [];
  const head = lines[0].split(',').map(h => h.trim().toLowerCase());
  const seen = new Set();
  return lines.slice(1).map((l, i) => {
    const c = l.split(','), r = Object.fromEntries(head.map((h, k) => [h, (c[k] || '').trim()]));
    const issues = [];
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(r.ip || '')) issues.push('IP missing or invalid');
    else if (seen.has(r.ip)) issues.push('Duplicate IP'); else seen.add(r.ip);
    if (!r.site) issues.push('No site');
    const tpl = TPL_OF_VENDOR(r.vendor || '');
    return { key: `csv${i}`, ip: r.ip, host: r.hostname || '—', vendor: r.vendor || 'Unknown', model: r.model || '—', tpl, group: r.group || '', status: issues.length ? (issues.includes('Duplicate IP') ? 'dup' : 'warn') : 'ok', issues };
  });
}

export function DeviceOnboarding() {
  const { s, act } = useApp();
  const [mode, setMode] = useState('scan');
  const [range, setRange] = useState('10.61.4.0/24'), [ptype, setPtype] = useState('IP range'), [creds, setCreds] = useState([CREDS[0], CREDS[1]]), [gw, setGw] = useState('NextGen gateway – DC1 McKinney');
  const [rows, setRows] = useState([]); const [prog, setProg] = useState(null); const [sel, setSel] = useState(new Set());
  const [overFile, setOverFile] = useState(false), [overGrp, setOverGrp] = useState(null);
  const [done, setDone] = useState(null);
  const tm = useRef(null); useEffect(() => () => clearInterval(tm.current), []);
  const scan = () => {
    setRows([]); setDone(null); setSel(new Set()); setProg(0); clearInterval(tm.current);
    let k = 0;
    tm.current = setInterval(() => {
      if (k >= SCAN.length) { clearInterval(tm.current); setProg(null); return; }
      const [ip, host, oid, model, st] = SCAN[k]; const v = ident(oid);
      const credOk = st !== 'cred' || creds.length > 2;
      const r = { key: ip, ip, host, oid, vendor: st === 'noresp' ? '—' : v[1], model, tpl: st === 'noresp' ? '—' : v[2], group: '', status: st === 'noresp' ? 'noresp' : credOk ? 'ok' : 'cred', issues: st === 'noresp' ? ['No SNMP response'] : credOk ? [] : ['Credential failed: try another set'] };
      setRows(x => [...x, r]); if (r.status === 'ok') setSel(x => new Set([...x, r.key]));
      k++; setProg(Math.round(k / SCAN.length * 254));
    }, 380);
  };
  const loadCSV = txt => { const r = parseCSV(txt); setRows(r); setDone(null); setSel(new Set(r.filter(x => x.status === 'ok').map(x => x.key))); act.toast(`${r.length} rows read`); };
  const onFile = f => { const rd = new FileReader(); rd.onload = () => loadCSV(String(rd.result)); rd.readAsText(f); };
  const assign = g => { setRows(x => x.map(r => sel.has(r.key) ? { ...r, group: g } : r)); act.toast(`${sel.size} assigned to ${g}`); };
  const addAll = () => {
    const picked = rows.filter(r => sel.has(r.key) && r.status === 'ok');
    if (!picked.length) return;
    act.set(st => ({ onboarded: [...(st.onboarded || []), ...picked.map(r => ({ ip: r.ip, host: r.host, tpl: r.tpl, group: r.group || 'Unassigned', t: Date.now() }))] }));
    act.audit(`Onboarded ${picked.length} devices to OpsRamp monitoring (${mode === 'scan' ? `discovery ${range}` : 'bulk import'})`, 'onboard');
    setDone({ n: picked.length, tpl: new Set(picked.map(r => r.tpl)).size, grp: new Set(picked.map(r => r.group).filter(Boolean)).size, skip: rows.length - picked.length });
    act.toast(`${picked.length} devices now monitored in OpsRamp`);
  };
  const ST = { ok: ['Ready', 'green'], cred: ['Credential failed', 'amber'], noresp: ['No response', 'gray'], dup: ['Duplicate IP', 'red'], warn: ['Check', 'amber'] };
  const total = (s.onboarded || []).length;
  const Seg = ({ v, set, opts }) => <div className="inline-flex rounded-md bg-chip p-0.5 text-[12px] font-bold">{opts.map(o => <button key={o} onClick={() => set(o)} className={cx('px-2.5 py-1 rounded', v === o ? 'bg-panel text-ink shadow-sm' : 'text-ink3 hover:text-ink')}>{o}</button>)}</div>;
  return (
    <Card title="Onboard devices" right={<div className="flex items-center gap-3"><span className="text-[12px] text-ink3"><b className="text-ink">{total}</b> onboarded this session</span><Seg v={mode === 'scan' ? 'Discovery scan' : 'Bulk import'} set={o => { setMode(o === 'Discovery scan' ? 'scan' : 'csv'); setRows([]); setDone(null); }} opts={['Discovery scan', 'Bulk import']} /></div>}>
      {mode === 'scan' ? (
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto] gap-3 items-end mb-3">
          <label className="text-[12px]"><span className="block text-ink3 mb-1">Discovery profile</span><div className="flex gap-2"><Seg v={ptype} set={setPtype} opts={['IP range', 'Seed IP']} /><input value={range} onChange={e => setRange(e.target.value)} className="flex-1 min-w-0 h-8 rounded-md border border-line bg-canvas px-2 font-mono text-[12.5px]" /></div></label>
          <div className="text-[12px]"><span className="block text-ink3 mb-1">Credential sets</span><div className="flex flex-wrap gap-1">{CREDS.map(c => { const on = creds.includes(c); return <button key={c} onClick={() => setCreds(x => on ? x.filter(y => y !== c) : [...x, c])} className={cx('text-[11px] px-2 py-1 rounded border', on ? 'border-brand bg-brand/10 text-ink font-semibold' : 'border-line text-ink3')}>{c}</button>; })}</div></div>
          <label className="text-[12px]"><span className="block text-ink3 mb-1">Gateway</span><select value={gw} onChange={e => setGw(e.target.value)} className="w-full h-8 rounded-md border border-line bg-canvas px-2 text-[12.5px]">{['NextGen gateway – DC1 McKinney', 'NextGen gateway – DC2 Atlanta'].map(g => <option key={g}>{g}</option>)}</select></label>
          <Btn kind="brand" icon={I.Radar} onClick={scan} disabled={prog != null}>{prog != null ? `Scanning ${prog}/254` : 'Scan now'}</Btn>
        </div>
      ) : (
        <div onDragOver={e => { e.preventDefault(); setOverFile(true); }} onDragLeave={() => setOverFile(false)} onDrop={e => { e.preventDefault(); setOverFile(false); const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) onFile(f); }}
          className={cx('rounded-xl border-2 border-dashed p-4 mb-3 flex flex-wrap items-center gap-3', overFile ? 'border-brand bg-brand/10' : 'border-brand/40 bg-brand/[0.03]')}>
          <I.FileSpreadsheet size={28} className="text-brand" />
          <div className="flex-1 min-w-[200px]"><b className="text-[13px] text-ink">Drop a CSV of devices here</b><div className="text-[11.5px] text-ink3 font-mono">hostname, ip, vendor, model, site, group</div></div>
          <label className="h-8 px-3 rounded-md border border-line bg-panel text-[12.5px] font-semibold text-ink inline-flex items-center gap-1.5 cursor-pointer hover:bg-chip"><I.Upload size={14} />Choose file<input type="file" accept=".csv,text/csv" className="hidden" onChange={e => e.target.files[0] && onFile(e.target.files[0])} /></label>
          <Btn size="sm" icon={I.Play} onClick={() => loadCSV(SAMPLE_CSV)}>Use the sample file</Btn>
          <Btn size="sm" icon={I.Download} onClick={() => downloadFile('opsramp-bulk-onboard-sample.csv', SAMPLE_CSV, 'text/csv')}>Sample CSV</Btn>
        </div>
      )}
      {rows.length > 0 && <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_260px] gap-3 items-start">
        <div className="overflow-x-auto border border-line rounded-lg"><table className="w-full text-[12px]">
          <thead><tr className="border-b border-line bg-chip/60 text-ink3"><th className="p-1.5 w-7"><input type="checkbox" checked={rows.filter(r => r.status === 'ok').every(r => sel.has(r.key))} onChange={e => setSel(e.target.checked ? new Set(rows.filter(r => r.status === 'ok').map(r => r.key)) : new Set())} /></th>{['IP', 'Hostname', mode === 'scan' ? 'sysObjectID' : 'Vendor', 'Model', 'Template', 'Resource group', 'Status'].map(h => <th key={h} className="p-1.5 text-left font-semibold">{h}</th>)}</tr></thead>
          <tbody>{rows.map(r => { const [l, t] = ST[r.status]; const can = r.status === 'ok'; return (
            <tr key={r.key} draggable={can && sel.has(r.key)} onDragStart={e => e.dataTransfer.setData('text/plain', 'sel')} className={cx('border-b border-line/60 last:border-0', sel.has(r.key) && 'bg-brand/[0.05]', can && sel.has(r.key) && 'cursor-grab')}>
              <td className="p-1.5"><input type="checkbox" disabled={!can} checked={sel.has(r.key)} onChange={() => setSel(x => { const n = new Set(x); n.has(r.key) ? n.delete(r.key) : n.add(r.key); return n; })} /></td>
              <td className="p-1.5 font-mono">{r.ip || '—'}</td><td className="p-1.5 font-mono">{r.host}</td><td className="p-1.5 font-mono text-[11px] text-ink2">{mode === 'scan' ? r.oid : r.vendor}</td><td className="p-1.5">{r.model}</td>
              <td className="p-1.5"><span className={cx('font-mono text-[11px] px-1.5 py-[1px] rounded border', r.tpl === 'Generic SNMP' ? 'border-warn/50 text-warn' : 'border-line text-ink2')}>{r.tpl}</span></td>
              <td className="p-1.5 text-ink2">{r.group || '—'}</td>
              <td className="p-1.5"><Badge tone={t}>{l}</Badge>{r.issues[0] && r.status !== 'ok' && <span className="block text-[10.5px] text-ink3">{r.issues[0]}</span>}</td>
            </tr>); })}</tbody></table></div>
        <div className="space-y-2">
          <div className="text-[10.5px] font-bold uppercase text-ink3">Drag the selected rows onto a group</div>
          {GROUPS.map(([g, t]) => <div key={g} onDragOver={e => { e.preventDefault(); setOverGrp(g); }} onDragLeave={() => setOverGrp(null)} onDrop={e => { e.preventDefault(); setOverGrp(null); assign(g); }} onClick={() => sel.size && assign(g)}
            className={cx('rounded-lg border-2 border-dashed px-3 py-2 text-[12.5px] flex items-center gap-2 cursor-pointer', overGrp === g ? 'border-brand bg-brand/10' : 'border-line hover:border-ink3')}>
            <I.FolderInput size={15} className="text-brand" /><span className="flex-1 text-ink">{g}</span><Badge tone={t}>{rows.filter(r => r.group === g).length}</Badge></div>)}
          <Btn kind="brand" className="w-full justify-center" icon={I.MonitorCheck} disabled={!rows.some(r => sel.has(r.key) && r.status === 'ok') || prog != null} onClick={addAll}>Add {rows.filter(r => sel.has(r.key) && r.status === 'ok').length} to monitoring</Btn>
          {done && <div className="rounded-lg border border-ok/40 bg-ok/5 p-2.5 grid grid-cols-2 gap-2 text-[12px]">{[['Monitored', done.n], ['Templates', done.tpl], ['Groups', done.grp], ['Skipped', done.skip]].map(([k, v]) => <div key={k}><div className="text-ink3 text-[11px]">{k}</div><b className="text-ink text-[16px] tabular-nums">{v}</b></div>)}</div>}
        </div>
      </div>}
    </Card>
  );
}
