// Checks the fields the game page needs (spec 006): floor plan, texts and markers.
// The solver never reads these. Pure JavaScript, no Node APIs.
import { validateFloorplan } from './floorplan.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v) => typeof v === 'string' && v.trim().length > 0;

export const LIMITS = { rooms: [3, 6], suspects: [3, 6], times: [3, 5] };
export const LABEL_MAX = 7; // "Barmaid" fits on a chip with four suspects in a row; longer labels do not

/**
 * caseData: the case. plan: the floor plan it names, or null/undefined when it was not found.
 * Returns a list of error strings.
 */
export function validatePresentation(caseData, plan) {
  const errors = [];
  const c = caseData;
  if (!isObj(c)) return ['case: must be a JSON object'];
  if (!isStr(c.floorplan)) return ['floorplan: must name a floor plan, e.g. "chain-2x2"'];
  if (!plan) return [`floorplan: "${c.floorplan}" was not found in floorplans/`];
  if (plan.id !== c.floorplan) errors.push(`floorplan: the file for "${c.floorplan}" has id "${plan.id}"`);
  const planErrors = validateFloorplan(plan);
  errors.push(...planErrors);

  const rooms = Array.isArray(c.rooms) ? c.rooms.filter(isObj) : [];
  const suspects = Array.isArray(c.suspects) ? c.suspects.filter(isObj) : [];
  const times = Array.isArray(c.times) ? c.times : [];
  const range = (n, [lo, hi], what) => { if (n < lo || n > hi) errors.push(`${what}: the page supports ${lo}–${hi}, this case has ${n}`); };
  range(rooms.length, LIMITS.rooms, 'rooms');
  range(suspects.length, LIMITS.suspects, 'suspects');
  range(times.length, LIMITS.times, 'times');

  // Rooms ↔ slots
  const slotIds = new Set((Array.isArray(plan.slots) ? plan.slots : []).filter(isObj).map((s) => s.id));
  const slotOf = new Map(), used = new Map();
  for (const r of rooms) {
    if (!isStr(r.slot)) { errors.push(`room "${r.id}": needs a "slot" from the floor plan`); continue; }
    if (!slotIds.has(r.slot)) { errors.push(`room "${r.id}": unknown slot "${r.slot}"`); continue; }
    if (used.has(r.slot)) errors.push(`rooms "${used.get(r.slot)}" and "${r.id}" use the same slot "${r.slot}"`);
    used.set(r.slot, r.id);
    slotOf.set(r.id, r.slot);
    if (r.short !== undefined && !isStr(r.short)) errors.push(`room "${r.id}": "short" must be a text`);
  }
  for (const s of slotIds) if (!used.has(s)) errors.push(`floorplan: slot "${s}" has no room in the case`);

  // Doors must be the plan's doors, translated through "slot".
  if (!planErrors.length && Array.isArray(c.doors) && Array.isArray(plan.doors)) {
    const key = (a, b) => [a, b].sort().join(' – ');
    const roomOfSlot = new Map([...slotOf].map(([room, slot]) => [slot, room]));
    const planDoors = new Set(plan.doors.map((d) => key(roomOfSlot.get(d.between[0]) ?? `(${d.between[0]})`, roomOfSlot.get(d.between[1]) ?? `(${d.between[1]})`)));
    const caseDoors = new Set(c.doors.filter((d) => Array.isArray(d) && d.length === 2).map((d) => key(d[0], d[1])));
    for (const d of caseDoors) if (!planDoors.has(d)) errors.push(`doors: ${d} is in the case but not in floor plan "${plan.id}"`);
    for (const d of planDoors) if (!caseDoors.has(d)) errors.push(`doors: ${d} is in floor plan "${plan.id}" but not in the case`);
  }

  for (const s of suspects) if (s.role !== undefined && !isStr(s.role)) errors.push(`suspect "${s.id}": "role" must be a text`);

  // "label": a short role shown instead of the name on chips, tokens and notes. All suspects or none.
  const labelled = suspects.filter((s) => s.label !== undefined);
  if (labelled.length) {
    if (labelled.length !== suspects.length) errors.push('label: either every suspect has a "label" or none has');
    const letters = new Map(), seen = new Map();
    for (const s of labelled) {
      if (!isStr(s.label)) { errors.push(`suspect "${s.id}": "label" must be a non-empty text`); continue; }
      const label = s.label.trim();
      if (label !== s.label) errors.push(`suspect "${s.id}": "label" has spaces around it`);
      if (label.length > LABEL_MAX) errors.push(`suspect "${s.id}": label "${label}" is longer than ${LABEL_MAX} characters and will not fit on a chip`);
      const key = label.toLowerCase(), letter = label.charAt(0).toUpperCase();
      if (seen.has(key)) errors.push(`suspects "${seen.get(key)}" and "${s.id}" have the same label "${label}"`);
      else if (letters.has(letter)) errors.push(`suspects "${letters.get(letter)}" and "${s.id}": labels start with the same letter "${letter}", so their tokens would look alike`);
      seen.set(key, s.id);
      if (!letters.has(letter)) letters.set(letter, s.id);
    }
  }
  if (!isStr(c.victim)) errors.push('victim: must be a non-empty text');

  // Texts
  if (!Array.isArray(c.intro) || c.intro.length === 0) errors.push('intro: must be a list of steps with "h" and "t"');
  else c.intro.forEach((s, i) => { if (!isObj(s) || !isStr(s.h) || !isStr(s.t)) errors.push(`intro[${i}]: needs "h" and "t"`); });

  const roomIds = new Set(rooms.map((r) => r.id));
  (Array.isArray(c.clues) ? c.clues : []).filter(isObj).forEach((cl) => {
    if (!isStr(cl.lead)) errors.push(`clue ${cl.id}: needs a "lead"`);
    if (!isStr(cl.text)) errors.push(`clue ${cl.id}: needs a "text"`);
    if (cl.hint !== undefined && !isStr(cl.hint)) errors.push(`clue ${cl.id}: "hint" must be a text`);
    if (cl.marker !== undefined && !roomIds.has(cl.marker)) errors.push(`clue ${cl.id}: marker points to unknown room "${cl.marker}"`);
  });
  if (!Array.isArray(c.clues) || c.clues.length === 0) errors.push('clues: the page needs at least one clue');

  const steps = 2 * times.length - 1;
  if (!Array.isArray(c.ending) || c.ending.length !== steps || !c.ending.every(isStr)) {
    errors.push(`ending: needs ${steps} steps (one per time and one per move between times), has ${Array.isArray(c.ending) ? c.ending.length : 0}`);
  }
  if (!isObj(c.share) || !isStr(c.share.title) || !isStr(c.share.number)) errors.push('share: needs "title" and "number"');
  if (!Array.isArray(c.controlQuestions) || !c.controlQuestions.some((q) => isObj(q) && q.forAccused === undefined)) {
    errors.push('controlQuestions: the page needs one question without "forAccused"');
  }
  for (const k of ['occupied', 'far']) {
    if (c.reasons !== undefined && (!isObj(c.reasons) || (c.reasons[k] !== undefined && !isStr(c.reasons[k])))) errors.push(`reasons.${k}: must be a text`);
  }
  if (c.closing !== undefined && !isStr(c.closing)) errors.push('closing: must be a text');
  return [...new Set(errors)];
}
