import { SoundTouchNode } from '@soundtouchjs/audio-worklet';
import processorUrl from '@soundtouchjs/audio-worklet/processor?url';
import './spikes.css';

type Mode = 'tempo' | 'pitch' | 'varispeed';

const modeButtons = [...document.querySelectorAll<HTMLButtonElement>('.mode-button')];
const slider = document.querySelector<HTMLInputElement>('#main-control')!;
const playButton = document.querySelector<HTMLButtonElement>('#play-button')!;
const fileInput = document.querySelector<HTMLInputElement>('#audio-file')!;
const modeInfo: Record<
  Mode,
  { label: string; description: string; min: string; max: string; slider: [number, number, number] }
> = {
  tempo: {
    label: 'TEMPO',
    description: 'Move faster or slower while keeping the pitch steady.',
    min: '0.50×',
    max: '2.00×',
    slider: [0.5, 2, 1],
  },
  pitch: {
    label: 'PITCH SHIFT',
    description: 'Change the key without changing the song’s pace.',
    min: '−12 st',
    max: '+12 st',
    slider: [-12, 12, 0],
  },
  varispeed: {
    label: 'VARISPEED',
    description: 'Change speed and pitch together, like a record spinning faster.',
    min: '0.50×',
    max: '2.00×',
    slider: [0.5, 2, 1],
  },
};

let mode: Mode = 'tempo';
let context: AudioContext | null = null;
let processor: SoundTouchNode | null = null;
let source: AudioBufferSourceNode | null = null;
let chosenBuffer: AudioBuffer | null = null;
let selectedName = 'generated reference tone';
let loadedFromFile = false;
let metricsSeen = false;

const status = document.querySelector<HTMLElement>('#status')!;
const metrics = document.querySelector<HTMLElement>('#metrics')!;
const mainControl = document.querySelector<HTMLElement>('#control-label')!;
const mainValue = document.querySelector<HTMLElement>('#control-value')!;
const description = document.querySelector<HTMLElement>('#control-description')!;

function makeReferenceTone(audioContext: AudioContext): AudioBuffer {
  const length = Math.round(audioContext.sampleRate * 10);
  const buffer = audioContext.createBuffer(2, length, audioContext.sampleRate);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const samples = buffer.getChannelData(channel);
    for (let i = 0; i < samples.length; i++) {
      const time = i / audioContext.sampleRate;
      const fade = Math.min(1, i / 800, (samples.length - i) / 800);
      samples[i] =
        fade *
        (0.25 * Math.sin(2 * Math.PI * 440 * time) + 0.1 * Math.sin(2 * Math.PI * 660 * time));
    }
  }
  return buffer;
}

function ramp(param: AudioParam, value: number): void {
  if (!context) return;
  const now = context.currentTime;
  param.cancelScheduledValues(now);
  param.setTargetAtTime(value, now, 0.02);
}

function updateControls(): void {
  const value = Number(slider.value);
  mainControl.textContent = modeInfo[mode].label;
  description.textContent = modeInfo[mode].description;
  document.querySelector('#range-min')!.textContent = modeInfo[mode].min;
  document.querySelector('#range-max')!.textContent = modeInfo[mode].max;
  mainValue.textContent =
    mode === 'pitch' ? `${value > 0 ? '+' : ''}${value.toFixed(1)} st` : `${value.toFixed(2)}×`;
  slider.setAttribute('aria-label', modeInfo[mode].label);

  if (!source || !processor) return;
  const rate = mode === 'pitch' ? 1 : value;
  ramp(source.playbackRate, rate);
  ramp(processor.playbackRate, rate);
  ramp(processor.pitch, mode === 'varispeed' ? rate : 1);
  ramp(processor.pitchSemitones, mode === 'pitch' ? value : 0);
}

async function loadFile(file: File): Promise<void> {
  const audioContext = await getContext();
  const data = await file.arrayBuffer();
  chosenBuffer = await audioContext.decodeAudioData(data);
  loadedFromFile = true;
  selectedName = file.name;
  status.textContent = `Loaded · ${file.name}`;
  playButton.querySelector('span')!.textContent = 'Play selected audio';
  if (source) await startAudio();
}

async function getContext(): Promise<AudioContext> {
  if (context) return context;
  context = new AudioContext({ latencyHint: 'playback' });
  await SoundTouchNode.register(context, processorUrl);
  processor = new SoundTouchNode({ context });
  processor.connect(context.destination);
  processor.addEventListener('metrics', (event) => {
    const snapshot = (event as CustomEvent<{ underrunCount: number; blockCount: number }>).detail;
    metricsSeen = true;
    metrics.textContent = `${snapshot.underrunCount} underruns · ${snapshot.blockCount.toLocaleString()} blocks`;
    metrics.parentElement?.classList.toggle('healthy', snapshot.underrunCount === 0);
  });
  return context;
}

async function startAudio(): Promise<void> {
  const audioContext = await getContext();
  await audioContext.resume();
  source?.stop();
  source?.disconnect();
  source = audioContext.createBufferSource();
  chosenBuffer ??= makeReferenceTone(audioContext);
  source.buffer = chosenBuffer;
  source.loop = !loadedFromFile;
  source.connect(processor!);
  source.onended = () => {
    if (source && !source.loop) {
      playButton.querySelector('span')!.textContent = 'Play selected audio';
      status.textContent = `Finished · ${selectedName}`;
    }
  };
  updateControls();
  source.start();
  playButton.classList.add('playing');
  playButton.innerHTML = 'Ⅱ <span>Stop playback</span>';
  status.textContent = `Playing · ${selectedName}`;
  if (!metricsSeen) metrics.textContent = 'Collecting audio-thread stats…';
}

function stopAudio(): void {
  if (!source) return;
  source.onended = null;
  source.stop();
  source.disconnect();
  source = null;
  playButton.classList.remove('playing');
  playButton.innerHTML = `▶ <span>${loadedFromFile ? 'Play selected audio' : 'Start generated tone'}</span>`;
  status.textContent = 'Paused · settings stay live';
}

modeButtons.forEach((button) => {
  button.addEventListener('click', () => {
    mode = button.dataset.mode as Mode;
    for (const entry of modeButtons) entry.classList.toggle('active', entry === button);
    const [min, max, value] = modeInfo[mode].slider;
    slider.min = String(min);
    slider.max = String(max);
    slider.step = mode === 'pitch' ? '0.1' : '0.01';
    slider.value = String(value);
    updateControls();
  });
});

slider.addEventListener('input', updateControls);
playButton.addEventListener('click', () => (source ? stopAudio() : void startAudio()));
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file)
    void loadFile(file).catch((error: unknown) => {
      status.textContent = error instanceof Error ? error.message : 'Unable to decode this file.';
    });
});

updateControls();
