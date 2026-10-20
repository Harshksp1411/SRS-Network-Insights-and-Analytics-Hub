import React, { useState } from 'react';
import * as I from 'lucide-react';
import { useApp } from './store.jsx';
import { DEMOS, AREAS, MODES } from './demos.js';
import { Card, Badge, Btn, cx, Logo, SearchBox, Select } from './ui.jsx';
import { stageSpec } from './stagedata.js';
import { ExplainBody, ViewToggle, SYS, MODE_RULES } from './stage.jsx';

const PREV = {};
const previewCtx = d => PREV[d.id] || (PREV[d.id] = (() => { const c = {}; d.setup(c); c.preview = true; return c; })());

const WHO_TONE = { Autonomous: 'green', 'Human-on-the-loop': 'blue', 'Human-in-the-loop': 'amber' };
const MOD_OF = { 'SD-WAN and carriers': ['carriers', 'Carrier Management'], 'LAN and Wi-Fi': ['inventory', 'Device & Circuit Inventory'], 'Patching and firmware': ['vuln', 'Lifecycle & Vulnerabilities'], 'Config and automation': ['automation', 'Automation Library'], 'Predict and prevent': ['predict', 'Predictive Watchlist'], 'Branch readiness': ['readiness', 'Branch Readiness'], 'Branch-in-a-Box': ['biab', 'Branch-in-a-Box'] };

export function LiveDemos() {
  const { s, act } = useApp();
  const [area, setArea] = useState('All');
  const [who, setWho] = useState('Anyone');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(DEMOS[0].id);
  const [view, setView] = useState('biz');
  const list = DEMOS.filter(d => (area === 'All' || d.area === area) && (who === 'Anyone' || d.who === who) && (!q || `${d.title} ${d.story.problem}`.toLowerCase().includes(q.toLowerCase())));
  const d = DEMOS.find(x => x.id === sel) || DEMOS[0];
  const pc = previewCtx(d); const sp = stageSpec(d, pc);
  const play = id => act.set({ scenario: { id, run: Date.now() } });
  const open = s.incidents.filter(i => i.state !== 'Resolved').length;
  const playAll = () => play(DEMOS[0].id);
  return (
    <div>
      <div className="flex items-end gap-3 mb-4 flex-wrap border-b border-line pb-3">
        <div className="flex-1 min-w-[280px]"><h1 className="text-[26px] font-bold text-ink leading-none">Live demos</h1><p className="text-[13.5px] text-ink2 mt-1.5 max-w-[78ch]">{DEMOS.length} SRS branch situations. Each one replays into the live console: incidents, agents, approvals, carrier cases and work orders appear where an engineer would see them.</p></div>
        <Btn kind="brand" icon={I.PlayCircle} onClick={playAll}>Start guided demo</Btn>
      </div>
      <div className="grid md:grid-cols-3 gap-2 mb-3">{MODE_RULES.map(([n, k, ic, t]) => { const Ic = ic; const cnt = DEMOS.filter(x => x.who === n).length; const on = who === n; return (
        <button key={n} onClick={() => setWho(on ? 'Anyone' : n)} aria-pressed={on} className={cx('text-left rounded-md border p-3 bg-panel', on ? 'border-ink ring-1 ring-ink' : 'border-line hover:border-ink3')}>
          <div className="flex items-center gap-2"><Ic size={16} className={k === 'auto' ? 'text-ok' : k === 'stop' ? 'text-info' : 'text-warn'} /><span className="font-bold text-[14px] text-ink flex-1">{n}</span><span className="text-[12px] font-bold text-ink2 bg-chip rounded px-1.5">{cnt} demos</span></div>
          <div className="text-[12px] text-ink2 mt-1 leading-[16px]">{{ auto: 'Act tier. Acts on its own inside a policy people set and audit. People stay over the loop.', stop: 'Act and notify tier. Acts on its own; a person is told at once and can stop it in the stop window.', approve: 'Stage tier. Prepares the plan and evidence, then waits. Nothing changes until a named person approves.' }[k]}</div>
          <div className="text-[11.5px] text-ink3 mt-1.5 leading-[15px]">Used when: {t}</div>
        </button>); })}</div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {['All', ...AREAS].map(a => { const n = a === 'All' ? DEMOS.length : DEMOS.filter(x => x.area === a).length; return <button key={a} onClick={() => setArea(a)} className={cx('h-9 px-3 rounded-md border text-[13px] font-bold inline-flex items-center gap-2', area === a ? 'bg-ink text-canvas border-ink' : 'bg-panel text-ink border-line hover:bg-chip')}>{a}<span className={cx('text-[11px] font-bold rounded px-1.5', area === a ? 'bg-canvas/20' : 'bg-chip text-ink2')}>{n}</span></button>; })}
      </div>
      <div className="grid xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] gap-3 items-start">
        <Card pad={false} title={`${area === 'All' ? 'All' : area} demos`} right={<div className="flex gap-2"><Select value={who} onChange={setWho} options={['Anyone', ...MODES].map(v => ({ value: v, label: v === 'Anyone' ? 'Control mode: all' : v }))} /><SearchBox value={q} onChange={setQ} placeholder="Search" className="w-40" /></div>}>
          <div>{list.map((x, k) => (
            <div key={x.id} onClick={() => setSel(x.id)} className={cx('flex gap-3 px-4 py-3 border-t border-line cursor-pointer', sel === x.id ? 'bg-brand/5' : 'hover:bg-chip/50')}>
              <span className="w-7 h-7 rounded-md bg-chip text-ink2 text-[12px] font-bold flex items-center justify-center shrink-0">{DEMOS.indexOf(x) + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] font-bold text-ink">{x.title}</div>
                <div className="text-[12.5px] text-ink2 mt-0.5 line-clamp-2">{x.story.problem}</div>
                <div className="flex flex-wrap items-center gap-1.5 mt-1.5"><Badge>{x.area}</Badge><Badge tone={WHO_TONE[x.who]}>{x.who}</Badge><span className="text-[11.5px] text-ink3">{x.runbook}</span></div>
              </div>
              <button onClick={e => { e.stopPropagation(); setSel(x.id); play(x.id); }} title="Play live" className={cx('w-9 h-9 rounded-md border flex items-center justify-center shrink-0', sel === x.id ? 'bg-brand text-white border-brand' : 'border-line text-ink2 hover:bg-chip')}><I.Play size={15} /></button>
            </div>))}
            {!list.length && <div className="p-6 text-[13px] text-ink3">No demos match. Clear the search or pick another area.</div>}
          </div>
        </Card>
        <Card className="xl:sticky xl:top-[150px]">
          <div className="flex items-center gap-2 text-[12px] text-ink3 mb-1"><span>{d.area}</span><Badge>Demo {DEMOS.indexOf(d) + 1} of {DEMOS.length}</Badge></div>
          <h2 className="text-[20px] font-bold text-ink leading-tight">{d.title}</h2>
          <div className="text-[12.5px] text-ink3 mt-0.5">{sp.sub}</div>
          <div className="grid grid-cols-3 gap-2 mt-3">
            <div className="border border-line rounded-md p-2.5"><div className="text-[12px] text-ink3">Control mode</div><Badge tone={WHO_TONE[d.who]} className="mt-1">{d.who}</Badge></div>
            <div className="border border-line rounded-md p-2.5"><div className="text-[12px] text-ink3">Runbook</div><div className="text-[13px] font-bold text-ink mt-1 truncate">{sp.rb}</div></div>
            <div className="border border-line rounded-md p-2.5"><div className="text-[12px] text-ink3">Runs as</div><div className="text-[13px] font-bold text-ink mt-1">{sp.engine === 'ansible' ? 'Ansible' : 'Python'}</div></div>
          </div>
          <div className="text-[12px] text-ink3 mt-3 mb-1">On one screen while it plays</div>
          <div className="flex flex-wrap gap-1.5">{sp.systems.map(k => <span key={k} className="inline-flex items-center gap-1.5 text-[12px] text-ink border border-line rounded px-1.5 py-1">{SYS[k].logo ? <Logo k={SYS[k].logo} h={11} className="!p-0 !border-0" /> : null}{k === 'carrier' && sp.carrier ? `${sp.carrier} portal` : SYS[k].n}</span>)}</div>
          <div className="text-[12px] text-ink3 mt-2">Detect → Correlate → Decide → Act → Verify → Record, with the live chart, the runbook running, every Mova iO decision and the ServiceNow ticket.</div>
          <div className="mt-4 mb-2"><ViewToggle view={view} setView={setView} /></div>
          <div className="max-h-[420px] overflow-y-auto pr-1 stage-col"><div className="pb-5"><ExplainBody demo={d} sp={sp} c={pc} view={view} /></div><div className="sticky bottom-0 h-7 -mt-7 bg-gradient-to-t from-[rgb(var(--panel))] to-transparent pointer-events-none" /></div>
          <div className="flex gap-2 mt-4"><Btn kind="brand" icon={I.Play} onClick={() => play(d.id)}>Play live</Btn><Btn icon={I.ArrowRight} onClick={() => act.go(MOD_OF[d.area][0])}>Open {MOD_OF[d.area][1]}</Btn></div>
          <div className="text-[12px] text-ink3 mt-3">{open} incidents open in the console right now. A demo adds to them; it never resets your work.</div>
        </Card>
      </div>
    </div>
  );
}
