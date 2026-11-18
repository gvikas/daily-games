#!/usr/bin/env node
// Guard and log for the case-reader subagent (spec 010).
//   node scripts/reader-access.js hook        PreToolUse hook: reads the call from stdin, logs it, exits 2 to block
//   npm run reader-access -- reset            empties the log before the reader starts
//   npm run reader-access -- check <id>       exit 1 unless the reader opened only cases/drafts/<id>.blind.json
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ROOT } from './lib/load.js';
import { decide, checkLog, LOG } from './lib/reader-access.js';

const [cmd, id] = process.argv.slice(2);
const logFile = join(ROOT, LOG);

if (cmd === 'hook') {
  let input = {};
  try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { /* an unreadable call is blocked below */ }
  const d = decide(input, input.cwd || ROOT);
  mkdirSync(dirname(logFile), { recursive: true });
  appendFileSync(logFile, JSON.stringify({ at: new Date().toISOString(), agent: input.agent_type || null, tool: input.tool_name || null, path: d.path, allow: d.allow }) + '\n');
  if (!d.allow) { console.error(d.reason); process.exit(2); }
  process.exit(0);
} else if (cmd === 'reset') {
  mkdirSync(dirname(logFile), { recursive: true });
  writeFileSync(logFile, '');
  console.log(`✓ ${LOG} emptied`);
} else if (cmd === 'check' && id) {
  const lines = existsSync(logFile) ? readFileSync(logFile, 'utf8').split('\n') : [];
  const { errors, entries } = checkLog(lines, id);
  console.log(`Case ${id} · what the case reader opened`);
  entries.forEach((e) => console.log(`  ${e.allow ? '✓' : '✗'} ${e.tool} ${e.path || ''}`));
  errors.forEach((e) => console.log(`  ✗ ${e}`));
  if (!errors.length) console.log(`✓ The reader opened only cases/drafts/${id}.blind.json.`);
  process.exit(errors.length ? 1 : 0);
} else {
  console.error('✗ Usage: npm run reader-access -- reset | check <id>   (the hook runs node scripts/reader-access.js hook)');
  process.exit(1);
}
