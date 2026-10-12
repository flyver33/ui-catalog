---
name: ui-compose
description: Build a UI feature or a small change (a button, a badge, an achievements block, a new section) out of a project's existing component library, and when something is missing, write a gap report for the designer instead of inventing new components. Use whenever a task adds or changes interface in a project that has a ui-catalog library (docs/design-system/CATALOG.md) — "add a button to…", "make an achievements feature", "build this screen from our components", "which components do we need for X". Russian triggers — «добавь кнопку», «сделай фичу из наших компонентов», «собери экран», «каких компонентов не хватает для…», «хватит ли компонентов на…».
metadata:
  version: "0.1"
---

# ui-compose

Turns a task into interface assembled from the library — or into a precise list of
what the library lacks.

```
task → UI jobs → match each job to the library → build what is covered → report what is not
```

## The one rule about the library

**You never extend library components on your own initiative.** No new modifiers,
props, variants or states in library files; no restyling a library class in feature
CSS to fake a variant; no new look-alike component next to an existing one. When a job
needs any of that, tell the developer in one plain sentence — «для этого нужен вариант
`--icon-right` у Button, это к дизайнеру — записал в запрос» — add it to the request
file, and carry on with the rest.

This rule is about your initiative, not about policing people. If the developer says
they will add it themselves, or asks you to add it, do it without arguing or
repeating the warning. Afterwards suggest `ui-catalog refresh` once, so the library
learns about the change.

## Steps

### 1. Load the library

Find `docs/design-system/CATALOG.md` (or the dir the project's `CLAUDE.md` names — the
library may live next to the project, `../ds-web/`). No library — say so and offer
`ui-catalog init`; do not guess components from the code. Below, `<library>` is that
dir: pass it to the scripts as `--dir <library>` when it is not
`docs/design-system/`.
Read the project's `CLAUDE.md` / `AGENTS.md` too: where features live, what may be
edited, how to preview. Those rules decide *where* you write code.

Read `CATALOG.md` in full — it is short: the components and a line per foundation.
When you write CSS of your own (layout glue, a colour, a text), open the foundation
first — `foundations/color.md` for colour roles and background/text pairs,
`typography.md`, `spacing.md`, `layout.md` — and pick tokens by role, not by name.
For details use the query script (path relative to this skill's directory):

```bash
node scripts/query.mjs search <words describing the job>
node scripts/query.mjs get <id> [<id> ...]
node scripts/query.mjs requests      # gaps someone already reported
node scripts/query.mjs tokens [filter]      # tokens with roles: filter by name, kind or role (text, background-hover…)
node scripts/compose.mjs verdict <classes>   # the verdict for one element's classes
node scripts/compose.mjs check <slug>        # a gap report against the template and the library
```

### 2. Break the task into UI jobs

A job is one thing the user sees or does: «показать список ачивок», «отметить новую»,
«показать прогресс до следующей», «сообщить о получении». For each, note content,
states (empty, loading, error, disabled, selected) and where it appears. Ask the
developer only if the task is ambiguous in a way that changes which components are
needed; otherwise state your reading and proceed.

### 3. Match every job

Search by the job's words, then **read the candidates' guidelines** (`get`): «Когда
использовать» and «Когда не использовать» decide *which component*. Then the verdict
for the classes you would put on the element is the script's, not yours:

```bash
node scripts/compose.mjs verdict gm-btn gm-btn--secondary gm-btn--lg
# возможность — Button: CSS позволяет, в продукте такого нет — скажи разработчику, проверь глазами
```

What each verdict means is [[gap.table]] in
[references/gap-report.md](references/gap-report.md). What you do with it:

| Verdict | What you do |
|---|---|
| **есть**, **вариант** | use exactly these classes |
| **возможность** | use it; tell the developer this combination is new to the product and look at it in the preview |
| **расширение**, **нет** | gap → request (вариант / состояние / иконка / новый компонент) |
| **токен** | by role from `foundations/color.md` or `query.mjs tokens <role>`; a value the tokens lack → request |
| **раскладка** | feature CSS with tokens |
| **как есть** | already on the screen, outside the library: keep it, no request [[gap.existing]] |
| **нельзя** | pick one class / one element per call |

**In a React project** (`CATALOG.md` lists «Атомы кита» and «Составные») the verdicts
are the kit's (`compose.mjs verdict`), and the table in the gap report uses them [[gap.kit-table]]:

```bash
node scripts/compose.mjs verdict button variant=secondary size=l
# в спеке — Button в ките ещё нет; пока <Button variant="secondary" size="lg"> (Button, 8 мест) — временно, скажи разработчику
node scripts/compose.mjs pattern dialog      # закономерность: build by the composite's «Канон»
```

| Verdict | What you do |
|---|---|
| **в ките** | use the kit component with exactly these props |
| **в спеке** | use what the script names meanwhile; tell the developer it moves to the kit component later |
| **закономерность** | build by the composite's «Канон» from atoms; layout glue is the feature's |
| **расширение**, **нет** | gap → request (вариант `<atom>--<value>` / новый компонент) |
| **как есть** | already on the screen: keep it as the code has it, no request [[gap.existing]] |

A verdict that names an open question (`type.<component>` in `questions.md`) rests on
it: say so to the developer, the answer may move the component to another atom.

Also check `requests` — a gap may already be reported [[gap.one-request]]. Components marked «код изменился после описания» are
usable, but verify their classes against the CSS before relying on them.

**What the screen already has is not a gap** [[gap.existing]]. Before you match a job,
look at what stands in that place in the code today. A component the task keeps — even
one the library does not describe — stays; ask the verdict for it as the code has it
(`compose.mjs verdict LabeledAutocomplete joinWithOr=false`), never a request for it.
Glue the product already writes around library components in two places or more (a
label over a control) is «раскладка» built like them [[gap.layout-precedent]].

**Inconsistencies** (`ui-issues.md` next to the library; `query.mjs get` prints a
component's as «Несостыковки в коде — не повторяй их в новом»): they are what new code
must not copy — hover on an element that cannot be pressed, a lost focus ring, a colour
without a token, a text style outside the scale. Otherwise use the components as the
code has them; never invent a class to work around an inconsistency.

Show the developer the table — `Что нужно на экране | Вердикт | Чем сделано`, the same
as in the gap report — before building when there are gaps or the task is bigger than a
couple of elements.

### 4. Build what is covered

- Only classes, markup and tokens from the guidelines. Take markup from «Как собрать»
  and `examples/<id>.html`, not from memory.
- Layout glue (spacing between library components, grid of the new block) goes
  where the project keeps feature code, with tokens only.
- For a gap, put the **closest existing component** in its place (its classes get a
  verdict too: есть, вариант or возможность), marked with the need id and the path of
  the request from the project root [[gap.placeholder]]:
  `<!-- ui-compose: временно, ждёт achievement-badge — docs/design-system/requests/achievements.md -->`.
  The feature works and looks honest; nothing pretends to be finished.
- Verify the result the way the project does (its preview server, a screenshot).

### 5. Write the gap report

When there is at least one gap, write `<library>/requests/<feature-slug>.md`
by [references/gap-report.md](references/gap-report.md); an existing request for the same
gap gets your feature instead [[gap.one-request]]. The reader is the designer
who will make the components: plain language, the user-facing function first, the
closest existing component and why it does not fit, where it will be used. Then
`node scripts/compose.mjs check <feature-slug>` until it reports nothing — the template,
the verdicts in the table, a section per need. Then run
`node ../ui-catalog/scripts/build.mjs --root <project> --out <library>` so the request is listed in
`CATALOG.md` and `query.mjs requests`. Give the developer the file path to pass on.

### 6. Tell the developer

Short: what was built from which components, what is temporary and why, the path of
the request file. No lecture about the rule.

## When the designer delivers

That is `ui-catalog add`: it documents the new component and closes the request.
Then replace the temporary placeholders marked `ui-compose: временно`.
