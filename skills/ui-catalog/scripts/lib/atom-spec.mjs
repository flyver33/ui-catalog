// The atom spec — atoms/<id>.md in kit mode (references/atoms.md). The scripts write
// «API», «Варианты и состояния», «Токены», «Доступность», «Что заменяет», «Открытые
// вопросы» from the kit model; the agent writes «Когда использовать» and «Когда не
// использовать», `job` and `intents`.
import path from 'node:path';
import { relPosix, mdHref } from './fsutil.mjs';
import { A11Y, axisRu, canonical, pascal } from './kit.mjs';
import { DRAFTS } from './prose.mjs';
import { stringifyFrontmatter } from './frontmatter.mjs';
import { tokenRoles } from './foundations.mjs';

export const ATOM_FIELDS = ['id', 'name', 'type', 'job', 'intents', 'kit', 'sourceHash'];
export const ATOM_REQUIRED = ['id', 'name', 'type', 'job', 'intents'];
export const ATOM_SECTIONS = ['Когда использовать', 'Когда не использовать', 'API', 'Варианты и состояния', 'Токены', 'Доступность', 'Что заменяет', 'Открытые вопросы'];
export const ATOM_AGENT = ['Когда использовать', 'Когда не использовать'];
export const ATOM_GENERATED = ATOM_SECTIONS.filter((s) => !ATOM_AGENT.includes(s));
const NOTE = '<!-- Из кода и ответов в questions.md: ui-catalog generate. Руками не править. -->';
const code = (s) => '`' + s + '`';

export function atomSections(a, { root, atomsDir, tokens = [] }) {
  const link = (file, line) => (file ? `[${file}:${line}](${mdHref(relPosix(atomsDir, path.join(root, file)))}#L${line})` : '—');
  const out = {};

  // API
  {
    const L = [NOTE, '', '| Проп | Значения | По умолчанию | Откуда |', '|---|---|---|---|'];
    for (const p of a.api) {
      const values = p.values ? p.values.map((v) => code(v.token)).join(' · ') : p.bool ? '`true` · `false`' : '—';
      const from = p.kit ? 'есть в ките' : p.required ? 'нужен типу' : p.common ? `есть у ${p.from.join(', ')}` : [...new Set((p.values || []).flatMap((v) => v.from))].join(', ') || (p.from || []).join(', ');
      L.push(`| ${code(p.prop)} | ${values} | ${p.default ? code(p.default) : '—'} | ${from || '—'} |`);
    }
    const merged = a.api.flatMap((p) => p.merged || []);
    if (merged.length) L.push('', ...merged.map(([from, to]) => `- «${from}» слит с «${to}» (ответ в questions.md).`));
    const open = a.questions.filter((q) => q.status !== 'answered');
    if (open.length) L.push('', `Ещё не решено: ${open.length} — в «Открытые вопросы». Пока вопрос открыт, значения из него в API нет.`);
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
  out['Доступность'] = [NOTE, '', ...(A11Y[a.type] || ['Для этого типа в справочнике правил нет.']).map((x) => `- ${x}`)].join('\n');

  // Что заменяет
  {
    const L = [NOTE, '', '| Реализация | Где | Мест | Станет |', '|---|---|---|---|'];
    const target = `<${a.kit?.comp?.name || pascal(a.name)}>`;
    const valueOf = (axis, name) => {
      const p = a.api.find((x) => x.axis === axis);
      if (!p) return null;
      if (p.bool) return code(p.prop);
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
    out['Что заменяет'] = L.join('\n');
  }

  // Открытые вопросы
  {
    const open = a.questions.filter((q) => q.status !== 'answered');
    const L = [NOTE, ''];
    if (!open.length) L.push('Нет.');
    for (const q of open) L.push(`- ${code(q.id)}${q.status === 'stale' ? ' (код изменился — ответ подтвердить)' : ''} — ${q.title}. Рекомендация: ${q.recommend}. Ответ — в [questions.md](../questions.md).`);
    out['Открытые вопросы'] = L.join('\n');
  }
  return out;
}

// A new spec: front matter with the type's draft, the agent's sections as TODO.
export function newAtomFile(a, sections) {
  const draft = DRAFTS[a.type];
  const data = { id: a.id, name: a.name, type: a.type, job: draft?.job || 'TODO одна фраза: какую задачу интерфейса решает', intents: draft?.intents || [], kit: '' };
  const body = ATOM_SECTIONS.map((s) => `## ${s}\n\n${sections[s] ?? (s === 'Когда использовать' ? 'TODO: ситуации из мест в коде, где это правильный выбор.' : 'TODO: похожие ситуации, где нужен другой компонент, — и какой именно.')}`).join('\n\n');
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
  const next = ATOM_SECTIONS.map((s) => `## ${s}\n\n${ATOM_GENERATED.includes(s) ? sections[s] : own.get(s) ?? 'TODO'}`).join('\n\n');
  return head + '\n' + next + '\n';
}

export function sectionsOf(text) {
  const head = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(text)?.[0] || '';
  const out = [];
  for (const p of text.slice(head.length).split(/^## /m).slice(1)) { const nl = p.indexOf('\n'); out.push({ title: p.slice(0, nl).trim(), text: p.slice(nl + 1).trim() }); }
  return out;
}
