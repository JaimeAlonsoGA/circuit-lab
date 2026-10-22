import { describe, expect, it } from 'vitest';
import { Controller } from '@/sim/controller';
import { proj } from './helpers';

describe('microcontroller runtime', () => {
  it('blinks an LED from an Arduino sketch in simulated time', async () => {
    const p = proj([['u', 'uno'], ['r', 'resistor', { resistance: 220 }], ['d', 'led']], [['u:D13', 'r:a'], ['r:b', 'd:A'], ['d:K', 'u:GND']]);
    p.code.u = { lang: 'arduino', source: 'void setup(){ pinMode(13, OUTPUT); Serial.begin(9600); }\nvoid loop(){ digitalWrite(13, HIGH); Serial.println("on"); delay(100); digitalWrite(13, LOW); delay(100); }' };
    const ctl = new Controller(p);
    ctl.load(p, []);
    const seen = new Set<boolean>();
    for (let k = 0; k < 30; k++) {
      const r = await ctl.frame(0.02);
      seen.add((r.out.d.brightness as number) > 0.5);
    }
    expect(seen.has(true)).toBe(true);
    expect(seen.has(false)).toBe(true);
    const r = await ctl.frame(0.02);
    expect(r.serial.u.error).toBeNull();
    expect(r.serial.u.lines.join('')).toContain('on');
    ctl.stopAll();
  });

  it('reads a button with INPUT_PULLUP and drives a servo', async () => {
    const p = proj([['u', 'uno'], ['b', 'button', { pressed: true }], ['s', 'servo']],
      [['u:D2', 'b:a'], ['b:b', 'u:GND'], ['s:SIG', 'u:D9'], ['s:VCC', 'u:5V'], ['s:GND', 'u:GND2']]);
    p.code.u = { lang: 'arduino', source: '#include <Servo.h>\nServo s;\nvoid setup(){ pinMode(2, INPUT_PULLUP); s.attach(9); }\nvoid loop(){ if (digitalRead(2) == LOW) { s.write(150); } else { s.write(30); } delay(10); }' };
    const ctl = new Controller(p);
    ctl.load(p, []);
    let r = await ctl.frame(0.02);
    for (let k = 0; k < 5; k++) r = await ctl.frame(0.02);
    expect(r.periph.angle.s).toBe(150);
    ctl.stopAll();
  });

  it('reports compile errors', async () => {
    const p = proj([['u', 'uno']], []);
    p.code.u = { lang: 'js', source: 'function loop( {' };
    const ctl = new Controller(p);
    ctl.load(p, []);
    await ctl.frame(0.02);
    const r = await ctl.frame(0.02);
    expect(r.serial.u.error).toMatch(/Compile error/);
  });
});
