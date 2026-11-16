import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { validateFloorplan, layout, decorate, doorPoint } from '../engine/index.js';
import { gapBetween, obstaclesFor, TOKEN_R, MARKER_R, nameFontSize } from '../engine/floorplan.js';

const dir = new URL('../floorplans/', import.meta.url);
const plan = (id) => JSON.parse(readFileSync(new URL(`${id}.json`, dir), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const hasError = (p, text) => {
  const errs = validateFloorplan(p);
  assert.ok(errs.some((e) => e.includes(text)), `expected "${text}", got ${JSON.stringify(errs)}`);
};
const wallStrings = (lay) => lay.walls.map((w) => [w.x1, w.y1, w.x2, w.y2].join(','));

test('every plan in floorplans/ is valid and its file name is its id', () => {
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const p = JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
    assert.deepEqual(validateFloorplan(p), [], f);
    assert.equal(`${p.id}.json`, f);
  }
});

test('chain-2x2 gives the hand-drawn map from version 4', () => {
  const lay = layout(plan('chain-2x2'));
  assert.deepEqual(lay.viewBox, [14, 14, 372, 372]);
  assert.deepEqual(lay.outer, { x: 20, y: 20, w: 360, h: 360 });
  // Walls with door gaps (site/003.html drew y=200 as two lines, 20–200 and 200–270).
  assert.deepEqual(wallStrings(lay), ['20,200,270,200', '200,20,200,90', '200,130,200,270', '200,310,200,380', '310,200,380,200']);
  // Door arcs and door points, exactly as written by hand in version 4.
  assert.deepEqual(lay.doors.map((d) => d.arc), ['M200 90 A40 40 0 0 1 240 130', 'M270 200 A40 40 0 0 0 310 240', 'M200 310 A40 40 0 0 1 160 270']);
  assert.deepEqual(lay.doors.map((d) => d.point), [[200, 110], [290, 200], [200, 290]]);
  assert.deepEqual(doorPoint(lay, 'ne', 'nw'), [200, 110]);
  assert.equal(doorPoint(lay, 'nw', 'sw'), null);
});

test('room rectangles, centres and name positions', () => {
  const lay = layout(plan('chain-2x2'));
  assert.deepEqual([lay.rooms.nw.x, lay.rooms.nw.y, lay.rooms.nw.w, lay.rooms.nw.h], [20, 20, 180, 180]);
  assert.deepEqual([lay.rooms.se.x, lay.rooms.se.y], [200, 200]);
  // Names sit along the top wall, except in rooms on the bottom row. The token moves down under a top name.
  assert.equal(lay.rooms.nw.nameAt, 'top');
  assert.equal(lay.rooms.sw.nameAt, 'bottom');
  assert.deepEqual(lay.rooms.nw.namePos, [36, 46]);
  assert.deepEqual(lay.rooms.sw.namePos, [36, 364]);
  assert.deepEqual(lay.rooms.nw.center, [110, 118]);
  assert.deepEqual(lay.rooms.sw.center, [110, 290]);
  for (const r of Object.values(lay.rooms)) {
    assert.ok(r.center[0] - TOKEN_R > r.x && r.center[0] + TOKEN_R < r.x + r.w);
    assert.ok(r.center[1] - TOKEN_R > r.y && r.center[1] + TOKEN_R < r.y + r.h);
  }
});

test('ring-2x2 has a fourth door and one more wall gap', () => {
  const lay = layout(plan('ring-2x2'));
  assert.equal(lay.doors.length, 4);
  assert.deepEqual(doorPoint(lay, 'nw', 'sw'), [110, 200]);
  assert.deepEqual(wallStrings(lay), ['20,200,90,200', '130,200,270,200', '200,20,200,90', '200,130,200,270', '200,310,200,380', '310,200,380,200']);
});

test('hall-5: rectangles of different sizes, doors from the hall in the middle', () => {
  const lay = layout(plan('hall-5'));
  assert.equal(lay.unit, 120);
  assert.deepEqual([lay.rooms.n.w, lay.rooms.n.h], [360, 120]);
  assert.deepEqual([lay.rooms.w.w, lay.rooms.w.h], [120, 240]);
  assert.deepEqual(lay.doors.map((d) => d.point), [[200, 140], [140, 200], [260, 200], [200, 260]]);
  // The wall under the wide north room runs 20–380 with one gap, at the hall door.
  assert.ok(wallStrings(lay).includes('20,140,180,140'));
  assert.ok(wallStrings(lay).includes('220,140,380,140'));
  // West and south share a wall with no door: it is drawn whole.
  assert.ok(wallStrings(lay).includes('140,220,140,380'));
  assert.equal(doorPoint(lay, 'w', 's'), null);
});

test('walls never cross a door opening, and every door has one', () => {
  for (const id of ['chain-2x2', 'ring-2x2', 'hall-5']) {
    const lay = layout(plan(id));
    for (const d of lay.doors) {
      for (const w of lay.walls) {
        const onLine = d.vertical ? w.x1 === d.line && w.x2 === d.line : w.y1 === d.line && w.y2 === d.line;
        if (!onLine) continue;
        const [a, b] = d.vertical ? [w.y1, w.y2] : [w.x1, w.x2];
        assert.ok(b <= d.gap[0] || a >= d.gap[1], `${id}: wall ${a}–${b} covers door ${d.gap}`);
      }
    }
  }
});

test('a non-square grid keeps its shape and is never taller than the square map', () => {
  const p = { id: 'row-3', shape: 'chain', grid: { cols: 3, rows: 2 },
    slots: [{ id: 'a', x: 0, y: 0, w: 1, h: 2 }, { id: 'b', x: 1, y: 0, w: 1, h: 2 }, { id: 'c', x: 2, y: 0, w: 1, h: 2 }],
    doors: [{ between: ['a', 'b'], at: 0.5 }, { between: ['b', 'c'], at: 0.25 }] };
  assert.deepEqual(validateFloorplan(p), []);
  const lay = layout(p);
  assert.deepEqual(lay.viewBox, [14, 14, 372, 252]);
  assert.deepEqual(lay.doors[1].point, [260, 80]);
  const tall = layout({ ...p, grid: { cols: 2, rows: 3 }, slots: [{ id: 'a', x: 0, y: 0, w: 2, h: 1 }, { id: 'b', x: 0, y: 1, w: 2, h: 1 }, { id: 'c', x: 0, y: 2, w: 2, h: 1 }] });
  assert.deepEqual(tall.viewBox, [14, 14, 252, 372]);
});

test('"at" is clamped so the opening stays inside the shared wall', () => {
  const p = plan('chain-2x2'); p.doors[0].at = 0; p.doors[1].at = 1;
  const lay = layout(p);
  assert.deepEqual(lay.doors[0].gap, [30, 70]);
  assert.deepEqual(lay.doors[1].gap, [330, 370]);
});

test('a secret door is accepted but not drawn', () => {
  const p = plan('chain-2x2');
  p.doors.push({ between: ['sw', 'nw'], at: 0.5, secret: true });
  assert.deepEqual(validateFloorplan(p), []);
  const lay = layout(p);
  assert.equal(lay.doors[3].secret, true);
  assert.deepEqual(wallStrings(lay), wallStrings(layout(plan('chain-2x2'))));
});

test('validation: overlapping slots', () => {
  const p = plan('chain-2x2'); p.slots[1] = { id: 'ne', x: 0, y: 0, w: 2, h: 1 };
  hasError(p, 'overlap');
});

test('validation: slots that do not fill the grid', () => {
  const p = plan('chain-2x2'); p.slots.pop(); p.doors.pop();
  hasError(p, 'do not fill the grid');
});

test('validation: slot outside the grid, bad numbers, duplicate ids', () => {
  const a = plan('chain-2x2'); a.slots[0].w = 3; hasError(a, 'outside the grid');
  const b = plan('chain-2x2'); b.slots[0].w = 0.5; hasError(b, 'whole numbers');
  const c = plan('chain-2x2'); c.slots[1].id = 'nw'; hasError(c, 'duplicate slot');
  hasError({ id: 'x', shape: 'chain', grid: { cols: 0, rows: 2 }, slots: [], doors: [] }, 'grid');
});

test('validation: a door between rooms that do not share a wall', () => {
  const p = plan('chain-2x2'); p.doors.push({ between: ['nw', 'se'], at: 0.5 });
  hasError(p, 'do not share a wall');
});

test('validation: door to an unknown slot, to itself, twice, or with a bad position', () => {
  const a = plan('chain-2x2'); a.doors[0].between = ['nw', 'zz']; hasError(a, 'unknown slot "zz"');
  const b = plan('chain-2x2'); b.doors[0].between = ['nw', 'nw']; hasError(b, 'two different slots');
  const c = plan('chain-2x2'); c.doors.push({ between: ['ne', 'nw'], at: 0.2 }); hasError(c, 'second door');
  const d = plan('chain-2x2'); d.doors[0].at = 1.5; hasError(d, 'from 0 to 1');
  const e = plan('chain-2x2'); e.doors[0].secret = 'yes'; hasError(e, '"secret"');
});

test('validation: a shared wall that is too short for a door', () => {
  const p = { id: 'tiny', shape: 'chain', grid: { cols: 8, rows: 8 },
    slots: [{ id: 'a', x: 0, y: 0, w: 4, h: 8 }, { id: 'b', x: 4, y: 0, w: 4, h: 1 }, { id: 'c', x: 4, y: 1, w: 4, h: 7 }],
    doors: [{ between: ['a', 'b'], at: 0.5 }] };
  hasError(p, 'too short for a door');
});

// --- Clock, body, notes and markers ---

const names3 = { nw: 'Parlour', ne: 'Music Room', se: 'Dining Room', sw: 'Scullery' };
const markers3 = [{ id: 1, slot: 'ne' }, { id: 2, slot: 'ne' }, { id: 3, slot: 'se' }, { id: 4, slot: 'sw' }, { id: 5, slot: 'sw' }];

test('case 003 decoration: clock top right and body bottom left of the murder room, as in version 4', () => {
  const lay = layout(plan('chain-2x2'));
  const d = decorate(lay, { names: names3, murder: 'ne', markers: markers3 });
  assert.deepEqual(d.clock, [352, 60]);
  assert.deepEqual(d.body, [242, 164]);
  assert.equal(d.bodyPath, 'M232 178 q-4 -18 4 -28 q10 -6 16 4 q4 14 -2 24 z');
  assert.deepEqual(d.notes, [{ slot: 'nw', to: 'sw', text: 'no door to the Scullery', x: 36, y: 186 }]);
});

function assertMarkersClear(id, names, murder, markers) {
  const lay = layout(plan(id));
  const d = decorate(lay, { names, murder, markers });
  const placed = [];
  for (const m of markers) {
    const [x, y] = d.markers[m.id];
    const room = lay.rooms[m.slot];
    const me = { cx: x, cy: y, r: MARKER_R };
    assert.ok(x - MARKER_R >= room.x && x + MARKER_R <= room.x + room.w && y - MARKER_R >= room.y && y + MARKER_R <= room.y + room.h, `${id}: marker ${m.id} is outside ${m.slot}`);
    // Not on the token, the room name, the doorways or the door swing.
    for (const o of obstaclesFor(lay, m.slot, names[m.slot])) assert.ok(gapBetween(me, o) > 0, `${id}: marker ${m.id} overlaps something in ${m.slot}`);
    if (m.slot === murder) {
      assert.ok(gapBetween(me, { x1: d.clock[0] - 16, y1: d.clock[1] - 16, x2: d.clock[0] + 16, y2: d.clock[1] + 34 }) > 0, `${id}: marker ${m.id} on the clock`);
      assert.ok(gapBetween(me, { x1: d.body[0] - 12, y1: d.body[1] - 16, x2: d.body[0] + 12, y2: d.body[1] + 16 }) > 0, `${id}: marker ${m.id} on the body`);
    }
    for (const other of placed) assert.ok(gapBetween(me, other) > 0, `${id}: markers overlap`);
    placed.push(me);
  }
  return d;
}

test('markers stay clear of tokens, names, doors, clock, body and each other (chain, case 003)', () => {
  assertMarkersClear('chain-2x2', names3, 'ne', markers3);
});

test('markers: three in one room, and one in every room of the ring', () => {
  assertMarkersClear('ring-2x2', names3, 'sw', [{ id: 1, slot: 'sw' }, { id: 2, slot: 'sw' }, { id: 3, slot: 'sw' }, { id: 4, slot: 'nw' }, { id: 5, slot: 'ne' }, { id: 6, slot: 'se' }]);
});

test('markers: the hall house, including the small hall with four doors', () => {
  const names = { n: 'Library', w: 'Kitchen', c: 'Hall', e: 'Study', s: 'Cellar' };
  for (const murder of ['n', 'w', 'e', 's']) {
    assertMarkersClear('hall-5', names, murder, [{ id: 1, slot: 'n' }, { id: 2, slot: 'c' }, { id: 3, slot: 'w' }, { id: 4, slot: 'e' }, { id: 5, slot: 's' }, { id: 6, slot: 'n' }]);
  }
});

test('clock and body stay inside the murder room and off the token, in every room of every plan', () => {
  for (const id of ['chain-2x2', 'ring-2x2', 'hall-5']) {
    const lay = layout(plan(id));
    for (const slot of Object.keys(lay.rooms)) {
      if (id === 'hall-5' && slot === 'c') continue; // the small hall with four doors is too crowded for a murder
      const d = decorate(lay, { names: Object.fromEntries(Object.keys(lay.rooms).map((s) => [s, 'Room'])), murder: slot, markers: [] });
      const r = lay.rooms[slot], token = { cx: r.center[0], cy: r.center[1], r: TOKEN_R };
      for (const [what, p, hw, top, bottom] of [['clock', d.clock, 14, 14, 34], ['body', d.body, 12, 16, 16]]) {
        const b = { x1: p[0] - hw, y1: p[1] - top, x2: p[0] + hw, y2: p[1] + bottom };
        assert.ok(b.x1 >= r.x && b.x2 <= r.x + r.w && b.y1 >= r.y && b.y2 <= r.y + r.h, `${id}/${slot}: ${what} outside the room`);
        assert.ok(gapBetween(b, token) > 0, `${id}/${slot}: ${what} on the token`);
      }
    }
  }
});

test('"no door" notes appear only where the wall is long enough for the text', () => {
  const hall = decorate(layout(plan('hall-5')), { names: { n: 'Library', w: 'Kitchen', c: 'Hall', e: 'Study', s: 'Cellar' }, murder: 'n', markers: [] });
  assert.deepEqual(hall.notes, []);
  const ring = decorate(layout(plan('ring-2x2')), { names: names3, murder: 'ne', markers: [] });
  assert.deepEqual(ring.notes, []);
});

test('long room names get a smaller font in narrow rooms', () => {
  const lay = layout(plan('hall-5'));
  assert.equal(nameFontSize(lay.rooms.n, 'Library'), 17);
  assert.ok(nameFontSize(lay.rooms.c, 'Conservatory') < 17);
});

test('hall-4: three small rooms around a hall, tokens clear of the door leaves', () => {
  const lay = layout(plan('hall-4'));
  assert.deepEqual(lay.viewBox, [14, 14, 372, 252]);
  assert.deepEqual(lay.doors.map((d) => d.point), [[200, 140], [140, 200], [260, 200]]);
  // The doors swing into the west and east rooms, so their tokens move away from the hall.
  assert.deepEqual(lay.rooms.w.center, [74, 200]);
  assert.deepEqual(lay.rooms.e.center, [326, 200]);
});

test('a door leaf never swings over a token, in any plan', () => {
  for (const id of ['chain-2x2', 'ring-2x2', 'hall-5', 'hall-4']) {
    const lay = layout(plan(id));
    for (const d of lay.doors) {
      const r = lay.rooms[d.into];
      const leaf = d.vertical
        ? { x1: Math.min(d.line, d.line + d.dir[0] * 40), y1: d.gap[0], x2: Math.max(d.line, d.line + d.dir[0] * 40), y2: d.gap[1] }
        : { x1: d.gap[0], y1: Math.min(d.line, d.line + d.dir[1] * 40), x2: d.gap[1], y2: Math.max(d.line, d.line + d.dir[1] * 40) };
      assert.ok(gapBetween(leaf, { cx: r.center[0], cy: r.center[1], r: TOKEN_R }) >= 0, `${id}: the door into ${d.into} swings over its token`);
    }
  }
});

test('in a small murder room the clock time goes beside the face, clear of the token', () => {
  const lay = layout(plan('hall-4'));
  const d = decorate(lay, { names: { n: 'Stage', w: 'Dressing', c: 'Green Room', e: 'Office' }, murder: 'e', markers: [{ id: 1, slot: 'e' }] });
  assert.equal(d.clockLabel, 'left');
  const r = lay.rooms.e, [x, y] = d.clock;
  const clockBox = { x1: x - 54, y1: y - 14, x2: x + 15, y2: y + 14 };
  assert.ok(gapBetween(clockBox, { cx: r.center[0], cy: r.center[1], r: TOKEN_R }) > 0);
  assert.ok(clockBox.x1 >= r.x && clockBox.x2 <= r.x + r.w && clockBox.y1 >= r.y);
  // Large rooms keep the time under the face, as before.
  assert.equal(decorate(layout(plan('chain-2x2')), { names: names3, murder: 'ne', markers: [] }).clockLabel, 'below');
});
