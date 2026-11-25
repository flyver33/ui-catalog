// The atom spec — atoms/<id>.md in kit mode (references/atoms.md). The scripts write
// «Что брать сегодня», «API», «Варианты и состояния», «Токены», «Доступность», «Что
// заменяет», «На проверке» from the kit model; the agent writes «Когда использовать»,
// «Когда не использовать», «Поведение», «Подводные камни», `job` and `intents`.
import path from 'node:path';
import { relPosix, mdHref } from './fsutil.mjs';
import { A11Y, axisRu, canonical, pascal } from './kit.mjs';
import { DRAFTS } from './prose.mjs';
import { stringifyFrontmatter } from './frontmatter.mjs';
import { tokenRoles } from './foundations.mjs';
import { todayOf, writtenAs, legacyOnly } from './screens.mjs';
import { legacyMatcher } from './intro.mjs';
import { partItems, PARTS } from './questions.mjs';
import { answerEffect } from './review.mjs';

export const ATOM_FIELDS = ['id', 'name', 'type', 'job', 'intents', 'kit', 'sourceHash'];
export const ATOM_REQUIRED = ['id', 'name', 'type', 'job', 'intents'];
export const ATOM_SECTIONS = ['Когда использовать', 'Когда не использовать', 'Что брать сегодня', 'Поведение', 'Подводные камни', 'API', 'На проверке', 'Варианты и состояния', 'Токены', 'Доступность', 'Что заменяет'];
export const ATOM_AGENT = ['Когда использовать', 'Когда не использовать', 'Поведение', 'Подводные камни'];
// The first sections are the card ui-compose reads (query.mjs get).
export const ATOM_CARD = ['Когда использовать', 'Когда не использовать', 'Что брать сегодня', 'Поведение', 'Подводные камни', 'Доступность'];
export const ATOM_GENERATED = ATOM_SECTIONS.filter((s) => !ATOM_AGENT.includes(s));
const NOTE = '<!-- Из кода и ответов в questions.md: ui-catalog generate. Руками не править. -->';
const code = (s) => '`' + s + '`';

// Where an item is asked (part, atom, number), or what people decided.
export function reviewMark(a, q) {
  if (!q) return '';
  if (q.status === 'answered') { const e = answerEffect(q.answer); return e?.drop ? `${e.to ? `заменить на «${e.to}»` : 'убрать'} — решено` : ''; }
  if (!q.flags?.length) return '';
  const n = partItems(a, q.audience).open.indexOf(q) + 1;
  return `${q.flags.map((x) => x.mark).join(', ')} — на проверке: ${PARTS.find((p) => p.key === q.audience).title}, ${a.name}, п. ${n}`;
}
const implItem = (a, i) => (a.review || []).find((q) => q.kind === 'impl' && q.implKey === i.key);
const propItem = (a, name) => (a.review || []).find((q) => q.kind === 'prop' && q.prop === name);

// «Что брать сегодня»: per family of screens the implementation its files use most.
export function todaySection(a, { families = [], inventory = {}, context = null } = {}) {
  const legacy = legacyMatcher({ context });
  const L = [NOTE, ''];
  if (a.kit?.comp) { L.push(`В ките: ${code(a.kit.comp.name)} — ${code(a.kit.comp.file)}.`); return L.join('\n'); }
  if (!families.length) { L.push('Семьи экранов не заданы (`families` в catalog.config.json) — по семьям не разложить.'); return L.join('\n'); }
  const rows = todayOf(a, families, inventory, legacy);
  // Families that take the same implementation share a line; how to write it, once.
  const groups = new Map();
  for (const r of rows.filter((x) => x.list.length)) {
    const top = r.list[0];
    const g = groups.get(top.i.key) || groups.set(top.i.key, { i: top.i, fams: [] }).get(top.i.key);
    g.fams.push({ r, top, rest: r.list.slice(1) });
  }
  for (const { i, fams } of groups.values()) {
    const where = fams.map(({ r, top }) => `**${r.family}** (${top.uses} из ${r.total})`).join(', ');
    const also = fams.flatMap(({ r, rest }) => rest.map((x) => { const m = reviewMark(a, implItem(a, x.i)); return `${code(x.i.name)} ×${x.uses} в «${r.family}»${m ? ` (${m})` : ''}`; }));
    const mark = reviewMark(a, implItem(a, i));
    L.push(`- ${where} — ${code(String(i.name).replace(/ \(.*\)$/, ''))}${i.wrapper ? ` (обёртка над ${a.name} — стоит как есть)` : ''}${mark ? ` — ${mark}` : ''}: ${code(writtenAs(i, inventory))}${also.length ? `; ещё ${also.join(', ')}` : ''}`);
    L.push(`  - ${writtenToday(i, a)}`);
  }
  for (const r of rows.filter((x) => !x.list.length)) L.push(`- **${r.family}** — нет — спроси разработчика.`);
  if (groups.size > 1) L.push('', 'Семьи берут разное — не смешивай их в одном блоке.');
  // Used only where the code is on its way out: it moves to the kit, it is never taken.
  const gone = legacyOnly(a, inventory, legacy);
  if (gone.length) L.push('', ...gone.map(({ i, why }) => `- ${code(String(i.name).replace(/ \(.*\)$/, ''))} — уходит: ${why}; в новом коде не брать.`));
  return L.join('\n');
}

// How an implementation is written today, as its code has it: a component's props from its
// types, a class family's classes by axis. Not the kit's API.
function writtenToday(i, a) {
  if (i.kind === 'class') {
    const byAxis = [];
    for (const [axis, values] of Object.entries(a.axes)) {
      const cls = [...values.values()].map((v) => ({ v, x: v.impls.get(i.key) })).filter((p) => p.x?.cls).map(({ v, x }) => `${code(x.cls)} — ${v.name}`);
      if (cls.length) byAxis.push(`${axisRu(axis)}: ${cls.join(', ')}`);
    }
    return byAxis.length ? `классы — ${byAxis.join('; ')}` : 'классов-значений нет: один вид';
  }
  const unused = new Set((a.unused?.props || []).filter((u) => u.impls.includes(i.name)).map((u) => u.prop));
  const props = (i.comp?.props || []).filter((p) => !['className', 'ref', 'key'].includes(p.name) && !(unused.has(p.name) && p.optional !== false));
  const byAs = props.some((p) => p.name === 'as');
  const one = (p) => {
    const fn = /=>|Handler|Function/.test(p.type || '');
    const body = p.values?.length ? `${p.name}: ${p.values.join(' | ')}` : p.type === 'boolean' || fn ? p.name : `${p.name}: ${p.type || '?'}`;
    const def = p.default != null && p.default !== '' && !fn && !(p.type === 'boolean' && p.default === 'false') ? ` = ${p.default}` : '';
    const mark = reviewMark(a, propItem(a, p.name));
    return code(body + def) + (!byAs && p.optional === false ? ' (обязателен)' : '') + (mark ? ` — ${mark}` : '');
  };
  const where = i.comp?.file ? ` — типы: ${code(`${i.comp.file}:${i.comp.line}`)}` : '';
  return `пропсы — ${props.slice(0, 12).map(one).join(' · ') || 'нет'}${props.length > 12 ? ` и ещё ${props.length - 12}` : ''}${byAs ? '; набор пропсов меняется с `as` — смотри типы' : ''}${where}`;
}

export function atomSections(a, { root, atomsDir, tokens = [], families = [], inventory = {}, context = null }) {
  const link = (file, line) => (file ? `[${file}:${line}](${mdHref(relPosix(atomsDir, path.join(root, file)))}#L${line})` : '—');
  const out = {};
  out['Что брать сегодня'] = todaySection(a, { families, inventory, context });

  // API
  {
    const L = [NOTE, '', '| Проп | Значения | По умолчанию | Откуда |', '|---|---|---|---|'];
    for (const p of a.api) {
      const values = p.values ? p.values.map((v) => code(v.token)).join(' · ') : p.bool ? '`true` · `false`' : '—';
      const from = p.kit ? 'есть в ките' : p.required ? 'нужен типу' : p.reviewed ? `решено оставить — ${p.from.join(', ')}` : [...new Set((p.values || []).flatMap((v) => v.from))].join(', ') || (p.from || []).join(', ');
      L.push(`| ${code(p.prop)} | ${values} | ${p.default ? code(p.default) : '—'} | ${from || '—'} |`);
    }
    const merged = a.api.flatMap((p) => p.merged || []);
    if (merged.length) L.push('', ...merged.map(([from, to]) => `- «${from}» слит с «${to}» (ответ в questions.md).`));
    const open = a.questions.filter((q) => q.status !== 'answered');
    if (open.length) L.push('', `Ещё не решено: ${open.length} — в «На проверке». Пока пункт не решён, в API его нет.`);
    out['API'] = L.join('\n');
  }

  // Варианты и состояния
  {
    const L = [NOTE, ''];
    const rows = [];
    for (const [axis, values] of Object.entries(a.axes)) for (const v of values.values()) {
      const inApi = a.api.some((p) => p.axis === axis && (p.values ? p.values.some((x) => x.name === v.name) : p.bool && p.boolValue === v.name));
      rows.push(`| ${axisRu(axis)} | ${v.name} | ${[...v.impls.values()].map((x) => x.impl.name).join(', ')} | ${v.uses} | ${inApi ? 'да' : 'нет'} |`);
    }
    if (rows.length) L.push('| Ось | Значение | Где есть | Мест | В API |', '|---|---|---|---|---|', ...rows, '');
    else L.push('Осей в коде нет: один вид.', '');
    L.push('Состояния, обязательные для типа:', '', '| Состояние | Есть в |', '|---|---|');
    for (const s of a.states) L.push(`| ${s.ru} | ${s.in.join(', ') || 'нигде — в ките нужно сделать'} |`);
    out['Варианты и состояния'] = L.join('\n');
  }

  // Токены
  {
    const byName = new Map(tokens.map((t) => [t.name, t]));
    const L = [NOTE, ''];
    if (!a.tokens.length) L.push('Реализации не используют токены: значения вписаны в CSS.');
    for (const n of a.tokens) {
      const t = byName.get(n);
      const roles = t ? tokenRoles(t).slice(0, 3).map((r) => r.role).join(', ') : '';
      L.push(`- ${code(n)}${t ? ` ${t.value}` : ''}${roles ? ` — ${roles}` : ''}`);
    }
    out['Токены'] = L.join('\n');
  }

  // Доступность
  // What the type needs, not what the code does today: where it does not, the pitfalls say.
  out['Доступность'] = [NOTE, '', 'Что нужно типу (WAI-ARIA) — требование к киту и к новому коду, не описание сегодняшних реализаций; где они этого не делают — «Подводные камни».', '', ...(A11Y[a.type] || ['Для этого типа в справочнике правил нет.']).map((x) => `- ${x}`)].join('\n');

  // Что заменяет
  {
    const L = [NOTE, '', '| Реализация | Где | Мест | Станет |', '|---|---|---|---|'];
    const target = `<${a.kit?.comp?.name || pascal(a.name)}>`;
    const valueOf = (axis, name) => {
      const p = a.api.find((x) => x.axis === axis);
      if (!p) return null;
      if (p.bool) return p.boolValue === name || (p.merged || []).some(([f, t]) => f === name && t === p.boolValue) ? code(p.prop) : null;
      const v = p.values?.find((x) => x.name === name);
      if (v) return code(`${p.prop}="${v.token}"`);
      const m = (p.merged || []).find(([f]) => f === name);
      if (m) return code(`${p.prop}="${canonical(m[1])}"`);
      return null;
    };
    for (const i of a.impls) {
      const kind = i.kit ? 'кит' : i.kind === 'component' ? (i.library ? 'компонент кита' : 'компонент') : i.kind === 'class' ? 'класс' : 'без класса';
      const where = i.kind === 'raw' ? `${i.places.length} мест, напр. ${i.places.slice(0, 2).map((p) => link(p.file, p.line)).join(', ')}` : link(i.file, i.line);
      const maps = [];
      for (const [axis, values] of Object.entries(a.axes)) for (const v of values.values()) {
        const x = v.impls.get(i.key);
        if (!x) continue;
        const from = i.kind === 'class' ? code(`.${x.cls}`) : code(x.bool ? x.prop : `${x.prop}="${x.token}"`);
        const to = valueOf(axis, v.name);
        const q = a.questions.find((qq) => qq.status !== 'answered' && qq.title.includes(`«${v.name}»`));
        if (from === to) continue; // the same prop and value: nothing to change
        maps.push(`${from} → ${to || (q ? `вопрос ${code(q.id)}` : 'убрать')}`);
      }
      L.push(`| ${code(i.name)} (${kind}) | ${where} | ${i.uses} | ${code(target)}${maps.length ? '; ' + maps.join(', ') : ''} |`);
    }
    if (a.wrappers.length) L.push('', `Строятся на атоме, не заменяются: ${a.wrappers.map((w) => code(w.name)).join(', ')}.`);
    const drops = (a.dropped || []).filter((d) => d.kind === 'prop');
    if (drops.length) L.push('', `Пропсы, которые решили убрать: ${drops.map((d) => `${code(d.name)} (${d.impls.map((n) => code(String(n).replace(/ \(.*\)$/, ''))).join(', ')}) → ${d.to ? code(d.to) : 'убрать'}`).join(', ')}.`);
    const un = a.unused || { props: [], impls: [] };
    if (un.props.length || un.impls.length) L.push('', `Не используется — убрать при переезде: ${[...un.impls.map((x) => code(x.impl)), ...un.props.map((x) => `${code(x.prop)} (${x.impls.map((n) => code(String(n).replace(/ \(.*\)$/, ''))).join(', ')})`)].join(', ')}.`);
    out['Что заменяет'] = L.join('\n');
  }

  // На проверке: what came from the code and is not decided, by part; what was decided to drop.
  {
    const L = [NOTE, ''];
    for (const p of PARTS) {
      const { open } = partItems(a, p.key);
      if (!open.length) continue;
      L.push(`${p.title} — [questions.md](../questions.md), «${a.name}»:`, '');
      open.forEach((q, n) => L.push(`${n + 1}. ${q.title}${q.status === 'stale' ? ' (код изменился — ответ подтвердить)' : ''}. Рекомендация: ${q.recommend}.`));
      L.push('');
    }
    const dropped = a.dropped || [];
    if (dropped.length) L.push(`Решено убрать — в новом коде не брать: ${dropped.map((d) => `${code(d.name)}${d.to ? ` → «${d.to}»` : ''}`).join(', ')}.`, '');
    if (L.length === 2) L.push('Нет: всё, что есть в коде, решено.');
    out['На проверке'] = L.join('\n').trimEnd();
  }
  return out;
}

const AGENT_TODO = {
  'Когда использовать': 'TODO: ситуации из мест в коде, где это правильный выбор.',
  'Когда не использовать': 'TODO: похожие ситуации, где нужен другой компонент, — и какой именно.',
  'Поведение': 'TODO: что происходит при нажатии, загрузке, выключении — как в коде сегодня.',
  'Подводные камни': 'TODO: что ломается, когда собирают с ним, и как этого избежать.',
};

// A new spec: front matter with the type's draft, the agent's sections as TODO.
export function newAtomFile(a, sections) {
  const draft = DRAFTS[a.type];
  const data = { id: a.id, name: a.name, type: a.type, job: draft?.job || 'TODO одна фраза: какую задачу интерфейса решает', intents: draft?.intents || [], kit: '' };
  const body = ATOM_SECTIONS.map((s) => `## ${s}\n\n${sections[s] ?? AGENT_TODO[s]}`).join('\n\n');
  return stringifyFrontmatter(data, ATOM_FIELDS.filter((k) => k in data)) + '\n' + body + '\n';
}

// The same file with the generated sections rewritten; the agent's sections and the front
// matter (`kit:` among it) are kept.
export function rewriteAtomFile(text, sections) {
  const head = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(text)?.[0] || '';
  const body = text.slice(head.length);
  const own = new Map();
  const parts = body.split(/^## /m).slice(1);
  for (const p of parts) { const nl = p.indexOf('\n'); own.set(p.slice(0, nl).trim(), p.slice(nl + 1).trim()); }
  const next = ATOM_SECTIONS.map((s) => `## ${s}\n\n${ATOM_GENERATED.includes(s) ? sections[s] : own.get(s) ?? AGENT_TODO[s]}`).join('\n\n');
  return head + '\n' + next + '\n';
}

export function sectionsOf(text) {
  const head = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(text)?.[0] || '';
  const out = [];
  for (const p of text.slice(head.length).split(/^## /m).slice(1)) { const nl = p.indexOf('\n'); out.push({ title: p.slice(0, nl).trim(), text: p.slice(nl + 1).trim() }); }
  return out;
}
