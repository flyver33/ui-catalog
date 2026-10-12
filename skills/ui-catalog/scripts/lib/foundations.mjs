// Foundations: one file per area of the design system, written by build from the code
// The roles of tokens, their state rows and the
// background/text pairs come from how the CSS uses them, never from names or comments.
import { parseColor, contrast } from './color.mjs';

// ── roles of a token ──────────────────────────────────────
const USES = [
  [/^(background|background-color|background-image)$/, 'background'],
  [/^(color|text-decoration-color|caret-color)$/, 'text'],
  [/^(border|border-.+|outline|outline-color|column-rule.*)$/, 'border'],
  [/^(box-shadow|text-shadow)$/, 'shadow'],
  [/^(fill|stroke)$/, 'icon'],
];
const USE_ORDER = ['background', 'text', 'border', 'focus-ring', 'shadow', 'icon'];
const STATE_ORDER = ['', 'hover', 'pressed', 'selected', 'disabled', 'focus'];

const firstSelector = (sel) => String(sel || '').split(',')[0].trim();

// One state per use; when a selector says several, the first of this list wins.
export function stateOf(selector) {
  const s = firstSelector(selector);
  if (/:focus(-visible|-within)?(?![\w-])/.test(s)) return 'focus';
  if (/:hover(?![\w-])/.test(s)) return 'hover';
  if (/:active(?![\w-])/.test(s)) return 'pressed';
  if (/:disabled(?![\w-])|\[disabled\]|--disabled(?![\w-])/.test(s)) return 'disabled';
  if (/--(active|current|selected)(?![\w-])|\.is-(active|selected)(?![\w-])|\[aria-current|\[aria-selected=["']?true/.test(s)) return 'selected';
  return null;
}

export const useOf = (prop) => (USES.find(([re]) => re.test(prop)) || [null, prop])[1];

export function roleOf(site) {
  if (!site?.prop || site.prop.startsWith('--')) return null; // defines another variable
  const use = useOf(site.prop);
  const state = stateOf(site.selector);
  if (state === 'focus' && (use === 'border' || use === 'shadow')) return 'focus-ring';
  return state ? `${use}-${state}` : use;
}

const roleRank = (role) => {
  const i = STATE_ORDER.findIndex((s) => s && role.endsWith('-' + s));
  const base = i > 0 ? role.slice(0, -(STATE_ORDER[i].length + 1)) : role;
  const u = USE_ORDER.indexOf(base);
  return (u < 0 ? USE_ORDER.length : u) * 10 + Math.max(0, i);
};
export const byRole = (a, b) => roleRank(a) - roleRank(b) || a.localeCompare(b);

export function tokenRoles(token) {
  const n = new Map();
  for (const s of token.sites || []) { const r = roleOf(s); if (r) n.set(r, (n.get(r) || 0) + 1); }
  return [...n].map(([role, count]) => ({ role, count })).sort((a, b) => b.count - a.count || byRole(a.role, b.role));
}

// ── state rows ───────────────────────────────────────────
export function stateRows(tokens) {
  const rows = new Map();
  for (const t of tokens) for (const s of t.sites || []) {
    if (!s.prop || s.prop.startsWith('--')) continue;
    const sel = firstSelector(s.selector);
    const state = /:hover(?![\w-])/.test(sel) ? 'hover' : /:active(?![\w-])/.test(sel) ? 'pressed' : null;
    const base = sel.replace(/:hover(?![\w-])|:active(?![\w-])/g, '');
    const key = `${s.file}|${base}|${useOf(s.prop)}`;
    const r = rows.get(key) || rows.set(key, { use: useOf(s.prop) }).get(key);
    r[state || 'base'] ||= t.name;
  }
  const out = new Map();
  for (const r of rows.values()) {
    if (!r.base || (!r.hover && !r.pressed)) continue;
    const text = `\`${r.base}\`` + (r.hover ? ` → hover \`${r.hover}\`` : '') + (r.pressed ? ` → pressed \`${r.pressed}\`` : '');
    const k = `${r.use}|${text}`;
    out.set(k, { use: r.use, text, count: (out.get(k)?.count || 0) + 1 });
  }
  return [...out.values()].sort((a, b) => byRole(a.use, b.use) || b.count - a.count || a.text.localeCompare(b.text));
}

// ── background and text pairs ─────────────────────────────
export function colorPairs(tokens) {
  const bySel = new Map();
  for (const t of tokens) for (const s of t.sites || []) {
    const use = s.prop && !s.prop.startsWith('--') ? useOf(s.prop) : null;
    if (use !== 'background' && use !== 'text') continue;
    const key = `${s.file}|${s.selector}`;
    const e = bySel.get(key) || bySel.set(key, { background: new Set(), text: new Set() }).get(key);
    e[use].add(t);
  }
  const pairs = new Map();
  for (const e of bySel.values()) for (const bg of e.background) for (const fg of e.text) {
    const k = `${bg.name}|${fg.name}`;
    if (!pairs.has(k)) {
      const b = parseColor(bg.resolved || bg.value), f = parseColor(fg.resolved || fg.value);
      pairs.set(k, { bg: bg.name, fg: fg.name, count: 0, ratio: b && f ? contrast(f, b) : null });
    }
    pairs.get(k).count++;
  }
  return [...pairs.values()].sort((a, b) => b.count - a.count || a.bg.localeCompare(b.bg) || a.fg.localeCompare(b.fg));
}

// ── values without tokens, from library CSS ───────────────
export function libraryValues(units, kind) {
  const counts = new Map();
  const add = (v, prop) => { const e = counts.get(v) || counts.set(v, { value: v, count: 0, props: new Set() }).get(v); e.count++; e.props.add(prop); };
  for (const u of units.filter((x) => x.library)) for (const r of u.rules || []) for (const d of r.decls || []) {
    const v = String(d.value).replace(/var\([^)]*\)/g, ' ');
    if (kind === 'spacing' && /^(margin|padding)(-.+)?$|^(gap|row-gap|column-gap)$/.test(d.prop)) {
      for (const m of v.matchAll(/(?<![\w.-])(-?\d*\.?\d+)px\b/g)) if (Number(m[1]) !== 0) add(`${m[1]}px`, d.prop);
    }
    if (kind === 'motion' && /^(transition|animation)(-.+)?$/.test(d.prop)) {
      for (const m of v.matchAll(/(?<![\w.-])(\d*\.?\d+)(ms|s)\b/g)) add(m[0], d.prop);
      for (const m of v.matchAll(/\b(ease-in-out|ease-in|ease-out|ease|linear|step-start|step-end)\b|cubic-bezier\([^)]*\)|steps\([^)]*\)/g)) add(m[0], d.prop);
    }
  }
  const num = (v) => { const m = /^(-?\d*\.?\d+)(px|ms|s)$/.exec(v); return m ? Number(m[1]) * (m[2] === 's' ? 1000 : 1) : Infinity; };
  return [...counts.values()].map((e) => ({ ...e, props: [...e.props].sort() }))
    .sort((a, b) => num(a.value) - num(b.value) || a.value.localeCompare(b.value));
}

// ── breakpoints (layout.md) ───────────────────────────────────────────
export function breakpoints(units) {
  const bp = new Map();
  for (const u of units) for (const m of new Set(u.media || [])) for (const x of String(m).matchAll(/(max|min)-width:\s*(\d+)px/g)) {
    const k = `${x[1]}-width: ${x[2]}px`;
    const e = bp.get(k) || bp.set(k, { query: k, px: Number(x[2]), library: 0, other: 0 }).get(k);
    e[u.library ? 'library' : 'other']++;
  }
  return [...bp.values()].sort((a, b) => b.library - a.library || b.px - a.px);
}

// ── the files ─────────────────────────────────────────────────────────
const code = (s) => '`' + s + '`';
const fmtRatio = (r) => (r == null ? 'контраст не посчитать' : `${r.toFixed(1)}:1${r < 4.5 ? ' · ниже AA для текста' : ''}`);

export function foundationFiles(ctx) {
  const { project, tokens, components, typeStyles = [], typeFamilies = [], icons = [], iconBase, iconUnit, units = [], scaffold = {} } = ctx;
  const nameOf = (id) => components.find((c) => c.id === id)?.name || id;
  const compList = (t) => (t.components || []).map(nameOf).join(', ') || '—';
  const head = (title, rules) => [`# ${title} — ${project}`, '', '> Сгенерировано `ui-catalog build` из кода. Руками не править.', '', '## Правила', '', ...rules.map((r) => `- ${r}`), ''];
  const ofKind = (...k) => tokens.filter((t) => k.includes(t.kind));
  const uses = (list) => list.reduce((n, t) => n + (t.uses || 0), 0);
  const tokenTable = (list) => ['| Токен | Значение | В библиотеке | Мест |', '|---|---|---|---|',
    ...list.map((t) => `| ${code(t.name)} | ${code(t.value)}${t.resolved && t.resolved !== t.value ? ` = ${code(t.resolved)}` : ''} | ${compList(t)} | ${t.uses} |`), ''];
  const files = [];
  const add = (area, title, summary, count, lines) => { if (count > 1) files.push({ area, file: `${area}.md`, title, summary, uses: count, md: lines.join('\n') }); };

  // color.md
  {
    const list = ofKind('color');
    const L = head('Цвета', [
      'Цвет — только токеном, значение не вписывать.',
      'Токен выбирай по роли: что красишь (background, text, border, focus-ring, shadow, icon) и в каком состоянии (-hover, -pressed, -selected, -disabled, -focus).',
      'Для наведения и нажатия бери токен из ряда состояний того же базового токена.',
      'Фон и текст ставь парой из «Пар»; пары ниже AA для текста не повторяй в новом.',
      'Нужного цвета нет — это запрос (токен), а не новое значение.',
    ]);
    const roles = new Map();
    for (const t of list) for (const r of t.roles || []) (roles.get(r.role) || roles.set(r.role, []).get(r.role)).push({ name: t.name, count: r.count });
    L.push('## По ролям', '', 'Роль — как токен используется в коде; число — сколько мест.', '');
    for (const role of [...roles.keys()].sort(byRole)) {
      const ts = roles.get(role).sort((a, b) => b.count - a.count || list.findIndex((t) => t.name === a.name) - list.findIndex((t) => t.name === b.name));
      L.push(`- **${role}** — ${ts.map((x) => `${code(x.name)} ×${x.count}`).join(' · ')}`);
    }
    L.push('');
    const rows = stateRows(list);
    if (rows.length) {
      L.push('## Состояния', '', 'Один селектор задаёт токен, он же с `:hover` / `:active` — другой.', '');
      for (const r of rows) L.push(`- ${r.use}: ${r.text}${r.count > 1 ? ` ×${r.count}` : ''}`);
      L.push('');
    }
    const pairs = colorPairs(list);
    if (pairs.length) {
      L.push('## Пары фон + текст', '', 'Фон и текст, заданные одним селектором; контраст по WCAG.', '');
      for (const p of pairs) L.push(`- ${code(p.bg)} + ${code(p.fg)} — ${fmtRatio(p.ratio)}${p.count > 1 ? ` · ×${p.count}` : ''}`);
      L.push('');
    }
    L.push('## Токены', '', '| Токен | Значение | Роли | В библиотеке | Мест |', '|---|---|---|---|---|');
    for (const t of list) {
      const alias = (t.sites || []).filter((s) => s.prop?.startsWith('--')).length; // not a role
      const roles = [...(t.roles || []).map((r) => `${r.role} ×${r.count}`), ...(alias ? [`значение другой переменной ×${alias}`] : [])];
      L.push(`| ${code(t.name)} | ${code(t.value)}${t.resolved && t.resolved !== t.value ? ` = ${code(t.resolved)}` : ''} | ${roles.join(' · ') || '—'} | ${compList(t)} | ${t.uses} |`);
    }
    L.push('');
    add('color', 'Цвета', 'цвет только токеном, токен — по роли', uses(list), L);
  }

  // typography.md
  {
    const base = typeStyles.filter((s) => s.library);
    const fonts = ofKind('font');
    const count = base.reduce((n, s) => n + s.sites.length, 0) + uses(fonts);
    const L = head('Текст', [
      'Новый текст набирай одним из стилей шкалы целиком: семейство, размер, начертание, интерлиньяж, трекинг. Свой не собирай.',
      'Семейство — токеном шрифта, если он есть.',
      'Нужного стиля нет — это запрос, а не новый размер.',
    ]);
    if (typeFamilies.length) {
      L.push('## Семейства', '');
      for (const f of typeFamilies) L.push(`- **${f.family}** — ${f.role === 'text' ? 'текстовое (на body)' : 'акцидентное'}${f.token ? ` · токен ${code(f.token)}` : ''}`);
      L.push('');
    }
    if (base.length) {
      L.push('## Шкала', '');
      for (const s of base) L.push(`- **${s.name}** — ${code(s.css.replace(/\n/g, ' '))}` + (s.components.length ? ` · в: ${s.components.map(nameOf).join(', ')}` : ''));
      const local = typeStyles.length - base.length;
      if (local) L.push('', `Ещё ${local} стилей задали страницы и фичи сами — их не повторять.`);
      L.push('');
    }
    add('typography', 'Текст', 'текст только стилем из шкалы', count, L);
  }

  // shape.md
  {
    const radius = ofKind('radius'), shadow = ofKind('shadow');
    const L = head('Форма', ['Скругления и тени — только токенами.', 'Нужного нет — это запрос (токен), а не новое значение.']);
    if (radius.length) L.push('## Скругления', '', ...tokenTable(radius));
    if (shadow.length) L.push('## Тени', '', ...tokenTable(shadow));
    add('shape', 'Форма', 'скругления и тени только токенами', uses(radius) + uses(shadow), L);
  }

  // spacing.md
  {
    const size = ofKind('size');
    const scale = libraryValues(units, 'spacing');
    const L = head('Отступы и размеры', size.length
      ? ['Размеры — токенами.', 'Отступы — из значений, которые использует библиотека (ниже); новое значение — запрос.']
      : ['Токенов размеров нет: отступы бери из значений, которые использует сама библиотека (ниже).', 'Значения не из списка — не вписывать: это запрос.']);
    if (size.length) L.push('## Токены', '', ...tokenTable(size));
    if (scale.length) {
      L.push('## Отступы в CSS библиотеки', '');
      for (const v of scale) L.push(`- ${code(v.value)} ×${v.count} — ${v.props.join(', ')}`);
      L.push('');
    }
    add('spacing', 'Отступы и размеры', size.length ? 'размеры токенами, отступы из шкалы' : 'отступы из шкалы библиотеки', uses(size) + scale.reduce((n, v) => n + v.count, 0), L);
  }

  // motion.md
  {
    const motion = ofKind('motion');
    const vals = libraryValues(units, 'motion');
    const L = head('Анимация', motion.length
      ? ['Длительности и кривые — токенами.', 'Новое значение — запрос.']
      : ['Токенов анимации нет: длительности и кривые бери из тех, что использует библиотека (ниже).', 'Новое значение — запрос.']);
    if (motion.length) L.push('## Токены', '', ...tokenTable(motion));
    if (vals.length) {
      L.push('## В CSS библиотеки', '');
      for (const v of vals) L.push(`- ${code(v.value)} ×${v.count} — ${v.props.join(', ')}`);
      L.push('');
    }
    add('motion', 'Анимация', motion.length ? 'длительности и кривые токенами' : 'длительности и кривые как в библиотеке', uses(motion) + vals.reduce((n, v) => n + v.count, 0), L);
  }

  // icons.md
  {
    const used = icons.filter((i) => i.inProduct), unused = icons.filter((i) => !i.inProduct);
    const glyphs = new Set(icons.map((i) => i.class).filter(Boolean));
    const sizes = iconUnit ? Object.keys(iconUnit.modifiers || {}).filter((m) => !glyphs.has(m)) : [];
    const comp = iconBase && components.find((c) => c.units.includes(iconBase));
    const L = head('Иконки', [
      'Иконка — только из набора ниже.',
      'Нужной нет — это запрос (иконка), а не свой SVG.',
      ...(comp ? [`Как ставить и когда — [${comp.name}](../${comp.md}).`] : []),
    ]);
    const sample = used.find((i) => i.markup) || icons.find((i) => i.markup);
    if (sample) L.push('## Разметка', '', '```html', sample.markup, '```', '');
    if (sizes.length) L.push('## Размеры', '', sizes.map(code).join(' · '), '');
    const nm = (i) => code(i.class || i.name);
    if (used.length) L.push(`## В продукте (${used.length})`, '', used.map(nm).join(' '), '');
    if (unused.length) L.push(`## В наборе есть, в продукте нет (${unused.length})`, '', unused.map(nm).join(' '), '');
    add('icons', 'Иконки', 'только из набора', iconUnit ? iconUnit.usageCount || 0 : used.length, L);
  }

  // layout.md
  {
    const lines = Object.entries(scaffold);
    const bps = breakpoints(units);
    const L = head('Каркас', [
      'Каркас и составные блоки — не компоненты: новое такого рода собирай из компонентов, а не копируй блок.',
      'Медиазапросы — на брейкпоинтах из таблицы, первыми — те, что использует библиотека.',
    ]);
    if (lines.length) {
      L.push('## Каркас и составные блоки', '');
      for (const [id, about] of lines) L.push(`- ${code(id)} — ${String(about).replace(' — ', ': ')}`);
      L.push('');
    }
    if (bps.length) {
      L.push('## Брейкпоинты', '', '| Медиазапрос | Элементов библиотеки | Элементов страниц и фич |', '|---|---|---|');
      for (const b of bps) L.push(`| ${code(b.query)} | ${b.library} | ${b.other} |`);
      L.push('');
    }
    add('layout', 'Каркас', 'каркас страниц и брейкпоинты', lines.length + bps.reduce((n, b) => n + b.library + b.other, 0), L);
  }

  // other.md
  {
    const list = ofKind('other');
    add('other', 'Прочие токены', 'прочие токены', uses(list), [...head('Прочие токены', ['Только токенами.']), ...tokenTable(list)]);
  }
  return files;
}
