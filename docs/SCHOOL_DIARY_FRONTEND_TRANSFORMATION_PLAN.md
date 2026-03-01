# ZEDLY: Переход к формату «Электронный дневник» (Frontend-only)

Дата: 1 марта 2026  
Проект: `/Users/premium/Desktop/Zedly`  
Ограничение: в рамках этой задачи изменяется только фронтенд (без правок backend/API кода).

## 1. Что проанализировано

- Текущая фронтенд-структура: `backend/public/*.html`, `backend/public/js/*.js`
- Динамическая навигация и роли: `backend/public/js/dashboard.js`
- Текущая модель данных: `database/schema_safe.sql` + миграции `database/migrations/*`
- Текущие backend-роуты: `backend/src/routes/*.js`

## 2. Текущее состояние проекта (факт)

## 2.1 Текущий продуктовый фокус

- Платформа сейчас ориентирована на тестирование, попытки, аналитику результатов и профориентацию.
- Есть базовые академические сущности (школы, классы, предметы, ученики/учителя), но нет полноценного «дневника» в классическом школьном смысле.

## 2.2 Реализованные роли и навигация

- В UI и роутинге используются роли: `superadmin`, `school_admin`, `teacher`, `student`, `psychologist`.
- В базовой `schema_safe.sql` enum `user_role` содержит только `superadmin`, `school_admin`, `teacher`, `student`, а `psychologist` добавляется миграцией (`2026_02_24_psychologist_career_enhancements.psql`).
- Роль `parent` отсутствует и в UI, и в базовой схеме.

## 2.3 Реализованные фронтенд-модули (ключевые)

- Общая оболочка: `dashboard.html` + динамическая подгрузка модулей.
- Для teacher/student:
- `tests.js`, `student-tests.js` (тесты)
- `assignments.js` (назначения тестов)
- `calendar.js`, `student-calendar.js` (календарь дедлайнов тестов, не уроков)
- `teacher-analytics.js`, `student-results.js`, `student-progress.js`
- Для school_admin/superadmin:
- пользователи, школы, классы, предметы, отчеты, аудит, настройки.
- Коммуникация/уведомления:
- `notifications.js` реализует in-app центр, но не чат/диалоги.
- Есть Telegram-интеграция (`telegram-connect.js`), но нет модулей «сообщения teacher-student-parent».

## 2.4 Реализованные страницы (HTML)

- Публичные: `index.html`, `login.html`
- ЛК и сервис: `dashboard.html`, `change-password.html`, `404.html`
- Тестовый контур: `take-test.html`, `test-results.html`, `teacher-results.html`, `student-attempt.html`, `student-history.html`, `grade-attempt.html`, `grading.html`
- Управление/аналитика: `advanced-analytics.html`, `class-details.html`, `student-details.html`, `teacher-classes.html`, `import-users.html`, `telegram-status.html`, `career-test.html`

## 2.5 Существующие таблицы БД (релевантно)

- Уже есть: `schools`, `users`, `classes`, `subjects`, `class_students`, `teacher_classes`, `teacher_class_subjects`
- Тестовый контур: `tests`, `test_questions`, `test_assignments`, `test_attempts`, `student_performance`
- Вспомогательные: `notifications`, `notification_preferences`, `calendar_events`, `audit_logs`, отчеты и т.д.
- Нет специализированных таблиц дневника:
- журнал оценок по урокам/типам работ
- расписание уроков (сеточное, по слотам)
- домашние задания с загрузкой решений
- посещаемость
- чаты/сообщения
- связи родитель-ребенок

## 2.6 Что уже частично покрывает новую цель

- RBAC, авторизация, профили, классы/предметы, базовые уведомления, отчеты.
- Это хорошая база для перехода к «дневнику», но предметные сущности дневника пока отсутствуют.

## 3. Gap-анализ: что нужно добавить для концепции «школьного дневника»

Требование: электронный дневник, расписание, ДЗ, коммуникация, профили parent, аналитика посещаемости и администрирование.

Пробелы:

- Нет роли `parent`.
- Нет журнальных оценок по урокам/типам контроля и комментариев учителя к оценке.
- Нет нормального расписания уроков (дни недели, уроки, кабинеты, замены).
- Нет отдельного домена «домашние задания» (публикация, сдача, проверка, фидбек).
- Нет сообщений (личные/групповые чаты, threads).
- Нет учета посещаемости.
- Нет API-контрактов под дневник (текущие API в основном test-centric).

## 4. Целевая архитектура фронтенда (без изменения backend в этом шаге)

## 4.1 Подход

- Сохранить текущий стек: Vanilla JS + модульная подгрузка в `dashboard.js`.
- Добавить новые модули страниц по ролям с единым UI-паттерном.
- Внедрить feature flags для плавного переключения от test-centric к diary-centric интерфейсу.

## 4.2 Новые frontend-модули (план)

- `gradebook.js` (журнал оценок)
- `schedule.js` (расписание уроков)
- `homework.js` (ДЗ: teacher/student)
- `homework-review.js` (проверка/оценка ДЗ)
- `attendance.js` (посещаемость)
- `messages.js` (личные/групповые сообщения)
- `parent-diary.js`, `parent-schedule.js` (родительский кабинет)
- `admin-schedule.js` (управление сеткой расписания)

## 5. Детальный план внедрения (frontend roadmap)

## Фаза 1. Информационная архитектура и навигация

- Обновить `dashboard.js`:
- добавить новый набор пунктов меню для `teacher`, `student`, `school_admin`
- подготовить роль `parent` в UI-конфиге (пока под feature flag)
- Добавить заглушки новых страниц с состояниями `loading/empty/error`.

Результат:

- Новый каркас дневника уже доступен в интерфейсе без backend-реализации.

## Фаза 2. Электронный журнал и оценки

- Teacher UI:
- таблица оценок по предмету/классу/четверти
- формы выставления и редактирования оценки
- комментарий к оценке и тип работы (дз/классная/контрольная/проект)
- Student UI:
- просмотр истории оценок, фильтры, тренд
- Parent UI:
- просмотр оценок ребенка, лента изменений

Результат:

- Готовый фронтенд журнала с API-контрактами и валидациями.

## Фаза 3. Расписание

- Реализовать 3 представления:
- ученик: персональное расписание
- учитель: расписание уроков/классов/кабинетов
- админ: сетка расписания школы
- Отдельно: UI для замен/переносов уроков и отображение уведомлений об изменениях.

Результат:

- Полноценный модуль расписания вместо календаря дедлайнов тестов.

## Фаза 4. Домашние задания

- Teacher:
- создание ДЗ, срок сдачи, файлы/инструкции
- Student:
- список ДЗ, загрузка ответа, статус (новое/сдано/проверено/просрочено)
- Teacher review:
- проверка, оценка, комментарий, возврат на доработку

Результат:

- Полный цикл ДЗ в UI.

## Фаза 5. Коммуникация и уведомления

- Личные и групповые диалоги:
- teacher <-> student
- teacher <-> parent
- class channel (по роли/классу)
- Интеграция уведомлений:
- новые оценки
- новое ДЗ
- изменения расписания
- непрочитанные сообщения

Результат:

- Единый коммуникационный контур в кабинете.

## Фаза 6. Профили, аналитика, администрирование

- Профиль parent с привязкой детей.
- Аналитика:
- успеваемость класса/школы/ученика
- посещаемость
- активность по ДЗ
- Админ-интерфейсы:
- управление предметами/классами/расписанием
- управление правами и связями parent-student.

Результат:

- Финальный дневник как школьная платформа, а не только тестовый сервис.

## 6. Что будет готово после полной реализации (Frontend scope, target state)

Ниже перечень целевого результата «после полной реализации» на фронте.

## 6.1 Страницы для `student`

- `#diary` — оценки по предметам, история, комментарии учителей
- `#schedule` — персональное расписание (неделя/день)
- `#homework` — задания, сроки, сдача файлов/ответов
- `#messages` — сообщения с учителями и родителем
- `#attendance` — посещаемость и пропуски
- `#profile` — личные данные, уведомления, контакты

## 6.2 Страницы для `teacher`

- `#gradebook` — журнал класса/предмета (выставление и редактирование оценок)
- `#schedule` — расписание уроков, кабинеты, замены
- `#homework` — публикация ДЗ, дедлайны
- `#homework-review` — проверка работ и фидбек
- `#messages` — диалоги с учениками/родителями
- `#attendance` — отметка посещаемости по урокам
- `#reports` — аналитика по классу/предмету

## 6.3 Страницы для `parent`

- `#children` — список привязанных детей
- `#child-diary` — оценки ребенка
- `#child-schedule` — расписание ребенка
- `#child-homework` — ДЗ и статусы сдачи
- `#messages` — коммуникация с учителями
- `#notifications` — события по ребенку

## 6.4 Страницы для `school_admin`

- `#users` — CRUD пользователей (включая parent)
- `#classes-subjects` — классы/предметы/связки
- `#schedule-admin` — централизованная сетка расписания
- `#academic-terms` — четверти/семестры/каникулы
- `#analytics` — успеваемость, посещаемость, активность
- `#audit` — история изменений

## 6.5 Страницы для `superadmin`

- `#schools` — мультишкольный обзор
- `#school-comparison` — KPI школ (успеваемость/посещаемость)
- `#system-settings` — глобальные политики и шаблоны уведомлений

## 7. Целевая модель БД для дневника (что потребуется backend-команде)

Ниже не изменение текущей БД в этой задаче, а целевая спецификация таблиц.

## 7.1 Новые таблицы (предлагаемые)

1. `academic_terms`
- `id`, `school_id`, `name`, `start_date`, `end_date`, `is_active`

2. `lesson_slots`
- `id`, `school_id`, `slot_number`, `start_time`, `end_time`

3. `timetable_lessons`
- `id`, `school_id`, `class_id`, `subject_id`, `teacher_id`, `room`, `weekday`, `lesson_slot_id`, `term_id`, `is_active`

4. `lesson_changes`
- `id`, `lesson_id`, `change_date`, `new_teacher_id`, `new_room`, `status`, `comment`

5. `grade_types`
- `id`, `school_id`, `code`, `name`, `weight`, `is_active`

6. `gradebook_entries`
- `id`, `school_id`, `class_id`, `subject_id`, `teacher_id`, `student_id`, `term_id`, `grade_type_id`, `grade_value`, `max_value`, `grade_date`, `comment`, `source`

7. `homework_assignments`
- `id`, `school_id`, `class_id`, `subject_id`, `teacher_id`, `title`, `description`, `due_at`, `max_score`, `allow_late`, `attachments`, `created_at`

8. `homework_submissions`
- `id`, `homework_id`, `student_id`, `submitted_at`, `answer_text`, `attachments`, `status`, `score`, `feedback`, `checked_by`

9. `attendance_sessions`
- `id`, `school_id`, `class_id`, `subject_id`, `teacher_id`, `lesson_date`, `lesson_slot_id`, `term_id`

10. `attendance_records`
- `id`, `session_id`, `student_id`, `status`, `comment`

11. `parent_student_links`
- `id`, `parent_id`, `student_id`, `relation_type`, `is_primary`, `is_active`

12. `conversations`
- `id`, `school_id`, `type`, `title`, `created_by`, `created_at`

13. `conversation_participants`
- `id`, `conversation_id`, `user_id`, `role_in_chat`, `joined_at`, `left_at`

14. `messages`
- `id`, `conversation_id`, `sender_id`, `message_text`, `attachments`, `sent_at`, `edited_at`, `is_deleted`

15. `message_reads`
- `id`, `message_id`, `user_id`, `read_at`

## 7.2 Изменения существующих таблиц

- `users`: добавить роль `parent`; возможны поля `legal_representative`, `preferred_contact`.
- `notifications`: расширить типы событий (`grade_added`, `schedule_changed`, `homework_posted`, `message_received`, `attendance_marked`).
- `calendar_events`: оставить для общешкольных событий, не смешивать с `timetable_lessons`.

## 8. API-контракты (целевая спецификация для фронтенда)

Ниже контракты, которые фронтенд будет использовать после реализации дневника.

## 8.1 Journal / Grades

1. `GET /api/v1/gradebook/classes/:classId/subjects/:subjectId/entries`
- Query: `term_id`, `date_from`, `date_to`, `student_id`
- Response 200:
```json
{
  "entries": [
    {
      "id": "uuid",
      "student_id": "uuid",
      "student_name": "Иван Петров",
      "grade_value": 4,
      "max_value": 5,
      "grade_type": "homework",
      "grade_date": "2026-03-01",
      "comment": "Хорошая работа"
    }
  ]
}
```

2. `POST /api/v1/gradebook/entries`
- Request:
```json
{
  "class_id": "uuid",
  "subject_id": "uuid",
  "student_id": "uuid",
  "term_id": "uuid",
  "grade_type_id": "uuid",
  "grade_value": 5,
  "max_value": 5,
  "grade_date": "2026-03-01",
  "comment": "Отлично"
}
```
- Response 201: `{ "entry": { "...": "..." } }`

3. `PUT /api/v1/gradebook/entries/:entryId`
- Request: частичное обновление `grade_value`, `comment`, `grade_type_id`
- Response 200: `{ "entry": { "...": "..." } }`

4. `DELETE /api/v1/gradebook/entries/:entryId`
- Response 200: `{ "message": "deleted" }`

5. `GET /api/v1/students/:studentId/grades`
- Query: `term_id`, `subject_id`
- Response 200: список оценок для student/parent.

## 8.2 Schedule

1. `GET /api/v1/schedule/student/:studentId`
- Query: `week_start`, `week_end`
- Response 200:
```json
{
  "lessons": [
    {
      "id": "uuid",
      "date": "2026-03-02",
      "slot_number": 1,
      "start_time": "08:30",
      "end_time": "09:15",
      "subject": "Математика",
      "teacher": "Иванов И.И.",
      "room": "301",
      "status": "planned"
    }
  ]
}
```

2. `GET /api/v1/schedule/teacher/:teacherId`
- Query: `week_start`, `week_end`
- Response 200: список уроков учителя.

3. `POST /api/v1/schedule/lessons`
- Request: создание урока/слота.
- Response 201: созданный урок.

4. `PUT /api/v1/schedule/lessons/:lessonId`
- Request: изменение учителя/кабинета/времени.
- Response 200: обновленный урок.

5. `POST /api/v1/schedule/lessons/:lessonId/change`
- Request: регистрация замены/переноса.
- Response 201.

## 8.3 Homework

1. `GET /api/v1/homework`
- Query: `class_id`, `subject_id`, `status`, `student_id`, `due_from`, `due_to`
- Response 200: список заданий.

2. `POST /api/v1/homework`
- Request:
```json
{
  "class_id": "uuid",
  "subject_id": "uuid",
  "title": "Домашняя работа №5",
  "description": "Решить задачи 1-10",
  "due_at": "2026-03-05T20:00:00Z",
  "max_score": 10,
  "attachments": []
}
```
- Response 201: созданное ДЗ.

3. `GET /api/v1/homework/:homeworkId/submissions`
- Response 200: список сдач учеников.

4. `POST /api/v1/homework/:homeworkId/submissions`
- Request: `answer_text`, `attachments`
- Response 201: созданная сдача.

5. `PUT /api/v1/homework/submissions/:submissionId/review`
- Request: `score`, `feedback`, `status`
- Response 200: проверенная сдача.

## 8.4 Attendance

1. `POST /api/v1/attendance/sessions`
- Request: `class_id`, `subject_id`, `lesson_date`, `lesson_slot_id`
- Response 201: созданная сессия.

2. `POST /api/v1/attendance/sessions/:sessionId/records/bulk`
- Request:
```json
{
  "records": [
    { "student_id": "uuid", "status": "present", "comment": "" },
    { "student_id": "uuid", "status": "absent", "comment": "справка" }
  ]
}
```
- Response 200.

3. `GET /api/v1/attendance/students/:studentId`
- Query: `date_from`, `date_to`
- Response 200: история посещаемости.

## 8.5 Messaging

1. `GET /api/v1/messages/conversations`
- Query: `type`
- Response 200: список диалогов.

2. `POST /api/v1/messages/conversations`
- Request: `type`, `title`, `participant_ids`
- Response 201.

3. `GET /api/v1/messages/conversations/:conversationId/messages`
- Query: `before`, `limit`
- Response 200: сообщения.

4. `POST /api/v1/messages/conversations/:conversationId/messages`
- Request: `message_text`, `attachments`
- Response 201.

5. `POST /api/v1/messages/messages/:messageId/read`
- Response 200.

## 8.6 Parent links and profiles

1. `POST /api/v1/parents/links`
- Request: `parent_id`, `student_id`, `relation_type`
- Response 201.

2. `GET /api/v1/parents/:parentId/children`
- Response 200: список детей.

3. `GET /api/v1/parents/:parentId/dashboard`
- Response 200: агрегированные KPI по детям.

## 8.7 Notifications (event-driven)

1. `GET /api/v1/notifications`
- Query: `unread_only`, `type`, `limit`, `cursor`

2. `POST /api/v1/notifications/:id/read`

3. `POST /api/v1/notifications/read-all`

События:

- `grade_added`
- `homework_assigned`
- `homework_checked`
- `schedule_changed`
- `message_received`
- `attendance_absence`

## 9. Пользовательские сценарии (целевые)

1. Teacher выставляет оценку в журнале -> Student и Parent получают уведомление -> оценка отображается в дневнике.
2. Admin меняет расписание на завтра -> Teacher/Student/Parent видят изменение и push/in-app уведомление.
3. Teacher публикует ДЗ -> Student сдает работу -> Teacher проверяет и комментирует -> статус и балл обновляются у Student/Parent.
4. Teacher отмечает посещаемость урока -> данные попадают в аналитику класса и в профиль ученика/родителя.
5. Parent открывает кабинет -> видит прогресс ребенка, расписание, новые комментарии и сообщения.

## 10. Критерии готовности frontend-реализации

- Все роли видят только свои разделы (RBAC в UI).
- Навигация дневника полностью рабочая на desktop/mobile.
- Для всех новых экранов реализованы состояния `loading/empty/error/success`.
- Формы имеют валидацию и понятные ошибки.
- Единые UX-паттерны для таблиц, фильтров, карточек, диалогов.
- Локализация RU/UZ сохранена для новых экранов.
- Все контракты API покрыты клиентскими сервисами и типами ответов.

## 11. Важная оговорка по текущему шагу

- В рамках этого шага backend и API не менялись.
- Этот документ фиксирует:
- текущее состояние проекта
- полный фронтенд-план перехода к «школьному дневнику»
- целевую спецификацию БД и API для согласования с backend-командой
