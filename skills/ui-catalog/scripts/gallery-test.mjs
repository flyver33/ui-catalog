#!/usr/bin/env node
// ui-catalog gallery-test — the gallery's A cases (`?selftest`) without the agent's browser
// (references/gallery-cases.md): a server on 127.0.0.1, a headless Chromium found on the
// machine, the result in gallery/selftest.json — which check reads.
//   node gallery-test.mjs [--root <project>] [--out <library dir>]
// Exit 0 — no failures; 1 — failures; 2 — no gallery or no browser (nothing written).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { parseArgs, isMain, sha1, readText, writeJson, relPosix, walk } from './lib/fsutil.mjs';
import { resolveOut } from './lib/config.mjs';

export const SELFTEST_FILE = 'selftest.json';
const LIMIT = 10 * 60 * 1000;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf',
};

// A Chromium browser on this machine: UI_CATALOG_BROWSER, else Chrome, Edge, Chromium.
export function findBrowser(env = process.env) {
  const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };
  if (env.UI_CATALOG_BROWSER) return isFile(env.UI_CATALOG_BROWSER) ? env.UI_CATALOG_BROWSER : null;
  const win = [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA].filter(Boolean).flatMap((d) => [
    path.join(d, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(d, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(d, 'Chromium', 'Application', 'chrome.exe'),
  ]);
  const mac = ['Google Chrome.app/Contents/MacOS/Google Chrome', 'Chromium.app/Contents/MacOS/Chromium', 'Microsoft Edge.app/Contents/MacOS/Microsoft Edge'].map((x) => `/Applications/${x}`);
  const names = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge', 'microsoft-edge-stable'];
  const onPath = (env.PATH || '').split(path.delimiter).filter(Boolean).flatMap((d) => names.map((n) => path.join(d, n)));
  const own = process.platform === 'win32' ? win : process.platform === 'darwin' ? mac : [];
  return [...own, ...onPath].find(isFile) || null;
}

// Every local file the gallery reaches with `../`: from data.js (the frames' markup and
// stylesheets) and from the stylesheets build wrote — the project's CSS, public/ files.
function linkedPaths(galleryDir) {
  const out = [];
  const files = [path.join(galleryDir, 'index.html'), path.join(galleryDir, 'data.js'), ...walk(galleryDir, () => false).filter((f) => f.endsWith('.css')).map((f) => path.join(galleryDir, f))];
  for (const file of files) {
    const text = readText(file);
    if (text == null) continue;
    // data.js and index.html are read from the gallery's folder; a stylesheet from its own.
    const from = /\.css$/.test(file) ? path.dirname(file) : galleryDir;
    for (const m of text.matchAll(/(?:\.\.\/)+[^"'\s)?#\\<>]+/g)) out.push(path.resolve(from, m[0]));
  }
  return out;
}

// The nearest folder holding all of them; null across drives.
function commonDir(paths) {
  const split = (p) => path.resolve(p).split(path.sep);
  let common = split(paths[0]);
  for (const p of paths.slice(1)) {
    const s = split(p);
    let i = 0;
    while (i < common.length && i < s.length && (process.platform === 'win32' ? common[i].toLowerCase() === s[i].toLowerCase() : common[i] === s[i])) i++;
    common = common.slice(0, i);
  }
  return common.length ? common.join(path.sep) || path.sep : null;
}

function serve(base, onResult) {
  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/__uic-selftest') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => { res.writeHead(204); res.end(); try { onResult({ result: JSON.parse(body) }); } catch (e) { onResult({ error: `ответ страницы не прочитан: ${e.message}` }); } });
      return;
    }
    let rel;
    try { rel = decodeURIComponent(new URL(req.url, 'http://local').pathname); } catch { res.writeHead(400); res.end(); return; }
    const file = path.resolve(base, '.' + rel);
    // Nothing outside the folder.
    if (file !== base && !file.startsWith(base.endsWith(path.sep) ? base : base + path.sep)) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(buf);
    });
  });
  return new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, '127.0.0.1', () => resolve(server)); });
}

// Every process of the browser, found by its throwaway profile: the one started may be a
// launcher that hands over and exits (msedge.exe does).
function stop(child, profile) {
  try { child.kill('SIGKILL'); } catch {}
  const quiet = { stdio: 'ignore', timeout: 30000 };
  if (process.platform === 'win32') {
    const like = profile.replace(/'/g, "''");
    try { execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${like}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`], quiet); } catch {}
  } else {
    try { execFileSync('pkill', ['-f', profile], quiet); } catch {}
  }
}

export async function runGalleryTest(root, outDir, { quiet = false, browser = findBrowser(), limit = LIMIT } = {}) {
  const galleryDir = path.join(outDir, 'gallery');
  const data = readText(path.join(galleryDir, 'data.js'));
  if (data == null) return { code: 2, why: `галереи нет (${relPosix(process.cwd(), galleryDir)}): сначала node build.mjs` };
  if (!browser) return { code: 2, why: 'браузер не найден (Chrome, Edge или Chromium; путь можно задать в UI_CATALOG_BROWSER): открой gallery/index.html?selftest в своём браузере' };
  const base = commonDir([root, galleryDir, ...linkedPaths(galleryDir)]) || commonDir([root, galleryDir]);
  if (!base) return { code: 2, why: 'проект и библиотека на разных дисках: открой gallery/index.html?selftest через статический сервер' };

  let settle;
  const outcome = new Promise((r) => (settle = r));
  const server = await serve(base, (x) => settle(x));
  const url = `http://127.0.0.1:${server.address().port}/${relPosix(base, galleryDir).split('/').map(encodeURIComponent).join('/')}/index.html?selftest&report&${Date.now()}`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-catalog-browser-'));
  const child = spawn(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--window-size=1280,900', `--user-data-dir=${profile}`, url], { stdio: 'ignore' });
  child.on('error', (e) => settle({ error: `браузер не запустился: ${e.message}` }));
  // Exit 0 is a launcher handing over; any other code is a browser that did not start.
  child.on('exit', (c) => { if (c) setTimeout(() => settle({ exited: c }), 500); });
  const timer = setTimeout(() => settle({ timeout: true }), limit);
  const r = await outcome;
  clearTimeout(timer);
  stop(child, profile);
  server.close();
  try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch {}
  if (r.error && !r.result) return { code: 2, why: r.error };

  const failed = r.result ? r.result.failed || []
    : [{ id: 'G01', where: 'вся галерея', msg: r.timeout ? `прогон не закончился за ${Math.round(limit / 60000)} мин` : `браузер закрылся до конца прогона (код ${r.exited})` }];
  const json = { data: sha1(data), date: new Date().toISOString(), browser: path.basename(browser), pages: r.result?.pages || 0, checks: r.result?.checks || 0, failed };
  writeJson(path.join(galleryDir, SELFTEST_FILE), json);
  if (!quiet) {
    console.log(`ui-catalog gallery-test: страниц ${json.pages}, проверок ${json.checks}, провалов ${failed.length} — ${relPosix(process.cwd(), path.join(galleryDir, SELFTEST_FILE))}`);
    for (const f of failed) console.log(`  ${f.id} ${f.where} — ${f.msg}`);
  }
  return { code: failed.length ? 1 : 0, result: json };
}

if (isMain(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(args.root || process.cwd());
  const r = await runGalleryTest(root, resolveOut(root, args));
  if (r.why) console.log(`ui-catalog gallery-test: ${r.why}`);
  process.exitCode = r.code;
}
