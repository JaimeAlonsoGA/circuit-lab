import { describe, expect, it } from 'vitest';
import { Simulator } from '@/sim/engine';
import { proj } from './helpers';

describe('MNA simulator', () => {
  it('solves a voltage divider', () => {
    const p = proj([['b', 'battery9v', { rint: 0.001 }], ['r1', 'resistor', { resistance: 1000 }], ['r2', 'resistor', { resistance: 2000 }]],
      [['b:+', 'r1:a'], ['r1:b', 'r2:a'], ['r2:b', 'b:-']]);
    const r = new Simulator(p).advance(0.01);
    expect(r.converged).toBe(true);
    expect(r.v['r1:b']).toBeCloseTo(6, 2);
    expect(r.i['r1:a']).toBeCloseTo(0.003, 5);
  });

  it('lights an LED with a series resistor at a sane current', () => {
    const p = proj([['b', 'battery9v'], ['r', 'resistor', { resistance: 470 }], ['d', 'led', { color: 'red' }]],
      [['b:+', 'r:a'], ['r:b', 'd:A'], ['d:K', 'b:-']]);
    const sim = new Simulator(p);
    const r = sim.advance(0.1, 10);
    const i = r.i['d:A'];
    expect(i).toBeGreaterThan(0.012);
    expect(i).toBeLessThan(0.017);
    expect(r.out.d.brightness as number).toBeGreaterThan(0.8);
    expect(Object.keys(r.burnt)).toHaveLength(0);
  });

  it('burns an LED connected straight to 9V', () => {
    const p = proj([['b', 'battery9v'], ['d', 'led']], [['b:+', 'd:A'], ['d:K', 'b:-']]);
    const sim = new Simulator(p);
    let burnt: Record<string, string> = {};
    for (let k = 0; k < 20 && !burnt.d; k++) burnt = sim.advance(0.02, 4).burnt;
    expect(burnt.d).toMatch(/LED/);
  });

  it('charges an RC network with the right time constant', () => {
    const p = proj([['b', 'battery9v', { rint: 0.001 }], ['r', 'resistor', { resistance: 1000 }], ['c', 'capacitor', { capacitance: 100e-6 }]],
      [['b:+', 'r:a'], ['r:b', 'c:a'], ['c:b', 'b:-']]);
    const sim = new Simulator(p);
    const r = sim.advance(0.1, 200); // one tau
    expect(r.v['c:a']).toBeGreaterThan(9 * 0.6);
    expect(r.v['c:a']).toBeLessThan(9 * 0.66);
  });

  it('pops a reversed electrolytic capacitor', () => {
    const p = proj([['b', 'battery9v'], ['c', 'electrolytic']], [['b:+', 'c:-'], ['c:+', 'b:-']]);
    const sim = new Simulator(p);
    let burnt: Record<string, string> = {};
    for (let k = 0; k < 10 && !burnt.c; k++) burnt = sim.advance(0.01, 5).burnt;
    expect(burnt.c).toMatch(/backwards/);
  });

  it('switches a motor with an NPN transistor', () => {
    const p = proj([
      ['b', 'battery9v', { rint: 0.1 }], ['rb', 'resistor', { resistance: 1000 }], ['q', 'npn'], ['m', 'motor'], ['sw', 'switch', { on: true }],
    ], [['b:+', 'sw:a'], ['sw:b', 'rb:a'], ['rb:b', 'q:B'], ['q:E', 'b:-'], ['b:+', 'm:+'], ['m:-', 'q:C']]);
    const sim = new Simulator(p);
    const on = sim.advance(0.05, 5);
    expect(on.converged).toBe(true);
    expect(on.i['m:+']).toBeGreaterThan(0.9);
    p.components[4].props.on = false;
    sim.load(p, []);
    const off = sim.advance(0.05, 5);
    expect(Math.abs(off.i['m:+'])).toBeLessThan(1e-3);
  });

  it('respects the global power switch', () => {
    const p = proj([['b', 'battery9v'], ['r', 'resistor', { resistance: 1000 }]], [['b:+', 'r:a'], ['r:b', 'b:-']]);
    const sim = new Simulator(p);
    sim.powered = false;
    expect(Math.abs(sim.advance(0.01).i['r:a'])).toBeLessThan(1e-6);
  });

  it('energises a relay and closes its contact', () => {
    const p = proj([['b', 'battery9v', { voltage: 5, rint: 0.1 }], ['k', 'relay'], ['l', 'lamp', { vrated: 5 }]],
      [['b:+', 'k:C1'], ['k:C2', 'b:-'], ['b:+', 'k:COM'], ['k:NO', 'l:a'], ['l:b', 'b:-']]);
    const sim = new Simulator(p);
    sim.advance(0.01, 2);
    const r = sim.advance(0.01, 2);
    expect(r.out.k.closed).toBe(true);
    expect(r.out.l.brightness as number).toBeGreaterThan(0.8);
  });

  it('measures with a multimeter and a zener regulates', () => {
    const p = proj([['b', 'battery9v', { rint: 0.01 }], ['r', 'resistor', { resistance: 330 }], ['z', 'zener', { vz: 5.1 }], ['m', 'voltmeter']],
      [['b:+', 'r:a'], ['r:b', 'z:K'], ['z:A', 'b:-'], ['m:V', 'z:K'], ['m:COM', 'b:-']]);
    const r = new Simulator(p).advance(0.01);
    expect(r.out.m.reading as number).toBeGreaterThan(5.0);
    expect(r.out.m.reading as number).toBeLessThan(5.5);
  });
});
