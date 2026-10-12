// File-system helpers shared by every ui-catalog script. Node 18+, no deps.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const toPosix = (p) => p.split(path.sep).join('/');

export const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);

// A path inside a Markdown link: `(`, `)` and spaces would end or break it (gl.links).
export const mdHref = (p) => String(p).replace(/[() ]/g, (c) => ({ '(': '%28', ')': '%29', ' ': '%20' })[c]);
export const fromHref = (p) => { try { return decodeURIComponent(p); } catch { return p; } };

export function relPosix(from, to) {
  const r = toPosix(path.relative(from, to));
  return r === '' ? '.' : r;
}

export function readText(file, fallback = null) {
  try { return fs.readFileSync(file, 'utf8'); } catch { return fallback; }
}

export function readJson(file, fallback = null) {
  const t = readText(file);
  if (t == null) return fallback;
  try { return JSON.parse(t); } catch (e) { throw new Error(`не читается JSON ${file}: ${e.message}`); }
}

export function writeText(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

export const writeJson = (file, data) => writeText(file, JSON.stringify(data, null, 2) + '\n');

// ── globs ──────────────────────────────────────────────────────────────
// Supports *, **, ? — enough for config scopes and .gitignore basics.
export function globToRegex(glob, { capture = false } = {}) {
  let re = '';
  let captured = false;
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') { i++; re += '(?:.*/)?'; } else re += '.*';
      } else if (capture && !captured) { re += '([^/]*)'; captured = true; }
      else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp('^' + re + '$');
}

export function makeMatcher(patterns) {
  const res = [];
  for (const p of patterns) {
    const clean = p.replace(/^\.\//, '').replace(/\/$/, '');
    if (!clean) continue;
    res.push(globToRegex(clean), globToRegex(clean + '/**'));
  }
  return (rel) => res.some((r) => r.test(rel));
}

// Minimal .gitignore reader: no negation, anchoring handled.
export function gitignorePatterns(root) {
  const t = readText(path.join(root, '.gitignore'), '');
  const out = [];
  for (let line of t.split(/\r?\n/)) {
    line = line.trim();
    if (!line || line.startsWith('#') || line.startsWith('!')) continue;
    const body = line.replace(/\/$/, '');
    if (body.startsWith('/')) out.push(body.slice(1));
    else if (!body.includes('/')) out.push('**/' + body);
    else out.push(body);
  }
  return out;
}

export const DEFAULT_EXCLUDE = [
  '**/node_modules', '**/.git', '**/.DS_Store', '**/dist', '**/build', '**/.next', '**/.nuxt',
  '**/coverage', '**/.cache', '**/.turbo', '**/.vercel', '**/.claude', '**/.playwright-cli',
];

export function walk(root, isIgnored) {
  const files = [];
  const visit = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const abs = path.join(dir, e.name);
      const rel = relPosix(root, abs);
      if (e.name === '.git') continue;
      if (e.isDirectory()) {
        if (isIgnored(rel) || isIgnored(rel + '/')) continue;
        visit(abs);
      } else if (e.isFile()) {
        if (!isIgnored(rel)) files.push(rel);
      }
    }
  };
  visit(root);
  return files.sort();
}

// ── text positions ─────────────────────────────────────────────────────
export function lineIndex(src) {
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src.charCodeAt(i) === 10) starts.push(i + 1);
  return (pos) => {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= pos) lo = mid; else hi = mid - 1;
    }
    return lo + 1;
  };
}

// ── CLI args ───────────────────────────────────────────────────────────
export function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (v !== undefined) args[k] = v;
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) args[k] = argv[++i];
      else args[k] = true;
    } else args._.push(a);
  }
  return args;
}

export const isMain = (metaUrl) => !!process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === metaUrl;

export function fail(msg, code = 1) {
  console.error(msg);
  process.exit(code);
}
