# ZEDLY - Educational Testing Platform

Образовательная платформа для мониторинга прогресса учеников, создания тестов и аналитики для школ Узбекистана.

**Status:** 🟢 PRODUCTION READY (Database инициализирована, требуется финальное тестирование)


## 🚀 Быстрый старт (5 минут)

```bash
# 1. Инициализируйте базу данных
cd database
./reset_db.sh  # Mac/Linux
# или запустите reset_db.bat на Windows

# 2. Запустите backend сервер
cd ../backend
npm install
npm run dev

# 3. Откройте в браузере
# http://localhost:5000

# Тестовые пользователи (пароль: admin123)
# superadmin / admin1 / teacher1 / student1
```

Подробная инструкция: [SETUP.md](SETUP.md)

## ✨ Функции

### Для SuperAdmin:
- Управление школами и директорами
- Глобальная статистика по всем школам
- Сравнение школ
- Управление ролями пользователей

### Для SchoolAdmin:
- Управление учителями и учениками
- Добавление предметов и классов
- Импорт пользователей из Excel
- Просмотр статистики по школе
- Audit-лог школы

### Для Teacher:
- Создание и редактирование тестов (6 типов вопросов)
- Drag & Drop конструктор тестов
- Назначение тестов классам (bulk операции)
- Просмотр результатов учеников
- Аналитика по классам и предметам
- Визуализация (heatmap, timeseries, box plots, scatter plots)

### Для Student:
- Прохождение тестов и контрольных работ
- Тест на профориентацию (radar chart)
- Просмотр личного прогресса
- Таблица лидеров класса/школы
- Progress bars и streaks
- Календарь тестов

## Технологии

### Backend:
- Node.js + Express
- PostgreSQL
- JWT Authentication
- Nodemailer + Telegram Bot
- XLSX для импорта/экспорта

### Frontend:
- HTML5, CSS3, JavaScript (ES6+)
- Native Web Components
- Chart.js (для графиков)
- Vanilla i18n (Русский + Узбекский)
- CSS Variables (для тем)
- PWA (Progressive Web App)

## Структура проекта

```
Zedly/
├── backend/                 # Серверная часть + Frontend
│   ├── src/
│   │   └── server.js        # Express сервер
│   ├── public/              # Статические файлы (HTML, CSS, JS)
│   │   ├── index.html       # Landing page
│   │   ├── css/
│   │   ├── js/
│   │   └── images/
│   └── package.json
├── database/                # Схема БД
│   ├── schema.sql
│   └── DATABASE.md
└── README.md
```

## Установка и запуск

### Требования:
- Node.js >= 16
- PostgreSQL >= 12
- npm >= 8

### Backend:

```bash
cd backend
npm install
cp .env.example .env
# Настройте .env файл с вашими параметрами

# Создайте БД и примените схему
psql -U your_user -d postgres -c "CREATE DATABASE zedly;"
psql -U your_user -d zedly -f ../database/schema.sql

# Запустите сервер
npm run dev
```

Сервер будет доступен на http://localhost:5000

Доступные режимы запуска:

```bash
# Legacy monolith (API + web)
npm run start:legacy

# API-only
npm run start:api

# Web-only (static frontend + runtime config)
npm run start:web

# Worker (cron/background jobs)
npm run start:worker
```

### Production JS build (minify + obfuscate)

```bash
cd backend
npm run build:frontend
```

Это создаёт `backend/public-dist/` с обфусцированными JS-файлами.
Чтобы сервер отдавал именно собранный фронтенд, включите в `.env`:

```env
SERVE_COMPILED_FRONTEND=true
```

Для production split (`web` + `api` + `worker`) используйте:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up --build -d
```

## Безопасность

- JWT access + refresh tokens
- RBAC (Role-Based Access Control)
- Rate limiting
- HTTPS обязателен в production
- Audit logging

## Лицензия

MIT

---

**ZEDLY** - Образовательная платформа для Узбекистана 🇺🇿
