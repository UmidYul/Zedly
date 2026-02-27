# docs/08_data_model/entities.md

---
title: Zedly — Data Model: Database Entities
version: 1.0
date: 2026-02-27
status: Production Blueprint
scope: Полная схема сущностей БД, индексы, RLS, партиционирование
database: PostgreSQL 16
---

# Сущности базы данных

> **Критические правила, заложенные с первого дня:**
> 1. `school_id` присутствует во ВСЕХ таблицах с пользовательскими данными — добавить постфактум = месяц миграции
> 2. Таблица `answers` партиционируется по `(school_id, month)` с первого дня — без этого 100+ школ = деградация БД
> 3. Row-Level Security включён на всех таблицах с пользовательскими данными — обход невозможен на уровне БД
> 4. Все дашборды читают ТОЛЬКО из `analytics_snapshots` — прямые агрегирующие запросы к `answers` запрещены в production
> 5. Structured logging: каждый запрос к БД логируется с `request_id`, `school_id`, `user_id`

---

## Содержание

1. [schools](#1-schools)
2. [users](#2-users)
3. [classes](#3-classes)
4. [class_students](#4-class_students)
5. [tests](#5-tests)
6. [questions](#6-questions)
7. [test_assignments](#7-test_assignments)
8. [test_sessions](#8-test_sessions)
9. [answers](#9-answers) ⚡ партиционирование
10. [analytics_snapshots](#10-analytics_snapshots)
11. [certificates](#11-certificates)
12. [audit_logs](#12-audit_logs)
13. [Дополнительные таблицы](#13-дополнительные-таблицы)
14. [Row-Level Security](#14-row-level-security)
15. [Партиционирование answers](#15-партиционирование-answers)
16. [Сводная диаграмма связей](#16-сводная-диаграмма-связей)

---

## 1. schools

Корневая сущность мультитенантной архитектуры. Каждая школа — отдельный тенант. `school_id` является основным изолятором данных через RLS.

### Колонки

| Колонка | Тип | Nullable | По умолчанию | Описание |
|---|---|---|---|---|
| `id` | `VARCHAR(50)` | NOT NULL | `'school_' \|\| nanoid(10)` | PK. Префикс `school_` + nanoid. Например: `school_abc123xyz` |
| `name` | `VARCHAR(255)` | NOT NULL | — | Официальное название школы |
| `short_name` | `VARCHAR(100)` | NULL | — | Краткое название для отображения в UI (например, «Школа №42») |
| `region` | `VARCHAR(100)` | NOT NULL | — | Область: `tashkent_city`, `tashkent_region`, `samarkand`, `fergana`, `andijan`, `namangan`, `bukhara`, `khorezm`, `kashkadarya`, `surkhandarya`, `syrdarya`, `jizzakh`, `navoi`, `karakalpakstan` |
| `district` | `VARCHAR(100)` | NULL | — | Район внутри области |
| `city` | `VARCHAR(100)` | NULL | — | Город / населённый пункт |
| `address` | `TEXT` | NULL | — | Полный почтовый адрес |
| `school_type` | `VARCHAR(30)` | NOT NULL | `'public'` | `public` (государственная) / `private` (частная) / `specialized` (лицей, гимназия) |
| `subscription_plan` | `VARCHAR(30)` | NOT NULL | `'freemium'` | `freemium` / `basic` / `standard` / `enterprise` / `government` |
| `plan_started_at` | `TIMESTAMPTZ` | NULL | — | Дата начала текущего плана |
| `plan_expires_at` | `TIMESTAMPTZ` | NULL | — | Дата окончания (NULL = бессрочно / freemium) |
| `max_teachers` | `INTEGER` | NOT NULL | `5` | Лимит учителей по плану |
| `max_students` | `INTEGER` | NOT NULL | `150` | Лимит учеников по плану |
| `director_user_id` | `VARCHAR(50)` | NULL | — | FK → `users.id`. Директор школы. NULL до назначения |
| `roно_district_id` | `VARCHAR(50)` | NULL | — | FK → `roно_districts.id`. Для привязки к РОНО |
| `moderation_status` | `VARCHAR(20)` | NOT NULL | `'approved'` | `approved` / `pending` (новая школа от учителя) / `suspended` |
| `logo_url` | `TEXT` | NULL | — | URL логотипа для PDF-отчётов |
| `timezone` | `VARCHAR(50)` | NOT NULL | `'Asia/Tashkent'` | Часовой пояс школы |
| `language` | `VARCHAR(5)` | NOT NULL | `'uz'` | Основной язык: `uz` / `ru` |
| `created_at` | `TIMESTAMPTZ` | NOT NULL | `NOW()` | Дата создания записи |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | `NOW()` | Дата последнего обновления |

### Индексы

| Индекс | Тип | Колонки | Причина |
|---|---|---|---|
| `schools_pkey` | PRIMARY KEY | `id` | Основной идентификатор |
| `idx_schools_region` | B-tree | `region` | Фильтрация РОНО-инспектором по региону |
| `idx_schools_district` | B-tree | `district` | Фильтрация по району для дашборда РОНО |
| `idx_schools_plan` | B-tree | `subscription_plan, plan_expires_at` | Поиск школ с истекающей подпиской (cron-job уведомлений) |
| `idx_schools_moderation` | B-tree | `moderation_status` | Очередь модерации новых школ (admin panel) |

### Связи

| FK | Ссылается на | Тип | ON DELETE |
|---|---|---|---|
| `director_user_id` | `users.id` | Many-to-One | SET NULL |
| `roно_district_id` | `roно_districts.id` | Many-to-One | SET NULL |

### Бизнес-ограничения

```sql
ALTER TABLE schools ADD CONSTRAINT chk_schools_plan
  CHECK (subscription_plan IN ('freemium','basic','standard','enterprise','government'));

ALTER TABLE schools ADD CONSTRAINT chk_schools_type
  CHECK (school_type IN ('public','private','specialized'));

ALTER TABLE schools ADD CONSTRAINT chk_schools_moderation
  CHECK (moderation_status IN ('approved','pending','suspended'));

ALTER TABLE schools ADD CONSTRAINT chk_schools_limits
  CHECK (max_teachers > 0 AND max_students > 0);

ALTER TABLE schools ADD CONSTRAINT chk_schools_plan_dates
  CHECK (plan_expires_at IS NULL OR plan_expires_at > plan_started_at);
```

- Freemium: `max_teachers = 5`, `max_students = 150` — устанавливается автоматически при создании
- `suspended`: школа не может логиниться, данные сохраняются 90 дней перед удалением
- `director_user_id` может быть NULL: директор не обязателен для работы (учителя могут работать без него)

---

## 2. users

Единая таблица пользователей для всех ролей. Роль определяет доступные поля и поведение RLS.

### Колонки

| Колонка | Тип | Nullable | По умолчанию | Описание |
|---|---|---|---|---|
| `id` | `VARCHAR(50)` | NOT NULL | `'usr_' \|\| nanoid(10)` | PK. Например: `usr_abc123xyz` |
| `school_id` | `VARCHAR(50)` | NULL | — | FK → `schools.id`. NULL только для `inspector` и `ministry` |
| `role` | `VARCHAR(20)` | NOT NULL | — | `student` / `teacher` / `director` / `parent` / `inspector` / `ministry` |
| `full_name` | `VARCHAR(255)` | NOT NULL | — | ФИО пользователя. Мин. 5, макс. 255 символов |
| `email` | `VARCHAR(255)` | NULL | — | Email. Уникален глобально (если не NULL) |
| `email_verified` | `BOOLEAN` | NOT NULL | `FALSE` | Верификация email |
| `phone` | `VARCHAR(20)` | NULL | — | Номер телефона. Формат: +998XXXXXXXXX |
| `phone_verified` | `BOOLEAN` | NOT NULL | `FALSE` | Верификация телефона через SMS |
| `password_hash` | `VARCHAR(255)` | NULL | — | bcrypt hash (cost 12). NULL если вход только через Telegram |
| `telegram_id` | `BIGINT` | NULL | — | Telegram User ID. Уникален глобально (если не NULL) |
| `telegram_username` | `VARCHAR(100)` | NULL | — | @username в Telegram (без @) |
| `avatar_url` | `TEXT` | NULL | — | URL аватарки на CDN |
| `language` | `VARCHAR(5)` | NOT NULL | `'uz'` | Предпочитаемый язык: `uz` / `ru` |
| `status` | `VARCHAR(20)` | NOT NULL | `'active'` | `active` / `inactive` / `blocked` |
| `blocked_at` | `TIMESTAMPTZ` | NULL | — | Дата блокировки |
| `blocked_reason` | `TEXT` | NULL | — | Причина блокировки (admin note) |
| `last_login_at` | `TIMESTAMPTZ` | NULL | — | Последний успешный вход |
| `last_active_at` | `TIMESTAMPTZ` | NULL | — | Последнее обращение к API |
| `created_at` | `TIMESTAMPTZ` | NOT NULL | `NOW()` | Дата регистрации |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | `NOW()` | Дата обновления профиля |

### Дополнительные поля по ролям (в отдельных таблицах)

> Специфичные для роли атрибуты вынесены в отдельные таблицы 1:1 для чистоты схемы:

- `teacher_profiles` (subjects[], grades[], display_name_marketplace)
- `student_profiles` (class_id, grade, parent_code)
- `parent_profiles` (child_user_id)
- `inspector_profiles` (district_ids[])

### Индексы

| Индекс | Тип | Колонки | Причина |
|---|---|---|---|
| `users_pkey` | PRIMARY KEY | `id` | — |
| `idx_users_school_role` | B-tree | `school_id, role` | Основной запрос: пользователи школы по роли |
| `idx_users_email` | UNIQUE B-tree | `email` | WHERE email NOT NULL (partial index) |
| `idx_users_phone` | UNIQUE B-tree | `phone` | WHERE phone NOT NULL |
| `idx_users_telegram_id` | UNIQUE B-tree | `telegram_id` | WHERE telegram_id NOT NULL |
| `idx_users_school_active` | B-tree | `school_id, status, last_active_at` | Дашборд директора: активные пользователи |
| `idx_users_created_at` | B-tree | `created_at DESC` | Аналитика роста платформы |

```sql
-- Partial unique indexes (NULL не нарушает уникальность, но дубли запрещены)
CREATE UNIQUE INDEX idx_users_email ON users(email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX idx_users_phone ON users(phone) WHERE phone IS NOT NULL;
CREATE UNIQUE INDEX idx_users_telegram_id ON users(telegram_id) WHERE telegram_id IS NOT NULL;
```

### Связи

| FK | Ссылается на | Тип | ON DELETE |
|---|---|---|---|
| `school_id` | `schools.id` | Many-to-One | RESTRICT (нельзя удалить школу с пользователями) |

### Бизнес-ограничения

```sql
ALTER TABLE users ADD CONSTRAINT chk_users_role
  CHECK (role IN ('student','teacher','director','parent','inspector','ministry'));

ALTER TABLE users ADD CONSTRAINT chk_users_status
  CHECK (status IN ('active','inactive','blocked'));

ALTER TABLE users ADD CONSTRAINT chk_users_school_required
  CHECK (
    (role IN ('student','teacher','director','parent') AND school_id IS NOT NULL)
    OR
    (role IN ('inspector','ministry') AND school_id IS NULL)
  );

ALTER TABLE users ADD CONSTRAINT chk_users_auth_method
  CHECK (password_hash IS NOT NULL OR telegram_id IS NOT NULL);

ALTER TABLE users ADD CONSTRAINT chk_users_phone_format
  CHECK (phone IS NULL OR phone ~ '^\+998[0-9]{9}$');

ALTER TABLE users ADD CONSTRAINT chk_users_blocked_consistency
  CHECK ((status = 'blocked') = (blocked_at IS NOT NULL));
```

- Хотя бы один метод входа обязателен: `password_hash` или `telegram_id`
- `school_id` обязателен для school-уровневых ролей, запрещён для `inspector`/`ministry`
- При `status = blocked`: `blocked_at` и `blocked_reason` должны быть заполнены

---

## 3. classes

Класс — группа учеников под руководством учителя. Один учитель может вести несколько классов. Один класс может иметь несколько учителей (через `class_teachers`).

### Колонки

| Колонка | Тип | Nullable | По умолчанию | Описание |
|---|---|---|---|---|
| `id` | `VARCHAR(50)` | NOT NULL | `'cls_' \|\| nanoid(10)` | PK |
| `school_id` | `VARCHAR(50)` | NOT NULL | — | FK → `schools.id`. Обязателен (RLS) |
| `teacher_id` | `VARCHAR(50)` | NOT NULL | — | FK → `users.id`. Основной учитель класса |
| `name` | `VARCHAR(50)` | NOT NULL | — | Название: «9-Б», «10-А» и т.д. |
| `grade` | `SMALLINT` | NOT NULL | — | Параллель: 1–11 |
| `subject` | `VARCHAR(50)` | NULL | — | Предмет учителя в этом классе. NULL если учитель ведёт несколько предметов |
| `academic_year` | `VARCHAR(9)` | NOT NULL | — | Учебный год: «2025-2026» |
| `student_count` | `INTEGER` | NOT NULL | `0` | Денормализованный счётчик учеников. Обновляется триггером |
| `is_archived` | `BOOLEAN` | NOT NULL | `FALSE` | Архивный класс (прошедший учебный год) |
| `archived_at` | `TIMESTAMPTZ` | NULL | — | Дата архивирования |
| `created_at` | `TIMESTAMPTZ` | NOT NULL | `NOW()` | — |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | `NOW()` | — |

### Индексы

| Индекс | Тип | Колонки | Причина |
|---|---|---|---|
| `classes_pkey` | PRIMARY KEY | `id` | — |
| `idx_classes_school` | B-tree | `school_id, is_archived` | Список классов школы (исключая архивные) |
| `idx_classes_teacher` | B-tree | `teacher_id, school_id` | Классы конкретного учителя |
| `idx_classes_grade_year` | B-tree | `school_id, grade, academic_year` | Фильтрация по параллели и году |

### Связи

| FK | Ссылается на | Тип | ON DELETE |
|---|---|---|---|
| `school_id` | `schools.id` | Many-to-One | RESTRICT |
| `teacher_id` | `users.id` | Many-to-One | RESTRICT |

### Бизнес-ограничения

```sql
ALTER TABLE classes ADD CONSTRAINT chk_classes_grade
  CHECK (grade BETWEEN 1 AND 11);

ALTER TABLE classes ADD CONSTRAINT chk_classes_year_format
  CHECK (academic_year ~ '^[0-9]{4}-[0-9]{4}$');

ALTER TABLE classes ADD CONSTRAINT chk_classes_student_count
  CHECK (student_count >= 0);

ALTER TABLE classes ADD CONSTRAINT chk_classes_archived_consistency
  CHECK ((is_archived = TRUE) = (archived_at IS NOT NULL));

-- Уникальность: в одной школе не может быть двух классов «9-Б» у одного учителя в одном году
CREATE UNIQUE INDEX uq_classes_teacher_name_year
  ON classes(school_id, teacher_id, name, academic_year)
  WHERE is_archived = FALSE;
```

- `student_count` обновляется триггером при INSERT/DELETE в `class_students`
- Архивирование: класс архивируется в конце учебного года, данные сохраняются навсегда

---

## 4. class_students

Связующая таблица «многие-ко-многим» между учениками и классами. Вынесена отдельно, чтобы поддерживать перевод ученика между классами с сохранением истории.

### Колонки

| Колонка | Тип | Nullable | По умолчанию | Описание |
|---|---|---|---|---|
| `id` | `BIGSERIAL` | NOT NULL | — | PK |
| `class_id` | `VARCHAR(50)` | NOT NULL | — | FK → `classes.id` |
| `student_id` | `VARCHAR(50)` | NOT NULL | — | FK → `users.id` (role = student) |
| `school_id` | `VARCHAR(50)` | NOT NULL | — | Денормализовано для RLS |
| `enrolled_at` | `TIMESTAMPTZ` | NOT NULL | `NOW()` | Дата зачисления в класс |
| `left_at` | `TIMESTAMPTZ` | NULL | — | Дата выхода из класса (NULL = активен) |
| `left_reason` | `VARCHAR(50)` | NULL | — | `transferred` / `graduated` / `expelled` / `other` |

### Индексы

| Индекс | Тип | Колонки | Причина |
|---|---|---|---|
| `class_students_pkey` | PRIMARY KEY | `id` | — |
| `uq_class_students_active` | UNIQUE | `class_id, student_id` | WHERE `left_at IS NULL` — один активный класс на ученика |
| `idx_class_students_student` | B-tree | `student_id, left_at` | История классов ученика |
| `idx_class_students_class` | B-tree | `class_id, left_at` | Список учеников класса |
| `idx_class_students_school` | B-tree | `school_id` | RLS + аналитика по школе |

### Бизнес-ограничения

```sql
-- Ученик не может быть в двух активных классах одновременно
CREATE UNIQUE INDEX uq_class_students_active
  ON class_students(student_id)
  WHERE left_at IS NULL;
```

---

## 5. tests

Тест как шаблон. Не содержит данных о конкретных прохождениях (они в `test_sessions`). Один тест может быть назначен нескольким классам.

### Колонки

| Колонка | Тип | Nullable | По умолчанию | Описание |
|---|---|---|---|---|
| `id` | `VARCHAR(50)` | NOT NULL | `'tst_' \|\| nanoid(10)` | PK |
| `school_id` | `VARCHAR(50)` | NOT NULL | — | FK → `schools.id`. Обязателен (RLS) |
| `teacher_id` | `VARCHAR(50)` | NOT NULL | — | FK → `users.id`. Автор теста |
| `title` | `VARCHAR(255)` | NOT NULL | — | Название теста. 3–255 символов |
| `description` | `TEXT` | NULL | — | Описание / инструкция для ученика |
| `subject` | `VARCHAR(50)` | NOT NULL | — | `mathematics`, `physics`, `chemistry` и др. |
| `grade` | `SMALLINT` | NOT NULL | — | Целевая параллель: 1–11 |
| `type` | `VARCHAR(30)` | NOT NULL | — | `control` / `homework` / `olympiad` / `ntt_format` |
| `mode` | `VARCHAR(20)` | NOT NULL | `'standard'` | `standard` / `ntt_simulator` / `practice` |
| `language` | `VARCHAR(5)` | NOT NULL | `'uz'` | `uz` / `ru` |
| `time_limit_minutes` | `SMALLINT` | NULL | — | NULL = без ограничения. 1–300 минут |
| `pass_threshold_percent` | `SMALLINT` | NOT NULL | `70` | Порог зачёта: 0–100 |
| `issue_certificate` | `BOOLEAN` | NOT NULL | `FALSE` | Выдавать сертификат при прохождении порога |
| `show_answers` | `VARCHAR(20)` | NOT NULL | `'after_deadline'` | `immediately` / `after_deadline` / `never` |
| `shuffle_questions` | `BOOLEAN` | NOT NULL | `TRUE` | Перемешивать вопросы для каждого ученика |
| `shuffle_answers` | `BOOLEAN` | NOT NULL | `TRUE` | Перемешивать варианты ответов |
| `question_count` | `SMALLINT` | NOT NULL | `0` | Денормализованный счётчик. Обновляется триггером |
| `status` | `VARCHAR(20)` | NOT NULL | `'draft'` | `draft` / `published` / `archived` |
| `marketplace_id` | `VARCHAR(50)` | NULL | — | FK → `marketplace_tests.id`. NULL если не в маркетплейсе |
| `copied_from_test_id` | `VARCHAR(50)` | NULL | — | FK → `tests.id`. NULL если оригинал, иначе — ID источника |
| `ai_generated` | `BOOLEAN` | NOT NULL | `FALSE` | Вопросы сгенерированы AI |
| `created_at` | `TIMESTAMPTZ` | NOT NULL | `NOW()` | — |
| `published_at` | `TIMESTAMPTZ` | NULL | — | Дата публикации |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | `NOW()` | — |

### Индексы

| Индекс | Тип | Колонки | Причина |
|---|---|---|---|
| `tests_pkey` | PRIMARY KEY | `id` | — |
| `idx_tests_school_teacher` | B-tree | `school_id, teacher_id, status` | Библиотека тестов учителя |
| `idx_tests_school_subject` | B-tree | `school_id, subject, grade` | Фильтрация по предмету и параллели |
| `idx_tests_status_published` | B-tree | `status, published_at DESC` | WHERE `status = 'published'` — активные тесты |
| `idx_tests_marketplace` | B-tree | `marketplace_id` | WHERE `marketplace_id IS NOT NULL` — тесты в маркетплейсе |
| `idx_tests_subject_grade` | B-tree | `subject, grade` | Поиск тестов по предмету и классу (маркетплейс) |

### Связи

| FK | Ссылается на | Тип | ON DELETE |
|---|---|---|---|
| `school_id` | `schools.id` | Many-to-One | RESTRICT |
| `teacher_id` | `users.id` | Many-to-One | RESTRICT |
| `copied_from_test_id` | `tests.id` | Self-referencing | SET NULL |

### Бизнес-ограничения

```sql
ALTER TABLE tests ADD CONSTRAINT chk_tests_subject
  CHECK (subject IN ('mathematics','physics','chemistry','history','biology',
    'literature','english','russian','uzbek','geography','informatics','other'));

ALTER TABLE tests ADD CONSTRAINT chk_tests_type
  CHECK (type IN ('control','homework','olympiad','ntt_format'));

ALTER TABLE tests ADD CONSTRAINT chk_tests_mode
  CHECK (mode IN ('standard','ntt_simulator','practice'));

ALTER TABLE tests ADD CONSTRAINT chk_tests_show_answers
  CHECK (show_answers IN ('immediately','after_deadline','never'));

ALTER TABLE tests ADD CONSTRAINT chk_tests_status
  CHECK (status IN ('draft','published','archived'));

ALTER TABLE tests ADD CONSTRAINT chk_tests_grade
  CHECK (grade BETWEEN 1 AND 11);

ALTER TABLE tests ADD CONSTRAINT chk_tests_threshold
  CHECK (pass_threshold_percent BETWEEN 0 AND 100);

ALTER TABLE tests ADD CONSTRAINT chk_tests_time_limit
  CHECK (time_limit_minutes IS NULL OR time_limit_minutes BETWEEN 1 AND 300);

-- NTT-формат: жёсткие ограничения
ALTER TABLE tests ADD CONSTRAINT chk_tests_ntt_time
  CHECK (type != 'ntt_format' OR time_limit_minutes = 90);
```

---

## 6. questions

Вопросы теста. Варианты ответов хранятся в JSONB для гибкости (разные типы вопросов в будущем). Правильный ответ хранится отдельно для быстрой проверки.

### Колонки

| Колонка | Тип | Nullable | По умолчанию | Описание |
|---|---|---|---|---|
| `id` | `VARCHAR(50)` | NOT NULL | `'q_' \|\| nanoid(10)` | PK |
| `test_id` | `VARCHAR(50)` | NOT NULL | — | FK → `tests.id` |
| `school_id` | `VARCHAR(50)` | NOT NULL | — | Денормализовано. FK → `schools.id`. Обязателен (RLS) |
| `position` | `SMALLINT` | NOT NULL | — | Порядковый номер в тесте: 1-based |
| `type` | `VARCHAR(20)` | NOT NULL | `'mcq'` | `mcq` (4 варианта) / `true_false` / `open` (на будущее) |
| `text` | `TEXT` | NOT NULL | — | Текст вопроса. Поддерживает LaTeX `$...$` и `$$...$$` |
| `image_url` | `TEXT` | NULL | — | URL изображения к вопросу (на CDN) |
| `options_json` | `JSONB` | NOT NULL | `'[]'` | Массив вариантов ответа. Структура см. ниже |
| `correct_answer_id` | `VARCHAR(20)` | NOT NULL | — | ID правильного варианта из `options_json` |
| `explanation` | `TEXT` | NULL | — | Объяснение правильного ответа. Показывается после теста |
| `topic` | `VARCHAR(100)` | NULL | — | Тег темы из таксономии предмета (например, `quadratic_equations`) |
| `difficulty` | `VARCHAR(10)` | NOT NULL | `'medium'` | `easy` / `medium` / `hard` |
| `points` | `SMALLINT` | NOT NULL | `1` | Баллы за правильный ответ (для взвешенных тестов) |
| `ai_generated` | `BOOLEAN` | NOT NULL | `FALSE` | Вопрос создан AI |
| `created_at` | `TIMESTAMPTZ` | NOT NULL | `NOW()` | — |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | `NOW()` | — |

### Структура `options_json`

```json
[
  { "id": "a_001", "text": "x = 2 и x = 3" },
  { "id": "a_002", "text": "x = -2 и x = -3" },
  { "id": "a_003", "text": "x = 1 и x = 6" },
  { "id": "a_004", "text": "x = 2 и x = -3" }
]
```

- `id` — уникален в пределах вопроса, формат `a_NNN`
- `text` — текст варианта, поддерживает LaTeX
- `correct_answer_id` ссылается на один из `id` в этом массиве

### Индексы

| Индекс | Тип | Колонки | Причина |
|---|---|---|---|
| `questions_pkey` | PRIMARY KEY | `id` | — |
| `idx_questions_test` | B-tree | `test_id, position` | Вопросы теста в порядке позиции |
| `idx_questions_school` | B-tree | `school_id` | RLS + аналитика по школе |
| `idx_questions_topic` | B-tree | `school_id, topic` | WHERE `topic IS NOT NULL` — аналитика слабых тем |
| `idx_questions_difficulty` | B-tree | `test_id, difficulty` | Статистика сложности теста |
| `idx_questions_options` | GIN | `options_json` | Поиск по тексту вариантов (редкий, но нужен для дедупликации) |

### Связи

| FK | Ссылается на | Тип | ON DELETE |
|---|---|---|---|
| `test_id` | `tests.id` | Many-to-One | CASCADE (удаление теста удаляет вопросы) |
| `school_id` | `schools.id` | Many-to-One | RESTRICT |

### Бизнес-ограничения

```sql
ALTER TABLE questions ADD CONSTRAINT chk_questions_type
  CHECK (type IN ('mcq','true_false','open'));

ALTER TABLE questions ADD CONSTRAINT chk_questions_difficulty
  CHECK (difficulty IN ('easy','medium','hard'));

ALTER TABLE questions ADD CONSTRAINT chk_questions_position
  CHECK (position >= 1);

ALTER TABLE questions ADD CONSTRAINT chk_questions_points
  CHECK (points BETWEEN 1 AND 10);

-- MCQ: ровно 4 варианта
ALTER TABLE questions ADD CONSTRAINT chk_questions_mcq_options
  CHECK (type != 'mcq' OR jsonb_array_length(options_json) = 4);

-- True/False: ровно 2 варианта
ALTER TABLE questions ADD CONSTRAINT chk_questions_tf_options
  CHECK (type != 'true_false' OR jsonb_array_length(options_json) = 2);
```

- `correct_answer_id` верифицируется триггером: должен присутствовать в `options_json[*].id`
- Максимум вопросов в тесте: проверяется на уровне приложения (30 для Freemium, 60 для платных)
- Позиции должны быть уникальны в пределах теста: `UNIQUE(test_id, position)`

---

## 7. test_assignments

Связь теста с классом. Один тест может быть назначен нескольким классам с разными дедлайнами.

### Колонки

| Колонка | Тип | Nullable | По умолчанию | Описание |
|---|---|---|---|---|
| `id` | `VARCHAR(50)` | NOT NULL | `'asgn_' \|\| nanoid(10)` | PK |
| `test_id` | `VARCHAR(50)` | NOT NULL | — | FK → `tests.id` |
| `class_id` | `VARCHAR(50)` | NOT NULL | — | FK → `classes.id` |
| `school_id` | `VARCHAR(50)` | NOT NULL | — | Денормализовано для RLS |
| `assigned_by` | `VARCHAR(50)` | NOT NULL | — | FK → `users.id`. Кто назначил |
| `deadline` | `TIMESTAMPTZ` | NOT NULL | — | Дедлайн сдачи теста |
| `status` | `VARCHAR(20)` | NOT NULL | `'active'` | `active` / `completed` / `cancelled` |
| `notifications_sent` | `BOOLEAN` | NOT NULL | `FALSE` | Уведомления ученикам отправлены |
| `created_at` | `TIMESTAMPTZ` | NOT NULL | `NOW()` | — |

### Индексы

| Индекс | Тип | Колонки | Причина |
|---|---|---|---|
| `test_assignments_pkey` | PRIMARY KEY | `id` | — |
| `uq_test_assignment` | UNIQUE | `test_id, class_id` | Один тест — одно назначение на класс |
| `idx_assignments_class` | B-tree | `class_id, deadline` | Активные тесты класса (Home-страница ученика) |
| `idx_assignments_test` | B-tree | `test_id, status` | Статус назначений теста |
| `idx_assignments_deadline` | B-tree | `deadline` | WHERE `status = 'active'` — cron напоминаний |
| `idx_assignments_school` | B-tree | `school_id` | RLS |

### Бизнес-ограничения

```sql
ALTER TABLE test_assignments ADD CONSTRAINT chk_assignments_status
  CHECK (status IN ('active','completed','cancelled'));

ALTER TABLE test_assignments ADD CONSTRAINT chk_assignments_deadline_future
  CHECK (deadline > created_at + INTERVAL '30 minutes');
```

---

## 8. test_sessions

Сессия прохождения теста конкретным учеником. Создаётся при старте, завершается явно или по таймеру.

### Колонки

| Колонка | Тип | Nullable | По умолчанию | Описание |
|---|---|---|---|---|
| `id` | `VARCHAR(50)` | NOT NULL | `'sess_' \|\| nanoid(10)` | PK |
| `test_id` | `VARCHAR(50)` | NOT NULL | — | FK → `tests.id` |
| `assignment_id` | `VARCHAR(50)` | NOT NULL | — | FK → `test_assignments.id` |
| `student_id` | `VARCHAR(50)` | NOT NULL | — | FK → `users.id` (role = student) |
| `school_id` | `VARCHAR(50)` | NOT NULL | — | Денормализовано для RLS и партиционирования |
| `question_order` | `JSONB` | NOT NULL | — | Персональный порядок вопросов: `["q_014","q_003","q_022"]` |
| `answer_shuffles` | `JSONB` | NOT NULL | `'{}'` | Порядок вариантов ответа для каждого вопроса: `{"q_014": ["a_002","a_001","a_003","a_004"]}` |
| `started_at` | `TIMESTAMPTZ` | NOT NULL | `NOW()` | Время старта |
| `expires_at` | `TIMESTAMPTZ` | NOT NULL | — | `started_at + time_limit_minutes`. Время автозавершения |
| `completed_at` | `TIMESTAMPTZ` | NULL | — | Время завершения (NULL = в процессе) |
| `status` | `VARCHAR(20)` | NOT NULL | `'in_progress'` | `in_progress` / `completed` / `expired` / `abandoned` |
| `completion_type` | `VARCHAR(20)` | NULL | — | `manual` (ученик нажал «Завершить») / `timeout` / `admin_force` |
| `score_correct` | `SMALLINT` | NULL | — | Число правильных ответов. NULL до завершения |
| `score_total` | `SMALLINT` | NULL | — | Всего вопросов в тесте (фиксируется при старте) |
| `score_percent` | `NUMERIC(5,2)` | NULL | — | Процент: `score_correct / score_total * 100`. NULL до завершения |
| `passed` | `BOOLEAN` | NULL | — | `score_percent >= pass_threshold_percent`. NULL до завершения |
| `device_type` | `VARCHAR(20)` | NULL | — | `web` / `mobile` / `telegram`. Для аналитики |
| `ip_address` | `INET` | NULL | — | IP-адрес ученика при старте |
| `tab_switches` | `SMALLINT` | NOT NULL | `0` | Число переключений вкладок/окон (для анализа нечестности) |
| `created_at` | `TIMESTAMPTZ` | NOT NULL | `NOW()` | — |

### Индексы

| Индекс | Тип | Колонки | Причина |
|---|---|---|---|
| `test_sessions_pkey` | PRIMARY KEY | `id` | — |
| `uq_session_student_assignment` | UNIQUE | `student_id, assignment_id` | Один ученик — одна сессия на назначение |
| `idx_sessions_student_test` | B-tree | `student_id, test_id` | **Критический:** история прохождений ученика |
| `idx_sessions_test_status` | B-tree | `test_id, status` | **Критический:** прогресс прохождения теста (Class Results) |
| `idx_sessions_school_student` | B-tree | `school_id, student_id, completed_at` | RLS + портфолио ученика |
| `idx_sessions_expires_active` | B-tree | `expires_at` | WHERE `status = 'in_progress'` — cron автозавершения |
| `idx_sessions_assignment` | B-tree | `assignment_id, status` | Прогресс назначения |

### Связи

| FK | Ссылается на | Тип | ON DELETE |
|---|---|---|---|
| `test_id` | `tests.id` | Many-to-One | RESTRICT |
| `assignment_id` | `test_assignments.id` | Many-to-One | RESTRICT |
| `student_id` | `users.id` | Many-to-One | RESTRICT |
| `school_id` | `schools.id` | Many-to-One | RESTRICT |

### Бизнес-ограничения

```sql
ALTER TABLE test_sessions ADD CONSTRAINT chk_sessions_status
  CHECK (status IN ('in_progress','completed','expired','abandoned'));

ALTER TABLE test_sessions ADD CONSTRAINT chk_sessions_completion_type
  CHECK (completion_type IS NULL OR completion_type IN ('manual','timeout','admin_force'));

ALTER TABLE test_sessions ADD CONSTRAINT chk_sessions_score_range
  CHECK (score_percent IS NULL OR score_percent BETWEEN 0 AND 100);

ALTER TABLE test_sessions ADD CONSTRAINT chk_sessions_completion_consistency
  CHECK (
    (status = 'in_progress' AND completed_at IS NULL AND score_percent IS NULL)
    OR
    (status IN ('completed','expired','abandoned') AND completed_at IS NOT NULL)
  );

ALTER TABLE test_sessions ADD CONSTRAINT chk_sessions_expires
  CHECK (expires_at > started_at);
```

---

## 9. answers

⚡ **Самая большая таблица в системе.** При 1000 школах × 500 учеников × 10 тестов/месяц × 25 вопросов = **125 миллионов записей в месяц.** Партиционирование обязательно с первого дня.

### Колонки

| Колонка | Тип | Nullable | По умолчанию | Описание |
|---|---|---|---|---|
| `id` | `BIGSERIAL` | NOT NULL | — | PK (внутри партиции) |
| `session_id` | `VARCHAR(50)` | NOT NULL | — | FK → `test_sessions.id` |
| `question_id` | `VARCHAR(50)` | NOT NULL | — | FK → `questions.id` |
| `student_id` | `VARCHAR(50)` | NOT NULL | — | Денормализовано. FK → `users.id` |
| `school_id` | `VARCHAR(50)` | NOT NULL | — | **Ключ партиционирования.** FK → `schools.id` |
| `test_id` | `VARCHAR(50)` | NOT NULL | — | Денормализовано. FK → `tests.id` |
| `subject` | `VARCHAR(50)` | NOT NULL | — | Денормализовано из `tests.subject` — для индекса аналитики |
| `answer_given` | `VARCHAR(20)` | NULL | — | ID выбранного варианта из `options_json`. NULL = пропустил |
| `is_correct` | `BOOLEAN` | NOT NULL | — | Правильность ответа (вычисляется сразу при сохранении) |
| `time_spent_seconds` | `SMALLINT` | NULL | — | Секунд на вопрос (клиентское время) |
| `answered_at` | `TIMESTAMPTZ` | NOT NULL | — | Клиентское время ответа |
| `server_answered_at` | `TIMESTAMPTZ` | NOT NULL | `NOW()` | Серверное время сохранения |
| `attempt_number` | `SMALLINT` | NOT NULL | `1` | Номер попытки (при перевыборе ответа в рамках сессии) |
| `created_at` | `TIMESTAMPTZ` | NOT NULL | `NOW()` | Партиционный ключ по времени |

### Индексы

> ⚠️ Индексы создаются **на каждой партиции** автоматически через `CREATE INDEX ON answers_...` или через `PARTITION OF` + наследуемые индексы.

| Индекс | Тип | Колонки | Причина |
|---|---|---|---|
| `answers_pkey` | PRIMARY KEY | `id, school_id` | Составной PK для партиционирования |
| `idx_answers_student_created` | B-tree | `student_id, created_at` | **Критический:** портфолио ученика, история |
| `idx_answers_test_created` | B-tree | `test_id, created_at` | **Критический:** результаты теста, тепловая карта |
| `idx_answers_school_subject` | B-tree | `school_id, subject` | **Критический:** аналитика слабых тем по школе |
| `idx_answers_session` | B-tree | `session_id, question_id` | Результаты сессии, проверка дублей |
| `idx_answers_question_correct` | B-tree | `question_id, is_correct` | Статистика правильности по вопросу |

### Связи

| FK | Ссылается на | Тип | ON DELETE |
|---|---|---|---|
| `session_id` | `test_sessions.id` | Many-to-One | CASCADE |
| `question_id` | `questions.id` | Many-to-One | RESTRICT |
| `student_id` | `users.id` | Many-to-One | RESTRICT |
| `school_id` | `schools.id` | Many-to-One | RESTRICT |
| `test_id` | `tests.id` | Many-to-One | RESTRICT |

### Бизнес-ограничения

```sql
ALTER TABLE answers ADD CONSTRAINT chk_answers_attempt
  CHECK (attempt_number >= 1);

ALTER TABLE answers ADD CONSTRAINT chk_answers_time_spent
  CHECK (time_spent_seconds IS NULL OR time_spent_seconds BETWEEN 0 AND 3600);

-- Последний ответ на вопрос в сессии (при перевыборе — обновляется attempt_number)
-- Уникальность только для текущей попытки:
CREATE UNIQUE INDEX uq_answers_session_question_attempt
  ON answers(session_id, question_id, attempt_number);
```

**Денормализация `subject`:** намеренная. Позволяет индексу `(school_id, subject)` работать без JOIN с `tests`. Поддерживается триггером при INSERT.

---

## 10. analytics_snapshots

Агрегированные метрики для дашбордов. **Единственный источник данных для всех дашбордов.** Прямые агрегации из `answers` в production запрещены.

### Колонки

| Колонка | Тип | Nullable | По умолчанию | Описание |
|---|---|---|---|---|
| `id` | `BIGSERIAL` | NOT NULL | — | PK |
| `entity_type` | `VARCHAR(30)` | NOT NULL | — | Уровень агрегации: `school` / `teacher` / `class` / `student` / `district` / `test` |
| `entity_id` | `VARCHAR(50)` | NOT NULL | — | ID сущности (school_id / user_id / class_id и т.д.) |
| `school_id` | `VARCHAR(50)` | NOT NULL | — | ID школы. Для `district` — первая школа (для RLS: у инспекторов особый RLS) |
| `metric_name` | `VARCHAR(100)` | NOT NULL | — | Название метрики. Примеры ниже |
| `value_numeric` | `NUMERIC(12,4)` | NULL | — | Числовое значение метрики |
| `value_json` | `JSONB` | NULL | — | Сложные метрики (массивы, объекты). NULL если `value_numeric` заполнен |
| `period_type` | `VARCHAR(10)` | NOT NULL | — | `day` / `week` / `month` / `quarter` / `year` / `all_time` |
| `period_start` | `DATE` | NOT NULL | — | Начало периода |
| `period_end` | `DATE` | NOT NULL | — | Конец периода |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | `NOW()` | Время последнего обновления снапшота |

### Каталог метрик

| `metric_name` | `entity_type` | Тип значения | Описание |
|---|---|---|---|
| `avg_score_percent` | school / class / teacher / student | numeric | Средний процент правильных ответов |
| `tests_conducted` | school / teacher / class | numeric | Число проведённых тестов |
| `students_tested` | school / teacher / class | numeric | Число уникальных учеников |
| `pass_rate_percent` | school / class / teacher | numeric | Процент прошедших порог |
| `active_teachers_count` | school | numeric | Активных учителей за период |
| `coverage_percent` | school / class | numeric | Охват (% учеников, прошедших ≥1 теста) |
| `weak_topics` | school / class / teacher | json | Топ-10 слабых тем с процентом ошибок |
| `score_distribution` | school / class | json | Распределение баллов по диапазонам |
| `score_over_time` | school / class / student | json | Динамика среднего балла по датам |
| `ntt_avg_score` | school / student | numeric | Средний балл НТТ-симуляций (из 189) |
| `ntt_simulations_count` | school / student | numeric | Число НТТ-симуляций |
| `student_at_risk_count` | school / class / teacher | numeric | Число учеников в группе риска |
| `certificates_issued` | school / teacher | numeric | Выдано сертификатов за период |

### Индексы

| Индекс | Тип | Колонки | Причина |
|---|---|---|---|
| `analytics_snapshots_pkey` | PRIMARY KEY | `id` | — |
| `uq_snapshot_entity_metric_period` | UNIQUE | `entity_type, entity_id, metric_name, period_type, period_start` | Предотвращает дубли при upsert |
| `idx_snapshots_entity_metric` | B-tree | `entity_type, entity_id, metric_name, period_type` | **Критический:** основной запрос дашборда |
| `idx_snapshots_school_period` | B-tree | `school_id, period_type, period_start DESC` | Дашборд директора: все метрики школы за период |
| `idx_snapshots_updated` | B-tree | `updated_at DESC` | Мониторинг свежести снапшотов |

### Бизнес-ограничения

```sql
ALTER TABLE analytics_snapshots ADD CONSTRAINT chk_snapshots_entity_type
  CHECK (entity_type IN ('school','teacher','class','student','district','test'));

ALTER TABLE analytics_snapshots ADD CONSTRAINT chk_snapshots_period_type
  CHECK (period_type IN ('day','week','month','quarter','year','all_time'));

ALTER TABLE analytics_snapshots ADD CONSTRAINT chk_snapshots_value
  CHECK (value_numeric IS NOT NULL OR value_json IS NOT NULL);

ALTER TABLE analytics_snapshots ADD CONSTRAINT chk_snapshots_period_dates
  CHECK (period_end >= period_start);
```

**Обновление снапшотов:**
- Уровень `student`, `class`, `teacher`: каждые **15 минут** (cron)
- Уровень `school`: каждые **15 минут**
- Уровень `district`: каждые **30 минут**
- Полный пересчёт за исторические периоды (месяц, квартал): раз в сутки в 02:00 Asia/Tashkent

**Upsert-паттерн:**
```sql
INSERT INTO analytics_snapshots (entity_type, entity_id, school_id, metric_name,
  value_numeric, period_type, period_start, period_end, updated_at)
VALUES (...)
ON CONFLICT (entity_type, entity_id, metric_name, period_type, period_start)
DO UPDATE SET
  value_numeric = EXCLUDED.value_numeric,
  value_json = EXCLUDED.value_json,
  updated_at = NOW();
```

---

## 11. certificates

Сертификаты, выданные ученикам за прохождение тестов с результатом выше порога.

### Колонки

| Колонка | Тип | Nullable | По умолчанию | Описание |
|---|---|---|---|---|
| `id` | `VARCHAR(50)` | NOT NULL | `'cert_' \|\| nanoid(12)` | PK. Используется в verify URL |
| `student_id` | `VARCHAR(50)` | NOT NULL | — | FK → `users.id` |
| `test_id` | `VARCHAR(50)` | NOT NULL | — | FK → `tests.id` |
| `session_id` | `VARCHAR(50)` | NOT NULL | — | FK → `test_sessions.id`. Одна сессия — один сертификат |
| `school_id` | `VARCHAR(50)` | NOT NULL | — | Денормализовано. FK → `schools.id` |
| `student_name` | `VARCHAR(255)` | NOT NULL | — | Денормализовано. ФИО ученика на момент выдачи |
| `test_title` | `VARCHAR(255)` | NOT NULL | — | Денормализовано. Название теста |
| `subject` | `VARCHAR(50)` | NOT NULL | — | Предмет |
| `school_name` | `VARCHAR(255)` | NOT NULL | — | Денормализовано. Название школы |
| `score_percent` | `NUMERIC(5,2)` | NOT NULL | — | Результат в % |
| `score_correct` | `SMALLINT` | NOT NULL | — | Правильных ответов |
| `score_total` | `SMALLINT` | NOT NULL | — | Всего вопросов |
| `issued_at` | `TIMESTAMPTZ` | NOT NULL | `NOW()` | Дата выдачи |
| `pdf_url` | `TEXT` | NULL | — | URL PDF-файла на R2. NULL до генерации |
| `pdf_generated_at` | `TIMESTAMPTZ` | NULL | — | Время генерации PDF |
| `qr_code_url` | `TEXT` | NULL | — | URL QR-кода на CDN. QR ведёт на `zedly.uz/verify/{id}` |
| `verify_url` | `TEXT` | NOT NULL | — | Публичная ссылка верификации: `https://zedly.uz/verify/{id}` |
| `is_revoked` | `BOOLEAN` | NOT NULL | `FALSE` | Отозван (если тест был аннулирован) |
| `revoked_at` | `TIMESTAMPTZ` | NULL | — | Дата отзыва |
| `revoke_reason` | `TEXT` | NULL | — | Причина отзыва |

### Индексы

| Индекс | Тип | Колонки | Причина |
|---|---|---|---|
| `certificates_pkey` | PRIMARY KEY | `id` | — |
| `uq_certificate_session` | UNIQUE | `session_id` | Одна сессия — один сертификат |
| `idx_certificates_student` | B-tree | `student_id, issued_at DESC` | Портфолио ученика |
| `idx_certificates_school` | B-tree | `school_id, issued_at DESC` | Аналитика директора |
| `idx_certificates_verify` | B-tree | `id, is_revoked` | Верификация: `GET /verify/{id}` — очень частый запрос |

### Бизнес-ограничения

```sql
ALTER TABLE certificates ADD CONSTRAINT chk_cert_score
  CHECK (score_percent BETWEEN 0 AND 100 AND score_correct <= score_total);

ALTER TABLE certificates ADD CONSTRAINT chk_cert_revoke_consistency
  CHECK ((is_revoked = TRUE) = (revoked_at IS NOT NULL));
```

- Денормализация полей (`student_name`, `test_title`, `school_name`): намеренная. Сертификат должен отображаться корректно даже после переименования теста или смены школы.
- `verify_url` — публичная страница без авторизации. Возвращает: имя ученика, тест, дата, балл, статус (valid/revoked).

---

## 12. audit_logs

Полный аудит всех значимых действий в системе. Только INSERT, никогда не UPDATE/DELETE. Используется для безопасности, отладки и compliance.

### Колонки

| Колонка | Тип | Nullable | По умолчанию | Описание |
|---|---|---|---|---|
| `id` | `BIGSERIAL` | NOT NULL | — | PK |
| `user_id` | `VARCHAR(50)` | NULL | — | FK → `users.id`. NULL для анонимных действий |
| `school_id` | `VARCHAR(50)` | NULL | — | FK → `schools.id`. NULL для системных действий |
| `action` | `VARCHAR(100)` | NOT NULL | — | Код действия. Примеры ниже |
| `resource_type` | `VARCHAR(50)` | NULL | — | `test` / `session` / `user` / `certificate` / `report` и т.д. |
| `resource_id` | `VARCHAR(100)` | NULL | — | ID затронутой сущности |
| `ip` | `INET` | NULL | — | IP-адрес клиента |
| `user_agent` | `TEXT` | NULL | — | User-Agent строка |
| `request_id` | `VARCHAR(50)` | NULL | — | Уникальный ID запроса для трассировки |
| `metadata` | `JSONB` | NULL | — | Дополнительные данные (зависит от `action`) |
| `result` | `VARCHAR(10)` | NOT NULL | `'success'` | `success` / `failure` |
| `error_code` | `VARCHAR(50)` | NULL | — | Код ошибки при `result = failure` |
| `created_at` | `TIMESTAMPTZ` | NOT NULL | `NOW()` | Временная метка события |

### Каталог действий

| `action` | `resource_type` | Описание |
|---|---|---|
| `LOGIN_SUCCESS` | `user` | Успешный вход |
| `LOGIN_FAIL` | — | Неудачная попытка входа |
| `LOGOUT` | `user` | Выход из системы |
| `SESSION_STARTED` | `session` | Ученик начал тест |
| `SESSION_COMPLETED` | `session` | Тест завершён |
| `SESSION_EXPIRED` | `session` | Тест завершён по таймауту |
| `TEST_CREATED` | `test` | Создан новый тест |
| `TEST_PUBLISHED` | `test` | Тест опубликован |
| `TEST_ASSIGNED` | `test` | Тест назначен классу |
| `CERTIFICATE_ISSUED` | `certificate` | Выдан сертификат |
| `CERTIFICATE_VERIFIED` | `certificate` | Кто-то проверил сертификат |
| `CERTIFICATE_REVOKED` | `certificate` | Сертификат отозван |
| `REPORT_GENERATED` | `report` | Сгенерирован отчёт |
| `REPORT_DOWNLOADED` | `report` | Отчёт скачан |
| `USER_BLOCKED` | `user` | Пользователь заблокирован |
| `SUSPICIOUS_ACTIVITY` | `user` | Обнаружена подозрительная активность |
| `MARKETPLACE_PUBLISHED` | `test` | Тест опубликован в маркетплейс |
| `MARKETPLACE_COPIED` | `test` | Тест скопирован из маркетплейса |
| `TAB_SWITCH_DETECTED` | `session` | Переключение вкладки во время теста |

### Индексы

| Индекс | Тип | Колонки | Причина |
|---|---|---|---|
| `audit_logs_pkey` | PRIMARY KEY | `id` | — |
| `idx_audit_user_time` | B-tree | `user_id, created_at DESC` | История действий пользователя |
| `idx_audit_school_time` | B-tree | `school_id, created_at DESC` | Аудит школы (директор) |
| `idx_audit_action_time` | B-tree | `action, created_at DESC` | Мониторинг по типу события |
| `idx_audit_ip_time` | B-tree | `ip, created_at DESC` | WHERE `action = 'LOGIN_FAIL'` — детектирование атак |
| `idx_audit_resource` | B-tree | `resource_type, resource_id` | История конкретной сущности |

### Бизнес-ограничения

```sql
ALTER TABLE audit_logs ADD CONSTRAINT chk_audit_result
  CHECK (result IN ('success','failure'));

-- audit_logs НИКОГДА не обновляется и не удаляется (append-only)
-- Реализация через политику RLS или триггер:
CREATE RULE audit_logs_no_update AS ON UPDATE TO audit_logs DO INSTEAD NOTHING;
CREATE RULE audit_logs_no_delete AS ON DELETE TO audit_logs DO INSTEAD NOTHING;
```

- Ретенция: хранятся **5 лет** (требование compliance для образовательных платформ). Удаление — только по запросу регулятора.
- Партиционирование `audit_logs` по `created_at` (по месяцам) — добавить при > 50 школах.

---

## 13. Дополнительные таблицы

### invite_codes

| Колонка | Тип | Описание |
|---|---|---|
| `id` | VARCHAR(50) PK | `'inv_' + nanoid` |
| `code` | VARCHAR(10) UNIQUE | 6-символьный код |
| `class_id` | VARCHAR(50) FK → classes | Класс |
| `school_id` | VARCHAR(50) | Денормализовано |
| `teacher_id` | VARCHAR(50) FK → users | Создатель |
| `expires_at` | TIMESTAMPTZ | TTL кода |
| `usage_count` | INTEGER DEFAULT 0 | Число использований |
| `status` | VARCHAR(20) | `active` / `expired` / `revoked` |
| `created_at` | TIMESTAMPTZ | — |

### refresh_tokens *(хранятся в Redis, но структура для документации)*

| Ключ Redis | Значение | TTL |
|---|---|---|
| `rt:{token_uuid}` | `{user_id, device_id, created_at, last_used_at}` JSON | 30 дней |
| `bl:{jti}` | `1` (blacklisted access token) | До истечения access token |

### marketplace_tests *(см. marketplace_api.md)*

| Ключевые колонки | Описание |
|---|---|
| `test_id` UNIQUE | FK → tests.id |
| `rating_avg`, `rating_count` | Рейтинг |
| `copies_count`, `copies_last_30d` | Статистика копирований |

### report_jobs

Очередь асинхронной генерации отчётов (PDF/XLSX) для директора, инспектора и министерства.

| Колонка | Тип | Описание |
|---|---|---|
| `id` | VARCHAR(50) PK | `'rpt_' + nanoid` |
| `school_id` | VARCHAR(50) NULL | Для school-scoped отчётов; NULL для district/national |
| `requested_by_user_id` | VARCHAR(50) FK → users | Инициатор отчёта |
| `scope_level` | VARCHAR(20) | `school` / `district` / `national` |
| `scope_id` | VARCHAR(50) | `school_id` / `district_id` / `country_code` |
| `template_key` | VARCHAR(100) | Шаблон отчёта (`roono_summary_pdf`, `district_xlsx`, ...) |
| `format` | VARCHAR(10) | `pdf` / `xlsx` |
| `status` | VARCHAR(20) | `queued` / `processing` / `completed` / `failed` / `expired` |
| `params_json` | JSONB | Параметры периода и фильтров |
| `result_url` | TEXT NULL | Presigned URL готового файла |
| `expires_at` | TIMESTAMPTZ NULL | TTL ссылки |
| `error_code` | VARCHAR(50) NULL | Код ошибки при `failed` |
| `created_at` | TIMESTAMPTZ | Время постановки в очередь |
| `started_at` | TIMESTAMPTZ NULL | Время старта обработки |
| `completed_at` | TIMESTAMPTZ NULL | Время завершения |

Индексы: `(status, created_at)`, `(requested_by_user_id, created_at DESC)`, `(scope_level, scope_id, created_at DESC)`.

### ntt_attempts

| Колонка | Тип | Описание |
|---|---|---|
| `id` | VARCHAR(50) PK | — |
| `student_id` | VARCHAR(50) FK | Ученик |
| `school_id` | VARCHAR(50) | RLS |
| `variant_number` | SMALLINT | Вариант НТТ (1–100) |
| `score_total` | SMALLINT | Балл из 189 |
| `score_by_block` | JSONB | `{"math": 85, "physics": 60, "chemistry": 45}` |
| `time_spent_seconds` | INTEGER | Затраченное время |
| `completed_at` | TIMESTAMPTZ | — |

---

## 14. Row-Level Security

RLS гарантирует, что данные школы A **физически недоступны** из соединения пользователя школы B на уровне СУБД — даже при ошибке в коде приложения.

### Настройка сессионной переменной

Приложение устанавливает `school_id` из JWT при каждом соединении с БД:

```sql
-- В connection pool middleware (выполняется после получения соединения):
SET LOCAL app.current_school_id = 'school_42';
SET LOCAL app.current_user_id = 'usr_abc123';
SET LOCAL app.current_role = 'teacher';
```

### Политики RLS

```sql
-- Включение RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_assignments ENABLE ROW LEVEL SECURITY;

-- Политика для school-уровневых ролей (teacher, director, student, parent)
CREATE POLICY school_isolation ON users
  USING (
    school_id = current_setting('app.current_school_id')::VARCHAR
    OR current_setting('app.current_role') IN ('inspector', 'ministry', 'service')
  );

CREATE POLICY school_isolation ON tests
  USING (school_id = current_setting('app.current_school_id')::VARCHAR
    OR current_setting('app.current_role') IN ('inspector', 'ministry', 'service'));

CREATE POLICY school_isolation ON questions
  USING (school_id = current_setting('app.current_school_id')::VARCHAR
    OR current_setting('app.current_role') IN ('inspector', 'ministry', 'service'));

CREATE POLICY school_isolation ON test_sessions
  USING (school_id = current_setting('app.current_school_id')::VARCHAR
    OR current_setting('app.current_role') IN ('inspector', 'ministry', 'service'));

-- answers: партиционированная таблица — политика применяется ко всем партициям
CREATE POLICY school_isolation ON answers
  USING (school_id = current_setting('app.current_school_id')::VARCHAR
    OR current_setting('app.current_role') IN ('inspector', 'ministry', 'service'));
```

**Специальные роли:**
- `service` — сервисный аккаунт для воркеров (analytics, report generation). Bypass RLS для чтения, но только через выделенный pool
- `inspector` — доступ к `analytics_snapshots` своих районов через отдельную политику
- `ministry` — полный read-only доступ к агрегированным снапшотам

**Ни одна роль не может писать в `audit_logs` напрямую** — только через функцию `log_audit_event()` с SECURITY DEFINER.

---

## 15. Партиционирование answers

### Стратегия

Таблица `answers` партиционируется по **Range(created_at)** с разбивкой по месяцам. Внутри каждого месяца — sub-partitioning по `school_id` hash (8 buckets) для параллельного сканирования.

```sql
-- Родительская таблица
CREATE TABLE answers (
  id                   BIGSERIAL,
  session_id           VARCHAR(50)     NOT NULL,
  question_id          VARCHAR(50)     NOT NULL,
  student_id           VARCHAR(50)     NOT NULL,
  school_id            VARCHAR(50)     NOT NULL,
  test_id              VARCHAR(50)     NOT NULL,
  subject              VARCHAR(50)     NOT NULL,
  answer_given         VARCHAR(20),
  is_correct           BOOLEAN         NOT NULL,
  time_spent_seconds   SMALLINT,
  answered_at          TIMESTAMPTZ     NOT NULL,
  server_answered_at   TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  attempt_number       SMALLINT        NOT NULL DEFAULT 1,
  created_at           TIMESTAMPTZ     NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);

-- Партиция на месяц (создаётся cron-job за 7 дней до начала месяца)
CREATE TABLE answers_2026_02
  PARTITION OF answers
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

CREATE TABLE answers_2026_03
  PARTITION OF answers
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

-- Партиция по умолчанию (страховка от пропущенных месяцев)
CREATE TABLE answers_default
  PARTITION OF answers DEFAULT;
```

### Автоматическое создание партиций

```sql
-- Функция вызывается cron-job 25-го числа каждого месяца
CREATE OR REPLACE FUNCTION create_next_month_partition()
RETURNS VOID AS $$
DECLARE
  next_month DATE := DATE_TRUNC('month', NOW() + INTERVAL '1 month');
  partition_name TEXT := 'answers_' || TO_CHAR(next_month, 'YYYY_MM');
  start_date TEXT := TO_CHAR(next_month, 'YYYY-MM-DD');
  end_date TEXT := TO_CHAR(next_month + INTERVAL '1 month', 'YYYY-MM-DD');
BEGIN
  EXECUTE FORMAT(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF answers FOR VALUES FROM (%L) TO (%L)',
    partition_name, start_date, end_date
  );
  -- Создать индексы на новой партиции
  EXECUTE FORMAT('CREATE INDEX ON %I (student_id, created_at)', partition_name);
  EXECUTE FORMAT('CREATE INDEX ON %I (test_id, created_at)', partition_name);
  EXECUTE FORMAT('CREATE INDEX ON %I (school_id, subject)', partition_name);
  EXECUTE FORMAT('CREATE INDEX ON %I (session_id, question_id)', partition_name);
END;
$$ LANGUAGE plpgsql;
```

### Удаление старых партиций

При необходимости сжатия (политика ретенции — 5 лет):
```sql
-- Безопасное удаление партиции (данные теряются — только после архивирования в cold storage)
DROP TABLE answers_2021_01;
```

### Преимущества партиционирования

| Без партиционирования | С партиционированием |
|---|---|
| Полное сканирование 500M строк | Сканирование 1–2 партиций (≤5M строк) |
| VACUUM блокирует всю таблицу | VACUUM работает с одной партицией |
| Удаление старых данных — медленный DELETE | Мгновенный DROP PARTITION |
| Индексы разрастаются до гигабайт | Компактные индексы на партиции |

---

## 16. Сводная диаграмма связей

```
schools (1)
  ├── (N) users [school_id]
  │     ├── (N) classes [teacher_id] ──── (N) class_students ──── (N) users [student_id]
  │     └── (N) invite_codes [teacher_id]
  │
  ├── (N) tests [school_id, teacher_id]
  │     ├── (N) questions [test_id, school_id]
  │     ├── (N) test_assignments [test_id] ──── (1) classes
  │     └── (N) marketplace_tests [test_id]
  │
  ├── (N) test_sessions [school_id, student_id, test_id]
  │     ├── (N) answers [session_id, school_id] ⚡ PARTITIONED
  │     └── (1) certificates [session_id]
  │
  ├── (N) analytics_snapshots [school_id] — читаются дашбордами
  │
  └── (N) audit_logs [school_id] — append-only

roно_districts (1)
  └── (N) schools [roно_district_id]
```

---

## Приложение: Параметры PostgreSQL для production

```ini
# postgresql.conf — ключевые параметры для Zedly

# Память
shared_buffers = 4GB              # 25% RAM
effective_cache_size = 12GB       # 75% RAM
work_mem = 64MB                   # для sort/hash операций
maintenance_work_mem = 1GB        # для VACUUM, CREATE INDEX

# WAL и checkpoint
wal_buffers = 64MB
checkpoint_completion_target = 0.9
max_wal_size = 4GB

# Параллелизм (для аналитических запросов)
max_parallel_workers_per_gather = 4
max_parallel_workers = 8

# Партиционирование
enable_partition_pruning = on     # обязательно для partition pruning
constraint_exclusion = partition  # оптимизация партиций

# Логирование медленных запросов
log_min_duration_statement = 200  # логировать запросы > 200ms
log_line_prefix = '%t [%p] school=%q{app.current_school_id} req=%q{app.request_id} '
```

---

*Следующий файл: `docs/09_permissions/rbac.md` — матрица ролей и разрешений (RBAC).*
