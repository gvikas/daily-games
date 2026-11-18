import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, findCaseFile, readJson } from '../scripts/lib/load.js';
import { blindCase, CLUE_TYPES } from '../scripts/lib/blind.js';
import { checkText, normalize } from '../scripts/lib/check-text.js';
import { decide, checkLog } from '../scripts/lib/reader-access.js';

const config = readJson(join(ROOT, 'scripts', 'check-text.json'));

// --- Blind case (spec 010, part 1) ---

test('npm run blind-case 007 writes a blind file without the logic, the hints or the ending', () => {
  execFileSync(process.execPath, [join(ROOT, 'scripts', 'blind-case.js'), '007'], { stdio: 'pipe' });
  const raw = readFileSync(join(ROOT, 'cases', 'drafts', '007.blind.json'), 'utf8');
  const blind = JSON.parse(raw);
  for (const key of ['constraint', 'solution', 'hint', 'marker', 'controlQuestions', 'ending', 'closing']) {
    assert.doesNotMatch(raw, new RegExp(`"${key}"`), `"${key}" must not be in the blind file`);
  }
  const c = readJson(findCaseFile('007'));
  assert.deepEqual(blind.intro, c.intro, 'the intro is kept as it is');
  assert.deepEqual(blind.clues, c.clues.map((k) => ({ id: k.id, lead: k.lead, text: k.text })));
  assert.deepEqual(blind.suspects[0], { id: 'A', name: 'Toby', role: 'the bookbinder', label: 'Binder' });
  assert.deepEqual(blind.rooms[0], { id: 'Sho', name: 'Shop' });
  assert.deepEqual(blind.murder, { room: 'Arc', time: '21:00' });
  assert.deepEqual(blind.clueTypes.map((t) => t.type), ['at', 'notAt', 'swap', 'stayed', 'moved']);
});

test('the blind case leaves out a murder device that only the ending tells', () => {
  const b = blindCase({ id: 'x', murder: { room: 'R', time: 't', device: 'secret' }, clues: [] });
  assert.deepEqual(b.murder, { room: 'R', time: 't' });
  assert.equal(CLUE_TYPES.length, 5);
});

// --- check-text (spec 010, part 3) ---

const base = () => ({
  id: 'x',
  suspects: [{ id: 'A', name: 'Toby', label: 'Binder' }, { id: 'B', name: 'Vera', label: 'Dealer' }],
  intro: [{ h: 'Dead.', t: 'In the Archive at 21:00.' }],
  clues: [
    { id: 1, lead: 'The till was opened.', text: 'At 21:00 the binder was in the Shop.', constraint: { type: 'at', person: 'A', room: 'Sho', time: '21:00' } },
    { id: 2, lead: 'Cold lamp.', text: 'The dealer was never in the Office or the Shop.', constraint: { type: 'notAt', person: 'B', rooms: ['Off', 'Sho'] } },
    { id: 3, lead: 'A doorway.', text: 'The binder and the dealer swapped rooms. At 21:00 each stood where the other stood at 20:00.', constraint: { type: 'swap', a: 'A', b: 'B', from: '20:00' } },
  ],
  ending: ['The dealer is alone.'],
  closing: 'The dealer did it.',
});
const goodReadback = () => ({
  clues: [
    { id: 1, constraint: { type: 'at', person: 'A', room: 'Sho', time: '21:00' }, reason: 'r' },
    { id: 2, constraint: { type: 'notAt', person: 'B', rooms: ['Sho', 'Off'] } },
    { id: 3, constraint: { type: 'swap', a: 'B', b: 'A', from: '20:00' } },
  ],
});

test('a read-back that matches passes: room order in notAt and the order of a swap do not count', () => {
  const r = checkText(base(), goodReadback(), config);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
  assert.equal(r.readback, true);
});

test('a read-back with a different constraint is an error', () => {
  const rb = goodReadback();
  rb.clues[2].constraint.from = '21:00'; // the time after, not "from"
  const r = checkText(base(), rb, config);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /clue 3: reads back as .*"from":"21:00".* but the case says .*"from":"20:00"/);
  const rb2 = goodReadback();
  rb2.clues[1].constraint.time = '20:00'; // "never in" and "not in, at a time" are different
  assert.match(checkText(base(), rb2, config).errors[0], /clue 2: reads back as/);
  assert.equal(normalize({ type: 'at', person: 'A', room: 'R', time: '20:00' }), normalize({ time: '20:00', room: 'R', person: 'A', type: 'at' }));
});

test('a clue marked ambiguous is an error, with every reading', () => {
  const rb = goodReadback();
  rb.clues[0] = { id: 1, ambiguous: true, constraint: [{ type: 'at', person: 'A', room: 'Sho', time: '21:00' }, { type: 'at', person: 'A', room: 'Sho', time: '20:00' }], reason: 'two hours' };
  const r = checkText(base(), rb, config);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /clue 1: ambiguous, can be read as .*21:00.* or .*20:00.*two hours/);
  const rb2 = goodReadback();
  delete rb2.clues[1];
  assert.match(checkText(base(), rb2, config).errors[0], /clue 2: no read-back/);
});

test('a forbidden word is an error, in clues and in the rest of the text, but not inside other words', () => {
  const c = base();
  c.clues[0].text = 'At around 21:00 the binder was in the Shop.';
  c.ending = ['Maybe the dealer did it.'];
  const r = checkText(c, null, config);
  assert.deepEqual(r.errors, ['clue 1: forbidden word "around"', 'ending 1: forbidden word "maybe"']);
  assert.equal(r.readback, false);
  const ok = base();
  ok.clues[0].text = 'At 21:00 the binder was in the Shop, among the mighty books.'; // "among", "mighty"
  assert.deepEqual(checkText(ok, null, config).errors, []);
});

test('a suspect name in a clue is an error when the case has labels, but not in older cases without labels', () => {
  const c = base();
  c.clues[0].text = 'At 21:00 Toby was in the Shop.';
  c.clues[1].lead = 'Vera kept away.';
  assert.deepEqual(checkText(c, null, config).errors, ['clue 1 text: uses the name "Toby", not the role', 'clue 2 lead: uses the name "Vera", not the role']);
  c.suspects.forEach((s) => delete s.label);
  assert.deepEqual(checkText(c, null, config).errors, []);
});

test('a long clue and a move written as "between … and …" give warnings, not errors', () => {
  const c = base();
  c.clues[0].text = 'At 21:00 the binder was in the Shop. ' + 'x'.repeat(100);
  c.clues[2].text = 'Between 20:00 and 21:00 the binder and the dealer swapped rooms.';
  const r = checkText(c, null, config);
  assert.deepEqual(r.errors, []);
  assert.equal(r.warnings.length, 2);
  assert.match(r.warnings[0], /clue 1: 137 characters \(more than 120\)/);
  assert.match(r.warnings[1], /clue 3: a swap clue written as a stretch of time/);
});

test('npm run check-text exits with 1 on errors and 0 on warnings only', () => {
  const run = (id) => { try { execFileSync(process.execPath, [join(ROOT, 'scripts', 'check-text.js'), id], { stdio: 'pipe' }); return 0; } catch (e) { return e.status; } };
  assert.equal(run('007'), 0);
  assert.equal(run('no-such-case'), 1);
});

// --- What the case reader may open (spec 010, part 2) ---

test('the reader guard allows only Read of a blind file in cases/drafts/', () => {
  const root = '/repo';
  const read = (file_path) => decide({ tool_name: 'Read', tool_input: { file_path } }, root);
  assert.equal(read('/repo/cases/drafts/007.blind.json').allow, true);
  assert.equal(read('cases/drafts/007.blind.json').allow, true, 'a relative path is resolved from the repository');
  assert.equal(read('/repo/cases/007-the-closed-book.json').allow, false);
  assert.equal(read('/repo/cases/drafts/007.readback.json').allow, false);
  assert.equal(read('/repo/site/cases/007.json').allow, false);
  assert.equal(read('/repo/cases/drafts/../007-the-closed-book.json').allow, false, 'no way out of drafts/ with ..');
  assert.equal(read('/elsewhere/cases/drafts/007.blind.json').allow, false);
  assert.match(decide({ tool_name: 'Grep', tool_input: { pattern: 'x' } }, root).reason, /only use Read, not Grep/);
});

test('the reader log fails on anything but its own blind file, and on an empty log', () => {
  const line = (path, allow = true, tool = 'Read') => JSON.stringify({ tool, path, allow });
  assert.deepEqual(checkLog([line('cases/drafts/007.blind.json'), ''], '007').errors, []);
  assert.deepEqual(checkLog([line('cases/drafts/007.blind.json'), line('cases/drafts/006.blind.json')], '007').errors, ['the reader opened cases/drafts/006.blind.json']);
  assert.deepEqual(checkLog([line('cases/drafts/007.blind.json'), line('cases/007-the-closed-book.json', false)], '007').errors, ['the reader tried Read on cases/007-the-closed-book.json and was stopped']);
  assert.match(checkLog([], '007').errors[0], /empty: the guard did not run/);
  assert.match(checkLog([line('cases/drafts/006.blind.json')], '007').errors.pop(), /never opened cases\/drafts\/007.blind.json/);
});
