class AuroraBitcrusher extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'bits', defaultValue: 16, minValue: 4, maxValue: 16, automationRate: 'k-rate' },
      { name: 'rate', defaultValue: 1, minValue: 0.05, maxValue: 1, automationRate: 'k-rate' },
    ];
  }

  constructor() {
    super();
    this.held = [];
    this.phase = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input?.length || !output?.length) return true;

    const bits = Math.max(4, Math.min(16, Math.round(parameters.bits[0] ?? 16)));
    const rate = Math.max(0.05, Math.min(1, parameters.rate[0] ?? 1));
    const holdFrames = Math.max(1, Math.round(1 / rate));
    const levels = 2 ** (bits - 1);

    for (let channel = 0; channel < output.length; channel += 1) this.held[channel] ??= 0;
    for (let frame = 0; frame < output[0].length; frame += 1) {
      if (this.phase === 0) {
        for (let channel = 0; channel < output.length; channel += 1) {
          const source = input[Math.min(channel, input.length - 1)];
          this.held[channel] = Math.round(source[frame] * levels) / levels;
        }
    }
      for (let channel = 0; channel < output.length; channel += 1) {
        output[channel][frame] = this.held[channel];
      }
      this.phase = (this.phase + 1) % holdFrames;
    }
    return true;
  }
}

registerProcessor('aurora-bitcrusher', AuroraBitcrusher);
