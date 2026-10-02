import { defineConfig, type Plugin } from 'vite';

function lyricsProxy(): Plugin {
  return {
    name: 'aurora-lyrics-spike-proxy',
    configureServer(server) {
      server.middlewares.use('/api/lrclib', async (request, response) => {
        const url = new URL(request.url ?? '/', 'http://localhost');
        const contact = process.env.AURORA_CONTACT?.trim();
        const isEmail = Boolean(contact && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact));
        const isHttpsUrl = Boolean(contact && /^https:\/\//i.test(contact));

        if (!contact || (!isEmail && !isHttpsUrl)) {
          response.statusCode = 400;
          response.setHeader('content-type', 'application/json');
          response.end(
            JSON.stringify({
              error:
                'Set AURORA_CONTACT to the project homepage or a contact email before live requests.',
            }),
          );
          return;
        }

        const endpoint = url.pathname.endsWith('/search') ? '/api/search' : '/api/get';
        const upstream = new URL(`https://lrclib.net${endpoint}`);
        url.searchParams.forEach((value, key) => upstream.searchParams.set(key, value));

        try {
          const result = await fetch(upstream, {
            headers: { 'User-Agent': `Aurora/0.1.0 (${contact})` },
            signal: AbortSignal.timeout(8_000),
          });
          response.statusCode = result.status;
          response.setHeader(
            'content-type',
            result.headers.get('content-type') ?? 'application/json',
          );
          response.end(await result.text());
        } catch (error) {
          response.statusCode = 502;
          response.setHeader('content-type', 'application/json');
          response.end(
            JSON.stringify({
              error: error instanceof Error ? error.message : 'LRCLIB request failed.',
            }),
          );
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [lyricsProxy()],
  server: {
    port: 5179,
    strictPort: true,
    fs: { allow: ['..'] },
  },
});
