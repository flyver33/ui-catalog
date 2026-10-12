// Small CSS reader: enough structure to find rules, their selectors, the
// section comment above them and the at-rules around them. Not a validator.
import { lineIndex } from './fsutil.mjs';

const GROUPING_AT = new Set(['media', 'supports', 'layer', 'container', 'document', 'scope']);

function skipString(src, i) {
  const q = src[i];
  for (i++; i < src.length; i++) {
    if (src[i] === '\\') { i++; continue; }
    if (src[i] === q || src[i] === '\n') return i + 1;
  }
  return i;
}

function findClose(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 1; continue; }
    if (c === '"' || c === "'") { i = skipString(src, i) - 1; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return i; }
  }
  return src.length;
}

export const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

// Returns a tree of { type: 'comment'|'rule'|'at', ... } with 1-based lines.
export function parseCss(src) {
  const lineAt = lineIndex(src);
  let i = 0;

  const parseBlock = (end) => {
    const items = [];
    let start = i;
    const firstNonWs = (from, to) => { let k = from; while (k < to && /\s/.test(src[k])) k++; return k; };
    while (i < end) {
      const c = src[i];
      if (c === '/' && src[i + 1] === '*') {
        const e = src.indexOf('*/', i + 2);
        const stop = e < 0 ? src.length : e + 2;
        if (!src.slice(start, i).trim()) {
          items.push({ type: 'comment', text: src.slice(i + 2, stop - 2).trim(), line: lineAt(i), endLine: lineAt(stop - 1) });
          i = stop; start = i;
        } else i = stop;
        continue;
      }
      if (c === '"' || c === "'") { i = skipString(src, i); continue; }
      if (c === '{') {
        const raw = src.slice(start, i);
        const prelude = stripComments(raw).trim();
        const line = lineAt(firstNonWs(start, i));
        const close = findClose(src, i);
        if (prelude.startsWith('@')) {
          const name = prelude.slice(1).split(/[\s(]/)[0].toLowerCase();
          if (GROUPING_AT.has(name)) {
            i += 1;
            const children = parseBlock(close);
            items.push({ type: 'at', name, prelude, line, children });
          } else {
            items.push({ type: 'at', name, prelude, line, body: src.slice(i + 1, close) });
          }
        } else {
          items.push({ type: 'rule', prelude, line, endLine: lineAt(close), body: src.slice(i + 1, close), text: src.slice(firstNonWs(start, i), close + 1) });
        }
        i = close + 1; start = i;
        continue;
      }
      if (c === ';') {
        const st = stripComments(src.slice(start, i)).trim();
        if (st.startsWith('@')) items.push({ type: 'at', name: st.slice(1).split(/[\s(]/)[0].toLowerCase(), prelude: st, line: lineAt(firstNonWs(start, i)) });
        i++; start = i;
        continue;
      }
      i++;
    }
    return items;
  };

  return parseBlock(src.length);
}

// Visit every style rule with the at-rule chain around it, the nearest
// standalone comment before it (used as a "section" label) and `note`: the
// comment directly above this rule, with no other rule in between.
export function eachRule(items, cb, ctx = { at: [], comment: null }) {
  let comment = ctx.comment, prev = null;
  for (const it of items) {
    const note = prev?.type === 'comment' ? prev : null;
    prev = it;
    if (it.type === 'comment') { comment = it; continue; }
    if (it.type === 'rule') cb(it, { at: ctx.at, comment, note });
    else if (it.type === 'at' && it.children) {
      eachRule(it.children, cb, { at: [...ctx.at, `@${it.name} ${it.prelude.slice(it.name.length + 1).trim()}`], comment });
    }
  }
}

export function splitTopLevel(s, sep = ',') {
  const out = [];
  let depth = 0, cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    if (c === sep && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const cleanSelector = (sel) => sel.replace(/\[[^\]]*\]/g, '[]').replace(/(["'])(?:\\.|(?!\1).)*\1/g, '""');

export function classesIn(selector) {
  const out = [];
  for (const m of cleanSelector(selector).matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) out.push(m[1]);
  return out;
}

// Pseudo-classes attached to each class in a selector: `.a--x:hover .b` -> { 'a--x': ['hover'] }
export function pseudoByClass(selector) {
  const out = {};
  const s = cleanSelector(selector);
  for (const m of s.matchAll(/\.(-?[_a-zA-Z][\w-]*)((?:\.[\w-]+|\[\]|::?[\w-]+(?:\([^)]*\))?)*)/g)) {
    const pseudo = [...m[2].matchAll(/(?<!:):([\w-]+)/g)].map((p) => p[1]);
    if (m[2].includes('[]') && /disabled/.test(selector)) pseudo.push('disabled');
    if (pseudo.length) (out[m[1]] ||= []).push(...pseudo);
  }
  return out;
}

export const INTERACTIVE = ['hover', 'active', 'focus', 'focus-visible', 'focus-within', 'disabled', 'checked', 'invalid'];
const FORCEABLE = ['hover', 'active', 'focus-visible', 'focus-within', 'focus'];

export function declarations(body) {
  const out = [];
  for (const part of splitTopLevel(stripComments(body), ';')) {
    const k = part.indexOf(':');
    if (k > 0) out.push({ prop: part.slice(0, k).trim(), value: part.slice(k + 1).trim() });
  }
  return out;
}

export const varsUsed = (text) => [...new Set([...text.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]))];

export function hardcodedColors(body) {
  const out = new Set();
  for (const d of declarations(body)) {
    if (d.prop.startsWith('--')) continue;
    for (const m of d.value.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g)) out.add(m[0]);
  }
  return [...out];
}

// Section header only: a decorated line (`── Шапка ──`) or a few words. Explanatory
// prose that happens to sit above a rule is not a name for anything.
export function sectionHeader(comment) {
  if (!comment) return null;
  const first = comment.text.split(/\r?\n/)[0];
  const decorated = /[─━═]{2,}|={3,}|-{3,}|#{2,}/.test(first);
  const t = sectionTitle(comment);
  if (!t) return null;
  if (decorated) return t;
  return comment.text.split(/\r?\n/).length === 1 && t.length <= 32 && t.split(/\s+/).length <= 4 && !/[.:;!?]$/.test(t) ? t : null;
}

// What a rule styles, from the comment right above it, in a few words:
// «схематичная карточка стены: кружок…» -> «схематичная карточка стены».
// Section headers (`── Шапка ──`) and long sentences give nothing.
export function ruleNote(comment) {
  if (!comment || /[─━═]{2,}|={3,}|-{3,}|#{2,}/.test(comment.text)) return null;
  const t = comment.text.split(/\r?\n/)[0].replace(/`([^`]*)`/g, '$1').split(/\s[—–-]\s|[:;.,(]/)[0].replace(/\s+/g, ' ').trim();
  if (!t || t.length > 48 || t.split(' ').length > 6 || /^[.#]|^(todo|fixme|hack)\b/i.test(t)) return null;
  return t;
}

// The element a selector styles: the first class of its last compound.
// `.ui.is-focus > .check__top:hover` -> `check__top`. State classes (`is-on`,
// `has-x`, `js-x`) name no element: `.seg button.is-active` -> `seg`.
const STATE_CLASS = /^(is|has|js)-/;
export function subjectClass(selector) {
  const compounds = splitTopLevel(splitTopLevel(selector)[0] || '', ' ').filter((x) => !/^[>+~]$/.test(x));
  for (let i = compounds.length - 1; i >= 0; i--) {
    const cls = classesIn(compounds[i]).find((c) => !STATE_CLASS.test(c));
    if (cls) return cls;
  }
  return null;
}

// Section title from a comment: strips box-drawing decoration.
export function sectionTitle(comment) {
  if (!comment) return null;
  const first = comment.text.split(/\r?\n/)[0];
  const t = first.replace(/[─━═—–=\-*#]{2,}/g, ' ').replace(/\s+/g, ' ').trim();
  return t || null;
}

// Copy of every rule that uses a forceable pseudo-class, rewritten to also
// match `[data-pseudo~="hover"]` etc., so a gallery can pin a state.
// `rewriteUrl` maps url(...) values that were relative to the source file.
// The whole stylesheet with every :hover/:active/:focus selector also matching
// [data-pseudo~=…] *in place* — so a pinned state wins or loses exactly as the real one
// does (a later `outline: none` still beats a pinned focus ring). Relative url()s and
// @imports are rewritten because the copy lives in the gallery folder.
export function pinnedCss(src, rewriteUrl) {
  const tree = parseCss(src);
  const source = `(?<!:):(${FORCEABLE.join('|')})(?![\\w-])`;
  const re = new RegExp(source, 'g');
  const has = new RegExp(source);
  const urls = (t) => t.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, u) => `url(${q}${rewriteUrl(u)}${q})`);
  const emit = (items, indent = '') => {
    let out = '';
    for (const it of items) {
      if (it.type === 'rule') {
        const sels = splitTopLevel(it.prelude);
        const forced = sels.filter((s) => has.test(s)).map((s) => s.replace(re, (_, p) => `[data-pseudo~="${p}"]`));
        out += `${indent}${[...sels, ...forced].join(',\n' + indent)} {${urls(it.body)}}\n`;
      } else if (it.type === 'at' && it.children) {
        out += `${indent}${it.prelude} {\n${emit(it.children, indent + '  ')}${indent}}\n`;
      } else if (it.type === 'at' && it.body != null) {
        out += `${indent}${it.prelude} {${urls(it.body)}}\n`;
      } else if (it.type === 'at') {
        out += `${indent}${urls(it.prelude.replace(/^(@import\s+)(['"])([^'"]+)\2/, (m, a, q, u) => `${a}${q}${rewriteUrl(u)}${q}`))};\n`;
      }
    }
    return out;
  };
  return emit(tree);
}

export function forcedPseudoCss(src, rewriteUrl) {
  const tree = parseCss(src);
  const source = `(?<!:):(${FORCEABLE.join('|')})(?![\\w-])`;
  const re = new RegExp(source, 'g');
  const has = new RegExp(source);
  const emit = (items, indent = '') => {
    let out = '';
    for (const it of items) {
      if (it.type === 'rule') {
        const sels = splitTopLevel(it.prelude).filter((s) => has.test(s));
        if (!sels.length) continue;
        const forced = sels.map((s) => s.replace(re, (_, p) => `[data-pseudo~="${p}"]`));
        const body = it.body.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, u) => `url(${q}${rewriteUrl(u)}${q})`);
        out += `${indent}${forced.join(',\n' + indent)} {${body}}\n`;
      } else if (it.type === 'at' && it.children) {
        const inner = emit(it.children, indent + '  ');
        if (inner) out += `${indent}${it.prelude} {\n${inner}${indent}}\n`;
      }
    }
    return out;
  };
  return emit(tree);
}

// Custom properties with the comment group they sit under.
export function customProperties(src) {
  const lineAt = lineIndex(src);
  const out = [];
  let before = null;
  for (const it of parseCss(src)) {
    if (it.type === 'comment') { before = it; continue; }
    const outer = before;
    before = null;
    if (it.type !== 'rule' || !/^(:root|html)(?![\w-])/.test(it.prelude)) continue;
    const bodyStart = src.indexOf(it.body, src.indexOf(it.prelude));
    // A section comment right above the block names tokens until the first inner comment.
    let group = sectionTitle(outer)?.split(/[.(]/)[0].trim() || null;
    const re = /\/\*([\s\S]*?)\*\/|(--[\w-]+)\s*:\s*([^;]+);/g;
    for (const m of it.body.matchAll(re)) {
      if (m[1] !== undefined) { group = m[1].replace(/[─━═—–=\-*]{2,}/g, ' ').trim() || group; continue; }
      out.push({ name: m[2], value: m[3].trim(), group, scope: it.prelude, line: lineAt(bodyStart + m.index) });
    }
  }
  return out;
}
