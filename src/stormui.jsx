// Correlation page: an alert storm replayed step by step, the dedup and suppression rules with today's counts,
// and auto-ticketing into ServiceNow (what is created, updated, attached and resolved).
import React, { useState, useEffect, useMemo } from 'react';
import * as I from 'lucide-react';
import * as D from './data.js';
import { useApp } from './store.jsx';
import { useLive } from './live.jsx';
import { Card, Badge, Btn, Tabs, Logo, SRC_LOGO, Pri, cx } from './ui.jsx';
import { todayCounts } from './viz2.jsx';
import { SCENARIOS, STAGES, FATE, RULES, stageCounts } from './storm.js';
import { num, hhmmss, hhmm } from './util.js';

const Src = ({ src }) => SRC_LOGO[src] ? <Logo k={SRC_LOGO[src]} h={9} /> : <b className="text-[11px] text-brand whitespace-nowrap">{src}</b>;
const sevDot = s => s === 'Critical' ? 'bg-bad' : s === 'Major' ? 'bg-warn' : s === 'Minor' ? 'bg-info' : 'bg-ink3';

// ── 1. alert storm replay ──
export function AlertStormReplay() {
  const { act } = useApp();
  const [sid, setSid] = useState(SCENARIOS[0].id);
  const [st, setSt] = useState(0);
  const [play, setPlay] = useState(false);
  const sc = SCENARIOS.find(x => x.id === sid);
  const cnt = useMemo(() => stageCounts(sc), [sc]);
  useEffect(() => { setSt(0); setPlay(false); }, [sid]);
  useEffect(() => { if (!play) return; if (st >= 5) { setPlay(false); return; } const t = setTimeout(() => setSt(v => v + 1), 1700); return () => clearTimeout(t); }, [play, st]);
  const Ic = I[sc.icon] || I.Zap;
  const upd = sc.ticket.action !== 'Created';
  const gone = r => FATE[r.fate].stage <= st;
  return (
    <Card title="Alert storm, step by step" sub="Replay a real kind of storm and watch each alarm get merged, held back or turned into one ticket" icon={I.CloudLightning}
      right={<div className="flex gap-1.5"><Btn size="sm" icon={I.RotateCcw} onClick={() => { setSt(0); setPlay(false); }}>Reset</Btn><Btn size="sm" kind="brand" icon={play ? I.Pause : I.Play} onClick={() => { if (st >= 5) setSt(0); setPlay(v => !v); }}>{play ? 'Pause' : 'Play'}</Btn><Btn size="sm" icon={I.SkipForward} onClick={() => setSt(v => Math.min(5, v + 1))} disabled={st >= 5}>Next step</Btn></div>}>
      <Tabs size="sm" value={sid} onChange={setSid} className="mb-3" tabs={SCENARIOS.map(x => ({ id: x.id, label: x.name }))} />
      <div className="flex items-start gap-2.5 mb-3 text-[12.5px]"><span className="w-8 h-8 rounded-lg bg-brand/10 text-brand grid place-items-center shrink-0"><Ic size={16} /></span><div className="text-ink2 leading-snug"><span className="text-ink font-semibold">{sc.story}</span> <span className="text-ink3">Over {sc.mins >= 60 ? `${sc.mins / 60} hours` : `${sc.mins} minutes`}.</span></div></div>
      {/* the stage stepper */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-1.5 mb-3">{STAGES.map((g, i) => { const v = i === 5 && upd ? sc.rows.find(r => r.fate === 'upstream' && r.src === 'Simplify')?.n : cnt[i]; return (
        <button key={g.k} onClick={() => { setSt(i); setPlay(false); }} className={cx('text-left rounded-lg border px-2.5 py-2 transition-colors', i === st ? 'border-brand bg-brand/10' : i < st ? 'border-line bg-chip/50' : 'border-line')}>
          <div className="flex items-center gap-1.5"><span className={cx('w-5 h-5 rounded-full text-[11px] font-bold grid place-items-center shrink-0', i <= st ? 'bg-brand text-white' : 'bg-chip text-ink3')}>{i + 1}</span><span className="text-[12px] font-bold text-ink truncate">{g.label}</span></div>
          <div className={cx('text-[22px] font-extrabold tabular-nums leading-tight mt-1', i <= st ? 'text-ink' : 'text-ink3/50')}>{i > st ? '—' : i === 5 ? (upd ? `${v} updated` : `${v} ticket`) : num(v)}</div>
          <div className="text-[11px] text-ink3 leading-tight">{i > st ? '\u00a0' : i === 0 ? 'events' : i === 1 || i === 2 ? 'alerts left' : i === 5 ? (upd ? 'no new ticket' : 'in ServiceNow') : sc.incidents ? 'incident' : 'event, no new ticket'}</div>
        </button>); })}</div>
      <div className="text-[12px] text-ink2 mb-2"><b className="text-ink">Step {st + 1}: {STAGES[st].label}.</b> {STAGES[st].short}.{st === 0 && ` ${num(cnt[0])} events from ${new Set(sc.rows.map(r => r.src)).size} tools.`}{st === 1 && ` ${num(cnt[0])} events became ${cnt[1]} alerts.`}{st === 2 && ` ${cnt[1] - cnt[2]} alerts held back, each for a stated reason.`}</div>
      {st <= 2 && <div className="border border-line rounded-lg divide-y divide-line/70">{sc.rows.map((r, i) => { const f = FATE[r.fate], out = gone(r); return (
        <div key={i} className={cx('grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[72px_minmax(0,1.1fr)_minmax(0,1.6fr)_56px_minmax(0,1.1fr)] gap-x-2 gap-y-0.5 items-center px-2.5 py-1.5 text-[12px] transition-opacity duration-500', out && 'opacity-45')}>
          <span className="hidden md:block"><Src src={r.src} /></span>
          <span className="font-mono text-[11.5px] text-ink truncate md:col-auto col-span-1"><span className={cx('inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle', sevDot(r.sev))} />{r.ci}</span>
          <span className={cx('text-ink2 min-w-0 truncate hidden md:block', out && 'line-through')}>{r.msg}</span>
          <span className="text-right tabular-nums font-bold text-ink">x{num(r.n)}</span>
          <span className="col-span-2 md:col-span-1 md:text-right">{out ? <Badge tone={f.tone} title={f.note(r.n)}>{f.label}</Badge> : f.stage === 9 && st >= 2 ? <Badge tone={f.tone}>{f.label}</Badge> : <span className="text-[11px] text-ink3">{st === 0 ? 'arrived' : 'still open'}</span>}</span>
          <span className="md:hidden col-span-2 text-ink2 truncate">{r.msg}</span>
        </div>); })}</div>}

      {st === 3 && <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="border border-line rounded-lg p-3"><div className="text-[12px] font-bold text-ink mb-1.5 flex items-center gap-1.5"><I.GitMerge size={13} className="text-brand" />Why these belong together</div><ul className="space-y-1">{sc.corr.map(c => <li key={c} className="flex gap-1.5 text-[12.5px] text-ink2"><I.Check size={13} className="text-ok mt-[2px] shrink-0" />{c}</li>)}</ul></div>
        <div className="border border-line rounded-lg p-3"><div className="text-[12px] font-bold text-ink mb-1.5">What is left</div>{sc.rows.filter(r => FATE[r.fate].stage > 2).map((r, i) => <div key={i} className="flex items-center gap-2 text-[12.5px] py-0.5"><Badge tone={FATE[r.fate].tone}>{FATE[r.fate].label}</Badge><span className="text-ink truncate">{r.msg}</span></div>)}
          {!sc.incidents && <div className="text-[12.5px] text-ink2">Nothing new for OpsRamp to ticket: {sc.rows.filter(r => r.fate === 'upstream' && r.src === 'Simplify')[0].n} access-link tickets were already raised by Simplify upstream. The evidence goes onto those.</div>}</div>
      </div>}
      {st === 4 && <div className="border border-line rounded-lg divide-y divide-line/70">{sc.enrich.map(([k, v]) => <div key={k} className="grid grid-cols-[150px_minmax(0,1fr)] gap-3 px-3 py-1.5 text-[12.5px]"><span className="text-ink3">{k}</span><span className="text-ink font-semibold">{v}</span></div>)}</div>}
      {st === 5 && <TicketPreview sc={sc} onOpen={id => act.openInc(id)} />}
    </Card>
  );
}

function TicketPreview({ sc, onOpen }) {
  const t = sc.ticket, raw = stageCounts(sc)[0];
  const F = ({ k, v, mono }) => <div className="min-w-0"><div className="text-[10.5px] uppercase tracking-wide text-ink3 font-semibold">{k}</div><div className={cx('text-[12.5px] text-ink font-semibold truncate', mono && 'font-mono')}>{v}</div></div>;
  return (
    <div className="border border-line rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-chip/60 border-b border-line"><Logo k="servicenow" h={12} /><b className="text-[12.5px] text-ink">Incident</b><span className="font-mono text-[12px] text-ink2">{t.number}</span><Badge tone={t.action === 'Created' ? 'green' : 'blue'}>{t.action} by OpsRamp</Badge><span className="flex-1" />{t.incId && <Btn size="sm" icon={I.ExternalLink} onClick={() => onOpen(t.incId)}>Open incident</Btn>}</div>
      <div className="p-3 grid grid-cols-2 md:grid-cols-4 gap-3">
        <F k="Caller" v={t.caller || 'OpsRamp integration'} /><F k="Category" v={t.cat} /><F k="Configuration item" v={t.ci} mono /><F k="State" v={t.state} />
        <F k="Impact" v={t.impact} /><F k="Urgency" v={t.urgency} /><div><div className="text-[10.5px] uppercase tracking-wide text-ink3 font-semibold">Priority</div><div className="mt-0.5"><Pri p={t.pri} /></div></div><F k="Assignment group" v={t.group} />
      </div>
      <div className="px-3 pb-3 space-y-2">
        <F k="Short description" v={t.short} />
        <div><div className="text-[10.5px] uppercase tracking-wide text-ink3 font-semibold">Description</div><div className="text-[12.5px] text-ink2 leading-snug">{t.desc}</div></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[12px]">{[['Events grouped', num(raw)], ['Alerts attached', sc.rows.filter(r => FATE[r.fate].stage > 1).length], ['Held back, listed', sc.rows.filter(r => FATE[r.fate].stage === 2).length], ['Duplicate tickets', 0]].map(([k, v]) => <div key={k} className="border border-line rounded px-2 py-1"><div className="text-ink3 text-[11px]">{k}</div><div className="font-bold text-ink tabular-nums">{v}</div></div>)}</div>
        <div className="border-l-4 border-brand bg-brand/5 rounded-r px-3 py-2 text-[12px] text-ink2"><b className="text-ink">Work note from OpsRamp:</b> {sc.enrich.map(([k, v]) => `${k}: ${v}`).slice(0, 4).join('. ')}.</div>
      </div>
    </div>
  );
}

// ── 2. the rules, with today's counts ──
export function SuppressionRulesCard() {
  const { L } = useLive(); const { s } = useApp();
  const tc = todayCounts(L, s);
  const max = Math.max(...RULES.map(r => r.share));
  return (
    <Card title="Deduplication and suppression rules" sub={`${num(tc.suppressed)} of ${num(tc.events)} events held back today (${Math.round(tc.noise * 100)}%). Each one has a reason and stays visible on its parent alert, change or ticket.`} icon={I.Filter}>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-6 gap-y-2">{RULES.map(r => { const f = FATE[r.k]; const n = Math.round(tc.suppressed * r.share); return (
        <div key={r.k} className="grid grid-cols-[minmax(0,1fr)_92px] md:grid-cols-[170px_minmax(0,1fr)_120px] gap-x-3 gap-y-1 items-center border-b border-line/60 last:border-0 pb-2">
          <div className="flex items-center gap-1.5"><Badge tone={f.tone}>{r.name}</Badge></div>
          <div className="text-[12px] text-ink2 leading-snug md:order-none order-last col-span-2 md:col-span-1">{r.how}. <span className="text-ink3">For example: {r.ex}.</span></div>
          <div><div className="text-[15px] font-extrabold text-ink tabular-nums text-right">{num(n)}</div><div className="h-1.5 bg-chip rounded"><div className="h-full bg-brand rounded transition-all duration-700" style={{ width: `${r.share / max * 100}%` }} /></div></div>
        </div>); })}</div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-3 text-[12px]">{[['Cleared by itself', tc.auto, 'Recovered inside the hold-down, checked by ping and SNMP, no ticket'], ['Sent to the digest', tc.digest, 'Warnings bundled into the morning digest'], ['Correlated into incidents', tc.corr, `Grouped into ${tc.inc} incidents today`]].map(([k, v, d]) => <div key={k} className="border border-line rounded-lg px-3 py-2"><div className="text-[17px] font-extrabold text-ink tabular-nums">{num(v)}</div><div className="font-semibold text-ink">{k}</div><div className="text-[11.5px] text-ink3 leading-snug">{d}</div></div>)}</div>
    </Card>
  );
}

// ── 3. auto-ticketing to ServiceNow ──
const MATRIX = { impact: ['High: several branches, or a major outage', 'Medium: one branch down, or payments affected', 'Low: one device, or running on backup'], urgency: ['Branch open now', 'Opens within 2 hours', 'Closed'], p: [['P1', 'P2', 'P3'], ['P2', 'P3', 'P4'], ['P3', 'P4', 'P4']] };
const LIFE = [
  ['Create', I.PlusCircle, 'The first alert left after correlation opens one ticket: CI from the CMDB, priority from impact and urgency, group from the category'],
  ['Update', I.RefreshCw, 'Later alerts on the same event are attached as work notes. Priority goes up if the impact grows'],
  ['Hand over', I.ArrowRightLeft, 'Assignment, state and engineer notes come back from ServiceNow, so the console and the ticket always agree'],
  ['Resolve', I.CheckCircle2, 'When the alarm clears and the checks pass, OpsRamp resolves with a close code and tells Store Ops'],
  ['Reopen', I.Repeat, 'If the same fault comes back within 24 hours, the old ticket reopens instead of a new one'],
];
export function ServiceNowSyncCard() {
  const { s, act } = useApp(); const { L } = useLive();
  const tc = todayCounts(L, s);
  const attached = Math.max(0, tc.corr - tc.inc);
  const log = useMemo(() => {
    const out = [];
    L.feed.filter(e => e.inc).slice(0, 6).forEach(e => out.push({ t: e.t, dir: 'out', what: /resolved/.test(e.msg) ? 'Resolved' : 'Created', inc: e.inc, text: e.msg.replace(/\s*→\s*INC\d+\s*/, '. ').replace(/^INC\d+\s*/, '') }));
    s.incidents.filter(i => i.state !== 'Resolved').sort((a, b) => b.opened - a.opened).slice(0, 8).forEach(i => {
      out.push({ t: i.opened + 30e3, dir: 'out', what: 'Created', inc: i.id, pri: i.pri, text: `${i.title}. ${i.corr + i.signals.length} events grouped, CI ${i.ci}` });
      if (i.corr > 2) out.push({ t: i.opened + 4 * 60e3, dir: 'out', what: 'Attached', inc: i.id, text: `${Math.round(i.corr * 0.6)} more alerts added as work notes, no new ticket` });
      if (i.acked && i.assignee) out.push({ t: i.acked, dir: 'in', what: 'Assigned', inc: i.id, text: `${i.group} → ${i.assignee}, state ${i.state}` });
    });
    s.resolved.slice().sort((a, b) => b.resolved - a.resolved).slice(0, 4).forEach(i => out.push({ t: i.resolved, dir: 'out', what: 'Resolved', inc: i.id, pri: i.pri, text: `${i.title}. Close code: ${i.closeCode}` }));
    const seen = new Set();
    return out.filter(x => x.t <= Date.now() && !seen.has(x.inc + x.what) && seen.add(x.inc + x.what)).sort((a, b) => b.t - a.t).slice(0, 14);
  }, [L.feed, s.incidents, s.resolved]);
  const tone = { Created: 'green', Attached: 'blue', Assigned: 'purple', Resolved: 'gray' };
  return (
    <Card title="Auto-ticketing to ServiceNow" icon={I.Ticket}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">{[['Tickets created today', tc.inc, I.PlusCircle, 'One per branch per event'], ['Alerts attached, no new ticket', attached, I.Link2, 'Duplicate tickets prevented'], ['Resolved by OpsRamp today', tc.autoRes, I.CheckCircle2, 'Checks passed, close code set'], ['Duplicate tickets', 0, I.Copy, 'Same outage never ticketed twice']].map(([k, v, Ic, d]) => <div key={k} className="border border-line rounded-lg px-3 py-2"><div className="flex items-center gap-1.5"><Ic size={14} className="text-brand" /><span className="text-[18px] font-extrabold text-ink tabular-nums">{num(v)}</span></div><div className="text-[12px] font-semibold text-ink leading-tight">{k}</div><div className="text-[11px] text-ink3">{d}</div></div>)}</div>
      <div>
        <div><div className="text-[12px] font-bold uppercase tracking-wide text-ink3 mb-1.5 flex items-center gap-1.5">Sync log <span className="normal-case font-normal tracking-normal">(newest first)</span></div>
          <div className="border border-line rounded-lg divide-y divide-line/70">{log.map((x, i) => <button key={i} onClick={() => act.openInc(x.inc)} className="w-full text-left flex items-start gap-2 px-2.5 py-1.5 text-[12px] hover:bg-chip/50">
            <code className="text-ink3 text-[11px] w-[54px] shrink-0 pt-[1px]">{hhmmss(x.t)}</code>
            <span className="shrink-0 pt-[1px]" title={x.dir === 'out' ? 'OpsRamp to ServiceNow' : 'ServiceNow to OpsRamp'}>{x.dir === 'out' ? <I.ArrowRight size={13} className="text-brand" /> : <I.ArrowLeft size={13} className="text-info" />}</span>
            <Badge tone={tone[x.what]} className="shrink-0 w-[70px] justify-center">{x.what}</Badge>
            <span className="min-w-0 flex-1"><span className="font-mono text-ink font-semibold">{x.inc}</span> <span className="text-ink2">{x.text}</span></span></button>)}</div>
          <div className="flex gap-3 text-[11px] text-ink3 mt-1"><span className="inline-flex items-center gap-1"><I.ArrowRight size={11} className="text-brand" />OpsRamp to ServiceNow</span><span className="inline-flex items-center gap-1"><I.ArrowLeft size={11} className="text-info" />ServiceNow to OpsRamp</span></div></div>
      </div>
    </Card>
  );
}
