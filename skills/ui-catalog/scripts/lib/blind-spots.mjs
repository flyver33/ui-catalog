// The blind spots of the adapters a project relies on (references/adapters.md →
// ad.blind-spots): found by scan in the code, named by `check --report`.
import path from 'node:path';
import { walk, readText, readJson } from './fsutil.mjs';
import { ignoreMatcher } from './config.mjs';
import { places } from './kit.mjs';

const CSS_IN_JS = /^(styled-components|@emotion\/.+|@stitches\/.+|@vanilla-extract\/.+|@linaria\/.+|linaria|goober|styled-jsx)$/;
const CODE = /\.(html?|vue|svelte|astro|php|njk|hbs|liquid|erb|twig|m?js|cjs|jsx|tsx?)$/i;
// `'btn--' + kind`, `` `btn--${kind}` ``: a class the scan never sees whole.
const BUILT = /(['"])([a-z][\w-]*?(?:--|__|-))\1\s*\+|`[^`\n]*?\b([a-z][\w-]*?(?:--|__|-))\$\{/gi;

export function blindSpots(root, config, knownClasses) {
  const pkg = readJson(path.join(root, 'package.json')) || {};
  const deps = Object.keys({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) });
  const files = walk(root, ignoreMatcher(root, config));
  const known = [...knownClasses];
  const built = [];
  for (const f of files.filter((x) => CODE.test(x))) {
    const text = readText(path.join(root, f), '');
    for (const m of text.matchAll(BUILT)) {
      const prefix = m[2] || m[3];
      // Only a prefix of a class the project has: `'data-' + key` is no class.
      if (!known.some((c) => c.startsWith(prefix) && c !== prefix)) continue;
      built.push({ file: f, line: text.slice(0, m.index).split('\n').length, prefix });
    }
  }
  return {
    built,
    tailwind: deps.includes('tailwindcss') || files.some((f) => /(^|\/)tailwind\.config\.\w+$/.test(f)),
    cssInJs: deps.filter((d) => CSS_IN_JS.test(d)).sort(),
  };
}

// Lines for the report: what the catalog cannot see, said once.
export function blindSpotLines(spots) {
  if (!spots) return [];
  const L = [];
  if (spots.built?.length) {
    const prefixes = [...new Set(spots.built.map((x) => x.prefix))];
    L.push(`- Классы собираются из строк (${prefixes.map((p) => `\`${p}…\``).join(', ')}) — ${places(spots.built.length)}, например ${spots.built.slice(0, 3).map((x) => `${x.file}:${x.line}`).join(', ')}: такие места каталог не видит.`);
  }
  if (spots.tailwind) L.push('- Tailwind: каждый утилитарный класс — отдельный юнит; задай `classPrefix` или нужен другой адаптер.');
  if (spots.cssInJs?.length) L.push(`- CSS-in-JS (${spots.cssInJs.join(', ')}): стили компонентов в коде, каталог их не видит.`);
  return L.length ? ['Слепые зоны (каталог этого не видит):', '', ...L, ''] : [];
}
