// ============================================================================
//  AUDIO — tiny WebAudio "blip" synth. No files, no latency.
//  Must be unlocked by a user gesture (the Play button calls unlock()).
// ============================================================================

import { CONFIG } from './config.js';

let ctx = null;

export function unlock() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) ctx = new AC();
  }
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

// A short pitched "blip". `pitch` ~0..1 maps low->high; louder when `strength` up.
export function blip(pitch = 0.5, strength = 1) {
  if (!ctx) return;
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';

  // Map pitch to a pleasant range and add a little upward chirp for "pop".
  const base = 320 + pitch * 620;
  osc.frequency.setValueAtTime(base, now);
  osc.frequency.exponentialRampToValueAtTime(base * 1.5, now + 0.05);

  const vol = CONFIG.SFX_VOLUME * (0.5 + 0.5 * strength);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(vol, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.18);
}

// Warmer "level up / unlock" chord.
export function chime() {
  if (!ctx) return;
  const now = ctx.currentTime;
  [523.25, 659.25, 783.99].forEach((freq, index) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const start = now + index * 0.06;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(CONFIG.SFX_VOLUME * 0.6, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.55);
  });
}
