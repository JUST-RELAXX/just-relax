import './spikes.css';

type OrbitShape = 'circle' | 'figure8';

const periodSlider = document.querySelector<HTMLInputElement>('#period')!;
const radiusSlider = document.querySelector<HTMLInputElement>('#radius')!;
const reverseToggle = document.querySelector<HTMLInputElement>('#reverse')!;
const shapeSelect = document.querySelector<HTMLSelectElement>('#orbit-shape')!;
const dot = document.querySelector<HTMLElement>('#orbit-dot')!;
const status = document.querySelector<HTMLElement>('#orbit-status')!;
const toggle = document.querySelector<HTMLButtonElement>('#toggle-audio')!;
let context: AudioContext | null = null;
let panner: PannerNode | null = null;
let oscillator: OscillatorNode | null = null;
let orbitStartedAt = 0;
let animationFrame = 0;
let scheduler = 0;
let scheduledUntil = 0;
let reconfigureTimer = 0;

function makeCurves(
  radius: number,
  reverse: boolean,
  shape: OrbitShape,
): [Float32Array, Float32Array] {
  const samples = 256;
  const x = new Float32Array(samples);
  const z = new Float32Array(samples);
  for (let index = 0; index < samples; index++) {
    const progress = index / (samples - 1);
    const angle = (reverse ? -1 : 1) * progress * Math.PI * 2;
    x[index] = radius * Math.sin(angle);
    z[index] = shape === 'circle' ? -radius * Math.cos(angle) : -(radius * Math.cos(angle * 2)) / 2;
  }
  return [x, z];
}

function scheduleOrbit(startAt = (context?.currentTime ?? 0) + 0.06): number {
  if (!context || !panner) return startAt;
  const period = Number(periodSlider.value);
  const count = 2;
  const [x, z] = makeCurves(
    Number(radiusSlider.value),
    reverseToggle.checked,
    shapeSelect.value as OrbitShape,
  );

  for (let turn = 0; turn < count; turn++) {
    const start = startAt + turn * period;
    panner.positionX.setValueCurveAtTime(x, start, period);
    panner.positionZ.setValueCurveAtTime(z, start, period);
  }
  return startAt + count * period;
}

function redrawDot(): void {
  if (!context) return;
  const period = Number(periodSlider.value);
  const direction = reverseToggle.checked ? -1 : 1;
  const progress = (((((context.currentTime - orbitStartedAt) / period) * direction) % 1) + 1) % 1;
  const angle = progress * Math.PI * 2;
  const x = Math.sin(angle);
  const z = shapeSelect.value === 'circle' ? -Math.cos(angle) : -Math.cos(angle * 2) * 0.5;
  dot.style.transform = `translate(${x * 112}px, ${z * 76}px)`;
  animationFrame = requestAnimationFrame(redrawDot);
}

function refreshLabels(): void {
  document.querySelector('#period-output')!.textContent = `${periodSlider.value} s`;
  document.querySelector('#radius-output')!.textContent =
    `${Number(radiusSlider.value).toFixed(1)} m`;
}

async function startOrbit(): Promise<void> {
  if (!context) {
    context = new AudioContext({ latencyHint: 'playback' });
    panner = new PannerNode(context, {
      panningModel: 'HRTF',
      distanceModel: 'inverse',
      refDistance: 1,
      rolloffFactor: 0.45,
      maxDistance: 100,
    });
    const gain = context.createGain();
    gain.gain.value = 0.035;
    oscillator = context.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.value = 330;
    oscillator.connect(gain).connect(panner).connect(context.destination);
    oscillator.start();
  }
  await context.resume();
  const now = context.currentTime;
  const [firstX, firstZ] = makeCurves(
    Number(radiusSlider.value),
    reverseToggle.checked,
    shapeSelect.value as OrbitShape,
  );
  const currentX = panner!.positionX.value;
  const currentY = panner!.positionY.value;
  const currentZ = panner!.positionZ.value;
  panner!.positionX.cancelScheduledValues(now);
  panner!.positionY.cancelScheduledValues(now);
  panner!.positionZ.cancelScheduledValues(now);
  panner!.positionX.setValueAtTime(currentX, now);
  panner!.positionX.linearRampToValueAtTime(firstX[0], now + 0.12);
  panner!.positionY.setValueAtTime(currentY, now);
  panner!.positionZ.setValueAtTime(currentZ, now);
  panner!.positionZ.linearRampToValueAtTime(firstZ[0], now + 0.12);
  orbitStartedAt = now + 0.12;
  scheduledUntil = scheduleOrbit(orbitStartedAt);
  window.clearInterval(scheduler);
  scheduler = window.setInterval(() => {
    if (context && scheduledUntil - context.currentTime < Number(periodSlider.value) * 2) {
      scheduledUntil = scheduleOrbit(scheduledUntil);
    }
  }, 1_000);
  cancelAnimationFrame(animationFrame);
  animationFrame = requestAnimationFrame(redrawDot);
  toggle.classList.add('playing');
  toggle.innerHTML = 'Ⅱ <span>Stop orbit</span>';
  status.textContent = 'Orbit scheduled on audio time · no screen timer drives playback.';
}

function stopOrbit(): void {
  if (!context || !panner) return;
  const now = context.currentTime;
  const gain = panner;
  gain.positionX.cancelScheduledValues(now);
  gain.positionY.cancelScheduledValues(now);
  gain.positionZ.cancelScheduledValues(now);
  window.clearInterval(scheduler);
  cancelAnimationFrame(animationFrame);
  void context.suspend();
  toggle.classList.remove('playing');
  toggle.innerHTML = '▶ <span>Start orbit</span>';
  status.textContent = 'Paused · headphones recommended for the 3D effect.';
}

toggle.addEventListener('click', () =>
  context?.state === 'running' ? stopOrbit() : void startOrbit(),
);
function applyCurrentOrbit(): void {
  refreshLabels();
  if (!context || !panner || context.state !== 'running') return;
  window.clearTimeout(reconfigureTimer);
  reconfigureTimer = window.setTimeout(() => {
    const now = context!.currentTime;
    const [firstX, firstZ] = makeCurves(
      Number(radiusSlider.value),
      reverseToggle.checked,
      shapeSelect.value as OrbitShape,
    );
    const currentX = panner!.positionX.value;
    const currentY = panner!.positionY.value;
    const currentZ = panner!.positionZ.value;
    panner!.positionX.cancelScheduledValues(now);
    panner!.positionY.cancelScheduledValues(now);
    panner!.positionZ.cancelScheduledValues(now);
    panner!.positionX.setValueAtTime(currentX, now);
    panner!.positionX.linearRampToValueAtTime(firstX[0], now + 0.12);
    panner!.positionY.setValueAtTime(currentY, now);
    panner!.positionZ.setValueAtTime(currentZ, now);
    panner!.positionZ.linearRampToValueAtTime(firstZ[0], now + 0.12);
    orbitStartedAt = now + 0.12;
    scheduledUntil = scheduleOrbit(orbitStartedAt);
  }, 100);
}

periodSlider.addEventListener('input', applyCurrentOrbit);
radiusSlider.addEventListener('input', applyCurrentOrbit);
reverseToggle.addEventListener('change', applyCurrentOrbit);
shapeSelect.addEventListener('change', applyCurrentOrbit);
refreshLabels();
