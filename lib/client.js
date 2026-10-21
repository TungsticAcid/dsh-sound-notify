window.__ModuleLoader__.load({
	id: "dsh-sound-notify",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(client_exports);

// src/client/settings.ts
var SETTINGS_KEY = "dsh-sound-notify.settings";
var LEGACY_SETTINGS_KEYS = ["@smartcatai/sound-notify.settings"];
var LEGACY_ENABLED_KEYS = [
  "@smartcatai/sound-notify.enabled",
  "dsh-plugin-sound-notify.enabled"
];
var LEGACY_ENABLED_KEY = LEGACY_ENABLED_KEYS[0];
var EVENT_ORDER = ["done", "question", "approval", "plan"];
var EVENT_LABELS = {
  done: { zh: "\u4EFB\u52A1\u5B8C\u6210", en: "Turn finished" },
  question: { zh: "\u7B49\u5F85\u56DE\u7B54", en: "Waiting for answer" },
  approval: { zh: "\u7B49\u5F85\u5BA1\u6279", en: "Waiting for approval" },
  plan: { zh: "\u8BA1\u5212\u5F85\u5BA1", en: "Plan awaiting review" }
};
var SCOPE_LABELS = {
  main: { zh: "\u4E3B\u667A\u80FD\u4F53", en: "Main agent" },
  subagent: { zh: "\u5B50\u667A\u80FD\u4F53", en: "Subagent" }
};
var MAX_CLIP_BYTES = 256 * 1024;
var PRESET_IDS = ["chime", "beep", "soft", "drop", "marimba", "alert"];
var EFFECT_IDS = [...PRESET_IDS, "silent", "custom"];
function defaultEvents() {
  return {
    done: { effect: "chime", volume: 0.85 },
    question: { effect: "beep", volume: 0.85 },
    approval: { effect: "alert", volume: 0.9 },
    plan: { effect: "soft", volume: 0.8 }
  };
}
function defaultSettings() {
  return {
    version: 2,
    enabled: true,
    events: defaultEvents(),
    subagent: { enabled: false, events: defaultEvents() }
  };
}
function defaultEvent(event, scope = "main") {
  return { ...defaultSettings()[scope === "subagent" ? "subagent" : "events"].events[event] };
}
function clampVolume(value, fallback) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(1, Math.max(0, numeric));
}
function normalizeEvent(raw, fallback) {
  if (raw === null || typeof raw !== "object") return fallback;
  const record = raw;
  const effect = EFFECT_IDS.includes(record.effect) ? record.effect : fallback.effect;
  const volume = clampVolume(record.volume, fallback.volume);
  const customRaw = record.custom;
  let custom;
  if (customRaw !== null && typeof customRaw === "object") {
    const candidate = customRaw;
    if (typeof candidate.name === "string" && candidate.name.length > 0 && typeof candidate.dataUrl === "string" && candidate.dataUrl.startsWith("data:audio/")) {
      custom = { name: candidate.name, dataUrl: candidate.dataUrl };
    }
  }
  if (effect === "custom" && custom === void 0) {
    return { effect: fallback.effect, volume };
  }
  return { effect, volume, ...custom !== void 0 ? { custom } : {} };
}
function normalizeEvents(raw, fallback) {
  const record = raw !== null && typeof raw === "object" ? raw : {};
  const events = {};
  for (const event of EVENT_ORDER) events[event] = normalizeEvent(record[event], fallback[event]);
  return events;
}
function normalizeSettings(raw) {
  const fallback = defaultSettings();
  if (raw === null || typeof raw !== "object") return fallback;
  const record = raw;
  const subagentRaw = record.subagent !== null && typeof record.subagent === "object" ? record.subagent : {};
  return {
    version: 2,
    enabled: record.enabled === void 0 ? fallback.enabled : record.enabled !== false,
    // A v1 document has no `subagent` key: keep subagent cues off but seed its
    // rows with the defaults, so enabling later is immediately audible.
    events: normalizeEvents(record.events, fallback.events),
    subagent: {
      enabled: subagentRaw.enabled === true,
      events: normalizeEvents(subagentRaw.events, fallback.subagent.events)
    }
  };
}
function browserStorage() {
  try {
    if (typeof localStorage === "undefined") return void 0;
    return localStorage;
  } catch {
    return void 0;
  }
}
function readJson(storage, key) {
  try {
    const text = storage.getItem(key);
    return text === null ? void 0 : JSON.parse(text);
  } catch {
    return void 0;
  }
}
function loadSettings(storage = browserStorage()) {
  if (storage === void 0) return defaultSettings();
  const own = readJson(storage, SETTINGS_KEY);
  if (own !== void 0) return normalizeSettings(own);
  for (const key of LEGACY_SETTINGS_KEYS) {
    const legacyDocument = readJson(storage, key);
    if (legacyDocument !== void 0) return normalizeSettings(legacyDocument);
  }
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
  migrated.enabled = legacy !== "off";
  return migrated;
}
function saveSettings(settings, storage = browserStorage()) {
  if (storage === void 0) return { ok: false, error: "localStorage unavailable" };
  try {
    storage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
function createSettingsStore(storage = browserStorage()) {
  let current = loadSettings(storage);
  let lastSave = { ok: true };
  const listeners = /* @__PURE__ */ new Set();
  const notify = () => {
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
      }
    }
  };
  const commit = (next) => {
    current = normalizeSettings(next);
    lastSave = saveSettings(current, storage);
    for (const key of LEGACY_ENABLED_KEYS) {
      try {
        storage?.setItem(key, current.enabled ? "on" : "off");
      } catch {
      }
    }
    notify();
    return lastSave;
  };
  return {
    get: () => current,
    set: (next) => commit(next),
    updateEvent: (event, patch, scope = "main") => {
      if (scope === "subagent") {
        return commit({
          ...current,
          subagent: {
            ...current.subagent,
            events: { ...current.subagent.events, [event]: { ...current.subagent.events[event], ...patch } }
          }
        });
      }
      return commit({
        ...current,
        events: { ...current.events, [event]: { ...current.events[event], ...patch } }
      });
    },
    setEnabled: (enabled) => commit({ ...current, enabled }),
    setSubagentEnabled: (enabled) => commit({ ...current, subagent: { ...current.subagent, enabled } }),
    reset: () => commit(defaultSettings()),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    lastSave: () => lastSave
  };
}

// src/client/effects.ts
var EFFECT_PRESETS = [
  {
    id: "chime",
    label: { zh: "\u6E05\u8106\u53CC\u97F3\uFF08\u4E0A\u884C\uFF09", en: "Rising chime" },
    tones: [
      { at: 0, freq: 987.77, duration: 0.2, gain: 0.13 },
      { at: 0.11, freq: 1318.51, duration: 0.36, gain: 0.11 },
      { at: 0.11, freq: 493.88, duration: 0.32, gain: 0.05, type: "triangle" }
    ]
  },
  {
    id: "beep",
    label: { zh: "\u53CC\u53EE\uFF08\u63D0\u9192\uFF09", en: "Double beep" },
    tones: [
      { at: 0, freq: 987.77, duration: 0.1, gain: 0.12 },
      { at: 0.16, freq: 987.77, duration: 0.12, gain: 0.12 }
    ]
  },
  {
    id: "soft",
    label: { zh: "\u67D4\u548C\u4E09\u97F3", en: "Soft arpeggio" },
    tones: [
      { at: 0, freq: 523.25, duration: 0.18, gain: 0.09 },
      { at: 0.12, freq: 659.25, duration: 0.22, gain: 0.08 },
      { at: 0.24, freq: 783.99, duration: 0.3, gain: 0.07 }
    ]
  },
  {
    id: "drop",
    label: { zh: "\u6C34\u6EF4\u4E0B\u6ED1", en: "Water drop" },
    tones: [{ at: 0, freq: 1200, endFreq: 360, duration: 0.22, gain: 0.12 }]
  },
  {
    id: "marimba",
    label: { zh: "\u6728\u7434\u4E09\u8FDE", en: "Marimba triad" },
    tones: [
      { at: 0, freq: 523.25, duration: 0.22, gain: 0.12, type: "triangle" },
      { at: 0.12, freq: 783.99, duration: 0.18, gain: 0.1, type: "triangle" },
      { at: 0.22, freq: 1046.5, duration: 0.2, gain: 0.07, type: "triangle" }
    ]
  },
  {
    id: "alert",
    label: { zh: "\u8B66\u793A\u4E09\u8FDE", en: "Alert trill" },
    tones: [
      { at: 0, freq: 880, duration: 0.08, gain: 0.08, type: "square" },
      { at: 0.14, freq: 660, duration: 0.08, gain: 0.08, type: "square" },
      { at: 0.28, freq: 880, duration: 0.1, gain: 0.08, type: "square" }
    ]
  }
];
var EFFECT_LABELS = Object.fromEntries([
  ...EFFECT_PRESETS.map((preset) => [preset.id, preset.label.zh]),
  ["silent", "\u65E0\uFF08\u9759\u97F3\uFF09"],
  ["custom", "\u81EA\u5B9A\u4E49\u97F3\u9891"]
]);
var audio;
var unlocked = false;
function ensureAudio() {
  if (audio !== void 0) {
    if (audio.state === "suspended") audio.resume().catch(() => {
    });
    return audio;
  }
  if (typeof window === "undefined") return void 0;
  const Ctor = window.AudioContext ?? window.webkitAudioContext;
  if (Ctor === void 0) return void 0;
  try {
    audio = new Ctor();
  } catch {
    return void 0;
  }
  return audio;
}
function unlockAudio() {
  const ctx = ensureAudio();
  if (ctx === void 0) return;
  if (ctx.state === "running") {
    unlocked = true;
    return;
  }
  ctx.resume().then(
    () => {
      unlocked = true;
    },
    () => {
    }
  );
}
function primeAudio() {
  const ctx = ensureAudio();
  if (ctx !== void 0 && ctx.state === "running") unlocked = true;
}
function playNote(ctx, tone, volume) {
  const start = ctx.currentTime + tone.at;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  const peak = Math.max(2e-4, tone.gain * volume);
  osc.type = tone.type ?? "sine";
  osc.frequency.setValueAtTime(tone.freq, start);
  if (tone.endFreq !== void 0) osc.frequency.exponentialRampToValueAtTime(tone.endFreq, start + tone.duration);
  amp.gain.setValueAtTime(1e-4, start);
  amp.gain.exponentialRampToValueAtTime(peak, start + 0.012);
  amp.gain.exponentialRampToValueAtTime(1e-4, start + tone.duration);
  osc.connect(amp);
  amp.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + tone.duration + 0.03);
}
function presetById(id) {
  return EFFECT_PRESETS.find((preset) => preset.id === id);
}
function playPreset(id, volume) {
  const preset = presetById(id);
  if (preset === void 0) return false;
  const ctx = ensureAudio();
  if (ctx === void 0 || !unlocked) return false;
  const level = clampVolume(volume, 1);
  if (level <= 0) return false;
  for (const tone of preset.tones) playNote(ctx, tone, level);
  return true;
}
var clips = /* @__PURE__ */ new Map();
function playCustom(clipKey, clip, volume) {
  if (typeof Audio === "undefined") return false;
  const level = clampVolume(volume, 1);
  if (level <= 0) return false;
  const existing = clips.get(clipKey);
  const player = existing !== void 0 && existing.src === clip.dataUrl ? existing : new Audio(clip.dataUrl);
  if (existing !== player) {
    if (existing !== void 0) existing.pause();
    clips.set(clipKey, player);
  }
  try {
    player.pause();
    player.currentTime = 0;
    player.volume = level;
    const result = player.play();
    if (result !== void 0 && typeof result.catch === "function") result.catch(() => {
    });
    return true;
  } catch {
    return false;
  }
}
function playEvent(event, settings, scope = "main", options = {}) {
  if (!options.preview) {
    if (!settings.enabled) return false;
    if (scope === "subagent" && !settings.subagent.enabled) return false;
  }
  const config = scope === "subagent" ? settings.subagent.events[event] : settings.events[event];
  if (config === void 0) return false;
  if (config.effect === "silent" || config.volume <= 0) return false;
  if (config.effect === "custom") {
    if (config.custom === void 0) return false;
    return playCustom(`${scope}:${event}`, config.custom, config.volume);
  }
  return playPreset(config.effect, config.volume);
}
function resetAudio() {
  for (const player of clips.values()) {
    try {
      player.pause();
    } catch {
    }
  }
  clips.clear();
  if (audio !== void 0) {
    try {
      audio.close();
    } catch {
    }
    audio = void 0;
  }
  unlocked = false;
}

// src/client/ui.ts
var React = __toESM(require("react"), 1);
var h = React.createElement;
var PANEL_STYLE = {
  position: "fixed",
  inset: "auto 20px 70px auto",
  margin: 0,
  padding: "14px 16px 12px",
  width: 372,
  maxHeight: "74vh",
  overflow: "auto",
  border: "1px solid var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.35))",
  borderRadius: 12,
  background: "var(--dsw-alias-bg-module-platform, #ffffff)",
  color: "var(--dsw-alias-label-primary, #1f2329)",
  boxShadow: "0 16px 40px rgba(0, 0, 0, 0.28)",
  font: "inherit",
  fontSize: 13,
  lineHeight: 1.45
};
var ROW_STYLE = {
  padding: "8px 0",
  borderTop: "1px solid var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.2))"
};
var SMALL_BUTTON = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  height: 24,
  minWidth: 24,
  padding: "0 8px",
  border: "1px solid var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.35))",
  borderRadius: 6,
  background: "transparent",
  color: "inherit",
  cursor: "pointer",
  fontSize: 12,
  lineHeight: 1
};
var MUTED_TEXT = { color: "var(--dsw-alias-label-secondary, #7a8190)" };
function SpeakerGlyph({ muted }) {
  const stroked = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.3,
    strokeLinecap: "round"
  };
  const waves = muted ? h("path", { d: "M10.6 6.2l3.3 3.3M13.9 6.2l-3.3 3.3", ...stroked }) : h("path", { d: "M10.7 5.7a3.3 3.3 0 0 1 0 4.6M12.6 4.4a5.2 5.2 0 0 1 0 7.2", ...stroked });
  return h(
    "svg",
    { width: 14, height: 14, viewBox: "0 0 16 16", "aria-hidden": true, style: { display: "block" } },
    h("path", { d: "M3 6.4h2.3L8.5 3.8v8.4L5.3 9.6H3z", fill: "currentColor" }),
    waves
  );
}
function PreviewGlyph() {
  return h(
    "svg",
    { width: 12, height: 12, viewBox: "0 0 16 16", "aria-hidden": true, style: { display: "block" } },
    h("path", { d: "M4.5 3.2v9.6L12.8 8z", fill: "currentColor" })
  );
}
function createSoundControl(store, options = {}) {
  function useSettings() {
    const [settings, setSettings] = React.useState(store.get);
    React.useEffect(() => {
      setSettings(store.get());
      return store.subscribe(() => setSettings(store.get()));
    }, []);
    return settings;
  }
  function readClip(event, file, onDone) {
    if (file.size > MAX_CLIP_BYTES) {
      onDone(void 0, `\u6587\u4EF6\u592A\u5927\uFF08\u4E0A\u9650 ${Math.round(MAX_CLIP_BYTES / 1024)} KB\uFF09`);
      return;
    }
    if (typeof FileReader === "undefined") {
      onDone(void 0, "\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301\u8BFB\u53D6\u672C\u5730\u6587\u4EF6");
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => onDone(void 0, "\u8BFB\u53D6\u97F3\u9891\u6587\u4EF6\u5931\u8D25");
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      if (!dataUrl.startsWith("data:audio/")) {
        onDone(void 0, "\u6240\u9009\u6587\u4EF6\u4E0D\u662F\u6D4F\u89C8\u5668\u53EF\u64AD\u653E\u7684\u97F3\u9891");
        return;
      }
      onDone({ effect: "custom", custom: { name: file.name, dataUrl } });
    };
    reader.readAsDataURL(file);
  }
  const errorKey = (scope, event) => `${scope}:${event}`;
  function pickFile(event, scope) {
    try {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "audio/*";
      input.style.display = "none";
      input.onchange = () => {
        const file = input.files?.[0];
        if (file === void 0) return;
        readClip(event, file, (patch, error) => {
          const key = errorKey(scope, event);
          if (error !== void 0) {
            errors.set(key, error);
            return;
          }
          errors.set(key, void 0);
          if (patch !== void 0) {
            store.updateEvent(event, patch, scope);
            playEvent(event, store.get(), scope, { preview: true });
          }
        });
        errors.render();
      };
      document.body.appendChild(input);
      input.click();
      setTimeout(() => input.remove(), 0);
    } catch {
    }
  }
  const errors = /* @__PURE__ */ (() => {
    let listeners = [];
    const values = /* @__PURE__ */ new Map();
    return {
      get: (key) => values.get(key),
      set: (key, message) => {
        values.set(key, message);
      },
      subscribe: (listener) => {
        listeners = [...listeners, listener];
        return () => {
          listeners = listeners.filter((entry) => entry !== listener);
        };
      },
      render: () => {
        for (const listener of listeners) listener();
      }
    };
  })();
  function EffectRow({ event, scope }) {
    const settings = useSettings();
    const [, forceRender] = React.useState(0);
    React.useEffect(() => errors.subscribe(() => forceRender((value) => value + 1)), []);
    const config = scope === "subagent" ? settings.subagent.events[event] : settings.events[event];
    const error = errors.get(errorKey(scope, event));
    const label = EVENT_LABELS[event];
    const isCustom = config.effect === "custom" && config.custom !== void 0;
    const options2 = [
      ...EFFECT_PRESETS.map((preset) => ({
        value: preset.id,
        label: `${preset.label.zh} / ${preset.label.en}`
      })),
      { value: "silent", label: "\u65E0\uFF08\u9759\u97F3\uFF09 / Silent" },
      ...isCustom ? [{ value: "custom", label: `\u81EA\u5B9A\u4E49\u97F3\u9891 / ${config.custom.name}` }] : []
    ];
    const preview = () => playEvent(event, store.get(), scope, { preview: true });
    const setVolume = (value) => {
      store.updateEvent(event, { volume: Math.min(1, Math.max(0, value / 100)) }, scope);
    };
    return h(
      "div",
      { style: ROW_STYLE, "data-sound-event": event, "data-sound-scope": scope },
      h(
        "div",
        { style: { display: "flex", alignItems: "center", gap: 8 } },
        h("span", { style: { minWidth: 68, fontWeight: 500 } }, label.zh),
        h(
          "select",
          {
            value: config.effect,
            "aria-label": `${SCOPE_LABELS[scope].zh}${label.zh}\u97F3\u6548`,
            onChange: (changeEvent) => {
              const next = changeEvent.target.value;
              store.updateEvent(event, { effect: next }, scope);
              if (next !== "silent") playEvent(event, store.get(), scope, { preview: true });
            },
            style: {
              flex: 1,
              minWidth: 0,
              height: 26,
              borderRadius: 6,
              border: "1px solid var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.35))",
              background: "transparent",
              color: "inherit",
              font: "inherit",
              fontSize: 12
            }
          },
          ...options2.map((option) => h("option", { key: option.value, value: option.value }, option.label))
        ),
        h(
          "button",
          {
            type: "button",
            title: "\u8BD5\u542C / Preview",
            "aria-label": `\u8BD5\u542C${SCOPE_LABELS[scope].zh}${label.zh}`,
            style: SMALL_BUTTON,
            onClick: preview
          },
          h(PreviewGlyph)
        )
      ),
      h(
        "div",
        { style: { display: "flex", alignItems: "center", gap: 8, marginTop: 6 } },
        h(
          "input",
          {
            type: "range",
            min: 0,
            max: 100,
            step: 5,
            value: Math.round(config.volume * 100),
            "aria-label": `${SCOPE_LABELS[scope].zh}${label.zh}\u97F3\u91CF`,
            onChange: (changeEvent) => setVolume(Number(changeEvent.target.value)),
            onPointerUp: preview,
            style: { flex: 1, accentColor: "var(--dsw-alias-brand-primary, #247bbf)" }
          }
        ),
        h("span", { style: { minWidth: 38, textAlign: "right", ...MUTED_TEXT } }, `${Math.round(config.volume * 100)}%`)
      ),
      h(
        "div",
        { style: { display: "flex", alignItems: "center", gap: 8, marginTop: 6 } },
        h(
          "button",
          { type: "button", style: SMALL_BUTTON, onClick: () => pickFile(event, scope) },
          isCustom ? "\u66F4\u6362\u97F3\u9891\u2026 / Replace\u2026" : "\u81EA\u5B9A\u4E49\u97F3\u9891\u2026 / Choose file\u2026"
        ),
        isCustom ? h(
          "span",
          { style: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", ...MUTED_TEXT } },
          config.custom.name
        ) : h("span", { style: { ...MUTED_TEXT } }, `\u2264 ${Math.round(MAX_CLIP_BYTES / 1024)} KB`),
        h(
          "button",
          {
            type: "button",
            style: SMALL_BUTTON,
            title: "\u6062\u590D\u672C\u884C\u9ED8\u8BA4 / Reset row",
            onClick: () => store.updateEvent(event, { ...defaultEvent(event, scope), custom: void 0 }, scope)
          },
          "\u91CD\u7F6E"
        )
      ),
      error !== void 0 ? h("div", { style: { marginTop: 4, color: "#d9534f" } }, error) : null
    );
  }
  function SoundPanel({ onClose }) {
    const settings = useSettings();
    const [saveError, setSaveError] = React.useState(void 0);
    const dialogRef = React.useRef(null);
    React.useEffect(() => {
      const dialog = dialogRef.current;
      if (dialog === null) return void 0;
      try {
        if (typeof dialog.showModal === "function" && !dialog.open) dialog.showModal();
        else dialog.setAttribute("open", "");
      } catch {
      }
      options.onPanelOpened?.();
      return () => {
        try {
          if (typeof dialog.close === "function") dialog.close();
        } catch {
        }
      };
    }, []);
    const apply2 = (result) => {
      setSaveError(result.ok ? void 0 : `\u4FDD\u5B58\u5931\u8D25\uFF1A${result.error ?? "\u672C\u5730\u5B58\u50A8\u4E0D\u53EF\u7528"}`);
    };
    const toggleMaster = (enabled) => apply2(store.setEnabled(enabled));
    const reset = () => apply2(store.set(defaultSettings()));
    return h(
      "dialog",
      {
        ref: dialogRef,
        className: "dsh-sound-notify-panel",
        "aria-label": "\u63D0\u793A\u97F3\u8BBE\u7F6E / Notification sounds",
        style: PANEL_STYLE,
        onCancel: (cancelEvent) => {
          cancelEvent.preventDefault();
          onClose();
        },
        onClick: (clickEvent) => {
          if (clickEvent.target === dialogRef.current) onClose();
        }
      },
      h(
        "style",
        null,
        ".dsh-sound-notify-panel::backdrop{background:rgba(15,20,28,0.18);}"
      ),
      h(
        "div",
        { style: { display: "flex", alignItems: "center", gap: 8 } },
        h("strong", { style: { flex: 1, fontSize: 14 } }, "\u63D0\u793A\u97F3\u8BBE\u7F6E / Notification sounds"),
        h(
          "button",
          { type: "button", style: SMALL_BUTTON, "aria-label": "\u5173\u95ED", onClick: onClose },
          "\u2715"
        )
      ),
      h(
        "label",
        { style: { display: "flex", alignItems: "center", gap: 8, margin: "10px 0 4px", cursor: "pointer" } },
        h("input", {
          type: "checkbox",
          checked: settings.enabled,
          onChange: (changeEvent) => toggleMaster(changeEvent.target.checked === true)
        }),
        h("span", null, "\u542F\u7528\u63D0\u793A\u97F3 / Enable sounds"),
        h("span", { style: { marginLeft: "auto", ...MUTED_TEXT } }, "alt+\u70B9\u51FB\u56FE\u6807\u53EF\u5FEB\u901F\u9759\u97F3")
      ),
      h(
        "div",
        { style: { marginTop: 6, paddingTop: 8, borderTop: "1px solid var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.2))" } },
        h("span", { style: { fontWeight: 600, fontSize: 12 } }, "\u4E3B\u667A\u80FD\u4F53 / Main agent")
      ),
      ...EVENT_ORDER.map((event) => h(EffectRow, { key: `main:${event}`, event, scope: "main" })),
      h(
        "div",
        { style: { marginTop: 10, paddingTop: 8, borderTop: "1px solid var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.2))" } },
        h(
          "label",
          { style: { display: "flex", alignItems: "center", gap: 8, cursor: "pointer" } },
          h("input", {
            type: "checkbox",
            checked: settings.subagent.enabled,
            onChange: (changeEvent) => apply2(store.setSubagentEnabled(changeEvent.target.checked === true))
          }),
          h("span", { style: { fontWeight: 600 } }, "\u5B50\u667A\u80FD\u4F53 / Subagent"),
          h(
            "span",
            { style: { marginLeft: "auto", ...MUTED_TEXT } },
            settings.subagent.enabled ? "\u5DF2\u542F\u7528\u72EC\u7ACB\u63D0\u793A\u97F3" : "\u9ED8\u8BA4\u5173\u95ED"
          )
        ),
        settings.subagent.enabled ? h(
          "div",
          null,
          h(
            "div",
            { style: { ...MUTED_TEXT, fontSize: 11, margin: "4px 0" } },
            "\u5B50\u4F1A\u8BDD\uFF08subagent\uFF09\u5B8C\u6210 / \u63D0\u95EE / \u5BA1\u6279 / \u8BA1\u5212\u5F85\u5BA1\u65F6\u4F7F\u7528\u4E0B\u9762\u8FD9\u7EC4\u72EC\u7ACB\u914D\u7F6E\u3002"
          ),
          ...EVENT_ORDER.map((event) => h(EffectRow, { key: `subagent:${event}`, event, scope: "subagent" }))
        ) : h(
          "div",
          { style: { ...MUTED_TEXT, fontSize: 11, margin: "4px 0" } },
          "\u5B50\u4F1A\u8BDD\u7684\u72B6\u6001\u53D8\u5316\u9ED8\u8BA4\u4E0D\u53D1\u58F0\uFF1B\u52FE\u9009\u540E\u56DB\u7C7B\u60C5\u51B5\u53EF\u5355\u72EC\u8BBE\u7F6E\u97F3\u6548\u4E0E\u97F3\u91CF\u3002"
        )
      ),
      h(
        "div",
        { style: { display: "flex", alignItems: "center", gap: 8, marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.2))" } },
        h("button", { type: "button", style: SMALL_BUTTON, onClick: reset }, "\u6062\u590D\u9ED8\u8BA4 / Reset all"),
        h(
          "span",
          { style: { marginLeft: "auto", fontSize: 11, ...MUTED_TEXT } },
          saveError ?? "\u8BBE\u7F6E\u4FDD\u5B58\u5728\u672C\u673A\u6D4F\u89C8\u5668\u5B58\u50A8\u4E2D"
        )
      )
    );
  }
  return function SoundButton() {
    const settings = useSettings();
    const [open, setOpen] = React.useState(false);
    const label = settings.enabled ? "\u63D0\u793A\u97F3\uFF1A\u5DF2\u5F00\u542F\uFF0C\u70B9\u51FB\u8BBE\u7F6E / Notification sounds on, click to configure" : "\u63D0\u793A\u97F3\uFF1A\u5DF2\u9759\u97F3\uFF0C\u70B9\u51FB\u8BBE\u7F6E / Notification sounds muted, click to configure";
    return h(
      "span",
      { style: { display: "inline-flex", alignItems: "center", flex: "none" } },
      h(
        "button",
        {
          type: "button",
          "data-composer-stat": "sound-notify",
          title: label,
          "aria-label": label,
          "aria-expanded": open,
          onClick: (clickEvent) => {
            if (clickEvent.altKey === true) {
              store.setEnabled(!store.get().enabled);
              return;
            }
            setOpen((value) => !value);
          },
          style: {
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 24,
            height: 24,
            padding: 0,
            border: "none",
            borderRadius: 6,
            background: "transparent",
            color: settings.enabled ? "var(--dsw-alias-label-secondary, #7a8190)" : "var(--dsw-alias-label-tertiary, #a0a6b1)",
            cursor: "pointer",
            opacity: settings.enabled ? 1 : 0.6,
            flex: "none"
          }
        },
        h(SpeakerGlyph, { muted: !settings.enabled })
      ),
      open ? h(SoundPanel, { onClose: () => setOpen(false) }) : null
    );
  };
}

// src/client/index.ts
var DEDUPE_MS = 700;
function eventOfPendingKind(kind) {
  switch (kind) {
    case "approval":
      return "approval";
    case "plan-review":
      return "plan";
    case "question":
      return "question";
    default:
      return "question";
  }
}
var inject = ["uiSession", "sessions", "slots"];
function apply(ctx) {
  const store = createSettingsStore();
  const lastCue = /* @__PURE__ */ new Map();
  const cue = (scope, event) => {
    const key = `${scope}:${event}`;
    const now = Date.now();
    const previous = lastCue.get(key);
    if (previous !== void 0 && now - previous < DEDUPE_MS) return;
    lastCue.set(key, now);
    playEvent(event, store.get(), scope);
  };
  ctx.effect(
    () => {
      primeAudio();
      const status = ctx.uiSession.sessionStatus;
      let previous = status.getSnapshot();
      const unsubscribe = status.subscribe(() => {
        const next = status.getSnapshot();
        const byId = ctx.sessions.list.getSnapshot().byId ?? {};
        let finishedMain = false;
        let finishedSubagent = false;
        const pendingMain = /* @__PURE__ */ new Set();
        const pendingSubagent = /* @__PURE__ */ new Set();
        for (const [sessionId, current] of next) {
          if (current === void 0) continue;
          const row = byId[sessionId];
          if (row === void 0) continue;
          const scope = row.subagent != null ? "subagent" : "main";
          const prior = previous.get(sessionId);
          const pendingNow = current.pendingInteraction !== void 0;
          const pendingBefore = prior !== void 0 && prior.pendingInteraction !== void 0;
          if (pendingNow && !pendingBefore) {
            const event = eventOfPendingKind(current.pendingInteraction.kind);
            (scope === "subagent" ? pendingSubagent : pendingMain).add(event);
          } else if (prior !== void 0 && prior.running === true && current.running === false) {
            if (scope === "subagent") finishedSubagent = true;
            else finishedMain = true;
          }
        }
        previous = next;
        const hasPending = pendingMain.size > 0 || pendingSubagent.size > 0;
        for (const event of EVENT_ORDER) if (pendingMain.has(event)) cue("main", event);
        for (const event of EVENT_ORDER) if (pendingSubagent.has(event)) cue("subagent", event);
        if (!hasPending) {
          if (finishedMain) cue("main", "done");
          if (finishedSubagent) cue("subagent", "done");
        }
      });
      const unlock = () => unlockAudio();
      window.addEventListener("pointerdown", unlock, true);
      window.addEventListener("keydown", unlock, true);
      return () => {
        unsubscribe();
        window.removeEventListener("pointerdown", unlock, true);
        window.removeEventListener("keydown", unlock, true);
        lastCue.clear();
        resetAudio();
      };
    },
    "sound-notify: Session status cues"
  );
  const SoundButton = createSoundControl(store);
  const DOCK_SLOT = "conversation.composer.dock";
  ctx.slots.inject(DOCK_SLOT, () => {
    let lastError;
    for (const priority of [-1, -2, -5, -10]) {
      try {
        return ctx.slots.register({ name: DOCK_SLOT, id: "sound-notify", order: 900, priority }, SoundButton);
      } catch (error) {
        lastError = error;
      }
    }
    console.warn("[sound-notify] dock entry already owned by a stale instance; reload to update it", lastError);
    return () => {
    };
  });
  ctx.effect(
    () => {
      window.__dshSoundNotify = {
        play: (event, scope = "main") => playEvent(event, store.get(), scope),
        preview: (event, scope = "main") => playEvent(event, store.get(), scope, { preview: true }),
        unlock: unlockAudio,
        getSettings: () => store.get(),
        setSettings: (next) => store.set(next),
        setEnabled: (enabled) => store.setEnabled(enabled),
        setSubagentEnabled: (enabled) => store.setSubagentEnabled(enabled),
        reset: () => store.reset(),
        effects: EFFECT_PRESETS.map((preset) => preset.id)
      };
      return () => {
        delete window.__dshSoundNotify;
      };
    },
    "sound-notify: page handle"
  );
}

		return module.exports;
	},
});
