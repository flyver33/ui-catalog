// When one class family is two components: a static base and a modifier that exists
// only on elements a person can press (`gm-tag` on <span>, `gm-tag gm-tag--blue` on a
// <button> «+N»). Then the modifier is its own component (Tag → Chip), decided here from
// the code, not by the agent.
//
//   splitModifiers(u)        modifiers of a unit that make a separate component
//   parseUnits(entries)      front matter `units` → { units: roots, slice: { root: { only } } }
//   sliceUnit(u, slice)      the unit as one component sees it: only its usages and modifiers
//   unitsOf(c, unitsById)    a component's units, sliced
//
// A modifier splits off when, at once:
//   - it sits only on interactive elements (button, a[href]…), at least once;
//   - the base class without it sits mostly on static ones (span, div);
//   - at rest it changes how the thing looks (colour, background, border — itself or a part);
//   - it is not a state class (`--active`, `--selected`): those are states of one element.
import { stateOfClass } from './examples.mjs';

const APPEARANCE = /^(color|background(-color|-image)?|border(-color)?|border-(top|right|bottom|left)(-color)?|box-shadow|outline(-color)?|fill|stroke)$/;
const PSEUDO = /:(hover|active|focus)/;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isMarkup = (x) => x.kind === 'markup' || (x.kind === 'script' && x.tag);
const interactive = (x) => String(x.interactive);

// Static types and their clickable counterpart (references/types.md).
export const SPLIT_TYPES = { tag: 'chip' };

export const isModifierEntry = (s) => /^[\w-]+--[\w-]+$/.test(s) && !s.split('--')[0].includes('__');
export const rootOfEntry = (s) => (isModifierEntry(s) ? s.split('--')[0] : s);

function changesLook(cls, u) {
  const re = new RegExp(`\\.${esc(cls)}(?![\\w-])`);
  for (const r of u.rules || []) for (const sel of String(r.selector).split(',')) {
    if (!re.test(sel)) continue;
    const at = sel.search(re);
    const own = sel.slice(at).split(/[\s>+~]/)[0];
    if (PSEUDO.test(own)) continue;
    if ((r.decls || []).some((d) => APPEARANCE.test(d.prop))) return true;
  }
  return false;
}

export function splitModifiers(u) {
  if (!u?.library) return [];
  const roots = u.usages.filter((x) => !x.part && isMarkup(x));
  const cand = Object.keys(u.modifiers).filter((m) => {
    if (stateOfClass(m)) return false;
    const on = roots.filter((x) => (x.classes || []).includes(m));
    return on.length > 0 && on.every((x) => interactive(x) === 'true') && changesLook(m, u);
  });
  if (!cand.length) return [];
  const base = roots.filter((x) => !cand.some((m) => (x.classes || []).includes(m)));
  const stat = base.filter((x) => interactive(x) === 'false').length;
  const act = base.filter((x) => interactive(x) !== 'false').length;
  return stat > 0 && stat >= act ? cand.sort() : [];
}

// `units: [gm-tag--blue]` → roots ['gm-tag'], slice { 'gm-tag': { only: ['gm-tag--blue'] } }.
export function parseUnits(entries) {
  const units = [], slice = {};
  for (const e of entries.map(String)) {
    const root = rootOfEntry(e);
    if (!units.includes(root)) units.push(root);
    if (e !== root) (slice[root] ||= { only: [] }).only.push(e);
  }
  return { units, slice };
}

// After every component is read: a base component loses the modifiers others own.
export function linkSlices(components) {
  const owned = new Map();
  for (const c of components) for (const [root, s] of Object.entries(c.slice)) if (s.only) for (const m of s.only) owned.set(m, { root, id: c.id });
  for (const c of components) for (const root of c.units) {
    if (c.slice[root]?.only) continue;
    const except = [...owned].filter(([, o]) => o.root === root && o.id !== c.id).map(([m]) => m);
    if (except.length) c.slice[root] = { except };
  }
}

export function sliceUnit(u, s) {
  if (!u || !s) return u;
  const has = (classes) => (s.only ? s.only.some((m) => classes.includes(m)) : !s.except.some((m) => classes.includes(m)));
  // Parts (`__title`) stay with the base: a part's usage cannot tell which root it sits in.
  const usages = u.usages.filter((x) => (x.part ? !s.only : has(x.classes || [])));
  const keep = (m) => (s.only ? s.only.includes(m) || usages.some((x) => (x.classes || []).includes(m)) : !s.except.includes(m));
  const modifiers = Object.fromEntries(Object.entries(u.modifiers).filter(([m]) => keep(m)));
  // A rule belongs to the slice by the modifiers it names: `.gm-tag--blue …` is the Chip's.
  const names = (sel) => (s.only || s.except).filter((m) => new RegExp(`\\.${m.replace(/[-]/g, '\\-')}(?![\\w-])`).test(sel));
  const ruleIsMine = (sel) => (s.only ? names(sel).length > 0 : names(sel).length === 0);
  const mine = (u.rules || []).filter((r) => ruleIsMine(String(r.selector)));
  const hardcoded = (u.hardcoded || []).filter((h) => mine.some((r) => (r.decls || []).some((d) => d.value.replace(/\s+/g, '').includes(h.replace(/\s+/g, '')))));
  const overrides = (u.overrides || []).filter((o) => ruleIsMine(String(o.selector || '')));
  return {
    ...u, usages, modifiers, hardcoded, overrides,
    modifierElements: Object.fromEntries(Object.entries(u.modifierElements || {}).filter(([m]) => keep(m))),
    representative: (u.representative || []).filter((r) => has(r.classes || [])),
    snippets: (u.snippets || []).filter((x) => has(x.combo || [])),
    usageCount: usages.length, fileCount: new Set(usages.map((x) => x.file)).size,
    // Every part usage, for «is this part used at all» (lib/possible.mjs).
    partUsages: u.usages.filter((x) => x.part),
    slice: s,
  };
}

export const unitsOf = (c, unitsById) => c.units.map((id) => sliceUnit(unitsById.get(id), c.slice?.[id])).filter(Boolean);
