// JSX → `__h(type, props, ...children)` calls, for a project without TypeScript in its
// node_modules. Built on our TSX reader (lib/jsx.mjs):
// every element it finds becomes a call; code inside `{…}` is transformed the same way.
// Types are left in place: Node's type stripping removes them afterwards.
import { readTsx } from './jsx.mjs';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', laquo: '«', raquo: '»', hellip: '…' };
const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e] ?? m));

// JSX text as React reads it: lines trimmed, empty lines dropped, the rest joined by a space.
function jsxText(raw) {
  const lines = raw.split(/\r?\n/);
  const out = [];
  lines.forEach((l, i) => {
    let t = l.replace(/\t/g, ' ');
    if (i > 0) t = t.replace(/^ +/, '');
    if (i < lines.length - 1) t = t.replace(/ +$/, '');
    if (t) out.push(t);
  });
  return decode(out.join(' '));
}

export function jsxToCalls(src) {
  const { elements } = readTsx(src);
  if (!elements.length) return src;
  // Top-level elements: in plain code, not inside another element's children or attributes.
  const top = elements.filter((e) => e.parent < 0 && e.ctx?.child == null && e.ctx?.el == null && e.ctx?.attr == null);
  const emit = (el) => {
    const type = !el.name ? '__F' : /^[a-z][\w-]*$/.test(el.name) && !el.name.includes('.') ? JSON.stringify(el.name) : el.name;
    const props = el.attrs.map((a) => {
      if (a.name === '...') return `...(${jsxToCalls(String(a.expr).replace(/^\s*\.\.\./, ''))})`;
      const key = /^[A-Za-z_$][\w$]*$/.test(a.name) ? a.name : JSON.stringify(a.name);
      if (a.bool) return `${key}: true`;
      if (a.value != null) return `${key}: ${JSON.stringify(decode(a.value))}`;
      return `${key}: (${jsxToCalls(a.expr || 'undefined')})`;
    });
    const kids = [];
    for (const it of el.items) {
      if (it.text != null) { const t = jsxText(it.text); if (t) kids.push(JSON.stringify(t)); }
      else if (it.el != null && it.el >= 0) kids.push(emit(elements[it.el]));
      else if (it.code != null && it.code.trim() && !/^\s*\/\*[\s\S]*\*\/\s*$/.test(it.code)) kids.push(`(${jsxToCalls(it.code)})`);
    }
    return `__h(${type}, ${props.length ? `{ ${props.join(', ')} }` : 'null'}${kids.length ? ', ' + kids.join(', ') : ''})`;
  };
  let out = '';
  let at = 0;
  for (const el of top.sort((a, b) => a.start - b.start)) {
    if (el.start < at) continue;
    out += src.slice(at, el.start) + emit(el);
    at = el.end ?? src.length;
  }
  return out + src.slice(at);
}
