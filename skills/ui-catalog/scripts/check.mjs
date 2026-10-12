#!/usr/bin/env node
// ui-catalog check — is the library still true to the code, and does it follow the rules?
//   node check.mjs [--root <project>] [--out <dir>] [--strict] [--json]
//   node check.mjs --seal <id>[,<id>...]|all    record that a guideline matches current code
//   node check.mjs --only <id>[,<id>...]        findings for these components only (a sub-agent's share)
//   node check.mjs --report                     the report to the user, by template
// Exit 1 on errors (or on any warning with --strict). Every finding names its next step.
// The catalog is done when there are no errors; --seal refuses a component with errors.
// The catalog describes the code as it is: nothing here asks anyone anything.
// Note: check re-runs scan and audit, so it rewrites inventory.json and ../ui-issues.md.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, readText, readJson, writeText, relPosix, fromHref, isMain, walk, makeMatcher, sha1 } from './lib/fsutil.mjs';
import { resolveOut, detectReference, ignoreIds, ignoreMatcher, iconBaseOf } from './lib/config.mjs';
import { runScan } from './scan.mjs';
import { loadLibrary, componentHash, REQUIRED, FIELDS, SECTIONS, COMPONENTS_DIR } from './lib/library.mjs';
import { setFrontmatterKey } from './lib/frontmatter.mjs';
import { classAttributes } from './lib/html.mjs';
import { rootOf } from './adapters/html-css.mjs';
import { runAudit, issuesFile } from './audit.mjs';
import { SELFTEST_FILE } from './gallery-test.mjs';
import { checkRequest, loadLibrary as loadComposeLibrary } from '../../ui-compose/scripts/compose.mjs';
import { reportMd } from './lib/report.mjs';
import { TYPES } from './lib/types.mjs';
import { checkName } from './lib/naming.mjs';
import { classifyModifier, isDictionaryName, VARIANT_AXES, customAxis, expectedVariantName } from './lib/variants.mjs';
import { combosIn, comboKey, isRealCombo, usedModifiers, autoLabel, exampleContext, TEMPLATE_ATTRS, blankElement, hiddenAt, hiddenNarrow, customName } from './lib/examples.mjs';
import { notAtomic } from './generate.mjs';
import { unitsOf, splitModifiers, rootOfEntry, SPLIT_TYPES } from './lib/split.mjs';
import { factContext, factSections, whenCells, sectionText, normalize, FACT_SECTIONS } from './lib/facts.mjs';
import { proseProblems, counterpartProblems, classesInText } from './lib/prose.mjs';
import { isKitMode, atomHash } from './lib/kit-run.mjs';
import { kitChecks, patternChecks } from './lib/kit-check.mjs';
import { patternHash } from './lib/pattern-run.mjs';
import { SCAFFOLD_PROPS, scaffoldTail, scaffoldProblems } from './lib/scaffold.mjs';

const LATIN_NAME = /^[A-Z][A-Za-z0-9]*( [A-Za-z0-9]+)*$/;

// Text as a person reads it: entities decoded, whitespace collapsed (ex.content).
const ENTITIES = { nbsp: ' ', mdash: '—', ndash: '–', amp: '&', laquo: '«', raquo: '»', quot: '"', hellip: '…', lt: '<', gt: '>', apos: "'", '#39': "'", '#160': ' ' };
const plainText = (s) => String(s).replace(/&(#?\w+);/g, (m, k) => ENTITIES[k] ?? m).replace(/\s+/g, ' ').trim();
const textsOf = (html) => [...String(html).replace(/<!--[\s\S]*?-->/g, '').matchAll(/>([^<>]+)</g)].map((m) => plainText(m[1])).filter((t) => /[\p{L}\d]/u.test(t));
const CYRILLIC = /[а-яё]/i;
// Inline style is allowed only for laying out a page example: on wrappers, never on the component.
const LAYOUT_PROPS = /^(display|gap|row-gap|column-gap|flex(-[a-z]+)?|grid(-[a-z]+)?|align-[a-z]+|justify-[a-z]+|place-[a-z]+|max-width|width|margin(-[a-z]+)?|padding(-[a-z]+)?)$/;
const CSS_WORDS = /^(тень|фон|обёртка|обертка|контейнер|враппер|wrapper|container|блок|элемент|div|span)$/i;

export async function runCheck(root, outDir, { seal = null, strict = false, json = false, only = null, report = false, silent = false } = {}) {
  const { inventory, config } = await runScan(root, outDir, { quiet: true });
  const lib = loadLibrary(outDir);
  const unitsById = new Map(inventory.units.map((u) => [u.id, u]));
  const libraryClasses = new Set();
  for (const u of inventory.units.filter((x) => x.library)) {
    libraryClasses.add(u.id);
    Object.keys(u.modifiers).forEach((c) => libraryClasses.add(c));
    Object.keys(u.elements).forEach((c) => libraryClasses.add(c));
  }
  const known = new Set(libraryClasses);
  for (const u of inventory.units) { known.add(u.id); Object.keys(u.modifiers).forEach((c) => known.add(c)); Object.keys(u.elements).forEach((c) => known.add(c)); }

  const errors = [], warnings = [], info = [];
  // Every finding names the rule it enforces (references/): `rule` in --json, [rule] in text.
  const E = (rule, id, msg, fix) => errors.push({ id, msg, fix, rule });
  const W = (rule, id, msg, fix) => warnings.push({ id, msg, fix, rule });
  const I = (rule, id, msg, fix) => info.push({ id, msg, fix, rule });

  // Audit first: a focus the product does not show must not be pinned in the gallery.
  const audit = await runAudit(root, outDir, { quiet: true, scan: { inventory, config } });
  const focusLost = new Set(audit.findings.filter((f) => f.rule === 'focus-lost').map((f) => f.unit));
  const ignored = new Set([...ignoreIds(config), ...Object.keys(config.scaffold || {})]);

  // Kit mode (React): atoms/ holds specs of the kit, not guidelines (lib/kit-check.mjs).
  const kitMode = isKitMode(config);
  let kitState = null;
  if (kitMode) {
    const specs = lib.components;
    lib.components = [];
    const modShortKit = new Set([...known].filter((x) => x.includes('--') && !x.startsWith('--')).map((x) => '--' + x.split('--').slice(1).join('--')));
    kitState = { specs, ...kitChecks({ root, outDir, inventory, config, specs, E, W, I, known, modifiers: modShortKit }) };
    kitState.patterns = patternChecks({ root, outDir, inventory, config, E, W, I, known, modifiers: modShortKit });
  }

  // The project's markup and scripts outside the library, read once (ex.content).
  let corpus = null;
  const codeText = () => (corpus ??= plainText(walk(root, ignoreMatcher(root, config))
    .filter((f) => /\.(html?|vue|svelte|astro|php|njk|hbs|liquid|erb|twig|m?js|cjs|jsx|tsx?)$/i.test(f) && !path.join(root, f).startsWith(outDir + path.sep))
    .map((f) => readText(path.join(root, f), '')).join('\n')));

  // ── components ──────────────────────────────────────────────────────
  // Sections written from the code (lib/facts.mjs): what generate --facts would write now.
  const F = factContext({ unitsById, inventory, config, components: lib.components, findings: audit.findings, root, outDir });
  // `--primary` shorthand of every modifier: text for people names none of them.
  const modShort = new Set([...known].filter((x) => x.includes('--') && !x.startsWith('--')).map((x) => '--' + x.split('--').slice(1).join('--')));
  const owner = new Map();
  // Who owns each `units` entry: a root class (`gm-tag`) or a modifier cut from it (`gm-tag--blue`).
  const ownerOf = new Map(lib.components.flatMap((c) => c.declared.map((e) => [e, c.id])));
  for (const x of lib.stray) E('lib.layout', x.id, `описание ${x.file} лежит не в ${COMPONENTS_DIR}/ — его никто не читает`, `перенеси в ${COMPONENTS_DIR}/${x.file.split('/').pop()}`);
  for (const c of lib.components) {
    const d = c.data;
    const S = E; // the catalog is finished work: what it lacks is an error
    const units = unitsOf(c, unitsById);
    const isLibrary = units.length > 0 && units.every((u) => u.library);

    // Front matter.
    for (const k of REQUIRED) if (d[k] == null || d[k] === '' || (k === 'units' && !c.units.length)) E('gl.fields', c.id, `нет поля «${k}» во front matter`, `заполни ${k} в ${c.file}`);
    for (const [k, v] of Object.entries(d)) if (/\s{2,}#\s/.test(String(v))) E('gl.fields', c.id, `в поле ${k} комментарий: «${String(v).slice(0, 40)}…»`, 'во front matter комментариев нет — всё после значения входит в значение; убери');
    for (const k of Object.keys(d)) if (!FIELDS.includes(k)) E('gl.fields', c.id, `поля «${k}» нет в формате`, `поля описания: ${FIELDS.join(', ')} (references/guideline.md)`);
    if (c.id !== path.basename(c.file, '.md')) E('gl.fields', c.id, `id не совпадает с именем файла ${c.file}`, 'переименуй файл или поправь id');

    // Name: from the reference, in English (gl.name).
    const nm = checkName(d, config);
    if (d.name && !/TODO/.test(d.name) && (CYRILLIC.test(d.name) || !LATIN_NAME.test(d.name))) E('gl.name', c.id, `название «${d.name}» — не английское или не по образцу`, 'английское название из эталона (references/types.md), первое слово с заглавной: «Button», «Menu item»');
    if (!d.type) I('gl.name', c.id, `тип не указан, название «${d.name}» своё`, 'нормально, если ни один тип из references/types.md не подходит; иначе поставь type и возьми его название');
    else if (!nm.ok) E('gl.name', c.id, `название «${d.name}», а по эталону — ${nm.expected.map((e) => `«${e.name}» (${e.from})`).join(' или ')}`, 'название берётся из эталона, не придумывается (references/guideline.md → gl.name)');
    else if (!TYPES[d.type] && !/TODO/.test(d.type)) E('gl.type', c.id, `type: ${d.type} нет в справочнике`, 'возьми тип из references/types.md или добавь новый с обоснованием');
    if (nm.custom && nm.problem === 'not-english' && !/TODO/.test(d.name)) E('gl.name', c.id, `своё название «${d.name}» не на английском`, 'одно–три английских слова, первое с заглавной');

    // Job and intents (gl.job, gl.intents).
    if (d.job && !/TODO/.test(d.job) && (String(d.job).match(/[.!?](\s|$)/g) || []).length > 1) S('gl.job', c.id, 'job — больше одного предложения', 'одна фраза с глагола: какую задачу интерфейса решает');
    const intents = Array.isArray(d.intents) ? d.intents : [];
    if (intents.length < 3 || intents.length > 8) S('gl.intents', c.id, `intents: ${intents.length} — нужно 3–8`, 'слова, которыми человек описал бы задачу: глаголы задачи и то, что компонент показывает');

    // Units: a class family is one component, unless lib/split.mjs cuts a modifier off
    // (a clickable modifier of a static base: Chip from Tag) — checked after this loop.
    for (const e of c.declared) {
      const base = unitsById.get(rootOfEntry(e));
      if (!base) E('comp.units-exist', c.id, `юнит ${e} больше не найден в коде`, 'компонент удалён или переименован: обнови units');
      else if (e !== base.id && !base.modifiers[e]) E('comp.units-exist', c.id, `модификатора ${e} нет в CSS ${base.id}`, 'обнови units');
      if (owner.has(e)) E('comp.every-unit', c.id, `юнит ${e} уже описан в ${owner.get(e)}`, 'один юнит — один компонент');
      owner.set(e, c.id);
    }
    if (Array.isArray(d.styles) && d.styles.length && isLibrary) E('gl.styles', c.id, 'styles у компонента базы', 'styles подключают чужой CSS к кадрам — только для компонентов страниц и фич');

    // TODO and seal.
    const todo = c.todo + (c.examples?.todo || 0);
    if (c.todo) S('gl.no-todo', c.id, `в гайдлайне осталось TODO × ${c.todo}`, `допиши ${c.file}`);
    const hash = componentHash(c, unitsById);
    if (!d.sourceHash) E('gl.seal', c.id, 'описание не запечатано', `node check.mjs --seal ${c.id}, когда ошибок нет`);
    else if (d.sourceHash !== hash) W('gl.seal', c.id, 'код, гайдлайн или примеры изменились после печати', `сверь ${c.file} и examples с кодом, затем --seal ${c.id}`);

    // Sections (fixed set, gl.sections).
    const heads = [...c.body.matchAll(/^## (.+?)\s*$/gm)].map((m) => m[1]);
    for (const s of SECTIONS) if (!heads.includes(s)) S('gl.sections', c.id, `нет раздела «${s}»`, `разделы фиксированы: ${SECTIONS.join(' · ')}`);
    for (const h of heads) if (!SECTIONS.includes(h)) W('gl.sections', c.id, `раздел «${h}» не из набора`, `разделы фиксированы: ${SECTIONS.join(' · ')}`);
    {
      const { sections: facts, related, counterpart } = factSections(c, F, { when: whenCells(sectionText(c.body, 'Варианты')) });
      // counterpart from the code (lib/facts.mjs → counterpartOf); free only with a kit as the reference.
      const kit = ['kit', 'storybook'].includes(config.reference?.kind);
      const cpHave = d.counterpart ? String(d.counterpart).trim() : null;
      if (counterpart && cpHave !== counterpart) E('gl.script-fields', c.id, `counterpart: ${cpHave || '—'}, а в коде — ${counterpart}`, `его пишет скрипт из заголовка секции CSS: node generate.mjs --facts ${c.id}`);
      else if (!counterpart && cpHave && !kit) E('gl.script-fields', c.id, `counterpart «${cpHave}» — в коде такого имени нет`, 'без кита counterpart берётся только из заголовка секции CSS вида «Кнопки (g-btn)»; убери его или node generate.mjs --facts');
      // `related` is written from the code too: look-alikes, then neighbours in markup.
      const have = Array.isArray(d.related) ? d.related.map(String) : d.related ? [String(d.related)] : [];
      if (have.join(' ') !== related.join(' ')) E('gl.script-fields', c.id, `related: [${have.join(', ')}], а по коду — [${related.join(', ')}]`, `его пишет скрипт: node generate.mjs --facts ${c.id}`);
      for (const t of FACT_SECTIONS) if (heads.includes(t) && normalize(sectionText(c.body, t)) !== normalize(facts[t])) E('gl.script-fields', c.id, `раздел «${t}» не совпадает с кодом`, `его пишет скрипт: node generate.mjs --facts ${c.id} (колонку «Когда выбирать» сохранит)`);
    }
    const section = (t) => (new RegExp(`^## ${t}\\s*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm').exec(c.body) || [])[1] || '';
    const placesLinks = [...section('Показательные места').matchAll(/\]\(([^)\s#]+)#L(\d+)\)/g)];
    // Places to show: files whose markup has this component (not pages that include a partial).
    const minPlaces = Math.min(2, new Set(units.flatMap((u) => u.usages.filter((x) => x.kind !== 'include' && !x.part).map((x) => x.file))).size);
    if (heads.includes('Показательные места') && (placesLinks.length < minPlaces || placesLinks.length > 5)) S('gl.script-fields', c.id, `«Показательные места»: ссылок ${placesLinks.length} — нужно ${minPlaces}–5`, 'разные места: другой вид, другая страница, другой контекст');
    // Prose by template (lib/prose.mjs): job from a verb, intents with the type's words,
    // look-alikes named, no CSS classes in text for people.
    for (const p of proseProblems(c, { section: (t) => sectionText(c.body, t), known, modifiers: modShort, components: lib.components, lang: config.lang || 'ru', places: minPlaces })) S(p.rule, c.id, p.msg, p.fix);
    for (const p of counterpartProblems(d)) E(p.rule, c.id, p.msg, p.fix);

    // ── examples: only what the code has ──────────────────────────────
    if (!c.examples) S('ex.no-todo', c.id, 'нет examples/' + c.id + '.html — в галерее не будет состояний', `node generate.mjs ${c.units[0]} создаст черновик`);
    else {
      const ex = exampleContext(c, { unitsById, inventory, config, focusLost });
      const states = c.examples.states;
      if (!states.length) S('ex.no-todo', c.id, 'examples пуст', 'добавь хотя бы одно состояние из реальной разметки');
      if (c.examples.todo) S('ex.no-todo', c.id, `в examples осталось TODO × ${c.examples.todo}`, `заполни data-name / data-about в examples/${c.id}.html`);
      const shown = new Set(), pseudoShown = new Set(), seen = new Map();
      for (const st of states) {
        const name = st.authored || st.name || st.id;
        const said = new Set();
        const say = (rule, msg, fix) => { if (!said.has(msg)) { said.add(msg); E(rule, c.id, `пример «${name}»: ${msg}`, fix); } };
        for (const a of st.attrs.filter((x) => !TEMPLATE_ATTRS.includes(x))) say('ex.attrs', `атрибута ${a} нет в формате`, 'убери его — references/examples.md, таблица атрибутов');
        // Texts: of the code — whole, or the start of a long one ending in «…».
        for (const t of textsOf(st.html)) {
          const start = t.replace(/\s*…$/, '').trim();
          if (/lorem|ipsum/i.test(t) || !codeText().includes(start)) say('ex.content', `текст «${t.slice(0, 40)}» — не из кода`, 'текст реального места: целиком или его начало с «…»; не Lorem ipsum');
        }
        // Classes: only library classes (a frame loads only library CSS).
        const libUnitsHere = new Set();
        for (const a of classAttributes(st.html)) for (const cls of a.classes) {
          shown.add(cls);
          if (!libraryClasses.has(cls)) say('ex.lib-classes', `класс ${cls} не из библиотеки`, known.has(cls) ? 'класс страницы или фичи: в кадре его стилей нет, и в библиотеке его нет' : 'такого класса нет в CSS — опечатка или выдумка');
          else if (unitsById.get(rootOf(cls))?.library) libUnitsHere.add(rootOf(cls));
        }
        // Inline style: never on the component, only layout on a wrapper of a page example.
        for (const m of st.html.matchAll(/<([a-zA-Z][\w-]*)\b([^>]*?)\sstyle\s*=\s*"([^"]*)"/g)) {
          const onLibrary = /\sclass\s*=\s*"([^"]*)"/.exec(m[2] + ' ' + (st.html.slice(m.index).match(/^<[^>]*>/)?.[0] || ''))?.[1]?.split(/\s+/).some((x) => libraryClasses.has(x));
          const props = m[3].split(';').map((x) => x.split(':')[0].trim()).filter(Boolean);
          if (onLibrary) say('ex.no-style', `style="${m[3].slice(0, 40)}" на элементе компонента`, 'инлайн-стили меняют компонент — в галерее он должен выглядеть как в продукте');
          else if (props.some((p) => !LAYOUT_PROPS.test(p))) say('ex.no-style', `style на обёртке задаёт не раскладку: ${props.filter((p) => !LAYOUT_PROPS.test(p)).join(', ')}`, 'на обёртке можно только раскладку: display, gap, flex, grid, width, margin, padding');
        }
        // Combinations: real markup, same kind of element; retired classes are not shown.
        for (const el of combosIn(st.html, [...libUnitsHere])) {
          if (!isRealCombo(ex.real, el, ex.ignore)) {
            const keys = [...(ex.real.get(el.unit)?.keys() || [])];
            say('ex.real-combo', `${[el.unit, ...el.mods.filter((m) => !ex.ignore.has(m))].join(' ')}${el.tag ? ` на <${el.tag}>` : ''} в коде не встречается`, `показывай только сочетания из разметки: ${keys.map((k) => k || '(без модификаторов)').join(' · ') || 'нет ни одного'}`);
          }
        }
        for (const m of st.html.matchAll(/data-pseudo="([^"]+)"/g)) for (const p of m[1].split(/\s+/)) {
          pseudoShown.add(p);
          if (!ex.hasPseudo(p)) say('ex.real-pseudo', focusLost.size && /^focus/.test(p) && units.some((u) => focusLost.has(u.id)) ? `:${p} — в продукте фокуса нет (focus-lost)` : `:${p} в CSS компонента нет`, 'закреплять можно только состояние, которое продукт показывает');
        }
        // data-note: a page example must come from that line, with those classes.
        if (st.note) {
          const nm2 = /^([^:]+):(\d+)$/.exec(st.note);
          const lines = nm2 && readText(path.join(root, nm2[1]))?.split(/\r?\n/);
          const line = lines?.[Number(nm2?.[2]) - 1] || '';
          if (!nm2 || !lines) say('ex.note', `data-note «${st.note}» — нет такого файла`, 'путь:строка от корня проекта');
          else if (!c.units.some((u) => new RegExp(`(^|[\\s"'])${u}([\\s"'-]|$)`).test(line))) say('ex.note', `data-note ${st.note}: на этой строке нет ${c.units.join(', ')}`, 'обнови номер строки');
          else for (const el of combosIn(st.html, c.units)) {
            const inFile = (unitsById.get(el.unit)?.usages || []).some((x) => x.file === nm2[1] && Math.abs(x.line - Number(nm2[2])) <= 40 && comboKey((x.classes || []).filter((k) => k.startsWith(el.unit + '--')), ex.ignore) === comboKey(el.mods, ex.ignore));
            if (!inFile) say('ex.note', `${[el.unit, ...el.mods].join(' ')} рядом с ${st.note} нет — пример не совпадает со страницей`, 'пример со страницы показывает ровно те классы, что на странице');
          }
        }
        // A component cut by a modifier: its examples have it; the base's examples do not.
        const first = !st.note && combosIn(st.html, c.units)[0];
        const sl = first && c.slice?.[first.unit];
        const foreign = sl?.except?.filter((m) => first.mods.includes(m)) || [];
        if (foreign.length) say('comp.split', `${foreign.join(' ')} — это отдельный компонент ${ownerOf.get(foreign[0])}`, `покажи его в examples/${ownerOf.get(foreign[0])}.html; здесь — только ${c.declared.join(', ')}`);
        if (sl?.only && !sl.only.some((m) => first.mods.includes(m))) say('comp.split', `нет ${sl.only.join(' / ')} — без него это ${ownerOf.get(first.unit) || first.unit}`, `каждый пример ${c.id} начинается с ${first.unit} ${sl.only[0]}`);
        // A frame that renders nothing (the icon set lives on «Иконки», not in frames).
        if (!st.note && !c.units.includes(iconBaseOf(config, inventory))) {
          const blank = blankElement(st.html, ex.libraryUnits);
          if (blank) say('ex.not-blank', `кадр будет пустым: <${blank.tag} class="${blank.classes.join(' ')}"> без содержимого, а CSS не даёт ему размера`, 'покажи его как в продукте: с содержимым из реальной разметки или примером со страницы (data-note), где размер задаёт окружение');
          const hidden = hiddenAt(st.html, ex.libraryUnits, st.width);
          if (hidden) say('ex.not-blank', `кадр будет пустым: на ширине ${st.width} px CSS прячет <${hidden.tag} class="${hidden.classes.join(' ')}"> (${hidden.media} → display: none)`, 'убери кадр: на этой ширине компонента в продукте нет');
          const narrow = (!st.width || st.width === 'fill') && hiddenNarrow(st.html, ex.libraryUnits);
          if (narrow) say('ex.not-blank', `кадр по ширине ячейки будет пустым: CSS прячет <${narrow.tag} class="${narrow.classes.join(' ')}"> при ширине ≤ ${narrow.max} px`, 'data-width="wide": компонент есть только на широком экране');
        }
        // Captions: build makes them; a state must differ from its live example.
        if (!st.preview) {
          const auto = autoLabel(st, ex.labelCtx(st));
          if (st.authored && auto) say('ex.caption', `подпись собирается сама — «${auto}»`, 'убери data-label; он нужен только для состояний содержимого («With form») и примеров со страницы');
          if (!auto && !st.authored && !st.note) say('ex.state-differs', 'состояние не отличается от живого примера', 'убери его или подпиши состояние содержимого (data-label, «With form»)');
          if (st.authored && !st.note && (CYRILLIC.test(st.authored) || !LATIN_NAME.test(st.authored))) say('ex.caption', `подпись «${st.authored}» — не английская`, 'состояние содержимого — по-английски: «With form», «Leading icon»');
          const own = combosIn(st.html, c.units)[0];
          const pv = ex.previewOf(st);
          const pvCls = pv?.cls;
          const extra = own?.mods.filter((m) => m !== pvCls && VARIANT_AXES.includes(classifyModifier(m)?.axis)) || [];
          if (pv && extra.length && !st.note) say('ex.state-differs', `${extra.join(' ')} — это другой вид, а не состояние «${pv.name || pv.variant}»`, 'у каждого вида свой живой пример (data-preview)');
        }
        const key = `${st.variant || ''}|${st.width || ''}|${st.html.replace(/\s+/g, ' ')}`;
        if (seen.has(key)) say('ex.state-differs', `повторяет «${seen.get(key)}»`, 'одна мысль — одно состояние; убери дубль');
        else seen.set(key, name);
      }

      // Every modifier the markup uses is shown (glyphs are on the icons page).
      for (const u of units) {
        const used = usedModifiers(u);
        for (const mod of Object.keys(u.modifiers)) {
          if (ex.ignore.has(mod)) continue;
          if (used.has(mod) && !shown.has(mod)) S('ex.coverage', c.id, `нет примера для ${mod}`, `добавь <template> в examples/${c.id}.html — сочетание из реальной разметки`);
        }
        for (const p of u.pseudo) if (['hover', 'active', 'focus-visible'].includes(p) && !pseudoShown.has(p) && ex.hasPseudo(p)) W('ex.coverage', c.id, `в CSS есть :${p}, в примерах не показан`, `data-pseudo="${p}" на состоянии каждого вида`);
      }
      // The global focus ring on an interactive element or part that keeps its focus.
      const globalFocus = (inventory.globalRules || []).some((r) => /:focus-visible/.test(r.selector));
      const interactive = units.some((u) => u.usages.some((x) => (x.kind === 'markup' || (x.kind === 'script' && x.tag)) && String(x.interactive) !== 'false'));
      if (globalFocus && interactive && !units.some((u) => focusLost.has(u.id) || u.pseudo.includes('focus-visible')) && !pseudoShown.has('focus-visible')) W('ex.coverage', c.id, 'общая обводка :focus-visible в примерах не показана', 'data-pseudo="focus-visible" на интерактивном элементе или части');

      // Variants: a live example each, named from the dictionary.
      const previews = states.filter((s) => s.preview);
      const ids = previews.map((s) => s.variant || s.id);
      for (const id of new Set(ids.filter((x, i) => ids.indexOf(x) !== i))) E('ex.variant', c.id, `вид «${id}» объявлен дважды (data-preview)`, 'у каждого вида один живой пример');
      for (const s of states.filter((s) => !s.preview && s.variant && !ids.includes(s.variant))) E('ex.variant', c.id, `состояние «${s.label}» ссылается на вид «${s.variant}», у которого нет data-preview`, 'добавь живой пример вида или убери data-variant');
      for (const p of previews) {
        const label = p.variant || p.id;
        if (/data-pseudo=/.test(p.html)) E('ex.variant', c.id, `живой пример «${label}» с data-pseudo`, 'живой пример — без закреплённых состояний, их место во вкладке «Состояния»');
        if (previews.length < 2) continue;
        const pvMods = combosIn(p.html, c.units)[0]?.mods || [];
        if (!p.name) E('ex.variant', c.id, `у вида «${label}» нет data-name`, 'название из словаря видов: Primary, Secondary, Tertiary, Danger… (lib/variants.mjs)');
        // The base kind (no variant modifier on its live example) has nothing to put in data-class.
        const isBase = !pvMods.some((m) => VARIANT_AXES.includes(classifyModifier(m)?.axis) || (!classifyModifier(m) && customAxis(m, unitsById.get(rootOf(m))) === 'variant'));
        if (!p.cls && !isBase) E('ex.variant', c.id, `у вида «${label}» нет data-class`, 'модификатор, который делает этот вид');
        else if (p.cls && !pvMods.includes(p.cls)) E('ex.variant', c.id, `data-class="${p.cls}" нет в разметке живого примера «${label}»`, 'data-class — модификатор с живого примера этого вида');
        if (!p.about) E('ex.variant', c.id, `у вида «${label}» нет data-about`, 'одна фраза: когда выбирать этот вид');
        else if (/навед|hover|клик|нажат|фокус|реагир/i.test(p.about)) W('ex.about', c.id, `data-about «${label}» объясняет вид через взаимодействие`, 'вид отличается видом в покое; hover, клик, фокус — это состояния (references/examples.md → ex.about)');
        if (p.cls && p.name) {
          const realKeys = [...(ex.real.get(rootOf(p.cls))?.keys() || [])];
          const expected = expectedVariantName(p.cls, realKeys);
          if (expected && !p.name.toLowerCase().split(' ').includes(expected.toLowerCase())) E('ex.variant-name', c.id, `вид ${p.cls} назван «${p.name}», по словарю — «${expected}»`, `data-name="${expected}"`);
          else if (!expected) {
            const u = unitsById.get(rootOf(p.cls));
            if (u && customAxis(p.cls, u) === 'state') E('ex.variant-name', c.id, `${p.cls} меняет только размер или раскладку — это состояние, а не вид`, 'виды отличаются видом в покое (цвет, фон, рамка); размер и ширина — состояния вида');
            if (/TODO/.test(p.name)) { /* counted as TODO */ }
            else if (CYRILLIC.test(p.name) || !LATIN_NAME.test(p.name)) E('ex.variant-name', c.id, `вид «${p.name}» — не английское название`, 'одно–два английских слова, первое с заглавной');
            // A custom variant is named from its class, as the code names it (2026-10-05:
            // one run said «Inherit», the other «Tonal» for gm-btn--inherit).
            else if (p.name.toLowerCase() !== customName(p.cls).toLowerCase()) E('ex.variant-name', c.id, `вид ${p.cls} назван «${p.name}», из кода — «${customName(p.cls)}»`, `data-name="${customName(p.cls)}": особый вид называется словом своего класса`);
            else if (!isDictionaryName(p.name)) I('ex.variant-name', c.id, `вид «${p.name}» — название из класса, в словаре его нет`, 'нормально для особого вида');
          }
        }
        // The live example is the combination the code uses most for this variant.
        if (p.cls) {
          const u = unitsById.get(rootOf(p.cls));
          const counts = new Map();
          for (const x of u?.usages || []) if (!x.part && (x.kind === 'markup' || x.tag) && x.classes.includes(p.cls)) { const k = comboKey(x.classes.filter((m) => m.startsWith(u.id + '--')), ex.ignore); counts.set(k, (counts.get(k) || 0) + 1); }
          const top = [...counts].sort((a, b) => b[1] - a[1])[0];
          if (top && comboKey(pvMods, ex.ignore) !== top[0] && (counts.get(comboKey(pvMods, ex.ignore)) || 0) < top[1]) W('ex.most-common', c.id, `живой пример «${label}» — не самое частое сочетание`, `чаще всего в коде: ${u.id} ${top[0]} (${top[1]})`);
        }
      }
    }

    // Links to code must still point at a line that uses the component.
    for (const m of c.body.matchAll(/\]\(([^)\s#]+)#L(\d+)\)/g)) {
      const target = path.resolve(path.dirname(path.join(outDir, c.file)), fromHref(m[1]));
      const rel = relPosix(root, target);
      const lines = readText(target)?.split(/\r?\n/);
      if (!lines) { W('gl.links', c.id, `ссылка на несуществующий файл ${rel}`, 'обнови «Показательные места»'); continue; }
      const line = lines[Number(m[2]) - 1] || '';
      // Its class, a modifier, or a class of its part (`gm-nav__link--active` set by a script).
      const classes = new Set(c.units.flatMap((u) => [u, ...Object.keys(unitsById.get(u)?.modifiers || {})]));
      const words = line.match(/-?[_a-zA-Z][\w-]*/g) || [];
      if (!words.some((w) => classes.has(w) || (w.includes('__') && c.units.includes(w.split('__')[0]))) && !/data-include/.test(line)) W('gl.links', c.id, `${rel}:${m[2]} больше не про этот компонент (строка съехала)`, 'обнови номер строки');
    }

    for (const u of units) {
      const byFile = new Map();
      for (const o of u.overrides) byFile.set(o.scope, (byFile.get(o.scope) || 0) + 1);
      for (const [scope, n] of byFile) I('lib.signals', c.id, `${scope} перекрывает ${u.id} (${n} правил)`, 'если так делают часто — это кандидат на вариант');
      if (u.overrideClasses?.length) W('lib.signals', c.id, `вне базы появились классы ${u.overrideClasses.join(', ')}`, 'фича перекрашивает класс базы — это запрос дизайнеру, а не новый вид (ui-compose)');
    }
  }

  // ── split: a clickable modifier of a static base is its own component ──
  // Decided by lib/split.mjs from the code, both ways: what must be cut off is cut off,
  // and nothing else is.
  const compById = new Map(lib.components.map((c) => [c.id, c]));
  for (const u of inventory.units.filter((x) => x.library && owner.has(x.id))) {
    const want = splitModifiers(u);
    const base = owner.get(u.id);
    const cut = Object.keys(u.modifiers).filter((m) => owner.has(m));
    for (const m of want.filter((x) => !owner.has(x))) {
      const tags = Object.keys(u.modifierElements?.[m]?.tags || {}).map((t) => `<${t}>`).join(', ');
      E('comp.split', base, `${m} — отдельный компонент: стоит только на кликабельных (${tags}), а ${u.id} без него — на статичных`, `node generate.mjs ${m} вынесет его в свой компонент${SPLIT_TYPES[compById.get(base)?.data.type] ? ` (type: ${SPLIT_TYPES[compById.get(base).data.type]})` : ''}; убери ${m} из описания и примеров ${base}`);
    }
    for (const m of cut.filter((x) => !want.includes(x))) E('comp.split', owner.get(m), `${m} выделен в отдельный компонент, а по коду это вид ${u.id}`, `выделяется только модификатор, который стоит лишь на кликабельных элементах при статичной базе (lib/split.mjs); верни ${m} в ${base}`);
    const baseType = compById.get(base)?.data.type;
    for (const id of new Set(cut.map((m) => owner.get(m)))) {
      const t = compById.get(id)?.data.type;
      if (SPLIT_TYPES[baseType] && t !== SPLIT_TYPES[baseType]) E('comp.split-type', id, `type: ${t || '—'}, а кликабельная пара типа ${baseType} — ${SPLIT_TYPES[baseType]}`, `поставь type: ${SPLIT_TYPES[baseType]} и название из эталона (references/types.md)`);
    }
  }

  // ── project config ──────────────────────────────────────────────────
  const libraryIds = new Set(inventory.units.filter((u) => u.library).map((u) => u.id));
  for (const u of inventory.units) {
    if (owner.has(u.id) && config.scaffold?.[u.id]) W('comp.every-unit', u.id, 'юнит и в scaffold, и в компоненте', 'что-то одно: атом — компонент, блок — scaffold');
    const layoutAndBackground = (u.rules || []).flatMap((r) => r.decls || []).every((x) => SCAFFOLD_PROPS.test(x.prop));
    if (u.library && config.scaffold?.[u.id] && !notAtomic(u, libraryIds, iconBaseOf(config, inventory)) && !layoutAndBackground) W('comp.atoms', u.id, 'в scaffold, но не похож на блок или каркас', 'scaffold — блок из других компонентов или чистая раскладка; атом — компонент');
    // The line by template (lib/scaffold.mjs): a label, then what the code says it is.
    if (config.scaffold?.[u.id]) for (const p of scaffoldProblems(config.scaffold[u.id], scaffoldTail(u, { members: F.members, partials: inventory.partials, read: (p) => readText(path.join(root, p)), isShowcase: makeMatcher(config.showcase || []) }), (t) => classesInText(t, known, modShort))) E(p.rule, u.id, `scaffold: ${p.msg}`, p.fix);
    if (!u.library || owner.has(u.id) || ignored.has(u.id)) continue;
    if (!kitMode) W('comp.every-unit', u.id, `юнит базы без гайдлайна (${u.defined[0]?.file})`, `атом — node generate.mjs ${u.id}; составной блок или каркас — в scaffold с одной строкой`);
  }
  for (const x of config.ignoreUnits || []) if (typeof x === 'string' || !x?.why) W('cfg.ignore-why', typeof x === 'string' ? x : x?.id || 'ignoreUnits', 'ignoreUnits без причины', 'запиши { "id": "…", "why": "почему его нет в библиотеке" }');
  for (const [k, v] of Object.entries({ ...(config.scaffold || {}), ...(config.labels || {}) })) if (/\bTODO\b/.test(String(v))) E((config.scaffold || {})[k] !== undefined ? 'cfg.scaffold' : 'cfg.labels', k, `в catalog.config.json осталось TODO: «${String(v).slice(0, 60)}»`, 'допиши строку — она попадёт в CATALOG.md и в таблицы');
  for (const [k, v] of Object.entries(config.labels || {})) {
    const words = String(v).replace(/«[^»]*»/g, 'Q').trim().split(/\s+/);
    if (words.length > 4 || /\.|__|--/.test(v) || (words.length === 1 && CSS_WORDS.test(words[0]))) W('cfg.labels', k, `подпись «${v}» не по образцу`, '1–4 слова, что видит человек: «плашка сниппета»; не класс и не слово из CSS');
  }

  // Config: only keys of the format (cfg.keys).
  const CONFIG_KEYS = ['$comment', 'adapter', 'project', 'styles', 'tokens', 'icons', 'scopes', 'showcase', 'exclude', 'ignoreUnits', 'scaffold', 'labels', 'reference', 'issuesFile', 'brand', 'classPrefix', 'editor', 'frame', 'lang', 'typography', 'messages', 'rejectPatterns'];
  for (const k of Object.keys(config).filter((x) => !x.startsWith('__'))) if (!CONFIG_KEYS.includes(k)) E('cfg.keys', 'config', `в catalog.config.json поле «${k}», которого нет в формате`, 'убери его');
  for (const k of Object.keys(config.reference || {})) if (!['kind', 'name', 'source', 'lang'].includes(k)) E('cfg.reference', 'config', `reference.${k} — такого поля нет`, 'reference: kind, name, source, lang');
  for (const f of ['decisions.json', 'audit.json', 'issues']) if (fs.existsSync(path.join(outDir, f))) W('cfg.keys', 'library', `в каталоге лежит ${f} — его больше нет в формате`, 'несостыковки теперь в ../ui-issues.md; файл можно удалить');

  // The reference decides component names (scan detects it: kit → platform → types.md).
  if (!config.reference) {
    const guess = detectReference(root, { readJson, exists: fs.existsSync, path });
    E('cfg.reference', 'reference', 'эталон не записан — названиям компонентов не с чем сверяться', `запиши в catalog.config.json → reference: ${JSON.stringify(guess)}`);
  }

  // Page and feature elements are named from the code (lib/describe.mjs): nobody is asked
  // for labels. The ones the user writes keep the format checked above.

  // ── requests and ui-compose placeholders ────────────────────────────
  // One open request per gap: the second feature joins the first.
  const askedBy = new Map();
  for (const r of [...lib.requests].sort((a, b) => String(a.data.date || '').localeCompare(String(b.data.date || '')) || a.file.localeCompare(b.file))) {
    if (r.data.status === 'closed') continue;
    for (const n of r.data.needs || []) {
      const first = askedBy.get(n);
      if (first) E('gap.one-request', r.id, `${n} уже запрошен в ${first.file}`, `добавь эту фичу в «Где появится» запроса ${first.file} и убери ${n} отсюда`);
      else askedBy.set(n, r);
    }
  }
  for (const r of lib.requests) {
    if (r.data.status === 'closed') continue;
    for (const n of r.data.needs || []) {
      if (lib.components.some((c) => c.id === n)) I('gap.done', r.id, `запрос ждёт ${n}, а такой компонент уже есть`, `проверь и закрой ${r.file} (status: closed)`);
      else if (known.has(n)) I('gap.done', r.id, `запрос ждёт ${n}, а такой класс уже есть в CSS`, `ui-catalog add/refresh: опиши его в гайдлайне, затем закрой ${r.file}`);
    }
  }
  // A gap report by template, its verdicts agreeing with the library (ui-compose/scripts/compose.mjs).
  if (fs.existsSync(path.join(outDir, 'components.json'))) {
    const L = loadComposeLibrary(outDir);
    for (const r of lib.requests) for (const p of checkRequest(path.join(outDir, r.file), L)) E(p.rule, r.id, `запрос: ${p.msg}`, p.fix);
  }
  // Placeholders in code: `ui-compose: временно, ждёт <need> — requests/<file>.md`.
  const byFile = new Map(lib.requests.map((r) => [path.basename(r.file), r]));
  {
    const isIgnored = ignoreMatcher(root, config);
    for (const file of walk(root, isIgnored).filter((f) => /\.(html?|m?js|jsx|tsx?|vue|svelte|css)$/.test(f))) {
      const src = readText(path.join(root, file), '');
      if (!src.includes('ui-compose: временно')) continue;
      for (const [, need, where, name] of src.matchAll(/ui-compose: временно(?:, ждёт ([\w.-]+))?[^\n]*?([^\s'"`<>]*requests\/([\w.-]+\.md))/g)) {
        const m = [null, need, name];
        const r = byFile.get(m[2]);
        // The path from the project root leads to the request, wherever the library lives.
        const want = relPosix(root, path.join(outDir, 'requests', name));
        if (r && path.resolve(root, where) !== path.resolve(root, want)) W('gap.placeholder', file, `заглушка ui-compose: путь ${where} не ведёт к запросу`, `путь от корня проекта: ${want}`);
        if (!r) W('gap.placeholder', file, `заглушка ui-compose ссылается на запрос ${m[2]}, которого нет`, 'запрос пишет ui-compose: requests/<feature>.md по references/gap-report.md');
        else if (r.data.status === 'closed') W('gap.placeholder', file, `заглушка ui-compose ждёт закрытый запрос ${m[2]}`, 'компонент готов — замени заглушку на него');
        else if (m[1] && !(r.data.needs || []).includes(m[1])) W('gap.placeholder', file, `заглушка ждёт ${m[1]}, а в needs запроса ${m[2]} его нет`, `needs: ${(r.data.needs || []).join(', ')}`);
      }
    }
  }

  if (!fs.existsSync(path.join(outDir, 'components.json'))) W('lib.signals', 'library', 'библиотека не собрана', 'node build.mjs');

  // Несостыковки: a report next to the catalog, nobody is asked.
  if (audit.findings.length) I('lib.signals', 'audit', `несостыковок в коде: ${audit.findings.length}`, 'отчёт пересоздан рядом с каталогом (ui-issues.md) — назови его в итоге пользователю');

  // ── the gallery's selftest: run on this build, and what it found ────
  {
    const dataJs = readText(path.join(outDir, 'gallery', 'data.js'));
    if (dataJs != null) {
      const run = readJson(path.join(outDir, 'gallery', SELFTEST_FILE));
      if (!run || run.data !== sha1(dataJs)) W('gal.selftest-seen', 'gallery', run ? 'галерею не проверяли после последней сборки' : 'галерею не проверяли', 'node scripts/gallery-test.mjs (без браузера на машине — gallery/index.html?selftest в своём)');
      else for (const f of run.failed || []) E('gal.selftest-seen', 'gallery', `${f.id} ${f.where} — ${f.msg}`, 'пример — исправь его; сама галерея — в отчёт пользователю');
    }
  }

  // ── seal ────────────────────────────────────────────────────────────
  // A seal says «this guideline matches the code». It is refused while the component has
  // errors or TODO: you cannot vouch for what check says is wrong.
  if (seal && kitMode) {
    // kit.open: a spec with open questions is not sealed.
    // A spec is sealed only without errors, TODO and open questions.
    const ids = seal === 'all' ? [...kitState.specs.map((c) => c.id), ...(kitState.patterns?.all || []).map((x) => x.comp.id)] : String(seal).split(',').map((x) => x.trim());
    let refused = 0;
    for (const id of ids) {
      const c = kitState.specs.find((x) => x.id === id);
      const a = kitState.byId.get(id);
      // A composite is sealed the same way: no errors, then the hash of it and its instances.
      const pat = !c && kitState.patterns?.all.find((x) => x.comp.id === id);
      if (pat) {
        const own = errors.filter((e) => e.id === id);
        if (own.length) {
          refused++;
          console.log(`  не запечатан ${id}: ошибок ${own.length}`);
          for (const e of own) console.log(`    ${e.msg} [${e.rule}]\n      → ${e.fix}`);
          continue;
        }
        const file = path.join(outDir, pat.comp.file);
        writeText(file, setFrontmatterKey(readText(file), 'sourceHash', patternHash(readText(file), pat.instances)));
        console.log(`  запечатан ${id}`);
        continue;
      }
      if (!c || !a) { console.error(`  нет спеки атома или составного ${id}`); refused++; continue; }
      const own = errors.filter((e) => e.id === id);
      const open = a.questions.filter((q) => q.status !== 'answered').length;
      if (own.length || open) {
        refused++;
        console.log(`  не запечатан ${id}: ${[own.length ? `ошибок ${own.length}` : '', open ? `открытых вопросов ${open}` : ''].filter(Boolean).join(', ')}`);
        for (const e of own) console.log(`    ${e.msg} [${e.rule}]\n      → ${e.fix}`);
        continue;
      }
      const file = path.join(outDir, c.file);
      writeText(file, setFrontmatterKey(readText(file), 'sourceHash', atomHash(readText(file), a)));
      console.log(`  запечатан ${id}`);
    }
    if (refused) process.exitCode = 1;
    return { errors, warnings, info };
  }
  if (seal) {
    const ids = seal === 'all' ? lib.components.map((c) => c.id) : String(seal).split(',').map((s) => s.trim());
    let refused = 0;
    for (const id of ids) {
      const c = lib.components.find((x) => x.id === id);
      if (!c) { console.error(`  нет компонента ${id}`); refused++; continue; }
      const own = errors.filter((e) => e.id === id && !/не запечатан|изменились после печати/.test(e.msg));
      const todo = c.todo + (c.examples?.todo || 0);
      if (own.length || todo) {
        refused++;
        console.log(`  не запечатан ${id}: ${own.length ? `ошибок ${own.length}` : ''}${own.length && todo ? ', ' : ''}${todo ? `TODO × ${todo}` : ''}`);
        for (const e of own) console.log(`    ${e.msg} [${e.rule}]\n      → ${e.fix}`);
        continue;
      }
      const file = path.join(outDir, c.file);
      writeText(file, setFrontmatterKey(readText(file), 'sourceHash', componentHash(c, unitsById)));
      console.log(`  запечатан ${id}`);
    }
    if (refused) process.exitCode = 1;
    return { errors, warnings, info };
  }

  // --only <ids>: what a sub-agent sees for its components (and their units).
  if (only) {
    const keep = new Set(only.flatMap((id) => [id, ...(lib.components.find((c) => c.id === id)?.declared || [])]));
    for (const list of [errors, warnings, info]) list.splice(0, list.length, ...list.filter((x) => keep.has(x.id)));
  }
  // --report: the report to the user, by template (lib/report.mjs).
  if (report) {
    console.log(reportMd({ root, outDir, config, lib, inventory, errors, warnings, findings: audit.findings, issuesFile: issuesFile(root, outDir, config), kit: kitMode ? kitState : null }));
    if (errors.length) process.exitCode = 1;
    return { errors, warnings, info };
  }
  const pending = warnings;
  if (silent) return { errors, warnings, info };
  if (json) console.log(JSON.stringify({ errors, warnings, info }, null, 2));
  else {
    const show = (title, list) => {
      if (!list.length) return;
      console.log(`\n${title} (${list.length})`);
      for (const x of list) console.log(`  ${x.id}: ${x.msg} [${x.rule}]\n    → ${x.fix}`);
    };
    console.log(kitMode ? `ui-catalog check (кит): ${kitState.specs.length} спек атомов` : `ui-catalog check: ${lib.components.length} компонентов`);
    show('Ошибки', errors);
    show('Предупреждения', pending);
    show('К сведению', info);
    if (!errors.length && !pending.length) console.log('  всё сходится');
  }
  if (errors.length || (strict && pending.length)) process.exitCode = 1;
  return { errors, warnings, info };
}

if (isMain(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(args.root || process.cwd());
  await runCheck(root, resolveOut(root, args), { seal: args.seal || null, strict: !!args.strict, json: !!args.json, only: typeof args.only === 'string' ? args.only.split(',') : null, report: !!args.report });
}
