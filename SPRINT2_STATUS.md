# Zedly Platform - Sprint 2 Progress

## Что готово

### Backend (Fastify + PostgreSQL)
✅ **Sprint 1 завершён полностью:**
- JWT аутентификация с refresh токенами
- RBAC система (SuperAdmin, Admin, Teacher, Student)
- Audit logging
- Email сервис
- 33 таблицы базы данных

✅ **Sprint 2 (Backend):**
- `/api/v1/admin/teachers` - CRUD для учителей
- `/api/v1/admin/students` - CRUD для учеников
- `/api/v1/admin/classes` - CRUD для классов

### Frontend (Next.js 14 + Tailwind CSS)
✅ **Инфраструктура:**
- Next.js App Router
- TypeScript конфигурация
- Tailwind CSS + shadcn/ui компоненты
- Zustand для state management
- React Query для data fetching
- Axios с автоматическим refresh токенов

✅ **Страницы:**
- `/login` - страница логина с валидацией
- `/admin` - dashboard с статистикой
- Admin layout с sidebar навигацией

## Запуск проекта

### Backend

\`\`\`bash
cd backend

# Установка зависимостей
npm install

# Компиляция TypeScript
npm run build

# Запуск миграций (на хостинге)
node dist/db/migrate.js up

# Создание SuperAdmin пользователя
psql -h 127.0.0.200 -U zedlyuz_umid -d zedlyuz_DB -f create_superadmin.sql

# Запуск сервера
node dist/index.js
\`\`\`

**Credentials:**
- Username: `admin`
- Password: `Admin123!`

### Frontend

\`\`\`bash
cd frontend

# Установка зависимостей
npm install

# Запуск dev сервера
npm run dev
\`\`\`

Откройте http://localhost:3000

## API Endpoints

### Auth
- `POST /api/v1/auth/login` - Вход
- `POST /api/v1/auth/refresh` - Обновление токенов
- `POST /api/v1/auth/logout` - Выход
- `POST /api/v1/auth/password/change` - Смена пароля
- `POST /api/v1/auth/password/forgot` - Запрос сброса пароля
- `POST /api/v1/auth/password/reset` - Сброс пароля

### Admin (требуется role: admin)
- `GET /api/v1/admin/teachers` - Список учителей
- `POST /api/v1/admin/teachers` - Создать учителя
- `PUT /api/v1/admin/teachers/:id` - Обновить учителя
- `DELETE /api/v1/admin/teachers/:id` - Удалить учителя

- `GET /api/v1/admin/students` - Список учеников
- `POST /api/v1/admin/students` - Создать ученика
- `PUT /api/v1/admin/students/:id` - Обновить ученика
- `DELETE /api/v1/admin/students/:id` - Удалить ученика

- `GET /api/v1/admin/classes` - Список классов
- `POST /api/v1/admin/classes` - Создать класс
- `PUT /api/v1/admin/classes/:id` - Обновить класс
- `DELETE /api/v1/admin/classes/:id` - Удалить класс

### SuperAdmin (требуется role: superadmin)
- `GET /api/v1/superadmin/schools` - Список школ
- `POST /api/v1/superadmin/schools` - Создать школу
- `PUT /api/v1/superadmin/schools/:id` - Обновить школу
- `GET /api/v1/superadmin/audit-logs` - Логи аудита
- `GET /api/v1/superadmin/platform-settings` - Настройки платформы
- `PUT /api/v1/superadmin/platform-settings` - Обновить настройки

## Что осталось сделать в Sprint 2

- [ ] Страницы управления учителями (frontend)
- [ ] Страницы управления учениками (frontend)
- [ ] Страницы управления классами (frontend)
- [ ] Импорт пользователей из Excel/CSV
- [ ] Тестирование на хостинге

## Технологии

**Backend:**
- Node.js 22 + TypeScript
- Fastify (веб-фреймворк)
- PostgreSQL (база данных)
- JWT (аутентификация)
- Bcrypt (хеширование паролей)
- Zod (валидация)
- Nodemailer (email)

**Frontend:**
- Next.js 14 (App Router)
- React 18
- TypeScript
- Tailwind CSS
- shadcn/ui компоненты
- Zustand (state management)
- React Query (data fetching)
- React Hook Form + Zod (формы)
- Axios (HTTP client)

## Структура проекта

\`\`\`
Zedly/
├── backend/
│   ├── src/
│   │   ├── config/          # Конфигурация
│   │   ├── db/              # База данных и миграции
│   │   ├── middleware/      # Middleware (auth, validation)
│   │   ├── routes/          # API routes
│   │   ├── services/        # Business logic
│   │   ├── types/           # TypeScript типы
│   │   └── utils/           # Утилиты (jwt, password)
│   └── dist/                # Скомпилированный код
│
└── frontend/
    └── src/
        ├── app/             # Next.js страницы
        ├── components/      # React компоненты
        ├── lib/             # Утилиты (api client)
        ├── stores/          # Zustand stores
        └── types/           # TypeScript типы
\`\`\`

## База данных

33 таблицы:
- Школы и пользователи (users, schools, refresh_sessions)
- Структура школы (classes, student_profiles, teacher_profiles)
- Тесты (tests, questions, answers, test_assignments)
- Результаты (test_attempts, test_answers, test_results)
- Статистика и настройки
- Audit logging

## Безопасность

- JWT с rotation refresh токенов
- Bcrypt (12 rounds) для паролей
- Rate limiting
- Helmet для security headers
- CORS настройки
- Role-based access control
- Object-level authorization
- Tenant isolation (school_id)
- SQL injection защита (parameterized queries)

## Deployment

**Backend (Shared Hosting):**
- Node.js через nodevenv
- PostgreSQL database
- Нет Docker, нет Redis
- Database-backed job queues
- Cron workers для фоновых задач

**Frontend:**
- Vercel / Netlify
- Static export возможен
- API URL через переменные окружения
