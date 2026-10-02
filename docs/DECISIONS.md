# Decisions

## 2026-10-02 — Milestone 0 starting point

- Keep the supplied planning documents at the workspace root and create the application in this folder.
- Use Electron + React + TypeScript with Vite tooling, an isolated preload bridge, and a sandboxed renderer.
- Keep experimental time-stretch code under `spikes/`; do not make the chosen package part of the shipping architecture before its behavior and license are reviewed.
- Use generated tones for audio validation because no user-owned or licensed audio fixtures are present.
- Require an explicitly configured project homepage or contact address for LRCLIB's descriptive client identity.

## 2026-10-02 — Persistent library and worklet playback

- Keep imported audio in place and persist only the approved file paths and tags in Aurora's per-user data folder. The renderer receives opaque IDs and custom media URLs, never filesystem paths.
- Serve imported files by ID from the Electron main process, including byte-range responses for seeking. Embed no local paths in the UI or preload API.
- Extract tags and duration with `music-metadata`; cache only supported cover images up to 1 MiB each.
- Promote the spike's exact SoundTouch 2.1.1 dependency to the app and preserve the source-time HTML media clock for seeking and lyrics. Keep time stretching provisional until physical listening and stress checks pass.

## 2026-10-02 — Lyrics, effects, and Windows release

- Keep lyrics attached to local track IDs in renderer storage. Treat the LRC timestamps plus their signed offset as source-time values so synchronized highlighting and click-to-seek use the same media clock.
- Make LRCLIB exact lookup and text search user-triggered. Require an explicit, real project URL or email, send it in the identifying `User-Agent`, cache validated results, and respect the service's rate limits.
- Bundle renderer-only SoundTouch code in the built assets and retain the unmodified package source inside the app archive for MPL-2.0 notice/source access. Keep `music-metadata` as a production dependency because the main process loads it at runtime.
- Pin dependency versions and generate `THIRD-PARTY-NOTICES.txt` from the lockfile graph. Let Electron's own package notice files travel with the packaged runtime.
- Use the stable app ID `com.aurora.musicplayer`, a user-level NSIS installer, and the Start-menu name **Aurora Music Player**. Keep installer output local and unsigned; no signing identity was supplied.

## Verified upstream references

- [SoundTouchJS AudioWorklet README](https://github.com/cutterbl/SoundTouchJS/blob/master/packages/audio-worklet/README.md)
- [SoundTouchJS package on npm](https://www.npmjs.com/package/@soundtouchjs/audio-worklet)
- [LRCLIB API documentation](https://lrclib.net/docs)
- [Electron security recommendations](https://www.electronjs.org/docs/latest/tutorial/security)
