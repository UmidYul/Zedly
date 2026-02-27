# ZEDLY: Полный технический разбор проекта

Дата анализа: 27 февраля 2026  
Рабочая директория: `/Users/premium/Desktop/Zedly`

## 1) Что это за проект

`ZEDLY` — образовательная платформа с ролевой моделью для школ:
- `superadmin` (уровень всей системы)
- `school_admin` (уровень школы)
- `teacher`
- `student`
- `psychologist`

Ключевая задача продукта: централизованно управлять учебным процессом, тестированием, аналитикой, профориентацией, уведомлениями и отчетностью.

## 2) Архитектура в целом

Проект собран вокруг одного backend-приложения на Node.js/Express, которое может работать в нескольких режимах:

1. `legacy monolith` (API + frontend вместе)  
   Запуск: `npm run start:legacy` (`backend/src/server.js`)
2. `api-only`  
   Запуск: `npm run start:api` (`backend/src/api-server.js`)
3. `web-only`  
   Запуск: `npm run start:web` (`backend/src/web-server.js`)
4. `worker` (фоновые cron-задачи)  
   Запуск: `npm run start:worker` (`backend/src/worker.js`)

На production предусмотрен split: `api + web + worker + db + nginx` через `docker-compose.prod.yml`.

## 3) Технологический стек

Backend:
- `express`, `pg`, `jsonwebtoken`, `bcryptjs` (через alias `bcrypt`)
- `multer`, `exceljs`, `pdfkit`
- `node-cron`
- `nodemailer` + Telegram интеграции
- `helmet`, `cors`, `express-rate-limit`, `compression`

Frontend:
- Vanilla `HTML/CSS/JS`
- `Chart.js`
- i18n (RU/UZ)
- PWA (`manifest`, `service-worker`)
- Динамический shell для `dashboard`

БД:
- PostgreSQL
- Схемы: `database/schema.sql` (историческая), `database/schema_safe.sql` (актуальная безопасная база)
- Миграции в `database/migrations`

## 4) Структура репозитория (что к чему)

- `backend/`
- `backend/src/server.js` — главный сервер и связка модулей
- `backend/src/routes/*.js` — API по ролям и доменам
- `backend/src/middleware/` — auth/csrf и вспомогательная защита
- `backend/src/utils/` — JWT, cookies, email/telegram notifications, error tracking
- `backend/src/jobs/` — cron задачи
- `backend/public/` — frontend (HTML/CSS/JS, PWA)
- `backend/scripts/` — миграции, сборка фронта, seed/backup
- `database/` — схемы, dump, миграции, docker-init
- `infra/nginx/zedly.conf` — reverse proxy для split deployment
- `docker-compose.yml` — локальная сборка
- `docker-compose.prod.yml` — production topology

## 5) Полная планировка сайта (информационная архитектура)

### 5.1 Публичная зона

- `/` — landing page (`index.html`)
  - презентация продукта
  - живые метрики (`/api/public/landing-stats`)
  - FAQ
  - форма обратной связи (`/api/public/feedback`)
- `/login` — вход
- `/dashboard` — единая точка входа в личный кабинет (дальше контент зависит от роли)

### 5.2 Служебные/операционные страницы

- `change-password.html`
- `advanced-analytics.html`
- `career-test.html`
- `student-details.html`
- `class-details.html`
- `teacher-results.html`
- `test-results.html`
- `take-test.html`
- `student-attempt.html`
- `student-history.html`
- `teacher-classes.html`
- `import-users.html`
- `telegram-status.html`
- `debug-auth.html`
- `404.html`

### 5.3 Навигация внутри Dashboard по ролям

Источник: `backend/public/js/dashboard.js`

`superadmin`:
- Main: `overview`, `profile`, `schools`, `school-admins`
- Analytics: `statistics`, `comparison`, `reports`
- System: `settings`, `audit`

`school_admin`:
- Main: `overview`, `profile`, `users`, `classes`, `subjects`
- Analytics: `advanced`, `reports`
- Tools: `import`, `export`

`teacher`:
- Main: `overview`, `profile`, `tests`, `assignments`, `classes`, `my-class`
- Analytics: `results`, `advanced`, `students`
- Resources: `calendar`

`student`:
- Main: `overview`, `profile`, `tests`, `results`, `my-class`, `career`
- Learning: `progress`, `leaderboard`
- Resources: `calendar`

`psychologist`:
- Main: `overview`, `profile`, `students`, `career-admin`

## 6) Функциональная карта (основные сценарии)

### 6.1 Аутентификация и сессия

- Cookie-based auth + refresh-механизм
- CSRF cookie + заголовок `X-CSRF-Token`
- `must_change_password` сценарий через временный токен
- `token_version` инвалидирует старые refresh/access после logout/password reset

### 6.2 School Admin

- Управление пользователями (CRUD, reset password)
- Управление классами и предметами (CRUD)
- Импорт из Excel: пользователи и teacher-class-subject связи
- Экспорт пользователей и выгрузка учетных данных
- Дашборд и школьные отчеты/аналитика
- Настройки notification defaults (на уровне школы), просмотр логов уведомлений

### 6.3 Teacher

- Конструктор тестов (CRUD, вопросы, импорт вопросов из Excel, загрузка изображений)
- Назначение тестов классам (assignments)
- Assignment templates
- Просмотр результатов, разбор попыток
- Аналитика по классу/предмету
- Работа с учениками класса (включая reset пароля в рамках прав)

### 6.4 Student

- Получение активных назначений
- Старт/сохранение/сдача попытки
- Просмотр результатов, истории, прогресса
- Лидерборд
- Мой класс (обзор, позиция, динамика)
- Профориентационный тест, история, PDF-отчет

### 6.5 Psychologist

- Список учеников/предметов
- Просмотр career history ученика
- Управление справочником интересов
- Управление банком карьерных вопросов

### 6.6 Superadmin

- Управление школами и school_admin
- Географические справочники и geo-аналитика
- Системные метрики и сравнение школ
- Централизованные defaults для уведомлений
- Audit-центр (фильтры, summary, facets, CSV export)
- Глобальная career-аналитика

## 7) API-карта (по модулям)

Источник: `backend/src/routes/*.js`

- `auth.js` — 11 endpoints
- `admin.js` — 30 endpoints
- `teacher.js` — 27 endpoints
- `student.js` — 20 endpoints
- `superadmin.js` — 26 endpoints
- `psychologist.js` — 12 endpoints
- `analytics.js` — 8 endpoints
- `telegram.js` — 11 endpoints

Плюс публичные endpoints в `server.js`:
- `GET /api/public/landing-stats`
- `POST /api/public/feedback`

Плюс health:
- `GET /api/health`
- `GET /api/v1/health/live`
- `GET /api/v1/health/ready`

### Версионирование API

Большинство роутеров проброшены одновременно на:
- legacy префикс `/api/...`
- v1 префикс `/api/v1/...`

## 8) Модель данных (БД)

Базовая актуальная структура: `database/schema_safe.sql` (27 таблиц).

Ключевые таблицы:
- `schools`, `users`, `refresh_tokens`
- `subjects`, `classes`, `class_students`
- `teacher_subjects`, `teacher_classes`, `teacher_class_subjects`
- `tests`, `questions`, `test_questions`, `test_assignments`, `test_attempts`
- `career_interests`, `student_career_results`
- `student_performance`, `leaderboards`, `teacher_statistics`
- `notifications`, `notification_preferences`, `notification_log` (через миграции)
- `calendar_events`
- `scheduled_reports`, `report_archives`
- `kb_categories`, `kb_articles`
- `audit_logs`

Ключевые связи домена:
- школа -> пользователи/классы/предметы/тесты
- класс <-> ученики (`class_students`)
- учитель <-> предметы (`teacher_subjects`)
- учитель <-> классы (`teacher_classes`)
- назначение теста (`test_assignments`) связывает тест и класс
- попытки (`test_attempts`) связывают ученика и назначение

## 9) Безопасность

Реализовано:
- `helmet` + CSP (отключаемый флагом)
- CORS allowlist из env
- rate limiting на API префиксах
- CSRF-проверка для небезопасных методов
- cookie-политики (`Secure`, `SameSite`, `Domain`) управляются env
- RBAC через `authenticate + authorize`
- school isolation middleware
- request id (`x-request-id`) и нормализация ошибок для `/api/v1`
- optional Sentry error tracking

## 10) Уведомления и интеграции

### 10.1 Каналы

- Email (`nodemailer`)
- Telegram (бот + link/disconnect/preferences)
- In-app (логи и UI-панель уведомлений)

### 10.2 Фоновые задачи

`backend/src/worker.js` запускает:
- `deadlineReminders` (`DEADLINE_REMINDER_CRON`, по умолчанию `0 * * * *`)
- `notificationDigest` (`NOTIFICATION_DIGEST_CRON`, по умолчанию `15 * * * *`)

Особенности:
- один активный worker через Postgres advisory lock
- дедупликация напоминаний через `audit_logs`
- учёт пользовательских настроек частоты/каналов
- логирование отправок в `notification_log`

## 11) Frontend: модули и удобства для пользователя

Ключевые UX-элементы:
- единый dashboard shell с динамической подгрузкой модулей по роли
- skeleton-плейсхолдеры при загрузке разделов
- автоподхват сессии (refresh на `401`) в `auth-interceptor.js`
- автоматическая CSRF-обвязка запросов
- адаптивный mobile shell (`mobile-shell.js`)
- переключение темы (`theme.js`)
- RU/UZ локализация (`i18n.js`, `landing.js`)
- панель уведомлений (`notifications.js`)
- Telegram self-service привязка (`telegram-connect.js`)
- PWA + offline fallback (`service-worker.js`)
- анимированная landing-страница (метрики, карточки, FAQ motion)

## 12) Инфраструктура и эксплуатация

### 12.1 Локально

`docker-compose.yml`:
- `db` (PostgreSQL 16, порт по умолчанию `5433`)
- `backend` (порт `5000`)
- volume для uploads/backups

`database/docker-init/00-init-db.sh`:
- приоритет восстановления: `dump.sql` -> `dump.dump` -> `schema.sql`

### 12.2 Production

`docker-compose.prod.yml`:
- `db`
- `api` (`start:api`)
- `web` (`start:web`)
- `worker`
- `reverse-proxy` (nginx)

`infra/nginx/zedly.conf`:
- `app.zedly.uz`: `/api/` -> `api`, остальное -> `web`
- `api.zedly.uz`: все запросы -> `api`

## 13) Тесты и качество

Найденные тесты:
- `backend/src/tests/smoke.e2e.test.js` — smoke E2E ключевых ролей/потоков
- `backend/src/routes/superadmin.geo.test.js` — покрытие geo/profile логики
- `backend/src/routes/careerModule.test.js` — заготовка (фактически пустая)

Вывод:
- критичные сценарии входа и базового флоу проверяются
- покрытие неровное: часть доменных зон без полноценного unit/integration набора

## 14) Матрица «фича -> ключевые файлы»

Аутентификация:
- `backend/src/routes/auth.js`
- `backend/src/middleware/auth.js`
- `backend/src/middleware/csrf.js`
- `backend/public/js/auth-interceptor.js`

Dashboard и роли:
- `backend/public/dashboard.html`
- `backend/public/js/dashboard.js`
- role-менеджеры в `backend/public/js/*.js`

Тестирование/assignments:
- `backend/src/routes/teacher.js`
- `backend/src/routes/student.js`
- `backend/public/js/tests.js`
- `backend/public/js/assignments.js`
- `backend/public/js/take-test.js`

Аналитика:
- `backend/src/routes/analytics.js`
- `backend/public/js/advanced-analytics.js`
- `backend/public/js/reports.js`
- `backend/public/js/teacher-analytics.js`
- `backend/public/js/student-progress.js`

Профориентация:
- `backend/src/routes/student.js` (career endpoints)
- `backend/src/routes/psychologist.js`
- `backend/src/routes/superadmin.js` (career analytics)
- legacy: `backend/routes/career.js` + `backend/src/routes/careerHandlers.js`
- frontend: `backend/public/js/career.js`, `career-admin.js`, `career-results.js`

Уведомления:
- `backend/src/utils/notifications.js`
- `backend/src/jobs/deadlineReminders.js`
- `backend/src/jobs/notificationDigest.js`
- `backend/src/routes/telegram.js`
- `backend/public/js/notifications.js`

## 15) Важные наблюдения и риски

1. В проекте одновременно присутствуют два career-контура:
   - современный (в ролевых роутерах `student/psychologist/superadmin`)
   - legacy (`/api/career` через `careerHandlers`)
   Это может приводить к расхождению бизнес-логики и API поведения.

2. По i18n заметны признаки «битых» строк (mojibake) в части фронтенд-ресурсов, особенно в больших JS-файлах со словарями.

3. Тестовое покрытие по ряду больших модулей (admin/teacher/student routes) ограничено smoke-проверками и не закрывает все edge cases.

4. Существуют исторические/временные миграционные файлы и несколько «safe/quick/combined» скриптов, что требует аккуратного governance при разворачивании новой среды.

5. Часть внешних скриптов (`Chart.js`) грузится из CDN; для закрытых контуров/нестабильного интернета это потенциальная эксплуатационная зависимость.

## 16) Что в итоге уже реализовано хорошо

- Полноценный RBAC под 5 ролей.
- Разделение API/Web/Worker для production.
- Достаточно зрелая система уведомлений и логирования.
- Широкий функционал аналитики и профориентации.
- Реально работающий набор операционных функций (импорт/экспорт, отчеты, cron-задачи, Telegram-интеграция).
- PWA и мобильная адаптация на уровне shell.

## 17) Краткое резюме проекта

`ZEDLY` — функционально насыщенная школьная платформа уровня production с сильной backend-частью, ролевым dashboard и развитой операционной логикой (тесты, аналитика, уведомления, career).  
Архитектура в целом зрелая, но для дальнейшего масштабирования стоит унифицировать career-контур, усилить тесты и формализовать стратегию миграций/данных.
