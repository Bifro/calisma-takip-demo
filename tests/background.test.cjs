const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function scene(reduced = false, storage = new Map()) {
  const scripts = [...fs.readFileSync('index.html', 'utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)];
  const events = {}, frames = new Map();
  let clock = 0, next = 0, strokes = 0, motionChange;
  class Element {
    constructor(isBlank = true) { this.isBlank = isBlank; }
    matches() { return this.isBlank; }
  }
  const ctx = new Proxy({}, {get(_, key) {
    if (key === 'stroke') return () => strokes++;
    if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({addColorStop() {}});
    return () => {};
  }, set() { return true; }});
  const motion = {matches: reduced, addEventListener(_, fn) { motionChange = fn; }};
  const canvas = {getContext: () => ctx};
  const document = {hidden: false, getElementById: () => canvas, querySelector: () => null,
    addEventListener(type, fn) { events[type] = fn; }};
  const window = {innerWidth: 390, innerHeight: 844, devicePixelRatio: 2, scrollY: 0,
    matchMedia: () => motion, addEventListener() {}};
  vm.runInNewContext(scripts.at(-1)[1], {window, document, Element,
    localStorage: {getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value)},
    performance: {now: () => clock}, Date, Math,
    requestAnimationFrame(fn) { frames.set(++next, fn); return next; },
    cancelAnimationFrame(id) { frames.delete(id); }});
  function frame(time) {
    clock = time; strokes = 0;
    const pending = [...frames.values()]; frames.clear();
    pending.forEach(fn => fn(clock)); return strokes;
  }
  function tap({blank = true, move = 0, scroll = 0} = {}) {
    const target = new Element(blank);
    events.pointerdown({isPrimary: true, button: 0, pointerId: 1, clientX: 190, clientY: 450, target});
    window.scrollY += scroll;
    events.pointerup({pointerId: 1, clientX: 190 + move, clientY: 450, target});
  }
  return {frame, tap, frames, document, events, motion, window,
    changeMotion(value) { motion.matches = value; motionChange(); }};
}

test('blank-space taps add a temporary meteor shower; controls and scroll gestures do not', () => {
  const s = scene();
  assert.equal(s.frame(100), 42);
  s.tap({blank: false}); assert.equal(s.frame(300), 42);
  s.tap({move: 30}); assert.equal(s.frame(500), 42);
  s.tap({scroll: 50}); assert.equal(s.frame(700), 42);
  s.tap(); assert.ok(s.frame(1000) > 42);
  assert.equal(s.frame(4000), 42);
});

test('reduced motion disables animation and hiding the app stops pending frames', () => {
  const s = scene(true);
  assert.equal(s.frames.size, 0);
  s.tap(); assert.equal(s.frame(1000), 0);
  s.changeMotion(false); assert.equal(s.frame(1100), 42);
  s.tap(); s.document.hidden = true; s.events.visibilitychange();
  assert.equal(s.frames.size, 0);
  s.document.hidden = false; s.events.visibilitychange();
  assert.equal(s.frame(5000), 42);
  s.changeMotion(true); assert.equal(s.frames.size, 0);
});

test('rapid repeated taps keep the scene bounded and it returns to its quiet state', () => {
  const s = scene(); s.frame(100);
  for (let i = 0; i < 100; i++) { s.tap(); s.frame(110 + i * 10); }
  assert.ok(s.frame(1200) <= 42 + 60 + 3 + 3);
  assert.equal(s.frame(5000), 42);
  assert.equal(s.frames.size, 1);
});

test('classic mode restores the previous scene immediately and persists across launches', () => {
  const storage = new Map(), s = scene(false, storage);
  s.frame(100); s.tap();
  assert.ok(s.frame(2000) > 42, 'the constellation lingers after the shower');
  s.window.setSpaceScene('classic'); assert.equal(s.frame(2100), 42);
  const next = scene(false, storage);
  assert.equal(next.window.spaceSceneMode(), 'classic');
  next.frame(100); next.tap(); assert.equal(next.frame(2000), 42);
  next.window.setSpaceScene('cosmic'); assert.equal(storage.get('ct_space_scene'), 'cosmic');
});
