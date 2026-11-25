// questions.md — the one place for questions about atoms and their answers. Scripts write the
// questions; people (or the agent, from the chat) fill the answer of a block; scripts read
// answers only from here. Two parts — product and design, developers; in each
// one question per atom, its items numbered; decided items folded.
import path from 'node:path';
import { readText, writeText } from './fsutil.mjs';
import { familyMatcher } from './screens.mjs';
import { orderItems, TO_PRODUCT } from './review.mjs';

export const QUESTIONS_FILE = 'questions.md';
export const PARTS = [
  { key: 'product', title: 'Продукту и дизайну', note: 'Здесь то, что меняет вид или поведение для пользователя.' },
  { key: 'dev', title: 'Разработчикам', note: `Здесь то, как написан код. Если пункт на деле про продукт — ответь «<номер> — ${TO_PRODUCT}», он перейдёт в первую часть.` },
];
const FIELD = (name) => new RegExp(`^- \\*\\*${name}:\\*\\* ?(.*)$`, 'm');
const META = /<!--\s*(\{.*?\})\s*-->/;
const meta = (o) => `<!-- ${JSON.stringify(o)} -->`;
// The title the agent writes for a product item until it is written.
export const WORDS_TODO = 'TODO: что видит пользователь';

// The answer of a block: «по рекомендации», «по рекомендации, кроме: 2 — оставить; 5 — убрать»,
// or only some items: «2 — оставить; 3 — убрать». → { map: number → answer | 'recommend', error }.
export function parseBlockAnswer(text, numbers) {
  const t = String(text || '').trim().replace(/\.$/, '');
  if (!t) return { map: new Map(), error: null };
  const map = new Map();
  const m = /^по рекомендации\s*(?:[,;]\s*кроме\s*:?\s*(.*))?$/i.exec(t);
  if (m) for (const n of numbers) map.set(n, 'recommend');
  const rest = m ? m[1] || '' : t;
  const bad = [];
  for (const part of rest.split(/;\s*/).map((s) => s.trim()).filter(Boolean)) {
    const x = /^(\d+)\s*[—–-]\s*(.+)$/.exec(part);
    if (!x || !numbers.includes(+x[1])) { bad.push(part); continue; }
    map.set(+x[1], x[2].trim());
  }
  if (bad.length) return { map: new Map(), error: `в ответе не прочитать ${bad.map((b) => `«${b}»`).join(', ')} — нужен номер пункта из списка, тире и ответ` };
  return { map, error: null };
}

// id → { answer, who, date, factsHash, previous, status, options, to, words, block };
// `.problems` — answers that could not be read.
// A block «Код продукта»: open items (numbered) and decided ones (folded, all in the meta).
const CODE_OPTIONS = { product: ['исправить', 'оставить как есть', 'передать разработчикам'], dev: ['исправить', 'оставить как есть', 'передать продукту'] };
function readCodeBlock(block, blockId, get, out) {
  const part = blockId.split('.')[1] === 'product' ? 'product' : 'dev';
  for (const line of block.split('\n').filter((l) => /^- .*<!--\s*\{/.test(l))) {
    let o; try { o = JSON.parse(META.exec(line)[1]); } catch { continue; }
    if (o.id) out.code.push({ id: o.id, part, title: o.title || '', where: o.where || '', what: o.what || '', recommend: o.recommend || 'исправить', why: o.why || '', status: 'answered', answer: o.answer || '', who: o.who || '', date: o.date || '' });
  }
  const items = [];
  for (const chunk of block.split(/^(?=\d+\. )/m).slice(1)) {
    const num = +/^(\d+)\. /.exec(chunk)[1];
    let o = {}; try { o = JSON.parse(META.exec(chunk)?.[1] || '{}'); } catch {}
    const field = (n) => (new RegExp(`^\\s+- ${n}: (.*)$`, 'm').exec(chunk)?.[1] || '').trim();
    const rec = field('Рекомендация');
    items.push({ num, id: o.id || '', part, title: chunk.split('\n')[0].replace(/^\d+\. /, '').trim(), where: field('Где'), what: field('Что не так'), recommend: (/^\*\*(.+?)\*\*/.exec(rec)?.[1] || 'исправить').trim(), why: rec.replace(/^\*\*.+?\*\*\s*(?:—\s*)?/, '').trim(), status: 'open', answer: '', who: '', date: '' });
  }
  const answer = get('Ответ'), who = get('Кто ответил'), date = get('Дата');
  const { map, error } = parseBlockAnswer(answer, items.map((x) => x.num));
  if (error) out.problems.push({ id: blockId, msg: error, fix: '«по рекомендации» или «2 — оставить как есть»' });
  if (answer && !error && !who) out.problems.push({ id: blockId, msg: 'ответ без «Кто ответил»', fix: 'кто ответил: имя или роль' });
  for (const x of items) {
    let a = map.get(x.num) || '';
    if (a === 'recommend') a = x.recommend;
    if (/передать продукту/i.test(a)) { x.part = 'product'; a = ''; }
    else if (/передать разработчикам/i.test(a)) { x.part = 'dev'; a = ''; }
    if (a && who) Object.assign(x, { status: 'answered', answer: a, who, date });
    out.code.push(x);
  }
}

// What check says about the items «Код продукта»: a title, a place that exists, what is wrong, one id each.
export function codeProblems(code, root, exists) {
  const out = [];
  const seen = new Set();
  for (const x of code || []) {
    const id = x.id || x.title || 'code';
    if (!/^code\.[\w-]+$/.test(x.id || '')) out.push({ id, msg: `пункт «${x.title}»: id не code.<слаг>`, fix: '<!-- {"id":"code.<слаг>"} --> под пунктом' });
    else if (seen.has(x.id)) out.push({ id, msg: `id ${x.id} — дважды`, fix: 'у каждого пункта свой id' });
    seen.add(x.id);
    if (x.status === 'answered') continue;
    if (!x.title) out.push({ id, msg: 'пункт без заголовка', fix: 'что не так — одной строкой после номера' });
    if (!x.what) out.push({ id, msg: 'нет «Что не так»', fix: '   - Что не так: …' });
    const places = [...String(x.where).matchAll(/([\w@./()[\]-]+\.\w+):(\d+)/g)].map((m) => m[1]);
    if (!places.length) out.push({ id, msg: `«Где: ${x.where}» без file:line`, fix: 'путь от корня проекта и строка: app/styles/reset.css:92' });
    for (const f of places) if (!exists(path.join(root, f))) out.push({ id, msg: `«Где»: файла ${f} в проекте нет`, fix: 'путь от корня проекта' });
  }
  return out;
}

export function readAnswers(file) {
  const text = readText(file, '') || '';
  const out = new Map();
  out.problems = [];
  out.code = [];
  for (const block of text.split(/^### /m).slice(1)) {
    const get = (n) => (FIELD(n).exec(block)?.[1] || '').trim();
    const head = block.split('\n')[0].trim();
    const blockId = /<!--\s*block:\s*([\w.-]+)\s*-->/.exec(block)?.[1];
    if (!blockId) {
      // The format before 2026-11-23: one block per question.
      out.set(head, {
        id: head, answer: get('Ответ'), who: get('Кто ответил'), date: get('Дата'), factsHash: get('factsHash'), previous: get('Прежний ответ').replace(/ — код изменился, ответь заново$/, ''),
        status: get('Статус'), options: get('Варианты').split(' · ').map((s) => s.trim()).filter(Boolean),
      });
      continue;
    }
    // «Код продукта»: the agent's items about the product's code, kept as written.
    if (blockId.startsWith('code.')) { readCodeBlock(block, blockId, get, out); continue; }
    // Decided items: one line each, what was decided in its meta.
    for (const line of block.split('\n').filter((l) => /^- .*<!--\s*\{/.test(l))) {
      let o; try { o = JSON.parse(META.exec(line)[1]); } catch { continue; }
      if (o.id) out.set(o.id, { id: o.id, answer: o.answer || '', who: o.who || '', date: o.date || '', factsHash: o.factsHash || '', previous: '', status: 'answered', options: [], to: o.to || '', words: o.words || '', block: blockId });
    }
    // Open items: numbered, each with its meta; the block's answer settles them.
    const items = [];
    for (const chunk of block.split(/^(?=\d+\. )/m).slice(1)) {
      const num = +/^(\d+)\. /.exec(chunk)[1];
      const title = chunk.split('\n')[0].replace(/^\d+\. /, '').trim();
      let o = {}; try { o = JSON.parse(META.exec(chunk)?.[1] || '{}'); } catch {}
      if (!o.id) continue;
      const field = (n) => (new RegExp(`^\\s+- ${n}: (.*)$`, 'm').exec(chunk)?.[1] || '').trim();
      // A title other than the one the script wrote is people's (or the agent's) words.
      const words = !title || title.startsWith(WORDS_TODO) || ('title' in o && title === o.title) ? '' : title;
      items.push({ num, id: o.id, factsHash: o.factsHash || '', to: o.to || '', words, recommend: (/^\*\*(.+?)\*\*/.exec(field('Рекомендация'))?.[1] || '').trim(), previous: field('Прежний ответ').replace(/ — код изменился, ответь заново$/, '') });
    }
    const answer = get('Ответ'), who = get('Кто ответил'), date = get('Дата');
    const { map, error } = parseBlockAnswer(answer, items.map((x) => x.num));
    if (error) out.problems.push({ id: blockId, msg: error, fix: '«по рекомендации», «по рекомендации, кроме: 2 — оставить» или «2 — оставить; 3 — убрать»' });
    if (answer && !error) {
      if (!who) out.problems.push({ id: blockId, msg: 'ответ без «Кто ответил»', fix: 'кто ответил: имя или роль (разработчик, дизайнер)' });
      else if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) out.problems.push({ id: blockId, msg: `дата ответа «${date}» не ГГГГ-ММ-ДД`, fix: 'дата, когда ответили' });
    }
    for (const x of items) {
      let a = map.get(x.num) || '';
      if (a === 'recommend') a = x.recommend;
      const toProduct = /передать продукту/i.test(a);
      const to = toProduct ? 'product' : x.to;
      if (toProduct || !who) a = '';
      out.set(x.id, { id: x.id, answer: a, who: a ? who : '', date: a ? date : '', factsHash: x.factsHash, previous: x.previous, status: a ? 'answered' : 'open', options: [], to, words: x.words, block: blockId });
    }
  }
  return out;
}

// Where an item is: families of screens and places — product reads this, not files.
function whereOf(q, fam) {
  const byFam = new Map();
  for (const f of q.files || []) { const n = fam(f) || 'вне семей'; byFam.set(n, (byFam.get(n) || 0) + 1); }
  const list = [...byFam].sort((x, y) => y[1] - x[1]).map(([n, c]) => `${n} (файлов ${c})`).join(', ');
  const n = q.places != null ? `мест ${q.places}` : '';
  return [n, list].filter(Boolean).join(' — ') || '—';
}

const bare = (s) => String(s).replace(/ \(.*\)$/, '');
// What an item is called in its part: product reads what the user sees.
export function itemTitle(q) {
  if (q.audience !== 'product') return q.title;
  if (q.human) return q.human;
  if (q.kind === 'prop') return `${WORDS_TODO} — \`${q.prop}\``;
  if (q.kind === 'impl') return `${WORDS_TODO} — \`${bare(q.impl)}\``;
  return q.title;
}

// The items of an atom for one part: open ones in reading order, then decided.
export function partItems(a, part) {
  const mine = a.questions.filter((q) => (q.audience || 'dev') === part);
  return { open: orderItems(mine.filter((q) => q.status !== 'answered')), done: mine.filter((q) => q.status === 'answered') };
}
const anchor = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-');
export const partLink = (key, prefix = '') => { const p = PARTS.find((x) => x.key === key); return `[${p.title}](${prefix}questions.md#${anchor(p.title)})`; };

// The block «Код продукта» of a part: open items numbered, answered ones folded.
function codeBlock(L, items, part) {
  const open = items.filter((x) => x.status !== 'answered');
  const done = items.filter((x) => x.status === 'answered');
  if (!open.length && !done.length) return;
  L.push('### Код продукта', '', `<!-- block: code.${part} -->`, '');
  if (open.length) {
    L.push('**Вопрос:** что из этого исправить?', '');
    open.forEach((x, n) => {
      L.push(`${n + 1}. ${x.title}`, `   - Где: ${x.where}`, `   - Что не так: ${x.what}`, `   - Рекомендация: **${x.recommend}**${x.why ? ` — ${x.why}` : ''}`, `   - Варианты: ${CODE_OPTIONS[part].join(' · ')}`, `   ${meta({ id: x.id })}`);
    });
    L.push('', '- **Ответ:** ', '- **Кто ответил:** ', '- **Дата:** ', '');
  }
  if (done.length) {
    L.push(`Решено: ${done.length}`, '');
    for (const x of done) L.push(`- ${x.title} — ${x.answer} (${x.who || '—'}, ${x.date || '—'}) ${meta({ id: x.id, title: x.title, where: x.where, what: x.what, recommend: x.recommend, why: x.why, answer: x.answer, who: x.who, date: x.date })}`);
    L.push('');
  }
}

export function writeQuestions(file, project, atoms, { families = [], code = [] } = {}) {
  const fam = familyMatcher(families);
  const L = [`# Вопросы по атомам — ${project}`, ''];
  L.push(
    '> Пишет `ui-catalog generate`: что пришло из кода и ещё не решено — что из этого будет в ките.',
    '> Один вопрос на атом, пункты пронумерованы. Ответ — одной строкой: «по рекомендации»,',
    '> «по рекомендации, кроме: 2 — оставить в ките; 5 — убрать» или только часть пунктов: «2 — убрать».',
    '> Заполни «Ответ», «Кто ответил» и «Дату» (ГГГГ-ММ-ДД); остальное перепишет скрипт: решённые пункты',
    '> свернутся в «Решено», новые придут открытыми. Передумали — удалите строку в «Решено», пункт откроется снова.',
    '',
  );
  const sorted = [...atoms].sort((x, y) => (y.uses || 0) - (x.uses || 0));
  const codeOf = (key) => code.filter((x) => x.part === key);
  const counts = PARTS.map((p) => ({ p, open: sorted.reduce((n, a) => n + partItems(a, p.key).open.length, 0) + codeOf(p.key).filter((x) => x.status !== 'answered').length }));
  L.push(`Открыто: ${counts.map(({ p, open }) => `[${p.title.toLowerCase()}](#${anchor(p.title)}) — ${open}`).join(', ')}.`, '');
  let total = 0, open = 0;
  for (const { p } of counts) {
    L.push(`## ${p.title}`, '', `> ${p.note}`, '');
    let any = false;
    for (const a of sorted) {
      const { open: items, done } = partItems(a, p.key);
      if (!items.length && !done.length) continue;
      any = true;
      total += items.length + done.length;
      open += items.length;
      L.push(`### ${a.name}`, '', `<!-- block: ${a.id}.${p.key} -->`, '');
      if (items.length) {
        L.push(a.id === 'intro' ? '**Вопрос:** тот, кто запускал каталог, не знал ответа, и агент взял предположение — верно?'
          : a.id === 'basics' ? '**Вопрос:** какое значение взять для каждой роли? Оно станет одним на весь продукт и войдёт в кит. Ответ — значение шкалы: «2 — 32px».'
          : `**Вопрос:** что из этого оставить в ките «${a.name}»?`, '');
        items.forEach((q, n) => {
          const t = itemTitle(q);
          L.push(`${n + 1}. ${t}`);
          L.push(`   - Где: ${whereOf(q, fam)}`);
          if (q.flags?.length) L.push(`   - Пометки: ${q.flags.map((f) => `${f.mark} — ${f.why}`).join('; ')}`);
          L.push(`   - Рекомендация: **${q.recommend}** — ${q.why}`);
          L.push(`   - Варианты: ${[...q.options, ...(p.key === 'dev' && !['type', 'prop-name'].includes(q.kind) ? [TO_PRODUCT] : [])].join(' · ')}`);
          if (q.previous) L.push(`   - Прежний ответ: ${q.previous} — код изменился, ответь заново`);
          L.push(`   - ${p.key === 'product' ? 'Для разработчиков' : 'Факты'}: ${q.facts.join('; ')}`);
          L.push(`   ${meta({ id: q.id, factsHash: q.factsHash, ...(q.to ? { to: q.to } : {}), ...(q.wordsGiven ? {} : { title: t }) })}`);
        });
        L.push('', '- **Ответ:** ', '- **Кто ответил:** ', '- **Дата:** ', '');
      }
      if (done.length) {
        L.push(`Решено: ${done.length}`, '');
        for (const q of done) L.push(`- ${itemTitle(q)} — ${q.answer} (${q.who || '—'}, ${q.date || '—'}) ${meta({ id: q.id, factsHash: q.factsHash, answer: q.answer, who: q.who, date: q.date, ...(q.to ? { to: q.to } : {}), ...(q.wordsGiven ? { words: q.human } : {}) })}`);
        L.push('');
      }
    }
    const mine = codeOf(p.key);
    codeBlock(L, mine, p.key);
    total += mine.length;
    open += mine.filter((x) => x.status !== 'answered').length;
    if (!any && !mine.length) L.push('Вопросов нет.', '');
  }
  writeText(file, L.join('\n'));
  return { total, open, parts: Object.fromEntries(counts.map(({ p, open: o }) => [p.key, o])) };
}

export function answerProblems(answers) {
  const out = [...(answers.problems || [])];
  for (const a of answers.values()) {
    if (!a.answer && !a.who && !a.date) continue;
    // Only people answer: an answer signed by an AI is no answer.
    if (a.answer && /(^|[^\p{L}])(агент|ии|ассистент|нейросеть|ai|agent|assistant|claude|gpt|chatgpt|llm|copilot)($|[^\p{L}])/iu.test(a.who)) { out.push({ id: a.id, msg: `ответ подписан ИИ («${a.who}»)`, fix: 'отвечают люди: оставь вопрос открытым, пока не ответит человек' }); continue; }
    // A block's who and date are checked once, for the block (readAnswers).
    if (a.block) continue;
    if (!a.answer) out.push({ id: a.id, msg: 'есть «Кто ответил» или «Дата», а ответа нет', fix: 'впиши ответ — один из вариантов или свой текст' });
    if (a.answer && !a.who) out.push({ id: a.id, msg: 'ответ без «Кто ответил»', fix: 'кто ответил: имя или роль (разработчик, дизайнер)' });
    if (a.answer && !/^\d{4}-\d{2}-\d{2}$/.test(a.date)) out.push({ id: a.id, msg: `дата ответа «${a.date}» не ГГГГ-ММ-ДД`, fix: 'дата, когда ответили' });
  }
  return out;
}
