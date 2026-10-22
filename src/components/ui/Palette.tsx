'use client';
import { useMemo, useState, type DragEvent } from 'react';
import { CATALOG, CATEGORIES } from '@/lib/catalog';
import { useStore } from '@/store/store';
import { PART_MIME } from '@/components/canvas/Canvas';
import { audio } from '@/audio/audio';
import { Thumb } from './Thumb';
import s from './ui.module.css';
import { IGrid, IX } from './icons';

const ICON: Record<string, string> = { All: '✨', Power: '🔋', Passive: '〰️', Semiconductors: '🔺', Input: '🎛️', Output: '💡', Boards: '🧠', Tools: '📟' };

export function Palette() {
  const open = useStore((x) => x.paletteOpen);
  const toggle = useStore((x) => x.togglePalette);
  const add = useStore((x) => x.addComponent);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('All');

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = CATALOG.filter((d) => (cat === 'All' || d.category === cat) && (!needle || `${d.label} ${d.type} ${d.description} ${d.category}`.toLowerCase().includes(needle)));
    return CATEGORIES.map((c) => ({ c, items: list.filter((d) => d.category === c) })).filter((g) => g.items.length);
  }, [q, cat]);

  const onDragStart = (e: DragEvent, type: string) => {
    e.dataTransfer.setData(PART_MIME, type);
    e.dataTransfer.effectAllowed = 'copy';
    audio.unlock();
  };
  const quickAdd = (type: string) => {
    audio.unlock();
    // drop near the visible centre, jittered so repeated clicks don't stack
    const j = () => Math.round((Math.random() - 0.5) * 120);
    const svg = document.querySelector<SVGSVGElement>('svg[data-testid="canvas"]');
    const world = svg?.querySelector<SVGGElement>('g[data-world]');
    let x = j(), y = j();
    if (svg && world) {
      const r = svg.getBoundingClientRect();
      const m = world.getScreenCTM();
      if (m) { const pt = new DOMPoint(r.left + r.width / 2, r.top + r.height / 2).matrixTransform(m.inverse()); x += pt.x; y += pt.y; }
    }
    add(type, x, y);
    audio.click();
  };

  return (
    <>
      {!open && <button className={`${s.iconBtn} ${s.paletteToggle}`} onClick={toggle} aria-label="Open parts" title="Parts"><IGrid /></button>}
      <aside className={s.palette} data-closed={!open || undefined} aria-label="Parts" inert={!open || undefined}>
        <div className={s.row} style={{ padding: '10px 10px 0', flexWrap: 'nowrap' }}>
          <input className={s.search} style={{ margin: 0, flex: 1, minWidth: 0 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search parts" type="search" />
          <button className={s.iconBtn} onClick={toggle} aria-label="Close parts"><IX /></button>
        </div>
        <div className={s.cats} role="group" aria-label="Categories" style={{ paddingTop: 10 }}>
          {['All', ...CATEGORIES].map((c) => (
            <button key={c} className={s.cat} aria-pressed={cat === c} onClick={() => setCat(c)} title={c}>{ICON[c]} {c === 'Semiconductors' ? 'Semis' : c}</button>
          ))}
        </div>
        <div className={s.parts}>
          {groups.map((g) => [
            <div key={`h-${g.c}`} className={s.catTitle}>{g.c}</div>,
            ...g.items.map((d, i) => (
              <button key={d.type} className={s.tile} draggable onDragStart={(e) => onDragStart(e, d.type)} onClick={() => quickAdd(d.type)}
                title={d.description} aria-label={`Add ${d.label}`} data-part={d.type} style={{ animationDelay: `${i * 18}ms` }}>
                <Thumb type={d.type} />
                <span>{d.label}</span>
              </button>
            )),
          ])}
          {!groups.length && <div className={s.catTitle}>¯\_(ツ)_/¯</div>}
        </div>
      </aside>
    </>
  );
}
