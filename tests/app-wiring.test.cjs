const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const voiceUi = fs.readFileSync(path.join(root, 'voice-input-ui.js'), 'utf8');
const voiceCore = fs.readFileSync(path.join(root, 'voice-input.js'), 'utf8');
const authStorage = fs.readFileSync(path.join(root, 'auth-storage.js'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

test('all inline JavaScript in the shipped index.html parses', () => {
  const inlineScripts = Array.from(html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g));
  assert.ok(inlineScripts.length > 0);
  inlineScripts.forEach((match, index) => new vm.Script(match[1], { filename: 'index.inline.' + index + '.js' }));
});

test('the production HTML entry loads the native voice bridge, voice UI, and gallery in dependency order', () => {
  const scripts = ['supabase-client.js', 'voice-plugin.js', 'auth-storage.js', 'voice-input.js', 'voice-input-ui.js', 'photo-gallery.js'];
  const positions = scripts.map(file => html.indexOf('<script src="' + file + '"></script>'));
  assert.ok(positions.every(position => position >= 0), 'all runtime scripts are referenced by index.html');
  assert.deepEqual(positions, positions.slice().sort((a, b) => a - b));
  assert.match(html, /id="voiceOrder"/);
  assert.match(html, /id="photoPreview"/);
  assert.match(html, /FurniturePhotoGallery\.attach\(\{getPhotos:\(\)=>photos/);
  assert.match(voiceUi, /window\.Capacitor\.isNativePlatform\(\)/);
  assert.match(voiceUi, /nativeSpeech\.start|controller\.startNative/);
  assert.match(voiceUi, /parsed\.notes \|\| \[\]/, 'parser warnings are surfaced in the existing review panel');
  assert.match(voiceUi, /voiceNotes\.join\(' '\)/);
  assert.match(voiceCore, /partialResults: true/);
  assert.match(voiceUi, /getBrowserRecognition: function \(\) \{ return window\.SpeechRecognition \|\| window\.webkitSpeechRecognition; \}/);
  assert.match(voiceUi, /else if \(!controller\.startBrowser\(\)\)/, 'Web Speech API is a browser-only fallback');
  assert.match(authStorage, /store\.setItem\(key, legacyValue\)/);
  assert.match(html, /storage:authStorage/);
  assert.doesNotMatch(html, /cdn\.jsdelivr\.net\/npm\/@supabase/);
});

test('the only email/password inputs are in the account dialog, outside the work screen', () => {
  const dialog = html.match(/<dialog class="account-dialog" id="accountSettings"[\s\S]*?<\/dialog>/);
  assert.ok(dialog, 'account controls are rendered in a modal account section');
  assert.match(dialog[0], /id="authEmail"/);
  assert.match(dialog[0], /id="authPassword"/);
  assert.match(dialog[0], /id="closeAccount"/);
  assert.match(dialog[0], /id="togglePassword"/);
  const main = html.slice(html.indexOf('<main>'), html.indexOf('</main>'));
  assert.doesNotMatch(main, /id="authEmail"|id="authPassword"/);
  const header = html.slice(0, html.indexOf('<main>'));
  assert.match(header, /id="accountMenu"/);
  assert.doesNotMatch(header, /id="authEmail"|id="authPassword"/);
  assert.match(html, /accountMenu\.onclick=\(\)=>\{if\(!accountSettings\.open\)accountSettings\.showModal\(\)/);
});

test('Supabase auth uses the secure adapter and never re-enters auth APIs from auth callbacks', () => {
  assert.match(html, /window\.FurnitureAuthStorage\.create\(/);
  assert.match(html, /persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storage:authStorage/);
  assert.match(html, /await authRefresh\(\);sb\.auth\.onAuthStateChange\(\(_event,session\)=>\{applyAuthSession\(session\);\}\)/);
  assert.doesNotMatch(html, /onAuthStateChange\(\(\)=>authRefresh\(\)\)/);
  assert.equal(packageJson.dependencies['@aparajita/capacitor-secure-storage'], '6.0.1');
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
