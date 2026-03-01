# docs/07_api/auth_api.md

---
title: Zedly — Auth API Specification
version: 1.0
date: 2026-02-27
status: Production Blueprint
scope: Аутентификация, авторизация, управление сессиями
---

# Auth API — Спецификация

> Базовый URL: `https://api.zedly.uz/api/v1`
> Все запросы и ответы: `Content-Type: application/json`
> Все соединения только по HTTPS (HTTP → 301 редирект)
> Access Token: JWT, TTL 15 минут
> Refresh Token: opaque UUID, TTL 30 дней, хранится в Redis

---

## Содержание

1. [POST /auth/login](#1-post-authlogin)
2. [POST /auth/telegram](#2-post-authtelegram)
3. [POST /auth/refresh](#3-post-authrefresh)
4. [POST /auth/logout](#4-post-authlogout)
5. [POST /auth/invite/accept](#5-post-authinviteaccept)
6. [Безопасность](#6-безопасность)
7. [Общие коды ошибок](#7-общие-коды-ошибок)

---

## 1. POST /auth/login

**Описание:** Аутентификация по email/телефону и паролю. Возвращает access token (в теле ответа) и refresh token (в httpOnly cookie).

**Роль доступа:** Публичный (без авторизации)

**Rate limit:** 10 запросов / IP / час; 5 запросов / email / час

---

### Request

```http
POST /api/v1/auth/login
Content-Type: application/json
```

```json
{
  "login": "teacher@school42.uz",
  "password": "MySecurePass123!",
  "device_id": "web-chrome-abc123"
}
```

**Поля запроса:**

| Поле | Тип | Обязательно | Описание |
|---|---|---|---|
| `login` | string | ✅ | Email или номер телефона (+998901234567) |
| `password` | string | ✅ | Пароль. Мин. 8 символов |
| `device_id` | string | ❌ | Идентификатор устройства для мультисессионности. Если не передан — генерируется на сервере |

---

### Response — 200 OK

```json
{
  "ok": true,
  "data": {
    "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiYWJjMTIzIiwicm9sZSI6InRlYWNoZXIiLCJzY2hvb2xfaWQiOiJzY2hvb2xfNDIiLCJleHAiOjE3MDk0ODAwMDB9.signature",
    "token_type": "Bearer",
    "expires_in": 900,
    "user": {
      "id": "usr_abc123",
      "full_name": "Акбаров Шерзод Ботирович",
      "role": "teacher",
      "school_id": "school_42",
      "school_name": "Школа №42 г. Ташкент",
      "avatar_url": "https://cdn.zedly.uz/avatars/usr_abc123.jpg",
      "language": "uz"
    }
  }
}
```

**Refresh token** устанавливается как httpOnly cookie:

```http
Set-Cookie: zedly_rt=rt_7f3a9b...uuid; HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth; Max-Age=2592000
```

**Поля `user` в ответе:**

| Поле | Описание |
|---|---|
| `id` | Уникальный ID пользователя (`usr_` + nanoid) |
| `role` | `student` / `teacher` / `director` / `parent` / `inspector` / `ministry` |
| `school_id` | ID школы (null для inspector и ministry) |
| `language` | Предпочитаемый язык: `uz` / `ru` |

---

### Response — 401 Unauthorized

```json
{
  "ok": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Неверный логин или пароль",
    "message_uz": "Login yoki parol noto'g'ri"
  }
}
```

### Response — 403 Forbidden (аккаунт заблокирован)

```json
{
  "ok": false,
  "error": {
    "code": "ACCOUNT_LOCKED",
    "message": "Аккаунт временно заблокирован. Попробуйте через 47 минут",
    "retry_after_seconds": 2820
  }
}
```

### Response — 429 Too Many Requests

```json
{
  "ok": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Слишком много попыток входа. Подождите 52 минуты",
    "retry_after_seconds": 3120
  }
}
```

**Заголовок ответа:**
```http
Retry-After: 3120
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1709483200
```

---

### Бизнес-ограничения

- Одинаковое сообщение об ошибке для «неверный логин» и «неверный пароль» — защита от перебора пользователей (user enumeration).
- После 5 неудачных попыток с одного IP за 10 минут → требуется reCAPTCHA v3 (score < 0.5 → отказ).
- После 10 неудачных попыток за 1 час с одного IP → блокировка на оставшееся время до конца часа.
- Блокировка считается отдельно по IP и по `login` (email/телефону). Достаточно одного из двух счётчиков для блокировки.
- Успешный вход сбрасывает счётчик неудач для данного `login`.
- Аудит: каждая попытка входа (успешная и нет) пишется в таблицу `auth_audit_log` с полями: `timestamp`, `ip`, `login`, `success`, `device_id`, `user_agent`, `school_id`.
- Новый логин с нового устройства (device_id не встречался ранее) → уведомление пользователю в Telegram/email: «Новый вход с устройства Chrome/Windows».

---

## 2. POST /auth/telegram

**Описание:** Аутентификация через Telegram Login Widget или Telegram Mini App. Verifies `hash` подпись данных, подписанных ботом.

**Роль доступа:** Публичный

**Rate limit:** 20 запросов / IP / час

---

### Request

```http
POST /api/v1/auth/telegram
Content-Type: application/json
```

```json
{
  "id": 123456789,
  "first_name": "Шерзод",
  "last_name": "Акбаров",
  "username": "sherzod_akbarov",
  "photo_url": "https://t.me/i/userpic/320/sherzod.jpg",
  "auth_date": 1709481600,
  "hash": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2"
}
```

**Поля запроса** (стандарт Telegram Login Widget):

| Поле | Тип | Обязательно | Описание |
|---|---|---|---|
| `id` | integer | ✅ | Telegram user ID |
| `first_name` | string | ✅ | Имя |
| `last_name` | string | ❌ | Фамилия |
| `username` | string | ❌ | @username в Telegram |
| `photo_url` | string | ❌ | URL аватарки |
| `auth_date` | integer | ✅ | Unix timestamp выдачи данных |
| `hash` | string | ✅ | HMAC-SHA256 подпись. Ключ = SHA256 от Bot Token |

---

### Response — 200 OK (пользователь существует)

```json
{
  "ok": true,
  "data": {
    "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
    "token_type": "Bearer",
    "expires_in": 900,
    "user": {
      "id": "usr_tg_789",
      "full_name": "Акбаров Шерзод",
      "role": "teacher",
      "school_id": "school_42",
      "school_name": "Школа №42 г. Ташкент",
      "avatar_url": "https://t.me/i/userpic/320/sherzod.jpg",
      "language": "uz"
    }
  }
}
```

### Response — 200 OK (новый пользователь — требуется онбординг)

```json
{
  "ok": true,
  "data": {
    "status": "registration_required",
    "telegram_id": 123456789,
    "onboarding_token": "onb_xyz987abc",
    "message": "Telegram аккаунт не привязан к Zedly. Завершите регистрацию."
  }
}
```

> Клиент редиректит на экран `Register` с предзаполненными данными из Telegram. `onboarding_token` передаётся в `POST /auth/register` для подтверждения Telegram-привязки.

### Response — 401 Unauthorized (невалидный hash)

```json
{
  "ok": false,
  "error": {
    "code": "TELEGRAM_HASH_INVALID",
    "message": "Подпись Telegram данных не прошла проверку"
  }
}
```

### Response — 401 Unauthorized (устаревшие данные)

```json
{
  "ok": false,
  "error": {
    "code": "TELEGRAM_AUTH_EXPIRED",
    "message": "Telegram данные устарели. auth_date старше 5 минут",
    "auth_date_received": 1709481600,
    "server_time": 1709481920
  }
}
```

---

### Бизнес-ограничения

- `auth_date` должен быть не старше **300 секунд** (5 минут) от серверного времени — защита от replay-атак.
- Верификация `hash`: сервер самостоятельно вычисляет HMAC-SHA256 по алгоритму Telegram и сравнивает с переданным `hash`. Несовпадение → 401.
- Bot Token никогда не передаётся клиенту — хранится только в `.env` на сервере.
- Один Telegram ID может быть привязан только к одному аккаунту Zedly. Попытка привязать занятый Telegram ID → ошибка `TELEGRAM_ID_ALREADY_BOUND`.
- После успешной аутентификации через Telegram `photo_url` синхронизируется с аватаркой профиля (если пользователь не загружал свою).

---

## 3. POST /auth/refresh

**Описание:** Обновление access token по refresh token. Реализует схему Silent Refresh — клиент вызывает этот эндпоинт автоматически за 60 секунд до истечения access token.

**Роль доступа:** Публичный (refresh token передаётся через httpOnly cookie)

**Rate limit:** 60 запросов / device_id / час

---

### Request

```http
POST /api/v1/auth/refresh
Cookie: zedly_rt=rt_7f3a9b...uuid
```

Тело запроса не требуется. Refresh token читается из httpOnly cookie `zedly_rt`.

Опционально в теле (для Telegram Mini App, где cookies недоступны):

```json
{
  "refresh_token": "rt_7f3a9b...uuid",
  "device_id": "tma-ios-abc123"
}
```

---

### Response — 200 OK

```json
{
  "ok": true,
  "data": {
    "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiYWJjMTIzIiwicm9sZSI6InRlYWNoZXIiLCJzY2hvb2xfaWQiOiJzY2hvb2xfNDIiLCJleHAiOjE3MDk0ODYwMDB9.new_signature",
    "token_type": "Bearer",
    "expires_in": 900
  }
}
```

Новый refresh token устанавливается в cookie (ротация):

```http
Set-Cookie: zedly_rt=rt_new_uuid_here; HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth; Max-Age=2592000
```

### Response — 401 Unauthorized (refresh token не найден или истёк)

```json
{
  "ok": false,
  "error": {
    "code": "REFRESH_TOKEN_INVALID",
    "message": "Сессия истекла. Выполните вход заново"
  }
}
```

### Response — 401 Unauthorized (refresh token отозван — logout с другого устройства)

```json
{
  "ok": false,
  "error": {
    "code": "REFRESH_TOKEN_REVOKED",
    "message": "Токен был отозван. Выполните вход заново"
  }
}
```

---

### Бизнес-ограничения

- **Token Rotation:** при каждом успешном refresh старый refresh token немедленно инвалидируется в Redis, выдаётся новый. Повторное использование старого refresh token → `REFRESH_TOKEN_INVALID` + принудительный logout всех сессий пользователя (детектирование кражи токена).
- Refresh token хранится в Redis как `rt:{token_uuid}` → `{user_id, device_id, created_at, last_used_at}` с TTL 30 дней.
- Если refresh token не использовался более 7 дней (ключ `last_used_at`) — TTL сбрасывается. Если не использовался 30 дней — удаляется автоматически по TTL.
- Один пользователь может иметь до **10 активных сессий** (10 разных `device_id`). При превышении — самая старая сессия по `last_used_at` удаляется.
- Telegram Mini App: из-за ограничений среды Mini App cookie не поддерживаются — refresh token передаётся в теле запроса и хранится в памяти приложения (не в localStorage).

---

## 4. POST /auth/logout

**Описание:** Завершение сессии. Инвалидирует refresh token в Redis. Access token становится недействительным по истечении TTL (15 мин) — добавляется в Redis blacklist до истечения.

**Роль доступа:** 🔒 Авторизован (требует валидный access token)

**Rate limit:** 10 запросов / user / час

---

### Request

```http
POST /api/v1/auth/logout
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
Cookie: zedly_rt=rt_7f3a9b...uuid
```

Опционально в теле — logout со всех устройств:

```json
{
  "all_devices": false
}
```

| Поле | Тип | Обязательно | Описание |
|---|---|---|---|
| `all_devices` | boolean | ❌ | `false` (по умолчанию) — logout только текущей сессии. `true` — logout всех сессий пользователя |

---

### Response — 200 OK

```json
{
  "ok": true,
  "data": {
    "message": "Выход выполнен успешно",
    "sessions_revoked": 1
  }
}
```

При `all_devices: true`:

```json
{
  "ok": true,
  "data": {
    "message": "Выход выполнен на всех устройствах",
    "sessions_revoked": 4
  }
}
```

Cookie очищается:

```http
Set-Cookie: zedly_rt=; HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth; Max-Age=0
```

### Response — 401 Unauthorized

```json
{
  "ok": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Требуется авторизация"
  }
}
```

---

### Бизнес-ограничения

- Access token добавляется в Redis blacklist `bl:{jti}` с TTL равным оставшемуся времени жизни токена. Каждый защищённый эндпоинт проверяет blacklist перед обработкой запроса.
- `jti` (JWT ID) — уникальный UUID в payload каждого access token, именно он используется как ключ blacklist.
- `all_devices: true` удаляет из Redis все ключи по паттерну `rt:*` для данного `user_id` (SCAN + DEL). Используется при смене пароля и по требованию пользователя.
- После logout на страницах, где WebSocket-соединение открыто (например, Class Results), сервер отправляет событие `session_revoked` — клиент принудительно редиректит на Login.

---

## 5. POST /auth/invite/accept

**Описание:** Ученик принимает приглашение учителя по коду и завершает регистрацию. Привязывает нового пользователя к классу и школе учителя.

**Роль доступа:** Публичный

**Rate limit:** 20 запросов / IP / час

---

### Request

```http
POST /api/v1/auth/invite/accept
Content-Type: application/json
```

```json
{
  "invite_code": "X7K2QP",
  "full_name": "Юсупова Дилноза Рашидовна",
  "phone": "+998901234567",
  "password": "SecurePass456!",
  "language": "uz"
}
```

**Поля запроса:**

| Поле | Тип | Обязательно | Описание |
|---|---|---|---|
| `invite_code` | string | ✅ | 6-символьный код из приглашения учителя (буквы A-Z + цифры, без O/0/I/1 для читаемости) |
| `full_name` | string | ✅ | ФИО ученика. Мин. 5 символов, мак. 100 |
| `phone` | string | ✅ | Номер телефона ученика или родителя. Формат: +998XXXXXXXXX |
| `password` | string | ✅ | Пароль. Мин. 8 символов, хотя бы 1 цифра и 1 буква |
| `language` | string | ❌ | `uz` / `ru`. По умолчанию `uz` |

---

### Response — 201 Created

```json
{
  "ok": true,
  "data": {
    "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
    "token_type": "Bearer",
    "expires_in": 900,
    "user": {
      "id": "usr_stu_456",
      "full_name": "Юсупова Дилноза Рашидовна",
      "role": "student",
      "school_id": "school_42",
      "school_name": "Школа №42 г. Ташкент",
      "class_id": "class_9b",
      "class_name": "9-Б",
      "teacher_name": "Акбаров Шерзод Ботирович",
      "language": "uz"
    },
    "invite": {
      "code": "X7K2QP",
      "class_name": "9-Б",
      "subject": "Математика",
      "teacher_name": "Акбаров Шерзод Ботирович"
    }
  }
}
```

### Response — 400 Bad Request (код не найден)

```json
{
  "ok": false,
  "error": {
    "code": "INVITE_CODE_NOT_FOUND",
    "message": "Код приглашения не найден. Проверьте код или обратитесь к учителю"
  }
}
```

### Response — 410 Gone (код истёк)

```json
{
  "ok": false,
  "error": {
    "code": "INVITE_CODE_EXPIRED",
    "message": "Код приглашения истёк. Срок действия: 7 дней с момента создания",
    "expired_at": "2026-02-20T12:00:00Z"
  }
}
```

### Response — 409 Conflict (телефон уже зарегистрирован)

```json
{
  "ok": false,
  "error": {
    "code": "PHONE_ALREADY_EXISTS",
    "message": "Этот номер уже зарегистрирован. Войдите в существующий аккаунт или используйте другой номер"
  }
}
```

### Response — 403 Forbidden (лимит класса исчерпан)

```json
{
  "ok": false,
  "error": {
    "code": "CLASS_LIMIT_REACHED",
    "message": "Учитель достиг лимита учеников на бесплатном тарифе (30 учеников). Обратитесь к учителю для перехода на платный план",
    "current_count": 30,
    "limit": 30,
    "upgrade_url": "https://zedly.uz/pricing"
  }
}
```

---

### Бизнес-ограничения

- Invite code: 6 символов, алфавит `ACEFGHJKLMNPQRSTUVWXYZ3456789` (исключены визуально похожие: O/0, I/1, B/8). Генерируется учителем в интерфейсе `POST /api/v1/classes/{class_id}/invite`.
- TTL кода: **7 дней** с момента генерации. После истечения учитель генерирует новый.
- Один код может быть принят несколькими учениками (это не одноразовый код, а код класса).
- Freemium-лимит: учитель на бесплатном плане может иметь не более 30 активных учеников суммарно по всем классам. Проверяется атомарно с регистрацией (SELECT COUNT + INSERT в транзакции).
- После успешной регистрации:
  - Ученик автоматически добавляется в класс (`class_students` таблица)
  - Учителю отправляется уведомление в Telegram: «Новый ученик: Юсупова Д. принял приглашение в 9-Б»
  - Родительский код для ученика генерируется автоматически (6 символов, хранится в `students.parent_code`)
- Валидация `full_name`: только кириллица/латиница/пробелы/дефис; цифры и спецсимволы запрещены.
- Пароль хэшируется bcrypt с cost factor 12 перед сохранением.

---

## 6. Безопасность

### 6.1 HTTPS Everywhere

- Все HTTP-запросы → 301 Redirect на HTTPS. Настройка на уровне Nginx/Cloudflare.
- TLS 1.2 минимум, рекомендован TLS 1.3.
- HSTS заголовок: `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- Сертификат: Let's Encrypt (auto-renew через certbot) + wildcard `*.zedly.uz`.
- Cloudflare: все запросы проходят через Cloudflare Proxy (DDoS защита, скрытие origin IP).

### 6.2 Хранение JWT

| Среда | Access Token | Refresh Token |
|---|---|---|
| Web (React/Vue) | In-memory (`useRef` / Zustand store) — НЕ в localStorage, НЕ в sessionStorage | httpOnly cookie (`zedly_rt`) |
| PWA (offline) | In-memory | httpOnly cookie |
| Telegram Mini App | In-memory | In-memory (cookies недоступны в WebView TMA) |
| Mobile (future) | In-memory (SecureStore Expo) | SecureStore Expo (keychain iOS / keystore Android) |

**Почему не localStorage:**
- localStorage доступен любому JS на странице — XSS-атака позволяет украсть токен
- httpOnly cookie недоступна из JS — XSS-атака не может её прочитать
- CSRF-защита для cookie: `SameSite=Strict` + CSRF-token в заголовке `X-CSRF-Token` для state-changing запросов

### 6.3 Rate Limiting

| Эндпоинт | Лимит | Окно | Ключ | Действие при превышении |
|---|---|---|---|---|
| `/auth/login` | 10 req | 1 час | IP | 429 + `Retry-After` |
| `/auth/login` | 5 req | 1 час | email/phone | 429 + `Retry-After` |
| `/auth/telegram` | 20 req | 1 час | IP | 429 |
| `/auth/refresh` | 60 req | 1 час | device_id | 429 |
| `/auth/logout` | 10 req | 1 час | user_id | 429 |
| `/auth/invite/accept` | 20 req | 1 час | IP | 429 |
| Все API | 1000 req | 1 мин | IP | 429 (глобальный circuit breaker) |

Реализация: Redis + Sliding Window Counter (ZADD + ZCOUNT + EXPIRE на каждый запрос).

### 6.4 JWT структура (payload)

```json
{
  "iss": "zedly.uz",
  "sub": "usr_abc123",
  "jti": "jwt_7f3a9b2c-1234-5678-abcd-ef0123456789",
  "role": "teacher",
  "school_id": "school_42",
  "iat": 1709481600,
  "exp": 1709482500
}
```

| Claim | Описание |
|---|---|
| `iss` | Issuer — всегда `zedly.uz` |
| `sub` | Subject — `user_id` |
| `jti` | JWT ID — уникальный UUID, используется для blacklist при logout |
| `role` | Роль пользователя — для авторизации на уровне middleware |
| `school_id` | ID школы — для RLS и мультитенантной фильтрации |
| `iat` | Issued At — Unix timestamp выдачи |
| `exp` | Expiration — iat + 900 секунд |

Алгоритм подписи: **RS256** (RSA, 2048-bit). Приватный ключ — только на сервере. Публичный ключ доступен по `GET /api/v1/auth/.well-known/jwks.json` (для микросервисной верификации).

### 6.5 Защита от атак

**Brute Force:** счётчики неудачных попыток в Redis (`login_fails:{ip}`, `login_fails:{login}`) с TTL 1 час. Exponential backoff не применяется — просто hard limit.

**Credential Stuffing:** reCAPTCHA v3 после 5 неудач. Threshold score: 0.5. Интеграция — `POST https://www.google.com/recaptcha/api/siteverify`.

**Token Theft Detection:** повторное использование инвалидированного refresh token → немедленная инвалидация всех сессий пользователя + уведомление:

```json
{
  "event": "SUSPICIOUS_ACTIVITY_DETECTED",
  "message": "Обнаружено подозрительное использование токена. Все сессии завершены. Смените пароль."
}
```

**CSRF:** `SameSite=Strict` для cookie + заголовок `X-CSRF-Token` (double-submit cookie pattern) для мутирующих запросов из браузера.

**SQL Injection:** все запросы через ORM (Prisma/SQLAlchemy) с параметризованными запросами. Прямой SQL запрещён в auth-модуле.

**Timing Attack:** сравнение паролей через `bcrypt.compare()` (константное время). Сравнение hash Telegram через `crypto.timingSafeEqual()`.

### 6.6 Аудит и мониторинг

Все события записываются в таблицу `auth_audit_log`:

```sql
CREATE TABLE auth_audit_log (
  id          BIGSERIAL PRIMARY KEY,
  event       VARCHAR(50) NOT NULL,   -- LOGIN_SUCCESS, LOGIN_FAIL, LOGOUT, TOKEN_REFRESH, INVITE_ACCEPT, SUSPICIOUS_ACTIVITY
  user_id     VARCHAR(50),
  school_id   VARCHAR(50),
  ip          INET NOT NULL,
  user_agent  TEXT,
  device_id   VARCHAR(100),
  login       VARCHAR(255),           -- email/phone (только для LOGIN_FAIL)
  metadata    JSONB,                  -- доп. данные (telegram_id, invite_code, sessions_revoked и т.п.)
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON auth_audit_log (user_id, created_at);
CREATE INDEX ON auth_audit_log (ip, created_at);
CREATE INDEX ON auth_audit_log (event, created_at);
```

Алерты (Telegram → служебный чат ops):
- `SUSPICIOUS_ACTIVITY_DETECTED` — немедленно
- `LOGIN_FAIL` с одного IP > 50 раз за 10 минут — немедленно
- `ACCOUNT_LOCKED` > 10 раз за 1 час — немедленно

---

## 7. Общие коды ошибок

| HTTP код | `error.code` | Описание |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Невалидные данные запроса. В `error.details` — массив полей с описанием |
| 400 | `INVITE_CODE_NOT_FOUND` | Код приглашения не существует |
| 401 | `UNAUTHORIZED` | Отсутствует или невалидный access token |
| 401 | `INVALID_CREDENTIALS` | Неверный логин или пароль |
| 401 | `REFRESH_TOKEN_INVALID` | Refresh token не найден или истёк |
| 401 | `REFRESH_TOKEN_REVOKED` | Refresh token был отозван |
| 401 | `TELEGRAM_HASH_INVALID` | Подпись Telegram не прошла верификацию |
| 401 | `TELEGRAM_AUTH_EXPIRED` | `auth_date` старше 5 минут |
| 403 | `ACCOUNT_LOCKED` | Аккаунт временно заблокирован |
| 403 | `ACCOUNT_DISABLED` | Аккаунт деактивирован администратором |
| 403 | `CLASS_LIMIT_REACHED` | Freemium-лимит учеников исчерпан |
| 409 | `PHONE_ALREADY_EXISTS` | Телефон уже зарегистрирован |
| 409 | `TELEGRAM_ID_ALREADY_BOUND` | Telegram ID привязан к другому аккаунту |
| 410 | `INVITE_CODE_EXPIRED` | Код приглашения истёк (> 7 дней) |
| 429 | `RATE_LIMIT_EXCEEDED` | Превышен rate limit. Заголовок `Retry-After` содержит секунды ожидания |
| 500 | `INTERNAL_ERROR` | Внутренняя ошибка сервера. `request_id` для трассировки |

### Формат ошибки валидации (400 VALIDATION_ERROR)

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Ошибка валидации данных",
    "details": [
      {
        "field": "password",
        "message": "Пароль должен содержать не менее 8 символов"
      },
      {
        "field": "phone",
        "message": "Неверный формат номера. Ожидается +998XXXXXXXXX"
      }
    ]
  }
}
```

### Формат ошибки сервера (500)

```json
{
  "ok": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Внутренняя ошибка. Пожалуйста, попробуйте позже",
    "request_id": "req_abc123xyz"
  }
}
```

> `request_id` присутствует в каждом ответе (включая успешные) в заголовке `X-Request-ID: req_abc123xyz`. Используется для трассировки в structured logs.

---

*Следующий файл: `docs/07_api/tests_api.md` — CRUD тестов, AI-генерация, назначение классам.*
