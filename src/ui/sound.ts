import { useProjectStore } from '../store/projectStore';

/**
 * Subtle audio feedback, synthesised on the fly (no sound files): a soft
 * "thunk" when a cable is plugged in, a lighter click when one is pulled out,
 * a tiny tick per knob step, a click for switches and a paper rustle for
 * sticky notes. Quiet on purpose; can be switched off in the View menu.
 */

export type Sound = 'plug' | 'unplug' | 'tick' | 'switch' | 'note';

let ctx: AudioContext | null = null;
let last = 0;

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    // Browsers start audio suspended until the user has interacted; every call comes from a tap or click.
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** A short sine "body" with a fast decay. */
function tone(a: AudioContext, at: number, freq: number, to: number, length: number, volume: number) {
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.frequency.setValueAtTime(freq, at);
  osc.frequency.exponentialRampToValueAtTime(to, at + length);
  gain.gain.setValueAtTime(volume, at);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(gain).connect(a.destination);
  osc.start(at);
  osc.stop(at + length + 0.01);
}

/** A burst of filtered noise: clicks and rustles. */
function noise(a: AudioContext, at: number, length: number, volume: number, freq: number, q = 1) {
  const frames = Math.max(1, Math.floor(a.sampleRate * length));
  const buffer = a.createBuffer(1, frames, a.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames) ** 2;
  const src = a.createBufferSource();
  src.buffer = buffer;
  const filter = a.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = q;
  const gain = a.createGain();
  gain.gain.value = volume;
  src.connect(filter).connect(gain).connect(a.destination);
  src.start(at);
}

export function play(sound: Sound) {
  if (!useProjectStore.getState().sound) return;
  const a = audio();
  if (!a) return;
  const now = a.currentTime;
  // Knob ticks come quickly while dragging; never stack them up.
  if (sound === 'tick' && now - last < 0.03) return;
  last = now;
  switch (sound) {
    case 'plug':
      noise(a, now, 0.02, 0.12, 2400, 0.8);
      tone(a, now + 0.008, 150, 70, 0.09, 0.09);
      break;
    case 'unplug':
      noise(a, now, 0.025, 0.1, 3800, 1.2);
      tone(a, now, 420, 260, 0.05, 0.035);
      break;
    case 'tick':
      noise(a, now, 0.006, 0.05, 5000, 2);
      break;
    case 'switch':
      noise(a, now, 0.012, 0.1, 3000, 1.5);
      tone(a, now + 0.004, 900, 600, 0.03, 0.025);
      break;
    case 'note':
      noise(a, now, 0.12, 0.05, 1800, 0.6);
      break;
  }
}
