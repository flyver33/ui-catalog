# The atom spec — `atoms/<id>.md`

> With the `react` adapter an atom is a spec of a React kit component the developers will
> build; you write its prose and ask the open questions, the scripts write everything
> that comes from the code.

```markdown
---
id: button
name: Button
type: button
job: Запустить действие на экране — главное, второстепенное или опасное.
intents: [действие, кнопка, отправить, сохранить, отменить]
kit:
sourceHash: …
---

## Когда использовать
## Когда не использовать
## Что брать сегодня
## Поведение
## Подводные камни
## API
## На проверке
## Варианты и состояния
## Токены
## Доступность
## Что заменяет
```

The first six sections are the card `ui-compose` reads (`query.mjs get <id>`); the rest is
the full spec for the developers who build the kit (`get <id> --full`).

- **atom.fields** (check) — Only the fields above; `id`, `name`, `type`, `job`,
  `intents` are required. `type` is the atom's id: the scripts decide it, you never
  change it — where a component looks like another atom, the question is in
  `questions.md`. `name` comes from the type reference, in English. `kit` is
  empty until the kit component exists, then `<file>` or `<file>#<Name>` of it
  ([[kit.implemented]]).
- **atom.sections** (check) — The sections above, in this order. «Что брать сегодня»,
  «API», «На проверке», «Варианты и состояния», «Токены», «Доступность» and «Что
  заменяет» are written by the scripts from the facts and the answers; you write `job` and
  `intents` (`generate` puts the type's draft there — sharpen it from the places, replace
  a `TODO`), «Когда использовать» and «Когда не использовать», by the same rules as a
  guideline ([[gl.job]], [[gl.intents]], [[gl.when-use]], [[gl.when-not]]), and
  «Поведение» and «Подводные камни» ([[atom.behavior]], [[atom.pitfalls]]). A `TODO` left
  in a section you write is an error.
- **atom.behavior** (agent) — «Поведение»: what the component does in use that its props
  do not tell — what happens while an action runs (how the product shows loading, what
  is disabled), what `disabled` looks like, what an icon does with the colour, how it
  behaves as a link. Bullets, each from the code: the CSS of the implementations and
  the places that use them; where implementations behave differently, say which does
  what. Nothing the kit «should» do: only what the code does today. *Only the agent:*
  behaviour lives in handlers and in the CSS together; which of it a builder needs is
  judgement.
- **atom.pitfalls** (agent) — «Подводные камни»: what goes wrong when someone builds with
  it, each with how to avoid it — defaults that bite (`<button>` is `submit` in a
  form), rules that act at a distance (a margin between neighbours, `!important` on a
  colour), classes that do nothing (`ui-issues.md` lists them), an implementation
  that looks like another, an inconsistency from `ui-issues.md` that new code must not
  copy. Numbered, most harmful first; a pitfall another implementation does not have
  says which one has it. Unlike a guideline ([[gl.no-classes]]), «Поведение» and «Подводные
  камни» of an atom name classes: until the kit exists, builders write them. Check it the way it fails: the first builders on the catalog
  are agents, and what they got wrong is the list. *Only the agent:* a pitfall is a
  consequence for someone building, not a fact of the CSS; which facts have one is
  judgement.
- **atom.no-invent** (check) — A prop, a value or a default that is neither in the
  facts nor in an answer in `questions.md` is an error. You do not design the API: the
  code and the people do.
- **atom.one-file** (script: atom-spec.mjs#rewriteAtomFile) — Once the kit component exists, the spec stays the same
  file with `kit:` set (decision of 2026-10-09): `generate` keeps the field and rewrites
  its sections, nothing else describes the component; `check` compares the component
  with the API from then on ([[kit.implemented]]).
- **atom.kit-field** (agent) — Set `kit:` when the developer says the kit component is
  built (or asks you to), never on a guess from a component's name; then `generate` and
  `check`, and tell the developer every `kit.implemented` difference as it is. *Only the agent:* that the component is built is
  the developer's word in the chat; a name proves nothing.

## Questions

What came from the code and is not decided — values where the implementations disagree,
props and implementations beyond the API — the scripts put into `questions.md` with the
facts, the options and a recommendation: one question per atom, its items numbered, in
two parts — «Продукту и дизайну» (what the user sees or does) and «Разработчикам» (how
the code is written). The file is the one place for questions and answers; the chat is a
way to ask them.

- **ask.plan** (agent) — Before the work and after each step, show the person where it
  stands: `node scripts/task.mjs --plan` prints the steps for the state of the catalog —
  what you do, what comes out, and whether a person is needed, what for and how long it
  takes. Hand it over as it is; say which step you start. A person is asked only at the
  steps the plan marks, and everything of one step in one message: the introduction and
  the families at the start, `questions.md` at the end (it can go to the team, nobody waits
  for it). Between them you work without asking. *Only the agent:* the conversation is
  where the plan is shown; the script cannot say what the person already knows.
- **ask.chat** (agent) — When a person is in the chat, ask the open questions of their
  part of `questions.md` (a designer or product manager — «Продукту и дизайну», a
  developer — «Разработчикам»; unsure — ask who they are) as they are written there —
  the items, the options, the recommendation — one atom at a time; «по рекомендации» is an
  answer to all its items. Write every answer into `questions.md` with
  who answered and the date; an answer that lives only in the chat does not exist. *Only the agent:* the conversation is in the chat; what lands in the file is
  [[ask.record]].
- **ask.no-guess** (agent) — Never answer a question yourself, and never pick the
  recommendation for someone who did not say so. Without a person, leave the questions
  open and tell the user how many remain and where the file is. *Only the agent:* the file cannot tell who
  wrote an answer; [[ask.record]] refuses one signed by an AI.
- **ask.code** (check) — What is wrong in the product's code, not in the catalog — found while
  writing specs, reviewing composites or building a screen (a sub-agent's «несостыковки»):
  focus hidden everywhere, one thing built four times, a dead prop, a broken label — goes
  to people as a question in `questions.md`, in the block «Код продукта» of the part its
  fix changes: what the user sees — «Продукту и дизайну», how the code is written —
  «Разработчикам». One item per issue, written by you:

  ```markdown
  ### Код продукта

  <!-- block: code.dev -->

  1. Фокус с клавиатуры не виден у полей и кнопок
     - Где: app/styles/reset.css:92
     - Что не так: reset снимает outline у input и button; своё кольцо есть только у Switcher
     - Рекомендация: **исправить** — без фокуса формой не пользоваться с клавиатуры
     <!-- {"id":"code.focus-hidden"} -->

  - **Ответ:**
  - **Кто ответил:**
  - **Дата:**
  ```

  `generate` keeps the items, folds the answered ones like any other, moves one answered
  «передать продукту» or «передать разработчикам» to the other part. An item needs a title,
  «Где» with a `file:line` of the project, «Что не так», and an id `code.<slug>` met once.
  What only one screen needs is not here: it is the task's, told to the developer.
- **ask.product-words** (check) — An item for product is named by what the user sees,
  without code: «Список с поиском внутри», not «`searchable`»; the script writes
  «TODO: что видит пользователь — `<проп>`» until you do. Replace only that line of the
  item in `questions.md` (after the number), from the places in the code; the facts
  under it stay for developers. A sub-agent working beside others does not edit
  `questions.md` — several would overwrite each other: it sends the lines in its answer
  (`<id of the item> → <words>`), and the main agent writes them. `check` warns about a TODO left and errs on a name with
  backticks or camelCase.
- **ask.record** (check) — An answered question has an answer (one of its options or
  free text), who answered and a date; anything else in the answer fields is an error.
  «Кто ответил» is a person or a role, never an AI («агент», «Claude», «ИИ», «AI»).

## After check

- **kit.open** (check) — Open or stale questions do not keep a spec from being sealed: the
  seal says the text was checked against the code, and an answer changes the atom's facts,
  so it breaks the seal of exactly that atom and the agent re-reads it (decision of
  2026-11-24: with a question on every atom no spec was sealed, and a refresh had to re-read
  all of them). The report lists how many questions are open and where. In kit mode «not
  sealed» is a warning, not an error as for a guideline ([[gl.seal]]).
- **kit.implemented** (check) — `kit:` is `<file>` or `<file>#<Name>`: a component in
  the code; a file with one component of the atom's type needs no name. Otherwise an
  error. `check` compares the component with the API, each difference an error: a prop
  of the API it lacks (the native attributes of its element count when its props extend
  them — `ButtonHTMLAttributes<…>`, `ComponentProps<'button'>`); a value it lacks, by
  the API's name on the one scale (`m`, not `md`: the finding says which of its values
  is that one); a default other than the API's; a prop or value it has that an answer in
  `questions.md` removed (dropped, merged, renamed). A value whose question is still
  open is a warning that points to the question. Values typed as a non-literal
  (`string`) cannot be compared: a warning.
- **kit.space-inside** (check, K9) — In the kit a composite's component (an empty state, a
  confirm dialog, a section) sets the spacing between its parts itself, by the decided
  role tokens, and takes no margins from the page; spacing between components on a page
  is set by a layout component whose gap takes a role (`<Stack gap="title-text">`), not
  px. `check` reports a kit component whose CSS spaces its parts with a value that is not
  its role's token.
