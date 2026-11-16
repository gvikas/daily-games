// Which shown findings does the player's map contradict? (spec 008, part 1)
// Pure JavaScript with no imports: it is copied to site/lib/ and runs in the browser.
//
// It compares placed cells with what each shown finding says directly. It never looks at the
// solution and never draws conclusions for the player. Cells that are not placed never conflict,
// and a finding that has not been shown never conflicts.

/**
 * caseData:   the case (rooms, suspects, times, clues).
 * placements: { personId: [roomId | null, ...] }, one entry per time, in the order of caseData.times.
 * shown:      ids of the findings the player has seen (array or Set).
 * Returns [{ clue: id, cells: [{ person, t, time }] }], in the order of caseData.clues.
 */
export function conflicts(caseData, placements, shown) {
  const seen = shown instanceof Set ? shown : new Set(shown || []);
  const times = caseData.times;
  const people = caseData.suspects.map((s) => s.id);
  const T = times.length;
  const at = (p, t) => (placements && placements[p] && t >= 0 && t < T ? placements[p][t] || null : null);
  const ti = (time) => times.indexOf(time);
  const out = [];

  for (const clue of caseData.clues || []) {
    if (!seen.has(clue.id)) continue;
    const k = clue.constraint || {};
    const cells = [];
    const add = (person, t) => {
      if (!cells.some((c) => c.person === person && c.t === t)) cells.push({ person, t, time: times[t] });
    };

    switch (k.type) {
      case 'at': {
        const t = ti(k.time);
        const here = at(k.person, t);
        if (here && here !== k.room) add(k.person, t);
        for (const q of people) if (q !== k.person && at(q, t) === k.room) add(q, t);
        break;
      }
      case 'notAt': {
        const ts = k.time === undefined ? [...Array(T).keys()] : [ti(k.time)];
        for (const t of ts) { const r = at(k.person, t); if (r && k.rooms.includes(r)) add(k.person, t); }
        break;
      }
      case 'stayed':
      case 'moved': {
        const t = ti(k.from), a = at(k.person, t), b = at(k.person, t + 1);
        if (a && b && (k.type === 'stayed' ? a !== b : a === b)) { add(k.person, t); add(k.person, t + 1); }
        break;
      }
      case 'swap': {
        // a and b traded rooms between "from" and the next time.
        const t = ti(k.from);
        const a0 = at(k.a, t), a1 = at(k.a, t + 1), b0 = at(k.b, t), b1 = at(k.b, t + 1);
        if (a1 && b0 && a1 !== b0) { add(k.a, t + 1); add(k.b, t); }
        if (b1 && a0 && b1 !== a0) { add(k.b, t + 1); add(k.a, t); }
        if (a0 && a1 && a0 === a1) { add(k.a, t); add(k.a, t + 1); }
        if (b0 && b1 && b0 === b1) { add(k.b, t); add(k.b, t + 1); }
        break;
      }
      default:
        break;
    }
    if (cells.length) out.push({ clue: clue.id, cells });
  }
  return out;
}
