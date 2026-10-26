// Turns an edition (see compose.js) into a short PDF in the browser: masthead, headline, what you need to know,
// the story in focus, the numbers, your day, the stories and the rest in brief. Text only, in Helvetica: Aptos
// cannot be embedded, and Helvetica is the closest of the built-in PDF fonts.
import { jsPDF } from 'jspdf';
import { dt, hhmm } from '../util.js';

const INK = [22, 25, 29], INK2 = [70, 76, 84], INK3 = [112, 118, 128], LINE = [210, 206, 198], BRAND = [118, 33, 35];
const TONE = { ok: [46, 133, 64], warn: [196, 106, 0], bad: [198, 42, 30], info: [47, 109, 181] };
// the built-in fonts cover Western European text; swap the few symbols they cannot print
const clean = v => String(v ?? '').replace(/→/g, '->').replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/[✓✔]/g, 'OK').replace(/[✗✘]/g, 'x').replace(/[^\u0000-ÿ–—‘’“”•…€™]/g, '');
const longDate = t => new Date(t).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Chicago' });

export function editionPdf(ed) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 40, CW = W - 2 * M;
  let y = M;
  const need = h => { if (y + h > H - 46) { doc.addPage(); y = M; } };
  const font = (st, size, col = INK) => { doc.setFont('helvetica', st); doc.setFontSize(size); doc.setTextColor(...col); };
  const rule = (yy, w = 0.6, col = INK, x0 = M, x1 = W - M) => { doc.setDrawColor(...col); doc.setLineWidth(w); doc.line(x0, yy, x1, yy); };
  // text in a column; returns the y below it
  const col = (t, x, w, size, st = 'normal', c = INK2, lh = 1.3) => { font(st, size, c); doc.splitTextToSize(clean(t), w).forEach(l => { need(size * lh); doc.text(l, x, y + size); y += size * lh; }); };
  const section = t => { need(30); font('bold', 8.5, INK); doc.text(clean(t).toUpperCase(), M, y + 8, { charSpace: 0.5 }); y += 12; rule(y, 1.2); y += 8; };

  // masthead
  font('bold', 7, INK3); doc.text('SRS NETWORK INSIGHTS AND ANALYTICS HUB', M, y + 7, { charSpace: 0.5 });
  doc.text(clean(`EDITION FOR ${ed.persona.title.toUpperCase()}`), W - M, y + 7, { align: 'right', charSpace: 0.5 }); y += 14;
  font('bold', 32, INK); doc.text(clean(`The ${ed.label}`), W / 2, y + 30, { align: 'center' }); y += 42;
  rule(y, 1.2); rule(y + 3, 0.5); y += 6;
  font('normal', 8, INK2);
  doc.text(clean(ed.period === 'daily' ? longDate(ed.at) : ed.range), M, y + 9);
  doc.text(clean(`Network weather: ${ed.weather.word}`), W / 2, y + 9, { align: 'center' });
  doc.text(`Printed ${hhmm(ed.at)} CT`, W - M, y + 9, { align: 'right' }); y += 14;
  rule(y, 0.5); rule(y + 3, 1.2); y += 18;

  // lead: headline, deck, what you need to know, in focus
  col(ed.headline, M, CW, 22, 'bold', INK, 1.12); y += 2;
  col(ed.deck, M, CW, 12, 'normal', INK2); y += 10;
  section('What you need to know');
  ed.know.forEach(t => { need(16); doc.setFillColor(...BRAND); doc.rect(M, y + 4, 4, 4, 'F'); const x = M + 12; col(t, x, CW - 12, 10.5, 'normal', INK); y += 4; });
  y += 4; need(40);
  const fy = y; font('bold', 7.5, BRAND); doc.text('IN FOCUS', M + 10, y + 8, { charSpace: 0.5 }); y += 12;
  col(ed.inFocus, M + 10, CW - 10, 10, 'normal', INK);
  doc.setDrawColor(...BRAND); doc.setLineWidth(2.5); doc.line(M + 1, fy, M + 1, y); y += 14;

  // by the numbers
  section('By the numbers');
  const nw = (CW - 3 * 12) / 4;
  ed.numbers.forEach((x, i) => { const bx = M + i * (nw + 12); font('bold', 20, TONE[x.tone] || INK); doc.text(clean(x.value), bx, y + 18); font('normal', 8, INK2); doc.text(doc.splitTextToSize(clean(x.label), nw)[0], bx, y + 30); });
  y += 44;

  // your day
  if (ed.agenda.length) {
    section(ed.period === 'daily' ? 'Your day' : 'Coming up');
    ed.agenda.forEach(a => { need(18); font('bold', 8.5, a.late ? TONE.bad : INK); doc.text(clean(a.when), M, y + 9); font('normal', 7.5, INK3); doc.text(clean(a.kind), M, y + 19); const y0 = y; col(a.what, M + 110, CW - 110, 9.5, 'normal', INK); y = Math.max(y0 + 22, y) + 3; rule(y, 0.3, LINE); y += 5; });
    y += 6;
  }

  // the stories
  section('Inside this edition');
  ed.stories.forEach((x, n) => {
    const s = x.sum;
    need(90); if (n) { rule(y, 0.3, LINE); y += 8; }
    font('bold', 7.5, BRAND); doc.text(clean(x.kicker.toUpperCase()), M, y + 8, { charSpace: 0.5 }); y += 12;
    col(s.title, M, CW, 13, 'bold', INK, 1.15); y += 1;
    if (s.line) col(s.line, M, CW, 9.5, 'normal', INK2);
    if (s.stats.length) { need(30); const tw = Math.min(130, CW / s.stats.length); s.stats.forEach((t, k) => { font('bold', 14, TONE[t.tone] || INK); doc.text(clean(t.value), M + k * tw, y + 14); font('normal', 7, INK3); doc.text(doc.splitTextToSize(clean(t.label), tw - 8)[0], M + k * tw, y + 23); }); y += 30; }
    if (s.bars) { const mx = s.bars.max || Math.max(1, ...s.bars.items.map(v => v.value)), bw = CW - 200; s.bars.items.forEach(b => { need(14); font('normal', 8, INK2); doc.text(doc.splitTextToSize(clean(b.label), 150)[0], M, y + 8); doc.setFillColor(232, 228, 219); doc.rect(M + 160, y + 3, bw, 5, 'F'); doc.setFillColor(...(TONE[b.tone] || TONE.info)); doc.rect(M + 160, y + 3, Math.max(2, b.value / mx * bw), 5, 'F'); font('bold', 8, INK); doc.text(clean(b.display ?? b.value), W - M, y + 8, { align: 'right' }); y += 13; }); y += 3; }
    s.points.forEach(p => { need(12); doc.setFillColor(...(TONE[p.tone] || INK)); doc.circle(M + 2, y + 5, 1.6, 'F'); col(`${p.b || ''}${p.b && p.t ? ' – ' : ''}${p.t || ''}`, M + 9, CW - 9, 8.5, 'normal', INK2); });
    y += 8;
  });

  // in brief
  if (ed.inBrief.length) {
    y += 4; section('In brief');
    ed.inBrief.forEach(x => { need(30); font('bold', 7.5, BRAND); doc.text(clean(x.kicker.toUpperCase()), M, y + 8, { charSpace: 0.5 }); y += 11; col(x.sum.title, M, CW, 10.5, 'bold', INK); if (x.sum.line) col(x.sum.line, M, CW, 8.5, 'normal', INK2); y += 4; });
  }

  // footer on every page
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) { doc.setPage(i); rule(H - 34, 0.4, LINE); font('normal', 7, INK3); doc.text(clean(`The ${ed.label} · ${ed.persona.title} · generated ${dt(ed.at)} CT · sample data, illustrative`), M, H - 24); doc.text(`Page ${i} of ${pages}`, W - M, H - 24, { align: 'right' }); }
  return doc;
}

export function downloadEdition(ed) {
  const doc = editionPdf(ed);
  const stamp = new Date(ed.at).toISOString().slice(0, 10);
  doc.save(`SRS-${ed.persona.id}-${ed.period}-${stamp}.pdf`);
}
