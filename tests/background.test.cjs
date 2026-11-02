const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function scene(reduced = false, storage = new Map(), random = Math.random) {
  const scripts = [...fs.readFileSync('index.html', 'utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)];
  const events = {}, frames = new Map();
  let clock = 0, next = 0, strokes = 0, motionChange, labels = [];
  class Element {
    constructor(isBlank = true) { this.isBlank = isBlank; }
    matches() { return this.isBlank; }
  }
  const ctx = new Proxy({}, {get(_, key) {
    if (key === 'stroke') return () => strokes++;
    if (key === 'fillText') return name => labels.push(name);
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
    performance: {now: () => clock}, Date, Math: Object.assign(Object.create(Math), {random}),
    requestAnimationFrame(fn) { frames.set(++next, fn); return next; },
    cancelAnimationFrame(id) { frames.delete(id); }});
  function frame(time) {
    clock = time; strokes = 0; labels = [];
    const pending = [...frames.values()]; frames.clear();
    pending.forEach(fn => fn(clock)); return strokes;
  }
  function tap({blank = true, move = 0, scroll = 0} = {}) {
    const target = new Element(blank);
    events.pointerdown({isPrimary: true, button: 0, pointerId: 1, clientX: 190, clientY: 450, target});
    window.scrollY += scroll;
    events.pointerup({pointerId: 1, clientX: 190 + move, clientY: 450, target});
  }
  return {frame, tap, frames, document, events, motion, window, labels: () => labels,
    changeMotion(value) { motion.matches = value; motionChange(); }};
}

test('blank-space taps add a temporary meteor shower; controls and scroll gestures do not', () => {
  const s = scene();
  assert.equal(s.frame(100), 42);
  s.tap({blank: false}); assert.equal(s.frame(300), 42);
  s.tap({move: 30}); assert.equal(s.frame(500), 42);
  s.tap({scroll: 50}); assert.equal(s.frame(700), 42);
  s.tap(); assert.ok(s.frame(1000) > 42);
  assert.equal(s.frame(5000), 42);
});

test('zodiac taps can show all twelve names and never repeat the previous constellation', () => {
  let seed=17;
  const s=scene(false,new Map(),()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296));
  const seen=new Set();let previous;
  for(let i=0;i<120;i++){
    const now=100+i*5000;s.frame(now);s.tap();s.frame(now+1700);
    const names=s.labels();assert.equal(names.length,1);
    assert.notEqual(names[0],previous);previous=names[0];seen.add(names[0]);
  }
  assert.deepEqual([...seen].sort(),['Koç','Boğa','İkizler','Yengeç','Aslan','Başak','Terazi','Akrep','Yay','Oğlak','Kova','Balık'].sort());
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
