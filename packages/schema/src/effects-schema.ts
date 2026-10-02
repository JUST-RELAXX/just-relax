export type ParamCurve = 'linear' | 'log' | 'exp' | 'semitone' | 'db';
export type ParamUnit = 's' | 'ms' | 'Hz' | 'dB' | '%' | 'st' | 'ct' | 'bits' | 'x';
export type EffectId =
  'speed' | 'eq' | 'bass' | 'dynamics' | 'bitcrusher' | 'delay' | 'reverb' | 'spatial8d' | 'master';

export interface ParamDef {
  id: string;
  label: string;
  unit?: ParamUnit;
  min: number;
  max: number;
  default: number;
  step?: number;
  curve: ParamCurve;
  smoothingMs?: number;
  advanced?: boolean;
  description: string;
}

export interface EffectDef {
  id: EffectId;
  label: string;
  params: ParamDef[];
  bypassable: boolean;
  description: string;
}

export interface EffectState {
  enabled: boolean;
  params: Record<string, number>;
}

export type EffectSettings = Record<EffectId, EffectState>;

const speedParams: ParamDef[] = [
  {
    id: 'speed.tempo',
    label: 'Tempo',
    unit: 'x',
    min: 0.5,
    max: 2,
    default: 1,
    step: 0.01,
    curve: 'exp',
    smoothingMs: 30,
    description: 'Change pace while keeping the musical pitch steady.',
  },
  {
    id: 'speed.pitch',
    label: 'Pitch',
    unit: 'st',
    min: -12,
    max: 12,
    default: 0,
    step: 0.1,
    curve: 'semitone',
    smoothingMs: 30,
    description: 'Move the musical pitch while keeping the pace steady.',
  },
  {
    id: 'speed.rate',
    label: 'Rate',
    unit: 'x',
    min: 0.5,
    max: 2,
    default: 1,
    step: 0.01,
    curve: 'exp',
    smoothingMs: 30,
    description: 'Change pace and pitch together, like a record changing speed.',
  },
];

const equalizerBands = [60, 170, 310, 600, 1000, 3000, 6000, 12000];
const equalizerParams: ParamDef[] = equalizerBands.map((frequency) => ({
  id: `eq.${frequency}`,
  label: frequency >= 1000 ? `${frequency / 1000} kHz` : `${frequency} Hz`,
  unit: 'dB',
  min: -12,
  max: 12,
  default: 0,
  step: 0.5,
  curve: 'db',
  smoothingMs: 25,
  description: `Shape the ${frequency} Hz band.`,
}));

export const effectDefinitions: readonly EffectDef[] = [
  {
    id: 'speed',
    label: 'Speed & pitch',
    description: 'Change tempo, key, or both together.',
    bypassable: false,
    params: speedParams,
  },
  {
    id: 'eq',
    label: 'Equalizer',
    description: 'Shape eight frequency bands from bass to air.',
    bypassable: true,
    params: equalizerParams,
  },
  {
    id: 'bass',
    label: 'Bass warmth',
    description: 'Add or soften low-frequency weight.',
    bypassable: true,
    params: [
      {
        id: 'bass.gain',
        label: 'Low-end gain',
        unit: 'dB',
        min: -12,
        max: 12,
        default: 0,
        step: 0.5,
        curve: 'db',
        smoothingMs: 30,
        description: 'Adjust the low-end shelf around 110 Hz.',
      },
    ],
  },
  {
    id: 'dynamics',
    label: 'Dynamics',
    description: 'Tame loud peaks and even out the level.',
    bypassable: true,
    params: [
      {
        id: 'dynamics.threshold',
        label: 'Threshold',
        unit: 'dB',
        min: -48,
        max: 0,
        default: -24,
        step: 1,
        curve: 'db',
        description: 'Start gentle compression above this level.',
      },
      {
        id: 'dynamics.ratio',
        label: 'Ratio',
        unit: 'x',
        min: 1,
        max: 12,
        default: 2,
        step: 0.1,
        curve: 'linear',
        description: 'Set how strongly peaks are reduced.',
      },
      {
        id: 'dynamics.attack',
        label: 'Attack',
        unit: 'ms',
        min: 0.5,
        max: 80,
        default: 10,
        step: 0.5,
        curve: 'log',
        description: 'Set how quickly compression engages.',
      },
      {
        id: 'dynamics.release',
        label: 'Release',
        unit: 'ms',
        min: 20,
        max: 800,
        default: 180,
        step: 5,
        curve: 'log',
        description: 'Set how quickly the level returns to normal.',
      },
    ],
  },
  {
    id: 'bitcrusher',
    label: 'Bitcrusher',
    description: 'Add deliberate digital grit and downsampling.',
    bypassable: true,
    params: [
      {
        id: 'bitcrusher.bits',
        label: 'Bit depth',
        unit: 'bits',
        min: 4,
        max: 16,
        default: 12,
        step: 1,
        curve: 'linear',
        description: 'Lower values create more quantization grit.',
      },
      {
        id: 'bitcrusher.rate',
        label: 'Sample rate',
        unit: '%',
        min: 5,
        max: 100,
        default: 100,
        step: 1,
        curve: 'linear',
        description: 'Reduce the effective sample rate.',
      },
    ],
  },
  {
    id: 'delay',
    label: 'Echo',
    description: 'Add soft, tempo-independent repeats.',
    bypassable: true,
    params: [
      {
        id: 'delay.time',
        label: 'Time',
        unit: 'ms',
        min: 30,
        max: 900,
        default: 320,
        step: 5,
        curve: 'linear',
        description: 'Set the space between echoes.',
      },
      {
        id: 'delay.feedback',
        label: 'Feedback',
        unit: '%',
        min: 0,
        max: 80,
        default: 35,
        step: 1,
        curve: 'linear',
        description: 'Set how many repeats fade through.',
      },
      {
        id: 'delay.mix',
        label: 'Mix',
        unit: '%',
        min: 0,
        max: 100,
        default: 24,
        step: 1,
        curve: 'linear',
        description: 'Balance echoes against the original.',
      },
    ],
  },
  {
    id: 'reverb',
    label: 'Reverb',
    description: 'Place the sound in a generated, roomy space.',
    bypassable: true,
    params: [
      {
        id: 'reverb.room',
        label: 'Room size',
        unit: 's',
        min: 0.2,
        max: 3,
        default: 1.4,
        step: 0.1,
        curve: 'linear',
        description: 'Set how long the generated room rings out.',
      },
      {
        id: 'reverb.mix',
        label: 'Mix',
        unit: '%',
        min: 0,
        max: 100,
        default: 22,
        step: 1,
        curve: 'linear',
        description: 'Balance room ambience against the original.',
      },
    ],
  },
  {
    id: 'spatial8d',
    label: 'Spatial orbit',
    description: 'Move the sound in a slow circle or figure eight.',
    bypassable: true,
    params: [
      {
        id: 'spatial8d.speed',
        label: 'Orbit speed',
        unit: 'x',
        min: 0.02,
        max: 0.25,
        default: 0.08,
        step: 0.01,
        curve: 'linear',
        description: 'Set how quickly the sound travels around you.',
      },
      {
        id: 'spatial8d.width',
        label: 'Width',
        unit: '%',
        min: 10,
        max: 100,
        default: 82,
        step: 1,
        curve: 'linear',
        description: 'Set how far the sound moves from the center.',
      },
      {
        id: 'spatial8d.shape',
        label: 'Path shape',
        min: 0,
        max: 1,
        default: 0,
        step: 1,
        curve: 'linear',
        description: '0 follows a circle; 1 follows a figure eight.',
      },
      {
        id: 'spatial8d.mix',
        label: 'Mix',
        unit: '%',
        min: 0,
        max: 100,
        default: 100,
        step: 1,
        curve: 'linear',
        description: 'Balance the moving sound against the centered signal.',
      },
    ],
  },
  {
    id: 'master',
    label: 'Master limiter',
    description: 'Keep output peaks from becoming harsh.',
    bypassable: false,
    params: [
      {
        id: 'master.ceiling',
        label: 'Ceiling',
        unit: 'dB',
        min: -6,
        max: 0,
        default: -1,
        step: 0.1,
        curve: 'db',
        smoothingMs: 30,
        description: 'Set the output limiter threshold.',
      },
    ],
  },
];

export function createDefaultEffectSettings(): EffectSettings {
  return Object.fromEntries(
    effectDefinitions.map((effect) => [
      effect.id,
      {
        enabled: effect.id === 'speed' || effect.id === 'master',
        params: Object.fromEntries(
          effect.params.map((parameter) => [parameter.id, parameter.default]),
        ),
      },
    ]),
  ) as EffectSettings;
}

export function normalizeEffectSettings(value: unknown): EffectSettings {
  const normalized = createDefaultEffectSettings();
  if (!value || typeof value !== 'object') return normalized;
  const input = value as Partial<Record<EffectId, Partial<EffectState>>>;
  for (const definition of effectDefinitions) {
    const stored = input[definition.id];
    if (!stored || typeof stored !== 'object') continue;
    normalized[definition.id].enabled = definition.bypassable
      ? stored.enabled === true
      : normalized[definition.id].enabled;
    for (const parameter of definition.params) {
      const candidate = stored.params?.[parameter.id];
      if (typeof candidate === 'number') {
        normalized[definition.id].params[parameter.id] = clampParameter(parameter, candidate);
      }
    }
  }
  return normalized;
}

export function findEffect(effectId: EffectId): EffectDef {
  const effect = effectDefinitions.find((candidate) => candidate.id === effectId);
  if (!effect) throw new Error(`Unknown effect: ${effectId}`);
  return effect;
}

export function clampParameter(definition: ParamDef, value: number): number {
  if (!Number.isFinite(value)) return definition.default;
  return Math.min(definition.max, Math.max(definition.min, value));
}
