import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { APP_VERSION } from '../shared/app-config';
import type { LyricsLookup, LyricsRecord, LyricsResult } from '../shared/lyrics';

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_REQUEST_GAP_MS = 300;
const MAX_CACHE_ENTRIES = 500;

type CacheableResult = Extract<LyricsResult, { status: 'not-found' | 'ok' | 'results' }>;
interface CacheEntry {
  expiresAt: number;
  result: CacheableResult;
}
interface CacheFile {
  version: 1;
  entries: Record<string, CacheEntry>;
}
interface ClientSettings {
  version: 1;
  contact: string | null;
}
type ServiceResponse = { status: number; ok: boolean; headers: Headers; json(): Promise<unknown> };
type Fetcher = (url: string, headers: Record<string, string>) => Promise<ServiceResponse>;

export function isValidLyricsContact(value: string): boolean {
  const contact = value.trim();
  if (contact.length < 5 || contact.length > 250) return false;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) return true;
  try {
    const url = new URL(contact);
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function isLyricsRecord(value: unknown): value is LyricsRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<LyricsRecord>;
  return (
    typeof record.trackName === 'string' &&
    typeof record.artistName === 'string' &&
    (typeof record.albumName === 'string' || record.albumName === undefined) &&
    (typeof record.duration === 'number' || record.duration === undefined) &&
    (typeof record.instrumental === 'boolean' || record.instrumental === undefined) &&
    (typeof record.plainLyrics === 'string' ||
      record.plainLyrics === null ||
      record.plainLyrics === undefined) &&
    (typeof record.syncedLyrics === 'string' ||
      record.syncedLyrics === null ||
      record.syncedLyrics === undefined)
  );
}

function normalizeRecord(record: LyricsRecord): LyricsRecord {
  return {
    id: record.id,
    trackName: record.trackName,
    artistName: record.artistName,
    albumName: record.albumName ?? '',
    duration: record.duration ?? 0,
    instrumental: record.instrumental ?? false,
    plainLyrics: record.plainLyrics ?? null,
    syncedLyrics: record.syncedLyrics ?? null,
  };
}

function cacheable(value: unknown): value is CacheableResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as Partial<CacheableResult>;
  if (result.status === 'not-found') return true;
  if (result.status === 'ok') return isLyricsRecord(result.record);
  if (result.status === 'results') {
    return Array.isArray(result.records) && result.records.every(isLyricsRecord);
  }
  return false;
}

function cacheKey(kind: 'get' | 'search', lookup: LyricsLookup): string {
  return JSON.stringify([
    kind,
    lookup.artist.trim().toLocaleLowerCase(),
    lookup.title.trim().toLocaleLowerCase(),
    lookup.album.trim().toLocaleLowerCase(),
    kind === 'get' ? Math.round(lookup.durationSeconds) : 0,
  ]);
}

function retryAfterMilliseconds(value: string | null, now: number): number {
  if (!value) return 30_000;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : 30_000;
}

export class LRCLIBService {
  private contact: string | null = null;
  private settingsLoaded = false;
  private cache: CacheFile | null = null;
  private cacheLoad: Promise<CacheFile> | null = null;
  private readonly inFlight = new Map<string, Promise<LyricsResult>>();
  private requestQueue: Promise<void> = Promise.resolve();
  private lastRequestAt = 0;
  private blockedUntil = 0;

  constructor(
    private readonly userDataPath: string,
    private readonly environmentContact: string | undefined,
    private readonly fetcher: Fetcher,
    private readonly now: () => number = Date.now,
    private readonly sleep: (milliseconds: number) => Promise<void> = (milliseconds) =>
      new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds)),
  ) {}

  async getContact(): Promise<string | null> {
    await this.loadSettings();
    return this.contact;
  }

  async setContact(value: string): Promise<string | null> {
    const contact = value.trim();
    if (contact && !isValidLyricsContact(contact)) {
      throw new Error('Enter a valid HTTPS project page or contact email.');
    }
    await this.loadSettings();
    this.contact = contact || null;
    const settings: ClientSettings = { version: 1, contact: this.contact };
    await this.writeJson(this.settingsFile, settings);
    return this.contact;
  }

  async get(lookup: LyricsLookup): Promise<LyricsResult> {
    if (!lookup.title.trim() || !lookup.artist.trim()) {
      return { status: 'error', message: 'Add a track title and artist before looking up lyrics.' };
    }
    const url = new URL('https://lrclib.net/api/get');
    url.searchParams.set('track_name', lookup.title.trim());
    url.searchParams.set('artist_name', lookup.artist.trim());
    if (lookup.album.trim()) url.searchParams.set('album_name', lookup.album.trim());
    const duration = Math.round(lookup.durationSeconds);
    if (duration >= 1 && duration <= 3600) url.searchParams.set('duration', String(duration));

    return this.cachedRequest(cacheKey('get', lookup), url.href, async (response) => {
      if (response.status === 404) return { status: 'not-found' };
      if (!response.ok)
        return { status: 'error', message: 'LRCLIB could not find a match right now.' };
      const data: unknown = await response.json();
      if (!isLyricsRecord(data))
        return { status: 'error', message: 'LRCLIB returned an unreadable response.' };
      return { status: 'ok', record: normalizeRecord(data) };
    });
  }

  async search(lookup: LyricsLookup): Promise<LyricsResult> {
    const keywords = [lookup.title.trim(), lookup.artist.trim(), lookup.album.trim()]
      .filter(Boolean)
      .join(' ');
    if (!keywords)
      return { status: 'error', message: 'Add a title or artist to search for lyrics.' };
    const url = new URL('https://lrclib.net/api/search');
    url.searchParams.set('q', keywords);
    return this.cachedRequest(
      cacheKey('search', { ...lookup, title: keywords }),
      url.href,
      async (response) => {
        if (response.status === 404) return { status: 'not-found' };
        if (!response.ok)
          return { status: 'error', message: 'LRCLIB search is unavailable right now.' };
        const data: unknown = await response.json();
        if (!Array.isArray(data) || !data.every(isLyricsRecord)) {
          return { status: 'error', message: 'LRCLIB returned an unreadable search response.' };
        }
        const records = data.slice(0, 20).map((record) => normalizeRecord(record));
        return records.length ? { status: 'results', records } : { status: 'not-found' };
      },
    );
  }

  private get settingsFile(): string {
    return join(this.userDataPath, 'lyrics-client.json');
  }

  private get cacheFile(): string {
    return join(this.userDataPath, 'lyrics-cache.json');
  }

  private async loadSettings(): Promise<void> {
    if (this.settingsLoaded) return;
    this.settingsLoaded = true;
    if (this.environmentContact && isValidLyricsContact(this.environmentContact)) {
      this.contact = this.environmentContact.trim();
      return;
    }
    try {
      const value: unknown = JSON.parse(await readFile(this.settingsFile, 'utf8'));
      const contact =
        value && typeof value === 'object' ? (value as Partial<ClientSettings>).contact : null;
      this.contact = typeof contact === 'string' && isValidLyricsContact(contact) ? contact : null;
    } catch {
      this.contact = null;
    }
  }

  private async loadCache(): Promise<CacheFile> {
    if (this.cache) return this.cache;
    if (!this.cacheLoad) {
      this.cacheLoad = (async () => {
        try {
          const value: unknown = JSON.parse(await readFile(this.cacheFile, 'utf8'));
          if (
            value &&
            typeof value === 'object' &&
            (value as Partial<CacheFile>).version === 1 &&
            (value as Partial<CacheFile>).entries &&
            typeof (value as Partial<CacheFile>).entries === 'object'
          ) {
            const entries = (value as CacheFile).entries;
            for (const [key, entry] of Object.entries(entries)) {
              if (!entry || typeof entry.expiresAt !== 'number' || !cacheable(entry.result)) {
                delete entries[key];
              }
            }
            this.cache = { version: 1, entries };
          } else {
            this.cache = { version: 1, entries: {} };
          }
        } catch {
          this.cache = { version: 1, entries: {} };
        }
        return this.cache;
      })();
    }
    try {
      return await this.cacheLoad;
    } finally {
      this.cacheLoad = null;
    }
  }

  private async cachedRequest(
    key: string,
    url: string,
    decode: (
      response: ServiceResponse,
    ) => Promise<CacheableResult | Extract<LyricsResult, { status: 'error' }>>,
  ): Promise<LyricsResult> {
    const cache = await this.loadCache();
    const cached = cache.entries[key];
    if (cached && cached.expiresAt > this.now()) return cached.result;
    if (cached) delete cache.entries[key];
    const inFlight = this.inFlight.get(key);
    if (inFlight) return inFlight;

    const request = this.send(url)
      .then(async (outcome) => {
        if (outcome.status === 'rate-limited') return outcome;
        if (outcome.status === 'error') return outcome;
        const result = await decode(outcome.response);
        if (result.status === 'error') return result;
        cache.entries[key] = { expiresAt: this.now() + CACHE_TTL_MS, result };
        const valid = Object.entries(cache.entries)
          .filter(([, entry]) => entry.expiresAt > this.now())
          .slice(-MAX_CACHE_ENTRIES);
        cache.entries = Object.fromEntries(valid);
        await this.writeJson(this.cacheFile, cache).catch(() => undefined);
        return result;
      })
      .catch(() => ({
        status: 'error' as const,
        message: 'LRCLIB could not be reached. Try again later.',
      }));
    this.inFlight.set(key, request);
    try {
      return await request;
    } finally {
      this.inFlight.delete(key);
    }
  }

  private async send(
    url: string,
  ): Promise<
    | { status: 'response'; response: ServiceResponse }
    | { status: 'rate-limited'; retryAfterSeconds: number }
    | { status: 'error'; message: string }
  > {
    await this.loadSettings();
    if (!this.contact) {
      return {
        status: 'error',
        message: 'Set a project homepage or contact email in Settings before using LRCLIB.',
      };
    }

    const queued = this.requestQueue.then(async () => {
      const waitForThrottle = Math.max(0, this.lastRequestAt + MIN_REQUEST_GAP_MS - this.now());
      const waitForRateLimit = Math.max(0, this.blockedUntil - this.now());
      const wait = Math.max(waitForThrottle, waitForRateLimit);
      if (wait > 0) await this.sleep(wait);
      if (this.blockedUntil > this.now()) {
        return {
          status: 'rate-limited' as const,
          retryAfterSeconds: Math.ceil((this.blockedUntil - this.now()) / 1000),
        };
      }
      this.lastRequestAt = this.now();
      try {
        const response = await this.fetcher(url, {
          Accept: 'application/json',
          'User-Agent': `Aurora/${APP_VERSION} (${this.contact})`,
        });
        if (response.status === 429) {
          const retryMs = retryAfterMilliseconds(response.headers.get('retry-after'), this.now());
          this.blockedUntil = this.now() + retryMs;
          return { status: 'rate-limited' as const, retryAfterSeconds: Math.ceil(retryMs / 1000) };
        }
        return { status: 'response' as const, response };
      } catch {
        return {
          status: 'error' as const,
          message: 'LRCLIB could not be reached. Try again later.',
        };
      }
    });
    this.requestQueue = queued.then(
      () => undefined,
      () => undefined,
    );
    return queued;
  }

  private async writeJson(path: string, value: unknown): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    const temporaryFile = `${path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryFile, JSON.stringify(value, null, 2), 'utf8');
      await rename(temporaryFile, path);
    } catch (error) {
      await unlink(temporaryFile).catch(() => undefined);
      throw error;
    }
  }
}
