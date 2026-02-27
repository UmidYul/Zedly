# docs/07_api/marketplace_api.md

---
title: Zedly — Marketplace API Specification
version: 1.0
date: 2026-02-27
status: Production Blueprint
scope: Поиск тестов в маркетплейсе, публикация, рейтинг, копирование
---

# Marketplace API — Спецификация

> Базовый URL: `https://api.zedly.uz/api/v1`
> Все запросы требуют `Authorization: Bearer {access_token}`, кроме публичного поиска (см. ниже).
> Marketplace — сетевой эффект платформы: тесты учителей становятся доступны всему сообществу. Публикация добровольна. Автор теста сохраняет авторство и может отозвать тест в любое время.

---

## Содержание

1. [GET /marketplace/tests](#1-get-marketplacetests) — Поиск тестов в маркетплейсе
2. [GET /marketplace/tests/{test_id}](#2-get-marketplaceteststest_id) — Детальная карточка теста
3. [POST /marketplace/tests/{test_id}/publish](#3-post-marketplaceteststest_idpublish) — Публикация теста в маркетплейс
4. [POST /marketplace/tests/{test_id}/rate](#4-post-marketplaceteststest_idrate) — Оценка теста (рейтинг)
5. [POST /marketplace/tests/{test_id}/copy](#5-post-marketplaceteststest_idcopy) — Копирование теста в свою библиотеку
6. [Общие коды ошибок](#6-общие-коды-ошибок)

---

## 1. GET /marketplace/tests

**Описание:** Поиск тестов в публичном маркетплейсе. Доступен без авторизации (публичный каталог), но с авторизацией возвращает дополнительные поля (`already_copied`, `rated_by_me`).

**Роль доступа:** Публичный / 🔒 `teacher` (для персонализированных полей)

**Rate limit:** 100 запросов / IP / час (без авторизации); 300 запросов / user / час (с авторизацией)

---

### Request

```http
GET /api/v1/marketplace/tests?subject=mathematics&grade=9&q=квадратные+уравнения&sort=rating&page=1&per_page=20
Authorization: Bearer {token}  (опционально)
```

**Query параметры:**

| Параметр | Тип | Обязательно | Описание |
|---|---|---|---|
| `q` | string | ❌ | Поиск по названию и тегам тем (min 2 символа) |
| `subject` | string | ❌ | Фильтр по предмету |
| `grade` | integer | ❌ | Фильтр по параллели (1–11) |
| `language` | string | ❌ | `uz` / `ru` |
| `question_count_min` | integer | ❌ | Мин. количество вопросов |
| `question_count_max` | integer | ❌ | Макс. количество вопросов |
| `rating_min` | number | ❌ | Минимальный рейтинг (1.0–5.0) |
| `author_verified` | boolean | ❌ | `true` — только верифицированные авторы |
| `sort` | string | ❌ | `rating` / `popular` / `newest` / `copies`. По умолчанию `popular` |
| `page` | integer | ❌ | По умолчанию 1 |
| `per_page` | integer | ❌ | 10–50, по умолчанию 20 |

**Значения `sort`:**
- `rating` — по среднему рейтингу (desc), потом по числу оценок
- `popular` — по числу копирований за последние 30 дней
- `newest` — по дате публикации (desc)
- `copies` — по общему числу копирований всех времён

---

### Response — 200 OK

```json
{
  "ok": true,
  "data": {
    "tests": [
      {
        "test_id": "tst_mkt_001",
        "title": "Алгебра 9 класс: Квадратные уравнения — 25 вопросов",
        "subject": "mathematics",
        "subject_name": "Математика",
        "grade": 9,
        "language": "uz",
        "question_count": 25,
        "time_limit_minutes": 45,
        "type": "control",
        "topics": ["quadratic_equations", "discriminant", "vieta_formulas"],
        "rating": {
          "avg": 4.7,
          "count": 83
        },
        "copies_count": 214,
        "copies_last_30d": 31,
        "author": {
          "user_id": "usr_abc123",
          "display_name": "Акбаров Ш.",
          "school_name": "Школа №42, Ташкент",
          "verified": true,
          "published_tests_count": 12
        },
        "published_at": "2025-11-15T10:00:00Z",
        "preview_questions_count": 3,
        "already_copied": false,
        "rated_by_me": null,
        "thumbnail_url": "https://cdn.zedly.uz/marketplace/tst_mkt_001_thumb.png"
      },
      {
        "test_id": "tst_mkt_002",
        "title": "Математика 9: Системы уравнений + контрольная",
        "subject": "mathematics",
        "subject_name": "Математика",
        "grade": 9,
        "language": "uz",
        "question_count": 20,
        "time_limit_minutes": 40,
        "type": "control",
        "topics": ["linear_systems", "substitution_method", "addition_method"],
        "rating": {
          "avg": 4.4,
          "count": 47
        },
        "copies_count": 128,
        "copies_last_30d": 18,
        "author": {
          "user_id": "usr_def456",
          "display_name": "Юсупова М.",
          "school_name": "Школа №7, Самарканд",
          "verified": false,
          "published_tests_count": 3
        },
        "published_at": "2025-12-02T14:00:00Z",
        "preview_questions_count": 3,
        "already_copied": true,
        "rated_by_me": 4,
        "thumbnail_url": null
      }
    ],
    "pagination": {
      "page": 1,
      "per_page": 20,
      "total": 147,
      "total_pages": 8
    },
    "filters_applied": {
      "subject": "mathematics",
      "grade": 9,
      "q": "квадратные уравнения"
    },
    "top_topics": [
      { "tag": "quadratic_equations", "name": "Квадратные уравнения", "tests_count": 34 },
      { "tag": "functions", "name": "Функции", "tests_count": 28 }
    ]
  }
}
```

> Если запрос без авторизации: поля `already_copied` и `rated_by_me` отсутствуют в ответе.

---

### Бизнес-ограничения

- Поиск по `q`: полнотекстовый поиск (PostgreSQL `tsvector` + `tsquery`) по `title` и `topics`. При < 2 символов в `q` — игнорируется.
- В маркетплейсе отображаются только тесты со статусом `marketplace: published` и `status: published`. Удалённые, архивные или отозванные тесты не показываются.
- `author.display_name`: учитель настраивает отображаемое имя при публикации (по умолчанию — первая буква имени + фамилия). Полное имя в маркетплейсе скрыто — только псевдоним.
- `author.verified`: учитель получает статус верифицированного после публикации ≥ 3 тестов с рейтингом ≥ 4.0 и ≥ 20 оценками.
- Сортировка `popular` использует `copies_last_30d * 2 + rating.avg * rating.count` (взвешенный скор) — свежие и качественные тесты в топе.
- Результаты поиска кэшируются в Redis с TTL 5 минут. Cache-key: `mkt:search:{hash(params)}`.

---

## 2. GET /marketplace/tests/{test_id}

**Описание:** Полная карточка теста в маркетплейсе: метаданные, предпросмотр вопросов (без правильных ответов), статистика, отзывы.

**Роль доступа:** Публичный / 🔒 `teacher` (для персонализированных полей)

**Rate limit:** 200 запросов / IP / час; 500 запросов / user / час

---

### Request

```http
GET /api/v1/marketplace/tests/tst_mkt_001
Authorization: Bearer {token}  (опционально)
```

---

### Response — 200 OK

```json
{
  "ok": true,
  "data": {
    "test_id": "tst_mkt_001",
    "title": "Алгебра 9 класс: Квадратные уравнения — 25 вопросов",
    "description": "Полноценная контрольная работа по теме «Квадратные уравнения». Охватывает: дискриминант, формулы Виета, уравнения вида ax²+bx+c=0. Уровень сложности — смешанный (5 лёгких, 15 средних, 5 сложных).",
    "subject": "mathematics",
    "subject_name": "Математика",
    "grade": 9,
    "language": "uz",
    "question_count": 25,
    "time_limit_minutes": 45,
    "type": "control",
    "difficulty_distribution": {
      "easy": 5,
      "medium": 15,
      "hard": 5
    },
    "topics": [
      { "tag": "quadratic_equations", "name": "Квадратные уравнения", "questions_count": 12 },
      { "tag": "discriminant", "name": "Дискриминант", "questions_count": 8 },
      { "tag": "vieta_formulas", "name": "Формулы Виета", "questions_count": 5 }
    ],
    "rating": {
      "avg": 4.7,
      "count": 83,
      "distribution": {
        "5": 59,
        "4": 18,
        "3": 4,
        "2": 1,
        "1": 1
      }
    },
    "copies_count": 214,
    "copies_last_30d": 31,
    "usage_stats": {
      "total_sessions": 4280,
      "avg_score_percent": 71.4,
      "avg_completion_minutes": 38.2
    },
    "author": {
      "user_id": "usr_abc123",
      "display_name": "Акбаров Ш.",
      "school_name": "Школа №42, Ташкент",
      "school_city": "Ташкент",
      "verified": true,
      "published_tests_count": 12,
      "avg_rating": 4.6
    },
    "published_at": "2025-11-15T10:00:00Z",
    "preview_questions": [
      {
        "position": 1,
        "text": "Найдите дискриминант уравнения: 2x² - 5x + 3 = 0",
        "answers": [
          { "text": "D = 1" },
          { "text": "D = 7" },
          { "text": "D = 25" },
          { "text": "D = -1" }
        ]
      },
      {
        "position": 2,
        "text": "Уравнение x² - 7x + 10 = 0 имеет корни:",
        "answers": [
          { "text": "x₁ = 2, x₂ = 5" },
          { "text": "x₁ = -2, x₂ = -5" },
          { "text": "x₁ = 1, x₂ = 10" },
          { "text": "x₁ = 7, x₂ = 0" }
        ]
      },
      {
        "position": 3,
        "text": "По формулам Виета: сумма корней уравнения 3x² + 6x - 9 = 0 равна:",
        "answers": [
          { "text": "-2" },
          { "text": "3" },
          { "text": "-3" },
          { "text": "2" }
        ]
      }
    ],
    "reviews": [
      {
        "rating": 5,
        "comment": "Отличный тест, использую второй год подряд. Вопросы чёткие, объяснения хорошие.",
        "author_display": "Учитель из Ташкента",
        "created_at": "2026-01-15T09:00:00Z",
        "helpful_count": 12
      },
      {
        "rating": 4,
        "comment": "Хороший набор вопросов. Можно добавить больше задач типа C.",
        "author_display": "Учитель из Самарканда",
        "created_at": "2026-02-01T11:00:00Z",
        "helpful_count": 5
      }
    ],
    "already_copied": false,
    "rated_by_me": null,
    "can_copy": true
  }
}
```

> `preview_questions`: первые 3 вопроса теста без поля `is_correct` — для оценки качества перед копированием.
> `can_copy: false` если учитель уже скопировал тест (`already_copied: true`) или тест принадлежит самому учителю.

### Response — 404 Not Found

```json
{
  "ok": false,
  "error": {
    "code": "MARKETPLACE_TEST_NOT_FOUND",
    "message": "Тест не найден в маркетплейсе или был отозван автором"
  }
}
```

---

### Бизнес-ограничения

- `preview_questions`: всегда первые 3 вопроса в оригинальном порядке (не перемешиваются). Правильные ответы и объяснения скрыты.
- `usage_stats` (total_sessions, avg_score, avg_completion): агрегируется по всем копиям теста во всех школах. Обновляется каждые 15 минут через `analytics_snapshots`.
- `reviews`: отображаются только одобренные отзывы (прошедшие автоматическую модерацию — спам-фильтр). Максимум 10 последних отзывов. Полный список: `GET /marketplace/tests/{test_id}/reviews`.
- `author.user_id` возвращается только для авторизованных запросов. Для анонимных — только `display_name` и `school_city`.

---

## 3. POST /marketplace/tests/{test_id}/publish

**Описание:** Публикация теста учителя в маркетплейс. После публикации тест становится виден всему сообществу.

**Роль доступа:** 🔒 `teacher` (только владелец теста)

**Rate limit:** 10 публикаций / user / день

---

### Request

```http
POST /api/v1/marketplace/tests/tst_abc123/publish
Authorization: Bearer {token}
Content-Type: application/json
```

```json
{
  "display_name": "Акбаров Ш.",
  "description": "Полноценная контрольная работа по теме «Квадратные уравнения». Охватывает дискриминантный метод, формулы Виета, уравнения вида ax²+bx+c=0. Смешанный уровень сложности.",
  "tags": ["quadratic_equations", "discriminant", "algebra_9"],
  "language": "uz",
  "allow_comments": true
}
```

| Поле | Тип | Обязательно | Описание |
|---|---|---|---|
| `display_name` | string | ✅ | Псевдоним автора в маркетплейсе. 2–50 символов. Скрывает реальное ФИО |
| `description` | string | ❌ | Описание теста. Макс. 500 символов |
| `tags` | array | ❌ | Дополнительные теги для поиска. Макс. 10 тегов, каждый до 50 символов |
| `language` | string | ❌ | Язык теста: `uz` / `ru`. По умолчанию — язык теста из настроек |
| `allow_comments` | boolean | ❌ | Разрешить отзывы к тесту. По умолчанию `true` |

---

### Response — 201 Created

```json
{
  "ok": true,
  "data": {
    "marketplace_id": "mkt_entry_789",
    "test_id": "tst_abc123",
    "status": "published",
    "display_name": "Акбаров Ш.",
    "published_at": "2026-02-27T12:00:00Z",
    "marketplace_url": "https://zedly.uz/marketplace/tst_abc123",
    "share_url": "https://zedly.uz/marketplace/tst_abc123",
    "moderation_note": null,
    "visibility": "public"
  }
}
```

### Response — 400 Bad Request (тест не опубликован)

```json
{
  "ok": false,
  "error": {
    "code": "TEST_NOT_PUBLISHED",
    "message": "Нельзя добавить в маркетплейс тест в статусе draft. Сначала опубликуйте тест в своей библиотеке."
  }
}
```

### Response — 400 Bad Request (слишком мало вопросов)

```json
{
  "ok": false,
  "error": {
    "code": "MARKETPLACE_QUALITY_CHECK_FAILED",
    "message": "Тест не прошёл проверку качества для маркетплейса",
    "failed_checks": [
      {
        "check": "min_questions",
        "message": "Минимум 10 вопросов для публикации в маркетплейс. У вас: 7"
      },
      {
        "check": "all_questions_have_explanation",
        "message": "Рекомендуется: добавьте объяснения хотя бы к 50% вопросов (сейчас: 2 из 7 = 28%)"
      }
    ],
    "blocking_checks": ["min_questions"],
    "warning_checks": ["all_questions_have_explanation"]
  }
}
```

> `blocking_checks` — нельзя опубликовать. `warning_checks` — предупреждения, публикация возможна, но рейтинг будет ниже.

### Response — 409 Conflict (уже в маркетплейсе)

```json
{
  "ok": false,
  "error": {
    "code": "ALREADY_IN_MARKETPLACE",
    "message": "Тест уже опубликован в маркетплейсе",
    "marketplace_id": "mkt_entry_789",
    "marketplace_url": "https://zedly.uz/marketplace/tst_abc123",
    "unpublish_url": "/api/v1/marketplace/tests/tst_abc123/unpublish"
  }
}
```

---

### DELETE /marketplace/tests/{test_id}/unpublish

Отзыв теста из маркетплейса:

```http
DELETE /api/v1/marketplace/tests/tst_abc123/unpublish
Authorization: Bearer {token}
```

```json
{
  "ok": true,
  "data": {
    "test_id": "tst_abc123",
    "status": "unpublished",
    "copies_affected": 214,
    "note": "Тест удалён из маркетплейса. Все 214 учителей, скопировавших тест, сохраняют свои копии."
  }
}
```

---

### Бизнес-ограничения

- **Quality checks (блокирующие):**
  - Минимум 10 вопросов (рекомендуется ≥ 20)
  - Все вопросы имеют ровно 4 варианта ответа и один правильный
  - Тест опубликован (`status: published`)
  - Тест принадлежит автору (не скопирован из другого маркетплейса)
- **Quality checks (предупреждения, не блокируют):**
  - Объяснения к ≥ 50% вопросов
  - Указаны `topic_tag` для всех вопросов
  - Длина вопросов ≥ 15 символов (нет вопросов-заглушек)
- Публикация не влияет на оригинальный тест учителя — он продолжает работать в его библиотеке.
- После отзыва (`unpublish`): все учители, уже скопировавшие тест, сохраняют свои копии. Новое копирование невозможно. В их библиотеке тест помечается `(автор отозвал публикацию)`.
- Тест автоматически отзывается если автор удалил свой аккаунт — копии у других учителей сохраняются.
- `display_name` можно изменить после публикации: `PATCH /marketplace/tests/{test_id}/display-name`.

---

## 4. POST /marketplace/tests/{test_id}/rate

**Описание:** Оценка теста учителем (звёзды 1–5) + опциональный текстовый отзыв. Только учителя, скопировавшие тест, могут его оценить.

**Роль доступа:** 🔒 `teacher`

**Rate limit:** 1 оценка / test / user (идемпотентен — обновляет существующую оценку)

---

### Request

```http
POST /api/v1/marketplace/tests/tst_mkt_001/rate
Authorization: Bearer {token}
Content-Type: application/json
```

```json
{
  "rating": 5,
  "comment": "Отличный тест. Использую уже второй раз — ученики хорошо справляются. Вопросы соответствуют учебнику Алгебра-9 Азимова.",
  "used_in_class": true,
  "students_count": 24
}
```

| Поле | Тип | Обязательно | Описание |
|---|---|---|---|
| `rating` | integer | ✅ | 1–5 звёзд |
| `comment` | string | ❌ | Текстовый отзыв. Макс. 500 символов |
| `used_in_class` | boolean | ❌ | Использовали ли тест в реальном классе |
| `students_count` | integer | ❌ | Сколько учеников прошли тест. Для статистики маркетплейса |

---

### Response — 200 OK (новая оценка или обновление)

```json
{
  "ok": true,
  "data": {
    "rating_id": "rtng_xyz123",
    "test_id": "tst_mkt_001",
    "rating": 5,
    "comment": "Отличный тест...",
    "is_new": true,
    "updated_at": "2026-02-27T12:00:00Z",
    "test_rating_updated": {
      "avg": 4.71,
      "count": 84
    }
  }
}
```

### Response — 403 Forbidden (не скопировал тест)

```json
{
  "ok": false,
  "error": {
    "code": "RATING_REQUIRES_COPY",
    "message": "Оценить тест можно только после его копирования в свою библиотеку",
    "copy_url": "/api/v1/marketplace/tests/tst_mkt_001/copy"
  }
}
```

### Response — 403 Forbidden (попытка оценить свой тест)

```json
{
  "ok": false,
  "error": {
    "code": "CANNOT_RATE_OWN_TEST",
    "message": "Нельзя оценивать собственные тесты"
  }
}
```

---

### Бизнес-ограничения

- Оценить тест может только учитель, который его скопировал (`POST /marketplace/tests/{id}/copy`). Проверяется по таблице `marketplace_copies`.
- Автор теста не может оценить свой тест — 403.
- Повторный `POST` с новым `rating` — обновляет существующую оценку (last-write-wins). `is_new: false` в ответе.
- Рейтинг теста пересчитывается атомарно при каждой оценке: `UPDATE marketplace_tests SET rating_avg = ..., rating_count = ... WHERE test_id = ...`.
- Текстовый `comment` проходит автоматическую модерацию (спам-фильтр на базе простых правил: ссылки, телефоны, повторяющиеся символы → скрыть до ручной модерации).
- `used_in_class: true` + `students_count` — данные агрегируются в `usage_stats.total_sessions` маркетплейса. Это добровольная отчётность учителя, не прямые данные из сессий (приватность учеников).
- `DELETE /marketplace/tests/{test_id}/rate` — удаление своей оценки. Рейтинг теста пересчитывается.

---

## 5. POST /marketplace/tests/{test_id}/copy

**Описание:** Копирование теста из маркетплейса в личную библиотеку учителя. Создаёт полностью независимую копию — изменения в оригинале не влияют на копию.

**Роль доступа:** 🔒 `teacher`

**Rate limit:** 50 копирований / user / день; 200 / user / месяц

---

### Request

```http
POST /api/v1/marketplace/tests/tst_mkt_001/copy
Authorization: Bearer {token}
Content-Type: application/json
```

```json
{
  "custom_title": null,
  "target_grade": 9,
  "add_to_class_id": null
}
```

| Поле | Тип | Обязательно | Описание |
|---|---|---|---|
| `custom_title` | string\|null | ❌ | Переименовать копию. Если null — сохранить оригинальное название |
| `target_grade` | integer\|null | ❌ | Переопределить параллель для копии. Если null — как в оригинале |
| `add_to_class_id` | string\|null | ❌ | Сразу назначить скопированный тест классу (без дедлайна — назначается через `/assign` потом) |

---

### Response — 201 Created

```json
{
  "ok": true,
  "data": {
    "copied_test_id": "tst_copy_777",
    "original_test_id": "tst_mkt_001",
    "title": "Алгебра 9 класс: Квадратные уравнения — 25 вопросов",
    "status": "draft",
    "question_count": 25,
    "grade": 9,
    "subject": "mathematics",
    "library_url": "/api/v1/tests/tst_copy_777",
    "edit_url": "https://zedly.uz/tests/tst_copy_777/edit",
    "attribution": {
      "original_author_display": "Акбаров Ш.",
      "original_school": "Школа №42, Ташкент",
      "copied_from_marketplace": true,
      "original_marketplace_id": "tst_mkt_001"
    },
    "marketplace_entry": {
      "already_copied": true,
      "copy_count_updated": 215
    }
  }
}
```

> Скопированный тест создаётся в статусе `draft` — учитель может редактировать его перед публикацией классу. Оригинальный тест в маркетплейсе остаётся неизменным.

### Response — 409 Conflict (уже скопировано)

```json
{
  "ok": false,
  "error": {
    "code": "ALREADY_COPIED",
    "message": "Вы уже скопировали этот тест",
    "existing_copy_id": "tst_copy_666",
    "existing_copy_url": "/api/v1/tests/tst_copy_666",
    "copied_at": "2025-12-10T09:00:00Z"
  }
}
```

### Response — 403 Forbidden (попытка скопировать свой тест)

```json
{
  "ok": false,
  "error": {
    "code": "CANNOT_COPY_OWN_TEST",
    "message": "Нельзя скопировать собственный тест. Оригинал уже в вашей библиотеке.",
    "original_test_url": "/api/v1/tests/tst_abc123"
  }
}
```

### Response — 403 Forbidden (Freemium: лимит вопросов)

```json
{
  "ok": false,
  "error": {
    "code": "FREEMIUM_QUESTION_LIMIT",
    "message": "Тест содержит 45 вопросов. Бесплатный план ограничен 30 вопросами. Тест будет скопирован с первыми 30 вопросами. Подтвердите или перейдите на платный план.",
    "original_question_count": 45,
    "freemium_limit": 30,
    "confirm_partial_copy": true,
    "upgrade_url": "https://zedly.uz/pricing"
  }
}
```

**Подтверждение частичного копирования:**

```http
POST /api/v1/marketplace/tests/tst_mkt_001/copy
Content-Type: application/json

{
  "custom_title": null,
  "target_grade": 9,
  "confirm_partial_copy": true
}
```

### Response — 404 Not Found

```json
{
  "ok": false,
  "error": {
    "code": "MARKETPLACE_TEST_NOT_FOUND",
    "message": "Тест не найден в маркетплейсе или был отозван автором"
  }
}
```

---

### Бизнес-ограничения

- **Полная независимость копии:** копирование создаёт глубокую (deep copy) запись в `tests` + все вопросы и ответы в `questions` / `answers`. Изменения в оригинале не влияют на копию. Удаление оригинала из маркетплейса не удаляет копии.
- **Атрибуция:** скопированный тест хранит `attribution.original_marketplace_id` и `attribution.original_author_display`. Это поле только для информации — не ограничивает редактирование.
- **Freemium и большие тесты:** если оригинал содержит > 30 вопросов, Freemium-учитель получает предупреждение и может подтвердить частичное копирование (`confirm_partial_copy: true`) — берутся первые 30 вопросов по порядку.
- **Счётчик копирований:** `copies_count` на маркетплейс-записи инкрементируется атомарно: `UPDATE marketplace_tests SET copies_count = copies_count + 1 WHERE test_id = ...`.
- **Уведомление автору:** при каждом 10-м копировании автор получает Telegram-уведомление: «Ваш тест "Алгебра 9" скопировали уже 220 учителей 🎉».
- Копирование одного и того же теста дважды одним учителем → 409 с ссылкой на существующую копию.
- После `unpublish` автором: ответ на попытку скопировать → 404. Существующие копии у других учителей продолжают работать.

---

## 6. Общие коды ошибок

| HTTP | `error.code` | Описание |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Невалидные поля запроса |
| 400 | `TEST_NOT_PUBLISHED` | Тест в статусе draft, публикация в маркетплейс невозможна |
| 400 | `MARKETPLACE_QUALITY_CHECK_FAILED` | Тест не прошёл quality check (с деталями в `failed_checks`) |
| 403 | `ROLE_FORBIDDEN` | Только учителя работают с маркетплейсом |
| 403 | `RATING_REQUIRES_COPY` | Оценка возможна только после копирования |
| 403 | `CANNOT_RATE_OWN_TEST` | Нельзя оценить свой тест |
| 403 | `CANNOT_COPY_OWN_TEST` | Нельзя скопировать свой тест |
| 403 | `FREEMIUM_QUESTION_LIMIT` | Тест > 30 вопросов, требуется `confirm_partial_copy` или upgrade |
| 404 | `MARKETPLACE_TEST_NOT_FOUND` | Тест не найден или отозван |
| 409 | `ALREADY_IN_MARKETPLACE` | Тест уже опубликован в маркетплейсе |
| 409 | `ALREADY_COPIED` | Тест уже скопирован (с `existing_copy_id`) |
| 429 | `RATE_LIMIT_EXCEEDED` | Превышен rate limit |
| 429 | `DAILY_COPY_LIMIT` | Превышен дневной лимит копирований (50/день) |
| 500 | `INTERNAL_ERROR` | Внутренняя ошибка (с `request_id`) |

---

## Приложение: Схема данных маркетплейса

```sql
-- Записи маркетплейса (связывает тест с публичным каталогом)
CREATE TABLE marketplace_tests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id             VARCHAR(50) UNIQUE NOT NULL REFERENCES tests(id),
  author_user_id      VARCHAR(50) NOT NULL REFERENCES users(id),
  display_name        VARCHAR(50) NOT NULL,
  description         TEXT,
  language            VARCHAR(5) NOT NULL DEFAULT 'uz',
  status              VARCHAR(20) NOT NULL DEFAULT 'published',  -- published / unpublished
  allow_comments      BOOLEAN DEFAULT true,
  rating_avg          NUMERIC(3,2) DEFAULT 0,
  rating_count        INTEGER DEFAULT 0,
  copies_count        INTEGER DEFAULT 0,
  copies_last_30d     INTEGER DEFAULT 0,    -- пересчитывается воркером ежедневно
  total_sessions      INTEGER DEFAULT 0,    -- агрегат из usage_stats
  published_at        TIMESTAMPTZ DEFAULT NOW(),
  unpublished_at      TIMESTAMPTZ
);

-- Копирования (кто скопировал какой тест)
CREATE TABLE marketplace_copies (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_test_id    VARCHAR(50) NOT NULL,   -- test_id из marketplace_tests
  copied_test_id      VARCHAR(50) NOT NULL REFERENCES tests(id),
  teacher_user_id     VARCHAR(50) NOT NULL REFERENCES users(id),
  school_id           VARCHAR(50) NOT NULL,
  copied_at           TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(original_test_id, teacher_user_id)   -- один учитель — одна копия
);

-- Оценки и отзывы
CREATE TABLE marketplace_ratings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_test_id UUID NOT NULL REFERENCES marketplace_tests(id),
  teacher_user_id     VARCHAR(50) NOT NULL REFERENCES users(id),
  rating              SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment             TEXT,
  moderation_status   VARCHAR(20) DEFAULT 'approved',  -- approved / pending / rejected
  helpful_count       INTEGER DEFAULT 0,
  used_in_class       BOOLEAN DEFAULT false,
  students_count      INTEGER,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(marketplace_test_id, teacher_user_id)
);

-- Индексы
CREATE INDEX ON marketplace_tests (status, rating_avg DESC);
CREATE INDEX ON marketplace_tests USING GIN (to_tsvector('russian', title || ' ' || COALESCE(description, '')));
CREATE INDEX ON marketplace_copies (teacher_user_id, copied_at);
CREATE INDEX ON marketplace_ratings (marketplace_test_id, rating DESC);
```

---

*Конец спецификации. Следующий файл: `docs/08_data_model/schema.md` — полная схема БД.*
