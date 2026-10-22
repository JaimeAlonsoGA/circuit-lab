import { getDef } from '@/lib/catalog';
import type { CompInst, Project } from '@/lib/types';
import { solveDense } from './linalg';
import { buildModel, type Branch, type McuBridge, type Model, type Outputs, type StepCtx } from './models';
import { buildNetlist, key, type Netlist } from './netlist';

interface BoundBranch {
  comp: string;
  b: Branch;
  nodes: number[]; // compact indices, -1 = reference
}

export interface SimResult {
  t: number;
  /** Voltage per "comp:pin". */
  v: Record<string, number>;
  /** Current flowing INTO the component at "comp:pin". */
  i: Record<string, number>;
  out: Record<string, Outputs>;
  /** Newly damaged components this frame: id → reason. */
  burnt: Record<string, string>;
  converged: boolean;
}

const noMcu: McuBridge = { running: () => false, pin: () => undefined };

/** Signature of everything that changes circuit topology (not props). */
export function topoSignature(p: Project) {
  return JSON.stringify([p.components.map((c) => [c.id, c.type, c.x, c.y, c.rot]), p.wires.map((w) => [w.a, w.b])]);
}

export class Simulator {
  t = 0;
  powered = true;
  net!: Netlist;
  private comps = new Map<string, CompInst>();
  private states = new Map<string, Record<string, number>>();
  private heat = new Map<string, number>();
  private models = new Map<string, Model>();
  private bound: BoundBranch[] = [];
  private n = 0;
  private V = new Float64Array(0);
  private sig = '';
  private damaged = new Set<string>();
  private nodeOfKey = new Map<string, number>();
  hasDynamics = false;

  constructor(project: Project, private mcu: McuBridge = noMcu) {
    this.load(project, []);
  }

  setMcu(m: McuBridge) { this.mcu = m; }

  /** Update the project. Rebuilds the netlist only when topology or damage changed; element state is kept. */
  load(project: Project, damaged: string[]) {
    for (const c of project.components) this.comps.set(c.id, c);
    const sig = topoSignature(project) + '|' + [...damaged].sort().join(',');
    if (sig === this.sig) return;
    this.sig = sig;
    this.damaged = new Set(damaged);
    const ids = new Set(project.components.map((c) => c.id));
    for (const id of [...this.comps.keys()]) if (!ids.has(id)) { this.comps.delete(id); this.states.delete(id); this.models.delete(id); }

    this.net = buildNetlist(project);
    this.bound = [];
    this.hasDynamics = false;
    const compact = new Map<number, number>();
    const prevV = this.V;
    const prevMap = this.nodeOfKey;
    this.nodeOfKey = new Map();
    for (const c of project.components) {
      if (!this.states.has(c.id)) this.states.set(c.id, {});
      const id = c.id;
      const model = buildModel({ comp: () => this.comps.get(id)!, state: this.states.get(id)!, mcu: { running: (x) => this.mcu.running(x), pin: (x, p) => this.mcu.pin(x, p) } });
      this.models.set(id, model);
      if (this.damaged.has(id)) continue;
      if (['capacitor', 'electrolytic', 'inductor', 'mic', 'relay'].includes(c.type) || getDef(c.type).mcu) this.hasDynamics = true;
      for (const b of model.branches) {
        const nodes = b.pins.map((p) => {
          const raw = this.net.node.get(key(id, p)) ?? -1;
          if (raw < 0) return -1;
          if (!compact.has(raw)) compact.set(raw, compact.size);
          return compact.get(raw)!;
        });
        this.bound.push({ comp: id, b, nodes });
      }
    }
    this.n = compact.size;
    for (const [k, raw] of this.net.node) this.nodeOfKey.set(k, raw < 0 ? -1 : compact.get(raw) ?? -2);
    // Warm start from previous voltages where the same pin existed.
    this.V = new Float64Array(this.n);
    for (const [k, idx] of this.nodeOfKey) {
      if (idx < 0) continue;
      const old = prevMap.get(k);
      if (old !== undefined && old >= 0 && old < prevV.length) this.V[idx] = prevV[old];
    }
  }

  /** Node voltage for a pin (NaN for pins only connected to unused nets). */
  nodeVoltage(k: string): number {
    const idx = this.nodeOfKey.get(k);
    if (idx === undefined || idx === -2) return 0;
    return idx < 0 ? 0 : this.V[idx];
  }

  /** Index of the electrical net a pin belongs to (-1 = ground) — for peripherals like servos and OLEDs. */
  netOf(k: string): number {
    return this.net.node.get(k) ?? -3;
  }

  private terminalV(nodes: number[], V: Float64Array) {
    return nodes.map((n) => (n < 0 ? 0 : V[n]));
  }

  /** One Newton–Raphson solve of a backward-Euler time step. */
  private solveStep(ctx: StepCtx): boolean {
    const n = this.n;
    if (n === 0) return true;
    const V = this.V.slice();
    const J = new Float64Array(n * n);
    const F = new Float64Array(n);
    const GMIN = 1e-9;
    for (let iter = 0; iter < 120; iter++) {
      J.fill(0);
      F.fill(0);
      for (let k = 0; k < n; k++) { J[k * n + k] += GMIN; F[k] += GMIN * V[k]; }
      for (const { b, nodes } of this.bound) {
        if (b.kind === 2) {
          const [na, nb] = nodes;
          const vd = (na < 0 ? 0 : V[na]) - (nb < 0 ? 0 : V[nb]);
          const [i, g] = b.f(vd, ctx);
          if (na >= 0) { F[na] += i; J[na * n + na] += g; if (nb >= 0) J[na * n + nb] -= g; }
          if (nb >= 0) { F[nb] -= i; J[nb * n + nb] += g; if (na >= 0) J[nb * n + na] -= g; }
        } else {
          const vt = this.terminalV(nodes, V);
          const i0 = b.i(vt, ctx);
          nodes.forEach((nr, r) => { if (nr >= 0) F[nr] += i0[r]; });
          for (let k = 0; k < nodes.length; k++) {
            const nk = nodes[k];
            if (nk < 0) continue;
            const h = 1e-6 * Math.max(1, Math.abs(vt[k]));
            const vp = vt.slice(); vp[k] += h;
            const i1 = b.i(vp, ctx);
            nodes.forEach((nr, r) => { if (nr >= 0) J[nr * n + nk] += (i1[r] - i0[r]) / h; });
          }
        }
      }
      const dV = F.map((x) => -x);
      if (!solveDense(J.slice(), dV, n)) return false;
      let maxd = 0;
      for (let k = 0; k < n; k++) {
        let d = dV[k];
        if (!Number.isFinite(d)) return false;
        if (d > 2) d = 2; else if (d < -2) d = -2;
        V[k] += d;
        maxd = Math.max(maxd, Math.abs(d));
      }
      if (maxd < 1e-7) {
        this.V = V;
        return true;
      }
    }
    this.V = V;
    return false;
  }

  private branchCurrents(ctx: StepCtx): Map<string, number> {
    const I = new Map<string, number>();
    for (const { comp, b, nodes } of this.bound) {
      const vt = this.terminalV(nodes, this.V);
      const cur = b.kind === 2 ? (() => { const [i] = b.f(vt[0] - vt[1], ctx); return [i, -i]; })() : b.i(vt, ctx);
      b.pins.forEach((p, r) => { const k = key(comp, p); I.set(k, (I.get(k) ?? 0) + cur[r]); });
    }
    return I;
  }

  /** Advance the simulation by `dt` seconds (sub-stepped). */
  advance(dt: number, steps = 1): SimResult {
    const burnt: Record<string, string> = {};
    let converged = true;
    const h = dt / steps;
    let ctx: StepCtx = { t: this.t, dt: h, powered: this.powered };
    for (let s = 0; s < steps; s++) {
      ctx = { t: this.t + h, dt: h, powered: this.powered };
      const ok = this.solveStep(ctx);
      converged &&= ok;
      for (const { b, nodes } of this.bound) {
        if (!b.commit) continue;
        const vt = this.terminalV(nodes, this.V);
        if (b.kind === 2) b.commit(vt[0] - vt[1], ctx); else b.commit(vt, ctx);
      }
      this.t += h;
      // Thermal stress integration.
      const I = this.branchCurrents(ctx);
      for (const [id, m] of this.models) {
        if (!m.stress || this.damaged.has(id) || burnt[id]) continue;
        const st = m.stress((p) => this.nodeVoltage(key(id, p)), (p) => I.get(key(id, p)) ?? 0, ctx);
        if (!st || !Number.isFinite(st.x)) continue;
        const tau = st.tau ?? 0.05;
        let heat = this.heat.get(id) ?? 0;
        heat = st.x > 1 ? heat + ((st.x - 1) * h) / tau : Math.max(0, heat - h * 2);
        this.heat.set(id, heat);
        if (heat >= 1) burnt[id] = st.reason;
      }
    }
    const I = this.branchCurrents(ctx);
    const v: Record<string, number> = {};
    const i: Record<string, number> = {};
    for (const k of this.nodeOfKey.keys()) v[k] = this.nodeVoltage(k);
    for (const [k, val] of I) i[k] = val;
    const out: Record<string, Outputs> = {};
    for (const [id, m] of this.models) {
      if (!m.observe || this.damaged.has(id)) continue;
      out[id] = m.observe((p) => this.nodeVoltage(key(id, p)), (p) => I.get(key(id, p)) ?? 0, ctx);
    }
    return { t: this.t, v, i, out, burnt, converged };
  }

  repair(id: string) { this.heat.set(id, 0); }
  resetState() {
    this.states.forEach((s) => { for (const k of Object.keys(s)) s[k] = 0; });
    this.V.fill(0); this.heat.clear(); this.t = 0;
  }
  heatOf(id: string) { return this.heat.get(id) ?? 0; }
}
