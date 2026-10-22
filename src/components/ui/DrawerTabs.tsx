'use client';
import { useStore } from '@/store/store';
import { getDef } from '@/lib/catalog';
import s from './ui.module.css';
import { ICode, ISliders, ISpark } from './icons';

/** Side tabs that open (or close) each right-hand drawer; they ride along the open drawer's edge. */
export function DrawerTabs() {
  const drawer = useStore((x) => x.drawer);
  const sel = useStore((x) => x.selection);
  const board = useStore((x) => x.project.components.find((c) => getDef(c.type).mcu));
  const st = useStore.getState;
  const open = drawer === 'props' && !sel ? null : drawer;
  const toggle = (d: 'props' | 'ai') => st().setDrawer(open === d ? null : d);
  return (
    <nav className={s.tabs} aria-label="Drawers" data-shift={open ?? undefined}>
      {sel && <button className={s.tab} aria-pressed={open === 'props'} onClick={() => toggle('props')} aria-label="Properties" title="Properties"><ISliders /></button>}
      {board && <button className={s.tab} aria-pressed={open === 'code'} onClick={() => (open === 'code' ? st().setDrawer(null) : st().openCode(board.id))} aria-label="Code" title="Code" data-testid="tab-code"><ICode /></button>}
      <button className={s.tab} aria-pressed={open === 'ai'} onClick={() => toggle('ai')} aria-label="AI assistant" title="AI" data-testid="tab-ai"><ISpark /></button>
    </nav>
  );
}
