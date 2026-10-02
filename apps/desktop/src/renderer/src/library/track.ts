import type { LibraryTrack } from '../../../shared/library';

export type LocalTrack = LibraryTrack;

const supportedAudioFile = /\.(aac|flac|m4a|mp3|oga|ogg|opus|wav|webm)$/i;

export function localTrackFromFile(
  file: File,
  createSource: (file: File) => string = URL.createObjectURL,
  createId: () => string = () => globalThis.crypto.randomUUID(),
): LocalTrack | null {
  if (!file.type.startsWith('audio/') && !supportedAudioFile.test(file.name)) return null;

  const fileName = file.name;
  const baseName = fileName.replace(/\.[^.]+$/, '').trim() || fileName;
  const separator = baseName.match(/\s+-\s+/);
  const [artist, title] = separator
    ? [
        baseName.slice(0, separator.index).trim(),
        baseName.slice(separator.index! + separator[0].length).trim(),
      ]
    : ['Local file', baseName];

  return {
    id: createId(),
    title: title || baseName,
    artist: artist || 'Local file',
    album: '',
    fileName,
    durationSeconds: 0,
    source: createSource(file),
    artworkUrl: null,
    available: true,
  };
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const totalSeconds = Math.floor(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const remainder = String(totalSeconds % 60).padStart(2, '0');
  if (minutes < 60) return `${minutes}:${remainder}`;
  const hours = Math.floor(minutes / 60);
  return `${hours}:${String(minutes % 60).padStart(2, '0')}:${remainder}`;
}
