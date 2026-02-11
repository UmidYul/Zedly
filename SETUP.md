# 🚀 ZEDLY Quick Setup Guide

Это полное руководство по настройке и запуску ZEDLY платформы на локальной машине.

## ✅ Что было сделано

Все критические файлы для инициализации уже созданы:
- ✅ `database/schema_safe.sql` - полная схема БД (17 таблиц)
- ✅ `database/seed_safe.sql` - тестовые данные (школа, пользователи, тесты)
- ✅ `database/reset_db.sh` - скрипт инициализации БД
- ✅ `backend/.env` - конфигурация сервера

## 🔧 Требования

### Обязательное:
- **Node.js** 14+ 
- **PostgreSQL** 12+

### Опционально:
- Gmail аккаунт (для email уведомлений)
- Telegram бот (для Telegram уведомлений)

---

## 📦 1. Установка PostgreSQL

### На macOS (с Homebrew):
```bash
# Установите Homebrew если еще нет
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Установите PostgreSQL
brew install postgresql@16

# Запустите PostgreSQL
brew services start postgresql@16

# Проверьте что установилось
psql --version
```

### На Linux (Ubuntu/Debian):
```bash
sudo apt-get update
sudo apt-get install postgresql postgresql-contrib

# PostgreSQL должна запуститься автоматически
sudo systemctl status postgresql
```

### На Windows:
1. Скачайте от https://www.postgresql.org/download/windows/
2. Запустите установщик
3. Запомните пароль для пользователя `postgres`

---

## 🎯 2. Инициализация Базы Данных

### Шаг 1: Перейдите в папку проекта
```bash
cd /Users/premium/Desktop/Zedly
```

### Шаг 2 (Mac/Linux): Запустите скрипт инициализации
```bash
chmod +x database/reset_db.sh
./database/reset_db.sh
```

**Windows:** Используйте `reset_db.bat` (или запустите SQL вручную через psql)

### Шаг 3 (вручную если нужно):
```bash
# Подключитесь к PostgreSQL
psql -U postgres

# В psql консоли:
CREATE DATABASE zedly;
\q

# Примените схему
psql -U postgres -d zedly -f database/schema_safe.sql

# Загрузите тестовые данные
psql -U postgres -d zedly -f database/seed_safe.sql
```

### Проверка успеха:
```bash
psql -U postgres -d zedly -c "SELECT COUNT(*) as tables FROM information_schema.tables WHERE table_schema='public';"
# Должно быть 17+ таблиц
```

---

## 🚀 3. Запуск Backend сервера

### Шаг 1: Установите зависимости
```bash
cd backend
npm install
```

### Шаг 2: Убедитесь что .env файл создан
```bash
# .env должен уже существовать в backend/.env
# Проверьте что DB_PASSWORD совпадает с паролем postgres
cat .env | grep DB_
```

### Шаг 3: Запустите сервер
```bash
# Development mode (с автоперезагрузкой)
npm run dev

# Или production mode
npm start
```

**Ожидаемый вывод:**
```
=== Environment Check ===
NODE_ENV: development
PORT: 5000
DB_HOST: localhost
DB_NAME: zedly
.env file exists: true
✓ Connected to PostgreSQL database
Loading API routes...
✓ Auth routes loaded: /api/auth
✓ SuperAdmin routes loaded: /api/superadmin
✓ SchoolAdmin routes loaded: /api/admin
✓ Teacher routes loaded: /api/teacher
✓ Student routes loaded: /api/student
✓ Analytics routes loaded: /api/analytics

Server running at http://localhost:5000
```

---

## 🌐 4. Доступ к приложению

### Откройте в браузере:
```
http://localhost:5000
```

### Тестовые пользователи:

| Роль | Логин | Пароль | 
|------|-------|--------|
| **SuperAdmin** | superadmin | admin123 |
| **SchoolAdmin** | admin1 | admin123 |
| **Teacher** | teacher1 | admin123 |
| **Student** | student1 | admin123 |
| **Student** | student2 | admin123 |

---

## 📋 5. Структура файлов

```
/Users/premium/Desktop/Zedly/
├── backend/
│   ├── src/
│   │   ├── server.js           # Express сервер
│   │   ├── config/
│   │   │   └── database.js      # Подключение к БД
│   │   ├── routes/
│   │   │   ├── auth.js          # Аутентификация
│   │   │   ├── superadmin.js    # SuperAdmin API
│   │   │   ├── admin.js         # SchoolAdmin API
│   │   │   ├── teacher.js       # Teacher API
│   │   │   ├── student.js       # Student API
│   │   │   └── analytics.js     # Аналитика
│   │   └── middleware/
│   │       └── auth.js          # JWT, RBAC, изоляция
│   ├── public/
│   │   ├── index.html          # Landing page
│   │   ├── login.html          # Страница входа
│   │   ├── dashboard.html      # Universal dashboard
│   │   ├── css/                # Стили
│   │   └── js/                 # Frontend компоненты (35+)
│   ├── .env                    # Конфигурация
│   └── package.json            # Зависимости
│
├── database/
│   ├── schema_safe.sql         # Схема БД (17 таблиц)
│   ├── seed_safe.sql           # Тестовые данные
│   ├── reset_db.sh             # Инициализация (Mac/Linux)
│   └── reset_db.bat            # Инициализация (Windows)
```

---

## 🔒 6. Встроенная безопасность

✅ JWT аутентификация (access + refresh tokens)  
✅ Bcrypt хеширование паролей  
✅ Rate limiting (5 попыток за 15 минут)  
✅ Role-Based Access Control (4 роли)  
✅ School data isolation (каждая школа видит только свои данные)  
✅ Helmet.js для HTTP headers  
✅ CORS настройки  
✅ Аудит логи для всех действий

---

## 🧪 7. Тестирование функционала

После запуска сервера, проверьте:

### ✅ Базовый login
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"superadmin","password":"admin123"}'
```

Должны получить:
```json
{
  "message": "Login successful",
  "user": {...},
  "access_token": "eyJhbGc...",
  "refresh_token": "eyJhbGc..."
}
```

### ✅ Открыть dashboard в браузере
1. http://localhost:5000
2. Нажмите "Login"
3. Введите superadmin / admin123
4. Должен открыться dashboard с навигацией

### ✅ Проверить API endpoints
- GET http://localhost:5000/api/health
- GET http://localhost:5000/api/superadmin/schools
- GET http://localhost:5000/api/auth/me
- И т.д.

---

## ⚙️ 8. Конфигурация (.env)

Основные переменные в `backend/.env`:

```env
# Database
DB_HOST=localhost          # Хост PostgreSQL
DB_PORT=5432             # Порт PostgreSQL
DB_USER=postgres         # Пользователь
DB_PASSWORD=postgres     # Пароль
DB_NAME=zedly            # Имя БД

# JWT
JWT_SECRET=...           # Секретный ключ (измените в production!)
JWT_REFRESH_SECRET=...   # Секрет refresh токена

# Email (опционально)
SMTP_HOST=smtp.gmail.com
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=app-password

# Telegram (опционально)
TELEGRAM_BOT_TOKEN=...
```

---

## 🐛 9. Решение проблем

### PostgreSQL не запускается
```bash
# macOS
brew services restart postgresql@16

# Linux
sudo systemctl restart postgresql

# Windows
# Перезагрузите компьютер или запустите PostgreSQL из Services
```

### "connection refused"
```bash
# Убедитесь что PostgreSQL запущена
psql -U postgres -c "SELECT 1"  # Должна вернуть 1

# Проверьте DB_HOST в .env (должен быть localhost)
```

### "database does not exist"
```bash
# Запустите reset_db.sh еще раз
./database/reset_db.sh
```

### "relation does not exist"
```bash
# Убедитесь что seed_safe.sql применился
psql -U postgres -d zedly -c "SELECT * FROM users LIMIT 1"
```

### Port 5000 уже занят
```bash
# Измените PORT в .env
PORT=5001

# Или найдите и остановите процесс
lsof -i :5000
kill -9 <PID>
```

---

## 📚 10. Следующие шаги

После успешного запуска:

1. **Тестирование функционала** (День 2)
   - Протестируйте login для каждой роли
   - Проверьте dashboard загрузку
   - Тестируйте CRUD операции
   - Проверьте импорт/экспорт Excel
   - Проверьте аналитику и графики

2. **Доработки** (День 3-4)
   - Fix any bugs found during testing
   - Optimize performance
   - Improve error handling
   - Add unit tests

3. **Deployment** (День 5+)
   - Deploy to production
   - Set up CI/CD
   - Configure backups
   - Monitor performance

---

## 📞 Поддержка

Если возникли проблемы:
1. Проверьте консоль server'а на ошибки
2. Смотрите browser console (F12) на ошибки JavaScript
3. Проверьте что PostgreSQL запущена и подключена
4. Убедитесь что .env файл имеет правильные значения

---

## ✨ Успехов!

Проект готов к использованию! 🎉

- 80+ API endpoints ✅
- 35+ JavaScript компонентов ✅
- Full i18n (RU/UZ) ✅
- Admin dashboard ✅
- Student features ✅
- Teacher analytics ✅

Начните с тестирования функционала и сообщите об ошибках!
