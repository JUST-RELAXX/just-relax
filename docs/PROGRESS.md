# Aurora progress

## Update — audio behavior hardening (2026-10-02)

- If SoundTouch fails to load, tempo now uses the browser's pitch-preserving media-rate control and varispeed remains available. Independent pitch shifting stays disabled until the SoundTouch worklet is ready.
- The Lab now shows the audio startup error instead of failing silently, and disables effect controls if the Web Audio graph itself cannot start.
- Added one-tap tempo, pitch, and varispeed presets alongside the continuous controls. Moving an effect parameter automatically enables that effect, so changing a control cannot appear to do nothing because its bypass switch was still off.
- Typecheck, lint, unpacked Windows packaging, and the x64 installer build passed after these changes. Real-track listening and the packaged worklet startup path still need a hands-on check.

## Milestone 0 — spikes and scaffold

### Step A — plan review

1. Build a secure Windows desktop shell with Electron, React, and TypeScript.
2. Keep UI, audio, lyrics, and storage behind clear interfaces.
3. Make local files and a fast library the everyday player experience.
4. Drive playback, seeking, and lyrics from one source-time transport clock.
5. Prototype tempo and pitch separately before choosing the live DSP path.
6. Add the effects rack through one shared parameter schema.
7. Fetch and cache lyrics politely, with local lyrics and manual search fallbacks.
8. Shape the interface around the dark, glassy “Liquid Night” design system.
9. Keep generated audio and small standalone spikes for repeatable validation.
10. Package and ship only after quality, accessibility, and license checks.

### Top risks

1. Time-stretching can sound rough or underrun at higher ratios.
2. HRTF, reverb, and stretching together may exceed a laptop's audio budget.
3. Lyrics matching and the upstream service can fail or return the wrong version.
4. Electron worklet paths and native modules can behave differently after packaging.
5. The requested effects, polished UI, and Windows integration exceed a small MVP if built all at once.

### Blueprint corrections and gaps

- The SoundTouchJS notes in the blueprint are stale. Current `@soundtouchjs/audio-worklet` 2.1.1 uses `SoundTouchNode.register()`, a Vite `?url` processor import, mirrored source/node `playbackRate`, and `pitch` / `pitchSemitones` parameters. It no longer exposes `tempo` or `rate` AudioParams.
- The current npm release is MPL-2.0; older releases were LGPL. Keep the exact resolved version and license in the ledger before shipping.
- `varispeed` should be proved as a distinct, uncompensated source-rate path; do not infer it from the older SoundTouch API notes.
- A compliant LRCLIB client needs a real project homepage or contact address in its client identity. None is supplied in this folder, so the spike will make this configurable and will not invent one.
- At the start of implementation there were no sample tracks, contact details, or acceptance fixtures; generated audio covers the audio spikes.

### Questions

No answer is needed to begin the offline spikes or scaffold. Before live LRCLIB requests, set a project homepage or contact address in the local configuration.

### Step B — spikes

- [x] Tempo / pitch / varispeed worklet proof; record smoothness and usable range.
- [x] LRC parsing, active-line tracking, API client, search fallback, and empty states.
- [x] HRTF orbit driven from the audio clock; check the result on headphones.

#### Spike findings

- **Tempo / pitch:** `@soundtouchjs/audio-worklet` 2.1.1 loaded and processed the generated tone. A steady 1.5× tempo run showed one additional low-fill block across roughly 4,000 render blocks. Pitch transitions raised the counter from 60 to 72 across roughly 4,600 blocks. This is useful signal-path evidence, not a listening-quality pass; check transitions and longer runs on physical audio output before choosing a DSP path.
- **Lyrics:** LRC parsing, playback-time highlighting, and click-to-seek worked against the generated WAV. The LRCLIB exact-lookup control correctly stayed blocked until a real project homepage or contact is configured. A live request and search fallback response have not been verified against the service.
- **Spatial:** the HRTF panner started and stopped, and circle / figure-eight orbit controls updated the position over the audio clock. The generated tone and control path ran without console errors. Headphone listening and CPU checks remain outstanding.

### Step C — scaffold

- [x] Electron + React + Vite themed window launches with secure web preferences.
- [x] `AudioEngine` interface and effects schema exist.
- [x] Development build succeeds.

#### Scaffold verification

- Electron uses context isolation, a sandboxed renderer, and disabled Node integration. The preload is bundled as CommonJS because Electron's sandboxed preloads do not support ESM imports.
- The development Electron process remained running after the preload correction; the renderer loaded successfully.
- `npm run format:check`, `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` passed. The test suite covers three LRC parser cases and three library filename/time cases.
- This completes the Milestone 0 foundation. Audio listening, longer stress runs, live LRCLIB requests, and packaged Windows behavior remain follow-up verification.

## Milestone 1 — local playback foundation

- [x] Choose local audio files into a persistent library; search by title, artist, album, or filename.
- [x] Play, pause, seek, skip tracks, and adjust volume through the shared playback engine.
- [x] Persist the library across restarts and read embedded tags/artwork.
- [ ] Validate supported formats and playback behavior on representative Windows audio files.

The desktop library is stored under Electron's per-user `userData` folder as a small JSON index. Audio stays in its original location. Aurora reads title, artist, album, duration, and supported embedded cover art at import time; missing tags fall back to the filename. Small cover images are copied to Aurora's local cache, capped at 1 MiB each. Missing original files remain visible and can be removed from the library.

The desktop renderer does not receive file paths. It asks the main process to open a native file picker and receives opaque IDs plus `aurora-media:` stream URLs. The main process resolves only previously imported IDs, streams local audio with byte-range support for seeking, and keeps arbitrary filesystem access out of the renderer bridge. Browser-only preview retains a session-scoped file input fallback.

#### Playback verification

- Added a generated one-second WAV through the file chooser. It appeared in the library with its filename-based title, and the media duration populated as `0:01`.
- Started playback at 0% volume. The player changed to its Pause state, showed active playback, and enabled the seek control. This confirms the file selection and browser media path; it does not replace testing with real music files or listening at normal volume.
- Added three `LibraryStore` tests for persistence across store instances, metadata duration and filename fallback, duplicate/unsupported imports, removal without touching the audio file, and missing-file visibility. The full suite passes (9 tests).
- Typecheck, lint, formatting, and production build pass after the persistent-library change. Packaged playback, a full native window import/seek smoke pass, and physical listening remain open.

## Milestone 2 — live speed and pitch

- [x] Promote the spike's exact SoundTouch version into the desktop renderer and process the media element through an AudioWorklet.
- [x] Keep transport time, duration, seek, and later lyric sync tied to the original HTML media element clock.
- [x] Add live tempo, pitch-shift, and varispeed controls with reset and a visible worklet underrun counter.
- [ ] Listen to real tracks at normal, slow, fast, and pitch-shifted settings; stress longer playback on target Windows hardware.

SoundTouch is in the shipping renderer path at the pinned 2.1.1 MPL-2.0 version used in the spike. The processor URL is emitted through Vite's asset pipeline. If worklet registration fails, tempo falls back to pitch-preserving browser playback, varispeed remains available, and independent pitch shift is disabled. The Lab displays the registration error for diagnosis. Other effects remain available when the Web Audio graph starts successfully.

## Milestone 3 — effects rack

- [x] Connect the shared effect schema to a live Web Audio graph with per-effect bypass and parameter controls.
- [x] Persist validated effect settings and start optional effects in a neutral, bypassed state.
- [x] Include the custom bitcrusher worklet as an external asset alongside the SoundTouch processor.
- [ ] Audition the rack on real music and check CPU use on the target Windows machine.

The rack includes an eight-band equalizer, bass shelf, compressor, bitcrusher, delay, convolution reverb, HRTF spatial orbit, and master limiter. The controls are in **Lab**; the schema clamps values and supplies stable defaults. Tests cover settings normalization and application to the matching audio nodes. The production renderer build emits separate SoundTouch and bitcrusher worklet files, avoiding unsupported inline worklet URLs.

## Milestone 4 — local and online lyrics

- [x] Add editable plain/synced lyrics, LRC import, and per-track local persistence.
- [x] Highlight timed lines from the media source clock and allow a line click to seek.
- [x] Add explicit LRCLIB exact lookup and manual search fallback, response validation, seven-day positive/negative cache, request deduplication, throttling, and `Retry-After` handling.
- [x] Add Settings for a real project homepage or contact email; keep requests disabled when no identity is configured.
- [ ] Verify one live lookup using the user's real contact and listen to timed lyric sync on a local track.

Lyrics never trigger a background request. The Electron main process sends the configured client identity only when the user clicks a lookup action. Local plain lyrics and imported LRC remain available without online configuration. `LRCLIBService.test.ts` covers required identity, cache reuse across service restarts, exact misses/search candidates, and rate-limit delays. The live endpoint has not been exercised because this folder does not provide a real contact identity.

## Milestone 5 — Windows packaging and license readiness

- [x] Pin the desktop toolchain, add an app identity and alr branded vector icon, and configure a per-user x64 NSIS installer.
- [x] Add repeatable `npm run dist` and `npm run package:dir` entry points.
- [x] Generate third-party notices from the locked runtime/bundled dependency graph and include them in the packaged app; retain Electron and Chromium's supplied notices.
- [x] Produce an unpacked Windows x64 application bundle.
- [x] Build an x64 NSIS installer and point the Windows-searchable **Aurora Music Player** Start-menu shortcut at the self-contained app executable.
- [ ] Complete an installed native-window import/play/seek smoke pass and a physical audio listening pass.

The installer is `release/Aurora Music Player Setup 0.1.0.exe`. The existing Start-menu shortcut is named **Aurora Music Player** and targets `release/win-unpacked/Aurora Music Player.exe`, so it opens without npm. The installer also creates a Start-menu shortcut with that name when installed. This is an unsigned local build. Native-window behavior and physical listening remain unverified from this session; offline checks cannot certify the Windows audio device path. The real client identity is still needed before a live LRCLIB call.
