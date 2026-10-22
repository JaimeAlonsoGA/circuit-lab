import { memo, type ReactNode } from 'react';
import { CATALOG_BY_TYPE, LED_COLORS } from '@/lib/catalog';
import { si } from '@/lib/format';
import type { CompInst } from '@/lib/types';
import type { DrawOp } from '@/runtime/mcu';

export type Outputs = Record<string, number | boolean | string>;
export interface ArtProps {
  c: CompInst;
  o?: Outputs;
  burnt?: boolean;
  angle?: number;
  oled?: DrawOp[];
  motorAngle?: number;
  scope?: number[];
  builtinLed?: boolean;
  running?: boolean;
  powered?: boolean;
  tone?: number;
}

const BAND = ['#000', '#7b3f00', '#e01b24', '#ff7800', '#f6d32d', '#2ec27e', '#1c71d8', '#9141ac', '#888', '#fff'];
function bands(r: number): string[] {
  if (!(r > 0)) return [BAND[0], BAND[0], BAND[0]];
  let exp = Math.floor(Math.log10(r)) - 1;
  let digits = Math.round(r / 10 ** exp);
  if (digits >= 100) { digits = Math.round(digits / 10); exp += 1; }
  const d1 = Math.floor(digits / 10), d2 = digits % 10;
  const mult = exp < 0 ? (exp === -1 ? '#d4af37' : '#c0c0c0') : BAND[Math.min(9, exp)];
  return [BAND[d1], BAND[d2], mult];
}

const n = (v: unknown) => (typeof v === 'number' ? v : 0);
const Lead = ({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) => (
  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="url(#g-metal)" strokeWidth={2.2} strokeLinecap="round" />
);
const Legs = ({ xs, from, to = 30 }: { xs: number[]; from: number; to?: number }) => (
  <>{xs.map((x) => <Lead key={x} x1={x} y1={from} x2={x} y2={to} />)}</>
);
const Glow = ({ x, y, r, color, k }: { x: number; y: number; r: number; color: string; k: number }) =>
  k > 0.02 ? <circle cx={x} cy={y} r={r * (0.7 + 0.5 * Math.min(1.4, k))} fill="url(#g-glow)" style={{ color }} opacity={Math.min(1, k)} className="glow" pointerEvents="none" /> : null;
const Label = ({ y, children, size = 7, fill = '#e8ecf6' }: { y: number; children: ReactNode; size?: number; fill?: string }) => (
  <text y={y} textAnchor="middle" fontSize={size} fill={fill} fontFamily="var(--font-geist-mono), monospace" pointerEvents="none">{children}</text>
);
const Waves = ({ x, y, on, color = '#9be7ff' }: { x: number; y: number; on: boolean; color?: string }) =>
  on ? (
    <g className="waves" stroke={color} fill="none" strokeWidth={1.6} strokeLinecap="round" pointerEvents="none">
      {[0, 1, 2].map((i) => <path key={i} d={`M ${x + 4 + i * 5} ${y - 6 - i * 3} q ${4 + i} ${6 + i * 3} 0 ${12 + i * 6}`} style={{ animationDelay: `${i * 0.15}s` }} />)}
    </g>
  ) : null;

function Board({ c, kind, builtinLed, running, powered }: { c: CompInst; kind: 'uno' | 'esp32' | 'pico'; builtinLed?: boolean; running?: boolean; powered?: boolean }) {
  const def = CATALOG_BY_TYPE[c.type];
  const { w, h } = def;
  const fill = kind === 'uno' ? 'url(#g-uno)' : kind === 'pico' ? 'url(#g-pico)' : 'url(#g-esp)';
  const on = powered && (c.props.usb || running);
  return (
    <g>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={8} fill={fill} stroke="#0008" filter="url(#f-shadow)" />
      {[[-w / 2 + 8, -h / 2 + 8], [w / 2 - 8, -h / 2 + 8], [-w / 2 + 8, h / 2 - 8], [w / 2 - 8, h / 2 - 8]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={3} fill="#0006" stroke="#d6c38a" strokeWidth={1} />
      ))}
      {def.pins.map((p) => (
        <g key={p.name}>
          <rect x={p.x - 4} y={p.y - 4} width={8} height={8} fill="#111" rx={1} />
          <text x={p.x + (kind === 'uno' ? 0 : p.x < 0 ? 8 : -8)} y={kind === 'uno' ? p.y + (p.y < 0 ? 12 : -8) : p.y + 2.5} fontSize={kind === 'uno' ? 5 : 6}
            fill="#e9f6ff" textAnchor={kind === 'uno' ? 'middle' : p.x < 0 ? 'start' : 'end'} fontFamily="monospace"
            transform={kind === 'uno' ? `rotate(-90 ${p.x} ${p.y + (p.y < 0 ? 12 : -8)})` : undefined} dominantBaseline="middle" pointerEvents="none">
            {p.name.replace(/^GND\d$/, 'GND')}
          </text>
        </g>
      ))}
      {kind === 'uno' && (
        <>
          <rect x={-w / 2 - 8} y={-55} width={34} height={30} rx={2} fill="url(#g-metal)" />
          <rect x={-w / 2 - 4} y={20} width={30} height={28} rx={3} fill="#1b1b1f" />
          <rect x={10} y={-12} width={84} height={22} rx={2} fill="#1c1d22" />
          {Array.from({ length: 14 }, (_, i) => <rect key={i} x={13 + i * 5.8} y={-16} width={2.4} height={4} fill="#bbb" />)}
          {Array.from({ length: 14 }, (_, i) => <rect key={i} x={13 + i * 5.8} y={10} width={2.4} height={4} fill="#bbb" />)}
          <text x={52} y={2} fontSize={7} fill="#aaa" textAnchor="middle" fontFamily="monospace">ATMEGA328P</text>
          <text x={-40} y={-30} fontSize={18} fontWeight={700} fill="#fff" fontStyle="italic">UNO</text>
          <text x={-40} y={-16} fontSize={7} fill="#cfeef3">∞ ARDUINO</text>
        </>
      )}
      {kind === 'esp32' && (
        <>
          <rect x={-42} y={-h / 2 + 4} width={84} height={80} rx={3} fill="url(#g-metal)" />
          <text x={0} y={-h / 2 + 40} fontSize={8} fill="#333" textAnchor="middle" fontFamily="monospace">ESP32-WROOM</text>
          <path d={`M -30 ${-h / 2 + 8} h 10 v 10 h 10 v -10 h 10 v 10 h 10 v -10 h 10`} stroke="#c9a227" fill="none" strokeWidth={2} />
          <rect x={-14} y={h / 2 - 16} width={28} height={14} rx={2} fill="url(#g-metal)" />
        </>
      )}
      {kind === 'pico' && (
        <>
          <rect x={-14} y={-h / 2 - 6} width={28} height={16} rx={2} fill="url(#g-metal)" />
          <rect x={-22} y={-20} width={44} height={44} rx={2} fill="#1c1d22" />
          <text x={0} y={4} fontSize={7} fill="#aaa" textAnchor="middle" fontFamily="monospace">RP2040</text>
          <text x={0} y={h / 2 - 30} fontSize={9} fill="#e9fff0" textAnchor="middle" fontWeight={700}>Pico</text>
        </>
      )}
      {/* power + builtin LEDs */}
      <g transform={kind === 'uno' ? 'translate(-70 -60)' : kind === 'esp32' ? 'translate(-20 60)' : 'translate(-30 -60)'}>
        <rect x={-4} y={-2.5} width={8} height={5} rx={1} fill={on ? '#5dff7a' : '#2a3a2a'} />
        <Glow x={0} y={0} r={10} color="#5dff7a" k={on ? 0.8 : 0} />
        <text x={0} y={-5} fontSize={5} fill="#fff" textAnchor="middle">ON</text>
        <rect x={14} y={-2.5} width={8} height={5} rx={1} fill={builtinLed ? '#ffb020' : '#3a2f1a'} />
        <Glow x={18} y={0} r={12} color="#ffb020" k={builtinLed ? 1 : 0} />
        <text x={18} y={-5} fontSize={5} fill="#fff" textAnchor="middle">L</text>
      </g>
    </g>
  );
}

function Breadboard() {
  const def = CATALOG_BY_TYPE.breadboard;
  return (
    <g>
      <rect x={-130} y={-100} width={260} height={200} rx={6} fill="#f4f1ea" stroke="#d6d0c2" filter="url(#f-shadow)" />
      <rect x={-125} y={-3} width={250} height={6} fill="#e2ddd0" />
      {[-95, -75, 75, 95].map((y, i) => (
        <line key={y} x1={-118} x2={118} y1={y} y2={y} stroke={i === 0 || i === 3 ? '#e53950' : '#3d6fe0'} strokeWidth={1.2} opacity={0.75} />
      ))}
      {def.pins.map((p) => <rect key={p.name} x={p.x - 2.2} y={p.y - 2.2} width={4.4} height={4.4} rx={0.8} fill="#3a3630" />)}
      {[1, 5, 10, 15, 20].map((c) => <text key={c} x={-125 + c * 10} y={-58} fontSize={5} textAnchor="middle" fill="#8c8576">{c}</text>)}
      {['a', 'b', 'c', 'd', 'e'].map((r, i) => <text key={r} x={-121} y={-50 + i * 10 + 2} fontSize={5} fill="#8c8576">{r}</text>)}
      {['f', 'g', 'h', 'i', 'j'].map((r, i) => <text key={r} x={-121} y={10 + i * 10 + 2} fontSize={5} fill="#8c8576">{r}</text>)}
      <text x={124} y={-88} fontSize={7} fill="#e53950" textAnchor="end">+</text>
      <text x={124} y={98} fontSize={7} fill="#e53950" textAnchor="end">+</text>
    </g>
  );
}

function Oled({ ops, powered }: { ops?: DrawOp[]; powered: boolean }) {
  const s = 80 / 128;
  return (
    <g>
      <rect x={-50} y={-40} width={100} height={80} rx={5} fill="url(#g-blue)" filter="url(#f-shadow)" />
      <rect x={-44} y={-26} width={88} height={52} rx={2} fill="#050608" />
      <g transform={`translate(-40 -20) scale(${s})`} fill="#bff4ff" stroke="#bff4ff" strokeWidth={1.2} style={{ filter: 'drop-shadow(0 0 2px #7fe0ff)' }}>
        {powered && ops?.map((op, i) => {
          switch (op.k) {
            case 'text': return <text key={i} x={op.x} y={op.y + 7 * op.size} fontSize={8 * op.size} fontFamily="monospace" stroke="none">{op.s}</text>;
            case 'rect': return <rect key={i} x={op.x} y={op.y} width={op.w} height={op.h} fill={op.fill ? '#bff4ff' : 'none'} />;
            case 'line': return <line key={i} x1={op.x1} y1={op.y1} x2={op.x2} y2={op.y2} />;
            case 'circle': return <circle key={i} cx={op.x} cy={op.y} r={op.r} fill={op.fill ? '#bff4ff' : 'none'} />;
            case 'px': return <rect key={i} x={op.x} y={op.y} width={1} height={1} stroke="none" />;
          }
        })}
      </g>
      {['GND', 'VCC', 'SCL', 'SDA'].map((p, i) => <text key={p} x={-15 + i * 10} y={-30} fontSize={4.5} fill="#fff" textAnchor="middle">{p}</text>)}
    </g>
  );
}

const SEG: Record<string, string> = {
  a: 'M-12 -30 h22 l-3 4 h-16z', b: 'M12 -28 v24 l-4 -3 v-18z', c: 'M12 4 v24 l-4 -3 v-18z', d: 'M-12 30 h22 l-3 -4 h-16z',
  e: 'M-14 4 v24 l4 -3 v-18z', f: 'M-14 -28 v24 l4 -3 v-18z', g: 'M-12 0 l3 -2.5 h16 l3 2.5 l-3 2.5 h-16z',
};

function Art(props: ArtProps): ReactNode {
  const { c, o = {}, burnt } = props;
  const P = c.props;
  switch (c.type) {
    case 'battery9v':
      return (
        <g>
          <rect x={-28} y={-30} width={56} height={68} rx={5} fill="url(#g-black)" filter="url(#f-shadow)" />
          <rect x={-28} y={-30} width={56} height={22} rx={5} fill="url(#g-copper)" />
          <rect x={-16} y={-40} width={12} height={10} rx={2} fill="url(#g-metal)" />
          <path d="M 6 -40 h 10 l 2 5 v 5 h -14 v -5z" fill="url(#g-metal)" />
          <Label y={10} size={14} fill="#fff">9V</Label>
          <Label y={24} size={6} fill="#ffb36b">{si(n(P.voltage), 'V')}</Label>
        </g>
      );
    case 'batteryAA':
      return (
        <g>
          <rect x={-30} y={-12} width={60} height={24} rx={4} fill="url(#g-copper)" filter="url(#f-shadow)" />
          <rect x={-30} y={-12} width={22} height={24} rx={4} fill="url(#g-black)" />
          <rect x={30} y={-5} width={5} height={10} rx={1} fill="url(#g-metal)" />
          <Label y={3} size={8} fill="#1a0f00">AA {n(P.voltage)}V</Label>
          <Lead x1={-40} y1={0} x2={-30} y2={0} /><Lead x1={35} y1={0} x2={40} y2={0} />
        </g>
      );
    case 'coincell':
      return (
        <g><circle r={16} fill="url(#g-metal)" stroke="#777" filter="url(#f-shadow)" /><circle r={11} fill="none" stroke="#fff6" /><Label y={2} size={6} fill="#333">CR2032</Label></g>
      );
    case 'usb':
      return (
        <g>
          <rect x={-30} y={-18} width={40} height={36} rx={6} fill="#f1f3f8" stroke="#bfc4d0" filter="url(#f-shadow)" />
          <rect x={10} y={-12} width={16} height={24} rx={2} fill="url(#g-metal)" />
          <path d="M -18 -6 v 12 M -22 -2 l 4 -6 l 4 6" stroke="#5a6070" fill="none" strokeWidth={1.6} />
          <Label y={14} size={6} fill="#5a6070">5V</Label>
        </g>
      );
    case 'supply':
      return (
        <g>
          <rect x={-40} y={-30} width={80} height={60} rx={6} fill="#2a2f3d" stroke="#0007" filter="url(#f-shadow)" />
          <rect x={-34} y={-24} width={46} height={20} rx={2} fill="#091409" />
          <text x={8} y={-10} fontSize={11} fill="#58ff7a" textAnchor="end" fontFamily="monospace">{n(P.voltage).toFixed(1)}V</text>
          <text x={8} y={6} fontSize={7} fill="#ffcc55" textAnchor="end" fontFamily="monospace">{si(Math.abs(n(o.i)), 'A', 2)}</text>
          <circle cx={26} cy={-12} r={9} fill="url(#g-metal)" /><line x1={26} y1={-12} x2={26 + 7 * Math.cos(n(P.voltage) / 5)} y2={-12 - 7 * Math.sin(n(P.voltage) / 5)} stroke="#333" strokeWidth={2} />
          <circle cx={-20} cy={20} r={5} fill="#e53950" /><circle cx={20} cy={20} r={5} fill="#222" stroke="#555" />
        </g>
      );
    case 'solar': {
      const k = n(P.light) / 100;
      return (
        <g>
          <rect x={-35} y={-25} width={70} height={46} rx={3} fill="url(#g-solar)" stroke="#c7d1e8" strokeWidth={2} filter="url(#f-shadow)" />
          {[-17.5, 0, 17.5].map((x) => <line key={x} x1={x} x2={x} y1={-25} y2={21} stroke="#c7d1e8" strokeWidth={0.8} />)}
          <line x1={-35} x2={35} y1={-2} y2={-2} stroke="#c7d1e8" strokeWidth={0.8} />
          <rect x={-35} y={-25} width={70} height={46} fill="#fff" opacity={0.25 * k} className="shine" />
          <Legs xs={[-20, 20]} from={21} />
        </g>
      );
    }
    case 'ground':
      return (
        <g stroke="#cfd6e6" strokeWidth={2.4} strokeLinecap="round">
          <line x1={0} y1={-10} x2={0} y2={2} /><line x1={-12} y1={2} x2={12} y2={2} /><line x1={-7} y1={7} x2={7} y2={7} /><line x1={-3} y1={12} x2={3} y2={12} />
        </g>
      );
    case 'resistor': {
      const b = bands(n(P.resistance));
      const heat = Math.min(1, Math.abs(n(o.p)) / n(P.power));
      return (
        <g>
          <Lead x1={-40} y1={0} x2={-20} y2={0} /><Lead x1={20} y1={0} x2={40} y2={0} />
          <rect x={-22} y={-7} width={44} height={14} rx={6} fill="#e8c896" stroke="#b08a50" />
          {b.map((col, i) => <rect key={i} x={-14 + i * 7} y={-7} width={3.5} height={14} fill={col} />)}
          <rect x={10} y={-7} width={3.5} height={14} fill="#d4af37" />
          {heat > 0.5 && !burnt && <rect x={-22} y={-7} width={44} height={14} rx={6} fill="#ff4400" opacity={(heat - 0.5) * 1.2} className="pulse" />}
        </g>
      );
    }
    case 'potentiometer': {
      const ang = -135 + 2.7 * n(P.position);
      return (
        <g>
          <Legs xs={[-20, 0, 20]} from={14} />
          <rect x={-26} y={-24} width={52} height={40} rx={6} fill="url(#g-blue)" filter="url(#f-shadow)" />
          <g data-action="knob" className="knob" transform={`rotate(${ang})`} style={{ cursor: 'ns-resize' }}>
            <circle r={15} fill="url(#g-metal)" stroke="#555" />
            <circle r={11} fill="#d9dde6" />
            <rect x={-1.6} y={-14} width={3.2} height={10} rx={1.5} fill="#333" />
          </g>
        </g>
      );
    }
    case 'capacitor':
      return (
        <g>
          <Lead x1={-30} y1={0} x2={-6} y2={6} /><Lead x1={30} y1={0} x2={6} y2={6} />
          <ellipse cx={0} cy={-4} rx={14} ry={13} fill="#e98b2a" stroke="#a85a14" filter="url(#f-shadow)" />
          <Label y={-2} size={6} fill="#4a2400">{si(n(P.capacitance), 'F', 2)}</Label>
        </g>
      );
    case 'electrolytic': {
      const ch = n(o.charge);
      return (
        <g>
          <Lead x1={-30} y1={0} x2={-8} y2={14} /><Lead x1={30} y1={0} x2={8} y2={14} />
          <rect x={-15} y={-24} width={30} height={38} rx={5} fill="url(#g-blue)" filter="url(#f-shadow)" />
          <rect x={6} y={-24} width={9} height={38} fill="#cfd8ff" opacity={0.8} />
          <text x={10.5} y={-6} fontSize={9} textAnchor="middle" fill="#1c3fa8">−</text>
          <ellipse cx={0} cy={-24} rx={15} ry={4} fill={burnt ? '#2b2b2b' : 'url(#g-metal)'} />
          {burnt ? <path d="M -8 -26 l 4 -8 l 3 6 l 3 -9 l 3 8 l 4 -5" stroke="#999" fill="none" /> : <path d="M -6 -24 h 12 M 0 -28 v 8" stroke="#7a8090" strokeWidth={0.8} />}
          <rect x={-12} y={10} width={18 * ch} height={2} fill="#58ff7a" opacity={0.85} />
          <Label y={4} size={6} fill="#fff">{si(n(P.capacitance), 'F', 2)}</Label>
        </g>
      );
    }
    case 'inductor':
      return (
        <g>
          <Lead x1={-40} y1={0} x2={-24} y2={0} /><Lead x1={24} y1={0} x2={40} y2={0} />
          <rect x={-24} y={-9} width={48} height={18} rx={4} fill="#2f2f36" />
          <path d={`M -22 0 ${Array.from({ length: 7 }, () => `a 3.2 8 0 1 1 ${6.3} 0`).join(' ')}`} stroke="url(#g-copper)" strokeWidth={3} fill="none" />
        </g>
      );
    case 'fuse':
      return (
        <g>
          <Lead x1={-40} y1={0} x2={-26} y2={0} /><Lead x1={26} y1={0} x2={40} y2={0} />
          <rect x={-28} y={-8} width={10} height={16} rx={2} fill="url(#g-metal)" /><rect x={18} y={-8} width={10} height={16} rx={2} fill="url(#g-metal)" />
          <rect x={-18} y={-7} width={36} height={14} fill="url(#g-glass)" stroke="#c9d6e8" />
          {burnt ? <path d="M -18 0 h 12 l 3 -3 M 6 2 l 3 -2 h 9" stroke="#333" strokeWidth={1.2} fill="none" /> : <line x1={-18} x2={18} y1={0} y2={0} stroke="#b0b6c2" strokeWidth={1.2} />}
          {burnt && <rect x={-18} y={-7} width={36} height={14} fill="#000" opacity={0.35} />}
        </g>
      );
    case 'ldr':
      return (
        <g>
          <Lead x1={-30} y1={0} x2={-6} y2={8} /><Lead x1={30} y1={0} x2={6} y2={8} />
          <circle cy={-4} r={14} fill="#f6efe0" stroke="#c5b48c" filter="url(#f-shadow)" />
          <path d="M -9 -10 h 18 v 4 h -18 v 4 h 18 v 4 h -18 v 4 h 18" stroke="#c0392b" fill="none" strokeWidth={1.5} />
          <circle cy={-4} r={14} fill="#fff59d" opacity={0.6 * n(P.light) / 100} pointerEvents="none" />
        </g>
      );
    case 'thermistor':
      return (
        <g>
          <Lead x1={-30} y1={0} x2={-4} y2={6} /><Lead x1={30} y1={0} x2={4} y2={6} />
          <ellipse cy={-3} rx={10} ry={12} fill="#2c8a3f" stroke="#1a5a28" filter="url(#f-shadow)" />
          <ellipse cy={-3} rx={10} ry={12} fill="#ff3b1f" opacity={Math.max(0, Math.min(0.7, (n(P.temp) - 25) / 120))} />
          <Label y={-1} size={6} fill="#dfffe5">10k</Label>
        </g>
      );
    case 'diode':
    case 'zener':
      return (
        <g>
          <Lead x1={-40} y1={0} x2={-16} y2={0} /><Lead x1={16} y1={0} x2={40} y2={0} />
          <rect x={-17} y={-6} width={34} height={12} rx={3} fill={c.type === 'zener' ? '#f0a43b' : 'url(#g-black)'} stroke={c.type === 'zener' ? '#b87717' : '#000'} />
          <rect x={9} y={-6} width={4} height={12} fill={c.type === 'zener' ? '#222' : '#d9dde6'} />
          {c.type === 'zener' && <Label y={2.5} size={6} fill="#3a1d00">{n(P.vz)}V</Label>}
        </g>
      );
    case 'led': {
      const col = LED_COLORS[String(P.color)]?.hex ?? '#f00';
      const k = burnt ? 0 : n(o.brightness);
      return (
        <g>
          <Lead x1={-10} y1={2} x2={-10} y2={30} /><Lead x1={10} y1={2} x2={10} y2={22} /><Lead x1={10} y1={22} x2={10} y2={30} />
          <Glow x={0} y={-12} r={34} color={col} k={k} />
          <path d="M -12 2 v -14 a 12 12 0 0 1 24 0 v 14 z" fill={burnt ? '#3a3530' : col} opacity={burnt ? 1 : 0.35 + 0.65 * Math.min(1, k)} stroke={burnt ? '#111' : col} strokeWidth={0.8} />
          <rect x={-14} y={0} width={28} height={4} rx={1} fill={burnt ? '#2a2622' : col} opacity={0.85} />
          <path d="M -6 -18 a 7 7 0 0 1 6 -5" stroke="#fff" strokeOpacity={0.7} strokeWidth={1.6} fill="none" />
          {k > 0.05 && <circle cy={-10} r={4} fill="#fff" opacity={Math.min(0.9, k)} pointerEvents="none" />}
          {burnt && <path d="M -4 -22 l 3 7 l -4 4 l 5 8" stroke="#111" strokeWidth={1.2} fill="none" />}
        </g>
      );
    }
    case 'rgbled': {
      const r = burnt ? 0 : Math.min(1, n(o.r)), g = burnt ? 0 : Math.min(1, n(o.g)), b = burnt ? 0 : Math.min(1, n(o.b));
      const col = `rgb(${Math.round(80 + 175 * r)},${Math.round(80 + 175 * g)},${Math.round(80 + 175 * b)})`;
      const k = Math.max(r, g, b);
      return (
        <g>
          <Legs xs={[-20, -10, 10, 20]} from={4} />
          <Glow x={0} y={-12} r={36} color={col} k={k} />
          <path d="M -14 4 v -16 a 14 14 0 0 1 28 0 v 16 z" fill={burnt ? '#3a3530' : k > 0.02 ? col : '#e8eaf0'} opacity={0.9} stroke="#bbb" strokeWidth={0.6} />
          <path d="M -7 -20 a 8 8 0 0 1 7 -6" stroke="#fff" strokeOpacity={0.8} strokeWidth={1.6} fill="none" />
        </g>
      );
    }
    case 'npn':
    case 'pnp':
    case 'tmp36':
      return (
        <g>
          <Legs xs={[-10, 0, 10]} from={8} />
          <path d="M -15 10 v -24 a 15 13 0 0 1 30 0 v 24 z" fill="url(#g-black)" filter="url(#f-shadow)" />
          <Label y={-4} size={6}>{c.type === 'tmp36' ? 'TMP36' : c.type === 'npn' ? '2N2222' : '2N2907'}</Label>
          {c.type === 'tmp36' ? <Label y={5} size={6} fill="#ffb36b">{n(P.temp)}°C</Label> : <Label y={5} size={5} fill="#9aa">{'C B E'}</Label>}
        </g>
      );
    case 'nmos':
      return (
        <g>
          <Legs xs={[-10, 0, 10]} from={12} />
          <rect x={-18} y={-40} width={36} height={22} rx={2} fill="url(#g-metal)" />
          <circle cy={-30} r={5} fill="#222" />
          <rect x={-18} y={-20} width={36} height={32} rx={2} fill="url(#g-black)" filter="url(#f-shadow)" />
          <Label y={-4} size={6}>IRLZ44N</Label>
          <Label y={6} size={5} fill="#9aa">G D S</Label>
        </g>
      );
    case 'button': {
      const on = !!P.pressed;
      return (
        <g>
          <Lead x1={-30} y1={0} x2={-20} y2={0} /><Lead x1={20} y1={0} x2={30} y2={0} />
          <rect x={-20} y={-20} width={40} height={40} rx={4} fill="url(#g-black)" filter="url(#f-shadow)" />
          {[[-15, -15], [15, -15], [-15, 15], [15, 15]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={2} fill="#666" />)}
          <g data-action="press" style={{ cursor: 'pointer' }}>
            <circle r={12} fill={on ? '#a1132a' : '#e53950'} stroke="#0008" />
            <circle r={on ? 9 : 10} fill={on ? '#c41d38' : '#ff5c73'} transform={on ? 'translate(0 1)' : undefined} />
          </g>
        </g>
      );
    }
    case 'switch': {
      const on = !!P.on;
      return (
        <g data-action="toggle" style={{ cursor: 'pointer' }}>
          <Lead x1={-30} y1={0} x2={-20} y2={0} /><Lead x1={20} y1={0} x2={30} y2={0} />
          <rect x={-22} y={-14} width={44} height={24} rx={5} fill="url(#g-black)" filter="url(#f-shadow)" />
          <rect x={-16} y={-8} width={32} height={12} rx={6} fill={on ? '#22c55e' : '#3b3f4c'} className="trans" />
          <circle cx={on ? 10 : -10} cy={-2} r={7} fill="url(#g-metal)" className="trans" />
        </g>
      );
    }
    case 'mic': {
      const lvl = n(P.level) / 100;
      return (
        <g>
          <Legs xs={[-10, 0, 10]} from={22} />
          <rect x={-20} y={-28} width={40} height={52} rx={4} fill="url(#g-blue)" filter="url(#f-shadow)" />
          <circle cy={-10} r={11} fill="url(#g-metal)" /><circle cy={-10} r={8} fill="#222" />
          {[0, 1, 2, 3, 4].map((i) => <rect key={i} x={-10 + i * 4.5} y={14 - 8 * lvl * (0.4 + ((i * 7) % 5) / 5)} width={3} height={8 * lvl * (0.4 + ((i * 7) % 5) / 5) + 1} fill="#7fffb0" className="eq" style={{ animationDelay: `${i * 0.1}s` }} />)}
        </g>
      );
    }
    case 'buzzer': {
      const on = !burnt && (!!o.on || (props.tone ?? 0) > 0);
      return (
        <g className={on ? 'buzz' : undefined}>
          <Lead x1={-30} y1={0} x2={-10} y2={10} /><Lead x1={30} y1={0} x2={10} y2={10} />
          <circle r={20} fill="url(#g-black)" filter="url(#f-shadow)" />
          <circle r={4} fill="#000" /><circle r={13} fill="none" stroke="#333" />
          <text x={-14} y={-12} fontSize={7} fill="#e53950">+</text>
          <Waves x={18} y={0} on={on} />
        </g>
      );
    }
    case 'speaker': {
      const lvl = burnt ? 0 : n(o.level);
      return (
        <g>
          <Lead x1={-30} y1={0} x2={-18} y2={14} /><Lead x1={30} y1={0} x2={18} y2={14} />
          <circle r={26} fill="url(#g-black)" filter="url(#f-shadow)" />
          <g className={lvl > 0.05 ? 'vibrate' : undefined}>
            <circle r={19} fill="#2b2d36" stroke="#555" /><circle r={8} fill="url(#g-metal)" />
          </g>
          <Waves x={26} y={0} on={lvl > 0.05} />
        </g>
      );
    }
    case 'motor': {
      const sp = burnt ? 0 : n(o.speed);
      return (
        <g>
          <Lead x1={-30} y1={0} x2={-14} y2={18} /><Lead x1={30} y1={0} x2={14} y2={18} />
          <rect x={-22} y={-14} width={44} height={36} rx={10} fill="url(#g-metal)" filter="url(#f-shadow)" />
          <rect x={-22} y={12} width={44} height={10} rx={3} fill="#c0392b" />
          <g transform={`translate(0 -16) rotate(${props.motorAngle ?? 0})`}>
            <path d="M 0 0 C 8 -6 24 -6 28 0 C 24 6 8 6 0 0 C -8 6 -24 6 -28 0 C -24 -6 -8 -6 0 0" fill="#ff9f1c" opacity={0.92} stroke="#a35e00" strokeWidth={0.6} />
            <circle r={3.5} fill="#333" />
          </g>
          {Math.abs(sp) > 0.6 && <circle cy={-16} r={28} fill="none" stroke="#ff9f1c" strokeOpacity={0.25} strokeDasharray="4 6" />}
        </g>
      );
    }
    case 'servo': {
      const ang = props.angle ?? 90;
      return (
        <g>
          <Legs xs={[-10, 0, 10]} from={18} />
          <rect x={-35} y={-18} width={70} height={36} rx={4} fill="url(#g-blue)" filter="url(#f-shadow)" />
          <rect x={-44} y={-6} width={88} height={6} rx={2} fill="#2852c7" />
          <circle cx={-14} cy={0} r={11} fill="#e8ecf6" />
          <g transform={`translate(-14 0) rotate(${ang - 90})`} className="servo-horn">
            <path d="M -5 0 L -3 -26 a 3 3 0 0 1 6 0 L 5 0 a 5 5 0 0 1 -10 0" fill="#f7f7fa" stroke="#9aa" />
            <circle r={2.5} fill="#666" />
          </g>
          <Label y={12} size={6}>{Math.round(ang)}°</Label>
        </g>
      );
    }
    case 'relay': {
      const closed = !!o.closed && !burnt;
      return (
        <g>
          <Legs xs={[-20, -10, 10, 20]} from={22} />
          <rect x={-28} y={-28} width={56} height={50} rx={4} fill="url(#g-blue)" filter="url(#f-shadow)" />
          <Label y={-14} size={7}>RELAY 5V</Label>
          <path d={`M -14 10 L ${closed ? 12 : 8} ${closed ? 4 : -2}`} stroke="#fff" strokeWidth={2} strokeLinecap="round" className="trans" />
          <circle cx={-14} cy={10} r={2.5} fill="#fff" /><circle cx={14} cy={4} r={2.5} fill="#fff" />
          <circle cx={20} cy={-20} r={3} fill={closed ? '#ff3b3b' : '#4a1d1d'} />
          <Glow x={20} y={-20} r={10} color="#ff3b3b" k={closed ? 1 : 0} />
        </g>
      );
    }
    case 'lamp': {
      const k = burnt ? 0 : Math.min(1.3, n(o.brightness));
      return (
        <g>
          <Legs xs={[-10, 10]} from={18} to={30} />
          <Glow x={0} y={-10} r={46} color="#ffd66b" k={k} />
          <rect x={-10} y={6} width={20} height={14} rx={2} fill="url(#g-metal)" />
          {[9, 13, 17].map((y) => <line key={y} x1={-10} x2={10} y1={y} y2={y} stroke="#777" strokeWidth={0.8} />)}
          <path d="M -10 6 C -10 -2 -18 -8 -18 -16 A 18 18 0 0 1 18 -16 C 18 -8 10 -2 10 6 Z" fill={k > 0.05 ? '#fff3c4' : 'url(#g-glass)'} fillOpacity={k > 0.05 ? 0.5 + k / 3 : 1} stroke="#d8e2ee" />
          <path d={burnt ? 'M -4 6 L -4 -10 L 0 -14 M 4 6 L 4 -9' : 'M -4 6 L -4 -10 q 2 -4 4 0 q 2 -4 4 0 L 4 6'} stroke={k > 0.05 ? '#fff' : '#5b5b5b'} strokeWidth={1.2} fill="none" />
        </g>
      );
    }
    case 'sevenseg': {
      const col = LED_COLORS[String(P.color)]?.hex ?? '#f00';
      return (
        <g>
          <rect x={-26} y={-44} width={52} height={88} rx={4} fill="#17181d" filter="url(#f-shadow)" />
          {Object.entries(SEG).map(([s, d]) => {
            const k = burnt ? 0 : Math.min(1, n(o[s]));
            return <path key={s} d={d} transform="translate(0 0) skewX(-6)" fill={k > 0.05 ? col : '#2a2420'} opacity={k > 0.05 ? 0.4 + 0.6 * k : 1} style={k > 0.05 ? { filter: `drop-shadow(0 0 3px ${col})` } : undefined} />;
          })}
          <circle cx={18} cy={30} r={2.6} fill={n(o.dp) > 0.05 && !burnt ? col : '#2a2420'} />
        </g>
      );
    }
    case 'oled':
      return <Oled ops={props.oled} powered={!!o.powered && !burnt} />;
    case 'uno': case 'esp32': case 'pico':
      return <Board c={c} kind={c.type} builtinLed={props.builtinLed} running={props.running} powered={props.powered} />;
    case 'breadboard':
      return <Breadboard />;
    case 'voltmeter': {
      const r = n(o.reading);
      const txt = burnt ? 'FUSE' : P.mode === 'A' ? si(r, 'A', 3) : si(r, 'V', 3);
      return (
        <g>
          <Lead x1={-10} y1={38} x2={-10} y2={50} /><Lead x1={10} y1={38} x2={10} y2={50} />
          <rect x={-35} y={-45} width={70} height={85} rx={9} fill="#f5c400" filter="url(#f-shadow)" />
          <rect x={-29} y={-39} width={58} height={73} rx={6} fill="#2a2c33" />
          <rect x={-25} y={-34} width={50} height={22} rx={2} fill="#b9c9a7" />
          <text x={22} y={-17} fontSize={11} textAnchor="end" fill="#1d2619" fontFamily="monospace">{txt}</text>
          <circle cy={8} r={12} fill="#444" stroke="#666" /><line x1={0} y1={8} x2={P.mode === 'A' ? 8 : -8} y2={0} stroke="#ddd" strokeWidth={2.5} />
          <text x={-20} y={2} fontSize={6} fill="#fff">V</text><text x={16} y={2} fontSize={6} fill="#fff">A</text>
          <circle cx={-10} cy={28} r={3} fill="#111" stroke="#888" /><circle cx={10} cy={28} r={3} fill="#e53950" />
        </g>
      );
    }
    case 'scope': {
      const data = props.scope ?? [];
      const max = Math.max(1, ...data.map(Math.abs));
      const pts = data.map((v, i) => `${-52 + (i / Math.max(1, data.length - 1)) * 80},${-2 - (v / max) * 26}`).join(' ');
      return (
        <g>
          <Lead x1={-10} y1={38} x2={-10} y2={50} /><Lead x1={10} y1={38} x2={10} y2={50} />
          <rect x={-60} y={-40} width={120} height={78} rx={6} fill="#30343f" filter="url(#f-shadow)" />
          <rect x={-54} y={-34} width={84} height={64} rx={2} fill="#06150d" />
          {[-34, -18, -2, 14, 30].map((y) => <line key={y} x1={-54} x2={30} y1={y} y2={y} stroke="#1d4a30" strokeWidth={0.5} />)}
          {[-54, -33, -12, 9, 30].map((x) => <line key={x} y1={-34} y2={30} x1={x} x2={x} stroke="#1d4a30" strokeWidth={0.5} />)}
          {pts && <polyline points={pts} fill="none" stroke="#3dff8b" strokeWidth={1.4} style={{ filter: 'drop-shadow(0 0 2px #3dff8b)' }} />}
          <text x={46} y={-24} fontSize={6} fill="#cde" textAnchor="middle">{si(max, 'V', 2)}</text>
          <text x={46} y={-16} fontSize={5} fill="#9ab" textAnchor="middle">/div</text>
          <circle cx={46} cy={6} r={7} fill="url(#g-metal)" /><circle cx={46} cy={24} r={4} fill="#e53950" />
        </g>
      );
    }
    case 'probe': {
      const v = n(o.v);
      const col = v > 2 ? '#ff3b3b' : v < 0.8 ? '#3b82ff' : '#555';
      return (
        <g>
          <Lead x1={0} y1={14} x2={0} y2={30} />
          <rect x={-8} y={-24} width={16} height={40} rx={7} fill="#e9e9ef" filter="url(#f-shadow)" />
          <circle cy={-12} r={5} fill={col} /><Glow x={0} y={-12} r={14} color={col} k={col === '#555' ? 0 : 0.9} />
          <Label y={6} size={5} fill="#333">{v > 2 ? 'HI' : v < 0.8 ? 'LO' : '—'}</Label>
        </g>
      );
    }
    default:
      return <rect x={-20} y={-20} width={40} height={40} fill="#555" />;
  }
}

export const PartArt = memo(Art);
