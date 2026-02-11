# Database Migrations

Эта папка содержит опциональные миграции для расширения базы данных дополнительными функциями.

## Текущие миграции

### add_is_otp_column.sql
Добавляет колонку `is_otp` в таблицу `users` для отслеживания временных паролей.

**Статус:** Опционально  
**Применение:** Приложение работает без этой колонки

```bash
psql -U zedly_user -d zedly_db -f add_is_otp_column.sql
```

### add_audit_action_values.sql
Добавляет значения `password_reset` и `password_change` в enum `audit_action`.

**Статус:** Опционально  
**Применение:** Приложение использует `update` с `action_type` в details. После применения этой миграции можно изменить код на использование прямых значений enum.

```bash
psql -U zedly_user -d zedly_db -f add_audit_action_values.sql
```

## Исправленные проблемы

### Проблема 1: is_otp column not found
**Решение:** Удалены все ссылки на `is_otp` из кода. Приложение использует только `must_change_password`.

### Проблема 2: invalid enum value "reset_password"
**Решение:** Изменен код для использования существующих значений enum:
- `reset_password` → `update` (с `action_type: 'password_reset'` в details)
- `change_password` → `update` (с `action_type: 'password_change'` в details)

## Production база данных

Ваша production база использует упрощенную схему (`schema_safe.sql`) с минимальным набором enum значений:

**audit_action enum:**
- `login`
- `logout`
- `create`
- `update`
- `delete`
- `view`
- `export`
- `import`

Приложение адаптировано для работы с этими значениями.

## Применение миграций

Миграции написаны с проверкой существования, поэтому их можно безопасно запускать несколько раз:

```bash
cd database/migrations
psql -U your_user -d your_database -f add_is_otp_column.sql
psql -U your_user -d your_database -f add_audit_action_values.sql
```

Или через pgAdmin:
1. Откройте pgAdmin
2. Подключитесь к базе данных
3. Tools → Query Tool
4. Откройте файл миграции
5. Нажмите Execute (F5)
