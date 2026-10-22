'use client';
import { useEffect, useRef, useState } from 'react';
import { useStore, useSim } from '@/store/store';
import { TEMPLATES } from '@/lib/templates';
import { toJson, toSpice, toBomCsv, toKicadNet, parseProject, download } from '@/lib/export';
import { exportSvg, exportPng } from '@/lib/image';
import { audio } from '@/audio/audio';
import { toast } from './Toasts';
import s from './ui.module.css';
import { IPlug, IUndo, IRedo, ISound, IMute, IDownload, IBook, IUpload, IBolt } from './icons';

function useClickOutside(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) close(); };
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('pointerdown', h);
    window.addEventListener('keydown', k);
    return () => { window.removeEventListener('pointerdown', h); window.removeEventListener('keydown', k); };
  }, [open, close]);
  return ref;
}

function SimTime() {
  const t = useSim((x) => x.frame?.t ?? 0);
  const powered = useStore((x) => x.powered);
  return <span className={s.time} aria-label="Simulation time">{powered ? `${t.toFixed(2)}s` : '—'}</span>;
}

export function TopBar() {
  const { powered, setPowered, undo, redo, past, future, muted, setMuted, speed, setSpeed, project, setName, load } = useStore();
  const [menu, setMenu] = useState<'tpl' | 'export' | null>(null);
  const close = () => setMenu(null);
  const ref = useClickOutside(menu !== null, close);
  const file = useRef<HTMLInputElement>(null);
  const slug = (project.name || 'circuit').replace(/[^\w-]+/g, '-').toLowerCase();

  const doExport = async (kind: string) => {
    close();
    try {
      if (kind === 'json') download(`${slug}.circuit.json`, toJson(project), 'application/json');
      if (kind === 'spice') download(`${slug}.cir`, toSpice(project));
      if (kind === 'bom') download(`${slug}-bom.csv`, toBomCsv(project), 'text/csv');
      if (kind === 'kicad') download(`${slug}.net`, toKicadNet(project));
      if (kind === 'svg') download(`${slug}.svg`, exportSvg(), 'image/svg+xml');
      if (kind === 'png') download(`${slug}.png`, await exportPng(), 'image/png');
      toast(`Exported ${kind.toUpperCase()}`, 'ok');
    } catch (e) { toast(`Export failed: ${(e as Error).message}`, 'danger'); }
  };

  const onImport = async (f: File | undefined) => {
    if (!f) return;
    try { load(parseProject(await f.text())); toast(`Loaded ${f.name}`, 'ok'); }
    catch (e) { toast(`Can't open: ${(e as Error).message}`, 'danger'); }
  };

  return (
    <header className={s.top} ref={ref} role="toolbar" aria-label="Circuit tools">
      <div className={s.brand}>
        <svg className={s.logo} viewBox="0 0 32 32" aria-hidden><rect width="32" height="32" rx="8" fill="#0d1428" /><path d="M6 16h5l3-7 4 14 3-7h5" stroke="#4cc9f0" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <span>Circuit Lab</span>
      </div>
      <input className={s.name} value={project.name} onChange={(e) => setName(e.target.value)} aria-label="Project name" spellCheck={false} />
      <span className={s.sep} />
      <button className={s.plug} aria-pressed={powered} onClick={() => { audio.unlock(); setPowered(!powered); }} title="Power (P)" data-testid="power">
        <span className={s.plugKnob}>{powered ? <IBolt /> : <IPlug />}</span>
        {powered ? 'ON' : 'OFF'}
      </button>
      <SimTime />
      <label className={s.speed} title="Simulation speed">
        <span className={s.srOnly}>Speed</span>
        <input type="range" min={-2} max={1} step={1} value={Math.log10(speed)} onChange={(e) => setSpeed(10 ** Number(e.target.value))} aria-valuetext={`${speed}×`} />
        <span className={s.kbd}>{speed}×</span>
      </label>
      <span className={s.sep} />
      <button className={s.iconBtn} onClick={undo} disabled={!past.length} aria-label="Undo" title="Undo (Ctrl+Z)"><IUndo /></button>
      <button className={s.iconBtn} onClick={redo} disabled={!future.length} aria-label="Redo" title="Redo (Ctrl+Y)"><IRedo /></button>
      <button className={s.iconBtn} onClick={() => setMuted(!muted)} aria-label={muted ? 'Unmute' : 'Mute'} aria-pressed={!muted}>{muted ? <IMute /> : <ISound />}</button>
      <span className={s.sep} />
      <div className={s.menuWrap}>
        <button className={s.iconBtn} onClick={() => setMenu(menu === 'tpl' ? null : 'tpl')} aria-haspopup="menu" aria-expanded={menu === 'tpl'} aria-label="Examples" data-testid="templates"><IBook /></button>
        {menu === 'tpl' && (
          <div className={`${s.menu} ${s.grid2}`} role="menu">
            {TEMPLATES.map((t) => (
              <button key={t.name} role="menuitem" className={s.menuItem} onClick={() => { load(t.make()); close(); }}>
                <span className={s.emoji}>{t.emoji}</span>{t.name}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className={s.menuWrap}>
        <button className={s.iconBtn} onClick={() => setMenu(menu === 'export' ? null : 'export')} aria-haspopup="menu" aria-expanded={menu === 'export'} aria-label="Export / import" data-testid="export"><IDownload /></button>
        {menu === 'export' && (
          <div className={s.menu} role="menu">
            {[['json', '📦', 'Project', '.json'], ['png', '🖼️', 'Image', '.png'], ['svg', '✏️', 'Vector', '.svg'], ['spice', '📐', 'SPICE netlist', '.cir'], ['kicad', '🛠️', 'KiCad netlist', '.net'], ['bom', '🧾', 'Bill of materials', '.csv']].map(([k, e, l, ext]) => (
              <button key={k} role="menuitem" className={s.menuItem} onClick={() => doExport(k)}><span className={s.emoji}>{e}</span>{l}<small>{ext}</small></button>
            ))}
            <button role="menuitem" className={s.menuItem} onClick={() => { file.current?.click(); close(); }}><span className={s.emoji}><IUpload width={18} /></span>Open…<small>.json</small></button>
          </div>
        )}
      </div>
      <input ref={file} type="file" accept=".json,application/json" hidden onChange={(e) => { void onImport(e.target.files?.[0]); e.target.value = ''; }} />
    </header>
  );
}
