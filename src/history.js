// Twelve months of service history (Nov 2025 to Oct 2026) for the SLA & KPI tracker and its PDF report: every
// Annexure B metric month by month, time to restore, tickets by cause (the call drivers) and tickets by branch.
// The last six months are the ones the console already shows (D.SLA trends, D.MTTR_MONTHS, D.TICKET_MONTHS); the six
// before lead into them. A seeded generator of its own keeps the rest of the sample data unchanged.
import * as D from './data.js';
import { rng } from './util.js';

const R = rng(20261104);
const noise = a => (R() * 2 - 1) * a;
export const MONTHS12 = [['Nov', 2025], ['Dec', 2025], ['Jan', 2026], ['Feb', 2026], ['Mar', 2026], ['Apr', 2026], ['May', 2026], ['Jun', 2026], ['Jul', 2026], ['Aug', 2026], ['Sep', 2026], ['Oct', 2026]].map(([m, y]) => ({ m, y, label: `${m} ${y}` }));
export const PERIODS = [3, 6, 9, 12];
export const AI_LINE = /AI|Automation|AIOps|Knowledge/;

// ── every metric, month by month: six earlier months, then the console's six (the last one is this month's actual) ──
export const SLA12 = D.SLA.map(m => {
  const t = m.trend, dir = m.lower ? -1 : 1, tiny = m.esl > 0.999;
  const slope = Math.abs(t[5] - t[0]) / 5;
  const step = tiny ? 0.00003 : Math.max(slope * 0.8, m.esl > 0.9 ? 0.0012 : 0.006);
  // newer capabilities (AI, automation) ramp up gently into the six months shown, never from nothing
  const floor = m.lower ? t[0] * 1.6 : t[0] * 0.5;
  const early = Array.from({ length: 6 }, (_, k) => { const back = 6 - k, v = t[0] - dir * step * 0.75 * back + noise(step * 0.3); return m.lower ? Math.min(floor, v) : Math.max(floor, v); });
  const series = [...early, ...t.slice(0, 5), m.act].map(v => +Math.min(tiny ? 0.99995 : 0.9995, Math.max(0.01, v)).toFixed(tiny ? 5 : 4));
  return { m, series };
});
export const slaStatusAt = (m, v) => { if (m.lower) return v <= m.esl ? 'Meets ESL' : 'Below target'; if (v >= m.esl) return 'Meets ESL'; if (m.msl != null && v >= m.msl) return 'Above MSL'; return m.msl == null ? 'Below target' : 'Below MSL'; };

// ── mean time to restore by priority, hours ──
export const MTTR12 = Object.fromEntries(['P1', 'P2', 'P3'].map(p => {
  const s = D.MTTR_MONTHS[p], step = (s[0] - s[5]) / 5;
  return [p, [...Array.from({ length: 6 }, (_, k) => +(s[0] + step * 0.7 * (6 - k) + noise(step * 0.2)).toFixed(1)), ...s]];
}));

// ── tickets: what they were about (the call drivers) and where ──
export const DRIVERS = [
  { k: 'circuit', label: 'ISP circuit down or flapping', w: 6, calls: 0.25, auto: false },
  { k: 'apdown', label: 'Wi-Fi access point down', w: 5, calls: 0.3, auto: true },
  { k: 'backup', label: 'Config backup failures', w: 4, calls: 0, auto: true },
  { k: 'jitter', label: 'Slow or unstable WAN (latency, loss)', w: 3, calls: 0.45, auto: true },
  { k: 'crc', label: 'Cabling or port errors', w: 3, calls: 0.1, auto: false },
  { k: 'lte', label: 'Backup LTE link problems', w: 3, calls: 0.2, auto: false },
  { k: 'scanner', label: 'Handheld scanner Wi-Fi drops', w: 3, calls: 0.7, auto: true },
  { k: 'pos', label: 'Card payments (POS) slow', w: 1, calls: 0.85, auto: true },
  { k: 'dhcp', label: 'Devices not getting an IP address', w: 1, calls: 0.6, auto: false },
  { k: 'cpu', label: 'Switch overloaded or looping', w: 1, calls: 0.15, auto: true },
];
const DRV = Object.fromEntries(DRIVERS.map(d => [d.k, d]));
// building materials is seasonal: summer is busy in the yard and storm season hits the lines
const SEASON = { circuit: [1, 1, 1, 0.95, 1, 1.05, 1.15, 1.25, 1.2, 1.1, 1, 1], scanner: [0.9, 0.8, 0.85, 0.9, 1, 1.1, 1.25, 1.3, 1.25, 1.15, 1, 0.95], lte: [1, 1, 1, 1, 1, 1.05, 1.1, 1.2, 1.15, 1.05, 1, 1] };
const TARGET = [470, 430, 455, 480, 520, ...D.TICKET_MONTHS.map(t => t.afterHours + t.ntf + t.carrier + t.customer + t.reboot), 520];

const repeat = new Set(D.CIRCUITS.filter(c => c.tickets90 >= 3).map(c => c.branchId));
const heroes = new Set(Object.values(D.HERO).map(n => D.storeOf(n)?.id).filter(Boolean));
const pickDriver = () => { let x = R() * 30; for (const d of DRIVERS) { x -= d.w; if (x <= 0) return d.k; } return 'circuit'; };
const BRW = D.BRANCHES.map(b => {
  const z = Math.sqrt(-2 * Math.log(1 - R() * 0.999)) * Math.cos(2 * Math.PI * R());
  return { b, w: Math.exp(z * 0.75) * (repeat.has(b.id) ? 2.1 : 1) * (heroes.has(b.id) ? 3 : 1), main: repeat.has(b.id) ? 'circuit' : pickDriver() };
});
const WSUM = BRW.reduce((a, x) => a + x.w, 0);
// tickets[branch][month]
const BYBR = BRW.map(x => TARGET.map(tot => { const e = tot * x.w / WSUM; return Math.floor(e) + (R() < e - Math.floor(e) ? 1 : 0); }));
const AUTO_RATE = SLA12.find(x => /Auto-resolution/.test(x.m.name)).series;
// tickets by driver and month: each branch's own main cause takes half of its tickets, the rest follow the mix
const BYDRV = MONTHS12.map((_, mi) => {
  const w = Object.fromEntries(DRIVERS.map(d => [d.k, 0]));
  BRW.forEach((x, bi) => { const n = BYBR[bi][mi]; if (!n) return; w[x.main] += n * 0.5; DRIVERS.forEach(d => { w[d.k] += n * 0.5 * d.w / 30 * (SEASON[d.k]?.[mi] ?? 1) * (1 + noise(0.06)); }); });
  const tot = BYBR.reduce((a, r) => a + r[mi], 0), sw = Object.values(w).reduce((a, v) => a + v, 0);
  const raw = DRIVERS.map(d => w[d.k] / sw * tot), out = raw.map(Math.floor);
  let left = tot - out.reduce((a, v) => a + v, 0);
  raw.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left-- > 0) out[i]++; });
  return Object.fromEntries(DRIVERS.map((d, i) => [d.k, out[i]]));
});

// trading hours a store is open in a month, and the store hours one ticket costs by cause (after failover and auto-fix)
export const TRADE_H = 312;
export const IMPACT = { circuit: 0.35, apdown: 0.15, backup: 0, jitter: 0.3, crc: 0.1, lte: 0.05, scanner: 0.2, pos: 0.9, dhcp: 0.35, cpu: 0.6 };
const IMPACT_AVG = DRIVERS.reduce((a, d) => a + IMPACT[d.k] * d.w, 0) / 30;
// ── one period, everything the tracker cards and the PDF need ──
export function period(n) {
  const idx = MONTHS12.map((_, i) => i).slice(-n), months = idx.map(i => MONTHS12[i]);
  const byMonth = idx.map(i => { const total = BYBR.reduce((a, r) => a + r[i], 0); const auto = Math.round(total * AUTO_RATE[i]); return { label: MONTHS12[i].m, full: MONTHS12[i].label, total, auto, engineer: total - auto }; });
  const tickets = byMonth.reduce((a, x) => a + x.total, 0), auto = byMonth.reduce((a, x) => a + x.auto, 0);
  const drivers = DRIVERS.map(d => {
    const per = idx.map(i => BYDRV[i][d.k]), t = per.reduce((a, v) => a + v, 0);
    const autoable = DRIVERS.filter(x => x.auto).reduce((a, x) => a + idx.reduce((s, i) => s + BYDRV[i][x.k], 0), 0);
    return { ...d, tickets: t, share: t / Math.max(1, tickets), storeCalls: Math.round(t * d.calls), autoFixed: d.auto ? Math.round(auto * t / Math.max(1, autoable)) : 0, first: per[0], last: per[per.length - 1], per };
  }).sort((a, b) => b.tickets - a.tickets);
  const branches = BRW.map((x, bi) => { const per = idx.map(i => BYBR[bi][i]), tickets = per.reduce((a, v) => a + v, 0);
    // store hours lost: half the tickets follow the branch's main cause, the rest the estate mix; the backup line absorbs most outages
    const hrs = per.map(t => t * (0.5 * IMPACT[x.main] + 0.5 * IMPACT_AVG));
    const lost = hrs.reduce((a, v) => a + v, 0);
    return { b: x.b, tickets, per, hrsPer: hrs, lost, avail: 1 - lost / (TRADE_H * n), availPer: hrs.map(h => 1 - h / TRADE_H), driver: DRV[x.main].label, driverKey: x.main, repeat: repeat.has(x.b.id) }; })
    .sort((a, b) => b.tickets - a.tickets || a.b.num - b.b.num);
  const sla = SLA12.map(({ m, series }) => {
    const s = idx.map(i => series[i]), avg = s.reduce((a, v) => a + v, 0) / s.length;
    return { m, series: s, avg, latest: s[s.length - 1], status: slaStatusAt(m, avg), latestStatus: slaStatusAt(m, s[s.length - 1]), met: s.filter(v => slaStatusAt(m, v) === 'Meets ESL').length, ai: AI_LINE.test(m.line) };
  });
  const mttr = Object.fromEntries(Object.entries(MTTR12).map(([p, s]) => [p, idx.map(i => s[i])]));
  return { n, months, from: months[0].label, to: months[months.length - 1].label, byMonth, tickets, auto, autoShare: auto / Math.max(1, tickets), drivers, branches, sla, mttr,
           storeCalls: drivers.reduce((a, d) => a + d.storeCalls, 0) };
}
