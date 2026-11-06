// Integration studio: every source OpsRamp monitors for SRS and every one ready in the OpsRamp library (Cisco and
// others), and the acquired branches waiting to be onboarded. Drag one onto OpsRamp (or press Connect) and watch it
// come online: gateway, credentials, discovery, templates, events, ServiceNow.
import React, { useState, useEffect, useRef } from 'react';
import * as I from 'lucide-react';
import * as D from './data.js';
import { useApp } from './store.jsx';
import { Card, Badge, Btn, Logo, cx } from './ui.jsx';
import { num } from './util.js';

const cnt = f => D.DEVICES.filter(f).length;
// [id, name, category, connected?, devices or lines, logo key, the template it uses]
export const SRC = [
  ['ec', 'HPE Aruba EdgeConnect', 'Network', true, cnt(d => d.type === 'SD-WAN'), 'aruba', 'TPL-EC'],
  ['central', 'HPE Aruba Central', 'Network', true, cnt(d => d.type === 'AP'), 'central', 'TPL-AP'],
  ['cx', 'Aruba CX and 2530 switches', 'Network', true, cnt(d => d.type === 'Switch'), null, 'TPL-CX'],
  ['cat9k', 'Cisco Catalyst switches', 'Network', false, 46, null, 'TPL-CX'],
  ['meraki', 'Cisco Meraki', 'Network', false, 61, null, 'TPL-AP'],
  ['catsdwan', 'Cisco Catalyst SD-WAN', 'Network', false, 18, null, 'TPL-EC'],
  ['forti', 'Fortinet FortiGate', 'Network', false, 18, null, null],
  ['palo', 'Palo Alto Networks', 'Network', false, 4, null, null],
  ['juniper', 'Juniper Mist', 'Network', false, 12, null, 'TPL-AP'],
  ['circuits', 'ISP circuits (Simplify)', 'Lines and carriers', true, D.CIRCUITS.length, null, 'TPL-CIR'],
  ['carriers', 'Carrier portals', 'Lines and carriers', true, 9, null, null],
  ['newrelic', 'New Relic', 'Applications and cloud', true, D.APPS.length, 'newrelic', 'TPL-APP'],
  ['azure', 'Microsoft Azure', 'Applications and cloud', true, 6, 'azure', null],
  ['aws', 'Amazon Web Services', 'Applications and cloud', false, 9, null, null],
  ['dyna', 'Dynatrace', 'Applications and cloud', false, 0, null, null],
  ['snow', 'ServiceNow', 'Service management', true, 0, 'servicenow', null],
  ['teams', 'Microsoft Teams and email', 'Service management', true, 0, null, null],
];
const CATS = ['Network', 'Lines and carriers', 'Applications and cloud', 'Service management', 'Acquired branches'];
const STEPS_SRC = [['Gateway', I.Server], ['Credentials', I.KeyRound], ['Discovery', I.Radar], ['Templates', I.LayoutTemplate], ['Events', I.Webhook], ['ServiceNow', I.Ticket]];
const STEPS_ACQ = [['Gateway at the site', I.Server], ['Discover legacy kit', I.Radar], ['Generic and vendor templates', I.LayoutTemplate], ['Topology', I.Network], ['ServiceNow CMDB', I.Database], ['Monitored, day one', I.CircleCheck]];

export function IntegrationStudio() {
  const { s, act } = useApp();
  const conn = new Set([...SRC.filter(x => x[3]).map(x => x[0]), ...(s.studioConnected || [])]);
  const acq = s.projects.filter(p => p.track === 'Acquired');
  const acqDone = new Set([...acq.filter(p => p.steps && p.steps.onboard === 'done').map(p => p.id), ...(s.studioOnboarded || [])]);
  const [over, setOver] = useState(false);
  const [run, setRun] = useState(null); // { id, kind, name, step, steps, found }
  const tm = useRef(null);
  useEffect(() => () => clearInterval(tm.current), []);
  const start = id => {
    if (run && run.step < run.steps.length) return;
    const src = SRC.find(x => x[0] === id), p = acq.find(x => x.id === id);
    if (src && conn.has(id)) { act.toast(`${src[1]} is already connected`); return; }
    if (p && acqDone.has(id)) { act.toast(`${p.brand} is already monitored`); return; }
    const kind = src ? 'src' : 'acq';
    const found = src ? src[4] : (p.legacy || []).reduce((a, l) => a + (+((l[0].match(/×(\d+)/) || [])[1]) || 1), 0) + (p.carriers || []).length;
    setRun({ id, kind, name: src ? src[1] : `${p.brand} – ${p.site}`, step: 0, steps: kind === 'src' ? STEPS_SRC : STEPS_ACQ, found, tpl: src && src[6] });
    clearInterval(tm.current);
    tm.current = setInterval(() => setRun(r => {
      if (!r) return r;
      const n = r.step + 1;
      if (n >= r.steps.length) {
        clearInterval(tm.current);
        if (r.kind === 'src') act.set(st => ({ studioConnected: [...new Set([...(st.studioConnected || []), r.id])] }));
        else act.set(st => ({ studioOnboarded: [...new Set([...(st.studioOnboarded || []), r.id])] }));
        act.audit(`${r.kind === 'src' ? 'Connected to OpsRamp' : 'Onboarded to OpsRamp monitoring'}: ${r.name}`, r.id);
        act.toast(`${r.name}: ${r.kind === 'src' ? 'connected' : 'monitored from day one'}`);
      }
      return { ...r, step: n };
    }), 650);
  };
  const Tile = ({ id, name, sub, on, logo, acqP }) => (
    <div draggable={!on} onDragStart={e => { e.dataTransfer.setData('text/plain', id); e.dataTransfer.effectAllowed = 'copy'; }}
      className={cx('rounded-lg border px-2.5 py-2 flex items-center gap-2 text-[12.5px] select-none', on ? 'border-ok/40 bg-ok/5' : 'border-dashed border-ink3/60 bg-panel cursor-grab hover:border-brand')}>
      {logo ? <Logo k={logo} h={12} className="!px-0.5 !py-0 shrink-0" /> : acqP ? <I.Store size={15} className="text-warn shrink-0" /> : <I.Plug size={15} className={on ? 'text-ok shrink-0' : 'text-ink3 shrink-0'} />}
      <span className="flex-1 min-w-0"><b className="block text-ink truncate">{name}</b><span className="block text-[11px] text-ink3 truncate">{sub}</span></span>
      {on ? <I.CircleCheck size={15} className="text-ok shrink-0" /> : <button onClick={() => start(id)} className="text-[11px] font-bold text-brand hover:underline shrink-0">Connect</button>}
    </div>
  );
  const total = SRC.filter(x => conn.has(x[0])).reduce((a, x) => a + x[4], 0);
  const busy = run && run.step < run.steps.length;
  return (
    <Card title="Integration studio" right={<span className="text-[12px] text-ink3"><b className="text-ink">{SRC.filter(x => conn.has(x[0])).length}</b> connected · <b className="text-ink">{SRC.filter(x => !conn.has(x[0])).length}</b> ready in the library · <b className="text-ink">{num(total)}</b> devices and lines monitored</span>}>
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-4 items-start">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{CATS.map(c => (
          <div key={c} className={c === 'Network' ? 'md:row-span-2' : ''}>
            <div className="text-[10.5px] font-bold uppercase text-ink3 mb-1.5">{c}</div>
            <div className="space-y-1.5">
              {c !== 'Acquired branches' ? SRC.filter(x => x[2] === c).map(x => <Tile key={x[0]} id={x[0]} name={x[1]} logo={x[5]} on={conn.has(x[0])} sub={conn.has(x[0]) ? (x[4] ? `${num(x[4])} monitored` : 'connected') : `In the OpsRamp library${x[4] ? ` · ${x[4]} found at acquired sites` : ''}`} />)
                : acq.map(p => <Tile key={p.id} id={p.id} acqP name={p.brand} on={acqDone.has(p.id)} sub={acqDone.has(p.id) ? `${p.site} · monitored` : `${p.site} · ${p.stage}`} />)}
            </div>
          </div>))}</div>
        <div>
          <div onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={e => { e.preventDefault(); setOver(false); start(e.dataTransfer.getData('text/plain')); }}
            className={cx('rounded-xl border-2 border-dashed p-4 text-center transition-colors', over ? 'border-brand bg-brand/10' : 'border-brand/40 bg-brand/[0.04]')}>
            <div className="mx-auto w-16 h-16 rounded-full bg-[#263040] grid place-items-center ring-4 ring-brand/30"><Logo k="opsramp" h={14} className="!border-0" /></div>
            <div className="text-[14px] font-bold text-ink mt-2">{busy ? `Connecting ${run.name}` : 'Drop a source or a branch here'}</div>
            <div className="text-[11.5px] text-ink3">{busy ? `${run.step} of ${run.steps.length}` : 'or press Connect'}</div>
          </div>
          {run && <div className="mt-3 rounded-lg border border-line p-3">
            <div className="flex items-center gap-2 mb-2"><b className="text-[13px] text-ink flex-1 truncate">{run.name}</b>{run.step >= run.steps.length ? <Badge tone="green">{run.kind === 'src' ? 'Connected' : 'Monitored'}</Badge> : <Badge tone="blue">Running</Badge>}</div>
            <div className="h-1.5 bg-chip rounded mb-2"><div className="h-1.5 bg-brand rounded transition-all" style={{ width: `${Math.min(100, run.step / run.steps.length * 100)}%` }} /></div>
            <ol className="space-y-1">{run.steps.map(([t, Ic], i) => { const st = i < run.step ? 'done' : i === run.step ? 'now' : 'todo'; return (
              <li key={t} className={cx('flex items-center gap-2 text-[12.5px]', st === 'todo' && 'text-ink3')}>
                {st === 'done' ? <I.CircleCheck size={15} className="text-ok" /> : st === 'now' ? <I.Loader2 size={15} className="text-brand animate-spin" /> : <Ic size={15} />}
                <span className="flex-1">{t}</span>
                {st === 'done' && i === 2 && <span className="text-[11.5px] text-ink2 tabular-nums">{run.found} found</span>}
                {st === 'done' && i === 3 && run.tpl && <span className="text-[11.5px] font-mono text-ink2">{run.tpl}</span>}
              </li>); })}</ol>
            {run.step >= run.steps.length && <div className="flex gap-2 mt-3">{run.kind === 'acq' ? <Btn size="sm" icon={I.PackageCheck} onClick={() => act.go('biab')}>Open Branch-in-a-Box</Btn> : <Btn size="sm" icon={I.FileCog} onClick={() => { act.setTab('policies', 'templates'); act.go('policies'); }}>See its template</Btn>}</div>}
          </div>}
        </div>
      </div>
    </Card>
  );
}
