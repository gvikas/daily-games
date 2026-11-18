#!/usr/bin/env node
// Usage: npm run playthrough <id>
// Plays site/play.html?case=<id>&reset at 375 × 812 with the answer key, and saves screenshots
// to .playthrough/<id>/ (spec 010). Needs Playwright: npm install, then npx playwright install chromium.
// The case, its floor plan and the browser modules are served from their sources (cases/, floorplans/,
// engine/), so a case can be checked before it is published. Nothing is copied into site/.
import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ROOT, FLOORPLANS_DIR, BROWSER_LIBS, findCaseFile, readJson } from './lib/load.js';
import { playthrough, loadChromium } from './lib/playthrough.js';

const id = process.argv[2];
if (!id) { console.error('✗ Usage: npm run playthrough <id>'); process.exit(1); }
const file = findCaseFile(id);
if (!file) { console.error(`✗ No single case file for "${id}" in cases/`); process.exit(1); }
const caseData = readJson(file);
const plan = join(FLOORPLANS_DIR, `${caseData.floorplan}.json`);
if (!existsSync(plan)) { console.error(`✗ floorplans/${caseData.floorplan}.json is missing`); process.exit(1); }
const overrides = { [`cases/${id}.json`]: file, [`floorplans/${caseData.floorplan}.json`]: plan };
for (const lib of BROWSER_LIBS) overrides[`lib/${lib}`] = join(ROOT, 'engine', lib);

const chromium = await loadChromium();
if (!chromium) { console.error('✗ Playwright is not installed. Run npm install, then npx playwright install chromium.'); process.exit(1); }

const outDir = join(ROOT, '.playthrough', id);
let result;
try {
  result = await playthrough({ chromium, siteDir: join(ROOT, 'site'), caseData, outDir, overrides });
} catch (e) {
  console.error(`✗ The playthrough could not run: ${e.message.split('\n')[0]}`);
  if (/Executable doesn't exist|browserType.launch/.test(e.message)) console.error('  Run: npx playwright install chromium');
  process.exit(1);
}
console.log(`Case ${id} · playthrough at 375 × 812`);
result.errors.forEach((e) => console.log(`  ✗ ${e}`));
console.log(`${result.ok ? '✓ Played through to "Case closed" and the end of the story.' : '✗ The playthrough failed.'}`);
console.log(`  ${result.screenshots.length} screenshots in ${relative(ROOT, outDir)}/`);
process.exit(result.ok ? 0 : 1);
