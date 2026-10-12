// Reference component types: what the audit expects from each kind of atom.
// Source of truth for the audit; references/types.md explains the same in prose.
//
//   role         ARIA role / native element the type maps to
//   interactive  true | false | 'either' (avatar, list item: both kinds exist)
//   states       states it must have when interactive (from the state vocabulary)
//   axes         axes a real product usually has for it
//   notAxis      modifier patterns that usually turn out to be patches — a line in the
//                inconsistencies report, never a verdict: { pattern, sign, legit }

export const STATE_VOCAB = {
  default: 'обычное',
  hover: 'наведение',
  active: 'нажато',
  'focus-visible': 'фокус с клавиатуры',
  disabled: 'выключено',
  current: 'текущее (aria-current)',
  selected: 'выбрано',
  checked: 'отмечено',
  indeterminate: 'частично отмечено',
  expanded: 'раскрыто (aria-expanded)',
  'read-only': 'только чтение',
  invalid: 'ошибка',
  loading: 'загрузка',
  empty: 'пусто',
  visited: 'посещено',
};

// How a selector expresses a state (static detection).
export const STATE_SELECTORS = {
  hover: [/:hover\b/],
  active: [/:active\b/],
  'focus-visible': [/:focus-visible\b/, /:focus\b/],
  disabled: [/:disabled\b/, /\[disabled\]/, /\[aria-disabled/, /--disabled\b/, /\bis-disabled\b/],
  current: [/\[aria-current/, /--active\b/, /--current\b/, /\bis-active\b/, /\bis-current\b/],
  selected: [/\[aria-selected/, /--selected\b/, /\bis-selected\b/, /--on\b/],
  checked: [/:checked\b/, /\[aria-checked/, /--checked\b/],
  expanded: [/\[aria-expanded/, /--open\b/, /\bis-open\b/, /--expanded\b/],
  invalid: [/:invalid\b/, /\[aria-invalid/, /--error\b/, /--invalid\b/],
  loading: [/--loading\b/, /\bis-loading\b/, /\[aria-busy/],
  visited: [/:visited\b/],
};

// Names are English, as in Figma libraries and most kits; prose stays in the
// project's language. `family` groups types that behave alike (overlays).
export const TYPES = {
  button: {
    name: 'Button', role: 'button', interactive: true,
    states: ['hover', 'active', 'focus-visible', 'disabled'],
    axes: ['emphasis', 'style', 'tone', 'size', 'width'],
    notAxis: [
      { pattern: 'inherit / ghost / plain / default / light', sign: 'ΔE < 1 к соседнему виду на всех реальных фонах, или отличие только в псевдосостояниях', legit: 'Tertiary законна, если она заметно отличается (ΔE ≥ 5) и стоит там, где нужен низкий акцент — text button в Material' },
      { pattern: 'модификатор цвета под одну страницу', sign: 'использован один раз', legit: 'статусная кнопка (Danger) с понятным смыслом' },
    ],
  },
  'icon-button': {
    name: 'Icon button', role: 'button', interactive: true,
    states: ['hover', 'active', 'focus-visible', 'disabled'],
    axes: ['emphasis', 'size'],
    notAxis: [{ pattern: 'голый <button> с иконкой без класса', sign: 'повторяется в двух местах и больше', legit: 'единственное место (бургер в шапке)' }],
  },
  link: { name: 'Link', role: 'link', interactive: true, states: ['hover', 'focus-visible'], axes: [], notAxis: [] },
  tag: {
    name: 'Tag', role: 'текст', interactive: false, states: [], axes: ['tone', 'size'],
    notAxis: [
      { pattern: 'nohover / static / readonly', sign: 'модификатор только отменяет :hover', legit: 'нет: у Tag hover не бывает, кликабельное — это Chip' },
    ],
  },
  chip: {
    name: 'Chip', role: 'button (или checkbox, если выбирается)', interactive: true,
    states: ['hover', 'focus-visible'], axes: ['tone', 'size'],
    notAxis: [
      { pattern: 'цвет только у кликабельных', sign: 'модификатор стоит только на <button>, а базовый класс — и на <span>', legit: 'тон со своим смыслом (статус), который случайно совпал' },
    ],
  },
  badge: { name: 'Badge', role: 'status/текст', interactive: false, states: [], axes: ['tone'], notAxis: [] },
  avatar: { name: 'Avatar', role: 'img или button', interactive: 'either', states: ['hover', 'focus-visible'], axes: ['size'], notAxis: [] },
  logo: { name: 'Logo', role: 'link', interactive: true, states: ['focus-visible'], axes: [], notAxis: [] },
  icon: { name: 'Icon', role: 'img (aria-hidden)', interactive: false, states: [], axes: ['size'], notAxis: [] },
  select: {
    name: 'Select', role: 'combobox / button с listbox', interactive: true,
    states: ['hover', 'focus-visible', 'expanded', 'disabled'],
    axes: ['size', 'width'], notAxis: [],
  },
  autocomplete: {
    name: 'Autocomplete', role: 'combobox: поле ввода + listbox', interactive: true,
    states: ['hover', 'focus-visible', 'expanded', 'disabled', 'invalid'],
    axes: ['size', 'width'], notAxis: [],
  },
  input: { name: 'Input', role: 'textbox', interactive: true, states: ['hover', 'focus-visible', 'disabled', 'invalid', 'read-only'], axes: ['size', 'width'], notAxis: [] },
  checkbox: { name: 'Checkbox', role: 'checkbox', interactive: true, states: ['hover', 'focus-visible', 'checked', 'indeterminate', 'disabled'], axes: [], notAxis: [] },
  radio: { name: 'Radio button', role: 'radio', interactive: true, states: ['hover', 'focus-visible', 'checked', 'disabled'], axes: [], notAxis: [] },
  switch: { name: 'Switch', role: 'switch', interactive: true, states: ['hover', 'focus-visible', 'checked', 'disabled'], axes: [], notAxis: [] },
  tab: { name: 'Tab', role: 'tab', interactive: true, states: ['hover', 'focus-visible', 'selected'], axes: [], notAxis: [] },
  'nav-item': {
    name: 'Menu item', role: 'link с aria-current', interactive: true,
    states: ['hover', 'focus-visible', 'current'], axes: [],
    notAxis: [{ pattern: '--active вместо aria-current', sign: 'текущее состояние только классом', legit: 'класс допустим, если рядом ставится aria-current' }],
  },
  breadcrumb: { name: 'Breadcrumbs', role: 'navigation', interactive: true, states: ['hover', 'focus-visible', 'current'], axes: [], notAxis: [] },
  'list-item': { name: 'List item', role: 'listitem / option', interactive: 'either', states: ['hover', 'focus-visible', 'selected'], axes: [], notAxis: [] },
  progress: { name: 'Progress bar', role: 'progressbar', interactive: false, states: [], axes: ['size'], notAxis: [] },
  spinner: { name: 'Spinner', role: 'status', interactive: false, states: [], axes: ['size'], notAxis: [] },
  divider: { name: 'Divider', role: 'separator', interactive: false, states: [], axes: [], notAxis: [] },

  // Overlays: everything that appears above the page. The dimming behind a modal
  // overlay (scrim) is not a type: it is a part of Dialog / Bottom sheet / Progress dialog.
  // OS notifications are drawn by the system, not by the project's CSS: not a type.
  // A «we updated the terms» window is a Dialog.
  dialog: {
    name: 'Dialog', family: 'overlay', role: 'dialog (aria-modal)', interactive: false, modal: true,
    about: 'окно по центру экрана с действием, часто с формой; затемняет страницу',
    states: [], axes: ['size'], notAxis: [],
  },
  'progress-dialog': {
    name: 'Progress dialog', family: 'overlay', role: 'dialog + progressbar', interactive: false, modal: true,
    about: 'отдельное окно, пока что-то долго грузится или обрабатывается',
    states: [], axes: [], notAxis: [],
  },
  'bottom-sheet': {
    name: 'Bottom sheet', family: 'overlay', role: 'dialog', interactive: false, modal: true,
    about: 'шторка, выезжает снизу экрана на телефоне',
    states: ['expanded'], axes: [], notAxis: [],
  },
  popover: {
    name: 'Popover', family: 'overlay', role: 'dialog / menu (без aria-modal)', interactive: false, modal: false,
    about: 'появляется рядом с элементом, экран не затемняет; в нём выбирают или делают действие',
    states: [], axes: [], notAxis: [],
  },
  tooltip: {
    name: 'Tooltip', family: 'overlay', role: 'tooltip', interactive: false, modal: false,
    about: 'короткая подсказка у элемента при наведении или фокусе, без действий',
    states: [], axes: [], notAxis: [],
  },
  toast: {
    name: 'Toast', family: 'overlay', role: 'status', interactive: false, modal: false,
    about: 'временное сообщение, исчезает само',
    states: [], axes: ['tone'], notAxis: [],
  },
};

// Names a component of this type is called by (first is the default); a component
// named otherwise is an error in check — see lib/naming.mjs.
for (const t of Object.values(TYPES)) t.names ||= t.name.split(' / ');
