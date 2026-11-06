import { describe, expect, it } from 'vitest';
import { FESTIVALS, resolveFestival } from '../src';

describe('festival themes', () => {
  it('every festival is well-formed', () => {
    const ids = new Set<string>();
    for (const f of FESTIVALS) {
      expect(ids.has(f.id)).toBe(false); ids.add(f.id);
      expect(f.gradient).toHaveLength(3);
      for (const c of [...f.gradient, f.text, f.accent, ...f.lights]) expect(c).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(f.particles.length).toBeGreaterThan(0);
      expect(['rise', 'fall', 'twinkle', 'float', 'burst', 'sway']).toContain(f.motion);
      expect(f.greeting.length).toBeGreaterThan(3);
    }
    expect(FESTIVALS.length).toBeGreaterThanOrEqual(12);
    expect(FESTIVALS.some((f) => f.kind === 'national')).toBe(true);
  });

  it('resolves the live festival and respects the IST end date', () => {
    expect(resolveFestival('')).toBeNull();
    expect(resolveFestival('nope')).toBeNull();
    expect(resolveFestival('diwali')?.id).toBe('diwali');
    expect(resolveFestival('diwali', '2026-11-12', new Date('2026-11-12T18:00:00+05:30'))?.id).toBe('diwali');   // last day still on
    expect(resolveFestival('diwali', '2026-11-12', new Date('2026-11-13T00:30:00+05:30'))).toBeNull();           // gone the next IST day
    expect(resolveFestival('diwali', 'garbage')?.id).toBe('diwali');                                               // bad date = no expiry
  });
});
