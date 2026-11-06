import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from '../engine/index.js';

// 6 rooms, 6 suspects, 5 times, 10 clues, one solution. Made once by a throwaway script (not a generator).
const data = JSON.parse(readFileSync(new URL('./fixtures/synthetic-6x6x5.json', import.meta.url), 'utf8'));

test('synthetic 6 x 6 x 5 case gives a full report in under 5 seconds', () => {
  assert.equal(data.rooms.length, 6);
  assert.equal(data.suspects.length, 6);
  assert.equal(data.times.length, 5);
  const t0 = performance.now();
  const r = analyze(data);
  const ms = performance.now() - t0;
  assert.equal(r.solutionCount, 1);
  assert.equal(r.ok, true);
  assert.equal(r.murderDecidedEarly.method, 'exhaustive');
  assert.ok(Array.isArray(r.controlQuestions) && r.controlQuestions.length === 1);
  assert.ok(ms < 5000, `took ${Math.round(ms)} ms`);
});
