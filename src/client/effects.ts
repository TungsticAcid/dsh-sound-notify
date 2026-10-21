/**
 * Synthesized cue presets and playback for the sound-notify plugin.
 *
 * Built-in effects are scheduled on one shared `AudioContext`, so the plugin
 * still ships no audio assets. Uploaded clips play through reused
 * `HTMLAudioElement`s. Every cue takes the per-event volume from the settings
 * document (0 … 1).
 */

import type { CueScope, CustomClip, EventKey, PresetId, Settings } from './settings';
import { clampVolume } from './settings';

export interface ToneSpec {
  /** Seconds after the cue starts. */
  at: number;
  freq: number;
  duration: number;
  /** Relative gain before the per-event volume is applied. */
  gain: number;
  type?: OscillatorType;
  /** Optional glide target, in Hz. */
  endFreq?: number;
}

export interface EffectPreset {
  id: PresetId;
  label: { zh: string; en: string };
  tones: ToneSpec[];
}

/** The selectable built-in effects; order is the `select` order in the panel. */
export const EFFECT_PRESETS: EffectPreset[] = [
  {
    id: 'chime',
    label: { zh: '清脆双音（上行）', en: 'Rising chime' },
    tones: [
      { at: 0, freq: 987.77, duration: 0.2, gain: 0.13 },
      { at: 0.11, freq: 1318.51, duration: 0.36, gain: 0.11 },
      { at: 0.11, freq: 493.88, duration: 0.32, gain: 0.05, type: 'triangle' },
    ],
  },
  {
    id: 'beep',
    label: { zh: '双叮（提醒）', en: 'Double beep' },
    tones: [
      { at: 0, freq: 987.77, duration: 0.1, gain: 0.12 },
      { at: 0.16, freq: 987.77, duration: 0.12, gain: 0.12 },
    ],
  },
  {
    id: 'soft',
    label: { zh: '柔和三音', en: 'Soft arpeggio' },
    tones: [
      { at: 0, freq: 523.25, duration: 0.18, gain: 0.09 },
      { at: 0.12, freq: 659.25, duration: 0.22, gain: 0.08 },
      { at: 0.24, freq: 783.99, duration: 0.3, gain: 0.07 },
    ],
  },
  {
    id: 'drop',
    label: { zh: '水滴下滑', en: 'Water drop' },
    tones: [{ at: 0, freq: 1200, endFreq: 360, duration: 0.22, gain: 0.12 }],
  },
  {
    id: 'marimba',
    label: { zh: '木琴三连', en: 'Marimba triad' },
    tones: [
      { at: 0, freq: 523.25, duration: 0.22, gain: 0.12, type: 'triangle' },
      { at: 0.12, freq: 783.99, duration: 0.18, gain: 0.1, type: 'triangle' },
      { at: 0.22, freq: 1046.5, duration: 0.2, gain: 0.07, type: 'triangle' },
    ],
  },
  {
    id: 'alert',
    label: { zh: '警示三连', en: 'Alert trill' },
    tones: [
      { at: 0, freq: 880, duration: 0.08, gain: 0.08, type: 'square' },
      { at: 0.14, freq: 660, duration: 0.08, gain: 0.08, type: 'square' },
      { at: 0.28, freq: 880, duration: 0.1, gain: 0.08, type: 'square' },
    ],
  },
];

export const EFFECT_LABELS: Record<string, string> = Object.fromEntries([
  ...EFFECT_PRESETS.map((preset) => [preset.id, preset.label.zh]),
  ['silent', '无（静音）'],
  ['custom', '自定义音频'],
]);

interface WindowWithWebAudio extends Window {
  webkitAudioContext?: typeof AudioContext;
}

let audio: AudioContext | undefined;
let unlocked = false;

/** Lazily create the shared AudioContext; returns undefined where unsupported. */
export function ensureAudio(): AudioContext | undefined {
  if (audio !== undefined) {
    if (audio.state === 'suspended') audio.resume().catch(() => {});
    return audio;
  }
  if (typeof window === 'undefined') return undefined;
  const Ctor = (window as WindowWithWebAudio).AudioContext ?? (window as WindowWithWebAudio).webkitAudioContext;
  if (Ctor === undefined) return undefined;
  try {
    audio = new Ctor();
  } catch {
    return undefined;
  }
  return audio;
}

/** Browsers start an AudioContext suspended; the first real gesture unlocks it. */
export function unlockAudio(): void {
  const ctx = ensureAudio();
  if (ctx === undefined) return;
  if (ctx.state === 'running') {
    unlocked = true;
    return;
  }
  ctx.resume().then(
    () => {
      unlocked = true;
    },
    () => {},
  );
}

/** Electron may already allow audio without a gesture; call once so the first cue is audible. */
export function primeAudio(): void {
  const ctx = ensureAudio();
  if (ctx !== undefined && ctx.state === 'running') unlocked = true;
}

export function isAudioReady(): boolean {
  return unlocked;
}

function playNote(ctx: AudioContext, tone: ToneSpec, volume: number): void {
  const start = ctx.currentTime + tone.at;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  const peak = Math.max(0.0002, tone.gain * volume);
  osc.type = tone.type ?? 'sine';
  osc.frequency.setValueAtTime(tone.freq, start);
  if (tone.endFreq !== undefined) osc.frequency.exponentialRampToValueAtTime(tone.endFreq, start + tone.duration);
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(peak, start + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + tone.duration);
  osc.connect(amp);
  amp.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + tone.duration + 0.03);
}

function presetById(id: PresetId): EffectPreset | undefined {
  return EFFECT_PRESETS.find((preset) => preset.id === id);
}

/** Play one built-in effect at the given per-event volume. */
export function playPreset(id: PresetId, volume: number): boolean {
  const preset = presetById(id);
  if (preset === undefined) return false;
  const ctx = ensureAudio();
  if (ctx === undefined || !unlocked) return false;
  const level = clampVolume(volume, 1);
  if (level <= 0) return false;
  for (const tone of preset.tones) playNote(ctx, tone, level);
  return true;
}

/** Uploaded clips are reused per event so repeated cues restart instead of stacking. */
const clips = new Map<string, HTMLAudioElement>();

/** Play an uploaded clip; returns false when audio is unavailable or the clip is broken. */
export function playCustom(clipKey: string, clip: CustomClip, volume: number): boolean {
  if (typeof Audio === 'undefined') return false;
  const level = clampVolume(volume, 1);
  if (level <= 0) return false;
  const existing = clips.get(clipKey);
  const player = existing !== undefined && existing.src === clip.dataUrl ? existing : new Audio(clip.dataUrl);
  if (existing !== player) {
    if (existing !== undefined) existing.pause();
    clips.set(clipKey, player);
  }
  try {
    player.pause();
    player.currentTime = 0;
    player.volume = level;
    const result = player.play();
    if (result !== undefined && typeof result.catch === 'function') result.catch(() => {});
    return true;
  } catch {
    return false;
  }
}

/**
 * Play the configured cue for one event in one scope.
 *
 * @param event - which situation is being reported.
 * @param settings - current settings document.
 * @param scope - `main` for the Session's own agent, `subagent` for a
 *   subagent-origin Session.
 * @param options.preview - the panel's preview button bypasses the global mute
 *   switch (and the subagent master switch), so a muted or not-yet-enabled
 *   user can still audition a cue.
 * @returns whether a cue actually started.
 */
export function playEvent(
  event: EventKey,
  settings: Settings,
  scope: CueScope = 'main',
  options: { preview?: boolean } = {},
): boolean {
  if (!options.preview) {
    if (!settings.enabled) return false;
    if (scope === 'subagent' && !settings.subagent.enabled) return false;
  }
  const config = scope === 'subagent' ? settings.subagent.events[event] : settings.events[event];
  if (config === undefined) return false;
  if (config.effect === 'silent' || config.volume <= 0) return false;
  if (config.effect === 'custom') {
    if (config.custom === undefined) return false;
    return playCustom(`${scope}:${event}`, config.custom, config.volume);
  }
  return playPreset(config.effect, config.volume);
}

/** Stop uploaded clips and release the shared AudioContext (plugin teardown). */
export function resetAudio(): void {
  for (const player of clips.values()) {
    try {
      player.pause();
    } catch {
      /* ignore */
    }
  }
  clips.clear();
  if (audio !== undefined) {
    try {
      audio.close();
    } catch {
      /* already closed */
    }
    audio = undefined;
  }
  unlocked = false;
}
