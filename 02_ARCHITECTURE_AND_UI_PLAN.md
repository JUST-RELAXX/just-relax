# 02 — ARCHITECTURE & UI PLAN
**Project:** Advanced Windows music player (working name: *Aurora*)
**Audience:** Luna (lead engineer/designer). Everything here is a *proposal grounded in research*; where I say **VERIFY**, check it against the library's own docs before depending on it.

---

## 1. Vision & design principles

1. **A player first.** Pressing play on a song should feel as good as Spotify/Apple Music. The effects rack is a superpower layered on top, never in the way.
2. **Sound quality is sacred.** No clicks, no zipper noise, no clipping surprises. Smooth every parameter; limit the master.
3. **Depth without clutter.** Every effect has a simple face (a few big knobs + presets) and an "Advanced" drawer with every sub-parameter.
4. **Beauty is a requirement.** Motion, color, typography, and micro-interactions are specified, not left to chance.
5. **Local-first and private.** Music, library, presets, and cached lyrics live on the user's machine. Network calls are minimal, polite, and disclosed.
6. **Swappable internals.** UI talks to an `AudioEngine` interface; a native engine could replace the Web Audio one later without a UI rewrite.

### Mental model (for the human, in plain words)
- **Tempo** = how fast the song plays *without* changing how high/low it sounds (like a singer speeding up their talking but staying in the same voice).
- **Pitch** = how high/low it sounds *without* changing speed.
- **Rate / varispeed** = both together, like a vinyl record spinning faster (chipmunk) or slower (deep and slow). "Nightcore" and "slowed + reverb" edits are mostly this.

---

## 2. Scope

### MVP (Milestones 1–4)
Local playback + library, transport, speed/tempo/pitch, EQ/bass, reverb, delay, bit crusher, 8D, master limiter, presets, synced lyrics (LRCLIB + local), beautiful core UI.

### v1.0 (Milestones 5–8)
Gapless/crossfade, visualizer, album-art theming, full-screen lyrics, mini-player, Windows integration (media keys/SMTC, tray, thumbnail buttons), AcoustID fallback, export processed track, installer + auto-update.

### v2 ideas (do not build yet)
Native audio engine (Rust) with WASAPI exclusive output; word-level karaoke lyrics; stem separation; voice isolation / noise reduction (Fairlight-style restoration tools); DJ-style loops/cue points; plugin system; system-wide "companion" lyrics mode (see §7.8); cloud preset sharing.

### Explicit non-goals
Streaming-service integration, downloading from YouTube/Spotify, DRM handling, applying effects to *other apps'* audio (needs a system audio driver — out of scope; see §7.8).

---

## 3. Stack & decision records

### 3.1 Shell: Electron (+ TypeScript)
**Why:** Chromium gives us the Web Audio API, WebGL2, a world-class UI toolkit (React + CSS + Canvas), `navigator.mediaSession` (surfaces to Windows' media overlay), and easy Windows packaging. The reference project AudioShape is Electron + React, which proves the approach for a Windows player with live editing.
**Trade-off:** Larger install, no native WASAPI exclusive mode/ASIO. Mitigation: `AudioEngine` interface for a future native engine.
**Alternative considered:** Tauri v2 + Rust audio (symphonia + cpal + custom DSP). Lighter and more "audiophile," but a far steeper path for an agentic build, and the UI audio-visual tooling is weaker. Revisit for v2.

### 3.2 UI: React + Vite (`electron-vite`), Zustand, Framer Motion (or Motion One), CSS variables for tokens
- Tailwind is allowed but design tokens must still be CSS variables so themes (and album-art accent colors) can swap at runtime.
- Radix UI primitives (headless) for accessible dialogs, menus, tooltips, tabs, sliders. Custom-render all visuals.
- Heavy visuals (spectrum, waveform, visualizer, 8D orbit) use `<canvas>`/WebGL in dedicated components driven by `requestAnimationFrame`, reading from an `AnalyserNode`, never from React state.

### 3.3 Audio: Web Audio API + AudioWorklets (+ optional WASM DSP)
- Graph built from native nodes (`GainNode`, `BiquadFilterNode`, `DelayNode`, `ConvolverNode`, `PannerNode`, `DynamicsCompressorNode`, `AnalyserNode`) plus **custom AudioWorklets** for tempo/pitch, bit-crusher, algorithmic reverb, saturation, limiter.
- DSP in worklets: TypeScript first; move hot loops to **Rust/C++ → WASM** only if profiling demands it.
- **Reference implementation menu (VERIFY each):**
  - **SoundTouchJS** (`@soundtouchjs/audio-worklet`) — real-time pitch/tempo/rate on the audio thread with `AudioParam`-style controls; documented `pitchSemitones` range −24…+24. Its docs describe driving *tempo* via the source's `playbackRate` and letting the node's `pitch` parameter auto-compensate. Also ships `processOffline` for offline rendering and phase-vocoder / formant-correction variants for extreme ratios and vocal naturalness.
  - **Rubber Band** — higher-quality stretcher/shifter with a real-time mode, a newer "R3" engine, and a live pitch-shifter class. **Licensing: GPL, or commercial license.** WASM ports exist (e.g., `@echogarden/rubberband-wasm`, intended for Echogarden — VERIFY real-time suitability). **Do not ship without asking the human.**
  - **Tone.js** — a rich effect catalog (AutoFilter, AutoPanner, BitCrusher, Chorus, FeedbackDelay, Freeverb, JCReverb, PingPongDelay, PitchShift, Reverb, StereoWidener, Tremolo, Vibrato, …). Great as a *reference and for prototyping*; for the final app prefer our own thin worklets/nodes so every sub-parameter and the smoothing behavior is under our control. (Note: Tone's Freeverb runs as an AudioWorkletNode and its docs warn of possible performance cost — measure.)

### 3.4 Lyrics: LRCLIB first
Free, no API key, open source, returns both plain and synced lyrics. Details in §7.

### 3.5 Data: SQLite via `better-sqlite3` in the main process
Library index, play counts, presets, lyrics cache, settings. Renderer talks to it only through typed IPC.

### 3.6 Native helpers (Windows-only, behind small adapters)
- **Now-playing detection (optional companion mode):** Windows' `GlobalSystemMediaTransportControlsSessionManager` (Windows 10 1809+) exposes system-wide media sessions (title, artist, playback state). Node bindings to **VERIFY**: `node-windows-smtc-monitor` (Rust via napi-rs, event-based) and `windows-media-sessions` (spawns a self-contained .NET 8 helper, emits JSON, mentions Electron-main compatibility).
- **Fingerprinting:** ship `fpcalc` (Chromaprint CLI) as a sidecar executable; call with `-json` to get `{duration, fingerprint}`; look up via AcoustID. **VERIFY** Chromaprint/fpcalc license terms before bundling the binary.
- **Transcoding fallback:** `ffmpeg-static` (or similar) for formats Chromium can't decode (WMA, APE, ALAC, etc.). **VERIFY** codec licensing for redistribution.

---

## 4. System architecture

```
┌──────────────────────────────── ELECTRON MAIN PROCESS (Node) ────────────────────────────────┐
│  App lifecycle • Window mgmt (Mica, title bar overlay) • Tray • Global media keys           │
│  Library service (scan/watch: chokidar + music-metadata)  • SQLite (better-sqlite3)         │
│  Lyrics service (LRCLIB client + cache + matcher)         • Fingerprint service (fpcalc→AcoustID)│
│  SMTC bridge (optional companion mode)                    • Updater (electron-updater)       │
└───────────────▲────────────────────────────────────────────────────────────────────────────────┘
                │ typed IPC (contextBridge, invoke/handle + event streams; zod-validated)
┌───────────────┴────────────────── PRELOAD (isolated, minimal API) ─────────────────────────────┐
└───────────────▲────────────────────────────────────────────────────────────────────────────────┘
┌───────────────┴────────────────── RENDERER (React UI, sandboxed) ─────────────────────────────┐
│  Views: Library • Now Playing • Lab (effects) • Lyrics • Visualizer • Settings                │
│  Stores (Zustand): playback, queue, effects, lyrics, ui                                       │
│  AudioEngine (interface) ──► WebAudioEngine                                                   │
│        ├─ TrackPlayer (decode → AudioBufferSource | MediaElement fallback)                    │
│        ├─ TransportClock (source-time position, rate, latency compensation)                   │
│        ├─ EffectRack (graph builder, bypass, reorder, smoothing)                              │
│        └─ Analysis taps (AnalyserNode → canvas visuals, waveform peaks via Worker)            │
└───────────────▲────────────────────────────────────────────────────────────────────────────────┘
                │ MessagePort
┌───────────────┴────────────────── AUDIO RENDER THREAD (AudioWorklets) ────────────────────────┐
│  soundtouch-processor • bitcrusher-processor • reverb-processor • saturator • limiter         │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Security:** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, a strict CSP, a minimal preload API, validate every IPC payload, load local files through a custom protocol (e.g., `aurora-media://`) rather than `file://` wide access. Only the main process touches the network except for the renderer's own bundled assets.

---

## 5. Audio engine design

### 5.1 Signal chain (default order, user-reorderable in Advanced mode)

```
Source ─► Preamp ─► SPEED (tempo/rate + pitch via SoundTouch worklet)
       ─► EQ & BASS (parametric + low shelf + virtual bass + soft saturation)
       ─► BIT CRUSHER ─► DELAY ─► REVERB ─► 8D SPATIALIZER
       ─► Stereo width ─► MASTER LIMITER ─► Analyser tap ─► Destination
```

**Why this order (document in DECISIONS.md, revisit by ear):**
- Time/pitch processing first, on the cleanest signal, so artifacts aren't amplified downstream.
- EQ before time-based effects so reverb/delay don't boom with excess bass.
- Bit-crush before delay/reverb gives "crunchy source in a clean room"; reordering to crush *after* reverb gives a "lo-fi everything" sound — expose as an option.
- Spatializer late so the whole scene (including reverb tails) orbits; offer "Keep reverb in room" mode where the reverb is sent post-spatializer as a fixed-position ambience.
- Limiter last, always, with a ceiling around −1 dBFS (**VERIFY by ear/metering**).

### 5.2 Single source of truth: the parameter schema

```ts
// shared/effects-schema.ts
export type ParamCurve = 'linear' | 'log' | 'exp' | 'semitone' | 'db';
export interface ParamDef {
  id: string;            // "reverb.decay"
  label: string;         // "Decay"
  unit?: 's'|'ms'|'Hz'|'dB'|'%'|'st'|'ct'|'bits'|'x';
  min: number; max: number; default: number;
  step?: number; curve: ParamCurve;
  smoothingMs?: number;  // ramp time to avoid zipper noise
  advanced?: boolean;    // hidden in simple mode
  description: string;   // tooltip, plain-language
}
export interface EffectDef {
  id: 'speed'|'pitch'|'eq'|'bass'|'dynamics'|'bitcrusher'|'delay'|'reverb'|'spatial8d'|'master';
  label: string;
  params: ParamDef[];
  bypassable: boolean;
}
```

The UI renders controls from this schema; presets are `Record<paramId, number>`; the engine maps ids to node parameters; validation clamps. Adding a parameter = adding one object.

### 5.3 Parameter smoothing & safety
- Never assign `.value` directly during playback. Use `AudioParam.setTargetAtTime(value, ctx.currentTime, tau)` or `linearRampToValueAtTime`. Default time constant 10–30 ms; slower (50–100 ms) for delay time to avoid pitch-glide artifacts.
- Custom worklet parameters are declared `a-rate`/`k-rate` `AudioParam`s with smoothing inside the processor.
- Master limiter + a `NaN/Infinity` guard in every custom processor (output zeros and log once if non-finite).
- "Panic" button resets effects to defaults with a 50 ms fade.
- Bypass = equal-power crossfade between dry/wet, never a hard cut.

### 5.4 Playback pipeline & the transport clock

**Two source modes behind `TrackPlayer`:**
1. **Buffer mode (default for tracks ≲ 15 min):** decode to `AudioBuffer`, play via `AudioBufferSourceNode`. Sample-accurate seek/loop/gapless; offline export uses the same graph. Memory note: 44.1 kHz stereo float32 ≈ 21 MB/min (≈ 85 MB for a 4-min track); pre-decode only the *next* track.
2. **Stream mode (long files — DJ mixes, podcasts):** `HTMLMediaElement` → `MediaElementAudioSourceNode`, with `preservesPitch = false` where the SoundTouch pitch compensation is used (**VERIFY** behavior in the library's demo).

**TransportClock (critical for lyrics sync):**

```ts
class TransportClock {
  anchorCtxTime = 0;  // audioContext.currentTime when anchored
  anchorTrackPos = 0; // seconds in SOURCE time
  rate = 1;           // current playbackRate (tempo or varispeed)
  playing = false;
  now(ctx: AudioContext) {
    if (!this.playing) return this.anchorTrackPos;
    const latency = (ctx.outputLatency ?? 0) + ctx.baseLatency; // VERIFY availability
    return this.anchorTrackPos + (ctx.currentTime - this.anchorCtxTime - latency) * this.rate;
  }
  // Re-anchor on play, pause, seek, and EVERY rate change.
}
```

**Rule:** lyrics, waveform cursor, and progress bar all read **source-time position** from this clock — never wall-clock time — so they stay correct at 0.5× or 2× speed.

### 5.5 Seeking, gapless, crossfade
- Seek = stop current source node, create new one at offset, re-anchor the clock. Fade 5 ms around the cut.
- Gapless: schedule next track's source at `startTime = currentEnd` using `AudioBufferSourceNode.start(when)`; keep effects state persistent across tracks (like AudioShape's "edits persist"), with a per-track override option.
- Crossfade: two `TrackPlayer`s feeding a crossfade bus (equal-power), configurable 0–12 s.

### 5.6 Offline export
Render the same graph in `OfflineAudioContext`, duration = `sourceDuration / tempoRatio`. SoundTouch ships an offline helper (**VERIFY**), because worklet-in-offline-context support has historically been inconsistent. Output WAV (16/24-bit) first; MP3/FLAC via ffmpeg later.

---

## 6. Effect specifications

> All ranges/defaults below are **design proposals** — tune by ear. Every effect also has: **Bypass**, **Mix (wet/dry)** where applicable, **Preset menu**, **Reset**.

### 6.1 SPEED (tempo / rate / pitch)
Three modes in one panel, with a **Link** toggle.

| Param | Range | Default | Notes |
|---|---|---|---|
| Tempo | 0.25×–4× (UI sweet-spot band 0.5×–2×) | 1.00× | Changes speed, preserves pitch. Show BPM-equivalent if BPM detected. |
| Pitch (semitones) | −24…+24 st | 0 | Preserves speed. Matches SoundTouch's documented range. |
| Pitch fine (cents) | −100…+100 ct | 0 | |
| Rate / varispeed | 0.25×–4× | 1.00× | Speed **and** pitch together (vinyl/nightcore/slowed). |
| Link | on/off | off | When on, moving Tempo moves Rate-style pitch (nightcore/slowed behavior). |
| Quality | Fast / Balanced / Max | Balanced | Maps to SoundTouch sequence/seek-window/overlap or to a phase-vocoder variant at extreme ratios. **VERIFY** exposed knobs. |
| Preserve formants | on/off | on for vocals | Use the formant-correction worklet **if verified** to avoid "chipmunk/monster" timbre on large shifts. |
| Smooth ramp | 0–500 ms | 80 ms | Time to glide when you drag. |

**Implementation notes**
- Real-time stretching works on small render blocks (AudioWorklet = 128 samples); the library docs explicitly recommend using the source's `playbackRate` for tempo and the node's pitch param for compensation. Follow the docs, then **A/B listen** for artifacts at 0.5×, 1.5×, 2×.
- Surface an **"extreme ratio" warning** and auto-switch to the phase-vocoder variant outside the sweet spot (if verified).
- Show "Nightcore", "Slowed", "Half-time", "Double-time" quick chips.

### 6.2 PITCH SHIFT (as its own effect, independent of Speed)
If Speed already exposes pitch, treat this card as *"Harmonizer-style"* extras:

| Param | Range | Default |
|---|---|---|
| Shift | −12…+12 st (extended −24…+24 in Advanced) | 0 |
| Cents | −100…+100 | 0 |
| Formant shift | −12…+12 st | 0 |
| Mix | 0–100% | 100% |
| Algorithm | Granular (Tone.PitchShift-like) / SoundTouch / Phase-vocoder | SoundTouch |
| Detune spread (chorus-like) | 0–50 ct | 0 |

*Design tip:* put the **primary** pitch control in Speed (where users expect it) and make this card the "creative" one (harmonizer mix, formant shift). Don't ship two redundant sliders that confuse people.

### 6.3 REVERB
Offer **two engines** behind one UI:

1. **Algorithmic (default):** Freeverb-style or Dattorro plate in a worklet — tiny CPU, fully tweakable.
2. **Convolution:** `ConvolverNode` with impulse responses. **Generate synthetic IRs in code** (exponentially decaying filtered noise with early-reflection taps) so there are no licensing issues; allow user-supplied IR files.

| Param | Range | Default | Plain-language meaning |
|---|---|---|---|
| Wet / Dry (Mix) | 0–100% | 30% | How much "room" vs original |
| Room size | 0–100% | 50% | Bigger room = longer, wider echoes |
| Decay (RT60) | 0.1–20 s | 2.0 s | How long the tail lingers |
| Pre-delay | 0–250 ms | 20 ms | Gap before the reverb starts; keeps vocals clear |
| Damping (HF) | 200 Hz–20 kHz | 6 kHz | Higher = brighter tail; lower = warm/dark |
| Diffusion | 0–100% | 70% | Smooth wash vs distinct echoes |
| Early/Late balance | 0–100% | 50% | Early reflections (room "shape") vs late tail |
| Low cut (pre-reverb HPF) | 20–500 Hz | 120 Hz | Stops bass mud |
| High cut | 2–20 kHz | 12 kHz | |
| Stereo width | 0–200% | 100% | |
| Modulation | 0–100% | 10% | Subtle chorusing of the tail (lush, less metallic) |
| Freeze | on/off | off | Infinite sustain (Advanced) |
| Engine | Algorithmic/Convolution | Algorithmic | |

**Presets:** Small Room, Studio, Concert Hall, Cathedral, Plate, Cave, "Slowed + Reverb," Shimmer (pitch-shifted feedback, Advanced).

### 6.4 DELAY
| Param | Range | Default |
|---|---|---|
| Mix | 0–100% | 25% |
| Time (free) | 1–2000 ms | 350 ms |
| Sync | off / 1/4, 1/8, 1/8T, 1/16, dotted… | off (uses detected BPM when on) |
| Feedback | 0–95% (hard-limit below 100%!) | 35% |
| Stereo mode | Mono / Stereo / Ping-pong | Ping-pong |
| Offset L/R | ±50 ms | 0 |
| Feedback HPF / LPF | 20–2000 Hz / 1–20 kHz | 120 Hz / 6 kHz |
| Modulation depth/rate | 0–100% / 0.1–5 Hz | 0 / 0.5 |
| Saturation in loop | 0–100% | 0 |
| Ducking | 0–100% | 0 | (delay level dips while the original is loud)

*Safety:* cap feedback < 1.0 and run the feedback path through the limiter/soft-clipper to prevent runaway.

### 6.5 BIT CRUSHER
A classic lo-fi digital degradation: fewer bits = coarser loudness steps; lower sample rate = grittier highs.

| Param | Range | Default | Note |
|---|---|---|---|
| Bit depth | 1–16 bits | 16 (off) | Quantize: `y = round(x·2^(b−1)) / 2^(b−1)` |
| Sample-rate reduction | 100 Hz–48 kHz (or 1×–64× downsample) | off | Sample-and-hold via phase accumulator |
| Dither | off / TPDF | off | Softens quantization harshness at mid bit depths |
| Jitter | 0–100% | 0 | Randomizes hold timing for analog-ish grit |
| Pre-filter (anti-alias) | on/off + cutoff | on | Reduces harsh aliasing; turn off for "authentic" crunch |
| Post-filter (LPF) | 1–20 kHz | 20 kHz | Tame fizz |
| Mix | 0–100% | 100% | |
| Output gain | −24…+6 dB | 0 | Crushing can change loudness |

Implementation: custom AudioWorklet (Tone.js's BitCrusher is a good reference for the concept; documented bit range there is 1–16 in current docs, while older docs said 1–8 — **VERIFY**, we use our own implementation anyway).

### 6.6 8D AUDIO
"8D" = the sound appears to orbit your head. Needs **headphones**.

**Core implementation:** `PannerNode` with `panningModel = 'HRTF'` (the spec describes HRTF as a higher-quality spatializer using measured impulse responses; it can be CPU-expensive — measure). Drive the panner's `positionX/Y/Z` with a smooth per-frame (or worklet/LFO-driven) orbit around the `AudioListener`.

```
θ(t) = 2π · t / period (+ phase)
x = r · sin θ ,  z = −r · cos θ ,  y = elevation
```

| Param | Range | Default |
|---|---|---|
| Enabled | on/off | off |
| Rotation period | 2–60 s per revolution | 12 s |
| Direction | CW / CCW / Ping-pong | CW |
| Path | Circle / Figure-8 / Ellipse / Random walk | Circle |
| Radius (distance) | 0.5–10 | 3 |
| Elevation | −90…+90° | 0° |
| Height wobble | 0–100% | 0 |
| Distance attenuation | off / gentle / realistic | gentle |
| Binaural model | HRTF / Equal-power (lower CPU) | HRTF |
| Room coupling | 0–100% | 30% | (adds spatialized early reflections for realism)
| Speed ramp | 0–5 s | 1 s |
| Manual mode | Drag the dot on the top-down head view | — |
| Safety note | Auto-warn: "Best on headphones" | — |

*Gotchas:* Doppler shift is deprecated/inconsistent in modern Web Audio — **do not rely on it**; keep distance changes subtle. Avoid abrupt jumps in position (smooth with `setTargetAtTime`). The panner expects a stereo/mono input — mix to a sensible bus before it (**VERIFY** channel handling). Consider **Resonance Audio** (Google's Web SDK; ambisonics, designed as a migration path from `PannerNode`) as an upgrade path (**VERIFY** maintenance status).

### 6.7 BASS & EQ
| Module | Params |
|---|---|
| Bass boost (low shelf) | Freq 40–250 Hz (default 90), Gain −12…+15 dB, Q/slope |
| Sub-bass / "virtual bass" | Crossover 40–120 Hz, harmonic amount 0–100%, mix 0–100% (generates harmonics of lows so small speakers/headphones *perceive* more bass) |
| Parametric EQ | 8 bands: type (low shelf, peak, high shelf, HP, LP, notch), freq, gain, Q; drawn as an interactive curve over a live spectrum |
| Graphic EQ view | 10-band preset layout mapped onto the parametric bands |
| Soft saturation | Drive 0–100%, type (tube/tape/soft-clip), mix |
| Stereo width | 0–200% (mid/side), bass-mono below 120 Hz option |
| Loudness | Preamp −24…+12 dB, optional ReplayGain/EBU R128 normalization (metering details in §6.9) |
| Limiter | Ceiling −3…0 dBFS, release 20–500 ms |

Use `BiquadFilterNode` (formulas from the well-known "Audio EQ Cookbook") for filters. Show a **frequency-response curve** computed from `BiquadFilterNode.getFrequencyResponse()`.

### 6.8 Presets
Global preset = full rack state + chain order. Ship ~20 curated: *Nightcore, Slowed + Reverb, 8D Dream, Lo-Fi Tape, Bass Cannon, Concert Hall, Underwater, Telephone, Vaporwave, Karaoke-ish Wide, Clean/Flat.* Presets are JSON (versioned schema) so they can be imported/exported and shared. Support **A/B compare**, **undo/redo** of parameter changes, and **per-track "remember my effects"**.

### 6.9 FAIRLIGHT-INSPIRED PRO LAYER (Mixer view, dynamics, metering, automation)

**Source of inspiration:** the Fairlight audio page in DaVinci Resolve — a professional mixer where every track has a channel strip with level, pan, meters, a **6-band parametric EQ**, and **dynamics (expander/gate, compressor, limiter)**; signal order within a strip can be rearranged; automation can record changes to parameters during live playback; and extensive metering (level, loudness, phase) is built in. We borrow the *ideas*, not the UI, assets, or name. Our product stays a *player*.

**What we add to the plan**

1. **Dynamics module (new effect, id `dynamics`)** — currently the plan only has a limiter.
   | Section | Params |
   |---|---|
   | Expander/Gate | Threshold −80…0 dB, Ratio 1:1–∞, Attack 0.1–100 ms, Release 10–1000 ms, Range 0–60 dB |
   | Compressor | Threshold −60…0 dB, Ratio 1:1–20:1, Attack 0.1–200 ms, Release 10–2000 ms, Knee 0–24 dB, Makeup gain (auto option), Sidechain HPF 20–500 Hz, Mix (parallel compression) 0–100% |
   | Limiter | Ceiling −3…0 dBFS, Release 20–500 ms, Lookahead 0–5 ms (**VERIFY** achievable latency) |
   Implement as a custom worklet (the built-in `DynamicsCompressorNode` has fixed/limited controls — use it only for prototyping). Show a live gain-reduction meter and a transfer-curve graph.

2. **EQ presentation:** start the parametric EQ at **6 visible bands** (extendable to 8 in Advanced), matching the familiar channel-strip layout; each band: type, freq, gain, Q.

3. **Reorderable strip:** in **Pro view**, EQ, dynamics, and each effect card can be dragged to change signal order (the engine's graph builder already supports reordering — §5.1). Show the order as a horizontal "signal flow" ribbon so it's obvious.

4. **Metering suite (Pro view and optionally a docked mini version):**
   - **Peak + RMS level** with ballistic smoothing and peak-hold.
   - **Loudness:** momentary / short-term / integrated **LUFS** (ITU-R BS.1770 / EBU R128 K-weighting — **VERIFY** formulas; implement in a worklet or Worker; unit-test against reference signals).
   - **True-peak** estimate (4× oversampling) to warn about inter-sample clipping.
   - **Stereo phase / correlation meter** and a **goniometer (vectorscope)** — also looks beautiful.
   - **Spectrum analyser** (log-frequency, 1/3-octave option) and **spectrogram** (scrolling heat-map).
   - **Gain-reduction meters** for compressor/limiter.

5. **Parameter automation ("record my knob moves"):**
   - **Record:** while the song plays, arm a parameter (or "arm all touched") and record its value over **source time**.
   - **Playback:** automation lanes under the waveform replay the moves; each lane has Read / Write / Touch / Off modes (names borrowed from standard DAW practice — keep simple labels in the UI).
   - Storage: per-track JSON `[{paramId, points:[{tSec, value, curve}]}]` in `track_fx` (extend the schema in §8.2 with an `automation_json` column). Applied via scheduled `AudioParam` automation or worklet control messages, keyed to the **TransportClock** so it stays correct at any tempo.
   - Scope: **v1.0 stretch goal (M6)**; ship manual-only first.

6. **Mixer view:** a "Pro" screen showing the whole chain as vertical channel-strip-like sections on one canvas (see §9.3 screen 9). For a single-track player the "strip" is the **master chain**; later, a second strip can host a crossfade/deck B or a "stems" mix (v2).

7. **Spatial extras:** our 8D is a binaural orbit (headphones). Fairlight-class tools target surround/immersive formats — **out of scope**; keep our 8D focused and polished.

**Not borrowing (yet):** recording/ADR tools, console hardware support, 1,000-track engine, noise-reduction/voice-isolation plug-ins (put "voice isolation / noise reduction" in the v2 list; it's a heavy ML/DSP project).

**Pro/Simple split (important for UX):** default **Player view** stays calm (Speed, Reverb, Delay, Bass, 8D, presets). **Pro view** (toggle in Lab) reveals Dynamics, full EQ, metering, signal-order ribbon, and automation lanes. Never force Pro complexity on casual listening.

---

## 7. Lyrics system

### 7.1 Identification pipeline (waterfall — stop at first confident result)
1. **Embedded tags** (`music-metadata`): title, artist, album, duration; also embedded lyrics (ID3 `USLT` unsynced, `SYLT` synced) if present.
2. **Sidecar file:** `Song.lrc` next to the audio file (same base name).
3. **Filename parser:** patterns like `Artist - Title`, `01 - Title`, strip junk (`[Official Video]`, `(Remastered 2011)`, `(feat. X)` handled specially).
4. **Fingerprint fallback:** run `fpcalc -json` → `{duration, fingerprint}` → AcoustID lookup (needs a free app API key; the library docs mention a rate limit of 3 requests/second) → get recording → artist/title. Do this *lazily in the background*, never blocking playback.
5. **Manual fix:** a "Wrong song?" button opens a search box (LRCLIB `/api/search`) so the user can pick the right match; remember the choice per file hash.

### 7.2 Providers & the fetch order
1. Local cache (SQLite) → 2. embedded/sidecar → 3. **LRCLIB `/api/get`** (exact signature) → 4. **LRCLIB `/api/search`** (fuzzy, score results) → 5. plain-lyrics fallback → 6. "No lyrics" state with a manual-search button.

**LRCLIB API facts (from official docs — VERIFY live):**
- `GET https://lrclib.net/api/get?artist_name=…&track_name=…&album_name=…&duration=…` — "best match"; requires track title and artist; duration must match within **±2 seconds** of the stored record.
- `GET /api/get/{id}` — by ID. `GET /api/search?q=…` or `?track_name=…&artist_name=…` — search.
- Response fields include `plainLyrics`, `syncedLyrics` (standard LRC `[mm:ss.xx]`), `instrumental`, `duration`, `trackName`, `artistName`, `albumName`.
- Anonymous, no key. Be a polite client: set a descriptive `User-Agent` (app name/version + contact URL), cache every result (including misses for ~7 days), and de-duplicate in-flight requests.
- **Important:** send the track's **original** duration, not the tempo-adjusted one.

**Other sources (optional, v2):** *Karalyr* is an LRCLIB-compatible, word-synced-only open database (API-compatible by swapping the base URL). Treat any alternate provider as optional and check its terms. **Do not** scrape Musixmatch/Genius/Spotify or other sources whose terms forbid it.

### 7.3 Parsing & data model
```ts
interface LyricLine { timeMs: number; text: string; words?: {timeMs:number; text:string}[] }
interface LyricsDoc {
  source: 'embedded'|'sidecar'|'lrclib'|'manual';
  synced: boolean; instrumental: boolean;
  lines: LyricLine[]; plain?: string;
  offsetMs: number;             // user-adjustable global offset
  trackKey: string;             // hash(artist|title|album|durationRounded)
}
```
Parser must handle: multiple timestamps per line (`[00:10.00][01:20.00]text`), metadata tags (`[ar:]`, `[ti:]`, `[offset:]`), 2- or 3-digit fractions, blank "gap" lines, and (later) enhanced LRC word tags `<mm:ss.xx>`.

### 7.4 Sync engine
- Pre-sort lines; at each animation frame compute `pos = clock.now() * 1000 + offsetMs` and **binary-search** for the active line index. Only update UI when the index changes.
- Because `clock.now()` returns **source time**, sync is correct at any tempo/rate (see §5.4).
- Interpolate scroll position with spring physics so scrolling feels fluid; trigger line-change animations only on index change.
- Seek handling: after a seek, snap (no animation) to the correct line.

### 7.5 Lyrics UI (Spotify/Apple-inspired, but ours)
- Large, bold, left-aligned type; active line full-opacity and scaled up; past lines dimmed; upcoming lines progressively dimmer; subtle blur on distant lines.
- Background: animated gradient mesh derived from album art; optional visualizer glow.
- **Click a line to seek.** Hover shows a timestamp.
- Controls: offset ±50 ms (hold to repeat) with live value, font size, alignment, "show translation" (v2), toggle to plain mode.
- Word-level karaoke fill (if word timings exist).
- Empty states are designed, not an afterthought: "Instrumental ♪", "No synced lyrics — showing plain text", "Search lyrics".

### 7.6 Caching
SQLite table `lyrics_cache(track_key PK, source, synced, payload_json, fetched_at, miss BOOL)`; hits are permanent until user refreshes; misses expire after ~7 days.

### 7.7 Matching quality
Normalize titles/artists (lowercase, strip diacritics, remove bracketed qualifiers, `feat.` handling, `&`/`and`), then score search candidates by: normalized title similarity, artist similarity, album match, and duration closeness. Require a minimum score; below it, show a "Is this right?" confirmation.

### 7.8 "What's playing?" — two different meanings, be explicit
- **A) Player mode (the product):** the app plays the song, so it already *knows* what's playing (tags/fingerprint). This is the core feature.
- **B) Companion mode (optional, later):** detect songs playing in *other* apps (Spotify, browsers) using Windows SMTC (`GlobalSystemMediaTransportControlsSessionManager`) and show synced lyrics in a floating/overlay window. This can show lyrics and a visualizer-only view. **It cannot apply our effects to other apps' audio** — that requires a system-level audio driver/APO, which is out of scope.

---

## 8. Library & data model

### 8.1 Supported formats
Chromium-decodable by default: MP3, WAV, FLAC, OGG (Vorbis/Opus), M4A/AAC. Fallback via ffmpeg transcode for others. Tag read/write via `music-metadata` (read) + a writer lib (**VERIFY** options) in v1.

### 8.2 SQLite schema (sketch)
```sql
CREATE TABLE tracks(
  id INTEGER PRIMARY KEY, path TEXT UNIQUE, hash TEXT, title TEXT, artist TEXT,
  album TEXT, album_artist TEXT, track_no INT, disc_no INT, year INT,
  duration_ms INT, bitrate INT, sample_rate INT, codec TEXT,
  art_hash TEXT, added_at INT, last_played_at INT, play_count INT DEFAULT 0, bpm REAL
);
CREATE TABLE playlists(id INTEGER PRIMARY KEY, name TEXT, created_at INT);
CREATE TABLE playlist_tracks(playlist_id INT, track_id INT, position INT);
CREATE TABLE presets(id INTEGER PRIMARY KEY, name TEXT, json TEXT, builtin INT, created_at INT);
CREATE TABLE track_fx(track_id INT PRIMARY KEY, preset_json TEXT, automation_json TEXT);   -- per-track remembered effects + recorded automation lanes
CREATE TABLE lyrics_cache(track_key TEXT PRIMARY KEY, source TEXT, synced INT, payload TEXT, fetched_at INT, miss INT);
CREATE TABLE settings(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE art(hash TEXT PRIMARY KEY, mime TEXT, dominant_colors TEXT, path TEXT);
```
Index `artist`, `album`, `title`, `path`. Full-text search via SQLite FTS5.

### 8.3 Library scanning
Initial scan in a worker/utility process with progress events; incremental updates via a file watcher (`chokidar`); debounce; hash by size+mtime first, content hash lazily. Extract and cache album art to disk (thumbnails at 3 sizes), compute dominant colors once (e.g., `node-vibrant`; **VERIFY**).

---

## 9. UI/UX design spec

### 9.1 Design language: "Liquid Night"
Dark-first, depth through *light and blur*, not borders. Think: frosted glass panels floating over a living gradient that's pulled from the current album art.

**Design tokens (CSS variables; propose, then refine):**
```
--bg-0:#07070C   --bg-1:#0C0C14   --bg-2:#12121C        (base surfaces)
--glass:rgba(255,255,255,.06)  --glass-strong:rgba(255,255,255,.10)
--stroke:rgba(255,255,255,.08) --text-1:#F4F4FA  --text-2:#B5B5C9  --text-3:#7E7E96
--accent: dynamic (from album art)   --accent-2: dynamic complement
--success:#4ADE80 --warn:#FBBF24 --danger:#F87171
--radius-s:10px --radius-m:16px --radius-l:24px --radius-xl:32px
--blur:24px  --shadow-float:0 20px 60px rgba(0,0,0,.45)
--ease-out:cubic-bezier(.22,1,.36,1)  --ease-spring: (use spring physics via Motion)
```
- **Accent extraction:** pull 3–5 dominant colors from album art; ensure WCAG contrast for text by auto-darkening/lightening; cross-fade accent over ~600 ms on track change.
- **Light theme** (later) must be token-swappable; ship dark first, perfectly.
- Optional **Win11 Mica/acrylic** backdrop (Electron `backgroundMaterial` — **VERIFY** version/OS support) with a graceful fallback to our own blurred gradient on Win10.

**Typography:** two families, bundled locally (app must work offline). Suggestion: a geometric display face for titles/lyrics (e.g., *Sora*, *Plus Jakarta Sans*, or *Space Grotesk*) + a clean UI sans (*Inter*), plus a tabular-figures style for times/values. Lyrics are huge (clamp 28–56 px). Respect system text scaling.

**Iconography:** one consistent set (Lucide or Phosphor), 1.5 px strokes, custom-draw the play/pause morph.

### 9.2 Window & layout (desktop, 1280×800 default; min 960×620)
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Custom title bar (draggable, Win11 snap-layouts compatible, search box)     │
├────┬─────────────────────────────────────────────────────┬──────────────────┤
│Rail│              MAIN STAGE (swaps by view)             │  EFFECTS RACK    │
│    │  Library / Now Playing / Lyrics / Visualizer / Lab  │  (slide-over     │
│ ♪  │                                                     │   drawer, ⌘/Ctrl │
│ ☰  │                                                     │   + E toggles)   │
│ ✦  │                                                     │                  │
│ ⚙  │                                                     │                  │
├────┴─────────────────────────────────────────────────────┴──────────────────┤
│  TRANSPORT: art • title/artist • ◀◀ ▶/❚❚ ▶▶ • waveform scrubber • vol • FX•  │
└─────────────────────────────────────────────────────────────────────────────┘
```
Left **rail**: Home, Library, Playlists, Lab, Lyrics, Visualizer, Settings (icons with animated active indicator). Right **Effects Rack**: a vertical stack of effect cards (collapsible, drag-reorder, bypass toggles), each with a "simple" face and "Advanced" expander.

### 9.3 Key screens
1. **Home/Library:** big-art grid, recently played, search with instant FTS results, smooth virtualized lists (`@tanstack/react-virtual`) for 50k+ tracks, context menus, multi-select.
2. **Now Playing:** huge art with parallax tilt on hover, blurred-art background, title/artist, waveform scrubber (peaks computed in a Worker and cached), queue peek, quick FX chips (Slowed, Nightcore, 8D, Bass).
3. **Lab (the signature screen):** the full rack as a spacious canvas:
   - Top: live **spectrum + waveform** hero with the EQ curve overlaid and draggable.
   - Left cluster: **Speed** big dial/slider with chips; tempo/pitch/rate triple-control with the Link toggle.
   - Center: **Reverb** XY pad (X = size/decay, Y = wet/damping) + sub-knobs; **Delay** XY pad (X = time, Y = feedback) + sync dropdown.
   - Right: **8D orbit** top-down head with the orbiting dot, drag to override, ring shows path; **Bit crusher** with a "staircase" waveform preview showing the quantization; **Bass** with a pulsing sub meter.
   - Bottom: preset bar (A/B, undo/redo, save, share, reset, panic).
4. **Lyrics (full-screen):** see §7.5; hide chrome after 3 s idle; tap/hover to reveal.
5. **Visualizer:** Butterchurn (MilkDrop-style, WebGL2, MIT) presets + custom shader scenes; `butterchurn.createVisualizer(audioContext, canvas, …)` then `connectAudio(node)` — **VERIFY** current package/version (there is also a `@webamp/butterchurn` 3.x beta); auto-switch presets on beat; respect reduced-motion.
6. **Mini-player:** frameless, always-on-top toggle, art + lyrics line + 3 buttons; snaps to screen edges.
7. **Settings:** audio output device (`AudioContext.setSinkId` — **VERIFY** support), crossfade, library folders, lyrics provider/offset defaults, appearance, shortcuts, privacy (what leaves the machine), diagnostics.
8. **First-run onboarding:** pick music folder → 20-second animated tour → "Try Slowed + Reverb" demo on the first track.
9. **Pro Mixer (Fairlight-inspired, toggled from Lab):** one wide canvas laid out like a console channel strip for the master chain, left to right: input trim → gate/expander → EQ (6–8 band curve over live spectrum) → compressor (transfer curve + gain-reduction meter) → effect cards (draggable order, with a signal-flow ribbon on top) → pan/width → limiter → output fader. A **meter bridge** runs along the top or right (peak/RMS, LUFS momentary/short/integrated, true-peak, phase correlation, goniometer, spectrogram). Under the waveform sit **automation lanes** (Read/Write/Touch/Off). Design rules: same glass/token system as the rest of the app, denser type scale, tabular numerals for every readout, every control still keyboard-accessible. Hidden by default; the calm Player view remains the default.

### 9.4 Custom components (build once, reuse everywhere)
- **Knob:** SVG arc, drag vertical = value, Shift = fine, double-click = reset to default, scroll-wheel, keyboard arrows, value tooltip while dragging, glow in accent color, ARIA `slider`.
- **XY Pad:** canvas with inertia, crosshair, optional grid, trail that fades.
- **Meter:** peak + RMS with ballistic smoothing.
- **Waveform scrubber:** pre-rendered peaks; played portion in accent gradient; hover preview time; click/drag to seek; shows loop markers (later).
- **Segmented control, toggle, chip, preset menu, toast, context menu, tooltip** with consistent motion.
- **Glass card** primitive (blur, 1 px inner stroke, noise grain overlay at 3–4% to avoid banding).

### 9.5 Motion
- Spring physics for layout changes and scrolling; 150–250 ms for hover/press; 400–600 ms for view transitions and accent changes.
- Shared-element transition: the transport-bar album art expands into the Now Playing art.
- Everything audio-reactive (glows, meters) uses `AnalyserNode` data smoothed with attack/release; capped at 60 fps; **pause all animation when the window is hidden/minimized**.
- `prefers-reduced-motion`: replace parallax/zoom with fades; disable blur-heavy effects; keep audio-reactive visuals subtle.

### 9.6 Accessibility & input
Keyboard-complete (focus rings that match the design), all controls have labels, color is never the only indicator, minimum contrast AA, screen-reader live region for track changes, global media keys, in-app shortcuts (Space, ←/→ seek, ↑/↓ volume, L lyrics, E effects, M mini, F fullscreen, Ctrl+K command palette).
A **command palette** (Ctrl+K) for power users: "apply preset…", "go to…", "sleep timer".

### 9.7 Perceived-performance rules
Skeleton states, optimistic UI, prefetch the next track's art/lyrics, never block the UI on disk/network, animate transforms/opacity only (GPU-friendly), avoid `backdrop-filter` stacking beyond ~3 layers (it's expensive — measure on mid-range GPUs).

---

## 10. Repository structure

```
/aurora
  /apps
    /desktop
      /src
        /main          # Electron main: window, ipc handlers, services
          /services    # library, lyrics, fingerprint, smtc, updater
          /db          # sqlite, migrations
        /preload       # contextBridge API (tiny)
        /renderer      # React app
          /app         # routing, layout, providers
          /features    # library, player, lab, lyrics, visualizer, settings
          /audio       # AudioEngine, TrackPlayer, TransportClock, EffectRack
            /worklets  # soundtouch, bitcrusher, reverb, saturator, limiter
          /ui          # design system: Knob, XYPad, Meter, Glass, etc.
          /stores      # zustand
          /styles      # tokens.css, themes, fonts
  /packages
    /schema            # effects-schema.ts, presets, zod types, ipc contracts
    /dsp               # pure TS DSP + (optional) wasm; unit-tested offline
    /lyrics            # LRC parser, matcher, providers (pure, testable)
  /resources           # fpcalc, icons, installer assets
  /docs                # DECISIONS.md, PROGRESS.md, ARCHITECTURE.md
  /spikes              # throwaway proofs (kept for reference)
  /tests               # e2e (Playwright), fixtures (tiny royalty-free audio)
```
Use a workspace (pnpm or npm workspaces). Keep `packages/*` free of Electron imports so they're unit-testable.

---

## 11. IPC contract (typed, validated)

```ts
// packages/schema/ipc.ts  (zod schemas for each)
type IpcApi = {
  'library:scan':      (folders: string[]) => Promise<void>;
  'library:query':     (q: LibraryQuery) => Promise<Track[]>;
  'library:getArt':    (artHash: string, size: 128|512|1024) => Promise<string /*aurora-media URL*/>;
  'lyrics:get':        (sig: TrackSig) => Promise<LyricsDoc | null>;
  'lyrics:search':     (q: string) => Promise<LyricsCandidate[]>;
  'lyrics:choose':     (trackKey: string, candidateId: number) => Promise<LyricsDoc>;
  'fingerprint:identify': (path: string) => Promise<TrackSig | null>;
  'presets:list|save|delete|import|export': …;
  'settings:get|set': …;
  'app:quit|minimize|toggleMini|setAlwaysOnTop': …;
};
type IpcEvents = {
  'library:progress': {done:number; total:number};
  'library:changed':  {added:number; removed:number};
  'media:key':        'playpause'|'next'|'prev'|'stop';
  'smtc:nowPlaying':  NowPlaying;      // companion mode only
};
interface TrackSig { artist:string; title:string; album?:string; durationSec:number }
```

---

## 12. Performance budgets & quality gates

| Area | Budget |
|---|---|
| Audio thread | No underruns/glitches for a 2-hour soak at 48 kHz with *all* effects on (HRTF 8D + reverb + delay + stretch) on a mid-range laptop |
| CPU while playing (all FX on) | Aim < 15–20% of one core in the renderer; measure with Performance panel + `AudioContext` render-capacity metrics if available (**VERIFY**) |
| Parameter change latency | < 20 ms to audible effect; zero clicks |
| UI frame rate | 60 fps during playback with visuals on; main-thread long tasks < 50 ms |
| Cold start | Window visible < 1.5 s; library interactive < 3 s for 20k tracks |
| Memory | < 400 MB typical with a 20k-track library (art thumbnails on disk, lazy loaded) |
| Lyrics | Cache hit < 20 ms; network fetch < 1.5 s typical; never blocks playback |
| Installer | < 200 MB (Electron baseline); auto-update delta-capable |

**Quality gates in CI:** type-check, lint, unit tests, DSP null-tests (below), e2e smoke (launch → play fixture → toggle each effect → assert no exceptions), bundle-size report.

---

## 13. Testing strategy

- **DSP unit tests (offline):** render known signals via `OfflineAudioContext` (or pure-TS DSP in Node): sine sweeps, impulses, white noise. Assert: bypass is bit-transparent (null test), bit-crusher output has ≤ 2^b distinct levels, delay feedback never exceeds unity, limiter never exceeds ceiling, no NaN/∞ ever.
- **Tempo/pitch tests:** feed a 440 Hz sine at tempo 0.5× → output frequency still ≈ 440 Hz and duration ≈ 2×; pitch +12 st → ≈ 880 Hz, same duration. Use FFT peak detection.
- **Lyrics tests:** LRC parser fixtures (multi-timestamp, offsets, bad lines); binary-search active-line tests; matcher scoring tests with real-world title messes ("(Remastered 2011)", "feat.").
- **Network:** mock LRCLIB with recorded fixtures; test 404 (not found), instrumental, timeouts, retries/backoff.
- **E2E (Playwright for Electron):** launch, scan fixtures, play, seek, open Lab, move knobs via keyboard, open lyrics, verify highlighted line changes as time advances.
- **Manual listening checklist** (kept in `/docs/LISTENING_TESTS.md`): tempo 0.5/0.75/1.25/1.5/2×; pitch ±3/±7/±12; extreme reverb decay; delay feedback 90%; bit-crush 4/8 bits; 8D at 6/12/30 s; bass boost +12 dB on bass-heavy tracks (watch the limiter); rapid knob sweeps (listen for zipper noise).
- **Soak test:** 2-hour loop with random effect automation; watch memory growth (leaks in AudioNode graphs are the classic bug — always `disconnect()` and dereference).

---

## 14. Windows integration, packaging, updates

- **Media keys & Windows now-playing:** set `navigator.mediaSession.metadata` (title, artist, album, artwork) and action handlers so Windows' media overlay and keyboard media keys work. Also register global shortcuts as fallback.
- **Title bar:** custom with `titleBarOverlay` for native window controls; keep Snap Layouts working (**VERIFY**).
- **Taskbar:** thumbnail toolbar buttons (prev/play/next) via `BrowserWindow.setThumbarButtons`; Jump List tasks; tray icon with mini menu.
- **Single instance lock**, deep "open with" file association for audio files, drag-and-drop to play/enqueue.
- **Installer:** `electron-builder` NSIS (per-user install default, no admin). Code-signing certificate recommended to avoid SmartScreen warnings (costs money — ask the human).
- **Auto-update:** `electron-updater` against GitHub Releases; staged rollouts later.
- **Crash/diagnostics:** local log files with rotation; opt-in crash reports only.
- **Licenses:** generate a third-party license notice file in the build; keep a `LICENSES.md` ledger of every dependency's license (flag GPL/LGPL/commercial).

---

## 15. Roadmap — milestones with acceptance criteria

**M0 — Spikes & scaffold (see starting prompt).**
*Done when:* 3 spikes work; repo builds; empty themed window launches; `AudioEngine` stub + schema package exist.

**M1 — Core player**
Scan folder → library list → play/pause/seek/volume/next/prev, queue, shuffle/repeat, album art, media keys, persistent settings, TransportClock.
*Done when:* play 1,000 tracks from a folder; seek is accurate; app restarts and restores last state.

**M2 — Speed & pitch**
SoundTouch worklet integrated; Speed panel (tempo/pitch/rate/link/quality); chips (Nightcore/Slowed); smooth ramps; master limiter; panic button.
*Done when:* sine-wave tests pass; no clicks when dragging; usable range documented.

**M3 — Effects rack**
EQ+Bass, Bit crusher, Delay, Reverb (algorithmic first), 8D (HRTF), bypass, mix, presets, A/B, undo/redo; all driven by the schema.
*Also:* dynamics module (§6.9) and a basic peak/RMS + LUFS meter.
*Done when:* every parameter in §6 is wired from schema → UI → DSP; null tests pass; 20 curated presets sound good.

**M4 — Lyrics v1**
LRC parser, LRCLIB client + cache, matcher, sync engine, Spotify-style view, offset control, manual search, plain fallback.
*Done when:* ≥ 90% of a 200-song popular-music test set returns synced lyrics; sync within ±150 ms at 0.5×/1×/2×.

**M5 — The beautiful pass**
Full design system, Lab screen, XY pads, knobs, waveform scrubber, album-art theming, motion polish, onboarding, reduced-motion, accessibility audit.
*Also:* Pro Mixer view (§9.3 screen 9) with the full metering suite (true-peak, phase/goniometer, spectrogram) and the signal-order ribbon.
*Done when:* design review checklist (consistent tokens, no raw colors in components, motion spec met, AA contrast) passes; screenshots look portfolio-worthy.

**M6 — Pro playback**
Gapless, crossfade, convolution reverb option, per-track FX memory, output-device selection, export processed track, visualizer (Butterchurn).
*Also (stretch):* parameter automation record/playback lanes (§6.9).
*Done when:* gapless verified with a test album; export matches live sound by null-comparison within tolerance.

**M7 — Identification & polish**
AcoustID fingerprint fallback, mini-player, tray/thumbnail buttons, command palette, tag editor basics.
*Done when:* an untagged file identifies and shows lyrics automatically.

**M8 — Ship**
Installer, auto-update, code signing (if purchased), license ledger, crash-free soak test, docs, release notes.
*Done when:* clean-machine install test passes on Windows 10 and 11.

**Backlog / v2:** native audio engine (Rust, WASAPI), word-level lyrics, stem separation, companion lyrics overlay for other apps (SMTC), cloud presets.

---

## 16. Risks & mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Time-stretch artifacts at extreme tempo | High | Quality modes; phase-vocoder variant outside sweet spot; clearly mark "extreme" ranges; evaluate Rubber Band later (license!) |
| Worklet CPU spikes with HRTF + reverb + stretch | Med | Profile early (M2/M3); equal-power fallback; lower-quality "Eco" mode; WASM for hot loops |
| Web Audio zipper noise | Med | Mandatory smoothing in schema; lint rule forbidding direct `.value =` assignments in engine |
| Offline rendering ≠ live sound | Med | Share the same graph builder; null-compare test |
| Lyrics mismatches (wrong version/duration) | High | Duration tolerance, scoring, "Wrong song?" UX, per-file memory, offset control |
| Lyrics API outage / rate limit | Med | Cache, backoff, de-dupe, offline mode, optional second provider (checked for ToS) |
| Licensing (GPL Rubber Band, ffmpeg codecs, fpcalc binary) | Med | `LICENSES.md` ledger; ask the human before shipping any GPL/commercial piece |
| Antivirus/SmartScreen false positives | Med | Code signing; avoid obfuscation; clear installer metadata |
| Memory leaks from audio graphs | Med | Single graph owner; explicit dispose; soak test with heap snapshots |
| Native module build pain (better-sqlite3, SMTC addons) | Med | Use prebuilt binaries; `electron-rebuild` in CI; pin Electron version; fallback helper-process approach for SMTC |
| Scope creep | High | Milestone gates; v2 list is *off-limits* until M8 |

---

## 17. Open questions for the human (Luna: ask only when you reach the relevant milestone)
1. Final **app name** and a logo direction (neon/minimal/organic)?
2. OK to **evaluate Rubber Band** (GPL/commercial) later, or stay strictly permissive-licensed?
3. Is **free-to-distribute** the plan, or commercial? (Affects licensing and code-signing budget.)
4. Should **companion mode** (lyrics for Spotify/YouTube playing in other apps) be pulled into v1?
5. ~~What did "Farlight" refer to?~~ **Resolved:** Fairlight (DaVinci Resolve's audio page). Ask the human which Fairlight-style features matter most: mixer view, dynamics, metering, automation? (Default order of priority in this plan: metering → dynamics → mixer view → automation.)
6. Light theme needed, or dark-only is fine for v1?
