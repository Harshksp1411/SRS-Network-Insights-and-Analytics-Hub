// Turns an edition (see compose.js) into a short newspaper-style PDF in the browser: masthead, headline, the
// front-page picture, what you need to know, the numbers, your day, four illustrated stories, the branch map and
// the stories in brief. Pictures are the page's own drawings (art.jsx); text uses the built-in PDF fonts.
import React from 'react';
import { jsPDF } from 'jspdf';
import { dt, hhmm } from '../util.js';
import { Scene, StoryArt, BranchMap, TONES, WEATHER_ICON, toPng } from './art.jsx';

const INK = [22, 25, 29], INK2 = [70, 76, 84], INK3 = [112, 118, 128], LINE = [205, 200, 190], BRAND = [118, 33, 35];
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const TONE = Object.fromEntries(Object.entries(TONES).map(([k, v]) => [k, rgb(v)]));
// the built-in fonts cover Western European text; swap the few symbols they cannot print
const clean = v => String(v ?? '').replace(/→/g, '->').replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/[✓✔]/g, 'OK').replace(/[✗✘]/g, 'x').replace(/[^\u0000-ÿ–—‘’“”•…€™]/g, '');
const dayNo = t => Math.floor((t - Date.UTC(new Date(t).getUTCFullYear(), 0, 0)) / 864e5);
const longDate = t => new Date(t).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Chicago' });

export async function editionPdf(ed) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 36, CW = W - 2 * M;
  const W2 = WEATHER_ICON[ed.weather.kind], EAR = 112;
  const mapAr = 1 / 1.75;
  const [scene, weather, map, ...arts] = await Promise.all([
    toPngSafe(<Scene weather={ed.weather.kind} sign={ed.pic.sign} badge={ed.pic.badge} />, 1200, 520),
    toPngSafe(<W2 xmlns="http://www.w3.org/2000/svg" color="#C46A00" strokeWidth={1.8} />, 96, 96),
    toPngSafe(<BranchMap points={ed.map.points} focus={ed.map.focus} />, 1400, Math.round(1400 * mapAr)),
    ...ed.stories.map(x => toPngSafe(<StoryArt kicker={x.kicker} />, 800, 440)),
  ]);
  let y = M;
  const need = h => { if (y + h > H - 46) { doc.addPage(); y = M; } };
  const font = (f, st, size, col = INK) => { doc.setFont(f, st); doc.setFontSize(size); doc.setTextColor(...col); };
  const rule = (yy, w = 0.6, col = INK, x0 = M, x1 = W - M) => { doc.setDrawColor(...col); doc.setLineWidth(w); doc.line(x0, yy, x1, yy); };
  const dbl = yy => { rule(yy, 1.2); rule(yy + 3, 0.5); };
  // text in a column; returns the y below it
  const col = (t, x, yy, w, size, f = 'times', st = 'normal', c = INK2, lh = 1.25) => { font(f, st, size, c); doc.splitTextToSize(clean(t), w).forEach(l => { doc.text(l, x, yy + size); yy += size * lh; }); return yy; };
  const label = (t, x, yy, c = INK) => { font('helvetica', 'bold', 8, c); doc.text(clean(t).toUpperCase(), x, yy + 8, { charSpace: 0.6 }); };

  // masthead
  font('helvetica', 'bold', 7, INK3); doc.text('SRS NETWORK INSIGHTS AND ANALYTICS HUB', M, y + 7, { charSpace: 0.5 });
  doc.text(clean(`EDITION FOR ${ed.persona.title.toUpperCase()}`), W - M, y + 7, { align: 'right', charSpace: 0.5 }); y += 14;
  doc.setDrawColor(...INK); doc.setLineWidth(0.6); doc.rect(M, y, EAR, 40);
  if (weather) doc.addImage(weather, 'JPEG', M + 5, y + 6, 28, 28);
  font('helvetica', 'bold', 6.5, INK3); doc.text('NETWORK WEATHER', M + 38, y + 11);
  font('times', 'bold', 11, INK); doc.text(clean(ed.weather.word), M + 38, y + 23);
  font('helvetica', 'normal', 6.5, INK3); doc.text(doc.splitTextToSize(clean(ed.weather.line), EAR - 42)[0], M + 38, y + 33);
  doc.rect(W - M - EAR, y, EAR, 40);
  font('helvetica', 'bold', 6.5, INK3); doc.text('A TWO-MINUTE READ', W - M - 6, y + 11, { align: 'right' });
  font('times', 'bold', 10, INK); doc.splitTextToSize(clean(ed.persona.name), EAR - 12).slice(0, 1).forEach(l => doc.text(l, W - M - 6, y + 23, { align: 'right' }));
  font('helvetica', 'normal', 6.5, INK3); doc.text(doc.splitTextToSize(clean(ed.persona.title), EAR - 12)[0], W - M - 6, y + 33, { align: 'right' });
  // the nameplate fills the space between the ears
  const name = clean(`The ${ed.label}`), room = CW - 2 * EAR - 24;
  font('times', 'bold', 34, INK); const ns = Math.min(34, 34 * room / doc.getTextWidth(name));
  doc.setFontSize(ns); doc.text(name, W / 2, y + 20 + ns * 0.35, { align: 'center' }); y += 48;
  dbl(y); y += 6;
  font('helvetica', 'normal', 7.5, INK); doc.text(`VOL. I · NO. ${dayNo(ed.at)}`, M, y + 8);
  font('helvetica', 'bold', 7.5, INK); doc.text(clean(ed.period === 'daily' ? longDate(ed.at) : ed.range).toUpperCase(), W / 2, y + 8, { align: 'center' });
  font('helvetica', 'normal', 7.5, INK); doc.text(`PRINTED ${hhmm(ed.at)} CT`, W - M, y + 8, { align: 'right' }); y += 13;
  dbl(y); y += 14;

  // headline, deck, picture
  y = col(ed.headline, M, y, CW, 25, 'times', 'bold', INK, 1.08) + 4;
  y = col(ed.deck, M, y, CW, 12.5, 'times', 'italic', INK2) + 6;
  const ph = CW * 520 / 1200;
  if (scene) { doc.addImage(scene, 'JPEG', M, y, CW, ph); doc.setDrawColor(...LINE); doc.setLineWidth(0.5); doc.rect(M, y, CW, ph); y += ph + 4; }
  y = col(`${ed.pic.caption}  Illustration: Mova iO`, M, y, CW, 8.5, 'times', 'italic', INK2) + 8;

  // what you need to know, three columns
  label('What you need to know', M, y); y += 13;
  const kw = (CW - 2 * 14) / 3; let ky = y;
  ed.know.forEach((t, i) => { const x = M + i * (kw + 14); doc.setDrawColor(...BRAND); doc.setLineWidth(1.5); doc.line(x, y, x + kw, y); ky = Math.max(ky, col(t, x, y + 4, kw, 10.5, 'times', 'normal', INK, 1.22)); });
  y = ky + 12;

  // at a glance
  need(60); label('At a glance', M, y); y += 12; rule(y, 1.2); y += 6;
  const nw = (CW - 3 * 10) / 4;
  ed.numbers.forEach((x, i) => { const bx = M + i * (nw + 10); font('times', 'bold', 22, TONE[x.tone] || INK); doc.text(clean(x.value), bx, y + 20); col(x.label, bx, y + 25, nw, 8, 'helvetica', 'normal', INK2); });
  y += 50;

  // your day
  if (ed.agenda.length) {
    need(30 + ed.agenda.length * 16); label(ed.period === 'daily' ? 'Your day' : 'Coming up', M, y); y += 12; rule(y, 1.2); y += 4;
    ed.agenda.forEach(a => { need(16); font('helvetica', 'bold', 8, a.late ? TONE.bad : INK3); doc.text(clean(`${a.when} · ${a.kind}`), M, y + 9); const ey = col(a.what, M + 120, y, CW - 120, 9, 'helvetica', 'normal', INK); y = Math.max(y + 13, ey) + 3; rule(y, 0.3, LINE); y += 3; });
    y += 10;
  }

  // inside this edition: illustrated stories, two per row
  doc.addPage(); y = M;
  label('Inside this edition', M, y); y += 12; dbl(y); y += 12;
  const sw = (CW - 18) / 2, ih = sw * 220 / 400;
  for (let r = 0; r < ed.stories.length; r += 2) {
    need(ih + 150); const y0 = y; let yb = y;
    [0, 1].forEach(j => {
      const x = ed.stories[r + j], img = arts[r + j]; if (!x) return;
      const cx0 = M + j * (sw + 18), s = x.sum; let yy = y0;
      if (img) { doc.addImage(img, 'JPEG', cx0, yy, sw, ih); doc.setDrawColor(...LINE); doc.setLineWidth(0.5); doc.rect(cx0, yy, sw, ih); yy += ih + 8; }
      label(x.kicker, cx0, yy, BRAND); yy += 12;
      yy = col(s.title, cx0, yy, sw, 13, 'times', 'bold', INK, 1.12) + 2;
      if (s.line) yy = col(s.line, cx0, yy, sw, 9.5, 'times', 'normal', INK2) + 4;
      if (s.stats.length) { const tw = sw / s.stats.length; s.stats.forEach((t, k) => { font('times', 'bold', 15, TONE[t.tone] || INK); doc.text(clean(t.value), cx0 + k * tw, yy + 14); font('helvetica', 'normal', 6.8, INK3); doc.text(doc.splitTextToSize(clean(t.label), tw - 6)[0], cx0 + k * tw, yy + 23); }); yy += 30; }
      if (s.bars) { const mx = s.bars.max || Math.max(1, ...s.bars.items.map(v => v.value)); s.bars.items.forEach(b => { font('helvetica', 'normal', 7.5, INK2); doc.text(doc.splitTextToSize(clean(b.label), sw - 40)[0], cx0, yy + 7); font('helvetica', 'bold', 7.5, INK); doc.text(clean(b.display ?? b.value), cx0 + sw, yy + 7, { align: 'right' }); doc.setFillColor(232, 228, 219); doc.rect(cx0, yy + 9, sw, 3, 'F'); doc.setFillColor(...(TONE[b.tone] || TONE.info)); doc.rect(cx0, yy + 9, Math.max(2, b.value / mx * sw), 3, 'F'); yy += 16; }); yy += 2; }
      s.points.forEach(p => { doc.setFillColor(...(TONE[p.tone] || INK)); doc.circle(cx0 + 2, yy + 5, 1.6, 'F'); yy = col(`${p.b || ''}${p.b && p.t ? ' – ' : ''}${p.t || ''}`, cx0 + 8, yy, sw - 8, 8, 'helvetica', 'normal', INK2, 1.3) + 2; });
      yb = Math.max(yb, yy);
    });
    y = yb + 10; if (r + 2 < ed.stories.length) { rule(y, 0.4, LINE); y += 12; }
  }

  // where the trouble is
  const mh = CW * mapAr;
  need(mh + 40); y += 4; label('Where the trouble is', M, y); y += 12; rule(y, 1.2); y += 6;
  if (map) { doc.addImage(map, 'JPEG', M, y, CW, mh); doc.setDrawColor(...LINE); doc.setLineWidth(0.5); doc.rect(M, y, CW, mh); y += mh + 6; }
  const shown = ed.map.points.filter(x => x.in); let lx = M;
  [['bad', 'Offline'], ['warn', 'Open with a problem'], ['info', 'On backup line'], ['ok', 'Trading normally']].forEach(([t, l]) => { const txt = `${l} ${shown.filter(x => x.tone === t).length}`; doc.setFillColor(...(t === 'ok' ? [156, 148, 131] : TONE[t])); doc.circle(lx + 3, y + 5, 3, 'F'); font('helvetica', 'normal', 8, INK2); doc.text(txt, lx + 9, y + 8); lx += doc.getTextWidth(txt) + 24; });
  y += 20;

  // in brief
  if (ed.inBrief.length) {
    need(40); label('In brief', M, y); y += 12; rule(y, 1.2); y += 4;
    ed.inBrief.forEach(x => { need(30); label(x.kicker, M, y, BRAND); y = col(x.sum.title, M, y + 11, CW, 11, 'times', 'bold', INK) + 1; if (x.sum.line) y = col(x.sum.line, M, y, CW, 8.5, 'times', 'normal', INK2); y += 4; rule(y, 0.3, LINE); y += 5; });
  }

  // footer on every page
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) { doc.setPage(i); rule(H - 34, 0.4, LINE); font('helvetica', 'normal', 7, INK3); doc.text(clean(`The ${ed.label} · ${ed.persona.title} · generated ${dt(ed.at)} CT · sample data, illustrative`), M, H - 24); doc.text(`Page ${i} of ${pages}`, W - M, H - 24, { align: 'right' }); }
  return doc;
}

// a picture that fails to draw leaves a gap, not a failed download
const toPngSafe = (el, w, h) => toPng(el, w, h).catch(() => null);

export async function downloadEdition(ed) {
  const doc = await editionPdf(ed);
  const stamp = new Date(ed.at).toISOString().slice(0, 10);
  doc.save(`SRS-${ed.persona.id}-${ed.period}-${stamp}.pdf`);
}
