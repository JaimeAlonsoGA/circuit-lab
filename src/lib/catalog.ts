import type { CompDef, PinDef, PropDef } from './types';

const two = (a = 'a', b = 'b', half = 40): PinDef[] => [
  { name: a, x: -half, y: 0 },
  { name: b, x: half, y: 0 },
];
const num = (key: string, label: string, def: number, unit?: string, min?: number, max?: number, step?: number): PropDef => ({
  key, label, kind: 'number', default: def, unit, min, max, step,
});
const range = (key: string, label: string, def: number, min: number, max: number, step: number, unit?: string): PropDef => ({
  key, label, kind: 'range', default: def, min, max, step, unit,
});
const select = (key: string, label: string, options: string[], def?: string): PropDef => ({
  key, label, kind: 'select', default: def ?? options[0], options,
});
const bool = (key: string, label: string, def: boolean): PropDef => ({ key, label, kind: 'bool', default: def });

export const LED_COLORS: Record<string, { vf: number; hex: string }> = {
  red: { vf: 1.8, hex: '#ff2d3d' },
  orange: { vf: 1.9, hex: '#ff8a1f' },
  yellow: { vf: 2.0, hex: '#ffd60a' },
  green: { vf: 2.1, hex: '#2bff6a' },
  blue: { vf: 3.0, hex: '#2f8bff' },
  white: { vf: 3.1, hex: '#f4f7ff' },
  purple: { vf: 3.2, hex: '#b65cff' },
};

/* ---------- board pin layouts ---------- */
const unoTop = ['GND', 'D13', 'D12', 'D11', 'D10', 'D9', 'D8', 'D7', 'D6', 'D5', 'D4', 'D3', 'D2', 'D1', 'D0'];
const unoBottom = ['3V3', '5V', 'GND2', 'GND3', 'VIN', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5'];
const unoPins: PinDef[] = [
  ...unoTop.map((name, i) => ({ name, x: -40 + i * 10, y: -90 })),
  ...unoBottom.map((name, i) => ({ name, x: -60 + i * 10 + (i >= 5 ? 20 : 0), y: 90 })),
];
const espLeft = ['3V3', 'GND', 'G13', 'G12', 'G14', 'G27', 'G26', 'G25', 'G33', 'G32'];
const espRight = ['5V', 'GND2', 'G23', 'G22', 'G21', 'G19', 'G18', 'G5', 'G4', 'G2'];
const espPins: PinDef[] = [
  ...espLeft.map((name, i) => ({ name, x: -70, y: -90 + i * 20 })),
  ...espRight.map((name, i) => ({ name, x: 70, y: -90 + i * 20 })),
];
const picoLeft = ['GP0', 'GP1', 'GND', 'GP2', 'GP3', 'GP4', 'GP5', 'GP6', 'GP7', 'GP8', 'GP9'];
const picoRight = ['VBUS', 'VSYS', 'GND2', '3V3', 'GP28', 'GP27', 'GP26', 'GP22', 'GP21', 'GP20', 'GP19'];
const picoPins: PinDef[] = [
  ...picoLeft.map((name, i) => ({ name, x: -60, y: -100 + i * 20 })),
  ...picoRight.map((name, i) => ({ name, x: 60, y: -100 + i * 20 })),
];

/* ---------- breadboard ---------- */
const BB_COLS = 24;
const bbPins: PinDef[] = [];
const bbBridges: string[][] = [];
{
  const rows = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
  const rowY = [-50, -40, -30, -20, -10, 10, 20, 30, 40, 50];
  for (let c = 1; c <= BB_COLS; c++) {
    const x = -125 + c * 10;
    rows.forEach((r, i) => bbPins.push({ name: `${r}${c}`, x, y: rowY[i] }));
    bbBridges.push(rows.slice(0, 5).map((r) => `${r}${c}`), rows.slice(5).map((r) => `${r}${c}`));
  }
  const rails: [string, number][] = [['tp', -90], ['tn', -80], ['bn', 80], ['bp', 90]];
  for (const [r, y] of rails) {
    const group: string[] = [];
    for (let c = 1; c <= BB_COLS; c++) {
      bbPins.push({ name: `${r}${c}`, x: -125 + c * 10, y });
      group.push(`${r}${c}`);
    }
    bbBridges.push(group);
  }
}

const segPins = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp'];

export const CATALOG: CompDef[] = [
  /* Power */
  { type: 'battery9v', label: '9V battery', category: 'Power', prefix: 'BT', w: 60, h: 80, description: 'Battery, pins + and -.',
    pins: [{ name: '+', x: -10, y: -40 }, { name: '-', x: 10, y: -40 }], props: [num('voltage', 'Voltage', 9, 'V', 0.5, 48, 0.5), num('rint', 'Internal resistance', 1.5, 'Ω', 0.01, 100)] },
  { type: 'batteryAA', label: 'AA cell', category: 'Power', prefix: 'BT', w: 80, h: 30, description: '1.5V AA cell, pins + and -.',
    pins: two('+', '-'), props: [num('voltage', 'Voltage', 1.5, 'V', 0.5, 3, 0.1), num('rint', 'Internal resistance', 0.2, 'Ω', 0.01, 10)] },
  { type: 'coincell', label: 'Coin cell', category: 'Power', prefix: 'BT', w: 40, h: 40, description: 'CR2032 3V cell (high internal resistance), pins + and -.',
    pins: [{ name: '+', x: -20, y: 0 }, { name: '-', x: 20, y: 0 }], props: [num('voltage', 'Voltage', 3, 'V'), num('rint', 'Internal resistance', 15, 'Ω')] },
  { type: 'usb', label: 'USB 5V', category: 'Power', prefix: 'J', w: 60, h: 40, description: 'USB power 5V, pins VBUS and GND.',
    pins: [{ name: 'VBUS', x: 30, y: -10 }, { name: 'GND', x: 30, y: 10 }], props: [num('voltage', 'Voltage', 5, 'V'), num('rint', 'Internal resistance', 0.1, 'Ω'), num('ilimit', 'Current limit', 2, 'A')] },
  { type: 'supply', label: 'Bench supply', category: 'Power', prefix: 'PS', w: 80, h: 60, description: 'Adjustable lab supply, pins + and -.',
    pins: [{ name: '+', x: -20, y: 30 }, { name: '-', x: 20, y: 30 }], props: [range('voltage', 'Voltage', 12, 0, 30, 0.1, 'V'), num('rint', 'Internal resistance', 0.05, 'Ω')] },
  { type: 'solar', label: 'Solar cell', category: 'Power', prefix: 'PV', w: 70, h: 50, description: 'Solar cell, ~0.55V per cell, current depends on light; pins + and -.',
    pins: [{ name: '+', x: -20, y: 30 }, { name: '-', x: 20, y: 30 }], props: [range('light', 'Light', 80, 0, 100, 1, '%'), num('cells', 'Cells in series', 6, '', 1, 36, 1)] },
  { type: 'ground', label: 'Ground', category: 'Power', prefix: 'GND', w: 30, h: 30, description: 'Ground reference (0V), pin g.',
    pins: [{ name: 'g', x: 0, y: -10 }], props: [] },

  /* Passive */
  { type: 'resistor', label: 'Resistor', category: 'Passive', prefix: 'R', w: 80, h: 20, description: 'Resistor, pins a and b.',
    pins: two(), props: [num('resistance', 'Resistance', 220, 'Ω', 0.1, 1e7), num('power', 'Power rating', 0.25, 'W')] },
  { type: 'potentiometer', label: 'Potentiometer', category: 'Passive', prefix: 'RV', w: 60, h: 60, description: 'Potentiometer, pins a, w (wiper), b.',
    pins: [{ name: 'a', x: -20, y: 30 }, { name: 'w', x: 0, y: 30 }, { name: 'b', x: 20, y: 30 }], props: [num('resistance', 'Resistance', 10000, 'Ω'), range('position', 'Position', 50, 0, 100, 1, '%')] },
  { type: 'capacitor', label: 'Ceramic capacitor', category: 'Passive', prefix: 'C', w: 60, h: 40, description: 'Non-polarised capacitor, pins a and b.',
    pins: two('a', 'b', 30), props: [num('capacitance', 'Capacitance', 1e-6, 'F'), num('vmax', 'Voltage rating', 50, 'V')] },
  { type: 'electrolytic', label: 'Electrolytic cap', category: 'Passive', prefix: 'C', w: 60, h: 50, description: 'Polarised capacitor, pins + and -. Pops if reversed or over voltage.',
    pins: two('+', '-', 30), props: [num('capacitance', 'Capacitance', 100e-6, 'F'), num('vmax', 'Voltage rating', 16, 'V')] },
  { type: 'inductor', label: 'Inductor', category: 'Passive', prefix: 'L', w: 80, h: 30, description: 'Inductor, pins a and b.',
    pins: two(), props: [num('inductance', 'Inductance', 10e-3, 'H'), num('rdc', 'DC resistance', 1, 'Ω')] },
  { type: 'fuse', label: 'Fuse', category: 'Passive', prefix: 'F', w: 80, h: 24, description: 'Fuse, blows above its rating; pins a and b.',
    pins: two(), props: [num('rating', 'Rating', 0.5, 'A')] },
  { type: 'ldr', label: 'Photoresistor', category: 'Passive', prefix: 'R', w: 60, h: 40, description: 'Light dependent resistor, resistance falls with light; pins a and b.',
    pins: two('a', 'b', 30), props: [range('light', 'Light', 50, 0, 100, 1, '%')] },
  { type: 'thermistor', label: 'Thermistor (NTC)', category: 'Passive', prefix: 'TH', w: 60, h: 40, description: '10k NTC thermistor; pins a and b.',
    pins: two('a', 'b', 30), props: [range('temp', 'Temperature', 25, -20, 120, 1, '°C')] },

  /* Semiconductors */
  { type: 'diode', label: 'Diode', category: 'Semiconductors', prefix: 'D', w: 80, h: 24, description: '1N4148 diode, pins A (anode) and K (cathode).',
    pins: two('A', 'K'), props: [num('imax', 'Max current', 0.3, 'A')] },
  { type: 'zener', label: 'Zener diode', category: 'Semiconductors', prefix: 'D', w: 80, h: 24, description: 'Zener diode, pins A and K.',
    pins: two('A', 'K'), props: [num('vz', 'Zener voltage', 5.1, 'V'), num('power', 'Power rating', 0.5, 'W')] },
  { type: 'led', label: 'LED', category: 'Semiconductors', prefix: 'D', w: 40, h: 60, description: 'LED, pins A (anode, long leg) and K (cathode). Needs a series resistor; burns above ~30mA.',
    pins: [{ name: 'A', x: -10, y: 30 }, { name: 'K', x: 10, y: 30 }], props: [select('color', 'Color', Object.keys(LED_COLORS)), num('imax', 'Max current', 0.03, 'A')] },
  { type: 'rgbled', label: 'RGB LED', category: 'Semiconductors', prefix: 'D', w: 50, h: 60, description: 'Common cathode RGB LED, pins R, G, B and K.',
    pins: [{ name: 'R', x: -20, y: 30 }, { name: 'K', x: -10 + 0, y: 30 }, { name: 'G', x: 10, y: 30 }, { name: 'B', x: 20, y: 30 }], props: [num('imax', 'Max current per die', 0.03, 'A')] },
  { type: 'npn', label: 'NPN transistor', category: 'Semiconductors', prefix: 'Q', w: 50, h: 60, description: '2N2222 NPN, pins C, B, E.',
    pins: [{ name: 'C', x: -10, y: 30 }, { name: 'B', x: 0, y: 30 }, { name: 'E', x: 10, y: 30 }], props: [num('beta', 'Gain (β)', 150, '', 10, 1000), num('imax', 'Max Ic', 0.8, 'A')] },
  { type: 'pnp', label: 'PNP transistor', category: 'Semiconductors', prefix: 'Q', w: 50, h: 60, description: '2N2907 PNP, pins C, B, E.',
    pins: [{ name: 'C', x: -10, y: 30 }, { name: 'B', x: 0, y: 30 }, { name: 'E', x: 10, y: 30 }], props: [num('beta', 'Gain (β)', 150, '', 10, 1000), num('imax', 'Max Ic', 0.6, 'A')] },
  { type: 'nmos', label: 'N-MOSFET', category: 'Semiconductors', prefix: 'Q', w: 50, h: 70, description: 'Logic-level N-channel MOSFET, pins G, D, S.',
    pins: [{ name: 'G', x: -10, y: 30 }, { name: 'D', x: 0, y: 30 }, { name: 'S', x: 10, y: 30 }], props: [num('vth', 'Threshold', 1.5, 'V'), num('imax', 'Max Id', 10, 'A')] },

  /* Input */
  { type: 'button', label: 'Push button', category: 'Input', prefix: 'SW', w: 50, h: 50, description: 'Momentary push button, pins a and b. Hold to press.',
    pins: two('a', 'b', 30), props: [bool('pressed', 'Pressed', false)] },
  { type: 'switch', label: 'Toggle switch', category: 'Input', prefix: 'SW', w: 60, h: 40, description: 'On/off switch, pins a and b. Click to toggle.',
    pins: two('a', 'b', 30), props: [bool('on', 'On', false)] },
  { type: 'tmp36', label: 'Temp sensor TMP36', category: 'Input', prefix: 'U', w: 40, h: 60, description: 'TMP36 analog temperature sensor, pins VCC, OUT, GND; OUT = 0.5V + 10mV/°C.',
    pins: [{ name: 'VCC', x: -10, y: 30 }, { name: 'OUT', x: 0, y: 30 }, { name: 'GND', x: 10, y: 30 }], props: [range('temp', 'Temperature', 25, -40, 125, 1, '°C')] },
  { type: 'mic', label: 'Microphone module', category: 'Input', prefix: 'MK', w: 50, h: 60, description: 'Analog microphone module, pins VCC, OUT, GND; OUT idles at VCC/2.',
    pins: [{ name: 'VCC', x: -10, y: 30 }, { name: 'OUT', x: 0, y: 30 }, { name: 'GND', x: 10, y: 30 }], props: [range('level', 'Sound level', 30, 0, 100, 1, '%')] },

  /* Output */
  { type: 'buzzer', label: 'Buzzer', category: 'Output', prefix: 'BZ', w: 50, h: 50, description: 'Active buzzer, pins + and -; beeps when powered (or follows tone()).',
    pins: two('+', '-', 30), props: [] },
  { type: 'speaker', label: 'Speaker', category: 'Output', prefix: 'LS', w: 60, h: 60, description: '8Ω speaker, pins + and -; plays tone() frequencies.',
    pins: two('+', '-', 30), props: [num('power', 'Power rating', 0.5, 'W')] },
  { type: 'motor', label: 'DC motor', category: 'Output', prefix: 'M', w: 60, h: 60, description: 'DC motor, pins + and -; ~10Ω, spins proportional to current.',
    pins: two('+', '-', 30), props: [num('imax', 'Stall current limit', 1.5, 'A')] },
  { type: 'servo', label: 'Servo', category: 'Output', prefix: 'M', w: 70, h: 50, description: 'Hobby servo, pins SIG, VCC, GND; driven by Servo.write() from a board.',
    pins: [{ name: 'GND', x: -10, y: 30 }, { name: 'VCC', x: 0, y: 30 }, { name: 'SIG', x: 10, y: 30 }], props: [] },
  { type: 'relay', label: 'Relay', category: 'Output', prefix: 'K', w: 60, h: 60, description: '5V relay, coil pins C1/C2 and contact pins COM/NO (closes when coil energised).',
    pins: [{ name: 'C1', x: -20, y: 30 }, { name: 'C2', x: -10, y: 30 }, { name: 'COM', x: 10, y: 30 }, { name: 'NO', x: 20, y: 30 }], props: [] },
  { type: 'lamp', label: 'Light bulb', category: 'Output', prefix: 'LP', w: 50, h: 60, description: 'Incandescent bulb 6V 0.1A, pins a and b.',
    pins: two('a', 'b', 30), props: [num('vrated', 'Rated voltage', 6, 'V')] },
  { type: 'sevenseg', label: '7-segment display', category: 'Output', prefix: 'DS', w: 60, h: 90, description: 'Common cathode 7-segment: pins a..g, dp, COM.',
    pins: [...segPins.slice(0, 4).map((name, i) => ({ name, x: -15 + i * 10, y: -50 })), ...segPins.slice(4).map((name, i) => ({ name, x: -15 + i * 10, y: 50 })), { name: 'COM', x: 30, y: 0 }],
    props: [select('color', 'Color', Object.keys(LED_COLORS))] },
  { type: 'oled', label: 'OLED 128×64', category: 'Output', prefix: 'DS', w: 100, h: 80, description: 'SSD1306 I2C OLED, pins GND, VCC, SCL, SDA. Drive it with the display object from a board.',
    pins: ['GND', 'VCC', 'SCL', 'SDA'].map((name, i) => ({ name, x: -15 + i * 10, y: -40 })), props: [] },

  /* Boards */
  { type: 'uno', label: 'Arduino Uno', category: 'Boards', prefix: 'A', w: 260, h: 180, mcu: 'uno', description: 'Arduino Uno (5V logic). Pins D0-D13, A0-A5, 5V, 3V3, GND, GND2, GND3, VIN. Runs Arduino code.',
    pins: unoPins, props: [bool('usb', 'USB connected', true)] },
  { type: 'esp32', label: 'ESP32 DevKit', category: 'Boards', prefix: 'A', w: 140, h: 220, mcu: 'esp32', description: 'ESP32 (3.3V logic). Pins G2,G4,G5,G12-G14,G18,G19,G21-G23,G25-G27,G32,G33, 3V3, 5V, GND, GND2. Builtin LED on 2.',
    pins: espPins, props: [bool('usb', 'USB connected', true)] },
  { type: 'pico', label: 'Raspberry Pi Pico', category: 'Boards', prefix: 'A', w: 120, h: 240, mcu: 'pico', description: 'RP2040 Pico (3.3V logic). Pins GP0-GP9, GP19-GP22, GP26-GP28 (ADC), 3V3, VSYS, VBUS, GND, GND2. Builtin LED 25.',
    pins: picoPins, props: [bool('usb', 'USB connected', true)] },
  { type: 'breadboard', label: 'Breadboard', category: 'Boards', prefix: 'BB', w: 260, h: 200, description: 'Half breadboard. Columns 1-24; holes a-e of a column are connected, f-j too; rails tp/tn/bp/bn run along. Component pins dropped on holes connect automatically.',
    pins: bbPins, bridges: bbBridges, props: [] },

  /* Tools */
  { type: 'voltmeter', label: 'Multimeter', category: 'Tools', prefix: 'MM', w: 70, h: 90, description: 'Multimeter, probes COM and V. Mode V (10MΩ) or A (0.05Ω shunt, put in series).',
    pins: [{ name: 'COM', x: -10, y: 50 }, { name: 'V', x: 10, y: 50 }], props: [select('mode', 'Mode', ['V', 'A'])] },
  { type: 'scope', label: 'Oscilloscope', category: 'Tools', prefix: 'OS', w: 120, h: 80, description: 'Single channel scope, pins CH and GND; plots voltage over time.',
    pins: [{ name: 'CH', x: -10, y: 50 }, { name: 'GND', x: 10, y: 50 }], props: [select('span', 'Time span', ['0.1s', '1s', '5s'], '1s')] },
  { type: 'probe', label: 'Logic probe', category: 'Tools', prefix: 'TP', w: 30, h: 50, description: 'Logic probe: lights red for HIGH (>2V), blue for LOW; pin tip.',
    pins: [{ name: 'tip', x: 0, y: 30 }], props: [] },
];

export const CATALOG_BY_TYPE: Record<string, CompDef> = Object.fromEntries(CATALOG.map((d) => [d.type, d]));
export const CATEGORIES = ['Power', 'Passive', 'Semiconductors', 'Input', 'Output', 'Boards', 'Tools'] as const;

export function getDef(type: string): CompDef {
  const d = CATALOG_BY_TYPE[type];
  if (!d) throw new Error(`Unknown component type "${type}"`);
  return d;
}

export function defaultProps(type: string) {
  return Object.fromEntries(getDef(type).props.map((p) => [p.key, p.default]));
}

/** Pin position in canvas coordinates, honouring rotation. */
export function pinPos(c: { x: number; y: number; rot: number; type: string }, pin: string) {
  const p = getDef(c.type).pins.find((q) => q.name === pin);
  if (!p) return { x: c.x, y: c.y };
  const r = (c.rot * Math.PI) / 180;
  const cos = Math.round(Math.cos(r));
  const sin = Math.round(Math.sin(r));
  return { x: c.x + p.x * cos - p.y * sin, y: c.y + p.x * sin + p.y * cos };
}
