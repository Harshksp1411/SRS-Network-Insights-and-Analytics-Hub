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

// what most of the week's incidents were, in plain words
const KIND_PLAIN = { circuit: 'internet line faults', jitter: 'slow or unstable lines', apdown: 'Wi-Fi access points down', crc: 'cabling errors', lte: 'backup line problems', scanner: 'handheld Wi-Fi drop-outs', pos: 'slow card payments', dhcp: 'devices unable to join the network', backup: 'failed config backups', cpu: 'overloaded switches' };
const hrs = ms => ms >= 90 * MIN ? `${(ms / HR).toFixed(1)} h` : `${Math.round(ms / MIN)} min`;
const money = v => `$${num(Math.round(v))}`;

// the shared facts every headline is written from
function facts(s, now, L, bs = D.BRANCHES, region) {
  const ids = new Set(bs.map(b => b.id));
  const hs = bs.map(b => healthOf(s, b));
  const open = s.incidents.filter(i => i.state !== 'Resolved' && ids.has(i.branchId));
  const resolved7 = s.resolved.filter(i => (i.resolved || 0) >= now - 7 * DAY && ids.has(i.branchId));
  const auto7 = resolved7.filter(i => i.auto || /zero touch/i.test(i.closeCode || '')), auto24 = auto7.filter(i => i.resolved >= now - DAY);
  const risk = open.filter(i => slaClock(i, now).used > 0.5);
  const onB = bs.filter(b => onBackupOf(s, b));
  const pend = s.approvals.filter(a => a.status === 'Pending' && (!a.branchId || ids.has(a.branchId)));
  const av = D.SLA.find(m => m.n === 29), k = D.MTTR_MONTHS.months.length - 2;
  const crit = D.DEVICES.filter(d => ids.has(d.branchId) && D.vulnsOf(d).some(a => a.sev === 'Critical'));
  const cap = bs.map(D.capacityOf).filter(x => x.wanDays <= 90 || x.wifiDays <= 90);
  const ready = bs.map(b => branchChecks(s, b));
  const inScope = c => !region || c.scope === region || c.scope === 'All regions';
  // the last seven days and the week ahead
  const opened7 = open.filter(i => i.opened >= now - 7 * DAY), fix = resolved7.map(i => i.resolved - i.opened).sort((a, b) => a - b);
  const kinds = {}; resolved7.forEach(i => { kinds[i.kind] = (kinds[i.kind] || 0) + 1; });
  const top = Object.entries(kinds).sort((a, b) => b[1] - a[1])[0];
  const done7 = s.changes.filter(c => c.start >= now - 7 * DAY && c.start <= now && inScope(c)), next7 = s.changes.filter(c => c.start > now && c.start < now + 7 * DAY && inScope(c));
  const week = {
    res: resolved7.length, auto: auto7.length, med: fix.length ? fix[fix.length >> 1] : 0, p1: resolved7.filter(i => i.pri === 'P1').length,
    carrier: resolved7.filter(i => i.closeCode === 'Carrier / LEC').length, branches: new Set([...resolved7, ...opened7].map(i => i.branchId)).size,
    top: top ? [KIND_PLAIN[top[0]] || top[0], top[1]] : ['none', 0], hours: Math.round(auto7.length * 0.75),
    done: done7.length, failed: done7.filter(c => /fail|roll/i.test(c.state)).length, next: next7.length, nextFw: next7.filter(c => /firmware|ECOS/i.test(c.title)).length,
    unrecorded: s.drift.filter(d => ids.has(d.branchId) && d.since >= now - 7 * DAY && /no CHG/i.test(d.source || '')).length,
    freezes: s.freezes.filter(x => x.start > now && x.start < now + 7 * DAY && inScope(x)).length,
    golives: s.projects.filter(x => x.golive > now && x.golive < now + 7 * DAY && (!region || x.region === region)).length,
  };
  // the last full month, its trend and the next 30 days
  const lines = D.CIRCUITS.filter(c => ids.has(c.branchId)).map(c => circuitOf(s, c.id));
  const breach = lines.filter(c => D.availOf(c) < D.LINE_SLA[c.type]);
  const meets = x => x.lower ? x.act <= x.esl : x.act >= x.esl;
  const mon = {
    prev: D.MTTR_MONTHS.months[k - 1], first: D.MTTR_MONTHS.months[0], uptimePrev: av.trend[k - 1], p1First: D.MTTR_MONTHS.P1[0],
    slaMet: D.SLA.filter(meets).length, slaN: D.SLA.length, slaLow: D.SLA.filter(x => !meets(x) && x.msl != null && (x.lower ? x.act > x.msl : x.act < x.msl)).length,
    flap: lines.filter(c => c.flaps30 >= 3).length, breach: breach.length, repeat: lines.filter(c => c.tickets90 >= 3).length,
    credits: Math.round(sum(breach, c => D.lineMRC(c) * (D.LINE_SLA[c.type] - D.availOf(c) > 0.005 ? 0.25 : 0.1))),
    capSoon: cap.filter(x => Math.min(x.wanDays, x.wifiDays) <= 30).length, eos: D.DEVICES.filter(d => ids.has(d.branchId) && /2530/.test(d.model)).length,
    golives: s.projects.filter(x => x.golive > now && x.golive < now + 30 * DAY && (!region || x.region === region)).length,
  };
  return {
    n: bs.length, down: hs.filter(h => h === 'down').length, degraded: hs.filter(h => h === 'degraded').length, up: hs.filter(h => h === 'up').length,
    open, resolved7, auto7, auto24, risk, onB, pend, crit, cap,
    notReady: ready.filter(r => r.result === 'Not ready').length, attention: ready.filter(r => r.result === 'Needs attention').length,
    uptime: av.trend[k], uptimeT: av.esl, month: D.MTTR_MONTHS.months[k], mttrP1: D.MTTR_MONTHS.P1[k], mttrP2: D.MTTR_MONTHS.P2[k],
    drift: s.drift.filter(d => ids.has(d.branchId)), lat: L && L.series ? Math.round(L.series.wan.at(-1)) : D.AVG_LAT,
    circuitsDown: D.CIRCUITS.filter(c => ids.has(c.branchId) && circuitOf(s, c.id).status === 'Down').length,
    breaching: open.filter(i => slaClock(i, now).resBreached).length,
    belowFw: D.DEVICES.filter(d => ids.has(d.branchId) && D.FW_TARGET[d.type === 'AP' ? 'AP' : d.model].indexOf(d.fw) > (d.type === 'SD-WAN' ? 1 : 2)).length,
    backFail: D.DEVICES.filter(d => ids.has(d.branchId) && d.backup.st === 'Failed').length,
    week, mon,
  };
}

// what is on this person's calendar: today for the daily brief; the next 7 or 30 days, without the day's
// decisions and visits, for the weekly and monthly reports
function agenda(p, s, now, bs, period) {
  const ids = new Set(bs.map(b => b.id)), region = p.region, daily = period === 'daily';
  const span = { daily: DAY, weekly: 7 * DAY, monthly: 30 * DAY }[period];
  const out = [];
  const inScope = c => !region || c.scope === region || c.scope === 'All regions';
  s.changes.filter(c => c.start > now && c.start < now + span && inScope(c) && (p.id !== 'cio' || c.risk !== 'Low') && (period !== 'monthly' || c.risk !== 'Low')).forEach(c => out.push({ t: c.start, label: daily ? c.window : dateShort(c.start), what: `${c.id} ${c.title}`, where: `${c.scope} · ${c.risk} risk · ${c.state}`, kind: 'Change' }));
  if (daily) s.approvals.filter(a => a.status === 'Pending' && (!a.branchId || ids.has(a.branchId)) && (p.id !== 'security' || a.type === 'Change' || /config|firmware|drift|relay/i.test(a.title))).forEach(a => out.push({ t: null, what: `Decide ${a.id}: ${a.title}`, where: `${Math.round(a.conf * 100)}% confidence · ${a.why[0]}`, kind: 'Decision' }));
  if (daily && ['stores', 'regional', 'itservice'].includes(p.id)) s.workOrders.filter(w => ids.has(w.branchId) && w.status !== 'Completed').forEach(w => out.push({ t: w.eta || null, what: `${w.status === 'Unassigned' ? 'Unassigned visit' : 'Technician visit'}: ${w.task}`, where: `${D.BR[w.branchId].name} · ${w.window}`, kind: 'Visit' }));
  if (daily && ['networks', 'itservice', 'regional', 'stores'].includes(p.id)) s.cases.filter(c => !c.closed && c.eta && ids.has(c.branchId) && c.eta < now + DAY).forEach(c => out.push({ t: c.eta, what: `${c.carrier} restore due: ${c.id}`, where: `${D.BR[c.branchId].name}${c.eta < now ? ' · already late' : ''}`, kind: 'Carrier', late: c.eta < now }));
  if (['cio', 'stores', 'regional'].includes(p.id) || !daily) s.projects.filter(x => x.golive > now && x.golive < now + Math.max(span, 8 * DAY) && (daily ? x.stage === 'Cutover' || x.stage === 'Kit staged' : true) && (!region || x.region === region)).forEach(x => out.push({ t: x.golive, label: dateShort(x.golive), what: `Go-live: ${x.brand} – ${x.site}`, where: `${x.stage}, ${x.rag}`, kind: 'Project' }));
  if (['cio', 'networks', 'stores', 'security'].includes(p.id) || !daily) s.freezes.filter(f => f.start > now && f.start < now + Math.max(span, 7 * DAY) && inScope(f)).forEach(f => out.push({ t: f.start, label: dateShort(f.start), what: `Change freeze starts: ${f.name}`, where: f.scope, kind: 'Freeze' }));
  if (daily && ['networks', 'regional'].includes(p.id)) s.predictions.filter(x => x.status === 'New' && x.conf >= 0.8 && (!x.branchId || ids.has(x.branchId))).slice(0, 3).forEach(x => out.push({ t: null, what: `Act on ${x.id}: ${x.suggest}`, where: `${x.branchId ? D.BR[x.branchId].name : x.target} · ${x.horizon}`, kind: 'Prevent' }));
  // the month ahead leads with go-lives and freezes, the bigger items; the day and the week run in time order
  const rank = x => period === 'monthly' ? { Freeze: 0, Project: 1 }[x.kind] ?? 2 : 0;
  return out.sort((a, b) => rank(a) - rank(b) || (a.t == null) - (b.t == null) || (a.t || 0) - (b.t || 0)).slice(0, 9);
}

// The front page in plain words: headline, one-line deck, three things to know, four numbers and the story in
// focus, a short paragraph about one branch in the news.
const hero = n => D.storeOf(n);
const pct = (a, b) => `${Math.round(a / Math.max(1, b) * 100)}%`;
const pl = (n, one, many = `${one}s`) => `${num(n)} ${n === 1 ? one : many}`;
const cap1 = t => t.charAt(0).toUpperCase() + t.slice(1);
// the branch stories the reports put in focus
const FOCUS = {
  rollback: () => `${hero(D.HERO.config).name}: a policy change slowed the ordering system at opening. Mova iO spotted it, rolled it back and the branch was back to normal in 15 minutes.`,
  wifi: () => `${hero(D.HERO.autoAP).name}: a warehouse Wi-Fi point went dark. Mova iO restarted it from the switch and the handhelds were back in under 3 minutes, with no ticket worked by hand.`,
  unrecorded: () => `${hero(D.HERO.changes).name}: warehouse handhelds lost their connection after a switch setting was changed overnight with no change record.`,
  bandwidth: () => `${hero(D.HERO.bandwidth).name} uses more of its internet line every week as cloud camera backups grow. It will reach its limit in about 5 weeks unless the backups move to after closing.`,
  trend: (f, m) => `Time to fix major outages has improved every month since ${m.first}: from ${m.p1First} hours then to ${f.mttrP1} hours in ${f.month}, against a 4-hour target.`,
};
const DAILY = {
  cio: (f) => ({
    headline: `${num(f.up)} of ${num(f.n)} branches open and trading normally`,
    deck: `${pl(f.pend.length, 'decision')} ${f.pend.length === 1 ? 'waits' : 'wait'} for your team today; automation fixed ${pl(f.auto24.length, 'problem')} in the last 24 hours.`,
    know: [`${f.down ? `${pl(f.down, 'branch', 'branches')} offline` : 'No branch is offline'} and ${num(f.degraded)} open with a problem; ${num(f.onB.length)} are trading on their backup internet line.`, `${pl(f.open.length, 'incident')} ${f.open.length === 1 ? 'is' : 'are'} open; ${num(f.risk.length)} ${f.risk.length === 1 ? 'is close to its' : 'are close to their'} deadline.`, `${f.notReady ? `${pl(f.notReady, 'branch', 'branches')} ${f.notReady === 1 ? 'is' : 'are'} not ready to open` : 'Every branch is ready to open'}; field teams and carriers are on it.`],
    numbers: [['Trading normally', pct(f.up, f.n), 'ok'], ['Open incidents', num(f.open.length), 'info'], ['Fixed automatically, 24 h', num(f.auto24.length), 'ok'], ['Decisions waiting', num(f.pend.length), f.pend.length ? 'warn' : 'ok']],
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
    deck: `${pl(f.auto24.length, 'problem')} fixed themselves in the last 24 hours. ${pl(f.pend.length, 'action')} ${f.pend.length === 1 ? 'waits' : 'wait'} for a person.`,
    know: [f.breaching ? `${pl(f.breaching, 'incident')} ${f.breaching === 1 ? 'is' : 'are'} past the deadline.` : 'Nothing is past its deadline.', `${pl(f.open.filter(i => !i.acked).length, 'incident')} ${f.open.filter(i => !i.acked).length === 1 ? 'is' : 'are'} not yet acknowledged.`, 'Carrier repairs are the main thing keeping incidents open. Their promised times are on your list.'],
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

// The weekly report looks back over the last seven days and ahead to next week.
const fixedBy = w => `${pct(w.auto, w.res)} fixed automatically`;
const WEEKLY = {
  cio: ({ week: w, open }) => ({
    headline: `${num(w.res)} problems fixed this week, ${pct(w.auto, w.res)} of them automatically`,
    deck: `Half were fixed within ${hrs(w.med)}. Automation saved about ${w.hours} engineer hours.`,
    know: [`The most common problem was ${w.top[0]} (${w.top[1]} of ${w.res}).`, `${pl(w.done, 'change')} went in this week${w.failed ? `; ${w.failed} was rolled back automatically` : ''}. ${pl(w.next, 'change')} ${w.next === 1 ? 'is' : 'are'} planned for next week.`, `${pl(w.branches, 'branch', 'branches')} had at least one problem; ${pl(open.length, 'incident')} ${open.length === 1 ? 'is' : 'are'} still open.`],
    numbers: [['Problems fixed', num(w.res), 'info'], ['Fixed automatically', pct(w.auto, w.res), 'ok'], ['Half fixed within', hrs(w.med), 'info'], ['Changes next week', num(w.next), 'warn']],
    inFocus: FOCUS.wifi(),
  }),
  networks: ({ week: w, auto7 }) => ({
    headline: `${cap1(w.top[0])} led the week: ${w.top[1]} of ${num(w.res)} problems`,
    deck: `${pl(w.done, 'change')} went in and ${pl(w.next, 'change')} ${w.next === 1 ? 'is' : 'are'} planned for next week, ${w.nextFw} of them software updates.`,
    know: [`${pl(w.carrier, 'problem')} needed a carrier to fix.`, `Automation fixed ${pl(auto7.length, 'problem')} with no engineer (${pct(w.auto, w.res)}).`, `${pl(w.unrecorded, 'setting')} ${w.unrecorded === 1 ? 'was' : 'were'} changed without a change record this week.`],
    numbers: [['Problems fixed', num(w.res), 'info'], ['Needed a carrier', num(w.carrier), 'warn'], ['Changes made', num(w.done), 'info'], ['Changes next week', num(w.next), 'warn']],
    inFocus: FOCUS.rollback(),
  }),
  stores: ({ week: w, n }) => ({
    headline: `${pl(w.branches, 'branch', 'branches')} had a problem this week; ${num(n - w.branches)} had none`,
    deck: `${cap1(fixedBy(w))}, and half of all problems were fixed within ${hrs(w.med)}.`,
    know: [`The most common problem was ${w.top[0]}.`, `${pl(w.next, 'change')} ${w.next === 1 ? 'is' : 'are'} planned for next week${w.freezes ? ` and ${pl(w.freezes, 'change freeze')} ${w.freezes === 1 ? 'starts' : 'start'}` : ''}.`, w.golives ? `${pl(w.golives, 'new branch', 'new branches')} ${w.golives === 1 ? 'goes' : 'go'} live in the next 7 days.` : 'No new branch goes live in the next 7 days.'],
    numbers: [['Branches with a problem', num(w.branches), 'warn'], ['Problems fixed', num(w.res), 'info'], ['Fixed automatically', pct(w.auto, w.res), 'ok'], ['Go-lives next week', num(w.golives), 'info']],
    inFocus: FOCUS.wifi(),
  }),
  itservice: ({ week: w, open }) => ({
    headline: `${num(w.res)} incidents closed this week; half within ${hrs(w.med)}`,
    deck: `${num(w.auto)} closed themselves (${pct(w.auto, w.res)}), saving about ${w.hours} engineer hours. ${pl(open.length, 'incident')} ${open.length === 1 ? 'remains' : 'remain'} open.`,
    know: [w.p1 ? `${pl(w.p1, 'major outage')} (P1) this week.` : 'No major outage (P1) this week.', `${pl(w.carrier, 'incident')} needed a carrier to fix.`, `The most common problem was ${w.top[0]}.`],
    numbers: [['Incidents closed', num(w.res), 'info'], ['Closed automatically', pct(w.auto, w.res), 'ok'], ['Half closed within', hrs(w.med), 'info'], ['Still open', num(open.length), 'warn']],
    inFocus: FOCUS.rollback(),
  }),
  security: ({ week: w, crit }) => ({
    headline: w.unrecorded ? `${pl(w.unrecorded, 'setting')} changed without a change record this week` : 'Every change this week had a change record',
    deck: `${pl(w.done, 'recorded change')} went in. ${pl(w.next, 'change')} ${w.next === 1 ? 'is' : 'are'} planned for next week, ${w.nextFw} of them software updates that close known security flaws.`,
    know: [`${pl(crit.length, 'device')} still ${crit.length === 1 ? 'needs' : 'need'} a critical security patch.`, `${w.freezes ? `${pl(w.freezes, 'change freeze')} ${w.freezes === 1 ? 'starts' : 'start'} next week.` : 'No change freeze starts next week.'}`, `${pl(w.golives, 'new branch', 'new branches')} ${w.golives === 1 ? 'joins' : 'join'} the network next week; the card payment network must be checked at each.`],
    numbers: [['Recorded changes', num(w.done), 'info'], ['Without a record', num(w.unrecorded), w.unrecorded ? 'bad' : 'ok'], ['Software updates next week', num(w.nextFw), 'info'], ['Critical patch needed', num(crit.length), crit.length ? 'bad' : 'ok']],
    inFocus: FOCUS.unrecorded(),
  }),
  regional: ({ week: w, n, cap }, p) => ({
    headline: `${p.region}: ${num(w.res)} problems fixed this week, ${num(w.auto)} automatically`,
    deck: `${num(w.branches)} of ${num(n)} branches had a problem; half were fixed within ${hrs(w.med)}.`,
    know: [`The most common problem was ${w.top[0]}.`, `${pl(w.next, 'change')} touching the region ${w.next === 1 ? 'is' : 'are'} planned for next week.`, `${pl(cap.length, 'branch', 'branches')} in the region will reach a bandwidth or Wi-Fi limit within 90 days.`],
    numbers: [['Problems fixed', num(w.res), 'info'], ['Fixed automatically', num(w.auto), 'ok'], ['Branches with a problem', num(w.branches), 'warn'], ['Changes next week', num(w.next), 'info']],
    inFocus: FOCUS.bandwidth(),
  }),
};

// The monthly report: the last full month against target, the six-month trend and the next 30 days.
const MONTHLY = {
  cio: ({ mon: m, ...f }) => ({
    headline: `${f.month}: uptime ${P(f.uptime, 3)}, ${m.slaMet} of ${m.slaN} service levels met`,
    deck: `Major outages were fixed in ${f.mttrP1} hours on average, well inside the 4-hour target. Carriers owe about ${money(m.credits)} in service credits.`,
    know: [`Uptime was ${P(f.uptime, 3)}, against ${P(m.uptimePrev, 3)} in ${m.prev} and a ${P(f.uptimeT, 2)} goal.`, `${pl(f.cap.length, 'branch', 'branches')} will need more bandwidth or Wi-Fi within 90 days.`, `${num(m.eos)} older switches lose vendor support in early 2027; replacement waves are scheduled.`],
    numbers: [[`Uptime, ${f.month}`, P(f.uptime, 3), f.uptime >= f.uptimeT ? 'ok' : 'warn'], ['Service levels met', `${m.slaMet} of ${m.slaN}`, m.slaLow ? 'warn' : 'ok'], ['Time to fix major outages', `${f.mttrP1} h`, 'ok'], ['Carrier credits due', money(m.credits), 'info']],
    inFocus: FOCUS.trend(f, m),
  }),
  networks: ({ mon: m, ...f }) => ({
    headline: `${pl(m.flap, 'internet line')} dropped 3 or more times in 30 days; ${num(m.breach)} missed the carrier's promise`,
    deck: `Carriers owe about ${money(m.credits)} in service credits. ${pl(m.repeat, 'line')} had 3 or more tickets in 90 days.`,
    know: [`${f.month} uptime was ${P(f.uptime, 3)} against a ${P(f.uptimeT, 2)} goal.`, `${num(f.belowFw)} devices run older software than policy allows.`, `${pl(f.cap.length, 'branch', 'branches')} will reach a bandwidth or Wi-Fi limit within 90 days, ${m.capSoon} within 30.`],
    numbers: [['Unstable lines', num(m.flap), 'warn'], ['Missed carrier promise', num(m.breach), m.breach ? 'bad' : 'ok'], ['Carrier credits due', money(m.credits), 'info'], ['Older software', num(f.belowFw), 'warn']],
    inFocus: FOCUS.trend(f, m),
  }),
  stores: ({ mon: m, ...f }) => ({
    headline: `${f.month}: branches were online ${P(f.uptime, 3)} of the time`,
    deck: `Fixes keep getting faster: major outages took ${m.p1First} hours in ${m.first} and ${f.mttrP1} hours in ${f.month}.`,
    know: [`${pl(f.cap.length, 'branch', 'branches')} will outgrow bandwidth or Wi-Fi within 90 days, ${m.capSoon} within 30.`, `${pl(m.repeat, 'branch line')} had 3 or more faults in 90 days.`, m.golives ? `${pl(m.golives, 'new branch', 'new branches')} ${m.golives === 1 ? 'goes' : 'go'} live in the next 30 days.` : 'No new branch goes live in the next 30 days.'],
    numbers: [[`Uptime, ${f.month}`, P(f.uptime, 3), f.uptime >= f.uptimeT ? 'ok' : 'warn'], ['Time to fix major outages', `${f.mttrP1} h`, 'ok'], ['Need more capacity', num(f.cap.length), 'warn'], ['Unreliable lines', num(m.repeat), 'warn']],
    inFocus: FOCUS.bandwidth(),
  }),
  itservice: ({ mon: m, ...f }) => ({
    headline: `${m.slaMet} of ${m.slaN} service levels met in ${f.month}`,
    deck: `${m.slaLow ? `${pl(m.slaLow, 'service level')} fell below the minimum.` : 'None fell below the minimum.'} Major outages were fixed in ${f.mttrP1} h (target 4 h), other urgent incidents in ${f.mttrP2} h (target 8 h).`,
    know: [`Time to fix has improved every month since ${m.first}.`, `Carriers owe about ${money(m.credits)} for missed promises.`, `${pl(m.repeat, 'line')} had 3 or more tickets in 90 days and need a carrier review.`],
    numbers: [['Service levels met', `${m.slaMet} of ${m.slaN}`, m.slaLow ? 'warn' : 'ok'], ['Below the minimum', num(m.slaLow), m.slaLow ? 'bad' : 'ok'], ['Fix time, major (P1)', `${f.mttrP1} h`, 'ok'], ['Fix time, urgent (P2)', `${f.mttrP2} h`, 'ok']],
    inFocus: FOCUS.trend(f, m),
  }),
  security: ({ mon: m, ...f }) => ({
    headline: `${num(m.eos)} switches lose vendor support in early 2027`,
    deck: `${pl(f.crit.length, 'device')} still ${f.crit.length === 1 ? 'needs' : 'need'} a critical patch and ${num(f.belowFw)} run older software than policy allows.`,
    know: ['Replacement waves for the older switches are scheduled from January.', `${pl(f.drift.length, 'device')} ${f.drift.length === 1 ? 'differs' : 'differ'} from the standard setup.`, `${pl(f.backFail, 'config backup')} failed last night and ${f.backFail === 1 ? 'is' : 'are'} being re-run.`],
    numbers: [['Losing vendor support', num(m.eos), 'warn'], ['Critical patch needed', num(f.crit.length), f.crit.length ? 'bad' : 'ok'], ['Older software', num(f.belowFw), 'warn'], ['Settings drifted', num(f.drift.length), 'warn']],
    inFocus: `The ${num(m.eos)} Aruba 2530 switches reach end of support on 31 January 2027 (48-port) and 31 March 2027 (24-port). After that, new security flaws in them will not be fixed, so every one is planned for replacement before then.`,
  }),
  regional: ({ mon: m, ...f }, p) => ({
    headline: `${p.region}: ${pl(m.flap, 'unstable internet line')} in the last 30 days`,
    deck: `${num(m.breach)} missed the carrier's promise; about ${money(m.credits)} in credits to claim.`,
    know: [`${pl(f.cap.length, 'branch', 'branches')} in the region need more capacity within 90 days.`, `${pl(m.repeat, 'line')} had 3 or more faults in 90 days.`, `${num(m.eos)} older switches in the region lose support in early 2027.`],
    numbers: [['Unstable lines', num(m.flap), 'warn'], ['Missed carrier promise', num(m.breach), m.breach ? 'bad' : 'ok'], ['Need more capacity', num(f.cap.length), 'warn'], ['Older switches', num(m.eos), 'warn']],
    inFocus: FOCUS.bandwidth(),
  }),
};
const H = { daily: DAILY, weekly: WEEKLY, monthly: MONTHLY };

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
  const inRegion = c => c.scope === p.region || c.scope === 'All regions';
  const next7 = s.changes.filter(c => c.start > now && c.start < now + 7 * DAY && inRegion(c));
  const lines = D.CIRCUITS.filter(c => ids.has(c.branchId)).map(c => circuitOf(s, c.id));
  const repeat = lines.filter(c => c.tickets90 >= 3).sort((a, b) => b.tickets90 - a.tickets90), flap = lines.filter(c => c.flaps30 >= 3).sort((a, b) => b.flaps30 - a.flaps30);
  const eos = D.DEVICES.filter(d => ids.has(d.branchId) && /2530/.test(d.model)), eosBy = {}; eos.forEach(d => { eosBy[d.branchId] = (eosBy[d.branchId] || 0) + 1; });
  const st = {
    health: ['Right now', { title: `${bad.length} ${p.region} branches down or degraded`, blocks: [T(['Branch', 'Status', 'Why'], bad.map(({ b, i }) => ({ cells: [{ text: b.name, bold: true, sub: b.brand }, { text: healthOf(s, b) === 'down' ? 'Down' : 'Degraded', tone: healthOf(s, b) === 'down' ? 'bad' : 'warn' }, i ? i.title : (b.watch ? b.watch.why : b.why || 'Watch level')] })))], src: 'Orchestrator, ServiceNow' }],
    ready: ['Opening', { title: `${ready.filter(x => x.r.result === 'Not ready').length} not ready to open, ${ready.filter(x => x.r.result === 'Needs attention').length} need attention`, blocks: [T(['Branch', 'Result', 'First issue'], ready.slice(0, 10).map(x => ({ cells: [{ text: x.b.name, bold: true }, { text: x.r.result, tone: x.r.result === 'Not ready' ? 'bad' : 'warn' }, Object.values(x.r.c).find(c => c.st !== 'pass')?.detail || x.r.incs[0]?.title || ''] })))], src: 'Readiness checks' }],
    backup: ['Backup lines', { title: `${bs.filter(b => onBackupOf(s, b)).length} branches on their backup ISP`, blocks: [T(['Branch', 'Primary lost', 'Now on'], bs.filter(b => onBackupOf(s, b)).map(b => { const c1 = circuitOf(s, b.wan[0]), c2 = circuitOf(s, b.wan[1]); return { cells: [{ text: b.name, bold: true, sub: b.brand }, `${c1.carrier} ${c1.type}`, `${c2.carrier} ${c2.type}`] }; }))], src: 'Orchestrator' }],
    visits: ['Visits', { title: `${wos.length} technician visits`, blocks: [T(['Branch', 'Task', 'Status'], wos.map(w => ({ cells: [{ text: D.BR[w.branchId].name, bold: true }, w.task, `${w.status}${w.eta ? `, ETA ${ct(w.eta)}` : ''}`] })))], src: 'ServiceNow work orders' }],
    changes: ['Changes', ask(s, 'What changed at Store 118 in the last 24 hours?', now, L)],
    bandwidth: ['Bandwidth', ask(s, 'Show top bandwidth users at Store 45 yesterday.', now, L)],
    capacity: ['Capacity', { title: `${cap.length} ${p.region} branches reach a limit within 90 days`, blocks: [T(['Branch', 'WAN p95', 'Wi-Fi peak', 'Days to limit'], cap.map(x => ({ cells: [{ text: x.b.name, bold: true }, `${x.wanP95}%`, `${x.wifiPeak}%`, { text: String(Math.min(x.wanDays, x.wifiDays)), tone: Math.min(x.wanDays, x.wifiDays) <= 30 ? 'bad' : 'warn' }] })))], src: 'Orchestrator, Aruba Central, Prediction agent' }],
    week: ['The week', { title: `${res7.length} incidents resolved in ${p.region} this week, ${res7.filter(i => i.auto).length} with no human touch`, blocks: [T(['Branch', 'Incident', 'Closed'], res7.slice(0, 12).map(i => ({ cells: [{ text: D.BR[i.branchId].name, bold: true }, i.title, i.auto ? { text: 'Auto-fixed', tone: 'ok' } : i.closeCode] })))], src: 'ServiceNow' }],
    next: ['Next week', { title: `${next7.length} changes touching ${p.region} in the next 7 days`, blocks: [T(['When', 'Change', 'Risk'], next7.map(c => ({ cells: [{ text: dateShort(c.start), bold: true, sub: c.window }, c.title, { text: c.risk, tone: c.risk === 'High' ? 'bad' : c.risk === 'Medium' ? 'warn' : undefined }] })))], src: 'ServiceNow change calendar' }],
    repeat: ['Repeat offenders', { title: `${repeat.length} ${p.region} lines with 3 or more tickets in 90 days`, blocks: [T(['Line', 'Branch', 'Tickets'], repeat.slice(0, 10).map(c => ({ cells: [{ text: `${c.carrier} ${c.type}`, bold: true, sub: c.id }, D.BR[c.branchId].name, { text: String(c.tickets90), tone: 'warn' }] })))], src: 'ServiceNow, carrier cases' }],
    carriers: ['Carriers', { title: `${flap.length} ${p.region} lines dropped 3 or more times in 30 days`, blocks: [T(['Line', 'Branch', 'Drops', 'Availability'], flap.slice(0, 10).map(c => ({ cells: [{ text: `${c.carrier} ${c.type}`, bold: true, sub: c.id }, D.BR[c.branchId].name, { text: String(c.flaps30), tone: 'warn' }, { text: `${(D.availOf(c) * 100).toFixed(2)}%`, tone: D.availOf(c) < D.LINE_SLA[c.type] ? 'bad' : 'ok' }] })))], src: 'Orchestrator, carrier SLAs' }],
    eos: ['Lifecycle', { title: `${eos.length} ${p.region} switches lose vendor support in early 2027`, lead: 'Aruba 2530 switches reach end of support on 31 Jan 2027 (48-port) and 31 Mar 2027 (24-port); each is planned for replacement before then.', blocks: [T(['Branch', 'Switches'], Object.entries(eosBy).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, n]) => ({ cells: [{ text: D.BR[id].name, bold: true }, String(n)] })))], src: 'Device inventory, HPE lifecycle notices' }],
  };
  const pick = { daily: ['health', 'ready', 'backup', 'visits', 'changes', 'bandwidth'], weekly: ['week', 'next', 'repeat', 'visits'], monthly: ['carriers', 'capacity', 'eos'] }[period];
  return pick.map(k => st[k]);
}

export function compose(p, s, now, L, period = 'daily') {
  const bs = p.region ? D.BRANCHES.filter(b => b.region === p.region) : D.BRANCHES;
  const f = facts(s, now, L, bs, p.region);
  const h = H[period][p.id](f, p);
  const list = p.region ? regionStories(p, s, now, L, period) : p[period].map(([kicker, q]) => [kicker, ask(s, q, now, L)]);
  const label = { daily: 'Morning Brief', weekly: 'Weekly Report', monthly: 'Monthly Report' }[period];
  const range = period === 'daily' ? dateShort(now) : period === 'weekly' ? `Week of ${dateShort(now - 7 * DAY)} – ${dateShort(now)}` : `${f.month} ${new Date(now).getFullYear()} and the 30 days ahead`;
  const stories = list.map(([kicker, a]) => ({ kicker, a, sum: summarize(a) }));
  const top = stories.filter(x => !x.sum.empty).slice(0, 4);
  return {
    persona: p, period, label, range, at: now,
    // the weather is today's; the weekly and monthly reports look back instead
    weather: period === 'daily' ? weatherOf(f) : null, headline: h.headline, deck: h.deck, know: h.know,
    inFocus: h.inFocus,
    numbers: h.numbers.map(([label, value, tone]) => ({ label, value, tone })),
    agenda: agenda(p, s, now, bs, period).slice(0, 5).map(x => ({ ...x, what: x.what.replace(/^CHG\d+\s+/, '').replace(/^Decide (APR-\d+): /, 'Decide: '), when: x.t == null ? 'Today' : x.t < now ? 'Overdue' : x.label || (dateShort(x.t) === dateShort(now) ? ct(x.t) : `${dateShort(x.t)} ${ct(x.t)}`) })),
    stories: top, inBrief: stories.filter(x => !top.includes(x)),
  };
}
