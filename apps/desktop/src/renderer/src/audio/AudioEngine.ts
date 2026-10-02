import { SoundTouchNode } from '@soundtouchjs/audio-worklet';
import processorUrl from '@soundtouchjs/audio-worklet/processor?url';
import {
  clampParameter,
  createDefaultEffectSettings,
  effectDefinitions,
  findEffect,
  type EffectId,
  type EffectSettings,
} from '@aurora/schema/effects';
import bitcrusherProcessorUrl from './worklets/bitcrusher-processor.js?url&no-inline';

export type SpeedMode = 'tempo' | 'pitch' | 'varispeed';

export interface PlaybackSnapshot {
  trackPositionSeconds: number;
  durationSeconds: number;
  playing: boolean;
  volume: number;
  errorMessage: string | null;
  dspMetrics: { underrunCount: number; blockCount: number } | null;
  workletAvailable: boolean | null;
}

export interface AudioEngine {
  readonly snapshot: PlaybackSnapshot;
  readonly source: string;
  load(source: string): Promise<void>;
  play(): Promise<void>;
  pause(): void;
  seek(positionSeconds: number): void;
  setVolume(level: number): void;
  setSpeed(mode: SpeedMode, value: number): void;
  subscribe(listener: (snapshot: PlaybackSnapshot) => void): () => void;
  dispose(): void;
}

/** One HTML media clock feeds the worklet, transport UI, seeking, and lyrics. */
export class HTMLAudioEngine implements AudioEngine {
  private readonly listeners = new Set<(snapshot: PlaybackSnapshot) => void>();
  private audio: HTMLAudioElement | null = null;
  private sourceUrl = '';
  private volume = 0.8;
  private errorMessage: string | null = null;
  private speedMode: SpeedMode = 'tempo';
  private speedValue = 1;
  private audioContext: AudioContext | null = null;
  private mediaSource: MediaElementAudioSourceNode | null = null;
  private masterGain: GainNode | null = null;
  private processor: SoundTouchNode | null = null;
  private equalizer: BiquadFilterNode[] = [];
  private bassFilter: BiquadFilterNode | null = null;
  private dynamics: DynamicsCompressorNode | null = null;
  private bitcrusher: AudioWorkletNode | null = null;
  private delay: DelayNode | null = null;
  private delayFeedback: GainNode | null = null;
  private delayDry: GainNode | null = null;
  private delayWet: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private reverbDry: GainNode | null = null;
  private reverbWet: GainNode | null = null;
  private spatialPanner: PannerNode | null = null;
  private spatialDry: GainNode | null = null;
  private spatialWet: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private effectSettings: EffectSettings = createDefaultEffectSettings();
  private reverbRoomSeconds = 0;
  private spatialFrameId: number | null = null;
  private dspMetrics: PlaybackSnapshot['dspMetrics'] = null;
  private workletAvailable: boolean | null = null;
  private graphReady = false;
  private readonly mediaEvents = [
    'timeupdate',
    'durationchange',
    'loadedmetadata',
    'play',
    'pause',
    'ended',
    'volumechange',
    'error',
  ] as const;
  private readonly handleMediaEvent = (event: Event): void => {
    if (event.type === 'error') {
      this.errorMessage = 'This file could not be played. Try another audio format.';
    }
    if (event.type === 'play') this.startSpatialAnimation();
    if (event.type === 'pause' || event.type === 'ended') this.stopSpatialAnimation();
    this.publish();
  };

  get source(): string {
    return this.sourceUrl;
  }

  get snapshot(): PlaybackSnapshot {
    const audio = this.audio;
    return {
      trackPositionSeconds: audio && Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
      durationSeconds: audio && Number.isFinite(audio.duration) ? audio.duration : 0,
      playing: Boolean(audio && !audio.paused && !audio.ended),
      volume: this.volume,
      errorMessage: this.errorMessage,
      dspMetrics: this.dspMetrics,
      workletAvailable: this.workletAvailable,
    };
  }

  async load(source: string): Promise<void> {
    if (this.sourceUrl === source && this.audio) return;
    const audio = this.getAudio();
    audio.pause();
    this.errorMessage = null;
    this.sourceUrl = source;
    audio.src = source;
    audio.load();
    this.publish();
  }

  async play(): Promise<void> {
    try {
      await this.ensureAudioGraph();
      await this.getAudio().play();
      this.errorMessage = null;
      this.publish();
    } catch (error) {
      this.errorMessage =
        error instanceof Error ? error.message : 'Playback could not start for this file.';
      this.publish();
      throw error;
    }
  }

  pause(): void {
    this.audio?.pause();
  }

  seek(positionSeconds: number): void {
    const audio = this.audio;
    if (!audio) return;
    const target = Math.max(0, Number.isFinite(positionSeconds) ? positionSeconds : 0);
    audio.currentTime = Number.isFinite(audio.duration) ? Math.min(target, audio.duration) : target;
    this.publish();
  }

  setVolume(level: number): void {
    this.volume = Math.min(1, Math.max(0, level));
    if (this.masterGain && this.audioContext) {
      this.ramp(this.masterGain.gain, this.volume);
    } else if (this.audio) {
      this.audio.volume = this.volume;
    }
    this.publish();
  }

  setSpeed(mode: SpeedMode, value: number): void {
    const maximum = mode === 'pitch' ? 12 : 2;
    const minimum = mode === 'pitch' ? -12 : 0.5;
    this.speedMode = mode;
    this.speedValue = Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : 1));
    const speedState = this.effectSettings.speed.params;
    speedState['speed.tempo'] = mode === 'tempo' ? this.speedValue : 1;
    speedState['speed.pitch'] = mode === 'pitch' ? this.speedValue : 0;
    speedState['speed.rate'] = mode === 'varispeed' ? this.speedValue : 1;
    this.applySpeed();
  }

  setEffectEnabled(effectId: EffectId, enabled: boolean): void {
    const definition = findEffect(effectId);
    if (!definition.bypassable) return;
    this.effectSettings[effectId].enabled = enabled;
    this.applyEffect(effectId);
  }

  setEffectParameter(effectId: EffectId, parameterId: string, value: number): void {
    const definition = findEffect(effectId);
    const parameter = definition.params.find((candidate) => candidate.id === parameterId);
    if (!parameter) throw new Error(`Unknown ${definition.label} parameter: ${parameterId}`);
    this.effectSettings[effectId].params[parameterId] = clampParameter(parameter, value);
    this.applyEffect(effectId);
  }

  subscribe(listener: (snapshot: PlaybackSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    if (!this.audio) {
      this.listeners.clear();
      return;
    }
    for (const event of this.mediaEvents) {
      this.audio.removeEventListener(event, this.handleMediaEvent);
    }
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    this.audio = null;
    this.mediaSource?.disconnect();
    this.processor?.disconnect();
    this.masterGain?.disconnect();
    this.equalizer.forEach((filter) => filter.disconnect());
    this.bassFilter?.disconnect();
    this.dynamics?.disconnect();
    this.bitcrusher?.disconnect();
    this.delay?.disconnect();
    this.delayFeedback?.disconnect();
    this.delayDry?.disconnect();
    this.delayWet?.disconnect();
    this.reverb?.disconnect();
    this.reverbDry?.disconnect();
    this.reverbWet?.disconnect();
    this.spatialPanner?.disconnect();
    this.spatialDry?.disconnect();
    this.spatialWet?.disconnect();
    this.limiter?.disconnect();
    this.stopSpatialAnimation();
    if (this.audioContext && this.audioContext.state !== 'closed') {
      void this.audioContext.close();
    }
    this.audioContext = null;
    this.mediaSource = null;
    this.processor = null;
    this.masterGain = null;
    this.equalizer = [];
    this.bassFilter = null;
    this.dynamics = null;
    this.bitcrusher = null;
    this.delay = null;
    this.delayFeedback = null;
    this.delayDry = null;
    this.delayWet = null;
    this.reverb = null;
    this.reverbDry = null;
    this.reverbWet = null;
    this.spatialPanner = null;
    this.spatialDry = null;
    this.spatialWet = null;
    this.limiter = null;
    this.graphReady = false;
    this.sourceUrl = '';
    this.listeners.clear();
  }

  private getAudio(): HTMLAudioElement {
    if (!this.audio) {
      this.audio = new Audio();
      this.audio.crossOrigin = 'anonymous';
      this.audio.preload = 'metadata';
      this.audio.volume = this.volume;
      for (const event of this.mediaEvents) {
        this.audio.addEventListener(event, this.handleMediaEvent);
      }
    }
    return this.audio;
  }

  private async ensureAudioGraph(): Promise<void> {
    if (this.graphReady) {
      if (this.audioContext?.state === 'suspended') await this.audioContext.resume();
      return;
    }
    const AudioContextClass = window.AudioContext;
    if (!AudioContextClass || !this.audio) {
      this.workletAvailable = false;
      this.graphReady = true;
      this.publish();
      return;
    }

    let context: AudioContext;
    try {
      context = new AudioContextClass({ latencyHint: 'playback' });
    } catch {
      this.workletAvailable = false;
      this.graphReady = true;
      this.publish();
      return;
    }
    const resume = context.resume().catch(() => undefined);
    let mediaSource: MediaElementAudioSourceNode;
    try {
      mediaSource = context.createMediaElementSource(this.audio);
    } catch {
      await context.close();
      this.workletAvailable = false;
      this.graphReady = true;
      this.publish();
      return;
    }

    let processor: SoundTouchNode | null = null;
    try {
      await SoundTouchNode.register(context, processorUrl);
      processor = new SoundTouchNode({ context });
      processor.addEventListener('metrics', (event) => {
        const metrics = (event as CustomEvent<{ underrunCount: number; blockCount: number }>)
          .detail;
        this.dspMetrics = {
          underrunCount: metrics.underrunCount,
          blockCount: metrics.blockCount,
        };
        this.publish();
      });
    } catch {
      processor?.disconnect();
      processor = null;
    }

    let bitcrusher: AudioWorkletNode | null = null;
    try {
      await context.audioWorklet.addModule(bitcrusherProcessorUrl);
      bitcrusher = new AudioWorkletNode(context, 'aurora-bitcrusher');
    } catch {
      bitcrusher = null;
    }

    const equalizer = [60, 170, 310, 600, 1000, 3000, 6000, 12000].map((frequency) => {
      const filter = context.createBiquadFilter();
      filter.type = 'peaking';
      filter.frequency.value = frequency;
      filter.Q.value = 1;
      return filter;
    });
    const bassFilter = context.createBiquadFilter();
    bassFilter.type = 'lowshelf';
    bassFilter.frequency.value = 110;
    const dynamics = context.createDynamicsCompressor();
    const delay = context.createDelay(1);
    const delayFeedback = context.createGain();
    const delayDry = context.createGain();
    const delayWet = context.createGain();
    const delayOutput = context.createGain();
    delay.connect(delayWet);
    delayWet.connect(delayOutput);
    delay.connect(delayFeedback);
    delayFeedback.connect(delay);
    const reverb = context.createConvolver();
    const reverbDry = context.createGain();
    const reverbWet = context.createGain();
    const reverbOutput = context.createGain();
    reverb.connect(reverbWet);
    reverbWet.connect(reverbOutput);
    const spatialPanner = context.createPanner();
    spatialPanner.panningModel = 'HRTF';
    spatialPanner.distanceModel = 'inverse';
    spatialPanner.refDistance = 1;
    spatialPanner.maxDistance = 1;
    spatialPanner.rolloffFactor = 0;
    const spatialDry = context.createGain();
    const spatialWet = context.createGain();
    const spatialOutput = context.createGain();
    spatialPanner.connect(spatialWet);
    spatialWet.connect(spatialOutput);
    const masterGain = context.createGain();
    masterGain.gain.value = this.volume;
    const limiter = context.createDynamicsCompressor();
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.08;

    let current: AudioNode = mediaSource;
    if (processor) {
      current.connect(processor);
      current = processor;
    }
    for (const filter of equalizer) {
      current.connect(filter);
      current = filter;
    }
    current.connect(bassFilter);
    current = bassFilter;
    current.connect(dynamics);
    current = dynamics;
    if (bitcrusher) {
      current.connect(bitcrusher);
      current = bitcrusher;
    }
    current.connect(delayDry);
    delayDry.connect(delayOutput);
    current.connect(delay);
    current = delayOutput;
    current.connect(reverbDry);
    reverbDry.connect(reverbOutput);
    current.connect(reverb);
    current = reverbOutput;
    current.connect(spatialDry);
    spatialDry.connect(spatialOutput);
    current.connect(spatialPanner);
    current = spatialOutput;
    current.connect(masterGain);
    masterGain.connect(limiter);
    limiter.connect(context.destination);

    this.audio.volume = 1;
    this.audioContext = context;
    this.mediaSource = mediaSource;
    this.masterGain = masterGain;
    this.processor = processor;
    this.workletAvailable = processor !== null;
    this.equalizer = equalizer;
    this.bassFilter = bassFilter;
    this.dynamics = dynamics;
    this.bitcrusher = bitcrusher;
    this.delay = delay;
    this.delayFeedback = delayFeedback;
    this.delayDry = delayDry;
    this.delayWet = delayWet;
    this.reverb = reverb;
    this.reverbDry = reverbDry;
    this.reverbWet = reverbWet;
    this.spatialPanner = spatialPanner;
    this.spatialDry = spatialDry;
    this.spatialWet = spatialWet;
    this.limiter = limiter;
    this.graphReady = true;
    this.applyAllEffects();
    await resume;
    this.applySpeed();
    this.publish();
  }

  private applySpeed(): void {
    const playbackRate =
      this.speedMode === 'pitch' ||
      (this.workletAvailable === false && this.speedMode !== 'varispeed')
        ? 1
        : this.speedValue;
    if (this.audio) this.audio.playbackRate = playbackRate;
    if (!this.processor || !this.audioContext) return;
    this.ramp(this.processor.playbackRate, playbackRate);
    this.ramp(this.processor.pitch, this.speedMode === 'varispeed' ? this.speedValue : 1);
    this.ramp(this.processor.pitchSemitones, this.speedMode === 'pitch' ? this.speedValue : 0);
  }

  private ramp(parameter: AudioParam, value: number): void {
    if (!this.audioContext) return;
    const now = this.audioContext.currentTime;
    parameter.cancelScheduledValues(now);
    parameter.setTargetAtTime(value, now, 0.02);
  }

  private applyAllEffects(): void {
    for (const definition of effectDefinitions) this.applyEffect(definition.id);
  }

  private applyEffect(effectId: EffectId): void {
    const state = this.effectSettings[effectId];
    const enabled = state.enabled;
    const context = this.audioContext;
    if (!context) return;
    const smooth = (parameter: AudioParam, value: number): void => {
      const now = context.currentTime;
      parameter.cancelScheduledValues(now);
      parameter.setTargetAtTime(value, now, 0.025);
    };

    if (effectId === 'eq') {
      this.equalizer.forEach((filter, index) => {
        const definition = findEffect('eq').params[index];
        smooth(filter.gain, enabled ? (state.params[definition.id] ?? 0) : 0);
      });
    } else if (effectId === 'bass' && this.bassFilter) {
      smooth(this.bassFilter.gain, enabled ? (state.params['bass.gain'] ?? 0) : 0);
    } else if (effectId === 'dynamics' && this.dynamics) {
      smooth(this.dynamics.threshold, enabled ? (state.params['dynamics.threshold'] ?? -24) : 0);
      smooth(this.dynamics.ratio, enabled ? (state.params['dynamics.ratio'] ?? 2) : 1);
      smooth(
        this.dynamics.attack,
        enabled ? (state.params['dynamics.attack'] ?? 10) / 1000 : 0.003,
      );
      smooth(
        this.dynamics.release,
        enabled ? (state.params['dynamics.release'] ?? 180) / 1000 : 0.25,
      );
      this.dynamics.knee.value = enabled ? 6 : 0;
    } else if (effectId === 'bitcrusher') {
      const parameters = this.bitcrusher?.parameters;
      const bitDepth = enabled ? (state.params['bitcrusher.bits'] ?? 12) : 16;
      const rate = enabled ? (state.params['bitcrusher.rate'] ?? 100) / 100 : 1;
      if (parameters?.get('bits')) smooth(parameters.get('bits')!, bitDepth);
      if (parameters?.get('rate')) smooth(parameters.get('rate')!, rate);
    } else if (effectId === 'delay') {
      const mix = enabled ? (state.params['delay.mix'] ?? 24) / 100 : 0;
      if (this.delay) smooth(this.delay.delayTime, (state.params['delay.time'] ?? 320) / 1000);
      if (this.delayFeedback)
        smooth(this.delayFeedback.gain, enabled ? (state.params['delay.feedback'] ?? 35) / 100 : 0);
      if (this.delayDry) smooth(this.delayDry.gain, Math.sqrt(1 - mix));
      if (this.delayWet) smooth(this.delayWet.gain, Math.sqrt(mix));
    } else if (effectId === 'reverb') {
      const mix = enabled ? (state.params['reverb.mix'] ?? 22) / 100 : 0;
      const roomSeconds = state.params['reverb.room'] ?? 1.4;
      if (this.reverb && roomSeconds !== this.reverbRoomSeconds) {
        this.reverb.buffer = this.createImpulseResponse(roomSeconds);
        this.reverbRoomSeconds = roomSeconds;
      }
      if (this.reverbDry) smooth(this.reverbDry.gain, Math.sqrt(1 - mix));
      if (this.reverbWet) smooth(this.reverbWet.gain, Math.sqrt(mix));
    } else if (effectId === 'spatial8d') {
      const mix = enabled ? (state.params['spatial8d.mix'] ?? 100) / 100 : 0;
      if (this.spatialDry) smooth(this.spatialDry.gain, Math.sqrt(1 - mix));
      if (this.spatialWet) smooth(this.spatialWet.gain, Math.sqrt(mix));
      this.updateSpatialPosition();
      if (enabled && this.snapshot.playing) this.startSpatialAnimation();
      else this.stopSpatialAnimation();
    } else if (effectId === 'master' && this.limiter) {
      smooth(this.limiter.threshold, state.params['master.ceiling'] ?? -1);
    }
  }

  private createImpulseResponse(roomSeconds: number): AudioBuffer | null {
    if (!this.audioContext) return null;
    const context = this.audioContext;
    const frameCount = Math.max(1, Math.floor(context.sampleRate * roomSeconds));
    const impulse = context.createBuffer(2, frameCount, context.sampleRate);
    for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
      const samples = impulse.getChannelData(channel);
      for (let frame = 0; frame < samples.length; frame += 1) {
        const fade = (1 - frame / samples.length) ** 2.4;
        samples[frame] = (Math.random() * 2 - 1) * fade;
      }
    }
    return impulse;
  }

  private updateSpatialPosition(): void {
    if (!this.spatialPanner || !this.audio) return;
    const state = this.effectSettings.spatial8d;
    const speed = state.params['spatial8d.speed'] ?? 0.08;
    const width = (state.params['spatial8d.width'] ?? 82) / 100;
    const shape = state.params['spatial8d.shape'] ?? 0;
    const angle = this.audio.currentTime * speed * Math.PI * 2;
    const x = shape >= 0.5 ? Math.sin(angle) * Math.cos(angle) : Math.cos(angle);
    const z = shape >= 0.5 ? Math.sin(angle) : Math.sin(angle);
    const now = this.audioContext?.currentTime ?? 0;
    this.spatialPanner.positionX.setTargetAtTime(x * width, now, 0.08);
    this.spatialPanner.positionZ.setTargetAtTime(z * width, now, 0.08);
  }

  private startSpatialAnimation(): void {
    if (this.spatialFrameId !== null || !this.effectSettings.spatial8d.enabled) return;
    const tick = (): void => {
      this.spatialFrameId = null;
      if (!this.audio || this.audio.paused || this.audio.ended) return;
      this.updateSpatialPosition();
      this.spatialFrameId = window.requestAnimationFrame(tick);
    };
    this.spatialFrameId = window.requestAnimationFrame(tick);
  }

  private stopSpatialAnimation(): void {
    if (this.spatialFrameId === null) return;
    window.cancelAnimationFrame(this.spatialFrameId);
    this.spatialFrameId = null;
  }

  private publish(): void {
    const snapshot = this.snapshot;
    for (const listener of this.listeners) listener(snapshot);
  }
}
