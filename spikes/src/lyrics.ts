import { activeLyricIndex, parseLrc, type LyricLine } from '@aurora/lyrics/lrc';
import './spikes.css';

const source = document.querySelector<HTMLTextAreaElement>('#lrc-source')!;
const lineList = document.querySelector<HTMLElement>('#line-list')!;
const status = document.querySelector<HTMLElement>('#parse-status')!;
const networkStatus = document.querySelector<HTMLElement>('#network-status')!;
const audio = document.querySelector<HTMLAudioElement>('#tone-player')!;
const candidates = document.querySelector<HTMLElement>('#candidate-list')!;
let lines: LyricLine[] = [];
let offsetMs = 0;

interface LrcResponse {
  trackName?: string;
  artistName?: string;
  albumName?: string;
  instrumental?: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
}

function makeReferenceWave(seconds = 35): Blob {
  const sampleRate = 22_050;
  const samples = Math.floor(sampleRate * seconds);
  const bytes = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(bytes);
  const write = (at: number, text: string) =>
    [...text].forEach((character, i) => view.setUint8(at + i, character.charCodeAt(0)));
  write(0, 'RIFF');
  view.setUint32(4, 36 + samples * 2, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, samples * 2, true);
  for (let index = 0; index < samples; index++) {
    const time = index / sampleRate;
    const fade = Math.min(1, time / 0.02, (seconds - time) / 0.02);
    const value = Math.round(4_500 * fade * Math.sin(2 * Math.PI * 440 * time));
    view.setInt16(44 + index * 2, value, true);
  }
  return new Blob([bytes], { type: 'audio/wav' });
}

audio.src = URL.createObjectURL(makeReferenceWave());

function renderLines(active = -1): void {
  lineList.replaceChildren();
  if (lines.length === 0) {
    lineList.innerHTML = '<p class="empty-lyrics">No timed lines yet.</p>';
    return;
  }
  lines.forEach((line, index) => {
    const button = document.createElement('button');
    button.className = `lyric-line${index === active ? ' active' : index < active ? ' past' : ''}`;
    button.textContent = line.text || '♪';
    button.title = `${(line.timeMs / 1_000).toFixed(2)} seconds · click to seek`;
    button.addEventListener('click', () => {
      audio.currentTime = line.timeMs / 1_000;
    });
    lineList.append(button);
  });
  if (active >= 0) {
    const activeElement = lineList.children[active] as HTMLElement | undefined;
    activeElement?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

function loadLrc(text: string): void {
  const parsed = parseLrc(text);
  lines = parsed.lines;
  offsetMs = parsed.offsetMs;
  renderLines(activeLyricIndex(lines, audio.currentTime * 1_000 + offsetMs));
  status.textContent = `${lines.length} timed lines${offsetMs ? ` · offset ${offsetMs} ms` : ''}`;
}

async function request(endpoint: 'get' | 'search'): Promise<void> {
  const artist = document.querySelector<HTMLInputElement>('#artist')!.value.trim();
  const title = document.querySelector<HTMLInputElement>('#track')!.value.trim();
  const album = document.querySelector<HTMLInputElement>('#album')!.value.trim();
  const duration = document.querySelector<HTMLInputElement>('#duration')!.value.trim();
  const params = new URLSearchParams({ artist_name: artist, track_name: title });
  if (album) params.set('album_name', album);
  if (duration) params.set('duration', String(Math.round(Number(duration))));
  if (endpoint === 'search') {
    params.delete('duration');
    params.set('q', `${artist} ${title}`);
  }

  candidates.replaceChildren();
  networkStatus.textContent = 'Contacting LRCLIB…';
  try {
    const response = await fetch(`/api/lrclib/${endpoint}?${params}`);
    const data: unknown = response.status === 404 ? null : await response.json();
    if (response.status === 400 || response.status === 502) {
      const problem = data as { error?: string };
      throw new Error(problem.error ?? 'Live lyrics lookup is unavailable.');
    }
    if (endpoint === 'search' && Array.isArray(data)) {
      showCandidates(data as LrcResponse[]);
      return;
    }
    if (!data) {
      networkStatus.textContent =
        endpoint === 'search'
          ? 'No search results. Check the artist and title.'
          : 'No exact match. Try Search LRCLIB.';
      return;
    }
    showLyrics(data as LrcResponse);
  } catch (error) {
    networkStatus.textContent = error instanceof Error ? error.message : 'Lyrics lookup failed.';
  }
}

function showLyrics(result: LrcResponse): void {
  if (result.instrumental) {
    networkStatus.textContent = 'Instrumental ♪ · this track has no vocals.';
    return;
  }
  if (result.syncedLyrics) {
    source.value = result.syncedLyrics;
    loadLrc(result.syncedLyrics);
    networkStatus.textContent = `Synced lyrics · ${result.artistName ?? 'artist'} — ${result.trackName ?? 'track'}`;
    return;
  }
  if (result.plainLyrics) {
    source.value = result.plainLyrics;
    lines = [];
    renderLines();
    lineList.innerHTML = `<p class="plain-lyrics">${escapeHtml(result.plainLyrics).replaceAll('\n', '<br>')}</p>`;
    networkStatus.textContent = 'No synced lyrics · showing plain text.';
    return;
  }
  networkStatus.textContent = 'No lyrics were found for this version.';
}

function showCandidates(items: LrcResponse[]): void {
  if (items.length === 0) {
    networkStatus.textContent = 'No search results. Check the artist and title.';
    return;
  }
  networkStatus.textContent = `${items.length} matches · choose the right version.`;
  for (const item of items.slice(0, 8)) {
    const button = document.createElement('button');
    button.className = 'candidate-item';
    button.innerHTML = `<strong>${escapeHtml(item.trackName ?? 'Unknown track')}</strong><span>${escapeHtml(item.artistName ?? 'Unknown artist')} · ${escapeHtml(item.albumName ?? 'Album unavailable')}</span>`;
    button.addEventListener('click', () => showLyrics(item));
    candidates.append(button);
  }
}

function escapeHtml(value: string): string {
  const entities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return value.replace(/[&<>"']/g, (character) => entities[character]);
}

document.querySelector('#apply-lrc')!.addEventListener('click', () => loadLrc(source.value));
document.querySelector('#exact-fetch')!.addEventListener('click', () => void request('get'));
document.querySelector('#search-fetch')!.addEventListener('click', () => void request('search'));

audio.addEventListener('timeupdate', () => {
  const active = activeLyricIndex(lines, audio.currentTime * 1_000 + offsetMs);
  const current = lineList.querySelector('.active');
  if (current !== lineList.children[active]) renderLines(active);
});

loadLrc(source.value);
