import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRoadmap, readSpecs, readSpecFile, readCases, readDecisions, collect, renderPage, esc, txt, RoadmapError } from '../scripts/lib/roadmap.js';

// Every test builds its own folder. Nothing here reads docs/, which is outside git.
function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'roadmap-'));
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, typeof content === 'string' ? content : JSON.stringify(content));
  }
  return root;
}
const roadmap = (over = {}) => ({
  title: 'Plan', principle: 'One question per increment.',
  next: [{ text: 'Send case 5', who: 'Vikas' }],
  increments: [
    { id: 1, title: 'First', status: 'done', kind: 'product', hours: '30 t', gate: null, question: 'Q1?', build: 'B1', test: 'T1', learned: 'L1' },
    { id: 2, title: 'Second', status: 'current', kind: 'product', hours: '20 t', gate: 'A', question: 'Q2?', build: 'B2', test: 'T2', learned: '' },
    { id: 3, title: 'Third', status: 'later', kind: 'learning', hours: 'max 15 t', gate: null, question: 'Q3?', build: 'B3', test: 'T3', learned: '' },
  ],
  gates: [{ id: 'A', title: 'Fun?', verdict: 'open', nogo: 'Guessing.', criteria: [
    { text: 'C1', status: 'met', measured: 'M1' }, { text: 'C2', status: 'unmet', measured: 'M2' }, { text: 'C3', status: 'unknown', measured: 'M3' }] }],
  plannedSpecs: [{ id: '005', title: 'Secret door', note: 'Later.' }, { id: '009', title: 'Roadmap', note: 'This page.' }],
  openDecisions: ['Stack for the frontend.'],
  background: { label: 'Background', file: 'plan.html' },
  ...over,
});
const base = (over = {}, extra = {}) => fixture({
  'docs/roadmap.json': roadmap(over),
  'docs/specs/README.md': '# Specs\n',
  'docs/specs/009-roadmap.md': '# 009 – Roadmap-siden\n\nStatus: Klar for implementering.\n',
  'docs/specs/007-one-view.md': '# 007 – Alt i ett view\n\nIngen statuslinje her.\n',
  'docs/specs/done/001-format.md': '# 001 – Saksformat og solver\n\nStatus: Implementert 2026-11-06. Koden er kilden.\n',
  'docs/design/decisions.md': ['# Log', '', ...Array.from({ length: 10 }, (_, i) => `- 2026-11-${String(i + 1).padStart(2, '0')} – Decision ${i + 1} – why`), 'Not a decision line'].join('\n'),
  'cases/001-a.json': { id: '001', title: 'A', level: 'easy' },
  'cases/006-b.json': { id: '006', title: 'B', level: 'tricky', twist: 'empty-room' },
  'cases/test-x.json': { id: 'test-x', title: 'Test', level: 'test' },
  'site/cases/index.json': [{ date: '2026-11-12', case: '001', title: 'A' }],
  ...extra,
});
const withRoot = (root, fn) => { try { return fn(root); } finally { rmSync(root, { recursive: true, force: true }); } };

test('roadmap.json missing or invalid stops the script', () => {
  withRoot(fixture({}), (root) => assert.throws(() => readRoadmap(join(root, 'docs/roadmap.json')), (e) => e instanceof RoadmapError && /missing/.test(e.message)));
  withRoot(fixture({ 'docs/roadmap.json': '{oops' }), (root) => assert.throws(() => readRoadmap(join(root, 'docs/roadmap.json')), /not valid JSON/));
  withRoot(fixture({ 'docs/roadmap.json': '[1]' }), (root) => assert.throws(() => readRoadmap(join(root, 'docs/roadmap.json')), /JSON object/));
});

test('more than one current increment is an error', () => {
  const r = roadmap();
  r.increments[2].status = 'current';
  withRoot(fixture({ 'docs/roadmap.json': r }), (root) => assert.throws(() => readRoadmap(join(root, 'docs/roadmap.json')), /more than one increment/));
});

test('specs: title from the first heading, status from the first Status line, date for finished ones', () => {
  withRoot(base(), (root) => {
    const s = readSpecs(join(root, 'docs/specs'));
    assert.deepEqual(s.done.map((x) => [x.id, x.title, x.date]), [['001', 'Saksformat og solver', '2026-11-06']]);
    assert.deepEqual(s.open.map((x) => [x.id, x.title, x.status]), [['007', 'Alt i ett view', null], ['009', 'Roadmap-siden', 'Klar for implementering.']]);
  });
  withRoot(fixture({ 'x/no-heading.md': 'Status: Utkast\n' }), (root) => {
    const s = readSpecFile(join(root, 'x/no-heading.md'));
    assert.deepEqual([s.id, s.title, s.status], ['no-heading', 'no-heading', 'Utkast']);
  });
  withRoot(fixture({}), (root) => assert.deepEqual(readSpecs(join(root, 'docs/specs')), { done: [], open: [] }));
});

test('cases: test cases are left out, dates come from index.json, unknown cases give a warning', () => {
  withRoot(base({}, { 'site/cases/index.json': [{ date: '2026-11-12', case: '001' }, { date: '2026-11-20', case: '099' }] }), (root) => {
    const { cases, warnings } = readCases(join(root, 'cases'), join(root, 'site/cases/index.json'));
    assert.deepEqual(cases.map((c) => [c.id, c.level, c.twist, c.date]), [['001', 'easy', null, '2026-11-12'], ['006', 'tricky', 'empty-room', null]]);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /case 099/);
  });
  withRoot(fixture({ 'cases/001-a.json': { id: '001', title: 'A' } }), (root) => {
    const { cases, warnings } = readCases(join(root, 'cases'), join(root, 'site/cases/index.json'));
    assert.deepEqual([cases[0].date, warnings], [null, []], 'no index.json: nothing published, no warning');
  });
});

test('decisions: the last eight dated lines, newest first; missing file gives null', () => {
  withRoot(base(), (root) => {
    const d = readDecisions(join(root, 'docs/design/decisions.md'));
    assert.equal(d.length, 8);
    assert.deepEqual(d[0], { date: '2026-11-10', text: 'Decision 10 – why' });
    assert.equal(d[7].date, '2026-11-03');
  });
  withRoot(fixture({}), (root) => assert.equal(readDecisions(join(root, 'docs/design/decisions.md')), null));
});

test('the page shows where we are, the gate progress, specs, cases and decisions', () => {
  withRoot(base(), (root) => {
    const html = renderPage(collect(root, { git: { hash: 'abc1234', date: '2026-11-16' }, now: new Date(2026, 10, 17, 9, 5) }));
    assert.match(html, /Nå: <b>Inkrement 2<\/b> · Second/);
    assert.match(html, /▲ Du er her/);
    assert.equal((html.match(/Du er her/g) || []).length, 1);
    assert.match(html, /1 av 3 kriterier oppfylt/);
    assert.match(html, /<details class="card incr cur ?" open>/);
    assert.match(html, /LÆRING/);
    assert.match(html, /<dt>LÆRT<\/dt><dd>L1<\/dd>/);
    assert.doesNotMatch(html, /<dt>LÆRT<\/dt><dd><\/dd>/, 'an empty "learned" is left out');
    assert.match(html, /Status mangler/);
    assert.match(html, /Secret door/);
    assert.doesNotMatch(html, /This page\./, 'a planned spec that already has a file is not listed as planned');
    assert.match(html, /2 saker, 1 publisert/);
    assert.match(html, /IKKE PUBLISERT/);
    assert.doesNotMatch(html, />Test</, 'test cases are not shown');
    assert.match(html, /Decision 10/);
    assert.doesNotMatch(html, /Decision 2 /);
    assert.match(html, /abc1234/);
    assert.match(html, /Laget 2026-11-17 kl\. 09:05/);
    assert.match(html, /href="plan.html"/);
    assert.doesNotMatch(html, /<input|<textarea|localStorage/, 'no checkboxes, editing or storage');
  });
});

test('no increment in progress: all done, or none in progress', () => {
  const allDone = roadmap(); allDone.increments.forEach((i) => { i.status = 'done'; });
  withRoot(base(allDone), (root) => assert.match(renderPage(collect(root)), /Alle inkrementer er ferdige/));
  const none = roadmap(); none.increments[1].status = 'next';
  withRoot(base(none), (root) => {
    const html = renderPage(collect(root));
    assert.match(html, /Ingen pågår/);
    assert.doesNotMatch(html, /Du er her/);
  });
});

test('missing parts are left out without errors', () => {
  const r = { title: 'Bare', increments: [{ id: 1, title: 'Only', status: 'current' }] };
  withRoot(fixture({ 'docs/roadmap.json': r }), (root) => {
    const html = renderPage(collect(root)).split('<body>')[1];
    assert.match(html, /Nå: <b>Inkrement 1<\/b> · Only/);
    assert.doesNotMatch(html, /De neste tingene|Go eller no-go|Beslutninger|Åpne beslutninger/);
  });
});

test('text from the sources is escaped; `code` is shown as code', () => {
  assert.equal(esc('<b> & "x"'), '&lt;b&gt; &amp; &quot;x&quot;');
  assert.equal(txt('use `<script>` & more'), 'use <code>&lt;script&gt;</code> &amp; more');
  const evil = roadmap({ title: '<script>alert(1)</script>', openDecisions: ['A & B <i>'] });
  withRoot(base(evil, { 'docs/design/decisions.md': '- 2026-11-17 – x < y & `z` – ok\n' }), (root) => {
    const html = renderPage(collect(root));
    assert.doesNotMatch(html, /<script>alert/);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(html, /A &amp; B &lt;i&gt;/);
    assert.match(html, /x &lt; y &amp; <code>z<\/code>/);
  });
});
