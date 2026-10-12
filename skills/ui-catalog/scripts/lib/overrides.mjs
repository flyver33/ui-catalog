// What a page's or feature's own rule changes in a library component, from the CSS
// properties it sets (`scan` keeps them with the override): colour and look — a sign of a
// missing variant; size and layout — the component fitted to its place.
//   describeOverride(o)  { look, words: ['ширину', …], max: 1100 | null }
//   overrideLine(o, link) the line for «Подводные камни», in plain words, no classes

const LOOK = /^(color|background(-[a-z]+)?|border(-[a-z]+)*|outline(-[a-z]+)?|box-shadow|opacity|filter|fill|stroke|text-decoration(-[a-z]+)?)$/;
const TYPE = /^(font(-[a-z]+)?|line-height|letter-spacing|text-transform)$/;
const WORDS = [
  [/^color$/, 'цвет текста'], [/^background/, 'фон'], [/^border.*(color)$/, 'цвет рамки'], [/^(border|outline)/, 'рамку'],
  [/^box-shadow$/, 'тень'], [/^(opacity|filter)$/, 'прозрачность'], [/^(fill|stroke)$/, 'цвет'], [/^text-decoration/, 'подчёркивание'],
  [TYPE, 'шрифт'],
  [/^(width|min-width|max-width|inline-size)$/, 'ширину'], [/^(height|min-height|max-height|block-size)$/, 'высоту'],
  [/^margin/, 'отступы'], [/^padding/, 'внутренние отступы'],
  [/^(display|flex|flex-[a-z]+|grid|grid-[a-z]+|gap|row-gap|column-gap|order|align-[a-z]+|justify-[a-z]+|place-[a-z]+|position|top|right|bottom|left|inset|float|z-index)$/, 'раскладку'],
];

export function describeOverride(o) {
  const props = o.props || [];
  const words = [...new Set(props.map((p) => WORDS.find(([re]) => re.test(p))?.[1] || 'вид'))];
  const max = Number(/max-width:\s*(\d+)px/.exec(o.media || '')?.[1]) || null;
  return { look: props.length === 0 || props.some((p) => LOOK.test(p)), words, max };
}

const list = (w) => (w.length > 1 ? `${w.slice(0, -1).join(', ')} и ${w[w.length - 1]}` : w[0] || 'вид');

export function overrideLine(o, link) {
  const d = describeOverride(o);
  const where = d.max ? `На экранах до ${d.max} px страница` : 'Страница';
  return d.look
    ? `- ${where} перекрашивает компонент своим CSS (${list(d.words)}): ${link} — возможно, не хватает вида.`
    : `- ${where} меняет компоненту ${list(d.words)} своим CSS: ${link} — компонент подгоняют под место.`;
}
