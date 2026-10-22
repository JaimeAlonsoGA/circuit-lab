import { describe, expect, it } from 'vitest';
import { transpile } from '@/runtime/transpile';

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

describe('Arduino transpiler', () => {
  it('converts blink', () => {
    const { js } = transpile(`
#define LED 13
int count = 0; // counter
void setup() { pinMode(LED, OUTPUT); }
void loop() {
  digitalWrite(LED, HIGH); delay(500);
  digitalWrite(LED, LOW); delay(500);
  count++;
}`, 'arduino');
    expect(js).toContain('const LED = 13;');
    expect(js).toContain('let count = 0;');
    expect(js).toContain('async function setup()');
    expect(js).toContain('await delay(500)');
  });

  it('produces runnable code with arrays, params, casts and for loops', async () => {
    const { js } = transpile(`
const int pins[] = {2, 3, 4};
unsigned long total = 0;
float avg(int a, int b) { return (a + b) / 2.0f; }
int sumAll() {
  int s = 0;
  for (int i = 0; i < sizeof(pins) / sizeof(pins[0]); i++) { s += pins[i]; }
  return s;
}
String label = "a{b}";
void setup() { total = sumAll() + (int)avg(4, 6); }`, 'arduino');
    const fn = new AsyncFunction('__guard', '__yield', 'delay', js + '\nawait setup(); return { total, label };');
    const r = await fn(() => false, async () => {}, async () => {});
    expect(r.total).toBe(14);
    expect(r.label).toBe('a{b}');
  });

  it('handles library objects and 2D arrays', () => {
    const { js } = transpile('Servo s;\nAdafruit_SSD1306 display(128, 64, &Wire, -1);\nbyte grid[2][3];', 'arduino');
    expect(js).toContain('let s = new Servo();');
    expect(js).toContain('let display = new SSD1306();');
    expect(js).toContain('Array.from({length: 2}');
  });

  it('guards infinite loops', () => {
    const { js } = transpile('void loop(){ while (digitalRead(2) == HIGH) { } }', 'arduino');
    expect(js).toContain('if (__guard()) await __yield();');
  });

  it('awaits user functions in JS mode', () => {
    const { js } = transpile('function blink(){ delay(1) }\nfunction loop(){ blink() }', 'js');
    expect(js).toContain('await blink()');
    expect(js).toContain('async function blink()');
  });
});
