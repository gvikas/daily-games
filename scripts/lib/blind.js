// The blind version of a case (spec 010, part 1): only what the player sees before the case is solved.
// A reader that gets this file cannot see the logic, so its read-back of each clue is independent.

/** Clue types and their format (spec 001), so the reader knows what to answer with. */
export const CLUE_TYPES = [
  { type: 'at', format: { type: 'at', person: '<suspect id>', room: '<room id>', time: '<time>' }, meaning: 'The person was in the room at the time.' },
  { type: 'notAt', format: { type: 'notAt', person: '<suspect id>', rooms: ['<room id>', '…'], time: '<time, or leave out>' }, meaning: 'The person was in none of the rooms. Without "time" it holds for the whole night ("never in").' },
  { type: 'swap', format: { type: 'swap', a: '<suspect id>', b: '<suspect id>', from: '<time>' }, meaning: 'a and b swapped rooms between "from" and the next time. "from" is the earlier of the two times.' },
  { type: 'stayed', format: { type: 'stayed', person: '<suspect id>', from: '<time>' }, meaning: 'The person stayed in the same room between "from" and the next time. "from" is the earlier of the two times.' },
  { type: 'moved', format: { type: 'moved', person: '<suspect id>', from: '<time>' }, meaning: 'The person went to another room between "from" and the next time. "from" is the earlier of the two times.' },
];

const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));

/** Builds the blind case. Leaves out constraint, hint, marker, solution, controlQuestions, ending and closing. */
export function blindCase(c) {
  return {
    id: c.id,
    title: c.title,
    intro: c.intro,
    rooms: (c.rooms || []).map((r) => pick(r, ['id', 'name'])),
    doors: c.doors,
    times: c.times,
    suspects: (c.suspects || []).map((s) => pick(s, ['id', 'name', 'role', 'label'])),
    // Where and when the murder happened, as the intro tells the player.
    murder: c.murder ? pick(c.murder, ['room', 'time']) : undefined,
    clues: (c.clues || []).map((k) => pick(k, ['id', 'lead', 'text'])),
    clueTypes: CLUE_TYPES,
  };
}
