// The four charts on each role's dashboard, as plain data: the page draws them as interactive charts and the PDF
// export draws the same numbers. Each picture, and each part of it, says where it leads in the drill-down.
// Also: where each sentence, number and calendar entry on the dashboard leads (goFor).
import * as D from '../data.js';
import { slaClock } from '../store.jsx';
import { C } from '../charts.jsx';
import { DAY, sum, num, dateShort } from '../util.js';
import { STATUS, KIND_PLAIN, TTR_BUCKETS, statusOf, readyOf, activeLine, incidentsOf, isAutoInc, dayIdx, dayLabel, devicesOf, fwBehind, linesOf, creditOf, capOf, capDays, changesOf, SETS, stateName } from './drilldata.js';

// how each picture formats its numbers (web and PDF)
export const FMT = {
  pct0: v => `${Math.round(v * 100)}%`, pct3: v => `${(v * 100).toFixed(3)}%`, ms: v => `${Math.round(v)} ms`, h: v => `${(+v).toFixed(1)} h`, n: v => num(Math.round(v)),
};
// six months; the last is the month so far
export const MONTHS_SO_FAR = D.MTTR_MONTHS.months.map((m, i, a) => i === a.length - 1 ? `${m} so far` : m);
const P0 = v => `${Math.round(v * 100)}%`;
const share = (a, b) => { const v = a / Math.max(1, b); return v >= 0.995 && a < b ? `${(Math.floor(v * 1000) / 10).toFixed(1)}%` : P0(v); };

function geoOf(bs, region) {
  // the next level down: regions for the estate, states for the regional dashboard
  const key = region ? b => b.state : b => b.region;
  const m = {}; bs.forEach(b => { (m[key(b)] = m[key(b)] || []).push(b); });
  const order = region ? Object.keys(m).sort((a, b) => m[b].length - m[a].length) : D.REGIONS.filter(r => m[r]);
  return order.map(k => ({ k, label: region ? stateName(k) : k, bs: m[k], node: region ? { region, state: k } : { region: k } }));
}

export function visualsOf(p, s, now, period, bs) {
  const region = p.region, R = region ? { region } : {};
  const st = Object.fromEntries(bs.map(b => [b.id, statusOf(s, b)]));
  const cnt = k => bs.filter(b => st[b.id] === k).length;
  const geo = geoOf(bs, region), by = region ? 'state' : 'region';
  const res7 = incidentsOf(s, { k: 'resolved7', ...R }, now);
  const days = Array.from({ length: 7 }, (_, k) => { const g = res7.filter(i => dayIdx(i.resolved, now) === k); return { label: dayLabel(k, now), Automatic: g.filter(isAutoInc).length, 'By an engineer': g.filter(i => !isAutoInc(i)).length }; });
  const V = {
    status: () => ({
      kind: 'stack', title: 'Every branch right now', go: { t: 'set', k: 'all', ...R }, unit: 'branches',
      caption: `${share(cnt('up'), bs.length)} trading normally; ${num(cnt('backup'))} kept trading on the backup line.`,
      top: bs.filter(b => st[b.id] !== 'up').sort((a, b) => ({ down: 0, degraded: 1, backup: 2 }[st[a.id]] - { down: 0, degraded: 1, backup: 2 }[st[b.id]]) || a.num - b.num).slice(0, 4).map(b => { const i = s.incidents.find(x => x.branchId === b.id && x.state !== 'Resolved'); return { label: b.name, why: i ? i.title : st[b.id] === 'backup' ? 'Main line down; trading on the backup' : b.why || 'Being watched', color: STATUS[st[b.id]].color, go: { t: 'branch', id: b.id } }; }),
      parts: ['up', 'backup', 'degraded', 'down'].map(k => ({ label: STATUS[k].label, value: cnt(k), color: STATUS[k].color, go: { t: 'set', k: { up: 'healthy', backup: 'backup', degraded: 'degraded', down: 'down' }[k], ...R } })),
    }),
    map: () => ({
      kind: 'map', title: 'Where the problems are', go: { t: 'set', k: 'issues', ...R }, focus: !!region,
      caption: `${num(bs.length - cnt('up'))} branches being worked on, shown in colour. Click a dot for the branch.`,
      points: bs.map(b => ({ id: b.id, x: b.x, y: b.y, st: st[b.id], color: STATUS[st[b.id]].color, label: `${b.name} · ${STATUS[st[b.id]].label}` })),
    }),
    regions: () => ({
      kind: 'hbars', title: `Trading normally, by ${by}`, go: { t: 'set', k: 'all', ...R }, max: 1, fmt: 'pct0',
      caption: `Share of branches with no open problem. Click a ${by} to go in.`,
      rows: geo.slice(0, region ? 8 : 10).map(g => { const v = g.bs.filter(b => st[b.id] === 'up').length / g.bs.length; return { label: g.label, value: v, display: P0(v), sub: `${g.bs.length} branches`, color: Math.round(v * 100) >= 97 ? C.ok : Math.round(v * 100) >= 94 ? C.s1 : C.warn, go: { t: 'set', k: 'all', ...g.node } }; }),
    }),
    autoDays: () => ({
      kind: 'cols', title: 'Problems fixed, last 7 days', go: { t: 'incidents', k: 'resolved7', ...R }, keys: ['Automatic', 'By an engineer'], colors: [C.ok, C.s1],
      caption: `${num(sum(days, d => d.Automatic))} of ${num(res7.length)} fixed automatically, with no engineer called.`,
      data: days, goes: days.map((d, k) => ({ t: 'incidents', k: 'resolved7', day: k, dayLabel: d.label, ...R })),
    }),
    latency: () => ({
      kind: 'hbars', title: `Delay to the data centre, by ${by}`, go: { t: 'set', k: 'latency', ...R }, fmt: 'ms',
      caption: 'Average round trip on the line each branch is using. Under 60 ms keeps payments and ordering quick.',
      rows: geo.map(g => { const v = sum(g.bs.filter(b => st[b.id] !== 'down'), b => activeLine(s, b).lat) / Math.max(1, g.bs.filter(b => st[b.id] !== 'down').length); return { label: g.label, value: v, display: `${Math.round(v)} ms`, color: v < 45 ? C.ok : v < 60 ? C.s1 : C.warn, go: { t: 'set', k: 'latency', ...g.node } }; }).sort((a, b) => b.value - a.value).slice(0, 10),
    }),
    ready: () => {
      const r = bs.map(b => readyOf(s, b).result);
      const parts = [['All checks passed', r.filter(x => x === 'Ready' || x === 'Fixed overnight').length, C.ok, 'readiness'], ['Can open, one check to watch', r.filter(x => x === 'Needs attention').length, C.warn, 'attention'], ['Not ready', r.filter(x => x === 'Not ready').length, C.bad, 'notReady']];
      const CHK = { wan1: 'Main line', wan2: 'Backup line', ec: 'SD-WAN', tun: 'Tunnels', sw: 'Switches', wifi: 'Wi-Fi', dhcp: 'Addresses', cfg: 'Config', pos: 'Card payments', erp: 'Ordering system' };
      const top = bs.filter(b => readyOf(s, b).result === 'Not ready').slice(0, 4).map(b => { const f = Object.entries(readyOf(s, b).c).find(([, x]) => x.st === 'fail'); return { label: b.name, why: f ? `${CHK[f[0]] || f[0]}: ${f[1].detail}` : 'Not ready', color: C.bad, go: { t: 'branch', id: b.id } }; });
      return { kind: 'donut', title: 'Ready to open', go: { t: 'set', k: 'readiness', ...R }, top, topTitle: 'Not ready, first failed check', center: share(bs.length - parts[2][1], bs.length), sub: 'ready to open', caption: `${num(bs.length - parts[2][1])} of ${num(bs.length)} can open; the ten opening checks run before every branch opens.`, parts: parts.map(([label, value, color, k]) => ({ label, value, color, go: { t: 'set', k, ...R } })) };
    },
    queue: () => {
      const open = incidentsOf(s, { k: 'open', ...R }, now);
      const data = ['P1', 'P2', 'P3', 'P4'].map(pr => { const g = open.filter(i => i.pri === pr); return { label: pr, 'On track': g.filter(i => slaClock(i, now).used <= 0.5).length, 'To watch': g.filter(i => slaClock(i, now).used > 0.5).length }; });
      return { kind: 'cols', title: 'Open incidents by priority', go: { t: 'incidents', k: 'open', ...R }, keys: ['On track', 'To watch'], colors: [C.ok, C.warn], data, goes: data.map(d => ({ t: 'incidents', k: 'open', pri: d.label, ...R })), caption: `${num(open.length)} open; ${num(sum(data, d => d['On track']))} comfortably inside their deadline.` };
    },
    devices: () => {
      const ds = devicesOf(s, { k: 'all', ...R }), drift = new Set(s.drift.map(d => d.device));
      const crit = ds.filter(d => D.vulnsOf(d).some(a => a.sev === 'Critical')), cs = new Set(crit.map(d => d.id));
      const fw = ds.filter(d => !cs.has(d.id) && fwBehind(d)), fs = new Set(fw.map(d => d.id));
      const dr = ds.filter(d => !cs.has(d.id) && !fs.has(d.id) && drift.has(d.id));
      const clear = ds.length - crit.length - fw.length - dr.length;
      return { kind: 'donut', title: 'Devices', go: { t: 'devices', k: 'all', ...R }, center: share(clear, ds.length), sub: 'all clear', caption: `${num(ds.length)} SD-WAN appliances, switches and access points.`,
        parts: [{ label: 'All clear', value: clear, color: C.ok, go: { t: 'devices', k: 'all', ...R } }, { label: 'Critical flaw to patch', value: crit.length, color: C.bad, go: { t: 'devices', k: 'crit', ...R } }, { label: 'Behind on software', value: fw.length, color: C.warn, go: { t: 'devices', k: 'fw', ...R } }, { label: 'Differs from standard', value: dr.length, color: C.s5, go: { t: 'drift', ...R } }] };
    },
    kinds: () => {
      const m = {}; res7.forEach(i => { m[i.kind] = (m[i.kind] || 0) + 1; });
      return { kind: 'hbars', title: 'What went wrong, last 7 days', go: { t: 'incidents', k: 'resolved7', ...R }, fmt: 'n', caption: 'Problems fixed in the last 7 days, by kind. Click one to see them.',
        rows: Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => ({ label: KIND_PLAIN[k] || k, value: v, display: num(v), color: C.s1, go: { t: 'incidents', k: 'resolved7', kind: k, ...R } })) };
    },
    ttr: () => ({
      kind: 'hbars', title: 'How long fixes took', go: { t: 'incidents', k: 'resolved7', ...R }, fmt: 'n', caption: `${share(res7.filter(i => i.resolved - i.opened < 4 * 36e5).length, res7.length)} fixed within 4 hours.`,
      rows: TTR_BUCKETS.map(([l, [a, b]]) => { const v = res7.filter(i => i.resolved - i.opened >= a && i.resolved - i.opened < b).length; return { label: l, value: v, display: num(v), color: C.s4, go: { t: 'incidents', k: 'resolved7', ttr: l, ...R } }; }),
    }),
    clean: () => {
      const w = new Set([...s.resolved.filter(i => (i.resolved || 0) >= now - 7 * DAY), ...s.incidents.filter(i => i.opened >= now - 7 * DAY)].map(i => i.branchId));
      return { kind: 'hbars', title: `Trouble-free for 7 days, by ${by}`, go: { t: 'set', k: 'clean7', ...R }, max: 1, fmt: 'pct0', caption: `${share(bs.filter(b => !w.has(b.id)).length, bs.length)} of branches had no problem at all in 7 days.`,
        rows: geo.slice(0, region ? 8 : 10).map(g => { const v = g.bs.filter(b => !w.has(b.id)).length / g.bs.length; return { label: g.label, value: v, display: P0(v), sub: `${g.bs.length} branches`, color: v >= 0.9 ? C.ok : C.s1, go: { t: 'set', k: 'clean7', ...g.node } }; }) };
    },
    changes: () => {
      const done = changesOf(s, { k: 'done7', ...R }, now), next = changesOf(s, { k: 'next7', ...R }, now);
      const data = Array.from({ length: 14 }, (_, i) => { const t0 = now - (7 - i) * DAY; const inDay = c => c.start >= t0 && c.start < t0 + DAY; return { label: i === 7 ? 'Today' : dateShort(t0), Made: done.filter(inDay).length, Planned: next.filter(inDay).length }; });
      return { kind: 'cols', title: 'Changes, last 7 days and next 7', go: { t: 'changes', k: 'next7', ...R }, keys: ['Made', 'Planned'], colors: [C.s1, C.s6], data, goes: data.map((d, i) => ({ t: 'changes', k: i < 7 ? 'done7' : 'next7', ...R })), caption: `${num(done.length)} made, ${num(done.filter(c => /fail|roll/i.test(c.state)).length)} rolled back; ${num(next.length)} planned.` };
    },
    uptime: () => { const m = D.SLA.find(x => x.n === 29), i = D.SLA.indexOf(m); return { kind: 'line', title: 'Network uptime, six months', go: { t: 'metric', i }, labels: MONTHS_SO_FAR, fmt: 'pct3', padL: 62, series: [{ name: 'Uptime', color: C.s1, data: m.trend }], refLines: [{ v: m.esl, label: `Goal ${(m.esl * 100).toFixed(2)}%`, color: C.ok }], caption: `${(m.trend[4] * 100).toFixed(3)}% last month, ${m.trend[4] >= m.trend[3] ? 'up' : 'down'} from ${(m.trend[3] * 100).toFixed(3)}%.` }; },
    mttr: () => { const M = D.MTTR_MONTHS; return { kind: 'line', title: 'Time to fix, six months', go: { t: 'mttr' }, labels: MONTHS_SO_FAR, fmt: 'h', yMin: 0, series: [{ name: 'Major outages (P1)', color: C.s1, data: M.P1 }, { name: 'Urgent (P2)', color: C.s5, data: M.P2 }], refLines: [{ v: M.target.P1, label: 'P1 target 4 h', color: C.bad }], caption: `Major outages: ${M.P1[0]} h in ${M.months[0]}, ${M.P1[4]} h in ${M.months[4]}. Faster every month.` }; },
    sla: () => {
      const st2 = D.SLA.map(m => m.lower ? (m.act <= m.esl ? 0 : 1) : m.act >= m.esl ? 0 : m.msl != null && m.act < m.msl ? 2 : 1);
      const parts = [['Met', 0, C.ok], ['Short of expected', 1, C.warn], ['Below minimum', 2, C.bad]].map(([label, k, color]) => ({ label, value: st2.filter(x => x === k).length, color, go: { t: 'sla' } }));
      return { kind: 'donut', title: 'Service levels', go: { t: 'sla' }, center: `${parts[0].value}/${D.SLA.length}`, sub: 'met', parts, caption: 'Annexure B service levels and KPIs, last full month.' };
    },
    carriers: () => {
      const br = linesOf(s, { k: 'breach', ...R }), m = {};
      br.forEach(c => { const k = c.carrier; (m[k] = m[k] || []).push(c); });
      return { kind: 'hbars', title: 'Lines below their carrier promise', go: { t: 'lines', k: 'breach', ...R }, fmt: 'n', caption: `${num(br.length)} lines, about $${num(Math.round(sum(br, creditOf)))} in credits to claim. Click a carrier.`,
        rows: Object.entries(m).sort((a, b) => b[1].length - a[1].length).slice(0, 7).map(([k, g]) => ({ label: k, value: g.length, display: num(g.length), sub: `$${num(Math.round(sum(g, creditOf)))} in credits`, color: C.warn, go: { t: 'lines', k: 'breach', carrier: k, ...R } })) };
    },
    capacity: () => ({
      kind: 'hbars', title: `Need more capacity within 90 days, by ${by}`, go: { t: 'set', k: 'capacity', ...R }, fmt: 'n', caption: 'Branches whose internet line or Wi-Fi fills up within 90 days at today’s growth.',
      rows: geo.map(g => { const v = g.bs.filter(b => capDays(capOf(s, b)) <= 90).length; return { label: g.label, value: v, display: num(v), color: C.warn, go: { t: 'set', k: 'capacity', ...g.node } }; }).filter(r => r.value).sort((a, b) => b.value - a.value).slice(0, 8),
    }),
    eos: () => {
      const ds = devicesOf(s, { k: 'eos', ...R }), m = {};
      ds.forEach(d => { const b = D.BR[d.branchId], k = region ? b.state : b.region; m[k] = (m[k] || 0) + 1; });
      return { kind: 'hbars', title: 'Switches reaching end of support', go: { t: 'devices', k: 'eos', ...R }, fmt: 'n', caption: `${num(ds.length)} Aruba 2530s; support ends 31 Jan 2027 (48-port) and 31 Mar 2027 (24-port).`,
        rows: Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => ({ label: region ? stateName(k) : k, value: v, display: num(v), color: C.warn, go: { t: 'devices', k: 'eos', ...(region ? { region, state: k } : { region: k }) } })) };
    },
  };
  const fourth = {
    daily: { cio: 'autoDays', networks: 'latency', stores: 'ready', regional: 'ready', itservice: 'queue', security: 'devices' },
    weekly: { networks: 'changes', security: 'changes' },
    monthly: { stores: 'capacity', security: 'eos' },
  };
  const pick = {
    daily: ['status', 'map', 'regions', fourth.daily[p.id]],
    weekly: ['autoDays', 'kinds', 'ttr', fourth.weekly[p.id] || 'clean'],
    monthly: ['uptime', 'mttr', 'sla', fourth.monthly[p.id] || 'carriers'],
  }[period];
  return pick.map(k => ({ id: k, ...V[k]() }));
}

// Where a sentence, number or calendar entry on the front page leads. Read in order; the first match wins.
export function goFor(text, period, region) {
  const t = String(text || ''), R = region ? { region } : {};
  const w = period === 'weekly', m = period === 'monthly';
  const br = t.match(/\bBranch (\d{1,3})\b/);
  const rules = [
    [/needed a carrier|depended on a carrier/i, () => ({ t: 'incidents', k: 'carrier7', ...R })],
    [/kept up to date|branch managers/i, () => ({ t: 'set', k: 'issues', ...R })],
    [/new branch|go(es)? live|go-live/i, () => ({ t: 'projects', ...R })],
    [/faults in 90|carrier review|repeat-offender/i, () => ({ t: 'lines', k: /unstable/i.test(t) && !/repeat/i.test(t) ? 'flap' : 'repeat', ...R })],
    [/handhelds|roll(-| )?back (is )?ready|ready to roll back|unrecorded change|no change record/i, () => br ? { t: 'branch', id: D.storeOf(+br[1]).id } : { t: 'drift', ...R }],
    [/without (a )?(change )?record|changed without|unrecorded/i, () => ({ t: 'drift', ...R })],
    [/offline/i, () => ({ t: 'set', k: 'down', ...R })],
    [/backup line|on (its|their) backup|backup, trading|kept trading on backup|switched to backup|to the backup|on the backup/i, () => ({ t: 'set', k: 'backup', ...R })],
    [/not ready|ready to open|quick check/i, () => ({ t: 'set', k: /not ready/i.test(t) ? 'notReady' : 'readiness', ...R })],
    [/trouble-free|no problem (at all|all week|in 7 days)/i, () => ({ t: 'set', k: 'clean7', ...R })],
    [/approved software|software update|security update|updates next week|updates, next/i, () => /next week|next 7 days|booked|scheduled/i.test(t) ? { t: 'changes', k: 'next7', ...R } : { t: 'devices', k: 'fw', ...R }],
    [/change control|clean changes|changes? went in|went in cleanly|recorded and approved/i, () => ({ t: 'changes', k: 'done7', ...R })],
    [/decision|approvals?\b|waiting for a person|actions? waiting/i, () => ({ t: 'approvals' })],
    [/carrier repair|promised time/i, () => ({ t: 'cases', ...R })],
    [/needed a carrier|depended on a carrier/i, () => ({ t: 'incidents', k: 'carrier7', ...R })],
    [/\bcredits?\b|missed (their )?promise|\bowes?\b/i, () => ({ t: 'lines', k: 'breach', ...R })],
    [/unstable|repeat-offender|stable lines|lines stable|dropped fewer/i, () => ({ t: 'lines', k: /repeat/i.test(t) ? 'repeat' : 'flap', ...R })],
    [/lines? up|internet lines/i, () => ({ t: 'lines', k: 'all', ...R })],
    [/capacity|bandwidth or wi-fi|room to grow|outgrow/i, () => ({ t: 'set', k: 'capacity', ...R })],
    [/switch(es)? to replace|older switches|end of support|replacement/i, () => ({ t: 'devices', k: 'eos', ...R })],
    [/critical (security )?flaw|to patch|clear of/i, () => ({ t: 'devices', k: 'crit', ...R })],
    [/approved software|software update|security update|updates next week|updates, next/i, () => /next week|next 7 days|booked|scheduled/i.test(t) ? { t: 'changes', k: 'next7', ...R } : { t: 'devices', k: 'fw', ...R }],
    [/standard setup|match the standard|high-risk setting|bring back to the standard/i, () => ({ t: 'drift', ...R })],
    [/backups?/i, () => ({ t: 'devices', k: 'backup', ...R })],
    [/service level/i, () => ({ t: 'sla' })],
    [/uptime|online .* of the time/i, () => ({ t: 'metric', i: D.SLA.findIndex(x => x.n === 29) })],
    [/time to fix|fix time|major outages? (were )?fixed|fixes keep|fixed in [\d.]+ ?h/i, () => w ? { t: 'incidents', k: 'resolved7', pri: /P2|urgent/i.test(t) ? 'P2' : 'P1', ...R } : { t: 'mttr' }],
    [/major outage|\(P1\)/i, () => ({ t: 'incidents', k: 'resolved7', pri: 'P1', ...R })],
    [/fixed automatically|automatic|no engineer|closed themselves|fixed themselves|before anyone|engineer hours|self-heal|closed automatically/i, () => ({ t: 'incidents', k: period === 'daily' ? 'auto24' : 'auto7', ...R })],
    [/deadline|to watch|on track/i, () => ({ t: 'incidents', k: /to watch|past/i.test(t) ? 'risk' : 'open', ...R })],
    [/owner/i, () => ({ t: 'incidents', k: 'open', ...R })],
    [/still open|open incidents|incidents? (still )?open/i, () => ({ t: 'incidents', k: 'open', ...R })],
    [/most common|led the week/i, () => ({ t: 'incidents', k: 'resolved7', ...R })],
    [/problems? fixed|incidents closed|problems were fixed|half of all/i, () => ({ t: 'incidents', k: 'resolved7', ...R })],
    [/change control|clean changes|changes? went in|recorded and approved/i, () => ({ t: 'changes', k: 'done7', ...R })],
    [/changes? (next|planned|scheduled)|changes, next|next week|next 7 days/i, () => ({ t: 'changes', k: 'next7', ...R })],
    [/delay|latency/i, () => ({ t: 'set', k: 'latency', ...R })],
    [/new branch|go(es)? live|go-live/i, () => ({ t: 'projects', ...R })],
    [/kept up to date|branch managers/i, () => ({ t: 'set', k: 'issues', ...R })],
    [/being worked on|open with a problem/i, () => ({ t: 'set', k: 'issues', ...R })],
    [/policy change|rolled back/i, () => br ? { t: 'branch', id: D.storeOf(+br[1]).id } : { t: 'changes', k: 'done7', ...R }],
    [/healthy|trading normally|online|open and trading|trading/i, () => ({ t: 'set', k: 'all', ...R })],
  ];
  for (const [re, f] of rules) if (re.test(t)) return f();
  if (br) return { t: 'branch', id: D.storeOf(+br[1]).id };
  return m ? { t: 'sla' } : { t: 'set', k: 'all', ...R };
}
export { SETS };
