import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LibraryStore } from './LibraryStore';

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'aurora-library-'));
  temporaryDirectories.push(path);
  return path;
}

async function writeOneSecondWave(path: string): Promise<void> {
  const sampleRate = 8000;
  const dataSize = sampleRate;
  const wave = Buffer.alloc(44 + dataSize);
  wave.write('RIFF', 0);
  wave.writeUInt32LE(36 + dataSize, 4);
  wave.write('WAVE', 8);
  wave.write('fmt ', 12);
  wave.writeUInt32LE(16, 16);
  wave.writeUInt16LE(1, 20);
  wave.writeUInt16LE(1, 22);
  wave.writeUInt32LE(sampleRate, 24);
  wave.writeUInt32LE(sampleRate, 28);
  wave.writeUInt16LE(1, 32);
  wave.writeUInt16LE(8, 34);
  wave.write('data', 36);
  wave.writeUInt32LE(dataSize, 40);
  wave.fill(128, 44);
  await writeFile(path, wave);
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe('LibraryStore', () => {
  it('persists file picks and metadata across store instances', async () => {
    const root = await temporaryDirectory();
    const audioPath = join(root, 'Sample Artist - Sample Song.wav');
    await writeOneSecondWave(audioPath);

    const firstStore = new LibraryStore(join(root, 'aurora-data'));
    const result = await firstStore.importFiles([audioPath]);
    expect(result.rejectedCount).toBe(0);
    expect(result.tracks).toHaveLength(1);
    expect(result.tracks[0]).toMatchObject({
      title: 'Sample Song',
      artist: 'Sample Artist',
      fileName: 'Sample Artist - Sample Song.wav',
      available: true,
    });
    expect(result.tracks[0].durationSeconds).toBeCloseTo(1, 1);

    const restartedStore = new LibraryStore(join(root, 'aurora-data'));
    await expect(restartedStore.list()).resolves.toEqual(result.tracks);
  });

  it('rejects duplicates and unsupported files, then removes only the library entry', async () => {
    const root = await temporaryDirectory();
    const audioPath = join(root, 'Song.wav');
    const unsupportedPath = join(root, 'notes.txt');
    await writeOneSecondWave(audioPath);
    await writeFile(unsupportedPath, 'not audio');

    const store = new LibraryStore(join(root, 'aurora-data'));
    const first = await store.importFiles([audioPath]);
    const repeated = await store.importFiles([audioPath, unsupportedPath]);
    expect(repeated.tracks).toHaveLength(0);
    expect(repeated.rejectedCount).toBe(2);
    await store.remove(first.tracks[0].id);
    await expect(store.list()).resolves.toEqual([]);
    await expect(access(audioPath)).resolves.toBeUndefined();
  });

  it('keeps a saved entry visible when its original file has moved', async () => {
    const root = await temporaryDirectory();
    const audioPath = join(root, 'Moved later.wav');
    await writeOneSecondWave(audioPath);
    const store = new LibraryStore(join(root, 'aurora-data'));
    await store.importFiles([audioPath]);
    await rm(audioPath);

    const [track] = await new LibraryStore(join(root, 'aurora-data')).list();
    expect(track.available).toBe(false);
  });
});
