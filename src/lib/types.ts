export type Category = 'Power' | 'Passive' | 'Semiconductors' | 'Input' | 'Output' | 'Boards' | 'Tools';
export type PropKind = 'number' | 'select' | 'bool' | 'range';
export type PropValue = number | string | boolean;

export interface PropDef {
  key: string;
  label: string;
  kind: PropKind;
  default: PropValue;
  unit?: string;
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
}

export interface PinDef {
  name: string;
  x: number;
  y: number;
}

export type McuKind = 'uno' | 'esp32' | 'pico';

export interface CompDef {
  type: string;
  label: string;
  category: Category;
  w: number;
  h: number;
  pins: PinDef[];
  props: PropDef[];
  prefix: string;
  mcu?: McuKind;
  /** Groups of pin names that are internally shorted (breadboard strips). */
  bridges?: string[][];
  /** One-line description, used by the AI agent and tooltips. */
  description: string;
}

export type Rotation = 0 | 90 | 180 | 270;

export interface CompInst {
  id: string;
  type: string;
  x: number;
  y: number;
  rot: Rotation;
  props: Record<string, PropValue>;
}

export interface PinRef {
  c: string;
  p: string;
}

export interface Wire {
  id: string;
  a: PinRef;
  b: PinRef;
  color: string;
}

export type CodeLang = 'arduino' | 'js';

export interface CodeFile {
  lang: CodeLang;
  source: string;
  origin?: string;
}

export interface Project {
  version: 1;
  name: string;
  components: CompInst[];
  wires: Wire[];
  code: Record<string, CodeFile>;
}
