# docs/05_backend/auth_spec.md

> **Проект:** Zedly — SaaS-платформа онлайн-тестирования и аналитики для школ Узбекистана  
> **Модуль:** Authentication & Authorization  
> **Тип документа:** Логическая спецификация (не код)  
> **Приоритет:** MVP · Критический

---

## Ответственность модуля

Модуль отвечает за:

- Аутентификацию всех пользователей платформы (учитель, ученик, директор, родитель, РОНО-инспектор, Минпрос)
- Выдачу, обновление и отзыв токенов
- Авторизацию каждого запроса: роль пользователя имеет право на это действие?
- Изоляцию данных между школами: `school_id` из токена совпадает со `school_id` ресурса?
- Аудит-логирование попыток несанкционированного доступа

Модуль **не отвечает** за: бизнес-логику тестов, аналитику, генерацию контента.

---

## 1. Схема токенов

### 1.1 Access Token (JWT)

| Параметр | Значение |
|----------|----------|
| Алгоритм подписи | HS256 (симметричный) → при масштабировании мигрировать на RS256 |
| TTL | 15 минут |
| Хранение на клиенте | `memory` (JS-переменная) — **не в localStorage, не в cookie** без `HttpOnly` |
| Передача | `Authorization: Bearer <token>` |

**Payload JWT:**

```json
{
  "sub": "user_uuid",
  "school_id": "school_uuid",
  "role": "teacher",
  "permissions": ["create_test", "view_class_analytics", "assign_test"],
  "telegram_id": 123456789,
  "iat": 1709000000,
  "exp": 1709000900
}
```

> `permissions` — массив гранулярных прав, кэшированный из `role_permissions` на момент выдачи токена. При смене роли администратором — текущий access token остаётся валидным до истечения TTL (максимум 15 мин), refresh token инвалидируется немедленно.

### 1.2 Refresh Token

| Параметр | Значение |
|----------|----------|
| Формат | Криптографически случайная строка (32 байта, base64url) |
| TTL | 30 дней |
| Хранение на сервере | Redis: ключ `refresh:{token_hash}` → `{user_id, school_id, role, device_id, issued_at}` |
| Хранение на клиенте | `HttpOnly; Secure; SameSite=Strict` cookie |
| Ротация | При каждом использовании — старый токен уничтожается, выдаётся новый (refresh token rotation) |
| Семейство токенов | При обнаружении повторного использования уже использованного refresh token — инвалидировать **все** токены пользователя (признак кражи) |

**Redis-структура:**

```
Key:   refresh:{sha256(token)}
Value: {
  "user_id": "uuid",
  "school_id": "uuid",
  "role": "teacher",
  "device_id": "uuid",
  "user_agent": "Mozilla/5.0...",
  "issued_at": 1709000000,
  "family_id": "uuid"   ← для обнаружения кражи
}
TTL: 2592000 (30 дней в секундах)
```

### 1.3 Жизненный цикл токенов

```
[Логин] ──────────────────────────────────────────────────────────┐
    │                                                              │
    ▼                                                              │
Выдать access_token (15 мин) + refresh_token (30 дней)           │
    │                                                              │
    ▼                                                              │
[Запрос к API с access_token]                                     │
    │                                                              │
    ├─ Токен валиден ──→ Выполнить запрос                         │
    │                                                              │
    └─ Токен истёк ──→ 401 с кодом TOKEN_EXPIRED                  │
           │                                                        │
           ▼                                                        │
    [POST /auth/refresh с refresh_token]                          │
           │                                                        │
           ├─ Refresh валиден ──→ Новый access + новый refresh    │
           │                                                        │
           └─ Refresh истёк / инвалидирован ──→ 401 REFRESH_EXPIRED │
                  │                                                 │
                  └──────────────────── Редирект на логин ──────────┘

[Logout] ──→ Инвалидировать refresh_token в Redis немедленно
[Logout all devices] ──→ Инвалидировать все refresh-токены пользователя (по user_id pattern)
```

---

## 2. Методы аутентификации

### 2.1 Telegram Login Widget

**Используется:** учителя (основной метод), директора, РОНО-инспекторы  
**Почему основной:** Узбекские учителя уже в Telegram, не нужен пароль

#### Флоу HMAC-верификации

```
Браузер                         Backend                      Telegram
   │                                │                             │
   │── [Нажать "Войти через Telegram"]                            │
   │                                │                             │
   │<─────────── Telegram Login Widget (JS) ─────────────────────│
   │                                │                             │
   │── Пользователь разрешает ──────────────────────────────────>│
   │<─────────────────────────────── data_check_string + hash ───│
   │                                │                             │
   │── POST /auth/telegram ─────────>│                            │
   │   { id, first_name, last_name, │                            │
   │     username, photo_url,       │                            │
   │     auth_date, hash }          │                            │
   │                                │                             │
   │                  ┌─────────────┴──────────────┐             │
   │                  │ 1. Проверить auth_date      │             │
   │                  │    (не старше 86400 сек)    │             │
   │                  │ 2. Построить data_check_string            │
   │                  │    (sorted key=value\n)     │             │
   │                  │ 3. secret = SHA256(BOT_TOKEN)│            │
   │                  │ 4. HMAC-SHA256(secret,       │            │
   │                  │    data_check_string)        │            │
   │                  │ 5. Сравнить с hash           │            │
   │                  └─────────────┬──────────────┘             │
   │                                │                             │
   │                  ┌─────────────┴──────────────┐             │
   │                  │ Найти / создать users запись│             │
   │                  │ по telegram_id              │             │
   │                  └─────────────┬──────────────┘             │
   │                                │                             │
   │<── JWT + Refresh Token ────────│                             │
```

**Валидации (обязательны все):**

| Проверка | Условие провала | HTTP-ответ |
|----------|-----------------|------------|
| `auth_date` не старше 86 400 сек (24 часа) | Просроченные данные | `401 TELEGRAM_AUTH_EXPIRED` |
| HMAC совпадает | Подпись не валидна | `401 TELEGRAM_HASH_INVALID` |
| `id` является числом > 0 | Некорректные данные | `400 INVALID_TELEGRAM_DATA` |
| BOT_TOKEN задан в env | Отсутствует конфигурация | `500` + алерт |

**Создание/обновление пользователя:**

- Если `telegram_id` не найден в `users` → создать новую запись, `is_new = true`
- Если найден → обновить `telegram_username`, `telegram_photo_url`, `last_login_at`
- `is_new = true` → установить `onboarding_step = 0` в `user_metadata`

---

### 2.2 Email + Password

**Используется:** резервный метод для всех ролей, основной для административных аккаунтов Zedly-команды

#### Регистрация

| Шаг | Действие | Система |
|-----|----------|---------|
| 1 | POST /auth/register `{email, password, name}` | Валидировать email-формат (RFC 5322), пароль ≥ 8 символов |
| 2 | Уникальность email | SELECT по `users.email`; если занят → `409 EMAIL_ALREADY_EXISTS` |
| 3 | Хэширование пароля | bcrypt, cost factor **12** |
| 4 | Создать `users` запись | `email_verified = false`, `onboarding_completed = false` |
| 5 | Отправить письмо верификации | Токен верификации: случайная строка 32 байта, TTL **24 часа** в Redis |
| 6 | Ответ | `201 { "message": "Проверьте почту для подтверждения аккаунта" }` |

> Не выдавать JWT до подтверждения email — это предотвращает регистрацию на чужой адрес.

**Redis-структура токена верификации:**

```
Key:   email_verify:{token}
Value: { "user_id": "uuid", "email": "..." }
TTL:   86400 (24 часа)
```

#### Верификация email

| Шаг | Действие | Система |
|-----|----------|---------|
| 1 | GET /auth/verify-email?token=... | Найти токен в Redis |
| 2 | Токен не найден | `400 INVALID_OR_EXPIRED_TOKEN` + ссылка на повторную отправку |
| 3 | Токен найден | Установить `email_verified = true` в `users`; удалить токен из Redis |
| 4 | Выдать токены | JWT + Refresh Token, установить `onboarding_step = 0` |

#### Логин

| Шаг | Действие | Система |
|-----|----------|---------|
| 1 | POST /auth/login `{email, password}` | Rate limit: **10 попыток в час** на IP + email (отдельные бакеты) |
| 2 | Найти пользователя | SELECT по `users.email`; если не найден → `401 INVALID_CREDENTIALS` (не раскрывать, что email не существует) |
| 3 | `email_verified = false` | `403 EMAIL_NOT_VERIFIED` + предложение выслать письмо повторно |
| 4 | Сравнить пароль | bcrypt.compare; если не совпадает → `401 INVALID_CREDENTIALS`; инкрементировать счётчик попыток |
| 5 | Успех | Обнулить счётчик попыток; выдать JWT + Refresh Token; обновить `last_login_at` |

**Rate limiting (Redis):**

```
Key:   login_attempts:ip:{ip}
Key:   login_attempts:email:{email_hash}
Value: счётчик попыток
TTL:   3600 (1 час)
Лимит: 10 попыток → 429 TOO_MANY_REQUESTS + Retry-After: {секунд до сброса}
```

#### Смена пароля

| Шаг | Действие |
|-----|----------|
| Запрос сброса | POST /auth/forgot-password `{email}` → всегда `200` (не раскрывать существование email) |
| Токен сброса | 32 байта, TTL **1 час** в Redis; одноразовый |
| Установить новый пароль | POST /auth/reset-password `{token, new_password}` → bcrypt(12); инвалидировать **все** refresh токены пользователя |

---

### 2.3 Ссылка-приглашение (Invite Link)

**Используется:** ученики — не вводят пароль, получают ссылку от учителя

#### Генерация ссылки (учитель)

| Параметр | Значение |
|----------|----------|
| Endpoint | POST /auth/invite-link |
| Кто может вызвать | Роль `teacher`, `director` (в пределах своей `school_id`) |
| Токен | Случайная строка 16 байт, base62 (короткая, удобная для копирования) |
| TTL | **72 часа** (3 дня) |
| Scope | Привязан к `school_id` + `class_id` (опционально) |
| Тип | Многоразовый (до 200 использований) или одноразовый — определяется параметром `single_use: bool` |

**Redis-структура:**

```
Key:   invite:{token}
Value: {
  "school_id": "uuid",
  "class_id": "uuid | null",
  "created_by": "teacher_uuid",
  "role": "student",
  "uses_count": 0,
  "max_uses": 200,
  "single_use": false,
  "expires_at": 1709259200
}
TTL:   259200 (72 часа)
```

#### Активация ссылки (ученик)

| Шаг | Действие | Система |
|-----|----------|---------|
| 1 | GET /auth/invite/{token} | Найти токен в Redis |
| 2 | Токен не найден / истёк | `404 INVITE_NOT_FOUND` с сообщением «Ссылка устарела. Попросите учителя выдать новую» |
| 3 | Показать форму | Имя + опциональный пароль (если ученик хочет задать) |
| 4 | POST /auth/register-by-invite `{token, name, password?}` | Создать `users` с `role=student`, привязать `school_id`, `class_id` из invite |
| 5 | Инкрементировать `uses_count` | Если `single_use` → удалить токен из Redis; если `uses_count >= max_uses` → удалить |
| 6 | Выдать токены | JWT + Refresh Token |

> Если ученик уже зарегистрирован (нашёлся по `telegram_id` или email) → не создавать новый аккаунт, просто привязать к классу и школе.

---

### 2.4 Telegram Bot Auth (ученики в мессенджере)

**Используется:** ученики, проходящие тесты прямо в Telegram-боте

**Флоу:**

1. Ученик нажимает `/start {invite_token}` в боте
2. Бот запрашивает `POST /auth/telegram-bot` с `{telegram_id, first_name, invite_token?}`
3. Backend верифицирует через Telegram Bot API (проверка `update` подписи)
4. Если `invite_token` есть → регистрирует по инвайту (привязывает к классу)
5. Если `invite_token` нет → находит существующий аккаунт по `telegram_id`
6. Возвращает internal session token (короткоживущий, 24 часа) для сессии бота

> Для бота выдаётся **не стандартный JWT** — это отдельный тип токена `bot_session`, хранящийся в Redis. Браузерные клиенты не принимают bot_session.

---

## 3. Изоляция школ (School Isolation)

**Это критически важно.** Утечка данных одной школы к другой — юридическая ответственность и потеря доверия.

### 3.1 Middleware-проверка (слой приложения)

Выполняется **на каждом запросе** после верификации JWT:

```
1. Извлечь school_id из JWT payload
2. Определить school_id запрашиваемого ресурса
   (из URL-параметра, тела запроса или БД)
3. Если school_id_jwt ≠ school_id_resource:
   → Вернуть 403 FORBIDDEN
   → Записать в audit_log (НЕ 404 — не раскрывать существование ресурса)
4. Если school_id совпадают — передать запрос дальше
```

**Исключения из проверки (whitelist):**

- `GET /auth/*` — публичные эндпоинты
- `GET /marketplace/tests` — тесты в маркетплейсе видны всем (но без `school_id` привязки)
- `GET /certificates/verify/{qr_code}` — публичная верификация сертификатов
- Запросы роли `roono_inspector` и `ministry` — у них `school_id = null`, своя логика изоляции по `district_id` / `region_id`

### 3.2 Row-Level Security (слой БД)

PostgreSQL RLS — вторая линия защиты:

```sql
-- Пример политики для таблицы tests
CREATE POLICY school_isolation ON tests
  USING (school_id = current_setting('app.school_id')::uuid);

-- Middleware устанавливает перед каждым запросом:
SET LOCAL app.school_id = '{school_id_from_jwt}';
```

**Важно:** RLS — резервный уровень, не замена middleware. Если middleware пропустил некорректный запрос, RLS вернёт пустой результат вместо чужих данных.

### 3.3 Audit Log

Каждая попытка несанкционированного доступа:

```json
{
  "event": "unauthorized_school_access",
  "user_id": "uuid",
  "user_school_id": "uuid",
  "target_school_id": "uuid",
  "endpoint": "GET /api/tests/test_id",
  "ip": "x.x.x.x",
  "timestamp": "2026-02-27T10:00:00Z",
  "request_id": "uuid"
}
```

**Хранение:** таблица `audit_log` в PostgreSQL (отдельная, без RLS — пишет только системный пользователь).  
**Алерт:** 5+ попыток за 10 минут от одного `user_id` → Slack/Telegram-уведомление команде безопасности.

---

## 4. Роли и разрешения

### 4.1 Таблица permissions по ролям

| Action | student | teacher | director | parent | roono_inspector | ministry | zedly_admin |
|--------|:-------:|:-------:|:--------:|:------:|:---------------:|:--------:|:-----------:|
| `take_test` | ✅ | — | — | — | — | — | ✅ |
| `create_test` | — | ✅ | — | — | — | — | ✅ |
| `edit_own_test` | — | ✅ | — | — | — | — | ✅ |
| `delete_own_test` | — | ✅ | — | — | — | — | ✅ |
| `assign_test` | — | ✅ | ✅ | — | — | — | ✅ |
| `view_class_analytics` | — | ✅ | ✅ | — | — | — | ✅ |
| `view_school_analytics` | — | — | ✅ | — | — | — | ✅ |
| `view_district_analytics` | — | — | — | — | ✅ | — | ✅ |
| `view_national_analytics` | — | — | — | — | — | ✅ | ✅ |
| `view_own_results` | ✅ | — | — | — | — | — | ✅ |
| `view_child_results` | — | — | — | ✅ | — | — | ✅ |
| `manage_school_users` | — | — | ✅ | — | — | — | ✅ |
| `generate_ai_test` | — | ✅ | — | — | — | — | ✅ |
| `export_report` | — | ✅ | ✅ | — | ✅ | ✅ | ✅ |
| `create_school_challenge` | — | — | ✅ | — | — | — | ✅ |
| `manage_invite_links` | — | ✅ | ✅ | — | — | — | ✅ |
| `issue_certificate` | — | ✅ | — | — | — | — | ✅ |
| `manage_marketplace` | — | — | — | — | — | — | ✅ |
| `publish_test_to_marketplace` | — | ✅ | — | — | — | — | ✅ |
| `view_audit_log` | — | — | — | — | — | — | ✅ |

> Таблица хранится в `role_permissions` в БД. При выдаче JWT — permissions копируются в payload. **Если директор изменил роль учителя — это вступит в силу при следующем логине** (текущий access token живёт до 15 мин, refresh инвалидируется немедленно через Redis).

### 4.2 Freemium-ограничения (не в JWT — проверяются динамически)

Следующие ограничения **не хранятся в JWT** — проверяются в бизнес-логике при каждом действии:

| Ограничение | Freemium | Paid |
|-------------|----------|------|
| Учеников на учителя | ≤ 30 уникальных | Без лимита |
| AI-генераций тестов в месяц | ≤ 10 | Без лимита |
| Аналитика директора | ❌ | ✅ |
| Межшкольный челлендж | ❌ | ✅ |
| Экспорт отчётов | ❌ | ✅ |

Статус плана хранится в `schools.plan` (`free` / `paid`). Проверяется в middleware после проверки роли.

---

## 5. Endpoints Authentication Module

### 5.1 Полная таблица эндпоинтов

| Method | Path | Auth | Rate Limit | Описание |
|--------|------|------|------------|----------|
| POST | /auth/register | — | 5/мин/IP | Email-регистрация |
| POST | /auth/login | — | 10/час/IP+email | Вход по email+пароль |
| POST | /auth/telegram | — | 20/мин/IP | Telegram Login Widget |
| POST | /auth/telegram-bot | Bot secret | 100/мин | Telegram Bot Auth |
| POST | /auth/refresh | Refresh cookie | 60/час/user | Обновить access token |
| POST | /auth/logout | Bearer | — | Выйти с текущего устройства |
| POST | /auth/logout-all | Bearer | — | Выйти со всех устройств |
| GET | /auth/verify-email | — | 10/час/IP | Верификация email |
| POST | /auth/resend-verification | — | 3/час/email | Повторная отправка письма |
| POST | /auth/forgot-password | — | 3/час/email | Запрос сброса пароля |
| POST | /auth/reset-password | — | 5/час/IP | Установить новый пароль |
| POST | /auth/invite-link | Bearer (teacher/director) | 20/час/user | Создать ссылку-приглашение |
| GET | /auth/invite/{token} | — | 30/мин/IP | Информация об инвайте |
| POST | /auth/register-by-invite | — | 10/мин/IP | Регистрация по инвайту |
| GET | /auth/me | Bearer | — | Текущий пользователь |
| GET | /auth/sessions | Bearer | — | Активные сессии (устройства) |
| DELETE | /auth/sessions/{device_id} | Bearer | — | Завершить сессию устройства |

### 5.2 Структура успешного ответа логина

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 900,
  "user": {
    "id": "uuid",
    "name": "Алишер Каримов",
    "email": "teacher@school.uz",
    "telegram_id": 123456789,
    "role": "teacher",
    "school_id": "uuid",
    "school_name": "Школа №15, Ташкент",
    "onboarding_completed": true,
    "plan": "free"
  }
}
```

> Refresh token передаётся **только в `HttpOnly; Secure; SameSite=Strict` cookie**, не в теле ответа.

### 5.3 Структура ошибок (единый формат)

```json
{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Неверный email или пароль",
    "request_id": "uuid"
  }
}
```

**Коды ошибок:**

| HTTP | Code | Описание |
|------|------|----------|
| 400 | `INVALID_INPUT` | Ошибка валидации полей |
| 400 | `INVALID_OR_EXPIRED_TOKEN` | Токен верификации/сброса пароля невалиден |
| 400 | `INVALID_TELEGRAM_DATA` | Некорректные данные от Telegram |
| 401 | `INVALID_CREDENTIALS` | Неверный email / пароль |
| 401 | `TOKEN_EXPIRED` | Access token истёк |
| 401 | `REFRESH_EXPIRED` | Refresh token истёк или инвалидирован |
| 401 | `TELEGRAM_AUTH_EXPIRED` | `auth_date` старше 24 часов |
| 401 | `TELEGRAM_HASH_INVALID` | HMAC-подпись не совпала |
| 403 | `EMAIL_NOT_VERIFIED` | Email не подтверждён |
| 403 | `FORBIDDEN` | Нет прав на ресурс |
| 403 | `SCHOOL_ISOLATION_VIOLATION` | Попытка доступа к данным другой школы |
| 404 | `INVITE_NOT_FOUND` | Инвайт-токен не найден или истёк |
| 409 | `EMAIL_ALREADY_EXISTS` | Email уже зарегистрирован |
| 409 | `TELEGRAM_ALREADY_EXISTS` | Telegram аккаунт уже привязан |
| 429 | `TOO_MANY_REQUESTS` | Rate limit превышен |

---

## 6. Сессии и устройства

### 6.1 Управление активными сессиями

Каждый refresh token привязан к `device_id`:

```
GET /auth/sessions
Response:
[
  {
    "device_id": "uuid",
    "user_agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0...)",
    "ip": "95.130.x.x",
    "location": "Ташкент, UZ",
    "issued_at": "2026-02-20T10:00:00Z",
    "last_used_at": "2026-02-27T09:30:00Z",
    "is_current": true
  },
  {
    "device_id": "uuid",
    "user_agent": "TelegramBot/1.0",
    "ip": "...",
    "issued_at": "2026-02-15T08:00:00Z",
    "last_used_at": "2026-02-26T18:00:00Z",
    "is_current": false
  }
]
```

### 6.2 Logout

**Logout с текущего устройства:**

```
POST /auth/logout
→ Удалить refresh:{token_hash} из Redis
→ Клиент удаляет access token из памяти, cookie очищается
```

**Logout со всех устройств:**

```
POST /auth/logout-all
→ Найти все ключи: SCAN refresh:* WHERE value.user_id = {user_id}
→ Удалить все (реализация: хранить family_id → быстрый удаление через secondary index)
→ Ответ: { "sessions_terminated": 3 }
```

**Реализация быстрого logout-all (Redis):**

```
Key:   user_sessions:{user_id}
Value: Set [ "refresh_token_hash_1", "refresh_token_hash_2", ... ]
TTL:   30 дней (обновляется при каждом логине)
```

При `logout-all` → `DEL user_sessions:{user_id}` + итерация по set для удаления каждого ключа `refresh:*`.

---

## 7. Безопасность

### 7.1 Защита от типовых атак

| Атака | Защита |
|-------|--------|
| Brute force | Rate limiting: 10/час/IP + 10/час/email; прогрессивный бэкофф |
| Token theft (access) | TTL 15 мин; хранение в памяти (не localStorage) |
| Token theft (refresh) | Rotation + обнаружение повторного использования → инвалидация семейства |
| CSRF | SameSite=Strict на refresh cookie; CSRF-токен для критических мутаций |
| XSS | Access token не в DOM; CSP заголовки; HttpOnly cookie для refresh |
| SQL Injection | Параметризованные запросы (ORM); RLS |
| Telegram replay attack | Проверка `auth_date` (не старше 24 часов) |
| Enumeration (email/user) | Единообразные ответы: `401 INVALID_CREDENTIALS` без указания причины |
| Cross-school data access | Middleware + RLS + Audit log |

### 7.2 Хранение секретов

| Секрет | Хранение | Ротация |
|--------|----------|---------|
| JWT_SECRET | Environment variable (не в коде) | При подозрении на компрометацию |
| Telegram BOT_TOKEN | Environment variable | При компрометации |
| DB_PASSWORD | Environment variable / Secrets Manager | Ежеквартально |
| Redis PASSWORD | Environment variable | Ежеквартально |

> **Никогда** не коммитить секреты в репозиторий. `.env` добавлен в `.gitignore`. При CI/CD — использовать Vault или Secrets Manager.

### 7.3 Structured Logging

Каждый auth-запрос логируется в JSON:

```json
{
  "timestamp": "2026-02-27T10:00:00.000Z",
  "level": "info",
  "request_id": "uuid",
  "event": "auth.login.success",
  "user_id": "uuid",
  "school_id": "uuid",
  "method": "telegram",
  "ip": "95.130.x.x",
  "user_agent": "...",
  "duration_ms": 45
}
```

**Чувствительные данные (никогда не логировать):**

- Пароли (даже хэши)
- Полные токены (только первые 8 символов для отладки: `eyJhbGci...`)
- Telegram hash
- Персональные данные учеников

---

## 8. Нагрузочные характеристики

| Метрика | Значение | При каких условиях |
|---------|----------|--------------------|
| Одновременных сессий | 1 000 | 100 школ, пиковая нагрузка |
| Запросов к /auth/refresh в минуту | ~500 | 1 000 сессий, TTL 15 мин → обновление раз в 14 мин |
| Redis операций на авторизацию | 2 (read refresh + write new refresh) | При каждом обновлении токена |
| Латентность авторизации | < 10 мс | Redis in-memory lookup |
| Латентность bcrypt (cost 12) | ~200–400 мс | При логине по email — допустимо |
| HMAC-верификация Telegram | < 1 мс | Вычислительно дёшево |

**Redis-инфраструктура для auth:**

```
Отдельная Redis DB (index 0 — sessions, index 1 — rate limits, index 2 — email tokens)
Persistence: AOF (Append Only File) для refresh tokens — нельзя терять при рестарте
Replica: 1 read replica при 50+ школах
```

---

## 9. Граничные случаи

| Сценарий | Поведение |
|----------|-----------|
| Пользователь одновременно открыл 2 вкладки, access token истёк в обеих | Первая вкладка обновляет токен → получает новый refresh; вторая вкладка запрашивает обновление старого refresh → `401 REFRESH_EXPIRED` (уже ротирован) → редирект на логин с уведомлением «Выполните вход снова» |
| Директор сменил учителю роль на `student` | Refresh token инвалидируется немедленно; текущий access token (если был) истечёт через ≤ 15 мин; при следующем запросе учитель увидит новую роль |
| Redis недоступен | Auth-запросы: `503 Service Unavailable`; уже выданные access tokens продолжают работать до TTL (15 мин); refresh-операции недоступны |
| Ученик пытается использовать просроченный инвайт-токен (72 ч) | `404 INVITE_NOT_FOUND` с текстом «Ссылка устарела. Попросите учителя выдать новую» |
| Один Telegram-аккаунт пытается зарегистрироваться дважды | Система находит существующую запись по `telegram_id` и логинит (не создаёт дубль) |
| Учитель привязал Telegram, потом хочет войти по email | Оба метода работают независимо — привязаны к одному `user_id` |
| Refresh token украден и использован злоумышленником | При повторном использовании уже ротированного refresh → инвалидировать **всё семейство** токенов пользователя → принудительный logout → уведомление пользователю «Замечена подозрительная активность» |
| Массовый сброс Redis (рестарт без AOF) | Все активные сессии инвалидируются; пользователи вынуждены перелогиниться; миграция: `ALTER TABLE users ADD COLUMN session_invalidated_at` для версионирования |
| `roono_inspector` пытается обратиться к данным школы не своего района | `403 FORBIDDEN` + audit_log; у инспектора нет `school_id` в JWT, есть `district_id` |

---

## 10. Acceptance Criteria

### AC-01: Успешный вход через Telegram

```gherkin
Given: Учитель открывает страницу логина
When: Нажимает «Войти через Telegram» и подтверждает в приложении Telegram
Then: Получает access token (JWT, TTL 15 мин) и refresh token (HttpOnly cookie, TTL 30 дней)
And: В users создана или обновлена запись с telegram_id
And: В логах записано событие auth.login.success с method=telegram
And: Время ответа < 500 мс
```

### AC-02: Блокировка после 10 неудачных попыток email-логина

```gherkin
Given: Существующий пользователь с email teacher@school.uz
When: 10 раз подряд вводит неверный пароль в течение 1 часа
Then: 11-я попытка возвращает 429 TOO_MANY_REQUESTS
And: В ответе есть заголовок Retry-After со значением (секунды до сброса лимита)
And: После истечения 1 часа пользователь может снова пробовать
```

### AC-03: Обновление access token через refresh

```gherkin
Given: Пользователь авторизован, access token истёк (прошло > 15 мин)
When: Клиент отправляет POST /auth/refresh с валидным refresh cookie
Then: Возвращается новый access token (новый TTL 15 мин)
And: Старый refresh token удалён из Redis
And: Новый refresh token записан в Redis и отправлен в HttpOnly cookie
And: Время ответа < 50 мс
```

### AC-04: Попытка доступа к данным другой школы

```gherkin
Given: Учитель из Школы A (school_id = "aaa") авторизован
When: Отправляет GET /api/tests/{test_id}, где test принадлежит Школе B (school_id = "bbb")
Then: Получает 403 FORBIDDEN (не 404)
And: Тело ответа: { "error": { "code": "SCHOOL_ISOLATION_VIOLATION", ... } }
And: В таблице audit_log записана попытка с user_id, обоими school_id, endpoint, timestamp
And: access_token при этом НЕ инвалидируется
```

### AC-05: Logout со всех устройств

```gherkin
Given: Пользователь авторизован на 3 устройствах (3 активных refresh token в Redis)
When: Отправляет POST /auth/logout-all с текущим access token
Then: Все 3 refresh token удалены из Redis
And: Ответ: { "sessions_terminated": 3 }
And: При попытке использовать любой из старых refresh tokens → 401 REFRESH_EXPIRED
And: Текущий access token истечёт естественно через ≤ 15 мин
```

### AC-06: Обнаружение кражи refresh token

```gherkin
Given: Refresh token пользователя украден и уже использован (ротирован)
When: Злоумышленник пытается использовать старый refresh token повторно
Then: Система определяет повторное использование ротированного токена
And: Инвалидирует всё семейство refresh токенов пользователя (logout всех устройств)
And: Записывает security alert в audit_log с event=token_reuse_detected
And: При следующем запросе с access token (если ещё не истёк) — токен становится невалидным
```

### AC-07: Регистрация по ссылке-приглашению

```gherkin
Given: Учитель создал invite link для класса 7А с TTL 72 часа
When: Ученик открывает ссылку и вводит имя (пароль — опционально)
Then: Создан аккаунт с role=student, school_id и class_id из invite
And: uses_count инкрементирован в Redis
And: Ученик получает JWT + refresh token
And: Повторная регистрация с тем же Telegram → существующий аккаунт, не дубль
```

### AC-08: Просроченный invite token

```gherkin
Given: Invite token создан 73 часа назад (TTL = 72 часа)
When: Ученик пытается открыть /auth/invite/{token}
Then: Ответ 404 INVITE_NOT_FOUND
And: Сообщение: «Ссылка устарела. Попросите учителя выдать новую»
And: Новый аккаунт не создаётся
```

---

## 11. Зависимости

### БД-таблицы (минимальный набор для этого модуля)

| Таблица | Назначение |
|---------|------------|
| `users` | `id, email, password_hash, telegram_id, role, school_id, email_verified, last_login_at, created_at` |
| `role_permissions` | `role, action` — справочник разрешений |
| `audit_log` | `id, event, user_id, school_id, target_school_id, endpoint, ip, request_id, timestamp` |
| `schools` | `id, name, plan (free/paid), district_id, is_active` |

### Redis-пространства ключей

| Паттерн ключа | Назначение |
|---------------|------------|
| `refresh:{token_hash}` | Refresh token данные |
| `user_sessions:{user_id}` | Set активных refresh token хэшей |
| `login_attempts:ip:{ip}` | Rate limit по IP |
| `login_attempts:email:{hash}` | Rate limit по email |
| `email_verify:{token}` | Токен верификации email |
| `email_reset:{token}` | Токен сброса пароля |
| `invite:{token}` | Данные invite-ссылки |
| `bot_session:{token}` | Telegram Bot сессия |

### Внешние зависимости

| Сервис | Используется для |
|--------|-----------------|
| Telegram Bot API | Login Widget HMAC-верификация |
| SMTP / Email Service | Письма верификации и сброса пароля |
| Redis | Refresh tokens, rate limits, сессии |
| PostgreSQL | Users, permissions, audit log |

---

## Потенциальные несоответствия — проверить

1. **school_invite_codes TTL = 72 часа** — задокументировано здесь и в `04_user_flows/onboarding_teacher.md`; должно совпадать с `08_data_model/entities.md`
2. **Freemium: 30 учеников / 10 AI-генераций** — проверяются в бизнес-логике, не в JWT; должны совпадать с `02_roles/teacher.md` → «Ограничения» и `03_features/ai_test_generation.md`
3. **bot_session тип токена** — отдельный от JWT; должен быть задокументирован в `07_api/` при описании Telegram Bot API эндпоинтов
4. **roono_inspector авторизация** — использует `district_id` вместо `school_id`; убедиться, что `02_roles/roono_inspector.md` и `09_permissions/permissions_matrix.md` описывают ту же логику
5. **Инвалидация JWT при смене роли** — текущий access token живёт до 15 мин; если в `09_permissions/permissions_matrix.md` описан мгновенный отзыв прав — нужно согласовать (либо добавить blacklist access tokens в Redis)
