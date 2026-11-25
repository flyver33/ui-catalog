#!/usr/bin/env node
// ui-catalog task — the brief for a sub-agent, by what it writes: guidelines (html-css),
// atom specs (kit mode) or composites (--composites). By template: what to read, which
// files are its own, the steps, what check still reports for them, and what to answer.
// The main agent hands it over as it is.
//   node task.mjs <id>[,<id>...] [--root <project>] [--out <dir>]
//   node task.mjs --composites <id>[,<id>...]
//   node task.mjs --intro                       the introduction to the project, for the person
//   node task.mjs --plan                        the plan: steps, state, where a person is needed
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, relPosix, isMain, fail, readText } from './lib/fsutil.mjs';
import { resolveOut } from './lib/config.mjs';
import { runCheck } from './check.mjs';
import { runScan } from './scan.mjs';
import { loadLibrary } from './lib/library.mjs';
import { isKitMode, kitOf } from './lib/kit-run.mjs';
import { outsideFolders } from './lib/screens.mjs';
import { sectionsOf, ATOM_AGENT } from './lib/atom-spec.mjs';
import { patternState, instancesOf } from './lib/pattern-run.mjs';
import { falseCases } from './lib/composites.mjs';
import { suspectsOf, gitBranch, INTRO_QUESTIONS } from './lib/intro.mjs';

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

export async function taskMd(root, outDir, ids, { composites = false, intro = false, plan = false } = {}) {
  const { inventory, config } = await runScan(root, outDir, { quiet: true, write: false });
  if (plan) return planTask(root, outDir, config, inventory);
  if (intro) return introTask(root, outDir, config, inventory);
  if (composites) return compositeTask(root, outDir, ids, inventory, config);
  if (isKitMode(config)) return atomTask(root, outDir, ids);
  return guidelineTask(root, outDir, ids);
}

// Folders with atoms in no family, when the kit and families exist.
function undecidedFolders(outDir, config, inventory) {
  if (!isKitMode(config) || !(config.families || []).length) return [];
  try { return outsideFolders(config, kitOf(inventory, outDir, config).kit, inventory); } catch { return []; }
}

// The plan: the steps for the state of the catalog, and where a person is needed.
function planTask(root, outDir, config, inventory) {
  const tick = (s) => '`' + s + '`';
  const kitMode = isKitMode(config);
  const atomsDir = path.join(outDir, 'atoms');
  const specs = (() => { try { return fs.readdirSync(atomsDir).filter((f) => f.endsWith('.md')); } catch { return []; } })();
  const specText = (f) => readText(path.join(atomsDir, f), '') || '';
  const todo = specs.filter((f) => sectionsOf(specText(f)).some((s) => ATOM_AGENT.includes(s.title) && /\bTODO\b/.test(s.text))).length;
  const unsealed = specs.filter((f) => !/^sourceHash:/m.test(specText(f))).length;
  const comps = (() => { try { return fs.readdirSync(path.join(outDir, 'composites')).filter((f) => f.endsWith('.md')); } catch { return []; } })();
  const unsealedComps = comps.filter((f) => !/^sourceHash:/m.test(readText(path.join(outDir, 'composites', f), '') || '')).length;
  const candidates = ((readText(path.join(outDir, 'candidates.md'), '') || '').match(/\*\*не разобран\*\*/g) || []).length;
  const screens = readText(path.join(outDir, 'screens.md'), '') || '';
  const screensTodo = !screens || /\bTODO\b/.test(screens);
  const folders = undecidedFolders(outDir, config, inventory);
  let open = { product: 0, dev: 0 };
  if (kitMode && specs.length) {
    try {
      const { kit, answers } = kitOf(inventory, outDir, config);
      for (const a of kit.atoms) for (const q of a.questions) if (q.status !== 'answered') open[q.audience === 'product' ? 'product' : 'dev']++;
      for (const x of answers.code || []) if (x.status !== 'answered') open[x.part]++;
    } catch {}
  }
  const intro = !!config.context && !folders.length;
  const steps = [
    { what: 'Знакомство с проектом и семьи экранов', how: `${tick('task.mjs --intro')}: что в коде не продукт, что переписывают, нужны ли запросы дизайнеру, основная ветка${folders.length ? `; папки вне семей (${folders.length}) — своя семья или не нужна` : ''}`, out: 'исключения и context в catalog.config.json', done: intro, human: 'да — ответить на вопросы одним сообщением, 5–10 минут' },
    { what: 'Атомы из кода', how: 'скрипты собирают реализации, API, «на проверке»', out: `atoms/ (сейчас ${specs.length}), questions.md`, done: specs.length > 0, human: 'нет' },
    { what: 'Тексты атомов', how: 'агенты-сборщики пишут «Поведение» и «Подводные камни» по коду', out: todo ? `осталось атомов с TODO: ${todo}` : 'тексты атомов', done: specs.length > 0 && !todo, human: 'нет' },
    { what: 'Составные', how: 'агенты проверяют кандидатов по смыслу', out: candidates ? `не разобрано кандидатов: ${candidates}` : 'composites/', done: !candidates && specs.length > 0, human: 'нет' },
    { what: 'Карта экранов', how: 'образцы для каждой семьи', out: 'screens.md', done: !screensTodo, human: 'нет' },
    { what: 'Код продукта', how: 'что агенты нашли не так в коде — пунктами в questions.md', out: '«Код продукта» в questions.md', done: null, human: 'нет' },
    { what: 'Проверка и печать', how: `${tick('check')}, ${tick('--seal')}`, out: unsealed || unsealedComps ? `не запечатано: атомов ${unsealed}, составных ${unsealedComps}` : 'всё запечатано', done: specs.length > 0 && !unsealed && !unsealedComps, human: 'нет' },
    { what: 'Вопросы людям', how: 'отдать questions.md команде: часть продукту и дизайну, часть разработчикам', out: `открыто: продукту и дизайну ${open.product}, разработчикам ${open.dev}`, done: specs.length > 0 && !open.product && !open.dev, human: 'да, когда удобно — ответить в файле; работа их не ждёт' },
  ];
  let now = false;
  const L = [`# План работы с каталогом ${config.project || path.basename(root)}`, ''];
  L.push('Покажи человеку как есть и скажи, с какого шага начинаешь. Человека спрашивай только там, где в последней колонке «да», и всё одного шага — одним сообщением.', '');
  L.push('| # | Шаг | Что делаю | Что получится | Нужен ли человек | Сейчас |', '|---|---|---|---|---|---|');
  steps.forEach((s, i) => {
    let state = s.done === null ? 'по ходу работы' : s.done ? 'готово' : now ? 'впереди' : 'сейчас';
    if (state === 'сейчас') now = true;
    L.push(`| ${i + 1} | ${s.what} | ${s.how} | ${s.out} | ${s.human} | ${state} |`);
  });
  return L.join('\n') + '\n';
}

// The introduction: what the scan found, the questions word for word, where each answer goes.
function introTask(root, outDir, config, inventory) {
  const sus = suspectsOf(root, config);
  const branch = gitBranch(root);
  const folders = undecidedFolders(outDir, config, inventory);
  const tick = (s) => '`' + s + '`';
  const L = [];
  L.push(`# Знакомство с проектом ${config.project || path.basename(root)}`, '');
  L.push(`Проект: ${tick(p(root))}, каталог: ${tick(p(outDir))}${branch ? `, ветка: ${tick(branch)}` : ''}. Задай человеку вопросы ниже одним сообщением, как они написаны, и запиши ответы в ${tick(p(outDir, 'catalog.config.json'))} (правило cfg.intro в ${tick(p(SKILL, 'references', 'config.md'))}). Пока ответов нет, ничего не генерируй. Человека в чате нет — ничего не спрашивай и скажи пользователю, что каталог собран без знакомства.`, '');
  L.push('## Что нашёл скан', '');
  if (sus.length) for (const s of sus) L.push(`- ${tick(s.path)} (файлов ${s.files}) — ${s.why}; рекомендация: ${s.recommend}`);
  else L.push('Подозрительного не нашлось.');
  L.push('');
  if ((config.families || []).length) L.push('## Семьи экранов', '', ...config.families.map((f) => `- **${f.name}** — ${[].concat(f.match || []).map(tick).join(', ')}`), '');
  if (folders.length) L.push('## Папки с атомами вне семей', '', ...folders.map((d) => `- ${tick(d.dir + '/')} — файлов ${d.files}, мест ${d.uses}`), '');
  L.push('## Вопросы — задай их как есть', '');
  let n = 1;
  if (sus.length) L.push(`${n++}. Что из найденного не продукт? По каждой строке: «исключить» или «это продукт» (рекомендации — выше).`);
  for (const q of INTRO_QUESTIONS) L.push(`${n++}. ${q}`);
  if (branch) L.push(`${n++}. Каталог собирается по ветке ${tick(branch)}. Основная ветка продукта — эта?`);
  if (folders.length) L.push(`${n++}. Папки выше используют компоненты, но не входят ни в одну семью экранов. По каждой: это отдельная часть продукта (своя семья), часть существующей семьи (какой) или семья не нужна (почему)?`);
  L.push('', 'Человек не знает ответа (запускает каталог, но продукт не его) — не жди: возьми свою рекомендацию, запиши её туда, куда лёг бы ответ, и добавь в `context.assumed` пункт `{ "question": "<вопрос>", "assumed": "<что взял>" }` — вопрос уйдёт команде в questions.md.');
  L.push('', '## Куда писать ответы', '');
  L.push(`- не продукт — маской в ${tick('exclude')};`);
  L.push(`- найденное, что оказалось продуктом, — в ${tick('context.kept')};`);
  L.push(`- что переписывают — ${tick('context.legacy')}: ${tick('[{ "match": "<маска>", "why": "<почему не образец>" }]')};`);
  L.push(`- запросы — ${tick('context.requests')}: ${tick('"designer"')} (берёт дизайнер) или ${tick('"none"')} (пробел говорят пользователю);`);
  L.push(`- особенности — ${tick('context.notes')}: список коротких фраз, как сказал человек;`);
  L.push(`- основная ветка — ${tick('context.branch')}; сегодняшняя дата — ${tick('context.askedAt')} (ГГГГ-ММ-ДД);`);
  L.push(`- папки вне семей — новая семья или маска в ${tick('families')}; семья не нужна — ${tick('outside')}: ${tick('[{ "match": "<папка>/**", "why": "…" }]')}.`);
  L.push('', `Потом ${tick(`node ${p(SKILL, 'scripts', 'check.mjs')} --root ${p(root)} --out ${p(outDir)}`)} — у cfg.context не должно быть ошибок.`);
  return L.join('\n') + '\n';
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
  L.push(`- \`${p(SKILL, 'references', 'atoms.md')}\` — спека атома (atom.sections, atom.behavior, atom.pitfalls, atom.no-invent)`);
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
  L.push('4. «Поведение» — что компонент делает в работе и чего не скажут пропсы: как продукт показывает загрузку, как выглядит выключенное, что с цветом иконки, как он ведёт себя ссылкой; только то, что код делает сегодня. «Подводные камни» — нумерованный список, самое вредное первым: умолчания, которые кусают (`<button>` в форме — submit), правила на расстоянии (отступ между соседями, `!important`), классы, которые ничего не делают (они в ui-issues.md), реализация, похожая на другую, — и как этого избежать. Оба — из CSS реализаций и мест использования.');
  L.push('5. Остальные разделы — «Что брать сегодня», «API», «На проверке», «Варианты и состояния», «Токены», «Доступность», «Что заменяет» — пишут скрипты: не трогай их ни символом. Пропсов и значений не придумывай.');
  L.push(`6. В \`${rel(path.join(outDir, 'questions.md'))}\`, часть «Продукту и дизайну», блоки твоих атомов — только читай: файл общий с другими агентами. Для каждого пункта «TODO: что видит пользователь — \`проп\`» напиши, что видит пользователь, — без кода, по местам использования (ask.product-words) — и пришли в ответе строками «<id пункта> → <слова>».`);
  L.push(`7. \`node ${p(SKILL, 'scripts', 'check.mjs')} --root ${p(root)} --out ${p(outDir)} --only ${ids.join(',')}\` — повторяй 2–7, пока нет ошибок. Она ничего не записывает. Не запечатывай.`, '');
  L.push('Ответ: по строке на атом — id, сколько ошибок `check --only` осталось (должно быть 0); слова для продукта из шага 6; 2–5 пунктов о том, что в коде показалось несостыковкой (главный агент запишет их в «Код продукта» в questions.md).');
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
  if (args.intro) { process.stdout.write(await taskMd(root, resolveOut(root, args), [], { intro: true })); process.exit(0); }
  if (args.plan) { process.stdout.write(await taskMd(root, resolveOut(root, args), [], { plan: true })); process.exit(0); }
  const ids = [...(typeof args.composites === 'string' ? [args.composites] : []), ...args._].flatMap((x) => String(x).split(',')).filter(Boolean);
  if (!ids.length) fail('Укажи компоненты: node task.mjs <id>[,<id>...] или node task.mjs --composites <id>[,<id>...]');
  process.stdout.write(await taskMd(root, resolveOut(root, args), ids, { composites }));
}
