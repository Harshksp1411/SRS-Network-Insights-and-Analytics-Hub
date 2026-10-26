// SLA & KPI Tracker and Reports graphics. Report charts use inline colours so they survive "Download HTML".
import React, { useMemo, useState } from 'react';
import * as D from './data.js';
import { Card, cx } from './ui.jsx';
import { C, Legend, LineChart, Bars, Donut, useWidth } from './charts.jsx';
import { num } from './util.js';

const COL = { green: '#2E8540', amber: '#E07B00', red: '#D62D20', blue: '#2F6DB5', navy: '#1D3F66', grey: '#A3ACB8', light: '#E6E9ED', ink: '#16191D', ink3: '#5E6B78', brand: '#762123', teal: '#2A9D8F' };
export const MONTHS6 = ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];
export const slaStatus = m => { if (m.lower) return m.act <= m.esl ? 'Meets ESL' : 'Below target'; if (m.act >= m.esl) return 'Meets ESL'; if (m.msl != null && m.act >= m.msl) return 'Above MSL'; return m.msl == null ? 'Below target' : 'Below MSL'; };
const statusOf = (m, v) => slaStatus({ ...m, act: v });
const stCol = st => ({ 'Meets ESL': COL.green, 'Above MSL': COL.amber, 'Below target': COL.amber, 'Below MSL': COL.red }[st]);
const pc = (v, d = 1) => `${(v * 100).toFixed(d)}%`;

// ── Scorecard at a glance: one bullet bar per metric ─────────────────
export function SLAScorecard({ onSel, sel }) {
  const lines = [...new Set(D.SLA.map(x => x.line))];
  const Row = ({ m, k }) => {
    const lo = m.lower ? 0 : Math.max(0, Math.min(m.msl ?? m.esl, m.act, ...m.trend) - (m.esl > 0.9 ? 0.02 : 0.08));
    const hi = m.lower ? Math.max(m.esl * 1.6, m.act * 1.3) : m.esl > 0.99 ? 1 : Math.min(1, Math.max(m.esl, m.act) + (m.esl > 0.9 ? 0.01 : 0.08));
    const X = v => Math.max(0, Math.min(100, (v - lo) / (hi - lo) * 100));
    const st = slaStatus(m); const d = m.fmt || (m.esl > 0.999 ? 3 : 1);
    const zones = m.lower ? [[0, X(m.esl), COL.green], [X(m.esl), 100, '#F6E3C8']] : [[0, m.msl != null ? X(m.msl) : X(m.esl), m.msl != null ? '#F4D3D0' : '#F6E3C8'], ...(m.msl != null ? [[X(m.msl), X(m.esl), '#F6E3C8']] : []), [X(m.esl), 100, '#D5EBD9']];
    return (
      <button onClick={() => onSel && onSel(k)} className={cx('w-full grid grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_58px] gap-2 items-center py-1 px-1.5 rounded text-left', sel === k ? 'bg-chip' : 'hover:bg-chip/60')}>
        <span className="text-[12px] text-ink leading-tight"><span className="text-ink3">#{m.n}</span> {m.name}</span>
        <span className="relative h-[14px] rounded-[3px] overflow-hidden" style={{ background: COL.light }} title={`MSL ${m.msl == null ? '—' : pc(m.msl, d)} · ESL ${pc(m.esl, d)} · actual ${pc(m.act, d)}`}>
          {zones.map(([a, b, c], i) => <span key={i} className="absolute inset-y-0" style={{ left: `${a}%`, width: `${Math.max(0, b - a)}%`, background: c }} />)}
          <span className="absolute top-[4px] bottom-[4px] left-0 rounded-r-[2px] transition-all duration-700" style={{ width: `${X(m.act)}%`, background: stCol(st) }} />
          <span className="absolute inset-y-0 w-[2px]" style={{ left: `calc(${X(m.esl)}% - 1px)`, background: COL.ink }} />
        </span>
        <span className="text-[12px] font-bold tabular-nums text-right" style={{ color: stCol(st) }}>{pc(m.act, d)}</span>
      </button>
    );
  };
  return (
    <Card title="Scorecard at a glance" sub="Every Annexure B metric this month. The bar is the actual; the black tick is the expected level (ESL); the pale red zone is below the minimum (MSL), where a service credit applies" right={<Legend items={[['Meets ESL', COL.green], ['Between MSL and ESL', COL.amber], ['Below MSL', COL.red]]} />}>
      <div className="grid grid-cols-1 2xl:grid-cols-2 gap-x-6">{lines.map(l => <div key={l} className="mb-2 break-inside-avoid"><div className="text-[11.5px] font-bold text-ink3 uppercase tracking-wide px-1.5 mb-0.5">{l.replace('Network ', '')}</div>{D.SLA.map((m, k) => m.line === l ? <Row key={k} m={m} k={k} /> : null)}</div>)}</div>
    </Card>
  );
}

// ── Status mix and attainment by service line ───────────────────────
export function SLAStatusCard() {
  const counts = ['Meets ESL', 'Above MSL', 'Below target', 'Below MSL'].map(st => ({ label: st === 'Above MSL' ? 'Between MSL and ESL' : st === 'Below target' ? 'Below target (KPI)' : st, value: D.SLA.filter(m => slaStatus(m) === st).length, color: st === 'Below target' ? '#F0B35A' : stCol(st) })).filter(x => x.value);
  const lines = [...new Set(D.SLA.map(x => x.line))].map(l => { const ms = D.SLA.filter(m => m.line === l); return { l: l.replace('Network ', ''), n: ms.length, ok: ms.filter(m => slaStatus(m) === 'Meets ESL').length }; });
  return (
    <Card title="Where the service stands" sub="Status of all 26 metrics, and the share meeting the expected level in each service line">
      <Donut data={counts} center={`${D.SLA.filter(m => slaStatus(m) === 'Meets ESL').length}/${D.SLA.length}`} sub="meet ESL" />
      <div className="mt-3 space-y-1.5">{lines.map(x => <div key={x.l} className="grid grid-cols-[minmax(0,1fr)_120px_34px] gap-2 items-center text-[12px]"><span className="text-ink truncate" title={x.l}>{x.l}</span><span className="h-[10px] rounded-[2px] overflow-hidden flex" style={{ background: COL.light }}><span style={{ width: `${x.ok / x.n * 100}%`, background: COL.green }} /><span style={{ width: `${(x.n - x.ok) / x.n * 100}%`, background: COL.amber }} /></span><span className="text-right text-ink3 tabular-nums">{x.ok}/{x.n}</span></div>)}</div>
    </Card>
  );
}

// ── Respond and resolve by priority: dumbbell against MSL and ESL ────
export function SLAPriorityCard() {
  const [ref, W] = useWidth(520);
  const rows = ['P1', 'P2', 'P3', 'P4'].map(p => ({ p, resp: D.SLA.find(m => m.queue === p && /response/.test(m.name)), res: D.SLA.find(m => m.queue === p && /resolution/.test(m.name)) }));
  const lo = 0.88, hi = 1, L = 40, R = 16, H = 40 * rows.length + 30;
  const X = v => L + (v - lo) / (hi - lo) * (W - L - R);
  return (
    <Card title="Respond and resolve on time, by priority" sub="Share of incidents inside their SLA this month. Circle: response; diamond: resolution; grey tick: MSL; black tick: ESL" right={<Legend items={[['Response', COL.blue], ['Resolution', COL.navy]]} />}>
      <div ref={ref}><svg width={W} height={H} className="block">
        {[0.88, 0.9, 0.92, 0.94, 0.96, 0.98, 1].map(v => <g key={v}><line x1={X(v)} x2={X(v)} y1={8} y2={H - 20} stroke={COL.light} /><text x={X(v)} y={H - 6} fontSize="10.5" textAnchor="middle" fill={COL.ink3}>{Math.round(v * 100)}%</text></g>)}
        {rows.map((r, i) => { const y = 24 + i * 40; return <g key={r.p}>
          <text x={4} y={y + 4} fontSize="12" fontWeight="700" fill={COL.ink}>{r.p}</text>
          <line x1={X(Math.min(r.resp.act, r.res.act))} x2={X(Math.max(r.resp.act, r.res.act))} y1={y} y2={y} stroke={COL.grey} strokeWidth="2" />
          {[r.resp, r.res].map((m, j) => <g key={j}><line x1={X(m.msl)} x2={X(m.msl)} y1={y - 9 + j * 0} y2={y + 9} stroke={COL.grey} strokeWidth="2" /><line x1={X(m.esl)} x2={X(m.esl)} y1={y - 9} y2={y + 9} stroke={COL.ink} strokeWidth="2" /></g>)}
          <circle cx={X(r.resp.act)} cy={y} r="6" fill={COL.blue}><title>{`${r.p} response: ${pc(r.resp.act)} (ESL ${pc(r.resp.esl, 0)})`}</title></circle>
          <rect x={X(r.res.act) - 6} y={y - 6} width="12" height="12" transform={`rotate(45 ${X(r.res.act)} ${y})`} fill={COL.navy}><title>{`${r.p} resolution: ${pc(r.res.act)} (ESL ${pc(r.res.esl, 0)})`}</title></rect>
          <text x={W - R} y={y - 10} fontSize="10.5" textAnchor="end" fill={COL.ink3}>{`${pc(r.resp.act)} / ${pc(r.res.act)}`}</text>
        </g>; })}
      </svg></div>
    </Card>
  );
}

// ── Six months of status, one cell per metric per month ─────────────
export function SLAHeatCard({ onSel }) {
  return (
    <Card title="Six months at a glance" sub="Each cell is one metric in one month, coloured by its status that month. A column turning amber shows where the service slipped">
      <div className="overflow-x-auto"><table className="border-separate text-[11.5px]" style={{ borderSpacing: 2 }}><thead><tr><th className="text-left font-semibold text-ink3 pr-2">Metric</th>{MONTHS6.map(m => <th key={m} className="font-semibold text-ink3 w-[46px]">{m}</th>)}</tr></thead><tbody>
        {D.SLA.map((m, k) => <tr key={k} className="cursor-pointer" onClick={() => onSel && onSel(k)}><td className="pr-2 text-ink whitespace-nowrap max-w-[260px] truncate" title={m.name}><span className="text-ink3">#{m.n}</span> {m.name}</td>{m.trend.map((v, i) => { const st = statusOf(m, v); return <td key={i} title={`${m.name}, ${MONTHS6[i]}: ${pc(v, m.esl > 0.999 ? 3 : 1)} – ${st}`} className="h-[18px] rounded-[2px] text-center text-white font-semibold" style={{ background: stCol(st), opacity: st === 'Meets ESL' ? 0.85 : 1 }}>{st === 'Below MSL' ? '!' : ''}</td>; })}</tr>)}
      </tbody></table></div>
    </Card>
  );
}

// ── Headroom above MSL for the risk-reward SLAs (service credit exposure)
export function CreditHeadroomCard() {
  const rr = D.SLA.filter(m => m.cls === 'Risk Reward SLA');
  return (
    <Card title="Service credit exposure" sub="Risk-reward SLAs: where this month's actual sits between the minimum (credit applies below it) and the expected level">
      <div className="space-y-2">{rr.map((m, k) => { const pos = Math.max(0, Math.min(1.15, (m.act - m.msl) / (m.esl - m.msl))); const c = pos >= 1 ? COL.green : pos >= 0.4 ? COL.amber : COL.red; return (
        <div key={k} className="text-[12px]"><div className="flex justify-between gap-2"><span className="text-ink truncate"><span className="text-ink3">#{m.n}</span> {m.name}</span><span className="tabular-nums font-semibold" style={{ color: c }}>{pos >= 1 ? 'at ESL' : `${Math.round(pos * 100)}% of the way to ESL`}</span></div>
          <div className="relative h-[10px] mt-1 rounded-[2px]" style={{ background: 'linear-gradient(90deg,#F4D3D0 0,#F6E3C8 50%,#D5EBD9 100%)' }}><span className="absolute top-[-2px] bottom-[-2px] w-[4px] rounded-sm" style={{ left: `calc(${Math.min(100, pos / 1.15 * 100)}% - 2px)`, background: c }} /><span className="absolute inset-y-0 w-[1px]" style={{ left: `${1 / 1.15 * 100}%`, background: COL.ink }} /></div>
          <div className="flex justify-between text-[10.5px] text-ink3 mt-0.5"><span>MSL {pc(m.msl, m.esl > 0.999 ? 2 : 0)}</span><span>ESL {pc(m.esl, m.esl > 0.999 ? 2 : 0)}</span></div></div>); })}</div>
    </Card>
  );
}

// ── Mean time to restore and tickets per month ──────────────────────
export function MTTRTrendCard() {
  const series = [['P1', D.MTTR_MONTHS.P1, COL.red], ['P2', D.MTTR_MONTHS.P2, COL.amber], ['P3', D.MTTR_MONTHS.P3, COL.blue]];
  return (
    <Card title="Mean time to restore, hours" sub="Monthly average by priority; falling as automation and carrier evidence packs take hold" right={<Legend items={series.map(([n, , c]) => [n, c])} />}>
      <LineChart labels={MONTHS6} series={series.map(([n, d, c]) => ({ name: n, data: d, color: c }))} h={170} yFmt={v => `${Math.round(v)}h`} yMin={0} />
    </Card>
  );
}
export function TicketsAutoCard() {
  const auto = D.SLA.find(m => /Auto-resolution/.test(m.name)).trend;
  const months = D.TICKET_MONTHS.slice(-6).map((t, i) => { const tot = t.afterHours + t.ntf + t.carrier + t.customer + t.reboot; const a = Math.round(tot * auto[i]); return { label: MONTHS6[i], 'Auto-resolved': a, 'Resolved by an engineer': tot - a }; });
  return (
    <Card title="Tickets per month and how they were closed" sub="Network tickets, split into zero-touch auto-resolution and engineer-resolved" right={<Legend items={[['Auto-resolved', COL.green], ['By an engineer', COL.blue]]} />}>
      <Bars data={months} keys={['Auto-resolved', 'Resolved by an engineer']} colors={[COL.green, COL.blue]} h={170} />
    </Card>
  );
}

// ───────────────────────── Report charts (inline colours) ─────────────
export function RDonut({ data, size = 120, center, sub, title }) {
  const tot = data.reduce((s, d) => s + d.value, 0) || 1; const st = 16, r = (size - st) / 2, c = 2 * Math.PI * r; let acc = 0;
  return (
    <div style={{ flex: '1 1 220px', minWidth: 0 }}>
      {title && <div style={{ fontSize: 12, fontWeight: 700, color: COL.ink, marginBottom: 6 }}>{title}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <svg width={size} height={size} style={{ flexShrink: 0 }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={COL.light} strokeWidth={st} />
          {data.map(d => { const len = d.value / tot * c; const el = <circle key={d.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={d.color} strokeWidth={st} strokeDasharray={`${Math.max(0, len - 1.5)} ${c}`} strokeDashoffset={-acc} transform={`rotate(-90 ${size / 2} ${size / 2})`} />; acc += len; return el; })}
          {center != null && <text x="50%" y="50%" textAnchor="middle" fontSize="20" fontWeight="700" fill={COL.ink} fontFamily="Arial">{center}</text>}
          {sub && <text x="50%" y="64%" textAnchor="middle" fontSize="10" fill={COL.ink3} fontFamily="Arial">{sub}</text>}
        </svg>
        <div style={{ fontSize: 11.5, lineHeight: '17px', minWidth: 0 }}>{data.map(d => <div key={d.label} style={{ display: 'flex', gap: 6, alignItems: 'center' }}><span style={{ width: 9, height: 9, borderRadius: 2, background: d.color, flexShrink: 0 }} /><span style={{ color: COL.ink }}>{d.label}</span><b style={{ color: COL.ink, marginLeft: 'auto', paddingLeft: 8 }}>{num(d.value)}</b></div>)}</div>
      </div>
    </div>
  );
}
export function RBars({ data, keys, colors, title, h = 140, fmt = v => v }) {
  const W = 420, L = 30, T = 8, B = 22, Rr = 6; const max = Math.max(1, ...data.map(d => keys.reduce((a, k) => a + (d[k] || 0), 0)));
  const bw = (W - L - Rr) / data.length; const Y = v => T + (1 - v / max) * (h - T - B);
  return (
    <div style={{ flex: '1 1 300px', minWidth: 0 }}>
      {title && <div style={{ fontSize: 12, fontWeight: 700, color: COL.ink, marginBottom: 6 }}>{title}</div>}
      <svg viewBox={`0 0 ${W} ${h}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        {[0, 0.5, 1].map(f => <g key={f}><line x1={L} x2={W - Rr} y1={Y(max * f)} y2={Y(max * f)} stroke={COL.light} /><text x={L - 4} y={Y(max * f) + 3.5} fontSize="10" textAnchor="end" fill={COL.ink3} fontFamily="Arial">{fmt(Math.round(max * f))}</text></g>)}
        {data.map((d, i) => { let acc = 0; return <g key={i}>{keys.map((k, j) => { const v = d[k] || 0; const y0 = Y(acc), y1 = Y(acc + v); acc += v; return v ? <rect key={k} x={L + i * bw + bw * 0.15} y={y1} width={bw * 0.7} height={Math.max(0.5, y0 - y1)} fill={colors[j]}><title>{`${d.label} ${k}: ${v}`}</title></rect> : null; })}{(data.length <= 14 || i % Math.ceil(data.length / 12) === 0) && <text x={L + i * bw + bw / 2} y={h - 7} fontSize="10" textAnchor="middle" fill={COL.ink3} fontFamily="Arial">{d.label}</text>}</g>; })}
      </svg>
      {keys.length > 1 && <div style={{ display: 'flex', gap: 12, fontSize: 11, color: COL.ink3, marginTop: 2 }}>{keys.map((k, j) => <span key={k} style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}><span style={{ width: 9, height: 9, borderRadius: 2, background: colors[j] }} />{k}</span>)}</div>}
    </div>
  );
}
export function RHBars({ rows, title, max, fmt = v => v, mark, markLabel }) {
  const m = max || Math.max(1, ...rows.map(r => r.value));
  return (
    <div style={{ flex: '1 1 300px', minWidth: 0 }}>
      {title && <div style={{ fontSize: 12, fontWeight: 700, color: COL.ink, marginBottom: 6 }}>{title}</div>}
      {rows.map(r => <div key={r.label} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr) 54px', gap: 8, alignItems: 'center', fontSize: 11.5, marginBottom: 4 }}>
        <span style={{ color: COL.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.label}>{r.label}</span>
        <span style={{ position: 'relative', height: 10, background: COL.light, borderRadius: 2 }}><span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.min(100, r.value / m * 100)}%`, background: r.color || COL.blue, borderRadius: 2 }} />{mark != null && <span title={markLabel} style={{ position: 'absolute', top: -2, bottom: -2, width: 2, left: `${Math.min(100, mark / m * 100)}%`, background: COL.ink }} />}</span>
        <b style={{ color: COL.ink, textAlign: 'right' }}>{fmt(r.value)}</b>
      </div>)}
      {mark != null && markLabel && <div style={{ fontSize: 10.5, color: COL.ink3 }}>Black tick: {markLabel}</div>}
    </div>
  );
}
export function RRow({ children }) { return <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, margin: '6px 0 14px', padding: 12, border: `1px solid ${COL.light}`, borderRadius: 8 }}>{children}</div>; }
export const RC = COL;

// ── Mova iO Agents: actions by agent, and what kind of action they were ──
export function AgentMixCards({ L, defs }) {
  const rows = defs.map(a => ({ id: a.id, label: a.name, value: (L.x.agents[a.id] || {}).today || 0, ok: (L.x.agents[a.id] || {}).ok })).sort((a, b) => b.value - a.value);
  const max = Math.max(1, ...rows.map(r => r.value));
  const kind = { noise: 'An', correlation: 'An', diagnosis: 'An', prediction: 'An', knowledge: 'An', readiness: 'An', change: 'An', verify: 'Rec', ticket: 'Rec', comms: 'Rec', runbook: 'Act', carrier: 'Ext', dispatch: 'Ext' };
  const sum = k => rows.filter(r => kind[r.id] === k).reduce((a, r) => a + r.value, 0);
  const mix = [{ label: 'Analysis: correlate, diagnose, predict, check', value: sum('An'), color: COL.blue }, { label: 'Records: verify, ticket notes, messages', value: sum('Rec'), color: COL.teal }, { label: 'Network changes by runbook, inside the gate rules', value: sum('Act'), color: COL.brand }, { label: 'Carrier cases and field visits', value: sum('Ext'), color: COL.amber }];
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-3 mt-3 items-start">
      <Card title="Actions today, by agent" sub="With each agent's success rate; the bar shows its share of the busiest agent">
        <div className="space-y-1.5">{rows.map(r => <div key={r.id} className="grid grid-cols-[150px_minmax(0,1fr)_52px_58px] gap-2 items-center text-[12.5px]"><span className="text-ink truncate">{r.label}</span><span className="h-[10px] rounded-[2px]" style={{ background: COL.light }}><span className="block h-full rounded-[2px] transition-all duration-700" style={{ width: `${r.value / max * 100}%`, background: COL.blue }} /></span><b className="text-right tabular-nums text-ink">{num(r.value)}</b><span className="text-right tabular-nums text-[11.5px]" style={{ color: r.ok >= 0.95 ? COL.green : COL.amber }}>{r.ok ? `${(r.ok * 100).toFixed(1)}%` : '—'}</span></div>)}</div>
      </Card>
      <Card title="What the actions were" sub="Most agent work changes nothing on the network; changes run only inside the gate rules">
        <Donut data={mix} center={num(mix.reduce((a, m) => a + m.value, 0))} sub="actions today" />
      </Card>
    </div>
  );
}

// ── Knowledge: most used articles and outcome of suggestions ─────────
export function KnowledgeUseCards({ kb }) {
  const top = kb.slice().sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 7).map(k => ({ label: `${k.id} ${k.title}`, value: k.views || 0 }));
  const max = Math.max(1, ...top.map(t => t.value));
  const weeks = ['W-5', 'W-4', 'W-3', 'W-2', 'W-1', 'This week'].map((w, i) => ({ label: w, Accepted: [118, 131, 140, 152, 166, 174][i], 'Not relevant': [41, 38, 35, 33, 31, 29][i] }));
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 mb-3">
      <Card title="Most used articles" sub="Times each article was opened or suggested on a ticket, last 30 days">
        <div className="space-y-1.5">{top.map(t => <div key={t.label} className="grid grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_40px] gap-2 items-center text-[12.5px]"><span className="text-ink truncate" title={t.label}>{t.label}</span><span className="h-[10px] rounded-[2px]" style={{ background: COL.light }}><span className="block h-full rounded-[2px]" style={{ width: `${t.value / max * 100}%`, background: COL.navy }} /></span><b className="text-right tabular-nums text-ink">{num(t.value)}</b></div>)}</div>
      </Card>
      <Card title="Suggestions accepted by engineers" sub="Articles Mova iO suggested on tickets, by week: accepted or marked not relevant" right={<Legend items={[['Accepted', COL.green], ['Not relevant', COL.grey]]} />}>
        <Bars data={weeks} keys={['Accepted', 'Not relevant']} colors={[COL.green, COL.grey]} h={170} />
      </Card>
    </div>
  );
}
