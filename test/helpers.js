import { buildModel, ruleConstraints, clueConstraint, solve, formatSolution } from '../engine/index.js';

/** A small case: rooms in a line X - Y - Z unless doors are given. */
export function makeCase(over = {}) {
  const rooms = over.rooms ?? ['X', 'Y', 'Z'];
  const suspects = over.suspects ?? ['A', 'B'];
  const times = over.times ?? ['t1', 't2'];
  const doors = over.doors ?? rooms.slice(1).map((r, i) => [rooms[i], r]);
  const clues = (over.clues ?? []).map((constraint, i) => ({ id: i + 1, text: '', constraint }));
  const c = {
    id: 'T', title: 'Test',
    rooms: rooms.map((id) => ({ id, name: id })),
    doors,
    suspects: suspects.map((id) => ({ id, name: id })),
    times,
    murder: over.murder ?? { room: rooms[0], time: times[0] },
    clues,
    solution: over.solution ?? {},
  };
  if (over.controlQuestions) c.controlQuestions = over.controlQuestions;
  return c;
}

/** All solutions found by the solver, as sorted JSON strings. */
export function allSolutions(c, limit = 100000) {
  const { model, errors } = buildModel(c);
  if (!model) throw new Error(errors.join('; '));
  const cons = [...ruleConstraints(model), ...model.clues.map((cl) => clueConstraint(model, cl))];
  const { solutions, complete } = solve(model, cons, { limit });
  if (!complete && solutions.length >= limit) throw new Error('too many solutions');
  return solutions.map((s) => JSON.stringify(formatSolution(model, s))).sort();
}

/** Reference implementation: plain enumeration of every assignment, straight from the rules in the spec. */
export function bruteForce(c) {
  const rooms = c.rooms.map((r) => r.id), P = c.suspects.length, T = c.times.length;
  const adj = new Set(c.doors.flatMap(([a, b]) => [`${a}|${b}`, `${b}|${a}`]));
  const ok = (a, b) => a === b || adj.has(`${a}|${b}`);
  const ti = (t) => c.times.indexOf(t);
  const pi = (p) => c.suspects.findIndex((s) => s.id === p);
  const out = [];
  const grid = Array.from({ length: P }, () => new Array(T));
  const holds = (k) => {
    const g = (p, t) => grid[pi(p)][ti(t)];
    switch (k.type) {
      case 'at': return g(k.person, k.time) === k.room;
      case 'notAt': return (k.time ? [k.time] : c.times).every((t) => !k.rooms.includes(g(k.person, t)));
      case 'swap': {
        const t = ti(k.from), a = grid[pi(k.a)], b = grid[pi(k.b)];
        return a[t] !== b[t] && a[t + 1] === b[t] && b[t + 1] === a[t];
      }
      case 'stayed': { const t = ti(k.from); return grid[pi(k.person)][t] === grid[pi(k.person)][t + 1]; }
      case 'moved': { const t = ti(k.from); return grid[pi(k.person)][t] !== grid[pi(k.person)][t + 1]; }
    }
  };
  function rec(i) {
    if (i === P * T) {
      for (let t = 0; t < T; t++) {
        const col = grid.map((row) => row[t]);
        if (new Set(col).size !== P) return;
        if (t > 0 && grid.some((row) => !ok(row[t - 1], row[t]))) return;
      }
      if (!grid.some((row) => row[ti(c.murder.time)] === c.murder.room)) return;
      if (!c.clues.every((cl) => holds(cl.constraint))) return;
      const sol = {};
      c.suspects.forEach((s, p) => { sol[s.id] = grid[p].slice(); });
      out.push(JSON.stringify(sol));
      return;
    }
    const p = Math.floor(i / T), t = i % T;
    for (const r of rooms) { grid[p][t] = r; rec(i + 1); }
  }
  rec(0);
  return out.sort();
}
