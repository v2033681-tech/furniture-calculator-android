import { execFileSync } from 'node:child_process';
import { cp, mkdir, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';

const webFiles = [
  'index.html',
  'voice-input.js',
  'voice-input-ui.js',
  'photo-gallery.js',
  'manifest.json',
  'sw.js',
  'icon.svg',
  'icon-96.png',
  'icon-144.png',
  'icon-192.png',
  'icon-256.png',
  'icon-512.png',
];

await mkdir('www', { recursive: true });
for (const file of webFiles) {
  await cp(file, `www/${file}`);
}

let commit = process.env.GITHUB_SHA || '';
if (!commit) {
  try {
    commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch (_) {
    commit = 'local';
  }
}
const buildInfo = {
  commit: commit.slice(0, 12),
  run: process.env.GITHUB_RUN_NUMBER || '',
};
await writeFile('www/build-info.js', `window.FurnitureBuildInfo = Object.freeze(${JSON.stringify(buildInfo)});\n`);

await build({
  entryPoints: ['voice-bridge.js'],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: ['es2020'],
  outfile: 'www/voice-plugin.js',
});
