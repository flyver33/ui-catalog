#!/usr/bin/env node
// ui-catalog task — the brief for a sub-agent, by what it writes: guidelines (html-css),
// atom specs (kit mode) or composites (--composites). By template: what to read, which
// files are its own, the steps, what check still reports for them, and what to answer.
// The main agent hands it over as it is.
//   node task.mjs <id>[,<id>...] [--root <project>] [--out <dir>]
//   node task.mjs --composites <id>[,<id>...]
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, relPosix, isMain, fail } from './lib/fsutil.mjs';
import { resolveOut } from './lib/config.mjs';
import { runCheck } from './check.mjs';
import { runScan } from './scan.mjs';
import { loadLibrary } from './lib/library.mjs';
import { isKitMode } from './lib/kit-run.mjs';
import { patternState, instancesOf } from './lib/pattern-run.mjs';
import { falseCases } from './lib/composites.mjs';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const p = (...x) => path.join(...x).replace(/\\/g, '/');
// The words a gap takes in «Когда не использовать» (gl.when-not).
const GAP = '«в библиотеке нет»';

// What check --only reports on the sub-agent's files now (it writes nothing: several run at once).
async function findings(root, outDir, ids) {
  const { errors, warnings } = await runCheck(root, outDir, { only: ids, silent: true });
  // Sealing is the main agent's: not part of the brief.
  const own = (id) => [
    ...errors.filter((e) => e.id === id && !/не запечатан|изменились после печати/.test(e.msg)).map((e) => `  - ошибка: ${e.msg.split('\n')[0]} [${e.rule}]`),
    ...warnings.filter((e) => e.id === id && !/не запечатан|изменились после печати|открытых вопросов/.test(e.msg)).map((e) => `  - предупреждение: ${e.msg.split('\n')[0]} [${e.rule}]`),
  ];
  return own;
}

export async function taskMd(root, outDir, ids, { composites = false } = {}) {
  const { inventory, config } = await runScan(root, outDir, { quiet: true, write: false });
  if (composites) return compositeTask(root, outDir, ids, inventory, config);
  if (isKitMode(config)) return atomTask(root, outDir, ids);
  return guidelineTask(root, outDir, ids);
}

// Guidelines of an html-css catalog.
async function guidelineTask(root, outDir, ids) {
  const lib = loadLibrary(outDir);
  const missing = ids.filter((id) => !lib.components.some((c) => c.id === id));
  if (missing.length) fail(`Нет таких компонентов: ${missing.join(', ')} — сначала node generate.mjs`);
  const own = await findings(root, outDir, ids);
  const rel = (f) => relPosix(root, f);
  const list = ids.join(',');
  const L = [];
  L.push(`# Задание: описать ${ids.length === 1 ? 'компонент' : 'компоненты'} ${ids.join(', ')}`, '');
  L.push(`Проект: \`${p(root)}\`. Ты дописываешь описания компонентов библиотеки ui-catalog — только файлы ниже. Код проекта, \`catalog.config.json\` и чужие описания не меняешь. Ничего не спрашиваешь: где код противоречит себе, описываешь как есть в «Подводных камнях».`, '');
  L.push('Правила (прочитай до начала):', '');
  L.push(`- \`${p(SKILL, 'references', 'guideline.md')}\` — описание \`<id>.md\``);
  L.push(`- \`${p(SKILL, 'references', 'examples.md')}\` — примеры \`examples/<id>.html\``);
  L.push(`- \`${p(SKILL, 'references', 'types.md')}\` — типы и названия`, '');
  L.push('У каждого правила id (`gl.name`, `ex.real-combo`); в конце каждой находки `check` стоит id правила, которое она нарушает.', '');
  L.push('Твои файлы:', '');
  for (const id of ids) {
    const c = lib.components.find((x) => x.id === id);
    L.push(`- **${id}** (классы: ${c.declared.join(', ')}): \`${rel(path.join(outDir, c.file))}\`, \`${rel(path.join(outDir, 'examples', `${id}.html`))}\``);
    L.push(...own(id));
  }
  L.push('');
  L.push('Порядок:', '');
  L.push(`1. Прочитай CSS классов (\`${rel(path.join(outDir, 'inventory.json'))}\` → units → rules) и каждое место из «Показательные места» вместе с 20–40 строками вокруг.`);
  L.push('2. Поставь `type` из types.md (gl.type); `name` — по эталону (gl.name).');
  L.push(`3. \`node ${p(SKILL, 'scripts', 'generate.mjs')} --root ${p(root)} --facts ${list}\` — разделы из кода и заготовки \`job\`/\`intents\` типа.`);
  L.push(`4. Допиши по guideline.md и examples.md: \`job\`, \`intents\`, «Когда использовать», «Когда не использовать» (пробел — ${GAP}), «Как собрать», «Подводные камни», колонку «Когда выбирать» в «Вариантах», в примерах — \`data-about\` и всё, что помечено TODO. Что пишут скрипты (gl.script-fields), руками не правь.`);
  L.push(`5. \`node ${p(SKILL, 'scripts', 'check.mjs')} --root ${p(root)} --only ${list}\` — повторяй 4–5, пока нет ошибок. Она ничего не записывает, её можно гонять одновременно с другими. Не запечатывай (\`--seal\` делает главный агент).`, '');
  L.push('Ответ: по строке на компонент — id, type, name, сколько ошибок `check --only` осталось (должно быть 0) и одно предложение, если что-то в коде показалось несостыковкой.');
  return L.join('\n') + '\n';
}

// Atom specs of a React kit: the prose only — the scripts write the rest, people answer questions.
async function atomTask(root, outDir, ids) {
  const lib = loadLibrary(outDir);
  const missing = ids.filter((id) => !lib.components.some((c) => c.id === id));
  if (missing.length) fail(`Нет таких атомов: ${missing.join(', ')} — сначала node generate.mjs`);
  const own = await findings(root, outDir, ids);
  const rel = (f) => relPosix(root, f);
  const L = [];
  L.push(`# Задание: дописать ${ids.length === 1 ? 'спеку атома' : 'спеки атомов'} ${ids.join(', ')}`, '');
  L.push(`Проект: \`${p(root)}\` (только чтение: код проекта не меняешь). Ты дописываешь спеки атомов React-кита в библиотеке ui-catalog — только файлы ниже. Не меняешь \`catalog.config.json\`, \`questions.md\` и чужие файлы; на вопросы о компонентах не отвечаешь — на них отвечают люди. Ничего не спрашиваешь.`, '');
  L.push('Правила (прочитай до начала):', '');
  L.push(`- \`${p(SKILL, 'references', 'atoms.md')}\` — спека атома (atom.sections, atom.no-invent)`);
  L.push(`- \`${p(SKILL, 'references', 'guideline.md')}\` — как писать \`job\`, \`intents\` и оба раздела «Когда…» (gl.job, gl.intents, gl.when-use, gl.when-not, gl.no-classes)`);
  L.push(`- \`${p(SKILL, 'references', 'types.md')}\` — типы и их черновики`, '');
  L.push('Твои файлы:', '');
  for (const id of ids) {
    const c = lib.components.find((x) => x.id === id);
    L.push(`- **${id}**: \`${rel(path.join(outDir, c.file))}\``);
    L.push(...own(id));
  }
  L.push('');
  L.push('Порядок:', '');
  L.push('1. Прочитай раздел «Что заменяет»: реализации с `file:line` и числом мест. Открой код реализаций и 3–6 мест использования, по 20–40 строк вокруг.');
  L.push('2. Во front matter: `job` — одна фраза с глагола в инфинитиве про задачу пользователя, без классов и имён компонентов; `intents` — 3–8 слов, каждое один раз, хотя бы одно из черновика типа.');
  L.push(`3. «Когда использовать» — 2–5 пунктов с ситуациями из мест в коде (один, если атом в одном файле). «Когда не использовать» — в каждом пункте, что взять вместо: ссылка на атом \`[Name](<id>.md)\`, на составное \`[Name](../composites/<id>.md)\`, нативный элемент в обратных кавычках или ${GAP}. Каждый атом похожего типа получает пункт со ссылкой.`);
  L.push('4. Остальные разделы — «API», «Варианты и состояния», «Токены», «Доступность», «Что заменяет», «Открытые вопросы» — пишут скрипты: не трогай их ни символом. Пропсов и значений не придумывай.');
  L.push(`5. \`node ${p(SKILL, 'scripts', 'check.mjs')} --root ${p(root)} --out ${p(outDir)} --only ${ids.join(',')}\` — повторяй 2–5, пока нет ошибок. Она ничего не записывает. Не запечатывай.`, '');
  L.push('Ответ: по строке на атом — id, сколько ошибок `check --only` осталось (должно быть 0) — и 2–5 пунктов о том, что в коде показалось несостыковкой.');
  return L.join('\n') + '\n';
}

// Composites: review of the candidates and the two sections; the config is the main agent's (pat.split).
function compositeTask(root, outDir, ids, inventory, config) {
  const state = patternState(inventory, config, outDir);
  const comps = ids.map((id) => state.composites.find((c) => c.id === id));
  const missing = ids.filter((id, i) => !comps[i]);
  if (missing.length) fail(`Нет таких составных: ${missing.join(', ')} — сначала node generate.mjs`);
  const rel = (f) => relPosix(root, f);
  const L = [];
  L.push(`# Задание: разобрать ${ids.length === 1 ? 'составное' : 'составные'} ${ids.join(', ')}`, '');
  L.push(`Проект: \`${p(root)}\` (только чтение: код проекта не меняешь). Ты разбираешь составные — паттерны, найденные в коде, — в библиотеке ui-catalog. Твои файлы — только те, что ниже. \`catalog.config.json\` и \`candidates.md\` не меняешь: отказы и переносы в чужие составные записывает главный агент по твоему ответу. Скрипты, кроме \`check --only\`, не запускаешь. Ничего не спрашиваешь.`, '');
  L.push('Правила (прочитай до начала):', '');
  L.push(`- \`${p(SKILL, 'references', 'composites.md')}\` — pat.judgement, pat.review, pat.reasons, pat.threshold, pat.slots, pat.sections`);
  L.push(`- \`${p(SKILL, 'references', 'composite-types.md')}\` — типы, их слоты и ложные срабатывания`);
  L.push(`- \`${p(SKILL, 'references', 'guideline.md')}\` — gl.when-use, gl.when-not, gl.no-classes`, '');
  L.push('Твои составные и их кандидаты:', '');
  for (const c of comps) {
    L.push(`## ${c.id} — \`${rel(path.join(outDir, c.file))}\``, '');
    L.push(`Ложные срабатывания типа: ${falseCases(c.data.type).map((x) => `«${x}»`).join(', ')}.`, '');
    for (const x of instancesOf(c, state, inventory)) L.push(`- \`${x.id || 'добавлено'}\` ${x.file}:${x.line}${x.decl ? ` \`${x.decl}\`` : ''} — ${(x.signals || []).join(', ')}`);
    L.push('');
  }
  L.push('Порядок:', '');
  L.push('1. Открой код каждого кандидата, 20–40 строк вокруг, и реши по смыслу: экземпляр этого паттерна или нет. У экземпляра есть все обязательные слоты типа.');
  L.push('2. Не экземпляр — убери id из `candidates:` и запиши в ответ отказ с причиной ровно из pat.reasons: «один экземпляр», «часть атома», «часть составного <id или тип>», «основа обёрток», «тот же экземпляр, что <id>», «ложное срабатывание: <случай>».');
  L.push('3. Экземпляр составного из твоего списка — перенеси между их `candidates:` сам; другого составного — убери из `candidates:` и запиши в ответ перенос.');
  L.push(`4. «Когда использовать» (2–5 пунктов из экземпляров; один, если все они в одном файле) и «Когда не использовать» (в каждом пункте — другое составное \`[Name](<id>.md)\`, атом \`[Name](../atoms/<id>.md)\`, нативный элемент или ${GAP}) — вместо строк с TODO. Остальные разделы пишет скрипт.`);
  L.push(`5. \`node ${p(SKILL, 'scripts', 'check.mjs')} --root ${p(root)} --out ${p(outDir)} --only ${ids.join(',')}\` — ничего не записывает; отказы, которых ещё нет в конфиге, она покажет как неразобранные — это нормально.`, '');
  L.push('Ответ — только JSON, потом 2–4 строки замечаний:', '');
  L.push('```json');
  L.push('{ "rejects": [{ "id": "c-…", "why": "…" }], "moves": [{ "id": "c-…", "to": "<id составного>" }], "tooFew": ["<id составного, где осталось меньше двух экземпляров>"] }');
  L.push('```');
  return L.join('\n') + '\n';
}

if (isMain(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(args.root || process.cwd());
  const composites = args.composites != null && args.composites !== false;
  const ids = [...(typeof args.composites === 'string' ? [args.composites] : []), ...args._].flatMap((x) => String(x).split(',')).filter(Boolean);
  if (!ids.length) fail('Укажи компоненты: node task.mjs <id>[,<id>...] или node task.mjs --composites <id>[,<id>...]');
  process.stdout.write(await taskMd(root, resolveOut(root, args), ids, { composites }));
}
