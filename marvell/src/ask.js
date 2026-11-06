// Ask Mova iO: answers questions from the same live data every screen shows. An answer is a title, an optional
// lead sentence and a list of blocks (kpis, table, bars, layers, timeline, list, text, spark) that the Ask panel
// draws; `copy` is plain text the panel offers to copy. Branches are numbered 1 to 900 (Branch 214 is BR-0214);
// "Store 214" and the old city-wise labels ("Tampa #2") are accepted too.
import * as D from './data.js';
import { healthOf, circuitOf, branchClock, slaClock, onBackupOf } from './store.jsx';
import { branchChecks } from './readiness.jsx';
import { dur, hhmm, ago, dt, dateShort, MIN, HR, DAY, pct, num, tzAbbr, parts, sum } from './util.js';

// The ten questions, in the order that tells the story: see the problem, understand it, it fixed itself,
// the scorecard, what is coming, the report. The other four follow.
export const STORY = [
  'Which stores are down or degraded right now?',
  'Why was Store 214 slow this morning: network, ISP, or application?',
  'Which incidents were auto-remediated this week, and what was done?',
  'What was network uptime and MTTR last month vs. target?',
  'Which sites will hit bandwidth or Wi-Fi capacity limits in the next 90 days?',
  "Summarize last week's incidents for my leadership report.",
];
export const MORE = [
  'Which stores are running on backup ISP only?',
  'What changed at Store 118 in the last 24 hours?',
  'Show top bandwidth users at Store 45 yesterday.',
  'Which ISP circuits are flapping or breaching SLA this month?',
];
export const CANNED = {
  noc: ['What failed overnight?', 'Which incidents are close to breaching SLA?', 'Which approvals are waiting on a human?', 'Which incidents are not acknowledged?'],
  l3: ['Which carriers breached this week?', 'Where is config drift?', 'What changes are scheduled in the next 72 hours?', 'Firmware compliance by model'],
  storeops: ['Which branches are not ready to open?', `Is ${D.findBranch('Dallas').name} ready to open?`, 'Which branches are on backup and slower?', 'What did we tell branches today?'],
  bm: ['Is my branch ready to open?', 'Why is anything slow at my branch?', 'When is the technician arriving?', 'Any changes planned at my branch?'],
  tech: ['What are my jobs today?', 'Which spares are in my depot?', 'Which branch hours limit my visits?', 'Unassigned work near me'],
  mna: ["Status of this weekend's acquisition cutovers", 'Which onboarding projects are red?', 'Is the newest branch at Day-1 parity?', 'How many acquisitions are in flight?'],
  sec: ['Which devices have a critical CVE?', 'High-severity config drift', 'Is the PCI segment isolated at the cutover site?', 'Who approved changes today?'],
};
export const TOPICS = ['Stores and regions', 'Incidents and SLAs', 'Lines and carriers', 'Devices, firmware and CVEs', 'Changes, drift and approvals', 'Field visits and spares', 'Predictions and capacity', 'Automation and agents', 'Knowledge and problems', 'Branch-in-a-Box projects'];

const L = (label, module, extra = {}) => ({ label, module, extra });
const sn = b => b.name;
const sb = b => `${sn(b)}, ${b.brand}`;
const lt = (t, b) => `${hhmm(t, b.tz)} ${tzAbbr(b.tz)}`;
const ct = t => `${hhmm(t)} CT`;
const P = (x, d = 1) => `${(x * 100).toFixed(d)}%`;
const money = v => `$${num(Math.round(v))}`;
const allInc = s => [...s.incidents, ...s.resolved];
const brOf = id => D.BR[id];
const branchLink = b => L(`Branch 360: ${b.name}`, 'b360', { b360: b.id });
const tbl = (cols, rows) => ({ type: 'table', cols, rows });
const kpis = items => ({ type: 'kpis', items });
const text = (t, tone) => ({ type: 'text', text: t, tone });
const list = items => ({ type: 'list', items });
const bars = (items, opts = {}) => ({ type: 'bars', items, ...opts });

// ── reading a typed question ─────────────────────────────────────────
// People type fast: a word one or two letters off a known term is read as that term ("brach" → "branch").
const VOCAB = 'branch branches store stores site sites location down degraded offline outage outages unhealthy impacted affected problems issues broken backup primary secondary failover failed lte isp circuit circuits line lines carrier carriers slow slowness why root cause network application changed change changes configuration bandwidth traffic talkers users netflow flapping flaps breaching breach breached credits remediated remediation automatically fixed healed resolved uptime availability mttr restore capacity limits forecast summarize summary summarise leadership report incidents incident yesterday morning week weekly month monthly target targets approvals approval drift firmware technician technicians spares depot predictions runbook runbooks knowledge devices device switches access points readiness ready open closed opened scheduled overnight acknowledged breaching vulnerabilities vulnerability lifecycle support warranty region regions brand performance happening happened problem record records caused case cases'.split(' ');
// real words that sit one or two letters from a term above; they are never "corrected"
const KEEP = new Set('close closes reach reached approve approved approver backups credit breaches stored sited lined chance charge range stage state sides slows'.split(' '));
function lev(a, b) { const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1), i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1] ? d[i - 2][j - 2] + 1 : 99); return d[a.length][b.length]; }
export function normalize(q) {
  return q.toLowerCase().replace(/[’']/g, "'").replace(/[a-z][a-z-]{4,}/g, w => {
    if (VOCAB.includes(w) || KEEP.has(w) || /^(?:what|which|where|when|with|this|that|them|they|have|from|were|will|right|there|last|next|show|tell|give|list|many|much|most|about|after|before|today|hours|days)$/.test(w)) return w;
    const max = w.length >= 8 ? 2 : 1; let best = null, bd = 9;
    for (const v of VOCAB) { if (Math.abs(v.length - w.length) > max) continue; const x = lev(w, v); if (x < bd) { bd = x; best = v; } }
    return best && bd <= max ? best : w;
  });
}

// ── finding things in a question ─────────────────────────────────────
function storeIn(q) {
  const t = normalize(q);
  let m = t.match(/\b(?:store|branch|site|location|shop)\s*(?:no\.?|number|#)?\s*(\d{1,4})\b/); if (m && D.storeOf(+m[1])) return D.storeOf(+m[1]);
  m = t.match(/br-?(\d{1,4})\b/); if (m && D.storeOf(+m[1])) return D.storeOf(+m[1]);
  // a bare number with no unit after it is a branch: "why was 214 slow", but not "24 hours" or "P1"
  m = t.match(/(?:^|[\s(,])(\d{1,3})(?![\d.:%-])(?!\s*(?:hours?|hrs?|h\b|days?|d\b|weeks?|months?|minutes?|mins?|m\b|ms|mb|gb|am|pm|percent|stores|branches|sites|incidents|devices|circuits|of\b))/);
  if (m && !/\b(?:p|top|last|next|first)\s*$/.test(t.slice(0, m.index + 1).trim().split(/\s+/).slice(-1)[0] + ' ') && !new RegExp(`#\\s?${m[1]}\\b`).test(t) && D.storeOf(+m[1])) return D.storeOf(+m[1]);
  let best = null;
  for (const b of D.BRANCHES) { const n = b.local.toLowerCase(); if (/#/.test(n) && t.includes(n) && (!best || n.length > best.local.length)) best = b; }
  return best;
}
const cityIn = q => { const t = q.toLowerCase(); const c = [...new Set(D.BRANCHES.map(b => b.city))].filter(c => new RegExp(`\\b${c.toLowerCase()}\\b`).test(t)).sort((a, b) => b.length - a.length)[0]; return c || null; };
const regionIn = q => { const t = q.toLowerCase(); return D.REGIONS.find(r => t.includes(r.toLowerCase())) || (/\btexas\b/.test(t) ? 'Texas & South Central' : /\bcarolina/.test(t) ? 'Carolinas & Mid-Atlantic' : /great lakes/.test(t) ? 'Great Lakes' : /mountain/.test(t) ? 'Mountain West' : /pacific|west coast/.test(t) ? 'Pacific' : /\bcanad/.test(t) ? 'Canada' : null); };
const brandIn = q => { const t = q.toLowerCase(); return D.BRANDS.find(x => t.includes(x.toLowerCase())) || D.BRANDS.find(x => t.includes(x.toLowerCase().split(' ').slice(0, 2).join(' '))) || null; };
const carrierIn = q => { const t = q.toLowerCase(); return D.CARRIERS.find(c => new RegExp(`\\b${c.toLowerCase().replace('&', '&')}\\b`).test(t)) || (/\batt\b/.test(t) ? 'AT&T' : null); };

// why a branch is not healthy, from what the console knows
function whyOf(s, b, now = Date.now()) {
  const incs = s.incidents.filter(i => i.branchId === b.id && i.state !== 'Resolved').sort((x, y) => x.pri.localeCompare(y.pri));
  if (incs.length) return { text: incs[0].title, inc: incs[0], since: Math.min(...incs.map(i => i.opened)), impact: incs[0].impact && incs[0].impact[0] };
  const p = circuitOf(s, b.wan[0]), c2 = circuitOf(s, b.wan[1]);
  if (p.status !== 'Up') return { text: `Primary ${p.carrier} ${p.type} ${p.status.toLowerCase()} (short flap, watching)`, impact: `On ${c2.carrier} ${c2.type}` };
  if (c2.status !== 'Up') return { text: `Backup ${c2.carrier} ${c2.type} ${c2.status.toLowerCase()}`, impact: 'No failover path if the primary fails' };
  if (b.watch && now < b.watch.until) return { text: b.watch.why, impact: 'Trading normally; the fix is being verified', since: D.HERO_STORY[b.num] && D.HERO_STORY[b.num].ok, recovering: true, inc: null };
  return { text: b.why || 'Health score below 90 (watch, no incident)', impact: 'No trading impact; watch level' };
}

// ── 1. down or degraded ──────────────────────────────────────────────
function downDegraded(s, now) {
  const all = D.BRANCHES.map(b => ({ b, h: healthOf(s, b) })).filter(x => x.h !== 'up').map(x => ({ ...x, w: whyOf(s, x.b, now), open: branchClock(x.b, now).open }));
  // down first, then by incident priority; within a priority the scripted stories lead
  // down first, then branches recovering after an automatic fix, then by incident priority; the scripted stories lead each band
  const rank = x => (x.h === 'down' ? 0 : x.w.recovering ? 9 : 10) + (x.w.inc ? +x.w.inc.pri[1] : x.w.recovering ? 0 : 6) - (D.HERO_STORY[x.b.num] ? 0.5 : 0);
  all.sort((a, b) => rank(a) - rank(b));
  const bad = all;
  const down = all.filter(x => x.h === 'down'), deg = all.filter(x => x.h === 'degraded');
  const withInc = bad.filter(x => x.w.inc).length, trading = bad.filter(x => x.open).length;
  return {
    title: `${down.length} stores down, ${deg.length} degraded, ${num(900 - all.length)} healthy`,
    lead: down.length ? `${down.length} store${down.length > 1 ? 's are' : ' is'} offline and ${deg.length} trading with a problem. ${withInc} have an open incident with an owner; the rest are watch-level.` : `No store is offline. ${deg.length} are trading with a problem; ${withInc} have an open incident with an owner.`,
    blocks: [
      kpis([{ label: 'Down', value: down.length, tone: down.length ? 'bad' : 'ok' }, { label: 'Degraded', value: deg.length, tone: 'warn' }, { label: 'Open now, affected', value: trading }, { label: 'Healthy', value: num(900 - all.length), tone: 'ok' }]),
      tbl(['Store', 'Status', 'Why', 'Since'], bad.slice(0, 14).map(x => ({ branch: x.b.id, cells: [{ text: sn(x.b), bold: true, sub: x.b.brand }, { text: x.h === 'down' ? 'Down' : x.w.recovering ? 'Degraded – watching after auto-fix' : 'Degraded', tone: x.h === 'down' ? 'bad' : 'warn' }, { text: x.w.text, sub: x.w.impact }, x.w.since ? ago(x.w.since, now) : '–'] }))),
      ...(bad.length > 14 ? [text(`…and ${bad.length - 14} more on the Operations Overview map.`)] : []),
    ],
    src: 'Orchestrator path state, OpsRamp, Aruba Central, ServiceNow incidents', links: [L('Operations overview', 'overview'), L('Live incidents', 'incidents')],
  };
}

// ── 2. on backup only ────────────────────────────────────────────────
function onBackup(s, now) {
  const rows = D.BRANCHES.filter(b => onBackupOf(s, b)).map(b => {
    const p = circuitOf(s, b.wan[0]), c2 = circuitOf(s, b.wan[1]);
    const inc = s.incidents.find(i => i.branchId === b.id && i.state !== 'Resolved' && i.ci === p.id);
    const cs = inc && inc.carrierCase && s.cases.find(c => c.id === inc.carrierCase);
    return { b, p, c2, inc, cs, since: inc ? inc.opened : null };
  }).sort((a, b) => (a.since || now) - (b.since || now));
  const lte = rows.filter(r => r.c2.type === 'LTE/5G');
  const noBackup = D.BRANCHES.filter(b => healthOf(s, b) !== 'down' && circuitOf(s, b.wan[0]).status === 'Up' && circuitOf(s, b.wan[1]).status === 'Down');
  return {
    title: `${rows.length} stores trading on their backup ISP only`,
    lead: `Each lost its primary line and SD-WAN moved card payments, ERP and voice to the second ISP in seconds, so none went offline. ${lte.length === 1 ? '1 is' : `${lte.length} are`} on LTE (works, slower for ERP, metered); the rest are on a second wired ISP and run normally.`,
    blocks: [
      kpis([{ label: 'On backup only', value: rows.length, tone: rows.length ? 'warn' : 'ok' }, { label: 'On LTE', value: lte.length }, { label: 'Carrier cases open', value: rows.filter(r => r.cs).length }, { label: 'Offline because of it', value: 0, tone: 'ok' }]),
      tbl(['Store', 'Primary lost', 'Now on', 'Carrier case'], rows.map(r => ({ branch: r.b.id, cells: [{ text: sn(r.b), bold: true, sub: r.b.brand }, { text: `${r.p.carrier} ${r.p.type}`, sub: r.since ? `${ago(r.since, now)}` : 'flap, watching' }, { text: `${r.c2.carrier} ${r.c2.type}`, sub: r.c2.type === 'LTE/5G' ? 'ERP slower, POS fine' : 'normal speed' }, r.cs ? { text: r.cs.id, sub: r.cs.eta ? (now > r.cs.eta ? `ETA passed ${dur(now - r.cs.eta)} ago` : `ETA ${ct(r.cs.eta)}`) : r.cs.status } : '–'] }))),
      ...(noBackup.length ? [text(`${noBackup.length} other store${noBackup.length > 1 ? 's have' : ' has'} the opposite problem: primary fine, backup down, so no failover path (${noBackup.slice(0, 3).map(b => sn(b)).join(', ')}).`, 'warn')] : []),
    ],
    src: 'EdgeConnect Orchestrator path state, carrier cases', links: [L('Carrier management', 'carriers'), L('Operations overview', 'overview')],
  };
}

// ── 3. why was a store slow ──────────────────────────────────────────
export const layerOf = cause => /^ISP:/.test(cause) ? 'ISP' : /^Application:/.test(cause) ? 'Application' : /^Network:/.test(cause) ? 'Network' : /\b(?:isp|carrier|lec|fibre|fiber|circuit|comcast|spectrum|at&t|lumen|verizon|cox|broadband|dia|mpls|lte|access link)\b/i.test(cause) && !/policy|change/i.test(cause) ? 'ISP' : /application|erp slow at|server|processor|data centre/i.test(cause) && !/policy/i.test(cause) ? 'Application' : 'Network';
function rootCause(s, b, q, now) {
  const t = q.toLowerCase();
  const p0 = parts(now, b.tz); const dayStart = now - (p0.h * 60 + p0.m) * MIN;
  const morning = /morning/.test(t), yday = /yesterday/.test(t);
  const hs = D.HERO_STORY[b.num];
  // "this morning" for a hero whose morning has not come yet today means the last one that did
  let from = yday || (morning && hs && hs.back) ? dayStart - DAY : morning ? dayStart : now - DAY, to = yday ? dayStart : now;
  let incs = allInc(s).filter(i => i.branchId === b.id && i.opened >= from && i.opened <= to).sort((x, y) => y.conf - x.conf);
  const when = yday ? 'yesterday' : morning ? (hs && hs.back ? 'yesterday morning (this morning has been clean so far)' : 'this morning') : 'in the last 24 hours';
  const c1 = circuitOf(s, b.wan[0]), c2 = circuitOf(s, b.wan[1]);
  if (!incs.length) {
    const ch = branchChecks(s, b);
    return {
      title: `${sn(b)}: nothing was slow ${when}`,
      lead: 'No incident, no user call and no synthetic test breach. Each layer checked:',
      blocks: [{ type: 'layers', items: [
        { name: 'Network', verdict: 'Clean', tone: 'ok', text: `EdgeConnect, ${b.dev.sw} switch${b.dev.sw > 1 ? 'es' : ''} and ${b.dev.ap} AP${b.dev.ap > 1 ? 's' : ''} healthy; ${ch.c.cfg.detail.toLowerCase()}` },
        { name: 'ISP', verdict: c1.status === 'Up' ? 'Clean' : c1.status, tone: c1.status === 'Up' ? 'ok' : 'warn', text: `${c1.carrier} ${c1.type}: ${c1.lat} ms, loss ${c1.loss}%, jitter ${c1.jit} ms; backup ${c2.carrier} ${c2.status.toLowerCase()}` },
        { name: 'Application', verdict: 'Clean', tone: 'ok', text: `ERP and payment synthetic tests normal (${ch.c.pos.detail.toLowerCase()})` },
      ] }],
      src: 'Orchestrator, Aruba Central, OpsRamp, New Relic synthetics', links: [branchLink(b)],
    };
  }
  const inc = incs[0];
  const layers = { Network: [], ISP: [], Application: [] };
  inc.rca.forEach(r => layers[layerOf(r.cause)].push(r));
  const top = layerOf(inc.rca[0].cause);
  const ev = { Network: `EdgeConnect, switches and Wi-Fi healthy`, ISP: `${c1.carrier} ${c1.type} ${c1.lat} ms, loss ${c1.loss}%, jitter ${c1.jit} ms; backup clean`, Application: 'ERP and payment tests normal from other stores at the same time' };
  const items = ['Network', 'ISP', 'Application'].map(n => {
    const r = layers[n][0];
    return n === top ? { name: n, verdict: 'Cause', tone: 'bad', text: `${r.cause.replace(/^(?:Network|ISP|Application):\s*/, '')} (${Math.round(r.conf * 100)}% confidence). ${r.ev}` } : { name: n, verdict: 'Ruled out', tone: 'ok', text: r ? `${r.ev}` : ev[n] };
  });
  const tl = [
    ...(hs && hs.push && hs.inc === inc.id ? [{ t: lt(hs.push, b), text: `${hs.chg} pushed policy v41 to this store's EdgeConnect (standard change, before opening)`, src: 'Network-as-Code' }] : []),
    ...inc.signals.map(x => ({ t: lt(x.t, b), text: x.msg, src: x.src, tone: x.sev === 'Critical' ? 'bad' : x.sev === 'Major' ? 'warn' : undefined })),
    ...inc.agentSteps.filter(a => ['diagnosis', 'change', 'runbook', 'verify'].includes(a.agent)).map(a => ({ t: lt(a.t, b), text: a.text, src: 'Mova iO' })),
    ...(inc.resolved ? [{ t: lt(inc.resolved, b), text: `${inc.id} resolved – ${inc.closeCode}`, src: 'ServiceNow', tone: 'ok' }] : []),
  ].sort((x, y) => x.t.localeCompare(y.t));
  const hero = !!(hs && hs.inc === inc.id && hs.slow);
  const lastFor = hero ? dur(hs.ok - hs.slow) : inc.resolved ? dur(inc.resolved - inc.opened) : `${dur(now - inc.opened)} so far`;
  const day = t0 => { const d = Math.floor((t0 - dayStart) / DAY); return d >= 0 ? 'today' : d === -1 ? 'yesterday' : dateShort(t0, b.tz); };
  return {
    title: `${sn(b)}: ${top === 'Network' ? (/change|policy|config|drift/i.test(inc.rca[0].cause) ? 'the network – a configuration change' : 'the network') : top === 'ISP' ? `the ISP – ${c1.carrier} ${c1.type}` : 'the application'}, not ${['Network', 'ISP', 'Application'].filter(x => x !== top).map(x => x === 'ISP' ? 'the ISP' : x === 'Application' ? 'the application' : 'the network').join(' or ')}`,
    lead: `${inc.title}: ${hero ? `slow from ${lt(hs.slow, b)} to ${lt(hs.ok, b)} ${day(hs.slow)}` : `opened ${lt(inc.opened, b)} ${day(inc.opened)}`}${hero && hs.back && morning ? ' (this morning has been clean so far)' : ''}. ${inc.auto ? `Fixed with no human touch: ${inc.autoAction}.` : inc.state === 'Resolved' ? `Resolved by ${inc.assignee} (${inc.closeCode}).` : `Still open: ${inc.state}, ${inc.assignee || 'unassigned'}.`}`,
    blocks: [
      { type: 'layers', items },
      kpis([{ label: 'Confidence', value: `${Math.round(inc.conf * 100)}%` }, { label: 'Slow for', value: lastFor }, { label: 'Events grouped', value: inc.corr + inc.signals.length }, { label: 'Fixed by', value: inc.auto ? 'Mova iO' : inc.assignee || '–', tone: inc.auto ? 'ok' : undefined }]),
      { type: 'timeline', items: tl },
      ...(hero ? [text('The same policy was due at 37 more Carolinas stores; the wave paused after this one, so they never saw it. Problem PRB0004236 adds an ERP test to pre-opening validation.', 'ok')] : []),
    ],
    src: `${inc.id} (ServiceNow), Orchestrator, New Relic, change records`, links: [L(`Open ${inc.id}`, 'incidents', { selInc: inc.id }), branchLink(b)],
  };
}

// ── 4. what changed ──────────────────────────────────────────────────
function whatChanged(s, b, q, now) {
  const hours = /week|7 days/.test(q) ? 168 : /48/.test(q) ? 48 : 24, from = now - hours * HR;
  const applies = c => c.branchIds ? c.branchIds.includes(b.id) : c.states ? c.states.includes(b.state) : (c.scope === 'All regions' || c.scope === b.region);
  const ev = [];
  s.changes.filter(c => applies(c) && c.start <= now && c.end >= from && /Implemented|Failed|rolled/i.test(c.state)).forEach(c => ev.push({ t: c.start, what: c.title, src: `${c.id} · Network-as-Code`, recorded: true, detail: c.state, tone: /Failed/.test(c.state) ? 'bad' : undefined }));
  const hs = D.HERO_STORY[b.num];
  if (hs && hs.ap && hs.fwAt >= from) ev.push({ t: hs.fwAt, what: `${hs.ap} firmware ${hs.fwFrom} → 10.7.1.0`, src: 'Aruba Central · CHG0031902', recorded: true, detail: 'Post-checks passed' });
  s.drift.filter(d => d.branchId === b.id).forEach(d => ev.push({ t: d.since, what: `${d.device}: ${d.item}`, src: `Drift detection · ${d.source}`, recorded: false, detail: d.since >= from ? `${d.sev} severity, no change record` : `still drifted (since ${dateShort(d.since)})`, tone: 'bad', old: d.since < from }));
  if (hs && hs.bkAt && hs.bkAt >= from) ev.push({ t: hs.bkAt, what: `Nightly backup captured the ${hs.sw} change; diff against golden flagged it`, src: 'OpsRamp config backup', recorded: true, detail: 'Backup OK' });
  allInc(s).filter(i => i.branchId === b.id && (i.resolved || i.opened) >= from).forEach(i => {
    if (i.auto) ev.push({ t: i.resolved || i.opened, what: i.autoAction, src: `Mova iO · ${i.runbook}`, recorded: true, detail: `${i.id}, no human touch`, tone: 'ok' });
    else if (i.kind === 'circuit' && i.state !== 'Resolved') ev.push({ t: i.opened + 4e3, what: `Traffic moved from ${circuitOf(s, b.wan[0]).carrier} to ${circuitOf(s, b.wan[1]).carrier} (primary down)`, src: 'Orchestrator path control', recorded: true, detail: i.id });
  });
  (s.runs || []).filter(r => r.branchId === b.id && r.t >= from).forEach(r => ev.push({ t: r.t, what: `${r.rb} ${D.RB[r.rb] ? D.RB[r.rb].name : ''} run by ${r.by}`, src: 'Automation library', recorded: true, detail: r.res }));
  const ch = branchChecks(s, b); if (ch.fixed) ev.push({ t: now - 8 * HR, what: `${ch.fixed.text} (before opening)`, src: `Mova iO · ${ch.fixed.rb}`, recorded: true, detail: 'Fixed overnight' });
  ev.sort((x, y) => x.t - y.t);
  const recent = ev.filter(e => !e.old), unrec = recent.filter(e => !e.recorded);
  const open = s.incidents.filter(i => i.branchId === b.id && i.state !== 'Resolved');
  const linked = open.find(i => i.rca && /drift|change|relay|policy|config/i.test(i.rca[0].cause));
  return {
    title: recent.length ? `${sn(b)}: ${recent.length} change${recent.length > 1 ? 's' : ''} in the last ${hours} hours${unrec.length ? `, ${unrec.length} with no change record` : ''}` : `${sn(b)}: no changes in the last ${hours} hours`,
    lead: linked ? `The one that matters: ${linked.rca[0].cause.charAt(0).toLowerCase() + linked.rca[0].cause.slice(1)} – it is the top cause of open incident ${linked.id} (${Math.round(linked.conf * 100)}%). ${linked.rca[1] ? `The firmware upgrade was checked and ruled out (${Math.round(linked.rca[1].conf * 100)}%).` : ''}` : recent.length ? 'Nothing here is linked to an open incident.' : 'No recorded change, no drift and no automation touched this store. Config backup matches the golden config.',
    blocks: [
      kpis([{ label: 'Changes', value: recent.length }, { label: 'Recorded (CHG)', value: recent.length - unrec.length, tone: 'ok' }, { label: 'Unrecorded (drift)', value: unrec.length, tone: unrec.length ? 'bad' : 'ok' }, { label: 'Open incidents', value: open.length, tone: open.length ? 'warn' : 'ok' }]),
      ...(ev.length ? [{ type: 'timeline', items: ev.map(e => ({ t: `${dateShort(e.t, b.tz)} ${lt(e.t, b)}`, text: e.what, src: `${e.src}${e.detail ? ` · ${e.detail}` : ''}`, tone: e.tone })) }] : []),
      ...(linked ? [text(`Waiting on a human: ${s.approvals.filter(a => a.branchId === b.id && a.status === 'Pending').map(a => `${a.id} ${a.title}`).join('; ') || 'none'}.`, 'warn')] : []),
    ],
    src: 'ServiceNow change records, Network-as-Code repo, nightly config backups, drift detection, Aruba Central, Mova iO run log', links: [L('Drift detection', 'changes', { tab: { changes: 'drift' } }), L('Change calendar', 'changes', { tab: { changes: 'calendar' } }), branchLink(b)],
  };
}

// what changed across the estate (no branch named)
function changesEstate(s, now) {
  const from = now - DAY;
  const ch = s.changes.filter(c => c.start <= now && c.end >= from && /Implemented|Failed|rolled/i.test(c.state));
  const dr = s.drift.filter(d => d.since >= from);
  const auto = s.resolved.filter(i => i.auto && (i.resolved || 0) >= from);
  return {
    title: `${ch.length} changes, ${dr.length} unrecorded config edits and ${auto.length} automatic fixes in the last 24 hours`,
    lead: 'Name a branch for its full timeline, e.g. "What changed at Branch 118 in the last 24 hours?"',
    blocks: [
      ...(ch.length ? [tbl(['Change', 'What', 'State'], ch.map(c => ({ cells: [{ text: c.id, bold: true, sub: c.scope }, c.title, { text: c.state, tone: /Failed/.test(c.state) ? 'bad' : 'ok' }] })))] : []),
      ...(dr.length ? [tbl(['Device', 'Branch', 'Unrecorded change'], dr.map(d => ({ branch: d.branchId, cells: [{ text: d.device, bold: true, sub: d.sev }, sn(brOf(d.branchId)), d.item] })))] : []),
      ...(auto.length ? [list(auto.slice(0, 6).map(i => ({ k: sn(brOf(i.branchId)), v: i.autoAction, inc: i.id })))] : []),
    ],
    src: 'ServiceNow change records, drift detection, Mova iO run log', links: [L('Change calendar', 'changes', { tab: { changes: 'calendar' } }), L('Drift detection', 'changes', { tab: { changes: 'drift' } })],
  };
}
// where things are slow right now (no branch named)
function slowNow(s, now) {
  const perf = s.incidents.filter(i => i.state !== 'Resolved' && /slow|jitter|latency|loss|roaming|cpu|timing out/i.test(`${i.title} ${(i.impact || []).join(' ')}`));
  const today = s.resolved.filter(i => (i.resolved || 0) >= now - DAY && /slow|jitter|latency|timing out/i.test(i.title));
  return {
    title: `${perf.length} branches slow right now`,
    lead: 'Ask about one for the root cause, e.g. "Why was Branch 214 slow this morning?"',
    blocks: [tbl(['Branch', 'What is slow', 'Top cause', 'Since'], perf.map(i => ({ inc: i.id, cells: [{ text: sn(brOf(i.branchId)), bold: true, sub: brOf(i.branchId).brand }, i.title, i.rca[0] ? `${i.rca[0].cause} (${Math.round(i.rca[0].conf * 100)}%)` : 'diagnosing', ago(i.opened, now)] }))),
      ...(today.length ? [text(`Earlier, now fixed: ${today.map(i => sn(brOf(i.branchId))).slice(0, 5).join(', ')}.`, 'ok')] : [])],
    src: 'ServiceNow incidents, Orchestrator, New Relic', links: [L('Live incidents', 'incidents')],
  };
}

// ── 5. top bandwidth users ───────────────────────────────────────────
function topTalkers(s, b, now) {
  const nf = D.netflowOf(b); const y = now - DAY;
  const cap = nf.line.bw;
  return {
    title: `${sn(b)}: top bandwidth users ${dateShort(y, b.tz)} (yesterday)`,
    lead: `${num(nf.total)} GB over the ${nf.line.carrier} ${nf.line.type} line (${cap} Mb/s). Peak ${nf.peak}% at ${nf.peakAt} local.${nf.note ? ' ' + nf.note : ''}`,
    blocks: [
      kpis([{ label: 'Total', value: `${nf.total} GB` }, { label: 'Peak use', value: `${nf.peak}%`, tone: nf.peak >= 90 ? 'bad' : nf.peak >= 80 ? 'warn' : 'ok' }, { label: 'Peak hour', value: nf.peakAt }, { label: 'Business share', value: P(sum(nf.apps.filter(a => a.cls === 'Business'), a => a.gb) / nf.total, 0) }]),
      { type: 'spark', label: 'Line use by hour, % of capacity', values: nf.hours, max: 100, mark: 90 },
      bars(nf.apps.slice(0, 7).map(a => ({ label: a.name, sub: a.cls, value: a.gb, display: `${a.gb} GB`, tone: a.cls === 'Business' ? 'info' : a.cls === 'Guest' ? 'muted' : 'warn' })), { title: 'By application' }),
      bars(nf.clients.slice(0, 6).map(c => ({ label: c.name, sub: c.kind, value: c.gb, display: `${c.gb} GB`, tone: 'info' })), { title: 'By device' }),
    ],
    src: 'NetFlow from the EdgeConnect (application and device), Orchestrator interface stats', links: [branchLink(b)],
  };
}

// ── 6. flapping or breaching circuits ────────────────────────────────
function circuitSla(s, now) {
  const all = D.CIRCUITS.map(c => ({ c: circuitOf(s, c.id), b: brOf(c.branchId) }));
  const flap = all.filter(x => x.c.flaps30 >= 3).sort((a, b) => b.c.flaps30 - a.c.flaps30);
  const breach = all.filter(x => D.availOf(x.c) < D.LINE_SLA[x.c.type]).map(x => { const a = D.availOf(x.c), gap = D.LINE_SLA[x.c.type] - a; return { ...x, a, credit: D.lineMRC(x.c) * (gap > 0.005 ? 0.25 : 0.1) }; }).sort((a, b) => a.a - b.a);
  const late = s.cases.filter(c => !c.closed && c.eta && now > c.eta);
  const carriers = D.SCORECARD.filter(x => x.slaMet < 0.9);
  const credits = sum(breach, x => x.credit);
  const rows = [...new Map([...breach, ...flap].map(x => [x.c.id, x])).values()].slice(0, 12);
  return {
    title: `${flap.length} circuits flapping, ${breach.length} below their carrier availability SLA this month`,
    lead: `Estimated service credits to claim: ${money(credits)} this month across ${breach.length} circuits. ${late.length} open carrier cases are past the carrier's committed restore time${carriers.length ? `, and ${carriers.map(c => c.carrier).join(' and ')} are below 90% on restore commitments over 6 months` : ''}.`,
    blocks: [
      kpis([{ label: 'Flapping (3+ drops)', value: flap.length, tone: flap.length ? 'warn' : 'ok' }, { label: 'Below SLA', value: breach.length, tone: breach.length ? 'bad' : 'ok' }, { label: 'Cases past ETA', value: late.length, tone: late.length ? 'bad' : 'ok' }, { label: 'Credits to claim', value: money(credits), tone: 'ok' }]),
      tbl(['Circuit', 'Store', 'Drops this month', 'Availability vs SLA', 'Credit'], rows.map(x => { const a = D.availOf(x.c), sla = D.LINE_SLA[x.c.type], br = breach.find(y => y.c.id === x.c.id); return { branch: x.b.id, cells: [{ text: `${x.c.carrier} ${x.c.type}`, bold: true, sub: x.c.id }, { text: sn(x.b) }, { text: String(x.c.flaps30), tone: x.c.flaps30 >= 3 ? 'warn' : undefined }, { text: `${P(a, 2)} vs ${P(sla, 2)}`, tone: a < sla ? 'bad' : 'ok' }, br ? money(br.credit) : '–'] }; })),
      ...(late.length ? [list(late.slice(0, 5).map(c => ({ k: c.id, v: `${c.carrier}, ${sn(brOf(c.branchId))} – ${c.status}; ETA passed ${dur(now - c.eta)} ago`, branch: c.branchId })))] : []),
      text('Credits are estimates: monthly charge by line type and speed × the carrier\'s credit tier (10%, or 25% when availability is more than 0.5% below commitment). Confirm against each carrier contract.', 'muted'),
    ],
    src: 'Orchestrator path history (30 days), carrier cases, carrier scorecard', links: [L('Carrier management', 'carriers'), L('Carrier scorecard', 'carriers', { tab: { carriers: 'scorecard' } })],
  };
}

// ── 7. auto-remediated ───────────────────────────────────────────────
function autoFixed(s, now, days = 7) {
  const from = now - days * DAY;
  const res = s.resolved.filter(i => (i.resolved || i.opened) >= from);
  const auto = res.filter(i => i.auto || /zero touch/i.test(i.closeCode || '')).sort((a, b) => (b.resolved || 0) - (a.resolved || 0));
  const byRb = {}; auto.forEach(i => { const k = i.runbook || 'other'; byRb[k] = (byRb[k] || 0) + 1; });
  const ttf = auto.map(i => (i.resolved || i.opened) - i.opened).sort((a, b) => a - b); const med = ttf.length ? ttf[Math.floor(ttf.length / 2)] : 0;
  const mitig = s.incidents.filter(i => i.state !== 'Resolved' && i.kind === 'circuit');
  const hero = auto.filter(i => D.HERO_STORY[brOf(i.branchId).num]);
  const shown = [...hero, ...auto.filter(i => !hero.includes(i))].slice(0, 9);
  return {
    title: `${auto.length} incidents fixed with no human touch in the last ${days} days`,
    lead: `${P(auto.length / Math.max(1, res.length), 0)} of the ${res.length} incidents resolved this week (Annexure B #37 target 25%). Median time from alert to fixed: ${dur(med)}. That is about ${Math.round(auto.length * 0.75)} engineer hours not spent.`,
    blocks: [
      kpis([{ label: 'Auto-remediated', value: auto.length, tone: 'ok' }, { label: 'Share of resolved', value: P(auto.length / Math.max(1, res.length), 0) }, { label: 'Median time to fix', value: dur(med) }, { label: 'Hours given back', value: `${Math.round(auto.length * 0.75)} h` }]),
      bars(Object.entries(byRb).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: `${k} ${D.RB[k] ? D.RB[k].name : ''}`, value: v, display: String(v), tone: 'ok' })), { title: 'By runbook' }),
      tbl(['Store', 'What happened', 'What Mova iO did', 'Fixed in'], shown.map(i => ({ inc: i.id, cells: [{ text: sn(brOf(i.branchId)), bold: true, sub: `${i.id} · ${dateShort(i.opened)}` }, i.title, { text: i.autoAction || `${i.runbook} ran; verification passed`, tone: 'ok' }, dur((i.resolved || i.opened) - i.opened)] }))),
      ...(mitig.length ? [text(`Also mitigated automatically but still open: ${mitig.length} circuit outages where SD-WAN moved traffic to the backup ISP in seconds and RB-106 opened the carrier case; they close when the carrier repairs.`)] : []),
    ],
    src: 'ServiceNow incidents (resolved, 7 days), Mova iO run log', links: [L('Automation library', 'automation'), L('Live incidents', 'incidents')],
  };
}

// ── 8. uptime and MTTR vs target ─────────────────────────────────────
function scorecard(s) {
  const M = D.MTTR_MONTHS, k = M.months.length - 2, name = { Jan: 'January', Feb: 'February', Mar: 'March', Apr: 'April', May: 'May', Jun: 'June', Jul: 'July', Aug: 'August', Sep: 'September', Oct: 'October', Nov: 'November', Dec: 'December' }[M.months[k]];
  const av = D.SLA.find(m => m.n === 29), up = av.trend[k], upPrev = av.trend[k - 1];
  const tm = D.TICKET_MONTHS.find(x => x.m === M.months[k]) || D.TICKET_MONTHS.at(-1);
  const tickets = tm.afterHours + tm.ntf + tm.carrier + tm.customer + tm.reboot;
  const autoR = D.SLA.find(m => /Auto-resolution/.test(m.name)).trend[k];
  const resp = ['P1', 'P2'].map(p => D.SLA.find(m => m.queue === p && /response/.test(m.name)));
  const downMin = Math.round((1 - up) * 30 * 24 * 60 * 900);
  const mt = p => ({ p, v: M[p][k], prev: M[p][k - 1], target: M.target[p] });
  const rows = ['P1', 'P2', 'P3'].map(mt);
  return {
    title: `${name}: uptime ${P(up, 3)}, MTTR well inside every target`,
    lead: `Uptime ${P(up, 3)} against a ${P(av.esl, 2)} expected level and ${P(av.msl, 0)} minimum: above the minimum (no service credit), ${up >= av.esl ? 'at the expected level' : `${((av.esl - up) * 100).toFixed(3)} points short of the expected level`}, and ${up >= upPrev ? 'up' : 'down'} from ${P(upPrev, 3)} the month before. Time to restore fell again for every priority.`,
    blocks: [
      kpis([{ label: 'Network uptime', value: P(up, 3), sub: `target ${P(av.esl, 2)}`, tone: up >= av.esl ? 'ok' : 'warn' }, { label: 'MTTR P1', value: `${rows[0].v} h`, sub: `target ${rows[0].target} h`, tone: 'ok' }, { label: 'MTTR P2', value: `${rows[1].v} h`, sub: `target ${rows[1].target} h`, tone: 'ok' }, { label: 'MTTR P3', value: `${rows[2].v} h`, sub: `target ${rows[2].target} h`, tone: 'ok' }]),
      tbl(['Measure', name, 'Month before', 'Target', 'Status'], [
        { cells: ['Critical network availability (#29)', P(up, 3), P(upPrev, 3), `${P(av.esl, 2)} (min ${P(av.msl, 0)})`, { text: up >= av.esl ? 'Meets' : 'Above minimum', tone: up >= av.esl ? 'ok' : 'warn' }] },
        ...rows.map(r => ({ cells: [`Mean time to restore, ${r.p}`, `${r.v} h`, `${r.prev} h`, `${r.target} h`, { text: `${Math.round((1 - r.v / r.target) * 100)}% inside`, tone: 'ok' }] })),
        ...resp.map(m => { const v = +m.trend[k].toFixed(3); return { cells: [`${m.queue} answered in 15 min (#${m.n})`, P(v), P(m.trend[k - 1]), P(m.esl, 0), { text: v >= m.esl ? 'Meets' : v >= m.msl ? 'Above minimum' : 'Below minimum', tone: v >= m.esl ? 'ok' : v >= m.msl ? 'warn' : 'bad' }] }; }),
        { cells: ['Auto-resolved, zero touch (#37)', P(autoR), P(D.SLA.find(m => /Auto-resolution/.test(m.name)).trend[k - 1]), '25%', { text: autoR >= 0.25 ? 'Meets' : 'Rising', tone: autoR >= 0.25 ? 'ok' : 'warn' }] },
      ]),
      text(`${num(tickets)} network tickets in ${name}. Unavailability averaged about ${Math.round(downMin / 900)} minutes per store over the month, mostly carrier faults; SD-WAN rode through most of them on the backup line.`),
    ],
    src: 'SLA & KPI tracker (Annexure B), ServiceNow resolution times', links: [L('SLA & KPI tracker', 'sla')],
  };
}

// ── 9. capacity in the next 90 days ──────────────────────────────────
function capacity(s) {
  const all = D.BRANCHES.map(D.capacityOf);
  const wan = all.filter(x => x.wanDays <= 90).sort((a, b) => a.wanDays - b.wanDays);
  const wifi = all.filter(x => x.wifiDays <= 90).sort((a, b) => a.wifiDays - b.wifiDays);
  const pool = s.predictions.find(p => p.id === 'PRD-506');
  const rows = [...wan.map(x => ({ x, kind: 'WAN', now: `${x.wanP95}% p95`, g: `+${x.wanGrowth}%/wk`, d: x.wanDays, lim: '90%', act: x.pred.length ? s.predictions.find(p => p.id === x.pred[0] && !/ap\d/.test(p.target))?.suggest || 'Plan bandwidth upgrade' : x.wanDays <= 30 ? 'Request bandwidth upgrade' : 'Move bulk traffic after close, then review' })),
    ...wifi.map(x => ({ x, kind: 'Wi-Fi', now: `${x.wifiPeak}% airtime`, g: `+${x.wifiGrowth}%/wk`, d: x.wifiDays, lim: '85%', act: x.pred.length ? s.predictions.find(p => p.branchId === x.b.id && /ap\d/.test(p.target))?.suggest || 'Add an access point' : 'Add an access point' }))].sort((a, b) => a.d - b.d);
  return {
    title: `${wan.length} stores will hit their WAN limit and ${wifi.length} their Wi-Fi limit within 90 days`,
    lead: `Forecast from 10 weeks of p95 use and the weekly trend at all 900 stores. Soonest: ${rows[0] ? `${sn(rows[0].x.b)} (${rows[0].kind}) in about ${rows[0].d} days` : 'none'}.${pool ? ` The pooled Verizon LTE plan is at ${pool.series.at(-1)}% and runs out in ${pool.horizon}.` : ''}`,
    blocks: [
      kpis([{ label: 'WAN limit ≤ 90 days', value: wan.length, tone: wan.length ? 'warn' : 'ok' }, { label: 'Wi-Fi limit ≤ 90 days', value: wifi.length, tone: wifi.length ? 'warn' : 'ok' }, { label: 'Within 30 days', value: rows.filter(r => r.d <= 30).length, tone: 'bad' }, { label: 'LTE pool', value: pool ? `${pool.series.at(-1)}%` : '–', tone: 'warn' }]),
      tbl(['Store', 'What', 'Now', 'Trend', 'Hits limit', 'Next step'], rows.slice(0, 12).map(r => ({ branch: r.x.b.id, cells: [{ text: sn(r.x.b), bold: true, sub: r.x.kind === 'WAN' ? `${r.x.line.carrier} ${r.x.line.bw} Mb/s` : r.x.b.brand }, r.kind, r.now, r.g, { text: r.d <= 0 ? 'now' : `${r.d} days`, tone: r.d <= 30 ? 'bad' : 'warn', sub: `at ${r.lim}` }, r.act] }))),
    ],
    src: 'Orchestrator interface history, Aruba Central airtime, Prediction agent', links: [L('Predictive watchlist', 'predict')],
  };
}

// ── 10. leadership summary ───────────────────────────────────────────
function leadership(s, now) {
  const from = now - 7 * DAY;
  const inc = allInc(s).filter(i => i.opened >= from);
  const res = s.resolved.filter(i => (i.resolved || 0) >= from);
  const byP = ['P1', 'P2', 'P3', 'P4'].map(p => [p, inc.filter(i => i.pri === p).length]);
  const byCat = {}; inc.forEach(i => byCat[i.cat] = (byCat[i.cat] || 0) + 1);
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const auto = res.filter(i => i.auto || /zero touch/i.test(i.closeCode || ''));
  const inSla = res.filter(i => !slaClock(i, now).resBreached).length;
  const mttr = p => { const r = res.filter(i => i.pri === p); return r.length ? sum(r, i => i.resolved - i.opened) / r.length : null; };
  const open = s.incidents.filter(i => i.state !== 'Resolved');
  const carrier = inc.filter(i => i.cat === 'Carrier / LEC').length;
  const cap = D.BRANCHES.map(D.capacityOf).filter(x => x.wanDays <= 90 || x.wifiDays <= 90).length;
  const pend = s.approvals.filter(a => a.status === 'Pending');
  const st = D.HERO_STORY;
  const h214 = D.storeOf(D.HERO.config), h73 = D.storeOf(D.HERO.failover), h118 = D.storeOf(D.HERO.changes), h309 = D.storeOf(D.HERO.autoAP);
  const range = `${dateShort(from)} – ${dateShort(now)}`;
  const highlights = [
    `${sn(h214)}: a policy change slowed ERP at opening; Mova iO found it in 3 minutes, rolled it back on its own and paused the wave before it reached 37 more stores.`,
    `${sn(h73)}: AT&T fibre cut; SD-WAN moved payments and ERP to the backup ISP in 4 seconds, so the store kept trading. Carrier case open.`,
    `${sn(h118)}: an unrecorded switch change broke handheld Wi-Fi addresses; caught as config drift, fix waiting for approval.`,
    `${sn(h309)}: a warehouse AP stopped answering; a port bounce fixed it in under 3 minutes with no one woken.`,
  ];
  const lines = [
    `${inc.length} incidents (${byP.map(([p, n]) => `${n} ${p}`).join(', ')}); ${res.length} resolved, ${P(inSla / Math.max(1, res.length), 0)} inside SLA.`,
    `${auto.length} fixed with no human touch (${P(auto.length / Math.max(1, res.length), 0)}); about ${Math.round(auto.length * 0.75)} engineer hours given back.`,
    `${P(carrier / Math.max(1, inc.length), 0)} were carrier faults; SD-WAN kept those stores trading on their backup line.`,
    `Mean time to restore: P2 ${mttr('P2') ? dur(mttr('P2')) : '–'}, P3 ${mttr('P3') ? dur(mttr('P3')) : '–'}, P4 ${mttr('P4') ? dur(mttr('P4')) : '–'}.`,
  ];
  const ahead = [`${cap} stores will reach a WAN or Wi-Fi limit within 90 days; upgrades are being planned.`, `728 Aruba 2530 switches reach end of support in Jan–Mar 2027; replacement waves are scheduled.`, `${open.length} incidents open now, ${(() => { const n = open.filter(i => slaClock(i, now).resBreached).length; return n ? `${n} past its resolution SLA` : 'none past its resolution SLA'; })()}.`];
  const asks = pend.map(a => `${a.id}: ${a.title} (${Math.round(a.conf * 100)}% confidence)`);
  const copy = [`Network operations – week of ${range}`, '', 'Headline', ...lines.map(x => `- ${x}`), '', 'What happened', ...highlights.map(x => `- ${x}`), '', 'Looking ahead', ...ahead.map(x => `- ${x}`), '', 'Decisions needed', ...(asks.length ? asks.map(x => `- ${x}`) : ['- None'])].join('\n');
  return {
    title: `Leadership summary: week of ${range}`,
    lead: lines[0] + ' ' + lines[1],
    blocks: [
      kpis([{ label: 'Incidents', value: inc.length }, { label: 'Inside SLA', value: P(inSla / Math.max(1, res.length), 0), tone: 'ok' }, { label: 'Auto-fixed', value: P(auto.length / Math.max(1, res.length), 0), tone: 'ok' }, { label: 'Carrier-caused', value: P(carrier / Math.max(1, inc.length), 0) }]),
      bars(cats.slice(0, 6).map(([k, v]) => ({ label: k, value: v, display: String(v), tone: 'info' })), { title: 'By category' }),
      { type: 'heading', text: 'Headline' }, list(lines.slice(2).map(v => ({ k: '•', v }))),
      { type: 'heading', text: 'What happened' }, list(highlights.map(v => ({ k: '•', v }))),
      { type: 'heading', text: 'Looking ahead' }, list(ahead.map(v => ({ k: '•', v }))),
      { type: 'heading', text: 'Decisions needed' }, list(asks.length ? asks.map(v => ({ k: '•', v })) : [{ k: '•', v: 'None' }]),
    ],
    copy, src: 'ServiceNow incidents (7 days), SLA clocks, Mova iO run log, predictions, approvals', links: [L('Weekly service review pack', 'reports', { tab: { reports: 'weekly' } })],
  };
}

// ── a store, region, brand, city or carrier on its own ───────────────
function storeProfile(s, b, now) {
  const h = healthOf(s, b), clk = branchClock(b, now), p = circuitOf(s, b.wan[0]), c2 = circuitOf(s, b.wan[1]);
  const open = s.incidents.filter(i => i.branchId === b.id && i.state !== 'Resolved');
  const ch = branchChecks(s, b); const cap = D.capacityOf(b);
  const devs = D.devicesOf(b.id);
  return {
    title: `${sb(b)}: ${h === 'up' ? 'healthy' : h}`,
    lead: `${b.city}, ${b.state} (${b.region}). Local time ${clk.local}, ${clk.open ? 'open now' : 'closed'}. ${h === 'up' ? 'Nothing open.' : whyOf(s, b).text + '.'}`,
    blocks: [
      kpis([{ label: 'Health score', value: b.score, tone: h === 'up' ? 'ok' : h === 'down' ? 'bad' : 'warn' }, { label: 'Open incidents', value: open.length, tone: open.length ? 'warn' : 'ok' }, { label: 'Readiness', value: ch.result, tone: ch.result === 'Ready' ? 'ok' : ch.result === 'Not ready' ? 'bad' : 'warn' }, { label: 'WAN p95', value: `${cap.wanP95}%` }]),
      list([
        { k: 'Primary', v: `${p.carrier} ${p.type} ${p.bw} Mb/s – ${p.status === 'Up' ? `${p.lat} ms, loss ${p.loss}%, jitter ${p.jit} ms` : p.status.toLowerCase()}` },
        { k: 'Backup', v: `${c2.carrier} ${c2.type} – ${c2.status.toLowerCase()}${onBackupOf(s, b) ? ' (carrying traffic now)' : ''}` },
        { k: 'Devices', v: `${b.dev.ec} EdgeConnect, ${b.dev.sw} switch${b.dev.sw > 1 ? 'es' : ''}, ${b.dev.ap} AP${b.dev.ap > 1 ? 's' : ''} · ${devs.filter(d => D.vulnsOf(d).some(a => a.sev === 'Critical')).length} with a critical CVE` },
        { k: 'Hours', v: `${b.hours.open}–${b.hours.close} weekdays${b.hours.sat ? `, Sat ${b.hours.sat}` : ''}` },
        ...open.map(i => ({ k: `${i.id} ${i.pri}`, v: `${i.title} – ${i.state}, ${i.assignee || 'unassigned'}`, inc: i.id })),
      ]),
    ],
    src: 'Orchestrator, Aruba Central, OpsRamp, ServiceNow', links: [branchLink(b)],
  };
}
function groupProfile(s, label, bs, now, filters) {
  const hs = bs.map(b => healthOf(s, b)); const ids = new Set(bs.map(b => b.id));
  const open = s.incidents.filter(i => ids.has(i.branchId) && i.state !== 'Resolved');
  const onB = bs.filter(b => onBackupOf(s, b));
  return {
    title: `${label}: ${bs.length} stores, ${hs.filter(h => h === 'up').length} healthy`,
    lead: `${hs.filter(h => h === 'down').length} down, ${hs.filter(h => h === 'degraded').length} degraded, ${onB.length} on their backup ISP, ${open.length} open incidents.`,
    blocks: [
      kpis([{ label: 'Stores', value: bs.length }, { label: 'Down', value: hs.filter(h => h === 'down').length, tone: 'bad' }, { label: 'Degraded', value: hs.filter(h => h === 'degraded').length, tone: 'warn' }, { label: 'Open incidents', value: open.length }]),
      ...(open.length ? [tbl(['Incident', 'Store', 'Title'], open.slice(0, 8).map(i => ({ inc: i.id, cells: [{ text: `${i.id} ${i.pri}`, bold: true }, sn(brOf(i.branchId)), i.title] })))] : []),
    ],
    src: 'Orchestrator, ServiceNow', links: [L('Operations overview for this view', 'overview', { filters })],
  };
}
function carrierProfile(s, carrier, now) {
  const cs = D.CIRCUITS.filter(c => c.carrier === carrier).map(c => circuitOf(s, c.id));
  const sc = D.SCORECARD.find(x => x.carrier === carrier) || D.SCORECARD.find(x => x.carrier === 'Canadian carriers');
  const cases = s.cases.filter(c => c.carrier === carrier && !c.closed);
  return {
    title: `${carrier}: ${cs.length} circuits, ${cs.filter(c => c.status === 'Up').length} up`,
    lead: `${cs.filter(c => c.role === 'Primary').length} stores use ${carrier} as their primary line and ${cs.filter(c => c.role === 'Secondary').length} as backup. ${cs.filter(c => c.status === 'Down').length} down, ${cs.filter(c => c.status === 'Degraded').length} degraded, ${cases.length} open cases. Restore commitment met ${P(sc.slaMet, 0)} over 6 months, MTTR ${sc.mttr} h, ${sc.repeat} repeat-offender circuits.`,
    blocks: [kpis([{ label: 'Circuits', value: cs.length }, { label: 'Down', value: cs.filter(c => c.status === 'Down').length, tone: 'bad' }, { label: 'Open cases', value: cases.length }, { label: 'Commitment met', value: P(sc.slaMet, 0), tone: sc.slaMet < 0.9 ? 'warn' : 'ok' }]),
      ...(cases.length ? [list(cases.map(c => ({ k: c.id, v: `${sn(brOf(c.branchId))} – ${c.status}${c.eta ? `, ETA ${now > c.eta ? 'passed' : ct(c.eta)}` : ''}`, branch: c.branchId })))] : [])],
    src: 'Orchestrator, carrier cases, scorecard', links: [L('Carrier management', 'carriers')],
  };
}

// ── single records ───────────────────────────────────────────────────
function incidentCard(s, i, now) {
  const c = slaClock(i, now); const b = brOf(i.branchId);
  return { title: `${i.id} ${i.pri} – ${i.state}`, lead: i.title, blocks: [list([{ k: 'Store', v: sb(b), branch: b.id }, { k: 'Opened', v: `${dt(i.opened)} CT (${ago(i.opened, now)})` }, { k: 'Owner', v: i.assignee || 'unassigned' }, { k: 'SLA', v: i.state === 'Resolved' ? `resolved in ${dur(i.resolved - i.opened)}${i.auto ? ', no human touch' : ''}` : c.resLeft < 0 ? 'breached' : `${dur(c.resLeft)} left (${Math.round(c.used * 100)}% used)` }, { k: 'Top cause', v: i.rca[0] ? `${i.rca[0].cause} (${Math.round(i.rca[0].conf * 100)}%)` : 'diagnosing' }, { k: 'Next', v: i.autoAction || (i.carrierCase ? `carrier case ${i.carrierCase}` : i.workOrder ? `work order ${i.workOrder}` : i.runbook ? `${i.runbook} – ${i.rbState}` : 'monitor') }])], src: 'ServiceNow, Mova iO', links: [L('Open incident', 'incidents', { selInc: i.id })] };
}
function deviceCard(s, d) {
  const b = brOf(d.branchId), lc = D.lifecycleOf(d), v = D.vulnsOf(d), tgt = D.FW_TARGET[d.type === 'AP' ? 'AP' : d.model], lvl = tgt.indexOf(d.fw);
  return { title: `${d.id}: ${D.lifeInfo(d).name || d.model}`, lead: `${d.type} at ${sb(b)}, ${d.role}. Managed by ${d.mode}.`, blocks: [list([{ k: 'Firmware', v: `${d.fw} (${lvl <= 0 ? 'N, current' : `N-${lvl}`}${lvl > (d.type === 'SD-WAN' ? 1 : 2) ? ', below policy' : ''})` }, { k: 'Lifecycle', v: `${lc.status} – ${lc.note}` }, { k: 'Warranty', v: `${D.warrantyKind(d)}: ${D.warrantyText(d)}` }, { k: 'Config backup', v: `${d.backup.st}${d.backup.at ? ` (${ago(d.backup.at)})` : ''}${d.backup.why ? ` – ${d.backup.why}` : ''}` }, { k: 'Advisories', v: v.length ? v.map(a => `${a.id} (${a.sev})`).join(', ') : 'none' }, { k: 'Serial', v: d.serial }])], src: 'Aruba Central, Orchestrator, OpsRamp, HPE bulletins', links: [L('Device inventory', 'inventory'), branchLink(b)] };
}

// ── the router ───────────────────────────────────────────────────────
export function answer(s, q, now, live) {
  const t = normalize(q);
  const open = s.incidents.filter(i => i.state !== 'Resolved');
  const role = s.role;
  const b = /my branch|my store/.test(t) ? brOf(s.bmBranch) : storeIn(q);
  const S = live && live.series;

  // record numbers
  const id = q.toUpperCase();
  let m;
  if ((m = id.match(/INC\d{7}/))) { const i = allInc(s).find(x => x.id === m[0]); return i ? incidentCard(s, i, now) : { title: `${m[0]} not found`, lines: ['It may be outside the 7-day window.'], src: 'ServiceNow', links: [] }; }
  if ((m = id.match(/CHG\d{7}/))) { const c = s.changes.find(x => x.id === m[0]); if (c) return { title: `${c.id}: ${c.state}`, lead: c.title, blocks: [list([{ k: 'Window', v: `${dt(c.start)} → ${dt(c.end)} CT (${c.window})` }, { k: 'Scope', v: `${c.scope}, ${num(c.devices)} devices` }, { k: 'Risk', v: `${c.risk}, ${c.type}` }, { k: 'Validation', v: c.validation }, { k: 'Owner', v: c.owner }, { k: 'Network-as-Code', v: c.nac }])], src: 'ServiceNow change calendar', links: [L('Change calendar', 'changes', { tab: { changes: 'calendar' } })] }; }
  if ((m = id.match(/APR-\d{4}/))) { const a = s.approvals.find(x => x.id === m[0]); if (a) return { title: `${a.id}: ${a.status}`, lead: a.title, blocks: [list([{ k: 'Why a human', v: a.why.join('; ') }, { k: 'Confidence', v: `${Math.round(a.conf * 100)}%` }, { k: 'Risk', v: a.risk }, ...(a.evidence || []).map(e => ({ k: '✓', v: e }))])], src: 'Approvals queue', links: [L('Approvals', 'changes', { tab: { changes: 'approvals' } })] }; }
  if ((m = id.match(/WO\d{7}/))) { const w = s.workOrders.find(x => x.id === m[0]); if (w) { const tech = s.techs.find(x => x.id === w.tech); return { title: `${w.id}: ${w.status}`, lead: `${w.task} at ${sb(brOf(w.branchId))}`, blocks: [list([{ k: 'Technician', v: tech ? tech.name : 'unassigned' }, { k: 'ETA', v: w.eta ? ct(w.eta) : '–' }, { k: 'Window', v: w.window }, { k: 'Parts', v: w.parts.join(', ') }, { k: 'Skills', v: w.skills.join(', ') }])], src: 'ServiceNow work orders', links: [L('Field dispatch', 'dispatch')] }; } }
  if ((m = id.match(/RB-\d{3}/))) { const r = s.runbooks.find(x => x.id === m[0]); if (r) return { title: `${r.id} ${r.name}`, lead: r.desc, blocks: [kpis([{ label: 'Autonomy', value: r.autonomy, sub: D.AUTONOMY[r.autonomy] }, { label: 'Runs (30 d)', value: r.runs30 }, { label: 'Success', value: P(r.success), tone: r.success > 0.9 ? 'ok' : 'warn' }, { label: 'Average', value: r.avg }]), list(r.steps.map((x, i) => ({ k: `${i + 1}.`, v: x }))), text(`Rollback: ${r.rollback}`)], src: 'Automation library', links: [L('Automation library', 'automation')] }; }
  if ((m = id.match(/KB(?:-DRAFT-)?\d{2,7}/))) { const k = [...s.kb, ...s.kbDrafts].find(x => x.id === m[0]); if (k) return { title: `${k.id}: ${k.title}`, lead: k.body, blocks: [list([{ k: 'Status', v: k.status }, ...(k.views ? [{ k: 'Use', v: `${num(k.views)} views, rated ${k.rating}` }] : [])])], src: 'Knowledge base', links: [L('Knowledge', 'knowledge')] }; }
  if ((m = id.match(/PRD-\d{3}/))) { const p = s.predictions.find(x => x.id === m[0]); if (p) return { title: `${p.id}: ${p.kind}`, lead: p.signal, blocks: [kpis([{ label: 'Confidence', value: P(p.conf, 0) }, { label: 'Horizon', value: p.horizon }, { label: 'Status', value: p.status }]), { type: 'spark', label: 'Signal', values: p.series }, text(`Suggests: ${p.suggest}`)], src: 'Prediction agent', links: [L('Predictive watchlist', 'predict')] }; }
  if ((m = id.match(/BIB-\d{4}/))) { const p = s.projects.find(x => x.id === m[0]); if (p) return { title: `${p.id}: ${p.brand} – ${p.site}`, lead: `${p.track}, ${p.stage}, ${p.rag}. Go-live ${dt(p.golive)}.`, blocks: [list([{ k: 'Gates', v: `${p.gates.filter(g => g.st === 'Pass').length}/13 passed` }, ...p.blockers.map(x => ({ k: 'Blocker', v: x }))])], src: 'Branch-in-a-Box', links: [L('Branch-in-a-Box', 'biab')] }; }
  if ((m = id.match(/PRB\d{7}/))) { const p = s.problems.find(x => x.id === m[0]); if (p) return { title: `${p.id}: ${p.state}`, lead: p.title, blocks: [list([{ k: 'Incidents', v: p.incidents }, { k: 'Owner', v: p.owner }, { k: 'Opened', v: dateShort(p.opened) }])], src: 'Problem records', links: [L('Knowledge', 'knowledge', { tab: { knowledge: 'problems' } })] }; }
  if ((m = id.match(/HPESBNW\d{5}|EOS-2530|ECOS-9\.3|CVE-\d{4}-\d{4,6}/))) { const a = D.ADVISORIES.find(x => x.id === m[0] || x.cves.includes(m[0])); if (a) { const devs = D.DEVICES.filter(d => a.affects(d)); return { title: `${a.id}: ${a.sev}${a.cvss ? ` (CVSS ${a.cvss})` : ''}`, lead: a.title, blocks: [kpis([{ label: 'Devices affected', value: num(devs.length), tone: 'bad' }, { label: 'Stores', value: new Set(devs.map(d => d.branchId)).size }]), list([{ k: 'Product', v: a.product }, { k: 'Fixed in', v: a.fixed }, { k: 'Mitigation', v: a.mitigation }, ...(a.cves.length ? [{ k: 'CVEs', v: a.cves.join(', ') }] : [])])], src: 'HPE Aruba Networking bulletins', links: [L('Lifecycle & vulnerabilities', 'vuln')] }; } }
  if ((m = t.match(/\b([a-z]{2}\d{4}-(?:ec|sw|ap|wan|lte)\d{1,2})\b/))) { const d = D.DEV[m[1]]; if (d) return deviceCard(s, d); const c = D.CIR[m[1]]; if (c) { const x = circuitOf(s, c.id); return { title: `${c.id}: ${x.carrier} ${x.type} ${x.bw} Mb/s – ${x.status}`, lead: `${x.role} line at ${sb(brOf(c.branchId))}.`, blocks: [list([{ k: 'Quality', v: `${x.lat} ms, loss ${x.loss}%, jitter ${x.jit} ms, use ${x.util}%` }, { k: 'Circuit ID', v: x.cid }, { k: 'This month', v: `${x.flaps30} drops, availability ${P(D.availOf(x), 2)} (SLA ${P(D.LINE_SLA[x.type], 2)})` }, { k: 'Tickets (90 d)', v: `${x.tickets90}, ${x.ntf90} no fault found` }])], src: 'Orchestrator', links: [L('Carrier management', 'carriers')] }; } }

  // the ten, in many phrasings
  const has = re => re.test(t);
  if (has(/auto[- ]?(?:matic(?:ally)?[- ])?(?:remediat|fix|resolv|heal)|self[- ]?heal|fixed (?:it ?)?(?:self|selves|automatically|on (?:its|their) own)|(?:fixed|resolved|remediated) (?:automatically|by (?:mova|the system|automation|itself))|zero[- ]touch|no[- ]touch|without (?:a )?(?:human|person|engineer|anyone)|no human|what did mova ?io (?:fix|do)|automation fixed/)) return autoFixed(s, now, has(/month|30 days/) ? 30 : 7);
  if (has(/summar|recap|leadership|executive|\bexec\b|weekly (?:report|review|update)|report for (?:my |the )?(?:boss|vp|leaders?|management)|what happened last week|last week'?s incidents|week in review|brief (?:me|for)/)) return leadership(s, now);
  if (!b && has(/uptime|availability|\bmttr\b|mean time|time to (?:restore|repair|resolve|fix)|how (?:fast|quickly) (?:did )?we (?:fix|restore|resolve)|how did we do|scorecard|last month (?:vs|versus|against)|(?:sla|kpis?) last month/)) return scorecard(s);
  if (has(/capacity|run(?:ning)? out of|outgrow|hit (?:their |the |its )?(?:bandwidth|wi-?fi|wan)|(?:bandwidth|wi-?fi|wan) limits?|limits? in the next|next \d+ days|next (?:quarter|3 months)|need (?:more|an?) (?:bandwidth|upgrade)|bandwidth upgrade|will (?:be )?(?:full|congested|saturated)/)) return capacity(s);
  if (has(/flap|bouncing (?:lines|circuits)|unstable (?:lines|circuits|isp)|service credits?|carrier credits?|sla credits?/) || (has(/breach|sla|availability/) && has(/circuits?|\bisp\b|carriers?|\blines?\b/))) return circuitSla(s, now);
  if (has(/(?:top|biggest|heaviest|most|largest|main) .*(?:bandwidth|talkers?|users?|consumers?|traffic|data)|netflow|bandwidth (?:hogs?|usage|use|users?)|(?:using|used|eating|consuming) (?:the )?(?:most )?(?:bandwidth|data|the line)|top talkers?|busiest|traffic (?:at|for|on|by)/)) {
    if (b) return topTalkers(s, b, now);
    // no store named: the busiest stores, so the next question can pick one
    const top = D.BRANCHES.map(x => ({ b: x, nf: D.netflowOf(x) })).sort((x, y) => y.nf.peak - x.nf.peak).slice(0, 8);
    return { title: 'Busiest branches yesterday (peak line use)', lead: 'Name a branch for its top applications and devices, e.g. "Show top bandwidth users at Branch 45 yesterday."', blocks: [bars(top.map(x => ({ label: sn(x.b), sub: `${x.nf.line.carrier} ${x.nf.line.bw} Mb/s`, value: x.nf.peak, display: `${x.nf.peak}%`, tone: x.nf.peak >= 90 ? 'bad' : 'warn' })))], src: 'NetFlow, Orchestrator', links: [] };
  }
  const changeQ = has(/what (?:has |was |got )?change|changes? (?:at|to|on|in|for|made)\b|recent(?:ly)? change|anything (?:been )?change|config(?:uration)? change|who changed|modified|modifications?|what was done (?:at|to)/) && !has(/scheduled|planned|upcoming|next|coming|approv/);
  if (changeQ) return b ? whatChanged(s, b, q, now) : changesEstate(s, now);
  const slowQ = has(/\bslow|slowness|sluggish|lag(?:gy|ging)?|latency issue|performance (?:issue|problem)|root cause|\brca\b|what caused|why (?:was|is|did)|what happened (?:at|to|with)|network,? (?:or )?isp|isp,? or|isp or application/);
  if (b && slowQ) return rootCause(s, b, q, now);
  if (has(/backup (?:isp|line|path|circuit|link|internet|connection)|on (?:the )?backup|backup only|only on backup|on (?:lte|4g|5g|cellular|their backup|secondary)|failover|failed over\b|fail(?:ed)? over to|secondary (?:isp|line|circuit)|lost (?:their |the )?primary|primary (?:line|circuit|isp|link) (?:is )?down/) && !has(/spare|config backup|nightly|overnight|backups? fail/)) return onBackup(s, now);
  if (!b && slowQ) return slowNow(s, now);
  if (!b && has(/(?:down|degraded|offline|unreachable|outages?|impacted|affected|unhealthy|problems?|issues?|broken|not (?:ok|healthy|working|trading)|red\b|in trouble|having trouble)/) && has(/stores?|branch|branches|sites?|locations?|where|which|what|any|show|list|network|right now|currently/) && !has(/device|switch|\bap\b|access point|edgeconnect|circuit|\blines?\b|ticket|incident|approval|project|onboard|firmware|config|backup|drift|cve|record|known error|article|\bkb\b/)) return downDegraded(s, now);
  // how-to questions go to knowledge before any keyword below grabs them
  if (/^how (?:do|can|should) (?:i|we)|how to (?:fix|check|handle)|what should i do/.test(t)) {
    const words = t.split(/\W+/).filter(w => w.length > 2 && !/how|what|should|the|that|fix|check|handle|with|when|from/.test(w));
    const k = s.kb.map(x => ({ x, n: words.filter(w => (x.title + ' ' + x.tags.join(' ') + ' ' + x.body).toLowerCase().includes(w)).length })).filter(y => y.n).sort((a, c) => c.n - a.n);
    if (k.length) { const top = k[0].x; return { title: `${top.id}: ${top.title}`, lead: top.body, blocks: k.length > 1 ? [{ type: 'heading', text: 'Also relevant' }, list(k.slice(1, 4).map(y => ({ k: y.x.id, v: y.x.title })))] : [], src: 'Knowledge base', links: [L('Knowledge', 'knowledge')] }; }
  }
  if (/(?:stores?|branches|sites?) (?:are )?open (?:now|right now)|how many (?:stores|branches) are open|open (?:stores|branches) now/.test(t)) {
    const rows = D.BRANCHES.map(x => ({ b: x, c: branchClock(x, now) }));
    const tz = {}; rows.forEach(r => { const z = tzAbbr(r.b.tz); tz[z] = tz[z] || [0, 0]; tz[z][1]++; if (r.c.open) tz[z][0]++; });
    const n = rows.filter(r => r.c.open).length;
    return { title: `${n} of 900 stores are open now`, lead: n ? 'Store hours are local; changes and reboots at open stores need a human.' : 'Every store is closed right now, so low-risk fixes can run on their own.', blocks: [bars(Object.entries(tz).map(([z, [o, all]]) => ({ label: z, sub: `${all} stores`, value: o, display: `${o} open`, tone: 'info' })), { max: Math.max(...Object.values(tz).map(v => v[1])) })], src: 'Store hours by time zone', links: [L('Branch readiness', 'readiness')] };
  }
  if (/(?:circuits?|lines?|wan|isp) .*(?:down|degraded|impaired)|(?:down|degraded) (?:circuits?|lines?)/.test(t) && !b) {
    const cs = D.CIRCUITS.map(c => circuitOf(s, c.id)).filter(c => c.status !== 'Up');
    return { title: `${cs.filter(c => c.status === 'Down').length} circuits down, ${cs.filter(c => c.status === 'Degraded').length} degraded`, blocks: [tbl(['Circuit', 'Store', 'Status', 'Quality'], cs.map(c => ({ branch: c.branchId, cells: [{ text: `${c.carrier} ${c.type}`, bold: true, sub: `${c.id} (${c.role.toLowerCase()})` }, sn(brOf(c.branchId)), { text: c.status, tone: c.status === 'Down' ? 'bad' : 'warn' }, c.status === 'Down' ? 'no traffic' : `loss ${c.loss}%, jitter ${c.jit} ms`] })))], src: 'EdgeConnect Orchestrator', links: [L('Carrier management', 'carriers')] };
  }
  if (/devices? (?:are )?(?:down|offline|unreachable)|(?:down|offline) devices/.test(t)) {
    const rows = s.incidents.filter(i => i.state !== 'Resolved' && /offline|unreachable|not responding|down/i.test(i.title) && !/circuit/i.test(i.title)).map(i => ({ i, d: D.DEV[i.ci] }));
    const behind = sum(rows.filter(r => r.i.kind === 'edgedown'), r => D.devicesOf(r.i.branchId).length - 1);
    return { title: `${rows.length} devices down right now`, lead: behind ? `Plus ${behind} switches and APs behind the unreachable EdgeConnects; their alarms are suppressed as children of the EdgeConnect.` : '', blocks: [tbl(['Device', 'Store', 'Incident', 'Since'], rows.map(r => ({ inc: r.i.id, cells: [{ text: r.i.ci, bold: true, sub: r.d ? r.d.model : '' }, sn(brOf(r.i.branchId)), r.i.title, ago(r.i.opened, now)] })))], src: 'Orchestrator, Aruba Central, OpsRamp', links: [L('Live incidents', 'incidents')] };
  }
  if (/freeze/.test(t)) {
    const act = s.freezes.filter(f => now >= f.start && now <= f.end);
    return { title: act.length ? `${act.length} change freeze active now` : `No change freeze now; ${s.freezes.length} coming up`, blocks: [tbl(['Freeze', 'When', 'Scope', 'Why'], s.freezes.map(f => ({ cells: [{ text: f.name, bold: true, sub: f.id }, `${dt(f.start)} → ${dt(f.end)}`, f.scope, f.reason] })))], src: 'ServiceNow change calendar', links: [L('Change calendar', 'changes', { tab: { changes: 'calendar' } })] };
  }
  if (/repeat[- ]offender/.test(t)) {
    const cs = D.CIRCUITS.filter(c => c.tickets90 >= 3).map(c => circuitOf(s, c.id)).sort((a, c) => c.tickets90 - a.tickets90);
    return { title: `${cs.length} repeat-offender circuits (3 or more tickets in 90 days)`, blocks: [tbl(['Circuit', 'Store', 'Tickets 90 d', 'No fault found'], cs.slice(0, 14).map(c => ({ branch: c.branchId, cells: [{ text: `${c.carrier} ${c.type}`, bold: true, sub: c.id }, sn(brOf(c.branchId)), c.tickets90, c.ntf90] })))], src: 'ServiceNow tickets, carrier cases', links: [L('Repeat offenders', 'carriers', { tab: { carriers: 'repeat' } })] };
  }
  // role and screen topics
  if (/overnight|last night/.test(t)) {
    const start = now - 14 * HR;
    const night = allInc(s).filter(i => i.opened >= start && i.opened <= now).sort((a, c) => a.opened - c.opened);
    const res = night.filter(i => i.state === 'Resolved');
    return { title: `Overnight (last 14 h): ${night.length} incidents`, lead: `${res.length} resolved (${res.filter(i => i.auto).length} with no human touch), ${night.length - res.length} still open.`, blocks: [tbl(['Incident', 'Store', 'What', 'State'], night.slice(-10).reverse().map(i => ({ inc: i.id, cells: [{ text: `${i.id} ${i.pri}`, bold: true }, sn(brOf(i.branchId)), i.title, { text: i.state === 'Resolved' ? (i.auto ? 'Auto-fixed' : 'Resolved') : i.state, tone: i.state === 'Resolved' ? 'ok' : 'warn' }] })))], src: 'ServiceNow incidents, OpsRamp events', links: [L('Live incidents', 'incidents'), L('Shift handover report', 'reports', { tab: { reports: 'handover' } })] };
  }
  if (/close to breach|breaching|sla risk|near breach|at risk of breach/.test(t)) {
    const r = open.map(i => ({ i, c: slaClock(i, now) })).filter(x => x.c.used > 0.5 || (x.c.respLeft != null && x.c.respLeft < 10 * MIN)).sort((a, c) => c.c.used - a.c.used);
    return { title: `${r.length} incidents above 50% of their SLA clock`, blocks: r.length ? [tbl(['Incident', 'Store', 'Clock used', 'Left'], r.slice(0, 10).map(({ i, c }) => ({ inc: i.id, cells: [{ text: `${i.id} ${i.pri}`, bold: true, sub: i.title }, sn(brOf(i.branchId)), { text: `${Math.round(c.used * 100)}%`, tone: c.used > 0.75 ? 'bad' : 'warn' }, c.resLeft > 0 ? dur(c.resLeft) : 'BREACHED'] })))] : [text('Nothing at risk right now.', 'ok')], src: 'SLA clocks (Annexure B targets)', links: [L('SLA & KPI tracker', 'sla')] };
  }
  if (/not (?:been )?acknowledged|unacknowledged|unassigned incident|nobody (?:owns|on)/.test(t)) {
    const r = open.filter(i => !i.acked || !i.assignee);
    return { title: `${r.length} incident${r.length === 1 ? '' : 's'} not acknowledged or unassigned`, blocks: [tbl(['Incident', 'Store', 'Opened'], r.map(i => ({ inc: i.id, cells: [{ text: `${i.id} ${i.pri}`, bold: true, sub: i.title }, sn(brOf(i.branchId)), ago(i.opened, now)] })))], src: 'ServiceNow', links: [L('Live incidents', 'incidents')] };
  }
  if (/\bp[1-4]\b|open incidents|incidents? (?:open|right now|today)|how many incidents|incident queue/.test(t)) {
    const pr = (t.match(/\bp([1-4])\b/g) || []).map(x => x.toUpperCase());
    const r = open.filter(i => !pr.length || pr.includes(i.pri)).sort((a, c) => a.pri.localeCompare(c.pri) || a.opened - c.opened);
    return { title: `${r.length} open ${pr.length ? pr.join('/') + ' ' : ''}incidents`, lead: ['P1', 'P2', 'P3', 'P4'].map(p => `${open.filter(i => i.pri === p).length} ${p}`).join(', ') + ` open in total; ${open.filter(i => i.state === 'On Hold – Carrier').length} on hold with a carrier.`, blocks: [tbl(['Incident', 'Store', 'State', 'Owner'], r.slice(0, 12).map(i => ({ inc: i.id, cells: [{ text: `${i.id} ${i.pri}`, bold: true, sub: i.title }, sn(brOf(i.branchId)), i.state, i.assignee || '–'] })))], src: 'ServiceNow', links: [L('Live incidents', 'incidents')] };
  }
  if (/approval|waiting on (?:a )?human|human in the loop/.test(t) && !/who approved/.test(t)) {
    const p = s.approvals.filter(a => a.status === 'Pending');
    return { title: `${p.length} actions waiting for a human`, blocks: [tbl(['Approval', 'Action', 'Why a human'], p.map(a => ({ branch: a.branchId, cells: [{ text: a.id, bold: true, sub: `${Math.round(a.conf * 100)}% · ${a.risk} risk` }, a.title, a.why[0]] })))], src: 'Approvals queue (ServiceNow)', links: [L('Open approvals', 'changes', { tab: { changes: 'approvals' } })] };
  }
  if (/drift/.test(t)) {
    const d = s.drift.filter(x => !/high/.test(t) || x.sev === 'High');
    return { title: `${d.length} devices drifted from the golden config`, blocks: [tbl(['Device', 'Store', 'What', 'Source'], d.map(x => ({ branch: x.branchId, cells: [{ text: x.device, bold: true, sub: x.sev }, sn(brOf(x.branchId)), x.item, `${x.source}, ${ago(x.since, now)}`] })))], src: 'Network-as-Code repo vs nightly backups', links: [L('Drift detection', 'changes', { tab: { changes: 'drift' } })] };
  }
  if (/scheduled|next 72|changes planned|any changes|change calendar|upcoming changes|freeze/.test(t)) {
    const bb = role === 'bm' ? brOf(s.bmBranch) : b;
    const ch = s.changes.filter(c => c.start > now && c.start < now + (bb ? 14 : /week/.test(t) ? 7 : 3) * DAY && (!bb || c.scope === 'All regions' || c.scope === bb.region)).sort((a, c) => a.start - c.start);
    return { title: bb ? `Changes that could touch ${sn(bb)} (14 days)` : `${ch.length} changes in the next ${/week/.test(t) ? '7 days' : '72 hours'}`, blocks: [ch.length ? tbl(['Change', 'What', 'When', 'State'], ch.map(c => ({ cells: [{ text: c.id, bold: true, sub: c.risk }, c.title, c.window, c.state] }))) : text('No changes planned.'), list(s.freezes.map(f => ({ k: f.id, v: `${f.name}: ${dt(f.start)} → ${dt(f.end)} (${f.scope})` })))], src: 'ServiceNow change calendar', links: [L('Change calendar', 'changes', { tab: { changes: 'calendar' } })] };
  }
  if (/critical cve|cve|vulnerab|advisor|exposed|patch/.test(t)) {
    const rows = D.ADVISORIES.map(a => ({ a, n: D.DEVICES.filter(d => a.affects(d)).length }));
    const crit = D.DEVICES.filter(d => D.vulnsOf(d).some(a => a.sev === 'Critical'));
    return { title: `${num(crit.length)} devices with a critical CVE across ${new Set(crit.map(d => d.branchId)).size} stores`, blocks: [tbl(['Advisory', 'What', 'Devices', 'Fixed in'], rows.map(({ a, n }) => ({ cells: [{ text: a.id, bold: true, sub: `${a.sev}${a.cvss ? ` ${a.cvss}` : ''}` }, a.title, num(n), a.fixed] })))], src: 'HPE Aruba Networking bulletins matched to inventory', links: [L('Lifecycle & vulnerabilities', 'vuln')] };
  }
  if (/end of (?:life|support|sale)|eol|eos|lifecycle|warranty|support contract/.test(t)) {
    const by = {}; D.DEVICES.forEach(d => { const l = D.lifecycleOf(d).status; by[l] = (by[l] || 0) + 1; });
    const lapsed = D.DEVICES.filter(d => d.type === 'SD-WAN' && d.warranty < now).length;
    return { title: 'Lifecycle across 4,075 devices', blocks: [bars(Object.entries(by).map(([k, v]) => ({ label: k, value: v, display: num(v), tone: /support/.test(k) ? 'bad' : /sale/.test(k) ? 'warn' : 'ok' }))), text(`728 Aruba 2530 switches: end of support 31 Jan 2027 (48G) and 31 Mar 2027 (24G); replace with CX 6100. EC-XS end of sale 31 Jan 2026, end of support 31 Jan 2031. ${lapsed} EdgeConnect support contracts lapsed.`)], src: 'HPE Aruba Networking notices, inventory', links: [L('Lifecycle & vulnerabilities', 'vuln')] };
  }
  if (/firmware/.test(t)) {
    const groups = {};
    D.DEVICES.forEach(d => { const k = d.type === 'AP' ? 'AP' : d.model; const idx = D.FW_TARGET[k].indexOf(d.fw); (groups[k] = groups[k] || { n: 0, ok: 0 }); groups[k].n++; if (idx <= (d.type === 'SD-WAN' ? 1 : 2)) groups[k].ok++; });
    const below = sum(Object.values(groups), g => g.n - g.ok);
    return { title: `${num(below)} devices below firmware policy`, lead: 'Policy: EdgeConnects at N-1 or newer; everything else at N-2 or newer.', blocks: [bars(Object.entries(groups).map(([k, g]) => ({ label: k === 'AP' ? 'Access points' : k, sub: `${g.n - g.ok} below policy`, value: g.ok / g.n * 100, display: P(g.ok / g.n), tone: g.ok / g.n > 0.98 ? 'ok' : 'warn' })), { max: 100 })], src: 'Aruba Central + Orchestrator inventory', links: [L('Firmware compliance', 'changes', { tab: { changes: 'firmware' } })] };
  }
  if (/config backup|backups? fail|nightly backup/.test(t)) {
    const f = D.DEVICES.filter(d => d.backup.st === 'Failed'), st = D.DEVICES.filter(d => d.backup.st === 'Stale');
    return { title: `${f.length} config backups failed last night, ${st.length} stale`, blocks: [list(f.slice(0, 8).map(d => ({ k: d.id, v: `${sn(brOf(d.branchId))} – ${d.backup.why}`, branch: d.branchId })))], src: 'OpsRamp nightly backups', links: [L('Device inventory', 'inventory')] };
  }
  if (/device|switch|access point|\baps?\b|edgeconnect|inventory|how many (?:devices|switches)/.test(t) && !b) {
    const by = {}; D.DEVICES.forEach(d => { const k = `${d.type} – ${d.model}`; by[k] = (by[k] || 0) + 1; });
    const downD = s.incidents.filter(i => i.state !== 'Resolved' && /offline|unreachable|down/.test(i.title) && !/circuit/i.test(i.title)).length;
    return { title: `${num(D.DEVICES.length)} devices: 933 EdgeConnects, 1,856 switches, 1,286 APs`, lead: `${downD} devices down right now (each has an incident). ${num(D.CENTRAL_N)} managed in Aruba Central, the rest standalone and polled by OpsRamp.`, blocks: [bars(Object.entries(by).sort((a, c) => c[1] - a[1]).slice(0, 10).map(([k, v]) => ({ label: k, value: v, display: num(v), tone: 'info' })))], src: 'Inventory (CMDB)', links: [L('Device inventory', 'inventory')] };
  }
  if (/ready to open|ready\?|not ready|readiness/.test(t)) {
    if (b) { const ch = branchChecks(s, b); const fails = Object.entries(ch.c).filter(([, x]) => x.st !== 'pass'); return { title: `${sb(b)}: ${ch.result}`, lead: `Local time ${branchClock(b, now).local}.`, blocks: [list(fails.length ? fails.map(([k, x]) => ({ k: k.toUpperCase(), v: x.detail })) : [{ k: '✓', v: 'Primary and backup lines, EdgeConnect, tunnels, switches, Wi-Fi, DHCP, config, payment and ERP paths all passing' }])], src: 'Readiness checks', links: [L('Branch readiness', 'readiness', { filters: { region: 'All', city: 'All', brand: 'All', branchId: b.id } })] }; }
    const nr = D.BRANCHES.map(x => ({ b: x, r: branchChecks(s, x) })).filter(x => x.r.result === 'Not ready' || x.r.result === 'Needs attention');
    return { title: `${nr.filter(x => x.r.result === 'Not ready').length} stores not ready, ${nr.filter(x => x.r.result === 'Needs attention').length} need attention`, blocks: [tbl(['Store', 'Result', 'First issue'], nr.slice(0, 12).map(x => ({ branch: x.b.id, cells: [{ text: sn(x.b), bold: true }, { text: x.r.result, tone: x.r.result === 'Not ready' ? 'bad' : 'warn' }, Object.values(x.r.c).find(c => c.st !== 'pass')?.detail || x.r.incs[0]?.title || ''] })))], src: 'Readiness checks', links: [L('Branch readiness', 'readiness')] };
  }
  if (/carrier case|open cases|carrier ticket/.test(t)) {
    const cs = s.cases.filter(c => !c.closed);
    return { title: `${cs.length} carrier cases open, ${cs.filter(c => c.eta && now > c.eta).length} past ETA`, blocks: [tbl(['Case', 'Store', 'Status', 'ETA'], cs.map(c => ({ branch: c.branchId, cells: [{ text: c.id, bold: true, sub: c.carrier }, sn(brOf(c.branchId)), c.status, c.eta ? (now > c.eta ? { text: `passed ${dur(now - c.eta)}`, tone: 'bad' } : ct(c.eta)) : '–'] })))], src: 'Carrier cases', links: [L('Carrier management', 'carriers')] };
  }
  if (/repeat offender|no trouble found|\bntf\b|scorecard|carrier performance|worst carrier|best carrier/.test(t)) {
    return { title: 'Carrier scorecard, 6 months', blocks: [tbl(['Carrier', 'Circuits', 'Cases', 'No fault found', 'MTTR', 'Commitment met'], D.SCORECARD.map(x => ({ cells: [{ text: x.carrier, bold: true }, num(x.circuits), x.cases6m, x.ntf, `${x.mttr} h`, { text: P(x.slaMet, 0), tone: x.slaMet < 0.9 ? 'warn' : 'ok' }] })))], src: 'Carrier scorecard', links: [L('Carrier scorecard', 'carriers', { tab: { carriers: 'scorecard' } })] };
  }
  if (/technician arriving|tech arriving|when is the tech/.test(t)) {
    const bb = b || brOf(s.bmBranch); const wos = s.workOrders.filter(w => w.branchId === bb.id && w.status !== 'Completed');
    return { title: wos.length ? `${wos.length} visit(s) for ${sn(bb)}` : `No technician visits booked for ${sn(bb)}`, blocks: [list(wos.map(w => ({ k: w.id, v: `${w.task} – ${w.status}${w.eta ? `, ETA ${lt(w.eta, bb)}` : ''}` })))], src: 'ServiceNow work orders', links: [L('Field dispatch', 'dispatch')] };
  }
  if (/my jobs|jobs today|unassigned work|work orders?|dispatch|field visit/.test(t)) {
    const me = s.techs.find(x => x.name === 'Carlos M.') || s.techs[0];
    const mine = /unassigned/.test(t) ? s.workOrders.filter(w => !w.tech) : role === 'tech' && /my/.test(t) ? s.workOrders.filter(w => w.tech === me.id) : s.workOrders;
    return { title: /unassigned/.test(t) ? `${mine.length} unassigned work orders` : role === 'tech' && /my/.test(t) ? `${me.name}: ${mine.length} job(s)` : `${mine.length} work orders`, blocks: [tbl(['Work order', 'Store', 'Task', 'Status'], mine.map(w => ({ branch: w.branchId, cells: [{ text: w.id, bold: true, sub: w.priority }, sn(brOf(w.branchId)), w.task, `${w.status}${w.eta ? `, ETA ${ct(w.eta)}` : ''}`] })))], src: 'ServiceNow work orders', links: [L('Field dispatch', 'dispatch')] };
  }
  if (/technicians?|who is available|on site/.test(t)) {
    const av = s.techs.filter(x => x.status === 'Available');
    return { title: `${av.length} of ${s.techs.length} technicians available`, blocks: [tbl(['Technician', 'Region', 'Status', 'Skills'], s.techs.map(x => ({ cells: [{ text: x.name, bold: true, sub: x.base }, x.region, { text: x.status, tone: x.status === 'Available' ? 'ok' : undefined }, x.skills.join(', ')] })))], src: 'Field dispatch', links: [L('Technicians', 'dispatch', { tab: { dispatch: 'techs' } })] };
  }
  if (/spares|depot|stock/.test(t)) {
    const cy = cityIn(q); const ds = s.depots.filter(d => !cy || d.city.startsWith(cy));
    return { title: cy && ds.length ? `Spares at ${ds[0].city}` : 'Depot spares', blocks: [tbl(['Depot', 'Stock'], (ds.length ? ds : s.depots).map(d => ({ cells: [{ text: d.city, bold: true, sub: d.id }, Object.entries(d.spares).map(([k, v]) => `${k} ${v}`).join(', ')] })))], src: 'Depot stock', links: [L('Depot spares', 'dispatch', { tab: { dispatch: 'depots' } })] };
  }
  if (/branch hours|store hours|limit my visits|opening hours/.test(t)) {
    return { title: 'Store hours that shape visits', blocks: [list([{ k: 'Roofing', v: '06:30–17:00 local weekdays; about 45% also Saturday 07:00–12:00' }, { k: 'Pool', v: '07:00–17:00, most open Saturday 08:00–12:00' }, { k: 'Changes', v: 'Only outside hours unless the device is already down (P1/P2)' }, { k: 'Yard', v: 'Avoid 07:00–09:00 yard loading for lift work' }])], src: 'Branch profiles', links: [L('Field dispatch', 'dispatch')] };
  }
  if (/pci/.test(t)) {
    return { title: 'PCI segment at the LS Building Products cutover site', blocks: [list([{ k: 'VLAN 20', v: 'POS / payments, own policy; no routes to VLAN 10/30/50/60' }, { k: 'Gate 8', v: 'POS / payment test – must pass before StoreOps sign-off' }, { k: 'Legacy POS', v: 'Replaced with SRS standard; old units recycled with data destruction certificate' }])], src: 'NaC site file sites/ls-building-products/il-01.yaml', links: [L('Kit & VLANs', 'biab', { tab: { biab: 'kit' } })] };
  }
  if (/cutover|this weekend/.test(t)) {
    const p = s.projects.filter(x => x.stage === 'Cutover' || x.stage === 'Kit staged');
    return { title: `${p.length} cutovers in the coming weekends`, blocks: [tbl(['Project', 'Stage', 'Gates', 'Go-live'], p.map(x => ({ cells: [{ text: `${x.brand} – ${x.site}`, bold: true, sub: x.id }, { text: `${x.stage}, ${x.rag}`, tone: x.rag === 'Green' ? 'ok' : x.rag === 'Red' ? 'bad' : 'warn' }, `${x.gates.filter(g => g.st === 'Pass').length}/13`, dt(x.golive)] })))], src: 'Branch-in-a-Box projects', links: [L('Cutover tracker', 'biab', { tab: { biab: 'cutover' } })] };
  }
  if (/project|onboard|acquisition|acquired|greenfield|branch-in-a-box|new (?:store|branch)/.test(t)) {
    const p = /red|blocked|at risk|amber/.test(t) ? s.projects.filter(x => x.rag !== 'Green') : /acqui/.test(t) ? s.projects.filter(x => x.track === 'Acquired' && x.stage !== 'BAU') : s.projects;
    return { title: `${p.length} ${/red|blocked|at risk|amber/.test(t) ? 'onboarding projects not green' : /acqui/.test(t) ? 'acquired-branch projects in flight' : 'onboarding projects'}`, blocks: [tbl(['Project', 'Track', 'Stage', 'Blocker'], p.map(x => ({ cells: [{ text: `${x.brand} – ${x.site}`, bold: true, sub: x.id }, x.track, { text: `${x.stage}, ${x.rag}`, tone: x.rag === 'Green' ? 'ok' : x.rag === 'Red' ? 'bad' : 'warn' }, x.blockers[0] || '–'] })))], src: 'Branch-in-a-Box portfolio', links: [L('Portfolio', 'biab')] };
  }
  if (/parity|day-1|day 1/.test(t)) {
    return { title: 'Day-1 parity – newest branch', blocks: [list([{ k: 'Site', v: 'American Roofing Supply – Nampa, ID (hypercare day 3): 100% parity' }, { k: 'Telemetry', v: 'OpsRamp, Central, Orchestrator, syslog, synthetic probes – all reporting' }, { k: 'Automation', v: '10/10 runbooks enabled' }, { k: 'AI coverage', v: '9/9 agents scoped to the site' }, { k: 'CMDB', v: '9 CIs with relationships' }])], src: 'Day-1 parity check', links: [L('Day-1 parity', 'biab', { tab: { biab: 'parity' } })] };
  }
  if (/who approved|audit/.test(t)) {
    const a = s.audit.filter(x => /approv/i.test(x.what) || /audit/.test(t));
    return { title: `${a.length} ${/audit/.test(t) ? 'audit entries' : 'approvals logged'}`, blocks: [list(a.slice(0, 10).map(x => ({ k: ct(x.t), v: `${x.who}: ${x.what}` })))], src: 'Audit log', links: [L('Audit log', 'reports', { tab: { reports: 'audit' } })] };
  }
  if (/told branches|tell branches|comms|notif(?:y|ied) (?:the )?(?:branch|store)/.test(t)) {
    const c = s.incidents.flatMap(i => i.agentSteps.filter(a => a.agent === 'comms').map(a => ({ ...a, inc: i.id })));
    return { title: `${c.length} store notifications sent`, blocks: [list(c.slice(0, 10).map(a => ({ k: `${ct(a.t)} ${a.inc}`, v: a.text, inc: a.inc })))], src: 'Comms agent log', links: [] };
  }
  if (/prediction|predict|forecast|watchlist|likely to fail|going to fail/.test(t)) {
    const p = s.predictions.filter(x => ['New', 'Watching'].includes(x.status));
    return { title: `${p.length} open predictions`, lead: 'Predictions never act on their own; each creates a watch or asks for approval.', blocks: [tbl(['Prediction', 'Target', 'Signal', 'Confidence'], p.map(x => ({ branch: x.branchId, cells: [{ text: x.id, bold: true, sub: x.kind }, x.branchId ? sn(brOf(x.branchId)) : x.target, x.signal, P(x.conf, 0)] })))], src: 'Prediction agent', links: [L('Predictive watchlist', 'predict')] };
  }
  if (/runbook|automation|automated|playbook/.test(t)) {
    return { title: `${s.runbooks.length} runbooks`, lead: `Auto-resolution ${P(D.SLA.find(x => /Auto-resolution/.test(x.name)).act)} this month (target 25%); automation coverage ${P(D.SLA.find(x => /coverage/.test(x.name)).act, 0)}.`, blocks: [tbl(['Runbook', 'Autonomy', 'Runs 30 d', 'Success'], s.runbooks.map(r => ({ cells: [{ text: `${r.id} ${r.name}`, bold: true }, `${r.autonomy} ${D.AUTONOMY[r.autonomy]}`, r.runs30, { text: P(r.success), tone: r.success < 0.9 ? 'warn' : 'ok' }] })))], src: 'Automation library', links: [L('Automation library', 'automation')] };
  }
  if (/agent|mova io doing|what is mova/.test(t)) {
    const X = live && live.x;
    const rows = Object.entries(D.AGENTS).map(([k, a]) => ({ k, a, g: X && X.agents ? Object.values(X.agents) : null }));
    const tot = X ? sum(Object.values(X.agents), g => g.today) : null;
    return { title: `Mova iO agents${tot ? `: ${num(tot)} actions today` : ''}`, blocks: [list(rows.map(({ a }) => ({ k: a.name, v: a.also || '' }))), ...(X ? [list(X.agentStream.slice(0, 6).map(e => ({ k: ct(e.t), v: e.text })))] : [])], src: 'Mova iO agent log', links: [L('Mova iO agents', 'agents')] };
  }
  if (/knowledge|\bkb\b|article|how do i|how to fix|problem record|known error/.test(t)) {
    if (/problem|known error/.test(t)) return { title: `${s.problems.length} problem records`, blocks: [tbl(['Problem', 'What', 'Incidents', 'State'], s.problems.map(p => ({ cells: [{ text: p.id, bold: true }, p.title, p.incidents, p.state] })))], src: 'Problem records', links: [L('Knowledge', 'knowledge')] };
    const words = t.split(/\W+/).filter(w => w.length > 3 && !/what|which|how|article|knowledge|about|there|with/.test(w));
    const k = s.kb.filter(x => words.some(w => (x.title + ' ' + x.tags.join(' ') + ' ' + x.body).toLowerCase().includes(w)));
    return { title: k.length ? `${k.length} articles match` : `${s.kb.length} published articles`, blocks: [list((k.length ? k : s.kb).map(x => ({ k: x.id, v: x.title })))], src: 'Knowledge base', links: [L('Knowledge', 'knowledge')] };
  }
  if (/(?:average|avg)? ?(?:latency|jitter|packet loss|\bloss\b)|tunnels?|wan quality|line quality/.test(t) && !b && S) {
    const v = k => S[k].at(-1);
    return { title: 'WAN quality now, averaged over the lines in use', blocks: [kpis([{ label: 'Latency to DC', value: `${Math.round(v('wan'))} ms`, sub: `normal ${D.AVG_LAT} ms` }, { label: 'Packet loss', value: `${v('loss').toFixed(2)}%` }, { label: 'Jitter', value: `${v('jit').toFixed(1)} ms` }, { label: 'Tunnels up', value: `${num(Math.round(v('tunnels')))} / 1,866` }])], src: 'EdgeConnect Orchestrator', links: [L('Live operations', 'live')] };
  }
  if ((/noise|correlat|suppress|dedup/.test(t) || (/events?|alerts?/.test(t) && /today|per minute|came in|so far/.test(t))) && live) {
    const c = live.counters; const raw = Math.max(0, c.events - c.suppressed);
    return { title: `${num(c.events)} events today, ${P(c.suppressed / Math.max(1, c.events), 0)} removed as noise`, blocks: [kpis([{ label: 'Events in', value: num(c.events) }, { label: 'Noise removed', value: num(c.suppressed), tone: 'ok' }, { label: 'Alerts left', value: num(raw) }, { label: 'Open incidents', value: open.length }])], src: 'OpsRamp, Orchestrator, Aruba Central, New Relic', links: [L('Correlation', 'correlation')] };
  }
  if (/sla|kpi|annexure|metric|target|error budget/.test(t)) {
    const nm = t.match(/#\s?(\d{1,2})\b/); const one = nm && D.SLA.filter(x => x.n === +nm[1]);
    const rows = one && one.length ? one : /below|miss|fail/.test(t) ? D.SLA.filter(x => x.lower ? x.act > x.esl : x.act < x.esl) : D.SLA;
    const st = x => (x.lower ? x.act <= x.esl : x.act >= x.esl) ? ['Meets ESL', 'ok'] : x.msl != null && x.act >= x.msl ? ['Above MSL', 'warn'] : x.msl == null ? ['Below target', 'warn'] : ['Below MSL', 'bad'];
    if (one && one.length === 1) { const x = one[0]; return { title: `#${x.n} ${x.name}: ${P(x.act, x.fmt || 1)} (${st(x)[0]})`, lead: `${x.def}. Expected ${P(x.esl, x.esl > 0.999 ? 2 : 0)}${x.msl != null ? `, minimum ${P(x.msl, 0)}` : ''}. ${x.cls}.`, blocks: [{ type: 'spark', label: 'Last 6 months', values: x.trend.map(v => +(v * 100).toFixed(3)) }], src: 'SLA & KPI tracker (Annexure B)', links: [L('SLA & KPI tracker', 'sla')] }; }
    return { title: /below|miss|fail/.test(t) ? `${rows.length} service levels below the expected level` : `${D.SLA.filter(x => st(x)[0] === 'Meets ESL').length} of ${D.SLA.length} service levels meet the expected level`, blocks: [tbl(['#', 'Metric', 'Actual', 'Expected', 'Status'], rows.map(x => ({ cells: [`#${x.n}`, x.name, P(x.act, x.fmt || 1), P(x.esl, x.esl > 0.999 ? 2 : 0), { text: st(x)[0], tone: st(x)[1] }] })))], src: 'SLA & KPI tracker (Annexure B)', links: [L('SLA & KPI tracker', 'sla')] };
  }
  if (/what can you|help|what do you know|what can i ask/.test(t)) {
    return { title: 'Ask about anything on the console', lead: 'Answers come from the same live data as every screen. Name a branch by number: "Branch 214" (or "Store 214").', blocks: [list(TOPICS.map(x => ({ k: '•', v: x })))], src: '', links: [] };
  }

  // a store, carrier, region, brand or city on its own
  if (b) return storeProfile(s, b, now);
  const car = carrierIn(q); if (car) return carrierProfile(s, car, now);
  const rg = regionIn(q); if (rg) return groupProfile(s, rg, D.BRANCHES.filter(x => x.region === rg), now, { region: rg, city: 'All', brand: 'All', branchId: null });
  const br = brandIn(q); if (br) return groupProfile(s, br, D.BRANCHES.filter(x => x.brand === br), now, { region: 'All', city: 'All', brand: br, branchId: null });
  const city = cityIn(q); if (city) { const bs = D.BRANCHES.filter(x => x.city === city); return groupProfile(s, `${city}`, bs, now, { region: 'All', city: `${city}, ${bs[0].state}`, brand: 'All', branchId: null }); }
  const kb = s.kb.filter(k => t.split(/\s+/).some(w => w.length > 3 && (k.title.toLowerCase().includes(w) || k.tags.join(' ').includes(w))));
  if (kb.length) return { title: `Knowledge matches for "${q}"`, blocks: [list(kb.slice(0, 4).map(k => ({ k: k.id, v: k.title })))], src: 'Knowledge base', links: [L('Knowledge', 'knowledge')] };
  return { title: 'I could not match that to live data', lead: 'Try a branch ("Branch 214"), an incident, change or device number, or one of the suggested questions. I can answer about:', blocks: [list(TOPICS.map(x => ({ k: '•', v: x })))], src: '', links: [] };
}
