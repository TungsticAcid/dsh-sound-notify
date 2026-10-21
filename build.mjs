/**
 * Build one plugin's artifacts (run from anywhere):
 *
 *  - `src/client/index.ts` -> `lib/client.js`, wrapped in the DSH client-module
 *    registration (`window.__ModuleLoader__.load({ id, factory })`), with
 *    React left external because the Harness web client provides it.
 *  - `src/index.ts` -> `lib/index.js`, the plain ESM Host half.
 */
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const p = (rel) => join(here, rel);
const ID = 'dsh-sound-notify';

function wrap(id, body) {
  return `window.__ModuleLoader__.load({\n\tid: ${JSON.stringify(id)},\n\tfactory: (require) => {\n\t\tvar module = { exports: {} };\n\t\tvar exports = module.exports;\n\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });\n${body}\n\t\treturn module.exports;\n\t},\n});\n`;
}

mkdirSync(p('lib'), { recursive: true });

const client = await build({
  entryPoints: [p('src/client/index.ts')],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2020',
  jsx: 'automatic',
  external: ['react', 'react-dom', 'react-dom/client'],
  write: false,
});
const clientBody = client.outputFiles[0].text;
writeFileSync(p('lib/client.js'), wrap(ID, clientBody));
console.log('built lib/client.js', ((clientBody.length + 300) / 1024).toFixed(1) + 'KB');

await build({
  entryPoints: [p('src/index.ts')],
  outfile: p('lib/index.js'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'es2020',
});
console.log('built lib/index.js');
