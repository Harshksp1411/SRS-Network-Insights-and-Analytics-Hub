// Network Intelligence: the numbers behind the three lenses, worked out from the console's own data.
//   Now  – live store and device health (OpsRamp telemetry): s, the live state
//   Then – managed-service history (ServiceNow): history.js, twelve months
//   Next – risk scores and forecasts from both
// One store and device hierarchy (branch → device or circuit) and one KPI dictionary for all three.
import * as D from '../data.js';
import * as HIST from '../history.js';
import { healthOf, onBackupOf, circuitOf, branchClock } from '../store.jsx';
import { statusOf, capOf, fwBehind, causeIncOf, creditOf } from '../dash/drilldata.js';
import { predictedTTR } from '../predict.js';
import { rng, MIN, HR, DAY, parts } from '../util.js';

export const REGIONS = D.REGIONS;
const inR = region => b => region === 'All' || b.region === region;
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const sum = a => a.reduce((x, y) => x + y, 0);
const midnight = now => { const p = parts(now); return now - (p.h * 60 + p.m) * MIN; };

// ───────────────────────────── NOW ─────────────────────────────
export const NOW_RANGES = [['today', 'Today'], ['7d', '7 days'], ['30d', '30 days']];
const RANGE_MS = { today: null, '7d': 7 * DAY, '30d': 30 * DAY };
// minutes a branch could not trade: open branch-down incidents now, plus resolved ones inside the window
function downMinutes(s, list, from, now) {
  const ids = new Set(list.map(b => b.id));
  const all = [...s.incidents, ...s.resolved].filter(i => ids.has(i.branchId) && (i.kind === 'edgedown' || (i.state !== 'Resolved' && healthOf(s, D.BR[i.branchId]) === 'down')));
  // one outage window per branch, so two tickets on the same outage are not counted twice
  const win = {}; all.forEach(i => { const a = Math.max(i.opened, from), z = Math.min(i.resolved || now, now); if (z <= a) return; const w = win[i.branchId]; win[i.branchId] = w ? [Math.min(w[0], a), Math.max(w[1], z)] : [a, z]; });
  return sum(Object.values(win).map(([a, z]) => (z - a) / MIN));
}
// estate availability: share of trading minutes. Longer windows add the month's history for this region.
export function availability(s, list, range, now) {
  const from = range === 'today' ? midnight(now) : now - RANGE_MS[range];
  const mins = Math.max(1, (now - from) / MIN) * list.length;
  const live = 1 - downMinutes(s, list, from, now) / mins;
  if (range === 'today') return live;
  const R = rng(list.length * 7 + (range === '7d' ? 1 : 2));
  const hist = D.SLA.find(m => m.n === 29).act - (R() - 0.5) * 0.0002 * (list.length < 200 ? 3 : 1);
  return Math.min(live, (live + hist * 3) / 4);
}
const LAYER_CAT = { 'Carrier / LEC': 'links', 'SD-WAN': 'edges', 'Branch connectivity': 'links', Switching: 'switches', 'Config management': 'switches', 'Customer-caused': 'switches', Wireless: 'aps' };
export function nowModel(s, now, range, region) {
  const list = D.BRANCHES.filter(inR(region));
  const st = { up: 0, degraded: 0, backup: 0, down: 0 }; list.forEach(b => st[statusOf(s, b)]++);
  const trading = list.length - st.down;
  const single = list.filter(b => healthOf(s, b) !== 'down' && (onBackupOf(s, b) || circuitOf(s, b.wan[1]).status === 'Down'));
  const avail = { today: availability(s, list, 'today', now), '7d': availability(s, list, '7d', now), '30d': availability(s, list, '30d', now) };
  const open = s.incidents.filter(i => i.state !== 'Resolved' && (region === 'All' || D.BR[i.branchId].region === region));
  // stores needing attention, ranked by business impact: outage length x trading now x devices affected
  const attention = list.filter(b => statusOf(s, b) !== 'up').map(b => {
    const k = statusOf(s, b), inc = causeIncOf(s, b), mins = inc ? (now - inc.opened) / MIN : 30;
    const devs = b.dev.ec + b.dev.sw + b.dev.ap, openNow = branchClock(b, now).open;
    const impact = (k === 'down' ? 1e6 : 0) + mins * (openNow ? 1 : 0.35) * (1 + (k === 'down' ? devs : 2) / 8) * (k === 'down' ? 3 : k === 'degraded' ? 1.4 : 1);
    return { b, k, inc, mins, devs: k === 'down' ? devs : inc ? 1 : 0, openNow, impact, why: inc ? inc.title : k === 'backup' ? 'Main line down, trading on the backup line' : 'Degraded' };
  }).sort((a, b) => b.impact - a.impact);
  // availability by region for the range
  const regions = REGIONS.map(r => { const l = D.BRANCHES.filter(b => b.region === r); return { r, n: l.length, avail: availability(s, l, range, now), down: l.filter(b => healthOf(s, b) === 'down').length, single: l.filter(b => single.includes(b)).length }; });
  // the four estate layers
  const ids = new Set(list.map(b => b.id)), cir = D.CIRCUITS.filter(c => ids.has(c.branchId)), devs = D.DEVICES.filter(d => ids.has(d.branchId));
  const issues = { links: 0, edges: 0, switches: 0, aps: 0 }; open.forEach(i => { issues[LAYER_CAT[i.cat] || 'switches']++; });
  const downIds = new Set(list.filter(b => healthOf(s, b) === 'down').map(b => b.id));
  const devDown = t => devs.filter(d => d.type === t && (downIds.has(d.branchId) || open.some(i => i.ci === d.id))).length;
  const R = rng(91 + list.length);
  const layer = (k, label, up, total, base) => ({ k, label, avail: Math.min(0.99995, base - (1 - up / Math.max(1, total)) * 0.08), open: issues[k], delta: +((R() - 0.45) * 0.16).toFixed(2), up, total });
  const linksUp = cir.filter(c => circuitOf(s, c.id).status !== 'Down' && !downIds.has(c.branchId)).length;
  const layers = [
    layer('links', 'Access links', linksUp, cir.length, avg(cir.map(c => D.availOf(c)))),
    layer('edges', 'SD-WAN edges', devs.filter(d => d.type === 'SD-WAN').length - devDown('SD-WAN'), devs.filter(d => d.type === 'SD-WAN').length, 0.9994),
    layer('switches', 'Switches', devs.filter(d => d.type === 'Switch').length - devDown('Switch'), devs.filter(d => d.type === 'Switch').length, 0.9993),
    layer('aps', 'Wi-Fi access points', devs.filter(d => d.type === 'AP').length - devDown('AP'), devs.filter(d => d.type === 'AP').length, 0.9978),
  ];
  const majors = open.filter(i => i.major || i.pri === 'P1' || (i.pri === 'P2' && (i.kind === 'edgedown' || healthOf(s, D.BR[i.branchId]) === 'down'))).map(i => ({ i, b: D.BR[i.branchId], etr: i.opened + predictedTTR(i) }));
  // capacity, availability and performance, for the store devices and the access links
  const linkLive = cir.map(c => circuitOf(s, c.id)).filter(c => c.status !== 'Down');
  const byCarrier = D.CARRIERS.map(n => { const l = linkLive.filter(c => c.carrier === n && c.type !== 'LTE/5G'); return l.length ? { n, lat: avg(l.map(c => c.lat)), jit: avg(l.map(c => c.jit)), loss: avg(l.map(c => c.loss)), k: l.length } : null; }).filter(Boolean).sort((a, b) => b.k - a.k);
  const caps = list.map(b => capOf(s, b));
  const failovers = { today: 0, '7d': 0, '30d': 0 };
  const allInc = [...s.incidents, ...s.resolved].filter(i => ids.has(i.branchId) && i.kind === 'circuit');
  Object.keys(failovers).forEach(k => { const from = k === 'today' ? midnight(now) : now - RANGE_MS[k]; failovers[k] = allInc.filter(i => i.opened >= from).length * (k === '30d' ? 4 : 1) + (k === 'today' ? 0 : Math.round(list.length * (k === '7d' ? 0.012 : 0.05))); });
  const backupMins = sum(single.map(b => { const inc = causeIncOf(s, b); return inc ? (now - inc.opened) / MIN : 45; }));
  const aps = devs.filter(d => d.type === 'AP');
  const dims = {
    availability: {
      dev: [['Devices down now', `${devDown('SD-WAN') + devDown('Switch') + devDown('AP')} of ${devs.length.toLocaleString()}`], ['Wi-Fi coverage', `${((1 - devDown('AP') / Math.max(1, aps.length)) * 100).toFixed(2)}% of APs up`], ['Switch and stack status', `${devs.filter(d => d.type === 'Switch').length - devDown('Switch')} switches up`]],
      link: [['Circuits down now', `${cir.length - linksUp} of ${cir.length.toLocaleString()}`], [`Failover events, ${range === 'today' ? 'today' : range}`, `${failovers[range]}`], ['Time on the backup path now', `${Math.round(backupMins / 60)} h across ${single.length} stores`]],
    },
    performance: {
      dev: [['CPU and memory', `p95 CPU ${Math.round(28 + R() * 6)}%, memory ${Math.round(41 + R() * 6)}%`], ['Interface errors', `${open.filter(i => i.kind === 'crc').length + 3} ports above threshold`], ['SD-WAN tunnel health', `${(99.2 + R() * 0.6).toFixed(1)}% of tunnels up and in policy`], ['Wireless client experience', `${Math.round(91 + R() * 4)} of 100`]],
      link: byCarrier.slice(0, 5).map(c => [c.n, `${Math.round(c.lat)} ms · ${c.jit.toFixed(1)} ms jitter · ${c.loss.toFixed(2)}% loss`]),
    },
    capacity: {
      dev: [['PoE power budget', `${Math.round(54 + R() * 8)}% used on average; ${Math.round(list.length * 0.02)} switches over 80%`], ['Switch port use', `${Math.round(61 + R() * 8)}% of ports in use`], ['AP client density', `${Math.round(avg(caps.map(c => c.wifiPeak)))}% airtime at peak; ${caps.filter(c => c.wifiPeak > 70).length} APs over 70%`]],
      link: [['Bandwidth at peak (95th percentile)', `${Math.round(avg(caps.map(c => c.wanP95)))}% on average`], ['Headroom per circuit', `${caps.filter(c => c.wanP95 >= 80).length} circuits under 20% headroom`], ['Need more capacity within 90 days', `${caps.filter(c => c.wanDays <= 90).length} circuits`]],
    },
  };
  return { list, st, trading, single, avail, regions, attention, layers, majors, dims, open, failovers };
}

// thresholds are tuned to the store profile, so a busy yard is not judged against a small branch
export const PROFILES = [
  { size: 'S', label: 'Small branch', n: () => D.BRANCHES.filter(b => b.size === 'S').length, lat: 120, loss: 1.5, util: 85, wifi: 75 },
  { size: 'M', label: 'Standard branch', n: () => D.BRANCHES.filter(b => b.size === 'M').length, lat: 100, loss: 1, util: 80, wifi: 70 },
  { size: 'L', label: 'High-volume yard', n: () => D.BRANCHES.filter(b => b.size === 'L').length, lat: 80, loss: 0.5, util: 75, wifi: 65 },
];

// ───────────────────────────── THEN ─────────────────────────────
export const THEN_RANGES = [['30d', '30 days'], ['90d', '90 days'], ['12m', '12 months']];
export const RANGE_N = { '30d': 1, '90d': 3, '12m': 12 };
// how much of each kind of ticket needs a truck roll, and what it is really caused by
const DISPATCH = { circuit: 0.05, jitter: 0.02, apdown: 0.45, crc: 0.6, lte: 0.15, scanner: 0.12, pos: 0.04, dhcp: 0.02, cpu: 0.3, backup: 0 };
const CAUSE = { circuit: { isp: 1 }, jitter: { isp: 1 }, lte: { isp: 0.8, hw: 0.2 }, pos: { isp: 0.85, cfg: 0.15 }, apdown: { power: 0.6, hw: 0.4 }, crc: { hw: 1 }, cpu: { user: 1 }, dhcp: { cfg: 0.5, user: 0.5 }, scanner: { cfg: 0.7, hw: 0.3 }, backup: { cfg: 1 } };
export const CAUSES = [['isp', 'Carrier / ISP'], ['hw', 'Hardware'], ['cfg', 'Configuration'], ['power', 'Power and site'], ['user', 'User and other']];
const PRI_SHARE = { P1: 0.02, P2: 0.08, P3: 0.45, P4: 0.45 };
export function thenModel(range, region) {
  const n = RANGE_N[range], P = HIST.period(n), P2 = n * 2 <= 12 ? HIST.period(n * 2) : null;
  const share = region === 'All' ? 1 : sum(P.branches.filter(x => x.b.region === region).map(x => x.tickets)) / Math.max(1, P.tickets);
  const sc = v => Math.round(v * share);
  const tickets = sc(P.tickets), prevTickets = P2 ? sc(P2.tickets - P.tickets) : null;
  const res = q => P.sla.find(x => x.m.queue === q && /resolution/.test(x.m.name)), resp = q => P.sla.find(x => x.m.queue === q && /response/.test(x.m.name));
  const slaAt = i => sum(['P1', 'P2', 'P3', 'P4'].map(q => PRI_SHARE[q] * res(q).series[i]));
  const sla = avg(P.months.map((_, i) => slaAt(i)));
  const prevSla = (() => { if (!P2) return null; const s2 = ['P1', 'P2', 'P3', 'P4'].map(q => P2.sla.find(x => x.m.queue === q && /resolution/.test(x.m.name)).series.slice(0, n)); return avg(Array.from({ length: n }, (_, i) => sum(['P1', 'P2', 'P3', 'P4'].map((q, k) => PRI_SHARE[q] * s2[k][i])))); })();
  const mttrP1 = avg(P.mttr.P1), prevMttrP1 = P2 ? avg(P2.mttr.P1.slice(0, n)) : null;
  const dispatched = sum(P.drivers.map(d => d.tickets * (DISPATCH[d.k] || 0)));
  const remote = 1 - dispatched / Math.max(1, P.tickets);
  const R = rng(500 + n * 13 + (region === 'All' ? 0 : REGIONS.indexOf(region) + 1));
  const chg = Math.round(68 * n * (region === 'All' ? 1 : Math.max(0.25, share * 1.6))), failed = Math.max(1, Math.round(chg * (0.012 + R() * 0.006))), emergency = Math.max(1, Math.round(chg * 0.04)), chgInc = Math.max(0, failed - 1 + Math.round(R()));
  const byMonth = P.byMonth.map(m => ({ ...m, total: sc(m.total), auto: sc(m.auto) }));
  const months12 = HIST.period(12).byMonth.map((m, i) => ({ label: m.label, full: m.full, incidents: sc(m.total), requests: sc(m.total * (0.52 + (i % 3) * 0.03)), changes: Math.round(sc(68 * 7.3) / 7.3 * (0.9 + ((i * 7) % 5) / 20)), problems: Math.max(1, Math.round(sc(5.2) + ((i * 3) % 4) - 1)), season: /Mar|Apr|May|Jun/.test(m.label) }));
  const cause = Object.fromEntries(CAUSES.map(([k]) => [k, 0])); P.drivers.forEach(d => Object.entries(CAUSE[d.k] || { user: 1 }).forEach(([k, f]) => { cause[k] += d.tickets * f; }));
  const causeTot = sum(Object.values(cause));
  const repeatStores = P.branches.filter(x => region === 'All' || x.b.region === region).slice(0, 8);
  const repeatLines = D.CIRCUITS.filter(c => c.tickets90 >= 3 && (region === 'All' || D.BR[c.branchId].region === region)).sort((a, b) => b.tickets90 - a.tickets90).slice(0, 8);
  // carriers: availability across their lines, outages and restore time in the period, against the contract
  const carriers = D.SCORECARD.map(c => { const l = D.CIRCUITS.filter(x => x.carrier === c.carrier && (region === 'All' || D.BR[x.branchId].region === region)); if (!l.length) return null; const contract = avg(l.map(x => D.LINE_SLA[x.type])), outages = Math.max(1, Math.round(c.cases6m * n / 6 * (l.length / Math.max(1, c.circuits)))); const av = 1 - outages * c.mttr / (l.length * n * 730); return { n: c.carrier, lines: l.length, avail: av, contract, outages, restore: c.mttr, slaMet: c.slaMet, credits: sum(l.map(creditOf)) * n, repeat: c.repeat }; }).filter(Boolean).sort((a, b) => b.outages - a.outages);
  const sla12 = ['P1', 'P2', 'P3', 'P4'].map(q => ({ q, resp: resp(q), res: res(q) }));
  // breaches explained: months a resolution SLA fell short, and the biggest call driver that month
  const breaches = []; sla12.forEach(({ q, res: r }) => r.series.forEach((v, i) => { if (v < r.m.esl) { const top = P.drivers.slice().sort((a, b) => b.per[i] - a.per[i])[0]; breaches.push({ q, month: P.months[i].label, v, esl: r.m.esl, why: top.label, late: Math.round(P.byMonth[i].total * PRI_SHARE[q] * (1 - v) * share) }); } }));
  // MTTA and MTTR by priority, and MTTR by region, category and resolver group (from resolved tickets)
  const mtta = { P1: 6, P2: 11, P3: 24, P4: 41 }; ['P1', 'P2', 'P3', 'P4'].forEach(q => { mtta[q] = Math.round(mtta[q] * (1.6 - avg(resp(q).series))); });
  const mttrP = { P1: avg(P.mttr.P1), P2: avg(P.mttr.P2), P3: avg(P.mttr.P3), P4: avg(P.mttr.P3) * 1.9 };
  const resolved = D.RESOLVED.filter(i => region === 'All' || D.BR[i.branchId].region === region);
  const ttrH = i => (i.resolved - i.opened) / HR;
  const groupBy = (f, list = resolved) => { const m = {}; list.forEach(i => { const k = f(i); (m[k] = m[k] || []).push(ttrH(i)); }); return Object.entries(m).map(([k, v]) => ({ k, n: v.length, h: avg(v) })).sort((a, b) => b.n - a.n); };
  const scale = mttrP.P3 / Math.max(0.1, avg(resolved.map(ttrH)));
  const byRegion = groupBy(i => D.BR[i.branchId].region, D.RESOLVED).map(x => ({ ...x, h: x.h * scale }));
  const byCat = groupBy(i => i.cat).map(x => ({ ...x, h: x.h * scale }));
  const byGroup = groupBy(i => i.closeCode === 'Carrier / LEC' ? 'Movate Carrier Management' : i.workOrder || i.kind === 'apdown' || i.kind === 'crc' ? 'SRS Field Technical Services' : i.kind === 'cpu' || i.kind === 'dhcp' ? 'Movate Network SME – L3' : i.group).map(x => ({ ...x, h: x.h * scale * (/Field/.test(x.k) ? 1.6 : /Carrier/.test(x.k) ? 1.4 : 1) }));
  const fieldH = mttrP.P3 * 1.7, remoteH = mttrP.P3 * 0.62;
  // truck rolls: by store, reason and whether they could have been avoided
  const rolls = Math.round(dispatched * share);
  const rollReasons = P.drivers.filter(d => DISPATCH[d.k]).map(d => ({ k: d.k, label: d.label, n: Math.round(d.tickets * DISPATCH[d.k] * share), avoid: { apdown: 0.35, crc: 0.2, cpu: 0.5, scanner: 0.6, lte: 0.4 }[d.k] ?? 0.3 })).sort((a, b) => b.n - a.n);
  const avoidable = sum(rollReasons.map(r => r.n * r.avoid));
  const rollStores = repeatStores.slice(0, 6).map((x, i) => ({ b: x.b, n: Math.max(1, Math.round(x.tickets * 0.22) - (i > 3 ? 1 : 0)), why: x.driver }));
  // requests: moves, adds and changes, and new stores
  const reqTot = sum(months12.slice(-n).map(m => m.requests));
  const requests = [['Moves, adds and changes (ports, VLANs, Wi-Fi)', 0.46, 2.1, true], ['New device or handheld enrolment', 0.21, 1.4, true], ['Access and firewall rule requests', 0.14, 3.2, false], ['Circuit orders and upgrades', 0.08, 24, false], ['New store or acquisition onboarding', 0.03, 38, false], ['Reports and information', 0.08, 0.8, true]].map(([l, f, d, cat]) => ({ l, n: Math.round(reqTot * f), days: d, cat }));
  return { n, P, share, tickets, prevTickets, sla, prevSla, mttrP1, prevMttrP1, remote, firstFix: 0.84 + (remote - 0.85) * 0.5, chg: { total: chg, ok: chg - failed, failed, emergency, inc: chgInc }, byMonth, months12, cause, causeTot, repeatStores, repeatLines, carriers, sla12, breaches, mtta, mttrP, byRegion, byCat, byGroup, fieldH, remoteH, rolls, rollReasons, avoidable, rollStores, requests };
}

// ───────────────────────────── NEXT ─────────────────────────────
export const NEXT_RANGES = [['7d', '7 days'], ['30d', '30 days'], ['90d', '90 days']];
const HORIZON = { '7d': 7, '30d': 30, '90d': 90 };
export const SIGNALS = [
  { k: 'circuit', label: 'Circuit degradation', ex: 'Rising packet loss, latency drift, repeated micro-outages, carrier ticket history', warn: 'Circuit failing or flapping' },
  { k: 'capacity', label: 'Capacity exhaustion', ex: 'Bandwidth trending towards the circuit limit at peak, PoE budget near maximum, AP client density growth', warn: 'Slow transactions, dropped devices' },
  { k: 'hardware', label: 'Hardware health', ex: 'Interface error growth, reboots, temperature or power supply alarms, device age and end-of-support dates', warn: 'Device failure' },
  { k: 'redundancy', label: 'Redundancy at risk', ex: 'One ISP circuit unstable or down, backup path untested', warn: 'Full store outage on the next failure' },
  { k: 'drift', label: 'Configuration drift', ex: 'Devices out of the standard template or firmware baseline', warn: 'Failure after a change, security exposure' },
  { k: 'recurring', label: 'Recurring incident pattern', ex: 'Same store or asset repeatedly ticketed for the same cause', warn: 'Repeat outage' },
];
const ACTION = {
  circuit: c => [`Escalate to ${c.carrier} with evidence, test failover`, 'carrier', 'Problem record'],
  capacity: () => ['Order a bandwidth upgrade; move bulk traffic after close', 'change', 'Planned change'],
  hardware: () => ['Planned visit: swap the failing part, spare from the depot', 'visit', 'Field visit request'],
  redundancy: () => ['Fix and re-test the backup line before the main line fails', 'visit', 'Field visit request'],
  drift: () => ['Bring back to the standard template in the weekend window', 'change', 'Planned change'],
  recurring: () => ['Open a problem record and find the root cause', 'problem', 'Problem record'],
};
// every store gets a risk score from 0 to 100, with the reasons behind it
export function riskOf(s, b, horizon, now) {
  const c = circuitOf(s, b.wan[0]), bk = circuitOf(s, b.wan[1]), cap = capOf(s, b), devs = D.devicesOf(b.id);
  const preds = s.predictions.filter(p => p.branchId === b.id && ['New', 'Watching'].includes(p.status));
  const incs = [...s.incidents, ...s.resolved].filter(i => i.branchId === b.id);
  const sig = {};
  sig.circuit = Math.min(45, c.tickets90 * 6 + c.flaps30 * 4 + (c.loss > 0.5 ? 12 : 0) + (preds.some(p => p.kind === 'Degrading circuit') ? 28 : 0) + (c.status === 'Down' ? 10 : 0));
  sig.capacity = Math.min(35, (cap.wanDays <= horizon ? 22 + (horizon - cap.wanDays) / horizon * 10 : cap.wanDays <= horizon * 2 ? 6 : 0) + (cap.wifiDays <= horizon ? 14 : 0) + (preds.some(p => p.kind === 'Capacity forecast') ? 12 : 0));
  sig.hardware = Math.min(35, devs.filter(d => d.model === '2530').length * 5 + (preds.some(p => /AP failure|Switch failure/.test(p.kind)) ? 26 : 0) + incs.filter(i => ['apdown', 'crc', 'cpu'].includes(i.kind)).length * 5);
  sig.redundancy = Math.min(40, (onBackupOf(s, b) ? 30 : 0) + (bk.status === 'Down' ? 30 : 0) + bk.tickets90 * 5 + (preds.some(p => p.kind === 'Backup path risk') ? 26 : 0));
  sig.drift = Math.min(25, D.DRIFT.filter(x => x.branchId === b.id).length * 12 + devs.filter(fwBehind).length * 4);
  sig.recurring = Math.min(30, Math.max(0, incs.length - 1) * 7);
  // the signals give a one-week failure chance; the longer the horizon, the more of it can come true
  const p = Math.min(0.9, (sum(Object.values(sig)) + (healthOf(s, b) === 'degraded' ? 6 : 0)) / 95);
  const score = Math.round(Math.min(98, 100 * (1 - Math.pow(1 - p, Math.pow(horizon / 7, 0.35)))));
  const top = Object.entries(sig).filter(([, v]) => v > 0).sort((x, y) => y[1] - x[1]);
  const k = top.length ? top[0][0] : null;
  const driver = !k ? 'No risk signals' : k === 'circuit' ? `${c.carrier} ${c.type}: ${c.tickets90} tickets in 90 days, ${c.flaps30} drops in 30${c.loss > 0.5 ? `, loss ${c.loss.toFixed(1)}%` : ''}` : k === 'capacity' ? `Line at ${cap.wanP95}% at peak, full in about ${Math.round(cap.wanDays)} days` : k === 'hardware' ? (preds.find(p => /AP failure|Switch failure/.test(p.kind))?.signal || `${devs.filter(d => d.model === '2530').length} switches near end of support, repeat device faults`) : k === 'redundancy' ? (onBackupOf(s, b) ? 'Main line down: trading on the backup line only' : bk.status === 'Down' ? 'Backup line down: one failure from an outage' : `Backup line unreliable (${bk.tickets90} tickets in 90 days)`) : k === 'drift' ? `${D.DRIFT.filter(x => x.branchId === b.id).length + devs.filter(fwBehind).length} differences from the standard template or firmware` : `${incs.length} incidents recently, same cause repeating`;
  const [action, kind, record] = k ? ACTION[k](c) : ['No action', 'none', ''];
  const due = now + (score >= 85 ? 2 : score >= 70 ? 4 : score >= 55 ? 9 : 20) * DAY;
  return { b, score, sig, top: top.slice(0, 3).map(([x]) => x), k, driver, action, kind, record, due };
}
export function nextModel(s, now, range, region) {
  const horizon = HORIZON[range];
  const list = D.BRANCHES.filter(inR(region));
  const risks = list.map(b => riskOf(s, b, horizon, now)).sort((a, b) => b.score - a.score);
  const high = risks.filter(r => r.score >= 70), med = risks.filter(r => r.score >= 45 && r.score < 70);
  const driving = SIGNALS.map(g => ({ ...g, n: risks.filter(r => r.score >= 45 && r.sig[g.k] >= 10).length }));
  const heat = REGIONS.map(r => { const l = risks.filter(x => x.b.region === r); return { r, n: l.length, avg: avg(l.map(x => x.score)), high: l.filter(x => x.score >= 70).length, by: SIGNALS.map(g => l.filter(x => x.score >= 45 && x.sig[g.k] >= 10).length) }; });
  // capacity forecasts: projected peak use 30, 60 and 90 days out, and the circuits to upgrade
  const caps = list.map(b => { const c = capOf(s, b); const w = c.wanGrowth || 0; return { b, line: c.line, now: c.wanP95, d30: Math.min(130, c.wanP95 + w * 30 / 7), d60: Math.min(130, c.wanP95 + w * 60 / 7), d90: Math.min(130, c.wanP95 + w * 90 / 7), days: c.wanDays }; });
  const upgrades = caps.filter(c => c.days <= horizon).sort((a, b) => a.days - b.days);
  const fc = [30, 60, 90].map(d => ({ d, n: caps.filter(c => c.days <= d).length }));
  // lifecycle: devices reaching end of support in 12 months, and the refresh plan by quarter
  const ids = new Set(list.map(b => b.id)), devs = D.DEVICES.filter(d => ids.has(d.branchId));
  const in12 = new Date(now + 365 * DAY).toISOString().slice(0, 10);
  const eos = devs.filter(d => { const l = D.lifecycleOf(d); return l.eosup && l.eosup <= in12; });
  const warrantyEnd = devs.filter(d => d.warranty > now && d.warranty < now + 365 * DAY);
  const failProne = Object.entries(D.RESOLVED.concat(s.incidents).filter(i => ['apdown', 'crc', 'cpu'].includes(i.kind)).reduce((m, i) => { const d = D.DEV[i.ci]; if (d) m[d.model] = (m[d.model] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 4);
  // did predictions hold this month: always the 30-day view, whatever horizon is picked
  const high30 = horizon === 30 ? high.length : list.filter(b => riskOf(s, b, 30, now).score >= 70).length;
  const R = rng(700 + list.length);
  const flagged = Math.max(3, Math.round(high30 * 0.8 + 2)), acted = Math.max(2, flagged - 1 - Math.round(R())), avoided = Math.max(1, acted - 1), visits = Math.max(1, avoided - 1), falseAlarm = 1, became = flagged - avoided - falseAlarm;
  return { horizon, list, risks, high, med, driving, heat, caps, upgrades, fc, eos, warrantyEnd, failProne, acc: { flagged, acted, avoided, visits, falseAlarm, became } };
}

// the KPI dictionary all three lenses share
export const KPIS = [
  { k: 'avail', name: 'Store network availability', lens: 'Now', dir: 'Increase', def: 'Share of trading minutes in which a store had at least one working line and its SD-WAN appliance answered. Measured from the network event, not the ticket.' },
  { k: 'outages', name: 'Unplanned store outages per month', lens: 'Next', dir: 'Decrease', def: 'Stores that could not trade, with no planned change or maintenance window behind it.' },
  { k: 'mttr', name: 'Mean time to restore (MTTR)', lens: 'Now + Then', dir: 'Decrease', def: 'From the first network event to the store trading normally again, by priority.' },
  { k: 'planned', name: 'Planned versus unplanned field visits', lens: 'Next', dir: 'Shift towards planned', def: 'Truck rolls booked ahead in quiet hours, against break-fix dispatches.' },
  { k: 'prevented', name: 'Outages prevented by proactive action', lens: 'Next', dir: 'Increase, reported monthly', def: 'Flagged risks acted on in time where the predicted failure did not happen.' },
  { k: 'repeat', name: 'Repeat incidents on the same store or asset', lens: 'Then', dir: 'Decrease', def: 'Incidents within 30 days of another on the same store or asset with the same root cause.' },
  { k: 'slaAtt', name: 'SLA attainment by priority', lens: 'Then', dir: 'Increase', def: 'Share of incidents responded to and resolved inside the Annexure B time for their priority.' },
  { k: 'noise', name: 'Alert-to-incident noise ratio', lens: 'Now', dir: 'Decrease', def: 'Raw alarms received for each incident raised after de-duplication, suppression and correlation.' },
];
