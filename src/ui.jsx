import React, { useState, useMemo, useEffect } from 'react';
import { X, ChevronDown, Search, ChevronLeft, ChevronRight, ArrowUpDown, ShieldCheck, ShieldAlert, Download } from 'lucide-react';
import LOGOS from './logos.js';

export const cx = (...a) => a.filter(Boolean).join(' ');

export function Card({ title, sub, icon: I, right, children, className, pad = true, onClick, flush }) {
  return (
    <section onClick={onClick} className={cx('bg-panel border border-line rounded-[4px]', onClick && 'cursor-pointer hover:border-ink3', className)}>
      {(title || right) && (
        <header className="flex items-start gap-3 px-4 pt-3 pb-2">
          <div className="min-w-0 flex-1">
            {title && <h3 className="font-display text-[16px] font-semibold text-ink leading-tight">{title}</h3>}
            {sub && <p className="text-[12.5px] text-ink3 mt-0.5 leading-snug">{sub}</p>}
          </div>
          {right}
        </header>
      )}
      <div className={pad ? 'px-4 pb-4 pt-1' : ''}>{children}</div>
    </section>
  );
}

const TONES = {
  gray: 'bg-chip text-ink2 border-line',
  green: 'bg-ok/10 text-ok border-ok/30',
  amber: 'bg-warn/10 text-warn border-warn/30',
  red: 'bg-bad/10 text-bad border-bad/30',
  alert: 'bg-alert text-white border-alert',
  brand: 'bg-brand/10 text-brand dark:text-ai border-brand/30',
  blue: 'bg-info/10 text-info border-info/30',
  purple: 'bg-ink/[0.04] text-ink2 border-ink/20',
  dark: 'bg-ink text-canvas border-ink',
};
export function Badge({ tone = 'gray', children, className, title }) {
  return <span title={title} className={cx('inline-flex items-center gap-1 px-1.5 py-[1px] rounded-[3px] border text-[11.5px] font-semibold whitespace-nowrap', TONES[tone], className)}>{children}</span>;
}
export function Pri({ p }) {
  const t = { P1: 'alert', P2: 'red', P3: 'amber', P4: 'gray' }[p];
  return <Badge tone={t} className={p === 'P1' ? 'pulse-alert' : ''}>{p}</Badge>;
}
export function Dot({ tone = 'green', pulse }) {
  const c = { green: 'bg-ok', amber: 'bg-warn', red: 'bg-bad', gray: 'bg-ink3', blue: 'bg-info', alert: 'bg-alert', purple: 'bg-ink2' }[tone];
  return <span className={cx('inline-block w-2 h-2 rounded-full shrink-0', c, pulse && 'animate-pulse')} />;
}
export const healthTone = h => ({ up: 'green', degraded: 'amber', down: 'red' }[h] || 'gray');

export function Btn({ kind = 'secondary', size = 'md', icon: I, children, className, ...p }) {
  const k = {
    primary: 'bg-action text-white border-action hover:brightness-110',
    brand: 'bg-brand text-white border-brand hover:brightness-110',
    secondary: 'bg-panel text-ink border-line hover:bg-chip',
    ghost: 'bg-transparent text-ink2 border-transparent hover:bg-chip',
    danger: 'bg-panel text-bad border-bad/40 hover:bg-bad/10',
    ok: 'bg-ok text-white border-ok hover:brightness-110',
    dark: 'bg-ink text-canvas border-ink hover:opacity-90',
  }[kind];
  const sz = size === 'sm' ? 'h-7 px-2 text-[12px] gap-1' : size === 'xs' ? 'h-6 px-1.5 text-[11px] gap-1' : 'h-8 px-3 text-[13px] gap-1.5';
  return <button {...p} className={cx('inline-flex items-center justify-center rounded-[4px] border font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap', k, sz, className)}>{I && <I size={size === 'md' ? 15 : 13} />}{children}</button>;
}

export function Tabs({ tabs, value, onChange, className, size = 'md' }) {
  return (
    <div className={cx('inline-flex flex-wrap items-center gap-0.5 bg-chip border border-line rounded-md p-0.5', className)}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)} className={cx('rounded px-2.5 font-semibold flex items-center gap-1.5', size === 'sm' ? 'h-6 text-[12px]' : 'h-7 text-[13px]', value === t.id ? 'bg-panel text-ink shadow-sm' : 'text-ink2 hover:text-ink')}>
          {t.icon && <t.icon size={14} />}{t.label}{t.count != null && <span className={cx('text-[10px] px-1 rounded', value === t.id ? 'bg-chip' : 'bg-panel')}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, sub, tone, icon: I, onClick, children, className, delta, deltaGood }) {
  const vt = { red: 'text-bad', amber: 'text-warn', green: 'text-ok', alert: 'text-alert', brand: 'text-brand dark:text-[#e8a3a5]' }[tone] || 'text-ink';
  const up = delta != null && delta > 0;
  return (
    <div onClick={onClick} className={cx('bg-panel border border-line rounded-md px-4 py-3 flex flex-col min-w-0', onClick && 'cursor-pointer hover:bg-chip/50', className)}>
      <div className="text-[12.5px] text-ink2 font-medium truncate">{label}</div>
      <div className="flex items-baseline gap-2 mt-1">
        <div className={cx('font-display text-[30px] font-semibold leading-none whitespace-nowrap', vt)}>{value}</div>
        {delta != null && delta !== 0 && <span className={cx('text-[12px] font-semibold whitespace-nowrap', (deltaGood ? up : !up) ? 'text-ok' : 'text-bad')}>{up ? '▲' : '▼'} {Math.abs(delta)}</span>}
      </div>
      {sub && <div className="text-[12px] text-ink3 mt-1 leading-snug">{sub}</div>}
      {children}
    </div>
  );
}

export function Modal({ open, onClose, title, sub, children, footer, wide, xwide, right }) {
  useEffect(() => { if (!open) return; const k = e => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-start justify-center p-4 overflow-y-auto" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className={cx('bg-panel border border-line rounded-xl shadow-2xl w-full my-6 flex flex-col', xwide ? 'max-w-[1240px]' : wide ? 'max-w-[980px]' : 'max-w-[620px]')}>
        <div className="flex items-start gap-3 px-5 py-4 border-b border-line">
          <div className="flex-1 min-w-0"><h2 className="text-[17px] font-extrabold text-ink">{title}</h2>{sub && <div className="text-[12.5px] text-ink3 mt-0.5">{sub}</div>}</div>
          {right}
          <button onClick={onClose} className="text-ink3 hover:text-ink p-1" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-line flex items-center gap-2 flex-wrap">{footer}</div>}
      </div>
    </div>
  );
}

export function Select({ value, onChange, options, icon: I, className, label }) {
  return (
    <label className={cx('relative inline-flex items-center h-8 bg-panel border border-line rounded-md text-[13px] text-ink pl-2 pr-7 gap-1.5', className)}>
      {I && <I size={14} className="text-ink3" />}{label && <span className="text-ink3">{label}</span>}
      <select value={value} onChange={e => onChange(e.target.value)} className="bg-transparent outline-none appearance-none font-semibold pr-1 cursor-pointer max-w-[220px] truncate">
        {options.map(o => typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown size={14} className="absolute right-2 text-ink3 pointer-events-none" />
    </label>
  );
}
export function SearchBox({ value, onChange, placeholder = 'Search', className }) {
  return (
    <label className={cx('inline-flex items-center gap-1.5 h-8 px-2 bg-panel border border-line rounded-md text-[13px]', className)}>
      <Search size={14} className="text-ink3" />
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="bg-transparent outline-none flex-1 min-w-0 text-ink placeholder:text-ink3" />
      {value && <button onClick={() => onChange('')} className="text-ink3 hover:text-ink"><X size={13} /></button>}
    </label>
  );
}

export function Table({ cols, rows, onRow, pageSize = 0, empty = 'Nothing here', rowClass, dense, sortable = true, initialSort }) {
  const [sort, setSort] = useState(initialSort || null);
  const [page, setPage] = useState(0);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const c = cols.find(c => c.key === sort.key); if (!c) return rows;
    const g = c.sort || c.get || (r => r[c.key]);
    return rows.slice().sort((a, b) => { const x = g(a), y = g(b); return (x > y ? 1 : x < y ? -1 : 0) * (sort.dir); });
  }, [rows, sort, cols]);
  useEffect(() => setPage(0), [rows.length]);
  const pages = pageSize ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1;
  const view = pageSize ? sorted.slice(page * pageSize, page * pageSize + pageSize) : sorted;
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="text-left text-ink3 border-b border-line">
              {cols.map(c => (
                <th key={c.key} className={cx('font-semibold py-2 px-2 whitespace-nowrap', c.className, c.right && 'text-right')}>
                  {sortable && c.sortable !== false && c.label ? <button onClick={() => setSort(s => ({ key: c.key, dir: s && s.key === c.key ? -s.dir : 1 }))} className="inline-flex items-center gap-1 hover:text-ink">{c.label}<ArrowUpDown size={11} className="opacity-50" /></button> : c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.map((r, i) => (
              <tr key={r.id || i} onClick={onRow ? () => onRow(r) : undefined} className={cx('border-b border-line/70 last:border-0', onRow && 'cursor-pointer hover:bg-chip/70', rowClass && rowClass(r))}>
                {cols.map(c => <td key={c.key} className={cx('px-2 align-middle text-ink', dense ? 'py-1.5' : 'py-2', !c.render && 'whitespace-nowrap', c.className, c.right && 'text-right')}>{c.render ? c.render(r) : (c.get ? c.get(r) : r[c.key])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        {!view.length && <div className="text-center text-ink3 text-[13px] py-8">{empty}</div>}
      </div>
      {pageSize > 0 && sorted.length > pageSize && (
        <div className="flex items-center justify-between pt-2 text-[12px] text-ink3">
          <span>{page * pageSize + 1}–{Math.min(sorted.length, (page + 1) * pageSize)} of {sorted.length.toLocaleString()}</span>
          <div className="flex gap-1">
            <Btn size="xs" icon={ChevronLeft} disabled={page === 0} onClick={() => setPage(p => p - 1)} />
            <span className="px-2 py-0.5">Page {page + 1} / {pages}</span>
            <Btn size="xs" icon={ChevronRight} disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)} />
          </div>
        </div>
      )}
    </div>
  );
}

export function Progress({ value, tone = 'green', className, h = 6 }) {
  const c = { green: 'bg-ok', amber: 'bg-warn', red: 'bg-bad', brand: 'bg-brand', blue: 'bg-info', purple: 'bg-ai', gray: 'bg-ink3' }[tone];
  return <div className={cx('w-full bg-chip rounded-full overflow-hidden', className)} style={{ height: h }}><div className={cx('h-full rounded-full transition-all', c)} style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} /></div>;
}

export function Conf({ value, showGate = true }) {
  const ok = value >= 0.8;
  return (
    <span className="inline-flex items-center gap-1.5" title={ok ? 'At or above the 80% autonomy gate' : 'Below 80% – a human must approve'}>
      <span className="w-14 h-1.5 bg-chip rounded-full overflow-hidden inline-block relative"><span className={cx('absolute inset-y-0 left-0 rounded-full', ok ? 'bg-ok' : 'bg-warn')} style={{ width: `${value * 100}%` }} /><span className="absolute inset-y-0 w-px bg-ink3" style={{ left: '80%' }} /></span>
      <span className={cx('text-[12px] font-bold tabular-nums', ok ? 'text-ok' : 'text-warn')}>{Math.round(value * 100)}%</span>
      {showGate && (ok ? <ShieldCheck size={13} className="text-ok" /> : <ShieldAlert size={13} className="text-warn" />)}
    </span>
  );
}

export function GateBox({ g, compact }) {
  if (g.auto) return <div className="flex items-center gap-1.5 text-[12px] text-ok font-semibold"><ShieldCheck size={14} />Eligible to run automatically</div>;
  return (
    <div className={cx('rounded-md border border-warn/40 bg-warn/10 text-[12px]', compact ? 'px-2 py-1.5' : 'px-3 py-2')}>
      <div className="flex items-center gap-1.5 font-bold text-warn"><ShieldAlert size={14} />Human approval required</div>
      <ul className="mt-1 text-ink2 list-disc pl-5 space-y-0.5">{g.reasons.map(r => <li key={r}>{r}</li>)}</ul>
    </div>
  );
}

export function Logo({ k, h = 16, className }) {
  return <span className={cx('inline-flex items-center bg-white rounded px-1 py-0.5 border border-line/60', className)}><img src={LOGOS[k]} alt={k} style={{ height: h }} className="object-contain" /></span>;
}
export const SRC_LOGO = { OpsRamp: 'opsramp', 'Aruba Central': 'central', Orchestrator: 'aruba', ServiceNow: 'servicenow', 'Mova iO': 'movaio', 'New Relic': 'newrelic', 'Azure Monitor': 'azure', Synthetic: 'opsramp', 'UPS (SNMP)': 'opsramp' };

export function Empty({ icon: I, title, sub, children }) {
  return <div className="flex flex-col items-center justify-center text-center py-10 text-ink3">{I && <I size={28} className="mb-2" />}<div className="text-[14px] font-semibold text-ink2">{title}</div>{sub && <div className="text-[12.5px] mt-1 max-w-md">{sub}</div>}{children}</div>;
}
export function PageHead({ icon: I, title, sub, right, children }) {
  return (
    <div className="flex items-end gap-3 mb-4 flex-wrap border-b border-line pb-3">
      <div className="flex-1 min-w-[260px]"><h1 className="font-display text-[28px] font-bold text-ink leading-none">{title}</h1>{sub && <p className="text-[13.5px] text-ink2 mt-1.5 max-w-[78ch] leading-snug">{sub}</p>}</div>
      <div className="flex items-center gap-2 flex-wrap">{right}</div>
      {children}
    </div>
  );
}
export function Section({ title, right, children, className }) {
  return <div className={cx('mt-5', className)}><div className="flex items-center gap-2 mb-2"><h2 className="font-display text-[18px] font-semibold text-ink">{title}</h2><div className="flex-1" />{right}</div>{children}</div>;
}
export function KV({ k, v, className }) { return <div className={cx('flex justify-between gap-3 py-1 text-[12.5px] border-b border-line/60 last:border-0', className)}><span className="text-ink3">{k}</span><span className="text-ink font-semibold text-right">{v}</span></div>; }
export function ExportBtn({ onClick, label = 'Export CSV' }) { return <Btn size="sm" icon={Download} onClick={onClick}>{label}</Btn>; }
export function Illus({ children = 'Illustrative' }) { return <span className="text-[10.5px] font-bold text-ink3 border border-dashed border-line rounded px-1 py-[1px]">{children}</span>; }
