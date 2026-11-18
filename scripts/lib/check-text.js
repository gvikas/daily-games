// Checks the text of a case against its logic (spec 010, part 3). No language model: the script decides.
// The read-back (cases/drafts/<id>.readback.json) is written by the case-reader subagent from the blind case.

const MOVES = ['swap', 'stayed', 'moved'];
const FIELDS = { at: ['person', 'room', 'time'], notAt: ['person', 'rooms', 'time'], swap: ['a', 'b', 'from'], stayed: ['person', 'from'], moved: ['person', 'from'] };

/** A constraint in a form that can be compared: known fields only, rooms in notAt sorted, times as text. */
export function normalize(k) {
  if (!k || typeof k !== 'object' || !FIELDS[k.type]) return JSON.stringify(k ?? null);
  const out = { type: k.type };
  for (const f of FIELDS[k.type]) {
    if (k[f] === undefined || k[f] === null || k[f] === '') continue;
    out[f] = f === 'rooms' && Array.isArray(k[f]) ? k[f].map(String).sort() : String(k[f]);
  }
  // swap(a, b) is the same as swap(b, a).
  if (out.type === 'swap' && out.a > out.b) [out.a, out.b] = [out.b, out.a];
  return JSON.stringify(out);
}

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hasWord = (text, word, flags = 'i') => new RegExp(`(^|[^\\p{L}])${escRe(word)}(?=$|[^\\p{L}])`, `u${flags}`).test(text);

/**
 * Returns { errors, warnings, readback } where readback is false when no read-back was given.
 * config: { forbiddenWords, maxClueLength }.
 */
export function checkText(c, readback, config) {
  const errors = [], warnings = [];
  const clues = Array.isArray(c.clues) ? c.clues : [];
  const words = config.forbiddenWords || [];
  const max = config.maxClueLength || 120;

  // 1. Read-back: each clue must read back to exactly its constraint.
  if (readback) {
    const entries = Array.isArray(readback.clues) ? readback.clues : [];
    for (const k of clues) {
      const r = entries.find((e) => e && String(e.id) === String(k.id));
      if (!r) { errors.push(`clue ${k.id}: no read-back`); continue; }
      const got = r.constraints ?? r.constraint;
      if (r.ambiguous || Array.isArray(got)) {
        const ways = (Array.isArray(got) ? got : [got]).map(normalize).join(' or ');
        errors.push(`clue ${k.id}: ambiguous, can be read as ${ways}${r.reason ? ` (${r.reason})` : ''}`);
        continue;
      }
      if (normalize(got) !== normalize(k.constraint)) {
        errors.push(`clue ${k.id}: reads back as ${normalize(got)}, but the case says ${normalize(k.constraint)}${r.reason ? ` (${r.reason})` : ''}`);
      }
    }
  }

  // 2. Forbidden words, in everything the player reads.
  const texts = [];
  clues.forEach((k) => { texts.push([`clue ${k.id} lead`, k.lead], [`clue ${k.id}`, k.text]); });
  (Array.isArray(c.intro) ? c.intro : []).forEach((s, i) => { texts.push([`intro ${i + 1}`, s && s.h], [`intro ${i + 1}`, s && s.t]); });
  (Array.isArray(c.ending) ? c.ending : []).forEach((s, i) => texts.push([`ending ${i + 1}`, s]));
  texts.push(['closing', c.closing]);
  for (const [where, t] of texts) {
    if (typeof t !== 'string') continue;
    for (const w of words) if (hasWord(t, w)) errors.push(`${where}: forbidden word "${w}"`);
  }

  // 3. With labels, clues use the role, not the name. Older cases without labels are not checked.
  const suspects = Array.isArray(c.suspects) ? c.suspects : [];
  if (suspects.some((s) => s && s.label)) {
    for (const k of clues) {
      for (const s of suspects) {
        if (!s || !s.name) continue;
        for (const [part, t] of [['lead', k.lead], ['text', k.text]]) {
          if (typeof t === 'string' && hasWord(t, s.name, '')) errors.push(`clue ${k.id} ${part}: uses the name "${s.name}", not the role`);
        }
      }
    }
  }

  // Warnings: long clues, and moves written as a stretch of time instead of two moments.
  for (const k of clues) {
    if (typeof k.text === 'string' && k.text.length > max) warnings.push(`clue ${k.id}: ${k.text.length} characters (more than ${max})`);
    const type = k.constraint && k.constraint.type;
    if (MOVES.includes(type) && typeof k.text === 'string' && /\bbetween\b.*\band\b/i.test(k.text)) {
      warnings.push(`clue ${k.id}: a ${type} clue written as a stretch of time ("between … and …")`);
    }
  }

  return { errors, warnings, readback: !!readback };
}
