// What came from the code and is not settled: an atom's items on review, their marks and
// to whom each question goes. The scripts count every mark; nothing here is the agent's.
import path from 'node:path';
import { familyMatcher } from './screens.mjs';

// Props that mean one thing under several names (the first is the meaning's name).
export const SYNONYMS = [
  ['ошибка', /^(error|invalid|isInvalid|hasError|isError|showError|withError)$/],
  ['загрузка', /^(loading|isLoading|pending|isPending|busy|isBusy)$/],
  ['недоступна', /^(disabled|isDisabled)$/],
  ['открыт', /^(open|isOpen|opened|expanded|isExpanded)$/],
  ['выбран', /^(selected|isSelected|active|isActive|checked|isChecked)$/],
];

// A prop that restyles from outside: not the component's own `className` / `style`.
const HATCH = /^(?!className$|style$)\w+(ClassName|ClassNames|Style|Styles)$/;
export const TO_PRODUCT = 'это про продукт — передать продукту';

const placesRu = (n) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'место' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'места' : 'мест'}`;
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-|-$/g, '');
const bare = (name) => String(name).replace(/ \(.*\)$/, '');
const code = (s) => '`' + s + '`';

// A question's addressee: what its answer changes.
export function audienceOf(q) {
  if (['same-look', 'only-one', 'default'].includes(q.kind)) return 'product';
  if (q.kind === 'prop') {
    if (q.flags.some((f) => ['лазейка', 'синоним'].includes(f.mark))) return 'dev';
    // `as` picks the element: code, whatever its values.
    return q.seen && q.prop !== 'as' ? 'product' : 'dev';
  }
  return 'dev';
}

// Few places, in one or two files: max(5, 10% of `total`).
const rare = (n, files, total) => n < Math.max(5, total * 0.1) && files <= 2;

// The marks of one prop across an atom's implementations.
export function flagsOf(item, ctx) {
  const out = [];
  if (item.kind === 'prop') {
    if (HATCH.test(item.prop)) out.push({ mark: 'лазейка', why: 'перекрашивает компонент снаружи' });
    const syn = ctx.synonymOf?.(item.prop);
    if (syn) out.push({ mark: 'синоним', why: `то же, что ${code(syn)}`, to: syn });
    // Rare against its own components' uses, when they are used enough to tell.
    if (item.ownUses >= 10 && rare(item.places, item.files.length, item.ownUses)) out.push({ mark: 'редкое', why: `${placesRu(item.places)} в ${item.files.length === 1 ? 'одном файле' : 'двух файлах'}` });
  } else if (item.kind === 'impl') {
    // Only against what its own family of screens uses instead: another family's
    // implementation is another look, not the same thing twice.
    if (!item.shared) return out;
    const fam = item.family ? ` в «${item.family}»` : '';
    if (item.local) out.push({ mark: 'дубль', why: `живёт только в ${code(item.dir + '/')}, а${fam} то же делает ${code(bare(item.shared.name))}` });
    if (rare(item.places, item.files.length, item.famUses)) out.push({ mark: 'редкое', why: `${placesRu(item.places)} в ${item.files.length === 1 ? 'одном файле' : 'двух файлах'}, а${fam} ${code(bare(item.shared.name))} — ${placesRu(item.sharedUses)}` });
  }
  return out;
}

// The review items of an atom and what nobody uses.
// `settled` — prop names already in the API; `isNative(impl, prop)` — an attribute of the
// element the implementation's props extend; `axisProps` — props that are axes.
export function reviewOf(a, { calls, classUses, settled, isNative, axisProps, ownProps, families = [] }) {
  const items = [];
  const unused = { props: [], impls: [] };
  const callsOf = new Map(a.impls.filter((i) => i.kind === 'component').map((i) => [i.key, calls.filter((x) => x.component === i.key)]));

  // Implementations: on review only with a mark; one nobody uses is unused.
  const fam = familyMatcher(families);
  // A wrapper's uses are uses of what it renders — the nearest implementation of that name.
  const near = (x, y) => { const p = String(x || '').split('/'), q = String(y || '').split('/'); let n = 0; while (n < p.length && p[n] === q[n]) n++; return n; };
  const wrapped = new Map();
  for (const w of a.wrappers || []) {
    const target = a.impls.filter((i) => i.kind === 'component' && (w.renders || []).includes(bare(i.name))).sort((p, q) => near(q.file, w.file) - near(p.file, w.file))[0];
    if (target) (wrapped.get(target.key) || wrapped.set(target.key, []).get(target.key)).push(...calls.filter((x) => x.component === w.key).map((x) => x.file));
  }
  const usesFiles = (i) => [...(i.kind === 'class' ? classUses(i) : (callsOf.get(i.key) || []).map((x) => x.file)), ...(wrapped.get(i.key) || [])];
  const dirOf = (f) => path.posix.dirname(String(f || ''));
  const facts = a.impls.filter((i) => i.kind !== 'raw').map((i) => {
    const files = usesFiles(i);
    const dir = dirOf(i.file);
    const local = !i.kit && i.kind === 'component' && files.length > 0 && files.every((f) => f === i.file || f.startsWith(dir + '/'));
    const byFam = new Map();
    for (const f of files) { const n = fam(f) || ''; byFam.set(n, (byFam.get(n) || 0) + 1); }
    const family = [...byFam].sort((x, y) => y[1] - x[1])[0]?.[0] ?? '';
    return { i, files, uniq: [...new Set(files)], dir, local, family };
  });
  const inFam = (x, family) => x.files.filter((f) => (fam(f) || '') === family);
  const marked = new Set();
  for (const f of facts) {
    if (f.i.kit) continue;
    if (!f.files.length) { unused.impls.push({ impl: f.i.name }); continue; }
    // What the family uses instead: used at least twice as much there, in three files or more.
    const mine = inFam(f, f.family).length;
    const alt = facts.filter((o) => o !== f && !o.local && o.files.length)
      .map((o) => ({ o, n: inFam(o, f.family).length, files: new Set(inFam(o, f.family)).size }))
      .filter((x) => x.n >= 2 * mine && x.files >= 3).sort((x, y) => y.n - x.n)[0] || null;
    const item = { kind: 'impl', impl: f.i.name, implKey: f.i.key, places: f.files.length, files: f.uniq, local: f.local, dir: f.dir, family: f.family, shared: alt?.o.i || null, sharedUses: alt?.n || 0, famUses: mine + (alt?.n || 0) };
    item.flags = flagsOf(item, {});
    if (!item.flags.length) continue;
    marked.add(f.i.key);
    items.push(item);
  }
  // A marked implementation's props are decided with it.
  const comps = a.impls.filter((i) => i.kind === 'component' && !i.kit && !marked.has(i.key));

  // Props: one item per name across the implementations that have it.
  const byName = new Map();
  for (const i of comps) for (const p of i.comp.props) {
    if (settled.has(p.name) || ownProps.has(p.name) || axisProps.has(p.name) || isNative(i, p.name) || /^(aria|data)-/.test(p.name)) continue;
    (byName.get(p.name) || byName.set(p.name, []).get(p.name)).push({ i, p });
  }
  const placesOf = (name, list) => list.flatMap(({ i }) => callsOf.get(i.key).filter((x) => x.props[name] !== undefined));
  // Synonyms: the most passed name of a meaning is its name; the others point at it.
  const passed = new Map([...byName].map(([n, list]) => [n, placesOf(n, list).length]));
  for (const n of settled) passed.set(n, Infinity);
  const synonymOf = (name) => {
    const g = SYNONYMS.find(([, re]) => re.test(name));
    if (!g) return null;
    const names = [...passed].filter(([n, c]) => c > 0 && g[1].test(n)).sort((x, y) => y[1] - x[1]);
    return names.length > 1 && names[0][0] !== name ? names[0][0] : null;
  };
  for (const [name, list] of byName) {
    const sites = placesOf(name, list);
    const spread = list.some(({ i }) => callsOf.get(i.key).some((x) => '...' in x.props));
    if (!sites.length) {
      // Nobody passes it: nothing to lose. Unknown when a call spreads its props.
      if (!spread) unused.props.push({ prop: name, impls: list.map(({ i }) => i.name) });
      continue;
    }
    const p0 = list[0].p;
    const item = {
      kind: 'prop', prop: name, impls: list.map(({ i }) => i.name), places: sites.length,
      files: [...new Set(sites.map((x) => x.file))],
      ownUses: list.reduce((n, { i }) => n + (i.uses || 0), 0),
      // A boolean or a list of values changes what is seen or done; a string or a callback is code.
      seen: list.some(({ p }) => /^boolean\b/.test(p.type || '') || (p.values || []).length > 0),
      type: p0.type || '', values: p0.values || null,
    };
    item.flags = flagsOf(item, { synonymOf });
    items.push(item);
  }

  return { items, unused };
}

// An item as a question: id, titles, facts, options and the recommendation.
export function reviewQuestion(a, item) {
  const marks = item.flags.map((f) => f.mark);
  const why = item.flags.map((f) => `${f.mark} — ${f.why}`).join('; ');
  if (item.kind === 'prop') {
    const syn = item.flags.find((f) => f.to);
    const options = [...(syn ? [`заменить на «${syn.to}»`] : []), 'оставить в ките', 'убрать'];
    const recommend = syn ? `заменить на «${syn.to}»` : marks.length ? 'убрать' : 'оставить в ките';
    return {
      id: `${a.id}.prop.${slug(item.prop)}`, kind: 'prop', prop: item.prop, impls: item.impls, flags: item.flags, places: item.places, files: item.files, seen: item.seen,
      title: `${a.name}: ${code(item.prop)} у ${item.impls.map((n) => code(bare(n))).join(', ')}${marks.length ? ` — ${marks.join(', ')}` : ''}`,
      human: null, facts: [`${item.impls.map((n) => code(bare(n))).join(', ')} ${code(item.prop)}${item.values ? `: ${item.values.join(' | ')}` : item.type ? `: ${item.type}` : ''} — ${placesRu(item.places)}, файлов ${item.files.length}: ${item.files.slice(0, 3).join(', ')}${item.files.length > 3 ? '…' : ''}`],
      hashFacts: ['prop', item.prop, item.impls, marks],
      options, recommend, why: why || 'пометок нет',
    };
  }
  const to = item.shared ? bare(item.shared.name) : null;
  const options = [...(to ? [`заменить на «${to}»`] : []), 'оставить', 'убрать'];
  return {
    id: `${a.id}.impl.${slug(bare(item.impl))}${item.dir ? `.${slug(item.dir.split('/').pop())}` : ''}`, kind: 'impl', impl: item.impl, implKey: item.implKey, flags: item.flags, places: item.places, files: item.files,
    title: `${a.name}: ${code(bare(item.impl))} — ${marks.join(', ')}`,
    human: null, facts: [`${code(bare(item.impl))} — ${placesRu(item.places)}, файлов ${item.files.length}: ${item.files.slice(0, 3).join(', ')}${item.files.length > 3 ? '…' : ''}`],
    hashFacts: ['impl', item.implKey, marks],
    options, recommend: to ? `заменить на «${to}»` : 'убрать', why,
  };
}

// What an answer to an item does: keep it, drop it, or replace it with another.
export function answerEffect(answer) {
  if (!answer) return null;
  const m = /^заменить на «(.+)»$/.exec(answer);
  if (m) return { drop: true, to: m[1] };
  if (/^убрать/.test(answer)) return { drop: true, to: null };
  return { keep: true };
}

// Items in the order people read them: «убрать» and «заменить» first, fewest
// places first; then the rest, most places first.
export function orderItems(list) {
  const drop = (q) => /^(убрать|заменить)/.test(q.recommend || '');
  return [...list].sort((x, y) => drop(y) - drop(x) || (drop(x) ? (x.places ?? 0) - (y.places ?? 0) : (y.places ?? 0) - (x.places ?? 0)) || x.id.localeCompare(y.id));
}
