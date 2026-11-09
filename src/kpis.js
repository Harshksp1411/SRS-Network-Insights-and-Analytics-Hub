// One definition of the performance KPIs, used by both the Performance page and the Performance summary report, so
// the two always show the same figures, under the same names, in the same order: Network, Branches,
// AI and automation, Services and engagement; four KPIs each, headline first.
import * as D from './data.js';
import * as HIST from './history.js';

export const STORE_TARGET = 0.995;
export const DOMAIN_ORDER = ['network', 'stores', 'ai', 'service'];
export const DOMAIN_LABEL = { network: 'Network', stores: 'Branches', ai: 'AI and automation', service: 'Services and engagement' };
export const DOMAIN_LINES = { network: l => /Device Management/.test(l), stores: () => false, ai: l => HIST.AI_LINE.test(l), service: l => /Operations & Incident|Monitoring & Event/.test(l) };

const pct = (v, d = 1) => `${(v * 100).toFixed(d)}%`;
const toneOf = st => ({ 'Meets ESL': 'green', 'Above MSL': 'amber', 'Below MSL': 'red', 'Below target': 'amber' }[st] || 'amber');
const num = n => Math.round(n).toLocaleString('en-US');

// the KPIs of every domain for a period (P = HIST.period(n))
export function kpisFor(P) {
  const n = P.n, slaOf = (k, re) => { const i = D.SLA.findIndex(x => x.n === k && (!re || re.test(x.name))); return i < 0 ? null : { i, x: P.sla[i] }; };
  const slaTile = (key, label, k, re, fmt = 1) => { const r = slaOf(k, re); if (!r) return null; const m = r.x.m; return { key, label, value: pct(r.x.avg, fmt), tone: toneOf(r.x.status), sub: `ESL ${m.lower ? '≤ ' : ''}${pct(m.esl, fmt)}${m.msl != null ? `, MSL ${pct(m.msl, fmt)}` : ''} · last month ${pct(r.x.latest, fmt)}`, drill: { t: 'metric', i: r.i, per: n } }; };
  const lineSla = d => P.sla.filter(x => DOMAIN_LINES[d](x.m.line));
  const met = d => lineSla(d).filter(x => x.status === 'Meets ESL').length;
  // stores
  const lost = P.branches.reduce((a, x) => a + x.lost, 0), storeAv = 1 - lost / Math.max(1, P.branches.length * HIST.TRADE_H * n);
  const below = P.branches.filter(x => x.avail < STORE_TARGET).length, repeat = P.branches.filter(x => x.repeat).length;
  // services
  const SHARE = { P1: 0.02, P2: 0.08, P3: 0.45, P4: 0.45 };
  const late = Math.round(P.byMonth.reduce((a, mo, i) => a + mo.total * ['P1', 'P2', 'P3', 'P4'].reduce((b, q) => { const r = P.sla.find(x => x.m.queue === q && /resolution/.test(x.m.name)); return b + SHARE[q] * (1 - (r ? r.series[i] : 1)); }, 0), 0));
  const mttrP1 = P.mttr.P1.reduce((a, v) => a + v, 0) / P.mttr.P1.length;
  const svcBelow = lineSla('service').filter(x => x.series.some(v => HIST.slaStatusAt(x.m, v) === 'Below MSL')).length;
  return {
    network: [
      slaTile('avail', 'Critical network availability (#29)', 29, null, 3),
      slaTile('fw', 'Firmware compliance (#32)', 32),
      slaTile('backup', 'Config backup success (#33)', 33),
      { key: 'met', label: 'Network SLAs meeting ESL', value: `${met('network')} of ${lineSla('network').length}`, tone: met('network') === lineSla('network').length ? 'green' : 'amber', sub: `average of the last ${n} months`, drill: { t: 'sla', per: n } },
    ].filter(Boolean),
    stores: [
      { key: 'savail', label: 'Branch availability', value: pct(storeAv, 2), tone: storeAv >= STORE_TARGET ? 'green' : 'amber', sub: `trading hours the network was there; target ${pct(STORE_TARGET)}`, drill: { t: 'storeperf', per: n, f: 'all' } },
      { key: 'lost', label: 'Branch hours lost', value: num(lost), tone: 'amber', sub: `across ${num(P.branches.length)} branches`, drill: { t: 'storeperf', per: n, f: 'all', sort: 'lost' } },
      { key: 'below', label: `Branches below ${pct(STORE_TARGET)}`, value: num(below), tone: below ? 'red' : 'green', sub: 'each one opens with its causes', drill: { t: 'storeperf', per: n, f: 'below' } },
      { key: 'repeat', label: 'Repeat-problem branches', value: num(repeat), tone: repeat ? 'amber' : 'green', sub: 'same fault three times in 90 days', drill: { t: 'storeperf', per: n, f: 'repeat' } },
    ],
    ai: [
      { key: 'auto', label: 'Tickets fixed by Mova iO', value: num(P.auto), tone: 'green', sub: `${pct(P.autoShare, 0)} of ${num(P.tickets)} tickets, no engineer`, drill: { t: 'automation', id: 'all', per: n } },
      { key: 'hours', label: 'Engineer hours saved', value: num(P.auto * 0.75), tone: 'green', sub: 'about 45 minutes per ticket fixed automatically', drill: { t: 'automation', id: 'all', per: n } },
      slaTile('noise', 'Alert noise reduction', 38, /noise/),
      slaTile('autores', 'Auto-resolution rate', 37, /Auto-resolution/),
    ].filter(Boolean),
    service: [
      { key: 'met', label: 'Service SLAs meeting ESL', value: `${met('service')} of ${lineSla('service').length}`, tone: met('service') >= lineSla('service').length * 0.75 ? 'green' : 'amber', sub: `average of the last ${n} months`, drill: { t: 'sla', per: n } },
      { key: 'mttr', label: 'Time to restore P1', value: `${mttrP1.toFixed(1)} h`, tone: mttrP1 <= 4 ? 'green' : 'amber', sub: 'target 4 h', drill: { t: 'mttr' } },
      { key: 'late', label: 'Tickets resolved outside SLA', value: num(late), tone: 'amber', sub: `${pct(late / Math.max(1, P.tickets))} of ${num(P.tickets)} tickets`, drill: { t: 'incidents', k: 'atRisk' } },
      { key: 'below', label: 'Service SLAs below minimum', value: num(svcBelow), tone: svcBelow ? 'red' : 'green', sub: svcBelow ? 'below MSL in at least one month' : 'none in the period', drill: { t: 'sla', per: n } },
    ],
  };
}
