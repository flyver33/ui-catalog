// Variant names: a closed dictionary for the ~90% of modifiers every product has.
// A modifier is matched by the part after `--` (`gm-btn--primary` → `primary`).
// Names are English, like component names (lib/naming.mjs).
//
// Axes of the component model:
//   emphasis  how loud the action is; mutually exclusive — these are the variants
//   style     filled vs outlined. Only an axis when one emphasis level comes in both
//             (Primary filled + Primary outlined). If only Secondary is outlined, an
//             `--outline` modifier is just Secondary and style is not an axis.
//   tone      status colour with a meaning
//   size, width  combine with any variant: states of a variant, not variants
//
// A modifier outside the dictionary is a custom variant, named by the word of its
// class (`--inherit` → Inherit, lib/examples.mjs customName): generate writes it,
// check holds it and lists it.

export const AXES = {
  emphasis: [
    { name: 'Primary', match: ['primary', 'main', 'accent', 'cta'] },
    { name: 'Secondary', match: ['secondary', 'default', 'basic'] },
    { name: 'Tertiary', match: ['tertiary', 'ghost', 'text', 'quiet', 'subtle', 'plain', 'link', 'flat'] },
  ],
  style: [
    { name: 'Filled', match: ['filled', 'solid', 'fill', 'contained'] },
    { name: 'Outlined', match: ['outline', 'outlined', 'bordered', 'stroke', 'stroked'], else: 'Secondary' },
  ],
  tone: [
    { name: 'Danger', match: ['danger', 'destructive', 'error', 'negative', 'critical'] },
    { name: 'Success', match: ['success', 'positive'] },
    { name: 'Warning', match: ['warning', 'caution', 'attention'] },
    { name: 'Info', match: ['info', 'informative'] },
    { name: 'Neutral', match: ['neutral'] },
  ],
  size: [
    { name: 'Extra small', match: ['xs', 'xsmall', 'tiny'] },
    { name: 'Small', match: ['sm', 's', 'small'] },
    { name: 'Medium', match: ['md', 'm', 'medium'] },
    { name: 'Large', match: ['lg', 'l', 'large', 'big'] },
    { name: 'Extra large', match: ['xl', 'xlarge', 'huge'] },
  ],
  width: [
    { name: 'Full width', match: ['full', 'block', 'wide', 'stretch', 'fluid', '100', 'w100', 'full-width'] },
  ],
};

export const AXIS_RU = { emphasis: 'вид', style: 'заливка или обводка', tone: 'тон', size: 'размер', width: 'ширина' };
// Axes whose values are variants (picked between); the rest are states of a variant.
export const VARIANT_AXES = ['emphasis', 'style', 'tone'];

const suffixOf = (cls) => String(cls).split('--').slice(1).join('--').toLowerCase();

// gm-btn--primary → { axis: 'emphasis', name: 'Primary' }; unknown → null.
export function classifyModifier(cls) {
  const s = suffixOf(cls);
  if (!s) return null;
  for (const [axis, values] of Object.entries(AXES)) {
    const v = values.find((x) => x.match.includes(s));
    if (v) return { axis, name: v.name, else: v.else || null };
  }
  return null;
}

// Every word combination the dictionary allows as a variant name:
// «Primary», «Danger», «Primary outlined», «Secondary filled».
export const DICTIONARY_NAMES = (() => {
  const out = new Set();
  const names = (a) => AXES[a].map((v) => v.name);
  for (const a of VARIANT_AXES) names(a).forEach((n) => out.add(n));
  for (const e of names('emphasis')) for (const s of names('style')) out.add(`${e} ${s.toLowerCase()}`);
  for (const t of names('tone')) for (const s of names('style')) out.add(`${t} ${s.toLowerCase()}`);
  return out;
})();

export const isDictionaryName = (n) => DICTIONARY_NAMES.has(String(n || '').trim());

// A modifier the dictionary does not know: variant or state of a variant?
// It is a variant when, at rest, it changes how the thing looks — colour, background,
// border, shadow (the same properties audit compares). Changing only size, spacing or
// layout makes it a state that combines with any variant. `u.rules` come from scan.
const APPEARANCE = /^(color|background(-color|-image)?|border(-color)?|border-(top|right|bottom|left)(-color)?|box-shadow|outline(-color)?|fill|stroke|opacity)$/;
export function customAxis(cls, u) {
  let appearance = false, any = false;
  for (const r of u?.rules || []) for (const sel of String(r.selector).split(',')) {
    if (!new RegExp(`\.${cls.replace(/[-]/g, '\-')}(?![\w-])`).test(sel) || /:(hover|active|focus)/.test(sel)) continue;
    for (const d of r.decls || []) { any = true; if (APPEARANCE.test(d.prop)) appearance = true; }
  }
  return any && appearance ? 'variant' : 'state';
}

// The dictionary name a variant modifier must carry, given the combinations the markup
// really has (`realKeys`: «mod mod» strings for the unit). An outlined style is its own
// axis only when one emphasis level comes in both styles; a lone `--outline` is Secondary.
export function expectedVariantName(cls, realKeys = []) {
  const k = classifyModifier(cls);
  if (!k || !VARIANT_AXES.includes(k.axis)) return null;
  if (k.axis !== 'style') return k.name;
  const combos = [...realKeys].map((key) => key.split(' ').filter(Boolean));
  const emphasisOf = (mods) => mods.find((m) => classifyModifier(m)?.axis === 'emphasis') || null;
  const withStyle = combos.filter((mods) => mods.includes(cls));
  const levels = new Set(withStyle.map(emphasisOf).filter(Boolean));
  const bothStyles = [...levels].some((lvl) => combos.some((mods) => mods.includes(lvl) && !mods.includes(cls)));
  return bothStyles ? k.name : (k.else || k.name);
}
