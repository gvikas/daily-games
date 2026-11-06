import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../engine/index.js';
import { makeCase } from './helpers.js';

const errorsOf = (c) => analyze(c).errors;
const hasError = (c, text) => {
  const errs = errorsOf(c);
  assert.ok(errs.some((e) => e.includes(text)), `expected an error containing "${text}", got ${JSON.stringify(errs)}`);
};
const ok = makeCase({ solution: { A: ['X', 'X'], B: ['Y', 'Y'] } });

test('a well-formed case has no validation errors', () => {
  assert.deepEqual(errorsOf(ok), []);
});

test('door to a room that does not exist', () => {
  hasError({ ...ok, doors: [['X', 'Q']] }, 'unknown room "Q"');
});

test('a door from a room to itself', () => {
  hasError({ ...ok, doors: [['X', 'X']] }, 'two different rooms');
});

test('more suspects than rooms', () => {
  hasError(makeCase({ rooms: ['X'], suspects: ['A', 'B'] }), 'only 1 rooms');
});

test('duplicate ids and times', () => {
  hasError({ ...ok, rooms: [...ok.rooms, { id: 'X', name: 'X again' }] }, 'duplicate id "X"');
  hasError({ ...ok, suspects: [...ok.suspects, { id: 'A', name: 'A2' }] }, 'duplicate id "A"');
  hasError({ ...ok, times: ['t1', 't1'] }, 'duplicate time');
});

test('unknown ids in murder, clues and control questions', () => {
  hasError({ ...ok, murder: { room: 'Q', time: 't1' } }, 'murder: unknown room');
  hasError({ ...ok, murder: { room: 'X', time: 'noon' } }, 'murder: unknown time');
  hasError(makeCase({ clues: [{ type: 'at', person: 'Q', room: 'X', time: 't1' }] }), 'unknown suspect "Q"');
  hasError(makeCase({ clues: [{ type: 'notAt', person: 'A', rooms: ['Q'] }] }), 'unknown room "Q"');
  hasError(makeCase({ clues: [{ type: 'teleport', person: 'A' }] }), 'constraint.type');
  hasError({ ...ok, controlQuestions: [{ person: 'A', time: 'noon' }] }, 'unknown time "noon"');
  hasError({ ...ok, controlQuestions: [{ person: 'A', time: 't1', forAccused: 'Q' }] }, 'unknown suspect "Q"');
});

test('swap, stayed and moved from the last time are validation errors', () => {
  hasError(makeCase({ clues: [{ type: 'swap', a: 'A', b: 'B', from: 't2' }] }), 'cannot be the last time');
  hasError(makeCase({ clues: [{ type: 'stayed', person: 'A', from: 't2' }] }), 'cannot be the last time');
  hasError(makeCase({ clues: [{ type: 'moved', person: 'A', from: 't2' }] }), 'cannot be the last time');
});

test('swap with the same suspect twice', () => {
  hasError(makeCase({ clues: [{ type: 'swap', a: 'A', b: 'A', from: 't1' }] }), 'must be different suspects');
});

test('duplicate clue ids', () => {
  const c = makeCase({ clues: [{ type: 'stayed', person: 'A', from: 't1' }, { type: 'moved', person: 'B', from: 't1' }] });
  c.clues[1].id = 1;
  hasError(c, 'duplicate id "1"');
});

test('solution with the wrong shape', () => {
  hasError({ ...ok, solution: { A: ['X'], B: ['Y', 'Y'] } }, '"A" must have 2 rooms');
  hasError({ ...ok, solution: { A: ['X', 'Q'], B: ['Y', 'Y'] } }, 'unknown room "Q"');
  hasError({ ...ok, solution: { A: ['X', 'X'], B: ['Y', 'Y'], Z: ['Z', 'Z'] } }, 'unknown suspect "Z"');
  hasError({ ...ok, solution: undefined }, 'solution: must be an object');
});

test('solution that breaks a rule', () => {
  hasError({ ...ok, solution: { A: ['X', 'X'], B: ['X', 'Y'] } }, 'rule 2');
  hasError({ ...ok, solution: { A: ['X', 'Z'], B: ['Y', 'Y'] } }, 'rule 3');
  hasError({ ...ok, solution: { A: ['Z', 'Z'], B: ['Y', 'Y'] } }, 'rule 5');
});

test('solution that breaks a clue names the clue', () => {
  const c = makeCase({ clues: [{ type: 'moved', person: 'A', from: 't1' }], solution: { A: ['X', 'X'], B: ['Y', 'Y'] } });
  hasError(c, 'solution breaks clue 1');
  assert.equal(analyze(c).ok, false);
});

test('a structurally broken case stops after validation', () => {
  const r = analyze({ ...ok, doors: 'nope' });
  assert.equal(r.solutionCount, null);
  assert.equal(r.ok, false);
});
