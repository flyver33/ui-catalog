#!/usr/bin/env node
// ui-compose query — read a ui-catalog library without loading all of it.
//   node query.mjs list                         one line per component
//   node query.mjs search <words...>            rank components by the task you describe
//   node query.mjs get <id> [<id>...]           full guideline + states + where it is used
//   node query.mjs requests                     open requests (gaps already reported)
//   node query.mjs tokens [<filter>]            tokens with their roles; filter by name, kind or role
//   [--dir <library dir>] [--root <project>]    default: <root>/docs/design-system
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf('--' + name); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const dirArg = opt('dir');
const rootArg = opt('root');
const [cmd = 'list', ...rest] = args;

function findLibrary() {
  if (dirArg) return path.resolve(dirArg);
  const start = path.resolve(rootArg || process.cwd());
  for (let d = start; ; d = path.dirname(d)) {
    const cand = path.join(d, 'docs', 'design-system');
    if (fs.existsSync(path.join(cand, 'components.json'))) return cand;
    if (path.dirname(d) === d) break;
  }
  console.error('Библиотека не найдена (нет docs/design-system/components.json). Сначала ui-catalog: node build.mjs, или укажи --dir.');
  process.exit(2);
}

const dir = findLibrary();
const lib = JSON.parse(fs.readFileSync(path.join(dir, 'components.json'), 'utf8'));
const read = (f) => { try { return fs.readFileSync(path.join(dir, f), 'utf8'); } catch { return ''; } };
const flags = (c) => [c.stale ? 'код изменился после описания' : null, c.todo ? `TODO×${c.todo}` : null].filter(Boolean);
const line = (c) => `${c.id} | ${c.name} | ${c.job}` + (c.intents.length ? ` | теги: ${c.intents.join(', ')}` : '') + ` | ${c.usageCount} исп.` + (flags(c).length ? ` | ${flags(c).join(', ')}` : '');

// Crude stemming: Russian and English word forms share a prefix.
const stem = (w) => (w.length > 5 ? w.slice(0, Math.max(5, w.length - 2)) : w);
// Conjunctions and prepositions say nothing about a job: «или» matched every guideline.
const STOP = new Set(['или', 'либо', 'но', 'на', 'по', 'для', 'не', 'ни', 'что', 'как', 'из', 'от', 'до', 'за', 'при', 'без', 'под', 'над', 'это', 'его', 'ее', 'их', 'and', 'or', 'the', 'of', 'to', 'in', 'on', 'for', 'with']);
const words = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').split(/[^\p{L}\p{N}-]+/u).filter((w) => w.length > 1 && !STOP.has(w));

function search(query) {
  const q = [...new Set(words(query).map(stem))];
  if (!q.length) return { found: [], against: [] };
  const docs = lib.components.map((c) => {
    const body = read(c.md);
    const notUse = (/## Когда не использовать([\s\S]*?)(\n## |$)/.exec(body) || [])[1] || '';
    const fields = [
      [c.intents.join(' '), 4], [c.name, 3], [c.job, 3], [[c.id, ...c.modifiers].join(' '), 2],
      [(/## Когда использовать([\s\S]*?)(\n## |$)/.exec(body) || [])[1], 2], [body.replace(notUse, ''), 1],
    ].map(([text, weight]) => [words(text), weight]);
    return { c, fields, notUse: words(notUse) };
  });
  // A word found in every guideline ("показать") says nothing: weight by rarity.
  const df = new Map(q.map((w) => [w, docs.filter((d) => d.fields.some(([ws]) => ws.some((t) => t.startsWith(w)))).length]));
  const idf = (w) => Math.log((docs.length + 1) / (df.get(w) + 0.5));
  const res = docs.map(({ c, fields, notUse }) => {
    let score = 0;
    const hits = new Set();
    for (const w of q) for (const [ws, weight] of fields) {
      if (ws.some((t) => t.startsWith(w))) { score += weight * idf(w); hits.add(w); break; }
    }
    score *= hits.size / q.length + 0.5;
    const against = q.filter((w) => !hits.has(w) && notUse.some((t) => t.startsWith(w)));
    return { c, score, hits: [...hits], against };
  });
  return {
    found: res.filter((r) => r.score > 0.5).sort((a, b) => b.score - a.score),
    against: res.filter((r) => r.against.length && r.score <= 0.5),
  };
}

switch (cmd) {
  case 'list':
    console.log(`# ${lib.project}: ${lib.components.length} компонентов (${dir})`);
    for (const c of lib.components) console.log(line(c));
    if (lib.undocumented?.length) console.log(`\nбез гайдлайна: ${lib.undocumented.join(', ')}`);
    if (lib.composites?.length) console.log(`\nсоставные (compose.mjs pattern <тип>): ${lib.composites.map((x) => `${x.id} (${x.type})`).join(', ')}`);
    break;
  case 'search': {
    const { found, against } = search(rest.join(' '));
    if (!found.length) console.log(`Ничего не найдено по «${rest.join(' ')}». Посмотри list — или это пробел.`);
    for (const r of found.slice(0, 8)) {
      console.log(`${r.score.toFixed(1).padStart(5)}  ${line(r.c)}  [совпало: ${r.hits.join(', ')}]`);
      if (r.against.length) console.log(`       ! в «Когда не использовать» упомянуто: ${r.against.join(', ')}`);
    }
    for (const r of against) console.log(`   —   ${r.c.id}: в «Когда не использовать» сказано про «${r.against.join(', ')}» — прочитай, там может быть указан пробел или замена`);
    if (found.length) console.log('\nСовпадение слов — не решение. Открой кандидатов через get и сверь «Когда использовать» / «Когда не использовать».');
    break;
  }
  case 'get':
    for (const id of rest) {
      const c = lib.components.find((x) => x.id === id || x.units.includes(id));
      const comp = !c && (lib.composites || []).find((x) => x.id === id);
      if (comp) { console.log(`=== ${comp.id} — составное (${path.join(dir, comp.md)})`); console.log(read(comp.md).replace(/^---[\s\S]*?---\n/, '')); continue; }
      if (!c) { console.log(`Нет компонента ${id}.`); continue; }
      console.log(`=== ${c.id} (${path.join(dir, c.md)})`);
      if (flags(c).length) console.log(`!! ${flags(c).join(', ')} — гайдлайн может быть неполным, сверься с CSS`);
      console.log(read(c.md).replace(/^---[\s\S]*?---\n/, ''));
      for (const v of c.variants || []) console.log(`Вид ${v.name || 'единственный'}${v.class ? ` (${v.class})` : ''}: состояния — ${v.states.join(' · ') || 'только основное'}`);
      if (c.combos?.length) console.log(`В продукте: ${c.combos.map((x) => x.classes + (x.count > 1 ? ` ×${x.count}` : '')).join(' · ')}`);
      if (c.possible?.length) console.log(`CSS позволяет, в продукте нет (скажи разработчику, проверь глазами): ${c.possible.map((x) => x.classes).join(' · ')}`);
      if (c.issues?.length) console.log(`!! Несостыковки в коде (ui-issues.md) — не повторяй их в новом: ${c.issues.map((f) => `${f.title.toLowerCase()} (${f.subject})`).join('; ')}`);
      if (c.counterpart) console.log(`В другой системе (боевые стили, кит): ${c.counterpart}`);
      console.log(`Используется в: ${c.usedIn.join(', ') || 'нигде'}`);
      const ex = read(`examples/${c.id}.html`);
      if (ex) console.log(`Примеры разметки: ${path.join(dir, 'examples', c.id + '.html')}`);
      console.log('');
    }
    break;
  case 'requests': {
    const open = (lib.requests || []).filter((r) => r.status !== 'closed');
    if (!open.length) { console.log('Открытых запросов нет.'); break; }
    for (const r of open) console.log(`${r.id} | ${r.title} | нужно: ${r.needs.join(', ') || '—'} | ${path.join(dir, 'requests', r.id + '.md')}`);
    break;
  }
  case 'tokens': {
    // Roles come from how the code uses each token; the rules — foundations/.
    const f = rest.join(' ').toLowerCase();
    const names = new Map(lib.components.map((c) => [c.id, c.name]));
    const list = (lib.tokens || []).filter((t) => !f || [t.name, t.kind, ...(t.roles || []).map((r) => r.role)].some((x) => String(x).toLowerCase().includes(f)));
    if (!list.length) { console.log(f ? `Токенов по «${f}» нет.` : 'Токенов нет.'); break; }
    for (const t of list) console.log(`${t.name} ${t.value}${t.resolved && t.resolved !== t.value ? ` = ${t.resolved}` : ''} | ${t.kind} | ${(t.roles || []).map((r) => `${r.role} ×${r.count}`).join(' · ') || '—'} | в: ${(t.components || []).map((id) => names.get(id) || id).join(', ') || '—'}`);
    const files = (lib.foundations || []).map((x) => path.join(dir, x.file));
    if (files.length) console.log(`\nОсновы — правила, роли, пары фон + текст: ${files.join(', ')}`);
    break;
  }
  default:
    console.log('Команды: list | search <слова> | get <id> | requests | tokens [фильтр]');
    process.exitCode = 2;
}
