# Gap report — `docs/design-system/requests/<feature-slug>.md`

One file per feature. The reader is the designer who will make what is missing; the
second reader is `ui-catalog`, which closes the request when the component exists.

The template is checked: `node scripts/compose.mjs check <slug>` (and `ui-catalog check`
runs the same on every request). Fix what it reports; do not argue with it.

```markdown
---
title: Ачивки в карточке кандидата
feature: achievements
status: open
date: 2026-09-30
needs: [achievement-badge, gm-btn--icon-right, gm-icon--award]
---

## Задача

Две-три фразы: что делает фича для пользователя и где она живёт.

## Что собрано из библиотеки

| Что нужно на экране | Вердикт | Чем сделано |
|---|---|---|
| Ряд ачивок с переносом | раскладка | CSS фичи: flex с переносом и зазором 4px |
| Значок ачивки | нет | `achievement-badge`; временно [Tag](../atoms/gm-tag.md) `gm-tag gm-tag--nohover` |
| Иконка медали | расширение | `gm-icon--award`; временно [Icon](../atoms/gm-icon.md) `gm-icon gm-icon--check` |
| «Все ачивки →» | расширение | `gm-btn--icon-right`; пока [Button](../atoms/gm-btn.md) `gm-btn gm-btn--secondary` |

## achievement-badge — новый компонент

- **Для какой функции:** показать ачивку: иконка, название, получена или нет.
- **Где появится:** карточка кандидата, полный список ачивок.
- **Что должен уметь:** состояния *закрыта / получена / новая*.
- **Ближайшее в библиотеке:** [Tag](../atoms/gm-tag.md). Не подходит: нет места под иконку и состояний.
- **Предложение по API** (решает дизайнер): `.gm-achievement`, `--new`, `--locked`.
- **Блокирует:** нет — сейчас стоит Tag с пометкой `ui-compose: временно`.

## gm-btn--icon-right — вариант gm-btn

- **Для какой функции:** кнопка «Все ачивки →» со стрелкой после текста.
- **Где появится:** конец ряда ачивок.
- **Ближайшее в библиотеке:** [Button](../atoms/gm-btn.md), вид Secondary. Не подходит: иконки в кнопке нет ни в одном виде.
- **Блокирует:** нет — пока кнопка без стрелки.
```

## Rules

- **gap.front** (check) — Front matter: `title`, `feature` (= the file name), `status`
  (`open` | `closed`), `date` (`ГГГГ-ММ-ДД`), `needs` — the ids of what is missing. A
  closed request ends with `Закрыто: [компонент](../atoms/id.md), ГГГГ-ММ-ДД`.
- **gap.sections** (check) — Sections «Задача» (two or three sentences: what the
  feature does for the user and where it lives) and «Что собрано из библиотеки».
- **gap.ids** (check) — A need id does not exist yet: a new component — its proposed
  class (`achievement-badge`); a variant or state — `<component class>--<what>`
  (`gm-btn--icon-right`), not a modifier the component has; an icon —
  `<icon class>--<name>`, not in the set; a token — `--<name>`, not an existing token.
- **gap.table** (check) — Columns `Что нужно на экране | Вердикт | Чем сделано`, a row
  per job. The verdict is not chosen: `node scripts/compose.mjs verdict <classes>` says
  it from the library, and the check recomputes it for every class in backticks. A gap
  row (расширение, нет, токен) names its need id from `needs`; a расширение or нет row
  also names, in backticks, what stands in meanwhile — itself from the library, as the
  product has it (есть, вариант, возможность) — or says `временно ничего` when nothing
  can; `needs` without a gap row is an error.

  | Вердикт | Means | «Чем сделано» |
  |---|---|---|
  | есть | the component as the markup uses it, no modifiers | the classes, a link to the component |
  | вариант | a class combination the product has | the classes |
  | возможность | classes the CSS has, combined in a way the product never shows | the classes; tell the developer, look at it |
  | расширение | the component lacks a modifier, state or icon | the need id, and what stands in meanwhile |
  | нет | no component does this job | the need id, and what stands in meanwhile |
  | токен | a value the tokens do not have | the need id |
  | раскладка | layout the feature writes itself (row, grid, spacing) from tokens | how, in words |
  | как есть | what the screen already has, outside the library ([[gap.existing]]) | the classes |

- **gap.kit-table** (check) — In a React project (the library's `mode` is `kit`) the
  verdicts are the kit's (`compose.mjs verdict`): «в ките», «в спеке», «закономерность»,
  «расширение», «нет», «токен», «раскладка». «Чем сделано» names components as JSX in
  backticks — `<Button variant="secondary">` — and the check recomputes each with
  `node scripts/compose.mjs verdict`; a «в спеке» row also names what stands in
  meanwhile; a «закономерность» row names the composite id in backticks; a расширение
  or нет row names what stands in meanwhile as JSX in backticks («в ките» or «в спеке»)
  or says `временно ничего`. A need for a
  value is `<atom id>--<value>` (`button--xxl`) of kind *вариант <atom id>*; a value the
  API has is not a gap.

  | Вердикт | Means | «Чем сделано» |
  |---|---|---|
  | в ките | the kit component has it | the JSX |
  | в спеке | the spec has it, the kit not yet | the JSX of the atom, and what stands in meanwhile |
  | закономерность | a composite the product already has | its id; built by its «Канон» |
  | как есть | what the screen already has: a project component the library does not describe, or a prop of an implementation the spec drops ([[gap.existing]]) | the JSX as the code has it |

- **gap.needs** (check) — One section per need, `## <need id> — <kind>`, kind one of
  *новый компонент*, *вариант <component id>*, *состояние <component id>*, *иконка*,
  *токен*, in the order of importance, and no section for an id not in `needs`. Each
  has **Для какой функции:**, **Где появится:** (every place in the feature),
  **Ближайшее в библиотеке:** (a link to the closest component and why it does not fit;
  for a token **Ближайшее:** the closest token), **Блокирует:** (what waits for it and
  what stands there now). Optional: **Что должен уметь:**, **Предложение по API**
  (решает дизайнер) — a suggestion, never a design passed off as the answer.
- **gap.placeholder** (check) — A placeholder in code says what it waits for and where
  the request is — its path from the project root, wherever the library lives
  (`docs/design-system/requests/achievements.md`; a library next to the project:
  `../ds-web/requests/achievements.md`): `<!-- ui-compose: временно, ждёт
  achievement-badge — docs/design-system/requests/achievements.md -->`. `ui-catalog
  check` warns when the path does not lead to the request, the request does not exist,
  the need is not in its `needs`, or the request is closed (the component is ready:
  replace the placeholder).
- **gap.existing** (check) — What the screen already has is not a gap. A job done today
  by a component in that place — one the library does not describe, or with a prop the
  spec drops — gets no need, no request and no placeholder when the task keeps it: its
  row is «как есть», with the JSX (or classes) as the code has them, and `compose.mjs
  verdict` must say «как есть» for it. «как есть» never stands in for a gap: in a new
  place the same component is a gap like any other.
- **gap.layout-precedent** (agent) — Glue around library components that the product
  already writes in feature code in two places or more — a label over a control that
  has none, a hint under it — is «раскладка»: build it as those places do and name
  them in the row; with fewer than two, it is a request (вариант or новый компонент).
  *Only the agent:* that two places do the same arrangement is read from feature code,
  which the library does not describe.
- **gap.done** (check) — When a requested component or class appears in the library,
  `ui-catalog check` says so; whoever adds it (`ui-catalog add`) sets `status: closed`.
- **gap.one-request** (check) — A need id in `needs` of two open requests is an error:
  the same gap already requested by another feature gets this feature under that
  request's «Где появится» instead of a second request (`query.mjs requests`).
- **gap.why-not** (agent) — Say what exists and why it does not fit: a designer should
  not have to rediscover the library to answer «а чем не подходит X?». *Only the agent:* why the closest component does not fit is a judgement about the
  feature; [[gap.needs]] holds that the section names it.
