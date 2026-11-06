import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeCase, allSolutions, bruteForce } from './helpers.js';

// Two suspects, three rooms in a line X - Y - Z, two times. Murder in X at t1 keeps the space small.
const base = { suspects: ['A', 'B'], murder: { room: 'X', time: 't1' } };
const sols = (clues) => allSolutions(makeCase({ ...base, clues })).map((s) => JSON.parse(s));
const check = (clues) => assert.deepEqual(allSolutions(makeCase({ ...base, clues })), bruteForce(makeCase({ ...base, clues })));

test('at: the suspect was in the room at that time', () => {
  const all = sols([{ type: 'at', person: 'B', room: 'Z', time: 't2' }]);
  assert.ok(all.length > 0);
  assert.ok(all.every((s) => s.B[1] === 'Z'));
  check([{ type: 'at', person: 'B', room: 'Z', time: 't2' }]);
});

test('notAt with a time: excluded only at that time', () => {
  const clue = { type: 'notAt', person: 'B', rooms: ['Y'], time: 't1' };
  const all = sols([clue]);
  assert.ok(all.every((s) => s.B[0] !== 'Y'));
  assert.ok(all.some((s) => s.B[1] === 'Y'));
  check([clue]);
});

test('notAt without a time: excluded all night', () => {
  const clue = { type: 'notAt', person: 'B', rooms: ['Y', 'Z'] };
  assert.ok(sols([clue]).every((s) => s.B[0] === 'X' && s.B[1] === 'X'));
  check([clue]);
  const clue2 = { type: 'notAt', person: 'B', rooms: ['Y'] };
  assert.ok(sols([clue2]).every((s) => !s.B.includes('Y')));
  check([clue2]);
});

test('swap: a and b traded rooms between from and the next time', () => {
  const clue = { type: 'swap', a: 'A', b: 'B', from: 't1' };
  const all = sols([clue]);
  assert.ok(all.length > 0);
  assert.ok(all.every((s) => s.A[1] === s.B[0] && s.B[1] === s.A[0] && s.A[0] !== s.B[0]));
  check([clue]);
});

test('stayed: the suspect did not move', () => {
  const clue = { type: 'stayed', person: 'B', from: 't1' };
  const all = sols([clue]);
  assert.ok(all.length > 0 && all.every((s) => s.B[0] === s.B[1]));
  check([clue]);
});

test('moved: the suspect went to another room', () => {
  const clue = { type: 'moved', person: 'B', from: 't1' };
  const all = sols([clue]);
  assert.ok(all.length > 0 && all.every((s) => s.B[0] !== s.B[1]));
  check([clue]);
});

test('stayed and moved together are impossible', () => {
  assert.equal(sols([{ type: 'stayed', person: 'B', from: 't1' }, { type: 'moved', person: 'B', from: 't1' }]).length, 0);
});
