/**
 * Persisted per-event sound settings for the sound-notify plugin.
 *
 * Two scopes are distinguished:
 *   - `main`     the primary agent of a Session,
 *   - `subagent` a subagent-origin Session (row.subagent !== null).
 *
 * Inside each scope the plugin distinguishes four situations:
 *   - `done`      a turn finished,
 *   - `question`  the agent asks the user a normal question,
 *   - `approval`  the agent waits for an approval,
 *   - `plan`      the agent waits for a plan review.
 *
 * Each situation has its own effect, volume, and optional uploaded clip.
 * Subagent cues are off by default so enabling the plugin cannot spam the user
 * with child-Session churn; once enabled, all four situations are configurable
 * independently from the main agent.
 *
 * The whole document lives in localStorage; a small observable store keeps the
 * settings panel, the playback path, and the debug handle in sync.
 */

export const SETTINGS_KEY = 'dsh-sound-notify.settings';
/**
 * Settings documents written by earlier package names (`@smartcatai/...` in the
 * original plugin repo). Read once for migration; the new key is authoritative.
 */
export const LEGACY_SETTINGS_KEYS = ['@smartcatai/sound-notify.settings'] as const;
/**
 * Pre-feature keys that only stored the global on/off flag. Both historic
 * names are read once for migration and kept mirrored on save so an older
 * plugin instance still mounted in the same page stays in sync until reload.
 */
export const LEGACY_ENABLED_KEYS = [
  '@smartcatai/sound-notify.enabled',
  'dsh-plugin-sound-notify.enabled',
] as const;
/** First legacy key; kept for callers that only need the current name. */
export const LEGACY_ENABLED_KEY = LEGACY_ENABLED_KEYS[0];

export type EventKey = 'done' | 'question' | 'approval' | 'plan';

/** Which kind of agent the cue belongs to. */
export type CueScope = 'main' | 'subagent';

export type PresetId = 'chime' | 'beep' | 'soft' | 'drop' | 'marimba' | 'alert';
export type EffectId = PresetId | 'silent' | 'custom';

export interface CustomClip {
  /** Original file name, shown in the panel. */
  name: string;
  /** `data:audio/...;base64,...` payload. */
  dataUrl: string;
}

export interface EventSettings {
  effect: EffectId;
  /** 0 … 1; 0 is silent. */
  volume: number;
  /** Present only while `effect === 'custom'`. */
  custom?: CustomClip;
}

export interface SubagentSettings {
  /** Off by default; children are usually too chatty to cue. */
  enabled: boolean;
  events: Record<EventKey, EventSettings>;
}

export interface Settings {
  version: 2;
  /** Global master switch (the dock icon's mute state). */
  enabled: boolean;
  /** Main-agent cues. */
  events: Record<EventKey, EventSettings>;
  /** Subagent-origin Session cues. */
  subagent: SubagentSettings;
}

export const EVENT_ORDER: EventKey[] = ['done', 'question', 'approval', 'plan'];

export const EVENT_LABELS: Record<EventKey, { zh: string; en: string }> = {
  done: { zh: '任务完成', en: 'Turn finished' },
  question: { zh: '等待回答', en: 'Waiting for answer' },
  approval: { zh: '等待审批', en: 'Waiting for approval' },
  plan: { zh: '计划待审', en: 'Plan awaiting review' },
};

export const SCOPE_LABELS: Record<CueScope, { zh: string; en: string }> = {
  main: { zh: '主智能体', en: 'Main agent' },
  subagent: { zh: '子智能体', en: 'Subagent' },
};

/** Uploaded clips are capped so eight rows cannot exhaust the storage quota. */
export const MAX_CLIP_BYTES = 256 * 1024;

const PRESET_IDS: PresetId[] = ['chime', 'beep', 'soft', 'drop', 'marimba', 'alert'];
const EFFECT_IDS: EffectId[] = [...PRESET_IDS, 'silent', 'custom'];

function defaultEvents(): Record<EventKey, EventSettings> {
  return {
    done: { effect: 'chime', volume: 0.85 },
    question: { effect: 'beep', volume: 0.85 },
    approval: { effect: 'alert', volume: 0.9 },
    plan: { effect: 'soft', volume: 0.8 },
  };
}

/** Defaults: a rising chime for completion, distinct cues for attention. */
export function defaultSettings(): Settings {
  return {
    version: 2,
    enabled: true,
    events: defaultEvents(),
    subagent: { enabled: false, events: defaultEvents() },
  };
}

/** Default entry for one event/scope, used by the panel's "reset row" action. */
export function defaultEvent(event: EventKey, scope: CueScope = 'main'): EventSettings {
  return { ...defaultSettings()[scope === 'subagent' ? 'subagent' : 'events'].events[event] };
}

export function clampVolume(value: unknown, fallback: number): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(1, Math.max(0, numeric));
}

function normalizeEvent(raw: unknown, fallback: EventSettings): EventSettings {
  if (raw === null || typeof raw !== 'object') return fallback;
  const record = raw as Record<string, unknown>;
  const effect = EFFECT_IDS.includes(record.effect as EffectId) ? (record.effect as EffectId) : fallback.effect;
  const volume = clampVolume(record.volume, fallback.volume);
  const customRaw = record.custom;
  let custom: CustomClip | undefined;
  if (customRaw !== null && typeof customRaw === 'object') {
    const candidate = customRaw as Record<string, unknown>;
    if (
      typeof candidate.name === 'string' &&
      candidate.name.length > 0 &&
      typeof candidate.dataUrl === 'string' &&
      candidate.dataUrl.startsWith('data:audio/')
    ) {
      custom = { name: candidate.name, dataUrl: candidate.dataUrl };
    }
  }
  if (effect === 'custom' && custom === undefined) {
    return { effect: fallback.effect, volume };
  }
  return { effect, volume, ...(custom !== undefined ? { custom } : {}) };
}

function normalizeEvents(raw: unknown, fallback: Record<EventKey, EventSettings>): Record<EventKey, EventSettings> {
  const record = raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const events = {} as Record<EventKey, EventSettings>;
  for (const event of EVENT_ORDER) events[event] = normalizeEvent(record[event], fallback[event]);
  return events;
}

/** Repair any stored document (including a v1 one) into a complete v2 document. */
export function normalizeSettings(raw: unknown): Settings {
  const fallback = defaultSettings();
  if (raw === null || typeof raw !== 'object') return fallback;
  const record = raw as Record<string, unknown>;
  const subagentRaw = record.subagent !== null && typeof record.subagent === 'object' ? (record.subagent as Record<string, unknown>) : {};
  return {
    version: 2,
    enabled: record.enabled === undefined ? fallback.enabled : record.enabled !== false,
    // A v1 document has no `subagent` key: keep subagent cues off but seed its
    // rows with the defaults, so enabling later is immediately audible.
    events: normalizeEvents(record.events, fallback.events),
    subagent: {
      enabled: subagentRaw.enabled === true,
      events: normalizeEvents(subagentRaw.events, fallback.subagent.events),
    },
  };
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function browserStorage(): StorageLike | undefined {
  try {
    if (typeof localStorage === 'undefined') return undefined;
    return localStorage;
  } catch {
    return undefined;
  }
}

function readJson(storage: StorageLike, key: string): unknown {
  try {
    const text = storage.getItem(key);
    return text === null ? undefined : JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * Read settings, migrating documents and flags written by earlier package
 * names (`@smartcatai/sound-notify`, `dsh-plugin-sound-notify`) when needed.
 */
export function loadSettings(storage: StorageLike | undefined = browserStorage()): Settings {
  if (storage === undefined) return defaultSettings();
  const own = readJson(storage, SETTINGS_KEY);
  if (own !== undefined) return normalizeSettings(own);
  for (const key of LEGACY_SETTINGS_KEYS) {
    const legacyDocument = readJson(storage, key);
    if (legacyDocument !== undefined) return normalizeSettings(legacyDocument);
  }
  // Migrate the first pre-feature on/off flag that exists (newest name first).
  const legacy = (() => {
    for (const key of LEGACY_ENABLED_KEYS) {
      try {
        const value = storage.getItem(key);
        if (value !== null) return value;
      } catch {
        return null;
      }
    }
    return null;
  })();
  if (legacy === null) return defaultSettings();
  const migrated = defaultSettings();
  migrated.enabled = legacy !== 'off';
  return migrated;
}

export interface SaveResult {
  ok: boolean;
  error?: string;
}

/** Persist settings; quota/blocked-storage failures are reported, not thrown. */
export function saveSettings(settings: Settings, storage: StorageLike | undefined = browserStorage()): SaveResult {
  if (storage === undefined) return { ok: false, error: 'localStorage unavailable' };
  try {
    storage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export interface SettingsStore {
  get(): Settings;
  /** Replace the whole document, persist it, and notify subscribers. */
  set(next: Settings): SaveResult;
  /** Shallow-merge one event entry in one scope, persist, and notify. */
  updateEvent(event: EventKey, patch: Partial<EventSettings>, scope?: CueScope): SaveResult;
  /** Toggle the global on/off flag (the dock icon). */
  setEnabled(enabled: boolean): SaveResult;
  /** Toggle whether subagent-origin Sessions produce cues at all. */
  setSubagentEnabled(enabled: boolean): SaveResult;
  reset(): SaveResult;
  subscribe(listener: () => void): () => void;
  lastSave(): SaveResult;
}

/** One observable settings document shared by the panel, playback, and debug handle. */
export function createSettingsStore(storage: StorageLike | undefined = browserStorage()): SettingsStore {
  let current = loadSettings(storage);
  let lastSave: SaveResult = { ok: true };
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
        /* a broken subscriber must not stop playback or persistence */
      }
    }
  };
  const commit = (next: Settings): SaveResult => {
    current = normalizeSettings(next);
    lastSave = saveSettings(current, storage);
    // Mirror every legacy flag so older builds (or a stale instance still
    // mounted in the page until reload) keep the same mute state.
    for (const key of LEGACY_ENABLED_KEYS) {
      try {
        storage?.setItem(key, current.enabled ? 'on' : 'off');
      } catch {
        /* optional mirror */
      }
    }
    notify();
    return lastSave;
  };
  return {
    get: () => current,
    set: (next) => commit(next),
    updateEvent: (event, patch, scope = 'main') => {
      if (scope === 'subagent') {
        return commit({
          ...current,
          subagent: {
            ...current.subagent,
            events: { ...current.subagent.events, [event]: { ...current.subagent.events[event], ...patch } },
          },
        });
      }
      return commit({
        ...current,
        events: { ...current.events, [event]: { ...current.events[event], ...patch } },
      });
    },
    setEnabled: (enabled) => commit({ ...current, enabled }),
    setSubagentEnabled: (enabled) =>
      commit({ ...current, subagent: { ...current.subagent, enabled } }),
    reset: () => commit(defaultSettings()),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    lastSave: () => lastSave,
  };
}
