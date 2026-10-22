import { getDef, pinPos } from '@/lib/catalog';
import type { Project } from '@/lib/types';

export interface Netlist {
  /** Number of unknown (non-reference) nodes. */
  size: number;
  /** "compId:pin" → node index, -1 for the reference (ground) node. */
  node: Map<string, number>;
  /** node index → list of "compId:pin" keys (index size = reference). */
  members: string[][];
  hasExplicitGround: boolean;
}

const NEG_PINS: Record<string, string> = {
  battery9v: '-', batteryAA: '-', coincell: '-', usb: 'GND', supply: '-', solar: '-', uno: 'GND', esp32: 'GND', pico: 'GND',
};

export const key = (c: string, p: string) => `${c}:${p}`;

export function buildNetlist(project: Project): Netlist {
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    let r = k;
    while (parent.get(r) !== r) r = parent.get(r)!;
    let x = k;
    while (parent.get(x) !== r) { const n = parent.get(x)!; parent.set(x, r); x = n; }
    return r;
  };
  const union = (a: string, b: string) => {
    if (!parent.has(a) || !parent.has(b)) return;
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  const byPos = new Map<string, string>();
  for (const c of project.components) {
    const def = getDef(c.type);
    for (const p of def.pins) {
      const k = key(c.id, p.name);
      parent.set(k, k);
      const pos = pinPos(c, p.name);
      const pk = `${Math.round(pos.x / 5)},${Math.round(pos.y / 5)}`;
      const other = byPos.get(pk);
      if (other) union(k, other); else byPos.set(pk, k);
    }
    for (const g of def.bridges ?? []) for (let i = 1; i < g.length; i++) union(key(c.id, g[0]), key(c.id, g[i]));
    // Boards: all GND pins are the same net.
    if (def.mcu) {
      const gnds = def.pins.filter((p) => p.name.startsWith('GND')).map((p) => key(c.id, p.name));
      for (let i = 1; i < gnds.length; i++) union(gnds[0], gnds[i]);
    }
  }
  for (const w of project.wires) union(key(w.a.c, w.a.p), key(w.b.c, w.b.p));

  let refRoot: string | undefined;
  const g = project.components.find((c) => c.type === 'ground');
  if (g) refRoot = find(key(g.id, 'g'));
  else {
    for (const c of project.components) {
      const neg = NEG_PINS[c.type];
      if (neg) { refRoot = find(key(c.id, neg)); break; }
    }
  }

  const rootIndex = new Map<string, number>();
  const node = new Map<string, number>();
  const members: string[][] = [];
  let size = 0;
  for (const k of parent.keys()) {
    const r = find(k);
    let idx: number;
    if (r === refRoot) idx = -1;
    else {
      if (!rootIndex.has(r)) { rootIndex.set(r, size++); members.push([]); }
      idx = rootIndex.get(r)!;
    }
    node.set(k, idx);
  }
  members.push([]);
  for (const [k, idx] of node) members[idx === -1 ? size : idx].push(k);
  return { size, node, members, hasExplicitGround: !!g };
}
