// What the CSS allows and what the product actually uses — for agents only.
// The gallery shows only what the code has; CATALOG.md and components.json also say
// what an agent may assemble from the same classes, marked «в продукте нет».
//
//   possibilities(units, { ignore, realKeys })  → { combos, possible }
//     combos    root class sets found in real markup: [{ classes, count, tags }]
//     possible  [{ classes, kind }] — kind: 'modifier' (defined, never used),
//               'element' (a part never used), 'combination' (two used modifiers on
//               different axes that the markup never puts together, on the same element)
//
// Axes decide what combines: a variant excludes another variant, a size another size.
// State classes (`--active`, `--disabled`) are toggled, not combined; icon glyphs
// (`ignore`) are content. A combination is offered only when each modifier has a rule
// of its own (not only `.x--a.x--b`) and both sit on the same kind of element.
import { classifyModifier, VARIANT_AXES, customAxis, expectedVariantName } from './variants.mjs';
import { stateOfClass } from './examples.mjs';

const isMarkup = (x) => x.kind === 'markup' || (x.kind === 'script' && x.tag);
const rootMods = (u, classes) => (classes || []).filter((c) => c.startsWith(u.id + '--'));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The axis a modifier belongs to; two modifiers on one axis never go together.
function axisOf(cls, u, realKeys) {
  const k = classifyModifier(cls);
  if (k?.axis === 'style') return /Filled|Outlined/.test(expectedVariantName(cls, realKeys) || '') ? 'style' : 'variant';
  if (k) return VARIANT_AXES.includes(k.axis) ? 'variant' : k.axis;
  return customAxis(cls, u) === 'variant' ? 'variant' : cls;
}

// A rule styles the modifier without requiring another modifier of the same unit.
function standalone(cls, u) {
  const re = new RegExp(`\\.${esc(cls)}(?![\\w-])`);
  for (const r of u.rules || []) for (const sel of String(r.selector).split(',')) {
    const compound = sel.trim().split(/[\s>+~]+/).find((part) => re.test(part));
    if (!compound) continue;
    const others = (compound.match(/\.[\w-]+/g) || []).map((x) => x.slice(1)).filter((x) => x !== cls && x.startsWith(u.id + '--'));
    if (!others.length) return true;
  }
  return false;
}

export function possibilities(units, { ignore = new Set() } = {}) {
  const combos = [], possible = [];
  for (const u of units) {
    const roots = u.usages.filter((x) => !x.part && isMarkup(x));
    const byKey = new Map();
    for (const x of roots) {
      const mods = rootMods(u, x.classes).filter((m) => !ignore.has(m)).sort();
      const key = mods.join(' ');
      const e = byKey.get(key) || byKey.set(key, { mods, count: 0, tags: new Set() }).get(key);
      e.count++;
      if (x.tag) e.tags.add(String(x.tag).toLowerCase());
    }
    const realKeys = [...byKey.keys()];
    for (const e of [...byKey.values()].sort((a, b) => b.count - a.count || a.mods.length - b.mods.length)) {
      combos.push({ classes: [u.id, ...e.mods].join(' '), count: e.count, tags: [...e.tags].sort() });
    }

    // Defined, never used anywhere — markup, scripts, classList.
    const mentioned = new Set([...u.usages, ...(u.partUsages || [])].flatMap((x) => x.classes || []));
    for (const m of Object.keys(u.modifiers)) if (!ignore.has(m) && !mentioned.has(m)) possible.push({ classes: `${u.id} ${m}`, kind: 'modifier' });
    for (const el of Object.keys(u.elements)) if (!mentioned.has(el)) possible.push({ classes: el, kind: 'element' });

    // Pairs of used modifiers on different axes that never meet in the markup.
    const tagsOf = (m) => new Set(roots.filter((x) => x.classes.includes(m) && x.tag).map((x) => String(x.tag).toLowerCase()));
    const used = [...new Set(roots.flatMap((x) => rootMods(u, x.classes)))]
      .filter((m) => !ignore.has(m) && !stateOfClass(m) && standalone(m, u)).sort();
    const together = (a, b) => [...byKey.values()].some((e) => e.mods.includes(a) && e.mods.includes(b));
    for (let i = 0; i < used.length; i++) for (let j = i + 1; j < used.length; j++) {
      const [a, b] = [used[i], used[j]];
      if (axisOf(a, u, realKeys) === axisOf(b, u, realKeys) || together(a, b)) continue;
      const ta = tagsOf(a), shared = [...tagsOf(b)].filter((t) => ta.has(t));
      if (!shared.length) continue;
      possible.push({ classes: [u.id, a, b].join(' '), kind: 'combination', tags: shared.sort() });
    }
  }
  return { combos, possible };
}

export const POSSIBLE_RU = { modifier: 'модификатор', element: 'часть', combination: 'сочетание' };
