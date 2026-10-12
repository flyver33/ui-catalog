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
const firstFamily = (stack) => (stack || '').split(',')[0].trim().replace(/^["']|["']$/g, '') || null;

// sites: inventory.textSites; resolve(v) resolves var(); body: the body rule's declarations.
export function textStyles(sites, resolve, bodyDecls = []) {
  const body = Object.fromEntries(bodyDecls.map((d) => [d.prop, d.value]));
  const base = {
    family: resolve(body['font-family'] || 'sans-serif'),
    size: px(resolve(body['font-size'] || '16px')) || 16,
    weight: weightNum(resolve(body['font-weight'] || '400')) || 400,
    lh: body['line-height'] || null,
  };
  const styles = new Map();
  const own = (v) => (v == null || /^(inherit|unset|initial)$/.test(String(v).trim()) ? null : v);
  for (const s0 of sites) {
    const s = { ...s0, family: own(s0.family), weight: own(s0.weight), lineHeight: own(s0.lineHeight), letterSpacing: own(s0.letterSpacing) };
    const size = px(resolve(s.size), base.size);
    if (size == null) continue;
    const famRaw = s.family ? resolve(s.family) : null;
    const family = famRaw || base.family;
    const weight = weightNum(s.weight ? resolve(s.weight) : null) ?? base.weight;
    const lhRaw = s.lineHeight ? resolve(s.lineHeight) : base.lh ? resolve(base.lh) : null;
    // px inherits as is; a unitless/percent value scales with this rule's size.
    let lh = null;
    if (lhRaw && lhRaw !== 'normal') lh = /px$/.test(lhRaw) ? px(lhRaw) : /%$/.test(lhRaw) ? px(lhRaw, size) : /^\d*\.?\d+$/.test(lhRaw) ? +(parseFloat(lhRaw) * size).toFixed(2) : px(lhRaw, size);
    const lsRaw = s.letterSpacing ? resolve(s.letterSpacing) : null;
    // `normal` and 0 are the same tracking: one style, not two with one name (G64).
    const ls = (lsRaw && lsRaw !== 'normal' ? (/em$/.test(lsRaw) ? +(parseFloat(lsRaw) * size).toFixed(2) : px(lsRaw)) : 0) || 0;
    const key = [firstFamily(family), size, weight, lh, ls].join('|');
    if (!styles.has(key)) {
      styles.set(key, {
        id: 'ts-' + sha1(key).slice(0, 8), family: firstFamily(family), stack: family,
        familyToken: /var\(\s*(--[\w-]+)/.exec(s.family || '')?.[1] || null,
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
    st.name = `${st.family} ${st.size}${st.lineHeight ? '/' + st.lineHeight : ''} ${st.weightName}`;
    st.css = [`font-family: ${st.stack};`, `font-size: ${st.size}px;`, `font-weight: ${st.weight};`, st.lineHeight ? `line-height: ${st.lineHeight}px;` : null, st.letterSpacing ? `letter-spacing: ${st.letterSpacing}px;` : null].filter(Boolean).join('\n');
  }
  // Two styles that differ only in tracking (-.408px and -.41px in one project) would carry
  // one name: the tracking tells them apart.
  const byName = new Map();
  for (const st of styles.values()) (byName.get(st.name) || byName.set(st.name, []).get(st.name)).push(st);
  for (const list of byName.values()) if (list.length > 1) for (const st of list) st.name += ` · ${st.letterSpacing ? `${+st.letterSpacing.toFixed(3)}px` : '0'}`;
  return [...styles.values()].sort((a, b) => b.library - a.library || a.family.localeCompare(b.family) || b.size - a.size || b.weight - a.weight);
}
