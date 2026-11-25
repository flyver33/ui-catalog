// The map of screens — screens.md (references/screens.md). React: the families of screens
// from the config (`families`), what each of them uses today, and the samples the agent
// picks from the candidates the scripts shortlist.
import fs from 'node:fs';
import path from 'node:path';
import { globToRegex, readText, writeText, walk } from './fsutil.mjs';
import { ignoreMatcher } from './config.mjs';
import { legacyMatcher } from './intro.mjs';

export const SCREENS_FILE = 'screens.md';
export const BEFORE = 'Перед тем как добавлять';
export const OUTSIDE = 'Вне семей';
const NOTE = '<!-- Из кода: ui-catalog build. Руками не править. -->';
const BEFORE_TODO = 'TODO: что посмотреть перед тем, как добавлять, — где действие уже может стоять, с чего начинается каждое действие, откуда слова, как показать загрузку.';
const SAMPLES_TODO = 'TODO: таблица `Вид | Образец | Что взять` — образцы из «Кандидатов» выше.';
const CODE_FILE = /\.(tsx|jsx)$/;
const code = (s) => '`' + s + '`';

// The family of a file: the first whose `match` takes it, as with scopes.
export function familyMatcher(families) {
  const compiled = (families || []).map((f) => ({ name: f.name, res: [].concat(f.match || []).filter(Boolean).map((g) => globToRegex(g)) }));
  return (rel) => compiled.find((f) => f.res.some((r) => r.test(rel)))?.name || null;
}

// The files an implementation of an atom is used in, one entry per use.
export function implUseFiles(i, inventory) {
  if (i.kind === 'raw') return i.places.map((p) => p.file);
  if (i.kind === 'class') return (i.unit.usages || []).map((u) => u.file);
  return (inventory.react?.calls || []).filter((x) => x.component === i.key).map((x) => x.file);
}

// How a builder writes an implementation today: the import of a component, the markup of a
// class family.
export function writtenAs(i, inventory) {
  if (i.kind === 'class') return `<${i.tag || 'div'} className="${i.unit.id} …">`;
  const from = (i.comp?.barrels || [])[0] || i.file || '';
  const bare = from.replace(/\/index\.(tsx?|jsx?)$/, '').replace(/\.(tsx?|jsx?)$/, '');
  let spec = bare;
  for (const a of inventory.react?.aliases || []) {
    if (!a.from.endsWith('/*') || !a.to?.length) continue;
    const to = a.to[0];
    if (to && bare.startsWith(to)) { spec = a.from.slice(0, -1) + bare.slice(to.length); break; }
  }
  return `import { ${i.comp?.name || String(i.name).replace(/ \(.*\)$/, '')} } from '${spec}'`;
}

// Components built on the atom (wrappers), as implementations: a family may write the atom
// through one of them (`ButtonLink`).
export function wrapperImpls(a, inventory) {
  return (a.wrappers || []).map((w) => {
    const comp = (inventory.react?.components || []).find((c) => c.name === w.name && c.file === w.file) || null;
    return { kind: 'component', key: `${w.file}#${w.name}`, name: w.name, file: w.file, line: w.line, uses: w.uses, library: comp?.library, comp, wrapper: true };
  });
}

// Per family: which implementations of an atom its files use, the most used first.
// `legacy(file)`: why a file is on its way out (context.legacy) — not counted as an example.
export function todayOf(a, families, inventory, legacy = () => null) {
  const fam = familyMatcher(families);
  const rows = (families || []).map((f) => ({ family: f.name, uses: new Map() }));
  for (const i of [...a.impls.filter((x) => x.kind !== 'raw'), ...wrapperImpls(a, inventory)]) {
    for (const file of implUseFiles(i, inventory)) {
      if (legacy(file) != null) continue;
      const row = rows.find((r) => r.family === fam(file));
      if (!row) continue;
      const cur = row.uses.get(i.key) || { i, uses: 0 };
      cur.uses++;
      row.uses.set(i.key, cur);
    }
  }
  return rows.map((r) => {
    const list = [...r.uses.values()].sort((p, q) => q.uses - p.uses || String(p.i.name).localeCompare(String(q.i.name)));
    return { family: r.family, list, total: list.reduce((s, x) => s + x.uses, 0) };
  });
}

// Implementations used only in legacy files: they move to the kit, they are never taken.
export function legacyOnly(a, inventory, legacy) {
  const out = [];
  for (const i of a.impls.filter((x) => x.kind !== 'raw')) {
    const whys = implUseFiles(i, inventory).map((f) => legacy(f));
    if (whys.length && whys.every((w) => w != null)) out.push({ i, why: whys[0] });
  }
  return out;
}

// How many library uses each file has (calls of components, markup of classes).
export function libraryUses(kit, inventory) {
  const libUses = new Map();
  for (const a of kit.atoms) for (const i of a.impls.filter((x) => x.kind !== 'raw')) for (const f of implUseFiles(i, inventory)) libUses.set(f, (libUses.get(f) || 0) + 1);
  return libUses;
}

// Files that use the library's atoms but are in no family, by folder (two levels), most used
// first; the library itself (where atoms are defined, the library scopes) is not counted.
export function outsideFolders(config, kit, inventory) {
  const fam = familyMatcher(config.families || []);
  const defined = new Set(kit.atoms.flatMap((a) => a.impls.map((i) => i.file).filter(Boolean)));
  const library = (config.scopes || []).filter((s) => s.library).map((s) => globToRegex(s.match));
  // Decided: needs no family (config.outside).
  const decided = (config.outside || []).filter((o) => o && typeof o.match === 'string').map((o) => globToRegex(o.match));
  const byDir = new Map();
  for (const [file, uses] of libraryUses(kit, inventory)) {
    if (fam(file) || defined.has(file) || !CODE_FILE.test(file) || library.some((re) => re.test(file)) || decided.some((re) => re.test(file))) continue;
    const dir = file.split('/').slice(0, 2).join('/');
    const d = byDir.get(dir) || byDir.set(dir, { dir, files: 0, uses: 0 }).get(dir);
    d.files++;
    d.uses += uses;
  }
  return [...byDir.values()].filter((d) => d.files > 1 || d.uses >= 5).sort((x, y) => y.uses - x.uses || x.dir.localeCompare(y.dir));
}

// How a family's stylesheets write spacing, colour and type: tokens against raw values.
const STYLE_PROPS = {
  spacing: /^(margin|padding|gap|row-gap|column-gap)(-(top|right|bottom|left|inline|block)(-start|-end)?)?$/,
  color: /^(color|background|background-color|border-color|border|outline-color|fill|stroke)$/,
  type: /^(font|font-size|font-family|line-height)$/,
};
export function styleOf(sheets) {
  const out = Object.fromEntries(Object.keys(STYLE_PROPS).map((k) => [k, { tokens: 0, raw: 0 }]));
  for (const css of sheets) {
    for (const m of css.matchAll(/(?:^|[;{\s])([a-z-]+)\s*:\s*([^;{}]+);/g)) {
      const [, prop, value] = m;
      const kind = Object.keys(STYLE_PROPS).find((k) => STYLE_PROPS[k].test(prop));
      if (!kind) continue;
      const v = value.trim();
      if (/var\(\s*--/.test(v)) out[kind].tokens++;
      else if (kind === 'spacing' ? /\d(px|rem|em)\b/.test(v) && !/^0(px)?$/.test(v) : kind === 'color' ? /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i.test(v) : /\d(px|rem)\b|['"]?[A-Z][\w ]+['"]?,/.test(v)) out[kind].raw++;
    }
  }
  return out;
}

// Facts of every family, for screens.md and components.json.
export function screensFacts(root, config, inventory, kit, patterns) {
  const families = config.families || [];
  const fam = familyMatcher(families);
  const files = walk(root, ignoreMatcher(root, config)).filter((f) => CODE_FILE.test(f));
  const byFamily = new Map(families.map((f) => [f.name, []]));
  let outside = 0;
  for (const f of files) { const n = fam(f); if (n) byFamily.get(n).push(f); else outside++; }
  // Library implementations each file uses: a sample is built of them.
  const libUses = libraryUses(kit, inventory);
  const allFiles = walk(root, ignoreMatcher(root, config));
  const legacy = legacyMatcher(config);
  const todays = kit.atoms.map((a) => ({ a, rows: todayOf(a, families, inventory, legacy) }));
  const out = families.map((f) => {
    const own = byFamily.get(f.name);
    let modules = 0, global = 0;
    const messages = new Map();
    const ranked = [];
    // The stylesheets of the family: those its files import and those its globs match.
    const sheets = new Set(allFiles.filter((x) => /\.(s?css|less)$/.test(x) && fam(x) === f.name));
    for (const file of own) {
      const src = readText(path.join(root, file), '');
      const css = [...src.matchAll(/(?:from\s+|import\s+)['"]([^'"]+\.s?css)['"]/g)].map((m) => m[1]);
      for (const c of css.filter((x) => x.startsWith('.'))) sheets.add(path.posix.join(path.posix.dirname(file), c));
      if (css.some((c) => /\.module\.s?css$/.test(c))) modules++;
      else if (css.length) global++;
      // The message file is the first part of the namespace (`employerVacancies.page` → employerVacancies).
      for (const ns of new Set([...src.matchAll(/(?:useTranslations|getTranslations)\(\s*(?:\{[^}]*?namespace:\s*)?['"`]([\w-]+)/g)].map((m) => m[1]))) messages.set(ns, (messages.get(ns) || 0) + 1);
      const lines = src.split('\n').length;
      if (lines > 250) continue;
      let hex = (src.match(/#[0-9a-fA-F]{3,8}\b/g) || []).length;
      for (const c of css.filter((x) => x.startsWith('.'))) hex += (readText(path.join(root, path.dirname(file), c), '').match(/#[0-9a-fA-F]{3,8}\b/g) || []).length;
      const uses = libUses.get(file) || 0;
      // A legacy file is never a sample.
      if (uses && legacy(file) == null) ranked.push({ file, lines, hex, uses });
    }
    ranked.sort((p, q) => p.hex - q.hex || q.uses - p.uses || p.lines - q.lines || p.file.localeCompare(q.file));
    const composites = (patterns?.all || []).map(({ comp, instances }) => ({ name: comp.data.name || comp.id, id: comp.id, at: instances.filter((x) => fam(x.file) === f.name && legacy(x.file) == null).map((x) => `${x.file}:${x.line}`) })).filter((x) => x.at.length);
    const atoms = todays.map(({ a, rows }) => ({ id: a.id, name: a.name, row: rows.find((r) => r.family === f.name) })).filter((x) => x.row?.total);
    return {
      name: f.name, match: [].concat(f.match || []), files: own.length, modules, global,
      messages: [...messages].sort((p, q) => q[1] - p[1]).map(([n, c]) => ({ name: n, files: c })),
      atoms: atoms.map((x) => ({ id: x.id, name: x.name, uses: x.row.list.map((u) => ({ impl: u.i.name, uses: u.uses })) })),
      composites, short: ranked.slice(0, 5),
      style: styleOf([...sheets].map((x) => readText(path.join(root, x), '') || '')),
    };
  });
  return { families: out, outside, outsideFolders: outsideFolders(config, kit, inventory) };
}

// The parts of screens.md: «Перед тем как добавлять» and each family's «Из кода» and «Образцы».
export function parseScreens(text) {
  const out = { before: null, families: new Map() };
  for (const part of String(text || '').split(/^## /m).slice(1)) {
    const nl = part.indexOf('\n');
    const title = part.slice(0, nl).trim();
    const body = part.slice(nl + 1);
    if (title === BEFORE) { out.before = body.trim(); continue; }
    if (title === OUTSIDE) continue;
    const sub = {};
    for (const s of body.split(/^### /m).slice(1)) { const k = s.indexOf('\n'); sub[s.slice(0, k).trim()] = s.slice(k + 1).trim(); }
    out.families.set(title, { facts: sub['Из кода'] ?? null, samples: sub['Образцы'] ?? null, text: body.trim() });
  }
  return out;
}

// «отступы токенами 80%», or plainly when the family writes raw values.
const STYLE_RU = { spacing: 'отступы', color: 'цвета', type: 'шрифты' };
function styleLine(st) {
  const parts = [];
  for (const [k, { tokens, raw }] of Object.entries(st)) {
    const all = tokens + raw;
    if (all < 5) continue;
    const share = Math.round((100 * tokens) / all);
    parts.push(share < 34 ? `${STYLE_RU[k]} — числами, токены почти не используют (${share}%)` : `${STYLE_RU[k]} токенами ${share}%`);
  }
  return parts.join('; ') || 'стилей мало — не понять';
}

function factsMd(f) {
  const L = [NOTE, '', `- Файлов: ${f.files}; стили — CSS-модули в ${f.modules}, глобальные таблицы в ${f.global}.`];
  if (f.style) L.push(`- Как пишут стили: ${styleLine(f.style)}.`);
  if (f.messages.length) L.push(`- Сообщения (файлов, где берут): ${f.messages.slice(0, 6).map((m) => `${code(m.name)} ×${m.files}`).join(', ')}${f.messages.length > 6 ? ` и ещё ${f.messages.length - 6}` : ''}.`);
  if (f.atoms.length) {
    L.push('- Атомы — что стоит в файлах семьи, самое частое первым:');
    for (const a of f.atoms) L.push(`  - ${a.name}: ${a.uses.map((u, k) => `${code(u.impl)} ×${u.uses}${k === 0 && a.uses.length > 1 ? ` (${Math.round((100 * u.uses) / a.uses.reduce((s, x) => s + x.uses, 0))}%)` : ''}`).join(' · ')}`);
  }
  L.push('- Кандидаты в образцы:');
  for (const c of f.composites) L.push(`  - ${c.name}: ${c.at.slice(0, 2).map(code).join(', ')}${c.at.length > 2 ? ` и ещё ${c.at.length - 2}` : ''}`);
  for (const s of f.short) L.push(`  - ${code(s.file)} — ${s.lines} строк, атомов ${s.uses}${s.hex ? `, цветов числом ${s.hex}` : ''}`);
  if (!f.composites.length && !f.short.length) L.push('  - нет: в семье нет коротких файлов из атомов библиотеки');
  return L.join('\n');
}

// screens.md: the facts rewritten, the agent's parts kept; a new family gets them as TODO.
export function writeScreens(outDir, config, facts) {
  const file = path.join(outDir, SCREENS_FILE);
  const old = parseScreens(readText(file, ''));
  const L = [`# Карта экранов — ${config.project}`, '', '> Начни отсюда: найди семью файла, который меняешь (`query.mjs screens <файл>`), и открой её образец. «Из кода» пишет `ui-catalog build`; «Перед тем как добавлять» и «Образцы» — агент.', ''];
  L.push(`## ${BEFORE}`, '', old.before || BEFORE_TODO, '');
  for (const f of facts.families) {
    L.push(`## ${f.name}`, '', '### Из кода', '', factsMd(f), '', '### Образцы', '', old.families.get(f.name)?.samples || SAMPLES_TODO, '');
  }
  L.push(`## ${OUTSIDE}`, '', NOTE, '', `Файлов ни в одной семье: ${facts.outside}.`);
  if ((facts.outsideFolders || []).length) L.push('', 'С атомами библиотеки — им нужна своя семья, иначе образцов нет:', ...facts.outsideFolders.slice(0, 8).map((d) => `- ${code(d.dir + '/')} — файлов ${d.files}, мест ${d.uses}`));
  L.push('');
  writeText(file, L.join('\n'));
  return file;
}

// Rows of a samples table: `| Вид | Образец | Что взять |` without its head.
export function sampleRows(text) {
  return String(text || '').split('\n').filter((l) => /^\s*\|/.test(l)).map((l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()))
    .filter((cells) => !cells.every((c) => /^:?-+:?$/.test(c)) && cells[0] !== 'Вид');
}

export const projectFiles = (root, config) => walk(root, ignoreMatcher(root, config));
export const screensExist = (outDir) => fs.existsSync(path.join(outDir, SCREENS_FILE));
