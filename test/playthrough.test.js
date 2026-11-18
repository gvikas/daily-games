import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, readJson } from '../scripts/lib/load.js';
import { playthrough, loadChromium } from '../scripts/lib/playthrough.js';

// Playwright is a devDependency. Without it (or without its browser) these tests are skipped,
// so npm test runs without Playwright.
const chromium = await loadChromium();
let reason = chromium ? false : 'Playwright is not installed';
if (chromium) {
  try { await (await chromium.launch()).close(); } catch { reason = 'Playwright has no browser (npx playwright install chromium)'; }
}

const caseData = readJson(join(ROOT, 'site', 'cases', 'test-hall.json'));
const run = async (solution) => {
  const outDir = mkdtempSync(join(tmpdir(), 'playthrough-'));
  try { return await playthrough({ chromium, siteDir: join(ROOT, 'site'), caseData, solution, outDir }); } finally { rmSync(outDir, { recursive: true, force: true }); }
};

test('the playthrough plays a test case to "Case closed" and takes screenshots', { skip: reason }, async () => {
  const r = await run(caseData.solution);
  assert.deepEqual(r.errors, []);
  assert.equal(r.ok, true);
  assert.ok(r.screenshots.some((f) => f.endsWith('-verdict.png')));
  assert.ok(r.screenshots.some((f) => f.endsWith('-result.png')));
});

test('the playthrough fails when the answer key is changed so the accusation is wrong', { skip: reason }, async () => {
  // Swap the killer's night with someone else's: the board still follows the rules,
  // but the clues no longer fit and the accused is the wrong person.
  const t = caseData.times.indexOf(caseData.murder.time);
  const killer = Object.keys(caseData.solution).find((p) => caseData.solution[p][t] === caseData.murder.room);
  const other = Object.keys(caseData.solution).find((p) => p !== killer);
  const wrong = { ...caseData.solution, [killer]: caseData.solution[other], [other]: caseData.solution[killer] };
  const r = await run(wrong);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /^accusation accepted: the page did not accept it/.test(e)), r.errors.join('\n'));
  assert.ok(r.errors.some((e) => /conflict marked/.test(e)));
});
