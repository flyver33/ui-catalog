// What `check` holds in kit mode (references/atoms.md).
import path from 'node:path';
import { compDir } from './library.mjs';
import { kitOf, orphanAtoms, atomHash } from './kit-run.mjs';
import { KIT_TYPES, typeName, kitDiff } from './kit.mjs';
import { readAnswers, answerProblems, QUESTIONS_FILE } from './questions.mjs';
import { atomSections, sectionsOf, ATOM_FIELDS, ATOM_REQUIRED, ATOM_SECTIONS, ATOM_AGENT } from './atom-spec.mjs';
import { proseProblems } from './prose.mjs';
import fs from 'node:fs';
import { patternState, instancesOf, patternHash, patternSections, PAT_FIELDS, PAT_SECTIONS, PAT_AGENT, CANDIDATES_FILE } from './pattern-run.mjs';
import { COMPOSITE_TYPES, SLOT_RU, nameFor, slotsOf, falseCases } from './composites.mjs';

const norm = (s) => String(s || '').replace(/\r/g, '').replace(/[ \t]+$/gm, '').trim();
const asList = (v) => (Array.isArray(v) ? v.map(String) : v ? [String(v)] : []);
export const REJECT_REASONS = /^(один экземпляр|часть атома|основа обёрток)$/;
export const MERGE_REASONS = /^(обязательные слоты совпадают)$/;

// Composites (references/composites.md): the agent's decisions held to the facts.
export function patternChecks({ root, outDir, inventory, config, E, W, I, known = new Set(), modifiers = new Set() }) {
  const state = patternState(inventory, config, outDir);
  const all = state.composites.map((comp) => ({ comp, instances: instancesOf(comp, state, inventory) }));
  const owners = new Map();
  for (const { comp } of all) for (const id of asList(comp.data.candidates)) (owners.get(id) || owners.set(id, []).get(id)).push(comp.id);
  for (const c of state.candidates) {
    const o = owners.get(c.id) || [];
    const where = `${COMPOSITE_TYPES[c.type].name} ${c.file}:${c.line}`;
    if (!o.length && !state.rejected.has(c.id)) E('pat.review', c.id, `кандидат не разобран: ${where} (${c.signals[0]})`, `добавь в составное (candidates:) или отклони в catalog.config.json → rejectPatterns с причиной; список — ${CANDIDATES_FILE}`);
    if (o.length > 1) E('pat.review', c.id, `кандидат сразу в ${o.join(', ')}`, 'один кандидат — в одном составном');
    if (o.length && state.rejected.has(c.id)) E('pat.review', c.id, `кандидат и в ${o[0]}, и отклонён`, 'что-то одно');
  }
  for (const [id, cs] of owners) if (!state.byId.has(id)) W('pat.review', cs[0], `кандидата ${id} в коде больше нет`, 'убери его из candidates:');
  for (const x of config.rejectPatterns || []) {
    const why = String(x?.why || '').trim();
    const cand = state.byId.get(x?.id);
    // A rejected candidate the code no longer has: nothing to hold the reason to.
    if (x?.id && !cand) { W('pat.review', x.id, `отклонённого кандидата ${x.id} в коде больше нет`, 'убери его из rejectPatterns'); continue; }
    const fp = /^ложное срабатывание: (.+)$/.exec(why), part = /^часть составного (.+)$/.exec(why), same = /^тот же экземпляр, что (\S+)$/.exec(why);
    let bad = null;
    if (fp) { const cases = falseCases(cand?.type); if (!cases.includes(fp[1].trim())) bad = `случая «${fp[1]}» нет в списке${cand ? ` ${COMPOSITE_TYPES[cand.type]?.name}` : ''}: ${cases.map((c) => `«${c}»`).join(', ')}`; }
    else if (part) { if (!COMPOSITE_TYPES[part[1].trim()] && !all.some(({ comp }) => comp.id === part[1].trim())) bad = `составного «${part[1]}» нет ни среди типов, ни в composites/`; }
    else if (same) { const o = state.byId.get(same[1]); if (!o) bad = `кандидата ${same[1]} нет`; else if (state.rejected.has(o.id)) bad = `${same[1]} тоже отклонён — один из двух остаётся`; else if (!owners.has(o.id)) bad = `${same[1]} не лежит ни в одном составном — тот, что остаётся, должен быть разобран`; }
    else if (!REJECT_REASONS.test(why)) bad = `причина отказа «${why}» не из списка`;
    if (bad) E('pat.reasons', x?.id || 'rejectPatterns', bad, 'причины — в candidates.md: один экземпляр, часть атома, часть составного <id>, основа обёрток, тот же экземпляр, что <id>, ложное срабатывание: <случай из списка группы>');
  }
  for (const { comp, instances } of all) {
    const d = comp.data;
    const T = COMPOSITE_TYPES[d.type];
    if (d.merged && !MERGE_REASONS.test(String(d.merged))) E('pat.reasons', comp.id, `merged: «${d.merged}» — причина не из списка`, 'слить можно, когда обязательные слоты совпадают');
    for (const k of Object.keys(d)) if (!PAT_FIELDS.includes(k)) E('pat.sections', comp.id, `поля «${k}» нет в формате составного`, `поля: ${PAT_FIELDS.join(', ')}`);
    if (d.type !== 'project' && !T) E('pat.type', comp.id, `type «${d.type}» — нет в справочнике`, 'тип из references/composite-types.md или type: project с why');
    if (T) {
      const kinds = asList(d.kinds);
      for (const k of kinds) if (!T.kinds.includes(k)) E('pat.type', comp.id, `вид «${k}» — у ${T.name} такого нет`, `виды: ${T.kinds.join(', ') || 'нет'}`);
      if (d.type === 'dialog') for (const x of instances.filter((y) => y.tree)) if (kinds.length === 1 && kinds[0] === 'confirm' && x.tree.parts.field > 0) E('pat.type', comp.id, `${x.file}:${x.line} — в подтверждении есть поля`, 'это окно с формой: вид form');
    }
    if (d.type === 'project') {
      if (!d.why) E('pat.project-type', comp.id, 'тип проекта без why', 'одна фраза: почему ни один тип справочника не подходит');
      else I('pat.project-type', comp.id, `тип проекта: ${d.name}`, 'кандидат в справочник составных');
    }
    const expected = d.type === 'project' ? null : nameFor(d.type, asList(d.kinds), d.entity || null);
    if (expected && d.name !== expected) E('pat.name', comp.id, `название «${d.name}», а по шаблону — «${expected}»`, 'вид + сущность + тип; сущность — из кода');
    if (!expected && !d.name) E('pat.name', comp.id, 'нет названия', 'название по сути блока, по-английски');
    // One block drawn twice in one component (a grid and a carousel) is one instance.
    const meaning = new Set(instances.map((x) => (x.tree && x.decl ? `${x.file}#${x.decl}#${x.tree.signature}` : `${x.file}:${x.line}`))).size;
    if (meaning < 2) E('pat.threshold', comp.id, `экземпляров по смыслу ${meaning}${meaning < instances.length ? ` (из ${instances.length}: один блок нарисован дважды в одном компоненте)` : ''} — это не закономерность`, 'больше одного места по смыслу; одно — отклони кандидата («один экземпляр»)');
    for (const a of asList(d.added)) {
      const m = /^(.+?):(\d+)\s+—\s+.+$/.exec(a);
      if (!m) { E('pat.added', comp.id, `added: «${a}» не по формату`, '«файл:строка — признак»'); continue; }
      const tree = (inventory.react?.trees || []).find((t) => t.file === m[1] && t.line === Number(m[2]));
      if (!fs.existsSync(path.join(root, m[1])) || !tree) E('pat.added', comp.id, `added: в ${m[1]}:${m[2]} нет блока разметки`, 'строка, где начинается разметка блока');
      const cand = state.candidates.find((c) => c.file === m[1] && c.line === Number(m[2]));
      if (cand) E('pat.added', comp.id, `added: ${m[1]}:${m[2]} — уже кандидат ${cand.id}`, `возьми его в candidates:, а из added: убери — иначе место считается дважды`);
    }
    if (T) for (const x of instances) {
      const slots = slotsOf(d.type, x.tree, inventory.react?.trees);
      if (!slots) continue;
      const missing = T.slots.filter(([s, req]) => req && !slots[s]).map(([s]) => SLOT_RU[s] || s);
      if (missing.length) E('pat.slots', comp.id, `${x.file}:${x.line} — нет обязательного: ${missing.join(', ')}`, 'это не экземпляр типа: отклони кандидата или перенеси в составное другого типа');
    }
    const secs = sectionsOf(comp.text);
    if (secs.map((s) => s.title).join('|') !== PAT_SECTIONS.join('|')) E('pat.sections', comp.id, `разделы: ${secs.map((s) => s.title).join(', ') || 'нет'}`, `ровно эти: ${PAT_SECTIONS.join(', ')}`);
    for (const s of secs.filter((x) => PAT_AGENT.includes(x.title))) if (/\bTODO\b/.test(s.text)) E('pat.sections', comp.id, `в «${s.title}» осталось TODO`, 'допиши по экземплярам');
    // The agent's prose by the same rules as a guideline's (gl.when-use, gl.when-not, gl.no-classes).
    if (!secs.some((x) => PAT_AGENT.includes(x.title) && /\bTODO\b/.test(x.text))) {
      const files = new Set(instances.map((x) => x.file)).size;
      for (const p of proseProblems({ id: comp.id, data: {} }, { section: (t) => secs.find((x) => x.title === t)?.text ?? null, known, modifiers, components: [], lang: config.lang || 'ru', places: Math.min(2, files) })) E(p.rule, comp.id, p.msg, p.fix);
    }
    if (d.sourceHash && d.sourceHash !== patternHash(comp.text, instances)) W('gl.seal', comp.id, 'описание или код изменились после печати', `сверь и запечатай заново: --seal ${comp.id}`);
    if (!d.sourceHash) W('gl.seal', comp.id, 'составное не запечатано', `когда ошибок нет: --seal ${comp.id}`);
    const want = patternSections(comp, instances, { root, outDir, all, trees: inventory.react?.trees });
    for (const s of secs) if (s.title in want && norm(s.text) !== norm(want[s.title])) E('pat.sections', comp.id, `раздел «${s.title}» не совпадает с кодом`, 'node generate.mjs перепишет его');
  }
  I('pat.review', 'composites', `составных ${all.length}; кандидатов ${state.candidates.length}, не разобрано ${state.candidates.filter((c) => !owners.has(c.id) && !state.rejected.has(c.id)).length}; одиночных ${state.singles.length}`, `список — ${path.join(outDir, CANDIDATES_FILE)}`);
  return { state, all };
}

export function kitChecks({ root, outDir, inventory, config, specs, E, W, I, known, modifiers }) {
  const { kit } = kitOf(inventory, outDir);
  const byId = new Map(kit.atoms.map((a) => [a.id, a]));
  const atomsDir = compDir(outDir);
  const types = new Set(KIT_TYPES.map(([t]) => t));

  for (const a of kit.atoms) if (!specs.some((c) => c.id === a.id)) E('atom.sections', a.id, `в коде есть атом ${a.name}, а спеки нет`, 'node generate.mjs — напишет atoms/' + a.id + '.md');
  for (const id of orphanAtoms(outDir, kit)) W('atom.fields', id, 'спека атома, которого в коде больше нет', 'проверь, куда делись реализации; если атома нет — удали спеку');

  for (const c of specs) {
    const d = c.data;
    const a = byId.get(c.id);
    for (const k of Object.keys(d)) if (!ATOM_FIELDS.includes(k)) E('atom.fields', c.id, `поля «${k}» нет в формате спеки атома`, `поля: ${ATOM_FIELDS.join(', ')}`);
    for (const k of ATOM_REQUIRED) if (d[k] == null || d[k] === '' || (Array.isArray(d[k]) && !d[k].length)) E('atom.fields', c.id, `нет поля «${k}»`, `заполни ${k}`);
    if (d.type && !types.has(d.type)) E('atom.fields', c.id, `type «${d.type}» — не атом кита`, `типы атомов: ${[...types].join(', ')}`);
    // The type is the scripts': it is the atom's id.
    else if (d.type && types.has(c.id) && d.type !== c.id) E('atom.fields', c.id, `type «${d.type}», а атом — ${c.id}: тип решают скрипты`, `верни type: ${c.id}; если компонент — другой атом, это вопрос «к какому атому» в ${QUESTIONS_FILE}`);
    if (d.type && d.name !== typeName(d.type)) E('atom.fields', c.id, `название «${d.name}», а по справочнику — «${typeName(d.type)}»`, 'name — из справочника типов');
    if (c.id !== path.basename(c.file, '.md')) E('atom.fields', c.id, `id не совпадает с именем файла ${c.file}`, 'id — имя файла');
    if (/\bTODO\b/.test(String(d.job || ''))) E('atom.fields', c.id, 'в job осталось TODO', 'одна фраза с глагола: какую задачу решает');

    const secs = sectionsOf(c.text);
    const titles = secs.map((s) => s.title);
    if (titles.join('|') !== ATOM_SECTIONS.join('|')) E('atom.sections', c.id, `разделы: ${titles.join(', ') || 'нет'}`, `ровно эти и в этом порядке: ${ATOM_SECTIONS.join(', ')}`);
    for (const s of secs.filter((x) => ATOM_AGENT.includes(x.title))) if (/\bTODO\b/.test(s.text)) E('atom.sections', c.id, `в «${s.title}» осталось TODO`, 'допиши по местам в коде («Что заменяет»)');
    if (a) {
      const want = atomSections(a, { root, atomsDir, tokens: inventory.tokens || [] });
      for (const s of secs) {
        if (!(s.title in want) || norm(s.text) === norm(want[s.title])) continue;
        if (s.title === 'API') E('atom.no-invent', c.id, 'API не совпадает с кодом и ответами в questions.md', 'проп, значение или значение по умолчанию решают код и люди: ответь в questions.md и запусти node generate.mjs');
        else E('atom.sections', c.id, `раздел «${s.title}» не совпадает с кодом`, 'node generate.mjs перепишет его; руками правятся только «Когда использовать» и «Когда не использовать»');
      }
      if (d.kit && a.kit?.error) E('kit.implemented', c.id, `kit: ${d.kit} — ${a.kit.error}`, 'путь к файлу компонента кита от корня проекта; если в файле их несколько — <файл>#<Имя>');
      for (const p of kitDiff(a)) (p.warn ? W : E)('kit.implemented', c.id, p.msg, p.fix);
      const open = a.questions.filter((q) => q.status !== 'answered');
      if (open.length) W('kit.open', c.id, `открытых вопросов: ${open.length}${open.some((q) => q.status === 'stale') ? ` (из них код изменился: ${open.filter((q) => q.status === 'stale').length})` : ''}`, `ответы — в ${QUESTIONS_FILE}; пока вопросы открыты, спеку не запечатать`);
      if (d.sourceHash && d.sourceHash !== atomHash(c.text, a)) W('gl.seal', c.id, 'спека или код изменились после печати', `сверь спеку и запечатай заново: --seal ${c.id}`);
      if (!d.sourceHash) W('gl.seal', c.id, 'спека не запечатана', `когда ошибок и открытых вопросов нет: --seal ${c.id}`);
    }
    // The same rules as a guideline for job, intents and the two sections the agent writes.
    // Files the atom is used in (gl.when-use): calls, class uses, raw elements — not the
    // files that implement it.
    const own = new Set((a?.impls || []).filter((i) => i.kind === 'component').map((i) => i.file));
    const used = (a?.impls || []).flatMap((i) => (i.kind === 'raw' ? i.places.map((p) => p.file)
      : i.kind === 'class' ? (i.unit.usages || []).map((u) => u.file)
      : (inventory.react?.calls || []).filter((x) => x.component === i.key).map((x) => x.file)));
    const files = new Set(used.filter((f) => !own.has(f))).size;
    for (const p of proseProblems(c, { section: (t) => secs.find((s) => s.title === t)?.text ?? null, known, modifiers, components: specs, lang: config.lang || 'ru', places: Math.min(2, files) })) E(p.rule, c.id, p.msg, p.fix);
  }
  for (const p of answerProblems(readAnswers(path.join(outDir, QUESTIONS_FILE)))) E('ask.record', p.id, p.msg, p.fix);
  I('kit.open', 'kit', `атомов ${kit.atoms.length}; вопросов открыто ${kit.atoms.flatMap((a) => a.questions).filter((q) => q.status !== 'answered').length}; служебных классов ${kit.utilities.length}`, `вопросы и ответы — ${path.join(outDir, QUESTIONS_FILE)}`);
  return { kit, byId };
}
