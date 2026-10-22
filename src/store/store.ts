'use client';
import { create } from 'zustand';
import { defaultProps, getDef } from '@/lib/catalog';
import type { CodeFile, CompInst, PinRef, Project, PropValue, Rotation, Wire } from '@/lib/types';
import type { FrameResult } from '@/sim/controller';

export type Selection = { kind: 'comp' | 'wire'; id: string } | null;
export type Drawer = 'props' | 'code' | 'ai' | null;

const WIRE_COLORS = ['#ff4d6d', '#ffd166', '#06d6a0', '#4cc9f0', '#f72585', '#ff9f1c', '#b8f2e6', '#c77dff'];
let seq = 0;
export const uid = (p: string) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;

export const emptyProject = (): Project => ({ version: 1, name: 'Untitled circuit', components: [], wires: [], code: {} });

interface State {
  project: Project;
  selection: Selection;
  damaged: Record<string, string>;
  powered: boolean;
  speed: number;
  muted: boolean;
  drawer: Drawer;
  paletteOpen: boolean;
  past: Project[];
  future: Project[];
  codeTarget: string | null;

  checkpoint(): void;
  addComponent(type: string, x: number, y: number, props?: Record<string, PropValue>): string;
  moveComponent(id: string, x: number, y: number): void;
  rotate(id: string): void;
  remove(id: string): void;
  duplicate(id: string): string | null;
  connect(a: PinRef, b: PinRef, color?: string): string | null;
  removeWire(id: string): void;
  setWireColor(id: string, color: string): void;
  setProp(id: string, key: string, value: PropValue, transient?: boolean): void;
  setCode(id: string, file: CodeFile): void;
  setPowered(on: boolean): void;
  burn(map: Record<string, string>): void;
  repair(id: string): void;
  repairAll(): void;
  undo(): void;
  redo(): void;
  load(p: Project): void;
  clear(): void;
  select(s: Selection): void;
  setDrawer(d: Drawer): void;
  togglePalette(): void;
  setSpeed(s: number): void;
  setMuted(m: boolean): void;
  setName(n: string): void;
  openCode(id: string): void;
}

const snap = (v: number) => Math.round(v / 10) * 10;
/** Breadboard holes sit on a 5-offset grid so parts snapped to 10 land exactly in them. */
const snapX = (type: string, v: number) => (type === 'breadboard' ? Math.round((v - 5) / 10) * 10 + 5 : snap(v));

export const useStore = create<State>((set, get) => {
  const mutate = (fn: (p: Project) => Project, history = true) => {
    const cur = get().project;
    const next = fn(cur);
    if (next === cur) return;
    set((s) => ({ project: next, past: history ? [...s.past.slice(-99), cur] : s.past, future: history ? [] : s.future }));
  };
  const mapComp = (id: string, f: (c: CompInst) => CompInst) => (p: Project) => ({ ...p, components: p.components.map((c) => (c.id === id ? f(c) : c)) });

  return {
    project: emptyProject(),
    selection: null,
    damaged: {},
    powered: true,
    speed: 1,
    muted: false,
    drawer: null,
    paletteOpen: true,
    past: [],
    future: [],
    codeTarget: null,

    checkpoint: () => set((s) => ({ past: [...s.past.slice(-99), s.project], future: [] })),
    addComponent: (type, x, y, props) => {
      const def = getDef(type);
      const id = uid(def.prefix.toLowerCase());
      const comp: CompInst = { id, type, x: snapX(type, x), y: snap(y), rot: 0, props: { ...defaultProps(type), ...props } };
      mutate((p) => ({ ...p, components: [...p.components, comp] }));
      return id;
    },
    moveComponent: (id, x, y) => mutate(mapComp(id, (c) => (c.x === snapX(c.type, x) && c.y === snap(y) ? c : { ...c, x: snapX(c.type, x), y: snap(y) })), false),
    rotate: (id) => mutate(mapComp(id, (c) => ({ ...c, rot: (((c.rot + 90) % 360) as Rotation) }))),
    remove: (id) => {
      mutate((p) => {
        const code = { ...p.code };
        delete code[id];
        return { ...p, components: p.components.filter((c) => c.id !== id), wires: p.wires.filter((w) => w.a.c !== id && w.b.c !== id), code };
      });
      set((s) => {
        const damaged = { ...s.damaged };
        delete damaged[id];
        return { damaged, selection: s.selection?.id === id ? null : s.selection };
      });
    },
    duplicate: (id) => {
      const c = get().project.components.find((x) => x.id === id);
      if (!c) return null;
      const nid = get().addComponent(c.type, c.x + 40, c.y + 40, c.props);
      const code = get().project.code[id];
      if (code) get().setCode(nid, code);
      return nid;
    },
    connect: (a, b, color) => {
      if (a.c === b.c && a.p === b.p) return null;
      const p = get().project;
      const exists = p.wires.some((w) => (w.a.c === a.c && w.a.p === a.p && w.b.c === b.c && w.b.p === b.p) || (w.a.c === b.c && w.a.p === b.p && w.b.c === a.c && w.b.p === a.p));
      if (exists) return null;
      for (const r of [a, b]) {
        const c = p.components.find((x) => x.id === r.c);
        if (!c || !getDef(c.type).pins.some((q) => q.name === r.p)) return null;
      }
      const isGnd = /GND|^-$|^K$|COM/.test(a.p + ' ' + b.p) && /GND|-/.test(a.p + b.p);
      const id = uid('w');
      const wire: Wire = { id, a, b, color: color ?? (isGnd ? '#3a3f58' : WIRE_COLORS[p.wires.length % WIRE_COLORS.length]) };
      mutate((pr) => ({ ...pr, wires: [...pr.wires, wire] }));
      return id;
    },
    removeWire: (id) => { mutate((p) => ({ ...p, wires: p.wires.filter((w) => w.id !== id) })); set((s) => ({ selection: s.selection?.id === id ? null : s.selection })); },
    setWireColor: (id, color) => mutate((p) => ({ ...p, wires: p.wires.map((w) => (w.id === id ? { ...w, color } : w)) })),
    setProp: (id, key, value, transient) => mutate(mapComp(id, (c) => ({ ...c, props: { ...c.props, [key]: value } })), !transient),
    setCode: (id, file) => mutate((p) => ({ ...p, code: { ...p.code, [id]: file } })),
    setPowered: (on) => set({ powered: on }),
    burn: (map) => set((s) => ({ damaged: { ...s.damaged, ...map } })),
    repair: (id) => set((s) => { const d = { ...s.damaged }; delete d[id]; return { damaged: d }; }),
    repairAll: () => set({ damaged: {} }),
    undo: () => {
      const { past, project, future } = get();
      if (!past.length) return;
      set({ project: past[past.length - 1], past: past.slice(0, -1), future: [project, ...future] });
    },
    redo: () => {
      const { past, project, future } = get();
      if (!future.length) return;
      set({ project: future[0], future: future.slice(1), past: [...past, project] });
    },
    load: (p) => { mutate(() => p); set((s) => ({ damaged: {}, selection: null, drawer: s.drawer === 'props' ? null : s.drawer })); },
    clear: () => { mutate(() => emptyProject()); set((s) => ({ damaged: {}, selection: null, drawer: s.drawer === 'props' ? null : s.drawer })); },
    select: (selection) => set((s) => ({ selection, drawer: selection ? (s.drawer === 'code' || s.drawer === 'ai' ? s.drawer : 'props') : s.drawer === 'props' ? null : s.drawer })),
    setDrawer: (drawer) => set({ drawer }),
    togglePalette: () => set((s) => ({ paletteOpen: !s.paletteOpen })),
    setSpeed: (speed) => set({ speed }),
    setMuted: (muted) => set({ muted }),
    setName: (name) => mutate((p) => ({ ...p, name }), false),
    openCode: (id) => set({ codeTarget: id, drawer: 'code' }),
  };
});

/** Live simulation output, updated every animation frame (kept separate to avoid re-rendering the editor state). */
export interface Anim {
  motor: Record<string, number>;
  scope: Record<string, number[]>;
}
export const useSim = create<{ frame: FrameResult | null; anim: Anim }>(() => ({ frame: null, anim: { motor: {}, scope: {} } }));

/* ---- tiny event bus for the pet, sounds and toasts ---- */
export type CircuitEvent =
  | { type: 'burn'; id: string; reason: string; label: string }
  | { type: 'working'; what: string }
  | { type: 'power'; on: boolean }
  | { type: 'connect' }
  | { type: 'say'; text: string };
type Listener = (e: CircuitEvent) => void;
const listeners = new Set<Listener>();
export const events = {
  on(l: Listener) { listeners.add(l); return () => { listeners.delete(l); }; },
  emit(e: CircuitEvent) { listeners.forEach((l) => l(e)); },
};
