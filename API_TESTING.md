# Zedly API Testing Guide

## 📋 Созданные файлы для тестирования

### 1. api-tests.http
HTTP тесты для VSCode REST Client расширения.

**Установка расширения:**
1. Откройте VSCode
2. Перейдите в Extensions (Ctrl+Shift+X)
3. Найдите "REST Client" (автор: Huachao Mao)
4. Установите

**Использование:**
1. Откройте файл `api-tests.http` в VSCode
2. Нажмите "Send Request" над любым запросом
3. Скопируйте `accessToken` из ответа Login
4. Замените `@accessToken` в начале файла на реальный токен
5. Выполняйте остальные запросы

### 2. test-api.sh
Bash скрипт для автоматического тестирования всего flow.

**Запуск:**
```bash
chmod +x test-api.sh
./test-api.sh
```

**Требования:**
- curl
- jq (для красивого вывода JSON)

Установка jq:
- Ubuntu/Debian: `sudo apt install jq`
- macOS: `brew install jq`
- Windows: скачайте с https://stedolan.github.io/jq/

## 🚀 Quick Start

### Вариант 1: VSCode REST Client

1. Откройте `api-tests.http`
2. Запустите "Login as SuperAdmin" (строка 31)
3. Скопируйте accessToken из response
4. Замените строку 12: `@accessToken = YOUR_TOKEN_HERE`
5. Запускайте остальные тесты

### Вариант 2: Bash скрипт

```bash
./test-api.sh
```

Скрипт автоматически:
- Проверит health check
- Залогинится как SuperAdmin
- Создаст тестовую школу
- Залогинится как Admin школы
- Создаст класс, учителя, ученика
- Выведет все токены и ID для дальнейшего использования

### Вариант 3: Ручные curl команды

```bash
# 1. Health Check
curl http://167.235.222.200:3001/health

# 2. Login
curl -X POST http://167.235.222.200:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin123!"}'

# 3. Get Schools (замените TOKEN)
curl http://167.235.222.200:3001/api/v1/superadmin/schools \
  -H "Authorization: Bearer TOKEN"
```

## 📝 Тестовые сценарии

### Сценарий 1: Настройка школы
1. Login as SuperAdmin
2. Create School
3. Login as School Admin
4. Create Classes (9А, 9Б, 10А)
5. Create Teachers
6. Create Students

### Сценарий 2: Массовый импорт
1. Login as School Admin
2. Create Class
3. Import Students CSV
4. Import Teachers CSV
5. Verify imported users

### Сценарий 3: CRUD операции
1. Create Teacher
2. Get All Teachers
3. Update Teacher
4. Get Teacher by ID
5. Delete Teacher

## 🔑 Credentials

**SuperAdmin:**
- Username: `admin`
- Password: `Admin123!`

**Test School Admin** (создается через API):
- Username: `testadmin_api`
- Password: `TestPass123`

## 📊 Endpoints Overview

### Auth (Public)
- POST `/auth/login` - Вход
- POST `/auth/refresh` - Обновление токена
- POST `/auth/logout` - Выход
- POST `/auth/password/forgot` - Забыли пароль
- POST `/auth/password/reset` - Сброс пароля

### Auth (Protected)
- POST `/auth/password/change` - Смена пароля

### SuperAdmin
- GET `/superadmin/schools` - Все школы
- POST `/superadmin/schools` - Создать школу
- PUT `/superadmin/schools/:id` - Обновить школу
- GET `/superadmin/schools/:id` - Получить школу
- GET `/superadmin/audit-logs` - Логи аудита
- GET `/superadmin/platform-settings` - Настройки
- PUT `/superadmin/platform-settings` - Обновить настройки

### Admin - Teachers
- GET `/admin/teachers` - Все учителя
- POST `/admin/teachers` - Создать
- PUT `/admin/teachers/:id` - Обновить
- DELETE `/admin/teachers/:id` - Удалить

### Admin - Students
- GET `/admin/students` - Все ученики
- POST `/admin/students` - Создать
- PUT `/admin/students/:id` - Обновить
- DELETE `/admin/students/:id` - Удалить

### Admin - Classes
- GET `/admin/classes` - Все классы
- POST `/admin/classes` - Создать
- PUT `/admin/classes/:id` - Обновить
- DELETE `/admin/classes/:id` - Удалить

### Admin - Import
- POST `/admin/import/students` - Импорт учеников CSV
- POST `/admin/import/teachers` - Импорт учителей CSV

## 🐛 Debug Tips

### 401 Unauthorized
- Проверьте что токен не истёк (15 минут для access token)
- Используйте refresh token для получения нового
- Убедитесь что токен передаётся в заголовке: `Authorization: Bearer TOKEN`

### 403 Forbidden
- Проверьте роль пользователя
- Admin endpoints требуют роль `admin`
- SuperAdmin endpoints требуют роль `superadmin`

### 400 Bad Request
- Проверьте формат JSON
- Убедитесь что все обязательные поля заполнены
- Проверьте типы данных (number, string, etc.)

### Connection Refused
- Проверьте что backend запущен
- Проверьте порт (3001)
- Убедитесь что firewall открыт

## 📦 CSV Import Format

### Students CSV
```csv
firstName,lastName,username,email,password,classId
Иван,Иванов,ivanov_student,ivanov@school.uz,Password123,CLASS_UUID
Мария,Петрова,petrova_student,petrova@school.uz,Password123,CLASS_UUID
```

### Teachers CSV
```csv
firstName,lastName,username,email,password,subject
Анна,Смирнова,smirnova_teacher,smirnova@school.uz,Password123,Математика
Петр,Сидоров,sidorov_teacher,sidorov@school.uz,Password123,Физика
```

**Примечания:**
- Первая строка - заголовки (обязательно)
- Кодировка UTF-8
- Разделитель - запятая
- classId опционален для учеников
- subject опционален для учителей

## 🔒 Security Notes

- Никогда не коммитьте файлы с реальными токенами
- Меняйте пароли после тестирования на production
- Используйте HTTPS в production
- Токены истекают через 15 минут (access) и 7 дней (refresh)

## 📈 Performance Testing

Для нагрузочного тестирования используйте:
- Apache Bench (ab)
- wrk
- k6
- Artillery

Пример с Apache Bench:
```bash
ab -n 1000 -c 10 http://167.235.222.200:3001/health
```

## 🎯 Next Steps

1. Запустите health check
2. Выполните login
3. Создайте тестовую школу
4. Протестируйте CRUD операции
5. Попробуйте импорт из CSV
6. Проверьте обработку ошибок

Удачи в тестировании! 🚀
