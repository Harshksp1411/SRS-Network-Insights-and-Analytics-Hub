// The data behind the dashboards' drill-down. A "node" is one place a reader can stand: the estate, a region, a state,
// a branch, one internet line, one device, one incident, and the lists in between. Every number here comes from
// the same data and helpers as the console, so a figure on the front page, in the PDF and at the bottom of the
// drill-down always agrees.
import * as D from '../data.js';
import { healthOf, circuitOf, onBackupOf, slaClock, branchClock } from '../store.jsx';
import { branchChecks } from '../readiness.jsx';
import { rng, DAY, HR, MIN, dateShort, parts } from '../util.js';
import { C } from '../charts.jsx';
import { layerOf } from '../ask.js';

export const TONE_HEX = { ok: C.ok, warn: C.warn, bad: C.bad, info: C.s1, muted: C.s3 };
export const STATUS = {
  up: { label: 'Trading normally', color: C.ok },
  backup: { label: 'On backup line', color: C.s1 },
  degraded: { label: 'Problem being fixed', color: C.warn },
  down: { label: 'Offline', color: C.bad },
};
export const KIND_PLAIN = { circuit: 'Internet line faults', jitter: 'Slow or unstable lines', apdown: 'Wi-Fi access point down', crc: 'Cabling errors', lte: 'Backup line problems', scanner: 'Handheld Wi-Fi drop-outs', pos: 'Slow card payments', dhcp: 'Devices cannot join the network', backup: 'Failed config backups', cpu: 'Overloaded switch', edgedown: 'Branch unreachable', 'hero-config': 'A change slowed a branch' };
export const CHECK_NAME = { wan1: 'Main internet line', wan2: 'Backup line', ec: 'SD-WAN appliance', tun: 'Tunnels to the data centre', sw: 'Switches', wifi: 'Wi-Fi', dhcp: 'Device addresses (DHCP)', cfg: 'Config and backup', pos: 'Card payment path', erp: 'Ordering system (ERP) path' };

// one cache per store snapshot: the readiness checks and capacity outlook are worked out once per branch
const cache = new WeakMap();
function memo(s) { let m = cache.get(s); if (!m) { m = { ready: {}, cap: {} }; cache.set(s, m); } return m; }
export const readyOf = (s, b) => { const m = memo(s); return m.ready[b.id] || (m.ready[b.id] = branchChecks(s, b)); };
export const capOf = (s, b) => { const m = memo(s); return m.cap[b.id] || (m.cap[b.id] = D.capacityOf(b)); };
export const capDays = x => Math.min(x.wanDays ?? 999, x.wifiDays ?? 999);

// what a branch looks like right now, in one word
export function statusOf(s, b) {
  const h = healthOf(s, b);
  if (h === 'down') return 'down';
  if (onBackupOf(s, b)) return 'backup';
  return h === 'degraded' ? 'degraded' : 'up';
}
// the line a branch is using and how it is doing
export function activeLine(s, b) {
  const p = circuitOf(s, b.wan[0]), sc = circuitOf(s, b.wan[1]);
  const on = p.status === 'Down' ? sc : p;
  const deg = on.status === 'Degraded';
  return { line: on, lat: Math.round(on.lat + (deg ? 18 + (on.jit || 30) * 0.9 : 0)), loss: deg ? on.loss || 2 : on.loss, jit: on.jit, deg };
}
export const openIncs = (s, b) => s.incidents.filter(i => i.branchId === b.id && i.state !== 'Resolved');

// ---------- branch sets ----------
// k picks which branches; region / state / city narrow it. Each set says what it means in plain words.
const within7 = (s, now) => { const ids = new Set(); s.resolved.forEach(i => { if ((i.resolved || 0) >= now - 7 * DAY) ids.add(i.branchId); }); s.incidents.forEach(i => { if (i.opened >= now - 7 * DAY) ids.add(i.branchId); }); return ids; };
export const SETS = {
  all: { label: 'All branches', short: 'Branches', test: () => true, plain: 'Every branch, with what each one is doing right now.' },
  online: { label: 'Online', test: (s, b) => healthOf(s, b) !== 'down', plain: 'Branches with at least one working line, so they can trade.' },
  exposed: { label: 'Exposed to a security flaw', test: (s, b) => D.devicesOf(b.id).some(d => D.vulnsOf(d).some(a => a.cvss)), plain: 'Branches with at least one device running software with a published critical or high security flaw. Each device is booked for an update outside trading hours.' },
  openNow: { label: 'Open for business now', test: (s, b, x) => branchClock(b, x.now).open, plain: 'Branches inside their local trading hours right now.' },
  healthy: { label: 'Trading normally', test: (s, b) => healthOf(s, b) === 'up', plain: 'Branches with no open problem on the network.' },
  issues: { label: 'Being worked on', test: (s, b) => healthOf(s, b) !== 'up', plain: 'Branches that are offline or open with a problem an engineer or carrier is fixing.' },
  down: { label: 'Offline', test: (s, b) => healthOf(s, b) === 'down', plain: 'Branches the network cannot reach at all. Each has an urgent incident and a recovery under way.' },
  degraded: { label: 'Open with a problem', test: (s, b) => healthOf(s, b) === 'degraded', plain: 'Branches that are trading but have a problem being fixed.' },
  backup: { label: 'Trading on the backup line', test: (s, b) => onBackupOf(s, b), plain: 'Branches that lost their main internet line and moved to the backup on their own. Customers do not notice; the carrier is fixing the main line.' },
  readiness: { label: 'Opening readiness', test: () => true, plain: 'Ten checks run before each branch opens: lines, SD-WAN, switches, Wi-Fi, device addresses, config, card payments and the ordering system.' },
  notReady: { label: 'Not ready to open', test: (s, b) => readyOf(s, b).result === 'Not ready', plain: 'Branches where at least one opening check failed.' },
  attention: { label: 'Can open, one check to watch', test: (s, b) => readyOf(s, b).result === 'Needs attention', plain: 'Branches that can open but have a warning on one check.' },
  capacity: { label: 'Need more capacity within 90 days', test: (s, b) => capDays(capOf(s, b)) <= 90, plain: 'Branches whose internet line or Wi-Fi will reach its limit within 90 days at the current growth.' },
  trouble7: { label: 'Had a problem in 7 days', test: (s, b, x) => x.w7.has(b.id), plain: 'Branches with at least one incident opened or fixed in the last 7 days.' },
  clean7: { label: 'Trouble-free for 7 days', test: (s, b, x) => !x.w7.has(b.id), plain: 'Branches with no incident at all in the last 7 days.' },
  latency: { label: 'Delay to the data centre', test: () => true, plain: 'Round-trip time from each branch to the McKinney data centre on the line it is using. Under 60 ms keeps card payments and the ordering system quick.' },
  eos: { label: 'Have switches reaching end of support', test: (s, b) => D.devicesOf(b.id).some(d => /2530/.test(d.model)), plain: 'Branches with Aruba 2530 switches, which reach end of support in early 2027.' },
};
// the console's filter bar (region, city, brand, one branch) carries into every list as region, state, city, brand, branch
export const inGeo = (node, b) => !!b && (!node.region || b.region === node.region) && (!node.state || b.state === node.state) && (!node.city || b.city === node.city) && (!node.brand || b.brand === node.brand) && (!node.branch || b.id === node.branch);
export function branchesOf(s, node, now) {
  const set = SETS[node.k] || SETS.all;
  const x = { now, w7: node.k === 'trouble7' || node.k === 'clean7' ? within7(s, now) : null };
  return D.BRANCHES.filter(b => inGeo(node, b) && set.test(s, b, x));
}
export const scopeOf = node => node.branch && D.BR[node.branch] ? D.BR[node.branch].name : `${node.city ? `${node.city}, ${node.state}` : node.state ? stateName(node.state) : node.region || 'All regions'}${node.brand ? ` · ${node.brand}` : ''}`;
export const stateName = st => ({ AL: 'Alabama', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', ON: 'Ontario', AB: 'Alberta', BC: 'British Columbia', MB: 'Manitoba', NS: 'Nova Scotia', QC: 'Quebec' }[st] || st);

// ---------- incident sets ----------
export const INC_SETS = {
  open: { label: 'Open incidents', plain: 'Every incident still being worked, with its priority and deadline.' },
  onTrack: { label: 'Incidents on track', plain: 'Open incidents with time to spare: less than 75% of the time to fix used, and answered on time.' },
  atRisk: { label: 'Incidents at risk', plain: 'Open incidents that have used more than 75% of the time allowed to fix them, still inside the deadline.' },
  breached: { label: 'Incidents past their deadline', plain: 'Open incidents past the time allowed to fix them, or not answered in time.' },
  risk: { label: 'Incidents to watch against their deadline', plain: 'Open incidents that have used more than half of the time allowed to fix them.' },
  unack: { label: 'Incidents waiting for an owner', plain: 'Open incidents nobody has picked up yet.' },
  auto24: { label: 'Fixed automatically, last 24 hours', plain: 'Problems Mova iO fixed on its own, inside the rules people set, with no engineer called.' },
  auto7: { label: 'Fixed automatically, last 7 days', plain: 'Problems Mova iO fixed on its own, inside the rules people set, with no engineer called.' },
  resolved7: { label: 'Problems fixed in the last 7 days', plain: 'Every incident closed in the last 7 days, how long it took and how it was fixed.' },
  today: { label: 'Incidents opened today', plain: 'Every incident opened since midnight Central Time, open or already fixed.' },
  overnight: { label: 'Overnight', plain: 'Everything that failed since 18:00 yesterday, and what is already fixed.' },
  carrier7: { label: 'Problems that needed a carrier, last 7 days', plain: 'Incidents closed by the carrier or the local exchange company fixing their line.' },
  opened7: { label: 'Problems opened in the last 7 days', plain: 'Incidents opened in the last 7 days.' },
};
export function incidentsOf(s, node, now) {
  const inScope = i => inGeo(node, D.BR[i.branchId]);
  const open = s.incidents.filter(i => i.state !== 'Resolved'), res7 = s.resolved.filter(i => (i.resolved || 0) >= now - 7 * DAY);
  const isAuto = i => i.auto || /zero touch/i.test(i.closeCode || '');
  let list = {
    open, risk: open.filter(i => slaClock(i, now).used > 0.5), unack: open.filter(i => !i.acked),
    atRisk: open.filter(i => clockState(i, now) === 'atRisk'), breached: open.filter(i => clockState(i, now) === 'breached'), onTrack: open.filter(i => clockState(i, now) === 'onTrack'),
    auto24: res7.filter(i => isAuto(i) && i.resolved >= now - DAY), auto7: res7.filter(isAuto), resolved7: res7,
    overnight: [...s.incidents, ...s.resolved].filter(i => i.opened >= now - 14 * HR), today: [...s.incidents, ...s.resolved].filter(i => { const p = parts(i.opened), q = parts(now); return p.y === q.y && p.mo === q.mo && p.d === q.d; }), carrier7: res7.filter(i => i.closeCode === 'Carrier / LEC'),
    opened7: [...s.incidents, ...s.resolved].filter(i => i.opened >= now - 7 * DAY),
  }[node.k] || open;
  list = list.filter(inScope);
  if (node.pri) list = list.filter(i => i.pri === node.pri);
  if (node.kind) list = list.filter(i => i.kind === node.kind);
  if (node.auto != null) list = list.filter(i => !!isAuto(i) === node.auto);
  if (node.day != null) list = list.filter(i => dayIdx(i.resolved || i.opened, now) === node.day);
  if (node.ttr) { const [a, b] = TTR_BUCKETS.find(x => x[0] === node.ttr)[1]; list = list.filter(i => i.resolved && i.resolved - i.opened >= a && i.resolved - i.opened < b); }
  return list.slice().sort((a, b) => (b.resolved || b.opened) - (a.resolved || a.opened));
}
// one deadline state per open incident, used by the console tiles and the drill-down alike
export const clockState = (i, now) => { const c = slaClock(i, now); return c.resLeft <= 0 || c.respBreached ? 'breached' : c.used > 0.75 ? 'atRisk' : 'onTrack'; };
export const isAutoInc = i => !!(i.auto || /zero touch/i.test(i.closeCode || ''));
export const TTR_BUCKETS = [['Under 15 min', [0, 15 * MIN]], ['15 min – 1 h', [15 * MIN, HR]], ['1 – 4 h', [HR, 4 * HR]], ['4 – 24 h', [4 * HR, DAY]], ['Over 24 h', [DAY, 1e15]]];
// the last 7 days as seven 24-hour windows ending now: 6 = the last 24 hours, 0 = six to seven days ago,
// so the seven columns add up to the whole week
export function dayIdx(t, now) { const k = 6 - Math.floor((now - t) / DAY); return t <= now && k >= 0 && k <= 6 ? k : -1; }
export const dayLabel = (k, now) => k === 6 ? 'Last 24 h' : dateShort(now - (6 - k) * DAY - DAY / 2);

// ---------- lines ----------
export const LINE_SETS = {
  all: { label: 'Internet lines', plain: 'Every branch has a main line and a backup line from a different carrier or technology.' },
  down: { label: 'Lines down now', plain: 'Lines that are not passing traffic right now. The branch moves to its other line on its own.' },
  degraded: { label: 'Lines degraded now', plain: 'Lines that pass traffic but with high delay, jitter or loss. SD-WAN moves payments, ordering and voice to the healthier line.' },
  problem: { label: 'Lines down or degraded now', plain: 'Every line that is down or degraded right now, with the branch it serves and the carrier case if one is open.' },
  breach: { label: 'Lines that missed their carrier promise this month', plain: 'Each line type comes with an uptime promise from the carrier (99.95% for MPLS and DIA, 99.9% for broadband, 99% for LTE/5G). Lines below it earn a service credit.' },
  flap: { label: 'Unstable lines (3 or more drops in 30 days)', plain: 'Lines that dropped 3 or more times in the last 30 days. Each drop moves the branch to its backup for a few seconds.' },
  repeat: { label: 'Repeat-offender lines (3 or more tickets in 90 days)', plain: 'Lines with 3 or more fault tickets in 90 days. These go to the carrier for a formal review.' },
};
// the same estimate as the console and the monthly view; round only when showing a total
export const creditOf = c => D.availOf(c) < D.LINE_SLA[c.type] ? D.lineMRC(c) * (D.LINE_SLA[c.type] - D.availOf(c) > 0.005 ? 0.25 : 0.1) : 0;
export function linesOf(s, node) {
  const all = D.CIRCUITS.map(c => circuitOf(s, c.id)).filter(c => { const b = D.BR[c.branchId]; return inGeo(node, b) && (!node.carrier || (node.carrier === 'Canadian carriers' ? ['Bell', 'Rogers', 'Telus'].includes(c.carrier) : c.carrier === node.carrier)) && (!node.type || c.type === node.type); });
  const t = { all: () => true, down: c => c.status === 'Down' || healthOf(s, D.BR[c.branchId]) === 'down', degraded: c => c.status === 'Degraded' && healthOf(s, D.BR[c.branchId]) !== 'down', problem: c => c.status !== 'Up' || healthOf(s, D.BR[c.branchId]) === 'down', breach: c => D.availOf(c) < D.LINE_SLA[c.type], flap: c => c.flaps30 >= 3, repeat: c => c.tickets90 >= 3 }[node.k] || (() => true);
  return all.filter(t);
}

// 24 hours of one line, an hourly reading: delay, loss, jitter and use. Steady and repeatable for the same line;
// an open fault shows from the hour it started; a line that is down has no readings since.
export function lineDay(s, c, now) {
  const inc = s.incidents.find(i => i.state !== 'Resolved' && (i.ci === c.id || (i.kind === 'edgedown' && i.branchId === c.branchId)));
  const r = rng([...c.id].reduce((a, ch) => a * 31 + ch.charCodeAt(0) | 0, 7));
  const b = D.BR[c.branchId];
  return Array.from({ length: 24 }, (_, k) => {
    const t = now - (23 - k) * HR, h = parts(t, b.tz).h, open = h >= 6 && h < 17;
    const broken = inc && t >= inc.opened - HR / 2;
    if (broken && (c.status === 'Down' || inc.kind === 'edgedown')) return { t, lat: null, loss: null, jit: null, use: null };
    const deg = broken && c.status === 'Degraded';
    const busy = open ? 0.6 + 0.4 * Math.sin((h - 6) / 11 * Math.PI) : 0.15;
    return {
      t,
      lat: +(c.lat + busy * 3 + (r() - 0.5) * Math.max(1, c.jit) + (deg ? 18 + (c.jit || 30) * 0.9 : 0)).toFixed(1),
      loss: +Math.max(0, (deg ? (c.loss || 2) : c.loss) + (r() - 0.5) * (deg ? 0.6 : 0.04)).toFixed(2),
      jit: +Math.max(0.2, c.jit + (r() - 0.5) * (deg ? 5 : 0.6)).toFixed(1),
      use: Math.round(Math.min(97, Math.max(2, (c.role === 'Primary' ? c.util : c.util * 0.15) * (open ? 1 + busy * 0.4 : 0.25) + (r() - 0.5) * 6 + (deg ? 10 : 0)))),
    };
  });
}

// ---------- devices ----------
export const fwLevel = d => D.FW_TARGET[d.type === 'AP' ? 'AP' : d.model].indexOf(d.fw);
export const fwBehind = d => fwLevel(d) > (d.type === 'SD-WAN' ? 1 : 2);
export const DEV_SETS = {
  all: { label: 'Devices', plain: 'SD-WAN appliances, switches and Wi-Fi access points across the branches.' },
  down: { label: 'Devices down now', plain: 'Devices the network cannot reach: every device at a branch that is offline, plus access points that stopped answering.' },
  crit: { label: 'Devices with a critical security flaw', plain: 'Devices running software with a published critical flaw. Each is booked for an update outside trading hours.' },
  fw: { label: 'Devices behind on software', plain: 'Devices more than the allowed number of releases behind the approved software (one behind for SD-WAN, two for switches and access points).' },
  eos: { label: 'Switches reaching end of support', plain: 'Aruba 2530 switches: end of sale in 2022, end of support on 31 January 2027 (48-port) and 31 March 2027 (24-port). Each is planned for replacement before then.' },
  drift: { label: 'Devices that differ from the standard setup', plain: 'Settings found on the device that are not in the approved standard configuration.' },
  backup: { label: 'Config backups that failed last night', plain: 'Nightly configuration backups that did not complete. Each is re-run automatically.' },
};
export function devicesOf(s, node) {
  const drift = new Set(s.drift.map(d => d.device));
  const apDown = new Set(s.incidents.filter(i => i.state !== 'Resolved' && i.kind === 'apdown').map(i => i.ci));
  const t = { all: () => true, down: d => healthOf(s, D.BR[d.branchId]) === 'down' || apDown.has(d.id), crit: d => D.vulnsOf(d).some(a => a.sev === 'Critical'), fw: fwBehind, eos: d => /2530/.test(d.model), drift: d => drift.has(d.id), backup: d => d.backup.st === 'Failed' }[node.k] || (() => true);
  return D.DEVICES.filter(d => { const b = D.BR[d.branchId]; return inGeo(node, b) && (!node.model || d.model === node.model) && (!node.type || d.type === node.type) && t(d); });
}
export const modelName = d => d.type === 'SD-WAN' ? 'EdgeConnect EC-XS' : d.type === 'AP' ? `Aruba ${d.model}` : `Aruba ${d.model}`;

// ---------- changes ----------
export const CHG_SETS = {
  next24: { label: 'Changes in the next 24 hours', plain: 'Approved and scheduled changes starting in the next 24 hours.' },
  next7: { label: 'Changes in the next 7 days', plain: 'Approved and scheduled changes starting in the next 7 days, with their risk and window.' },
  next30: { label: 'Changes in the next 30 days', plain: 'Everything on the change calendar for the next 30 days.' },
  done7: { label: 'Changes made in the last 7 days', plain: 'Changes that went in during the last 7 days and how each one went.' },
};
export function changesOf(s, node, now) {
  const inScope = c => !node.region || c.scope === node.region || c.scope === 'All regions';
  const f = { next24: c => c.start > now && c.start < now + DAY, next7: c => c.start > now && c.start < now + 7 * DAY, next30: c => c.start > now && c.start < now + 30 * DAY, done7: c => c.start >= now - 7 * DAY && c.start <= now }[node.k] || (() => true);
  return s.changes.filter(c => inScope(c) && f(c)).sort((a, b) => a.start - b.start);
}

// ---------- labels for the breadcrumb ----------
export function labelOf(n) {
  const sc = n.region || n.state || n.city || n.brand || n.branch ? ` · ${scopeOf(n)}` : '';
  switch (n.t) {
    case 'set': return n.k === 'all' && (n.region || n.state || n.city || n.brand || n.branch) ? scopeOf(n) : `${(SETS[n.k] || SETS.all).label}${sc}`;
    case 'branch': return D.BR[n.id] ? D.BR[n.id].name : n.id;
    case 'incidents': return `${(INC_SETS[n.k] || INC_SETS.open).label}${n.pri ? ` · ${n.pri}` : ''}${n.kind ? ` · ${KIND_PLAIN[n.kind] || n.kind}` : ''}${n.day != null ? ` · ${n.dayLabel || ''}` : ''}${n.ttr ? ` · ${n.ttr}` : ''}${n.auto != null ? (n.auto ? ' · automatic' : ' · by an engineer') : ''}${sc}`;
    case 'incident': return n.id;
    case 'rca': return `Root cause · ${n.id}`;
    case 'lines': return `${(LINE_SETS[n.k] || LINE_SETS.all).label}${n.carrier ? ` · ${n.carrier}` : ''}${sc}`;
    case 'carrier': return n.carrier;
    case 'circuit': { const c = D.CIR[n.id]; return c ? `${c.carrier} ${c.type} (${c.role === 'Primary' ? 'main' : 'backup'})` : n.id; }
    case 'devices': return `${(DEV_SETS[n.k] || DEV_SETS.all).label}${n.model ? ` · ${n.model}` : ''}${sc}`;
    case 'device': return n.id;
    case 'changes': return `${(CHG_SETS[n.k] || CHG_SETS.next7).label}${sc}`;
    case 'change': return n.id;
    case 'approvals': return 'Decisions waiting';
    case 'approval': return n.id;
    case 'sla': return 'Service levels';
    case 'metric': return (D.SLA[n.i] || {}).name || 'Service level';
    case 'mttr': return 'Time to fix, six months';
    case 'projects': return 'New branches';
    case 'project': return n.id;
    case 'predictions': return 'Predicted problems';
    case 'prediction': return n.id;
    case 'drift': return 'Differences from the standard setup';
    case 'cases': return 'Carrier repairs';
    default: return 'Detail';
  }
}

// ---------- root cause ----------
// The ranked causes of an incident by layer (network, ISP, application), the same split Ask Mova iO uses, and the
// path from the branch to the data centre with the failing link marked.
export const allIncidents = s => [...s.incidents, ...s.resolved];
export const incOf = (s, id) => allIncidents(s).find(i => i.id === id);
export const LAYER_PLAIN = { Network: 'Inside SRS: the branch network or the SD-WAN appliance', ISP: 'The carrier: the internet line or the carrier network behind it', Application: 'The application or the data centre' };
const clean = c => c.replace(/^(?:Network|ISP|Application):\s*/, '');
export function rootOf(inc) {
  const causes = (inc.rca || []).map(r => ({ ...r, layer: layerOf(r.cause), text: clean(r.cause) }));
  const top = causes[0] || { layer: 'Network', text: inc.title, conf: inc.conf || 0.8, ev: '' };
  const layers = ['Network', 'ISP', 'Application'].map(l => { const r = causes.find(c => c.layer === l); return { layer: l, cause: l === top.layer, r, plain: LAYER_PLAIN[l] }; });
  return { top, causes, layers };
}
// the incident behind a branch's state: the most urgent open one, or the one a branch is still being watched after
export function causeIncOf(s, b) {
  const open = s.incidents.filter(i => i.branchId === b.id && i.state !== 'Resolved').sort((x, y) => x.pri.localeCompare(y.pri));
  if (open.length) return open[0];
  return b.watch && b.watch.inc ? incOf(s, b.watch.inc) || null : null;
}
// many incidents grouped by root cause: the layer (network, ISP, application) and the kind of fault
export function rootGroups(incs) {
  const m = {};
  incs.forEach(i => { const r = rootOf(i).top, key = `${r.layer}|${i.kind}`; (m[key] = m[key] || { layer: r.layer, kind: i.kind, incs: [] }).incs.push(i); });
  return Object.values(m).sort((a, b) => b.incs.length - a.incs.length || a.layer.localeCompare(b.layer));
}
// a change record named in the root cause, if there is one
export const changeIn = (s, inc) => { const m = (rootOf(inc).top.text || '').match(/\bCHG\d{7}\b/); return m && s.changes.find(c => c.id === m[0]) ? m[0] : null; };
// the parts of the path a fault can sit in, from what the branch feels to the data centre
export function faultPath(s, inc) {
  const b = D.BR[inc.branchId], p = circuitOf(s, b.wan[0]), sc = circuitOf(s, b.wan[1]);
  const open = inc.state !== 'Resolved', k = inc.kind, top = rootOf(inc).top.layer;
  const st = { apps: 'ok', lan: 'ok', edge: 'ok', wan1: 'ok', wan2: 'ok', carrier: 'ok', dc: 'ok' };
  const set = (x, v) => { st[x] = v; };
  if (k === 'circuit') { set('wan1', 'bad'); set('carrier', 'bad'); }
  else if (k === 'jitter' || k === 'pos') { set('wan1', 'warn'); set('carrier', 'warn'); set('apps', 'warn'); }
  else if (k === 'lte') set('wan2', 'bad');
  else if (k === 'edgedown') { set('edge', 'bad'); set('apps', 'bad'); }
  else if (['apdown', 'scanner', 'dhcp'].includes(k)) { set('lan', 'bad'); set('apps', 'warn'); }
  else if (k === 'crc' || k === 'cpu') { set('lan', k === 'cpu' ? 'bad' : 'warn'); if (k === 'cpu') set('apps', 'warn'); }
  else if (k === 'backup') set('lan', 'warn');
  else if (k === 'hero-config') { set('edge', 'bad'); set('apps', 'warn'); }
  else if (top === 'Application') { set('dc', 'bad'); set('apps', 'warn'); }
  else if (top === 'ISP') { set('wan1', 'bad'); set('carrier', 'bad'); }
  else set('lan', 'bad');
  const fixed = !open;
  const node = (id, label, sub, go) => ({ id, label, sub, st: fixed && st[id] !== 'ok' ? 'fixed' : st[id], go });
  return [
    node('apps', 'Tills, ordering and voice', open ? (st.apps === 'bad' ? 'cannot reach the data centre' : st.apps === 'warn' ? 'slower than normal' : 'working normally') : 'back to normal', { t: 'branch', id: b.id }),
    node('lan', 'Switches and Wi-Fi', `${b.dev.sw} switch${b.dev.sw > 1 ? 'es' : ''}, ${b.dev.ap} access point${b.dev.ap > 1 ? 's' : ''}`, D.DEV[inc.ci] && D.DEV[inc.ci].type !== 'SD-WAN' ? { t: 'device', id: inc.ci } : { t: 'branch', id: b.id }),
    node('edge', 'SD-WAN appliance', `${b.code}-ec01${b.dev.ec === 2 ? ' (HA pair)' : ''}`, { t: 'device', id: `${b.code}-ec01` }),
    node('wan1', `Main line – ${p.carrier} ${p.type}`, k === 'edgedown' && open ? 'up at the modem; no traffic while the appliance is down' : `${p.bw} Mb/s${p.status === 'Up' ? `, ${p.lat} ms` : `, ${p.status.toLowerCase()}`}`, { t: 'circuit', id: p.id }),
    node('wan2', `Backup line – ${sc.carrier} ${sc.type}`, k === 'edgedown' && open ? 'up at the modem; no traffic while the appliance is down' : sc.status === 'Up' ? (p.status === 'Down' ? 'carrying the traffic' : 'standing by') : sc.status.toLowerCase(), { t: 'circuit', id: sc.id }),
    node('carrier', `${p.carrier} network${p.lec ? ` and ${p.lec} local loop` : ''}`, st.carrier === 'ok' ? 'clean' : 'fault upstream of the branch', { t: 'carrier', carrier: p.carrier, region: b.region }),
    node('dc', 'Data centre and cloud apps', 'McKinney data centre, Azure', null),
  ];
}
