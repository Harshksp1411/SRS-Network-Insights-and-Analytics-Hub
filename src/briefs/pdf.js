// Turns an edition (see compose.js) into a short PDF in the browser: masthead, headline, going well and to fix,
// the story in focus, the numbers, your day, the picture (the same four charts as the page, drawn natively), the
// stories and the rest in brief. In Helvetica: Aptos cannot be embedded, and Helvetica is the closest built-in font.
import { jsPDF } from 'jspdf';
import { dt, hhmm, num } from '../util.js';
import { FMT } from './visuals.js';

const INK = [22, 25, 29], INK2 = [70, 76, 84], INK3 = [112, 118, 128], LINE = [210, 206, 198], BRAND = [118, 33, 35];
const TONE = { ok: [46, 133, 64], warn: [196, 106, 0], bad: [198, 42, 30], info: [47, 109, 181] };
// the built-in fonts cover Western European text; swap the few symbols they cannot print
const clean = v => String(v ?? '').replace(/→/g, '->').replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/[✓✔]/g, 'OK').replace(/[✗✘]/g, 'x').replace(/[^\u0000-ÿ–—‘’“”•…€™]/g, '');
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
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
  if (ed.weather) doc.text(clean(`Network weather: ${ed.weather.word}`), W / 2, y + 9, { align: 'center' });
  doc.text(`Printed ${hhmm(ed.at)} CT`, W - M, y + 9, { align: 'right' }); y += 14;
  rule(y, 0.5); rule(y + 3, 1.2); y += 18;

  // lead: headline, deck, going well and to fix side by side, in focus
  col(ed.headline, M, CW, 22, 'bold', INK, 1.12); y += 2;
  col(ed.deck, M, CW, 12, 'normal', INK2); y += 10;
  need(90); const y0 = y, hw = (CW - 20) / 2; let yEnd = y;
  [['Going well', ed.wins, TONE.ok], ['To fix', ed.fixes, TONE.warn]].forEach(([t, items, c], k) => {
    const x = M + k * (hw + 20); y = y0;
    font('bold', 8.5, c); doc.text(t.toUpperCase(), x, y + 8, { charSpace: 0.5 }); y += 12; rule(y, 1.2, c, x, x + hw); y += 8;
    items.forEach(it => { doc.setFillColor(...c); doc.circle(x + 2.5, y + 6, 2.2, 'F'); col(it, x + 10, hw - 10, 10, 'normal', INK); y += 4; });
    yEnd = Math.max(yEnd, y);
  });
  y = yEnd;
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
    section({ daily: 'Your day', weekly: 'Next week', monthly: 'The month ahead' }[ed.period]);
    ed.agenda.forEach(a => { need(18); font('bold', 8.5, a.late ? TONE.bad : INK); doc.text(clean(a.when), M, y + 9); font('normal', 7.5, INK3); doc.text(clean(a.kind), M, y + 19); const y0 = y; col(a.what, M + 110, CW - 110, 9.5, 'normal', INK); y = Math.max(y0 + 22, y) + 3; rule(y, 0.3, LINE); y += 5; });
    y += 6;
  }


  // the picture: four charts in two columns, the same numbers as the page
  const chart = (v, x, y0, w) => {
    let yy = y0;
    font('bold', 10.5, INK); doc.splitTextToSize(clean(v.title), w).slice(0, 2).forEach(l => { doc.text(l, x, yy + 10); yy += 12.5; }); yy += 4;
    const bar = (bx, by, bw, bh, col) => { doc.setFillColor(...col); doc.rect(bx, by, Math.max(0.6, bw), bh, 'F'); };
    if (v.kind === 'stack' || v.kind === 'donut') {
      const tot = v.parts.reduce((a, p) => a + p.value, 0) || 1;
      const big = v.kind === 'donut' ? v.center : `${Math.round(v.parts[0].value / tot * 1000) / 10}%`;
      font('bold', 22, TONE.ok); doc.text(clean(big), x, yy + 20); const bwid = doc.getTextWidth(clean(big)); font('normal', 8, INK2); doc.text(clean(v.kind === 'donut' ? v.sub : v.parts[0].label.toLowerCase()), x + bwid + 6, yy + 20); yy += 30;
      let bx = x; v.parts.forEach(p => { const bw = p.value / tot * w; if (p.value) { bar(bx, yy, bw, 12, rgb(p.color)); bx += bw; } }); yy += 20;
      v.parts.forEach(p => { doc.setFillColor(...rgb(p.color)); doc.rect(x, yy + 2, 6, 6, 'F'); font('normal', 8.5, INK2); doc.text(clean(p.label), x + 10, yy + 8); font('bold', 8.5, INK); doc.text(num(p.value), x + w, yy + 8, { align: 'right' }); yy += 12; });
      if (v.top && v.top.length) { yy += 4; font('bold', 7, INK3); doc.text(clean((v.topTitle || 'Worst first').toUpperCase()), x, yy + 7, { charSpace: 0.4 }); yy += 11; v.top.forEach(t => { doc.setFillColor(...rgb(t.color)); doc.circle(x + 2, yy + 4.5, 2, 'F'); font('normal', 8, INK); doc.text(doc.splitTextToSize(clean(`${t.label} – ${t.why}`), w - 8)[0], x + 8, yy + 7); yy += 11; }); }
    } else if (v.kind === 'map') {
      const bad = v.points.filter(p => p.st !== 'up');
      font('normal', 8.5, INK2); doc.text(clean(`${bad.length} of ${v.points.length} branches being worked on:`), x, yy + 8); yy += 14;
      bad.slice(0, 10).forEach(p => { doc.setFillColor(...rgb(p.color)); doc.circle(x + 2, yy + 4.5, 2, 'F'); font('normal', 8, INK); doc.text(doc.splitTextToSize(clean(p.label), w - 8)[0], x + 8, yy + 7); yy += 11; });
      if (bad.length > 10) { font('normal', 8, INK3); doc.text(`…and ${bad.length - 10} more`, x + 8, yy + 7); yy += 11; }
    } else if (v.kind === 'hbars') {
      const f = FMT[v.fmt] || FMT.n, mx = v.max || Math.max(1, ...v.rows.map(r => r.value)), lw = Math.min(120, w * 0.42), bwMax = w - lw - 44;
      v.rows.slice(0, 10).forEach(r => { font('normal', 8, INK2); doc.text(doc.splitTextToSize(clean(r.label), lw - 4)[0], x, yy + 7); doc.setFillColor(232, 228, 219); doc.rect(x + lw, yy + 1.5, bwMax, 6, 'F'); bar(x + lw, yy + 1.5, r.value / mx * bwMax, 6, rgb(r.color || '#2F6DB5')); font('bold', 8, INK); doc.text(clean(r.display ?? f(r.value)), x + w, yy + 7, { align: 'right' }); yy += 12; });
    } else if (v.kind === 'cols') {
      const H = 90, n = v.data.length, tot = d => v.keys.reduce((a, k) => a + (d[k] || 0), 0), mx = Math.max(1, ...v.data.map(tot)), cw = w / n, bw = Math.min(16, cw * 0.6);
      doc.setDrawColor(...LINE); doc.setLineWidth(0.4); doc.line(x, yy + H, x + w, yy + H);
      font('normal', 7, INK3); doc.text(num(mx), x, yy + 6);
      v.data.forEach((d, i) => { let top = yy + H; v.keys.forEach((k, j) => { const hh = (d[k] || 0) / mx * (H - 10); if (hh > 0) { top -= hh; bar(x + i * cw + (cw - bw) / 2, top, bw, hh, rgb(v.colors[j])); } }); if (n <= 8 || i % 2 === 0) { font('normal', 6.5, INK3); doc.text(clean(d.label), x + i * cw + cw / 2, yy + H + 9, { align: 'center' }); } });
      yy += H + 14; let lx = x; v.keys.forEach((k, j) => { doc.setFillColor(...rgb(v.colors[j])); doc.rect(lx, yy + 1, 6, 6, 'F'); font('normal', 7.5, INK2); doc.text(clean(k), lx + 9, yy + 7); lx += doc.getTextWidth(clean(k)) + 22; }); yy += 12;
    } else if (v.kind === 'line') {
      const H = 90, L = 46, f = FMT[v.fmt] || FMT.n, all = [...v.series.flatMap(s2 => s2.data), ...(v.refLines || []).map(r => r.v)].filter(z => z != null);
      let lo = v.yMin ?? Math.min(...all), hi = Math.max(...all); const pad = (hi - lo) * 0.1 || 1; if (v.yMin == null) lo -= pad; hi += pad;
      const X = i => x + L + i / Math.max(1, v.labels.length - 1) * (w - L - 4), Y = z => yy + H - (z - lo) / (hi - lo) * H;
      font('normal', 6.5, INK3); [lo, (lo + hi) / 2, hi].forEach(t => { doc.setDrawColor(...LINE); doc.setLineWidth(0.3); doc.line(x + L, Y(t), x + w, Y(t)); doc.text(clean(f(t)), x + L - 4, Y(t) + 2, { align: 'right' }); });
      (v.refLines || []).forEach(r => { doc.setDrawColor(...rgb(r.color)); doc.setLineWidth(0.8); doc.setLineDashPattern([3, 2], 0); doc.line(x + L, Y(r.v), x + w, Y(r.v)); doc.setLineDashPattern([], 0); font('bold', 6.5, INK2); doc.text(clean(r.label), x + L + 3, Y(r.v) - 2.5); });
      v.series.forEach(s2 => { doc.setDrawColor(...rgb(s2.color)); doc.setLineWidth(1.4); s2.data.forEach((z, i) => { if (i && z != null && s2.data[i - 1] != null) doc.line(X(i - 1), Y(s2.data[i - 1]), X(i), Y(z)); }); const k = s2.data.length - 1; doc.setFillColor(...rgb(s2.color)); doc.circle(X(k), Y(s2.data[k]), 1.8, 'F'); });
      font('normal', 6.5, INK3); v.labels.forEach((l, i) => doc.text(clean(l), X(i), yy + H + 9, { align: i === 0 ? 'left' : i === v.labels.length - 1 ? 'right' : 'center' }));
      yy += H + 14;
      if (v.series.length > 1) { let lx = x + L; v.series.forEach(s2 => { doc.setFillColor(...rgb(s2.color)); doc.rect(lx, yy + 1, 6, 6, 'F'); font('normal', 7.5, INK2); doc.text(clean(s2.name), lx + 9, yy + 7); lx += doc.getTextWidth(clean(s2.name)) + 22; }); yy += 12; }
    }
    yy += 3; font('normal', 8, INK2); doc.splitTextToSize(clean(v.caption), w).forEach(l => { doc.text(l, x, yy + 8); yy += 10; });
    return yy;
  };
  if (ed.visuals && ed.visuals.length) {
    need(250); section('The picture');
    const cw2 = (CW - 24) / 2;
    for (let i = 0; i < ed.visuals.length; i += 2) {
      need(210); const y0 = y; let yEnd = y;
      ed.visuals.slice(i, i + 2).forEach((v, k) => { yEnd = Math.max(yEnd, chart(v, M + k * (cw2 + 24), y0, cw2)); });
      y = yEnd + 14;
    }
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
  for (let i = 1; i <= pages; i++) { doc.setPage(i); rule(H - 34, 0.4, LINE); font('normal', 7, INK3); doc.text(clean(`The ${ed.label} · ${ed.persona.title} · generated ${dt(ed.at)} CT`), M, H - 24); doc.text(`Page ${i} of ${pages}`, W - M, H - 24, { align: 'right' }); }
  return doc;
}

export function downloadEdition(ed) {
  const doc = editionPdf(ed);
  const stamp = new Date(ed.at).toISOString().slice(0, 10);
  doc.save(`SRS-${ed.persona.id}-${ed.period}-${stamp}.pdf`);
}
