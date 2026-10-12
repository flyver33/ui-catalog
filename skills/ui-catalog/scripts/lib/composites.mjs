// Composites: patterns the product already has. The machine version of
// references/composite-types.md: on a mismatch this file is right.
import crypto from 'node:crypto';

const sha = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 6);

// Slots read the anatomy of a tree (`parts` of the react adapter): a slot is present when
// one of its parts is.
export const COMPOSITE_TYPES = {
  dialog: { name: 'Dialog', family: 'overlay', slots: [['title', true, ['heading']], ['body', true, ['text', 'field', 'list', 'content']], ['actions', false, ['action']], ['close', false, ['close']]],
    kinds: ['confirm', 'form', 'announce', 'info', 'picker', 'filters', 'auth', 'flow', 'survey'] },
  'bottom-sheet': { name: 'Bottom sheet', family: 'overlay', slots: [['body', true, ['text', 'field', 'list', 'content']], ['actions', false, ['action']]], kinds: [] },
  popover: { name: 'Popover', family: 'overlay', slots: [], kinds: [] },
  tooltip: { name: 'Tooltip', family: 'overlay', slots: [], kinds: [] },
  toast: { name: 'Toast', family: 'overlay', slots: [['text', true, ['text', 'heading']], ['action', false, ['action']], ['close', false, ['close']]], kinds: ['success', 'error', 'info'] },
  snippet: { name: 'Snippet', family: 'page', slots: [['media', false, ['media']], ['title', true, ['heading', 'text']], ['meta', false, ['text', 'list']], ['actions', false, ['action']]], kinds: [] },
  'list-item': { name: 'List item', family: 'page', slots: [['leading', false, ['media']], ['primary', true, ['text', 'heading']], ['trailing', false, ['action']]], kinds: [] },
  section: { name: 'Section', family: 'page', slots: [['title', true, ['heading']], ['body', true, ['text', 'list', 'field', 'media', 'content']], ['actions', false, ['action']]], kinds: [] },
  'page-header': { name: 'Page header', family: 'page', slots: [['title', true, ['heading']], ['meta', false, ['text']], ['actions', false, ['action']]], kinds: [] },
  'app-header': { name: 'App header', family: 'page', slots: [['logo', false, ['media']], ['nav', false, ['action', 'list']]], kinds: [] },
  'app-footer': { name: 'App footer', family: 'page', slots: [['links', true, ['action', 'list']]], kinds: [] },
  banner: { name: 'Banner', family: 'page', slots: [['text', true, ['text', 'heading']], ['action', false, ['action']], ['close', false, ['close']]], kinds: ['promo', 'status', 'info', 'warning'] },
  form: { name: 'Form', family: 'page', slots: [['fields', true, ['field']], ['actions', false, ['action']]], kinds: [] },
  filters: { name: 'Filters', family: 'page', slots: [['fields', true, ['field', 'action']]], kinds: [] },
  table: { name: 'Table', family: 'page', slots: [['rows', true, ['list']]], kinds: [] },
  'empty-state': { name: 'Empty state', family: 'state', slots: [['media', false, ['media']], ['title', true, ['heading', 'text']], ['text', false, ['text']], ['action', false, ['action']]], kinds: ['first-use', 'no-results', 'error'] },
  'loading-state': { name: 'Loading state', family: 'state', slots: [], kinds: [] },
  'error-state': { name: 'Error state', family: 'state', slots: [['title', true, ['heading', 'text']], ['retry', false, ['action']]], kinds: [] },
  'success-state': { name: 'Success state', family: 'state', slots: [['title', true, ['heading', 'text']], ['next', false, ['action']]], kinds: [] },
  'show-more': { name: 'Show more', family: 'small', slots: [['toggle', true, ['action', 'text']]], kinds: [] },
  'status-label': { name: 'Status label', family: 'small', slots: [['text', true, ['text']]], kinds: [] },
  'key-value': { name: 'Key–value list', family: 'small', slots: [['pairs', true, ['list', 'text']]], kinds: [] },
  'stat-tile': { name: 'Stat tile', family: 'small', slots: [['value', true, ['heading', 'text']]], kinds: [] },
  paywall: { name: 'Paywall', family: 'state', slots: [['text', true, ['text', 'heading']], ['action', true, ['action']]], kinds: [] },
  'copy-field': { name: 'Copy field', family: 'small', slots: [['action', true, ['action']]], kinds: [] },
  'sticky-actions': { name: 'Sticky actions', family: 'small', slots: [['actions', true, ['action']]], kinds: [] },
  'onboarding-hint': { name: 'Onboarding hint', family: 'small', slots: [['text', true, ['text', 'heading']]], kinds: [] },
  'social-links': { name: 'Social links', family: 'small', slots: [['links', true, ['action']]], kinds: [] },
};
export const COMMON_FALSE = ['страница или секция целиком', 'совпало имя, смысл другой', 'совпал текст, смысл другой', 'признак во вложенном компоненте'];
export const FALSE_POSITIVES = {
  popover: ['выпадающий список селекта'], toast: ['баннер без таймера'], section: ['нет повторяемой анатомии'],
  'empty-state': ['ошибка валидации поля'], 'loading-state': ['спиннер в кнопке'], 'success-state': ['тост об успехе'],
  'show-more': ['пагинация'], 'status-label': ['Tag без статуса'], 'sticky-actions': ['шапка'], 'onboarding-hint': ['анонс в окне'],
};
export const falseCases = (type) => [...(FALSE_POSITIVES[type] || []), ...COMMON_FALSE];
export const SLOT_RU = { title: 'заголовок', body: 'содержимое', actions: 'действия', action: 'действие', close: 'закрыть', text: 'текст', media: 'картинка или иконка', meta: 'подробности', leading: 'слева', primary: 'основной текст', trailing: 'справа', logo: 'логотип', nav: 'навигация', links: 'ссылки', fields: 'поля', rows: 'строки', retry: 'повторить', next: 'следующий шаг', toggle: 'переключатель', pairs: 'пары', value: 'значение' };
export const KIND_RU = { confirm: 'подтверждение', form: 'форма', announce: 'анонс', info: 'справка', picker: 'выбор из списка', filters: 'фильтры', auth: 'вход', flow: 'шаги', survey: 'опрос', 'first-use': 'ещё ничего нет', 'no-results': 'ничего не найдено', error: 'ошибка', success: 'успех', promo: 'промо', status: 'статус', warning: 'предупреждение' };
const KIND_EN = { confirm: 'Confirm', form: 'Form', announce: 'Announce', info: 'Info', picker: 'Picker', filters: 'Filters', auth: 'Auth', flow: 'Flow', survey: 'Survey' };

// ── signals ──────────────────────────────────────────────────────────
const EMPTY = /\.length\s*(===?|<=?)\s*[01]\b|!\s*[\w$.?\]\[]+\.length\b|\bisEmpty\b|\bnoResults?\b|\bnothingFound\b|\bempty\b/i;
const LOADING = /(?<!!)\b(isLoading|isPending|isFetching|loading|pending)\b/;
const ERROR = /(?<!!)\b(isError|hasError|error|failed|isFailed)\b/;
const SUCCESS = /(?<!!)\b(isSuccess|success|submitted|isSent|sent|isDone|done)\b/;
const PAYWALL = /\b(hasAccess|isPaid|isPro|limit|tariff|subscription|canUse)\w*/i;
const SOCIAL = /(^|\.)(github\.com|linkedin\.com|t\.me|telegram\.me|habr\.com|vk\.com|twitter\.com|x\.com|facebook\.com|instagram\.com)$/;
// A handler that copies into the clipboard: `navigator.clipboard`, `handleCopy`,
// `onCopy(value)`, `copyLink(…)` — not `copySearch` (a duplicate) or `onCopy` passed on.
const COPY = /clipboard|\b(?:handle|on)?[cC]opy(?:To[A-Z]\w*|Link|Text|Value|Url|Address|Code|Email|Phone)?\s*\(|\bhandleCopy(?:To[A-Z]\w*|Link|Text|Value|Url|Address|Code|Email|Phone)?\b/;
const textOf = (t) => (t.texts || []).map((x) => String(x.text || '').toLowerCase()).join(' | ');
const keysOf = (t) => (t.texts || []).map((x) => x.key || '').join(' ');

function emptyKind(t) {
  const s = textOf(t), k = keysOf(t);
  if (/не удалось|ошибк|попробуйте позже/.test(s) || /failed|error/i.test(k)) return 'error';
  // «Пока…», «ещё не…»: nothing yet; «не найдено», «смягчите критерии»: a search found nothing.
  if (/(^|\| )пока |ещё не|здесь пока|соберите|добавьте/.test(s)) return 'first-use';
  if (/не найден|ничего не найд|нет подходящ|не нашл|сбросить|смягчите|измените фильтр/.test(s) || /notfound|found|noresults|filter/i.test(k)) return 'no-results';
  return 'first-use';
}
function dialogKind(name, t) {
  const n = name || '';
  // Fields make a form, whatever the name says — unless the name is of a kind with fields.
  if (t?.parts?.field && !/Filter|Sort|Login|Register|Auth|SignIn|SignUp|Specialization|Picker|Choose|Survey|Nps|Feedback|Poll/.test(n)) return 'form';
  if (/Announce|Intro|Promo|WhatsNew/.test(n)) return 'announce';
  if (/Login|Register|Auth|SignIn|SignUp/.test(n)) return 'auth';
  if (/Filter|Sort/.test(n)) return 'filters';
  if (/Specialization|Picker|Choose/.test(n)) return 'picker';
  if (/Wizard|Steps?$|Stepper/.test(n)) return 'flow';
  if (/Survey|Nps|Feedback|Poll/.test(n)) return 'survey';
  if (/Confirm|Delete|Remove|Disconnect|Archive|Cancel|Leave|Prolong|Republish|Reject/.test(n)) return 'confirm';
  if (/Text|Faq|Instruction|Info|Help|Terms/.test(n)) return 'info';
  if (t?.parts?.field) return 'form';
  if (t && t.parts.action >= 2) return 'confirm';
  return 'info';
}
// The entity of a snippet: from the component's name (`VacancyCard` → vacancy) against the
// project's entities, else the collection the `.map` walks (`candidates.map` → candidate).
function entityOf(t, entities) {
  const words = String(t.decl || '').replace(/(Card|Item|Snippet|Tile|Row)$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  const hit = [...entities].sort((a, b) => b.length - a.length).find((e) => words.includes(e.replace(/-/g, ' ')) || words.replace(/ /g, '').includes(e.replace(/-/g, '')));
  if (hit) return hit;
  // `visibleCandidates` → candidate, `ADVANTAGES_DATA` → advantage.
  if (t.context?.of) return t.context.of.replace(/^(visible|filtered|sorted|all|my)(?=[A-Z])/, '').replace(/[_-]?(data|items|list)$/i, '').replace(/ies$/i, 'y').replace(/s$/i, '').replace(/_/g, '-').replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase() || null;
  // No entity of the project, no collection: the type's own group, not a word of the name.
  return null;
}

export function findCandidates(inventory) {
  const r = inventory.react || { trees: [], calls: [], components: [] };
  const entities = new Set(r.components.map((c) => /^entity:(.+)$/.exec(c.scope || '')?.[1]).filter(Boolean).map((e) => e.replace(/s$/, '').toLowerCase()));
  const out = new Map();
  const add = (type, t, signal, extra = {}) => {
    const key = `${type}|${t.file}|${t.line}`;
    if (out.has(key)) { out.get(key).signals.push(signal); return; }
    out.set(key, { id: `c-${sha(key)}`, type, file: t.file, line: t.line, decl: t.decl || null, signals: [signal], tree: t.signature ? t : null, ...extra });
  };
  // A component's own tree: the one it returns; else its first tree outside any condition.
  const firstRoot = new Map();
  const plain = (t) => !t.context || (!t.context.map && !t.context.cond && !t.context.early);
  for (const t of r.trees) if (plain(t) && t.context?.returned) { const k = `${t.file}#${t.decl}`; if (!firstRoot.has(k)) firstRoot.set(k, t); }
  for (const t of r.trees) if (plain(t)) { const k = `${t.file}#${t.decl}`; if (!firstRoot.has(k)) firstRoot.set(k, t); }
  for (const t of r.trees) {
    const ctx = t.context || {};
    const cond = `${ctx.early || ''} ${ctx.cond || ''}`.trim();
    const isRoot = firstRoot.get(`${t.file}#${t.decl}`) === t;
    const decl = t.decl || '';
    const s = textOf(t);
    // Overlays
    if (/^(Modal|Dialog)$/.test(t.root) || t.roles?.includes('dialog') || (isRoot && /(Modal|Dialog)$/.test(decl) && t.components.some((c) => /Modal|Dialog/.test(c)))) {
      add('dialog', t, /^(Modal|Dialog)$/.test(t.root) ? `корень — ${t.root}` : t.roles?.includes('dialog') ? 'role="dialog"' : `${decl} строит окно`, { kind: dialogKind(decl, t) });
      continue;
    }
    if (isRoot && /(Toast|Snackbar|Notification)s?$/.test(decl)) add('toast', t, `компонент ${decl}`, { kind: /error/i.test(s) ? 'error' : 'info' });
    // States of a screen: what renders under a condition.
    if (cond) {
      // `!state.error` says «no error»: negated terms do not count for loading, error, success.
      // In the `else` of a ternary the condition is false: what it negates holds there.
      const NEG = /!\s*\(?[\w$.?\[\]'"]+\)?/g;
      const elseBranch = ctx.branch === 'else';
      const positive = elseBranch ? (cond.match(NEG) || []).map((x) => x.replace(/^!\s*\(?|\)$/g, '')).join(' ') : cond.replace(NEG, ' ');
      const branchEmpty = elseBranch && /\.length\b/.test(ctx.cond || '') && !/!|===?\s*0|<\s*1/.test(ctx.cond || '');
      // An empty state may be one line of text («Пока ничего не подключено.») when it says so.
      const saysEmpty = /пока (нет|ничего|никого|пусто)|ничего не|не найден|нет (ни одного|активных|подходящ)|здесь пока|пусто/.test(s) || /empty|notfound|noresults|nothing/i.test(keysOf(t));
      if (((!elseBranch && EMPTY.test(cond)) || branchEmpty) &&!(t.parts?.list > 0) && (t.parts?.heading || t.parts?.text) && (t.size >= 2 || saysEmpty)) add('empty-state', t, `ветка «${(ctx.early || ctx.cond).slice(0, 60)}»${ctx.branch === 'else' ? ' (иначе)' : ''}`, { kind: emptyKind(t) });
      else if (LOADING.test(positive) && (t.components.some((c) => /Spinner|Loader|Skeleton/.test(c)) || /загрузк/.test(s))) add('loading-state', t, `ветка «${cond.slice(0, 60)}»`);
      else if (ERROR.test(positive) && (t.parts?.heading || t.parts?.action) && !(t.parts?.field)) add('error-state', t, `ветка «${cond.slice(0, 60)}»`);
      else if (SUCCESS.test(positive) && (t.parts?.heading || /спасибо|отправ|готово|успешно/.test(s))) add('success-state', t, `ветка «${cond.slice(0, 60)}»`);
      else if (PAYWALL.test(positive) && t.parts?.action && /тариф|оплат|подключ|купить|доступ/.test(s)) add('paywall', t, `ветка «${cond.slice(0, 60)}»`);
    }
    // Blocks of a page
    if (ctx.map && t.parts && t.parts.heading > 0 && (t.parts.media > 0 || t.parts.action > 0) && t.size >= 4) add('snippet', t, 'повторяется в .map: заголовок + картинка или действие', { entity: entityOf(t, entities) });
    else if (ctx.map && t.parts && !t.parts.heading && t.parts.text > 0 && t.size >= 2 && t.size <= 10) add('list-item', t, 'повторяется в .map: строка без заголовка');
    if (isRoot && /Card$/.test(decl) && t.parts?.heading + t.parts?.text > 0) add('snippet', t, `компонент ${decl}`, { entity: entityOf(t, entities) });
    if (isRoot && /Item$/.test(decl) && !/Menu|Nav/.test(decl)) add('list-item', t, `компонент ${decl}`);
    if (isRoot && /Section$/.test(decl) && t.parts?.heading) add('section', t, `компонент ${decl} с заголовком`);
    if (isRoot && (/^(App)?Header$/.test(decl) || (t.root === 'header' && t.parts?.media))) add('app-header', t, `${decl || 'header'}`);
    if (isRoot && (/^(App)?Footer$/.test(decl) || t.root === 'footer')) add('app-footer', t, `${decl || 'footer'}`);
    // A banner's class is on the block's root, not anywhere inside a page.
    const rootClasses = String(t.signature || '').split('[')[0].split('.').slice(1);
    if (isRoot && (/Banner$/.test(decl) || rootClasses.some((c) => /(^|-)banner($|-)/.test(c)))) add('banner', t, /Banner$/.test(decl) ? `компонент ${decl}` : 'класс banner', { kind: /telegram|tg|app|promo|mobile/i.test(decl) ? 'promo' : /status|payment/i.test(decl) ? 'status' : 'info' });
    if ((isRoot && /Form$/.test(decl) && t.parts?.field) || (t.root === 'form' && t.parts?.field)) add('form', t, t.root === 'form' ? '<form>' : `компонент ${decl}`);
    if (isRoot && /Filters?(Aside|Panel|Bar|Sidebar)?$/.test(decl) && !/Modal/.test(decl)) add('filters', t, `компонент ${decl}`);
    if (t.tags?.includes('table') && isRoot) add('table', t, '<table>');
    if (t.tags?.includes('dl')) add('key-value', t, '<dl>');
    if (isRoot && /Status(Label|Badge|Tag)?$/.test(decl)) add('status-label', t, `компонент ${decl}`);
    if (isRoot && /(Stat|Stats|Metric)(Tile|Card)?$/.test(decl)) add('stat-tile', t, `компонент ${decl}`);
    if (isRoot && /(Sticky|Floating)\w*(Actions|Bar|Button)?$/.test(decl)) add('sticky-actions', t, `компонент ${decl}`);
    if (isRoot && /(Intro|Onboarding|Coachmark|NewBadge)\w*$/.test(decl) && !/Modal/.test(decl)) add('onboarding-hint', t, `компонент ${decl}`);
    if ((t.links || []).filter((d) => SOCIAL.test(d)).length >= 2) add('social-links', t, `ссылки: ${(t.links || []).filter((d) => SOCIAL.test(d)).join(', ')}`);
    // A copy field is a small block whose action copies into the clipboard: a page with a
    // copy button, a handler passed on (`onCopy={onCopy}`), `copySearch` are not one.
    const copies = (t.handlers || []).some((h) => COPY.test(h.slice(h.indexOf('=') + 1)));
    if (t.size <= 10 && (copies || (/скопир/.test(s) && t.parts?.action))) add('copy-field', t, 'копирование в буфер');
    // «Ещё», «+3» as a whole text, not the start of a sentence or a phone number.
    const more = (t.texts || []).map((x) => String(x.text || '').trim().toLowerCase()).find((x) => /^(ещё( \d+)?|показать (все|ещё)|свернуть|развернуть|\+\d{1,3})$/.test(x));
    if (t.size <= 4 && t.parts?.action && more) add('show-more', t, `текст «${more}»`);
  }
  // Tooltips and popovers are used, not laid out: each place they are used is an instance.
  for (const c of r.calls) {
    const type = /(^|[^a-z])Tooltip$|^Hint$/.test(c.name) ? 'tooltip' : /Popover$/.test(c.name) ? 'popover' : null;
    if (type) add(type, { file: c.file, line: c.line, decl: null, signature: null }, `использован ${c.name}`);
  }
  return [...out.values()];
}

// Groups the scripts propose: a dialog per kind, a snippet per entity, any other per type.
export function groupOf(c) {
  if (c.type === 'dialog') return { id: `${c.kind}-dialog`, type: 'dialog', kinds: [c.kind], entity: null, name: `${KIND_EN[c.kind] || c.kind} dialog` };
  if (c.type === 'snippet' && !c.entity) return { id: 'snippet', type: 'snippet', kinds: [], entity: null, name: 'Snippet' };
  if (c.type === 'snippet') return { id: `${c.entity}-snippet`, type: 'snippet', kinds: [], entity: c.entity, name: `${c.entity[0].toUpperCase()}${c.entity.slice(1)} snippet` };
  return { id: c.type, type: c.type, kinds: [], entity: null, name: COMPOSITE_TYPES[c.type].name };
}
// pat.name: the name a composite of these type, kinds and entity has.
export function nameFor(type, kinds = [], entity = null) {
  const T = COMPOSITE_TYPES[type];
  if (!T) return null;
  if (type === 'dialog' && kinds.length === 1) return `${KIND_EN[kinds[0]] || kinds[0]} dialog`;
  if (entity) return `${entity[0].toUpperCase()}${entity.slice(1)} ${T.name.toLowerCase()}`;
  return T.name;
}

// The anatomy of each instance: which slots it has.
// A slot an instance lacks may be in the tree a project component inside it returns
// (`<Modal><DigestModal/></Modal>`), one level deep; `trees` — inventory.react.trees.
export function slotsOf(type, tree, trees = null) {
  const T = COMPOSITE_TYPES[type];
  if (!T || !tree?.parts) return null;
  const own = (key) => {
    const [file, name] = key.split('#');
    const mine = (trees || []).filter((t) => t.file === file && t.decl === name && !(t.context?.map || t.context?.cond || t.context?.early));
    return mine.find((t) => t.context?.returned) || mine[0] || null;
  };
  const inner = trees ? (tree.inner || []).map(own).filter(Boolean) : [];
  const has = (p) => tree.parts[p] > 0 || inner.some((t) => t.parts?.[p] > 0);
  return Object.fromEntries(T.slots.map(([slot, , parts]) => [slot, parts.some(has)]));
}
