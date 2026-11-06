// Predictive Watchlist: where a prediction comes from (data, signals, past cases) and how it is prevented.
import React from 'react';
import * as I from 'lucide-react';
import * as D from './data.js';
import { Card, Badge, Btn, Modal, Logo, SRC_LOGO, cx } from './ui.jsx';
import { ForecastMini } from './viz.jsx';
import { COLLECT, PIPELINE, READINGS_PER_DAY, basisOf } from './predictbasis.js';
import { num } from './util.js';

const ICON = { collect: I.Database, baseline: I.Activity, features: I.SlidersHorizontal, model: I.Brain, predict: I.Telescope, prevent: I.ShieldCheck, learn: I.RefreshCw };
const SrcName = ({ tool }) => SRC_LOGO[tool] ? <span className="inline-flex items-center gap-1.5"><Logo k={SRC_LOGO[tool]} h={10} /><span className="font-semibold text-ink">{tool}</span></span> : <b className="text-ink">{tool}</b>;

// ── how predictions are made: the pipeline and the data behind it ──
export function PredictionPipelineCard() {
  return (
    <Card title="How a prediction is made" sub="From the readings every tool collects to a step that stops the failure, and back into the model" icon={I.Workflow}>
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2">{PIPELINE.map((p, i) => { const Ic = ICON[p.k]; return (
        <div key={p.k} className="relative border border-line rounded-lg p-2.5 bg-canvas/40">
          <div className="flex items-center gap-1.5"><span className="w-5 h-5 rounded-full bg-brand text-white text-[11px] font-bold grid place-items-center shrink-0">{i + 1}</span><Ic size={14} className="text-brand" /><b className="text-[12.5px] text-ink">{p.label}</b></div>
          <div className="text-[11.5px] text-ink2 mt-1 leading-snug">{p.text}</div>
          {i < PIPELINE.length - 1 && <I.ChevronRight size={14} className="hidden xl:block absolute -right-[13px] top-1/2 -translate-y-1/2 text-ink3" />}
        </div>); })}</div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">{[['Predictions made, last 90 days', '64', I.Telescope, ''], ['Prevented before any impact', '41', I.ShieldCheck, 'text-ok'], ['Failed before the fix landed', '9', I.AlertTriangle, 'text-warn'], ['False alarms (fed back to the model)', '9', I.ThumbsDown, '']].map(([l, v, Ic, t]) => (
        <div key={l} className="border border-line rounded-lg px-3 py-2 flex items-center gap-2"><Ic size={16} className={cx('shrink-0', t || 'text-ink3')} /><div><div className={cx('text-[18px] font-extrabold tabular-nums leading-none', t || 'text-ink')}>{v}</div><div className="text-[11.5px] text-ink3 mt-0.5">{l}</div></div></div>))}</div>
    </Card>
  );
}

export function DataCollectedCard() {
  return (
    <Card title="Data collected for predictions" sub={`About ${num(Math.round(READINGS_PER_DAY / 1e5) * 1e5)} readings a day across ${num(D.BRANCHES.length)} branches, ${num(D.CIRCUITS.length)} circuits and ${num(D.DEVICES.length)} devices`} icon={I.Database}>
      <div className="overflow-x-auto"><table className="w-full text-[12.5px]"><thead><tr className="text-left text-ink3 text-[11.5px] border-b border-line"><th className="py-1.5 pr-3 font-semibold">Source</th><th className="py-1.5 pr-3 font-semibold">What is measured</th><th className="py-1.5 pr-3 font-semibold">How often</th><th className="py-1.5 pr-3 font-semibold">History kept</th><th className="py-1.5 font-semibold text-right">Readings a day</th></tr></thead>
        <tbody>{COLLECT.map(c => <tr key={c.tool} className="border-b border-line/60 last:border-0"><td className="py-1.5 pr-3 whitespace-nowrap"><SrcName tool={c.tool} /></td><td className="py-1.5 pr-3 text-ink2">{c.what}</td><td className="py-1.5 pr-3 whitespace-nowrap text-ink2">{c.every ? `every ${c.every} ${c.unit}` : c.unit}</td><td className="py-1.5 pr-3 whitespace-nowrap text-ink2">{c.keep}</td><td className="py-1.5 text-right tabular-nums font-semibold text-ink">{num(c.perDay)}</td></tr>)}</tbody></table></div>
    </Card>
  );
}

const STEP_ICON = { carrier: I.Phone, runbook: I.Zap, test: I.FlaskConical, verify: I.CheckCircle2, part: I.Package, visit: I.Truck, vendor: I.Package, change: I.GitPullRequest, notify: I.Megaphone, watch: I.Eye, inc: I.Ticket };

// ── one prediction: the full basis and the prevention plan ──
export function PredictionBasisModal({ p, onClose, onPrevent, onWatch, onDismiss }) {
  if (!p) return null;
  const x = basisOf(p), b = p.branchId && D.BR[p.branchId];
  const open = ['New', 'Watching'].includes(p.status);
  const wmax = Math.max(...x.features.map(f => f.w));
  return (
    <Modal open onClose={onClose} xwide title={`${p.id}: ${p.kind}, ${p.target}`} sub={`${b ? `${b.name}, ${b.brand}. ` : ''}${p.horizon}, ${Math.round(p.conf * 100)}% confident`}
      footer={<>{open ? <><Btn op kind="brand" icon={I.ShieldCheck} onClick={() => onPrevent(p, x)}>Start prevention plan</Btn><Btn op icon={I.Eye} onClick={() => onWatch(p)} disabled={p.status === 'Watching'}>Watch only</Btn><Btn op kind="ghost" icon={I.ThumbsDown} onClick={() => onDismiss(p)}>False positive</Btn></> : <Badge tone="green">{p.status}</Badge>}<span className="flex-1" /><span className="text-[11.5px] text-ink3">Predictions never change anything on their own: each step is approved or runs in an approved runbook</span></>}>
      <div className="text-[15px] font-bold text-ink mb-3">{x.question}</div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-4">
          <section><h3 className="text-[12px] font-bold uppercase tracking-wide text-ink3 mb-1.5 flex items-center gap-1.5"><I.Database size={13} />1. Data it is based on</h3>
            <div className="border border-line rounded-lg divide-y divide-line/70">{x.sources.map((s, i) => <div key={i} className="px-3 py-2 text-[12.5px]"><div className="flex items-center gap-2"><SrcName tool={s.tool} /><span className="ml-auto text-[11.5px] text-ink3 whitespace-nowrap">{s.every === 'on change' ? 'as it changes' : /^(daily|weekly)$/.test(s.every) ? s.every : `every ${s.every}`}, {s.window}</span></div><div className="text-ink2 mt-0.5 flex gap-2"><span className="flex-1">{s.what}</span><span className="tabular-nums text-ink3 whitespace-nowrap">{num(s.n)} readings</span></div></div>)}</div>
            <div className="text-[11.5px] text-ink3 mt-1">{num(x.readings)} readings in total went into this prediction.</div></section>
          <section><h3 className="text-[12px] font-bold uppercase tracking-wide text-ink3 mb-1.5 flex items-center gap-1.5"><I.SlidersHorizontal size={13} />2. Signals the model weighed</h3>
            <div className="space-y-1.5">{x.features.map(f => <div key={f.name} className="grid grid-cols-[minmax(0,1fr)_90px] gap-3 items-center text-[12.5px]"><div><b className="text-ink">{f.name}</b><div className="text-ink2 text-[12px] leading-snug">{f.value}</div></div><div><div className="h-2 bg-chip rounded"><div className="h-full rounded bg-brand" style={{ width: `${f.w / wmax * 100}%` }} /></div><div className="text-[11px] text-ink3 text-right tabular-nums mt-0.5">{Math.round(f.w * 100)}% of the score</div></div></div>)}</div></section>
          <section><h3 className="text-[12px] font-bold uppercase tracking-wide text-ink3 mb-1.5 flex items-center gap-1.5"><I.Brain size={13} />3. How sure, and why</h3>
            <div className="border border-line rounded-lg p-3 text-[12.5px] space-y-1.5"><div><span className="text-ink3">Method: </span><span className="text-ink">{x.method}</span></div><div><span className="text-ink3">Confidence: </span><b className="text-ink">{Math.round(p.conf * 100)}%.</b> <span className="text-ink">{x.why}.</span></div>
              {x.past > 0 && <div><div className="flex h-3 rounded overflow-hidden mt-1"><div className="bg-bad" style={{ width: `${x.failed / x.past * 100}%` }} /><div className="bg-ok/70 flex-1" /></div><div className="flex justify-between text-[11px] text-ink3 mt-0.5"><span>{x.failed} past cases failed</span><span>{x.past - x.failed} recovered by themselves</span></div></div>}
              <div><span className="text-ink3">Warning time this gives: </span><b className="text-ink">{x.lead}</b></div></div></section>
        </div>
        <div className="space-y-4">
          <section><h3 className="text-[12px] font-bold uppercase tracking-wide text-ink3 mb-1.5 flex items-center gap-1.5"><I.LineChart size={13} />The trend</h3><div className="text-[12.5px] text-ink2 mb-1">{p.signal}</div><ForecastMini p={p} /></section>
          <section><h3 className="text-[12px] font-bold uppercase tracking-wide text-ink3 mb-1.5 flex items-center gap-1.5"><I.AlertTriangle size={13} />If nothing is done</h3><div className="border border-line bg-chip/40 rounded-lg px-3 py-2 text-[12.5px] text-ink">{x.ifNothing}</div></section>
          <section><h3 className="text-[12px] font-bold uppercase tracking-wide text-ink3 mb-1.5 flex items-center gap-1.5"><I.ShieldCheck size={13} />4. Prevention plan</h3>
            <ol className="space-y-1.5">{x.prevent.map((st, i) => { const Ic = STEP_ICON[st.kind] || I.Check; const done = p.status === 'Prevention started' && i === 0; return (
              <li key={i} className="flex gap-2.5 border border-line rounded-lg px-3 py-2 text-[12.5px]"><span className={cx('w-6 h-6 rounded-full grid place-items-center shrink-0', done ? 'bg-ok text-white' : 'bg-brand/10 text-brand')}>{done ? <I.Check size={13} /> : <Ic size={13} />}</span><div className="flex-1 min-w-0"><div className="text-ink font-semibold">{st.step}</div><div className="text-[11.5px] text-ink3">{st.owner}, {st.when.toLowerCase()}</div></div></li>); })}</ol>
            <div className="text-[12px] text-ink2 mt-2 flex items-center gap-1.5"><I.Sparkles size={13} className="text-ok" /><span><b className="text-ink">Result if it works:</b> {x.saves}.</span></div></section>
        </div>
      </div>
    </Modal>
  );
}
