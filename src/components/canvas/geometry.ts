import { pinPos } from '@/lib/catalog';
import type { CompInst, PinRef, Project, Wire } from '@/lib/types';

export const pinKey = (r: PinRef) => `${r.c}:${r.p}`;

export function wirePath(a: { x: number; y: number }, b: { x: number; y: number }) {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const sag = Math.min(50, d * 0.22);
  return `M ${a.x} ${a.y} C ${a.x} ${a.y + sag} ${b.x} ${b.y + sag} ${b.x} ${b.y}`;
}

export function endpoints(w: Wire, byId: Map<string, CompInst>) {
  const ca = byId.get(w.a.c), cb = byId.get(w.b.c);
  if (!ca || !cb) return null;
  return { a: pinPos(ca, w.a.p), b: pinPos(cb, w.b.p) };
}

/** Current flowing along a wire from end a to end b, estimated from terminal currents. */
export function wireCurrent(w: Wire, p: Project, deg: Map<string, number>, I: Record<string, number>, types: Map<string, string>): number | null {
  const ka = pinKey(w.a), kb = pinKey(w.b);
  const passiveA = types.get(w.a.c) === 'breadboard', passiveB = types.get(w.b.c) === 'breadboard';
  if (!passiveA && deg.get(ka) === 1 && I[ka] !== undefined) return -I[ka];
  if (!passiveB && deg.get(kb) === 1 && I[kb] !== undefined) return I[kb];
  if (!passiveA && !passiveB && I[ka] !== undefined && I[kb] !== undefined) {
    const x = -I[ka], y = I[kb];
    return Math.sign(x) === Math.sign(y) ? Math.sign(x) * Math.min(Math.abs(x), Math.abs(y)) : 0;
  }
  void p;
  return null;
}

export function pinDegrees(p: Project) {
  const deg = new Map<string, number>();
  for (const w of p.wires) for (const k of [pinKey(w.a), pinKey(w.b)]) deg.set(k, (deg.get(k) ?? 0) + 1);
  return deg;
}
