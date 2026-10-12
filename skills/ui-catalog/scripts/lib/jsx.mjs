// A dependency-free reader of TSX/JSX: enough of the language to find imports, exports,
// top-level declarations, type literals and every JSX element with its attributes,
// children and the code context it sits in.
// It is a scanner, not a compiler: it never evaluates anything and never fails on
// syntax it does not know — unknown code is skipped as plain JS.

const ID_START = /[A-Za-z_$]/;
const ID_CHAR = /[\w$]/;
// After these a `<` starts JSX and a `/` starts a regex; after an identifier, a number or
// a closing bracket they are operators.
const OPERAND_KEYWORDS = new Set(['return', 'case', 'default', 'yield', 'await', 'typeof', 'void', 'delete', 'in', 'of', 'new', 'else', 'do', 'throw', '=>']);

export function lineIndex(src) {
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === '\n') starts.push(i + 1);
  return (pos) => {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= pos) lo = mid; else hi = mid - 1; }
    return lo + 1;
  };
}

export function readTsx(src) {
  const lineAt = lineIndex(src);
  const elements = []; // every JSX element, flat; `parent` links the tree
  const decls = []; // top-level declarations: { name, start, line }
  let i = 0;
  let prev = null; // last significant token: { type: 'id'|'num'|'punct'|'kw', value }
  let depth = 0; // bracket depth of plain code, to find top-level statements

  const operandExpected = () => {
    if (!prev) return true;
    if (prev.type === 'kw') return true;
    if (prev.type === 'id' || prev.type === 'num' || prev.type === 'str') return false;
    return !(prev.value === ')' || prev.value === ']' || prev.value === '}');
  };

  const skipSpaceAndComments = (stopAtNewline = false) => {
    while (i < src.length) {
      const c = src[i];
      if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
      if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; continue; }
      if (/\s/.test(c)) { if (stopAtNewline && c === '\n') return; i++; continue; }
      return;
    }
  };

  const readString = (q) => { // at the opening quote; returns the value
    let out = '';
    i++;
    while (i < src.length && src[i] !== q) {
      if (src[i] === '\\') { out += src[i + 1] ?? ''; i += 2; continue; }
      if (src[i] === '\n') break; // unterminated: do not run away
      out += src[i++];
    }
    i++;
    return out;
  };

  const readRegex = () => {
    i++;
    let inClass = false;
    while (i < src.length) {
      const c = src[i];
      if (c === '\\') { i += 2; continue; }
      if (c === '\n') break;
      if (c === '[') inClass = true; else if (c === ']') inClass = false;
      else if (c === '/' && !inClass) { i++; break; }
      i++;
    }
    while (i < src.length && /[a-z]/i.test(src[i])) i++;
  };

  // A template literal; `${…}` parts are code (JSX may sit inside).
  const readTemplate = (ctx) => {
    i++;
    const statics = [];
    let cur = '';
    while (i < src.length && src[i] !== '`') {
      if (src[i] === '\\') { cur += src[i + 1] ?? ''; i += 2; continue; }
      if (src[i] === '$' && src[i + 1] === '{') {
        statics.push(cur); cur = '';
        i += 2;
        scanCode('}', ctx);
        i++;
        continue;
      }
      cur += src[i++];
    }
    statics.push(cur);
    i++;
    return statics;
  };

  // Plain code until `end` at its own depth (or the end of the file). JSX found inside is
  // read as elements whose context is the code before them in this run.
  function scanCode(end, ctx) {
    const begin = i;
    let local = 0;
    prev = null;
    while (i < src.length) {
      skipSpaceAndComments();
      if (i >= src.length) break;
      const c = src[i];
      if (local === 0 && end && c === end) return src.slice(begin, i);
      if (c === '"' || c === "'") { readString(c); prev = { type: 'str' }; continue; }
      if (c === '`') { readTemplate(ctx); prev = { type: 'str' }; continue; }
      if (c === '/' && operandExpected()) { readRegex(); prev = { type: 'str' }; continue; }
      if (c === '<' && operandExpected() && looksLikeJsx()) {
        // The code just before the element says where it sits: `.map(`, `cond &&`, `? :`, `if (…) return`.
        const before = src.slice(Math.max(begin, i - 400), i);
        const el = readElement({ ...(ctx || {}), before }, -1);
        if (el >= 0) { prev = { type: 'punct', value: ')' }; continue; }
      }
      if (ID_START.test(c)) {
        let j = i; while (j < src.length && ID_CHAR.test(src[j])) j++;
        const word = src.slice(i, j);
        if (!ctx && depth === 0 && local === 0) topLevel(word, i);
        prev = OPERAND_KEYWORDS.has(word) ? { type: 'kw', value: word } : { type: 'id', value: word };
        i = j;
        continue;
      }
      if (/\d/.test(c)) { while (i < src.length && /[\w.]/.test(src[i])) i++; prev = { type: 'num' }; continue; }
      if (c === '=' && src[i + 1] === '>') { i += 2; prev = { type: 'kw', value: '=>' }; continue; }
      if (c === '(' || c === '[' || c === '{') { local++; if (!ctx) depth++; }
      if (c === ')' || c === ']' || c === '}') { local--; if (!ctx) depth = Math.max(0, depth - 1); }
      prev = { type: 'punct', value: c };
      i++;
    }
    return src.slice(begin, i);
  }

  // Top-level statements name the declaration the following JSX belongs to.
  let pendingExport = false;
  function topLevel(word, at) {
    if (word === 'export') { pendingExport = true; return; }
    if (['function', 'const', 'let', 'var', 'class', 'type', 'interface', 'enum'].includes(word)) {
      const m = /^(?:async\s+)?(?:function\*?|const|let|var|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/.exec(src.slice(at, at + 200));
      if (m) decls.push({ name: m[1], kind: word, start: at, line: lineAt(at), exported: pendingExport });
      pendingExport = false;
      return;
    }
    if (word !== 'default' && word !== 'async') pendingExport = false;
  }

  // `<Name` / `<div` / `<>` — not `<T,>` or `<T extends …>` (generic arrows).
  function looksLikeJsx() {
    const rest = src.slice(i + 1, i + 80);
    if (rest[0] === '>') return true;
    const m = /^([A-Za-z_$][\w$.:-]*)\s*([\s\S]?)/.exec(rest);
    if (!m) return false;
    const after = rest.slice(m[1].length).trimStart();
    if (/^(,|extends\b)/.test(after)) return false;
    return true;
  }

  const readName = () => { const m = /^[A-Za-z_$][\w$.:-]*/.exec(src.slice(i, i + 120)); if (!m) return ''; i += m[0].length; return m[0]; };

  // One element at `<`; returns its index in `elements`, or -1.
  function readElement(ctx, parent) {
    const start = i;
    i++;
    const name = src[i] === '>' ? '' : readName();
    // JSX inside `{…}` of a child or an attribute hangs under that element, with its context.
    if (parent < 0 && ctx?.child != null) parent = ctx.child;
    else if (parent < 0 && ctx?.el != null) parent = ctx.el;
    const el = { name, start, line: lineAt(start), parent, attrs: [], children: [], texts: [], exprs: [], items: [], ctx: ctx || null, slot: ctx?.attr && ctx.attr !== '...' ? ctx.attr : null };
    const index = elements.push(el) - 1;
    if (parent >= 0) elements[parent].children.push(index);
    // Type arguments of a generic component (`<Tabs<Mode> …>`) are not attributes.
    skipSpaceAndComments();
    if (name && src[i] === '<') {
      for (let d = 0; i < src.length; i++) { if (src[i] === '<') d++; else if (src[i] === '>' && --d === 0) { i++; break; } }
    }
    // Attributes.
    while (i < src.length) {
      skipSpaceAndComments();
      const c = src[i];
      if (c === '/' && src[i + 1] === '>') { i += 2; el.end = i; return index; }
      if (c === '>') { i++; break; }
      if (c === '{') { // spread
        i++;
        const text = scanCode('}', { attr: '...', el: index });
        i++;
        el.attrs.push({ name: '...', expr: text.trim() });
        continue;
      }
      const an = /^[A-Za-z_$][\w$:.-]*/.exec(src.slice(i, i + 80));
      if (!an) { i++; continue; }
      i += an[0].length;
      skipSpaceAndComments();
      if (src[i] !== '=') { el.attrs.push({ name: an[0], bool: true }); continue; }
      i++;
      skipSpaceAndComments();
      if (src[i] === '"' || src[i] === "'") { const v = readString(src[i]); el.attrs.push({ name: an[0], value: v }); continue; }
      if (src[i] === '{') {
        i++;
        const text = scanCode('}', { attr: an[0], el: index });
        i++;
        el.attrs.push({ name: an[0], expr: text.trim() });
        continue;
      }
      if (src[i] === '<') { readElement({ attr: an[0] }, -1); continue; }
    }
    // Children until the matching close.
    let text = '';
    // `items`: the children in order, raw — what the JSX transform (lib/jsx-transform.mjs) emits.
    const flushText = () => { const t = text.replace(/\s+/g, ' ').trim(); if (t) el.texts.push(t); if (text) el.items.push({ text }); text = ''; };
    while (i < src.length) {
      const c = src[i];
      if (c === '<' && src[i + 1] === '/') {
        flushText();
        const close = src.indexOf('>', i);
        i = close < 0 ? src.length : close + 1;
        el.end = i;
        return index;
      }
      if (c === '<') { flushText(); el.items.push({ el: readElement(null, index) }); continue; }
      if (c === '{') {
        flushText();
        i++;
        const exprStart = elements.length;
        const code = scanCode('}', { child: index });
        i++;
        el.exprs.push({ code: code.trim(), elements: elements.length - exprStart });
        el.items.push({ code });
        continue;
      }
      text += c;
      i++;
    }
    el.end = i;
    return index;
  }

  scanCode(null, null);

  // Which declaration each root element belongs to.
  const declAt = (pos) => { let d = null; for (const x of decls) { if (x.start <= pos) d = x; else break; } return d; };
  for (const el of elements) el.decl = declAt(el.start)?.name || null;
  return { elements, decls, lineAt };
}

// ── statements outside JSX: imports, exports, types ─────────────────────

// The source with comments blanked out (strings kept) — for the statement regexes below.
export function stripComments(src) {
  let out = '';
  for (let i = 0; i < src.length;) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < src.length && src[j] !== c) { if (src[j] === '\\') j++; if (c !== '`' && src[j] === '\n') break; j++; }
      out += src.slice(i, j + 1); i = j + 1; continue;
    }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') { out += ' '; i++; } continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); const stop = e < 0 ? src.length : e + 2; out += src.slice(i, stop).replace(/[^\n]/g, ' '); i = stop; continue; }
    out += c; i++;
  }
  return out;
}

export function readImports(code) {
  const out = [];
  for (const m of code.matchAll(/(?:^|[;\n])\s*import\s+(type\s+)?([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g)) {
    if (m[1]) continue; // import type
    const clause = m[2].trim();
    const imp = { source: m[3], default: null, namespace: null, named: [] };
    const ns = /\*\s+as\s+([\w$]+)/.exec(clause);
    if (ns) imp.namespace = ns[1];
    const def = /^([\w$]+)\s*(,|$)/.exec(clause);
    if (def) imp.default = def[1];
    const braces = /\{([\s\S]*)\}/.exec(clause);
    if (braces) for (const part of braces[1].split(',')) {
      const p = part.trim().replace(/^type\s+/, '');
      if (!p) continue;
      const [imported, local] = p.split(/\s+as\s+/).map((s) => s.trim());
      imp.named.push({ imported, local: local || imported });
    }
    out.push(imp);
  }
  for (const m of code.matchAll(/(?:^|[;\n])\s*import\s+['"]([^'"]+)['"]/g)) out.push({ source: m[1], sideEffect: true, named: [] });
  return out;
}

export function readExports(code) {
  const out = [];
  for (const m of code.matchAll(/export\s+(?:default\s+)?(?:async\s+)?(?:function\*?|const|let|var|class)\s+([\w$]+)/g)) out.push({ name: m[1], local: m[1] });
  for (const m of code.matchAll(/export\s+default\s+(?!function|class|async)([\w$]+)/g)) out.push({ name: 'default', local: m[1] });
  for (const m of code.matchAll(/export\s+(type\s+)?\{([^}]*)\}(?:\s+from\s+['"]([^'"]+)['"])?/g)) {
    if (m[1]) continue;
    for (const part of m[2].split(',')) {
      const p = part.trim().replace(/^type\s+/, '');
      if (!p) continue;
      const [local, name] = p.split(/\s+as\s+/).map((s) => s.trim());
      out.push({ name: name || local, local, source: m[3] || null });
    }
  }
  for (const m of code.matchAll(/export\s+\*\s+from\s+['"]([^'"]+)['"]/g)) out.push({ star: true, source: m[1] });
  return out;
}

// The text between a bracket at `open` and its match (strings skipped).
export function balanced(code, open) {
  const pairs = { '(': ')', '{': '}', '[': ']', '<': '>' };
  const o = code[open], c = pairs[o];
  let d = 0;
  for (let i = open; i < code.length; i++) {
    const ch = code[i];
    if (ch === '"' || ch === "'" || ch === '`') { const q = ch; i++; while (i < code.length && code[i] !== q) { if (code[i] === '\\') i++; i++; } continue; }
    if (o === '<' && ch === '=' && code[i + 1] === '>') { i++; continue; }
    if (ch === o) d++;
    else if (ch === c) { d--; if (d === 0) return code.slice(open + 1, i); }
  }
  return code.slice(open + 1);
}

// Split at a separator outside brackets and strings.
export function splitTop(text, seps = [',']) {
  const out = [];
  let d = 0, cur = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' || ch === "'" || ch === '`') { const q = ch; let j = i + 1; while (j < text.length && text[j] !== q) { if (text[j] === '\\') j++; j++; } cur += text.slice(i, j + 1); i = j; continue; }
    if ('([{<'.includes(ch)) d++;
    if (')]}>'.includes(ch) && !(ch === '>' && text[i - 1] === '=')) d--;
    if (d === 0 && seps.includes(ch)) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

// `type X = …` and `interface X … { … }` of a file: members of object types, literal unions.
export function readTypes(code) {
  const types = {};
  for (const m of code.matchAll(/(?:^|[;\n])\s*(?:export\s+)?type\s+([\w$]+)(?:<[^=]*>)?\s*=\s*/g)) {
    const start = m.index + m[0].length;
    let end = start, d = 0;
    for (; end < code.length; end++) {
      const ch = code[end];
      if ('({[<'.includes(ch)) d++;
      else if (')}]>'.includes(ch) && !(ch === '>' && code[end - 1] === '=')) d--;
      else if (d <= 0 && (ch === ';' || (ch === '\n' && /^\s*(export|type|interface|const|function|import|let|class)\b/.test(code.slice(end + 1, end + 40))))) break;
    }
    types[m[1]] = typeOf(code.slice(start, end).trim());
  }
  for (const m of code.matchAll(/(?:^|[;\n])\s*(?:export\s+)?interface\s+([\w$]+)(?:<[^{]*?>)?\s*(?:extends\s+([^{]+))?\{/g)) {
    const open = m.index + m[0].length - 1;
    types[m[1]] = { kind: 'object', members: members(balanced(code, open)), extends: m[2] ? splitTop(m[2]).map((s) => s.trim()) : [] };
  }
  return types;
}

// A type expression: an object literal, a union of literals, an intersection, a reference.
export function typeOf(text) {
  text = text.trim().replace(/;$/, '');
  const parts = splitTop(text, ['&']);
  if (parts.length > 1) return { kind: 'and', parts: parts.map(typeOf) };
  if (text.startsWith('{')) return { kind: 'object', members: members(balanced(text, 0)), extends: [] };
  const alts = splitTop(text, ['|']);
  if (alts.length && alts.every((a) => /^(['"]).*\1$|^-?\d+(\.\d+)?$|^(true|false)$/.test(a))) return { kind: 'union', values: alts.map((a) => a.replace(/^['"]|['"]$/g, '')) };
  if (alts.length > 1) return { kind: 'or', parts: alts.map(typeOf) };
  return { kind: 'ref', text };
}

function members(body) {
  const out = [];
  for (const part of splitTop(body, [';', ',', '\n'])) {
    const m = /^(?:readonly\s+)?(['"]?[\w$-]+['"]?)(\?)?\s*:\s*([\s\S]+)$/.exec(part.trim());
    if (!m) continue;
    out.push({ name: m[1].replace(/['"]/g, ''), optional: !!m[2], type: m[3].trim() });
  }
  return out;
}
