// The introduction to a project: what the scan finds that is rarely the product, the git
// branch the catalog is built from, and the answers people gave, kept in `context`.
import fs from 'node:fs';
import path from 'node:path';
import { walk, readText, globToRegex, sha1 } from './fsutil.mjs';
import { ignoreMatcher } from './config.mjs';

// Folders that are rarely the product.
export const SUSPECT_DIRS = /^(demo|demos|mock|mocks|design-mock|proto|prototype|prototypes|playground|sandbox|specprojects|examples|__mocks__)$/i;
const UI_FILE = /\.(css|scss|sass|less|tsx|jsx|vue|svelte|html?)$/;
const STYLE_FILE = /\.(css|scss|sass|less)$/;
export const CONTEXT_KEYS = ['askedAt', 'branch', 'kept', 'legacy', 'requests', 'notes', 'assumed'];

const matches = (globs, p) => (globs || []).some((g) => g === p || globToRegex(g).test(p.replace(/\/\*\*$/, '/x')));

// What the scan sees that is rarely the product, not excluded yet and not said to be kept.
export function suspectsOf(root, config) {
  const files = walk(root, ignoreMatcher(root, config)).filter((f) => UI_FILE.test(f));
  const dirs = new Map();
  const out = [];
  for (const f of files) {
    const parts = f.split('/');
    const i = parts.slice(0, -1).findIndex((x) => SUSPECT_DIRS.test(x));
    if (i >= 0) {
      const dir = `${parts.slice(0, i + 1).join('/')}/**`;
      const d = dirs.get(dir) || dirs.set(dir, { path: dir, files: 0, why: `папка «${parts[i]}»`, recommend: 'исключить — похоже на демо или макет' }).get(dir);
      d.files++;
      continue;
    }
    if (STYLE_FILE.test(f) && (/\.min\.css$/.test(f) || (readText(path.join(root, f), '') || '').split('\n').some((l) => l.length > 2000))) {
      out.push({ path: f, files: 1, why: 'минифицированный CSS', recommend: 'исключить — не читается' });
    }
  }
  return [...dirs.values(), ...out].filter((s) => !matches(config.context?.kept, s.path));
}

// The branch of the git repository the project is in, or null.
export function gitBranch(root) {
  let d = path.resolve(root);
  for (;;) {
    const g = path.join(d, '.git');
    if (fs.existsSync(g)) {
      try {
        let head;
        if (fs.statSync(g).isFile()) {
          const dir = /gitdir:\s*(.+)/.exec(fs.readFileSync(g, 'utf8'))?.[1]?.trim();
          head = fs.readFileSync(path.join(path.resolve(d, dir), 'HEAD'), 'utf8');
        } else head = fs.readFileSync(path.join(g, 'HEAD'), 'utf8');
        return /ref:\s*refs\/heads\/(.+)/.exec(head)?.[1]?.trim() || '(без ветки)';
      } catch { return null; }
    }
    const up = path.dirname(d);
    if (up === d) return null;
    d = up;
  }
}

// The questions, word for word: the brief prints them, check names them.
export const INTRO_QUESTIONS = [
  'Что ещё в репозитории не продукт и не должно попасть в каталог: макеты, демо, прототипы, спецпроекты?',
  'Что переписывают или скоро выкинут — такое не брать за образец, но учитывать при переезде на кит?',
  'Берёт ли кто-то запросы на недостающие компоненты? (Нет — если дизайнер и есть тот, кто собирает экраны.)',
  'Что в этом репозитории устроено не так, как кажется по коду?',
];

// What check says about the introduction: { rule, level: 'E'|'W'|'I', id, msg, fix }.
export function contextProblems(root, config, { suspects = null, files = null, answers = null } = {}) {
  const out = [];
  const c = config.context;
  const sus = suspects || suspectsOf(root, config);
  if (!c) {
    out.push({ rule: 'cfg.context', level: 'W', id: 'context', msg: `знакомство с проектом не пройдено: в catalog.config.json нет context${sus.length ? `; подозрительного в коде — ${sus.length}` : ''}`, fix: 'node scripts/task.mjs --intro — спроси человека то, что он напечатает, и запиши ответы' });
  } else {
    const E = (msg, fix) => out.push({ rule: 'cfg.context', level: 'E', id: 'context', msg, fix });
    if (typeof c !== 'object' || Array.isArray(c)) E('context — не объект', `поля: ${CONTEXT_KEYS.join(', ')}`);
    else {
      for (const k of Object.keys(c)) if (!CONTEXT_KEYS.includes(k)) E(`context.${k} — такого поля нет`, `поля: ${CONTEXT_KEYS.join(', ')}`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(c.askedAt || ''))) E(`context.askedAt «${c.askedAt ?? ''}» — не ГГГГ-ММ-ДД`, 'дата, когда спросили');
      if (c.branch != null && (typeof c.branch !== 'string' || !c.branch.trim())) E('context.branch — не имя ветки', 'основная ветка: master, main…');
      const all = files || walk(root, ignoreMatcher(root, config));
      const live = (g) => all.some((f) => globToRegex(g).test(f));
      for (const g of [].concat(c.kept || [])) if (typeof g !== 'string' || !live(g)) E(`context.kept: «${g}» не находит ни одного файла`, 'маска от корня проекта');
      for (const l of [].concat(c.legacy || [])) {
        if (!l || typeof l.match !== 'string' || !live(l.match)) E(`context.legacy: «${l?.match ?? ''}» не находит ни одного файла`, '{ "match": "<маска>", "why": "…" }');
        if (!l || !String(l.why || '').trim()) E(`context.legacy «${l?.match ?? ''}» без причины`, 'why: почему это не образец');
      }
      if (c.requests != null && !['designer', 'none'].includes(c.requests)) E(`context.requests «${c.requests}» — не designer и не none`, 'designer — запросы берёт дизайнер; none — пробел говорят пользователю');
      // What the agent assumed where the person did not know: a question and what was taken.
      if (c.assumed != null && (!Array.isArray(c.assumed) || c.assumed.some((x) => !x || typeof x.question !== 'string' || !x.question.trim() || typeof x.assumed !== 'string' || !x.assumed.trim()))) E('context.assumed — не список { question, assumed }', '[{ "question": "…", "assumed": "…" }]');
      for (const x of Array.isArray(c.assumed) ? c.assumed : []) {
        const ans = answers?.get(`intro.${sha1(String(x?.question || '')).slice(0, 8)}`);
        if (ans?.answer) out.push({ rule: 'cfg.context', level: 'W', id: 'context', msg: `на «${x.question}» команда ответила «${ans.answer}»${ans.who ? ` (${ans.who})` : ''}, а в context.assumed всё ещё предположение`, fix: 'запиши ответ туда, где он работает (exclude, legacy, requests, notes…), и убери пункт из assumed' });
      }
      if (c.notes != null && (!Array.isArray(c.notes) || c.notes.some((n) => typeof n !== 'string' || !n.trim()))) E('context.notes — не список строк', '["…", "…"]');
    }
    for (const s of sus) out.push({ rule: 'cfg.suspects', level: 'W', id: s.path, msg: `${s.why}: ${s.path} (файлов ${s.files}) — не спрошено, продукт ли это`, fix: `спроси человека: не продукт — в exclude, продукт — в context.kept` });
  }
  const branch = gitBranch(root);
  if (branch) {
    if (c?.branch && branch !== c.branch) out.push({ rule: 'cfg.branch', level: 'W', id: 'branch', msg: `каталог собран по ветке ${branch}, а основная — ${c.branch}`, fix: `переключись на ${c.branch} и пересобери, если каталог — для продукта` });
    else if (!c?.branch) out.push({ rule: 'cfg.branch', level: 'I', id: 'branch', msg: `каталог собран по ветке ${branch}`, fix: 'основную ветку запиши в context.branch' });
  }
  return out;
}

// Files of a legacy part (context.legacy): code that moves to the kit, never an example.
export function legacyMatcher(config) {
  const list = (config?.context?.legacy || []).filter((l) => l && typeof l.match === 'string').map((l) => ({ re: globToRegex(l.match), why: l.why || '' }));
  return (file) => list.find((l) => l.re.test(String(file || '')))?.why ?? null;
}
