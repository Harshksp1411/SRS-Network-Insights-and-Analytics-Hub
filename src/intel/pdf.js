// The one-page monthly executive summary from the Then lens: SLA attainment, availability, top issues and
// improvements delivered. Built with jsPDF in the browser; nothing leaves the page.
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as D from '../data.js';
import { CAUSES } from './model.js';
import { num } from '../util.js';

const BRAND = [118, 33, 35], INK = [17, 17, 17], INK3 = [110, 110, 110];
const pc = (v, d = 1) => `${(v * 100).toFixed(d)}%`;
export function execPdf(m, region, word) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' }); const W = doc.internal.pageSize.getWidth(), M = 40;
  doc.setFillColor(...BRAND); doc.rect(0, 0, W, 6, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.setTextColor(...INK); doc.text('SRS Managed Network Services: executive summary', M, 40);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...INK3);
  doc.text(`${region === 'All' ? 'All regions' : region} · ${word} (${m.P.from} to ${m.P.to}) · source ServiceNow, enriched with OpsRamp · sample data`, M, 56);
  const tiles = [['SLA attainment', pc(m.sla)], ['Network availability', pc(D.SLA.find(x => x.n === 29).act, 3)], ['MTTR, P1', `${m.mttrP1.toFixed(1)} h`], ['Incidents', num(m.tickets)], ['Remote fix rate', pc(m.remote, 0)], ['Change success', pc(m.chg.ok / m.chg.total)]];
  const tw = (W - 2 * M - 5 * 8) / 6;
  tiles.forEach(([l, v], i) => { const x = M + i * (tw + 8); doc.setDrawColor(220); doc.roundedRect(x, 70, tw, 50, 4, 4); doc.setFontSize(8); doc.setTextColor(...INK3); doc.text(l, x + 8, 84); doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...INK); doc.text(v, x + 8, 108); doc.setFont('helvetica', 'normal'); });
  let y = 145;
  const head = t => { doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.setTextColor(...BRAND); doc.text(t, M, y); doc.setFont('helvetica', 'normal'); y += 6; };
  head('Top issues');
  autoTable(doc, { startY: y, margin: { left: M, right: M }, styles: { fontSize: 8.5, cellPadding: 3 }, headStyles: { fillColor: [240, 240, 240], textColor: INK },
    head: [['Repeat-offender store', 'Incidents', 'Main cause']], body: m.repeatStores.slice(0, 5).map(x => [x.b.name, x.tickets, x.driver]) });
  y = doc.lastAutoTable.finalY + 18; head('Where incidents come from, and carriers');
  autoTable(doc, { startY: y, margin: { left: M, right: W / 2 + 6 }, styles: { fontSize: 8.5, cellPadding: 3 }, headStyles: { fillColor: [240, 240, 240], textColor: INK },
    head: [['Root cause', 'Share']], body: CAUSES.map(([k, l]) => [l, pc(m.cause[k] / m.causeTot, 0)]) });
  const y2 = doc.lastAutoTable.finalY;
  autoTable(doc, { startY: y, margin: { left: W / 2 + 6, right: M }, styles: { fontSize: 8.5, cellPadding: 3 }, headStyles: { fillColor: [240, 240, 240], textColor: INK },
    head: [['Carrier', 'Availability', 'Outages', 'Restore']], body: m.carriers.slice(0, 6).map(c => [c.n, `${(c.avail * 100).toFixed(2)}%`, c.outages, `${c.restore} h`]) });
  y = Math.max(y2, doc.lastAutoTable.finalY) + 18; head('Improvements delivered');
  const imp = [`P1 time to restore ${m.prevMttrP1 != null ? `${m.mttrP1 <= m.prevMttrP1 ? 'down' : 'up'} ${Math.abs(Math.round((m.mttrP1 - m.prevMttrP1) * 60))} min on the period before` : `at ${m.mttrP1.toFixed(1)} h`}.`, `${pc(m.byMonth.reduce((a, x) => a + x.auto, 0) / Math.max(1, m.tickets), 0)} of incidents resolved by automation with no engineer.`, `${num(m.rolls)} truck rolls; about ${num(Math.round(m.avoidable))} could be avoided with remote fixes and better sparing.`, `${m.breaches.length ? `${m.breaches.length} priority-months below the expected resolution level, each explained in the trend view.` : 'Every priority met its expected resolution level every month.'}`];
  doc.setFontSize(9.5); doc.setTextColor(...INK); imp.forEach(t => { const l = doc.splitTextToSize(`•  ${t}`, W - 2 * M); doc.text(l, M, y + 8); y += l.length * 12 + 2; });
  doc.setFontSize(8); doc.setTextColor(...INK3); doc.text('Network Insights and Analytics Hub · Network Intelligence · operated by Movate · sample data for the SRS demo', M, doc.internal.pageSize.getHeight() - 24);
  doc.save(`SRS-executive-summary-${m.P.to.replace(' ', '-')}.pdf`);
}
