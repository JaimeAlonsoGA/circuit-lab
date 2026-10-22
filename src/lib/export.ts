import { getDef } from './catalog';
import { si } from './format';
import type { CompInst, Project } from './types';
import { buildNetlist, key } from '@/sim/netlist';

export function refDesignators(p: Project): Record<string, string> {
  const count: Record<string, number> = {};
  const out: Record<string, string> = {};
  for (const c of p.components) {
    const pre = getDef(c.type).prefix;
    count[pre] = (count[pre] ?? 0) + 1;
    out[c.id] = `${pre}${count[pre]}`;
  }
  return out;
}

export function valueOf(c: CompInst): string {
  const P = c.props;
  switch (c.type) {
    case 'resistor': case 'potentiometer': return si(Number(P.resistance), 'Ω');
    case 'capacitor': case 'electrolytic': return `${si(Number(P.capacitance), 'F')} ${P.vmax}V`;
    case 'inductor': return si(Number(P.inductance), 'H');
    case 'fuse': return `${P.rating}A`;
    case 'led': return `${P.color}`;
    case 'zener': return `${P.vz}V`;
    case 'battery9v': case 'batteryAA': case 'coincell': case 'supply': case 'usb': return `${P.voltage}V`;
    case 'sevenseg': return `${P.color} CC`;
    default: return getDef(c.type).label;
  }
}

function netNames(p: Project) {
  const nl = buildNetlist(p);
  const name = (c: string, pin: string) => {
    const n = nl.node.get(key(c, pin));
    return n === undefined || n < 0 ? '0' : `N${String(n + 1).padStart(3, '0')}`;
  };
  return { nl, name };
}

export function toSpice(p: Project): string {
  const refs = refDesignators(p);
  const { name } = netNames(p);
  const L: string[] = [`* ${p.name} — exported by Circuit Lab`, `* Node 0 is ground.`];
  const models = new Set<string>();
  for (const c of p.components) {
    const r = refs[c.id];
    const n = (pin: string) => name(c.id, pin);
    const P = c.props;
    switch (c.type) {
      case 'battery9v': case 'batteryAA': case 'coincell': case 'supply':
        L.push(`V${r} ${n('+')} ${r}_int DC ${P.voltage}`, `R${r}_int ${r}_int ${n('-')} ${P.rint}`); break;
      case 'usb': L.push(`V${r} ${n('VBUS')} ${n('GND')} DC ${P.voltage}`); break;
      case 'solar': L.push(`I${r} ${n('-')} ${n('+')} DC ${0.1 * Number(P.light) / 100}`); break;
      case 'resistor': L.push(`${r} ${n('a')} ${n('b')} ${P.resistance}`); break;
      case 'potentiometer': {
        const R = Number(P.resistance), pos = Number(P.position) / 100;
        L.push(`${r}A ${n('a')} ${n('w')} ${Math.max(1, R * pos)}`, `${r}B ${n('w')} ${n('b')} ${Math.max(1, R * (1 - pos))}`); break;
      }
      case 'capacitor': L.push(`${r} ${n('a')} ${n('b')} ${P.capacitance}`); break;
      case 'electrolytic': L.push(`${r} ${n('+')} ${n('-')} ${P.capacitance}`); break;
      case 'inductor': L.push(`${r} ${n('a')} ${n('b')} ${P.inductance}`); break;
      case 'fuse': L.push(`R${r} ${n('a')} ${n('b')} 0.05`); break;
      case 'ldr': L.push(`R${r} ${n('a')} ${n('b')} ${(10 ** (6 - 3.3 * (Number(P.light) / 100))).toPrecision(4)}`); break;
      case 'thermistor': L.push(`R${r} ${n('a')} ${n('b')} ${(10000 * Math.exp(3950 * (1 / (Number(P.temp) + 273.15) - 1 / 298.15))).toPrecision(4)}`); break;
      case 'diode': models.add('.model D1N4148 D(IS=2.5n N=1.75 RS=0.5)'); L.push(`${r} ${n('A')} ${n('K')} D1N4148`); break;
      case 'zener': models.add(`.model DZ${P.vz} D(IS=2.5n N=1.75 BV=${P.vz} IBV=5m)`); L.push(`${r} ${n('A')} ${n('K')} DZ${P.vz}`); break;
      case 'led': models.add(`.model LED_${P.color} D(IS=1e-18 N=2 RS=5)`); L.push(`${r} ${n('A')} ${n('K')} LED_${P.color}`); break;
      case 'rgbled': models.add('.model LED_red D(IS=1e-18 N=2 RS=5)'); for (const ch of ['R', 'G', 'B']) L.push(`${r}${ch} ${n(ch)} ${n('K')} LED_red`); break;
      case 'npn': models.add('.model Q2N2222 NPN(IS=1e-14 BF=150)'); L.push(`${r} ${n('C')} ${n('B')} ${n('E')} Q2N2222`); break;
      case 'pnp': models.add('.model Q2N2907 PNP(IS=1e-14 BF=150)'); L.push(`${r} ${n('C')} ${n('B')} ${n('E')} Q2N2907`); break;
      case 'nmos': models.add(`.model NMOSLL NMOS(VTO=${P.vth} KP=2)`); L.push(`M${r} ${n('D')} ${n('G')} ${n('S')} ${n('S')} NMOSLL`); break;
      case 'button': L.push(`R${r} ${n('a')} ${n('b')} ${P.pressed ? '0.02' : '1G'}`); break;
      case 'switch': L.push(`R${r} ${n('a')} ${n('b')} ${P.on ? '0.02' : '1G'}`); break;
      case 'buzzer': L.push(`R${r} ${n('+')} ${n('-')} 60`); break;
      case 'speaker': L.push(`R${r} ${n('+')} ${n('-')} 8`); break;
      case 'motor': L.push(`R${r} ${n('+')} ${n('-')} 8`); break;
      case 'servo': L.push(`R${r} ${n('VCC')} ${n('GND')} 50`); break;
      case 'relay': L.push(`R${r}_coil ${n('C1')} ${n('C2')} 70`, `* ${r} contact COM-NO: closes when coil current > 45mA`); break;
      case 'lamp': L.push(`R${r} ${n('a')} ${n('b')} ${Number(P.vrated) / 0.1}`); break;
      case 'sevenseg': models.add(`.model LED_${P.color} D(IS=1e-18 N=2 RS=5)`); for (const s of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp']) L.push(`${r}${s} ${n(s)} ${n('COM')} LED_${P.color}`); break;
      case 'oled': L.push(`R${r} ${n('VCC')} ${n('GND')} 250`); break;
      case 'tmp36': L.push(`B${r} ${n('OUT')} ${n('GND')} V=${0.5 + 0.01 * Number(P.temp)}`); break;
      case 'mic': L.push(`* ${r} microphone module (behavioural, not exported)`); break;
      case 'uno': case 'esp32': case 'pico': L.push(`* ${r} ${getDef(c.type).label}: firmware is not simulated in SPICE; export the rails only`); break;
      case 'voltmeter': L.push(`R${r} ${n('V')} ${n('COM')} ${P.mode === 'A' ? '0.05' : '10Meg'}`); break;
      case 'scope': L.push(`R${r} ${n('CH')} ${n('GND')} 10Meg`); break;
      default: break;
    }
  }
  L.push(...models, '.op', '.tran 1m 1s', '.end');
  return L.join('\n') + '\n';
}

export function toBomCsv(p: Project): string {
  const refs = refDesignators(p);
  const groups = new Map<string, { refs: string[]; label: string; value: string }>();
  for (const c of p.components) {
    if (c.type === 'ground') continue;
    const v = valueOf(c);
    const k = `${c.type}|${v}`;
    const g = groups.get(k) ?? { refs: [], label: getDef(c.type).label, value: v };
    g.refs.push(refs[c.id]);
    groups.set(k, g);
  }
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const rows = [['References', 'Component', 'Value', 'Quantity'], ...[...groups.values()].map((g) => [g.refs.join(' '), g.label, g.value, String(g.refs.length)])];
  return rows.map((r) => r.map(esc).join(',')).join('\n') + '\n';
}

const FOOTPRINTS: Record<string, [string, string, string]> = {
  resistor: ['Device', 'R', 'Resistor_THT:R_Axial_DIN0207_L6.3mm_D2.5mm_P10.16mm_Horizontal'],
  capacitor: ['Device', 'C', 'Capacitor_THT:C_Disc_D5.0mm_W2.5mm_P5.00mm'],
  electrolytic: ['Device', 'C_Polarized', 'Capacitor_THT:CP_Radial_D5.0mm_P2.00mm'],
  led: ['Device', 'LED', 'LED_THT:LED_D5.0mm'],
  diode: ['Device', 'D', 'Diode_THT:D_DO-35_SOD27_P7.62mm_Horizontal'],
  npn: ['Transistor_BJT', '2N2222A', 'Package_TO_SOT_THT:TO-92_Inline'],
  nmos: ['Transistor_FET', 'IRLZ44N', 'Package_TO_SOT_THT:TO-220-3_Vertical'],
  uno: ['MCU_Module', 'Arduino_UNO_R3', 'Module:Arduino_UNO_R3'],
  button: ['Switch', 'SW_Push', 'Button_Switch_THT:SW_PUSH_6mm'],
  potentiometer: ['Device', 'R_Potentiometer', 'Potentiometer_THT:Potentiometer_Bourns_3386P_Vertical'],
};

/** KiCad s-expression netlist (eeschema "E" format) – importable into Pcbnew. */
export function toKicadNet(p: Project): string {
  const refs = refDesignators(p);
  const parts = p.components.filter((c) => !['ground', 'breadboard', 'voltmeter', 'scope', 'probe'].includes(c.type));
  const q = (s: string) => `"${s.replace(/"/g, '\\"')}"`;
  const comps = parts.map((c) => {
    const [lib, part, fp] = FOOTPRINTS[c.type] ?? ['Connector', 'Conn_01x0' + Math.min(9, getDef(c.type).pins.length), ''];
    return `    (comp (ref ${q(refs[c.id])}) (value ${q(valueOf(c))}) (footprint ${q(fp)}) (libsource (lib ${q(lib)}) (part ${q(part)})))`;
  });
  const nl = buildNetlist(p);
  const partIds = new Set(parts.map((c) => c.id));
  const nets: string[] = [];
  let code = 1;
  nl.members.forEach((mem, idx) => {
    const nodes = mem.map((k) => k.split(':')).filter(([c]) => partIds.has(c));
    if (nodes.length < 2 && idx !== nl.size) return;
    if (!nodes.length) return;
    const nm = idx === nl.size ? 'GND' : `Net-${code}`;
    const nodeStr = nodes.map(([c, pin]) => {
      const n = getDef(p.components.find((x) => x.id === c)!.type).pins.findIndex((pp) => pp.name === pin) + 1;
      return `(node (ref ${q(refs[c])}) (pin ${q(String(n))}) (pinfunction ${q(pin)}))`;
    }).join(' ');
    nets.push(`    (net (code ${q(String(code++))}) (name ${q(nm)}) ${nodeStr})`);
  });
  return `(export (version "E")\n  (design (source ${q(p.name)}) (tool "Circuit Lab"))\n  (components\n${comps.join('\n')})\n  (nets\n${nets.join('\n')}))\n`;
}

export function toJson(p: Project): string {
  return JSON.stringify(p, null, 2);
}

export function parseProject(text: string): Project {
  const data = JSON.parse(text);
  if (data?.version !== 1 || !Array.isArray(data.components) || !Array.isArray(data.wires)) throw new Error('Not a Circuit Lab project file');
  for (const c of data.components) getDef(c.type);
  return { name: data.name ?? 'Imported', code: data.code ?? {}, ...data };
}

export function download(name: string, content: string | Blob, mime = 'text/plain') {
  const blob = typeof content === 'string' ? new Blob([content], { type: mime }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
