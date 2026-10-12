#!/usr/bin/env node
// ui-catalog scan — inventory of a codebase's UI units.
//   node scan.mjs [--root <project>] [--out <dir>] [--quiet]
// Writes <out>/inventory.json (generated, do not edit). Creates
// <out>/catalog.config.json on first run from what it detects.
import path from 'node:path';
import { parseArgs, writeJson, readJson, fail, isMain } from './lib/fsutil.mjs';
import { loadConfig, resolveOut, ignoreIds, iconBaseOf } from './lib/config.mjs';
import { loadLibrary } from './lib/library.mjs';
import { blindSpots } from './lib/blind-spots.mjs';

export async function runScan(root, outDir, { quiet = false } = {}) {
  const config = loadConfig(root, outDir);
  if (config.adapter.startsWith('unsupported:')) {
    fail(`Проект на ${config.adapter.split(':')[1]}: адаптер для этого стека ещё не написан.\n` +
      `Сейчас есть html-css и react. Если компоненты проекта — CSS-классы, поставь "adapter": "html-css" в ${config.__file}.`, 2);
  }
  const adapter = await import(`./adapters/${config.adapter}.mjs`).catch(() => fail(`Нет адаптера ${config.adapter}`, 2));
  const result = adapter.scan(root, config);
  const inventory = {
    $comment: 'Сгенерировано ui-catalog scan. Не править руками.',
    version: 1,
    adapter: config.adapter,
    project: config.project,
    generatedAt: new Date().toISOString(),
    styles: config.styles,
    ...result,
  };
  const classes = new Set((result.units || []).flatMap((u) => [u.id, ...Object.keys(u.modifiers || {}), ...Object.keys(u.elements || {})]));
  inventory.blindSpots = blindSpots(root, config, classes);
  writeJson(path.join(outDir, 'inventory.json'), inventory);
  // A new config gets the icon class family the icon set shares (one setting fewer to guess).
  if (config.__created && config.icons && !config.icons.base && iconBaseOf(config, inventory)) {
    const raw = readJson(config.__file);
    raw.icons = { ...raw.icons, base: iconBaseOf(config, inventory) };
    writeJson(config.__file, raw);
    config.icons = raw.icons;
  }
  if (!quiet) summary(inventory, config, outDir);
  return { inventory, config };
}

function summary(inv, config, outDir) {
  const lib = loadLibrary(outDir);
  const claimed = new Set(lib.components.flatMap((c) => c.units));
  const ignored = new Set(ignoreIds(config));
  const byScope = {};
  for (const u of inv.units) byScope[u.scope] = (byScope[u.scope] || 0) + 1;
  const libUnits = inv.units.filter((u) => u.library);
  const open = libUnits.filter((u) => !claimed.has(u.id) && !ignored.has(u.id));
  console.log(`ui-catalog scan: ${inv.project} (${inv.adapter})`);
  if (config.__created) console.log(`  создан ${path.relative(process.cwd(), config.__file)} — проверь scopes/styles/exclude`);
  console.log(`  юнитов: ${inv.units.length} — ` + Object.entries(byScope).map(([k, v]) => `${k} ${v}`).join(', '));
  console.log(`  токенов: ${inv.tokens.length}, иконок: ${inv.icons.length}, партиалов: ${inv.partials.length}`);
  console.log(`  в библиотеке: ${libUnits.length}, описано компонентами: ${libUnits.length - open.length}`);
  if (open.length) console.log(`  без гайдлайна: ${open.map((u) => u.id).join(', ')}\n  → node generate.mjs --all`);
}

if (isMain(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(args.root || process.cwd());
  await runScan(root, resolveOut(root, args), { quiet: !!args.quiet });
}
