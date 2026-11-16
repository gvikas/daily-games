import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProgress, attemptsLeft, squares, MAX_ATTEMPTS } from '../engine/index.js';

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
  assert.deepEqual(s, { strikes: 0, outcome: null, seconds: null, stayTip: false });
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
