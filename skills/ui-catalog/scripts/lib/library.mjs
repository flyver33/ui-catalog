// Reads the authored half of a library: guideline files, examples, requests.
import fs from 'node:fs';
import path from 'node:path';
import { readText, sha1 } from './fsutil.mjs';
import { parseFrontmatter } from './frontmatter.mjs';
import { parseAttributes, maskComments } from './html.mjs';
import { parseUnits, linkSlices, unitsOf } from './split.mjs';

export const GENERATED_MD = new Set(['CATALOG.md', 'README.md']);
export const REQUIRED = ['id', 'name', 'job', 'intents', 'units'];
// Every field a guideline may have (gl.fields). There is no status: the
// catalog is built finished, and the person who owns it edits it as they like.
export const FIELDS = ['id', 'name', 'type', 'job', 'intents', 'units', 'related', 'counterpart', 'styles', 'sourceHash'];
// Guideline sections, fixed: the gallery lays them out and ui-compose reads them by name.
export const SECTIONS = ['Когда использовать', 'Когда не использовать', 'Варианты', 'Состояния', 'Как собрать', 'Показательные места', 'С чем сочетается', 'Подводные камни'];

// Guidelines live in atoms/, foundations in foundations/.
export const COMPONENTS_DIR = 'atoms';
export const FOUNDATIONS_DIR = 'foundations';
export const compDir = (outDir) => path.join(outDir, COMPONENTS_DIR);

const listMd = (dir) => { try { return fs.readdirSync(dir).filter((f) => f.endsWith('.md') && !GENERATED_MD.has(f)).sort(); } catch { return []; } };

export function loadLibrary(outDir) {
  const components = [];
  for (const f of listMd(compDir(outDir))) {
    const text = readText(path.join(compDir(outDir), f), '');
    const { data, body, hasFrontmatter } = parseFrontmatter(text);
    if (!hasFrontmatter || !data.id) continue;
    // `units` may name a modifier (`gm-tag--blue`): that component owns only the usages
    // with it (lib/split.mjs). `units` here are root classes; `declared` is what the file says.
    const declared = Array.isArray(data.units) ? data.units.map(String) : data.units ? [String(data.units)] : [];
    const { units, slice } = parseUnits(declared);
    components.push({
      id: String(data.id), file: `${COMPONENTS_DIR}/${f}`, data, body, text, units, declared, slice,
      todo: (text.match(/\bTODO\b/g) || []).length,
      examples: loadExamples(path.join(outDir, 'examples', `${data.id}.html`)),
    });
  }
  linkSlices(components);
  const requests = [];
  for (const f of listMd(path.join(outDir, 'requests'))) {
    const text = readText(path.join(outDir, 'requests', f), '');
    const { data, body } = parseFrontmatter(text);
    requests.push({ id: path.basename(f, '.md'), file: `requests/${f}`, data, body });
  }
  // Guidelines left in the root of the library: no script reads them there (lib.layout).
  // …and in `components/`, where they lived before atoms/ (2026-10-09).
  const strayIn = (dir, prefix) => listMd(dir).filter((f) => parseFrontmatter(readText(path.join(dir, f), '')).data?.id).map((f) => ({ file: prefix + f, id: path.basename(f, '.md') }));
  const stray = [...strayIn(outDir, ''), ...strayIn(path.join(outDir, 'components'), 'components/')];
  return { components, requests, stray };
}

// Examples file: a flat list of <template data-state data-group ...> items.
export function loadExamples(file) {
  const src = readText(file);
  if (src == null) return null;
  const states = [];
  for (const m of maskComments(src).matchAll(/<template\b([^>]*)>([\s\S]*?)<\/template>/gi)) {
    const a = parseAttributes(m[1]);
    const id = a['data-state'] || `state-${states.length + 1}`;
    states.push({
      id, label: a['data-label'] || a['data-name'] || id,
      variant: a['data-variant'] || null, preview: 'data-preview' in a,
      name: a['data-name'] || null, about: a['data-about'] || null, cls: a['data-class'] || null,
      width: a['data-width'] ? Number(a['data-width']) || a['data-width'] : null,
      height: a['data-height'] ? Number(a['data-height']) : null,
      bg: a['data-bg'] || null, pad: a['data-pad'] ?? null, note: a['data-note'] || null, attrs: Object.keys(a), authored: a['data-label'] || null,
      html: m[2].replace(/^\s*\n/, '').replace(/\s+$/, ''),
    });
  }
  const head = /<!--\s*ui-catalog:([\s\S]*?)-->/.exec(src);
  const meta = head ? parseAttributes(head[1]) : {};
  return { file, src, states, meta, todo: (maskComments(src).match(/\bTODO\b/g) || []).length };
}


// What a seal vouches for: the units' CSS, the class combinations the markup uses, the
// guideline (front matter without sourceHash, and body) and the examples. Any of them
// changing breaks the seal.
export function componentHash(component, unitsById) {
  const css = component.units.map((u) => unitsById.get(u)?.hash || `missing:${u}`).join('|');
  const combos = unitsOf(component, unitsById).flatMap((u) => u.usages.filter((x) => x.kind === 'markup' || x.tag).map((x) => `${u.id}:${[...(x.classes || [])].sort().join(' ')}:${x.interactive}`));
  const data = Object.entries(component.data || {}).filter(([k]) => k !== 'sourceHash').sort(([a], [b]) => a.localeCompare(b));
  return sha1([css, [...new Set(combos)].sort().join('|'), JSON.stringify(data), component.body || '', component.examples?.src || ''].join('\n§\n'));
}
