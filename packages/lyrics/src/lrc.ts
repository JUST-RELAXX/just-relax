export interface LyricLine {
  timeMs: number;
  text: string;
}

export interface ParsedLrc {
  lines: LyricLine[];
  offsetMs: number;
  metadata: Record<string, string>;
}

const STAMP = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
const META = /^\[([a-z]{2,8}):(.*)\]$/i;

export function parseLrc(source: string): ParsedLrc {
  const lines: LyricLine[] = [];
  const metadata: Record<string, string> = {};
  let offsetMs = 0;

  for (const rawLine of source.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const raw = rawLine.trim();
    const meta = raw.match(META);
    if (meta) {
      const key = meta[1].toLowerCase();
      metadata[key] = meta[2].trim();
      if (key === 'offset') {
        const parsed = Number.parseInt(meta[2], 10);
        offsetMs = Number.isFinite(parsed) ? parsed : 0;
      }
      continue;
    }

    const stamps = [...raw.matchAll(STAMP)];
    if (stamps.length === 0) continue;

    const text = raw.replace(STAMP, '').trim();
    for (const stamp of stamps) {
      const minutes = Number(stamp[1]);
      const seconds = Number(stamp[2]);
      if (seconds > 59) continue;
      const fraction = (stamp[3] ?? '').padEnd(3, '0').slice(0, 3);
      const milliseconds = fraction ? Number(fraction) : 0;
      lines.push({ timeMs: minutes * 60_000 + seconds * 1_000 + milliseconds, text });
    }
  }

  lines.sort((left, right) => left.timeMs - right.timeMs);
  return { lines, offsetMs, metadata };
}

/** Finds the last timestamp at or before source position, or -1 before the first line. */
export function activeLyricIndex(lines: readonly LyricLine[], positionMs: number): number {
  let low = 0;
  let high = lines.length - 1;
  let result = -1;

  while (low <= high) {
    const middle = (low + high) >>> 1;
    if (lines[middle].timeMs <= positionMs) {
      result = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return result;
}
