// Mova iO after the root cause: who fixes it, and can it be fixed remotely? For every incident the Smart Triage Agent
// picks the route (a runbook, an NOC engineer, a network SME, a field engineer on site, HPE, the carrier, application
// support or security) and says why; the Dispatch, Carrier and Ticket Update agents prepare the visit, the case or
// the hand-off, and carry it out once an engineer approves it (the only human step).
// It reads the same incident, work order, carrier case and runbook records as every other screen, so the ticket,
// Field Dispatch, Carrier Management and the audit log all show what was done.
import * as D from '../data.js';
import { circuitOf, healthOf, branchClock, gate } from '../store.jsx';
import { rootOf } from './drilldata.js';
import { MIN, hhmm, parts } from '../util.js';

export const ROUTES = {
  remote: { label: 'Fix remotely', who: 'an approved runbook', agent: 'runbook', icon: 'Bot' },
  noc: { label: 'NOC engineer', who: 'Movate NOC L1 / L2', agent: 'triage', icon: 'Headset' },
  sme: { label: 'Network SME (L3)', who: 'Movate network experts', agent: 'triage', icon: 'GraduationCap' },
  field: { label: 'Field engineer on site', who: 'SRS field services', agent: 'dispatch', icon: 'Truck' },
  oem: { label: 'Vendor (HPE Aruba TAC)', who: 'replacement hardware (RMA)', agent: 'ticket', icon: 'Factory' },
  carrier: { label: 'Carrier', who: 'the line provider', agent: 'carrier', icon: 'RadioTower' },
  app: { label: 'Application support', who: 'SRS application teams', agent: 'triage', icon: 'AppWindow' },
  sec: { label: 'Security', who: 'SRS Security Operations', agent: 'change', icon: 'ShieldAlert' },
  mim: { label: 'Major incident manager', who: 'Movate NOC', agent: 'triage', icon: 'Megaphone' },
};
// what each route is doing for this incident
export const STATE = {
  rec: { label: 'Recommended', tone: 'brand' },
  first: { label: 'Try first', tone: 'info' },
  also: { label: 'Also needed', tone: 'info' },
  on: { label: 'In hand', tone: 'ok' },
  tried: { label: 'Tried, did not fix it', tone: 'warn' },
  opt: { label: 'Only if needed', tone: 'muted' },
  no: { label: 'Not needed', tone: 'muted' },
};
// what each console role may do here (role-based access); dashboards are read-only
export const CAN = { noc: ['hand', 'field', 'carrier', 'vendor', 'sec', 'run'], l3: ['hand', 'field', 'carrier', 'vendor', 'sec', 'run'], sec: ['sec'], tech: [], storeops: [], bm: [], mna: [] };

const pct = x => `${Math.round((x || 0) * 100)}%`;
const list = a => a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`;
const openOf = s => s.incidents.filter(i => i.state !== 'Resolved');

// the people in a team, the least loaded first; a matching specialty goes to the top
export function peopleOf(s, teamId, prefer) {
  const t = D.TEAM[teamId]; if (!t || !t.people) return [];
  const open = openOf(s);
  return t.people.map(p => {
    const mine = open.filter(i => i.assignee === p);
    const bridge = mine.some(i => i.pri === 'P1');
    return { name: p, team: t, skill: t.skill && t.skill[p], load: mine.length, status: bridge ? 'On a P1 bridge' : 'On shift', busy: bridge, match: !!(prefer && t.skill && t.skill[p] === prefer) };
  }).sort((a, b) => (a.busy - b.busy) || (b.match - a.match) || (a.load - b.load));
}

// technicians for a visit: skills, distance, who is free, and a depot in the region with the spare (as in Field Dispatch)
export function rankTechs(s, w) {
  const b = D.BR[w.branchId];
  const depots = D.DEPOT_REGION[b.region] || [];
  return s.techs.map(t => {
    const skill = w.skills.filter(k => t.skills.includes(k)).length / Math.max(1, w.skills.length);
    const region = t.region === b.region ? 1 : 0.35;
    const avail = t.status === 'Available' ? 1 : t.status === 'On site' ? 0.5 : 0.1;
    const depot = s.depots.find(d => depots.includes(d.id) && w.parts.every(p => (d.spares[p] ?? 1) > 0));
    const home = D.BRANCHES.find(x => x.city === t.base) || b; const miles = Math.hypot(home.cx - b.cx, home.cy - b.cy) * 2.9; const eta = Math.round(20 + miles / 50 * 60 + (avail < 1 ? 60 : 0));
    const score = skill * 0.5 + Math.max(0, 1 - miles / 600) * 0.3 + avail * 0.2;
    return { t, score, skill, region, avail, eta, depot, miles };
  }).sort((a, b) => b.score - a.score).slice(0, 6);
}
export const etaText = m => m > 300 ? 'next day' : m < 90 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
export const arriveText = m => m > 300 ? 'arriving the next day' : `there in about ${etaText(m)}`;

// when a visit may happen: urgent work or a device that is already down goes now; anything else waits for the close
export function visitWindow(s, inc, now) {
  const b = D.BR[inc.branchId], clk = branchClock(b, now);
  const urgent = inc.pri === 'P1' || inc.pri === 'P2', dead = ['apdown', 'edgedown'].includes(inc.kind) || healthOf(s, b) === 'down';
  if (!clk.open) return { now: true, label: 'Now', why: 'the branch is closed' };
  if (urgent || dead) return { now: true, label: 'Now', why: urgent ? `${inc.pri}: allowed during trading hours` : 'the device is already down, so the visit cannot make it worse' };
  const lp = parts(now, b.tz), [ch, cm] = clk.closes.split(':').map(Number), at = now + ((ch * 60 + cm) - (lp.h * 60 + lp.m)) * MIN;
  return { now: false, at, label: `After ${clk.closes} local`, why: `the branch is trading until ${clk.closes} local and this is ${inc.pri}` };
}

// the depot stock for the parts a visit needs, in plain words
function stockText(s, b, parts) {
  if (!parts.length) return 'no parts needed';
  const ids = D.DEPOT_REGION[b.region] || [];
  const d = s.depots.find(x => ids.includes(x.id) && parts.every(p => (x.spares[p] ?? 0) > 0));
  return d ? `spare ${list(parts)} in stock at ${d.city.split(',')[0]} (${parts.map(p => d.spares[p]).join(', ')} left)` : `no spare ${list(parts)} in the region: it ships from another depot`;
}

// the work order, carrier case and approval already tied to the incident
export function recordsOf(s, inc) {
  const wo = (inc.workOrder && s.workOrders.find(w => w.id === inc.workOrder)) || s.workOrders.find(w => w.inc === inc.id) || null;
  const tech = wo && wo.tech && s.techs.find(t => t.id === wo.tech);
  const cs = (inc.carrierCase && s.cases.find(c => c.id === inc.carrierCase)) || null;
  const apr = s.approvals.find(a => a.inc === inc.id && a.status === 'Pending') || null;
  return { wo, tech, cs, apr };
}

export function fixPlan(s, inc, now) {
  const b = D.BR[inc.branchId], { top, causes } = rootOf(inc), k = inc.kind;
  const p = circuitOf(s, b.wan[0]), sc = circuitOf(s, b.wan[1]);
  const clk = branchClock(b, now), down = healthOf(s, b) === 'down';
  const team = D.teamOf(inc.group), owner = inc.assignee && !/Agent|Mova iO/.test(inc.assignee) ? inc.assignee : null;
  const ownerText = owner ? `${owner} (${team ? team.name : inc.group})` : null;
  const { wo, tech, cs, apr } = recordsOf(s, inc);
  const job = D.fieldJob(inc);
  const rb = inc.runbook && D.RB[inc.runbook];
  const dead = ['apdown', 'edgedown'].includes(k) || down;
  const g = rb ? gate(s, { kind: rb.kind, conf: inc.conf || top.conf || 0, branchId: b.id, now, emergency: inc.pri === 'P1' && down }) : null;
  const rbOk = rb && (rb.kind === 'readonly' || g.auto || dead);
  const rbWhy = rb ? (rbOk ? (g.auto || rb.kind === 'readonly' ? 'Mova iO may run it on its own now' : 'Mova iO may run it now: the device is already down, so it cannot make things worse') : `Mova iO needs a person to approve it: ${(g.reasons[0] || '').replace(/ \(.*\)/, '').replace(/ – .*/, '').toLowerCase()}`) : '';
  const rbText = rb ? `${rb.id} ${rb.name}: works ${pct(rb.success)} of the time, about ${rb.avg}; ${rbWhy}` : '';
  const rbRan = ['done', 'failed', 'rolled back'].includes(inc.rbState);
  const woText = wo ? (tech ? `${wo.id}: ${tech.name} (${tech.base}), ${wo.status.toLowerCase()}${wo.eta && wo.status !== 'Completed' ? `, there by ${hhmm(wo.eta)} CT` : ''}` : `${wo.id} is waiting for a technician`) : null;
  const jobText = job ? `${job.task}. Skills: ${list(job.skills)}; ${stockText(s, b, job.parts)}. Mova iO matches the technician and reserves the spare` : null;
  const caseText = cs ? `Case ${cs.id} with ${cs.carrier}: ${cs.status.toLowerCase()}${cs.eta ? `; restore promised by ${hhmm(cs.eta)} CT${cs.eta < now ? ' (late)' : ''}` : ''}` : null;
  const second = causes[1];
  const R = {};
  const set = (id, st, text, extra) => { R[id] = { id, st, text, ...extra }; };
  const fieldRoute = (st, alt) => set('field', wo ? (tech ? 'on' : st === 'no' ? 'opt' : st) : st, wo ? woText : alt || jobText || 'Nothing physical to do at the branch');
  const nocTeam = !!(team && ['l1', 'l2', 'mim'].includes(team.id));
  const nocRoute = (st, doing) => owner && nocTeam ? set('noc', 'on', `${ownerText} owns the ticket and ${doing}`) : owner ? set('noc', 'opt', `${ownerText} owns it now; the NOC takes it back if needed`) : set('noc', st, `Mova iO routed it to ${team ? team.name : inc.group}; no engineer has taken it yet. The engineer who takes it ${doing}`);
  const oemRoute = (st, text) => set('oem', inc.vendorCase ? 'on' : st, inc.vendorCase ? `HPE case ${inc.vendorCase}: ${inc.vendorWhat || 'replacement unit on its way'}` : text);
  let rec, head, why, remote;

  if (k === 'circuit' || (top.layer === 'ISP' && !['jitter', 'pos', 'lte'].includes(k))) {
    rec = 'carrier';
    remote = sc.status === 'Up' && !down ? ['partly', `Partly. Tills, ordering and voice already run on the backup ${sc.carrier} line; the main line needs ${p.carrier}.`] : ['no', `No. The fault is inside ${p.carrier}'s network.`];
    head = cs ? `${p.carrier} is repairing the line; Mova iO chases them every hour` : `Mova iO opens a case with ${p.carrier}: only the carrier can fix this`;
    why = `The fault is upstream of the demarc, inside ${p.carrier}'s network (${pct(top.conf)} likely). Nobody from SRS or Movate can fix it at the branch, so the work is to get the carrier moving with proof${sc.status === 'Up' && !down ? ' while the branch trades on its backup line' : ''}.`;
    set('carrier', cs ? 'on' : 'rec', cs ? caseText : `Mova iO opens a case with ${p.carrier} with an hour of loss readings, path tests and timestamps attached, so it cannot be closed as "no fault found"`);
    nocRoute('also', `chases ${p.carrier} every hour, then moves traffic back once the line has been clean for 30 minutes`);
    set('remote', sc.status === 'Up' && !down ? 'on' : 'no', sc.status === 'Up' && !down ? 'Done: Mova iO moved tills, ordering and voice to the backup line in seconds (RB-101)' : 'Nothing left to switch: both lines are affected');
    fieldRoute('opt', `Only if ${p.carrier} finds the fault at the branch end (the NTE box or the inside wiring)${second ? `, ${pct(second.conf)} likely` : ''}`);
    set('sme', 'no', 'No design or config change needed');
  } else if (k === 'jitter' || k === 'pos') {
    const moved = inc.rbState === 'done';
    rec = moved ? 'carrier' : 'remote';
    remote = ['partly', `Partly. Moving tills, ordering and voice to the backup line fixes what the branch feels; the line itself needs ${p.carrier}.`];
    head = moved ? (cs ? `${p.carrier} is working on the line; Mova iO keeps the branch on its backup meanwhile` : `Mova iO opens a case with ${p.carrier} now that the branch is on its backup`) : `Mova iO moves tills, ordering and voice to the backup line${rbOk ? '' : ' once approved'}, then gets ${p.carrier} to fix the line`;
    why = `Loss and delay rise on ${p.carrier}'s side while the branch's own use of the line is low (${pct(top.conf)} likely), so the line is congested at the carrier. The backup ${sc.carrier} line is clean.`;
    set('remote', moved ? 'on' : 'rec', moved ? 'Done: Mova iO moved tills, ordering and voice to the backup line (RB-101)' : rbText, { run: !!rb });
    set('carrier', cs ? 'on' : moved ? 'rec' : 'also', cs ? caseText : `Mova iO opens a case with ${p.carrier} with the loss and delay readings attached`);
    nocRoute('also', `approves the move, chases ${p.carrier}, then moves traffic back once the line is clean`);
    fieldRoute('opt', 'Not needed unless the carrier finds the fault at the branch end');
    set('sme', 'opt', 'If the line stays congested at peak times, the SME team reviews the line size and the traffic policy');
  } else if (k === 'lte') {
    rec = 'carrier';
    remote = ['no', 'No. The SIM is blocked on the carrier account; the router itself is healthy.'];
    head = cs ? `${sc.carrier} is re-activating the SIM; then Mova iO re-runs the failover test` : `Mova iO asks ${sc.carrier} to re-activate the SIM; no visit needed`;
    why = `The backup line is blocked on the carrier account (the carrier refuses the connection: line suspended), not broken. A repair ticket or a visit would not fix it; the account team re-activates it.`;
    set('carrier', cs ? 'on' : 'rec', cs ? caseText : `Mova iO asks the ${sc.carrier} account team to re-activate the line`);
    nocRoute('also', 're-runs the failover test once the line is active again');
    set('remote', 'no', 'Nothing to fix remotely: the router answers and its software is current');
    fieldRoute('opt', job ? `Only if the re-activated line still fails the test: swap the LTE router (${stockText(s, b, job.parts)})` : null);
    set('sme', 'no', 'No design or config change needed');
  } else if (k === 'apdown') {
    rec = 'field';
    remote = ['maybe', 'Maybe. A port bounce clears a hung power port in 2 minutes; a damaged cable or a failed access point needs someone on site.'];
    head = tech ? `${tech.name} is on the way to fix it` : rbRan ? 'The port bounce did not bring it back: Mova iO sends a field engineer' : wo ? `Mova iO tries a port bounce first, then sends a technician on ${wo.id}` : 'Mova iO tries a port bounce first, then sends a field engineer';
    why = `The switch gives the access point no power (0 W) and the port flapped overnight, which points to the cable (${pct(top.conf)})${second ? ` or the access point itself (${pct(second.conf)})` : ''}. Both need hands on site. A remote port bounce only fixes a hung port, so it is worth 2 minutes first.`;
    set('remote', rbRan ? 'tried' : 'first', rbRan ? `Mova iO bounced the port (${inc.runbook}); the access point stayed down` : rbText, { run: !!rb });
    fieldRoute('rec');
    nocRoute('also', 'checks the access point comes back, then closes the ticket');
    set('sme', 'opt', 'Only if more access points at this branch lose power (power budget on the switch)');
    oemRoute('opt', 'Only if the access point itself has failed: HPE replaces it under the support contract (RMA)');
    set('carrier', 'no', 'Not a line problem');
  } else if (k === 'crc') {
    rec = 'field';
    remote = ['partly', 'Partly. An engineer takes the uplink out of service so the errors stop reaching users; the optic or patch lead is swapped on site.'];
    head = tech ? `${tech.name} is on the way to swap the optic` : 'Mova iO sends a field engineer to swap the optic or patch lead';
    why = `Errors in one direction only and weak light on the link point to the optic or the patch lead (${pct(top.conf)}). That is physical, so it cannot be fixed remotely.`;
    set('remote', 'first', 'Take uplink 1/1/49 out of the link pair so traffic uses the clean link (NOC L2, 1 minute)');
    oemRoute('opt', `Only if the switch port itself is faulty${second ? ` (${pct(second.conf)} likely)` : ''}: HPE replaces the switch (RMA)`);
    fieldRoute('rec');
    nocRoute('also', 'takes the bad link out of service, then checks the errors stop after the swap');
    set('sme', 'no', 'No design or config change needed');
    set('carrier', 'no', 'Not a line problem');
  } else if (k === 'scanner') {
    rec = 'sme';
    const isSme = team && team.id === 'sme';
    remote = ['partly', `Partly. Radio settings change remotely from Aruba Central, but in a working warehouse that needs an engineer who knows the site, and confidence is ${pct(top.conf)}, so a person decides.`];
    head = isSme ? `${owner} (Network SME) is re-planning the Wi-Fi` : 'Mova iO hands it to the Wi-Fi expert: the fix is a radio plan, not a reboot';
    why = `Drop-outs cluster near the racking with two access points on the same channel (${pct(top.conf)} likely). A radio plan for the aisles fixes that; a reboot only clears a stuck radio.`;
    set('sme', isSme ? 'on' : 'rec', isSme ? `${ownerText} re-plans channels and power for the aisles outside the picking peak` : 'Re-plan channels and power for the aisles from Aruba Central, outside the picking peak');
    set('remote', 'opt', rb ? `${rb.id} ${rb.name} clears a stuck radio, not a coverage gap` : 'No runbook fits a coverage gap');
    nocRoute('also', 'checks the drop-outs stop, then tells the branch');
    fieldRoute('opt', 'A Wi-Fi survey of the aisles if the new radio plan does not fix it');
    set('carrier', 'no', 'Not a line problem');
  } else if (k === 'dhcp' && /unrecorded|drift/i.test(top.text)) {
    rec = 'remote';
    remote = ['yes', 'Yes. The switch rolls back to its approved settings from the nightly backup; a person approves it because the branch is open.'];
    head = 'Mova iO rolls the switch back to its approved settings once approved, then asks security who made the change';
    why = `The relay setting was changed overnight by a local account with no change record (${pct(top.conf)} likely). Rolling back fixes the branch; security finds out how the change was made.`;
    set('remote', inc.rbState === 'done' ? 'on' : 'rec', inc.rbState === 'done' ? 'Done: Mova iO rolled the switch back to its approved settings' : `${rb ? `${rb.id} roll back to the approved settings` : 'Roll back to the approved settings'}: ${apr ? `waiting for approval ${apr.id}` : rbWhy}`, { run: !!rb });
    set('sec', (inc.trail || []).some(x => x.route === 'sec') ? 'on' : 'also', (inc.trail || []).some(x => x.route === 'sec') ? 'Security is reviewing the local account that made the change' : 'Security reviews the local account that made the change with no record');
    set('sme', team && team.id === 'sme' ? 'on' : 'opt', team && team.id === 'sme' ? `${ownerText} owns the rollback` : 'The change and config expert takes it if the rollback fails');
    nocRoute('also', 'checks handhelds get addresses again after the rollback');
    fieldRoute('no');
    set('carrier', 'no', 'Not a line problem');
  } else if (k === 'dhcp') {
    rec = 'noc';
    remote = ['yes', 'Yes. A standard change widens the address pool from Aruba Central; nothing physical.'];
    head = 'Mova iO has a standard change ready to widen the address pool';
    why = `New handhelds were added without the address plan being updated (${pct(top.conf)} likely), so the pool ran out. It is a settings change, done remotely.`;
    nocRoute('rec', 'widens the VLAN 30 pool (/25 to /24), then shortens the lease to 1 day, as a standard change');
    set('remote', 'no', 'No approved runbook changes an address plan on its own');
    set('sme', 'opt', 'Only if the branch address plan needs a redesign');
    fieldRoute('no');
    set('carrier', 'no', 'Not a line problem');
  } else if (k === 'backup') {
    rec = 'remote';
    remote = ['yes', 'Yes. The backup re-runs on its own; nobody needs to touch it.'];
    head = inc.rbState === 'done' ? 'Mova iO re-ran the backup; the NOC confirms and closes' : 'Mova iO re-runs the backup on its own';
    why = `Every failed backup used the same login server, which timed out during the backup window (${pct(top.conf)} likely). Re-running the backup fixes it.`;
    set('remote', inc.rbState === 'done' ? 'on' : 'rec', inc.rbState === 'done' ? `Done: Mova iO re-ran the backup${rb ? ` (${rb.id})` : ''}` : rbText, { run: !!rb });
    nocRoute('also', 'checks the re-run stored a good copy');
    set('sme', 'opt', 'If the login server keeps timing out, the SME team fixes the server pool');
    fieldRoute('no');
    set('carrier', 'no', 'Not a line problem');
  } else if (k === 'cpu') {
    rec = 'noc';
    remote = ['partly', 'Partly. Loop protection already blocks the looped port; someone at the branch has to unplug the desk switch.'];
    head = 'Mova iO is blocking the loop; the NOC talks the branch through unplugging the desk switch';
    why = `A small unmanaged switch at a back-office desk is plugged into two wall ports and loops traffic (${pct(top.conf)} likely). The block stops the storm; removing the switch stops it coming back.`;
    set('remote', 'on', 'Loop protection is blocking port 1/1/17, which stops the storm');
    nocRoute('rec', 'calls the branch manager, then walks them through unplugging the switch at back office desk 4 (5 minutes)');
    fieldRoute('opt', 'Only if the branch cannot find the switch');
    set('sme', 'no', 'No design or config change needed');
    set('carrier', 'no', 'Not a line problem');
  } else if (k === 'edgedown') {
    rec = 'field';
    remote = ['maybe', `Maybe. Remote recovery brings a hung appliance back ${rb ? pct(rb.success) : 'about half'} of the time; a failed one is swapped on site.`];
    head = tech ? `${tech.name} is on the way with a spare appliance` : rbRan ? 'Remote recovery did not bring it back: Mova iO sends a field engineer with a spare' : 'Mova iO sends a field engineer with a spare appliance now and tries remote recovery meanwhile';
    why = `The SD-WAN appliance stopped answering while both lines are up at the modems: it has hung or failed (${pct(top.conf)} likely). Remote recovery works about half the time and the branch is offline${clk.open ? ' during trading hours' : ''}, so the engineer sets off now; the visit is cancelled if recovery works.`;
    set('remote', rbRan ? 'tried' : 'first', rbRan ? `Mova iO ran remote recovery (${inc.runbook}); the appliance did not check in` : rbText, { run: !!rb });
    fieldRoute('rec');
    nocRoute('also', 'runs the remote recovery, keeps the branch informed and checks the new appliance comes up');
    set('sme', 'opt', 'Only if the new appliance does not come up with its zero-touch profile');
    oemRoute('also', 'Mova iO opens an HPE Aruba TAC case for the replacement unit (RMA), with the fault logs');
    set('carrier', 'no', 'Both lines are up at the modems');
  } else if (top.layer === 'Application') {
    rec = 'app';
    remote = ['no', 'Not by the network team. The network and both lines are clean; the fault is in the application.'];
    head = 'Mova iO hands it to SRS application support with proof the network is clean';
    why = `Every network layer checks out and the application is slow from other branches too (${pct(top.conf)} likely). The application team owns the fix.`;
    set('app', team && team.id === 'app' ? 'on' : 'rec', team && team.id === 'app' ? `${ownerText} has it` : 'Hand to the on-call team with the network evidence attached');
    nocRoute('also', 'stays on the ticket to confirm the branch is back to normal');
    fieldRoute('no'); set('carrier', 'no', 'Lines are clean'); set('sme', 'no', 'No network change needed');
  } else {
    // anything else: a branch check that failed, or a fault inside SRS with no runbook of its own
    rec = 'noc';
    remote = rb ? ['maybe', `Maybe. ${rb.id} ${rb.name} may fix it; if not, an engineer takes over.`] : ['maybe', 'Maybe. An engineer finds the fault first.'];
    head = owner ? `${ownerText} is finding and fixing the fault, with Mova iO's evidence` : 'Mova iO routes it to an NOC engineer to find and fix the fault';
    why = (inc.rca || []).length ? `The most likely cause is ${top.text.charAt(0).toLowerCase() + top.text.slice(1)} (${pct(top.conf)}).` : 'The diagnosis is still running, so an engineer looks at it now.';
    nocRoute('rec', 'finds the fault, then fixes it remotely where possible');
    set('remote', rb ? (rbRan ? 'tried' : 'first') : 'no', rb ? (rbRan ? `Mova iO ran ${rb.id}; the fault is still there` : rbText) : 'No runbook fits yet', { run: !!rb });
    set('sme', 'opt', 'If the fix needs a design or config change');
    fieldRoute(job ? 'opt' : 'no');
    if (D.DEV[inc.ci]) oemRoute('opt', 'If the device has failed: HPE replaces it under the support contract (RMA)');
    set('carrier', top.layer === 'ISP' ? 'rec' : 'no', top.layer === 'ISP' ? `Open a case with ${p.carrier}` : 'Not a line problem');
  }
  if (inc.pri === 'P1' || inc.major) set('mim', team && team.id === 'mim' ? 'on' : 'also', team && team.id === 'mim' ? `${ownerText} runs the bridge and updates leadership every hour` : 'A P1 gets a major incident manager to run the bridge');
  const order = ['remote', 'noc', 'sme', 'field', 'oem', 'carrier', 'app', 'sec', 'mim'];
  const routes = order.filter(id => R[id] && !(['app', 'oem'].includes(id) && R[id].st === 'no')).map(id => ({ ...R[id], ...ROUTES[id] }));
  return { rec, head, why, remote: { can: remote[0], text: remote[1] }, routes, owner, ownerText, team, wo, tech, cs, apr, job, rb, rbOk, b, clk };
}

// ---------- what the console does when someone acts ----------
const stamp = (act, inc, who, text, route, by) => act.upd('incidents', inc.id, x => ({ trail: [...(x.trail || []), { t: Date.now(), who, by, text, route }] }));

// give the ticket to a person in a team: the Ticket Update Agent sends the hand-off package once an engineer approves
export function handOff(act, inc, teamId, person, note) {
  const t = D.TEAM[teamId], me = act.me(), now = Date.now();
  act.upd('incidents', inc.id, x => ({
    group: t.group, assignee: person, acked: x.acked || now, state: x.state === 'New' ? 'In Progress' : x.state,
    notes: [...x.notes, { t: now, who: 'Ticket Update Agent', text: `Handed to ${person} (${t.name}), approved by ${me}. ${note}` }],
    agentSteps: [...x.agentSteps, { agent: 'ticket', t: now, text: `Hand-off package sent to ${person}: root cause with its evidence, what was tried, the recommended next step`, st: 'done' }],
    trail: [...(x.trail || []), { t: now, who: 'Ticket Update Agent', by: me, text: `Handed from ${x.assignee || 'the queue'} to ${person} (${t.name}) with the hand-off package`, route: teamId === 'l1' || teamId === 'l2' ? 'noc' : teamId }],
  }));
  act.audit(`Approved the hand-off of ${inc.id} to ${person} (${t.name})`, inc.id);
  act.audit(`Handed ${inc.id} to ${person} with the hand-off package`, inc.id, 'Ticket Update Agent');
  act.toast(`Mova iO handed ${inc.id} to ${person} (${t.name})`);
}

// send a technician: the Dispatch Agent assigns the open work order or creates one, and reserves the spare
export function dispatchVisit(act, s, inc, r, job, win) {
  const now = Date.now(), me = act.me(), b = D.BR[inc.branchId];
  const { wo } = recordsOf(s, inc);
  const id = wo ? wo.id : `WO00${42200 + Math.floor(Math.random() * 700)}`;
  const eta = win.now ? now + r.eta * MIN : win.at + 15 * MIN;
  const fields = { tech: r.t.id, status: win.now ? 'Assigned' : 'Scheduled', eta, window: win.now ? (inc.pri === 'P1' || inc.pri === 'P2' ? `Now (${inc.pri})` : 'Now') : win.label, depot: r.depot && r.depot.id };
  if (wo) act.upd('workOrders', wo.id, fields);
  else act.add('workOrders', { id, branchId: b.id, inc: inc.id, task: job.task, skills: job.skills, parts: job.parts, created: now, priority: inc.pri, ...fields });
  if (r.depot) job.parts.forEach(p => act.upd('depots', r.depot.id, x => ({ spares: { ...x.spares, [p]: Math.max(0, (x.spares[p] || 0) - 1) } })));
  if (win.now) act.upd('techs', r.t.id, { status: 'On site' });
  const what = `${id}: ${r.t.name} from ${r.t.base}${job.parts.length && r.depot ? `, spare ${list(job.parts)} from ${r.depot.city.split(',')[0]}` : ''}, ${win.now ? arriveText(r.eta) : `${win.label.toLowerCase()}`}`;
  act.upd('incidents', inc.id, x => ({
    workOrder: id, acked: x.acked || now, state: x.state === 'New' ? 'In Progress' : x.state,
    notes: [...x.notes, { t: now, who: 'Dispatch Agent', text: `Field visit booked, approved by ${me}. ${what}. Task: ${job.task}.` }],
    agentSteps: [...x.agentSteps, { agent: 'dispatch', t: now, text: `${what}${job.parts.length && r.depot ? '; spare reserved at the depot' : ''}`, st: 'done' }],
    trail: [...(x.trail || []), { t: now, who: 'Dispatch Agent', by: me, text: `Booked field visit ${id}: ${r.t.name}${job.parts.length && r.depot ? `, spare reserved` : ''}; onsite work pack sent to the technician`, route: 'field' }],
  }));
  act.audit(`Approved the field visit for ${inc.id}`, inc.id);
  act.audit(`Booked ${r.t.name} on ${id} for ${inc.id}${job.parts.length && r.depot ? `; spare reserved at ${r.depot.id}` : ''}`, inc.id, 'Dispatch Agent');
  act.toast(`Mova iO booked ${id}: ${r.t.name}, ${win.now ? `ETA ${etaText(r.eta)}` : win.label}`);
  return id;
}

// the Carrier Agent opens a case with the evidence pack, or pushes an open one up the carrier's escalation path
export function carrierCase(act, s, inc, reason) {
  const now = Date.now(), me = act.me(), b = D.BR[inc.branchId];
  const { cs } = recordsOf(s, inc);
  if (cs) {
    const lvl = (cs.escal || 0) + 1, to = ['', 'carrier duty manager', 'carrier account manager', 'carrier service director'][Math.min(lvl, 3)];
    act.upd('cases', cs.id, x => ({ escal: lvl, status: `Escalated – ${to}`, lastUpdate: now }));
    act.note(inc.id, `Escalated ${cs.carrier} case ${cs.id} to the ${to} (${reason}), approved by ${me}.`, 'Carrier Agent');
    stamp(act, inc, 'Carrier Agent', `Escalated case ${cs.id} to the ${to}`, 'carrier', me);
    act.audit(`Approved escalation of ${cs.carrier} case ${cs.id}`, inc.id);
    act.audit(`Escalated ${cs.carrier} case ${cs.id} to the ${to} (level ${lvl})`, inc.id, 'Carrier Agent');
    act.toast(`Mova iO escalated ${cs.carrier} case ${cs.id} to the ${to}`, 'warn');
    return cs.id;
  }
  const cir = circuitOf(s, D.CIR[inc.ci] ? inc.ci : b.wan[0]);
  const no = D.caseNo(cir.carrier);
  act.add('cases', { id: no, carrier: cir.carrier, circuit: cir.id, inc: inc.id, branchId: b.id, opened: now, status: inc.kind === 'lte' ? 'Open – account team' : 'Open – carrier testing', eta: now + 4 * 36e5, lastUpdate: now, evidence: ['60-min loss and delay graph', 'Path test (MTR) from the SD-WAN appliance', 'Interface counters', 'Timestamps UTC/CT'], escal: 0 });
  act.upd('incidents', inc.id, x => ({
    carrierCase: no, state: 'On Hold – Carrier', acked: x.acked || now,
    agentSteps: [...x.agentSteps, { agent: 'carrier', t: now, text: `Evidence pack built; ${cir.carrier} case ${no} opened`, st: 'done' }],
    notes: [...x.notes, { t: now, who: 'Carrier Agent', text: `Opened ${cir.carrier} case ${no} with the evidence pack, approved by ${me}.` }],
    trail: [...(x.trail || []), { t: now, who: 'Carrier Agent', by: me, text: `Opened ${cir.carrier} case ${no} with the evidence pack`, route: 'carrier' }],
  }));
  act.audit(`Approved the ${cir.carrier} case for ${inc.id}`, inc.id);
  act.audit(`Opened carrier case ${no} with the evidence pack`, inc.id, 'Carrier Agent');
  act.toast(`Mova iO opened ${cir.carrier} case ${no}`);
  return no;
}

// the Ticket Update Agent opens a case with HPE Aruba TAC: serial, fault logs and support contract, for a replacement (RMA)
export function vendorCase(act, inc) {
  const now = Date.now(), me = act.me(), d = D.DEV[inc.ci];
  const no = String(5370000000 + Math.floor(Math.random() * 9e6));
  const what = `replacement ${d ? (d.type === 'SD-WAN' ? 'EC-XS' : d.model) : 'unit'} for ${inc.ci} (RMA) shipping to the depot; fault logs attached`;
  act.upd('incidents', inc.id, x => ({
    vendorCase: no, vendorWhat: what,
    notes: [...x.notes, { t: now, who: 'Ticket Update Agent', text: `HPE Aruba TAC case ${no} opened, approved by ${me}: ${what}${d ? `; serial ${d.serial}` : ''}.` }],
    trail: [...(x.trail || []), { t: now, who: 'Ticket Update Agent', by: me, text: `Opened HPE Aruba TAC case ${no} for a replacement unit (RMA)`, route: 'oem' }],
  }));
  act.audit(`Approved the HPE case for ${inc.ci}`, inc.id);
  act.audit(`Opened HPE Aruba TAC case ${no} for ${inc.ci}`, inc.id, 'Ticket Update Agent');
  act.toast(`Mova iO opened HPE Aruba TAC case ${no}`);
  return no;
}

// the Change Validation Agent brings security in on a change with no record, without moving the ticket
export function tellSecurity(act, inc, note) {
  const now = Date.now(), me = act.me();
  act.upd('incidents', inc.id, x => ({
    notes: [...x.notes, { t: now, who: 'Change Validation Agent', text: `Security (Omar N.) asked to review, approved by ${me}: ${note}` }],
    trail: [...(x.trail || []), { t: now, who: 'Change Validation Agent', by: me, text: 'Asked security to review the unrecorded change', route: 'sec' }],
  }));
  act.audit(`Approved the security review for ${inc.id}`, inc.id);
  act.audit(`Asked security to review the unrecorded change on ${inc.id}`, inc.id, 'Change Validation Agent');
  act.toast('Mova iO asked security to review the change', 'info');
}

// the ticket's path so far: opened, who had it, visits, carrier cases, fixed
export function trailOf(s, inc) {
  const { wo, tech, cs } = recordsOf(s, inc);
  const mine = inc.trail || [];
  const firstOwner = (mine.find(x => /^Handed from /.test(x.text)) || {}).text;
  const first = firstOwner ? firstOwner.replace(/^Handed from (.*?) to .*$/, '$1') : inc.assignee;
  const out = [{ t: inc.opened, who: 'Correlation Agent', text: `Opened from ${(inc.corr || 0) + inc.signals.length} alerts as one ${inc.pri} ticket` }];
  const tri = inc.notes.find(n => /^Auto-triaged/.test(n.text)); if (tri) out.push({ t: tri.t, who: 'Smart Triage Agent', text: tri.text.replace(/;.*/, '').replace(/^Auto-triaged to/, 'Routed to') });
  if (inc.acked) out.push({ t: inc.acked, who: first && first !== 'the queue' ? first : 'NOC', text: 'Acknowledged' });
  if (cs && !mine.some(x => x.text.includes(cs.id))) out.push({ t: cs.opened, who: 'Carrier Agent', text: `Opened ${cs.carrier} case ${cs.id} with the evidence pack` });
  if (wo && !mine.some(x => x.text.includes(wo.id))) out.push({ t: wo.created, who: 'Dispatch Agent', text: `Field visit ${wo.id}${tech ? `: ${tech.name}` : ' raised, waiting for a technician'}` });
  mine.forEach(x => out.push(x));
  if (inc.state === 'Resolved') out.push({ t: inc.resolved, who: inc.auto ? 'Verification Agent' : inc.assignee || 'NOC', text: `Resolved: ${inc.closeCode}` });
  return out.sort((a, b) => a.t - b.t);
}
