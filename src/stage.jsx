// Demo stage: one screen that shows what every system involved is doing while a demo runs,
// Detect → Correlate → Decide → Act → Verify → Record, with a business and a technical explanation.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as I from 'lucide-react';
import { useApp } from './store.jsx';
import { DEMOS } from './demos.js';
import { stageSpec } from './stagedata.js';
import { Logo, cx } from './ui.jsx';
import { useWidth } from './charts.jsx';
import { hhmmss } from './util.js';
import { DEMOS_ONLY, CONSOLE_URL } from './edition.js';

export const SYS = {
  aruba: { n: 'EdgeConnect Orchestrator', s: 'Orchestrator', logo: 'aruba' }, central: { n: 'Aruba Central', s: 'Central', logo: 'central' }, opsramp: { n: 'HPE OpsRamp', s: 'OpsRamp', logo: 'opsramp' },
  newrelic: { n: 'New Relic', logo: 'newrelic' }, movaio: { n: 'Mova iO', logo: 'movaio' }, servicenow: { n: 'ServiceNow', logo: 'servicenow' },
  carrier: { n: 'Carrier portal', icon: I.RadioTower }, vault: { n: 'Credential vault', icon: I.KeyRound }, teams: { n: 'Teams / email', icon: I.MessageSquare },
  audit: { n: 'Audit log', icon: I.ScrollText }, field: { n: 'Field dispatch', icon: I.Truck }, git: { n: 'Network-as-Code', icon: I.GitBranch }, weather: { n: 'Weather feed (NWS)', icon: I.CloudLightning },
};
const SRCI = {
  aruba: ['Stats every 30 s, alarms live', 'Path and tunnel health for each EdgeConnect: loss, latency, jitter, failover', 'Orchestrator REST API; alarms forwarded to OpsRamp'],
  central: ['Every minute, events live', 'Switch, access point and client health: PoE, radios, roaming, firmware', 'Aruba Central API and webhooks'],
  opsramp: ['Polls every minute, traps live', 'SNMP and syslog from EdgeConnects, switches and access points; config backups', 'OpsRamp gateway, SNMPv3'],
  newrelic: ['Every minute', 'Response time on the payment and ERP paths from synthetic checks', 'New Relic synthetics'],
  weather: ['Every 5 minutes', 'Severe-weather warnings by county', 'National Weather Service alerts API'],
  servicenow: ['On change', 'Branch calls, incidents, changes and CMDB records', 'ServiceNow Table API'],
  movaio: ['On bulletin or schedule', 'Vendor bulletins, lifecycle notices and readiness results matched to the CMDB', 'HPE Aruba Networking notices; Mova iO checks'],
  carrier: ['On change', 'Carrier ticket status, loopback results, outage maps', 'Carrier portal (e-bonding where offered)'],
};
const OBS = new Set(['aruba', 'central', 'opsramp', 'newrelic', 'weather']);
const GATE = { Autonomous: 'auto', 'Human-on-the-loop': 'stop', 'Human-in-the-loop': 'approve' };
const PEOPLE = { 'NOC Engineer': 'Priya S.', 'Network Engineer L3': 'Marcus L.', 'Security Lead': 'Omar N.', 'Major Incident Manager': 'Arjun M.', 'Change Manager': 'Dana W.', 'M&A Integration Lead': 'Alicia R.' };
const TGT = { fibercut: 'carrier', lte: 'carrier', storm: 'carrier', loop: 'central', drift: 'central', dhcp: 'git', eol: 'git', capacity: 'aruba', notready: 'aruba', hardown: 'aruba', crc: 'central', day0: 'aruba', patch: 'central', backup: 'opsramp', catalog: 'central', predcircuit: 'carrier', sitehold: 'carrier', major: 'central', compliance: 'central', errbudget: 'servicenow', central: 'central', chronic: 'carrier', failedauto: 'central', toil: 'git', day1: 'opsramp' };
const WORDS = { servicenow: ['Ready', 'Rescheduling', 'Change moved'], carrier: ['Ready', 'Opening case', 'Case open'], field: ['Ready', 'Matching technician', 'Work order out'], git: ['Ready', 'Commit in review', 'Merged and pushed'] };
const AUX = { carrier: c => ['Case open', `${c} · evidence attached`], field: () => ['Work order out', 'technician matched'], git: () => ['Merged and pushed', 'main'] };
const AUX_OVR = { hardown: { carrier: ['Case open', 'fiber break confirmed'] }, crc: { field: ['Optic swap booked', 'after close'] }, predcircuit: { carrier: ['Proactive case open', 'trend evidence attached'] }, sitehold: { carrier: ['Maintenance confirmed', 'window 00:00–04:00'] }, day0: { git: ['Rings committed', 'sdwan/firmware/ecos-day0.yaml'] }, patch: { git: ['Wave file merged', 'firmware/aoscx-monthly.yaml'] }, failback: { carrier: ['Case closed', 'checked by Mova iO'] }, capacity: { carrier: ['Upgrade ordered', 'install in 12 days'] }, cutover: { field: ['Crew on site', 'cutover weekend'] }, eol: { field: ['Spares allocated', '6 depots'] }, drift: { git: ['Golden v41', 'used for the restore'] }, ec: { field: ['Technician dispatched', 'spare EC-XS · ETA 80 min'] }, cve: { git: ['Policy committed', 'all-branch policy'] }, scanners: { git: ['Override merged', 'site file'] }, major: { git: ['Release file merged', 'switches/firmware/aoscx-10.16.yaml'] }, central: { git: ['Group mapping merged', 'central/groups/branch-golden.yaml'] }, chronic: { carrier: ['Chronic review requested', 'account team'] }, toil: { git: ['RB-111 merged', 'runbooks/rb111.py'] } };
const BLAST = { cve: 'policy on all branches, no client impact', eol: 'planning only, no device change', fw: 'canary group only (10 APs)', storm: 'no device change', cutover: 'one site, not trading', lte: 'no device change', fibercut: 'no device change', capacity: 'one branch', day0: 'canary ring of 10 closed branches', patch: 'batches of 20 switches, branches closed', backup: 'read-only, no device change', predcircuit: 'no device change', sitehold: 'no device change', catalog: 'two unused access ports', crc: 'one uplink; the second link keeps the switch connected', hardown: 'one branch, already down', major: 'pilot ring of 31 switches at 12 closed branches', compliance: '37 devices at 31 closed branches', errbudget: 'no device change', central: '120 APs at 30 closed branches, batches of 20', chronic: 'no device change', failedauto: 'one AP port and six camera ports on one switch', toil: 'no device change', day1: 'read-only, no device change' };
const R_STOP = '5-minute';
const PH = ['Detect', 'Correlate', 'Decide', 'Act', 'Verify', 'Record'];
const pct = x => `${Math.round(x * 100)}%`;
export const roleOf = (demo, sp) => { if (sp && sp.role) return sp.role; const st = (demo.steps || []).find(x => x.await); const m = st && st.await.label.match(/as (.+)$/); return m ? m[1].replace(/\s*\(.*\)$/, '') : 'NOC Engineer'; };
export const gateOf = demo => GATE[demo.who] || 'auto';
const fmtV = (v, m) => `${Number(v).toFixed(m.dec || 0)}${m.unit}`;

// ── timeline ─────────────────────────────────────────────────────────
function buildRun(demo, sp, c) {
  const kind = gateOf(demo), role = roleOf(demo, sp), person = PEOPLE[role] || 'Duty engineer';
  const no = (sp.ticket && sp.ticket.no) || c.id || 'INC';
  const host = sp.host, n = sp.n, tgt = TGT[demo.id] || sp.src;
  const W = WORDS[tgt] || ['Ready for the run', 'Applying', 'Change applied'];
  const intake = sp.systems.filter(k => sp.alerts.some(a => a[2] === k) || k === sp.src);
  const names = intake.map(k => SYS[k].n).join(', ');
  const steps = demo.steps || []; const ai = steps.findIndex(x => x.await);
  const preSteps = ai >= 0 ? steps.slice(0, ai).map((_, i) => i) : [0];
  const postSteps = ai >= 0 ? steps.slice(ai + 1).map((_, i) => ai + 1 + i) : steps.slice(1).map((_, i) => i + 1);
  const sess = `VLT-${String(3300 + (no.length * 97 + host.length * 13) % 600)}`;
  const cmd = sp.engine === 'ansible' ? `ansible-playbook ${sp.file} --limit ${host}` : `mova run ${sp.rb} --target ${host}`;
  const pre = [], post = [], decl = [];
  const P = (a, t, e) => a.push({ t, ...e });

  P(pre, 0.4, { ph: 0, st: 'DETECTING', metric: 'bad', alerts: 'stream', sys: { [sp.src]: [`${n} alert${n > 1 ? 's' : ''} firing`, sp.alerts[0][3], 'bad'] }, log: ['INTAKE', `${n} signal${n > 1 ? 's' : ''} arriving from ${names}`], term: ['# waiting for a decision from Mova iO'] });
  intake.filter(k => k !== sp.src).forEach((k, i) => { const a = sp.alerts.find(x => x[2] === k); P(pre, 1.1 + i * 0.45, { sys: { [k]: a ? [a[1], a[3], a[0] === 'INFO' ? 'info' : 'bad'] : ['Signals in', '', 'info'] } }); });
  if (sp.m.early) P(pre, 2.4, { metric: 'acted', mark: sp.m.early, log: ['POLICY', `${sp.m.early}: the SD-WAN policy acted on its own in seconds`] });
  P(pre, 3, { ph: 1, st: 'CORRELATING', sys: { movaio: ['Correlating', 'topology and time window', 'info'] }, log: ['CORRELATE', n > 1 ? `${n} alerts → 1 event (topology and time window)` : '1 alert → 1 event'] });
  P(pre, 4.1, { alerts: 'grouped', tkt: { state: 'New', a: ['Correlation agent', `${n} signal${n > 1 ? 's' : ''} from ${names} grouped into this one ticket.`] }, sys: { [sp.src]: [`${n} alert${n > 1 ? 's' : ''}`, `grouped into ${no}`, 'bad'] }, log: ['TICKET', `ServiceNow ${no} opened: one ticket for the whole event`], con: ['pre:' + preSteps[0]] });
  let t = 4.9;
  sp.evidence.forEach((e, i) => P(pre, t + i * 0.7, { st: 'ANALYZING', sys: { movaio: ['Analyzing', `evidence ${i + 1} of ${sp.evidence.length}`, 'info'] }, log: ['EVIDENCE', '✓ ' + e] }));
  t += sp.evidence.length * 0.7;
  sp.ruled.forEach((r, i) => P(pre, t + i * 0.55, { log: ['RULED OUT', '✗ ' + r] }));
  t += sp.ruled.length * 0.55 + 0.2;
  P(pre, t, { log: ['DIAGNOSE', `Root cause (${pct(sp.conf)} confidence): ${sp.cause}`], tkt: { a: ['Diagnosis agent', `Root cause (${pct(sp.conf)} confidence): ${sp.cause}.`] } });
  t += 0.8;
  const pcs = prechecks(demo, sp, kind);
  const preRest = preSteps.slice(1);
  pcs.forEach((p, i) => P(pre, t + i * 0.5, { ph: 2, st: 'DECIDING', log: ['PRE-CHECK', '✓ ' + p], sys: i === 0 ? { [tgt]: [W[0], host, 'idle'] } : undefined, con: i === 0 && preRest.length ? preRest.map(k => 'pre:' + k) : undefined }));
  t += pcs.length * 0.5;
  P(pre, t, { tkt: { state: 'In Progress', a: ['Change guard', '[PRE-CHECKS] ' + pcs.join(' · ')] } });
  t += 0.4;
  const mode = kind === 'auto' ? 'autonomous: runs now, policy checks passed' : kind === 'stop' ? 'human-on-the-loop: runs unless stopped' : `human-in-the-loop: needs approval from ${role}`;
  P(pre, t, { log: ['DECIDE', `${sp.rb} ${sp.rbName} · risk ${sp.risk_} · ${mode}`] });
  t += 0.5; const gateT = t;
  if (kind === 'auto') P(pre, gateT, { st: 'APPROVED BY POLICY', sys: { movaio: ['Runbook selected', sp.rb, 'info'] }, log: ['APPROVAL', `Autonomous: ${sp.why}`], aud: 'Policy gate passed', con: ai >= 0 ? ['awaitStep'] : undefined });
  if (kind === 'stop') P(pre, gateT, { st: 'STARTS IN', gate: true, sys: { movaio: ['Starts in 10 s', `${sp.rb} · approve`, 'info'] }, log: ['APPROVAL', `Human-on-the-loop: ${R_STOP} stop window open (shortened to 10 s for the demo)`], term: [`# ${sp.rb} starts in 10 seconds unless someone stops it.`] });
  if (kind === 'approve') P(pre, gateT, { st: 'WAITING FOR APPROVAL', gate: true, sys: { movaio: ['Waiting for approval', role, 'warn'] }, log: ['APPROVAL', `Waiting for ${role}: ${sp.why}`], term: [`# ${sp.rb} is waiting for approval from ${role}`], con: ai >= 0 ? ['awaitStep'] : undefined });

  // post: after the gate
  if (kind === 'approve') P(post, 0, { log: ['APPROVAL', `Approved by ${person} (${role})`], tkt: { a: [person, `Approved ${sp.rb}: ${sp.rbName}.`] }, aud: `Approved by ${person}`, con: ['await'] });
  if (kind === 'stop') P(post, 0, { log: ['APPROVAL', 'Stop window closed with no objection: proceeding'], aud: 'Stop window closed, no objection', con: ['proceed'] });
  const cred = sp.cred !== false;
  P(post, 0.6, { ph: 3, st: 'REMEDIATING', sys: { movaio: ['Remediating', `${sp.rb} · act`, 'info', 0], [tgt]: [W[1], host, 'info'], ...(cred ? { vault: ['Checked out', sess, 'info'] } : {}) }, term: [`$ ${cmd}`], ...(cred ? { log: ['CREDENTIAL', `Vault: one-time credential checked out for ${host} · ${sess}`], aud: 'Credential checked out' } : {}) });
  const N = sp.tasks.length, T0 = 1.4, DT = 1.7;
  const aux = sp.systems.filter(k => AUX[k] && k !== tgt);
  sp.tasks.forEach(([nm, out], i) => {
    const con = postSteps.filter((_, k) => Math.min(N - 1, Math.floor(k * N / Math.max(1, postSteps.length))) === i).map(k => 'post:' + k);
    const term = sp.engine === 'ansible' ? [`TASK [${nm}] ${'*'.repeat(Math.max(4, 46 - nm.length))}`, `changed: [${host}] => ${out}`] : [`[${i + 1}/${N}] ${nm}`, `  -> ${out}`];
    const e = { tick: i, log: ['ACT', nm], term, sys: { movaio: ['Remediating', `${sp.rb} · step ${i + 1} of ${N}`, 'info', (i + 1) / N] }, con: con.length ? con : undefined };
    if (i === sp.actAt) { e.metric = 'acted'; e.mark = 'Mova iO acted'; }
    if (i === Math.floor((N - 1) / 2) && aux.length) aux.forEach(k => { const o = (AUX_OVR[demo.id] || {})[k] || AUX[k](sp.carrier || 'Carrier'); e.sys[k] = [o[0], o[1], 'info']; });
    P(post, T0 + i * DT, e);
  });
  let ta = T0 + N * DT;
  P(post, ta, { term: sp.engine === 'ansible' ? [`PLAY RECAP ${'*'.repeat(40)}`, `${host} : ok=${N + 1} changed=${N} unreachable=0 failed=0`] : [`run complete · ${N} steps · 0 errors`], sys: { [tgt]: [W[2], host, 'ok'], ...(cred ? { vault: ['Checked back in', sess, 'ok'] } : {}) }, ...(cred ? { log: ['CREDENTIAL', 'Credential checked back in'], aud: 'Credential checked back in' } : {}) });
  ta += 0.8;
  P(post, ta, { ph: 4, st: 'VERIFYING', metric: 'after', sys: { movaio: ['Verifying', `${sp.rb} · verify`, 'info', 1] } });
  sp.checks.forEach((ck, i) => P(post, ta + 0.6 + i * 0.9, { log: ['VERIFY', `${ck[0]}: ${ck[1]} → ${ck[2]}`], term: [`verify> ${ck[0]}: ${ck[1]} → ${ck[2]} … PASS`] }));
  let tr = ta + 0.6 + sp.checks.length * 0.9;
  P(post, tr, { alerts: sp.keepAlerts ? 'tracked' : 'cleared', sys: Object.fromEntries(intake.filter(k => OBS.has(k)).map(k => [k, k === sp.src ? (sp.keepAlerts ? [`${n} tracked`, `in ${no}`, 'info'] : ['All cleared', `${n} alert${n > 1 ? 's' : ''} closed`, 'ok']) : ['Back to normal', '', 'ok']])) });
  tr += 0.6;
  P(post, tr, { ph: 5, st: 'RECORDING', tkt: { state: sp.ticketEnd, a: ['Ticket agent', `${sp.rb} completed. ${sp.checks.map(ck => `${ck[0]}: ${ck[1]} → ${ck[2]}`).join(' · ')}.`] }, log: ['TICKET', `ServiceNow ${no}: work note added, state ${sp.ticketEnd}`], term: [`# ${no}: ${sp.ticketEnd.toLowerCase()}`] });
  P(post, tr + 0.7, { log: ['NOTIFY', `Teams card posted to ${sp.audience}`], sys: { teams: ['Card sent', sp.audience, 'ok'] } });
  P(post, tr + 1.3, { log: ['LEARN', 'Knowledge: outcome stored; the same pattern is matched faster next time'], sys: { movaio: [sp.outcome, `${sp.rb} · learn`, 'ok', 1] }, aud: `Closed: ${sp.outcome}` });
  P(post, tr + 1.8, { log: ['DONE', 'Completed'], done: true, st: sp.ticketEnd === 'Resolved' ? 'RESOLVED' : 'DONE' });

  const verb = kind === 'stop' ? 'Stopped' : 'Declined';
  P(decl, 0, { st: 'HANDED TO A PERSON', log: [verb.toUpperCase(), `${verb} by ${person} (${role}): no change made`], tkt: { state: 'In Progress', a: [person, `${verb} ${sp.rb}. Engineer takes over; the runbook stays as a recommendation.`] }, sys: { movaio: ['Handed to a person', role, 'warn'], [tgt]: ['No change', host, 'idle'] }, term: [`# ${verb.toLowerCase()} by ${person}: no change made`], aud: `${verb} by ${person}`, con: ['decline'] });
  P(decl, 0.9, { log: ['TICKET', `ServiceNow ${no}: assigned to ${person}`] });
  P(decl, 1.6, { ph: 5, log: ['DONE', 'Handed to a person'], done: true, declined: true });

  const end = a => Math.max(...a.map(e => e.t));
  return { kind, role, person, no, host, tgt, intake, pre, post, decl, gateT, endPost: end(post), endDecl: end(decl), sess };
}

function prechecks(demo, sp, kind) {
  const hrs = sp.hrs ? sp.hrs : sp.when === 'trading' ? 'Branch hours: trading now, so autonomous changes are gated' : sp.when === 'closed' ? 'Branch hours: closed, change window open' : 'Device already down: the change cannot make it worse';
  const L = [hrs, 'Freeze windows: none cover this scope', `Change calendar: no other change on ${sp.host} in the next 2 hours`, `Blast radius: ${BLAST[demo.id] || 'this branch only'}`, `Rollback: ${sp.tech.undo}`];
  if (sp.cred !== false) L.push(`Credential: one-time vault checkout scoped to ${sp.host}, expires in 15 minutes`);
  return L;
}

function fold(evs) {
  const v = { ph: -1, st: 'READY', logs: [], sys: {}, cnt: {}, term: [], ticks: new Set(), metric: 'base', mark: null, alerts: null, tkt: null, aud: [], done: false, declined: false, gate: false };
  for (const e of evs) {
    if (e.ph != null) v.ph = e.ph; if (e.st) v.st = e.st;
    if (e.log) v.logs.push({ at: e.at, tag: e.log[0], text: e.log[1] });
    if (e.sys) Object.entries(e.sys).forEach(([k, x]) => { v.sys[k] = x; v.cnt[k] = (v.cnt[k] || 0) + 1; });
    if (e.term) v.term.push(...e.term);
    if (e.tick != null) v.ticks.add(e.tick);
    if (e.metric) { v.metric = e.metric; if (e.mark) v.mark = { label: e.mark, at: e.at }; }
    if (e.alerts) v.alerts = { st: e.alerts, at: e.at };
    if (e.tkt) { const prev = v.tkt || { state: 'New', acts: [] }; v.tkt = { state: e.tkt.state || prev.state, acts: e.tkt.a ? [{ at: e.at, who: e.tkt.a[0], text: e.tkt.a[1] }, ...prev.acts] : prev.acts }; }
    if (e.aud) v.aud.push(e.aud);
    if (e.gate) v.gate = true; if (e.done) v.done = true; if (e.declined) v.declined = true;
  }
  return v;
}

// ── chart ────────────────────────────────────────────────────────────
function StageChart({ data, m, markIdx, markLabel, bad }) {
  const [ref, W] = useWidth(560);
  const H = typeof window !== 'undefined' && window.innerHeight < 860 ? 150 : 196, L = 40, R = 10, T = 14, B = 18;
  const hi = Math.max(m.base, m.bad, m.after, m.thr || 0) * 1.12 || 1;
  const x = i => L + (i / Math.max(1, data.length - 1)) * (W - L - R), y = v => T + (1 - v / hi) * (H - T - B);
  const pts = data.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const col = bad ? 'rgb(var(--bad))' : 'rgb(var(--ok))';
  const now = data[data.length - 1];
  const badUp = m.bad > m.base || (m.bad === m.base && m.after < m.base);
  return (
    <div ref={ref} className="relative">
      <svg width={W} height={H} className="block">
        <defs><linearGradient id="stg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={col} stopOpacity=".32" /><stop offset="1" stopColor={col} stopOpacity="0" /></linearGradient></defs>
        {m.thr != null && <rect x={L} width={W - L - R} y={badUp ? T : y(m.thr)} height={badUp ? y(m.thr) - T : H - B - y(m.thr)} fill="rgb(var(--bad))" opacity=".07" />}
        {[0, 0.5, 1].map(f => <g key={f}><line x1={L} x2={W - R} y1={y(hi * f)} y2={y(hi * f)} stroke="rgb(var(--line))" strokeDasharray="2 4" /><text x={L - 6} y={y(hi * f) + 4} textAnchor="end" fontSize="10.5" fill="rgb(var(--ink3))">{(hi * f).toFixed(hi < 10 ? 1 : 0)}{m.unit.trim() === '%' ? '%' : ''}</text></g>)}
        {m.thr != null && <><line x1={L} x2={W - R} y1={y(m.thr)} y2={y(m.thr)} stroke="rgb(var(--bad))" strokeDasharray="5 4" strokeWidth="1.2" /><text x={W - R - 4} y={y(m.thr) - 5} textAnchor="end" fontSize="10.5" fill="rgb(var(--bad))">threshold {fmtV(m.thr, m)}</text></>}
        <polygon points={`${L},${H - B} ${pts} ${x(data.length - 1)},${H - B}`} fill="url(#stg)" />
        {m.thr != null ? <>
          <clipPath id="stBad"><rect x="0" width={W} y={badUp ? 0 : y(m.thr)} height={badUp ? y(m.thr) : H} /></clipPath>
          <clipPath id="stOk"><rect x="0" width={W} y={badUp ? y(m.thr) : 0} height={badUp ? H : y(m.thr)} /></clipPath>
          <polyline points={pts} fill="none" stroke="rgb(var(--bad))" strokeWidth="2" strokeLinejoin="round" clipPath="url(#stBad)" />
          <polyline points={pts} fill="none" stroke="rgb(var(--ok))" strokeWidth="2" strokeLinejoin="round" clipPath="url(#stOk)" />
        </> : <polyline points={pts} fill="none" stroke={col} strokeWidth="2" strokeLinejoin="round" />}
        {markIdx != null && markIdx >= 0 && <><line x1={x(markIdx)} x2={x(markIdx)} y1={T} y2={H - B} stroke="rgb(var(--ai))" strokeDasharray="4 3" strokeWidth="1.4" /><rect x={x(markIdx) + (x(markIdx) > W - 140 ? -(markLabel.length * 6.1 + 14) : 4)} y={H - B - 20} width={markLabel.length * 6.1 + 10} height={16} rx="3" fill="rgb(var(--ai) / .18)" /><text x={x(markIdx) + (x(markIdx) > W - 140 ? -(markLabel.length * 6.1 + 9) : 9)} y={H - B - 8} fontSize="10.5" fill="rgb(var(--ai))">{markLabel}</text></>}
        <text x={L + 10} y={T + 15} fontSize="12" fontWeight="700" fill={col}>now {fmtV(now, m)}</text>
      </svg>
    </div>
  );
}
function Spark({ data, bad }) {
  const w = 64, h = 20, lo = Math.min(...data), hi = Math.max(...data), r = hi - lo || 1;
  return <svg width={w} height={h}><polyline points={data.map((v, i) => `${(i / (data.length - 1)) * w},${h - 2 - ((v - lo) / r) * (h - 4)}`).join(' ')} fill="none" stroke={bad ? 'rgb(var(--bad))' : 'rgb(var(--ok))'} strokeWidth="1.5" /></svg>;
}

const TONE = { bad: 'text-bad', warn: 'text-warn', info: 'text-info', ok: 'text-ok', idle: 'text-ink2' };
const DOT = { bad: 'bg-bad', warn: 'bg-warn', info: 'bg-info', ok: 'bg-ok', idle: 'bg-ink3/50' };
const TAGC = { INTAKE: 'text-info', CORRELATE: 'text-ai', TICKET: 'text-[#8fa7bf]', EVIDENCE: 'text-ok', 'RULED OUT': 'text-ink3', DIAGNOSE: 'text-warn', 'PRE-CHECK': 'text-ok', DECIDE: 'text-info', APPROVAL: 'text-ai', CREDENTIAL: 'text-warn', ACT: 'text-info', VERIFY: 'text-ok', NOTIFY: 'text-[#8fa7bf]', LEARN: 'text-ai', DONE: 'text-ok', POLICY: 'text-info', STOPPED: 'text-bad', DECLINED: 'text-bad' };
const SysIcon = ({ k, size = 14 }) => { const s = SYS[k]; if (s.logo) return <Logo k={s.logo} h={size - 3} className="!px-0.5 !py-0 !border-0 shrink-0" />; const Ic = s.icon; return <span className="w-[18px] h-[18px] rounded bg-chip flex items-center justify-center shrink-0"><Ic size={size - 3} className="text-ink2" /></span>; };

// ── the stage ────────────────────────────────────────────────────────
export function DemoStage() {
  const { s } = useApp();
  const demo = s.scenario && DEMOS.find(d => d.id === s.scenario.id);
  if (!demo) return null;
  return <Stage key={s.scenario.run} demo={demo} />;
}

function Stage({ demo }) {
  const { s, act } = useApp();
  const ctxRef = useRef(null);
  if (!ctxRef.current) { const c = {}; demo.setup(c); ctxRef.current = c; }
  const c = ctxRef.current;
  const sp = useMemo(() => stageSpec(demo, c), []);
  const R = useMemo(() => buildRun(demo, sp, c), []);
  const startWall = useRef(Date.now());
  const [clk, setClk] = useState({ el: 0, res: null });
  const [speed, setSpeed] = useState(1);
  const [explain, setExplain] = useState(false);
  const [view, setView] = useState('biz');
  const spdRef = useRef(1); spdRef.current = speed;

  // clock
  useEffect(() => {
    const id = setInterval(() => setClk(k => {
      const endT = k.res ? k.res.at + (k.res.kind === 'go' ? R.endPost : R.endDecl) : Infinity;
      if (k.el > endT + 0.3) return k;
      let el = k.el + 0.1 * spdRef.current, res = k.res;
      if (!res) {
        if (R.kind === 'approve' && el >= R.gateT) el = R.gateT;
        if (R.kind === 'auto' && el >= R.gateT) res = { kind: 'go', at: R.gateT };
        if (R.kind === 'stop' && el >= R.gateT + 10) res = { kind: 'go', at: R.gateT + 10 };
      }
      return { el, res };
    }), 100);
    return () => clearInterval(id);
  }, []);

  const fired = useMemo(() => {
    const out = R.pre.filter(e => e.t <= clk.el).map(e => ({ ...e, at: e.t }));
    if (clk.res) (clk.res.kind === 'go' ? R.post : R.decl).forEach(e => { const at = clk.res.at + e.t; if (at <= clk.el) out.push({ ...e, at }); });
    return out;
  }, [clk]);
  const v = useMemo(() => fold(fired), [fired]);
  const vRef = useRef(v); vRef.current = v;

  // console side effects: replay the demo's console steps once, in step with the stage
  const doneCon = useRef(new Set());
  useEffect(() => { act.audit(`Live demo started: ${demo.title}`, c.id || '', 'Console'); }, []);
  useEffect(() => {
    const steps = demo.steps || []; const base = startWall.current - (demo.span || 600) * 1000;
    fired.forEach(e => (e.con || []).forEach(key => {
      if (doneCon.current.has(key)) return; doneCon.current.add(key);
      try {
        if (key.startsWith('pre:') || key.startsWith('post:')) { const st = steps[+key.split(':')[1]]; if (st) st.run(act, c, base + st.at * 1000); }
        else if (key === 'awaitStep') { const st = steps.find(x => x.await); if (st) st.run(act, c, Date.now()); }
        else if (key === 'await') { const st = steps.find(x => x.await); if (st) st.await.run(act, c); else act.audit(`Approved ${sp.rb}: ${sp.rbName}`, c.id || R.no, `${R.person} (${R.role})`); }
        else if (key === 'proceed') { const st = steps.find(x => x.await); if (st && c.id) act.upd('incidents', c.id, { rbState: 'done' }); act.audit(`${sp.rb} ran after the stop window closed with no objection`, c.id || R.no, 'Mova iO'); }
        else if (key === 'decline') { if (c.id && s.incidents.some(i => i.id === c.id)) { act.upd('incidents', c.id, { assignee: R.person, state: 'In Progress' }); act.note(c.id, `${R.kind === 'stop' ? 'Stopped' : 'Declined'} ${sp.rb}; engineer takes over.`, R.person); } act.audit(`${R.kind === 'stop' ? 'Stopped' : 'Declined'} ${sp.rb}`, c.id || R.no, `${R.person} (${R.role})`); }
      } catch (err) { console.warn('demo step', key, err); }
    }));
  }, [fired]);

  // metric samples
  const [samples, setSamples] = useState(() => Array.from({ length: 90 }, (_, i) => sp.m.base + jitter(sp.m, i)));
  const markRef = useRef(null); const tickN = useRef(90);
  useEffect(() => {
    const id = setInterval(() => {
      const vv = vRef.current; const m = sp.m;
      const target = vv.metric === 'base' ? m.base : vv.metric === 'bad' ? m.bad : m.after;
      const k = vv.done ? 0.55 : vv.metric === 'bad' ? 0.35 : vv.metric === 'base' ? 0.5 : 0.22;
      if (vv.mark && markRef.current == null) markRef.current = tickN.current;
      setSamples(a => { const last = a[a.length - 1]; const nx = Math.min(m.unit === '%' ? 100 : Infinity, Math.max(0, last + (target - last) * k + jitter(m, tickN.current))); tickN.current++; return [...a.slice(1), nx]; });
    }, 400);
    return () => clearInterval(id);
  }, []);
  const markIdx = markRef.current == null ? null : samples.length - 1 - (tickN.current - 1 - markRef.current);
  const nowV = samples[samples.length - 1];
  const badUp = sp.m.bad > sp.m.base || (sp.m.bad === sp.m.base && sp.m.after < sp.m.base);
  const isBad = sp.m.thr == null ? v.metric === 'bad' || v.metric === 'base' && v.ph >= 0 : badUp ? nowV > sp.m.thr : nowV < sp.m.thr;

  const restart = () => { setClk({ el: 0, res: null }); markRef.current = null; setSamples(Array.from({ length: 90 }, (_, i) => sp.m.base + jitter(sp.m, i))); };
  const approve = () => setClk(k => k.res ? k : { ...k, res: { kind: 'go', at: k.el } });
  const decline = () => setClk(k => k.res ? k : { ...k, res: { kind: 'decl', at: k.el } });
  const skip = () => setClk(k => { const res = k.res || { kind: 'go', at: R.gateT + (R.kind === 'stop' ? 10 : 0) }; return { el: res.at + (res.kind === 'go' ? R.endPost : R.endDecl) + 0.05, res }; });
  const close = () => act.set({ scenario: null });
  const idx = DEMOS.indexOf(demo), next = DEMOS[(idx + 1) % DEMOS.length];
  const openConsole = () => { const f = demo.focus ? demo.focus(c) : null; act.set(prev => ({ scenario: null, ...(f || {}), tab: { ...prev.tab, ...((f && f.tab) || {}) } })); };
  const b = c.b || (c.list && c.list[0]) || sp.b;
  useEffect(() => { const h = e => { if (e.key === 'Escape') { if (explain) setExplain(false); else close(); } }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [explain]);
  useEffect(() => { if (v.done) setExplain(true); }, [v.done]);

  const inc = c.id && s.incidents.find(i => i.id === c.id);
  const waiting = v.gate && !clk.res;
  const countdown = R.kind === 'stop' && waiting ? Math.max(0, Math.ceil(R.gateT + 10 - clk.el)) : null;
  const elapsed = clk.el;
  const status = v.done ? (v.declined ? 'Handed to a person' : sp.outcome) : waiting && R.kind === 'approve' ? 'Waiting for a person to approve.' : countdown != null ? 'A person can still stop this.' : ['Signals arriving.', 'Mova iO is reading the signals.', 'Mova iO is checking it is safe to act.', 'Mova iO is working.', 'Checking the fix worked.', 'Writing the record.'][Math.max(0, v.ph)];
  const st = v.st === 'STARTS IN' ? `STARTS IN ${countdown ?? 0} s` : v.st;
  const shownAlerts = !v.alerts ? 0 : v.alerts.st === 'stream' ? Math.min(sp.n, Math.max(1, Math.round(sp.n * (elapsed - v.alerts.at + 0.3) / 2.4))) : sp.n;
  const pri = (inc && inc.pri) || (sp.ticket && sp.ticket.pri) || 'P3';
  const group = (inc && inc.group) || (sp.ticket && sp.ticket.group) || 'Movate NOC – L2 Network';

  return (
    <div className="dark fixed inset-0 z-[80] bg-black/70 p-3" role="dialog" aria-label={`Live demo: ${demo.title}`}>
      <div className="h-full w-full rounded-xl bg-canvas text-ink border border-line flex flex-col overflow-hidden shadow-2xl relative">
        {/* header */}
        <div className="flex items-center gap-3 px-4 h-[58px] border-b border-line shrink-0">
          <span className="w-9 h-9 rounded-md border border-line flex items-center justify-center text-ink2"><I.Network size={18} /></span>
          <div className="min-w-0 flex-1"><div className="text-[16px] font-bold leading-tight truncate">{demo.title}</div><div className="text-[12px] text-ink3 truncate">{demo.area} · {sp.sub}</div></div>
          <span className={cx('hidden md:inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-[12px] font-bold border', R.kind === 'auto' ? 'text-ok border-ok/40 bg-ok/10' : R.kind === 'stop' ? 'text-info border-info/40 bg-info/10' : 'text-warn border-warn/40 bg-warn/10')}>{R.kind === 'auto' ? <I.Bot size={13} /> : R.kind === 'stop' ? <I.Eye size={13} /> : <I.Hand size={13} />}{demo.who}</span>
          <span className="hidden md:inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-[12px] font-bold bg-chip">{sp.engine === 'ansible' ? <I.ListChecks size={13} /> : <I.Braces size={13} />}{sp.engine === 'ansible' ? 'Ansible' : 'Python'}</span>
          <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-line"><span className={cx('w-2 h-2 rounded-full', v.done ? 'bg-ink3' : 'bg-ok animate-pulse')} /><span className="font-bold text-[14px] tabular">{`00:${String(Math.floor(elapsed)).padStart(2, '0')}`.replace(/^00:(\d{3,})/, (_, x) => `${Math.floor(x / 60)}:${String(x % 60).padStart(2, '0')}`)}</span><span className={cx('text-[12px] font-bold', v.done ? (v.declined ? 'text-warn' : 'text-ok') : waiting ? 'text-warn' : 'text-info')}>{st}</span></div>
          <button onClick={restart} className="h-9 px-3 rounded-md bg-brand text-white text-[13px] font-bold inline-flex items-center gap-1.5"><I.RotateCcw size={14} />{v.done ? 'Replay' : 'Restart'}</button>
          <button onClick={() => setExplain(x => !x)} className={cx('h-9 px-3 rounded-md border text-[13px] font-bold inline-flex items-center gap-1.5', explain ? 'bg-ink text-canvas border-ink' : 'border-line hover:bg-chip')}><I.BookOpen size={14} />{explain ? 'Hide explanation' : 'Explain'}</button>
          <button onClick={close} title="Close (Esc)" className="w-9 h-9 rounded-md hover:bg-chip flex items-center justify-center text-ink2"><I.X size={18} /></button>
        </div>
        {/* stepper */}
        <div className="flex items-center gap-1 px-4 h-[40px] border-b border-line shrink-0 overflow-x-auto">
          {PH.map((p, i) => { const done = v.done ? !(v.declined && i > 2 && i < 5) : i < v.ph, cur = !v.done && i === v.ph; return (
            <React.Fragment key={p}>{i > 0 && <span className={cx('w-6 md:w-10 h-px', done || cur ? 'bg-ai' : 'bg-line')} />}
              <span className={cx('inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[12.5px] font-bold whitespace-nowrap', done ? 'bg-ok/15 text-ok' : cur ? 'bg-ai/20 text-ink ring-1 ring-ai/50' : 'text-ink3')}>
                {done ? <I.CheckCircle2 size={14} /> : cur ? <I.Loader2 size={13} className="animate-spin" /> : <span className="w-4 h-4 rounded-full bg-chip text-[10px] flex items-center justify-center">{i + 1}</span>}{p}</span></React.Fragment>); })}
          <div className="flex-1" /><span className="text-[12px] text-ink3 whitespace-nowrap">{v.ph < 0 ? 'Signals arriving' : `Run ${R.sess.replace('VLT', 'RUN')} · ${sp.rb}`}</span>
        </div>
        {/* system tiles */}
        <div className="grid grid-cols-1 gap-px bg-line border-b border-line shrink-0" style={{ gridTemplateColumns: `repeat(${sp.systems.length}, minmax(0, 1fr))` }}>
          {sp.systems.map(k => { let x = v.sys[k];
            if (k === 'servicenow') x = v.tkt ? [`${R.no} · ${v.tkt.state}`, `${pri} · ${v.tkt.acts.length} work note${v.tkt.acts.length === 1 ? '' : 's'}`, v.tkt.state === 'Resolved' ? 'ok' : 'info'] : ['No ticket yet', 'one per event', 'idle'];
            if (k === 'audit') x = v.aud.length ? [`${v.aud.length} entr${v.aud.length === 1 ? 'y' : 'ies'}`, v.aud[v.aud.length - 1], 'ok'] : ['0 entries', 'records every action', 'idle'];
            if (!x) x = k === 'vault' ? ['Vault locked', sp.cred === false ? 'not needed for this run' : 'one-time credential per run', 'idle'] : k === 'teams' ? ['Nothing sent', sp.audience, 'idle'] : k === 'movaio' ? ['Idle', 'watching', 'idle'] : k === 'carrier' ? ['No case', sp.carrier || '', 'idle'] : k === 'field' ? ['No visit', 'technicians on call', 'idle'] : k === 'git' ? ['No change', 'main', 'idle'] : ['Watching', '', 'idle'];
            const cnt = k === 'servicenow' ? (v.tkt ? v.tkt.acts.length : 0) : k === 'audit' ? v.aud.length : v.cnt[k] || 0;
            return (
              <div key={k} className={cx('bg-panel px-2.5 py-2 min-w-0 transition-colors', x[2] !== 'idle' && 'bg-chip/40')}>
                <div className="flex items-center gap-1.5 text-[11.5px] text-ink2 min-w-0"><SysIcon k={k} /><span className="truncate font-semibold" title={SYS[k].n}>{k === 'carrier' && sp.carrier ? `${sp.carrier} portal` : SYS[k].s || SYS[k].n}</span><span className="flex-1" />{cnt > 0 && <span className="text-[10.5px] bg-chip rounded px-1 tabular">{cnt}</span>}<span className={cx('w-2 h-2 rounded-full shrink-0', DOT[x[2]])} /></div>
                <div className="flex items-end gap-2 mt-1"><div className="min-w-0 flex-1"><div className={cx('text-[13px] font-bold truncate', TONE[x[2]])}>{x[0]}</div><div className="text-[11px] text-ink3 truncate font-mono">{x[1] || ' '}</div></div>
                  {k === sp.src && v.ph >= 0 && <Spark data={samples.slice(-30)} bad={isBad} />}
                  {k === 'movaio' && x[3] != null && <div className="flex gap-[2px] mb-1">{Array.from({ length: 8 }, (_, i) => <span key={i} className={cx('w-1.5 h-3 rounded-[1px]', i < Math.round(x[3] * 8) ? 'bg-info' : 'bg-line')} />)}</div>}</div>
              </div>); })}
        </div>
        {/* business strip */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-x-5 gap-y-1 px-4 py-2 border-b border-line shrink-0 text-[12.5px] leading-[17px]">
          {[['The problem', demo.story.problem, 'text-info'], ['Impact', demo.story.impact, 'text-warn'], [v.done && !v.declined ? 'Protected' : 'At risk', sp.risk, v.done && !v.declined ? 'text-ok' : 'text-bad'], [v.done && !v.declined ? 'Result' : 'Expected result', sp.result, 'text-ok']].map(([k, t, tc]) => <div key={k} className="min-w-0"><div className={cx('text-[11px] font-bold uppercase tracking-wide', tc)}>{k}</div><div className="line-clamp-2 text-ink" title={t}>{t}</div></div>)}
        </div>
        {/* gate bar */}
        {waiting && R.kind === 'approve' && <div className="flex items-center gap-3 px-4 py-2 bg-warn/10 border-b border-warn/40 shrink-0">
          <I.Hand size={18} className="text-warn" /><div className="flex-1 text-[13px]"><span className="font-bold">Human-in-the-loop: approval needed from {R.role}.</span> <span className="text-ink2">{sp.why} {/%/.test(sp.why) ? '' : `Confidence ${pct(sp.conf)} · `}Risk {sp.risk_} · undo: {sp.tech.undo}.</span></div>
          <button onClick={decline} className="h-8 px-3 rounded-md border border-line text-[13px] font-bold hover:bg-chip">Decline</button>
          <button onClick={approve} className="h-8 px-3 rounded-md bg-ok text-white text-[13px] font-bold inline-flex items-center gap-1.5"><I.Check size={14} />Approve as {R.role}</button></div>}
        {countdown != null && <div className="flex items-center gap-3 px-4 py-2 bg-info/10 border-b border-info/40 shrink-0">
          <I.Timer size={18} className="text-info" /><div className="flex-1 text-[13px]"><b>Human-on-the-loop.</b> Mova iO runs this in <b>{countdown} s</b> unless someone stops it. <span className="text-ink2">{sp.why} In production the stop window is 5 minutes; the demo shortens it.</span></div>
          <button onClick={decline} className="h-8 px-3 rounded-md border border-bad/60 text-bad text-[13px] font-bold inline-flex items-center gap-1.5"><I.OctagonX size={14} />Stop</button></div>}
        {/* body */}
        <div className="flex-1 min-h-0 relative"><div className="grid-cols-1 h-full grid lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.94fr)_minmax(0,1.02fr)] gap-3 p-3 overflow-y-auto lg:overflow-hidden">
          {/* left: telemetry */}
          <div className="flex flex-col gap-3 min-h-0 min-w-0 lg:overflow-y-auto stage-col">
            <div className="rounded-lg border border-line bg-panel p-3">
              <div className="flex items-center gap-2 text-[12.5px] mb-1 min-w-0"><SysIcon k={sp.src} /><span className="font-bold whitespace-nowrap">{SYS[sp.src].n}</span><span className="text-ink3 truncate">live · {(SRCI[sp.src] || ['live'])[0].toLowerCase()}</span><span className="flex-1" /><span className="inline-flex items-center gap-1 text-[11px] font-bold text-ok whitespace-nowrap"><span className="w-1.5 h-1.5 rounded-full bg-ok animate-pulse" />LIVE</span></div>
              <div className="flex items-center text-[13px] font-bold mt-1"><span className="flex-1">{sp.panel}</span><span className="text-[11px] text-ink3 font-normal">last 36 s</span></div>
              <StageChart data={samples} m={sp.m} markIdx={markIdx} markLabel={v.mark ? v.mark.label : ''} bad={isBad} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[['Alerts firing', v.alerts && v.alerts.st === 'cleared' ? 0 : shownAlerts, v.alerts && v.alerts.st === 'cleared' ? 'all cleared' : v.alerts && v.alerts.st === 'tracked' ? `tracked in ${R.no}` : `of ${sp.n} raw`, v.alerts && v.alerts.st === 'cleared' ? 'text-ok' : shownAlerts ? 'text-bad' : 'text-ink'],
                ['State', st, sp.rb, v.done ? (v.declined ? 'text-warn' : 'text-ok') : waiting ? 'text-warn' : 'text-ai'],
                ['Now', fmtV(nowV, sp.m), `was ${fmtV(sp.m.base, sp.m)}${sp.m.thr != null ? ` · threshold ${fmtV(sp.m.thr, sp.m)}` : ''}`, isBad ? 'text-bad' : 'text-ok']].map(([k, val, sub, tc]) => (
                <div key={k} className="rounded-lg border border-line bg-panel px-3 py-2 min-w-0"><div className="text-[12px] text-ink2">{k}</div><div className={cx('font-bold tabular truncate', tc, k === 'State' ? 'text-[15px] mt-1' : 'text-[24px] leading-tight')}>{val}</div><div className="text-[11px] text-ink3 truncate">{sub}</div></div>))}
            </div>
            <AlertList sp={sp} v={v} shown={shownAlerts} no={R.no} />
          </div>
          {/* middle: runbook + terminal */}
          <div className="flex flex-col gap-3 min-h-0 min-w-0 lg:overflow-y-auto stage-col">
            <CodePanel sp={sp} v={v} running={v.ph === 3} />
            <Terminal lines={v.term} />
          </div>
          {/* right: decisions + ticket */}
          <div className="flex flex-col gap-3 min-h-0 min-w-0 lg:overflow-y-auto stage-col">
            <Decisions logs={v.logs} start={startWall.current} />
            <TicketCard no={R.no} kind={(sp.ticket && sp.ticket.kind) || 'Incident'} title={demo.title} pri={pri} group={group} assignee={v.declined ? R.person : 'Mova iO'} ci={sp.host} tkt={v.tkt} start={startWall.current} onOpen={c.id && !DEMOS_ONLY ? openConsole : null} />
          </div>
        </div>
        {explain && <div className="force-light absolute right-3 top-3 bottom-3 w-[min(520px,calc(100%-24px))] bg-panel text-ink rounded-lg shadow-2xl border border-line flex flex-col z-10">
          <div className="flex items-center gap-2 px-4 h-12 border-b border-line shrink-0"><I.BookOpen size={16} /><span className="font-bold text-[14px] flex-1">How this works</span><button onClick={() => setExplain(false)} aria-label="Close explanation" className="w-8 h-8 rounded-md hover:bg-chip flex items-center justify-center"><I.X size={16} /></button></div>
          <div className="px-4 pt-3 shrink-0"><ViewToggle view={view} setView={setView} /></div>
          <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3"><ExplainBody demo={demo} sp={sp} c={c} view={view} measured={v.done && !v.declined} inc={inc} /></div>
        </div>}
        </div>
        {/* footer */}
        <div className="flex items-center gap-4 px-4 h-[48px] border-t border-line shrink-0 text-[13px] overflow-x-auto">
          {v.done ? <>
            <span className={cx('inline-flex items-center gap-1.5 font-bold whitespace-nowrap', v.declined ? 'text-warn' : 'text-ok')}>{v.declined ? <I.UserCheck size={16} /> : <I.CheckCircle2 size={16} />}{v.declined ? 'Handed to a person' : sp.outcome}</span>
            {!v.declined && <span className="whitespace-nowrap text-ink2">{sp.mLabel} <b className="text-bad">{fmtV(sp.m.bad, sp.m)}</b> → <b className="text-ok">{fmtV(sp.m.after, sp.m)}</b></span>}
            <span className="whitespace-nowrap text-ink2">Alerts <b className="text-ink">{sp.n}</b> → <b className="text-ink">1 ticket</b></span>
            <span className="whitespace-nowrap text-ink2">People needed <b className="text-ink">{v.declined ? R.person : R.kind === 'approve' ? `1 approval (${R.role})` : 'none'}</b></span>
            <span className="whitespace-nowrap text-ink2">Demo run <b className="text-ink">{Math.round(elapsed)} s</b></span>
            <div className="flex-1" />
            {!DEMOS_ONLY && b && b.id && !['cve', 'eol', 'fw', 'cutover', 'storm'].includes(demo.id) && <button onClick={() => act.set({ scenario: null, module: 'b360', b360: b.id })} className="h-8 px-3 rounded-md border border-line font-bold whitespace-nowrap hover:bg-chip inline-flex items-center gap-1.5"><I.Store size={14} />Branch 360</button>}
            {DEMOS_ONLY
              ? <a href={`${CONSOLE_URL}#${(demo.focus && demo.focus(c).module) || 'overview'}`} target="_blank" rel="noopener" className="h-8 px-3 rounded-md border border-line font-bold whitespace-nowrap hover:bg-chip inline-flex items-center gap-1.5"><I.ArrowUpRight size={14} />Open the console</a>
              : <button onClick={openConsole} className="h-8 px-3 rounded-md border border-line font-bold whitespace-nowrap hover:bg-chip inline-flex items-center gap-1.5"><I.ArrowUpRight size={14} />Open in console</button>}
            <button onClick={() => act.set({ scenario: { id: next.id, run: Date.now() } })} className="h-8 px-3 rounded-md bg-brand text-white font-bold whitespace-nowrap inline-flex items-center gap-1.5">Next demo<I.ChevronRight size={14} /></button>
          </> : <>
            <I.Loader2 size={15} className={cx('text-ink3', !waiting && 'animate-spin')} /><span className="text-ink2">{status}</span>
            {sp.tech.note && <span className="text-ink3 text-[12px] hidden md:inline">{sp.tech.note}</span>}
            <div className="flex-1" />
            <span className="text-[12px] text-ink3">Demo {idx + 1} of {DEMOS.length}</span>
            <div className="inline-flex h-8 rounded-md border border-line overflow-hidden" role="group" aria-label="Demo speed">{[1, 2, 5, 10].map(x => <button key={x} onClick={() => setSpeed(x)} aria-pressed={speed === x} className={cx('px-2.5 font-bold text-[12.5px] border-l border-line first:border-l-0', speed === x ? 'bg-ink text-canvas' : 'text-ink2 hover:bg-chip')}>{x}×</button>)}</div>
            <button onClick={skip} className="h-8 px-3 rounded-md border border-line font-bold hover:bg-chip inline-flex items-center gap-1.5 whitespace-nowrap"><I.SkipForward size={14} />Skip to end</button>
          </>}
        </div>
      </div>
    </div>
  );
}
function jitter(m, i) { const amp = Math.abs(m.bad - m.base || m.after - m.base || 1) * 0.025; return Math.sin(i * 1.7) * amp + Math.sin(i * 0.53) * amp * 0.6; }

function AlertList({ sp, v, shown, no }) {
  const rows = Array.from({ length: Math.min(shown, 26) }, (_, i) => { const a = sp.alerts[i % sp.alerts.length]; const k = Math.floor(i / sp.alerts.length); return { a, inst: sp.n > sp.alerts.length ? k + 1 : null }; });
  const cleared = v.alerts && v.alerts.st === 'cleared', grouped = v.alerts && v.alerts.st !== 'stream';
  return (
    <div className="rounded-lg border border-line bg-panel flex flex-col min-h-[112px] flex-1 overflow-hidden">
      <div className="flex items-center gap-2 px-3 h-9 border-b border-line text-[12.5px] shrink-0"><span className="font-bold">{SYS[sp.src].n} alerts</span><span className="text-ink3">· {rows.length} shown of {sp.n}</span><span className="flex-1" />{grouped && <span className="text-[11px] font-bold text-ai bg-ai/15 rounded px-1.5 py-0.5">→ {no}</span>}</div>
      <div className="flex-1 overflow-y-auto">
        {!rows.length && <div className="p-4 text-[12.5px] text-ink3">No alerts yet. Signals arrive when the demo starts.</div>}
        {rows.map(({ a, inst }, i) => (
          <div key={i} className="flex items-center gap-2 px-3 h-[27px] border-b border-line/50 text-[12px] feed-in">
            <span className={cx('w-1.5 h-1.5 rounded-full shrink-0', cleared ? 'bg-ok' : a[0] === 'CRITICAL' ? 'bg-bad' : a[0] === 'WARNING' ? 'bg-warn' : 'bg-info')} />
            <span className={cx('w-[64px] text-[10.5px] font-bold shrink-0', cleared ? 'text-ok' : a[0] === 'CRITICAL' ? 'text-bad' : a[0] === 'WARNING' ? 'text-warn' : 'text-info')}>{cleared ? 'CLEARED' : a[0]}</span>
            <SysIcon k={a[2]} size={13} />
            <span className="truncate flex-1">{a[1]}</span>
            <code className="text-[11px] text-ink3 truncate max-w-[34%]">{a[3]}{inst ? ` · instance ${inst}` : ''}</code>
            <span className={cx('text-[11px] font-bold w-[52px] text-right shrink-0', cleared ? 'text-ok' : 'text-bad')}>{cleared ? 'ok' : a[4]}</span>
            <span className={cx('text-[10.5px] rounded px-1 w-[50px] text-center shrink-0', cleared ? 'text-ok' : grouped ? 'bg-ai/15 text-ai' : 'text-ink3')}>{cleared ? '' : grouped ? 'grouped' : 'new'}</span>
          </div>))}
      </div>
    </div>
  );
}

function codeOf(sp) {
  const L = [], marks = [];
  if (sp.engine === 'ansible') {
    L.push(`# Mova iO runbook ${sp.rb}: ${sp.rbName}`, `- name: ${sp.rbName}`, `  hosts: ${sp.host}`, '  gather_facts: false', '  tasks:');
    sp.tasks.forEach(([n, , cl]) => { L.push(''); marks.push(L.length); L.push(`    - name: ${n}`); (cl || []).forEach(x => L.push('      ' + x)); });
  } else {
    L.push(`# Mova iO runbook ${sp.rb}: ${sp.rbName}`, 'from mova.connectors import orchestrator, central, servicenow, carrier, dispatch, teams', '', `TARGET = "${sp.host}"`, '', 'def run(ctx):');
    sp.tasks.forEach(([n, , cl], i) => { if (i) L.push(''); marks.push(L.length); L.push(`    # Step ${i + 1}: ${n}`); (cl || []).forEach(x => L.push('    ' + x)); });
  }
  return { L, marks };
}
function CodePanel({ sp, v, running }) {
  const { L, marks } = useMemo(() => codeOf(sp), [sp]);
  const box = useRef(null);
  const cur = [...v.ticks].length; const curLine = marks[Math.min(cur, marks.length - 1)];
  useEffect(() => { const el = box.current && box.current.querySelector(`[data-ln="${curLine}"]`); if (el && running) el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, [cur, running]);
  const stateTxt = v.ph >= 5 || v.done ? (v.declined ? 'NOT RUN' : 'FINISHED') : v.ph === 3 || v.ph === 4 ? 'RUNNING' : 'READY';
  return (
    <div className="rounded-lg border border-line bg-panel flex flex-col min-h-[220px] flex-[1.15] overflow-hidden">
      <div className="flex items-center gap-2 px-3 h-9 border-b border-line text-[12px] shrink-0"><span className="inline-flex items-center gap-1 font-bold bg-chip rounded px-1.5 py-0.5">{sp.engine === 'ansible' ? <I.ListChecks size={12} /> : <I.Braces size={12} />}{sp.engine === 'ansible' ? 'Ansible' : 'Python'}</span><code className="text-ink2 truncate">{sp.file}</code><span className="flex-1" /><span className={cx('text-[11px] font-bold', stateTxt === 'RUNNING' ? 'text-info' : stateTxt === 'FINISHED' ? 'text-ok' : 'text-ink3')}>{stateTxt}</span></div>
      <div ref={box} className="flex-1 overflow-auto py-1"><pre className="text-[12px] leading-[19px]">{L.map((ln, i) => { const ti = marks.indexOf(i); const done = ti >= 0 && v.ticks.has(ti); const active = ti >= 0 && running && ti === cur; return (
        <div key={i} data-ln={i} className={cx('flex pr-3', active && 'bg-info/10')}><span className={cx('w-9 text-right pr-2 select-none shrink-0', done ? 'text-ok' : 'text-ink3/70')}>{done ? '✓' : i + 1}</span><span className={cx('whitespace-pre', ln.trim().startsWith('#') ? 'text-ink3' : ti >= 0 ? 'text-ink font-bold' : 'text-ink2')}>{ln || ' '}</span></div>); })}</pre></div>
    </div>
  );
}
function Terminal({ lines }) {
  const box = useRef(null);
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [lines.length]);
  return (
    <div className="rounded-lg border border-line bg-[#0b0c0d] flex flex-col min-h-[110px] flex-1 overflow-hidden">
      <div className="flex items-center gap-1.5 px-3 h-8 border-b border-line text-[11.5px] text-ink3 shrink-0"><span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" /><span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" /><span className="w-2.5 h-2.5 rounded-full bg-[#28c840]" /><code className="ml-2">mova@runner-dc1:~/runbooks</code></div>
      <div ref={box} className="flex-1 overflow-y-auto px-3 py-2"><pre className="text-[12px] leading-[18px] whitespace-pre-wrap">{lines.map((l, i) => <div key={i} className={l.startsWith('$') ? 'text-white' : l.startsWith('#') ? 'text-[#8b949e]' : l.startsWith('TASK') || l.startsWith('[') ? 'text-[#79c0ff]' : l.startsWith('changed') || l.startsWith('  ->') ? 'text-[#e3b341]' : l.startsWith('verify') ? 'text-[#56d364]' : 'text-[#c9d1d9]'}>{l}</div>)}<span className="inline-block w-2 h-3.5 bg-[#79c0ff] align-middle animate-pulse" /></pre></div>
    </div>
  );
}
function Decisions({ logs, start }) {
  const box = useRef(null);
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [logs.length]);
  return (
    <div className="rounded-lg border border-line bg-panel flex flex-col min-h-[200px] flex-1 overflow-hidden">
      <div className="flex items-center gap-2 px-3 h-9 border-b border-line text-[12.5px] shrink-0"><span className="font-bold flex-1">Mova iO decisions</span><Logo k="movaio" h={12} className="!py-0" /></div>
      <div ref={box} className="flex-1 overflow-y-auto px-3 py-1.5 space-y-1">{logs.map((l, i) => (
        <div key={i} className={cx('grid grid-cols-[58px_minmax(0,1fr)] gap-2 text-[12px] leading-[16px] py-0.5 px-1 rounded', i === logs.length - 1 && 'bg-ai/10 feed-in')}>
          <code className="text-ink3 text-[11px] leading-[16px]">{hhmmss(start + l.at * 1000)}</code><span className="text-ink"><code className={cx('text-[10.5px] font-bold mr-1.5', TAGC[l.tag] || 'text-ink2')}>{l.tag}</code>{l.text}</span></div>))}
        {!logs.length && <div className="text-[12.5px] text-ink3 py-2">Waiting for signals.</div>}</div>
    </div>
  );
}
function TicketCard({ no, kind, title, pri, group, assignee, ci, tkt, start, onOpen }) {
  return (
    <div className="force-light rounded-lg border border-line bg-panel text-ink flex flex-col min-h-[220px] flex-1 overflow-hidden">
      <div className="flex items-center gap-2 px-3 h-10 bg-[#293e40] text-white shrink-0"><span className="font-bold text-[14px] tracking-tight">servicenow</span><code className="text-[12px] text-white/80">{tkt ? no : ''}</code><span className="flex-1" />{tkt && <span className={cx('text-[11px] font-bold rounded px-1.5 py-0.5 whitespace-nowrap', tkt.state === 'Resolved' ? 'bg-[#62d84e] text-black' : tkt.state === 'New' ? 'bg-white text-[#293e40]' : 'bg-[#81b5a1] text-black')}>{tkt.state}</span>}</div>
      {!tkt ? <div className="flex-1 flex items-center justify-center text-[12.5px] text-ink3 p-4 text-center">No ticket yet. Mova iO opens one ticket for the whole event, not one per alert.</div> : <>
        <div className="px-3 py-2 border-b border-line shrink-0"><div className="text-[13.5px] font-bold leading-snug">{title}</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[12px] mt-1.5"><span className="text-ink3">{kind} <b className="text-ink">{no}</b></span><span className="text-ink3">Priority <b className="text-ink">{pri}</b></span><span className="text-ink3 truncate">Group <b className="text-ink">{group}</b></span><span className="text-ink3">Assigned <b className="text-ink">{assignee}</b></span><span className="text-ink3 col-span-2 truncate">CI <code className="text-ink">{ci}</code></span></div></div>
        <div className="text-[10.5px] font-bold text-ink3 px-3 pt-2 tracking-wide shrink-0">ACTIVITY · NEWEST FIRST</div>
        <div className="flex-1 overflow-y-auto px-3 py-1 space-y-1.5">{tkt.acts.map((a, i) => <div key={tkt.acts.length - i} className={cx('border-l-2 pl-2 text-[12px] leading-[16px]', i === 0 ? 'border-[#293e40] feed-in' : 'border-line')}><div><code className="text-ink3 text-[11px]">{hhmmss(start + a.at * 1000)}</code> <b>{a.who}</b></div><div className="text-ink2">{a.text}</div></div>)}</div>
        {onOpen && <div className="px-3 py-2 border-t border-line shrink-0"><button onClick={onOpen} className="h-7 px-2.5 rounded border border-line text-[12px] font-bold hover:bg-chip">Open the ticket in the console</button></div>}</>}
    </div>
  );
}

// ── explanation (shared with the Live demos page) ────────────────────
export function ViewToggle({ view, setView }) {
  return <div className="inline-flex rounded-md bg-chip p-0.5 text-[12.5px] font-bold" role="group" aria-label="View">{[['biz', 'Business view'], ['tech', 'Technical view']].map(([k, l]) => <button key={k} aria-pressed={view === k} onClick={() => setView(k)} className={cx('h-7 px-3 rounded', view === k ? 'bg-panel shadow-sm text-ink' : 'text-ink2')}>{l}</button>)}</div>;
}
const H5 = ({ children }) => <div className="text-[12px] font-bold text-brand mt-4 mb-1.5">{children}</div>;
const Li = ({ children }) => <li className="flex gap-2 text-[12.5px] leading-[18px]"><span className="w-1.5 h-1.5 rounded-full bg-ink3 mt-[6px] shrink-0" /><span>{children}</span></li>;
export function ExplainBody({ demo, sp, c, view, measured, inc }) {
  const kind = gateOf(demo), role = roleOf(demo, sp);
  const no = (sp.ticket && sp.ticket.no) || (c.id && !c.preview ? c.id : null);
  const recs = [no ? `ServiceNow ${no}` : 'ServiceNow incident', sp.systems.includes('carrier') && `${sp.carrier} case${inc && inc.carrierCase ? ` ${inc.carrierCase}` : ''}`, sp.systems.includes('field') && `work order${inc && inc.workOrder ? ` ${inc.workOrder}` : ''}`, sp.systems.includes('git') && 'Network-as-Code commit', `Teams card to ${sp.audience}`, 'Mova iO audit log'].filter(Boolean);
  const srcs = sp.systems.filter(k => SRCI[k] && (OBS.has(k) || sp.alerts.some(a => a[2] === k)));
  if (view === 'tech') { const t = sp.tech; return (
    <div className="text-ink">
      <div className="text-[12.5px]"><b>Runs on:</b> {sp.engine === 'ansible' ? 'Ansible' : 'Python'} on the Mova iO runner · <code>{sp.file}</code> · target <code>{sp.host}</code></div>
      <H5>1. Where the data comes from</H5>
      <div className="space-y-1.5">{srcs.map(k => <div key={k} className="rounded-md border border-line px-2.5 py-1.5"><div className="flex items-center gap-1.5 text-[12.5px] font-bold"><SysIcon k={k} />{SYS[k].n}<span className="ml-auto text-[11px] font-normal text-ink3">{SRCI[k][0]}</span></div><div className="text-[12px] mt-0.5">{SRCI[k][1]}</div><div className="text-[11.5px] text-ink3">{SRCI[k][2]}</div></div>)}</div>
      <H5>2. The alert and its threshold</H5>
      <ul className="space-y-1"><Li><b>Rule:</b> {t.rule}.</Li><Li><b>Reading:</b> {t.reading}</Li><Li><b>Must hold for:</b> {t.hold}</Li><Li><b>Threshold kept in:</b> {t.home}</Li><Li><b>Seen in:</b> {t.seen.join(', ')}</Li></ul>
      <H5>3. How it is confirmed</H5>
      <ul className="space-y-1">{t.confirm.map(x => <Li key={x}>{x}</Li>)}</ul>
      <H5>4. How the action is taken</H5>
      <div className="text-[12.5px] leading-[18px]">{t.how}</div>
      <div className="text-[12.5px] mt-1"><b>Credential:</b> {t.credential}.</div>
      <ol className="mt-1.5 space-y-1">{sp.tasks.map(([n, , cl], i) => <li key={i} className="flex gap-2 text-[12px] leading-[16px]"><span className="w-4 h-4 rounded-full border border-line text-[10px] font-bold flex items-center justify-center shrink-0 mt-px">{i + 1}</span><span>{n}{cl && cl[0] && <span className="text-ink3"> · <code className="text-[11px]">{cl[0].replace(/:$/, '')}</code></span>}</span></li>)}</ol>
      <div className="text-[12.5px] mt-1.5"><b>Undo:</b> {t.undo}.</div>
      <H5>5. How it is checked</H5>
      <ul className="space-y-1">{t.checks.map(x => <Li key={x}>{x}</Li>)}</ul>
      <H5>6. Control mode</H5>
      <div className="text-[12.5px] leading-[18px]"><b>This run: {demo.who}{kind === 'approve' ? ` (${role})` : ''}.</b> {sp.why}</div>
      <ModeRules className="mt-2" />
      {t.note && <div className="text-[12px] text-ink3 mt-3">{t.note}</div>}
    </div>); }
  return (
    <div className="text-ink">
      <div className="rounded-md border border-ai/30 bg-ai/5 p-3 space-y-1.5 text-[12.5px] leading-[18px]">
        <div><b>The problem:</b> {demo.story.problem}</div>
        <div><b>Impact:</b> {demo.story.impact}</div>
        <div><b>{measured ? 'Protected' : 'At risk'}:</b> {sp.risk}</div>
        <div><b>Services:</b> {sp.services.join(', ')}</div>
        <div><b>Result:</b> {sp.result}{measured && <> Measured: {sp.mLabel} {fmtV(sp.m.bad, sp.m)} → {fmtV(sp.m.after, sp.m)}.</>}</div>
      </div>
      <ol className="mt-3 space-y-2">{[['Summary', demo.story.problem], ['Root cause', `${sp.cause} (${pct(sp.conf)} confidence).`], ['Actions taken', sp.tasks.map(x => x[0]).join('; ') + '.'], ['Records', recs.join(', ') + '.'], ['Resolution', demo.story.resolution]].map(([k, t], i) => (
        <li key={k} className="flex gap-2.5 text-[12.5px] leading-[18px]"><span className="w-5 h-5 rounded-full bg-ink text-canvas text-[11px] font-bold flex items-center justify-center shrink-0">{i + 1}</span><span><b>{k}:</b> {t}</span></li>))}</ol>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
        <div className="rounded-md border border-line p-2.5"><div className="text-[12px] font-bold mb-1">How Mova iO knows</div><ul className="space-y-1">{sp.evidence.map(x => <li key={x} className="flex gap-2 text-[12px] leading-[16px]"><span className="w-1.5 h-1.5 rounded-full bg-ok mt-[5px] shrink-0" />{x}</li>)}</ul></div>
        <div className="rounded-md border border-line p-2.5"><div className="text-[12px] font-bold mb-1">What was ruled out</div><ul className="space-y-1">{sp.ruled.map(x => <li key={x} className="flex gap-2 text-[12px] leading-[16px]"><span className="w-1.5 h-1.5 rounded-full bg-ink3 mt-[5px] shrink-0" />{x}</li>)}</ul></div>
      </div>
      <div className="rounded-md border border-line p-2.5 mt-2 text-[12.5px] leading-[18px]"><b>Control mode: {demo.who}{kind === 'approve' ? ` (${role})` : ''}.</b> {MODE_TEXT[kind]} {sp.why}</div>
      <div className="text-[12px] text-ink2 mt-3">Runbook <b className="text-ink">{sp.rb}</b> · {sp.rbName} · risk {sp.risk_} · undo: {sp.tech.undo}</div>
    </div>
  );
}

export const MODE_TEXT = {
  auto: 'Mova iO acts on its own inside a policy that people set, and every action is logged for review. People stay over the loop: they own the policy and audit the results.',
  stop: 'Mova iO starts the action on its own, but a person watches it live and can stop it during the stop window or roll it back afterwards.',
  approve: 'Mova iO prepares the evidence and the plan, then waits. Nothing changes until a named person approves.',
};
export const MODE_RULES = [
  ['Autonomous', 'auto', I.Bot, 'Safe, tested fixes that are easy to undo, such as switching to a healthy backup line, restarting an access point that is already down, or re-running a failed backup.'],
  ['Human-on-the-loop', 'stop', I.Eye, 'Routine changes that are already approved, such as the monthly patch wave or turning on a switch port from the catalog.'],
  ['Human-in-the-loop', 'approve', I.Hand, 'An unsure diagnosis, firmware or security changes, work on a branch that is trading, or anything that costs money, such as sending a technician.'],
];
export function ModeRules({ className }) {
  return <div className={cx('space-y-1.5', className)}>{MODE_RULES.map(([n, k, ic, t]) => { const Ic = ic; return <div key={n} className="flex gap-2 text-[12px] leading-[16px]"><Ic size={14} className={cx('shrink-0 mt-px', k === 'auto' ? 'text-ok' : k === 'stop' ? 'text-info' : 'text-warn')} /><span><b>{n}:</b> {t}</span></div>; })}</div>;
}
