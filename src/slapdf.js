// SLA & KPI report as a PDF, for the period picked in the tracker (3, 6, 9 or 12 months): the headline numbers,
// tickets per month, every Annexure B service level, the AI and automation SLAs, the top call drivers, the branches
// with the most problems and time to restore. Drawn in the browser with jsPDF, in Helvetica.
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { dt, num } from './util.js';
import { period } from './history.js';

const INK = [22, 25, 29], INK2 = [70, 76, 84], INK3 = [112, 118, 128], LINE = [214, 217, 222], BRAND = [118, 33, 35], CHIP = [244, 245, 247];
const TONE = { ok: [46, 133, 64], warn: [196, 106, 0], bad: [198, 42, 30], info: [47, 109, 181] };
const ST = { 'Meets ESL': TONE.ok, 'Above MSL': TONE.warn, 'Below target': TONE.warn, 'Below MSL': TONE.bad };
const clean = v => String(v ?? '').replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/→/g, '->').replace(/[^\u0000-ÿ–—‘’“”•…]/g, '');
const pf = (v, m) => v == null ? '–' : `${(v * 100).toFixed(m && (m.fmt || (m.esl > 0.999 ? 3 : 1)) || 1)}%`;

export function slaReportPdf(n, s, healthOf) {
  const P = period(n);
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 38, CW = W - 2 * M;
  let y = M;
  const need = h => { if (y + h > H - 44) { doc.addPage(); y = M; } };
  const font = (st, size, col = INK) => { doc.setFont('helvetica', st); doc.setFontSize(size); doc.setTextColor(...col); };
  const section = (t, sub) => {
    need(46); y += 6; font('bold', 11, BRAND); doc.text(clean(t), M, y + 11); y += 15;
    if (sub) { font('normal', 8, INK3); doc.splitTextToSize(clean(sub), CW).forEach(l => { doc.text(l, M, y + 8); y += 10; }); }
    doc.setDrawColor(...BRAND); doc.setLineWidth(1); doc.line(M, y + 2, W - M, y + 2); y += 8;
  };
  const table = (head, body, opts = {}) => {
    autoTable(doc, { startY: y, margin: { left: M, right: M, bottom: 44 }, head: [head.map(clean)], body: body.map(r => r.map(c => typeof c === 'object' && c && !Array.isArray(c) ? c : clean(c))), theme: 'grid',
      styles: { font: 'helvetica', fontSize: 7.6, cellPadding: 3, textColor: INK2, lineColor: LINE, lineWidth: 0.4, overflow: 'linebreak', valign: 'middle' },
      headStyles: { fillColor: CHIP, textColor: INK, fontStyle: 'bold' }, ...opts });
    y = doc.lastAutoTable.finalY + 10;
  };
  const spark = (data, cell, col, ref) => {
    const x0 = cell.x + 4, w = cell.width - 8, y0 = cell.y + 4, h = cell.height - 8;
    const lo = Math.min(...data, ref ?? Infinity), hi = Math.max(...data, ref ?? -Infinity), Y = v => y0 + h - (v - lo) / ((hi - lo) || 1) * h;
    if (ref != null) { doc.setDrawColor(...INK3); doc.setLineWidth(0.3); doc.setLineDashPattern([1.5, 1.5], 0); doc.line(x0, Y(ref), x0 + w, Y(ref)); doc.setLineDashPattern([], 0); }
    doc.setDrawColor(...col); doc.setLineWidth(1);
    data.forEach((v, i) => { if (i) doc.line(x0 + (i - 1) * w / (data.length - 1), Y(data[i - 1]), x0 + i * w / (data.length - 1), Y(v)); });
  };

  // header
  font('bold', 7, INK3); doc.text('SRS NETWORK INSIGHTS AND ANALYTICS HUB  ·  SLA & KPI TRACKER', M, y + 7, { charSpace: 0.4 });
  doc.text(clean(`GENERATED ${dt(Date.now()).toUpperCase()} CT`), W - M, y + 7, { align: 'right', charSpace: 0.4 }); y += 14;
  font('bold', 22, INK); doc.text(`SLA & KPI report: last ${n} months`, M, y + 22); y += 30;
  font('normal', 10, INK2); doc.text(clean(`${P.from} to ${P.to}  ·  Annexure B service levels, AI and automation SLAs, call drivers and branches`), M, y + 10); y += 16;
  doc.setFillColor(...BRAND); doc.rect(M, y, CW, 2.2, 'F'); y += 14;

  // headline numbers
  const met = P.sla.filter(x => !x.ai && x.status === 'Meets ESL').length, nSla = P.sla.filter(x => !x.ai).length;
  const aiMet = P.sla.filter(x => x.ai && x.status === 'Meets ESL').length, nAi = P.sla.filter(x => x.ai).length;
  const avg = a => a.reduce((s, v) => s + v, 0) / a.length;
  const tiles = [['Tickets', num(P.tickets), INK], ['Auto-resolved', `${(P.autoShare * 100).toFixed(1)}%`, TONE.ok], ['Raised by store calls', `${Math.round(P.storeCalls / Math.max(1, P.tickets) * 100)}%`, INK],
                 ['Service levels met', `${met} of ${nSla}`, met === nSla ? TONE.ok : TONE.warn], ['AI and automation met', `${aiMet} of ${nAi}`, aiMet === nAi ? TONE.ok : TONE.warn], ['Time to restore, P1', `${avg(P.mttr.P1).toFixed(1)} h`, TONE.ok]];
  const tw = (CW - 5 * 8) / 6;
  tiles.forEach(([l, v, c], i) => { const x = M + i * (tw + 8); doc.setDrawColor(...LINE); doc.setLineWidth(0.6); doc.roundedRect(x, y, tw, 46, 3, 3); font('bold', 14, c); doc.text(clean(v), x + 7, y + 22); font('normal', 7, INK3); doc.text(doc.splitTextToSize(clean(l), tw - 12), x + 7, y + 34); });
  y += 58;
  font('normal', 7.5, INK3); doc.text('Service levels met and AI and automation met count the latest month against the expected level (ESL). Time to restore is the period average.', M, y); y += 12;

  // tickets per month
  section('Tickets per month', 'Network tickets from monitoring and from store calls, split into auto-resolved (zero touch) and resolved by an engineer.');
  need(150); const ch = 110, cx = M + 30, cw = CW - 40, mx = Math.max(...P.byMonth.map(x => x.total)) * 1.1, bw = cw / P.byMonth.length;
  font('normal', 7, INK3);
  [0, 0.5, 1].forEach(f => { const yy = y + ch - ch * f; doc.setDrawColor(...LINE); doc.setLineWidth(0.3); doc.line(cx, yy, cx + cw, yy); doc.text(num(Math.round(mx * f)), cx - 4, yy + 2, { align: 'right' }); });
  P.byMonth.forEach((x, i) => {
    const bx = cx + i * bw + bw * 0.18, bwid = bw * 0.64, ha = x.auto / mx * ch, he = x.engineer / mx * ch;
    doc.setFillColor(...TONE.info); doc.rect(bx, y + ch - he - ha, bwid, he, 'F');
    doc.setFillColor(...TONE.ok); doc.rect(bx, y + ch - ha, bwid, ha, 'F');
    font('bold', 7, INK); doc.text(num(x.total), bx + bwid / 2, y + ch - he - ha - 3, { align: 'center' });
    font('normal', 7, INK3); doc.text(x.label, bx + bwid / 2, y + ch + 10, { align: 'center' });
  });
  y += ch + 18;
  doc.setFillColor(...TONE.ok); doc.rect(cx, y, 8, 8, 'F'); font('normal', 7.5, INK2); doc.text('Auto-resolved', cx + 12, y + 7);
  doc.setFillColor(...TONE.info); doc.rect(cx + 80, y, 8, 8, 'F'); doc.text('Resolved by an engineer', cx + 92, y + 7); y += 18;

  // service levels
  const slaRows = list => list.map(x => [`#${x.m.n}`, `${x.m.name}\n${x.m.def}`, pf(x.m.msl, x.m), `${x.m.lower ? '<= ' : ''}${pf(x.m.esl, x.m)}`, pf(x.avg, x.m), pf(x.latest, x.m), `${x.met} of ${n}`, '', x.status]);
  const slaTable = list => table(['#', 'Metric', 'MSL', 'ESL', 'Period average', 'Latest month', 'Months at ESL', 'Trend', 'Status'], slaRows(list), {
    columnStyles: { 0: { cellWidth: 24 }, 1: { cellWidth: 150 }, 7: { cellWidth: 62, minCellHeight: 22 }, 8: { cellWidth: 56 } },
    didParseCell: d => { if (d.section === 'body' && d.column.index === 8) { d.cell.styles.textColor = ST[d.cell.raw] || INK; d.cell.styles.fontStyle = 'bold'; } if (d.section === 'body' && d.column.index === 5) d.cell.styles.fontStyle = 'bold'; },
    didDrawCell: d => { if (d.section === 'body' && d.column.index === 7) { const x = list[d.row.index]; spark(x.series, d.cell, ST[x.status] || TONE.info, x.m.esl); } } });
  section('Annexure B service levels', `Minimum (MSL), expected (ESL), the average over the ${n} months and the latest month. The trend line is month by month; the dotted line is the expected level.`);
  [...new Set(P.sla.filter(x => !x.ai).map(x => x.m.line))].forEach(line => { need(40); font('bold', 8.5, INK); doc.text(clean(line), M, y + 8); y += 12; slaTable(P.sla.filter(x => !x.ai && x.m.line === line)); });

  section('AI and automation SLAs', 'Mova iO triage and routing, auto-remediation, AIOps and knowledge: the measures that show the AI-first operating model is working.');
  [...new Set(P.sla.filter(x => x.ai).map(x => x.m.line))].forEach(line => { need(40); font('bold', 8.5, INK); doc.text(clean(line), M, y + 8); y += 12; slaTable(P.sla.filter(x => x.ai && x.m.line === line)); });

  // call drivers
  section('Top call drivers', `What the ${num(P.tickets)} tickets were about, how many came in as store calls rather than from monitoring, and how many Mova iO fixed with no engineer.`);
  table(['Rank', 'Driver', 'Tickets', 'Share', 'Raised by store calls', 'Auto-resolved', `${P.months[0].m} to ${P.months.at(-1).m}`], P.drivers.map((d, i) => [i + 1, d.label, num(d.tickets), `${(d.share * 100).toFixed(1)}%`, num(d.storeCalls), d.auto ? num(d.autoFixed) : 'Needs an engineer or carrier', `${d.first} to ${d.last}`]),
    { columnStyles: { 0: { cellWidth: 30 }, 1: { cellWidth: 150 } } });

  // branches
  section('Branches with the most problems', `The 20 branches with the most network tickets in the ${n} months, their main cause and whether a line is a repeat offender (3 or more tickets in 90 days).`);
  table(['Rank', 'Branch', 'Brand', 'Region', 'Tickets', 'Main cause', 'Repeat-offender line', 'Status now'], P.branches.slice(0, 20).map((x, i) => {
    const h = healthOf ? healthOf(s, x.b) : x.b.health;
    return [i + 1, x.b.name, x.b.brand, x.b.region, num(x.tickets), x.driver, x.repeat ? 'Yes' : 'No', h === 'up' ? 'Healthy' : h === 'down' ? 'Down' : 'Degraded'];
  }), { columnStyles: { 0: { cellWidth: 30 }, 1: { cellWidth: 118 } }, didParseCell: d => { if (d.section === 'body' && d.column.index === 7) d.cell.styles.textColor = d.cell.raw === 'Healthy' ? TONE.ok : d.cell.raw === 'Down' ? TONE.bad : TONE.warn; } });

  // time to restore
  section('Mean time to restore, hours', 'Monthly average by priority against the resolution target.');
  table(['Priority', ...P.months.map(m => m.m), 'Target'], ['P1', 'P2', 'P3'].map(p => [p, ...P.mttr[p].map(v => v.toFixed(1)), { P1: '4', P2: '8', P3: '24' }[p]]));

  // footer
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) { doc.setPage(i); doc.setDrawColor(...LINE); doc.setLineWidth(0.4); doc.line(M, H - 32, W - M, H - 32); font('normal', 7, INK3); doc.text(clean(`SLA & KPI report, last ${n} months (${P.from} to ${P.to})  ·  sample data, illustrative`), M, H - 22); doc.text(`Page ${i} of ${pages}`, W - M, H - 22, { align: 'right' }); }
  return doc;
}

export function downloadSlaReport(n, s, healthOf) {
  slaReportPdf(n, s, healthOf).save(`SRS-SLA-KPI-report-${n}-months-${new Date().toISOString().slice(0, 10)}.pdf`);
}
