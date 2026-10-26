// Pictures for the briefs: the front-page "photo" (a row of branches under today's network weather), a small
// illustration per story, and a map of where the trouble is. All are plain SVG with inline colours, so the same
// drawing shows on the page and, turned into an image by toPng, in the PDF reports.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as I from 'lucide-react';
import MAP from '../mapdata.json';

const NS = 'http://www.w3.org/2000/svg';
export const TONES = { ok: '#2E8540', warn: '#C46A00', bad: '#C62A1E', info: '#2F6DB5' };
const SKY = { sun: ['#bcd9ef', '#eef5f9'], partly: ['#c7d8e6', '#eef2f4'], cloud: ['#b9c2cb', '#e4e7ea'], storm: ['#7d8794', '#c4c9cf'] };
export const WEATHER_ICON = { sun: I.Sun, partly: I.CloudSun, cloud: I.Cloud, storm: I.CloudLightning };

// halftone dots give the drawings a printed-newspaper look
const Dots = ({ id, op = 0.09, step = 6 }) => <pattern id={id} width={step} height={step} patternUnits="userSpaceOnUse"><circle cx={step / 2} cy={step / 2} r={step * 0.22} fill="#000" fillOpacity={op} /></pattern>;
const Cloud = ({ x, y, s = 1, fill = '#fff', op = 0.95 }) => <g transform={`translate(${x},${y}) scale(${s})`} fill={fill} fillOpacity={op}><ellipse cx="0" cy="0" rx="60" ry="26" /><ellipse cx="-34" cy="6" rx="38" ry="20" /><ellipse cx="38" cy="8" rx="40" ry="19" /><ellipse cx="6" cy="-18" rx="36" ry="24" /></g>;

function Store({ x, w, h, base, wall, awn, sign, lit }) {
  const y = base - h, dw = Math.min(46, w * 0.22), win = (w - dw - 36) / 2, n = Math.max(3, Math.round(w / 34));
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={wall} />
      <rect x={x - 4} y={y - 10} width={w + 8} height={12} fill="#6f6556" />
      <rect x={x + 10} y={y + 10} width={w - 20} height={26} fill="#f6f1e6" stroke="#6f6556" strokeWidth="2" />
      {sign && <text x={x + w / 2} y={y + 29} textAnchor="middle" fontFamily="Georgia, serif" fontWeight="700" fontSize="17" fill="#3a2a22">{sign}</text>}
      {Array.from({ length: n }, (_, i) => <rect key={i} x={x + 6 + i * (w - 12) / n} y={y + 44} width={(w - 12) / n} height={16} fill={i % 2 ? '#f4efe4' : awn} />)}
      <rect x={x + 12} y={y + 68} width={win} height={h - 82} fill={lit ? '#f4dc9a' : '#cfd9df'} stroke="#6f6556" strokeWidth="2" />
      <rect x={x + w - 12 - win} y={y + 68} width={win} height={h - 82} fill={lit ? '#f4dc9a' : '#cfd9df'} stroke="#6f6556" strokeWidth="2" />
      <rect x={x + (w - dw) / 2} y={base - 64} width={dw} height={64} fill="#5b4a3c" />
    </g>
  );
}

// The front-page picture. `badge` marks the branch the caption talks about.
export function Scene({ weather = 'sun', sign, badge = 'ok', ...rest }) {
  const [top, low] = SKY[weather] || SKY.sun, W = 1200, H = 520, base = 440;
  const stores = [[30, 150, 170, '#d9cbb3', '#7b2a2c'], [196, 130, 150, '#cdbfa6', '#2f5d7c'], [340, 170, 190, '#e0d4bf', '#3e7a5b'], [700, 170, 190, '#d4c6ad', '#2f5d7c'], [884, 140, 160, '#ddd0b9', '#7b2a2c'], [1038, 140, 175, '#cbbca3', '#9a6a16']];
  const BadgeIcon = { ok: I.Check, warn: I.TriangleAlert, bad: I.X, info: I.ArrowLeftRight }[badge] || I.Check;
  return (
    <svg xmlns={NS} viewBox={`0 0 ${W} ${H}`} {...rest}>
      <defs>
        <linearGradient id="sky" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={top} /><stop offset="1" stopColor={low} /></linearGradient>
        <Dots id="ht" />
      </defs>
      <rect width={W} height={H} fill="url(#sky)" />
      {(weather === 'sun' || weather === 'partly') && <g transform="translate(1010,110)" fill="#f2b632">{Array.from({ length: 12 }, (_, i) => <rect key={i} x="-4" y="-92" width="8" height="26" rx="4" transform={`rotate(${i * 30})`} />)}<circle r="54" /></g>}
      {weather !== 'sun' && <><Cloud x={930} y={130} s={1.3} fill={weather === 'storm' ? '#8a939d' : '#fff'} /><Cloud x={260} y={90} s={1} fill={weather === 'storm' ? '#9aa3ad' : '#fff'} /></>}
      {(weather === 'cloud' || weather === 'storm') && <Cloud x={600} y={70} s={1.15} fill={weather === 'storm' ? '#7e8892' : '#f4f6f8'} />}
      {weather === 'storm' && <><path d="M940 170 L905 245 H935 L910 315 L985 220 H950 L975 170 Z" fill="#f2c230" />{Array.from({ length: 16 }, (_, i) => <line key={i} x1={200 + i * 60} y1={150 + (i % 3) * 14} x2={188 + i * 60} y2={190 + (i % 3) * 14} stroke="#5d6a78" strokeWidth="3" strokeLinecap="round" />)}</>}
      {weather === 'partly' && <Cloud x={300} y={100} s={0.9} />}
      <path d={`M0 ${base - 120} Q 150 ${base - 170} 300 ${base - 130} T 600 ${base - 140} T 900 ${base - 125} T 1200 ${base - 150} V ${base} H 0 Z`} fill="#c9d3c2" fillOpacity="0.8" />
      {/* the network: dotted links from every branch to the data centre tower */}
      <g transform="translate(600,120)"><rect x="-10" y="0" width="20" height="120" fill="#5a5f66" /><path d="M-40 120 L0 30 L40 120" fill="none" stroke="#5a5f66" strokeWidth="6" />{[26, 46, 66].map(r => <path key={r} d={`M${-r} ${-r * 0.2} A ${r} ${r} 0 0 1 ${r} ${-r * 0.2}`} fill="none" stroke="#762123" strokeWidth="5" strokeLinecap="round" />)}<circle r="9" fill="#762123" /></g>
      {stores.map(([x, w], i) => <path key={i} d={`M${x + w / 2} ${base - 200} Q ${(x + w / 2 + 600) / 2} ${150} 600 ${132}`} fill="none" stroke="#762123" strokeOpacity="0.55" strokeWidth="3" strokeDasharray="2 9" strokeLinecap="round" />)}
      <rect y={base} width={W} height={H - base} fill="#8d8a84" />
      <rect y={base} width={W} height="14" fill="#b9b4aa" />
      {Array.from({ length: 12 }, (_, i) => <rect key={i} x={i * 104 + 20} y={base + 46} width="56" height="8" fill="#e9e4d8" />)}
      {stores.map(([x, w, h, wall, awn], i) => <Store key={i} x={x} w={w} h={h} base={base} wall={wall} awn={awn} lit={i % 2 === 0} />)}
      <Store x={530} w={140} h={230} base={base} wall="#e6dccb" awn="#762123" sign={sign} lit />
      {badge && <g transform="translate(662,186)"><circle r="30" fill="#fff" /><circle r="25" fill={TONES[badge] || TONES.ok} /><BadgeIcon x={-15} y={-15} width={30} height={30} color="#fff" strokeWidth={3} /></g>}
      <rect width={W} height={H} fill="url(#ht)" />
    </svg>
  );
}

// A small illustration per story, picked from its section name.
const PAL = {
  rose: ['#ecdcd6', '#c9a59c', '#762123'], blue: ['#dbe5ee', '#a8bccf', '#2F6DB5'], green: ['#dfe8dc', '#adc3a5', '#2E8540'],
  amber: ['#f0e4c9', '#d7bd83', '#a35a00'], teal: ['#d8e9e6', '#9fc8c0', '#21786d'], slate: ['#e1e3e6', '#b0b6be', '#3d4650'],
};
const ART = [
  [/impact|right now|opening/i, I.Store, 'rose', 'stores'], [/scorecard|service levels/i, I.Gauge, 'blue', 'chart'], [/self-healing|automation/i, I.Sparkles, 'green', 'grid'],
  [/money|carrier|repeat/i, I.Cable, 'amber', 'wires'], [/looking ahead|capacity|bandwidth/i, I.TrendingUp, 'teal', 'chart'], [/decision|audit|ownership/i, I.ListChecks, 'slate', 'grid'],
  [/failover|backup lines/i, I.ArrowLeftRight, 'amber', 'wires'], [/root cause/i, I.Search, 'blue', 'grid'], [/drift/i, I.GitCompare, 'rose', 'grid'], [/change/i, I.History, 'rose', 'grid'],
  [/prediction/i, I.Telescope, 'teal', 'chart'], [/slow/i, I.Snail, 'amber', 'stores'], [/visit|field/i, I.Wrench, 'slate', 'stores'], [/comms/i, I.Megaphone, 'rose', 'stores'],
  [/overnight/i, I.Moon, 'slate', 'stores'], [/sla risk/i, I.Timer, 'rose', 'chart'], [/queue/i, I.Inbox, 'blue', 'grid'], [/exposure/i, I.ShieldAlert, 'rose', 'grid'],
  [/firmware/i, I.Cpu, 'blue', 'grid'], [/backups/i, I.HardDrive, 'slate', 'grid'], [/the week/i, I.Newspaper, 'blue', 'chart'], [/project|new branches/i, I.Building2, 'teal', 'stores'],
  [/freeze/i, I.Snowflake, 'blue', 'calendar'], [/lifecycle/i, I.Hourglass, 'amber', 'chart'], [/next week/i, I.CalendarClock, 'slate', 'calendar'], [/problem|knowledge/i, I.BookOpen, 'slate', 'grid'],
  [/pci/i, I.Lock, 'rose', 'grid'],
];
export const artOf = kicker => { const m = ART.find(([re]) => re.test(kicker)); return { Icon: m ? m[1] : I.Newspaper, pal: PAL[m ? m[2] : 'slate'], motif: m ? m[3] : 'grid' }; };

function Motif({ kind, c }) {
  if (kind === 'stores') return <g fill={c}>{[[20, 70, 60], [100, 54, 46], [166, 76, 70], [254, 60, 52], [326, 60, 64]].map(([x, w, h], i) => <g key={i}><rect x={x} y={220 - h} width={w} height={h} /><rect x={x - 3} y={214 - h} width={w + 6} height={7} /></g>)}</g>;
  if (kind === 'wires') return <g stroke={c} strokeWidth="4" fill="none">{[40, 200, 360].map(x => <g key={x}><line x1={x} y1="220" x2={x} y2="120" /><line x1={x - 18} y1="132" x2={x + 18} y2="132" /></g>)}<path d="M22 134 Q 120 170 218 134 T 378 134" /><path d="M58 134 Q 120 160 182 134" /></g>;
  if (kind === 'chart') return <g fill={c}>{[34, 52, 44, 70, 62, 88, 80, 108].map((h, i) => <rect key={i} x={24 + i * 46} y={220 - h} width="30" height={h} />)}</g>;
  if (kind === 'calendar') return <g fill={c}>{Array.from({ length: 14 }, (_, i) => <rect key={i} x={20 + (i % 7) * 54} y={150 + Math.floor(i / 7) * 36} width="44" height="28" rx="3" />)}</g>;
  return <g stroke={c} strokeWidth="3" fill="none">{[[0, 170, 120, 170, 150, 140, 260, 140], [400, 190, 300, 190, 270, 160, 170, 160], [0, 40, 80, 40, 110, 70, 150, 70], [400, 50, 320, 50, 290, 80, 250, 80]].map((p, i) => <g key={i}><polyline points={p.join(' ')} /><circle cx={p[6]} cy={p[7]} r="6" fill={c} /></g>)}</g>;
}

export function StoryArt({ kicker, ...rest }) {
  const { Icon, pal: [bg, fg, ink], motif } = artOf(kicker);
  const id = `d${kicker.replace(/\W/g, '')}`;
  return (
    <svg xmlns={NS} viewBox="0 0 400 220" {...rest}>
      <defs><Dots id={id} op={0.08} step={5} /></defs>
      <rect width="400" height="220" fill={bg} />
      <Motif kind={motif} c={fg} />
      <circle cx="200" cy="96" r="54" fill="#fff" fillOpacity="0.92" />
      <circle cx="200" cy="96" r="54" fill="none" stroke={ink} strokeWidth="3" />
      <Icon x={170} y={66} width={60} height={60} color={ink} strokeWidth={1.8} />
      <rect width="400" height="220" fill={`url(#${id})`} />
    </svg>
  );
}

// Branch map: grey dots trade normally; blue run on the backup line; amber have a problem; red are offline.
export function BranchMap({ points, focus, ...rest }) {
  // frame the branches in scope (Hawaii aside) in a 1.75:1 picture
  const ps = points.filter(p => (!focus || p.in) && !(p.x < 110 && p.y > 500)), xs = ps.map(p => p.x), ys = ps.map(p => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), pad = focus ? 1.3 : 1.1;
  let w = Math.max(80, x1 - x0) * pad, h = Math.max(60, y1 - y0) * pad;
  if (w / h > 1.75) h = w / 1.75; else w = h * 1.75;
  const vb = [(x0 + x1) / 2 - w / 2, (y0 + y1) / 2 - h / 2, w, h];
  const k = vb[2] / (MAP.w - 30), R = { ok: 2.6, info: 5, warn: 6, bad: 7.5 }, order = { ok: 0, info: 1, warn: 2, bad: 3 };
  return (
    <svg xmlns={NS} viewBox={vb.map(v => +v.toFixed(1)).join(' ')} {...rest}>
      <defs><Dots id="mapdots" op={0.07} step={5 * k} /></defs>
      <rect x={vb[0]} y={vb[1]} width={vb[2]} height={vb[3]} fill="#f3f0e8" />
      <path d={MAP.canada} fill="#ebe7dd" stroke="#f9f7f2" strokeWidth={0.8 * k} />
      {MAP.states.map(st => <path key={st.id} d={st.d} fill="#e0d9ca" stroke="#f9f7f2" strokeWidth={1 * k} />)}
      {[...points].sort((a, b) => order[a.tone] - order[b.tone]).map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={R[p.tone] * k * (focus ? 0.8 : 1)} fill={p.tone === 'ok' ? '#9c9483' : TONES[p.tone]} fillOpacity={p.in === false ? 0.15 : p.tone === 'ok' ? 0.55 : 0.92} stroke="#fff" strokeWidth={p.tone === 'ok' ? 0 : 1.2 * k} />)}
      <rect x={vb[0]} y={vb[1]} width={vb[2]} height={vb[3]} fill="url(#mapdots)" />
    </svg>
  );
}

// Draws one of the pictures above into a JPEG data URL for the PDF (null if the browser cannot).
export function toPng(el, w, h) {
  return new Promise(res => {
    try {
      const svg = renderToStaticMarkup(React.cloneElement(el, { width: w, height: h }));
      const img = new Image();
      img.onload = () => { try { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h); res(c.toDataURL('image/jpeg', 0.88)); } catch { res(null); } };
      img.onerror = () => res(null);
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    } catch { res(null); }
  });
}
