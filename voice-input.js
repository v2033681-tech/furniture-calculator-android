(function (root) {
  'use strict';

  const NUMBER_WORDS = Object.assign(Object.create(null), {
    ноль: 0,
    один: 1, одна: 1, одно: 1, одну: 1, одного: 1, одной: 1,
    два: 2, две: 2, двух: 2, двум: 2,
    три: 3, трех: 3, трёх: 3, тремя: 3,
    четыре: 4, четырех: 4, четырёх: 4,
    пять: 5, пяти: 5, шесть: 6, шести: 6, семь: 7, семи: 7,
    восемь: 8, восьми: 8, девять: 9, девяти: 9, десять: 10, десяти: 10,
    одиннадцать: 11, одиннадцати: 11, двенадцать: 12, двенадцати: 12,
    тринадцать: 13, тринадцати: 13, четырнадцать: 14, четырнадцати: 14,
    пятнадцать: 15, пятнадцати: 15, шестнадцать: 16, шестнадцати: 16,
    семнадцать: 17, семнадцати: 17, восемнадцать: 18, восемнадцати: 18,
    девятнадцать: 19, девятнадцати: 19, двадцать: 20, двадцати: 20,
    тридцать: 30, тридцати: 30, сорок: 40, сорока: 40,
    пятьдесят: 50, пятидесяти: 50, шестьдесят: 60, шестидесяти: 60,
    семьдесят: 70, семидесяти: 70, восемьдесят: 80, восьмидесяти: 80,
    девяносто: 90, девяноста: 90, сто: 100, ста: 100,
    двести: 200, триста: 300, четыреста: 400, пятьсот: 500,
    шестьсот: 600, семьсот: 700, восемьсот: 800, девятьсот: 900,
    полтора: 1.5, полторы: 1.5
  });
  const SCALE_WORDS = { тысяча: 1000, тысячи: 1000, тысяч: 1000, тыс: 1000, миллион: 1000000, миллиона: 1000000, миллионов: 1000000 };
  const DATA_ANCHORS = '(?:лдсп|мдф|кромк\\p{L}*|пвх|петл\\p{L}*|скрыт\\p{L}*\\s+монтаж|тандем\\p{L}*|ручк\\p{L}*|евровинт\\p{L}*|минификс\\p{L}*|подпятник\\p{L}*|полкодержател\\p{L}*|кухонн\\p{L}*\\s+ножк\\p{L}*|цокол\\p{L}*|сушк\\p{L}*|заглушк\\p{L}*|крючк\\p{L}*|фланец|газлифт\\p{L}*|подъемник\\p{L}*|подъёмник\\p{L}*|тип-?он|штанг\\p{L}*|подсветк\\p{L}*|навес\\p{L}*|столешниц\\p{L}*|монтажн\\p{L}*\\s+шин\\p{L}*|проект\\p{L}*|прочее|кромк\\p{L}*|монтаж|установк\\p{L}*|работ\\p{L}*|перевозк\\p{L}*|доставк\\p{L}*|занос\\p{L}*|предоплат\\p{L}*|аванс\\p{L}*|общая\\s+стоимость|стоимость\\s+заказа|стоимость\\s+монтажа|стоимость\\s+установки|итого|всего|на\\s+сумму|клиент\\p{L}*|заказчик\\p{L}*|адрес|телефон|номер\\s+телефона|комментар\\p{L}*|примечан\\p{L}*|название\\s+заказа|название)';

  function normalize(text) {
    return String(text || '').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/[‐‑‒–—]/g, '-');
  }

  function tokensOf(text) {
    return Array.from(String(text).matchAll(/[\p{L}\d]+(?:[.,]\d+)?/gu), function (m) {
      return { text: normalize(m[0]), start: m.index, end: m.index + m[0].length };
    });
  }

  function parseNumberTokens(tokens, index) {
    const first = tokens[index];
    if (!first) return null;
    if (/^\d+(?:[.,]\d+)?$/.test(first.text)) {
      let value = Number(first.text.replace(',', '.'));
      let next = index + 1;
      if (tokens[next] && /^\d{3}$/.test(tokens[next].text) && /^\d+$/.test(first.text) && tokens[next].start - first.end <= 2) {
        value = Number(first.text + tokens[next].text);
        next += 1;
      }
      return { value: value, next: next, start: first.start, end: tokens[next - 1].end };
    }
    if (!Object.prototype.hasOwnProperty.call(NUMBER_WORDS, first.text) && !Object.prototype.hasOwnProperty.call(SCALE_WORDS, first.text)) return null;
    let total = 0;
    let group = 0;
    let position = index;
    let consumed = false;
    while (position < tokens.length) {
      const word = tokens[position].text;
      if (Object.prototype.hasOwnProperty.call(NUMBER_WORDS, word)) {
        group += NUMBER_WORDS[word];
        consumed = true;
        position += 1;
      } else if (Object.prototype.hasOwnProperty.call(SCALE_WORDS, word)) {
        const scale = SCALE_WORDS[word];
        total += (group || 1) * scale;
        group = 0;
        consumed = true;
        position += 1;
      } else {
        break;
      }
    }
    if (!consumed) return null;
    return { value: total + group, next: position, start: first.start, end: tokens[position - 1].end };
  }

  function findFirstNumber(text) {
    const tokens = tokensOf(text);
    for (let i = 0; i < tokens.length; i += 1) {
      const number = parseNumberTokens(tokens, i);
      if (number) return number;
    }
    return null;
  }

  function findLastNumberWithUnit(text) {
    const tokens = tokensOf(text);
    let found = null;
    const units = /^(?:лист\p{L}*|штук\p{L}*|шт|метр\p{L}*|м|единиц\p{L}*|комплект\p{L}*|руб\p{L}*)$/iu;
    for (let i = 0; i < tokens.length; i += 1) {
      const number = parseNumberTokens(tokens, i);
      if (!number) continue;
      const next = tokens[number.next];
      const between = next ? text.slice(number.end, next.start) : '';
      if (next && /^\s*$/.test(between) && units.test(next.text)) found = number;
      i = Math.max(i, number.next - 1);
    }
    return found;
  }

  function nextAnchorIndex(text, start) {
    const tail = text.slice(start);
    const punctuation = /[.;!?]/.exec(tail);
    let end = punctuation ? punctuation.index : tail.length;
    const anchor = new RegExp('(?<![\\p{L}\\p{N}_])' + DATA_ANCHORS + '(?![\\p{L}\\p{N}_])', 'iu').exec(tail);
    if (anchor && anchor.index > 0 && anchor.index < end) end = anchor.index;
    return start + end;
  }

  function quantityNear(text, start, end, options) {
    const opts = options || {};
    const afterEnd = nextAnchorIndex(text, end);
    let after = text.slice(end, Math.min(afterEnd, end + 100));
    if (opts.stripThickness) after = after.replace(/(?<![\p{L}\p{N}_])\d+(?:[.,]\d+)?\s*мм(?![\p{L}\p{N}_])/giu, ' ');
    const afterNumber = findFirstNumber(after);
    if (afterNumber) return afterNumber.value;

    const prefixStart = Math.max(0, start - 70);
    let before = text.slice(prefixStart, start);
    const lastBoundary = Math.max(before.lastIndexOf('.'), before.lastIndexOf(';'), before.lastIndexOf('!'), before.lastIndexOf('?'));
    before = before.slice(lastBoundary + 1);
    const priorAnchor = new RegExp('(?<![\\p{L}\\p{N}_])' + DATA_ANCHORS + '(?![\\p{L}\\p{N}_])', 'giu');
    let priorMatch;
    let priorIndex = -1;
    while ((priorMatch = priorAnchor.exec(before))) priorIndex = priorMatch.index + priorMatch[0].length;
    const hasPriorEntity = priorIndex >= 0;
    if (hasPriorEntity) before = before.slice(priorIndex);
    const beforeNumber = findLastNumberWithUnit(before);
    if (beforeNumber && (!hasPriorEntity || /(?<![\p{L}\p{N}_])(?:еще|ещё|добавь|плюс|дополнительно)(?![\p{L}\p{N}_])/iu.test(before))) return beforeNumber.value;
    return null;
  }

  function setValue(values, id, value, label, note, mode) {
    if (value === null || value === undefined || value === '' || Number.isNaN(value)) return;
    values[id] = { value: value, label: label, note: note || '', mode: mode || 'set', applied: false };
  }

  function parseVoiceOrder(transcript, hardwareCatalog) {
    const original = String(transcript || '').trim();
    const text = normalize(original);
    const values = Object.create(null);
    const notes = [];
    if (!text) return { values: values, notes: notes };
    const additive = /(?<![\p{L}\p{N}_])(?:добавь|еще|плюс|дополнительно)(?![\p{L}\p{N}_])/iu.test(text);
    const mode = additive ? 'add' : 'set';
    const catalog = Array.isArray(hardwareCatalog) ? hardwareCatalog : [];

    function captureField(pattern, id, label) {
      const match = pattern.exec(text);
      if (!match) return;
      const start = match.index + match[0].length;
      const end = nextAnchorIndex(text, start);
      const raw = original.slice(start, Math.min(end, start + 100)).replace(/^[\s:—-]+|[\s,.;:—-]+$/g, '').trim();
      if (raw) setValue(values, id, raw, label, '', 'set');
    }

    const titleExplicit = /(?<![\p{L}\p{N}_])(?:название(?: заказа)?|назови(?:те)? заказ)\s*[:—-]?\s*/iu.exec(text);
    if (titleExplicit) {
      const start = titleExplicit.index + titleExplicit[0].length;
      const end = nextAnchorIndex(text, start);
      const raw = original.slice(start, Math.min(end, start + 100)).replace(/^[\s:—-]+|[\s,.;:—-]+$/g, '').trim();
      if (raw) setValue(values, 'title', raw, 'Название заказа', '', 'set');
    }
    if (!values.title) {
      let lead = text.replace(/^\s*(?:(?:создай|создать|оформи|оформить|заведи|добавь|начни|новый|новое)\s+)?заказ(?![\p{L}\p{N}_])[\s.,:—-]*/iu, '');
      const firstData = new RegExp('(?<![\\p{L}\\p{N}_])' + DATA_ANCHORS + '(?![\\p{L}\\p{N}_])', 'iu').exec(lead);
      if (firstData) lead = lead.slice(0, firstData.index);
      lead = lead.replace(/^\s*(?:под\s+названием|название)\s*/iu, '').replace(/[\s,.;:—-]+$/g, '').trim();
      const originalLead = original.replace(/^\s*(?:(?:создай|создать|оформи|оформить|заведи|добавь|начни|новый|новое)\s+)?заказ(?![\p{L}\p{N}_])[\s.,:—-]*/iu, '');
      if (lead && !/^(?:клиент|адрес|телефон|комментарий|примечание|добавь|еще|плюс|дополнительно)(?![\p{L}\p{N}_])/iu.test(lead)) {
        setValue(values, 'title', originalLead.slice(0, lead.length).replace(/[\s,.;:—-]+$/g, '').trim(), 'Название заказа', '', 'set');
      }
    }

    captureField(/(?<![\p{L}\p{N}_])(?:клиент(?:а)?|заказчик)\s*[:—-]?\s*/iu, 'client', 'Клиент');
    captureField(/(?<![\p{L}\p{N}_])адрес\s*[:—-]?\s*/iu, 'address', 'Адрес');
    captureField(/(?<![\p{L}\p{N}_])(?:комментарий|примечание|заметка)\s*[:—-]?\s*/iu, 'note', 'Комментарий');

    const phoneMatch = /(?<![\p{L}\p{N}_])(?:телефон|номер\s+телефона)\s*[:—-]?\s*((?:\+?\d[\d\s()\-]{5,}\d))/iu.exec(text);
    if (phoneMatch) {
      const value = original.slice(phoneMatch.index + phoneMatch[0].indexOf(phoneMatch[1]), phoneMatch.index + phoneMatch[0].indexOf(phoneMatch[1]) + phoneMatch[1].length).trim();
      setValue(values, 'phone', value, 'Телефон', '', 'set');
    }

    const materialTypes = [
      { id: 'ld', regex: /(?<![\p{L}\p{N}_])лдсп(?![\p{L}\p{N}_])/giu, label: 'ЛДСП 16 мм', stripThickness: true },
      { id: 'md', regex: /(?<![\p{L}\p{N}_])мдф(?![\p{L}\p{N}_])/giu, label: 'МДФ AGT 18 мм', stripThickness: true }
    ];
    materialTypes.forEach(function (type) {
      const re = new RegExp(type.regex.source, 'giu');
      let match;
      while ((match = re.exec(text))) {
        const quantity = quantityNear(text, match.index, match.index + match[0].length, { stripThickness: type.stripThickness });
        setValue(values, type.id, quantity, type.label, '', mode);
      }
    });

    const edgeTypes = [
      { id: 'e04', regex: /(?:пвх\s*)?0[,.]4\s*(?:мм)?/giu, label: 'Кромка ПВХ 0,4 мм' },
      { id: 'e19', regex: /(?:1\s*(?:x|х|×|на)\s*19|один\s+на\s+девятнадцать)\s*(?:мм)?/giu, label: 'Кромка ПВХ 1×19 мм' },
      { id: 'e219', regex: /(?:2\s*(?:x|х|×|на)\s*19|два\s+на\s+девятнадцать)\s*(?:мм)?/giu, label: 'Кромка ПВХ 2×19 мм' },
      { id: 'e235', regex: /(?:2\s*(?:x|х|×|на)\s*35|два\s+на\s+тридцать\s+пять)\s*(?:мм)?/giu, label: 'Кромка ПВХ 2×35 мм' }
    ];
    edgeTypes.forEach(function (type) {
      const re = new RegExp(type.regex.source, 'giu');
      let match;
      while ((match = re.exec(text))) {
        const prefix = text.slice(Math.max(0, match.index - 20), match.index);
        if (!/кромк|пвх/iu.test(prefix)) continue;
        const quantity = quantityNear(text, match.index, match.index + match[0].length);
        setValue(values, type.id, quantity, type.label, '', mode);
      }
    });

    const hardwarePatterns = [
      { id: 'hw1', source: '(?<![\\p{L}\\p{N}_])петл(?:я|и|ю|ей|ями)\\s*(?:180|сто\\s+восемьдесят)(?:\\s*(?:°|градус\\p{L}*))?', label: catalog[1] || 'Петля 180°', specificHinge: true },
      { id: 'hw0', source: '(?<![\\p{L}\\p{N}_])петл(?:я|и|ю|ей|ями)\\s*(?:90|девяносто)(?:\\s*(?:°|градус\\p{L}*))?', label: catalog[0] || 'Петля 90°', specificHinge: true },
      { id: 'hw0', source: '(?<![\\p{L}\\p{N}_])петл(?:я|и|ю|ей|ями)(?![\\p{L}\\p{N}_])', label: catalog[0] || 'Петля 90°', genericHinge: true },
      { id: 'hw2', source: '(?<![\\p{L}\\p{N}_])скрыт(?:ый|ого|ому|ым)?\\s+монтаж(?![\\p{L}\\p{N}_])', label: catalog[2] || 'Скрытый монтаж' },
      { id: 'hw3', source: '(?<![\\p{L}\\p{N}_])тандем(?:\\s*-?\\s*бокс)?(?![\\p{L}\\p{N}_])', label: catalog[3] || 'Тандем-бокс' },
      { id: 'hw4', source: '(?<![\\p{L}\\p{N}_])ручк\\p{L}*', label: catalog[4] || 'Ручка-скоба' },
      { id: 'hw5', source: '(?<![\\p{L}\\p{N}_])евровинт\\p{L}*', label: catalog[5] || 'Евровинты' },
      { id: 'hw6', source: '(?<![\\p{L}\\p{N}_])минификс\\p{L}*', label: catalog[6] || 'Минификс (комплект)' },
      { id: 'hw7', source: '(?<![\\p{L}\\p{N}_])подпятник\\p{L}*', label: catalog[7] || 'Подпятники' },
      { id: 'hw8', source: '(?<![\\p{L}\\p{N}_])полкодержател\\p{L}*', label: catalog[8] || 'Полкодержатели' },
      { id: 'hw9', source: '(?<![\\p{L}\\p{N}_])(?:кухонн\\p{L}*\\s+)?ножк\\p{L}*', label: catalog[9] || 'Кухонные ножки' },
      { id: 'hw10', source: '(?<![\\p{L}\\p{N}_])цокол\\p{L}*', label: catalog[10] || 'Цоколь (метр)' },
      { id: 'hw11', source: '(?<![\\p{L}\\p{N}_])(?:сушк\\p{L}*|сушилк\\p{L}*)', label: catalog[11] || 'Сушка нержавеющая' },
      { id: 'hw12', source: '(?<![\\p{L}\\p{N}_])заглушк\\p{L}*', label: catalog[12] || 'Торцевая заглушка' },
      { id: 'hw13', source: '(?<![\\p{L}\\p{N}_])маленьк\\p{L}*\\s+крючк\\p{L}*|(?<![\\p{L}\\p{N}_])крючк\\p{L}*\\s+маленьк\\p{L}*', label: catalog[13] || 'Крючок маленький' },
      { id: 'hw14', source: '(?<![\\p{L}\\p{N}_])больш\\p{L}*\\s+крючк\\p{L}*|(?<![\\p{L}\\p{N}_])крючк\\p{L}*\\s+больш\\p{L}*', label: catalog[14] || 'Крючок большой' },
      { id: 'hw13', source: '(?<![\\p{L}\\p{N}_])крючк\\p{L}*', label: catalog[13] || 'Крючок маленький', genericHook: true },
      { id: 'hw15', source: '(?<![\\p{L}\\p{N}_])фланец\\p{L}*', label: catalog[15] || 'Фланец' },
      { id: 'hw16', source: '(?<![\\p{L}\\p{N}_])газлифт\\p{L}*', label: catalog[16] || 'Газлифт' },
      { id: 'hw17', source: '(?<![\\p{L}\\p{N}_])подъ?емник\\p{L}*', label: catalog[17] || 'Подъёмник DTC' },
      { id: 'hw18', source: '(?<![\\p{L}\\p{N}_])tip\\s*-?\\s*on(?![\\p{L}\\p{N}_])|(?<![\\p{L}\\p{N}_])тип\\s*-?\\s*он(?![\\p{L}\\p{N}_])', label: catalog[18] || 'Tip-on' },
      { id: 'hw19', source: '(?<![\\p{L}\\p{N}_])штанг\\p{L}*', label: catalog[19] || 'Штанга (метр)' },
      { id: 'hw20', source: '(?<![\\p{L}\\p{N}_])подсветк\\p{L}*(?:\\s+с\\s+монтаж\\p{L}*)?', label: catalog[20] || 'Подсветка с монтажом' },
      { id: 'hw21', source: '(?<![\\p{L}\\p{N}_])(?:пластиков\\p{L}*\\s+)?навес\\p{L}*\\s+пластиков\\p{L}*|(?<![\\p{L}\\p{N}_])пластиков\\p{L}*\\s+навес\\p{L}*', label: catalog[21] || 'Навес пластиковый' },
      { id: 'hw22', source: '(?<![\\p{L}\\p{N}_])(?:металлическ\\p{L}*\\s+)?навес\\p{L}*\\s+металлическ\\p{L}*|(?<![\\p{L}\\p{N}_])металлическ\\p{L}*\\s+навес\\p{L}*', label: catalog[22] || 'Навес металлический комплект' },
      { id: 'hw21', source: '(?<![\\p{L}\\p{N}_])навес\\p{L}*', label: catalog[21] || 'Навес пластиковый', genericCanopy: true },
      { id: 'hw23', source: '(?<![\\p{L}\\p{N}_])столешниц\\p{L}*', label: catalog[23] || 'Столешница' },
      { id: 'hw24', source: '(?<![\\p{L}\\p{N}_])монтажн\\p{L}*\\s+шин\\p{L}*', label: catalog[24] || 'Монтажная шина' },
      { id: 'hw25', source: '(?<![\\p{L}\\p{N}_])проект\\p{L}*', label: catalog[25] || 'Проект' },
      { id: 'hw26', source: '(?<![\\p{L}\\p{N}_])проч\\p{L}*', label: catalog[26] || 'Прочее (рубли)' }
    ];
    const consumedRanges = [];
    hardwarePatterns.filter(function (x) { return x.specificHinge; }).forEach(function (type) {
      const re = new RegExp(type.source, 'giu');
      let match;
      while ((match = re.exec(text))) consumedRanges.push({ start: match.index, end: match.index + match[0].length });
    });
    hardwarePatterns.forEach(function (type) {
      const re = new RegExp(type.source, 'giu');
      let match;
      while ((match = re.exec(text))) {
        if (type.genericHinge && consumedRanges.some(function (r) { return match.index < r.end && match.index + match[0].length > r.start; })) continue;
        const quantity = quantityNear(text, match.index, match.index + match[0].length);
        const note = type.genericHinge ? 'Тип петли не уточнён; выбрана «Петля 90°», проверьте поле.' : type.genericHook ? 'Размер крючка не уточнён; выбраны маленькие крючки, проверьте поле.' : type.genericCanopy ? 'Материал навеса не уточнён; выбран пластиковый, проверьте поле.' : '';
        setValue(values, type.id, quantity, type.label, note, mode);
      }
    });
    if (values.hw0 && values.hw0.note) notes.push(values.hw0.note);
    if (values.hw13 && values.hw13.note) notes.push(values.hw13.note);
    if (values.hw21 && values.hw21.note) notes.push(values.hw21.note);

    const amountPatterns = [
      { id: 'install', regex: /(?<![\p{L}\p{N}_])(?:стоимость\s+(?:монтажа|установки)|монтаж|установк\p{L}*)(?![\p{L}\p{N}_])/giu, label: 'Установка / монтаж, ₽', skip: /(?:скрыт\p{L}*\s+|с\s+)$/iu },
      { id: 'work', regex: /(?<![\p{L}\p{N}_])(?:стоимость\s+работы|работа)(?![\p{L}\p{N}_])/giu, label: 'Работа, ₽' },
      { id: 'transport', regex: /(?<![\p{L}\p{N}_])(?:перевозк\p{L}*|доставк\p{L}*)(?![\p{L}\p{N}_])/giu, label: 'Перевозка, ₽' },
      { id: 'lifting', regex: /(?<![\p{L}\p{N}_])занос\p{L}*(?![\p{L}\p{N}_])/giu, label: 'Занос, ₽' },
      { id: 'prepayment', regex: /(?<![\p{L}\p{N}_])(?:предоплат\p{L}*|аванс)(?![\p{L}\p{N}_])/giu, label: 'Предоплата, ₽' },
      { id: 'orderTotal', regex: /(?<![\p{L}\p{N}_])(?:общая\s+стоимость|стоимость\s+заказа|итого|общая\s+сумма|на\s+сумму|всего)(?![\p{L}\p{N}_])/giu, label: 'Общая стоимость, ₽' }
    ];
    amountPatterns.forEach(function (type) {
      const re = new RegExp(type.regex.source, 'giu');
      let match;
      while ((match = re.exec(text))) {
        if (type.skip && type.skip.test(text.slice(Math.max(0, match.index - 20), match.index))) continue;
        const quantity = quantityNear(text, match.index, match.index + match[0].length);
        setValue(values, type.id, quantity, type.label, '', mode);
      }
    });

    const statusMatch = /(?<![\p{L}\p{N}_])статус\s+(новый|в\s+работе|заказ\s+материалов|готов|установлен|закрыт)(?![\p{L}\p{N}_])/iu.exec(text);
    if (statusMatch) setValue(values, 'orderStatus', statusMatch[1].replace(/\s+/g, ' '), 'Статус', '', 'set');
    return { values: values, notes: notes };
  }

  function mergeSuggestions(previous, parsed) {
    const result = Object.assign(Object.create(null), previous || {});
    Object.keys(parsed && parsed.values || {}).forEach(function (id) {
      const incoming = parsed.values[id];
      const existing = result[id];
      let value = incoming.value;
      if (incoming.mode === 'add' && existing && Number.isFinite(Number(existing.value)) && Number.isFinite(Number(incoming.value))) {
        value = Number(existing.value) + Number(incoming.value);
      }
      result[id] = Object.assign({}, incoming, { value: value, applied: false });
    });
    return result;
  }

  function createRecognitionController(options) {
    const config = options || {};
    const nativeSpeech = config.nativeSpeech;
    const getBrowserRecognition = config.getBrowserRecognition || function () { return null; };
    const onState = config.onState || function () {};
    const onSegment = config.onSegment || function () {};
    const onPartial = config.onPartial || function () {};
    const onEnd = config.onEnd || function () {};
    const restartDelayMs = Math.max(0, Number(config.restartDelayMs ?? 350));
    const stopCallTimeoutMs = Math.max(100, Number(config.stopCallTimeoutMs ?? 2500));
    const stopResultTimeoutMs = Math.max(500, Number(config.stopResultTimeoutMs ?? 4000));
    const nativeFinalResultTimeoutMs = Math.max(500, Number(config.nativeFinalResultTimeoutMs ?? 2500));
    let activeSession = null;

    function isActive(session) {
      return !!session && !session.finished && activeSession === session;
    }

    function notifyState(session, waiting, stopping, extra) {
      onState(Object.assign({ active: isActive(session), mode: session.mode, waiting: !!waiting, stopping: !!stopping }, extra || {}));
    }

    function clearTimer(session, name) {
      if (session[name]) clearTimeout(session[name]);
      session[name] = null;
    }

    function detachNativeListeners(session) {
      const handles = session.listenerHandles.splice(0);
      handles.forEach(function (handle) {
        if (handle && typeof handle.remove === 'function') {
          try { Promise.resolve(handle.remove()).catch(function () {}); } catch (_) { /* listener may already be removed */ }
        }
      });
    }

    function samePhrase(left, right) {
      return normalize(left || '').replace(/[^\p{L}\p{N}]+/gu, '') === normalize(right || '').replace(/[^\p{L}\p{N}]+/gu, '');
    }

    function addSegment(session, text) {
      const value = String(text || '').trim();
      if (!value || !isActive(session)) return;
      if (session.segments.length && samePhrase(session.segments[session.segments.length - 1], value)) return;
      session.segments.push(value);
      onSegment(value, session.segments.slice());
    }

    function commitPartial(session) {
      const partial = String(session.currentPartial || '').trim();
      session.currentPartial = '';
      if (partial) addSegment(session, partial);
    }

    function finish(session, error, timedOut) {
      if (session.finished) return;
      if (session.nativeEvents) commitPartial(session);
      session.finished = true;
      clearTimer(session, 'restartTimer');
      clearTimer(session, 'nativeFinalTimer');
      const recognition = session.recognition;
      session.recognition = null;
      if (recognition) {
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        if (timedOut) {
          try { recognition.abort(); } catch (_) { /* recognizer may already be stopped */ }
        }
      }
      detachNativeListeners(session);
      if (session.nativeAttemptResolve) {
        session.nativeAttemptResolve();
        session.nativeAttemptResolve = null;
      }
      if (activeSession === session) activeSession = null;
      const outcome = { mode: session.mode, stopped: !!session.stopRequested, timedOut: !!timedOut, error: error || null, segments: session.segments.slice() };
      onState({ active: false, mode: session.mode, waiting: false, stopping: false });
      try { onEnd(outcome); } finally { session.resolve(outcome); }
    }

    function scheduleRestart(session, delay) {
      if (!isActive(session) || session.stopRequested || session.restartTimer) return;
      notifyState(session, true, false);
      session.restartTimer = setTimeout(function () {
        session.restartTimer = null;
        if (!isActive(session) || session.stopRequested) return;
        if (session.nativeEvents) runNativeEventAttempt(session);
        else if (session.mode === 'native') runLegacyNativeAttempt(session);
        else runBrowserAttempt(session);
      }, Math.max(0, delay ?? restartDelayMs));
    }

    function retryDelayFor(error, session) {
      const text = normalize(error && (error.message || error) || '');
      const code = String(error && error.code != null ? error.code : '');
      if (/^(?:6|7)$/.test(code) || /no speech|speech timeout|no match|didn't understand|не распозн|тишин/.test(text)) {
        session.transientFailures = 0;
        session.emptyRetries += 1;
        return Math.min(1500, restartDelayMs + Math.min(1200, session.emptyRetries * 100));
      }
      if (/^(?:5|8|11)$/.test(code) || /busy|занят|client side|server disconnected/.test(text)) {
        session.transientFailures += 1;
        if (session.transientFailures <= 4) return Math.min(2500, Math.max(250, restartDelayMs) * Math.pow(2, session.transientFailures - 1));
      }
      if (/^(?:1|2|4|10)$/.test(code) || /network|сеть|server error/.test(text)) {
        session.transientFailures += 1;
        if (session.transientFailures <= 3) return Math.min(4000, Math.max(300, restartDelayMs) * Math.pow(2, session.transientFailures));
      }
      return null;
    }

    async function runLegacyNativeAttempt(session) {
      if (!isActive(session) || session.stopRequested || session.currentTask) return;
      notifyState(session, false, false);
      let task;
      try {
        task = Promise.resolve(nativeSpeech.start({ language: 'ru-RU', maxResults: 1, partialResults: false, popup: false }));
      } catch (error) {
        task = Promise.reject(error);
      }
      session.currentTask = task;
      try {
        const result = await task;
        if (!isActive(session)) return;
        session.transientFailures = 0;
        const matches = Array.isArray(result && result.matches) ? result.matches : [];
        matches.forEach(function (match) { addSegment(session, match); });
        if (session.stopRequested) finish(session, null, false);
        else scheduleRestart(session, restartDelayMs);
      } catch (error) {
        if (!isActive(session)) return;
        if (session.stopRequested) {
          finish(session, null, false);
        } else {
          const retryDelay = retryDelayFor(error, session);
          if (retryDelay !== null) scheduleRestart(session, retryDelay);
          else finish(session, error, false);
        }
      } finally {
        if (session.currentTask === task) session.currentTask = null;
      }
    }

    function completeNativeAttempt(session, text) {
      if (!isActive(session) || !session.nativeAttemptActive) return;
      clearTimer(session, 'nativeFinalTimer');
      const finalText = String(text || session.currentPartial || '').trim();
      session.currentPartial = '';
      session.nativeAttemptActive = false;
      session.nativeSawEndOfSpeech = false;
      if (finalText) addSegment(session, finalText);
      if (session.nativeAttemptResolve) {
        session.nativeAttemptResolve();
        session.nativeAttemptResolve = null;
      }
      session.emptyRetries = 0;
      session.transientFailures = 0;
      if (session.stopRequested) finish(session, null, false);
      else scheduleRestart(session, restartDelayMs);
    }

    function handleNativeError(session, error) {
      if (!isActive(session) || !session.nativeAttemptActive) return;
      clearTimer(session, 'nativeFinalTimer');
      commitPartial(session);
      session.nativeAttemptActive = false;
      session.nativeSawEndOfSpeech = false;
      if (session.nativeAttemptResolve) {
        session.nativeAttemptResolve();
        session.nativeAttemptResolve = null;
      }
      if (session.stopRequested) {
        finish(session, null, false);
        return;
      }
      const retryDelay = retryDelayFor(error, session);
      if (retryDelay !== null) {
        notifyState(session, true, false, { transientError: error && (error.message || error.code) || 'recognition-error' });
        scheduleRestart(session, retryDelay);
      } else finish(session, error || new Error('Speech recognition failed.'), false);
    }

    function onNativePartial(session, event) {
      if (!isActive(session) || !session.nativeAttemptActive) return;
      const matches = Array.isArray(event && event.matches) ? event.matches : [];
      const phrase = String(matches[0] || '').trim();
      const hasFinalFlag = !!event && typeof event.isFinal === 'boolean';
      const isFinal = hasFinalFlag ? event.isFinal : session.nativeSawEndOfSpeech;
      if (isFinal) {
        completeNativeAttempt(session, phrase);
        return;
      }
      if (phrase) {
        session.currentPartial = phrase;
        onPartial(phrase, session.segments.slice());
      }
    }

    function onNativeListeningState(session, event) {
      if (!isActive(session)) return;
      const status = normalize(event && event.status || '');
      if (status === 'started') {
        session.nativeSawEndOfSpeech = false;
        notifyState(session, false, session.stopRequested);
      } else if (status === 'stopped' && session.nativeAttemptActive) {
        // The plugin emits this from onEndOfSpeech just before its final result callback.
        session.nativeSawEndOfSpeech = true;
        notifyState(session, true, session.stopRequested, { finalizing: true });
        clearTimer(session, 'nativeFinalTimer');
        session.nativeFinalTimer = setTimeout(function () {
          if (!isActive(session) || !session.nativeAttemptActive) return;
          const error = { code: 6, message: 'No speech input' };
          handleNativeError(session, error);
        }, nativeFinalResultTimeoutMs);
      }
    }

    async function runNativeEventAttempt(session) {
      if (!isActive(session) || session.stopRequested || session.nativeAttemptActive) return;
      if (session.currentTask) {
        scheduleRestart(session, Math.max(100, restartDelayMs));
        return;
      }
      session.nativeAttemptActive = true;
      session.nativeSawEndOfSpeech = false;
      session.currentPartial = '';
      let resolveAttempt;
      session.nativeAttemptDone = new Promise(function (resolve) { resolveAttempt = resolve; });
      session.nativeAttemptResolve = resolveAttempt;
      notifyState(session, false, false);
      let task;
      try {
        task = Promise.resolve(nativeSpeech.start({ language: 'ru-RU', maxResults: 1, partialResults: true, popup: false }));
      } catch (error) {
        task = Promise.reject(error);
      }
      session.currentTask = task;
      try {
        const result = await task;
        if (!isActive(session) || !session.nativeAttemptActive) return;
        // Some plugin implementations return a final match even in partial mode.
        const matches = Array.isArray(result && result.matches) ? result.matches : [];
        if (matches.length) completeNativeAttempt(session, matches[0]);
      } catch (error) {
        handleNativeError(session, error);
      } finally {
        if (session.currentTask === task) session.currentTask = null;
      }
    }

    async function attachNativeListeners(session) {
      const registrations = [
        ['partialResults', function (event) { onNativePartial(session, event); }],
        ['listeningState', function (event) { onNativeListeningState(session, event); }],
        ['recognitionError', function (event) { handleNativeError(session, event || new Error('Speech recognition failed.')); }]
      ];
      for (const registration of registrations) {
        const handle = await nativeSpeech.addListener(registration[0], registration[1]);
        if (handle) session.listenerHandles.push(handle);
        if (!isActive(session)) return;
      }
    }

    function runBrowserAttempt(session) {
      if (!isActive(session) || session.stopRequested) return;
      const Recognition = getBrowserRecognition();
      if (!Recognition) {
        finish(session, new Error('Speech recognition is unavailable in this browser.'), false);
        return;
      }
      let recognition;
      try { recognition = new Recognition(); }
      catch (error) { finish(session, error, false); return; }
      session.recognition = recognition;
      recognition.lang = 'ru-RU';
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onresult = function (event) {
        for (let i = event.resultIndex || 0; i < event.results.length; i += 1) {
          const item = event.results[i];
          if (item && item.isFinal && item[0]) addSegment(session, item[0].transcript);
        }
      };
      recognition.onerror = function (event) {
        if (!isActive(session) || session.stopRequested) return;
        const code = normalize(event && event.error || '');
        if (/^(?:no-speech|aborted)$/.test(code)) {
          onState({ active: true, mode: session.mode, waiting: true, stopping: false, transientError: code });
        } else {
          finish(session, event && (event.error || event.message) || new Error('Browser speech recognition failed.'), false);
        }
      };
      recognition.onend = function () {
        if (session.recognition === recognition) session.recognition = null;
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        if (!isActive(session)) return;
        if (session.stopRequested) finish(session, null, false);
        else scheduleRestart(session, restartDelayMs);
      };
      try { recognition.start(); }
      catch (error) { finish(session, error, false); }
    }

    function createSession(mode, initializing) {
      let resolve;
      const completion = new Promise(function (r) { resolve = r; });
      const session = {
        mode: mode, nativeEvents: mode === 'native-events', finished: false, stopRequested: false, restartTimer: null, nativeFinalTimer: null,
        currentTask: null, recognition: null, transientFailures: 0, emptyRetries: 0, segments: [], currentPartial: '',
        listenerHandles: [], nativeAttemptActive: false, nativeAttemptResolve: null, nativeAttemptDone: null, nativeSawEndOfSpeech: false,
        completion: completion, resolve: resolve, stopPromise: null
      };
      activeSession = session;
      onState({ active: true, mode: mode, waiting: false, stopping: false, initializing: !!initializing });
      return session;
    }

    async function startNative() {
      if (activeSession || !nativeSpeech) return false;
      const useEvents = typeof nativeSpeech.addListener === 'function';
      const session = createSession(useEvents ? 'native-events' : 'native', useEvents);
      if (!useEvents) {
        runLegacyNativeAttempt(session);
        return true;
      }
      try {
        await attachNativeListeners(session);
        if (!isActive(session)) return false;
        await runNativeEventAttempt(session);
        return true;
      } catch (error) {
        finish(session, error, false);
        throw error;
      }
    }

    function startBrowser() {
      if (activeSession) return false;
      const session = createSession('browser', false);
      runBrowserAttempt(session);
      return true;
    }

    function withTimeout(promise, ms) {
      let timer;
      return Promise.race([
        Promise.resolve(promise),
        new Promise(function (_, reject) { timer = setTimeout(function () { reject(new Error('speech-stop-timeout')); }, ms); })
      ]).finally(function () { clearTimeout(timer); });
    }

    function stop() {
      const session = activeSession;
      if (!session) return Promise.resolve(null);
      if (session.stopPromise) return session.stopPromise;
      const wasBetweenBrowserAttempts = !!session.restartTimer && session.mode === 'browser';
      const wasBetweenNativeAttempts = !!session.restartTimer || (!session.currentTask && !session.nativeAttemptActive);
      session.stopRequested = true;
      if (session.restartTimer) clearTimeout(session.restartTimer);
      session.restartTimer = null;
      notifyState(session, false, true);
      if (wasBetweenNativeAttempts || wasBetweenBrowserAttempts) {
        finish(session, null, false);
        return session.completion;
      }
      session.stopPromise = (async function () {
        if (session.nativeEvents) {
          if (session.currentTask) {
            try { await withTimeout(session.currentTask, stopCallTimeoutMs); } catch (_) { /* start may already have rejected */ }
          }
          if (isActive(session) && session.nativeAttemptActive) {
            try { await withTimeout(nativeSpeech.stop(), stopCallTimeoutMs); } catch (_) { /* bounded native stop */ }
            try { await withTimeout(session.nativeAttemptDone, stopResultTimeoutMs); }
            catch (_) { finish(session, null, true); }
          }
          if (isActive(session)) finish(session, null, false);
        } else if (session.mode === 'native') {
          try { await withTimeout(nativeSpeech.stop(), stopCallTimeoutMs); } catch (_) { /* bounded stop guard */ }
        } else if (session.recognition) {
          try { session.recognition.stop(); } catch (_) { /* onend or timeout will finish */ }
        }
        try { await withTimeout(session.completion, stopResultTimeoutMs); }
        catch (_) { finish(session, null, true); }
        return session.completion;
      })();
      return session.stopPromise;
    }

    return {
      startNative: startNative,
      startBrowser: startBrowser,
      stop: stop,
      get active() { return !!activeSession; },
      get mode() { return activeSession && activeSession.mode || null; }
    };
  }

  const api = { parse: parseVoiceOrder, mergeSuggestions: mergeSuggestions, createRecognitionController: createRecognitionController, parseNumber: function (text) { const found = findFirstNumber(text); return found ? found.value : null; } };
  root.FurnitureVoiceInput = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
