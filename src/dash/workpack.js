// The onsite work pack: Mova iO assembles one for every field visit so the technician arrives prepared instead of
// starting the investigation again. It joins OpsRamp findings, the ServiceNow CMDB and incident history, Orchestrator
// and Aruba Central, the carrier case and the Dispatch Agent's booking into six parts: site context, before arrival,
// diagnostic history, the approved checklist, evidence capture, and the return-to-service check and hand-off. The
// technician works it on site; the NOC owner accepts the hand-off. Progress lives on the work order.
import * as D from '../data.js';
import { circuitOf, healthOf, branchClock } from '../store.jsx';
import { rootOf, faultPath } from './drilldata.js';
import { MIN, DAY, hhmm, dt } from '../util.js';

const pick = (b, arr) => arr[(b.num * 7 + 3) % arr.length];
const portOf = inc => { const m = (inc.signals || []).map(x => x.msg).join(' ').match(/1\/1\/\d+/); return m ? m[0] : null; };
const where = (b, d) => d.type === 'AP' ? ({ 'Outdoor yard': 'Yard pole', Warehouse: 'Warehouse aisles', 'Loading docks': 'Loading docks', Counter: 'Sales counter', 'Back office': 'Back office ceiling' }[d.role] || d.role) : 'IT closet rack';

// what the visit is for, in a few words, by the kind of fault
const SERVICE = {
  edgedown: 'SD-WAN appliance swap', crc: 'Uplink optic and patch lead', apdown: 'Access point power and cabling', scanner: 'Warehouse Wi-Fi survey',
  lte: 'Backup LTE router', cpu: 'Remove a looped desk switch', circuit: 'Carrier repair at the demarc', jitter: 'Carrier check at the demarc', pos: 'Carrier check at the demarc',
};
const TOOLS = {
  'EdgeConnect swap': ['Console cable and laptop', 'Cable labels', 'Anti-static strap'],
  'Aruba switching': ['Optical cleaning kit', 'Light meter', 'Spare LC patch lead'],
  'Aruba wireless': ['Cable tester', 'PoE tester', 'Wi-Fi survey kit'],
  'Low-voltage cabling': ['Cable tester and tone probe', 'RJ45 crimp kit', 'Spare patch leads'],
  'Outdoor AP / lift': ['Lift or ladder rated for the pole', 'Harness', 'Weatherproof boots for the RJ45'],
  'LTE / cellular': ['SIM tool', 'Antenna cable tester'],
  'Rack and closet': ['Rack screws and cage nuts', 'Power strip', 'Cable ties'],
};

// the approved steps for each kind of visit, and the readings that prove the fix
function stepsFor(inc, b, wo) {
  const k = inc && inc.kind, ci = inc && inc.ci, port = inc && portOf(inc);
  const ap = inc && D.DEV[ci], yard = ap && ap.role === 'Outdoor yard';
  const checkIn = `Check in with the branch manager at the counter and confirm the visit window`;
  switch (k) {
    case 'edgedown': return {
      steps: [checkIn, 'Photograph the rack, the cabling and both modem lights before touching anything', 'Confirm both modems show line sync (the lines are up at the modems)', `Label and unplug the cables from ${ci}; remove the faulty unit`, 'Rack the spare EC-XS and re-cable to the same ports (WAN1, WAN2, LAN)', 'Power on; Mova iO watches the zero-touch profile load from Orchestrator (about 6 minutes). Do not configure anything on site', 'Wait for the NOC to confirm tunnels up and a test payment passes', 'Pack the faulty unit with the HPE RMA label'],
      photos: ['Rack and cabling before', 'Modem lights', 'New appliance cabled', 'Faulty unit serial label'],
      readings: [{ key: 'serial', label: 'Spare appliance serial', kind: 'text' }, { key: 'checkin', label: 'Minutes to Orchestrator check-in', unit: 'min', lo: 1, hi: 15 }],
    };
    case 'crc': return {
      steps: [checkIn, 'Photograph uplink 1/1/49 and its patch lead', 'Wait for the NOC to take 1/1/49 out of the link pair (the go-ahead shows here)', 'Clean and inspect the connectors; replace the SFP+ optic with the spare', 'Replace the patch lead', 'Read the light level on both ends', 'NOC puts the link back in the pair; watch the error counter for 10 minutes', 'Bag the old optic for return'],
      photos: ['Port and patch lead before', 'New optic seated', 'Light meter reading'],
      readings: [{ key: 'rx', label: 'Light level after the swap', unit: 'dBm', lo: -7, hi: -1 }, { key: 'crc', label: 'Errors in 10 minutes', unit: 'errors', lo: 0, hi: 0 }],
    };
    case 'apdown': return {
      steps: [checkIn, yard ? 'Set up the lift with a spotter; keep clear of forklifts in the yard' : `Find ${ci} (${where(b, ap || { type: 'AP', role: '' }).toLowerCase()}) and its switch port ${port || ''}`.trim(), `Test the cable from switch port ${port || 'on sw01'} to the AP with the cable tester`, 'If the cable fails, re-terminate both ends; if it passes, swap the AP for the spare (it joins Aruba Central by itself)', 'Read the power draw on the switch port', 'Confirm the AP is online and handhelds re-join', 'Bring the faulty AP back for return if it was swapped'],
      photos: ['AP and cable before', 'Cable tester result', 'AP online after the fix'],
      readings: [{ key: 'poe', label: 'Power draw on the port', unit: 'W', lo: 6, hi: 25 }, { key: 'cable', label: 'Cable test', kind: 'pass' }],
    };
    case 'scanner': return {
      steps: [checkIn, 'Walk aisles 1 to 8 with the survey kit during a quiet hour', 'Mark the weakest spots on the floor plan', 'Send the survey to the Wi-Fi SME; move or add an AP only if the SME approves it here', 'Re-test the weakest aisle'],
      photos: ['Survey heat map', 'Weakest aisle'],
      readings: [{ key: 'rssi', label: 'Weakest aisle signal after the fix', unit: 'dBm', lo: -67, hi: -30 }],
    };
    case 'lte': return {
      steps: [checkIn, 'Check the SIM is seated and the status lights', 'Swap the LTE router for the spare', 'Check the antenna cable and its mounting', 'Ask the NOC to run the failover test'],
      photos: ['Router and antenna before', 'New router lights'],
      readings: [{ key: 'rsrp', label: 'LTE signal (RSRP)', unit: 'dBm', lo: -100, hi: -60 }],
    };
    case 'cpu': return {
      steps: [checkIn, 'Find the unmanaged switch at back office desk 4', 'Unplug it and re-patch the two wall ports (1/1/17 and 1/1/18) to the desk phone and PC only', 'Label the ports "no switches"', 'Ask the NOC to re-enable the blocked port'],
      photos: ['Desk switch found', 'Ports re-patched and labelled'],
      readings: [{ key: 'bcast', label: 'Broadcast rate after the fix', unit: 'pps', lo: 0, hi: 1000 }],
    };
    case 'circuit': case 'jitter': case 'pos': return {
      steps: [checkIn, 'Meet the carrier technician and show them the demarc', 'Photograph the NTE box and its lights', 'Witness the carrier loopback test', 'Check the inside wiring from the NTE to the SD-WAN appliance', 'Ask the NOC to confirm the line is clean'],
      photos: ['NTE box and lights', 'Inside wiring'],
      readings: [{ key: 'loop', label: 'Carrier loopback test', kind: 'pass' }],
    };
    default:
      if (!inc) return {
        steps: [checkIn, 'Rack the equipment in the IT closet', 'Cable it as the install sheet shows', 'Power on', 'Ask the NOC to confirm it is reachable remotely', 'Label the cables'],
        photos: ['Rack before', 'Installed and cabled'], readings: [{ key: 'reach', label: 'Reachable from the NOC', kind: 'pass' }],
      };
      return {
        steps: [checkIn, `Find ${ci} and photograph it`, 'Check power, cabling and status lights', 'Swap it for the spare if it is faulty', 'Ask the NOC to confirm it is back online'],
        photos: ['Device before', 'Device after'], readings: [{ key: 'online', label: 'Back online in Central', kind: 'pass' }],
      };
  }
}

export const readingOk = (r, v) => v == null || v === '' ? null : r.kind === 'text' ? String(v).trim().length > 3 : r.kind === 'pass' ? v === 'Pass' : (+v >= r.lo && +v <= r.hi);

export function packOf(s, wo, now) {
  const b = D.BR[wo.branchId];
  const inc = wo.inc ? [...s.incidents, ...s.resolved].find(i => i.id === wo.inc) : null;
  const tech = wo.tech && s.techs.find(t => t.id === wo.tech);
  const clk = branchClock(b, now);
  const p = circuitOf(s, b.wan[0]), sc = circuitOf(s, b.wan[1]);
  const devs = D.devicesOf(b.id);
  const path = inc ? Object.fromEntries(faultPath(s, inc).map(x => [x.id, x.st])) : {};
  const r = inc && rootOf(inc);
  const ciType = inc && D.DEV[inc.ci] ? D.DEV[inc.ci].type : null;
  const pk = wo.pack || {};
  const plan = stepsFor(inc, b, wo);
  const owner = inc ? inc.assignee : null, team = inc && D.teamOf(inc.group);
  const approval = inc && (inc.trail || []).find(x => x.route === 'field');
  const depot = wo.depot && s.depots.find(d => d.id === wo.depot);
  const status = inc ? (inc.state === 'Resolved' ? 'Fixed' : healthOf(s, b) === 'down' ? 'Branch offline' : inc.carrierCase ? 'Carrier repair open' : inc.state) : 'Planned work';
  const service = inc ? (SERVICE[inc.kind] || inc.title) : wo.task;
  const key = [
    devs.find(d => d.type === 'SD-WAN'), devs.find(d => d.type === 'Switch'),
    inc && D.DEV[inc.ci] && D.DEV[inc.ci].type === 'AP' ? D.DEV[inc.ci] : devs.find(d => d.type === 'AP'),
    inc && D.DEV[inc.ci] && !['SD-WAN', 'AP'].includes(D.DEV[inc.ci].type) && D.DEV[inc.ci].id !== (devs.find(d => d.type === 'Switch') || {}).id ? D.DEV[inc.ci] : null,
  ].filter(Boolean);
  const prior = inc ? s.resolved.filter(x => x.branchId === b.id && x.id !== inc.id && x.opened >= now - 90 * DAY).sort((a, c) => c.opened - a.opened).slice(0, 5) : [];
  const cs = inc && inc.carrierCase && s.cases.find(c => c.id === inc.carrierCase);
  const done = Object.keys(pk.steps || {}).length;
  const ev = (pk.photos || []).length + Object.values(pk.readings || {}).filter(v => v !== '' && v != null).length + (pk.findings ? 1 : 0);
  return {
    b, inc, tech, clk, owner, team, status, service, depot, plan, pk, done, ev,
    head: `${b.name.replace(/ – .*/, '')} · Onsite work pack`, sub: `${service} · ${status}`,
    site: [
      ['Site', `${b.name}, ${b.brand}`], ['Local time', `${clk.local}, ${clk.open ? 'open and trading' : 'closed'}`], ['Hours', `${b.hours.open}–${b.hours.close}${b.hours.sat ? `, Sat ${b.hours.sat}` : ''}`],
      ['Circuit ID', `${p.cid} (${p.carrier} ${p.type}, ${p.bw} Mb/s) from CMDB`], ['Backup circuit', `${sc.cid} (${sc.carrier} ${sc.type})`],
      ['Demarc', pick(b, ['IT closet, back wall', 'Comms cabinet by the receiving door', 'Back office, next to the electrical panel', 'IT closet, left of the rack'])],
      ['Service', service], ['Status', status],
    ],
    path: [
      { label: 'Circuit', st: path.wan1 || 'ok' }, { label: 'Appliance', st: path.edge || 'ok' }, { label: 'Switch', st: ciType === 'Switch' && path.lan && path.lan !== 'ok' ? (path.lan === 'fixed' ? 'fixed' : 'bad') : 'ok' }, { label: 'AP', st: ciType === 'AP' && path.lan && path.lan !== 'ok' ? (path.lan === 'fixed' ? 'fixed' : 'bad') : 'ok' },
    ],
    devices: key.map(d => ({ id: d.id, kind: d.type === 'SD-WAN' ? 'SD-WAN appliance' : d.type === 'AP' ? 'Access point' : 'Switch', model: d.type === 'SD-WAN' ? 'EdgeConnect EC-XS' : `Aruba ${d.model}`, serial: d.serial, where: where(b, d), fault: inc && d.id === inc.ci })),
    before: {
      access: [`Authorised by the branch manager for ${!wo.window || wo.window === 'Any time' ? 'any time today' : wo.window.replace(/^Now/, 'now')}`, 'Sign in at the sales counter; no badge needed', b.yard ? 'Hi-vis vest in the yard; forklifts have right of way' : 'Showroom open to customers: keep cables clear of walkways', clk.open ? 'Branch is trading: tell the counter before anything is unplugged' : 'Branch is closed: the manager meets you at the side door'],
      appointment: [['Window', wo.window || '—'], ['Technician', tech ? `${tech.name} (${tech.base})` : 'not yet assigned'], ['Arrives', wo.eta ? `${hhmm(wo.eta, b.tz)} local` : '—']],
      parts: wo.parts.map(x => ({ part: x, qty: 1, from: depot ? depot.city.split(',')[0] : 'Nearest depot', reserved: !!depot })),
      tools: [...new Set(wo.skills.flatMap(k => TOOLS[k] || []))],
    },
    history: inc ? {
      findings: inc.signals.map(x => ({ t: x.t, src: x.src, text: x.msg, sev: x.sev })),
      cause: r.top, causes: r.causes,
      tried: [
        inc.runbook && D.RB[inc.runbook] && ['done', 'failed', 'rolled back'].includes(inc.rbState) && `Mova iO ran ${inc.runbook} ${D.RB[inc.runbook].name}: ${inc.rbState === 'rolled back' ? 'rolled back' : 'it did not fix the fault'}`,
        cs && `Carrier case ${cs.id} with ${cs.carrier}: ${cs.status.toLowerCase()}`,
        inc.vendorCase && `HPE case ${inc.vendorCase}: replacement unit on its way`,
      ].filter(Boolean),
      prior,
    } : null,
    scope: { by: approval ? approval.by : owner ? `${owner}${team ? ` (${team.name})` : ''}` : 'the NOC', at: approval ? approval.t : wo.created },
    verify: inc ? inc.verify.map(v => v.v) : ['Reachable from the NOC', 'Config backed up'],
    brief: inc ? briefOf(s, inc, { task: wo.task, skills: wo.skills, parts: wo.parts }) : null,
  };
}

// ---------- what happens on site: progress is saved on the work order ----------
const upPack = (act, wo, f) => act.upd('workOrders', wo.id, x => ({ pack: f({ steps: {}, photos: [], readings: {}, ...(x.pack || {}) }) }));
export const tickStep = (act, wo, i, who) => { if (['Assigned', 'Dispatched', 'En route', 'Scheduled'].includes(wo.status)) act.upd('workOrders', wo.id, { status: 'On site' }); upPack(act, wo, p => { const st = { ...p.steps }; if (st[i]) delete st[i]; else st[i] = { t: Date.now(), by: who }; return { ...p, steps: st }; }); };
export const addPhoto = (act, wo, label) => upPack(act, wo, p => ({ ...p, photos: [...p.photos.filter(x => x.label !== label), { label, t: Date.now() }] }));
export const setReading = (act, wo, key, v) => upPack(act, wo, p => ({ ...p, readings: { ...p.readings, [key]: v } }));
export const setFindings = (act, wo, v) => upPack(act, wo, p => ({ ...p, findings: v }));

// the Verification Agent's return-to-service check: every step done, the readings in range, the photos taken
export function returnCheck(act, s, wo, pack) {
  const { plan, pk } = pack, now = Date.now();
  const missing = [];
  plan.steps.forEach((x, i) => { if (!(pk.steps || {})[i]) missing.push(`Step ${i + 1} not ticked`); });
  plan.readings.forEach(r => { const ok = readingOk(r, (pk.readings || {})[r.key]); if (ok !== true) missing.push(ok === false ? `${r.label} out of range` : `${r.label} not recorded`); });
  if ((pk.photos || []).length < Math.min(2, plan.photos.length)) missing.push('Photos missing');
  const checks = pack.verify.map(v => ({ v, st: missing.length ? 'wait' : 'pass' }));
  upPack(act, wo, p => ({ ...p, check: { t: now, pass: !missing.length, missing, checks } }));
  if (pack.inc) act.upd(pack.inc.state === 'Resolved' ? 'resolved' : 'incidents', pack.inc.id, x => ({
    agentSteps: [...x.agentSteps, { agent: 'verify', t: now, text: missing.length ? `Return-to-service check on ${wo.id} not passed: ${missing.join('; ')}` : `Return-to-service check on ${wo.id} passed: ${pack.verify.join(', ')}`, st: 'done' }],
    ...(missing.length ? {} : { verify: x.verify.map(v => ({ ...v, st: 'pass', val: v.val || 'OK' })) }),
  }));
  act.audit(`Return-to-service check on ${wo.id}: ${missing.length ? 'not passed' : 'passed'}`, wo.inc || wo.id, 'Verification Agent');
  act.toast(missing.length ? `Return check not passed: ${missing[0]}` : 'Mova iO: return-to-service check passed', missing.length ? 'warn' : 'ok');
}

// the receiving owner accepts: the work order closes, the technician is free, and the incident resolves
const CLOSE = { edgedown: 'Hardware replaced', crc: 'Hardware replaced', apdown: 'Hardware replaced', lte: 'Hardware replaced', cpu: 'Customer-caused', circuit: 'Carrier / LEC', jitter: 'Carrier / LEC', pos: 'Carrier / LEC', scanner: 'Config change' };
export function acceptHandoff(act, s, wo, pack) {
  const now = Date.now(), me = act.me(), inc = pack.inc;
  const onBehalf = inc && inc.assignee && me.indexOf(inc.assignee) !== 0 ? inc.assignee : null;
  upPack(act, wo, p => ({ ...p, accepted: { t: now, by: me, for: onBehalf } }));
  act.upd('workOrders', wo.id, { status: 'Completed', done: now });
  if (wo.tech) act.upd('techs', wo.tech, { status: 'Available' });
  act.audit(`Accepted the hand-off of ${wo.id}`, wo.inc || wo.id);
  if (inc && inc.state !== 'Resolved') {
    const code = CLOSE[inc.kind] || 'Hardware replaced';
    const closed = { ...inc, state: 'Resolved', resolved: now, closeCode: code, verify: inc.verify.map(v => ({ ...v, st: 'pass', val: v.val || 'OK' })),
      notes: [...inc.notes, { t: now, who: me, text: `Accepted the field hand-off on ${wo.id}: return-to-service check passed, evidence on the work order. Resolved (${code}).` }],
      trail: [...(inc.trail || []), { t: now, who: 'Verification Agent', by: me, text: `Return check passed; ${me.replace(/ \(.*/, '')} accepted the hand-off and resolved it`, route: 'field' }],
      agentSteps: [...inc.agentSteps, { agent: 'ticket', t: now, text: `${wo.id} closed with photos, readings and findings attached; incident resolved (${code})`, st: 'done' }] };
    act.del('incidents', inc.id); act.add('resolved', closed);
    if (!s.incidents.some(i => i.id !== inc.id && i.branchId === inc.branchId && i.state !== 'Resolved')) act.map('branchHealth', inc.branchId, 'up');
    act.audit(`Resolved ${inc.id} (${code}) after the field visit`, inc.id);
  }
  act.toast(`${wo.id} accepted${inc ? ` and ${inc.id} resolved` : ''}`);
}

// ---------- Mova iO's summary for the technician ----------
// What the fault probably is, what Mova iO already checked and tried remotely (and what that showed), and from that
// the fix to carry out on site and what to bring: the replacement part, anything to bring in case, and the tools.
const FIX = {
  edgedown: (inc, c2) => ({ fix: 'Swap the SD-WAN appliance for the spare EC-XS. Its zero-touch profile is already bound to the site, so it loads its settings by itself', ifNot: 'If the spare does not check in either, check the power feed and the LAN cable to the switch, then call the NOC before anything else', extra: ['Two Cat6 patch leads'] }),
  crc: (inc, c2) => ({ fix: 'Replace the SFP+ optic and the patch lead on uplink 1/1/49', ifNot: `If errors continue with the new optic, the switch port itself is faulty${c2 ? ` (${Math.round(c2.conf * 100)}% likely)` : ''}: move the uplink to 1/1/50 with the NOC's OK; HPE replaces the switch`, extra: ['Spare LC patch lead', 'Optical cleaning kit'] }),
  apdown: (inc, c2) => { const out = D.DEV[inc.ci] && D.DEV[inc.ci].role === 'Outdoor yard'; return { fix: `Test the power cable to the access point and re-terminate it if it fails (the cable is the most likely cause)`, ifNot: `If the cable passes, swap the access point for the spare${c2 ? ` (${Math.round(c2.conf * 100)}% likely)` : ''}; it joins Aruba Central by itself`, extra: ['RJ45 connectors and boots', ...(out ? ['Lift for the yard pole'] : [])] }; },
  lte: () => ({ fix: 'Only needed if the re-activated SIM still fails the test: swap the LTE router', ifNot: 'If the new router also fails, check the antenna cable and its mounting', extra: ['Antenna cable'] }),
  scanner: () => ({ fix: 'Survey the warehouse aisles so the Wi-Fi expert can finish the radio plan', ifNot: 'If the survey shows a coverage gap, the expert may approve moving or adding an access point', extra: ['Wi-Fi survey kit'] }),
  cpu: () => ({ fix: 'Remove the unmanaged desk switch at back office desk 4 and re-patch the two wall ports', ifNot: 'If the branch needs more ports there, the NOC raises a request for a managed switch', extra: ['Port labels'] }),
  circuit: (inc, c2, p) => ({ fix: `Give the ${p.carrier} technician access to the demarc and witness the loopback test`, ifNot: 'If the carrier finds the fault on the branch side, check the inside wiring from the NTE to the SD-WAN appliance', extra: ['Cable tester'] }),
};
FIX.jitter = FIX.circuit; FIX.pos = FIX.circuit;

export function briefOf(s, inc, job) {
  if (!inc) return null;
  const b = D.BR[inc.branchId], { top, causes } = rootOf(inc), k = inc.kind;
  const p = circuitOf(s, b.wan[0]), sc = circuitOf(s, b.wan[1]);
  const sig = inc.signals || [], first = sig[0];
  const rb = inc.runbook && D.RB[inc.runbook], ran = ['done', 'failed', 'rolled back'].includes(inc.rbState);
  const cs = inc.carrierCase && s.cases.find(c => c.id === inc.carrierCase);
  const msg = re => (sig.find(x => re.test(x.msg)) || {}).msg;
  const done = [];
  const add = (what, found, tone) => done.push({ what, found, tone });
  const since = first ? ` since ${hhmm(first.t)} CT` : '';
  if (k === 'edgedown') {
    add('Checked both internet lines at the modems', `Both up${p.carrier ? ` (${p.carrier} and ${sc.carrier} portals clean)` : ''}: the carrier is not the cause`, 'ok');
    add('Tried to reach the SD-WAN appliance from Orchestrator', `No heartbeat${since}`, 'bad');
    add(`Kept ${inc.corr || 0} knock-on alerts quiet`, 'Switches and access points behind the appliance', 'info');
    add(ran ? `Ran remote recovery (${inc.runbook}): soft reboot, then reload from the backup partition` : `Remote recovery (${inc.runbook || 'RB-108'}) runs while you travel`, ran ? 'No check-in: a hardware fault is most likely' : 'If it brings the appliance back, the NOC cancels the visit', ran ? 'bad' : 'info');
  } else if (k === 'crc') {
    add('Read the error counters on the switch', `${(msg(/CRC/) || 'Errors rising on 1/1/49').replace(/^Input /, '')}, in one direction only`, 'bad');
    add('Read the optic light level remotely', '-9.8 dBm: weak (normal is -1 to -7 dBm)', 'bad');
    add('Checked the other ports on the switch', 'All clean: the port hardware is less likely', 'ok');
    add('NOC takes 1/1/49 out of the link pair before you arrive', 'Users stay on the clean link while you work', 'info');
  } else if (k === 'apdown') {
    add('Checked the access point in Aruba Central', `Down${since}`, 'bad');
    add('Read the switch port', `${(msg(/PoE port/) || 'Port up').replace(/^PoE port \S+ /, 'Port ')}; it flapped overnight`, 'bad');
    add('Checked the switch power budget', '62% used: not the cause', 'ok');
    add(ran ? `Bounced the port (${inc.runbook})` : `Port bounce (${inc.runbook || 'RB-103'}) before you leave`, ran ? 'The access point stayed down: the cable or the access point itself' : 'If the access point comes back, the visit is cancelled', ran ? 'bad' : 'info');
  } else if (k === 'lte') {
    add('Ran the weekly failover test', 'Failed: the backup line passes no traffic', 'bad');
    add('Read the LTE router', 'The carrier refuses the connection: line suspended on the account', 'bad');
    add('Compared the router software with other branches', 'The same software works elsewhere: not the cause', 'ok');
    if (cs) add(`Opened case ${cs.id} with the ${cs.carrier} account team`, cs.status, 'info');
  } else if (k === 'scanner') {
    add('Counted Wi-Fi drop-outs', `${(msg(/deauth/) || 'Drop-outs rising').replace(/ on SRS-SCAN in 10 min/, ' in 10 minutes on SRS-SCAN')}, clustered near the racking`, 'bad');
    add('Checked the radio channels', 'Two access points on channel 36', 'bad');
    add('Checked the address pool', '61% used: not the cause', 'ok');
  } else if (k === 'cpu') {
    add('Read the switch CPU and broadcast rate', 'CPU 94%, 48,000 broadcasts a second on 1/1/17', 'bad');
    add('Loop protection', 'Blocked 1/1/17; the same devices appear on 1/1/17 and 1/1/18 (a loop)', 'ok');
    add('Checked spanning tree against the standard', 'Matches: not the cause', 'ok');
  } else if (['circuit', 'jitter', 'pos'].includes(k)) {
    if (sc.status === 'Up' && healthOf(s, b) !== 'down') add('Moved tills, ordering and voice to the backup line (RB-101)', 'Done in seconds: the branch is trading', 'ok');
    add('Ran path tests from the SD-WAN appliance', k === 'circuit' ? 'Loss 100% both ways; the appliance port is up' : 'Loss and delay rise on the carrier side; local use of the line is low', 'bad');
    add('Tested the NTE loopback from the branch side', 'It answers: the branch end is fine', 'ok');
    if (cs) add(`Opened case ${cs.id} with ${cs.carrier}`, `${cs.status}${cs.eta ? `; restore promised by ${hhmm(cs.eta)} CT` : ''}`, 'info');
  } else {
    sig.slice(0, 3).forEach(x => add(`Read ${x.src}`, x.msg, x.sev === 'Info' ? 'info' : 'bad'));
    if (rb) add(ran ? `Ran ${rb.id} ${rb.name}` : `${rb.id} ${rb.name} ready`, ran ? 'It did not fix the fault' : 'Not run yet', ran ? 'bad' : 'info');
  }
  if (inc.vendorCase) add(`Opened HPE Aruba TAC case ${inc.vendorCase}`, 'Replacement unit on its way (RMA)', 'info');
  const f = (FIX[k] || (() => ({ fix: job ? job.task : 'Check the device on site', ifNot: 'Call the NOC before going beyond the approved steps', extra: [] })))(inc, causes[1], p);
  const parts = (job ? job.parts : []).map(x => ({ part: x, need: true }));
  return {
    problem: { text: top.text, conf: top.conf, layer: top.layer, ev: top.ev },
    unlikely: causes.slice(1).map(c => ({ text: c.text, conf: c.conf, ev: c.ev })),
    done, fix: f.fix, ifNot: f.ifNot,
    parts, extra: f.extra || [],
  };
}
