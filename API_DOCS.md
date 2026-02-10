# ZEDLY API Documentation

## Аутентификация

### POST /api/auth/login
Вход в систему

**Request Body:**
```json
{
  "username": "superadmin",
  "password": "admin123",
  "remember": true
}
```

**Response (200):**
```json
{
  "message": "Login successful",
  "user": {
    "id": 1,
    "username": "superadmin",
    "role": "superadmin",
    "school_id": null,
    "full_name": "Супер Администратор"
  },
  "access_token": "eyJhbGc...",
  "refresh_token": "eyJhbGc..."
}
```

**Errors:**
- `400` - Validation error (missing fields, short username/password)
- `401` - Invalid credentials
- `403` - Account disabled
- `429` - Too many attempts (5 attempts per 15 minutes)
- `500` - Server error

---

### POST /api/auth/refresh
Обновление access token с помощью refresh token

**Request Body:**
```json
{
  "refresh_token": "eyJhbGc..."
}
```

**Response (200):**
```json
{
  "access_token": "eyJhbGc..."
}
```

**Errors:**
- `400` - Missing refresh token
- `401` - Invalid or expired refresh token
- `403` - Account disabled
- `500` - Server error

---

### POST /api/auth/logout
Выход из системы

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response (200):**
```json
{
  "message": "Logout successful"
}
```

**Errors:**
- `401` - Invalid or missing token
- `500` - Server error

---

### GET /api/auth/me
Получить информацию о текущем пользователе

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response (200):**
```json
{
  "user": {
    "id": 1,
    "username": "superadmin",
    "role": "superadmin",
    "school_id": null,
    "first_name": "Супер",
    "last_name": "Администратор",
    "email": "superadmin@zedly.uz",
    "created_at": "2024-01-01T00:00:00.000Z",
    "last_login": "2024-01-15T10:30:00.000Z"
  }
}
```

**Errors:**
- `401` - Invalid or expired token
- `404` - User not found
- `500` - Server error

---

## Использование токенов

### Access Token
- Используется для всех API запросов
- Срок действия: **15 минут**
- Передается в заголовке: `Authorization: Bearer <token>`

### Refresh Token
- Используется для обновления access token
- Срок действия: **7 дней**
- Возвращается только если `remember: true` при логине

### Обновление токена
Когда access token истекает, вы получите ошибку:
```json
{
  "error": "token_expired",
  "message": "Access token has expired. Please refresh your token."
}
```

В этом случае используйте refresh token для получения нового access token через `/api/auth/refresh`.

---

## Роли пользователей

### superadmin
- Полный доступ ко всей системе
- Может управлять школами
- Доступ к глобальной статистике
- `school_id` = `null`

### school_admin
- Управление своей школой
- Управление пользователями, классами, предметами
- Статистика по школе
- Привязан к `school_id`

### teacher
- Создание и управление тестами
- Просмотр результатов своих классов
- Аналитика по своим предметам
- Привязан к `school_id`

### student
- Прохождение тестов
- Просмотр своих результатов
- Профориентационный тест
- Привязан к `school_id`

---

## Rate Limiting

### Login endpoint
- **5 попыток** в течение **15 минут**
- После превышения - блокировка на 15 минут
- Счетчик сбрасывается после успешного входа

---

## Безопасность

### Аудит логи
Все действия пользователей логируются в таблицу `audit_logs`:
- Успешные входы
- Неудачные попытки входа
- Выход из системы
- Изменения данных

### Изоляция школ
Пользователи могут получать доступ только к данным своей школы (кроме SuperAdmin).

### Хеширование паролей
Пароли хешируются с использованием bcrypt (10 раундов).

---

## Примеры использования

### JavaScript (fetch)
```javascript
// Login
const login = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: 'superadmin',
    password: 'admin123',
    remember: true
  })
});

const { access_token, refresh_token } = await login.json();

// Store tokens
localStorage.setItem('access_token', access_token);
localStorage.setItem('refresh_token', refresh_token);

// Make authenticated request
const response = await fetch('/api/auth/me', {
  headers: {
    'Authorization': `Bearer ${access_token}`
  }
});

const user = await response.json();
```

### cURL
```bash
# Login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"superadmin","password":"admin123","remember":true}'

# Get user info
curl http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```
