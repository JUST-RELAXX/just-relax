# 03 — SKILLS & RESOURCES (Luna's toolbox)

**How to read this file**
- ✅ = I saw this page/package in a live search while preparing this file (still re-check versions and licenses).
- ⚠️ = from general knowledge, **not** checked in this session. Confirm the URL/package exists before relying on it.
- Anything marked **LICENSE?** must be checked before shipping. Keep a ledger in `/docs/LICENSES.md`.

---

## 1. Skills you need (and what "good" looks like)

| # | Skill area | You must be able to… | Study first |
|---|---|---|---|
| A | **Product & visual design** | Build a cohesive design system (tokens, type scale, spacing, motion), glass/blur surfaces that stay performant, album-art color theming with accessible contrast | §3.A |
| B | **Frontend engineering** | React + TS at scale, virtualized lists, canvas/WebGL render loops decoupled from React state, accessible custom controls (knobs, XY pads) | §3.B |
| C | **Electron on Windows** | Secure architecture (context isolation, sandbox, CSP, custom protocol), typed IPC, native modules, packaging, auto-update, media keys/SMTC, window materials | §3.C |
| D | **Web Audio & DSP** | Build node graphs, write AudioWorklets, smooth parameters, design reverb/delay/bit-crusher/EQ/limiter, reason about aliasing, latency, gain staging | §3.D |
| E | **Time-stretch / pitch-shift** | Explain tempo vs pitch vs rate; integrate SoundTouch(JS) in a worklet; know when phase-vocoder/formant methods are needed | §3.D |
| F | **Spatial audio (8D)** | Use `PannerNode` + HRTF, drive smooth orbits independent of UI frame rate, know the limits (headphones only, CPU) | §3.D |
| G | **Lyrics & metadata engineering** | Parse LRC, match noisy titles, call LRCLIB politely, cache, binary-search sync, fingerprint with Chromaprint/AcoustID | §3.E |
| H | **Data layer** | SQLite schema/migrations, FTS5 search, file watching, tag reading, art extraction | §3.F |
| I | **Testing & profiling** | Offline DSP tests (null tests, FFT peak checks), Playwright-Electron e2e, soak tests, performance traces | §3.G |
| J | **Release & compliance** | Code signing, NSIS installers, update channels, license ledger (GPL/LGPL/commercial awareness) | §3.H |
| L | **Dynamics & metering** | Build a compressor/gate/limiter with correct ballistics, gain-reduction metering, LUFS (BS.1770 K-weighting), true-peak, phase/goniometer displays | §3.D (Dynamics & metering) |
| M | **Automation systems** | Record/replay parameter curves on a source-time clock, with Read/Write/Touch behaviors and smooth interpolation | §3.D (Dynamics & metering) |
| K | **Agent craft** | Verify before trusting, spike risky things first, keep a decision log, communicate briefly and clearly | §6 |

---

## 2. Verified project references (open these early)

### 2.1 The reference app
- ✅ **AudioShape** — https://github.com/JahsiasWhite/AudioShape
  Windows music player with live audio editing (speed, EQ, effects), persistent edits across songs, preset/track export, downloader, full-screen/video mode, file converter, tag editor, themes. README shows Electron + React with webpack, plus Jest tests (`npm test`, `npx jest --coverage`). A "simplified web version" is linked from its README. **Ideas only — check LICENSE before reusing any code; skip the downloader.**

### 2.2 Time-stretch & pitch
- ✅ **SoundTouchJS monorepo** — https://github.com/cutterbl/SoundTouchJS
  Packages: `@soundtouchjs/core`, `@soundtouchjs/audio-worklet` (AudioParam-based controls, offline rendering helper, processor metrics), `@soundtouchjs/phase-vocoder-worklet` (smoother at extreme ratios), `@soundtouchjs/formant-correction-worklet` (LPC-based formant preservation for vocals), `@soundtouchjs/worklet-base` (build custom processors). Demo/guide app inside the repo.
- ✅ **`@soundtouchjs/audio-worklet` on npm** — https://www.npmjs.com/package/@soundtouchjs/audio-worklet
  Key facts from its page: runs on the audio rendering thread (replaces deprecated `ScriptProcessorNode`); recommends driving **tempo via the source's `playbackRate`** and setting the node's **`pitch`** (auto-compensated); `pitchSemitones` documented range −24…24; ranges intentionally bounded for real-time stability.
- ✅ **Older worklet fork with scheduling** — https://github.com/DanceCuts/soundtouchjs-scheduled-audio-worklet (buffer-based `ScheduledSoundTouchNode`; `tempo` vs `rate` vs `pitch` semantics are spelled out clearly — good for understanding).
- ✅ **Real-world caveat notes** — https://github.com/goto920/simple-mixer (an older project noting choppy real-time sound at speed > 1.0 with certain setups and that AudioWorklet vs OfflineAudioContext behavior differed in the past → **re-test with current versions**; don't assume).
- ✅ **StemTube** (uses SoundTouchJS in an AudioWorklet mixer for live tempo/pitch practice) — https://github.com/cutterbl/SoundTouchJS/issues/90
- ✅ **Rubber Band** — https://github.com/breakfastquay/rubberband and https://breakfastquay.com/rubberband/
  High-quality time-stretch/pitch-shift; real-time capable; newer versions describe `RubberBandStretcher` and a simpler `RubberBandLiveShifter`. **GPL, or buy a commercial license — LICENSE? (ask the human).**
- ✅ **Rubber Band WASM port** — https://www.npmjs.com/package/@echogarden/rubberband-wasm (stated as intended for Echogarden; check real-time viability, API surface, and license before use).
- ⚠️ **SoundTouch (original C++)** — https://www.surina.net/soundtouch/ — algorithm background; the original is LGPL, so **check SoundTouchJS's exact license (LICENSE?)** and what that implies for bundling in an Electron app.

### 2.3 Effects references
- ✅ **Tone.js effect docs** (as a design reference, not necessarily a dependency):
  - BitCrusher — https://tonejs.github.io/docs/14.7.30/BitCrusher (bit-depth downsampling; docs list Effect classes including AutoFilter, AutoPanner, Chorus, FeedbackDelay, Freeverb, JCReverb, PingPongDelay, PitchShift, Reverb, StereoWidener, Tremolo, Vibrato)
  - Freeverb — https://tonejs.github.io/docs/14.7.58/Freeverb (notes it's implemented with an AudioWorkletNode and may cost performance; suggests `Reverb` as an alternative)
  - FeedbackDelay — https://tonejs.github.io/docs/r13/FeedbackDelay (delay time, feedback, `wet` semantics: 1 = fully effected, 0 = dry)
  - JCReverb — https://tonejs.github.io/docs/r11/JCReverb (simple Schroeder design: allpass + comb filters)
- ✅ **A Rust effects crate listing for ideas** — https://docs.rs/oximedia-effects (Freeverb, plate reverb, convolution reverb, bitcrusher with bit-depth + sample-rate reduction and TPDF dither, delay, modulation, wet/dry) — useful as a *feature checklist* to compare against our specs.

### 2.4 Spatial audio (8D)
- ✅ **MDN PannerNode** — https://developer.mozilla.org/en-US/docs/Web/API/PannerNode (position/orientation AudioParams, cone, distance)
- ✅ **MDN `panningModel`** — https://developer.mozilla.org/en-US/docs/Web/API/PannerNode.panningModel (`equalpower` = simple/efficient default; `HRTF` = higher-quality binaural using measured impulse responses)
- ✅ **Resonance Audio (Web) developer guide** — https://resonance-audio.github.io/resonance-audio/develop/web/developer-guide (ambisonics; explicit migration path from `PannerNode`; **check maintenance status**)
- ✅ **`panner-utils` (npm)** — https://www.npmjs.com/package/panner-utils (convert yaw/pitch → orientation vectors)
- ⚠️ **Web Audio API spec** — https://www.w3.org/TR/webaudio/ (the normative text; read the PannerNode, AudioWorklet, and AudioParam automation sections)

### 2.5 Lyrics & identification
- ✅ **LRCLIB API docs** — https://lrclib.net/docs
  Facts to re-verify live: `GET /api/get` (artist + track required; album + duration optional but duration must be within ±2 s of the record), `GET /api/get/{id}`, `GET /api/search?q=` or by fields, publish endpoint (not needed). No account needed.
- ✅ **LRCLIB server source** — https://github.com/tranxuanthang/lrclib (Rust API server; explains caching behavior and the Lyricsfile format)
- ✅ **`lrclib-api` (TypeScript client)** — https://www.npmjs.com/package/lrclib-api (`findLyrics`, `getSynced`, `getUnsynced`; **you may prefer a ~40-line custom client** to control User-Agent, caching, and timeouts)
- ✅ **Python wrapper docs** (good for field names/semantics) — https://lrclibapi.readthedocs.io/en/latest/examples/fetch_lyrics.html
- ✅ **Karalyr** (LRCLIB-compatible, word-synced-only database) — https://github.com/lemara98/karalyr (optional future provider; check terms)
- ✅ **AcoustID/Chromaprint overview via `pyacoustid`** — https://github.com/beetbox/pyacoustid (explains `fpcalc` → `(duration, fingerprint)` → `lookup(apikey, fingerprint, duration)`; notes a 3 requests/second rate limit)
- ✅ **Chromaprint** — https://github.com/acoustid/chromaprint (fpcalc CLI; **LICENSE? for bundling the binary**)
- ⚠️ **AcoustID web service docs** — https://acoustid.org/webservice (API key registration, `meta=` options)
- ⚠️ **MusicBrainz API** — https://musicbrainz.org/doc/MusicBrainz_API (rate-limit rules, User-Agent requirement) — optional enrichment.

### 2.6 "What's playing" on Windows (companion mode only)
- ✅ **Microsoft docs: `GlobalSystemMediaTransportControlsSessionManager`** — https://learn.microsoft.com/en-us/uwp/api/windows.media.control.globalsystemmediatransportcontrolssessionmanager (Windows 10 1809+; system-wide sessions; current-session-changed event)
- ✅ **Raymond Chen's walkthrough** — https://devblogs.microsoft.com/oldnewthing/20231108-00/?p=108980 (how to read other apps' media info and optionally control playback)
- ✅ **`node-windows-smtc-monitor`** — https://github.com/when630/node-windows-smtc-monitor (Rust + napi-rs; events for session changes; targeted transport controls in this fork)
- ✅ **`windows-media-sessions`** — https://github.com/Gyom03/windows-media-sessions (spawns a self-contained .NET 8 helper that streams JSON; ESM+CJS+TS typings; mentions compatibility with Electron's main process; returns album art as a data URL)
- ✅ **Real-world example of the *other* direction** (publishing your own app's now-playing to SMTC via a native addon in Electron) — https://github.com/TrueNorthIT/TrueTunes/pull/105 (for our own app, `navigator.mediaSession` is the simpler first step ⚠️ — verify it surfaces correctly in the Windows overlay).

### 2.7 Visualizer
- ✅ **Butterchurn (MilkDrop in WebGL)** — https://github.com/jberg/butterchurn and https://www.npmjs.com/package/butterchurn (MIT; requires WebGL 2; `createVisualizer(audioContext, canvas, opts)`, `connectAudio(node)`, `loadPreset(preset, blendSeconds)`, `setRendererSize`, `render()`; pair with `butterchurn-presets`). The npm page for `butterchurn` shows an old publish date; ✅ `@webamp/butterchurn` (3.0.0-beta.5) at https://www.npmjs.com/package/@webamp/butterchurn is the maintained line — **decide after testing both**. Homepage: https://butterchurnviz.com
- ✅ **Beat-synced preset switching example** — https://github.com/xoxodin/butterchurn-visualizer (uses `web-audio-beat-detector` for BPM and an AnalyserNode-based bass-spike detector)

### 2.8 Fairlight (DaVinci Resolve) — inspiration for the Pro layer
- ✅ **Blackmagic's Fairlight overview** — https://blackmagicdesign.com/products/davinciresolve/fairlight (mixer with channel strips; real-time EQ and dynamics on every track; double-click opens the 6-band parametric EQ and the dynamics window with expander, gate, compressor, limiter; sidechain source selection)
- ✅ **ProVideo Coalition review** — https://www.provideocoalition.com/could-davinci-resolve-fairlight-be-your-next-daw/ (describes the mixer, meter bridge, built-in loudness/level meters, and that you can change the signal order of effects, EQ and dynamics within a channel strip)
- ✅ **Adorama product description (Resolve 14 era)** — https://www.adorama.com/bmdvrflaudif.html (mentions 6-band parametric EQ + expander/gate/compressor/limiter per track, recording parameter changes during live playback, and compound meters with phase and loudness — older text, treat as feature *ideas*)
- **How to use it:** study screenshots/videos of the Fairlight mixer for *layout logic* (strip order, meter placement, density), then design our own look in our token system. **No copying of assets, names, or trade dress.**

---

## 3. Study lists by area

### 3.A Design (visual, motion, systems)
- ⚠️ Material/Apple HIG are *references for rigor*, not styles to copy. Read Apple's HIG sections on Music/Now Playing patterns for hierarchy ideas: https://developer.apple.com/design/human-interface-guidelines/
- ⚠️ WCAG 2.2 contrast & motion guidance: https://www.w3.org/TR/WCAG22/
- ⚠️ Motion (Framer Motion successor) docs for springs/layout animations: https://motion.dev
- ⚠️ Radix UI primitives (accessible headless components): https://www.radix-ui.com
- ⚠️ Color extraction: `node-vibrant` / `colorthief` (npm) — pick one, test on 50 covers, handle grayscale/low-saturation art.
- Skill drills: (1) build the token file; (2) build Knob + XY pad in isolation (Storybook or a plain `/playground` route); (3) build the glass card with grain; (4) build the accent-crossfade; (5) profile `backdrop-filter` on integrated GPUs.

### 3.B Frontend engineering
- ⚠️ React docs (effects, refs, concurrent features): https://react.dev
- ⚠️ Zustand: https://github.com/pmndrs/zustand — keep audio state *out* of React render paths.
- ⚠️ `@tanstack/react-virtual` for huge lists.
- ⚠️ Canvas/WebGL performance: render loops via `requestAnimationFrame`; read analyser data into pre-allocated typed arrays; avoid allocations per frame.
- Skill drill: render a 60-fps spectrum from `AnalyserNode.getByteFrequencyData` with zero per-frame allocations and pause it when the window is hidden.

### 3.C Electron & Windows
- ⚠️ Electron docs: https://www.electronjs.org/docs/latest — read *Security*, *Context Isolation*, *IPC*, *Custom Protocols*, *Window Customization*, *Media Session/Global shortcuts*, *Packaging*.
- ⚠️ `electron-vite`: https://electron-vite.org
- ⚠️ `electron-builder` (NSIS, auto-update): https://www.electron.build
- ⚠️ `electron-updater` (GitHub Releases provider).
- ⚠️ Window options to evaluate: `titleBarOverlay`, `backgroundMaterial` (Win11 Mica/Acrylic), `setThumbarButtons`, `app.requestSingleInstanceLock()`.
- ⚠️ `webPreferences` knobs relevant to audio apps: `autoplayPolicy: 'no-user-gesture-required'` (so the AudioContext can start without a click) and `backgroundThrottling: false` (keeps timers alive when minimized). **Test both; understand security implications.**
- ⚠️ Native module hygiene: `better-sqlite3` needs a build matching Electron's ABI → use `electron-rebuild`/prebuilds in CI.
- Skill drill: ship a "hello" Electron app with context isolation, a validated IPC call, a custom `aurora-media://` protocol that streams a local file with Range support, and an NSIS installer.

### 3.D Web Audio, DSP & spatial audio
**Foundations**
- ⚠️ MDN Web Audio API guide: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
- ⚠️ MDN AudioWorklet: https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet and "Using AudioWorklet" guide.
- ⚠️ Chrome's "Enter Audio Worklet" article (Hongchan Choi) — search developer.chrome.com for it.
- ⚠️ Chrome autoplay policy notes (AudioContext must be resumed after a gesture unless the Electron flag above is set).

**DSP theory (just enough)**
- ⚠️ *Audio EQ Cookbook* (Robert Bristow-Johnson) — biquad formulas: https://www.w3.org/TR/audio-eq-cookbook/
- ⚠️ Julius O. Smith III's free online books (CCRMA, Stanford): *Introduction to Digital Filters*, *Physical Audio Signal Processing* (delay lines, comb/allpass, reverb) — https://ccrma.stanford.edu/~jos/
- ⚠️ Jon Dattorro, "Effect Design, Part 1: Reverberator and Other Filters," *JAES* 1997 — the classic plate reverb topology.
- ⚠️ Freeverb (Schroeder/Moorer-style comb + allpass network) — many open-source descriptions; Tone.js's Freeverb/JCReverb (✅ above) are readable references.
- ⚠️ Phase vocoder & time-stretch intros (Laroche & Dolson; Röbel's transient handling) — only needed if you outgrow SoundTouch.
- ⚠️ EBU R128 / ITU-R BS.1770 loudness; ReplayGain 2.0 spec — for normalization.
- ⚠️ "Zipper noise" and parameter smoothing: use `setTargetAtTime`, or inside worklets use one-pole smoothers.
- ⚠️ Aliasing in bit/sample-rate reduction: why an anti-alias pre-filter softens the sound and why "authentic" crunch skips it.

**Dynamics & metering (for the Pro layer)**
- ⚠️ ITU-R BS.1770 (loudness measurement, K-weighting, gating) and EBU R128 / EBU Tech 3341 (meter types: momentary 400 ms, short-term 3 s, integrated) — read the spec or a trustworthy summary, then **verify your implementation against reference test signals**.
- ⚠️ True-peak measurement via oversampling (BS.1770 Annex 2).
- ⚠️ Compressor design: threshold/ratio/knee, attack/release ballistics, feed-forward vs feedback detectors, RMS vs peak detection, sidechain filtering; Giannoulis, Massberg & Reiss, "Digital Dynamic Range Compressor Design — A Tutorial and Analysis," *JAES* 2012 (search for it).
- ⚠️ Look-ahead limiting and why it adds latency.
- ⚠️ Goniometer/phase-correlation math (L/R → M/S rotation; correlation coefficient).
- ⚠️ Spectrogram basics: STFT, window functions (Hann), hop size; use `AnalyserNode` for quick views and a Worker FFT for accuracy.

**Skill drills (do these as spikes/tests)**
1. Write a **bit-crusher worklet** (snippet in §5) and verify the number of distinct output levels equals 2^bits (null/level-count test).
2. Build a **feedback delay** with a lowpass in the loop and a soft-clip; prove it can't run away at 95% feedback.
3. Build **Freeverb in a worklet**, then compare by ear/spectrogram to a generated-IR `ConvolverNode`.
4. Orbit a `PannerNode` (HRTF) and confirm the orbit doesn't freeze when the window is hidden (see gotcha #4).
5. Time-stretch a 440 Hz sine to 0.5× and +12 st; FFT-check frequency and duration.
6. Build a **compressor worklet** with a gain-reduction readout; verify ratio/threshold behavior with stepped sine levels.
7. Implement a **LUFS meter** and check it against a reference tone (a 1 kHz sine at a known level should read a known loudness per the spec — **look up the expected value; don't trust memory**).
8. Record and replay a **knob automation lane** on the TransportClock at 0.5×/1×/2× and confirm the replay matches the recording.

### 3.E Lyrics & metadata
- ✅ LRCLIB docs, server, clients (see §2.5).
- ⚠️ LRC format overview (timestamps `[mm:ss.xx]`, ID tags `[ar:] [ti:] [al:] [offset:]`, enhanced word tags `<mm:ss.xx>`) — search "LRC lyrics file format" and skim two sources; handle the variations you actually see in LRCLIB data. **Check the sign convention of `[offset:]` empirically** — implementations differ.
- ⚠️ `music-metadata` (npm) — reads tags incl. embedded art and lyrics (ID3 `USLT`, `SYLT`).
- ⚠️ String similarity for matching: Jaro-Winkler or normalized Levenshtein (small libs like `fast-levenshtein`), after normalization (lowercase, diacritics, bracket stripping).
- Skill drill: collect 200 real tracks' signatures (your own library), run the pipeline, log hit/miss reasons, tune normalization until ≥ 90% of *available* lyrics are found.

### 3.F Data layer
- ⚠️ `better-sqlite3` docs (synchronous API; run in main/utility process, never the renderer).
- ⚠️ SQLite FTS5 docs (full-text search): https://www.sqlite.org/fts5.html
- ⚠️ `chokidar` for file watching (debounce; handle network drives gracefully).
- ⚠️ Thumbnail generation: `sharp` (native; check Electron compatibility) or Canvas in a hidden worker.

### 3.G Testing & profiling
- ⚠️ Vitest: https://vitest.dev
- ⚠️ Playwright with Electron: https://playwright.dev/docs/api/class-electron
- ⚠️ Chrome DevTools Performance panel + Memory snapshots (hunt detached AudioNodes).
- Technique: **null test** — render with bypass and subtract from the input; result must be ~silence (floating-point epsilon).
- Technique: **sweep test** — log sine sweep through the EQ and compare measured response to `getFrequencyResponse()`.

### 3.H Release & compliance
- ⚠️ Code signing options for Windows (OV/EV certificates, or cloud-signing services) — costs money; ask the human before purchasing.
- ⚠️ GPL/LGPL/MIT basics: GPL in a distributed app generally requires releasing your source under GPL; LGPL has linking/replacement requirements; commercial licenses (e.g., Rubber Band) avoid that. **Do not guess — maintain the ledger and ask.**
- ⚠️ `license-checker` / `license-report` (npm) to generate dependency license lists.

---

## 4. Dependency shortlist (verify versions, licenses, maintenance on install day)

| Purpose | Candidate | Notes |
|---|---|---|
| Shell | `electron` | Pin a stable major; read breaking changes |
| Build | `electron-vite`, `vite`, `typescript` | |
| UI | `react`, `react-dom`, `zustand`, `motion`, `@radix-ui/*`, `@tanstack/react-virtual` | |
| Icons | `lucide-react` or Phosphor | one set only |
| Audio time/pitch | `@soundtouchjs/audio-worklet` (+ optional phase-vocoder/formant packages) | ✅ seen; LICENSE? |
| Reference only | `tone` | prototyping/reference |
| Visualizer | `butterchurn` + `butterchurn-presets` **or** `@webamp/butterchurn` | ✅ seen; MIT stated for butterchurn |
| Tags | `music-metadata` | |
| DB | `better-sqlite3` | native module |
| Watching | `chokidar` | |
| Validation | `zod` | IPC + preset schemas |
| Fingerprint | `fpcalc` binary (Chromaprint) | LICENSE? for bundling |
| Transcode (fallback) | `ffmpeg-static` or similar | codec/license review |
| Colors | `node-vibrant` or `colorthief` | |
| Update/Package | `electron-builder`, `electron-updater` | |
| Tests | `vitest`, `@playwright/test` | |
| Companion mode (optional) | `node-windows-smtc-monitor` or `windows-media-sessions` | ✅ seen; test on Win10 + Win11 |

---

## 5. Starter snippets (verify, then adapt — these are sketches, not gospel)

### 5.1 LRC parser + active-line lookup (TypeScript)
```ts
export interface LyricLine { timeMs: number; text: string }

const STAMP = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
const META  = /^\[(ar|ti|al|by|offset|length):(.*)\]$/i;

export function parseLrc(src: string): { lines: LyricLine[]; offsetMs: number } {
  const lines: LyricLine[] = [];
  let offsetMs = 0;
  for (const raw of src.split(/\r?\n/)) {
    const meta = raw.trim().match(META);
    if (meta) { if (meta[1].toLowerCase() === 'offset') offsetMs = parseInt(meta[2], 10) || 0; continue; }
    const stamps = [...raw.matchAll(STAMP)];
    if (!stamps.length) continue;
    const text = raw.replace(STAMP, '').trim();
    for (const s of stamps) {
      const frac = s[3] ? parseInt(s[3].padEnd(3, '0').slice(0, 3), 10) : 0; // "5"→500ms, "05"→50ms
      lines.push({ timeMs: +s[1] * 60000 + +s[2] * 1000 + frac, text });
    }
  }
  lines.sort((a, b) => a.timeMs - b.timeMs);
  return { lines, offsetMs };
}

// last line whose timeMs <= posMs (or -1 before the first line)
export function activeIndex(lines: LyricLine[], posMs: number): number {
  let lo = 0, hi = lines.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].timeMs <= posMs) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}
```

### 5.2 LRCLIB fetch (run in the **main** process; polite client)
```ts
export async function lrclibGet(sig: {artist:string; title:string; album?:string; durationSec:number}, signal?: AbortSignal) {
  const u = new URL('https://lrclib.net/api/get');
  u.searchParams.set('artist_name', sig.artist);
  u.searchParams.set('track_name', sig.title);
  if (sig.album) u.searchParams.set('album_name', sig.album);
  u.searchParams.set('duration', String(Math.round(sig.durationSec))); // ORIGINAL duration, not tempo-adjusted
  const res = await fetch(u, {
    headers: { 'User-Agent': 'Aurora/0.1.0 (https://example.com/aurora)' }, // set a real contact URL
    signal,
  });
  if (res.status === 404) return null;                 // cache this miss (≈7 days)
  if (!res.ok) throw new Error(`LRCLIB ${res.status}`);
  return res.json() as Promise<{
    id:number; trackName:string; artistName:string; albumName?:string;
    duration?:number; instrumental:boolean; plainLyrics?:string|null; syncedLyrics?:string|null;
  }>;
}
```

### 5.3 Bit-crusher AudioWorklet (JavaScript, runs in the worklet scope)
```js
class BitCrusherProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'bits',      defaultValue: 16, minValue: 1, maxValue: 16, automationRate: 'k-rate' },
      { name: 'reduction', defaultValue: 1,  minValue: 1, maxValue: 64, automationRate: 'k-rate' }, // hold N samples
      { name: 'mix',       defaultValue: 1,  minValue: 0, maxValue: 1,  automationRate: 'k-rate' },
    ];
  }
  constructor() { super(); this.phase = []; this.held = []; }
  process(inputs, outputs, params) {
    const input = inputs[0], output = outputs[0];
    if (!input || !input.length) return true;
    const levels = Math.pow(2, params.bits[0] - 1);
    const red = params.reduction[0], mix = params.mix[0];
    for (let ch = 0; ch < output.length; ch++) {
      const inp = input[ch] || input[0], out = output[ch];
      this.phase[ch] ??= 0; this.held[ch] ??= 0;
      for (let i = 0; i < out.length; i++) {
        this.phase[ch] += 1;
        if (this.phase[ch] >= red) {
          this.phase[ch] -= red;
          this.held[ch] = Math.round(inp[i] * levels) / levels; // quantize
        }
        const y = this.held[ch];
        out[i] = Number.isFinite(y) ? inp[i] * (1 - mix) + y * mix : 0; // NaN guard
      }
    }
    return true;
  }
}
registerProcessor('bitcrusher', BitCrusherProcessor);
```
*Next steps:* add TPDF dither, jitter, anti-alias pre-filter, parameter smoothing; make `bits`/`reduction` fractional with interpolation if you want smooth sweeps.

### 5.4 8D orbit that doesn't freeze when the window is hidden
```ts
// Idea: don't rely on requestAnimationFrame (it pauses in hidden windows).
// Option A: schedule curves on the audio clock, one revolution ahead.
function scheduleOrbit(ctx: AudioContext, panner: PannerNode, radius: number, periodSec: number, startTime: number) {
  const N = 256;                              // points per revolution
  const xs = new Float32Array(N), zs = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const th = (2 * Math.PI * i) / N;
    xs[i] =  radius * Math.sin(th);
    zs[i] = -radius * Math.cos(th);
  }
  panner.positionX.setValueCurveAtTime(xs, startTime, periodSec);
  panner.positionZ.setValueCurveAtTime(zs, startTime, periodSec);
  return startTime + periodSec;               // call again just before this time to chain revolutions
}
// panner: new PannerNode(ctx, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: 1, rolloffFactor: 0.5 })
// Option B: a Worker with setInterval(…, 16) calling postMessage → main thread updates positions.
// Option C: drive positions from an AudioWorklet-generated control signal (advanced).
// VERIFY: curve scheduling can't overlap existing automation events; handle changes of period/radius by cancelling and rescheduling (cancelScheduledValues) with a short ramp.
```

### 5.5 SoundTouch worklet wiring (shape only — copy exact API from the package README)
```ts
// import { SoundTouchNode } from '@soundtouchjs/audio-worklet';   // VERIFY import + registration steps in the README
// await ctx.audioWorklet.addModule(/* path to the processor file per README */);
// const st = new SoundTouchNode(ctx);
// source.connect(st).connect(nextNode);
// Per the package docs: tempo via source.playbackRate (or the media element's playbackRate),
// desired pitch via st.pitch.value (auto-compensated), key shifts via pitchSemitones (−24…24).
// Smooth with AudioParam automation rather than direct assignment when supported.
```

---

## 6. Gotchas cheat-sheet (the stuff that bites audio apps)

1. **Autoplay policy:** an `AudioContext` may start "suspended." Resume on first gesture, or configure Electron's `autoplayPolicy`. Test cold start with no clicks.
2. **Sample-rate mismatch:** `decodeAudioData` resamples to the context's rate. Create the context at a sensible rate (e.g., 48000) and test files at 44.1 kHz and 96 kHz for pitch/speed correctness.
3. **Zipper noise:** direct `.value =` assignments mid-playback cause stepping. Use `setTargetAtTime` / ramps; smooth inside worklets.
4. **Hidden-window throttling:** `requestAnimationFrame` stops when the window is hidden → orbit/automation driven from rAF will freeze. Use audio-clock scheduling or a Worker timer; evaluate `backgroundThrottling: false`.
5. **Lyrics clock:** use *source-time* position from `TransportClock`, re-anchored on every play/pause/seek/rate change. Wall-clock math breaks at non-1× speeds.
6. **Feedback runaway (delay/reverb):** keep feedback < 1.0, add a soft clipper/limiter in the loop, and test with 95% feedback and full-scale input.
7. **Gain staging:** bass-boost shelves and saturators raise peaks; the limiter prevents clipping but heavy limiting sounds bad → provide a preamp and show a gain-reduction meter.
8. **Denormal/NaN/∞:** guard every custom processor; a single NaN can silence the whole graph.
9. **Memory leaks:** disconnect and dereference nodes on track change; reuse worklet nodes instead of recreating per track; watch for detached nodes in heap snapshots.
10. **Worklet loading in Electron:** the worklet script is fetched like a script. With a strict CSP or a custom protocol, make sure worklet URLs resolve and are allowed. Test dev **and** packaged builds.
11. **HRTF cost & channel handling:** HRTF panning is relatively expensive and expects mono/stereo input; mix down intentionally and measure CPU.
12. **Doppler:** don't rely on Web Audio Doppler for 8D; keep distance changes subtle.
13. **Time-stretch limits:** quality drops at extremes; expose "extreme" indicators; try the phase-vocoder/formant packages for big ratios and vocal-heavy material.
14. **Duration mismatch for lyrics:** LRCLIB `/api/get` wants the original duration (±2 s). Don't send tempo-scaled duration; keep tracks' true durations in the DB.
15. **Native modules:** rebuild for Electron's ABI; prefer prebuilt binaries; test the *packaged* installer, not just `npm run dev`.
16. **Network politeness:** descriptive User-Agent, caching (including misses), request de-duplication, exponential backoff, offline mode.
17. **Legal:** no scraping disallowed sources; no bundled copyrighted content; keep a license ledger.

---

## 7. Test assets & fixtures
- Generate **synthetic signals** in code (sine 440 Hz, sweeps, impulses, white/pink noise, click trains) — perfect for DSP tests and license-free.
- For realistic listening tests, use a handful of **CC0 / CC-BY** tracks; record each file's license in `/tests/fixtures/LICENSES.md`.
- Keep fixtures tiny (≤ 30 s) so CI stays fast.
- For lyrics matching, build a **200-song signature list** from the human's own library (artist/title/album/duration only — don't commit copyrighted audio).

---

## 8. Checklists

### 8.1 Audio review (before merging any DSP change)
- [ ] Bypass is bit-transparent (null test passes)
- [ ] No clicks when sweeping every parameter (listen on headphones)
- [ ] No NaN/∞ in 10-minute fuzz with random automation
- [ ] CPU measured with all effects on; recorded in PR
- [ ] Limiter behaves; no runaway feedback
- [ ] Works at 44.1/48/96 kHz sources
- [ ] Parameter added to the schema (id/min/max/default/curve/smoothing/description)
- [ ] Meters verified against reference signals (LUFS, true-peak, phase) where touched

### 8.2 Design review
- [ ] Only tokens used (no raw hex in components)
- [ ] Motion follows the spec (springs for layout, ≤ 250 ms for micro-interactions)
- [ ] AA contrast on text; focus rings visible; keyboard path complete
- [ ] `prefers-reduced-motion` honored
- [ ] No layout shift on track change; art/lyrics skeletons present
- [ ] Looks great at 960×620 *and* 1920×1080, 100% and 150% display scaling
- [ ] Pro Mixer view is hidden by default; Player view stays calm and uncluttered
- [ ] No Fairlight/Blackmagic assets, names, or copied trade dress

### 8.3 Lyrics review
- [ ] LRC parser fixtures pass (multi-stamp, offsets, malformed)
- [ ] Sync stays within ±150 ms at 0.5×/1×/2×
- [ ] Cache hit/miss/expiry verified; offline mode works
- [ ] "Wrong song?" flow remembers the choice
- [ ] No request sent without a User-Agent; no duplicate in-flight requests

### 8.4 Release review
- [ ] Clean-machine install on Windows 10 and 11
- [ ] Packaged app plays audio, loads worklets, reads library, fetches lyrics
- [ ] Updater tested (old → new)
- [ ] `LICENSES.md` complete; GPL/LGPL/commercial items approved by the human
- [ ] 2-hour soak test passes (no memory growth beyond budget)

---

## 9. Plain-language glossary (use these when explaining things to the human)

- **Sample rate:** how many "snapshots" of the sound are taken per second (44,100 per second is CD quality).
- **Bit depth:** how finely each snapshot's loudness is measured. Fewer bits = chunkier, grittier sound.
- **Tempo / pitch / rate:** speed without key change / key without speed change / both together (like a record).
- **Time-stretching:** changing duration without changing pitch, by cleverly repeating or overlapping tiny slices of sound.
- **Wet / dry:** wet = the effected sound; dry = the original. A "mix" knob blends them.
- **Reverb:** the echo-wash of a space. **RT60/decay** = how long it takes to fade by 60 dB (roughly "gone").
- **Pre-delay:** the pause before the reverb starts — keeps voices crisp.
- **Damping:** how quickly high frequencies die in the tail (more damping = warmer, darker).
- **Feedback (delay):** how much of the echo is fed back in to make repeating echoes.
- **EQ / shelf / Q:** boosting or cutting frequency ranges / a "shelf" lifts everything above or below a point / Q is how narrow a boost is.
- **Limiter:** an automatic volume ceiling that stops peaks from clipping.
- **HRTF:** a model of how your head and ears color sound from different directions; it's what makes headphone 3D audio feel outside your head.
- **AudioWorklet:** a tiny program that runs on the dedicated audio thread so sound never stutters.
- **Zipper noise:** crackly stepping sound when a knob changes a value in jumps instead of smoothly.
- **Fingerprint (audio):** a compact signature of a recording used to identify the song even with missing tags.
- **LRC:** a text format where each lyric line has a timestamp.
- **Null test:** subtract the output from the input; if the result is silence, the processing did nothing (good for bypass).

---

## 10. Reading order & time-boxes (for Luna's first day)

1. **File 02 §5–§7** (audio engine, effects, lyrics) — *must be internalized*.
2. **SoundTouchJS README + demo guide** (§2.2) — 30–45 min, then spike 1.
3. **LRCLIB docs** (§2.5) — 15 min, then spike 2.
4. **MDN PannerNode + `panningModel`** (§2.4) — 15 min, then spike 3 (use snippet 5.4's idea).
5. **Electron security + IPC + custom protocol docs** (§3.C) — 45 min before scaffolding.
6. **AudioShape README** (§2.1) — 10 min for feature inspiration; **no code copying**.
7. Skim **Tone.js effect docs** (§2.3) to compare parameter naming with our schema.
8. Skim the **Fairlight pages** (§2.8) for mixer/meter layout logic before designing the Pro Mixer screen (Milestone 5).

When in doubt: spike it, measure it, write the decision down, move on.
