# Zedly Platform

Современная платформа для создания и проведения тестов в школах Узбекистана.

## 🚀 Быстрый старт

### Backend

```bash
cd backend
npm install
npm run build
node dist/db/migrate.js up
node dist/index.js
```

Сервер запустится на http://localhost:3001

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Приложение откроется на http://localhost:3000

## 📚 Документация

- [SPRINT2_COMPLETE.md](./SPRINT2_COMPLETE.md) - Полная документация Sprint 2
- [SPRINT2_STATUS.md](./SPRINT2_STATUS.md) - Текущий статус разработки
- [backend/README.md](./backend/README.md) - Backend документация

## 🎯 Прогресс

### ✅ Sprint 1: Foundation + Security
- JWT аутентификация
- RBAC система
- База данных (33 таблицы)
- Email сервис
- SuperAdmin панель

### ✅ Sprint 2: School Onboarding
- Управление учителями
- Управление учениками
- Управление классами
- Admin dashboard
- Responsive UI

### 🔜 Sprint 3 (Планируется)
- Создание и управление тестами
- Прохождение тестов учениками
- Автоматическая проверка
- Статистика и отчёты

## 🔑 Тестовые данные

**SuperAdmin:**
- Username: `admin`
- Password: `Admin123!`

**School Admin** (создаётся через SuperAdmin):
- Username: `school1admin` (пример)
- Password: устанавливается при создании

## 🛠 Технологии

**Backend:**
- Node.js + TypeScript
- Fastify
- PostgreSQL
- JWT + Bcrypt
- Zod

**Frontend:**
- Next.js 14 (App Router)
- React 18 + TypeScript
- Tailwind CSS
- Zustand + React Query
- shadcn/ui

## 📂 Структура проекта

```
Zedly/
├── backend/
│   ├── src/           # Исходный код
│   ├── dist/          # Скомпилированный код
│   └── .env           # Переменные окружения
│
└── frontend/
    └── src/
        ├── app/       # Next.js страницы
        ├── components/# React компоненты
        └── lib/       # Утилиты и API client
```

## 🔒 Безопасность

- JWT с rotation refresh tokens
- Bcrypt password hashing (12 rounds)
- Role-based access control
- Object-level authorization
- Tenant isolation (multi-школа)
- Rate limiting
- SQL injection защита

## 📧 Контакты

- Email: support@zedly.uz
- Telegram: @zedly_support

## 📄 Лицензия

Proprietary - © 2026 Zedly Platform