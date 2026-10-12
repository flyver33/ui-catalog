# Stack adapters

An adapter turns source files into **units** — the smallest reusable thing the stack
has — plus their usages. Everything after the scan (guidelines, build, gallery,
check, ui-compose) is stack-independent and reads `inventory.json`.

| Adapter | Status | Unit | Usage | Gallery frame |
|---|---|---|---|---|
| `html-css` | works | CSS class root (`.x`, `.x--mod`, `.x__part` → `x`) | `class="…"` in markup, class names in scripts, `data-include` partials | HTML snippet + project stylesheets |
| `react` | facts (K2); kit specs — K3 | exported component, and global CSS classes as in `html-css` | JSX `<Name>` with props, `className`, raw elements | later (K6) |
| `vue` / `svelte` | planned | SFC | template tags | bundle |
| `storybook` | planned | story file / manifest entry | from the stories | link or iframe to the deployed Storybook |

- **ad.no-adapter** (script: scan.mjs#adapter) — `scan` refuses to run when `package.json` declares a
  framework without an adapter (Vue, Svelte, Angular…). Tell the user and stop; do not
  force `html-css` onto such a codebase — the inventory would be wrong in ways that look
  right. React and Preact get the `react` adapter.

## html-css in detail

- **Units.** Every class in a selector belongs to the root before its first `__` or
  `--`. The first class in a selector owns the rule: `.header__menu .icon` is part of
  `header` and records `icon` as *contextual* (styled inside the header).
- **Home and overrides.** Library stylesheets are read first. A unit's home is where
  it is first defined; rules for it in other scopes are *overrides*, and new
  modifiers invented there are `overrideClasses` — both are shown as signals.
- **Section.** The nearest standalone comment above the unit's first rule
  (`/* ── Кнопки ── */`), recorded on the unit as `section`.
- **Pseudo-states.** Interactive pseudo-classes per class (`hover`, `active`, `focus*`,
  `disabled`, `checked`, `invalid`); `rootPseudo` are the ones on the root class itself.
- **Usages.** `class` attributes in `.html`/`.vue`/`.svelte`/`.php`/templates (HTML
  comments ignored), class names inside `<script>` and `.js/.ts` files (per line),
  and `data-include` partials: an included partial's outermost unit counts as used
  where it is included.
- **Snippets.** Outer HTML of real elements, one per modifier combination, shortest
  first — the raw material for examples.
- **Tokens.** Custom properties declared on `:root`/`html` in `config.tokens` files,
  with the comment group above them and how often `var()` uses them.
- **Icons.** SVGs in `config.icons.dir`, mapped to the library class whose rule
  references them.

- **ad.blind-spots** (script: blind-spots.mjs#blindSpots) — The blind spots the project relies on are found by `scan`
  and named by `check --report`, which you pass on as it is: classes built from strings
  (`'btn--' + kind`, `` `btn--${kind}` ``) with `file:line`, utility-first CSS (Tailwind in
  `package.json` or a `tailwind.config.*`: every class is a unit — use `classPrefix` or
  another adapter), CSS-in-JS (`styled-components`, `@emotion/*`, `@stitches/*`,
  `@vanilla-extract/*`, `linaria`).

## Writing a new adapter

`adapters/<name>.mjs` exports `scan(root, config)` returning
`{ units, tokens, icons, partials }` with the unit shape `html-css` produces (see
`inventory.json`). Add a frame strategy to `build.mjs` if snippets cannot render as
plain HTML. Keep it dependency-free; if the stack's own compiler (e.g. `typescript`)
is installed in the target project, it may be imported from there at runtime.
