const PREFIXES: [number, string][] = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p']];

/** Format a number with an SI prefix: 0.0047 F → "4.7mF". */
export function si(v: number, unit = '', digits = 3): string {
  if (!Number.isFinite(v)) return `— ${unit}`;
  if (v === 0) return `0${unit}`;
  const a = Math.abs(v);
  const [mul, p] = PREFIXES.find(([m]) => a >= m * 0.9995) ?? PREFIXES[PREFIXES.length - 1];
  const n = v / mul;
  return `${Number(n.toPrecision(digits))}${p}${unit}`;
}

/** Parse "4k7", "10k", "100u", "2.2M", "1e-6" → number. */
export function parseSI(s: string): number {
  const t = s.trim().replace(/Ω|ohm|F|H|V|A|W/gi, (m) => (m.toLowerCase() === 'm' ? m : ''));
  const m = /^(-?\d*\.?\d+(?:e-?\d+)?)\s*([GMkKmuµnp])?(\d*)$/.exec(t);
  if (!m) return Number.NaN;
  const mult: Record<string, number> = { G: 1e9, M: 1e6, k: 1e3, K: 1e3, m: 1e-3, u: 1e-6, 'µ': 1e-6, n: 1e-9, p: 1e-12 };
  const base = Number(m[1] + (m[3] ? `.${m[3]}` : ''));
  return m[2] ? base * mult[m[2]] : base;
}
