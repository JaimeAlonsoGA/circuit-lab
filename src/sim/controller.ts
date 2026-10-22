import { getDef } from '@/lib/catalog';
import type { Project } from '@/lib/types';
import { I2C_PINS, macrotask, McuRunner, type DrawOp } from '@/runtime/mcu';
import { Simulator, type SimResult } from './engine';
import { boardInfo } from './models';
import { key } from './netlist';

export interface Peripherals {
  angle: Record<string, number>;
  oled: Record<string, DrawOp[]>;
  tone: Record<string, number>;
  builtinLed: Record<string, boolean>;
}

export interface FrameResult extends SimResult {
  periph: Peripherals;
  serial: Record<string, { lines: string[]; error: string | null; warnings: string[]; running: boolean }>;
}

/** Couples the electrical simulator with the microcontroller runners in simulated time. */
export class Controller {
  sim: Simulator;
  runners = new Map<string, McuRunner>();
  private project: Project;
  private damaged: string[] = [];
  private codeHash = new Map<string, string>();
  speed = 1;
  private busy = false;

  constructor(project: Project) {
    this.project = project;
    this.sim = new Simulator(project, {
      running: (id) => !!this.runners.get(id)?.running,
      pin: (id, p) => this.runners.get(id)?.pins.get(p),
    });
  }

  load(project: Project, damaged: string[]) {
    this.project = project;
    for (const id of this.damaged) if (!damaged.includes(id)) this.sim.repair(id);
    this.damaged = damaged;
    this.sim.load(project, damaged);
    const ids = new Set(project.components.map((c) => c.id));
    for (const [id, r] of this.runners) if (!ids.has(id)) { r.stop(); this.runners.delete(id); this.codeHash.delete(id); }
  }

  setPowered(on: boolean) {
    this.sim.powered = on;
    if (!on) for (const r of this.runners.values()) r.stop();
    if (!on) this.codeHash.clear();
  }

  /** Force a re-flash of a board's code on the next frame. */
  reflash(id: string) { this.codeHash.delete(id); this.runners.get(id)?.stop(); }

  private boardPowered(id: string, kind: 'uno' | 'esp32' | 'pico', usb: boolean) {
    if (!this.sim.powered || this.damaged.includes(id)) return false;
    if (usb) return true;
    const info = boardInfo(kind);
    const v = this.sim.nodeVoltage(key(id, info.rails[0][0])) - this.sim.nodeVoltage(key(id, info.gnd));
    return v > info.vlogic * 0.8;
  }

  private syncRunners() {
    for (const c of this.project.components) {
      const def = getDef(c.type);
      if (!def.mcu) continue;
      const file = this.project.code[c.id];
      const on = this.boardPowered(c.id, def.mcu, !!c.props.usb) && !!file?.source.trim();
      let r = this.runners.get(c.id);
      if (!r) {
        const id = c.id;
        const gnd = boardInfo(def.mcu).gnd;
        r = new McuRunner(id, def.mcu, {
          now: () => this.sim.t,
          readVoltage: (pin) => this.sim.nodeVoltage(key(id, pin)) - this.sim.nodeVoltage(key(id, gnd)),
        });
        this.runners.set(id, r);
      }
      const hash = on ? `${file!.lang}:${file!.source}` : '';
      if (hash !== (this.codeHash.get(c.id) ?? '')) {
        this.codeHash.set(c.id, hash);
        if (on) void r.start(file!); else r.stop();
      }
    }
  }

  async frame(realDt: number): Promise<FrameResult> {
    if (this.busy) throw new Error('frame re-entered');
    this.busy = true;
    try {
      this.syncRunners();
      await macrotask();
      const dynamic = this.sim.hasDynamics || this.runners.size > 0;
      const span = Math.min(realDt, 0.05) * this.speed;
      const target = this.sim.t + span;
      let result: SimResult | undefined;
      const burnt: Record<string, string> = {};
      let converged = true;
      for (let guard = 0; guard < 400 && this.sim.t < target - 1e-9; guard++) {
        let wake = Infinity;
        for (const r of this.runners.values()) wake = Math.min(wake, r.wakeAt);
        const until = Math.min(target, Math.max(wake, this.sim.t + 1e-5));
        const dt = until - this.sim.t;
        const steps = dynamic ? Math.min(50, Math.max(1, Math.ceil(dt / 0.001))) : 1;
        result = this.sim.advance(dt, steps);
        converged &&= result.converged;
        Object.assign(burnt, result.burnt);
        if (Object.keys(result.burnt).length) break;
        let woke = false;
        for (const r of this.runners.values()) if (r.wakeAt <= this.sim.t + 1e-9) { r.wake(); woke = true; }
        if (woke) await macrotask();
      }
      if (!result) result = this.sim.advance(1e-4);
      return { ...result, burnt, converged, periph: this.peripherals(result.out), serial: this.serialState() };
    } finally {
      this.busy = false;
    }
  }

  private serialState() {
    const out: FrameResult['serial'] = {};
    for (const [id, r] of this.runners) out[id] = { lines: r.serial, error: r.error, warnings: r.warnings, running: r.running };
    return out;
  }

  private peripherals(out: SimResult['out']): Peripherals {
    const p: Peripherals = { angle: {}, oled: {}, tone: {}, builtinLed: {} };
    const net = (c: string, pin: string) => this.sim.netOf(key(c, pin));
    for (const [id, r] of this.runners) {
      const led = r.pins.get(`${r.kind === 'uno' ? 'D13' : r.kind === 'esp32' ? 'G2' : 'GP25'}`);
      p.builtinLed[id] = !!r.running && !!led && led.mode === 'output' && led.level > 0.3;
    }
    for (const c of this.project.components) {
      if (this.damaged.includes(c.id)) continue;
      const vdiff = (a: string, b: string) => this.sim.nodeVoltage(key(c.id, a)) - this.sim.nodeVoltage(key(c.id, b));
      if (c.type === 'servo' && vdiff('VCC', 'GND') > 4) {
        for (const r of this.runners.values()) for (const [pin, ang] of r.servos) if (net(r.compId, pin) === net(c.id, 'SIG')) p.angle[c.id] = ang;
      }
      if (c.type === 'oled' && vdiff('VCC', 'GND') > 2.8) {
        for (const r of this.runners.values()) {
          const [sda, scl] = I2C_PINS[r.kind];
          if (r.running && net(r.compId, sda) === net(c.id, 'SDA') && net(r.compId, scl) === net(c.id, 'SCL')) p.oled[c.id] = r.oled;
        }
      }
      if (c.type === 'buzzer' || c.type === 'speaker') {
        // Prefer a tone pin wired straight to the part; otherwise, if current flows
        // through it (e.g. via a series resistor), it plays whatever tone is active.
        let fallback = 0;
        for (const r of this.runners.values()) for (const [pin, f] of r.tones) {
          const n = net(r.compId, pin);
          if (n === net(c.id, '+') || n === net(c.id, '-')) p.tone[c.id] = f;
          else fallback ||= f;
        }
        if (!p.tone[c.id] && fallback && Math.abs(Number(out[c.id]?.i ?? 0)) > 1e-3) p.tone[c.id] = fallback;
      }
    }
    return p;
  }

  stopAll() { for (const r of this.runners.values()) r.stop(); this.codeHash.clear(); }
}
