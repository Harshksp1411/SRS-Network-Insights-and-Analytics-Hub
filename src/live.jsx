import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import * as D from './data.js';
import { useApp } from './store.jsx';
import { parts, MIN } from './util.js';
import { seedX, tickX } from './liveext.js';

// Live simulation engine: every tick it streams telemetry, raw events and their correlation outcome,
// moves the rolling metric series, and now and then raises / acknowledges / auto-resolves incidents
// and flaps circuits – so every screen behaves like a console attached to OpsRamp, Central and ServiceNow.
const TICK = 2000, KEEP = 150; // 150 × 2 s = 5 minutes of live history
const LiveCtx = createContext(null);

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const walk = (prev, target, vol, lo, hi) => Math.max(lo, Math.min(hi, prev + (target - prev) * 0.18 + rnd(-vol, vol)));

function seedSeries(base, vol, lo, hi) { const a = []; let v = base; for (let i = 0; i < KEEP; i++) { v = walk(v, base, vol, lo, hi); a.push(+v.toFixed(1)); } return a; }
function eventsSoFarToday() { const p = parts(Date.now()); return Math.round((p.h * 60 + p.m) * 52 + p.s * 0.8); }

const EV = [
  { w: 22, cat: 'carriers', src: 'Orchestrator', make: (b, d) => ({ msg: `${b.code}-wan${pick([1, 2])} loss ${rnd(0.6, 1.9).toFixed(1)}% for 40 s, recovered`, sev: 'Minor', out: 'Suppressed – flap below threshold' }) },
  { w: 14, cat: 'inventory', src: 'OpsRamp', make: (b) => ({ msg: `SNMP poll timeout ${b.code}-sw0${pick([1, 2])}, next poll OK`, sev: 'Minor', out: 'Suppressed – transient' }) },
  { w: 12, cat: 'inventory', src: 'Aruba Central', make: (b) => ({ msg: `${b.code}-ap0${pick([1, 2, 3])} radio channel change (AirMatch) – ${pick(['ch 36 → 44', 'ch 149 → 157', 'ch 1 → 6'])}`, sev: 'Info', out: 'Info – no action' }) },
  { w: 10, cat: 'inventory', src: 'Aruba Central', make: (b) => ({ msg: `${b.code}-sw01 PoE port 1/1/${Math.floor(rnd(5, 44))} renegotiated (yard AP)`, sev: 'Minor', out: 'Duplicate – grouped' }) },
  { w: 9, cat: 'predict', src: 'OpsRamp', make: (b) => ({ msg: `${b.code}-sw01 uplink utilisation ${Math.floor(rnd(70, 88))}% (5 min)`, sev: 'Minor', out: 'Watch – capacity trend' }) },
  { w: 8, cat: 'readiness', src: 'Synthetic', make: (b) => ({ msg: `POS path test ${Math.floor(rnd(150, 320))} ms, ERP login ${rnd(0.9, 1.7).toFixed(1)} s`, sev: 'Info', out: 'OK' }) },
  { w: 7, cat: 'readiness', src: 'New Relic', make: (b) => ({ msg: `Roof Hub API p95 ${rnd(0.6, 1.3).toFixed(2)} s from ${b.name}`, sev: 'Info', out: 'OK' }) },
  { w: 5, cat: 'predict', src: 'UPS (SNMP)', make: (b) => ({ msg: `${b.code}-ups01 self-test passed, runtime ${Math.floor(rnd(28, 46))} min`, sev: 'Info', out: 'Info – no action' }) },
  { w: 4, cat: 'inventory', src: 'Aruba Central', make: (b) => ({ msg: `${b.code}-ap0${pick([1, 2])} rebooted (watchdog), back in 2 m`, sev: 'Major', out: 'Auto-healed – RB-104 not needed' }) },
  { w: 4, cat: 'automation', src: 'OpsRamp', make: (b) => ({ msg: `Config backup ${b.code}-sw01 retried OK (hash verified)`, sev: 'Info', out: 'Auto-healed – RB-109' }) },
  { w: 3, cat: 'carriers', src: 'Orchestrator', make: (b) => ({ msg: `${b.code}-ec01 tunnel to Azure re-keyed`, sev: 'Info', out: 'Info – no action' }) },
  { w: 6, cat: 'readiness', src: 'Synthetic', make: (b) => ({ msg: `Readiness probe: POS path, ERP login, label printer, handhelds – ${pick(['6/6 pass', '6/6 pass', '6/6 pass', '5/6 pass, printer retry OK'])}`, sev: 'Info', out: 'OK' }) },
  { w: 5, cat: 'dispatch', src: 'Field app', make: (b) => { const t = pick(D.TECHS); return pick([{ msg: `${t.name} en route to ${b.name}, ETA ${Math.floor(rnd(18, 70))} min`, sev: 'Info', out: 'ETA updated' }, { msg: `${t.name} on site at ${b.name}, work started`, sev: 'Info', out: 'On site' }, { msg: `${t.name} closed the visit at ${b.name}; photos and serials attached`, sev: 'Info', out: 'Work order closed' }]); } },
  { w: 4, cat: 'changes', src: 'ServiceNow', make: (b) => { const c = pick(D.CHANGES); return pick([{ msg: `${c.id} pre-checks passed for ${b.name} (freeze and calendar clear)`, sev: 'Info', out: 'Validation passed' }, { msg: `${c.id} Network-as-Code pipeline: lint, policy and diff checks passed`, sev: 'Info', out: 'Validation passed' }]); } },
  { w: 4, cat: 'vuln', src: 'Aruba Central', make: (b) => ({ msg: `Firmware inventory read for ${b.name}: ${b.dev.ec + b.dev.sw + b.dev.ap} devices, ${pick(['no change', 'no change', '1 AP still on AOS 10.5.1.4 (HPESBNW04712)'])}`, sev: 'Info', out: 'Inventory synced' }) },
  { w: 2, cat: 'vuln', src: 'Aruba Central', make: (b) => ({ msg: `Canary ${b.code}-ap0${pick([1, 2])} healthy on AOS 10.7.1.0 after 24 h soak; clients and roaming normal`, sev: 'Info', out: 'Canary healthy' }) },
  { w: 3, cat: 'vuln', src: 'Mova iO', make: (b) => ({ msg: `Advisory scan of ${b.name}: ${pick(['no new matches', 'no new matches', '1 switch on 10.10.1170 flagged for HPESBNW05027'])}`, sev: 'Info', out: 'Scan complete' }) },
  { w: 4, cat: 'carriers', src: 'Carrier portal', make: (b) => { const c = D.CIR[b.wan[0]]; return { msg: `${c.carrier} case ${D.caseNo(c.carrier)} update for ${b.name}: ${pick(['technician dispatched', 'testing from the central office', 'fault cleared, monitoring', 'awaiting access window'])}`, sev: 'Info', out: 'Case updated' }; } },
  { w: 3, cat: 'knowledge', src: 'Mova iO', make: (b) => { const k = pick(D.KB); const ok = Math.random() < 0.75; return { msg: `${k.id} suggested for a ${b.name} ticket – ${ok ? 'accepted by the engineer' : 'marked not relevant'}`, sev: 'Info', out: ok ? 'Accepted' : 'Not relevant' }; } },
  { w: 5, cat: 'automation', src: 'Mova iO', make: (b) => { const r = pick(D.RUNBOOKS); return { msg: `${r.id} ${r.name} at ${b.name}: ${pick(['success', 'success', 'success', 'skipped – branch trading, sent for approval'])} in ${Math.floor(rnd(1, 4))} m ${Math.floor(rnd(5, 59))} s`, sev: 'Info', out: 'Runbook run' }; } },
  { w: 3, cat: 'predict', src: 'Mova iO', make: (b) => ({ msg: `Failure risk for ${b.code}-sw0${pick([1, 2])} ${pick(['rose', 'fell'])} to ${rnd(0.2, 0.7).toFixed(2)} (${pick(['PoE renegotiations', 'CRC errors', 'temperature', 'uplink use'])})`, sev: 'Info', out: 'Risk updated' }) },
  { w: 2, cat: 'biab', src: 'Mova iO', make: (b) => { const p = pick(D.PROJECTS); return { msg: `${p.id} ${p.brand}: ${pick(['kit pre-staging, devices registered for zero-touch', 'site survey photos uploaded', 'circuit order confirmed by the carrier', 'golden config generated from the kit template'])}`, sev: 'Info', out: 'Project updated' }; } },
];
const EVW = EV.reduce((s, e) => s + e.w, 0);
const pickEv = () => { let x = Math.random() * EVW; for (const e of EV) { x -= e.w; if (x <= 0) return e; } return EV[0]; };

export function LiveProvider({ children }) {
  const { s, act } = useApp();
  const sRef = useRef(s); sRef.current = s;
  const L = useRef(null);
  if (!L.current) {
    L.current = {
      series: {
        wan: seedSeries(27, 1.2, 18, 60), pos: seedSeries(215, 9, 140, 900), roofhub: seedSeries(0.78, 0.04, 0.4, 4), erp: seedSeries(1.25, 0.05, 0.6, 5),
        dispatch: seedSeries(0.42, 0.03, 0.2, 3), voice: seedSeries(4.3, 0.03, 3.5, 4.5), m365: seedSeries(88, 4, 50, 400), scan: seedSeries(1.6, 0.25, 0, 30),
        raw: seedSeries(52, 8, 20, 400), corr: seedSeries(15, 3, 4, 120), tunnels: seedSeries(1858, 0.6, 1700, 1866), lte: seedSeries(81, 0, 80, 100), clients: seedSeries(6400, 60, 4000, 9000),
        crit: seedSeries(0.4, 0.4, 0, 12), major: seedSeries(2.2, 0.8, 0, 30), minor: seedSeries(9, 2, 0, 60),
        probes: seedSeries(99.3, 0.15, 96, 100), reporting: seedSeries(99.6, 0.08, 97, 100), loss: seedSeries(0.12, 0.03, 0, 5), enroute: seedSeries(7, 0.6, 2, 14), onsite: seedSeries(5, 0.5, 1, 12),
        exposed: seedSeries(820, 40, 500, 1200), risk: seedSeries(31, 0.8, 10, 80), kbhits: seedSeries(3.2, 0.5, 0, 12), runs: seedSeries(4.1, 0.6, 0, 20), success: seedSeries(96.4, 0.4, 85, 100),
        resp: seedSeries(98.7, 0.15, 90, 100), mttr: seedSeries(118, 3, 60, 300), chg: seedSeries(1.8, 0.3, 0, 8), staged: seedSeries(71, 0, 0, 100), backups: seedSeries(99.1, 0.12, 95, 100),
      },
      feed: [], ts: [], counters: { events: eventsSoFarToday(), suppressed: Math.round(eventsSoFarToday() * 0.71), autoRes: 23, newInc: 0, acked: 0 },
      flash: {}, newIncs: {}, last: Date.now(), flaps: [], pending: {},
    };
    const now = Date.now();
    L.current.ts = Array.from({ length: KEEP }, (_, i) => now - (KEEP - 1 - i) * TICK);
    for (let i = 0; i < 14; i++) { const b = pick(D.BRANCHES), e = pickEv(); L.current.feed.push({ id: `seed${i}`, t: now - (14 - i) * 3500, src: e.src, cat: e.cat, branchId: b.id, ...e.make(b) }); }
    const cats = [...new Set(EV.map(e => e.cat))];
    cats.forEach(cat => { const evs = EV.filter(e => e.cat === cat); for (let i = 0; i < 6; i++) { const b = pick(D.BRANCHES), e = pick(evs); L.current.feed.push({ id: `seed-${cat}-${i}`, t: now - Math.floor(rnd(20e3, 600e3)), src: e.src, cat, branchId: b.id, ...e.make(b) }); } });
    L.current.feed.sort((a, b) => b.t - a.t);
    L.current.x = seedX(now);
  }
  const [ver, setVer] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => {
      const st = sRef.current, Lc = L.current, now = Date.now();
      const open = st.incidents.filter(i => i.state !== 'Resolved');
      const posBad = open.some(i => ['pos', 'jitter'].includes(i.kind) || (i.kind === 'scenario' && /jitter|POS/i.test(i.title)));
      const storm = open.some(i => i.major);
      const S = Lc.series;
      const push = (k, v) => { S[k] = [...S[k].slice(1), +(+v).toFixed(k === 'roofhub' || k === 'erp' || k === 'dispatch' || k === 'voice' ? 2 : 1)]; };
      push('wan', walk(S.wan.at(-1), storm ? 34 : 27, 1.4, 18, 60));
      push('pos', walk(S.pos.at(-1), posBad ? 290 : 212, 10, 140, 900));
      push('roofhub', walk(S.roofhub.at(-1), posBad ? 0.95 : 0.78, 0.04, 0.4, 4));
      push('erp', walk(S.erp.at(-1), 1.25, 0.05, 0.6, 5));
      push('dispatch', walk(S.dispatch.at(-1), 0.42, 0.03, 0.2, 3));
      push('voice', walk(S.voice.at(-1), 4.3, 0.03, 3.5, 4.5));
      push('m365', walk(S.m365.at(-1), 88, 4, 50, 400));
      push('scan', walk(S.scan.at(-1), open.some(i => i.kind === 'scanner') ? 3.2 : 1.4, 0.3, 0, 30));
      const down = D.BRANCHES.filter(b => (st.branchHealth[b.id] || b.health) === 'down').length;
      push('tunnels', 1866 - down * 2 - Math.round(rnd(0, 3)) - (storm ? 10 : 0));
      push('clients', walk(S.clients.at(-1), 6400, 70, 4000, 9000));
      push('lte', Math.min(100, S.lte.at(-1) + (storm ? 0.05 : 0.002)));
      push('probes', walk(S.probes.at(-1), posBad ? 98.4 : 99.3, 0.15, 96, 100));
      push('reporting', walk(S.reporting.at(-1), 99.6 - down * 0.05, 0.08, 97, 100));
      push('loss', walk(S.loss.at(-1), storm ? 0.9 : (Lc.flaps.length ? 0.22 : 0.12), 0.03, 0, 5));
      push('enroute', walk(S.enroute.at(-1), 7 + (storm ? 3 : 0), 0.5, 2, 14));
      push('onsite', walk(S.onsite.at(-1), 5, 0.4, 1, 12));
      push('exposed', walk(S.exposed.at(-1), 820, 40, 500, 1200));
      push('risk', walk(S.risk.at(-1), 31 + (storm ? 12 : 0), 0.8, 10, 80));
      push('kbhits', walk(S.kbhits.at(-1), 3.2, 0.5, 0, 12));
      push('runs', walk(S.runs.at(-1), 4.1 + open.length * 0.05, 0.6, 0, 20));
      push('success', walk(S.success.at(-1), 96.4, 0.4, 85, 100));
      push('resp', walk(S.resp.at(-1), storm ? 97.2 : 98.7, 0.15, 90, 100));
      push('mttr', walk(S.mttr.at(-1), 118 + open.filter(i => i.pri <= 'P2').length * 2, 3, 60, 300));
      push('chg', walk(S.chg.at(-1), 1.8, 0.3, 0, 8));
      push('staged', Math.min(100, S.staged.at(-1) + (Math.random() < 0.08 ? 1 : 0)));
      push('backups', walk(S.backups.at(-1), 99.1, 0.12, 95, 100));
      // raw events this tick
      const n = Math.max(0, Math.round(rnd(1.2, 3.4) + (storm ? 3 : 0)));
      for (let k = 0; k < n; k++) {
        const b = pick(D.BRANCHES), e = pickEv(); const ev = { id: `${now}-${k}`, t: now - k * 300, src: e.src, cat: e.cat, branchId: b.id, ...e.make(b) };
        Lc.feed = [ev, ...Lc.feed].slice(0, 300); Lc.flash[b.id] = now;
      }
      const perMin = n * 30;
      push('raw', walk(S.raw.at(-1), 52 + (storm ? 70 : 0), 6, 20, 400) * 0.6 + perMin * 0.4);
      push('corr', S.raw.at(-1) * rnd(0.25, 0.33));
      push('crit', Math.max(0, walk(S.crit.at(-1), storm ? 4 : open.filter(i => i.pri <= 'P2').length * 0.15, 0.35, 0, 12)));
      push('major', walk(S.major.at(-1), 2.2 + (storm ? 5 : 0), 0.7, 0, 30));
      push('minor', walk(S.minor.at(-1), 9, 1.8, 0, 60));
      Lc.ts = [...Lc.ts.slice(1), now];
      Lc.counters.events += n; Lc.counters.suppressed += Math.round(n * 0.71 + Math.random() * 0.4);
      for (const k in Lc.flash) if (now - Lc.flash[k] > 5000) delete Lc.flash[k];

      // ---- incident life cycle ----
      const r = Math.random() * (window.__liveBoost ? 0.11 : 1);
      if (r < 0.03) { // new incident from live telemetry (~ every 65 s)
        let b; do { b = pick(D.BRANCHES); } while (b.region === 'Canada' && Math.random() < 0.7);
        const kind = (() => { let x = Math.random() * D.TEMPLATE_W.reduce((s, w) => s + w[1], 0); for (const [k, w] of D.TEMPLATE_W) { x -= w; if (x <= 0) return k; } return 'apdown'; })();
        const inc = D.buildIncident(kind, b, 0);
        inc.signals = inc.signals.map((x, i) => ({ ...x, t: now - (inc.signals.length - i) * 4000 }));
        Lc.pending[inc.id] = inc.agentSteps.slice(2);
        inc.agentSteps = inc.agentSteps.slice(0, 2).map((x, i) => ({ ...x, t: now - 2000 + i * 500 }));
        inc.opened = now - 6000; inc.acked = null; inc.state = 'New'; inc.assignee = null; inc.notes = []; inc.live = true;
        act.add('incidents', inc);
        if (kind === 'circuit') { act.map('circuitState', b.wan[0], { status: 'Down' }); act.map('branchHealth', b.id, 'degraded'); }
        if (['jitter', 'pos'].includes(kind)) { act.map('circuitState', b.wan[0], { status: 'Degraded', jit: 36, loss: 2.1 }); act.map('branchHealth', b.id, 'degraded'); }
        if (['cpu', 'scanner', 'dhcp', 'lte'].includes(kind)) act.map('branchHealth', b.id, 'degraded');
        Lc.newIncs[inc.id] = now; Lc.flash[b.id] = now; Lc.counters.newInc++;
        Lc.feed = [{ id: `${now}-inc`, t: now, src: 'Mova iO', cat: 'incidents', branchId: b.id, msg: `${inc.corr + inc.signals.length} events correlated → ${inc.id} ${inc.pri}: ${inc.title}`, sev: inc.pri <= 'P2' ? 'Critical' : 'Major', out: `New incident ${inc.id}`, inc: inc.id }, ...Lc.feed].slice(0, 300);
        act.toast(`New ${inc.pri} ${inc.id} – ${b.name}: ${inc.title.slice(0, 60)}`, inc.pri <= 'P2' ? 'bad' : 'warn');
      } else if (r < 0.05) { // another engineer acknowledges an unowned incident
        const c = open.find(i => !i.acked && now - i.opened > 50e3 && i.id !== st.selInc && i.kind !== 'scenario');
        if (c) { const who = pick(D.ENGINEERS.filter(e => e !== 'Priya S.')); act.upd('incidents', c.id, x => ({ acked: now, state: 'In Progress', assignee: who, notes: [...x.notes, { t: now, who, text: 'Acknowledged from the NOC queue.' }] })); Lc.counters.acked++; }
      } else if (r < 0.07) { // zero-touch auto-resolution of a low-risk incident
        const c = open.find(i => ['backup', 'apdown', 'crc'].includes(i.kind) && i.id !== st.selInc && now - i.opened > 60e3);
        if (c) {
          const rb = c.kind === 'backup' ? 'RB-109' : c.kind === 'apdown' ? 'RB-103' : 'RB-103';
          act.del('incidents', c.id);
          act.add('resolved', { ...c, state: 'Resolved', resolved: now, closeCode: 'Auto-resolved (zero touch)', rbState: 'done', verify: c.verify.map(v => ({ ...v, st: 'pass', val: 'OK' })), notes: [...c.notes, { t: now, who: 'Runbook Agent', text: `${rb} ran outside the branch's trading window / on an already-down device; verification passed; closed with zero human touch.` }] });
          if (!st.incidents.some(i => i.id !== c.id && i.branchId === c.branchId && i.state !== 'Resolved')) act.map('branchHealth', c.branchId, 'up');
          act.audit(`Auto-resolved ${c.id} with ${rb} (zero touch)`, c.id, 'Runbook Agent');
          Lc.counters.autoRes++;
          Lc.feed = [{ id: `${now}-res`, t: now, src: 'Mova iO', cat: 'incidents', branchId: c.branchId, msg: `${c.id} resolved by ${rb} – verification passed`, sev: 'Info', out: 'Auto-resolved', inc: c.id }, ...Lc.feed].slice(0, 300);
        }
      } else if (r < 0.1) { // circuit flap that recovers by itself
        const b = pick(D.BRANCHES); const cur = st.circuitState[b.wan[0]];
        if (!cur && (st.branchHealth[b.id] || b.health) === 'up') {
          act.map('circuitState', b.wan[0], { status: 'Degraded', loss: +rnd(2, 4).toFixed(1), jit: Math.round(rnd(18, 32)) }); act.map('branchHealth', b.id, 'degraded');
          Lc.flaps.push({ id: b.wan[0], b: b.id, until: now + rnd(14e3, 30e3) }); Lc.flash[b.id] = now;
          Lc.feed = [{ id: `${now}-flap`, t: now, src: 'Orchestrator', cat: 'carriers', branchId: b.id, msg: `${b.wan[0]} loss above 2% – path control steering critical apps to wan2`, sev: 'Major', out: 'Watching (30 s hold-down)' }, ...Lc.feed].slice(0, 300);
        }
      }
      Lc.flaps = Lc.flaps.filter(f => { if (now < f.until) return true; act.map('circuitState', f.id, undefined); act.map('branchHealth', f.b, sRef.current.incidents.some(i => i.branchId === f.b && i.state !== 'Resolved') ? 'degraded' : 'up'); Lc.feed = [{ id: `${now}-rec-${f.id}`, t: now, src: 'Orchestrator', cat: 'carriers', branchId: f.b, msg: `${f.id} clean for 30 s – traffic back on primary`, sev: 'Info', out: 'Recovered – no ticket' }, ...Lc.feed].slice(0, 300); return false; });
      for (const k in Lc.newIncs) if (now - Lc.newIncs[k] > 25000) delete Lc.newIncs[k];
      for (const k in Lc.pending) { const nx = Lc.pending[k].shift(); if (nx) act.upd('incidents', k, x => ({ agentSteps: [...x.agentSteps, { ...nx, t: now }] })); if (!Lc.pending[k].length) delete Lc.pending[k]; }
      try { tickX(Lc, sRef.current, now); } catch (err) { console.warn('live x', err); }
      Lc.last = now;
      setVer(v => v + 1);
    }, TICK);
    return () => clearInterval(id);
  }, [paused]);
  return <LiveCtx.Provider value={{ L: L.current, ver, paused, setPaused }}>{children}</LiveCtx.Provider>;
}
export const useLive = () => useContext(LiveCtx);
