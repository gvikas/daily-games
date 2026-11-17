#!/usr/bin/env node
// Usage: npm run roadmap
// Reads docs/roadmap.json, docs/specs/, docs/design/decisions.md, forslag-til-sparring.md and testrunder.json, cases/ and site/cases/index.json,
// and writes docs/roadmap.html (spec 009). No network, no dependencies.
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { ROOT } from './lib/load.js';
import { collect, renderPage, RoadmapError } from './lib/roadmap.js';

function gitInfo() {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%h %cs'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const [hash, date] = out.split(' ');
    return hash ? { hash, date } : null;
  } catch {
    return null;
  }
}

try {
  const model = collect(ROOT, { git: gitInfo() });
  const file = join(ROOT, 'docs', 'roadmap.html');
  writeFileSync(file, renderPage(model));
  const cur = (model.roadmap.increments || []).find((i) => i.status === 'current');
  console.log(`✓ docs/roadmap.html (${cur ? `inkrement ${cur.id} pågår` : 'ingen pågår'}, ${model.specs.done.length} ferdige specs, ${model.cases.length} saker)`);
  for (const w of [...model.warnings, ...(model.sparring ? model.sparring.warnings : []), ...(model.rounds ? model.rounds.warnings : [])]) console.log(`⚠ ${w}`);
} catch (e) {
  if (e instanceof RoadmapError) { console.error(`✗ ${e.message}`); process.exit(1); }
  throw e;
}
