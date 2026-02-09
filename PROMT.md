# School Testing & Analytics Platform
## PROJECT_SPEC.md

---

## 1. Цель проекта

Создать безопасную, масштабируемую платформу онлайн-тестирования для школ Узбекистана, где:

- ученики проходят тесты с телефона или ПК,
- учителя и администраторы получают полную аналитику,
- SuperAdmin управляет школами и платформой.

Проект мультишкольный (multi-tenant).  
Репозиторий-референс используется **только как идея**, код и стек создаются с нуля.

---

## 2. Масштаб и ограничения

- География: Узбекистан  
- Пилот: 1 школа  
- На школу:
  - ~3000 учеников
  - ~150 учителей
  - ~70 классов
- Пиковая нагрузка: до 500 учеников одновременно
- Устройства: мобильный браузер + ПК
- Языки интерфейса: RU / UZ
- Оффлайн режим: нет
- Хостинг: aHOST (shared hosting, без Docker)
- Экспорт: XLSX
- Медиа в вопросах: **только изображения**
- Интеграции: нет

---

## 3. Роли и доступ (RBAC)

### Роли
- SuperAdmin — уровень платформы
- SchoolAdmin — администратор школы
- Teacher — учитель
- Student — ученик

### Общие правила безопасности
- Все бизнес-таблицы содержат `school_id`
- Каждый API-запрос проверяет:
  - роль пользователя
  - принадлежность к школе
  - владение объектом (IDOR-защита)
- Фронтенд **не считается защитой**

---

## 4. Функции по ролям

### Student
- Логин (логин/пароль)
- Список назначенных тестов
- Прохождение теста:
  - single choice
  - multi choice
  - number (строгое равенство)
  - таймер (если задан)
  - автосохранение ответов
- Просмотр результата (только балл)
- История попыток

### Teacher
- Банк вопросов (поиск, фильтры)
- Создание и редактирование тестов
- Назначение тестов своим классам
- Аналитика:
  - по тесту
  - по классу
  - по ученику
  - по теме / тегу
  - по вопросу
- Экспорт XLSX

### SchoolAdmin
- Управление пользователями
- Импорт пользователей из Excel
- Управление классами
- Управление предметами и темами
- Назначение учителей к классам
- **Создание тестов для учителей**
  - admin создаёт тест
  - назначает `owner_teacher_id`
- Аналитика по школе
- Audit-лог школы

### SuperAdmin
- Создание школ вручную
- Блокировка / разблокировка школ
- Platform settings:
  - SMTP
  - Telegram bot token
- Глобальный аудит
- Мониторинг jobs (экспорт/уведомления)

---

## 5. Frontend стек

- Next.js (App Router) + TypeScript
- TailwindCSS + shadcn/ui
- TanStack Query
- Zustand
- React Hook Form + Zod
- next-intl (RU / UZ)
- Apache ECharts
- Vitest + Playwright

### Роутинг
- /student/*
- /teacher/*
- /admin/*
- /superadmin/*

---

## 6. Backend подход

- Монолитный REST API
- PostgreSQL
- JWT access + refresh (rotation)
- Rate limiting
- Асинхронные задачи:
  - таблицы jobs
  - cron-worker (aHOST)

---

## 7. База данных (PostgreSQL)

### schools
- id
- name
- status
- created_at

### users
- id
- school_id
- role (superadmin | admin | teacher | student)
- username (unique per school)
- email (nullable)
- password_hash
- must_change_password
- status
- last_login_at
- created_at

### classes
- id
- school_id
- grade
- letter
- name

### class_members
- class_id
- student_user_id
- joined_at

### subjects
- id
- school_id
- name
- grade (nullable)

### topics
- id
- school_id
- subject_id
- name
- parent_topic_id (nullable)

### teacher_class_access
- teacher_user_id
- class_id

---

### questions
- id
- school_id
- subject_id
- type (single | multi | number)
- text
- created_by
- status
- created_at

### question_options
- id
- question_id
- text
- is_correct
- sort_order

### question_media
- id
- question_id
- media_type = image
- url
- sort_order

### tags
- id
- school_id
- name

### question_tags
- question_id
- tag_id

### question_topic_map
- question_id
- topic_id

---

### tests
- id
- school_id
- subject_id
- title
- description
- max_score = 100
- attempts_allowed
- time_limit_minutes (nullable)
- owner_teacher_id (nullable)
- created_by
- status
- created_at

### test_questions
- test_id
- question_id
- points
- sort_order

### assignments
- id
- school_id
- test_id
- class_id
- starts_at
- ends_at
- assigned_by
- status

### attempts
- id
- assignment_id
- student_user_id
- attempt_no
- started_at
- finished_at
- status
- score

### attempt_answers
- attempt_id
- question_id
- answer_payload (jsonb)
- is_correct
- points_awarded
- answered_at

---

### audit_log
- id
- school_id
- actor_user_id
- action_type
- entity_type
- entity_id
- meta_json
- created_at

### export_jobs
- id
- school_id
- requested_by
- type
- params_json
- status
- file_url
- created_at
- finished_at

### notification_jobs
- id
- school_id
- channel (email | telegram)
- template_key
- payload_json
- status
- created_at

### platform_settings
- key
- value_json
- updated_at

---

## 8. Scoring

- earned_points = sum(points_awarded)
- total_points = sum(points)
- score = round(earned_points / total_points * 100)

Правила:
- single — правильный вариант
- multi — строгое совпадение набора
- number — **строгое равенство**

---

## 9. API пути (основные)

### Auth
- POST /api/auth/login
- POST /api/auth/refresh
- POST /api/auth/logout
- POST /api/auth/reset-password

### SuperAdmin
- POST /api/superadmin/schools
- PATCH /api/superadmin/schools/:id
- GET /api/superadmin/audit
- PATCH /api/superadmin/settings

### SchoolAdmin
- POST /api/admin/users
- POST /api/admin/users/import
- PATCH /api/admin/users/:id
- POST /api/admin/classes
- POST /api/admin/subjects
- POST /api/admin/topics
- POST /api/admin/tests
- PATCH /api/admin/tests/:id

### Teacher
- POST /api/teacher/questions
- GET /api/teacher/questions
- POST /api/teacher/tests
- POST /api/teacher/assignments
- GET /api/teacher/analytics/*

### Student
- GET /api/student/assignments
- POST /api/student/attempts/start
- PUT /api/student/attempts/:id/answer
- POST /api/student/attempts/:id/submit

### Export
- POST /api/exports
- GET /api/exports/:id/status
- GET /api/exports/:id/download

---

## 10. Уведомления

### Email
- reset password
- import result
- export ready

### Telegram
- один бот на платформу
- привязка через одноразовый код
- уведомление о готовности экспорта

---

## 11. Sprint-план (1–4)

### Sprint 1
- Auth, RBAC
- SuperAdmin + школы
- Базовая БД
- Логин и reset пароля

### Sprint 2
- Пользователи, классы, предметы
- Импорт Excel
- Назначение учителей

### Sprint 3
- Вопросы, тесты
- Admin → teacher tests
- Прохождение тестов
- Scoring

### Sprint 4
- Аналитика
- XLSX экспорт
- Email + Telegram
- Финальный security pass

---

## 12. Definition of Done

- Полный e2e-флоу
- RBAC + аудит
- RU / UZ
- Асинхронные экспорты
- Готово к пилоту в школе
