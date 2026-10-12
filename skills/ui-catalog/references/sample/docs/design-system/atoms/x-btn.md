---
id: x-btn
name: Button
type: button
job: Запустить действие на экране — главное или второе рядом с ним.
intents: [действие, кнопка, оформить, сохранить, изменить, сбросить]
units: [x-btn]
related: []
counterpart: 
sourceHash: 76bcd2fdb133
---

## Когда использовать

- Главное действие карточки заказа: «Оформить заказ».
- Сохранить форму настроек — крупная кнопка внизу формы.
- Второе действие рядом с главным: «Изменить», «Сбросить».

## Когда не использовать

- Переход на другую страницу — ссылка `<a>`, а не кнопка.
- Выбор значения из списка — в базе нет: нужен селект, это пробел.
- Действие одной иконкой без подписи — в базе нет.

## Варианты

<!-- Из кода: ui-catalog generate --facts. Руками правится только колонка «Когда выбирать». -->

| Класс | Название | Что меняет | Когда выбирать |
|---|---|---|---|
| `x-btn--lg` | Large | высота `48px`, отступы `0 24px` | внизу формы, где кнопка завершает заполнение |
| `x-btn--primary` | Primary | фон `--x-accent`, цвет текста `--x-white`; при наведении: фон `--x-accent-hover`; при нажатии: фон `--x-accent-active` | одно главное действие в блоке |
| `x-btn--secondary` | Secondary | фон `--x-surface`, цвет текста `--x-ink`; при наведении: фон `--x-surface-hover`; при нажатии: фон `--x-line` | второе действие рядом с главным |

Вместе в разметке: `x-btn x-btn--lg x-btn--primary` · `x-btn x-btn--lg x-btn--secondary`.

Друг друга исключают: Primary, Secondary — на элементе один вид.

## Состояния

<!-- Из кода: ui-catalog generate --facts. Руками не править. -->

| Состояние | В коде | Как |
|---|---|---|
| наведение | есть | `.x-btn--primary:hover`, `.x-btn--secondary:hover` |
| нажато | есть | `.x-btn--primary:active`, `.x-btn--secondary:active` |
| фокус с клавиатуры | есть | общая обводка `:focus-visible` из base/base.css |
| выключено | есть | `.x-btn:disabled` |

## Как собрать

```html
<button type="button" class="x-btn x-btn--primary">Оформить заказ</button>
```

- Всегда `<button>`: `type="submit"` в форме, `type="button"` в остальных местах.
- Вид обязателен: без Primary или Secondary у кнопки нет фона.
- Недоступное действие — атрибут `disabled`, не отдельный вид.
- Кнопки рядом расставляет контейнер страницы, у самой кнопки внешних отступов нет.

## Показательные места

<!-- Из кода: ui-catalog generate --facts. Руками не править. -->

- [pages/orders.html:8](../../../pages/orders.html#L8) — `x-btn x-btn--primary` · `order-card__actions` · страницы
- [pages/orders.html:9](../../../pages/orders.html#L9) — `x-btn x-btn--secondary` · `order-card__actions` · страницы
- [pages/settings.html:8](../../../pages/settings.html#L8) — `x-btn x-btn--lg x-btn--primary` · `settings__footer` · страницы
- [pages/settings.html:9](../../../pages/settings.html#L9) — `x-btn x-btn--lg x-btn--secondary` · `settings__footer` · страницы

## С чем сочетается

<!-- Из кода: ui-catalog generate --facts. Руками не править. -->

- Рядом, в одном контейнере: такие же — 4 места.
- Контейнер: `order-card__actions` — 2 места, `settings__footer` — 2 места.

## Подводные камни

- Выключенная кнопка только бледнеет: подсказки, почему действие недоступно, нет — её пишет страница.
- В формах кнопки крупные (Large), в карточках обычные: не смешивать размеры в одном ряду.
