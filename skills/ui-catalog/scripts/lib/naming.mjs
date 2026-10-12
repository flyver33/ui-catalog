// Component names come from a reference, not from the agent. Names are English
// (as in Figma libraries and most kits); guideline prose stays in the project's language.
//   1. the project's own kit (config.reference kind kit/storybook) — the kit
//      component's name, recorded in `counterpart`, when the kit names in English;
//   2. otherwise the reference type's name (types.mjs → TYPES[type].names);
//   3. a component no type fits (`type` empty) gets a plain English name of its own
//      from the agent. That is allowed: `check` lists such names as info.
// A name that differs from the reference although a type is set is an error in check.
import { TYPES } from './types.mjs';

const norm = (s) => String(s || '').trim().toLowerCase().replace(/ё/g, 'е');

// Kit component name from `counterpart: web-tag#notHover` or `counterpart: Tag`.
export const counterpartName = (cp) => (cp ? String(cp).split('#')[0].trim() : null);

export function expectedNames(data, config = {}) {
  const out = [];
  const ref = config.reference || {};
  if (['kit', 'storybook'].includes(ref.kind) && (ref.lang || 'en') === 'en' && data.counterpart) {
    out.push({ name: counterpartName(data.counterpart), from: `кит «${ref.name || ref.source}»` });
  }
  const t = data.type && TYPES[data.type];
  if (t) for (const n of t.names) out.push({ name: n, from: `тип ${data.type}` });
  return out;
}

// { ok, custom, subject, expected: [{name, from}], problem } — `subject` is what was compared.
export function checkName(data, config = {}) {
  const expected = expectedNames(data, config);
  const subject = data.name;
  if (!expected.length) return { ok: true, custom: true, subject, expected, problem: /^[A-Z][a-z]*( [a-z]+)*$/.test(subject || '') ? null : 'not-english' };
  if (!expected.some((e) => norm(e.name) === norm(subject))) return { ok: false, subject, expected, problem: 'differs' };
  return { ok: true, subject, expected };
}

// What the project's interface is measured against, detected from its files.
// Order: the project's kit → platform guidelines → types.md.
const KITS = [
  [/^@mui\/(material|joy)$/, 'MUI', 'en'], [/^antd$/, 'Ant Design', 'en'], [/^@chakra-ui\/react$/, 'Chakra UI', 'en'],
  [/^@mantine\/core$/, 'Mantine', 'en'], [/^@radix-ui\/(themes|react-)/, 'Radix', 'en'], [/^bootstrap$|^react-bootstrap$/, 'Bootstrap', 'en'],
  [/^vuetify$/, 'Vuetify', 'en'], [/^element-plus$|^element-ui$/, 'Element', 'en'], [/^@angular\/material$/, 'Angular Material', 'en'],
  [/^primereact$|^primevue$/, 'PrimeReact / PrimeVue', 'en'], [/^@headlessui\//, 'Headless UI', 'en'],
];

export function detectReference(root, { readJson, exists, path }) {
  const pkg = readJson(path.join(root, 'package.json'));
  const deps = Object.keys({ ...pkg?.dependencies, ...pkg?.devDependencies, ...pkg?.peerDependencies });
  if (exists(path.join(root, 'components.json')) && readJson(path.join(root, 'components.json'))?.$schema?.includes('shadcn')) {
    return { kind: 'kit', name: 'shadcn/ui', source: 'components.json', lang: 'en' };
  }
  for (const [re, name, lang] of KITS) {
    const dep = deps.find((d) => re.test(d));
    if (dep) return { kind: 'kit', name, source: `package.json: ${dep}`, lang };
  }
  if (exists(path.join(root, '.storybook'))) return { kind: 'storybook', name: 'Storybook проекта', source: '.storybook/', lang: null };
  const mobile = deps.some((d) => /^(react-native|expo)$/.test(d)) || exists(path.join(root, 'pubspec.yaml')) || exists(path.join(root, 'android')) || exists(path.join(root, 'ios'));
  if (mobile) return { kind: 'platform', name: 'Material 3 / Apple HIG', source: 'мобильный проект', lang: 'en' };
  return { kind: 'types', name: 'справочник типов ui-catalog', source: 'references/types.md', lang: 'en' };
}
