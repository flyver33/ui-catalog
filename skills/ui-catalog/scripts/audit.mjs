#!/usr/bin/env node
// ui-catalog audit — «несостыковки»: places where the code contradicts itself or the
// rules every design system keeps (hover only on what can be pressed, a visible focus,
// colours from tokens…).
//   node audit.mjs [--root <project>] [--out <dir>] [--quiet]
// Writes one human-readable report, outside the catalog: <out>/../ui-issues.md
// (catalog.config.json → issuesFile changes it). It states facts and what could be done;
// nobody is asked anything, and the catalog itself describes the code as it is.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, readJson, writeJson, writeText, sha1, isMain, relPosix, mdHref } from './lib/fsutil.mjs';
import { resolveOut, ignoreIds } from './lib/config.mjs';
import { runScan } from './scan.mjs';
import { loadLibrary } from './lib/library.mjs';
import { splitTopLevel, pseudoByClass, INTERACTIVE } from './lib/css.mjs';
import { parseColor, colorLiterals, over, deltaE, lightness, hex } from './lib/color.mjs';
import { TYPES, STATE_SELECTORS, STATE_VOCAB } from './lib/types.mjs';
import { textStyles } from './lib/typography.mjs';
import { splitModifiers } from './lib/split.mjs';
import { catalogTokens } from './lib/tokens.mjs';
import { patternState, instancesOf } from './lib/pattern-run.mjs';
import { COMPOSITE_TYPES, SLOT_RU, slotsOf } from './lib/composites.mjs';

export const RULES = {
  'pseudo-only': { title: 'Модификатор только меняет состояние', severity: 3,
    explain: 'Все правила модификатора срабатывают только на :hover/:focus/:active. Это не вид компонента, а заплатка поверх состояния — обычно «этот элемент не кликабельный».',
    options: { split: 'сделать два класса: статичный и кликабельный', state: 'убрать модификатор: кликабельность — свойство элемента', 'fix-code': 'исправить в коде базы' } },
  'hover-on-static': { title: 'Hover у некликабельных элементов', severity: 3,
    explain: 'У базового класса есть :hover, а стоит он и на статичных элементах (span, div). Hover обещает действие, которого нет.',
    options: { split: 'сделать два класса: статичный (без hover) и кликабельный', 'fix-code': 'hover только у кликабельных (button/a) — исправить в базе' } },
  'modifier-is-element': { title: 'Другой компонент сделан модификатором', severity: 2,
    explain: 'Базовый класс стоит на статичных элементах, а этот модификатор — только на кликабельных и меняет вид. По сути это другой компонент (кликабельный Chip рядом со статичным Tag), записанный модификатором того же класса. В каталоге он описан отдельным компонентом.',
    options: { split: 'сделать ему свой класс — два компонента и в коде', tone: 'если у цвета есть смысл (статус) — назвать модификатор по смыслу и поставить его и на статичные' } },
  'focus-lost': { title: 'Пропал фокус с клавиатуры', severity: 3,
    explain: 'Элемент кликабельный, но его правило убирает outline и не задаёт своего :focus-visible — общая обводка фокуса перебита каскадом. Это нарушение доступности (WCAG 2.4.7), здесь эталон не голосует.',
    options: { 'fix-code': 'вернуть обводку фокуса в базе' } },
  'untokened-color': { title: 'Цвета без токенов', severity: 1,
    explain: 'Цвет задан значением, а не токеном. Ближайшие токены — только подсказка: близкий цвет может значить другое.',
    options: { token: 'заменить на ближайший токен', 'new-token': 'завести новый токен' } },
  'near-duplicate': { title: 'Два вида почти не отличаются', severity: 3,
    explain: 'Покой обоих видов почти одинаков на фонах, где они стоят. Если разницу не видно, это один вид в двух классах.',
    options: { merge: 'слить в один вид', keep: 'если оба нужны — сделать разницу заметной' } },
  'weak-hover': { title: 'Hover почти не виден', severity: 2,
    explain: 'Разница между покоем и наведением меньше заметной (ΔE < 2) — на экране её не увидеть.',
    options: { 'fix-code': 'усилить hover в базе' } },
  'browser-default': { title: 'Видна рамка браузера', severity: 2,
    explain: 'Класс стоит на <button>, но не задаёт border, и общий сброс для кнопок её не убирает — браузер рисует свою серую рамку.',
    options: { 'fix-code': 'сбросить рамку в базе (border: none у класса или у button)' } },
  'type-near-duplicate': { title: 'Почти одинаковые стили текста', severity: 2,
    explain: 'Два стиля базы с одним семейством, размером и начертанием отличаются на долю пикселя в интерлиньяже или трекинге. Глазом разницы нет — это один стиль, записанный дважды.',
    options: { merge: 'слить в один стиль' } },
  'token-unused': { title: 'Токены объявлены, но не используются', severity: 1,
    explain: 'Токен есть в файле токенов, но ни одно правило CSS его не берёт. В каталог такие токены не попадают.',
    options: { remove: 'удалить из файла токенов', use: 'если он нужен — заменить им значения без токенов там, где цвет тот же' } },
  'pattern-diverges': { title: 'Составное сделано по-разному', severity: 2,
    explain: 'Одна закономерность (пустое состояние, окно, сниппет) в разных местах собрана из разных частей: где-то нет заголовка, где-то действия.',
    options: { canon: 'привести экземпляры к канону — самой частой анатомии', component: 'вынести составное в общий компонент' } },
  'pattern-twin': { title: 'Один блок сделан дважды', severity: 2,
    explain: 'Два компонента с одним именем в разных местах — экземпляры одной закономерности. Их правят по отдельности, и они расходятся.',
    options: { merge: 'оставить один компонент и использовать его в обоих местах' } },
  'pattern-bypass': { title: 'Окно в обход общего компонента', severity: 2,
    explain: 'Большинство окон собраны на общем компоненте окна, а эти — своей вёрсткой: у них своё затемнение, закрытие и фокус.',
    options: { component: 'собрать на общем компоненте окна' } },
  'token-alias': { title: 'Одно значение под несколькими именами', severity: 2,
    explain: 'Одно и то же значение используется под разными именами токенов. В каталоге остаётся одно — то, что встречается чаще.',
    options: { merge: 'оставить одно имя и заменить остальные', keep: 'если у имён разный смысл — развести значения' } },
  'type-local': { title: 'Стили текста вне базы', severity: 2,
    explain: 'Страницы и фичи задают размер, начертание и интерлиньяж своим CSS, в обход шкалы базы. Каждый такой стиль — решение, которое никто не принимал.',
    options: { consolidate: 'свести к стилям базы: где есть почти такой же — заменить на базовый', 'extend-scale': 'нужные добавить в шкалу базы' } },
  'missing-state': { title: 'Нет обязательного состояния', severity: 1,
    explain: 'У компонента этого типа обычно есть состояние, которого в CSS нет. Новые фичи не должны его изобретать.',
    options: { add: 'добавить состояние в базу', 'not-needed': 'если продукту оно не нужно — ничего' } },
};

const APPEARANCE = /^(color|background(-color)?|border(-color)?|box-shadow|outline(-color)?|fill|stroke)$/;

function specificity(sel) {
  const s = sel.replace(/::?[\w-]+\(([^()]*)\)/g, ' $1 ').replace(/::[\w-]+/g, '');
  const ids = (s.match(/#[\w-]+/g) || []).length;
  const cls = (s.match(/\.[\w-]+|\[[^\]]*\]|:[\w-]+/g) || []).length;
  const els = (s.replace(/[.#][\w-]+|\[[^\]]*\]|:[\w-]+/g, ' ').match(/(^|[\s>+~])[a-zA-Z][\w-]*/g) || []).length;
  return [ids, cls, els];
}
const cmpSpec = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
const cmpOrder = (a, b) => a[0] - b[0] || a[1] - b[1];

export async function runAudit(root, outDir, { quiet = false, scan = null, write = true } = {}) {
  const { inventory, config } = scan || await runScan(root, outDir, { quiet: true, write });
  const lib = loadLibrary(outDir);
  const unitsById = new Map(inventory.units.map((u) => [u.id, u]));
  const scaffold = new Set(Object.keys(config.scaffold || {}));

  // Token values (all of them, for resolving), and colour tokens to suggest.
  const tokenVal = new Map(inventory.tokens.map((t) => [t.name, t.value]));
  const resolve = (v, d = 0) => (d > 8 ? v : String(v).replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)/g, (m, n, fb) => (tokenVal.has(n) ? resolve(tokenVal.get(n), d + 1) : fb || m)));
  const colorTokens = catalogTokens(inventory.tokens).shown.filter((t) => t.kind === 'color')
    .map((t) => ({ name: t.name, c: parseColor(resolve(t.value)) })).filter((t) => t.c);

  // Real backgrounds: gallery frame, page body, every data-bg in examples.
  const bgs = new Map();
  const addBg = (label, v) => { const c = parseColor(resolve(v)); if (c) bgs.set(hex(over(c, [255, 255, 255, 1])), { label, c: over(c, [255, 255, 255, 1]) }); };
  addBg('рамка галереи', config.frame?.bg || '#ffffff');
  for (const r of inventory.globalRules || []) if (/^body\b/.test(r.selector)) for (const d of r.decls) if (/^background/.test(d.prop)) addBg('фон страницы', d.value);
  for (const c of lib.components) for (const s of c.examples?.states || []) if (s.bg) addBg(`фон примера (${c.id})`, s.bg);
  const backgrounds = [...bgs.values()];

  // Which units are components, of which type, and their component.
  const atoms = inventory.units.filter((u) => u.library && !scaffold.has(u.id) && !ignoreIds(config).includes(u.id));

  const findings = [];
  // A modifier cut off as its own component (Chip from Tag) belongs to it; the rest to the base.
  const compFor = (unit, subject) => lib.components.find((c) => c.declared?.includes(subject)) || lib.components.find((c) => c.declared?.includes(unit.id)) || lib.components.find((c) => c.units.includes(unit.id));
  const add = (rule, subject, unit, facts, extra = {}) => {
    if (extra.detail) facts = { ...facts, colors: extra.detail.map((d) => d.color) };
    const comp = 'component' in extra ? extra.component : compFor(unit, subject);
    delete extra.component;
    findings.push({
      id: `${rule}:${subject}`, rule, subject, unit: unit.id, component: comp?.id || null,
      severity: RULES[rule].severity, weight: RULES[rule].severity * Math.max(1, unit.usageCount),
      facts, ...extra,
    });
  };

  // Rest-state appearance of a modifier: declarations from rules whose selector
  // has the modifier and no interactive pseudo-class.
  const restOf = (u, cls, wantPseudo = null) => {
    const out = {};
    for (const r of u.rules) for (const sel of splitTopLevel(r.selector)) {
      if (!new RegExp(`\\.${cls.replace(/[-]/g, '\\-')}(?![\\w-])`).test(sel)) continue;
      const ps = (pseudoByClass(sel)[cls] || []).filter((p) => INTERACTIVE.includes(p));
      if (wantPseudo ? !ps.includes(wantPseudo) : ps.length) continue;
      // `.mod .child` styles a descendant, not the element itself.
      const at = sel.search(new RegExp(`\\.${cls.replace(/[-]/g, '\\-')}(?![\\w-])`));
      if (/[\s>+~]/.test(sel.slice(at).trim().replace(/\([^)]*\)/g, ''))) continue;
      for (const d of r.decls) out[d.prop] = d.value;
    }
    return out;
  };
  const bgOf = (decls) => { const v = decls['background-color'] || decls.background; return v ? colorLiterals(resolve(v))[0] || resolve(v).trim() : null; };

  for (const u of atoms) {
    const els = u.elementsUsed || { interactive: { yes: 0, no: 0, unknown: 0 }, tags: {} };
    const act = els.interactive.yes + els.interactive.unknown;
    const comps = lib.components.filter((c) => c.units.includes(u.id));

    // pseudo-only modifiers
    for (const mod of Object.keys(u.modifiers)) {
      const sels = u.rules.flatMap((r) => splitTopLevel(r.selector)).filter((s) => new RegExp(`\\.${mod.replace(/[-]/g, '\\-')}(?![\\w-])`).test(s));
      if (sels.length && sels.every((s) => (pseudoByClass(s)[mod] || []).some((p) => INTERACTIVE.includes(p)))) {
        add('pseudo-only', mod, u, { selectors: sels, elements: u.modifierElements?.[mod]?.tags || {} });
      }
    }

    // hover on static elements
    if (u.rootPseudo.includes('hover') && els.interactive.no > 0) {
      add('hover-on-static', u.id, u, { tags: els.tags, interactive: els.interactive });
    }

    // modifier encodes interactivity
    // The same test that cuts the modifier off as its own component (lib/split.mjs).
    for (const mod of splitModifiers(u)) {
      const own = lib.components.find((c) => c.declared?.includes(mod));
      const base = {};
      for (const x of u.usages) if (!x.part && x.tag && !(x.classes || []).includes(mod)) base[x.tag] = (base[x.tag] || 0) + 1;
      add('modifier-is-element', mod, u, { modifier: u.modifierElements?.[mod]?.tags || {}, base }, own ? { component: own } : {});
    }

    // a <button> that keeps the browser's own border
    // Modifiers cut off as their own component (Chip from Tag): findings about their
    // elements and rules go to that component.
    const cuts = Object.keys(u.modifiers).filter((m) => lib.components.some((c) => c.declared?.includes(m)));
    const cutOf = (classes) => cuts.find((m) => (classes || []).includes(m)) || null;
    const ofRule = (sel) => cuts.find((m) => new RegExp(`\\.${m.replace(/[-]/g, '\\-')}(?![\\w-])`).test(sel)) || null;
    if ((els.tags.button || 0) > 0) {
      const sets = (rules) => rules.some((r) => r.decls.some((d) => /^border(-style|-width)?$/.test(d.prop)));
      const resetForButtons = (inventory.globalRules || []).filter((r) => splitTopLevel(r.selector).some((s) => /^button\b/.test(s.trim())));
      if (!sets(u.rules.filter((r) => !/:(hover|active|focus)/.test(r.selector))) && !sets(resetForButtons)) {
        const btns = u.usages.filter((x) => !x.part && String(x.tag).toLowerCase() === 'button');
        const cut = btns.length && btns.every((x) => cutOf(x.classes) === cutOf(btns[0].classes)) ? cutOf(btns[0].classes) : null;
        // The place to fix is the base rule; the finding belongs to the component on those buttons.
        const own = cut && lib.components.find((c) => c.declared?.includes(cut));
        add('browser-default', u.id, u, { buttons: els.tags.button, prop: 'border' }, own ? { component: own } : {});
      }
    }

    // focus lost through the cascade
    if (act > 0) {
      const kills = u.rules.filter((r) => !/:focus/.test(r.selector) && r.decls.some((d) => d.prop === 'outline' && /^(none|0)\b/.test(d.value)));
      const own = u.rules.some((r) => /:focus(-visible)?\b/.test(r.selector));
      if (kills.length && !own) {
        const global = (inventory.globalRules || []).filter((r) => /:focus-visible/.test(r.selector) && r.decls.some((d) => d.prop === 'outline'));
        for (const k of kills) {
          const ks = splitTopLevel(k.selector).map(specificity).sort(cmpSpec).pop();
          const beaten = global.filter((g) => cmpSpec(splitTopLevel(g.selector).map(specificity).sort(cmpSpec).pop(), ks) < 0 || (cmpSpec(splitTopLevel(g.selector).map(specificity).sort(cmpSpec).pop(), ks) === 0 && cmpOrder(g.order, k.order) < 0));
          if (!global.length || beaten.length) {
            add('focus-lost', u.id, u, { rule: `${k.file}:${k.line} ${k.selector}`, overrides: beaten.map((g) => `${g.file}:${g.line} ${g.selector}`), specificity: ks.join(',') });
            break;
          }
        }
      }
    }

    // untokened colours (deduplicated per unit)
    const byOwner = new Map();
    for (const r of u.rules) for (const d of r.decls) {
      if (d.prop.startsWith('--') || /var\(/.test(d.value)) continue;
      const key = ofRule(r.selector) || u.id;
      const literals = byOwner.get(key) || byOwner.set(key, new Map()).get(key);
      for (const lit of colorLiterals(d.value)) if (lit !== 'transparent') literals.set(lit.replace(/\s+/g, ''), { lit, where: `${r.selector} { ${d.prop} }` });
    }
    for (const [subject, literals] of byOwner) if (literals.size) {
      const items = [...literals.values()].map(({ lit, where }) => {
        const c = parseColor(lit);
        const near = c ? colorTokens.map((t) => ({ name: t.name, d: Math.max(...backgrounds.map((b) => deltaE(over(c, b.c), over(t.c, b.c)))) }))
          .sort((a, b) => a.d - b.d).slice(0, 2).map((t) => `${t.name} (ΔE ${t.d.toFixed(1)})`) : [];
        return { color: lit, where, near };
      });
      add('untokened-color', subject, u, { colors: items.map((i) => i.color) }, { detail: items });
    }

    // near-duplicate appearance variants, and weak hover
    const kinds = Object.keys(u.modifiers).map((m) => ({ m, rest: restOf(u, m) })).filter((x) => bgOf(x.rest) || x.rest.color);
    for (let i = 0; i < kinds.length; i++) for (let j = i + 1; j < kinds.length; j++) {
      const A = kinds[i], B = kinds[j];
      const pa = parseColor(bgOf(A.rest)), pb = parseColor(bgOf(B.rest));
      if (!pa || !pb) continue;
      const fa = parseColor(colorLiterals(resolve(A.rest.color || ''))[0]), fb = parseColor(colorLiterals(resolve(B.rest.color || ''))[0]);
      const per = backgrounds.map((b) => ({ bg: b.label, dBg: +deltaE(over(pa, b.c), over(pb, b.c)).toFixed(1), dText: fa && fb ? +deltaE(over(fa, b.c), over(fb, b.c)).toFixed(1) : null }));
      const worst = Math.max(...per.map((p) => Math.max(p.dBg, p.dText ?? 0)));
      if (worst < 5) {
        const pair = [A.m, B.m].sort().join(' ≈ ');
        add('near-duplicate', pair, u, { pair: [A.m, B.m].sort(), per, verdict: worst < 1 ? 'одинаково' : 'почти' });
      }
    }
    for (const { m, rest } of kinds) {
      const hov = restOf(u, m, 'hover');
      const r0 = parseColor(bgOf(rest)), r1 = parseColor(bgOf(hov));
      if (!r0 || !r1) continue;
      const per = backgrounds.map((b) => ({ bg: b.label, dE: +deltaE(over(r0, b.c), over(r1, b.c)).toFixed(1), dL: +(lightness(over(r1, b.c)) - lightness(over(r0, b.c))).toFixed(1) }));
      if (Math.max(...per.map((p) => p.dE)) < 2) add('weak-hover', m, u, { per });
    }

    // required states by reference type
    for (const comp of comps) {
    const type = comp.data.type && TYPES[comp.data.type];
    if (type && type.states.length && (type.interactive === true || act > 0)) {
      const sels = u.rules.map((r) => r.selector).join(' ');
      const globalFocus = (inventory.globalRules || []).some((r) => /:focus-visible/.test(r.selector));
      const killed = findings.some((f) => f.rule === 'focus-lost' && f.unit === u.id);
      const missing = type.states.filter((s) => {
        if (s === 'focus-visible') return killed || (!globalFocus && !STATE_SELECTORS[s].some((re) => re.test(sels)));
        return !(STATE_SELECTORS[s] || []).some((re) => re.test(sels));
      });
      if (missing.length) add('missing-state', comps.length > 1 ? comp.id : u.id, u, { type: comp.data.type, missing }, { component: comp });
    }
    }
  }

  // Text styles of the library that differ by less than the eye can see.
  const bodyRule = (inventory.globalRules || []).find((r) => /^body\b/.test(r.selector.trim()));
  const baseStyles = textStyles((inventory.textSites || []).filter((s) => s.library), resolve, bodyRule?.decls || []);
  for (let i = 0; i < baseStyles.length; i++) for (let j = i + 1; j < baseStyles.length; j++) {
    const A = baseStyles[i], B = baseStyles[j];
    if (A.family !== B.family || A.size !== B.size || A.weight !== B.weight) continue;
    const dLh = Math.abs((A.lineHeight ?? 0) - (B.lineHeight ?? 0)), dLs = Math.abs((A.letterSpacing || 0) - (B.letterSpacing || 0));
    if (dLh > 1 || dLs > 0.1) continue;
    const site = A.sites[0];
    const unit = unitsById.get(site.unit) || { id: 'typography', usageCount: A.sites.length + B.sites.length, defined: [{ file: site.file, line: site.line }], rules: [] };
    add('type-near-duplicate', `${A.name} (${+(A.letterSpacing || 0).toFixed(3)}px) ≈ ${B.name} (${+(B.letterSpacing || 0).toFixed(3)}px)`, unit,
      { a: { name: A.name, lh: A.lineHeight, ls: A.letterSpacing, at: A.sites.map((s) => `${s.file}:${s.line} ${s.selector}`) }, b: { name: B.name, lh: B.lineHeight, ls: B.letterSpacing, at: B.sites.map((s) => `${s.file}:${s.line} ${s.selector}`) }, dLh, dLs: +dLs.toFixed(3) }, { component: null });
  }

  // Text styles set outside the library, each with the base style it nearly matches.
  const varMap = new Map([...Object.entries(inventory.vars || {}), ...tokenVal]);
  const resolveAny = (v, d = 0) => (d > 8 ? v : String(v).replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)/g, (m, n, fb) => (varMap.has(n) ? resolveAny(varMap.get(n), d + 1) : fb || m)));
  const allStyles = textStyles(inventory.textSites || [], resolveAny, bodyRule?.decls || []);
  const baseAll = allStyles.filter((s) => s.library), localAll = allStyles.filter((s) => !s.library);
  if (localAll.length) {
    const nearest = (s) => baseAll.filter((b) => b.family === s.family && Math.abs(b.size - s.size) <= 1 && Math.abs(b.weight - s.weight) <= 100)
      .sort((a, b) => Math.abs(a.size - s.size) - Math.abs(b.size - s.size) || Math.abs((a.lineHeight || 0) - (s.lineHeight || 0)) - Math.abs((b.lineHeight || 0) - (s.lineHeight || 0)))[0];
    const byFamily = {};
    for (const s of localAll) byFamily[s.family] = (byFamily[s.family] || 0) + 1;
    const rows = localAll.map((s) => ({ name: s.name, uses: s.sites.length, near: nearest(s)?.name || null, at: `${s.sites[0].file}:${s.sites[0].line}` }))
      .sort((a, b) => !!b.near - !!a.near || b.uses - a.uses);
    const scopes = [...new Set(localAll.flatMap((s) => s.sites.map((x) => x.scope)))];
    add('type-local', 'text-styles', { id: 'typography', usageCount: localAll.reduce((n, s) => n + s.sites.length, 0), rules: [] },
      { total: localAll.length, base: baseAll.length, byFamily, scopes, near: rows.filter((r) => r.near).length }, { component: null, detail: undefined, rows });
  }

  // Tokens the catalog leaves out (lib/tokens.mjs): declared and used nowhere; one value, several names.
  {
    const { unused, aliases } = catalogTokens(inventory.tokens);
    const decl = (list) => ({ id: 'tokens', usageCount: list.length, defined: list.slice(0, 1).map((t) => ({ file: t.file, line: t.line })), rules: list.map((t) => ({ file: t.file, line: t.line, selector: t.name })) });
    if (unused.length) add('token-unused', unused.map((t) => t.name).join(' ≈ '), decl(unused), { names: unused.map((t) => t.name), files: [...new Set(unused.map((t) => t.file))] }, { component: null, decl: decl(unused).rules });
    if (aliases.length) {
      const all = aliases.flatMap((a) => [a.keep, ...a.drop]);
      add('token-alias', all.map((t) => t.name).join(' ≈ '), decl(all), { pairs: aliases.map((a) => ({ keep: a.keep.name, keepUses: a.keep.uses, drop: a.drop.map((t) => ({ name: t.name, uses: t.uses })), value: a.value })) }, { component: null, decl: decl(all).rules });
    }
  }

  // Composites (React): what the instances of one pattern do differently.
  if (inventory.react && config.adapter === 'react') {
    const state = patternState(inventory, config, outDir);
    const all = state.composites.map((comp) => ({ comp, instances: instancesOf(comp, state, inventory) }));
    const placeOf = (x) => ({ file: x.file, line: x.line, selector: x.decl || 'разметка на месте' });
    for (const { comp, instances } of all) {
      const T = COMPOSITE_TYPES[comp.data.type];
      const name = comp.data.name || comp.id;
      const pseudo = { id: comp.id, usageCount: instances.length };
      const known = instances.map((x) => ({ x, slots: slotsOf(comp.data.type, x.tree, inventory.react.trees) })).filter((a) => a.slots);
      if (T && known.length >= 3) {
        const key = (s) => Object.entries(s).filter(([, v]) => v).map(([k]) => k).join(' + ');
        const counts = new Map();
        for (const a of known) counts.set(key(a.slots), (counts.get(key(a.slots)) || 0) + 1);
        const [canon, canonCount] = [...counts].sort((a, b) => b[1] - a[1])[0];
        const want = canon.split(' + ').filter(Boolean);
        const off = known.filter((a) => want.some((s) => !a.slots[s])).map((a) => ({ at: `${a.x.file}:${a.x.line}`, missing: want.filter((s) => !a.slots[s]).map((s) => SLOT_RU[s] || s) }));
        if (off.length && canonCount >= 2) add('pattern-diverges', name, pseudo, { name, canon: want.map((s) => SLOT_RU[s] || s).join(' + '), canonCount, total: known.length, off }, { component: null, decl: known.filter((a) => off.some((o) => o.at === `${a.x.file}:${a.x.line}`)).map((a) => placeOf(a.x)) });
      }
      const byDecl = new Map();
      for (const x of instances.filter((y) => y.decl)) (byDecl.get(x.decl) || byDecl.set(x.decl, new Set()).get(x.decl)).add(x.file);
      for (const [decl, files] of byDecl) if (files.size > 1) add('pattern-twin', decl, pseudo, { decl, files: [...files], name }, { component: null, decl: instances.filter((x) => x.decl === decl).map(placeOf) });
    }
    const dialogs = all.filter(({ comp }) => comp.data.type === 'dialog').flatMap(({ instances }) => instances).filter((x) => x.tree);
    const withBase = dialogs.filter((x) => /^(Modal|Dialog)$/.test(x.tree.root) || x.tree.components.some((c) => /^(Modal|Dialog)$/.test(c)));
    const off = dialogs.filter((x) => !withBase.includes(x));
    if (withBase.length > dialogs.length / 2 && off.length) add('pattern-bypass', 'Modal', { id: 'dialog', usageCount: dialogs.length }, { base: 'Modal', with: withBase.length, total: dialogs.length, off: off.map((x) => `${x.file}:${x.line}${x.decl ? ` ${x.decl}` : ''}`) }, { component: null, decl: off.map(placeOf) });
  }

  const result = { backgrounds: backgrounds.map((b) => ({ label: b.label, color: hex(b.c) })), findings };
  const reportFile = issuesFile(root, outDir, config);
  if (write) {
    writeReport(root, reportFile, config, findings, lib, unitsById);
    for (const old of ['audit.json', 'issues']) fs.rmSync(path.join(outDir, old), { recursive: true, force: true }); // replaced by the report
  }
  if (!quiet) {
    console.log(`ui-catalog audit: несостыковок ${findings.length}`);
    console.log(`  ${path.relative(process.cwd(), reportFile)}`);
  }
  return result;
}

function factLine(f) {
  const x = f.facts;
  const tags = (t) => Object.entries(t || {}).map(([k, v]) => `${k} ×${v}`).join(', ') || '—';
  switch (f.rule) {
    case 'pseudo-only': return `\`${f.subject}\`: ${x.selectors.map((s) => `\`${s}\``).join(', ')}; стоит на ${tags(x.elements)}`;
    case 'hover-on-static': return `\`${f.subject}\` стоит на ${tags(x.tags)} — кликабельных ${x.interactive.yes}, статичных ${x.interactive.no}${x.interactive.unknown ? `, непонятно ${x.interactive.unknown}` : ''}`;
    case 'modifier-is-element': return `\`${f.subject}\` только на ${tags(x.modifier)}, а базовый класс на ${tags(x.base)}`;
    case 'focus-lost': return `\`${x.rule}\` (специфичность ${x.specificity}) перебивает ${x.overrides.map((o) => `\`${o}\``).join(', ') || 'общий фокус, которого нет'}`;
    case 'untokened-color': return `\`${f.unit}\`: ` + f.detail.map((d) => `\`${d.color}\` в \`${d.where}\`${d.near.length ? ` → ближе всего ${d.near.join(', ')}` : ''}`).join('; ');
    case 'near-duplicate': return `\`${x.pair.join('` и `')}\` — ${x.verdict}: ` + x.per.map((p) => `${p.bg}: фон ΔE ${p.dBg}${p.dText != null ? `, текст ΔE ${p.dText}` : ''}`).join('; ');
    case 'weak-hover': return `\`${f.subject}\`: ` + x.per.map((p) => `${p.bg}: ΔE ${p.dE}, светлее на ${p.dL}`).join('; ');
    case 'missing-state': return `\`${f.unit}\` (тип ${TYPES[x.type]?.name || x.type}): нет ${x.missing.map((s) => `«${STATE_VOCAB[s] || s}»`).join(', ')}`;
    default: return f.subject;
  }
}

// ── «Несостыковки»: one plain-language section per finding ──────────
// The reader is a person, not a developer: say what they would notice,
// where it is, why it matters and what can be done. Facts stay at the bottom.

const ruPlural = (n, one, few, lots) => (n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : lots);
const DE_NOTE = 'ΔE — насколько глаз видит разницу между двумя цветами: меньше 2 почти незаметно, больше 5 видно сразу.';
const tagsRu = (t) => Object.entries(t || {}).map(([k, v]) => `<${k}> × ${v}`).join(', ') || '—';
const STATE_RU = (s) => STATE_VOCAB[s] || s;

function plain(f, ctx) {
  const x = f.facts, c = '`';
  const nm = ctx.name;
  switch (f.rule) {
    case 'pseudo-only': return {
      title: `${nm}: ${c}${f.subject}${c} — не вид, а отмена реакции`,
      what: `У модификатора ${c}${f.subject}${c} нет своего вида: все его правила срабатывают только при наведении, нажатии или фокусе. Он не меняет, как элемент выглядит, — он только отключает реакцию. Так в код обычно добавляют «этот элемент не кликабельный», когда в дизайне такого случая не было. Стоит на: ${tagsRu(x.elements)}.`,
      why: 'В библиотеке он выглядел бы отдельным видом компонента, хотя на вид ничем не отличается. Разработчик не поймёт, когда его брать.' };
    case 'hover-on-static': return {
      title: `${nm}: подсвечивается при наведении, но на него нельзя нажать`,
      what: `${c}${f.unit}${c} меняет фон при наведении. При этом в ${x.interactive.no} из ${x.interactive.yes + x.interactive.no + x.interactive.unknown} мест он стоит на элементе, на который нельзя нажать (${tagsRu(x.tags)}).`,
      why: 'Подсветка при наведении обещает, что по элементу можно кликнуть. Человек наводит, видит отклик и кликает — а ничего не происходит.' };
    case 'modifier-is-element': return {
      title: `${nm}: другой компонент сделан модификатором ${c}${f.subject}${c}`,
      what: `${c}${f.subject}${c} меняет вид и стоит только на кликабельных элементах (${tagsRu(x.modifier)}), а сам ${c}${f.unit}${c} — на обычном тексте (${tagsRu(x.base)}). В коде это один класс, по сути — два компонента: статичный и кликабельный. Каталог описывает их отдельно.`,
      why: 'Кликабельное и некликабельное должны отличаться не случайным цветом, а компонентом: у кликабельного свои состояния (наведение, фокус), у статичного их нет. Пока это модификатор, его легко поставить на текст или забыть на кнопке.' };
    case 'focus-lost': return {
      title: `${nm}: не видно фокуса с клавиатуры`,
      what: `Если пройтись по странице клавишей Tab и дойти до компонента «${nm}», вокруг него не появляется синяя рамка фокуса, которая есть у остальных кликабельных элементов. Человек, который работает с клавиатуры, не видит, где он сейчас. Рамку убирает ${c}outline: none${c} в ${c}${x.rule}${c}: это правило перебивает общее ${x.overrides.map((o) => `${c}${o}${c}`).join(', ') || 'правило фокуса'}.`,
      why: 'Это требование доступности (WCAG 2.4.7): у кликабельного элемента фокус должен быть виден. Эталонные киты здесь не голосуют.' };
    case 'untokened-color': return {
      title: `${nm}: цвета без токенов`,
      what: `Цвета заданы значениями, а не токенами: ${f.detail.map((d) => `${c}${d.color}${c} в ${c}${d.where}${c}${d.near.length ? ` (ближе всего ${d.near.join(', ')})` : ''}`).join('; ')}. ${DE_NOTE}`,
      why: 'Такой цвет не поменяется вместе с палитрой, и его нельзя взять по имени в новом месте. Ближайший токен — только подсказка: похожий цвет может значить другое.' };
    case 'near-duplicate': return {
      title: `${nm}: ${x.pair.map((p) => c + p + c).join(' и ')} почти не отличаются`,
      what: `В покое эти два вида выглядят ${x.verdict === 'одинаково' ? 'одинаково' : 'почти одинаково'}: ${x.per.map((p) => `${p.bg} — фон ΔE ${p.dBg}${p.dText != null ? `, текст ΔE ${p.dText}` : ''}`).join('; ')}. ${DE_NOTE}`,
      why: 'Два класса на один вид: разработчик выбирает между ними наугад, и интерфейс расползается.' };
    case 'weak-hover': return {
      title: `${nm}: наведение на ${c}${f.subject}${c} почти не видно`,
      what: `При наведении цвет меняется слишком слабо: ${x.per.map((p) => `${p.bg} — ΔE ${p.dE}`).join('; ')}. ${DE_NOTE}`,
      why: 'Человек не замечает, что элемент реагирует, — наведение как будто не работает.' };
    case 'browser-default': return {
      title: `${nm}: на кнопке видна рамка браузера`,
      what: `${c}${f.unit}${c} стоит на ${c}<button>${c} (${x.buttons} мест), но не сбрасывает рамку. У кнопок браузер по умолчанию рисует серую объёмную рамку, и она видна — в галерее и на странице.`,
      why: 'Рамка браузера выглядит как ошибка вёрстки и отличается в разных браузерах.' };
    case 'type-near-duplicate': return {
      title: `Стили текста: ${x.a.name} записан дважды`,
      what: `Два стиля базы совпадают по семейству, размеру и начертанию и расходятся на ${x.dLh ? `${x.dLh}px в интерлиньяже` : ''}${x.dLh && x.dLs ? ' и ' : ''}${x.dLs ? `${x.dLs}px в трекинге` : ''} — глазом этого не увидеть. Первый: ${x.a.at.map((s) => c + s + c).join(', ')}. Второй: ${x.b.at.map((s) => c + s + c).join(', ')}.`,
      why: 'Это один стиль текста, записанный дважды. В шкале он будет выглядеть как два, и следующий разработчик добавит третий.' };
    case 'token-unused': return {
      title: `${x.names.length} ${ruPlural(x.names.length, 'токен объявлен, но не используется', 'токена объявлены, но не используются', 'токенов объявлены, но не используются')}`,
      what: `В ${x.files.join(', ')} объявлены токены, которых нет ни в одном правиле CSS: ${x.names.map((n) => `${c}${n}${c}`).join(', ')}. В каталог они не попали.`,
      why: 'Неиспользуемый токен выглядит как часть системы: его возьмут в новом экране, хотя ни один экран его не показывал и никто его не проверял.' };
    case 'pattern-diverges': return {
      title: `${x.name}: ${x.off.length} из ${x.total} собраны не по канону`,
      what: `Канон — ${x.canon} (так устроены ${x.canonCount} из ${x.total}). Отступают:\n\n${x.off.map((o) => `- ${c}${o.at}${c} — нет: ${o.missing.join(', ')}`).join('\n')}`,
      why: 'Одна и та же ситуация выглядит по-разному на разных экранах: человек не узнаёт её, а разработчик не знает, какую копию брать за образец.' };
    case 'pattern-twin': return {
      title: `${c}${x.decl}${c} сделан дважды`,
      what: `Компонент ${c}${x.decl}${c} описан в ${x.files.length} местах: ${x.files.map((ff) => `${c}${ff}${c}`).join(', ')}. Это экземпляры одной закономерности «${x.name}».`,
      why: 'Правку внесут в одну копию и забудут про другую.' };
    case 'pattern-bypass': return {
      title: `${x.off.length} ${ruPlural(x.off.length, 'окно', 'окна', 'окон')} без ${c}${x.base}${c}`,
      what: `${x.with} из ${x.total} окон собраны на ${c}${x.base}${c}, а эти — своей вёрсткой:\n\n${x.off.map((o) => `- ${c}${o}${c}`).join('\n')}`,
      why: 'У каждого такого окна своё затемнение, закрытие и поведение фокуса — их легко сделать по-разному и сломать доступность.' };
    case 'token-alias': return {
      title: `${x.pairs.length} ${ruPlural(x.pairs.length, 'значение названо', 'значения названы', 'значений названы')} несколькими именами`,
      what: `Одно и то же значение используется под разными именами. В каталоге осталось имя, которое встречается чаще (в скобках — сколько мест):\n\n| В каталоге | Другие имена | Значение |\n|---|---|---|\n${x.pairs.map((p) => `| ${c}${p.keep}${c} (${p.keepUses}) | ${p.drop.map((d) => `${c}${d.name}${c} (${d.uses})`).join(', ')} | ${c}${p.value}${c} |`).join('\n')}`,
      why: 'Два имени у одного цвета — две точки правки: поменяют один, второй останется старым, и экраны разойдутся.' };
    case 'type-local': return {
      title: `${x.total} ${ruPlural(x.total, 'стиль', 'стиля', 'стилей')} текста вне базы`,
      what: `В базе ${x.base} ${ruPlural(x.base, 'стиль', 'стиля', 'стилей')} текста, а страницы и фичи (${x.scopes.join(', ')}) задали своим CSS ещё ${x.total}: ${Object.entries(x.byFamily).map(([k, v]) => `${k} — ${v}`).join(', ')}. Из них ${x.near} почти совпадают со стилями базы (тот же шрифт, размер отличается не больше чем на 1px).\n\n| Стиль вне базы | Мест | Почти как в базе | Где впервые |\n|---|---|---|---|\n${f.rows.map((r) => `| ${r.name} | ${r.uses} | ${r.near || '—'} | ${c}${r.at}${c} |`).join('\n')}`,
      why: 'Каждый такой стиль появился без решения дизайнера. Пока их больше, чем стилей в шкале, новые экраны будут набираться на глаз.' };
    case 'missing-state': return {
      title: `${nm}: нет состояний ${x.missing.map((s) => `«${STATE_RU(s)}»`).join(', ')}`,
      what: `У компонента «${nm}» в CSS нет ${x.missing.map((s) => `«${STATE_RU(s)}»`).join(', ')}. Для компонента типа «${TYPES[x.type]?.name || x.type}» они обычно нужны.`,
      why: 'Если состояния нет в библиотеке, разработчик либо придумает его сам, либо будет его избегать — и интерфейс получит то, чего дизайнер не рисовал.' };
    default: return { title: `${nm}: ${f.subject}`, what: factLine(f), why: '' };
  }
}

const slugOf = (f) => `${f.rule}--${f.subject}`.toLowerCase().replace(/[^a-z0-9а-яё_-]+/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60).replace(/-$/, '');

// Where the report lives: next to the catalog, not in it.
export const issuesFile = (root, outDir, config) => (config.issuesFile ? path.resolve(root, config.issuesFile) : path.join(path.dirname(outDir), 'ui-issues.md'));

function writeReport(root, file, config, findings, lib, unitsById) {
  const dir = path.dirname(file);
  const rel = (f, line) => `[${f}${line ? ':' + line : ''}](${mdHref(relPosix(dir, path.join(root, f)))}${line ? '#L' + line : ''})`;
  const ordered = [...findings].sort((a, b) => b.weight - a.weight);
  const rows = [], body = [];
  ordered.forEach((f, i) => {
    const comp = lib.components.find((c) => c.id === f.component);
    const ctx = { name: comp?.data.name || (/^type-/.test(f.rule) ? 'Стили текста' : /^token-/.test(f.rule) ? 'Токены' : f.unit) };
    const p = plain(f, ctx);
    const unit = unitsById.get(f.unit);
    const subjectClasses = f.subject.split(/\s*≈\s*/);
    // Token findings carry their declarations: they belong to no unit.
    const rules = f.decl || (unit?.rules || []).filter((r) => subjectClasses.some((sc) => r.selector.includes(sc)));
    const where = [...new Map(rules.map((r) => [`${r.file}:${r.line}`, r])).values()].slice(0, 6);
    const anchor = `n${i + 1}`;
    rows.push(`| ${i + 1} | ${ctx.name} | [${p.title.replace(/^[^:]+:\s*/, '')}](#${anchor}) | ${'●'.repeat(f.severity)}${'○'.repeat(3 - f.severity)} |`);
    body.push(
      `<a id="${anchor}"></a>`, `## ${i + 1}. ${p.title}`, '',
      `**Компонент:** ${ctx.name} · **Важность:** ${'●'.repeat(f.severity)}${'○'.repeat(3 - f.severity)}`, '',
      p.what, '',
      ...(p.why ? [`**Почему это важно.** ${p.why}`, ''] : []),
      '**Где в коде:**', '',
      ...(where.length ? where.map((r) => `- ${rel(r.file, r.line)} — \`${r.selector}\``) : [`- ${unit?.defined[0] ? rel(unit.defined[0].file, unit.defined[0].line) : f.unit}`]),
      '', '**Что можно сделать:**', '',
      ...Object.values(RULES[f.rule].options).map((v) => `- ${v}`),
      '', '---', '',
    );
  });
  writeText(file, [
    `# Несостыковки — ${config.project}`, '',
    'Места, где код противоречит сам себе или правилам, которые держит любая дизайн-система. Найдены при сборке каталога компонентов (`ui-catalog`). Каталог описывает код как есть; здесь — что в нём стоит поправить.', '',
    `Всего: **${findings.length}**.`, '',
    '| № | Компонент | Несостыковка | Важность |', '|---|---|---|---|', ...rows, '', '---', '',
    ...body,
    '> Файл пересоздаётся при каждой сборке каталога.', '',
  ].join('\n'));
}

if (isMain(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(args.root || process.cwd());
  await runAudit(root, resolveOut(root, args), { quiet: !!args.quiet });
}
