# 🚨 ПРОБЛЕМА НАЙДЕНА: PostgreSQL не установлен!

## Почему сайт перекидывает на логин:

1. ❌ PostgreSQL не установлен на вашем Mac
2. ❌ База данных не создана
3. ❌ Сервер не может подключиться к БД
4. ❌ Логин завершается ошибкой → редирект на /login

## 🔧 РЕШЕНИЕ: Установите PostgreSQL

### Вариант 1: Через Homebrew (Рекомендуется)

```bash
# 1. Установите Homebrew (если ещё не установлен)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2. Установите PostgreSQL
brew install postgresql@16

# 3. Запустите PostgreSQL
brew services start postgresql@16

# 4. Создайте базу данных
createdb zedly

# 5. Примените схему и добавьте тестовых пользователей
cd /Users/premium/Desktop/Zedly/database
psql -d zedly -f schema_safe.sql
psql -d zedly -f seed_safe.sql
```

### Вариант 2: Через Postgres.app (Простой GUI)

1. **Скачайте Postgres.app:**
   https://postgresapp.com/downloads.html

2. **Установите и запустите приложение**

3. **Откройте терминал и выполните:**
   ```bash
   # Добавьте PostgreSQL в PATH
   echo 'export PATH="/Applications/Postgres.app/Contents/Versions/latest/bin:$PATH"' >> ~/.zshrc
   source ~/.zshrc
   
   # Создайте базу данных
   createdb zedly
   
   # Примените схему
   cd /Users/premium/Desktop/Zedly/database
   psql -d zedly -f schema_safe.sql
   psql -d zedly -f seed_safe.sql
   ```

### Вариант 3: Через Docker (Если Docker установлен)

```bash
# 1. Запустите PostgreSQL в Docker
docker run --name zedly-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=zedly \
  -p 5432:5432 \
  -d postgres:16

# 2. Подождите 5 секунд для запуска
sleep 5

# 3. Примените схему
cd /Users/premium/Desktop/Zedly/database
docker exec -i zedly-postgres psql -U postgres -d zedly < schema_safe.sql
docker exec -i zedly-postgres psql -U postgres -d zedly < seed_safe.sql
```

---

## ✅ После установки PostgreSQL:

### 1. Проверьте подключение:
```bash
psql -U postgres -d zedly -c "SELECT username, role FROM users;"
```

Вы должны увидеть:
```
  username   |    role     
-------------+-------------
 superadmin  | superadmin
 admin1      | school_admin
 teacher1    | teacher
 student1    | student
```

### 2. Запустите сервер:
```bash
cd /Users/premium/Desktop/Zedly/backend
npm start
```

### 3. Откройте браузер:
- Перейдите на http://localhost:5000/login
- Войдите как `superadmin` / `admin123`

---

## 🐛 Если всё ещё не работает:

### Проверьте пароль PostgreSQL в .env:

Откройте `/Users/premium/Desktop/Zedly/backend/.env` и убедитесь, что `DB_PASSWORD` совпадает с паролем PostgreSQL:

```env
DB_PASSWORD=postgres  # Измените если нужно
```

Для Homebrew пароль обычно пустой или `postgres`.
Для Postgres.app пароль обычно не требуется (оставьте `postgres`).

### Проверьте соединение:

```bash
cd /Users/premium/Desktop/Zedly/backend
node -e "const { query } = require('./src/config/database.js'); query('SELECT NOW()').then(r => console.log('✅ Connected:', r.rows[0])).catch(e => console.error('❌ Error:', e.message));"
```

---

## 📋 Краткая версия для быстрого старта:

```bash
# Установка через Homebrew (самый простой способ)
brew install postgresql@16
brew services start postgresql@16

# Создание базы
createdb zedly
cd /Users/premium/Desktop/Zedly/database
psql -d zedly -f schema_safe.sql
psql -d zedly -f seed_safe.sql

# Запуск сервера
cd /Users/premium/Desktop/Zedly/backend
npm start
```

**После этого всё заработает! 🎉**

---

## 📝 Что уже исправлено:

✅ Создан файл `.env` с правильными настройками
✅ Исправлены все проблемы с logout кнопками
✅ Исправлен auth-interceptor
✅ Добавлено подробное логирование
✅ Создана страница debug-auth.html для диагностики

**Осталось только:** Установить PostgreSQL и создать базу данных!
