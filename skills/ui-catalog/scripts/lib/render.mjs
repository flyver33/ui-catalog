// The render of React implementations for the gallery.
// Runs in Node at build time; the gallery gets static HTML. React, react-dom/server and
// TypeScript come from the project's node_modules — the scripts themselves stay
// dependency-free. Without TypeScript the JSX is ours (lib/jsx-transform.mjs) and the types
// go by Node's own stripping.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as nodeModule from 'node:module';
import { pathToFileURL } from 'node:url';
import { readText, readJson, relPosix, sha1 } from './fsutil.mjs';
import { aliasesOf, CSS_MODULE } from '../adapters/react.mjs';
import { jsxToCalls } from './jsx-transform.mjs';
import { rebaseCss } from './public.mjs';

const ASSET = /\.(svg|png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|mp4|webm)$/i;
const STYLE = /\.(css|s[ac]ss|less)$/i;
const EXT = ['', '.tsx', '.ts', '.jsx', '.js', '.mjs', '/index.tsx', '/index.ts', '/index.jsx', '/index.js'];

// What needs a running app stands in by a module of ours.
const h = (react) => `import * as __R from ${JSON.stringify(react)};\nconst __h = (__R.default || __R).createElement;\n`;
const STUBS = {
  'next/link': (r) => `${h(r)}export default function Link({ href, children, prefetch, replace, scroll, shallow, passHref, legacyBehavior, locale, ...p }) { return __h('a', { href: typeof href === 'string' ? href : (href && href.pathname) || '#', ...p }, children); }\n`,
  'next/image': (r) => `${h(r)}export default function Image({ src, alt, width, height, fill, priority, quality, placeholder, blurDataURL, loader, unoptimized, sizes, ...p }) { return __h('img', { src: typeof src === 'string' ? src : src && src.src, alt, width, height, ...p }); }\n`,
  'next/navigation': () => 'const router = { push() {}, replace() {}, back() {}, forward() {}, prefetch() {}, refresh() {} };\nexport const useRouter = () => router; export const usePathname = () => "/"; export const useSearchParams = () => new URLSearchParams(); export const useParams = () => ({}); export const useSelectedLayoutSegment = () => null; export const redirect = () => {}; export const notFound = () => {};\n',
  'next/router': () => 'export const useRouter = () => ({ push() {}, replace() {}, back() {}, prefetch() {}, pathname: "/", query: {}, asPath: "/", events: { on() {}, off() {} } }); export default { push() {} };\n',
  'next/dynamic': () => 'export default () => () => null;\n',
  'next/head': () => 'export default () => null;\n',
  'next/script': () => 'export default () => null;\n',
};
// react-dom: the project's own, with a portal drawn in place.
const portal = (dom) => `import * as __D from ${JSON.stringify(dom)};
const D = __D.default || __D;
export const createPortal = (children) => children;
export const flushSync = (f) => (typeof f === 'function' ? f() : undefined);
export default { ...D, createPortal, flushSync };
`;
// A component that waits for the browser (`const [mounted, setMounted] = useState(false)`,
// set in an effect) renders as mounted: effects never run in a static render.
const MOUNTED = /(\[\s*(?:mounted|isMounted|hasMounted|isClient|isBrowser|hydrated|isHydrated)\s*,\s*[\w$]+\s*\]\s*=\s*(?:\(0,\s*)?(?:[\w$]+\.)?useState\)?\()\s*false\s*\)/g;
// `document` while a frame renders: `createPortal(…, document.body)` needs one.
const DOCUMENT = { body: {}, head: {}, documentElement: { style: {} }, cookie: '', getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }), addEventListener() {}, removeEventListener() {} };

// A context the render's error names: the project's `XProvider`, or react-hook-form's form.
const NAMED_PROVIDER = /\b(?:must|should|can only)\s+be\s+used\s+(?:with)?in(?:side)?\s+(?:an?\s+|the\s+)?<?([A-Z][\w$]*Provider)\b/;
const EMPTY_FORM = /useFormContext\(\.\.\.\)'? as it is (?:null|undefined)|reading '\w+'\)?[^\n]*useFormContext/;

// next-intl: texts from the project's messages, the way the adapter reads them.
const intl = (messages, lang) => `const M = ${JSON.stringify(messages)};
const fmt = (s, v) => { if (v) for (const [a, b] of Object.entries(v)) if (typeof b !== 'function') s = s.split('{' + a + '}').join(String(b)); return s; };
const tr = (ns) => { const key = (k) => (ns ? ns + '.' + k : k); const f = (k, v) => fmt(M[key(k)] ?? M[k] ?? k, v); f.rich = f; f.markup = f; f.raw = (k) => M[key(k)] ?? k; f.has = (k) => key(k) in M; return f; };
export const useTranslations = tr; export const getTranslations = async (o) => tr(typeof o === 'string' ? o : o && o.namespace);
export const useLocale = () => ${JSON.stringify(lang || 'ru')}; export const getLocale = async () => ${JSON.stringify(lang || 'ru')};
export const useFormatter = () => ({ number: (n) => String(n), dateTime: (d) => String(d), relativeTime: (d) => String(d), list: (l) => l.join(', ') });
export const NextIntlClientProvider = ({ children }) => children;
`;

function loadMessages(root, config) {
  const out = {};
  const dir = config.messages?.dir && path.join(root, config.messages.dir, config.messages.lang || '');
  if (!dir || !fs.existsSync(dir)) return out;
  const flat = (obj, pre) => { for (const [k, v] of Object.entries(obj || {})) { const key = pre ? `${pre}.${k}` : k; if (v && typeof v === 'object') flat(v, key); else if (typeof v === 'string') out[key] = v; } };
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) flat(readJson(path.join(dir, f)), path.basename(f, '.json'));
  return out;
}

// Imports become a namespace plus a lookup that falls back to `default` (a CommonJS package,
// a name used only as a type, a module we stand in for): the render never dies on a binding.
function rewriteImports(code, urlOf) {
  let n = 0;
  const pick = 'const __pick = (n) => new Proxy(n, { get: (t, k) => (k in t ? t[k] : t.default != null && (typeof t.default === "object" || typeof t.default === "function") ? t.default[k] : undefined) });\n';
  let used = false;
  code = code.replace(/^([ \t]*)import\s+(?!type\b)([\w$]+\s*,\s*)?(\{[\s\S]*?\}|\*\s+as\s+[\w$]+|[\w$]+)?\s*from\s*(['"])([^'"]+)\4\s*;?/gm, (m, ind, defFirst, clause, q, spec) => {
    let def = null, named = null, star = null;
    if (defFirst) def = defFirst.replace(/[\s,]/g, '');
    if (clause?.startsWith('{')) named = clause;
    else if (clause?.startsWith('*')) star = clause.replace(/^\*\s+as\s+/, '');
    else if (clause) def = clause;
    const names = named ? named.slice(1, -1).split(',').map((s) => s.trim()).filter((s) => s && !s.startsWith('type ')) : [];
    const url = urlOf(spec, names.map((s) => s.split(/\s+as\s+/)[0]));
    const ns = star || `__ns${n++}`;
    const out = [`${ind}import * as ${ns} from ${JSON.stringify(url)};`];
    if (def) out.push(`const ${def} = ${ns}.default !== undefined ? ${ns}.default : ${ns};`);
    if (names.length) { used = true; out.push(`const { ${names.map((s) => s.replace(/\s+as\s+/, ': ')).join(', ')} } = __pick(${ns});`); }
    return out.join(' ');
  });
  code = code.replace(/^([ \t]*)import\s+type\b[^;]*;?/gm, '');
  code = code.replace(/^([ \t]*)import\s*(['"])([^'"]+)\2\s*;?/gm, (m, ind, q, spec) => `${ind}import ${JSON.stringify(urlOf(spec, []))};`);
  code = code.replace(/\bexport\s+(\*(?:\s+as\s+[\w$]+)?|\{[^}]*\})\s*from\s*(['"])([^'"]+)\2/g, (m, what, q, spec) => `export ${what} from ${JSON.stringify(urlOf(spec, []))}`);
  code = code.replace(/\bimport\(\s*(['"])([^'"]+)\1\s*\)/g, (m, q, spec) => `import(${JSON.stringify(urlOf(spec, []))})`);
  return (used ? pick : '') + code;
}

export async function makeRenderer(root, config) {
  const req = nodeModule.createRequire(path.join(root, 'package.json'));
  let reactPath, serverPath;
  let domPath = null;
  try { reactPath = req.resolve('react'); serverPath = req.resolve('react-dom/server'); domPath = req.resolve('react-dom'); } catch {
    return { error: 'в node_modules проекта нет react и react-dom — поставь зависимости проекта (npm ci) и пересобери' };
  }
  let ts = null;
  try { ts = req('typescript'); } catch {}
  const strip = nodeModule.stripTypeScriptTypes;
  if (!ts && !strip) return { error: 'в node_modules проекта нет typescript, а этот Node не умеет убирать типы (нужен 22.13+)' };
  const React = await import(pathToFileURL(reactPath).href);
  const R = React.default || React;
  const server = await import(pathToFileURL(serverPath).href);
  const renderToStaticMarkup = (server.default || server).renderToStaticMarkup;
  const reactUrl = pathToFileURL(reactPath).href;

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-catalog-render-'));
  const aliases = aliasesOf(root);
  const isFile = (rel) => { try { return fs.statSync(path.join(root, rel)).isFile(); } catch { return false; } };
  const tryFile = (p) => { for (const e of EXT) { const f = path.posix.normalize(p + e); if (isFile(f)) return f; } return null; };
  const aliasTargets = (spec) => {
    const out = [];
    for (const a of aliases) if (a.wild ? spec.startsWith(a.prefix) : spec === a.prefix) for (const t of a.targets) out.push(a.wild ? t + spec.slice(a.prefix.length) : t);
    return out;
  };
  const resolvePath = (from, spec) => (spec.startsWith('.') ? [path.posix.normalize(path.posix.join(path.posix.dirname(from), spec))] : aliasTargets(spec));
  const messages = loadMessages(root, config);
  const urls = new Map();
  const modulesCss = new Map(); // project css file → class prefix
  const globalCss = new Set(); // global css a rendered module imports itself
  const write = (key, code) => { const f = path.join(tmp, `${sha1(key)}.mjs`); fs.writeFileSync(f, code); const u = pathToFileURL(f).href; urls.set(key, u); return u; };
  const once = (key, make) => urls.get(key) || write(key, make());
  const missing = 'const S = () => null; export default new Proxy(S, { get: (t, k) => (k === "then" ? undefined : S) });\n';
  const quiet = (fn) => { const e = console.error, w = console.warn, ew = process.emitWarning; console.error = console.warn = () => {}; process.emitWarning = () => {}; try { return fn(); } finally { console.error = e; console.warn = w; process.emitWarning = ew; } };

  function urlOf(from, spec) {
    if (/^(file|node|data):/.test(spec)) return spec;
    if (STYLE.test(spec)) {
      const rel = resolvePath(from, spec).find(isFile);
      if (rel && CSS_MODULE.test(rel)) {
        const prefix = `m${sha1(rel).slice(0, 6)}`;
        modulesCss.set(rel, prefix);
        return once(`css:${rel}`, () => `export default new Proxy({}, { get: (t, k) => (typeof k === 'string' ? ${JSON.stringify(prefix + '_')} + k : undefined) });\n`);
      }
      if (rel && !(config.styles || []).includes(rel)) globalCss.add(rel);
      return once('css', () => 'export default {};\n');
    }
    if (ASSET.test(spec)) {
      const rel = resolvePath(from, spec).find(isFile);
      const href = rel ? `/${rel.replace(/^public\//, '')}` : spec;
      return once(`asset:${href}`, () => `const src = ${JSON.stringify(href)}; export default { src, width: 24, height: 24, toString: () => src };\n`);
    }
    if (STUBS[spec]) return once(`stub:${spec}`, () => STUBS[spec](reactUrl));
    if (spec === 'react-dom') return once('stub:react-dom', () => portal(pathToFileURL(domPath).href));
    if (spec === 'next-intl' || spec === 'next-intl/server') return once('stub:next-intl', () => intl(messages, config.messages?.lang));
    const local = resolvePath(from, spec).map(tryFile).find(Boolean);
    if (local) return moduleUrl(local);
    try { return pathToFileURL(req.resolve(spec)).href; } catch {}
    return once(`missing:${spec}`, () => missing);
  }

  const providerFiles = new Map();
  const providerCache = new Map();
  // The provider an error asks for: the project's own, given its children only; or
  // react-hook-form's FormProvider around the project's useForm().
  async function providerFor(msg) {
    const named = NAMED_PROVIDER.exec(msg)?.[1];
    const key = named && providerFiles.has(named) ? named : EMPTY_FORM.test(msg) ? 'react-hook-form' : null;
    if (!key) return null;
    if (!providerCache.has(key)) {
      let w = null;
      try {
        if (key === 'react-hook-form') {
          const m = await import(pathToFileURL(req.resolve('react-hook-form')).href);
          const rhf = m.useForm ? m : m.default || {};
          if (rhf.useForm && rhf.FormProvider) {
            w = function Form({ children }) { return R.createElement(rhf.FormProvider, rhf.useForm(), children); };
          }
        } else {
          const m = await quiet(() => import(moduleUrl(providerFiles.get(key))));
          const P = m[key] ?? m.default?.[key];
          if (P) w = function Provided({ children }) { return R.createElement(P, null, children); };
          if (w) w.displayName = key;
        }
      } catch {}
      providerCache.set(key, w);
    }
    return providerCache.get(key);
  }

  function moduleUrl(rel) {
    const key = `file:${rel}`;
    if (urls.has(key)) return urls.get(key);
    // The url is known before the code: modules that import each other find it.
    const file = path.join(tmp, `${sha1(key)}.mjs`);
    urls.set(key, pathToFileURL(file).href);
    const src = readText(path.join(root, rel), '');
    let code;
    if (ts) {
      code = ts.transpileModule(src, { fileName: rel, compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020, esModuleInterop: true, isolatedModules: true } }).outputText;
    } else {
      code = /\.[jt]sx$/.test(rel) ? `import { createElement as __h, Fragment as __F } from ${JSON.stringify(reactUrl)};\n${jsxToCalls(src)}` : src;
      if (/\.tsx?$/.test(rel)) code = quiet(() => strip(code, { mode: 'transform' }));
    }
    fs.writeFileSync(file, rewriteImports(code.replace(MOUNTED, '$1true)'), (spec) => urlOf(rel, spec)));
    return urls.get(key);
  }

  return {
    // One implementation: a component of a file with props and a text → HTML, or why not.
    async render({ file, name, props = {}, text = null }) {
      try {
        const mod = await quiet(() => import(moduleUrl(file)));
        const comp = mod[name] ?? mod.default?.[name] ?? (mod.default && (mod.default.name === name || mod.default.displayName === name) ? mod.default : null);
        if (!comp) return { error: `${name} не экспортируется из ${file}` };
        const own = 'document' in globalThis;
        if (!own) globalThis.document = DOCUMENT;
        try {
          // A context the error names: drawn again inside its provider, the first found innermost.
          const wraps = [];
          for (;;) {
            let el = text == null ? R.createElement(comp, props) : R.createElement(comp, props, text);
            for (const w of wraps) el = R.createElement(w, null, el);
            try {
              return { html: quiet(() => renderToStaticMarkup(el)), providers: wraps.map((w) => w.displayName || w.name) };
            } catch (e) {
              const w = wraps.length < 4 ? await providerFor(String(e?.message || e)) : null;
              if (!w || wraps.includes(w)) throw e;
              wraps.push(w);
            }
          }
        } finally { if (!own) delete globalThis.document; }
      } catch (e) {
        return { error: String(e?.message || e).split('\n')[0].slice(0, 200) };
      }
    },
    // The project's exported `*Provider` components: name → file.
    providers(list) { for (const c of list || []) if (c.exported && /Provider$/.test(c.name) && !providerFiles.has(c.name)) providerFiles.set(c.name, c.file); },
    // The CSS modules the rendered components import, their classes renamed as in the HTML.
    modulesCss(galleryDir, pub = () => null) {
      let out = '/* Сгенерировано ui-catalog build: CSS-модули отрисованных компонентов (классы — под именами из кадров) и CSS, где описаны классы кадров. */\n';
      const fix = (css, abs) => rebaseCss(css, path.dirname(abs), galleryDir, pub);
      // The global CSS rendered components import themselves (`import './app-header.css'`).
      for (const rel of globalCss) { const abs = path.join(root, rel); out += `/* ${rel} */\n${fix(readText(abs, ''), abs)}\n`; }
      for (const [rel, prefix] of modulesCss) {
        const abs = path.join(root, rel);
        out += `/* ${rel} */\n${fix(renameClasses(readText(abs, ''), prefix), abs)}\n`;
      }
      return out;
    },
    // A stylesheet outside `styles` that defines a class the frames draw.
    addCss(rel) { if (rel && !(config.styles || []).includes(rel)) globalCss.add(rel); },
    // The widest min-width/max-width each class answers to, in every stylesheet a frame
    // loads: frames with such classes are drawn past it.
    mediaWidths() {
      const out = new Map();
      const scan = (css) => {
        for (const m of css.matchAll(/@media([^{]+)\{/g)) {
          const widths = [...m[1].matchAll(/(?:min|max)-width:\s*(\d+)px/g)].map((x) => Number(x[1]));
          if (!widths.length) continue;
          let depth = 1, i = m.index + m[0].length;
          for (; i < css.length && depth; i++) if (css[i] === '{') depth++; else if (css[i] === '}') depth--;
          for (const c of css.slice(m.index + m[0].length, i).matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) out.set(c[1], Math.max(out.get(c[1]) || 0, ...widths));
        }
      };
      for (const rel of [...(config.styles || []), ...globalCss]) scan(readText(path.join(root, rel), ''));
      for (const [rel, prefix] of modulesCss) scan(renameClasses(readText(path.join(root, rel), ''), prefix));
      return out;
    },
    close() { fs.rmSync(tmp, { recursive: true, force: true }); },
  };
}

// `.button:hover` → `.m1a2b3c_button:hover` in selectors; declarations and at-rule preludes
// stay; `:global(.x)` keeps its class.
export function renameClasses(css, prefix) {
  let out = '', buf = '';
  const stack = []; // 'rule' | 'at'
  const sel = (s) => s.replace(/:global\(([^)]*)\)|\.(-?[_a-zA-Z][\w-]*)/g, (m, g, c) => (g != null ? g : `.${prefix}_${c}`));
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === '/' && css[i + 1] === '*') { const e = css.indexOf('*/', i + 2); const stop = e < 0 ? css.length : e + 2; buf += css.slice(i, stop); i = stop - 1; continue; }
    if (c === '"' || c === "'") { const e = css.indexOf(c, i + 1); const stop = e < 0 ? css.length : e + 1; buf += css.slice(i, stop); i = stop - 1; continue; }
    if (c === '{') {
      const inRule = stack[stack.length - 1] === 'rule';
      // A comment may stand right before `@media`: it is not part of the prelude.
      const at = buf.replace(/\/\*[\s\S]*?\*\//g, '').trim().startsWith('@');
      out += inRule || at ? buf : sel(buf);
      out += c; buf = '';
      stack.push(inRule ? 'rule' : at ? 'at' : 'rule');
      continue;
    }
    if (c === '}') { out += buf + c; buf = ''; stack.pop(); continue; }
    if (c === ';' && stack[stack.length - 1] !== 'rule') { out += buf + c; buf = ''; continue; }
    buf += c;
  }
  return out + buf;
}
