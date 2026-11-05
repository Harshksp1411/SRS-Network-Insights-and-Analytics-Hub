// Dashboard 3: Predictive Risk and Proactive Operations (Next). Which stores and devices are likely to fail, and what
// should we do first? Scored daily from OpsRamp and ServiceNow history; every high-risk item becomes a planned action.
import React, { useMemo, useState } from 'react';
import * as I from 'lucide-react';
import * as D from '../data.js';
import { useApp, useNow } from '../store.jsx';
import { Heatmap, LineChart, C } from '../charts.jsx';
import { BarRow, Box, Pill, T } from '../sites/shell.jsx';
import { PeriodBar, ExploreBtn, Headline, Kpis, Trio, ChartCards, Insight, SectionHead, COLORS } from '../sites/dash.jsx';
import { nextModel, NEXT_RANGES, REGIONS, SIGNALS } from './model.js';
import { modelAccuracy } from '../predict.js';
import { num, dateShort, DAY } from '../util.js';
import { cx } from '../ui.jsx';

const dow = t => new Date(t).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'America/Chicago' });
const dueOf = (t, now) => t - now < 7 * DAY ? dow(t) : dateShort(t);
const riskTone = v => v >= 70 ? 'bad' : v >= 45 ? 'warn' : 'ok';

export function NextLens({ region, setRegion }) {
  const { s, act } = useApp(); const now = useNow();
  const [range, setRange] = useState('30d');
  const m = useMemo(() => nextModel(s, now, range, region), [s.incidents, s.resolved, s.branchHealth, s.circuitState, s.predictions, range, region, Math.floor(now / 60000)]);
  const [sel, setSel] = useState(null);
  const created = s.proactive || {};
  const dr = n => act.drill(region === 'All' ? n : { ...n, region });
  const mainSig = m.driving.slice().sort((a, b) => b.n - a.n)[0];
  const word = { '7d': 'this week', '30d': 'in the next 30 days', '90d': 'in the next 90 days' }[range];
  const createRecord = r => {
    if (created[r.b.id]) return;
    const id = r.kind === 'change' ? `CHG00${31950 + Object.keys(created).length}` : r.kind === 'visit' ? `WO00${41900 + Object.keys(created).length}` : `PRB00${4230 + Object.keys(created).length}`;
    if (r.kind === 'visit') act.add('workOrders', { id, branchId: r.b.id, inc: null, task: r.action, skills: ['Proactive'], parts: [], created: Date.now(), tech: null, status: 'Unassigned', window: 'After branch close', priority: 'P4' });
    else if (r.kind === 'change') act.add('changes', { id, title: `${r.action} – ${r.b.name}`, type: 'Normal', risk: 'Low', state: 'Draft', start: r.due, end: r.due + 2 * 3600e3, window: 'Weekend window', scope: r.b.region, devices: 1, owner: 'Network Eng L3', validation: 'Pending' });
    else act.add('problems', { id, title: `${r.driver} – ${r.b.name}`, incidents: 0, state: 'New', owner: 'Network Eng L3', opened: Date.now() });
    act.set({ proactive: { ...created, [r.b.id]: id } });
    act.audit(`Proactive ${r.record.toLowerCase()} ${id} raised from the risk score for ${r.b.name} (${r.score})`, id);
    act.toast(`${id}: ${r.record} raised in ServiceNow for ${r.b.name}`);
  };
  const acc = m.acc, ma = modelAccuracy();
  const sp = sel ? m.caps.find(c => c.b.id === sel) : m.upgrades[0] || m.caps.slice().sort((a, b) => b.d90 - a.d90)[0];
  const R = region === 'All' ? {} : { region };
  const bands = [['High (70 to 100)', m.high.length, COLORS.bad], ['Medium (45 to 69)', m.med.length, COLORS.warn], ['Low (under 45)', m.risks.length - m.high.length - m.med.length, COLORS.ok]];
  const fcLine = m.caps.slice().sort((a, b) => b.d90 - a.d90).slice(0, 4);
  const visuals = [
    { id: 'band', kind: 'stack', title: `Every store's risk score, ${word}`, go: { t: 'predictions' }, caption: `Scored 0 to 100 each day from OpsRamp performance and ServiceNow history. ${m.high.length} high, ${m.med.length} medium.`,
      parts: bands.map(([l, v, c]) => ({ label: l, value: v, color: c, go: { t: 'predictions' } })).reverse(), top: m.high.slice(0, 4).map(r => ({ label: `${r.b.name} (${r.score})`, why: r.driver, color: COLORS.bad, go: { t: 'branch', id: r.b.id } })), topTitle: 'Highest risk' },
    { id: 'map', kind: 'map', title: 'Where the risk is', go: { t: 'predictions' }, focus: region !== 'All', caption: 'Stores at medium or high risk, in colour. Guides field and depot planning.',
      points: m.risks.map(r => ({ id: r.b.id, x: r.b.x, y: r.b.y, st: r.score >= 70 ? 'down' : r.score >= 45 ? 'degraded' : 'up', color: r.score >= 70 ? COLORS.bad : r.score >= 45 ? COLORS.warn : COLORS.ok, label: `${r.b.name} · risk ${r.score}` })) },
    { id: 'drivers', kind: 'hbars', title: 'What is driving risk', go: { t: 'predictions' }, fmt: 'n', caption: 'Stores at medium or high risk where the signal is a real contributor.',
      rows: m.driving.map(g => ({ label: g.label, value: g.n, sub: g.warn, color: g.k === 'circuit' ? C.s1 : C.s3, go: { t: 'predictions' } })).sort((a, b) => b.value - a.value) },
    { id: 'regions', kind: 'hbars', title: 'Risk by region', go: { t: 'predictions' }, fmt: 'n', caption: 'Average risk score per region, with the number of high-risk stores.',
      rows: m.heat.map(h => ({ label: h.r, value: Math.round(h.avg), sub: `${h.high} high risk · ${h.n} stores`, color: h.high ? COLORS.warn : C.s1, go: { t: 'set', k: 'all', region: h.r } })).sort((a, b) => b.value - a.value) },
    { id: 'cap', kind: 'line', title: 'Capacity forecast: peak use, next 90 days', go: { t: 'set', k: 'capacity', ...R }, labels: ['Now', '+30 d', '+60 d', '+90 d'], fmt: 'n', refLines: [{ v: 90, label: 'Upgrade at 90%', color: C.bad }], caption: `${m.fc.map(f => `${f.n} circuits reach 90% within ${f.d} days`).join('; ')}.`,
      series: fcLine.map((c, i) => ({ name: c.b.name.split(' – ')[1], color: [C.s1, C.s4, C.s5, COLORS.warn][i], data: [c.now, c.d30, c.d60, c.d90].map(Math.round) })) },
    { id: 'acc', kind: 'cols', title: 'Did predictions hold this month?', go: { t: 'predictions' }, keys: ['Count'], colors: [C.ok], caption: `${acc.falseAlarm} false alarm · ${acc.became} flagged risk${acc.became === 1 ? '' : 's'} became incidents. Precision ${Math.round(ma.precision.at(-1) * 100)}%, recall ${Math.round(ma.recall.at(-1) * 100)}%.`,
      data: [['Risks flagged', acc.flagged], ['Acted on in time', acc.acted], ['Outages avoided', acc.avoided], ['Visits avoided', acc.visits]].map(([l, v]) => ({ label: l, Count: v })), goes: [0, 1, 2, 3].map(() => ({ t: 'predictions' })) },
  ];
  const insights = [
    { kicker: 'Proactive records', title: `${m.high.length} high-risk stores, each with a planned action`, line: 'Each becomes a ServiceNow problem record, planned change or field-visit request, assigned to the right team.', stats: ['Problem record', 'Planned change', 'Field visit request'].map(r => ({ value: m.high.filter(x => x.record === r).length, label: r.toLowerCase() })), points: m.high.slice(0, 3).map(r => ({ b: r.b.name, t: r.action, tone: 'bad' })), go: () => document.getElementById('atrisk')?.scrollIntoView({ behavior: 'smooth' }) },
    { kicker: 'Lifecycle', title: `${num(m.eos.length)} devices reach end of support within 12 months`, line: `${num(m.warrantyEnd.length)} warranties also end; this feeds the refresh plan.`, bars: m.failProne.map(([k, n]) => ({ label: `${k}: incidents, last 7 days`, value: n, tone: 'warn' })), go: () => dr({ t: 'devices', k: 'eos' }) },
    { kicker: 'Capacity', title: `${m.upgrades.length} circuit upgrade${m.upgrades.length === 1 ? '' : 's'} due ${word}`, line: 'Bandwidth trending towards the circuit limit at peak.', points: (m.upgrades.length ? m.upgrades : fcLine).slice(0, 4).map(c => ({ b: c.b.name, t: `${Math.round(c.now)}% now, ${Math.round(c.d90)}% in 90 days`, tone: 'warn' })), go: () => dr({ t: 'set', k: 'capacity' }) },
    { kicker: 'Field and depot', title: `${m.high.filter(r => r.kind === 'visit').length + m.med.filter(r => r.kind === 'visit').length} planned visits to book in quiet hours`, line: 'Spares pre-positioned at the nearest depot; technicians after branch close, not in a hurry.', points: s.depots.slice(0, 3).map(d => ({ b: d.city, t: `${d.spares['AP-635'] || 0} APs, ${d.spares['EC-XS'] || 0} EdgeConnects, ${d.spares['LTE router'] || 0} LTE routers`, tone: 'info' })), go: () => act.drill({ t: 'set', k: 'all' }) },
  ];
  const status = m.high.length > 15 ? { label: 'Risk', word: 'Elevated', kind: 'warn' } : m.high.length ? { label: 'Risk', word: 'Watch', kind: 'minor' } : { label: 'Risk', word: 'Low', kind: 'ok' };
  return (
    <div>
      <PeriodBar views={NEXT_RANGES} value={range} onChange={setRange} note="Scored daily from OpsRamp performance history and ServiceNow incident history" region={region} onRegion={setRegion} regions={REGIONS} right={<ExploreBtn icon={I.Telescope} onClick={() => dr({ t: 'predictions' })}>All predictions</ExploreBtn>} />
      <Headline status={status} scope={`Predictive risk and proactive operations · ${region === 'All' ? 'All regions' : region}`} headline={`${m.high.length} store${m.high.length === 1 ? '' : 's'} likely to fail without action ${word}`} deck={`Mostly ${mainSig ? mainSig.label.toLowerCase() : 'circuit degradation'}. ${acc.avoided} of ${acc.flagged} flagged outages avoided month to date.`} spotlight={m.high[0] && `${m.high[0].b.name}, risk ${m.high[0].score}: ${m.high[0].driver}. Do: ${m.high[0].action}, by ${dueOf(m.high[0].due, now)}.`} onSpot={() => m.high[0] && act.drill({ t: 'branch', id: m.high[0].b.id })} />
      <Kpis cols={5} items={[
        { label: 'High-risk stores', value: m.high.length, tone: 'bad', sub: `risk 70 or more, ${word}`, go: () => m.high[0] && act.drill({ t: 'branch', id: m.high[0].b.id }) },
        { label: 'Medium risk', value: m.med.length, tone: 'warn', sub: 'on the watch list', go: () => dr({ t: 'predictions' }) },
        { label: 'Upgrades due', value: m.upgrades.length, tone: m.upgrades.length ? 'warn' : 'ok', sub: `circuits at 90% within ${m.horizon} days`, go: () => dr({ t: 'set', k: 'capacity' }) },
        { label: 'End of support', value: num(m.eos.length), tone: 'warn', sub: 'devices, 12 months', go: () => dr({ t: 'devices', k: 'eos' }) },
        { label: 'Prevented MTD', value: acc.avoided, tone: 'ok', sub: `outages, of ${acc.flagged} flagged`, go: () => dr({ t: 'predictions' }) },
      ]} />
      <Trio
        attention={m.high.slice(0, 5).map(r => ({ text: `${r.b.name}, risk ${r.score}: ${r.action}.`, go: () => act.drill({ t: 'branch', id: r.b.id }) }))}
        well={[{ text: `${acc.avoided} of ${acc.flagged} flagged outages avoided this month.`, go: () => dr({ t: 'predictions' }) }, { text: `${acc.visits} unplanned visits turned into planned work.`, go: () => dr({ t: 'predictions' }) }, { text: `Precision ${Math.round(ma.precision.at(-1) * 100)}% and recall ${Math.round(ma.recall.at(-1) * 100)}%, both rising for 6 months.`, go: () => dr({ t: 'predictions' }) }, { text: `${num(m.risks.length - m.high.length - m.med.length)} stores at low risk.`, go: () => dr({ t: 'set', k: 'healthy' }) }]}
        ahead={m.high.slice().sort((a, b) => a.due - b.due).slice(0, 5).map(r => ({ when: dueOf(r.due, now), kind: r.record, what: `${r.b.name}: ${r.action}`, go: () => act.drill({ t: 'branch', id: r.b.id }) }))} aheadTitle="Due next" />
      <div className="mt-4"><ChartCards visuals={visuals} go={n => act.drill(n)} /></div>
      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4 mt-4">{insights.map(x => <Insight key={x.kicker} x={x} />)}</div>
      <SectionHead sub="the worklist, forecasts and how the model works">Stores at risk and the detail</SectionHead>
      <div id="atrisk">
        <Box title={`Stores at risk ${word}`} right="ranked by risk score, 0 to 100" sub="Each score comes with the reason behind it and a recommended action. Raise the proactive ServiceNow record from here.">
          <T cols={[
            { k: 'store', l: 'Store', f: r => <button onClick={() => act.drill({ t: 'branch', id: r.b.id })} className="font-bold text-ink hover:underline text-left">{r.b.name.replace('Branch ', '#')}</button> },
            { k: 'risk', l: 'Risk', f: r => <div className="flex items-center gap-2 min-w-[120px]"><span className="relative h-2.5 bg-chip rounded-full w-[80px]"><span className={cx('absolute inset-y-0 left-0 rounded-full', r.score >= 70 ? 'bg-bad' : 'bg-warn')} style={{ width: `${r.score}%` }} /></span><b className="tabular-nums">{r.score}</b></div> },
            { k: 'driver', l: 'Top driver', f: r => <span className="text-ink2">{r.driver}<span className="block text-[11px] text-ink3">{r.top.map(k => SIGNALS.find(g => g.k === k).label).join(' · ')}</span></span> },
            { k: 'action', l: 'Recommended action', f: r => r.action },
            { k: 'due', l: 'Due', r: true, f: r => <b>{dueOf(r.due, now)}</b> },
            { k: 'rec', l: 'ServiceNow', f: r => created[r.b.id] ? <Pill tone="green">{created[r.b.id]}</Pill> : <button onClick={() => createRecord(r)} className="h-7 px-2 rounded border border-line hover:bg-chip text-[11.5px] font-semibold text-ink whitespace-nowrap inline-flex items-center gap-1"><I.Plus size={12} />{r.record}</button> },
          ]} rows={m.risks.filter(r => r.score >= 45).slice(0, 12)} />
        </Box>
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-3 mt-3">
          <Box title="Risk heat map" sub="Regions by aggregate risk, and the signals behind it. Guides field and depot planning. Click a region to focus.">
            <Heatmap rows={m.heat.map(h => `${h.r} (${h.high} high)`)} cols={SIGNALS.map(g => g.label.split(' ')[0])} values={m.heat.map(h => h.by)} cell={26} rowW={210} onCell={(r) => setRegion(m.heat[r].r)} />
          </Box>
          <Box title="Risk signals" sub="What each signal looks for, and the failure it warns about.">
            <T dense cols={[{ k: 'label', l: 'Signal', f: g => <b className="text-ink">{g.label}</b> }, { k: 'ex', l: 'Example indicators', cls: 'text-ink2' }, { k: 'warn', l: 'Early warning of', cls: 'text-ink2' }]} rows={SIGNALS} />
          </Box>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-3 mt-3">
          <Box title="Capacity forecasts: 30, 60 and 90 days" sub={`Peak bandwidth (95th percentile) per store, projected forward. ${m.fc.map(f => `${f.n} circuits reach 90% within ${f.d} days`).join('; ')}.`}>
            <T dense cols={[{ k: 'b', l: 'Store', f: c => <button onClick={() => setSel(c.b.id)} className={cx('text-left hover:underline', sp && sp.b.id === c.b.id ? 'font-bold text-ink' : 'text-ink')}>{c.b.name}</button> }, { k: 'now', l: 'Now', r: true, f: c => `${Math.round(c.now)}%` }, { k: 'd30', l: '+30 d', r: true, f: c => `${Math.round(c.d30)}%` }, { k: 'd60', l: '+60 d', r: true, f: c => `${Math.round(c.d60)}%` }, { k: 'd90', l: '+90 d', r: true, f: c => <b className={c.d90 >= 90 ? 'text-bad' : ''}>{Math.round(c.d90)}%</b> }, { k: 'u', l: '', f: c => c.d90 >= 90 ? <Pill tone="amber">upgrade</Pill> : null }]} rows={m.caps.slice().sort((a, b) => b.d90 - a.d90).slice(0, 8)} />
            {sp && <div className="mt-2"><div className="text-[12px] text-ink2 mb-1">{sp.b.name}: {sp.line.carrier} {sp.line.type}, {sp.line.bw} Mb/s</div><LineChart h={130} labels={['Now', '+15 d', '+30 d', '+45 d', '+60 d', '+75 d', '+90 d']} yFmt={v => `${Math.round(v)}%`} yMin={0} yMax={110} forecastFrom={0} refLines={[{ v: 90, label: 'Upgrade at 90%', color: C.bad }]} series={[{ name: 'Peak use', color: C.s1, data: [0, 1, 2, 3, 4, 5, 6].map(k => Math.min(120, sp.now + (sp.d90 - sp.now) * k / 6)) }]} /></div>}
          </Box>
          <Box title="Lifecycle risk" sub="Devices approaching end of support, or with failure-prone histories. Feeds the refresh plan.">
            <div className="grid grid-cols-2 gap-2 mb-2">{[['End of support within 12 months', m.eos.length, () => dr({ t: 'devices', k: 'eos' })], ['Warranty ends within 12 months', m.warrantyEnd.length, null]].map(([l, v, f]) => <button key={l} onClick={f || undefined} className="text-left border border-line rounded px-2.5 py-1.5 hover:bg-chip/50"><div className="text-[20px] font-bold tabular-nums text-warn">{num(v)}</div><div className="text-[11.5px] text-ink3">{l}</div></button>)}</div>
            <div className="text-[12px] font-bold text-ink mb-1">Refresh plan by model</div>
            {Object.entries(m.eos.reduce((a, d) => { a[d.model] = (a[d.model] || 0) + 1; return a; }, {})).map(([k, n]) => { const l = D.lifecycleOf(m.eos.find(d => d.model === k)); return <div key={k} className="flex items-center gap-2 text-[12.5px] py-0.5"><b className="text-ink w-16">{k}</b><span className="text-ink3 flex-1">end of support {l.eosup}</span><b className="tabular-nums">{num(n)}</b></div>; })}
            <div className="text-[12px] font-bold text-ink mt-2 mb-1">Failure-prone models (incidents, last 7 days)</div>
            {m.failProne.map(([k, n]) => <div key={k} className="flex items-center gap-2 text-[12.5px] py-0.5"><span className="text-ink flex-1">{k}</span><b className="tabular-nums">{n}</b></div>)}
          </Box>
        </div>
        <Box className="mt-3" title="From prediction to action" sub="Each high-risk item creates a proactive ServiceNow record, assigned to the right team, and links to SRS's depot and field services.">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 text-[12.5px]">
            <div className="border border-line rounded-lg p-3"><div className="font-bold text-ink flex items-center gap-1.5"><I.FilePlus2 size={14} className="text-brand" />Proactive records</div><div className="text-ink2 mt-1">Problem records, planned changes and field-visit requests.</div>{['Problem record', 'Planned change', 'Field visit request'].map(r => <div key={r} className="flex justify-between mt-1"><span className="text-ink3">{r}</span><b className="tabular-nums">{m.high.filter(x => x.record === r).length} to raise, {m.high.filter(x => x.record === r && created[x.b.id]).length} raised</b></div>)}</div>
            <div className="border border-line rounded-lg p-3"><div className="font-bold text-ink flex items-center gap-1.5"><I.Package size={14} className="text-brand" />Spares pre-positioned</div><div className="text-ink2 mt-1">Parts the high-risk list needs, against the nearest depot.</div>{s.depots.slice(0, 4).map(d => { const need = m.high.filter(r => (D.DEPOT_REGION[r.b.region] || []).includes(d.id) && r.kind === 'visit').length; return <div key={d.id} className="flex justify-between mt-1"><span className="text-ink3">{d.city}</span><b className="tabular-nums">{need ? `${need} needed, ` : ''}{d.spares['AP-635'] || 0} APs, {d.spares['EC-XS'] || 0} EC</b></div>; })}</div>
            <div className="border border-line rounded-lg p-3"><div className="font-bold text-ink flex items-center gap-1.5"><I.CalendarClock size={14} className="text-brand" />Visits in quiet hours</div><div className="text-ink2 mt-1">Technicians booked after branch close, not dispatched in a hurry.</div><div className="flex justify-between mt-1"><span className="text-ink3">Planned visits proposed</span><b>{m.high.filter(r => r.kind === 'visit').length + m.med.filter(r => r.kind === 'visit').length}</b></div><div className="flex justify-between mt-1"><span className="text-ink3">Window</span><b>after close, before 06:00 local</b></div></div>
            <div className="border border-line rounded-lg p-3"><div className="font-bold text-ink flex items-center gap-1.5"><I.ShieldCheck size={14} className="text-brand" />Automation, with approval gates</div><div className="text-ink2 mt-1">Approved low-risk actions run on their own over time:</div>{[['Clear a stuck port', 'RB-103'], ['Re-balance traffic to the backup', 'RB-101'], ['Re-run a failed backup', 'RB-109']].map(([l, rb]) => <div key={rb} className="flex justify-between mt-1"><span className="text-ink3">{l}</span><b>{rb}, {D.RB[rb].autonomy}</b></div>)}</div>
          </div>
        </Box>
        <Box className="mt-3" title="How it works" sub="Trained on 12 or more months of OpsRamp performance history and ServiceNow incident history, so past patterns teach what an impending failure looks like at SRS.">
          <ol className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[12.5px]">{[['1', 'Transparent baselines and anomaly detection', 'A normal range for every circuit and device by hour and weekday; drift from it raises the score. Live now.', 'green', 'live'], ['2', 'Machine-learning failure prediction', 'Added as the data matures: failure classifiers per circuit, AP, switch and backup path, each with the reasons behind its score.', 'blue', 'in use for circuits and APs'], ['3', 'Calibrated with SRS engineers', 'Weekly reviews in the first months tune thresholds and build trust; every outcome goes back into the model.', 'amber', 'weekly risk review']].map(([n, t, d, tone, tag]) => <li key={n} className="border border-line rounded-lg p-3"><div className="flex items-center gap-2"><span className="w-6 h-6 rounded-full bg-brand text-white text-[12px] font-bold grid place-items-center">{n}</span><b className="text-ink flex-1">{t}</b><Pill tone={tone}>{tag}</Pill></div><div className="text-ink2 mt-1">{d}</div></li>)}</ol>
        </Box>
      </div>
    </div>
  );
}
