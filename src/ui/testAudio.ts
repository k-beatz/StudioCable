import type { TestListener } from '../core/testSignal';
import { useProjectStore } from '../store/projectStore';
import { testResultFor, useTestSignal, type TestSound } from '../store/testSignal';

/**
 * Plays the test signal as the plan would deliver it: every speaker or pair
 * of headphones it reaches gets its own chain (level, side, and whatever the
 * connections do to it: faint, distorted, thin, dull, polarity flipped).
 * Turning a knob or pulling a cable while it plays changes what you hear.
 * The sounds are synthesised, no files.
 */

let ctx: AudioContext | null = null;
let source: AudioBufferSourceNode | null = null;
let bus: GainNode | null = null;
let chains: AudioNode[] = [];
let playing: { sourceId: string; sound: TestSound } | null = null;

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Two bars of a little groove: kick, hi-hat, bass line and a chord stab, all made from scratch. */
function musicBuffer(a: AudioContext): AudioBuffer {
  const rate = a.sampleRate;
  const bpm = 100;
  const beat = 60 / bpm;
  const length = Math.floor(rate * beat * 8);
  const buf = a.createBuffer(1, length, rate);
  const d = buf.getChannelData(0);
  const add = (start: number, dur: number, fn: (t: number) => number) => {
    const s = Math.floor(start * rate);
    const n = Math.min(length - s, Math.floor(dur * rate));
    for (let i = 0; i < n; i++) d[s + i] += fn(i / rate);
  };
  const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);
  const bass = [36, 36, 43, 41, 36, 36, 39, 41];
  const chords = [
    [60, 63, 67],
    [58, 62, 65],
  ];
  for (let b = 0; b < 8; b++) {
    const t = b * beat;
    // Kick: a falling sine with a fast decay.
    add(t, 0.35, (x) => Math.sin(2 * Math.PI * (50 * x + 60 * (1 - Math.exp(-x * 30)) / 30) ) * Math.exp(-x * 9) * 0.9);
    // Hi-hat on the off-beat: short noise.
    add(t + beat / 2, 0.05, (x) => (Math.random() * 2 - 1) * Math.exp(-x * 90) * 0.25);
    // Bass: a soft square-ish tone.
    const f = midi(bass[b]);
    add(t, beat * 0.9, (x) => Math.tanh(3 * Math.sin(2 * Math.PI * f * x)) * Math.exp(-x * 2.5) * 0.3);
    // Chord stab on beats 2 and 4.
    if (b % 2 === 1) {
      for (const n of chords[Math.floor(b / 4)]) {
        const fc = midi(n);
        add(t, 0.4, (x) => (Math.sin(2 * Math.PI * fc * x) + 0.3 * Math.sin(4 * Math.PI * fc * x)) * Math.exp(-x * 6) * 0.12);
      }
    }
  }
  return buf;
}

function toneBuffer(a: AudioContext): AudioBuffer {
  // 1 kHz is the classic line-up tone; 440 Hz is kinder to the ears. 1 s, loops seamlessly.
  const buf = a.createBuffer(1, a.sampleRate, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.sin((2 * Math.PI * 440 * i) / a.sampleRate) * 0.5;
  return buf;
}

/** Pink noise (Paul Kellet's filter), the usual signal for checking speakers. */
function noiseBuffer(a: AudioContext): AudioBuffer {
  const buf = a.createBuffer(1, a.sampleRate * 2, a.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.08;
    b6 = w * 0.115926;
  }
  return buf;
}

const BUFFERS: Record<TestSound, (a: AudioContext) => AudioBuffer> = { music: musicBuffer, tone: toneBuffer, noise: noiseBuffer };

function clipCurve(): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.max(-0.35, Math.min(0.35, x * 4)) * 2;
  }
  return curve;
}

/** One listener's chain: effects, level, side. */
function chain(a: AudioContext, input: AudioNode, l: TestListener): AudioNode[] {
  const nodes: AudioNode[] = [];
  let last: AudioNode = input;
  const link = (n: AudioNode) => {
    last.connect(n);
    nodes.push(n);
    last = n;
  };
  if (l.effects.includes('distorted')) {
    const pre = a.createGain();
    pre.gain.value = 3;
    link(pre);
    const shaper = a.createWaveShaper();
    shaper.curve = clipCurve();
    link(shaper);
  }
  if (l.effects.includes('thin')) {
    const hp = a.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 900;
    link(hp);
  }
  if (l.effects.includes('dull')) {
    const lp = a.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    link(lp);
  }
  const level = a.createGain();
  // Swapped polarity: the speaker moves the wrong way; against the other one the bass cancels.
  level.gain.value = Math.min(l.level, 3) * 0.35 * (l.effects.includes('phase') ? -1 : 1);
  link(level);
  const pan = a.createStereoPanner();
  pan.pan.value = l.pan;
  link(pan);
  pan.connect(bus!);
  return nodes;
}

/** Brings the sound in line with the current plan (called on start and on every change). */
function sync() {
  const { sourceId, sound } = useTestSignal.getState();
  const project = useProjectStore.getState().project;
  if (!sourceId) {
    stopAudio();
    return;
  }
  if (!project.devices.some((d) => d.id === sourceId)) {
    // The source was deleted (or another plan was opened).
    useTestSignal.getState().stop();
    return;
  }
  const a = audio();
  if (!a) return;
  if (!playing || playing.sourceId !== sourceId || playing.sound !== sound) {
    stopAudio();
    bus = a.createGain();
    bus.gain.setValueAtTime(0, a.currentTime);
    bus.gain.linearRampToValueAtTime(1, a.currentTime + 0.05);
    bus.connect(a.destination);
    source = a.createBufferSource();
    source.buffer = BUFFERS[sound](a);
    source.loop = true;
    source.start();
    playing = { sourceId, sound };
  }
  source!.disconnect();
  for (const n of chains) n.disconnect();
  chains = [];
  const result = testResultFor(project, sourceId);
  for (const l of result.listeners) if (l.kind !== 'recorder') chains.push(...chain(a, source!, l));
}

function stopAudio() {
  if (source && bus && ctx) {
    const s = source;
    const b = bus;
    b.gain.setValueAtTime(b.gain.value, ctx.currentTime);
    b.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.05);
    setTimeout(() => {
      s.stop();
      b.disconnect();
    }, 80);
  }
  for (const n of chains) n.disconnect();
  chains = [];
  source = null;
  bus = null;
  playing = null;
}

useTestSignal.subscribe(sync);
useProjectStore.subscribe((s, prev) => {
  if (playing && s.project !== prev.project) sync();
});
