// Builds docs/roadmap.html from what is in the folder (spec 009).
// Reading is split from rendering so both can be tested with fixture folders, without docs/.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';

export class RoadmapError extends Error {}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (typeof v === 'string' ? v : '');

/** Escapes text for HTML. Everything from the sources goes through this. */
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/** Escapes, then shows `code` from the Markdown sources as code. Nothing else is interpreted. */
export const txt = (v) => esc(v).replace(/`([^`\n]+)`/g, '<code>$1</code>');

// --- Sources ---------------------------------------------------------------------------------

/** docs/roadmap.json. Missing or invalid is an error: no page is written. */
export function readRoadmap(file) {
  if (!existsSync(file)) throw new RoadmapError(`${file} is missing. The roadmap page is made from it.`);
  let data;
  try { data = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { throw new RoadmapError(`${file} is not valid JSON: ${e.message}`); }
  if (!isObj(data)) throw new RoadmapError(`${file} must be a JSON object.`);
  const increments = Array.isArray(data.increments) ? data.increments.filter(isObj) : [];
  const current = increments.filter((i) => i.status === 'current');
  if (current.length > 1) {
    throw new RoadmapError(`${file}: more than one increment has status "current" (${current.map((i) => i.id).join(', ')}). Only one can be in progress.`);
  }
  return data;
}

/** One spec file: id and title from the first heading, status from the first "Status:" line. */
export function readSpecFile(file) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  const heading = lines.find((l) => /^#\s+/.test(l));
  const statusLine = lines.find((l) => /^Status:/.test(l.trim()));
  const name = basename(file, '.md');
  let id = (name.match(/^(\d+)/) || [])[1] || name, title = name;
  if (heading) {
    const h = heading.replace(/^#\s+/, '').trim();
    const m = h.match(/^(\d+)\s*[–-]\s*(.+)$/);
    if (m) { id = m[1]; title = m[2].trim(); } else title = h;
  }
  const status = statusLine ? statusLine.trim().replace(/^Status:\s*/, '') : null;
  const date = status ? (status.match(/\d{4}-\d{2}-\d{2}/) || [])[0] || null : null;
  return { id, title, status, date, file: name + '.md' };
}

/** Specs in docs/specs (open) and docs/specs/done (finished). README.md is not a spec. */
export function readSpecs(specsDir) {
  const list = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'README.md').sort().map((f) => readSpecFile(join(dir, f))) : []);
  return { done: list(join(specsDir, 'done')), open: list(specsDir) };
}

/** Cases in cases/ (not test-…), with the publishing date from site/cases/index.json. */
export function readCases(casesDir, indexFile) {
  const warnings = [];
  const cases = [];
  if (existsSync(casesDir)) {
    for (const f of readdirSync(casesDir).filter((x) => x.endsWith('.json') && !x.startsWith('test-')).sort()) {
      try {
        const c = JSON.parse(readFileSync(join(casesDir, f), 'utf8'));
        if (typeof c.id === 'string' && c.id.startsWith('test-')) continue;
        cases.push({ id: str(c.id) || f.replace(/\.json$/, ''), title: str(c.title), level: str(c.level) || null, twist: str(c.twist) || null, date: null, file: f });
      } catch (e) {
        warnings.push(`cases/${f} could not be read: ${e.message}`);
      }
    }
  }
  let index = [];
  if (existsSync(indexFile)) {
    try {
      const v = JSON.parse(readFileSync(indexFile, 'utf8'));
      if (Array.isArray(v)) index = v; else warnings.push('site/cases/index.json is not a list');
    } catch (e) { warnings.push(`site/cases/index.json could not be read: ${e.message}`); }
  }
  for (const e of index) {
    if (!isObj(e) || typeof e.case !== 'string') continue;
    const c = cases.find((x) => x.id === e.case);
    if (c) { if (!c.date || e.date < c.date) c.date = str(e.date) || null; }
    else warnings.push(`site/cases/index.json lists case ${e.case} (${str(e.date)}), but it is not in cases/`);
  }
  return { cases, warnings };
}

/** The last n decisions ("- YYYY-MM-DD …"), newest first. null when the file is missing. */
export function readDecisions(file, n = 8) {
  if (!existsSync(file)) return null;
  const lines = readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => /^- \d{4}-\d{2}-\d{2}\b/.test(l));
  return lines.slice(-n).reverse().map((l) => {
    const date = l.slice(2, 12);
    const text = l.slice(12).replace(/^\s*[–-]\s*/, '').trim();
    return { date, text };
  });
}

export const PROPOSAL_STATUSES = ['åpen', 'venter', 'vedtatt', 'gjennomført', 'lagt bort'];
const SHOWN = ['åpen', 'venter'];

/**
 * Proposals in docs/design/forslag-til-sparring.md. A proposal is a "## " line with a "Status: " line
 * right under it: "Status: status · Økt N · Fra YYYY-MM-DD · optional reference · …".
 * Headings without a status line, and indented lines, are not proposals.
 * Returns { proposals: [{ title, status, session, from, ref }], warnings }.
 */
export function parseProposals(text) {
  const lines = String(text).split(/\r?\n/);
  const proposals = [], warnings = [];
  for (let i = 0; i < lines.length - 1; i++) {
    if (!/^## /.test(lines[i]) || !/^Status: /.test(lines[i + 1])) continue;
    const title = lines[i].slice(3).trim();
    const [status = '', ...fields] = lines[i + 1].slice(8).split(' · ').map((x) => x.trim());
    let session = null, from = null;
    const refs = [];
    for (const f of fields) {
      const okt = f.match(/^Økt (\d+)$/), fra = f.match(/^Fra (\d{4}-\d{2}-\d{2})$/);
      if (okt && session === null) session = Number(okt[1]);
      else if (fra && from === null) from = fra[1];
      else if (f) refs.push(f);
    }
    const p = { title, status, session, from, ref: refs.join(' · ') || null };
    if (!PROPOSAL_STATUSES.includes(status)) warnings.push(`forslag «${title}»: ukjent status «${status}» (kjente: ${PROPOSAL_STATUSES.join(', ')})`);
    else if (SHOWN.includes(status) && session === null) warnings.push(`forslag «${title}»: status ${status}, men ingen «Økt N»`);
    proposals.push(p);
  }
  return { proposals, warnings };
}

/** docs/design/forslag-til-sparring.md, or null when the file is missing. */
export function readProposals(file) {
  if (!existsSync(file)) return null;
  return parseProposals(readFileSync(file, 'utf8'));
}

/** Everything the page shows. root holds docs/, cases/ and site/. */
export function collect(root, { git = null, now = new Date() } = {}) {
  const roadmap = readRoadmap(join(root, 'docs', 'roadmap.json'));
  const specs = readSpecs(join(root, 'docs', 'specs'));
  const { cases, warnings } = readCases(join(root, 'cases'), join(root, 'site', 'cases', 'index.json'));
  const decisions = readDecisions(join(root, 'docs', 'design', 'decisions.md'));
  const sparring = readProposals(join(root, 'docs', 'design', 'forslag-til-sparring.md'));
  if (sparring) {
    const ids = new Set((Array.isArray(roadmap.increments) ? roadmap.increments : []).filter(isObj).map((i) => Number(i.id)));
    for (const p of sparring.proposals) {
      if (SHOWN.includes(p.status) && p.session !== null && !ids.has(p.session)) sparring.warnings.push(`forslag «${p.title}»: Økt ${p.session} finnes ikke i roadmap.json`);
    }
  }
  return { roadmap, specs, cases, warnings, decisions, sparring, git, now };
}

// --- Page ------------------------------------------------------------------------------------

const STATE = {
  done: { label: 'FERDIG', cls: 'done' },
  current: { label: 'PÅGÅR', cls: 'doing' },
  next: { label: 'NESTE', cls: 'next' },
  later: { label: 'SENERE', cls: 'later' },
};
const VERDICT = { open: 'ÅPEN', go: 'GO', nogo: 'NO-GO' };
const CRIT = { met: { mark: '✓', label: 'Oppfylt', cls: 'met' }, unmet: { mark: '✗', label: 'Ikke oppfylt', cls: 'unmet' }, unknown: { mark: '?', label: 'Ukjent', cls: 'unknown' } };
const LEVEL = { easy: 'Enkelt', medium: 'Medium', hard: 'Vanskelig', tricky: 'Tricky' };
const TWIST = { 'empty-room': 'tomt rom' };

const fmtDate = (iso) => {
  if (!DATE.test(iso || '')) return esc(iso || '');
  const [y, m, d] = iso.split('-').map(Number);
  const months = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];
  return `${d}. ${months[m - 1]} ${y}`;
};
const pad = (n) => String(n).padStart(2, '0');
const stamp = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} kl. ${pad(d.getHours())}:${pad(d.getMinutes())}`;

function gateDiamond(id, verdict = 'open', extra = '') {
  return `<span class="gate v-${esc(verdict)}"${extra}><span>${esc(id)}</span></span>`;
}
/** Counts per status. Anything that is not "met" or "unmet" counts as not measured. */
export function gateSummary(g) {
  const crit = (Array.isArray(g && g.criteria) ? g.criteria : []).filter(isObj);
  const met = crit.filter((c) => c.status === 'met').length;
  const unmet = crit.filter((c) => c.status === 'unmet').length;
  const unknown = crit.length - met - unmet;
  return { met, unmet, unknown, total: crit.length, text: `${met} oppfylt · ${unmet} ikke oppfylt · ${unknown} ikke målt` };
}

/**
 * The gate that matters now: the gate of the increment in progress, or else the first gate
 * after it. Without an increment in progress, the first gate on an increment that is not done.
 * Returns the gate id, or null.
 */
export function activeGateId(roadmap) {
  const incs = (Array.isArray(roadmap.increments) ? roadmap.increments : []).filter(isObj);
  const gateIds = new Set((Array.isArray(roadmap.gates) ? roadmap.gates : []).filter(isObj).map((g) => g.id));
  const has = (i) => i.gate && gateIds.has(i.gate);
  const ci = incs.findIndex((i) => i.status === 'current');
  if (ci >= 0) {
    const after = incs.slice(ci).find(has);
    return after ? after.gate : null;
  }
  const open = incs.find((i) => i.status !== 'done' && has(i));
  return open ? open.gate : null;
}

/** The three-part bar: met, not met, not measured. Each part has its own pattern, not only colour. */
function triBar(sum, cls = '') {
  if (!sum.total) return '';
  const part = (n, kind, label) => (n ? `<i class="tb-${kind}" style="flex:${n}" title="${n} ${label}"></i>` : '');
  return `<span class="tribar ${cls}" role="img" aria-label="${esc(sum.text)}">${part(sum.met, 'met', 'oppfylt')}${part(sum.unmet, 'unmet', 'ikke oppfylt')}${part(sum.unknown, 'unknown', 'ikke målt')}</span>`;
}

function section(eyebrow, title, body, intro = '') {
  return `<section><div class="sec-head"><span class="eyebrow">${eyebrow}</span><h2>${title}</h2>${intro ? `<p class="muted">${intro}</p>` : ''}</div>${body}</section>`;
}

export function renderPage(model) {
  const { roadmap: r, specs, cases, warnings, decisions, sparring, git, now } = model;
  const incs = Array.isArray(r.increments) ? r.increments.filter(isObj) : [];
  const gates = Array.isArray(r.gates) ? r.gates.filter(isObj) : [];
  const gateById = Object.fromEntries(gates.map((g) => [g.id, g]));
  const cur = incs.find((i) => i.status === 'current');
  const allDone = incs.length > 0 && incs.every((i) => i.status === 'done');
  const out = [];
  let n = 0;
  const num = () => String(++n).padStart(2, '0');

  // 1. Top
  const nowLine = cur ? `Nå: <b>Inkrement ${esc(cur.id)}</b> · ${esc(cur.title)}` : allDone ? '<b>Alle inkrementer er ferdige</b>' : '<b>Ingen pågår</b>';
  const activeId = activeGateId(r);
  const curGate = activeId && gateById[activeId];
  out.push(`<header class="hero">
  <div class="hero-text">
    <span class="eyebrow">${esc(r.subtitle || 'Roadmap')}${r.updated ? ` · oppdatert ${fmtDate(r.updated)}${r.updatedBy ? ` av ${esc(r.updatedBy)}` : ''}` : ''}</span>
    <h1>${esc(r.title || 'Roadmap')}</h1>
    ${r.principle ? `<p class="lede">${txt(r.principle)}</p>` : ''}
  </div>
  <div class="card nowcard">
    <span class="eyebrow">Status</span>
    <p class="now">${nowLine}</p>
    ${curGate ? (() => { const p = gateSummary(curGate); return `<div class="gatenow">${gateDiamond(curGate.id, curGate.verdict)}<div><b>Port ${esc(curGate.id)} · ${esc(curGate.title)}</b>${triBar(p)}<span class="small muted">${esc(p.text)}</span></div></div>`; })() : ''}
  </div>
</header>`);

  // 2. Next things
  if (Array.isArray(r.next) && r.next.length) {
    out.push(section(`${num()} · Neste`, 'De neste tingene', `<ol class="nextlist">${r.next.filter(isObj).map((x) => `<li class="card"><span class="nexttext">${txt(x.text)}</span>${x.who ? `<span class="tag who">${esc(x.who)}</span>` : ''}</li>`).join('')}</ol>`));
  }

  // 3. Timeline
  if (incs.length) {
    const tl = incs.map((i) => {
      const st = STATE[i.status] || STATE.later;
      const g = i.gate && gateById[i.gate];
      return `<div class="tl-item s-${st.cls}${i.status === 'current' ? ' cur' : ''}">
  <span class="lab">INK ${esc(i.id)}${i.kind === 'learning' ? ' · LÆRING' : ''}</span>
  <span class="segbar"><i></i></span>
  <span class="nm">${esc(i.title)}</span>
  <span class="tl-meta"><span class="state ${st.cls}">${st.label}</span>${i.hours ? `<span class="mono small muted">${esc(i.hours)}</span>` : ''}</span>
  ${i.status === 'current' ? '<span class="here">▲ Du er her</span>' : ''}
  ${g ? `<span class="tl-gate">${gateDiamond(g.id, g.verdict)}<span class="small">Port ${esc(g.id)}</span></span>` : ''}
</div>`;
    }).join('');
    out.push(section(`${num()} · Tidslinje`, cur ? `Inkrement ${esc(cur.id)} av ${incs.length}` : allDone ? 'Alle inkrementer er ferdige' : 'Ingen pågår',
      `<div class="card"><div class="scroll"><div class="timeline" style="--n:${incs.length}">${tl}</div></div>
  <div class="legend"><span><i class="lg done"></i>Ferdig</span><span><i class="lg doing"></i>Pågår</span><span><i class="lg next"></i>Neste</span><span><i class="lg later"></i>Senere</span><span>${gateDiamond('', 'open', ' style="width:14px;height:14px;margin:0 6px 0 0;vertical-align:-2px"')}Port</span><span><span class="tag learn">LÆRING</span> Læringsmål</span></div></div>`));
  }

  // 4. Increment cards
  if (incs.length) {
    const cards = incs.map((i) => {
      const st = STATE[i.status] || STATE.later;
      const g = i.gate && gateById[i.gate];
      const rows = [['BYGGES', i.build], ['TESTES', i.test], ['LÆRT', i.learned]].filter(([, v]) => str(v).trim());
      return `<details class="card incr ${i.status === 'current' ? 'cur' : ''} ${i.status === 'done' ? 'done' : ''}"${i.status === 'current' ? ' open' : ''}>
  <summary><div class="top"><span class="tag">INKREMENT ${esc(i.id)}${i.hours ? ' · ' + esc(i.hours) : ''}</span><span class="state ${st.cls}">${st.label}</span></div>
  <h3>${esc(i.title)}${i.kind === 'learning' ? ' <span class="tag learn">LÆRING</span>' : ''}</h3>${i.question ? `<p class="q">${esc(i.question)}</p>` : ''}</summary>
  ${rows.length ? `<dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${txt(v)}</dd>`).join('')}</dl>` : ''}
  <div class="foot">${g ? `${gateDiamond(g.id, g.verdict)}<span>Port ${esc(g.id)}${g.verdict === 'go' ? ' er passert' : `: ${esc(gateSummary(g).text)}`}</span>` : `<span class="muted">${i.kind === 'learning' ? 'Ingen port. Læringsinkrement' : 'Ingen port'}</span>`}</div>
</details>`;
    }).join('');
    out.push(section(`${num()} · Inkrementer`, 'Ett spørsmål per inkrement', `<div class="grid g3 incrs">${cards}</div>`, 'Det pågående inkrementet er åpent. Trykk på de andre for å se hva som bygges og testes.'));
  }

  // 5. Gates
  if (gates.length) {
    const cards = gates.map((g) => {
      const p = gateSummary(g);
      const passed = g.verdict === 'go';
      const open = g.id === activeId && !passed;
      const crit = (Array.isArray(g.criteria) ? g.criteria : []).filter(isObj);
      const stampText = passed ? 'PASSERT' : VERDICT[g.verdict] || esc(g.verdict || 'ÅPEN');
      return `<details class="card gatecard${open ? ' cur' : ''}${passed ? ' passed' : ''}"${open ? ' open' : ''}>
  <summary><div class="gh">${gateDiamond(g.id, g.verdict, ' style="margin:0"')}<h3>Port ${esc(g.id)} · ${esc(g.title)}</h3><span class="stamp v-${esc(g.verdict || 'open')}">${stampText}</span></div>
  ${triBar(p)}<span class="small muted gsum">${esc(p.text)}</span></summary>
  <ul class="crits">${crit.map((c) => { const st = CRIT[c.status] || CRIT.unknown; return `<li class="crit ${st.cls}"><span class="cm" title="${st.label}" aria-label="${st.label}">${st.mark}</span><div><span class="ct">${esc(c.text)}</span>${c.measured ? `<span class="cmeas">${txt(c.measured)}</span>` : ''}</div></li>`; }).join('')}</ul>
  ${g.nogo ? `<p class="nogo"><b>No-go:</b> ${txt(g.nogo)}</p>` : ''}
</details>`;
    }).join('');
    out.push(section(`${num()} · Portene`, 'Go eller no-go', `<div class="grid g2 gates">${cards}</div>`, 'Kriteriene er målt, ikke krysset av. ✓ oppfylt, ✗ ikke oppfylt, ? ikke målt ennå. Bare den aktuelle porten er åpen.'));
  }

  // 6. Specs
  const specIds = new Set([...specs.done, ...specs.open].map((s) => s.id));
  const planned = (Array.isArray(r.plannedSpecs) ? r.plannedSpecs : []).filter(isObj);
  const plannedShown = planned.filter((p) => !specIds.has(String(p.id)));
  const specList = (items, line) => (items.length ? `<ul class="speclist">${items.map(line).join('')}</ul>` : '<p class="small muted">Ingen.</p>');
  out.push(section(`${num()} · Specs`, 'Hva er bygget, og hva kommer', `<div class="grid g3">
  <div class="card"><h3>Ferdige <span class="count">${specs.done.length}</span></h3>${specList(specs.done, (s) => `<li><span class="sid">${esc(s.id)}</span><span>${esc(s.title)}</span><span class="mono small muted">${s.date ? fmtDate(s.date) : esc(s.status || 'Status mangler')}</span></li>`)}</div>
  <div class="card"><h3>Åpne <span class="count">${specs.open.length}</span></h3>${specList(specs.open, (s) => `<li><span class="sid">${esc(s.id)}</span><span>${esc(s.title)}</span><span class="small muted">${s.status ? txt(s.status) : '<b class="warn">Status mangler</b>'}</span></li>`)}</div>
  <div class="card"><h3>Planlagte <span class="count">${plannedShown.length}</span></h3>${specList(plannedShown, (s) => `<li><span class="sid">${esc(s.id)}</span><span>${esc(s.title)}</span>${s.note ? `<span class="small muted">${txt(s.note)}</span>` : ''}</li>`)}</div>
</div>`));

  // 7. Cases
  const rows = cases.map((c) => `<tr><th>${esc(c.id)}</th><td>${esc(c.title)}</td><td>${c.level ? esc(LEVEL[c.level] || c.level) : '<span class="muted">–</span>'}</td><td>${c.twist ? esc(TWIST[c.twist] || c.twist) : '<span class="muted">–</span>'}</td><td>${c.date ? `<span class="mono">${esc(c.date)}</span>` : '<span class="tag unpub">IKKE PUBLISERT</span>'}</td></tr>`).join('');
  const published = cases.filter((c) => c.date).length;
  out.push(section(`${num()} · Saker`, `${cases.length} saker, ${published} publisert`, `<div class="scroll"><table class="cases"><thead><tr><th>Nr</th><th>Tittel</th><th>Nivå</th><th>Vri</th><th>Publisert</th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="muted">Ingen saker.</td></tr>'}</tbody></table></div>${warnings.length ? `<ul class="warnings">${warnings.map((w) => `<li>⚠ ${esc(w)}</li>`).join('')}</ul>` : ''}`));

  // 8. Latest decisions
  if (decisions && decisions.length) {
    out.push(section(`${num()} · Beslutninger`, `De ${decisions.length} siste beslutningene`, `<ol class="decisions">${decisions.map((d) => `<li><span class="mono ddate">${esc(d.date)}</span><span>${txt(d.text)}</span></li>`).join('')}</ol>`, 'Nyeste øverst, fra <code>docs/design/decisions.md</code>.'));
  }

  // 9. Open decisions
  if (Array.isArray(r.openDecisions) && r.openDecisions.length) {
    out.push(section(`${num()} · Åpent`, 'Åpne beslutninger', `<ul class="open card">${r.openDecisions.map((d) => `<li>${txt(d)}</li>`).join('')}</ul>`));
  }

  // 10. Proposals for sparring: open and waiting, grouped by increment. Title and reference only.
  if (sparring) {
    const shown = sparring.proposals.filter((p) => SHOWN.includes(p.status));
    const decided = sparring.proposals.filter((p) => PROPOSAL_STATUSES.includes(p.status) && !SHOWN.includes(p.status)).length;
    const groups = new Map();
    for (const p of [...shown].sort((a, b) => (a.session ?? Infinity) - (b.session ?? Infinity))) {
      const k = p.session ?? 'none';
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(p);
    }
    const head = (k) => {
      if (k === 'none') return 'Uten inkrement';
      const inc = incs.find((i) => Number(i.id) === k);
      return `Inkrement ${esc(k)}${inc ? ` · ${esc(inc.title)}` : ''}`;
    };
    const body = groups.size
      ? `<div class="grid g2 sparring">${[...groups].map(([k, ps]) => `<div class="card"><h3>${head(k)} <span class="count">${ps.length}</span></h3><ul class="proposals">${ps.map((p) => `<li class="${p.status === 'venter' ? 'waiting' : ''}"><span>${txt(p.title)}${p.status === 'venter' ? ' <span class="tag">VENTER</span>' : ''}</span>${p.ref ? `<span class="small muted">${txt(p.ref)}</span>` : ''}</li>`).join('')}</ul></div>`).join('')}</div>`
      : '<p class="small muted">Ingen åpne forslag.</p>';
    out.push(section(`${num()} · Sparring`, 'Til sparring', body,
      `${shown.length} åpne eller ventende, ${decided} avgjort. Begrunnelsene står i <a href="design/forslag-til-sparring.md"><code>forslag-til-sparring.md</code></a>.`));
  }

  // 11. Background
  if (isObj(r.background) && r.background.file) {
    out.push(`<p class="background"><a href="${esc(r.background.file)}">${esc(r.background.label || r.background.file)} →</a></p>`);
  }

  const gitText = git ? ` · siste commit <span class="mono">${esc(git.hash)}</span> (${esc(git.date)})` : '';
  const footer = `<footer class="small muted">Laget ${esc(stamp(now))}${gitText} av <code>npm run roadmap</code>. Siden har ingen avkrysninger: endre kildene og lag den på nytt.</footer>`;

  return `<!doctype html>
<html lang="nb">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(r.title || 'Roadmap')} · roadmap</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Silkscreen:wght@400;700&family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&family=JetBrains+Mono:wght@400;600&display=swap">
<style>${CSS}</style>
</head>
<body>
<!-- Laget av npm run roadmap (scripts/roadmap.js). Ikke rediger denne filen: endringer forsvinner neste gang den lages. -->
<div class="wrap">
${out.join('\n')}
${footer}
</div>
</body>
</html>
`;
}

// The look from docs/2026-11-12-progresjonsplan.html: colours, fonts, cards, gates and the
// increment bar. Only the parts this page uses are kept, plus a few rules for the static timeline.
const CSS = `
:root{
  color-scheme: light;
  --bg:#EDEFF1; --paper:#FAFAF8; --ink:#1B1F2A; --muted:#5B6270; --line:#C9CED6;
  --blood:#B3261E; --brass:#8C6D1F; --teal:#2C6B70; --slate:#3E4B63; --ok:#2E7D4F; --warn:#A8561A;
  --tint-blood:#F6E3E1; --tint-brass:#F3ECD9; --tint-teal:#DDECEC; --tint-slate:#E1E5EE;
  --f-display:"Silkscreen", "Courier New", monospace;
  --f-body:"Atkinson Hyperlegible", "Segoe UI", system-ui, sans-serif;
  --f-mono:"JetBrains Mono", ui-monospace, Menlo, monospace;
}
*{box-sizing:border-box}
body{background:var(--bg);color:var(--ink);font-family:var(--f-body);font-size:16px;line-height:1.55;margin:0;padding:32px 16px 64px}
.wrap{max-width:1040px;margin:0 auto;display:flex;flex-direction:column;gap:56px}
h1,h2,h3{font-family:var(--f-display);font-weight:400;text-wrap:balance;margin:0;line-height:1.15}
h1{font-size:clamp(30px,6vw,52px);letter-spacing:.5px}
h2{font-size:clamp(20px,3.2vw,28px)}
h3{font-size:15px;letter-spacing:.5px}
p{margin:0;max-width:68ch}
.eyebrow{font-family:var(--f-display);font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:var(--blood)}
.lede{font-size:18px;color:var(--ink)}
.muted{color:var(--muted)}
.small{font-size:14px}
code,.mono{font-family:var(--f-mono);font-size:.88em}
section{display:flex;flex-direction:column;gap:20px}
.sec-head{display:flex;flex-direction:column;gap:8px;border-top:3px solid var(--ink);padding-top:14px}
.card{background:var(--paper);border:2px solid var(--ink);box-shadow:4px 4px 0 var(--ink);padding:18px}
.grid{display:grid;gap:16px}
.g2{grid-template-columns:repeat(2,minmax(0,1fr))}
.g3{grid-template-columns:repeat(3,minmax(0,1fr))}
@media (max-width:820px){.g3{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:560px){.g2,.g3{grid-template-columns:1fr}}
.scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
.tag{display:inline-block;font-family:var(--f-display);font-size:11px;letter-spacing:1px;padding:2px 7px;border:2px solid currentColor;line-height:1.4}
a{color:var(--teal)}
a:focus-visible,summary:focus-visible{outline:3px solid var(--blood);outline-offset:2px}

/* Topp */
.hero{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:28px;align-items:end}
@media (max-width:820px){.hero{grid-template-columns:1fr}}
.hero-text{display:flex;flex-direction:column;gap:14px}
.nowcard{display:flex;flex-direction:column;gap:12px}
.now{font-size:17px}
.now b{font-family:var(--f-display);font-weight:400}
.gatenow{display:grid;grid-template-columns:auto 1fr;gap:12px;align-items:start;border-top:1px dashed var(--line);padding-top:12px}
.gatenow b{font-family:var(--f-display);font-weight:400;font-size:12px}
.gatenow .gate{margin:4px 4px 0}

/* Porter og fremdriftsstriper */
.gate{font-family:var(--f-display);font-size:11px;background:var(--blood);color:#fff;width:22px;height:22px;display:inline-grid;place-items:center;transform:rotate(45deg);flex:none}
.gate span{transform:rotate(-45deg)}
.gate.v-open{background:#8A909B} .gate.v-go{background:var(--ok)} .gate.v-nogo{background:var(--blood)}
.segbar{height:16px;border:2px solid var(--ink);background:var(--paper);position:relative;overflow:hidden;display:block}
.segbar i{position:absolute;inset:0 auto 0 0;background:var(--teal)}
.mini{display:flex;align-items:center;gap:8px;font-family:var(--f-mono);font-size:11px}
.mini .segbar{flex:1;height:10px}
.state{font-family:var(--f-display);font-size:10px;padding:2px 6px;color:#fff;background:#8A909B;letter-spacing:.5px;white-space:nowrap}
.state.doing{background:var(--blood)} .state.done{background:var(--ok)} .state.next{background:var(--slate)}
.stamp{font-family:var(--f-display);font-size:11px;padding:3px 8px;color:#fff;white-space:nowrap;margin-left:auto}
.stamp.v-open{background:#8A909B} .stamp.v-go{background:var(--ok)} .stamp.v-nogo{background:var(--blood)}

/* De neste tingene */
.nextlist{margin:0;padding:0;list-style:none;display:grid;gap:12px;counter-reset:n}
.nextlist li{display:grid;grid-template-columns:auto 1fr auto;gap:14px;align-items:center;counter-increment:n;padding:14px 18px}
.nextlist li::before{content:counter(n);font-family:var(--f-display);font-size:20px;color:var(--blood);width:22px}
.tag.who{color:var(--teal);white-space:nowrap}

/* Tidslinje: status vises med tekst, mønster og ramme, ikke bare farge */
.timeline{display:grid;grid-template-columns:repeat(var(--n),minmax(110px,1fr));gap:8px;min-width:760px}
.tl-item{display:flex;flex-direction:column;gap:6px;position:relative;padding-bottom:4px}
.tl-item .lab{font-family:var(--f-display);font-size:10px;letter-spacing:.5px}
.tl-item .nm{font-size:13px;line-height:1.25}
.tl-meta{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.s-done .segbar i{width:100%;background:var(--ok)}
.s-doing .segbar i{width:50%;background:var(--blood)}
.s-doing .segbar{outline:3px solid var(--blood);outline-offset:2px}
.s-next .segbar{background:repeating-linear-gradient(45deg,#BFC4CC 0 3px,#D9DCE1 3px 6px)}
.s-later .segbar{border-style:dashed}
.s-later .nm,.s-later .lab{color:var(--muted)}
.here{font-family:var(--f-display);font-size:11px;color:var(--blood);letter-spacing:.5px}
.tl-gate{display:flex;align-items:center;gap:8px;font-size:12px;margin-top:2px}
.tl-gate .gate{width:16px;height:16px;font-size:9px;margin-left:3px}
.legend{display:flex;flex-wrap:wrap;gap:16px;font-size:13px;margin-top:16px;align-items:center}
.legend .lg{display:inline-block;width:22px;height:12px;border:2px solid var(--ink);vertical-align:-1px;margin-right:6px;background:var(--paper)}
.lg.done{background:var(--ok)} .lg.doing{background:linear-gradient(90deg,var(--blood) 50%,var(--paper) 50%)} .lg.next{background:repeating-linear-gradient(45deg,#BFC4CC 0 3px,#D9DCE1 3px 6px)} .lg.later{border-style:dashed}
.tag.learn{color:var(--brass);font-size:9px;padding:1px 5px;vertical-align:2px}

/* Inkrementkort */
.incrs{align-items:start}
.incr{display:flex;flex-direction:column;gap:8px}
.incr summary{list-style:none;cursor:pointer;display:flex;flex-direction:column;gap:8px}
.incr summary::-webkit-details-marker{display:none}
.incr:not([open]) summary::after{content:"Vis mer ›";font-family:var(--f-display);font-size:10px;color:var(--muted)}
.incr .top{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
.incr .q{font-size:15px;font-weight:700}
.incr dl{margin:4px 0 0;display:grid;grid-template-columns:auto minmax(0,1fr);gap:6px 10px;font-size:13px}
.incr dt{font-family:var(--f-display);font-size:10px;letter-spacing:.5px;color:var(--muted);padding-top:3px}
.incr dd{margin:0}
.incr .foot{margin-top:6px;display:flex;align-items:center;gap:10px;font-size:12px;border-top:1px dashed var(--line);padding-top:8px}
.incr .foot .gate{width:18px;height:18px;font-size:10px;margin-left:2px}
.incr.cur{border-color:var(--blood);box-shadow:4px 4px 0 var(--blood)}
.incr.done{background:#EEF5F2}

/* Porter */
.gates{align-items:start}
.gatecard{display:flex;flex-direction:column;gap:12px}
.gatecard summary{list-style:none;cursor:pointer;display:flex;flex-direction:column;gap:8px}
.gatecard summary::-webkit-details-marker{display:none}
.gatecard:not([open]) summary::after{content:"Vis mer ›";font-family:var(--f-display);font-size:10px;color:var(--muted)}
.gatecard[open] .crits{margin-top:12px}
.gatecard.cur{border-color:var(--ok);box-shadow:4px 4px 0 var(--ok)}
.gatecard.passed{background:#EEF5F2}
.gatecard .gh{display:flex;gap:12px;align-items:center}
/* Tredelt stripe: oppfylt (fylt grønn), ikke oppfylt (rød kryssravering), ikke målt (lys skravering) */
.tribar{display:flex;height:14px;border:2px solid var(--ink);background:var(--paper);overflow:hidden;margin:2px 0}
.tribar i{display:block;height:100%}
.tribar i + i{border-left:2px solid var(--ink)}
.tb-met{background:var(--ok)}
.tb-unmet{background:repeating-linear-gradient(45deg,var(--ok) 0 3px,#A9D3B9 3px 6px),var(--ok)}
.tb-unknown{background:repeating-linear-gradient(-45deg,#BFC4CC 0 2px,#ECEEF1 2px 6px)}
.gatenow .tribar{margin:6px 0 4px}
.crits{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:10px}
.crit{display:grid;grid-template-columns:24px 1fr;gap:10px;font-size:14px;line-height:1.4}
.cm{font-family:var(--f-display);font-size:12px;width:22px;height:22px;display:grid;place-items:center;border:2px solid var(--ink);background:var(--paper)}
.crit.met .cm{background:var(--ok);border-color:var(--ok);color:#fff}
.crit.unmet .cm{background:var(--blood);border-color:var(--blood);color:#fff}
.crit.unknown .cm{background:repeating-linear-gradient(45deg,#BFC4CC 0 3px,#D9DCE1 3px 6px)}
.ct{display:block;font-weight:700}
.cmeas{display:block;font-size:13px;color:var(--muted)}
.gatecard .nogo{font-size:13px;border-top:1px dashed var(--line);padding-top:8px;color:var(--blood)}

/* Specs */
.count{font-family:var(--f-mono);font-size:12px;color:var(--muted)}
.speclist{margin:12px 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:10px;font-size:14px}
.speclist li{display:grid;grid-template-columns:38px 1fr;gap:2px 8px}
.speclist li > span:nth-child(n+3){grid-column:2}
.sid{font-family:var(--f-mono);font-size:12px;color:var(--blood);padding-top:2px}
.warn{color:var(--warn)}

/* Saker */
table{border-collapse:collapse;width:100%;min-width:640px;background:var(--paper);font-size:14px;border:2px solid var(--ink)}
th,td{border:1px solid var(--line);padding:8px 10px;text-align:left;vertical-align:top}
thead th{background:var(--ink);color:#fff;font-family:var(--f-display);font-weight:400;font-size:11px;letter-spacing:.5px;border-color:var(--ink)}
tbody th{font-family:var(--f-mono);font-weight:600;font-size:13px;white-space:nowrap}
.tag.unpub{color:var(--muted);font-size:9px}
.warnings{margin:0;padding:0;list-style:none;font-size:13px;color:var(--warn)}

/* Beslutninger */
.decisions{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:0;border:2px solid var(--ink);background:var(--paper)}
.decisions li{display:grid;grid-template-columns:96px 1fr;gap:12px;padding:10px 14px;border-top:1px solid var(--line);font-size:14px;line-height:1.45}
.decisions li:first-child{border-top:0}
.ddate{color:var(--blood);padding-top:1px}
.sparring{align-items:start}
.proposals{margin:0;padding:0;list-style:none}
.proposals li{display:flex;flex-direction:column;gap:2px;padding:8px 0;border-top:1px solid var(--line)}
.proposals li:first-child{border-top:0;padding-top:0}
.proposals li.waiting{opacity:.55}
ul.open{margin:0;padding:18px 18px 18px 38px;display:flex;flex-direction:column;gap:6px}
.background{font-size:15px}
footer{border-top:3px solid var(--ink);padding-top:14px}
`;
