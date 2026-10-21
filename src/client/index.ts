/**
 * Browser half of the sound-notify bundle.
 *
 * The bundle is built by `build.mjs` / `build-all.mjs` into `lib/client.js`;
 * this module is the Cordis plugin body. Watches the Client Session status
 * source owned by `@deepseek-ai/dsh-client-ui-session` —
 * `{ running, pendingInteraction, completionUnread }` per Session — and plays
 * the cue configured for each situation and agent scope:
 *
 *   - scopes: `main` (the Session's own agent) vs `subagent`
 *     (subagent-origin Sessions, `row.subagent !== null`),
 *   - situations: `done` (a turn finished), `question`, `approval`, `plan`.
 *
 * Subagent cues are off by default; both scopes configure their four
 * situations independently in the composer-dock settings panel. Nothing
 * leaves this page.
 */
import * as React from 'react';

import { EFFECT_PRESETS, playEvent, primeAudio, resetAudio, unlockAudio } from './effects';
import type { CueScope, EventKey, Settings } from './settings';
import { EVENT_ORDER, createSettingsStore } from './settings';
import { createSoundControl } from './ui';

/** Same situation firing for several Sessions at once is one cue. */
const DEDUPE_MS = 700;

/** Map a Client pending-interaction kind onto the configured situation. */
function eventOfPendingKind(kind: unknown): EventKey {
  switch (kind) {
    case 'approval':
      return 'approval';
    case 'plan-review':
      return 'plan';
    case 'question':
      return 'question';
    default:
      return 'question';
  }
}

/** Client services this plugin depends on. */
export const inject = ['uiSession', 'sessions', 'slots'];

/** @param ctx - Client Cordis context. */
export function apply(ctx: any): void {
  const store = createSettingsStore();
  const lastCue = new Map<string, number>();

  /** Play one configured situation cue, coalescing same-scope/same-kind bursts. */
  const cue = (scope: CueScope, event: EventKey): void => {
    const key = `${scope}:${event}`;
    const now = Date.now();
    const previous = lastCue.get(key);
    if (previous !== undefined && now - previous < DEDUPE_MS) return;
    lastCue.set(key, now);
    playEvent(event, store.get(), scope);
  };

  // Cues: react to Session status transitions on the Client.
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
        const pendingMain = new Set<EventKey>();
        const pendingSubagent = new Set<EventKey>();
        for (const [sessionId, current] of next) {
          if (current === undefined) continue;
          const row = byId[sessionId];
          // A Session without a catalog row cannot be classified as main or child.
          if (row === undefined) continue;
          const scope: CueScope = row.subagent != null ? 'subagent' : 'main';
          const prior = previous.get(sessionId);
          const pendingNow = current.pendingInteraction !== undefined;
          const pendingBefore = prior !== undefined && prior.pendingInteraction !== undefined;
          if (pendingNow && !pendingBefore) {
            const event = eventOfPendingKind(current.pendingInteraction.kind);
            (scope === 'subagent' ? pendingSubagent : pendingMain).add(event);
          } else if (prior !== undefined && prior.running === true && current.running === false) {
            if (scope === 'subagent') finishedSubagent = true;
            else finishedMain = true;
          }
        }
        previous = next;
        const hasPending = pendingMain.size > 0 || pendingSubagent.size > 0;
        // A pending interaction is the more useful signal: report it instead of
        // the same transition's completion.
        for (const event of EVENT_ORDER) if (pendingMain.has(event)) cue('main', event);
        for (const event of EVENT_ORDER) if (pendingSubagent.has(event)) cue('subagent', event);
        if (!hasPending) {
          if (finishedMain) cue('main', 'done');
          if (finishedSubagent) cue('subagent', 'done');
        }
      });
      const unlock = () => unlockAudio();
      window.addEventListener('pointerdown', unlock, true);
      window.addEventListener('keydown', unlock, true);
      return () => {
        unsubscribe();
        window.removeEventListener('pointerdown', unlock, true);
        window.removeEventListener('keydown', unlock, true);
        lastCue.clear();
        resetAudio();
      };
    },
    'sound-notify: Session status cues',
  );

  // Dock entry: opens the per-situation settings panel (alt+click toggles mute).
  const SoundButton = createSoundControl(store);
  const DOCK_SLOT = 'conversation.composer.dock';
  ctx.slots.inject(DOCK_SLOT, () => {
    // A stale copy of this plugin may still be mounted in the page until a
    // reload. The slot list rejects a duplicate id at the same priority but
    // accepts a lower one, so step the priority down on the SAME id: the new
    // entry shadows the stale one instead of rendering a second button.
    let lastError: unknown;
    for (const priority of [-1, -2, -5, -10]) {
      try {
        return ctx.slots.register({ name: DOCK_SLOT, id: 'sound-notify', order: 900, priority }, SoundButton);
      } catch (error) {
        lastError = error;
      }
    }
    // Never invent a second dock id: without a free priority keep whatever
    // button the page already has and let one reload replace it.
    console.warn('[sound-notify] dock entry already owned by a stale instance; reload to update it', lastError);
    return () => {};
  });

  // Escape hatch for debugging and for scripted control from the page console.
  ctx.effect(
    () => {
      (window as any).__dshSoundNotify = {
        play: (event: EventKey, scope: CueScope = 'main') => playEvent(event, store.get(), scope),
        preview: (event: EventKey, scope: CueScope = 'main') =>
          playEvent(event, store.get(), scope, { preview: true }),
        unlock: unlockAudio,
        getSettings: (): Settings => store.get(),
        setSettings: (next: Settings) => store.set(next),
        setEnabled: (enabled: boolean) => store.setEnabled(enabled),
        setSubagentEnabled: (enabled: boolean) => store.setSubagentEnabled(enabled),
        reset: () => store.reset(),
        effects: EFFECT_PRESETS.map((preset) => preset.id),
      };
      return () => {
        delete (window as any).__dshSoundNotify;
      };
    },
    'sound-notify: page handle',
  );
}
