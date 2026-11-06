// Rules and clues compiled to constraints over room-set domains.
// A domain is a bitmask of rooms for one cell (person p at time t, cell = p * T + t).
// propagate(dom) narrows domains and returns -1 (contradiction), 0 (no change) or 1 (changed).
// check(cells) verifies a complete assignment and is the final word on correctness.

export const popcount = (m) => { let n = 0; while (m) { m &= m - 1; n++; } return n; };
const single = (m) => m !== 0 && (m & (m - 1)) === 0;

function narrow(dom, i, mask) {
  const next = dom[i] & mask;
  if (next === dom[i]) return 0;
  dom[i] = next;
  return next === 0 ? -1 : 1;
}

function reach(model, mask) {
  let out = 0;
  for (let r = 0; mask; r++, mask >>>= 1) if (mask & 1) out |= model.nbr[r];
  return out;
}

/** Rules 1–5. Rule 1 is implicit (every cell gets exactly one room). Rule 4 needs no constraint. */
export function ruleConstraints(model) {
  const { P, T, R } = model;
  const out = [];
  const cell = (p, t) => p * T + t;

  // Rule 2: at most one person per room per time.
  for (let t = 0; t < T; t++) {
    out.push({
      label: `rule 2 (one person per room) at ${model.times[t]}`,
      propagate(dom) {
        let changed = 0, again = true;
        while (again) {
          again = false;
          for (let p = 0; p < P; p++) {
            const m = dom[cell(p, t)];
            if (!single(m)) continue;
            for (let q = 0; q < P; q++) {
              if (q === p) continue;
              const res = narrow(dom, cell(q, t), ~m);
              if (res < 0) return -1;
              if (res) { changed = 1; again = true; }
            }
          }
        }
        let union = 0;
        for (let p = 0; p < P; p++) union |= dom[cell(p, t)];
        if (popcount(union) < P) return -1;
        if (R === P) {
          // Every room must be used: a room only one person can take is theirs.
          for (let r = 0; r < R; r++) {
            const bit = 1 << r;
            let holder = -1, n = 0;
            for (let p = 0; p < P; p++) if (dom[cell(p, t)] & bit) { holder = p; n++; }
            if (n === 0) return -1;
            if (n === 1 && dom[cell(holder, t)] !== bit) { dom[cell(holder, t)] = bit; changed = 1; }
          }
        }
        return changed;
      },
      check(cells) {
        const seen = new Set();
        for (let p = 0; p < P; p++) {
          const r = cells[cell(p, t)];
          if (seen.has(r)) return false;
          seen.add(r);
        }
        return true;
      },
    });
  }

  // Rule 3: between two times a person stays or walks through one door.
  for (let p = 0; p < P; p++) {
    for (let t = 0; t + 1 < T; t++) {
      const a = cell(p, t), b = cell(p, t + 1);
      out.push({
        label: `rule 3 (one door per hour) for ${model.suspects[p].name} ${model.times[t]}→${model.times[t + 1]}`,
        propagate(dom) {
          const r1 = narrow(dom, b, reach(model, dom[a]));
          if (r1 < 0) return -1;
          const r2 = narrow(dom, a, reach(model, dom[b]));
          if (r2 < 0) return -1;
          return r1 || r2 ? 1 : 0;
        },
        check(cells) { return (model.nbr[cells[a]] & (1 << cells[b])) !== 0; },
      });
    }
  }

  // Rule 5: the murder room is occupied at the murder time.
  const { room: mr, time: mt } = model.murder;
  const bit = 1 << mr;
  out.push({
    label: `rule 5 (${model.rooms[mr].name} is occupied at ${model.times[mt]})`,
    propagate(dom) {
      let holder = -1, n = 0;
      for (let p = 0; p < P; p++) if (dom[cell(p, mt)] & bit) { holder = p; n++; }
      if (n === 0) return -1;
      if (n === 1 && dom[cell(holder, mt)] !== bit) { dom[cell(holder, mt)] = bit; return 1; }
      return 0;
    },
    check(cells) {
      for (let p = 0; p < P; p++) if (cells[cell(p, mt)] === mr) return true;
      return false;
    },
  });

  return out;
}

/** "person was in room at time". Used for clues and for the hypotheses the report tests. */
export function atConstraint(model, person, room, time, label) {
  const i = person * model.T + time, bit = 1 << room;
  return {
    label: label || `${model.suspects[person].name} in ${model.rooms[room].name} at ${model.times[time]}`,
    propagate: (dom) => narrow(dom, i, bit),
    check: (cells) => cells[i] === room,
  };
}

/** Compiles one parsed clue (from buildModel) into a constraint. */
export function clueConstraint(model, clue) {
  const T = model.T;
  const label = `clue ${clue.id}`;
  const cell = (p, t) => p * T + t;
  switch (clue.type) {
    case 'at': {
      const c = atConstraint(model, clue.person, clue.room, clue.time, label);
      return { ...c, clueId: clue.id };
    }
    case 'notAt': {
      const mask = clue.rooms.reduce((m, r) => m | (1 << r), 0);
      const times = clue.time === null ? [...Array(T).keys()] : [clue.time];
      return {
        label, clueId: clue.id,
        propagate(dom) {
          let changed = 0;
          for (const t of times) {
            const res = narrow(dom, cell(clue.person, t), ~mask);
            if (res < 0) return -1;
            changed |= res;
          }
          return changed;
        },
        check: (cells) => times.every((t) => !(mask & (1 << cells[cell(clue.person, t)]))),
      };
    }
    case 'swap': {
      const a0 = cell(clue.a, clue.from), a1 = a0 + 1, b0 = cell(clue.b, clue.from), b1 = b0 + 1;
      return {
        label, clueId: clue.id,
        propagate(dom) {
          let changed = 0;
          for (const [x, y] of [[a1, b0], [b0, a1], [b1, a0], [a0, b1]]) {
            const res = narrow(dom, x, dom[y]);
            if (res < 0) return -1;
            changed |= res;
          }
          return changed;
        },
        check: (cells) => cells[a0] !== cells[b0] && cells[a1] === cells[b0] && cells[b1] === cells[a0],
      };
    }
    case 'stayed': {
      const x = cell(clue.person, clue.from), y = x + 1;
      return {
        label, clueId: clue.id,
        propagate(dom) {
          const r1 = narrow(dom, x, dom[y]);
          if (r1 < 0) return -1;
          const r2 = narrow(dom, y, dom[x]);
          if (r2 < 0) return -1;
          return r1 || r2 ? 1 : 0;
        },
        check: (cells) => cells[x] === cells[y],
      };
    }
    case 'moved': {
      const x = cell(clue.person, clue.from), y = x + 1;
      return {
        label, clueId: clue.id,
        propagate(dom) {
          let changed = 0;
          if (single(dom[x])) { const r = narrow(dom, y, ~dom[x]); if (r < 0) return -1; changed |= r; }
          if (single(dom[y])) { const r = narrow(dom, x, ~dom[y]); if (r < 0) return -1; changed |= r; }
          return changed;
        },
        check: (cells) => cells[x] !== cells[y],
      };
    }
    default:
      throw new Error(`unknown clue type ${clue.type}`);
  }
}
