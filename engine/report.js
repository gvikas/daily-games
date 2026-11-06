// Full analysis of a case, as described in docs/specs (spec 001).
import { buildModel, parseSolution, formatSolution } from './case.js';
import { ruleConstraints, clueConstraint, atConstraint } from './constraints.js';
import { solve, exists, countUpTo2 } from './solver.js';

export const EXHAUSTIVE_CLUE_LIMIT = 12;

function* combinations(items, k, start = 0, prefix = []) {
  if (prefix.length === k) { yield prefix; return; }
  for (let i = start; i <= items.length - (k - prefix.length); i++) {
    yield* combinations(items, k, i + 1, [...prefix, items[i]]);
  }
}

function murdererOf(model, cells) {
  const { room, time } = model.murder;
  for (let p = 0; p < model.P; p++) if (cells[p * model.T + time] === room) return p;
  return -1;
}

/** Smallest subsets of clues with a property. Exhaustive up to 12 clues, greedy above. */
function smallestSubsets(clues, holds, fromSize = 0) {
  if (clues.length > EXHAUSTIVE_CLUE_LIMIT) {
    let kept = clues.slice();
    for (const c of clues) {
      const without = kept.filter((x) => x !== c);
      if (holds(without)) kept = without;
    }
    return { size: kept.length, sets: [kept], method: 'greedy' };
  }
  for (let k = fromSize; k <= clues.length; k++) {
    const sets = [];
    for (const subset of combinations(clues, k)) if (holds(subset)) sets.push(subset);
    if (sets.length) return { size: k, sets, method: 'exhaustive' };
  }
  return null;
}

/**
 * Analyses a case object. Returns a plain, JSON-serialisable report.
 * report.ok is true when the case is valid, has exactly one solution and it matches `solution`.
 */
export function analyze(caseData) {
  const report = {
    case: { id: caseData?.id ?? null, title: caseData?.title ?? null },
    errors: [], warnings: [],
    solutionCount: null, solutions: [], conflict: null,
    matchesSolution: null, murderer: null,
    redundantClues: null, murderDecidedEarly: null, controlQuestions: null,
    ok: false,
  };

  // 1. Validation
  const { errors, model } = buildModel(caseData);
  report.errors.push(...errors);
  if (!model) return report;

  const rules = ruleConstraints(model);
  const clues = model.clues.map((cl) => clueConstraint(model, cl));
  const ids = (list) => list.map((c) => c.clueId);
  const fmt = (cells) => formatSolution(model, cells);

  const parsed = parseSolution(model, caseData.solution);
  report.errors.push(...parsed.errors);
  const expected = parsed.cells;
  if (expected) {
    for (const c of rules) if (!c.check(expected)) report.errors.push(`solution breaks ${c.label}`);
    for (const c of clues) if (!c.check(expected)) report.errors.push(`solution breaks ${c.label}`);
  }

  // 2. Number of solutions
  const { solutions } = solve(model, [...rules, ...clues], { limit: 2 });
  report.solutionCount = solutions.length >= 2 ? '2+' : solutions.length;
  report.solutions = solutions.map(fmt);

  if (solutions.length === 0) {
    // Deletion filter: drop clues while the rest stays impossible. What remains is a minimal conflict.
    let core = clues.slice();
    for (const c of clues) {
      const without = core.filter((x) => x !== c);
      if (!exists(model, [...rules, ...without])) core = without;
    }
    report.conflict = { clues: ids(core) };
  }

  if (solutions.length !== 1) {
    report.ok = false;
    return report;
  }
  const only = solutions[0];

  // 3. Matches the expected solution?
  report.matchesSolution = expected ? expected.every((r, i) => r === only[i]) : false;

  // 4. The murderer
  const m = murdererOf(model, only);
  report.murderer = {
    person: model.suspects[m].id, name: model.suspects[m].name,
    room: model.rooms[model.murder.room].id, roomName: model.rooms[model.murder.room].name,
    time: model.times[model.murder.time],
  };

  // 5. Redundant clues
  report.redundantClues = ids(clues.filter((c) => countUpTo2(model, [...rules, ...clues.filter((x) => x !== c)]) === 1));
  if (report.redundantClues.length) {
    report.warnings.push(`Redundant clues (each can be removed on its own): ${report.redundantClues.join(', ')}`);
  }

  // 6. How early the murderer is decided
  const { room: mr, time: mt } = model.murder;
  const murderDecided = (subset) => {
    for (let s = 0; s < model.P; s++) {
      if (s === m) continue;
      if (exists(model, [...rules, ...subset, atConstraint(model, s, mr, mt)])) return false;
    }
    return true;
  };
  const boardDecided = (subset) => countUpTo2(model, [...rules, ...subset]) === 1;
  const murderMin = smallestSubsets(clues, murderDecided);
  // Deciding the board also decides the murderer, so the board needs at least as many clues.
  const boardMin = smallestSubsets(clues, boardDecided, murderMin.method === 'exhaustive' ? murderMin.size : 0);
  report.murderDecidedEarly = {
    method: murderMin.method,
    murderClues: murderMin.size,
    murderSets: murderMin.sets.map(ids),
    boardClues: boardMin.size,
    boardSets: boardMin.sets.map(ids),
    early: murderMin.size < boardMin.size,
  };
  if (murderMin.method === 'greedy') {
    report.warnings.push(`More than ${EXHAUSTIVE_CLUE_LIMIT} clues: the clue counts in point 6 come from a greedy search and may not be the smallest possible.`);
  }
  if (report.murderDecidedEarly.early) {
    report.warnings.push(
      `The murderer is decided by ${murderMin.size} clue(s) but the board needs ${boardMin.size}. ` +
      `Enough to name the murderer: ${murderMin.sets.map((s) => `{${ids(s).join(', ')}}`).join(' or ')}.`,
    );
  }

  // 7. Control questions: possible answers from the rules and the murderer alone, without clues.
  report.controlQuestions = model.questions.map((q) => {
    const killer = q.forAccused ?? m;
    const base = [...rules, atConstraint(model, killer, mr, mt)];
    const possible = [];
    for (let r = 0; r < model.R; r++) {
      if (exists(model, [...base, atConstraint(model, q.person, r, q.time)])) possible.push(model.rooms[r].id);
    }
    const out = {
      person: model.suspects[q.person].id,
      time: model.times[q.time],
      forAccused: q.forAccused === null ? null : model.suspects[q.forAccused].id,
      assumedMurderer: model.suspects[killer].id,
      answer: model.rooms[only[q.person * model.T + q.time]].id,
      possibleRooms: possible,
      trivial: possible.length <= 1,
    };
    if (out.trivial) {
      report.warnings.push(`Control question "where was ${model.suspects[q.person].name} at ${out.time}" is trivial: only ${possible.join(', ') || 'no room'} is possible once the murderer is known.`);
    }
    return out;
  });

  report.ok = report.errors.length === 0 && report.matchesSolution;
  return report;
}
