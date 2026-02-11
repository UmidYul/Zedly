# UUID Migration Guide

## Обзор

Все ID в базе данных теперь используют тип **UUID** вместо **BIGINT/BIGSERIAL**. Это обеспечивает:

- ✅ Глобально уникальные идентификаторы
- ✅ Безопасность (невозможно угадать ID)
- ✅ Лучшая масштабируемость
- ✅ Совместимость с распределенными системами
- ✅ Не требует расширений PostgreSQL 13+

## Что изменилось

### База данных

**ДО:**
```sql
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    school_id BIGINT REFERENCES schools(id),
    ...
);
```

**ПОСЛЕ:**
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID REFERENCES schools(id),
    ...
);
```

### Все таблицы с изменениями

Все следующие таблицы теперь используют UUID:
- schools
- users
- refresh_tokens
- subjects
- classes
- class_students
- teacher_subjects
- teacher_classes
- teacher_class_subjects
- tests
- questions
- test_questions
- test_assignments
- test_attempts
- career_interests
- student_career_results
- student_performance
- leaderboards
- teacher_statistics
- notifications
- notification_preferences
- calendar_events
- scheduled_reports (recipients теперь UUID[])
- report_archives
- kb_categories
- kb_articles
- audit_logs (entity_id теперь UUID)

## Применение миграции

### Для новой установки

```bash
# Создать базу данных
psql -U postgres -c "CREATE DATABASE zedly;"

# Применить новую схему
psql -U postgres -d zedly -f database/schema_safe.sql

# Загрузить тестовые данные
psql -U postgres -d zedly -f database/seed_safe.sql
```

### Для существующей базы данных (БЕЗ ДАННЫХ)

```bash
# Удалить и пересоздать
psql -U postgres -c "DROP DATABASE IF EXISTS zedly;"
psql -U postgres -c "CREATE DATABASE zedly;"
psql -U postgres -d zedly -f database/schema_safe.sql
psql -U postgres -d zedly -f database/seed_safe.sql
```

### Для базы с важными данными

⚠️ **ВНИМАНИЕ**: Нужна ручная миграция данных!

1. Создать полный бэкап:
```bash
pg_dump -U postgres zedly > backup_before_uuid.sql
```

2. Экспортировать данные в JSON/CSV
3. Создать mapping старых ID → новых UUID
4. Трансформировать данные
5. Загрузить в новую схему

## Изменения в коде приложения

### Backend (Node.js)

#### Генерация UUID

PostgreSQL генерирует UUID автоматически через `DEFAULT gen_random_uuid()`.

Или генерация на стороне приложения:
```javascript
const { randomUUID } = require('crypto');

const newId = randomUUID(); // '550e8400-e29b-41d4-a716-446655440000'
```

#### Проверка UUID

```javascript
function isValidUUID(str) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
}

// В middleware
if (!isValidUUID(req.params.id)) {
    return res.status(400).json({ error: 'Invalid ID format' });
}
```

#### SQL запросы

**ДО:**
```javascript
const result = await pool.query(
    'SELECT * FROM users WHERE id = $1',
    [parseInt(userId)] // Преобразование в число
);
```

**ПОСЛЕ:**
```javascript
const result = await pool.query(
    'SELECT * FROM users WHERE id = $1',
    [userId] // UUID как строка
);
```

#### INSERT запросы

PostgreSQL автоматически генерирует UUID:
```javascript
const result = await pool.query(
    'INSERT INTO schools (name, address) VALUES ($1, $2) RETURNING id',
    [name, address]
);
// result.rows[0].id будет UUID строкой
```

Или с явным UUID:
```javascript
const { randomUUID } = require('crypto');
const id = randomUUID();

await pool.query(
    'INSERT INTO schools (id, name, address) VALUES ($1, $2, $3)',
    [id, name, address]
);
```

### Frontend (JavaScript)

#### Валидация URL параметров

```javascript
// Старый код НЕ РАБОТАЕТ с UUID
const id = parseInt(window.location.pathname.split('/')[2]); // ❌

// Новый код
const id = window.location.pathname.split('/')[2]; // ✅
if (!isValidUUID(id)) {
    showError('Invalid ID');
    return;
}

function isValidUUID(str) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
}
```

#### API запросы

```javascript
// Раньше
fetch(`/api/users/${parseInt(userId)}`) // ❌

// Теперь
fetch(`/api/users/${userId}`) // ✅
```

#### Сравнение ID

```javascript
// UUID сравнение как строки
if (user.id === school.admin_id) { // ✅
    // ...
}

// НЕ преобразовывать в числа!
if (parseInt(user.id) === parseInt(school.admin_id)) { // ❌ ОШИБКА
```

#### LocalStorage/SessionStorage

```javascript
// UUID можно хранить как есть
localStorage.setItem('currentSchoolId', schoolId);
const schoolId = localStorage.getItem('currentSchoolId');
```

## Примеры тестовых UUID

Для разработки используются предсказуемые UUID в seed_safe.sql:

```javascript
const TEST_IDS = {
    SCHOOL_1: '11111111-1111-1111-1111-111111111111',
    SUPERADMIN: '22222222-2222-2222-2222-222222222222',
    ADMIN_1: '33333333-3333-3333-3333-333333333333',
    TEACHER_1: '44444444-4444-4444-4444-444444444444',
    STUDENT_1: '55555555-5555-5555-5555-555555555555',
    SUBJECT_MATH: '66666666-6666-6666-6666-666666666666',
    CLASS_9A: '77777777-7777-7777-7777-777777777777',
};
```

## PostgreSQL функции

### gen_random_uuid()

Встроенная функция PostgreSQL 13+ (не требует расширений):

```sql
-- Автоматическая генерация при INSERT
INSERT INTO schools (name) VALUES ('School 1') RETURNING id;
-- Вернет: 550e8400-e29b-41d4-a716-446655440000

-- Ручная генерация
SELECT gen_random_uuid();
-- Вернет: 7c9e6679-7425-40de-944b-e07fc1f90ae7
```

### Преобразование строки в UUID

```sql
-- Явное преобразование
SELECT '550e8400-e29b-41d4-a716-446655440000'::uuid;

-- В WHERE
SELECT * FROM users WHERE id = '550e8400-e29b-41d4-a716-446655440000'::uuid;
```

## Частые ошибки

### ❌ Попытка использовать числа

```javascript
// ОШИБКА
const userId = 123;
await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
// PostgreSQL error: invalid input syntax for type uuid: "123"
```

### ❌ Преобразование UUID в число

```javascript
// ОШИБКА
const numericId = parseInt(uuid);
// NaN - UUID не является числом!
```

### ❌ Автоинкремент

```sql
-- ОШИБКА: UUID не поддерживает автоинкремент
SELECT MAX(id) + 1 FROM users; -- Не работает с UUID
```

### ✅ Правильное использование

```javascript
// Получение UUID из базы
const result = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
const userId = result.rows[0].id; // UUID строка

// Использование в запросах
await pool.query('INSERT INTO test_attempts (student_id, test_id) VALUES ($1, $2)', 
    [userId, testId]);

// Сравнение
if (userId === currentUserId) { // Сравнение строк
    // ...
}
```

## Производительность

### Индексы

UUID индексируется так же эффективно как BIGINT:

```sql
CREATE INDEX idx_users_school_id ON users(school_id); -- Работает отлично
```

### Размер данных

- BIGINT: 8 байт
- UUID: 16 байт

Увеличение размера составляет ~2x, но это компенсируется:
- Безопасностью (невозможно угадать ID)
- Отсутствием коллизий при merge данных
- Возможностью генерации ID на клиенте

### JOIN производительность

UUID в JOIN операциях имеет сопоставимую производительность с BIGINT при правильных индексах.

## Контрольный список миграции кода

### Backend

- [ ] Удалить все `parseInt()` для ID из БД
- [ ] Добавить валидацию UUID в middleware
- [ ] Проверить все SQL запросы с ID параметрами
- [ ] Обновить все INSERT/UPDATE запросы
- [ ] Проверить audit_logs для entity_id
- [ ] Проверить массивы ID (например recipients в scheduled_reports)

### Frontend

- [ ] Удалить parseInt() для ID из URL/API
- [ ] Добавить функцию isValidUUID()
- [ ] Проверить все fetch/API вызовы
- [ ] Обновить localStorage/sessionStorage операции
- [ ] Проверить все сравнения ID (===)
- [ ] Обновить тесты/моки с новыми UUID

### Тестирование

- [ ] Тест создания записей (проверить UUID в RETURNING)
- [ ] Тест foreign key связей
- [ ] Тест API endpoints с UUID параметрами
- [ ] Тест валидации ID
- [ ] Тест массовых операций

## Поддержка

Если у вас есть вопросы по миграции на UUID:

1. Проверьте этот документ
2. Посмотрите примеры в seed_safe.sql
3. Проверьте schema_safe.sql для структуры таблиц

## Дополнительные ресурсы

- [PostgreSQL UUID Documentation](https://www.postgresql.org/docs/current/datatype-uuid.html)
- [Node.js Crypto randomUUID](https://nodejs.org/api/crypto.html#cryptorandomuuidoptions)
- [UUID RFC 4122](https://www.rfc-editor.org/rfc/rfc4122)
