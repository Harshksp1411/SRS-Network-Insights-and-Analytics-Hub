import MAP from './mapdata.json';
import { rng, T0, MIN, HR, DAY, sum, parts, hhmm } from './util.js';

const R = rng(20261019);

// ---------- reference facts (RFP + public record) ----------
export const FACTS = {
  branches: 900, ecDevices: 933, totalDevices: 4075, circuits: 1800,
  tickets6m: { total: 3773, afterHours: 1977, ntf: 875, carrier: 533, customer: 254, reboot: 134 },
  aps: { total: 1286, models: { 'AP-635': 1162, 'AP-565': 80, 'AP-585': 40, 'AP-634': 2, 'AP-567': 1, 'AP-575': 1 } },
  switches: { total: 1856, models: { '6100': 1058, '2530': 728, '6200M': 57, '6300': 13 }, stacks: 17 },
};

export const REGION_OF = {
  FL: 'Southeast', GA: 'Southeast', AL: 'Southeast', MS: 'Southeast', TN: 'Southeast',
  NC: 'Carolinas & Mid-Atlantic', SC: 'Carolinas & Mid-Atlantic', VA: 'Carolinas & Mid-Atlantic', MD: 'Carolinas & Mid-Atlantic', DE: 'Carolinas & Mid-Atlantic',
  NY: 'Northeast', NJ: 'Northeast', PA: 'Northeast', CT: 'Northeast', MA: 'Northeast', NH: 'Northeast', ME: 'Northeast',
  MI: 'Great Lakes', OH: 'Great Lakes', IN: 'Great Lakes', KY: 'Great Lakes', WV: 'Great Lakes', IL: 'Great Lakes', WI: 'Great Lakes',
  MN: 'Central Plains', IA: 'Central Plains', NE: 'Central Plains', SD: 'Central Plains', ND: 'Central Plains', MO: 'Central Plains',
  TX: 'Texas & South Central', OK: 'Texas & South Central', AR: 'Texas & South Central', LA: 'Texas & South Central', NM: 'Texas & South Central',
  CO: 'Mountain West', AZ: 'Mountain West', UT: 'Mountain West', ID: 'Mountain West', NV: 'Mountain West',
  WA: 'Pacific', OR: 'Pacific', CA: 'Pacific', HI: 'Pacific',
  ON: 'Canada', AB: 'Canada', BC: 'Canada', MB: 'Canada', NS: 'Canada',
};
export const REGIONS = ['Southeast', 'Carolinas & Mid-Atlantic', 'Northeast', 'Great Lakes', 'Central Plains', 'Texas & South Central', 'Mountain West', 'Pacific', 'Canada'];
const TZ_STATE = {
  FL: 'America/New_York', GA: 'America/New_York', NC: 'America/New_York', SC: 'America/New_York', VA: 'America/New_York', MD: 'America/New_York', DE: 'America/New_York', NY: 'America/New_York', NJ: 'America/New_York', PA: 'America/New_York', CT: 'America/New_York', MA: 'America/New_York', NH: 'America/New_York', ME: 'America/New_York', MI: 'America/New_York', OH: 'America/New_York', IN: 'America/New_York', KY: 'America/New_York', WV: 'America/New_York',
  AL: 'America/Chicago', MS: 'America/Chicago', TN: 'America/Chicago', IL: 'America/Chicago', WI: 'America/Chicago', MN: 'America/Chicago', IA: 'America/Chicago', NE: 'America/Chicago', SD: 'America/Chicago', ND: 'America/Chicago', MO: 'America/Chicago', TX: 'America/Chicago', OK: 'America/Chicago', AR: 'America/Chicago', LA: 'America/Chicago',
  CO: 'America/Denver', NM: 'America/Denver', UT: 'America/Denver', ID: 'America/Denver', AZ: 'America/Phoenix',
  WA: 'America/Los_Angeles', OR: 'America/Los_Angeles', CA: 'America/Los_Angeles', NV: 'America/Los_Angeles', HI: 'Pacific/Honolulu',
  ON: 'America/Toronto', AB: 'America/Edmonton', BC: 'America/Vancouver', MB: 'America/Winnipeg', NS: 'America/Halifax',
};
const TZ_CITY = { Knoxville: 'America/New_York', Chattanooga: 'America/New_York', 'El Paso': 'America/Denver', Pensacola: 'America/Chicago', Evansville: 'America/Chicago', Gary: 'America/Chicago' };

export const SEGMENT_OF = b => b.startsWith('Heritage Pool') ? 'Pool' : b.startsWith('Heritage Landscape') ? 'Landscape' : (b.startsWith('Lohmiller') || b.startsWith("Mingledorff")) ? 'HVAC' : b === 'Specialty Wood Products' ? 'Building products' : 'Roofing & exteriors';

// ---------- branches ----------
const allCities = [...MAP.cities, ...MAP.hawaii];
const rawTotal = sum(allCities, c => c[4]);
let alloc = allCities.map(c => Math.max(1, Math.round(c[4] * 900 / rawTotal)));
let diff = 900 - sum(alloc);
for (let i = 0; diff !== 0; i = (i + 7) % alloc.length) { if (diff > 0) { alloc[i]++; diff--; } else if (alloc[i] > 2) { alloc[i]--; diff++; } }

export const BRANCHES = [];
let bn = 1;
allCities.forEach((c, ci) => {
  const [city, st, x, y, , brands] = c;
  const n = alloc[ci];
  const perBrand = {};
  for (let k = 0; k < n; k++) {
    const brand = brands[k % brands.length];
    perBrand[brand] = (perBrand[brand] || 0) + 1;
    const seg = SEGMENT_OF(brand);
    const sizeRoll = R();
    const size = sizeRoll < 0.13 ? 'L' : sizeRoll < 0.55 ? 'M' : 'S';
    const ang = R() * Math.PI * 2, rad = n > 1 ? 2 + R() * Math.min(9, n * 0.9) : 0;
    const sat = seg === 'Roofing & exteriors' ? R() < 0.45 : seg === 'Pool' ? R() < 0.7 : R() < 0.3;
    BRANCHES.push({
      id: `BR-${String(bn).padStart(4, '0')}`, num: bn, code: `${st.toLowerCase()}${String(bn).padStart(4, '0')}`,
      brand, segment: seg, city, state: st, region: REGION_OF[st], tz: TZ_CITY[city] || TZ_STATE[st],
      // one estate-wide number, 1 to 900 (BR-0214 is Branch 214), with the location: "Branch 214 – Virginia Beach, VA".
      // `local` keeps the old city-wise label for lookups.
      name: `Branch ${bn} – ${city}, ${st}`, local: `${city}${n > 1 ? ` #${k + 1}` : ''}`,
      x: +(x + Math.cos(ang) * rad).toFixed(1), y: +(y + Math.sin(ang) * rad).toFixed(1), cx: x, cy: y,
      size, hours: { open: seg === 'Pool' ? '07:00' : '06:30', close: seg === 'Landscape' ? '16:30' : '17:00', sat: sat ? (seg === 'Pool' ? '08:00-12:00' : '07:00-12:00') : null },
      yard: seg !== 'Pool' || R() < 0.4, fleet: size === 'L' ? R.int(8, 16) : size === 'M' ? R.int(4, 9) : R.int(2, 5),
      health: 'up', score: 0,
    });
    bn++;
  }
});
export const BR = Object.fromEntries(BRANCHES.map(b => [b.id, b]));
export const BRANDS = [...new Set(BRANCHES.map(b => b.brand))].sort();
export const branchLabel = b => b ? `${b.name}, ${b.brand}` : '';
export const findBranch = (city, brand) => BRANCHES.find(b => b.city === city && (!brand || b.brand === brand));

// ---------- devices (exact counts from the RFP inventory) ----------
const byBig = BRANCHES.slice().sort((a, b) => ({ L: 0, M: 1, S: 2 }[a.size] - { L: 0, M: 1, S: 2 }[b.size]) || a.num - b.num);
const haSet = new Set(byBig.filter(b => b.size === 'L').slice(0, 33).map(b => b.id));
const stackSet = byBig.filter(b => b.size === 'L').slice(33, 50).map(b => b.id);
// switches: 17 stacks consume 64 switches; remaining 1792 standalone/switch
const swCount = {}; BRANCHES.forEach(b => swCount[b.id] = b.size === 'L' ? 3 : b.size === 'M' ? 2 : 1);
stackSet.forEach(id => swCount[id] = 0);
let swNeed = 1856 - 64 - sum(Object.values(swCount));
for (let i = 0; swNeed !== 0; i++) { const b = byBig[i % byBig.length]; if (stackSet.includes(b.id)) continue; if (swNeed > 0) { swCount[b.id]++; swNeed--; } else if (swCount[b.id] > 1) { swCount[b.id]--; swNeed++; } }
const apIn = {}, apOut = {};
BRANCHES.forEach(b => { apIn[b.id] = b.size === 'L' ? 3 : b.size === 'M' ? 1 : 1; apOut[b.id] = 0; });
let inNeed = 1164 - sum(Object.values(apIn));
for (let i = 0; inNeed !== 0; i++) { const b = BRANCHES[(i * 37) % 900]; if (inNeed > 0) { apIn[b.id]++; inNeed--; } else if (apIn[b.id] > 1) { apIn[b.id]--; inNeed++; } }
const yardBranches = byBig.filter(b => b.yard);
for (let k = 0; k < 122; k++) apOut[yardBranches[k % yardBranches.length].id]++;

const SW_FW = { '2530': ['YA.16.11.0021', 'YA.16.11.0018', 'YA.16.10.0024', 'YA.16.09.0012'], cx: ['10.16.1030', '10.16.1020', '10.13.1160', '10.10.1170'] };
const AP_FW = ['10.7.1.0', '10.6.0.3', '10.5.1.4', '10.4.1.2'];
const EC_FW = ['9.5.4.1', '9.4.4.2', '9.4.3.4', '9.3.8.0'];
export const FW_TARGET = { 'EC-XS': EC_FW, '2530': SW_FW['2530'], '6100': SW_FW.cx, '6200M': SW_FW.cx, '6300': SW_FW.cx, AP: AP_FW };
const FW_W = [[0, 66], [1, 22], [2, 9.5], [3, 2.5]];
// Managed estate: almost every switch and AP already runs a fixed release; only a small tail is still exposed
const FW_W_CX = [[0, 97.4], [1, 1.4], [2, 0.9], [3, 0.3]];
const FW_W_AP = [[0, 70], [1, 28], [2, 1.5], [3, 0.5]];
const FW_W_EC = [[0, 78], [1, 19], [2, 2.3], [3, 0.7]];
const fwPick = (list, w = FW_W) => list[R.weighted(w)];
const serial = () => 'CN' + Array.from({ length: 8 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789'[R.int(0, 33)]).join('');
const mac = () => '00:1b:bc:' + [0, 0, 0].map(() => R.int(0, 255).toString(16).padStart(2, '0')).join(':');
function warranty() { const months = R.int(-5, 44); return T0 + months * 30 * DAY; }
function backup() { const x = R(); return x < 0.021 ? { st: 'Failed', at: T0 - R.int(20, 30) * HR, why: R.pick(['SSH auth timeout (TACACS+)', 'Device unreachable at 02:00', 'Config changed during capture']) } : x < 0.035 ? { st: 'Stale', at: T0 - R.int(50, 120) * HR } : { st: 'OK', at: T0 - R.int(6, 11) * HR - R.int(0, 59) * MIN }; }

export const DEVICES = [];
const swPool = R.shuffle([...Array(728).fill('2530'), ...Array(1058).fill('6100'), ...Array(2).fill('6300'), ...Array(2).fill('6200M'), '6300', '6200M']); // 1792 non-stack
// stacks: 5 x 6300 (conductor+standby+?), 12 x 6200M
const stackDefs = [...Array(5).fill('6300'), ...Array(12).fill('6200M')];
let swi = 0;
BRANCHES.forEach(b => {
  const ecs = haSet.has(b.id) ? 2 : 1;
  b.dev = { ec: ecs, sw: 0, ap: 0, apOut: apOut[b.id] };
  for (let k = 1; k <= ecs; k++) DEVICES.push({ id: `${b.code}-ec0${k}`, type: 'SD-WAN', model: 'EC-XS', role: ecs === 2 ? (k === 1 ? 'HA primary' : 'HA secondary') : 'Edge', branchId: b.id, fw: fwPick(EC_FW, FW_W_EC), serial: mac(), backup: backup(), warranty: warranty(), mode: 'Orchestrator' });
  const si = stackSet.indexOf(b.id);
  if (si >= 0) {
    const m = stackDefs[si]; const members = m === '6200M' ? (si % 2 ? 3 : 2) : 0;
    const roles = ['Stack (Conductor)', 'Stack (Standby)', ...Array(members).fill('Stack (Member)')];
    roles.forEach((role, k) => DEVICES.push({ id: `${b.code}-sw0${k + 1}`, type: 'Switch', model: m, role, branchId: b.id, fw: fwPick(SW_FW.cx, FW_W_CX), serial: serial(), backup: backup(), warranty: warranty(), mode: 'Central' }));
    b.dev.sw = roles.length;
  }
  for (let k = 0; k < swCount[b.id]; k++) {
    const m = swPool[swi++ % swPool.length];
    DEVICES.push({ id: `${b.code}-sw${String(b.dev.sw + 1).padStart(2, '0')}`, type: 'Switch', model: m, role: R() < 0.7 ? 'Standalone' : 'Switch', branchId: b.id, fw: (m === '2530' ? fwPick(SW_FW['2530']) : fwPick(SW_FW.cx, FW_W_CX)), serial: serial(), backup: backup(), warranty: warranty(), mode: 'Central' });
    b.dev.sw++;
  }
});
// fix stack member total to exactly 30 by trimming/adding on 6200M stacks
{
  const mem = DEVICES.filter(d => d.role === 'Stack (Member)');
  let extra = mem.length - 30;
  while (extra > 0) { const d = mem.pop(); DEVICES.splice(DEVICES.indexOf(d), 1); BR[d.branchId].dev.sw--; extra--; }
  while (extra < 0) { const host = DEVICES.find(d => d.role === 'Stack (Conductor)' && d.model === '6200M'); const b = BR[host.branchId]; DEVICES.push({ ...host, id: `${b.code}-sw0${b.dev.sw + 1}`, role: 'Stack (Member)', serial: serial() }); b.dev.sw++; extra++; }
  // balance overall switch total to 1856
  let tot = DEVICES.filter(d => d.type === 'Switch').length;
  let i = 0; while (tot > 1856) { const d = DEVICES.find((x, j) => j > i && x.type === 'Switch' && x.role !== 'Stack (Member)' && !x.role.startsWith('Stack') && BR[x.branchId].dev.sw > 1); i = DEVICES.indexOf(d); DEVICES.splice(i, 1); BR[d.branchId].dev.sw--; tot--; }
  while (tot < 1856) { const b = BRANCHES[(tot * 13) % 900]; DEVICES.push({ id: `${b.code}-sw${String(b.dev.sw + 1).padStart(2, '0')}`, type: 'Switch', model: '6100', role: 'Standalone', branchId: b.id, fw: fwPick(SW_FW.cx, FW_W_CX), serial: serial(), backup: backup(), warranty: warranty(), mode: 'Central' }); b.dev.sw++; tot++; }
}
const apInPool = R.shuffle([...Array(1162).fill('AP-635'), 'AP-634', 'AP-634']);
const apOutPool = R.shuffle([...Array(80).fill('AP-565'), ...Array(40).fill('AP-585'), 'AP-567', 'AP-575']);
let ai = 0, ao = 0;
BRANCHES.forEach(b => {
  let k = 0;
  const zonesIn = ['Back office', 'Counter', 'Warehouse', 'Warehouse', 'Warehouse', 'Loading docks'];
  for (let i = 0; i < apIn[b.id]; i++) { const m = apInPool[ai++]; DEVICES.push({ id: `${b.code}-ap${String(++k).padStart(2, '0')}`, type: 'AP', model: m, role: zonesIn[i % zonesIn.length], branchId: b.id, fw: fwPick(AP_FW, FW_W_AP), serial: serial(), backup: { st: 'N/A', at: null }, warranty: warranty(), mode: R() < 0.37 ? 'Access Point' : 'Standalone' }); }
  for (let i = 0; i < apOut[b.id]; i++) { const m = apOutPool[ao++]; DEVICES.push({ id: `${b.code}-ap${String(++k).padStart(2, '0')}`, type: 'AP', model: m, role: 'Outdoor yard', branchId: b.id, fw: fwPick(AP_FW, FW_W_AP), serial: serial(), backup: { st: 'N/A', at: null }, warranty: warranty(), mode: R() < 0.37 ? 'Access Point' : 'Standalone' }); }
  b.dev.ap = k;
});
export const DEV = Object.fromEntries(DEVICES.map(d => [d.id, d]));
export const devicesOf = id => DEVICES.filter(d => d.branchId === id);

// ---------- circuits (2 per branch = 1,800) ----------
export const CARRIERS = ['AT&T', 'Lumen', 'Comcast', 'Spectrum', 'Verizon', 'Cox', 'Bell', 'Rogers', 'Telus'];
const CABLE = { FL: 'Comcast', GA: 'Comcast', IL: 'Comcast', IN: 'Comcast', MI: 'Comcast', PA: 'Comcast', NJ: 'Comcast', MA: 'Comcast', CT: 'Comcast', NH: 'Comcast', CO: 'Comcast', WA: 'Comcast', OR: 'Comcast', TN: 'Comcast', MD: 'Comcast', DE: 'Comcast', VA: 'Comcast', MN: 'Comcast', UT: 'Comcast', AL: 'Comcast', MS: 'Comcast', NM: 'Comcast',
  TX: 'Spectrum', NC: 'Spectrum', SC: 'Spectrum', OH: 'Spectrum', KY: 'Spectrum', NY: 'Spectrum', WI: 'Spectrum', MO: 'Spectrum', ME: 'Spectrum', HI: 'Spectrum', CA: 'Spectrum', NE: 'Spectrum', SD: 'Spectrum', ND: 'Spectrum', IA: 'Spectrum', WV: 'Spectrum', ID: 'Spectrum',
  AZ: 'Cox', NV: 'Cox', OK: 'Cox', LA: 'Cox', AR: 'Cox', ON: 'Rogers', AB: 'Telus', BC: 'Telus', MB: 'Bell', NS: 'Bell' };
const digits = n => Array.from({ length: n }, () => R.int(0, 9)).join('');
function cid(carrier, type) {
  switch (carrier) {
    case 'AT&T': return type === 'LTE/5G' ? `ATT-WLS ${digits(10)}` : `BBEC.${digits(6)}..ATI`;
    case 'Lumen': return `${type === 'MPLS' ? 'IPVPN' : 'DIA'}-${digits(9)}`;
    case 'Comcast': return `CBR-${digits(8)}`;
    case 'Spectrum': return `${digits(2)}.L1XX.${digits(6)}..TWCC`;
    case 'Verizon': return type === 'LTE/5G' ? `VZW ICCID …${digits(6)}` : `VZB-${digits(7)}`;
    case 'Cox': return `COXB-${digits(7)}`;
    default: return `${carrier.toUpperCase().slice(0, 4)}-${digits(8)}`;
  }
}
export const CIRCUITS = [];
BRANCHES.forEach(b => {
  const can = b.region === 'Canada';
  const cable = CABLE[b.state] || 'Spectrum';
  const pType = R.weighted([['MPLS', 22], ['DIA', 30], ['Broadband', 48]]);
  const pCarrier = pType === 'MPLS' ? (can ? 'Bell' : R.pick(['AT&T', 'Lumen', 'Lumen'])) : pType === 'DIA' ? (can ? 'Bell' : R.weighted([['Lumen', 45], ['AT&T', 35], ['Verizon', 20]])) : cable;
  const sType = R.weighted([['LTE/5G', 55], ['Broadband', 45]]);
  let sCarrier = sType === 'LTE/5G' ? (can ? 'Rogers' : R.weighted([['Verizon', 60], ['AT&T', 40]])) : (pCarrier === cable ? (can ? 'Bell' : 'AT&T') : cable);
  const bw = pType === 'MPLS' ? R.pick([20, 50, 100]) : pType === 'DIA' ? R.pick([100, 200, 500]) : R.pick([300, 500, 1000]);
  const mk = (role, type, carrier, bw) => ({ id: `${b.code}-${role === 'Primary' ? 'wan1' : 'wan2'}`, branchId: b.id, role, type, carrier, cid: cid(carrier, type), bw, lat: R.int(14, 42), jit: +(R() * 4 + 0.5).toFixed(1), loss: +(R() * 0.15).toFixed(2), util: R.int(8, 62), status: 'Up', tickets90: R.weighted([[0, 70], [1, 18], [2, 7], [3, 3], [5, 1.5], [7, 0.5]]), ntf90: 0, lec: type === 'Broadband' || type === 'LTE/5G' ? null : R.pick(['AT&T', 'Frontier', 'Windstream', 'Lumen', 'Brightspeed']) });
  const p = mk('Primary', pType, pCarrier, bw), s = mk('Secondary', sType, sCarrier, sType === 'LTE/5G' ? 150 : R.pick([200, 300, 500]));
  p.ntf90 = Math.min(p.tickets90, R.weighted([[0, 60], [1, 30], [2, 10]])); s.ntf90 = Math.min(s.tickets90, R.int(0, 1));
  CIRCUITS.push(p, s);
  b.wan = [p.id, s.id];
});
// Realistic line quality. Round-trip time to the primary data centre (McKinney, TX) grows with distance
// (about 1.6 ms per 100 km of fibre route, plus 4 ms of equipment), and each line type adds its own delay:
// MPLS and DIA are steady, broadband a little noisier, LTE/5G adds 25-40 ms and more jitter.
{
  const dc = BRANCHES.find(b => b.city === 'McKinney') || BRANCHES[0];
  const OVER = { MPLS: [1, 0.4, 1.0, 0, 0.02], DIA: [2, 0.6, 1.4, 0, 0.04], Broadband: [6, 1.2, 3.0, 0.02, 0.12], 'LTE/5G': [30, 5, 9, 0.1, 0.35] };
  CIRCUITS.forEach(c => {
    const b = BRANCHES.find(x => x.id === c.branchId);
    const km = b.state === 'HI' ? 5300 : Math.hypot(b.cx - dc.cx, b.cy - dc.cy) * 6.7;
    const rtt = 4 + km / 100 * 1.6;
    const u = (c.lat - 14) / 28, v = Math.min(1, Math.max(0, (c.jit - 0.5) / 4)), w = Math.min(1, c.loss / 0.15);
    const [lo, j0, j1, l0, l1] = OVER[c.type] || OVER.Broadband;
    c.rtt = Math.round(rtt);
    c.lat = Math.round(rtt + lo + u * (c.type === 'LTE/5G' ? 10 : 3));
    c.jit = +(j0 + v * (j1 - j0)).toFixed(1);
    c.loss = +(l0 + w * (l1 - l0)).toFixed(2);
  });
}
export const CIR = Object.fromEntries(CIRCUITS.map(c => [c.id, c]));
const prim = CIRCUITS.filter(c => c.role === 'Primary');
export const AVG_LAT = Math.round(prim.reduce((t, c) => t + c.lat, 0) / prim.length);
export const AVG_JIT = +(prim.reduce((t, c) => t + c.jit, 0) / prim.length).toFixed(1);
export const AVG_LOSS = +(prim.reduce((t, c) => t + c.loss, 0) / prim.length).toFixed(2);
// a few known repeat offenders
['Houston', 'Tampa', 'Atlanta', 'Phoenix', 'Chicago', 'Columbus', 'San Antonio', 'Charlotte', 'Denver', 'Miami', 'Oklahoma City', 'Philadelphia'].forEach((city, i) => {
  const b = BRANCHES.filter(x => x.city === city)[i % 3] || BRANCHES.find(x => x.city === city);
  const c = CIR[b.wan[0]]; c.tickets90 = 4 + (i % 5); c.ntf90 = 1 + (i % 3);
});

// ---------- apps (what the branch needs) ----------
export const APPS = [
  { id: 'erp', name: 'ERP (order, inventory, invoicing)', short: 'ERP', host: 'Primary DC', crit: 'High' },
  { id: 'pos', name: 'POS & card payments', short: 'POS/Payments', host: 'Payment processor (PCI)', crit: 'High' },
  { id: 'pricing', name: 'Pricing & quoting', short: 'Pricing', host: 'Primary DC', crit: 'High' },
  { id: 'azure', name: 'Cloud applications in the SRS Azure tenant', short: 'Azure apps', host: 'Azure (SRS tenant)', crit: 'High' },
  { id: 'voice', name: 'Voice / contact', short: 'Voice', host: 'Cloud voice', crit: 'Medium' },
  { id: 'm365', name: 'Microsoft 365 / email', short: 'M365', host: 'Microsoft cloud', crit: 'Medium' },
];

// ---------- agents (Mova iO) ----------
export const AGENTS = {
  correlation: { name: 'Correlation Agent', also: 'Incident Enricher, Graph Builder', color: '#762123' },
  diagnosis: { name: 'Diagnosis Agent', also: 'Diagnostic Agent, Impact Analyst', color: '#33557a' },
  runbook: { name: 'Runbook Agent', also: 'Solution Recommender', color: '#0891b2' },
  carrier: { name: 'Carrier Agent', also: 'Evidence Collector', color: '#c4622d' },
  dispatch: { name: 'Dispatch Agent', also: 'Field matching', color: '#4d7c0f' },
  comms: { name: 'Comms Agent', also: 'StoreOps & leadership updates', color: '#923f45' },
  knowledge: { name: 'Knowledge Agent', also: 'Similar-Case Indexer', color: '#0f766e' },
  change: { name: 'Change Validation Agent', also: 'Change Impact Analyzer, Release Readiness', color: '#762123' },
  prediction: { name: 'Prediction Agent', also: 'Anomaly Detector, Capacity Analyst', color: '#b26a00' },
  triage: { name: 'Smart Triage Agent', also: 'Intent Understanding Agent', color: '#33557a' },
  ticket: { name: 'Ticket Update Agent', also: 'ServiceNow Integration', color: '#6b6b6b' },
  verify: { name: 'Verification Agent', also: 'Test Generator', color: '#2e7d32' },
  toil: { name: 'Toil Miner', also: 'Catalog Steward, Eval Runner', color: '#0f766e' },
};

// ---------- runbooks ----------
export const AUTONOMY = { L1: 'Recommend only', L2: 'Act with approval', L3: 'Act and notify', L4: 'Autonomous (off-hours only)' };
export const RUNBOOKS = [
  { id: 'RB-101', name: 'LTE / broadband failover', kind: 'change', autonomy: 'L3', runs30: 214, success: 0.986, avg: '38 s', desc: 'Steer business-intent policies (POS, ERP, voice) to the healthy secondary path on the EdgeConnect when primary loss > 2% or jitter > 30 ms for 3 minutes.', steps: ['Confirm secondary path health (loss < 0.5%, latency < 80 ms)', 'Apply BIO override: POS/ERP/voice → wan2', 'Keep bulk/guest on primary if usable', 'Start 30-min stability watch'], rollback: 'Remove BIO override; traffic returns to primary path.', verify: ['POS synthetic transaction < 1.5 s', 'ERP login probe OK', 'Tunnel to DC up on wan2'] },
  { id: 'RB-102', name: 'Return to primary', kind: 'change', autonomy: 'L2', runs30: 171, success: 0.977, avg: '41 s', desc: 'Move traffic back to primary after 30 minutes of clean metrics and carrier case resolved.', steps: ['Check 30-min primary stats', 'Confirm carrier case status = Resolved', 'Remove BIO override', 'Verify'], rollback: 'Re-apply failover override.', verify: ['Loss < 0.5% for 10 min', 'POS synthetic OK'] },
  { id: 'RB-103', name: 'Switch port bounce', kind: 'change', autonomy: 'L3', runs30: 96, success: 0.906, avg: '22 s', desc: 'Shut / no-shut an access port feeding a PoE device (AP, phone or camera).', steps: ['Read port counters and PoE draw', 'Shut port, wait 10 s', 'No-shut, wait for LLDP neighbor', 'Confirm device online in Central'], rollback: 'Port returned to previous admin state.', verify: ['LLDP neighbor seen', 'Device online in Aruba Central'] },
  { id: 'RB-104', name: 'AP reboot', kind: 'change', autonomy: 'L3', runs30: 133, success: 0.917, avg: '3 m 10 s', desc: 'Reboot an AP from Aruba Central; outside branch hours unless the AP is already down.', steps: ['Check client count (skip if > 0 during hours)', 'Reboot via Central API', 'Wait for check-in', 'Check radio status'], rollback: 'None needed (stateless).', verify: ['AP up in Central', 'Clients re-associate'] },
  { id: 'RB-105', name: 'Config rollback', kind: 'change', autonomy: 'L2', runs30: 9, success: 1, avg: '1 m 40 s', desc: 'Restore last known-good config from the Network-as-Code repo / nightly backup.', steps: ['Diff running vs last good', 'Push last good via Central / Orchestrator', 'Re-run post-checks'], rollback: 'Re-apply the rolled-back config (stored).', verify: ['Diff = 0 vs golden', 'Post-checks pass'] },
  { id: 'RB-106', name: 'Carrier case raise', kind: 'readonly', autonomy: 'L3', runs30: 88, success: 0.989, avg: '55 s', desc: 'Build an evidence pack (loss/jitter graphs, traceroutes, demarc tests, timestamps) and open a case on the carrier portal / API.', steps: ['Collect 60-min path stats from Orchestrator', 'Run traceroute + MTR from EC', 'Attach LEC demarc test where available', 'Open carrier ticket, record ticket number in ServiceNow'], rollback: 'Case can be cancelled with carrier.', verify: ['Carrier ticket number stored', 'Case linked to INC'] },
  { id: 'RB-107', name: 'StoreOps notify', kind: 'readonly', autonomy: 'L3', runs30: 241, success: 1, avg: '4 s', desc: 'Tell StoreOps and the branch manager what is affected, what still works, and the next update time.', steps: ['Build plain-language impact summary', 'Send to StoreOps channel + branch manager', 'Schedule next update'], rollback: 'n/a', verify: ['Message read receipt'] },
  { id: 'RB-108', name: 'EdgeConnect remote recovery', kind: 'change', autonomy: 'L2', runs30: 14, success: 0.571, avg: '6 m', desc: 'Soft reboot via Orchestrator, then an out-of-band console reload from the backup partition.', steps: ['Orchestrator soft reboot', 'Wait 6 min for tunnels', 'If no check-in: OOB console', 'Reload from the backup partition'], rollback: 'n/a', verify: ['EC reachable in Orchestrator', 'Tunnels up'] },
  { id: 'RB-109', name: 'Config backup re-run', kind: 'readonly', autonomy: 'L4', runs30: 61, success: 0.951, avg: '35 s', desc: 'Retry failed nightly backups with integrity check.', steps: ['Retry SSH/API pull', 'Hash compare', 'Store in repo'], rollback: 'n/a', verify: ['Backup hash stored'] },
  { id: 'RB-110', name: 'POS / payment path test', kind: 'readonly', autonomy: 'L3', runs30: 2702, success: 0.996, avg: '12 s', desc: 'Synthetic payment-path test from the PCI segment to the processor; no card data.', steps: ['Run TLS handshake + test auth to processor endpoint', 'Measure RTT'], rollback: 'n/a', verify: ['RTT < 400 ms', 'TLS OK'] },
];
export const RB = Object.fromEntries(RUNBOOKS.map(r => [r.id, r]));

// ---------- incident templates ----------
const P_SLA = { P1: [15, 240], P2: [15, 480], P3: [30, 1440], P4: [30, 5760] };
export const slaOf = p => ({ resp: P_SLA[p][0] * MIN, res: P_SLA[p][1] * MIN });
const TEMPLATES = {
  circuit: b => { const c = CIR[b.wan[0]]; return { pri: 'P3', cat: 'Carrier / LEC', title: `Primary circuit down – ${c.carrier} ${c.type}, branch on ${CIR[b.wan[1]].type}`, ci: c.id,
    signals: [[0, 'Orchestrator', `${c.id} (${c.carrier}) loss 100%, tunnel down`, 'Critical'], [20, 'OpsRamp', 'EdgeConnect wan1 interface down', 'Critical'], [32, 'Orchestrator', `Traffic moved to ${b.wan[1]}`, 'Info'], [70, 'Synthetic', 'POS path test OK via wan2', 'Info']],
    corr: 17, rca: [['Carrier/LEC fault upstream of demarc', 0.86, 'Loss 100% both directions; EC port up/up; neighbouring branches on same LEC CO also alarmed'], ['NTE fault at the branch', 0.08, 'NTE answers its loopback from the branch side'], ['EC port / cable', 0.04, 'Port up/up, no CRC']],
    runbook: 'RB-106', impact: ['Running on backup; no business impact'], verify: ['Primary loss < 0.5% for 30 min', 'Return to primary approved'] }; },
  jitter: b => { const c = CIR[b.wan[0]]; return { pri: 'P3', cat: 'Carrier / LEC', title: `${c.type} jitter 38 ms / loss 2.4% – ${c.carrier}`, ci: c.id,
    signals: [[0, 'Orchestrator', `${c.id} jitter 38 ms (threshold 30)`, 'Major'], [60, 'New Relic', 'ERP path latency from branch 160 ms', 'Minor'], [90, 'Synthetic', 'POS path RTT 610 ms', 'Major']],
    corr: 24, rca: [['Carrier congestion on access link', 0.83, 'Loss/jitter rises with carrier-side queueing; local util only 31%'], ['Local saturation', 0.09, 'Util 31%'], ['EC CPU', 0.03, 'CPU 12%']], runbook: 'RB-101', impact: ['POS slower at counter', 'ERP slower'], verify: ['Payment path < 400 ms', 'Jitter < 10 ms on active path'] }; },
  apdown: b => { const ap = DEVICES.find(d => d.branchId === b.id && d.type === 'AP' && d.role === 'Outdoor yard') || DEVICES.find(d => d.branchId === b.id && d.type === 'AP'); return { pri: 'P4', cat: 'Wireless', title: `${ap.role === 'Outdoor yard' ? 'Yard' : 'Warehouse'} AP offline – ${ap.model}`, ci: ap.id,
    signals: [[0, 'Aruba Central', `${ap.id} down`, 'Major'], [15, 'Aruba Central', `PoE port ${b.code}-sw01 1/1/${R.int(10, 44)} drawing 0 W`, 'Minor']],
    corr: 3, rca: [['PoE / cable to outdoor AP', 0.64, 'PoE 0 W; port up/down flaps last night'], ['AP hardware', 0.22, '3 reboots in 7 days'], ['Switch PoE budget', 0.1, 'Budget 62% used']], runbook: 'RB-103', impact: ['Yard Wi-Fi coverage reduced'], verify: ['AP up in Central', 'Clients re-associated'] }; },
  crc: b => ({ pri: 'P4', cat: 'Switching', title: 'CRC errors rising on uplink 1/1/49', ci: `${b.code}-sw01`,
    signals: [[0, 'OpsRamp', 'Input CRC errors 1,240/5 min on 1/1/49', 'Minor'], [300, 'OpsRamp', 'Errors persisting', 'Minor']],
    corr: 2, rca: [['SFP or patch cable', 0.72, 'Errors one direction only; light levels -9.8 dBm'], ['Port hardware', 0.15, 'No other ports affected']], runbook: 'RB-103', impact: ['None yet'], verify: ['CRC rate 0 for 15 min'] }),
  lte: b => { const c = CIR[b.wan[1]]; return { pri: 'P3', cat: 'Carrier / LEC', title: `Backup ${c.type} not passing traffic – ${c.carrier} SIM inactive`, ci: c.id,
    signals: [[0, 'Synthetic', 'Weekly failover test failed on wan2', 'Major'], [20, 'Orchestrator', 'wan2 no IP / PDP context rejected', 'Major']],
    corr: 1, rca: [['SIM deactivated on carrier account', 0.88, 'PDP reject cause 33; data plan suspended'], ['Modem firmware', 0.07, 'Same firmware passes elsewhere']], runbook: 'RB-106', impact: ['No backup path if primary fails'], verify: ['wan2 passes failover test'] }; },
  scanner: b => ({ pri: 'P3', cat: 'Wireless', title: 'Wi-Fi roaming failures in warehouse aisles', ci: `${b.code}-ap02`,
    signals: [[0, 'Aruba Central', '41 deauth events on SRS-SCAN in 10 min', 'Minor'], [120, 'ServiceNow', 'Branch call: Wi-Fi sessions dropping at receiving', 'Minor'], [240, 'Aruba Central', 'Co-channel interference ch 36 on ap02/ap03', 'Minor']],
    corr: 6, rca: [['RF coverage gap / co-channel on 5 GHz', 0.58, 'Deauths cluster near racking; CCI on ch 36'], ['Client roaming thresholds', 0.27, 'Older client model roams late'], ['DHCP lease exhaustion', 0.08, 'Scope 61% used']], runbook: 'RB-104', impact: ['Receiving slower; picking OK'], verify: ['Deauths < 5 per 10 min', 'No branch complaints for 2 h'] }),
  pos: b => { const c = CIR[b.wan[0]]; return { pri: 'P2', cat: 'Branch connectivity', title: 'POS terminals slow at counter – payment path latency', ci: c.id,
    signals: [[0, 'Synthetic', 'Payment path round trip 1.9 s (threshold 0.4 s)', 'Critical'], [30, 'Orchestrator', `${c.id} loss 3.1%`, 'Major'], [60, 'ServiceNow', 'Branch call: card payments timing out', 'Major']],
    corr: 19, rca: [['Primary path loss (carrier)', 0.81, 'Loss 3.1% on wan1, wan2 clean'], ['Processor-side slowness', 0.11, 'Other branches OK']], runbook: 'RB-101', impact: ['Card payments timing out at counter'], verify: ['Payment path < 400 ms', 'No payment timeouts for 15 min'] }; },
  dhcp: b => ({ pri: 'P3', cat: 'Customer-caused', title: 'DHCP scope exhausted on VLAN 30 (warehouse Wi-Fi)', ci: `${b.code}-sw01`,
    signals: [[0, 'OpsRamp', 'DHCP scope 10.x.30.0/25 100% used', 'Major'], [40, 'Aruba Central', 'Clients failing to get IP on SRS-SCAN', 'Major']],
    corr: 4, rca: [['New handhelds added without IPAM update', 0.79, '24 new MACs in 2 days (branch rollout)'], ['Lease time too long', 0.16, '8-day lease']], runbook: 'RB-105', impact: ['New Wi-Fi clients cannot get an address'], verify: ['Scope < 80%', 'New devices get IP'] }),
  backup: b => ({ pri: 'P4', cat: 'Config management', title: 'Nightly config backup failed – SSH auth timeout', ci: `${b.code}-sw01`,
    signals: [[0, 'OpsRamp', 'Backup job failed 02:14 CT', 'Minor']],
    corr: 0, rca: [['TACACS+ timeout during backup window', 0.77, 'Same error on 6 devices, same TACACS node'], ['Credential change', 0.12, 'No change recorded']], runbook: 'RB-109', impact: ['None (backup only)'], verify: ['Backup hash stored'] }),
  cpu: b => ({ pri: 'P2', cat: 'Customer-caused', title: 'High CPU 94% on core switch – broadcast storm', ci: `${b.code}-sw01`,
    signals: [[0, 'OpsRamp', 'CPU 94% sw01', 'Critical'], [20, 'OpsRamp', 'Broadcast 48k pps on 1/1/17', 'Critical'], [45, 'Aruba Central', 'Loop-protect triggered on 1/1/17', 'Major']],
    corr: 31, rca: [['Loop from unmanaged desk switch (back office)', 0.82, 'Loop-protect on 1/1/17; MAC flapping between 1/1/17 and 1/1/18'], ['STP misconfig', 0.11, 'STP consistent with golden']], runbook: 'RB-103', impact: ['Back-office LAN slow'], verify: ['CPU < 40%', 'Broadcast < 1k pps'] }),
  edgedown: b => ({ pri: 'P2', cat: 'SD-WAN', title: 'Branch unreachable – EdgeConnect not responding', ci: `${b.code}-ec01`,
    signals: [[0, 'Orchestrator', 'EdgeConnect lost contact with Orchestrator', 'Critical'], [30, 'OpsRamp', '11 downstream alerts suppressed (EdgeConnect parent)', 'Info']],
    corr: 11, rca: [['EdgeConnect hang or hardware fault', 0.72, 'No heartbeat; both carrier circuits up at the modems'], ['Local loop outage on both circuits', 0.18, 'Carrier portals show circuits up']], runbook: 'RB-108', impact: ['Branch offline until the EdgeConnect recovers'], verify: ['EdgeConnect reachable in Orchestrator', 'Tunnels up'] }),
};
export const TEMPLATE_W = [['circuit', 6], ['jitter', 3], ['apdown', 5], ['crc', 3], ['lte', 3], ['scanner', 3], ['pos', 1], ['dhcp', 1], ['backup', 4], ['cpu', 1]];
const GROUPS = { P1: 'Movate NOC – Major Incident', P2: 'Movate NOC – L2 Network', P3: 'Movate NOC – L2 Network', P4: 'Movate NOC – L1' };
export const ENGINEERS = ['Priya S.', 'Arjun M.', 'Kevin T.', 'Neha R.', 'Marcus L.', 'Sanjay K.', 'Dana W.', 'Ravi P.', 'Elena G.', 'Tom B.'];
let incN = 384512;
export const nextInc = () => `INC${String(++incN).padStart(7, '0')}`;

function agentStepsFor(t, b, conf) {
  const steps = [
    ['correlation', `Grouped ${t.corr + t.signals.length} raw events into this incident; linked CI ${t.ci}`],
    ['diagnosis', `Ranked ${t.rca.length} causes; top: ${t.rca[0][0]} (${Math.round(t.rca[0][1] * 100)}%)`],
    ['knowledge', `Found ${R.int(2, 6)} similar incidents in last 90 days; KB attached`],
    ['runbook', `Recommends ${t.runbook} ${RB[t.runbook].name}${conf < 0.8 ? ' – confidence below 80%, waiting for engineer' : ''}`],
  ];
  if (t.cat === 'Carrier / LEC') steps.push(['carrier', 'Evidence pack built (60-min loss/jitter, MTR, timestamps)']);
  steps.push(['comms', `StoreOps notified: ${t.impact[0]}`]);
  return steps;
}

export function buildIncident(kind, b, openedAgo, extra = {}) {
  const t = TEMPLATES[kind](b);
  const pri = extra.pri || t.pri;
  const opened = T0 - openedAgo;
  const conf = t.rca[0][1];
  return {
    id: nextInc(), kind, pri, title: t.title, cat: t.cat, branchId: b.id, ci: t.ci, opened,
    acked: openedAgo > 6 * MIN ? opened + R.int(2, 9) * MIN : null,
    state: openedAgo > 6 * MIN ? (t.cat === 'Carrier / LEC' ? 'On Hold – Carrier' : 'In Progress') : 'New',
    group: GROUPS[pri], assignee: openedAgo > 6 * MIN ? R.pick(ENGINEERS) : null,
    signals: t.signals.map(([o, src, msg, sev]) => ({ t: opened + o * 1000, src, msg, sev })),
    corr: t.corr, suppressed: Math.round(t.corr * 0.8),
    rca: t.rca.map(([cause, c, ev]) => ({ cause, conf: c, ev })), conf,
    agentSteps: agentStepsFor(t, b, conf).map(([a, text], i) => ({ agent: a, text, t: opened + (i + 1) * 25e3, st: 'done' })),
    runbook: t.runbook, rbState: openedAgo > 20 * MIN && conf >= 0.8 && RB[t.runbook].kind === 'readonly' ? 'done' : 'proposed',
    impact: t.impact, verify: t.verify.map(v => ({ v, st: 'pending' })),
    notes: openedAgo > 6 * MIN ? [{ t: opened + 8 * MIN, who: 'Mova iO', text: `Auto-triaged to ${GROUPS[pri]}; priority ${pri} based on branch hours and business impact.` }] : [],
    carrierCase: null, workOrder: null, major: false, ...extra,
  };
}

// Hero stores: five branches with scripted, connected stories that Ask Mova iO and every screen agree on
// (see the hero section at the end of this file). Store number = branch number (BR-0214 is Store 214).
export const HERO = { failover: 73, config: 214, changes: 118, bandwidth: 45, autoAP: 309 };
const heroIds = new Set(Object.values(HERO).map(n => `BR-${String(n).padStart(4, '0')}`));
export const INCIDENTS = [];
const openPlan = [
  ['circuit', 'P3', 92], ['circuit', 'P3', 41], ['circuit', 'P3', 260], ['jitter', 'P3', 33], ['apdown', 'P4', 300], ['apdown', 'P4', 125], ['apdown', 'P4', 610],
  ['crc', 'P4', 190], ['lte', 'P3', 400], ['lte', 'P3', 1300], ['scanner', 'P3', 52], ['pos', 'P2', 11], ['dhcp', 'P3', 75], ['backup', 'P4', 470], ['backup', 'P4', 480],
  ['cpu', 'P2', 4], ['circuit', 'P3', 1500], ['scanner', 'P3', 140], ['apdown', 'P4', 2900], ['crc', 'P4', 3300], ['jitter', 'P3', 9],
];
const usedB = new Set(heroIds);
openPlan.forEach(([k, p, minAgo], i) => {
  let b; do { b = BRANCHES[R.int(0, 899)]; } while (usedB.has(b.id) || b.region === 'Canada');
  usedB.add(b.id);
  const inc = buildIncident(k, b, minAgo * MIN, { pri: p });
  INCIDENTS.push(inc);
  if (k === 'circuit') { CIR[b.wan[0]].status = 'Down'; b.health = 'degraded'; }
  if (k === 'jitter' || k === 'pos') { CIR[b.wan[0]].status = 'Degraded'; CIR[b.wan[0]].jit = 38; CIR[b.wan[0]].loss = 2.4; b.health = 'degraded'; }
  if (k === 'lte') { CIR[b.wan[1]].status = 'Down'; b.health = 'degraded'; }
  if (k === 'cpu' || k === 'scanner' || k === 'dhcp') b.health = 'degraded';
});
// resolved history (last 7 days) – mix follows the 6-month ticket history shares
export const CLOSE_CODES = [['After-hours mended', 1977], ['No trouble found (NTF)', 875], ['Carrier / LEC', 533], ['Customer-caused', 254], ['Reboot', 134]];
export const RESOLVED = [];
for (let i = 0; i < 168; i++) {
  let b; do { b = BRANCHES[R.int(0, 899)]; } while (heroIds.has(b.id));
  const k = R.weighted(TEMPLATE_W);
  const ago = R.int(40, 7 * 24 * 60) * MIN;
  const inc = buildIncident(k, b, ago);
  const code = R.weighted(CLOSE_CODES);
  // a closed incident was closed before now: a long fix on a recent incident is cut to fit the time since it opened
  const ttr = Math.min({ P1: R.int(40, 260), P2: R.int(30, 520), P3: R.int(25, 1600), P4: R.int(30, 6200) }[inc.pri] * MIN, Math.round((ago - 5 * MIN) * 0.85));
  Object.assign(inc, { state: 'Resolved', resolved: inc.opened + ttr, closeCode: code, acked: inc.opened + R.int(1, 12) * MIN, assignee: R.pick(ENGINEERS), rbState: 'done' });
  RESOLVED.push(inc);
}
// two incidents that failed overnight then recovered (for "what failed overnight")
// branch health
let downN = 0;
BRANCHES.forEach(b => { if (b.health === 'up' && !heroIds.has(b.id)) b.health = R() < 0.0035 && downN++ < 3 ? 'down' : R() < 0.02 ? 'degraded' : 'up'; b.score = b.health === 'up' ? R.int(93, 100) : b.health === 'degraded' ? R.int(70, 88) : R.int(20, 45); });
BRANCHES.filter(b => b.health === 'down').forEach(b => {
  const inc = buildIncident('edgedown', b, R.int(8, 70) * MIN, { pri: 'P2', title: 'Branch unreachable – EdgeConnect not responding' });
  inc.signals.push({ t: inc.opened + 38 * MIN > T0 ? T0 - 60e3 : inc.opened + 38 * MIN, src: 'Orchestrator', msg: `${b.code}-ec01 unreachable – no heartbeat on either path, remote recovery queued`, sev: 'Critical' });
  b.wan.forEach(id => { CIR[id].status = 'Down'; });
  INCIDENTS.push(inc);
});

// ---------- carrier cases ----------
const CASE_FMT = { 'AT&T': () => `ATT-${digits(9)}`, Lumen: () => `LUMN-${digits(8)}`, Comcast: () => `CR${digits(9)}`, Spectrum: () => `SPB-${digits(8)}`, Verizon: () => `VZB-${digits(8)}`, Cox: () => `COX-${digits(8)}`, Bell: () => `BELL-${digits(7)}`, Rogers: () => `RGR-${digits(7)}`, Telus: () => `TLS-${digits(7)}` };
export const caseNo = c => (CASE_FMT[c] || (() => `CASE-${digits(8)}`))();
export const CARRIER_CASES = [];
INCIDENTS.filter(i => i.cat === 'Carrier / LEC').forEach(inc => {
  const c = CIR[inc.ci];
  const cs = { id: caseNo(c.carrier), carrier: c.carrier, circuit: c.id, inc: inc.id, branchId: inc.branchId, opened: inc.opened + 3 * MIN, status: R.pick(['Open – carrier testing', 'Dispatched – LEC tech', 'Open – awaiting carrier update']), eta: inc.opened + R.int(3, 9) * HR, lastUpdate: inc.opened + R.int(20, 90) * MIN, evidence: ['60-min loss/jitter graph', 'MTR from EdgeConnect', 'Interface counters', 'Timestamps (UTC/CT)'], escal: 0 };
  inc.carrierCase = cs.id; CARRIER_CASES.push(cs);
});
for (let i = 0; i < 12; i++) {
  const c = CIRCUITS[R.int(0, 1799)];
  CARRIER_CASES.push({ id: caseNo(c.carrier), carrier: c.carrier, circuit: c.id, inc: RESOLVED[i].id, branchId: c.branchId, opened: T0 - R.int(1, 6) * DAY, status: R.pick(['Closed – carrier fault fixed', 'Closed – NTF', 'Closed – NTF', 'Closed – LEC repaired']), eta: null, lastUpdate: T0 - R.int(4, 30) * HR, evidence: ['60-min loss/jitter graph', 'MTR from EdgeConnect'], escal: 0, closed: true });
}
// carrier scorecard (illustrative, scaled to the 533 carrier/LEC + 875 NTF six-month totals)
export const SCORECARD = [
  { carrier: 'AT&T', circuits: 0, cases6m: 148, ntf: 231, mttr: 6.1, slaMet: 0.91, repeat: 9 },
  { carrier: 'Lumen', circuits: 0, cases6m: 131, ntf: 214, mttr: 7.4, slaMet: 0.87, repeat: 11 },
  { carrier: 'Comcast', circuits: 0, cases6m: 97, ntf: 168, mttr: 5.2, slaMet: 0.93, repeat: 6 },
  { carrier: 'Spectrum', circuits: 0, cases6m: 86, ntf: 152, mttr: 8.3, slaMet: 0.84, repeat: 10 },
  { carrier: 'Verizon', circuits: 0, cases6m: 41, ntf: 61, mttr: 4.6, slaMet: 0.95, repeat: 3 },
  { carrier: 'Cox', circuits: 0, cases6m: 22, ntf: 37, mttr: 6.8, slaMet: 0.9, repeat: 2 },
  { carrier: 'Canadian carriers', circuits: 0, cases6m: 8, ntf: 12, mttr: 5.9, slaMet: 0.94, repeat: 0 },
];
SCORECARD.forEach(s => s.circuits = CIRCUITS.filter(c => s.carrier === 'Canadian carriers' ? ['Bell', 'Rogers', 'Telus'].includes(c.carrier) : c.carrier === s.carrier).length);
export const TICKET_MONTHS = [
  { m: 'Apr', afterHours: 296, ntf: 131, carrier: 77, customer: 39, reboot: 21 },
  { m: 'May', afterHours: 351, ntf: 152, carrier: 96, customer: 45, reboot: 24 },
  { m: 'Jun', afterHours: 372, ntf: 166, carrier: 104, customer: 47, reboot: 25 },
  { m: 'Jul', afterHours: 349, ntf: 157, carrier: 95, customer: 44, reboot: 23 },
  { m: 'Aug', afterHours: 330, ntf: 142, carrier: 86, customer: 42, reboot: 22 },
  { m: 'Sep', afterHours: 279, ntf: 127, carrier: 75, customer: 37, reboot: 19 },
];

// ---------- field ----------
export const DEPOTS = [
  { id: 'DEP-DAL', city: 'Dallas, TX', spares: { 'EC-XS': 6, '6100 48G': 5, '2530 24G': 3, 'AP-635': 14, 'AP-585': 4, 'LTE router': 5, 'SFP+ optic': 3 } },
  { id: 'DEP-HOU', city: 'Houston, TX', spares: { 'EC-XS': 4, '6100 48G': 3, '2530 24G': 2, 'AP-635': 9, 'AP-585': 2, 'LTE router': 3, 'SFP+ optic': 2 } },
  { id: 'DEP-ATL', city: 'Atlanta, GA', spares: { 'EC-XS': 5, '6100 48G': 4, '2530 24G': 2, 'AP-635': 12, 'AP-585': 3, 'LTE router': 4, 'SFP+ optic': 3 } },
  { id: 'DEP-TPA', city: 'Tampa, FL', spares: { 'EC-XS': 4, '6100 48G': 3, '2530 24G': 2, 'AP-635': 10, 'AP-565': 4, 'LTE router': 4, 'SFP+ optic': 2 } },
  { id: 'DEP-CHI', city: 'Chicago, IL', spares: { 'EC-XS': 4, '6100 48G': 4, '2530 24G': 3, 'AP-635': 10, 'AP-585': 2, 'LTE router': 3, 'SFP+ optic': 2 } },
  { id: 'DEP-PHX', city: 'Phoenix, AZ', spares: { 'EC-XS': 3, '6100 48G': 2, '2530 24G': 1, 'AP-635': 8, 'AP-565': 3, 'LTE router': 3, 'SFP+ optic': 2 } },
  { id: 'DEP-CLT', city: 'Charlotte, NC', spares: { 'EC-XS': 3, '6100 48G': 3, '2530 24G': 2, 'AP-635': 8, 'AP-585': 2, 'LTE router': 3, 'SFP+ optic': 1 } },
  { id: 'DEP-DEN', city: 'Denver, CO', spares: { 'EC-XS': 3, '6100 48G': 2, '2530 24G': 1, 'AP-635': 7, 'AP-585': 2, 'LTE router': 2, 'SFP+ optic': 1 } },
  { id: 'DEP-PHL', city: 'Philadelphia, PA', spares: { 'EC-XS': 3, '6100 48G': 3, '2530 24G': 2, 'AP-635': 8, 'AP-565': 2, 'LTE router': 2, 'SFP+ optic': 2 } },
  { id: 'DEP-SEA', city: 'Seattle, WA', spares: { 'EC-XS': 2, '6100 48G': 2, '2530 24G': 1, 'AP-635': 6, 'AP-585': 1, 'LTE router': 2, 'SFP+ optic': 1 } },
];
export const DEPOT_REGION = { 'Texas & South Central': ['DEP-DAL', 'DEP-HOU'], Southeast: ['DEP-ATL', 'DEP-TPA'], 'Carolinas & Mid-Atlantic': ['DEP-CLT', 'DEP-PHL'], Northeast: ['DEP-PHL'], 'Great Lakes': ['DEP-CHI'], 'Central Plains': ['DEP-CHI', 'DEP-DEN'], 'Mountain West': ['DEP-PHX', 'DEP-DEN'], Pacific: ['DEP-SEA', 'DEP-PHX'], Canada: ['DEP-CHI', 'DEP-SEA'] };
const TECH_NAMES = ['Luis R.', 'Brandon K.', 'Jasmine T.', 'Carlos M.', 'Derek H.', 'Amanda P.', 'Tyrell J.', 'Megan S.', 'Omar F.', 'Hannah W.', 'Jake D.', 'Nina V.', 'Chris O.', 'Rosa G.', 'Ethan B.', 'Kayla N.', 'Andre L.', 'Sophie C.', 'Victor A.', 'Grace Y.'];
const SKILLS = ['EdgeConnect swap', 'Aruba switching', 'Aruba wireless', 'Low-voltage cabling', 'LTE / cellular', 'Rack and closet', 'Outdoor AP / lift'];
export const TECHS = TECH_NAMES.map((n, i) => {
  const region = REGIONS[i % 9];
  const s = R.shuffle(SKILLS).slice(0, R.int(2, 4));
  if (i % 3 === 0 && !s.includes('EdgeConnect swap')) s.push('EdgeConnect swap');
  return { id: `TECH-${101 + i}`, name: n, region, base: (BRANCHES.filter(b => b.region === region)[i * 3] || BRANCHES[i]).city, skills: s, status: R.weighted([['Available', 55], ['On site', 30], ['Off shift', 15]]), rating: (4.3 + R() * 0.6).toFixed(1), jobs30: R.int(6, 28) };
});
export const WORK_ORDERS = [
  { id: 'WO0041872', branchId: INCIDENTS[4].branchId, inc: INCIDENTS[4].id, task: 'Replace PoE injector / re-terminate yard AP cable', skills: ['Outdoor AP / lift', 'Low-voltage cabling'], parts: ['AP-585'], tech: null, status: 'Unassigned', created: T0 - 3 * HR, window: 'Before 15:00 local', priority: 'P4' },
  { id: 'WO0041866', branchId: INCIDENTS[7].branchId, inc: INCIDENTS[7].id, task: 'Swap SFP and patch on uplink 1/1/49', skills: ['Aruba switching'], parts: ['SFP 10G-SR'], tech: TECHS[3].id, status: 'En route', created: T0 - 5 * HR, eta: T0 + 40 * MIN, window: 'Any time', priority: 'P4' },
  { id: 'WO0041851', branchId: BRANCHES[220].id, inc: null, task: 'Install out-of-band console server (IT closet)', skills: ['Rack and closet'], parts: ['OOB console server'], tech: TECHS[8].id, status: 'Scheduled', created: T0 - 26 * HR, eta: T0 + 20 * HR, window: 'After 17:00 local', priority: 'P4' },
];

// ---------- approvals, changes, drift ----------
export const APPROVALS = [
  { id: 'APR-2207', type: 'Runbook', title: `RB-104 AP reboot on ${INCIDENTS[10].ci}`, inc: INCIDENTS[10].id, branchId: INCIDENTS[10].branchId, agent: 'runbook', conf: 0.58, risk: 'Low', created: T0 - 40 * MIN, status: 'Pending', why: ['Confidence 58% is below the 80% gate', 'Branch is open (clients on AP)'], evidence: ['41 deauths / 10 min on SRS-SCAN', 'Co-channel interference ch 36', '3 similar cases fixed by channel plan + reboot'], rollback: 'None needed (stateless)', verify: ['Deauths < 5 per 10 min'] },
  { id: 'APR-2209', type: 'Change', title: 'Expand DHCP scope VLAN 30 /25 → /24', inc: INCIDENTS[12].id, branchId: INCIDENTS[12].branchId, agent: 'change', conf: 0.79, risk: 'Medium', created: T0 - 60 * MIN, status: 'Pending', why: ['Confidence 79% is below the 80% gate', 'Branch is open – config change needs a human'], evidence: ['Scope 100% used', '24 new handheld MACs in 48 h', 'No overlap with VLAN 31 in IPAM'], rollback: 'Restore previous scope from NaC commit a41f2c9', verify: ['Scope < 80%', 'New devices obtain IP'] },
  { id: 'APR-2211', type: 'Prediction', title: 'Proactive carrier case – rising loss on Lumen DIA (Charlotte)', branchId: findBranch('Charlotte').id, agent: 'prediction', conf: 0.84, risk: 'Low', created: T0 - 2 * HR, status: 'Pending', why: ['Predictions never act directly – approval to open a case'], evidence: ['Loss trend 0.1% → 0.9% over 5 days', 'Same signature preceded 3 outages on this LEC'], rollback: 'Cancel case', verify: ['Carrier ticket stored'] },
];
export const CHANGES = [
  { id: 'CHG0031874', title: 'AP firmware 10.7.1.0 – Wave 3 (Florida, 112 APs)', type: 'Normal', risk: 'Medium', state: 'Scheduled', start: T0 + 1 * DAY, end: T0 + 1 * DAY + 4 * HR, window: 'Tue 22:00–02:00 ET', scope: 'Southeast', devices: 112, owner: 'Network Eng L3', validation: 'Pending', nac: 'aps/firmware/wave3.yaml' },
  { id: 'CHG0031869', title: 'ECOS 9.5.4.1 – Texas wave 2 (64 EdgeConnects, HPESBNW04943 fixes)', type: 'Normal', risk: 'Medium', state: 'Approved', start: T0 + 2 * DAY, end: T0 + 2 * DAY + 5 * HR, window: 'Wed 23:00–04:00 CT', scope: 'Texas & South Central', devices: 64, owner: 'Network Eng L3', validation: 'Passed', nac: 'sdwan/ecos/tx-wave2.yaml' },
  { id: 'CHG0031881', title: 'Business intent policy – cloud application priority class', type: 'Standard', risk: 'Low', state: 'Scheduled', start: T0 + 3 * DAY, end: T0 + 3 * DAY + 2 * HR, window: 'Thu 22:00–00:00 CT', scope: 'All regions', devices: 933, owner: 'Network Eng L3', validation: 'Passed', nac: 'sdwan/bio/roofhub.yaml' },
  { id: 'CHG0031890', title: 'VLAN 50 cameras ACL hardening (block east-west)', type: 'Normal', risk: 'Medium', state: 'Awaiting CAB', start: T0 + 5 * DAY, end: T0 + 5 * DAY + 3 * HR, window: 'Sat 20:00–23:00 local', scope: 'Great Lakes', devices: 204, owner: 'Security Lead', validation: 'Running', nac: 'switching/acl/vlan50.yaml' },
  { id: 'CHG0031895', title: 'LS Building Products – cutover weekend (Branch-in-a-Box)', type: 'Normal', risk: 'High', state: 'Approved', start: T0 + 4 * DAY, end: T0 + 6 * DAY + 13 * HR, window: 'Fri 17:00 → Mon 06:00 CT', scope: 'Great Lakes', devices: 9, owner: 'M&A Integration Lead', validation: 'Passed', nac: 'sites/ls-building-products/il-01.yaml' },
  { id: 'CHG0031852', title: '2530 YA.16.11.0021 – Northeast remediation (N-2 → N)', type: 'Normal', risk: 'Low', state: 'Implemented', start: T0 - 2 * DAY, end: T0 - 2 * DAY + 3 * HR, window: 'Sat 21:00–00:00 ET', scope: 'Northeast', devices: 81, owner: 'Network Eng L3', validation: 'Passed', nac: 'switching/firmware/ne-2530.yaml' },
];
export const FREEZES = [
  { id: 'FRZ-11', name: 'Month-end close (ERP)', start: T0 + 10 * DAY, end: T0 + 13 * DAY, scope: 'All regions', reason: 'Finance close – no network changes except emergency' },
  { id: 'FRZ-12', name: 'Acquisition cutover – Great Lakes', start: T0 + 4 * DAY, end: T0 + 7 * DAY, scope: 'Great Lakes', reason: 'Protect LS Building Products cutover; no other changes in region' },
];
export const DRIFT = [
  { device: `${BRANCHES[45].code}-sw01`, branchId: BRANCHES[45].id, item: 'NTP servers differ from golden (10.10.1.5 missing)', sev: 'Low', since: T0 - 3 * DAY, source: 'Manual CLI change (no CHG)' },
  { device: `${BRANCHES[311].code}-sw02`, branchId: BRANCHES[311].id, item: 'Local admin account "branchtech" present', sev: 'High', since: T0 - 1 * DAY, source: 'Manual CLI change (no CHG)' },
  { device: `${BRANCHES[512].code}-ec01`, branchId: BRANCHES[512].id, item: 'BIO override "temp-pos" still applied after incident', sev: 'Medium', since: T0 - 5 * DAY, source: 'INC0384117 (not rolled back)' },
  { device: `${BRANCHES[640].code}-sw01`, branchId: BRANCHES[640].id, item: 'VLAN 60 (guest) allowed on uplink to POS switch', sev: 'High', since: T0 - 2 * DAY, source: 'Unknown' },
  { device: `${BRANCHES[702].code}-ap01`, branchId: BRANCHES[702].id, item: 'SSID SRS-SCAN 2.4 GHz disabled (template enables)', sev: 'Medium', since: T0 - 6 * DAY, source: 'Central group override' },
  { device: `${BRANCHES[811].code}-sw01`, branchId: BRANCHES[811].id, item: 'SNMPv2 community enabled', sev: 'High', since: T0 - 9 * DAY, source: 'Legacy template' },
];

// ---------- predictions ----------
export const PREDICTIONS = [
  { id: 'PRD-501', kind: 'Degrading circuit', target: findBranch('Charlotte').wan[0], branchId: findBranch('Charlotte').id, conf: 0.84, horizon: '48–72 h', signal: 'Packet loss trending 0.1% → 0.9% over 5 days, evening peaks', series: [0.1, 0.12, 0.2, 0.18, 0.35, 0.42, 0.6, 0.55, 0.78, 0.9], status: 'New', suggest: 'Open proactive carrier case (approval)' },
  { id: 'PRD-502', kind: 'Degrading circuit', target: findBranch('Houston').wan[0], branchId: findBranch('Houston').id, conf: 0.77, horizon: '3–5 days', signal: 'Latency baseline drift +14 ms, repeat-offender circuit (6 tickets / 90 d)', series: [22, 23, 25, 24, 28, 30, 31, 33, 35, 36], status: 'New', suggest: 'Watch; raise with carrier at weekly review' },
  { id: 'PRD-503', kind: 'AP failure risk', target: `${findBranch('Tampa').code}-ap04`, branchId: findBranch('Tampa').id, conf: 0.81, horizon: '7 days', signal: 'Outdoor AP: 5 reboots in 7 days, radio temp 71 °C midday', series: [0, 1, 0, 1, 0, 1, 2, 1, 2, 3], status: 'New', suggest: 'Schedule swap with spare from DEP-TPA (approval)' },
  { id: 'PRD-504', kind: 'Switch failure risk', target: `${findBranch('Phoenix').code}-sw01`, branchId: findBranch('Phoenix').id, conf: 0.73, horizon: '14 days', signal: 'PSU fan RPM falling, chassis temp 61 °C', series: [52, 53, 54, 55, 56, 57, 58, 59, 61, 60], status: 'Watching', suggest: 'Watch; order spare PSU and plan swap in next window' },
  { id: 'PRD-505', kind: 'Capacity forecast', target: findBranch('Dallas').wan[0], branchId: findBranch('Dallas').id, conf: 0.88, horizon: '21 days', signal: 'WAN util p95 at 78%, +2.1%/week since storm season; hits 90% in ~3 weeks', series: [58, 60, 63, 64, 67, 69, 71, 74, 76, 78], status: 'New', suggest: 'Request bandwidth upgrade CHG (approval)' },
  { id: 'PRD-506', kind: 'Capacity forecast', target: 'LTE data pool – Verizon', branchId: null, conf: 0.9, horizon: '9 days', signal: 'Pooled LTE usage 81% of monthly plan; 3 long failovers this month', series: [20, 28, 35, 44, 52, 60, 66, 71, 77, 81], status: 'New', suggest: 'Raise plan uplift with carrier (approval)' },
  { id: 'PRD-507', kind: 'Backup path risk', target: `${findBranch('Atlanta').code}-lte01`, branchId: findBranch('Atlanta').id, conf: 0.86, horizon: '30 days', signal: 'LTE backup throughput in weekly test fell 41 → 18 Mb/s', series: [41, 39, 36, 33, 30, 27, 24, 22, 20, 18], status: 'New', suggest: 'Replace LTE antenna and re-test backup (approval)' },
  { id: 'PRD-508', kind: 'AP failure risk', target: `${findBranch('Las Vegas').code}-ap05`, branchId: findBranch('Las Vegas').id, conf: 0.69, horizon: '10 days', signal: 'Yard AP Ethernet errors + heat; 2 PoE renegotiations/day', series: [0, 0, 1, 1, 2, 1, 2, 2, 3, 2], status: 'Watching', suggest: 'Watch' },
];

// ---------- knowledge ----------
export const KB = [
  { id: 'KB0012041', title: 'EdgeConnect: primary circuit down, branch on LTE – what to check and when to raise the carrier', tags: ['carrier', 'sdwan', 'lte'], views: 1840, rating: 4.8, updated: T0 - 12 * DAY, status: 'Published', body: '1) Confirm wan1 loss 100% and EC port up/up. 2) Check other branches on the same LEC CO. 3) Raise case with evidence pack (RB-106). 4) Tell StoreOps the branch is on backup and what is slower. 5) Return to primary only after 30 clean minutes.' },
  { id: 'KB0012055', title: 'Yard AP offline: PoE, outdoor cable and lift requirements', tags: ['wireless', 'yard', 'poe'], views: 920, rating: 4.6, updated: T0 - 30 * DAY, status: 'Published', body: 'Check PoE draw on the switch port. Bounce port (RB-103). If 0 W persists, outdoor cable or injector; dispatch tech with lift skill.' },
  { id: 'KB0012070', title: 'Wi-Fi sessions dropping in racking aisles', tags: ['wireless', 'roaming'], views: 610, rating: 4.4, updated: T0 - 21 * DAY, status: 'Published', body: 'Look for co-channel interference and late roaming. Enable 2.4 GHz on SRS-SCAN for older handhelds; adjust min RSSI; consider extra AP-635 near receiving.' },
  { id: 'KB0012088', title: 'POS slow at counter: separate processor issues from WAN issues', tags: ['pos', 'pci', 'sdwan'], views: 1310, rating: 4.7, updated: T0 - 8 * DAY, status: 'Published', body: 'Run RB-110 payment path test. If other branches are fine and wan1 shows loss, fail POS class to wan2 (RB-101).' },
  { id: 'KB0012102', title: 'Branch unreachable: treat the EdgeConnect as parent and suppress downstream alarms', tags: ['edgeconnect', 'correlation'], views: 480, rating: 4.5, updated: T0 - 44 * DAY, status: 'Published', body: 'When the EdgeConnect stops reporting it is the parent; OpsRamp suppresses child alarms for the switches and APs behind it. Check both carrier portals, then the out-of-band console, then run RB-108.' },
  { id: 'KB0012119', title: 'Acquired branch: legacy kit triage and data destruction certificates', tags: ['branch-in-a-box', 'acquisition'], views: 210, rating: 4.9, updated: T0 - 16 * DAY, status: 'Published', body: 'Keep only kit on the SRS standard list. Replace everything else. Recycle via approved vendor and attach the data destruction certificate to the CMDB retirement record.' },
  { id: 'KB0012131', title: 'Nightly backup failures caused by TACACS+ timeouts', tags: ['backup', 'tacacs'], views: 330, rating: 4.3, updated: T0 - 5 * DAY, status: 'Published', body: 'If several devices fail at the same minute on the same TACACS node, retry with RB-109 and raise with Security for node health.' },
];
export const KB_DRAFTS = [
  { id: 'KB-DRAFT-77', title: 'Loop from unmanaged desk switch in branch back office', from: INCIDENTS.find(i => i.kind === 'cpu')?.id || 'INC0384527', conf: 0.86, created: T0 - 2 * HR, status: 'Awaiting review', body: 'Symptom: core switch CPU > 90%, broadcast storm, loop-protect events on one access port. Fix: shut the port (RB-103), ask branch to remove the unmanaged switch, enable BPDU guard on back office ports (template).' },
  { id: 'KB-DRAFT-78', title: 'LTE backup SIM suspended after plan change', from: INCIDENTS.find(i => i.kind === 'lte')?.id || 'INC0384521', conf: 0.82, created: T0 - 6 * HR, status: 'Awaiting review', body: 'Weekly failover test fails, PDP reject cause 33. Check the carrier account for suspended lines; raise with carrier account team, not repair.' },
  { id: 'KB-DRAFT-79', title: 'DHCP exhaustion on the warehouse Wi-Fi VLAN after a device rollout', from: INCIDENTS.find(i => i.kind === 'dhcp')?.id || 'INC0384525', conf: 0.78, created: T0 - 9 * HR, status: 'Awaiting review', body: 'Expand VLAN 30 scope to /24 via NaC change; shorten lease to 1 day; add a readiness check for scope utilisation.' },
];
export const PROBLEMS = [
  { id: 'PRB0004211', title: 'Repeat Lumen DIA loss at Southeast branches on shared LEC', incidents: 14, state: 'Root cause analysis', owner: 'Network Eng L3', opened: T0 - 18 * DAY },
  { id: 'PRB0004218', title: 'Outdoor AP-585 reboots in high heat (Sun Belt yards)', incidents: 9, state: 'Known error', owner: 'Wireless team', opened: T0 - 26 * DAY },
  { id: 'PRB0004230', title: 'TACACS+ node timeouts during 02:00 backup window', incidents: 22, state: 'Fix in progress', owner: 'Security Lead', opened: T0 - 9 * DAY },
];

// ---------- SLA / KPI (Annexure B) ----------
const tr = (base, spread) => Array.from({ length: 6 }, (_, i) => +(base - spread + R() * spread * 2 + (i - 3) * spread * 0.1).toFixed(4));
export const SLA = [
  { n: 1, line: 'Network Operations & Incident Management', name: 'P1 incident response time', def: '≤ 15 min', msl: 0.95, esl: 0.98, act: 0.985, cls: 'Risk Reward SLA', trend: tr(0.982, 0.01), queue: 'P1' },
  { n: 2, line: 'Network Operations & Incident Management', name: 'P2 incident response time', def: '≤ 15 min', msl: 0.92, esl: 0.98, act: 0.983, cls: 'Risk Reward SLA', trend: tr(0.981, 0.008), queue: 'P2' },
  { n: 3, line: 'Network Operations & Incident Management', name: 'P3 incident response time', def: '≤ 30 min', msl: 0.9, esl: 0.95, act: 0.961, cls: 'SLA', trend: tr(0.958, 0.012), queue: 'P3' },
  { n: 4, line: 'Network Operations & Incident Management', name: 'P4 incident response time', def: '≤ 30 min', msl: 0.9, esl: 0.92, act: 0.948, cls: 'SLA', trend: tr(0.945, 0.01), queue: 'P4' },
  { n: 7, line: 'Network Operations & Incident Management', name: 'P1 incident resolution time', def: '≤ 4 h', msl: 0.95, esl: 0.98, act: 0.968, cls: 'Risk Reward SLA', trend: tr(0.97, 0.015), queue: 'P1' },
  { n: 8, line: 'Network Operations & Incident Management', name: 'P2 incident resolution time', def: '≤ 8 h', msl: 0.92, esl: 0.98, act: 0.955, cls: 'Risk Reward SLA', trend: tr(0.957, 0.015), queue: 'P2' },
  { n: 9, line: 'Network Operations & Incident Management', name: 'P3 incident resolution time', def: '≤ 24 h', msl: 0.9, esl: 0.95, act: 0.957, cls: 'SLA', trend: tr(0.954, 0.012), queue: 'P3' },
  { n: 10, line: 'Network Operations & Incident Management', name: 'P4 incident resolution time', def: '≤ 96 h', msl: 0.9, esl: 0.92, act: 0.963, cls: 'SLA', trend: tr(0.96, 0.01), queue: 'P4' },
  { n: 15, line: 'Network Operations & Incident Management', name: 'Major incident communication cadence', def: 'Updates every 60 min', msl: 0.95, esl: 0.98, act: 1, cls: 'SLA', trend: tr(0.99, 0.01) },
  { n: 23, line: 'Network Monitoring & Event Management', name: 'Critical alert acknowledgement', def: '≤ 15 min', msl: 0.95, esl: 0.98, act: 0.991, cls: 'SLA', trend: tr(0.99, 0.006) },
  { n: 24, line: 'Network Monitoring & Event Management', name: 'Non-critical alert acknowledgement', def: '≤ 30 min', msl: 0.9, esl: 0.95, act: 0.974, cls: 'SLA', trend: tr(0.97, 0.01) },
  { n: 25, line: 'Network Monitoring & Event Management', name: 'Correct ticket escalation (first assignment)', def: 'Right resolver queue', msl: 0.92, esl: 0.98, act: 0.982, cls: 'SLA', trend: tr(0.979, 0.008) },
  { n: 29, line: 'Network Device Management', name: 'Critical network availability', def: 'In-scope critical devices & services', msl: 0.99, esl: 0.9999, act: 0.99962, cls: 'Risk Reward SLA', trend: [0.99951, 0.99958, 0.99944, 0.9996, 0.99966, 0.99962], fmt: 3 },
  { n: 32, line: 'Network Device Management', name: 'Day-0 critical patch / firmware compliance', def: 'Critical N-1, others N-2', msl: 0.92, esl: 0.98, act: 0.944, cls: 'Risk Reward SLA', trend: tr(0.94, 0.01) },
  { n: 33, line: 'Network Device Management', name: 'Config backup success', def: 'With integrity validation', msl: 0.95, esl: 0.98, act: 0.986, cls: 'Risk Reward SLA', trend: tr(0.984, 0.005) },
  { n: 36, line: 'Network AI Triage & Routing', name: 'Ticket classification accuracy', def: 'Category & subcategory', msl: null, esl: 0.85, act: 0.893, cls: 'KPI', trend: tr(0.87, 0.02) },
  { n: 36, line: 'Network AI Triage & Routing', name: 'Incident prioritization accuracy', def: 'AI-assigned priority', msl: null, esl: 0.85, act: 0.912, cls: 'KPI', trend: tr(0.9, 0.015) },
  { n: 36, line: 'Network AI Triage & Routing', name: 'Resolver routing accuracy', def: 'First pass', msl: null, esl: 0.9, act: 0.934, cls: 'KPI', trend: tr(0.92, 0.015) },
  { n: 37, line: 'Network Automation & Auto-Remediation', name: 'Auto-resolution rate', def: 'Zero human touch', msl: null, esl: 0.25, act: 0.231, cls: 'KPI', trend: [0.12, 0.15, 0.17, 0.19, 0.21, 0.231] },
  { n: 37, line: 'Network Automation & Auto-Remediation', name: 'Automation coverage', def: 'vs approved roadmap', msl: null, esl: 0.4, act: 0.42, cls: 'KPI', trend: [0.22, 0.27, 0.31, 0.35, 0.39, 0.42] },
  { n: 38, line: 'Network AIOps & Predictive Operations', name: 'Predictive alert accuracy', def: 'True positives', msl: null, esl: 0.75, act: 0.78, cls: 'KPI', trend: tr(0.76, 0.02) },
  { n: 38, line: 'Network AIOps & Predictive Operations', name: 'Alert noise reduction', def: 'Correlation, suppression, de-dup', msl: null, esl: 0.5, act: 0.71, cls: 'KPI', trend: [0.52, 0.58, 0.63, 0.66, 0.69, 0.71] },
  { n: 38, line: 'Network AIOps & Predictive Operations', name: 'Alert false positive rate', def: 'Lower is better (≤ 20%)', msl: null, esl: 0.2, act: 0.14, cls: 'KPI', lower: true, trend: [0.22, 0.2, 0.18, 0.16, 0.15, 0.14] },
  { n: 39, line: 'Network Knowledge & Self-Service', name: 'Knowledge recommendation accuracy', def: 'Rated relevant', msl: null, esl: 0.8, act: 0.83, cls: 'KPI', trend: tr(0.81, 0.02) },
  { n: 39, line: 'Network Knowledge & Self-Service', name: 'Knowledge auto-generation', def: 'Resolved → validated KB', msl: null, esl: 0.4, act: 0.41, cls: 'KPI', trend: [0.2, 0.25, 0.3, 0.34, 0.38, 0.41] },
  { n: 39, line: 'Network Knowledge & Self-Service', name: 'Self-service adoption', def: 'Eligible requests', msl: null, esl: 0.35, act: 0.29, cls: 'KPI', trend: [0.12, 0.16, 0.2, 0.23, 0.26, 0.29] },
];

{
  const okFw = DEVICES.filter(d => { const l = FW_TARGET[d.type === 'AP' ? 'AP' : d.model].indexOf(d.fw); return l <= (d.type === 'SD-WAN' ? 1 : 2); }).length;
  const row = SLA.find(x => x.n === 32); row.act = +(okFw / DEVICES.length).toFixed(4); row.trend[5] = row.act;
}
// ---------- Branch-in-a-Box ----------
export const STAGES = ['Planned', 'Discovery', 'Site audit', 'Kit staged', 'Cutover', 'Hypercare', 'BAU'];
export const KIT = [
  { item: 'HPE Aruba Networking EdgeConnect 10104', qty: 'S/M: 1, L: 2 (HA)', note: 'Replaces the EC-XS (end of sale 31 Jan 2026). Pre-staged, zero-touch from Orchestrator; ships with branch template', group: 'WAN' },
  { item: 'Primary circuit (DIA or broadband)', qty: '1', note: 'Ordered at signing; 45–60 day lead time tracked by Carrier Agent', group: 'WAN' },
  { item: 'LTE / 5G backup router + pooled SIM', qty: '1', note: 'Activated and tested at staging (not at cutover)', group: 'WAN' },
  { item: 'Aruba CX 6100 48G PoE switch (stack on L sites: 6200M)', qty: 'S: 1, M: 2, L: stack of 3–4', note: 'Golden config from Network-as-Code repo', group: 'LAN' },
  { item: 'AP-635 indoor (office, counter, warehouse)', qty: '2–6', note: 'Warehouse placed for racking aisles and receiving', group: 'Wireless' },
  { item: 'AP-565 / AP-585 rugged outdoor (yard)', qty: '1–3', note: 'Pole/wall mount, lift needed; covers yard and loading areas', group: 'Wireless' },
  { item: 'Out-of-band console server (cellular)', qty: '1', note: 'Console to EC and switches when the WAN is down', group: 'Management' },
  { item: 'Patch panel, labelled patch leads, rack shelf', qty: '1 set', note: 'Colour code: red POS, blue corp, yellow warehouse Wi-Fi, green cameras', group: 'Physical' },
];
export const VLANS = [
  { id: 10, name: 'Corporate', color: '#33557a', note: 'Back office PCs, ERP clients' },
  { id: 20, name: 'POS / payments (PCI)', color: '#c62828', note: 'Isolated segment, own firewall policy, no east-west' },
  { id: 30, name: 'Warehouse Wi-Fi', color: '#b26a00', note: 'Yard and warehouse handhelds, SSID SRS-SCAN' },
  { id: 40, name: 'Voice', color: '#762123', note: 'Desk phones, QoS EF' },
  { id: 50, name: 'Cameras / IoT', color: '#2e7d32', note: 'Yard cameras, gate sensors' },
  { id: 60, name: 'Guest', color: '#6b6b6b', note: 'Contractor Wi-Fi, internet only' },
  { id: 70, name: 'OT / building', color: '#0d9488', note: 'Door access, HVAC controls' },
  { id: 99, name: 'Management / OOB', color: '#3a3a3a', note: 'Device management, console server' },
];
export const ZONES = [
  { id: 'counter', name: 'Counter / showroom', short: 'Counter / showroom', x: 20, y: 20, w: 240, h: 130, devices: ['AP-635 ×1', '2 POS terminals + PIN pads', 'Desk phones ×3'], drops: 12, vlans: [10, 20, 40, 60] },
  { id: 'office', name: 'Back office', short: 'Back office', x: 20, y: 160, w: 150, h: 120, devices: ['AP-635 ×1', 'PCs ×6', 'Desk phones ×5'], drops: 16, vlans: [10, 40] },
  { id: 'closet', name: 'IT closet', short: 'IT closet', x: 180, y: 160, w: 80, h: 120, devices: ['EdgeConnect 10104', 'CX 6100 48G PoE (×2)', 'LTE/5G router', 'OOB console', 'Patch panel'], drops: 0, vlans: [99] },
  { id: 'warehouse', name: 'Warehouse', short: 'Warehouse', x: 270, y: 20, w: 300, h: 260, devices: ['AP-635 ×3 (aisles + receiving)', 'Access switch drops ×4', 'Cameras ×4'], drops: 14, vlans: [30, 50, 10] },
  { id: 'docks', name: 'Loading docks', short: 'Loading docks', x: 580, y: 20, w: 160, h: 260, devices: ['AP-635 ×1', 'Dock door sensors', 'Camera ×2'], drops: 6, vlans: [30, 50, 70] },
  { id: 'yard', name: 'Outdoor yard', short: 'Outdoor yard', x: 20, y: 290, w: 550, h: 160, devices: ['AP-585 rugged ×2 (poles)', 'Yard cameras ×6', 'Gate controller'], drops: 8, vlans: [30, 50, 70] },
  { id: 'trucks', name: 'Staging area', short: 'Staging area', x: 580, y: 290, w: 160, h: 160, devices: ['AP-565 ×1', 'Outdoor switch enclosure'], drops: 3, vlans: [30, 60] },
];
export const ACQ_STEPS = [
  { id: 'discovery', name: 'Discovery & inventory import', desc: 'Import legacy kit list, carriers, contracts and IP plan; OpsRamp discovery scan over a temporary VPN' },
  { id: 'audit', name: 'Site audit', desc: 'Power, cooling, closet, cabling, yard coverage survey; photos into ServiceNow' },
  { id: 'triage', name: 'Legacy kit triage', desc: 'Keep / replace / recycle each device; data destruction certificate for anything leaving' },
  { id: 'erp', name: 'ERP / POS cutover readiness', desc: 'Branch moves onto SRS ERP and POS; payment terminals re-keyed on the PCI segment' },
  { id: 'onboard', name: 'Onboard to tools', desc: 'OpsRamp, Aruba Central, Orchestrator, ServiceNow CMDB CIs, runbooks, readiness checks' },
  { id: 'hypercare', name: 'Hypercare (14 days)', desc: 'Tighter thresholds, daily check-in with branch manager, named owner' },
];
export const GATE_TEMPLATE = [
  ['Fri 17:30', 'Branch closed; change freeze in effect for site', 'StoreOps Lead', 'Branch closed in ERP; doors secured'],
  ['Fri 18:00', 'Legacy config + data backed up', 'Movate NOC', 'Backup files hashed and stored'],
  ['Fri 19:00', 'Old edge off (legacy router/firewall)', 'Field Tech', 'Photo of powered-off legacy kit'],
  ['Fri 21:00', 'Rack swap: switches and OOB console', 'Field Tech', 'Rack photo + all devices online'],
  ['Fri 22:30', 'EdgeConnect up (zero-touch)', 'Movate Network Eng', 'EC registered in Orchestrator; tunnels to DC up'],
  ['Sat 08:00', 'Circuits verified: primary + LTE', 'Carrier Agent', 'Speed test + failover test both paths'],
  ['Sat 10:00', 'VLANs & policies applied (NaC)', 'Network Eng L3', 'Diff = 0 vs golden'],
  ['Sat 13:00', 'POS / payment tested (PCI segment)', 'Security Lead', 'RB-110 pass; test auth approved'],
  ['Sat 15:00', 'Warehouse and yard Wi-Fi verified', 'StoreOps + Field Tech', '14/14 handhelds associated; roaming walk-test passed'],
  ['Sun 10:00', 'ERP and order flow over the network', 'StoreOps Lead', 'Test order end to end over the new network'],
  ['Sun 12:00', 'Voice and guest VLANs verified', 'Network Eng L3', 'Test call on VLAN 40; guest internet only'],
  ['Sun 16:00', 'Day-1 parity: OpsRamp, Central, CMDB, runbooks', 'Movate NOC', 'Parity check 100%'],
  ['Mon 05:30', 'StoreOps sign-off – Go', 'Branch Manager + StoreOps', 'Signed in ServiceNow'],
];
export function makeGates(passCount) { return GATE_TEMPLATE.map(([when, name, owner, evidence], i) => ({ i, when, name, owner, evidence, st: i < passCount ? 'Pass' : 'Pending', at: null, note: '' })); }

export const PROJECTS = [
  { id: 'BIB-0141', track: 'Acquired', brand: 'LS Building Products', site: 'Central Illinois – Branch 1', state: 'IL', region: 'Great Lakes', stage: 'Cutover', rag: 'Amber', golive: T0 + 7 * DAY, size: 'M', blockers: ['Legacy handhelds need 2.4 GHz – verify at gate 9'], gates: makeGates(0), steps: { discovery: 'done', audit: 'done', triage: 'done', erp: 'done', onboard: 'active', hypercare: 'todo' }, legacy: [['Legacy router (ISP-supplied)', 'Recycle', 'Cert pending'], ['Unmanaged 24-port switch ×2', 'Recycle', 'Cert pending'], ['Consumer Wi-Fi APs ×3', 'Recycle', 'Cert pending'], ['NVR + 6 cameras', 'Keep (move to VLAN 50)', '—'], ['Legacy handhelds ×14 (2.4 GHz only)', 'Keep (2.4 GHz only)', '—'], ['POS terminals ×2', 'Replace (SRS standard)', 'Cert pending']], carriers: ['Comcast business broadband (keep as secondary)', 'Local fiber ISP (cancel after cutover)'], acquired: 'Announced 2026 (public)', note: 'Acquired brand name stays on the branch.' },
  { id: 'BIB-0138', track: 'Acquired', brand: "Mingledorff's", site: 'Wave 2 – 10 sites (Southeast)', state: 'GA', region: 'Southeast', stage: 'Kit staged', rag: 'Green', golive: T0 + 18 * DAY, size: 'M', blockers: [], gates: makeGates(0), steps: { discovery: 'done', audit: 'done', triage: 'done', erp: 'active', onboard: 'todo', hypercare: 'todo' }, legacy: [['Legacy SD-WAN appliances ×10', 'Replace', 'Cert pending'], ['Aruba APs (older)', 'Keep 18, replace 9', '—']], carriers: ['AT&T DIA (keep)', 'Spectrum broadband (keep)'], acquired: 'Acquired May 2026 (public); 42 locations, 5 SE states', note: 'HVAC distributor; keeps Mingledorff\'s name.' },
  { id: 'BIB-0136', track: 'Acquired', brand: "Mingledorff's", site: 'Wave 1 – 8 sites incl. Peachtree Corners HQ', state: 'GA', region: 'Southeast', stage: 'Hypercare', rag: 'Green', golive: T0 - 6 * DAY, size: 'L', blockers: [], gates: makeGates(13), steps: { discovery: 'done', audit: 'done', triage: 'done', erp: 'done', onboard: 'done', hypercare: 'active' }, legacy: [], carriers: [], acquired: 'Acquired May 2026 (public)', note: 'Hypercare day 6 of 14.' },
  { id: 'BIB-0143', track: 'Acquired', brand: 'Lohmiller & Company', site: '4 Colorado sites (Denver HQ)', state: 'CO', region: 'Mountain West', stage: 'Discovery', rag: 'Green', golive: T0 + 46 * DAY, size: 'M', blockers: ['Deal close pending – discovery limited to non-invasive survey'], gates: makeGates(0), steps: { discovery: 'active', audit: 'todo', triage: 'todo', erp: 'todo', onboard: 'todo', hypercare: 'todo' }, legacy: [], carriers: [], acquired: 'Definitive agreement Aug 2026 (public)', note: 'HVAC; leadership and name stay.' },
  { id: 'BIB-0142', track: 'Acquired', brand: 'Sider Lumber & Supply', site: 'Site 1', state: '—', region: '—', stage: 'Site audit', rag: 'Red', golive: T0 + 25 * DAY, size: 'S', blockers: ['No IT closet – shared office space; cooling below spec', 'Primary circuit order not yet accepted by carrier'], gates: makeGates(0), steps: { discovery: 'done', audit: 'active', triage: 'todo', erp: 'todo', onboard: 'todo', hypercare: 'todo' }, legacy: [], carriers: [], acquired: '2026 acquisition (public)', note: '' },
  { id: 'BIB-0129', track: 'Acquired', brand: 'Specialty Wood Products', site: 'Aurora, CO + Kyle, TX', state: 'CO', region: 'Mountain West', stage: 'BAU', rag: 'Green', golive: T0 - 40 * DAY, size: 'M', blockers: [], gates: makeGates(13), steps: { discovery: 'done', audit: 'done', triage: 'done', erp: 'done', onboard: 'done', hypercare: 'done' }, legacy: [], carriers: [], acquired: 'Nov 2025 (public)', note: '' },
  { id: 'BIB-0144', track: 'Greenfield', brand: 'SRS Building Products', site: 'Midland, TX – new yard', state: 'TX', region: 'Texas & South Central', stage: 'Kit staged', rag: 'Green', golive: T0 + 12 * DAY, size: 'M', blockers: [], gates: makeGates(0), steps: {}, legacy: [], carriers: ['Lumen DIA 200M (installed)', 'Verizon LTE (activated at staging)'] },
  { id: 'BIB-0145', track: 'Greenfield', brand: 'Suncoast Roofers Supply', site: 'Port St. Lucie, FL', state: 'FL', region: 'Southeast', stage: 'Site audit', rag: 'Amber', golive: T0 + 21 * DAY, size: 'S', blockers: ['Primary circuit install date slipped 6 days (Comcast)'], gates: makeGates(0), steps: {}, legacy: [], carriers: ['Comcast 500M (install pending)', 'AT&T LTE'] },
  { id: 'BIB-0146', track: 'Greenfield', brand: 'Superior Distribution', site: 'Spartanburg, SC', state: 'SC', region: 'Carolinas & Mid-Atlantic', stage: 'Planned', rag: 'Green', golive: T0 + 39 * DAY, size: 'M', blockers: [], gates: makeGates(0), steps: {}, legacy: [], carriers: [] },
  { id: 'BIB-0140', track: 'Greenfield', brand: 'American Roofing Supply', site: 'Nampa, ID', state: 'ID', region: 'Mountain West', stage: 'Hypercare', rag: 'Green', golive: T0 - 3 * DAY, size: 'S', blockers: [], gates: makeGates(13), steps: {}, legacy: [], carriers: [] },
];
export const GREEN_STEPS = [
  { id: 'plan', name: 'Profile & bill of materials', desc: 'Pick S/M/L profile from yard size and staff; ServiceNow project opened' },
  { id: 'circuits', name: 'Circuits ordered', desc: 'Primary + LTE ordered at lease signing; install dates tracked' },
  { id: 'build', name: 'Closet & cabling', desc: 'Closet rack, Cat6A drops, yard poles' },
  { id: 'stage', name: 'Kit staged & shipped', desc: 'Zero-touch profile bound to site; switches/APs pre-claimed in Central' },
  { id: 'turnup', name: 'Turn-up day', desc: 'Same gate list as an acquisition, without legacy removal' },
  { id: 'hypercare', name: 'Hypercare (14 days)', desc: 'Tighter thresholds, then BAU' },
];

export const READY_CHECKS = [
  { id: 'sdwan', name: 'SD-WAN tunnels (both paths)', src: 'Orchestrator' },
  { id: 'erp', name: 'ERP / POS path', src: 'Synthetic' },
  { id: 'wifi', name: 'Wi-Fi (office, warehouse, yard)', src: 'Aruba Central' },
  { id: 'scan', name: 'DHCP pools', src: 'OpsRamp' },
  { id: 'print', name: 'Wi-Fi roaming (warehouse)', src: 'Aruba Central' },
  { id: 'track', name: 'Config backup', src: 'OpsRamp' },
];

// ---------- make / model / lifecycle / vulnerabilities ----------
// Public facts are cited in SRC. Anything without a public date is marked est..
export const SRC = {
  papi: 'HPE Aruba Networking HPESBNW04712, Sep 2024 (CCB advisory 2024-231)',
  cx: 'HPE Aruba Networking HPESBNW05027, Mar 2026',
  ec: 'HPE Aruba Networking HPESBNW04943, Sep 2025',
  eol2530: 'HPE Aruba Networking end-of-sale notice for the 2530 24/48-port Gigabit switches: 48G PoE+ (J9772A) end of sale 31 Jan 2022, end of support 31 Jan 2027; 24G PoE+ (J9773A) end of sale 31 Mar 2022, end of support 31 Mar 2027',
  ecxs: 'HPE Aruba Networking EdgeConnect EC-XS (JM962A): end of sale 31 Jan 2026, end of support 31 Jan 2031 (EdgeConnect lifecycle policy: support ends 5 years after end of sale)',
};
export const MODEL_INFO = {
  'EC-XS': { make: 'HPE Aruba Networking', family: 'EdgeConnect SD-WAN', name: 'EdgeConnect EC-XS', sku: 'JM962A', os: 'ECOS', status: 'End of sale', eos: '2026-01-31', eosup: '2031-01-31', replace: 'EdgeConnect 10104' },
  '2530': { make: 'HPE Aruba Networking', family: 'Aruba 2530 (AOS-S)', name: 'Aruba 2530 48G PoE+', sku: 'J9772A', os: 'AOS-S', status: 'End of sale', eos: '2022-01-31', eosup: '2027-01-31', replace: 'CX 6100 48G Class4 PoE' },
  '6100': { make: 'HPE Aruba Networking', family: 'Aruba CX 6100', name: 'Aruba CX 6100 48G Class4 PoE', os: 'AOS-CX', status: 'Current', eos: null, eosup: null },
  '6200M': { make: 'HPE Aruba Networking', family: 'Aruba CX 6200M', name: 'Aruba CX 6200M 48G Class4 PoE', os: 'AOS-CX', status: 'Current', eos: null, eosup: null },
  '6300': { make: 'HPE Aruba Networking', family: 'Aruba CX 6300', name: 'Aruba CX 6300M 48G Class4 PoE', os: 'AOS-CX', status: 'Current', eos: null, eosup: null },
  'AP-635': { make: 'HPE Aruba Networking', family: '630 Series (Wi-Fi 6E)', name: 'AP-635 indoor', os: 'AOS 10', status: 'Current', eos: null, eosup: null },
  'AP-634': { make: 'HPE Aruba Networking', family: '630 Series (Wi-Fi 6E)', name: 'AP-634 indoor', os: 'AOS 10', status: 'Current', eos: null, eosup: null },
  'AP-565': { make: 'HPE Aruba Networking', family: '560 Series outdoor', name: 'AP-565 outdoor', os: 'AOS 10', status: 'Current', eos: null, eosup: null },
  'AP-567': { make: 'HPE Aruba Networking', family: '560 Series outdoor', name: 'AP-567 outdoor', os: 'AOS 10', status: 'Current', eos: null, eosup: null },
  'AP-575': { make: 'HPE Aruba Networking', family: '570 Series outdoor', name: 'AP-575 outdoor', os: 'AOS 10', status: 'Current', eos: null, eosup: null },
  'AP-585': { make: 'HPE Aruba Networking', family: '580 Series outdoor', name: 'AP-585 outdoor', os: 'AOS 10', status: 'Current', eos: null, eosup: null },
};
// Per-SKU dates where a model family has more than one notice
export const SKU_INFO = { J9773A: { name: 'Aruba 2530 24G PoE+', sku: 'J9773A', eos: '2022-03-31', eosup: '2027-03-31', replace: 'CX 6100 24G Class4 PoE' } };
export const lifeInfo = d => ({ ...(MODEL_INFO[d.model] || {}), ...(d.sku && SKU_INFO[d.sku] || {}) });
// Warranty, per the HPE Aruba Networking warranty quick reference: switches and APs carry a limited lifetime
// warranty that ends 5 years after end of sale; the EdgeConnect EC-XS has a 1-year warranty, so its date is the
// HPE support contract, renewed every year.
export const LIFETIME = Date.UTC(2099, 0, 1);
export const warrantyKind = d => d.type === 'SD-WAN' ? 'Support contract' : 'Limited lifetime warranty';
export const warrantyText = d => d.warranty >= LIFETIME ? 'Lifetime' : new Date(d.warranty).toISOString().slice(0, 10);
DEVICES.forEach(d => { if (d.model === '2530') { const b = BR[d.branchId]; if (b.size === 'S') { d.sku = 'J9773A'; d.desc = 'Aruba 2530 24G PoE+'; } else { d.sku = 'J9772A'; d.desc = 'Aruba 2530 48G PoE+'; } } else d.desc = (MODEL_INFO[d.model] || {}).name || d.model; });
// Management mode, as in the contracted inventory: 2,080 switches and APs are standalone (outside Aruba Central,
// polled by OpsRamp only); the rest are managed in Central.
DEVICES.forEach(d => { if (d.type === 'Switch') d.mode = d.role === 'Standalone' ? 'Standalone' : 'Central'; else if (d.type === 'AP') d.mode = d.mode === 'Standalone' ? 'Standalone' : 'Central'; });
{ // match the contracted split exactly: 1,268 standalone switches and 812 standalone APs
  const fix = (type, want) => { let n = DEVICES.filter(d => d.type === type && d.mode === 'Standalone').length; for (const d of DEVICES) { if (n >= want) break; if (d.type === type && d.mode === 'Central' && !/core|HA|Stack/i.test(d.role)) { d.mode = 'Standalone'; n++; } } };
  fix('Switch', 1268); fix('AP', 812);
}
export const CENTRAL_N = DEVICES.filter(d => d.mode === 'Central').length;
DEVICES.forEach((d, i) => {
  if (d.type === 'SD-WAN') { if (d.warranty < T0 && i % 9) d.warranty += 365 * DAY; }
  else { const e = lifeInfo(d).eosup; d.warranty = e ? Date.parse(e + 'T00:00:00Z') : LIFETIME; }
});

export const ADVISORIES = [
  { id: 'HPESBNW04712', cves: ['CVE-2024-42505', 'CVE-2024-42506', 'CVE-2024-42507'], title: 'Unauthenticated command injection via PAPI (UDP 8211) in access points', product: 'Access points (AOS 10)', types: ['AP'], cvss: 9.8, sev: 'Critical', published: '2024-09-24', vector: 'Network, no authentication', affects: d => d.type === 'AP' && ['10.5.1.4', '10.4.1.2'].includes(d.fw), fixed: 'AOS 10.7.0.0, 10.6.0.3 or 10.4.1.4 and later; AOS 10.5 is out of support, so move to 10.6 or 10.7', mitigation: 'Block UDP 8211 (PAPI) from all untrusted networks', src: 'papi' },
  { id: 'HPESBNW05027', cves: ['CVE-2026-23813'], title: 'Authentication bypass in the AOS-CX web management interface', product: 'CX 6100 / 6200 / 6300 (AOS-CX)', types: ['Switch'], cvss: 9.8, sev: 'Critical', published: '2026-03-10', vector: 'Network, no authentication', affects: d => d.type === 'Switch' && ['10.16.1020', '10.13.1160', '10.10.1170'].includes(d.fw), fixed: 'AOS-CX 10.16.1030, 10.13.1161, 10.10.1180 or 10.17.1001 and later (target 10.16.1030)', mitigation: 'Restrict HTTPS management to the management VLAN; disable web UI where unused', src: 'cx' },
  { id: 'HPESBNW04943', cves: ['CVE-2025-37123', 'CVE-2025-37124', 'CVE-2025-37125', 'CVE-2025-37126'], title: 'Multiple vulnerabilities in EdgeConnect SD-WAN gateways (incl. unauthenticated firewall bypass)', product: 'EdgeConnect EC-XS (ECOS)', types: ['SD-WAN'], cvss: 8.8, sev: 'High', published: '2025-09-16', vector: 'Network (CVE-2025-37124 needs no authentication)', affects: d => d.type === 'SD-WAN' && ['9.4.3.4', '9.3.8.0'].includes(d.fw), fixed: 'ECOS 9.5.4 or 9.4.4 and later (affected: 9.5.0.0 to 9.5.3.6 and 9.4.0.0 to 9.4.3.7)', mitigation: 'Restrict management plane; keep Orchestrator at or above gateway release', src: 'ec' },
  { id: 'EOS-2530', cves: [], title: 'Aruba 2530: end of sale 2022, end of support 31 Jan 2027 (48G) and 31 Mar 2027 (24G)', product: 'Aruba 2530 (AOS-S)', types: ['Switch'], cvss: null, sev: 'Lifecycle', published: '2021-05-31', vector: 'Lifecycle risk', affects: d => d.model === '2530', fixed: 'Replace with CX 6100 (Branch-in-a-Box standard)', mitigation: 'Keep on YA.16.11.0021; ACL on management; prioritise replacement at high-traffic branches', src: 'eol2530' },
  { id: 'ECOS-9.3', cves: [], title: 'ECOS 9.3 is an older release: security fixes ship only for 9.4 and 9.5', product: 'EdgeConnect EC-XS (ECOS 9.3)', types: ['SD-WAN'], cvss: null, sev: 'Lifecycle', published: '2025-09-16', vector: 'Software release', affects: d => d.type === 'SD-WAN' && d.fw.startsWith('9.3'), fixed: 'Upgrade to ECOS 9.5.4.1', mitigation: 'Schedule into the next ECOS wave', src: 'ec' },
];
export const vulnsOf = d => ADVISORIES.filter(a => a.affects(d));
export const lifecycleOf = d => {
  const m = lifeInfo(d);
  if (m.eosup && m.eosup <= '2026-10-20') return { status: 'End of support', tone: 'red', eos: m.eos, eosup: m.eosup, note: `End of sale ${m.eos}; end of support ${m.eosup}` };
  if (m.eos) return { status: 'End of sale', tone: m.eosup < '2027-10-20' ? 'red' : 'amber', eos: m.eos, eosup: m.eosup, note: `End of sale ${m.eos}; end of support ${m.eosup}` };
  if (d.warranty < T0) return { status: 'Warranty expired', tone: 'amber', note: 'No end of sale announced; warranty lapsed' };
  return { status: 'Current', tone: 'green', note: 'No end of sale announced' };
};

// ---------- auto-remediation flags on last week's resolved incidents ----------
// About 23% of tickets close with zero human touch (Annexure B #37). The runbooks that can act on their own (L3/L4)
// fix these kinds; anything that needs a carrier, a part or a person stays with an engineer.
const AUTO_ACTION = {
  apdown: (i, b) => [`RB-103 bounced the PoE port feeding ${i.ci}; AP back in ${2 + (b.num % 3)} m ${10 + (b.num % 47)} s and clients re-associated`, 'RB-103'],
  backup: () => ['RB-109 re-ran the nightly config backup; hash verified and stored', 'RB-109'],
  jitter: (i, b) => [`RB-101 steered POS, ERP and voice to wan2; payment path back under 400 ms in ${30 + (b.num % 25)} s`, 'RB-101'],
  pos: () => ['RB-101 steered the POS class to wan2; payment path back under 400 ms', 'RB-101'],
  scanner: (i) => [`RB-104 rebooted ${i.ci} after close and moved it off channel 36; roaming failures stopped`, 'RB-104'],
  cpu: () => ['Loop-protect plus RB-103 shut the looping access port; CPU back under 40% in 2 minutes', 'RB-103'],
};
{
  const want = Math.round(RESOLVED.length * 0.231);
  let n = 0;
  RESOLVED.forEach((inc, k) => {
    const f = AUTO_ACTION[inc.kind];
    if (!f || n >= want || k % 4 === 3) return;
    const [action, rb] = f(inc, BR[inc.branchId]);
    Object.assign(inc, { auto: true, autoAction: action, runbook: rb, closeCode: 'Auto-resolved (zero touch)', resolved: inc.opened + (8 + (k % 19)) * MIN });
    n++;
  });
}

// ---------- hero stores ----------
export const storeOf = n => BR[`BR-${String(n).padStart(4, '0')}`];
// epoch ms of hh:mm local time at a branch, `back` days before today
function wall(b, h, m, back = 0) {
  const p = parts(T0, b.tz);
  return T0 - (Date.UTC(p.y, p.mo - 1, p.d, p.h, p.m, p.s) - Date.UTC(p.y, p.mo - 1, p.d - back, h, m));
}
const HB = { fo: storeOf(HERO.failover), cfg: storeOf(HERO.config), chg: storeOf(HERO.changes), bw: storeOf(HERO.bandwidth), ap: storeOf(HERO.autoAP) };
export const HERO_STORY = {};

// Store 214: a policy change slowed ERP at opening; the change check rolled it back on its own.
{
  const b = HB.cfg, c1 = CIR[b.wan[0]], c2 = CIR[b.wan[1]];
  const back = wall(b, 7, 20) <= T0 ? 0 : 1; // the most recent morning that has happened
  const at = (h, m) => wall(b, h, m, back);
  const push = at(5, 40), slow = at(6, 34), call = at(6, 41), open = at(6, 43), diag = at(6, 46), roll = at(6, 51), ok = at(6, 58), done = at(7, 15);
  const chg = { id: 'CHG0031907', title: 'Business intent policy v41 – ERP class remap (Carolinas wave 1, 38 EdgeConnects)', type: 'Standard', risk: 'Low', state: 'Failed – rolled back', start: push, end: push + 14 * MIN, window: '05:30–06:00 ET', scope: 'Carolinas & Mid-Atlantic', devices: 38, owner: 'Network Eng L3', validation: 'Failed – ERP canary at opening', nac: 'sdwan/bio/v41.yaml', branchIds: [b.id] }; // paused after the first branch
  CHANGES.push(chg);
  const inc = {
    id: nextInc(), kind: 'hero-config', pri: 'P2', title: 'ERP slow at the counter after opening – order entry timing out', cat: 'SD-WAN', branchId: b.id, ci: `${b.code}-ec01`, opened: open,
    acked: open + 2 * MIN, state: 'Resolved', resolved: done, closeCode: 'Auto-resolved (zero touch)', group: GROUPS.P2, assignee: 'Priya S.',
    signals: [{ t: slow, src: 'New Relic', msg: 'ERP login synthetic 4.8 s from this branch (baseline 1.2 s)', sev: 'Major' }, { t: call, src: 'ServiceNow', msg: 'Branch call: order entry timing out at the counter', sev: 'Major' }, { t: open - 30e3, src: 'Orchestrator', msg: `${b.code}-ec01 ERP class queue drops 18% (other classes 0%)`, sev: 'Major' }],
    corr: 14, suppressed: 11,
    rca: [
      { cause: `Network: EdgeConnect policy change ${chg.id} put ERP traffic in the bulk class`, conf: 0.91, ev: 'ERP-class queue drops 18% from the first ERP traffic of the day; every other class clean; v41 pushed at 05:40' },
      { cause: `ISP: ${c1.carrier} ${c1.type} congestion`, conf: 0.05, ev: `wan1 loss ${c1.loss}%, latency ${c1.lat} ms, jitter ${c1.jit} ms – all at baseline; wan2 (${c2.carrier}) clean` },
      { cause: 'Application: ERP slow at the data centre', conf: 0.03, ev: 'ERP login 1.2 s from 41 other branches at the same minute; ERP servers healthy in New Relic' },
    ], conf: 0.91,
    agentSteps: [['correlation', 'Grouped 14 events (synthetic, branch call, queue drops) into one incident'], ['diagnosis', 'Ruled out the ISP and the ERP application; top cause: policy change CHG0031907 (91%)'], ['change', 'CHG0031907 canary breach at the first branch with ERP traffic; rollback plan pre-approved in the change'], ['runbook', 'RB-105 rolled the EdgeConnect back to policy v40; 5-minute stop window, Priya S. notified'], ['verify', 'ERP login 1.3 s, queue drops 0%; wave paused for the other 37 branches'], ['comms', 'Branch manager told: fixed, nothing to do']].map(([agent, text], i) => ({ agent, text, t: [open, diag, diag + 2 * MIN, roll, ok, ok + 2 * MIN][i], st: 'done' })),
    runbook: 'RB-105', rbState: 'done', auto: true, autoAction: 'Change Validation agent rolled the EdgeConnect back to policy v40 (RB-105) under the change\'s pre-approved rollback plan; ERP back to 1.3 s in 7 minutes', impact: ['ERP order entry slow at the counter'], verify: [{ v: 'ERP login < 1.5 s', st: 'pass' }, { v: 'ERP class queue drops 0%', st: 'pass' }],
    notes: [{ t: roll, who: 'Change Validation Agent', text: 'Rollback under CHG0031907 plan; wave paused at 1 of 38 branches.' }, { t: done, who: 'Priya S.', text: 'Confirmed with branch manager; closing. Problem PRB0004236 raised for the v41 DSCP mapping.' }],
    carrierCase: null, workOrder: null, major: false,
  };
  RESOLVED.push(inc);
  PROBLEMS.push({ id: 'PRB0004236', title: 'Policy v41 maps ERP DSCP to the bulk class; pre-open validation has no ERP test', incidents: 1, state: 'Fix in progress', owner: 'Network Eng L3', opened: done });
  // the branch stays under a 24-hour watch after the automatic fix, so it shows as degraded until the fix is proven
  b.health = 'degraded'; b.score = 84; b.watch = { inc: inc.id, until: ok + DAY, why: `Under 24-hour watch after Mova iO rolled back ${chg.id} (ERP was slow at opening; back to normal)` };
  b.why = b.watch.why;
  HERO_STORY[HERO.config] = { inc: inc.id, chg: chg.id, push, slow, call, open, roll, ok, done, back };
}

// Store 73: AT&T fibre cut; the branch trades on its backup ISP while AT&T splices.
{
  const b = HB.fo, c1 = CIR[b.wan[0]], c2 = CIR[b.wan[1]];
  const ago = 192 * MIN, t0 = T0 - ago;
  const inc = buildIncident('circuit', b, ago, { pri: 'P3' });
  inc.signals = [{ t: t0, src: 'Orchestrator', msg: `${c1.id} (${c1.carrier} ${c1.type}) loss 100%, tunnel down`, sev: 'Critical' }, { t: t0 + 4e3, src: 'Orchestrator', msg: `POS, ERP and voice moved to ${c2.id} (${c2.carrier} ${c2.type}) in 4 s`, sev: 'Info' }, { t: t0 + 70e3, src: 'Synthetic', msg: 'POS path test 180 ms via wan2', sev: 'Info' }, { t: t0 + 3 * MIN, src: 'Carrier portal', msg: `${c1.carrier}: fibre cut by third-party excavation; splice crew dispatched`, sev: 'Major' }];
  inc.rca = [{ cause: `${c1.carrier} fibre cut upstream of the demarc`, conf: 0.94, ev: 'Loss 100% both directions; EdgeConnect port up/up; carrier confirms an excavation cut affecting 3 customers' }, { cause: 'NTE fault at the branch', conf: 0.04, ev: 'NTE answers its loopback from the branch side' }];
  inc.conf = 0.94; inc.state = 'On Hold – Carrier';
  INCIDENTS.push(inc);
  c1.status = 'Down'; b.health = 'degraded';
  const cs = { id: caseNo(c1.carrier), carrier: c1.carrier, circuit: c1.id, inc: inc.id, branchId: b.id, opened: t0 + 3 * MIN, status: 'Dispatched – LEC tech', eta: t0 + 5 * HR, lastUpdate: T0 - 25 * MIN, evidence: ['60-min loss graph', 'MTR from EdgeConnect', 'Interface counters', 'Carrier excavation notice'], escal: 0, closed: false };
  inc.carrierCase = cs.id; CARRIER_CASES.push(cs);
  c1.flaps30 = 4; c1.outage30 = Math.round(ago / MIN) + 26;
  HERO_STORY[HERO.failover] = { inc: inc.id, case: cs.id, t0 };
}

// Store 118: last night's AP firmware wave and an unrecorded switch change; handhelds lose DHCP this morning.
{
  const b = HB.chg, sw = `${b.code}-sw01`, ap = DEVICES.find(d => d.branchId === b.id && d.type === 'AP');
  const fwAt = T0 - 15 * HR - 20 * MIN, rssiAt = T0 - 20 * HR, cliAt = T0 - 9 * HR - 20 * MIN, bkAt = T0 - 9 * HR + 14 * MIN, incAt = T0 - 2 * HR - 10 * MIN;
  CHANGES.push({ id: 'CHG0031902', title: 'AP firmware 10.7.1.0 – Wave 2 (Georgia, 96 APs)', type: 'Normal', risk: 'Medium', state: 'Implemented', start: fwAt - 40 * MIN, end: fwAt + 80 * MIN, window: `${hhmm(fwAt - 40 * MIN, b.tz)}–${hhmm(fwAt + 80 * MIN, b.tz)} ET`, scope: 'Southeast', devices: 96, owner: 'Network Eng L3', validation: 'Passed', nac: 'aps/firmware/wave2.yaml', states: ['GA'] });
  CHANGES.push({ id: 'CHG0031898', title: 'SRS-SCAN minimum RSSI -75 → -70 dBm (Central group template)', type: 'Standard', risk: 'Low', state: 'Implemented', start: rssiAt, end: rssiAt + 30 * MIN, window: `${hhmm(rssiAt, b.tz)}–${hhmm(rssiAt + 30 * MIN, b.tz)} ET`, scope: 'Southeast', devices: 214, owner: 'Network Eng L3', validation: 'Passed', nac: 'wireless/templates/srs-scan.yaml' });
  const fwFrom = ap.fw === AP_FW[0] ? AP_FW[1] : ap.fw; ap.fw = AP_FW[0];
  DRIFT.push({ device: sw, branchId: b.id, item: 'DHCP relay on VLAN 30 points to 10.20.5.12 (golden 10.20.5.11)', sev: 'High', since: cliAt, source: 'Manual CLI change (no CHG) – local account "branchtech"' });
  const inc = buildIncident('dhcp', b, T0 - incAt, { pri: 'P3' });
  Object.assign(inc, {
    title: 'Handhelds failing to get an IP on warehouse Wi-Fi (VLAN 30)', cat: 'Config management', ci: sw, state: 'In Progress', assignee: 'Dana W.',
    signals: [{ t: incAt - 6 * MIN, src: 'Aruba Central', msg: 'Clients failing DHCP on SRS-SCAN (17 in 10 min)', sev: 'Major' }, { t: incAt - 2 * MIN, src: 'OpsRamp', msg: `${sw} DHCP relay: no offers from 10.20.5.12`, sev: 'Major' }, { t: incAt, src: 'OpsRamp', msg: 'Readiness probe: DHCP test on VLAN 30 failed', sev: 'Major' }],
    rca: [{ cause: `Unrecorded DHCP relay change on ${sw} (config drift)`, conf: 0.88, ev: 'Relay target changed overnight by a local account with no CHG; wired scanners on VLAN 30 fail too, so Wi-Fi is not the cause' }, { cause: 'AP firmware 10.7.1.0 upgrade last night', conf: 0.07, ev: 'Same firmware runs clean at 95 other Georgia APs; wired clients also affected' }, { cause: 'DHCP scope exhaustion', conf: 0.03, ev: 'Scope 41% used' }],
    conf: 0.88, runbook: 'RB-105', rbState: 'proposed', impact: ['Receiving slower; handhelds cannot connect'], verify: [{ v: 'DHCP offers on VLAN 30', st: 'pending' }, { v: 'Handhelds back on SRS-SCAN', st: 'pending' }],
  });
  inc.agentSteps = [['correlation', 'Grouped 23 events (Central, OpsRamp, branch call) into one incident'], ['diagnosis', `Top cause: unrecorded DHCP relay change on ${sw} (88%); firmware upgrade ruled out`], ['change', 'No approved change covers the relay edit; drift flagged against golden config'], ['runbook', 'Recommends RB-105 roll back to golden; branch open – waiting for approval'], ['comms', 'StoreOps told: receiving handhelds affected, picking OK']].map(([agent, text], i) => ({ agent, text, t: incAt + (i + 1) * 25e3, st: 'done' }));
  INCIDENTS.push(inc); b.health = 'degraded';
  APPROVALS.push({ id: 'APR-2213', type: 'Runbook', title: `RB-105 roll back DHCP relay on ${sw} to golden`, inc: inc.id, branchId: b.id, agent: 'runbook', conf: 0.88, risk: 'Low', created: incAt + 3 * MIN, status: 'Pending', why: ['Branch is open – config change needs a human'], evidence: ['Relay changed at night with no CHG', 'Wired and wireless clients on VLAN 30 both fail', 'Golden config verified on 211 other Southeast switches'], rollback: 'Re-apply the current running config from the 02:00 backup', verify: ['DHCP offers on VLAN 30', 'Handhelds back on SRS-SCAN'] });
  HERO_STORY[HERO.changes] = { inc: inc.id, sw, ap: ap.id, fwFrom, fwAt, rssiAt, cliAt, bkAt, incAt };
}

// Store 309: warehouse AP stopped answering yesterday; a port bounce fixed it with no human touch.
{
  const b = HB.ap, ap = DEVICES.find(d => d.branchId === b.id && d.type === 'AP');
  const t0 = wall(b, 14, 12, 1);
  const inc = buildIncident('apdown', b, T0 - t0, { pri: 'P4' });
  Object.assign(inc, { title: `Warehouse AP offline – ${ap.model}`, ci: ap.id, state: 'Resolved', resolved: t0 + 9 * MIN, acked: t0 + 1 * MIN, assignee: 'Mova iO', closeCode: 'Auto-resolved (zero touch)', rbState: 'done', auto: true, runbook: 'RB-103',
    autoAction: `RB-103 bounced PoE port 1/1/14 on ${b.code}-sw01; ${ap.id} back in 2 m 41 s, 23 handhelds re-associated`, why: 'The AP was already down, so a port bounce could not make it worse – allowed to run on its own',
    signals: [{ t: t0, src: 'Aruba Central', msg: `${ap.id} down`, sev: 'Major' }, { t: t0 + 15e3, src: 'Aruba Central', msg: `PoE port ${b.code}-sw01 1/1/14 drawing 0 W`, sev: 'Minor' }] });
  inc.verify = inc.verify.map(v => ({ ...v, st: 'pass' }));
  RESOLVED.push(inc);
  HERO_STORY[HERO.autoAP] = { inc: inc.id, ap: ap.id, t0 };
}

// Store 45: NetFlow top talkers; cloud camera backup and Windows updates push the line towards its limit.
HERO_STORY[HERO.bandwidth] = {};
PREDICTIONS.push({ id: 'PRD-509', kind: 'Capacity forecast', target: HB.bw.wan[0], branchId: HB.bw.id, conf: 0.85, horizon: '5 weeks', signal: 'WAN p95 81% and rising 1.8%/week as cloud camera backup grows; hits 90% in ~5 weeks', series: [66, 68, 70, 71, 73, 75, 76, 78, 79, 81], status: 'New', suggest: 'Move camera backup after close; then request 500 Mb/s upgrade (approval)' });
PREDICTIONS.push({ id: 'PRD-510', kind: 'Capacity forecast', target: `${HB.chg.code}-ap01`, branchId: HB.chg.id, conf: 0.8, horizon: '7 weeks', signal: 'Warehouse AP airtime 74% at peak after 24 new handhelds; one AP for the whole warehouse; hits 85% in ~7 weeks', series: [48, 51, 53, 55, 58, 61, 64, 68, 71, 74], status: 'New', suggest: 'Add an AP-635 near receiving (approval)' });

// Degraded branches with no open incident still say why (watch level, below the incident threshold).
const WATCH_WHY = ['Wi-Fi retry rate 18% on the warehouse AP', 'EdgeConnect CPU 82% at peak', 'Uplink errors on sw01 below the incident threshold', 'Backup line failed its weekly test; retest booked', 'Payment path 380 ms, close to the 400 ms limit', 'Primary line jitter 22 ms in the evening peak'];
BRANCHES.forEach(b => { if (b.health !== 'up' && !b.why && !INCIDENTS.some(i => i.branchId === b.id && i.state !== 'Resolved')) b.why = WATCH_WHY[b.num % WATCH_WHY.length]; });

// ---------- circuit flaps and monthly availability ----------
{
  const R2 = rng(7707);
  CIRCUITS.forEach(c => { if (c.flaps30 == null) c.flaps30 = c.tickets90 >= 6 ? 3 + (c.tickets90 % 3) : c.tickets90 >= 4 ? 2 : R2() < 0.004 ? R2.int(3, 5) : R2() < 0.06 ? 1 : 0; if (c.outage30 == null) c.outage30 = c.flaps30 * R2.int(2, 9); });
  INCIDENTS.filter(i => i.kind === 'circuit' && i.state !== 'Resolved').forEach(i => { const c = CIR[i.ci]; if (!c) return; c.flaps30 = Math.max(1, c.flaps30); if (c.outage30 < (T0 - i.opened) / MIN) c.outage30 += Math.round((T0 - i.opened) / MIN); });
}
// carrier availability commitment by line type (monthly), and an illustrative monthly charge used for credit estimates
export const LINE_SLA = { MPLS: 0.9995, DIA: 0.9995, Broadband: 0.999, 'LTE/5G': 0.99 };
export const lineMRC = c => ({ MPLS: 9, DIA: 4.2, Broadband: 0.55, 'LTE/5G': 0.6 }[c.type] || 1) * c.bw + 120;
export const availOf = c => 1 - c.outage30 / (30 * 24 * 60);

// ---------- NetFlow top talkers (yesterday) ----------
const NF_APPS = [['Microsoft 365 / OneDrive', 'Business'], ['ERP (order, inventory, invoicing)', 'Business'], ['Windows Update', 'IT'], ['Cloud camera backup', 'Security'], ['Teams video', 'Business'], ['Pricing & quoting API', 'Business'], ['Guest Wi-Fi web and video', 'Guest'], ['Aruba Central / OpsRamp telemetry', 'IT'], ['POS & card payments', 'Business']];
export function netflowOf(b) {
  const R3 = rng(b.num * 131 + 9);
  const c = CIR[b.wan[0]];
  const scale = { S: 0.55, M: 1, L: 1.7 }[b.size];
  let apps = NF_APPS.map(([name, cls], i) => ({ name, cls, gb: +((([14, 9, 6, 7, 5, 3, 6, 1.5, 0.6][i]) * scale) * (0.6 + R3() * 0.8)).toFixed(1) }));
  let clients = [[`${b.code}-nvr01`, 'Camera recorder'], [`bo-pc0${1 + R3.int(0, 8)}`, 'Back-office PC'], [`ctr-pc0${1 + R3.int(0, 5)}`, 'Counter PC'], [`mgr-lt0${1 + R3.int(0, 3)}`, 'Manager laptop'], [`hh-${R3.int(10, 60)}`, 'Handheld scanner'], ['guest-pool', 'Guest Wi-Fi (all)']].map(([name, kind], i) => ({ name, kind, gb: +(([7, 5, 3.5, 3, 0.8, 4][i] * scale * (0.6 + R3() * 0.8))).toFixed(1) }));
  let peak = Math.min(88, Math.round(c.util * 1.25 + R3.int(4, 14))), peakAt = `${9 + R3.int(0, 5)}:00`;
  let note = null;
  if (b.num === HERO.bandwidth) {
    apps = [['Cloud camera backup', 'Security', 41.2], ['Windows Update', 'IT', 22.6], ['Microsoft 365 / OneDrive', 'Business', 14.9], ['ERP (order, inventory, invoicing)', 'Business', 9.8], ['Teams video', 'Business', 6.1], ['Guest Wi-Fi web and video', 'Guest', 5.4], ['Pricing & quoting API', 'Business', 3.2], ['Aruba Central / OpsRamp telemetry', 'IT', 1.4], ['POS & card payments', 'Business', 0.7]].map(([name, cls, gb]) => ({ name, cls, gb }));
    clients = [[`${b.code}-nvr01`, 'Camera recorder', 41.2], ['bo-pc07', 'Back-office PC (Windows Update + OneDrive)', 6.8], ['bo-pc03', 'Back-office PC (Windows Update)', 5.9], ['ctr-pc02', 'Counter PC', 3.4], ['mgr-lt01', 'Manager laptop (Teams)', 2.9], ['guest-pool', 'Guest Wi-Fi (all)', 5.4]].map(([name, kind, gb]) => ({ name, kind, gb }));
    peak = 94; peakAt = '10:00';
    note = 'Camera backup and Windows Update ran during trading hours and took 64% of the line; moving both after 17:00 frees about 60 Mb/s at peak.';
  }
  apps.sort((x, y) => y.gb - x.gb); clients.sort((x, y) => y.gb - x.gb);
  const hours = Array.from({ length: 24 }, (_, h) => { const open = h >= 6 && h < 17; const base = open ? 0.35 + 0.4 * Math.sin((h - 6) / 11 * Math.PI) : 0.06; return Math.min(100, Math.round(base * peak / 0.75 + R3() * 6)); });
  hours[+peakAt.split(':')[0]] = peak;
  return { b, line: c, apps, clients, total: +sum(apps, a => a.gb).toFixed(1), peak, peakAt, hours, note };
}

// ---------- capacity outlook (WAN and Wi-Fi), next 90 days ----------
export function capacityOf(b) {
  const R4 = rng(b.num * 17 + 5);
  const c = CIR[b.wan[0]];
  let wanP95 = Math.min(86, Math.round(c.util * 1.05 + R4.int(4, 16))), wanGrowth = +(0.2 + R4() * 1.0).toFixed(1);
  let wifiPeak = Math.round(34 + R4() * 40 + (b.size === 'L' ? 6 : 0)), wifiGrowth = +(0.1 + R4() * 0.9).toFixed(1);
  const pr = PREDICTIONS.filter(p => p.branchId === b.id && p.kind === 'Capacity forecast');
  const days = (now, g, lim) => now >= lim ? 0 : Math.round((lim - now) / g * 7);
  let wanDays = null, wifiDays = null;
  // a capacity prediction on the Predictive Watchlist sets the numbers, so both screens agree
  pr.forEach(p => {
    const last = p.series[p.series.length - 1], g = +((last - p.series[0]) / (p.series.length - 1)).toFixed(1);
    const h = p.horizon.match(/(\d+)\s*(day|week)/); const hd = h ? +h[1] * (h[2] === 'week' ? 7 : 1) : null;
    if (/-ap\d/.test(p.target)) { wifiPeak = last; wifiGrowth = g; wifiDays = hd; } else { wanP95 = last; wanGrowth = g; wanDays = hd; }
  });
  return { b, line: c, wanP95, wanGrowth, wanDays: wanDays ?? days(wanP95, wanGrowth, 90), wifiPeak, wifiGrowth, wifiDays: wifiDays ?? days(wifiPeak, wifiGrowth, 85), pred: pr.map(p => p.id) };
}

// ---------- mean time to restore by month (hours) ----------
export const MTTR_MONTHS = { months: ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'], P1: [2.6, 2.4, 2.3, 2.1, 1.9, 1.7], P2: [5.2, 5.0, 4.7, 4.4, 4.1, 3.9], P3: [15.8, 15.1, 14.2, 13.4, 12.3, 11.6], target: { P1: 4, P2: 8, P3: 24 } };

// The diagnosis step always names the same top cause and confidence as the ranked causes (some stories replace
// the ranked causes after the incident is built).
[...INCIDENTS, ...RESOLVED].forEach(i => (i.agentSteps || []).forEach(a => { if (a.agent === 'diagnosis' && /^Ranked /.test(a.text) && i.rca && i.rca[0]) a.text = `Ranked ${i.rca.length} causes; top: ${i.rca[0].cause} (${Math.round(i.rca[0].conf * 100)}%)`; }));
