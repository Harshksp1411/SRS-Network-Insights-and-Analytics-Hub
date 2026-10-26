// Turns an edition (see compose.js) into a downloadable PDF in the browser: masthead, headline, numbers, agenda,
// then every story with its tables, bars and timelines. Built-in PDF fonts only, so the page works offline.
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { dt } from '../util.js';

const INK = [22, 25, 29], INK2 = [70, 76, 84], INK3 = [112, 118, 128], LINE = [210, 214, 220], BRAND = [118, 33, 35];
const TONE = { ok: [46, 133, 64], warn: [200, 110, 0], bad: [214, 45, 32], info: [47, 109, 181], muted: [163, 172, 184] };
// the built-in fonts cover Western European text; swap the few symbols they cannot print
const clean = v => String(v ?? '').replace(/→/g, '->').replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/[✓✔]/g, 'OK').replace(/[✗✘]/g, 'x').replace(/[^\u0000-ÿ–—‘’“”•…€™]/g, '');
const cellText = c => c == null ? '' : typeof c === 'object' ? clean(c.sub ? `${c.text}\n${c.sub}` : c.text) : clean(c);

export function editionPdf(ed) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 40, CW = W - 2 * M;
  let y = M;
  const need = h => { if (y + h > H - 50) { doc.addPage(); y = M; } };
  const font = (f, st, size, col = INK) => { doc.setFont(f, st); doc.setFontSize(size); doc.setTextColor(...col); };
  const para = (txt, f = 'times', st = 'normal', size = 10.5, col = INK2, gap = 4) => { font(f, st, size, col); const lines = doc.splitTextToSize(clean(txt), CW); lines.forEach(l => { need(size + 3); doc.text(l, M, y + size); y += size + 3; }); y += gap; };
  const rule = (w = 0.6, col = LINE) => { doc.setDrawColor(...col); doc.setLineWidth(w); doc.line(M, y, W - M, y); };
  const table = (head, body, opts = {}) => {
    autoTable(doc, { startY: y, margin: { left: M, right: M }, head: head ? [head.map(clean)] : undefined, body, theme: 'grid', styles: { font: 'helvetica', fontSize: 8, cellPadding: 3, textColor: INK2, lineColor: LINE, lineWidth: 0.4, overflow: 'linebreak' }, headStyles: { fillColor: [244, 245, 247], textColor: INK, fontStyle: 'bold' }, ...opts });
    y = doc.lastAutoTable.finalY + 8;
  };

  // masthead
  font('helvetica', 'bold', 8, INK3); doc.text('SRS NETWORK INSIGHTS AND ANALYTICS HUB', M, y + 8);
  doc.text(clean(`${ed.range}`), W - M, y + 8, { align: 'right' }); y += 14;
  font('times', 'bold', 30, INK); doc.text(clean(`The ${ed.label}`), W / 2, y + 26, { align: 'center' }); y += 36;
  rule(1.4, INK); y += 4;
  font('helvetica', 'normal', 8.5, INK2);
  doc.text(clean(`Edition for ${ed.persona.name}, ${ed.persona.title}`), M, y + 9);
  doc.text(clean(`Generated ${dt(ed.at)} CT · sample data`), W - M, y + 9, { align: 'right' }); y += 14;
  rule(0.6, INK); y += 14;

  // headline, deck, lead
  font('times', 'bold', 19, INK); doc.splitTextToSize(clean(ed.headline), CW).forEach(l => { doc.text(l, M, y + 18); y += 22; }); y += 2;
  para(ed.deck, 'times', 'italic', 11.5, INK2, 6);
  ed.lead.forEach(t => para(t));

  // by the numbers
  need(60); const n = ed.numbers.length, bw = (CW - (n - 1) * 6) / n;
  ed.numbers.forEach((x, i) => { const bx = M + i * (bw + 6); doc.setDrawColor(...LINE); doc.setLineWidth(0.6); doc.rect(bx, y, bw, 44); font('helvetica', 'normal', 7.5, INK3); doc.text(doc.splitTextToSize(clean(x.label), bw - 10)[0], bx + 5, y + 12); font('helvetica', 'bold', 15, TONE[x.tone] || INK); doc.text(clean(x.value), bx + 5, y + 33); });
  y += 56;

  if (ed.agenda.length) {
    need(40); font('helvetica', 'bold', 9, BRAND); doc.text(ed.period === 'daily' ? 'YOUR DAY' : 'COMING UP', M, y + 9); y += 14;
    table(['When', 'What', 'Detail'], ed.agenda.map(a => [clean(a.when), clean(a.what), clean(a.where)]), { columnStyles: { 0: { cellWidth: 70 }, 1: { cellWidth: 230 } } });
  }

  // stories
  ed.stories.forEach(({ kicker, a }) => {
    need(70); rule(); y += 12;
    font('helvetica', 'bold', 8, BRAND); doc.text(clean(kicker.toUpperCase()), M, y + 8); y += 13;
    font('times', 'bold', 13.5, INK); doc.splitTextToSize(clean(a.title), CW).forEach(l => { need(18); doc.text(l, M, y + 13); y += 16; }); y += 2;
    if (a.lead) para(a.lead, 'times', 'normal', 10, INK2, 5);
    (a.blocks || []).forEach(k => block(k));
    if (a.src) { font('helvetica', 'italic', 7.5, INK3); need(12); doc.text(clean(`Source: ${a.src}`), M, y + 8); y += 14; }
  });

  function block(k) {
    switch (k.type) {
      case 'kpis': table(null, [k.items.map(x => `${clean(x.label)}\n${clean(x.value)}${x.sub ? `  (${clean(x.sub)})` : ''}`)], { theme: 'plain', styles: { font: 'helvetica', fontSize: 8.5, textColor: INK, cellPadding: 3 } }); break;
      case 'table': table(k.cols, k.rows.map(r => r.cells.map(cellText))); break;
      case 'layers': table(['Layer', 'Verdict', 'Evidence'], k.items.map(x => [x.name, x.verdict, clean(x.text)]), { columnStyles: { 0: { cellWidth: 70 }, 1: { cellWidth: 60 } } }); break;
      case 'timeline': table(['Time', 'What happened', 'Source'], k.items.map(x => [clean(x.t), clean(x.text), clean(x.src)]), { columnStyles: { 0: { cellWidth: 80 } } }); break;
      case 'list': k.items.forEach(l => para(`${l.k && l.k !== '•' ? `${l.k}: ` : '• '}${l.v}`, 'helvetica', 'normal', 8.5, INK2, 1)); y += 3; break;
      case 'heading': need(16); font('helvetica', 'bold', 9, INK); doc.text(clean(k.text), M, y + 9); y += 14; break;
      case 'text': para(k.text, 'times', k.tone === 'muted' ? 'italic' : 'normal', k.tone === 'muted' ? 8.5 : 10, k.tone === 'muted' ? INK3 : INK2, 4); break;
      case 'bars': {
        if (k.title) { need(14); font('helvetica', 'bold', 8, INK3); doc.text(clean(k.title), M, y + 8); y += 12; }
        const mx = k.max || Math.max(1, ...k.items.map(x => x.value)), lw = 190, vw = 60, bwid = CW - lw - vw - 10;
        k.items.forEach(x => { need(14); font('helvetica', 'normal', 8, INK); doc.text(doc.splitTextToSize(clean(x.label), lw - 6)[0], M, y + 8); doc.setFillColor(238, 240, 243); doc.rect(M + lw, y + 2, bwid, 7, 'F'); doc.setFillColor(...(TONE[x.tone] || TONE.info)); doc.rect(M + lw, y + 2, Math.max(2, x.value / mx * bwid), 7, 'F'); font('helvetica', 'bold', 8, INK); doc.text(clean(x.display ?? x.value), W - M, y + 8, { align: 'right' }); y += 13; });
        y += 4; break;
      }
      case 'spark': {
        need(54); font('helvetica', 'bold', 8, INK3); doc.text(clean(k.label), M, y + 8); y += 12;
        const vs = k.values, mx = k.max || Math.max(1, ...vs), mn = k.max ? 0 : Math.min(...vs), h = 34, st = CW / Math.max(1, vs.length - 1), Y = v => y + h - (v - mn) / ((mx - mn) || 1) * h;
        doc.setDrawColor(...TONE.info); doc.setLineWidth(1.2); for (let i = 1; i < vs.length; i++) doc.line(M + (i - 1) * st, Y(vs[i - 1]), M + i * st, Y(vs[i]));
        if (k.mark) { doc.setDrawColor(...TONE.bad); doc.setLineWidth(0.5); doc.setLineDashPattern([3, 2], 0); doc.line(M, Y(k.mark), W - M, Y(k.mark)); doc.setLineDashPattern([], 0); }
        y += h + 10; break;
      }
      default: break;
    }
  }

  // footer on every page
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) { doc.setPage(i); font('helvetica', 'normal', 7.5, INK3); doc.text(clean(`${ed.label} · ${ed.persona.title} · sample data, illustrative`), M, H - 24); doc.text(`Page ${i} of ${pages}`, W - M, H - 24, { align: 'right' }); }
  return doc;
}

export function downloadEdition(ed) {
  const doc = editionPdf(ed);
  const stamp = new Date(ed.at).toISOString().slice(0, 10);
  doc.save(`SRS-${ed.persona.id}-${ed.period}-${stamp}.pdf`);
}
