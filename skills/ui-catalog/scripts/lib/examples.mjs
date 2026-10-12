// What an example shows, read from its markup — so the gallery shows only what the
// code has, and state captions are made by a script, not written by the agent.
//
//   combosIn(html, unitIds)       modifier sets on the component's own elements
//   realCombos(units, opts)       modifier sets that occur in real markup
//   autoLabel(st, ctx)            English caption: «Hover», «Large, Full width», «Current»
//
// «Real» means markup: HTML templates, or markup built in a script string (the line has
// an opening tag). Class names that merely sit on one line of JS are not a combination.
//
// The caption of a static state is generated whenever the markup says what the
// state is (a pinned pseudo-class, a state attribute or class, a size or width
// modifier). `data-label` is for what markup cannot say: content states («With
// form», «Leading icon») and examples taken from a page.
import { classAttributes } from './html.mjs';
import { STATE_SELECTORS } from './types.mjs';
import { classifyModifier, VARIANT_AXES, customAxis } from './variants.mjs';
import { unitsOf } from './split.mjs';
import { iconBaseOf } from './config.mjs';

export const STATE_EN = {
  default: 'Default', hover: 'Hover', active: 'Pressed', 'focus-visible': 'Focus', focus: 'Focus', 'focus-within': 'Focus',
  disabled: 'Disabled', current: 'Current', selected: 'Selected', checked: 'Checked', indeterminate: 'Indeterminate',
  expanded: 'Expanded', 'read-only': 'Read-only', invalid: 'Error', loading: 'Loading', empty: 'Empty', visited: 'Visited',
};
export const INTERACTIVE_PSEUDO = ['hover', 'active', 'focus', 'focus-visible', 'focus-within'];

// Attributes a <template> may carry (ex.attrs). Anything else is made up.
export const TEMPLATE_ATTRS = ['data-preview', 'data-variant', 'data-name', 'data-about', 'data-class', 'data-label',
  'data-state', 'data-width', 'data-height', 'data-pad', 'data-bg', 'data-note'];

const ATTR_STATES = [
  [/\sdisabled(\s|=|>|$)/, 'disabled'], [/\saria-disabled="true"/, 'disabled'], [/\saria-current=/, 'current'],
  [/\saria-selected="true"/, 'selected'], [/\saria-expanded="true"/, 'expanded'], [/\s(checked)(\s|=|>|$)/, 'checked'],
  [/\saria-checked="mixed"/, 'indeterminate'], [/\saria-invalid="true"/, 'invalid'], [/\saria-busy="true"/, 'loading'],
  [/\sreadonly(\s|=|>|$)/, 'read-only'],
];
const CLASS_STATES = Object.entries(STATE_SELECTORS).filter(([s]) => !['hover', 'active', 'focus-visible', 'visited'].includes(s));

const rootOf = (cls) => cls.split(/__|--/)[0] || cls;
const isModifierOf = (cls, unit) => rootOf(cls) === unit && cls.includes('--') && !cls.split('--')[0].includes('__');
export const stateOfClass = (cls) => CLASS_STATES.find(([, res]) => res.some((re) => re.test('.' + cls)))?.[0] || null;

// Same test as the scanner: native controls, a link with href, or an element made
// clickable by role / tabindex / onclick. `unknown` when it cannot be told.
const NATIVE = /^(button|select|input|textarea|summary)$/i;
export function interactivityOf(openTag) {
  const tag = /^<([a-zA-Z][\w-]*)/.exec(openTag || '')?.[1]?.toLowerCase();
  if (!tag) return 'unknown';
  if (NATIVE.test(tag)) return 'true';
  if (tag === 'a') return /\shref\s*=/.test(openTag) ? 'true' : 'unknown';
  if (/\s(role\s*=\s*["']?(button|link|tab|menuitem|option|checkbox|switch)|onclick\s*=|tabindex\s*=)/i.test(openTag)) return 'unknown';
  return 'false';
}
const openTagAt = (html, pos) => { const s = html.lastIndexOf('<', pos); const e = html.indexOf('>', pos); return s >= 0 && e > s ? html.slice(s, e + 1) : ''; };

// [{ unit, mods, interactive, tag }] for every element that carries a unit's root class.
export function combosIn(html, unitIds) {
  const out = [];
  for (const a of classAttributes(html)) {
    const open = openTagAt(html, a.pos);
    for (const unit of unitIds) {
      if (!a.classes.includes(unit)) continue;
      out.push({ unit, mods: a.classes.filter((c) => isModifierOf(c, unit)).sort(), interactive: interactivityOf(open), tag: /^<([a-zA-Z][\w-]*)/.exec(open)?.[1] || null });
    }
  }
  return out;
}

// `ignore`: modifiers that are content, not form (icon glyphs) — left out of keys.
export const comboKey = (mods, ignore = new Set()) => mods.filter((m) => !ignore.has(m)).sort().join(' ');
const isMarkup = (x) => x.kind === 'markup' || (x.kind === 'script' && x.tag);

// unit id → Map(combo key → Set of interactivity seen: 'true' | 'false' | 'unknown').
export function realCombos(units, { ignore = new Set() } = {}) {
  const map = new Map();
  for (const u of units) {
    const keys = new Map();
    for (const x of u.usages) {
      if (x.part || !isMarkup(x)) continue;
      const k = comboKey((x.classes || []).filter((c) => isModifierOf(c, u.id)), ignore);
      (keys.get(k) || keys.set(k, new Set()).get(k)).add(String(x.interactive));
    }
    map.set(u.id, keys);
  }
  return map;
}
// The same classes on the same kind of element: a Tag on a <button> is not a real Tag.
export const isRealCombo = (real, { unit, mods, interactive }, ignore) => {
  const seen = real.get(unit)?.get(comboKey(mods, ignore));
  return !!seen && (seen.has('unknown') || interactive === 'unknown' || seen.has(interactive));
};
// Modifiers the markup uses at all (on root elements).
export const usedModifiers = (u) => new Set(u.usages.filter((x) => !x.part && isMarkup(x)).flatMap((x) => (x.classes || []).filter((c) => isModifierOf(c, u.id))));

// ctx: { unitIds, units, variantCls, ownClasses, baseMods, breakpoints } — modifiers that
// name the variant, the component itself, or that the variant's live example already has
// are not repeated in the caption.
const ORDER = ['size', 'width'];
export function autoLabel(st, { unitIds = [], units = [], variantCls = null, ownClasses = [], baseMods = [], breakpoints = [] } = {}) {
  if (st.note) return ''; // an example taken from a page: its caption says where from
  const parts = [], states = [];
  for (const { unit, mods } of combosIn(st.html, unitIds)) {
    const u = units.find((x) => x.id === unit);
    for (const m of mods) {
      if (m === variantCls || ownClasses.includes(m) || baseMods.includes(m)) continue;
      const s = stateOfClass(m);
      if (s) { states.push(s); continue; }
      const k = classifyModifier(m);
      if (k && VARIANT_AXES.includes(k.axis)) continue; // the variant itself
      if (!k && u && customAxis(m, u) === 'variant') continue; // a custom variant: named by data-name
      parts.push({ name: k ? k.name : customName(m), at: k ? ORDER.indexOf(k.axis) : 9 });
    }
    break; // the first element of the component speaks for the example
  }
  // A state class on a part counts too: `.gm-nav__link--active` → Current.
  for (const a of classAttributes(st.html)) for (const cls of a.classes) {
    if (!unitIds.includes(rootOf(cls)) || !cls.includes('--') || !cls.split('--')[0].includes('__')) continue;
    const s = stateOfClass(cls);
    if (s) states.push(s);
  }
  for (const m of st.html.matchAll(/data-pseudo="([^"]+)"/g)) states.push(...m[1].split(/\s+/));
  for (const [re, s] of ATTR_STATES) if (re.test(st.html)) states.push(s);
  // A frame narrower than a max-width breakpoint shows that breakpoint.
  const w = Number(st.width);
  const bp = w ? breakpoints.filter((b) => b >= w).sort((a, b) => a - b)[0] : null;
  if (bp) parts.push({ name: `≤ ${bp} px`, at: 8 });
  parts.sort((a, b) => a.at - b.at);
  const words = [...new Set([...parts.map((x) => x.name), ...states.map((s) => STATE_EN[s] || s)])];
  return words.join(', ');
}

// An example that renders nothing: the component's element is empty (no text, no child
// element, not a replaced element) and the rules of its classes give it no size, padding,
// border or ::before/::after. A blank frame is a defect, whatever caused it.
const GIVES_SIZE = /^(width|height|min-width|min-height|inline-size|block-size|flex-basis|padding(-[a-z]+)?|border(-(top|right|bottom|left))?(-width)?|aspect-ratio)$/;
const REPLACED = /^(img|input|select|textarea|svg|video|canvas|iframe|hr|progress|meter)$/i;
// The example's own (first) element: tag, classes, what is inside.
function rootElement(html) {
  const m = /<([a-zA-Z][\w-]*)\b([^>]*)>([\s\S]*?)<\/\1>|<([a-zA-Z][\w-]*)\b([^>]*)\/?>/.exec(html.trim());
  if (!m) return null;
  const attrs = m[2] || m[5] || '';
  return { tag: m[1] || m[4], body: m[3] ?? '', classes: (/\sclass\s*=\s*"([^"]*)"/.exec(attrs)?.[1] || '').split(/\s+/).filter(Boolean) };
}
// The selector picks an element by its own classes only, no combinators (pseudo-classes aside).
const selectsOwn = (sel, classes) => { const own = (sel.match(/\.[\w-]+/g) || []).map((x) => x.slice(1)); return own.length > 0 && own.every((x) => classes.includes(x)) && !/[\s>+~]/.test(sel.replace(/::?[\w-]+(\([^)]*\))?/g, '').trim()); };
const selectorsOf = (r) => String(r.selector).split(',').map((s) => s.trim());

export function blankElement(html, units) {
  const root = rootElement(html);
  if (!root) return null;
  const { tag, body, classes } = root;
  if (REPLACED.test(tag) || body.replace(/<!--[\s\S]*?-->/g, '').trim()) return null;
  if (!classes.length) return null;
  const mine = (sel) => selectsOwn(sel, classes);
  for (const u of units) for (const r of u.rules || []) for (const sel of selectorsOf(r)) {
    if (!mine(sel)) continue;
    if (/::?(before|after)\b/.test(sel)) return null; // generated content draws something
    if (/:(hover|active|focus)/.test(sel)) continue;
    if ((r.decls || []).some((d) => GIVES_SIZE.test(d.prop) && !/^(0|0px|none|auto)$/.test(String(d.value).trim()))) return null;
  }
  return { tag, classes };
}

// A frame of this width where the CSS hides the example's own element: a media rule that
// applies at that width sets `display: none` on it (the menu below 1024 px). The product
// has nothing there — a frame of it is empty.
export function hiddenAt(html, units, width) {
  const w = Number(width);
  if (!w) return null;
  return hidingRules(html, units).find((h) => (!h.max || w <= h.max) && (!h.min || w >= h.min)) || null;
}
// A frame without a width fits its gallery cell (~300 px): an element hidden below some
// width is empty there. Returns the widest such breakpoint — the frame needs desktop
// width (`data-width="wide"`).
export function hiddenNarrow(html, units) {
  return hidingRules(html, units).filter((h) => h.max && !h.min).sort((a, b) => b.max - a.max)[0] || null;
}
function hidingRules(html, units) {
  const root = rootElement(html);
  if (!root || !root.classes.length) return [];
  const out = [];
  for (const u of units) for (const r of u.rules || []) {
    const media = (r.at || []).filter((a) => /^@media/.test(a));
    const max = Math.min(...media.map((a) => Number(/max-width:\s*(\d+)px/.exec(a)?.[1] || Infinity)));
    const min = Math.max(...media.map((a) => Number(/min-width:\s*(\d+)px/.exec(a)?.[1] || 0)));
    if (!media.length || (max === Infinity && !min)) continue;
    if (!(r.decls || []).some((d) => d.prop === 'display' && /^none\b/.test(String(d.value).trim()))) continue;
    if (selectorsOf(r).some((sel) => !sel.includes(':') && selectsOwn(sel, root.classes))) out.push({ tag: root.tag, classes: root.classes, media: media.join(' '), max: max === Infinity ? null : max, min: min || null });
  }
  return out;
}

// gm-icon--16 → «16 px», gm-x--two-lines → «Two lines».
export function customName(m) {
  const s = m.split('--').slice(1).join('--');
  if (/^\d+$/.test(s)) return `${s} px`;
  const w = s.replace(/[-_]+/g, ' ').trim();
  return w ? w[0].toUpperCase() + w.slice(1) : m;
}

// Everything check and build need to judge one component's examples.
//   focusLost: unit ids where audit found `focus-lost` — the product shows no focus there,
//   so a pinned Focus would show something the product does not have.
export function exampleContext(c, { unitsById, inventory, config = {}, focusLost = new Set() }) {
  // Sliced: a component cut from a class family by a modifier sees only its own usages.
  const units = unitsOf(c, unitsById);
  // The modifier that makes the component (Chip = `gm-tag--blue`) is never a caption.
  const sliceMods = Object.values(c.slice || {}).flatMap((s) => s.only || []);
  // Icon glyphs are content: any glyph may stand in any example.
  const ignore = new Set(c.units.includes(iconBaseOf(config, inventory)) ? (inventory.icons || []).map((i) => i.class).filter(Boolean) : []);
  // Real anywhere in the code, on the same kind of element — an example may show the components next to it.
  const libraryUnits = inventory.units.filter((u) => u.library);
  const real = realCombos(libraryUnits, { ignore });
  const states = c.examples?.states || [];
  const previews = new Map(states.filter((s) => s.preview).map((s) => [s.variant || s.id, s]));
  // A state's own variant; states of a one-kind component belong to its only live example.
  const previewOf = (st) => previews.get(st.variant) || (!st.variant ? [...previews.values()].find((p) => !p.variant) : null);
  const baseMods = (st) => { const p = previewOf(st); return p ? combosIn(p.html, c.units)[0]?.mods || [] : []; };
  const globalFocus = (inventory.globalRules || []).some((r) => /:focus-visible/.test(r.selector));
  const hasPseudo = (p) => {
    if (/^focus/.test(p) && units.some((u) => focusLost.has(u.id))) return false;
    return units.some((u) => u.pseudo.includes(p)) || (/^focus/.test(p) && globalFocus);
  };
  const breakpoints = [...new Set(units.flatMap((u) => u.media || []).map((m) => Number(/max-width:\s*(\d+)px/.exec(m)?.[1])).filter(Boolean))];
  const labelCtx = (st) => ({ unitIds: c.units, units, variantCls: previewOf(st)?.cls || null, ownClasses: [...ignore, ...sliceMods], baseMods: st.preview || !st.variant && !previewOf(st) ? [] : baseMods(st), breakpoints });
  return { units, sliceMods, libraryUnits, real, ignore, hasPseudo, labelCtx, previewOf, baseMods };
}
