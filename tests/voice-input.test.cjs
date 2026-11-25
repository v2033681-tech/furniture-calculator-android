const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const sandbox = { console, setTimeout, clearTimeout, Promise, Object, Array, String, Number, Math, RegExp, Error, globalThis: null };
sandbox.globalThis = sandbox;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'voice-input.js'), 'utf8'), sandbox, { filename: 'voice-input.js' });
const voice = sandbox.FurnitureVoiceInput;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

test('sample Russian command maps values to existing order fields', () => {
  const result = voice.parse('Создай заказ. Кухня Иванова. ЛДСП пять листов. МДФ два листа. Петли двадцать штук. Монтаж пятнадцать тысяч рублей.', ['Петля 90°', 'Петля 180°']);
  assert.equal(result.values.title.value, 'Кухня Иванова');
  assert.equal(result.values.ld.value, 5);
  assert.equal(result.values.md.value, 2);
  assert.equal(result.values.hw0.value, 20);
  assert.equal(result.values.install.value, 15000);
  assert.equal(result.values.orderTotal, undefined);
  assert.match(result.values.hw0.note, /Тип петли не уточнён/);
});

test('Russian money words preserve thousands in total, prepayment, and installation', () => {
  const result = voice.parse('Заказ кухня Иванова. ЛДСП пять листов, МДФ два листа, петли двадцать штук, общая стоимость сто десять тысяч рублей, предоплата пятьдесят пять тысяч, монтаж пятнадцать тысяч.');
  assert.equal(result.values.title.value, 'кухня Иванова');
  assert.equal(result.values.orderTotal.value, 110000);
  assert.equal(result.values.prepayment.value, 55000);
  assert.equal(result.values.install.value, 15000);
  assert.equal(result.values.orderTotal.value - result.values.prepayment.value, 55000);
});

test('client details, edge meters and additional voice commands are parsed', () => {
  const parsed = voice.parse('Клиент: Иванов Иван. Адрес: улица Лесная, дом 4. Телефон: +7 900 123-45-67. Комментарий: позвонить вечером. Кромка ПВХ 0,4 мм двадцать метров. Предоплата десять тысяч рублей.');
  assert.equal(parsed.values.client.value, 'Иванов Иван');
  assert.equal(parsed.values.address.value, 'улица Лесная, дом 4');
  assert.equal(parsed.values.phone.value, '+7 900 123-45-67');
  assert.equal(parsed.values.note.value, 'позвонить вечером');
  assert.equal(parsed.values.e04.value, 20);
  assert.equal(parsed.values.prepayment.value, 10000);
  const initial = voice.parse('ЛДСП пять листов.');
  const merged = voice.mergeSuggestions(initial.values, voice.parse('Добавь три листа ЛДСП.'));
  assert.equal(merged.ld.value, 8);
});

test('native recognition continues after results and stop keeps the final phrase', async () => {
  let starts = 0;
  let finishThird;
  const segments = [];
  const native = {
    start() {
      starts += 1;
      if (starts === 1) return Promise.resolve({ matches: ['Кухня Иванова'] });
      if (starts === 2) return Promise.resolve({ matches: ['ЛДСП пять листов'] });
      return new Promise(resolve => { finishThird = resolve; });
    },
    stop() { if (finishThird) finishThird({ matches: ['МДФ два листа'] }); return Promise.resolve(); }
  };
  const controller = voice.createRecognitionController({ nativeSpeech: native, restartDelayMs: 5, onSegment: text => segments.push(text) });
  assert.equal(controller.startNative(), true);
  for (let i = 0; i < 40 && starts < 3; i += 1) await wait(5);
  assert.equal(starts, 3, 'recognizer restarted after each completed Android phrase');
  const result = await controller.stop();
  assert.deepEqual(segments, ['Кухня Иванова', 'ЛДСП пять листов', 'МДФ два листа']);
  assert.equal(result.stopped, true);
  assert.equal(controller.active, false);
});

test('transient no-speech error retries; a fresh session can start after stop', async () => {
  let starts = 0;
  let finishRecognition;
  const native = {
    start() {
      starts += 1;
      if (starts === 1) return Promise.reject(new Error('No speech input'));
      return new Promise(resolve => { finishRecognition = resolve; });
    },
    stop() { if (finishRecognition) finishRecognition({ matches: ['Петли двадцать штук'] }); return Promise.resolve(); }
  };
  const segments = [];
  const controller = voice.createRecognitionController({ nativeSpeech: native, restartDelayMs: 5, onSegment: text => segments.push(text) });
  controller.startNative();
  for (let i = 0; i < 40 && starts < 2; i += 1) await wait(5);
  assert.equal(starts, 2, 'no-speech was treated as a pause and retried');
  await controller.stop();
  assert.deepEqual(segments, ['Петли двадцать штук']);
  const secondSessionStarts = starts;
  let releaseSecond;
  native.start = () => { starts += 1; return new Promise(resolve => { releaseSecond = resolve; }); };
  controller.startNative();
  await wait(2);
  assert.equal(controller.active, true);
  releaseSecond({ matches: [] });
  await controller.stop();
  assert.equal(controller.active, false);
  assert.ok(starts > secondSessionStarts, 'a new session starts after the previous session has fully stopped');
});

test('unavailable Android service is surfaced and resets the active state', async () => {
  let ended;
  const controller = voice.createRecognitionController({
    nativeSpeech: { start: () => Promise.reject(new Error('Speech recognition service is not available.')), stop: () => Promise.resolve() },
    onEnd: outcome => { ended = outcome; }
  });
  controller.startNative();
  for (let i = 0; i < 20 && !ended; i += 1) await wait(2);
  assert.equal(controller.active, false);
  assert.match(String(ended.error), /not available/);
});

test('browser recognition restarts after short pauses and stops cleanly', async () => {
  const instances = [];
  class FakeRecognition {
    constructor() { instances.push(this); }
    start() {}
    stop() { if (this.onend) this.onend(); }
  }
  const segments = [];
  const controller = voice.createRecognitionController({ getBrowserRecognition: () => FakeRecognition, restartDelayMs: 5, onSegment: text => segments.push(text) });
  controller.startBrowser();
  instances[0].onresult({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: 'Кухня Иванова' } }] });
  instances[0].onend();
  for (let i = 0; i < 40 && instances.length < 2; i += 1) await wait(5);
  assert.equal(instances.length, 2);
  instances[1].onresult({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: 'ЛДСП пять листов' } }] });
  await controller.stop();
  assert.deepEqual(segments, ['Кухня Иванова', 'ЛДСП пять листов']);
  assert.equal(controller.active, false);
  assert.equal(instances[1].onresult, null, 'browser callbacks are detached after stop');
});
