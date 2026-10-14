// The gallery of the React kit: atoms with every implementation
// side by side, rendered by lib/render.mjs into static frames for the same gallery page.
import { sections, markdownToHtml } from './md.mjs';
import { ATOM_AGENT } from './atom-spec.mjs';
import { slug, places } from './kit.mjs';
import { splitTop } from './jsx.mjs';

// What a frame says when the type has a text and the code gave none.
const SAMPLE = { button: 'Кнопка', link: 'Ссылка', tag: 'Тег', badge: 'Новое', chip: 'Фильтр', tab: 'Вкладка', avatar: 'АБ', breadcrumb: 'Раздел', radio: 'Вариант', checkbox: 'Пункт', switch: 'Уведомления' };
// Props that carry the component's text: the call often fills them from data (`label={item.label}`).
const TEXT_PROPS = /^(label|text)$/;
const PSEUDO = [['hover', 'Hover'], ['active', 'Pressed'], ['focus-visible', 'Focus']];
const VOID = new Set(['input', 'img', 'hr', 'br']);
// Elements that draw themselves without a text inside.
const DRAWS = new Set(['img', 'svg', 'input', 'select', 'textarea', 'button', 'video', 'canvas', 'iframe']);
// Markup with nothing to show: no text and no element that draws itself (preload links aside).
export const emptyBox = (html) => {
  const h = String(html || '').replace(/<link\b[^>]*>/g, '');
  return !h.replace(/<[^>]*>/g, '').trim() && ![...h.matchAll(/<([a-zA-Z][\w-]*)/g)].some((m) => DRAWS.has(m[1].toLowerCase()));
};
// Props a caller lays a component out with: the page's, not the component's.
const LAYOUT_PROPS = /^(className|style)$|(ClassName|Style)$/;
const SHOWN = /^(show|shown|visible|isVisible|isShown|open|isOpen|opened|expanded|isExpanded)$/;
// A type that is an array: `T[]`, `Array<T>`, `readonly T[]`, `ReadonlyArray<T>`, or a union of them with null.
export const arrayType = (text) => {
  const alts = splitTop(String(text || ''), ['|']).filter((t) => !/^(null|undefined)$/.test(t));
  return alts.length > 0 && alts.every((t) => splitTop(t, ['=']).length === 1
    && (/^(readonly\s+)?\S[\s\S]*\[\]$/.test(t) || /^(Readonly)?Array\s*<[\s\S]+>$/.test(t)));
};
// The text most elements say; on a tie, the first in the code.
const mostSaid = (els) => {
  const n = new Map();
  for (const e of els) if (e.text) n.set(e.text, (n.get(e.text) || 0) + 1);
  return [...n].sort((p, q) => q[1] - p[1])[0]?.[0] || null;
};
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// The error in words a person reads, without `undefined` and the like.
const why = (msg) => {
  const m = /Cannot read propert(?:y|ies) of (?:undefined|null) \(reading '([^']+)'\)/.exec(msg);
  if (m) return `не хватает данных — компонент ждёт значение, у которого берёт «${m[1]}»`;
  return String(msg).replace(/\bundefined\b/g, 'не задано').replace(/\bnull\b/g, 'пусто').replace(/\bNaN\b/g, 'не число').replace(/\[object (\w+)\]/g, '$1');
};
const failedHtml = (msg) => `<div style="font:13px/1.4 system-ui,sans-serif;color:#b42318;padding:8px 12px;border:1px dashed #f04438;border-radius:6px;background:#fff;max-width:360px">не отрисовался: ${esc(why(msg))}</div>`;

// A prop's expression from a call, computed in the module of the call; a bare name the
// calling component got as a prop of its own is taken from that component's calls — up to
// three components up (a translator handed down through a page).
async function computeProp(renderer, r, call, expr, prop, depth = 0) {
  const got = renderer.evaluate ? await renderer.evaluate({ file: call.file, line: call.line, expr, name: call.name, prop }) : null;
  if (got || depth >= 3 || !r) return got;
  const name = /^\{\s*([A-Za-z_$][\w$]*)\s*\}$/.exec(String(expr))?.[1];
  if (!name) return null;
  const owner = (r.components || []).filter((c) => c.file === call.file && c.line <= call.line).sort((a, b) => b.line - a.line)[0];
  if (!owner || !owner.props.some((p) => p.name === name)) return null;
  for (const up of (r.calls || []).filter((c) => c.component === `${owner.file}#${owner.name}`)) {
    const v = up.props?.[name];
    if (typeof v === 'string' && !v.startsWith('{')) return { value: v };
    if (typeof v === 'string') { const g = await computeProp(renderer, r, up, v, name, depth + 1); if (g) return g; }
  }
  return null;
}

// The caption of a frame that took props from a story: its texts are a demo's.
export const FROM_STORY = ' · данные из сторис';

// A component drawn as the code calls it: the literal props and the text of its most telling
// real call (one that `fits`), then what the code computes for the call's expressions, the
// props `set` asks for, a prop that shows it true, what its story gives for the rest, and
// the type's sample for a text prop the code fills from data.
async function drawComponent(renderer, comp, calls, { fits = () => true, set = {}, sample = '', r = null } = {}) {
  const said = (c) => !!c.text + Object.keys(c.propTexts || {}).length;
  const list = new Set(comp.props.filter((p) => arrayType(p.type)).map((p) => p.name));
  // The props the code gives for one call: its literals, what it computes, its texts.
  const fromCall = async (call) => {
    const out = {};
    for (const [k, v] of Object.entries(call?.props || {})) {
      if (/^on[A-Z]|^(key|ref)$/.test(k)) continue;
      if (v === true) { out[k] = true; continue; }
      if (typeof v === 'string' && !v.startsWith('{')) { out[k] = v; continue; }
      // An expression the code computes in the module of the call; a list takes only a list.
      // A class or a style the caller lays the component out with is the page's: not computed.
      const got = typeof v === 'string' && !LAYOUT_PROPS.test(k) ? await computeProp(renderer, r, call, v, k) : null;
      if (got && (!list.has(k) || Array.isArray(got.value))) { out[k] = got.value; continue; }
      // A text said inside an array (`items={[{ label: t('…') }]}`) is not the array.
      if (call.propTexts?.[k] && !list.has(k)) out[k] = call.propTexts[k];
    }
    return out;
  };
  // Of the calls, the one the code gives most of the props the component requires, then the
  // most telling (its texts), then the one with most props.
  const needs = new Set(comp.props.filter((p) => !p.optional && p.default === undefined).map((p) => p.name));
  const score = (got, c) => [Object.keys(got).filter((k) => needs.has(k)).length, said(c), Object.keys(got).length];
  const better = (x, y) => { for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] > y[i]; return false; };
  const ranked = calls.filter(fits).sort((m, k) => said(k) - said(m)).slice(0, 40);
  let call = ranked[0], props = {}, best = [-1, -1, -1];
  for (const c of ranked) {
    const got = await fromCall(c);
    const sc = score(got, c);
    if (better(sc, best)) { call = c; props = got; best = sc; }
  }
  Object.assign(props, set);
  // A prop that shows the component: shown, or the frame draws nothing.
  for (const p of comp.props) if (SHOWN.test(p.name) && props[p.name] === undefined) props[p.name] = true;
  // What the component requires and the code leaves unset, its story may give — never over a
  // value from the code, never a flag it draws without.
  let story = false;
  const fromStory = renderer.storyProps ? await renderer.storyProps({ file: comp.file, name: comp.name }) : null;
  const required = new Set(comp.props.filter((p) => !p.optional && p.default === undefined).map((p) => p.name));
  for (const [k, v] of Object.entries(fromStory || {})) if (props[k] === undefined && required.has(k)) { props[k] = v; story = true; }
  // A list the type requires and the call fills from data: empty, or the component throws on `.map`.
  const empty = comp.props.filter((p) => !p.optional && p.default === undefined && props[p.name] === undefined && arrayType(p.type)).map((p) => p.name);
  for (const k of empty) props[k] = [];
  // A text the code takes from data: the type's sample, or the caption is empty.
  if (sample) for (const p of comp.props) if (TEXT_PROPS.test(p.name) && props[p.name] === undefined) props[p.name] = sample;
  const text = call?.text || sample || null;
  const res = await renderer.render({ file: comp.file, name: comp.name, props, text });
  // The list was all it shows: with none, the frame is an empty box. Drawn the same
  // without the lists, the emptiness is not theirs (the CSS may draw it).
  if (!res.error && empty.length && emptyBox(res.html)) {
    const bare = await renderer.render({ file: comp.file, name: comp.name, props: Object.fromEntries(Object.entries(props).filter(([k]) => !empty.includes(k))), text });
    if (bare.error || bare.html !== res.html) return { error: `нет данных — список ${empty.map((k) => `«${k}»`).join(', ')} пуст` };
  }
  if (!res.error && !String(res.html || '').trim()) return { error: 'пустая разметка' };
  // Rendered without its data and saying so: not a picture of the component.
  const shown = /\b(undefined|NaN)\b|\[object [A-Z]\w*\]/.exec(String(res.html || '').replace(/<[^>]*>/g, ' '));
  if (!res.error && shown) return { error: `не хватает данных — в тексте «${shown[0]}»` };
  return { html: res.html, error: res.error, story: story && !res.error };
}

// The stylesheets that define the classes the frames draw (a spinner styled by the
// header's CSS); then frames as on a desktop, past the widest media of those classes.
function frameCss(list, inventory, renderer) {
  const definedIn = new Map();
  for (const u of inventory.units || []) for (const cls of [u.id, ...Object.keys(u.modifiers || {}), ...Object.keys(u.elements || {})]) definedIn.set(cls, (u.defined || []).map((d) => d.file));
  const classesOf = (c) => new Set([...[...c.variants.flatMap((v) => [v.preview, ...v.states]), ...c.shared].map((f) => f.html).join(' ').matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/)));
  for (const c of list) for (const cls of classesOf(c)) for (const f of definedIn.get(cls) || []) renderer.addCss(f);
  const widths = renderer.mediaWidths();
  for (const c of list) c.breakpoint = Math.max(0, ...[...classesOf(c)].map((x) => widths.get(x) || 0)) || null;
}

export async function kitGalleryComponents({ kit, specs, inventory, renderer, editorHref, mdHref, rebase = (h) => h }) {
  const r = inventory.react || { calls: [] };
  renderer.providers?.(r.components);
  const out = [], failedFrames = [];
  let failed = 0, n = 0;
  for (const a of kit.atoms) {
    const spec = specs.find((c) => c.id === a.id);
    const sample = SAMPLE[a.type] || '';
    // The first axis of the API: a view or a tone before a size.
    const p = a.api.find((x) => x.values && !x.bool && ['emphasis', 'style', 'tone'].includes(x.axis)) || a.api.find((x) => x.values && !x.bool && x.axis);
    const values = p ? p.values.map((v) => ({ id: slug(v.token), name: v.name, v })) : [{ id: 'default', name: a.name, v: null }];
    // One implementation, with its spelling of the value (or none): HTML, or why not.
    const draw = async (i, x) => {
      let html, error, story = false;
      if (i.kind === 'component') {
        // Props from a real call with this value: its literals and its text.
        const fits = (c) => !x || (x.bool ? c.props[x.prop] === true || c.props[x.prop] === '{true}' : c.props[x.prop] === x.token || (x.isDefault && c.props[x.prop] === undefined));
        ({ html, error, story } = await drawComponent(renderer, i.comp, r.calls.filter((c) => c.component === i.key), { fits, set: x ? { [x.prop]: x.bool ? true : x.token } : {}, sample, r }));
      } else {
        const tag = i.kind === 'class' ? i.tag || 'div' : i.name.replace(/[<>]/g, '');
        const cls = i.kind === 'class' ? [i.unit.id, x?.cls].filter(Boolean).join(' ') : '';
        const attrs = `${cls ? ` class="${esc(cls)}"` : ''}${tag === 'button' ? ' type="button"' : ''}`;
        // A real text: of an element with exactly these classes, else with the base class;
        // a raw element — of one of its places. The type's sample only when the code has none.
        let text = null;
        if (i.kind === 'class') {
          const withBase = (r.raw || []).filter((e) => e.classes.includes(i.unit.id));
          text = (x?.cls && mostSaid(withBase.filter((e) => e.classes.includes(x.cls)))) || mostSaid(withBase);
        } else {
          const at = new Set(i.places.map((pl) => `${pl.file}:${pl.line}`));
          text = mostSaid((r.raw || []).filter((e) => at.has(`${e.file}:${e.line}`)));
        }
        html = VOID.has(tag) ? `<${tag}${attrs}>` : `<${tag}${attrs}>${esc(text || sample)}</${tag}>`;
      }
      if (error) { failed++; failedFrames.push({ id: a.id, frame: i.name, why: why(error) }); }
      return { i, html: error ? failedHtml(error) : rebase(html), ok: !error, story };
    };
    const variants = [];
    for (const val of values) {
      // Implementations with this value and how each spells it.
      const entries = [];
      for (const i of a.impls) {
        if (!val.v) { entries.push({ i, x: null }); continue; }
        const x = a.axes[p.axis]?.get(val.v.name)?.impls.get(i.key);
        if (x) entries.push({ i, x });
      }
      entries.sort((m, k) => (k.i.uses || 0) - (m.i.uses || 0));
      const frames = [];
      for (const { i, x } of entries) frames.push(await draw(i, x));
      if (!frames.length) continue;
      const live = frames.find((f) => f.ok) || frames[0];
      const frame = (f, label, preview, extra = {}) => ({
        id: `state-${++n}`, label: label === f.i.name && f.story ? label + FROM_STORY : label, variant: val.id, preview, name: preview ? val.name : null, about: null, cls: null,
        width: null, height: null, bg: null, pad: null, note: f.i.file ? `${f.i.file}:${f.i.line}` : null, attrs: [], authored: null,
        html: f.html, clean: f.html, noteHref: f.i.file ? editorHref(f.i.file, f.i.line) : null, ...extra,
      });
      // The others side by side, then the live one's hover, pressed and focus.
      const states = frames.filter((f) => f !== live).map((f) => frame(f, f.i.name, false));
      if (live.ok) for (const [ps, label] of PSEUDO) if (a.states.some((s) => s.state === ps && s.in.includes(live.i.name))) states.push(frame(live, label, false, { html: live.html.replace(/^(\s*<[a-zA-Z][\w-]*)/, `$1 data-pseudo="${ps}"`) }));
      variants.push({ id: val.id, name: val.name, about: null, cls: null, preview: frame(live, live.i.name, true), states });
    }
    // Implementations without a value on the axis: once each under «Общие примеры».
    const shared = [];
    if (p) for (const i of a.impls.filter((i) => !values.some((val) => a.axes[p.axis]?.get(val.v.name)?.impls.has(i.key)))) {
      const f = await draw(i, null);
      shared.push({ id: `state-${++n}`, label: f.story ? i.name + FROM_STORY : i.name, variant: null, preview: false, name: null, about: null, cls: null, width: null, height: null, bg: null, pad: null,
        note: i.file ? `${i.file}:${i.line}` : null, attrs: [], authored: null, html: f.html, clean: f.html, noteHref: i.file ? editorHref(i.file, i.line) : null });
    }
    // Where it is used: calls of components, uses of classes, raw elements.
    const lines = new Map();
    const put = (file, line, what) => { const m = lines.get(file) || lines.set(file, new Map()).get(file); if (!m.has(line)) m.set(line, { line, href: editorHref(file, line), rep: false, classes: what }); };
    for (const i of a.impls) {
      if (i.kind === 'component') for (const c of r.calls.filter((x) => x.component === i.key)) put(c.file, c.line, i.name);
      else if (i.kind === 'class') for (const u of i.unit.usages || []) put(u.file, u.line, i.name);
      else for (const pl of i.places) put(pl.file, pl.line, i.name);
    }
    const usages = [...lines].map(([file, m]) => ({ file, page: null, lines: [...m.values()].sort((x, y) => x.line - y.line) })).sort((x, y) => y.lines.length - x.lines.length || x.file.localeCompare(y.file));
    const secs = spec ? sections(spec.body).filter((s) => ATOM_AGENT.includes(s.title)).map((s) => ({ title: s.title, html: markdownToHtml(s.text) })) : [];
    out.push({
      id: a.id, name: a.name, job: spec?.data.job || '', intents: spec?.data.intents || [], related: [], counterpart: null,
      units: [], declared: [], styles: [], md: spec?.file || `atoms/${a.id}.md`, mdHref: mdHref(spec?.file || `atoms/${a.id}.md`),
      missingUnits: [], stale: false, todo: 0, updated: null, usageCount: a.uses, fileCount: usages.length,
      modifiers: [], elements: [], pseudo: [], breakpoint: null, tokens: a.tokens, hardcoded: [], overrides: [],
      usages, sections: secs, variants, shared,
    });
  }
  frameCss(out, inventory, renderer);
  return { components: out, failed, failedFrames };
}

// The composites: a frame per instance that is a component of its own (the tree an exported
// component returns), drawn like an implementation; a part of a bigger component is a place.
const COMPOSITE_GUIDE = ['Когда использовать', 'Когда не использовать', 'Анатомия', 'Канон'];
// Page-wide blocks: drawn as wide frames, like a page.
const WIDE_TYPES = new Set(['app-header', 'app-footer']);
const NO_OWN = '<div style="font:14px/1.45 system-ui,sans-serif;color:#475467;max-width:420px">Экземпляры — части больших компонентов: отдельно не рисуются. Места — во вкладке «Где используется».</div>';

export async function compositeGalleryComponents({ patterns, atomIds = new Set(), inventory, renderer, editorHref, mdHref, rebase = (h) => h }) {
  const r = inventory.react || { calls: [], components: [] };
  renderer.providers?.(r.components);
  const out = [], failedFrames = [];
  let failed = 0, n = 0;
  for (const { comp, instances } of patterns) {
    const name = comp.data.name || comp.id;
    const own = [], parts = [], seen = new Set();
    for (const x of instances) {
      const c = x.decl && x.tree?.context?.returned && (r.components || []).find((k) => k.name === x.decl && k.file === x.file);
      if (!c) { parts.push(x); continue; }
      const key = `${c.file}#${c.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      own.push({ x, c, calls: r.calls.filter((k) => k.component === key) });
    }
    own.sort((p, q) => q.calls.length - p.calls.length || p.c.name.localeCompare(q.c.name));
    const drawn = [];
    for (const o of own) {
      const { html, error, story } = await drawComponent(renderer, o.c, o.calls, { r });
      if (error) { failed++; failedFrames.push({ id: comp.id, frame: o.c.name, why: why(error) }); }
      drawn.push({ o, html: error ? failedHtml(error) : rebase(html), ok: !error, story });
    }
    const frame = (f, preview) => ({
      id: `cstate-${++n}`, label: f ? f.o.c.name + (f.story ? FROM_STORY : '') : name, variant: 'default', preview, name: preview ? name : null, about: null, cls: null,
      width: f && WIDE_TYPES.has(comp.data.type) ? 'wide' : null, height: null, bg: null, pad: null, note: f ? `${f.o.x.file}:${f.o.x.line}` : null, attrs: [], authored: null,
      html: f ? f.html : NO_OWN, clean: f ? f.html : NO_OWN, noteHref: f ? editorHref(f.o.x.file, f.o.x.line) : null,
    });
    const live = drawn.find((f) => f.ok) || drawn[0] || null;
    const variants = [{ id: 'default', name, about: null, cls: null, preview: frame(live, true), states: drawn.filter((f) => f !== live).map((f) => frame(f, false)) }];
    // Where it is used: every instance, drawn or not.
    const lines = new Map();
    for (const x of instances) {
      const m = lines.get(x.file) || lines.set(x.file, new Map()).get(x.file);
      if (!m.has(x.line)) m.set(x.line, { line: x.line, href: editorHref(x.file, x.line), rep: false, classes: x.decl || '' });
    }
    const usages = [...lines].map(([file, m]) => ({ file, page: null, lines: [...m.values()].sort((a, b) => a.line - b.line) })).sort((a, b) => b.lines.length - a.lines.length || a.file.localeCompare(b.file));
    const secs = sections(comp.body || '').filter((s) => COMPOSITE_GUIDE.includes(s.title));
    const use = secs.find((s) => s.title === 'Когда использовать');
    // The first point of «Когда использовать»; the canon (the scripts') while that is not written.
    const point = ((use?.text || '').split(/\r?\n/).find((l) => /^\s*-\s+/.test(l)) || '').replace(/^\s*-\s+/, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/`/g, '').trim();
    const canon = (secs.find((s) => s.title === 'Канон')?.text || '').replace(/<!--[\s\S]*?-->/g, '').trim().split(' — ')[0].replace(/`/g, '');
    const job = point && !/TODO/.test(point) ? point : canon ? canon[0].toUpperCase() + canon.slice(1) : '';
    out.push({
      id: atomIds.has(comp.id) ? `p-${comp.id}` : comp.id, name, composite: true, job, intents: comp.data.kinds || [], related: [], counterpart: null,
      units: [], declared: [], styles: [], md: comp.file, mdHref: mdHref(comp.file),
      missingUnits: [], stale: false, todo: 0, updated: null, usageCount: instances.length, fileCount: usages.length,
      modifiers: [], elements: [], pseudo: [], breakpoint: null, tokens: [], hardcoded: [], overrides: [],
      usages, sections: secs.map((s) => ({ title: s.title, html: markdownToHtml(s.text) })), variants, shared: [],
      note: own.length && parts.length ? `Ещё ${places(parts.length)} — части больших компонентов, отдельно не рисуются: они во вкладке «Где используется».` : null,
    });
  }
  frameCss(out, inventory, renderer);
  return { components: out, failed, failedFrames };
}
