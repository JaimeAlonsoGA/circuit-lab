import type { CodeFile, McuKind } from '@/lib/types';
import type { McuPinState } from '@/sim/models';
import { boardInfo } from '@/sim/models';
import { transpile } from './transpile';

export type DrawOp =
  | { k: 'text'; x: number; y: number; s: string; size: number }
  | { k: 'rect'; x: number; y: number; w: number; h: number; fill: boolean }
  | { k: 'line'; x1: number; y1: number; x2: number; y2: number }
  | { k: 'circle'; x: number; y: number; r: number; fill: boolean }
  | { k: 'px'; x: number; y: number };

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (...args: string[]) => (...a: unknown[]) => Promise<unknown>;

/** Map an Arduino pin number to the board's pin name. */
export function pinName(kind: McuKind, n: number | string): string {
  if (typeof n === 'string') return n;
  if (kind === 'uno') return n >= 14 && n <= 19 ? `A${n - 14}` : `D${n}`;
  if (kind === 'esp32') return `G${n}`;
  return `GP${n}`;
}
export const BUILTIN_LED: Record<McuKind, number> = { uno: 13, esp32: 2, pico: 25 };
export const I2C_PINS: Record<McuKind, [string, string]> = { uno: ['A4', 'A5'], esp32: ['G21', 'G22'], pico: ['GP4', 'GP5'] };

export interface RunnerHost {
  now(): number; // simulation seconds
  readVoltage(pin: string): number;
}

/** Runs one board's sketch against simulated time. `delay()` suspends until the simulator reaches the wake time. */
export class McuRunner {
  pins = new Map<string, McuPinState>();
  serial: string[] = [];
  error: string | null = null;
  warnings: string[] = [];
  running = false;
  wakeAt = Infinity;
  servos = new Map<string, number>();
  tones = new Map<string, number>();
  oled: DrawOp[] = [];
  private oledDraft: DrawOp[] = [];
  private waiter: (() => void) | null = null;
  private generation = 0;
  private guardCount = 0;

  constructor(public compId: string, public kind: McuKind, private host: RunnerHost) {}

  private log(s: string) {
    const last = this.serial.length - 1;
    if (last >= 0 && !this.serial[last].endsWith('\n')) this.serial[last] += s; else this.serial.push(s);
    if (this.serial.length > 400) this.serial.splice(0, this.serial.length - 400);
  }

  sleep(ms: number): Promise<void> {
    const gen = this.generation;
    return new Promise((resolve, reject) => {
      this.wakeAt = this.host.now() + Math.max(0, ms) / 1000;
      this.waiter = () => (gen === this.generation ? resolve() : reject(new Error('stopped')));
    });
  }

  /** Called by the scheduler once simulated time has reached `wakeAt`. */
  wake() {
    const w = this.waiter;
    this.waiter = null;
    this.wakeAt = Infinity;
    w?.();
  }

  stop() {
    this.generation++;
    this.running = false;
    const w = this.waiter;
    this.waiter = null;
    this.wakeAt = Infinity;
    this.pins.clear();
    this.servos.clear();
    this.tones.clear();
    this.oled = [];
    w?.();
  }

  private api() {
    const kind = this.kind;
    const info = boardInfo(kind);
    const pn = (p: number | string) => pinName(kind, p);
    const setPin = (p: number | string, s: Partial<McuPinState>) => {
      const name = pn(p);
      const cur = this.pins.get(name) ?? { mode: 'input', level: 0 };
      this.pins.set(name, { ...cur, ...s });
    };
    const runner = this; // eslint-disable-line @typescript-eslint/no-this-alias -- captured by the generated program's API closures
    class Servo {
      pin = '';
      angle = 90;
      attach(p: number) { this.pin = pn(p); runner.servos.set(this.pin, this.angle); setPin(p, { mode: 'output', level: 0.075 }); return 1; }
      write(a: number) { this.angle = Math.max(0, Math.min(180, a)); if (this.pin) runner.servos.set(this.pin, this.angle); }
      writeMicroseconds(us: number) { this.write(((us - 1000) / 1000) * 180); }
      read() { return this.angle; }
      attached() { return !!this.pin; }
      detach() { runner.servos.delete(this.pin); this.pin = ''; }
    }
    class SSD1306 {
      cx = 0; cy = 0; size = 1;
      begin() { return true; }
      clearDisplay() { runner.oledDraft = []; this.cx = 0; this.cy = 0; }
      display() { runner.oled = [...runner.oledDraft]; }
      setTextSize(s: number) { this.size = s; }
      setTextColor() {}
      setCursor(x: number, y: number) { this.cx = x; this.cy = y; }
      print(v: unknown) { const s = String(v); runner.oledDraft.push({ k: 'text', x: this.cx, y: this.cy, s, size: this.size }); this.cx += s.length * 6 * this.size; }
      println(v: unknown = '') { this.print(v); this.cx = 0; this.cy += 8 * this.size; }
      drawPixel(x: number, y: number) { runner.oledDraft.push({ k: 'px', x, y }); }
      drawLine(x1: number, y1: number, x2: number, y2: number) { runner.oledDraft.push({ k: 'line', x1, y1, x2, y2 }); }
      drawRect(x: number, y: number, w: number, h: number) { runner.oledDraft.push({ k: 'rect', x, y, w, h, fill: false }); }
      fillRect(x: number, y: number, w: number, h: number) { runner.oledDraft.push({ k: 'rect', x, y, w, h, fill: true }); }
      drawCircle(x: number, y: number, r: number) { runner.oledDraft.push({ k: 'circle', x, y, r, fill: false }); }
      fillCircle(x: number, y: number, r: number) { runner.oledDraft.push({ k: 'circle', x, y, r, fill: true }); }
    }
    const fmt = (v: unknown, base?: number) => (typeof v === 'number' && base && base !== 10 ? Math.trunc(v).toString(base).toUpperCase() : typeof v === 'number' && !Number.isInteger(v) ? v.toFixed(base ?? 2) : String(v));
    const Serial = {
      begin() {}, end() {}, available: () => 0, read: () => -1, flush() {},
      print: (v: unknown, b?: number) => runner.log(fmt(v, b)),
      println: (v: unknown = '', b?: number) => runner.log(fmt(v, b) + '\n'),
      write: (v: unknown) => runner.log(typeof v === 'number' ? String.fromCharCode(v) : String(v)),
      printf: (f: string, ...a: unknown[]) => { let k = 0; runner.log(f.replace(/%[-0-9.]*[dfsuxc]/g, () => String(a[k++]))); },
    };
    const analogMax = kind === 'esp32' ? 4095 : 1023;
    const api: Record<string, unknown> = {
      HIGH: 1, LOW: 0, INPUT: 0, OUTPUT: 1, INPUT_PULLUP: 2, LED_BUILTIN: BUILTIN_LED[kind], true: true, false: false,
      A0: 14, A1: 15, A2: 16, A3: 17, A4: 18, A5: 19, DEC: 10, HEX: 16, BIN: 2, OCT: 8, PI: Math.PI,
      SSD1306_SWITCHCAPVCC: 2, SSD1306_WHITE: 1, WHITE: 1, BLACK: 0,
      pinMode: (p: number, m: number) => setPin(p, { mode: m === 1 ? 'output' : m === 2 ? 'pullup' : 'input', level: 0 }),
      digitalWrite: (p: number, v: number) => {
        const name = pn(p); const cur = this.pins.get(name);
        if (cur && cur.mode !== 'output') { setPin(p, { mode: v ? 'pullup' : 'input' }); return; }
        setPin(p, { mode: 'output', level: v ? 1 : 0 });
      },
      digitalRead: (p: number) => (this.host.readVoltage(pn(p)) > info.vlogic * 0.5 ? 1 : 0),
      analogRead: (p: number) => Math.round(Math.max(0, Math.min(1, this.host.readVoltage(pn(p < 14 && kind === 'uno' ? p + 14 : p)) / info.vlogic)) * analogMax),
      analogWrite: (p: number, v: number) => setPin(p, { mode: 'output', level: Math.max(0, Math.min(255, v)) / 255 }),
      analogReadResolution() {},
      tone: (p: number, f: number, d?: number) => {
        this.tones.set(pn(p), f); setPin(p, { mode: 'output', level: 0.5 });
        if (d) { const at = this.host.now() + d / 1000; const gen = this.generation; const chk = () => { if (gen !== this.generation) return; if (this.host.now() >= at) { this.tones.delete(pn(p)); setPin(p, { level: 0 }); } else setTimeout(chk, 10); }; setTimeout(chk, 10); }
      },
      noTone: (p: number) => { this.tones.delete(pn(p)); setPin(p, { level: 0 }); },
      delay: (ms: number) => this.sleep(ms),
      delayMicroseconds: (us: number) => this.sleep(us / 1000),
      millis: () => Math.floor(this.host.now() * 1000),
      micros: () => Math.floor(this.host.now() * 1e6),
      map: (x: number, a: number, b: number, c: number, d: number) => Math.trunc(((x - a) * (d - c)) / (b - a) + c),
      constrain: (x: number, a: number, b: number) => Math.min(b, Math.max(a, x)),
      random: (a: number, b?: number) => (b === undefined ? Math.floor(Math.random() * a) : Math.floor(a + Math.random() * (b - a))),
      randomSeed() {}, abs: Math.abs, min: Math.min, max: Math.max, pow: Math.pow, sqrt: Math.sqrt, sq: (x: number) => x * x,
      sin: Math.sin, cos: Math.cos, tan: Math.tan, floor: Math.floor, ceil: Math.ceil, round: Math.round,
      bitRead: (v: number, b: number) => (v >> b) & 1, bitSet: (v: number, b: number) => v | (1 << b), bitClear: (v: number, b: number) => v & ~(1 << b),
      highByte: (v: number) => (v >> 8) & 0xff, lowByte: (v: number) => v & 0xff,
      __int: (v: number) => Math.trunc(Number(v)), __sizeof: (v: unknown) => (Array.isArray(v) ? v.length : 4),
      __guard: () => (++this.guardCount % 2000 === 0), __yield: () => this.sleep(1),
      Serial, Servo, SSD1306, Wire: { begin() {} }, console: { log: (...a: unknown[]) => runner.log(a.join(' ') + '\n') },
    };
    return api;
  }

  async start(file: CodeFile) {
    this.stop();
    this.error = null;
    this.serial = [];
    const gen = this.generation;
    const { js, warnings } = transpile(file.source, file.lang);
    this.warnings = warnings;
    const api = this.api();
    const names = Object.keys(api).filter((k) => k !== 'true' && k !== 'false');
    let prog: { setup?: () => Promise<void>; loop?: () => Promise<void> };
    try {
      const fn = new AsyncFunction(...names, `"use strict";\n${js}\nreturn { setup: typeof setup === 'function' ? setup : undefined, loop: typeof loop === 'function' ? loop : undefined };`);
      prog = (await fn(...names.map((n) => api[n]))) as typeof prog;
    } catch (e) {
      this.error = `Compile error: ${(e as Error).message}`;
      return;
    }
    this.running = true;
    try {
      await prog.setup?.();
      while (gen === this.generation) {
        if (!prog.loop) { await this.sleep(1000); continue; }
        await prog.loop();
        await this.sleep(1); // each loop() pass costs ~1ms of simulated time
      }
    } catch (e) {
      if (gen === this.generation && (e as Error).message !== 'stopped') {
        this.error = `Runtime error: ${(e as Error).message}`;
        this.running = false;
      }
    }
  }
}

/** Resolve all pending microtasks by yielding one macrotask. */
export const macrotask = () => new Promise<void>((r) => {
  if (typeof MessageChannel !== 'undefined') { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); } else setTimeout(r, 0);
});
