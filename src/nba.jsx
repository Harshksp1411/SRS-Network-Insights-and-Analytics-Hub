// Next best action for a branch: every problem Branch 360 and Branch Readiness show (a failed or amber check, end of
// life, an expired warranty, a vulnerability, old firmware, a failed backup, drift, a repeat-offender line, a
// capacity limit, an open prediction or incident) comes with what to do next, who does it, why, and a button that
// does it: Mova iO runs the runbook (or asks for approval while the branch is open), opens the carrier case, books
// the visit, schedules the change, opens the vendor case or tells the branch. Done actions stay marked "In hand".
import React from 'react';
import * as I from 'lucide-react';
import * as D from './data.js';
import { useApp, useNow, circuitOf, healthOf, branchClock, gate } from './store.jsx';
import { branchChecks } from './readiness.jsx';
import { fixPlan, ROUTES } from './dash/fix.js';
import { Card, Badge, Btn, cx } from './ui.jsx';
import { hhmm, dateShort, HR, DAY, MIN } from './util.js';

const ICON = { remote: I.Bot, noc: I.Headset, sme: I.GraduationCap, field: I.Truck, oem: I.Factory, carrier: I.RadioTower, app: I.AppWindow, sec: I.ShieldAlert, mim: I.Megaphone, store: I.MessageSquare };
// read the routes when needed: readiness.jsx and this file import each other, so module-level copies would be empty
const who = k => k === 'store' ? { label: 'Branch and Store Ops', who: 'the branch manager' } : ROUTES[k] || ROUTES.noc;
const SEV = { bad: 0, warn: 1, info: 2 };
const fmtDate = iso => iso ? new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';

// every finding at a branch, worst first, each with its next best action
export function branchActions(s, b, now) {
  const out = [], add = f => { if (!out.some(x => x.id === f.id)) out.push(f); };
  // a readiness check an open incident already explains is handled by that incident's plan, not listed twice
  const COVERS = { wan1: ['circuit', 'jitter'], wan2: ['lte'], sw: ['crc', 'cpu'], wifi: ['apdown', 'scanner'], dhcp: ['dhcp'], cfg: ['backup', 'dhcp'], apps: ['pos', 'jitter'] };
  const h = healthOf(s, b), down = h === 'down', clk = branchClock(b, now);
  const p = circuitOf(s, b.wan[0]), sc = circuitOf(s, b.wan[1]);
  const incs = s.incidents.filter(i => i.branchId === b.id && i.state !== 'Resolved');
  const covered = id => { const k = COVERS[id.replace(/-.*/, '')]; return k && incs.some(i => k.includes(i.kind)); };
  const addCheck = f => { if (!covered(f.id)) add(f); };
  const caseFor = c => s.cases.find(x => !x.closed && x.circuit === c.id);
  const rk = branchChecks(s, b), c = rk.c;
  const rb = (id, action, why, extra = {}) => ({ do: { kind: 'runbook', rb: id }, who: 'remote', action, why, ...extra });
  const carrier = (line, why) => { const cs = caseFor(line); return cs ? { do: { kind: 'case', id: cs.id }, who: 'carrier', action: `Chase ${line.carrier} on case ${cs.id}${cs.eta ? `: restore promised by ${hhmm(cs.eta)} CT${cs.eta < now ? ' (late, escalate)' : ''}` : ''}`, why: `${cs.status}. Mova iO chases every hour and moves traffic back once the line is clean for 30 minutes.` }
    : { do: { kind: 'carrier', line: line.id }, who: 'carrier', action: `Open a case with ${line.carrier} with the evidence pack attached`, why }; };

  // the morning readiness checks
  if (down) add({ id: 'down', area: 'Readiness · EdgeConnect', sev: 'bad', problem: 'Branch unreachable on both lines', do: { kind: 'visit', task: 'EdgeConnect unreachable on both paths: power-cycle, check the NTE and the EdgeConnect, replace if dead', skills: ['SD-WAN', 'Power'] }, who: 'field', action: 'Send a field engineer: power-cycle the EdgeConnect and check both line terminations', why: 'Nothing answers remotely, so the next step has to be on site. Mova iO tells the branch to use the downtime procedure meanwhile.' });
  if (!down && c.wan1.st !== 'pass') {
    if (c.wan1.st === 'warn' && !(s.steer && s.steer[b.id])) addCheck({ id: 'wan1-steer', area: 'Readiness · Primary line', sev: 'warn', problem: c.wan1.detail, ...rb('RB-101', 'Move card payments, ERP and voice to the backup line (RB-101)', `The main ${p.carrier} line is unstable; the backup ${sc.carrier} line is clean, so the branch trades normally while the line is fixed.`), do: { kind: 'steer' } });
    addCheck({ id: 'wan1-carrier', area: 'Readiness · Primary line', sev: c.wan1.st === 'fail' ? 'bad' : 'warn', problem: c.wan1.detail, ...carrier(p, `The fault is in ${p.carrier}'s network; loss readings, path tests and timestamps go with the case so it cannot be closed as "no fault found".`) });
  }
  if (!down && c.wan2.st !== 'pass') {
    if (sc.type === 'LTE/5G') addCheck({ id: 'wan2', area: 'Readiness · Backup line', sev: c.wan2.st === 'fail' ? 'bad' : 'warn', problem: c.wan2.detail, ...rb('RB-106', 'Reset the LTE modem and re-test the backup line (RB-106 opens a case if it still fails)', 'Without a working backup the branch has no failover if the main line drops.') });
    else addCheck({ id: 'wan2', area: 'Readiness · Backup line', sev: c.wan2.st === 'fail' ? 'bad' : 'warn', problem: c.wan2.detail, ...carrier(sc, 'Without a working backup the branch has no failover if the main line drops.') });
  }
  if (!down && c.sw.st !== 'pass') {
    const cpu = incs.some(i => i.kind === 'cpu');
    addCheck({ id: 'sw', area: 'Readiness · Switches', sev: 'warn', problem: c.sw.detail, ...rb('RB-103', cpu ? 'Shut the looping port (RB-103), then ask the branch to unplug the unmanaged desk switch' : 'Bounce the uplink port (RB-103); if the errors come back, replace the patch lead or optic on site', cpu ? 'A loop on one access port is flooding the switch; loop-protect has found the port.' : 'CRC errors usually mean a bad lead or optic; a bounce clears a flapping port, a visit fixes the cable.') });
  }
  if (!down && c.wifi.st !== 'pass') {
    const scan = !incs.some(i => i.kind === 'apdown');
    addCheck({ id: 'wifi', area: 'Readiness · Wi-Fi', sev: c.wifi.st === 'fail' ? 'bad' : 'warn', problem: c.wifi.detail, ...(scan ? rb('RB-104', 'Reboot the warehouse access point after close and move it off channel 36 (RB-104)', 'Handhelds lose the network when they roam between aisles; the AP is on a busy channel.')
      : rb('RB-103', 'Restart the access point from its switch port (RB-103); if it stays dark, Mova iO opens an HPE RMA and books the swap', 'A PoE bounce brings most dark APs back in under 3 minutes with no visit.')) });
  }
  if (!down && c.dhcp.st !== 'pass') {
    const relay = /relay/.test(c.dhcp.detail);
    addCheck({ id: 'dhcp', area: 'Readiness · DHCP', sev: 'bad', problem: c.dhcp.detail, ...(relay ? rb('RB-105', 'Roll the DHCP relay back to the standard setup (RB-105)', 'The relay was changed with no change record; rolling back gives handhelds and scanners their addresses again.')
      : { do: { kind: 'change', title: `Expand the VLAN 30 address pool from /25 to /24 at ${b.name}`, risk: 'Medium' }, who: 'noc', action: 'Expand the VLAN 30 address pool from /25 to /24 (change, approved after close)', why: 'The pool is full, so new devices cannot join; more handhelds have been added since it was sized.' }) });
  }
  if (!down && c.cfg.st !== 'pass') {
    const drift = (s.drift || []).find(x => x.branchId === b.id);
    addCheck({ id: 'cfg', area: 'Readiness · Config', sev: 'warn', problem: c.cfg.detail, ...(/backup failed/i.test(c.cfg.detail) ? rb('RB-109', 'Re-run the config backup and verify the hash (RB-109)', 'Without last night\'s backup a rollback would restore an older config.')
      : rb('RB-105', `Restore the standard setup for: ${drift ? drift.item : 'the drifted setting'} (RB-105), or record it as an approved change`, `${drift && drift.source ? `${drift.source}. ` : ''}An unrecorded change is the most common cause of the next incident.`)) });
  }
  if (!down && (c.pos.st !== 'pass' || c.erp.st !== 'pass') && !(s.steer && s.steer[b.id]) && !out.some(x => x.id === 'wan1-steer'))
    addCheck({ id: 'apps', area: `Readiness · ${c.pos.st !== 'pass' ? 'Payment path' : 'ERP path'}`, sev: c.pos.st === 'fail' ? 'bad' : 'warn', problem: c.pos.st !== 'pass' ? c.pos.detail : c.erp.detail, ...rb('RB-101', 'Steer card payments and ERP to the better line (RB-101) and re-test the payment path (RB-110)', 'Payment round trips over 400 ms slow the counter; the other line is clean.'), do: { kind: 'steer' } });

  // a branch under watch after an automatic fix
  if (b.watch && b.watch.until > now) add({ id: 'watch', area: 'Watch · after an automatic fix', sev: 'warn', problem: b.watch.why, do: { kind: 'notify' }, who: 'noc', action: `Keep it under watch until ${hhmm(b.watch.until)} CT and confirm with the branch manager that ordering is back to normal`, why: 'Mova iO closes the watch on its own if the ERP and payment probes stay clean; anything that comes back reopens the incident with the history attached.' });

  // incidents: Mova iO's plan for each one
  incs.forEach(i => { const pl = fixPlan(s, i, now); add({ id: `inc-${i.id}`, area: `Incident · ${i.id}`, sev: i.pri === 'P1' || i.pri === 'P2' ? 'bad' : 'warn', problem: i.title, do: { kind: 'inc', id: i.id }, who: ROUTES[pl.rec] ? pl.rec : 'noc', action: pl.head, why: pl.why }); });

  // devices: lifecycle, warranty, vulnerabilities, firmware, backups
  const devs = D.devicesOf(b.id);
  const byLife = st => devs.filter(d => D.lifecycleOf(d).status === st);
  const eos = byLife('End of support'), eosale = devs.filter(d => { const l = D.lifecycleOf(d); return l.status === 'End of sale' && l.tone === 'red'; });
  if (eos.length) add({ id: 'life-eos', area: 'Lifecycle · End of support', sev: 'bad', problem: `${eos.length} device${eos.length > 1 ? 's' : ''} past end of support (${[...new Set(eos.map(d => d.desc))].join(', ')})`, do: { kind: 'change', title: `Replace ${eos.length} end-of-support device${eos.length > 1 ? 's' : ''} at ${b.name}`, risk: 'Medium', days: 14 }, who: 'sme', action: `Replace ${eos.map(d => d.id).join(', ')} in the next replacement wave (change after close, spares reserved)`, why: 'No more security fixes or vendor support; a failure means a like-for-like swap with no RMA.' });
  if (eosale.length) { const l = D.lifecycleOf(eosale[0]); add({ id: 'life-eosale', area: 'Lifecycle · End of life', sev: 'warn', problem: `${eosale.length} ${eosale[0].desc} ${eosale.length > 1 ? 'reach' : 'reaches'} end of support on ${fmtDate(l.eosup)}`, do: { kind: 'change', title: `Plan replacement of ${eosale.length} ${eosale[0].desc} at ${b.name} before ${fmtDate(l.eosup)}`, risk: 'Low', days: 30 }, who: 'sme', action: `Add ${eosale.length > 1 ? `the ${eosale.length} devices` : eosale[0].id} to the replacement plan before ${fmtDate(l.eosup)} and reserve the replacements`, why: 'End of sale is announced; replacing on a plan avoids an emergency swap after support ends.' }); }
  const lapsed = byLife('Warranty expired');
  if (lapsed.length) add({ id: 'life-warranty', area: 'Lifecycle · Warranty', sev: 'warn', problem: `${lapsed.length} device${lapsed.length > 1 ? 's' : ''} out of warranty (${lapsed.map(d => d.id).slice(0, 3).join(', ')}${lapsed.length > 3 ? '…' : ''})`, do: { kind: 'vendor', what: `support contract renewal for ${lapsed.length} device${lapsed.length > 1 ? 's' : ''}` }, who: 'oem', action: 'Renew the support contract with HPE Aruba (quote requested), or replace with the next wave', why: 'Without a contract a failed unit is not covered by next-business-day replacement.' });
  const vul = D.ADVISORIES.map(a => ({ a, ds: devs.filter(d => a.affects(d)) })).filter(x => x.ds.length && ['Critical', 'High'].includes(x.a.sev));
  vul.forEach(({ a, ds }) => add({ id: `vuln-${a.id}`, area: `Security · ${a.sev}`, sev: a.sev === 'Critical' ? 'bad' : 'warn', problem: `${a.title} on ${ds.length} device${ds.length > 1 ? 's' : ''}`, do: { kind: 'change', title: `${a.id} remediation at ${b.name} (${ds.length} device${ds.length > 1 ? 's' : ''})`, risk: 'Low' }, who: 'sec', action: `Apply the mitigation now (${a.mitigation.replace(/\.$/, '')}) and upgrade to ${a.fixed} after close`, why: `${a.cves.length ? a.cves.join(', ') + '. ' : ''}The mitigation closes the exposure today; the upgrade removes it.` }));
  const oldFw = devs.filter(d => { const t = D.FW_TARGET[d.type === 'AP' ? 'AP' : d.model]; return t && t.indexOf(d.fw) > (d.type === 'SD-WAN' ? 1 : 2); });
  if (oldFw.length) add({ id: 'fw', area: 'Devices · Firmware', sev: 'warn', problem: `${oldFw.length} device${oldFw.length > 1 ? 's' : ''} below the firmware policy (${oldFw.map(d => `${d.id} ${d.fw}`).slice(0, 2).join(', ')}${oldFw.length > 2 ? '…' : ''})`, do: { kind: 'change', title: `Firmware upgrade to policy at ${b.name} (${oldFw.length} device${oldFw.length > 1 ? 's' : ''})`, risk: 'Low' }, who: 'noc', action: `Add ${oldFw.length > 1 ? 'them' : 'it'} to the next firmware wave, after close, with automatic rollback`, why: 'Older builds miss security fixes and are the first to show known bugs.' });
  const bk = devs.filter(d => d.backup && d.backup.st === 'Failed');
  if (bk.length && !out.some(x => x.id === 'cfg')) add({ id: 'backup', area: 'Devices · Config backup', sev: 'warn', problem: `Config backup failed on ${bk.map(d => d.id).join(', ')}${bk[0].backup.why ? ` (${bk[0].backup.why})` : ''}`, ...rb('RB-109', 'Re-run the config backup and verify the hash (RB-109)', 'Without last night\'s backup a rollback would restore an older config.') });

  // lines and capacity
  [p, sc].forEach((ln, k) => { if (ln.tickets90 >= 3) add({ id: `repeat-${ln.id}`, area: `Line · ${k ? 'Backup' : 'Primary'}`, sev: 'warn', problem: `${ln.carrier} ${ln.type} is a repeat offender: ${ln.tickets90} tickets in 90 days${ln.ntf90 ? `, ${ln.ntf90} closed as no fault found` : ''}`, do: { kind: 'carrier', line: ln.id, review: true }, who: 'carrier', action: `Ask ${ln.carrier} for a service review and a full line test; if it repeats, order a replacement circuit`, why: 'The same line keeps failing; the carrier has to fix the cause, not each outage.' }); });
  const cap = D.capacityOf(b);
  if (cap.wanDays != null && cap.wanDays <= 90) add({ id: 'cap-wan', area: 'Capacity · Internet line', sev: cap.wanDays <= 30 ? 'bad' : 'warn', problem: `Main line at ${cap.wanP95}% at peak, growing ${cap.wanGrowth}% a week: full in about ${cap.wanDays} days`, do: { kind: 'change', title: `Bandwidth upgrade for ${p.carrier} ${p.id} at ${b.name}`, risk: 'Low', days: 7 }, who: 'noc', action: `Order a bandwidth upgrade from ${p.carrier} now (lead time is weeks) and move bulk traffic such as camera backups after close`, why: 'Card payments and ERP slow down once the line passes 90% at peak.' });
  if (cap.wifiDays != null && cap.wifiDays <= 90) add({ id: 'cap-wifi', area: 'Capacity · Wi-Fi', sev: cap.wifiDays <= 30 ? 'bad' : 'warn', problem: `Wi-Fi airtime ${cap.wifiPeak}% at peak: limit in about ${cap.wifiDays} days`, do: { kind: 'visit', task: 'Add an access point where airtime is highest (survey from Aruba Central heat map)', skills: ['Aruba Wi-Fi'] }, who: 'field', action: 'Add an access point where the warehouse is busiest (site survey from the Aruba Central heat map)', why: 'Handhelds drop when one AP serves too many clients.' });
  const shown = out.some(x => x.id.startsWith('cap-')) ? cap.pred : [];
  s.predictions.filter(q => q.branchId === b.id && ['New', 'Watching'].includes(q.status) && !shown.includes(q.id)).forEach(q => add({ id: `pred-${q.id}`, area: 'Prediction', sev: q.conf >= 0.8 ? 'warn' : 'info', problem: q.signal, do: { kind: 'module', module: 'predict' }, who: 'noc', action: q.suggest, why: `${Math.round(q.conf * 100)}% confidence, horizon ${q.horizon}. Acting now prevents the incident.` }));

  // what was already done from these screens
  const done = (s.nba || {})[b.id] || {};
  return out.map(f => ({ ...f, done: done[f.id] || null, clk })).sort((a, c2) => !!a.done - !!c2.done || SEV[a.sev] - SEV[c2.sev]);
}

// carry out a next best action; returns the "in hand" note
export function doAction(act, s, b, f, now) {
  const mark = text => act.map('nba', b.id, v => ({ ...(v || {}), [f.id]: { text, at: now, by: act.me() } }));
  const d = f.do;
  if (d.kind === 'runbook') {
    const rb = D.RB[d.rb], g = gate(s, { kind: rb.kind, conf: 0.9, branchId: b.id, now });
    if (rb.kind === 'readonly' || g.auto) { act.audit(`Mova iO ran ${rb.id} ${rb.name} at ${b.name}: ${f.action}`, b.id); act.toast(`${rb.id} ${rb.name} ran at ${b.name}`); return mark(`${rb.id} ran ${hhmm(now)} CT`); }
    const id = `APR-${2300 + Math.floor(Math.random() * 600)}`;
    act.add('approvals', { id, type: 'Runbook', title: `${rb.id} ${rb.name} at ${b.name}`, branchId: b.id, agent: 'runbook', conf: 0.9, risk: 'Low', created: now, status: 'Pending', why: [g.reasons[0] || 'Needs a person to approve', f.action] });
    act.audit(`Requested approval ${id}: ${rb.id} at ${b.name}`, id); act.toast(`${id} sent for approval: ${g.reasons[0] || 'needs a person'}`, 'info'); return mark(`Waiting for approval ${id}`);
  }
  if (d.kind === 'steer') { act.map('steer', b.id, true); act.audit(`RB-101: steered card payments, ERP and voice to the backup line at ${b.name}`, b.id); act.toast('RB-101: payments, ERP and voice moved to the backup line'); return mark(`RB-101 steered ${hhmm(now)} CT`); }
  if (d.kind === 'carrier') {
    const ln = circuitOf(s, d.line), id = D.caseNo(ln.carrier);
    act.add('cases', { id, carrier: ln.carrier, circuit: ln.id, inc: null, branchId: b.id, opened: now, status: d.review ? 'Service review requested' : 'Opened – evidence pack sent', eta: d.review ? null : now + 4 * HR, lastUpdate: now, evidence: ['60-min loss and latency graph', 'MTR from the EdgeConnect', 'Circuit ID and demarc details', ...(d.review ? [`${ln.tickets90} tickets in 90 days`] : [])] });
    act.audit(`${d.review ? 'Service review' : 'Carrier case'} ${id} opened with ${ln.carrier} for ${ln.id} at ${b.name}`, id); act.toast(`${ln.carrier} case ${id} opened`); return mark(`${ln.carrier} case ${id}`);
  }
  if (d.kind === 'visit') {
    const id = `WO00${43000 + Math.floor(Math.random() * 900)}`, clk = branchClock(b, now);
    act.add('workOrders', { id, branchId: b.id, inc: null, task: d.task, skills: d.skills || [], parts: [], tech: null, status: 'Unassigned', created: now, window: clk.open ? `After ${b.hours.close} local unless urgent` : 'Any time', priority: f.sev === 'bad' ? 'P2' : 'P4' });
    act.audit(`Visit ${id} requested for ${b.name}: ${d.task}`, id); act.toast(`${id} created; Mova iO is matching a technician`); return mark(`Visit ${id}`);
  }
  if (d.kind === 'change') {
    const id = `CHG00${32100 + Math.floor(Math.random() * 800)}`, start = now + (d.days || 1) * DAY;
    act.add('changes', { id, title: d.title, type: 'Normal', risk: d.risk || 'Low', state: 'Scheduled', start, end: start + 2 * HR, window: `After ${b.hours.close} local`, scope: b.region, devices: 1, owner: act.me(), validation: 'Pending', nac: `sites/${b.code}` });
    act.audit(`Scheduled ${id}: ${d.title}`, id); act.toast(`${id} scheduled for ${dateShort(start)} after close`); return mark(`${id} on ${dateShort(start)}`);
  }
  if (d.kind === 'vendor') { const id = `HPE-${5400000 + Math.floor(Math.random() * 90000)}`; act.audit(`Vendor case ${id} opened with HPE Aruba: ${d.what} at ${b.name}`, b.id); act.toast(`HPE Aruba case ${id} opened`); return mark(`HPE case ${id}`); }
  if (d.kind === 'notify') { act.audit(`Branch manager at ${b.name} told: ${f.action}`, b.id); act.toast('Sent to the branch manager (Teams and SMS)'); return mark(`Branch told ${hhmm(now)} CT`); }
  if (d.kind === 'inc') return act.openInc(d.id);
  if (d.kind === 'case') return act.go('carriers');
  if (d.kind === 'module') return act.go(d.module);
}

const DO_LABEL = { runbook: f => (D.RB[f.do.rb].kind === 'readonly' || f.clk && !f.clk.open) ? `Run ${f.do.rb}` : `Request ${f.do.rb}`, steer: () => 'Steer now', carrier: f => f.do.review ? 'Ask for review' : 'Open case', visit: () => 'Book visit', change: () => 'Schedule', vendor: () => 'Open vendor case', notify: () => 'Tell branch', inc: () => 'Open plan', case: () => 'View case', module: () => 'Open' };
const isAct = f => !['inc', 'case', 'module'].includes(f.do.kind);

// the full list, for Branch 360
export function NextBestActions({ b }) {
  const { s, act } = useApp(); const now = useNow();
  const list = branchActions(s, b, now);
  const open = list.filter(f => !f.done);
  return (
    <Card title="Next best actions" icon={I.ListChecks} sub={open.length ? `${open.length} thing${open.length > 1 ? 's' : ''} to act on at this branch, worst first: what to do, who does it and why. Mova iO carries out the action; while the branch is open, changes wait for approval.` : 'Nothing to act on: every check passes and no device, line or capacity risk is open.'} className="mt-3">
      {list.length ? <div className="divide-y divide-line">{list.map(f => { const W = who(f.who), Ic = ICON[f.who] || I.Headset; return (
        <div key={f.id} className={cx('grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] gap-x-4 gap-y-1 py-2.5', f.done && 'opacity-70')}>
          <div className="min-w-0 flex gap-2"><span className={cx('mt-1 w-2 h-2 rounded-full shrink-0', f.sev === 'bad' ? 'bg-bad' : f.sev === 'warn' ? 'bg-warn' : 'bg-info')} /><div className="min-w-0"><div className="text-[11px] font-bold uppercase tracking-wide text-ink3">{f.area}</div><div className="text-[12.5px] text-ink leading-snug">{f.problem}</div></div></div>
          <div className="min-w-0"><div className="text-[13px] font-semibold text-ink leading-snug flex gap-1.5"><I.ArrowRight size={14} className="mt-0.5 shrink-0 text-brand" />{f.action}</div><div className="text-[11.5px] text-ink2 leading-snug mt-0.5 ml-5">{f.why}</div>
            <div className="text-[11.5px] text-ink3 mt-0.5 ml-5 flex items-center gap-1"><Ic size={12} />{W.label}{W.who ? ` · ${W.who}` : ''}</div></div>
          <div className="md:text-right whitespace-nowrap">{f.done ? <Badge tone="green"><I.Check size={11} />In hand: {f.done.text}</Badge>
            : <Btn op={isAct(f)} size="sm" kind={f.sev === 'bad' ? 'brand' : 'secondary'} icon={isAct(f) ? I.Zap : I.ArrowUpRight} onClick={() => doAction(act, s, b, f, Date.now())}>{DO_LABEL[f.do.kind](f)}</Btn>}</div>
        </div>); })}</div> : <div className="text-[12.5px] text-ok flex items-center gap-1.5"><I.CheckCircle2 size={15} />All clear.</div>}
    </Card>
  );
}

// the first action, for a row in the readiness table
export function NextActionCell({ b }) {
  const { s, act } = useApp(); const now = useNow();
  const list = branchActions(s, b, now).filter(f => f.area.startsWith('Readiness') || f.area.startsWith('Incident'));
  const f = list.find(x => !x.done) || list[0];
  if (!f) return <span className="text-[12px] text-ink3">No action</span>;
  const more = list.filter(x => !x.done).length - 1;
  return (
    <div className="flex items-center gap-1.5 min-w-[230px] max-w-[330px]">
      <div className="min-w-0 flex-1"><div className="text-[12px] text-ink leading-snug line-clamp-2" title={`${f.action}. ${f.why}`}>{f.action}</div>
        <div className="text-[11px] text-ink3">{who(f.who).label}{more > 0 && <button onClick={() => act.openBranch(b.id)} className="ml-1 text-info hover:underline">+{more} more</button>}</div></div>
      {f.done ? <Badge tone="green">In hand</Badge> : <Btn op={isAct(f)} size="xs" kind={f.sev === 'bad' ? 'brand' : 'secondary'} icon={isAct(f) ? I.Zap : I.ArrowUpRight} title={DO_LABEL[f.do.kind](f)} onClick={() => doAction(act, s, b, f, Date.now())}>{DO_LABEL[f.do.kind](f)}</Btn>}
    </div>
  );
}
