// src/index.ts
import { appendFileSync } from "fs";
import { join } from "path";
var MARKER_FILE = ".sound-notify-applied.log";
function apply(ctx) {
  try {
    const home = process.env.DSH_HOME ?? join(process.env.USERPROFILE ?? "", ".dsh");
    const file = join(home, "profiles", process.env.DSH_PROFILE ?? "desktop", MARKER_FILE);
    appendFileSync(file, `${(/* @__PURE__ */ new Date()).toISOString()} pid=${process.pid} sound-notify host row activated
`);
  } catch {
  }
}
export {
  apply
};
