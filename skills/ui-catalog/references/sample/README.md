# Образец: один доделанный компонент

Выдуманный маленький проект (`base/` — библиотека, `pages/` — две страницы) с одним
компонентом, описанным до конца: **Button** (`x-btn`). Это то, что должно получиться
у каждого компонента после `ui-catalog init`.

Что написано руками, а что скриптом:

| Файл | Кто пишет |
|---|---|
| `docs/design-system/catalog.config.json` | `scan` создал; агент поправил области. `labels` нет: их пишет пользователь, не агент |
| `docs/design-system/atoms/x-btn.md` | шапка: `type`, `name`, `job`, `intents` — агент (`job` и `intents` из заготовки типа, уточнены); `related` — скрипт. «Варианты», «Состояния», «Показательные места», «С чем сочетается» — скрипт (`generate --facts`), кроме колонки «Когда выбирать». Остальные разделы — агент |
| `docs/design-system/examples/x-btn.html` | `generate` из разметки; агент дописал `data-about` и пример со страницы |

Сгенерированные файлы (`inventory.json`, `components.json`, `CATALOG.md`, `foundations/`, `gallery/`,
`docs/ui-issues.md`) здесь не лежат. Скрипты не запускаются внутри папки скилла,
поэтому собирать образец нужно в копии:

```bash
cp -r references/sample /tmp/sample && cd /tmp/sample
node <skill>/scripts/check.mjs        # ошибок и предупреждений нет, x-btn запечатан
node <skill>/scripts/build.mjs        # галерея: docs/design-system/gallery/index.html
```

`tests/selftest.mjs` прогоняет образец при каждом изменении скриптов: если правило
поменялось, а образец ему больше не соответствует, тест падает. Тогда образец
исправляют вместе с правилом.
