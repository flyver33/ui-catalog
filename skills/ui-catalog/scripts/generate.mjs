#!/usr/bin/env node
// ui-catalog generate — writes what the code says about a component: its guideline file
// with the facts filled in, and examples/<id>.html from real markup only.
//   node generate.mjs --all                  every undescribed atomic library unit, one component each
//   node generate.mjs <unit> [<unit>...]     just these, one component each
//   node generate.mjs <unit>... --as <id>    these units as one component named <id> (parts of one atom)
//   node generate.mjs --facts <id>[,<id>]|all rewrite the sections written from code (lib/facts.mjs)
//   node generate.mjs <unit>--<mod>          a modifier cut off as its own component (lib/split.mjs: Chip from Tag)
// A unit with a clickable modifier on a static base is written as two components.
//   [--root <project>] [--out <dir>] [--scope <name>]  (--scope feature:x for a local unit)
// Units that are blocks of other components or only lay out a page get no guideline —
// they are listed for `scaffold`. Never overwrites existing files.
// The places only a reader of the code can fill (the name from the reference, the job,
// the prose sections) are marked TODO: the agent writes them in the same run, and check
// reports every TODO left as an error — the catalog is never handed over unfinished.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, writeText, writeJson, readJson, readText, makeMatcher, relPosix, mdHref, fail, isMain } from './lib/fsutil.mjs';
import { scaffoldTail, scaffoldLabel, scaffoldLine, scaffoldDraft, SCAFFOLD_PROPS } from './lib/scaffold.mjs';
import { resolveOut, ignoreIds, iconBaseOf } from './lib/config.mjs';
import { runScan } from './scan.mjs';
import { runAudit } from './audit.mjs';
import { loadLibrary, componentHash, SECTIONS, compDir } from './lib/library.mjs';
import { isKitMode, runKitGenerate } from './lib/kit-run.mjs';
import { factContext, factSections, whenCells, sectionText, replaceSections, restlessPseudo } from './lib/facts.mjs';
import { fillDrafts } from './lib/prose.mjs';
import { overrideLine } from './lib/overrides.mjs';
import { stringifyFrontmatter, setFrontmatterKey } from './lib/frontmatter.mjs';
import { escapeHtml } from './lib/md.mjs';
import { rootOf } from './adapters/html-css.mjs';
import { classifyModifier, VARIANT_AXES, customAxis, expectedVariantName } from './lib/variants.mjs';
import { interactivityOf, hiddenAt, hiddenNarrow, stateOfClass, customName } from './lib/examples.mjs';
import { splitModifiers, sliceUnit, isModifierEntry, rootOfEntry } from './lib/split.mjs';

const FM_ORDER = ['id', 'name', 'type', 'job', 'intents', 'units', 'related', 'counterpart'];

// Scaffolding positions other things and looks like nothing: its own CSS is layout only.
const LAYOUT_PROP = /^(display|position|top|right|bottom|left|inset|z-index|flex(-[a-z]+)?|grid(-[a-z]+)?|gap|row-gap|column-gap|align-[a-z]+|justify-[a-z]+|place-[a-z]+|order|width|min-width|max-width|height|min-height|max-height|margin(-[a-z]+)?|padding(-[a-z]+)?|box-sizing|overflow(-[xy])?)$/;
const layoutOnly = (u) => { const decls = (u.rules || []).flatMap((r) => r.decls || []); return decls.length > 0 && decls.every((d) => LAYOUT_PROP.test(d.prop)); };
// Fills its row in the product: the frame gets desktop width.
// Only rules for every width count: `width: 100%` under a phone media query is a breakpoint.
const fillsRow = (u) => (u.rules || []).some((r) => !(r.at || []).length && r.selector.split(',').some((sel) => sel.trim() === '.' + u.id) && (r.decls || []).some((d) => (d.prop === 'width' && d.value === '100%') || (d.prop === 'flex' && /^1\b/.test(d.value))));

// Why a unit is not an atom, or null. Icons inside an element do not make it composite.
export function notAtomic(u, libraryIds, iconBase) {
  if (layoutOnly(u)) return { kind: 'каркас', inner: [] };
  // A page background (`gm-page`): only layout and background, with library components
  // inside it — scaffolding too, not an atom that happens to have a colour.
  const decls = (u.rules || []).flatMap((r) => r.decls || []);
  const holds = [...new Set(u.usages.flatMap((x) => (x.inner || []).flat()).map(rootOf))].filter((r) => r !== u.id && r !== iconBase && libraryIds.has(r));
  if (decls.length && decls.every((d) => SCAFFOLD_PROPS.test(d.prop)) && holds.length) return { kind: 'каркас', inner: holds };
  const inner = new Set();
  for (const s of u.snippets) {
    // The unit's own element may carry a mix class of its container (`gm-header__vacancy`):
    // only what sits inside it makes it composite.
    for (const m of [...s.html.matchAll(/class\s*=\s*"([^"]*)"/g)].slice(1)) for (const cls of m[1].split(/\s+/)) {
      const r = rootOf(cls);
      if (r !== u.id && r !== iconBase && libraryIds.has(r)) inner.add(r);
    }
  }
  return inner.size ? { kind: 'составной', inner: [...inner] } : null;
}

// Root element of a snippet, re-classed to exactly `classes`.
function reclass(html, classes) {
  return html.replace(/^(<[a-zA-Z][\w-]*\b[^>]*?\sclass\s*=\s*)(["'])[^"']*\2/, `$1"${classes.join(' ')}"`);
}

const withPseudo = (html, p) => html.replace(/^<([a-zA-Z][\w-]*)/, `<$1 data-pseudo="${p}"`);

// The first element carrying `cls`, changed by `edit(openTag)`; null when there is none.
function onFirst(html, cls, edit) {
  for (const m of html.matchAll(/<[a-zA-Z][\w-]*\b[^>]*?\sclass\s*=\s*"([^"]*)"[^>]*>/g)) {
    if (m[1].split(/\s+/).includes(cls)) return html.slice(0, m.index) + edit(m[0]) + html.slice(m.index + m[0].length);
  }
  return null;
}
const openTagWith = (html, cls) => { let t = null; onFirst(html, cls, (tag) => (t = tag)); return t; };


function baseSnippet(u) {
  const plain = u.snippets.find((s) => !s.combo.some((c) => c.includes('--')));
  const pick = plain || [...u.snippets].sort((a, b) => a.html.length - b.html.length)[0];
  if (pick) return { html: reclass(pick.html, [u.id]), from: pick };
  return { html: `<div class="${u.id}">${escapeHtml(u.id)}</div>`, from: null };
}

function mediaWidths(u) {
  const out = new Set();
  for (const m of u.media) {
    const max = /max-width:\s*(\d+)px/.exec(m);
    if (max) out.add(Number(max[1]));
  }
  return [...out].sort((a, b) => b - a);
}

// Examples: only what the code has.
// One template per modifier combination found in real markup; the most used one of
// each variant is its live example; pinned states only for pseudo-classes the CSS
// defines; breakpoints from media queries. Captions are made by build, so no data-label.
function examplesFor(id, units, { globalFocus = false, glyphs = new Set(), focusLost = new Set() } = {}) {
  const t = [];
  const tpl = (attrs, html) => t.push(`<template${attrs}>\n${html}\n</template>`);
  const isMod = (u, c) => c.startsWith(u.id + '--');
  const key = (mods) => mods.filter((m) => !glyphs.has(m)).sort().join(' ');
  // Parts of one atom (--as) are shown inside the main unit's markup, not as variants.
  for (const u of units.slice(0, 1)) {
    // Fills its row, or is hidden below a breakpoint (the menu ≤ 1024 px): a frame the
    // size of a gallery cell would be empty — desktop width.
    const wide = fillsRow(u) ? ' data-width="wide" data-pad="0"' : hiddenNarrow(`<div class="${u.id}"></div>`, units) ? ' data-width="wide"' : '';
    const uses = new Map();
    for (const x of u.usages) if (!x.part && (x.kind === 'markup' || x.tag)) { const k = key((x.classes || []).filter((c) => isMod(u, c))); uses.set(k, (uses.get(k) || 0) + 1); }
    const combos = new Map();
    for (const s of u.snippets) {
      const mods = s.combo.filter((c) => isMod(u, c));
      const k = key(mods);
      if (!combos.has(k)) combos.set(k, { mods, s, n: uses.get(k) || 0 });
    }
    if (!combos.size) { tpl(' data-preview', `<div class="${u.id}">TODO: в разметке нет ни одного места — нечего показать</div>`); continue; }
    const variantMod = (mods) => mods.find((m) => VARIANT_AXES.includes(classifyModifier(m)?.axis) || (!classifyModifier(m) && customAxis(m, u) === 'variant')) || null;
    const groups = new Map();
    for (const c of combos.values()) { const v = variantMod(c.mods); (groups.get(v) || groups.set(v, []).get(v)).push(c); }
    const multi = groups.size > 1;
    const ordered = [...groups].sort((a, b) => b[1].reduce((n, c) => n + c.n, 0) - a[1].reduce((n, c) => n + c.n, 0));
    for (const [vmod, list] of ordered) {
      list.sort((a, b) => b.n - a.n);
      const slug = vmod ? vmod.slice(u.id.length + 2) : 'default';
      const v = multi ? ` data-variant="${units.length > 1 ? u.id + '-' : ''}${slug}"` : '';
      const html = (c) => reclass(c.s.html, [u.id, ...c.mods]);
      const [first, ...rest] = list;
      // From the dictionary, else the word of the class itself (a custom variant).
      const dictName = vmod && (expectedVariantName(vmod, [...combos.keys()]) || customName(vmod));
      const name = multi ? ` data-name="${dictName || 'TODO своё название: одно–два английских слова'}" data-about="TODO когда выбирать: «текст из реального места»."${vmod ? ` data-class="${vmod}"` : ''}` : '';
      tpl(`${v} data-preview${name}${wide}`, html(first));
      // A static element (span, div) shows no hover or focus, whatever the CSS says.
      const interactive = interactivityOf(first.s.html.match(/^<[^>]*>/)?.[0]) !== 'false';
      const pseudo = !interactive ? new Set() : new Set([...u.rootPseudo, ...(vmod ? u.modifiers[vmod]?.pseudo || [] : [])].filter((p) => ['hover', 'active', 'focus-visible'].includes(p)));
      if (globalFocus && interactive) pseudo.add('focus-visible');
      if (focusLost.has(u.id)) pseudo.delete('focus-visible');
      const shown = new Set();
      const state = (h) => { if (!shown.has(h)) { shown.add(h); tpl(`${v}${wide}`, h); } };
      for (const p of ['hover', 'active', 'focus-visible']) if (pseudo.has(p)) state(withPseudo(html(first), p));
      const main = vmod === ordered[0][0];
      // Parts, once: a pseudo-class the CSS gives an interactive part, pinned on the first
      // one (the menu link's hover); a state class the code sets on a part — in markup or
      // from a script (`gm-nav__link--active` → Current) — on the first part of that kind.
      if (main) for (const [el, info] of Object.entries(u.elements)) {
        if (el.includes('--')) {
          const part = el.split('--')[0];
          if (!stateOfClass(el) || html(first).includes(el) || !u.usages.some((x) => (x.classes || []).includes(el))) continue;
          const h = onFirst(html(first), part, (tag) => tag.replace(/(\sclass\s*=\s*")([^"]*)"/, `$1$2 ${el}"`));
          if (h) state(h);
          continue;
        }
        if (interactivityOf(openTagWith(html(first), el)) === 'false') continue;
        // The global focus ring counts on a part as on the root (the menu link).
        const ps = new Set(info.pseudo || []);
        if (globalFocus && !focusLost.has(u.id)) ps.add('focus-visible');
        for (const p of ['hover', 'active', 'focus-visible']) if (ps.has(p)) {
          const h = onFirst(html(first), el, (tag) => tag.replace(/^<([a-zA-Z][\w-]*)/, `<$1 data-pseudo="${p}"`));
          if (h) state(h);
        }
      }
      for (const c of rest) {
        // Differs from the live example only by modifiers that act under a pseudo-class
        // (`--nohover`): at rest it is the same picture. What differs is the reaction, so
        // that is what is shown — pinned on the one of the two that reacts. Even on a static
        // element: the product has that hover, the inconsistency goes to ui-issues.md.
        const diff = [...c.mods.filter((m) => !first.mods.includes(m)), ...first.mods.filter((m) => !c.mods.includes(m))];
        const restless = diff.map((m) => restlessPseudo(u, m));
        if (diff.length && restless.every(Boolean)) {
          const target = diff.every((m) => c.mods.includes(m)) ? first : c;
          const ps = new Set(restless.flatMap((s) => [...s]));
          for (const p of ['hover', 'active', 'focus-visible']) if (ps.has(p) && u.pseudo.includes(p)) state(withPseudo(html(target), p));
          continue;
        }
        state(html(c));
      }
      // Breakpoints, except where the CSS hides the component: that frame would be empty.
      // With the frame's usual padding: on a page the component never touches the screen edge.
      if (main) for (const w of mediaWidths(u)) if (!hiddenAt(html(first), units, w)) tpl(`${v} data-width="${w}"`, html(first));
    }
  }
  return `<!-- ui-catalog: examples for="${id}" -->
<!-- Сгенерировано ui-catalog generate: только сочетания классов из реальной разметки. Правила — references/examples.md.
     Подписи состояний собирает build. data-label — только для состояний содержимого («With form»)
     и примеров со страницы (с data-note). Не добавляй сочетаний, которых нет в коде.${units.length > 1 ? `
     Части ${units.slice(1).map((u) => u.id).join(', ')} показываются внутри разметки ${units[0].id}.` : ''} -->

${t.join('\n\n')}
`;
}

// A real usage without its context: on the component's own element only its classes,
// inside only library classes, no `data-*` its CSS does not select.
export function assembleSnippet(html, units, libraryIds) {
  const own = (cls) => units.some((u) => cls === u.id || cls.startsWith(u.id + '--'));
  const selectors = units.flatMap((u) => (u.rules || []).map((r) => r.selector)).join(' ');
  let first = true;
  return html.replace(/<([a-zA-Z][\w-]*)(\s[^>]*?)?(\/?)>/g, (m, tag, attrs = '', slash) => {
    const root = first;
    first = false;
    const a = attrs
      .replace(/\sclass\s*=\s*"([^"]*)"/, (x, v) => {
        const keep = v.split(/\s+/).filter((c) => c && (root ? own(c) : libraryIds.has(rootOf(c))));
        return keep.length ? ` class="${keep.join(' ')}"` : '';
      })
      .replace(/\s(data-[\w-]+)(\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/g, (x, name) => (selectors.includes(`[${name}`) ? x : ''));
    return `<${tag}${a}${slash}>`;
  });
}

// Prose the agent writes is marked TODO; the four fact sections are filled by runFacts.
function guidelineFor(id, units, root, outDir, libraryIds) {
  const main = units[0];
  const link = (u) => `[${u.file}:${u.line}](${mdHref(relPosix(compDir(outDir), path.join(root, u.file)))}#L${u.line})`;
  const overrides = units.flatMap((u) => u.overrides.map((o) => ({ o, u })));
  const hard = [...new Set(units.flatMap((u) => u.hardcoded))];
  const parts = [];
  parts.push(`## Когда использовать\n\nTODO: ситуации, в которых это правильный выбор.`);
  parts.push(`## Когда не использовать\n\nTODO: похожие ситуации, где нужен другой компонент, — и какой именно.`);
  parts.push('## Варианты', '## Состояния');
  const snippet = main.snippets[0] && assembleSnippet(main.snippets[0].html, units, libraryIds);
  parts.push(`## Как собрать\n\n\`\`\`html\n${snippet || `<div class="${main.id}">…</div>`}\n\`\`\`\n\nTODO: обязательная разметка, что можно менять внутри.`);
  parts.push('## Показательные места', '## С чем сочетается');
  const pit = [];
  // Text for people names no classes (lib/prose.mjs): what and where; the link shows the rule.
  if (hard.length) pit.push(`- Цвета заданы значениями, без токенов: ${hard.join(', ')}.`);
  for (const { o } of overrides.slice(0, 6)) pit.push(overrideLine(o, link(o)));
  parts.push(`## Подводные камни\n\n` + (pit.length ? pit.join('\n') + '\n\nTODO: проверь и допиши.' : 'TODO'));
  return parts.join('\n\n') + '\n';
}

// «Варианты», «Состояния», «Показательные места», «С чем сочетается» — rewritten from the
// code in place (lib/facts.mjs); «Когда выбирать» and every other section are kept.
export async function runFacts(root, outDir, ids = 'all', { quiet = false } = {}) {
  const { inventory, config } = await runScan(root, outDir, { quiet: true });
  // React: atoms are kit specs, rewritten from the code and the answers (lib/kit-run.mjs).
  if (isKitMode(config)) { const r = runKitGenerate(root, outDir, inventory, config, { quiet }); await runAudit(root, outDir, { quiet: true, scan: { inventory, config } }); return r; }
  const audit = await runAudit(root, outDir, { quiet: true, scan: { inventory, config } });
  const lib = loadLibrary(outDir);
  const F = factContext({ unitsById: new Map(inventory.units.map((u) => [u.id, u])), inventory, config, components: lib.components, findings: audit.findings, root, outDir });
  const done = [];
  for (const c of lib.components) {
    if (ids !== 'all' && !ids.includes(c.id)) continue;
    const { sections, related, counterpart } = factSections(c, F, { when: whenCells(sectionText(c.body, 'Варианты')) });
    const head = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(c.text)?.[0] || '';
    let next = head + '\n' + replaceSections(c.body.replace(/^\s+/, ''), sections, SECTIONS);
    // Once the type is set: the type's draft for an empty job and intents (lib/prose.mjs).
    for (const [k, v] of Object.entries(fillDrafts(c.data) || {})) next = setFrontmatterKey(next, k, v);
    if ((c.data.related || []).join(' ') !== related.join(' ')) next = setFrontmatterKey(next, 'related', related);
    // counterpart: from the code when it names one; without a kit as the reference, nothing else.
    const kit = ['kit', 'storybook'].includes(config.reference?.kind);
    const cp = counterpart || (kit ? c.data.counterpart || null : null);
    if ((c.data.counterpart || null) !== cp) next = setFrontmatterKey(next, 'counterpart', cp);
    if (next !== c.text) { writeText(path.join(outDir, c.file), next); done.push(c.id); }
  }
  // scaffold lines: the label stays, the part after « — » follows the code (lib/scaffold.mjs).
  if (ids === 'all' && config.__file) {
    const raw = readJson(config.__file);
    const byId = new Map(inventory.units.map((u) => [u.id, u]));
    for (const [id, v] of Object.entries(raw.scaffold || {})) {
      const u = byId.get(id);
      if (!u) continue;
      const line = scaffoldLine(scaffoldLabel(v), scaffoldTail(u, { members: F.members, partials: inventory.partials, read: (p) => readText(path.join(root, p)), isShowcase: makeMatcher(config.showcase || []) }));
      if (line !== v) { raw.scaffold[id] = line; done.push(`scaffold ${id}`); }
    }
    if (done.some((x) => x.startsWith('scaffold '))) writeJson(config.__file, raw);
  }
  if (!quiet) console.log(done.length ? `ui-catalog generate --facts: переписано из кода — ${done.join(', ')}` : 'ui-catalog generate --facts: всё уже совпадает с кодом');
  return done;
}

export async function runGenerate(root, outDir, { ids = [], all = false, as = null, scope = null } = {}) {
  const { inventory, config } = await runScan(root, outDir, { quiet: true });
  // ui-issues.md follows: what the composites' instances do differently.
  if (isKitMode(config)) { const r = runKitGenerate(root, outDir, inventory, config); await runAudit(root, outDir, { quiet: true, scan: { inventory, config } }); return r; }
  const skip = new Set([...Object.keys(config.scaffold || {}), ...ignoreIds(config)]);
  const libraryIds = new Set(inventory.units.filter((u) => u.library).map((u) => u.id));
  // The icon class family, from config or from the icon set itself (an icon inside an element is not composition).
  const iconBase = iconBaseOf(config, inventory);
  const byId = new Map(inventory.units.map((u) => [u.id, u]));
  const globalFocus = (inventory.globalRules || []).some((r) => /:focus-visible/.test(r.selector));
  // Where the product shows no focus (audit: focus-lost), no focus is pinned either.
  const focusLost = new Set((await runAudit(root, outDir, { quiet: true, scan: { inventory, config } })).findings.filter((f) => f.rule === 'focus-lost').map((f) => f.unit));
  const glyphs = new Set((inventory.icons || []).map((i) => i.class).filter(Boolean));
  const lib = loadLibrary(outDir);
  const claimed = new Set(lib.components.flatMap((c) => c.units));
  const existing = new Set(lib.components.map((c) => c.id));

  // Modifiers other components already own, and modifiers asked for by name.
  const ownedMods = new Set(lib.components.flatMap((c) => c.declared.filter(isModifierEntry)));
  const asked = ids.filter((i) => isModifierEntry(i) && byId.get(rootOfEntry(i))?.modifiers[i]);
  ids = ids.filter((i) => !asked.includes(i));
  let pool;
  if (ids.length || asked.length) {
    const missing = ids.filter((i) => !byId.has(i));
    if (missing.length) fail(`Нет таких юнитов в inventory: ${missing.join(', ')}`);
    pool = ids.map((i) => byId.get(i));
  } else if (all) {
    pool = inventory.units.filter((u) => (scope ? u.scope === scope : u.library) && !claimed.has(u.id) && !skip.has(u.id));
  } else fail('Укажи юниты или --all');

  // Atomic library: composites and page scaffolding get no guideline.
  const suggestions = [];
  pool = pool.filter((u) => {
    const why = notAtomic(u, libraryIds, iconBase);
    if (!why) return true;
    suggestions.push(u);
    if (ids.length && !all) { console.log(`  внимание: ${u.id} — ${why.kind}, описание всё равно пишу, раз попросили`); return true; }
    return false;
  });

  // id → { units (sliced), declared }. A clickable modifier on a static base is its own component.
  const groups = new Map();
  const cutOff = (u, mods) => groups.set(mods[0], { units: [sliceUnit(u, { only: mods })], declared: mods, split: true });
  if (as) groups.set(as, { units: pool, declared: pool.map((u) => u.id) });
  else for (const u of pool) {
    const mods = splitModifiers(u);
    const except = [...new Set([...mods, ...ownedMods])].filter((m) => u.modifiers[m]);
    groups.set(u.id, { units: [except.length ? sliceUnit(u, { except }) : u], declared: [u.id] });
    if (mods.filter((m) => !ownedMods.has(m)).length) cutOff(u, mods.filter((m) => !ownedMods.has(m)));
  }
  for (const m of asked) cutOff(byId.get(rootOfEntry(m)), [m]);
  // --all: a described unit whose clickable modifier is not cut off yet.
  if (all && !as) for (const u of inventory.units.filter((x) => x.library && claimed.has(x.id))) {
    const mods = splitModifiers(u).filter((m) => !ownedMods.has(m));
    if (mods.length && !groups.has(mods[0])) cutOff(u, mods);
  }

  const weight = (u) => Object.keys(u.elements).length * 2 + u.usageCount;
  const written = [];
  for (const [gid, group] of groups) {
    const units = as ? group.units : [...group.units].sort((x, y) => weight(y) - weight(x) || (x.defined[0]?.line || 0) - (y.defined[0]?.line || 0));
    const id = as || gid;
    if (existing.has(id) || fs.existsSync(path.join(compDir(outDir), `${id}.md`))) { console.log(`  пропущен ${id}: гайдлайн уже есть`); continue; }
    const already = group.split ? [] : units.filter((u) => claimed.has(u.id)).map((u) => u.id);
    if (already.length) console.log(`  внимание: ${already.join(', ')} уже в другом компоненте`);
    const data = {
      id, name: 'TODO название из эталона (references/guideline.md → gl.name)', job: 'TODO одна фраза: какую задачу интерфейса решает',
      type: group.split ? 'TODO из references/types.md — кликабельная пара базового (Tag → chip)' : 'TODO из references/types.md',
      intents: [], units: group.declared, related: [],
      counterpart: null,
    };
    writeText(path.join(compDir(outDir), `${id}.md`), stringifyFrontmatter(data, FM_ORDER) + '\n' + guidelineFor(id, units, root, outDir, libraryIds));
    const ex = path.join(outDir, 'examples', `${id}.html`);
    if (!fs.existsSync(ex)) writeText(ex, examplesFor(id, units, { globalFocus, glyphs, focusLost }));
    written.push(`${id} (${group.declared.join(', ')})`);
  }
  // Blocks and page scaffolding go to `scaffold` with a label from the code (scaffoldDraft);
  // the tail after « — » is written by runFacts below.
  const toScaffold = suggestions.length && !(ids.length && !all) && config.__file ? suggestions : [];
  if (toScaffold.length) {
    const raw = readJson(config.__file);
    raw.scaffold ||= {};
    const taken = new Set(Object.values(raw.scaffold).map(scaffoldLabel));
    for (const u of toScaffold) if (!raw.scaffold[u.id]) { const label = scaffoldDraft(u, { prefix: config.classPrefix || null, taken }); taken.add(label); raw.scaffold[u.id] = label; }
    writeJson(config.__file, raw);
  }
  if (written.length || toScaffold.length) await runFacts(root, outDir, toScaffold.length ? 'all' : written.map((w) => w.split(' ')[0]), { quiet: true });
  console.log(written.length ? `ui-catalog generate: —\n  ${written.join('\n  ')}` : 'ui-catalog generate: писать нечего');
  if (toScaffold.length) {
    const sc = readJson(config.__file).scaffold;
    console.log(`\n  Не атомы — не компоненты, записаны в catalog.config.json → "scaffold" (подпись — из кода):\n    ${toScaffold.map((u) => `${u.id}: ${sc[u.id]}`).join('\n    ')}`);
  }
  return written;
}

if (isMain(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(args.root || process.cwd());
  if (args.facts) await runFacts(root, resolveOut(root, args), args.facts === true || args.facts === 'all' ? 'all' : String(args.facts).split(','));
  else await runGenerate(root, resolveOut(root, args), { ids: args._, all: !!args.all, as: typeof args.as === 'string' ? args.as : null, scope: args.scope || null });
}
