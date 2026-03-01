# Analytics Engine — Backend Specification

> **Проект:** Zedly — онлайн-тестирование и аналитика для школ Узбекистана
> **Модуль:** `05_backend/analytics_engine_spec.md`
> **Версия:** 1.0 | **Дата:** 2026-02-27 | **Статус:** Production Blueprint

---

## Ответственность

Analytics Engine отвечает за превращение сырых результатов тестов в преагрегированные снимки, которые питают все дашборды платформы — от учителя до Министерства.

**Входит в зону ответственности:**
- Получение событий от Test Engine через Redis queue
- Пересчёт `analytics_snapshots` при завершении каждого теста
- Scheduled-агрегация каждые 15 минут (safety net)
- Алгоритм Weak Topic Detection
- Async-генерация PDF/Excel отчётов для РОНО и Министерства
- Обслуживание API дашбордов (чтение из снимков, не из raw данных)
- Переход на ClickHouse при превышении порога 200 школ

**Не входит в зону ответственности:**
- Сохранение сырых ответов (`answers`) — это Test Engine
- Доставка уведомлений учителям о слабых темах — Notification Module
- Авторизация запросов к дашбордам — Auth Module
- Биллинг за аналитику директора — Billing Module

---

## Архитектурный принцип: двухуровневое хранение

```
┌─────────────────────────────────────────────────────────┐
│  УРОВЕНЬ 1: RAW DATA (PostgreSQL)                       │
│  answers, test_sessions, questions                       │
│  — Пишется при каждом ответе ученика                    │
│  — Никогда не читается дашбордами напрямую              │
└──────────────────┬──────────────────────────────────────┘
                   │ background jobs
                   ▼
┌─────────────────────────────────────────────────────────┐
│  УРОВЕНЬ 2: SNAPSHOTS (analytics_snapshots)             │
│  Преагрегированные метрики по сущностям и периодам      │
│  — Обновляются асинхронно, не блокируют пользователя    │
│  — Дашборды читают ТОЛЬКО отсюда                        │
│  — Latency чтения: < 100ms (P95)                        │
└─────────────────────────────────────────────────────────┘
```

**Почему это критично:**
При 100 школах таблица `answers` содержит ~50 миллионов строк. Прямой SQL-запрос для дашборда директора («средний балл по школе за квартал») займёт 8–15 секунд. Из снимка — 30ms.

**Правило без исключений:** ни один HTTP-обработчик дашбордов не делает `SELECT` напрямую к `answers` или `test_sessions`. Любое нарушение — архитектурный регресс.

---

## Структура таблицы `analytics_snapshots`

```sql
CREATE TABLE analytics_snapshots (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type     varchar(50)   NOT NULL,  -- 'student', 'class', 'subject', 'school', 'district', 'national'
  entity_id       uuid          NOT NULL,  -- id соответствующей сущности
  school_id       uuid          NOT NULL,  -- для RLS изоляции
  metric_name     varchar(100)  NOT NULL,  -- 'avg_score', 'weak_topics', 'completion_rate', ...
  period_type     varchar(20)   NOT NULL,  -- 'all_time', 'week', 'month', 'quarter', 'year'
  period_start    date          NOT NULL,  -- начало периода (2026-01-01 для Q1)
  period_end      date          NOT NULL,  -- конец периода (2026-03-31 для Q1)
  value_numeric   numeric(10,4) NULL,      -- для числовых метрик (avg_score = 73.45)
  value_json      jsonb         NULL,      -- для сложных метрик (weak_topics = [{...}])
  sample_size     integer       NOT NULL,  -- количество сессий/ответов в основе
  updated_at      timestamptz   NOT NULL DEFAULT NOW(),
  version         integer       NOT NULL DEFAULT 1  -- для optimistic locking при пересчёте
);

-- Уникальный снимок = одна строка на (entity, metric, period)
CREATE UNIQUE INDEX idx_snapshots_entity_metric_period
  ON analytics_snapshots(entity_type, entity_id, metric_name, period_type, period_start);

-- Быстрое чтение дашборда школы
CREATE INDEX idx_snapshots_school_period
  ON analytics_snapshots(school_id, entity_type, period_type, period_start);

-- Быстрое чтение метрик ученика
CREATE INDEX idx_snapshots_entity_metric
  ON analytics_snapshots(entity_id, metric_name, period_start DESC);

-- RLS: снимки видны только своей школе
CREATE POLICY snapshots_school_isolation ON analytics_snapshots
  USING (school_id = current_setting('app.school_id')::uuid);

-- Исключение: district и national снимки имеют school_id = NULL
-- Для них RLS проверяет роль пользователя в middleware
```

---

## Каталог метрик

### Метрики ученика (`entity_type = 'student'`)

| `metric_name` | Тип значения | Описание | Формула |
|---|---|---|---|
| `avg_score` | `value_numeric` | Средний % балл за период | `AVG(score_percent)` по завершённым сессиям |
| `total_tests_completed` | `value_numeric` | Количество пройденных тестов | `COUNT(sessions WHERE status='completed')` |
| `completion_rate` | `value_numeric` | % начатых тестов, которые завершены | `completed / started * 100` |
| `improvement_rate` | `value_numeric` | Изменение avg_score vs предыдущий период | `current_avg - prev_avg` |
| `weak_topics` | `value_json` | Темы с ошибочностью > 40% | см. алгоритм Weak Topic Detection |
| `score_distribution` | `value_json` | Гистограмма баллов (10 бакетов 0–100) | `{bucket: "0-10", count: 2}, ...` |
| `ntt_readiness_score` | `value_numeric` | Прогноз балла НТТ (0–100) | ML-модель V2; в MVP = `avg_score` по предметам НТТ |
| `streak_days` | `value_numeric` | Дней подряд с активностью | consecutive days с завершённой сессией |

### Метрики класса (`entity_type = 'class'`)

| `metric_name` | Тип значения | Описание |
|---|---|---|
| `avg_score` | `value_numeric` | Средний балл класса по всем тестам за период |
| `avg_score_by_subject` | `value_json` | `{ "math": 72.3, "physics": 68.1, ... }` |
| `weak_topics` | `value_json` | Топ-5 тем с ошибочностью > 40% по классу |
| `participation_rate` | `value_numeric` | % учеников, прошедших хотя бы 1 тест за период |
| `completion_rate` | `value_numeric` | % начатых тестов завершённых в классе |
| `score_distribution` | `value_json` | Гистограмма распределения баллов по классу |
| `improvement_vs_prev_period` | `value_numeric` | Динамика avg_score квартал к кварталу |
| `top_students` | `value_json` | Топ-3 ученика по avg_score (id + имя + балл) |
| `struggling_students` | `value_json` | Ученики с avg_score < 40% (id + имя + балл) |

### Метрики школы (`entity_type = 'school'`)

| `metric_name` | Тип значения | Описание |
|---|---|---|
| `avg_score` | `value_numeric` | Средний балл по всей школе |
| `avg_score_by_class` | `value_json` | `{ "class_id": "...", "grade": "9А", "avg": 74.1 }` |
| `avg_score_by_subject` | `value_json` | Матрица класс × предмет |
| `weak_topics` | `value_json` | Топ-5 слабых тем по школе |
| `teacher_activity_rate` | `value_numeric` | % учителей с ≥ 2 тестами за месяц |
| `student_participation_rate` | `value_numeric` | % активных учеников за период |
| `tests_created_count` | `value_numeric` | Количество созданных тестов учителями |
| `improvement_vs_last_quarter` | `value_numeric` | Динамика avg_score |
| `license_utilization` | `value_numeric` | % платных мест, которые используются |

### Метрики района (`entity_type = 'district'`, `school_id = NULL`)

| `metric_name` | Тип значения | Описание |
|---|---|---|
| `avg_score_by_school` | `value_json` | Рейтинг школ по avg_score |
| `district_avg_score` | `value_numeric` | Средний балл по всему району |
| `coverage_rate` | `value_numeric` | % школ района активных на платформе |
| `top_schools` | `value_json` | Топ-3 школы по avg_score |
| `struggling_schools` | `value_json` | Школы с avg_score < 50% |
| `quarterly_progress` | `value_json` | Динамика district_avg_score по кварталам |

### Национальные метрики (`entity_type = 'national'`, `school_id = NULL`)

| `metric_name` | Тип значения | Описание |
|---|---|---|
| `avg_score_by_region` | `value_json` | Карта регионов с avg_score |
| `national_avg_score` | `value_numeric` | Национальный средний балл |
| `top_subjects` | `value_json` | Предметы с наивысшим avg_score |
| `weakest_subjects` | `value_json` | Предметы с наименьшим avg_score |
| `coverage_by_region` | `value_json` | % школ на платформе по регионам |

---

## Алгоритм Weak Topic Detection

Алгоритм запускается при каждом пересчёте снимков класса/школы.

### Входные данные

```sql
SELECT
  q.topic,
  COUNT(*) AS total_answers,
  SUM(CASE WHEN a.is_correct = false THEN 1 ELSE 0 END) AS wrong_answers
FROM answers a
JOIN questions q ON q.id = a.question_id
WHERE
  a.school_id = :school_id
  AND a.answered_at BETWEEN :period_start AND :period_end
  AND a.status = 'graded'
  AND q.topic IS NOT NULL
  -- Фильтр по entity: добавить JOIN на test_sessions + users для class/student уровня
GROUP BY q.topic
HAVING COUNT(*) >= 10  -- минимальная выборка для статистической значимости
```

### Критерий слабой темы

```
error_rate = wrong_answers / total_answers

Слабая тема: error_rate > 0.40 (более 40% ошибок)
Критическая тема: error_rate > 0.60 (более 60% ошибок)
```

### Структура `value_json` для `weak_topics`

```json
{
  "calculated_at": "2026-02-27T09:00:00Z",
  "period": "2026-Q1",
  "topics": [
    {
      "topic": "Тригонометрические функции",
      "error_rate": 0.67,
      "severity": "critical",
      "total_answers": 145,
      "wrong_answers": 97,
      "affected_students_count": 24,
      "sample_tests": ["test_id_1", "test_id_2"]
    },
    {
      "topic": "Производная сложной функции",
      "error_rate": 0.48,
      "severity": "weak",
      "total_answers": 88,
      "wrong_answers": 42,
      "affected_students_count": 18,
      "sample_tests": ["test_id_3"]
    }
  ]
}
```

### Действия после обнаружения слабых тем

1. Снимок `weak_topics` обновляется для entity (класс/школа)
2. Если список слабых тем **изменился** по сравнению с предыдущим снимком → событие `weak_topics_updated` публикуется в Notification Module
3. Notification Module отправляет учителю: «Обнаружена слабая тема: Тригонометрические функции (67% ошибок в 9А)»
4. Учитель видит визуальный бейдж `WeakTopicBadge` на дашборде

---

## Жизненный цикл обновления снимков

### Триггер 1: Событие от Test Engine (основной путь)

```
Test Engine:
  session_finalized event →
    Redis Queue 'analytics:updates' →
      Analytics Worker picks up job

Analytics Worker:
  1. Извлечь payload: { session_id, test_id, student_id, school_id, class_id, subject_id, score_percent }
  2. Определить affected entities:
     - student:{student_id}
     - class:{class_id}
     - subject:{subject_id} в контексте класса
     - school:{school_id}
     - district:{district_id} школы
  3. Для каждой entity × period_type (week, month, quarter, year, all_time):
     → recalculate_snapshot(entity_type, entity_id, metric_list, period)
  4. Опубликовать события если метрики изменились значимо (delta > threshold)
```

**Приоритет обновлений (порядок в очереди):**
1. `student` — наивысший приоритет (ученик ждёт свой результат)
2. `class` — учитель смотрит real-time
3. `school` — директор проверяет реже
4. `district` / `national` — только при scheduled job

### Триггер 2: Scheduled Job (safety net)

```
Cron: каждые 15 минут
  → analytics_scheduled_recalc job в Bull/Celery
  → Пересчитать снимки для:
      - Всех school, у которых были session_finalized события за последние 15 мин
      - (проверяется через Redis SMEMBERS 'dirty:schools' — set, куда Test Engine добавляет school_id при каждом событии)
      - После пересчёта: SREM удаляет school из 'dirty:schools'
```

**Почему нужен scheduled job, если есть event-триггер:**
Event-триггер может потерять сообщение при перезапуске worker'а. Scheduled job гарантирует, что максимальная задержка обновления снимков — 15 минут.

### Период обновления по entity_type

| Entity | Периоды для пересчёта | При каждом событии |
|---|---|---|
| `student` | `week`, `month`, `all_time` | ✅ да |
| `class` | `week`, `month`, `quarter`, `all_time` | ✅ да |
| `school` | `month`, `quarter`, `year`, `all_time` | ✅ да |
| `district` | `quarter`, `year`, `all_time` | ❌ только scheduled (каждые 15 мин) |
| `national` | `year`, `all_time` | ❌ только scheduled (раз в час) |

---

## `recalculate_snapshot` — детальная логика

```python
def recalculate_snapshot(entity_type, entity_id, metric_name, period_type, period_start, period_end):
    """
    Пересчитывает один снимок. Вызывается в транзакции.
    При конкурентном пересчёте одного снимка — использует SELECT FOR UPDATE SKIP LOCKED.
    """

    # 1. Получить блокировку на строку снимка
    snapshot = db.execute("""
        SELECT * FROM analytics_snapshots
        WHERE entity_type = %s AND entity_id = %s
          AND metric_name = %s AND period_type = %s AND period_start = %s
        FOR UPDATE SKIP LOCKED
    """, [entity_type, entity_id, metric_name, period_type, period_start])

    # Если SKIP LOCKED вернул пустоту — другой worker уже пересчитывает, пропускаем
    if not snapshot:
        return

    # 2. Вычислить новое значение
    new_value = compute_metric(entity_type, entity_id, metric_name, period_start, period_end)

    # 3. Upsert с optimistic version check
    db.execute("""
        INSERT INTO analytics_snapshots
          (entity_type, entity_id, school_id, metric_name, period_type, period_start, period_end,
           value_numeric, value_json, sample_size, updated_at, version)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), 1)
        ON CONFLICT (entity_type, entity_id, metric_name, period_type, period_start)
        DO UPDATE SET
          value_numeric = EXCLUDED.value_numeric,
          value_json    = EXCLUDED.value_json,
          sample_size   = EXCLUDED.sample_size,
          updated_at    = NOW(),
          version       = analytics_snapshots.version + 1
    """, [...])
```

---

## Генерация отчётов для РОНО и Министерства

### Жизненный цикл отчёта

```
Запрос → queued → generating → ready → downloaded
                     ↓
                  failed (с retry)
```

### Таблица `report_jobs`

```sql
CREATE TABLE report_jobs (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       uuid          NULL,     -- NULL для district/national
  requested_by    uuid          NOT NULL, -- user_id
  report_type     varchar(50)   NOT NULL, -- 'school_quarterly', 'district_quarterly', 'national_annual'
  format          varchar(10)   NOT NULL, -- 'pdf', 'xlsx'
  status          varchar(20)   NOT NULL DEFAULT 'queued',
  period_start    date          NOT NULL,
  period_end      date          NOT NULL,
  filters_json    jsonb         NULL,     -- { subjects: [...], grades: [...] }
  file_url        varchar(512)  NULL,     -- заполняется при status='ready'
  file_size_bytes integer       NULL,
  error_message   text          NULL,
  retry_count     smallint      NOT NULL DEFAULT 0,
  queued_at       timestamptz   NOT NULL DEFAULT NOW(),
  started_at      timestamptz   NULL,
  completed_at    timestamptz   NULL,
  expires_at      timestamptz   NOT NULL  -- queued_at + 30 days
);

CREATE INDEX idx_report_jobs_user ON report_jobs(requested_by, queued_at DESC);
CREATE INDEX idx_report_jobs_status ON report_jobs(status, queued_at);
```

### Процесс генерации (background job)

```
1. HTTP: POST /api/v1/reports → создаёт report_jobs запись (status='queued')
   Ответ: 202 Accepted, { report_id, status: 'queued', check_url: '/api/v1/reports/{id}' }

2. Bull/Celery worker берёт job из очереди 'reports':
   a. UPDATE report_jobs SET status='generating', started_at=NOW()
   b. Собрать данные из analytics_snapshots (не из raw!)
   c. Отрендерить шаблон:
      - PDF: Puppeteer (HTML → PDF) или WeasyPrint (Python)
      - XLSX: openpyxl (Python) или ExcelJS (Node.js)
   d. Загрузить файл в Cloudflare R2: /reports/{year}/{month}/{report_id}.{ext}
   e. UPDATE report_jobs SET status='ready', file_url=..., completed_at=NOW()
   f. Уведомить пользователя: in-app + Telegram

3. При ошибке:
   - retry_count < 3: retry через exponential backoff (5 мин, 15 мин, 45 мин)
   - retry_count >= 3: status='failed', error_message заполнен
   - Пользователь получает уведомление об ошибке

4. Файл недоступен после expires_at (30 дней):
   - Cron job удаляет файл из R2
   - report_jobs.status → 'expired'
   - При попытке скачать → 410 Gone с предложением перегенерировать
```

### Шаблоны отчётов

**`school_quarterly` (для директора / РОНО):**
- Обложка: школа, период, дата генерации
- Сводка: avg_score школы, динамика vs предыдущий квартал
- Таблица по классам: средний балл, участие, топ ошибки
- Слабые темы: топ-10 по школе с визуализацией
- Активность учителей: кол-во тестов, охват учеников
- Приложение: сырые данные в XLSX

**`district_quarterly` (для РОНО-инспектора):**
- Рейтинг школ района по avg_score (таблица + bar chart)
- Динамика топ-5 / отстающих школ
- Сравнение с предыдущим кварталом
- Слабые темы на уровне района
- Охват: % школ на платформе

**`national_annual` (для Министерства):**
- Карта регионов с avg_score (heat map)
- Топ и слабые регионы
- Национальная динамика по годам
- Слабые предметы по стране
- Рекомендации на основе данных

---

## API дашбордов

Все endpoint'ы читают **только из `analytics_snapshots`**. Прямые запросы к `answers`/`test_sessions` запрещены.

### `GET /api/v1/analytics/teacher/dashboard`

Авторизация: `role = teacher`

**Response:**
```json
{
  "period": "2026-Q1",
  "classes": [
    {
      "class_id": "uuid",
      "name": "9А Математика",
      "avg_score": 72.3,
      "participation_rate": 87.5,
      "improvement_vs_last_period": +4.2,
      "weak_topics": [
        { "topic": "Тригонометрия", "error_rate": 0.67, "severity": "critical" }
      ],
      "last_test": { "title": "Контрольная №3", "date": "2026-02-25", "avg_score": 68.1 }
    }
  ],
  "snapshot_updated_at": "2026-02-27T09:00:00Z"
}
```

**Кэширование:** Redis TTL 5 минут (ключ: `dashboard:teacher:{teacher_id}:{period}`). Инвалидируется при обновлении снимка класса.

### `GET /api/v1/analytics/director/dashboard`

Авторизация: `role = director`, платный план обязателен (иначе `402 Payment Required`)

**Response:**
```json
{
  "school_id": "uuid",
  "period": "2026-Q1",
  "summary": {
    "avg_score": 69.8,
    "improvement_vs_last_quarter": +2.1,
    "active_teachers_rate": 78.6,
    "student_participation_rate": 82.3
  },
  "classes_heatmap": [
    { "class_id": "uuid", "grade": "9А", "subject": "Математика", "avg_score": 72.3 },
    { "class_id": "uuid", "grade": "9А", "subject": "Физика", "avg_score": 61.0 }
  ],
  "weak_topics_school": [...],
  "teacher_activity": [
    { "teacher_id": "uuid", "name": "Иванова А.А.", "tests_created": 12, "students_covered": 87 }
  ],
  "snapshot_updated_at": "2026-02-27T09:00:00Z"
}
```

### `GET /api/v1/analytics/roono/dashboard`

Авторизация: `role = roono_inspector`

**Response:**
```json
{
  "district_id": "uuid",
  "period": "2026-Q1",
  "district_avg_score": 67.4,
  "schools_ranking": [
    { "school_id": "uuid", "name": "Школа №5", "avg_score": 78.2, "rank": 1, "trend": "+3.1" },
    { "school_id": "uuid", "name": "Школа №12", "avg_score": 52.1, "rank": 14, "trend": "-1.8" }
  ],
  "coverage_rate": 73.3,
  "weak_topics_district": [...],
  "snapshot_updated_at": "2026-02-27T09:00:00Z"
}
```

### `GET /api/v1/analytics/student/progress`

Авторизация: `role = student` (только свои данные)

**Response:**
```json
{
  "student_id": "uuid",
  "period": "2026-Q1",
  "avg_score": 74.2,
  "improvement_rate": +6.3,
  "completion_rate": 91.7,
  "ntt_readiness_score": 71.0,
  "weak_topics": [...],
  "score_history": [
    { "test_title": "Алгебра №1", "date": "2026-01-15", "score_percent": 68.0 },
    { "test_title": "Алгебра №2", "date": "2026-02-10", "score_percent": 74.2 }
  ],
  "snapshot_updated_at": "2026-02-27T08:45:00Z"
}
```

---

## Нагрузка и масштабирование

### Фаза A: до 200 школ — PostgreSQL Materialized Views

```sql
-- Materialized view для быстрого пересчёта school-level снимков
CREATE MATERIALIZED VIEW mv_school_monthly_scores AS
SELECT
  s.school_id,
  DATE_TRUNC('month', ts.completed_at) AS month,
  AVG(ts.score_percent)                AS avg_score,
  COUNT(*)                             AS session_count,
  COUNT(DISTINCT ts.student_id)        AS unique_students
FROM test_sessions ts
JOIN tests t ON t.id = ts.test_id
JOIN schools s ON s.id = t.school_id
WHERE ts.status = 'completed'
GROUP BY s.school_id, DATE_TRUNC('month', ts.completed_at);

-- Обновление: каждые 15 минут (не CONCURRENTLY для MVP, потом добавить)
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_school_monthly_scores;
```

**Почему materialized views достаточно до 200 школ:**
- ~20M строк в `answers` при 200 школах
- Refresh занимает 3–8 секунд (выполняется фоново)
- Чтение из materialized view: < 50ms

### Фаза B: 200+ школ — ClickHouse как read-only аналитическая реплика

**Триггер для перехода:** аналитические запросы занимают > 2 секунды ИЛИ refresh materialized view задерживает другие операции.

```
Архитектура:
  PostgreSQL (primary) ──write──► answers, test_sessions (raw data)
                       ──CDC──►  Debezium / logical replication
                                  ↓
                              ClickHouse (read-only)
                                  ↓
                    Analytics Engine читает тяжёлые агрегаты из ClickHouse
                    Простые запросы и снимки — по-прежнему PostgreSQL
```

**Таблицы, которые переезжают в ClickHouse:**
- `answers` — основная таблица для тяжёлых агрегатов
- `test_sessions` — для временных рядов

**Таблицы, которые остаются в PostgreSQL:**
- `analytics_snapshots` — результаты агрегации, читаются дашбордами
- Все операционные таблицы (`tests`, `questions`, `users`, `schools`)

**Схема ClickHouse (MergeTree):**
```sql
CREATE TABLE answers_ch (
  school_id     UUID,
  student_id    UUID,
  question_id   UUID,
  session_id    UUID,
  topic         String,
  is_correct    UInt8,
  points_awarded Float32,
  answered_at   DateTime
) ENGINE = MergeTree()
PARTITION BY (toYYYYMM(answered_at))
ORDER BY (school_id, student_id, answered_at);
```

### Показатели производительности по фазам

| Операция | PostgreSQL (MVP) | PostgreSQL + Views (200 школ) | ClickHouse (1000 школ) |
|---|---|---|---|
| Чтение снимка (dashboard) | < 30ms | < 30ms | < 30ms |
| Пересчёт снимка класса | 200–500ms | 100–200ms | 50ms |
| Пересчёт снимка школы | 1–3s | 300–500ms | 80ms |
| Генерация district отчёта | 10–30s | 5–10s | 1–2s |
| Weak Topic Detection (школа) | 500ms–2s | 200–500ms | 100ms |

---

## Обработка ошибок и мониторинг

### Ошибки Analytics Worker

| Ситуация | Поведение |
|---|---|
| Redis queue недоступен | Worker пишет в лог, retry через 30 сек; scheduled job покроет пропущенные обновления |
| Пересчёт занял > 30 сек | Job помечается `stalled`, Bull автоматически возвращает в очередь |
| `SKIP LOCKED` вернул 0 строк | Нормальная ситуация, тихий возврат (другой worker обрабатывает) |
| Ошибка в compute_metric | Job → `failed`, сохраняется stack trace, алерт в Telegram команды |
| ClickHouse недоступен | Fallback на PostgreSQL materialized views, алерт |

### Алерты (Telegram в чат команды)

- Очередь `analytics:updates` > 1000 непрочитанных сообщений → «Analytics lag: 1000+ events pending»
- Snpashot не обновлялся > 30 минут для любой активной школы
- Report job в статусе `generating` > 5 минут
- Ошибка в Analytics Worker (любой unhandled exception)

### Structured Logging

Каждый вызов `recalculate_snapshot` логируется:
```json
{
  "event": "snapshot_recalculated",
  "entity_type": "class",
  "entity_id": "uuid",
  "metric_name": "avg_score",
  "period_type": "month",
  "duration_ms": 187,
  "sample_size": 423,
  "triggered_by": "session_finalized",
  "school_id": "uuid",
  "request_id": "uuid"
}
```

---

## Acceptance Criteria

### AC-1: Снимок обновляется после завершения теста

```
Given: ученик завершил тест, событие session_finalized опубликовано в Redis queue
When: Analytics Worker обрабатывает событие
Then:
  - Снимок avg_score для student обновлён в течение 10 секунд
  - Снимок avg_score для class обновлён в течение 30 секунд
  - Снимок avg_score для school обновлён в течение 60 секунд
  - updated_at в analytics_snapshots обновлён
  - Дашборд учителя отражает новый балл при следующем запросе
```

### AC-2: Dashboard не делает запросы к raw данным

```
Given: учитель открывает дашборд своего класса
When: GET /api/v1/analytics/teacher/dashboard
Then:
  - Все данные в ответе берутся из analytics_snapshots
  - Ни одного запроса к таблицам answers или test_sessions
  - Latency ответа < 100ms (P95)
  - Значение snapshot_updated_at в ответе не старше 15 минут
```

### AC-3: Scheduled job покрывает пропущенные события

```
Given: Analytics Worker был недоступен 10 минут, 50 сессий завершились без обновления снимков
When: Scheduled job запускается (каждые 15 минут)
Then:
  - Все школы из 'dirty:schools' Redis set обработаны
  - Снимки для affected классов/школ пересчитаны
  - dirty:schools очищен после пересчёта
  - Максимальная задержка обновления снимков: 15 минут (даже при недоступности Worker)
```

### AC-4: Weak Topic Detection — корректное обнаружение

```
Given: в классе 9А за последние 3 теста по теме "Тригонометрия" из 120 ответов 72 неверных (60%)
When: recalculate_snapshot запускается для class:9А, metric:weak_topics
Then:
  - "Тригонометрия" присутствует в value_json.topics со severity="critical"
  - error_rate = 0.60
  - sample_size >= 10 (проверка минимальной выборки)
  - Снимок сохранён в analytics_snapshots
  - Событие weak_topics_updated опубликовано в Notification Module queue
```

### AC-5: Weak Topic Detection — тема не помечается при малой выборке

```
Given: по теме "Интегралы" за период только 7 ответов, из них 5 неверных (71%)
When: recalculate_snapshot для класса
Then:
  - "Интегралы" НЕ попадает в weak_topics (sample_size < 10)
  - Алгоритм не генерирует false positive при недостаточных данных
```

### AC-6: Генерация отчёта РОНО — async flow

```
Given: РОНО-инспектор запрашивает квартальный отчёт
When: POST /api/v1/reports { report_type: 'district_quarterly', format: 'pdf', period: '2026-Q1' }
Then:
  - Ответ 202 Accepted с { report_id, status: 'queued', check_url }
  - HTTP-запрос завершается немедленно (не ждёт генерации)
  - Background job генерирует отчёт в течение 30 секунд
  - GET /api/v1/reports/{id} возвращает status='ready' с download_url
  - download_url — pre-signed URL из Cloudflare R2, TTL 1 час
  - После 30 дней: GET /api/v1/reports/{id} возвращает { status: 'expired' }
```

### AC-7: Изоляция аналитики школ

```
Given: директор школы A запрашивает дашборд
When: GET /api/v1/analytics/director/dashboard
Then:
  - Ответ содержит только данные school_id из JWT директора
  - Снимки других школ не попадают в ответ (RLS на analytics_snapshots)
  - Попытка передать чужой school_id в query params: 403 Forbidden
```

### AC-8: Конкурентный пересчёт одного снимка

```
Given: два Analytics Worker одновременно получили события для одного класса
When: оба вызывают recalculate_snapshot(class_id, avg_score, month)
Then:
  - Первый worker получает блокировку через SELECT FOR UPDATE
  - Второй worker видит SKIP LOCKED, пропускает (не ошибка, не дубликат)
  - Итоговый снимок корректен (рассчитан один раз, не дважды)
  - version в analytics_snapshots инкрементирован ровно на 1
```

### AC-9: Дашборд директора недоступен на freemium

```
Given: школа на freemium-плане, директор авторизован
When: GET /api/v1/analytics/director/dashboard
Then:
  - Ответ 402 Payment Required
  - Тело содержит { message: "Director dashboard requires a paid plan", upgrade_url: "..." }
  - Данные из analytics_snapshots не возвращаются
```

### AC-10: Отказоустойчивость при недоступности ClickHouse

```
Given: ClickHouse replica недоступна (200+ школ, фаза B)
When: Analytics Worker пытается выполнить тяжёлый агрегат для district отчёта
Then:
  - Fallback на PostgreSQL materialized views выполняется автоматически
  - Генерация отчёта продолжается (возможно медленнее)
  - Алерт отправлен команде в Telegram
  - Снимки student/class/school (из PostgreSQL) продолжают обновляться в штатном режиме
```

---

## Зависимости на другие модули

| Модуль | Тип | Детали |
|---|---|---|
| `test_engine_spec.md` | Входящая | События `session_finalized`, `answer_submitted` через Redis queue |
| `auth_spec.md` | Входящая | JWT для авторизации API дашбордов, school_id из токена |
| `school_isolation_model.md` | Входящая | RLS на `analytics_snapshots`, `report_jobs` |
| `08_data_model/entities.md` | Разделяемая | Таблицы `analytics_snapshots`, `report_jobs` |
| `telegram_integration.md` | Исходящая | Уведомления о слабых темах, готовности отчётов |
| `10_analytics/metrics_definition.md` | Разделяемая | Каноническое определение всех метрик |

---

## Потенциальные несоответствия — проверить при следующем батче

1. Метрики `ntt_readiness_score` в этом файле (MVP = avg_score по предметам НТТ) должны совпадать с `10_analytics/metrics_definition.md` и `03_features/ntt_simulator.md`
2. `report_jobs.report_type` значения (`school_quarterly`, `district_quarterly`, `national_annual`) должны совпасть с API-эндпоинтами в `07_api/analytics_api.md`
3. Структура `value_json` для `weak_topics` используется в `06_frontend/component_library.md` (компонент `WeakTopicBadge`) — согласовать поля
4. Переход на ClickHouse при 200+ школах должен быть продублирован в `13_scaling/scaling_scenarios.md` (Сценарий B)
5. `analytics_snapshots.school_id = NULL` для district/national снимков требует специальной RLS политики — добавить в `09_permissions/permissions_matrix.md` и `11_security/security_policy.md`
