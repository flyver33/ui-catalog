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
## API
## Варианты и состояния
## Токены
## Доступность
## Что заменяет
## Открытые вопросы
```

- **atom.fields** (check) — Only the fields above; `id`, `name`, `type`, `job`,
  `intents` are required. `type` is the atom's id: the scripts decide it, you never
  change it — where a component looks like another atom, the question is in
  `questions.md`. `name` comes from the type reference, in English. `kit` is
  empty until the kit component exists, then `<file>` or `<file>#<Name>` of it
  ([[kit.implemented]]).
- **atom.sections** (check) — The sections above, in this order. «API», «Варианты и
  состояния», «Токены», «Доступность», «Что заменяет» and «Открытые вопросы» are written
  by the scripts from the facts and the answers; you write `job` and `intents` (`generate`
  puts the type's draft there — sharpen it from the places, replace a `TODO`),
  «Когда использовать» and «Когда не использовать», by the same rules as a guideline
  ([[gl.job]], [[gl.intents]], [[gl.when-use]], [[gl.when-not]]).
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

Where the implementations disagree, the scripts write a question into `questions.md`
with the facts, the options and a recommendation. Who can answer is not known in
advance — a developer or a designer — so the file is the one place for questions and
answers; the chat is a way to ask them.

- **ask.chat** (agent) — When a person is in the chat, ask the open questions from
  `questions.md` as they are written there — the facts, the options, the recommendation —
  in batches of at most 15, grouped by atom. Write every answer into `questions.md` with
  who answered and the date; an answer that lives only in the chat does not exist. *Only the agent:* the conversation is in the chat; what lands in the file is
  [[ask.record]].
- **ask.no-guess** (agent) — Never answer a question yourself, and never pick the
  recommendation for someone who did not say so. Without a person, leave the questions
  open and tell the user how many remain and where the file is. *Only the agent:* the file cannot tell who
  wrote an answer; [[ask.record]] refuses one signed by an AI.
- **ask.record** (check) — An answered question has an answer (one of its options or
  free text), who answered and a date; anything else in the answer fields is an error.
  «Кто ответил» is a person or a role, never an AI («агент», «Claude», «ИИ», «AI»).

## After check

- **kit.open** (check) — A spec with open or stale questions cannot be sealed; the
  report lists how many are open and where. In kit mode «not sealed» is therefore a
  warning, not an error as for a guideline ([[gl.seal]]): what blocks it is the people's
  answers, not the agent's work.
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
