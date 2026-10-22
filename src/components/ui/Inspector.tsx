'use client';
import { useEffect, useState } from 'react';
import { useStore, useSim } from '@/store/store';
import { getDef, LED_COLORS } from '@/lib/catalog';
import { refDesignators } from '@/lib/export';
import { si, parseSI } from '@/lib/format';
import type { CompInst, PropDef } from '@/lib/types';
import { audio } from '@/audio/audio';
import { Thumb } from './Thumb';
import s from './ui.module.css';
import { IX, IRotate, ICopy, ITrash, ICode, IWrench } from './icons';

export const WIRE_COLORS = ['#ff4d6d', '#ff9f1c', '#ffd166', '#06d6a0', '#4cc9f0', '#4361ee', '#c77dff', '#f1f1f1', '#3a3f58'];

const READ_UNITS: Record<string, [string, string, (n: number) => string]> = {
  v: ['Voltage', 'V', (n) => si(n, 'V')], i: ['Current', 'A', (n) => si(Math.abs(n), 'A')], p: ['Power', 'W', (n) => si(n, 'W')],
  brightness: ['Brightness', '%', (n) => `${Math.round(Math.min(1, n) * 100)}%`], speed: ['Speed', '%', (n) => `${Math.round(n * 100)}%`],
  level: ['Level', '%', (n) => `${Math.round(Math.min(1, n) * 100)}%`], vcc: ['Supply', 'V', (n) => si(n, 'V')], temp: ['Temp', '°C', (n) => `${n.toFixed(1)}°C`],
  r: ['Red', '%', (n) => `${Math.round(Math.min(1, n) * 100)}%`], g: ['Green', '%', (n) => `${Math.round(Math.min(1, n) * 100)}%`], b: ['Blue', '%', (n) => `${Math.round(Math.min(1, n) * 100)}%`],
  vc: ['Vcap', 'V', (n) => si(n, 'V')], lux: ['Light', 'lx', (n) => `${Math.round(n)} lx`],
};

function NumberField({ c, d }: { c: CompInst; d: PropDef }) {
  const setProp = useStore((x) => x.setProp);
  const value = Number(c.props[d.key]);
  const [text, setText] = useState(si(value, '', 4));
  const [bad, setBad] = useState(false);
  useEffect(() => { setText(si(value, '', 4)); setBad(false); }, [value, c.id]);
  const commit = () => {
    const n = parseSI(text);
    const ok = Number.isFinite(n) && (d.min === undefined || n >= d.min) && (d.max === undefined || n <= d.max);
    setBad(!ok);
    if (ok && n !== value) setProp(c.id, d.key, n);
  };
  const id = `f-${c.id}-${d.key}`;
  return (
    <div className={s.field}>
      <label htmlFor={id}>{d.label}<span>{d.unit}</span></label>
      <input id={id} className={s.input} value={text} aria-invalid={bad} inputMode="decimal" spellCheck={false}
        onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setText(si(value, '', 4)); }} />
    </div>
  );
}

function PropField({ c, d }: { c: CompInst; d: PropDef }) {
  const setProp = useStore((x) => x.setProp);
  const checkpoint = useStore((x) => x.checkpoint);
  const v = c.props[d.key];
  const id = `f-${c.id}-${d.key}`;
  if (d.kind === 'number') return <NumberField c={c} d={d} />;
  if (d.kind === 'bool') return (
    <div className={s.row} style={{ justifyContent: 'space-between' }}>
      <span className={s.fieldLabel} id={id}>{d.label}</span>
      <button role="switch" aria-checked={!!v} aria-labelledby={id} className={s.toggle} onClick={() => { audio.click(); setProp(c.id, d.key, !v); }} />
    </div>
  );
  if (d.kind === 'range') return (
    <div className={s.field}>
      <label htmlFor={id}>{d.label}<span>{String(v)}{d.unit}</span></label>
      <input id={id} type="range" className={s.range} min={d.min} max={d.max} step={d.step ?? 1} value={Number(v)}
        onPointerDown={checkpoint} onChange={(e) => setProp(c.id, d.key, Number(e.target.value), true)} />
    </div>
  );
  if (d.key === 'color' && c.type === 'led') return (
    <div className={s.field}>
      <span className={s.fieldLabel}>{d.label}</span>
      <div className={s.swatches} role="radiogroup" aria-label={d.label}>
        {d.options!.map((o) => (
          <button key={o} role="radio" aria-checked={v === o} aria-label={o} className={s.swatch}
            style={{ background: LED_COLORS[o]?.hex ?? o, color: LED_COLORS[o]?.hex }} onClick={() => setProp(c.id, d.key, o)} />
        ))}
      </div>
    </div>
  );
  return (
    <div className={s.field}>
      <label htmlFor={id}>{d.label}</label>
      <select id={id} className={s.select} value={String(v)} onChange={(e) => setProp(c.id, d.key, e.target.value)}>
        {d.options!.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function Readings({ id }: { id: string }) {
  const out = useSim((x) => x.frame?.out[id]);
  const powered = useStore((x) => x.powered);
  if (!powered || !out) return null;
  const rows = Object.entries(out).filter(([k, v]) => typeof v === 'number' && READ_UNITS[k]);
  if (!rows.length) return null;
  return (
    <div className={s.readings} aria-live="off">
      {rows.slice(0, 6).map(([k, v]) => <div key={k} className={s.reading}><b>{READ_UNITS[k][2](v as number)}</b><span>{READ_UNITS[k][0]}</span></div>)}
    </div>
  );
}

function CompPanel({ c }: { c: CompInst }) {
  const { rotate, duplicate, remove, damaged, repair, openCode, project, select } = useStore();
  const def = getDef(c.type);
  const ref = refDesignators(project)[c.id];
  const burnt = damaged[c.id];
  return (
    <>
      <div className={s.drawerHead}>
        <h2><span className={s.kbd}>{ref}</span>{def.label}</h2>
        <button className={s.iconBtn} onClick={() => select(null)} aria-label="Close"><IX /></button>
      </div>
      <div className={s.drawerBody}>
        <div className={s.preview}><Thumb type={c.type} props={c.props} /></div>
        {burnt && (
          <div className={s.burntBox} role="alert">
            <div>🔥 {burnt}</div>
            <button className={`${s.iconBtn} ${s.primary}`} onClick={() => { repair(c.id); audio.click(); }} data-testid="repair"><IWrench /> Replace part</button>
          </div>
        )}
        <Readings id={c.id} />
        {def.props.map((d) => <PropField key={d.key} c={c} d={d} />)}
        <div className={s.actions}>
          <button className={s.iconBtn} onClick={() => rotate(c.id)} aria-label="Rotate" title="Rotate (R)"><IRotate /></button>
          <button className={s.iconBtn} onClick={() => duplicate(c.id)} aria-label="Duplicate" title="Duplicate (Ctrl+D)"><ICopy /></button>
          {def.mcu && <button className={`${s.iconBtn} ${s.primary}`} onClick={() => openCode(c.id)} data-testid="open-code"><ICode /> Code</button>}
          <span style={{ flex: 1 }} />
          <button className={`${s.iconBtn} ${s.danger}`} onClick={() => remove(c.id)} aria-label="Delete" title="Delete (Del)"><ITrash /></button>
        </div>
      </div>
    </>
  );
}

function WirePanel({ id }: { id: string }) {
  const { project, setWireColor, removeWire, select } = useStore();
  const w = project.wires.find((x) => x.id === id);
  const refs = refDesignators(project);
  if (!w) return null;
  return (
    <>
      <div className={s.drawerHead}>
        <h2>〰️ {refs[w.a.c]}.{w.a.p} → {refs[w.b.c]}.{w.b.p}</h2>
        <button className={s.iconBtn} onClick={() => select(null)} aria-label="Close"><IX /></button>
      </div>
      <div className={s.drawerBody}>
        <div className={s.field}>
          <span className={s.fieldLabel}>Color</span>
          <div className={s.swatches} role="radiogroup" aria-label="Wire color">
            {WIRE_COLORS.map((col) => <button key={col} role="radio" aria-checked={w.color === col} aria-label={col} className={s.swatch} style={{ background: col, color: col }} onClick={() => setWireColor(w.id, col)} />)}
          </div>
        </div>
        <div className={s.actions}><span style={{ flex: 1 }} /><button className={`${s.iconBtn} ${s.danger}`} onClick={() => removeWire(w.id)} aria-label="Delete wire"><ITrash /></button></div>
      </div>
    </>
  );
}

export function Inspector() {
  const drawer = useStore((x) => x.drawer);
  const sel = useStore((x) => x.selection);
  const comp = useStore((x) => (x.selection?.kind === 'comp' ? x.project.components.find((c) => c.id === x.selection!.id) : undefined));
  const open = drawer === 'props' && !!sel && (sel.kind === 'wire' || !!comp);
  return (
    <aside className={s.drawer} data-closed={!open || undefined} aria-label="Properties" inert={!open || undefined} data-testid="inspector">
      {open && (comp ? <CompPanel c={comp} /> : sel?.kind === 'wire' ? <WirePanel id={sel.id} /> : null)}
    </aside>
  );
}
