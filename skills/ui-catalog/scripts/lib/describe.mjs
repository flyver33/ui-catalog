// Say in plain words what a CSS rule styles: «Chip — текст, при наведении».
// Used for «Где используется» tables, so a designer reads elements, not selectors.
import { scaffoldLabel } from './scaffold.mjs';

const splitList = (sel) => String(sel).split(',').map((s) => s.trim());

export const PROP_RU = {
  color: 'цвет текста', background: 'фон', 'background-color': 'фон', 'background-image': 'фон',
  border: 'рамка', 'border-color': 'цвет рамки', 'border-top': 'рамка сверху', 'border-bottom': 'рамка снизу',
  'border-left': 'рамка слева', 'border-right': 'рамка справа', outline: 'обводка', 'outline-color': 'цвет обводки',
  'box-shadow': 'тень', 'text-shadow': 'тень текста', fill: 'заливка', stroke: 'обводка',
  'border-radius': 'скругление', 'font-family': 'шрифт', 'font-size': 'размер шрифта', 'line-height': 'интерлиньяж',
  'caret-color': 'курсор ввода', 'text-decoration-color': 'подчёркивание', 'accent-color': 'цвет контрола',
};

export const PART_RU = { title: 'текст', text: 'текст', label: 'подпись', icon: 'иконка', link: 'ссылка', item: 'пункт', inner: 'обёртка',
  head: 'заголовок', header: 'шапка', body: 'тело', footer: 'низ', arrow: 'стрелка', value: 'значение', count: 'счётчик', badge: 'бейдж',
  name: 'имя', btn: 'кнопка', button: 'кнопка', num: 'число', date: 'дата', lead: 'вводный текст', logo: 'логотип', meta: 'мелкие данные',
  bar: 'полоса', panel: 'панель', ava: 'аватар', avatar: 'аватар', photo: 'фото', thumb: 'превью', score: 'оценка', hint: 'подсказка',
  desc: 'описание', description: 'описание', note: 'примечание', caption: 'подпись', list: 'список', row: 'строка', card: 'карточка',
  top: 'верх', bottom: 'низ', main: 'основная часть', content: 'содержимое', aside: 'боковая часть', menu: 'меню', toggle: 'переключатель',
  line: 'полоска', lines: 'полоски', chip: 'чип', chips: 'чипы', star: 'звезда', role: 'должность', tag: 'тег', close: 'крестик' };

const GLOBAL_RU = [
  [/^body\b/, 'весь текст страницы'], [/^html\b/, 'вся страница'], [/^:root\b/, 'объявление переменных'],
  [/^:focus-visible\b/, 'рамка фокуса с клавиатуры у всех элементов'], [/^button\b/, 'все кнопки'], [/^a\b/, 'все ссылки'],
  [/^input|^textarea|^select/, 'все поля ввода'], [/^\*/, 'все элементы'], [/^h[1-6]\b/, 'заголовки'], [/^::selection/, 'выделение текста'],
];

const STATE_RU = [[/:hover\b/, 'при наведении'], [/:active\b/, 'при нажатии'], [/:focus(-visible)?\b/, 'при фокусе'],
  [/:disabled\b|\[disabled\]/, 'выключенный'], [/--active\b|\bis-active\b|\[aria-current/, 'текущий'], [/\bis-(on|selected|picked)\b/, 'выбранный'],[/::?(before|after)\b/, 'декор']];

export const scopeRu = (scope) => {
  const [kind, slug] = String(scope || '').split(':');
  // A scope without a per-folder slug (`pages/**`) is all of them: «страницы».
  if (kind === 'feature') return slug ? `фича ${slug}` : 'фичи';
  if (kind === 'page') return slug ? `страница ${slug}` : 'страницы';
  if (kind === 'base') return 'база';
  return slug || kind || '';
};

// What a class is, in words: config.labels, else the comment above its own rule
// (inventory.labels). A modifier falls back to its base, a part to «блок — часть».
// strict: a part whose name has no translation does not count as named.
export function labelOf(cls, labels = {}, { strict = false } = {}) {
  if (!cls) return null;
  if (labels[cls]) return labels[cls];
  const [base] = cls.split('--');
  if (base !== cls && labels[base]) return labels[base];
  const [root, part] = base.split('__');
  const partRu = part && PART_RU[part.split('-')[0]];
  if (part && labels[root] && (partRu || !strict)) return `${labels[root]} — ${partRu || part}`;
  return null;
}

// ctx: { components, scaffold, labels } — built components, config.scaffold, class labels.
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export function describeSite(site, ctx = {}) {
  const r = describeRaw(site, ctx);
  return { ...r, what: cap(r.what) };
}

function describeRaw(site, { components = [], scaffold = {}, labels = {} } = {}) {
  const sel = site.selector || '';
  const states = STATE_RU.filter(([re]) => re.test(sel)).map(([, t]) => t);
  const tail = (s) => [s, ...states].filter(Boolean).join(', ');
  const comps = site.unit ? components.filter((c) => c.units?.includes(site.unit)) : [];
  if (comps.length) {
    const has = (cls) => new RegExp(`\\.${cls.replace(/[-]/g, '\\-')}(?![\\w-])`).test(sel);
    const c = comps.find((x) => (x.modifiers || []).some((m) => has(m.cls))) || comps[0];
    const v = (c.variants || []).find((x) => x.cls && has(x.cls));
    const name = [c.name, v?.name].filter(Boolean).join(' · ');
    const part = new RegExp(`\\.${site.unit.replace(/[-]/g, '\\-')}__([\\w-]+)`).exec(sel)?.[1];
    const partRu = part ? PART_RU[part.split('-')[0]] || part : null;
    return { what: partRu ? `${name} — ${tail(partRu)}` : tail(name) ? `${name}${states.length ? ', ' + states.join(', ') : ''}` : name, component: c.id };
  }
  if (site.unit && scaffold[site.unit]) return { what: tail(scaffoldLabel(scaffold[site.unit])), component: null };
  const g = GLOBAL_RU.find(([re]) => re.test(sel.trim()));
  if (g) return { what: tail(g[1]), component: null };
  // A page's or feature's own element, from the code (decision of 2026-10-03): the user's
  // own label if they wrote one (catalog.config.json → labels), else the header of the CSS
  // section the rule sits in, else the class. Where it lives goes to `where`, a second line.
  // Nobody is asked for labels; a comment over one rule is not a name.
  const where = site.library ? null : scopeRu(site.scope);
  const cls = site.subject || /\.([a-zA-Z][\w-]*)/.exec(sel)?.[1];
  const label = labelOf(cls, labels);
  return { what: tail(label || site.section || (cls ? `.${cls}` : '')), where, labelled: !!label, component: null };
}
