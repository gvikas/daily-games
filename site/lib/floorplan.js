// Floor plans: validation and geometry. Pure JavaScript, no Node APIs.
// This file is copied to site/lib/floorplan.js by `npm run publish-case`, so the game page draws
// the map with exactly the code the tests cover. Do not import anything here.
//
// A plan is rectangles ("slots") on a grid plus doors on shared walls. Everything the page draws
// (walls with door gaps, door arcs, door points, room centres, markers) is derived from that.

export const PAD = 20;          // house offset inside the SVG
export const HOUSE = 360;       // the longest side of the house in SVG units
export const MARGIN = 6;        // viewBox margin around the house
export const DOOR = 40;         // door opening, also the radius of the door arc
export const MIN_DOOR_WALL = 60; // a shared wall must be at least this long (SVG units) to hold a door
export const TOKEN_R = 22;
export const MARKER_R = 11;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isInt = (v) => Number.isInteger(v);
const r1 = (n) => Math.round(n * 10) / 10;

/** The wall two slots share, in grid units, or null. { vertical, at, from, to } */
export function sharedWall(a, b) {
  const overlap = (a1, a2, b1, b2) => [Math.max(a1, b1), Math.min(a2, b2)];
  if (a.x + a.w === b.x || b.x + b.w === a.x) {
    const [from, to] = overlap(a.y, a.y + a.h, b.y, b.y + b.h);
    if (to > from) return { vertical: true, at: a.x + a.w === b.x ? b.x : a.x, from, to };
  }
  if (a.y + a.h === b.y || b.y + b.h === a.y) {
    const [from, to] = overlap(a.x, a.x + a.w, b.x, b.x + b.w);
    if (to > from) return { vertical: false, at: a.y + a.h === b.y ? b.y : a.y, from, to };
  }
  return null;
}

/** Returns a list of error strings. An empty list means the plan can be drawn. */
export function validateFloorplan(plan) {
  const errors = [];
  if (!isObj(plan)) return ['floorplan: must be a JSON object'];
  if (typeof plan.id !== 'string' || !plan.id) errors.push('floorplan: needs a string "id"');
  if (typeof plan.shape !== 'string' || !plan.shape) errors.push('floorplan: needs a string "shape"');
  const g = plan.grid;
  if (!isObj(g) || !isInt(g.cols) || !isInt(g.rows) || g.cols < 1 || g.rows < 1) {
    errors.push('floorplan: "grid" needs whole numbers "cols" and "rows"');
    return errors;
  }
  if (!Array.isArray(plan.slots) || plan.slots.length === 0) {
    errors.push('floorplan: "slots" must be a non-empty array');
    return errors;
  }
  const byId = new Map();
  const cells = new Array(g.cols * g.rows).fill(null);
  plan.slots.forEach((s, i) => {
    if (!isObj(s) || typeof s.id !== 'string' || !s.id) { errors.push(`floorplan: slots[${i}] needs a string "id"`); return; }
    if (byId.has(s.id)) { errors.push(`floorplan: duplicate slot "${s.id}"`); return; }
    if (![s.x, s.y, s.w, s.h].every(isInt) || s.w < 1 || s.h < 1) { errors.push(`floorplan: slot "${s.id}" needs whole numbers x, y, w, h`); return; }
    if (s.x < 0 || s.y < 0 || s.x + s.w > g.cols || s.y + s.h > g.rows) { errors.push(`floorplan: slot "${s.id}" is outside the grid`); return; }
    byId.set(s.id, s);
    for (let y = s.y; y < s.y + s.h; y++) for (let x = s.x; x < s.x + s.w; x++) {
      const k = y * g.cols + x;
      if (cells[k] !== null && cells[k] !== s.id) errors.push(`floorplan: slots "${cells[k]}" and "${s.id}" overlap`);
      cells[k] = s.id;
    }
  });
  if (cells.includes(null)) errors.push('floorplan: the slots do not fill the grid');

  const unit = HOUSE / Math.max(g.cols, g.rows);
  const seen = new Set();
  if (!Array.isArray(plan.doors)) errors.push('floorplan: "doors" must be an array');
  else plan.doors.forEach((d, i) => {
    const where = `floorplan: doors[${i}]`;
    if (!isObj(d) || !Array.isArray(d.between) || d.between.length !== 2) { errors.push(`${where} needs "between": [slot, slot]`); return; }
    const [a, b] = d.between.map((id) => byId.get(id));
    if (!a || !b) { errors.push(`${where}: unknown slot "${!a ? d.between[0] : d.between[1]}"`); return; }
    if (a === b) { errors.push(`${where}: a door must join two different slots`); return; }
    const key = [a.id, b.id].sort().join('|');
    if (seen.has(key)) errors.push(`${where}: a second door between "${a.id}" and "${b.id}"`);
    seen.add(key);
    if (typeof d.at !== 'number' || d.at < 0 || d.at > 1) errors.push(`${where}: "at" must be a number from 0 to 1`);
    if (d.secret !== undefined && typeof d.secret !== 'boolean') errors.push(`${where}: "secret" must be true or false`);
    const wall = sharedWall(a, b);
    if (!wall) errors.push(`${where}: "${a.id}" and "${b.id}" do not share a wall`);
    else if ((wall.to - wall.from) * unit < MIN_DOOR_WALL) errors.push(`${where}: the wall between "${a.id}" and "${b.id}" is too short for a door`);
  });
  return [...new Set(errors)];
}

/**
 * Geometry for a valid plan, in SVG units.
 * rooms[slotId] = { x, y, w, h, center: [x, y], nameAt: 'top' | 'bottom', namePos: [x, y] }
 * walls = [{ x1, y1, x2, y2 }] (inner walls, already cut at door openings)
 * doors = [{ between, secret, point: [x, y], vertical, gap: [from, to], arc, into }]
 */
export function layout(plan) {
  const { cols, rows } = plan.grid;
  const unit = HOUSE / Math.max(cols, rows);
  const px = (n) => PAD + n * unit;
  const width = cols * unit, height = rows * unit;

  const rooms = {};
  for (const s of plan.slots) {
    const x = px(s.x), y = px(s.y), w = s.w * unit, h = s.h * unit;
    const nameAt = s.y + s.h === rows && s.y > 0 ? 'bottom' : 'top';
    rooms[s.id] = {
      x, y, w, h, nameAt,
      namePos: [x + 16, nameAt === 'top' ? y + 26 : y + h - 16],
      // The token sits in the middle, nudged away from a name along the top wall.
      center: [r1(x + w / 2), r1(y + h / 2 + (nameAt === 'top' ? 8 : 0))],
    };
  }

  // Inner walls: every wall two slots share, merged along each grid line.
  const lines = new Map(); // "v|x" or "h|y" -> [[from, to]]
  const walls = [];
  for (let i = 0; i < plan.slots.length; i++) for (let j = i + 1; j < plan.slots.length; j++) {
    const w = sharedWall(plan.slots[i], plan.slots[j]);
    if (!w) continue;
    const key = (w.vertical ? 'v|' : 'h|') + w.at;
    if (!lines.has(key)) lines.set(key, []);
    lines.get(key).push([px(w.from), px(w.to)]);
  }

  const doors = (plan.doors || []).map((d) => {
    const a = plan.slots.find((s) => s.id === d.between[0]), b = plan.slots.find((s) => s.id === d.between[1]);
    const w = sharedWall(a, b);
    const from = px(w.from), to = px(w.to), line = px(w.at);
    const half = DOOR / 2;
    const mid = Math.min(Math.max(from + d.at * (to - from), from + half + 10), to - half - 10);
    const point = w.vertical ? [line, r1(mid)] : [r1(mid), line];
    // The door swings into the second slot of "between".
    const dir = w.vertical ? [b.x >= a.x + a.w ? 1 : -1, 0] : [0, b.y >= a.y + a.h ? 1 : -1];
    // Hinge side, chosen so the hand-drawn houses of cases 001–004 come out exactly as they were.
    const hv = [Math.abs(dir[1]), dir[0]];
    const hinge = [point[0] + hv[0] * half, point[1] + hv[1] * half];
    const start = [point[0] - hv[0] * half, point[1] - hv[1] * half];
    const end = [hinge[0] + dir[0] * DOOR, hinge[1] + dir[1] * DOOR];
    const cross = (start[0] - hinge[0]) * (end[1] - hinge[1]) - (start[1] - hinge[1]) * (end[0] - hinge[0]);
    return {
      between: d.between.slice(), secret: d.secret === true,
      point, vertical: w.vertical, line, gap: [r1(mid - half), r1(mid + half)], into: b.id, dir, hinge,
      arc: `M${r1(start[0])} ${r1(start[1])} A${DOOR} ${DOOR} 0 0 ${cross > 0 ? 1 : 0} ${r1(end[0])} ${r1(end[1])}`,
    };
  });

  // In small rooms a door leaf can swing over the token. Push the token away from such a door,
  // but keep it clear of the walls and of the room name.
  for (const d of doors) {
    if (d.secret) continue;
    const r = rooms[d.into];
    const axis = d.vertical ? 0 : 1, other = 1 - axis;
    const need = DOOR + TOKEN_R + 4;
    if (Math.abs(r.center[other] - d.point[other]) >= DOOR / 2 + TOKEN_R) continue;
    const dist = (r.center[axis] - d.line) * d.dir[axis];
    if (dist >= need) continue;
    const lo = axis === 0 ? r.x + TOKEN_R + 6 : r.y + TOKEN_R + 6 + (r.nameAt === 'top' ? 30 : 0);
    const hi = axis === 0 ? r.x + r.w - TOKEN_R - 6 : r.y + r.h - TOKEN_R - 6 - (r.nameAt === 'bottom' ? 30 : 0);
    const want = d.line + d.dir[axis] * need;
    r.center[axis] = r1(Math.min(hi, Math.max(lo, d.dir[axis] > 0 ? Math.max(r.center[axis], want) : Math.min(r.center[axis], want))));
  }

  for (const [key, segs] of lines) {
    const vertical = key[0] === 'v', line = px(Number(key.slice(2)));
    segs.sort((p, q) => p[0] - q[0]);
    const merged = [];
    for (const s of segs) {
      const last = merged[merged.length - 1];
      if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]); else merged.push(s.slice());
    }
    const gaps = doors.filter((d) => !d.secret && d.vertical === vertical && d.line === line).map((d) => d.gap).sort((p, q) => p[0] - q[0]);
    for (const [from, to] of merged) {
      let at = from;
      for (const [g1, g2] of gaps) {
        if (g2 <= from || g1 >= to) continue;
        if (g1 > at) walls.push(vertical ? { x1: line, y1: at, x2: line, y2: g1 } : { x1: at, y1: line, x2: g1, y2: line });
        at = g2;
      }
      if (at < to) walls.push(vertical ? { x1: line, y1: at, x2: line, y2: to } : { x1: at, y1: line, x2: to, y2: line });
    }
  }
  walls.sort((p, q) => p.x1 - q.x1 || p.y1 - q.y1 || p.x2 - q.x2 || p.y2 - q.y2);

  return {
    unit, width, height,
    viewBox: [PAD - MARGIN, PAD - MARGIN, width + 2 * MARGIN, height + 2 * MARGIN],
    outer: { x: PAD, y: PAD, w: width, h: height },
    rooms, walls, doors,
  };
}

/** The door point between two slots (either order), or null when there is no door. */
export function doorPoint(lay, a, b) {
  const d = lay.doors.find((x) => (x.between[0] === a && x.between[1] === b) || (x.between[0] === b && x.between[1] === a));
  return d ? d.point : null;
}

// --- Placing things inside rooms -------------------------------------------------------------

const box = (x1, y1, x2, y2) => ({ x1, y1, x2, y2 });
const boxAround = (cx, cy, hw, hh) => box(cx - hw, cy - hh, cx + hw, cy + hh);
const circleAsBox = (c) => boxAround(c.cx, c.cy, c.r, c.r);
function gapBetween(a, b) {
  // Distance between two shapes (boxes, or circles given as { cx, cy, r }). Negative when they overlap.
  if (a.r !== undefined && b.r !== undefined) return Math.hypot(a.cx - b.cx, a.cy - b.cy) - a.r - b.r;
  if (a.r !== undefined) return gapBetween(b, a);
  if (b.r !== undefined) {
    const dx = Math.max(a.x1 - b.cx, 0, b.cx - a.x2), dy = Math.max(a.y1 - b.cy, 0, b.cy - a.y2);
    const d = Math.hypot(dx, dy);
    return d > 0 ? d - b.r : -b.r;
  }
  const dx = Math.max(a.x1 - b.x2, b.x1 - a.x2), dy = Math.max(a.y1 - b.y2, b.y1 - a.y2);
  return dx < 0 && dy < 0 ? Math.max(dx, dy) : Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
}

/** Rough width of a text in SVG units. Good enough to keep things from colliding. */
export const textWidth = (text, fontSize, mono) => text.length * fontSize * (mono ? 0.61 : 0.57);

/** Font size that makes a room name fit its room (17 is the size used when there is space). */
export function nameFontSize(room, text) {
  return Math.max(10, Math.min(17, Math.floor((room.w - 28) / (text.length * 0.57))));
}

function roomObstacles(lay, slot, nameText) {
  const r = lay.rooms[slot];
  const out = [];
  const fs = nameFontSize(r, nameText);
  const nw = textWidth(nameText, fs);
  out.push(r.nameAt === 'top' ? box(r.x + 12, r.y + 8, r.x + 18 + nw, r.y + 32) : box(r.x + 12, r.y + r.h - 34, r.x + 18 + nw, r.y + r.h - 8));
  out.push({ cx: r.center[0], cy: r.center[1], r: TOKEN_R + 3 });
  for (const d of lay.doors) {
    if (d.secret || !d.between.includes(slot)) continue;
    // Keep the doorway clear: this is where tokens and trails pass.
    const inward = d.into === slot ? d.dir : [-d.dir[0], -d.dir[1]];
    const [gx, gy] = d.point;
    const depth = 26, half = DOOR / 2;
    out.push(d.vertical
      ? box(Math.min(gx, gx + inward[0] * depth), gy - half, Math.max(gx, gx + inward[0] * depth), gy + half)
      : box(gx - half, Math.min(gy, gy + inward[1] * depth), gx + half, Math.max(gy, gy + inward[1] * depth)));
    if (d.into === slot) {
      // The swing of the door leaf.
      const far = [d.hinge[0] + d.dir[0] * DOOR - (d.hinge[0] - d.point[0]) * 2, d.hinge[1] + d.dir[1] * DOOR - (d.hinge[1] - d.point[1]) * 2];
      out.push(box(Math.min(d.hinge[0], far[0]), Math.min(d.hinge[1], far[1]), Math.max(d.hinge[0], far[0]), Math.max(d.hinge[1], far[1])));
    }
  }
  return out;
}

function inside(room, shape, pad) {
  const b = shape.r !== undefined ? circleAsBox(shape) : shape;
  return b.x1 >= room.x + pad && b.y1 >= room.y + pad && b.x2 <= room.x + room.w - pad && b.y2 <= room.y + room.h - pad;
}

/** First candidate that is inside the room and clear of every obstacle; otherwise the least bad spot. */
function choose(room, candidates, shapeAt, obstacles, clearance) {
  return chooseScored(room, candidates, shapeAt, obstacles, clearance).pt;
}
function chooseScored(room, candidates, shapeAt, obstacles, clearance) {
  const score = (pt) => {
    const s = shapeAt(pt);
    let min = Infinity;
    for (const o of obstacles) min = Math.min(min, gapBetween(s, o));
    return inside(room, s, 2) ? min : -1000 + min;
  };
  for (const pt of candidates) { const sc = score(pt); if (sc >= clearance) return { pt, score: sc }; }
  let best = candidates[0], bestScore = -Infinity;
  const step = 4;
  for (let y = room.y + 12; y <= room.y + room.h - 12; y += step) for (let x = room.x + 12; x <= room.x + room.w - 12; x += step) {
    const s = score([x, y]);
    if (s > bestScore) { bestScore = s; best = [x, y]; }
  }
  return { pt: best, score: bestScore };
}

/**
 * Places the clock and the body in the murder room, "no door" notes, and one marker per clue.
 * input: { names: { slot: text }, murder: slot, markers: [{ id, slot }] }
 * Returns { clock: [x, y], body: [x, y], bodyPath, notes: [{ x, y, slot, to }], markers: { id: [x, y] } }
 */
export function decorate(lay, input) {
  const obstacles = {};
  for (const slot of Object.keys(lay.rooms)) obstacles[slot] = roomObstacles(lay, slot, input.names[slot] || slot);

  const out = { clock: null, clockLabel: null, body: null, bodyPath: null, notes: [], markers: {} };

  if (input.murder && lay.rooms[input.murder]) {
    const r = lay.rooms[input.murder], obs = obstacles[input.murder];
    const L = r.x, R = r.x + r.w, T = r.y, B = r.y + r.h;
    // Clock: a face with the time written under it. In a small room the time goes beside the face.
    const clockShape = (p) => box(p[0] - 17, p[1] - 15, p[0] + 17, p[1] + 35);
    const under = chooseScored(r, [[R - 28, T + 40], [L + 28, T + (r.nameAt === 'top' ? 56 : 40)], [R - 28, B - 46], [L + 28, B - 46]], clockShape, obs, 2);
    out.clockLabel = 'below';
    out.clock = under.pt;
    if (under.score < 2) {
      const leftOf = (p) => box(p[0] - 54, p[1] - 14, p[0] + 15, p[1] + 14);
      const rightOf = (p) => box(p[0] - 15, p[1] - 14, p[0] + 54, p[1] + 14);
      const above = (p) => box(p[0] - 17, p[1] - 30, p[0] + 17, p[1] + 14);
      const top = T + (r.nameAt === 'top' ? 50 : 0);
      const options = [
        { label: 'left', shape: leftOf, ...chooseScored(r, [[R - 21, T + 21], [R - 21, B - 21]], leftOf, obs, 2) },
        { label: 'right', shape: rightOf, ...chooseScored(r, [[L + 21, T + (r.nameAt === 'top' ? 50 : 21)], [L + 21, B - (r.nameAt === 'bottom' ? 50 : 21)]], rightOf, obs, 2) },
        { label: 'above', shape: above, ...chooseScored(r, [[L + 21, top + 33], [R - 21, top + 33]], above, obs, 2) },
      ];
      const best = options.reduce((a, o) => (o.score > a.score ? o : a));
      if (best.score > under.score) { out.clock = best.pt; out.clockLabel = best.label; }
    }
    const labelShape = { left: (p) => box(p[0] - 54, p[1] - 14, p[0] + 15, p[1] + 14), right: (p) => box(p[0] - 15, p[1] - 14, p[0] + 54, p[1] + 14), above: (p) => box(p[0] - 17, p[1] - 30, p[0] + 17, p[1] + 14), below: clockShape };
    obs.push(labelShape[out.clockLabel](out.clock));

    // Body: the chalk outline.
    const bodyShape = (p) => box(p[0] - 13, p[1] - 16, p[0] + 13, p[1] + 16);
    out.body = choose(r, [[L + 42, B - 36], [R - 42, B - 36], [L + 42, T + 60], [R - 42, T + 60]], bodyShape, obs, 2);
    obs.push(bodyShape(out.body));
    const [bx, by] = out.body;
    out.bodyPath = `M${r1(bx - 10)} ${r1(by + 14)} q-4 -18 4 -28 q10 -6 16 4 q4 14 -2 24 z`;
  }

  // "no door to the X": only where a doorless wall under a room is long enough to carry the text.
  const slots = Object.keys(lay.rooms);
  for (const upper of slots) for (const lower of slots) {
    const a = lay.rooms[upper], b = lay.rooms[lower];
    if (a.y + a.h !== b.y) continue;
    const from = Math.max(a.x, b.x), to = Math.min(a.x + a.w, b.x + b.w);
    if (to <= from || doorPoint(lay, upper, lower)) continue;
    const text = `no door to the ${input.names[lower] || lower}`;
    const w = textWidth(text, 11, true);
    if (to - from < w + 24) continue;
    const shape = box(from + 14, b.y - 28, from + 18 + w, b.y - 8);
    if (obstacles[upper].some((o) => gapBetween(shape, o) < 2)) continue;
    out.notes.push({ slot: upper, to: lower, text, x: from + 16, y: b.y - 14 });
    obstacles[upper].push(shape);
  }

  for (const m of input.markers || []) {
    const r = lay.rooms[m.slot];
    if (!r) continue;
    const obs = obstacles[m.slot];
    const L = r.x, R = r.x + r.w, T = r.y, B = r.y + r.h, cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    // Corners first. Names are left-aligned, so the left corners move in under or over the name.
    const top = T + 30, bottom = B - 28;
    const topL = T + (r.nameAt === 'top' ? 56 : 30), bottomL = B - (r.nameAt === 'bottom' ? 54 : 28);
    const shape = (p) => ({ cx: p[0], cy: p[1], r: MARKER_R + 2 });
    const spot = choose(r, [[L + 30, topL], [R - 28, bottom], [R - 28, top], [L + 30, bottomL], [R - 28, cy], [L + 30, cy], [cx, top], [cx, bottom]], shape, obs, 1);
    out.markers[m.id] = [r1(spot[0]), r1(spot[1])];
    obs.push(shape(spot));
  }
  return out;
}

/** Shapes that a marker must stay clear of in a room. Exposed for tests. */
export function obstaclesFor(lay, slot, nameText) {
  return roomObstacles(lay, slot, nameText);
}
export { gapBetween };
