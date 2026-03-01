# docs/07_api/analytics_api.md

---
title: Zedly — Analytics API Specification
version: 1.0
date: 2026-02-27
status: Production Blueprint
scope: Дашборды учителя, директора, РОНО; генерация и скачивание отчётов
---

# Analytics API — Спецификация

> Базовый URL: `https://api.zedly.uz/api/v1`
> Все запросы требуют `Authorization: Bearer {access_token}`
> **Критически важно:** все дашборды читают из таблицы `analytics_snapshots`, которая обновляется каждые 15 минут фоновым воркером. Прямые запросы к `answers`, `test_sessions`, `test_results` с агрегацией ЗАПРЕЩЕНЫ в production — это приводит к деградации БД при 100+ школах.
> Данные в дашбордах могут быть устаревшими до 15 минут. Метка `snapshot_at` в ответе показывает время последнего обновления.

---

## Содержание

1. [GET /analytics/teacher/dashboard](#1-get-analyticsteacherdashboard) — Дашборд учителя
2. [GET /analytics/director/dashboard](#2-get-analyticsdirectordashboard) — Дашборд директора
3. [GET /analytics/inspector/dashboard](#3-get-analyticsinspectordashboard) — Дашборд РОНО
4. [POST /reports/generate](#4-post-reportsgenerate) — Генерация отчёта (async)
5. [GET /reports/{report_id}/status](#5-get-reportsreport_idstatus) — Статус отчёта
6. [GET /reports/{report_id}/download](#6-get-reportsreport_iddownload) — Скачивание отчёта
7. [Общие коды ошибок](#7-общие-коды-ошибок)

---

## 1. GET /analytics/teacher/dashboard

**Описание:** Агрегированная аналитика учителя по его классам за выбранный период. Основа для экрана `Analytics`.

**Роль доступа:** 🔒 `teacher`

**Rate limit:** 60 запросов / user / час

---

### Request

```http
GET /api/v1/analytics/teacher/dashboard?period=month&class_id=class_9b&subject=mathematics
Authorization: Bearer {token}
```

**Query параметры:**

| Параметр | Тип | Обязательно | Описание |
|---|---|---|---|
| `period` | string | ❌ | `week` / `month` / `quarter` / `year`. По умолчанию `month` |
| `class_id` | string | ❌ | Фильтр по классу. По умолчанию — все классы учителя |
| `subject` | string | ❌ | Фильтр по предмету. По умолчанию — все предметы учителя |
| `date_from` | string | ❌ | ISO 8601. Если указан вместе с `date_to` — переопределяет `period` |
| `date_to` | string | ❌ | ISO 8601 |

---

### Response — 200 OK

```json
{
  "ok": true,
  "data": {
    "snapshot_at": "2026-02-27T09:45:00Z",
    "period": {
      "type": "month",
      "from": "2026-02-01T00:00:00Z",
      "to": "2026-02-27T23:59:59Z"
    },
    "kpi": {
      "tests_conducted": 14,
      "students_tested": 312,
      "avg_score_percent": 74.2,
      "tests_pass_rate_percent": 81.0,
      "avg_completion_minutes": 18.4
    },
    "kpi_trend": {
      "avg_score_vs_prev_period": +3.1,
      "tests_conducted_vs_prev_period": +2
    },
    "classes": [
      {
        "class_id": "class_9b",
        "class_name": "9-Б",
        "student_count": 24,
        "tests_count": 5,
        "avg_score_percent": 76.8,
        "trend": "up"
      },
      {
        "class_id": "class_10a",
        "class_name": "10-А",
        "student_count": 28,
        "tests_count": 9,
        "avg_score_percent": 72.1,
        "trend": "stable"
      }
    ],
    "score_distribution": {
      "ranges": [
        { "label": "0–39%", "count": 18, "percent": 5.8 },
        { "label": "40–59%", "count": 42, "percent": 13.5 },
        { "label": "60–79%", "count": 154, "percent": 49.4 },
        { "label": "80–100%", "count": 98, "percent": 31.4 }
      ]
    },
    "score_over_time": [
      { "date": "2026-02-01", "avg_score_percent": 71.0 },
      { "date": "2026-02-08", "avg_score_percent": 73.5 },
      { "date": "2026-02-15", "avg_score_percent": 74.8 },
      { "date": "2026-02-22", "avg_score_percent": 76.3 }
    ],
    "weak_topics": [
      {
        "topic_tag": "quadratic_equations",
        "topic_name": "Квадратные уравнения",
        "subject": "mathematics",
        "error_rate_percent": 52.0,
        "affected_students": 67,
        "questions_count": 84,
        "recommendation": "Провести разбор на уроке + назначить практический тест"
      },
      {
        "topic_tag": "integrals",
        "topic_name": "Интегралы",
        "subject": "mathematics",
        "error_rate_percent": 61.0,
        "affected_students": 45,
        "questions_count": 60,
        "recommendation": "Тема вводится впервые — нормальный показатель, продолжайте"
      }
    ],
    "students_at_risk": [
      {
        "user_id": "usr_stu_001",
        "full_name": "Каримов Бобур",
        "class_name": "9-Б",
        "avg_score_percent": 38.0,
        "score_drop_percent": -22.0,
        "last_test_date": "2026-02-20",
        "tests_missed": 2
      }
    ],
    "activity_heatmap": [
      { "date": "2026-02-01", "tests_passed_count": 0 },
      { "date": "2026-02-03", "tests_passed_count": 48 },
      { "date": "2026-02-10", "tests_passed_count": 76 },
      { "date": "2026-02-17", "tests_passed_count": 91 },
      { "date": "2026-02-24", "tests_passed_count": 97 }
    ]
  }
}
```

---

### Бизнес-ограничения

- Данные читаются из `analytics_snapshots` WHERE `school_id = {jwt.school_id}` AND `teacher_id = {jwt.user_id}`.
- `students_at_risk`: ученики со средним баллом < 50% ИЛИ падением балла > 15% за период. Максимум 10 записей (топ-10 по риску).
- `weak_topics`: темы с `error_rate_percent > 40%` по не менее чем 30 ответам (статистически значимо). Максимум 10 тем.
- `activity_heatmap`: данные по дням за выбранный период. Если `period = year` — агрегация по неделям.
- `trend` у классов: `up` (рост > 3%), `down` (падение > 3%), `stable` (±3%).

---

## 2. GET /analytics/director/dashboard

**Описание:** Аналитика по всей школе для директора и завучей. Агрегация по всем учителям и классам.

**Роль доступа:** 🔒 `director`

**Rate limit:** 30 запросов / user / час

---

### Request

```http
GET /api/v1/analytics/director/dashboard?period=month&subject=all&grade=all
Authorization: Bearer {token}
```

**Query параметры:**

| Параметр | Тип | Обязательно | Описание |
|---|---|---|---|
| `period` | string | ❌ | `week` / `month` / `quarter` / `year`. По умолчанию `month` |
| `subject` | string | ❌ | Фильтр по предмету или `all`. По умолчанию `all` |
| `grade` | integer\|`all` | ❌ | Фильтр по параллели (1–11) или `all`. По умолчанию `all` |

---

### Response — 200 OK

```json
{
  "ok": true,
  "data": {
    "snapshot_at": "2026-02-27T09:45:00Z",
    "school": {
      "school_id": "school_42",
      "school_name": "Школа №42 г. Ташкент",
      "period": { "type": "month", "from": "2026-02-01T00:00:00Z", "to": "2026-02-27T23:59:59Z" }
    },
    "kpi": {
      "active_teachers": 18,
      "total_teachers": 25,
      "tests_conducted": 94,
      "students_tested": 1240,
      "total_students": 1560,
      "coverage_percent": 79.5,
      "avg_score_percent": 72.8,
      "pass_rate_percent": 78.3,
      "ntt_simulations_count": 143,
      "ntt_students_ready_percent": 64.0
    },
    "kpi_trend": {
      "avg_score_vs_prev_period": +1.9,
      "active_teachers_vs_prev_period": +3,
      "coverage_vs_prev_period": +8.2
    },
    "top_classes": [
      {
        "class_id": "class_11a",
        "class_name": "11-А",
        "grade": 11,
        "avg_score_percent": 82.4,
        "tests_count": 12,
        "teacher_name": "Юсупова М.Т.",
        "trend": "up"
      },
      {
        "class_id": "class_9b",
        "class_name": "9-Б",
        "grade": 9,
        "avg_score_percent": 76.8,
        "tests_count": 5,
        "teacher_name": "Акбаров Ш.Б.",
        "trend": "stable"
      }
    ],
    "bottom_classes": [
      {
        "class_id": "class_7v",
        "class_name": "7-В",
        "grade": 7,
        "avg_score_percent": 51.2,
        "tests_count": 3,
        "teacher_name": "Кариев Д.Р.",
        "trend": "down"
      }
    ],
    "subject_heatmap": [
      {
        "subject": "mathematics",
        "subject_name": "Математика",
        "grades": [
          { "grade": 9, "avg_score_percent": 74.2, "tests_count": 14 },
          { "grade": 10, "avg_score_percent": 68.5, "tests_count": 9 },
          { "grade": 11, "avg_score_percent": 79.1, "tests_count": 12 }
        ]
      },
      {
        "subject": "physics",
        "subject_name": "Физика",
        "grades": [
          { "grade": 9, "avg_score_percent": 65.0, "tests_count": 7 },
          { "grade": 10, "avg_score_percent": 61.3, "tests_count": 6 }
        ]
      }
    ],
    "teacher_activity": [
      {
        "user_id": "usr_abc123",
        "full_name": "Акбаров Шерзод",
        "subject": "mathematics",
        "tests_created": 9,
        "tests_conducted": 9,
        "students_covered": 168,
        "avg_student_score": 74.2,
        "last_activity_at": "2026-02-26T14:30:00Z",
        "status": "active"
      },
      {
        "user_id": "usr_def456",
        "full_name": "Кариев Дилшод",
        "subject": "geography",
        "tests_created": 0,
        "tests_conducted": 0,
        "students_covered": 0,
        "avg_student_score": null,
        "last_activity_at": null,
        "status": "never_active"
      }
    ],
    "school_score_over_time": [
      { "month": "2025-09", "avg_score_percent": 68.1 },
      { "month": "2025-10", "avg_score_percent": 70.4 },
      { "month": "2025-11", "avg_score_percent": 71.8 },
      { "month": "2025-12", "avg_score_percent": 70.0 },
      { "month": "2026-01", "avg_score_percent": 72.1 },
      { "month": "2026-02", "avg_score_percent": 72.8 }
    ],
    "ntt_readiness": {
      "grade_11_count": 72,
      "simulations_3plus_count": 46,
      "simulations_3plus_percent": 63.9,
      "avg_ntt_score": 127.4,
      "threshold_comparison": [
        { "university": "ТГТУ", "threshold": 140, "students_above_percent": 38.9 },
        { "university": "НУУз", "threshold": 160, "students_above_percent": 18.1 }
      ]
    }
  }
}
```

---

### Бизнес-ограничения

- `director` видит только данные своей школы (`school_id` из JWT). Попытка запросить другую школу невозможна — фильтрация на уровне БД (RLS).
- `teacher_activity.status`: `active` (активность за 30 дней), `inactive` (31–90 дней без активности), `never_active` (никогда не создавал тестов).
- `subject_heatmap`: только предметы и параллели с хотя бы одним тестом за период.
- `ntt_readiness`: только для школ с учениками 11 класса. Если 11 класса нет — поле `null`.
- Дашборд директора недоступен на Freemium-плане учителя. Если `role = teacher` запрашивает этот эндпоинт — 403 `ROLE_FORBIDDEN`.

---

## 3. GET /analytics/inspector/dashboard

**Описание:** Агрегированная аналитика по всем школам района для РОНО-инспектора. Данные из агрегированных снапшотов уровня `district`.

**Роль доступа:** 🔒 `inspector`

**Rate limit:** 20 запросов / user / час

---

### Request

```http
GET /api/v1/analytics/inspector/dashboard?district_id=dist_tashkent&period=quarter&subject=all
Authorization: Bearer {token}
```

**Query параметры:**

| Параметр | Тип | Обязательно | Описание |
|---|---|---|---|
| `district_id` | string | ✅ | ID района. Инспектор может иметь доступ к нескольким районам |
| `period` | string | ❌ | `month` / `quarter` / `year`. По умолчанию `quarter` |
| `subject` | string | ❌ | Предмет или `all`. По умолчанию `all` |

---

### Response — 200 OK

```json
{
  "ok": true,
  "data": {
    "snapshot_at": "2026-02-27T09:45:00Z",
    "district": {
      "district_id": "dist_tashkent",
      "district_name": "Яккасарайский район, Ташкент",
      "period": { "type": "quarter", "from": "2026-01-01T00:00:00Z", "to": "2026-03-31T23:59:59Z" }
    },
    "kpi": {
      "schools_total": 24,
      "schools_on_zedly": 18,
      "schools_active_percent": 75.0,
      "active_teachers": 312,
      "students_tested": 8940,
      "tests_conducted": 1240,
      "avg_score_percent": 71.4,
      "pass_rate_percent": 76.8
    },
    "schools_ranking": [
      {
        "school_id": "school_42",
        "school_name": "Школа №42",
        "avg_score_percent": 76.8,
        "tests_conducted": 94,
        "students_covered_percent": 79.5,
        "active_teachers": 18,
        "ntt_avg_score": 134.2,
        "trend": "up",
        "rank": 1
      },
      {
        "school_id": "school_17",
        "school_name": "Школа №17",
        "avg_score_percent": 73.1,
        "tests_conducted": 76,
        "students_covered_percent": 65.2,
        "active_teachers": 14,
        "ntt_avg_score": 128.7,
        "trend": "stable",
        "rank": 2
      }
    ],
    "subject_district_avg": [
      { "subject": "mathematics", "subject_name": "Математика", "avg_score_percent": 72.1, "tests_count": 412 },
      { "subject": "physics", "subject_name": "Физика", "avg_score_percent": 64.8, "tests_count": 198 },
      { "subject": "chemistry", "subject_name": "Химия", "avg_score_percent": 61.2, "tests_count": 145 }
    ],
    "school_subject_matrix": [
      {
        "school_id": "school_42",
        "school_name": "Школа №42",
        "subjects": {
          "mathematics": 76.8,
          "physics": 69.2,
          "chemistry": 63.4
        }
      },
      {
        "school_id": "school_17",
        "school_name": "Школа №17",
        "subjects": {
          "mathematics": 73.1,
          "physics": 62.0,
          "chemistry": 58.9
        }
      }
    ],
    "district_score_over_time": [
      { "month": "2026-01", "avg_score_percent": 69.8 },
      { "month": "2026-02", "avg_score_percent": 71.4 }
    ],
    "ntt_district_readiness": {
      "grade_11_total": 640,
      "simulations_3plus_count": 389,
      "simulations_3plus_percent": 60.8,
      "avg_ntt_score_district": 124.9,
      "by_school": [
        { "school_id": "school_42", "avg_ntt_score": 134.2, "students_ready_percent": 64.0 },
        { "school_id": "school_17", "avg_ntt_score": 128.7, "students_ready_percent": 57.0 }
      ]
    }
  }
}
```

### Response — 403 Forbidden (инспектор запрашивает чужой район)

```json
{
  "ok": false,
  "error": {
    "code": "DISTRICT_ACCESS_FORBIDDEN",
    "message": "У вас нет доступа к данным района dist_samarkand",
    "accessible_districts": ["dist_tashkent", "dist_yunusabad"]
  }
}
```

---

### Бизнес-ограничения

- Инспектор может иметь доступ к нескольким районам (таблица `inspector_districts`). Запрос `district_id` вне своего списка → 403.
- `schools_ranking` содержит только школы, у которых хотя бы 1 активный учитель за период. Школы без активности присутствуют в `kpi.schools_on_zedly`, но не в рейтинге.
- `school_subject_matrix` — данные только по предметам с `tests_count >= 3` (статистически значимо). Меньше 3 тестов → `null` вместо числа.
- Данные снапшотов уровня `district` обновляются каждые 30 минут (в 2 раза реже, чем уровня `school`).
- Инспектор не видит данные по отдельным учителям или ученикам — только агрегаты по школам. Защита персональных данных.

---

## 4. POST /reports/generate

**Описание:** Запуск асинхронной генерации отчёта (PDF или Excel). Поддерживает шаблонные и произвольные отчёты.

**Роль доступа:** 🔒 `teacher` / `director` / `inspector`

**Rate limit:** 10 отчётов / user / день; не более 3 одновременно в очереди

---

### Request

```http
POST /api/v1/reports/generate
Authorization: Bearer {token}
Content-Type: application/json
```

**Шаблонный отчёт (teacher):**

```json
{
  "template": "class_quarter_report",
  "format": "pdf",
  "params": {
    "class_id": "class_9b",
    "period": "quarter",
    "quarter_number": 2,
    "academic_year": "2025-2026",
    "include_sections": [
      "summary",
      "student_scores",
      "weak_topics",
      "dynamics"
    ]
  },
  "locale": "uz"
}
```

**Произвольный отчёт (director):**

```json
{
  "template": "custom",
  "format": "xlsx",
  "params": {
    "date_from": "2026-01-01",
    "date_to": "2026-02-27",
    "include_sections": [
      "school_kpi",
      "classes_comparison",
      "teacher_activity",
      "ntt_readiness"
    ],
    "filters": {
      "grades": [10, 11],
      "subjects": ["mathematics", "physics"]
    }
  },
  "locale": "ru"
}
```

**Поля запроса:**

| Поле | Тип | Обязательно | Описание |
|---|---|---|---|
| `template` | string | ✅ | `class_quarter_report` / `school_quarter_report` / `district_quarterly` / `ntt_readiness` / `teacher_activity` / `custom` |
| `format` | string | ✅ | `pdf` / `xlsx` |
| `params` | object | ✅ | Параметры зависят от шаблона |
| `params.include_sections` | array | ✅ | Разделы для включения в отчёт |
| `locale` | string | ❌ | `uz` / `ru`. По умолчанию `uz` |

**Доступные шаблоны по ролям:**

| Шаблон | teacher | director | inspector |
|---|---|---|---|
| `class_quarter_report` | ✅ | ✅ | ❌ |
| `school_quarter_report` | ❌ | ✅ | ✅ |
| `district_quarterly` | ❌ | ❌ | ✅ |
| `ntt_readiness` | ❌ | ✅ | ✅ |
| `teacher_activity` | ❌ | ✅ | ✅ |
| `custom` | ✅ | ✅ | ✅ |

---

### Response — 202 Accepted

```json
{
  "ok": true,
  "data": {
    "report_id": "rpt_abc123",
    "status": "queued",
    "template": "class_quarter_report",
    "format": "pdf",
    "estimated_seconds": 30,
    "poll_url": "/api/v1/reports/rpt_abc123/status",
    "created_at": "2026-02-27T12:00:00Z"
  }
}
```

### Response — 403 Forbidden (шаблон недоступен для роли)

```json
{
  "ok": false,
  "error": {
    "code": "TEMPLATE_FORBIDDEN",
    "message": "Шаблон district_quarterly доступен только для инспекторов РОНО",
    "available_templates": ["class_quarter_report", "custom"]
  }
}
```

### Response — 429 Too Many Requests (лимит очереди)

```json
{
  "ok": false,
  "error": {
    "code": "REPORT_QUEUE_FULL",
    "message": "У вас уже 3 отчёта в очереди. Дождитесь завершения или отмените один из них",
    "queued_reports": [
      { "report_id": "rpt_111", "status": "processing" },
      { "report_id": "rpt_222", "status": "queued" },
      { "report_id": "rpt_333", "status": "queued" }
    ]
  }
}
```

---

### Бизнес-ограничения

- Генерация отчётов — исключительно асинхронная (Puppeteer для PDF, exceljs для XLSX). Синхронный ответ с готовым файлом никогда не возвращается.
- Готовый отчёт хранится в Cloudflare R2 с TTL 7 дней. Ссылка на скачивание — presigned URL с TTL 1 час.
- Каждый отчёт включает: логотип Zedly + данные организации (школы/РОНО) + дату генерации + watermark `ZEDLY.UZ`.
- PDF-отчёты для РОНО формируются с шапкой в формате официальных документов Узбекистана (наименование организации, дата, подпись-заглушка).
- `locale: uz` использует O'zbek tili (кириллица). В будущем — `uz_latin` (латиница).

---

## 5. GET /reports/{report_id}/status

**Описание:** Опрос статуса генерации отчёта. Клиент вызывает каждые 3–5 секунд до `completed` или `failed`.

**Роль доступа:** 🔒 Создатель отчёта (проверяется по `user_id` из JWT)

**Rate limit:** 120 запросов / report / час (≈ 1 в 30 секунд — достаточно)

---

### Request

```http
GET /api/v1/reports/rpt_abc123/status
Authorization: Bearer {token}
```

---

### Response — 200 OK (в процессе)

```json
{
  "ok": true,
  "data": {
    "report_id": "rpt_abc123",
    "status": "processing",
    "progress_percent": 65,
    "current_step": "Формирование раздела: Динамика класса",
    "estimated_seconds_remaining": 12,
    "created_at": "2026-02-27T12:00:00Z"
  }
}
```

### Response — 200 OK (завершён)

```json
{
  "ok": true,
  "data": {
    "report_id": "rpt_abc123",
    "status": "completed",
    "progress_percent": 100,
    "format": "pdf",
    "file_size_bytes": 284672,
    "page_count": 8,
    "download_url": "/api/v1/reports/rpt_abc123/download",
    "expires_at": "2026-03-06T12:00:00Z",
    "completed_at": "2026-02-27T12:00:28Z"
  }
}
```

### Response — 200 OK (ошибка генерации)

```json
{
  "ok": true,
  "data": {
    "report_id": "rpt_abc123",
    "status": "failed",
    "error": {
      "code": "REPORT_GENERATION_FAILED",
      "message": "Недостаточно данных за выбранный период (0 тестов). Выберите другой период или расширьте фильтры.",
      "retry_allowed": true
    },
    "failed_at": "2026-02-27T12:00:05Z"
  }
}
```

**Жизненный цикл статусов:** `queued` → `processing` → `completed` / `failed`

---

### Бизнес-ограничения

- Статус хранится в Redis (`report:{report_id}:status`) с TTL 8 дней.
- При `status: failed` с `retry_allowed: true` — клиент может повторно вызвать `POST /reports/generate` с теми же параметрами. Это не автоматический ретрай — требуется явное действие пользователя.
- `progress_percent` и `current_step` — приблизительные значения, формируемые воркером. Точность ±10%.
- WebSocket-альтернатива: клиент может подписаться на `ws://api.zedly.uz/ws?channel=report:{report_id}` и получать события `report:status_update` в реальном времени вместо polling.

---

## 6. GET /reports/{report_id}/download

**Описание:** Скачивание готового отчёта. Возвращает redirect на presigned URL в Cloudflare R2.

**Роль доступа:** 🔒 Создатель отчёта

**Rate limit:** 20 запросов / report / день

---

### Request

```http
GET /api/v1/reports/rpt_abc123/download
Authorization: Bearer {token}
```

---

### Response — 302 Found (redirect на presigned URL)

```http
HTTP/1.1 302 Found
Location: https://r2.zedly.uz/reports/rpt_abc123/school42_9b_Q2_2026.pdf?X-Amz-Signature=...&X-Amz-Expires=3600
Cache-Control: no-store
```

> Клиент получает presigned URL с TTL 1 час. Скачивание происходит напрямую с R2, минуя API-сервер. Это снижает нагрузку на сервер и ускоряет скачивание.

### Response — 404 Not Found (отчёт не найден или истёк)

```json
{
  "ok": false,
  "error": {
    "code": "REPORT_NOT_FOUND",
    "message": "Отчёт не найден или срок его хранения истёк (7 дней). Сгенерируйте отчёт заново."
  }
}
```

### Response — 409 Conflict (отчёт ещё не готов)

```json
{
  "ok": false,
  "error": {
    "code": "REPORT_NOT_READY",
    "message": "Отчёт ещё генерируется",
    "status": "processing",
    "poll_url": "/api/v1/reports/rpt_abc123/status"
  }
}
```

---

### Бизнес-ограничения

- Каждый вызов `/download` создаёт новый presigned URL (даже для одного и того же отчёта). TTL presigned URL — 1 час.
- Фактический файл живёт в R2 7 дней с момента генерации. После истечения — 404.
- Логируется событие `REPORT_DOWNLOADED` в `audit_log` (user_id, report_id, ip, timestamp) — для отслеживания распространения официальных документов.
- Имя файла presigned URL формируется как `{school_name}_{class}_{period}_{date}.{pdf|xlsx}` (slug, транслитерировано, без пробелов).

---

## 7. Общие коды ошибок

| HTTP | `error.code` | Описание |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Невалидные параметры запроса |
| 400 | `INVALID_PERIOD` | Неверный период или конфликт `period` и `date_from/date_to` |
| 400 | `INSUFFICIENT_DATA` | Недостаточно данных для аналитики (0 тестов за период) |
| 403 | `ROLE_FORBIDDEN` | Эндпоинт недоступен для данной роли |
| 403 | `DISTRICT_ACCESS_FORBIDDEN` | Инспектор запрашивает чужой район |
| 403 | `SCHOOL_ACCESS_FORBIDDEN` | Попытка доступа к данным другой школы |
| 403 | `TEMPLATE_FORBIDDEN` | Шаблон отчёта недоступен для роли |
| 404 | `REPORT_NOT_FOUND` | Отчёт не найден или истёк |
| 404 | `CLASS_NOT_FOUND` | Класс не найден |
| 409 | `REPORT_NOT_READY` | Отчёт ещё генерируется |
| 429 | `REPORT_QUEUE_FULL` | 3 отчёта уже в очереди |
| 429 | `REPORT_DAILY_LIMIT` | Дневной лимит генерации отчётов (10/день) |
| 429 | `RATE_LIMIT_EXCEEDED` | Общий rate limit |
| 500 | `SNAPSHOT_STALE` | Снапшот не обновлялся более 1 часа (алерт ops) |
| 500 | `INTERNAL_ERROR` | Внутренняя ошибка (с `request_id`) |

---

*Следующий файл: `docs/07_api/users_api.md`*
