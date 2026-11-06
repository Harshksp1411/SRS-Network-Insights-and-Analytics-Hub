// Report: critical incidents (P1 and P2). The executive version is the picture, the summary and one line per
// incident; the full version adds the incident table and, for each incident, what happened, the impact, the root
// cause, how it was solved, the timeline, who was involved, the records and what stops it happening again.
// Layout uses inline styles so the downloaded HTML keeps its shape.
import React from 'react';
import * as D from './data.js';
import { criticalOf } from './critical.js';
import { RDonut, RHBars, RRow, RC } from './viz3.jsx';
import { dur, hhmm, dateShort, HR } from './util.js';

const fixGroup = r => r.open ? 'Still open' : /^Mova iO on its own|^Mova iO under/.test(r.fixedBy) ? 'Mova iO on its own' : /Field/.test(r.fixedBy) ? 'Field visit' : /application|processor/i.test(r.fixedBy) ? 'SRS application support' : /[Cc]arrier|utility/.test(r.fixedBy) ? 'Carrier or utility' : 'Movate NOC';
const FIX_C = { 'Mova iO on its own': RC.brand, 'Movate NOC': RC.blue, 'Carrier or utility': RC.amber, 'Field visit': RC.navy, 'SRS application support': RC.grey, 'Still open': RC.red };
const hrs = ms => `${(ms / HR).toFixed(1)} h`;
const when = t => `${dateShort(t)} ${hhmm(t)} CT`;
const box = pri => ({ border: '1px solid #d9dce1', borderLeft: `4px solid ${pri === 'P1' ? RC.red : RC.amber}`, borderRadius: 6, padding: '10px 14px', margin: '12px 0', pageBreakInside: 'avoid' });
const UL = { margin: 0, paddingLeft: 18, fontSize: 12.5, listStyle: 'disc' };
const Lbl = ({ children }) => <div className="text-brand" style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '8px 0 3px' }}>{children}</div>;

export function CriticalReport({ s, now, days, brief, H, T, openInc }) {
  const list = criticalOf(s, now, days);
  const done = list.filter(r => !r.open), open = list.filter(r => r.open);
  const p1 = list.filter(r => r.pri === 'P1'), p2 = list.filter(r => r.pri === 'P2');
  const met = done.filter(r => r.slaMet), missed = done.filter(r => !r.slaMet);
  const avg = p => { const x = done.filter(r => r.pri === p); return x.length ? x.reduce((a, r) => a + r.ttr, 0) / x.length : null; };
  const groups = {}; list.forEach(r => { const g = fixGroup(r); groups[g] = (groups[g] || 0) + 1; });
  const layers = {}; list.forEach(r => { layers[r.layer] = (layers[r.layer] || 0) + 1; });
  const branches = list.reduce((a, r) => a + (parseInt(r.scope, 10) || 1), 0);
  const key = list.filter(r => r.pri === 'P1' || r.open || !r.slaMet), rest = list.filter(r => !key.includes(r));
  const restAuto = rest.filter(r => fixGroup(r) === 'Mova iO on its own').length;
  const id = r => r.live && openInc ? <button className="font-mono text-brand hover:underline" onClick={() => openInc(r.id)}>{r.id}</button> : <span className="font-mono">{r.id}</span>;
  const restoredTxt = r => r.open ? `open, ${r.state.toLowerCase()}` : dur(r.ttr);
  const targetTxt = r => r.open ? '—' : r.slaMet ? `within ${r.target / HR} h` : `missed (${r.target / HR} h)`;
  if (!list.length) return <p className="text-[13px] text-ink">No P1 or P2 incidents in the last {days} days.</p>;
  return <>
    <RRow>
      <RDonut title="Critical incidents" data={[{ label: 'P1', value: p1.length, color: RC.red }, { label: 'P2', value: p2.length, color: RC.amber }]} center={list.length} sub={`in ${days} days`} />
      <RDonut title="Restored within target" data={[{ label: 'Within target', value: met.length, color: RC.green }, { label: 'Outside target', value: missed.length, color: RC.red }, { label: 'Still open', value: open.length, color: RC.grey }].filter(x => x.value)} center={done.length ? `${Math.round(met.length / done.length * 100)}%` : '—'} sub="on time" />
      <RDonut title="Who fixed it" data={Object.entries(groups).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: k, value: v, color: FIX_C[k] }))} />
      <RHBars title="Root cause, by layer" rows={Object.entries(layers).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: k === 'ISP' ? 'Carrier (ISP)' : k, value: v, color: k === 'ISP' ? RC.amber : k === 'Application' ? RC.grey : RC.blue }))} />
    </RRow>
    <H>Summary</H>
    <p className="text-[13px] text-ink">In the last {days} days there were <b>{list.length} critical incidents</b> ({p1.length} P1, {p2.length} P2) touching {branches} branch{branches === 1 ? '' : 'es'}{open.length ? `; ${open.length} still open` : ''}. <b>{met.length} of {done.length}</b> resolved were restored within target.
      {avg('P1') != null && <> P1 average time to restore <b>{hrs(avg('P1'))}</b> (target 4 h).</>}{avg('P2') != null && <> P2 average <b>{hrs(avg('P2'))}</b> (target 8 h).</>}
      {' '}{groups['Mova iO on its own'] || 0} were fixed by Mova iO with no human touch, {groups['Field visit'] || 0} needed a field visit and {(layers.ISP || 0)} were carrier faults.</p>
    {missed.length > 0 && <p className="text-[13px] text-ink"><b>Outside target:</b> {missed.map(r => `${r.id} ${r.title} (${dur(r.ttr)}: ${r.fixedBy.toLowerCase()})`).join('; ')}.</p>}
    <H>{brief ? 'Key incidents: every P1, anything outside target and anything still open' : 'All P1 and P2 incidents'}</H>
    {brief
      ? <><T rows={key} cols={[['Incident', r => <span>{id(r)} · {r.pri}</span>], ['What happened', r => <span><b>{r.title}</b><br /><span className="text-ink3">{r.where} · {dateShort(r.opened)}</span></span>], ['Impact', r => r.impact[0] || '—'], ['How it was solved', r => r.open ? `Under way: ${r.next.charAt(0).toLowerCase()}${r.next.slice(1)}` : r.fix], ['Restored', r => <span>{restoredTxt(r)}<br /><span className={r.open ? 'text-ink3' : r.slaMet ? 'text-ok' : 'text-bad'}>{targetTxt(r)}</span></span>], ['Stopping it again', r => (r.prevent[0] || ['—'])[0]]]} />
        {rest.length > 0 && <p className="text-[13px] text-ink mt-2">The other {rest.length} P2 incident{rest.length === 1 ? ' was' : 's were'} all restored within target{restAuto ? `, ${restAuto} of them by Mova iO with no human touch` : ''}. Full detail lists every incident with its timeline.</p>}</>
      : <T rows={list} cols={[['Number', id], ['Pri', r => r.pri], ['Where', r => r.where], ['What happened', r => r.title], ['Opened', r => when(r.opened)], ['Time to restore', restoredTxt], ['Target', targetTxt], ['Root cause', r => r.cause], ['Fixed by', r => r.fixedBy]]} />}
    {!brief && <>
      <H>Incident by incident</H>
      {list.map(r => (
        <div key={r.id} style={box(r.pri)}>
          <div style={{ fontSize: 15, fontWeight: 800 }} className="text-ink">{r.pri} · {id(r)} · {r.title}</div>
          <div className="text-ink3" style={{ fontSize: 12 }}>{r.where} · opened {when(r.opened)} · {r.open ? `still open (${r.state})` : `restored in ${dur(r.ttr)}, ${r.slaMet ? 'within' : 'outside'} the ${r.target / HR} h target`}{r.acked ? ` · acknowledged in ${dur(r.acked - r.opened) || '1 min'}` : ''}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.2fr)', gap: 18 }}>
            <div>
              <Lbl>What happened</Lbl><div className="text-ink" style={{ fontSize: 12.5 }}>{r.what}</div>
              <Lbl>Impact</Lbl><ul style={UL} className="text-ink">{r.impact.map(x => <li key={x}>{x}</li>)}</ul>
              <Lbl>Root cause</Lbl><div className="text-ink" style={{ fontSize: 12.5 }}><b>{r.cause}</b> ({Math.round((r.conf || 0) * 100)}% confidence, {r.layer === 'ISP' ? 'carrier' : r.layer.toLowerCase()})</div>{r.ev && <div className="text-ink3" style={{ fontSize: 12 }}>{r.ev}</div>}
              {r.open ? <><Lbl>Where it stands</Lbl><div className="text-ink" style={{ fontSize: 12.5 }}>{r.next}{/\.$/.test(r.next) ? '' : '.'}</div></> : <><Lbl>How it was solved</Lbl><div className="text-ink" style={{ fontSize: 12.5 }}>{r.fix}. <span className="text-ink3">Fixed by: {r.fixedBy}.</span></div></>}
            </div>
            <div>
              <Lbl>Timeline (CT)</Lbl>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}><tbody>{r.steps.map((x, k) => <tr key={k} style={{ borderBottom: '1px solid #eceef1' }}><td className="text-ink3 font-mono" style={{ padding: '2px 8px 2px 0', whiteSpace: 'nowrap', verticalAlign: 'top' }}>{hhmm(x.t)}</td><td className="text-ink" style={{ padding: '2px 8px 2px 0', whiteSpace: 'nowrap', verticalAlign: 'top', fontWeight: 600 }}>{x.who}</td><td className="text-ink" style={{ padding: '2px 0', verticalAlign: 'top' }}>{x.text}</td></tr>)}</tbody></table>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.2fr)', gap: 18 }}>
            <div><Lbl>Stopping it happening again</Lbl><ul style={UL} className="text-ink">{r.prevent.map(([t, st]) => <li key={t}>{t} <span className="text-ink3">({st})</span></li>)}</ul>{r.lesson && <div className="text-ink2" style={{ fontSize: 12.5, fontStyle: 'italic', marginTop: 4 }}>Lesson: {r.lesson}</div>}</div>
            <div><Lbl>People and records</Lbl><div className="text-ink" style={{ fontSize: 12.5 }}>{r.people.join(', ')}</div><div className="text-ink3" style={{ fontSize: 12 }}>{r.records.join(' · ')}</div></div>
          </div>
        </div>))}
    </>}
  </>;
}
