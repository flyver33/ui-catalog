// Adapter for static HTML/CSS projects (and any project whose components
// are CSS class families). A "unit" is a BEM-style class root:
//   .gm-btn, .gm-btn--primary, .gm-btn__icon  ->  unit "gm-btn"
// Units are raw facts. Components (guideline files) group units.
import path from 'node:path';
import { readText, sha1, walk, relPosix, lineIndex } from '../lib/fsutil.mjs';
import { parseCss, eachRule, splitTopLevel, classesIn, pseudoByClass, INTERACTIVE, varsUsed, hardcodedColors, sectionTitle, sectionHeader, ruleNote, subjectClass, customProperties, declarations } from '../lib/css.mjs';
import { classAttributes, scriptRanges, includes, elementAt, dedent, elementTree } from '../lib/html.mjs';
import { ignoreMatcher, scopeMatcher } from '../lib/config.mjs';
import { makeMatcher } from '../lib/fsutil.mjs';

export const rootOf = (cls) => cls.split(/__|--/)[0] || cls;

// Where a word of a script can be a class (the react adapter asks for it): inside a string
// literal — not in a comment, JSX text, a module specifier or the key of a translation call.
export function classStrings(text) {
  const mask = new Uint8Array(text.length);
  const n = text.length;
  const SKIP = /(?:\b(?:from|import)\s*\(?\s*|\brequire\s*\(\s*|(?:^|[^\w$])(?:t|[a-z]\w*T|t[A-Z]\w*|useTranslations|getTranslations)(?:\.\w+)?\s*\(\s*)$/;
  for (let i = 0; i < n; i++) {
    const c = text[i];
    if (c === '/' && text[i + 1] === '/') { const e = text.indexOf('\n', i); i = e < 0 ? n : e; continue; }
    if (c === '/' && text[i + 1] === '*') { const e = text.indexOf('*/', i + 2); i = e < 0 ? n : e + 1; continue; }
    if (c !== '"' && c !== "'" && c !== '`') continue;
    let j = i + 1;
    // A quote in JSX text (`Don't`) ends at the line: a string in code never spans one.
    while (j < n && text[j] !== c && (c === '`' || text[j] !== '\n')) j += text[j] === '\\' ? 2 : 1;
    if (!SKIP.test(text.slice(Math.max(0, i - 40), i))) mask.fill(1, i + 1, j);
    i = j;
  }
  return (k) => mask[k] === 1;
}

const MARKUP = /\.(html?|vue|svelte|astro|php|njk|hbs|liquid|erb|twig)$/i;
const SCRIPT = /\.(m?js|cjs|jsx|tsx?)$/i;

export function scan(root, config) {
  const isIgnored = ignoreMatcher(root, config);
  const scopeOf = scopeMatcher(config.scopes);
  const isShowcase = makeMatcher(config.showcase || []);
  const files = walk(root, isIgnored);
  const prefixOk = (cls) => !config.classPrefix || cls.startsWith(config.classPrefix);

  const units = new Map();
  const unit = (id) => {
    if (!units.has(id)) units.set(id, {
      id, kind: 'css-class', scope: null, library: false, section: null, defined: [], modifiers: {}, elements: {},
      pseudo: new Set(), rootPseudo: new Set(), media: new Set(), tokens: new Set(), hardcoded: new Set(), overrides: [], contextual: new Set(),
      usages: [], showcase: [], __text: [],
    });
    return units.get(id);
  };

  // ── 1. CSS definitions ───────────────────────────────────────────────
  // Library stylesheets first, so a unit's home is the library even when a
  // feature restyles it; later definitions elsewhere count as overrides.
  const cssFiles = files.filter((f) => f.endsWith('.css') && !isShowcase(f))
    .sort((a, b) => (scopeOf(b).library - scopeOf(a).library) || a.localeCompare(b));
  const allCss = new Map();
  const globalRules = []; // library rules not owned by a class (`:focus-visible`, `button`…)
  const textSites = []; // every rule that sets a text style (font-size or the `font` shorthand)
  const labels = {}; // class -> what it is, from the comment above its own rule (`/* карточка стены */ .wc {…}`)
  // Cascade position: index in config.styles (load order on every page), then rule order.
  const styleIndex = (f) => { const i = (config.styles || []).indexOf(f); return i < 0 ? 999 : i; };
  let seq = 0;
  for (const file of cssFiles) {
    const src = readText(path.join(root, file), '');
    allCss.set(file, src);
    // A CSS module's classes are local to the components that import it, not a shared
    // class family: the react adapter reads them itself (tokens used there still count).
    if (config.__cssModules && config.__cssModules.test(file)) continue;
    const scope = scopeOf(file);
    eachRule(parseCss(src), (rule, ctx) => {
      const note = ruleNote(ctx.note);
      if (note) for (const sel of splitTopLevel(rule.prelude)) {
        const m = /^\.(-?[_a-zA-Z][\w-]*)$/.exec(sel);
        if (m && prefixOk(m[1]) && !labels[m[1]]) labels[m[1]] = note;
      }
      const fact = { file, line: rule.line, selector: rule.prelude, decls: declarations(rule.body), at: ctx.at, order: [styleIndex(file), seq++] };
      if (scope.library && !classesIn(rule.prelude).filter(prefixOk).length) globalRules.push(fact);
      const type = typographyOf(fact.decls);
      if (type) {
        const first = classesIn(splitTopLevel(rule.prelude)[0] || '').filter(prefixOk)[0];
        textSites.push({ ...type, file, line: rule.line, selector: rule.prelude.slice(0, 120), scope: scope.name, library: scope.library, unit: first ? rootOf(first) : null, subject: subjectClass(rule.prelude), note, media: ctx.at.find((a) => a.startsWith('@media')) || null, section: sectionHeader(ctx.comment) });
      }
      const owners = new Set();
      for (const sel of splitTopLevel(rule.prelude)) {
        const classes = classesIn(sel).filter(prefixOk);
        if (!classes.length) continue;
        const owner = rootOf(classes[0]);
        owners.add(owner);
        const u = unit(owner);
        if (!u.scope) { u.scope = scope.name; u.library = scope.library; u.section = sectionTitle(ctx.comment); }
        if (u.scope !== scope.name) {
          // Restyled outside its home: note new classes, do not merge them.
          const extra = classes.filter((c) => rootOf(c) === owner && c !== owner);
          u.__overrideClasses ||= new Set();
          extra.forEach((c) => { if (!u.modifiers[c] && !u.elements[c]) u.__overrideClasses.add(c); });
          continue;
        }
        for (const cls of classes) {
          const r = rootOf(cls);
          if (r !== owner) { u.contextual.add(r); continue; }
          if (cls.includes('--') && !cls.split('--')[0].includes('__')) (u.modifiers[cls] ||= { pseudo: new Set() });
          else if (cls.includes('__')) (u.elements[cls] ||= { pseudo: new Set() });
        }
        for (const [cls, ps] of Object.entries(pseudoByClass(sel))) {
          if (rootOf(cls) !== owner) continue;
          const interactive = ps.filter((p) => INTERACTIVE.includes(p));
          interactive.forEach((p) => u.pseudo.add(p));
          if (cls === owner) interactive.forEach((p) => u.rootPseudo.add(p));
          const bucket = u.modifiers[cls] || u.elements[cls];
          if (bucket) interactive.forEach((p) => bucket.pseudo.add(p));
        }
      }
      for (const owner of owners) {
        const u = unit(owner);
        const place = { file, line: rule.line, scope: scope.name };
        // What it changes (lib/overrides.mjs): the properties it sets and its breakpoint.
        if (u.scope !== scope.name) { u.overrides.push({ ...place, selector: rule.prelude.slice(0, 160), props: [...new Set([...String(rule.body || '').matchAll(/(?:^|;)\s*(-?[a-z][a-z-]*)\s*:/g)].map((m) => m[1]))], media: ctx.at.find((a) => a.startsWith('@media'))?.slice(7) || null }); continue; }
        u.defined.push(place);
        ctx.at.forEach((a) => a.startsWith('@media') && u.media.add(a.slice(7)));
        varsUsed(rule.body).forEach((v) => u.tokens.add(v));
        hardcodedColors(rule.body).forEach((c) => u.hardcoded.add(c));
        u.__text.push(rule.text.replace(/\s+/g, ' '));
        (u.__rules ||= []).push(fact);
      }
    });
  }

  const known = new Set();
  for (const u of units.values()) {
    known.add(u.id);
    Object.keys(u.modifiers).forEach((c) => known.add(c));
    Object.keys(u.elements).forEach((c) => known.add(c));
    (u.__overrideClasses || []).forEach((c) => known.add(c));
  }

  // ── 2. Usages in markup and scripts ─────────────────────────────────
  const partialUsers = new Map(); // partial rel path -> [{file, line}]
  const partialUnits = new Map(); // partial rel path -> Set(unit ids)
  const snippets = new Map(); // unit id -> [{combo, html, file, line}]

  // What element carries the classes, and can a person act on it.
  // true: native control; 'unknown': a plain element wired up some other way; false: static.
  const NATIVE = new Set(['button', 'a', 'input', 'select', 'textarea', 'summary', 'option']);
  const elementInfo = (openTag) => {
    const tag = /^<([a-zA-Z][\w-]*)/.exec(openTag || '')?.[1]?.toLowerCase() || null;
    if (!tag) return { tag: null, interactive: 'unknown' };
    if (NATIVE.has(tag)) return { tag, interactive: tag === 'a' && !/\shref\s*=/.test(openTag) ? 'unknown' : true };
    if (/\s(role\s*=\s*["']?(button|link|tab|menuitem|option|checkbox|switch)|onclick\s*=|tabindex\s*=|data-toggle|data-action)/i.test(openTag)) return { tag, interactive: 'unknown' };
    return { tag, interactive: false };
  };

  const record = (file, line, classes, kind, src, pos, openTag, place = null) => {
    const el = elementInfo(openTag ?? (src ? src.slice(src.lastIndexOf('<', pos), src.indexOf('>', pos) + 1) : null));
    const byRoot = new Map();
    for (const c of classes) {
      if (!known.has(c)) continue;
      const r = rootOf(c);
      if (!units.has(r)) continue;
      (byRoot.get(r) || byRoot.set(r, new Set()).get(r)).add(c);
    }
    const scope = scopeOf(file);
    const showcase = isShowcase(file);
    for (const [r, set] of byRoot) {
      const u = units.get(r);
      const combo = [...set].filter((c) => c !== r).sort();
      const isPart = !set.has(r) && combo.every((c) => c.includes('__'));
      const entry = { file, line, scope: scope.name, kind, classes: combo, part: isPart || undefined, tag: el.tag, interactive: el.interactive, ...(place || {}) };
      (showcase ? u.showcase : u.usages).push(entry);
      if (src && !isPart && set.has(r) && !showcase) {
        const html = elementAt(src, pos);
        if (html) (snippets.get(r) || snippets.set(r, []).get(r)).push({ combo, html: dedent(html), file, line });
      }
    }
    return [...byRoot.keys()];
  };

  // Where an element sits: classes of its containers (nearest first), of its siblings,
  // and inside it — what «С чем сочетается» and «Показательные места» are written from.
  const knownOnly = (list, cap = 40) => [...new Set(list.filter((c) => known.has(c)))].slice(0, cap);
  const placeOf = (tree, i, kids) => {
    const ctx = [];
    for (let p = tree.els[i].parent; p >= 0 && ctx.length < 16; p = tree.els[p].parent) {
      const k = knownOnly(tree.els[p].classes);
      if (k.length) ctx.push(k);
    }
    // One class list per sibling element (deduplicated): Tag and Chip side by side stay apart.
    const seen = new Set(), sibs = [];
    for (const j of kids.get(tree.els[i].parent) || []) {
      const k = j === i ? [] : knownOnly(tree.els[j].classes);
      const key = k.join(' ');
      if (k.length && !seen.has(key) && sibs.length < 12) { seen.add(key); sibs.push(k); }
    }
    // Inside it: one class list per element too (deduplicated), so a Tag and a Chip stay apart.
    const innerSeen = new Set(), inner = [];
    for (let j = i + 1; j < tree.els.length && tree.els[j].start < (tree.els[i].end ?? 0) && inner.length < 60; j++) {
      const k = knownOnly(tree.els[j].classes);
      const key = k.join(' ');
      if (k.length && !innerSeen.has(key)) { innerSeen.add(key); inner.push(k); }
    }
    return { ctx, sibs, inner };
  };

  const tokenRe =/-?[_a-zA-Z][\w-]*/g;
  const scanScriptText = (file, text, offset, lineAt) => {
    let lineNo = null, bucket = [], openTag = null;
    const flush = () => { if (bucket.length) record(file, lineNo, bucket, 'script', null, 0, openTag); bucket = []; };
    const inString = config.__stringsOnly ? classStrings(text) : null;
    for (const m of text.matchAll(tokenRe)) {
      if (!known.has(m[0])) continue;
      if (inString && !inString(m.index)) continue;
      const ln = lineAt(offset + m.index);
      if (ln !== lineNo) {
        flush(); lineNo = ln;
        // Markup built in a string: the tag opened before the class on this line.
        const before = text.slice(text.lastIndexOf('\n', m.index) + 1, m.index);
        const start = before.lastIndexOf('<');
        openTag = start >= 0 && /^<[a-zA-Z]/.test(before.slice(start)) ? before.slice(start) + text.slice(m.index, text.indexOf('>', m.index) + 1) : '';
      }
      bucket.push(m[0]);
    }
    flush();
  };

  for (const file of files) {
    const markup = MARKUP.test(file);
    const script = SCRIPT.test(file);
    if (!markup && !script) continue;
    const src = readText(path.join(root, file), '');
    const lineAt = lineIndex(src);
    if (markup) {
      // Where this file is included elsewhere, only its outermost unit counts.
      let top = null;
      const tree = elementTree(src);
      const kids = new Map();
      tree.els.forEach((e, i) => (kids.get(e.parent) || kids.set(e.parent, []).get(e.parent)).push(i));
      for (const a of classAttributes(src)) {
        const i = tree.at(a.pos + 1);
        const roots = record(file, a.line, a.classes, 'markup', src, a.pos + 1, undefined, i >= 0 ? placeOf(tree, i, kids) : null);
        if (!top && roots.length) top = roots;
      }
      const found = new Set(top || []);
      for (const [s, e] of scriptRanges(src)) scanScriptText(file, src.slice(s, e), s, lineAt);
      partialUnits.set(file, found);
      for (const inc of includes(src)) {
        const target = relPosix(root, path.resolve(root, path.dirname(file), inc.path));
        if (target === file) continue;
        (partialUsers.get(target) || partialUsers.set(target, []).get(target)).push({ file, line: inc.line });
      }
    } else scanScriptText(file, src, 0, lineAt);
  }

  // A partial's units are also used wherever the partial is included.
  const partials = [];
  for (const [partial, users] of partialUsers) {
    const ids = partialUnits.get(partial) || new Set();
    partials.push({ file: partial, includedBy: users, units: [...ids] });
    for (const id of ids) for (const user of users) {
      const entry = { file: user.file, line: user.line, scope: scopeOf(user.file).name, kind: 'include', via: partial, classes: [] };
      (isShowcase(user.file) ? units.get(id).showcase : units.get(id).usages).push(entry);
    }
  }

  // ── 3. Tokens and icons ─────────────────────────────────────────────
  // Where each custom property is used: one entry per rule, with its owner unit.
  const tokenSites = new Map();
  for (const [file, src] of allCss) {
    const scope = scopeOf(file);
    eachRule(parseCss(src), (rule, ctx) => {
      const vars = varsUsed(rule.body);
      if (!vars.length) return;
      const first = classesIn(splitTopLevel(rule.prelude)[0] || '').filter(prefixOk)[0];
      const unit = first ? rootOf(first) : null;
      const props = declarations(rule.body);
      for (const v of vars) {
        const prop = props.find((d) => d.value.includes(v))?.prop || null;
        (tokenSites.get(v) || tokenSites.set(v, []).get(v)).push({ file, line: rule.line, scope: scope.name, library: scope.library, selector: rule.prelude.slice(0, 120), prop, unit, subject: subjectClass(rule.prelude), note: ruleNote(ctx.note), section: sectionHeader(ctx.comment) });
      }
    });
  }
  const tokens = [];
  for (const file of config.tokens || []) {
    for (const t of customProperties(readText(path.join(root, file), ''))) {
      const sites = (tokenSites.get(t.name) || []).filter((s) => !(s.file === file && s.selector.startsWith(':root')));
      tokens.push({ ...t, file, kind: tokenKind(t), uses: sites.length, sites });
    }
  }

  let icons = [];
  if (config.icons?.dir) {
    const dir = config.icons.dir.replace(/\/$/, '');
    const svgs = files.filter((f) => f.startsWith(dir + '/') && f.endsWith('.svg'));
    const classFor = new Map();
    for (const [file, src] of allCss) {
      eachRule(parseCss(src), (rule) => {
        const m = /url\(\s*['"]?([^'")]+\.svg)['"]?\s*\)/.exec(rule.body);
        if (!m) return;
        const target = relPosix(root, path.resolve(root, path.dirname(file), m[1]));
        const cls = classesIn(rule.prelude)[0];
        if (cls && !classFor.has(target)) classFor.set(target, cls);
      });
    }
    icons = svgs.map((f) => {
      const name = path.posix.basename(f, '.svg');
      const size = /-(\d{2})$/.exec(name)?.[1];
      return { name, file: f, class: classFor.get(f) || null, size: size ? Number(size) : null };
    });
  }

  // ── 4. Finalise ─────────────────────────────────────────────────────
  const out = [];
  for (const u of units.values()) {
    if (!u.defined.length && !u.overrides.length) continue;
    const reps = pickRepresentatives(u.usages.filter((x) => !x.part));
    const sn = snippets.get(u.id) || [];
    out.push({
      id: u.id, kind: u.kind, scope: u.scope, library: u.library, section: u.section, defined: u.defined,
      modifiers: Object.fromEntries(Object.entries(u.modifiers).sort().map(([k, v]) => [k, { pseudo: [...v.pseudo] }])),
      elements: Object.fromEntries(Object.entries(u.elements).sort().map(([k, v]) => [k, { pseudo: [...v.pseudo] }])),
      pseudo: [...u.pseudo], rootPseudo: [...u.rootPseudo], media: [...u.media], tokens: [...u.tokens].sort(), hardcoded: [...u.hardcoded],
      contextual: [...u.contextual].filter((c) => c !== u.id), overrides: u.overrides,
      overrideClasses: [...(u.__overrideClasses || [])].sort(),
      usageCount: u.usages.length, fileCount: new Set(u.usages.map((x) => x.file)).size, showcaseCount: u.showcase.length,
      elementsUsed: tally(u.usages.filter((x) => !x.part && x.kind !== 'include')),
      modifierElements: Object.fromEntries(Object.keys(u.modifiers).map((m) => [m, tally(u.usages.filter((x) => x.classes.includes(m)))])),
      rules: u.__rules || [],
      usages: u.usages, representative: reps,
      snippets: pickSnippets(sn),
      hash: sha1(u.__text.join('\n')),
    });
  }
  out.sort((a, b) => (b.library - a.library) || a.id.localeCompare(b.id));
  // Every :root custom property in the project (library first): features keep their
  // own variables (`--mont`), and text styles must still resolve to a real family.
  const vars = {};
  for (const [file] of allCss) for (const p of customProperties(allCss.get(file))) if (!(p.name in vars)) vars[p.name] = p.value;
  return { units: out, tokens, icons, partials, globalRules, textSites, labels, vars };
}

// Text style set by one rule: raw values; the build resolves tokens and inheritance.
// Only rules that set a size count — a lone font-weight is a tweak, not a style.
function typographyOf(decls) {
  const d = Object.fromEntries(decls.map((x) => [x.prop, x.value.replace(/\s*!important$/, '')]));
  let size = d['font-size'], weight = d['font-weight'], family = d['font-family'], lh = d['line-height'];
  if (d.font) {
    // font: [style] [weight] size[/line-height] family
    const m = /(?:^|\s)((?:\d+(?:\.\d+)?)(?:px|rem|em|%)|var\([^)]+\))(?:\s*\/\s*([^\s]+))?\s+(.+)$/.exec(d.font);
    if (m) { size ||= m[1]; lh ||= m[2]; family ||= m[3]; const w = /\b([1-9]00|bold|normal|lighter|bolder)\b/.exec(d.font.slice(0, m.index + 1)); if (w) weight ||= w[1]; }
  }
  if (!size) return null;
  return { size, weight: weight || null, family: family || null, lineHeight: lh || null, letterSpacing: d['letter-spacing'] || null };
}

// Element facts for a set of usages: which tags, and how many are actionable.
function tally(list) {
  const tags = {};
  const interactive = { yes: 0, no: 0, unknown: 0 };
  for (const x of list) {
    if (x.tag) tags[x.tag] = (tags[x.tag] || 0) + 1;
    interactive[x.interactive === true ? 'yes' : x.interactive === false ? 'no' : 'unknown']++;
  }
  return { tags, interactive, total: list.length };
}

function tokenKind(t) {
  const n = t.name.toLowerCase();
  const v = t.value.toLowerCase();
  if (/shadow/.test(n)) return 'shadow';
  if (/radius|rounded/.test(n)) return 'radius';
  if (/font|family/.test(n) && !/size|weight/.test(n)) return 'font';
  if (/^(#[0-9a-f]{3,8}|rgba?\(|hsla?\(|oklch\(|color-mix\()/.test(v) || /(^|-)(color|bg|text)(-|$)/.test(n)) return 'color';
  if (/^-?[\d.]+(px|rem|em|%)$/.test(v)) return 'size';
  if (/ease|cubic-bezier|ms$|s$/.test(v)) return 'motion';
  return 'other';
}

// One usage per distinct modifier combination, spread across files.
function pickRepresentatives(usages, limit = 5) {
  const byCombo = new Map();
  for (const u of usages) {
    const key = u.classes.filter((c) => c.includes('--')).join(' ');
    (byCombo.get(key) || byCombo.set(key, []).get(key)).push(u);
  }
  const combos = [...byCombo.entries()].sort((a, b) => b[1].length - a[1].length);
  const chosen = [];
  const files = new Set();
  for (const [, list] of combos) {
    if (chosen.length >= limit) break;
    const pick = list.find((u) => !files.has(u.file)) || list[0];
    chosen.push(pick);
    files.add(pick.file);
  }
  // One combination only (a logo): still show it in other files, up to the limit.
  for (const u of usages) {
    if (chosen.length >= limit) break;
    if (!files.has(u.file)) { chosen.push(u); files.add(u.file); }
  }
  return chosen;
}

function pickSnippets(list) {
  const byCombo = new Map();
  for (const s of list) {
    const key = s.combo.join(' ');
    if (!byCombo.has(key) || s.html.length < byCombo.get(key).html.length) byCombo.set(key, s);
  }
  return [...byCombo.values()].slice(0, 24);
}
