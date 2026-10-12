// Which tokens the catalog shows — a rule, not a setting:
//   - only tokens the code uses (a token declared and used nowhere is not in the catalog);
//   - one value under several used names → the most used name; the rest are aliases;
//   - grouped by kind (KINDS), never by the comments in the project's token files.
// What is left out goes to ui-issues.md (audit: token-unused, token-alias).

export const KINDS = [['color', 'Цвета'], ['shadow', 'Тени'], ['radius', 'Радиусы'], ['font', 'Шрифты'], ['size', 'Размеры'], ['motion', 'Анимация'], ['other', 'Прочее']];
export const KIND_RU = Object.fromEntries(KINDS);

const norm = (v) => String(v).toLowerCase().replace(/\s+/g, '').replace(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/, '#$1$1$2$2$3$3');

export function catalogTokens(tokens) {
  const byName = new Map(tokens.map((t) => [t.name, t]));
  const resolve = (v, d = 0) => (d > 8 ? v : String(v).replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)/g, (m, n, fb) => (byName.has(n) ? resolve(byName.get(n).value, d + 1) : fb || m)));
  const used = tokens.filter((t) => t.uses > 0);
  const unused = tokens.filter((t) => !t.uses);
  // Same kind, same resolved value: one name stays (most used, then first declared).
  const groups = new Map();
  for (const t of used) {
    const key = `${t.kind}|${norm(resolve(t.value))}`;
    (groups.get(key) || groups.set(key, []).get(key)).push(t);
  }
  const aliases = [];
  const dropped = new Set();
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const keep = [...list].sort((a, b) => b.uses - a.uses || tokens.indexOf(a) - tokens.indexOf(b))[0];
    const drop = list.filter((t) => t !== keep);
    drop.forEach((t) => dropped.add(t.name));
    aliases.push({ keep, drop, value: resolve(keep.value) });
  }
  const shown = used.filter((t) => !dropped.has(t.name))
    .sort((a, b) => KINDS.findIndex(([k]) => k === a.kind) - KINDS.findIndex(([k]) => k === b.kind) || tokens.indexOf(a) - tokens.indexOf(b));
  return { shown, unused, aliases };
}
