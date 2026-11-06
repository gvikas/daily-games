import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { analyze } from '../engine/index.js';

const file = new URL('../cases/001-the-stopped-clock.json', import.meta.url);
const data = JSON.parse(readFileSync(file, 'utf8'));

test('case 001 has exactly one solution, equal to the expected one', () => {
  const r = analyze(data);
  assert.deepEqual(r.errors, []);
  assert.equal(r.solutionCount, 1);
  assert.equal(r.matchesSolution, true);
  assert.equal(r.ok, true);
});

test('case 001 report: murderer, redundant clues, early decision, control questions', () => {
  const r = analyze(data);
  assert.deepEqual(r.murderer, { person: 'C', name: 'Cora', room: 'Lib', roomName: 'Library', time: '23:00' });
  assert.deepEqual(r.redundantClues, []);
  assert.equal(r.murderDecidedEarly.method, 'exhaustive');
  assert.equal(r.murderDecidedEarly.murderClues, 3);
  assert.deepEqual(r.murderDecidedEarly.murderSets, [[3, 4, 5]]);
  assert.equal(r.murderDecidedEarly.boardClues, 4);
  assert.equal(r.murderDecidedEarly.early, true);
  assert.deepEqual(r.controlQuestions.map((q) => [q.person, q.time, q.answer, q.possibleRooms.length, q.trivial]), [
    ['D', '23:00', 'Lou', 3, false],
    ['C', '22:00', 'Lou', 3, false],
  ]);
});

test('case 001 is analysed in under 100 ms', () => {
  analyze(data); // warm-up
  const t0 = performance.now();
  analyze(data);
  assert.ok(performance.now() - t0 < 100);
});

test('CLI exits 0 for case 001 and prints JSON with --json', () => {
  const cli = new URL('../scripts/solve.js', import.meta.url).pathname;
  const res = spawnSync(process.execPath, [cli, file.pathname, '--json'], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
  const json = JSON.parse(res.stdout);
  assert.equal(json.solutionCount, 1);
  assert.equal(json.ok, true);
});

test('CLI exits 1 when a clue is missing, and shows two solutions side by side', () => {
  const cli = new URL('../scripts/solve.js', import.meta.url).pathname;
  const broken = { ...data, clues: data.clues.filter((c) => c.id !== 5) };
  const dir = mkdtempSync(join(tmpdir(), 'case001-'));
  const tmp = join(dir, 'without-5.json');
  writeFileSync(tmp, JSON.stringify(broken));
  try {
    const res = spawnSync(process.execPath, [cli, tmp], { encoding: 'utf8' });
    assert.equal(res.status, 1);
    assert.match(res.stdout, /2 or more/);
    assert.match(res.stdout, /Solution 1/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
