// questions.md — the one place for questions about atoms and their answers. Scripts write the questions; people (or the agent, from the chat) fill
// «Ответ», «Кто ответил», «Дата»; scripts read answers only from here.
import { readText, writeText } from './fsutil.mjs';

export const QUESTIONS_FILE = 'questions.md';
const FIELD = (name) => new RegExp(`^- \\*\\*${name}:\\*\\* ?(.*)$`, 'm');

// id → { answer, who, date, factsHash, status, options }
export function readAnswers(file) {
  const text = readText(file, '') || '';
  const out = new Map();
  for (const block of text.split(/^### /m).slice(1)) {
    const id = block.split('\n')[0].trim();
    const get = (n) => (FIELD(n).exec(block)?.[1] || '').trim();
    out.set(id, {
      id, answer: get('Ответ'), who: get('Кто ответил'), date: get('Дата'), factsHash: get('factsHash'), previous: get('Прежний ответ').replace(/ — код изменился, ответь заново$/, ''),
      status: get('Статус'), options: get('Варианты').split(' · ').map((s) => s.trim()).filter(Boolean),
    });
  }
  return out;
}

export function writeQuestions(file, project, atoms) {
  const L = [`# Вопросы по атомам — ${project}`, ''];
  L.push('> Пишет `ui-catalog generate`: вопрос — там, где реализации в коде расходятся. Отвечают люди —', '> здесь или в чате (агент записывает ответ сюда). Заполни «Ответ» (один из вариантов или свой', '> текст), «Кто ответил» и «Дату» (ГГГГ-ММ-ДД); остальное перепишет скрипт. Если код поменяется,', '> вопрос станет `stale`: ответ останется для справки, но его нужно подтвердить заново.', '');
  const all = atoms.flatMap((a) => a.questions);
  const open = all.filter((q) => q.status !== 'answered').length;
  L.push(`Всего ${all.length}, открыто ${open}.`, '');
  for (const a of atoms) {
    if (!a.questions.length) continue;
    L.push(`## ${a.name}`, '');
    for (const q of a.questions) {
      L.push(`### ${q.id}`, '', `**Вопрос:** ${q.title}`, '');
      L.push(`- **Статус:** ${q.status}`);
      L.push(`- **Факты:** ${q.facts.join('; ')}`);
      L.push(`- **Варианты:** ${q.options.join(' · ')}`);
      L.push(`- **Рекомендация:** ${q.recommend} — ${q.why}`);
      if (q.previous) L.push(`- **Прежний ответ:** ${q.previous} — код изменился, ответь заново`);
      L.push(`- **Ответ:** ${q.answer}`);
      L.push(`- **Кто ответил:** ${q.who}`);
      L.push(`- **Дата:** ${q.date}`);
      L.push(`- **factsHash:** ${q.factsHash}`, '');
    }
  }
  writeText(file, L.join('\n'));
  return { total: all.length, open };
}

export function answerProblems(answers) {
  const out = [];
  for (const a of answers.values()) {
    if (!a.answer && !a.who && !a.date) continue;
    if (!a.answer) out.push({ id: a.id, msg: 'есть «Кто ответил» или «Дата», а ответа нет', fix: 'впиши ответ — один из вариантов или свой текст' });
    if (a.answer && !a.who) out.push({ id: a.id, msg: 'ответ без «Кто ответил»', fix: 'кто ответил: имя или роль (разработчик, дизайнер)' });
    // Only people answer (ask.no-guess): an answer signed by an AI is no answer.
    else if (a.answer && /(^|[^\p{L}])(агент|ии|ассистент|нейросеть|ai|agent|assistant|claude|gpt|chatgpt|llm|copilot)($|[^\p{L}])/iu.test(a.who)) out.push({ id: a.id, msg: `ответ подписан ИИ («${a.who}»)`, fix: 'отвечают люди: оставь вопрос открытым, пока не ответит человек' });
    if (a.answer && !/^\d{4}-\d{2}-\d{2}$/.test(a.date)) out.push({ id: a.id, msg: `дата ответа «${a.date}» не ГГГГ-ММ-ДД`, fix: 'дата, когда ответили' });
  }
  return out;
}
