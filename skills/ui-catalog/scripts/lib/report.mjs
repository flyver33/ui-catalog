// The report to the user at the end of a run, by template (`check --report`): the agent
// passes it on as it is, so every run tells the same things the same way.
import { describeOverride } from './overrides.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { relPosix } from './fsutil.mjs';
import { blindSpotLines } from './blind-spots.mjs';
import { RULES } from '../audit.mjs';
import { unitsOf } from './split.mjs';

const plural = (n, one, few, many) => { const m10 = n % 10, m100 = n % 100; return `${n} ${m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many}`; };

function head(L, errors, ready) {
  if (errors.length) {
    L.push(`**Не готово:** ${plural(errors.length, 'ошибка', 'ошибки', 'ошибок')} в \`check\`. Каталог не сдаётся, пока они есть:`, '');
    for (const e of errors.slice(0, 12)) L.push(`- ${e.id}: ${e.msg}`);
    if (errors.length > 12) L.push(`- … ещё ${errors.length - 12}`);
    L.push('');
  } else L.push(ready, '');
}

function issuesLine(file, findings) {
  const byRule = new Map();
  for (const f of findings) byRule.set(f.rule, (byRule.get(f.rule) || 0) + 1);
  const top = [...byRule].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([r, n]) => `${RULES[r]?.title || r} — ${n}`).join('; ');
  return `- Несостыковки в коде: \`${file}\` — ${findings.length}${top ? ` (${top})` : ''}`;
}

function tail(L, catalogFile, warnings, inventory) {
  L.push(...blindSpotLines(inventory?.blindSpots));
  if (warnings.length) {
    L.push(`Осталось ${plural(warnings.length, 'предупреждение', 'предупреждения', 'предупреждений')}:`, '');
    for (const w of warnings) L.push(`- ${w.id}: ${w.msg.split('\n')[0]}`);
    L.push('');
  }
  L.push('Строка для `CLAUDE.md` / `AGENTS.md` проекта:', '');
  L.push(`> Перед любой UI-задачей прочитай \`${catalogFile}\`; фичи собирай через скилл \`ui-compose\`.`);
}

export function reportMd({ root, outDir, config, lib, inventory, errors, warnings, findings, issuesFile, kit = null }) {
  // From the project root when the library is inside it; absolute otherwise.
  const rel = (p) => { const r = relPosix(root, p); return r.startsWith('../') ? path.resolve(p).split(path.sep).join('/') : r; };
  if (kit) return kitReportMd({ rel, outDir, config, inventory, errors, warnings, findings, issuesFile, kit });
  const unitsById = new Map(inventory.units.map((u) => [u.id, u]));
  const comps = [...lib.components].sort((a, b) => String(a.data.name).localeCompare(String(b.data.name)));
  const sealed = comps.filter((c) => c.data.sourceHash).length;
  const L = [];
  L.push(`## Каталог компонентов — ${config.project}`, '');
  head(L, errors, `**Готово:** ${plural(comps.length, 'компонент', 'компонента', 'компонентов')}, запечатано ${sealed}, ошибок нет.`);

  L.push(`- Галерея: \`${rel(path.join(outDir, 'gallery', 'index.html'))}\` (через статический сервер проекта; \`?eager\` грузит все кадры сразу)`);
  L.push(`- Для агентов: \`${rel(path.join(outDir, 'CATALOG.md'))}\``);
  L.push(issuesLine(rel(issuesFile), findings), '');

  L.push(`Компоненты: ${comps.map((c) => `${c.data.name} (\`${c.id}\`)`).join(', ')}.`);
  const scaffold = Object.keys(config.scaffold || {});
  if (scaffold.length) L.push(`Не компоненты — каркас и блоки: ${scaffold.map((s) => `\`${s}\``).join(', ')}.`);
  L.push('');

  // Signs of a missing variant: pages restyle the component, colours without tokens.
  const hints = [];
  for (const c of comps) {
    const units = unitsOf(c, unitsById);
    // Only a change of look hints at a missing variant; a size fitted to a place does not.
    const scopes = [...new Set(units.flatMap((u) => u.overrides.filter((o) => describeOverride(o).look).map((o) => o.scope)))];
    const hard = [...new Set(units.flatMap((u) => u.hardcoded))];
    const parts = [];
    if (scopes.length) parts.push(`перекрашивают на ${scopes.join(', ')}`);
    if (hard.length) parts.push(`цвета без токенов: ${hard.join(', ')}`);
    if (parts.length) hints.push(`- ${c.data.name}: ${parts.join('; ')}`);
  }
  if (hints.length) L.push('Похоже, не хватает видов или токенов:', '', ...hints, '');

  tail(L, rel(path.join(outDir, 'CATALOG.md')), warnings, inventory);
  return L.join('\n') + '\n';
}

// Kit mode: atoms and their questions, composites, and the gallery if build rendered it.
function kitReportMd({ rel, outDir, config, inventory, errors, warnings, findings, issuesFile, kit }) {
  const atoms = kit.kit.atoms;
  const sealed = kit.specs.filter((c) => c.data.sourceHash).length;
  const open = atoms.flatMap((a) => a.questions).filter((q) => q.status !== 'answered').length;
  const L = [`## Спеки кита — ${config.project}`, ''];
  head(L, errors, `**Готово:** ${plural(atoms.length, 'атом', 'атома', 'атомов')}, запечатано ${sealed}, ошибок нет.`);
  L.push(`- Для агентов: \`${rel(path.join(outDir, 'CATALOG.md'))}\``);
  L.push(`- Вопросы по атомам: \`${rel(path.join(outDir, 'questions.md'))}\` — открыто ${open}${open ? ': отвечают люди, в чате или в этом файле' : ''}`);
  L.push(issuesLine(rel(issuesFile), findings));
  const galleryFile = path.join(outDir, 'gallery', 'index.html');
  if (fs.existsSync(path.join(outDir, 'gallery', 'data.js'))) L.push(`- Галерея: \`${rel(galleryFile)}\` (через статический сервер; все реализации атома — рядом)`, '');
  else L.push('- Галерея не собрана: в node_modules проекта нет react (npm ci) — спеки читаются в `atoms/`, составные — в `composites/`.', '');
  L.push(`Атомы: ${atoms.map((a) => a.name).join(', ')}; запечатано ${sealed} из ${kit.specs.length}.`);
  const p = kit.patterns;
  if (p) {
    const owned = new Set(p.all.flatMap(({ comp }) => [].concat(comp.data.candidates || []).map(String)));
    const left = p.state.candidates.filter((c) => !owned.has(c.id) && !p.state.rejected.has(c.id)).length;
    L.push(`Составные: ${p.all.map(({ comp }) => comp.data.name || comp.id).join(', ') || 'нет'}; кандидатов ${p.state.candidates.length}, не разобрано ${left}.`);
  }
  L.push('');
  tail(L, rel(path.join(outDir, 'CATALOG.md')), warnings, inventory);
  return L.join('\n') + '\n';
}
