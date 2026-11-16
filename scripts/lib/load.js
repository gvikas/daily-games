// Reading cases and floor plans from disk. Node only (the engine itself has no file access).
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const CASES_DIR = join(ROOT, 'cases');
export const FLOORPLANS_DIR = join(ROOT, 'floorplans');
// Engine modules that play.html imports. They have no imports and are copied to site/lib/.
export const BROWSER_LIBS = ['floorplan.js', 'conflicts.js', 'progress.js'];

export const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

/** The floor plan a case names, or null when the case names none or the file is missing or broken. */
export function loadFloorplan(caseData) {
  const id = caseData && caseData.floorplan;
  if (typeof id !== 'string' || !/^[a-z0-9-]+$/i.test(id)) return null;
  const file = join(FLOORPLANS_DIR, `${id}.json`);
  if (!existsSync(file)) return null;
  try { return readJson(file); } catch { return null; }
}

/** All case files in cases/, sorted. */
export const caseFiles = () => readdirSync(CASES_DIR).filter((f) => f.endsWith('.json')).sort().map((f) => join(CASES_DIR, f));

/** The file for a case id ("003" → cases/003-the-silent-encore.json), or null. */
export function findCaseFile(id) {
  const hit = readdirSync(CASES_DIR).filter((f) => f === `${id}.json` || f.startsWith(`${id}-`)).filter((f) => f.endsWith('.json'));
  return hit.length === 1 ? join(CASES_DIR, hit[0]) : null;
}
