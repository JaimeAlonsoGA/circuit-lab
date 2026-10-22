import { CATALOG, getDef } from '@/lib/catalog';
import { refDesignators } from '@/lib/export';
import { si } from '@/lib/format';
import type { AgentReply, ChatMsg, Provider, ToolCall, ToolResult, ToolSpec } from '@/lib/agentProtocol';
import type { CodeLang, PropValue } from '@/lib/types';
import { events, useSim, useStore } from '@/store/store';

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties, required });
const str = (description: string) => ({ type: 'string', description });

export const TOOLS: ToolSpec[] = [
  { name: 'get_circuit', description: 'Current components (by reference like R1), their props and pins, the wires, power state and burnt parts.', parameters: obj({}) },
  { name: 'add_component', description: 'Add a part. Returns its reference (e.g. "R1"). Position is optional; parts are auto-placed.', parameters: obj({ type: str('Catalog type, e.g. "resistor"'), x: { type: 'number' }, y: { type: 'number' }, props: { type: 'object', description: 'Optional property overrides' } }, ['type']) },
  { name: 'connect', description: 'Wire two pins, written "REF.pin", e.g. from "BT1.+" to "R1.a".', parameters: obj({ from: str('REF.pin'), to: str('REF.pin'), color: str('Optional CSS colour') }, ['from', 'to']) },
  { name: 'set_property', description: 'Change a property of a component.', parameters: obj({ ref: str('e.g. R1'), key: str('property key'), value: { type: ['number', 'string', 'boolean'] } }, ['ref', 'key', 'value']) },
  { name: 'remove', description: 'Delete a component (and its wires) by reference, or a wire by id.', parameters: obj({ ref: str('Component reference or wire id') }, ['ref']) },
  { name: 'set_code', description: 'Replace the program of a microcontroller board. Arduino C (setup/loop) or JavaScript.', parameters: obj({ ref: str('Board reference, e.g. U1'), source: str('Full source'), lang: { type: 'string', enum: ['arduino', 'js'] } }, ['ref', 'source']) },
  { name: 'set_power', description: 'Turn the simulation on or off.', parameters: obj({ on: { type: 'boolean' } }, ['on']) },
  { name: 'run', description: 'Power on, simulate for a moment and return the readings (voltages, currents, LED brightness, burns, serial output).', parameters: obj({ seconds: { type: 'number', description: '0.2–5 seconds of wall time' } }) },
  { name: 'get_readings', description: 'Latest simulation readings without changing anything.', parameters: obj({}) },
  { name: 'repair', description: 'Replace every burnt component with a fresh one.', parameters: obj({}) },
  { name: 'clear', description: 'Remove everything from the canvas.', parameters: obj({}) },
];

export function systemPrompt(): string {
  const parts = CATALOG.map((d) => {
    const pins = d.type === 'breadboard' ? 'columns a1..j30 (a–e and f–j strips short per column), rails tp/tn/bp/bn 1..30' : d.pins.map((p) => p.name).join(',');
    const props = d.props.map((p) => `${p.key}${p.options ? `[${p.options.join('|')}]` : p.unit ? `(${p.unit})` : ''}`).join(',');
    return `- ${d.type}: ${d.description} pins: ${pins}${props ? `; props: ${props}` : ''}`;
  }).join('\n');
  return `You are Sparky, the friendly electronics assistant inside Circuit Lab, a live circuit simulator.
You build and debug circuits by calling tools; the user watches parts appear on the canvas. Prefer doing over explaining.
Rules: always protect LEDs with a resistor; keep currents sane; after building, call run and report what happened briefly. Use get_circuit before editing an existing circuit.
Microcontroller code runs in-browser: Arduino C subset (pinMode, digitalWrite/Read, analogWrite/Read, delay, millis, Serial, tone, Servo, Adafruit_SSD1306) or JavaScript with the same API.
Keep replies short, warm and concrete (1–4 sentences). Use SI units.
Catalog:
${parts}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function refs() {
  const p = useStore.getState().project;
  const byId = refDesignators(p);
  const byRef: Record<string, string> = {};
  for (const [id, r] of Object.entries(byId)) byRef[r.toUpperCase()] = id;
  return { byId, byRef, p };
}

function resolve(ref: unknown): string {
  const { byRef, p } = refs();
  const r = String(ref ?? '').trim();
  const id = byRef[r.toUpperCase()] ?? (p.components.some((c) => c.id === r) ? r : undefined);
  if (!id) throw new Error(`No component "${r}". Known: ${Object.keys(byRef).join(', ') || 'none'}`);
  return id;
}

function resolvePin(s: unknown) {
  const t = String(s ?? '');
  const dot = t.indexOf('.');
  if (dot < 1) throw new Error(`Pin "${t}" must look like REF.pin`);
  const c = resolve(t.slice(0, dot));
  const ALIAS: Record<string, string> = { anode: 'A', cathode: 'K', plus: '+', minus: '-', pos: '+', neg: '-', positive: '+', negative: '-' };
  const raw = t.slice(dot + 1);
  const p = ALIAS[raw.toLowerCase()] ?? raw;
  const comp = useStore.getState().project.components.find((x) => x.id === c)!;
  const def = getDef(comp.type);
  const pin = def.pins.find((x) => x.name === p) ?? def.pins.find((x) => x.name.toLowerCase() === p.toLowerCase());
  if (!pin) throw new Error(`${t.slice(0, dot)} has no pin "${p}". Pins: ${def.pins.length > 40 ? 'see catalog' : def.pins.map((x) => x.name).join(', ')}`);
  return { c, p: pin.name };
}

function freeSpot(): [number, number] {
  const cs = useStore.getState().project.components;
  for (let i = 0; i < 200; i++) {
    const x = 120 + (i % 6) * 150, y = 120 + Math.floor(i / 6) * 150;
    if (!cs.some((c) => Math.abs(c.x - x) < 110 && Math.abs(c.y - y) < 110)) return [x, y];
  }
  return [120, 120];
}

function circuit() {
  const { byId, p } = refs();
  const s = useStore.getState();
  return {
    powered: s.powered,
    components: p.components.map((c) => ({ ref: byId[c.id], type: c.type, props: c.props, pins: c.type === 'breadboard' ? 'a1..j30, rails' : getDef(c.type).pins.map((x) => x.name), burnt: s.damaged[c.id] })),
    wires: p.wires.map((w) => ({ id: w.id, from: `${byId[w.a.c]}.${w.a.p}`, to: `${byId[w.b.c]}.${w.b.p}` })),
  };
}

function readings() {
  const f = useSim.getState().frame;
  const s = useStore.getState();
  const { byId, p } = refs();
  if (!s.powered || !f) return { powered: s.powered, note: 'Power is off; call run to simulate.' };
  const parts: Record<string, unknown> = {};
  for (const c of p.components) {
    if (c.type === 'breadboard') continue;
    const def = getDef(c.type);
    const pins: Record<string, string> = {};
    if (def.pins.length <= 8) for (const pin of def.pins) {
      const v = f.v[`${c.id}:${pin.name}`], i = f.i[`${c.id}:${pin.name}`];
      if (v !== undefined) pins[pin.name] = `${si(v, 'V')}${i !== undefined ? ` ${si(i, 'A')}` : ''}`;
    }
    const out = Object.fromEntries(Object.entries(f.out[c.id] ?? {}).map(([k, v]) => [k, typeof v === 'number' ? +v.toPrecision(3) : v]));
    parts[byId[c.id]] = { out, pins, ...(s.damaged[c.id] ? { burnt: s.damaged[c.id] } : {}) };
  }
  const serial = Object.fromEntries(Object.entries(f.serial).map(([id, x]) => [byId[id], { last: x.lines.slice(-8), error: x.error }]));
  return { t: `${si(f.t, 's')}`, converged: f.converged, parts, serial };
}

export async function execTool(call: ToolCall): Promise<string> {
  const s = useStore.getState();
  const a = call.args;
  switch (call.name) {
    case 'get_circuit': return JSON.stringify(circuit());
    case 'add_component': {
      const type = String(a.type);
      if (!CATALOG.some((d) => d.type === type)) throw new Error(`Unknown type "${type}"`);
      const [fx, fy] = freeSpot();
      const id = s.addComponent(type, Number(a.x ?? fx), Number(a.y ?? fy), (a.props ?? undefined) as Record<string, PropValue> | undefined);
      return `Added ${refs().byId[id]} (${getDef(type).label})`;
    }
    case 'connect': {
      const from = resolvePin(a.from), to = resolvePin(a.to);
      const id = s.connect(from, to, a.color ? String(a.color) : undefined);
      return id ? `Wired ${a.from} → ${a.to}` : `Already connected ${a.from} ↔ ${a.to}`;
    }
    case 'set_property': {
      const id = resolve(a.ref);
      const c = s.project.components.find((x) => x.id === id)!;
      const pd = getDef(c.type).props.find((p) => p.key === a.key);
      if (!pd) throw new Error(`${a.ref} has no property "${a.key}". Has: ${getDef(c.type).props.map((p) => p.key).join(', ')}`);
      let v = a.value as PropValue;
      if (pd.kind === 'number' || pd.kind === 'range') v = Number(v);
      if (pd.kind === 'bool') v = v === true || v === 'true';
      if (pd.kind === 'select' && pd.options && !pd.options.includes(String(v))) throw new Error(`Options: ${pd.options.join(', ')}`);
      s.checkpoint(); s.setProp(id, pd.key, v);
      return `${a.ref}.${pd.key} = ${v}`;
    }
    case 'remove': {
      const r = String(a.ref);
      if (s.project.wires.some((w) => w.id === r)) { s.removeWire(r); return `Removed wire ${r}`; }
      s.remove(resolve(r)); return `Removed ${r}`;
    }
    case 'set_code': {
      const id = resolve(a.ref);
      const c = s.project.components.find((x) => x.id === id)!;
      if (!getDef(c.type).mcu) throw new Error(`${a.ref} is not a programmable board`);
      s.setCode(id, { lang: (a.lang === 'js' ? 'js' : 'arduino') as CodeLang, source: String(a.source), origin: 'AI' });
      return `Uploaded code to ${a.ref}`;
    }
    case 'set_power': s.setPowered(!!a.on); return `Power ${a.on ? 'on' : 'off'}`;
    case 'run': {
      s.setPowered(true);
      await sleep(Math.round(Math.min(5, Math.max(0.2, Number(a.seconds ?? 1.5))) * 1000));
      return JSON.stringify(readings());
    }
    case 'get_readings': return JSON.stringify(readings());
    case 'repair': s.repairAll(); return 'All parts replaced';
    case 'clear': s.clear(); return 'Canvas cleared';
    default: throw new Error(`Unknown tool ${call.name}`);
  }
}

export interface AgentConfig { provider: Provider; model: string; key: string }
export type Transport = (cfg: AgentConfig, messages: ChatMsg[]) => Promise<AgentReply>;

export const httpTransport: Transport = async (cfg, messages) => {
  const r = await fetch('/api/agent', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-user-key': cfg.key },
    body: JSON.stringify({ provider: cfg.provider, model: cfg.model, system: systemPrompt(), messages, tools: TOOLS }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error ?? `Request failed (${r.status})`);
  return data as AgentReply;
};

/** Runs the tool loop. `onUpdate` receives the growing history after every step. */
export async function runAgent(cfg: AgentConfig, history: ChatMsg[], onUpdate: (h: ChatMsg[]) => void, opts: { transport?: Transport; maxRounds?: number; signal?: AbortSignal } = {}) {
  const transport = opts.transport ?? httpTransport;
  let h = history;
  for (let round = 0; round < (opts.maxRounds ?? 12); round++) {
    if (opts.signal?.aborted) return h;
    const reply = await transport(cfg, h);
    h = [...h, { role: 'assistant', text: reply.text, toolCalls: reply.toolCalls }];
    onUpdate(h);
    if (reply.text) events.emit({ type: 'say', text: reply.text });
    if (!reply.toolCalls.length) return h;
    const results: ToolResult[] = [];
    for (const call of reply.toolCalls) {
      let content: string;
      try { content = await execTool(call); } catch (e) { content = `Error: ${(e as Error).message}`; }
      results.push({ id: call.id, name: call.name, content });
    }
    h = [...h, { role: 'tool', results }];
    onUpdate(h);
  }
  return h;
}
