// Guideline sections written from the code, not by the agent (M3.6, mode 1):
//   «Варианты»             every modifier the markup uses: class, name, what it changes
//                          (from its CSS rules); the agent writes only «Когда выбирать»
//   «Состояния»            states the type needs and the CSS has: есть / нет, where, and
//                          the inconsistency in ui-issues.md when there is one
//   «Показательные места»  scan's picks, each with its classes and container
//   «С чем сочетается»     neighbours, what sits inside, containers — from the markup
//   front matter related   look-alike components, then neighbours
// generate writes them (`generate.mjs --facts <id>|all` rewrites them in place and keeps
// «Когда выбирать»); check fails when a section differs from what this file produces.
import path from 'node:path';
import { relPosix, mdHref } from './fsutil.mjs';
import { TYPES, STATE_SELECTORS, STATE_VOCAB } from './types.mjs';
import { classifyModifier, VARIANT_AXES, customAxis } from './variants.mjs';
import { customName, stateOfClass } from './examples.mjs';
import { unitsOf } from './split.mjs';
import { compDir } from './library.mjs';
import { possibilities } from './possible.mjs';
import { PROP_RU, PART_RU, scopeRu } from './describe.mjs';
import { RULES } from '../audit.mjs';
import { DRAFTS } from './prose.mjs';
import { scaffoldLabel } from './scaffold.mjs';
import { iconBaseOf } from './config.mjs';

export const FACT_SECTIONS = ['Варианты', 'Состояния', 'Показательные места', 'С чем сочетается'];
export const FACTS_NOTE = '<!-- Из кода: ui-catalog generate --facts. Руками не править. -->';
export const VARIANTS_NOTE = '<!-- Из кода: ui-catalog generate --facts. Руками правится только колонка «Когда выбирать». -->';
const WHEN_TODO = 'TODO когда выбирать';

const PROP = { ...PROP_RU, padding: 'отступы', 'padding-top': 'отступ сверху', 'padding-bottom': 'отступ снизу', 'padding-left': 'отступ слева',
  'padding-right': 'отступ справа', margin: 'внешние отступы', width: 'ширина', height: 'высота', 'min-width': 'мин. ширина',
  'max-width': 'макс. ширина', 'min-height': 'мин. высота', 'font-weight': 'начертание', gap: 'зазор', opacity: 'прозрачность',
  'letter-spacing': 'трекинг', 'text-transform': 'регистр', 'justify-content': 'выравнивание', 'text-align': 'выравнивание текста',
  'white-space': 'перенос', transform: 'трансформация', cursor: 'курсор', display: 'display' };
const PSEUDO_RU = [[/:hover\b/, 'при наведении'], [/:active\b/, 'при нажатии'], [/:focus-visible\b|:focus\b/, 'при фокусе'], [/:disabled\b/, 'выключенный']];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const code = (s) => '`' + s + '`';
const plural = (n, one, few, many) => { const m10 = n % 10, m100 = n % 100; return `${n} ${m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many}`; };
const value = (v) => code(String(v).replace(/var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)/g, '$1').replace(/\s*!important$/, ''));
const isMarkup = (x) => x.kind === 'markup' || (x.kind === 'script' && x.tag);

// What a modifier changes, read from every rule that names it.
export function changeOf(cls, u) {
  const re = new RegExp(`\\.${esc(cls)}(?![\\w-])`);
  const groups = new Map();
  for (const r of u.rules || []) for (const sel of String(r.selector).split(',').map((s) => s.trim())) {
    if (!re.test(sel)) continue;
    const at = sel.search(re);
    const parts = sel.slice(at).split(/\s*[\s>+~]\s*/).filter(Boolean);
    const own = parts[0];
    const state = PSEUDO_RU.find(([p]) => p.test(own))?.[1] || null;
    const tail = parts.slice(1).join(' ');
    const part = tail ? (/__([\w-]+)/.exec(tail)?.[1] || tail) : null;
    const target = part ? PART_RU[part.split('-')[0]] || part : null;
    const media = (r.at || []).map((a) => a.replace(/^@media\s*/, '').replace(/\(max-width:\s*(\d+)px\)/, '≤ $1 px')).join(', ');
    const key = [media, state, target].filter(Boolean).join(', ');
    const list = groups.get(key) || groups.set(key, []).get(key);
    for (const d of r.decls || []) {
      const item = `${PROP[d.prop] || d.prop} ${value(d.value)}`;
      if (!list.includes(item)) list.push(item);
    }
  }
  const out = [...groups].filter(([, l]) => l.length).map(([k, l]) => (k ? `${k}: ` : '') + l.join(', '));
  return out.join('; ') || '—';
}

// Context for one component: everything the four sections need.
export function factContext({ unitsById, inventory, config, components, findings, root, outDir }) {
  const labels = config.labels || {};
  const scaffold = config.scaffold || {};
  const issues = relPosix(compDir(outDir), config.issuesFile ? path.resolve(root, config.issuesFile) : path.join(path.dirname(outDir), 'ui-issues.md'));
  const compOf = (classes) => {
    const set = new Set(classes);
    const roots = [...new Set(classes.map((c) => c.split(/__|--/)[0]))];
    for (const r of roots) {
      const cut = components.find((c) => c.declared.some((e) => e !== r && e.startsWith(r + '--') && set.has(e)));
      if (cut) return cut;
      const base = components.find((c) => c.declared.includes(r));
      if (base && set.has(r)) return base;
    }
    return null;
  };
  // A container in words: its label, a scaffold line, a component — or null (unnamed).
  // A container is named as a whole block: `gm-contacts__button-wrapper` is «контакты кандидата».
  const nameOf = (cls) => {
    const r = cls.split(/__|--/)[0];
    const l = labels[cls] || labels[cls.split('--')[0]] || labels[r];
    if (l) return l;
    if (scaffold[r]) return scaffoldLabel(scaffold[r]);
    return null;
  };
  // Every component with its own usages: what a scaffold block is made of (lib/scaffold.mjs).
  const members = components.map((comp) => ({ comp, usages: unitsOf(comp, unitsById).flatMap((u) => u.usages) }));
  return { unitsById, inventory, config, components, findings, root, outDir, issues, compOf, nameOf, members };
}

// The containers of one usage: the nearest named one, else the nearest class.
function containerOf(x, F) {
  for (const k of x.ctx || []) for (const cls of k) { const n = F.nameOf(cls); if (n) return { name: n, cls }; }
  const cls = (x.ctx?.[0] || []).find((c) => !c.includes('--')) || x.ctx?.[0]?.[0];
  return cls ? { name: null, cls } : null;
}
const containerText = (k) => (k.name ? `«${k.name}»` : code(k.cls));

// The pseudo-classes a modifier exists for when all its rules sit under them
// (`.gm-tag--nohover:hover`): at rest it changes nothing. null when it does.
export function restlessPseudo(u, mod) {
  const own = new RegExp(`\\.${esc(mod)}(?![\\w-])`);
  const sels = (u.rules || []).flatMap((r) => r.selector.split(',').map((s) => s.trim())).filter((s) => own.test(s));
  if (!sels.length) return null;
  const out = new Set();
  for (const s of sels) {
    const p = /:(hover|active|focus-visible|focus)\b/.exec(s)?.[1];
    if (!p) return null;
    out.add(p === 'focus' ? 'focus-visible' : p);
  }
  return out;
}

export function factSections(c, F, { when = new Map() } = {}) {
  const units = unitsOf(c, F.unitsById);
  const d = c.data || {};
  const iconBase = iconBaseOf(F.config, F.inventory);
  const glyphs = new Set(c.units.includes(iconBase) ? (F.inventory.icons || []).map((i) => i.class).filter(Boolean) : []);
  const sliceMods = new Set(Object.values(c.slice || {}).flatMap((s) => s.only || []));
  const unnamed = new Map();
  const out = {};
  let related = [];

  // ── Варианты ──
  {
    const { combos, possible } = possibilities(units, { ignore: glyphs });
    const states = c.examples?.states || [];
    const nameFor = (m, u) => states.find((s) => s.preview && s.cls === m && s.name)?.name || classifyModifier(m)?.name || customName(m);
    const rows = [], variants = [], reactions = new Map();
    for (const u of units) {
      const mentioned = new Map();
      for (const x of u.usages) for (const cls of x.classes || []) mentioned.set(cls, (mentioned.get(cls) || 0) + 1);
      const mods = Object.keys(u.modifiers).filter((m) => !glyphs.has(m) && !sliceMods.has(m) && !stateOfClass(m) && mentioned.has(m))
        .sort((a, b) => mentioned.get(b) - mentioned.get(a) || a.localeCompare(b));
      for (const m of mods) {
        // Changes a reaction, not the look (`--nohover`): no row, no «Когда выбирать».
        const restless = restlessPseudo(u, m);
        if (restless) {
          const what = [...restless].map((p) => STATE_VOCAB[p] || p).join(', ');
          (reactions.get(what) || reactions.set(what, []).get(what)).push(m);
          continue;
        }
        const k = classifyModifier(m);
        if ((k && VARIANT_AXES.includes(k.axis)) || (!k && customAxis(m, u) === 'variant')) variants.push(nameFor(m, u));
        rows.push(`| ${code(m)} | ${nameFor(m, u)} | ${changeOf(m, u)} | ${when.get(m) || WHEN_TODO} |`);
      }
    }
    const L = [VARIANTS_NOTE, ''];
    if (rows.length) L.push('| Класс | Название | Что меняет | Когда выбирать |', '|---|---|---|---|', ...rows, '');
    else if (!reactions.size) L.push('Модификаторов в разметке нет.', '');
    for (const [what, mods] of reactions) L.push(`Не вид — меняет только ${what}: ${mods.map(code).join(', ')}.`, '');
    const together = combos.filter((x) => x.classes.split(' ').length > 2);
    if (together.length) L.push(`Вместе в разметке: ${together.map((x) => code(x.classes) + (x.count > 1 ? ` ×${x.count}` : '')).join(' · ')}.`, '');
    if (variants.length > 1) L.push(`Друг друга исключают: ${variants.join(', ')} — на элементе один вид.`, '');
    if (possible.length) L.push(`CSS позволяет, в продукте нет: ${possible.map((x) => code(x.classes)).join(' · ')}.`, '');
    out['Варианты'] = L.join('\n').trim();
  }

  // ── Состояния ──
  {
    const type = TYPES[d.type];
    const own = new Set(units.flatMap((u) => Object.keys(u.modifiers)));
    // A selector belongs to this component when every modifier in it is the component's own.
    const sels = units.flatMap((u) => (u.rules || []).flatMap((r) => String(r.selector).split(',').map((s) => s.trim())
      .filter((s) => (s.match(new RegExp(`\\.${esc(u.id)}--[\\w-]+`, 'g')) || []).every((m) => own.has(m.slice(1))))));
    // Parts count: Menu item is a <nav> whose links are pressed.
    const interactive = units.some((u) => u.usages.some((x) => isMarkup(x) && String(x.interactive) !== 'false'));
    const globalFocus = (F.inventory.globalRules || []).find((r) => /^:focus-visible\b/.test(r.selector.trim()));
    const mine = (F.findings || []).filter((f) => f.component === c.id);
    const note = (rules) => mine.filter((f) => rules.includes(f.rule)).map((f) => `несостыковка «${RULES[f.rule]?.title || f.rule}» — [ui-issues.md](${F.issues})`);
    const detected = Object.keys(STATE_SELECTORS).filter((s) => sels.some((sel) => STATE_SELECTORS[s].some((re) => re.test(sel))));
    const wanted = [...new Set([...(type?.states || []), ...detected])].sort((a, b) => Object.keys(STATE_VOCAB).indexOf(a) - Object.keys(STATE_VOCAB).indexOf(b));
    const rows = [];
    for (const s of wanted) {
      const hits = sels.filter((sel) => STATE_SELECTORS[s].some((re) => re.test(sel)));
      const lost = s === 'focus-visible' && mine.some((f) => f.rule === 'focus-lost');
      const viaGlobal = s === 'focus-visible' && !hits.length && globalFocus && interactive && !lost;
      const has = !lost && (hits.length > 0 || viaGlobal);
      const how = viaGlobal ? `общая обводка ${code(':focus-visible')} из ${globalFocus.file}` : hits.slice(0, 3).map(code).join(', ');
      const why = note({ hover: ['hover-on-static', 'pseudo-only', 'weak-hover'], 'focus-visible': ['focus-lost'] }[s] || []);
      if (!has && (type?.states || []).includes(s)) why.push(...note(['missing-state']));
      rows.push(`| ${STATE_VOCAB[s] || s} | ${has ? 'есть' : 'нет'} | ${[how, ...new Set(why)].filter(Boolean).join('; ') || '—'} |`);
    }
    const L = [FACTS_NOTE, ''];
    if (rows.length) L.push('| Состояние | В коде | Как |', '|---|---|---|', ...rows);
    else L.push('Состояний нет: компонент не реагирует на действия.');
    out['Состояния'] = L.join('\n').trim();
  }

  // ── Показательные места ──
  {
    const reps = units.flatMap((u) => (u.representative || []).map((r) => ({ r, u }))).slice(0, 5);
    const L = [FACTS_NOTE, ''];
    for (const { r, u } of reps) {
      const x = u.usages.find((y) => y.file === r.file && y.line === r.line && !y.part) || r;
      const link = `[${r.file}:${r.line}](${mdHref(relPosix(compDir(F.outDir), path.join(F.root, r.file)))}#L${r.line})`;
      const k = containerOf(x, F);
      if (k && !k.name) unnamed.set(k.cls, `${r.file}:${r.line}`);
      const where = r.via ? `через ${r.via}` : [k ? containerText(k) : null, scopeRu(r.scope)].filter(Boolean).join(' · ');
      L.push(`- ${link} — ${code([u.id, ...r.classes.filter((x) => !x.includes('__'))].join(' '))}${r.kind === 'script' ? ' · разметка из скрипта' : ''}${where ? ` · ${where}` : ''}`);
    }
    if (!reps.length) L.push('Пока нигде не используется.');
    out['Показательные места'] = L.join('\n').trim();
  }

  // ── С чем сочетается ──
  {
    const near = new Map(), inside = new Map(), outer = new Map(), around = new Map();
    const bump = (map, key, val) => { const e = map.get(key) || map.set(key, { val, n: 0 }).get(key); e.n++; };
    let total = 0;
    for (const u of units) for (const x of u.usages) {
      if (x.part || x.kind !== 'markup') continue;
      total++;
      const seenNear = new Set();
      for (const sib of x.sibs || []) { const comp = F.compOf(sib); if (comp && !seenNear.has(comp.id)) { seenNear.add(comp.id); bump(near, comp.id, comp); } }
      const inner = new Set();
      for (const el of x.inner || []) { const comp = F.compOf(el); if (comp && comp.id !== c.id) inner.add(comp); }
      for (const comp of inner) bump(inside, comp.id, comp);
      // The nearest library component around it (an Icon inside a Select).
      for (const level of x.ctx || []) { const comp = F.compOf(level); if (comp && comp.id !== c.id) { bump(outer, comp.id, comp); break; } }
      const k = containerOf(x, F);
      if (k) { bump(around, k.name ? `n:${k.name}` : `c:${k.cls}`, k); if (!k.name) unnamed.set(k.cls, `${x.file}:${x.line}`); }
    }
    const top = (map) => [...map.values()].sort((a, b) => b.n - a.n || String(a.val.name || a.val.cls).localeCompare(String(b.val.name || b.val.cls)));
    const compLink = (comp) => `[${comp.data?.name || comp.id}](${path.basename(comp.file)})`; // guidelines link each other inside components/
    const L = [FACTS_NOTE, ''];
    if (near.size) L.push(`- Рядом, в одном контейнере: ${top(near).map((e) => `${e.val.id === c.id ? 'такие же' : compLink(e.val)} — ${plural(e.n, 'место', 'места', 'мест')}`).join(', ')}.`);
    if (inside.size) L.push(`- Внутри: ${top(inside).map((e) => `${compLink(e.val)} — ${plural(e.n, 'место', 'места', 'мест')}`).join(', ')}.`);
    if (outer.size) L.push(`- Стоит внутри: ${top(outer).map((e) => `${compLink(e.val)} — ${plural(e.n, 'место', 'места', 'мест')}`).join(', ')}.`);
    if (around.size) L.push(`- Контейнер: ${top(around).slice(0, 4).map((e) => `${containerText(e.val)} — ${plural(e.n, 'место', 'места', 'мест')}`).join(', ')}${around.size > 4 ? `, ещё ${around.size - 4}` : ''}.`);
    if (L.length === 2) L.push(total ? 'Стоит один, без соседей из библиотеки.' : 'В разметке страниц не встречается.');
    out['С чем сочетается'] = L.join('\n').trim();
    // Front matter `related`: look-alikes the library has (the type's similar types), then
    // the neighbours in markup, most frequent first.
    const similar = DRAFTS[d.type]?.similar || [];
    const alike = F.components.filter((o) => o.id !== c.id && similar.includes(o.data?.type)).map((o) => o.id).sort();
    const met = [...near.values(), ...inside.values(), ...outer.values()].filter((e) => e.val.id !== c.id)
      .sort((a, b) => b.n - a.n || a.val.id.localeCompare(b.val.id)).map((e) => e.val.id);
    related = [...new Set([...alike, ...met])].slice(0, 6);
  }
  return { sections: out, unnamed, related, counterpart: counterpartOf(c, F) };
}

// Front matter `counterpart` from the code: the name in brackets at the end of the CSS
// section the component's own class sits in — «Кнопки (g-btn)» → `g-btn`, «Тег (uikit
// Tag)» → `uikit Tag`. A component cut from a class by a modifier (Chip) has no section of
// its own. null: the code names nothing (with a kit as the reference, the agent writes it).
export function counterpartOf(c, F) {
  if (Object.values(c.slice || {}).some((s) => s.only)) return null;
  for (const id of c.units) {
    const m = /\(([^()]+)\)\s*$/.exec(F.unitsById.get(id)?.section || '');
    if (m && /[A-Za-z]/.test(m[1]) && /^[A-Za-z][\w.-]*( [\w.-]+)*(#[\w.-]+)?$/.test(m[1].trim())) return m[1].trim();
  }
  return null;
}

// «Когда выбирать» cells of an existing «Варианты» table, by class: kept on regeneration.
export function whenCells(sectionText) {
  const lines = String(sectionText || '').split('\n').filter((l) => /^\s*\|/.test(l));
  if (lines.length < 2) return new Map();
  const cells = (l) => l.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((x) => x.trim());
  const head = cells(lines[0]);
  const col = head.findIndex((h) => /^когда/i.test(h));
  const out = new Map();
  if (col < 0) return out;
  for (const l of lines.slice(2)) {
    const row = cells(l);
    const cls = /`([^`]+)`/.exec(row[0] || '')?.[1];
    if (cls && row[col] && row[col] !== WHEN_TODO) out.set(cls, row[col]);
  }
  return out;
}

// Replace (or add, in the fixed order) these sections in a guideline body.
export function replaceSections(body, sections, order) {
  let out = body;
  for (const [title, text] of Object.entries(sections)) {
    const re = new RegExp(`(^## ${esc(title)}\\s*\\n)([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm');
    if (re.test(out)) out = out.replace(re, (m, h) => `${h}\n${text}\n\n`);
    else {
      const after = order.slice(order.indexOf(title) + 1).find((t) => new RegExp(`^## ${esc(t)}\\s*$`, 'm').test(out));
      const block = `## ${title}\n\n${text}\n\n`;
      out = after ? out.replace(new RegExp(`^## ${esc(after)}\\s*$`, 'm'), (m) => block + m) : out.trimEnd() + '\n\n' + block;
    }
  }
  return out.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

export const sectionText = (body, title) => (new RegExp(`^## ${esc(title)}\\s*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm').exec(body) || [])[1] || null;
export const normalize = (s) => String(s || '').replace(/\s+/g, ' ').trim();
