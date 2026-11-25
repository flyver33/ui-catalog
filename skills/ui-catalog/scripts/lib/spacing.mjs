// Spacing and radius by role. A scale says which values exist, not which goes where: the
// scripts read the gap between two parts of a block by their
// relation, people decide each role's value once, and the agent takes the role's value.
import fs from 'node:fs';
import path from 'node:path';
import { parseCss, eachRule, declarations, splitTopLevel } from './css.mjs';
import { sha1 } from './fsutil.mjs';
import { familyMatcher } from './screens.mjs';

export const SPACE_ROLES = [
  { role: 'group', label: 'Внутри группы', what: 'текст и подпись к нему, иконка и надпись, метки в ряд' },
  { role: 'title-text', label: 'Заголовок → текст', what: 'заголовок и текст под ним' },
  { role: 'text-actions', label: 'Текст → действия', what: 'содержимое и кнопки после него' },
  { role: 'label-field', label: 'Подпись → поле', what: 'подпись и её поле' },
  { role: 'field-field', label: 'Между полями', what: 'поля формы' },
  { role: 'item-item', label: 'Между пунктами', what: 'пункты списка, карточки в сетке' },
  { role: 'inset', label: 'Внутренний отступ', what: 'от края карточки, окна, панели до содержимого' },
  { role: 'section-section', label: 'Между секциями', what: 'секции страницы' },
];
export const RADIUS_ROLES = [
  { role: 'control', label: 'Контрол', what: 'кнопка, поле, выпадающий список, метка' },
  { role: 'card', label: 'Карточка', what: 'карточка, панель, блок списка' },
  { role: 'overlay', label: 'Всплывающее', what: 'окно, поповер, выпадающее меню' },
  { role: 'round', label: 'Круглое', what: 'аватар, счётчик, круглая кнопка' },
];
// An atom's radius role by its type; an atom of another type is not counted.
const ATOM_RADIUS = { button: 'control', 'icon-button': 'control', input: 'control', textarea: 'control', select: 'control', autocomplete: 'control', tag: 'control', tab: 'control', avatar: 'round', badge: 'round' };
// Composites whose root has its content inside: their padding is `inset`, their radius by role.
const INSET_TYPES = new Set(['dialog', 'popover', 'tooltip', 'toast', 'banner', 'snippet', 'stat-tile', 'list-item', 'section']);
const TYPE_RADIUS = { dialog: 'overlay', popover: 'overlay', tooltip: 'overlay', toast: 'overlay', snippet: 'card', 'stat-tile': 'card', banner: 'card' };

const PAIRS = [
  [['heading', 'text'], 'title-text'],
  [['heading', 'action'], 'text-actions'],
  [['text', 'action'], 'text-actions'],
  [['field', 'action'], 'text-actions'],
  [['label', 'field'], 'label-field'],
  [['field', 'field'], 'field-field'],
  [['field', 'label'], 'field-field'],
  [['text', 'text'], 'group'],
];
const roleOfPair = (a, b) => PAIRS.find(([[x, y]]) => x === a && y === b)?.[1] || null;
const PART_KINDS = new Set(['heading', 'text', 'action', 'field', 'label']);

// ── CSS: the declarations of a class, global or of a CSS module, outside any at-rule ──
export function cssIndex(root, inventory) {
  const tokens = new Map((inventory.tokens || []).map((t) => [t.name, t.value]));
  const resolve = (v, depth = 0) => String(v).replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)/g, (m, name, fb) => (depth > 5 ? m : tokens.has(name) ? resolve(tokens.get(name), depth + 1) : fb != null ? resolve(fb, depth + 1) : m));
  const global = new Map();
  const put = (map, cls, decls) => { const l = map.get(cls) || map.set(cls, []).get(cls); l.push(...decls); };
  for (const u of inventory.units || []) for (const r of u.rules || []) {
    if ((r.at || []).length) continue;
    for (const sel of splitTopLevel(r.selector || '')) { const m = /^\.(-?[_a-zA-Z][\w-]*)$/.exec(sel.trim()); if (m) put(global, m[1], r.decls || []); }
  }
  const modules = new Map();
  const moduleOf = (file) => {
    if (modules.has(file)) return modules.get(file);
    const map = new Map();
    let src = null;
    try { src = fs.readFileSync(path.join(root, file), 'utf8'); } catch {}
    if (src) eachRule(parseCss(src), (r, ctx) => {
      if (ctx.at.length) return;
      const decls = declarations(r.body);
      for (const sel of splitTopLevel(r.prelude)) { const m = /^\.(-?[_a-zA-Z][\w-]*)$/.exec(sel.trim()); if (m) put(map, m[1], decls); }
    });
    modules.set(file, map);
    return map;
  };
  // The declarations of one element: its global classes, then its module classes.
  const of = (node) => {
    const out = [];
    for (const c of node.g || []) out.push(...(global.get(c) || []));
    for (const ref of node.m || []) { const [f, c] = ref.split('#'); out.push(...(moduleOf(f).get(c) || [])); }
    return out.map((d) => ({ prop: d.prop, value: resolve(d.value) }));
  };
  return { of, resolve, classes: (g) => g.flatMap((c) => global.get(c) || []).map((d) => ({ prop: d.prop, value: resolve(d.value) })) };
}

const lengths = (v) => splitTopLevel(String(v).replace(/!important/g, '').trim(), ' ').map((x) => { const m = /^(-?\d*\.?\d+)(px|rem)?$/.exec(x); return m ? Number(m[1]) * (m[2] === 'rem' ? 16 : 1) : null; });
// Top, right, bottom, left of a box property as the declarations set it (later wins).
function box(decls, prop) {
  const out = {};
  for (const d of decls) {
    if (d.prop === prop) {
      const v = lengths(d.value);
      if (v.length && !v.some((x) => x === undefined)) { const [t, r = t, b = t, l = r] = v; Object.assign(out, { top: t, right: r, bottom: b, left: l }); }
    }
    for (const side of ['top', 'right', 'bottom', 'left']) if (d.prop === `${prop}-${side}`) out[side] = lengths(d.value)[0];
  }
  return out;
}
const last = (decls, prop) => [...decls].reverse().find((d) => d.prop === prop)?.value;

// The parts of a block: its outermost parts, in the order of the code.
function outerParts(nodes) {
  const inPart = (i) => { for (let p = nodes[i].p; p >= 0; p = nodes[p].p) if (PART_KINDS.has(nodes[p].k)) return true; return false; };
  return nodes.map((n, i) => ({ n, i })).filter(({ n, i }) => PART_KINDS.has(n.k) && !inPart(i));
}
const chain = (nodes, i) => { const out = [i]; for (let p = nodes[i].p; p >= 0; p = nodes[p].p) out.push(p); return out; };

// The gap between two elements of a block: the gap of their common parent, else the
// margins of the two children of it they are in (collapsing when the parent is not flex
// or grid). null — not read (no class, no rule that spaces them).
function between(nodes, ai, bi, css) {
  const ca = chain(nodes, ai), cb = chain(nodes, bi);
  const common = ca.find((x) => cb.includes(x));
  if (common == null || common === ai || common === bi) return null;
  const childA = ca[ca.indexOf(common) - 1], childB = cb[cb.indexOf(common) - 1];
  const parent = css.of(nodes[common]);
  const display = last(parent, 'display') || '';
  const flex = /flex|grid/.test(display);
  const row = /flex/.test(display) && !/column/.test(last(parent, 'flex-direction') || '');
  if (flex) {
    const g = last(parent, row ? 'column-gap' : 'row-gap') ?? last(parent, 'gap');
    if (g != null) { const v = lengths(g); const px = row ? (v[1] ?? v[0]) : v[0]; if (px != null) return px; }
  }
  const ma = box(css.of(nodes[childA]), 'margin'), mb = box(css.of(nodes[childB]), 'margin');
  const x = row ? ma.right : ma.bottom, y = row ? mb.left : mb.top;
  if (x == null && y == null) return null;
  return flex ? (x || 0) + (y || 0) : Math.max(x || 0, y || 0);
}

// One block: each relation of two parts that follow each other, and each element of a list.
export function measureTree(tree, css) {
  const nodes = tree.nodes;
  if (!nodes?.length) return [];
  const out = [];
  const parts = outerParts(nodes);
  for (let j = 1; j < parts.length; j++) {
    const a = parts[j - 1], b = parts[j];
    const role = roleOfPair(a.n.k, b.n.k);
    if (!role) continue;
    out.push({ role, px: between(nodes, a.i, b.i, css), file: tree.file, line: b.n.l, key: `${tree.file}:${a.n.l}:${b.n.l}` });
  }
  nodes.forEach((n, i) => {
    if (!n.mp || n.p < 0) return;
    const parent = css.of(nodes[n.p]);
    const display = last(parent, 'display') || '';
    const row = /flex/.test(display) && !/column/.test(last(parent, 'flex-direction') || '');
    let px = null;
    if (/flex|grid/.test(display)) { const g = last(parent, row ? 'column-gap' : 'row-gap') ?? last(parent, 'gap'); if (g != null) { const v = lengths(g); px = row ? (v[1] ?? v[0]) : v[0]; } }
    if (px == null) { const m = box(css.of(n), 'margin'); px = (row ? m.right : m.bottom) ?? null; }
    out.push({ role: 'item-item', px, file: tree.file, line: n.l, key: `${tree.file}:${n.l}:item` });
  });
  return out;
}
// The padding of a block's root: its inset.
export function insetOf(tree, css) {
  const root = tree.nodes?.[0];
  if (!root) return null;
  const p = box(css.of(root), 'padding');
  return p.top ?? p.left ?? null;
}
const radiusOf = (decls) => { const v = last(decls, 'border-radius'); if (v == null) return null; const l = lengths(v)[0]; return l == null ? null : l >= 999 || /%/.test(v) ? 9999 : l; };

// ── the model: values per role, the scale, the decided value ──
const px = (n) => `${n}px`;
export function spaceModel(root, inventory, { composites = [], atoms = [], answers = new Map(), families = [] } = {}) {
  const famOf = familyMatcher(families);
  const css = cssIndex(root, inventory);
  const trees = inventory.react?.trees || [];
  // The scale: the spacing and radius tokens.
  const tokensOf = (re) => (inventory.tokens || []).filter((t) => re.test(t.name)).map((t) => ({ name: t.name, px: lengths(css.resolve(t.value))[0] })).filter((t) => t.px != null);
  const spaceScale = tokensOf(/^--(spacing|space|gap)-/);
  const radiusScale = tokensOf(/^--radius(-|$)/);
  const seen = new Set();
  const found = new Map(SPACE_ROLES.map((r) => [r.role, []]));
  for (const t of trees) for (const m of measureTree(t, css)) { if (seen.has(m.key)) continue; seen.add(m.key); found.get(m.role).push(m); }
  // inset — the root of the composites that hold their content inside.
  const byPlace = new Map(trees.map((t) => [`${t.file}:${t.line}`, t]));
  const radiusFound = new Map(RADIUS_ROLES.map((r) => [r.role, []]));
  for (const c of composites) for (const x of c.instances || []) {
    const at = typeof x === 'string' ? x : `${x.file}:${x.line}`;
    const t = byPlace.get(at);
    if (!t) continue;
    if (INSET_TYPES.has(c.type)) found.get('inset').push({ role: 'inset', px: insetOf(t, css), file: t.file, line: t.line, key: at });
    const rr = TYPE_RADIUS[c.type];
    if (rr && t.nodes?.[0]) radiusFound.get(rr).push({ px: radiusOf(css.of(t.nodes[0])), file: t.file, line: t.line, who: c.name || c.id });
  }
  for (const a of atoms) {
    const rr = ATOM_RADIUS[a.id];
    if (!rr) continue;
    for (const i of a.impls || a.implementations || []) {
      let decls = null;
      if (i.kind === 'class') decls = css.classes([String(i.name).replace(/^\./, '')]);
      else if (i.kind === 'component') { const t = trees.find((x) => x.file === i.file && x.decl === i.name && x.nodes?.length); if (t) decls = css.of(t.nodes[0]); }
      if (!decls) continue;
      radiusFound.get(rr).push({ px: radiusOf(decls), file: i.file, line: i.line, who: `${a.name || a.id} (${i.name})`, uses: i.uses || 1 });
    }
  }
  const decide = (kind, list, scale, defs) => defs.map((d) => {
    const all = list.get(d.role) || [];
    const read = all.filter((x) => x.px != null);
    const vals = new Map();
    for (const x of read) { const e = vals.get(x.px) || vals.set(x.px, { px: x.px, count: 0, places: [], who: new Set() }).get(x.px); e.count += x.uses || 1; if (e.places.length < 3) e.places.push(`${x.file}:${x.line}`); if (x.who) e.who.add(x.who); }
    // Per family of screens: where a family agrees, its value comes before the product's.
    const fams = new Map();
    for (const x of read) { const n = famOf(x.file); if (!n) continue; const m = fams.get(n) || fams.set(n, new Map()).get(n); m.set(x.px, (m.get(x.px) || 0) + (x.uses || 1)); }
    const byFamily = [...fams].map(([family, m]) => { const list = [...m].map(([v, count]) => ({ px: v, count })).sort((a, b) => b.count - a.count || a.px - b.px); const total = list.reduce((n, v) => n + v.count, 0); const top = list[0]; return { family, total, values: list, agreed: top && top.count >= 3 && top.count * 2 > total ? { px: top.px, count: top.count, token: scale.find((t) => t.px === top.px)?.name || null } : null }; });
    const values = [...vals.values()].map((v) => ({ ...v, who: [...v.who], token: scale.find((t) => t.px === v.px)?.name || null })).sort((a, b) => b.count - a.count || a.px - b.px);
    // 0 is on any scale: parts that touch.
    const onScale = values.filter((v) => v.token || v.px === 0);
    const rec = onScale[0] || values[0] || null;
    const id = `${kind}.${d.role}`;
    const ans = answers.get(id);
    let decided = null;
    if (ans?.status === 'answered' && ans.answer) {
      const n = /как в коде|по рекомендации/i.test(ans.answer) ? rec?.px : lengths(String(ans.answer).replace(/\s*px\b/i, 'px').match(/-?\d*\.?\d+(px|rem)?/)?.[0] || '')[0];
      if (n != null) decided = { px: n, token: scale.find((t) => t.px === n)?.name || null, by: 'answer', who: ans.who, date: ans.date };
    } else if (values.length === 1 && (values[0].token || values[0].px === 0)) decided = { px: values[0].px, token: values[0].token, by: 'code' };
    return { ...d, id, values, unmeasured: all.length - read.length, unmeasuredPlaces: all.filter((x) => x.px == null).slice(0, 3).map((x) => `${x.file}:${x.line}`), recommend: rec ? { px: rec.px, token: rec.token } : null, decided, answer: ans, byFamily };
  });
  return { css, spaceScale, radiusScale, roles: decide('space', found, spaceScale, SPACE_ROLES), radius: decide('radius', radiusFound, radiusScale, RADIUS_ROLES) };
}

// The value a role says, for rules, canons and verdicts.
export const roleValue = (r) => (r.decided ? { ...r.decided, status: 'decided' } : r.recommend ? { ...r.recommend, status: 'review' } : null);
const valueText = (v) => `${v.px >= 9999 ? 'полностью круглое' : px(v.px)}${v.token ? ` (\`${v.token}\`)` : ''}`;
export function roleRule(r) {
  const v = roleValue(r);
  if (!v) return null;
  return `${r.label} — ${valueText(v)}${v.status === 'review' ? ' — на проверке: так чаще всего в коде, люди ещё не решили' : ''}`;
}

// ── questions: one block «Основы: отступы и скругления» to product and design ──
export function spaceQuestions(model) {
  const out = [];
  for (const [kind, list] of [['space', model.roles], ['radius', model.radius]]) for (const r of list) {
    const off = r.values.some((v) => !v.token && v.px !== 0);
    if (r.values.length < 2 && !off) continue;
    if (!r.recommend) continue;
    const ans = r.answer;
    const answered = !!ans?.answer && ans.status === 'answered';
    // The facts stay short: the five most used values, one place (or atom) each.
    const facts = r.values.slice(0, 5).map((v) => `${v.px >= 9999 ? 'круглое' : px(v.px)} — ${v.count}, например ${kind === 'radius' && v.who.length ? v.who[0] : v.places[0]}${v.token || v.px === 0 ? '' : ', не из шкалы'}`);
    if (r.values.length > 5) facts.push(`ещё значений: ${r.values.length - 5} — foundations/${kind === 'radius' ? 'shape' : 'spacing'}.md`);
    out.push({
      id: r.id, kind: 'space', audience: 'product', wordsGiven: true,
      title: `${r.label}: ${r.values.slice(0, 4).map((v) => `${v.px >= 9999 ? 'круглое' : px(v.px)} — ${v.count}`).join(', ')}. Какой взять?`,
      human: `${r.label} (${r.what}): ${r.values.slice(0, 4).map((v) => `${v.px >= 9999 ? 'круглое' : px(v.px)} — ${v.count} мест`).join(', ')}. Какой взять?`,
      recommend: valueText(r.recommend).replace(/`/g, ''), why: 'так чаще всего в коде среди значений шкалы', options: ['по рекомендации', 'другое значение из шкалы — напишите'],
      facts, factsHash: sha1(JSON.stringify(r.values.map((v) => [v.px, v.token]))).slice(0, 10), flags: [], files: [], places: r.values.reduce((n, v) => n + v.count, 0),
      status: answered ? 'answered' : 'open', answer: ans?.answer || '', who: ans?.who || '', date: ans?.date || '', previous: '',
    });
  }
  return out.length ? { id: 'basics', name: 'Основы: отступы и скругления', uses: Number.MAX_SAFE_INTEGER - 1, questions: out } : null;
}

// ── foundations lines ──
export function spacingSection(model) {
  const L = ['## Отступы по ролям', '', 'Отступ между частями берётся по роли — что с чем рядом, а не у соседнего блока. «Решено» — так сказали люди или в коде одно значение шкалы; «на проверке» — чаще всего в коде, люди ещё не ответили (questions.md).', ''];
  L.push('| Роль | Что между чем | Значение | В коде | Не измерено |', '|---|---|---|---|---|');
  for (const r of model.roles) {
    const v = roleValue(r);
    L.push(`| ${r.label} \`${r.role}\` | ${r.what} | ${v ? `${valueText(v)}${v.status === 'review' ? ' · на проверке' : ' · решено'}` : 'не решено'} | ${r.values.slice(0, 5).map((x) => `${px(x.px)} ×${x.count}`).join(', ') || '—'} | ${r.unmeasured || '—'} |`);
  }
  L.push('');
  return L;
}
export function radiusSection(model) {
  const L = ['## Скругления по ролям', '', '| Роль | Что | Значение | В коде |', '|---|---|---|---|'];
  for (const r of model.radius) {
    const v = roleValue(r);
    L.push(`| ${r.label} \`${r.role}\` | ${r.what} | ${v ? `${valueText(v)}${v.status === 'review' ? ' · на проверке' : ' · решено'}` : 'не решено'} | ${r.values.slice(0, 5).map((x) => `${x.px >= 9999 ? 'круглое' : px(x.px)} — ${x.who.slice(0, 3).join(', ') || x.count}`).join('; ') || '—'} |`);
  }
  L.push('');
  return L;
}

// The canon line of a composite: the spacing between its parts, by role.
export function canonSpacing(instances, model, { legacy = () => null } = {}) {
  const byRole = new Map();
  for (const x of instances) {
    if (!x.tree?.nodes || legacy(x.file) != null) continue;
    for (const m of measureTree(x.tree, model.css)) { if (m.px == null) continue; (byRole.get(m.role) || byRole.set(m.role, []).get(m.role)).push({ ...m, at: `${x.file}:${x.line}` }); }
  }
  const lines = [], off = [];
  for (const r of model.roles) {
    const list = byRole.get(r.role);
    if (!list?.length) continue;
    const counts = new Map();
    for (const m of list) counts.set(m.px, (counts.get(m.px) || 0) + 1);
    const [top, n] = [...counts].sort((a, b) => b[1] - a[1])[0];
    const want = r.decided?.px;
    if (want != null) {
      lines.push(`${r.label.toLowerCase()} ${px(want)}${r.decided.token ? ` (\`${r.decided.token}\`)` : ''} — решено`);
      for (const m of list) if (m.px !== want) off.push({ role: r.role, label: r.label, at: m.at, line: m.line, file: m.file, px: m.px, want });
    } else if (n >= 2 && n * 2 > list.length) lines.push(`${r.label.toLowerCase()} ${px(top)} (так в ${n} из ${list.length}) — в этом составном бери его`);
    else {
      // No agreement inside the composite: its own values say nothing — the role does.
      const v = roleValue(r);
      const role = `бери по роли${v ? `: ${px(v.px)}${v.status === 'review' ? ', на проверке' : ''}` : ''}`;
      lines.push(counts.size === 1 ? `${r.label.toLowerCase()} ${px(top)} — в одном месте, этого мало: ${role}` : `${r.label.toLowerCase()} — разное (${[...counts.keys()].sort((a, b) => a - b).map(px).join(', ')}), ${role}`);
    }
  }
  return { line: lines.length ? `Отступы: ${lines.join(' · ')}. Новый элемент между частями берёт роль своей связи — foundations/spacing.md.` : null, off };
}

// What components.json carries for ui-compose.
export function spaceEntries(model) {
  const one = (r) => ({ role: r.role, label: r.label, what: r.what, value: roleValue(r), values: r.values.map((v) => ({ px: v.px, count: v.count, token: v.token })), unmeasured: r.unmeasured, byFamily: (r.byFamily || []).map((x) => ({ family: x.family, total: x.total, agreed: x.agreed })) });
  return { roles: model.roles.map(one), radius: model.radius.map(one) };
}
