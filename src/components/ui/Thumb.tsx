'use client';
import { memo, useMemo } from 'react';
import { getDef, defaultProps } from '@/lib/catalog';
import { PartArt } from '@/components/parts/PartArt';
import type { CompInst } from '@/lib/types';

/** Static, non-interactive render of a part, sized to fit its box. */
export const Thumb = memo(function Thumb({ type, props, className }: { type: string; props?: CompInst['props']; className?: string }) {
  const def = getDef(type);
  const c = useMemo<CompInst>(() => ({ id: `thumb-${type}`, type, x: 0, y: 0, rot: 0, props: props ?? defaultProps(type) }), [type, props]);
  const pad = 8;
  const w = def.w + pad * 2, h = def.h + pad * 2;
  return (
    <svg viewBox={`${-w / 2} ${-h / 2} ${w} ${h}`} className={className} aria-hidden focusable="false">
      <PartArt c={c} />
      {def.pins.length < 12 && def.pins.map((p) => <circle key={p.name} cx={p.x} cy={p.y} r={2.2} fill="#c9a227" />)}
    </svg>
  );
});
