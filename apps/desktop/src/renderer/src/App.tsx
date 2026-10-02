import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  AudioLines,
  AudioWaveform,
  ChevronDown,
  Disc3,
  FileText,
  Headphones,
  Library,
  ListMusic,
  Music2,
  Pause,
  Play,
  Plus,
  Search,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import { APP_NAME, APP_VERSION } from '../../shared/app-config';
import {
  createDefaultEffectSettings,
  effectDefinitions,
  normalizeEffectSettings,
  type EffectId,
  type EffectSettings,
} from '@aurora/schema/effects';
import { activeLyricIndex, parseLrc } from '@aurora/lyrics/lrc';
import type { LyricsLookup, LyricsRecord, LyricsResult } from '../../shared/lyrics';
import { HTMLAudioEngine, type PlaybackSnapshot, type SpeedMode } from './audio/AudioEngine';
import { formatTime, localTrackFromFile, type LocalTrack } from './library/track';

const navItems = [
  { label: 'Home', icon: AudioLines },
  { label: 'Library', icon: Library },
  { label: 'Playlists', icon: ListMusic },
  { label: 'Lab', icon: SlidersHorizontal },
  { label: 'Lyrics', icon: Music2 },
];

const featureCards = [
  {
    title: 'Shape the tempo',
    detail: 'Find a pace that feels like yours.',
    icon: AudioWaveform,
    tone: 'lilac',
  },
  {
    title: 'Make it yours',
    detail: 'A little space, warmth, or color.',
    icon: Sparkles,
    tone: 'amber',
  },
  {
    title: 'Stay in the moment',
    detail: 'Lyrics that move with the music.',
    icon: Headphones,
    tone: 'mint',
  },
];

const emptyPlayback: PlaybackSnapshot = {
  trackPositionSeconds: 0,
  durationSeconds: 0,
  playing: false,
  volume: 0.8,
  errorMessage: null,
  dspMetrics: null,
  workletAvailable: null,
};

type SavedLyricsKind = 'synced' | 'plain' | 'instrumental';
interface SavedLyrics {
  kind: SavedLyricsKind;
  text: string;
}

function savedLyricsByTrack(): Record<string, SavedLyrics> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem('aurora.local-lyrics') ?? '{}');
    if (!value || typeof value !== 'object') return {};
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => {
          if (!item || typeof item !== 'object') return false;
          const entry = item as Partial<SavedLyrics>;
          return (
            typeof entry.text === 'string' &&
            entry.text.length <= 512_000 &&
            ['synced', 'plain', 'instrumental'].includes(entry.kind ?? '')
          );
        })
        .map(([id, item]) => [id, item as SavedLyrics]),
    );
  } catch {
    return {};
  }
}

function savedEffectSettings(): EffectSettings {
  try {
    return normalizeEffectSettings(
      JSON.parse(localStorage.getItem('aurora.effect-settings') ?? 'null'),
    );
  } catch {
    return createDefaultEffectSettings();
  }
}

export function App() {
  const [activeNav, setActiveNav] = useState('Home');
  const [tracks, setTracks] = useState<LocalTrack[]>([]);
  const [currentTrack, setCurrentTrack] = useState<LocalTrack | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [playback, setPlayback] = useState(emptyPlayback);
  const [speedMode, setSpeedMode] = useState<SpeedMode>('tempo');
  const [speedValue, setSpeedValue] = useState(1);
  const [effectSettings, setEffectSettings] = useState(savedEffectSettings);
  const [localLyrics, setLocalLyrics] = useState(savedLyricsByTrack);
  const [lyricDraft, setLyricDraft] = useState('');
  const [lyricStatus, setLyricStatus] = useState('Choose a song, then add or find its lyrics.');
  const [lyricCandidates, setLyricCandidates] = useState<LyricsRecord[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [contactDraft, setContactDraft] = useState('');
  const [contactStatus, setContactStatus] = useState('');
  const [engine] = useState(() => new HTMLAudioEngine());
  const [notice, setNotice] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lyricsFileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const objectUrls = useRef(new Set<string>());
  const lyricLineRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const localLyricsRef = useRef(localLyrics);

  useEffect(() => {
    if (!settingsOpen) return;
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setSettingsOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [settingsOpen]);

  useEffect(() => {
    const unsubscribe = engine.subscribe(setPlayback);
    return () => {
      unsubscribe();
      engine.dispose();
    };
  }, [engine]);

  useEffect(() => {
    try {
      localStorage.setItem('aurora.effect-settings', JSON.stringify(effectSettings));
    } catch {
      // Effects still work for this session when browser storage is unavailable.
    }
    for (const definition of effectDefinitions) {
      engine.setEffectEnabled(definition.id, effectSettings[definition.id].enabled);
      for (const parameter of definition.params) {
        engine.setEffectParameter(
          definition.id,
          parameter.id,
          effectSettings[definition.id].params[parameter.id],
        );
      }
    }
  }, [effectSettings, engine]);

  useEffect(() => {
    try {
      localStorage.setItem('aurora.local-lyrics', JSON.stringify(localLyrics));
    } catch {
      // Keep the in-memory copy available even if browser storage is full.
    }
  }, [localLyrics]);

  useEffect(() => {
    localLyricsRef.current = localLyrics;
  }, [localLyrics]);

  useEffect(() => {
    const saved = currentTrack ? localLyricsRef.current[currentTrack.id] : undefined;
    setLyricDraft(saved?.text ?? '');
    setLyricCandidates([]);
    setLyricStatus(
      saved?.kind === 'instrumental'
        ? 'Marked instrumental on this device.'
        : saved
          ? saved.kind === 'synced'
            ? 'Saved synced lyrics for this track.'
            : 'Saved plain lyrics for this track.'
          : currentTrack
            ? 'No lyrics saved for this track yet.'
            : 'Choose a song, then add or find its lyrics.',
    );
  }, [currentTrack]);

  useEffect(() => {
    if (!window.aurora) return;
    void window.aurora.lyrics
      .getContact()
      .then((contact) => setContactDraft(contact ?? ''))
      .catch(() => setContactStatus('Saved lyrics settings could not be loaded.'));
  }, []);

  useEffect(() => {
    if (!window.aurora) return;
    void window.aurora.library
      .list()
      .then((savedTracks) => setTracks(savedTracks))
      .catch(() => setNotice('Your saved library could not be loaded.'));
  }, []);

  useEffect(
    () => () => {
      for (const source of objectUrls.current) URL.revokeObjectURL(source);
    },
    [],
  );

  useEffect(() => {
    const handleSearchShortcut = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setActiveNav('Library');
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleSearchShortcut);
    return () => window.removeEventListener('keydown', handleSearchShortcut);
  }, []);

  const visibleTracks = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    if (!query) return tracks;
    return tracks.filter((track) =>
      `${track.title} ${track.artist} ${track.fileName}`.toLocaleLowerCase().includes(query),
    );
  }, [searchQuery, tracks]);

  const chooseFiles = (): void => {
    setActiveNav('Library');
    if (window.aurora) {
      void window.aurora.library
        .import()
        .then(({ tracks: importedTracks, rejectedCount }) => {
          if (importedTracks.length === 0) {
            if (rejectedCount > 0)
              setNotice('Those files are already in your library or could not be read.');
            return;
          }
          setTracks((existing) => {
            const ids = new Set(existing.map((track) => track.id));
            return [...existing, ...importedTracks.filter((track) => !ids.has(track.id))];
          });
          setCurrentTrack((current) => current ?? importedTracks[0]);
          setNotice(
            `${importedTracks.length} ${importedTracks.length === 1 ? 'track' : 'tracks'} added to your library.${
              rejectedCount ? ` ${rejectedCount} already existed or could not be read.` : ''
            }`,
          );
        })
        .catch(() => setNotice('Aurora could not add those audio files.'));
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleFileSelection = (event: ChangeEvent<HTMLInputElement>): void => {
    const selectedFiles = Array.from(event.currentTarget.files ?? []);
    const importedTracks = selectedFiles
      .map((file) => localTrackFromFile(file))
      .filter((track): track is LocalTrack => track !== null);

    for (const track of importedTracks) objectUrls.current.add(track.source);
    if (importedTracks.length === 0) {
      setNotice('No supported audio files were selected.');
    } else {
      setTracks((existing) => [...existing, ...importedTracks]);
      setCurrentTrack((current) => current ?? importedTracks[0]);
      setNotice(
        `${importedTracks.length} ${importedTracks.length === 1 ? 'track' : 'tracks'} added to this session.`,
      );
    }
    event.currentTarget.value = '';
  };

  const playTrack = async (track: LocalTrack): Promise<void> => {
    if (!engine) return;
    if (!track.available) {
      setNotice(
        'This file is no longer at its saved location. Remove it and add it again to play it.',
      );
      return;
    }
    setCurrentTrack(track);
    setNotice('');
    try {
      await engine.load(track.source);
      await engine.play();
    } catch {
      // The engine publishes a readable playback error in its snapshot.
    }
  };

  const removeTrack = async (track: LocalTrack): Promise<void> => {
    try {
      if (window.aurora) await window.aurora.library.remove(track.id);
      else URL.revokeObjectURL(track.source);
      objectUrls.current.delete(track.source);
      setTracks((existing) => existing.filter((item) => item.id !== track.id));
      setLocalLyrics((existing) => {
        const next = { ...existing };
        delete next[track.id];
        return next;
      });
      if (currentTrack?.id === track.id) {
        engine.pause();
        setCurrentTrack(null);
      }
      setNotice(`Removed ${track.title} from your library.`);
    } catch {
      setNotice(`Aurora could not remove ${track.title}.`);
    }
  };

  const saveLocalLyrics = (text: string, kind?: SavedLyricsKind): void => {
    if (!currentTrack) {
      setLyricStatus('Choose a song before saving lyrics.');
      return;
    }
    if (text.length > 512_000) {
      setLyricStatus('This lyrics file is too large to save in the local library.');
      return;
    }
    const parsed = parseLrc(text);
    const savedKind = kind ?? (parsed.lines.length > 0 ? 'synced' : 'plain');
    const next = { ...localLyricsRef.current, [currentTrack.id]: { text, kind: savedKind } };
    try {
      localStorage.setItem('aurora.local-lyrics', JSON.stringify(next));
    } catch {
      setLyricStatus(
        'Lyrics could not be saved in this device’s app storage. Free some storage and try again.',
      );
      return;
    }
    localLyricsRef.current = next;
    setLocalLyrics(next);
    setLyricDraft(text);
    setLyricStatus(
      savedKind === 'instrumental'
        ? 'Marked instrumental on this device.'
        : savedKind === 'synced'
          ? `Saved ${parsed.lines.length} timed lines for this track.`
          : 'Saved plain lyrics for this track.',
    );
  };

  const clearSavedLyrics = (): void => {
    if (!currentTrack) return;
    const next = { ...localLyricsRef.current };
    delete next[currentTrack.id];
    try {
      localStorage.setItem('aurora.local-lyrics', JSON.stringify(next));
    } catch {
      setLyricStatus(
        'Lyrics could not be cleared from this device’s app storage. Try again later.',
      );
      return;
    }
    localLyricsRef.current = next;
    setLocalLyrics(next);
    setLyricDraft('');
    setLyricCandidates([]);
    setLyricStatus('Saved lyrics cleared from this device.');
  };

  const handleLyricsFile = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    if (file.size > 512_000) {
      setLyricStatus('Choose an LRC file smaller than 500 KB.');
      return;
    }
    try {
      const text = await file.text();
      const parsed = parseLrc(text);
      if (parsed.lines.length === 0) {
        setLyricDraft(text);
        setLyricStatus(
          'No timestamps found. Review the text, then save it as plain lyrics if that is expected.',
        );
        return;
      }
      saveLocalLyrics(text, 'synced');
      setLyricStatus(`Loaded ${parsed.lines.length} synced lines from ${file.name}.`);
    } catch {
      setLyricStatus('Aurora could not read that lyrics file.');
    }
  };

  const applyLyricsRecord = (record: LyricsRecord, sourceLabel: string): void => {
    setLyricCandidates([]);
    if (record.instrumental) {
      saveLocalLyrics('', 'instrumental');
      setLyricStatus(`${sourceLabel} · marked instrumental.`);
    } else if (record.syncedLyrics) {
      saveLocalLyrics(record.syncedLyrics, 'synced');
      setLyricStatus(`${sourceLabel} · synced lyrics saved to this device.`);
    } else if (record.plainLyrics) {
      saveLocalLyrics(record.plainLyrics, 'plain');
      setLyricStatus(`${sourceLabel} · plain lyrics saved to this device.`);
    } else {
      setLyricStatus('This result does not contain lyrics. Try another version.');
    }
  };

  const lookupLyrics = async (mode: 'get' | 'search'): Promise<void> => {
    if (!currentTrack) {
      setLyricStatus('Choose a song before searching for lyrics.');
      return;
    }
    const api = window.aurora?.lyrics;
    if (!api) {
      setLyricStatus(
        'LRCLIB search is available from the Aurora desktop app. Local LRC files still work here.',
      );
      return;
    }
    const lookup: LyricsLookup = {
      title: currentTrack.title,
      artist: currentTrack.artist,
      album: currentTrack.album,
      durationSeconds: playback.durationSeconds || currentTrack.durationSeconds,
    };
    setLyricStatus(mode === 'get' ? 'Checking for an exact match…' : 'Searching LRCLIB…');
    setLyricCandidates([]);
    try {
      const result: LyricsResult =
        mode === 'get' ? await api.get(lookup) : await api.search(lookup);
      if (result.status === 'disabled' || result.status === 'error') {
        setLyricStatus(result.message);
      } else if (result.status === 'rate-limited') {
        setLyricStatus(
          `LRCLIB asked Aurora to wait ${result.retryAfterSeconds} seconds before another request.`,
        );
      } else if (result.status === 'not-found') {
        setLyricStatus(
          mode === 'get'
            ? 'No exact match. Check the tags, then try Search LRCLIB.'
            : 'No search results. Try editing the title or artist tags in your search.',
        );
      } else if (result.status === 'ok') {
        applyLyricsRecord(result.record, 'Exact match');
      } else {
        setLyricCandidates(result.records);
        setLyricStatus(
          result.records.length
            ? `${result.records.length} matches. Choose the recording that fits.`
            : 'No search results. Try another title or artist.',
        );
      }
    } catch {
      setLyricStatus('Aurora could not reach LRCLIB. Try again later.');
    }
  };

  const saveLyricsContact = async (): Promise<void> => {
    if (!window.aurora) {
      setContactStatus('This setting is available in the Aurora desktop app.');
      return;
    }
    try {
      const saved = await window.aurora.lyrics.setContact(contactDraft);
      setContactDraft(saved ?? '');
      setContactStatus(
        saved
          ? 'Saved. LRCLIB requests are now available when you choose Search.'
          : 'LRCLIB requests are turned off.',
      );
    } catch (error) {
      setContactStatus(error instanceof Error ? error.message : 'Could not save that contact.');
    }
  };

  const disableOnlineLyrics = async (): Promise<void> => {
    setContactDraft('');
    if (!window.aurora) {
      setContactStatus('This setting is available in the Aurora desktop app.');
      return;
    }
    try {
      await window.aurora.lyrics.setContact('');
      setContactStatus('LRCLIB requests are turned off.');
    } catch {
      setContactStatus('Could not turn off online lyrics.');
    }
  };

  const changeSpeedMode = (mode: SpeedMode): void => {
    const neutralValue = mode === 'pitch' ? 0 : 1;
    setSpeedMode(mode);
    setSpeedValue(neutralValue);
    engine.setSpeed(mode, neutralValue);
  };

  const changeEffectEnabled = (effectId: EffectId, enabled: boolean): void => {
    engine.setEffectEnabled(effectId, enabled);
    setEffectSettings((current) => ({
      ...current,
      [effectId]: { ...current[effectId], enabled },
    }));
  };

  const changeEffectParameter = (effectId: EffectId, parameterId: string, value: number): void => {
    engine.setEffectParameter(effectId, parameterId, value);
    setEffectSettings((current) => ({
      ...current,
      [effectId]: {
        ...current[effectId],
        params: { ...current[effectId].params, [parameterId]: value },
      },
    }));
  };

  const changeSpeedValue = (value: number): void => {
    setSpeedValue(value);
    engine.setSpeed(speedMode, value);
  };

  const togglePlayback = async (): Promise<void> => {
    if (!engine || !currentTrack) return;
    if (playback.playing) {
      engine.pause();
      return;
    }
    try {
      if (engine.source !== currentTrack.source) await engine.load(currentTrack.source);
      await engine.play();
    } catch {
      // The engine publishes a readable playback error in its snapshot.
    }
  };

  const playNext = (): void => {
    if (!currentTrack) return;
    const index = tracks.findIndex((track) => track.id === currentTrack.id);
    const nextTrack = tracks[index + 1];
    if (nextTrack) void playTrack(nextTrack);
  };

  const playPrevious = (): void => {
    if (!currentTrack || !engine) return;
    if (playback.trackPositionSeconds > 3) {
      engine.seek(0);
      return;
    }
    const index = tracks.findIndex((track) => track.id === currentTrack.id);
    const previousTrack = tracks[index - 1];
    if (previousTrack) void playTrack(previousTrack);
    else engine.seek(0);
  };

  return (
    <div className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <header className="titlebar">
        <div className="brand drag-region" aria-label="Aurora">
          <span className="brand-mark">
            <AudioLines size={17} strokeWidth={2.1} />
          </span>
          <span>{APP_NAME}</span>
          <span className="brand-divider" />
          <span className="brand-caption">LISTEN YOUR WAY</span>
        </div>
        <label className="top-search">
          <Search size={15} />
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.currentTarget.value)}
            placeholder="Search your music"
            aria-label="Search your music"
          />
          <kbd>Ctrl K</kbd>
        </label>
        <button
          className="icon-button settings-button"
          aria-label="Settings"
          title="Settings"
          onClick={() => setSettingsOpen(true)}
        >
          <Settings2 size={17} />
        </button>
        {!window.aurora && (
          <input
            ref={fileInputRef}
            className="visually-hidden-file"
            type="file"
            accept="audio/*,.flac,.opus"
            multiple
            onChange={handleFileSelection}
            aria-label="Choose audio files"
          />
        )}
        <input
          ref={lyricsFileInputRef}
          className="visually-hidden-file"
          type="file"
          accept=".lrc,text/plain"
          onChange={handleLyricsFile}
          aria-label="Import synced lyrics file"
        />
      </header>

      <div className="workspace">
        <aside className="side-rail" aria-label="Main navigation">
          <div className="rail-section-label">YOUR SPACE</div>
          <nav className="nav-list">
            {navItems.map(({ label, icon: Icon }) => (
              <button
                className={`nav-item ${activeNav === label ? 'active' : ''}`}
                key={label}
                onClick={() => setActiveNav(label)}
                aria-current={activeNav === label ? 'page' : undefined}
              >
                <Icon size={18} strokeWidth={1.8} />
                <span>{label}</span>
                {activeNav === label && <span className="nav-active-glow" />}
              </button>
            ))}
          </nav>
          <div className="rail-bottom">
            <div className="quiet-note">
              <span className="quiet-dot" /> LOCAL FIRST
            </div>
            <div className="rail-version">v{window.aurora?.version ?? APP_VERSION}</div>
          </div>
        </aside>

        <main className="main-stage">
          {activeNav === 'Home' ? (
            <HomePage onOpenLibrary={() => setActiveNav('Library')} />
          ) : activeNav === 'Library' ? (
            <section className="library-page" aria-labelledby="library-title">
              <div className="library-page-heading">
                <div>
                  <div className="eyebrow small-eyebrow">YOUR MUSIC, ON THIS DEVICE</div>
                  <h1 id="library-title">Your library.</h1>
                  <p>Your saved library stays on this device. Audio files stay where they are.</p>
                </div>
                <button className="primary-button" onClick={chooseFiles}>
                  <Plus size={16} />
                  <span>Add music files</span>
                </button>
              </div>

              {notice && (
                <p className="library-notice" role="status">
                  {notice}
                </p>
              )}
              {playback.errorMessage && (
                <p className="library-error" role="alert">
                  {playback.errorMessage}
                </p>
              )}

              {tracks.length === 0 ? (
                <div className="library-empty">
                  <div className="empty-art">
                    <Music2 size={22} strokeWidth={1.5} />
                  </div>
                  <h2>Start with a song you love.</h2>
                  <p>Add one or more audio files from your computer. Nothing is uploaded.</p>
                  <button className="subtle-button" onClick={chooseFiles}>
                    Choose audio files <span>↗</span>
                  </button>
                </div>
              ) : visibleTracks.length === 0 ? (
                <div className="library-empty compact-empty">
                  <h2>No matching tracks.</h2>
                  <p>Try another title, artist, or filename.</p>
                </div>
              ) : (
                <div className="library-list" role="list" aria-label="Local audio tracks">
                  <div className="library-list-heading" aria-hidden="true">
                    <span>#</span>
                    <span>TRACK</span>
                    <span>ARTIST</span>
                    <span>TIME</span>
                  </div>
                  {visibleTracks.map((track) => {
                    const selected = currentTrack?.id === track.id;
                    return (
                      <div
                        className={`library-track-shell ${selected ? 'selected' : ''}`}
                        key={track.id}
                        role="listitem"
                      >
                        <button
                          className={`library-track-row ${selected ? 'selected' : ''} ${!track.available ? 'missing' : ''}`}
                          onClick={() => void playTrack(track)}
                          aria-current={selected ? 'true' : undefined}
                          aria-label={`${track.available ? 'Play' : 'Missing file'} ${track.title} by ${track.artist}`}
                          title={
                            track.available
                              ? `Play ${track.title}`
                              : 'File not found at its saved location'
                          }
                          disabled={!track.available}
                        >
                          <span className="track-row-index">
                            {selected && playback.playing ? (
                              <span className="track-playing-mark">♫</span>
                            ) : (
                              '—'
                            )}
                          </span>
                          <span className="track-row-title">
                            <span className="track-title-text">{track.title}</span>
                            <span className="track-file-name">{track.album || track.fileName}</span>
                          </span>
                          <span className="track-row-artist">{track.artist}</span>
                          <span className="track-row-duration">
                            {selected && playback.durationSeconds
                              ? formatTime(playback.durationSeconds)
                              : track.durationSeconds
                                ? formatTime(track.durationSeconds)
                                : '—'}
                          </span>
                        </button>
                        <button
                          className="track-remove-button"
                          onClick={() => void removeTrack(track)}
                          aria-label={`Remove ${track.title} from library`}
                          title="Remove from library"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          ) : activeNav === 'Lab' ? (
            <SoundLabPage
              mode={speedMode}
              value={speedValue}
              metrics={playback.dspMetrics}
              workletAvailable={playback.workletAvailable}
              effectSettings={effectSettings}
              onModeChange={changeSpeedMode}
              onValueChange={changeSpeedValue}
              onEffectToggle={changeEffectEnabled}
              onEffectParameter={changeEffectParameter}
            />
          ) : activeNav === 'Lyrics' ? (
            <LyricsPage
              track={currentTrack}
              playback={playback}
              draft={lyricDraft}
              savedKind={currentTrack ? localLyrics[currentTrack.id]?.kind : undefined}
              status={lyricStatus}
              candidates={lyricCandidates}
              lineRefs={lyricLineRefs}
              onDraftChange={setLyricDraft}
              onSave={() => saveLocalLyrics(lyricDraft)}
              onImport={() => lyricsFileInputRef.current?.click()}
              onMarkInstrumental={() => saveLocalLyrics('', 'instrumental')}
              onClear={clearSavedLyrics}
              onLookup={lookupLyrics}
              onApplyCandidate={(record) => applyLyricsRecord(record, 'Selected match')}
              onSeek={(seconds) => engine.seek(seconds)}
            />
          ) : (
            <section className="library-page future-page">
              <div className="eyebrow small-eyebrow">AURORA, IN ITS EARLY LIGHT</div>
              <h1>{activeNav}</h1>
              <p>This part of your listening space is next on the list.</p>
              <button className="primary-button" onClick={() => setActiveNav('Library')}>
                <Library size={16} />
                <span>Open your library</span>
              </button>
            </section>
          )}
        </main>

        <aside className="right-panel">
          <div className="panel-topline">
            <span>NOW PLAYING</span>
            <span className={`live-dot ${playback.playing ? 'playing' : ''}`} />
          </div>
          <div className="empty-art now-playing-art">
            {currentTrack?.artworkUrl ? (
              <img
                src={currentTrack.artworkUrl}
                alt={`${currentTrack.album || currentTrack.title} artwork`}
              />
            ) : playback.playing ? (
              <Disc3 size={23} strokeWidth={1.5} />
            ) : (
              <Music2 size={22} strokeWidth={1.5} />
            )}
          </div>
          {currentTrack ? (
            <>
              <h2 className="now-playing-title">{currentTrack.title}</h2>
              <p className="now-playing-artist">{currentTrack.artist}</p>
              <p className="now-playing-status">
                {playback.errorMessage
                  ? 'Unable to play this file'
                  : playback.playing
                    ? 'In your listening space'
                    : 'Ready when you are'}
              </p>
              {playback.errorMessage && (
                <p className="panel-error" role="alert">
                  {playback.errorMessage}
                </p>
              )}
              <button className="subtle-button" onClick={() => setActiveNav('Library')}>
                Open library <span>↗</span>
              </button>
            </>
          ) : (
            <>
              <h2>
                Nothing playing
                <br />
                just yet.
              </h2>
              <p>Your next favorite moment starts with a song you already love.</p>
              <button className="subtle-button" onClick={chooseFiles}>
                Find a song <span>↗</span>
              </button>
            </>
          )}
          <div className="panel-divider" />
          <div className="rack-heading">
            <span>YOUR SOUND</span>
            <span className="rack-spark">✦</span>
          </div>
          <div className="rack-preview">
            <div className="rack-row">
              <span className="rack-icon">
                <AudioWaveform size={15} />
              </span>
              <span>
                {speedMode === 'pitch'
                  ? 'Pitch shift'
                  : speedMode === 'varispeed'
                    ? 'Varispeed'
                    : 'Tempo'}
              </span>
              <span className="rack-value">
                {speedMode === 'pitch'
                  ? `${speedValue > 0 ? '+' : ''}${speedValue.toFixed(1)} st`
                  : `${speedValue.toFixed(2)}×`}
              </span>
            </div>
            <div className="rack-row">
              <span className="rack-icon">
                <Sparkles size={15} />
              </span>
              <span>Room &amp; echo</span>
              <span className="rack-value">
                {effectSettings.reverb.enabled || effectSettings.delay.enabled ? 'ON' : 'OFF'}
              </span>
            </div>
            <div className="rack-row">
              <span className="rack-icon">
                <Volume2 size={15} />
              </span>
              <span>Volume</span>
              <span className="rack-value">{Math.round(playback.volume * 100)}%</span>
            </div>
            <input
              className="volume-slider"
              type="range"
              min="0"
              max="100"
              value={Math.round(playback.volume * 100)}
              onChange={(event) => engine?.setVolume(Number(event.currentTarget.value) / 100)}
              aria-label="Volume"
            />
          </div>
          <div className="rack-footnote">
            <span className="lock-dot" /> {currentTrack ? 'LOCAL PLAYBACK' : 'READY WHEN YOU ARE'}
          </div>
        </aside>
      </div>

      {settingsOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSettingsOpen(false);
          }}
        >
          <section
            className="settings-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
          >
            <div className="settings-dialog-heading">
              <div>
                <div className="eyebrow small-eyebrow">YOUR APP SETTINGS</div>
                <h2 id="settings-title">Settings</h2>
              </div>
              <button
                className="icon-button"
                aria-label="Close settings"
                onClick={() => setSettingsOpen(false)}
              >
                <X size={17} />
              </button>
            </div>
            <div className="settings-section">
              <h3>Online lyrics identity</h3>
              <p>
                LRCLIB asks apps to identify themselves. Add a real project homepage or contact
                email to enable lookups. Aurora sends it only when you choose an LRCLIB action.
              </p>
              <label className="settings-field" htmlFor="lyrics-contact">
                Project homepage or contact email
                <input
                  id="lyrics-contact"
                  type="text"
                  inputMode="url"
                  autoComplete="url"
                  value={contactDraft}
                  autoFocus
                  onChange={(event) => setContactDraft(event.currentTarget.value)}
                  placeholder="https://your-project.example or you@example.com"
                />
              </label>
              <div className="settings-actions">
                <button className="primary-button" onClick={() => void saveLyricsContact()}>
                  Save identity
                </button>
                <button className="settings-text-button" onClick={() => void disableOnlineLyrics()}>
                  Turn off online lyrics
                </button>
              </div>
              {contactStatus && (
                <p className="settings-status" role="status">
                  {contactStatus}
                </p>
              )}
            </div>
            <div className="settings-section settings-local-note">
              <h3>Local library</h3>
              <p>
                Your music and saved lyrics stay on this device. Aurora does not upload audio files.
              </p>
            </div>
            <span className="settings-version">Aurora {window.aurora?.version ?? APP_VERSION}</span>
          </section>
        </div>
      )}

      <footer className="transport-bar">
        <div className="transport-track">
          <div className="transport-art">
            {currentTrack?.artworkUrl ? (
              <img src={currentTrack.artworkUrl} alt="" />
            ) : playback.playing ? (
              <Disc3 size={16} />
            ) : (
              <Music2 size={16} />
            )}
          </div>
          <div className="transport-meta">
            <strong>{currentTrack?.title ?? 'Choose something you love'}</strong>
            <span>{currentTrack?.artist ?? 'Your library is waiting'}</span>
          </div>
          <span className="transport-empty-pill">
            {currentTrack ? 'LOCAL FILE' : 'NO TRACK SELECTED'}
          </span>
        </div>
        <div className="transport-controls">
          <button
            className="transport-small"
            aria-label="Previous track"
            disabled={!currentTrack}
            onClick={playPrevious}
          >
            ‹
          </button>
          <button
            className="transport-play"
            aria-label={playback.playing ? 'Pause' : 'Play'}
            disabled={!currentTrack}
            onClick={() => void togglePlayback()}
          >
            {playback.playing ? (
              <Pause size={16} fill="currentColor" />
            ) : (
              <Play size={17} fill="currentColor" />
            )}
          </button>
          <button
            className="transport-small next"
            aria-label="Next track"
            disabled={
              !currentTrack ||
              tracks.findIndex((track) => track.id === currentTrack.id) >= tracks.length - 1
            }
            onClick={playNext}
          >
            ›
          </button>
        </div>
        <div className="transport-right">
          <span>{formatTime(playback.trackPositionSeconds)}</span>
          <input
            className="progress-slider"
            type="range"
            min="0"
            max={Math.max(1, playback.durationSeconds)}
            step="0.1"
            value={Math.min(playback.trackPositionSeconds, playback.durationSeconds || 0)}
            disabled={!currentTrack || playback.durationSeconds === 0}
            onChange={(event) => engine?.seek(Number(event.currentTarget.value))}
            aria-label="Seek position"
          />
          <span>{formatTime(playback.durationSeconds)}</span>
          <button
            className="icon-button"
            aria-label="Open queue"
            title="Open library"
            onClick={() => setActiveNav('Library')}
          >
            <ListMusic size={16} />
          </button>
        </div>
      </footer>
    </div>
  );
}

function LyricsPage({
  track,
  playback,
  draft,
  savedKind,
  status,
  candidates,
  lineRefs,
  onDraftChange,
  onSave,
  onImport,
  onMarkInstrumental,
  onClear,
  onLookup,
  onApplyCandidate,
  onSeek,
}: {
  track: LocalTrack | null;
  playback: PlaybackSnapshot;
  draft: string;
  savedKind: SavedLyricsKind | undefined;
  status: string;
  candidates: LyricsRecord[];
  lineRefs: { current: Array<HTMLButtonElement | null> };
  onDraftChange: (value: string) => void;
  onSave: () => void;
  onImport: () => void;
  onMarkInstrumental: () => void;
  onClear: () => void;
  onLookup: (mode: 'get' | 'search') => Promise<void>;
  onApplyCandidate: (record: LyricsRecord) => void;
  onSeek: (seconds: number) => void;
}) {
  const parsed = useMemo(() => parseLrc(draft), [draft]);
  const activeIndex = activeLyricIndex(
    parsed.lines,
    playback.trackPositionSeconds * 1000 - parsed.offsetMs,
  );
  const hasSyncedLyrics = parsed.lines.length > 0;
  const plainLines = draft
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  useEffect(() => {
    if (activeIndex >= 0) {
      lineRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [activeIndex, lineRefs]);

  return (
    <section className="lyrics-page" aria-labelledby="lyrics-title">
      <div className="lyrics-page-heading">
        <div>
          <div className="eyebrow small-eyebrow">WORDS IN YOUR OWN TIME</div>
          <h1 id="lyrics-title">Lyrics.</h1>
          <p>Keep lyrics on this device, sync an LRC file, or look up a match when you choose.</p>
        </div>
        {track && (
          <div className="lyrics-track-pill" title={`${track.title} · ${track.artist}`}>
            <Music2 size={15} />
            <span>
              <strong>{track.title}</strong>
              <small>{track.artist}</small>
            </span>
          </div>
        )}
      </div>

      {!track ? (
        <div className="lyrics-empty">
          <div className="empty-art">
            <FileText size={22} strokeWidth={1.5} />
          </div>
          <h2>Choose a song first.</h2>
          <p>Lyrics are saved with a track in your local library.</p>
        </div>
      ) : (
        <div className="lyrics-layout">
          <div className="lyrics-editor-card">
            <div className="lyrics-card-heading">
              <div>
                <h2>Add or find lyrics</h2>
                <p>Paste text, import a timed .lrc file, or request a lookup.</p>
              </div>
              <button className="secondary-button" onClick={onImport}>
                <FileText size={14} /> Import .lrc
              </button>
            </div>
            <textarea
              className="lyrics-textarea"
              value={draft}
              onChange={(event) => onDraftChange(event.currentTarget.value)}
              maxLength={512_000}
              placeholder={
                'Paste lyrics here…\n\nTimed lines like [00:12.50] appear in sync with playback.'
              }
              aria-label="Lyrics text or LRC timestamps"
              spellCheck={false}
            />
            <div className="lyrics-editor-actions">
              <button className="primary-button" onClick={onSave}>
                Save on this device
              </button>
              <button className="secondary-button" onClick={() => void onLookup('get')}>
                Exact match
              </button>
              <button className="secondary-button" onClick={() => void onLookup('search')}>
                Search LRCLIB
              </button>
              <button className="settings-text-button" onClick={onMarkInstrumental}>
                Mark instrumental
              </button>
            </div>
            <p className="lyrics-status" role="status">
              {status}
            </p>
            {candidates.length > 0 && (
              <div className="lyrics-candidates" aria-label="Lyrics search results">
                {candidates.map((record, index) => (
                  <button
                    className="lyrics-candidate"
                    key={`${record.id ?? 'result'}-${index}`}
                    onClick={() => onApplyCandidate(record)}
                  >
                    <span>
                      <strong>{record.trackName}</strong>
                      <small>
                        {record.artistName}
                        {record.albumName ? ` · ${record.albumName}` : ''}
                      </small>
                    </span>
                    <span className="candidate-kind">
                      {record.instrumental
                        ? 'Instrumental'
                        : record.syncedLyrics
                          ? 'Synced'
                          : record.plainLyrics
                            ? 'Plain'
                            : 'No lyrics'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="lyrics-view-card" aria-label="Lyrics playback view">
            <div className="lyrics-card-heading lyrics-view-heading">
              <div>
                <h2>
                  {hasSyncedLyrics
                    ? 'Follow along'
                    : savedKind === 'instrumental'
                      ? 'Instrumental'
                      : 'On this track'}
                </h2>
                <p>
                  {hasSyncedLyrics
                    ? `${parsed.lines.length} timed lines · click a line to seek`
                    : 'Your saved lyrics appear here.'}
                </p>
              </div>
              {savedKind && (
                <button className="settings-text-button" onClick={onClear}>
                  Clear
                </button>
              )}
            </div>
            <div className="lyrics-lines" aria-live="off">
              {savedKind === 'instrumental' && !draft.trim() ? (
                <div className="lyrics-view-empty">This track is marked as instrumental.</div>
              ) : hasSyncedLyrics ? (
                parsed.lines.map((line, index) => (
                  <button
                    className={`lyric-line ${index === activeIndex ? 'active' : ''}`}
                    key={`${line.timeMs}-${index}`}
                    ref={(element) => {
                      lineRefs.current[index] = element;
                    }}
                    onClick={() => onSeek(Math.max(0, (line.timeMs + parsed.offsetMs) / 1000))}
                    aria-current={index === activeIndex ? 'true' : undefined}
                    aria-label={`Seek to ${formatTime((line.timeMs + parsed.offsetMs) / 1000)}: ${line.text || 'instrumental'}`}
                  >
                    <span className="lyric-timestamp">
                      {formatTime((line.timeMs + parsed.offsetMs) / 1000)}
                    </span>
                    <span>{line.text || '♪'}</span>
                  </button>
                ))
              ) : plainLines.length > 0 ? (
                plainLines.map((line, index) => (
                  <p className="plain-lyric-line" key={`${index}-${line}`}>
                    {line}
                  </p>
                ))
              ) : (
                <div className="lyrics-view-empty">Synced and plain lyrics will appear here.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function SoundLabPage({
  mode,
  value,
  metrics,
  workletAvailable,
  effectSettings,
  onModeChange,
  onValueChange,
  onEffectToggle,
  onEffectParameter,
}: {
  mode: SpeedMode;
  value: number;
  metrics: PlaybackSnapshot['dspMetrics'];
  workletAvailable: boolean | null;
  effectSettings: EffectSettings;
  onModeChange: (mode: SpeedMode) => void;
  onValueChange: (value: number) => void;
  onEffectToggle: (effectId: EffectId, enabled: boolean) => void;
  onEffectParameter: (effectId: EffectId, parameterId: string, value: number) => void;
}) {
  const [expandedEffect, setExpandedEffect] = useState<EffectId | null>('eq');
  const controls: Record<
    SpeedMode,
    { label: string; description: string; min: number; max: number; step: number }
  > = {
    tempo: {
      label: 'Tempo',
      description: 'Change the pace while keeping the musical pitch steady.',
      min: 0.5,
      max: 2,
      step: 0.01,
    },
    pitch: {
      label: 'Pitch',
      description: 'Move the musical key without changing the pace.',
      min: -12,
      max: 12,
      step: 0.1,
    },
    varispeed: {
      label: 'Varispeed',
      description: 'Change pace and pitch together, like a record changing speed.',
      min: 0.5,
      max: 2,
      step: 0.01,
    },
  };
  const activeControl = controls[mode];
  const valueLabel =
    mode === 'pitch' ? `${value > 0 ? '+' : ''}${value.toFixed(1)} st` : `${value.toFixed(2)}×`;

  return (
    <section className="sound-lab-page" aria-labelledby="sound-lab-title">
      <div className="eyebrow small-eyebrow">A LITTLE ROOM TO EXPERIMENT</div>
      <h1 id="sound-lab-title">Shape the sound.</h1>
      <p className="sound-lab-intro">
        Adjust the music as it plays. The player clock stays tied to the original track for seeking
        and lyrics.
      </p>
      <div className="sound-lab-card">
        <div className="sound-lab-heading">
          <span className="sound-lab-icon">
            <AudioWaveform size={18} />
          </span>
          <div>
            <h2>Speed &amp; pitch</h2>
            <p>One control at a time, always easy to reset.</p>
          </div>
          <span className="sound-lab-readout">{valueLabel}</span>
        </div>
        <div className="sound-lab-modes" role="group" aria-label="Speed effect mode">
          {(Object.keys(controls) as SpeedMode[]).map((entry) => (
            <button
              className={mode === entry ? 'active' : ''}
              key={entry}
              type="button"
              aria-pressed={mode === entry}
              disabled={workletAvailable === false && entry !== 'varispeed'}
              onClick={() => onModeChange(entry)}
            >
              {controls[entry].label}
            </button>
          ))}
        </div>
        <div className="sound-lab-slider-heading">
          <label htmlFor="sound-lab-control">{activeControl.label}</label>
          <span>{activeControl.description}</span>
        </div>
        <div className="sound-lab-slider-row">
          <span>{mode === 'pitch' ? '−12 st' : '0.50×'}</span>
          <input
            id="sound-lab-control"
            type="range"
            min={activeControl.min}
            max={activeControl.max}
            step={activeControl.step}
            value={value}
            disabled={workletAvailable === false && mode !== 'varispeed'}
            onChange={(event) => onValueChange(Number(event.currentTarget.value))}
            aria-valuetext={valueLabel}
          />
          <span>{mode === 'pitch' ? '+12 st' : '2.00×'}</span>
        </div>
        <button
          className="sound-lab-reset"
          type="button"
          onClick={() => onValueChange(mode === 'pitch' ? 0 : 1)}
        >
          Reset {activeControl.label.toLowerCase()}
        </button>
      </div>
      <div className="effect-rack-heading">
        <div>
          <div className="eyebrow small-eyebrow">YOUR LISTENING CHAIN</div>
          <h2>Make it yours.</h2>
        </div>
        <span>{effectDefinitions.filter((effect) => effect.bypassable).length} live effects</span>
      </div>
      <div className="effect-rack-list">
        {effectDefinitions
          .filter((effect) => effect.id !== 'speed')
          .map((effect) => (
            <EffectControlCard
              key={effect.id}
              effectId={effect.id}
              label={effect.label}
              description={effect.description}
              bypassable={effect.bypassable}
              state={effectSettings[effect.id]}
              parameters={effect.params}
              expanded={expandedEffect === effect.id}
              onExpand={() =>
                setExpandedEffect((current) => (current === effect.id ? null : effect.id))
              }
              onToggle={(enabled) => onEffectToggle(effect.id, enabled)}
              onParameter={(parameterId, nextValue) =>
                onEffectParameter(effect.id, parameterId, nextValue)
              }
            />
          ))}
      </div>
      <p className="sound-lab-metrics" role="status">
        {workletAvailable === false
          ? 'The time-stretch worklet is unavailable. Regular playback still works; tempo and pitch controls need AudioWorklet support.'
          : metrics
            ? `Audio worklet: ${metrics.underrunCount} underruns across ${metrics.blockCount.toLocaleString()} render blocks.`
            : 'Audio worklet status appears after playback starts.'}
      </p>
    </section>
  );
}

function EffectControlCard({
  effectId,
  label,
  description,
  bypassable,
  state,
  parameters,
  expanded,
  onExpand,
  onToggle,
  onParameter,
}: {
  effectId: EffectId;
  label: string;
  description: string;
  bypassable: boolean;
  state: EffectSettings[EffectId];
  parameters: (typeof effectDefinitions)[number]['params'];
  expanded: boolean;
  onExpand: () => void;
  onToggle: (enabled: boolean) => void;
  onParameter: (parameterId: string, value: number) => void;
}) {
  return (
    <article className={`effect-control-card ${state.enabled ? 'enabled' : ''}`}>
      <div className="effect-control-heading">
        <button
          className="effect-control-expand"
          type="button"
          aria-expanded={expanded}
          onClick={onExpand}
        >
          <ChevronDown size={15} className={expanded ? 'expanded' : ''} />
          <span>
            <strong>{label}</strong>
            <small>{description}</small>
          </span>
        </button>
        {bypassable ? (
          <button
            className={`effect-power ${state.enabled ? 'on' : ''}`}
            type="button"
            role="switch"
            aria-checked={state.enabled}
            aria-label={`${label} ${state.enabled ? 'on' : 'off'}`}
            onClick={() => onToggle(!state.enabled)}
          >
            {state.enabled ? 'On' : 'Off'}
          </button>
        ) : (
          <span className="effect-fixed-state">ALWAYS ON</span>
        )}
      </div>
      {expanded && (
        <div className="effect-control-parameters">
          {parameters.map((parameter) => {
            const currentValue = state.params[parameter.id] ?? parameter.default;
            const valueText = formatEffectValue(
              effectId,
              parameter.id,
              currentValue,
              parameter.unit,
            );
            return (
              <div className="effect-parameter" key={parameter.id}>
                <div className="effect-parameter-heading">
                  <label htmlFor={parameter.id}>{parameter.label}</label>
                  <span>{valueText}</span>
                </div>
                <input
                  id={parameter.id}
                  type="range"
                  min={parameter.min}
                  max={parameter.max}
                  step={parameter.step ?? 0.01}
                  value={currentValue}
                  onChange={(event) => onParameter(parameter.id, Number(event.currentTarget.value))}
                  aria-valuetext={valueText}
                />
                <p>{parameter.description}</p>
              </div>
            );
          })}
        </div>
      )}
    </article>
  );
}

function formatEffectValue(
  effectId: EffectId,
  parameterId: string,
  value: number,
  unit?: string,
): string {
  if (effectId === 'spatial8d' && parameterId === 'spatial8d.shape') {
    return value < 0.5 ? 'Circle' : 'Figure eight';
  }
  if (unit === 'dB') return `${value > 0 ? '+' : ''}${value.toFixed(1)} dB`;
  if (unit === 'Hz')
    return value >= 1000 ? `${(value / 1000).toFixed(1)} kHz` : `${Math.round(value)} Hz`;
  if (unit === 'ms') return `${Math.round(value)} ms`;
  if (unit === 's') return `${value.toFixed(1)} s`;
  if (unit === '%') return `${Math.round(value)}%`;
  if (unit === 'bits') return `${Math.round(value)} bits`;
  if (unit === 'st') return `${value > 0 ? '+' : ''}${value.toFixed(1)} st`;
  if (unit === 'x') return `${value.toFixed(2)}×`;
  return value.toFixed(2);
}

function HomePage({ onOpenLibrary }: { onOpenLibrary: () => void }) {
  return (
    <>
      <section className="welcome-grid">
        <div className="welcome-copy">
          <div className="eyebrow">
            <span className="eyebrow-sparkle">✦</span> YOUR MUSIC, REIMAGINED
          </div>
          <h1>
            A little space
            <br />
            for <span>your sound.</span>
          </h1>
          <p className="welcome-description">
            Your own music, with room to play. Slow it down, find a new feeling, and let every
            detail sound like you.
          </p>
          <div className="welcome-actions">
            <button className="primary-button" onClick={onOpenLibrary}>
              <Library size={16} />
              <span>Explore your library</span>
            </button>
            <span className="coming-soon">Your listening space is taking shape</span>
          </div>
          <div className="welcome-footnote">
            <span className="footnote-line" />
            <span>MADE FOR THE WAY YOU LISTEN</span>
          </div>
        </div>

        <div className="art-stage" aria-label="Abstract album artwork illustration">
          <div className="art-halo halo-outer" />
          <div className="art-halo halo-inner" />
          <div className="art-card">
            <div className="art-grain" />
            <div className="art-sun" />
            <div className="art-orbit orbit-one" />
            <div className="art-orbit orbit-two" />
            <div className="art-wave wave-one" />
            <div className="art-wave wave-two" />
            <div className="art-wave wave-three" />
            <div className="art-stamp">A / 01</div>
            <div className="art-title">
              SLOW
              <br />
              <em>HOURS</em>
            </div>
            <div className="art-subtitle">A ROOM OF YOUR OWN</div>
          </div>
          <div className="floating-note note-left">
            <Disc3 size={15} />
            <span>IN YOUR OWN KEY</span>
          </div>
          <div className="floating-note note-right">
            <span className="pulse-bars">
              <i />
              <i />
              <i />
              <i />
              <i />
            </span>
            <span>MADE TO MOVE</span>
          </div>
          <div className="art-caption">
            <span>001</span> / AURORA STUDIES
          </div>
        </div>
      </section>

      <section className="next-section">
        <div className="section-heading">
          <div>
            <div className="eyebrow small-eyebrow">A FEW WAYS TO BEGIN</div>
            <h2>Make room for more.</h2>
          </div>
          <span className="section-index">
            01 <span>/</span> 03
          </span>
        </div>
        <div className="feature-grid">
          {featureCards.map(({ title, detail, icon: Icon, tone }, index) => (
            <article className={`feature-card ${tone}`} key={title}>
              <div className="feature-topline">
                <span className="feature-icon">
                  <Icon size={17} strokeWidth={1.8} />
                </span>
                <span className="feature-number">0{index + 1}</span>
              </div>
              <div className="feature-copy">
                <h3>{title}</h3>
                <p>{detail}</p>
              </div>
              <div className="feature-arrow">↗</div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
