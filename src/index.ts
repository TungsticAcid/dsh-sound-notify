/**
 * Host half of the sound-notify bundle.
 *
 * All audible behaviour lives in the browser: the Client module watches
 * `ctx.uiSession.sessionStatus` and synthesizes the cues with Web Audio.
 * This Host row contributes no service, tool, or session event.
 *
 * It does write one diagnostic line on activation so a running Desktop host
 * proves the bundle composed (and when it recomposed), without depending on
 * browser control. Delete the log file any time; the next activation recreates
 * it.
 */
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';

const MARKER_FILE = '.sound-notify-applied.log';

/** @param ctx - Host Cordis context (unused; the row only reports activation). */
export function apply(ctx: any): void {
  void ctx;
  try {
    const home = process.env.DSH_HOME ?? join(process.env.USERPROFILE ?? '', '.dsh');
    const file = join(home, 'profiles', process.env.DSH_PROFILE ?? 'desktop', MARKER_FILE);
    appendFileSync(file, `${new Date().toISOString()} pid=${process.pid} sound-notify host row activated\n`);
  } catch {
    /* diagnostics must never break plugin activation */
  }
}
