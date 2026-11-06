import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../engine/index.js';
import { makeCase } from './helpers.js';

const twoRooms = { rooms: ['X', 'Y'], suspects: ['A', 'B'], murder: { room: 'X', time: 't1' } };

test('exactly one solution', () => {
  const r = analyze(makeCase({
    ...twoRooms,
    clues: [{ type: 'at', person: 'A', room: 'X', time: 't1' }, { type: 'stayed', person: 'A', from: 't1' }],
    solution: { A: ['X', 'X'], B: ['Y', 'Y'] },
  }));
  assert.equal(r.solutionCount, 1);
  assert.equal(r.matchesSolution, true);
  assert.equal(r.ok, true);
});

test('2+ solutions are reported with two of them', () => {
  const r = analyze(makeCase({ ...twoRooms, clues: [{ type: 'at', person: 'A', room: 'X', time: 't1' }], solution: { A: ['X', 'X'], B: ['Y', 'Y'] } }));
  assert.equal(r.solutionCount, '2+');
  assert.equal(r.solutions.length, 2);
  assert.notDeepEqual(r.solutions[0], r.solutions[1]);
  assert.equal(r.ok, false);
});

test('a case without clues works and gives 2+', () => {
  const r = analyze(makeCase({ ...twoRooms, solution: { A: ['X', 'X'], B: ['Y', 'Y'] } }));
  assert.deepEqual(r.errors, []);
  assert.equal(r.solutionCount, '2+');
});

test('contradicting clues give 0 solutions and a minimal conflict', () => {
  const r = analyze(makeCase({
    ...twoRooms,
    clues: [
      { type: 'at', person: 'A', room: 'X', time: 't1' },
      { type: 'stayed', person: 'B', from: 't1' },
      { type: 'at', person: 'B', room: 'X', time: 't1' },
    ],
    solution: { A: ['X', 'X'], B: ['Y', 'Y'] },
  }));
  assert.equal(r.solutionCount, 0);
  assert.deepEqual(r.conflict.clues, [1, 3]);
  assert.equal(r.ok, false);
});

test('a unique solution that differs from "solution" is not ok', () => {
  const r = analyze(makeCase({
    ...twoRooms,
    clues: [{ type: 'at', person: 'A', room: 'X', time: 't1' }, { type: 'moved', person: 'A', from: 't1' }],
    solution: { A: ['X', 'X'], B: ['Y', 'Y'] },
  }));
  assert.equal(r.solutionCount, 1);
  assert.equal(r.matchesSolution, false);
  assert.equal(r.ok, false);
});

test('redundant clues are listed', () => {
  const r = analyze(makeCase({
    ...twoRooms,
    clues: [
      { type: 'at', person: 'A', room: 'X', time: 't1' },
      { type: 'stayed', person: 'A', from: 't1' },
      { type: 'at', person: 'A', room: 'X', time: 't1' }, // same as clue 1
    ],
    solution: { A: ['X', 'X'], B: ['Y', 'Y'] },
  }));
  assert.equal(r.solutionCount, 1);
  assert.deepEqual(r.redundantClues, [1, 3]);
});

test('the murderer can be decided before the board', () => {
  // Clue 1 alone names A as the murderer; clue 2 is needed to place everyone.
  const r = analyze(makeCase({
    ...twoRooms,
    clues: [{ type: 'at', person: 'A', room: 'X', time: 't1' }, { type: 'stayed', person: 'A', from: 't1' }],
    solution: { A: ['X', 'X'], B: ['Y', 'Y'] },
  }));
  assert.equal(r.murderer.person, 'A');
  assert.equal(r.murderDecidedEarly.murderClues, 1);
  assert.deepEqual(r.murderDecidedEarly.murderSets, [[1]]);
  assert.equal(r.murderDecidedEarly.boardClues, 2);
  assert.equal(r.murderDecidedEarly.early, true);
  assert.ok(r.warnings.some((w) => w.includes('murderer is decided by 1')));
});

test('a trivial control question is flagged', () => {
  const r = analyze(makeCase({
    ...twoRooms,
    clues: [{ type: 'at', person: 'A', room: 'X', time: 't1' }, { type: 'stayed', person: 'A', from: 't1' }],
    solution: { A: ['X', 'X'], B: ['Y', 'Y'] },
    controlQuestions: [{ person: 'B', time: 't1' }, { person: 'A', time: 't2', forAccused: 'B' }],
  }));
  const [q1, q2] = r.controlQuestions;
  assert.equal(q1.answer, 'Y');
  assert.deepEqual(q1.possibleRooms, ['Y']);
  assert.equal(q1.trivial, true);
  assert.equal(q2.assumedMurderer, 'B');
  assert.deepEqual(q2.possibleRooms, ['X', 'Y']);
  assert.equal(q2.trivial, false);
});

test('more than 12 clues switches point 6 to a greedy search and says so', () => {
  const clues = [];
  for (let i = 0; i < 13; i++) clues.push({ type: 'notAt', person: 'B', rooms: ['X'], time: i % 2 ? 't2' : 't1' });
  clues.push({ type: 'at', person: 'A', room: 'X', time: 't1' }, { type: 'stayed', person: 'A', from: 't1' });
  const r = analyze(makeCase({ ...twoRooms, clues, solution: { A: ['X', 'X'], B: ['Y', 'Y'] } }));
  assert.equal(r.solutionCount, 1);
  assert.equal(r.murderDecidedEarly.method, 'greedy');
  assert.ok(r.warnings.some((w) => w.includes('greedy')));
});
