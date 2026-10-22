// Extra live state for the richer visuals: area lanes (60 min), unified timeline (4 h), correlation
// outcomes, Mova iO agent activity, tool event rates, top branches and the branch heartbeat.
// Called once per live tick (2 s) from live.jsx. Values are simulated but driven by the same events
// the rest of the console shows, so a new incident in the feed also appears on every visual.
import * as D from './data.js';
import { rng, MIN, HR } from './util.js';
import { SPEED } from './speed.js';

// How long one heartbeat glow lasts (ms); the CSS beat animation uses the same length.
export const BEAT = 1400;

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const walk = (p, t, v, lo, hi) => Math.max(lo, Math.min(hi, p + (t - p) * 0.2 + rnd(-v, v)));

export const AREAS = [
  { id: 'wan', label: 'SD-WAN and circuits', metric: 'Packet loss, median across branches', unit: '%', base: 0.18, vol: 0.03, lo: 0, hi: 3, dec: 2 },
  { id: 'apps', label: 'Path to data centre', metric: 'Latency to data centre', unit: ' ms', base: 35, vol: 1.2, lo: 8, hi: 400, dec: 0 },
  { id: 'lan', label: 'LAN and Wi-Fi', metric: 'Access points down', unit: '', base: 9, vol: 0.8, lo: 0, hi: 80, dec: 0 },
  { id: 'power', label: 'EdgeConnect', metric: 'Appliances unreachable', unit: '', base: 1, vol: 0.3, lo: 0, hi: 40, dec: 0 },
  { id: 'sec', label: 'Security', metric: 'Failed admin logins per 5 min', unit: '', base: 4, vol: 0.9, lo: 0, hi: 60, dec: 0 },
  { id: 'field', label: 'Field', metric: 'Technicians on site', unit: '', base: 5, vol: 0.5, lo: 0, hi: 20, dec: 0 },
];
const CAT_AREA = { carriers: 'wan', inventory: 'lan', readiness: 'apps', predict: 'power', vuln: 'sec', dispatch: 'field', changes: 'mova', automation: 'mova', knowledge: 'mova', biab: 'field', incidents: 'mova' };
export const TL_LANES = [...AREAS.map(a => ({ id: a.id, label: a.label })), { id: 'mova', label: 'Mova iO' }];

export const AGENT_DEF = [
  { id: 'noise', name: 'Noise Reduction', group: 0, does: 'Clears transient alerts after the hold-down and rolls warnings into the daily digest.', tools: ['opsramp', 'aruba'], acts: b => [`Auto-cleared ${b.code}-wan1 flap after 40 s hold-down`, `Rolled 1 warning from ${b.name} into the daily digest`, `Suppressed SNMP timeout on ${b.code}-sw01 (next poll OK)`] },
  { id: 'correlation', name: 'Correlation', group: 0, does: 'Groups signals by topology, time window, carrier and change into one incident per branch.', tools: ['opsramp', 'servicenow'], acts: b => [`Grouped 4 signals at ${b.name} into one event`, `Linked ${b.code}-wan1 alarm to the open carrier incident`, `Matched ${b.name} alerts to the same carrier segment`] },
  { id: 'diagnosis', name: 'Diagnosis', group: 1, does: 'Ranks likely causes and rules the others out with evidence.', tools: ['aruba', 'central'], acts: b => [`Ruled out branch LAN at ${b.name}: switches and Wi-Fi healthy`, `Ranked 3 causes for ${b.name}; top: carrier congestion (84%)`, `Checked EdgeConnect health and both paths at ${b.name}`] },
  { id: 'prediction', name: 'Prediction', group: 1, does: 'Forecasts circuit decay, capacity and hardware failure.', tools: ['opsramp', 'movaio'], acts: b => [`Failure risk for ${b.code}-sw01 updated to ${rnd(0.2, 0.6).toFixed(2)}`, `Capacity forecast refreshed for ${b.code}-wan1`, `LTE signal trend checked at ${b.code}-wan2`] },
  { id: 'runbook', name: 'Runbook', group: 2, does: 'Runs approved runbooks inside the gate rules.', tools: ['aruba', 'central'], acts: b => [`RB-109 config backup re-run at ${b.name}: success`, `RB-104 AP reboot at ${b.name}: success in 2 m 41 s`, `RB-103 port bounce at ${b.name}: skipped, branch trading, sent for approval`] },
  { id: 'carrier', name: 'Carrier', group: 2, does: 'Raises and chases carrier cases with an evidence pack.', tools: ['servicenow'], acts: b => { const c = D.CIR[b.wan[0]]; return [`Updated ${c.carrier} case for ${b.name} with a fresh loss graph`, `Chased ${c.carrier} for an ETA on ${b.name}`, `Attached MTR from ${b.code}-ec01 to the ${c.carrier} case`]; } },
  { id: 'dispatch', name: 'Dispatch', group: 2, does: 'Matches field visits to skills, parts and branch hours.', tools: ['servicenow'], acts: b => [`Matched a Rack and closet technician for ${b.name}`, `Reserved a spare EC-XS at the nearest depot for ${b.name}`, `Moved the ${b.name} visit to after close`] },
  { id: 'verify', name: 'Verification', group: 3, does: 'Confirms recovery against the baseline before anything is closed.', tools: ['aruba', 'newrelic'], acts: b => [`Verified payment path at ${b.name}: 130 ms`, `Verified both tunnels up at ${b.name}`, `Verified handhelds re-associated at ${b.name}`] },
  { id: 'ticket', name: 'Ticket', group: 3, does: 'One ticket per event: merges duplicates, writes work notes, resolves.', tools: ['servicenow'], acts: b => [`Merged 2 duplicate tickets for ${b.name}`, `Wrote the work note for ${b.name}`, `Updated priority for ${b.name}: branch now open`] },
  { id: 'comms', name: 'Comms', group: 3, does: 'Keeps StoreOps and branch managers informed.', tools: ['servicenow'], acts: b => [`Sent a plain-language update to the ${b.name} manager`, `Posted the 30-minute update to StoreOps`, `Told ${b.name}: back on the main line, nothing to do`] },
  { id: 'change', name: 'Change Validation', group: 3, does: 'Checks freezes, calendar and canaries before and after every change.', tools: ['servicenow', 'central'], acts: () => { const c = pick(D.CHANGES); return [`${c.id}: pre-checks passed`, `${c.id}: canary within 2% of control`, `${c.id}: Network-as-Code lint and policy checks passed`]; } },
  { id: 'knowledge', name: 'Knowledge', group: 4, does: 'Suggests articles and similar past incidents; drafts new ones.', tools: ['servicenow'], acts: b => { const k = pick(D.KB); return [`Suggested ${k.id} on a ${b.name} ticket`, `Found 3 similar past incidents for ${b.name}`, `Drafted an article from a resolved ${b.name} ticket`]; } },
  { id: 'readiness', name: 'Branch Readiness', group: 4, does: 'Runs pre-opening checks at 05:30 local for every branch.', tools: ['opsramp', 'central'], acts: b => [`Readiness probe at ${b.name}: 10/10 pass`, `Re-ran the Wi-Fi check at ${b.name}: pass`, `Readiness probe at ${b.name}: 9/10, LTE backup retest OK`] },
];
export const AGENT_GROUPS = ['Noise and correlation', 'Diagnosis and prediction', 'Runbooks, carriers, dispatch', 'Verify, ticket, comms, change', 'Knowledge and readiness'];

export const TOOLS = [
  { id: 'aruba', name: 'EdgeConnect Orchestrator', srcs: ['Orchestrator'], base: 22 },
  { id: 'central', name: 'Aruba Central', srcs: ['Aruba Central'], base: 18 },
  { id: 'opsramp', name: 'HPE OpsRamp', srcs: ['OpsRamp'], base: 26 },
  { id: 'newrelic', name: 'New Relic', srcs: ['New Relic', 'Synthetic'], base: 12 },
  { id: 'servicenow', name: 'ServiceNow', srcs: ['ServiceNow', 'Field app'], base: 8 },
  { id: 'carrier', name: 'Carrier portals', srcs: ['Carrier portal'], base: 4 },
];

export const outcomeOf = e => e.inc ? 'Grouped' : /Watch/.test(e.out) ? 'Watching' : /Duplicate/.test(e.out) ? 'Grouped' : /Suppress|Auto-heal|Recovered|Patched/.test(e.out) ? 'Auto-cleared' : 'To the digest';
export const MONITOR_SRC = new Set(['Orchestrator', 'OpsRamp', 'Aruba Central', 'New Relic', 'Synthetic']);

export function seedX(now) {
  const R = rng(4242);
  const lanes = {};
  AREAS.forEach((a, k) => { let v = a.base; const s = []; for (let i = 0; i < 60; i++) { const step = (k === 0 && i > 34 && i < 47) ? a.base * 2.4 : (k === 1 && i > 34 && i < 47) ? a.base * 1.5 : (k === 2 && i > 18 && i < 25) ? a.base * 1.8 : (k === 5 && i > 40) ? a.base + 2 : a.base; v = Math.max(a.lo, v + (step - v) * 0.25 + (R() - 0.5) * a.vol * 2.4); s.push(+v.toFixed(a.dec + 1)); } lanes[a.id] = s; });
  const markers = []; for (let i = 0; i < 14; i++) markers.push({ t: now - Math.floor(R() * 58 * MIN) - MIN, kind: ['inc', 'inc', 'res', 'res', 'run', 'run', 'chg'][Math.floor(R() * 7)], area: AREAS[Math.floor(R() * AREAS.length)].id });
  const dots = []; for (let i = 0; i < 230; i++) { const lane = TL_LANES[Math.floor(R() * TL_LANES.length)].id; const t = now - Math.floor(Math.pow(R(), 0.8) * 4 * HR); dots.push({ t, lane, kind: R() < 0.08 ? 'inc' : R() < 0.1 ? 'chg' : 'ev' }); }
  const agents = {}; AGENT_DEF.forEach((a, i) => { agents[a.id] = { today: Math.floor(20 + R() * 300), ok: 0.93 + R() * 0.069, last: a.acts(D.BRANCHES[(i * 37) % 900])[0], lastT: now - Math.floor(R() * 20 * MIN) }; });
  const agentSeries = AGENT_GROUPS.map((g, k) => Array.from({ length: 30 }, () => Math.max(0, Math.round(3 + k * 0.6 + (R() - 0.5) * 4))));
  const agentStream = AGENT_DEF.map((a, i) => ({ id: `as${i}`, agent: a.id, t: now - Math.floor(R() * 15 * MIN), text: a.acts(D.BRANCHES[(i * 53) % 900])[1] })).sort((a, b) => b.t - a.t);
  const tools = {}; TOOLS.forEach(t => { tools[t.id] = Array.from({ length: 30 }, () => Math.round(t.base * (0.7 + R() * 0.6))); });
  const cands = D.BRANCHES.filter((b, i) => i % 15 === 3).map((b, i) => { const c = D.CIR[b.wan[0]]; return { id: b.id, wan: Math.min(96, c.util + 20 + R() * 28), lat: c.lat + R() * 14, loss: c.loss + R() * 0.6, cpu: 10 + R() * 60 }; });
  const corr = { auto: 0, digest: 0, grouped: 0, watch: 0 };
  const budgets = [[99.95, 99.962, 'Branches online', 'at least one working line, all 900 branches'], [99.9, 99.94, 'Jitter under 30 ms', 'lines in use, every branch; protects calls and payments'], [99.5, 99.71, 'Loss under 1%', 'lines in use, every branch; protects payments and ERP'], [98, 98.5, 'P1 and P2 answered in 15 min', 'Annexure B #1 and #2']].map(([target, actual, name, sub], k) => {
    const used = (100 - actual) / (100 - target); const series = []; let left = 1; for (let d = 0; d < 30; d++) { left -= used / 30 * (0.6 + R() * 0.8) * (d > 24 && k === 1 ? 2.2 : 1); series.push(+Math.max(0, left).toFixed(3)); }
    return { name, sub, target, actual, series };
  });
  return { lanes, markers, dots, agents, agentSeries, agentStream, tools, cands, corr, budgets, pulse: {}, rate: 36, seen: new Set(), tick: 0, minute: now };
}

export function tickX(Lc, st, now) {
  const X = Lc.x; X.tick++;
  const open = st.incidents.filter(i => i.state !== 'Resolved');
  const storm = open.some(i => i.major);
  // area lanes: last point walks every tick, a new minute starts every 30 ticks (60 s)
  AREAS.forEach(a => {
    const s = X.lanes[a.id];
    const tgt = a.id === 'wan' ? a.base * (storm ? 4 : 1) + Lc.flaps.length * 0.05 : a.id === 'lan' ? a.base + open.filter(i => i.kind === 'apdown').length * 2 : a.id === 'power' ? a.base + open.filter(i => /EdgeConnect/.test(i.title)).length * 3 : a.id === 'apps' ? a.base + (open.some(i => /POS|jitter/i.test(i.title)) ? 9 : 0) : a.base;
    s[s.length - 1] = +walk(s[s.length - 1], tgt, a.vol * 0.6, a.lo, a.hi).toFixed(a.dec + 1);
  });
  if (now - X.minute >= MIN) { X.minute = now; AREAS.forEach(a => { const s = X.lanes[a.id]; X.lanes[a.id] = [...s.slice(1), s[s.length - 1]]; }); X.agentSeries = X.agentSeries.map(s => [...s.slice(1), 0]); }
  X.markers = X.markers.filter(m => now - m.t < 60 * MIN);
  X.dots = X.dots.filter(d => now - d.t < 4 * HR);
  // new feed events → heartbeat, timeline dots, correlation outcomes, tool rates
  const fresh = Lc.feed.slice(0, 25).filter(e => !X.seen.has(e.id));
  fresh.forEach(e => {
    X.seen.add(e.id);
    X.pulse[e.branchId] = now + Math.random() * SPEED.tick * 0.5;
    X.dots.push({ t: e.t, lane: e.inc ? CAT_AREA.incidents : (CAT_AREA[e.cat] || 'mova'), kind: e.inc ? 'inc' : 'ev' });
    if (MONITOR_SRC.has(e.src)) { const o = outcomeOf(e); X.corr[{ 'Auto-cleared': 'auto', 'To the digest': 'digest', Grouped: 'grouped', Watching: 'watch' }[o]]++; }
    if (e.inc) X.markers.push({ t: now, kind: /resolved/.test(e.msg) ? 'res' : 'inc', area: 'wan' });
    if (e.cat === 'automation' && /^RB-/.test(e.msg)) X.markers.push({ t: now, kind: 'run', area: 'lan' });
    if (e.cat === 'changes') X.markers.push({ t: now, kind: 'chg', area: 'wan' });
  });
  if (X.seen.size > 600) X.seen = new Set([...X.seen].slice(-300));
  // routine readings arriving (branch heartbeat). Each reading gets its own arrival time spread across
  // the coming tick, so cells light up one after another instead of all at once every 2 seconds.
  const tick = SPEED.tick, nRead = Math.round(rnd(30, 42));
  for (let i = 0; i < nRead; i++) {
    const id = D.BRANCHES[Math.floor(Math.random() * 900)].id, at = now + Math.random() * tick;
    if (!(X.pulse[id] > at - BEAT)) X.pulse[id] = at;
  }
  X.rate += (nRead + fresh.length - X.rate) * 0.15;
  for (const k in X.pulse) if (now - X.pulse[k] > BEAT + tick) delete X.pulse[k];
  // tool event rates (events in this tick, scaled to a per-minute rate)
  TOOLS.forEach(t => { const n = fresh.filter(e => t.srcs.includes(e.src)).length; const s = X.tools[t.id]; X.tools[t.id] = [...s.slice(1), Math.round(t.base * (0.75 + Math.random() * 0.5) + n * 6)]; });
  // agents
  const nAct = Math.round(rnd(0.6, 3.2) + (storm ? 2 : 0) + fresh.length * 0.25);
  for (let k = 0; k < nAct; k++) {
    const a = AGENT_DEF[Math.floor(Math.pow(Math.random(), 1.4) * AGENT_DEF.length)]; const b = pick(D.BRANCHES); const text = pick(a.acts(b));
    const g = X.agents[a.id]; g.today++; g.last = text; g.lastT = now; g.ok = Math.min(0.999, Math.max(0.9, g.ok + rnd(-0.0015, 0.0015)));
    X.agentSeries[a.group][29]++;
    X.agentStream = [{ id: `${now}-${k}`, agent: a.id, t: now - k * 200, text }, ...X.agentStream].slice(0, 60);
  }
  // top branches (WAN use, latency, loss, EdgeConnect CPU)
  X.cands.forEach(c => { c.wan = walk(c.wan, c.wan, 2.2, 15, 98); c.lat = walk(c.lat, c.lat, 2, 10, 140); c.loss = walk(c.loss, c.loss, 0.05, 0, 3); c.cpu = walk(c.cpu, c.cpu, 2.5, 5, 95); });
  // error budgets: last point drifts; burns faster while a P1/P2 is open
  const hot = open.filter(i => i.pri === 'P1' || i.pri === 'P2').length;
  X.budgets.forEach((bd, k) => { const s = bd.series; const burn = (k === 0 ? 0.00008 : k === 1 ? 0.00012 : 0.00005) * (1 + hot * 0.4); s[s.length - 1] = +Math.max(0, s[s.length - 1] - burn).toFixed(4); });
}
