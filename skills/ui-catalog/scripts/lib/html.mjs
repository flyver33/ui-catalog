// Regex-level HTML helpers. Good enough for hand-written markup; not a parser.
import { lineIndex } from './fsutil.mjs';

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

export function classAttributes(src) {
  src = maskComments(src);
  const lineAt = lineIndex(src);
  const out = [];
  for (const m of src.matchAll(/\sclass\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    const value = m[1] ?? m[2];
    out.push({ pos: m.index, line: lineAt(m.index), classes: value.split(/\s+/).filter(Boolean) });
  }
  return out;
}

export function scriptRanges(src) {
  return [...src.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => [m.index, m.index + m[0].length]);
}

// Blank out HTML comments, keeping offsets (so line numbers stay right).
export const maskComments = (src) => src.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));

export function includes(src, attr = 'data-include') {
  src = maskComments(src);
  const lineAt = lineIndex(src);
  const re = new RegExp(`<([a-z][\\w-]*)\\b[^>]*\\s${attr}\\s*=\\s*"([^"]+)"[^>]*>(?:\\s*</\\1>)?`, 'gi');
  return [...src.matchAll(re)].map((m) => ({ path: m[2], line: lineAt(m.index), start: m.index, end: m.index + m[0].length, tag: m[0] }));
}

// Outer HTML of the element whose start tag contains `pos`.
export function elementAt(src, pos, maxLen = 1500) {
  const start = src.lastIndexOf('<', pos);
  if (start < 0) return null;
  const tagName = /^<([a-zA-Z][\w-]*)/.exec(src.slice(start))?.[1];
  if (!tagName) return null;
  const openEnd = src.indexOf('>', pos);
  if (openEnd < 0) return null;
  if (VOID.has(tagName.toLowerCase()) || src[openEnd - 1] === '/') return src.slice(start, openEnd + 1);
  const re = new RegExp(`<(/?)${tagName}\\b[^>]*>`, 'gi');
  re.lastIndex = openEnd + 1;
  let depth = 1, m;
  while ((m = re.exec(src))) {
    if (m[0].endsWith('/>')) continue;
    depth += m[1] ? -1 : 1;
    if (depth === 0) {
      const html = src.slice(start, m.index + m[0].length);
      return html.length > maxLen ? null : html;
    }
  }
  return null;
}

// Element tree of hand-written markup: [{ tag, start, openEnd, end, classes, parent }],
// in document order. Comments and script/style bodies are skipped; unclosed tags close
// with their parent. `at(pos)` finds the element whose start tag contains pos.
export function elementTree(src) {
  const masked = maskComments(src).replace(/(<(script|style)\b[^>]*>)([\s\S]*?)(<\/\2>)/gi, (m, a, t, body, b) => a + body.replace(/[^\n]/g, ' ') + b);
  const els = [], stack = [];
  for (const m of masked.matchAll(/<(\/?)([a-zA-Z][\w-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g)) {
    const tag = m[2].toLowerCase();
    if (m[1]) {
      const i = stack.map((e) => els[e].tag).lastIndexOf(tag);
      if (i < 0) continue;
      while (stack.length > i) els[stack.pop()].end = m.index + m[0].length;
      continue;
    }
    const cls = /\sclass\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(m[3]);
    const el = { tag, start: m.index, openEnd: m.index + m[0].length, end: null, classes: cls ? (cls[1] ?? cls[2]).split(/\s+/).filter(Boolean) : [], parent: stack.length ? stack[stack.length - 1] : -1 };
    els.push(el);
    if (!VOID.has(tag) && !m[3].trim().endsWith('/')) stack.push(els.length - 1);
  }
  for (const i of stack) els[i].end = masked.length;
  const at = (pos) => {
    let lo = 0, hi = els.length - 1, best = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (els[mid].start <= pos) { best = mid; lo = mid + 1; } else hi = mid - 1; }
    return best >= 0 && pos < els[best].openEnd ? best : -1;
  };
  return { els, at };
}

// Re-indent a snippet taken from the middle of a file.
export function dedent(html) {
  const lines = html.replace(/\t/g, '  ').split(/\r?\n/);
  if (lines.length < 2) return html.trim();
  const indents = lines.slice(1).filter((l) => l.trim()).map((l) => /^ */.exec(l)[0].length);
  const cut = Math.min(...indents, Infinity);
  return [lines[0].trim(), ...lines.slice(1).map((l) => l.slice(Math.min(cut, /^ */.exec(l)[0].length)))].join('\n').trim();
}

export function addAttribute(html, attr) {
  return html.replace(/^<([a-zA-Z][\w-]*)/, `<$1 ${attr}`);
}

const ENTITIES = { '&quot;': '"', '&#39;': "'", '&apos;': "'", '&lt;': '<', '&gt;': '>', '&amp;': '&' };
const decode = (s) => s.replace(/&(quot|#39|apos|lt|gt|amp);/g, (m) => ENTITIES[m]);

export function parseAttributes(s) {
  const out = {};
  for (const m of s.matchAll(/([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) out[m[1]] = decode(m[2] ?? m[3] ?? m[4] ?? '');
  return out;
}
