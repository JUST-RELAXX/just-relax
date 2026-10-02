import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockWorklet = vi.hoisted(() => ({
  register: vi.fn<(...args: unknown[]) => Promise<void>>(),
  node: null as null | {
    playbackRate: { value: number };
    pitch: { value: number };
    pitchSemitones: { value: number };
  },
}));

vi.mock('@soundtouchjs/audio-worklet', () => {
  class MockAudioParam {
    value = 1;
    cancelScheduledValues(): void {}
    setTargetAtTime(value: number): void {
      this.value = value;
    }
  }

  class MockSoundTouchNode extends EventTarget {
    playbackRate = new MockAudioParam();
    pitch = new MockAudioParam();
    pitchSemitones = new MockAudioParam();
    connect = vi.fn();
    disconnect = vi.fn();

    static register = mockWorklet.register;

    constructor() {
      super();
      mockWorklet.node = this;
    }
  }

  return { SoundTouchNode: MockSoundTouchNode };
});

import { HTMLAudioEngine } from './AudioEngine';

class MockMediaElement {
  currentTime = 0;
  duration = 100;
  paused = true;
  ended = false;
  volume = 1;
  playbackRate = 1;
  src = '';
  preload = '';
  crossOrigin: string | null = null;
  private readonly listeners = new Map<string, Set<EventListener>>();

  addEventListener(type: string, listener: EventListener): void {
    const entries = this.listeners.get(type) ?? new Set<EventListener>();
    entries.add(listener);
    this.listeners.set(type, entries);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener(new Event(type));
  }

  load(): void {}
  removeAttribute(): void {
    this.src = '';
  }
  async play(): Promise<void> {
    this.paused = false;
    this.dispatch('play');
  }
  pause(): void {
    this.paused = true;
    this.dispatch('pause');
  }
}

class MockAudioParam {
  value = 1;
  cancelScheduledValues(): void {}
  setTargetAtTime(value: number): void {
    this.value = value;
  }
}

class MockNode {
  connect = vi.fn();
  disconnect = vi.fn();
}

class MockGainNode extends MockNode {
  gain = new MockAudioParam();
}

class MockBiquadNode extends MockNode {
  type = 'peaking';
  frequency = new MockAudioParam();
  Q = new MockAudioParam();
  gain = new MockAudioParam();
}

class MockDynamicsNode extends MockNode {
  threshold = new MockAudioParam();
  ratio = new MockAudioParam();
  attack = new MockAudioParam();
  release = new MockAudioParam();
  knee = new MockAudioParam();
}

class MockPannerNode extends MockNode {
  panningModel: PanningModelType = 'HRTF';
  distanceModel: DistanceModelType = 'inverse';
  refDistance = 1;
  maxDistance = 1;
  rolloffFactor = 1;
  positionX = new MockAudioParam();
  positionY = new MockAudioParam();
  positionZ = new MockAudioParam();
}

class MockConvolverNode extends MockNode {
  buffer: AudioBuffer | null = null;
}

class MockBitcrusherNode extends MockNode {
  parameters = new Map<string, MockAudioParam>([
    ['bits', new MockAudioParam()],
    ['rate', new MockAudioParam()],
  ]);
}

class MockAudioContext {
  currentTime = 2;
  state: AudioContextState = 'suspended';
  destination = new MockNode();
  mediaSource = new MockNode();
  gainNode = new MockGainNode();
  worklet = { addModule: vi.fn().mockResolvedValue(undefined) };
  biquads: MockBiquadNode[] = [];
  compressors: MockDynamicsNode[] = [];
  delays: Array<MockNode & { delayTime: MockAudioParam }> = [];
  pannering: MockPannerNode[] = [];

  get audioWorklet(): AudioWorklet {
    return this.worklet as unknown as AudioWorklet;
  }

  createMediaElementSource(): MediaElementAudioSourceNode {
    return this.mediaSource as unknown as MediaElementAudioSourceNode;
  }
  createGain(): GainNode {
    return this.gainNode as unknown as GainNode;
  }
  createBiquadFilter(): BiquadFilterNode {
    const filter = new MockBiquadNode();
    this.biquads.push(filter);
    return filter as unknown as BiquadFilterNode;
  }
  createDynamicsCompressor(): DynamicsCompressorNode {
    const compressor = new MockDynamicsNode();
    this.compressors.push(compressor);
    return compressor as unknown as DynamicsCompressorNode;
  }
  createDelay(): DelayNode {
    const node = new MockNode() as MockNode & { delayTime: MockAudioParam };
    node.delayTime = new MockAudioParam();
    this.delays.push(node);
    return node as unknown as DelayNode;
  }
  createConvolver(): ConvolverNode {
    return new MockConvolverNode() as unknown as ConvolverNode;
  }
  createPanner(): PannerNode {
    const panner = new MockPannerNode();
    this.pannering.push(panner);
    return panner as unknown as PannerNode;
  }
  createBuffer(numberOfChannels: number, length: number): AudioBuffer {
    return {
      numberOfChannels,
      getChannelData: () => new Float32Array(length),
    } as unknown as AudioBuffer;
  }
  async resume(): Promise<void> {
    this.state = 'running';
  }
  async close(): Promise<void> {
    this.state = 'closed';
  }
}

describe('HTMLAudioEngine', () => {
  let engine: HTMLAudioEngine;
  let media: MockMediaElement;
  let context: MockAudioContext;

  beforeEach(() => {
    mockWorklet.register.mockReset().mockResolvedValue(undefined);
    mockWorklet.node = null;
    media = new MockMediaElement();
    context = new MockAudioContext();
    vi.stubGlobal(
      'Audio',
      class {
        constructor() {
          return media;
        }
      },
    );
    vi.stubGlobal('window', {
      AudioContext: class {
        constructor() {
          return context;
        }
      },
    });
    vi.stubGlobal('AudioWorkletNode', class extends MockBitcrusherNode {});
    engine = new HTMLAudioEngine();
  });

  afterEach(() => {
    engine.dispose();
    vi.unstubAllGlobals();
  });

  it('keeps seek time on the media element while applying speed and volume in the graph', async () => {
    await engine.load('aurora-media://track/test');
    await engine.play();

    expect(media.crossOrigin).toBe('anonymous');
    expect(media.src).toBe('aurora-media://track/test');
    expect(context.mediaSource.connect).toHaveBeenCalledWith(mockWorklet.node);

    engine.setSpeed('tempo', 1.4);
    expect(media.playbackRate).toBe(1.4);
    expect(mockWorklet.node?.playbackRate.value).toBe(1.4);
    expect(mockWorklet.node?.pitch.value).toBe(1);

    engine.setSpeed('pitch', -2.5);
    expect(media.playbackRate).toBe(1);
    expect(mockWorklet.node?.pitchSemitones.value).toBe(-2.5);

    engine.setSpeed('varispeed', 1.7);
    expect(mockWorklet.node?.pitch.value).toBe(1.7);
    engine.setVolume(0.43);
    expect(context.gainNode.gain.value).toBe(0.43);

    engine.seek(140);
    expect(engine.snapshot.trackPositionSeconds).toBe(100);
    expect(engine.snapshot.playing).toBe(true);
  });

  it('continues direct playback when worklet registration is unavailable', async () => {
    mockWorklet.register.mockRejectedValueOnce(new Error('worklet unavailable'));
    await engine.load('aurora-media://track/test');
    await expect(engine.play()).resolves.toBeUndefined();

    expect(context.mediaSource.connect).toHaveBeenCalled();
    expect(context.mediaSource.connect.mock.calls[0][0]).toBeInstanceOf(MockBiquadNode);
    expect(engine.snapshot.playing).toBe(true);
    expect(engine.snapshot.dspMetrics).toBeNull();
    expect(engine.snapshot.workletAvailable).toBe(false);
    engine.setSpeed('tempo', 1.5);
    expect(media.playbackRate).toBe(1);
    engine.setSpeed('varispeed', 1.5);
    expect(media.playbackRate).toBe(1.5);
  });

  it('keeps a requested seek before media metadata arrives', async () => {
    await engine.load('aurora-media://track/test');
    media.duration = Number.NaN;
    engine.seek(42.5);
    expect(media.currentTime).toBe(42.5);
  });

  it('applies shared effect values to the matching live audio nodes', async () => {
    engine.setEffectEnabled('eq', true);
    engine.setEffectParameter('eq', 'eq.60', 7);
    engine.setEffectEnabled('bass', true);
    engine.setEffectParameter('bass', 'bass.gain', 4);
    engine.setEffectEnabled('delay', true);
    engine.setEffectParameter('delay', 'delay.feedback', 50);
    await engine.load('aurora-media://track/test');
    await engine.play();

    expect(engine.snapshot.workletAvailable).toBe(true);
    expect(context.biquads[0].gain.value).toBe(7);
    expect(context.biquads[8].gain.value).toBe(4);
    expect(context.delays[0].delayTime.value).toBeCloseTo(0.32);
    expect(context.pannering).toHaveLength(1);
  });
});
