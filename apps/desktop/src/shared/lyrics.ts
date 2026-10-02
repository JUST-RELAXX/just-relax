export interface LyricsLookup {
  title: string;
  artist: string;
  album: string;
  durationSeconds: number;
}

export interface LyricsRecord {
  id?: number;
  trackName: string;
  artistName: string;
  albumName: string;
  duration: number;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
}

export type LyricsResult =
  | { status: 'disabled'; message: string }
  | { status: 'not-found' }
  | { status: 'ok'; record: LyricsRecord }
  | { status: 'results'; records: LyricsRecord[] }
  | { status: 'rate-limited'; retryAfterSeconds: number }
  | { status: 'error'; message: string };

export interface AuroraLyricsApi {
  getContact(): Promise<string | null>;
  setContact(value: string): Promise<string | null>;
  get(lookup: LyricsLookup): Promise<LyricsResult>;
  search(lookup: LyricsLookup): Promise<LyricsResult>;
}
