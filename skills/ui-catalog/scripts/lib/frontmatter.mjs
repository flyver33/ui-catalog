// YAML-subset front matter: `key: value`, `key: [a, b]`, and block lists
// (`key:` followed by `  - item`). That is all guideline files need.

const unquote = (s) => {
  s = s.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1);
  return s;
};

const scalar = (s) => {
  const v = unquote(s);
  if (s.trim() !== v) return v;
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === '' || v === 'null' || v === '~') return null;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
};

function inlineList(s) {
  const inner = s.trim().slice(1, -1).trim();
  if (!inner) return [];
  const out = [];
  let cur = '', q = null;
  for (const c of inner) {
    if (q) { if (c === q) q = null; cur += c; continue; }
    if (c === '"' || c === "'") { q = c; cur += c; continue; }
    if (c === ',') { out.push(unquote(cur)); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(unquote(cur));
  return out;
}

export function parseFrontmatter(text) {
  const m = /^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { data: {}, body: text, hasFrontmatter: false };
  const data = {};
  let listKey = null;
  const blockKeys = new Set();
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item && listKey) { data[listKey].push(unquote(item[1])); blockKeys.delete(listKey); continue; }
    const kv = /^([\w-]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const [, key, raw] = kv;
    listKey = null;
    if (raw.trim() === '') { data[key] = []; listKey = key; blockKeys.add(key); }
    else if (raw.trim().startsWith('[')) data[key] = inlineList(raw);
    else data[key] = scalar(raw);
  }
  // `key:` with nothing under it is an empty value, not an empty list.
  for (const k of blockKeys) data[k] = null;
  return { data, body: text.slice(m[0].length), hasFrontmatter: true };
}

const needsQuote = (s) => /^[\s]|[\s]$|[:#\[\],{}]|^(true|false|null|~|-?\d+(\.\d+)?)$/.test(s) || s === '';

export function formatValue(v) {
  if (Array.isArray(v)) return '[' + v.map((x) => (needsQuote(String(x)) ? JSON.stringify(String(x)) : String(x))).join(', ') + ']';
  if (v == null) return '';
  const s = String(v);
  return needsQuote(s) && typeof v === 'string' ? JSON.stringify(s) : s;
}

export function stringifyFrontmatter(data, order = Object.keys(data)) {
  const keys = [...new Set([...order, ...Object.keys(data)])].filter((k) => k in data);
  return '---\n' + keys.map((k) => `${k}: ${formatValue(data[k])}`).join('\n') + '\n---\n';
}

// Replace (or add) one key in an existing front matter block, keeping the
// rest of the file byte-for-byte.
export function setFrontmatterKey(text, key, value) {
  const m = /^(﻿?---\r?\n)([\s\S]*?)(\r?\n---\r?\n?)/.exec(text);
  if (!m) return stringifyFrontmatter({ [key]: value }) + text;
  const lines = m[2].split(/\r?\n/);
  const idx = lines.findIndex((l) => l.startsWith(key + ':'));
  const line = `${key}: ${formatValue(value)}`;
  if (idx >= 0) {
    let end = idx + 1;
    while (end < lines.length && /^\s+-\s/.test(lines[end])) end++;
    lines.splice(idx, end - idx, line);
  } else lines.push(line);
  return m[1] + lines.join('\n') + m[3] + text.slice(m[0].length);
}
