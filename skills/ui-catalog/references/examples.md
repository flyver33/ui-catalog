# Examples — `examples/<id>.html`

A flat list of `<template>` elements; anything outside templates is ignored. `generate`
writes them from real markup; you fill its `TODO`s and add what only
a reader of the code knows. Breaking any rule here is an error, not a warning.

The gallery is **all components → component → variant**. A *variant* is a kind a person
picks between (button: Primary / Secondary / Tertiary). Each variant has one **live
example** (real hover and clicks) and its **static states** (pinned hover, focus,
sizes, widths, breakpoints). A component with one kind needs no `data-variant`: the
template marked `data-preview` (or the first) is the live example.

```html
<template data-variant="primary" data-preview data-name="Primary"
          data-about="Одно главное действие в блоке." data-class="x-btn--primary">
  <button type="button" class="x-btn x-btn--primary">Оформить заказ</button>
</template>
<template data-variant="primary">
  <button type="button" class="x-btn x-btn--primary" data-pseudo="hover">Оформить заказ</button>
</template>
<!-- no data-variant: a page example, shown under the variants -->
<template data-label="Кнопки из карточки заказа" data-note="pages/orders/index.html:42">…</template>
```

| Attribute | Meaning |
|---|---|
| `data-preview` | the variant's live example |
| `data-variant` | variant id; groups a live example with its states |
| `data-name` | variant name ([[ex.variant-name]]) |
| `data-about` | one sentence: when to pick this variant |
| `data-class` | the modifier that makes this variant |
| `data-label` | caption of a content state or a page example only ([[ex.caption]]) |
| `data-state` | optional id, unique in the file |
| `data-width` | viewport of the frame in px; `wide` — desktop width, the gallery's width switch may change it; `fill` — a full-row cell at natural width. Unset — the component as on a desktop, past its widest breakpoint |
| `data-height` | fixed frame height, for layouts with `min-height: 100vh` |
| `data-pad` | body padding in px (default 24); `0` for blocks that touch the edges |
| `data-bg` | frame background; the page background when the component sits on it |
| `data-note` | `path:line` of a page example — an editor link |

Inside a template: `data-pseudo="hover"` (also `active`, `focus`, `focus-visible`,
`focus-within`) pins a pseudo-state on the element the selector targets (for
`.nav__link:hover`, the link); `data-include="<path>"` is replaced by that file at build
time; `disabled` is the attribute, not a pseudo.

## Only what the code has

- **ex.attrs** (check) — Only the attributes in the table.
- **ex.lib-classes** (check) — Only library classes: a frame loads only the library CSS.
- **ex.real-combo** (check) — Every class combination occurs in real markup (HTML, or
  markup built in a script string) on the same kind of element — a `<span>` where the
  code has a `<span>`. What the CSS merely allows is for agents (`CATALOG.md`, `query get`), not
  for examples.
- **ex.real-pseudo** (check) — A pinned `data-pseudo` is a state the product shows: the
  CSS defines it (a global `:focus-visible` counts), and it is not a focus the audit
  found lost (`ui-issues.md`).
- **ex.no-style** (check) — No `style` on the component's elements; on a wrapper of a
  page example only layout (`display`, `gap`, `flex*`, `grid*`, `width`, `margin`,
  `padding`).
- **ex.note** (check) — An example that shows several components together exactly as a
  page has them (a pair of buttons from a card) goes without `data-variant`, with
  `data-label` and `data-note`: an existing `file:line` that has the component, and the
  classes in the example are the ones within 40 lines of it.
- **ex.not-blank** (check) — No frame renders nothing: not an empty element whose CSS
  gives it no size, not a breakpoint frame where the CSS hides the component, not a
  frame narrower than a width below which it is hidden (it needs `data-width="wide"`).
  The icon set is exempt: it lives on «Иконки».
- **ex.content** (check) — Every text in an example is a text of the project's code —
  markup or scripts outside the library folder — whole, or its start ending in «…» when it
  is long; never `Lorem ipsum`. A state that needs JavaScript (open menu) is written as
  the markup of that state, with the texts that state shows.

## Variants and states

- **ex.variant** (check) — Each variant: one `data-preview` (plain markup, no
  `data-pseudo`), `data-name`, `data-about`, and `data-class` with its modifier (the
  base kind, without a variant modifier, needs none) present in the live example's
  markup. A state's `data-variant` names a variant that has a live example; no variant
  is declared twice.
- **ex.variant-name** (check) — Variant names come from the dictionary in
  `lib/variants.mjs`: emphasis Primary / Secondary / Tertiary; tone Danger / Success /
  Warning / Info / Neutral; Filled / Outlined only when one emphasis level comes in both
  (a lone `--outline` is Secondary). A modifier the dictionary does not know is named
  by the word of its class (`--inherit` → Inherit) and listed under «К сведению». A
  modifier that only changes size or spacing is a state, not a variant.
- **ex.about** (check) — `data-about` says when to pick the variant by how it looks and
  where it is used, never by hover, clicks or focus: those are states.
- **ex.state-differs** (check) — A state differs from its variant's live example; no
  two states are the same; a state with another variant's modifier is that variant.
- **ex.caption** (check) — Captions are built by `build` from the markup, in English:
  «Hover», «Pressed», «Focus», «Current», «Large, Full width», «≤ 768 px».
  `data-label` only where markup cannot say it: a content state, named by you in
  English («With form», «Leading icon»), or a page example with `data-note`.
- **ex.coverage** (check) — Every modifier the markup uses has an example; every
  `:hover`, `:active`, `:focus-visible` the CSS defines and the product shows is pinned
  somewhere (a warning) — the global `:focus-visible` too, on a component whose element
  or part is interactive and keeps its focus.
- **ex.most-common** (check) — A live example is the class combination the code uses
  most for its variant (a warning).
- **ex.no-todo** (check) — The file exists, has at least one template and no `TODO`.
