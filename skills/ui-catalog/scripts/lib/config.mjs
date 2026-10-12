// Project config: docs/design-system/catalog.config.json. Detected on first
// scan, then owned by the project (the agent reviews and edits it).
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_EXCLUDE, gitignorePatterns, makeMatcher, walk, readText, readJson, writeJson, relPosix, globToRegex, fail,
} from './fsutil.mjs';
import { customProperties } from './css.mjs';
import { publicResolver } from './public.mjs';
import { detectReference } from './naming.mjs';

export { detectReference };

// The project's name as the project calls itself: package.json, else the first heading of
// README.md / CLAUDE.md / AGENTS.md up to « — » or «:», else the folder name.
export function projectName(root) {
  const pkg = readJson(path.join(root, 'package.json'));
  if (pkg?.name) return String(pkg.name).replace(/^@[^/]+\//, '');
  for (const f of ['README.md', 'CLAUDE.md', 'AGENTS.md']) {
    const h = /^#\s+(.+)$/m.exec(readText(path.join(root, f), '') || '')?.[1];
    const name = h?.split(/\s+[—–-]\s+|:/)[0].trim();
    if (name && name.split(/\s+/).length <= 3) return name;
  }
  return path.basename(root);
}

// The class family of the icon set: config.icons.base, else the one root all icon classes
// share (inventory.icons). Every script reads it here, so a missing setting means the same
// thing everywhere.
export function iconBaseOf(config, inventory) {
  if (config?.icons?.base) return config.icons.base;
  const roots = (inventory?.icons || []).filter((i) => i.class).map((i) => i.class.split(/__|--/)[0]);
  return roots.length && roots.every((r) => r === roots[0]) ? roots[0] : null;
}

export const CONFIG_NAME = 'catalog.config.json';
export const DEFAULT_OUT = 'docs/design-system';
export const OLD_OUT = 'docs/components'; // before 2026-10-08: refused, not migrated

// The project's logo: the `*logo*` image the code refers to from the most files, resolved
// through public/ (symlink stubs followed); else one in a library folder; else none.
export function logoOf(root, files, libraryDirs = []) {
  const pub = publicResolver(root);
  const inLib = (f) => libraryDirs.some((d) => f.startsWith(d + '/'));
  const refs = new Map();
  for (const file of files.filter((f) => /\.(m?[jt]sx?|html?|s?css|vue|svelte)$/.test(f) && !/\.(test|spec|stories)\./.test(f))) {
    const src = readText(path.join(root, file), '');
    if (!/logo/i.test(src)) continue;
    for (const m of src.matchAll(/["'(]([^"'()\s]*logo[^"'()\s/]*\.(?:svg|png|webp))["')]/gi)) {
      const u = m[1];
      if (/^(https?:|data:|\/\/)/.test(u)) continue;
      const abs = u.startsWith('/') ? pub(u) || (exists(path.join(root, u)) ? path.join(root, u) : null) : path.resolve(root, path.dirname(file), u);
      if (!abs || !exists(abs)) continue;
      const rel = relPosix(root, abs);
      (refs.get(rel) || refs.set(rel, new Set()).get(rel)).add(file);
    }
  }
  const best = [...refs].sort((a, b) => b[1].size - a[1].size || inLib(b[0]) - inLib(a[0]) || a[0].localeCompare(b[0]))[0];
  if (best) return best[0];
  return files.find((f) => /logo/i.test(path.posix.basename(f)) && /\.(svg|png|webp)$/i.test(f) && inLib(f)) || null;
}

export function resolveOut(root, args = {}) {
  if (args.out) return path.resolve(root, args.out);
  return path.join(root, DEFAULT_OUT);
}

// ignoreUnits entries: «id» or { id, why } — the reason is what check asks for.
export const ignoreIds = (config) => (config?.ignoreUnits || []).map((x) => (typeof x === 'string' ? x : x?.id)).filter(Boolean);

export function ignoreMatcher(root, config) {
  return makeMatcher([...DEFAULT_EXCLUDE, ...gitignorePatterns(root), ...(config?.exclude || []), relPosix(root, config?.__out || path.join(root, DEFAULT_OUT))]);
}

export function scopeMatcher(scopes) {
  const compiled = (scopes || []).map((s) => {
    const segs = s.match.split('/');
    return { ...s, re: globToRegex(s.match), slugAt: segs.indexOf('*') };
  });
  return (rel) => {
    for (const s of compiled) {
      if (!s.re.test(rel)) continue;
      const slug = s.slugAt >= 0 ? rel.split('/')[s.slugAt] : null;
      return { name: slug ? `${s.name}:${slug}` : s.name, kind: s.name, library: !!s.library };
    }
    return { name: 'other', kind: 'other', library: false };
  };
}

function detectFramework(root) {
  const pkg = readJson(path.join(root, 'package.json'));
  if (!pkg) return null;
  const deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
  for (const f of ['react', 'vue', 'svelte', '@angular/core', 'solid-js', 'preact', 'lit']) if (deps[f]) return f;
  return null;
}

const SHOWCASE_DIRS = /(^|\/)(catalog|styleguide|style-guide|kitchen-?sink|showcase|storybook|design-system-demo)(\/|$)/i;

// React (and Preact) projects: styles from what the app's root imports, scopes by folder
// conventions (Feature-Sliced Design: shared/ui is the kit), message files for texts.
function detectReactConfig(root, outDir) {
  const isIgnored = ignoreMatcher(root, { __out: outDir });
  const files = walk(root, isIgnored);
  const has = (p) => files.some((f) => f === p || f.startsWith(p + '/'));
  const entries = ['app/layout.tsx', 'app/layout.jsx', 'src/app/layout.tsx', 'pages/_app.tsx', 'src/pages/_app.tsx', 'src/main.tsx', 'src/index.tsx', 'src/App.tsx', 'main.tsx', 'index.tsx'].filter((f) => files.includes(f));
  // Global stylesheets in load order: the entry's non-module CSS imports and their local @imports.
  const styles = [];
  const addCss = (file) => {
    if (styles.includes(file) || !files.includes(file)) return;
    const src = readText(path.join(root, file), '');
    for (const m of src.matchAll(/@import\s+(?:url\()?\s*['"]([^'"]+)['"]/g)) {
      if (!m[1].startsWith('.')) continue;
      addCss(relPosix(root, path.resolve(root, path.dirname(file), m[1])));
    }
    styles.push(file);
  };
  for (const entry of entries) {
    for (const m of readText(path.join(root, entry), '').matchAll(/import\s+['"]([^'"]+\.(?:s?css))['"]/g)) {
      if (/\.module\./.test(m[1]) || !m[1].startsWith('.')) continue;
      addCss(relPosix(root, path.resolve(root, path.dirname(entry), m[1])));
    }
  }
  const styleDirs = [...new Set(styles.map((f) => path.posix.dirname(f)))];
  const kitDirs = ['shared/ui', 'src/shared/ui', 'components/ui', 'src/components/ui', 'ui-kit', 'src/ui'].filter(has);
  const scopes = [
    ...styleDirs.map((d) => ({ name: 'base', match: `${d}/**`, library: true })),
    ...kitDirs.map((d) => ({ name: 'kit', match: `${d}/**`, library: true })),
  ];
  const LAYER = { widgets: 'widget', features: 'feature', entities: 'entity', pages: 'page', processes: 'process', shared: 'shared' };
  for (const layer of Object.keys(LAYER)) for (const pre of ['', 'src/']) {
    if (has(pre + layer)) scopes.push({ name: LAYER[layer], match: `${pre}${layer}/*/**` });
  }
  for (const d of ['app', 'src/app', 'src/pages', 'src']) if (has(d)) scopes.push({ name: d.split('/').pop() === 'src' ? 'app' : d.split('/').pop().replace(/s$/, ''), match: `${d}/**` });
  const tokens = styles.filter((f) => customProperties(readText(path.join(root, f), '')).length >= 8);
  // next-intl / i18next: messages/<lang>/*.json; Russian first, the project's language.
  let messages = null;
  for (const d of ['messages', 'src/messages', 'locales', 'public/locales', 'src/locales']) {
    if (!has(d)) continue;
    const langs = [...new Set(files.filter((f) => f.startsWith(d + '/') && f.endsWith('.json')).map((f) => f.slice(d.length + 1).split('/')[0]))].filter((x) => !x.endsWith('.json'));
    messages = { dir: d, lang: langs.includes('ru') ? 'ru' : langs[0] || null };
    break;
  }
  const logo = logoOf(root, files, [...styleDirs, ...kitDirs]);
  return {
    $comment: 'Создано ui-catalog scan автоматически. Проверь scopes, styles и exclude — дальше этот файл принадлежит проекту.',
    adapter: 'react',
    project: projectName(root),
    styles, tokens, icons: null, scopes,
    showcase: ['**/*.stories.*', '**/stories/**'],
    messages,
    brand: { logo, title: 'Style Guide' },
    reference: detectReference(root, { readJson, exists, path }),
    exclude: ['**/*.test.*', '**/*.spec.*', '**/__tests__/**', '**/__mocks__/**', '**/testing/**', 'public/**'],
    ignoreUnits: [],
    classPrefix: null,
    editor: 'vscode',
  };
}

export function detectConfig(root, outDir) {
  const framework = detectFramework(root);
  if (framework === 'react' || framework === 'preact') return detectReactConfig(root, outDir);
  const base = { __out: outDir };
  const isIgnored = ignoreMatcher(root, base);
  const files = walk(root, isIgnored).filter((f) => !/(^|\/)proto\//.test(f));
  const html = files.filter((f) => /\.html?$/i.test(f));
  const css = files.filter((f) => /\.css$/i.test(f));

  // Stylesheets linked from most pages are the shared library.
  const linkCount = new Map();
  const order = [];
  for (const f of html) {
    const src = readText(path.join(root, f), '');
    for (const m of src.matchAll(/<link\b[^>]*rel=["']?stylesheet[^>]*>/gi)) {
      const href = /href=["']([^"']+)["']/.exec(m[0])?.[1];
      if (!href || /^(https?:)?\/\//.test(href)) continue;
      const rel = relPosix(root, path.resolve(path.join(root, path.dirname(f)), href.split(/[?#]/)[0]));
      if (!css.includes(rel)) continue;
      if (!linkCount.has(rel)) order.push(rel);
      linkCount.set(rel, (linkCount.get(rel) || 0) + 1);
    }
  }
  const threshold = Math.max(2, Math.ceil(html.length * 0.4));
  // A stylesheet next to the pages that link it is those pages' own CSS, not the library
  // (`pages/pages.css` linked from `pages/*.html`), however many of them link it.
  const pageDirs = new Set(html.map((f) => path.posix.dirname(f)));
  const shared = order.filter((f) => !pageDirs.has(path.posix.dirname(f)));
  let styles = shared.filter((f) => linkCount.get(f) >= threshold);
  if (!styles.length && shared.length) styles = shared.filter((f) => linkCount.get(f) === Math.max(...shared.map((x) => linkCount.get(x))));

  const libraryDirs = [...new Set(styles.map((f) => f.split('/')[0]))].filter((d) => !d.endsWith('.css'));
  const scopes = libraryDirs.map((d) => ({ name: 'base', match: `${d}/**`, library: true }));

  const topDirs = [...new Set(files.map((f) => f.split('/')).filter((p) => p.length > 1).map((p) => p[0]))];
  const showcase = [];
  for (const d of topDirs) {
    if (libraryDirs.includes(d)) continue;
    if (SHOWCASE_DIRS.test(d)) { showcase.push(`${d}/**`); continue; }
    const inDir = files.filter((f) => f.startsWith(d + '/') && /\.(html?|css|js)$/.test(f));
    if (!inDir.length) continue;
    const perChild = inDir.filter((f) => f.split('/').length >= 3);
    const name = d.replace(/s$/, '');
    if (perChild.length >= inDir.length * 0.6) scopes.push({ name, match: `${d}/*/**` });
    else scopes.push({ name, match: `${d}/**` });
  }

  const tokens = styles.filter((f) => customProperties(readText(path.join(root, f), '')).length >= 8);

  let icons = null;
  const svgByDir = new Map();
  for (const f of files) if (f.endsWith('.svg') && libraryDirs.some((d) => f.startsWith(d + '/'))) {
    const d = path.posix.dirname(f);
    svgByDir.set(d, (svgByDir.get(d) || 0) + 1);
  }
  const best = [...svgByDir].sort((a, b) => b[1] - a[1])[0];
  if (best && best[1] >= 5) icons = { dir: best[0] };

  // The project's own logo heads the gallery.
  const logo = logoOf(root, files, libraryDirs);

  return {
    $comment: 'Создано ui-catalog scan автоматически. Проверь scopes, styles и exclude — дальше этот файл принадлежит проекту.',
    adapter: detectFramework(root) ? 'unsupported:' + detectFramework(root) : 'html-css',
    project: projectName(root),
    styles,
    tokens,
    icons,
    scopes,
    showcase,
    brand: { logo, title: 'Style Guide' },
    reference: detectReference(root, { readJson, exists, path }),
    exclude: ['**/proto/**'],
    ignoreUnits: [],
    classPrefix: null,
    editor: 'vscode',
  };
}

const SKILL_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');

export function loadConfig(root, outDir, { create = true } = {}) {
  // Run from the skill's own folder by mistake: that is not a project.
  if (path.resolve(root).toLowerCase().startsWith(SKILL_DIR.toLowerCase())) {
    throw new Error(`${root} — это папка скилла ui-catalog, а не проект. Запусти с --root <корень проекта>.`);
  }
  // Running from inside the library folder would nest a second library in it.
  if (exists(path.join(root, CONFIG_NAME)) && path.resolve(root) !== path.resolve(outDir)) {
    throw new Error(`${root} — это папка библиотеки, а не проект. Запусти с --root <корень проекта>.`);
  }
  const file = path.join(outDir, CONFIG_NAME);
  let config = readJson(file);
  if (!config && path.resolve(outDir) === path.resolve(root, DEFAULT_OUT) && exists(path.join(root, OLD_OUT, CONFIG_NAME))) {
    fail(`библиотека лежит в старом месте ${OLD_OUT}/ — перенеси её в ${DEFAULT_OUT}/, описания компонентов — в ${DEFAULT_OUT}/components/ [lib.dirs]`, 2);
  }
  let created = false;
  if (!config) {
    if (!create) return null;
    config = detectConfig(root, outDir);
    writeJson(file, config);
    created = true;
  }
  config.__out = outDir;
  config.__file = file;
  config.__created = created;
  return config;
}

export function exists(p) { try { fs.accessSync(p); return true; } catch { return false; } }
