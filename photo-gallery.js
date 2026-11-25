(function (root) {
  'use strict';

  function attach(options) {
    const config = options || {};
    const getPhotos = config.getPhotos || function () { return []; };
    const resolvePhoto = config.resolvePhoto || function (photo) { return Promise.resolve(photo); };
    const onDelete = config.onDelete || function () { return Promise.resolve(false); };
    const preview = document.getElementById('photoPreview');
    if (!preview) return { open: function () {} };

    const overlay = document.createElement('div');
    overlay.className = 'photo-viewer';
    overlay.hidden = true;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Просмотр фотографий заказа');
    overlay.innerHTML = '<button type="button" class="photo-close" aria-label="Закрыть просмотр">×</button><button type="button" class="photo-prev" aria-label="Предыдущая фотография">‹</button><div class="photo-stage"><img alt="Фотография заказа"><div class="photo-message" role="status"></div></div><button type="button" class="photo-next" aria-label="Следующая фотография">›</button><div class="photo-count" aria-live="polite"></div><button type="button" class="photo-delete danger">Удалить фото</button>';
    document.body.append(overlay);

    const image = overlay.querySelector('img');
    const stage = overlay.querySelector('.photo-stage');
    const counter = overlay.querySelector('.photo-count');
    const message = overlay.querySelector('.photo-message');
    const previous = overlay.querySelector('.photo-prev');
    const next = overlay.querySelector('.photo-next');
    const remove = overlay.querySelector('.photo-delete');
    const closeButton = overlay.querySelector('.photo-close');
    let index = 0;
    let scale = 1;
    let offsetX = 0;
    let offsetY = 0;
    let pointers = new Map();
    let gestureStart = null;
    let pinchStart = null;
    let serial = 0;
    let previousFocus = null;

    function photos() { return Array.isArray(getPhotos()) ? getPhotos() : []; }
    function resetZoom() {
      scale = 1; offsetX = 0; offsetY = 0;
      image.style.transform = 'translate(0px, 0px) scale(1)';
      image.classList.remove('zoomed');
    }
    function updateControls() {
      const all = photos();
      counter.textContent = all.length ? (index + 1) + ' из ' + all.length : '';
      previous.disabled = all.length < 2;
      next.disabled = all.length < 2;
      previous.hidden = all.length < 2;
      next.hidden = all.length < 2;
      remove.hidden = !all.length;
    }
    async function show() {
      const all = photos();
      if (!all.length) { close(); return; }
      index = Math.max(0, Math.min(index, all.length - 1));
      const current = all[index];
      const currentSerial = ++serial;
      resetZoom();
      image.onload = null;
      image.onerror = null;
      image.removeAttribute('src');
      message.textContent = 'Загружаю фотографию…';
      image.onload = function () { if (currentSerial === serial) message.textContent = ''; };
      image.onerror = function () { if (currentSerial === serial) message.textContent = 'Не удалось отобразить фотографию. Проверьте подключение и права доступа к облачному файлу.'; };
      image.alt = current.caption ? 'Фотография заказа: ' + current.caption : 'Фотография заказа';
      updateControls();
      try {
        const resolved = await resolvePhoto(current);
        if (currentSerial !== serial || photos()[index] !== current) return;
        const src = resolved && (resolved.image || resolved.signedUrl) || '';
        if (!src) throw new Error('Пустой адрес фотографии');
        image.src = src;
      } catch (_) {
        if (currentSerial === serial) message.textContent = 'Не удалось загрузить эту фотографию. Проверьте подключение и войдите в облачный аккаунт.';
      }
    }
    function open(photoIndex) {
      const all = photos();
      if (!all.length) return;
      index = Math.max(0, Math.min(Number(photoIndex) || 0, all.length - 1));
      previousFocus = document.activeElement;
      overlay.hidden = false;
      document.body.classList.add('photo-view-open');
      show();
      closeButton.focus();
    }
    function close() {
      serial += 1;
      overlay.hidden = true;
      document.body.classList.remove('photo-view-open');
      pointers.clear();
      resetZoom();
      if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
    }
    function move(delta) {
      const all = photos();
      if (all.length < 2) return;
      index = (index + delta + all.length) % all.length;
      show();
    }
    function updateTransform() {
      scale = Math.max(1, Math.min(5, scale));
      image.style.transform = 'translate(' + offsetX + 'px, ' + offsetY + 'px) scale(' + scale + ')';
      image.classList.toggle('zoomed', scale > 1.01);
    }

    preview.addEventListener('click', function (event) {
      const target = event.target.closest('[data-photo-index]');
      if (target && preview.contains(target)) open(Number(target.dataset.photoIndex));
    });
    preview.addEventListener('keydown', function (event) {
      const target = event.target.closest('[data-photo-index]');
      if (target && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); open(Number(target.dataset.photoIndex)); }
    });
    overlay.addEventListener('click', function (event) { if (event.target === overlay) close(); });
    closeButton.addEventListener('click', close);
    previous.addEventListener('click', function () { move(-1); });
    next.addEventListener('click', function () { move(1); });
    remove.addEventListener('click', async function () {
      remove.disabled = true;
      try {
        if (await onDelete(index)) {
          if (!photos().length) close();
          else { index = Math.min(index, photos().length - 1); show(); }
        }
      } finally { remove.disabled = false; }
    });
    document.addEventListener('keydown', function (event) {
      if (overlay.hidden) return;
      if (event.key === 'Escape') close();
      else if (event.key === 'ArrowLeft' && scale <= 1.01) move(-1);
      else if (event.key === 'ArrowRight' && scale <= 1.01) move(1);
    });

    stage.addEventListener('pointerdown', function (event) {
      if (event.target !== image) return;
      stage.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 1) gestureStart = { x: event.clientX, y: event.clientY, offsetX: offsetX, offsetY: offsetY };
      if (pointers.size === 2) {
        const pts = Array.from(pointers.values());
        pinchStart = { distance: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), scale: scale };
        gestureStart = null;
      }
    });
    stage.addEventListener('pointermove', function (event) {
      if (!pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size >= 2 && pinchStart) {
        const pts = Array.from(pointers.values());
        const distance = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        scale = pinchStart.scale * distance / Math.max(1, pinchStart.distance);
        updateTransform();
      } else if (gestureStart && scale > 1.01) {
        offsetX = gestureStart.offsetX + event.clientX - gestureStart.x;
        offsetY = gestureStart.offsetY + event.clientY - gestureStart.y;
        updateTransform();
      }
    });
    function endPointer(event) {
      const start = gestureStart;
      const dx = start ? event.clientX - start.x : 0;
      pointers.delete(event.pointerId);
      if (pointers.size < 2) pinchStart = null;
      if (pointers.size === 1 && scale > 1.01) {
        const remaining = pointers.values().next().value;
        gestureStart = { x: remaining.x, y: remaining.y, offsetX: offsetX, offsetY: offsetY };
      }
      if (!pointers.size && scale <= 1.01 && Math.abs(dx) > 65) move(dx < 0 ? 1 : -1);
      if (!pointers.size) gestureStart = null;
    }
    stage.addEventListener('pointerup', endPointer);
    stage.addEventListener('pointercancel', endPointer);
    stage.addEventListener('wheel', function (event) {
      if (!overlay.hidden) { event.preventDefault(); scale += event.deltaY < 0 ? 0.2 : -0.2; updateTransform(); }
    }, { passive: false });

    return { open: open, close: close };
  }

  root.FurniturePhotoGallery = { attach: attach };
})(typeof globalThis !== 'undefined' ? globalThis : window);
