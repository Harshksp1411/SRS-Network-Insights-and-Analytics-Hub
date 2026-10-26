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
    belowFw: D.DEVICES.filter(d => ids.has(d.branchId) && D.FW_TARGET[d.type === 'AP' ? 'AP' : d.model].indexOf(d.fw) > (d.type === 'SD-WAN' ? 1 : 2)).length,
    backFail: D.DEVICES.filter(d => ids.has(d.branchId) && d.backup.st === 'Failed').length,
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

// The front page in plain words: headline, one-line deck, three things to know, four numbers and the story in
// focus, a short paragraph about one branch in the news.
const hero = n => D.storeOf(n);
const pct = (a, b) => `${Math.round(a / Math.max(1, b) * 100)}%`;
const pl = (n, one, many = `${one}s`) => `${num(n)} ${n === 1 ? one : many}`;
const H = {
  cio: (f) => ({
    headline: `${num(f.up)} of ${num(f.n)} branches open and trading normally`,
    deck: `Automation fixed ${pl(f.auto7.length, 'problem')} on its own this week. ${pl(f.pend.length, 'decision')} ${f.pend.length === 1 ? 'waits' : 'wait'} for your team.`,
    know: [`${f.down ? `${pl(f.down, 'branch', 'branches')} offline` : 'No branch is offline'} and ${num(f.degraded)} open with a problem; ${num(f.onB.length)} are trading on their backup internet line.`, `${f.month} uptime was ${P(f.uptime, 3)}, ${f.uptime >= f.uptimeT ? 'on' : 'just under'} the ${P(f.uptimeT, 2)} goal. Major outages were fixed in ${f.mttrP1} hours on average (goal: 4).`, `${pl(f.cap.length, 'branch', 'branches')} will outgrow their bandwidth or Wi-Fi within 90 days, and 728 older switches lose vendor support in early 2027. Both need budget.`],
    numbers: [['Trading normally', pct(f.up, f.n), 'ok'], [`Uptime, ${f.month}`, P(f.uptime, 3), f.uptime >= f.uptimeT ? 'ok' : 'warn'], ['Fixed automatically', num(f.auto7.length), 'ok'], ['Decisions waiting', num(f.pend.length), f.pend.length ? 'warn' : 'ok']],
    inFocus: `${hero(D.HERO.config).name} is back to normal after Mova iO undid a faulty change on its own this morning. It stays under watch for 24 hours.`,
  }),
  networks: (f) => ({
    headline: `${pl(f.down, 'branch', 'branches')} offline, ${num(f.onB.length)} riding on backup lines`,
    deck: `A bad policy change at Branch ${D.HERO.config} was rolled back automatically. A switch fix at Branch ${D.HERO.changes} waits for your approval.`,
    know: [`${pl(f.circuitsDown, 'internet circuit')} ${f.circuitsDown === 1 ? 'is' : 'are'} down; SD-WAN moved those branches to their backup line and they kept trading.`, `${pl(f.drift.length, 'device')} no longer ${f.drift.length === 1 ? 'matches' : 'match'} the standard setup.`, `Average delay to the data centre is ${f.lat} ms.`],
    numbers: [['Offline', num(f.down), f.down ? 'bad' : 'ok'], ['On backup line', num(f.onB.length), 'warn'], ['Circuits down', num(f.circuitsDown), f.circuitsDown ? 'warn' : 'ok'], ['Settings drifted', num(f.drift.length), f.drift.length ? 'warn' : 'ok']],
    inFocus: `${hero(D.HERO.config).name}: a policy change slowed the ordering system at opening. Mova iO spotted it, rolled it back and the branch was back to normal in 15 minutes.`,
  }),
  stores: (f) => ({
    headline: `${pl(f.notReady, 'branch', 'branches')} not ready to open; ${num(f.up)} trading normally`,
    deck: `${pl(f.onB.length, 'branch', 'branches')} ${f.onB.length === 1 ? 'is' : 'are'} taking payments on a backup line. Technician visits and fixes are on your list for today.`,
    know: [`${pl(f.attention, 'more branch', 'more branches')} need a quick check before opening.`, 'On a backup line, card payments work as normal; the ordering system is a little slower.', `${pl(f.down, 'branch', 'branches')} ${f.down === 1 ? 'is' : 'are'} offline right now. Branch managers have been told what still works.`],
    numbers: [['Trading normally', num(f.up), 'ok'], ['Not ready to open', num(f.notReady), f.notReady ? 'bad' : 'ok'], ['Need a check', num(f.attention), 'warn'], ['On backup line', num(f.onB.length), 'warn']],
    inFocus: `${hero(D.HERO.failover).name} lost its main internet line to a fibre cut and switched to its backup in 4 seconds. Customers did not notice.`,
  }),
  itservice: (f) => ({
    headline: `${pl(f.open.length, 'open incident')}; ${num(f.risk.length)} close to their deadline`,
    deck: `${pl(f.auto7.length, 'problem')} fixed themselves this week. ${pl(f.pend.length, 'action')} ${f.pend.length === 1 ? 'waits' : 'wait'} for a person.`,
    know: [f.breaching ? `${pl(f.breaching, 'incident')} ${f.breaching === 1 ? 'is' : 'are'} past the deadline.` : 'Nothing is past its deadline.', `Last month, major outages were fixed in ${f.mttrP1} hours on average (goal: 4).`, 'Carrier repairs are the main thing keeping incidents open. Their promised times are on your list.'],
    numbers: [['Open incidents', num(f.open.length), 'info'], ['Near deadline', num(f.risk.length), f.risk.length ? 'warn' : 'ok'], ['Past deadline', num(f.breaching), f.breaching ? 'bad' : 'ok'], ['Waiting on a person', num(f.pend.length), 'warn']],
    inFocus: `${hero(D.HERO.autoAP).name}: a warehouse Wi-Fi point went dark. Mova iO restarted it from the switch and the handhelds were back in under 3 minutes, with no ticket worked by hand.`,
  }),
  security: (f) => ({
    headline: `${pl(f.crit.length, 'device')} need a critical security patch`,
    deck: `A switch at Branch ${D.HERO.changes} was changed by a local account with no change record. Fixes for the exposed devices run outside trading hours.`,
    know: [`${pl(f.drift.filter(d => d.sev === 'High').length, 'device')} ${f.drift.filter(d => d.sev === 'High').length === 1 ? 'has' : 'have'} high-risk settings that differ from the standard.`, `${num(f.belowFw)} devices run older software than policy allows.`, '728 older Aruba 2530 switches lose vendor support in early 2027.'],
    numbers: [['Critical patch needed', num(f.crit.length), f.crit.length ? 'bad' : 'ok'], ['High-risk drift', num(f.drift.filter(d => d.sev === 'High').length), 'warn'], ['Older software', num(f.belowFw), 'warn'], ['Backups failed', num(f.backFail), f.backFail ? 'warn' : 'ok']],
    inFocus: `${hero(D.HERO.changes).name}: warehouse handhelds lost their connection after a switch setting was changed overnight with no change record.`,
  }),
  regional: (f, p) => ({
    headline: `${p.region}: ${num(f.up)} of ${num(f.n)} branches trading normally`,
    deck: `Branch ${D.HERO.failover} is on its backup line after a fibre cut. Branch ${D.HERO.changes}'s handhelds wait on a quick fix.`,
    know: [`${f.down ? `${pl(f.down, 'branch', 'branches')} offline` : 'No branch is offline'} and ${num(f.degraded)} ${f.degraded === 1 ? 'is' : 'are'} open with a problem.`, `${pl(f.notReady, 'branch', 'branches')} not ready to open.`, `${pl(f.onB.length, 'branch', 'branches')} on a backup internet line.`],
    numbers: [['Branches', num(f.n), 'info'], ['Trading normally', num(f.up), 'ok'], ['Not ready to open', num(f.notReady), f.notReady ? 'bad' : 'ok'], ['On backup line', num(f.onB.length), 'warn']],
    inFocus: `${hero(D.HERO.failover).name} lost its main internet line to a fibre cut and switched to its backup in 4 seconds. Customers did not notice.`,
  }),
};

// today's "network weather" from the share of branches with a problem
function weatherOf(f) {
  const share = (f.down + f.degraded) / Math.max(1, f.n);
  const kind = share < 0.02 && !f.down ? 'sun' : share < 0.06 ? 'partly' : share < 0.12 ? 'cloud' : 'storm';
  return { kind, word: { sun: 'Clear skies', partly: 'Mostly sunny', cloud: 'Cloudy', storm: 'Stormy' }[kind], line: `${pct(f.up, f.n)} of branches trading normally` };
}

// A story boiled down for the front page: a plain title, one sentence, up to three numbers or bars and three short
// points. The full answer stays on the story for "Read the full story".
const PLAIN = [[/\bMTTR\b/g, 'time to fix'], [/\bcritical CVEs?\b/g, 'critical security flaw'], [/\bCVEs?\b/g, 'security flaw'], [/\bSLA clock\b/g, 'deadline'], [/\bcarrier availability SLA\b/g, 'carrier uptime promise'], [/\bSLAs?\b/g, 'target'], [/\bgolden config\b/g, 'standard setup'], [/\bWAN\b/g, 'bandwidth'], [/\bbackup ISP\b/g, 'backup internet line'], [/\bp95\b/gi, 'peak']];
const plain = t => PLAIN.reduce((x, [re, to]) => x.replace(re, to), String(t || ''));
const txt = c => c == null ? '' : typeof c === 'object' ? String(c.text ?? '') : String(c);
const clip = (t, n) => t.length > n ? `${t.slice(0, n).replace(/[\s,;:–-]+\S*$/, '')}…` : t;
// the lead's first sentence, without brackets, cut at a clause break when it runs long
function sentence(t) {
  let x = ((t || '').replace(/\s*\([^)]*\)/g, '').match(/^.*?[.!?](?=\s|$)/) || [t || ''])[0].trim();
  if (x.length > 120) { const m = x.slice(40).search(/[:;]| – /); if (m >= 0 && m + 40 < 120) x = `${x.slice(0, m + 40).trim()}.`; }
  return plain(clip(x, 140));
}
function summarize(a) {
  const B = a.blocks || [];
  const tb = B.find(k => k.type === 'table' && k.rows.length), ls = B.find(k => k.type === 'list' && k.items.length), tl = B.find(k => k.type === 'timeline'), lay = B.find(k => k.type === 'layers');
  let points = [];
  if (lay) points = lay.items.map(x => ({ b: x.name, t: x.verdict }));
  else if (tb) points = tb.rows.map(r => { const tone = r.cells.slice(1).find(c => c && typeof c === 'object' && c.tone && txt(c).length <= 32); return { b: clip(txt(r.cells[0]), 44), t: clip(txt(tone || r.cells[1]), 40), tone: tone && tone.tone }; });
  else if (ls) points = ls.items.map(x => ({ b: x.k && x.k !== '•' ? clip(x.k, 40) : '', t: clip(x.v, 60) }));
  else if (tl) points = tl.items.map(x => ({ b: x.t, t: clip(x.text, 60) }));
  const kp = B.find(k => k.type === 'kpis'), bars = B.find(k => k.type === 'bars');
  return {
    title: plain(a.title), line: sentence(a.lead),
    stats: kp ? kp.items.slice(0, 3).map(x => ({ label: plain(x.label), value: String(x.value), tone: x.tone })) : [],
    bars: !kp && bars ? { title: bars.title, max: bars.max, items: bars.items.slice(0, 4) } : null,
    points: points.filter(x => x.b || x.t).slice(0, 3),
    empty: !B.some(k => (k.type === 'table' ? k.rows.length : k.type === 'list' ? k.items.length : true)),
  };
}

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
  const stories = list.map(([kicker, a]) => ({ kicker, a, sum: summarize(a) }));
  const top = stories.filter(x => !x.sum.empty).slice(0, 4);
  return {
    persona: p, period, label, range, at: now,
    weather: weatherOf(f), headline: h.headline, deck: h.deck, know: h.know,
    inFocus: h.inFocus,
    numbers: h.numbers.map(([label, value, tone]) => ({ label, value, tone })),
    agenda: agenda(p, s, now, bs).slice(0, 5).map(x => ({ ...x, what: x.what.replace(/^CHG\d+\s+/, '').replace(/^Decide (APR-\d+): /, 'Decide: '), when: x.t == null ? 'Today' : x.t < now ? 'Overdue' : x.label || (dateShort(x.t) === dateShort(now) ? ct(x.t) : `${dateShort(x.t)} ${ct(x.t)}`) })),
    stories: top, inBrief: stories.filter(x => !top.includes(x)),
  };
}
