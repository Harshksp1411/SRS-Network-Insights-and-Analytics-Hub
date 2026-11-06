// Who is reading: the SLA & KPI Tracker and Reports change with the audience. Leaders get the picture and can drill
// into any number; managers and leads get the detail.
import React from 'react';
import * as I from 'lucide-react';
import { cx } from './ui.jsx';

export const AUD = {
  ceo: { label: 'CEO', icon: I.Crown, reports: ['bu', 'critical'], level: 'exec', depth: 'exec' },
  cio: { label: 'CIO', icon: I.Building2, reports: ['bu', 'critical', 'weekly'], level: 'exec', depth: 'exec' },
  buhead: { label: 'Network BU head', icon: I.Briefcase, reports: ['bu', 'critical', 'weekly', 'daily'], level: 'full', depth: 'full' },
  itmgr: { label: 'IT manager', icon: I.MonitorCog, reports: ['daily', 'weekly', 'critical', 'handover', 'biab'], level: 'full', depth: 'full' },
  lead: { label: 'Network lead', icon: I.Network, reports: ['handover', 'daily', 'weekly', 'critical', 'bu', 'biab', 'audit'], level: 'full', depth: 'full' },
};
export const audOf = s => s.tab.audience || ({ noc: 'lead', l3: 'lead', storeops: 'itmgr', security: 'itmgr', ma: 'buhead' }[s.role] || 'buhead');

export function AudiencePicker({ s, act, onPick }) {
  const a = audOf(s);
  return (
    <div className="flex flex-wrap items-center gap-2 mb-3">
      <span className="text-[12px] font-bold text-ink3">Audience</span>
      <div className="inline-flex flex-wrap rounded-md bg-chip p-0.5 text-[12.5px] font-bold" role="group" aria-label="Audience">{Object.entries(AUD).map(([k, v]) => { const Ic = v.icon; return (
        <button key={k} aria-pressed={a === k} onClick={() => { act.setTab('audience', k); onPick && onPick(k); }} className={cx('px-2.5 py-1.5 rounded inline-flex items-center gap-1.5', a === k ? 'bg-panel text-ink shadow-sm' : 'text-ink3 hover:text-ink')}><Ic size={13} />{v.label}</button>); })}</div>
      <span className="text-[12px] text-ink3">{AUD[a].depth === 'exec' ? 'Headlines; click any number to drill down' : 'Full detail'}</span>
    </div>
  );
}
