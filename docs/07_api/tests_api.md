# docs/07_api/tests_api.md

---
title: Zedly — Tests API Specification
version: 1.0
date: 2026-02-27
status: Production Blueprint
scope: Создание тестов, назначение, сессии прохождения, сабмит ответов
---

# Tests API — Спецификация

> Базовый URL: `https://api.zedly.uz/api/v1`
> Все запросы и ответы: `Content-Type: application/json`
> Все эндпоинты требуют заголовок `Authorization: Bearer {access_token}`, кроме явно помеченных публичными.
> Мультитенантность: `school_id` извлекается из JWT, не из тела запроса. Передача чужого `school_id` в теле игнорируется.

---

## Содержание

1. [POST /tests](#1-post-tests) — Создание теста
2. [GET /tests/{test_id}](#2-get-teststest_id) — Получение теста
3. [POST /tests/{test_id}/assign](#3-post-teststest_idassign) — Назначение классу
4. [POST /tests/{test_id}/sessions](#4-post-teststest_idsessions) — Запуск сессии ученика
5. [POST /sessions/{session_id}/answers](#5-post-sessionssession_idanswers) — Сабмит ответов
6. [POST /sessions/{session_id}/finish](#6-post-sessionssession_idfinish) — Завершение сессии
7. [Общие коды ошибок](#7-общие-коды-ошибок)

---

## 1. POST /tests

**Описание:** Создание нового теста. Поддерживает два режима: ручное заполнение вопросов и запуск AI-генерации (асинхронно).

**Роль доступа:** 🔒 `teacher`

**Rate limit:** 30 тестов / user / день; 5 AI-генераций / user / день

---

### Request

```http
POST /api/v1/tests
Authorization: Bearer {token}
Content-Type: application/json
```

```json
{
  "title": "Контрольная по алгебре — тема: Квадратные уравнения",
  "subject": "mathematics",
  "grade": 9,
  "type": "control",
  "time_limit_minutes": 45,
  "pass_threshold_percent": 70,
  "issue_certificate": true,
  "show_answers": "after_deadline",
  "shuffle_questions": true,
  "shuffle_answers": true,
  "language": "uz",
  "questions": [
    {
      "text": "Решите уравнение: x² - 5x + 6 = 0",
      "image_url": null,
      "topic_tag": "quadratic_equations",
      "difficulty": "medium",
      "answers": [
        { "text": "x = 2 и x = 3", "is_correct": true },
        { "text": "x = -2 и x = -3", "is_correct": false },
        { "text": "x = 1 и x = 6", "is_correct": false },
        { "text": "x = 2 и x = -3", "is_correct": false }
      ],
      "explanation": "D = 25 - 24 = 1; x₁ = (5+1)/2 = 3; x₂ = (5-1)/2 = 2"
    }
  ],
  "ai_generation": null
}
```

**Тело при AI-генерации** (альтернатива ручному заполнению `questions`):

```json
{
  "title": "Проверка по теме: Производная",
  "subject": "mathematics",
  "grade": 10,
  "type": "homework",
  "time_limit_minutes": 30,
  "pass_threshold_percent": 60,
  "issue_certificate": false,
  "show_answers": "immediately",
  "shuffle_questions": true,
  "shuffle_answers": true,
  "language": "uz",
  "questions": [],
  "ai_generation": {
    "source": "topic",
    "topic_description": "Производная функции: определение, правила дифференцирования, таблица производных",
    "question_count": 20,
    "difficulty_mix": { "easy": 5, "medium": 10, "hard": 5 },
    "question_type": "mcq"
  }
}
```

**Поля `ai_generation`:**

| Поле | Тип | Описание |
|---|---|---|
| `source` | string | `topic` (текстовое описание) или `pdf` (загруженный файл — `file_id` из `/files/upload`) |
| `topic_description` | string | Текстовое описание темы (при `source: topic`) |
| `file_id` | string | ID загруженного PDF/фото учебника (при `source: pdf`) |
| `question_count` | integer | 5–60 вопросов |
| `difficulty_mix` | object | Количество вопросов по уровням: `easy`, `medium`, `hard` |
| `question_type` | string | `mcq` (4 варианта) или `true_false` |

**Поля теста:**

| Поле | Тип | Обязательно | Описание |
|---|---|---|---|
| `title` | string | ✅ | Название, 3–200 символов |
| `subject` | string | ✅ | Из каталога: `mathematics`, `physics`, `chemistry`, `history`, `biology`, `literature`, `english`, `russian`, `uzbek`, `geography`, `informatics` |
| `grade` | integer | ✅ | 1–11 |
| `type` | string | ✅ | `control` / `homework` / `olympiad` / `ntt_format` |
| `time_limit_minutes` | integer\|null | ❌ | null = без лимита |
| `pass_threshold_percent` | integer | ❌ | 0–100, по умолчанию 70 |
| `issue_certificate` | boolean | ❌ | По умолчанию false |
| `show_answers` | string | ❌ | `immediately` / `after_deadline` / `never`. По умолчанию `after_deadline` |
| `shuffle_questions` | boolean | ❌ | По умолчанию true |
| `shuffle_answers` | boolean | ❌ | По умолчанию true |
| `language` | string | ❌ | `uz` / `ru`. По умолчанию `uz` |

---

### Response — 201 Created (ручное заполнение)

```json
{
  "ok": true,
  "data": {
    "test_id": "tst_abc123",
    "status": "draft",
    "title": "Контрольная по алгебре — тема: Квадратные уравнения",
    "subject": "mathematics",
    "grade": 9,
    "question_count": 1,
    "created_at": "2026-02-27T10:00:00Z",
    "school_id": "school_42"
  }
}
```

### Response — 202 Accepted (AI-генерация запущена)

```json
{
  "ok": true,
  "data": {
    "test_id": "tst_xyz789",
    "status": "generating",
    "generation_job_id": "job_gen_456",
    "estimated_seconds": 45,
    "poll_url": "/api/v1/tests/tst_xyz789/generation-status",
    "message": "AI-генерация запущена. Опрашивайте poll_url каждые 3 секунды."
  }
}
```

### Response — 400 Bad Request (Freemium: превышен лимит вопросов)

```json
{
  "ok": false,
  "error": {
    "code": "FREEMIUM_QUESTION_LIMIT",
    "message": "Бесплатный план позволяет не более 30 вопросов в тесте. Ваш запрос: 45 вопросов",
    "limit": 30,
    "requested": 45,
    "upgrade_url": "https://zedly.uz/pricing"
  }
}
```

### Response — 429 Too Many Requests (лимит AI-генераций)

```json
{
  "ok": false,
  "error": {
    "code": "AI_GENERATION_DAILY_LIMIT",
    "message": "Достигнут дневной лимит AI-генераций (5/день). Лимит сбросится в 00:00.",
    "reset_at": "2026-02-28T00:00:00Z"
  }
}
```

---

### GET /tests/{test_id}/generation-status

Опрос статуса AI-генерации:

```json
{
  "ok": true,
  "data": {
    "job_id": "job_gen_456",
    "status": "completed",
    "progress": 20,
    "total": 20,
    "test_id": "tst_xyz789",
    "test_status": "draft"
  }
}
```

`status`: `pending` → `processing` → `completed` / `failed`

При `failed`:
```json
{
  "ok": true,
  "data": {
    "status": "failed",
    "error": {
      "code": "AI_GENERATION_FAILED",
      "message": "Не удалось сгенерировать вопросы. Тема слишком узкая или файл нечитаем.",
      "retry_allowed": true
    }
  }
}
```

---

### Бизнес-ограничения

- Freemium: максимум 30 вопросов на тест, 5 AI-генераций в день.
- Тест создаётся в статусе `draft` — ученики не видят тест до перехода в `published`.
- AI-генерация асинхронна: задача ставится в очередь Bull/Celery, worker обрабатывает и обновляет статус в Redis. Клиент опрашивает `generation-status` каждые 3 секунды.
- Максимум 60 вопросов на тест (платный план). Более 60 — ошибка `MAX_QUESTIONS_EXCEEDED`.
- Тип `ntt_format`: фиксированная структура — 60 вопросов, 3 блока, время строго 90 минут. При попытке изменить эти параметры — ошибка `NTT_FORMAT_IMMUTABLE`.
- `shuffle_questions` и `shuffle_answers` применяются индивидуально для каждой сессии ученика (порядок сохраняется в `test_sessions.question_order JSONB`).
- LaTeX в вопросах: поле `text` поддерживает разметку `$...$` для inline и `$$...$$` для block — рендерится клиентом через KaTeX.

---

## 2. GET /tests/{test_id}

**Описание:** Получение теста. Учитель получает полную версию с правильными ответами. Ученик — только вопросы и варианты, без `is_correct` и `explanation` (если `show_answers` ≠ `immediately`).

**Роль доступа:** 🔒 `teacher` (полная версия) | `student` (ограниченная версия)

**Rate limit:** 200 запросов / user / час

---

### Request

```http
GET /api/v1/tests/tst_abc123
Authorization: Bearer {token}
```

---

### Response — 200 OK (для учителя — владельца теста)

```json
{
  "ok": true,
  "data": {
    "test_id": "tst_abc123",
    "status": "published",
    "title": "Контрольная по алгебре — тема: Квадратные уравнения",
    "subject": "mathematics",
    "grade": 9,
    "type": "control",
    "time_limit_minutes": 45,
    "pass_threshold_percent": 70,
    "issue_certificate": true,
    "show_answers": "after_deadline",
    "shuffle_questions": true,
    "shuffle_answers": true,
    "language": "uz",
    "question_count": 25,
    "created_at": "2026-02-27T10:00:00Z",
    "published_at": "2026-02-27T10:15:00Z",
    "school_id": "school_42",
    "author": {
      "user_id": "usr_abc123",
      "full_name": "Акбаров Шерзод Ботирович"
    },
    "questions": [
      {
        "question_id": "q_001",
        "position": 1,
        "text": "Решите уравнение: x² - 5x + 6 = 0",
        "image_url": null,
        "topic_tag": "quadratic_equations",
        "difficulty": "medium",
        "answers": [
          { "answer_id": "a_001", "text": "x = 2 и x = 3", "is_correct": true },
          { "answer_id": "a_002", "text": "x = -2 и x = -3", "is_correct": false },
          { "answer_id": "a_003", "text": "x = 1 и x = 6", "is_correct": false },
          { "answer_id": "a_004", "text": "x = 2 и x = -3", "is_correct": false }
        ],
        "explanation": "D = 25 - 24 = 1; x₁ = 3; x₂ = 2"
      }
    ],
    "assignments": [
      {
        "assignment_id": "asgn_001",
        "class_id": "class_9b",
        "class_name": "9-Б",
        "deadline": "2026-03-01T18:00:00Z",
        "completed_count": 17,
        "total_students": 24
      }
    ]
  }
}
```

### Response — 200 OK (для ученика — `show_answers: after_deadline`, дедлайн не истёк)

```json
{
  "ok": true,
  "data": {
    "test_id": "tst_abc123",
    "title": "Контрольная по алгебре — тема: Квадратные уравнения",
    "subject": "mathematics",
    "time_limit_minutes": 45,
    "question_count": 25,
    "assignment": {
      "assignment_id": "asgn_001",
      "deadline": "2026-03-01T18:00:00Z",
      "status": "assigned"
    },
    "questions": [
      {
        "question_id": "q_001",
        "position": 1,
        "text": "Решите уравнение: x² - 5x + 6 = 0",
        "image_url": null,
        "answers": [
          { "answer_id": "a_001", "text": "x = 2 и x = 3" },
          { "answer_id": "a_002", "text": "x = -2 и x = -3" },
          { "answer_id": "a_003", "text": "x = 1 и x = 6" },
          { "answer_id": "a_004", "text": "x = 2 и x = -3" }
        ]
      }
    ]
  }
}
```

> Поля `is_correct` и `explanation` отсутствуют в ответе для ученика до истечения дедлайна или при `show_answers: never`.

### Response — 403 Forbidden (ученик не в классе, которому назначен тест)

```json
{
  "ok": false,
  "error": {
    "code": "TEST_NOT_ASSIGNED_TO_STUDENT",
    "message": "Этот тест не назначен вашему классу"
  }
}
```

### Response — 404 Not Found

```json
{
  "ok": false,
  "error": {
    "code": "TEST_NOT_FOUND",
    "message": "Тест не найден"
  }
}
```

---

### Бизнес-ограничения

- Учитель видит только свои тесты и тесты, скопированные из Marketplace. Тест другого учителя → 404 (не 403, чтобы не раскрывать существование).
- Ученик видит тест только если он назначен его классу (`test_assignments` таблица) и статус теста `published`.
- При `show_answers: immediately` — поля `is_correct` и `explanation` включаются в ответ для ученика сразу. При `after_deadline` — только после `deadline`. При `never` — никогда.
- `shuffle_questions` / `shuffle_answers`: вопросы возвращаются в порядке из `test_sessions.question_order` (индивидуальный порядок ученика). Если сессия ещё не создана — порядок по умолчанию.

---

## 3. POST /tests/{test_id}/assign

**Описание:** Назначение опубликованного теста одному или нескольким классам с указанием дедлайна.

**Роль доступа:** 🔒 `teacher` (только владелец теста)

**Rate limit:** 50 запросов / user / час

---

### Request

```http
POST /api/v1/tests/tst_abc123/assign
Authorization: Bearer {token}
Content-Type: application/json
```

```json
{
  "assignments": [
    {
      "class_id": "class_9b",
      "deadline": "2026-03-01T18:00:00Z"
    },
    {
      "class_id": "class_9v",
      "deadline": "2026-03-01T18:00:00Z"
    }
  ],
  "notify_students": true,
  "notify_channel": "telegram"
}
```

| Поле | Тип | Обязательно | Описание |
|---|---|---|---|
| `assignments` | array | ✅ | Массив назначений (1–10 классов одновременно) |
| `assignments[].class_id` | string | ✅ | ID класса из классов учителя |
| `assignments[].deadline` | string | ✅ | ISO 8601, должен быть в будущем (min +30 минут от now) |
| `notify_students` | boolean | ❌ | Уведомить учеников. По умолчанию true |
| `notify_channel` | string | ❌ | `telegram` / `push` / `both`. По умолчанию `both` |

---

### Response — 201 Created

```json
{
  "ok": true,
  "data": {
    "test_id": "tst_abc123",
    "assignments_created": [
      {
        "assignment_id": "asgn_001",
        "class_id": "class_9b",
        "class_name": "9-Б",
        "student_count": 24,
        "deadline": "2026-03-01T18:00:00Z",
        "notifications_queued": 24
      },
      {
        "assignment_id": "asgn_002",
        "class_id": "class_9v",
        "class_name": "9-В",
        "student_count": 22,
        "deadline": "2026-03-01T18:00:00Z",
        "notifications_queued": 22
      }
    ],
    "total_students_notified": 46
  }
}
```

### Response — 400 Bad Request (тест в статусе draft)

```json
{
  "ok": false,
  "error": {
    "code": "TEST_NOT_PUBLISHED",
    "message": "Нельзя назначить тест в статусе draft. Сначала опубликуйте тест."
  }
}
```

### Response — 400 Bad Request (дедлайн в прошлом)

```json
{
  "ok": false,
  "error": {
    "code": "DEADLINE_IN_PAST",
    "message": "Дедлайн должен быть минимум через 30 минут от текущего времени",
    "provided_deadline": "2026-02-27T09:00:00Z",
    "server_time": "2026-02-27T10:00:00Z"
  }
}
```

### Response — 409 Conflict (тест уже назначен этому классу)

```json
{
  "ok": false,
  "error": {
    "code": "ALREADY_ASSIGNED",
    "message": "Тест уже назначен классу 9-Б. Чтобы изменить дедлайн — используйте PATCH /assignments/{assignment_id}",
    "existing_assignment_id": "asgn_001"
  }
}
```

---

### Бизнес-ограничения

- Назначить тест можно только своим классам (привязанным к `school_id` из JWT). Чужой `class_id` → 403.
- При `notify_students: true`: уведомления ставятся в очередь Bull и отправляются асинхронно — ответ не ждёт доставки. Дополнительно: напоминания за 2 часа и 30 минут до дедлайна ставятся в Redis Sorted Set с `score = deadline_unix - 7200` и `score = deadline_unix - 1800`.
- Один тест может быть назначен не более 10 классам одновременно (расширяется на Enterprise-плане).
- Тест в статусе `archived` назначить нельзя — ошибка `TEST_ARCHIVED`.
- После назначения статус теста автоматически меняется на `published` (если был `draft`).

---

## 4. POST /tests/{test_id}/sessions

**Описание:** Запуск сессии прохождения теста учеником. Создаёт индивидуальную сессию с персонализированным порядком вопросов и ответов.

**Роль доступа:** 🔒 `student`

**Rate limit:** 10 новых сессий / user / час

---

### Request

```http
POST /api/v1/tests/tst_abc123/sessions
Authorization: Bearer {token}
Content-Type: application/json
```

```json
{
  "assignment_id": "asgn_001",
  "device_type": "mobile",
  "offline_mode": false
}
```

| Поле | Тип | Обязательно | Описание |
|---|---|---|---|
| `assignment_id` | string | ✅ | ID назначения (связывает тест с классом ученика) |
| `device_type` | string | ❌ | `web` / `mobile` / `telegram`. Для аналитики. По умолчанию `web` |
| `offline_mode` | boolean | ❌ | `true` — сервер возвращает полный пакет вопросов для offline. По умолчанию `false` |

---

### Response — 201 Created

```json
{
  "ok": true,
  "data": {
    "session_id": "sess_uvw321",
    "test_id": "tst_abc123",
    "assignment_id": "asgn_001",
    "started_at": "2026-02-27T11:00:00Z",
    "deadline": "2026-03-01T18:00:00Z",
    "time_limit_minutes": 45,
    "expires_at": "2026-02-27T11:45:00Z",
    "question_order": ["q_014", "q_003", "q_022", "q_007"],
    "answer_shuffles": {
      "q_014": ["a_056", "a_057", "a_058", "a_059"],
      "q_003": ["a_011", "a_012", "a_013", "a_014"]
    },
    "status": "in_progress",
    "questions": null
  }
}
```

**При `offline_mode: true`** — поле `questions` содержит полный пакет вопросов (без `is_correct`), зашифрованный публичным ключом сессии:

```json
{
  "questions": [
    {
      "question_id": "q_014",
      "text": "...",
      "image_url": null,
      "answers": [
        { "answer_id": "a_056", "text": "..." },
        { "answer_id": "a_057", "text": "..." }
      ]
    }
  ]
}
```

### Response — 409 Conflict (сессия уже существует)

```json
{
  "ok": false,
  "error": {
    "code": "SESSION_ALREADY_EXISTS",
    "message": "Сессия для этого теста уже создана",
    "existing_session_id": "sess_uvw321",
    "session_status": "in_progress",
    "resume_url": "/api/v1/sessions/sess_uvw321"
  }
}
```

### Response — 403 Forbidden (дедлайн истёк)

```json
{
  "ok": false,
  "error": {
    "code": "ASSIGNMENT_DEADLINE_PASSED",
    "message": "Дедлайн назначения истёк. Тест больше недоступен для прохождения",
    "deadline": "2026-03-01T18:00:00Z"
  }
}
```

---

### Бизнес-ограничения

- Ученик может иметь только одну активную сессию на тест. Повторный `POST` возвращает 409 с `resume_url`.
- `expires_at` = `started_at + time_limit_minutes`. Если `time_limit_minutes = null`, то `expires_at = deadline`.
- `question_order` и `answer_shuffles` генерируются сервером псевдослучайно (seeded by `session_id`) и сохраняются в `test_sessions` — неизменны до завершения сессии.
- Offline-пакет вопросов кэшируется на клиенте в IndexedDB. Клиент не может изменить вопросы — все ответы верифицируются на сервере по `question_id` + `answer_id` из оригинального теста.
- NTT-формат: `offline_mode: true` запрещён (требуется онлайн-контроль). Ответ → 400 `NTT_OFFLINE_FORBIDDEN`.

---

## 5. POST /sessions/{session_id}/answers

**Описание:** Сабмит ответа на один или несколько вопросов. Вызывается при каждом выборе ответа (inкреметальный сохранение) или батчем перед завершением.

**Роль доступа:** 🔒 `student` (только владелец сессии)

**Rate limit:** 600 запросов / session / час (≈ 10 в минуту — достаточно для быстрого прохождения)

---

### Request

```http
POST /api/v1/sessions/sess_uvw321/answers
Authorization: Bearer {token}
Content-Type: application/json
```

```json
{
  "answers": [
    {
      "question_id": "q_014",
      "answer_id": "a_056",
      "answered_at": "2026-02-27T11:03:22Z",
      "time_spent_seconds": 47
    },
    {
      "question_id": "q_003",
      "answer_id": "a_012",
      "answered_at": "2026-02-27T11:04:10Z",
      "time_spent_seconds": 48
    }
  ]
}
```

| Поле | Тип | Обязательно | Описание |
|---|---|---|---|
| `answers` | array | ✅ | Массив ответов (1–60 за запрос) |
| `answers[].question_id` | string | ✅ | ID вопроса из теста |
| `answers[].answer_id` | string | ✅ | ID выбранного варианта; `null` — вопрос пропущен |
| `answers[].answered_at` | string | ✅ | ISO 8601 клиентское время ответа |
| `answers[].time_spent_seconds` | integer | ❌ | Секунд потрачено на вопрос (для аналитики) |

---

### Response — 200 OK

```json
{
  "ok": true,
  "data": {
    "session_id": "sess_uvw321",
    "answers_saved": 2,
    "total_answered": 15,
    "total_questions": 25,
    "time_remaining_seconds": 2218
  }
}
```

**При `show_answers: immediately`** — ответ содержит результат каждого вопроса:

```json
{
  "ok": true,
  "data": {
    "session_id": "sess_uvw321",
    "answers_saved": 1,
    "total_answered": 15,
    "total_questions": 25,
    "time_remaining_seconds": 2218,
    "results": [
      {
        "question_id": "q_014",
        "is_correct": false,
        "correct_answer_id": "a_057",
        "explanation": "Правильный ответ: x = 2 и x = 3. D = 25 - 24 = 1"
      }
    ]
  }
}
```

### Response — 400 Bad Request (невалидный question_id)

```json
{
  "ok": false,
  "error": {
    "code": "INVALID_QUESTION_ID",
    "message": "Вопрос q_999 не принадлежит тесту tst_abc123",
    "invalid_ids": ["q_999"]
  }
}
```

### Response — 403 Forbidden (сессия завершена)

```json
{
  "ok": false,
  "error": {
    "code": "SESSION_ALREADY_FINISHED",
    "message": "Сессия уже завершена. Ответы не принимаются.",
    "finished_at": "2026-02-27T11:43:10Z"
  }
}
```

### Response — 410 Gone (время вышло)

```json
{
  "ok": false,
  "error": {
    "code": "SESSION_EXPIRED",
    "message": "Время сессии истекло. Тест завершён автоматически.",
    "expired_at": "2026-02-27T11:45:00Z",
    "result_url": "/api/v1/sessions/sess_uvw321/result"
  }
}
```

---

### Бизнес-ограничения

- Сервер проверяет, что `question_id` принадлежит тесту, `answer_id` принадлежит вопросу. Иначе — 400.
- При повторном сабмите ответа на тот же `question_id` — старый ответ перезаписывается (last-write-wins). Актуально для режима «вернуться к вопросу».
- `answered_at` — клиентское время для аналитики. Сервер фиксирует своё время `server_answered_at`. Расхождение > 30 секунд логируется как аномалия.
- Offline-синхронизация: при восстановлении сети клиент отправляет батч всех накопленных ответов. Сервер проверяет `session.expires_at` — если не истекло, принимает батч; если истекло, возвращает 410 и автоматически завершает сессию с теми ответами, что были сохранены ранее.
- `time_spent_seconds` — необязателен, но критичен для аналитики слабых тем: позволяет выявить вопросы, на которые ученики тратят больше всего времени.

---

## 6. POST /sessions/{session_id}/finish

**Описание:** Явное завершение сессии учеником. Вычисляет результат, сохраняет в `test_results`, при необходимости выдаёт сертификат.

**Роль доступа:** 🔒 `student` (только владелец сессии)

**Rate limit:** 10 запросов / session (идемпотентен — повторный вызов возвращает тот же результат)

---

### Request

```http
POST /api/v1/sessions/sess_uvw321/finish
Authorization: Bearer {token}
Content-Type: application/json
```

```json
{
  "final_answers": []
}
```

| Поле | Тип | Обязательно | Описание |
|---|---|---|---|
| `final_answers` | array | ❌ | Финальный батч ответов (если есть неотправленные). Формат как в `/answers`. Пустой массив — просто завершить с тем, что есть |

---

### Response — 200 OK

```json
{
  "ok": true,
  "data": {
    "result_id": "res_qwe654",
    "session_id": "sess_uvw321",
    "test_id": "tst_abc123",
    "assignment_id": "asgn_001",
    "finished_at": "2026-02-27T11:43:10Z",
    "time_spent_seconds": 2590,
    "score": {
      "correct": 21,
      "total": 25,
      "percent": 84,
      "passed": true
    },
    "rank_in_class": {
      "rank": 3,
      "total_completed": 18,
      "is_final": false,
      "note": "Рейтинг предварительный — ещё 6 учеников не прошли тест"
    },
    "certificate": {
      "issued": true,
      "certificate_id": "cert_abc789",
      "download_url": "/api/v1/certificates/cert_abc789/download",
      "verify_url": "https://zedly.uz/verify/cert_abc789"
    },
    "result_card_url": "https://cdn.zedly.uz/result-cards/res_qwe654.png",
    "breakdown": {
      "by_topic": [
        {
          "topic_tag": "quadratic_equations",
          "topic_name": "Квадратные уравнения",
          "correct": 8,
          "total": 10,
          "percent": 80
        },
        {
          "topic_tag": "linear_equations",
          "topic_name": "Линейные уравнения",
          "correct": 13,
          "total": 15,
          "percent": 87
        }
      ],
      "errors": [
        {
          "question_id": "q_003",
          "question_text": "Решите: 2x² + 5x - 3 = 0",
          "student_answer": "x = 0.5 и x = -3",
          "correct_answer": "x = 0.5 и x = -3",
          "is_correct": true,
          "explanation": null
        }
      ]
    },
    "ai_recommendations": [
      {
        "topic_tag": "quadratic_equations",
        "topic_name": "Квадратные уравнения",
        "error_count": 2,
        "recommendation": "Повторите дискриминантный метод решения квадратных уравнений"
      }
    ]
  }
}
```

> `errors` содержит только неверные ответы при `show_answers: immediately` или если дедлайн уже истёк. Иначе поле отсутствует.

### Response — 409 Conflict (сессия уже завершена — идемпотентный ответ)

```json
{
  "ok": true,
  "data": {
    "result_id": "res_qwe654",
    "message": "Сессия уже была завершена ранее. Возвращаем существующий результат.",
    "finished_at": "2026-02-27T11:43:10Z"
  }
}
```

---

### Бизнес-ограничения

- **Атомарность:** `final_answers` обрабатываются, результат вычисляется и сохраняется в одной транзакции. Ошибка в одном из финальных ответов (невалидный ID) не блокирует завершение — ответ игнорируется, остальные сохраняются.
- **Автозавершение по таймеру:** cron-job (каждую минуту) или Redis Sorted Set с `score = expires_at` ищет истёкшие сессии и вызывает `finish` автоматически. Ученик получает push/Telegram: «Время вышло. Результат: 72%».
- **Сертификат:** выдаётся если `score.percent >= test.pass_threshold_percent` и `test.issue_certificate = true`. PDF генерируется асинхронно (Puppeteer worker), `download_url` становится доступен через ~5 секунд. До готовности PDF — 202 с `poll_url`.
- **Result Card:** PNG-карточка генерируется асинхронно (html2canvas на сервере), кэшируется в Cloudflare R2. `result_card_url` — постоянная ссылка для шеринга.
- **AI-рекомендации:** генерируются синхронно по простому алгоритму: топ-3 темы по числу ошибок → шаблонная рекомендация из базы знаний. Никакого LLM-вызова в критическом пути.
- Рейтинг в классе (`rank_in_class`) обновляется в реальном времени через WebSocket-событие `class_result_updated` на экране `Class Results` учителя.

---

## 7. Общие коды ошибок

| HTTP | `error.code` | Описание |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Невалидные поля запроса |
| 400 | `TEST_NOT_PUBLISHED` | Попытка операции с неопубликованным тестом |
| 400 | `DEADLINE_IN_PAST` | Дедлайн назначения в прошлом |
| 400 | `NTT_FORMAT_IMMUTABLE` | Попытка изменить параметры NTT-формата |
| 400 | `NTT_OFFLINE_FORBIDDEN` | Offline-режим запрещён для NTT |
| 400 | `INVALID_QUESTION_ID` | question_id не принадлежит тесту |
| 400 | `MAX_QUESTIONS_EXCEEDED` | Более 60 вопросов (платный лимит) |
| 403 | `TEST_NOT_ASSIGNED_TO_STUDENT` | Тест не назначен классу ученика |
| 403 | `SESSION_ALREADY_FINISHED` | Сессия завершена, ответы не принимаются |
| 403 | `ASSIGNMENT_DEADLINE_PASSED` | Дедлайн назначения истёк |
| 403 | `TEST_ARCHIVED` | Тест в архиве, операция недоступна |
| 403 | `FREEMIUM_QUESTION_LIMIT` | Превышен лимит вопросов (Freemium: 30) |
| 404 | `TEST_NOT_FOUND` | Тест не найден |
| 404 | `SESSION_NOT_FOUND` | Сессия не найдена |
| 409 | `SESSION_ALREADY_EXISTS` | Сессия уже создана (с `resume_url`) |
| 409 | `ALREADY_ASSIGNED` | Тест уже назначен этому классу |
| 410 | `SESSION_EXPIRED` | Время сессии истекло (с `result_url`) |
| 429 | `AI_GENERATION_DAILY_LIMIT` | Превышен дневной лимит AI-генераций |
| 429 | `RATE_LIMIT_EXCEEDED` | Общий rate limit |
| 500 | `INTERNAL_ERROR` | Внутренняя ошибка (с `request_id`) |

---

*Следующий файл: `docs/07_api/analytics_api.md`*
