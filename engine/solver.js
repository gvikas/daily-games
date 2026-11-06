// Backtracking search with constraint propagation and smallest-domain-first branching.
import { popcount } from './constraints.js';

function propagate(dom, constraints) {
  let changed = true;
  while (changed) {
    changed = false;
    for (const c of constraints) {
      const res = c.propagate(dom);
      if (res < 0) return false;
      if (res) changed = true;
    }
  }
  return true;
}

/**
 * Finds up to `limit` complete assignments that satisfy all constraints.
 * Returns { solutions: Int32Array[], complete }; complete is true when the search
 * finished (so solutions.length is the exact count).
 */
export function solve(model, constraints, { limit = 2 } = {}) {
  const n = model.P * model.T;
  const solutions = [];
  let stopped = false;

  function search(dom) {
    if (!propagate(dom, constraints)) return;
    let best = -1, bestSize = Infinity;
    for (let i = 0; i < n; i++) {
      const size = popcount(dom[i]);
      if (size > 1 && size < bestSize) { best = i; bestSize = size; }
    }
    if (best < 0) {
      const cells = new Int32Array(n);
      for (let i = 0; i < n; i++) cells[i] = 31 - Math.clz32(dom[i]);
      if (constraints.every((c) => c.check(cells))) {
        solutions.push(cells);
        if (solutions.length >= limit) stopped = true;
      }
      return;
    }
    for (let m = dom[best]; m && !stopped; m &= m - 1) {
      const next = dom.slice();
      next[best] = m & -m;
      search(next);
    }
  }

  search(new Uint32Array(n).fill(model.full));
  return { solutions, complete: !stopped };
}

export const exists = (model, constraints) => solve(model, constraints, { limit: 1 }).solutions.length > 0;

/** 0, 1 or 2 (meaning "2 or more"). */
export const countUpTo2 = (model, constraints) => solve(model, constraints, { limit: 2 }).solutions.length;
