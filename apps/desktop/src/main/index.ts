import { app, BrowserWindow, dialog, ipcMain, net, protocol, session } from 'electron';
import { createReadStream } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { extname, resolve, sep, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { APP_NAME } from '../shared/app-config';
import { SUPPORTED_AUDIO_EXTENSIONS } from '../shared/library';
import type { LyricsLookup } from '../shared/lyrics';
import { LRCLIBService } from './LRCLIBService';
import { LibraryStore } from './LibraryStore';

const APP_ID = 'com.aurora.musicplayer';

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'aurora',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
  {
    scheme: 'aurora-media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

let library: LibraryStore;
let lyricsService: LRCLIBService;

function isTrustedPageUrl(address: string): boolean {
  if (!process.env.ELECTRON_RENDERER_URL) {
    try {
      const url = new URL(address);
      return url.protocol === 'aurora:' && url.hostname === 'app';
    } catch {
      return false;
    }
  }
  try {
    return new URL(address).origin === new URL(process.env.ELECTRON_RENDERER_URL).origin;
  } catch {
    return false;
  }
}

function isTrustedOrigin(origin: string): boolean {
  return isTrustedPageUrl(origin);
}

function assertTrustedFrame(event: Electron.IpcMainInvokeEvent): void {
  if (event.senderFrame !== event.sender.mainFrame || !isTrustedPageUrl(event.senderFrame.url)) {
    throw new Error('This request is only available to the Aurora window.');
  }
}

function isLyricsLookup(value: unknown): value is LyricsLookup {
  if (!value || typeof value !== 'object') return false;
  const lookup = value as Partial<LyricsLookup>;
  return (
    typeof lookup.title === 'string' &&
    lookup.title.length <= 300 &&
    typeof lookup.artist === 'string' &&
    lookup.artist.length <= 300 &&
    typeof lookup.album === 'string' &&
    lookup.album.length <= 300 &&
    typeof lookup.durationSeconds === 'number' &&
    Number.isFinite(lookup.durationSeconds) &&
    lookup.durationSeconds >= 0 &&
    lookup.durationSeconds <= 86_400
  );
}

function contentType(filePath: string, artwork = false): string {
  const extension = extname(filePath).slice(1).toLowerCase();
  if (artwork) {
    return (
      {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
        gif: 'image/gif',
      }[extension] ?? 'application/octet-stream'
    );
  }
  return (
    {
      aac: 'audio/aac',
      aiff: 'audio/aiff',
      flac: 'audio/flac',
      m4a: 'audio/mp4',
      mp3: 'audio/mpeg',
      oga: 'audio/ogg',
      ogg: 'audio/ogg',
      opus: 'audio/ogg',
      wav: 'audio/wav',
      webm: 'audio/webm',
    }[extension] ?? 'application/octet-stream'
  );
}

function parseRange(
  rangeHeader: string | null,
  size: number,
): { start: number; end: number } | null {
  if (!rangeHeader) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match || size === 0) return { start: -1, end: -1 };
  let start = match[1] ? Number(match[1]) : NaN;
  let end = match[2] ? Number(match[2]) : NaN;
  if (Number.isNaN(start)) {
    const suffixLength = end;
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return { start: -1, end: -1 };
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    if (!Number.isFinite(end)) end = size - 1;
    end = Math.min(end, size - 1);
  }
  if (start < 0 || start >= size || end < start) return { start: -1, end: -1 };
  return { start, end };
}

async function fileResponse(
  request: Request,
  filePath: string,
  artwork = false,
  origin = 'null',
): Promise<Response> {
  try {
    await access(filePath);
    const fileInfo = await stat(filePath);
    if (!fileInfo.isFile()) return new Response('Not found', { status: 404 });
    const range = parseRange(request.headers.get('range'), fileInfo.size);
    if (range && range.start < 0) {
      return new Response(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${fileInfo.size}`, 'Accept-Ranges': 'bytes' },
      });
    }
    const start = range?.start ?? 0;
    const end = range?.end ?? Math.max(0, fileInfo.size - 1);
    const headers = new Headers({
      'Accept-Ranges': 'bytes',
      'Content-Length': String(range ? end - start + 1 : fileInfo.size),
      'Content-Type': contentType(filePath, artwork),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Access-Control-Allow-Origin': origin,
      Vary: 'Origin',
    });
    if (range) headers.set('Content-Range', `bytes ${start}-${end}/${fileInfo.size}`);
    if (request.method === 'HEAD') {
      return new Response(null, { status: range ? 206 : 200, headers });
    }
    const fileStream = createReadStream(filePath, range ? { start, end } : undefined);
    return new Response(Readable.toWeb(fileStream) as ReadableStream<Uint8Array>, {
      status: range ? 206 : 200,
      headers,
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}

function setContentSecurityPolicy(): void {
  const isDev = Boolean(process.env.ELECTRON_RENDERER_URL);
  const policy = isDev
    ? "default-src 'self'; script-src 'self' 'unsafe-inline' http://localhost:*; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: aurora-media:; media-src 'self' blob: aurora-media:; connect-src 'self' http://localhost:* ws://localhost:* https://lrclib.net; object-src 'none'; base-uri 'self'"
    : "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob: aurora-media:; media-src 'self' blob: aurora-media:; connect-src 'self' https://lrclib.net; object-src 'none'; base-uri 'self'";

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [policy],
      },
    });
  });
}

function createWindow(): void {
  const window = new BrowserWindow({
    title: APP_NAME,
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 620,
    backgroundColor: '#08090f',
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0a0b12',
      symbolColor: '#dfe0eb',
      height: 42,
    },
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedPageUrl(url)) event.preventDefault();
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadURL('aurora://app/index.html');
  }
}

app.whenReady().then(() => {
  app.setAppUserModelId(APP_ID);
  library = new LibraryStore(app.getPath('userData'));
  lyricsService = new LRCLIBService(
    app.getPath('userData'),
    process.env.AURORA_CONTACT,
    (url, headers) => net.fetch(url, { headers }),
  );
  ipcMain.handle('library:list', async (event) => {
    assertTrustedFrame(event);
    return library.list();
  });
  ipcMain.handle('library:import', async (event) => {
    assertTrustedFrame(event);
    const options: Electron.OpenDialogOptions = {
      title: 'Add music to Aurora',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Audio files', extensions: [...SUPPORTED_AUDIO_EXTENSIONS] }],
    };
    const parent = BrowserWindow.fromWebContents(event.sender);
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options);
    return result.canceled
      ? { tracks: [], rejectedCount: 0 }
      : library.importFiles(result.filePaths);
  });
  ipcMain.handle('library:remove', async (event, id: unknown) => {
    assertTrustedFrame(event);
    if (typeof id !== 'string') throw new Error('Invalid track ID.');
    await library.remove(id);
  });
  ipcMain.handle('lyrics:get-contact', async (event) => {
    assertTrustedFrame(event);
    return lyricsService.getContact();
  });
  ipcMain.handle('lyrics:set-contact', async (event, value: unknown) => {
    assertTrustedFrame(event);
    if (typeof value !== 'string') throw new Error('Contact must be text.');
    return lyricsService.setContact(value);
  });
  ipcMain.handle('lyrics:get', async (event, value: unknown) => {
    assertTrustedFrame(event);
    if (!isLyricsLookup(value)) return { status: 'error', message: 'Invalid lyrics lookup.' };
    return lyricsService.get(value);
  });
  ipcMain.handle('lyrics:search', async (event, value: unknown) => {
    assertTrustedFrame(event);
    if (!isLyricsLookup(value)) return { status: 'error', message: 'Invalid lyrics search.' };
    return lyricsService.search(value);
  });
  setContentSecurityPolicy();
  protocol.handle('aurora-media', async (request) => {
    if (!['GET', 'HEAD'].includes(request.method))
      return new Response('Method not allowed', { status: 405 });
    const initiatorOrigin = (request as Request & { initiatorOrigin?: string }).initiatorOrigin;
    if (initiatorOrigin && !isTrustedOrigin(initiatorOrigin)) {
      return new Response('Forbidden', { status: 403 });
    }
    let url: URL;
    try {
      url = new URL(request.url);
    } catch {
      return new Response('Bad URL', { status: 400 });
    }
    const id = url.pathname.slice(1);
    if (!/^[\da-f-]{36}$/i.test(id)) return new Response('Not found', { status: 404 });
    if (url.hostname === 'track') {
      const trackPath = await library.trackPath(id);
      return trackPath
        ? fileResponse(request, trackPath, false, initiatorOrigin)
        : new Response('Not found', { status: 404 });
    }
    if (url.hostname === 'artwork') {
      const artworkPath = await library.artworkPath(id);
      return artworkPath
        ? fileResponse(request, artworkPath, true, initiatorOrigin)
        : new Response('Not found', { status: 404 });
    }
    return new Response('Not found', { status: 404 });
  });
  if (!process.env.ELECTRON_RENDERER_URL) {
    const rendererRoot = resolve(__dirname, '../renderer');
    protocol.handle('aurora', async (request) => {
      const url = new URL(request.url);
      if (url.hostname !== 'app' || request.method !== 'GET')
        return new Response('Not found', { status: 404 });
      let filePath: string;
      try {
        filePath = resolve(
          rendererRoot,
          decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html',
        );
      } catch {
        return new Response('Bad path', { status: 400 });
      }
      if (filePath !== rendererRoot && !filePath.startsWith(`${rendererRoot}${sep}`)) {
        return new Response('Not found', { status: 404 });
      }
      try {
        return await net.fetch(pathToFileURL(filePath).href);
      } catch {
        return new Response('Not found', { status: 404 });
      }
    });
  }
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
