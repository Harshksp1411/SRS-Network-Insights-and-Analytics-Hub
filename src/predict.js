// Forecasts and preventive-maintenance views. Deterministic model outputs built from the
// console's own data plus seeded noise, so numbers stay stable between renders.
import * as D from './data.js';
import { rng, hhmm, dateShort, parts, HR, DAY, MIN, T0 } from './util.js';

const hourOfDayCT = t => parts(t).h;

// Hourly incident arrivals: last 24 h actual + next 12 h forecast with an 80% band.
// Shape follows the RFP ticket mix: most tickets land after hours (1,977 of 3,773 "after-hours mended").
export function incidentForecast(now, stormBoost = 0) {
  const R = rng(4242);
  const shape = h => 0.55 + (h >= 19 || h < 5 ? 0.75 : 0) + (h >= 6 && h <= 9 ? 0.45 : 0) + (h >= 13 && h <= 16 ? 0.2 : 0);
  const actual = [], fc = [], lo = [], hi = [], labels = [];
  for (let i = -23; i <= 12; i++) {
    const t = now + i * HR; const h = hourOfDayCT(t);
    labels.push(hhmm(t).slice(0, 2) + ':00');
    const base = 0.9 * shape(h) * 1.6;
    if (i <= 0) { actual.push(Math.max(0, Math.round(base + (R() - 0.4) * 2))); fc.push(i === 0 ? actual[actual.length - 1] : null); lo.push(null); hi.push(null); }
    else { const storm = stormBoost && i >= 4 && i <= 8 ? stormBoost : 0; const v = +(base + storm).toFixed(1); actual.push(null); fc.push(v); lo.push(+Math.max(0, v - 0.9 - i * 0.05).toFixed(1)); hi.push(+(v + 1.1 + i * 0.08 + storm * 0.4).toFixed(1)); }
  }
  lo[23] = fc[23]; hi[23] = fc[23];
  return { labels, actual, fc, lo, hi, nowIndex: 23 };
}

// Incidents by region x hour-of-day, last 7 days
export function regionHourHeat() {
  const R = rng(77);
  const w = { Southeast: 1.25, 'Carolinas & Mid-Atlantic': 0.7, Northeast: 0.85, 'Great Lakes': 0.9, 'Central Plains': 0.55, 'Texas & South Central': 1.15, 'Mountain West': 0.6, Pacific: 0.65, Canada: 0.2 };
  return D.REGIONS.map(r => Array.from({ length: 24 }, (_, h) => Math.round(w[r] * ((h >= 19 || h < 5 ? 5.5 : h >= 6 && h <= 9 ? 4 : 2.2) + R() * 2.5))));
}

export function readinessTrend(now) {
  const R = rng(91);
  return Array.from({ length: 14 }, (_, i) => ({ label: dateShort(now - (13 - i) * DAY), pass: +(95.4 + R() * 2.4 - (i === 9 ? 2.1 : 0)).toFixed(1) }));
}

// Branches likely to fail tomorrow's pre-opening checks, with the preventive step
export function openingRisk(s) {
  const out = [];
  const pick = (city, brand) => D.BRANCHES.find(b => b.city === city && (!brand || b.brand === brand)) || D.BRANCHES.find(b => b.city === city);
  const add = (b, p, why, action, kind) => b && out.push({ id: b.id, b, p, why, action, kind });
  (s.predictions || D.PREDICTIONS).forEach(pr => { if (!pr.branchId || /Dismissed/.test(pr.status)) return; const b = D.BR[pr.branchId]; const p = Math.min(0.92, pr.conf * (pr.kind === 'Capacity forecast' ? 0.4 : 0.75)); add(b, p, pr.signal, pr.kind === 'Degrading circuit' ? 'Pre-steer POS/ERP to backup at 05:00 and open carrier case' : pr.kind === 'UPS battery' ? 'Swap battery tonight (after close)' : pr.kind.includes('AP') ? 'Pre-stage spare AP, reboot outside hours' : 'Schedule closet check', pr.kind); });
  add(pick('Pensacola'), 0.61, 'LTE backup failed weekly test; primary on repeat-offender list', 'Activate replacement SIM before 06:00', 'Backup path');
  add(pick('Oklahoma City'), 0.48, 'Storm cell forecast over metro 04:00–07:00 local', 'Confirm UPS runtime; pre-arm storm runbook', 'Weather');
  add(pick('Knoxville'), 0.44, 'Nightly backup failing 3 nights (TACACS+)', 'Re-run backup with RB-109 now', 'Config');
  add(pick('Sacramento'), 0.37, 'Handheld roam failures trending up 4 days', 'Push 2.4 GHz override for SRS-SCAN overnight', 'Wireless');
  return out.sort((a, b) => b.p - a.p).slice(0, 9);
}

// Next 8 hours of expected new incidents by priority
export function queueForecast(now) {
  const R = rng(55);
  return Array.from({ length: 8 }, (_, i) => { const h = hourOfDayCT(now + (i + 1) * HR); const k = h >= 19 || h < 5 ? 1.7 : 1; return { label: `${hhmm(now + (i + 1) * HR).slice(0, 2)}h`, P1: R() < 0.07 ? 1 : 0, P2: Math.round(R() * 1.2 * k), P3: Math.round((1 + R() * 2) * k), P4: Math.round((1 + R() * 2.4) * k) }; });
}

// Breach probability for an open incident: time used vs typical resolution curve for its category
export function breachProb(inc, clock) {
  const typical = { 'Carrier / LEC': 0.62, Wireless: 0.35, Switching: 0.3, 'Config management': 0.15, Power: 0.5, 'Customer-caused': 0.32, Hardware: 0.55 }[inc.cat] ?? 0.4;
  const p = 1 / (1 + Math.exp(-((clock.used - typical) * 7 + (inc.acked ? 0 : 0.8) + (inc.carrierCase ? 0.4 : 0))));
  return Math.max(0.02, Math.min(0.98, inc.state === 'Resolved' ? 0 : p));
}
export function predictedTTR(inc) {
  const m = { P1: 150, P2: 260, P3: 620, P4: 1500 }[inc.pri] * ({ 'Carrier / LEC': 1.35, Hardware: 1.2, Power: 0.8, 'Config management': 0.5 }[inc.cat] || 1);
  return Math.round(m) * MIN;
}

// Devices most likely to fail in 30 days (hardware/firmware/environment signals)
export function deviceRisk() {
  const R = rng(303);
  const drivers = [['Outdoor AP: 5 watchdog reboots in 7 d, radio 71 °C', 'Pre-stage spare AP-585; swap after close', 'AP'], ['PSU fan RPM falling 18% in 10 d', 'Order PSU; schedule swap in maintenance window', 'Switch'], ['ECOS N-3 + 2 reboots this month', 'Upgrade in next wave; spare EC-XS on standby', 'SD-WAN'], ['Uplink CRC errors rising daily', 'Replace SFP and patch lead', 'Switch'], ['Warranty expired + PoE port failures', 'Refresh in Q1 lifecycle plan', 'Switch'], ['Storage SMART warnings on EC', 'Pre-stage spare EC-XS (zero-touch)', 'SD-WAN']];
  const devs = D.DEVICES.filter((d, i) => i % 211 === 7).slice(0, 10);
  return devs.map((d, i) => { const opts = drivers.filter(x => x[2] === d.type); const dr = opts.length ? opts[i % opts.length] : drivers[i % drivers.length]; return { id: d.id, d, b: D.BR[d.branchId], p: +(0.82 - i * 0.055 - R() * 0.03).toFixed(2), why: dr[0], action: dr[1] }; });
}

export function warrantyByQuarter(now) {
  const q = Array.from({ length: 8 }, (_, i) => { const t = now + i * 91 * DAY; const p = parts(t); return { label: `Q${Math.floor((p.mo - 1) / 3) + 1} ${String(p.y).slice(2)}`, start: now + i * 91 * DAY, 'SD-WAN': 0, Switch: 0, AP: 0 }; });
  D.DEVICES.forEach(d => { const k = Math.floor((d.warranty - now) / (91 * DAY)); if (k >= 0 && k < 8) q[k][d.type]++; });
  return q;
}
export function backupTrend(now) { const R = rng(19); return Array.from({ length: 14 }, (_, i) => ({ label: dateShort(now - (13 - i) * DAY), v: +(97.4 + R() * 1.3 - (i === 11 ? 1.6 : 0)).toFixed(1) })); }

export function carrierMTTRTrend() {
  const months = ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];
  const R = rng(8);
  const mk = (base, drift) => months.map((_, i) => +(base + drift * i + (R() - 0.5) * 1.1).toFixed(1));
  return { months, series: [['AT&T', mk(6.8, -0.15)], ['Lumen', mk(6.6, 0.18)], ['Comcast', mk(5.6, -0.1)], ['Spectrum', mk(7.4, 0.22)]] };
}
export function carrierHeat(now) {
  const R = rng(12); const cs = ['AT&T', 'Lumen', 'Comcast', 'Spectrum', 'Verizon', 'Cox'];
  const bias = { 'AT&T': 1, Lumen: 1.4, Comcast: 0.8, Spectrum: 1.5, Verizon: 0.4, Cox: 0.7 };
  return { rows: cs, cols: Array.from({ length: 14 }, (_, i) => dateShort(now - (13 - i) * DAY).split(' ')[1]), values: cs.map(c => Array.from({ length: 14 }, (_, i) => Math.round(bias[c] * (2 + R() * 4 + (i > 9 && c === 'Spectrum' ? 5 : 0) + (i === 6 && c === 'Lumen' ? 6 : 0))))) };
}
export function carrierFaultForecast() {
  const pick = (city) => D.BRANCHES.find(b => b.city === city);
  return [
    { b: pick('Charlotte'), carrier: 'Lumen', p: 0.84, when: '48–72 h', why: 'Loss trend 0.1% → 0.9% over 5 days on shared LEC', act: 'Proactive case' },
    { b: pick('Houston'), carrier: 'AT&T', p: 0.71, when: '3–5 d', why: 'Latency baseline +14 ms; 6 tickets in 90 d', act: 'Carrier review' },
    { b: pick('Columbus'), carrier: 'Spectrum', p: 0.66, when: '2–4 d', why: 'Upstream SNR dropping in evening peaks', act: 'Proactive case' },
    { b: pick('Atlanta'), carrier: 'Comcast', p: 0.52, when: '5–7 d', why: 'Node maintenance notice + 2 flaps this week', act: 'Pre-steer during window' },
    { b: pick('Phoenix'), carrier: 'Cox', p: 0.41, when: '7 d', why: 'Heat-related CPE resets pattern', act: 'Watch' },
  ];
}

export function fieldDemand(now, storm) {
  const R = rng(66); const labels = [], actual = [], fc = [], lo = [], hi = [];
  for (let i = -7; i <= 7; i++) { labels.push(dateShort(now + i * DAY)); const dow = parts(now + i * DAY).dow; const base = dow === 'Sun' ? 4 : dow === 'Sat' ? 7 : 12;
    if (i <= 0) { actual.push(Math.round(base + R() * 4)); fc.push(i === 0 ? actual[actual.length - 1] : null); lo.push(i === 0 ? actual[actual.length - 1] : null); hi.push(i === 0 ? actual[actual.length - 1] : null); }
    else { const bump = (storm && i >= 1 && i <= 3 ? 7 : 0) + (i === 2 ? 3 : 0); const v = base + 2 + bump; actual.push(null); fc.push(v); lo.push(Math.max(0, v - 3 - i * 0.3)); hi.push(v + 3 + i * 0.5); } }
  return { labels, actual, fc, lo, hi, nowIndex: 7 };
}
export const SPARE_USE = { 'EC-XS': 0.35, '6100 48G': 0.3, '2530 24G': 0.12, 'AP-635': 0.9, 'AP-585': 0.22, 'AP-565': 0.2, 'LTE router': 0.25, 'UPS 1500VA': 0.18 };

export function changeTrend() { const R = rng(31); return ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'].map((m, i) => ({ label: m, Successful: 38 + Math.round(R() * 12) + i * 2, 'Rolled back': 1 + Math.round(R() * 2), Failed: R() < 0.4 ? 1 : 0 })); }
export function riskHistogram() { return [['0–20', 41], ['20–40', 33], ['40–60', 18], ['60–80', 7], ['80–100', 2]].map(([label, n]) => ({ label, Changes: n })); }
export function firmwareProjection(cur) {
  const labels = ['W-5', 'W-4', 'W-3', 'W-2', 'W-1', 'Now', '+1w', '+2w', '+3w', '+4w', '+5w', '+6w'];
  const past = [0.905, 0.913, 0.921, 0.93, 0.941, cur];
  const fc = [null, null, null, null, null, cur, Math.min(0.995, cur + 0.008), cur + 0.017, cur + 0.026, cur + 0.034, cur + 0.04, cur + 0.045].map(v => v == null ? null : Math.min(0.995, v));
  return { labels, actual: [...past, null, null, null, null, null, null], fc, lo: fc.map((v, i) => v == null ? null : i === 5 ? v : v - 0.004 * (i - 5)), hi: fc.map((v, i) => v == null ? null : i === 5 ? v : Math.min(0.999, v + 0.003 * (i - 5))) };
}

export function onboardingThroughput() {
  const labels = ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan'];
  const acq = [3, 9, 6, 4, 5, 7, 12, 10, 6], green = [2, 1, 3, 2, 2, 1, 2, 3, 2];
  return labels.map((l, i) => ({ label: l, Acquired: acq[i], Greenfield: green[i] }));
}
export function slipProb(p, now) {
  const fail = p.gates.filter(g => g.st === 'Fail').length; const rag = { Green: 0.08, Amber: 0.34, Red: 0.68 }[p.rag];
  const close = Math.max(0, 1 - (p.golive - now) / (30 * DAY));
  return Math.min(0.95, rag + p.blockers.length * 0.08 + fail * 0.15 + (p.stage === 'Planned' ? 0.05 : 0) * close);
}

export function modelAccuracy() { return { labels: ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'], precision: [0.66, 0.69, 0.72, 0.74, 0.76, 0.78], recall: [0.58, 0.61, 0.66, 0.69, 0.71, 0.74] }; }
export function preventiveCalendar(now) {
  const pick = c => D.BRANCHES.find(b => b.city === c);
  const items = [
    [0, '22:00', 'UPS battery swap', pick('Atlanta'), 'PRD-507', 'Field'], [0, '23:30', 'Proactive Lumen case + loopback test', pick('Charlotte'), 'PRD-501', 'Carrier'],
    [1, '21:00', 'Swap outdoor AP-585 (heat)', pick('Tampa'), 'PRD-503', 'Field'], [1, '23:00', 'Firmware remediation wave – Northeast 2530s', null, 'CHG', 'Change'],
    [2, '20:00', 'Closet cooling check + PSU order', pick('Phoenix'), 'PRD-504', 'Field'], [3, '22:00', 'WAN upgrade 200 → 500 Mb/s', pick('Dallas'), 'PRD-505', 'Carrier'],
    [4, '02:00', 'Config backup integrity audit (all sites)', null, 'RB-109', 'Automation'], [5, '21:00', 'Yard AP pole inspection – hail season', pick('Oklahoma City'), 'Storm prep', 'Field'],
    [6, '23:00', 'LTE pool plan uplift effective', null, 'PRD-506', 'Carrier'], [8, '22:00', 'Replace 2530s past end of warranty (14)', pick('Detroit'), 'Lifecycle', 'Change'],
  ];
  return items.map(([d, t, what, b, ref, kind], i) => ({ id: i, when: now + d * DAY, day: d, t, what, b, ref, kind }));
}
export function recurringClusters() {
  return [['Primary circuit loss, Southeast LECs', 46], ['Yard AP offline after heat / storms', 31], ['Nightly backup TACACS+ timeouts', 22], ['Scanner roaming in racking aisles', 18], ['LTE SIM suspended / plan issues', 11], ['Back-office loops (unmanaged switches)', 7]].map(([label, value]) => ({ label, value }));
}
export function kbDeflection() { return { labels: ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'], v: [0.18, 0.22, 0.25, 0.27, 0.31, 0.34] }; }
export function automationRuns(now) { const R = rng(17); return Array.from({ length: 14 }, (_, i) => ({ label: dateShort(now - (13 - i) * DAY).split(' ')[1], tip: dateShort(now - (13 - i) * DAY), 'Zero touch': 60 + Math.round(R() * 30) + i * 2, 'Human approved': 18 + Math.round(R() * 10) })); }
export function hoursSaved() { return { labels: ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'], v: [118, 164, 212, 251, 296, 338] }; }
export const AUTO_CANDIDATES = [
  { pattern: 'Return-to-primary after carrier fix', freq: 41, saved: 27, risk: 'Low', note: 'Same 4 steps every time; 30-min clean check already exists' },
  { pattern: 'DHCP scope expansion on scanner VLAN', freq: 9, saved: 6, risk: 'Medium', note: 'Needs IPAM check; propose L2 (act with approval)' },
  { pattern: 'LTE SIM re-activation request', freq: 14, saved: 9, risk: 'Low', note: 'Carrier API available for Verizon and AT&T' },
  { pattern: 'Loop-protect port shutdown in back office', freq: 7, saved: 4, risk: 'Medium', note: 'Off-hours only; template BPDU guard prevents most' },
];
export function slaProjection(m) {
  const t = m.trend; const last = t[t.length - 1]; const slope = (t[t.length - 1] - t[0]) / (t.length - 1);
  const labels = ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov (proj.)', 'Dec (proj.)'];
  const fc = [null, null, null, null, null, last, last + slope * 0.8, last + slope * 1.4].map(v => v == null ? null : Math.min(m.lower ? 1 : 1, Math.max(0, v)));
  const spread = Math.max(0.004, Math.abs(slope) * 0.6 + 0.004);
  return { labels, actual: [...t, null, null], fc, lo: fc.map((v, i) => v == null ? null : i === 5 ? v : v - spread * (i - 5)), hi: fc.map((v, i) => v == null ? null : i === 5 ? v : Math.min(1, v + spread * (i - 5))), nowIndex: 5 };
}
