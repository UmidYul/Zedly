# docs/07_api/users_api.md

---
title: Zedly — Users API Specification
version: 1.0
date: 2026-02-27
status: Production Blueprint
scope: Регистрация, профиль, управление пользователями школы, инвайты учеников
---

# Users API — Спецификация

> Базовый URL: `https://api.zedly.uz/api/v1`
> Все запросы требуют `Authorization: Bearer {access_token}`, кроме явно помеченных публичными.
> Мультитенантность: учитель и директор управляют пользователями только в рамках своей школы (`school_id` из JWT). Нарушение → 403, не 404.

---

## Содержание

1. [POST /users/register](#1-post-usersregister) — Регистрация нового пользователя
2. [GET /users/me](#2-get-usersme) — Профиль текущего пользователя
3. [PATCH /users/me](#3-patch-usersme) — Обновление профиля
4. [GET /schools/{school_id}/users](#4-get-schoolsschool_idusers) — Список пользователей школы
5. [POST /classes/{class_id}/invite](#5-post-classesclass_idinvite) — Генерация инвайт-кода для учеников
6. [Общие коды ошибок](#6-общие-коды-ошибок)

---

## 1. POST /users/register

**Описание:** Самостоятельная регистрация учителя (freemium) или финализация регистрации после onboarding_token (Telegram OAuth). Регистрация учеников происходит через `POST /auth/invite/accept`.

**Роль доступа:** Публичный

**Rate limit:** 5 регистраций / IP / час; 2 регистрации / email / день

---

### Request

```http
POST /api/v1/users/register
Content-Type: application/json
```

**Вариант A — Прямая регистрация учителя:**

```json
{
  "role": "teacher",
  "full_name": "Акбаров Шерзод Ботирович",
  "email": "sherzod@school42.uz",
  "phone": "+998901234567",
  "password": "SecurePass123!",
  "language": "uz",
  "school": {
    "school_id": "school_42",
    "name": null
  },
  "teacher_profile": {
    "subjects": ["mathematics", "physics"],
    "grades": [9, 10, 11]
  },
  "onboarding_token": null
}
```

**Вариант B — Финализация после Telegram OAuth** (`onboarding_token` из `POST /auth/telegram`):

```json
{
  "role": "teacher",
  "full_name": "Акбаров Шерзод",
  "email": "sherzod@school42.uz",
  "phone": "+998901234567",
  "password": "SecurePass123!",
  "language": "uz",
  "school": {
    "school_id": "school_42",
    "name": null
  },
  "teacher_profile": {
    "subjects": ["mathematics"],
    "grades": [9, 10]
  },
  "onboarding_token": "onb_xyz987abc"
}
```

**Вариант C — Новая школа (не найдена в списке):**

```json
{
  "role": "teacher",
  "full_name": "Юсупова Малика Тошбоевна",
  "email": "malika@newschool.uz",
  "phone": "+998931234567",
  "password": "StrongPass456!",
  "language": "ru",
  "school": {
    "school_id": null,
    "name": "Частная школа «Истиқлол»",
    "address": "г. Ташкент, ул. Амира Темура, 10",
    "district_id": "dist_tashkent"
  },
  "teacher_profile": {
    "subjects": ["history", "uzbek"],
    "grades": [7, 8, 9]
  },
  "onboarding_token": null
}
```

**Поля запроса:**

| Поле | Тип | Обязательно | Описание |
|---|---|---|---|
| `role` | string | ✅ | `teacher` (единственная роль для самостоятельной регистрации) |
| `full_name` | string | ✅ | ФИО, 5–100 символов |
| `email` | string | ✅ | Валидный email |
| `phone` | string | ✅ | Формат +998XXXXXXXXX |
| `password` | string | ✅ | Мин. 8 символов, хотя бы 1 цифра и 1 буква |
| `language` | string | ❌ | `uz` / `ru`. По умолчанию `uz` |
| `school.school_id` | string\|null | ❌ | ID существующей школы из каталога |
| `school.name` | string\|null | ❌ | Если `school_id = null` — создаётся новая школа |
| `teacher_profile.subjects` | array | ✅ | Массив предметов (1–5) |
| `teacher_profile.grades` | array | ✅ | Параллели (1–11), от 1 до 11 значений |
| `onboarding_token` | string\|null | ❌ | Токен из Telegram OAuth flow (если есть) |

---

### Response — 201 Created

```json
{
  "ok": true,
  "data": {
    "user_id": "usr_abc123",
    "full_name": "Акбаров Шерзод Ботирович",
    "role": "teacher",
    "email": "sherzod@school42.uz",
    "phone": "+998901234567",
    "school_id": "school_42",
    "school_name": "Школа №42 г. Ташкент",
    "plan": "freemium",
    "freemium_limits": {
      "max_students": 30,
      "current_students": 0,
      "max_questions_per_test": 30,
      "ai_generations_per_day": 5
    },
    "email_verified": false,
    "telegram_linked": false,
    "created_at": "2026-02-27T12:00:00Z",
    "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expires_in": 900
  }
}
```

> После создания: письмо верификации email отправляется асинхронно. Refresh token устанавливается в httpOnly cookie.

### Response — 201 Created (новая школа — на модерации)

```json
{
  "ok": true,
  "data": {
    "user_id": "usr_def456",
    "school_id": "school_pending_789",
    "school_name": "Частная школа «Истиқлол»",
    "school_status": "pending_moderation",
    "moderation_note": "Школа добавлена и ожидает верификации администратором Zedly (1–2 рабочих дня). До верификации вы можете пользоваться платформой в полном объёме.",
    "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### Response — 409 Conflict (email занят)

```json
{
  "ok": false,
  "error": {
    "code": "EMAIL_ALREADY_EXISTS",
    "message": "Пользователь с таким email уже зарегистрирован. Войдите в существующий аккаунт.",
    "login_url": "/api/v1/auth/login"
  }
}
```

### Response — 400 Bad Request (невалидный onboarding_token)

```json
{
  "ok": false,
  "error": {
    "code": "ONBOARDING_TOKEN_INVALID",
    "message": "Токен Telegram-онбординга недействителен или истёк. Войдите через Telegram заново.",
    "telegram_auth_url": "/api/v1/auth/telegram"
  }
}
```

### Response — 400 Bad Request (регистрация ученика через этот эндпоинт)

```json
{
  "ok": false,
  "error": {
    "code": "STUDENT_REGISTRATION_VIA_INVITE_ONLY",
    "message": "Ученики регистрируются только по коду приглашения учителя. Используйте POST /auth/invite/accept"
  }
}
```

---

### Бизнес-ограничения

- Только роль `teacher` может самостоятельно зарегистрироваться. Роли `student`, `director`, `parent`, `inspector` — только через приглашение или назначение администратором.
- При регистрации с `onboarding_token`: Telegram ID из токена привязывается к новому аккаунту атомарно. Токен одноразовый (TTL 30 минут, удаляется из Redis после использования).
- Новая школа (`school_id: null`, `name: не null`): создаётся в статусе `pending_moderation`. Учитель может работать сразу. Администратор Zedly верифицирует школу за 1–2 дня, после чего она появляется в публичном каталоге.
- Пароль хэшируется bcrypt cost 12 перед сохранением.
- Верификация email: ссылка действительна 24 часа. Без верификации email — полный доступ (не блокируем, UX-приоритет), но в интерфейсе показывается баннер.

---

## 2. GET /users/me

**Описание:** Получение полного профиля текущего авторизованного пользователя. Ответ различается по роли.

**Роль доступа:** 🔒 Все авторизованные роли

**Rate limit:** 120 запросов / user / час

---

### Request

```http
GET /api/v1/users/me
Authorization: Bearer {token}
```

---

### Response — 200 OK (teacher)

```json
{
  "ok": true,
  "data": {
    "user_id": "usr_abc123",
    "full_name": "Акбаров Шерзод Ботирович",
    "role": "teacher",
    "email": "sherzod@school42.uz",
    "phone": "+998901234567",
    "avatar_url": "https://cdn.zedly.uz/avatars/usr_abc123.jpg",
    "language": "uz",
    "email_verified": true,
    "telegram_linked": true,
    "telegram_username": "sherzod_akbarov",
    "school": {
      "school_id": "school_42",
      "school_name": "Школа №42 г. Ташкент",
      "district": "Яккасарайский район",
      "city": "Ташкент"
    },
    "teacher_profile": {
      "subjects": ["mathematics", "physics"],
      "grades": [9, 10, 11],
      "classes": [
        { "class_id": "class_9b", "class_name": "9-Б", "student_count": 24 },
        { "class_id": "class_10a", "class_name": "10-А", "student_count": 28 }
      ],
      "total_students": 52
    },
    "plan": {
      "type": "freemium",
      "limits": {
        "max_students": 30,
        "current_students": 28,
        "max_questions_per_test": 30,
        "ai_generations_per_day": 5,
        "ai_generations_used_today": 3
      },
      "upgrade_url": "https://zedly.uz/pricing"
    },
    "stats": {
      "tests_created": 42,
      "tests_conducted": 38,
      "total_sessions": 1240
    },
    "created_at": "2025-09-01T08:00:00Z",
    "last_login_at": "2026-02-27T09:30:00Z"
  }
}
```

### Response — 200 OK (student)

```json
{
  "ok": true,
  "data": {
    "user_id": "usr_stu_456",
    "full_name": "Юсупова Дилноза Рашидовна",
    "role": "student",
    "phone": "+998901234567",
    "avatar_url": null,
    "language": "uz",
    "email_verified": false,
    "telegram_linked": false,
    "school": {
      "school_id": "school_42",
      "school_name": "Школа №42 г. Ташкент"
    },
    "student_profile": {
      "class_id": "class_9b",
      "class_name": "9-Б",
      "grade": 9,
      "teacher_name": "Акбаров Шерзод Ботирович",
      "parent_code": "PRT9X2"
    },
    "stats": {
      "tests_completed": 18,
      "avg_score_percent": 74.2,
      "certificates_count": 5,
      "ntt_simulations_count": 3
    },
    "created_at": "2025-09-05T10:00:00Z",
    "last_login_at": "2026-02-26T16:00:00Z"
  }
}
```

---

## 3. PATCH /users/me

**Описание:** Частичное обновление профиля текущего пользователя. Изменение пароля и email — отдельные подэндпоинты с верификацией.

**Роль доступа:** 🔒 Все авторизованные роли

**Rate limit:** 20 запросов / user / час

---

### Request

```http
PATCH /api/v1/users/me
Authorization: Bearer {token}
Content-Type: application/json
```

```json
{
  "full_name": "Акбаров Шерзод Ботирович",
  "language": "ru",
  "avatar_url": "https://cdn.zedly.uz/avatars/usr_abc123_new.jpg",
  "teacher_profile": {
    "subjects": ["mathematics", "physics", "informatics"],
    "grades": [9, 10, 11]
  }
}
```

**Поля (все опциональны, обновляются только переданные):**

| Поле | Кто может менять | Описание |
|---|---|---|
| `full_name` | Все | ФИО, 5–100 символов |
| `language` | Все | `uz` / `ru` |
| `avatar_url` | Все | URL загруженного файла из `/files/upload` |
| `teacher_profile.subjects` | teacher | Обновить список предметов |
| `teacher_profile.grades` | teacher | Обновить список параллелей |

**Нельзя изменить через этот эндпоинт:**
- `email` → `POST /users/me/change-email` (с верификацией старого email)
- `phone` → `POST /users/me/change-phone` (с SMS-кодом)
- `password` → `POST /users/me/change-password` (с текущим паролем)
- `role` → нельзя изменить никогда через API
- `school_id` → только через обращение в поддержку

---

### Response — 200 OK

```json
{
  "ok": true,
  "data": {
    "user_id": "usr_abc123",
    "full_name": "Акбаров Шерзод Ботирович",
    "language": "ru",
    "teacher_profile": {
      "subjects": ["mathematics", "physics", "informatics"],
      "grades": [9, 10, 11]
    },
    "updated_at": "2026-02-27T12:05:00Z"
  }
}
```

### Response — 400 Bad Request (попытка изменить запрещённое поле)

```json
{
  "ok": false,
  "error": {
    "code": "FIELD_NOT_UPDATABLE",
    "message": "Поле 'email' нельзя изменить через этот эндпоинт. Используйте POST /users/me/change-email",
    "restricted_fields": ["email"],
    "allowed_endpoint": "/api/v1/users/me/change-email"
  }
}
```

---

### Бизнес-ограничения

- PATCH игнорирует поля, которые не описаны в схеме (strict mode). Неизвестные поля в теле → 400 `UNKNOWN_FIELDS`.
- Изменение `teacher_profile.subjects` не влияет на существующие тесты — только на профиль и фильтры аналитики.
- `avatar_url` должен быть URL, загруженным через `POST /files/upload` с `type: avatar`. Внешние URL (не `cdn.zedly.uz`) → 400 `INVALID_AVATAR_URL`.
- Аудит: каждое изменение профиля пишется в `profile_change_log` (user_id, field, old_value, new_value, timestamp).

---

## 4. GET /schools/{school_id}/users

**Описание:** Список пользователей школы с фильтрацией по роли. Учитель видит только учеников своих классов. Директор — всех пользователей школы.

**Роль доступа:** 🔒 `teacher` (ограниченно) | `director`

**Rate limit:** 60 запросов / user / час

---

### Request

```http
GET /api/v1/schools/school_42/users?role=student&class_id=class_9b&page=1&per_page=50
Authorization: Bearer {token}
```

**Query параметры:**

| Параметр | Тип | Обязательно | Описание |
|---|---|---|---|
| `role` | string | ❌ | `student` / `teacher` / `all`. По умолчанию `all` |
| `class_id` | string | ❌ | Фильтр по классу (для `role=student`) |
| `status` | string | ❌ | `active` / `inactive` / `all`. По умолчанию `active` |
| `search` | string | ❌ | Поиск по ФИО (min 2 символа) |
| `page` | integer | ❌ | Номер страницы, по умолчанию 1 |
| `per_page` | integer | ❌ | 10–100, по умолчанию 50 |

---

### Response — 200 OK (director запрашивает всех учителей)

```http
GET /api/v1/schools/school_42/users?role=teacher&page=1&per_page=20
```

```json
{
  "ok": true,
  "data": {
    "users": [
      {
        "user_id": "usr_abc123",
        "full_name": "Акбаров Шерзод Ботирович",
        "role": "teacher",
        "email": "sherzod@school42.uz",
        "phone": "+998901234567",
        "avatar_url": "https://cdn.zedly.uz/avatars/usr_abc123.jpg",
        "teacher_profile": {
          "subjects": ["mathematics", "physics"],
          "grades": [9, 10, 11],
          "class_count": 2,
          "student_count": 52
        },
        "status": "active",
        "plan": "freemium",
        "last_activity_at": "2026-02-26T14:30:00Z",
        "created_at": "2025-09-01T08:00:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "per_page": 20,
      "total": 18,
      "total_pages": 1
    },
    "summary": {
      "total_teachers": 18,
      "active_last_30_days": 15,
      "never_active": 3
    }
  }
}
```

### Response — 200 OK (teacher запрашивает учеников своего класса)

```json
{
  "ok": true,
  "data": {
    "users": [
      {
        "user_id": "usr_stu_456",
        "full_name": "Юсупова Дилноза Рашидовна",
        "role": "student",
        "phone": "+998901234567",
        "avatar_url": null,
        "student_profile": {
          "class_id": "class_9b",
          "class_name": "9-Б",
          "grade": 9,
          "parent_linked": true
        },
        "stats": {
          "tests_completed": 18,
          "avg_score_percent": 74.2,
          "last_test_date": "2026-02-24"
        },
        "status": "active",
        "created_at": "2025-09-05T10:00:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "per_page": 50,
      "total": 24,
      "total_pages": 1
    }
  }
}
```

### Response — 403 Forbidden (учитель запрашивает чужой класс)

```json
{
  "ok": false,
  "error": {
    "code": "CLASS_ACCESS_FORBIDDEN",
    "message": "Вы не являетесь учителем класса class_10b",
    "your_classes": ["class_9b", "class_10a"]
  }
}
```

---

### Бизнес-ограничения

- Учитель: видит только учеников своих классов. Запрос `class_id` чужого класса → 403.
- Директор: видит всех пользователей школы, включая других директоров и завучей.
- `status: inactive` — учитель/ученик не проявлял активности более 90 дней.
- Поиск по `search`: ILIKE `%query%` по `full_name`. Min 2 символа для поиска (защита от full-table scan).
- Email учителей виден только директору. Учитель видит email только своих учеников (если они зарегистрированы с email).
- Директор может деактивировать пользователя: `PATCH /schools/{school_id}/users/{user_id}` с `{"status": "inactive"}`.

---

## 5. POST /classes/{class_id}/invite

**Описание:** Генерация нового инвайт-кода для класса. Учитель распространяет код ученикам (QR, Telegram, printout). Ученики регистрируются через `POST /auth/invite/accept`.

**Роль доступа:** 🔒 `teacher` (только для своих классов)

**Rate limit:** 10 генераций / class / день

---

### Request

```http
POST /api/v1/classes/class_9b/invite
Authorization: Bearer {token}
Content-Type: application/json
```

```json
{
  "expires_days": 7,
  "invalidate_previous": false,
  "note": "Для учеников, пришедших после 1 сентября"
}
```

| Поле | Тип | Обязательно | Описание |
|---|---|---|---|
| `expires_days` | integer | ❌ | TTL кода в днях. 1–30. По умолчанию 7 |
| `invalidate_previous` | boolean | ❌ | Инвалидировать все предыдущие коды класса. По умолчанию false |
| `note` | string | ❌ | Заметка для учителя (не показывается ученику), max 200 символов |

---

### Response — 201 Created

```json
{
  "ok": true,
  "data": {
    "invite_id": "inv_xyz789",
    "code": "X7K2QP",
    "class_id": "class_9b",
    "class_name": "9-Б",
    "school_name": "Школа №42 г. Ташкент",
    "teacher_name": "Акбаров Шерзод Ботирович",
    "created_at": "2026-02-27T12:00:00Z",
    "expires_at": "2026-03-06T12:00:00Z",
    "expires_days": 7,
    "status": "active",
    "usage_count": 0,
    "qr_url": "https://cdn.zedly.uz/qr/inv_xyz789.png",
    "telegram_link": "https://t.me/ZedlyBot?start=inv_X7K2QP",
    "web_link": "https://zedly.uz/join/X7K2QP",
    "printable_url": "https://cdn.zedly.uz/invites/inv_xyz789_printable.pdf"
  }
}
```

> `printable_url` — красиво оформленная A4 PDF-карточка с QR-кодом, названием класса и инструкцией для ученика. Готова сразу (генерируется синхронно, < 1 сек).

### Response — 200 OK (список активных кодов для GET)

```http
GET /api/v1/classes/class_9b/invite
```

```json
{
  "ok": true,
  "data": {
    "class_id": "class_9b",
    "class_name": "9-Б",
    "active_invites": [
      {
        "invite_id": "inv_xyz789",
        "code": "X7K2QP",
        "created_at": "2026-02-27T12:00:00Z",
        "expires_at": "2026-03-06T12:00:00Z",
        "usage_count": 12,
        "note": "Для учеников, пришедших после 1 сентября",
        "status": "active"
      }
    ],
    "expired_invites_count": 3
  }
}
```

### Response — 403 Forbidden (Freemium: лимит учеников)

```json
{
  "ok": false,
  "error": {
    "code": "FREEMIUM_STUDENT_LIMIT",
    "message": "Вы достигли лимита 30 учеников на бесплатном плане. Новые приглашения не создаются.",
    "current_students": 30,
    "limit": 30,
    "upgrade_url": "https://zedly.uz/pricing"
  }
}
```

### Response — 403 Forbidden (не учитель класса)

```json
{
  "ok": false,
  "error": {
    "code": "CLASS_ACCESS_FORBIDDEN",
    "message": "Класс class_9b вам не принадлежит",
    "your_classes": ["class_10a", "class_11b"]
  }
}
```

---

### Бизнес-ограничения

- Учитель на Freemium может иметь не более 30 активных учеников суммарно. Если лимит достигнут — новые инвайты не работают (принятие инвайта будет отклонено на шаге `POST /auth/invite/accept` с кодом `CLASS_LIMIT_REACHED`). Сам код создаётся, но предупреждение показывается сразу.
- Код нечувствителен к регистру при вводе учеником (backend нормализует в uppercase).
- `invalidate_previous: true` помечает все существующие коды класса как `revoked`. Ученики, уже зарегистрировавшиеся по старым кодам, остаются в классе — инвалидация кода не удаляет существующих учеников.
- `qr_url` генерируется синхронно (библиотека `qrcode`, PNG 400×400, с логотипом Zedly в центре).
- `telegram_link`: `t.me/ZedlyBot?start=inv_{code}` — бот приветствует ученика и ведёт через регистрацию прямо в Telegram.
- Учитель может досрочно отозвать код: `DELETE /classes/{class_id}/invite/{invite_id}` → статус `revoked`.

---

## 6. Общие коды ошибок

| HTTP | `error.code` | Описание |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Невалидные поля запроса |
| 400 | `STUDENT_REGISTRATION_VIA_INVITE_ONLY` | Ученик не может зарегистрироваться напрямую |
| 400 | `ONBOARDING_TOKEN_INVALID` | Telegram onboarding_token истёк или не существует |
| 400 | `FIELD_NOT_UPDATABLE` | Попытка изменить защищённое поле |
| 400 | `UNKNOWN_FIELDS` | В теле переданы неизвестные поля |
| 400 | `INVALID_AVATAR_URL` | URL аватарки не с cdn.zedly.uz |
| 403 | `CLASS_ACCESS_FORBIDDEN` | Класс не принадлежит учителю |
| 403 | `SCHOOL_ACCESS_FORBIDDEN` | Попытка управления пользователями чужой школы |
| 403 | `ROLE_FORBIDDEN` | Эндпоинт недоступен для данной роли |
| 403 | `FREEMIUM_STUDENT_LIMIT` | Достигнут лимит учеников (Freemium) |
| 404 | `USER_NOT_FOUND` | Пользователь не найден |
| 404 | `CLASS_NOT_FOUND` | Класс не найден |
| 404 | `SCHOOL_NOT_FOUND` | Школа не найдена |
| 409 | `EMAIL_ALREADY_EXISTS` | Email занят другим пользователем |
| 409 | `PHONE_ALREADY_EXISTS` | Телефон занят другим пользователем |
| 409 | `TELEGRAM_ID_ALREADY_BOUND` | Telegram ID уже привязан |
| 429 | `RATE_LIMIT_EXCEEDED` | Общий rate limit |
| 500 | `INTERNAL_ERROR` | Внутренняя ошибка (с `request_id`) |

---

*Следующий файл: `docs/07_api/marketplace_api.md`*
