# Test Engine — Backend Specification

> **Проект:** Zedly — онлайн-тестирование и аналитика для школ Узбекистана
> **Модуль:** `05_backend/test_engine_spec.md`
> **Версия:** 1.0 | **Дата:** 2026-02-27 | **Статус:** Production Blueprint

---

## Ответственность

Модуль Test Engine управляет полным жизненным циклом теста: от создания учителем до получения финального балла учеником.

**Входит в зону ответственности:**
- Создание, редактирование, публикация тестов и вопросов
- Запуск сессий тестирования (обычный, НТТ, offline, межшкольный челлендж)
- Приём и валидация ответов учеников
- Автоматическое оценивание MCQ и очередь ручной проверки open-ended
- Управление таймерами (countdown, автозавершение при 0)
- Offline-синхронизация ответов при восстановлении соединения
- Генерация событий `test_started`, `answer_submitted`, `test_completed` для Analytics Engine

**Не входит в зону ответственности:**
- Агрегация аналитики и обновление `analytics_snapshots` — это Analytics Engine (`05_backend/analytics_engine_spec.md`)
- Telegram-уведомления — Notification Module
- Генерация PDF-сертификатов — Certificate Module
- Платёжные операции — Billing Module

---

## Бизнес-логика

### 1. Изоляция школ

Каждый тест жёстко привязан к `school_id` создавшего учителя:

- При создании теста `school_id` берётся из JWT токена — учитель не может указать чужой `school_id`
- Все запросы к тесту проверяют: `tests.school_id == jwt.school_id`
- При несовпадении: `404 Not Found` (не `403` — не раскрываем факт существования ресурса)
- RLS политика PostgreSQL дублирует эту проверку на уровне БД

```sql
-- RLS policy на таблице tests
CREATE POLICY tests_school_isolation ON tests
  USING (school_id = current_setting('app.school_id')::uuid);
```

### 2. Однократное прохождение теста

По умолчанию ученик проходит тест **ровно один раз**:

- При попытке начать тест повторно: `409 Conflict`, сообщение `"Test already completed"`
- Учитель может разрешить повторное прохождение, установив флаг `allow_retakes = true` на тесте
- При `allow_retakes = true`: каждая попытка создаёт новую `test_session`, предыдущие не удаляются
- В аналитику идёт последняя завершённая сессия (по `completed_at DESC`)
- Черновые сессии со статусом `in_progress` не блокируют новый старт, если прошло > `time_limit` минут (защита от зависших сессий)

### 3. НТТ-режим (строгий)

НТТ-режим (`mode = 'ntt'`) имеет специальные ограничения, имитирующие реальный национальный тест:

| Параметр | Значение |
|---|---|
| Количество вопросов | 60 (фиксировано) |
| Лимит времени | 90 минут (фиксировано, нельзя изменить) |
| Возврат к предыдущему вопросу | ❌ Запрещён |
| Пропуск вопроса | ✅ Разрешён (ответ = null) |
| Просмотр всех вопросов сразу | ❌ Запрещён (только текущий) |
| Повтор прохождения | ❌ Запрещён по умолчанию |
| Автосохранение при закрытии | ✅ Каждые 30 секунд |

Реализация запрета возврата: сервер отклоняет `answer_submitted` для `question_index < session.current_question_index`. Клиент не показывает кнопку «Назад», но серверная валидация обязательна.

### 4. Offline-режим

Offline-первый подход для регионов с нестабильным интернетом:

**Загрузка теста (при наличии соединения):**
1. Клиент запрашивает `GET /api/v1/tests/{id}/offline-bundle`
2. Сервер возвращает полный пакет: все вопросы, изображения (base64), метаданные сессии
3. Service Worker кэширует пакет в IndexedDB с TTL = `time_limit + 60 минут`

**Прохождение без интернета:**
- Ответы сохраняются локально в IndexedDB: `{ question_id, answer, answered_at: ISO8601 }`
- Таймер работает от локальных часов устройства
- При исчерпании времени: локальная блокировка дальнейших ответов

**Синхронизация при восстановлении:**
- Service Worker автоматически отправляет `POST /api/v1/sessions/{id}/sync` с накопленными ответами
- **Conflict resolution:** при конфликте (один вопрос ответили и offline и online) — `timestamp wins`: принимается ответ с более ранней меткой `answered_at` (первый по времени — честнее)
- Если `answered_at` в синхронизируемом пакете > `session.expires_at`: ответы всё равно принимаются со статусом `late_submission = true` (учитель видит пометку, финальный балл засчитывается)
- Дедупликация: повторная синхронизация одного пакета идемпотентна (upsert по `session_id + question_id`)

---

## Сущности и поля

### Таблица `tests`

| Поле | Тип | Nullable | Описание |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | PK |
| `school_id` | `uuid` | NOT NULL | FK → schools.id, RLS |
| `teacher_id` | `uuid` | NOT NULL | FK → users.id |
| `title` | `varchar(255)` | NOT NULL | Название теста |
| `description` | `text` | NULL | Описание (опционально) |
| `mode` | `enum` | NOT NULL | `standard`, `ntt`, `challenge`, `homework` |
| `status` | `enum` | NOT NULL | `draft`, `published`, `archived` |
| `time_limit_minutes` | `smallint` | NOT NULL | Мин: 1, Макс: 240 |
| `allow_retakes` | `boolean` | NOT NULL | Default: false |
| `shuffle_questions` | `boolean` | NOT NULL | Default: false |
| `shuffle_options` | `boolean` | NOT NULL | Default: false |
| `show_correct_after` | `enum` | NOT NULL | `immediately`, `after_deadline`, `never` |
| `available_from` | `timestamptz` | NULL | Начало периода доступа |
| `available_until` | `timestamptz` | NULL | Конец периода доступа |
| `created_at` | `timestamptz` | NOT NULL | |
| `updated_at` | `timestamptz` | NOT NULL | |

**Индексы:**
```sql
CREATE INDEX idx_tests_school_teacher ON tests(school_id, teacher_id);
CREATE INDEX idx_tests_school_status ON tests(school_id, status);
```

### Таблица `questions`

| Поле | Тип | Nullable | Описание |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | PK |
| `test_id` | `uuid` | NOT NULL | FK → tests.id |
| `school_id` | `uuid` | NOT NULL | Денормализованный school_id для RLS |
| `type` | `enum` | NOT NULL | `mcq_single`, `mcq_multiple`, `open_text`, `matching`, `ordering` |
| `text` | `text` | NOT NULL | Текст вопроса |
| `options_json` | `jsonb` | NULL | Варианты ответа для MCQ |
| `correct_answer_json` | `jsonb` | NOT NULL | Правильный ответ (зашифрованный хэш для open_text) |
| `topic` | `varchar(255)` | NULL | Тема/раздел для аналитики слабых тем |
| `difficulty` | `smallint` | NULL | 1–5 (используется в НТТ-симуляторе) |
| `image_url` | `varchar(512)` | NULL | Pre-signed URL изображения |
| `image_size_bytes` | `integer` | NULL | Для валидации ≤ 5MB |
| `source_type` | `enum` | NOT NULL | `manual`, `ai`, `ai_edited`, `marketplace` |
| `position` | `smallint` | NOT NULL | Порядок вопроса в тесте |
| `points` | `smallint` | NOT NULL | Default: 1 |
| `created_at` | `timestamptz` | NOT NULL | |

**Индексы:**
```sql
CREATE INDEX idx_questions_test_id ON questions(test_id);
CREATE INDEX idx_questions_school_topic ON questions(school_id, topic);
```

### Таблица `test_sessions`

| Поле | Тип | Nullable | Описание |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | PK |
| `test_id` | `uuid` | NOT NULL | FK → tests.id |
| `student_id` | `uuid` | NOT NULL | FK → users.id |
| `school_id` | `uuid` | NOT NULL | Денормализованный school_id для RLS |
| `status` | `enum` | NOT NULL | `in_progress`, `completed`, `expired`, `syncing` |
| `started_at` | `timestamptz` | NOT NULL | |
| `completed_at` | `timestamptz` | NULL | NULL пока не завершена |
| `expires_at` | `timestamptz` | NOT NULL | `started_at + time_limit_minutes` |
| `score_raw` | `numeric(5,2)` | NULL | Сумма баллов за graded ответы |
| `score_percent` | `numeric(5,2)` | NULL | Финальный % (0–100) |
| `total_points` | `smallint` | NOT NULL | Максимально возможные баллы |
| `graded_count` | `smallint` | NOT NULL | Default: 0 |
| `current_question_index` | `smallint` | NOT NULL | Для НТТ-режима |
| `is_late_submission` | `boolean` | NOT NULL | Default: false |
| `device_info` | `jsonb` | NULL | user_agent, platform (для отладки) |

**Индексы:**
```sql
CREATE INDEX idx_sessions_student_test ON test_sessions(student_id, test_id);
CREATE INDEX idx_sessions_test_status ON test_sessions(test_id, status);
CREATE INDEX idx_sessions_school_completed ON test_sessions(school_id, completed_at);
```

### Таблица `answers`

| Поле | Тип | Nullable | Описание |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | PK |
| `session_id` | `uuid` | NOT NULL | FK → test_sessions.id |
| `question_id` | `uuid` | NOT NULL | FK → questions.id |
| `student_id` | `uuid` | NOT NULL | Денормализованный для аналитики |
| `school_id` | `uuid` | NOT NULL | Денормализованный для RLS + партиционирование |
| `answer_json` | `jsonb` | NULL | Ответ ученика (NULL = пропущен) |
| `is_correct` | `boolean` | NULL | NULL пока не проверен open_text |
| `points_awarded` | `smallint` | NULL | NULL пока не проверен |
| `status` | `enum` | NOT NULL | `submitted`, `graded`, `pending_review`, `skipped` |
| `answered_at` | `timestamptz` | NOT NULL | Метка с устройства ученика |
| `synced_at` | `timestamptz` | NULL | NULL для online-ответов |
| `is_late` | `boolean` | NOT NULL | Default: false |

**Партиционирование (критично с первого дня):**
```sql
CREATE TABLE answers (...)
  PARTITION BY RANGE (school_id, answered_at);

-- Партиция создаётся автоматически background job в начале каждого месяца
CREATE TABLE answers_2026_02 PARTITION OF answers
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
```

**Индексы (на каждой партиции):**
```sql
CREATE INDEX idx_answers_student_date ON answers(student_id, answered_at);
CREATE INDEX idx_answers_test_date ON answers(session_id, answered_at);
CREATE INDEX idx_answers_school_subject ON answers(school_id, question_id);
```

---

## Валидации

### Публикация теста

Тест нельзя опубликовать (`status: draft → published`) если:

| Условие | Ошибка |
|---|---|
| Количество вопросов < 3 | `422: "Minimum 3 questions required to publish"` |
| `time_limit_minutes < 1` | `422: "Time limit must be at least 1 minute"` |
| `time_limit_minutes > 240` | `422: "Time limit cannot exceed 240 minutes"` |
| НТТ-режим и вопросов ≠ 60 | `422: "NTT mode requires exactly 60 questions"` |
| Хотя бы один вопрос без текста | `422: "Question {id} has empty text"` |
| MCQ-вопрос без правильного ответа | `422: "Question {id} has no correct answer marked"` |
| `available_until < available_from` | `422: "available_until must be after available_from"` |

### Загрузка изображений к вопросам

| Условие | Ошибка |
|---|---|
| Размер файла > 5MB | `413: "Image exceeds 5MB limit"` |
| Тип файла не jpg/png/webp | `415: "Only jpg, png, webp allowed"` |
| Файл повреждён / не является изображением | `422: "Invalid image file"` |

Изображения хранятся в Cloudflare R2: `/schools/{school_id}/questions/{question_id}/{uuid}.{ext}`
Возвращается pre-signed URL с TTL 1 час.

### Ответы ученика

| Условие | Поведение |
|---|---|
| `session.status != 'in_progress'` | `409: "Session is not active"` |
| `session.expires_at < now()` | Автозавершение сессии, ответ не принимается |
| НТТ-режим: `question_index < current_question_index` | `400: "Cannot answer previous question in NTT mode"` |
| Ответ уже существует (online) | `409: "Question already answered"` |
| Offline sync: ответ уже существует | `upsert` — принимается если `answered_at` старше |

---

## Оценивание

### MCQ (Single и Multiple Choice)

Оценивание происходит **немедленно** при `answer_submitted`:

```
Для mcq_single:
  is_correct = (answer_json.selected == correct_answer_json.id)
  points_awarded = is_correct ? question.points : 0

Для mcq_multiple:
  selected_set = Set(answer_json.selected_ids)
  correct_set  = Set(correct_answer_json.ids)
  is_correct   = (selected_set == correct_set)  // полное совпадение
  points_awarded = is_correct ? question.points : 0
  // Частичное засчитывание — только если teacher включил partial_scoring на вопросе
```

### Open Text

1. Ответ сохраняется со статусом `pending_review`
2. Учитель получает in-app + Telegram уведомление: «Есть непроверенные ответы в тесте "{title}"»
3. Учитель открывает `/teacher/tests/{id}/review`, видит ответ ученика и вводит `points_awarded` (0 до `question.points`)
4. После нажатия «Сохранить»: `status → graded`, обновляется `graded_count` сессии

### Финальный балл

Финальный балл рассчитывается **только** когда `graded_count == total_questions`:

```sql
UPDATE test_sessions
SET
  score_raw     = (SELECT SUM(points_awarded) FROM answers WHERE session_id = :id),
  score_percent = ROUND(score_raw / total_points * 100, 2),
  status        = 'completed',
  completed_at  = NOW()
WHERE id = :id
  AND graded_count = (SELECT COUNT(*) FROM questions WHERE test_id = :test_id);
```

Если тест содержит только MCQ, финальный балл рассчитывается сразу при завершении сессии.

---

## Управление таймером

### Серверный таймер (источник истины)

Клиентский таймер — только UI. Сервер всегда проверяет `expires_at`:

```
expires_at = session.started_at + INTERVAL '{time_limit_minutes} minutes'
```

### Автозавершение при истечении таймера

**Вариант A: Клиент отправляет последний ответ до `expires_at`:**
Ответ принимается нормально.

**Вариант B: Клиент пытается ответить после `expires_at`:**
Сервер возвращает `409: "Session expired"` и одновременно вызывает `finalize_session(session_id)`.

**Вариант C: Клиент пропал (закрыл браузер, пропал интернет):**
Background job (`Bull`/`Celery`) каждые 2 минуты ищет просроченные сессии:
```sql
SELECT id FROM test_sessions
WHERE status = 'in_progress'
  AND expires_at < NOW() - INTERVAL '2 minutes';
```
Для каждой найденной: `finalize_session(session_id)` — сохраняются все текущие ответы, незаотвеченные помечаются `skipped`.

### `finalize_session(session_id)`

```
1. SET test_sessions.status = 'expired' (если не все open_text проверены) или 'completed'
2. INSERT skipped answers для вопросов без ответа
3. Рассчитать score_raw / score_percent (если все ответы graded)
4. SET completed_at = NOW()
5. EMIT event: session_finalized → Analytics Engine queue
```

---

## События для аналитики

Все события публикуются в очередь `Bull`/`Celery` через Redis. Analytics Engine слушает очередь асинхронно.

| Событие | Когда | Payload |
|---|---|---|
| `test_started` | Создана новая test_session | `{ session_id, test_id, student_id, school_id, started_at }` |
| `answer_submitted` | Принят и оценён ответ MCQ | `{ session_id, question_id, is_correct, topic, school_id }` |
| `session_finalized` | Сессия завершена (completed/expired) | `{ session_id, test_id, student_id, school_id, score_percent, is_late }` |
| `test_published` | Тест опубликован учителем | `{ test_id, teacher_id, school_id, question_count, mode }` |

События **не блокируют** HTTP-ответ. Публикация в очередь происходит после успешного коммита транзакции БД.

---

## WebSocket: Real-time прогресс класса

Учитель видит в реальном времени, сколько учеников начали / завершили тест.

**Протокол:**

```
Учитель подключается: WS /ws/tests/{test_id}/progress
  Authorization: Bearer {jwt}

Сервер отправляет initial state:
{
  "type": "progress_snapshot",
  "test_id": "uuid",
  "stats": {
    "assigned": 28,
    "started": 15,
    "completed": 7,
    "in_progress": 8,
    "not_started": 13
  },
  "students": [
    { "student_id": "uuid", "name": "Алишер К.", "status": "completed", "score_percent": 87.5 },
    { "student_id": "uuid", "name": "Малика Р.", "status": "in_progress", "progress": "12/30" },
    ...
  ]
}

При изменении статуса ученика сервер пушит:
{
  "type": "student_update",
  "student_id": "uuid",
  "status": "completed",
  "score_percent": 73.3,
  "completed_at": "2026-02-27T09:14:22Z"
}
```

**Масштабирование WebSocket:**
- До 100 школ: Redis Pub/Sub (`bull` + `socket.io-redis`) — один канал на `test_id`
- 100+ школ: отдельный WebSocket-сервис + Redis Pub/Sub

**Авторизация WS:**
- JWT проверяется при установке соединения
- Учитель видит только тесты своей школы (`school_id` из JWT)
- Ученики к этому каналу доступа не имеют (403 при handshake)

---

## Обработка ошибок

| Ситуация | HTTP код | Сообщение | Дополнительно |
|---|---|---|---|
| Тест не найден | 404 | `"Test not found"` | Применяется и при чужом school_id |
| Нет прав на тест | 404 | `"Test not found"` | Не раскрываем факт существования |
| Тест уже пройден | 409 | `"Test already completed. Score: {score_percent}%"` | Возвращает ссылку на результат |
| Тест ещё не опубликован | 403 | `"Test is not available yet"` | |
| Тест просрочен (available_until) | 403 | `"Test deadline has passed"` | |
| Таймер истёк | 409 | `"Session expired"` | Автоматически вызывает finalize_session |
| НТТ: возврат к предыдущему вопросу | 400 | `"Cannot navigate to previous questions in NTT mode"` | |
| Попытка пройти без назначения | 403 | `"You are not assigned to this test"` | |
| Слишком много одновременных сессий | 503 | `"Service temporarily unavailable, try again in 60 seconds"` | При > 500 concurrent sessions |

---

## Нагрузочные ожидания

| Метрика | Значение | Условие |
|---|---|---|
| Одновременных активных сессий | 500 | 100 школ |
| Одновременных активных сессий | 5 000 | 1 000 школ |
| Latency `answer_submitted` (P95) | < 300ms | включая запись в БД |
| Latency `GET /tests/{id}` (P95) | < 150ms | из кэша Redis |
| Throughput `answer_submitted` | 2 000 req/s | пиковый час 08:00–09:00 |
| WebSocket соединений | 200 | учителя, наблюдающие за классами |
| Размер offline-bundle | < 500KB | 60 вопросов без изображений |

**Кэширование:**
- `GET /tests/{id}` (опубликованный тест): Redis TTL 5 минут. Инвалидируется при изменении теста.
- `GET /tests/{id}/offline-bundle`: Redis TTL = `time_limit + 30 минут`
- Сессионные данные (`test_sessions`): НЕ кэшируются — всегда из БД для консистентности

---

## Acceptance Criteria

### AC-1: Создание теста учителем

```
Given: учитель авторизован с ролью 'teacher', school_id = 'school_A'
When: POST /api/v1/tests с валидными данными (title, mode='standard', time_limit=30)
Then:
  - Возвращает 201, тело содержит { id, status: 'draft', school_id: 'school_A' }
  - Запись создана в БД с корректным school_id
  - teacher_id из JWT проставлен в tests.teacher_id
  - Учитель из другой школы не видит этот тест (404 при GET)
```

### AC-2: Публикация теста с недостаточным количеством вопросов

```
Given: тест в статусе 'draft' содержит 2 вопроса
When: POST /api/v1/tests/{id}/publish
Then:
  - Возвращает 422 с сообщением "Minimum 3 questions required to publish"
  - Статус теста остаётся 'draft'
```

### AC-3: Однократное прохождение теста

```
Given: ученик уже завершил test_session для test_id X (status='completed')
When: POST /api/v1/tests/X/sessions (попытка начать снова)
Then:
  - Возвращает 409 Conflict
  - Тело содержит { message: "Test already completed", score_percent: 87.5, result_url: "..." }
  - Новая test_session НЕ создаётся
```

### AC-4: НТТ-режим — запрет возврата к предыдущему вопросу

```
Given: ученик проходит тест mode='ntt', current_question_index=5
When: POST /api/v1/sessions/{id}/answers с { question_index: 3 }
Then:
  - Возвращает 400 "Cannot navigate to previous questions in NTT mode"
  - Ответ НЕ сохраняется в answers
  - session.current_question_index остаётся 5
```

### AC-5: Автозавершение по таймеру

```
Given: test_session со статусом 'in_progress', expires_at = прошедшее время
When: background job проверяет просроченные сессии (каждые 2 минуты)
Then:
  - finalize_session вызывается для этой сессии
  - Незаотвеченные вопросы получают answers.status = 'skipped', is_correct = false, points_awarded = 0
  - test_sessions.status = 'completed' (если все MCQ) или 'expired' (если есть open_text)
  - test_sessions.completed_at заполнено
  - Событие 'session_finalized' отправлено в очередь аналитики
  - При следующем входе ученик видит результаты и не может начать сессию снова
```

### AC-6: Offline-синхронизация

```
Given: ученик скачал offline-bundle и ответил на 10 вопросов без интернета
When: POST /api/v1/sessions/{id}/sync с массивом ответов (answered_at из прошлого)
Then:
  - Все 10 ответов сохранены в answers с synced_at = NOW()
  - Ответы с answered_at > expires_at получают is_late = true
  - Повторная синхронизация того же пакета возвращает 200 OK, дубликаты игнорируются
  - Если ответ для question_id уже существует и его answered_at новее — синхронизируемый игнорируется (timestamp wins)
  - После успешной синхронизации при наличии всех ответов: генерируется session_finalized событие
```

### AC-7: Изоляция школ

```
Given: пользователь school_A пытается получить тест school_B
When: GET /api/v1/tests/{test_id_from_school_B}
Then:
  - Возвращает 404 (не 403 — не раскрываем существование)
  - audit_log содержит: { user_id, school_id: 'school_A', target_resource: 'test', resource_id, action: 'unauthorized_access_attempt' }
  - RLS на уровне PostgreSQL не возвращает строку даже если middleware обойдён
```

### AC-8: Финальный балл при наличии open-ended вопросов

```
Given: тест из 5 MCQ + 2 open_text; ученик завершил все вопросы
When: сессия переходит в статус завершённой
Then:
  - test_sessions.score_percent = NULL (ожидает проверки open_text)
  - test_sessions.status = 'completed'
  - Учитель проверяет 2 open_text ответа и выставляет баллы
  - После последнего graded ответа: score_percent рассчитывается автоматически
  - Ученик получает уведомление "Ваш тест проверен, балл: 78%"
```

### AC-9: WebSocket прогресс класса

```
Given: учитель подключён к WS /ws/tests/{id}/progress
When: ученик завершает тест
Then:
  - Учитель получает push-сообщение { type: 'student_update', status: 'completed', score_percent } в течение 2 секунд
  - Отключение и переподключение учителя: получает актуальный progress_snapshot
  - Ученик, подключённый к тому же WS-каналу: получает 403 при handshake
```

### AC-10: Загрузка изображения с нарушением лимита

```
Given: учитель добавляет вопрос и прикрепляет изображение размером 6MB
When: POST /api/v1/questions/{id}/image
Then:
  - Возвращает 413 "Image exceeds 5MB limit"
  - Изображение НЕ загружается в Cloudflare R2
  - Вопрос остаётся без изображения, редактирование продолжается
```

---

## Граничные случаи

**Ученик открыл тест на двух устройствах одновременно:**
Вторая попытка `POST /tests/{id}/sessions` (пока первая `in_progress`) → `409` с сообщением `"Session already in progress on another device"` и ссылкой для продолжения.

**Учитель удалил тест пока ученики его проходят:**
Тест переходит в статус `archived`, физически не удаляется из БД. Активные сессии продолжают работу. Новые сессии создать нельзя (`403: "Test is no longer available"`).

**Изображение к вопросу недоступно (CDN downtime):**
Вопрос рендерится без изображения с пометкой `[image unavailable]`. Тест не блокируется. Ошибка логируется: `{ question_id, image_url, error }`.

**Школа перешла с платного на freemium:**
Опубликованные тесты остаются доступными для прохождения. Новые тесты создаются в рамках freemium-лимитов. Дашборд директора (платная фича) становится недоступен — тесты нет.

**Ученик переходит в другую школу:**
`users.school_id` обновляется до новой школы. Все исторические `test_sessions` и `answers` сохраняются с оригинальным `school_id`. Учителя новой школы не видят исторические данные ученика из старой школы. Личное портфолио ученика (его собственный view) сохраняется полностью.

**База данных недоступна при сабмите ответа:**
Клиент получает `503`. Ответ кэшируется в клиентской очереди IndexedDB. При восстановлении — автоматический retry с exponential backoff (1s, 2s, 4s, 8s, max 5 попыток).

---

## Зависимости на другие модули

| Модуль | Тип зависимости | Детали |
|---|---|---|
| `auth_spec.md` | Входящая | JWT для авторизации, school_id из токена |
| `analytics_engine_spec.md` | Исходящая | События через Redis queue |
| `school_isolation_model.md` | Входящая | RLS политики, audit_log |
| `certificates.md` | Исходящая | Событие `session_finalized` → генерация сертификата |
| `telegram_integration.md` | Исходящая | Уведомления о `pending_review`, результатах |
| `08_data_model/entities.md` | Разделяемая | Таблицы `tests`, `questions`, `test_sessions`, `answers` |

---

## Потенциальные несоответствия — проверить при следующем батче

1. `questions.source_type` — значения `ai`, `ai_edited`, `manual`, `marketplace` должны совпадать с `03_features/ai_test_generation.md`
2. Freemium-лимит AI-генерации (10 раз/месяц) — зафиксировать в `02_roles/teacher.md` в разделе «Ограничения»
3. НТТ-симулятор использует вопросы с `difficulty` 3–5 — продублировать это условие в `03_features/ntt_simulator.md`
4. Флаг `is_late_submission` из offline-sync — должен отображаться в дашборде учителя (согласовать с `06_frontend/screens_map.md`)
5. Таблица `answers` партиционирована по `(school_id, month)` — продублировать в `08_data_model/entities.md`
