// What every prediction is based on, and how to prevent it. For each prediction on the Predictive Watchlist:
// the data it was built from (which tool, what is measured, how often, how much history), the signals the model
// weighed, how the confidence number is worked out, the past cases it was compared with, what happens if nothing
// is done, and the prevention plan with an owner for each step. Deterministic: seeded by the prediction id.
import * as D from './data.js';
import { rng } from './util.js';

const seed = id => id.split('').reduce((a, c) => a * 31 + c.charCodeAt(0) >>> 0, 7);
const fmtN = n => n.toLocaleString('en-US');

// ── the data the console collects for predictions, across the estate ──
// readings per day = devices or links x samples per day
const per = (n, every) => Math.round(n * 1440 / every);
export const COLLECT = [
  { tool: 'Orchestrator', what: 'Loss, latency and jitter on every WAN path and tunnel', every: 1, unit: 'min', keep: '14 months', n: D.CIRCUITS.length, perDay: per(D.CIRCUITS.length, 1) },
  { tool: 'OpsRamp', what: 'Interface errors, CPU, memory, PSU, fan and temperature (SNMP)', every: 5, unit: 'min', keep: '14 months', n: D.DEVICES.length, perDay: per(D.DEVICES.length, 5) * 6 },
  { tool: 'Aruba Central', what: 'AP reboots, radio temperature, airtime, clients, PoE draw', every: 5, unit: 'min', keep: '13 months', n: D.DEVICES.filter(d => d.type === 'AP').length, perDay: per(D.DEVICES.filter(d => d.type === 'AP').length, 5) * 5 },
  { tool: 'Synthetic', what: 'POS, ERP and weekly backup-path (LTE failover) tests', every: 15, unit: 'min', keep: '14 months', n: D.BRANCHES.length, perDay: per(D.BRANCHES.length, 15) * 2 },
  { tool: 'New Relic', what: 'ERP and cloud app response time from each branch', every: 1, unit: 'min', keep: '8 days raw, 13 months hourly', n: D.BRANCHES.length, perDay: per(D.BRANCHES.length, 1) },
  { tool: 'ServiceNow', what: 'Incidents, changes, closure codes and fixes (what really happened)', every: 0, unit: 'on change', keep: '3 years', n: 0, perDay: 520 },
  { tool: 'Carrier portals', what: 'Carrier tickets, planned works and outage notices', every: 0, unit: 'on change', keep: '2 years', n: 0, perDay: 140 },
  { tool: 'Weather feed', what: 'Storm, heat and hail warnings by branch location', every: 60, unit: 'min', keep: '2 years', n: D.BRANCHES.length, perDay: per(D.BRANCHES.length, 60) },
];
export const READINGS_PER_DAY = COLLECT.reduce((a, c) => a + c.perDay, 0);

// ── how a prediction is made, for the page-level pipeline card ──
export const PIPELINE = [
  { k: 'collect', label: 'Collect', text: `${fmtN(Math.round(READINGS_PER_DAY / 1e6 * 10) / 10)} million readings a day from 8 sources, kept 13 to 14 months` },
  { k: 'baseline', label: 'Clean and baseline', text: 'Gaps filled, maintenance windows removed, a normal range learned for every link and device by hour and weekday' },
  { k: 'features', label: 'Signals', text: 'Trends, drift from the normal range, repeat tickets, heat, firmware age, weather and season' },
  { k: 'model', label: 'Models', text: 'Trend projection for capacity; a failure classifier trained on past incidents for circuits, APs, switches and backup paths' },
  { k: 'predict', label: 'Prediction', text: 'What will fail, when, and how sure, compared with the past cases that looked the same' },
  { k: 'prevent', label: 'Prevent', text: 'A watch or an approved action, done after branch close or in a change window' },
  { k: 'learn', label: 'Learn', text: 'Every outcome (it failed, it was prevented, false alarm) goes back into the model each week' },
];

const BR = id => id && D.BR[id];
const slopeOf = s => (s[s.length - 1] - s[0]) / (s.length - 1);

// ── per kind: where the data came from, what was weighed, and how to prevent it ──
function circuit(p, R) {
  const c = D.CIRCUITS.find(x => x.id === p.target), b = BR(p.branchId), backup = b && D.CIRCUITS.find(x => x.id === b.wan[1]);
  const loss = /loss/i.test(p.signal);
  const m = p.signal.match(/(\d+) tickets/), t90 = m ? +m[1] : c ? c.tickets90 : 0;
  const past = 20 + Math.floor(R() * 18), failed = Math.round(past * p.conf);
  return {
    question: `Will ${p.target} go down or become unusable in the next ${p.horizon}?`,
    sources: [
      ['Orchestrator', `${loss ? 'Packet loss' : 'Latency'}, jitter and loss on this circuit every minute`, '1 min', '14 days', 14 * 1440],
      ['OpsRamp', 'Interface errors and flaps on the EdgeConnect WAN port', '5 min', '14 days', 14 * 288 * 2],
      ['ServiceNow', `Tickets on this line (${t90} in 90 days) and every circuit-down incident across the estate, to learn from`, 'on change', '3 years', 1400 + Math.floor(R() * 300)],
      ['Carrier portal', `${c ? c.carrier : 'Carrier'} tickets and planned works for this line`, 'on change', '2 years', 3 + Math.floor(R() * 6)],
    ],
    features: [
      [loss ? 'Packet loss trend' : 'Latency drift from normal', loss ? `${p.series[0]}% rising to ${p.series[p.series.length - 1]}%` : `+${Math.round(p.series[p.series.length - 1] - p.series[0])} ms above its normal range`, 0.38],
      ['Evening peaks', 'Worse every evening, the same pattern as past carrier faults', 0.21],
      t90 >= 3 ? ['Repeat offender', `${t90} tickets in 90 days, ${c ? c.flaps30 : 0} flaps in 30 days`, 0.19] : ['Ticket history', `${t90} tickets in 90 days, so this is new wear on the line, not a known bad line`, 0.08],
      ['Carrier segment', `Other ${c ? c.carrier : ''} lines in the area are clean, so it is this access link`, 0.12],
      ['Season', 'Storm season raises line faults in this region', 0.1],
    ],
    method: 'Failure classifier trained on 14 months of circuit history: every circuit-down incident and the 10 days before it',
    why: `${failed} of ${past} circuits that showed this pattern went down within ${p.horizon}`,
    past, failed, lead: '2 to 4 days',
    ifNothing: `The line goes down while the branch is open. ${backup ? `The branch moves to ${backup.type} backup` : 'The branch moves to backup'}: card payments keep working but the ERP is slower and the camera upload stops. A carrier case opened then takes 4 to 24 hours.`,
    prevent: [
      ['Open a proactive carrier case with the 10-day loss and latency evidence', 'Movate carrier management', 'Today', 'carrier'],
      ['Move card payments and ERP to the backup path before opening if loss passes 1%', 'Mova iO (RB-101, approved)', 'Before opening', 'runbook'],
      ['Check the backup path passes its failover test', 'Mova iO (synthetic test)', 'Tonight', 'test'],
      ['Return to the primary after 30 clean minutes once the carrier fixes it', 'Movate NOC L2', 'After the fix', 'verify'],
    ],
    saves: 'One circuit-down incident avoided, about 3 hours of slower ERP at the counter',
  };
}
function ap(p, R) {
  const dev = D.DEVICES.find(d => d.id === p.target);
  const heat = /temp|heat/i.test(p.signal);
  const past = 30 + Math.floor(R() * 25), failed = Math.round(past * p.conf);
  return {
    question: `Will access point ${p.target} fail in the next ${p.horizon}?`,
    sources: [
      ['Aruba Central', 'Reboots, radio temperature, uptime and clients for this AP', '5 min', '30 days', 30 * 288 * 4],
      ['OpsRamp', 'PoE draw, renegotiations and errors on the switch port', '5 min', '30 days', 30 * 288 * 2],
      ['ServiceNow', 'Past AP replacements of the same model', 'on change', '3 years', 140 + Math.floor(R() * 60)],
      ['Weather feed', 'Midday temperature at the branch', '60 min', '30 days', 30 * 24],
    ],
    features: [
      ['Reboots rising', `${p.series[p.series.length - 1]} a day now, from ${p.series[0]} ten days ago`, 0.34],
      [heat ? 'Radio temperature' : 'Ethernet and PoE errors', heat ? '71 °C at midday, normal is under 60 °C' : 'PoE renegotiates about twice a day', 0.27],
      ['Location', `${dev ? dev.role : 'Yard'} AP, outdoors in sun and weather`, 0.16],
      ['Model and age', dev ? `${dev.model}, firmware ${dev.fw}` : 'Same model as past failures', 0.13],
      ['Same model failures', 'This model failed the same way at other branches', 0.1],
    ],
    method: 'Failure classifier trained on every AP replacement in 3 years and the 30 days of readings before each one',
    why: `${failed} of ${past} access points with this pattern failed within ${p.horizon}`,
    past, failed, lead: '5 to 9 days',
    ifNothing: 'The AP fails during the day. Handheld scanners in that area lose Wi-Fi, so yard staff and drivers work on paper until a technician swaps it, usually the next day.',
    prevent: [
      ['Reserve a spare AP from the nearest depot', 'Movate NOC L1', 'Today', 'part'],
      ['Book the swap after branch close with SRS field services', 'Movate NOC L1', 'This week', 'visit'],
      ['Move clients to the neighbour APs and raise their power during the swap', 'Mova iO (RB-104, approved)', 'During the swap', 'runbook'],
      ['Check clients come back and the new AP stays up for 24 hours', 'Mova iO', 'After the swap', 'verify'],
    ],
    saves: 'One AP-down incident in opening hours avoided, and a same-day visit avoided',
  };
}
function sw(p, R) {
  const past = 18 + Math.floor(R() * 14), failed = Math.round(past * p.conf);
  return {
    question: `Will switch ${p.target} fail in the next ${p.horizon}?`,
    sources: [
      ['OpsRamp', 'PSU state, fan speed and chassis temperature (SNMP)', '5 min', '30 days', 30 * 288 * 3],
      ['OpsRamp', 'Port errors and CPU', '5 min', '30 days', 30 * 288 * 2],
      ['ServiceNow', 'Past PSU and switch replacements for the same model', 'on change', '3 years', 60 + Math.floor(R() * 30)],
    ],
    features: [
      ['Chassis temperature', `${p.series[0]} °C to ${p.series[p.series.length - 1]} °C in 10 days`, 0.36],
      ['Fan speed falling', 'PSU fan speed down about 18%', 0.3],
      ['Closet', 'Small closet, no cooling, summer heat', 0.18],
      ['Age and warranty', 'Same model and age as past PSU failures', 0.16],
    ],
    method: 'Failure classifier trained on every switch and PSU replacement in 3 years and the 30 days of readings before each one',
    why: `${failed} of ${past} switches with this pattern lost a PSU within ${p.horizon}`,
    past, failed, lead: '1 to 3 weeks',
    ifNothing: 'The PSU fails and the switch goes down. Everything wired at the branch stops (counter PCs, printers, the APs it powers) until a part is shipped and fitted.',
    prevent: [
      ['Order a spare PSU under the HPE support contract', 'Movate NOC L1', 'Today', 'vendor'],
      ['Plan the swap in the next change window after branch close', 'Movate Network SME', 'Next window', 'change'],
      ['Ask the branch to clear the closet vents and check the room', 'SRS Store Ops', 'This week', 'notify'],
      ['Check temperature and fan speed are back in range for 48 hours', 'Mova iO', 'After the swap', 'verify'],
    ],
    saves: 'One branch-wide LAN outage avoided',
  };
}
function capacity(p, R) {
  const s = p.series, sl = slopeOf(s), last = s[s.length - 1];
  const pool = !p.branchId, airtime = /ap\d/.test(p.target);
  const limit = pool ? 100 : airtime ? 85 : 90;
  return {
    question: pool ? `Will the pooled LTE data plan run out this month?` : airtime ? `When will ${p.target} run out of Wi-Fi airtime at peak?` : `When will ${p.target} reach ${limit}% at peak?`,
    sources: pool ? [
      ['Carrier portal', 'Pooled LTE usage across every backup SIM', 'daily', '2 years', 730],
      ['Orchestrator', 'Time each branch spent on backup and data used', '1 min', '30 days', 30 * 1440 * 40],
      ['ServiceNow', 'Circuit-down incidents that put branches on backup', 'on change', '3 years', 410 + Math.floor(R() * 80)],
    ] : airtime ? [
      ['Aruba Central', 'Airtime use, clients and retries on every radio', '5 min', '10 weeks', 70 * 288 * 2],
      ['ServiceNow', 'Devices added at the branch (handheld rollout)', 'on change', '3 years', 24],
    ] : [
      ['Orchestrator', 'Bandwidth use on the primary circuit, 95th percentile per hour', '1 min', '10 weeks', 70 * 1440],
      ['New Relic', 'Which apps use the bandwidth (camera backup, ERP, voice)', '1 min', '10 weeks', 70 * 24],
      ['ServiceNow', 'Past upgrades and their lead time', 'on change', '3 years', 30 + Math.floor(R() * 20)],
    ],
    features: [
      pool ? ['Use so far this month', `${last}% of the plan used, up about ${Math.round(sl)} points between readings`, 0.45] : ['Growth per week', `+${sl.toFixed(1)} points a week for 10 weeks`, 0.45],
      ['Peak, not average', 'Uses the 95th percentile at the busiest hour, so short spikes count', 0.2],
      [pool ? 'Long failovers' : airtime ? 'New devices' : 'What is growing', pool ? '3 long failovers this month' : airtime ? '24 new handhelds on one AP' : 'Cloud camera backup grows every week', 0.2],
      ['Season', 'Busy season and storms raise use', 0.15],
    ],
    method: pool ? "Trend projection: a straight line through this month's daily use, with a range that widens the further it looks ahead" : 'Trend projection: a straight line through 10 weeks of peak use, with a range that widens the further it looks ahead',
    why: `At this rate it reaches ${limit}% within ${p.horizon}; the growth has held steady${pool ? ' all month' : ' for 10 weeks'} with little scatter, which gives ${Math.round(p.conf * 100)}% confidence`,
    past: 0, failed: 0, lead: p.horizon, limit,
    ifNothing: pool ? 'The plan runs out. Branches that fail over to LTE are slowed by the carrier, so card payments time out during the next outage.' : airtime ? 'Scanners slow down and drop at peak in the warehouse; receiving and picking slow down.' : 'At peak hours, card payments and the ERP slow down at the counter and the camera backup falls behind.',
    prevent: pool ? [
      ['Raise a plan uplift with the carrier for this month', 'Movate carrier management', 'This week', 'carrier'],
      ['Fix the circuits causing the long failovers', 'Movate NOC L2', 'This week', 'inc'],
      ['Alert when any branch stays on backup for more than 4 hours', 'Mova iO', 'Now', 'watch'],
    ] : airtime ? [
      ['Add an AP-635 near receiving', 'Movate Network SME', 'Next window', 'change'],
      ['Move older handhelds to 2.4 GHz until then', 'Mova iO (RB-104, approved)', 'Tonight', 'runbook'],
      ['Check airtime stays under 70% at peak', 'Mova iO', 'After the change', 'verify'],
    ] : [
      ['Move the camera backup to after branch close', 'Mova iO (SD-WAN policy, approved)', 'Tonight', 'runbook'],
      ['Request a bandwidth upgrade from the carrier', 'Movate carrier management', 'This week', 'carrier'],
      ['Check peak use stays under 80% for 2 weeks', 'Mova iO', 'After the change', 'verify'],
    ],
    saves: pool ? 'No branch slowed on backup this month' : 'Peak use stays under the limit until the upgrade lands',
  };
}
function backup(p, R) {
  const past = 14 + Math.floor(R() * 10), failed = Math.round(past * p.conf);
  return {
    question: `Will the backup path at this branch fail when it is needed?`,
    sources: [
      ['Synthetic', 'Weekly failover test: speed and loss on the LTE backup', 'weekly', '10 weeks', 10],
      ['Orchestrator', 'LTE signal strength and quality every minute', '1 min', '30 days', 30 * 1440],
      ['ServiceNow', 'Past antenna and SIM fixes at other branches', 'on change', '3 years', 90 + Math.floor(R() * 40)],
    ],
    features: [
      ['Failover test speed', `${p.series[0]} to ${p.series[p.series.length - 1]} Mb/s in 10 weeks`, 0.48],
      ['Signal quality', 'Signal quality falling, the same as past antenna faults', 0.3],
      ['Primary line risk', 'Primary line has had tickets this quarter, so the backup will be needed', 0.22],
    ],
    method: 'Failure classifier trained on every backup-path fault in 3 years and the weekly tests before each one',
    why: `${failed} of ${past} backup links with this pattern could not carry the branch when the primary failed`,
    past, failed, lead: '2 to 6 weeks',
    ifNothing: 'The next time the primary line fails, the backup is too slow to carry the branch. Card payments time out and the branch is effectively offline.',
    prevent: [
      ['Replace the LTE antenna and cable', 'SRS field services, booked by Movate', 'This week', 'visit'],
      ['Re-run the failover test after the fix', 'Mova iO (synthetic test)', 'After the visit', 'test'],
      ['Alert if the weekly test drops under 25 Mb/s again', 'Mova iO', 'Now', 'watch'],
    ],
    saves: 'The backup is ready the next time the primary fails',
  };
}

export function basisOf(p) {
  const R = rng(seed(p.id));
  const f = p.kind === 'Degrading circuit' ? circuit : p.kind === 'AP failure risk' ? ap : p.kind === 'Switch failure risk' ? sw : p.kind === 'Backup path risk' ? backup : capacity;
  const x = f(p, R);
  const readings = x.sources.reduce((a, s) => a + s[4], 0);
  return { ...x, readings, sources: x.sources.map(([tool, what, every, window, n]) => ({ tool, what, every, window, n })), features: x.features.map(([name, value, w]) => ({ name, value, w })), prevent: x.prevent.map(([step, owner, when, kind]) => ({ step, owner, when, kind })) };
}
// a one-line summary for the card
export function basisLine(p) {
  const x = basisOf(p);
  const tools = [...new Set(x.sources.map(s => s.tool))];
  return `${fmtN(x.readings)} readings from ${tools.join(', ')}${x.past ? `, compared with ${x.past} past cases` : ', 10-week trend'}`;
}
