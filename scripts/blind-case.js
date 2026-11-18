#!/usr/bin/env node
// Usage: npm run blind-case <id>
// Writes cases/drafts/<id>.blind.json: the case as the player sees it, without the logic (spec 010).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ROOT, CASES_DIR, findCaseFile, readJson } from './lib/load.js';
import { blindCase } from './lib/blind.js';

const id = process.argv[2];
if (!id) { console.error('✗ Usage: npm run blind-case <id>'); process.exit(1); }
const file = findCaseFile(id);
if (!file) { console.error(`✗ No single case file for "${id}" in cases/`); process.exit(1); }

const dir = join(CASES_DIR, 'drafts');
mkdirSync(dir, { recursive: true });
const out = join(dir, `${id}.blind.json`);
writeFileSync(out, JSON.stringify(blindCase(readJson(file)), null, 2) + '\n');
console.log(`✓ ${relative(ROOT, out)}`);
