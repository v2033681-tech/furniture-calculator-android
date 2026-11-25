const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const voiceUi = fs.readFileSync(path.join(root, 'voice-input-ui.js'), 'utf8');
const voiceCore = fs.readFileSync(path.join(root, 'voice-input.js'), 'utf8');

test('all inline JavaScript in the shipped index.html parses', () => {
  const inlineScripts = Array.from(html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g));
  assert.ok(inlineScripts.length > 0);
  inlineScripts.forEach((match, index) => new vm.Script(match[1], { filename: 'index.inline.' + index + '.js' }));
});

test('the production HTML entry loads the native voice bridge, voice UI, and gallery in dependency order', () => {
  const scripts = ['voice-plugin.js', 'voice-input.js', 'voice-input-ui.js', 'photo-gallery.js'];
  const positions = scripts.map(file => html.indexOf('<script src="' + file + '"></script>'));
  assert.ok(positions.every(position => position >= 0), 'all runtime scripts are referenced by index.html');
  assert.deepEqual(positions, positions.slice().sort((a, b) => a - b));
  assert.match(html, /id="voiceOrder"/);
  assert.match(html, /id="photoPreview"/);
  assert.match(html, /FurniturePhotoGallery\.attach\(\{getPhotos:\(\)=>photos/);
  assert.match(voiceUi, /window\.Capacitor\.isNativePlatform\(\)/);
  assert.match(voiceUi, /nativeSpeech\.start|controller\.startNative/);
  assert.match(voiceCore, /partialResults: true/);
  assert.match(voiceUi, /getBrowserRecognition: function \(\) \{ return window\.SpeechRecognition \|\| window\.webkitSpeechRecognition; \}/);
  assert.match(voiceUi, /else if \(!controller\.startBrowser\(\)\)/, 'Web Speech API is a browser-only fallback');
});

test('the only email/password inputs live inside collapsed settings and the header button opens them', () => {
  const details = html.match(/<details class="card settings" id="accountSettings">([\s\S]*?)<\/details>/);
  assert.ok(details, 'account controls are rendered in the settings disclosure');
  assert.match(details[1], /id="authEmail"/);
  assert.match(details[1], /id="authPassword"/);
  assert.doesNotMatch(details[0].slice(0, details[0].indexOf('>')), /\sopen(?:\s|>)/, 'settings starts collapsed');
  const header = html.slice(0, html.indexOf('<main>'));
  assert.match(header, /id="accountMenu"/);
  assert.doesNotMatch(header, /id="authEmail"|id="authPassword"/);
  assert.match(html, /accountMenu\.onclick=\(\)=>\{accountSettings\.open=true;/);
});

test('native app avoids the PWA cache and exposes the generated build marker for device verification', () => {
  assert.match(html, /<script src="build-info\.js"><\/script>/);
  assert.match(html, /FurnitureBuildInfo/);
  assert.match(html, /nativeApp=.*isNativePlatform\(\).*getRegistrations/s);
  assert.match(html, /furniture-calc-.*caches\.delete/s);
  assert.match(html, /else\{window\.addEventListener\("load",\(\)=>navigator\.serviceWorker\.register/);
});

test('Supabase auth, order persistence, and cloud photo storage entry points remain in the app', () => {
  assert.match(html, /sb\.auth\.signInWithPassword/);
  assert.match(html, /sb\.auth\.signUp/);
  assert.match(html, /sb\.auth\.onAuthStateChange/);
  assert.match(html, /function saveCloudOrder/);
  assert.match(html, /sb\.storage\.from\('order-photos'\)\.upload/);
  assert.match(html, /sb\.storage\.from\('order-photos'\)\.remove/);
  assert.match(html, /save\.onclick=async/);
  assert.match(html, /localStorage\.setItem/);
});
