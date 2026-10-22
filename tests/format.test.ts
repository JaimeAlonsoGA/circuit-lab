import { describe, expect, it } from 'vitest';
import { parseSI, si } from '@/lib/format';
describe('SI formatting', () => {
  it('formats', () => { expect(si(4700, 'Ω')).toBe('4.7kΩ'); expect(si(1e-6, 'F')).toBe('1µF'); expect(si(0.0153, 'A')).toBe('15.3mA'); });
  it('parses', () => { expect(parseSI('4k7')).toBe(4700); expect(parseSI('100u')).toBeCloseTo(1e-4); expect(parseSI('2.2M')).toBe(2.2e6); expect(parseSI('10kΩ')).toBe(1e4); expect(parseSI('1e-6')).toBe(1e-6); expect(Number.isNaN(parseSI('abc'))).toBe(true); });
});
