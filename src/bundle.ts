import fs from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';

const root = path.join(import.meta.dirname, '..');
const target = path.join(root, 'dist', 'viewer.js');

const bundle = await esbuild.build({
  entryPoints: [path.join(root, 'src', 'viewer', 'main.ts')],
  bundle: true,
  write: false,
  format: 'iife',
  minify: true,
  target: 'es2022',
  legalComments: 'none',
});
const js = bundle.outputFiles[0].text;

if (process.argv.includes('--check')) {
  if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== js) {
    console.error('dist/viewer.js is out of date with src/viewer. Run npm run bundle.');
    process.exit(1);
  }
} else {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, js);
  console.error(`bundle: dist/viewer.js (${Math.round(js.length / 1024)} KB)`);
}
