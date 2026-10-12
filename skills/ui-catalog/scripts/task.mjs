#!/usr/bin/env node
// ui-catalog task — the brief for a sub-agent that writes a group of guidelines, by
// template: what to read, which files are its own, the steps, what check still reports
// for each component, and what to answer. The main agent hands it over as it is.
//   node task.mjs <id>[,<id>...] [--root <project>] [--out <dir>]
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, relPosix, isMain, fail } from './lib/fsutil.mjs';
import { resolveOut } from './lib/config.mjs';
import { runCheck } from './check.mjs';
import { loadLibrary } from './lib/library.mjs';

const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function taskMd(root, outDir, ids) {
  const lib = loadLibrary(outDir);
  const missing = ids.filter((id) => !lib.components.some((c) => c.id === id));
  if (missing.length) fail(`Нет таких компонентов: ${missing.join(', ')} — сначала node generate.mjs`);
  const { errors, warnings } = await runCheck(root, outDir, { only: ids, silent: true });
  const p = (...x) => path.join(...x).replace(/\\/g, '/');
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
    // Sealing is the main agent's: not part of the brief.
    const own = errors.filter((e) => (e.id === id || c.declared.includes(e.id)) && !/не запечатано|изменились после печати/.test(e.msg));
    for (const e of own) L.push(`  - ошибка: ${e.msg.split('\n')[0]} [${e.rule}]`);
    for (const w of warnings.filter((e) => e.id === id)) L.push(`  - предупреждение: ${w.msg.split('\n')[0]} [${w.rule}]`);
  }
  L.push('');
  L.push('Порядок:', '');
  L.push(`1. Прочитай CSS классов (\`${rel(path.join(outDir, 'inventory.json'))}\` → units → rules) и каждое место из «Показательные места» вместе с 20–40 строками вокруг.`);
  L.push('2. Поставь `type` из types.md (gl.type); `name` — по эталону (gl.name).');
  L.push(`3. \`node ${p(SKILL, 'scripts', 'generate.mjs')} --root ${p(root)} --facts ${list}\` — разделы из кода и заготовки \`job\`/\`intents\` типа.`);
  L.push('4. Допиши по guideline.md и examples.md: `job`, `intents`, «Когда использовать», «Когда не использовать», «Как собрать», «Подводные камни», колонку «Когда выбирать» в «Вариантах», в примерах — `data-about` и всё, что помечено TODO. Что пишут скрипты (gl.script-fields), руками не правь.');
  L.push(`5. \`node ${p(SKILL, 'scripts', 'check.mjs')} --root ${p(root)} --only ${list}\` — повторяй 4–5, пока нет ошибок. Не запечатывай (\`--seal\` делает главный агент).`, '');
  L.push('Ответ: по строке на компонент — id, type, name, сколько ошибок `check --only` осталось (должно быть 0) и одно предложение, если что-то в коде показалось несостыковкой.');
  return L.join('\n') + '\n';
}

if (isMain(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(args.root || process.cwd());
  const ids = args._.flatMap((x) => String(x).split(',')).filter(Boolean);
  if (!ids.length) fail('Укажи компоненты: node task.mjs <id>[,<id>...]');
  process.stdout.write(await taskMd(root, resolveOut(root, args), ids));
}
