import { LED_COLORS, getDef } from '@/lib/catalog';
import type { CompInst, McuKind } from '@/lib/types';

export interface StepCtx {
  t: number;
  dt: number;
  powered: boolean;
}

/** A two-terminal branch: current into terminal a (and out of b) as a function of vd = va - vb. */
export interface TwoTerm {
  kind: 2;
  pins: [string, string];
  /** Returns [current, dI/dvd]. */
  f(vd: number, s: StepCtx): [number, number];
  commit?(vd: number, s: StepCtx): void;
}

/** A general n-terminal element: currents into each terminal given terminal voltages (numeric Jacobian). */
export interface MultiTerm {
  kind: 'n';
  pins: string[];
  i(v: number[], s: StepCtx): number[];
  commit?(v: number[], s: StepCtx): void;
}

export type Branch = TwoTerm | MultiTerm;

export type Outputs = Record<string, number | boolean | string>;
export type VFn = (pin: string) => number;
export type IFn = (pin: string) => number;

export interface Stress {
  x: number;
  reason: string;
  /** Seconds of overload (at 2x) before damage. */
  tau?: number;
}

export interface Model {
  branches: Branch[];
  observe?(V: VFn, I: IFn, s: StepCtx): Outputs;
  stress?(V: VFn, I: IFn, s: StepCtx): Stress | null;
}

export interface McuPinState {
  mode: 'input' | 'output' | 'pullup';
  level: number; // 0..1 (PWM duty for analogWrite)
}

export interface McuBridge {
  running(compId: string): boolean;
  pin(compId: string, pin: string): McuPinState | undefined;
}

export interface BuildCtx {
  comp: () => CompInst;
  state: Record<string, number>;
  mcu: McuBridge;
}

/* ---------- device equations ---------- */
const VT = 0.02585;
const EXP_LIM = 80; // high enough that blue/white LED knees (≈60 nVt) stay on the true exponential

/** Exponential with linear extension above EXP_LIM to keep Newton stable. Returns [e, de/dx]. */
function limexp(x: number): [number, number] {
  if (x > EXP_LIM) {
    const e = Math.exp(EXP_LIM);
    return [e * (1 + x - EXP_LIM), e];
  }
  if (x < -EXP_LIM) return [0, 0];
  const e = Math.exp(x);
  return [e, e];
}

export function diode(vd: number, Is: number, nVt: number): [number, number] {
  const [e, de] = limexp(vd / nVt);
  return [Is * (e - 1) + 1e-12 * vd, (Is * de) / nVt + 1e-12];
}

const lin = (g: number) => (vd: number): [number, number] => [g * vd, g];
const OPEN = 1e-12;

const resistive = (pins: [string, string], r: () => number, commit?: TwoTerm['commit']): TwoTerm => ({
  kind: 2, pins, f: (vd) => { const g = 1 / Math.max(r(), 1e-4); return [g * vd, g]; }, commit,
});

/** Thevenin source as a Norton equivalent: current INTO + terminal. */
const source = (pins: [string, string], E: () => number, r: () => number, on: (s: StepCtx) => boolean): TwoTerm => ({
  kind: 2, pins,
  f: (vd, s) => {
    if (!on(s)) return lin(OPEN)(vd);
    const g = 1 / r();
    return [(vd - E()) * g, g];
  },
});

export const ledIs = (vf: number) => 0.01 / Math.exp(vf / (2 * VT));
const ledBranch = (pins: [string, string], vf: number): TwoTerm => {
  const Is = ledIs(vf);
  return { kind: 2, pins, f: (vd) => diode(vd, Is, 2 * VT) };
};

function npnCurrents(vbe: number, vbc: number, beta: number): [number, number] {
  const Is = 1e-14, br = 1;
  const [ebe] = limexp(vbe / VT);
  const [ebc] = limexp(vbc / VT);
  const ic = Is * (ebe - ebc) - (Is / br) * (ebc - 1);
  const ib = (Is / beta) * (ebe - 1) + (Is / br) * (ebc - 1);
  return [ic, ib];
}

const BOARD: Record<McuKind, { vlogic: number; rails: [string, number, number][]; gnd: string }> = {
  uno: { vlogic: 5, gnd: 'GND', rails: [['5V', 5, 0.2], ['3V3', 3.3, 1], ['VIN', 4.6, 2]] },
  esp32: { vlogic: 3.3, gnd: 'GND', rails: [['3V3', 3.3, 0.3], ['5V', 4.8, 0.3]] },
  pico: { vlogic: 3.3, gnd: 'GND', rails: [['3V3', 3.3, 0.3], ['VSYS', 4.7, 0.3], ['VBUS', 5, 0.2]] },
};
export const boardInfo = (k: McuKind) => BOARD[k];
export const isGpio = (name: string) => /^(D\d+|A\d|G\d+|GP\d+)$/.test(name);

/* ---------- component models ---------- */
export function buildModel(ctx: BuildCtx): Model {
  const c = ctx.comp();
  const P = () => ctx.comp().props;
  const num = (k: string) => Number(P()[k]);
  const st = ctx.state;
  const on = (s: StepCtx) => s.powered;

  switch (c.type) {
    case 'battery9v':
    case 'batteryAA':
    case 'coincell':
    case 'supply':
      return {
        branches: [source(['+', '-'], () => num('voltage'), () => Math.max(num('rint'), 1e-3), on)],
        observe: (V, I) => ({ v: V('+') - V('-'), i: -I('+') }),
      };
    case 'usb':
      return {
        branches: [{
          kind: 2, pins: ['VBUS', 'GND'],
          f: (vd, s) => {
            if (!s.powered) return lin(OPEN)(vd);
            const E = num('voltage'), r = Math.max(num('rint'), 1e-3), il = num('ilimit');
            const th = Math.tanh((E - vd) / (r * il));
            return [-il * th, (1 - th * th) / r];
          },
        }],
        observe: (V, I) => ({ v: V('VBUS') - V('GND'), i: -I('VBUS'), limiting: Math.abs(I('VBUS')) > num('ilimit') * 0.95 }),
      };
    case 'solar':
      return {
        branches: [{
          kind: 2, pins: ['+', '-'],
          f: (vd, s) => {
            if (!s.powered) return lin(OPEN)(vd);
            const n = Math.max(1, num('cells'));
            const iph = 0.1 * (num('light') / 100);
            const [i, di] = diode(vd / n, 1e-10, 0.03);
            return [i - iph, di / n];
          },
        }],
        observe: (V, I) => ({ v: V('+') - V('-'), i: -I('+') }),
      };
    case 'ground':
      return { branches: [] };
    case 'resistor':
      return {
        branches: [resistive(['a', 'b'], () => num('resistance'))],
        observe: (V, I) => ({ i: I('a'), p: (V('a') - V('b')) * I('a') }),
        stress: (V) => ({ x: (V('a') - V('b')) ** 2 / num('resistance') / num('power'), reason: 'Too much power: the resistor overheated', tau: 0.08 }),
      };
    case 'potentiometer': {
      // position 100% puts the wiper at pin a, 0% at pin b
      const ra = () => Math.max(1, num('resistance') * (1 - num('position') / 100));
      const rb = () => Math.max(1, (num('resistance') * num('position')) / 100);
      return {
        branches: [resistive(['a', 'w'], ra), resistive(['w', 'b'], rb)],
        stress: (V) => ({ x: Math.max((V('a') - V('w')) ** 2 / ra(), (V('w') - V('b')) ** 2 / rb()) / 0.25, reason: 'The track burnt out' }),
      };
    }
    case 'capacitor':
    case 'electrolytic': {
      const [pa, pb] = c.type === 'capacitor' ? ['a', 'b'] : ['+', '-'];
      st.vprev ??= 0;
      return {
        branches: [{
          kind: 2, pins: [pa, pb],
          f: (vd, s) => { const g = num('capacitance') / s.dt; return [g * (vd - st.vprev) + 1e-9 * vd, g + 1e-9]; },
          commit: (vd) => { st.vprev = vd; },
        }],
        observe: (V) => ({ v: V(pa) - V(pb), charge: Math.min(1, Math.abs(V(pa) - V(pb)) / num('vmax')) }),
        stress: (V) => {
          const vd = V(pa) - V(pb);
          if (c.type === 'electrolytic' && vd < -1) return { x: 50, reason: 'Electrolytic capacitor connected backwards: it popped!' };
          return { x: Math.abs(vd) / num('vmax') / 1.05, reason: 'Voltage above the capacitor rating: it popped!', tau: 0.02 };
        },
      };
    }
    case 'inductor':
      st.iprev ??= 0;
      return {
        branches: [{
          kind: 2, pins: ['a', 'b'],
          f: (vd, s) => {
            const zl = num('inductance') / s.dt, r = Math.max(num('rdc'), 1e-3);
            return [(vd + zl * st.iprev) / (r + zl), 1 / (r + zl)];
          },
          commit: (vd, s) => {
            const zl = num('inductance') / s.dt, r = Math.max(num('rdc'), 1e-3);
            st.iprev = (vd + zl * st.iprev) / (r + zl);
          },
        }],
        observe: (_V, I) => ({ i: I('a') }),
      };
    case 'fuse':
      return {
        branches: [resistive(['a', 'b'], () => 0.05)],
        observe: (_V, I) => ({ i: I('a') }),
        stress: (_V, I) => ({ x: Math.abs(I('a')) / num('rating'), reason: 'The fuse blew (it did its job!)', tau: 0.01 }),
      };
    case 'ldr':
      return { branches: [resistive(['a', 'b'], () => 10 ** (6 - 3.3 * (num('light') / 100)))], observe: (_V, I) => ({ i: I('a') }) };
    case 'thermistor':
      return { branches: [resistive(['a', 'b'], () => 10000 * Math.exp(3950 * (1 / (num('temp') + 273.15) - 1 / 298.15)))], observe: (_V, I) => ({ i: I('a') }) };
    case 'diode':
      return {
        branches: [{ kind: 2, pins: ['A', 'K'], f: (vd) => diode(vd, 2.5e-9, 1.75 * VT) }],
        observe: (_V, I) => ({ i: I('A') }),
        stress: (_V, I) => ({ x: Math.abs(I('A')) / num('imax'), reason: 'Too much current: the diode fried' }),
      };
    case 'zener':
      return {
        branches: [{
          kind: 2, pins: ['A', 'K'],
          f: (vd) => {
            const [i1, d1] = diode(vd, 2.5e-9, 1.75 * VT);
            const [e, de] = limexp((-vd - num('vz')) / 0.03);
            return [i1 - 5e-3 * e, d1 + (5e-3 * de) / 0.03];
          },
        }],
        observe: (_V, I) => ({ i: I('A') }),
        stress: (V, I) => ({ x: Math.abs((V('A') - V('K')) * I('A')) / num('power'), reason: 'The zener overheated' }),
      };
    case 'led': {
      const color = String(P().color);
      return {
        branches: [ledBranch(['A', 'K'], LED_COLORS[color]?.vf ?? 2)],
        observe: (_V, I) => ({ brightness: Math.max(0, Math.min(1.6, I('A') / 0.015)), i: I('A') }),
        stress: (V, I) => {
          if (V('A') - V('K') < -6) return { x: 3, reason: 'Reverse voltage broke down the LED' };
          return { x: I('A') / num('imax'), reason: 'Too much current: the LED burnt out. Add a resistor (≈220Ω)!', tau: 0.05 };
        },
      };
    }
    case 'rgbled':
      return {
        branches: [ledBranch(['R', 'K'], 1.9), ledBranch(['G', 'K'], 2.6), ledBranch(['B', 'K'], 2.8)],
        observe: (_V, I) => ({ r: Math.min(1.5, Math.max(0, I('R') / 0.015)), g: Math.min(1.5, Math.max(0, I('G') / 0.015)), b: Math.min(1.5, Math.max(0, I('B') / 0.015)) }),
        stress: (_V, I) => ({ x: Math.max(I('R'), I('G'), I('B')) / num('imax'), reason: 'Too much current: a die of the RGB LED burnt out' }),
      };
    case 'npn':
    case 'pnp': {
      const sgn = c.type === 'npn' ? 1 : -1;
      return {
        branches: [{
          kind: 'n', pins: ['C', 'B', 'E'],
          i: ([vc, vb, ve]) => {
            const [ic, ib] = npnCurrents(sgn * (vb - ve), sgn * (vb - vc), num('beta'));
            return [sgn * ic, sgn * ib, -sgn * (ic + ib)];
          },
        }],
        observe: (_V, I) => ({ ic: sgn * I('C'), ib: sgn * I('B') }),
        stress: (V, I) => ({ x: Math.max(Math.abs(I('C')) / num('imax'), Math.abs((V('C') - V('E')) * I('C')) / 0.625), reason: 'The transistor overheated (too much collector current)' }),
      };
    }
    case 'nmos':
      return {
        branches: [{
          kind: 'n', pins: ['G', 'D', 'S'],
          i: ([vg, vd, vs]) => {
            let swap = false;
            if (vd < vs) { [vd, vs] = [vs, vd]; swap = true; }
            const vgs = vg - vs, vds = vd - vs, n = 0.05;
            const x = (vgs - num('vth')) / n;
            const vov = x > 30 ? vgs - num('vth') : n * Math.log1p(Math.exp(x));
            const K = 2;
            const id = vds < vov ? K * (vov * vds - (vds * vds) / 2) : (K / 2) * vov * vov * (1 + 0.01 * (vds - vov));
            const gl = 1e-9 * (vg - (swap ? vd : vs));
            return swap ? [gl, -id, id - gl] : [gl, id, -id - gl];
          },
        }],
        observe: (_V, I) => ({ id: I('D') }),
        stress: (V, I) => ({ x: Math.max(Math.abs(I('D')) / num('imax'), Math.abs((V('D') - V('S')) * I('D')) / 2), reason: 'The MOSFET overheated' }),
      };
    case 'button':
      return { branches: [resistive(['a', 'b'], () => (P().pressed ? 0.02 : 1e9))], observe: (_V, I) => ({ i: I('a') }) };
    case 'switch':
      return { branches: [resistive(['a', 'b'], () => (P().on ? 0.02 : 1e9))], observe: (_V, I) => ({ i: I('a') }) };
    case 'tmp36':
    case 'mic': {
      const target = (vs: number, s: StepCtx) => {
        const p = Math.max(0, Math.min(1, (vs - 2.2) / 0.5));
        if (c.type === 'tmp36') return p * Math.min(vs - 0.1, 0.5 + 0.01 * num('temp'));
        const amp = (num('level') / 100) * vs * 0.45;
        return p * (vs / 2 + amp * Math.sin(2 * Math.PI * 4 * s.t) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 0.7 * s.t)));
      };
      return {
        branches: [{
          kind: 'n', pins: ['VCC', 'OUT', 'GND'],
          i: ([vcc, vo, vg], s) => {
            const vs = vcc - vg;
            const iv = vs / 20000;
            const io = (vo - vg - target(vs, s)) / 100;
            return [iv, io, -iv - io];
          },
        }],
        observe: (V) => ({ out: V('OUT') - V('GND'), powered: V('VCC') - V('GND') > 2.7 }),
        stress: (V) => ({ x: (V('VCC') - V('GND')) / 7, reason: 'Supply voltage too high: the sensor died' }),
      };
    }
    case 'buzzer':
      return {
        branches: [resistive(['+', '-'], () => 60)],
        observe: (V, I) => ({ on: V('+') - V('-') > 2, i: I('+') }),
        stress: (V) => ({ x: Math.abs(V('+') - V('-')) / 15, reason: 'Over-voltage: the buzzer cooked' }),
      };
    case 'speaker':
      return {
        branches: [resistive(['+', '-'], () => 8)],
        observe: (V, I) => ({ level: Math.min(1, Math.abs(I('+')) / 0.2), i: I('+') }),
        stress: (V) => ({ x: (V('+') - V('-')) ** 2 / 8 / num('power'), reason: 'Too much power: the speaker coil melted' }),
      };
    case 'motor':
      return {
        branches: [resistive(['+', '-'], () => 8)],
        observe: (_V, I) => ({ speed: Math.max(-2, Math.min(2, I('+') / 0.4)), i: I('+') }),
        stress: (_V, I) => ({ x: Math.abs(I('+')) / num('imax'), reason: 'The motor windings overheated' }),
      };
    case 'servo':
      return {
        branches: [resistive(['VCC', 'GND'], () => 50), resistive(['SIG', 'GND'], () => 1e5)],
        observe: (V) => ({ powered: V('VCC') - V('GND') > 4 }),
        stress: (V) => ({ x: (V('VCC') - V('GND')) / 7.5, reason: 'Over-voltage: the servo electronics fried' }),
      };
    case 'relay':
      st.closed ??= 0;
      return {
        branches: [
          resistive(['C1', 'C2'], () => 70, (vd) => {
            const i = Math.abs(vd) / 70;
            if (i > 0.045) st.closed = 1; else if (i < 0.025) st.closed = 0;
          }),
          resistive(['COM', 'NO'], () => (st.closed ? 0.05 : 1e9)),
        ],
        observe: (_V, I) => ({ closed: !!st.closed, i: I('COM') }),
        stress: (V, I) => ({ x: Math.max(Math.abs(V('C1') - V('C2')) / 9, Math.abs(I('COM')) / 10), reason: 'The relay coil burnt out' }),
      };
    case 'lamp': {
      const r = () => num('vrated') / 0.1;
      return {
        branches: [resistive(['a', 'b'], r)],
        observe: (V) => ({ brightness: Math.min(1.5, ((V('a') - V('b')) / num('vrated')) ** 2) }),
        stress: (V) => ({ x: Math.abs(V('a') - V('b')) / num('vrated') / 1.4, reason: 'The filament snapped (over-voltage)' }),
      };
    }
    case 'sevenseg': {
      const vf = LED_COLORS[String(P().color)]?.vf ?? 1.8;
      const segs = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp'];
      return {
        branches: segs.map((sname) => ledBranch([sname, 'COM'], vf)),
        observe: (_V, I) => Object.fromEntries(segs.map((sname) => [sname, Math.max(0, Math.min(1.5, I(sname) / 0.012))])),
        stress: (_V, I) => ({ x: Math.max(...segs.map((sname) => I(sname))) / 0.03, reason: 'A segment burnt out: use resistors on each segment' }),
      };
    }
    case 'oled':
      return {
        branches: [resistive(['VCC', 'GND'], () => 250), resistive(['SDA', 'GND'], () => 1e6), resistive(['SCL', 'GND'], () => 1e6)],
        observe: (V) => ({ powered: V('VCC') - V('GND') > 2.8 }),
        stress: (V) => ({ x: (V('VCC') - V('GND')) / 6, reason: 'Over-voltage: the OLED died' }),
      };
    case 'uno':
    case 'esp32':
    case 'pico': {
      const info = BOARD[getDef(c.type).mcu!];
      const def = getDef(c.type);
      const usb = (s: StepCtx) => s.powered && !!P().usb;
      const branches: Branch[] = info.rails.map(([pin, E, r]) => source([pin, info.gnd], () => E, () => r, usb));
      for (const pin of def.pins) {
        if (!isGpio(pin.name)) continue;
        branches.push({
          kind: 2, pins: [pin.name, info.gnd],
          f: (vd) => {
            const ps = ctx.mcu.running(c.id) ? ctx.mcu.pin(c.id, pin.name) : undefined;
            if (!ps || ps.mode === 'input') return lin(1e-8)(vd);
            if (ps.mode === 'pullup') return [(vd - info.vlogic) / 35000, 1 / 35000];
            return [(vd - ps.level * info.vlogic) / 25, 1 / 25];
          },
        });
      }
      return {
        branches,
        observe: (V) => ({ vcc: V(info.rails[0][0]) - V(info.gnd) }),
        stress: (V, I) => {
          let worst = 0, wp = '';
          for (const pin of def.pins) {
            if (!isGpio(pin.name)) continue;
            const i = Math.abs(I(pin.name));
            if (i > worst) { worst = i; wp = pin.name; }
          }
          const over = (V(info.rails[0][0]) - V(info.gnd)) / (info.vlogic * 1.6);
          if (over > worst / 0.04) return { x: over, reason: 'Over-voltage on the supply rail: the board is fried' };
          return { x: worst / 0.04, reason: `Pin ${wp} sourced too much current (>40mA): the board is fried`, tau: 0.1 };
        },
      };
    }
    case 'breadboard':
      return { branches: [] };
    case 'voltmeter':
      return {
        branches: [resistive(['V', 'COM'], () => (P().mode === 'A' ? 0.05 : 1e7))],
        observe: (V, I) => ({ reading: P().mode === 'A' ? I('V') : V('V') - V('COM') }),
        stress: (_V, I) => ({ x: Math.abs(I('V')) / 10, reason: 'The meter fuse blew (ammeter across a source?)' }),
      };
    case 'scope':
      return { branches: [resistive(['CH', 'GND'], () => 1e7)], observe: (V) => ({ v: V('CH') - V('GND') }) };
    case 'probe':
      return { branches: [{ kind: 'n', pins: ['tip'], i: ([v]) => [v / 1e7] }], observe: (V) => ({ v: V('tip') }) };
    default:
      return { branches: [] };
  }
}
