// The React kit: atoms from every implementation in the code. Facts come
// from inventory.json (the react adapter and the html-css classes); people's answers from
// questions.md (lib/questions.mjs). Nothing here is decided by the agent.
import crypto from 'node:crypto';
import { TYPES, STATE_VOCAB } from './types.mjs';
import { AXES } from './variants.mjs';
import { parseColor, deltaE, over } from './color.mjs';

const sha = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 10);

// Atoms of the kit, in the order the spec lists them. Overlays are composites (2026-10-09).
// `names` — component names; `classes` — the root of a class family; `els` — the element
// a component's root (or a raw element) must be when the component is outside the kit.
export const KIT_TYPES = [
  ['icon-button', { names: /Icon(Button|Btn)$|CloseButton$/, classes: /(^|-)icon-?(btn|button)$/, els: ['button'] }],
  ['button', { names: /(Button|Btn)(Link)?$/, classes: /(^|-)(btn|button)$/, els: ['button', 'a'], raw: (e) => e.tag === 'button' }],
  ['form-field', { names: /^(Form)?Field$/, classes: /(^|-)(form-group|field)$/, els: ['div', 'label'] }],
  ['textarea', { names: /Text[aA]rea$/, classes: /(^|-)textarea$/, els: ['textarea'], raw: (e) => e.tag === 'textarea' }],
  // An input that suggests values as you type; its own <input> is its markup (`contains`).
  ['autocomplete', { names: /(Auto[cC]omplete(With\w+)?|Combobox)$/, classes: /(^|-)(autocomplete|combobox)$/, els: ['div', 'label', 'input'], contains: ['input'] }],
  ['select', { names: /(Select|Dropdown)$/, classes: /(^|-)(select|dropdown)$/, els: ['select', 'div', 'button'], raw: (e) => e.tag === 'select' }],
  ['checkbox', { names: /Checkbox$/, classes: /(^|-)checkbox$/, els: ['input', 'label'], raw: (e) => e.tag === 'input' && e.type === 'checkbox' }],
  ['radio', { names: /Radio(Button)?$/, classes: /(^|-)radio$/, els: ['input', 'label'], raw: (e) => e.tag === 'input' && e.type === 'radio' }],
  ['input', { names: /(^|Text)Input$|TextField$/, classes: /(^|-)input$/, els: ['input'], raw: (e) => e.tag === 'input' && !/^(checkbox|radio|hidden|submit|button|file|range)$/.test(String(e.type || '')) }],
  ['switch', { names: /(Switch|Switcher|Toggle)$/, classes: /(^|-)(switch|switcher|toggle)$/, els: ['button', 'input', 'label'] }],
  ['tab', { names: /(Tabs?|SegmentedControl)$/, classes: /(^|-)(tabs?|segmented)$/, els: ['div', 'ul', 'nav'] }],
  ['chip', { names: /(^|[a-z])Chip$/, classes: /(^|-)chips?$/, els: ['button', 'span'] }],
  ['tag', { names: /^Tag$/, classes: /(^|-)tag$/, els: ['span', 'li', 'div'] }],
  ['badge', { names: /Badge$/, classes: /(^|-)badge$/, els: ['span', 'div'] }],
  ['avatar', { names: /Avatar$/, classes: /(^|-)avatar$/, els: ['img', 'span', 'div'] }],
  ['spinner', { names: /(Spinner|Loader)$/, classes: /(^|-)(spinner|loader)$/, els: ['span', 'div', 'svg'] }],
  ['progress', { names: /Progress(Bar)?$/, classes: /(^|-)progress$/, els: ['div', 'progress'] }],
  ['pagination', { names: /(Pagination|Paginator)$/, classes: /(^|-)pagination$/, els: ['nav', 'ul', 'div'] }],
  ['breadcrumb', { names: /Breadcrumbs?$/, classes: /(^|-)breadcrumbs?$/, els: ['nav', 'ol', 'ul'] }],
  ['link', { names: /^(Link|TextLink|ExternalLink)$/, classes: /(^|-)link$/, els: ['a'], raw: (e) => e.tag === 'a' && !!e.href }],
  ['divider', { names: /^(Divider|Hr|Separator)$/, classes: /(^|-)(divider|hr|separator)$/, els: ['hr', 'div'] }],
];
const KIT = new Map(KIT_TYPES);
// Types the reference has no entry for yet: their names and states.
const EXTRA = {
  textarea: { name: 'Textarea', states: ['hover', 'focus-visible', 'disabled', 'invalid'] },
  'form-field': { name: 'Form field', states: ['invalid', 'disabled'] },
  pagination: { name: 'Pagination', states: ['hover', 'focus-visible', 'current', 'disabled'] },
};
export const typeName = (t) => TYPES[t]?.name || EXTRA[t]?.name || t;
const typeStates = (t) => TYPES[t]?.states || EXTRA[t]?.states || [];

// Props every kit atom of the type has, whatever the code does.
const TYPE_PROPS = {
  button: ['disabled', 'onClick', 'type'], 'icon-button': ['disabled', 'onClick', 'aria-label'], link: ['href'],
  input: ['value', 'onChange', 'disabled', 'placeholder'], textarea: ['value', 'onChange', 'disabled', 'placeholder'],
  select: ['value', 'onChange', 'options', 'disabled'], autocomplete: ['value', 'onChange', 'disabled', 'placeholder'], checkbox: ['checked', 'onChange', 'disabled', 'label'],
  radio: ['checked', 'onChange', 'disabled', 'label', 'name'], switch: ['checked', 'onChange', 'disabled'],
  tab: ['value', 'onChange', 'options'], 'form-field': ['label', 'hint', 'error', 'children'],
  pagination: ['page', 'total', 'onChange'],
};

// «Доступность» by type, from WAI-ARIA APG.
export const A11Y = {
  button: ['Роль — нативный `<button>`; как ссылка (`<a>`) — только если ведёт на страницу.', 'Enter и пробел нажимают.', 'Фокус с клавиатуры виден.', 'Недоступна — атрибут `disabled`, а не только цвет.'],
  'icon-button': ['Нативный `<button>` с `aria-label`: подписи текстом нет.', 'Enter и пробел нажимают; фокус виден.'],
  link: ['Нативный `<a href>`; Enter переходит.', 'Фокус виден; текст ссылки понятен без контекста.'],
  input: ['Подпись связана с полем (`<label for>` или `aria-label`).', 'Ошибка — `aria-invalid` и текст ошибки в `aria-describedby`.', 'Фокус виден.'],
  textarea: ['Подпись связана с полем.', 'Ошибка — `aria-invalid` и текст ошибки в `aria-describedby`.', 'Фокус виден.'],
  'form-field': ['Подпись — `<label for>` к полю.', 'Подсказка и ошибка — в `aria-describedby` поля; ошибка — `aria-invalid`.'],
  select: ['Роль combobox + listbox или нативный `<select>`.', 'Стрелки выбирают, Enter подтверждает, Esc закрывает.', 'Фокус виден.'],
  autocomplete: ['Поле — `role="combobox"` с `aria-autocomplete` и `aria-expanded`, список — `listbox` с `option`.', 'Подпись связана с полем; выбранные значения читаются вместе с ним.', 'Стрелки ходят по подсказкам, Enter выбирает, Esc закрывает список.', 'Фокус виден.'],
  checkbox: ['Нативный `<input type="checkbox">` или `role="checkbox"` с `aria-checked`.', 'Пробел переключает; подпись кликабельна.', 'Фокус виден.'],
  radio: ['Группа — `role="radiogroup"` или `<fieldset>`.', 'Стрелки переходят между вариантами, Tab — в группу и из неё.', 'Фокус виден.'],
  switch: ['`role="switch"` с `aria-checked` или чекбокс.', 'Пробел переключает; подпись говорит, что включается.'],
  tab: ['`role="tablist"`, `tab` с `aria-selected`, `tabpanel`.', 'Стрелки переходят между вкладками.'],
  tag: ['Не реагирует на нажатие и не получает фокус.'],
  chip: ['Нативный `<button>`; выбираемый — `aria-pressed`.', 'Enter и пробел нажимают; фокус виден.'],
  badge: ['Текст статуса читается вместе с объектом; цвет не единственный носитель смысла.'],
  avatar: ['Картинка — `alt` с именем; инициалы — текстом.'],
  spinner: ['`role="status"` или `aria-busy` на области, которая грузится.'],
  progress: ['`role="progressbar"` с `aria-valuenow`, `aria-valuemin`, `aria-valuemax`.'],
  pagination: ['`<nav aria-label>`; текущая страница — `aria-current="page"`.', 'Фокус виден.'],
  breadcrumb: ['`<nav aria-label="Хлебные крошки">`; текущая — `aria-current="page"`.'],
  divider: ['Декоративный — `aria-hidden`, смысловой — `role="separator"`.'],
};

// Prop names that carry an axis; `variant` and the like decide by their values.
const PROP_AXIS = { variant: null, kind: null, view: null, appearance: null, theme: null, color: 'tone', tone: 'tone', status: 'tone', size: 'size', fullWidth: 'width', block: 'width', wide: 'width', stretch: 'width', outline: 'style', outlined: 'style' };
const AXIS_PROP = { emphasis: 'variant', style: 'variant', tone: 'tone', size: 'size', width: 'fullWidth' };

// A value word → its axis and dictionary name; a word outside the dictionary keeps its name.
export function classifyValue(word, hint = null) {
  const w = String(word).toLowerCase();
  for (const [axis, values] of Object.entries(AXES)) {
    const v = values.find((x) => x.match.includes(w));
    if (v) return { axis, name: v.name };
  }
  return { axis: hint || 'emphasis', name: w.replace(/(^|-)(\w)/g, (m, d, c) => (d ? ' ' : '') + c.toUpperCase()) };
}
// A modifier suffix of a class family: `primary`, `lg`, `mobile-100` (width on phones).
function classifySuffix(suffix) {
  const parts = String(suffix).toLowerCase().split('-');
  const QUAL = { mobile: 'на телефоне', desktop: 'на десктопе', tablet: 'на планшете' };
  if (parts.length > 1 && QUAL[parts[0]]) {
    const v = classifyValue(parts.slice(1).join('-'));
    return { axis: v.axis, name: `${v.name} (${QUAL[parts[0]]})` };
  }
  return classifyValue(suffix);
}

// ── utilities and families of classes ───────────────────────────────

export function utilitiesOf(units) {
  const lib = units.filter((u) => u.library);
  const series = new Map();
  for (const u of lib) { const m = /^(.*?)-(?:[a-z]{2}-)?(\d+|auto|none|block|flex|inline|inline-block|grid|left|right|center|start|end|between)$/.exec(u.id); if (m) (series.get(m[1]) || series.set(m[1], []).get(m[1])).push(u.id); }
  const out = new Set();
  for (const u of lib) {
    const small = (u.rules || []).length > 0 && (u.rules || []).every((r) => (r.decls || []).length <= 2);
    const inSeries = [...series.values()].some((list) => list.length >= 3 && list.includes(u.id));
    if ((small && inSeries) || /^(row|col)(-|$)/.test(u.id)) out.add(u.id);
  }
  return out;
}

export function familiesOf(units, classSets, utilities) {
  const ids = new Set(units.map((u) => u.id));
  const parentOf = new Map();
  const total = new Map(), together = new Map();
  for (const s of classSets || []) {
    const cls = s.classes.split(' ');
    for (const c of cls) total.set(c, (total.get(c) || 0) + s.count);
    for (const c of cls) for (const b of cls) if (b !== c && c.startsWith(b + '-')) together.set(`${c}|${b}`, (together.get(`${c}|${b}`) || 0) + s.count);
  }
  for (const u of units) {
    if (utilities.has(u.id) || !u.id.includes('-')) continue;
    const parts = u.id.split('-');
    for (let k = parts.length - 1; k >= 1; k--) {
      const base = parts.slice(0, k).join('-');
      if (!ids.has(base) || utilities.has(base)) continue;
      const t = total.get(u.id) || 0;
      // Used with its base on most elements — or never seen apart (no uses yet): a modifier.
      if (t === 0 ? true : (together.get(`${u.id}|${base}`) || 0) / t >= 0.6) { parentOf.set(u.id, base); break; }
    }
  }
  return parentOf;
}

// ── the model ────────────────────────────────────────────────────────

export function kitModel(inventory, { answers = new Map(), tokens = null, kits = new Map() } = {}) {
  const r = inventory.react || { components: [], calls: [], raw: [], modules: [], classSets: [] };
  const units = inventory.units || [];
  const unitsById = new Map(units.map((u) => [u.id, u]));
  const utilities = utilitiesOf(units);
  const parentOf = familiesOf(units, r.classSets, utilities);
  const tokenValue = new Map((inventory.tokens || []).map((t) => [t.name, t.value]));
  const vars = { ...(inventory.vars || {}) };
  for (const [k, v] of tokenValue) vars[k] = v;
  const resolve = (v, d = 0) => (d > 8 ? v : String(v).replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)/g, (m, n, fb) => (n in vars ? resolve(vars[n], d + 1) : fb || m)));

  // Which type a thing is.
  const typeOfName = (name) => KIT_TYPES.find(([, s]) => s.names.test(name))?.[0] || null;
  const typeOfClass = (id) => KIT_TYPES.find(([, s]) => s.classes.test(id))?.[0] || null;
  const libraryComps = r.components.filter((c) => c.library);
  const compKey = (c) => `${c.file}#${c.name}`;

  const atoms = new Map();
  const atomOf = (type) => atoms.get(type) || atoms.set(type, { id: type, type, name: typeName(type), impls: [], wrappers: [] }).get(type);

  // Components: in the kit by name; elsewhere by name and the element they render.
  for (const c of r.components) {
    const type = typeOfName(c.name);
    if (!type) continue;
    const sign = KIT.get(type);
    // Built on a kit atom of the same type: a wrapper, not an implementation.
    const wrapsAtom = c.renders.some((n) => typeOfName(n) === type && libraryComps.some((k) => k.name === n && compKey(k) !== compKey(c)));
    if (wrapsAtom) { atomOf(type).wrappers.push({ name: c.name, file: c.file, line: c.line, uses: c.uses }); continue; }
    if (!c.library && !sign.els.includes(c.root)) continue;
    atomOf(type).impls.push({ kind: 'component', key: compKey(c), name: c.name, file: c.file, line: c.line, library: c.library, uses: c.uses, comp: c });
  }
  // `kit:` in a spec: the component the developers built is the reference implementation.
  for (const [id, ref] of kits) {
    if (!KIT.has(id)) continue;
    const a = atomOf(id);
    const res = resolveKitRef(ref, r.components, id);
    if (res.error) { a.kit = { ref, error: res.error }; continue; }
    const c = res.comp;
    let impl = a.impls.find((i) => i.key === compKey(c));
    if (!impl) {
      a.wrappers = a.wrappers.filter((w) => !(w.file === c.file && w.name === c.name));
      impl = { kind: 'component', key: compKey(c), name: c.name, file: c.file, line: c.line, library: c.library, uses: c.uses, comp: c };
      a.impls.unshift(impl);
    }
    impl.kit = true;
    a.kit = { ref, impl, comp: c };
  }
  // The name gives the type; a component whose own code has another atom's signs and none
  // of its own is a question to people. Until answered it stays where the name put it.
  const sameName = new Map();
  for (const c of r.components) sameName.set(c.name, (sameName.get(c.name) || 0) + 1);
  for (const a of [...atoms.values()]) for (const i of [...a.impls]) {
    if (i.kind !== 'component' || i.kit || !SIGNS[a.type]) continue;
    const f = ownFacts(i.comp, r);
    if (SIGNS[a.type](f)) continue;
    const others = Object.keys(SIGNS).filter((t) => t !== a.type && SIGNS[t](f));
    if (!others.length) continue;
    const q = {
      id: `type.${slug(i.comp.name)}${sameName.get(i.comp.name) > 1 ? `.${slug(i.file.split('/').slice(-2, -1)[0] || '')}` : ''}`, kind: 'type', impl: i.comp.name,
      title: `${i.comp.name}: к какому атому относится — по имени ${typeName(a.type)}, по коду ${others.map(typeName).join(' или ')}`,
      facts: [`\`${i.comp.name}\` ${i.file}:${i.line} — имя как у ${typeName(a.type)}, признаков ${typeName(a.type)} в коде нет`, ...others.map((t) => `признаки ${typeName(t)}: ${SIGNS[t](f)}`)],
      options: [...others.map((t) => `отнести к «${typeName(t)}»`), `оставить в «${typeName(a.type)}»`],
      recommend: `отнести к «${typeName(others[0])}»`, why: 'то, что компонент делает в коде, важнее имени',
    };
    const m = /^отнести к «(.+)»$/.exec(settle(q, answers) || '');
    const to = m ? others.find((t) => typeName(t) === m[1]) : null;
    const home = to ? atomOf(to) : a;
    if (to) { a.impls.splice(a.impls.indexOf(i), 1); home.impls.push(i); }
    (home.typeQuestions ||= []).push(q);
  }
  // Class families: library units typed by their root, not utilities, not modifiers of another.
  for (const u of units.filter((x) => x.library && !utilities.has(x.id) && !parentOf.has(x.id))) {
    const type = typeOfClass(u.id);
    if (!type) continue;
    const members = units.filter((x) => parentOf.get(x.id) === u.id);
    // The element the family sits on most (ui-compose writes it meanwhile).
    const tags = new Map();
    for (const e of r.raw) if (e.classes.includes(u.id)) tags.set(e.tag, (tags.get(e.tag) || 0) + 1);
    const tag = [...tags].sort((p, q) => q[1] - p[1])[0]?.[0] || KIT.get(type).els[0];
    atomOf(type).impls.push({ kind: 'class', key: `.${u.id}`, name: `.${u.id}`, file: u.defined[0]?.file, line: u.defined[0]?.line, library: true, uses: u.usageCount, unit: u, members, tag });
  }
  // Raw elements without a class of a typed family.
  const typedClasses = new Set();
  for (const a of atoms.values()) for (const i of a.impls.filter((x) => x.kind === 'class')) { typedClasses.add(i.unit.id); i.members.forEach((m) => typedClasses.add(m.id)); Object.keys(i.unit.modifiers).forEach((m) => typedClasses.add(m)); }
  for (const e of r.raw) {
    if (e.classes.some((c) => typedClasses.has(c))) continue;
    const type = KIT_TYPES.find(([, s]) => s.raw?.(e))?.[0];
    if (!type) continue;
    // Inside a component of the same type, or of a type that contains it, it is that component's own markup.
    const owners = [type, ...KIT_TYPES.filter(([, s]) => s.contains?.includes(type)).map(([t]) => t)];
    if (owners.some((t) => atoms.get(t)?.impls.some((i) => i.kind === 'component' && i.file === e.file))) continue;
    const a = atomOf(type);
    let raw = a.impls.find((i) => i.kind === 'raw');
    if (!raw) { raw = { kind: 'raw', key: `<${e.tag}>`, name: `<${e.tag}>`, uses: 0, places: [] }; a.impls.push(raw); }
    raw.uses++;
    raw.places.push({ file: e.file, line: e.line });
  }

  // A class family used only in the files of a component of the same atom is that
  // component's markup (`.loader` inside `Loader`), not an implementation of its own.
  for (const a of atoms.values()) {
    const own = new Set(a.impls.filter((i) => i.kind === 'component').map((i) => i.file));
    a.impls = a.impls.filter((i) => !(i.kind === 'class' && (i.unit.usages || []).length && i.unit.usages.every((u) => own.has(u.file))));
  }
  // Two implementations with one name (`Button` in shared/ui and in client-landing): the folder tells them apart.
  for (const a of atoms.values()) {
    const twins = new Set(a.impls.filter((i) => a.impls.some((o) => o !== i && o.name === i.name)));
    for (const i of twins) if (i.file) i.name = `${i.name} (${i.file.split('/').slice(0, -1).join('/')})`;
  }
  for (const a of atoms.values()) {
    a.axes = {};
    const add = (axis, name, impl, token, uses, extra = {}) => {
      const ax = a.axes[axis] || (a.axes[axis] = new Map());
      // A second class of one family on the same value (`--primary`, `--cta`): its own value,
      // so the checks below ask whether they are one.
      if (extra.cls && ax.get(name)?.impls.has(impl.key)) name = `${name} · ${token}`;
      const v = ax.get(name) || ax.set(name, { name, axis, impls: new Map(), uses: 0, tokens: new Map() }).get(name);
      v.impls.set(impl.key, { impl, token, uses, ...extra });
      v.uses += uses;
      v.tokens.set(token, (v.tokens.get(token) || 0) + uses);
    };
    for (const i of a.impls) {
      if (i.kind === 'component') {
        const calls = r.calls.filter((x) => x.component === i.key);
        for (const p of i.comp.props) {
          const hint = PROP_AXIS[p.name];
          if (hint === undefined) continue;
          const isBool = /^boolean\b/.test(p.type || '') || p.default === 'false' || p.default === 'true';
          if (isBool && hint) {
            const on = calls.filter((x) => x.props[p.name] === true || x.props[p.name] === '{true}').length;
            const v = hint === 'width' ? 'Full width' : hint === 'style' ? 'Outlined' : p.name;
            add(hint, v, i, `${p.name}`, on, { prop: p.name, bool: true });
            continue;
          }
          for (const val of p.values || []) {
            const cv = classifyValue(val, hint || undefined);
            const uses = calls.filter((x) => x.props[p.name] === val).length + (p.default === val ? calls.filter((x) => x.props[p.name] === undefined).length : 0);
            add(hint || cv.axis, cv.name, i, val, uses, { prop: p.name, isDefault: p.default === val });
          }
        }
      } else if (i.kind === 'class') {
        // BEM modifiers and one-dash family members; the class named as its value first
        // (`--primary` before `--cta`), then the most used.
        const mods = [
          ...Object.keys(i.unit.modifiers).map((m) => ({ cls: m, suffix: m.split('--').slice(1).join('--'), uses: i.unit.usages.filter((x) => x.classes.includes(m)).length, unit: null })),
          ...i.members.map((m) => ({ cls: m.id, suffix: m.id.slice(i.unit.id.length + 1), uses: m.usageCount, unit: m })),
        ].map((x) => ({ ...x, v: classifySuffix(x.suffix) }))
          .sort((x, y) => (slug(y.v.name) === y.suffix) - (slug(x.v.name) === x.suffix) || y.uses - x.uses || x.cls.localeCompare(y.cls));
        for (const x of mods) add(x.v.axis, x.v.name, i, x.suffix, x.uses, { cls: x.cls, unit: x.unit });
      }
    }
    a.uses = a.impls.reduce((n, i) => n + (i.uses || 0), 0);
  }

  for (const a of atoms.values()) {
    a.questions = (a.typeQuestions || []).map((q) => Object.assign(q, { atom: a.id }));
    a.api = [];
    a.kitRemoved = [];
    const kitKey = a.kit?.impl?.key;
    const kitHas = (v) => !!kitKey && v.impls.has(kitKey);
    // An answer (or a stale one) already given decides even over the kit.
    const decided = (id) => { const x = answers.get(id); return !!(x?.answer || x?.previous); };
    const ask = (q) => {
      q.atom = a.id;
      a.questions.push(q);
      return settle(q, answers);
    };
    const valueImpls = (v) => [...v.impls.values()].filter((x) => x.impl.kind !== 'raw');
    const where = (x) => (x.impl.kind === 'component' ? `\`${x.impl.name}\` ${x.prop}="${x.token}"` : `\`.${x.cls}\``) + ` — ${places(x.uses)}`;
    for (const [axis, values] of Object.entries(a.axes)) {
      const all = [...values.values()];
      const total = all.reduce((n, v) => n + v.uses, 0);
      const kept = [];
      const merged = new Map();
      // Two values of one family that look the same: merge? Asked before anything else
      // about them — the smaller of such a pair gets no other question.
      // A one-dash member has its own rules; a BEM modifier's are in its base's rules.
      const look = (x) => {
        const rules = x.unit ? x.unit.rules || [] : (x.impl.unit?.rules || []).filter((rr) => new RegExp(`\\.${x.cls.replace(/[-]/g, '\\-')}(?![\\w-])`).test(rr.selector));
        const decls = rules.filter((rr) => !/:(hover|active|focus)/.test(rr.selector)).flatMap((rr) => rr.decls || []);
        const get = (p) => { const d = decls.find((dd) => dd.prop === p || (p === 'background' && dd.prop === 'background-color')); return d ? parseColor(resolve(d.value).trim().split(/\s+/).find((t) => parseColor(t)) || '') : null; };
        return { bg: get('background'), fg: get('color') };
      };
      const settled = new Set();
      if (['emphasis', 'tone'].includes(axis)) for (let p = 0; p < all.length; p++) for (let q = p + 1; q < all.length; q++) {
        const A = all[p], B = all[q];
        const ca = [...A.impls.values()].find((x) => x.cls), cb = [...B.impls.values()].find((x) => x.cls);
        if (!ca || !cb || ca.impl.key !== cb.impl.key) continue;
        const la = look(ca), lb = look(cb);
        if (!la.bg || !lb.bg) continue;
        const white = [255, 255, 255, 1];
        const dBg = deltaE(over(la.bg, white), over(lb.bg, white));
        const dFg = la.fg && lb.fg ? deltaE(over(la.fg, white), over(lb.fg, white)) : 0;
        if (dBg >= 3 || dFg >= 3) continue;
        const [big, small] = A.uses >= B.uses ? [A, B] : [B, A];
        const answer = ask({
          id: `${a.id}.same-look.${slug(A.name)}.${slug(B.name)}`, kind: 'same-look',
          title: `${a.name}: «${A.name}» и «${B.name}» выглядят одинаково`,
          facts: [`\`.${ca.cls}\` и \`.${cb.cls}\`: фон ΔE ${dBg.toFixed(1)}, текст ΔE ${dFg.toFixed(1)} (меньше 3 — глаз не отличит)`],
          options: [`слить в «${A.name}»`, `слить в «${B.name}»`, 'оставить оба'],
          recommend: `слить в «${big.name}»`, why: `«${big.name}» — ${places(big.uses)}, «${small.name}» — ${places(small.uses)}`,
        });
        settled.add(small);
        const m = /^слить в «(.+)»$/.exec(answer || '');
        if (m) merged.set(m[1] === A.name ? B.name : A.name, m[1]);
        else if (answer) kept.push(small);
      }
      for (const v of all) {
        if (settled.has(v)) continue;
        const qid = `${a.id}.only-one.${axis}.${slug(v.name)}`;
        // The kit has it: the developers decided, unless people already answered.
        if (kitHas(v) && !decided(qid)) { kept.push(v); continue; }
        // Two implementations, or a quarter of the axis's uses: not a question.
        if (!kitHas(v) && (valueImpls(v).length >= 2 || v.uses >= total * 0.25)) { kept.push(v); continue; }
        // A value only one implementation has: keep, drop or merge — a question.
        const others = all.filter((o) => o !== v).map((o) => o.name);
        const keep = v.uses >= Math.max(5, total * 0.1);
        const answer = ask({
          id: qid, kind: 'only-one',
          title: `${a.name}: ${axisRu(axis)} «${v.name}» есть только у ${(valueImpls(v).find((x) => !x.impl.kit) || valueImpls(v)[0])?.impl.name || 'одной реализации'}`,
          facts: valueImpls(v).map(where),
          options: ['оставить в ките', 'убрать', ...others.map((o) => `слить с «${o}»`)],
          recommend: keep ? 'оставить в ките' : 'убрать',
          why: keep ? `${places(v.uses)} — не меньше 10% использований (${total})` : `${places(v.uses)} — меньше 10% использований (${total})`,
        });
        if (answer === 'оставить в ките' || (answer && !/^(убрать|слить)/.test(answer))) kept.push(v);
        const m = /^слить с «(.+)»$/.exec(answer || '');
        if (m) merged.set(v.name, m[1]);
      }
      const final = kept.filter((v) => !merged.has(v.name));
      // What the kit has and the answers took out: kit.implemented reports it.
      for (const v of all) if (kitHas(v) && !final.includes(v)) a.kitRemoved.push({ axis, name: v.name, q: a.questions.find((q) => q.title.includes(`«${v.name}»`)) || null });
      if (!final.length) continue;
      // Uses of merged values go to the value they merge into.
      const usesOf = (v) => v.uses + all.filter((o) => merged.get(o.name) === v.name).reduce((n, o) => n + o.uses, 0);
      // Prop name: as most components name it; two names — a question.
      const names = new Map();
      for (const v of all) for (const x of v.impls.values()) if (x.prop) names.set(x.prop, (names.get(x.prop) || 0) + x.uses);
      let prop = [...names].sort((x, y) => y[1] - x[1])[0]?.[0] || AXIS_PROP[axis] || axis;
      const kitProp = all.flatMap((v) => [...v.impls.values()]).find((x) => x.impl.kit && x.prop)?.prop || null;
      if (kitProp && !decided(`${a.id}.prop-name.${axis}`)) prop = kitProp;
      else if (names.size > 1 && !final.every((v) => [...v.impls.values()].every((x) => x.bool))) {
        const answer = ask({
          id: `${a.id}.prop-name.${axis}`, kind: 'prop-name',
          title: `${a.name}: ${axisRu(axis)} называется по-разному — ${[...names.keys()].map((n) => `\`${n}\``).join(', ')}`,
          facts: [...names].map(([n, u]) => `\`${n}\` — ${places(u)}`),
          options: [...names.keys()].map((n) => `назвать «${n}»`), recommend: `назвать «${prop}»`, why: 'так называют в большинстве мест',
        });
        const m = /^назвать «(.+)»$/.exec(answer || '');
        if (m) prop = m[1];
        if (kitProp && prop !== kitProp) a.kitRemoved.push({ prop: kitProp, axis, q: a.questions.find((q) => q.id === `${a.id}.prop-name.${axis}`) || null });
      }
      // Token of each value: the most used spelling.
      const tokenOf = (v) => canonical(v.name);
      const isBool = final.length === 1 && [...final[0].impls.values()].some((x) => x.bool || x.cls);
      // Default: the most used; without a majority — a question.
      let def = null;
      if (!isBool) {
        const ranked = [...final].sort((x, y) => usesOf(y) - usesOf(x));
        const sum = ranked.reduce((n, v) => n + usesOf(v), 0);
        def = ranked[0];
        const kitDef = final.find((v) => [...v.impls.values()].some((x) => x.impl.kit && x.isDefault));
        if (kitDef && !decided(`${a.id}.default.${axis}`)) def = kitDef;
        else if (ranked.length > 1 && usesOf(ranked[0]) < sum * 0.5) {
          const answer = ask({
            id: `${a.id}.default.${axis}`, kind: 'default',
            title: `${a.name}: у ${axisRu(axis)} нет значения, которое стоит в большинстве мест`,
            facts: ranked.map((v) => `«${v.name}» — ${places(usesOf(v))}`),
            options: ranked.map((v) => `по умолчанию «${v.name}»`), recommend: `по умолчанию «${ranked[0].name}»`, why: 'самое частое',
          });
          const m = /^по умолчанию «(.+)»$/.exec(answer || '');
          def = m ? final.find((v) => v.name === m[1]) || def : answer ? def : null;
        }
      }
      a.api.push({
        prop, axis, bool: isBool, boolValue: isBool ? final[0].name : null,
        from: isBool ? [...new Set([...final[0].impls.values()].map((x) => x.impl.name))] : undefined,
        values: isBool ? null : final.map((v) => ({ name: v.name, token: tokenOf(v), uses: usesOf(v), from: [...v.impls.values()].map((x) => x.impl.name) })),
        default: def ? tokenOf(def) : isBool ? 'false' : null,
        merged: [...merged],
      });
    }
    // Required props of the type, then props two or more components have.
    const comps = a.impls.filter((i) => i.kind === 'component');
    const have = new Set(a.api.map((p) => p.prop));
    for (const p of TYPE_PROPS[a.type] || []) if (!have.has(p)) { a.api.push({ prop: p, required: true, from: comps.filter((c) => c.comp.props.some((x) => x.name === p)).map((c) => c.name) }); have.add(p); }
    const count = new Map();
    for (const c of comps) for (const p of c.comp.props) if (!(p.name in PROP_AXIS) && p.name !== 'className' && p.name !== 'children') count.set(p.name, (count.get(p.name) || 0) + 1);
    for (const [p, n] of count) if (n >= 2 && !have.has(p)) { a.api.push({ prop: p, common: true, from: comps.filter((c) => c.comp.props.some((x) => x.name === p)).map((c) => c.name) }); have.add(p); }
    // The kit's own props: the developers built them.
    const renamed = new Set(a.kitRemoved.filter((x) => x.prop).map((x) => x.prop));
    if (a.kit?.comp) for (const p of a.kit.comp.props) {
      if (have.has(p.name) || renamed.has(p.name) || p.name in PROP_AXIS || OWN_PROPS.has(p.name)) continue;
      const isBool = /^boolean\b/.test(p.type || '');
      a.api.push({ prop: p.name, kit: true, bool: isBool, from: [a.kit.impl.name], values: !isBool && p.values ? p.values.map((v) => ({ name: v, token: v, uses: 0, from: [a.kit.impl.name] })) : null, default: p.default ?? null });
      have.add(p.name);
    }
  }

  // States: what the type needs; who has it.
  for (const a of atoms.values()) {
    a.states = typeStates(a.type).map((s) => ({
      state: s, ru: STATE_VOCAB[s] || s,
      in: a.impls.filter((i) => hasState(i, s, r)).map((i) => i.name),
    }));
    a.tokens = [...new Set(a.impls.flatMap((i) => tokensOf(i, r)))].sort();
  }
  const list = [...atoms.values()].filter((a) => a.impls.some((i) => i.kind !== 'raw'))
    .sort((x, y) => KIT_TYPES.findIndex(([t]) => t === x.type) - KIT_TYPES.findIndex(([t]) => t === y.type));
  for (const a of list) a.factsHash = sha(JSON.stringify({ impls: a.impls.map((i) => [i.key, i.uses]), api: a.api, states: a.states, q: a.questions.map((q) => [q.id, q.status, q.answer]) }));
  return { atoms: list, utilities: [...utilities].sort(), families: Object.fromEntries(parentOf) };
}

// What a value of an axis is in the API: { prop, token } (token null for a boolean prop),
// or null when the API has no such value (dropped, or a question still open).
export function apiTarget(a, axis, name) {
  const p = a.api.find((x) => x.axis === axis);
  if (!p) return null;
  if (p.bool) return { prop: p.prop, token: null };
  const v = p.values?.find((x) => x.name === name);
  if (v) return { prop: p.prop, token: v.token };
  const m = (p.merged || []).find(([f]) => f === name);
  return m ? { prop: p.prop, token: canonical(m[1]) } : null;
}

// A question against the answers in questions.md: its status, and the answer if there is one.
function settle(q, answers) {
  q.factsHash = sha(JSON.stringify(q.facts));
  const ans = answers.get(q.id);
  // The facts behind an answer changed: the answer moves to «Прежний ответ», the
  // question is open again as `stale` until someone answers it anew.
  if (ans?.answer && ans.factsHash && ans.factsHash !== q.factsHash) Object.assign(q, { status: 'stale', previous: `${ans.answer} (${ans.who || '—'}, ${ans.date || '—'})`, answer: '', who: '', date: '' });
  else if (ans?.answer) Object.assign(q, { status: 'answered', previous: '', answer: ans.answer, who: ans.who || '', date: ans.date || '' });
  else Object.assign(q, { status: ans?.previous ? 'stale' : 'open', previous: ans?.previous || '', answer: '', who: '', date: '' });
  return q.status === 'answered' ? q.answer : null;
}

// What a component's own code shows: its props, the roles and elements of its
// trees, the anatomy of the tree it returns.
function ownFacts(c, r) {
  const trees = (r.trees || []).filter((t) => t.file === c.file && t.decl === c.name);
  const plain = trees.filter((t) => !(t.context?.map || t.context?.cond || t.context?.early));
  const root = plain.find((t) => t.context?.returned) || plain[0] || trees[0];
  const value = c.props.find((p) => p.name === 'value');
  // A role counts on the root element only: a panel with tabs inside is not a tab.
  const raw = (r.raw || []).filter((e) => e.file === c.file);
  const rootRole = raw.find((e) => e.line === root?.line && e.role)?.role;
  return {
    props: new Set(c.props.map((p) => p.name)), roles: new Set([rootRole].filter(Boolean)),
    inputs: new Set(raw.filter((e) => e.tag === 'input').map((e) => String(e.type || ''))),
    tags: new Set(trees.flatMap((t) => t.tags || [])), root: c.root, parts: root?.parts || {}, boolValue: /^boolean\b/.test(value?.type || ''),
  };
}
// The signs of an atom in a component's own code: what was found, or null.
const has = (f, list) => list.filter((p) => f.props.has(p));
const roles = (f, list) => list.filter((x) => f.roles.has(x)).map((x) => `role="${x}"`);
const SIGNS = {
  radio: (f) => { const r = [...roles(f, ['radio', 'radiogroup']), ...(f.inputs.has('radio') ? ['<input type="radio">'] : [])]; if (r.length) return r.join(', '); const p = has(f, ['options', 'items']); return p.length && f.props.has('value') && f.props.has('onChange') && !f.boolValue && f.tags.has('button') ? `${p[0]} + value + onChange, варианты — кнопки` : null; },
  switch: (f) => { const s = [...roles(f, ['switch']), ...(f.boolValue ? ['value: boolean'] : [])]; return s.length ? s.join(', ') : null; },
  tab: (f) => { const s = [...roles(f, ['tab', 'tablist']), ...has(f, ['tabs', 'activeTab'])]; return s.length ? s.join(', ') : null; },
  select: (f) => { const s = [...roles(f, ['listbox', 'combobox', 'option']), ...(f.tags.has('select') ? ['<select>'] : []), ...has(f, ['open', 'isOpen', 'placeholder'])]; return s.length ? s.join(', ') : null; },
  'icon-button': (f) => (f.root === 'button' && !f.parts.text && f.parts.media > 0 && !has(f, ['children', 'text', 'label', 'title']).length ? '<button> с иконкой и без текста' : null),
  button: (f) => ((f.root === 'button' || f.root === 'a') && (f.parts.text > 0 || has(f, ['children', 'text', 'label']).length) ? `<${f.root}> с текстом` : null),
};

// Props of any React component, not of the atom.
const OWN_PROPS = new Set(['className', 'children', 'style', 'ref', 'key']);

// `kit:` — `<file>` or `<file>#<Name>`: a component in the code (kit.implemented).
export function resolveKitRef(ref, components, type) {
  const [raw, name] = String(ref).trim().split('#');
  const file = raw.replace(/\\/g, '/').replace(/^\.\//, '');
  const inFile = components.filter((c) => c.file === file);
  if (!inFile.length) return { error: `в ${file} нет компонентов — файла нет или в нём ничего не экспортируется` };
  const pick = name ? inFile.filter((c) => c.name === name) : inFile.filter((c) => KIT.get(type)?.names.test(c.name));
  if (pick.length === 1) return { comp: pick[0] };
  if (!pick.length) return { error: name ? `в ${file} нет компонента ${name} (есть: ${inFile.map((c) => c.name).join(', ')})` : `в ${file} нет компонента типа ${typeName(type)} (есть: ${inFile.map((c) => c.name).join(', ')})` };
  return { error: `в ${file} их несколько: ${pick.map((c) => c.name).join(', ')}` };
}

// Attributes a component takes from its element when its props extend the element's.
const NATIVE = {
  button: ['disabled', 'type', 'name', 'value', 'form'], a: ['href', 'target', 'rel', 'download'],
  input: ['value', 'onChange', 'disabled', 'placeholder', 'checked', 'name', 'type', 'readOnly', 'required'],
  textarea: ['value', 'onChange', 'disabled', 'placeholder', 'name', 'rows', 'readOnly', 'required'],
  select: ['value', 'onChange', 'disabled', 'name', 'multiple', 'required'], label: ['htmlFor'], img: ['src', 'alt'],
};
const GLOBAL_ATTRS = ['onClick', 'onChange', 'onFocus', 'onBlur', 'onKeyDown', 'id', 'title', 'role', 'tabIndex', 'style', 'className', 'children'];
const ATTR_EL = { Button: 'button', Anchor: 'a', Input: 'input', Textarea: 'textarea', TextArea: 'textarea', Select: 'select', Label: 'label', Img: 'img' };
export function nativeProps(comp) {
  const out = new Set();
  for (const e of comp.extends || []) {
    const m = /\b(?:React\.)?(?:(\w*)HTMLAttributes\b|ComponentProps(?:WithoutRef|WithRef)?\s*<\s*['"](\w+)['"]|JSX\.IntrinsicElements\s*\[\s*['"](\w+)['"])/.exec(e);
    if (!m) continue;
    GLOBAL_ATTRS.forEach((x) => out.add(x));
    out.add('aria-*');
    (NATIVE[m[2] || m[3] || ATTR_EL[m[1]]] || []).forEach((x) => out.add(x));
  }
  return out;
}

// What the kit component lacks or has against the API (kit.implemented): errors, and
// warnings where a question is still open or the values cannot be read.
export function kitDiff(a) {
  if (!a.kit?.comp) return [];
  const out = [];
  const comp = a.kit.comp;
  const props = new Map(comp.props.map((p) => [p.name, p]));
  const native = nativeProps(comp);
  const code = (s) => '`' + s + '`';
  for (const p of a.api) {
    const k = props.get(p.prop);
    if (!k) {
      if (native.has(p.prop) || (p.prop.startsWith('aria-') && native.has('aria-*'))) continue;
      out.push({ msg: `в ките нет пропа ${code(p.prop)}`, fix: `он в API спеки (${p.required ? 'нужен типу' : p.common ? `есть у ${p.from.join(', ')}` : 'из кода и ответов'}): добавь его в ${comp.name}` });
      continue;
    }
    if (p.values) {
      const lits = k.values;
      if (!lits) out.push({ warn: true, msg: `${code(p.prop)} в ките — ${k.type || 'без типа'}: значения не перечислены, сверить нельзя`, fix: `union литералов: ${p.values.map((v) => `'${v.token}'`).join(' | ')}` });
      else {
        for (const v of p.values) if (!lits.includes(v.token)) {
          const alias = lits.find((l) => !p.values.some((x) => x.token === l) && canonical(classifyValue(l, p.axis).name) === v.token);
          out.push({ msg: `у ${code(p.prop)} в ките нет ${code(v.token)}${alias ? ` — есть ${code(alias)}, на шкале это ${code(v.token)}` : ''}`, fix: alias ? `назови значение по спеке: '${v.token}'` : `значение в API спеки (${v.from.join(', ')}): добавь его` });
        }
        for (const l of lits) {
          if (p.values.some((v) => v.token === l)) continue;
          const name = classifyValue(l, p.axis).name;
          if (p.values.some((v) => v.token === canonical(name))) continue; // the same value off the scale: reported above
          const rm = a.kitRemoved.find((x) => x.axis === p.axis && x.name === name);
          if (rm?.q?.status === 'answered') out.push({ msg: `у ${code(p.prop)} в ките есть ${code(l)}, а ответ в questions.md — «${rm.q.answer}» (${rm.q.id})`, fix: 'убери значение из кита или поменяй ответ в questions.md' });
          else if (rm?.q) out.push({ warn: true, msg: `у ${code(p.prop)} в ките есть ${code(l)}, вопрос ${rm.q.id} открыт`, fix: 'ответ — в questions.md' });
          else out.push({ msg: `у ${code(p.prop)} в ките есть ${code(l)}, а в спеке нет`, fix: 'node generate.mjs перепишет спеку из кода' });
        }
      }
    }
    if (p.default && !p.bool && (k.default ?? null) !== p.default) out.push({ msg: `${code(p.prop)} по умолчанию в ките ${k.default ? code(k.default) : 'не задан'}, в спеке — ${code(p.default)}`, fix: `${p.prop} = '${p.default}'` });
  }
  for (const rm of a.kitRemoved.filter((x) => x.prop)) {
    const want = a.api.find((p) => p.axis === rm.axis)?.prop;
    out.push({ msg: `проп ${code(rm.prop)} в ките, а ответ в questions.md — ${want ? code(want) : `«${rm.q?.answer}»`}${rm.q ? ` (${rm.q.id})` : ''}`, fix: 'переименуй проп в ките или поменяй ответ' });
  }
  return out;
}

function hasState(impl, s, r) {
  const pseudo = new Set();
  if (impl.kind === 'class') { impl.unit.pseudo.forEach((p) => pseudo.add(p)); impl.members.forEach((m) => m.pseudo.forEach((p) => pseudo.add(p))); }
  if (impl.kind === 'component') for (const m of r.modules.filter((x) => x.importers.includes(impl.file))) Object.values(m.classes).forEach((c) => c.pseudo.forEach((p) => pseudo.add(p)));
  if (impl.kind === 'component' && s === 'disabled' && impl.comp.props.some((p) => p.name === 'disabled')) return true;
  if (s === 'focus-visible') return pseudo.has('focus-visible') || pseudo.has('focus');
  if (s === 'active') return pseudo.has('active');
  return pseudo.has(s);
}
function tokensOf(impl, r) {
  if (impl.kind === 'class') return [...impl.unit.tokens, ...impl.members.flatMap((m) => m.tokens)];
  if (impl.kind === 'component') return r.modules.filter((x) => x.importers.includes(impl.file)).flatMap((m) => m.tokens || []);
  return [];
}
// API values are named by the dictionary, one scale for all implementations (`l`, `lg`,
// `large` → `l`; the scale is xs, s, m, l, xl — decision of 2026-10-09); a value outside it keeps its word; a qualifier goes after it.
const SIZE_TOKEN = { 'Extra small': 'xs', Small: 's', Medium: 'm', Large: 'l', 'Extra large': 'xl' };
const QUAL_TOKEN = { 'на телефоне': 'mobile', 'на десктопе': 'desktop', 'на планшете': 'tablet' };
export function canonical(name) {
  const m = /^(.*?) \((.+)\)$/.exec(name);
  if (m) return `${canonical(m[1])}-${QUAL_TOKEN[m[2]] || slug(m[2])}`;
  return SIZE_TOKEN[name] || slug(name);
}
const AXIS_RU_ = { emphasis: 'вид', style: 'обводка', tone: 'тон', size: 'размер', width: 'ширина' };
// `Icon button` → `IconButton`: the name of the kit component.
export const pascal = (s) => String(s).split(/\s+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join('');
export const axisRu = (a) => AXIS_RU_[a] || a;
export const places = (n) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'место' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'места' : 'мест'}`;
export const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-|-$/g, '');
