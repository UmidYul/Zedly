# Component Library — Frontend Specification

> **Проект:** Zedly — онлайн-тестирование и аналитика для школ Узбекистана
> **Модуль:** `06_frontend/component_library.md`
> **Версия:** 1.0 | **Дата:** 2026-02-27 | **Статус:** Production Blueprint

---

## Решения по UI-стеку

### Framework: **React 18** (финальный выбор)

**Обоснование выбора React над Vue:**
- Telegram Mini App SDK имеет более зрелую экосистему примеров на React
- react-query / TanStack Query — лучшая поддержка offline-first и синхронизации
- shadcn/ui (выбранная UI-библиотека) построена на React
- Больше доступных разработчиков в СНГ-рынке

**Версии:**
```
react: 18.3+
react-dom: 18.3+
typescript: 5.4+
vite: 5.x (сборщик — быстрее CRA, лучше tree-shaking)
```

### UI Library: **Tailwind CSS 3 + shadcn/ui** (финальный выбор)

**Обоснование выбора над Ant Design и Material UI:**

| Критерий | Ant Design | Material UI | Tailwind + shadcn/ui |
|---|---|---|---|
| Размер bundle (base) | ~500KB | ~300KB | ~15KB (только утилиты) |
| Кастомизация под UX Zedly | Сложно | Средне | Полная |
| RTL / узбекский язык | Частично | Частично | Полная (CSS) |
| Telegram Mini App совместимость | Конфликты | Конфликты | Без конфликтов |
| Tree-shaking (только нужные компоненты) | Частично | Частично | Полный |

shadcn/ui — это не библиотека-зависимость, а коллекция копируемых компонентов. Разработчик владеет кодом каждого компонента — можно изменить что угодно без fork.

### Telegram Mini App

```
@telegram-apps/sdk: 2.x
@telegram-apps/sdk-react: 2.x
```

Telegram Mini App работает в отдельном entry point (`/telegram/index.html`) с общей кодовой базой компонентов. Отличается: отсутствие навбара браузера, другая цветовая схема (берётся из `tg.themeParams`), haptic feedback на действия.

### Роутинг и state management

```
react-router-dom: 6.x  — роутинг
@tanstack/react-query: 5.x  — server state, кэш, синхронизация
zustand: 4.x  — client state (auth, offline queue, UI state)
react-i18next: 13.x  — локализация (uz / ru)
```

---

## Принципы дизайна

### Mobile-first

Все компоненты разрабатываются с точки зрения 375px (iPhone SE) как базового размера. Десктоп — расширение, не отдельный дизайн.

```
Breakpoints:
  sm:  640px   — планшет в портрете
  md:  768px   — планшет в ландшафте / маленький ноутбук
  lg:  1024px  — десктоп (учителя, директора, РОНО)
  xl:  1280px  — широкий монитор

Правило: любой компонент должен быть полностью функционален на 375px.
```

### i18n: узбекский и русский языки

```typescript
// i18n конфигурация
// Файлы: /locales/uz/translation.json, /locales/ru/translation.json

// Поддерживаемые форматы дат:
// uz: DD.MM.YYYY (27.02.2026)
// ru: DD.MM.YYYY (27.02.2026)

// Числа:
// uz: пробел как разделитель тысяч (1 234,5)
// ru: пробел как разделитель тысяч (1 234,5)

// Правило: нет ни одной хардкоженной строки в компонентах.
// Все тексты через t('key') из react-i18next.
```

Выбор языка:
1. Сохранённое в localStorage значение
2. Язык интерфейса Telegram (для Mini App)
3. Дефолт: `uz` (узбекский)

### Производительность на медленном интернете

```
Целевые метрики (2G сеть, 250kbps):
  First Contentful Paint: < 3 сек
  Time to Interactive: < 5 сек
  Offline fallback (Service Worker): < 1 сек

Методы:
  - Code splitting по роутам (lazy loading каждой страницы)
  - Изображения: WebP + srcset + lazy loading
  - Шрифты: system-ui (не загружать Google Fonts)
  - Иконки: Lucide React (SVG, tree-shakeable, ~2KB на иконку)
  - Анимации: только CSS transitions, не JS-анимации на медленных устройствах
    (проверка prefers-reduced-motion)
```

### Бюджет bundle

```
Первая загрузка (gzipped):
  HTML + CSS:          ~15KB
  React runtime:       ~45KB
  Router + Query:      ~25KB
  Компоненты страницы: ~50KB
  i18n (одна локаль):  ~20KB
  Прочее:              ~45KB
  ИТОГО:              ~200KB ✓ (целевой лимит)

Последующие загрузки:
  Service Worker кэш:  0KB (из кэша)
```

---

## Дизайн-токены

Все цвета, отступы и типографика через CSS переменные — единый источник истины.

```css
/* /src/styles/tokens.css */
:root {
  /* Цвета бренда */
  --color-primary:      #2563EB;   /* синий — основные действия */
  --color-primary-dark: #1D4ED8;
  --color-success:      #16A34A;   /* зелёный — правильный ответ */
  --color-error:        #DC2626;   /* красный — неверный ответ, ошибки */
  --color-warning:      #D97706;   /* жёлтый — слабая тема, предупреждения */
  --color-critical:     #991B1B;   /* тёмно-красный — критическая слабая тема */

  /* Нейтральные */
  --color-bg:           #FFFFFF;
  --color-bg-subtle:    #F8FAFC;
  --color-border:       #E2E8F0;
  --color-text:         #0F172A;
  --color-text-muted:   #64748B;

  /* Типографика */
  --font-family:        system-ui, -apple-system, 'Segoe UI', sans-serif;
  --font-size-xs:       0.75rem;   /* 12px */
  --font-size-sm:       0.875rem;  /* 14px */
  --font-size-base:     1rem;      /* 16px */
  --font-size-lg:       1.125rem;  /* 18px */
  --font-size-xl:       1.25rem;   /* 20px */
  --font-size-2xl:      1.5rem;    /* 24px */

  /* Отступы */
  --spacing-1:  0.25rem;   /* 4px */
  --spacing-2:  0.5rem;    /* 8px */
  --spacing-3:  0.75rem;   /* 12px */
  --spacing-4:  1rem;      /* 16px */
  --spacing-6:  1.5rem;    /* 24px */
  --spacing-8:  2rem;      /* 32px */

  /* Скругления */
  --radius-sm:  0.375rem;  /* 6px */
  --radius-md:  0.5rem;    /* 8px */
  --radius-lg:  0.75rem;   /* 12px */
  --radius-xl:  1rem;      /* 16px */
  --radius-full: 9999px;

  /* Тени */
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1);
}

/* Тёмная тема (для Telegram Mini App) */
@media (prefers-color-scheme: dark) {
  :root {
    --color-bg:         #0F172A;
    --color-bg-subtle:  #1E293B;
    --color-border:     #334155;
    --color-text:       #F1F5F9;
    --color-text-muted: #94A3B8;
  }
}
```

---

## Компоненты тестирования

### `QuestionCard`

Рендерит один вопрос в зависимости от его типа. Единый интерфейс для всех типов.

```typescript
// Props
interface QuestionCardProps {
  question: {
    id: string;
    type: 'mcq_single' | 'mcq_multiple' | 'open_text' | 'matching' | 'ordering';
    text: string;
    imageUrl?: string;
    options?: { id: string; text: string }[];
    points: number;
  };
  questionIndex: number;    // 1-based, для отображения "Вопрос 3 из 30"
  totalQuestions: number;
  mode: 'standard' | 'ntt' | 'review'; // review — показывает правильные ответы
  selectedAnswer?: AnswerValue;         // undefined = не отвечено
  correctAnswer?: AnswerValue;          // только в режиме review
  isLocked: boolean;                    // true — после сабмита или истечения таймера
  onAnswer: (answer: AnswerValue) => void;
}
```

**Поведение по типам:**

`mcq_single` — список радио-кнопок, визуально кастомные (не браузерные). При `isLocked`:
  - Выбранный правильный ответ: зелёный фон + иконка ✓
  - Выбранный неверный ответ: красный фон + иконка ✗ + подсветка правильного зелёным
  - Непроголосованные варианты: серые

`mcq_multiple` — чекбоксы. Аналогичная подсветка при `isLocked`. Кнопка «Подтвердить» появляется только когда выбран хотя бы один вариант.

`open_text` — textarea (min-height 80px, max-height 200px, автоматический resize). Счётчик символов справа. В режиме `review` показывает ответ учителя цветом `--color-success`.

`matching` — два столбца с drag-and-drop (react-dnd). На мобильном: tap to select левый, tap to connect правый. Соединения рисуются SVG-линиями.

`ordering` — вертикальный список с drag handle (≡). На мобильном: touch drag. Кнопки ↑↓ как fallback для accessibility.

```typescript
// Структура файлов компонента
// /src/components/testing/QuestionCard/
//   index.tsx           — основной экспорт
//   QuestionCard.tsx    — контейнер, выбор типа
//   MCQSingle.tsx
//   MCQMultiple.tsx
//   OpenText.tsx
//   Matching.tsx
//   Ordering.tsx
//   QuestionImage.tsx   — lazy-loaded изображение с skeleton
//   styles.ts           — tailwind class variants через cva()
```

**Изображение вопроса:**
```typescript
// Ленивая загрузка с skeleton placeholder
// Максимальная ширина: 100% контейнера, максимальная высота: 240px
// При ошибке загрузки: "[изображение недоступно]" placeholder
// Tap для fullscreen просмотра (особенно важно для мобильного)
```

---

### `TestTimer`

Countdown-таймер с визуальным предупреждением при истечении времени.

```typescript
interface TestTimerProps {
  expiresAt: string;        // ISO 8601 timestamp — серверное время окончания
  onExpire: () => void;     // вызывается при достижении 0 (автосабмит)
  mode?: 'compact' | 'full'; // compact — только цифры, full — с прогресс-баром
  totalSeconds: number;     // для расчёта процента оставшегося времени
}
```

**Поведение:**

```
Оставшееся время > 5 мин:  цвет --color-text-muted, обычный вес
Оставшееся время ≤ 5 мин:  цвет --color-warning, pulse-анимация каждые 60 сек
Оставшееся время ≤ 1 мин:  цвет --color-error, непрерывный pulse, haptic (Telegram)
Оставшееся время = 0:      вызов onExpire(), блокировка интерфейса
```

**Критично:** таймер считает от `expiresAt` (серверное время), не от локального `Date.now()` плюс переданные секунды. Это предотвращает манипуляции с системным временем устройства.

```typescript
// Логика расчёта
const remainingMs = new Date(expiresAt).getTime() - Date.now();
// Синхронизация с сервером: при монтировании делается GET /api/v1/time
// и рассчитывается serverTimeOffset = serverTime - clientTime
// В дальнейшем: Date.now() + serverTimeOffset для корректного расчёта
```

**Форматирование:**
```
>= 60 мин: "1:23:45"
< 60 мин:  "23:45"
< 10 сек:  "0:09" (красный, пульсирует)
```

**Offline:** таймер продолжает работать без интернета. При восстановлении соединения делает один запрос для синхронизации с сервером.

---

### `ProgressBar`

Показывает прогресс прохождения теста и навигацию по вопросам.

```typescript
interface ProgressBarProps {
  current: number;          // текущий вопрос (1-based)
  total: number;
  answers: {
    questionIndex: number;
    status: 'answered' | 'skipped' | 'unanswered';
  }[];
  mode: 'standard' | 'ntt';
  onNavigate?: (index: number) => void; // undefined в NTT-режиме (навигация запрещена)
}
```

**Отображение:**

`standard` — горизонтальная линия прогресса + ряд точек-кружков (кликабельных):
  - Отвечен: заполненный синий кружок
  - Пропущен: кружок с тире внутри
  - Текущий: анимированный пульсирующий синий кружок
  - Не отвечен: пустой серый кружок

При > 20 вопросов кружки сжимаются (4px каждый), при > 40 — показывается только линия прогресса и счётчик "12 / 30".

`ntt` — только линия прогресса + счётчик "12 / 60". Кружки не кликабельны. Уже отвеченные вопросы закрашены, возврат визуально заблокирован (серая иконка 🔒 над пройденными).

---

### `ResultCard`

Шейрабельная карточка результата — «Spotify Wrapped» для теста. Ключевая вирусная механика Zedly.

```typescript
interface ResultCardProps {
  result: {
    studentName: string;
    testTitle: string;
    scorePercent: number;
    correctCount: number;
    totalCount: number;
    timeTakenSeconds: number;
    rank?: { position: number; total: number };  // позиция в классе
    topicPerformance: { topic: string; correctRate: number }[];
    isNTT: boolean;
  };
  mode: 'full' | 'share';  // share — компактная версия для изображения
  onShare: () => void;
  onViewDetails: () => void;
}
```

**Визуальная структура (full):**

```
┌─────────────────────────────────┐
│  🎓 [имя ученика]               │
│  [название теста]               │
│                                 │
│         87%                     │  ← большой процент, цвет по градиенту
│    ████████████░░  26/30        │
│                                 │
│  ⏱ 34 мин   🏆 Топ 12%         │  ← время + позиция в классе
│                                 │
│  Сильные темы:                  │
│  ✓ Алгебра  ✓ Геометрия        │
│  Слабые темы:                   │
│  ✗ Тригонометрия (47%)         │
│                                 │
│  [Поделиться] [Разбор ошибок]  │
└─────────────────────────────────┘
```

**Цвет градиента по баллу:**
```
0–39%:   красный градиент (#DC2626 → #F87171)
40–59%:  оранжевый (#D97706 → #FCD34D)
60–79%:  синий (#2563EB → #60A5FA)
80–100%: зелёный (#16A34A → #4ADE80)
```

**Функция "Поделиться":**
```typescript
async function shareResult() {
  // 1. Генерация изображения через html2canvas (только share-версия карточки)
  const canvas = await html2canvas(shareCardRef.current, {
    scale: 2,  // retina
    backgroundColor: null,
  });
  const blob = await canvasToBlob(canvas, 'image/png');

  // 2. Web Share API (поддерживается на мобильных)
  if (navigator.share) {
    await navigator.share({
      title: `Мой результат: ${scorePercent}% — ${testTitle}`,
      text: `Я прошёл тест на Zedly и набрал ${scorePercent}%!`,
      files: [new File([blob], 'result.png', { type: 'image/png' })],
      url: `https://zedly.uz/results/${sessionId}`,
    });
  } else {
    // Fallback: скачать изображение
    downloadBlob(blob, 'my-result.png');
  }

  // 3. Telegram Mini App: tg.shareMessage()
  if (isTelegramMiniApp) {
    tg.shareMessage(resultUrl);
  }
}
```

**НТТ-версия ResultCard:** добавляет блок с предсказанием реального НТТ-балла, разбивку по предметным блокам (математика, узбекский язык, история, etc.), сравнение с прошлыми попытками.

---

## Компоненты аналитики

### `ScoreHeatmap`

Матрица успеваемости: строки = классы, столбцы = предметы, ячейки = avg_score.

```typescript
interface ScoreHeatmapProps {
  data: {
    rowLabel: string;    // "9А", "9Б", "10А"
    colLabel: string;    // "Математика", "Физика"
    value: number;       // 0–100
    sampleSize: number;  // количество тестов в основе
  }[];
  onCellClick?: (row: string, col: string) => void;
  colorScale: 'performance' | 'relative';
  // performance: абсолютный (< 40 = красный, > 80 = зелёный)
  // relative: относительный (лучшая ячейка = зелёный, худшая = красный)
}
```

**Цветовая шкала performance:**
```
< 40%:  #DC2626 (красный)
40–59%: #F97316 (оранжевый)
60–74%: #EAB308 (жёлтый)
75–89%: #22C55E (зелёный)
≥ 90%:  #15803D (тёмно-зелёный)
```

Ячейки меньше 5 тестов: штриховая граница + tooltip "Недостаточно данных (N тестов)".

На мобильном (< 640px): горизонтальный скролл с фиксированной первой колонкой (названия классов).

---

### `TrendChart`

Sparkline прогресса ученика или класса по времени. Лёгкий (не полноценный чарт).

```typescript
interface TrendChartProps {
  data: { date: string; value: number; label?: string }[];
  width?: number;        // default: 100% контейнера
  height?: number;       // default: 48px (sparkline) или 200px (full)
  mode: 'sparkline' | 'full';
  showDots?: boolean;
  showGrid?: boolean;    // только в full mode
  showLabels?: boolean;  // даты по оси X, только в full mode
  color?: string;        // default: --color-primary
  trendColor?: 'auto' | string;
  // auto: зелёный если последнее значение > первого, красный если меньше
}
```

**Реализация:** SVG (не canvas, не recharts) для минимального bundle. Кривая через кубические bezier-сплайны. Tooltip при hover/tap с датой и значением.

```typescript
// Вычисление точек кривой
function buildSvgPath(points: Point[], width: number, height: number): string {
  const normalized = normalizeToViewport(points, width, height, padding = 8);
  return buildCubicBezierPath(normalized);
}
```

**Размер компонента:** ~4KB минифицированного JS (без recharts, который весит 300KB+).

---

### `WeakTopicBadge`

Визуальный индикатор проблемных тем. Используется в карточках классов и дашборде учителя.

```typescript
interface WeakTopicBadgeProps {
  topics: {
    topic: string;
    errorRate: number;   // 0–1
    severity: 'weak' | 'critical';
    affectedStudents?: number;
  }[];
  maxVisible?: number;   // default: 3, остальные "+N тем"
  onTopicClick?: (topic: string) => void;
  size: 'sm' | 'md';
}
```

**Визуальное отображение:**

`severity: 'weak'` — жёлтый бейдж: `⚠ Тригонометрия · 48%`

`severity: 'critical'` — красный бейдж с пульсацией: `🔴 Производная · 67%`

При клике: Modal/Drawer с детальным разбором темы — какие вопросы вызывали ошибки, рекомендуемые тесты из marketplace.

При `maxVisible = 3` и 5 тем: показывает 3 самые критичные + `+2 темы` (кликабельная сводка).

---

### `LeaderboardTable`

Таблица рейтинга для челленджей и рейтинга класса/школы.

```typescript
interface LeaderboardTableProps {
  entries: {
    rank: number;
    entityId: string;
    name: string;          // имя ученика или название школы
    avatarUrl?: string;
    score: number;         // 0–100
    delta?: number;        // изменение позиции (+2, -1, 0)
    isCurrentUser?: boolean;
    metadata?: string;     // "9А · Математика"
  }[];
  mode: 'students' | 'schools';
  highlightCurrentUser: boolean;
  showMedals: boolean;     // 🥇🥈🥉 для топ-3
  virtualized: boolean;    // react-window для списков > 50 записей
}
```

**Строка рейтинга:**
```
┌──────────────────────────────────────────────┐
│  🥇  [avatar] Алишер К.    9А    87%   ↑2   │
└──────────────────────────────────────────────┘
```

Текущий пользователь: синий фон, sticky-позиционирование (всегда видна своя строка при скролле).

Анимация изменения позиций: при обновлении данных строки анимированно перемещаются (только если `prefers-reduced-motion: no-preference`).

---

## Навигационные компоненты

### `RoleSwitcher`

Один пользователь может быть учителем в одной школе и родителем своего ребёнка.

```typescript
interface RoleSwitcherProps {
  availableRoles: {
    role: 'student' | 'teacher' | 'director' | 'parent' | 'roono' | 'ministry';
    label: string;           // "Учитель — Школа №5"
    schoolName?: string;
    unreadNotifications: number;
  }[];
  currentRole: string;
  onSwitch: (role: string) => void;
}
```

**Поведение:** при переключении роли — перезагрузка контекста приложения (новый layout, новые данные). Переключение не требует повторного логина — роль закодирована в существующем JWT. Если доступна только одна роль — компонент не показывается.

Визуально: dropdown в header с иконкой текущей роли. На мобильном: bottom sheet.

---

### `SchoolSelector`

Для ролей, видящих несколько школ (РОНО-инспектор, Министерство).

```typescript
interface SchoolSelectorProps {
  schools: { id: string; name: string; district: string; avgScore?: number }[];
  selected: string | null;    // null = все школы (агрегированный вид)
  onSelect: (schoolId: string | null) => void;
  mode: 'dropdown' | 'sidebar';
  searchable: boolean;        // true для РОНО с > 10 школами
}
```

**Поведение:** выбор "Все школы" показывает агрегированный district-вид. Выбор конкретной школы — drill-down до уровня школы. Последний выбор сохраняется в localStorage.

Поиск: debounced input (300ms), фильтрация по названию. При > 30 школах — виртуализация списка.

---

### `NotificationCenter`

Центр уведомлений: слабые темы, результаты тестов, готовность отчётов.

```typescript
interface NotificationCenterProps {
  notifications: {
    id: string;
    type: 'weak_topic' | 'test_completed' | 'report_ready' | 'challenge_result' | 'pending_review';
    title: string;
    body: string;
    createdAt: string;
    isRead: boolean;
    actionUrl?: string;
    meta?: Record<string, unknown>;
  }[];
  unreadCount: number;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
}
```

**Визуальное отображение:** bell-иконка в header с badge (красный кружок с числом непрочитанных). При клике — Popover (десктоп) или Bottom Sheet (мобильный) со списком уведомлений.

**Типы уведомлений и иконки:**
```
weak_topic:       ⚠️  "Слабая тема в 9А: Тригонометрия"
test_completed:   ✅  "Алишер К. сдал тест — 87%"
report_ready:     📄  "Квартальный отчёт готов"
challenge_result: 🏆  "Школа №5 приняла ваш вызов!"
pending_review:   ✏️   "3 ответа ждут проверки"
```

**Real-time:** уведомления приходят через WebSocket (тот же механизм что в TestTimer). При получении нового — toast-уведомление снизу экрана + обновление badge.

**Push уведомления (PWA):** при согласии пользователя — Push API для фоновых уведомлений (даже без открытого браузера).

---

## Offline-режим (PWA)

### Service Worker

```typescript
// /src/sw.ts — Workbox-based Service Worker

// Стратегия кэширования по типу ресурса:
registerRoute(
  ({ request }) => request.destination === 'script' || request.destination === 'style',
  new CacheFirst({ cacheName: 'static-assets', plugins: [
    new ExpirationPlugin({ maxAgeSeconds: 30 * 24 * 60 * 60 }) // 30 дней
  ]})
);

// Тесты: NetworkFirst (свежие данные) с fallback на кэш
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/v1/tests/') && url.pathname.endsWith('/offline-bundle'),
  new NetworkFirst({ cacheName: 'test-bundles', plugins: [
    new ExpirationPlugin({ maxAgeSeconds: 4 * 60 * 60 }) // 4 часа
  ]})
);

// Страницы: NetworkFirst с fallback на /offline.html
registerRoute(
  ({ request }) => request.mode === 'navigate',
  new NetworkFirst({ cacheName: 'pages', networkTimeoutSeconds: 3 })
);
```

### Sync Queue (offline ответы)

```typescript
// zustand store для offline queue
interface SyncQueueStore {
  pendingAnswers: PendingAnswer[];
  syncStatus: 'idle' | 'syncing' | 'error';
  lastSyncAt: string | null;

  addAnswer: (answer: PendingAnswer) => void;
  syncAll: () => Promise<void>;
  retryFailed: () => Promise<void>;
}

interface PendingAnswer {
  id: string;              // локальный UUID
  sessionId: string;
  questionId: string;
  answer: AnswerValue;
  answeredAt: string;      // ISO 8601 — метка с устройства
  retryCount: number;
  lastError?: string;
}

// Автоматическая синхронизация при восстановлении соединения
window.addEventListener('online', () => useSyncQueue.getState().syncAll());

// Background Sync API (если поддерживается браузером)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-answers') {
    event.waitUntil(syncPendingAnswers());
  }
});
```

**IndexedDB** используется как постоянное хранилище для offline-ответов (переживает перезагрузку вкладки). Zustand store синхронизируется с IndexedDB через idb-keyval.

### `OfflineIndicator`

```typescript
// Компонент-баннер, показывается при отсутствии соединения
// Позиция: fixed bottom, z-index: 9999

// Состояния:
// online:   ничего не показывается
// offline:  "📶 Нет подключения — ответы сохраняются"
// syncing:  "🔄 Синхронизация... (3 ответа)"
// sync_error: "⚠️ Ошибка синхронизации — [Повторить]"
// sync_done:  toast "✓ 5 ответов синхронизировано" (исчезает через 3 сек)
```

**Логика определения состояния:**
```typescript
// navigator.onLine ненадёжен — только сигнал
// Реальная проверка: fetch HEAD /api/v1/ping каждые 15 сек
// timeout 3 сек — если нет ответа, считаем offline
```

---

## Telegram Mini App: специфика

### Entry point

```typescript
// /src/telegram/main.tsx — отдельный entry point
import { TonConnectUIProvider } from '@tonconnect/ui-react';
import { TelegramProvider } from './TelegramProvider';

// TelegramProvider:
// - Инициализирует @telegram-apps/sdk
// - Применяет tg.themeParams как CSS переменные
// - Убирает навбар браузера (tg.expand())
// - Устанавливает MainButton и BackButton
```

### Адаптации компонентов для Telegram

```typescript
// useHapticFeedback — обёртка над tg.HapticFeedback
// Используется в:
//   - QuestionCard: при выборе ответа → impactOccurred('light')
//   - TestTimer < 1 мин: → notificationOccurred('warning')
//   - ResultCard: при получении хорошего результата → notificationOccurred('success')

// MainButton (синяя кнопка внизу Telegram)
// Заменяет кнопку "Следующий вопрос" и "Завершить тест"
// Текст меняется динамически:
//   "СЛЕДУЮЩИЙ ВОПРОС" → "ЗАВЕРШИТЬ ТЕСТ" (на последнем вопросе)
//   "ОТПРАВИТЬ РЕЗУЛЬТАТ" (после завершения)

// BackButton Telegram
// Заменяет встроенную кнопку назад в браузере
// В NTT-режиме: BackButton отключён (нельзя вернуться)
```

### Цветовая схема Telegram

```typescript
// TelegramProvider применяет переменные из tg.themeParams:
document.documentElement.style.setProperty('--color-bg', tg.themeParams.bg_color);
document.documentElement.style.setProperty('--color-text', tg.themeParams.text_color);
document.documentElement.style.setProperty('--color-primary', tg.themeParams.button_color);
// Это обеспечивает нативный вид в любой теме Telegram (светлой/тёмной/кастомной)
```

---

## Accessibility

Все компоненты соответствуют WCAG 2.1 Level AA:

```
Цветовой контраст:
  - Основной текст: минимум 4.5:1 на фоне
  - Крупный текст (>18px): минимум 3:1

Клавиатурная навигация:
  - QuestionCard MCQ: Tab между вариантами, Space/Enter для выбора
  - TestTimer: aria-live="polite" для объявления времени каждую минуту
  - ProgressBar: aria-label="Вопрос 5 из 30, 4 отвечено, 1 пропущено"

Screen reader:
  - Иконки без текста: aria-label обязателен
  - Динамические изменения: aria-live на счётчике таймера, на badge уведомлений
  - Изображения вопросов: alt из базы данных (учитель заполняет при создании)

Моторика:
  - Минимальный размер touch target: 44×44px (все кнопки, радио, чекбоксы)
  - Drag-and-drop (Matching, Ordering): альтернативные кнопки ↑↓ / tap-to-select
```

---

## Структура файлов компонентной библиотеки

```
/src/
├── components/
│   ├── testing/
│   │   ├── QuestionCard/
│   │   │   ├── index.tsx
│   │   │   ├── MCQSingle.tsx
│   │   │   ├── MCQMultiple.tsx
│   │   │   ├── OpenText.tsx
│   │   │   ├── Matching.tsx
│   │   │   ├── Ordering.tsx
│   │   │   └── QuestionImage.tsx
│   │   ├── TestTimer.tsx
│   │   ├── ProgressBar.tsx
│   │   └── ResultCard/
│   │       ├── index.tsx
│   │       ├── ResultCard.tsx
│   │       └── ShareCard.tsx       ← версия для генерации изображения
│   ├── analytics/
│   │   ├── ScoreHeatmap.tsx
│   │   ├── TrendChart.tsx
│   │   ├── WeakTopicBadge.tsx
│   │   └── LeaderboardTable.tsx
│   ├── navigation/
│   │   ├── RoleSwitcher.tsx
│   │   ├── SchoolSelector.tsx
│   │   └── NotificationCenter/
│   │       ├── index.tsx
│   │       └── NotificationItem.tsx
│   ├── offline/
│   │   ├── OfflineIndicator.tsx
│   │   └── SyncStatus.tsx
│   └── ui/                          ← shadcn/ui базовые компоненты
│       ├── Button.tsx
│       ├── Card.tsx
│       ├── Badge.tsx
│       ├── Dialog.tsx
│       ├── Drawer.tsx               ← bottom sheet для мобильного
│       ├── Skeleton.tsx
│       ├── Toast.tsx
│       └── Tooltip.tsx
├── styles/
│   ├── tokens.css
│   ├── globals.css
│   └── telegram.css                 ← переопределения для Mini App
├── hooks/
│   ├── useOfflineSync.ts
│   ├── useServerTime.ts
│   ├── useHapticFeedback.ts
│   └── useBreakpoint.ts
├── stores/
│   ├── syncQueue.store.ts
│   ├── auth.store.ts
│   └── ui.store.ts
└── telegram/
    ├── main.tsx
    └── TelegramProvider.tsx
```

---

## Acceptance Criteria

### AC-1: QuestionCard — все типы вопросов работают на мобильном

```
Given: ученик открывает тест на устройстве 375px шириной
When: рендерится QuestionCard каждого типа (mcq_single, mcq_multiple, open_text, matching, ordering)
Then:
  - Весь контент виден без горизонтального скролла
  - Touch target каждого варианта ответа: минимум 44px высотой
  - Изображение вопроса (если есть): не выходит за пределы экрана
  - Matching и Ordering: drag доступен через touch events
```

### AC-2: TestTimer — автосабмит при истечении

```
Given: ученик проходит тест, до окончания остаётся 3 секунды
When: таймер достигает 0
Then:
  - onExpire() вызывается ровно один раз
  - Интерфейс блокируется (isLocked = true на всех QuestionCard)
  - В Telegram Mini App: haptic notificationOccurred('warning') за 60 сек до конца
  - Пользователь видит сообщение "Время вышло. Ваши ответы сохранены."
  - Манипуляция с системным временем устройства не влияет на таймер (расчёт от expiresAt)
```

### AC-3: ResultCard — функция поделиться работает

```
Given: ученик завершил тест и видит ResultCard
When: нажимает кнопку "Поделиться"
Then:
  - На мобильном с Web Share API: открывается нативный шер с изображением карточки
  - На десктопе без Web Share API: автоматически скачивается PNG-файл
  - В Telegram Mini App: открывается tg.shareMessage с URL результата
  - Генерация изображения занимает < 2 секунд
  - Изображение содержит: имя, балл, название теста, логотип Zedly
```

### AC-4: Offline — тест проходится без интернета

```
Given: ученик скачал offline-bundle при наличии интернета
When: устройство переходит в offline (авиарежим)
Then:
  - OfflineIndicator показывает "📶 Нет подключения — ответы сохраняются"
  - QuestionCard рендерится из кэша без обращений к сети
  - Ответы сохраняются в IndexedDB при каждом submit
  - TestTimer продолжает работать от локальных часов
  - При восстановлении соединения: SyncQueue автоматически отправляет все ответы
  - После синхронизации: toast "✓ X ответов синхронизировано"
```

### AC-5: i18n — все строки переведены

```
Given: пользователь выбрал язык "uz" (узбекский)
When: любой компонент рендерится
Then:
  - Ни одна строка не отображается на русском языке (нет fallback текстов в коде)
  - Числовой формат корректен для узбекского: 1 234,5
  - Даты отображаются в формате DD.MM.YYYY
  - Направление текста: LTR (узбекский латиницей/кириллицей — не RTL)
```

### AC-6: Bundle size не превышает 200KB gzipped

```
Given: production build Vite с минификацией
When: измеряется размер initial bundle (первая загрузка, без lazy chunks)
Then:
  - gzipped HTML + CSS + JS main chunk ≤ 200KB
  - Lazy chunks (страницы за роутером): каждый ≤ 50KB gzipped
  - Проверяется в CI через bundlesize (или vite-plugin-bundle-analyzer)
  - При превышении: CI падает, деплой блокируется
```

### AC-7: ScoreHeatmap — мобильная адаптация

```
Given: директор открывает дашборд на телефоне (375px), heatmap 5 классов × 8 предметов
When: рендерится ScoreHeatmap
Then:
  - Горизонтальный скролл для столбцов предметов
  - Первая колонка (названия классов) фиксирована (sticky)
  - Ячейки минимум 44px шириной для читабельности
  - Tooltip при tap на ячейку: "9А · Математика · 72.3% · 15 тестов"
```

### AC-8: WeakTopicBadge — критические темы выделены визуально

```
Given: класс имеет 2 weak темы и 1 critical тему
When: рендерится WeakTopicBadge с maxVisible=3
Then:
  - Critical тема: красный фон с пульсирующей анимацией
  - Weak темы: жёлтый фон без анимации
  - Critical тема показывается первой (сортировка по severity, затем по error_rate)
  - При клике: Modal/Drawer с деталями темы и рекомендацией тестов из marketplace
```

### AC-9: Telegram Mini App — нативный вид

```
Given: пользователь открывает Zedly в Telegram Mini App (тёмная тема)
When: рендерится любой экран
Then:
  - Цветовая схема соответствует теме Telegram (tg.themeParams применены)
  - MainButton Telegram используется вместо кнопки "Следующий вопрос"
  - BackButton Telegram работает как навигация назад
  - Нет конфликтов с системными жестами Telegram
  - haptic feedback работает при выборе ответа (impactOccurred)
```

### AC-10: NotificationCenter — real-time обновления

```
Given: учитель открыл дашборд, NotificationCenter показывает 2 непрочитанных
When: ученик завершает тест (в реальном времени)
Then:
  - Badge на bell-иконке обновляется до 3 в течение 3 секунд (WebSocket push)
  - Toast "Алишер К. — 87%" появляется внизу экрана на 4 секунды
  - При открытии NotificationCenter: новое уведомление присутствует в списке
  - При клике на уведомление: переход к результатам, уведомление помечается прочитанным
```

---

## Зависимости на другие модули

| Модуль | Тип | Детали |
|---|---|---|
| `05_backend/analytics_engine_spec.md` | Входящая | Структура `value_json` для `WeakTopicBadge` |
| `05_backend/test_engine_spec.md` | Входящая | WebSocket протокол прогресса, структура offline-bundle |
| `06_frontend/screens_map.md` | Разделяемая | Карта экранов где используется каждый компонент |
| `10_analytics/metrics_definition.md` | Входящая | Канонические определения метрик для дашбордов |
| `03_features/telegram_integration.md` | Разделяемая | Функции Telegram SDK, типы уведомлений |

---

## Потенциальные несоответствия — проверить при следующем батче

1. Структура `value_json.topics` в `WeakTopicBadge` (поля `topic`, `errorRate`, `severity`) должна совпадать с `analytics_engine_spec.md` — там `error_rate` (snake_case). Унифицировать в одном стиле.
2. WebSocket протокол для `NotificationCenter` использует тот же сокет что и `TestTimer` и прогресс класса — уточнить в `05_backend/test_engine_spec.md`: один WebSocket на всё или отдельные.
3. `ShareCard` генерирует изображение через `html2canvas` — добавить в `12_non_functional/sla_requirements.md` требование к производительности (< 2 сек на midrange Android).
4. Offline-bundle структура (все вопросы + base64 изображения) — размер < 500KB указан в `test_engine_spec.md`. Убедиться что `QuestionImage` корректно работает с base64 из bundle (не делает отдельный HTTP-запрос).
5. `RoleSwitcher` предполагает наличие нескольких ролей у одного пользователя — модель `users` в `08_data_model/entities.md` имеет только одно поле `role`. Если нужны мульти-роли — добавить таблицу `user_roles` или пересмотреть архитектуру.
