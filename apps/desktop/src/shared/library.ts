export interface LibraryTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  fileName: string;
  durationSeconds: number;
  source: string;
  artworkUrl: string | null;
  available: boolean;
}

export interface ImportTracksResult {
  tracks: LibraryTrack[];
  rejectedCount: number;
}

export interface AuroraLibraryApi {
  list(): Promise<LibraryTrack[]>;
  import(): Promise<ImportTracksResult>;
  remove(id: string): Promise<void>;
}

export const SUPPORTED_AUDIO_EXTENSIONS = [
  'aac',
  'aiff',
  'flac',
  'm4a',
  'mp3',
  'oga',
  'ogg',
  'opus',
  'wav',
  'webm',
] as const;
