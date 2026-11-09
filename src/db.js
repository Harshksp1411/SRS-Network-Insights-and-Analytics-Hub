// Where onboarded resources are kept. By default in this browser's own database (IndexedDB), so they survive a
// reload. Optionally also in a free hosted Postgres database (Supabase): enter the project URL and the anon key in
// the Integration studio and every record is written there through its REST API, and read back on the next visit.
// The key is kept in this browser only; it is never part of the site.
const DBN = 'srs-hub', STORE = 'kv', CFG_KEY = 'srs-hub-cloud-db';

function idb() {
  return new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') return rej(new Error('no IndexedDB'));
    const r = indexedDB.open(DBN, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
export async function localGet(k) {
  try { const db = await idb(); return await new Promise(res => { const q = db.transaction(STORE).objectStore(STORE).get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(undefined); }); } catch { return undefined; }
}
export async function localSet(k, v) {
  try { const db = await idb(); await new Promise(res => { const t = db.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(v, k); t.oncomplete = res; t.onerror = res; }); } catch { /* storage blocked: the data lives for this visit only */ }
}

// ── the cloud database (Supabase) ──
export const cloudCfg = () => { try { const c = JSON.parse(localStorage.getItem(CFG_KEY) || 'null'); return c && c.url && c.key ? c : null; } catch { return null; } };
export const saveCloudCfg = c => { try { c ? localStorage.setItem(CFG_KEY, JSON.stringify(c)) : localStorage.removeItem(CFG_KEY); } catch { } };
const base = (c, table = 'cmdb_ci_onboarded') => `${c.url.replace(/\/+$/, '')}/rest/v1/${table}`;
const hdr = (c, extra = {}) => ({ apikey: c.key, Authorization: `Bearer ${c.key}`, 'Content-Type': 'application/json', ...extra });
async function call(c, path, opt = {}, table) {
  const r = await fetch(base(c, table) + path, { ...opt, headers: hdr(c, opt.headers) });
  if (!r.ok) { let m = `${r.status} ${r.statusText}`; try { const j = await r.json(); m = j.message || j.hint || m; } catch { } throw new Error(m); }
  const t = await r.text(); return t ? JSON.parse(t) : null;
}
export const cloudTest = c => call(c, '?select=id&limit=1');
export const cloudLoad = async c => (await call(c, '?select=*&order=added_at.desc')).map(fromRow);
export const cloudUpsert = (c, recs) => recs.length ? call(c, '', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(recs.map(toRow)) }) : Promise.resolve();
export const cloudDelete = (c, id) => call(c, `?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
const toRow = r => ({ id: r.id, name: r.name, kind: r.kind, vendor: r.vendor, model: r.model, ip: r.ip || null, site: r.site, source: r.source, template: r.template || null, via: r.via, added_at: new Date(r.t).toISOString() });
const fromRow = r => ({ id: r.id, name: r.name, kind: r.kind, vendor: r.vendor, model: r.model, ip: r.ip, site: r.site, source: r.source, template: r.template, via: r.via, t: Date.parse(r.added_at) || Date.now() });

// any table of the console's database: write in batches, count what is there
export async function cloudUpsertRows(c, table, rows, onPart) {
  for (let i = 0; i < rows.length; i += 500) { await call(c, '', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows.slice(i, i + 500)) }, table); onPart && onPart(Math.min(rows.length, i + 500)); }
}
export async function cloudCount(c, table) {
  const r = await fetch(base(c, table) + '?select=id', { method: 'HEAD', headers: hdr(c, { Prefer: 'count=exact', Range: '0-0' }) });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  const m = (r.headers.get('content-range') || '').match(/\/(\d+)/); return m ? +m[1] : 0;
}
export { schemaSQL as SQL } from './cmdb.js';
