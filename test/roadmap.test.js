import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRoadmap, readSpecs, readSpecFile, readCases, readDecisions, parseProposals, collect, renderPage, esc, txt, gateSummary, activeGateId, RoadmapError } from '../scripts/lib/roadmap.js';

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
    assert.match(html, /1 oppfylt · 1 ikke oppfylt · 1 ikke målt/);
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

// --- Gate summary and the gate that matters now ---

test('gate summary counts met, not met and not measured separately', () => {
  const g = { criteria: [{ status: 'met' }, { status: 'unmet' }, { status: 'unmet' }, { status: 'unknown' }, { status: 'maybe' }, {}] };
  assert.deepEqual(gateSummary(g), { met: 1, unmet: 2, unknown: 3, total: 6, text: '1 oppfylt · 2 ikke oppfylt · 3 ikke målt' });
  assert.equal(gateSummary({ criteria: [] }).text, '0 oppfylt · 0 ikke oppfylt · 0 ikke målt');
  assert.equal(gateSummary({}).total, 0);
});

const incs = (...list) => list.map(([id, status, gate]) => ({ id, status, gate }));
const gates = (...ids) => ids.map((id) => ({ id, verdict: 'open', criteria: [] }));

test('the active gate is the gate of the increment in progress', () => {
  assert.equal(activeGateId({ increments: incs([1, 'done', null], [2, 'current', 'A'], [3, 'later', 'B']), gates: gates('A', 'B') }), 'A');
});

test('without a gate on the increment in progress, the first gate after it is active', () => {
  assert.equal(activeGateId({ increments: incs([1, 'done', 'A'], [2, 'current', null], [3, 'next', null], [4, 'later', 'B'], [5, 'later', 'C']), gates: gates('A', 'B', 'C') }), 'B');
  assert.equal(activeGateId({ increments: incs([1, 'current', null], [2, 'later', null]), gates: gates('A') }), null, 'no gate after it');
  assert.equal(activeGateId({ increments: incs([1, 'current', 'Z'], [2, 'later', 'B']), gates: gates('B') }), 'B', 'a gate id that does not exist is skipped');
});

test('with no increment in progress, the first gate on an unfinished increment is active', () => {
  assert.equal(activeGateId({ increments: incs([1, 'done', 'A'], [2, 'next', null], [3, 'later', 'B']), gates: gates('A', 'B') }), 'B');
  assert.equal(activeGateId({ increments: incs([1, 'done', 'A']), gates: gates('A') }), null);
});

test('only the active gate is open; passed gates are collapsed and marked', () => {
  const r = roadmap({
    increments: [
      { id: 1, title: 'First', status: 'done', gate: 'A' },
      { id: 2, title: 'Second', status: 'current', gate: null },
      { id: 3, title: 'Third', status: 'later', gate: 'B' },
      { id: 4, title: 'Fourth', status: 'later', gate: 'C' },
    ],
    gates: [
      { id: 'A', title: 'Passed', verdict: 'go', criteria: [{ text: 'x', status: 'met' }] },
      { id: 'B', title: 'Next up', verdict: 'open', criteria: [{ text: 'y', status: 'unmet' }, { text: 'z', status: 'unknown' }] },
      { id: 'C', title: 'Later', verdict: 'open', criteria: [{ text: 'w', status: 'unknown' }] },
    ],
  });
  withRoot(base(r), (root) => {
    const html = renderPage(collect(root)).split('<body>')[1];
    const cards = html.match(/<details class="card gatecard[^"]*"[^>]*>/g);
    assert.deepEqual(cards, [
      '<details class="card gatecard passed">',
      '<details class="card gatecard cur" open>',
      '<details class="card gatecard">',
    ]);
    assert.match(html, /PASSERT/);
    assert.match(html, /Port A er passert/);
    assert.match(html, /0 oppfylt · 1 ikke oppfylt · 1 ikke målt/);
    // The status box at the top follows the active gate.
    assert.match(html.split('</header>')[0], /Port B · Next up/);
  });
});

test('the three-part bar has one part per status that occurs', () => {
  withRoot(base(), (root) => {
    const html = renderPage(collect(root)).split('<body>')[1];
    const bar = html.match(/<span class="tribar[^>]*>.*?<\/span>/)[0];
    assert.match(bar, /tb-met/);
    assert.match(bar, /tb-unmet/);
    assert.match(bar, /tb-unknown/);
    assert.match(bar, /aria-label="1 oppfylt · 1 ikke oppfylt · 1 ikke målt"/);
  });
});

// --- Til sparring (forslag-til-sparring.md) ---

const SPARRING = [
  '# Forslag til sparring',
  '',
  '## Format',
  'Hvert forslag er en overskrift med en statuslinje rett under:',
  '',
  '    ## Tittel',
  '    Status: åpen · Økt 3 · Fra 2026-11-12',
  '',
  '## Kart eller tabell',
  'Status: åpen · Økt 3 · Fra 2026-11-16 · Står i openDecisions · Diskuteres med spec 007',
  'Brødtekst som ikke skal vises.',
  '',
  '## Siste time gitt',
  'Status: venter · Økt 2 · Fra 2026-11-12 · Venter på nye testere',
  '',
  '## Resultatet som score',
  'Status: åpen · Økt 2 · Fra 2026-11-16',
  '',
  '## Uten økt',
  'Status: åpen · Fra 2026-11-16',
  '',
  '## Skrivefeil i status',
  'Status: åpent · Økt 2 · Fra 2026-11-16',
  '',
  '## Mål løst',
  'Status: gjennomført · Fra 2026-11-12 · Spec 008',
  '',
  '## Kryptering',
  'Status: lagt bort · Fra 2026-11-06',
  '',
  '## Statuslinjen er ikke rett under',
  '',
  'Status: åpen · Økt 2 · Fra 2026-11-16',
].join('\n');

test('proposals: a "## " line with "Status: " right under it; fields split by " · "', () => {
  const { proposals, warnings } = parseProposals(SPARRING);
  assert.deepEqual(proposals.map((p) => p.title), ['Kart eller tabell', 'Siste time gitt', 'Resultatet som score', 'Uten økt', 'Skrivefeil i status', 'Mål løst', 'Kryptering']);
  assert.deepEqual(proposals[0], { title: 'Kart eller tabell', status: 'åpen', session: 3, from: '2026-11-16', ref: 'Står i openDecisions · Diskuteres med spec 007' });
  assert.deepEqual(proposals[2], { title: 'Resultatet som score', status: 'åpen', session: 2, from: '2026-11-16', ref: null });
  assert.equal(proposals[5].session, null);
  assert.equal(proposals[6].status, 'lagt bort');
  assert.equal(warnings.length, 2);
  assert.match(warnings[0], /«Uten økt».*ingen «Økt N»/);
  assert.match(warnings[1], /«Skrivefeil i status».*ukjent status «åpent»/);
});

test('the sparring section shows open and waiting proposals by increment, after open decisions', () => {
  const file = SPARRING + '\n\n## Langt frem\nStatus: åpen · Økt 9 · Fra 2026-11-16\n';
  withRoot(base({}, { 'docs/design/forslag-til-sparring.md': file }), (root) => {
    const model = collect(root);
    assert.ok(model.sparring.warnings.some((w) => /«Langt frem»: Økt 9 finnes ikke/.test(w)), 'an increment that is not in roadmap.json gives a warning');
    const html = renderPage(model);
    assert.match(html, /<h2>Til sparring<\/h2>/);
    assert.ok(html.indexOf('Åpne beslutninger') < html.indexOf('Til sparring'), 'placed after open decisions');
    assert.match(html, /5 åpne eller ventende, 2 avgjort/);
    assert.match(html, /href="design\/forslag-til-sparring.md"/);
    assert.match(html, /<h3>Inkrement 2 · Second <span class="count">2<\/span><\/h3>/);
    assert.match(html, /<h3>Inkrement 3 · Third/);
    assert.match(html, /<h3>Inkrement 9 <span class="count">1/, 'an unknown increment is shown by number');
    assert.match(html, /<h3>Uten inkrement/);
    assert.ok(html.indexOf('Inkrement 2 · Second <span') < html.indexOf('Inkrement 3 · Third <span'), 'groups in increment order');
    assert.match(html, /<li class="waiting"><span>Siste time gitt <span class="tag">VENTER<\/span><\/span><span class="small muted">Venter på nye testere<\/span>/);
    assert.match(html, /Står i openDecisions · Diskuteres med spec 007/);
    assert.doesNotMatch(html, /Brødtekst/);
    assert.doesNotMatch(html, /Mål løst|Kryptering|Skrivefeil i status/, 'decided and unknown proposals are not listed');
  });
  withRoot(base(), (root) => assert.doesNotMatch(renderPage(collect(root)), /Til sparring/, 'no file, no section'));
});
