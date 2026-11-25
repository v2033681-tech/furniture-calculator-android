const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.handlers = Object.create(null);
    this.children = [];
    this.dataset = Object.create(null);
    this.attributes = Object.create(null);
    this.style = Object.create(null);
    this.hidden = false;
    this.textContent = '';
    this._src = '';
    this.classes = new Set();
    this.classList = {
      add: name => this.classes.add(name),
      remove: name => this.classes.delete(name),
      toggle: (name, force) => {
        const enabled = force === undefined ? !this.classes.has(name) : !!force;
        if (enabled) this.classes.add(name);
        else this.classes.delete(name);
        return enabled;
      }
    };
  }
  set className(value) { this.classes = new Set(String(value).split(/\s+/).filter(Boolean)); }
  get className() { return Array.from(this.classes).join(' '); }
  set innerHTML(_) {
    this.parts = {
      img: new FakeElement('img'),
      '.photo-stage': new FakeElement('div'),
      '.photo-count': new FakeElement('div'),
      '.photo-message': new FakeElement('div'),
      '.photo-prev': new FakeElement('button'),
      '.photo-next': new FakeElement('button'),
      '.photo-delete': new FakeElement('button'),
      '.photo-close': new FakeElement('button')
    };
  }
  querySelector(selector) { return this.parts && this.parts[selector] || null; }
  addEventListener(name, callback) {
    if (!this.handlers[name]) this.handlers[name] = [];
    this.handlers[name].push(callback);
  }
  dispatch(name, event) {
    for (const callback of this.handlers[name] || []) callback(event);
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  removeAttribute(name) { delete this.attributes[name]; if (name === 'src') this._src = ''; }
  append(...items) { this.children.push(...items); }
  appendChild(item) { this.children.push(item); }
  contains(item) { return this === item || this.children.includes(item); }
  closest(selector) { return selector === '[data-photo-index]' && this.dataset.photoIndex != null ? this : null; }
  setPointerCapture(pointerId) { this.capturedPointer = pointerId; }
  focus() {}
  set src(value) {
    this._src = value;
    if (typeof this.onload === 'function') this.onload();
  }
  get src() { return this._src; }
}

test('gallery entry point opens the fullscreen viewer, swipes from blank stage area, and zooms by pinch', async () => {
  const preview = new FakeElement('div');
  const body = new FakeElement('body');
  const document = {
    body,
    activeElement: new FakeElement('body'),
    getElementById(id) { return id === 'photoPreview' ? preview : null; },
    createElement(tag) { return new FakeElement(tag); },
    addEventListener() {}
  };
  const sandbox = { document, Promise, Array, Math, Map, String, Number, Object, Set, globalThis: null };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '..', 'photo-gallery.js'), 'utf8'),
    sandbox,
    { filename: 'photo-gallery.js' }
  );
  const photos = [{ image: 'photo-one' }, { image: 'photo-two' }];
  sandbox.FurniturePhotoGallery.attach({ getPhotos: () => photos });
  const overlay = body.children[0];
  const image = overlay.querySelector('img');
  const stage = overlay.querySelector('.photo-stage');
  const counter = overlay.querySelector('.photo-count');
  const thumbnail = new FakeElement('img');
  thumbnail.dataset.photoIndex = '0';
  preview.contains = target => target === thumbnail;

  preview.dispatch('click', { target: thumbnail });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(overlay.hidden, false, 'clicking a rendered thumbnail opens the fullscreen viewer');
  assert.equal(image.src, 'photo-one');

  // Start on the blank part of the stage: portrait images leave letterbox margins here.
  stage.dispatch('pointerdown', { target: stage, pointerId: 1, clientX: 300, clientY: 240, button: 0 });
  stage.dispatch('pointerup', { target: stage, pointerId: 1, clientX: 170, clientY: 240 });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(image.src, 'photo-two', 'a swipe beginning outside the image advances the gallery');
  assert.equal(counter.textContent, '2 из 2');

  stage.dispatch('pointerdown', { target: stage, pointerId: 2, clientX: 100, clientY: 100, button: 0 });
  stage.dispatch('pointerdown', { target: stage, pointerId: 3, clientX: 200, clientY: 100, button: 0 });
  stage.dispatch('pointermove', { target: stage, pointerId: 3, clientX: 300, clientY: 100 });
  assert.match(image.style.transform, /scale\(2\)/, 'two-finger pinch increases image scale');
});

test('Android touch events navigate and pinch the gallery without triggering a cancelled swipe', async () => {
  const preview = new FakeElement('div');
  const body = new FakeElement('body');
  const document = {
    body,
    activeElement: new FakeElement('body'),
    getElementById(id) { return id === 'photoPreview' ? preview : null; },
    createElement(tag) { return new FakeElement(tag); },
    addEventListener() {}
  };
  const sandbox = { document, navigator: { maxTouchPoints: 2 }, Promise, Array, Math, Map, String, Number, Object, Set, globalThis: null };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '..', 'photo-gallery.js'), 'utf8'),
    sandbox,
    { filename: 'photo-gallery.js' }
  );
  const photos = [{ image: 'photo-one' }, { image: 'photo-two' }, { image: 'photo-three' }];
  sandbox.FurniturePhotoGallery.attach({ getPhotos: () => photos });
  const overlay = body.children[0];
  const image = overlay.querySelector('img');
  const stage = overlay.querySelector('.photo-stage');
  const counter = overlay.querySelector('.photo-count');
  const thumbnail = new FakeElement('img');
  thumbnail.dataset.photoIndex = '0';
  preview.contains = target => target === thumbnail;
  preview.dispatch('click', { target: thumbnail });
  await new Promise(resolve => setTimeout(resolve, 0));

  let prevented = 0;
  const touch = (identifier, clientX, clientY) => ({ identifier, clientX, clientY });
  const dispatchTouch = (name, changedTouches) => stage.dispatch(name, {
    changedTouches,
    preventDefault() { prevented += 1; }
  });
  assert.equal(stage.handlers.pointerdown, undefined, 'touch devices use Touch Events without duplicate pointer handling');

  dispatchTouch('touchstart', [touch(1, 300, 240)]);
  dispatchTouch('touchmove', [touch(1, 170, 240)]);
  dispatchTouch('touchend', [touch(1, 170, 240)]);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(image.src, 'photo-two', 'horizontal touch swipe advances from the stage letterbox area');
  assert.equal(counter.textContent, '2 из 3');

  dispatchTouch('touchstart', [touch(2, 100, 100)]);
  dispatchTouch('touchstart', [touch(3, 200, 100)]);
  dispatchTouch('touchmove', [touch(3, 300, 100)]);
  assert.match(image.style.transform, /scale\(2\)/, 'two-finger Android touch pinch zooms the image');
  dispatchTouch('touchend', [touch(3, 300, 100)]);
  dispatchTouch('touchend', [touch(2, 100, 100)]);

  dispatchTouch('touchstart', [touch(4, 300, 240)]);
  dispatchTouch('touchmove', [touch(4, 100, 240)]);
  dispatchTouch('touchcancel', [touch(4, 100, 240)]);
  assert.equal(counter.textContent, '2 из 3', 'a cancelled Android gesture never advances the gallery');
  assert.ok(prevented >= 5, 'touch gestures prevent WebView page scrolling and browser zoom interception');
});
