// Composites in kit mode: candidates → composites/<id>.md (references/composites.md). The scripts find, group and describe; the agent confirms,
// rejects, merges and splits by fixed reasons.
import fs from 'node:fs';
import path from 'node:path';
import { readText, writeText, relPosix, mdHref, sha1 } from './fsutil.mjs';
import { parseFrontmatter, stringifyFrontmatter } from './frontmatter.mjs';
import { findCandidates, falseCases, groupOf, nameFor, slotsOf, COMPOSITE_TYPES, SLOT_RU, KIND_RU } from './composites.mjs';
import { DRAFTS } from './prose.mjs';
import { places } from './kit.mjs';

export const COMPOSITES_DIR = 'composites';
export const CANDIDATES_FILE = 'candidates.md';
export const PAT_FIELDS = ['id', 'name', 'type', 'kinds', 'entity', 'candidates', 'merged', 'added', 'why', 'sourceHash'];
export const PAT_SECTIONS = ['Когда использовать', 'Когда не использовать', 'Анатомия', 'Виды', 'Состав', 'Канон', 'Экземпляры'];
export const PAT_AGENT = ['Когда использовать', 'Когда не использовать'];
const NOTE = '<!-- Из кода: ui-catalog generate. Руками не править. -->';
const code = (s) => '`' + s + '`';
const asList = (v) => (Array.isArray(v) ? v.map(String) : v ? [String(v)] : []);

export function loadComposites(outDir) {
  const dir = path.join(outDir, COMPOSITES_DIR);
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort(); } catch {}
  return files.map((f) => {
    const text = readText(path.join(dir, f), '');
    const { data, body } = parseFrontmatter(text);
    return { id: String(data.id || path.basename(f, '.md')), file: `${COMPOSITES_DIR}/${f}`, data, body, text };
  });
}

// Candidates in groups of two or more (pat.threshold); a lone one is listed, not asked about.
export function patternState(inventory, config, outDir) {
  const all = findCandidates(inventory);
  const groups = new Map();
  for (const c of all) { const g = groupOf(c); (groups.get(g.id) || groups.set(g.id, { ...g, candidates: [] }).get(g.id)).candidates.push(c); }
  const candidates = [...groups.values()].filter((g) => g.candidates.length >= 2).flatMap((g) => g.candidates);
  const singles = [...groups.values()].filter((g) => g.candidates.length < 2).flatMap((g) => g.candidates);
  const byId = new Map(all.map((c) => [c.id, c]));
  const rejected = new Map((config.rejectPatterns || []).map((x) => [x?.id, x?.why || '']));
  const composites = loadComposites(outDir);
  return { all, groups, candidates, singles, byId, rejected, composites };
}

// The instances of a composite: its candidates and what the agent added.
// What a seal of a composite vouches for: the description as written and its instances'
// trees — without the `sourceHash:` line, so the first seal holds.
export const patternHash = (text, instances) => sha1(String(text).replace(/^sourceHash:.*(?:\r?\n|$)/m, '') + '\n§\n' + JSON.stringify(instances.map((x) => [x.file, x.line, x.tree?.signature || null])));

export function instancesOf(comp, state, inventory) {
  const trees = inventory.react?.trees || [];
  const out = [];
  for (const id of asList(comp.data.candidates)) { const c = state.byId.get(id); if (c) out.push({ ...c, from: 'candidate' }); }
  for (const a of asList(comp.data.added)) {
    const m = /^(.+?):(\d+)(?:\s+—\s+(.+))?$/.exec(a);
    if (!m) continue;
    const tree = trees.find((t) => t.file === m[1] && t.line === Number(m[2])) || null;
    out.push({ id: null, type: comp.data.type, file: m[1], line: Number(m[2]), decl: tree?.decl || null, signals: [m[3] || 'добавлено агентом'], tree, from: 'added' });
  }
  return out;
}

export function patternSections(comp, instances, { root, outDir, all, trees = null }) {
  const type = comp.data.type;
  const T = COMPOSITE_TYPES[type] || { slots: [], kinds: [] };
  const dir = path.join(outDir, COMPOSITES_DIR);
  const link = (file, line) => `[${file}:${line}](${mdHref(relPosix(dir, path.join(root, file)))}#L${line})`;
  const out = {};
  const anat = instances.map((x) => ({ x, slots: slotsOf(type, x.tree, trees) }));
  const known = anat.filter((a) => a.slots);

  {
    const L = [NOTE, ''];
    if (!T.slots.length) L.push('Отдельных частей нет: тип описывается тем, где и как он используется.');
    else {
      L.push('| Слот | Обязательный | Есть в | Что стоит |', '|---|---|---|---|');
      for (const [slot, required, parts] of T.slots) {
        const n = known.filter((a) => a.slots[slot]).length;
        const what = [...new Set(known.filter((a) => a.slots[slot]).flatMap((a) => [...(a.x.tree?.components || []).filter((c) => partFits(c, parts)), ...(a.x.tree?.tags || []).filter((t) => tagFits(t, parts)).map((t) => `<${t}>`)]))].slice(0, 6);
        L.push(`| ${SLOT_RU[slot] || slot} | ${required ? 'да' : 'нет'} | ${n} из ${known.length} | ${what.map(code).join(', ') || '—'} |`);
      }
    }
    out['Анатомия'] = L.join('\n');
  }
  {
    const L = [NOTE, ''];
    // The composite's own kind when it has one; the scripts' guess only when the composite has it.
    const own = [].concat(comp.data.kinds || []).map(String).filter(Boolean);
    const kindOf = (x) => (own.length === 1 ? own[0] : own.includes(x.kind) ? x.kind : null);
    const kinds = new Map();
    for (const x of instances) { const k = kindOf(x); if (k) kinds.set(k, (kinds.get(k) || 0) + 1); }
    if (kinds.size) for (const [k, n] of kinds) L.push(`- ${KIND_RU[k] || k} (${code(k)}) — ${places(n)}`);
    else L.push('Один вид.');
    const optional = T.slots.filter(([, req]) => !req).map(([slot]) => [slot, known.filter((a) => a.slots[slot]).length]).filter(([, n]) => n > 0 && n < known.length);
    if (optional.length) L.push('', `Различаются: ${optional.map(([s, n]) => `${SLOT_RU[s] || s} — у ${n} из ${known.length}`).join(', ')}.`);
    out['Виды'] = L.join('\n');
  }
  {
    // Other composites inside: their instances are components this one renders.
    const L = [NOTE, ''];
    const inside = new Map();
    for (const other of all.filter((o) => o.comp.id !== comp.id)) {
      const names = new Set(other.instances.map((x) => x.decl).filter(Boolean));
      const n = instances.filter((x) => (x.tree?.components || []).some((c) => names.has(c))).length;
      if (n) inside.set(other.comp, n);
    }
    if (!inside.size) L.push('Других составных внутри нет.');
    for (const [o, n] of inside) L.push(`- [${o.data.name || o.id}](${o.id}.md) — внутри ${n} из ${instances.length}`);
    out['Состав'] = L.join('\n');
  }
  {
    const L = [NOTE, ''];
    const counts = new Map();
    for (const a of known) { const k = Object.entries(a.slots).filter(([, v]) => v).map(([s]) => s).join(' + ') || '—'; counts.set(k, (counts.get(k) || 0) + 1); }
    const top = [...counts].sort((a, b) => b[1] - a[1])[0];
    if (top) L.push(`${top[0].split(' + ').map((s) => SLOT_RU[s] || s).join(' + ')} — так устроены ${top[1]} из ${known.length}. Новое такого рода собирай так же.`);
    else L.push('Канон по разметке не виден: экземпляры — места использования.');
    out['Канон'] = L.join('\n');
  }
  {
    const L = [NOTE, ''];
    for (const x of instances) L.push(`- ${link(x.file, x.line)} — ${x.decl ? `${code(x.decl)}` : 'на месте'}${x.kind ? ` · ${KIND_RU[x.kind] || x.kind}` : ''} · ${x.signals[0]}${x.id ? ` · ${code(x.id)}` : ''}`);
    out['Экземпляры'] = L.join('\n');
  }
  return out;
}
const tagFits = (tag, parts) => parts.some((p) => ({ heading: /^h[1-6]$/, media: /^(img|svg|picture|video)$/, action: /^(button|a)$/, field: /^(input|select|textarea)$/, text: /^p$/, list: /^(ul|ol|dl|table)$/ }[p] || /$^/).test(tag));
const partFits = (name, parts) => parts.some((p) => ({ heading: /Title|Heading/, media: /Icon|Avatar|Image|Logo|Illustration/, action: /Button|Btn|Link/, field: /Input|Select|Textarea|Checkbox|Radio|Switch|Field|Autocomplete|Picker/, text: /Text|Description|Label/, list: /List|Table/, close: /Close/ }[p] || /$^/).test(name));

function newFile(g, candidates, sections) {
  const draft = DRAFTS[g.type];
  const data = { id: g.id, name: g.name, type: g.type, kinds: g.kinds.length ? g.kinds : [...new Set(candidates.map((c) => c.kind).filter(Boolean))], entity: g.entity || '', candidates: candidates.map((c) => c.id), merged: '', added: [], why: '' };
  if (!data.kinds.length) data.kinds = [];
  const body = PAT_SECTIONS.map((s) => `## ${s}\n\n${sections[s] ?? (s === 'Когда использовать' ? `TODO: ситуации из экземпляров, где это правильный выбор.${draft ? ` Заготовка: ${draft.job}` : ''}` : 'TODO: похожие ситуации, где нужен другой компонент или составное, — и какое именно.')}`).join('\n\n');
  return stringifyFrontmatter(data, PAT_FIELDS.filter((k) => k in data)) + '\n' + body + '\n';
}
export function rewriteFile(text, sections) {
  const head = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(text)?.[0] || '';
  const own = new Map();
  for (const p of text.slice(head.length).split(/^## /m).slice(1)) { const nl = p.indexOf('\n'); own.set(p.slice(0, nl).trim(), p.slice(nl + 1).trim()); }
  return head + '\n' + PAT_SECTIONS.map((s) => `## ${s}\n\n${PAT_AGENT.includes(s) ? own.get(s) ?? 'TODO' : sections[s]}`).join('\n\n') + '\n';
}

export function runPatternGenerate(root, outDir, inventory, config, { quiet = false } = {}) {
  let state = patternState(inventory, config, outDir);
  const assigned = new Map();
  for (const comp of state.composites) for (const id of asList(comp.data.candidates)) assigned.set(id, comp.id);
  const written = [];
  // Ids the code no longer has leave `candidates:`, and generate says so.
  const gone = [];
  for (const comp of state.composites) {
    const ids = asList(comp.data.candidates);
    const keep = ids.filter((id) => state.byId.has(id));
    if (keep.length === ids.length) continue;
    gone.push(...ids.filter((id) => !state.byId.has(id)).map((id) => `${id} (${comp.id})`));
    const data = { ...comp.data, candidates: keep };
    writeText(path.join(outDir, comp.file), stringifyFrontmatter(data, PAT_FIELDS.filter((k) => k in data)) + comp.text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, ''));
  }
  // A group nobody has looked at yet gets its composite. Later candidates of a group the
  // agent already reviewed stay unreviewed until the agent looks at them (pat.review).
  for (const g of state.groups.values()) {
    if (g.candidates.length < 2) continue;
    if (state.composites.some((c) => c.id === g.id) || g.candidates.some((c) => assigned.has(c.id) || state.rejected.has(c.id))) continue;
    writeText(path.join(outDir, COMPOSITES_DIR, `${g.id}.md`), newFile(g, g.candidates, {}));
    written.push(g.id);
  }
  // Describe every composite from its instances.
  state = patternState(inventory, config, outDir);
  const all = state.composites.map((comp) => ({ comp, instances: instancesOf(comp, state, inventory) }));
  for (const { comp, instances } of all) {
    const next = rewriteFile(comp.text, patternSections(comp, instances, { root, outDir, all, trees: inventory.react?.trees }));
    if (next !== comp.text) writeText(path.join(outDir, comp.file), next);
  }
  writeCandidates(path.join(outDir, CANDIDATES_FILE), config.project, state, all);
  if (!quiet) {
    console.log(`  составных: ${state.composites.length} (новых ${written.length}); кандидатов ${state.candidates.length}, одиночных ${state.singles.length} — ${CANDIDATES_FILE}`);
    if (gone.length) console.log(`  кандидатов больше нет в коде, убраны из составных: ${gone.join(', ')}`);
    const unseen = state.candidates.filter((c) => !all.some(({ comp }) => asList(comp.data.candidates).includes(c.id)) && !state.rejected.has(c.id) && (state.groups.get(groupOf(c).id)?.candidates.length || 0) >= 2).length;
    if (unseen) console.log(`  не разобрано кандидатов: ${unseen} — посмотри их в ${CANDIDATES_FILE} («не разобран»)`);
  }
  return { state, all, written };
}

function writeCandidates(file, project, state, all) {
  const where = new Map();
  for (const { comp } of all) for (const id of asList(comp.data.candidates)) where.set(id, comp.id);
  const L = [`# Кандидаты в составные — ${project}`, '', '> Пишет `ui-catalog generate`. Кандидат — место, где скрипт увидел признаки типа. Каждый кандидат', '> из группы в два и больше — в одном составном (`candidates:`) или отклонён в `catalog.config.json` →', '> `rejectPatterns` с причиной из списка (references/composites.md).', ''];
  L.push('Причины отказа — только эти: «один экземпляр», «часть атома», «часть составного <id или тип>», «основа обёрток», «тот же экземпляр, что <id кандидата>», «ложное срабатывание: <случай>» — случай из списка у группы.', '');
  for (const g of [...state.groups.values()].sort((a, b) => b.candidates.length - a.candidates.length)) {
    if (g.candidates.length < 2) continue;
    L.push(`## ${g.name} — ${places(g.candidates.length)}`, '', `Ложные срабатывания: ${falseCases(g.type).map((x) => `«${x}»`).join(', ')}.`, '');
    for (const c of g.candidates) {
      const status = where.has(c.id) ? `в [${where.get(c.id)}](composites/${where.get(c.id)}.md)` : state.rejected.has(c.id) ? `отклонён: ${state.rejected.get(c.id)}` : '**не разобран**';
      L.push(`- \`${c.id}\` ${c.file}:${c.line}${c.decl ? ` \`${c.decl}\`` : ''}${c.kind ? ` · ${c.kind}` : ''} — ${c.signals.join('; ')} — ${status}`);
    }
    L.push('');
  }
  const singles = state.singles;
  if (singles.length) {
    L.push('## Одиночные — не закономерность', '', 'Признаки типа есть, но место одно (правило «больше одного раза»). Если такой же блок есть в другом месте, добавь оба в составное (`added:`).', '');
    for (const c of singles) L.push(`- ${COMPOSITE_TYPES[c.type].name}: ${c.file}:${c.line}${c.decl ? ` \`${c.decl}\`` : ''} — ${c.signals[0]}`);
    L.push('');
  }
  writeText(file, L.join('\n'));
}
