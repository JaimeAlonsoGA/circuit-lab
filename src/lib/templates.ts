import { defaultProps } from './catalog';
import { EXAMPLES } from './examples';
import type { CompInst, Project, PropValue, Rotation } from './types';

type C = [id: string, type: string, x: number, y: number, props?: Record<string, PropValue>, rot?: Rotation];
type W = [a: string, b: string, color?: string];

function build(name: string, comps: C[], wires: W[], code: Record<string, string> = {}): Project {
  const components: CompInst[] = comps.map(([id, type, x, y, props, rot]) => ({ id, type, x, y, rot: rot ?? 0, props: { ...defaultProps(type), ...props } }));
  const ref = (s: string) => { const i = s.indexOf(':'); return { c: s.slice(0, i), p: s.slice(i + 1) }; };
  const palette = ['#ff4d6d', '#ffd166', '#06d6a0', '#4cc9f0', '#c77dff', '#ff9f1c'];
  return {
    version: 1, name, components,
    wires: wires.map(([a, b, color], i) => ({ id: `w${i + 1}`, a: ref(a), b: ref(b), color: color ?? palette[i % palette.length] })),
    code: Object.fromEntries(Object.entries(code).map(([id, ex]) => { const e = EXAMPLES.find((x) => x.name === ex)!; return [id, { lang: e.lang, source: e.source }]; })),
  };
}
const BLACK = '#3a3f58';

export interface Template { name: string; emoji: string; make: () => Project }

export const TEMPLATES: Template[] = [
  { name: 'LED + resistor', emoji: '💡', make: () => build('LED + resistor',
    [['bt1', 'battery9v', -160, 40], ['r1', 'resistor', -20, -100, { resistance: 470 }], ['d1', 'led', 120, -40]],
    [['bt1:+', 'r1:a'], ['r1:b', 'd1:A', '#ffd166'], ['d1:K', 'bt1:-', BLACK]]) },
  { name: 'Burn an LED', emoji: '🔥', make: () => build('No resistor!',
    [['bt1', 'battery9v', -120, 40], ['d1', 'led', 60, -40, { color: 'blue' }], ['sw1', 'switch', -20, -120]],
    [['bt1:+', 'sw1:a'], ['sw1:b', 'd1:A', '#ffd166'], ['d1:K', 'bt1:-', BLACK]]) },
  { name: 'Breadboard LED', emoji: '🧩', make: () => build('Breadboard LED',
    [['bb1', 'breadboard', 5, 0], ['bt1', 'battery9v', -230, -130], ['d1', 'led', -60, -40, { color: 'green' }], ['r1', 'resistor', -10, -30, { resistance: 330 }]],
    [['bt1:+', 'bb1:tp1'], ['bt1:-', 'bb1:tn1', BLACK], ['bb1:a5', 'bb1:tp5'], ['bb1:a15', 'bb1:tn15', BLACK]]) },
  { name: 'Blink', emoji: '⏱️', make: () => build('Arduino Blink',
    [['a1', 'uno', 0, 60], ['r1', 'resistor', -60, -110, { resistance: 220 }], ['d1', 'led', 70, -150, { color: 'yellow' }]],
    [['a1:D13', 'r1:a'], ['r1:b', 'd1:A', '#ffd166'], ['d1:K', 'a1:GND', BLACK]], { a1: 'Blink' }) },
  { name: 'Transistor motor', emoji: '🌀', make: () => build('Transistor motor switch',
    [['bt1', 'battery9v', -220, 40], ['m1', 'motor', 60, -130], ['q1', 'npn', 60, 40], ['r1', 'resistor', -80, 60, { resistance: 1000 }], ['sw1', 'button', -130, -80], ['d1', 'diode', 160, -80, {}, 270]],
    [['bt1:+', 'm1:+'], ['m1:-', 'q1:C', '#ffd166'], ['q1:E', 'bt1:-', BLACK], ['bt1:+', 'sw1:a'], ['sw1:b', 'r1:a', '#06d6a0'], ['r1:b', 'q1:B', '#06d6a0'], ['d1:K', 'm1:+'], ['d1:A', 'm1:-', '#ffd166']]) },
  { name: 'RC charging', emoji: '📈', make: () => build('RC charging curve',
    [['ps1', 'supply', -220, 20, { voltage: 5 }], ['sw1', 'switch', -100, -100], ['r1', 'resistor', 20, -100, { resistance: 10000 }], ['c1', 'electrolytic', 120, -20, { capacitance: 100e-6 }], ['os1', 'scope', 260, 0], ['g1', 'ground', -180, 120]],
    [['ps1:+', 'sw1:a'], ['sw1:b', 'r1:a'], ['r1:b', 'c1:+', '#ffd166'], ['c1:-', 'ps1:-', BLACK], ['c1:+', 'os1:CH', '#06d6a0'], ['os1:GND', 'c1:-', BLACK], ['ps1:-', 'g1:g', BLACK]]) },
  { name: 'Servo knob', emoji: '🦾', make: () => build('Servo knob',
    [['a1', 'uno', 0, 0], ['rv1', 'potentiometer', 40, 190], ['s1', 'servo', 240, -60]],
    [['rv1:a', 'a1:5V'], ['rv1:b', 'a1:GND2', BLACK], ['rv1:w', 'a1:A0', '#06d6a0'], ['s1:SIG', 'a1:D9', '#ffd166'], ['s1:VCC', 'a1:5V'], ['s1:GND', 'a1:GND', BLACK]], { a1: 'Servo knob' }) },
  { name: 'OLED', emoji: '🖥️', make: () => build('OLED hello',
    [['a1', 'uno', 0, 0], ['ds1', 'oled', 260, 40]],
    [['ds1:VCC', 'a1:5V'], ['ds1:GND', 'a1:GND3', BLACK], ['ds1:SDA', 'a1:A4', '#06d6a0'], ['ds1:SCL', 'a1:A5', '#4cc9f0']], { a1: 'OLED hello' }) },
  { name: 'Melody', emoji: '🎵', make: () => build('Melody',
    [['a1', 'uno', 0, 40], ['ls1', 'speaker', 120, -140], ['r1', 'resistor', -40, -140, { resistance: 100 }]],
    [['a1:D8', 'r1:a'], ['r1:b', 'ls1:+', '#ffd166'], ['ls1:-', 'a1:GND', BLACK]], { a1: 'Melody' }) },
  { name: 'Relay lamp', emoji: '🔌', make: () => build('Relay controls a lamp',
    [['a1', 'uno', -80, 100], ['r1', 'resistor', 120, 40, { resistance: 1000 }], ['q1', 'npn', 220, 60], ['k1', 'relay', 200, -120], ['ps1', 'supply', 380, 60, { voltage: 6 }], ['lp1', 'lamp', 380, -160]],
    [['a1:D13', 'r1:a', '#ffd166'], ['r1:b', 'q1:B', '#ffd166'], ['q1:E', 'a1:GND', BLACK], ['q1:C', 'k1:C2', '#06d6a0'], ['k1:C1', 'a1:5V'], ['ps1:+', 'k1:COM'], ['k1:NO', 'lp1:a', '#ff9f1c'], ['lp1:b', 'ps1:-', BLACK]], { a1: 'Blink' }) },
];
