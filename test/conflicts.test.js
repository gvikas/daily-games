import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { conflicts } from '../engine/index.js';

// A small case: rooms X - Y - Z in a line, suspects A, B, C, times t1..t3.
const mk = (constraint) => ({
  times: ['t1', 't2', 't3'],
  suspects: [{ id: 'A' }, { id: 'B' }, { id: 'C' }],
  clues: [{ id: 7, constraint }],
});
const P = (a = [], b = [], c = []) => ({ A: a, B: b, C: c });
const run = (constraint, placements, shown = [7]) => conflicts(mk(constraint), placements, shown);
const cells = (r) => (r.length ? r[0].cells.map((x) => `${x.person}@${x.time}`).sort() : []);

test('at: conflict when the person is elsewhere, or someone else is in the room', () => {
  const k = { type: 'at', person: 'A', room: 'X', time: 't2' };
  assert.deepEqual(cells(run(k, P([null, 'Y']))), ['A@t2']);
  assert.deepEqual(cells(run(k, P([], [null, 'X']))), ['B@t2']);
  assert.deepEqual(run(k, P([null, 'X'])), []);
  assert.deepEqual(run(k, P(['Y', null, 'Z'])), [], 'other times do not matter');
  assert.deepEqual(run(k, P()), [], 'nothing placed');
});

test('notAt without a time: conflict at any time the person is in one of the rooms', () => {
  const k = { type: 'notAt', person: 'B', rooms: ['X', 'Z'] };
  assert.deepEqual(cells(run(k, P([], ['X', 'Y', 'Z']))), ['B@t1', 'B@t3']);
  assert.deepEqual(run(k, P([], [null, 'Y'])), []);
  assert.deepEqual(run(k, P(['X', 'Z'])), [], 'another person in the room is fine');
});

test('notAt with a time: conflict only at that time', () => {
  const k = { type: 'notAt', person: 'B', rooms: ['X'], time: 't2' };
  assert.deepEqual(cells(run(k, P([], ['X', 'X', 'X']))), ['B@t2']);
  assert.deepEqual(run(k, P([], ['X', 'Y', 'X'])), []);
  assert.deepEqual(run(k, P([], ['X'])), [], 'partly placed');
});

test('stayed: conflict only when both cells are placed and differ', () => {
  const k = { type: 'stayed', person: 'C', from: 't1' };
  assert.deepEqual(cells(run(k, P([], [], ['X', 'Y']))), ['C@t1', 'C@t2']);
  assert.deepEqual(run(k, P([], [], ['X', 'X'])), []);
  assert.deepEqual(run(k, P([], [], ['X'])), [], 'partly placed');
  assert.deepEqual(run(k, P([], [], [null, 'Y'])), [], 'partly placed');
});

test('moved: conflict only when both cells are placed and equal', () => {
  const k = { type: 'moved', person: 'C', from: 't2' };
  assert.deepEqual(cells(run(k, P([], [], [null, 'Y', 'Y']))), ['C@t2', 'C@t3']);
  assert.deepEqual(run(k, P([], [], [null, 'Y', 'Z'])), []);
  assert.deepEqual(run(k, P([], [], [null, null, 'Z'])), [], 'partly placed');
});

test('swap: conflict when a is not where b was, b is not where a was, or one of them stays', () => {
  const k = { type: 'swap', a: 'A', b: 'B', from: 't1' };
  assert.deepEqual(run(k, P(['X', 'Y'], ['Y', 'X'])), [], 'a correct swap');
  assert.deepEqual(cells(run(k, P([null, 'Z'], ['Y']))), ['A@t2', 'B@t1'], 'a ended up where b was not');
  assert.deepEqual(cells(run(k, P(['X'], [null, 'Z']))), ['A@t1', 'B@t2'], 'b ended up where a was not');
  assert.deepEqual(cells(run(k, P(['X', 'X']))), ['A@t1', 'A@t2'], 'a stayed');
  assert.deepEqual(cells(run(k, P([], ['Y', 'Y']))), ['B@t1', 'B@t2'], 'b stayed');
});

test('swap with only one cell placed never conflicts', () => {
  const k = { type: 'swap', a: 'A', b: 'B', from: 't2' };
  for (const pl of [P([null, 'X']), P([null, null, 'X']), P([], [null, 'Y']), P([], [null, null, 'Z'])]) assert.deepEqual(run(k, pl), []);
  assert.deepEqual(run(k, P([null, 'X'], [null, 'Y'])), [], 'both before the swap say nothing on their own');
  assert.deepEqual(cells(run(k, P([null, 'X'], [null, null, 'Z']))), ['A@t2', 'B@t3'], 'a before and b after: b is not where a was');
});

test('a finding that has not been shown never conflicts', () => {
  const k = { type: 'at', person: 'A', room: 'X', time: 't1' };
  assert.equal(run(k, P(['Y']), []).length, 0);
  assert.equal(run(k, P(['Y']), new Set([1, 2])).length, 0);
  assert.equal(run(k, P(['Y']), [7]).length, 1);
});

test('several findings in conflict at once are all reported, in clue order', () => {
  const c = {
    times: ['t1', 't2'], suspects: [{ id: 'A' }, { id: 'B' }],
    clues: [
      { id: 1, constraint: { type: 'notAt', person: 'A', rooms: ['X'] } },
      { id: 2, constraint: { type: 'at', person: 'B', room: 'Y', time: 't1' } },
      { id: 3, constraint: { type: 'moved', person: 'A', from: 't1' } },
    ],
  };
  assert.deepEqual(conflicts(c, { A: ['X', 'X'], B: ['Z'] }, [1, 2, 3]).map((x) => x.clue), [1, 2, 3]);
  assert.deepEqual(conflicts(c, { A: ['X', 'X'], B: ['Z'] }, [2]).map((x) => x.clue), [2]);
});

// --- Every case in cases/ ---

const dir = new URL('../cases/', import.meta.url);
const cases = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => [f, JSON.parse(readFileSync(new URL(f, dir), 'utf8'))]);

test('the solution of every case gives no conflict with all findings shown, also when partly placed', () => {
  let seed = 11;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (const [f, c] of cases) {
    const all = c.clues.map((k) => k.id);
    assert.deepEqual(conflicts(c, c.solution, all), [], `${f}: the solution conflicts with its own findings`);
    for (let n = 0; n < 200; n++) {
      const partial = Object.fromEntries(Object.entries(c.solution).map(([p, row]) => [p, row.map((r) => (rnd() < 0.5 ? r : null))]));
      assert.deepEqual(conflicts(c, partial, all), [], `${f}: part of the solution conflicts: ${JSON.stringify(partial)}`);
    }
  }
});

test('findings that are not shown never give a conflict, whatever is placed', () => {
  let seed = 5;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return Math.floor((seed / 2147483648) * n); };
  for (const [f, c] of cases) {
    const rooms = c.rooms.map((r) => r.id);
    const ids = c.clues.map((k) => k.id);
    for (let n = 0; n < 300; n++) {
      const placements = Object.fromEntries(c.suspects.map((s) => [s.id, c.times.map(() => (rnd(3) ? rooms[rnd(rooms.length)] : null))]));
      const shown = ids.filter(() => rnd(2));
      for (const x of conflicts(c, placements, shown)) assert.ok(shown.includes(x.clue), `${f}: finding ${x.clue} is not shown but conflicts`);
      assert.deepEqual(conflicts(c, placements, []), [], `${f}: no findings shown, but a conflict`);
    }
  }
});
