/**
 * A pragmatic Arduino-C/C++ → async JavaScript transpiler.
 * It understands the subset typical sketches use: globals, functions, control flow, arrays,
 * #define constants, Servo and Adafruit_SSD1306 objects. It is NOT a C++ compiler: pointers,
 * structs/classes, templates and integer overflow semantics are not supported.
 */
import type { CodeLang } from '@/lib/types';

const TYPES = '(?:int|long|short|float|double|bool|boolean|byte|char|word|String|size_t|u?int(?:8|16|32|64)_t|void|auto)';
const MODS = '(?:(?:const|static|volatile|unsigned|signed|inline)\\s+)*';
const FULLTYPE = `${MODS}${TYPES}(?:\\s+(?:long|int))*`;

export const RESERVED_CALLS = new Set(['if', 'for', 'while', 'switch', 'return', 'function', 'catch', 'sizeof']);

function protectStrings(src: string) {
  const strings: string[] = [];
  let out = '';
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (ch === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; out += ' '; continue; }
    if (ch === '"' || ch === "'" || ch === '`') {
      let j = i + 1;
      while (j < src.length && src[j] !== ch) { if (src[j] === '\\') j++; j++; }
      strings.push(src.slice(i, j + 1));
      out += `__S${strings.length - 1}__`;
      i = j + 1;
      continue;
    }
    out += ch; i++;
  }
  return { code: out, restore: (s: string) => s.replace(/__S(\d+)__/g, (_, n) => strings[Number(n)]) };
}

/** Replace `= {a, b}` array initialisers (after a `[]` declarator) with JS array literals. */
function convertArrayInits(code: string) {
  const re = /let\s+(\w+)\s*((?:\[[^\]]*\])+)\s*(=\s*\{|;)/g;
  let out = '';
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    out += code.slice(last, m.index);
    const [, name, dims, tail] = m;
    if (tail === ';') {
      const sizes = [...dims.matchAll(/\[([^\]]*)\]/g)].map((d) => d[1].trim() || '0');
      const make = (k: number): string => (k === sizes.length - 1 ? `new Array(${sizes[k]}).fill(0)` : `Array.from({length: ${sizes[k]}}, () => ${make(k + 1)})`);
      out += `let ${name} = ${make(0)};`;
      last = re.lastIndex;
      continue;
    }
    // Scan the balanced initialiser and turn braces into brackets.
    let i = re.lastIndex - 1; // at '{'
    let depth = 0;
    let body = '';
    for (; i < code.length; i++) {
      const ch = code[i];
      if (ch === '{') { depth++; body += '['; } else if (ch === '}') { depth--; body += ']'; if (depth === 0) { i++; break; } } else body += ch;
    }
    out += `let ${name} = ${body}`;
    last = i;
    re.lastIndex = i;
  }
  return out + code.slice(last);
}

export interface TranspileResult {
  js: string;
  functions: string[];
  warnings: string[];
}

export function transpile(source: string, lang: CodeLang): TranspileResult {
  const warnings: string[] = [];
  const { code: protectedSrc, restore } = protectStrings(source);
  let c = protectedSrc;

  if (lang === 'arduino') {
    c = c.replace(/^\s*#\s*include.*$/gm, '');
    c = c.replace(/^\s*#\s*define\s+(\w+)\s+(.+)$/gm, 'const $1 = $2;');
    c = c.replace(/^\s*#\s*define\s+(\w+)\s*$/gm, 'const $1 = 1;');
    c = c.replace(/^\s*#.*$/gm, '');
    c = c.replace(/\busing\s+namespace\s+\w+\s*;/g, '');
    if (/\b(struct|class|template)\b/.test(c)) warnings.push('struct/class/template are not supported by the in-browser runtime.');
    if (/[*&]\s*\w+\s*=/.test(c) && /\w+\s*\*\s+\w+/.test(c)) warnings.push('Pointers are not supported.');
    // Library objects.
    c = c.replace(/\bServo\s+(\w+)\s*;/g, 'let $1 = new Servo();');
    c = c.replace(/\bAdafruit_SSD1306\s+(\w+)\s*(\([^;]*\))?\s*;/g, 'let $1 = new SSD1306();');
    // Prototypes: `void foo(int a);` at statement level.
    c = c.replace(new RegExp(`^\\s*${FULLTYPE}\\s*\\*?\\s+\\w+\\s*\\([^)]*\\)\\s*;`, 'gm'), '');
    // Function definitions.
    c = c.replace(new RegExp(`(^|[;}\\s])${FULLTYPE}\\s*[*&]?\\s+(\\w+)\\s*\\(([^)]*)\\)\\s*\\{`, 'g'), (_m, pre, name, params: string) => {
      const ps = params.trim() === '' || params.trim() === 'void' ? [] : params.split(',').map((p) => {
        const [decl, def] = p.split('=');
        const id = decl.replace(/[[\]*&]/g, ' ').trim().split(/\s+/).pop();
        return def ? `${id} = ${def.trim()}` : id;
      });
      return `${pre}function ${name}(${ps.join(', ')}) {`;
    });
    // C-style casts and function-style casts.
    c = c.replace(new RegExp(`\\(\\s*${FULLTYPE}\\s*\\)\\s*`, 'g'), '');
    c = c.replace(/\b(int|long|byte|word)\s*\(/g, '__int(');
    c = c.replace(/\b(float|double)\s*\(/g, 'Number(');
    // Variable declarations (including in for-loops and multiple declarators).
    c = c.replace(new RegExp(`\\b${FULLTYPE}\\s*[*&]?\\s+(?=[A-Za-z_]\\w*\\s*(?:=|;|,|\\[|\\)|:))`, 'g'), 'let ');
    c = convertArrayInits(c);
    c = c.replace(/sizeof\s*\(\s*(\w+)\s*\)\s*\/\s*sizeof\s*\(\s*\1\s*\[\s*0\s*\]\s*\)/g, '$1.length');
    c = c.replace(/sizeof\s*\(\s*(\w+)\s*\)/g, '__sizeof($1)');
    c = c.replace(/\bB([01]{1,8})\b/g, '0b$1');
    c = c.replace(/\.length\(\)/g, '.length');
    c = c.replace(/\byield\s*\(\s*\)/g, '__yield()');
    c = c.replace(/(\d+(?:\.\d+)?)[fFuUlL]+\b/g, '$1');
  }

  // Make every user function async and await every call to it, plus blocking built-ins.
  const functions = [...c.matchAll(/\bfunction\s+(\w+)\s*\(/g)].map((m) => m[1]);
  c = c.replace(/\b(async\s+)?function\s+(\w+)\s*\(/g, 'async function $2(');
  const blocking = [...new Set([...functions, 'delay', 'delayMicroseconds', '__yield'])];
  if (blocking.length) {
    const re = new RegExp(`(^|[^.\\w])(${blocking.join('|')})\\s*\\(`, 'g');
    c = c.replace(re, (m, pre, name, offset: number, whole: string) => {
      const before = whole.slice(Math.max(0, offset - 16), offset + pre.length);
      if (/function\s*$/.test(before) || /await\s*$/.test(before)) return m;
      return `${pre}await ${name}(`;
    });
  }
  // Loop guards so `while (true) {}` without delay cannot freeze the tab.
  c = c.replace(/\b(while|for)\s*\(((?:[^()]|\((?:[^()]|\([^()]*\))*\))*)\)\s*\{/g, '$1 ($2) { if (__guard()) await __yield();');
  c = c.replace(/\bdo\s*\{/g, 'do { if (__guard()) await __yield();');

  return { js: restore(c), functions, warnings };
}
