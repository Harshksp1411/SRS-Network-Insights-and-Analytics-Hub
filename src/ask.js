import * as D from './data.js';
import { healthOf, circuitOf, branchClock, slaClock, gate } from './store.jsx';
import { dur, hhmm, ago, dt, MIN, HR, DAY, pct, num } from './util.js';

export const CANNED = {
  noc: ['What failed overnight?', 'Which incidents are close to breaching SLA?', 'Which branches are running on backup right now?', 'Which approvals are waiting on a human?'],
  l3: ['Which carriers breached this week?', 'Where is config drift?', 'What changes are scheduled in the next 72 hours?', 'Firmware compliance by model'],
  storeops: ['Which branches are not ready to open?', 'Is Dallas #3 ready to open?', 'Which branches are on backup and slower?', 'What did we tell branches today?'],
  bm: ['Is my branch ready to open?', 'Why is anything slow at my branch?', 'When is the technician arriving?', 'Any changes planned at my branch?'],
  tech: ['What are my jobs today?', 'Which spares are in my depot?', 'Which branch hours limit my visits?', 'Unassigned work near me'],
  mna: ["Status of this weekend's acquisition cutovers", 'Which onboarding projects are red?', 'Is the newest branch at Day-1 parity?', 'How many acquisitions are in flight?'],
  sec: ['Which devices are below firmware policy?', 'High-severity config drift', 'Is the PCI segment isolated at the cutover site?', 'Who approved changes today?'],
};

const L = (label, module, extra = {}) => ({ label, module, extra });
const bl = b => `${b.name}, ${b.brand}`;

function findBranchInText(q) {
  const t = q.toLowerCase();
  const m = t.match(/br-?(\d{4})/); if (m) return D.BR[`BR-${m[1]}`];
  let best = null;
  for (const b of D.BRANCHES) {
    const name = b.name.toLowerCase();
    if (t.includes(name)) { if (!best || name.length > best.name.length) best = b; }
  }
  if (best) return best;
  for (const b of D.BRANCHES) if (t.includes(b.city.toLowerCase())) return b;
  return null;
}

function readinessOf(s, b, now) {
  const h = healthOf(s, b);
  const run = s.readiness[b.id];
  const fails = run ? run.results.filter(r => r.st === 'fail') : [];
  const openInc = s.incidents.filter(i => i.branchId === b.id && i.state !== 'Resolved');
  const p = circuitOf(s, b.wan[0]), sc = circuitOf(s, b.wan[1]);
  const issues = [];
  if (h === 'down') issues.push('Branch is unreachable');
  if (p.status !== 'Up') issues.push(`Primary ${p.carrier} ${p.type} is ${p.status.toLowerCase()} – running on ${sc.type}`);
  if (sc.status !== 'Up') issues.push(`Backup ${sc.carrier} ${sc.type} is ${sc.status.toLowerCase()} – no failover path`);
  fails.forEach(f => issues.push(`Readiness check failed: ${f.name}`));
  openInc.forEach(i => issues.push(`${i.id} ${i.pri}: ${i.title}`));
  const verdict = h === 'down' ? 'Not ready' : issues.length ? 'Ready with issues' : 'Ready';
  return { verdict, issues, clock: branchClock(b, now), openInc };
}

export function answer(s, q, now) {
  const t = q.toLowerCase();
  const open = s.incidents.filter(i => i.state !== 'Resolved');
  const role = s.role;

  const im = q.toUpperCase().match(/INC\d{7}/);
  if (im) {
    const i = [...s.incidents, ...s.resolved].find(x => x.id === im[0]);
    if (!i) return { title: `${im[0]} not found`, lines: ['Check the number – it may be outside the 7-day window.'], src: 'ServiceNow', links: [] };
    const c = slaClock(i, now); const b = D.BR[i.branchId];
    return { title: `${i.id} ${i.pri} – ${i.state}`, lines: [i.title, { k: 'Branch', v: bl(b) }, { k: 'Owner', v: i.assignee || 'unassigned' }, { k: 'SLA', v: i.state === 'Resolved' ? `resolved in ${dur(i.resolved - i.opened)}` : c.resLeft < 0 ? 'breached' : `${dur(c.resLeft)} left (${Math.round(c.used * 100)}% used)` }, { k: 'Top cause', v: i.rca[0] ? `${i.rca[0].cause} (${Math.round(i.rca[0].conf * 100)}%)` : 'diagnosing' }, { k: 'Next', v: i.carrierCase ? `carrier case ${i.carrierCase}` : i.workOrder ? `work order ${i.workOrder}` : i.runbook ? `${i.runbook} – ${i.rbState}` : 'monitor' }], src: 'ServiceNow, Mova iO', links: [{ label: 'Open incident', module: 'incidents', extra: { selInc: i.id } }] };
  }
  if (/overnight|last night|failed overnight/.test(t)) {
    const start = now - 14 * HR;
    const items = [...s.incidents, ...s.resolved].filter(i => i.opened >= start && i.opened <= now).sort((a, b) => a.opened - b.opened);
    const night = items.filter(i => { const h = new Date(i.opened).getUTCHours(); return true; });
    const res = night.filter(i => i.state === 'Resolved');
    return { title: `Overnight (last 14 h): ${night.length} incidents`, lines: [
      `${res.length} resolved, ${night.length - res.length} still open. ${res.filter(i => i.closeCode === 'After-hours mended').length} were mended after hours with no branch impact.`,
      ...night.filter(i => i.state !== 'Resolved').slice(0, 6).map(i => ({ k: `${i.id} ${i.pri}`, v: `${i.title} – ${bl(D.BR[i.branchId])}`, inc: i.id })),
      ...res.slice(-3).map(i => ({ k: `${i.id} (resolved)`, v: `${i.title} – ${i.closeCode}`, inc: i.id })),
    ], src: 'ServiceNow incidents, OpsRamp events', links: [L('Open Live Incidents', 'incidents'), L('Shift handover report', 'reports', { tab: { reports: 'handover' } })] };
  }
  if (/breach/.test(t) && /carrier/.test(t)) {
    const cases = s.cases.filter(c => now - c.opened < 7 * DAY);
    const late = cases.filter(c => c.eta && now > c.eta && !c.closed);
    const by = {}; cases.forEach(c => by[c.carrier] = (by[c.carrier] || 0) + 1);
    return { title: 'Carrier performance this week', lines: [
      `${cases.length} carrier cases opened in 7 days; ${late.length} past the carrier's committed restore time right now.`,
      ...D.SCORECARD.filter(x => x.slaMet < 0.9).map(x => ({ k: x.carrier, v: `Restore-time commitment met ${pct(x.slaMet, 0)} (6-mo), MTTR ${x.mttr} h, ${x.repeat} repeat-offender circuits` })),
      ...Object.entries(by).map(([k, v]) => ({ k: `${k} – this week`, v: `${v} case${v > 1 ? 's' : ''}` })),
    ], src: 'Carrier cases (ServiceNow), scorecard', links: [L('Carrier scorecard', 'carriers', { tab: { carriers: 'scorecard' } })] };
  }
  if (/close to breach|breaching|sla risk|near breach/.test(t)) {
    const r = open.map(i => ({ i, c: slaClock(i, now) })).filter(x => x.c.used > 0.5 || (x.c.respLeft != null && x.c.respLeft < 10 * MIN)).sort((a, b) => b.c.used - a.c.used);
    return { title: `${r.length} incidents above 50% of their SLA clock`, lines: r.length ? r.slice(0, 8).map(({ i, c }) => ({ k: `${i.id} ${i.pri}`, v: `${Math.round(c.used * 100)}% used, ${c.resLeft > 0 ? dur(c.resLeft) + ' left' : 'BREACHED'} – ${i.title}`, inc: i.id })) : ['Nothing at risk right now.'], src: 'SLA clocks (Annexure B targets)', links: [L('SLA & KPI tracker', 'sla')] };
  }
  if (/backup|on lte|failover/.test(t) && !/spare/.test(t)) {
    const list = D.BRANCHES.filter(b => circuitOf(s, b.wan[0]).status !== 'Up');
    return { title: `${list.length} branches running on their backup path`, lines: list.slice(0, 10).map(b => { const c = circuitOf(s, b.wan[0]); const s2 = circuitOf(s, b.wan[1]); return { k: bl(b), v: `${c.carrier} ${c.type} ${c.status.toLowerCase()} → on ${s2.carrier} ${s2.type}${s2.type === 'LTE/5G' ? ' (Roof Hub and ERP slower, POS fine)' : ''}`, branch: b.id }; }), src: 'EdgeConnect Orchestrator path state', links: [L('Operations overview', 'overview')] };
  }
  if (/approval|waiting on/.test(t) && !/who approved/.test(t)) {
    const p = s.approvals.filter(a => a.status === 'Pending');
    return { title: `${p.length} actions waiting for a human`, lines: p.map(a => ({ k: `${a.id}, ${Math.round(a.conf * 100)}%`, v: `${a.title} – ${a.why[0]}` })), src: 'Approvals queue (ServiceNow)', links: [L('Open approvals', 'changes', { tab: { changes: 'approvals' } })] };
  }
  if (/drift/.test(t)) {
    const d = s.drift.filter(x => !/high/.test(t) || x.sev === 'High');
    return { title: `${d.length} devices drifted from the golden config`, lines: d.map(x => ({ k: `${x.device} (${x.sev})`, v: `${x.item} – ${x.source}` })), src: 'Network-as-Code repo vs nightly backups', links: [L('Drift detection', 'changes', { tab: { changes: 'drift' } })] };
  }
  if (/scheduled|next 72|changes planned|any changes/.test(t)) {
    const b = role === 'bm' ? D.BR[s.bmBranch] : null;
    const ch = s.changes.filter(c => c.start > now && c.start < now + (b ? 14 : 3) * DAY && (!b || c.scope === 'All regions' || c.scope === b.region));
    return { title: b ? `Changes that could touch ${bl(b)} (14 days)` : `${ch.length} changes in the next 72 hours`, lines: ch.length ? ch.map(c => ({ k: c.id, v: `${c.title} – ${c.window} – ${c.state}` })) : ['No changes planned.'], src: 'ServiceNow change calendar', links: [L('Change calendar', 'changes', { tab: { changes: 'calendar' } })] };
  }
  if (/firmware/.test(t)) {
    const groups = {};
    D.DEVICES.forEach(d => { const k = d.type === 'AP' ? 'AP' : d.model; const list = D.FW_TARGET[k]; const idx = list.indexOf(d.fw); (groups[k] = groups[k] || { n: 0, ok: 0, bad: [] }); groups[k].n++; const crit = d.type === 'SD-WAN'; const okLvl = crit ? 1 : 2; if (idx <= okLvl) groups[k].ok++; else groups[k].bad.push(d); });
    const below = Object.values(groups).reduce((s, g) => s + g.bad.length, 0);
    return { title: `${num(below)} devices below firmware policy`, lines: ['Policy: critical devices (EdgeConnect) at N-1 or newer; others at N-2 or newer.', ...Object.entries(groups).map(([k, g]) => ({ k: k === 'AP' ? 'Access points' : k, v: `${pct(g.ok / g.n)} compliant – ${g.bad.length} below policy` }))], src: 'Aruba Central + Orchestrator inventory', links: [L('Firmware compliance', 'changes', { tab: { changes: 'firmware' } })] };
  }
  if (/ready to open|ready\?|not ready|my branch ready/.test(t)) {
    const b = /my branch/.test(t) ? D.BR[s.bmBranch] : findBranchInText(q);
    if (b) {
      const r = readinessOf(s, b, now);
      return { title: `${bl(b)}: ${r.verdict}`, lines: [`Local time ${r.clock.local}. ${r.clock.open ? 'Branch is open now.' : r.clock.opens ? `Opens ${r.clock.opens}.` : 'Closed today.'}`, ...(r.issues.length ? r.issues.map(x => ({ k: '•', v: x })) : [{ k: '✓', v: 'SD-WAN both paths, ERP/POS path, Wi-Fi, scanners, printers, delivery tracking all passing' }])], src: 'Readiness checks, Orchestrator, Aruba Central', links: [L('Branch readiness', 'readiness', { filters: { region: 'All', city: 'All', brand: 'All', branchId: b.id } })] };
    }
    const nr = D.BRANCHES.map(b => ({ b, r: readinessOf(s, b, now) })).filter(x => x.r.verdict !== 'Ready');
    return { title: `${nr.length} branches not fully ready`, lines: nr.slice(0, 10).map(({ b, r }) => ({ k: bl(b), v: `${r.verdict}: ${r.issues[0]}`, branch: b.id })), src: 'Readiness checks', links: [L('Branch readiness', 'readiness')] };
  }
  if (/slow|why is/.test(t)) {
    const b = /my branch/.test(t) || role === 'bm' ? D.BR[s.bmBranch] : findBranchInText(q);
    if (b) { const r = readinessOf(s, b, now); return { title: `What's affecting ${bl(b)}`, lines: r.issues.length ? r.issues : ['Nothing open. Both WAN paths clean; POS path 190 ms; Roof Hub p95 0.7 s.'], src: 'OpsRamp, Orchestrator, synthetic tests', links: [L('Overview for this branch', 'overview', { filters: { region: 'All', city: 'All', brand: 'All', branchId: b.id } })] }; }
  }
  if (/technician arriving|tech arriving|when is the tech/.test(t)) {
    const b = D.BR[s.bmBranch];
    const wos = s.workOrders.filter(w => w.branchId === b.id && w.status !== 'Completed');
    return { title: wos.length ? `${wos.length} visit(s) for ${bl(b)}` : `No technician visits booked for ${bl(b)}`, lines: wos.map(w => ({ k: w.id, v: `${w.task} – ${w.status}${w.eta ? `, ETA ${hhmm(w.eta, b.tz)} local` : ''}` })), src: 'ServiceNow work orders', links: [L('Field dispatch', 'dispatch')] };
  }
  if (/my jobs|jobs today|unassigned work/.test(t)) {
    const me = s.techs.find(x => x.name === 'Carlos M.') || s.techs[0];
    const mine = /unassigned/.test(t) ? s.workOrders.filter(w => !w.tech) : s.workOrders.filter(w => w.tech === me.id);
    return { title: /unassigned/.test(t) ? `${mine.length} unassigned work orders` : `${me.name}: ${mine.length} job(s)`, lines: mine.length ? mine.map(w => ({ k: w.id, v: `${bl(D.BR[w.branchId])} – ${w.task} (${w.window})` })) : ['No jobs assigned yet.'], src: 'ServiceNow work orders', links: [L('Field dispatch', 'dispatch')] };
  }
  if (/spares|depot/.test(t)) {
    return { title: 'Depot spares', lines: s.depots.slice(0, 6).map(d => ({ k: d.city, v: Object.entries(d.spares).map(([k, v]) => `${k} ${v}`).join(', ') })), src: 'Depot stock', links: [L('Depot spares', 'dispatch', { tab: { dispatch: 'depots' } })] };
  }
  if (/branch hours|limit my visits/.test(t)) {
    return { title: 'Branch hours that shape visits', lines: ['Roofing branches open 06:30–17:00 local weekdays; ~45% also Saturday 07:00–12:00.', 'Pool branches 07:00–17:00, most open Saturday 08:00–12:00.', 'Changes and reboots: only outside hours unless the device is already down (P1/P2).', 'Yard work with a lift: avoid 07:00–09:00 truck loading.'], src: 'Branch profiles', links: [L('Field dispatch', 'dispatch')] };
  }
  if (/pci/.test(t)) {
    return { title: 'PCI segment at LS Building Products cutover site', lines: [{ k: 'VLAN 20', v: 'POS / payments, own policy; no routes to VLAN 10/30/50/60' }, { k: 'Gate 8', v: 'POS / payment test – must pass before StoreOps sign-off' }, { k: 'Legacy POS', v: 'Replaced with SRS standard; old units recycled with data destruction certificate' }], src: 'NaC site file sites/ls-building-products/il-01.yaml', links: [L('Kit & VLANs', 'biab', { tab: { biab: 'kit' } })] };
  }
  if (/cutover|this weekend/.test(t)) {
    const p = s.projects.filter(p => p.stage === 'Cutover' || p.stage === 'Kit staged');
    return { title: `${p.length} cutovers in the next weekends`, lines: p.map(x => { const pass = x.gates.filter(g => g.st === 'Pass').length; const fail = x.gates.filter(g => g.st === 'Fail').length; return { k: `${x.brand} – ${x.site}`, v: `${x.stage}, ${x.rag}. Gates ${pass}/13 passed${fail ? `, ${fail} FAILED` : ''}. Go-live ${dt(x.golive)}. ${x.blockers[0] || ''}` }; }), src: 'Branch-in-a-Box projects', links: [L('Cutover tracker', 'biab', { tab: { biab: 'cutover' } })] };
  }
  if (/red|blocked|at risk/.test(t) && /project|onboard/.test(t)) {
    const p = s.projects.filter(p => p.rag !== 'Green');
    return { title: `${p.length} onboarding projects not green`, lines: p.map(x => ({ k: `${x.id} ${x.brand} (${x.rag})`, v: x.blockers.join('; ') || x.stage })), src: 'Branch-in-a-Box portfolio', links: [L('Portfolio', 'biab')] };
  }
  if (/parity|day-1|day 1/.test(t)) {
    return { title: 'Day-1 parity – newest branch', lines: ['American Roofing Supply – Nampa, ID (hypercare day 3): 100% parity.', { k: 'Telemetry', v: 'OpsRamp, Central, Orchestrator, syslog, synthetic probes – all reporting' }, { k: 'Automation', v: '10/10 runbooks enabled' }, { k: 'AI coverage', v: '9/9 agents scoped to the site' }, { k: 'CMDB', v: '9 CIs with relationships' }], src: 'Day-1 parity check', links: [L('Day-1 parity', 'biab', { tab: { biab: 'parity' } })] };
  }
  if (/acquisitions in flight|how many acquisitions/.test(t)) {
    const a = s.projects.filter(p => p.track === 'Acquired' && p.stage !== 'BAU');
    return { title: `${a.length} acquired-branch projects in flight`, lines: a.map(x => ({ k: x.brand, v: `${x.site} – ${x.stage} (${x.rag})` })), src: 'Branch-in-a-Box portfolio', links: [L('Portfolio', 'biab')] };
  }
  if (/who approved/.test(t)) {
    const a = s.audit.filter(x => /approv/i.test(x.what));
    return { title: `${a.length} approvals logged this session`, lines: a.length ? a.slice(0, 8).map(x => ({ k: hhmm(x.t), v: `${x.who}: ${x.what}` })) : ['No approvals recorded yet in this shift.'], src: 'Audit log', links: [L('Audit log', 'reports', { tab: { reports: 'audit' } })] };
  }
  if (/told branches|tell branches|comms/.test(t)) {
    const c = s.incidents.flatMap(i => i.agentSteps.filter(a => a.agent === 'comms').map(a => ({ ...a, inc: i.id })));
    return { title: `${c.length} branch notifications sent`, lines: c.slice(0, 8).map(a => ({ k: `${hhmm(a.t)} ${a.inc}`, v: a.text, inc: a.inc })), src: 'Comms Agent log', links: [] };
  }
  // fallback: branch or search
  const b = findBranchInText(q);
  if (b) { const r = readinessOf(s, b, now); return { title: `${bl(b)}`, lines: [`Health: ${healthOf(s, b)}. ${r.clock.local}, ${r.clock.open ? 'open' : 'closed'}.`, ...r.issues.slice(0, 5)], src: 'All sources', links: [L('Open branch', 'overview', { selBranch: b.id })] }; }
  const kb = s.kb.filter(k => t.split(/\s+/).some(w => w.length > 3 && (k.title.toLowerCase().includes(w) || k.tags.join(' ').includes(w))));
  if (kb.length) return { title: `Knowledge matches for "${q}"`, lines: kb.slice(0, 4).map(k => ({ k: k.id, v: k.title })), src: 'Knowledge base', links: [L('Knowledge', 'knowledge')] };
  return { title: 'I could not match that to live data', lines: ['Try a branch name (e.g. "Is Tampa #2 ready to open?"), an incident number, or one of the suggested questions.'], src: '', links: [] };
}
