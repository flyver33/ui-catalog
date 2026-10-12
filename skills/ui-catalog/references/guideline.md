# The guideline — `atoms/<id>.md`

A finished one to compare with: [sample/](sample/README.md). A guideline answers one
question for someone with a task who does not know the library: *is this the thing, and
how do I use it without breaking anything?* Describe what the code does, not what it
should do. Before writing, read the unit's CSS (all rules, including overrides outside
the library in `inventory.json`), every representative usage with 20–40 lines around it,
and the examples `generate` wrote.

```markdown
---
id: gm-btn
name: Button
type: button
job: Запустить действие на экране — главное или второстепенное.
intents: [действие, кнопка, отправить, открыть контакты, отказать]
units: [gm-btn]
related: [gm-tag]
counterpart: g-btn
sourceHash: 3f2a…
---

## Когда использовать
## Когда не использовать
## Варианты
## Состояния
## Как собрать
## Показательные места
## С чем сочетается
## Подводные камни
```

## Front matter

- **gl.fields** (check) — Only the fields above plus `styles`; `id`, `name`, `job`,
  `intents`, `units` are required; `id` is the file name. Values are taken as written:
  no comments after a value. `status`, `deprecated`, `element`, `group`, `label`… are
  errors.
- **gl.name** (check) — `name` comes from the reference ([[cfg.reference]]), in English
  (the text stays in the project's language), in this order: the project's kit
  component's name; else the name of the `type` from [types.md](types.md) (`button` →
  Button, `nav-item` → Menu item); only when no type fits, leave `type` empty and name
  it yourself — one to three plain English words, singular, first capitalised («Rating
  stars»), listed under «К сведению». With a type set, another name is an error; you do
  not rename around the reference.
- **gl.type** (check) — `type` is one of [types.md](types.md) (`lib/types.mjs`). It
  decides the name, the states the component must have and the drafts below.
- **gl.job** (check) — `job` is one sentence, starting with a verb in the infinitive,
  about the user's task, without classes. Once `type` is set, `generate --facts` puts
  the type's draft into an empty `job`; sharpen it from the real places.
  Good: «Показать короткое свойство объекта: навык, статус». Bad: «Компонент кнопки.»
- **gl.intents** (check) — `intents`: 3–8 words a person would use to describe a task
  this component solves, each once, no classes, at least one from the type's draft;
  add the words of the real places. `ui-compose` matches tasks against them.
- **gl.script-fields** (check) — `related`, `counterpart` and the sections «Варианты»
  (except its column «Когда выбирать»), «Состояния», «Показательные места», «С чем
  сочетается» are written by `generate --facts` from the code. Do not edit them: fix the code, the type or
  the examples, then run `generate --facts <id>|all`. A difference from what the script
  writes now is an error. Only with a kit as the reference may you write `counterpart`:
  the kit's name as the kit writes it, `Name` or `Name#prop` (`web-tag#notHover`), not
  the component's own name again.
- **gl.styles** (check) — `styles` (extra CSS for gallery frames) only for a component
  outside the library; a library component's frames load the library CSS.

## Sections

- **gl.sections** (check) — Exactly the eight sections above, in that set; the gallery
  and `ui-compose` read them by name. The scripts know the Russian set only; another
  language comes once its set is added to them.
- **gl.no-classes** (check) — Text for people names no CSS classes: «Когда
  использовать», «Когда не использовать» and «Подводные камни» are shown in the gallery.
  Say the variant («вид Primary»), the part («текст тега»), the element («кнопка в
  шапке»). Native elements (`<a>`, `<img>`) and file links are fine; classes live in
  «Варианты» and «Как собрать».
- **gl.when-use** (check) — «Когда использовать»: concrete situations seen in the usages
  («главное действие в карточке кандидата»), 2–5 bullets, or one when the component is
  used in one file.
- **gl.when-not** (check) — «Когда не использовать»: every bullet names what to take
  instead — a linked component, a native element, or «в базе нет» (a known gap). Every
  library component of a look-alike type (Tag ↔ Chip, Button ↔ Link / Menu item…) gets
  a bullet with its link.
- **gl.when-pick** (agent) — The column «Когда выбирать» in «Варианты» — the one cell of
  the code sections you write — is one phrase from the real places («одно главное
  действие на блок»). `--facts` keeps it. *Only the agent:* what a variant is for is read
  from the places; [[gl.no-todo]] holds that the cell is written.
- **gl.assemble** (agent) — «Как собрать»: the snippet `generate` wrote — a real usage,
  its context already stripped — stays; under it you write the rules:
  required element and attributes, what may go inside, what the base expects around it. *Only the agent:* the rules are about intent; the markup is the script's.
- **gl.pitfalls** (agent) — «Подводные камни»: what goes wrong in use — values without
  tokens, overrides outside the library, responsive surprises, accessibility gaps, one
  class on elements that behave differently. Plain words: «Inherit на белом почти не
  отличается от Secondary». Lines `generate` wrote from the code stay. *Only the agent:* what goes wrong in use is read from the code by a person; the
  lines the code shows are the script's.
- **gl.links** (check) — Links to code are relative to the guideline's folder
  (`atoms/`) and end with `#L<line>` (`[pages/x.html:12](../../../pages/x.html#L12)`);
  each must point at a line that still uses the component — its class, a modifier, or a
  class of its part (`gm-nav__link--active` set by a script counts). In a path, `(`, `)` and
  spaces are percent-encoded (`app/%28shell%29/page.tsx`): Markdown ends a link at `)`. Links to another component:
  `[Tag](gm-tag.md)`; to a foundation: `[Цвета](../foundations/color.md)`.
- **gl.lang** (check) — Prose is in the language of the project's own docs (`lang` in
  the config): in `job` and every section you write, without code, links and class
  names, most letters are Cyrillic for `ru` and Latin otherwise.

## Done

- **gl.no-todo** (check) — No `TODO` left anywhere in the guideline.
- **gl.seal** (check) — `check --seal <id>|all` writes `sourceHash` (a hash of the code, the guideline and the examples) and is
  refused while the component has errors or `TODO`. Not sealed is an error; a seal the
  code, guideline or examples no longer match is the warning that calls for `refresh`.
