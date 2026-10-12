// The gallery chrome in the project's colours and type:
// the accent from its colour tokens, the neutrals tinted toward it, its text face.

// The chrome's own values (gallery/app.css): neutrals keep their lightness and saturation.
const NEUTRALS = {
  '--uic-bg': '#f3f5f9', '--uic-ink': '#161a24', '--uic-ink-2': '#4c5468', '--uic-ink-3': '#848ca0',
  '--uic-line': '#e2e6ee', '--uic-line-2': '#d0d6e2', '--uic-fill': '#eceff6',
};
const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export function parseColor(v) {
  const s = String(v || '').trim().toLowerCase();
  let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(s);
  if (m) {
    const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(s);
  if (m && (m[4] == null || parseFloat(m[4]) >= (m[4].endsWith('%') ? 100 : 1))) return [+m[1], +m[2], +m[3]];
  return null;
}
const hex = (rgb) => '#' + rgb.map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('');
function toHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}
function fromHsl([h, s, l]) {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [r, g, b].map((v) => (v + m) * 255);
}
const lum = (rgb) => { const [r, g, b] = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const onWhite = (rgb) => 1.05 / (lum(rgb) + 0.05);
const mixWhite = (rgb, k) => rgb.map((v) => 255 - (255 - v) * k);

// The family stack of `font-family`, or of the `font` shorthand (after size/line-height).
export function fontStack(decls, resolve = (v) => v) {
  const fam = decls.find((d) => d.prop === 'font-family');
  if (fam) return resolve(fam.value).trim();
  const font = decls.find((d) => d.prop === 'font');
  const m = font && /(?:^|\s)[\d.]+(?:px|em|rem|%|pt)(?:\s*\/\s*[\w.%]+)?\s+(.+)$/.exec(resolve(font.value).trim());
  return m ? m[1].trim() : '';
}

export function chromeTheme(tokens, bodyStack = '') {
  const vars = {};
  const picks = tokens.filter((t) => t.kind === 'color').map((t) => ({ t, rgb: parseColor(t.resolved || t.value) }))
    .filter(({ rgb }) => rgb && toHsl(rgb)[1] >= 0.35 && onWhite(rgb) >= 4.5)
    .sort((a, b) => (b.t.uses || 0) - (a.t.uses || 0) || a.t.name.localeCompare(b.t.name));
  const accent = picks[0] || null;
  if (accent) {
    const hue = toHsl(accent.rgb)[0];
    vars['--uic-accent'] = hex(accent.rgb);
    vars['--uic-accent-soft'] = hex(mixWhite(accent.rgb, 0.12));
    vars['--uic-accent-hover'] = hex(mixWhite(accent.rgb, 0.2));
    for (const [k, v] of Object.entries(NEUTRALS)) { const [, s, l] = toHsl(parseColor(v)); vars[k] = hex(fromHsl([hue, s, l])); }
  }
  if (bodyStack) vars['--uic-sans'] = `${bodyStack}, ${SANS}`;
  return { accent: accent?.t.name || null, vars };
}
