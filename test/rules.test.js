import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeCase, allSolutions, bruteForce } from './helpers.js';

const sols = (c) => allSolutions(c).map((s) => JSON.parse(s));

test('rule 1: every suspect is in exactly one room at every time', () => {
  for (const s of sols(makeCase())) {
    for (const row of Object.values(s)) assert.equal(row.length, 2);
  }
});

test('rule 2: never two suspects in the same room at the same time', () => {
  const all = sols(makeCase({ suspects: ['A', 'B', 'C'] }));
  assert.ok(all.length > 0);
  for (const s of all) {
    for (let t = 0; t < 2; t++) assert.equal(new Set(Object.values(s).map((r) => r[t])).size, 3);
  }
});

test('rule 2: more rooms than suspects is fine, and rooms can be empty', () => {
  const all = sols(makeCase({ suspects: ['A'], rooms: ['X', 'Y', 'Z'] }));
  assert.ok(all.some((s) => s.A[0] === 'X' && s.A[1] === 'X'));
});

test('rule 3: one door per hour, doors work both ways', () => {
  // X - Y - Z: from X you cannot reach Z in one hour.
  const c = makeCase({ suspects: ['A'], clues: [{ type: 'at', person: 'A', room: 'Y', time: 't1' }], murder: { room: 'Y', time: 't1' } });
  const next = new Set(sols(c).map((s) => s.A[1]));
  assert.deepEqual([...next].sort(), ['X', 'Y', 'Z']);
  const c2 = makeCase({ suspects: ['A'], clues: [{ type: 'at', person: 'A', room: 'Z', time: 't2' }], murder: { room: 'Z', time: 't2' } });
  assert.deepEqual(sols(c2).map((s) => s.A[0]).sort(), ['Y', 'Z']);
});

test('rule 3: no door means no move', () => {
  const c = makeCase({ suspects: ['A'], rooms: ['X', 'Y'], doors: [], murder: { room: 'X', time: 't1' } });
  assert.deepEqual(sols(c), [{ A: ['X', 'X'] }]);
});

test('rule 4: two suspects may swap rooms through the same door', () => {
  const c = makeCase({
    rooms: ['X', 'Y'], suspects: ['A', 'B'],
    clues: [{ type: 'at', person: 'A', room: 'X', time: 't1' }, { type: 'at', person: 'A', room: 'Y', time: 't2' }],
  });
  assert.deepEqual(sols(c), [{ A: ['X', 'Y'], B: ['Y', 'X'] }]);
});

test('rule 5: the murder room is occupied at the murder time', () => {
  const c = makeCase({ suspects: ['A'], murder: { room: 'Z', time: 't2' } });
  for (const s of sols(c)) assert.equal(s.A[1], 'Z');
});

test('rule 5: placements with an empty murder room are invalid when there are more rooms than suspects', () => {
  const c = makeCase({ rooms: ['X', 'Y', 'Z', 'W'], suspects: ['A', 'B'], murder: { room: 'W', time: 't1' } });
  for (const s of sols(c)) assert.ok(s.A[0] === 'W' || s.B[0] === 'W');
});

test('times are used in the order they are listed, also across midnight', () => {
  const c = makeCase({
    suspects: ['A'], times: ['23:00', '00:00', '01:00'],
    clues: [{ type: 'at', person: 'A', room: 'X', time: '23:00' }],
    murder: { room: 'X', time: '23:00' },
  });
  // From X at 23:00 the suspect can reach Z at 01:00 at the earliest, never at 00:00.
  const all = sols(c);
  assert.ok(all.every((s) => s.A[1] !== 'Z'));
  assert.ok(all.some((s) => s.A[2] === 'Z'));
});

test('solver agrees with plain enumeration on small random cases', () => {
  let seed = 7;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const rooms = ['X', 'Y', 'Z', 'W'], people = ['A', 'B', 'C'], times = ['t1', 't2', 't3'];
  const doorSets = [[['X', 'Y'], ['Y', 'Z'], ['Z', 'W']], [['X', 'Y'], ['X', 'Z'], ['X', 'W']], [['X', 'Y'], ['Z', 'W']]];
  for (let n = 0; n < 60; n++) {
    const pick = (a) => a[rnd(a.length)];
    const clues = [];
    for (let k = rnd(4); k > 0; k--) {
      const type = pick(['at', 'notAt', 'swap', 'stayed', 'moved']);
      const from = pick(times.slice(0, -1));
      if (type === 'at') clues.push({ type, person: pick(people), room: pick(rooms), time: pick(times) });
      if (type === 'notAt') clues.push({ type, person: pick(people), rooms: [pick(rooms), pick(rooms)], ...(rnd(2) ? { time: pick(times) } : {}) });
      if (type === 'swap') { const a = pick(people); const b = pick(people.filter((p) => p !== a)); clues.push({ type, a, b, from }); }
      if (type === 'stayed' || type === 'moved') clues.push({ type, person: pick(people), from });
    }
    const c = makeCase({ rooms, suspects: people, times, doors: pick(doorSets), clues, murder: { room: pick(rooms), time: pick(times) } });
    assert.deepEqual(allSolutions(c), bruteForce(c), `case ${n}: ${JSON.stringify(c.clues.map((x) => x.constraint))}`);
  }
});
