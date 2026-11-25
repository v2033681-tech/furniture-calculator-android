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

test('full kitchen order command maps supported values and flags ambiguous 2 mm edge size', () => {
  const parsed = voice.parse('Заказ на кухню. ЛДСП пять листов. МДФ два листа. Кромка два миллиметра сто метров. Петли десять штук. Ручки шесть штук. Стоимость заказа сто десять тысяч рублей. Предоплата пятьдесят пять тысяч рублей.');
  assert.equal(parsed.values.title.value, 'на кухню');
  assert.equal(parsed.values.ld.value, 5);
  assert.equal(parsed.values.md.value, 2);
  assert.equal(parsed.values.hw0.value, 10);
  assert.equal(parsed.values.hw4.value, 6);
  assert.equal(parsed.values.orderTotal.value, 110000);
  assert.equal(parsed.values.prepayment.value, 55000);
  assert.equal(parsed.values.e219, undefined, 'the parser does not guess between existing 2×19 and 2×35 fields');
  assert.equal(parsed.values.e235, undefined);
  assert.match(parsed.notes[0], /метраж 100 м не назначен неоднозначному полю/);
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
  assert.equal(await controller.startNative(), true);
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

function createEventNative() {
  const listeners = new Map();
  const calls = [];
  const native = {
    addListener(name, callback) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(callback);
      return Promise.resolve({ remove() { listeners.get(name).delete(callback); } });
    },
    start(options) { calls.push(options); return Promise.resolve({}); },
    stop() {
      return Promise.resolve();
    },
    emit(name, event) {
      for (const callback of Array.from(listeners.get(name) || [])) callback(event);
    },
    get calls() { return calls; },
    listenerCount() { return Array.from(listeners.values()).reduce((count, items) => count + items.size, 0); }
  };
  return native;
}

test('native partial events keep dictation alive across pauses and preserve the final phrase on stop', async () => {
  const native = createEventNative();
  const segments = [];
  const partials = [];
  const controller = voice.createRecognitionController({
    nativeSpeech: native,
    restartDelayMs: 5,
    onSegment: text => segments.push(text),
    onPartial: text => partials.push(text)
  });

  assert.equal(await controller.startNative(), true);
  assert.equal(native.calls[0].language, 'ru-RU');
  assert.equal(native.calls[0].partialResults, true, 'Android uses the plugin event stream, not one-shot results');
  native.emit('listeningState', { status: 'started' });
  native.emit('partialResults', { matches: ['Кухня'], isFinal: false });
  assert.deepEqual(segments, [], 'interim speech is not committed as a complete segment');
  native.emit('listeningState', { status: 'stopped' });
  native.emit('partialResults', { matches: ['Кухня Иван'], isFinal: false });
  await wait(10);
  assert.equal(native.calls.length, 1, 'an interim hypothesis after onEndOfSpeech waits for Android final results');
  native.emit('partialResults', { matches: ['Кухня Иванова'], isFinal: true });

  for (let i = 0; i < 40 && native.calls.length < 2; i += 1) await wait(5);
  assert.equal(native.calls.length, 2, 'a final result after a short pause starts another attempt');
  native.emit('partialResults', { matches: ['МДФ два листа'], isFinal: false });
  const stopping = controller.stop();
  await wait(5);
  native.emit('partialResults', { matches: ['МДФ два листа'], isFinal: true });
  await stopping;

  assert.deepEqual(segments, ['Кухня Иванова', 'МДФ два листа']);
  assert.deepEqual(partials, ['Кухня', 'Кухня Иван', 'МДФ два листа']);
  assert.equal(controller.active, false);
  assert.equal(native.listenerCount(), 0, 'all plugin listeners are removed when the session ends');
});

test('native active errors retry transient service failures and surface fatal permission errors', async () => {
  const native = createEventNative();
  let ended;
  const states = [];
  const controller = voice.createRecognitionController({
    nativeSpeech: native,
    restartDelayMs: 5,
    onState: state => states.push(state),
    onEnd: outcome => { ended = outcome; }
  });

  await controller.startNative();
  native.emit('recognitionError', { code: 11, message: 'Server disconnected' });
  for (let i = 0; i < 120 && native.calls.length < 2; i += 1) await wait(5);
  assert.equal(native.calls.length, 2, 'a transient native service disconnect is retried');
  native.emit('recognitionError', { code: 9, message: 'Insufficient permissions' });
  for (let i = 0; i < 40 && !ended; i += 1) await wait(5);
  assert.equal(controller.active, false, 'a fatal permission error returns the controller to idle');
  assert.equal(ended.error.code, 9);
  assert.equal(states.at(-1).active, false);
  assert.equal(native.listenerCount(), 0);
});

test('native repeated start-stop-start cycles use fresh listeners and preserve stop results', async () => {
  const native = createEventNative();
  const segments = [];
  const controller = voice.createRecognitionController({ nativeSpeech: native, restartDelayMs: 5, onSegment: text => segments.push(text) });

  await controller.startNative();
  native.emit('partialResults', { matches: ['Первый заказ'], isFinal: false });
  const firstStop = controller.stop();
  await wait(5);
  native.emit('partialResults', { matches: ['Первый заказ'], isFinal: true });
  await firstStop;
  assert.equal(controller.active, false);
  assert.equal(native.listenerCount(), 0);

  await controller.startNative();
  assert.equal(controller.active, true);
  native.emit('listeningState', { status: 'stopped' });
  native.emit('partialResults', { matches: ['Второй заказ'], isFinal: true });
  for (let i = 0; i < 40 && native.calls.length < 3; i += 1) await wait(5);
  assert.equal(native.calls.length, 3, 'the new session restarted after its final result');
  native.emit('partialResults', { matches: ['Последняя фраза'], isFinal: false });
  const finalStop = controller.stop();
  await wait(5);
  native.emit('partialResults', { matches: ['Последняя фраза'], isFinal: true });
  await finalStop;
  assert.deepEqual(segments, ['Первый заказ', 'Второй заказ', 'Последняя фраза']);
  assert.equal(native.listenerCount(), 0);
});
