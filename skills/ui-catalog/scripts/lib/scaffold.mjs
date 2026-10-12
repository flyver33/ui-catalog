// `catalog.config.json → scaffold`: one line per block or page scaffolding, by template:
//
//   "<what a person sees, 1–4 words> — <from the code>"
//   "шапка кабинета — блок из Logo, Menu item, Button, Avatar · партиал base/partials/header.html"
//   "колонка контента до 1440px — каркас вокруг Select, Tag, Button, Icon, …"
//
// The agent writes the label; the part after « — » is written by `generate --facts`
// (scaffoldTail) and checked by `check`: «каркас» when the unit's own CSS only lays
// things out, «блок» otherwise; the library components inside it, most frequent first;
// sizes, spacing and background from its own rule per breakpoint; the partial it lives
// in and how a page includes it.

export const SCAFFOLD_PROPS = /^(display|position|top|right|bottom|left|inset|z-index|flex(-[a-z]+)?|grid(-[a-z]+)?|gap|row-gap|column-gap|align-[a-z]+|justify-[a-z]+|place-[a-z]+|order|width|min-width|max-width|height|min-height|max-height|margin(-[a-z]+)?|padding(-[a-z]+)?|box-sizing|overflow(-[xy])?|background(-color)?)$/;
const SEP = ' — ';
const MAX = 6;

// The label: what «Где используется» and the guidelines call the block.
export const scaffoldLabel = (v) => String(v || '').split(SEP)[0].split(/[:(]/)[0].trim();

// members: [{ comp, usages }] — every component with its own (sliced) usages
// (lib/facts.mjs → factContext). A component is inside the block when one of its places
// has the block among its containers.
export function scaffoldTail(u, { members = [], partials = [], read = null, isShowcase = () => false }) {
  const layout = (u.rules || []).flatMap((r) => r.decls || []).every((d) => SCAFFOLD_PROPS.test(d.prop));
  const count = new Map();
  const inBlock = (x) => (x.ctx || []).some((level) => level.some((cls) => cls.split(/__|--/)[0] === u.id));
  for (const { comp, usages } of members) {
    const n = usages.filter((x) => !x.part && x.kind === 'markup' && inBlock(x)).length;
    if (n) count.set(comp.id, { comp, n });
  }
  const comps = [...count.values()].sort((a, b) => b.n - a.n || String(a.comp.id).localeCompare(String(b.comp.id)));
  // A component not named yet (TODO) is called by its id until it is.
  const nameOf = (comp) => (comp.data?.name && !/TODO/.test(comp.data.name) ? comp.data.name : comp.id);
  const names = comps.slice(0, MAX).map((e) => nameOf(e.comp));
  const partial = partials.find((p) => (p.units || []).includes(u.id));
  const sizes = sizesOf(u);
  return (layout ? 'каркас' : 'блок') + (names.length ? (layout ? ' вокруг ' : ' из ') + names.join(', ') + (comps.length > MAX ? ', …' : '') : '')
    + (sizes ? ` · ${sizes}` : '')
    + (partial ? ` · партиал ${partial.file}${includeOf(partial, { read, isShowcase })}` : '');
}

// Sizes, spacing and background from the block's own rule, per breakpoint:
// «макс. ширина 1440px, отступы 0 48px; ≤ 1280 px: отступы 0 24px». Positioning
// (display, flex, align…) says nothing to someone assembling a screen and is left out.
const SIZE_PROP = { 'max-width': 'макс. ширина', width: 'ширина', 'min-width': 'мин. ширина', height: 'высота', 'min-height': 'мин. высота',
  'max-height': 'макс. высота', padding: 'отступы', 'padding-top': 'отступ сверху', 'padding-bottom': 'отступ снизу', 'padding-left': 'отступ слева',
  'padding-right': 'отступ справа', margin: 'поля снаружи', 'margin-top': 'поле сверху', 'margin-bottom': 'поле снизу', gap: 'зазор',
  background: 'фон', 'background-color': 'фон' };
export function sizesOf(u) {
  const own = new RegExp(`^\\.${u.id.replace(/[-]/g, '\\-')}$`);
  const buckets = new Map();
  for (const r of u.rules || []) {
    if (!String(r.selector).split(',').some((s) => own.test(s.trim()))) continue;
    const at = (r.at || []).map((a) => /max-width:\s*(\d+)px/.exec(a)?.[1]).filter(Boolean)[0] || '';
    if ((r.at || []).length && !at) continue; // other media queries: not a breakpoint
    const list = buckets.get(at) || buckets.set(at, []).get(at);
    for (const d of r.decls || []) if (SIZE_PROP[d.prop]) list.push(`${SIZE_PROP[d.prop]} ${d.value.replace(/var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)/g, '$1')}`);
  }
  return [...buckets].filter(([, l]) => l.length).sort(([a], [b]) => (a === '' ? -1 : b === '' ? 1 : Number(b) - Number(a)))
    .map(([at, l]) => (at ? `≤ ${at} px: ` : '') + l.join(', ')).join('; ');
}

// How a page includes the partial — the real tag from the first non-showcase page.
function includeOf(partial, { read, isShowcase = () => false }) {
  if (!read) return '';
  const users = [...(partial.includedBy || [])].sort((a, b) => isShowcase(a.file) - isShowcase(b.file) || a.file.localeCompare(b.file));
  for (const x of users) {
    const line = String(read(x.file) || '').split(/\r?\n/)[x.line - 1] || '';
    const tag = /<([a-z][\w-]*)\b[^>]*\sdata-include\s*=\s*"[^"]+"[^>]*>(\s*<\/\1>)?/i.exec(line)?.[0];
    if (tag) return `, подключается \`${tag.trim()}\``;
  }
  return '';
}

export const scaffoldLine = (label, tail) => `${label}${SEP}${tail}`;

// What check reports about one line; `classes(text)` finds CSS classes in it.
export function scaffoldProblems(value, tail, classes) {
  const v = String(value || '');
  const out = [];
  if (/\bTODO\b/.test(v)) return out; // reported as TODO already
  const label = v.includes(SEP) ? v.split(SEP)[0].trim() : null;
  if (!label) out.push({ rule: 'cfg.scaffold', msg: `строка не по шаблону «что это — ${tail}»`, fix: 'подпись, 1–4 слова, затем « — » и хвост из кода: node generate.mjs --facts all допишет хвост' });
  else {
    if (label.split(/\s+/).length > 4) out.push({ rule: 'cfg.scaffold', msg: `подпись «${label}» длиннее 4 слов`, fix: 'что видит человек, 1–4 слова: «шапка кабинета», «ряд фильтров»' });
    const cls = classes(label);
    if (cls.length) out.push({ rule: 'cfg.scaffold', msg: `в подписи класс ${cls.join(', ')}`, fix: 'подпись — словами, без CSS' });
    const have = v.slice(v.indexOf(SEP) + SEP.length).trim();
    if (have !== tail) out.push({ rule: 'cfg.scaffold', msg: `хвост «${have}», а по коду — «${tail}»`, fix: 'его пишет скрипт: node generate.mjs --facts all' });
  }
  return out;
}

// The label from the code, as page elements are named (2026-10-03): agents named the same
// block «ряд фильтров» and «панель фильтров». A layout word of the class from the
// dictionary (the last one: `page-header` is a header), else the header of its CSS
// section, else the words of the class. `generate --all` writes it; nobody has to.
const LAYOUT_WORDS = {
  page: 'фон страницы', body: 'фон страницы', container: 'колонка контента', wrapper: 'обёртка', wrap: 'обёртка',
  layout: 'раскладка страницы', header: 'шапка', footer: 'подвал', sidebar: 'боковая колонка', aside: 'боковая колонка',
  main: 'основная часть', content: 'содержимое', filters: 'ряд фильтров', filter: 'ячейка фильтра', toolbar: 'панель инструментов',
  row: 'ряд', grid: 'сетка', columns: 'колонки', column: 'колонка', col: 'колонка', list: 'список', section: 'секция',
  card: 'карточка', panel: 'панель', nav: 'меню', navbar: 'меню', menu: 'меню', modal: 'окно', dialog: 'окно',
  form: 'форма', table: 'таблица', hero: 'первый экран', banner: 'баннер', tabs: 'вкладки', actions: 'ряд действий',
  buttons: 'ряд кнопок', group: 'группа',
};
export function scaffoldDraft(u, { prefix = null, taken = new Set() } = {}) {
  const parts = u.id.split(/[-_]+/).filter(Boolean);
  const words = prefix && u.id.startsWith(prefix) ? u.id.slice(prefix.length).split(/[-_]+/).filter(Boolean) : parts.length > 1 && parts[0].length <= 3 ? parts.slice(1) : parts;
  const fromDict = [...words].reverse().map((w) => LAYOUT_WORDS[w.toLowerCase()]).find(Boolean);
  const section = String(u.section || '').replace(/\([^)]*\)/g, '').replace(/[─—–-]{2,}/g, '').trim().toLowerCase();
  const short = (s) => s && s.split(/\s+/).length <= 4 ? s : null;
  for (const label of [fromDict, short(section), words.join(' ')]) if (label && !taken.has(label)) return label;
  return words.join(' ');
}
