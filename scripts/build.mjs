import { cp, mkdir } from 'node:fs/promises';
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

await build({
  entryPoints: ['voice-bridge.js'],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: ['es2020'],
  outfile: 'www/voice-plugin.js',
});
