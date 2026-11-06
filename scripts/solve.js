#!/usr/bin/env node
// Usage: npm run solve <case.json> [--json]
// Exit code 0 when the case is valid, has exactly one solution and it matches "solution". Otherwise 1.
import { readFileSync } from 'node:fs';
import { analyze } from '../engine/index.js';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const file = args.find((a) => !a.startsWith('--'));

if (!file) {
  console.error('Usage: npm run solve <case.json> [--json]');
  process.exit(2);
}

let data;
try {
  data = JSON.parse(readFileSync(file, 'utf8'));
} catch (e) {
  console.error(`Could not read ${file}: ${e.message}`);
  process.exit(1);
}

const t0 = performance.now();
const report = analyze(data);
const ms = Math.round(performance.now() - t0);

if (asJson) {
  console.log(JSON.stringify({ ...report, timeMs: ms }, null, 2));
} else {
  console.log(formatText(data, report, ms));
}
process.exit(report.ok ? 0 : 1);

function formatText(c, r, ms) {
  const lines = [];
  const h = (s) => lines.push('', s, '-'.repeat(s.length));
  const name = (pid) => c.suspects?.find((s) => s.id === pid)?.name ?? pid;
  lines.push(`Case ${r.case.id ?? '?'} · ${r.case.title ?? '(untitled)'}   (${ms} ms)`);

  h('1. Validation');
  if (r.errors.length) r.errors.forEach((e) => lines.push(`  ✗ ${e}`));
  else lines.push('  ✓ No errors');
  if (r.solutionCount === null) return lines.join('\n') + '\n\nResult: INVALID\n';

  h('2. Solutions');
  lines.push(`  ${r.solutionCount === '2+' ? '2 or more' : r.solutionCount}`);
  if (r.solutionCount === '2+') lines.push(...sideBySide(c, r.solutions[0], r.solutions[1]));
  if (r.conflict) {
    lines.push(r.conflict.clues.length
      ? `  These clues cannot all be true: ${r.conflict.clues.join(', ')}`
      : '  The rules alone have no solution.');
  }

  if (r.solutionCount === 1) {
    h('3. Matches "solution"');
    lines.push(r.matchesSolution ? '  ✓ Yes' : '  ✗ No. The only solution is:');
    if (!r.matchesSolution) lines.push(...grid(c, r.solutions[0]));

    h('4. Murderer');
    lines.push(`  ${r.murderer.name}, in the ${r.murderer.roomName} at ${r.murderer.time}`);

    h('5. Redundant clues');
    lines.push(r.redundantClues.length ? `  ⚠ ${r.redundantClues.join(', ')} (each can be removed on its own)` : '  None');

    h('6. How early the murderer is decided');
    const e = r.murderDecidedEarly;
    const sets = (s) => s.map((x) => `{${x.join(', ')}}`).join(' or ');
    const more = (s, n) => (s.length > n ? sets(s.slice(0, n)) + ` … (${s.length} sets)` : sets(s));
    lines.push(`  Murderer: ${e.murderClues} clue(s), e.g. ${more(e.murderSets, 5)}`);
    lines.push(`  Board:    ${e.boardClues} clue(s), e.g. ${more(e.boardSets, 5)}`);
    if (e.method === 'greedy') lines.push('  (approximate: greedy search, more than 12 clues)');
    lines.push(e.early ? '  ⚠ The murderer is decided before the board is solved.' : '  ✓ The murderer is not decided before the board.');

    h('7. Control questions');
    if (!r.controlQuestions.length) lines.push('  None');
    r.controlQuestions.forEach((q) => {
      const who = q.forAccused ? ` (asked when ${name(q.forAccused)} is accused)` : '';
      lines.push(`  Where was ${name(q.person)} at ${q.time}?${who}`);
      lines.push(`    Answer: ${q.answer}. Possible without clues, if ${name(q.assumedMurderer)} is the murderer: ${q.possibleRooms.join(', ')} (${q.possibleRooms.length})${q.trivial ? '  ⚠ trivial' : ''}`);
    });
  }

  if (r.warnings.length) {
    h('Warnings');
    r.warnings.forEach((w) => lines.push(`  ⚠ ${w}`));
  }
  lines.push('', `Result: ${r.ok ? 'OK' : 'NOT OK'}`, '');
  return lines.join('\n');
}

function grid(c, sol) {
  const w = Math.max(...c.suspects.map((s) => s.name.length)) + 2;
  const out = ['  ' + ''.padEnd(w) + c.times.map((t) => t.padEnd(7)).join('')];
  c.suspects.forEach((s) => out.push('  ' + s.name.padEnd(w) + sol[s.id].map((r) => r.padEnd(7)).join('')));
  return out;
}

function sideBySide(c, a, b) {
  const w = Math.max(...c.suspects.map((s) => s.name.length)) + 2;
  const col = (sol, other, s) => sol[s.id].map((r, i) => ((r !== other[s.id][i] ? '*' : ' ') + r).padEnd(7)).join('');
  const head = c.times.map((t) => (' ' + t).padEnd(7)).join('');
  const out = [
    '  ' + ''.padEnd(w) + 'Solution 1'.padEnd(head.length + 3) + 'Solution 2',
    '  ' + ''.padEnd(w) + head + '   ' + head,
  ];
  c.suspects.forEach((s) => out.push('  ' + s.name.padEnd(w) + col(a, b, s) + '   ' + col(b, a, s)));
  out.push('  (* marks where the two solutions differ)');
  return out;
}
