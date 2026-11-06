// Case model and validation. Pure JavaScript, no Node APIs, so it can run in the browser.

export const CLUE_TYPES = ['at', 'notAt', 'swap', 'stayed', 'moved'];
const TRANSITION_TYPES = ['swap', 'stayed', 'moved'];
const MAX_ROOMS = 30; // room sets are stored as 32-bit masks

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v) => typeof v === 'string' && v.length > 0;

function indexIds(list, label, errors) {
  const idx = new Map();
  if (!Array.isArray(list) || list.length === 0) {
    errors.push(`${label}: must be a non-empty array`);
    return idx;
  }
  list.forEach((item, i) => {
    if (!isObj(item) || !isStr(item.id)) { errors.push(`${label}[${i}]: needs a string "id"`); return; }
    if (!isStr(item.name)) errors.push(`${label} "${item.id}": needs a string "name"`);
    if (idx.has(item.id)) errors.push(`${label}: duplicate id "${item.id}"`);
    else idx.set(item.id, idx.size);
  });
  return idx;
}

/**
 * Checks the structure of a case and builds the internal model.
 * Returns { errors, model }. model is null when the structure is broken.
 */
export function buildModel(c) {
  const errors = [];
  if (!isObj(c)) return { errors: ['case: must be a JSON object'], model: null };
  if (!isStr(c.id)) errors.push('id: must be a non-empty string');
  if (!isStr(c.title)) errors.push('title: must be a non-empty string');

  const roomIdx = indexIds(c.rooms, 'rooms', errors);
  const personIdx = indexIds(c.suspects, 'suspects', errors);
  const timeIdx = new Map();
  if (!Array.isArray(c.times) || c.times.length === 0) errors.push('times: must be a non-empty array');
  else c.times.forEach((t, i) => {
    if (!isStr(t)) errors.push(`times[${i}]: must be a string`);
    else if (timeIdx.has(t)) errors.push(`times: duplicate time "${t}"`);
    else timeIdx.set(t, timeIdx.size);
  });

  const R = roomIdx.size, P = personIdx.size, T = timeIdx.size;
  if (R > MAX_ROOMS) errors.push(`rooms: at most ${MAX_ROOMS} rooms are supported`);
  if (P > R && R > 0) errors.push(`suspects: ${P} suspects but only ${R} rooms (rule 2 needs at least one room per suspect)`);

  const room = (id, where) => { if (!roomIdx.has(id)) { errors.push(`${where}: unknown room "${id}"`); return -1; } return roomIdx.get(id); };
  const person = (id, where) => { if (!personIdx.has(id)) { errors.push(`${where}: unknown suspect "${id}"`); return -1; } return personIdx.get(id); };
  const time = (id, where) => { if (!timeIdx.has(id)) { errors.push(`${where}: unknown time "${id}"`); return -1; } return timeIdx.get(id); };

  // Doors: closed neighbourhood masks (a room counts as its own neighbour: staying put).
  const nbr = new Array(R).fill(0).map((_, r) => 1 << r);
  if (!Array.isArray(c.doors)) errors.push('doors: must be an array');
  else c.doors.forEach((d, i) => {
    if (!Array.isArray(d) || d.length !== 2) { errors.push(`doors[${i}]: must be a pair of room ids`); return; }
    const a = room(d[0], `doors[${i}]`), b = room(d[1], `doors[${i}]`);
    if (a < 0 || b < 0) return;
    if (a === b) { errors.push(`doors[${i}]: a door must join two different rooms`); return; }
    nbr[a] |= 1 << b; nbr[b] |= 1 << a;
  });

  let murder = null;
  if (!isObj(c.murder)) errors.push('murder: must be an object with "room" and "time"');
  else {
    const r = room(c.murder.room, 'murder'), t = time(c.murder.time, 'murder');
    if (r >= 0 && t >= 0) murder = { room: r, time: t };
  }

  const clues = [];
  if (c.clues !== undefined && !Array.isArray(c.clues)) errors.push('clues: must be an array');
  const seenClue = new Set();
  (Array.isArray(c.clues) ? c.clues : []).forEach((cl, i) => {
    const where = `clue ${isObj(cl) && cl.id !== undefined ? cl.id : `#${i}`}`;
    if (!isObj(cl)) { errors.push(`clues[${i}]: must be an object`); return; }
    if (cl.id === undefined) errors.push(`clues[${i}]: needs an "id"`);
    else if (seenClue.has(cl.id)) errors.push(`clues: duplicate id "${cl.id}"`);
    seenClue.add(cl.id);
    const k = cl.constraint;
    if (!isObj(k) || !CLUE_TYPES.includes(k.type)) {
      errors.push(`${where}: constraint.type must be one of ${CLUE_TYPES.join(', ')}`);
      return;
    }
    const n = errors.length;
    const out = { id: cl.id, type: k.type };
    if (k.type === 'at') {
      out.person = person(k.person, where); out.room = room(k.room, where); out.time = time(k.time, where);
    } else if (k.type === 'notAt') {
      out.person = person(k.person, where);
      if (!Array.isArray(k.rooms) || k.rooms.length === 0) errors.push(`${where}: "rooms" must be a non-empty array`);
      else out.rooms = k.rooms.map((r) => room(r, where));
      out.time = k.time === undefined ? null : time(k.time, where);
    } else if (k.type === 'swap') {
      out.a = person(k.a, where); out.b = person(k.b, where);
      if (k.a === k.b) errors.push(`${where}: "a" and "b" must be different suspects`);
    } else {
      out.person = person(k.person, where);
    }
    if (TRANSITION_TYPES.includes(k.type)) {
      out.from = time(k.from, where);
      if (out.from >= 0 && out.from === T - 1) errors.push(`${where}: "from" cannot be the last time (${k.from})`);
    }
    if (errors.length === n) clues.push(out);
  });

  if (c.controlQuestions !== undefined && !Array.isArray(c.controlQuestions)) errors.push('controlQuestions: must be an array');
  const questions = [];
  (Array.isArray(c.controlQuestions) ? c.controlQuestions : []).forEach((q, i) => {
    const where = `controlQuestions[${i}]`;
    if (!isObj(q)) { errors.push(`${where}: must be an object`); return; }
    const n = errors.length;
    const out = { person: person(q.person, where), time: time(q.time, where), forAccused: null };
    if (q.forAccused !== undefined) out.forAccused = person(q.forAccused, where);
    if (errors.length === n) questions.push(out);
  });

  if (errors.length) return { errors, model: null };
  return {
    errors,
    model: {
      R, P, T, nbr, murder, clues, questions,
      full: R === 32 ? 0xffffffff : (1 << R) - 1,
      rooms: c.rooms, suspects: c.suspects, times: c.times,
      roomIdx, personIdx, timeIdx,
    },
  };
}

/** Converts a solution object ({personId: [roomId, ...]}) to a cell array, or returns errors. */
export function parseSolution(model, sol) {
  const errors = [];
  if (!isObj(sol)) return { errors: ['solution: must be an object with one array of rooms per suspect'], cells: null };
  const cells = new Int32Array(model.P * model.T).fill(-1);
  for (const key of Object.keys(sol)) {
    if (!model.personIdx.has(key)) errors.push(`solution: unknown suspect "${key}"`);
  }
  model.suspects.forEach((s, p) => {
    const row = sol[s.id];
    if (!Array.isArray(row) || row.length !== model.T) {
      errors.push(`solution: "${s.id}" must have ${model.T} rooms, one per time`);
      return;
    }
    row.forEach((rid, t) => {
      if (!model.roomIdx.has(rid)) errors.push(`solution: "${s.id}" at ${model.times[t]}: unknown room "${rid}"`);
      else cells[p * model.T + t] = model.roomIdx.get(rid);
    });
  });
  return { errors, cells: errors.length ? null : cells };
}

/** Converts a cell array back to {personId: [roomId, ...]}. */
export function formatSolution(model, cells) {
  const out = {};
  model.suspects.forEach((s, p) => {
    out[s.id] = [];
    for (let t = 0; t < model.T; t++) out[s.id].push(model.rooms[cells[p * model.T + t]].id);
  });
  return out;
}
