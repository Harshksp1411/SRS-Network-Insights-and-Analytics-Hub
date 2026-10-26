import React, { createContext, useContext, useReducer, useEffect, useState, useMemo, useRef } from 'react';
import * as D from './data.js';
import { parts, pad, MIN, HR, uid, tzAbbr } from './util.js';

export const ROLES = [
  { id: 'noc', name: 'NOC Engineer', home: 'incidents', who: 'Priya S.' },
  { id: 'l3', name: 'Network Engineer L3', home: 'changes', who: 'Marcus L.' },
  { id: 'storeops', name: 'StoreOps Lead', home: 'readiness', who: 'Jenna H.' },
  { id: 'bm', name: 'Branch Manager', home: 'overview', who: 'Rick D.', branch: true },
  { id: 'tech', name: 'Field Technician', home: 'dispatch', who: 'Carlos M.' },
  { id: 'mna', name: 'M&A Integration Lead', home: 'biab', who: 'Alicia R.' },
  { id: 'sec', name: 'Security Lead', home: 'changes', who: 'Omar N.', tab: 'firmware' },
];

const clone = x => JSON.parse(JSON.stringify(x));
function init() {
  const theme = (() => { try { return localStorage.getItem('srs-hub-theme') || 'light'; } catch { return 'light'; } })();
  const bmBranch = D.findBranch('Dallas', 'SRS Building Products');
  return {
    role: 'noc', theme, module: 'overview', tab: {}, filters: { region: 'All', city: 'All', brand: 'All', branchId: null }, b360: null, maint: {},
    bmBranch: bmBranch.id,
    branchHealth: {}, // id -> 'up' | 'degraded' | 'down'
    circuitState: {}, // id -> {status, jit, loss, lat}
    incidents: clone(D.INCIDENTS), resolved: clone(D.RESOLVED),
    approvals: clone(D.APPROVALS), changes: clone(D.CHANGES), freezes: clone(D.FREEZES), drift: clone(D.DRIFT),
    workOrders: clone(D.WORK_ORDERS), techs: clone(D.TECHS), depots: clone(D.DEPOTS), cases: clone(D.CARRIER_CASES),
    predictions: clone(D.PREDICTIONS), kb: clone(D.KB), kbDrafts: clone(D.KB_DRAFTS), problems: clone(D.PROBLEMS),
    runbooks: clone(D.RUNBOOKS), runs: [], projects: clone(D.PROJECTS), readiness: {}, watches: [],
    audit: [
      { t: Date.now() - 3 * MIN, who: 'Mova iO', what: 'Shift handover accepted – open incidents carried over from overnight', ref: '' },
      { t: Date.now() - 52 * MIN, who: 'Marcus L. (Network Engineer L3)', what: 'Approved CHG0031869 ECOS 9.4.2.6 – Texas wave 2 (CAB)', ref: 'CHG0031869' },
      { t: Date.now() - 95 * MIN, who: 'Omar N. (Security Lead)', what: 'Approved CHG0031895 LS Building Products cutover – PCI plan reviewed', ref: 'CHG0031895' },
      { t: Date.now() - 140 * MIN, who: 'Runbook Agent', what: 'RB-109 re-ran 6 failed config backups after TACACS+ timeout – all OK', ref: 'RB-109' },
      { t: Date.now() - 200 * MIN, who: 'Kevin T. (NOC Engineer)', what: 'Approved RB-102 return to primary at Mobile #2 (after 30 clean minutes)', ref: '' },
    ],
    toasts: [], selInc: null, selBranch: null, askOpen: false, askLog: [], scenario: null, scenarioLog: [], notif: 3, wizard: false, guide: false,
  };
}

function reducer(s, a) {
  switch (a.type) {
    case 'set': return { ...s, ...(typeof a.patch === 'function' ? a.patch(s) : a.patch) };
    case 'add': return { ...s, [a.key]: a.front === false ? [...s[a.key], a.item] : [a.item, ...s[a.key]] };
    case 'upd': return { ...s, [a.key]: s[a.key].map(x => x.id === a.id ? { ...x, ...(typeof a.patch === 'function' ? a.patch(x) : a.patch) } : x) };
    case 'del': return { ...s, [a.key]: s[a.key].filter(x => x.id !== a.id) };
    case 'map': return { ...s, [a.key]: { ...s[a.key], [a.id]: typeof a.val === 'function' ? a.val(s[a.key][a.id]) : a.val } };
    default: return s;
  }
}

const Ctx = createContext(null);
const NowCtx = createContext(Date.now());

export function AppProvider({ children }) {
  const [s, d] = useReducer(reducer, null, init);
  const sRef = useRef(s); sRef.current = s;
  const act = useMemo(() => {
    const role = () => ROLES.find(r => r.id === sRef.current.role);
    const A = {
      get: () => sRef.current,
      set: patch => d({ type: 'set', patch }),
      add: (key, item, front = true) => d({ type: 'add', key, item, front }),
      upd: (key, id, patch) => d({ type: 'upd', key, id, patch }),
      del: (key, id) => d({ type: 'del', key, id }),
      map: (key, id, val) => d({ type: 'map', key, id, val }),
      me: () => role().who + ' (' + role().name + ')',
      audit: (what, ref = '', who) => d({ type: 'add', key: 'audit', item: { t: Date.now(), who: who || A.me(), what, ref } }),
      toast: (msg, tone = 'ok') => { const id = uid('t'); d({ type: 'set', patch: st => ({ toasts: [...st.toasts.slice(-2), { id, msg, tone }] }) }); setTimeout(() => d({ type: 'del', key: 'toasts', id }), 6000); },
      dismissToast: id => d({ type: 'del', key: 'toasts', id }),
      go: (module, extra = {}) => d({ type: 'set', patch: { module, selInc: null, ...extra } }),
      openInc: id => d({ type: 'set', patch: { module: 'incidents', selInc: id } }),
      openBranch: id => d({ type: 'set', patch: { module: 'b360', b360: id, selInc: null, selBranch: null } }),
      setTab: (mod, tab) => d({ type: 'set', patch: st => ({ tab: { ...st.tab, [mod]: tab } }) }),
      note: (incId, text, who) => d({ type: 'upd', key: 'incidents', id: incId, patch: x => ({ notes: [...x.notes, { t: Date.now(), who: who || A.me(), text }] }) }),
    };
    return A;
  }, []);
  useEffect(() => { document.documentElement.classList.toggle('dark', s.theme === 'dark'); try { localStorage.setItem('srs-hub-theme', s.theme); } catch { } }, [s.theme]);
  return <Ctx.Provider value={{ s, act }}>{children}</Ctx.Provider>;
}
export const useApp = () => useContext(Ctx);

export function NowProvider({ children }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  return <NowCtx.Provider value={now}>{children}</NowCtx.Provider>;
}
export const useNow = () => useContext(NowCtx);

// ---------- derived helpers ----------
export const healthOf = (s, b) => s.branchHealth[b.id] || b.health;
export const circuitOf = (s, id) => ({ ...D.CIR[id], ...(s.circuitState[id] || {}) });
// A line as the business sees it: both lines count as down when the branch is unreachable
export const lineOf = (s, b, k) => healthOf(s, b) === 'down' ? { ...circuitOf(s, b.wan[k]), status: 'Down' } : circuitOf(s, b.wan[k]);
// On the backup line: the primary is down (or traffic was steered off it) and the branch still has a working line
export const onBackupOf = (s, b) => healthOf(s, b) !== 'down' && (circuitOf(s, b.wan[0]).status === 'Down' || !!(s.steer && s.steer[b.id]));

const toMin = hm => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
export function branchClock(b, now) {
  const p = parts(now, b.tz);
  const cur = p.h * 60 + p.m;
  const sat = p.dow === 'Sat', sun = p.dow === 'Sun';
  let open = false, opens = null, closes = null;
  if (!sat && !sun) { open = cur >= toMin(b.hours.open) && cur < toMin(b.hours.close); opens = b.hours.open; closes = b.hours.close; }
  else if (sat && b.hours.sat) { const [o, c] = b.hours.sat.split('-'); open = cur >= toMin(o) && cur < toMin(c); opens = o; closes = c; }
  const minsToOpen = opens && cur < toMin(opens) ? toMin(opens) - cur : null;
  return { open, local: `${pad(p.h)}:${pad(p.m)} ${tzAbbr(b.tz)}`, opens, closes, minsToOpen, dow: p.dow, closedToday: !opens };
}
export function activeFreeze(s, region, now) {
  return s.freezes.find(f => now >= f.start && now <= f.end && (f.scope === 'All regions' || f.scope === region));
}
// The human-in-the-loop rule used everywhere an agent wants to act.
export function gate(s, { kind = 'change', conf = 1, branchId, now, emergency = false }) {
  const reasons = [];
  const b = branchId && D.BR[branchId];
  if (conf < 0.8) reasons.push(`Confidence ${Math.round(conf * 100)}% is below the 80% gate`);
  if (kind === 'change' && b) {
    const c = branchClock(b, now);
    if (c.open && !emergency) reasons.push(`Branch is open (${c.local}) – no autonomous changes during branch hours`);
    const f = activeFreeze(s, b.region, now);
    if (f) reasons.push(`Freeze window active: ${f.name}`);
  }
  return { auto: reasons.length === 0, reasons };
}
export function filteredBranches(s) {
  const f = s.filters;
  if (s.role === 'bm') return [D.BR[s.bmBranch]];
  return D.BRANCHES.filter(b => matchF(f, b));
}
export function inScope(s, branchId) {
  const f = s.filters; const b = D.BR[branchId]; if (!b) return true;
  if (s.role === 'bm') return branchId === s.bmBranch;
  return matchF(f, b);
}
export const cityKey = b => `${b.city}, ${b.state}`;
export function matchF(f, b) { return (f.region === 'All' || b.region === f.region) && (!f.city || f.city === 'All' || cityKey(b) === f.city) && (f.brand === 'All' || b.brand === f.brand) && (!f.branchId || b.id === f.branchId); }
export function slaClock(inc, now) {
  const sla = D.slaOf(inc.pri);
  const respDue = inc.opened + sla.resp, resDue = inc.opened + sla.res;
  const respLeft = inc.acked ? null : respDue - now;
  const end = inc.resolved || now;
  const resLeft = resDue - end;
  const used = (end - inc.opened) / sla.res;
  return { respDue, resDue, respLeft, resLeft, used, respBreached: inc.acked ? inc.acked > respDue : now > respDue, resBreached: end > resDue, risk: used > 0.75 ? 'High' : used > 0.5 ? 'Medium' : 'Low' };
}
