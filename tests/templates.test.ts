import { describe, expect, it } from 'vitest';
import { TEMPLATES } from '@/lib/templates';
import { Controller } from '@/sim/controller';

async function run(name: string, seconds: number, mutate?: (p: ReturnType<(typeof TEMPLATES)[number]['make']>) => void) {
  const p = TEMPLATES.find((t) => t.name === name)!.make();
  mutate?.(p);
  const ctl = new Controller(p);
  ctl.load(p, []);
  const frames = [];
  const burnt: Record<string, string> = {};
  for (let t = 0; t < seconds; t += 0.02) {
    const f = await ctl.frame(0.02);
    Object.assign(burnt, f.burnt);
    frames.push(f);
  }
  ctl.stopAll();
  return { frames, burnt, last: frames[frames.length - 1] };
}

describe('templates', () => {
  it('every template has valid wiring', () => {
    for (const t of TEMPLATES) {
      const p = t.make();
      const ids = new Set(p.components.map((c) => c.id));
      for (const w of p.wires) { expect(ids.has(w.a.c), `${t.name} ${w.a.c}`).toBe(true); expect(ids.has(w.b.c), `${t.name} ${w.b.c}`).toBe(true); }
    }
  });
  it('LED + resistor lights', async () => {
    const { last, burnt } = await run('LED + resistor', 0.1);
    expect(Number(last.out.d1.brightness)).toBeGreaterThan(0.5);
    expect(burnt).toEqual({});
  });
  it('breadboard LED lights through the strips', async () => {
    const { last } = await run('Breadboard LED', 0.1);
    expect(Number(last.out.d1.brightness)).toBeGreaterThan(0.5);
  });
  it('burns the LED when the switch closes', async () => {
    const { burnt } = await run('Burn an LED', 0.5, (p) => { p.components.find((c) => c.id === 'sw1')!.props.on = true; });
    expect(Object.keys(burnt)).toContain('d1');
  });
  it('charges the RC with tau ≈ 1 s', async () => {
    const { frames } = await run('RC charging', 1.2, (p) => { p.components.find((c) => c.id === 'sw1')!.props.on = true; });
    const at1 = frames.find((f) => f.t >= 1)!;
    expect(Number(at1.out.os1.v)).toBeGreaterThan(2.8);
    expect(Number(at1.out.os1.v)).toBeLessThan(3.6);
  });
  it('blinks the Arduino LED', async () => {
    const { frames } = await run('Blink', 1.5);
    const b = frames.map((f) => Number(f.out.d1.brightness) > 0.3);
    expect(b.includes(true) && b.includes(false)).toBe(true);
  });
  it('the relay switches the lamp', async () => {
    const { frames, burnt } = await run('Relay lamp', 1.5);
    expect(burnt).toEqual({});
    const lit = frames.map((f) => Number(f.out.lp1.brightness) > 0.5);
    expect(lit.includes(true) && lit.includes(false)).toBe(true);
  });
  it('motor spins when the button is pressed', async () => {
    const { last, burnt } = await run('Transistor motor', 0.3, (p) => { p.components.find((c) => c.id === 'sw1')!.props.pressed = true; });
    expect(burnt).toEqual({});
    expect(Number(last.out.m1.speed)).toBeGreaterThan(0.3);
  });
  it('OLED shows text', async () => {
    const { last } = await run('OLED', 0.3);
    expect(last.periph.oled.ds1?.some((o) => o.k === 'text' && o.s === 'Hello!')).toBe(true);
  });
  it('servo follows the knob', async () => {
    const { last } = await run('Servo knob', 0.3, (p) => { p.components.find((c) => c.id === 'rv1')!.props.position = 100; });
    expect(last.periph.angle.s1).toBeGreaterThan(170);
  });
  it('melody drives the speaker', async () => {
    const { frames } = await run('Melody', 0.5);
    expect(frames.some((f) => (f.periph.tone.ls1 ?? 0) > 200)).toBe(true);
  });
});
