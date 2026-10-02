import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LRCLIBService } from './LRCLIBService';

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'aurora-lyrics-'));
  temporaryDirectories.push(path);
  return path;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

const lookup = {
  title: 'Quiet Room',
  artist: 'Mira Sol',
  album: 'Little Signals',
  durationSeconds: 185.4,
};

const record = {
  id: 77,
  trackName: 'Quiet Room',
  artistName: 'Mira Sol',
  albumName: 'Little Signals',
  duration: 185,
  instrumental: false,
  plainLyrics: 'The room is quiet',
  syncedLyrics: '[00:01.00]The room is quiet',
};

describe('LRCLIBService', () => {
  it('keeps network lookup disabled until a valid client identity is configured', async () => {
    const fetcher = vi.fn();
    const service = new LRCLIBService(await temporaryDirectory(), undefined, fetcher);

    await expect(service.get(lookup)).resolves.toMatchObject({ status: 'error' });
    expect(fetcher).not.toHaveBeenCalled();
    await expect(service.setContact('not a contact')).rejects.toThrow('valid HTTPS');
  });

  it('uses the required identity header and reuses its persistent seven-day cache', async () => {
    const root = await temporaryDirectory();
    const fetcher = vi.fn(async (url: string, headers: Record<string, string>) => {
      expect(url).toContain('/api/get?');
      expect(url).toContain('duration=185');
      expect(headers['User-Agent']).toMatch(/^Aurora\/0\.1\.0 \(https:\/\/aurora\.example\)$/);
      return new Response(JSON.stringify(record), { status: 200 });
    });
    const first = new LRCLIBService(root, undefined, fetcher);
    await first.setContact('https://aurora.example');
    await expect(first.get(lookup)).resolves.toMatchObject({ status: 'ok', record });

    const restarted = new LRCLIBService(root, undefined, fetcher);
    await expect(restarted.get(lookup)).resolves.toMatchObject({ status: 'ok', record });
    expect(await restarted.getContact()).toBe('https://aurora.example');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('caches exact misses and returns manual search candidates', async () => {
    const root = await temporaryDirectory();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([record]), { status: 200 }));
    const service = new LRCLIBService(root, 'contact@aurora.example', fetcher);

    await expect(service.get(lookup)).resolves.toEqual({ status: 'not-found' });
    await expect(service.get(lookup)).resolves.toEqual({ status: 'not-found' });
    await expect(service.search(lookup)).resolves.toMatchObject({
      status: 'results',
      records: [record],
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('waits for the service Retry-After window before making another request', async () => {
    const root = await temporaryDirectory();
    let currentTime = 1_000;
    const sleep = vi.fn(async (milliseconds: number) => {
      currentTime += milliseconds;
    });
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({}), { status: 429, headers: { 'Retry-After': '2' } }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(record), { status: 200 }));
    const service = new LRCLIBService(
      root,
      'https://aurora.example',
      fetcher,
      () => currentTime,
      sleep,
    );

    await expect(service.get(lookup)).resolves.toMatchObject({
      status: 'rate-limited',
      retryAfterSeconds: 2,
    });
    await expect(service.get(lookup)).resolves.toMatchObject({ status: 'ok' });
    expect(sleep).toHaveBeenCalledWith(2000);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
