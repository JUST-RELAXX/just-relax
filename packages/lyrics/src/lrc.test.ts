import { describe, expect, it } from 'vitest';
import { activeLyricIndex, parseLrc } from './lrc';

describe('parseLrc', () => {
  it('supports metadata, signed offset, fractions, and multiple timestamps', () => {
    const parsed = parseLrc('[ar:Example Artist]\n[offset:-120]\n[00:05.5][01:02.05]A line');

    expect(parsed.metadata.ar).toBe('Example Artist');
    expect(parsed.offsetMs).toBe(-120);
    expect(parsed.lines).toEqual([
      { timeMs: 5_500, text: 'A line' },
      { timeMs: 62_050, text: 'A line' },
    ]);
  });

  it('keeps timestamped blank gaps and ignores malformed stamps', () => {
    const parsed = parseLrc('[00:03.000]\n[00:99.00]bad\n[00:05.25]next');
    expect(parsed.lines).toEqual([
      { timeMs: 3_000, text: '' },
      { timeMs: 5_250, text: 'next' },
    ]);
  });
});

describe('activeLyricIndex', () => {
  it('returns the active line and handles positions outside the document', () => {
    const { lines } = parseLrc('[00:02.00]one\n[00:07.00]two\n[00:09.00]three');
    expect(activeLyricIndex(lines, 1_999)).toBe(-1);
    expect(activeLyricIndex(lines, 7_000)).toBe(1);
    expect(activeLyricIndex(lines, 14_000)).toBe(2);
    expect(activeLyricIndex([], 0)).toBe(-1);
  });
});
