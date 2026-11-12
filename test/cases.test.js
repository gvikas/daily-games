import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { analyze } from '../engine/index.js';
import { loadFloorplan } from '../scripts/lib/load.js';

// Every case in cases/ must be valid, have exactly one solution and match its "solution".
const dir = new URL('../cases/', import.meta.url);
for (const name of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
  test(`cases/${name} solves to its expected solution`, () => {
    const data = JSON.parse(readFileSync(new URL(name, dir), 'utf8'));
    const r = analyze(data, { floorplan: loadFloorplan(data) });
    assert.deepEqual(r.errors, []);
    assert.equal(r.solutionCount, 1);
    assert.equal(r.ok, true);
  });
}
