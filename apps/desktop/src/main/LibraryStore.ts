import { randomUUID } from 'node:crypto';
import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { parseFile } from 'music-metadata';
import type { ImportTracksResult, LibraryTrack } from '../shared/library';
import { SUPPORTED_AUDIO_EXTENSIONS } from '../shared/library';

interface StoredTrack {
  id: string;
  filePath: string;
  fileName: string;
  title: string;
  artist: string;
  album: string;
  durationSeconds: number;
  artworkFileName: string | null;
}

interface LibraryData {
  version: 1;
  tracks: StoredTrack[];
}

const MAX_ARTWORK_BYTES = 1024 * 1024;
const artworkExtensions: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

function fallbackNames(fileName: string): { title: string; artist: string } {
  const baseName = fileName.replace(/\.[^.]+$/, '').trim() || fileName;
  const match = baseName.match(/^(.+?)\s+-\s+(.+)$/);
  return match
    ? { artist: match[1].trim() || 'Local file', title: match[2].trim() || baseName }
    : { artist: 'Local file', title: baseName };
}

function isStoredTrack(value: unknown): value is StoredTrack {
  if (!value || typeof value !== 'object') return false;
  const track = value as Partial<StoredTrack>;
  return (
    typeof track.id === 'string' &&
    /^[\da-f-]{36}$/i.test(track.id) &&
    typeof track.filePath === 'string' &&
    typeof track.fileName === 'string' &&
    typeof track.title === 'string' &&
    typeof track.artist === 'string' &&
    typeof track.album === 'string' &&
    typeof track.durationSeconds === 'number' &&
    (track.artworkFileName === null ||
      (typeof track.artworkFileName === 'string' &&
        new RegExp(`^${track.id}\\.(jpg|png|webp|gif)$`, 'i').test(track.artworkFileName)))
  );
}

export class LibraryStore {
  private data: LibraryData | null = null;

  constructor(private readonly userDataPath: string) {}

  async list(): Promise<LibraryTrack[]> {
    const data = await this.load();
    return Promise.all(data.tracks.map((track) => this.toPublicTrack(track)));
  }

  async importFiles(filePaths: string[]): Promise<ImportTracksResult> {
    const data = await this.load();
    const existingPaths = new Set(data.tracks.map((track) => this.pathKey(track.filePath)));
    let rejectedCount = 0;
    const imported: StoredTrack[] = [];

    for (const candidate of filePaths) {
      const filePath = resolve(candidate);
      if (!this.isSupported(filePath) || existingPaths.has(this.pathKey(filePath))) {
        rejectedCount += 1;
        continue;
      }

      try {
        await access(filePath);
        const fileName = basename(filePath);
        const names = fallbackNames(fileName);
        let title = names.title;
        let artist = names.artist;
        let album = '';
        let durationSeconds = 0;
        let artworkFileName: string | null = null;
        const id = randomUUID();

        try {
          const metadata = await parseFile(filePath, { duration: true });
          title = metadata.common.title?.trim() || title;
          artist = metadata.common.artist?.trim() || artist;
          album = metadata.common.album?.trim() || '';
          durationSeconds = Number.isFinite(metadata.format.duration)
            ? Math.max(0, metadata.format.duration ?? 0)
            : 0;
          const picture = metadata.common.picture?.[0];
          const extension = picture ? artworkExtensions[picture.format.toLowerCase()] : undefined;
          if (picture && extension && picture.data.byteLength <= MAX_ARTWORK_BYTES) {
            await mkdir(this.artworkDirectory, { recursive: true });
            artworkFileName = `${id}${extension}`;
            await writeFile(join(this.artworkDirectory, artworkFileName), picture.data);
          }
        } catch {
          // Untagged or partially damaged files can still be added by filename.
        }

        imported.push({
          id,
          filePath,
          fileName,
          title,
          artist,
          album,
          durationSeconds,
          artworkFileName,
        });
        existingPaths.add(this.pathKey(filePath));
      } catch {
        rejectedCount += 1;
      }
    }

    if (imported.length > 0) {
      data.tracks.push(...imported);
      await this.save(data);
    }

    return {
      tracks: await Promise.all(imported.map((track) => this.toPublicTrack(track))),
      rejectedCount,
    };
  }

  async remove(id: string): Promise<void> {
    if (!/^[\da-f-]{36}$/i.test(id)) throw new Error('Invalid track ID.');
    const data = await this.load();
    const track = data.tracks.find((item) => item.id === id);
    if (!track) return;
    data.tracks = data.tracks.filter((item) => item.id !== id);
    await this.save(data);
    if (track.artworkFileName) {
      await rm(join(this.artworkDirectory, track.artworkFileName), { force: true });
    }
  }

  async trackPath(id: string): Promise<string | null> {
    if (!/^[\da-f-]{36}$/i.test(id)) return null;
    const data = await this.load();
    const track = data.tracks.find((item) => item.id === id);
    return track ? track.filePath : null;
  }

  async artworkPath(id: string): Promise<string | null> {
    if (!/^[\da-f-]{36}$/i.test(id)) return null;
    const data = await this.load();
    const track = data.tracks.find((item) => item.id === id);
    if (!track?.artworkFileName || basename(track.artworkFileName) !== track.artworkFileName) {
      return null;
    }
    return join(this.artworkDirectory, track.artworkFileName);
  }

  private get dataFile(): string {
    return join(this.userDataPath, 'library.json');
  }

  private get artworkDirectory(): string {
    return join(this.userDataPath, 'artwork');
  }

  private pathKey(filePath: string): string {
    const key = resolve(filePath);
    return process.platform === 'win32' ? key.toLocaleLowerCase('en-US') : key;
  }

  private isSupported(filePath: string): boolean {
    const extension = extname(filePath).slice(1).toLowerCase();
    return (SUPPORTED_AUDIO_EXTENSIONS as readonly string[]).includes(extension);
  }

  private async load(): Promise<LibraryData> {
    if (this.data) return this.data;
    try {
      const raw: unknown = JSON.parse(await readFile(this.dataFile, 'utf8'));
      if (
        !raw ||
        typeof raw !== 'object' ||
        (raw as Partial<LibraryData>).version !== 1 ||
        !Array.isArray((raw as Partial<LibraryData>).tracks) ||
        !(raw as LibraryData).tracks.every(isStoredTrack)
      ) {
        throw new Error('The saved music library has an unsupported format.');
      }
      this.data = raw as LibraryData;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      this.data = { version: 1, tracks: [] };
    }
    return this.data;
  }

  private async save(data: LibraryData): Promise<void> {
    await mkdir(this.userDataPath, { recursive: true });
    const temporaryFile = `${this.dataFile}.tmp`;
    await writeFile(temporaryFile, JSON.stringify(data, null, 2), 'utf8');
    await rename(temporaryFile, this.dataFile);
    this.data = data;
  }

  private async toPublicTrack(track: StoredTrack): Promise<LibraryTrack> {
    let available = true;
    try {
      await access(track.filePath);
    } catch {
      available = false;
    }
    let artworkAvailable = false;
    if (track.artworkFileName) {
      try {
        await access(join(this.artworkDirectory, track.artworkFileName));
        artworkAvailable = true;
      } catch {
        artworkAvailable = false;
      }
    }
    return {
      id: track.id,
      title: track.title,
      artist: track.artist,
      album: track.album,
      fileName: track.fileName,
      durationSeconds: track.durationSeconds,
      source: `aurora-media://track/${track.id}`,
      artworkUrl: artworkAvailable ? `aurora-media://artwork/${track.id}` : null,
      available,
    };
  }
}
