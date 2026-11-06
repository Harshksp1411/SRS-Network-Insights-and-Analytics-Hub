// Critical incidents (P1 and P2): what happened, what it hit, the root cause, how it was solved and by whom, the
// timeline, and what is being done so it does not happen again. Two sources feed one review format: the live
// console record (open incidents and the last 7 days of resolved ones, plus anything a demo or an engineer did in
// this session) and the major incidents of the last 90 days, written up by the major incident manager.
import * as D from './data.js';
import { rootOf } from './dash/drilldata.js';
import { MIN, HR, DAY, T0 } from './util.js';

// the fixes that stop a kind of fault coming back, by incident category (also offered on each incident)
export const PREVENT = {
  'Carrier / LEC': ['Add circuit to carrier monthly review', 'Open problem record for repeat LEC faults', 'Order diverse backup (different carrier)'],
  Wireless: ['Push channel plan + 2.4 GHz handheld profile to site', 'Pre-stage spare AP at nearest depot', 'Add RF survey to next site visit'],
  Switching: ['Enable BPDU guard on access ports (template)', 'Replace optics on uplinks with rising CRC'],
  'Customer-caused': ['Enable BPDU guard on back-office ports', 'Add IPAM check to device rollout runbook'],
  'SD-WAN': ['Pre-stage spare EdgeConnect at nearest depot', 'Open problem record with Aruba TAC'],
  'Config management': ['Move backup window off TACACS+ peak', 'Open problem record with Security'],
  'Branch connectivity': ['Keep card payments pinned to the healthier path (business intent)', 'Add the payment path to the carrier monthly review'],
};
export const preventOf = cat => PREVENT[cat] || ['Open problem record', 'Write KB from this incident'];

const br = (city, st, k = 0) => D.BRANCHES.filter(b => b.city === city && b.state === st)[k] || D.BRANCHES[(city.length * 37) % 900];
const at = (daysAgo, h, m = 0) => T0 - daysAgo * DAY + (h - 12) * HR + m * MIN;
const nameOf = b => b.name.replace(/ – .*/, '');

// how a live incident was put right, in words, by kind and close code
const FIX = {
  pos: { 'After-hours mended': 'Card payments were moved to the backup line straight away; the carrier repaired the congested primary after hours and payments moved back once it was clean', 'No trouble found (NTF)': 'Card payments were moved to the backup line; the latency cleared before the carrier tested and nothing was found. The line was watched for 24 hours', Reboot: 'Card payments were moved to the backup line, then the SD-WAN appliance was restarted out of trading hours; the payment path came back under 400 ms', 'Carrier / LEC': 'The carrier fixed congestion on its network; card payments moved back to the primary', 'Customer-caused': 'A branch device was flooding the line; it was unplugged and payments recovered' },
  cpu: { _: 'Loop protection blocked the looping port and the unmanaged desk switch was removed; switch CPU fell back under 40%' },
  edgedown: { _: 'The SD-WAN appliance was swapped for a spare from the nearest depot; its zero-touch profile loaded and the branch came back' },
  circuit: { _: 'The branch ran on its backup line while the carrier repaired the primary' },
};
const fixedByOf = i => i.state !== 'Resolved' ? 'Still open' : i.auto ? 'Mova iO on its own' : i.workOrder ? 'Field visit' : /Carrier/.test(i.closeCode || '') || i.carrierCase ? 'Carrier' : 'Movate NOC';

// one review from a live console incident
export function reviewOfLive(s, i) {
  const b = D.BR[i.branchId], { top } = rootOf(i), sla = D.slaOf(i.pri);
  const open = i.state !== 'Resolved';
  const team = D.teamOf(i.group);
  const first = (i.signals || [])[0];
  const fix = i.auto ? i.autoAction : ((FIX[i.kind] || {})[i.closeCode] || (FIX[i.kind] || {})._ || `${i.closeCode}${i.runbook && D.RB[i.runbook] ? ` after ${i.runbook} ${D.RB[i.runbook].name}` : ''}`);
  const steps = [];
  if (first) steps.push({ t: i.opened, who: first.src, text: `Detected: ${first.msg}` });
  steps.push({ t: i.opened + 50e3, who: 'OpsRamp', text: `Grouped ${(i.corr || 0) + (i.signals || []).length} events into one incident; ServiceNow ${i.id} raised as ${i.pri}` });
  const dg = (i.agentSteps || []).find(a => a.agent === 'diagnosis');
  steps.push({ t: dg ? dg.t : i.opened + 75e3, who: 'Mova iO', text: `Root cause: ${top.text} (${Math.round((top.conf || 0) * 100)}% confidence)` });
  if (i.acked && !i.auto) steps.push({ t: i.acked, who: i.assignee || 'NOC', text: `Acknowledged and owned by ${i.assignee || 'the NOC'}${team ? ` (${team.name})` : ''}` });
  (i.trail || []).forEach(x => steps.push({ t: x.t, who: x.who, text: x.text }));
  (i.notes || []).slice(1).forEach(x => steps.push({ t: x.t, who: x.who, text: x.text }));
  if (!open) {
    steps.push({ t: i.resolved - 4 * MIN, who: i.auto ? 'Mova iO' : (i.assignee || 'NOC'), text: `Fixed: ${fix}` });
    steps.push({ t: i.resolved, who: 'Verification Agent', text: `Checked and closed: ${(i.verify || []).map(v => v.v).join(', ') || 'service back to normal'} (${i.closeCode})` });
  } else steps.push({ t: T0, who: i.assignee || 'NOC', text: `Still open: ${i.state}` });
  steps.sort((a, c) => a.t - c.t);
  const end = i.resolved || null;
  return {
    id: i.id, pri: i.pri, title: i.title, live: true, open, state: i.state,
    where: `${b.name}, ${b.brand}`, branchId: b.id, region: b.region, scope: '1 branch',
    opened: i.opened, acked: i.acked, restored: end, ttr: end ? end - i.opened : null,
    slaMet: end ? end - i.opened <= sla.res : null, respMet: i.acked ? i.acked - i.opened <= sla.resp : null, target: sla.res,
    what: first ? `${first.src} reported: ${first.msg}.` : i.title,
    impact: i.impact || [], cause: top.text, conf: top.conf, layer: top.layer, ev: top.ev,
    fixedBy: fixedByOf(i), fix: open ? null : fix, steps,
    next: open ? `${i.state}${i.assignee ? `, owned by ${i.assignee}` : ', waiting to be picked up'}${i.runbook && D.RB[i.runbook] ? `; next step: ${i.runbook} ${D.RB[i.runbook].name}` : ''}${i.carrierCase ? `; carrier case ${i.carrierCase} open` : ''}` : null,
    people: [i.auto ? 'Mova iO (no human touch)' : i.assignee, team && team.name].filter(Boolean),
    records: [`ServiceNow ${i.id}`, i.carrierCase && `carrier case ${i.carrierCase}`, i.workOrder && `work order ${i.workOrder}`, i.vendorCase && `HPE case ${i.vendorCase}`].filter(Boolean),
    prevent: preventOf(i.cat).map(t => [t, 'Suggested']), lesson: null,
  };
}

// ---------- the last 90 days: major incident write-ups ----------
const H = (o) => {
  const b = o.b; const opened = o.opened;
  const steps = o.steps.map(([m, who, text]) => ({ t: opened + m * MIN, who, text }));
  const restored = opened + o.ttr * MIN, sla = D.slaOf(o.pri);
  return { ...o, live: false, open: false, state: 'Resolved', where: o.where || `${b.name}, ${b.brand}`, branchId: b.id, region: b.region, opened, acked: opened + o.ack * MIN, restored, ttr: o.ttr * MIN,
    slaMet: o.ttr * MIN <= sla.res, respMet: o.ack * MIN <= sla.resp, target: sla.res, steps };
};
const C1 = br('Charlotte', 'NC'), C2 = br('Houston', 'TX', 2), C3 = br('Fort Worth', 'TX') || br('Dallas', 'TX'), C4 = br('Phoenix', 'AZ'), C5 = br('Dallas', 'TX', 1), C6 = br('Miami', 'FL'),
  C7 = br('Tampa', 'FL'), C8 = br('Atlanta', 'GA'), C9 = br('Denver', 'CO'), C10 = br('San Antonio', 'TX'), C11 = br('Orlando', 'FL'), C12 = br('Chicago', 'IL'), C13 = br('Nashville', 'TN');
export const HISTORY = [
  H({ id: 'INC0383961', pri: 'P1', b: C1, opened: at(9, 7, 42), ack: 2, ttr: 221, title: 'Branch hard down after a carrier fibre cut', scope: '1 branch',
    what: `Just after opening ${nameOf(C1)} in Charlotte went dark: the AT&T fibre primary was cut by road works, and the broadband backup, which shares the same street duct, degraded with it. OpsRamp received 62 events in two minutes.`,
    impact: ['Counter sales, card payments and dispatch stopped for 13 minutes at opening', '41 contractor orders held at the counter', 'Yard handhelds offline'],
    cause: 'Fibre cut on the local loop by third-party road works; the AT&T and broadband lines share one duct', conf: 0.93, layer: 'ISP', ev: 'Loss 100% on both lines at the same second; AT&T confirmed a cut 300 m from the branch',
    fixedBy: 'Mova iO with NOC approval, then the carrier', fix: 'Mova iO brought up the LTE/5G backup as a temporary path and pinned card payments, ERP and voice to it (approved by the NOC engineer, since the branch was trading). AT&T spliced the fibre and traffic failed back after 30 clean minutes',
    steps: [[0, 'OpsRamp', '62 events grouped into one P1; ServiceNow INC0383961 raised'], [1, 'Mova iO', 'Root cause: carrier fibre cut, shared duct (93%)'], [2, 'Priya S.', 'Acknowledged; approved the temporary LTE/5G path'], [13, 'Mova iO', 'Trading again on LTE/5G: card payments back in 1.4 s'], [16, 'Carrier Agent', 'AT&T case ATT-482014443 opened with loss graphs and loopback result'], [95, 'Arjun M.', 'Hourly update to StoreOps and the branch manager'], [190, 'AT&T', 'Fibre spliced; line clean'], [221, 'Verification Agent', 'Failed back after 30 clean minutes; closed (Carrier / LEC)']],
    people: ['Priya S. (NOC L2)', 'Arjun M. (Major incident)', 'AT&T'], records: ['ServiceNow INC0383961', 'AT&T case ATT-482014443', 'Change CHG0031822 (diverse path)'],
    prevent: [['Order a diverse backup from a different carrier and duct', 'In progress: CHG0031822'], ['Add the branch to the carrier monthly review', 'Done']], lesson: 'Two lines in the same duct are one line. The diverse-path check now runs on every branch.' }),
  H({ id: 'INC0383477', pri: 'P1', b: C2, opened: at(23, 10, 5), ack: 1, ttr: 172, title: 'Regional AT&T outage: 23 Houston branches on their backup line', scope: '23 branches', where: 'Houston metro, 23 branches (Texas & South Central)',
    what: 'An AT&T core router fault in Houston took down the MPLS primary at 23 branches within four minutes. Every branch failed over to broadband in seconds.',
    impact: ['No branch stopped trading', 'ERP slower on broadband at 6 high-volume yards for 2 hours', 'Bridge opened as a major incident'],
    cause: 'AT&T core router fault in the Houston metro', conf: 0.97, layer: 'ISP', ev: '23 branches on the same AT&T central office alarmed within 4 minutes; branch equipment healthy',
    fixedBy: 'Mova iO on its own, then the carrier', fix: 'Business intent kept card payments and voice on the healthy broadband path at every branch with no human touch. One carrier case covered all 23 lines; AT&T replaced the router card',
    steps: [[0, 'OpsRamp', '214 events from 23 branches grouped into one P1 by carrier and region (CP-02)'], [1, 'Arjun M.', 'Major incident bridge opened'], [2, 'Mova iO', 'Confirmed all 23 branches trading on broadband'], [6, 'Carrier Agent', 'One AT&T case for all 23 circuits, with the central office evidence'], [60, 'Arjun M.', 'Leadership update: no trading impact'], [150, 'AT&T', 'Router card replaced'], [172, 'Verification Agent', 'All 23 primaries clean for 20 minutes; traffic moved back; closed']],
    people: ['Arjun M. (Major incident)', 'Kevin T. (NOC L2)', 'AT&T'], records: ['ServiceNow INC0383477', 'AT&T case ATT-481977320', 'Problem PRB0040117'],
    prevent: [['Carrier and region correlation rule CP-02 moved from Recommend to On', 'Done'], ['Problem record with AT&T on central-office resilience', 'Open: PRB0040117']], lesson: 'Correlation by carrier and region turned 23 tickets into one, and one carrier case got the fix faster.' }),
  H({ id: 'INC0382902', pri: 'P1', b: C3, opened: at(41, 15, 20), ack: 3, ttr: 312, title: 'Severe weather across Dallas–Fort Worth: 7 branches lost power', scope: '7 branches', where: 'Dallas–Fort Worth, 7 branches (Texas & South Central)',
    what: 'A hail storm brought down power lines across Dallas–Fort Worth. Seven branches lost mains power; four ran on UPS and three went dark.',
    impact: ['3 branches closed for up to 5 hours', 'Card payments down at those branches', 'Yard operations stopped during the storm'],
    cause: 'Utility power loss in the storm; the UPS at three branches was past its battery life', conf: 0.95, layer: 'Network', ev: 'Power-loss traps from the switches, then devices unreachable; utility outage map confirmed',
    fixedBy: 'Field visit and the utility', fix: 'The NOC confirmed it was power, not the network, in 4 minutes and kept StoreOps updated. Field technicians replaced two UPS battery packs; the other branch came back when the utility restored power',
    steps: [[0, 'OpsRamp', '64 events from 7 branches grouped into one P1'], [3, 'Arjun M.', 'Major incident bridge; StoreOps told it is power, not the network'], [4, 'Mova iO', 'Power-loss traps confirmed at 7 branches; nothing to fix remotely'], [40, 'Dispatch Agent', 'Two technicians sent with UPS batteries from the Dallas depot'], [190, 'Luis R.', 'UPS replaced at two branches; both back online'], [312, 'Verification Agent', 'Last branch back when the utility restored power; closed (outside the 4 h target: utility power)']],
    people: ['Arjun M. (Major incident)', 'Luis R. and Derek H. (field)', 'Oncor (utility)'], records: ['ServiceNow INC0382902', 'Work orders WO0040712, WO0040713'],
    prevent: [['UPS battery age added to the lifecycle plan for every branch', 'Done'], ['Pre-stage UPS batteries at depots before hail season', 'Planned for March']], lesson: 'The network was fine; the UPS was not. Battery age is now tracked like firmware.' }),
  H({ id: 'INC0383702', pri: 'P2', b: C4, opened: at(15, 9, 12), ack: 4, ttr: 185, title: 'SD-WAN appliance hardware failure at a Phoenix branch', scope: '1 branch',
    what: `The EdgeConnect at ${nameOf(C4)} stopped answering on both paths. The modems were fine.`,
    impact: ['Branch offline for 2 h 40 min', 'Counter switched to the offline card terminal fallback'],
    cause: 'EdgeConnect power supply failure', conf: 0.88, layer: 'Network', ev: 'Both modems in sync; no heartbeat from the appliance; remote recovery failed',
    fixedBy: 'Field visit', fix: 'Remote recovery (RB-108) failed, so Mova iO booked a technician with a spare EC-XS from the Phoenix depot. The zero-touch profile loaded on power-up',
    steps: [[0, 'Orchestrator', 'No heartbeat from the appliance on either path'], [4, 'Sanjay K.', 'Acknowledged'], [9, 'Mova iO', 'RB-108 remote recovery: no check-in, hardware likely'], [14, 'Dispatch Agent', 'Technician matched; spare EC-XS reserved at Phoenix depot'], [150, 'Omar F.', 'Spare racked and cabled'], [165, 'Orchestrator', 'Appliance checked in; zero-touch profile loaded'], [185, 'Verification Agent', 'Return check passed; HPE RMA raised; closed']],
    people: ['Sanjay K. (NOC L2)', 'Omar F. (field)', 'HPE Aruba TAC'], records: ['ServiceNow INC0383702', 'Work order WO0040988', 'HPE case 5381-220914'],
    prevent: [['Spare EdgeConnects kept at every depot (minimum 2)', 'Done'], ['Power supply health added to the EdgeConnect template', 'Done']], lesson: 'Having the spare at the depot made it a same-morning fix.' }),
  H({ id: 'INC0383811', pri: 'P2', b: C5, opened: at(12, 7, 5), ack: 3, ttr: 78, title: 'New handhelds cannot get an address after a rollout', scope: '1 branch',
    what: `Twenty-four new handhelds were switched on at ${nameOf(C5)} and could not join the warehouse Wi-Fi. The address pool on VLAN 30 was full.`,
    impact: ['Pickers back on paper for 75 minutes', 'Loading delayed for 9 trucks'],
    cause: 'DHCP scope on VLAN 30 too small for the new handhelds', conf: 0.94, layer: 'Network', ev: 'Scope 100% used; new MAC addresses refused',
    fixedBy: 'Movate NOC', fix: 'Mova iO proposed widening the scope from /25 to /24 and shortening the lease; the network engineer approved it and the handhelds joined within minutes',
    steps: [[0, 'OpsRamp', 'VLAN 30 scope 100% used'], [3, 'Elena G.', 'Acknowledged'], [8, 'Mova iO', 'Proposed scope change (79% confidence: needs a person)'], [55, 'Marcus L.', 'Approved the scope change'], [62, 'Mova iO', 'RB-105 applied the change'], [78, 'Verification Agent', 'All 24 handhelds have addresses; closed (Customer-caused)']],
    people: ['Elena G. (NOC L2)', 'Marcus L. (Network SME)'], records: ['ServiceNow INC0383811', 'Change CHG0031704'],
    prevent: [['IPAM check added to the device rollout runbook', 'Done'], ['Scope use above 80% now alerts before it fills', 'Done']], lesson: 'Rollouts now check the address pool first.' }),
  H({ id: 'INC0383344', pri: 'P2', b: C6, opened: at(27, 13, 30), ack: 0, ttr: 9, title: 'A desk switch caused a broadcast storm in the back office', scope: '1 branch',
    what: `Someone plugged a small desk switch into two wall ports in the back office at ${nameOf(C6)}. The core switch CPU hit 94%.`,
    impact: ['Back office slow for 7 minutes', 'Counter unaffected'],
    cause: 'Loop through an unmanaged desk switch on ports 1/1/17 and 1/1/18', conf: 0.96, layer: 'Network', ev: '48,000 broadcasts a second; the same MAC addresses on both ports',
    fixedBy: 'Mova iO on its own', fix: 'Loop protection and RB-103 shut the looping port; the branch was asked to remove the desk switch',
    steps: [[0, 'OpsRamp', 'Switch CPU 94%, broadcast storm'], [1, 'Mova iO', 'Loop found on 1/1/17 and 1/1/18'], [2, 'Mova iO', 'RB-103 shut 1/1/17; CPU back under 40%'], [5, 'Mova iO', 'Branch manager asked to remove the desk switch'], [9, 'Verification Agent', 'Stable for 5 minutes; closed (Customer-caused)']],
    people: ['Mova iO (no human touch)'], records: ['ServiceNow INC0383344', 'Change CHG0031650 (BPDU guard)'],
    prevent: [['BPDU guard on back-office ports in the switch template (all branches)', 'Done: CHG0031650']], lesson: 'Fixed in 9 minutes with nobody involved; the template change stops it estate-wide.' }),
  H({ id: 'INC0382655', pri: 'P2', b: C7, opened: at(48, 6, 10), ack: 5, ttr: 268, title: 'Access points rebooting at 6 stores after a firmware wave', scope: '6 branches', where: '6 branches in Florida (Southeast)',
    what: 'After firmware wave 2, AP-635 access points at six stores started rebooting every 40 to 60 minutes. Patterns across stores flagged the same model and release.',
    impact: ['Handheld drop-outs at 6 stores for about 4 hours', 'Scanning slowed in the yards'],
    cause: 'Firmware 10.7.1.0 memory leak on AP-635 with the yard radio profile', conf: 0.9, layer: 'Network', ev: 'Only AP-635 on 10.7.1.0 with the yard profile; the same model on 10.6 was stable',
    fixedBy: 'Movate NOC', fix: 'The wave was paused, the six stores were rolled back to 10.6.2.3 through Aruba Central after close of trading, and a problem record went to HPE',
    steps: [[0, 'OpsRamp', 'AP reboots at 3 stores'], [5, 'Kevin T.', 'Acknowledged'], [35, 'Mova iO', 'Pattern: AP-635 on 10.7.1.0 at 6 stores, 2.6× the rate of other releases'], [40, 'Lina K.', 'Firmware wave 3 paused'], [210, 'Lina K.', 'Rollback to 10.6.2.3 approved for after close'], [268, 'Verification Agent', 'No reboots for 30 minutes at all 6 stores; closed']],
    people: ['Kevin T. (NOC L2)', 'Lina K. (Network SME)', 'HPE Aruba TAC'], records: ['ServiceNow INC0382655', 'Problem PRB0040093', 'Change CHG0031874'],
    prevent: [['Canary ring of 10 stores before every firmware wave', 'Done'], ['HPE fix in 10.7.1.2, tested before wave 3 resumes', 'In progress: PRB0040093']], lesson: 'The pattern view found it from 6 stores before it reached 112.' }),
  H({ id: 'INC0383120', pri: 'P2', b: C8, opened: at(33, 11, 40), ack: 2, ttr: 128, title: 'Card payments slow at Atlanta branches: the processor, not the network', scope: '9 branches', where: '9 branches in Atlanta (Southeast)',
    what: 'Card payment times rose above 2 seconds at nine Atlanta branches over the lunch peak.',
    impact: ['Queues at the counter at 9 branches', 'No payments lost'],
    cause: 'Congestion at the card processor\'s Atlanta gateway', conf: 0.87, layer: 'Application', ev: 'Network path clean (latency 18 ms); synthetic payments slow from every carrier; processor status page degraded',
    fixedBy: 'SRS application support and the processor', fix: 'Mova iO ruled out the network in 6 minutes and handed it to SRS Payments on-call with the evidence. The processor moved SRS to another gateway',
    steps: [[0, 'New Relic', 'Payment round trip above 2 s at 9 branches'], [2, 'Ravi P.', 'Acknowledged'], [6, 'Mova iO', 'Network ruled out: the path is clean on every carrier'], [9, 'Ravi P.', 'Handed to SRS Payments on-call with the evidence'], [95, 'Payments on-call', 'Processor moved SRS to its secondary gateway'], [128, 'Verification Agent', 'Payments back under 600 ms; closed']],
    people: ['Ravi P. (NOC L1)', 'SRS Payments on-call', 'Card processor'], records: ['ServiceNow INC0383120'],
    prevent: [['Synthetic payment test now alerts on the processor gateway too', 'Done']], lesson: 'Proving it was not the network in 6 minutes saved an hour of chasing carriers.' }),
  H({ id: 'INC0382411', pri: 'P2', b: C9, opened: at(56, 8, 25), ack: 6, ttr: 560, title: 'Primary line down for 9 hours: Spectrum missed its restore commitment', scope: '1 branch',
    what: `The Spectrum broadband primary at ${nameOf(C9)} went down. The branch traded on its LTE/5G backup all day.`,
    impact: ['Branch traded normally on LTE/5G', 'ERP slower; LTE data cost about $180'],
    cause: 'Damaged Spectrum node in the neighbourhood', conf: 0.91, layer: 'ISP', ev: 'Loss 100%; modem out of sync; other Spectrum customers nearby affected',
    fixedBy: 'Carrier', fix: 'The branch stayed on LTE/5G; the Carrier Agent escalated twice when Spectrum missed its 4-hour commitment. Spectrum replaced the node',
    steps: [[0, 'Orchestrator', 'wan1 loss 100%; branch on LTE/5G in 4 s'], [6, 'Tom B.', 'Acknowledged'], [9, 'Carrier Agent', 'Spectrum case opened with evidence'], [240, 'Carrier Agent', 'Restore commitment missed: escalated to the Spectrum account team'], [420, 'Carrier Agent', 'Second escalation; credit claim started'], [560, 'Verification Agent', 'Primary clean for 30 minutes; moved back; closed (outside the 8 h target: carrier)']],
    people: ['Tom B. (NOC L1)', 'Spectrum'], records: ['ServiceNow INC0382411', 'Spectrum case SPB-55120934', 'Credit claim CR-0712'],
    prevent: [['Branch added to the chronic-line review', 'Done'], ['Quote for a fibre primary requested', 'Waiting on the carrier']], lesson: 'Missed by the carrier, not the branch: the credit claim is with Spectrum.' }),
  H({ id: 'INC0382988', pri: 'P2', b: C10, opened: at(38, 5, 50), ack: 3, ttr: 46, title: 'Unapproved switch change blocked the card payment VLAN', scope: '1 branch',
    what: `A local change on a switch at ${nameOf(C10)} removed VLAN 40 (card payments) from the uplink before opening.`,
    impact: ['Card terminals offline for 40 minutes before and after opening'],
    cause: 'Manual change outside the change process; config drifted from the golden template', conf: 0.95, layer: 'Network', ev: 'Nightly drift check: VLAN 40 missing from uplink; no change record',
    fixedBy: 'Movate NOC', fix: 'The golden config was restored (RB-105) after the engineer approved it; Security reviewed the change',
    steps: [[0, 'OpsRamp', 'Card terminals unreachable'], [3, 'Neha R.', 'Acknowledged'], [7, 'Mova iO', 'Drift found: VLAN 40 removed, no change record'], [30, 'Priya S.', 'Approved restoring the golden config'], [34, 'Mova iO', 'RB-105 restored the golden config'], [46, 'Verification Agent', 'Card payments working; closed (Config management)']],
    people: ['Neha R. (NOC L1)', 'Priya S. (NOC L2)', 'Omar N. (Security)'], records: ['ServiceNow INC0382988', 'Change CHG0031790'],
    prevent: [['Local accounts removed from switches; TACACS+ only', 'Done'], ['Drift check moved from nightly to hourly for payment VLANs', 'Done']], lesson: 'Drift on a payment VLAN is now caught within the hour.' }),
  H({ id: 'INC0382120', pri: 'P2', b: C11, opened: at(67, 14, 15), ack: 4, ttr: 102, title: 'ERP slow at 12 branches after an SD-WAN policy change', scope: '12 branches', where: '12 branches in Florida (Southeast)',
    what: 'After a business intent policy change, ERP traffic at 12 branches was put in the bulk class. Order entry slowed to 6 seconds.',
    impact: ['Order entry slow at 12 branches for 90 minutes'],
    cause: 'Business intent policy v39 mis-classified ERP as bulk', conf: 0.92, layer: 'Network', ev: 'ERP response rose at exactly the time v39 was applied, only at the 12 branches in the change',
    fixedBy: 'Mova iO under the change\'s rollback plan', fix: 'The Change Validation agent rolled the 12 branches back to v38 under the pre-approved rollback plan; the policy was corrected and re-tested',
    steps: [[0, 'New Relic', 'ERP response 6 s at 12 branches'], [4, 'Kevin T.', 'Acknowledged'], [10, 'Mova iO', 'Linked to change CHG0031512 (policy v39)'], [14, 'Mova iO', 'Rolled back to v38 under the approved rollback plan'], [30, 'New Relic', 'ERP back to 1.3 s'], [102, 'Verification Agent', 'Stable through the afternoon peak; closed']],
    people: ['Kevin T. (NOC L2)', 'Marcus L. (Network SME)'], records: ['ServiceNow INC0382120', 'Change CHG0031512'],
    prevent: [['Policy changes go to a 10-store canary first', 'Done'], ['ERP synthetic test added to change verification', 'Done']], lesson: 'An approved rollback plan meant a 14-minute fix.' }),
  H({ id: 'INC0381766', pri: 'P1', b: C12, opened: at(79, 6, 5), ack: 2, ttr: 96, title: 'Chicago yard down before opening: both lines and the LTE backup', scope: '1 branch',
    what: `Before opening ${nameOf(C12)} lost its primary, then its broadband; the LTE/5G backup failed to take over.`,
    impact: ['Branch could not open on time: 35 minutes late', 'Contractor pickups delayed'],
    cause: 'Comcast node outage plus a suspended LTE SIM on the backup', conf: 0.89, layer: 'ISP', ev: 'Both wired lines down at the same node; LTE router refused by the carrier',
    fixedBy: 'Movate NOC and the carriers', fix: 'Verizon re-activated the SIM within 30 minutes so the branch could trade on LTE/5G; Comcast restored the node',
    steps: [[0, 'Orchestrator', 'Both wired lines down; LTE not passing traffic'], [2, 'Priya S.', 'Acknowledged; P1 bridge with Arjun M.'], [8, 'Mova iO', 'LTE SIM suspended on the account'], [12, 'Carrier Agent', 'Verizon account team asked to re-activate'], [38, 'Verizon', 'SIM re-activated; trading on LTE/5G'], [96, 'Verification Agent', 'Comcast restored; back on the primary; closed']],
    people: ['Priya S. (NOC L2)', 'Arjun M. (Major incident)', 'Comcast', 'Verizon'], records: ['ServiceNow INC0381766', 'Comcast case CR-441198270', 'Verizon case VZB-30981144'],
    prevent: [['Weekly failover test on every branch (it now finds dead backups first)', 'Done'], ['SIM status added to the LTE template', 'Done']], lesson: 'A backup you have not tested is not a backup. The weekly test now catches it.' }),
  H({ id: 'INC0381540', pri: 'P2', b: C13, opened: at(86, 10, 30), ack: 5, ttr: 395, title: 'CRC errors on a yard switch uplink: handhelds dropping', scope: '1 branch',
    what: `Errors climbed on the uplink of the yard switch at ${nameOf(C13)}; handhelds in the yard kept dropping.`,
    impact: ['Yard scanning interrupted for about 6 hours', 'Office and counter unaffected'],
    cause: 'Dirty, failing optic on uplink 1/1/49', conf: 0.86, layer: 'Network', ev: 'CRC rising in one direction; light level -9.8 dBm (normal -1 to -7)',
    fixedBy: 'Field visit', fix: 'The NOC moved traffic to the second uplink; a technician replaced the optic and the patch lead',
    steps: [[0, 'OpsRamp', 'CRC 1,240 per 5 min on 1/1/49'], [5, 'Elena G.', 'Acknowledged'], [12, 'Mova iO', 'Optic light level weak; took 1/1/49 out of the link pair'], [20, 'Dispatch Agent', 'Technician booked with a spare optic'], [330, 'Carlos M.', 'Optic and patch lead replaced; -3.1 dBm'], [395, 'Verification Agent', 'No errors for 30 minutes; closed']],
    people: ['Elena G. (NOC L2)', 'Carlos M. (field)'], records: ['ServiceNow INC0381540', 'Work order WO0040112'],
    prevent: [['Optic light level added to the switch template with a warning at -8 dBm', 'Done']], lesson: 'The optic now warns before it fails.' }),
];

// every critical incident in the window, newest first; open ones first
export function criticalOf(s, now, days) {
  const from = now - days * DAY;
  const live = [...s.incidents, ...s.resolved].filter(i => (i.pri === 'P1' || i.pri === 'P2') && i.opened >= from).map(i => reviewOfLive(s, i));
  const hist = HISTORY.filter(h => h.opened >= from && !live.some(l => l.id === h.id));
  return [...live, ...hist].sort((a, b) => (b.open - a.open) || (b.opened - a.opened));
}
