// Adapter for React (TSX/JSX) projects. Global CSS classes are read by the
// html-css adapter (one inventory for `.g-btn` and `<Button>`); the JSX side adds the
// `react` facts: components, calls, raw elements, trees with their context, texts, CSS
// modules. Dependency-free: TSX is read by lib/jsx.mjs, nothing needs `node_modules`.
import fs from 'node:fs';
import path from 'node:path';
import { readText, walk, relPosix, readJson } from '../lib/fsutil.mjs';
import { ignoreMatcher, scopeMatcher } from '../lib/config.mjs';
import { parseCss, eachRule, splitTopLevel, classesIn, pseudoByClass, INTERACTIVE, varsUsed } from '../lib/css.mjs';
import { readTsx, stripComments, readImports, readExports, readTypes, typeOf, balanced, splitTop } from '../lib/jsx.mjs';
import { scan as scanClasses } from './html-css.mjs';

const CODE = /\.(tsx|jsx|ts|js|mjs)$/;
const MARKUP = /\.(tsx|jsx)$/;
// Not product code.
export const NOT_PRODUCT = /(^|\/)(__tests__|__mocks__|mocks?|fixtures?|stories|storybook|\.storybook|testing)(\/|$)|\.(test|spec|stories|story|d)\.[jt]sx?$/;
export const CSS_MODULE = /\.module\.(s?css|sass|less)$/;
const RAW = new Set(['button', 'a', 'input', 'select', 'textarea']);
const isComponentName = (n) => /^[A-Z]/.test(n.split('.')[0]);

// tsconfig.json is JSON with comments and trailing commas.
function readJsonc(file) {
  const text = readText(file);
  if (text == null) return null;
  try { return JSON.parse(stripComments(text).replace(/,(\s*[}\]])/g, '$1')); } catch { return null; }
}

export function aliasesOf(root) {
  const ts = readJsonc(path.join(root, 'tsconfig.json')) || readJsonc(path.join(root, 'jsconfig.json')) || {};
  const base = ts.compilerOptions?.baseUrl || '.';
  const list = Object.entries(ts.compilerOptions?.paths || {}).map(([from, to]) => ({
    prefix: from.replace(/\*$/, ''), wild: from.endsWith('*'), targets: (to || []).map((t) => path.posix.join(base, t).replace(/\*$/, '')),
  }));
  // `baseUrl` alone resolves bare paths too: `features/x` → `<baseUrl>/features/x`.
  if (ts.compilerOptions?.baseUrl) list.push({ prefix: '', wild: true, targets: [base === '.' ? '' : base.replace(/\/?$/, '/')], baseUrl: true });
  return list;
}

export function scan(root, config) {
  // ── classes: the html-css adapter, CSS modules left to us ──
  const base = scanClasses(root, { ...config, __cssModules: CSS_MODULE, __stringsOnly: true });

  const isIgnored = ignoreMatcher(root, config);
  const scopeOf = scopeMatcher(config.scopes);
  const all = walk(root, isIgnored);
  const fileSet = new Set(all);
  const code = all.filter((f) => CODE.test(f) && !NOT_PRODUCT.test(f));
  const aliases = aliasesOf(root);

  // Module resolution: relative paths and tsconfig aliases; packages stay unresolved.
  const EXT = ['', '.tsx', '.ts', '.jsx', '.js', '.mjs', '/index.tsx', '/index.ts', '/index.jsx', '/index.js'];
  const tryFile = (p) => { for (const e of EXT) { const f = path.posix.normalize(p + e); if (fileSet.has(f)) return f; } return null; };
  const resolve = (from, spec) => {
    if (spec.startsWith('.')) return tryFile(path.posix.join(path.posix.dirname(from), spec));
    for (const a of aliases) {
      if (a.wild ? spec.startsWith(a.prefix) : spec === a.prefix) {
        for (const t of a.targets) { const f = tryFile(a.wild ? t + spec.slice(a.prefix.length) : t); if (f) return f; }
      }
    }
    return null;
  };

  // ── read every file once ──
  const files = new Map();
  for (const f of code) {
    const src = readText(path.join(root, f), '');
    const stripped = stripComments(src);
    const info = { file: f, src, imports: readImports(stripped), exports: readExports(stripped), types: readTypes(stripped) };
    if (MARKUP.test(f) || /<[A-Za-z]/.test(stripped)) Object.assign(info, readTsx(src));
    info.elements ||= [];
    info.decls ||= [];
    files.set(f, info);
  }

  // Where an exported name is defined, through barrels (`export { X } from`, `export *`).
  const defOf = (file, name, seen = new Set()) => {
    const key = `${file}#${name}`;
    if (seen.has(key) || seen.size > 12) return null;
    seen.add(key);
    const info = files.get(file);
    if (!info) return null;
    for (const e of info.exports) {
      if (e.star || e.name !== name) continue;
      if (e.source) { const t = resolve(file, e.source); return t ? defOf(t, e.local === 'default' ? 'default' : e.local, seen) : null; }
      const local = e.local;
      // `export { X }` of an imported binding.
      const imp = info.imports.find((i) => i.default === local || i.named.some((n) => n.local === local));
      if (imp && !info.decls.some((d) => d.name === local)) {
        const t = resolve(file, imp.source);
        const imported = imp.default === local ? 'default' : imp.named.find((n) => n.local === local).imported;
        return t ? defOf(t, imported, seen) : null;
      }
      return { file, name: local };
    }
    for (const e of info.exports.filter((x) => x.star)) {
      const t = resolve(file, e.source);
      const d = t && defOf(t, name, seen);
      if (d) return d;
    }
    return null;
  };
  // The definition behind a name used in a file: a local declaration or an import.
  const bindingOf = (info, name) => {
    const head = name.split('.')[0];
    if (info.decls.some((d) => d.name === head)) return { file: info.file, name: head };
    for (const imp of info.imports) {
      const t = imp.source && resolve(info.file, imp.source);
      if (!t) continue;
      if (imp.default === head) return defOf(t, 'default') || { file: t, name: 'default' };
      const n = imp.named.find((x) => x.local === head);
      if (n) return defOf(t, n.imported) || { file: t, name: n.imported };
    }
    return null;
  };
  // Barrels each definition is exported from (index.ts files).
  const barrelsOf = new Map();
  for (const info of files.values()) {
    if (!/\/index\.[jt]sx?$/.test(info.file)) continue;
    for (const e of info.exports) {
      if (e.star) { const t = resolve(info.file, e.source); const ti = t && files.get(t); if (ti) for (const x of ti.exports.filter((y) => !y.star)) { const d = defOf(t, x.name); if (d) (barrelsOf.get(`${d.file}#${d.name}`) || barrelsOf.set(`${d.file}#${d.name}`, new Set()).get(`${d.file}#${d.name}`)).add(info.file); } continue; }
      const d = defOf(info.file, e.name);
      if (d) (barrelsOf.get(`${d.file}#${d.name}`) || barrelsOf.set(`${d.file}#${d.name}`, new Set()).get(`${d.file}#${d.name}`)).add(info.file);
    }
  }

  // ── messages ──
  const messages = new Map();
  const msgDir = config.messages?.dir;
  if (msgDir) {
    const dir = config.messages.lang ? path.posix.join(msgDir, config.messages.lang) : msgDir;
    for (const f of all.filter((x) => x.startsWith(dir + '/') && x.endsWith('.json'))) {
      const ns = path.posix.basename(f, '.json');
      const flat = (obj, pre) => { for (const [k, v] of Object.entries(obj || {})) { const key = pre ? `${pre}.${k}` : k; if (v && typeof v === 'object') flat(v, key); else if (typeof v === 'string') messages.set(key, v); } };
      flat(readJson(path.join(root, f)), ns);
    }
  }

  // ── CSS modules ──
  const modules = new Map(); // file -> { classes: {cls: {pseudo:[]}}, importers:Set }
  const moduleOf = (file) => {
    if (!modules.has(file)) {
      const classes = {};
      eachRule(parseCss(readText(path.join(root, file), '')), (rule) => {
        for (const sel of splitTopLevel(rule.prelude)) {
          for (const c of classesIn(sel)) classes[c] ||= { pseudo: [] };
          for (const [c, ps] of Object.entries(pseudoByClass(sel))) if (classes[c]) classes[c].pseudo = [...new Set([...classes[c].pseudo, ...ps.filter((p) => INTERACTIVE.includes(p))])];
        }
      });
      const src = readText(path.join(root, file), '');
      modules.set(file, { file, classes, tokens: varsUsed(src).sort(), importers: new Set() });
    }
    return modules.get(file);
  };

  // ── per file: components, calls, raw elements, trees ──
  const components = [];
  const calls = [];
  const raw = [];
  // Class sets on one element: which classes go together (a family needs `g-btn` next to `g-btn-primary`).
  const classSets = new Map();
  const trees = [];
  for (const info of files.values()) {
    if (!info.elements.length) continue;
    const scope = scopeOf(info.file);
    // CSS-module bindings: `import styles from './x.module.css'`.
    const moduleVars = new Map();
    for (const imp of info.imports) {
      if (!CSS_MODULE.test(imp.source)) continue;
      const t = imp.source.startsWith('.') ? path.posix.normalize(path.posix.join(path.posix.dirname(info.file), imp.source)) : resolve(info.file, imp.source);
      if (!t || !fileSet.has(t)) continue;
      moduleOf(t).importers.add(info.file);
      if (imp.default) moduleVars.set(imp.default, t);
      if (imp.namespace) moduleVars.set(imp.namespace, t);
    }
    // Translators: `const t = useTranslations('ns')` / `await getTranslations({ namespace: 'ns' })`.
    const translators = new Map();
    for (const m of info.src.matchAll(/(?:const|let)\s+([\w$]+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*(?:['"]([\w.-]+)['"]|\{[^}]*?namespace:\s*['"]([\w.-]+)['"][^}]*\})?\s*\)/g)) translators.set(m[1], m[2] || m[3] || '');
    const textsIn = (codeText) => {
      const out = [];
      for (const m of String(codeText).matchAll(/\b([\w$]+)(?:\.rich|\.markup|\.raw)?\(\s*['"]([\w.-]+)['"]/g)) {
        if (!translators.has(m[1])) continue;
        const ns = translators.get(m[1]);
        const key = ns ? `${ns}.${m[2]}` : m[2];
        out.push({ key, text: messages.get(key) ?? null });
      }
      return out;
    };

    const classesOf = (el) => {
      const a = el.attrs.find((x) => x.name === 'className' || x.name === 'class');
      if (!a) return { global: [], module: [] };
      if (a.value != null) return { global: a.value.split(/\s+/).filter(Boolean), module: [] };
      const expr = a.expr || '';
      const global = [], module = [];
      // CSS-module references first, then string literals (not compared values).
      for (const m of expr.matchAll(/\b([\w$]+)(?:\.([\w$-]+)|\[\s*['"]([\w-]+)['"]\s*\]|\[([^\]'"]+)\])/g)) {
        const f = moduleVars.get(m[1]);
        if (f) module.push(`${f}#${m[2] || m[3] || '*'}`);
      }
      for (const m of expr.matchAll(/(===?|!==?)?\s*(['"`])((?:\\.|(?!\2)[^\\])*)\2/g)) {
        if (m[1]) continue;
        const text = m[3].replace(/\$\{[^}]*\}/g, ' ');
        global.push(...text.split(/\s+/).filter((c) => /^-?[_a-zA-Z][\w-]*$/.test(c)));
      }
      return { global: [...new Set(global)], module: [...new Set(module)] };
    };

    // Components defined here.
    const exported = new Set(info.exports.filter((e) => !e.source && !e.star).map((e) => e.local));
    for (const d of info.decls) {
      if (!/^[A-Z]/.test(d.name) || !['function', 'const', 'let'].includes(d.kind)) continue;
      const own = info.elements.filter((e) => e.decl === d.name);
      if (!own.length) continue;
      const next = info.decls.find((x) => x.start > d.start);
      const body = stripComments(info.src.slice(d.start, next ? next.start : info.src.length));
      const props = propsOf(body, d, info, (name) => typeIn(info, name, resolve, files));
      const roots = own.filter((e) => e.parent < 0 || info.elements[e.parent].decl !== d.name);
      components.push({
        name: d.name, file: info.file, line: d.line, scope: scope.name, library: scope.library,
        exported: d.exported || exported.has(d.name), barrels: [...(barrelsOf.get(`${info.file}#${d.name}`) || [])].sort(),
        props: props.list, extends: props.extends,
        root: roots[0]?.name || null,
        renders: [...new Set(own.map((e) => e.name).filter(isComponentName))].sort(),
        uses: 0,
      });
    }

    // The text of an expression; of a conditional, the last branch's — the state at rest
    // (`loading ? t('sending') : t('send')`).
    const exprText = (code) => {
      const ts = textsIn(code).filter((x) => x.text);
      return ts.length ? (/\?[\s\S]*:/.test(code) ? ts[ts.length - 1] : ts[0]).text : null;
    };
    // The first text inside an element, however deep: literal or a translation.
    const textOf = (el, depth = 0) => {
      const own = el.texts[0] || el.exprs.map((x) => exprText(x.code)).find(Boolean);
      if (own || depth > 4) return own || null;
      for (const c of el.children) { const t = textOf(info.elements[c], depth + 1); if (t) return t; }
      return null;
    };

    // Elements: calls of components, raw elements.
    for (let k = 0; k < info.elements.length; k++) {
      const el = info.elements[k];
      if (!el.name) continue;
      const cls = classesOf(el);
      if (cls.global.length) {
        const key = [...new Set(cls.global)].sort().join(' ');
        const e = classSets.get(key) || classSets.set(key, { classes: key, count: 0, tags: {} }).get(key);
        e.count++;
        e.tags[el.name] = (e.tags[el.name] || 0) + 1;
      }
      for (const m of cls.module) { const [f] = m.split('#'); if (modules.has(f)) modules.get(f).importers.add(info.file); }
      if (isComponentName(el.name)) {
        const def = bindingOf(info, el.name);
        calls.push({
          component: def ? `${def.file}#${def.name}` : el.name, name: el.name, file: info.file, line: el.line, scope: scope.name,
          props: Object.fromEntries(el.attrs.map((a) => [a.name, a.value ?? (a.bool ? true : `{${(a.expr || '').slice(0, 80)}}`)])),
          // Its text: literal, or a translation (the gallery draws the call with it).
          text: el.texts[0] || el.exprs.map((x) => exprText(x.code)).find(Boolean) || null,
          // Props given a translation (`text={t('subscribe')}`): their texts.
          propTexts: Object.fromEntries(el.attrs.filter((x) => x.expr).map((x) => [x.name, exprText(x.expr)]).filter(([, t]) => t)),
        });
      } else if (RAW.has(el.name) || el.attrs.some((a) => a.name === 'role')) {
        const attr = (n) => { const a = el.attrs.find((x) => x.name === n); return a ? (a.value ?? (a.bool ? true : `{${(a.expr || '').slice(0, 60)}}`)) : undefined; };
        raw.push({ tag: el.name, file: info.file, line: el.line, scope: scope.name, classes: cls.global, modules: cls.module, type: attr('type'), role: attr('role'), href: attr('href') !== undefined || undefined, disabled: attr('disabled') !== undefined || undefined, onClick: attr('onClick') !== undefined || undefined, text: textOf(el) });
      }
    }

    // Trees: every root and every element placed from code (`{cond && <X/>}`, `.map`, `? :`).
    const kids = (k) => info.elements[k].children;
    const signature = (k, depth = 0) => {
      const el = info.elements[k];
      const cls = classesOf(el).global.map((c) => c.split(/__|--/)[0]);
      const head = (el.name || '<>') + (cls.length ? '.' + [...new Set(cls)].sort().join('.') : '');
      if (depth >= 4) return head;
      const parts = [];
      for (const c of kids(k)) { const s = signature(c, depth + 1); if (parts[parts.length - 1] !== s) parts.push(s); }
      if (el.texts.length) parts.unshift('#text');
      return parts.length ? `${head}[${parts.join(',')}]` : head;
    };
    const subtree = (k) => { const out = [k]; for (let j = 0; j < out.length; j++) out.push(...kids(out[j])); return out; };
    for (let k = 0; k < info.elements.length; k++) {
      const el = info.elements[k];
      const placed = el.ctx && el.ctx.before != null;
      if (el.parent >= 0 && !placed) continue;
      const nodes = subtree(k).map((j) => info.elements[j]);
      const texts = [];
      for (const n of nodes) {
        n.texts.forEach((t) => texts.push({ text: t }));
        n.exprs.forEach((x) => texts.push(...textsIn(x.code)));
        n.attrs.filter((a) => a.expr && !a.name.startsWith('on')).forEach((a) => texts.push(...textsIn(a.expr)));
      }
      trees.push({
        file: info.file, line: el.line, decl: el.decl, scope: scope.name, root: el.name || '<>',
        size: nodes.length, signature: signature(k),
        context: contextOf(el.ctx?.before || ''),
        handlers: [...new Set(nodes.flatMap((n) => n.attrs.filter((a) => /^on[A-Z]/.test(a.name)).map((a) => `${a.name}=${(a.expr || '').slice(0, 60)}`)))].slice(0, 12),
        components: [...new Set(nodes.map((n) => n.name).filter((n) => n && isComponentName(n)))].sort(),
        classes: [...new Set(nodes.flatMap((n) => classesOf(n).global))].sort(),
        // What the block is made of — the slots of a composite are read from these.
        parts: partsOf(nodes, classesOf),
        // Project components inside: a slot the block lacks may be in their own tree.
        inner: [...new Set(nodes.slice(1).filter((n) => n.name && isComponentName(n.name)).map((n) => bindingOf(info, n.name)).filter(Boolean).map((d) => `${d.file}#${d.name}`))].slice(0, 10),
        tags: [...new Set(nodes.map((n) => n.name).filter((n) => n && !isComponentName(n)))].sort(),
        roles: [...new Set(nodes.flatMap((n) => n.attrs.filter((a) => a.name === 'role' && a.value).map((a) => a.value)))],
        links: [...new Set(nodes.flatMap((n) => n.attrs.filter((a) => a.name === 'href' && /^https?:/.test(a.value || '')).map((a) => a.value.replace(/^https?:\/\/(www\.)?/, '').split('/')[0])))].sort(),
        // An expression's code holds the JSX nested in it too: one entry per text.
        texts: [...new Map(texts.map((x) => [`${x.key || ''}|${x.text}`, x])).values()].slice(0, 20),
      });
    }
  }

  // Uses per component.
  const byKey = new Map(components.map((c) => [`${c.file}#${c.name}`, c]));
  for (const c of calls) { const comp = byKey.get(c.component); if (comp) comp.uses++; }

  // ── scope of the react facts ──
  const react = {
    aliases: aliases.map((a) => ({ from: a.baseUrl ? '(baseUrl)' : a.prefix + (a.wild ? '*' : ''), to: a.targets })),
    components: components.sort((a, b) => b.library - a.library || a.file.localeCompare(b.file) || a.line - b.line),
    calls, raw, trees,
    modules: [...modules.values()].map((m) => ({ file: m.file, classes: m.classes, tokens: m.tokens, importers: [...m.importers].sort() })).sort((a, b) => a.file.localeCompare(b.file)),
    classSets: [...classSets.values()].sort((a, b) => b.count - a.count || a.classes.localeCompare(b.classes)),
    messages: { files: msgDir ? all.filter((x) => x.startsWith(msgDir + '/') && x.endsWith('.json')).length : 0, keys: messages.size },
  };
  return { ...base, react };
}

// The anatomy of a block: how many headings, media, texts, actions, fields, lists and
// close controls it has.
const PART = {
  heading: (n, cls) => /^h[1-6]$/.test(n.name) || cls.some((c) => /(^|[-_])(title|heading)($|[-_])|[-_]header$|[a-z](Title|Heading|Header)$/.test(c)),
  media: (n) => /^(img|svg|picture|video)$/.test(n.name) || /(Icon|Avatar|Image|Logo|Illustration|Picture)$/.test(n.name),
  action: (n) => /^(button|a)$/.test(n.name) || /(Button|Btn|Link)$/.test(n.name),
  field: (n) => /^(input|select|textarea)$/.test(n.name) || /(Input|Select|Textarea|TextArea|Checkbox|Radio|Switch|Switcher|Field|Autocomplete|Picker|Dropdown)$/.test(n.name),
  list: (n) => /^(ul|ol|dl|table)$/.test(n.name) || !!n.ctx?.before && /\.map\(/.test(n.ctx.before.slice(-80)),
  // `aria-label` literal or a translation's key (`t('close')`), a class with a close part.
  close: (n, cls = []) => n.attrs.some((a) => (a.name === 'aria-label' && /закр|close/i.test(a.value ?? a.expr ?? '')) || a.name === 'onClose') || /Close/.test(n.name)
    || cls.some((c) => /(^|[-_])close($|[-_])|^close[A-Z]|[a-z]Close(Button|Btn|Icon)?$/.test(c)),
};
// Content passed to a component by props (`<ModalBase title=… description=… onConfirm=…>`)
// is part of the block too.
const PROP_PART = {
  heading: /^(title|heading|header|caption)$/i,
  text: /^(text|description|subtitle|message|body|content|hint)$/i,
  action: /^(onConfirm|onSubmit|actions|footer|primaryAction|secondaryAction|buttonText|ctaText|cta|confirmText)$/i,
  media: /^(image|icon|illustration|imageSrc|iconSrc|img|picture)$/i,
};
// A text from code: a translation call by any translator's name, or a plain value.
const TEXT_EXPR = /^\s*(?:(?:t|[a-z][\w$]*T|t[A-Z][\w$]*)(?:\.\w+)?\s*\([\s\S]*\)|[\w$]+(?:\??\.[\w$]+)*)\s*$/;
// Content the block takes from elsewhere: the body of a dialog, a sheet, a section.
const CONTENT_EXPR = /^\s*(?:props\.)?children\s*$|(?:^|[^\w$.])render[A-Z]\w*\s*\(/;
function partsOf(nodes, classesOf) {
  const out = { heading: 0, media: 0, text: 0, action: 0, field: 0, list: 0, close: 0, content: 0 };
  nodes.forEach((n, i) => {
    const cls = classesOf(n).global.concat(classesOf(n).module.map((m) => m.split('#')[1] || ''));
    let known = false;
    for (const [k, test] of Object.entries(PART)) if (test(n, cls)) { out[k]++; known = true; }
    if (isComponentName(n.name || '')) for (const a of n.attrs) for (const [k, re] of Object.entries(PROP_PART)) if (re.test(a.name)) out[k]++;
    if (n.attrs.some((a) => a.name === 'dangerouslySetInnerHTML')) out.content++;
    // A component that is none of the parts brings its own content (not the block's root).
    if (i > 0 && !known && isComponentName(n.name || '')) out.content++;
    for (const x of n.exprs) if (CONTENT_EXPR.test(x.code)) out.content++;
    const fromCode = n.exprs.some((x) => !CONTENT_EXPR.test(x.code) && TEXT_EXPR.test(x.code));
    if (!PART.heading(n, cls) && !PART.action(n) && (n.texts.length || fromCode)) out.text++;
  });
  // A second heading is a text under the first (a subtitle, a lead).
  if (out.heading > 1) { out.text += out.heading - 1; out.heading = 1; }
  return out;
}

// Where a placed element sits, from the code just before it.
export function contextOf(before) {
  const b = before.replace(/\s+/g, ' ');
  const ctx = {};
  if (/\.map\(\s*(?:\([^()]*\)|[\w$]+)\s*=>\s*\(?\s*$/.test(b) || /\.map\(\s*(?:\([^()]*\)|[\w$]+)\s*=>\s*\{[^{}]*return\s*\(?\s*$/.test(b)) {
    ctx.map = true;
    // What it walks: `candidates.map(` → candidates (the entity of a snippet).
    const of = [...b.matchAll(/([\w$]+)\??\.(?:slice\([^)]*\)\.|filter\([^)]*\)\.)?map\(/g)].pop();
    if (of) ctx.of = of[1];
  }
  const early = /if\s*\(((?:[^()]|\([^()]*\))*)\)\s*\{?\s*return\s*\(?\s*$/.exec(b);
  if (early) ctx.early = early[1].trim();
  const and = /(?:^|[{(,]|\breturn\b|&&|\|\|)\s*([^{}();?:]*?(?:\([^()]*\)[^{}();?:]*?)*)\s*&&\s*\(?\s*$/.exec(b);
  if (and && !ctx.early) ctx.cond = and[1].trim();
  const then = /(?:^|[{(,=]|\breturn\b)\s*([^{}();?:]*?(?:\([^()]*\)[^{}();?:]*?)*)\s*\?\s*\(?\s*$/.exec(b);
  if (then && !ctx.cond && !ctx.early) { ctx.cond = then[1].trim(); ctx.branch = 'then'; }
  else if (/:\s*\(?\s*$/.test(b) && !ctx.cond && !ctx.early) {
    const q = /([^{}();?:]*?(?:\([^()]*\)[^{}();?:]*?)*)\s*\?[^?]*:\s*\(?\s*$/.exec(b);
    if (q) { ctx.cond = q[1].trim(); ctx.branch = 'else'; }
  }
  // What a component returns, not a JSX constant above it.
  if (!ctx.map && !ctx.cond && !ctx.early && /(?:\breturn|=>)\s*\(?\s*$/.test(b)) ctx.returned = true;
  return ctx;
}

// Props of a component: the first parameter (destructured names, defaults) and its type.
function propsOf(body, decl, info, typeIn) {
  let params = null, typeText = null;
  if (decl.kind === 'function') {
    const open = body.indexOf('(', body.indexOf(decl.name));
    if (open >= 0) params = balanced(body, open);
  } else {
    const eq = body.indexOf('=', body.indexOf(decl.name));
    const annot = /:\s*(?:React\.)?(?:FC|FunctionComponent|VFC)\s*<([^>]+)>/.exec(body.slice(0, eq));
    if (annot) typeText = annot[1];
    let rest = body.slice(eq + 1);
    // forwardRef<El, Props>((props, ref) => …) / memo(…)
    const wrap = /^\s*(?:React\.)?(?:forwardRef|memo)\s*(<[^(]*>)?\s*\(/.exec(rest);
    if (wrap) {
      if (wrap[1] && !typeText) { const g = splitTop(wrap[1].slice(1, -1)); if (g.length > 1) typeText = g[1]; }
      rest = rest.slice(wrap[0].length);
      const inner = /^\s*(?:function\s*[\w$]*\s*)?\(/.exec(rest);
      if (inner) params = balanced(rest, inner[0].length - 1);
    } else {
      const open = /^\s*(?:async\s+)?(?:<[^>]*>\s*)?\(/.exec(rest);
      if (open) params = balanced(rest, open[0].length - 1);
    }
  }
  const first = params ? splitTop(params)[0] || '' : '';
  const list = new Map();
  const ext = new Set();
  // `{ a, b = 'x', ...rest }: Props`
  const head = first.trim();
  const destr = head.startsWith('{') ? (() => {
    const inner = balanced(head, 0);
    const after = head.slice(inner.length + 2).trim();
    return [null, inner, after.startsWith(':') ? after.slice(1).trim() : null];
  })() : null;
  if (destr) {
    for (const p of splitTop(destr[1])) {
      if (p.startsWith('...')) continue;
      const m = /^([\w$]+)(?:\s*:\s*[\w$]+)?(?:\s*=\s*([\s\S]+))?$/.exec(p.trim());
      if (m) list.set(m[1], { name: m[1], default: m[2] ? m[2].trim().replace(/^['"]|['"]$/g, '') : undefined });
    }
    if (destr[2] && !typeText) typeText = destr[2];
  } else {
    const named = /^([\w$]+)\s*(?::\s*([\s\S]+))?$/.exec(first.trim());
    if (named?.[2] && !typeText) typeText = named[2];
    // `const { size = 'm', … } = props` in the body: the defaults live there.
    const inBody = named && new RegExp(`(?:const|let)\\s*\\{([^}]*)\\}\\s*=\\s*${named[1]}\\b`).exec(body);
    if (inBody) for (const p of splitTop(inBody[1])) {
      const m = /^([\w$]+)(?:\s*:\s*[\w$]+)?(?:\s*=\s*([\s\S]+))?$/.exec(p.trim());
      if (m) list.set(m[1], { name: m[1], default: m[2] ? m[2].trim().replace(/^['"]|['"]$/g, '') : undefined });
    }
  }
  const addType = (t, depth = 0) => {
    if (!t || depth > 10) return;
    // `A & B` adds both; `A | B` (a button or a link) — every prop of either variant.
    if (t.kind === 'and' || t.kind === 'or') return t.parts.forEach((p) => addType(p, depth + 1));
    if (t.kind === 'object') {
      for (const m of t.members) {
        const vt = typeOf(m.type);
        const values = vt.kind === 'union' ? vt.values : vt.kind === 'ref' ? typeIn(vt.text)?.values || null : null;
        const prev = list.get(m.name) || { name: m.name };
        const merged = values || prev.values ? [...new Set([...(prev.values || []), ...(values || [])])] : null;
        list.set(m.name, { ...prev, type: prev.type && prev.type !== m.type ? `${prev.type} | ${m.type}` : m.type, optional: m.optional || !!prev.optional, ...(merged ? { values: merged } : {}) });
      }
      (t.extends || []).forEach((e) => { const r = typeIn(e); if (r) addType(r, depth + 1); else ext.add(e); });
      return;
    }
    if (t.kind === 'ref') { const r = typeIn(t.text); if (r) addType(r, depth + 1); else ext.add(t.text); }
  };
  if (typeText) addType(typeOf(typeText));
  return { list: [...list.values()], extends: [...ext] };
}

// A named type visible in a file: its own, or imported (one hop).
function typeIn(info, name, resolve, files) {
  const n = String(name).trim().replace(/<[\s\S]*>$/, '');
  if (info.types[n]) return info.types[n].kind === 'union' ? info.types[n] : info.types[n];
  for (const imp of info.imports) {
    const hit = imp.named.find((x) => x.local === n);
    if (!hit) continue;
    const t = resolve(info.file, imp.source);
    const ti = t && files.get(t);
    if (ti?.types[hit.imported]) return ti.types[hit.imported];
    // re-exported through a barrel
    if (ti) for (const e of ti.exports.filter((x) => x.star || x.name === hit.imported)) {
      const t2 = e.source && resolve(ti.file, e.source);
      const t2i = t2 && files.get(t2);
      if (t2i?.types[hit.imported]) return t2i.types[hit.imported];
    }
  }
  return null;
}
