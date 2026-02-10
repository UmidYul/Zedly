# ZEDLY Database Documentation

## Обзор

База данных ZEDLY построена на PostgreSQL и использует UUID для первичных ключей для улучшения безопасности и масштабируемости.

## Основные таблицы

### 1. Core Tables (Основные)

#### `schools` - Школы
Хранит информацию о школах в системе.

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | UUID | Первичный ключ |
| name_ru | VARCHAR(255) | Название на русском |
| name_uz | VARCHAR(255) | Название на узбекском |
| address | TEXT | Адрес |
| city | VARCHAR(100) | Город |
| region | VARCHAR(100) | Регион |
| phone | VARCHAR(20) | Телефон |
| email | VARCHAR(255) | Email |
| website | VARCHAR(255) | Веб-сайт |
| logo_url | TEXT | URL логотипа |
| is_active | BOOLEAN | Активна ли школа |
| settings | JSONB | Настройки школы |
| created_at | TIMESTAMP | Дата создания |
| updated_at | TIMESTAMP | Дата обновления |

#### `users` - Пользователи
Хранит всех пользователей системы (SuperAdmin, SchoolAdmin, Teacher, Student).

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | UUID | Первичный ключ |
| school_id | UUID | FK к schools (NULL для SuperAdmin) |
| role | ENUM | superAdmin/schoolAdmin/teacher/student |
| username | VARCHAR(100) | Уникальный логин |
| email | VARCHAR(255) | Email |
| phone | VARCHAR(20) | Телефон |
| password_hash | VARCHAR(255) | Хэш пароля (bcrypt) |
| first_name | VARCHAR(100) | Имя |
| last_name | VARCHAR(100) | Фамилия |
| middle_name | VARCHAR(100) | Отчество |
| avatar_url | TEXT | URL аватара |
| is_otp | BOOLEAN | Временный пароль? |
| must_change_password | BOOLEAN | Требуется смена пароля? |
| telegram_id | BIGINT | Telegram ID для уведомлений |
| telegram_username | VARCHAR(100) | Telegram username |
| is_active | BOOLEAN | Активен ли пользователь |
| last_login | TIMESTAMP | Последний вход |
| login_attempts | INT | Попытки входа |
| locked_until | TIMESTAMP | Заблокирован до (после 5 попыток) |
| settings | JSONB | Настройки пользователя |
| created_at | TIMESTAMP | Дата создания |
| updated_at | TIMESTAMP | Дата обновления |

**Constraint**: SuperAdmin не имеет school_id, остальные роли обязательно должны иметь.

#### `refresh_tokens` - Refresh токены
Хранит refresh токены для JWT аутентификации.

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | UUID | Первичный ключ |
| user_id | UUID | FK к users |
| token | VARCHAR(500) | Refresh token |
| expires_at | TIMESTAMP | Срок действия |
| is_revoked | BOOLEAN | Отозван ли токен |
| created_at | TIMESTAMP | Дата создания |

### 2. Academic Structure (Академическая структура)

#### `subjects` - Предметы
Предметы для каждой школы.

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | UUID | Первичный ключ |
| school_id | UUID | FK к schools |
| name_ru | VARCHAR(255) | Название на русском |
| name_uz | VARCHAR(255) | Название на узбекском |
| description_ru | TEXT | Описание на русском |
| description_uz | TEXT | Описание на узбекском |
| color | VARCHAR(7) | Цвет для визуализации (#hex) |
| icon | VARCHAR(50) | Иконка |
| is_active | BOOLEAN | Активен ли предмет |
| created_at | TIMESTAMP | Дата создания |
| updated_at | TIMESTAMP | Дата обновления |

#### `classes` - Классы
Классы в школе (10А, 9Б, и т.д.).

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | UUID | Первичный ключ |
| school_id | UUID | FK к schools |
| name | VARCHAR(50) | Название класса (10А, 9Б) |
| grade | INT | Параллель (1-11) |
| homeroom_teacher_id | UUID | FK к users (классный руководитель) |
| academic_year | VARCHAR(20) | Учебный год (2024-2025) |
| is_active | BOOLEAN | Активен ли класс |
| created_at | TIMESTAMP | Дата создания |
| updated_at | TIMESTAMP | Дата обновления |

**Unique**: (school_id, name, academic_year)

#### `class_students` - Ученики в классах
Связь многие-ко-многим между классами и учениками.

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | UUID | Первичный ключ |
| class_id | UUID | FK к classes |
| student_id | UUID | FK к users |
| joined_at | TIMESTAMP | Дата поступления |
| left_at | TIMESTAMP | Дата выбытия |
| is_active | BOOLEAN | Активен ли в классе |

#### `teacher_subjects` - Предметы учителей
Какие предметы преподает учитель.

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | UUID | Первичный ключ |
| teacher_id | UUID | FK к users |
| subject_id | UUID | FK к subjects |
| created_at | TIMESTAMP | Дата создания |

#### `teacher_classes` - Классы учителей
Каким классам преподает учитель по предмету.

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | UUID | Первичный ключ |
| teacher_id | UUID | FK к users |
| class_id | UUID | FK к classes |
| subject_id | UUID | FK к subjects |
| created_at | TIMESTAMP | Дата создания |

### 3. Testing System (Система тестирования)

#### `tests` - Тесты
Основная таблица тестов.

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | UUID | Первичный ключ |
| school_id | UUID | FK к schools |
| subject_id | UUID | FK к subjects |
| creator_id | UUID | FK к users |
| title_ru | VARCHAR(255) | Название на русском |
| title_uz | VARCHAR(255) | Название на узбекском |
| description_ru | TEXT | Описание на русском |
| description_uz | TEXT | Описание на узбекском |
| type | VARCHAR(50) | practice/exam/career |
| duration_minutes | INT | Длительность (NULL = unlimited) |
| passing_score | DECIMAL(5,2) | Минимальный процент для прохождения |
| max_attempts | INT | Максимальное количество попыток |
| shuffle_questions | BOOLEAN | Случайный порядок вопросов |
| shuffle_answers | BOOLEAN | Случайный порядок ответов |
| show_answers | BOOLEAN | Показывать правильные ответы |
| fullscreen_required | BOOLEAN | Требовать полноэкранный режим |
| block_copy_paste | BOOLEAN | Блокировать копирование |
| track_tab_switches | BOOLEAN | Отслеживать переключения вкладок |
| adaptive_testing | BOOLEAN | Адаптивное тестирование |
| grading_scale | JSONB | Шкала оценок {"90": 5, "80": 4...} |
| is_active | BOOLEAN | Активен ли тест |
| published_at | TIMESTAMP | Дата публикации |
| created_at | TIMESTAMP | Дата создания |
| updated_at | TIMESTAMP | Дата обновления |

#### `questions` - Банк вопросов
Все вопросы в системе.

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | UUID | Первичный ключ |
| school_id | UUID | FK к schools |
| subject_id | UUID | FK к subjects |
| creator_id | UUID | FK к users |
| type | ENUM | single/multi/number/truefalse/matching/ordering/fillblank/imagebased/formula |
| question_text_ru | TEXT | Текст вопроса на русском |
| question_text_uz | TEXT | Текст вопроса на узбекском |
| question_image_url | TEXT | URL изображения вопроса |
| answer_data | JSONB | Данные ответов (структура зависит от типа) |
| points | DECIMAL(5,2) | Баллы за вопрос |
| difficulty | INT | Сложность (1-5) |
| explanation_ru | TEXT | Объяснение правильного ответа (рус) |
| explanation_uz | TEXT | Объяснение правильного ответа (уз) |
| tags | TEXT[] | Теги для поиска |
| times_used | INT | Сколько раз использован |
| avg_score | DECIMAL(5,2) | Средний балл |
| is_active | BOOLEAN | Активен ли вопрос |
| created_at | TIMESTAMP | Дата создания |
| updated_at | TIMESTAMP | Дата обновления |

**answer_data структуры**:

```json
// single/multi choice
{
  "options": [
    {"id": "a", "text_ru": "Ответ А", "text_uz": "Javob A", "is_correct": true},
    {"id": "b", "text_ru": "Ответ Б", "text_uz": "Javob B", "is_correct": false}
  ]
}

// number
{
  "correct_answer": 42,
  "tolerance": 0.1
}

// truefalse
{
  "correct_answer": true
}

// matching
{
  "pairs": [
    {"left": "Москва", "right": "Россия"},
    {"left": "Ташкент", "right": "Узбекистан"}
  ]
}

// ordering
{
  "items": ["Первое", "Второе", "Третье"],
  "correct_order": [0, 1, 2]
}

// fillblank
{
  "text": "Столица Франции - ___",
  "blanks": [{"position": 0, "answer": "Париж", "case_sensitive": false}]
}

// imagebased
{
  "image_url": "https://...",
  "correct_areas": [{"x": 100, "y": 100, "width": 50, "height": 50}]
}

// formula
{
  "correct_formula": "x^2 + 2x + 1"
}
```

#### `test_questions` - Вопросы в тесте
Связь между тестами и вопросами.

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | UUID | Первичный ключ |
| test_id | UUID | FK к tests |
| question_id | UUID | FK к questions |
| order_index | INT | Порядковый номер |
| points | DECIMAL(5,2) | Баллы (можно переопределить) |
| created_at | TIMESTAMP | Дата создания |

#### `test_assignments` - Назначение тестов
Назначение тестов классам.

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | UUID | Первичный ключ |
| test_id | UUID | FK к tests |
| class_id | UUID | FK к classes |
| assigned_by | UUID | FK к users |
| start_date | TIMESTAMP | Дата начала |
| due_date | TIMESTAMP | Крайний срок |
| is_active | BOOLEAN | Активно ли назначение |
| created_at | TIMESTAMP | Дата создания |

#### `test_attempts` - Попытки прохождения
Попытки учеников пройти тесты.

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | UUID | Первичный ключ |
| test_id | UUID | FK к tests |
| student_id | UUID | FK к users |
| attempt_number | INT | Номер попытки |
| started_at | TIMESTAMP | Время начала |
| completed_at | TIMESTAMP | Время завершения |
| duration_seconds | INT | Длительность |
| tab_switches | INT | Переключения вкладок |
| copy_attempts | INT | Попытки копирования |
| suspicious_activity | JSONB | Подозрительная активность |
| total_questions | INT | Всего вопросов |
| correct_answers | INT | Правильных ответов |
| score | DECIMAL(5,2) | Процент правильных ответов |
| grade | INT | Оценка (2-5) |
| passed | BOOLEAN | Прошел ли тест |
| answers | JSONB | Ответы ученика {question_id: answer} |
| is_completed | BOOLEAN | Завершен ли тест |
| created_at | TIMESTAMP | Дата создания |
| updated_at | TIMESTAMP | Дата обновления |

### 4. Career Orientation (Профориентация)

#### `career_interests` - Сферы интересов
Категории интересов для профориентации.

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | UUID | Первичный ключ |
| name_ru | VARCHAR(100) | Название на русском |
| name_uz | VARCHAR(100) | Название на узбекском |
| description_ru | TEXT | Описание на русском |
| description_uz | TEXT | Описание на узбекском |
| icon | VARCHAR(50) | Иконка |
| color | VARCHAR(7) | Цвет (#hex) |
| created_at | TIMESTAMP | Дата создания |

**Предустановленные сферы**:
- Точные науки
- Естественные науки
- Гуманитарные науки
- Искусство
- Технологии
- Социальные науки

#### `student_career_results` - Результаты профориентации
Результаты профориентационного теста ученика.

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | UUID | Первичный ключ |
| student_id | UUID | FK к users |
| test_id | UUID | FK к tests |
| attempt_id | UUID | FK к test_attempts |
| interests_scores | JSONB | Баллы по интересам {interest_id: score} |
| recommended_subjects | JSONB | Рекомендуемые предметы [subject_id, ...] |
| completed_at | TIMESTAMP | Дата завершения |

### 5. Analytics & Statistics (Аналитика и статистика)

#### `student_performance` - Производительность ученика
Кэш статистики ученика по предметам.

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | UUID | Первичный ключ |
| student_id | UUID | FK к users |
| school_id | UUID | FK к schools |
| subject_id | UUID | FK к subjects |
| total_tests | INT | Всего тестов |
| completed_tests | INT | Завершенных тестов |
| avg_score | DECIMAL(5,2) | Средний балл |
| avg_grade | DECIMAL(3,2) | Средняя оценка |
| current_streak | INT | Текущая серия (дни подряд) |
| longest_streak | INT | Самая длинная серия |
| last_activity | TIMESTAMP | Последняя активность |
| class_rank | INT | Место в классе |
| school_rank | INT | Место в школе |
| updated_at | TIMESTAMP | Дата обновления |

#### `leaderboards` - Таблица лидеров
Рейтинги учеников по классу/школе.

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | UUID | Первичный ключ |
| school_id | UUID | FK к schools |
| class_id | UUID | FK к classes |
| student_id | UUID | FK к users |
| scope | VARCHAR(20) | class/school |
| period | VARCHAR(20) | week/month/quarter/year/all |
| total_score | DECIMAL(10,2) | Общий балл |
| tests_completed | INT | Завершенных тестов |
| avg_score | DECIMAL(5,2) | Средний балл |
| rank | INT | Место |
| calculated_at | TIMESTAMP | Дата расчета |

#### `teacher_statistics` - Статистика учителя
Кэш статистики учителя.

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | UUID | Первичный ключ |
| teacher_id | UUID | FK к users |
| school_id | UUID | FK к schools |
| total_tests_created | INT | Создано тестов |
| total_tests_assigned | INT | Назначено тестов |
| total_students | INT | Всего учеников |
| avg_student_score | DECIMAL(5,2) | Средний балл учеников |
| success_rate | DECIMAL(5,2) | Процент успешных |
| school_rank | INT | Место среди учителей |
| updated_at | TIMESTAMP | Дата обновления |

### 6. Notifications (Уведомления)

#### `notifications` - Уведомления
Все уведомления пользователей.

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | UUID | Первичный ключ |
| user_id | UUID | FK к users |
| type | ENUM | test_assigned/test_reminder/test_graded/password_reset/account_created/system_announcement |
| channel | ENUM | email/telegram/in_app |
| title_ru | VARCHAR(255) | Заголовок на русском |
| title_uz | VARCHAR(255) | Заголовок на узбекском |
| message_ru | TEXT | Сообщение на русском |
| message_uz | TEXT | Сообщение на узбекском |
| data | JSONB | Дополнительные данные |
| is_read | BOOLEAN | Прочитано ли |
| is_sent | BOOLEAN | Отправлено ли |
| sent_at | TIMESTAMP | Время отправки |
| read_at | TIMESTAMP | Время прочтения |
| created_at | TIMESTAMP | Дата создания |

#### `notification_preferences` - Настройки уведомлений
Предпочтения пользователя по уведомлениям.

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | UUID | Первичный ключ |
| user_id | UUID | FK к users |
| email_enabled | BOOLEAN | Email включен |
| telegram_enabled | BOOLEAN | Telegram включен |
| in_app_enabled | BOOLEAN | In-app включены |
| test_assigned | BOOLEAN | Уведомления о назначении тестов |
| test_reminder | BOOLEAN | Напоминания о тестах |
| test_graded | BOOLEAN | Уведомления о результатах |
| password_reset | BOOLEAN | Сброс пароля |
| account_created | BOOLEAN | Создание аккаунта |
| system_announcement | BOOLEAN | Системные объявления |
| created_at | TIMESTAMP | Дата создания |
| updated_at | TIMESTAMP | Дата обновления |

### 7. Calendar & Scheduling (Календарь)

#### `calendar_events` - События календаря
Тесты и события в календаре.

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | UUID | Первичный ключ |
| school_id | UUID | FK к schools |
| test_id | UUID | FK к tests |
| class_id | UUID | FK к classes |
| title_ru | VARCHAR(255) | Заголовок на русском |
| title_uz | VARCHAR(255) | Заголовок на узбекском |
| description_ru | TEXT | Описание на русском |
| description_uz | TEXT | Описание на узбекском |
| event_type | VARCHAR(50) | test/exam/reminder |
| start_date | TIMESTAMP | Дата начала |
| end_date | TIMESTAMP | Дата окончания |
| reminder_before_minutes | INT | Напомнить за N минут |
| created_at | TIMESTAMP | Дата создания |
| updated_at | TIMESTAMP | Дата обновления |

### 8. Reports & Exports (Отчеты)

#### `scheduled_reports` - Запланированные отчеты
Автоматические отчеты (еженедельные, месячные, годовые).

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | UUID | Первичный ключ |
| school_id | UUID | FK к schools |
| recipient_id | UUID | FK к users |
| report_type | VARCHAR(50) | weekly/monthly/yearly |
| report_scope | VARCHAR(50) | director/teacher/parent |
| schedule_cron | VARCHAR(100) | Cron выражение |
| last_sent | TIMESTAMP | Последняя отправка |
| next_run | TIMESTAMP | Следующий запуск |
| is_active | BOOLEAN | Активен ли |
| created_at | TIMESTAMP | Дата создания |
| updated_at | TIMESTAMP | Дата обновления |

#### `report_archives` - Архив отчетов
Сгенерированные отчеты.

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | UUID | Первичный ключ |
| school_id | UUID | FK к schools |
| generated_by | UUID | FK к users |
| report_type | VARCHAR(50) | Тип отчета |
| report_name | VARCHAR(255) | Название отчета |
| file_url | TEXT | URL файла |
| file_size_bytes | BIGINT | Размер файла |
| period_start | DATE | Начало периода |
| period_end | DATE | Конец периода |
| metadata | JSONB | Метаданные |
| created_at | TIMESTAMP | Дата создания |

### 9. Knowledge Base (База знаний)

#### `kb_categories` - Категории базы знаний
Категории статей и материалов.

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | UUID | Первичный ключ |
| school_id | UUID | FK к schools |
| parent_id | UUID | FK к kb_categories (для иерархии) |
| name_ru | VARCHAR(255) | Название на русском |
| name_uz | VARCHAR(255) | Название на узбекском |
| description_ru | TEXT | Описание на русском |
| description_uz | TEXT | Описание на узбекском |
| icon | VARCHAR(50) | Иконка |
| order_index | INT | Порядковый номер |
| is_active | BOOLEAN | Активна ли |
| created_at | TIMESTAMP | Дата создания |
| updated_at | TIMESTAMP | Дата обновления |

#### `kb_articles` - Статьи базы знаний
Статьи, видео, PDF и ссылки.

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | UUID | Первичный ключ |
| school_id | UUID | FK к schools |
| category_id | UUID | FK к kb_categories |
| subject_id | UUID | FK к subjects |
| author_id | UUID | FK к users |
| title_ru | VARCHAR(255) | Заголовок на русском |
| title_uz | VARCHAR(255) | Заголовок на узбекском |
| content_ru | TEXT | Содержание на русском |
| content_uz | TEXT | Содержание на узбекском |
| type | VARCHAR(50) | article/video/pdf/link |
| url | TEXT | Внешняя ссылка |
| file_url | TEXT | Загруженный файл |
| tags | TEXT[] | Теги |
| views | INT | Просмотры |
| is_published | BOOLEAN | Опубликована ли |
| published_at | TIMESTAMP | Дата публикации |
| created_at | TIMESTAMP | Дата создания |
| updated_at | TIMESTAMP | Дата обновления |

### 10. Audit Log (Журнал аудита)

#### `audit_logs` - Журнал аудита
Все критичные действия в системе.

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | UUID | Первичный ключ |
| school_id | UUID | FK к schools |
| user_id | UUID | FK к users |
| action | ENUM | create/update/delete/login/logout/password_reset/password_change/test_assign/test_start/test_complete/bulk_import/export |
| entity_type | VARCHAR(50) | user/test/class/etc. |
| entity_id | UUID | ID сущности |
| description_ru | TEXT | Описание на русском |
| description_uz | TEXT | Описание на узбекском |
| ip_address | INET | IP адрес |
| user_agent | TEXT | User Agent |
| old_data | JSONB | Старые данные |
| new_data | JSONB | Новые данные |
| created_at | TIMESTAMP | Дата создания |

### 11. System Settings (Системные настройки)

#### `system_settings` - Системные настройки
Настройки системы и школ.

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | UUID | Первичный ключ |
| school_id | UUID | FK к schools (NULL для глобальных) |
| key | VARCHAR(100) | Ключ настройки |
| value | JSONB | Значение |
| description | TEXT | Описание |
| updated_by | UUID | FK к users |
| updated_at | TIMESTAMP | Дата обновления |

**Unique**: (school_id, key)

#### `backup_history` - История бэкапов
История автоматических и ручных бэкапов.

| Колонка | Тип | Описание |
|---------|-----|----------|
| id | UUID | Первичный ключ |
| school_id | UUID | FK к schools |
| backup_type | VARCHAR(50) | full/incremental/manual |
| file_path | TEXT | Путь к файлу |
| file_size_bytes | BIGINT | Размер файла |
| status | VARCHAR(50) | success/failed/in_progress |
| error_message | TEXT | Сообщение об ошибке |
| started_at | TIMESTAMP | Время начала |
| completed_at | TIMESTAMP | Время завершения |
| created_by | UUID | FK к users |
| created_at | TIMESTAMP | Дата создания |

## Индексы

Все важные колонки индексированы для оптимизации производительности:

- `users`: school_id, role, username, email
- `tests`: school_id, subject_id, creator_id, type
- `questions`: school_id, subject_id, type, tags (GIN index)
- `test_attempts`: test_id, student_id, is_completed
- `audit_logs`: school_id, user_id, created_at
- `notifications`: user_id, is_read, created_at
- `student_performance`: student_id, subject_id
- `leaderboards`: school_id, class_id, scope, period

## Триггеры

### `update_updated_at_column`
Автоматически обновляет колонку `updated_at` при изменении записи.

Применяется к таблицам:
- schools
- users
- subjects
- classes
- tests
- questions
- test_attempts

## Безопасность

### School Isolation (Изоляция школ)
Все бизнес-таблицы содержат `school_id` для изоляции данных между школами.

### RBAC (Role-Based Access Control)
Проверки на уровне API:
1. Проверка роли пользователя
2. Проверка принадлежности к школе
3. Проверка владения объектом (IDOR protection)

### Рекомендации:
- Использовать prepared statements (защита от SQL injection)
- Хэшировать пароли с bcrypt (rounds=10)
- Логировать все критичные действия в audit_logs
- Регулярные бэкапы (автоматические через cron)

## Примечания

- Все текстовые поля дублируются на русском и узбекском языках (name_ru, name_uz)
- JSON/JSONB используется для гибких структур данных (настройки, answer_data, метаданные)
- TIMESTAMP используется вместо DATE для более точного отслеживания
- UUID используется для всех первичных ключей для безопасности и распределенных систем
