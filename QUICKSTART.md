# Быстрый старт ZEDLY

## 1. Установка зависимостей

```bash
cd backend
npm install
```

## 2. Настройка БД PostgreSQL

```bash
# Создайте базу данных
psql -U postgres -c "CREATE DATABASE zedly;"

# Примените схему
psql -U postgres -d zedly -f ../database/schema.sql
```

## 3. Настройка .env

Отредактируйте файл `backend/.env`:

```env
NODE_ENV=development
PORT=5000

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=zedly
DB_USER=postgres
DB_PASSWORD=your_password

# JWT
JWT_SECRET=your_secret_key_here
JWT_REFRESH_SECRET=your_refresh_secret_here
```

## 4. Запуск сервера

```bash
npm run dev
```

Откройте браузер: http://localhost:5000

## Готово! 🎉

Вы увидите landing page с:
- ✅ Переключателем темы (светлая/темная)
- ✅ Переключателем языка (RU/UZ)
- ✅ Красивым адаптивным дизайном
- ✅ Анимациями и эффектами

## Следующие шаги

1. Создать страницу логина
2. Добавить JWT аутентификацию
3. Создать API endpoints
4. Разработать Dashboard для каждой роли
