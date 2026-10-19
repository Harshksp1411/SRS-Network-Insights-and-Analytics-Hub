export const MIN = 60e3, HR = 36e5, DAY = 864e5;
export const T0 = Date.now();

export function rng(seed) {
  let a = seed >>> 0;
  const r = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  r.int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  r.pick = arr => arr[Math.floor(r() * arr.length)];
  r.chance = p => r() < p;
  r.shuffle = arr => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  r.weighted = pairs => { const tot = pairs.reduce((s, p) => s + p[1], 0); let x = r() * tot; for (const p of pairs) { x -= p[1]; if (x <= 0) return p[0]; } return pairs[pairs.length - 1][0]; };
  return r;
}

export const NOC_TZ = 'America/Chicago';
const fmtCache = {};
function fmtr(tz, opts) { const k = tz + JSON.stringify(opts); return fmtCache[k] || (fmtCache[k] = new Intl.DateTimeFormat('en-US', { timeZone: tz, ...opts })); }

export function parts(ms, tz = NOC_TZ) {
  const p = {}; fmtr(tz, { hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short' }).formatToParts(new Date(ms)).forEach(x => p[x.type] = x.value);
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour % 24, m: +p.minute, s: +p.second, dow: p.weekday };
}
export const tzAbbr = tz => ({ 'America/New_York': 'ET', 'America/Toronto': 'ET', 'America/Chicago': 'CT', 'America/Winnipeg': 'CT', 'America/Denver': 'MT', 'America/Edmonton': 'MT', 'America/Phoenix': 'MST', 'America/Los_Angeles': 'PT', 'America/Vancouver': 'PT', 'Pacific/Honolulu': 'HT', 'America/Halifax': 'AT' }[tz] || '');
export const pad = n => String(n).padStart(2, '0');
export function hhmm(ms, tz = NOC_TZ) { const p = parts(ms, tz); return `${pad(p.h)}:${pad(p.m)}`; }
export function hhmmss(ms, tz = NOC_TZ) { const p = parts(ms, tz); return `${pad(p.h)}:${pad(p.m)}:${pad(p.s)}`; }
export function dateShort(ms, tz = NOC_TZ) { return fmtr(tz, { month: 'short', day: 'numeric' }).format(new Date(ms)); }
export function dayName(ms, tz = NOC_TZ) { return fmtr(tz, { weekday: 'short' }).format(new Date(ms)); }
export function dt(ms, tz = NOC_TZ) { return `${dateShort(ms, tz)} ${hhmm(ms, tz)}`; }
export function ago(ms, now = Date.now()) {
  const d = Math.max(0, now - ms);
  if (d < MIN) return `${Math.floor(d / 1000)}s ago`;
  if (d < HR) return `${Math.floor(d / MIN)}m ago`;
  if (d < DAY) return `${Math.floor(d / HR)}h ${Math.floor((d % HR) / MIN)}m ago`;
  return `${Math.floor(d / DAY)}d ago`;
}
export function dur(ms) {
  const neg = ms < 0; ms = Math.abs(ms);
  const h = Math.floor(ms / HR), m = Math.floor((ms % HR) / MIN), s = Math.floor((ms % MIN) / 1000);
  const t = h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : h ? `${h}h ${pad(m)}m` : `${m}m ${pad(s)}s`;
  return neg ? `-${t}` : t;
}
export const num = n => Number(n).toLocaleString('en-US');
export const pct = (n, d = 1) => `${(n * 100).toFixed(d)}%`;
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const sum = (a, f = x => x) => a.reduce((s, x) => s + f(x), 0);
export const groupBy = (a, f) => a.reduce((m, x) => { const k = f(x); (m[k] = m[k] || []).push(x); return m; }, {});
export const uid = (() => { let n = 0; return (p = 'id') => `${p}-${Date.now().toString(36)}-${(n++).toString(36)}`; })();

export function downloadFile(name, content, type = 'text/plain') {
  const blob = new Blob([content], { type });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
export function toCSV(rows, cols) {
  const esc = v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
  return [cols.map(c => esc(c.label)).join(','), ...rows.map(r => cols.map(c => esc(typeof c.get === 'function' ? c.get(r) : r[c.key])).join(','))].join('\n');
}
export function exportCSV(name, rows, cols) { downloadFile(name, toCSV(rows, cols), 'text/csv'); }
