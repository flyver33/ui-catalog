# What a component is

The library is **atomic**: a component is the smallest element that means something on
its own and is reused — a button, a tag, a select, an icon, a logo, a menu item, an
avatar. `generate` decides most of it from the code; the rules below say what is left
and what `check` holds.

- **comp.code-truth** (agent) — The catalog describes the code as it is. Never change
  component source to make the library look better. Where the code contradicts itself
  (hover on a span, a class that looks like a patch), describe it as it is: the
  difference goes under «Подводные камни», the inconsistency is in the report `audit`
  writes (`ui-issues.md`); you do not hide it and do not fix the code. *Only the agent:* the scripts cannot tell your
  edit of the code from the developers'.
- **comp.every-unit** (check) — Every library unit is a component, a `scaffold` line or
  in `ignoreUnits` ([[cfg.ignore-why]]) — never two of these, and never in two
  components.
- **comp.units-exist** (check) — `units` lists units `scan` found in the code; a
  modifier only when it is cut off as its own component ([[comp.split]]). A unit that
  vanished from the code is an error: update `units` or remove the component.
- **comp.atoms** (check) — Composite blocks (a header: logo + menu + button + avatar; a
  filter bar: a row of selects) and page scaffolding (containers, page backgrounds,
  grids, wrappers) are not components. `generate --all` writes them into `scaffold`
  itself ([[cfg.scaffold]]) and describes only atoms; a unit in `scaffold` that is an
  atom is a warning. An icon inside an element does not make it composite (a select
  with a chevron is an atom).
- **comp.parts** (agent) — Parts of one atom that never appear apart (`.nav` +
  `.nav__link` → Menu item) are one component: `generate.mjs <units> --as <id>`. When
  unsure whether something is an atom: would a designer put it on its own in a Figma
  library and reuse it? A header — no, it is assembled. A menu item — yes. *Only the agent:* whether a designer would
  reuse it on its own is meaning; what the code shows (only layout, a block of other
  components) `generate` decides itself.
- **comp.split** (check) — One class family is one component, with one exception the
  scripts make (`lib/split.mjs`): a modifier that sits only on elements a person can
  press (at least once), changes the look at rest and is not a state class, while the
  base without it sits mostly on static elements, is a separate component — Tag on
  `<span>`, «+N» Chip `gm-tag gm-tag--blue` on `<button>`. `generate` writes it with
  `id` and `units: [gm-tag--blue]`; it owns only the usages with the modifier, parts
  (`__title`) stay with the base. Its examples carry the modifier, the base's never do.
  Described as the base's variant, or cut off without that sign, is an error; you do
  not decide either way. Everything else on one class stays one component.
- **comp.split-type** (check) — The clickable pair of a static type gets that type's
  pair (`tag` → `chip`, `SPLIT_TYPES` in `lib/split.mjs`).

## The library

- **lib.layout** (check) — A guideline (a `.md` with front matter `id`) in the root of
  the library dir or in `components/` (where guidelines lived until 2026-10-09) instead of
  `atoms/` is an error: no script reads it there.
- **lib.signals** (check) — Besides the rules, `check` reports what the code itself
  says and the agent cannot fix: pages and features that override a component (info),
  classes invented outside the library (warning), the number of inconsistencies in the
  report (info), a library not built yet (warning). They go to the user as they are.
