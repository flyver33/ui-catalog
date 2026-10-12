/* ui-catalog gallery selftest — the A cases of references/gallery-cases.md, run in the page.
   Open gallery/index.html?selftest: it walks every page, every frame, every width and
   tab, then shows the result at the bottom and leaves it in window.__uicSelftest
   ({ done, pages, checks, failed: [{ id, where, msg }] }). Loaded by app.js only with
   ?selftest; nothing here runs for people looking at the gallery.                       */
(() => {
  const D = window.UI_CATALOG;
  const out = { done: false, pages: 0, checks: 0, failed: [] };
  window.__uicSelftest = out;
  let where = '';
  const ok = (id, cond, msg) => { out.checks++; if (!cond) out.failed.push({ id, where, msg }); return cond; };
  const errors = [];
  addEventListener('error', (e) => errors.push(`${where}: ${e.message}`));
  addEventListener('unhandledrejection', (e) => errors.push(`${where}: ${e.reason}`));

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // Not requestAnimationFrame: a hidden tab never fires it, and the walk must run there too.
  const frameTick = () => sleep(60);
  const main = document.getElementById('main');
  const iframes = () => [...main.querySelectorAll('iframe')];
  const loaded = (f) => { const d = f.contentDocument; return !!(f.srcdoc && d && d.readyState === 'complete' && d.querySelector('script')); };
  // Every frame loaded, fonts in, sizes reported and laid out.
  async function settle() {
    await frameTick();
    const t0 = performance.now();
    while (performance.now() - t0 < 10000 && !iframes().every(loaded)) await sleep(50);
    // Pictures of the page too (icons): checked only once they have had their chance.
    while (performance.now() - t0 < 10000 && [...main.querySelectorAll('img')].some((i) => !i.complete)) await sleep(50);
    for (const f of iframes()) { try { await f.contentDocument.fonts?.ready; } catch {} }
    await sleep(300);
    // Cells resized after the frames were laid out (a page scrollbar that came late).
    window.__uicRelayout?.();
    await sleep(100);
    await frameTick();
  }
  async function go(hash) {
    where = hash;
    if (location.hash === hash) dispatchEvent(new HashChangeEvent('hashchange'));
    else location.hash = hash;
    await settle();
    out.pages++;
  }

  // ── what a frame draws ──────────────────────────────────────────────
  const visibleColor = (c) => c && c !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(c);
  function paints(el, cs, win) {
    if (/^(IMG|SVG|svg|INPUT|SELECT|TEXTAREA|CANVAS|VIDEO|HR|PROGRESS|METER)$/.test(el.tagName)) return true;
    if ([...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return true;
    if (visibleColor(cs.backgroundColor) || cs.backgroundImage !== 'none' || cs.boxShadow !== 'none') return true;
    for (const s of ['Top', 'Right', 'Bottom', 'Left']) if (parseFloat(cs[`border${s}Width`]) > 0 && cs[`border${s}Style`] !== 'none' && visibleColor(cs[`border${s}Color`])) return true;
    for (const p of ['::before', '::after']) {
      const ps = win.getComputedStyle(el, p);
      if (ps.content && ps.content !== 'none' && ps.content !== 'normal' && ps.display !== 'none' && (visibleColor(ps.backgroundColor) || ps.backgroundImage !== 'none' || parseFloat(ps.borderBottomWidth) > 0 || ps.content.replace(/["'\s]/g, ''))) return true;
    }
    return false;
  }
  // Union of everything painted, in the frame's own coordinates; null when nothing is.
  function drawnBox(f) {
    const doc = f.contentDocument, win = doc?.defaultView;
    if (!doc?.body) return null;
    let box = null;
    for (const el of doc.body.querySelectorAll('*')) {
      if (/^(SCRIPT|STYLE|LINK|TEMPLATE)$/.test(el.tagName)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const cs = win.getComputedStyle(el);
      if (cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
      if (!paints(el, cs, win)) continue;
      box = box ? { left: Math.min(box.left, r.left), top: Math.min(box.top, r.top), right: Math.max(box.right, r.right), bottom: Math.max(box.bottom, r.bottom) } : { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    }
    return box;
  }
  const scaleOf = (f) => Number(/scale\(([\d.]+)\)/.exec(f.style.transform)?.[1] || 1);
  // The part of the frame a person sees, in frame coordinates.
  function visibleArea(f) {
    const wrap = f.parentElement, s = scaleOf(f);
    return { w: Math.min(wrap.clientWidth / s, f.contentWindow.innerWidth), h: Math.min(wrap.clientHeight / s, parseFloat(f.style.height) || f.clientHeight) };
  }
  const name = (f) => f.title || '(кадр)';
  const isIcons = (f) => (D.icons || []).length && /^(Иконк|Icon)/.test(f.title);
  // G20–G23 and G02, G03 for one frame. Returns the drawn box (or null).
  function checkFrame(f, { live = false } = {}) {
    const doc = f.contentDocument;
    for (const l of doc.querySelectorAll('link[rel="stylesheet"]')) ok('G02', !!l.sheet, `${name(f)}: не загрузился ${l.getAttribute('href')}`);
    ok('G03', !/\bTODO\b|\bundefined\b|\bNaN\b|\[object [A-Z]/.test(doc.body.innerText), `${name(f)}: служебный текст в кадре`);
    ok('G23', live ? !f.hasAttribute('inert') : f.hasAttribute('inert'), `${name(f)}: ${live ? 'живой пример неактивен' : 'картинка состояния кликается'}`);
    // G27: a frame moved or shrunk inside its cell leaves no checkerboard showing (a numeric
    // viewport narrower than the cell may: the backdrop marks the viewport's edges).
    {
      const fr = f.getBoundingClientRect(), wr = f.parentElement.getBoundingClientRect();
      const open = fr.left > wr.left + 1 || fr.top > wr.top + 1 || Math.min(fr.right, wr.right) < wr.right - 1 || Math.min(fr.bottom, wr.bottom) < wr.bottom - 1;
      if (open && !/^\d+$/.test(f.dataset.width || '')) ok('G27', getComputedStyle(f.parentElement).backgroundImage === 'none', `${name(f)}: вокруг кадра видна шахматка — ячейка не закрыта его фоном`);
    }
    // G26: no width given — the desktop layout, past the component's own breakpoint.
    if (f.dataset.bp && !f.dataset.width) ok('G26', f.contentWindow.innerWidth > Number(f.dataset.bp), `${name(f)}: окно кадра ${f.contentWindow.innerWidth}px — на брейкпоинте компонента (≤ ${f.dataset.bp}px), показана раскладка для узкого экрана`);
    const box = drawnBox(f);
    const empty = !box && !f.parentElement.querySelector('.frame__note:not([hidden])');
    if (!ok('G20', !empty, `${name(f)}: пустой кадр (окно ${f.contentWindow.innerWidth}px)`) || !box) return box;
    const s = scaleOf(f), area = visibleArea(f);
    const w = (box.right - box.left) * s, h = (box.bottom - box.top) * s;
    ok('G21', w >= 8 && h >= 8 || (w >= 3 && h >= 3 && (s >= 0.999 || (box.right - box.left) * (box.bottom - box.top) < 120)), `${name(f)}: на экране ${Math.round(w)}×${Math.round(h)} px — не разглядеть (масштаб ${Math.round(s * 100)}%)`);
    ok('G22', (box.bottom <= area.h + 2 || f.dataset.crop === 'bottom') && box.top >= -2, `${name(f)}: обрезан по высоте — нарисовано до ${Math.round(box.bottom)}px, видно ${Math.round(area.h)}px`);
    ok('G22', box.left < area.w && box.right > 0, `${name(f)}: нарисованное вне видимой части по ширине`);
    // G28: a centred frame (its body is the flex centring) has what it draws in the middle of
    // its cell; a frame wider than the cell is cropped, not centred.
    {
      const fr = f.getBoundingClientRect(), wr = f.parentElement.getBoundingClientRect();
      const bcs = doc.defaultView.getComputedStyle(doc.body);
      const centred = !f.dataset.width && bcs.display === 'flex';
      // An element as wide as the frame lays its content out itself (a wrapping row of tags).
      const inner = doc.documentElement.clientWidth - parseFloat(bcs.paddingLeft) - parseFloat(bcs.paddingRight);
      const full = [...doc.body.children].some((e) => !/^(SCRIPT|STYLE|LINK)$/.test(e.tagName) && e.getBoundingClientRect().width >= inner - 1);
      if (centred && !full && wr.width > 0 && (box.right - box.left) * s < wr.width - 2) {
        const mid = fr.left + ((box.left + box.right) / 2) * s, want = (wr.left + wr.right) / 2;
        ok('G28', Math.abs(mid - want) <= 3, `${name(f)}: нарисованное не по центру — середина на ${Math.round(mid - wr.left)}px из ${Math.round(wr.width)}px ячейки`);
      }
    }
    // G24: text a person reads in the frame, at its size on screen.
    let small = null;
    for (const el of doc.body.querySelectorAll('*')) {
      if (!/\S/.test([...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(''))) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1 || r.top >= area.h || r.left >= area.w) continue;
      const px = parseFloat(doc.defaultView.getComputedStyle(el).fontSize) * s;
      if (!small || px < small.px) small = { px, text: el.textContent.trim().slice(0, 16) };
    }
    if (small) ok('G24', small.px >= 7, `${name(f)}: текст «${small.text}» на экране ${small.px.toFixed(1)} px — не прочитать`);
    return box;
  }
  function checkPage() {
    const text = main.innerText;
    ok('G03', !/\bTODO\b|\bundefined\b|\bNaN\b|\[object [A-Z]/.test(text), 'служебный текст на странице');
    ok('G10', !/^(Такого|Такой)/.test(main.querySelector('h1')?.textContent || ''), `нет такой страницы: ${main.querySelector('h1')?.textContent}`);
    ok('G10', !/Нет примеров/.test(text), 'страница без примеров');
    const crumbs = [...main.querySelectorAll('.crumbs > *:not([aria-hidden])')];
    if (crumbs.length) ok('G12', crumbs[crumbs.length - 1].textContent.trim() === main.querySelector('h1')?.textContent.trim().replace(/описание устарело$/, '').trim(), 'последняя крошка не совпадает с заголовком');
    for (const a of document.querySelectorAll('a[href^="#/"]')) links.add(a.getAttribute('href'));
    for (const f of iframes()) checkFrame(f, { live: !!f.closest('.frame--live') });
  }
  const links = new Set();
  const visited = new Set();

  // ── one variant page: tabs, width switch ────────────────────────────
  async function variantPage(c, v) {
    const bar = main.querySelector('.live .seg');
    ok('G30', !!bar === (v.preview.width === 'wide'), v.preview.width === 'wide' ? 'у широкого примера нет переключателя ширины' : 'переключатель ширины у нешироко примера');
    // States: captions.
    for (const cap of main.querySelectorAll('#panel-states .cell__label')) {
      ok('G50', cap.textContent.trim() && !/^state-\d+$|TODO/.test(cap.textContent.trim()), `подпись состояния «${cap.textContent.trim()}»`);
    }
    // Tabs.
    const tabs = [...main.querySelectorAll('[role="tab"]')];
    for (const t of tabs) {
      t.click();
      await frameTick();
      const shown = [...main.querySelectorAll('[role="tabpanel"]')].filter((p) => !p.hidden);
      ok('G40', shown.length === 1 && shown[0].id === 'panel-' + t.dataset.tab && shown[0].textContent.trim().length > 0, `вкладка «${t.textContent}»: видно ${shown.map((p) => p.id).join(', ') || 'ничего'}`);
    }
    if (tabs.length) {
      tabs[0].click(); tabs[0].focus();
      tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      ok('G40', tabs[tabs.length - 1].getAttribute('aria-selected') === 'true', 'стрелка влево с первой вкладки не ведёт на последнюю');
    }
    ok('G41', !/^(Варианты|Состояния|Показательные места|С чем сочетается)$/m.test([...main.querySelectorAll('#panel-guide h3')].map((h) => h.textContent).join('\n')), 'в «Как использовать» раздел для агентов');
    ok('G42', (main.querySelector('#panel-code pre')?.textContent || '').trim().length > 0, 'во вкладке «Код» нет разметки');
    for (const a of main.querySelectorAll('#panel-usages .lines a')) ok('G43', a.getAttribute('href') && a.getAttribute('href') !== '#', `строка ${a.textContent} без ссылки`);
    tabs[0]?.click();
    // G35: clicking anything in the live example keeps the example in the frame.
    {
      const f = main.querySelector('.frame--live iframe');
      const before = drawnBox(f);
      for (const el of f.contentDocument.querySelectorAll('a[href], button, input[type="submit"], input[type="button"], summary, [role="button"], [role="tab"], [role="link"]')) {
        el.click();
        await sleep(120);
        let here = false;
        try { here = f.contentWindow.location.href === 'about:srcdoc'; } catch {}
        if (!ok('G35', here, `клик по <${el.tagName.toLowerCase()}> «${(el.textContent || '').trim().slice(0, 20)}» увёл кадр живого примера на другую страницу`)) break;
      }
      ok('G35', !!before === !!drawnBox(f), 'после кликов в живом примере компонент пропал');
    }
    if (!bar) return;
    // Width switch.
    const live = () => main.querySelector('.frame--live iframe');
    const snap = () => { const f = live(), b = drawnBox(f); return { vw: f.contentWindow.innerWidth, bw: b ? Math.round(b.right - b.left) : 0, bh: b ? Math.round(b.bottom - b.top) : 0, fh: Math.round(parseFloat(f.style.height)) }; };
    const press = async (val) => { bar.querySelector(`[data-width="${val}"]`).click(); await sleep(250); await frameTick(); await sleep(150); };
    await press('desktop');
    const start = snap();
    const widths = [...bar.querySelectorAll('[data-width]')].map((b) => b.dataset.width);
    for (const val of widths) {
      await press(val);
      const f = live();
      const want = val === 'desktop' ? D.frame.desktop : val === 'fit' ? f.parentElement.clientWidth : Number(val);
      ok('G31', f.contentWindow.innerWidth === want, `ширина ${val}: окно кадра ${f.contentWindow.innerWidth}px, нужно ${want}`);
      ok('G31', [...bar.querySelectorAll('[data-width]')].every((b) => (b.getAttribute('aria-pressed') === 'true') === (b.dataset.width === val)), `ширина ${val}: нажата не та кнопка`);
      const sc = main.querySelector('.live__scale');
      ok('G31', (sc && !sc.hidden && sc.textContent.startsWith(`${want}px · `)) || f.parentElement.clientWidth === want, `ширина ${val}: подпись масштаба «${sc?.hidden ? '' : sc?.textContent}»`);
      const b = drawnBox(f);
      ok('G32', !!b || !!f.parentElement.querySelector('.frame__note:not([hidden])'), `ширина ${val}: пустой кадр без объяснения`);
    }
    for (let i = 0; i < 5; i++) for (const val of widths) await press(val);
    await press('desktop');
    const end = snap();
    ok('G33', JSON.stringify(start) === JSON.stringify(end), `после переключений ширины картинка другая: было ${JSON.stringify(start)}, стало ${JSON.stringify(end)}`);
    // G34: a narrow choice left for the next page.
    const narrow = widths.filter((w) => /^\d+$/.test(w)).pop();
    await press(narrow);
    await go(location.hash);
    const f = live();
    ok('G34', !!drawnBox(f) || !!f.parentElement.querySelector('.frame__note:not([hidden])'), `открыта при ширине ${narrow}: пустой кадр без объяснения`);
    main.querySelector('.live .seg [data-width="desktop"]')?.click();
    await sleep(200);
  }

  // ── search and sidebar ──────────────────────────────────────────────
  async function searchAndSide() {
    await go('#/');
    const q = document.getElementById('q');
    const c = D.components[0];
    if (c) {
      q.value = c.name; q.dispatchEvent(new Event('input')); await settle();
      ok('G70', [...main.querySelectorAll('.card__name')].some((n) => n.textContent.includes(c.name)), `поиск «${c.name}»: карточки нет`);
      q.value = 'щщщъъъzzz'; q.dispatchEvent(new Event('input')); await settle();
      ok('G70', /ничего нет/.test(main.textContent), 'поиск бессмыслицы: нет «ничего нет»');
      q.focus(); q.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await settle();
      ok('G70', q.value === '' && main.querySelectorAll('.card').length > 0, 'Escape не очистил поиск');
    }
    // G72: a narrow window puts the menu in one line.
    if (innerWidth <= 900) {
      const tops = [...document.querySelectorAll('#side .side__row')].filter((r) => r.offsetParent).map((r) => Math.round(r.getBoundingClientRect().top + r.offsetHeight / 2));
      ok('G72', new Set(tops).size <= 1, `в узком окне пункты меню на разной высоте: ${[...new Set(tops)].join(', ')}`);
    }
    const chev = document.querySelector('#side .side__row--head [data-expand]');
    if (chev) {
      const key = chev.dataset.expand;
      chev.click(); await frameTick();
      const after = document.querySelector(`#side [data-expand="${key}"]`);
      ok('G71', after?.getAttribute('aria-expanded') === 'false', 'шеврон раздела не свернул список');
      after?.click(); await frameTick();
      ok('G71', document.querySelector(`#side [data-expand="${key}"]`)?.getAttribute('aria-expanded') === 'true', 'шеврон раздела не развернул список');
    }
  }

  // ── the walk ────────────────────────────────────────────────────────
  async function run() {
    const hashes = ['#/'];
    for (const c of D.components) {
      hashes.push(`#/c/${c.id}`);
      if (c.variants.length > 1) for (const v of c.variants) hashes.push(`#/c/${c.id}/${v.id}`);
    }
    if ((D.tokens || []).length) {
      hashes.push('#/tokens');
      for (const k of new Set(D.tokens.map((t) => t.kind))) hashes.push(`#/t/${k}`);
      for (const t of D.tokens) hashes.push(`#/t/${t.kind}/${t.id}`);
      if ((D.textStyles || []).some((s) => s.library)) hashes.push('#/t/font');
    }
    if ((D.icons || []).length) hashes.push('#/icons');
    const COMPOSITES = D.composites || [];
    if (COMPOSITES.length) hashes.push('#/composites');
    for (const c of COMPOSITES) hashes.push(`#/c/${c.id}`);
    for (const h of hashes) {
      await go(h);
      visited.add(h);
      checkPage();
      const [, kind, cid, vid] = h.split('/');
      const c = kind === 'c' && [...D.components, ...COMPOSITES].find((x) => x.id === cid);
      // G13: a section of composites in the menu, a card each on #/composites.
      if (h === '#/composites') {
        const rows = [...document.querySelectorAll('#side a[href^="#/c/"]')].map((a) => a.getAttribute('href').slice(4));
        ok('G13', !!document.querySelector('#side a[href="#/composites"]') && COMPOSITES.every((x) => rows.includes(x.id)), `в меню нет раздела «Составные» или строк: ${COMPOSITES.filter((x) => !rows.includes(x.id)).map((x) => x.id).join(', ')}`);
        ok('G13', main.querySelectorAll('.card').length === COMPOSITES.length, `карточек составных ${main.querySelectorAll('.card').length} из ${COMPOSITES.length}`);
      }
      if (c) {
        if (c.variants.length > 1 && !vid) ok('G11', main.querySelectorAll('#variants .card').length === c.variants.length, `карточек видов ${main.querySelectorAll('#variants .card').length} из ${c.variants.length}`);
        const v = c.variants.length > 1 ? c.variants.find((x) => x.id === vid) : c.variants[0];
        if (v && (vid || c.variants.length === 1)) await variantPage(c, v);
      }
      if (h === '#/icons') for (const img of main.querySelectorAll('.icons img')) ok('G63', img.complete && img.naturalWidth > 0, `иконка не загрузилась: ${img.getAttribute('src')}`);
      // G60: a card per token kind, a card per token of a kind.
      if (h === '#/tokens') ok('G60', main.querySelectorAll('.card').length === new Set(D.tokens.map((t) => t.kind).concat((D.textStyles || []).some((s) => s.library) ? ['font'] : [])).size, `карточек видов токенов ${main.querySelectorAll('.card').length}`);
      const kindPage = /^#\/t\/([^/]+)$/.exec(h);
      if (kindPage && kindPage[1] !== 'font') ok('G60', main.querySelectorAll('.card').length === D.tokens.filter((t) => t.kind === kindPage[1]).length, `карточек токенов ${main.querySelectorAll('.card').length} из ${D.tokens.filter((t) => t.kind === kindPage[1]).length}`);
      if (h === '#/t/font') {
        // G62: every style of the library scale is a row with its own page.
        const rows = [...main.querySelectorAll('a.type-row')];
        ok('G62', rows.length === (D.textStyles || []).filter((s) => s.library).length && rows.every((a) => /^#\/t\/font\/ts-/.test(a.getAttribute('href'))), `строк стилей ${rows.length} из ${(D.textStyles || []).filter((s) => s.library).length}`);
        for (const a of main.querySelectorAll('a.type-row')) links.add(a.getAttribute('href'));
        for (const sec of main.querySelectorAll('.type-family')) {
          const names = [...sec.querySelectorAll('a.type-row .type-row__sample')].map((x) => x.textContent.trim());
          ok('G64', new Set(names).size === names.length, `в «${sec.querySelector('h2')?.textContent.trim()}» одинаковые названия стилей: ${names.filter((x, i) => names.indexOf(x) !== i).join(', ')}`);
        }
      }
      if (/^#\/t\/[^/]+\/[^/]+$/.test(h)) ok('G61', !!main.querySelector('.facts-grid a'), 'у токена нет ссылки «Где задан»');
    }
    // G10: every link met on the way leads somewhere.
    for (const h of [...links].filter((x) => !visited.has(x))) { await go(h); visited.add(h); checkPage(); }
    await searchAndSide();
    where = 'вся галерея';
    ok('G01', errors.length === 0, `ошибки JavaScript: ${errors.slice(0, 5).join(' | ')}`);
    out.done = true;
    report();
  }

  function report() {
    const box = document.createElement('section');
    box.id = 'uic-selftest';
    box.setAttribute('style', 'position:fixed;left:0;right:0;bottom:0;max-height:45vh;overflow:auto;z-index:99;background:#fff;border-top:3px solid ' + (out.failed.length ? '#d33' : '#2a2') + ';font:13px/1.45 system-ui;padding:12px 16px;box-shadow:0 -4px 16px rgba(0,0,0,.1)');
    const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    box.innerHTML = `<b>selftest: ${out.failed.length ? `провалов ${out.failed.length}` : 'всё прошло'}</b> · страниц ${out.pages}, проверок ${out.checks}` +
      (out.failed.length ? `<ul style="margin:6px 0 0;padding-left:18px">${out.failed.map((x) => `<li><b>${x.id}</b> <a href="${esc(x.where)}">${esc(x.where)}</a> — ${esc(x.msg)}</li>`).join('')}</ul>` : '');
    document.body.append(box);
    // ?selftest&report: scripts/gallery-test.mjs serves the page and waits for the result.
    if (/[?&]report(?:[=&]|$)/.test(location.search)) fetch('/__uic-selftest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pages: out.pages, checks: out.checks, failed: out.failed }) }).catch(() => {});
  }

  // After app.js has rendered the first page.
  setTimeout(() => run().catch((e) => { out.failed.push({ id: 'G01', where, msg: 'раннер упал: ' + e.message }); out.done = true; report(); }), 300);
})();
