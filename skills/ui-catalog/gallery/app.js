/* ui-catalog gallery. Static: reads window.UI_CATALOG from data.js.
   Every example renders in its own iframe with the project's CSS.

   Routes:  #/                    all components
            #/c/<id>              a component: its variants (or the only one)
            #/c/<id>/<variant>    one variant: live example + tabs
            #/tokens  #/icons  #/undocumented                                   */
(() => {
  const D = window.UI_CATALOG;
  // The chrome in the project's accent and text face.
  for (const [k, v] of Object.entries(D.theme?.vars || {})) document.documentElement.style.setProperty(k, v);
  const main = document.getElementById('main');
  const side = document.getElementById('side');
  const q = document.getElementById('q');

  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // Composites (React) have pages like components, in their own section of the menu.
  const COMPOSITES = D.composites || [];
  const byId = new Map([...D.components, ...COMPOSITES].map((c) => [c.id, c]));
  // ?eager loads every frame at once (checks, printing); default is lazy.
  // ?selftest runs the A cases of references/gallery-cases.md (selftest.js) over every page.
  const SELFTEST = /[?&]selftest(?:[=&]|$)/.test(location.search);
  const EAGER = SELFTEST || /[?&]eager(?:[=&]|$)/.test(location.search);

  const store = {
    get(k, d) { try { const v = localStorage.getItem('uic:' + D.project + ':' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('uic:' + D.project + ':' + k, JSON.stringify(v)); } catch {} },
  };
  // width: 'desktop' (default), a number, or 'fit' — as wide as the panel.
  const ui = { sort: store.get('sort', 'name'), width: store.get('width', 'desktop'), tab: store.get('tab', 'states') };
  if (ui.width === 'auto') ui.width = 'desktop'; // stored by an older gallery

  // ── helpers ──────────────────────────────────────────────────────────
  let toastTimer;
  const toast = (text) => {
    let t = document.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.append(t); }
    t.textContent = text; t.classList.add('toast--on');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('toast--on'), 1400);
  };
  const copy = async (text, what = 'Скопировано') => {
    try { await navigator.clipboard.writeText(text); }
    catch { const ta = document.createElement('textarea'); ta.value = text; document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
    toast(what);
  };
  // Only a problem gets a badge: the code changed after the description was written.
  const warnings = (c) => [
    c.stale ?'<span class="badge badge--bad" title="Код, описание или примеры изменились после печати">описание устарело</span>' : '',
  ].join('');
  const haystack = (c) => [c.name, c.id, c.job, ...(c.intents || []), ...c.units, ...c.variants.map((v) => v.name || '')].join(' ').toLowerCase();
  const matches = (c) => !q.value || q.value.toLowerCase().split(/\s+/).filter(Boolean).every((w) => haystack(c).includes(w));
  // Components that share `group` sit under one entry: «Avatar» → Static, Interactive.
  const slug = (s) => String(s).toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '-').replace(/^-|-$/g, '');
  const GROUPS = new Map();
  for (const c of D.components) if (c.group) {
    const id = slug(c.group);
    (GROUPS.get(id) || GROUPS.set(id, { id, name: c.group, members: [] }).get(id)).members.push(c);
  }
  // The plain (static) member leads; the rest follow by name.
  for (const g of GROUPS.values()) g.members.sort((a, b) => (a.element !== 'static') - (b.element !== 'static') || (a.label || a.name).localeCompare(b.label || b.name, 'ru'));
  const groupOf = (c) => (c.group ? GROUPS.get(slug(c.group)) : null);
  const labelOf = (c) => (c.group && c.label) || c.name;
  // Top-level entries: a component, or a group of components.
  const listed = (src = D.components) => {
    const seen = new Set();
    const out = [];
    for (const c of src.filter(matches)) {
      const g = groupOf(c);
      if (!g) { out.push({ kind: 'c', id: c.id, name: c.name, c, usage: c.usageCount }); continue; }
      if (seen.has(g.id)) continue;
      seen.add(g.id);
      out.push({ kind: 'g', id: g.id, name: g.name, g, usage: g.members.reduce((n, m) => n + m.usageCount, 0) });
    }
    if (ui.sort === 'usage') out.sort((a, b) => b.usage - a.usage || a.name.localeCompare(b.name, 'ru'));
    else out.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    return out;
  };
  const many = (c) => c.variants.length > 1;
  const variantOf = (c, vid) => c.variants.find((v) => v.id === vid) || (many(c) ? null : c.variants[0]);
  const hrefOf = (c, v) => (v && many(c) ? `#/c/${c.id}/${v.id}` : `#/c/${c.id}`);

  // ── frames ───────────────────────────────────────────────────────────
  const frames = new Map();
  let seq = 0;
  function reporter(id) {
    var last = -1, grow = 0;
    // The live example is clickable, but it is a picture of the product, not the product:
    // a link (`href="#"` resolves against the gallery's own address in a srcdoc frame) or a
    // form would load another page into the frame and the component would be gone for good.
    document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('a[href], area[href]')) e.preventDefault(); }, true);
    document.addEventListener('submit', function (e) { e.preventDefault(); }, true);
    // Right edge of what is actually drawn: leaf elements, so a block that merely
    // stretches (display:flex on a nav) does not count as wide content.
    function contentRight() {
      var r = 0, els = document.body.querySelectorAll('*');
      for (var i = 0; i < els.length; i++) {
        if (els[i].children.length || els[i].tagName === 'SCRIPT') continue;
        var b = els[i].getBoundingClientRect();
        if (b.width && b.right > r) r = b.right;
      }
      return r ? Math.ceil(r + parseFloat(getComputedStyle(document.body).paddingRight || 0)) : 0; // 0: nothing drawn
    }
    // Left and right of what paints (text, a replaced element, a background, a border, a
    // shadow) — the same as the selftest's drawn box: the frame is centred on it (G28).
    function seen(c) { return c && c !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(c); }
    function paints(el, cs) {
      if (/^(IMG|SVG|svg|INPUT|SELECT|TEXTAREA|CANVAS|VIDEO|HR|PROGRESS|METER)$/.test(el.tagName)) return true;
      for (var n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 3 && n.textContent.trim()) return true;
      if (seen(cs.backgroundColor) || cs.backgroundImage !== 'none' || cs.boxShadow !== 'none') return true;
      var sides = ['Top', 'Right', 'Bottom', 'Left'];
      for (var k = 0; k < 4; k++) if (parseFloat(cs['border' + sides[k] + 'Width']) > 0 && cs['border' + sides[k] + 'Style'] !== 'none' && seen(cs['border' + sides[k] + 'Color'])) return true;
      return false;
    }
    function paintedX() {
      var l = Infinity, r = 0, els = document.body.querySelectorAll('*');
      for (var i = 0; i < els.length; i++) {
        if (/^(SCRIPT|STYLE|LINK|TEMPLATE|META)$/.test(els[i].tagName)) continue;
        var b = els[i].getBoundingClientRect();
        if (b.width < 1 || b.height < 1) continue;
        var cs = getComputedStyle(els[i]);
        if (cs.visibility === 'hidden' || Number(cs.opacity) === 0 || !paints(els[i], cs)) continue;
        if (b.left < l) l = b.left;
        if (b.right > r) r = b.right;
      }
      return r ? [Math.floor(l), Math.ceil(r)] : null;
    }
    function post() {
      // scrollHeight also counts what sticks out of the flow — an underline drawn by an
      // absolutely positioned ::before 55px below its link is part of the picture.
      var h = Math.ceil(Math.max(document.documentElement.getBoundingClientRect().height, document.body.scrollHeight));
      var w = contentRight(), x = paintedX(), xs = String(x);
      // A new viewport width (the width switch) is a new layout: the guard starts over.
      // Without that, a few switches used up the guard and the frame kept its last,
      // smallest height for good — the component vanished.
      if (innerWidth !== lastVW) { lastVW = innerWidth; grow = 0; }
      if (h === last && w === lastW && xs === lastX) return;
      if (h > last && last > 0) grow++;
      if (grow > 6) return; // a min-height:100vh loop — stop following it
      last = h; lastW = w; lastX = xs;
      parent.postMessage({ uic: id, h: h, w: w, x: x }, '*');
    }
    var lastW = -1, lastX = '', lastVW = innerWidth;
    window.__uicMeasure = post; // the gallery asks after it changes the frame's width
    new ResizeObserver(post).observe(document.documentElement);
    addEventListener('load', post);
    if (document.fonts) document.fonts.ready.then(post);
    post();
  }
  function srcdoc(comp, st, id, live, thumb) {
    // Pinned states: the same stylesheets with [data-pseudo] next to each :hover/:focus rule.
    const sheets = [...D.frame.styles, ...(comp.styles || [])];
    const styles = (live ? sheets : sheets.map((h) => D.frame.pinned?.[h] || h)).map((h) => `<link rel="stylesheet" href="${esc(h)}">`).join('');
    const pad = st.pad != null && st.pad !== '' ? Number(st.pad) : D.frame.pad;
    const bg = st.bg || D.frame.bg;
    // Components sit in the middle of their backdrop; page-wide blocks keep normal flow.
    const center = st.width !== 'wide' && st.width !== 'fill' && !st.height
      ? 'display:flex;flex-wrap:wrap;gap:12px;align-items:center;align-content:center;justify-content:center;box-sizing:border-box;min-height:100vh;' : '';
    // A component's outer margins place it on a page: in a centred frame it has none.
    const unplace = center ? 'body>*{margin:0!important}' : '';
    // A card preview is cropped, never scrolled.
    const crop = thumb ? 'html{overflow:hidden}' : '';
    // A composite's window or header stands over the page (position: fixed / sticky): in its
    // frame it is laid in the flow, as tall as its content, so the frame shows all of it.
    // A scroll of its own inside it is unrolled: a long form in a window is shown whole.
    const unfix = comp.composite ? `<script>for (const el of document.querySelectorAll('body *')) { if (!/^(fixed|sticky)$/.test(getComputedStyle(el).position)) continue; Object.assign(el.style, { position: 'relative', inset: 'auto', top: 'auto', bottom: 'auto', height: 'auto', minHeight: '0' }); for (const x of [el, ...el.querySelectorAll('*')]) { const cs = getComputedStyle(x); if (/^(auto|scroll)$/.test(cs.overflowY)) Object.assign(x.style, { overflowY: 'visible', maxHeight: 'none' }); } }<\/script>` : '';
    return `<!doctype html><html lang="${esc(D.lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">${styles}` +
      `<style>html,body{margin:0;min-height:0}body{padding:${pad}px;background:${bg};${center}}${unplace}${crop}</style></head><body>${live ? st.clean : st.html}` +
      `${unfix}<script>(${reporter})(${JSON.stringify(id)})<\/script></body></html>`;
  }
  function frameWidth(f) {
    // A composite the project hides at the desktop width (a banner for phones): at 375.
    if (f.narrow) return f.narrow;
    if (typeof f.st.width === 'number') return f.st.width;
    if (f.thumb) return f.st.width === 'wide' ? D.frame.desktop : 0;
    if (f.live && f.st.width === 'wide') return ui.width === 'fit' ? 0 : ui.width === 'desktop' ? D.frame.desktop : Number(ui.width) || D.frame.desktop;
    return f.st.width === 'wide' ? D.frame.desktop : 0;
  }
  function layout(f) {
    const cw = f.wrap.clientWidth;
    if (!cw) return;
    // No width given: the component as on a desktop. A cell at or under the component's
    // own breakpoint would show its phone layout (a select stretched to 100%): the
    // viewport goes past the breakpoint, the content is laid from the left and moved
    // into the middle of the cell.
    const past = !frameWidth(f) && f.st.width == null && f.bp && cw <= f.bp ? f.bp + 1 : 0;
    const W = past || frameWidth(f) || cw;
    try { const b = f.iframe.contentDocument?.body; if (b && b.style.justifyContent !== (past ? 'flex-start' : '')) b.style.justifyContent = past ? 'flex-start' : ''; } catch {}
    // A wide viewport (for the page's media queries) around a small component: show it
    // at 100% and crop the empty right side instead of shrinking it unreadable.
    // Laid from the left (past a breakpoint, a wide block): what is drawn ends where its
    // paint does — a select's padding and border past its last text — plus the padding on
    // its left; the right edge of the last text alone cut the select's border (G28).
    const laidLeft = past || f.st.width === 'wide' || f.st.width === 'fill';
    const drawnW = laidLeft && f.x ? Math.max(f.w, f.x[1] + f.x[0]) : f.w;
    const crop = W > cw && !f.thumb && drawnW > 0 && drawnW <= cw;
    // A card preview of a wide block: scale to what is drawn, but never below 60% — text
    // stays readable; what does not fit is cropped (a menu shows its first items).
    const thumbWide = f.thumb && W > cw && drawnW > 0;
    let s = crop ? 1 : thumbWide ? Math.min(1, Math.max(cw / drawnW, 0.6)) : Math.min(1, cw / W);
    // A card preview of a tall composite (a window): scaled to fit its height too, not below 60%.
    const tall = f.thumb && f.comp.composite && f.rawH * s > f.wrap.clientHeight + 1;
    if (tall) s = Math.min(s, Math.max(f.wrap.clientHeight / f.rawH, 0.6));
    // Taller still: the card shows its top, cut below (G22 knows it by data-crop).
    if (tall && f.rawH * s > f.wrap.clientHeight + 1) f.iframe.dataset.crop = 'bottom'; else delete f.iframe.dataset.crop;
    // A new viewport width: measure the frame now rather than wait for its observer,
    // which a browser may hold back (a hidden tab) — the height and the note follow it.
    if (f.iframe.style.width !== W + 'px') setTimeout(() => { try { f.iframe.contentWindow.__uicMeasure?.(); } catch {} });
    f.iframe.style.width = W + 'px';
    // A viewport narrower than its cell (768 in a wide cell) stands in the middle, not
    // against the left edge with a strip of backdrop on the right.
    f.iframe.style.marginLeft = !f.thumb && W < cw ? `${Math.floor((cw - W) / 2)}px` : '';
    // A card preview is exactly as tall as its card slot, so centred content sits in the middle of it.
    f.iframe.style.height = (f.thumb ? f.wrap.clientHeight / s : f.h) + 'px';
    // …and centred in its card like every other preview.
    // Centred on what paints (G28), else on the right edge of the content.
    const mid = f.x ? (f.x[0] + f.x[1]) / 2 : f.w / 2;
    // A card preview may move left too, as long as the frame still covers its cell (G27, G28).
    const dx = f.thumb && (thumbWide || tall || (past && f.w > 0)) ? Math.max(Math.min(0, cw - W * s), cw / 2 - mid * s)
      : thumbWide || (past && f.w > 0) ? Math.max(0, cw / 2 - mid * s) : 0;
    const dy = thumbWide && f.rawH ? Math.max(0, (f.wrap.clientHeight - f.rawH * s) / 2) : 0;
    // The cell around a moved frame is the frame's backdrop, not the checkerboard.
    f.wrap.style.background = dx || dy || thumbWide || tall ? f.st.bg || D.frame.bg : '';
    f.iframe.style.transform = [dx || dy ? `translate(${Math.round(dx)}px, ${Math.round(dy)}px)` : '', s < 1 ? `scale(${s})` : ''].filter(Boolean).join(' ');
    if (!f.thumb) f.wrap.style.height = Math.ceil(f.h * s) + 'px';
    if (f.scale) { f.scale.hidden = W === cw; f.scale.textContent = `${W}px · ${Math.round(s * 100)}%`; }
    // The width switch can pick a width where the project's CSS hides the component:
    // say so instead of showing a blank frame.
    // A composite empty at the desktop width and at 375 too: no rows without data — said in words.
    const none = f.comp.composite && f.narrow && f.drawn === false;
    const blank = (f.live && f.st.width === 'wide' && ui.width !== 'desktop' && f.drawn === false) || none;
    let note = f.wrap.querySelector('.frame__note');
    if (blank && !note) { note = document.createElement('p'); note.className = 'frame__note'; f.wrap.append(note); }
    if (note) { note.hidden = !blank; note.textContent = none ? 'Без данных здесь пусто — ни на десктопе, ни на 375 px компонент ничего не показывает: строк и карточек нет.' : `На ширине ${W} px здесь пусто — стили проекта прячут это на такой ширине.`; }
  }
  // Laid out after the callback: resizing inside it makes the browser report a loop error.
  const ro = new ResizeObserver((entries) => setTimeout(() => entries.forEach((e) => { const f = frames.get(e.target.dataset.fid); if (f) layout(f); })));
  // A hidden tab never runs the observer: the selftest walks there too and lays out first.
  window.__uicRelayout = () => frames.forEach((f) => layout(f));
  const io = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (!e.isIntersecting) return;
    const f = frames.get(e.target.dataset.fid);
    if (f && !f.iframe.srcdoc) f.iframe.srcdoc = f.doc;
    io.unobserve(e.target);
  }), { rootMargin: '200px' });
  addEventListener('message', (e) => {
    const d = e.data;
    if (!d || !d.uic) return;
    const f = frames.get(d.uic);
    if (!f || f.fixed) return;
    f.h = Math.max(f.min, Math.min(d.h, f.comp.composite ? 6000 : 1800));
    f.w = d.w || 0;
    f.x = d.x || null;
    f.rawH = d.h;
    f.drawn = f.w > 0;
    if (!f.drawn && f.comp.composite && !f.narrow && f.st.width == null) { f.narrow = 375; f.iframe.dataset.width = '375'; }
    layout(f);
  });
  // live: real interaction (no pinned pseudo-states). Everything else — card
  // previews and states — is a still picture: no hover, no focus, no clicks.
  function frame(comp, st, { thumb = false, live = false, scale = null } = {}) {
    const id = 'f' + (++seq);
    const wrap = document.createElement('div');
    wrap.className = 'frame' + (live ? ' frame--live' : ' frame--still');
    wrap.dataset.fid = id;
    const iframe = document.createElement('iframe');
    iframe.title = `${comp.name}: ${st.label}`;
    if (!live) { iframe.tabIndex = -1; iframe.setAttribute('inert', ''); }
    if (thumb) iframe.setAttribute('aria-hidden', 'true');
    wrap.append(iframe);
    // Minimum backdrop height: centred components need room to sit in the middle.
    const min = thumb ? 150 : live ? 160 : (st.width === 'wide' || st.width === 'fill') ? 24 : 120;
    const f = { id, wrap, iframe, st, comp, thumb, live, scale, min, h: st.height || min, fixed: !!st.height, doc: srcdoc(comp, st, id, live, thumb), bp: comp.breakpoint || 0 };
    if (f.bp) iframe.dataset.bp = f.bp; // for selftest G26
    iframe.dataset.width = st.width ?? '';
    frames.set(id, f);
    ro.observe(wrap);
    if (EAGER || live) iframe.srcdoc = f.doc;
    else {
      io.observe(wrap);
      // Hidden or embedded views may never report intersection: load anyway, staggered.
      setTimeout(() => { if (frames.get(id) === f && !iframe.srcdoc) iframe.srcdoc = f.doc; }, 700 + frames.size * 40);
    }
    queueMicrotask(() => layout(f)); // the caller has attached it by now
    return wrap;
  }
  const resetFrames = () => { frames.clear(); ro.disconnect(); io.disconnect(); };

  function stateGrid(c, states) {
    const grid = document.createElement('div');
    grid.className = 'states';
    for (const st of states) {
      const cell = document.createElement('figure');
      // A component with its own breakpoint is drawn past it (G26): in a narrow cell that
      // viewport would be shrunk until the text is unreadable (G24), so it takes the row.
      const wide = st.width === 'wide' || st.width === 'fill' || (typeof st.width === 'number' && st.width >= 600) || (c.breakpoint && st.width == null);
      cell.className = 'cell' + (wide ? ' cell--wide' : '');
      const scale = document.createElement('span');
      scale.className = 'cell__scale';
      scale.hidden = true;
      cell.append(frame(c, st, { scale }));
      const cap = document.createElement('figcaption');
      cap.className = 'cell__foot';
      cap.innerHTML = `<span class="cell__label">${esc(st.label)}</span>` +
        (st.note ? `<span class="cell__note" title="${esc(st.note)}">${st.noteHref ? `<a href="${esc(st.noteHref)}">${esc(st.note)}</a>` : esc(st.note)}</span>` : '');
      cap.append(scale);
      cell.append(cap);
      grid.append(cell);
    }
    return grid;
  }

  // ── sidebar ──────────────────────────────────────────────────────────
  const expanded = new Set(); // components showing their variants
  const folded = new Set(); // sections the user closed (open by default)
  const CHEVRON = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function renderSide(route) {
    const [kind, cid, vid] = route.split('/');
    const cur = (on) => (on ? ' aria-current="page"' : '');
    const list = listed();
    const row = (on, extra, inner) => `<div class="side__row${on ? ' side__row--on' : ''}${extra}">${inner}</div>`;
    const kinds = tokenKinds();
    const chev = (key, open, label) => `<button type="button" class="side__chev" data-expand="${esc(key)}" aria-expanded="${open}" aria-label="${open ? 'Свернуть' : 'Развернуть'}: ${esc(label)}">${CHEVRON}</button>`;
    // A section head is a row like any other: link + chevron that folds the list under it.
    const section = (key, href, label, on, body) => {
      const open = !folded.has(key);
      return row(on, ` side__row--head${open ? ' is-open' : ''}`, `<a href="${href}"${cur(on)}>${label}</a>${body ? chev(key, open, label) : ''}`) +
        (body && open ? body : '');
    };
    side.innerHTML =
      section('components', '#/', 'Все компоненты', !route, `<div class="side__list">
        ${list.map((e) => {
          if (e.kind === 'g') {
            const key = 'g:' + e.id;
            const here = (kind === 'g' && cid === e.id) || (kind === 'c' && e.g.members.some((m) => m.id === cid));
            const open = expanded.has(key);
            return row(kind === 'g' && cid === e.id, `${here ? ' is-here' : ''}${open ? ' is-open' : ''}`,
              `<a href="#/g/${esc(e.id)}"${cur(kind === 'g' && cid === e.id)}>${esc(e.name)}</a>` + chev(key, open, e.name)) +
              (open ? `<div class="side__sub">${e.g.members.map((m) => row(kind === 'c' && cid === m.id, '', `<a href="#/c/${esc(m.id)}"${cur(kind === 'c' && cid === m.id)}>${esc(labelOf(m))}</a>`)).join('')}</div>` : '');
          }
          const c = e.c;
          const here = kind === 'c' && cid === c.id;
          if (!many(c)) return row(here, '', `<a href="#/c/${esc(c.id)}"${cur(here)}>${esc(c.name)}</a>`);
          const open = expanded.has(c.id);
          return row(here && !vid, `${here ? ' is-here' : ''}${open ? ' is-open' : ''}`,
            `<a href="#/c/${esc(c.id)}"${cur(here && !vid)}>${esc(c.name)}</a>` + chev(c.id, open, c.name)) +
            (open ? `<div class="side__sub">${c.variants.map((v) => row(here && vid === v.id, '', `<a href="${hrefOf(c, v)}"${cur(here && vid === v.id)}>${esc(v.name)}</a>`)).join('')}</div>` : '');
        }).join('') || '<p class="hint side__empty">Ничего не найдено</p>'}
      </div>`) +
      (COMPOSITES.length ? section('composites', '#/composites', 'Составные', route === 'composites', `<div class="side__list">
        ${listed(COMPOSITES).map((e) => row(kind === 'c' && cid === e.id, '', `<a href="#/c/${esc(e.id)}"${cur(kind === 'c' && cid === e.id)}>${esc(e.name)}</a>`)).join('') || '<p class="hint side__empty">Ничего не найдено</p>'}
      </div>`) : '') +
      (kinds.length ? section('tokens', '#/tokens', 'Токены', route === 'tokens',
        `<div class="side__list">${kinds.map(([k, name]) => row(kind === 't' && cid === k, '', `<a href="#/t/${k}"${cur(kind === 't' && cid === k && !vid)}>${name}</a>`)).join('')}</div>`) : '') +
      (D.icons.length ? section('icons', '#/icons', 'Иконки', route === 'icons', '') : '') +
      (D.undocumented.length ? section('undocumented', '#/undocumented', 'Без описания', route === 'undocumented', '') : '');
  }

  const crumbs = (parts) => `<nav class="crumbs" aria-label="Путь">${parts.map(([href, text], i) =>
    i < parts.length - 1 ? `<a href="${href}">${esc(text)}</a><span aria-hidden="true">/</span>` : `<span aria-current="page">${esc(text)}</span>`).join('')}</nav>`;

  // ── all components ───────────────────────────────────────────────────
  function pageOverview(src = D.components, title = 'Компоненты') {
    const list = listed(src);
    main.innerHTML = `<div class="page">
      <div class="title-row"><h1>${title}</h1>
        <label class="sort">Порядок <select data-set="sort">
          <option value="name"${ui.sort === 'name' ? ' selected' : ''}>по алфавиту</option>
          <option value="usage"${ui.sort === 'usage' ? ' selected' : ''}>часто используемые</option>
        </select></label></div>
      ${list.length ? '<div class="cards" id="cards"></div>' : `<div class="empty">По запросу «${esc(q.value)}» ничего нет.</div>`}
    </div>`;
    const cards = document.getElementById('cards');
    for (const e of list) {
      const a = document.createElement('a');
      a.className = 'card';
      if (e.kind === 'g') {
        const first = e.g.members[0];
        a.href = `#/g/${e.id}`;
        a.innerHTML = `<div class="card__preview"></div><div class="card__body">
          <div class="card__name">${esc(e.name)}</div>
          <div class="card__job">${e.g.members.map((m) => esc(labelOf(m))).join(' · ')}</div></div>`;
        if (first?.variants[0]) a.firstElementChild.append(frame(first, first.variants[0].preview, { thumb: true }));
      } else {
        const c = e.c, v = c.variants[0];
        a.href = `#/c/${c.id}`;
        a.innerHTML = `<div class="card__preview${c.composite ? ' card__preview--tall' : ''}"></div><div class="card__body">
          <div class="card__name">${esc(c.name)}${warnings(c)}</div>
          <div class="card__job">${esc(c.job)}</div>
          ${many(c) ? `<div class="card__meta">${c.variants.map((x) => esc(x.name || x.id)).join(' · ')}</div>` : ''}</div>`;
        if (v) a.firstElementChild.append(frame(c, v.preview, { thumb: true }));
      }
      cards?.append(a);
    }
  }

  // ── a group of components: «Avatar» → Static, Interactive ──────────
  function pageGroup(g) {
    main.innerHTML = `<div class="page">
      ${crumbs([['#/', 'Компоненты'], ['', g.name]])}
      <h1>${esc(g.name)}</h1>
      <div class="cards cards--variants" id="members"></div>
    </div>`;
    const host = document.getElementById('members');
    for (const m of g.members) {
      const a = document.createElement('a');
      a.className = 'card';
      a.href = `#/c/${m.id}`;
      a.innerHTML = `<div class="card__preview"></div><div class="card__body"><div class="card__name">${esc(labelOf(m))}${warnings(m)}</div><div class="card__job">${esc(m.job)}</div></div>`;
      if (m.variants[0]) a.firstElementChild.append(frame(m, m.variants[0].preview, { thumb: true }));
      host.append(a);
    }
  }
  // Breadcrumbs up to a component: through its group when it has one.
  const trail = (c) => {
    if (c.composite) return [['#/composites', 'Составные'], [`#/c/${c.id}`, c.name]];
    const g = groupOf(c);
    return g ? [['#/', 'Компоненты'], [`#/g/${g.id}`, g.name], [`#/c/${c.id}`, labelOf(c)]] : [['#/', 'Компоненты'], [`#/c/${c.id}`, c.name]];
  };
  const last = (parts) => parts.map((p, i) => (i === parts.length - 1 ? ['', p[1]] : p));

  // ── a component with several variants ───────────────────────────────
  function pageFamily(c) {
    main.innerHTML = `<div class="page">
      ${crumbs(last(trail(c)))}
      <h1>${esc(labelOf(c))}${warnings(c)}</h1>
      <h2 class="sr-only">Виды</h2>
      <div class="cards cards--variants" id="variants"></div>
      ${c.shared.length ? '<h2>Общие примеры</h2><div id="shared"></div>' : ''}
    </div>`;
    const host = document.getElementById('variants');
    for (const v of c.variants) {
      const a = document.createElement('a');
      a.className = 'card';
      a.href = hrefOf(c, v);
      a.innerHTML = `<div class="card__preview"></div><div class="card__body"><div class="card__name">${esc(v.name)}</div>${v.about ? `<div class="card__job">${esc(v.about)}</div>` : ''}</div>`;
      a.firstElementChild.append(frame(c, v.preview, { thumb: true }));
      host.append(a);
    }
    if (c.shared.length) document.getElementById('shared').append(stateGrid(c, c.shared));
  }

  // ── one variant: live example + tabs ────────────────────────────────
  const TABS = [['states', 'Состояния'], ['guide', 'Как использовать'], ['usages', 'Где используется'], ['code', 'Код']];

  function pageVariant(c, v) {
    const title = many(c) ? v.name : labelOf(c);
    const usages = usagesFor(c, v);
    if (!TABS.some(([k]) => k === ui.tab)) ui.tab = 'states';
    main.innerHTML = `<div class="page">
      ${crumbs(many(c) ? [...trail(c), ['', v.name]] : last(trail(c)))}
      <h1>${esc(title)}${warnings(c)}</h1>
      ${c.stale ? '<p class="warn">Код, описание или примеры изменились после печати, описание. Примеры живые, текст мог устареть.</p>' : ''}
      <section class="live" aria-label="Живой пример">
        <div class="live__bar"><span class="live__scale" hidden></span>
          ${v.preview.width === 'wide' ? `<span class="seg" role="group" aria-label="Ширина">${[['desktop', String(D.frame.desktop)], ...[1024, 768, 375].filter((w) => w < D.frame.desktop).map((w) => [w, String(w)]), ['fit', 'по окну']].map(([val, t]) =>
            `<button type="button" data-width="${val}" aria-pressed="${String(ui.width) === String(val)}">${t}</button>`).join('')}</span>` : ''}
          <button type="button" class="btn-ghost" data-copy-html>HTML</button></div>
        <div id="live"></div>
      </section>
      <div class="tabs" role="tablist" aria-label="Разделы">${TABS.map(([k, t]) =>
        `<button type="button" role="tab" id="tab-${k}" aria-controls="panel-${k}" aria-selected="${ui.tab === k}" data-tab="${k}" tabindex="${ui.tab === k ? 0 : -1}">${t}</button>`).join('')}</div>
      ${TABS.map(([k]) => `<div class="panel-tab" role="tabpanel" id="panel-${k}" aria-labelledby="tab-${k}"${ui.tab === k ? '' : ' hidden'}></div>`).join('')}
    </div>`;

    const live = document.getElementById('live');
    const scale = main.querySelector('.live__scale');
    live.append(frame(c, v.preview, { live: true, scale }));
    main.querySelector('[data-copy-html]').addEventListener('click', () => copy(v.preview.clean, 'HTML скопирован'));

    const p = (k) => document.getElementById('panel-' + k);
    // States
    if (v.states.length) p('states').append(stateGrid(c, v.states));
    else p('states').innerHTML = '<div class="empty">Других состояний нет — всё видно в живом примере.</div>';
    if (c.note) p('states').insertAdjacentHTML('beforeend', `<p class="hint">${esc(c.note)}</p>`);
    // Guide
    const secs = c.sections.filter((s) => s.title);
    p('guide').innerHTML = secs.length ? `<div class="prose guide">${secs.map((s) => `<section><h3>${esc(s.title)}</h3>${s.html}</section>`).join('')}</div>`
      : '<div class="empty">Описания пока нет.</div>';
    // Usages
    p('usages').innerHTML = usages.length ? `${v.cls && many(c) ? `<p class="hint">Только места с <code>${esc(v.cls)}</code>.</p>` : ''}
      <div class="panel"><table class="t"><thead><tr><th>Файл</th><th>Строки</th><th></th></tr></thead><tbody>
        ${usages.map((u) => `<tr><td><code>${esc(u.file)}</code></td>
          <td><div class="lines">${u.lines.map((l) => `<a href="${esc(l.href || '#')}" class="${l.rep ? 'rep' : ''}" title="${esc(l.classes || '')}${l.rep ? ' · пример из описания' : ''}">${l.line}</a>`).join('')}</div></td>
          <td>${u.page ? `<a href="${esc(u.page)}" target="_blank" rel="noopener">открыть страницу ↗</a>` : ''}</td></tr>`).join('')}
      </tbody></table></div><p class="hint">Номер строки открывает файл в редакторе. Выделены места, которые разобраны в описании.</p>`
      : '<div class="empty">Пока нигде не используется.</div>';
    // Code
    const used = c.tokens.map((name) => {
      const t = D.tokens.find((x) => x.name === name);
      return t ? `<a class="chip" href="${tokenHref(t)}">${esc(name)}</a>` : `<span class="chip">${esc(name)}</span>`;
    }).join(' ');
    p('code').innerHTML = `<div class="prose">
      <h3>Разметка</h3><pre><code>${esc(v.preview.clean)}</code></pre>
      ${c.modifiers.length ? `<h3>Классы</h3><table class="t"><tbody>${[...c.modifiers, ...(c.elements || [])].map((m) => `<tr><td><code>${esc(m.cls)}</code></td><td class="muted">${m.pseudo.map((x) => ':' + esc(x)).join(' ')}</td></tr>`).join('')}</tbody></table>` : ''}
      ${used ? `<h3>Токены</h3><div class="chips">${used}</div>` : ''}
      ${c.hardcoded.length ? `<h3>Значения без токена</h3><p>${c.hardcoded.map((h) => `<code>${esc(h)}</code>`).join(' ')}</p>` : ''}
      ${c.overrides.length ? `<h3>Меняют вне базы</h3><p class="hint">Страницы и фичи меняют компонент своим CSS. Цвет и вид — частый признак, что не хватает варианта; размер и раскладка — компонент подгоняют под место.</p>
        <ul>${c.overrides.map((o) => `<li><a href="${esc(o.href)}">${esc(o.file)}:${o.line}</a> — ${o.what ? `${o.look ? 'перекрашивает' : 'меняет'}: ${esc(o.what)}${o.max ? `, на экранах до ${o.max} px` : ''} · ` : ''}<code>${esc(o.selector)}</code></li>`).join('')}</ul>` : ''}
      <p class="hint">Описание: <a href="${esc(c.mdHref)}">${esc(c.md)}</a> · классы компонента: ${(c.declared || c.units).map((u) => `<code>${esc(u)}</code>`).join(' ')}</p>
    </div>`;
  }

  function usagesFor(c, v) {
    if (!v.cls || !many(c)) return c.usages;
    const re = new RegExp(`(^|\\s)${v.cls.replace(/[-]/g, '\\-')}(\\s|$)`);
    return c.usages.map((u) => ({ ...u, lines: u.lines.filter((l) => re.test(l.classes || '')) })).filter((u) => u.lines.length);
  }

  function selectTab(k, focus) {
    ui.tab = k; store.set('tab', k);
    main.querySelectorAll('[role="tab"]').forEach((t) => {
      const on = t.dataset.tab === k;
      t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    });
    main.querySelectorAll('[role="tabpanel"]').forEach((p) => { p.hidden = p.id !== 'panel-' + k; });
    frames.forEach(layout);
  }

  // ── tokens: all → kind → token ───────────────────────────────────────
  const KINDS = D.tokenKinds || [['color', 'Цвета'], ['shadow', 'Тени'], ['radius', 'Радиусы'], ['font', 'Шрифты'], ['size', 'Размеры'], ['motion', 'Анимация'], ['other', 'Прочее']];
  function tokenKinds() { return KINDS.filter(([k]) => D.tokens.some((t) => t.kind === k) || (k === 'font' && (D.textStyles || []).length)); }
  const kindName = (k) => (KINDS.find(([x]) => x === k) || [k, k])[1];
  const tokensOf = (k) => D.tokens.filter((t) => t.kind === k);
  // Previews render through a frame with the project's CSS, so fonts and
  // nested var() resolve exactly as in the product.
  const FONT_SAMPLE = 'Съешь же ещё этих мягких французских булок';
  const FILTER = /\b(brightness|invert|sepia|hue-rotate|saturate|contrast|grayscale|blur|drop-shadow)\(/;
  function tokenState(t, big) {
    const v = `var(${t.name})`;
    const h = big ? 160 : 72;
    const html = {
      color: `<div style="width:100%;height:${h}px;border-radius:8px;background:${v};box-shadow:inset 0 0 0 1px rgba(22,34,66,.08)"></div>`,
      shadow: `<div style="width:${big ? 220 : 96}px;height:${big ? 120 : 48}px;border-radius:10px;background:#fff;box-shadow:${v}"></div>`,
      radius: `<div style="width:${big ? 160 : 72}px;height:${big ? 120 : 52}px;border-radius:${v};background:#dfe4ee"></div>`,
      font: `<div style="font-family:${v};font-size:${big ? 32 : 20}px;line-height:1.25">${big ? FONT_SAMPLE : 'Аа Бб Вв 123'}</div>`,
    }[t.kind];
    // A filter is seen on something: a black square, on grey so that a white one shows too.
    const filter = !html && FILTER.test(t.resolved || t.value);
    const sample = html || (filter ? `<div style="width:${big ? 96 : 48}px;height:${big ? 96 : 48}px;border-radius:8px;background:#000;filter:${v}"></div>`
      : `<code style="display:block;max-width:${big ? '100%' : '220px'};white-space:${big ? 'normal' : 'nowrap'};overflow:hidden;text-overflow:ellipsis">${esc(t.value)}</code>`);
    return { id: t.id, label: t.name, html: sample, clean: sample, width: null, pad: big ? 32 : 16, bg: t.kind === 'shadow' ? '#f3f5f9' : filter ? '#d8dde6' : null };
  }
  const tokenHref = (t) => `#/t/${t.kind}/${t.id}`;
  const tokenComp = { name: 'Токен', styles: [] };

  function pageTokens() {
    main.innerHTML = `<div class="page"><h1>Токены</h1><div class="cards" id="kinds"></div></div>`;
    const host = document.getElementById('kinds');
    for (const [k, name] of tokenKinds()) {
      const list = tokensOf(k);
      const a = document.createElement('a');
      a.className = 'card';
      a.href = `#/t/${k}`;
      const baseTs = (D.textStyles || []).filter((s) => s.library);
      // No counts on cards.
      a.innerHTML = `<div class="card__preview card__preview--tokens"></div><div class="card__body"><div class="card__name">${name}</div></div>`;
      if (k === 'font' && baseTs.length) {
        const pick = [...baseTs].sort((x, y) => y.size - x.size || y.weight - x.weight).slice(0, 3);
        a.firstElementChild.innerHTML = `<div class="type-thumb">${pick.map((s) => `<span style="${esc(tsStyle(s))}">${esc(s.name)}</span>`).join('')}</div>`;
        host.append(a);
        continue;
      }
      const sample = list.slice(0, k === 'color' ? 6 : 3);
      const html = k === 'color'
        ? `<div style="display:flex;gap:6px;width:100%">${sample.map((t) => `<div style="flex:1;height:56px;border-radius:6px;background:var(${t.name});box-shadow:inset 0 0 0 1px rgba(22,34,66,.08)"></div>`).join('')}</div>`
        : k === 'font' ? `<div style="display:flex;gap:16px;align-items:center">${sample.map((t) => tokenState(t).html).join('')}</div>`
        : `<div style="display:flex;gap:12px;align-items:center">${sample.map((t) => `<div style="width:64px;height:44px;border-radius:${k === 'radius' ? `var(${t.name})` : '8px'};background:${k === 'radius' ? '#dfe4ee' : '#fff'};${k === 'shadow' ? `box-shadow:var(${t.name})` : ''}"></div>`).join('')}</div>`;
      a.firstElementChild.append(frame(tokenComp, { id: k, label: name, html, clean: html, pad: 20, bg: k === 'shadow' ? '#f3f5f9' : null }, { thumb: true }));
      host.append(a);
    }
  }

  function pageTokenKind(k) {
    if (k === 'font') return pageFonts();
    const list = tokensOf(k);
    // One list per kind: the structure is the catalog's, not the
    // comments in the project's token files.
    const groups = new Map([['', list]]);
    main.innerHTML = `<div class="page">${crumbs([['#/tokens', 'Токены'], ['', kindName(k)]])}<h1>${kindName(k)}</h1><div id="groups"></div></div>`;
    const host = document.getElementById('groups');
    for (const [, items] of groups) {
      const grid = document.createElement('div');
      grid.className = 'cards cards--tokens';
      for (const t of items) {
        const a = document.createElement('a');
        a.className = 'card';
        a.href = tokenHref(t);
        a.innerHTML = `<div class="card__preview card__preview--token"></div><div class="card__body"><div class="card__name card__name--mono">${esc(t.name)}</div><div class="card__meta">${esc(t.resolved || t.value)}</div></div>`;
        a.firstElementChild.append(frame(tokenComp, tokenState(t), { thumb: true }));
        grid.append(a);
      }
      host.append(grid);
    }
  }

  // ── typography: families + text styles (size, weight, line height) ──
  // Specimens render in the gallery itself: fonts.css carries the project's @font-face.
  const TS = D.textStyles || [];
  const tsStyle = (s) => `font-family:${s.stack};font-size:${s.size}px;font-weight:${s.weight};${s.lineHeight ? `line-height:${s.lineHeight}px;` : ''}${s.letterSpacing ? `letter-spacing:${s.letterSpacing}px;` : ''}`;
  const fmtLs = (v) => (v ? `${+v.toFixed(3)}px` : '0');
  const FAMILIES = D.typeFamilies || [...new Set(TS.map((s) => s.family))].map((family) => ({ family }));
  const shortName = (s) => s.name.slice(s.family.length + 1); // «15/20 SemiBold» inside its family
  function typeTable(list) {
    return `<div class="type-table" role="table">
      <div class="type-row type-row--head" role="row"><span role="columnheader">Стиль</span><span role="columnheader">Размер</span><span role="columnheader">Начертание</span><span role="columnheader">Интерлиньяж</span><span role="columnheader">Трекинг</span></div>
      ${list.map((s) => `<a class="type-row" role="row" href="#/t/font/${s.id}">
        <span class="type-row__sample" role="cell" style="${esc(tsStyle(s))}">${esc(shortName(s))}</span>
        <span role="cell" data-l="Размер">${s.size}px</span>
        <span role="cell" data-l="Начертание">${esc(s.weightName)} · ${s.weight}</span>
        <span role="cell" data-l="Интерлиньяж">${s.lineHeight ? `${s.lineHeight}px · ${s.lineHeightPct}%` : '—'}</span>
        <span role="cell" data-l="Трекинг">${fmtLs(s.letterSpacing)}</span>
      </a>`).join('')}
    </div>`;
  }
  // One section per family, display faces before the text face.
  function familySections(list) {
    return FAMILIES.map((f) => {
      const rows = list.filter((s) => s.family === f.family);
      if (!rows.length) return '';
      const tok = f.token && D.tokens.find((t) => t.name === f.token);
      return `<section class="type-family"><h2>${esc(f.family)}${tok ? ` <a class="type-family__token" href="${tokenHref(tok)}">${esc(tok.name)}</a>` : ''}</h2>${typeTable(rows)}</section>`;
    }).join('');
  }
  function pageFonts() {
    // Only the library's scale: styles pages and features set themselves go to «Несостыковки».
    const base = TS.filter((s) => s.library);
    main.innerHTML = `<div class="page">${crumbs([['#/tokens', 'Токены'], ['', 'Шрифты']])}<h1>Шрифты</h1>
      ${base.length ? familySections(base) : '<div class="empty">В базе не задано ни одного стиля текста.</div>'}
    </div>`;
  }
  function pageTextStyle(id) {
    const s = TS.find((x) => x.id === id);
    if (!s) { main.innerHTML = '<div class="page"><h1>Такого стиля нет</h1><p><a href="#/t/font">Шрифты</a></p></div>'; return; }
    const famToken = s.familyToken && D.tokens.find((t) => t.name === s.familyToken);
    const comps = s.components.map((cid) => byId.get(cid)).filter(Boolean);
    main.innerHTML = `<div class="page">${crumbs([['#/tokens', 'Токены'], ['#/t/font', 'Шрифты'], ['', s.name]])}
      <h1>${esc(s.name)}</h1>
      <section class="live type-specimen" aria-label="Образец">
        <p class="type-specimen__line" style="${esc(tsStyle(s))}">${esc(FONT_SAMPLE)}</p>
        <p class="type-specimen__para" style="${esc(tsStyle(s))};${s.lineHeight ? `--lh:${s.lineHeight}px` : ''}">${esc(FONT_SAMPLE)}. Широкая электрификация южных губерний даст мощный толчок подъёму сельского хозяйства. 0123456789</p>
      </section>
      <div class="facts-grid">
        <div><span class="muted">Семейство</span>${famToken ? `<a href="${tokenHref(famToken)}">${esc(s.family)}</a>` : esc(s.family)}</div>
        <div><span class="muted">Размер</span>${s.size}px</div>
        <div><span class="muted">Начертание</span>${esc(s.weightName)} · ${s.weight}</div>
        <div><span class="muted">Интерлиньяж</span>${s.lineHeight ? `${s.lineHeight}px · ${s.lineHeightPct}%` : 'не задан'}</div>
        <div><span class="muted">Трекинг</span>${fmtLs(s.letterSpacing)}</div>
      </div>
      <h2>CSS</h2><div class="prose"><pre><code>${esc(s.css)}</code></pre></div>
      <h2>Компоненты</h2>
      ${comps.length ? `<div class="chips">${comps.map((c) => `<a class="chip" href="#/c/${esc(c.id)}">${esc(labelOf(c) === c.name ? c.name : `${c.group} · ${labelOf(c)}`)}</a>`).join('')}</div>` : '<p class="muted">Ни один компонент базы его не использует.</p>'}
      <h2>Где используется</h2>
      <div class="panel"><table class="t t--sites"><thead><tr><th>Что это</th><th>Файл</th><th>Правило</th></tr></thead><tbody>
        ${s.sites.map((x) => `<tr><td>${whatCell(x)}</td><td><a href="${esc(x.href)}">${esc(x.file)}:${x.line}</a></td><td><code>${esc(x.selector)}</code></td></tr>`).join('')}
      </tbody></table></div>
    </div>`;
  }

  // «Что это» cell: the element in words, then where it lives and the breakpoint, muted.
  const whatCell = (x) => {
    const sub = [x.where, x.media].filter(Boolean).join(' · ');
    return `${esc(x.what || '')}${sub ? `<div class="muted">${esc(sub)}</div>` : ''}`;
  };

  function pageToken(k, id) {
    if (k === 'font' && /^ts-/.test(id)) return pageTextStyle(id);
    const t = D.tokens.find((x) => x.kind === k && x.id === id);
    if (!t) { main.innerHTML = '<div class="page"><h1>Такого токена нет</h1><p><a href="#/tokens">Все токены</a></p></div>'; return; }
    const comps = t.components.map((cid) => byId.get(cid)).filter(Boolean);
    // «Что красит» only when it differs between rows: a shadow token always paints a shadow.
    const paints = new Set(t.sites.map((s) => s.propRu || s.prop || '')).size > 1;
    main.innerHTML = `<div class="page">${crumbs([['#/tokens', 'Токены'], [`#/t/${k}`, kindName(k)], ['', t.name]])}
      <h1 class="mono-title">${esc(t.name)}</h1>
      <section class="live" aria-label="Образец"><div id="sample"></div></section>
      <div class="facts-grid">
        <div><span class="muted">${t.kind === 'font' ? 'Шрифты по порядку (если первый не загрузился — следующий)' : 'Значение'}</span><code>${esc(t.value)}</code></div>
        ${t.resolved && t.resolved !== t.value ? `<div><span class="muted">На деле</span><code>${esc(t.resolved)}</code></div>` : ''}
        <div><span class="muted">Где задан</span><a href="${esc(t.href)}">${esc(t.file)}:${t.line}</a></div>
      </div>
      <h2>Компоненты</h2>
      ${comps.length ? `<div class="chips">${comps.map((c) => `<a class="chip" href="#/c/${esc(c.id)}">${esc(c.name)}</a>`).join('')}</div>` : '<p class="muted">Ни один компонент базы его не использует.</p>'}
      <h2>Где используется</h2>
      ${t.sites.length ? `<div class="panel"><table class="t t--sites"><thead><tr><th>Что это</th>${paints ? '<th>Что красит</th>' : ''}<th>Файл</th><th>Правило</th></tr></thead><tbody>
        ${t.sites.map((s) => `<tr><td>${whatCell(s)}</td>${paints ? `<td>${esc(s.propRu || s.prop || '')}</td>` : ''}<td><a href="${esc(s.href)}">${esc(s.file)}:${s.line}</a></td><td><code>${esc(s.selector)}</code></td></tr>`).join('')}
      </tbody></table></div>` : '<div class="empty">Нигде не используется.</div>'}
    </div>`;
    document.getElementById('sample').append(frame(tokenComp, tokenState(t, true), { thumb: false }));
  }

  function pageIcons() {
    main.innerHTML = `<div class="page"><h1>Иконки</h1>
      <div class="icons">${D.icons.map((i) => `<div class="icon" title="${esc(i.file)}"><img src="${esc(i.src)}" alt=""><span>${esc(i.name)}</span></div>`).join('')}</div></div>`;
  }

  function pageUndocumented() {
    main.innerHTML = `<div class="page">${crumbs([['', 'Без описания']])}<h1>Без описания</h1><p class="lead">Эти классы есть в базе, но в галерее их нет: для них ещё не написано описание.</p>
      <div class="panel"><table class="t"><tbody>
      ${D.undocumented.map((u) => `<tr><td><code>${esc(u.id)}</code></td><td>${esc(u.section || '')}</td><td>${u.href ? `<a href="${esc(u.href)}">${esc(u.file)}</a>` : esc(u.file)}</td></tr>`).join('')}</tbody></table></div></div>`;
  }

  // ── routing ──────────────────────────────────────────────────────────
  function render() {
    const route = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
    resetFrames();
    const [kind, cid, vid] = route.split('/');
    // Open the current component (and its group); the user may fold them.
    if (kind === 'c' && cid) { expanded.add(cid); const g = byId.get(cid) && groupOf(byId.get(cid)); if (g) expanded.add('g:' + g.id); }
    if (kind === 'g' && cid) expanded.add('g:' + cid);
    renderSide(route);
    if (kind === 'g') {
      const g = GROUPS.get(cid);
      if (g) pageGroup(g); else main.innerHTML = '<div class="page"><h1>Такой группы нет</h1><p><a href="#/">Все компоненты</a></p></div>';
    } else if (kind === 'c') {
      const c = byId.get(cid);
      if (!c) main.innerHTML = '<div class="page"><h1>Такого компонента нет</h1><p><a href="#/">Все компоненты</a></p></div>';
      else if (!c.variants.length) main.innerHTML = `<div class="page">${crumbs([['#/', 'Компоненты'], ['', c.name]])}<h1>${esc(c.name)}</h1><div class="empty">Нет примеров: добавь examples/${esc(c.id)}.html и пересобери.</div></div>`;
      else {
        const v = variantOf(c, vid);
        if (v) pageVariant(c, v); else pageFamily(c);
      }
    }
    else if (route === 'composites') pageOverview(COMPOSITES, 'Составные');
    else if (route === 'tokens') pageTokens();
    else if (kind === 't') { if (vid) pageToken(cid, vid); else pageTokenKind(cid); }
    else if (route === 'icons') pageIcons();
    else if (route === 'undocumented') pageUndocumented();
    else pageOverview();
  }

  document.addEventListener('click', (e) => {
    const ex = e.target.closest('[data-expand]');
    if (ex) {
      const id = ex.dataset.expand;
      if (ex.closest('.side__row--head')) { if (folded.has(id)) folded.delete(id); else folded.add(id); }
      else if (expanded.has(id)) expanded.delete(id); else expanded.add(id);
      renderSide(decodeURIComponent(location.hash.replace(/^#\/?/, '')));
      side.querySelector(`[data-expand="${CSS.escape(id)}"]`)?.focus();
      return;
    }
    const w = e.target.closest('[data-width]');
    if (w) {
      ui.width = w.dataset.width; store.set('width', ui.width);
      main.querySelectorAll('[data-width]').forEach((b) => b.setAttribute('aria-pressed', String(b === w)));
      frames.forEach(layout);
      return;
    }
    const tab = e.target.closest('[role="tab"]');
    if (tab) { selectTab(tab.dataset.tab); return; }
  });
  document.addEventListener('keydown', (e) => {
    const tab = e.target.closest?.('[role="tab"]');
    if (tab && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      const keys = TABS.map(([k]) => k);
      const i = (keys.indexOf(tab.dataset.tab) + (e.key === 'ArrowRight' ? 1 : keys.length - 1)) % keys.length;
      selectTab(keys[i], true);
      e.preventDefault();
    }
    if (e.key === '/' && document.activeElement !== q && !/input|textarea|select/i.test(document.activeElement.tagName)) { e.preventDefault(); q.focus(); }
    if (e.key === 'Escape' && document.activeElement === q) { q.value = ''; render(); }
  });
  document.addEventListener('change', (e) => { if (e.target.matches('select[data-set]')) { ui[e.target.dataset.set] = e.target.value; store.set(e.target.dataset.set, e.target.value); render(); } });
  q.addEventListener('input', () => { if (location.hash.replace(/^#\/?/, '')) location.hash = '#/'; else render(); });
  addEventListener('hashchange', () => { render(); scrollTo(0, 0); });

  render();
  if (SELFTEST) { const s = document.createElement('script'); s.src = 'selftest.js?v=' + Date.now(); document.body.append(s); }
})();
