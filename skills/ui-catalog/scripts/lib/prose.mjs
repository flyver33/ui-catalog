// Prose the agent writes, by template, with checks (M3.6, mode 3).
//
//   DRAFTS[type]        job draft (one sentence, starts with a verb), intents (synonyms of
//                       the type), similar types — look-alikes «Когда не использовать» names
//   proseProblems(c, ctx)   what check reports about job, intents and the prose sections
//
// `generate --facts` puts the drafts in when job or intents are still empty or TODO; the
// agent sharpens them from the real places. Text for people names no CSS classes: the
// gallery shows these sections, classes live in the sections written from code.

export const DRAFTS = {
  button: { job: 'Запустить действие на экране.', intents: ['действие', 'кнопка', 'нажать', 'отправить', 'подтвердить'], similar: ['link', 'icon-button', 'chip', 'nav-item'] },
  'icon-button': { job: 'Запустить действие одной иконкой, без подписи.', intents: ['кнопка-иконка', 'действие', 'закрыть', 'меню'], similar: ['button', 'icon'] },
  link: { job: 'Перейти на другую страницу или в раздел.', intents: ['ссылка', 'перейти', 'открыть страницу'], similar: ['button', 'nav-item'] },
  tag: { job: 'Показать короткое свойство объекта.', intents: ['метка', 'тег', 'свойство', 'ярлык'], similar: ['chip', 'badge'] },
  chip: { job: 'Выбрать, отфильтровать или раскрыть по нажатию на короткую метку.', intents: ['чип', 'фильтр', 'выбрать', 'ещё'], similar: ['tag', 'button'] },
  badge: { job: 'Показать статус или счётчик рядом с объектом.', intents: ['статус', 'счётчик', 'бейдж'], similar: ['tag'] },
  avatar: { job: 'Показать человека или аккаунт картинкой или инициалами.', intents: ['аватар', 'пользователь', 'профиль'], similar: [] },
  logo: { job: 'Показать знак продукта и вернуть на главную.', intents: ['логотип', 'бренд', 'на главную'], similar: [] },
  icon: { job: 'Показать пиктограмму рядом с текстом или вместо него.', intents: ['иконка', 'пиктограмма', 'значок'], similar: ['icon-button', 'logo'] },
  select: { job: 'Выбрать одно значение из списка.', intents: ['выбор', 'список', 'выпадающий список', 'фильтр'], similar: ['input', 'radio', 'autocomplete'] },
  autocomplete: { job: 'Найти и выбрать значения из большого списка, начав печатать.', intents: ['поиск', 'подсказки', 'выбрать несколько', 'автодополнение'], similar: ['select', 'input'] },
  input: { job: 'Ввести текст или число.', intents: ['поле', 'ввод', 'текст'], similar: ['select'] },
  checkbox: { job: 'Отметить один или несколько пунктов.', intents: ['флажок', 'отметить', 'несколько'], similar: ['switch', 'radio'] },
  radio: { job: 'Выбрать один вариант из нескольких видимых.', intents: ['выбор', 'один из', 'вариант'], similar: ['checkbox', 'select'] },
  switch: { job: 'Включить или выключить настройку сразу.', intents: ['переключатель', 'включить', 'выключить'], similar: ['checkbox'] },
  tab: { job: 'Переключить содержимое на одном экране.', intents: ['вкладка', 'переключить', 'раздел'], similar: ['nav-item', 'chip'] },
  'nav-item': { job: 'Перейти в раздел и показать, в каком ты сейчас.', intents: ['меню', 'навигация', 'раздел'], similar: ['tab', 'link'] },
  breadcrumb: { job: 'Показать путь до страницы и вернуться выше.', intents: ['путь', 'навигация', 'назад'], similar: ['nav-item'] },
  'list-item': { job: 'Показать один пункт списка и дать его выбрать.', intents: ['пункт', 'список', 'строка'], similar: ['nav-item'] },
  progress: { job: 'Показать, сколько уже сделано.', intents: ['прогресс', 'шаги', 'загрузка'], similar: ['spinner'] },
  spinner: { job: 'Показать, что идёт загрузка.', intents: ['загрузка', 'ожидание'], similar: ['progress'] },
  divider: { job: 'Разделить блоки линией.', intents: ['разделитель', 'линия'], similar: [] },
  dialog: { job: 'Попросить решение или данные в окне поверх страницы.', intents: ['окно', 'модалка', 'диалог', 'подтвердить'], similar: ['popover', 'bottom-sheet'] },
  'progress-dialog': { job: 'Показать долгую операцию в отдельном окне.', intents: ['ожидание', 'обработка', 'окно'], similar: ['dialog', 'progress'] },
  'bottom-sheet': { job: 'Показать действия или выбор в шторке снизу экрана.', intents: ['шторка', 'снизу', 'меню'], similar: ['dialog', 'popover'] },
  popover: { job: 'Показать выбор или действия рядом с элементом.', intents: ['всплывающее', 'меню', 'выбор'], similar: ['tooltip', 'dialog'] },
  tooltip: { job: 'Подсказать, что значит элемент, при наведении.', intents: ['подсказка', 'пояснение'], similar: ['popover'] },
  toast: { job: 'Сообщить о результате ненадолго и не мешая.', intents: ['уведомление', 'сообщение', 'тост'], similar: ['dialog'] },
};

const VERB_RU = /^[А-ЯЁA-Z][а-яёa-z-]*(ть|ти|чь)(ся)?(\s|,|$)/;
const MIN_USE = 2, MAX_USE = 5;
const PROSE = ['Когда использовать', 'Когда не использовать', 'Подводные камни'];
const ALT = /\]\([^)]+\.md\)|(в базе|в библиотеке)[^.]*нет|нет в (базе|библиотеке)|`<[a-z]+/i;

// CSS classes in text for people: library and page classes, `--modifier` shorthand,
// `.selector`. Code blocks and link targets do not count.
export function classesInText(text, known, modifiers) {
  const plain = String(text).replace(/```[\s\S]*?```/g, ' ').replace(/\]\([^)]*\)/g, ']').replace(/<!--[\s\S]*?-->/g, ' ');
  const out = new Set();
  for (const m of plain.matchAll(/(?<![\w/-])\.?(--?[\w-]+|[a-zA-Z][\w-]*(?:__|--)[\w-]+|[a-zA-Z][\w-]*-[\w-]+)/g)) {
    const t = m[1];
    if (known.has(t) || (t.startsWith('--') && modifiers.has(t))) out.add(t);
  }
  return [...out];
}

const bullets = (text) => String(text || '').split('\n').filter((l) => /^\s*[-*]\s/.test(l));

// ctx: { section(title) → text, known: Set of classes, modifiers: Set of `--x` shorthands,
//        components: [{ id, file, data }], lang, places: files the component is used in }
export function proseProblems(c, { section, known, modifiers, components, lang = 'ru', places = MIN_USE }) {
  const d = c.data || {};
  const out = [];
  const E = (rule, msg, fix) => out.push({ msg, fix, rule });
  const draft = DRAFTS[d.type];
  const job = String(d.job || '');
  if (job && !/TODO/.test(job)) {
    if (lang === 'ru' && !VERB_RU.test(job.trim())) E('gl.job', `job начинается не с глагола: «${job.slice(0, 50)}»`, `одна фраза с глагола в неопределённой форме${draft ? `; заготовка типа: «${draft.job}»` : ''}`);
    const cls = classesInText(job, known, modifiers);
    if (cls.length) E('gl.job', `в job класс ${cls.join(', ')}`, 'job — про задачу человека, без CSS');
  }
  const intents = (Array.isArray(d.intents) ? d.intents : []).map(String);
  if (draft && intents.length && !intents.some((w) => draft.intents.includes(w.toLowerCase()))) E('gl.intents', `intents без слов типа ${d.type}`, `добавь хотя бы одно: ${draft.intents.join(', ')} — по ним ui-compose находит компонент`);
  const dup = intents.filter((w, i) => intents.findIndex((x) => x.toLowerCase() === w.toLowerCase()) !== i);
  if (dup.length) E('gl.intents', `intents повторяются: ${[...new Set(dup)].join(', ')}`, 'каждое слово один раз');
  const icls = intents.filter((w) => known.has(w) || /--|__/.test(w));
  if (icls.length) E('gl.intents', `в intents классы: ${icls.join(', ')}`, 'слова задачи, не CSS');

  // As many situations as the code shows, at least one, two when it is used in two files.
  const minUse = Math.max(1, Math.min(MIN_USE, places));
  const use = bullets(section('Когда использовать'));
  if (section('Когда использовать') != null && (use.length < minUse || use.length > MAX_USE)) E('gl.when-use', `«Когда использовать»: пунктов ${use.length} — нужно ${minUse}–${MAX_USE}`, 'конкретные ситуации из мест в коде, по пункту на ситуацию');
  const notUse = section('Когда не использовать');
  for (const line of bullets(notUse)) if (!ALT.test(line)) E('gl.when-not', `«Когда не использовать»: пункт без альтернативы — «${line.trim().slice(0, 60)}»`, 'в каждом пункте ссылка на компонент взамен, нативный элемент (`<img>`) или «в базе нет» (это пробел)');
  // Look-alikes the library has must be named: a Tag points at the Chip next to it.
  for (const o of components) {
    if (o.id === c.id || !draft?.similar.includes(o.data?.type)) continue;
    const href = o.file.split("/").pop(); // guidelines link each other inside components/
    if (notUse != null && !String(notUse).includes(`](${href})`)) E('gl.when-not', `«Когда не использовать» молчит про ${o.data.name || o.id} (${o.data.type}) — похожий тип`, `пункт: в какой похожей ситуации нужен [${o.data.name || o.id}](${href}) вместо этого`);
  }
  for (const t of PROSE) {
    const cls = classesInText(section(t) || '', known, modifiers);
    if (cls.length) E('gl.no-classes', `в «${t}» классы: ${cls.join(', ')}`, 'текст для людей — без CSS: назови вид («Primary»), часть («текст тега») или элемент («кнопка в шапке»); классы — в разделах из кода');
  }
  // The language of the project's docs: most letters, code, links and markup aside.
  for (const t of ['job', ...PROSE, 'Как собрать']) {
    const text = t === 'job' ? job : section(t);
    if (!text || /\bTODO\b/.test(text)) continue;
    const plain = String(text).replace(/```[\s\S]*?```/g, ' ').replace(/`[^`]*`/g, ' ').replace(/\]\([^)]*\)/g, ']').replace(/<[^>]+>/g, ' ');
    const cyr = (plain.match(/[а-яё]/gi) || []).length, lat = (plain.match(/[a-z]/gi) || []).length;
    if (cyr + lat < 12) continue;
    if (lang === 'ru' ? cyr < lat : cyr > lat) E('gl.lang', `${t === 'job' ? 'job' : `«${t}»`} не на языке проекта (${lang})`, lang === 'ru' ? 'проза — по-русски, как документация проекта' : `prose in the language of the project's docs (${lang})`);
  }
  return out;
}

// `counterpart` — the same component in another system, as that system names it:
// `Name` or `Name#prop` (`web-tag#notHover`, `g-btn`). No notes in brackets, no Russian,
// and not the component's own name again (that says nothing).
const COUNTERPART = /^[A-Za-z][\w.-]*( [\w.-]+)*(#[\w.-]+)?$/;
export function counterpartProblems(d) {
  const cp = d.counterpart == null ? '' : String(d.counterpart).trim();
  if (!cp) return [];
  const out = [];
  if (!COUNTERPART.test(cp)) out.push({ rule: 'gl.script-fields', msg: `counterpart «${cp}» не по формату`, fix: 'имя в другой системе, как оно там записано: «g-btn», «web-tag#notHover»; пояснения — в текст описания' });
  else if (cp.split('#')[0].toLowerCase() === String(d.name || '').toLowerCase() && !cp.includes('#')) out.push({ rule: 'gl.script-fields', msg: `counterpart «${cp}» повторяет название`, fix: 'убери counterpart: он для компонента в другой системе (кит, Figma), а не для названия по эталону' });
  return out;
}

// Drafts for a guideline whose job or intents are still empty: the agent sharpens them.
export function fillDrafts(data) {
  const draft = DRAFTS[data.type];
  if (!draft) return null;
  const out = {};
  if (!data.job || /TODO/.test(String(data.job))) out.job = draft.job;
  if (!Array.isArray(data.intents) || !data.intents.length) out.intents = draft.intents;
  return Object.keys(out).length ? out : null;
}
