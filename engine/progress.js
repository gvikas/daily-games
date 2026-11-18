// Attempts and the result of a case, saved per case (spec 008, part 4).
// Pure JavaScript with no imports: it is copied to site/lib/ and runs in the browser.
// Works without localStorage (private mode): the limit then holds for the session only.

export const MAX_ATTEMPTS = 3;

const blank = () => ({ strikes: 0, outcome: null, seconds: null, stayTip: false, startedAt: null, elapsed: 0 });

/**
 * storage:   an object with getItem/setItem/removeItem (localStorage), or null.
 * caseId:    the case id.
 * extraKeys: other keys that belong to the case and are cleared by reset() (e.g. "intro seen").
 */
export function createProgress(storage, caseId, extraKeys = []) {
  const key = `case-${caseId}-progress`;
  let memory = blank();

  const safe = (fn, fallback) => { try { return storage ? fn() : fallback; } catch { return fallback; } };

  function read() {
    const raw = safe(() => storage.getItem(key), null);
    if (raw) {
      try {
        const v = JSON.parse(raw);
        if (v && typeof v === 'object') {
          memory = {
            strikes: Math.max(0, Math.min(MAX_ATTEMPTS, Number(v.strikes) | 0)),
            outcome: v.outcome === 'solved' || v.outcome === 'unsolved' ? v.outcome : null,
            seconds: Number.isFinite(v.seconds) ? v.seconds : null,
            stayTip: v.stayTip === true,
            startedAt: Number.isFinite(v.startedAt) ? v.startedAt : null,
            elapsed: Number.isFinite(v.elapsed) && v.elapsed > 0 ? v.elapsed : 0,
          };
        }
      } catch { /* a broken record counts as nothing saved */ }
    }
    return { ...memory };
  }
  function write(next) {
    memory = { ...next };
    safe(() => storage.setItem(key, JSON.stringify(memory)), null);
    return { ...memory };
  }

  return {
    key,
    load: read,
    /** A wrong accusation. Returns the new state; outcome becomes "unsolved" on the last attempt. */
    strike(seconds) {
      const s = read();
      if (s.outcome) return s;
      const strikes = Math.min(MAX_ATTEMPTS, s.strikes + 1);
      return write({ ...s, strikes, outcome: strikes >= MAX_ATTEMPTS ? 'unsolved' : null, seconds: strikes >= MAX_ATTEMPTS ? seconds : null });
    },
    solve(seconds) {
      const s = read();
      if (s.outcome) return s;
      return write({ ...s, outcome: 'solved', seconds });
    },
    markStayTip() { return write({ ...read(), stayTip: true }); },
    /** The time the player started the case (ms). Set once: it marks that the clock is running. */
    start(now) {
      const s = read();
      return s.startedAt !== null ? s : write({ ...s, startedAt: now });
    },
    /** The time the page has been visible while the case was played (ms), so the clock survives a reload. */
    saveElapsed(ms) {
      const s = read();
      if (s.outcome || !Number.isFinite(ms)) return s;
      return write({ ...s, elapsed: Math.max(s.elapsed, Math.round(ms)) });
    },
    reset() {
      memory = blank();
      for (const k of [key, ...extraKeys]) safe(() => storage.removeItem(k), null);
      return { ...memory };
    },
  };
}

/**
 * A stopwatch that counts only while it runs. The page starts it when it is visible and pauses it
 * when it is hidden, so time spent in another tab or app does not count. `elapsed` is where it starts.
 */
export function createStopwatch(elapsed = 0) {
  let banked = Number.isFinite(elapsed) && elapsed > 0 ? elapsed : 0, since = null;
  return {
    start(now) { if (since === null) since = now; },
    pause(now) { if (since !== null) { banked += Math.max(0, now - since); since = null; } },
    elapsed(now) { return banked + (since === null ? 0 : Math.max(0, now - since)); },
    get running() { return since !== null; },
  };
}

export const attemptsLeft = (state) => (state.outcome ? 0 : MAX_ATTEMPTS - state.strikes);

/** One square per attempt: 🟥 per wrong answer, 🟩 for the right one. Unsolved has no green. */
export function squares(state) {
  return '🟥'.repeat(state.strikes) + (state.outcome === 'solved' ? '🟩' : '');
}
