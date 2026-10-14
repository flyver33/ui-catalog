# Composites — `composites/<id>.md`

> A composite is a pattern the
> product already has — a snippet, a dialog, an empty state, a banner — whether the
> developers made it a component or lay it out anew each time. It is not part of the
> kit: it is described as the code has it, so that new features are built the same way.

The scripts find candidates with evidence (`candidates.md`), group them and write a
composite per group — a dialog per kind, a snippet per entity; you review the groups:
reject what is not the pattern, move an instance to the composite it belongs to, split
or merge; the scripts rewrite the description; `check` holds your decisions to the facts. Types and
their anatomy: [composite-types.md](composite-types.md).

```markdown
---
id: empty-state
name: Empty state
type: empty-state
kinds: [first-use, no-results, error]
entity:
candidates: [c-0f3a, c-91b2, c-77d0]
merged: обязательные слоты совпадают
added: ["features/digests/ui/List.tsx:88 — ветка !items.length"]
why:
---

## Когда использовать
## Когда не использовать
## Анатомия
## Виды
## Состав
## Канон
## Экземпляры
```

## What you decide

- **pat.judgement** (agent) — Read every candidate's code with 20–40 lines around it
  and decide by meaning, not by markup: six empty states laid out six ways are one
  pattern; two blocks with the same markup and different jobs are two. Merge when the
  required slots of the type match and the job is the same; split when a required slot
  or the kind differs. This is the part only you can do; everything else comes from the
  reference and the facts. *Only the agent:* meaning, by definition.
- **pat.review** (check) — Every candidate ends up in exactly one composite
  (`candidates:`) or is rejected in `catalog.config.json` → `rejectPatterns` with its
  reason. A candidate left over is an error.
- **pat.reasons** (check) — Reasons come from fixed lists, and `candidates.md` prints
  them for each candidate's type. Reject: «один экземпляр»; «часть атома» (a dropdown's
  rows, a calendar); «часть составного <id or type>» (a table's row, a row inside a
  snippet); «основа обёрток» (the shared base the instances wrap — they are counted, it
  is not); «тот же экземпляр, что <candidate id>» (the same block found twice — that one
  stays — and is in a composite); «ложное срабатывание: <case>» with a case of the type's
  list or a common one («страница или секция целиком», «совпало имя, смысл другой»,
  «совпал текст, смысл другой», «признак во вложенном компоненте»). Merging
  several candidates (`merged:`): «обязательные слоты совпадают». A composite made of
  part of a candidate (split): «различается обязательный слот» or «различается вид».
- **pat.split** (agent) — With more than 100 candidates and sub-agents at hand, split the
  review: groups of composites about even by candidates, one sub-agent each, the brief
  from `node scripts/task.mjs --composites <id>[,<id>...]` handed over as it is. A
  sub-agent edits only its composites and answers with JSON — the candidates it rejects
  and those it moves to a composite outside its group; you write `rejectPatterns`, move
  those candidates, settle a place two groups both kept (one stays, the other is «тот
  же экземпляр, что …»), delete the composites left under [[pat.threshold]], then
  `generate`, `build`, `check`. Fewer candidates — review them yourself: a sub-agent
  re-reads the rules and costs more than it saves. *Only the agent:* whether sub-agents
  exist is the environment's, and where groups overlap shows only in their answers.
- **pat.added** (check) — A place the scripts missed goes into `added:` as
  `file:line — признак`; the place must exist and show a signal of the type, and must not
  be a candidate already (then it goes into `candidates:`).
- **pat.threshold** (check) — A composite has two or more instances by meaning
  (decision of 2026-10-09); a composite left with fewer is deleted. One place is not a pattern, and neither is one block drawn
  twice in one component (a grid on desktop and a carousel on phones: the same tree
  signature in the same component counts once).
- **pat.slots** (check) — The type's required slots are present in every instance (an
  empty state has a title and a text or an action).

## What the reference decides

- **pat.type** (check) — `type` and `kinds` come from
  [composite-types.md](composite-types.md); a kind must match the anatomy found (a
  `confirm` dialog has no form fields). The kind a script guessed from a name is a hint:
  moving an instance to the composite of another kind is your call, the anatomy decides.
- **pat.project-type** (check) — When no type fits — a product block like an AI
  strategy panel — `type: project` with `why:` in one sentence. It is described in full,
  like any composite (decision of 2026-10-09), and the report lists it as a candidate for
  the reference.
- **pat.name** (check) — The name is built, not invented: kind + entity + type when
  there is an entity («Vacancy snippet», «Confirm dialog», «No-results empty state»), the
  type's name otherwise. The entity comes from the code (types of `@entities/*`, the
  component name: `VacancyCard` → vacancy).

## What you write

- **pat.sections** (check) — The sections above, in this order. «Анатомия», «Виды»,
  «Состав», «Канон», «Экземпляры» are written by the scripts; you write «Когда использовать» and «Когда не использовать» by the
  same rules as a guideline ([[gl.when-use]], [[gl.when-not]]), starting from the kind's
  draft.
- **pat.no-fix** (agent) — Where instances differ from the canon or bypass a
  component, describe the pattern as it is; the differences are inconsistencies the
  scripts list in `ui-issues.md`. Never change the code to make a pattern look tidier
  ([[comp.code-truth]]). *Only the agent:* as [[comp.code-truth]].
