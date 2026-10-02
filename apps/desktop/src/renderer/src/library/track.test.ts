import { describe, expect, it } from 'vitest';
import { formatTime, localTrackFromFile } from './track';

describe('local library track helpers', () => {
  it('uses a filename artist/title pattern when it is present', () => {
    const file = { name: 'Mira Sol - Quiet Room.flac', type: '' } as File;

    expect(
      localTrackFromFile(
        file,
        () => 'blob:local-track',
        () => 'track-1',
      ),
    ).toEqual({
      id: 'track-1',
      title: 'Quiet Room',
      artist: 'Mira Sol',
      album: '',
      fileName: 'Mira Sol - Quiet Room.flac',
      durationSeconds: 0,
      source: 'blob:local-track',
      artworkUrl: null,
      available: true,
    });
  });

  it('rejects files that are not recognized as audio', () => {
    const file = { name: 'notes.txt', type: 'text/plain' } as File;
    expect(
      localTrackFromFile(
        file,
        () => 'blob:unused',
        () => 'unused',
      ),
    ).toBeNull();
  });

  it('formats elapsed time in minutes or hours', () => {
    expect(formatTime(75.9)).toBe('1:15');
    expect(formatTime(3661)).toBe('1:01:01');
    expect(formatTime(Number.NaN)).toBe('0:00');
  });
});
