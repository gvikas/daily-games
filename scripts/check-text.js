#!/usr/bin/env node
// Usage: npm run check-text <id>
// Compares the case with cases/drafts/<id>.readback.json and checks the text (spec 010).
// Exit code 1 on errors. Warnings alone give exit code 0.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, CASES_DIR, findCaseFile, readJson } from './lib/load.js';
import { checkText } from './lib/check-text.js';

const id = process.argv[2];
if (!id) { console.error('✗ Usage: npm run check-text <id>'); process.exit(1); }
const file = findCaseFile(id);
if (!file) { console.error(`✗ No single case file for "${id}" in cases/`); process.exit(1); }

const rbFile = join(CASES_DIR, 'drafts', `${id}.readback.json`);
let readback = null;
if (existsSync(rbFile)) {
  try { readback = readJson(rbFile); } catch (e) { console.error(`✗ cases/drafts/${id}.readback.json is not valid JSON: ${e.message}`); process.exit(1); }
}

const { errors, warnings } = checkText(readJson(file), readback, readJson(join(ROOT, 'scripts', 'check-text.json')));
console.log(`Case ${id} · text check`);
if (!readback) console.log(`– No read-back: cases/drafts/${id}.readback.json is missing, so only the text checks ran.`);
errors.forEach((e) => console.log(`  ✗ ${e}`));
warnings.forEach((w) => console.log(`  ⚠ ${w}`));
if (!errors.length) console.log(readback ? '✓ Every clue reads back to its constraint, and the text passes.' : '✓ The text passes.');
process.exit(errors.length ? 1 : 0);
