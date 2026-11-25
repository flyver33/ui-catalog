# The map of screens — `screens.md`

> React. Where a builder looks before writing: which family the file belongs to, and the
> file of that family to build like. The scripts write what the code says about each
> family; you choose the samples and write what to take from them.

```markdown
# Карта экранов — web

## Перед тем как добавлять

- …

## Кабинет работодателя

### Из кода
<!-- generated: files, which implementation of each atom, styles, message files, candidates -->

### Образцы

| Вид | Образец | Что взять |
|---|---|---|
| Окно-подтверждение | `app/(shell)/employer/connected-apps/ui/DisconnectConfirmModal.tsx` | `Modal size="sm"`; «Отмена» `g-btn-secondary` слева, действие `g-btn-primary`; обёртка `gap: 12px` |
```

A family per entry of `families` in the config ([[cfg.families]]), in its order. `build`
rewrites «Из кода» and keeps what you wrote.

- **screen.before** (check) — «Перед тем как добавлять» is there, has bullets and no
  `TODO`.
- **screen.before-what** (agent) — Its bullets are what a builder must look at before
  adding anything, as the product does it: where an action may already stand (a menu,
  a second version of the screen for another width), what every action of a family
  starts with (a guard of a demo mode, a check of rights), where the product's words are
  (message files — take its word, not the task's), how an action shows that it runs and
  who shows its error. Each with the file it is seen in. *Only the agent:* what repeats
  across a family is a habit of the code, found by reading it, not a measure.
- **screen.samples** (check) — Every family has «Образцы»: a table `Вид | Образец | Что
  взять` with at least one row; the sample is a file of the project in a backtick that
  the family's `match` takes, «Что взять» is not empty, no `TODO`.
- **screen.pick** (agent) — Take the samples from «Из кода» → «Кандидаты»: one per kind of
  screen the family has (a confirm dialog, a form dialog, a list with its states, a
  card with actions, a form page, a block of a landing). Short, built of the
  implementations the family uses most, colours from tokens. «Что взять» names what
  differs between families: the size of buttons, the spacing between them, the
  component of a dialog and its size, the order of actions, the message file; a value
  the sample has wrong (a colour in hex) — with the token to take instead. *Only the agent:* which file is
  typical of a family is judgement; the scripts only shortlist.
