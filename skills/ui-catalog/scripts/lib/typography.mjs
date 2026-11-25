// Text styles: merge the rules that set a font size into distinct styles
// (family × size × weight × line-height × letter-spacing), resolving tokens and
// what is inherited from `body`. Values the rule does not set are marked inherited.
import { sha1 } from './fsutil.mjs';

export const WEIGHT_NAMES = { 100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black' };

const px = (v, base = 16) => {
  if (v == null) return null;
  const m = /^(-?\d*\.?\d+)(px|rem|em|%)?$/.exec(String(v).trim());
  if (!m) return null;
  const n = parseFloat(m[1]);
  return m[2] === 'rem' ? n * 16 : m[2] === 'em' ? n * base : m[2] === '%' ? (n / 100) * base : m[2] === 'px' ? n : null;
};
const weightNum = (w) => (w == null ? null : w === 'normal' ? 400 : w === 'bold' ? 700 : /^\d{3}$/.test(w) ? Number(w) : null);
// Generic keywords and system aliases: fallbacks of a stack, not families.
export const GENERIC_FAMILY = /^(serif|sans-serif|monospace|cursive|fantasy|math|emoji|fangsong|system-ui|ui-serif|ui-sans-serif|ui-monospace|ui-rounded|-apple-system|BlinkMacSystemFont)$/i;
const names = (stack) => String(stack || '').split(',').map((x) => x.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
// The family of a stack: its first name that is not a fallback (the first one when all are).
export const firstFamily = (stack) => { const n = names(stack); return n.find((x) => !GENERIC_FAMILY.test(x)) || n[0] || null; };

// A `font` shorthand, resolved: [style] [weight] size[/line-height] family.
export function parseFont(value) {
  const v = String(value || '').replace(/\s+/g, ' ').trim();
  const m = /(?:^|\s)(\d*\.?\d+(?:px|rem|em|%))\s*(?:\/\s*(\S+))?\s+(.+)$/.exec(v);
  if (!m) return null;
  const w = /\b([1-9]00|bold|normal|lighter|bolder)\b/.exec(v.slice(0, m.index + 1));
  return { size: m[1], lineHeight: m[2] || null, family: m[3], weight: w ? w[1] : null };
}

const styleName = (family, size, lh, weight) => `${family} ${size}${lh ? '/' + lh : ''} ${WEIGHT_NAMES[weight] || weight}`;
const lineHeightPx = (lhRaw, size) => (!lhRaw || lhRaw === 'normal' ? null : /px$/.test(lhRaw) ? px(lhRaw) : /%$/.test(lhRaw) ? px(lhRaw, size) : /^\d*\.?\d+$/.test(lhRaw) ? +(parseFloat(lhRaw) * size).toFixed(2) : px(lhRaw, size));

// Tokens whose value is a `font` shorthand: the text styles the project named.
export function fontTokenStyles(tokens, resolve) {
  const out = [];
  for (const t of tokens || []) {
    const f = parseFont(resolve(t.value));
    if (!f) continue;
    const size = px(resolve(f.size));
    if (size == null) continue;
    const weight = weightNum(resolve(f.weight || '400')) || 400;
    const lh = lineHeightPx(f.lineHeight ? resolve(f.lineHeight) : null, size);
    const family = firstFamily(resolve(f.family));
    out.push({ token: t.name, family, stack: resolve(f.family), size, weight, lineHeight: lh, name: styleName(family, size, lh, weight), uses: t.uses || 0 });
  }
  return out.sort((a, b) => a.family.localeCompare(b.family) || b.size - a.size || b.weight - a.weight);
}

// The body's text: its own declarations or the `font` shorthand (a token) it is set by.
export function bodyFont(bodyDecls, resolve) {
  const body = Object.fromEntries((bodyDecls || []).map((d) => [d.prop, d.value]));
  const f = body.font ? parseFont(resolve(body.font)) : null;
  return {
    family: body['font-family'] || f?.family || null, size: body['font-size'] || f?.size || null,
    weight: body['font-weight'] || f?.weight || null, lh: body['line-height'] || f?.lineHeight || null,
  };
}

// sites: inventory.textSites; resolve(v) resolves var(); body: the body rule's declarations.
export function textStyles(sites, resolve, bodyDecls = []) {
  const body = bodyFont(bodyDecls, resolve);
  const base = {
    family: resolve(body.family || 'sans-serif'),
    size: px(resolve(body.size || '16px')) || 16,
    weight: weightNum(resolve(body.weight || '400')) || 400,
    lh: body.lh,
  };
  const styles = new Map();
  const own = (v) => (v == null || /^(inherit|unset|initial)$/.test(String(v).trim()) ? null : v);
  for (const s0 of sites) {
    // `font: var(--font-…)`: the style is the token's.
    const f = s0.font ? parseFont(resolve(s0.font)) : null;
    const s = { ...s0, size: s0.size || f?.size, family: own(s0.family) || f?.family || null, weight: own(s0.weight) || f?.weight || null, lineHeight: own(s0.lineHeight) || f?.lineHeight || null, letterSpacing: own(s0.letterSpacing) };
    const size = px(resolve(s.size), base.size);
    if (size == null) continue;
    const famRaw = s.family ? resolve(s.family) : null;
    const family = famRaw || base.family;
    const weight = weightNum(s.weight ? resolve(s.weight) : null) ?? base.weight;
    const lhRaw = s.lineHeight ? resolve(s.lineHeight) : base.lh ? resolve(base.lh) : null;
    // px inherits as is; a unitless/percent value scales with this rule's size.
    const lh = lineHeightPx(lhRaw, size);
    const lsRaw = s.letterSpacing ? resolve(s.letterSpacing) : null;
    // `normal` and 0 are the same tracking: one style, not two with one name (G64).
    const ls = (lsRaw && lsRaw !== 'normal' ? (/em$/.test(lsRaw) ? +(parseFloat(lsRaw) * size).toFixed(2) : px(lsRaw)) : 0) || 0;
    const key = [firstFamily(family), size, weight, lh, ls].join('|');
    if (!styles.has(key)) {
      styles.set(key, {
        id: 'ts-' + sha1(key).slice(0, 8), family: firstFamily(family), stack: family,
        familyToken: /var\(\s*(--[\w-]+)/.exec(s.family || '')?.[1] || null,
        fontToken: /var\(\s*(--[\w-]+)/.exec(s0.font || '')?.[1] || null,
        size, weight, weightName: WEIGHT_NAMES[weight] || String(weight), lineHeight: lh,
        lineHeightPct: lh ? Math.round((lh / size) * 100) : null, letterSpacing: ls,
        inherited: { family: !s.family, weight: !s.weight, lineHeight: !s.lineHeight },
        library: false, sites: [],
      });
    }
    const st = styles.get(key);
    st.library ||= s.library;
    st.sites.push(s);
  }
  for (const st of styles.values()) {
    st.name = styleName(st.family, st.size, st.lineHeight, st.weight);
    st.css = [`font-family: ${st.stack};`, `font-size: ${st.size}px;`, `font-weight: ${st.weight};`, st.lineHeight ? `line-height: ${st.lineHeight}px;` : null, st.letterSpacing ? `letter-spacing: ${st.letterSpacing}px;` : null].filter(Boolean).join('\n');
  }
  // Two styles that differ only in tracking (-.408px and -.41px in one project) would carry
  // one name: the tracking tells them apart.
  const byName = new Map();
  for (const st of styles.values()) (byName.get(st.name) || byName.set(st.name, []).get(st.name)).push(st);
  for (const list of byName.values()) if (list.length > 1) for (const st of list) st.name += ` · ${st.letterSpacing ? `${+st.letterSpacing.toFixed(3)}px` : '0'}`;
  return [...styles.values()].sort((a, b) => b.library - a.library || a.family.localeCompare(b.family) || b.size - a.size || b.weight - a.weight);
}
