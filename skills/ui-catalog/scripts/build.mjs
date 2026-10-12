#!/usr/bin/env node
// ui-catalog build — scan, then write the generated half of the library:
//   components.json   machine index (agents, ui-compose query)
//   CATALOG.md        compact index an agent reads first
//   foundations/      colour, type, shape, spacing, motion, icons, layout — from the code
//   gallery/          static HTML gallery for people
//   node build.mjs [--root <project>] [--out <dir>] [--no-gallery]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, writeText, writeJson, readText, readJson, relPosix, fromHref, toPosix, isMain, sha1 } from './lib/fsutil.mjs';
import { resolveOut, ignoreIds, iconBaseOf } from './lib/config.mjs';
import { runScan } from './scan.mjs';
import { loadLibrary, componentHash, compDir, FOUNDATIONS_DIR } from './lib/library.mjs';
import { foundationFiles, tokenRoles } from './lib/foundations.mjs';
import { isKitMode, kitOf } from './lib/kit-run.mjs';
import { patternState, instancesOf } from './lib/pattern-run.mjs';
import { places, apiTarget, kitDiff, nativeProps } from './lib/kit.mjs';
import { makeRenderer } from './lib/render.mjs';
import { publicResolver, rebaseCss, rebaseHtml } from './lib/public.mjs';
import { kitGalleryComponents, compositeGalleryComponents } from './lib/kit-gallery.mjs';
import { unitsOf } from './lib/split.mjs';
import { FACT_SECTIONS } from './lib/facts.mjs';
import { catalogTokens, KIND_RU, KINDS } from './lib/tokens.mjs';
import { markdownToHtml, sections } from './lib/md.mjs';
import { pinnedCss, parseCss } from './lib/css.mjs';
import { textStyles } from './lib/typography.mjs';
import { chromeTheme, fontStack } from './lib/theme.mjs';
import { describeOverride } from './lib/overrides.mjs';
import { describeSite, PROP_RU } from './lib/describe.mjs';
import { autoLabel, exampleContext } from './lib/examples.mjs';
import { includes } from './lib/html.mjs';
import { runAudit, RULES } from './audit.mjs';
import { possibilities, POSSIBLE_RU } from './lib/possible.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GALLERY_SRC = path.join(HERE, '..', 'gallery');

export async function runBuild(root, outDir, { gallery = true, quiet = false } = {}) {
  const { inventory, config } = await runScan(root, outDir, { quiet: true });
  const audit = await runAudit(root, outDir, { quiet: true, scan: { inventory, config } });
  const lib = loadLibrary(outDir);
  // Kit mode (React): atoms/ holds specs of the kit (lib/kit-run.mjs), not guidelines.
  const kitMode = isKitMode(config);
  const specs = kitMode ? lib.components : [];
  if (kitMode) lib.components = [];
  const kit = kitMode ? kitOf(inventory, outDir).kit : null;
  // Composites found in the code (lib/pattern-run.mjs).
  const patterns = kitMode ? (() => { const st = patternState(inventory, config, outDir); return { state: st, all: st.composites.map((comp) => ({ comp, instances: instancesOf(comp, st, inventory) })) }; })() : null;
  const unitsById = new Map(inventory.units.map((u) => [u.id, u]));
  const galleryDir = path.join(outDir, 'gallery');
  const abs = (f) => path.join(root, f);
  // Root-relative URLs are files in the project's public/.
  const pub = publicResolver(root);

  const editorHref = (file, line) => {
    const ed = config.editor || 'vscode';
    if (ed === 'none') return relPosix(galleryDir, abs(file)) + (line ? `#L${line}` : '');
    return `${ed}://file/${toPosix(abs(file))}${line ? ':' + line : ''}`;
  };
  const pageHref = (file) => (/\.html?$/.test(file) ? relPosix(galleryDir, abs(file)) : null);

  // Links inside markdown are relative to the file's own folder (components/, requests/).
  const cDir = compDir(outDir);
  const mdLink = (href, base = cDir) => {
    if (/^[a-z]+:/i.test(href) || href.startsWith('#')) return { href, external: /^https?:/.test(href) };
    const [p, hash] = href.split('#');
    const target = path.resolve(base, p);
    // The icon component has no page of its own: its page is «Иконки».
    const id = path.basename(target, '.md');
    if (target.endsWith('.md') && path.dirname(target) === cDir && id === iconBaseOf(config, inventory)) return { href: '#/icons' };
    if (target.endsWith('.md') && path.dirname(target) === cDir && lib.components.some((c) => c.id === id)) return { href: `#/c/${id}` };
    const rel = relPosix(root, target);
    if (!rel.startsWith('..')) return { href: editorHref(rel, /^L(\d+)/.exec(hash || '')?.[1]) };
    return { href: relPosix(galleryDir, target) + (hash ? '#' + hash : '') };
  };
  const repLines = (body) => {
    const out = new Set();
    for (const m of body.matchAll(/\]\(([^)\s#]+)#L(\d+)\)/g)) out.add(`${relPosix(root, path.resolve(cDir, fromHref(m[1])))}:${m[2]}`);
    return out;
  };

  const expandIncludes = (html) => {
    let out = html;
    for (const inc of includes(html).reverse()) {
      const src = readText(path.resolve(root, inc.path.replace(/^\//, '')));
      if (src == null) continue;
      out = out.slice(0, inc.start) + src.replace(/<!--[\s\S]*?-->/g, '').trim() + out.slice(inc.end);
    }
    return out;
  };

  // ── components ──────────────────────────────────────────────────────
  const claimed = new Set();
  const components = [];
  for (const c of lib.components) {
    const d = c.data;
    const units = unitsOf(c, unitsById); // sliced: Chip cut from gm-tag sees only its usages
    c.units.forEach((u) => claimed.add(u));
    const reps = repLines(c.body);
    const usageMap = new Map();
    const owned = units.flatMap((u) => u.usages.map((x) => ({ u, x })));
    for (const { u, x } of owned) {
      if (!usageMap.has(x.file)) usageMap.set(x.file, { file: x.file, scope: x.scope, page: pageHref(x.file), lines: new Map() });
      const lines = usageMap.get(x.file).lines;
      const prev = lines.get(x.line);
      const classes = [u.id, ...x.classes].join(' ');
      lines.set(x.line, { line: x.line, href: editorHref(x.file, x.line), rep: reps.has(`${x.file}:${x.line}`), classes: prev ? prev.classes + ' · ' + classes : classes });
    }
    const usages = [...usageMap.values()].map((u) => ({ ...u, lines: [...u.lines.values()].sort((a, b) => a.line - b.line) }))
      .sort((a, b) => b.lines.length - a.lines.length || a.file.localeCompare(b.file));
    const hash = componentHash(c, unitsById);
    // State captions come from the markup (lib/examples.mjs); data-label only where markup cannot say.
    const ex = exampleContext(c, { unitsById, inventory, config });
    const examples = (c.examples?.states || []).map((st) => {
      const html = expandIncludes(st.html);
      const noteFile = st.note && /^([^:]+):(\d+)$/.exec(st.note);
      const auto = st.preview ? '' : autoLabel({ ...st, html }, ex.labelCtx(st));
      const label = st.preview ? st.label : auto || st.authored || 'Default';
      return { ...st, label, html, clean: html.replace(/\sdata-pseudo="[^"]*"/g, ''), noteHref: noteFile ? editorHref(noteFile[1], noteFile[2]) : null };
    });
    const { variants, shared } = groupVariants(examples);
    // For agents only: what the markup uses and what the CSS also allows (never in the gallery).
    const { combos, possible } = possibilities(units, { ignore: ex.ignore });
    // Sections written from the code (lib/facts.mjs) are for agents: they stay in <id>.md, not in the gallery.
    const secs = sections(c.body).filter((s) => !FACT_SECTIONS.includes(s.title)).map((s) => ({ title: s.title, html: markdownToHtml(s.text, { link: (h) => mdLink(h) }) }));
    let updated = null;
    try { updated = fs.statSync(path.join(outDir, c.file)).mtime.toISOString(); } catch {}
    components.push({
      id: c.id, name: d.name || c.id, job: d.job || '',
      intents: d.intents || [], related: d.related || [], counterpart: d.counterpart || null, units: c.units, declared: c.declared,
      styles: (d.styles || []).map((s) => relPosix(galleryDir, abs(s))),
      md: c.file, mdHref: editorHref(relPosix(root, path.join(outDir, c.file))),
      missingUnits: c.units.filter((u) => !unitsById.has(u)),
      stale: !!d.sourceHash && d.sourceHash !== hash, hash, todo: c.todo, updated,
      usageCount: owned.length,
      fileCount: new Set(owned.map(({ x }) => x.file)).size,
      modifiers: units.flatMap((u) => Object.entries(u.modifiers).map(([cls, m]) => ({ cls, unit: u.id, pseudo: m.pseudo }))),
      elements: units.flatMap((u) => Object.entries(u.elements).map(([cls, m]) => ({ cls, unit: u.id, pseudo: m.pseudo }))),
      pseudo: [...new Set(units.flatMap((u) => u.pseudo))],
      // The widest max-width breakpoint of its own CSS: a frame without a width renders
      // past it, so a narrow gallery cell never shows the phone layout by accident.
      breakpoint: Math.max(0, ...units.flatMap((u) => u.media || []).map((m) => Number(/max-width:\s*(\d+)px/.exec(m)?.[1]) || 0)) || null,
      tokens: [...new Set(units.flatMap((u) => u.tokens))].sort(),
      hardcoded: [...new Set(units.flatMap((u) => u.hardcoded))],
      overrides: units.flatMap((u) => u.overrides.map((o) => { const d = describeOverride(o); return { ...o, href: editorHref(o.file, o.line), what: d.words.join(', '), look: d.look, max: d.max }; })),
      usages, sections: secs, variants, shared, combos, possible,
    });
  }

  const ignored = new Set([...ignoreIds(config), ...Object.keys(config.scaffold || {})]);
  // Kit mode: classes are implementations of atoms or utilities; composites come in K4.
  const undocumented = kitMode ? [] : inventory.units.filter((u) => u.library && !claimed.has(u.id) && !ignored.has(u.id))
    .map((u) => ({ id: u.id, section: u.section, usageCount: u.usageCount, file: u.defined[0]?.file, href: editorHref(u.defined[0]?.file, u.defined[0]?.line) }));
  const candidates = inventory.units.filter((u) => !u.library && !claimed.has(u.id) && u.usageCount >= 3 && u.snippets.length)
    .sort((a, b) => b.fileCount - a.fileCount || b.usageCount - a.usageCount).slice(0, 80)
    .map((u) => ({ id: u.id, scope: u.scope, usageCount: u.usageCount, fileCount: u.fileCount, file: u.defined[0]?.file, href: editorHref(u.defined[0]?.file, u.defined[0]?.line) }));

  const tokMap = new Map(inventory.tokens.map((t) => [t.name, t.value]));
  const resolve = (v, depth = 0) => depth > 8 ? v : v.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)/g, (m, n, fb) => tokMap.has(n) ? resolve(tokMap.get(n), depth + 1) : (fb || m));
  const describeCtx = { components, scaffold: config.scaffold || {}, labels: config.labels || {} };
  const described = (s) => { const d = describeSite(s, describeCtx); return { what: d.what, where: d.where || undefined }; };
  // Only tokens the code uses, one name per value, by kind (lib/tokens.mjs); the rest is in ui-issues.md.
  const tokens = catalogTokens(inventory.tokens).shown.map((t) => ({
    ...t, id: t.name.replace(/^--/, ''), resolved: resolve(t.value), href: editorHref(t.file, t.line), roles: tokenRoles(t),
    sites: (t.sites || []).map((s) => ({ ...s, href: editorHref(s.file, s.line), ...described(s), propRu: PROP_RU[s.prop] || (s.prop?.startsWith('--') ? `переменная ${s.prop}` : s.prop) })),
    components: components.filter((c) => c.tokens.includes(t.name)).map((c) => c.id),
  }));

  // Text styles: library ones are the type scale; the rest are what pages and features set themselves.
  const bodyRule = (inventory.globalRules || []).find((r) => /^body\b/.test(r.selector.trim()));
  const unitOwners = (unitId) => components.filter((c) => c.units.includes(unitId));
  const allVars = new Map([...Object.entries(inventory.vars || {}), ...tokMap]);
  const resolveAny = (v, depth = 0) => depth > 8 ? v : String(v).replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)/g, (m, n, fb) => allVars.has(n) ? resolveAny(allVars.get(n), depth + 1) : (fb || m));
  const typeStyles = textStyles(inventory.textSites || [], resolveAny, bodyRule?.decls || []).map((s) => ({
    ...s,
    sites: s.sites.map((x) => ({ file: x.file, line: x.line, selector: x.selector, scope: x.scope, media: x.media, href: editorHref(x.file, x.line), component: unitOwners(x.unit)[0]?.id || null, ...described(x) })),
    components: [...new Set(s.sites.flatMap((x) => unitOwners(x.unit).map((c) => c.id)))],
  }));

  // Families, display faces first, the text face (the one on body) last —
  // the way type specimens are read. config.typography.families overrides the order.
  const bodyFamily = (resolveAny(bodyRule?.decls.find((d) => d.prop === 'font-family')?.value || '').split(',')[0] || '').trim().replace(/^["']|["']$/g, '');
  const famNames = [...new Set(typeStyles.map((s) => s.family))];
  const maxSize = (f) => Math.max(...typeStyles.filter((s) => s.family === f && s.library).map((s) => s.size), 0);
  const typeFamilies = famNames.map((f) => ({
    family: f, role: f === bodyFamily ? 'text' : 'display',
    token: inventory.tokens.find((t) => t.kind === 'font' && resolveAny(t.value).split(',')[0].trim().replace(/^["']|["']$/g, '') === f)?.name || null,
  })).sort((a, b) => {
    const order = config.typography?.families || [];
    const ia = order.indexOf(a.family), ib = order.indexOf(b.family);
    if (ia >= 0 || ib >= 0) return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
    return (a.role === 'text') - (b.role === 'text') || maxSize(b.family) - maxSize(a.family) || a.family.localeCompare(b.family);
  });

  const iconBase = iconBaseOf(config, inventory);
  const iconUnit = iconBase && inventory.units.find((u) => u.id === iconBase);
  const iconUsed = new Set((iconUnit?.usages || []).flatMap((x) => x.classes || []));
  const icons = inventory.icons.map((i) => {
    const sizeCls = iconBase && i.size && inventory.units.find((u) => u.id === iconBase)?.modifiers[`${iconBase}--${i.size}`] ? `${iconBase}--${i.size}` : null;
    return { ...i, inProduct: !i.class || iconUsed.has(i.class), src: relPosix(galleryDir, abs(i.file)), markup: i.class ? `<span class="${[iconBase, sizeCls, i.class].filter(Boolean).join(' ')}" aria-hidden="true"></span>` : null };
  });

  // ── foundations/ ────────────────────────────────────────────────────
  // A file per area used more than once; a stale one goes.
  const foundations = foundationFiles({
    project: config.project, tokens, components, typeStyles, typeFamilies, icons, iconBase, iconUnit,
    units: inventory.units, scaffold: config.scaffold || {},
  });
  const fDir = path.join(outDir, FOUNDATIONS_DIR);
  fs.rmSync(fDir, { recursive: true, force: true });
  for (const x of foundations) writeText(path.join(fDir, x.file), x.md);

  const requests = lib.requests.map((r) => ({
    id: r.id, file: r.file, title: r.data.title || r.id, feature: r.data.feature || null, status: r.data.status || 'open',
    date: r.data.date || null, needs: r.data.needs || [], html: markdownToHtml(r.body, { link: (h) => mdLink(h, path.join(outDir, 'requests')), headingOffset: 1 }),
  }));

  // ── components.json (agents) ────────────────────────────────────────
  writeJson(path.join(outDir, 'components.json'), {
    $comment: 'Сгенерировано ui-catalog build. Правь <id>.md и examples/, затем пересобери.',
    project: config.project, generatedAt: inventory.generatedAt, mode: kitMode ? 'kit' : 'catalog',
    composites: kitMode ? patterns.all.map(({ comp, instances }) => ({ id: comp.id, name: comp.data.name || comp.id, type: comp.data.type, kinds: comp.data.kinds || [], md: comp.file, instances: instances.map((x) => `${x.file}:${x.line}`) })) : undefined,
    components: kitMode ? kitEntries(kit, specs) : components.map((c) => ({
      id: c.id, name: c.name, job: c.job, intents: c.intents, related: c.related,
      counterpart: c.counterpart, units: c.declared, md: c.md, stale: c.stale, todo: c.todo,
      usageCount: c.usageCount, fileCount: c.fileCount, modifiers: c.modifiers.map((m) => m.cls),
      pseudo: c.pseudo,
      // Class sets the markup really uses; `possible` — what the CSS allows, «в продукте нет».
      combos: c.combos, possible: c.possible,
      variants: c.variants.map((v) => ({ id: v.id, name: v.name, class: v.cls, states: v.states.map((s) => s.label) })), tokens: c.tokens, usedIn: c.usages.slice(0, 12).map((u) => u.file),
      // Inconsistencies the audit found in this component's code (the report: ui-issues.md).
      issues: audit.findings.filter((f) => f.component === c.id).map((f) => ({ rule: f.rule, title: RULES[f.rule].title, subject: f.subject })),
    })),
    undocumented: undocumented.map((u) => u.id),
    // Units living in pages/features, used often: candidates to move into the library.
    candidates: candidates.map((u) => ({ id: u.id, scope: u.scope, usageCount: u.usageCount, fileCount: u.fileCount })),
    requests: requests.map((r) => ({ id: r.id, title: r.title, status: r.status, needs: r.needs })),
    // Foundations: the files and the tokens with their roles for query tokens.
    foundations: foundations.map((x) => ({ area: x.area, file: `${FOUNDATIONS_DIR}/${x.file}`, title: x.title, uses: x.uses })),
    tokens: tokens.map((t) => ({ name: t.name, value: t.value, resolved: t.resolved, kind: t.kind, uses: t.uses, roles: t.roles, components: t.components })),
  });

  writeText(path.join(outDir, 'CATALOG.md'), kitMode ? catalogKitMd(config, kit, specs, foundations, requests, patterns) : catalogMd(config, components, foundations, icons, requests, undocumented));

  // ── gallery ─────────────────────────────────────────────────────────
  // React: the implementations are rendered in Node into static frames (lib/render.mjs).
  let kitGallery = null;
  if (gallery && kitMode) {
    const renderer = await makeRenderer(root, config);
    if (renderer.error) {
      fs.rmSync(path.join(galleryDir, 'data.js'), { force: true });
      if (!quiet) console.log(`  галерея не собрана: ${renderer.error}`);
    } else {
      try {
        const mdHref = (f) => editorHref(relPosix(root, path.join(outDir, f)));
        const rebase = (html) => rebaseHtml(html, galleryDir, pub);
        kitGallery = await kitGalleryComponents({ kit, specs, inventory, renderer, editorHref, mdHref, rebase });
        const comps = await compositeGalleryComponents({ patterns: patterns.all, atomIds: new Set(kit.atoms.map((a) => a.id)), inventory, renderer, editorHref, mdHref, rebase });
        kitGallery.composites = comps.components;
        kitGallery.failed += comps.failed;
        writeText(path.join(galleryDir, 'modules.css'), renderer.modulesCss(galleryDir, pub));
      } finally { renderer.close(); }
      if (!quiet && kitGallery.failed) console.log(`  не отрисовались: ${kitGallery.failed} — в галерее это кадры «не отрисовался: …»`);
    }
  }
  if (gallery && (!kitMode || kitGallery)) {
    // A stylesheet with root-relative URLs goes as a copy with them rewritten.
    const stylesDir = path.join(galleryDir, 'styles');
    fs.rmSync(stylesDir, { recursive: true, force: true });
    const hrefOf = new Map();
    (config.styles || []).forEach((s, i) => {
      const src = readText(abs(s));
      const rebased = src != null && /url\(\s*['"]?\/[^/]/.test(src) ? rebaseCss(src, path.dirname(abs(s)), stylesDir, pub) : null;
      if (rebased == null || rebased === src) { hrefOf.set(s, relPosix(galleryDir, abs(s))); return; }
      const name = `${i}-${path.basename(s)}`;
      writeText(path.join(stylesDir, name), rebased);
      hrefOf.set(s, `styles/${name}?v=${sha1(rebased)}`);
    });
    const styles = [...(config.styles || []).map((s) => hrefOf.get(s)), ...(kitGallery ? ['modules.css'] : [])];
    // Frames with pinned states load copies of the project's stylesheets in which every
    // :hover/:active/:focus rule also matches [data-pseudo] in its own place in the cascade.
    // (A separate sheet loaded last would beat the project's own overrides — a pinned
    // focus ring on an element whose CSS removes it.)
    const pinnedSources = [...new Set([...(config.styles || []), ...lib.components.flatMap((c) => c.data.styles || []), ...(kitGallery ? [relPosix(root, path.join(galleryDir, 'modules.css'))] : [])])];
    const pinnedDir = path.join(galleryDir, 'pinned');
    fs.rmSync(pinnedDir, { recursive: true, force: true });
    const pinned = {};
    pinnedSources.forEach((s, i) => {
      const src = readText(abs(s));
      if (src == null) return;
      const dir = path.dirname(abs(s));
      const css = `/* Сгенерировано ui-catalog build из ${s}: те же правила, плюс [data-pseudo] рядом с каждым :hover/:active/:focus. */\n` +
        pinnedCss(src, (u) => (/^(data:|https?:|#|\/\/)/.test(u) ? u : u.startsWith('/') ? (pub(u) ? relPosix(pinnedDir, pub(u)) : u) : relPosix(pinnedDir, path.resolve(dir, u))));
      const name = `${i}-${path.basename(s)}`;
      writeText(path.join(pinnedDir, name), css);
      pinned[hrefOf.get(s) || relPosix(galleryDir, abs(s))] = `pinned/${name}?v=${sha1(css)}`;
    });
    const data = {
      project: config.project, generatedAt: inventory.generatedAt, lang: config.lang || 'ru',
      // The chrome in the project's accent and text face (lib/theme.mjs).
      theme: chromeTheme(tokens, fontStack(bodyRule?.decls || [], resolveAny)),
      frame: { styles, pinned, bg: config.frame?.bg || '#ffffff', pad: config.frame?.pad ?? 24, desktop: config.frame?.desktop || 1440 },
      brand: {
        title: config.brand?.title || 'Style Guide',
        logo: config.brand?.logo && readText(abs(config.brand.logo)) != null ? relPosix(galleryDir, abs(config.brand.logo)) : null,
      },
      // The icon component lives on the «Иконки» page, not among components.
      composites: kitGallery?.composites || [],
      components: kitGallery ? kitGallery.components : components.filter((c) => !(iconBase && c.units.includes(iconBase))).map(({ hash, combos, possible, counterpart, related, ...c }) => {
        // The gallery shows what the product has: classes nobody uses stay in CATALOG.md.
        const unused = new Set(possible.filter((x) => x.kind !== 'combination').map((x) => x.classes.split(' ').pop()));
        return { ...c, modifiers: c.modifiers.filter((m) => !unused.has(m.cls)), elements: c.elements.filter((m) => !unused.has(m.cls)) };
      }),
      undocumented, tokens, tokenKinds: KINDS, icons, textStyles: typeStyles, typeFamilies,
    };
    fs.rmSync(path.join(galleryDir, 'pseudo.css'), { force: true }); // replaced by pinned/
    // The project's @font-face rules, so type specimens in the gallery use the real fonts.
    let fonts = '/* Сгенерировано ui-catalog build: @font-face проекта для образцов шрифтов. */\n';
    for (const s of config.styles || []) {
      const src = readText(abs(s));
      if (src == null) continue;
      const dir = path.dirname(abs(s));
      for (const it of parseCss(src)) if (it.type === 'at' && it.name === 'font-face' && it.body) {
        fonts += `@font-face {${it.body.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, u) => `url(${q}${/^(data:|https?:|\/\/)/.test(u) ? u : u.startsWith('/') ? (pub(u) ? relPosix(galleryDir, pub(u)) : u) : relPosix(galleryDir, path.resolve(dir, u))}${q})`)}}\n`;
      }
    }
    writeText(path.join(galleryDir, 'fonts.css'), fonts);
    writeText(path.join(galleryDir, 'data.js'), `window.UI_CATALOG = ${JSON.stringify(data).replace(/<\/script/gi, '<\\/script')};\n`);
    const title = data.brand.title;
    const brand = data.brand.logo ? `<img src="${data.brand.logo}" alt="${config.project}">` : `<strong>${config.project}</strong>`;
    for (const f of ['app.js', 'app.css', 'selftest.js']) fs.copyFileSync(path.join(GALLERY_SRC, f), path.join(galleryDir, f));
    // Plain static servers let browsers cache: stamp every gallery file with its content hash.
    const stamp = (f) => sha1(readText(path.join(galleryDir, f), ''));
    const shell = readText(path.join(GALLERY_SRC, 'index.html'))
      .replace(/__TITLE__/g, `${config.project} — ${title}`).replace(/__BRAND__/g, brand).replace(/__BRAND_TITLE__/g, title)
      .replace(/(href|src)="(app\.css|app\.js|data\.js|fonts\.css)"/g, (m, attr, f) => `${attr}="${f}?v=${stamp(f)}"`);
    writeText(path.join(galleryDir, 'index.html'), shell);
  }

  if (!quiet) {
    const stale = components.filter((c) => c.stale).length;
    if (kitMode) console.log(`ui-catalog build (кит): атомов ${kit.atoms.length}, спек ${specs.length}, открытых вопросов ${kit.atoms.flatMap((a) => a.questions).filter((q) => q.status !== 'answered').length}, запросов ${requests.length}`);
    else console.log(`ui-catalog build: ${components.length} компонентов${stale ? `, код изменился после печати: ${stale}` : ''}, без описания ${undocumented.length}, запросов ${requests.length}`);
    console.log(`  ${relPosix(process.cwd(), path.join(outDir, 'CATALOG.md'))}`);
    if (gallery && (!kitMode || kitGallery)) console.log(`  ${relPosix(process.cwd(), path.join(galleryDir, 'index.html'))}`);
  }
  return { components, undocumented, requests };
}

// A template with data-preview starts a variant (the live example on its page);
// templates with the same data-variant are its static states. Templates with
// no variant are shared examples. No data-preview at all: one implicit variant
// whose live example is the first template.
export function groupVariants(examples) {
  const defs = examples.filter((s) => s.preview);
  if (!defs.length) {
    if (!examples.length) return { variants: [], shared: [] };
    return { variants: [{ id: 'default', name: null, about: null, cls: null, preview: examples[0], states: examples.slice(1) }], shared: [] };
  }
  // One live example without data-variant: the component has one kind, everything else is its states.
  if (defs.length === 1 && !defs[0].variant) {
    const d = defs[0];
    return { variants: [{ id: 'default', name: d.name, about: d.about, cls: d.cls, preview: d, states: examples.filter((s) => s !== d) }], shared: [] };
  }
  const variants = defs.map((d) => {
    const id = d.variant || d.id;
    return { id, name: d.name || d.label, about: d.about, cls: d.cls, preview: d, states: examples.filter((s) => !s.preview && s.variant === id) };
  });
  return { variants, shared: examples.filter((s) => !s.preview && !s.variant) };
}

// Kit mode: the atoms of the kit for ui-compose — what each will be, and what stands in now.
function kitEntries(kit, specs) {
  return kit.atoms.map((a) => {
    const spec = specs.find((c) => c.id === a.id);
    const files = [...new Set(a.impls.flatMap((i) => (i.kind === 'raw' ? i.places.map((p) => p.file) : [i.file])))];
    // How each implementation spells every API value: what ui-compose puts meanwhile.
    const maps = new Map(a.impls.map((i) => [i.key, []]));
    for (const [axis, values] of Object.entries(a.axes)) for (const v of values.values()) {
      const to = apiTarget(a, axis, v.name);
      if (!to) continue;
      for (const x of v.impls.values()) maps.get(x.impl.key)?.push({ prop: to.prop, value: to.token, as: x.impl.kind === 'class' ? { cls: x.cls, token: x.token } : x.bool ? { prop: x.prop } : { prop: x.prop, value: x.token } });
    }
    const diff = kitDiff(a);
    return {
      id: a.id, name: a.name, type: a.type, job: spec?.data.job || '', intents: spec?.data.intents || [], related: [], counterpart: null,
      units: [], md: spec?.file || `atoms/${a.id}.md`, stale: false, todo: spec?.todo || 0,
      kit: !a.kit ? null : a.kit.error ? { ref: a.kit.ref, error: a.kit.error } : {
        ref: a.kit.ref, name: a.kit.comp.name, file: a.kit.comp.file, native: [...nativeProps(a.kit.comp)],
        props: Object.fromEntries(a.kit.comp.props.map((p) => [p.name, { values: p.values || null, default: p.default ?? null }])),
        differences: diff.filter((d) => !d.warn).length,
      },
      usageCount: a.uses, fileCount: files.length, modifiers: [], pseudo: [], combos: [], possible: [], variants: [],
      tokens: a.tokens, usedIn: files.slice(0, 12), issues: [],
      api: a.api.map((p) => ({ prop: p.prop, axis: p.axis || null, values: p.values ? p.values.map((v) => v.token) : p.bool ? ['true', 'false'] : null, bool: !!p.bool, default: p.default || null, kit: !!p.kit })),
      implementations: a.impls.map((i) => ({
        name: i.name, kind: i.kind, file: i.file || null, line: i.line || null, uses: i.uses, kit: !!i.kit,
        ...(i.kind === 'class' ? { base: i.unit.id, tag: i.tag } : {}), maps: maps.get(i.key),
      })),
      openQuestions: a.questions.filter((q) => q.status !== 'answered').length,
      // Open questions about which atom an implementation is: a verdict on it rests on them.
      typeQuestions: a.questions.filter((q) => q.kind === 'type' && q.status !== 'answered').map((q) => ({ id: q.id, impl: q.impl, title: q.title })),
    };
  });
}

function catalogKitMd(config, kit, specs, foundations, requests, patterns) {
  const L = [`# Дизайн-система — ${config.project}`, ''];
  L.push('> Сгенерировано `ui-catalog build`. Руками не править: источник — `atoms/<id>.md`, `questions.md` и код.', '');
  L.push('Как пользоваться: атом — компонент React-кита. Что брать, говорит `ui-compose`: `compose.mjs verdict <атом> [проп=значение …]` — компонент кита или, пока его нет, самую частую реализацию из «Что заменяет»; составное — `compose.mjs pattern <тип>`. Пишешь свой CSS — сначала открой нужную основу. Не нашёл подходящего — это пробел, см. `ui-compose`.', '');
  if (foundations.length) {
    L.push('## Основы', '');
    for (const x of foundations) L.push(`- [${x.title}](foundations/${x.file}) — ${x.summary}`);
    L.push('');
  }
  L.push('## Атомы кита', '');
  for (const a of kit.atoms) {
    const spec = specs.find((c) => c.id === a.id);
    const open = a.questions.filter((q) => q.status !== 'answered').length;
    const diff = a.kit?.comp ? kitDiff(a).filter((d) => !d.warn).length : 0;
    const status = !spec?.data.kit ? 'в ките ещё нет' : a.kit?.error ? `kit: \`${spec.data.kit}\` — ${a.kit.error}` : `в ките: \`${spec.data.kit}\`${diff ? ` · расхождений со спекой ${diff}` : ''}`;
    L.push(`- **${a.name}** \`${a.id}\` — ${spec?.data.job || '—'} · ${places(a.uses)}, реализаций ${a.impls.length} · ${status}${open ? ` · открытых вопросов ${open}` : ''} → [atoms/${a.id}.md](atoms/${a.id}.md)`);
  }
  L.push('');
  if (patterns?.all.length) {
    L.push('## Составные', '', 'Закономерности, которые уже есть в продукте — заведены компонентом или сверстаны на месте. Новое такого рода собирай по «Канону» описания.', '');
    for (const { comp, instances } of patterns.all) L.push(`- **${comp.data.name || comp.id}** \`${comp.id}\` — ${places(instances.length)}${(comp.data.kinds || []).length ? ` · виды: ${comp.data.kinds.join(', ')}` : ''} → [composites/${comp.id}.md](composites/${comp.id}.md)`);
    L.push('');
  }
  const totalOpen = kit.atoms.flatMap((a) => a.questions).filter((q) => q.status !== 'answered').length;
  if (totalOpen) L.push(`Открытые вопросы по атомам: ${totalOpen} — [questions.md](questions.md).`, '');
  const open = requests.filter((r) => r.status !== 'closed');
  if (open.length) {
    L.push('## Открытые запросы', '');
    for (const r of open) L.push(`- [${r.title}](${r.file})` + (r.needs.length ? ` — ${r.needs.join(', ')}` : ''));
    L.push('');
  }
  return L.join('\n');
}

// The index: grows only with the number of components.
function catalogMd(config, components, foundations, icons, requests, undocumented) {
  const L = [];
  L.push(`# Дизайн-система — ${config.project}`, '');
  L.push('> Сгенерировано `ui-catalog build`. Руками не править: источник — `atoms/<id>.md`, `examples/<id>.html` и код (`foundations/`).', '');
  L.push('Как пользоваться: найди компонент по задаче или тегам, **открой его `atoms/<id>.md` перед использованием**, бери только классы из раздела «Варианты». Пишешь свой CSS (раскладка, цвет, текст) — сначала открой нужную основу. Не нашёл подходящего — это пробел, см. `ui-compose`.', '');
  if (foundations.length) {
    L.push('## Основы', '');
    for (const x of foundations) L.push(`- [${x.title}](foundations/${x.file}) — ${x.summary}`);
    L.push('');
  }
  L.push('«В продукте» — сочетания классов из реальной разметки. «CSS позволяет, в продукте нет» — то, что те же стили дают, но на экранах этого никто не видел: брать можно, скажи об этом разработчику и посмотри результат глазами.', '');
  {
    const list = [...components].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    L.push('## Компоненты', '', 'Только атомы: самые маленькие элементы со своим смыслом. Блоки из них собираются на месте.', '');
    for (const c of list) {
      const flags = [c.stale ? 'код изменился после описания' : null].filter(Boolean);
      L.push(`- **${c.name}** \`${c.id}\` — ${c.job || '—'}` +
        (c.intents.length ? ` · теги: ${c.intents.join(', ')}` : '') +
        ` · ${c.usageCount} исп.` + (c.counterpart ? ` · в другой системе: \`${c.counterpart}\`` : '') + (flags.length ? ` · ${flags.join(', ')}` : '') + ` → [${c.md}](${c.md})`);
      const glyph = icons.some((i) => i.class && c.modifiers.some((m) => m.cls === i.class))
        ? (foundations.some((x) => x.area === 'icons') ? ' + глиф из [иконок](foundations/icons.md)' : ' + глиф из набора иконок') : '';
      if (c.combos.some((x) => x.classes.includes(' ')) || glyph) L.push(`  - в продукте: ${c.combos.map((x) => '`' + x.classes + '`' + (x.count > 1 ? ` ×${x.count}` : '')).join(' · ')}${glyph}`);
      if (c.possible.length) L.push(`  - CSS позволяет, в продукте нет: ${c.possible.map((x) => '`' + x.classes + '`' + (x.kind === 'combination' ? '' : ` (${POSSIBLE_RU[x.kind]})`)).join(' · ')}`);
    }
    L.push('');
  }
  const open = requests.filter((r) => r.status !== 'closed');
  if (open.length) {
    L.push('## Открытые запросы', '');
    for (const r of open) L.push(`- [${r.title}](${r.file})` + (r.needs.length ? ` — ${r.needs.join(', ')}` : ''));
    L.push('');
  }
  if (undocumented.length) L.push('## Без гайдлайна', '', undocumented.map((u) => '`' + u.id + '`').join(' '), '');
  return L.join('\n');
}

if (isMain(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(args.root || process.cwd());
  await runBuild(root, resolveOut(root, args), { gallery: !args['no-gallery'] });
}
