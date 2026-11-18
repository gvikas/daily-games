// What the case-reader subagent may open (spec 010): only a blind file in cases/drafts/.
// A PreToolUse hook in .claude/agents/case-reader.md asks decide() before every tool call and logs
// the answer. /check-case then checks the log, so it is shown, not assumed, that the reader saw
// nothing but cases/drafts/<id>.blind.json.
import { relative, isAbsolute, resolve } from 'node:path';

export const LOG = 'cases/drafts/reader-access.log';

const rel = (root, p) => relative(root, isAbsolute(p) ? p : resolve(root, p)).split('\\').join('/');

/** { allow, path, reason } for one tool call. input is the hook's JSON from stdin. */
export function decide(input, root) {
  const tool = input && input.tool_name;
  const raw = input && input.tool_input && input.tool_input.file_path;
  if (tool !== 'Read') return { allow: false, path: null, reason: `the case reader may only use Read, not ${tool}` };
  if (typeof raw !== 'string' || !raw) return { allow: false, path: null, reason: 'Read without a file path' };
  const path = rel(root, raw);
  if (/^cases\/drafts\/[^/]+\.blind\.json$/.test(path)) return { allow: true, path, reason: 'blind file' };
  return { allow: false, path, reason: `the case reader may only read cases/drafts/<id>.blind.json, not ${path}` };
}

/** Errors for a run of the reader on case id, from the log lines. An empty log means the guard did not run. */
export function checkLog(lines, id) {
  const entries = lines.filter((l) => l.trim()).map((l) => { try { return JSON.parse(l); } catch { return null; } });
  const errors = [];
  if (!entries.length) return { errors: [`${LOG} is empty: the guard did not run, so it cannot be shown what the reader opened`], entries: [] };
  if (entries.includes(null)) errors.push(`${LOG} has lines that are not JSON`);
  const own = `cases/drafts/${id}.blind.json`;
  for (const e of entries.filter(Boolean)) {
    if (e.allow && e.path !== own) errors.push(`the reader opened ${e.path}`);
    if (!e.allow) errors.push(`the reader tried ${e.tool}${e.path ? ` on ${e.path}` : ''} and was stopped`);
  }
  if (!entries.some((e) => e && e.allow && e.path === own)) errors.push(`the reader never opened ${own}`);
  return { errors, entries: entries.filter(Boolean) };
}
