# Zedly Backend API

Backend API для платформы школьного тестирования Zedly.

## Технологии

- **Node.js** (v18+) + TypeScript
- **Fastify** - веб-фреймворк
- **PostgreSQL** - база данных
- **JWT** - аутентификация
- **bcrypt** - хеширование паролей
- **Zod** - валидация данных
- **Nodemailer** - отправка email

## Установка

### 1. Установите зависимости

```bash
cd backend
npm install
```

### 2. Настройте PostgreSQL

Создайте базу данных PostgreSQL:

```sql
CREATE DATABASE zedly;
CREATE USER zedly WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE zedly TO zedly;
```

### 3. Настройте переменные окружения

Скопируйте `.env.example` в `.env` и заполните значения:

```bash
cp .env.example .env
```

Обязательные переменные для production:
- `DATABASE_URL` или (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`)
- `JWT_ACCESS_SECRET` (минимум 32 символа)
- `JWT_REFRESH_SECRET` (минимум 32 символа)

### 4. Выполните миграции

```bash
npm run migrate:up
```

## Запуск

### Development

```bash
npm run dev
```

Сервер запустится на `http://localhost:3001`

### Production

```bash
npm run build
npm start
```

## API Endpoints

### Authentication (`/api/v1/auth`)

- `POST /login` - вход в систему
- `POST /refresh` - обновление access token
- `POST /logout` - выход из системы
- `POST /password/change` - смена пароля (требует аутентификации)
- `POST /password/forgot` - запрос сброса пароля
- `POST /password/reset` - сброс пароля по токену

### SuperAdmin (`/api/v1/superadmin`)

Все endpoints требуют роль SuperAdmin.

- `GET /schools` - список школ
- `GET /schools/:schoolId` - информация о школе
- `POST /schools` - создать школу
- `PATCH /schools/:schoolId` - обновить школу (статус/название)
- `GET /settings` - получить настройки платформы
- `PUT /settings` - обновить настройки платформы
- `GET /audit` - глобальный audit log

## Скрипты

- `npm run dev` - запуск в режиме разработки
- `npm run build` - сборка для production
- `npm start` - запуск production build
- `npm run migrate:up` - применить миграции
- `npm run migrate:down` - откатить последнюю миграцию
- `npm run migrate:create <name>` - создать новую миграцию
- `npm run lint` - проверка кода
- `npm run format` - форматирование кода

## Структура проекта

```
backend/
├── src/
│   ├── config/         # Конфигурация приложения
│   ├── db/             # Database connection и миграции
│   │   ├── migrations/ # SQL миграции
│   │   └── queries/    # SQL запросы
│   ├── middleware/     # Middleware (auth, RBAC, etc.)
│   ├── routes/         # API routes
│   │   ├── auth/       # Аутентификация
│   │   └── superadmin/ # SuperAdmin endpoints
│   ├── services/       # Бизнес-логика
│   ├── types/          # TypeScript типы
│   ├── utils/          # Утилиты (JWT, password, etc.)
│   └── index.ts        # Entry point
├── package.json
├── tsconfig.json
└── .env.example
```

## Безопасность

### Реализованные меры безопасности:

1. **Аутентификация и авторизация**
   - JWT access/refresh tokens
   - RBAC (Role-Based Access Control)
   - Object-level authorization
   - Session management

2. **Защита данных**
   - bcrypt для хеширования паролей (12 rounds)
   - Secure password reset tokens (SHA-256)
   - Валидация паролей (политика безопасности)

3. **API Security**
   - Rate limiting
   - CORS configuration
   - Helmet security headers
   - Input validation (Zod)

4. **Аудит**
   - Логирование всех критичных действий
   - Отслеживание доступа SuperAdmin к школьным данным

## Миграции

### Создание новой миграции

```bash
npm run migrate:create название_миграции
```

Это создаст файл в `src/db/migrations/` с timestamp префиксом.

### Применение миграций

```bash
npm run migrate:up
```

### Откат миграции

```bash
npm run migrate:down
```

**ВНИМАНИЕ**: Откат миграции только удаляет запись из таблицы `migrations`. Схему БД нужно откатывать вручную.

## Environment Variables

См. файл `.env.example` для полного списка доступных переменных окружения.

## Первый запуск

После запуска сервера и применения миграций, вам нужно создать первого SuperAdmin пользователя напрямую в БД:

```sql
INSERT INTO users (role, username, email, password_hash, must_change_password, status)
VALUES (
  'superadmin',
  'admin',
  'admin@zedly.uz',
  -- используйте bcrypt hash вашего пароля
  '$2b$12$hashedpasswordhere',
  true,
  'active'
);
```

Или используйте скрипт для создания пользователя (будет добавлен позже).

## License

MIT
