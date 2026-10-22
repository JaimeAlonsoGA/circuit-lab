'use client';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getDef, pinPos } from '@/lib/catalog';
import { si } from '@/lib/format';
import type { CompInst, PinRef } from '@/lib/types';
import { buildNetlist } from '@/sim/netlist';
import { events, useSim, useStore } from '@/store/store';
import { Defs } from '../parts/Defs';
import { PartArt } from '../parts/PartArt';
import { endpoints, pinDegrees, pinKey, wireCurrent, wirePath } from './geometry';
import styles from './canvas.module.css';

type View = { x: number; y: number; k: number };
type Drag =
  | { kind: 'part'; id: string; dx: number; dy: number; sx: number; sy: number; moved: boolean }
  | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number; moved: boolean }
  | { kind: 'wire'; from: PinRef; x: number; y: number }
  | { kind: 'knob'; id: string; sy: number; start: number }
  | { kind: 'press'; id: string };
type Fx = { id: number; x: number; y: number; born: number };

const MIME = 'application/x-circuit-part';
export const PART_MIME = MIME;

const parsePin = (s: string): PinRef => { const i = s.indexOf('|'); return { c: s.slice(0, i), p: s.slice(i + 1) }; };

export function Canvas() {
  const project = useStore((s) => s.project);
  const selection = useStore((s) => s.selection);
  const damaged = useStore((s) => s.damaged);
  const powered = useStore((s) => s.powered);
  const frame = useSim((s) => s.frame);
  const anim = useSim((s) => s.anim);
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const [hover, setHover] = useState<{ key: string; x: number; y: number; label: string } | null>(null);
  const [fx, setFx] = useState<Fx[]>([]);
  const [dropHint, setDropHint] = useState(false);

  const byId = useMemo(() => new Map(project.components.map((c) => [c.id, c])), [project.components]);
  const types = useMemo(() => new Map(project.components.map((c) => [c.id, c.type])), [project.components]);
  const deg = useMemo(() => pinDegrees(project), [project]);
  const nets = useMemo(() => buildNetlist(project).node, [project]);
  const ordered = useMemo(() => [...project.components].sort((a, b) => Number(b.type === 'breadboard') - Number(a.type === 'breadboard')), [project.components]);

  // Centre the origin on first mount.
  useEffect(() => {
    const r = svgRef.current?.getBoundingClientRect();
    if (r) setView({ x: r.width / 2, y: r.height / 2, k: 1 });
  }, []);

  // Burn effects.
  useEffect(() => events.on((e) => {
    if (e.type !== 'burn') return;
    const c = useStore.getState().project.components.find((x) => x.id === e.id);
    if (!c) return;
    const born = performance.now();
    setFx((f) => [...f, { id: born + Math.random(), x: c.x, y: c.y - 10, born }]);
    setTimeout(() => setFx((f) => f.filter((x) => x.born !== born)), 2200);
  }), []);

  const toWorld = useCallback((cx: number, cy: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (cx - r.left - v.x) / v.k, y: (cy - r.top - v.y) / v.k };
  }, []);

  const setD = (d: Drag | null) => { dragRef.current = d; setDrag(d); };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    const t = e.target as Element;
    const st = useStore.getState();
    const pinEl = t.closest('[data-pin]');
    const w = toWorld(e.clientX, e.clientY);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    if (pinEl && e.button === 0) {
      const from = parsePin(pinEl.getAttribute('data-pin')!);
      setD({ kind: 'wire', from, x: w.x, y: w.y });
      return;
    }
    const action = t.closest('[data-action]');
    const compEl = t.closest('[data-comp]');
    const id = compEl?.getAttribute('data-comp');
    if (action && id && e.button === 0) {
      const a = action.getAttribute('data-action');
      if (a === 'press') { st.setProp(id, 'pressed', true, true); setD({ kind: 'press', id }); return; }
      if (a === 'toggle') { const c = byId.get(id)!; st.setProp(id, 'on', !c.props.on); st.select({ kind: 'comp', id }); return; }
      if (a === 'knob') { st.checkpoint(); setD({ kind: 'knob', id, sy: e.clientY, start: Number(byId.get(id)!.props.position) }); st.select({ kind: 'comp', id }); return; }
    }
    if (id && e.button === 0) {
      const c = byId.get(id)!;
      st.checkpoint();
      setD({ kind: 'part', id, dx: w.x - c.x, dy: w.y - c.y, sx: e.clientX, sy: e.clientY, moved: false });
      st.select({ kind: 'comp', id });
      return;
    }
    const wireEl = t.closest('[data-wire]');
    if (wireEl && e.button === 0) { st.select({ kind: 'wire', id: wireEl.getAttribute('data-wire')! }); return; }
    const v = viewRef.current;
    setD({ kind: 'pan', sx: e.clientX, sy: e.clientY, vx: v.x, vy: v.y, moved: false });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) {
      const t = e.target as Element;
      const pinEl = t.closest('[data-pin]');
      const wireEl = t.closest('[data-wire]');
      if (pinEl) {
        const ref = parsePin(pinEl.getAttribute('data-pin')!);
        setHover({ key: pinKey(ref), x: e.clientX, y: e.clientY, label: ref.p });
      } else if (wireEl) {
        const wire = project.wires.find((x) => x.id === wireEl.getAttribute('data-wire'));
        if (wire) setHover({ key: pinKey(wire.a), x: e.clientX, y: e.clientY, label: 'wire' });
      } else if (hover) setHover(null);
      return;
    }
    const st = useStore.getState();
    if (d.kind === 'part') {
      if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 3) return;
      const w = toWorld(e.clientX, e.clientY);
      st.moveComponent(d.id, w.x - d.dx, w.y - d.dy);
      if (!d.moved) dragRef.current = { ...d, moved: true };
    } else if (d.kind === 'pan') {
      setView((v) => ({ ...v, x: d.vx + e.clientX - d.sx, y: d.vy + e.clientY - d.sy }));
      if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 3) dragRef.current = { ...d, moved: true };
    } else if (d.kind === 'wire') {
      const w = toWorld(e.clientX, e.clientY);
      setD({ ...d, x: w.x, y: w.y });
    } else if (d.kind === 'knob') {
      const pos = Math.max(0, Math.min(100, d.start + (d.sy - e.clientY) * 0.6));
      st.setProp(d.id, 'position', Math.round(pos), true);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    const st = useStore.getState();
    setD(null);
    if (!d) return;
    if (d.kind === 'wire') {
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-pin]');
      if (el) {
        const to = parsePin(el.getAttribute('data-pin')!);
        const id = st.connect(d.from, to);
        if (id) events.emit({ type: 'connect' });
      }
    } else if (d.kind === 'press') {
      st.setProp(d.id, 'pressed', false, true);
    } else if (d.kind === 'pan' && !d.moved) {
      st.select(null);
    } else if (d.kind === 'part' && !d.moved) {
      // plain click: undo the speculative checkpoint
      useStore.setState((s) => ({ past: s.past.slice(0, -1) }));
    }
  };

  const onWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const r = svgRef.current!.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    setView((v) => {
      const k = Math.max(0.25, Math.min(3, v.k * Math.exp(-e.deltaY * 0.0015)));
      return { k, x: mx - ((mx - v.x) * k) / v.k, y: my - ((my - v.y) * k) / v.k };
    });
  }, []);
  useEffect(() => {
    const el = svgRef.current;
    el?.addEventListener('wheel', onWheel, { passive: false });
    return () => el?.removeEventListener('wheel', onWheel);
  }, [onWheel]);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable], .monaco-editor')) return;
      const st = useStore.getState();
      const sel = st.selection;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) st.redo(); else st.undo(); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); st.redo(); return; }
      if (mod && e.key.toLowerCase() === 'd' && sel?.kind === 'comp') { e.preventDefault(); const id = st.duplicate(sel.id); if (id) st.select({ kind: 'comp', id }); return; }
      if (e.key === 'Escape') { st.select(null); setD(null); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); if (sel.kind === 'comp') st.remove(sel.id); else st.removeWire(sel.id); return; }
      if (e.key.toLowerCase() === 'r' && !mod && sel?.kind === 'comp') { st.rotate(sel.id); return; }
      if (e.key.toLowerCase() === 'p' && !mod) { st.setPowered(!st.powered); return; }
      if (sel?.kind === 'comp' && e.key.startsWith('Arrow')) {
        e.preventDefault();
        const c = st.project.components.find((x) => x.id === sel.id);
        if (!c) return;
        const s = e.shiftKey ? 50 : 10;
        st.checkpoint();
        st.moveComponent(c.id, c.x + (e.key === 'ArrowLeft' ? -s : e.key === 'ArrowRight' ? s : 0), c.y + (e.key === 'ArrowUp' ? -s : e.key === 'ArrowDown' ? s : 0));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDropHint(false);
    const type = e.dataTransfer.getData(MIME);
    if (!type) return;
    const w = toWorld(e.clientX, e.clientY);
    const st = useStore.getState();
    const id = st.addComponent(type, w.x, w.y);
    st.select({ kind: 'comp', id });
  };

  const hoverNet = hover ? nets.get(hover.key) : undefined;
  const I = frame?.i ?? {};
  const V = frame?.v ?? {};
  const dragFromPos = drag?.kind === 'wire' && byId.get(drag.from.c) ? pinPos(byId.get(drag.from.c)!, drag.from.p) : null;

  return (
    <div className={styles.wrap} onDragOver={(e) => { if (e.dataTransfer.types.includes(MIME)) { e.preventDefault(); setDropHint(true); } }}
      onDragLeave={() => setDropHint(false)} onDrop={onDrop} data-drop={dropHint || undefined}>
      <svg ref={svgRef} className={styles.svg} data-testid="canvas" role="application" aria-label="Circuit canvas"
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={() => setHover(null)}
        data-dragging={drag?.kind}>
        <Defs />
        <pattern id="p-grid-live" width="20" height="20" patternUnits="userSpaceOnUse" patternTransform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          <circle cx="0" cy="0" r="1" fill="var(--grid)" /><circle cx="20" cy="0" r="1" fill="var(--grid)" /><circle cx="0" cy="20" r="1" fill="var(--grid)" /><circle cx="20" cy="20" r="1" fill="var(--grid)" />
        </pattern>
        <rect x={0} y={0} width="100%" height="100%" fill="url(#p-grid-live)" className={styles.grid} data-noexport />
        <g data-world transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          {ordered.filter((c) => c.type === 'breadboard').map((c) => (
            <PartView key={c.id} c={c} selected={selection?.id === c.id} burnt={!!damaged[c.id]} />
          ))}
          {ordered.filter((c) => c.type !== 'breadboard').map((c) => (
            <PartView key={c.id} c={c} selected={selection?.id === c.id} burnt={!!damaged[c.id]} o={frame?.out[c.id]}
              angle={frame?.periph.angle[c.id]} oled={frame?.periph.oled[c.id]} tone={frame?.periph.tone[c.id]} motorAngle={anim.motor[c.id]} scope={anim.scope[c.id]}
              builtinLed={frame?.periph.builtinLed[c.id]} running={frame?.serial[c.id]?.running} powered={powered} />
          ))}
          <g className={styles.wires}>
            {project.wires.map((w) => {
              const ep = endpoints(w, byId);
              if (!ep) return null;
              const d = wirePath(ep.a, ep.b);
              const cur = powered ? wireCurrent(w, project, deg, I, types) : null;
              const mag = Math.abs(cur ?? 0);
              const volts = V[pinKey(w.a)] ?? 0;
              const live = powered && Math.abs(volts) > 0.05;
              const net = nets.get(pinKey(w.a));
              const hl = hoverNet !== undefined && net === hoverNet;
              const flowing = mag > 2e-5;
              const speed = flowing ? 20 + 120 * Math.log10(1 + mag * 1e4) : 0;
              return (
                <g key={w.id} data-wire={w.id} className={styles.wire} data-selected={selection?.id === w.id || undefined} data-hl={hl || undefined}>
                  <path d={d} className={styles.wireHit} data-noexport />
                  <path d={d} className={styles.wireShadow} />
                  <path d={d} stroke={w.color} className={styles.wireBody} />
                  {live && <path d={d} className={styles.wireLive} style={{ opacity: Math.min(0.5, 0.12 + Math.abs(volts) / 30) }} />}
                  {flowing && (
                    <path d={d} className={styles.flow}
                      style={{ animationDuration: `${(28 / speed).toFixed(3)}s`, animationDirection: (cur ?? 0) >= 0 ? 'normal' : 'reverse', opacity: Math.min(1, 0.45 + Math.log10(1 + mag * 1e3) / 2.5) }} />
                  )}
                </g>
              );
            })}
          </g>
          {drag?.kind === 'wire' && dragFromPos && <path d={wirePath(dragFromPos, drag)} className={styles.ghostWire} />}
          {ordered.map((c) => <Pins key={c.id} c={c} active={drag?.kind === 'wire'} V={powered ? V : undefined} />)}
          {fx.map((f) => <BurnFx key={f.id} x={f.x} y={f.y} />)}
          {Object.keys(damaged).map((id) => { const c = byId.get(id); return c ? <Smoke key={id} x={c.x} y={c.y - 14} /> : null; })}
        </g>
        {project.components.length === 0 && (
          <g className={styles.empty} data-noexport transform={`translate(${view.x} ${view.y})`} aria-hidden>
            <circle r={70} className={styles.emptyRing} />
            <path d="M -18 -8 l 18 18 l 18 -18 M 0 10 v -40" className={styles.emptyArrow} />
            <text y={100} textAnchor="middle">Drop parts here</text>
          </g>
        )}
      </svg>
      {hover && (
        <div className={styles.tip} style={{ left: hover.x + 14, top: hover.y + 14 }} role="status">
          <b>{hover.label}</b>
          {powered && frame && V[hover.key] !== undefined && <span>{si(V[hover.key], 'V')}</span>}
          {powered && frame && I[hover.key] !== undefined && Math.abs(I[hover.key]) > 1e-7 && <span>{si(Math.abs(I[hover.key]), 'A')}</span>}
        </div>
      )}
      <div className={styles.zoom} role="group" aria-label="Zoom">
        <button onClick={() => setView((v) => ({ ...v, k: Math.min(3, v.k * 1.2) }))} aria-label="Zoom in">+</button>
        <button onClick={() => { const r = svgRef.current!.getBoundingClientRect(); setView({ x: r.width / 2, y: r.height / 2, k: 1 }); }} aria-label="Reset view">{Math.round(view.k * 100)}%</button>
        <button onClick={() => setView((v) => ({ ...v, k: Math.max(0.25, v.k / 1.2) }))} aria-label="Zoom out">−</button>
      </div>
    </div>
  );
}

interface PartViewProps {
  c: CompInst; selected: boolean; burnt: boolean; o?: Record<string, number | boolean | string>;
  angle?: number; oled?: import('@/runtime/mcu').DrawOp[]; tone?: number; motorAngle?: number; scope?: number[]; builtinLed?: boolean; running?: boolean; powered?: boolean;
}
const PartView = memo(function PartView({ c, selected, burnt, ...rest }: PartViewProps) {
  const def = getDef(c.type);
  return (
    <g data-comp={c.id} className={styles.part} transform={`translate(${c.x} ${c.y}) rotate(${c.rot})`} data-selected={selected || undefined} data-burnt={burnt || undefined}
      role="img" aria-label={`${def.label}${burnt ? ' (burnt)' : ''}`}>
      <title>{def.label}</title>
      {selected && <rect x={-def.w / 2 - 6} y={-def.h / 2 - 6} width={def.w + 12} height={def.h + 12} rx={8} className={styles.selRect} />}
      <g filter={burnt ? 'url(#f-burnt)' : undefined}>
        <PartArt c={c} burnt={burnt} {...rest} />
      </g>
    </g>
  );
});

const Pins = memo(function Pins({ c, active, V }: { c: CompInst; active: boolean; V?: Record<string, number> }) {
  const def = getDef(c.type);
  const small = c.type === 'breadboard';
  return (
    <g className={styles.pins} data-noexport data-active={active || undefined}>
      {def.pins.map((p) => {
        const pos = pinPos(c, p.name);
        const v = V?.[`${c.id}:${p.name}`];
        return (
          <circle key={p.name} cx={pos.x} cy={pos.y} r={small ? 3.2 : 4.2} data-pin={`${c.id}|${p.name}`} className={small ? styles.pinSmall : styles.pin}
            data-live={v !== undefined && Math.abs(v) > 0.5 ? (v > 0 ? 'pos' : 'neg') : undefined} aria-label={`${def.label} pin ${p.name}`} />
        );
      })}
    </g>
  );
});

function BurnFx({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`} className={styles.burnFx} pointerEvents="none">
      <circle r={30} className={styles.flash} />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return <line key={i} x1={Math.cos(a) * 6} y1={Math.sin(a) * 6} x2={Math.cos(a) * 26} y2={Math.sin(a) * 26} className={styles.spark} style={{ animationDelay: `${(i % 3) * 0.05}s` }} />;
      })}
      {[0, 1, 2, 3, 4].map((i) => <circle key={i} cx={(i - 2) * 6} r={8 + i * 2} className={styles.puff} style={{ animationDelay: `${i * 0.12}s` }} />)}
    </g>
  );
}

function Smoke({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`} pointerEvents="none">
      {[0, 1, 2].map((i) => <circle key={i} cx={(i - 1) * 4} r={5} className={styles.wisp} style={{ animationDelay: `${i * 0.8}s` }} />)}
    </g>
  );
}
