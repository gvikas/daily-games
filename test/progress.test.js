import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProgress, attemptsLeft, squares, MAX_ATTEMPTS } from '../engine/index.js';
import { createStopwatch } from '../engine/progress.js';

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}
const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };

test('three attempts: two strikes leave one, the third ends the case unsolved', () => {
  const p = createProgress(memoryStorage(), '004');
  assert.equal(MAX_ATTEMPTS, 3);
  assert.equal(attemptsLeft(p.load()), 3);
  assert.equal(attemptsLeft(p.strike(10)), 2);
  let s = p.strike(20);
  assert.equal(attemptsLeft(s), 1);
  assert.equal(s.outcome, null);
  s = p.strike(30);
  assert.equal(s.outcome, 'unsolved');
  assert.equal(s.seconds, 30);
  assert.equal(attemptsLeft(s), 0);
  assert.equal(squares(s), '🟥🟥🟥');
  assert.equal(p.strike(40).strikes, 3, 'nothing changes after the case is over');
  assert.equal(p.solve(50).outcome, 'unsolved');
});

test('solved on the third attempt shows two red and one green', () => {
  const p = createProgress(memoryStorage(), '004');
  p.strike(1); p.strike(2);
  const s = p.solve(99);
  assert.equal(s.outcome, 'solved');
  assert.equal(s.seconds, 99);
  assert.equal(squares(s), '🟥🟥🟩');
  assert.equal(squares(createProgress(memoryStorage(), 'x').solve(5)), '🟩');
});

test('attempts survive a reload, per case', () => {
  const store = memoryStorage();
  const a = createProgress(store, '004');
  a.strike(5); a.strike(6);
  assert.equal(attemptsLeft(createProgress(store, '004').load()), 1, 'reloading the page does not reset attempts');
  assert.equal(attemptsLeft(createProgress(store, '003').load()), 3, 'other cases are not affected');
  createProgress(store, '003').solve(12);
  const again = createProgress(store, '003').load();
  assert.deepEqual([again.outcome, again.seconds], ['solved', 12]);
});

test('reset clears the case and its extra keys, and nothing else', () => {
  const store = memoryStorage();
  store.setItem('case-004-intro-seen', '1');
  store.setItem('case-003-intro-seen', '1');
  const p = createProgress(store, '004', ['case-004-intro-seen']);
  p.strike(1); p.markStayTip();
  createProgress(store, '003').strike(1);
  const s = p.reset();
  assert.deepEqual(s, { strikes: 0, outcome: null, seconds: null, stayTip: false, startedAt: null, elapsed: 0 });
  assert.equal(store.getItem('case-004-progress'), null);
  assert.equal(store.getItem('case-004-intro-seen'), null);
  assert.equal(store.getItem('case-003-intro-seen'), '1');
  assert.equal(createProgress(store, '003').load().strikes, 1);
});

test('the staying-put tip is remembered per case', () => {
  const store = memoryStorage();
  assert.equal(createProgress(store, '004').load().stayTip, false);
  createProgress(store, '004').markStayTip();
  assert.equal(createProgress(store, '004').load().stayTip, true);
});

test('without localStorage the limit still holds for the session', () => {
  for (const storage of [null, throwing]) {
    const p = createProgress(storage, '004');
    p.strike(1); p.strike(2);
    assert.equal(attemptsLeft(p.load()), 1);
    assert.equal(p.strike(3).outcome, 'unsolved');
    assert.equal(p.load().outcome, 'unsolved');
    assert.doesNotThrow(() => p.reset());
    assert.equal(attemptsLeft(createProgress(storage, '004').load()), 3, 'a new page load starts over');
  }
});

test('a broken or tampered record is read safely', () => {
  const store = memoryStorage();
  store.setItem('case-004-progress', '{not json');
  assert.equal(attemptsLeft(createProgress(store, '004').load()), 3);
  store.setItem('case-004-progress', JSON.stringify({ strikes: 99, outcome: 'won' }));
  const s = createProgress(store, '004').load();
  assert.deepEqual([s.strikes, s.outcome], [3, null]);
  assert.equal(attemptsLeft(s), 0);
});

test('the start time is set once and survives a reload', () => {
  const store = memoryStorage();
  assert.equal(createProgress(store, '004').start(1000).startedAt, 1000);
  assert.equal(createProgress(store, '004').start(5000).startedAt, 1000, 'a later start does not move the clock');
  assert.equal(createProgress(store, '004').reset().startedAt, null);
});

// --- The clock counts only visible time ---

test('the stopwatch counts only while it runs: hidden time does not count', () => {
  const w = createStopwatch();
  assert.equal(w.elapsed(1000), 0, 'not started');
  w.start(1000);
  assert.equal(w.elapsed(4000), 3000);
  w.pause(4000); // the page is hidden
  assert.equal(w.elapsed(60000), 3000, 'a minute in another tab adds nothing');
  w.start(60000); // visible again
  assert.equal(w.elapsed(62000), 5000);
  w.start(61000); // a second start while running changes nothing
  assert.equal(w.elapsed(62000), 5000);
  w.pause(62000); w.pause(70000);
  assert.equal(w.elapsed(90000), 5000, 'a second pause changes nothing');
  assert.equal(w.running, false);
});

test('the visible time is saved, and a case opened again later continues from it', () => {
  const store = memoryStorage();
  const p = createProgress(store, '007');
  p.start(1000);
  const w = createStopwatch(p.load().elapsed);
  w.start(1000);
  p.saveElapsed(w.elapsed(41000)); // 40 s of play, then the tab is closed
  // An hour later the case is opened again.
  const again = createProgress(store, '007').load();
  assert.equal(again.elapsed, 40000);
  const w2 = createStopwatch(again.elapsed);
  w2.start(3_600_000);
  assert.equal(Math.floor(w2.elapsed(3_620_000) / 1000), 60, 'the hour away does not count');
  assert.equal(createProgress(store, '007').solve(60).seconds, 60);
});

test('saved visible time never goes back, stops when the case is over, and is cleared by reset', () => {
  const store = memoryStorage();
  const p = createProgress(store, '007');
  p.saveElapsed(5000);
  assert.equal(p.saveElapsed(3000).elapsed, 5000, 'an older value from another tab does not win');
  p.solve(5);
  assert.equal(p.saveElapsed(9000).elapsed, 5000, 'nothing is added after the case is solved');
  assert.equal(p.reset().elapsed, 0);
  store.setItem('case-007-progress', JSON.stringify({ strikes: 0, startedAt: 1000 })); // saved before this change
  assert.equal(createProgress(store, '007').load().elapsed, 0);
  assert.equal(createStopwatch(-5).elapsed(0), 0);
});
