import { defaultProps } from '@/lib/catalog';
import type { CompInst, Project, Wire } from '@/lib/types';

export function proj(comps: [string, string, Record<string, unknown>?][], wires: [string, string][]): Project {
  const components: CompInst[] = comps.map(([id, type, props], i) => ({
    id, type, x: i * 400, y: i * 400, rot: 0, props: { ...defaultProps(type), ...(props as object) } as CompInst['props'],
  }));
  const w: Wire[] = wires.map(([a, b], i) => {
    const [ac, ap] = a.split(':'); const [bc, bp] = b.split(':');
    return { id: `w${i}`, a: { c: ac, p: ap }, b: { c: bc, p: bp }, color: '#f00' };
  });
  return { version: 1, name: 't', components, wires: w, code: {} };
}
