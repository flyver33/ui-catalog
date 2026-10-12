#!/usr/bin/env node
// ui-compose compose — the verdicts and the gap report by template, checked.
//   node compose.mjs verdict <class> [<class>...]   what the library says about these classes
//   node compose.mjs check <slug|file>              a gap report (requests/<slug>.md) against the library
// In a React project (components.json → mode: kit):
//   node compose.mjs verdict <atom> [prop=value…]   в ките | в спеке | расширение | нет
//   node compose.mjs pattern <type|id>              закономерность: build by the composite's canon
//   [--dir <library dir>] [--root <project>]         default: <root>/docs/design-system
//
// Verdicts come from the library (components.json, inventory.json), not from judgement:
//   есть         the component as the markup uses it, no modifiers
//   вариант      a class combination the product has
//   возможность  classes the CSS has, put together in a way the product never shows
//   расширение   a modifier the component does not have — a request (вариант / состояние)
//   нет          no component with this class — a request (новый компонент)
//   токен        a value the tokens do not have — a request (токен); stated by the agent
//   раскладка    layout the feature writes itself (a row, a grid) from tokens; no library class
//   как есть     what the screen already has outside the library: kept, never a request
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const VERDICTS = ['есть', 'вариант', 'возможность', 'расширение', 'нет', 'токен', 'раскладка', 'как есть'];
export const GAP = new Set(['расширение', 'нет', 'токен']);
const KEEP = 'годится только там, где уже стоит и задача его не меняет; в новом месте — пробел';
// A gap row says what stands in meanwhile, or that nothing does.
const NOTHING = /временно ничего/;
const KINDS = /^(новый компонент|вариант [\w-]+|состояние [\w-]+|иконка|токен)$/;
const NEED_FIELDS = ['Для какой функции', 'Где появится', 'Ближайшее в библиотеке', 'Блокирует'];
const TOKEN_FIELDS = ['Для какой функции', 'Где появится', 'Ближайшее', 'Блокирует'];

export function loadLibrary(dir) {
  const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { return null; } };
  const lib = read('components.json');
  if (!lib) throw new Error(`нет ${path.join(dir, 'components.json')} — сначала ui-catalog build`);
  const inv = read('inventory.json') || { units: [], tokens: [], icons: [] };
  return { lib, inv, dir };
}

const sortKey = (classes) => [...new Set(classes)].sort().join(' ');
const rootOf = (cls) => cls.split(/__|--/)[0];

// The verdict for one set of classes on one element.
export function verdict(classes, { lib, inv }) {
  const list = classes.flatMap((c) => String(c).split(/\s+/)).filter(Boolean);
  if (!list.length) return { verdict: null, why: 'классов нет' };
  const glyphs = new Set((inv.icons || []).map((i) => i.class).filter(Boolean));
  const roots = [...new Set(list.map(rootOf))];
  // A component cut by a modifier (Chip = gm-tag--blue) is chosen by that modifier.
  const comp = lib.components.find((c) => c.units.some((u) => u.includes('--') && list.includes(u)))
    || lib.components.find((c) => c.units.some((u) => roots.includes(u)));
  if (!comp) {
    const page = (inv.units || []).find((u) => roots.includes(u.id) && !u.library);
    if (page) return { verdict: 'как есть', why: `${page.id} — класс ${page.scope}, библиотека его не описывает: ${KEEP}` };
    return { verdict: 'нет', why: `компонента с классами ${roots.join(', ')} в библиотеке нет`, kind: 'новый компонент' };
  }
  const root = comp.units.map(rootOf)[0];
  const own = new Set([root, ...comp.modifiers, ...glyphs]);
  const parts = list.filter((c) => c.includes('__'));
  const missing = list.filter((c) => !own.has(c) && !c.includes('__') && rootOf(c) === root);
  // A glyph the icon set does not have is an icon request, not a variant.
  const isIcons = [...glyphs].some((g) => rootOf(g) === root);
  if (missing.length) return { verdict: 'расширение', component: comp.id, why: `у ${comp.name} нет ${missing.join(', ')}`, need: missing, kind: isIcons ? 'иконка' : `вариант ${comp.id}` };
  const foreign = list.filter((c) => rootOf(c) !== root);
  if (foreign.length) return { verdict: null, component: comp.id, why: `${foreign.join(', ')} — не классы ${comp.name}: по элементу на вызов` };
  const key = sortKey(list.filter((c) => !glyphs.has(c) && !parts.includes(c)));
  const real = (comp.combos || []).some((x) => sortKey(x.classes.split(' ')) === key);
  const mods = key.split(' ').filter((c) => c !== root);
  if (real) return { verdict: mods.length ? 'вариант' : 'есть', component: comp.id, why: `${comp.name}: так в продукте` };
  // Not in the product: allowed when every pair of modifiers meets in the markup or the CSS allows it.
  const together = (a, b) => (comp.combos || []).some((x) => x.classes.split(' ').includes(a) && x.classes.split(' ').includes(b));
  const allowed = (a, b) => (comp.possible || []).some((x) => x.kind === 'combination' && x.classes.split(' ').includes(a) && x.classes.split(' ').includes(b));
  const alone = (m) => (comp.combos || []).some((x) => x.classes.split(' ').includes(m)) || (comp.possible || []).some((x) => x.kind === 'modifier' && x.classes.split(' ').includes(m));
  for (let i = 0; i < mods.length; i++) {
    if (!alone(mods[i])) return { verdict: null, component: comp.id, why: `${mods[i]} в продукте и в CSS отдельно не встречается` };
    for (let j = i + 1; j < mods.length; j++) if (!together(mods[i], mods[j]) && !allowed(mods[i], mods[j])) {
      return { verdict: null, component: comp.id, why: `${mods[i]} и ${mods[j]} вместе нельзя: один вид на элемент или разные элементы` };
    }
  }
  return { verdict: 'возможность', component: comp.id, why: `${comp.name}: CSS позволяет, в продукте такого нет — скажи разработчику, проверь глазами` };
}

// ── kit mode (a React project): atoms of the kit and composites ──────
export const KIT_VERDICTS = ['в ките', 'в спеке', 'закономерность', 'расширение', 'нет', 'токен', 'раскладка', 'как есть'];

// `<Button variant="secondary" fullWidth>` or `Button variant=secondary fullWidth` → { name, props }.
export function parseJsx(words) {
  const text = words.join(' ').trim().replace(/^</, '').replace(/\/?>$/, '').trim();
  const name = /^[\w.$-]+/.exec(text)?.[0] || '';
  const props = [];
  for (const m of text.slice(name.length).matchAll(/([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|\{['"]?([^}'"]*)['"]?\}|([^\s>]+)))?/g)) {
    if (m[1] === 'className') continue;
    props.push({ prop: m[1], value: m[2] ?? m[3] ?? m[4] ?? m[5] ?? 'true' });
  }
  const cls = /className=["']([^"']+)["']/.exec(text)?.[1];
  return { name, props, classes: cls ? cls.split(/\s+/) : [] };
}

const places = (n) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'место' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'места' : 'мест'}`;
const bare = (n) => String(n).replace(/ \(.*\)$/, '');
export function findAtom(name, lib) {
  const n = String(name).toLowerCase();
  return lib.components.find((c) => c.id === n || c.name.toLowerCase() === n || c.kit?.name?.toLowerCase() === n)
    || lib.components.find((c) => (c.implementations || []).some((i) => [i.name, bare(i.name), i.name.replace(/^[.<]|>$/g, ''), i.base].filter(Boolean).some((x) => x.toLowerCase() === n)));
}

// A component of the project by its name, as the code has it (inventory.json).
const projectComp = (name, inv) => (inv.react?.components || []).filter((x) => x.name === bare(name)).sort((p, q) => (q.uses || 0) - (p.uses || 0))[0] || null;
const asBool = (v) => (v === 'false' ? 'false' : 'true');

// The verdict for one atom with the props asked of it; an open question about the type of
// the implementation it names or puts meanwhile goes along.
export function kitVerdict(words, L) {
  const v = kitVerdictOf(words, L);
  const c = v.component && L.lib.components.find((x) => x.id === v.component);
  const names = [parseJsx(words).name, v.meanwhile && parseJsx([v.meanwhile]).name].filter(Boolean).map(bare);
  const qs = (c?.typeQuestions || []).filter((q) => names.includes(q.impl));
  if (qs.length) Object.assign(v, { questions: qs.map((q) => q.id), why: `${v.why}; открыт вопрос ${qs.map((q) => `${q.id} (${q.title})`).join(', ')} в questions.md — от ответа вердикт может измениться, скажи разработчику` });
  return v;
}
function kitVerdictOf(words, { lib, inv = {} }) {
  const { name, props, classes } = parseJsx(words);
  if (!name) return { verdict: null, why: 'не названо, что нужно' };
  const code = (s) => '`' + s + '`';
  // A raw element with a class family: the family's root names the atom.
  const c = (classes.length && classes.map((k) => findAtom(k, lib)).find(Boolean)) || findAtom(name, lib);
  if (!c) {
    // What the project already has, outside the library: kept where it stands.
    const own = !classes.length && projectComp(name, inv);
    if (!own) return { verdict: 'нет', why: `атома «${name}» в спеке нет`, kind: 'новый компонент' };
    const alien = props.filter((r) => !own.props.some((p) => p.name === r.prop));
    if (alien.length) return { verdict: null, why: `у ${own.name} (${own.file}) нет ${alien.map((r) => code(r.prop)).join(', ')}: это код проекта вне библиотеки — новое в нём собирай из библиотеки` };
    return { verdict: 'как есть', why: `${own.name} — компонент проекта (${own.file}:${own.line}), библиотека его не описывает: ${KEEP}` };
  }
  // Requested values in the API's words; an implementation's spelling is read as the API's.
  const asked = [];
  for (const r of props) {
    let p = c.api.find((x) => x.prop === r.prop);
    let value = r.value;
    if (!p) {
      const m = c.implementations.flatMap((i) => i.maps).find((x) => x.as.prop === r.prop && (x.as.value == null || x.as.value === r.value));
      if (m) { p = c.api.find((x) => x.prop === m.prop); value = m.value ?? 'true'; }
    }
    if (!p) {
      // A prop the named implementation has and the spec drops: what already stands.
      const impl = c.implementations.find((i) => i.kind === 'component' && bare(i.name) === bare(name));
      const own = impl && (inv.react?.components || []).find((x) => x.name === bare(impl.name) && x.file === impl.file);
      if (own?.props.some((x) => x.name === r.prop)) return { verdict: 'как есть', component: c.id, why: `${code(`${own.name} ${r.prop}`)} — так в коде (${own.file}), в спеке ${c.name} этого пропа нет: ${KEEP} (расширение ${c.name})` };
      return { verdict: 'расширение', component: c.id, why: `у ${c.name} нет пропа ${code(r.prop)} (в API: ${c.api.map((x) => x.prop).join(', ')})`, need: [`${c.id}--${r.prop}`], kind: `вариант ${c.id}` };
    }
    if (p.values && !p.bool && !p.values.includes(value)) {
      const m = c.implementations.flatMap((i) => i.maps).find((x) => x.prop === p.prop && (x.as.value === value || x.as.token === value));
      if (m?.value) value = m.value;
      else return { verdict: 'расширение', component: c.id, why: `у ${c.name} нет ${code(`${p.prop}="${value}"`)} (в спеке: ${p.values.join(', ')})`, need: [`${c.id}--${value}`], kind: `вариант ${c.id}` };
    }
    asked.push({ prop: p.prop, value: p.bool ? asBool(value) : p.values ? value : r.value, valued: !!p.values && !p.bool, bool: !!p.bool });
  }
  // Modifiers of a class family are values too (`g-btn--lg` → size="l").
  const family = c.implementations.find((i) => i.base && classes.includes(i.base));
  for (const k of classes.filter((x) => family && x !== family.base)) {
    const m = family.maps.find((x) => x.as.cls === k);
    if (m) { const p = c.api.find((x) => x.prop === m.prop); asked.push({ prop: m.prop, value: m.value ?? 'true', valued: !!p?.values && !p?.bool, bool: !!p?.bool }); }
    else if (k.startsWith(family.base)) return { verdict: 'расширение', component: c.id, why: `${code('.' + k)} — не значение ${c.name} в спеке`, need: [`${c.id}--${k.slice(family.base.length).replace(/^-+/, '')}`], kind: `вариант ${c.id}` };
  }
  const jsxOf = (tag, list) => `<${tag}${list.map((x) => (x.bool ? (x.value === 'false' ? ` ${x.prop}={false}` : ` ${x.prop}`) : ` ${x.prop}="${x.value}"`)).join('')}>`;
  // In the kit: the component has every requested prop and value.
  const kit = c.kit && !c.kit.error ? c.kit : null;
  const lacks = kit ? asked.filter((x) => {
    const k = kit.props[x.prop];
    if (!k) return !(kit.native || []).includes(x.prop);
    return x.valued && k.values && !k.values.includes(x.value);
  }) : [];
  if (kit && !lacks.length) return { verdict: 'в ките', component: c.id, jsx: jsxOf(kit.name, asked), why: `${jsxOf(kit.name, asked)} из ${kit.file}` };
  // In the spec: the most used implementation that has the values stands in meanwhile.
  const impls = c.implementations.filter((i) => i.kind !== 'raw' && !i.kit);
  const spell = (i, x) => i.maps.find((m) => m.prop === x.prop && (m.value === (x.bool ? null : x.value) || (x.bool && m.value == null)));
  // The implementation asked for by name stands there already: it stays when it has the values.
  const named = (i) => [i.name, bare(i.name), i.base].filter(Boolean).some((x) => x.toLowerCase() === name.toLowerCase());
  const ranked = impls.map((i) => ({ i, covered: asked.filter((x) => !(x.valued || x.bool) || spell(i, x)) })).sort((p, q) => q.covered.length - p.covered.length || named(q.i) - named(p.i) || q.i.uses - p.i.uses);
  const why = kit ? `в ките ${kit.name} пока нет ${lacks.map((x) => code(x.valued ? `${x.prop}="${x.value}"` : x.prop)).join(', ')}` : `${c.name} в ките ещё нет`;
  if (!ranked.length) return { verdict: 'в спеке', component: c.id, why: `${why}; реализаций, чтобы поставить временно, нет — скажи разработчику` };
  const best = ranked[0];
  let meanwhile;
  if (best.i.kind === 'class') {
    const cls = [best.i.base, ...best.covered.filter((x) => x.valued || (x.bool && x.value === 'true')).map((x) => spell(best.i, x).as.cls)];
    const rest = best.covered.filter((x) => !(x.valued || x.bool) && x.prop !== 'className');
    meanwhile = `<${best.i.tag} className="${cls.join(' ')}"${rest.map((x) => ` ${x.prop}="${x.value}"`).join('')}>`;
  } else {
    meanwhile = jsxOf(bare(best.i.name), best.covered.map((x) => { const s = (x.valued || x.bool) && spell(best.i, x); return s ? { prop: s.as.prop, value: s.as.value ?? x.value, bool: s.as.value == null } : x; }));
  }
  const missing = asked.filter((x) => !best.covered.includes(x));
  return {
    verdict: 'в спеке', component: c.id, jsx: jsxOf(c.kit?.name || c.name.split(/\s+/).map((w) => w[0].toUpperCase() + w.slice(1)).join(''), asked), meanwhile,
    why: `${why}; пока ${meanwhile} (${best.i.name}, ${places(best.i.uses)})${missing.length ? `, без ${missing.map((x) => code(`${x.prop}="${x.value}"`)).join(', ')} — его нет ни у одной реализации` : ''} — временно, скажи разработчику`,
  };
}

// A composite the product already has: build by its canon.
export function patternVerdict(q, { lib, dir }) {
  const n = String(q || '').toLowerCase();
  const hits = (lib.composites || []).filter((c) => c.id === n || c.type === n || String(c.name).toLowerCase() === n);
  if (!hits.length) return { verdict: null, why: `составного «${q}» в библиотеке нет: собери из атомов, раскладка — CSS фичи` };
  return {
    verdict: 'закономерность', hits,
    why: hits.map((c) => `${c.name} (${c.id}): ${places(c.instances.length)} — собери по «Канону» ${c.md}`).join('; '),
    canon: hits.map((c) => { let t = ''; try { t = fs.readFileSync(path.join(dir, c.md), 'utf8'); } catch {} return { id: c.id, canon: (section(t, 'Канон') || '').replace(/<!--[\s\S]*?-->/g, '').trim(), instances: c.instances }; }),
  };
}

const section = (body, title) => (new RegExp(`^## ${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm').exec(body) || [])[1] ?? null;
const cells = (l) => l.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((x) => x.trim());

function frontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  const data = {};
  if (!m) return { data, body: text };
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([\w-]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const v = kv[2].trim();
    data[kv[1]] = /^\[.*\]$/.test(v) ? v.slice(1, -1).split(',').map((x) => x.trim()).filter(Boolean) : v;
  }
  return { data, body: text.slice(m[0].length) };
}

// Problems of one gap report, each { msg, fix }.
export function checkRequest(file, L) {
  const text = fs.readFileSync(file, 'utf8');
  const { data, body } = frontmatter(text);
  const out = [];
  const E = (rule, msg, fix) => out.push({ msg, fix, rule });
  const slug = path.basename(file, '.md');
  for (const k of ['title', 'feature', 'status', 'date', 'needs']) if (!data[k] || (Array.isArray(data[k]) && !data[k].length && k !== 'needs')) E('gap.front', `нет поля «${k}»`, 'шапка по шаблону references/gap-report.md');
  if (data.feature && data.feature !== slug) E('gap.front', `feature «${data.feature}», а файл ${slug}.md`, 'feature = имя файла');
  if (data.status && !['open', 'closed'].includes(data.status)) E('gap.front', `status «${data.status}»`, 'open или closed');
  if (data.date && !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) E('gap.front', `date «${data.date}» не ГГГГ-ММ-ДД`, 'дата открытия запроса');
  if (data.status === 'closed' && !/^Закрыто: /m.test(body)) E('gap.front', 'закрыт без строки «Закрыто: …»', 'в конце: Закрыто: [компонент](../atoms/id.md), дата');
  const needs = Array.isArray(data.needs) ? data.needs : [];
  for (const t of ['Задача', 'Что собрано из библиотеки']) if (section(body, t) == null) E('gap.sections', `нет раздела «${t}»`, 'разделы по шаблону references/gap-report.md');

  // The table: one row per job, with a verdict the library agrees with.
  const rows = (section(body, 'Что собрано из библиотеки') || '').split('\n').filter((l) => /^\s*\|/.test(l));
  const head = rows.length ? cells(rows[0]) : [];
  if (rows.length && head.join(' | ') !== 'Что нужно на экране | Вердикт | Чем сделано') E('gap.table', `колонки таблицы: ${head.join(' | ')}`, 'Что нужно на экране | Вердикт | Чем сделано');
  const gapRows = [];
  const kitMode = L.lib.mode === 'kit';
  if (kitMode) for (const r of rows.slice(2)) {
    const [job, v, how = ''] = cells(r);
    const said = String(v || '').replace(/\*/g, '').trim().toLowerCase();
    if (!KIT_VERDICTS.includes(said)) { E('gap.kit-table', `«${job}»: вердикт «${v}» не из списка`, `один из: ${KIT_VERDICTS.join(', ')}`); continue; }
    const ticks = [...how.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
    const jsx = ticks.filter((x) => x.startsWith('<'));
    if (said === 'раскладка') continue;
    if (said === 'закономерность') {
      const ids = ticks.filter((x) => !x.startsWith('<'));
      if (!ids.length) E('gap.kit-table', `«${job}»: закономерность без id составного`, 'id в обратных кавычках: `confirm-dialog`');
      for (const id of ids) if (!patternVerdict(id, L).verdict) E('gap.kit-table', `«${job}»: составного ${id} в библиотеке нет`, 'node compose.mjs pattern <тип>');
      continue;
    }
    if (GAP.has(said)) {
      gapRows.push(job);
      if (!needs.some((n) => how.includes(n))) E('gap.kit-table', `«${job}»: ${said}, но в «Чем сделано» нет пробела из needs`, `назови его: ${needs.join(', ') || '(needs пуст)'} — и что стоит временно`);
      if (said !== 'токен' && !jsx.length && !NOTHING.test(how)) E('gap.kit-table', `«${job}»: ${said}, но что стоит временно — не названо JSX в обратных кавычках`, 'временно `<Атом проп="…">` из спеки — или «временно ничего»');
      for (const x of jsx) {
        const got = kitVerdict([x], L);
        if (got.verdict === 'как есть') E('gap.existing', `«${job}»: временно ${x} — как есть (${got.why})`, 'то, что уже стоит на экране и задача не меняет, — не пробел: строка «как есть» без запроса; на месте пробела — атом из спеки');
        else if (!['в ките', 'в спеке'].includes(got.verdict)) E('gap.kit-table', `«${job}»: временно ${x} — ${got.verdict || 'нельзя'} (${got.why})`, 'временно ставится то, что в спеке есть: node compose.mjs verdict <атом> …');
      }
      continue;
    }
    if (!jsx.length) { E(said === 'как есть' ? 'gap.existing' : 'gap.kit-table', `«${job}»: ${said} без JSX`, 'JSX в обратных кавычках: `<Button variant="secondary">`'); continue; }
    for (const x of jsx) {
      const got = kitVerdict([x], L);
      if (got.verdict !== said) E([said, got.verdict].includes('как есть') ? 'gap.existing' : 'gap.kit-table', `«${job}»: ${x} — ${said}, а по библиотеке — ${got.verdict || 'нельзя'} (${got.why})`, `node compose.mjs verdict ${x}`);
    }
  }
  if (!kitMode) for (const r of rows.slice(2)) {
    const [job, v, how = ''] = cells(r);
    const said = String(v || '').replace(/\*/g, '').trim().toLowerCase();
    if (!VERDICTS.includes(said)) { E('gap.table', `«${job}»: вердикт «${v}» не из списка`, `один из: ${VERDICTS.join(', ')}`); continue; }
    const used = [...how.matchAll(/`([^`]+)`/g)].map((m) => m[1]).filter((x) => /^[a-z][\w-]*( [\w-]+)*$/i.test(x) && !x.startsWith('--'));
    if (said === 'раскладка') continue;
    if (GAP.has(said)) {
      gapRows.push(job);
      if (!needs.some((n) => how.includes(n))) E('gap.table', `«${job}»: ${said}, но в «Чем сделано» нет пробела из needs`, `назови его: ${needs.join(', ') || '(needs пуст)'} — и что стоит временно`);
      // What stands in the gap meanwhile is itself from the library, as the product has it.
      const standIn = used.filter((x) => !needs.includes(x));
      if (said !== 'токен' && !standIn.length && !NOTHING.test(how)) E('gap.table', `«${job}»: ${said}, но что стоит временно — не названо классами в обратных кавычках`, 'временно `классы` из библиотеки — или «временно ничего»');
      for (const u of standIn) {
        const got = verdict([u], L);
        if (got.verdict === 'как есть') E('gap.existing', `«${job}»: временно \`${u}\` — как есть (${got.why})`, 'то, что уже стоит на экране и задача не меняет, — не пробел: строка «как есть» без запроса; на месте пробела — компонент библиотеки');
        else if (!['есть', 'вариант', 'возможность'].includes(got.verdict)) E('gap.table', `«${job}»: временно \`${u}\` — ${got.verdict || 'нельзя'} (${got.why})`, 'временно ставится то, что в библиотеке есть: node compose.mjs verdict <классы>');
      }
      continue;
    }
    if (!used.length) { E(said === 'как есть' ? 'gap.existing' : 'gap.table', `«${job}»: ${said} без классов`, 'классы в обратных кавычках: `gm-btn gm-btn--secondary`'); continue; }
    for (const u of used) {
      const got = verdict([u], L);
      if (got.verdict !== said) E([said, got.verdict].includes('как есть') ? 'gap.existing' : 'gap.table', `«${job}»: \`${u}\` — ${said}, а по библиотеке — ${got.verdict || 'нельзя'} (${got.why})`, `node compose.mjs verdict ${u}`);
    }
  }
  if (needs.length && !gapRows.length) E('gap.table', 'needs не пуст, а в таблице нет ни одного пробела', 'строка с вердиктом расширение / нет / токен для каждого');

  // One section per need, by template.
  const heads = [...body.matchAll(/^## (.+?) — (.+?)\s*$/gm)].map((m) => ({ id: m[1].trim(), kind: m[2].trim() }));
  const comps = new Map(L.lib.components.map((c) => [c.id, c]));
  const tokens = new Set((L.inv.tokens || []).map((t) => t.name));
  for (const n of needs) {
    const h = heads.find((x) => x.id === n);
    if (!h) { E('gap.needs', `нет раздела «${n} — …»`, 'раздел на каждый пробел: «## <id> — новый компонент | вариант <компонент> | состояние <компонент> | токен»'); continue; }
    if (!KINDS.test(h.kind)) { E('gap.needs', `«${n} — ${h.kind}»: вид пробела не из шаблона`, 'новый компонент | вариант <id> | состояние <id> | токен'); continue; }
    const text2 = section(body, `${n} — ${h.kind}`) || '';
    const fields = h.kind === 'токен' ? TOKEN_FIELDS : NEED_FIELDS;
    for (const f of fields) if (!new RegExp(`\\*\\*${f}:\\*\\*`).test(text2)) E('gap.needs', `«${n}»: нет пункта «${f}»`, `- **${f}:** …`);
    if (h.kind !== 'токен' && /\*\*Ближайшее в библиотеке:\*\*/.test(text2) && !/\]\(\.\.\/atoms\/[\w.-]+\.md\)/.test(text2)) E('gap.needs', `«${n}»: «Ближайшее в библиотеке» без ссылки на компонент`, 'ссылка вида [Tag](../atoms/gm-tag.md) и почему не подходит');
    if (h.kind === 'новый компонент' && (comps.has(n) || L.lib.components.some((c) => c.modifiers.includes(n)))) E('gap.ids', `«${n}» уже есть в библиотеке`, 'это не пробел: возьми его');
    const m = /^(вариант|состояние) ([\w-]+)$/.exec(h.kind);
    if (m) {
      const c = comps.get(m[2]);
      if (!c) E('gap.ids', `«${n}»: компонента ${m[2]} нет`, 'id компонента из CATALOG.md');
      else if (kitMode) {
        // An atom: `<atom id>--<value>`; a value or a prop the API has is not a gap.
        const what = n.startsWith(`${c.id}--`) ? n.slice(c.id.length + 2) : null;
        if (what == null) E('gap.ids', `«${n}» — не значение ${m[2]}`, `id вида: ${c.id}--<значение>`);
        else if ((c.api || []).some((p) => p.prop === what || (p.values || []).includes(what))) E('gap.ids', `«${n}» у ${c.name} уже есть в спеке`, 'это не пробел: node compose.mjs verdict');
      }
      else if (c.modifiers.includes(n)) E('gap.ids', `«${n}» у ${c.name} уже есть`, 'это не пробел: возьми его');
      else if (!n.startsWith(c.units.map(rootOf)[0] + '--')) E('gap.ids', `«${n}» — не модификатор ${m[2]}`, `id вида: ${c.units.map(rootOf)[0]}--<что>`);
    }
    if (h.kind === 'иконка' && (L.inv.icons || []).some((i) => i.class === n)) E('gap.ids', `иконка ${n} уже есть в наборе`, 'это не пробел');
    if (h.kind === 'токен') {
      if (!n.startsWith('--')) E('gap.ids', `«${n}»: токен — имя переменной`, '--<имя>');
      else if (tokens.has(n)) E('gap.ids', `токен ${n} уже есть`, 'это не пробел');
    }
  }
  for (const h of heads) if (!needs.includes(h.id) && KINDS.test(h.kind)) E('gap.needs', `раздел «${h.id}» не в needs`, 'добавь в needs или убери раздел');
  return out;
}

export function findLibrary({ dir, root } = {}) {
  if (dir) return path.resolve(dir);
  for (let d = path.resolve(root || process.cwd()); ; d = path.dirname(d)) {
    const cand = path.join(d, 'docs', 'design-system');
    if (fs.existsSync(path.join(cand, 'components.json'))) return cand;
    if (path.dirname(d) === d) return null;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (name) => { const i = args.indexOf('--' + name); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
  const dir = findLibrary({ dir: opt('dir'), root: opt('root') });
  const [cmd, ...rest] = args;
  const HELP = [
    'Команды:',
    '  verdict <классы>                        вердикт для классов одного элемента (HTML/CSS)',
    '  verdict <атом> [проп=значение …]        вердикт атома кита (React): button size=l, "<Tab fullWidth={false}>"',
    '  pattern <тип|id>                        закономерность: составное по «Канону» (React)',
    '  check <slug|файл>                       запрос requests/<slug>.md против шаблона и библиотеки',
    '  [--dir <библиотека>] [--root <проект>]  по умолчанию <проект>/docs/design-system',
  ].join('\n');
  if (!['verdict', 'pattern', 'check'].includes(cmd)) { console.log(HELP); process.exit(2); }
  if (!dir) { console.error('Библиотека не найдена (нет docs/design-system/components.json). Сначала ui-catalog build, или укажи --dir <библиотека>.'); process.exit(2); }
  const L = loadLibrary(dir);
  const kitMode = L.lib.mode === 'kit';
  if (cmd === 'pattern') {
    const v = patternVerdict(rest[0], L);
    console.log(`${v.verdict || 'нет закономерности'} — ${v.why}`);
    for (const c of v.canon || []) console.log(`\n${c.id} — канон:\n${c.canon || '—'}\nМеста: ${c.instances.join(', ')}`);
  } else if (cmd === 'verdict' && kitMode) {
    const v = kitVerdict(rest, L);
    console.log(`${v.verdict || 'нельзя'} — ${v.why}`);
    if (GAP.has(v.verdict)) console.log(`→ пробел: запрос (${v.kind}${v.need ? `: ${v.need.join(', ')}` : ''}), на месте — ближайшее из библиотеки с пометкой ui-compose: временно`);
    process.exitCode = v.verdict ? 0 : 1;
  } else if (cmd === 'verdict') {
    const v = verdict(rest, L);
    console.log(`${v.verdict || 'нельзя'} — ${v.why}`);
    if (GAP.has(v.verdict)) console.log(`→ пробел: запрос (${v.kind}${v.need ? `: ${v.need.join(', ')}` : ''}), на месте — ближайшее из библиотеки с пометкой ui-compose: временно`);
    process.exitCode = v.verdict ? 0 : 1;
  } else if (cmd === 'check') {
    const target = rest[0] && (rest[0].endsWith('.md') ? path.resolve(rest[0]) : path.join(dir, 'requests', `${rest[0]}.md`));
    if (!target || !fs.existsSync(target)) { console.error(`нет файла ${target || '(не указан)'}`); process.exit(2); }
    const problems = checkRequest(target, L);
    if (!problems.length) console.log(`${path.basename(target)}: по шаблону, вердикты сходятся с библиотекой`);
    for (const p of problems) console.log(`  ${p.msg} [${p.rule}]\n    → ${p.fix}`);
    process.exitCode = problems.length ? 1 : 0;
  }
}
