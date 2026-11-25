(function () {
  'use strict';

  function startVoiceUi() {
    const button = document.getElementById('voiceOrder');
    const status = document.getElementById('voiceStatus');
    if (!button || !status || !window.FurnitureVoiceInput) return;

    const voice = window.FurnitureVoiceInput;
    const nativeSpeech = window.FurnitureSpeechRecognition;
    const ids = ['title', 'client', 'address', 'phone', 'note', 'orderTotal', 'prepayment', 'orderStatus', 'ld', 'md', 'e04', 'e19', 'e219', 'e235', 'work', 'transport', 'lifting', 'install'];
    for (let i = 0; i < 27; i += 1) ids.push('hw' + i);
    const protectedFields = new Set();
    let pending = Object.create(null);
    let transcriptParts = [];
    let currentPartial = '';
    let starting = false;
    let review;
    let transcriptView;
    let suggestionsView;
    let controller;

    function control(id) { return document.getElementById(id); }
    function controlHasValue(id) {
      const element = control(id);
      if (!element) return false;
      if (element.type === 'number') return element.value !== '' && Number(element.value) !== 0;
      return String(element.value || '').trim() !== '';
    }
    function protectCurrentValues(includeDefaultStatus) {
      ids.forEach(function (id) {
        if (id === 'orderStatus' && !includeDefaultStatus) return;
        if (controlHasValue(id)) protectedFields.add(id);
      });
    }
    function clearProtection() {
      protectedFields.clear();
      ids.forEach(function (id) { const element = control(id); if (element && element.type === 'number' && Number(element.value) !== 0) protectedFields.add(id); });
    }
    ids.forEach(function (id) {
      const element = control(id);
      if (element) ['input', 'change'].forEach(function (type) {
        element.addEventListener(type, function () { if (controlHasValue(id)) protectedFields.add(id); });
      });
    });
    protectCurrentValues();

    review = document.createElement('section');
    review.id = 'voiceReview';
    review.hidden = true;
    review.setAttribute('aria-live', 'polite');
    review.style.cssText = 'border:1px solid #9aa9c2;border-radius:10px;padding:12px;margin:10px 0;background:#f7f9fc';
    review.innerHTML = '<strong>Проверьте распознанные данные</strong><p class="muted" id="voiceReviewHint"></p><label for="voiceTranscript">Распознанный текст</label><textarea id="voiceTranscript" rows="3" readonly style="width:100%"></textarea><div id="voiceSuggestions"></div><button type="button" id="voiceApplyEmpty">Заполнить свободные поля</button> <button type="button" class="secondary" id="voiceReplaceExisting">Заменить заполненные поля…</button> <button type="button" class="secondary" id="voiceDiscard">Закрыть без заполнения</button>';
    status.insertAdjacentElement('afterend', review);
    transcriptView = review.querySelector('#voiceTranscript');
    suggestionsView = review.querySelector('#voiceSuggestions');

    function friendlyError(error) {
      const message = String(error && (error.message || error) || '').toLowerCase();
      if (/not-allowed|denied|permission/.test(message)) return 'Доступ к микрофону запрещён. Разрешите его в настройках Android и нажмите кнопку снова.';
      if (/not available|unavailable|recognition service|service not/.test(message)) return 'Системная служба распознавания речи недоступна. Включите голосовой сервис Android и русский язык.';
      if (/network|сеть/.test(message)) return 'Служба распознавания сообщила об ошибке сети. Проверьте подключение и попробуйте ещё раз.';
      if (/audio recording|client side|busy|server error/.test(message)) return 'Android не смог продолжить запись. Проверьте, не занят ли микрофон другим приложением.';
      return 'Не удалось распознать речь. Проверьте микрофон и службу голосового ввода.';
    }
    function catalog() {
      return Array.from({ length: 27 }, function (_, i) {
        const element = control('hw' + i);
        if (!element || !element.parentElement) return 'Фурнитура ' + i;
        const name = element.parentElement.firstElementChild.cloneNode(true);
        name.querySelectorAll('small').forEach(function (price) { price.remove(); });
        return name.textContent.trim();
      });
    }
    function mergeText(segment) {
      currentPartial = '';
      transcriptParts.push(segment);
      const parsed = voice.parse(segment, catalog());
      pending = voice.mergeSuggestions(pending, parsed);
      renderReview();
      status.textContent = 'Распознано. Можно продолжить диктовку или остановить её, затем проверьте предложения ниже.';
    }
    function renderReview() {
      const text = transcriptParts.concat(currentPartial ? [currentPartial] : []).join(' ').trim();
      const entries = Object.keys(pending);
      review.hidden = !text && !entries.length;
      transcriptView.value = text;
      suggestionsView.replaceChildren();
      entries.forEach(function (id) {
        const suggestion = pending[id];
        const row = document.createElement('div');
        row.style.cssText = 'display:grid;grid-template-columns:minmax(120px,1fr) minmax(100px,2fr);gap:8px;align-items:center;margin:8px 0';
        const label = document.createElement('label');
        label.textContent = suggestion.label + (suggestion.note ? ' — ' + suggestion.note : '');
        const input = document.createElement('input');
        input.type = 'text';
        input.dataset.voiceField = id;
        input.value = String(suggestion.value);
        input.setAttribute('aria-label', suggestion.label);
        row.append(label, input);
        const existing = controlHasValue(id) || protectedFields.has(id);
        if (existing) {
          const warning = document.createElement('div');
          warning.className = 'muted';
          warning.textContent = 'В карточке уже есть значение: оно останется без изменений без подтверждения.';
          warning.style.gridColumn = '1 / -1';
          row.append(warning);
        }
        suggestionsView.append(row);
      });
      review.querySelector('#voiceReviewHint').textContent = entries.length ? 'Предложения не сохраняются автоматически. Проверьте распознанный текст и значения; их можно отредактировать.' : 'Речь распознана, но поля не удалось однозначно определить. Исправьте поля вручную или продолжите команду.';
    }
    function typedSuggestions() {
      const result = Object.create(null);
      suggestionsView.querySelectorAll('[data-voice-field]').forEach(function (input) { result[input.dataset.voiceField] = input.value; });
      return result;
    }
    function applySuggestions(allowReplace) {
      const typed = typedSuggestions();
      let skipped = 0;
      Object.keys(pending).forEach(function (id) {
        const element = control(id);
        if (!element || typed[id] === undefined || typed[id] === '') return;
        if (!allowReplace && (protectedFields.has(id) || controlHasValue(id))) { skipped += 1; return; }
        if (element.tagName === 'SELECT') {
          const option = Array.from(element.options).find(function (item) { return item.textContent.trim().toLowerCase() === String(typed[id]).trim().toLowerCase(); });
          if (!option) return;
          element.value = option.value;
        } else element.value = typed[id];
        protectedFields.add(id);
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      });
      pending = Object.create(null);
      review.hidden = true;
      if (window.calc) window.calc();
      status.textContent = skipped ? 'Свободные поля заполнены; ' + skipped + ' уже заполненных значений оставлены без изменений.' : 'Проверенные голосовые значения перенесены в карточку. Их можно исправить вручную.';
    }
    review.querySelector('#voiceApplyEmpty').addEventListener('click', function () { applySuggestions(false); });
    review.querySelector('#voiceReplaceExisting').addEventListener('click', function () {
      if (window.confirm('Заменить текущие значения в карточке предложениями из диктовки?')) applySuggestions(true);
    });
    review.querySelector('#voiceDiscard').addEventListener('click', function () {
      pending = Object.create(null);
      transcriptParts = [];
      currentPartial = '';
      review.hidden = true;
      status.textContent = 'Голосовые предложения закрыты без заполнения. Можно исправить карточку вручную.';
    });

    controller = voice.createRecognitionController({
      nativeSpeech: nativeSpeech,
      getBrowserRecognition: function () { return window.SpeechRecognition || window.webkitSpeechRecognition; },
      onSegment: mergeText,
      onPartial: function (text) {
        currentPartial = text;
        renderReview();
        status.textContent = 'Распознаю фразу. Продолжайте говорить; короткие паузы не завершают диктовку.';
      },
      onState: function (state) {
        button.disabled = !!state.initializing || !!state.stopping;
        button.textContent = state.active ? '⏹ Остановить диктовку' : '🎙️ Надиктовать заказ';
        button.setAttribute('aria-pressed', String(state.active));
        if (state.waiting && state.active) status.textContent = state.transientError ? 'Короткая пауза распознавания. Повторяю запуск автоматически…' : 'Фраза обработана. Перезапускаю распознавание; можно говорить дальше или остановить диктовку.';
        else if (state.active && !state.stopping) status.textContent = 'Распознавание активно — продолжайте говорить или нажмите «Остановить диктовку».';
      },
      onEnd: function (outcome) {
        starting = false;
        button.disabled = false;
        button.textContent = '🎙️ Надиктовать заказ';
        button.setAttribute('aria-pressed', 'false');
        if (outcome.error) status.textContent = friendlyError(outcome.error);
        else if (outcome.timedOut) status.textContent = 'Распознавание завершилось по тайм-ауту. Полученные фразы сохранены для проверки.';
        else if (!outcome.segments.length) status.textContent = 'Фраз не распознано. Можно начать диктовку ещё раз.';
        else status.textContent = 'Диктовка остановлена. Проверьте распознанные данные перед заполнением карточки.';
      }
    });

    async function start() {
      if (starting || controller.active) return;
      starting = true;
      button.disabled = true;
      status.textContent = 'Проверяю доступ к распознаванию и микрофону…';
      try {
        if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
          if (!nativeSpeech) throw new Error('Speech recognition plugin is not loaded.');
          const available = await nativeSpeech.available();
          if (!available || !available.available) throw new Error('Speech recognition service is not available.');
          let permission = await nativeSpeech.checkPermissions();
          if (!permission || permission.speechRecognition !== 'granted') permission = await nativeSpeech.requestPermissions();
          if (!permission || permission.speechRecognition !== 'granted') throw new Error('Microphone permission denied.');
          if (!await controller.startNative()) throw new Error('Speech recognition could not start.');
        } else if (!controller.startBrowser()) throw new Error('Speech recognition is unavailable in this browser.');
        if (controller.active) status.textContent = transcriptParts.length ? 'Продолжаю диктовку этого заказа. Нажмите «Остановить диктовку», когда закончите.' : 'Слушаю по-русски. После короткой паузы продолжу автоматически; нажмите «Остановить диктовку», когда закончите.';
      } catch (error) {
        starting = false;
        button.disabled = false;
        button.textContent = '🎙️ Надиктовать заказ';
        status.textContent = friendlyError(error);
      }
    }

    button.addEventListener('click', async function (event) {
      event.preventDefault();
      if (controller.active || starting && controller.active) {
        button.disabled = true;
        status.textContent = 'Останавливаю диктовку…';
        await controller.stop();
      } else await start();
    });

    document.addEventListener('click', function (event) {
      if (event.target && event.target.closest && event.target.closest('#orders button, #clear') && (controller.active || starting || !review.hidden)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        alert(controller.active || starting ? 'Сначала остановите диктовку.' : 'Сначала примените или закройте голосовые предложения.');
        return;
      }
      if (event.target && event.target.id === 'save' && (controller.active || starting || !review.hidden)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        alert(controller.active || starting ? 'Сначала остановите диктовку.' : 'Сначала проверьте голосовые предложения: заполните свободные поля или закройте их.');
        return;
      }
      if (event.target && event.target.id === 'clear') {
        pending = Object.create(null);
        transcriptParts = [];
        currentPartial = '';
        review.hidden = true;
        setTimeout(clearProtection, 0);
      }
      if (event.target && event.target.id === 'save') {
        setTimeout(function () {
          transcriptParts = [];
          currentPartial = '';
          pending = Object.create(null);
          review.hidden = true;
        }, 0);
      }
    }, true);
    if (typeof window.loadOrder === 'function') {
      const loadOrder = window.loadOrder;
      window.loadOrder = function () {
        pending = Object.create(null);
        transcriptParts = [];
        currentPartial = '';
        review.hidden = true;
        protectedFields.clear();
        const result = loadOrder.apply(this, arguments);
        setTimeout(function () { protectCurrentValues(true); }, 0);
        return result;
      };
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startVoiceUi, { once: true });
  else startVoiceUi();
})();
