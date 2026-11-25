# `catalog.config.json`

Created by the first `scan`, owned by the project. What `scan` detected stays unless it
is wrong for this project; what scripts write there, you do not edit.

```json
{
  "adapter": "html-css",
  "project": "acme",
  "styles": ["base/fonts.css", "base/tokens.css", "base/base.css", "base/components.css"],
  "tokens": ["base/tokens.css"],
  "icons": { "dir": "base/icons", "base": "gm-icon" },
  "scopes": [
    { "name": "base", "match": "base/**", "library": true },
    { "name": "feature", "match": "features/*/**" },
    { "name": "page", "match": "pages/*/**" }
  ],
  "showcase": ["catalog/**"],
  "exclude": ["**/proto/**"],
  "ignoreUnits": [],
  "scaffold": { "gm-header": "шапка — блок из Logo, Avatar, Button, Menu item · партиал base/partials/header.html" },
  "brand": { "logo": "base/img/logo.svg", "title": "Style Guide" },
  "reference": { "kind": "types", "name": "справочник типов ui-catalog", "source": "references/types.md", "lang": "en" },
  "classPrefix": null,
  "editor": "vscode",
  "frame": { "bg": "#ffffff", "pad": 24, "desktop": 1440 },
  "lang": "ru"
}
```

## What you may set

- **cfg.scan-fix** (agent) — After the first scan, fix what detection got wrong until
  the summary looks like the project, and nothing else:
  - `styles` — what every page loads, in the order pages load it;
  - `scopes` — first match wins; `library: true` marks what is documented, other scopes
    are where usages and overrides come from; a single `*` in `match` becomes the scope
    slug (`feature:pod-tab`);
  - `showcase` — demo pages: counted apart, never as real usage;
  - `exclude` — added to `.gitignore` and the built-in excludes (`node_modules`, `dist`…);
  - `classPrefix` — only classes starting with it become units;
  - `ignoreUnits` — library units to skip (dead code, helpers).

  *Only the agent:* a wrong detection shows only against the project as a person sees
  it; the scan summary is what you compare.
- **cfg.families** (check) — React: `families` — the families of screens, parts of the
  product built alike (the employer's cabinet, the candidate's profile, a landing):
  `[{ "name": "Кабинет работодателя", "match": ["app/(shell)/employer/**", "features/employerVacancies/**"] }]`.
  A family is where a builder takes the size of a button and the spacing from: draw the
  line where the code changes its way — another button, another stylesheet, another
  message file — not by route. First match wins, as with `scopes`. Missing in kit mode, a
  name that is not 1–4 words or has `TODO`, a glob that matches no file of the project
  is an error. You set it after the first scan; `build` writes the families'
  facts into `screens.md` ([screens.md](screens.md)).
- **cfg.families-cover** (check) — Files that use the library's atoms but are in no family
  are an error, by folder (two levels), most used first, until it is decided once: the
  folder goes into a family (a new one, or the match of one), or into `outside` with why it
  needs none — `"outside": [{ "match": "widgets/app-header/**", "why": "шапка — сама себе
  образец" }]` (decision of 2026-11-24: as a warning it was left; the messenger, a part of the
  product, had no family and no samples). A builder changing such a part gets no samples
  and no «Что брать сегодня». A folder with one file and fewer than
  5 uses is not listed; the library itself — the files where atoms are defined and the
  `library` scopes — is not counted.
- **cfg.ignore-why** (check) — Every `ignoreUnits` entry says why:
  `{ "id": "gm-old", "why": "нигде не используется" }`. A bare id is a warning.

## Introduction to the project

What the code does not say — what is not the product, what is on its way out, who
answers, whether a designer takes requests — is asked once, before the first `generate`,
and kept in the config (decision of 2026-11-23: a minified demo stylesheet put garbage
into the type scale, requests drawn for mock-ups looked like the product's gaps, and the
catalog was built from a branch someone was changing).

```json
"context": {
  "askedAt": "2026-11-23",
  "branch": "master",
  "kept": ["shared/ui/stories/**"],
  "legacy": [{ "match": "app/old-cabinet/**", "why": "переписывают на кит" }],
  "requests": "designer",
  "notes": ["Ветки design/* — макеты, не продукт: каталог по ним не собирать."],
  "assumed": [{ "question": "Что переписывают?", "assumed": "ничего" }]
}
```

- **cfg.intro** (agent) — In a project whose config has no `context`, before the
  first `generate`: `node scripts/task.mjs --intro` prints what the scan found suspicious
  and the questions. Ask them in one message — the suspects as a list with the
  recommendation for each («исключить из каталога» / «это продукт»), then the open
  questions: what else is not the product (mock-ups, demos, prototypes, special
  projects); what is being rewritten and must not be an example; whether the designer takes requests
  (no — when the person who designs is the one asking); what in this repository is not
  as the code suggests. Write the answers: a suspect or a folder that is not the product
  → `exclude`; a suspect that is the product → `context.kept`; the rest into `context`,
  with today's date in `askedAt`. An answer «не знаю» — the person runs the skill but
  does not own the product — does not stop the work: take your recommendation, write it
  where the answer would go, and add `{ "question", "assumed" }` to `context.assumed`; the
  question goes to the team in `questions.md`. When the team answers, put their answer in
  its place and drop the item from `assumed`. Without a person in the chat, ask nothing: leave
  `context` out and tell the user the catalog is built without it. *Only the agent:* the
  answers are in a person's head, not in the code.
- **cfg.context** (check) — A config without `context` is a warning that lists the
  questions; with it, the fields are those above: `askedAt` a date, `branch` a branch
  name, `kept` and `legacy[].match` globs that match files of the project, `legacy[].why`
  not empty, `requests` one of `designer` and `none`, `notes` strings, `assumed` items with a
  `question` and what was `assumed`; an item the team answered in `questions.md` and still
  in `assumed` is a warning: put the answer in place. Anything else is
  an error.
- **cfg.suspects** (check) — A suspect the scan finds that is neither in `exclude`
  nor in `context.kept` is a warning: asked once, answered once. Suspects are what is
  rarely the product: a folder named `demo`, `demos`, `mock`, `mocks`, `design-mock`,
  `proto`, `prototype`, `prototypes`, `playground`, `sandbox`, `specprojects`, `examples`
  or `__mocks__` with stylesheets or components in it; a minified stylesheet (a line of
  more than 2000 characters, or `*.min.css`).
- **cfg.branch** (check) — When the project is a git repository and its current
  branch is not `context.branch`, `check` warns: the catalog describes that branch, not
  the main one. Without `context.branch` it says which branch the catalog was built from.

## What you leave as it is

- **cfg.keys** (check) — Only these keys: `$comment`, `adapter`, `project`, `styles`,
  `tokens`, `icons`, `scopes`, `showcase`, `exclude`, `ignoreUnits`, `scaffold`,
  `labels`, `reference`, `issuesFile`, `brand`, `classPrefix`, `editor`, `frame`,
  `lang`, `typography`, `messages` (react: where the message files are), `stories`
  (react: folders of the project's stories), `families` (react: [[cfg.families]]), `outside` ([[cfg.families-cover]]), `context` ([[cfg.context]]), `rejectPatterns`
  (react: candidates you rejected, `{ id, why }` — [[pat.review]]). Anything else (`accepted`, `decisions`, `hideTokenGroups`…) is an
  error, and so are leftovers of older formats in the library dir: `decisions.json`,
  `audit.json`, `issues/`.
- **cfg.reference** (check) — `reference` is what component names are checked against
  ([[gl.name]]): `{ kind, name, source, lang }` and no other field. `scan` detects it —
  the project's kit, else platform guidelines, else `types.md` — and you keep it as
  detected. Missing is an error.
- **cfg.scaffold** (check) — `scaffold` lines are written by `generate --all` (label
  from the code) and `generate --facts all` (the tail from
  the code): `"<label, 1–4 words, no classes> — <tail from the code>"`.
  You do not write or reword them; a line off the template, a label with a class or
  longer than 4 words, a tail other than the code's, or `TODO` is an error.
- **cfg.labels** (check) — `labels` belong to the user: page and feature classes in
  plain words for «Где используется». You write none — the sample has
  none either; a place without one is named from the code. A label present is 1–4
  words, not a class or a CSS word, and without `TODO`.

Detected by `scan`, kept unless wrong: `project` (`package.json` name, else the first
heading of README.md / CLAUDE.md / AGENTS.md up to « — », else the folder name),
`icons` (`dir`; `base` — the icon class family when every icon class shares one root),
`brand.logo` (the `*logo*` image the code refers to from the most files), `tokens`,
`stories` (react: the project root or a folder next to it with a `.storybook/`). Optional:
`issuesFile` (where `audit` writes the report, default `ui-issues.md` next to the
library dir), `editor` (`vscode`, `cursor`, `none`), `frame`, `typography.families`
(the order of type families in the gallery when the guess is wrong).
