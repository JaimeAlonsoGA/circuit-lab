import { describe, expect, it } from 'vitest';
import { parseProject, toBomCsv, toJson, toKicadNet, toSpice } from '@/lib/export';
import { proj } from './helpers';

const p = proj([['b', 'battery9v'], ['r', 'resistor', { resistance: 470 }], ['d', 'led'], ['r2', 'resistor', { resistance: 470 }], ['g', 'ground']],
  [['b:+', 'r:a'], ['r:b', 'd:A'], ['d:K', 'b:-'], ['b:-', 'g:g'], ['b:+', 'r2:a'], ['r2:b', 'b:-']]);

describe('exporters', () => {
  it('writes a SPICE netlist with ground node 0', () => {
    const s = toSpice(p);
    expect(s).toMatch(/^R1 N\d+ N\d+ 470$/m);
    expect(s).toMatch(/^D1 N\d+ 0 LED_red$/m);
    expect(s).toContain('.model LED_red');
    expect(s.trim().endsWith('.end')).toBe(true);
  });
  it('groups the BOM', () => {
    const csv = toBomCsv(p).split('\n');
    expect(csv[0]).toBe('References,Component,Value,Quantity');
    expect(csv).toContain('R1 R2,Resistor,470Ω,2');
  });
  it('writes a KiCad netlist', () => {
    const k = toKicadNet(p);
    expect(k).toContain('(export (version "E")');
    expect(k).toContain('(ref "D1")');
    expect(k).toContain('(name "GND")');
  });
  it('round-trips JSON and rejects junk', () => {
    expect(parseProject(toJson(p)).components).toHaveLength(5);
    expect(() => parseProject('{"a":1}')).toThrow();
  });
});
