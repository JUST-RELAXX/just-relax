import { describe, expect, it } from 'vitest';
import {
  clampParameter,
  createDefaultEffectSettings,
  effectDefinitions,
  findEffect,
  normalizeEffectSettings,
} from './effects-schema';

describe('shared effects schema', () => {
  it('defines each live effect and unique, in-range parameters', () => {
    expect(effectDefinitions.map((effect) => effect.id)).toEqual([
      'speed',
      'eq',
      'bass',
      'dynamics',
      'bitcrusher',
      'delay',
      'reverb',
      'spatial8d',
      'master',
    ]);
    const parameterIds = effectDefinitions.flatMap((effect) =>
      effect.params.map((param) => param.id),
    );
    expect(new Set(parameterIds).size).toBe(parameterIds.length);
    for (const effect of effectDefinitions) {
      for (const parameter of effect.params) {
        expect(parameter.default).toBeGreaterThanOrEqual(parameter.min);
        expect(parameter.default).toBeLessThanOrEqual(parameter.max);
      }
    }
  });

  it('creates neutral defaults and clamps out-of-range input', () => {
    const defaults = createDefaultEffectSettings();
    expect(defaults.eq.enabled).toBe(false);
    expect(defaults.speed.enabled).toBe(true);
    expect(defaults.master.enabled).toBe(true);
    const crusherBits = findEffect('bitcrusher').params[0];
    expect(clampParameter(crusherBits, 40)).toBe(16);
    expect(clampParameter(crusherBits, Number.NaN)).toBe(crusherBits.default);
  });

  it('normalizes persisted settings without enabling fixed effects or accepting invalid values', () => {
    const normalized = normalizeEffectSettings({
      eq: { enabled: true, params: { 'eq.60': -100, 'eq.170': 'loud' } },
      master: { enabled: false, params: { 'master.ceiling': -50 } },
      unknown: { enabled: true },
    });
    expect(normalized.eq.enabled).toBe(true);
    expect(normalized.eq.params['eq.60']).toBe(-12);
    expect(normalized.eq.params['eq.170']).toBe(0);
    expect(normalized.master.enabled).toBe(true);
    expect(normalized.master.params['master.ceiling']).toBe(-6);
    expect('unknown' in normalized).toBe(false);
  });
});
