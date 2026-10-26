// Builds one persona's edition (daily brief, weekly or monthly report) from live console data. Stories are Ask
// Mova iO answers, so every number matches the console; the headline, deck, numbers and agenda are written here.
import * as D from '../data.js';
import { answer } from '../ask.js';
import { healthOf, circuitOf, onBackupOf, slaClock, branchClock } from '../store.jsx';
import { branchChecks } from '../readiness.jsx';
import { dur, hhmm, dateShort, dt, ago, num, sum, DAY, HR, MIN } from '../util.js';

const P = (x, d = 1) => `${(x * 100).toFixed(d)}%`;
const ct = t => `${hhmm(t)} CT`;
const ask = (s, q, now, L) => answer(s, q, now, L);

// the shared facts every headline is written from
function facts(s, now, L, bs = D.BRANCHES) {
  const ids = new Set(bs.map(b => b.id));
  const hs = bs.map(b => healthOf(s, b));
  const open = s.incidents.filter(i => i.state !== 'Resolved' && ids.has(i.branchId));
  const resolved7 = s.resolved.filter(i => (i.resolved || 0) >= now - 7 * DAY && ids.has(i.branchId));
  const auto7 = resolved7.filter(i => i.auto || /zero touch/i.test(i.closeCode || ''));
  const risk = open.filter(i => slaClock(i, now).used > 0.5);
  const onB = bs.filter(b => onBackupOf(s, b));
  const pend = s.approvals.filter(a => a.status === 'Pending' && (!a.branchId || ids.has(a.branchId)));
  const av = D.SLA.find(m => m.n === 29), k = D.MTTR_MONTHS.months.length - 2;
  const crit = D.DEVICES.filter(d => ids.has(d.branchId) && D.vulnsOf(d).some(a => a.sev === 'Critical'));
  const cap = bs.map(D.capacityOf).filter(x => x.wanDays <= 90 || x.wifiDays <= 90);
  const ready = bs.map(b => branchChecks(s, b));
  return {
    n: bs.length, down: hs.filter(h => h === 'down').length, degraded: hs.filter(h => h === 'degraded').length, up: hs.filter(h => h === 'up').length,
    open, resolved7, auto7, risk, onB, pend, crit, cap,
    notReady: ready.filter(r => r.result === 'Not ready').length, attention: ready.filter(r => r.result === 'Needs attention').length,
    uptime: av.trend[k], uptimeT: av.esl, month: D.MTTR_MONTHS.months[k], mttrP1: D.MTTR_MONTHS.P1[k], mttrP2: D.MTTR_MONTHS.P2[k],
    drift: s.drift.filter(d => ids.has(d.branchId)), lat: L && L.series ? Math.round(L.series.wan.at(-1)) : D.AVG_LAT,
    circuitsDown: D.CIRCUITS.filter(c => ids.has(c.branchId) && circuitOf(s, c.id).status === 'Down').length,
    breaching: open.filter(i => slaClock(i, now).resBreached).length,
  };
}

// what is on today's calendar for this person
function agenda(p, s, now, bs) {
  const ids = new Set(bs.map(b => b.id)), region = p.region;
  const out = [];
  const inScope = c => !region || c.scope === region || c.scope === 'All regions';
  s.changes.filter(c => c.start > now && c.start < now + DAY && inScope(c) && (p.id !== 'cio' || c.risk !== 'Low')).forEach(c => out.push({ t: c.start, label: c.window, what: `${c.id} ${c.title}`, where: `${c.scope} · ${c.risk} risk · ${c.state}`, kind: 'Change' }));
  if (['cio', 'networks', 'itservice', 'security', 'regional', 'stores'].includes(p.id)) s.approvals.filter(a => a.status === 'Pending' && (!a.branchId || ids.has(a.branchId)) && (p.id !== 'security' || a.type === 'Change' || /config|firmware|drift|relay/i.test(a.title))).forEach(a => out.push({ t: null, what: `Decide ${a.id}: ${a.title}`, where: `${Math.round(a.conf * 100)}% confidence · ${a.why[0]}`, kind: 'Decision' }));
  if (['stores', 'regional', 'itservice'].includes(p.id)) s.workOrders.filter(w => ids.has(w.branchId) && w.status !== 'Completed').forEach(w => out.push({ t: w.eta || null, what: `${w.status === 'Unassigned' ? 'Unassigned visit' : 'Technician visit'}: ${w.task}`, where: `${D.BR[w.branchId].name} · ${w.window}`, kind: 'Visit' }));
  if (['networks', 'itservice', 'regional', 'stores'].includes(p.id)) s.cases.filter(c => !c.closed && c.eta && ids.has(c.branchId) && c.eta < now + DAY).forEach(c => out.push({ t: c.eta, what: `${c.carrier} restore due: ${c.id}`, where: `${D.BR[c.branchId].name}${c.eta < now ? ' · already late' : ''}`, kind: 'Carrier', late: c.eta < now }));
  if (['cio', 'stores', 'regional'].includes(p.id)) s.projects.filter(x => (x.stage === 'Cutover' || x.stage === 'Kit staged') && x.golive < now + 8 * DAY && (!region || x.region === region)).forEach(x => out.push({ t: x.golive, label: dateShort(x.golive), what: `Go-live: ${x.brand} – ${x.site}`, where: `${x.stage}, ${x.rag}`, kind: 'Project' }));
  if (['cio', 'networks', 'stores', 'security'].includes(p.id)) s.freezes.filter(f => f.start > now && f.start < now + 7 * DAY && inScope(f)).forEach(f => out.push({ t: f.start, label: dateShort(f.start), what: `Change freeze starts: ${f.name}`, where: f.scope, kind: 'Freeze' }));
  if (['networks', 'regional'].includes(p.id)) s.predictions.filter(x => x.status === 'New' && x.conf >= 0.8 && (!x.branchId || ids.has(x.branchId))).slice(0, 3).forEach(x => out.push({ t: null, what: `Act on ${x.id}: ${x.suggest}`, where: `${x.branchId ? D.BR[x.branchId].name : x.target} · ${x.horizon}`, kind: 'Prevent' }));
  return out.sort((a, b) => (a.t == null) - (b.t == null) || (a.t || 0) - (b.t || 0)).slice(0, 9);
}

const H = {
  cio: (f) => ({
    headline: `${num(f.up)} of ${num(f.n)} branches trading normally; automation fixed ${f.auto7.length} incidents this week`,
    deck: `${f.month} uptime ${P(f.uptime, 3)} against ${P(f.uptimeT, 2)}; time to restore inside every target. ${f.pend.length} decision${f.pend.length === 1 ? '' : 's'} waiting for you or your team.`,
    lead: [`${f.down ? `${f.down} branch${f.down > 1 ? 'es are' : ' is'} offline` : 'No branch is offline'} and ${f.degraded} are trading with a problem; ${f.onB.length} kept trading on their backup ISP after carrier faults. Of last week's resolved incidents, ${P(f.auto7.length / Math.max(1, f.resolved7.length), 0)} closed with no human touch.`, `${f.cap.length} branches will reach a bandwidth or Wi-Fi limit within 90 days, and 728 Aruba 2530 switches reach end of support in early 2027 – both need budget.`],
    numbers: [['Trading normally', P(f.up / f.n, 1), 'ok'], [`Uptime, ${f.month}`, P(f.uptime, 3), f.uptime >= f.uptimeT ? 'ok' : 'warn'], ['Auto-fixed, 7 days', P(f.auto7.length / Math.max(1, f.resolved7.length), 0), 'ok'], ['Open incidents', f.open.length], ['Decisions waiting', f.pend.length, f.pend.length ? 'warn' : 'ok']],
  }),
  networks: (f) => ({
    headline: `${f.down} branches down, ${f.onB.length} riding out carrier faults on backup ISP; Branch ${D.HERO.config} policy change rolled back on its own`,
    deck: `${f.circuitsDown} circuits down, ${f.drift.length} devices drifted from the golden config, average latency to the data centre ${f.lat} ms.`,
    lead: [`${f.degraded} branches are degraded. The worst are unreachable EdgeConnects and carrier faults; SD-WAN kept the carrier-hit branches trading. One unrecorded switch change at Branch ${D.HERO.changes} is the top cause of an open incident and waits for your approval to roll back.`],
    numbers: [['Branches down', f.down, f.down ? 'bad' : 'ok'], ['On backup ISP', f.onB.length, 'warn'], ['Circuits down', f.circuitsDown, 'warn'], ['Config drift', f.drift.length, f.drift.length ? 'warn' : 'ok'], ['Latency to DC', `${f.lat} ms`]],
  }),
  stores: (f) => ({
    headline: `${f.notReady} branches not ready to open, ${f.onB.length} trading on backup lines`,
    deck: `${num(f.up)} branches are trading normally. ${f.attention} need attention before opening; technician visits and carrier fixes are below.`,
    lead: [`Branches on a backup line can still take card payments; ERP is slower on LTE. Branch managers have been told what still works and when the next update comes.`],
    numbers: [['Trading normally', num(f.up), 'ok'], ['Not ready to open', f.notReady, f.notReady ? 'bad' : 'ok'], ['Need attention', f.attention, 'warn'], ['On backup lines', f.onB.length, 'warn'], ['Down', f.down, f.down ? 'bad' : 'ok']],
  }),
  itservice: (f) => ({
    headline: `${f.open.length} incidents open, ${f.risk.length} past half their SLA clock`,
    deck: `${f.breaching ? `${f.breaching} past resolution SLA. ` : 'None past resolution SLA. '}${f.pend.length} actions wait for a human; ${f.auto7.length} incidents fixed themselves in the last 7 days.`,
    lead: [`Mean time to restore last month: P1 ${f.mttrP1} h, P2 ${f.mttrP2} h – inside target. Carrier cases are the main thing holding incidents open; their ETAs are on today's agenda.`],
    numbers: [['Open incidents', f.open.length], ['Above 50% SLA', f.risk.length, f.risk.length ? 'warn' : 'ok'], ['Past SLA', f.breaching, f.breaching ? 'bad' : 'ok'], ['Waiting on a human', f.pend.length, 'warn'], ['Auto-fixed, 7 days', f.auto7.length, 'ok']],
  }),
  security: (f) => ({
    headline: `${f.crit.length} devices exposed to a critical CVE; ${f.drift.filter(d => d.sev === 'High').length} high-severity config drifts`,
    deck: `An unrecorded DHCP relay change at Branch ${D.HERO.changes} was made by a local account with no change record. Patch waves for the exposed devices are scheduled outside trading hours.`,
    lead: [`Most exposed devices are access points on HPESBNW04712 and CX switches on HPESBNW05027; the fixed builds are in the advisory story below. The 728 Aruba 2530 switches reach end of support in early 2027.`],
    numbers: [['Critical CVE devices', f.crit.length, f.crit.length ? 'bad' : 'ok'], ['High-severity drift', f.drift.filter(d => d.sev === 'High').length, 'warn'], ['Below firmware policy', num(D.DEVICES.filter(d => { const l = D.FW_TARGET[d.type === 'AP' ? 'AP' : d.model].indexOf(d.fw); return l > (d.type === 'SD-WAN' ? 1 : 2); }).length), 'warn'], ['Backups failed', D.DEVICES.filter(d => d.backup.st === 'Failed').length, 'warn']],
  }),
  regional: (f, p) => ({
    headline: `${p.region}: ${f.up} of ${f.n} branches trading normally; Branch ${D.HERO.failover} on backup after an AT&T fibre cut`,
    deck: `${f.down} down, ${f.degraded} degraded, ${f.notReady} not ready to open. Branch ${D.HERO.changes} handhelds wait on a config rollback; Branch ${D.HERO.bandwidth} is heading for its bandwidth limit.`,
    lead: [`Visits, carrier restore times and changes that touch the region are on today's agenda. Everything below is limited to the ${p.region} region.`],
    numbers: [['Branches', f.n], ['Trading normally', f.up, 'ok'], ['Down / degraded', `${f.down} / ${f.degraded}`, 'warn'], ['Not ready to open', f.notReady, f.notReady ? 'bad' : 'ok'], ['On backup ISP', f.onB.length, 'warn']],
  }),
};

// region-limited stories for the regional manager, in the same answer shape Ask Mova iO uses
function regionStories(p, s, now, L, period) {
  const bs = D.BRANCHES.filter(b => b.region === p.region), ids = new Set(bs.map(b => b.id));
  const T = (cols, rows) => ({ type: 'table', cols, rows });
  const bad = bs.filter(b => healthOf(s, b) !== 'up').map(b => { const i = s.incidents.find(x => x.branchId === b.id && x.state !== 'Resolved'); return { b, i }; });
  const ready = bs.map(b => ({ b, r: branchChecks(s, b) })).filter(x => x.r.result === 'Not ready' || x.r.result === 'Needs attention');
  const wos = s.workOrders.filter(w => ids.has(w.branchId));
  const cap = bs.map(D.capacityOf).filter(x => x.wanDays <= 90 || x.wifiDays <= 90);
  const res7 = s.resolved.filter(i => ids.has(i.branchId) && (i.resolved || 0) >= now - 7 * DAY);
  const st = {
    health: ['Right now', { title: `${bad.length} ${p.region} branches down or degraded`, blocks: [T(['Branch', 'Status', 'Why'], bad.map(({ b, i }) => ({ cells: [{ text: b.name, bold: true, sub: b.brand }, { text: healthOf(s, b) === 'down' ? 'Down' : 'Degraded', tone: healthOf(s, b) === 'down' ? 'bad' : 'warn' }, i ? i.title : (b.watch ? b.watch.why : b.why || 'Watch level')] })))], src: 'Orchestrator, ServiceNow' }],
    ready: ['Opening', { title: `${ready.filter(x => x.r.result === 'Not ready').length} not ready to open, ${ready.filter(x => x.r.result === 'Needs attention').length} need attention`, blocks: [T(['Branch', 'Result', 'First issue'], ready.slice(0, 10).map(x => ({ cells: [{ text: x.b.name, bold: true }, { text: x.r.result, tone: x.r.result === 'Not ready' ? 'bad' : 'warn' }, Object.values(x.r.c).find(c => c.st !== 'pass')?.detail || x.r.incs[0]?.title || ''] })))], src: 'Readiness checks' }],
    backup: ['Backup lines', { title: `${bs.filter(b => onBackupOf(s, b)).length} branches on their backup ISP`, blocks: [T(['Branch', 'Primary lost', 'Now on'], bs.filter(b => onBackupOf(s, b)).map(b => { const c1 = circuitOf(s, b.wan[0]), c2 = circuitOf(s, b.wan[1]); return { cells: [{ text: b.name, bold: true, sub: b.brand }, `${c1.carrier} ${c1.type}`, `${c2.carrier} ${c2.type}`] }; }))], src: 'Orchestrator' }],
    visits: ['Visits', { title: `${wos.length} technician visits`, blocks: [T(['Branch', 'Task', 'Status'], wos.map(w => ({ cells: [{ text: D.BR[w.branchId].name, bold: true }, w.task, `${w.status}${w.eta ? `, ETA ${ct(w.eta)}` : ''}`] })))], src: 'ServiceNow work orders' }],
    changes: ['Changes', ask(s, 'What changed at Store 118 in the last 24 hours?', now, L)],
    bandwidth: ['Bandwidth', ask(s, 'Show top bandwidth users at Store 45 yesterday.', now, L)],
    capacity: ['Capacity', { title: `${cap.length} ${p.region} branches reach a limit within 90 days`, blocks: [T(['Branch', 'WAN p95', 'Wi-Fi peak', 'Days to limit'], cap.map(x => ({ cells: [{ text: x.b.name, bold: true }, `${x.wanP95}%`, `${x.wifiPeak}%`, { text: String(Math.min(x.wanDays, x.wifiDays)), tone: Math.min(x.wanDays, x.wifiDays) <= 30 ? 'bad' : 'warn' }] })))], src: 'Orchestrator, Aruba Central, Prediction agent' }],
    week: ['The week', { title: `${res7.length} incidents resolved in ${p.region} this week, ${res7.filter(i => i.auto).length} with no human touch`, blocks: [T(['Branch', 'Incident', 'Closed'], res7.slice(0, 12).map(i => ({ cells: [{ text: D.BR[i.branchId].name, bold: true }, i.title, i.auto ? { text: 'Auto-fixed', tone: 'ok' } : i.closeCode] })))], src: 'ServiceNow' }],
  };
  const pick = { daily: ['health', 'ready', 'backup', 'visits', 'changes', 'bandwidth'], weekly: ['week', 'health', 'capacity', 'visits'], monthly: ['capacity', 'week', 'health'] }[period];
  return pick.map(k => st[k]);
}

export function compose(p, s, now, L, period = 'daily') {
  const bs = p.region ? D.BRANCHES.filter(b => b.region === p.region) : D.BRANCHES;
  const f = facts(s, now, L, bs);
  const h = H[p.id](f, p);
  const list = p.region ? regionStories(p, s, now, L, period) : p[period].map(([kicker, q]) => [kicker, ask(s, q, now, L)]);
  const label = { daily: 'Morning Brief', weekly: 'Weekly Report', monthly: 'Monthly Report' }[period];
  const range = period === 'daily' ? dateShort(now) : period === 'weekly' ? `${dateShort(now - 7 * DAY)} – ${dateShort(now)}` : `${D.MTTR_MONTHS.months.at(-2)} (last full month) and month to date`;
  return {
    persona: p, period, label, range, at: now,
    headline: h.headline, deck: h.deck, lead: h.lead,
    numbers: h.numbers.map(([label, value, tone]) => ({ label, value, tone })),
    agenda: agenda(p, s, now, bs).map(x => ({ ...x, when: x.t == null ? 'Today' : x.t < now ? 'Overdue' : x.label || (dateShort(x.t) === dateShort(now) ? ct(x.t) : `${dateShort(x.t)} ${ct(x.t)}`) })),
    stories: list.map(([kicker, a]) => ({ kicker, a })),
  };
}
