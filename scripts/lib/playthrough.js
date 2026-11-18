// Plays a case through in a real browser at phone width, the way a player would (spec 010, part 4).
// The page is site/play.html. `overrides` can serve the case, the floor plan and the modules from their
// sources, so a case can be checked before it is published. The moves come from `solution`, which
// normally is the case's own answer key; a test can pass another one to check that a wrong answer fails.
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { serve } from './static-server.js';

const VIEWPORT = { width: 375, height: 812 };
const MAX_STEPS = 40;

/**
 * Returns { ok, errors, screenshots }. Never throws for problems in the case or the page: they go in errors.
 * caseData: the published case. solution: { person: [room per time] } to play. outDir: where screenshots go.
 */
export async function playthrough({ chromium, siteDir, caseData, solution = caseData.solution, outDir, overrides = {} }) {
  const errors = [], screenshots = [];
  const id = caseData.id, times = caseData.times, people = caseData.suspects.map((s) => s.id);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const server = await serve(siteDir, overrides);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    page.on('pageerror', (e) => errors.push(`console: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      const from = (m.location() && m.location().url) || '';
      // Only the game's own files count. Web fonts from Google may fail offline.
      if (from && !from.startsWith(server.url)) return;
      errors.push(`console: ${m.text()}`);
    });
    const mode = () => page.getAttribute('#app', 'data-mode');
    const shot = async (name) => {
      const file = join(outDir, `${String(screenshots.length + 1).padStart(2, '0')}-${name}.png`);
      await page.screenshot({ path: file });
      screenshots.push(file);
      const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (wide > 0) errors.push(`${name}: the page scrolls sideways (${wide}px too wide)`);
    };
    const step = async (name, fn) => {
      try { await fn(); return true; } catch (e) { errors.push(`${name}: ${e.message.split('\n')[0]}`); return false; }
    };

    // 1. Intro
    if (!await step('open', async () => {
      await page.goto(`${server.url}play.html?case=${encodeURIComponent(id)}&reset`);
      await page.waitForSelector('#app[data-mode="intro"]', { timeout: 5000 });
    })) return { ok: false, errors, screenshots };
    await shot('intro');
    await step('intro', async () => {
      for (let i = 0; i < MAX_STEPS && (await mode()) === 'intro'; i++) await page.click('#introNext');
      if ((await mode()) !== 'investigate') throw new Error(`the intro did not end (mode "${await mode()}")`);
    });

    // 2. First clue, then all clues, then everyone in place, hour by hour.
    await page.waitForTimeout(400);
    await shot('first-clue');
    await step('show all clues', async () => {
      if (await page.isVisible('#showAll')) await page.click('#showAll');
      const shown = await page.locator('#clueList > li').count();
      if (shown !== caseData.clues.length) throw new Error(`${shown} of ${caseData.clues.length} clues are shown`);
    });
    for (let t = 0; t < times.length; t++) {
      await step(`go to ${times[t]}`, async () => {
        const btn = page.locator(`.hour[data-h="${t}"]`);
        if ((await btn.getAttribute('aria-pressed')) !== 'true') await btn.click();
        await page.waitForSelector(`.hour[data-h="${t}"][aria-pressed="true"]:not([disabled])`, { timeout: 5000 });
      });
      for (const p of people) {
        const room = solution[p] && solution[p][t];
        if (!room) { errors.push(`${p} at ${times[t]}: no room in the answer key`); continue; }
        await step(`place ${p} in ${room} at ${times[t]}`, async () => {
          const chip = page.locator(`.tbtn[data-p="${p}"]`);
          if ((await chip.getAttribute('aria-pressed')) !== 'true') await chip.click();
          await page.click(`rect.hit[data-room="${room}"]`);
          await page.waitForTimeout(150);
        });
      }
      await step(`all placed at ${times[t]}`, async () => {
        const count = (await page.textContent(`.hour[data-h="${t}"] small`)).trim();
        if (count !== `${people.length}/${people.length}`) throw new Error(`${count} placed`);
      });
    }

    // 3. With the answer key on the map, no clue may be marked as a conflict.
    await page.waitForTimeout(400);
    await shot('all-placed');
    const conflicts = await page.$$eval('#clueList > li.conflict', (els) => els.map((e) => e.textContent.trim().slice(0, 60)));
    conflicts.forEach((c) => errors.push(`conflict marked with everyone in place: ${c}`));

    // 4. Accuse the killer and answer the control question.
    const t = times.indexOf(caseData.murder.time);
    const killer = people.find((p) => solution[p] && solution[p][t] === caseData.murder.room);
    const q = (caseData.controlQuestions || [])[0];
    const answer = q && solution[q.person] ? solution[q.person][times.indexOf(q.time)] : null;
    await step('accuse', async () => {
      await page.click('#openAcc');
      await page.waitForSelector('#app[data-mode="accuse"]', { timeout: 3000 });
      if (!killer) throw new Error('nobody is in the murder room at the murder time in the answer key');
      await page.click(`#pickS .pbtn[data-v="${killer}"]`);
      if (answer) await page.click(`#pickR .pbtn[data-v="${answer}"]`);
    });
    if ((await mode()) === 'accuse') {
      await shot('accuse');
      await step('accusation accepted', async () => {
        await page.click('#accuse');
        await page.waitForTimeout(600);
        if ((await mode()) !== 'ending') throw new Error(`the page did not accept it: "${(await page.textContent('#msg')).trim()}"`);
      });
    }

    // 5. The ending: verdict first, then every step of the night, then the result.
    if ((await mode()) === 'ending') {
      await shot('verdict');
      const verdict = (await page.textContent('#verdictH')).trim();
      if (!verdict.startsWith('Case closed')) errors.push(`the ending starts with "${verdict}", not "Case closed"`);
      await step('ending', async () => {
        await page.click('#seeStory');
        for (let i = 0; i < MAX_STEPS && await page.isHidden('#endResult'); i++) {
          // Wait until the tokens have stopped moving: Next is disabled during a move.
          await page.waitForSelector('#storyNext:not([disabled])', { timeout: 5000 });
          await page.waitForTimeout(250);
          await shot(`ending-${i + 1}`);
          await page.click('#storyNext');
        }
        if (await page.isHidden('#endResult')) throw new Error('the ending did not reach the result');
      });
      await page.waitForTimeout(400);
      await shot('result');
    } else {
      errors.push('the case did not reach the ending');
    }
    return { ok: errors.length === 0, errors, screenshots };
  } finally {
    await browser.close();
    await server.close();
  }
}

/** Loads Playwright's Chromium, or returns null when Playwright or its browser is not installed. */
export async function loadChromium() {
  try { return (await import('playwright')).chromium; } catch { return null; }
}
