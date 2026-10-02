# Aurora

Aurora is a Windows-first local music player focused on live sound shaping and synced lyrics. It has a secure Electron shell, a persistent local library, embedded-tag/artwork reading, playback controls, a sound effects rack, and local synced/plain lyrics with optional LRCLIB lookup.

## Start the desktop shell

For development, install the dependencies once and start the shell:

```powershell
npm install
npm run dev
```

The Aurora window opens at 1440 × 900. From **Library**, add local audio files to search and play. The library index and supported cover images persist in the app's per-user data folder; audio files remain at their original locations. Aurora reads embedded title, artist, album, duration, and supported cover art, with filename fallback when tags are absent. The transport supports play/pause, previous/next, seeking, and volume. **Lab** includes live tempo, pitch, varispeed, and effects controls. **Lyrics** can import LRC, save plain or synced lyrics locally, seek to a line, or make an explicit LRCLIB request. Playback depends on the audio formats supported by Electron's Chromium runtime.

To build a Windows installer, run `npm run dist`. The installer creates a Start-menu shortcut named **Aurora Music Player**. For a development build that can be launched without installing, use `npm run package:dir`; its executable is written to `release/win-unpacked/Aurora Music Player.exe`.

To use online lyrics, open **Settings** and enter a real project homepage or contact email. Aurora does not invent one or send a lookup until you request it. Without a configured contact, local lyric editing and LRC import continue to work.

## Open the three experiments

```powershell
npm run spikes
```

Open `http://127.0.0.1:5179` in a browser. The pages are standalone proofs:

- **Tempo & pitch:** load an audio file or use the generated tone; switch tempo, pitch, and varispeed while playing. Worklet underrun counters appear after playback starts.
- **Lyrics sync:** edit or play the sample LRC against a generated WAV tone. Click a line to seek. Exact lookup uses the original duration; search is available when no exact result is found.
- **8D orbit:** listen to the generated tone through an HRTF panner, with circle and figure-eight paths. Headphones make the spatial movement easier to judge.

LRCLIB asks clients to identify themselves with an app version plus a project page or contact address. The desktop app saves that identity in **Settings**. For the standalone spike server, set a real value for `AURORA_CONTACT`:

```powershell
$env:AURORA_CONTACT = 'https://your-project-homepage.example'
npm run spikes
```

The placeholder above is illustrative; use the actual project homepage or a contact email. Without it, the UI remains usable for local LRC parsing and playback, while network requests stay disabled.

## Project checks

```powershell
npm run typecheck
npm test
npm run lint
npm run format:check
npm run build
```

These checks cover library persistence/metadata, LRC parsing, track helpers, audio effects, lyrics lookup caching, and the desktop build. Listening quality still needs a pass on real tracks and headphones. `npm run dist` builds an unsigned Windows installer; a packaged native-window listening pass remains separate from automated checks.
