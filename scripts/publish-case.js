#!/usr/bin/env node
// Usage: npm run publish-case <id> [YYYY-MM-DD]
// Validates the case, copies it and its floor plan into site/ (the only folder GitHub Pages serves)
// and, when a date is given, lists it in site/cases/index.json so index.html opens it on that day.
// Without a date the case is copied but not listed: it can be opened with play.html?case=<id>.
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { analyze } from '../engine/index.js';
import { ROOT, FLOORPLANS_DIR, findCaseFile, loadFloorplan, readJson } from './lib/load.js';

const [id, date] = process.argv.slice(2);
const fail = (msg) => { console.error(`✗ ${msg}`); process.exit(1); };

if (!id) fail('Usage: npm run publish-case <id> [YYYY-MM-DD]');
if (date !== undefined) {
  const d = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== date) fail(`"${date}" is not a date on the form YYYY-MM-DD`);
}

const file = findCaseFile(id);
if (!file) fail(`No single case file for "${id}" in cases/ (expected cases/${id}-<slug>.json)`);
const data = readJson(file);
if (data.id !== id) fail(`${file} has id "${data.id}", not "${id}"`);
if (typeof data.floorplan !== 'string') fail(`Case ${id} has no "floorplan", so play.html cannot draw it`);

const floorplan = loadFloorplan(data);
const report = analyze(data, { floorplan });
if (!report.ok) {
  report.errors.forEach((e) => console.error(`  ✗ ${e}`));
  if (report.solutionCount !== null && report.solutionCount !== 1) console.error(`  ✗ ${report.solutionCount} solutions`);
  if (report.matchesSolution === false) console.error('  ✗ the only solution differs from "solution"');
  fail(`Case ${id} did not pass. Run: npm run solve ${file.slice(ROOT.length)}`);
}

const site = join(ROOT, 'site');
for (const dir of ['cases', 'floorplans', 'lib']) mkdirSync(join(site, dir), { recursive: true });
writeFileSync(join(site, 'cases', `${id}.json`), JSON.stringify(data, null, 2) + '\n');
copyFileSync(join(FLOORPLANS_DIR, `${data.floorplan}.json`), join(site, 'floorplans', `${data.floorplan}.json`));
// The page draws the map with the same module the tests cover.
copyFileSync(join(ROOT, 'engine', 'floorplan.js'), join(site, 'lib', 'floorplan.js'));
console.log(`✓ site/cases/${id}.json, site/floorplans/${data.floorplan}.json, site/lib/floorplan.js`);

const indexFile = join(site, 'cases', 'index.json');
let index = [];
if (existsSync(indexFile)) {
  try { index = JSON.parse(readFileSync(indexFile, 'utf8')); } catch { fail('site/cases/index.json is not valid JSON'); }
  if (!Array.isArray(index)) fail('site/cases/index.json must be a list');
}
if (date) {
  const clash = index.find((e) => e.date === date && e.case !== id);
  if (clash) fail(`${date} already has case ${clash.case}. Remove it from site/cases/index.json first.`);
  index = index.filter((e) => e.case !== id);
  index.push({ date, case: id, title: data.title });
  index.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  console.log(`✓ site/cases/index.json: ${date} → case ${id}`);
  const today = new Date();
  const local = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  if (date > local) console.log(`⚠ ${date} is in the future. The case and its solution are public as soon as this is pushed.`);
} else {
  console.log('– No date given: the case is not listed in site/cases/index.json');
}
writeFileSync(indexFile, JSON.stringify(index, null, 2) + '\n');
