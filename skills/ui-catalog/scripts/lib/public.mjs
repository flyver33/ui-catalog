// Root-relative URLs of a project (`/fonts/x.woff2`, `/static/img/x.svg`) are served from
// its `public/` folder; the gallery writes them relative to itself. A git symlink checked out as a plain file — its content the target
// path — is followed.
import fs from 'node:fs';
import path from 'node:path';
import { relPosix } from './fsutil.mjs';

const stat = (p) => { try { return fs.statSync(p); } catch { return null; } };

export function publicResolver(root) {
  const base = path.join(root, 'public');
  if (!stat(base)?.isDirectory()) return () => null;
  return (url) => {
    const parts = String(url).split(/[?#]/)[0].split('/').filter(Boolean).map((p) => { try { return decodeURIComponent(p); } catch { return p; } });
    let cur = base;
    for (let k = 0; k < parts.length; k++) {
      const st = stat(cur);
      // A symlink stub: a small file whose content is a relative path.
      if (st?.isFile() && st.size < 300) {
        const target = fs.readFileSync(cur, 'utf8').trim();
        if (/^[.\w/-]+$/.test(target) && !target.includes('\n')) cur = path.resolve(path.dirname(cur), target);
      }
      cur = path.join(cur, parts[k]);
    }
    return stat(cur)?.isFile() ? cur : null;
  };
}

// `url(…)` in a stylesheet read from `fromDir`, written for a file in `toDir`.
export function rebaseCss(css, fromDir, toDir, pub) {
  return String(css).replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, u) => {
    if (/^(data:|https?:|#|\/\/)/.test(u)) return m;
    if (u.startsWith('/')) { const f = pub(u); return f ? `url(${q}${relPosix(toDir, f)}${q})` : m; }
    return `url(${q}${relPosix(toDir, path.resolve(fromDir, u))}${q})`;
  });
}

// `src`, `href`, `srcset` with a root-relative URL in rendered markup, for a page in `toDir`.
export function rebaseHtml(html, toDir, pub) {
  const one = (u) => { if (!u.startsWith('/') || u.startsWith('//')) return u; const f = pub(u); return f ? relPosix(toDir, f) : u; };
  return String(html)
    .replace(/\b(src|href)="([^"]*)"/g, (m, a, u) => `${a}="${one(u)}"`)
    .replace(/\bsrcset="([^"]*)"/g, (m, v) => `srcset="${v.split(',').map((x) => { const [u, ...rest] = x.trim().split(/\s+/); return [one(u), ...rest].join(' '); }).join(', ')}"`);
}
