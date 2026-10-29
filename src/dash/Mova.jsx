// Who is doing the work: the Mova iO wordmark with the agent that found, decided or did it, so every piece of
// intelligence on screen says where it came from.
import React from 'react';
import * as D from '../data.js';
import LOGOS from '../logos.js';
import { cx } from '../ui.jsx';

export function MovaChip({ agent, h = 10, className, plain }) {
  const a = agent && D.AGENTS[agent];
  return (
    <span className={cx('inline-flex items-center gap-1 align-middle whitespace-nowrap', className)} title={a ? `Mova iO ${a.name}: ${a.also}` : 'Mova iO'}>
      <span className="inline-flex items-center bg-white rounded-[3px] px-[3px] py-[1px] border border-line/70"><img src={LOGOS.movaio} alt="Mova iO" style={{ height: h }} /></span>
      {a && <span className={cx('font-semibold', plain ? 'text-ink2' : '')} style={plain ? undefined : { color: a.color }}>{a.name}</span>}
    </span>
  );
}
