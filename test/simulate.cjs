/**
 * Offline simulation of the sound-notify Client module.
 *
 * Runs the built `lib/client.js` in a vm sandbox with fake module loader,
 * React, Web Audio, HTMLAudioElement, localStorage, and a fake uiSession
 * service, then drives Session status transitions the way the real Client
 * would. Covers: module contract, per-situation cue selection, per-situation
 * volume scaling, effect presets, uploaded clips, mute/preview semantics,
 * dedupe, subagent filtering, settings persistence and legacy migration, slot
 * registration, and the rendered settings panel structure.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const clientFile = path.join(__dirname, '..', 'lib', 'client.js');
const code = fs.readFileSync(clientFile, 'utf8');

// ---- Web Audio / media fakes -------------------------------------------

/** Every scheduled oscillator; its paired gain record holds the peak ramps. */
const oscillators = [];
const gains = [];

class FakeAudioContext {
  constructor() {
    this.state = 'running';
    this.currentTime = 0;
    this.destination = {};
  }
  resume() {
    this.state = 'running';
    return Promise.resolve();
  }
  close() {
    this.state = 'closed';
  }
  createOscillator() {
    const record = {
      type: 'sine',
      frequencyValues: [],
      ramps: [],
      frequency: {
        setValueAtTime(value) {
          record.frequencyValues.push(value);
        },
        exponentialRampToValueAtTime(value) {
          record.ramps.push(value);
        },
      },
      connect() {},
      start() {},
      stop() {},
    };
    oscillators.push(record);
    return record;
  }
  createGain() {
    const record = { peaks: [] };
    gains.push(record);
    return {
      gain: {
        setValueAtTime() {},
        exponentialRampToValueAtTime(value) {
          if (value > 0.0002) record.peaks.push(value);
        },
      },
      connect() {},
    };
  }
}

/** Stand-in for HTMLAudioElement: records creations, volumes, and play() calls. */
class FakeAudio {
  static instances = [];
  static plays = 0;
  constructor(src) {
    this.src = src;
    this.volume = 1;
    this.currentTime = 0;
    this.paused = true;
    FakeAudio.instances.push(this);
  }
  pause() {
    this.paused = true;
  }
  play() {
    this.paused = false;
    FakeAudio.plays += 1;
    return Promise.resolve();
  }
}

// ---- shared host state -------------------------------------------------

let clock = 1_000_000;
const storage = new Map();
const localStorage = {
  getItem: (key) => (storage.has(key) ? storage.get(key) : null),
  get: (key) => storage.get(key),
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
};

const statusListeners = new Set();
let statusSnapshot = new Map();
const status = {
  getSnapshot: () => statusSnapshot,
  subscribe: (listener) => {
    statusListeners.add(listener);
    return () => statusListeners.delete(listener);
  },
};
let sessionRows = {};

const slotRegistrations = [];
const disposers = [];

const windowObject = {
  AudioContext: FakeAudioContext,
  addEventListener() {},
  removeEventListener() {},
  __ModuleLoader__: {
    load(definition) {
      windowObject.__definition = definition;
    },
  },
};

function fakeReact(options = {}) {
  const forceOpen = options.forceOpen === true;
  return {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat() }),
    useState: (initial) => {
      const value = typeof initial === 'function' ? initial() : initial;
      if (forceOpen && value === false) return [true, () => {}];
      return [value, () => {}];
    },
    useEffect: () => undefined,
    useRef: (initial) => ({ current: initial ?? null }),
    useCallback: (callback) => callback,
    useMemo: (factory) => factory(),
    Fragment: Symbol('Fragment'),
  };
}

/** Load the bundle into a fresh vm context and return its plugin + page handle. */
function loadPlugin({ forceOpen = false, storageOverride = localStorage } = {}) {
  const sandbox = {
    window: windowObject,
    localStorage: storageOverride,
    Audio: FakeAudio,
    Date: { now: () => clock },
    console,
    setTimeout,
    clearTimeout,
    document: {
      body: { appendChild() {} },
      createElement: () => ({ style: {}, files: [], click() {}, remove() {}, setAttribute() {} }),
    },
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(code, sandbox, { filename: 'client.js' });
  const definition = windowObject.__definition;
  assert.ok(definition, 'module factory must be registered through window.__ModuleLoader__');
  const plugin = definition.factory((id) => {
    assert.equal(id, 'react', `unexpected module request: ${id}`);
    return fakeReact({ forceOpen });
  });
  return { definition, plugin };
}

/** Fresh Cordis-like context wired to the shared status store and slot registry. */
function makeCtx() {
  return {
    uiSession: { sessionStatus: status },
    sessions: {
      list: { getSnapshot: () => ({ byId: sessionRows, ids: Object.keys(sessionRows), phase: 'ready' }) },
    },
    slots: {
      inject: (ownerKey, callback) => {
        callback();
        return () => {};
      },
      register: (options, component) => {
        slotRegistrations.push({ options, component });
        return () => {};
      },
    },
    effect: (callback, label) => {
      const disposer = callback();
      disposers.push({ label, disposer });
      return disposer;
    },
  };
}

/** Publish one status snapshot like the Client store does. */
function publish(next) {
  statusSnapshot = next;
  for (const listener of [...statusListeners]) listener();
}

const base = (overrides = {}) => ({
  running: undefined,
  pendingInteraction: undefined,
  completionUnread: false,
  ...overrides,
});

/** Publish a status change and advance the fake clock so dedupe windows never overlap. */
function tick(next) {
  clock += 1000;
  publish(next);
}

// ---- load and initial shape -------------------------------------------

const loaded = loadPlugin();
assert.equal(loaded.definition.id, 'dsh-sound-notify');
loaded.plugin.apply(makeCtx());

const handle = windowObject.__dshSoundNotify;
assert.ok(handle, 'page handle must be exposed for debugging');

assert.deepEqual(
  slotRegistrations.map((entry) => entry.options.id),
  ['sound-notify'],
  'settings entry must register in the composer dock',
);
assert.equal(slotRegistrations[0].options.name, 'conversation.composer.dock');
assert.equal(typeof slotRegistrations[0].component, 'function');
assert.equal(
  slotRegistrations[0].options.priority,
  -1,
  'dock entry registers at a lower priority so it shadows a stale live registration',
);
assert.equal(slotRegistrations[0].options.order, 900);

const defaults = handle.getSettings();
assert.equal(defaults.version, 2);
assert.equal(defaults.enabled, true);
assert.deepEqual(Object.keys(defaults.events).sort(), ['approval', 'done', 'plan', 'question']);
assert.equal(defaults.events.done.effect, 'chime');
assert.equal(defaults.events.question.effect, 'beep');
assert.equal(defaults.events.approval.effect, 'alert');
assert.equal(defaults.events.plan.effect, 'soft');
assert.equal(defaults.subagent.enabled, false, 'subagent cues are off by default');
assert.equal(defaults.subagent.events.done.effect, 'chime', 'subagent rows are seeded with defaults');

// ---- cue selection per situation --------------------------------------

sessionRows = { s1: { id: 's1', running: true, subagent: null } };
tick(new Map([['s1', base({ running: true })]]));
assert.equal(oscillators.length, 0, 'baseline must not beep');

tick(new Map([['s1', base({ running: false, completionUnread: true })]]));
assert.equal(oscillators.length, 3, 'done plays the chime preset (3 notes)');

tick(new Map([['s1', base({ running: false, pendingInteraction: { kind: 'question' } })]]));
assert.equal(oscillators.length, 5, 'question plays the beep preset (2 notes)');
tick(new Map([['s1', base({ running: false })]])); // pending resolved

tick(new Map([['s1', base({ running: false, pendingInteraction: { kind: 'approval' } })]]));
assert.equal(oscillators.length, 8, 'approval plays the alert preset (3 notes)');
tick(new Map([['s1', base({ running: false })]]));

tick(new Map([['s1', base({ running: false, pendingInteraction: { kind: 'plan-review' } })]]));
assert.equal(oscillators.length, 11, 'plan review plays the soft preset (3 notes)');
tick(new Map([['s1', base({ running: false })]]));

tick(new Map([['s1', base({ running: false, pendingInteraction: { kind: 'something-new' } })]]));
assert.equal(oscillators.length, 13, 'unknown pending kinds fall back to the question cue');
tick(new Map([['s1', base({ running: false })]]));

// ---- per-situation volume scaling -------------------------------------

handle.setSettings({
  ...handle.getSettings(),
  events: { ...handle.getSettings().events, done: { effect: 'beep', volume: 0.4 } },
});
tick(new Map([['s1', base({ running: true })]]));
tick(new Map([['s1', base({ running: false, completionUnread: true })]]));
const lastPeaks = gains.slice(-2).map((gain) => gain.peaks[0]);
assert.deepEqual(
  lastPeaks.map((peak) => Number(peak.toFixed(4))),
  [0.048, 0.048],
  'per-situation volume must scale the synthesized gain',
);

// ---- selectable effect changes the waveform ---------------------------

handle.setSettings({
  ...handle.getSettings(),
  events: { ...handle.getSettings().events, done: { effect: 'drop', volume: 1 } },
});
tick(new Map([['s1', base({ running: true })]]));
tick(new Map([['s1', base({ running: false, completionUnread: true })]]));
const dropTone = oscillators.at(-1);
assert.equal(dropTone.frequencyValues[0], 1200, 'drop preset starts at its configured frequency');
assert.deepEqual(dropTone.ramps, [360], 'drop preset glides to its target frequency');

// ---- uploaded clip -----------------------------------------------------

const clip = { name: 'ding.wav', dataUrl: 'data:audio/wav;base64,AAAA' };
handle.setSettings({
  ...handle.getSettings(),
  events: { ...handle.getSettings().events, done: { effect: 'custom', volume: 0.5, custom: clip } },
});
const beforeCustom = { created: FakeAudio.instances.length, plays: FakeAudio.plays };
tick(new Map([['s1', base({ running: true })]]));
tick(new Map([['s1', base({ running: false, completionUnread: true })]]));
assert.equal(FakeAudio.instances.length, beforeCustom.created + 1, 'custom clip creates one audio element');
const player = FakeAudio.instances.at(-1);
assert.equal(player.src, clip.dataUrl, 'custom clip plays the stored data URL');
assert.equal(player.volume, 0.5, 'custom clip honours the per-situation volume');
assert.equal(FakeAudio.plays, beforeCustom.plays + 1, 'custom clip is played');

// ---- mute and preview --------------------------------------------------

const beforeMuted = oscillators.length;
handle.setEnabled(false);
tick(new Map([['s1', base({ running: false, pendingInteraction: { kind: 'approval' } })]]));
assert.equal(oscillators.length, beforeMuted, 'muted cues must not schedule notes');

const beforePreview = oscillators.length;
assert.equal(handle.preview('question'), true, 'preview must work while muted');
assert.equal(oscillators.length, beforePreview + 2, 'preview plays the configured preset');
tick(new Map([['s1', base({ running: false })]]));

// ---- subagent filtering and dedupe ------------------------------------

handle.setEnabled(true);
handle.setSettings({
  ...handle.getSettings(),
  events: { ...handle.getSettings().events, done: { effect: 'beep', volume: 1 } },
});
sessionRows = {
  ...sessionRows,
  child: { id: 'child', running: true, subagent: { address: { mode: 'continuable' } } },
};
const beforeChild = oscillators.length;
publish(new Map([['s1', base({ running: true })], ['child', base({ running: true })]]));
publish(new Map([['s1', base({ running: true })], ['child', base({ running: false })]]));
assert.equal(oscillators.length, beforeChild, 'subagent churn must not beep');

const beforeDedupe = oscillators.length;
clock += 1000;
publish(new Map([['s1', base({ running: true })]]));
publish(new Map([['s1', base({ running: false, completionUnread: true })]]));
const afterFirst = oscillators.length;
assert.equal(afterFirst, beforeDedupe + 2, 'the first done cue plays');
publish(new Map([['s1', base({ running: true })]]));
publish(new Map([['s1', base({ running: false, completionUnread: true })]]));
assert.equal(oscillators.length, afterFirst, 'a second same-kind cue inside the window is dropped');

// ---- subagent scope: silent by default, separately configurable --------

assert.equal(handle.getSettings().subagent.enabled, false);
const beforeSubDefault = oscillators.length;
clock += 1000;
publish(new Map([['s1', base({ running: false })], ['child', base({ running: true })]]));
publish(new Map([['s1', base({ running: false })], ['child', base({ running: false })]]));
assert.equal(oscillators.length, beforeSubDefault, 'subagent completion stays silent while its switch is off');

const beforeSubSettings = handle.getSettings();
handle.setSettings({
  ...beforeSubSettings,
  subagent: {
    enabled: true,
    events: {
      ...beforeSubSettings.subagent.events,
      done: { effect: 'drop', volume: 1 },
      question: { effect: 'beep', volume: 0.5 },
      approval: { effect: 'alert', volume: 1 },
      plan: { effect: 'soft', volume: 1 },
    },
  },
});
const beforeSubDone = oscillators.length;
clock += 1000;
publish(new Map([['s1', base({ running: false })], ['child', base({ running: true })]]));
publish(new Map([['s1', base({ running: false })], ['child', base({ running: false })]]));
assert.equal(oscillators.length, beforeSubDone + 1, 'enabled subagent completion plays its own one-note cue');
assert.equal(
  oscillators.at(-1).frequencyValues[0],
  1200,
  'subagent completion uses the subagent effect (drop), not the main chime',
);

const beforeSubAsk = oscillators.length;
clock += 1000;
publish(
  new Map([
    ['s1', base({ running: false })],
    ['child', base({ running: false, pendingInteraction: { kind: 'question' } })],
  ]),
);
assert.equal(oscillators.length, beforeSubAsk + 2, 'subagent question plays the subagent question cue');
const subAskGains = gains.slice(-2).map((gain) => Number(gain.peaks[0].toFixed(4)));
assert.deepEqual(subAskGains, [0.06, 0.06], 'subagent cue honours its own volume');
publish(new Map([['s1', base({ running: false })], ['child', base({ running: false })]]));

// ---- persistence and migration ----------------------------------------

const stored = JSON.parse(localStorage.getItem('dsh-sound-notify.settings'));
assert.equal(stored.version, 2);
assert.equal(stored.enabled, true);
assert.equal(stored.events.done.effect, 'beep');
assert.equal(stored.subagent.enabled, true, 'the subagent switch persists');
assert.equal(stored.subagent.events.done.effect, 'drop');
assert.equal(
  localStorage.get('@smartcatai/sound-notify.enabled'),
  'on',
  'the current legacy flag mirrors the document',
);
assert.equal(
  localStorage.get('dsh-plugin-sound-notify.enabled'),
  'on',
  'the pre-rename legacy flag mirrors the document too',
);

const reloaded = loadPlugin();
reloaded.plugin.apply(makeCtx());
assert.equal(
  JSON.stringify(windowObject.__dshSoundNotify.getSettings()),
  JSON.stringify(stored),
  'settings survive a module reload while localStorage is shared',
);

const legacyStorage = new Map([['@smartcatai/sound-notify.enabled', 'off']]);
const legacy = loadPlugin({
  storageOverride: {
    getItem: (key) => (legacyStorage.has(key) ? legacyStorage.get(key) : null),
    setItem: (key, value) => legacyStorage.set(key, String(value)),
    removeItem: (key) => legacyStorage.delete(key),
  },
});
legacy.plugin.apply(makeCtx());
assert.equal(windowObject.__dshSoundNotify.getSettings().enabled, false, 'the pre-feature on/off key migrates into the new document');

const preRenameStorage = new Map([['dsh-plugin-sound-notify.enabled', 'off']]);
const preRename = loadPlugin({
  storageOverride: {
    getItem: (key) => (preRenameStorage.has(key) ? preRenameStorage.get(key) : null),
    setItem: (key, value) => preRenameStorage.set(key, String(value)),
    removeItem: (key) => preRenameStorage.delete(key),
  },
});
preRename.plugin.apply(makeCtx());
assert.equal(
  windowObject.__dshSoundNotify.getSettings().enabled,
  false,
  'the pre-rename on/off key migrates into the new document too',
);

// A full settings document written under the old package name migrates as-is
// (the settings key was renamed when the plugin moved to its own repo).
const legacyDocument = {
  version: 2,
  enabled: false,
  events: {
    done: { effect: 'marimba', volume: 0.3 },
    question: { effect: 'drop', volume: 0.4 },
    approval: { effect: 'alert', volume: 0.5 },
    plan: { effect: 'soft', volume: 0.6 },
  },
  subagent: {
    enabled: true,
    events: {
      done: { effect: 'beep', volume: 0.7 },
      question: { effect: 'beep', volume: 0.7 },
      approval: { effect: 'alert', volume: 0.7 },
      plan: { effect: 'soft', volume: 0.7 },
    },
  },
};
const legacyDocStorage = new Map([['@smartcatai/sound-notify.settings', JSON.stringify(legacyDocument)]]);
const legacyDoc = loadPlugin({
  storageOverride: {
    getItem: (key) => (legacyDocStorage.has(key) ? legacyDocStorage.get(key) : null),
    setItem: (key, value) => legacyDocStorage.set(key, String(value)),
    removeItem: (key) => legacyDocStorage.delete(key),
  },
});
legacyDoc.plugin.apply(makeCtx());
const migratedDoc = windowObject.__dshSoundNotify.getSettings();
assert.equal(migratedDoc.enabled, false, 'a legacy settings document migrates its master switch');
assert.equal(migratedDoc.events.done.effect, 'marimba', 'a legacy settings document migrates main-agent effects');
assert.equal(migratedDoc.subagent.enabled, true, 'a legacy settings document migrates the subagent switch');
assert.equal(migratedDoc.subagent.events.done.volume, 0.7, 'a legacy settings document migrates subagent rows');

// ---- stale dock registration: same id, lower priority -----------------

const conflict = loadPlugin();
const conflicted = [];
conflict.plugin.apply({
  ...makeCtx(),
  slots: {
    inject: (ownerKey, callback) => callback(),
    register: (options) => {
      conflicted.push({ id: options.id, priority: options.priority });
      // A stale instance owns priority 0 and -1; this plugin must keep the
      // same id and step further down rather than rendering a second button.
      if (options.priority >= -2) {
        throw new Error(
          `list slot "conversation.composer.dock" already has an entry with id "${options.id}" at priority ${options.priority}`,
        );
      }
      return () => {};
    },
  },
});
assert.equal(conflicted.length, 3, 'the plugin retries with progressively lower priorities');
assert.ok(
  conflicted.every((entry) => entry.id === 'sound-notify'),
  'every attempt keeps the same dock id (never a second speaker button)',
);
assert.deepEqual(
  conflicted.map((entry) => entry.priority),
  [-1, -2, -5],
  'priority steps down until the stale registration is shadowed',
);

// When every priority is taken the plugin registers nothing and does not throw.
const noRoom = loadPlugin();
const attempts = [];
noRoom.plugin.apply({
  ...makeCtx(),
  slots: {
    inject: (ownerKey, callback) => callback(),
    register: (options) => {
      attempts.push(options.priority);
      throw new Error('already has an entry with id "sound-notify"');
    },
  },
});
assert.deepEqual(attempts, [-1, -2, -5, -10], 'all shadow priorities are attempted before giving up');

// ---- rendered UI structure --------------------------------------------

function walk(node, out = []) {
  if (node === null || node === undefined || typeof node !== 'object') return out;
  // Function components are invoked the way React would; the fake hooks are stateless.
  if (typeof node.type === 'function') return walk(node.type(node.props), out);
  if (node.type !== undefined) out.push(node);
  for (const child of node.children ?? []) walk(child, out);
  return out;
}

/** Apply a fresh plugin instance with the panel forced open and return its rendered elements. */
function renderPanel() {
  const ui = loadPlugin({ forceOpen: true });
  ui.plugin.apply(makeCtx());
  const tree = slotRegistrations.at(-1).component();
  assert.ok(tree, 'dock component must render');
  return walk(tree);
}

// Subagent cues disabled: only the four main-agent rows.
windowObject.__dshSoundNotify.setSubagentEnabled(false);
const mainElements = renderPanel();
const mainTypes = mainElements.map((element) => element.type);
assert.ok(mainTypes.includes('dialog'), 'settings panel renders a native dialog');
assert.equal(
  mainTypes.filter((type) => type === 'select').length,
  4,
  'four effect selectors while subagent cues are off',
);
assert.equal(
  mainElements.filter((element) => element.type === 'input' && element.props?.type === 'range').length,
  4,
  'four volume sliders while subagent cues are off',
);
assert.ok(
  mainElements.some((element) => element.props?.['data-composer-stat'] === 'sound-notify'),
  'dock button carries its stable data attribute',
);
const mainRows = mainElements.filter((element) => element.props?.['data-sound-event']);
assert.deepEqual(
  mainRows.map((element) => element.props['data-sound-event']),
  ['done', 'question', 'approval', 'plan'],
  'four main-agent situation rows render in order',
);
assert.ok(
  mainRows.every((element) => element.props['data-sound-scope'] === 'main'),
  'situation rows before the subagent toggle belong to the main agent',
);
assert.ok(
  mainElements.some((element) => element.type === 'input' && element.props?.type === 'checkbox' && element.props?.checked === false),
  'the subagent toggle renders unchecked',
);

// Subagent cues enabled: the same four rows are repeated for the subagent scope.
windowObject.__dshSoundNotify.setSubagentEnabled(true);
const allElements = renderPanel();
assert.equal(
  allElements.filter((element) => element.type === 'select').length,
  8,
  'eight effect selectors once subagent cues are enabled',
);
assert.deepEqual(
  allElements.filter((element) => element.props?.['data-sound-event']).map((element) => element.props['data-sound-scope']),
  ['main', 'main', 'main', 'main', 'subagent', 'subagent', 'subagent', 'subagent'],
  'main-agent rows come first, then the subagent rows',
);

// ---- teardown ----------------------------------------------------------

for (const { disposer } of disposers) if (typeof disposer === 'function') disposer();
assert.equal(statusListeners.size, 0, 'status subscription must be released');
assert.equal(windowObject.__dshSoundNotify, undefined, 'page handle must be removed on dispose');

console.log('sound-notify simulation OK');
console.log(`oscillators scheduled: ${oscillators.length}`);
