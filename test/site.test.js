import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, findCaseFile, readJson } from '../scripts/lib/load.js';

// site/ is what GitHub Pages serves. These files are copies made by `npm run publish-case`.
const site = join(ROOT, 'site');
const read = (f) => readFileSync(f, 'utf8');

test('site/lib/floorplan.js is the tested engine/floorplan.js', () => {
  assert.equal(read(join(site, 'lib', 'floorplan.js')), read(join(ROOT, 'engine', 'floorplan.js')), 'run npm run publish-case <id> to copy the engine again');
});

test('published cases and floor plans match their sources', () => {
  for (const f of readdirSync(join(site, 'cases')).filter((x) => x.endsWith('.json') && x !== 'index.json')) {
    const id = f.replace(/\.json$/, '');
    const src = findCaseFile(id);
    assert.ok(src, `site/cases/${f} has no source in cases/`);
    assert.deepEqual(readJson(join(site, 'cases', f)), readJson(src), `site/cases/${f} is out of date: run npm run publish-case ${id}`);
    const plan = readJson(src).floorplan;
    assert.deepEqual(readJson(join(site, 'floorplans', `${plan}.json`)), readJson(join(ROOT, 'floorplans', `${plan}.json`)), `site/floorplans/${plan}.json is out of date`);
  }
});

test('site/cases/index.json lists published cases by date, one per day', () => {
  const index = readJson(join(site, 'cases', 'index.json'));
  assert.ok(Array.isArray(index));
  const dates = index.map((e) => e.date);
  assert.deepEqual(dates, [...dates].sort());
  assert.equal(new Set(dates).size, dates.length);
  for (const e of index) {
    assert.match(e.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(existsSync(join(site, 'cases', `${e.case}.json`)), `index.json lists case ${e.case}, but site/cases/${e.case}.json is missing`);
  }
});
