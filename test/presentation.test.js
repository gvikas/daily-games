import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze, validatePresentation } from '../engine/index.js';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const base = () => read('../cases/003-the-silent-encore.json');
const chain = () => read('../floorplans/chain-2x2.json');
const hasError = (c, plan, text) => {
  const errs = validatePresentation(c, plan);
  assert.ok(errs.some((e) => e.includes(text)), `expected "${text}", got ${JSON.stringify(errs)}`);
};

test('case 003 in the new format has a complete presentation', () => {
  assert.deepEqual(validatePresentation(base(), chain()), []);
  const r = analyze(base(), { floorplan: chain() });
  assert.equal(r.presentation.checked, true);
  assert.equal(r.ok, true);
});

test('a case without "floorplan" is logic only and still passes', () => {
  const c = base(); delete c.floorplan;
  const r = analyze(c);
  assert.equal(r.presentation.checked, false);
  assert.equal(r.ok, true);
});

test('the floor plan is missing', () => {
  hasError(base(), null, 'was not found');
  const r = analyze(base());
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('was not found')));
});

test('errors in the floor plan itself are reported for the case', () => {
  const p = chain(); p.slots[1] = { id: 'ne', x: 0, y: 0, w: 2, h: 1 };
  hasError(base(), p, 'overlap');
  const q = chain(); q.doors.push({ between: ['nw', 'se'], at: 0.5 });
  hasError(base(), q, 'do not share a wall');
  const r = chain(); r.slots.pop(); r.doors.pop();
  hasError(base(), r, 'do not fill the grid');
});

test('doors in the case must be the doors of the floor plan', () => {
  const c = base(); c.doors.push(['Par', 'Scu']);
  hasError(c, chain(), 'Par – Scu is in the case but not in floor plan');
  const d = base(); d.doors.pop();
  hasError(d, chain(), 'Din – Scu is in floor plan "chain-2x2" but not in the case');
  // The ring has a fourth door that case 003 lacks.
  hasError(base(), { ...read('../floorplans/ring-2x2.json'), id: 'chain-2x2' }, 'Par – Scu is in floor plan');
});

test('rooms must map one-to-one to slots', () => {
  const a = base(); delete a.rooms[0].slot; hasError(a, chain(), 'needs a "slot"');
  const b = base(); b.rooms[0].slot = 'zz'; hasError(b, chain(), 'unknown slot "zz"');
  const c = base(); c.rooms[0].slot = 'ne'; hasError(c, chain(), 'use the same slot');
  hasError(c, chain(), 'slot "nw" has no room');
});

test('a clue without lead or text, or with a marker in an unknown room', () => {
  const a = base(); delete a.clues[0].lead; hasError(a, chain(), 'clue 1: needs a "lead"');
  const b = base(); b.clues[1].text = ' '; hasError(b, chain(), 'clue 2: needs a "text"');
  const c = base(); c.clues[2].marker = 'Attic'; hasError(c, chain(), 'clue 3: marker points to unknown room "Attic"');
  const d = base(); delete d.clues[3].marker; delete d.clues[3].hint;
  assert.deepEqual(validatePresentation(d, chain()), []);
});

test('ending needs one step per time and one per move', () => {
  const a = base(); a.ending.pop(); hasError(a, chain(), 'ending: needs 5 steps');
  const b = base(); delete b.ending; hasError(b, chain(), 'ending: needs 5 steps');
});

test('intro, share and control question are needed by the page', () => {
  const a = base(); a.intro = []; hasError(a, chain(), 'intro');
  const b = base(); delete b.share.number; hasError(b, chain(), 'share');
  const c = base(); c.controlQuestions = [{ person: 'C', time: '23:00', forAccused: 'A' }]; hasError(c, chain(), 'controlQuestions');
});

test('sizes outside what the page supports', () => {
  const c = base(); c.times = ['21:00', '22:00'];
  hasError(c, chain(), 'times: the page supports 3–5');
});
