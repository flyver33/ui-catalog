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
- **cfg.ignore-why** (check) — Every `ignoreUnits` entry says why:
  `{ "id": "gm-old", "why": "нигде не используется" }`. A bare id is a warning.

## What you leave as it is

- **cfg.keys** (check) — Only these keys: `$comment`, `adapter`, `project`, `styles`,
  `tokens`, `icons`, `scopes`, `showcase`, `exclude`, `ignoreUnits`, `scaffold`,
  `labels`, `reference`, `issuesFile`, `brand`, `classPrefix`, `editor`, `frame`,
  `lang`, `typography`, `messages` (react: where the message files are), `rejectPatterns`
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
`brand.logo` (the `*logo*` image the code refers to from the most files), `tokens`. Optional:
`issuesFile` (where `audit` writes the report, default `ui-issues.md` next to the
library dir), `editor` (`vscode`, `cursor`, `none`), `frame`, `typography.families`
(the order of type families in the gallery when the guess is wrong).
