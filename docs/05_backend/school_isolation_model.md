# School Isolation Model — Backend Specification

> **Проект:** Zedly — онлайн-тестирование и аналитика для школ Узбекистана
> **Модуль:** `05_backend/school_isolation_model.md`
> **Версия:** 1.0 | **Дата:** 2026-02-27 | **Статус:** Production Blueprint

---

## Критическая важность

Мультитенантная архитектура Zedly хранит данные сотен школ в одной базе данных. Каждая школа — это юридически независимое учреждение с персональными данными несовершеннолетних учеников.

**Последствия утечки данных между школами:**
- Юридическая ответственность по Закону Республики Узбекистан «О персональных данных» (штрафы + уголовная ответственность)
- Немедленная потеря контрактов с РОНО и Министерством просвещения
- Публичный скандал, критичный для EdTech-продукта с детской аудиторией
- Невозможность выиграть государственные тендеры

**Принцип:** изоляция — это не фича, это инвариант системы. Ни одно изменение кода не может его нарушить.

---

## Архитектура защиты: три уровня

Изоляция реализована на **трёх независимых уровнях**. Каждый уровень защищает от отдельного класса уязвимостей. Проникновение через все три одновременно — практически невозможно.

```
HTTP Request
     │
     ▼
┌─────────────────────────────────────────────────┐
│  УРОВЕНЬ 1: Application Middleware               │
│  JWT validation + school_id check               │
│  Проверяет: токен валиден, роль разрешена,       │
│  school_id из JWT == school_id ресурса           │
│  При нарушении: 403 + audit_log                  │
└──────────────────────┬──────────────────────────┘
                       │ (если прошло)
                       ▼
┌─────────────────────────────────────────────────┐
│  УРОВЕНЬ 2: PostgreSQL Row-Level Security        │
│  Policy на каждой таблице с персональными        │
│  данными. Работает ДАЖЕ если middleware обойдён. │
│  Без school_id в контексте — 0 строк вернётся.  │
└──────────────────────┬──────────────────────────┘
                       │ (если прошло)
                       ▼
┌─────────────────────────────────────────────────┐
│  УРОВЕНЬ 3: File Storage Isolation               │
│  Pre-signed URLs с TTL 1 час.                    │
│  Структура путей включает school_id.             │
│  Невозможно угадать или перебрать URL.           │
└─────────────────────────────────────────────────┘
```

---

## Уровень 1: Application Middleware

### Структура JWT payload

```json
{
  "sub": "user_uuid",
  "school_id": "school_uuid",
  "role": "teacher",
  "iat": 1740652800,
  "exp": 1740653700
}
```

`school_id` вшивается в токен при логине и **не может быть изменён** без повторной аутентификации. Даже если пользователь передаст поддельный `school_id` в теле запроса — middleware берёт `school_id` исключительно из JWT.

### Алгоритм проверки в middleware

```typescript
// auth.middleware.ts — псевдокод
async function schoolIsolationMiddleware(req, res, next) {
  // 1. Извлечь и верифицировать JWT
  const payload = verifyJwt(req.headers.authorization);
  if (!payload) return res.status(401).json({ error: 'Unauthorized' });

  // 2. Сохранить контекст в req
  req.user = {
    id:        payload.sub,
    school_id: payload.school_id,
    role:      payload.role,
  };

  // 3. Установить school_id контекст для PostgreSQL RLS
  await db.execute(`SET LOCAL app.school_id = '${payload.school_id}'`);

  // 4. Если запрос обращается к конкретному ресурсу — проверить владение
  const resourceSchoolId = await resolveResourceSchoolId(req);
  if (resourceSchoolId && resourceSchoolId !== payload.school_id) {
    await auditLog.record({
      event:            'cross_school_access_attempt',
      user_id:          payload.sub,
      user_school_id:   payload.school_id,
      target_school_id: resourceSchoolId,
      endpoint:         req.path,
      method:           req.method,
      ip:               req.ip,
      timestamp:        new Date(),
    });
    // ВАЖНО: 404, не 403 — не раскрываем факт существования чужого ресурса
    return res.status(404).json({ error: 'Not found' });
  }

  next();
}
```

**Примечание о 404 vs 403:**
Возврат `403 Forbidden` сообщает атакующему, что ресурс существует, просто у него нет доступа. `404 Not Found` не раскрывает никакой информации. Используем `404` для всех cross-school попыток доступа к конкретным ресурсам (тесты, ученики, классы). Исключение: попытка доступа к административной панели без нужной роли — там `403` уместен, так как факт существования панели не секрет.

### `resolveResourceSchoolId` — логика разрешения

```typescript
async function resolveResourceSchoolId(req): Promise<string | null> {
  // Паттерн URL → таблица → поле school_id
  const patterns = [
    { regex: /^\/api\/v1\/tests\/([^\/]+)/,    table: 'tests',        idParam: 1 },
    { regex: /^\/api\/v1\/sessions\/([^\/]+)/, table: 'test_sessions', idParam: 1 },
    { regex: /^\/api\/v1\/questions\/([^\/]+)/,table: 'questions',     idParam: 1 },
    { regex: /^\/api\/v1\/users\/([^\/]+)/,    table: 'users',         idParam: 1 },
    { regex: /^\/api\/v1\/classes\/([^\/]+)/,  table: 'classes',       idParam: 1 },
    { regex: /^\/api\/v1\/reports\/([^\/]+)/,  table: 'report_jobs',   idParam: 1 },
  ];

  for (const pattern of patterns) {
    const match = req.path.match(pattern.regex);
    if (match) {
      const resourceId = match[pattern.idParam];
      // Кэшировать в Redis на 60 сек: resource:{table}:{id} → school_id
      const cached = await redis.get(`resource:${pattern.table}:${resourceId}`);
      if (cached) return cached;

      const row = await db.queryOne(
        `SELECT school_id FROM ${pattern.table} WHERE id = $1`,
        [resourceId]
      );
      if (!row) return null; // Ресурс не существует — вернём 404 штатно
      await redis.setex(`resource:${pattern.table}:${resourceId}`, 60, row.school_id);
      return row.school_id;
    }
  }

  return null; // Ресурс не требует проверки владения (напр. /api/v1/auth/*)
}
```

---

## Уровень 2: PostgreSQL Row-Level Security

RLS — последняя линия обороны. Работает даже если:
- Middleware содержит баг
- Разработчик написал прямой SQL-запрос без проверки
- Внешняя библиотека обходит middleware
- SQL-инъекция изменила контекст запроса

### Установка контекста перед каждым запросом

```sql
-- Устанавливается в начале каждой транзакции через middleware
-- SET LOCAL — действует только в рамках текущей транзакции
SET LOCAL app.school_id = 'school_uuid_here';
SET LOCAL app.user_id   = 'user_uuid_here';
SET LOCAL app.role      = 'teacher';
```

**Важно:** `SET LOCAL` (не `SET`) — значение автоматически сбрасывается в конце транзакции, предотвращая утечку контекста между запросами в connection pool.

### RLS политики по таблицам

```sql
-- ============================================================
-- ВКЛЮЧЕНИЕ RLS (выполняется один раз при создании таблицы)
-- ============================================================
ALTER TABLE tests           ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_sessions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE answers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_jobs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE certificates    ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs      ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- ПОЛИТИКИ SELECT (чтение только своей школы)
-- ============================================================
CREATE POLICY tests_select_isolation ON tests
  FOR SELECT
  USING (school_id = current_setting('app.school_id', true)::uuid);

CREATE POLICY questions_select_isolation ON questions
  FOR SELECT
  USING (school_id = current_setting('app.school_id', true)::uuid);

CREATE POLICY sessions_select_isolation ON test_sessions
  FOR SELECT
  USING (school_id = current_setting('app.school_id', true)::uuid);

CREATE POLICY answers_select_isolation ON answers
  FOR SELECT
  USING (school_id = current_setting('app.school_id', true)::uuid);

CREATE POLICY users_select_isolation ON users
  FOR SELECT
  USING (school_id = current_setting('app.school_id', true)::uuid);

CREATE POLICY classes_select_isolation ON classes
  FOR SELECT
  USING (school_id = current_setting('app.school_id', true)::uuid);

CREATE POLICY reports_select_isolation ON report_jobs
  FOR SELECT
  USING (school_id = current_setting('app.school_id', true)::uuid
         OR school_id IS NULL);  -- district/national отчёты: school_id = NULL

CREATE POLICY snapshots_select_isolation ON analytics_snapshots
  FOR SELECT
  USING (school_id = current_setting('app.school_id', true)::uuid
         OR school_id IS NULL);  -- district/national снимки: school_id = NULL

CREATE POLICY certificates_select_isolation ON certificates
  FOR SELECT
  USING (school_id = current_setting('app.school_id', true)::uuid);

-- audit_logs: только свои логи (не другой школы)
CREATE POLICY audit_logs_select_isolation ON audit_logs
  FOR SELECT
  USING (school_id = current_setting('app.school_id', true)::uuid);

-- ============================================================
-- ПОЛИТИКИ INSERT (вшивание school_id автоматически)
-- ============================================================
CREATE POLICY tests_insert_isolation ON tests
  FOR INSERT
  WITH CHECK (school_id = current_setting('app.school_id', true)::uuid);

CREATE POLICY questions_insert_isolation ON questions
  FOR INSERT
  WITH CHECK (school_id = current_setting('app.school_id', true)::uuid);

CREATE POLICY sessions_insert_isolation ON test_sessions
  FOR INSERT
  WITH CHECK (school_id = current_setting('app.school_id', true)::uuid);

CREATE POLICY answers_insert_isolation ON answers
  FOR INSERT
  WITH CHECK (school_id = current_setting('app.school_id', true)::uuid);

-- ============================================================
-- ПОЛИТИКИ UPDATE (только своей школы)
-- ============================================================
CREATE POLICY tests_update_isolation ON tests
  FOR UPDATE
  USING (school_id = current_setting('app.school_id', true)::uuid)
  WITH CHECK (school_id = current_setting('app.school_id', true)::uuid);

-- ============================================================
-- ИСКЛЮЧЕНИЯ: сервисные роли обходят RLS
-- ============================================================
-- analytics_worker читает данные всех школ для агрегации
CREATE ROLE analytics_worker_role;
ALTER TABLE answers         FORCE ROW LEVEL SECURITY; -- даже owner подчиняется
ALTER TABLE test_sessions   FORCE ROW LEVEL SECURITY;

-- Отдельная policy для analytics_worker: полный доступ на чтение
CREATE POLICY analytics_worker_read_all ON answers
  FOR SELECT
  TO analytics_worker_role
  USING (true);  -- без ограничений по school_id

CREATE POLICY analytics_worker_read_sessions ON test_sessions
  FOR SELECT
  TO analytics_worker_role
  USING (true);

-- report_generator аналогично
CREATE ROLE report_generator_role;
CREATE POLICY report_generator_read_all ON analytics_snapshots
  FOR SELECT
  TO report_generator_role
  USING (true);
```

### Проверка: что произойдёт без контекста

```sql
-- Если middleware не установил контекст, current_setting вернёт NULL или ошибку
-- Параметр true в current_setting('app.school_id', true) означает:
-- "не бросать исключение если переменная не установлена, вернуть NULL"
-- NULL::uuid != любой school_id → политика вернёт 0 строк
-- Это намеренное защитное поведение: лучше пустой ответ, чем утечка

-- Тест:
SET LOCAL app.school_id = '';  -- пустая строка → NULL cast → 0 строк
SELECT COUNT(*) FROM tests;   -- вернёт 0, не ошибку
```

---

## Уровень 3: File Storage Isolation

### Структура путей в Cloudflare R2

```
/schools/{school_id}/
  tests/
    {test_id}/
      images/
        {question_id}_{uuid}.jpg
  reports/
    {year}/
      {month}/
        {report_id}.pdf
        {report_id}.xlsx
  certificates/
    {student_id}/
      {certificate_id}.pdf
  exports/
    {export_id}.xlsx
```

Каждый файл физически изолирован по пути, включающему `school_id`. Угадать путь без знания `school_id` и `test_id` (оба UUID v4) практически невозможно (~2^122 комбинаций).

### Pre-signed URLs

```typescript
// Генерация pre-signed URL для изображения вопроса
async function getQuestionImageUrl(questionId: string, schoolId: string): Promise<string> {
  // 1. Проверить что question.school_id == schoolId (через RLS или явно)
  const question = await db.queryOne(
    'SELECT image_path FROM questions WHERE id = $1 AND school_id = $2',
    [questionId, schoolId]
  );
  if (!question?.image_path) throw new NotFoundError();

  // 2. Генерация pre-signed URL через Cloudflare R2 SDK
  const url = await r2.getSignedUrl('getObject', {
    Bucket: process.env.R2_BUCKET_NAME,
    Key:    question.image_path,  // /schools/{school_id}/tests/.../image.jpg
    Expires: 3600,  // TTL: 1 час
  });

  return url;
}
```

**Почему TTL 1 час, а не больше:**
- Если учитель удалил вопрос — ссылка перестаёт работать максимум через 1 час
- Если пользователь случайно поделился ссылкой — ущерб ограничен 1 часом
- Pre-signed URL содержит подпись — невозможно изменить `school_id` внутри URL

### Прямой доступ к бакету: запрещён

```
# Cloudflare R2 настройки:
# - Public access: DISABLED
# - CORS policy: только домены Zedly
# - Все запросы через Cloudflare Workers (прокси с валидацией)
```

---

## Матрица: что проверяется при каждом запросе

| Проверка | Где | Что происходит при нарушении |
|---|---|---|
| JWT подпись и TTL | Middleware (шаг 1) | `401 Unauthorized` |
| `school_id` из JWT совпадает с `school_id` ресурса | Middleware (шаг 4) | `404 Not Found` + `audit_log` |
| Роль пользователя разрешает действие | Middleware (шаг 5, через permissions matrix) | `403 Forbidden` |
| RLS policy на таблице | PostgreSQL | 0 строк в ответе (тихая защита) |
| Pre-signed URL подпись | Cloudflare R2 | `403` от R2 |
| Pre-signed URL TTL | Cloudflare R2 | `403` от R2 |

---

## Audit Log

### Таблица `audit_logs`

```sql
CREATE TABLE audit_logs (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type        varchar(100)  NOT NULL,
  -- Кто
  user_id           uuid          NOT NULL,
  user_role         varchar(50)   NOT NULL,
  user_school_id    uuid          NOT NULL,
  -- Что
  resource_type     varchar(50)   NULL,   -- 'test', 'session', 'user', 'report', ...
  resource_id       uuid          NULL,
  target_school_id  uuid          NULL,   -- school_id ресурса (при cross-school попытке)
  -- Контекст
  endpoint          varchar(255)  NOT NULL,
  method            varchar(10)   NOT NULL,
  ip_address        inet          NOT NULL,
  user_agent        text          NULL,
  request_id        uuid          NOT NULL,
  -- Результат
  success           boolean       NOT NULL,
  error_code        varchar(10)   NULL,   -- '404', '403', '401'
  -- Время
  created_at        timestamptz   NOT NULL DEFAULT NOW()
);

-- Партиционирование по месяцам (логи растут быстро)
CREATE TABLE audit_logs_2026_02 PARTITION OF audit_logs
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

-- Индексы для расследования инцидентов
CREATE INDEX idx_audit_user_time     ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_school_time   ON audit_logs(user_school_id, created_at DESC);
CREATE INDEX idx_audit_event_time    ON audit_logs(event_type, created_at DESC);
CREATE INDEX idx_audit_cross_school  ON audit_logs(target_school_id, created_at DESC)
  WHERE target_school_id IS NOT NULL;  -- Только cross-school события
```

### Какие события логируются

| `event_type` | Когда | Приоритет |
|---|---|---|
| `cross_school_access_attempt` | Попытка доступа к ресурсу чужой школы | 🔴 CRITICAL |
| `invalid_jwt` | Запрос с невалидным или просроченным токеном | 🟡 WARNING |
| `permission_denied` | Роль пользователя не имеет прав на действие | 🟡 WARNING |
| `bulk_export_initiated` | Учитель/директор запросил массовый экспорт данных | 🟡 WARNING |
| `admin_access` | Вход в административную панель | 🟡 WARNING |
| `user_data_accessed` | Просмотр персональных данных ученика (имя + результаты) | 🟢 INFO |
| `report_downloaded` | Скачивание PDF/Excel отчёта | 🟢 INFO |
| `login_success` | Успешный вход | 🟢 INFO |
| `login_failed` | Неуспешный вход (неверный пароль) | 🟡 WARNING (rate-limit триггер) |

### Пример записи cross-school события

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "event_type": "cross_school_access_attempt",
  "user_id": "user-uuid",
  "user_role": "teacher",
  "user_school_id": "school-A-uuid",
  "resource_type": "test",
  "resource_id": "test-from-school-B-uuid",
  "target_school_id": "school-B-uuid",
  "endpoint": "/api/v1/tests/test-from-school-B-uuid",
  "method": "GET",
  "ip_address": "95.142.15.33",
  "user_agent": "Mozilla/5.0 ...",
  "request_id": "req-uuid",
  "success": false,
  "error_code": "404",
  "created_at": "2026-02-27T09:14:22.315Z"
}
```

### Алерты на критические события

```typescript
// alert.service.ts
async function onAuditEvent(event: AuditLog) {
  if (event.event_type === 'cross_school_access_attempt') {
    // Немедленный алерт команде в Telegram
    await telegram.sendMessage(SECURITY_CHAT_ID,
      `🔴 Cross-school access attempt!\n` +
      `User: ${event.user_id} (${event.user_role})\n` +
      `From school: ${event.user_school_id}\n` +
      `Attempted to access: ${event.resource_type} in ${event.target_school_id}\n` +
      `IP: ${event.ip_address}\n` +
      `Endpoint: ${event.method} ${event.endpoint}\n` +
      `Time: ${event.created_at}`
    );
  }

  // Rate-based алерт: > 10 cross-school попыток за 5 минут от одного IP
  const recentAttempts = await redis.incr(`sec:cross_school:${event.ip_address}`);
  await redis.expire(`sec:cross_school:${event.ip_address}`, 300);
  if (recentAttempts > 10) {
    await blockIP(event.ip_address, '24h');
    await telegram.sendMessage(SECURITY_CHAT_ID,
      `🚨 IP blocked: ${event.ip_address} — ${recentAttempts} cross-school attempts in 5 min`
    );
  }
}
```

### Хранение и ротация логов

- Retention в БД: **12 месяцев** (требование законодательства)
- Архив в Cloudflare R2 (cold storage): **5 лет** (gpg-шифрование)
- Партиционирование: по месяцам, старые партиции перемещаются в R2 автоматически
- Логи нельзя удалить вручную — только через автоматическую ротацию

---

## Роли и scope изоляции

Некоторые роли по природе своей видят данные нескольких школ. Для них изоляция работает иначе:

### РОНО-инспектор (`role = roono_inspector`)

```
- JWT содержит: district_id (вместо school_id)
- Middleware устанавливает: SET LOCAL app.district_id = '...'
- RLS policy для РОНО:

CREATE POLICY snapshots_roono_access ON analytics_snapshots
  FOR SELECT
  TO roono_inspector_role
  USING (
    school_id IS NULL  -- district/national снимки
    OR school_id IN (
      SELECT id FROM schools
      WHERE district_id = current_setting('app.district_id', true)::uuid
    )
  );

- РОНО видит ТОЛЬКО школы своего района
- РОНО НЕ видит персональных данных учеников (только агрегаты)
- РОНО НЕ может получить сырые ответы из таблицы answers
```

### Министерство (`role = ministry`)

```
- JWT содержит: role = 'ministry', без school_id/district_id
- Видит только national-level analytics_snapshots (entity_type = 'national')
- Физически не может запросить данные конкретной школы через API
- Все запросы идут через специальный endpoint /api/v1/analytics/national/*
  который явно возвращает только агрегированные данные
```

### Analytics Worker (сервисный аккаунт)

```
- Не использует JWT — аутентифицируется через отдельный service token
- Имеет роль analytics_worker_role в PostgreSQL
- RLS обходится ТОЛЬКО для таблиц answers и test_sessions (чтение)
- Для записи в analytics_snapshots — подчиняется стандартным политикам
- IP-whitelist: только внутренняя сеть (не доступен извне)
```

---

## Тестирование изоляции

### Обязательный тест-сьют: `isolation.spec.ts`

Запускается при каждом CI/CD деплое. Если хотя бы один тест упал — деплой блокируется.

```typescript
describe('School Isolation — Non-regression suite', () => {

  let schoolA: TestSchool, schoolB: TestSchool;
  let teacherA: AuthToken, teacherB: AuthToken;
  let testFromA: Test, studentFromB: User;

  beforeAll(async () => {
    schoolA = await createTestSchool();
    schoolB = await createTestSchool();
    teacherA = await loginAs({ school: schoolA, role: 'teacher' });
    teacherB = await loginAs({ school: schoolB, role: 'teacher' });
    testFromA = await createTest({ school: schoolA });
    studentFromB = await createStudent({ school: schoolB });
  });

  // ── REST API ──────────────────────────────────────────────

  test('Teacher A cannot GET test from school B', async () => {
    const res = await api.get(`/tests/${testFromA.id}`).auth(teacherB.token);
    expect(res.status).toBe(404);  // не 403
  });

  test('Teacher A cannot list students from school B', async () => {
    const res = await api.get(`/users?school_id=${schoolB.id}`).auth(teacherA.token);
    expect(res.status).toBe(403);  // явный запрос чужой школы — сразу 403
    expect(res.body.data).toBeUndefined();
  });

  test('Teacher A cannot start session for test in school B', async () => {
    // testFromA принадлежит школе A, teacherB — школа B
    // Создаём тест в школе B и проверяем что teacherA не может к нему обратиться
    const testFromB = await createTest({ school: schoolB });
    const res = await api.post(`/tests/${testFromB.id}/sessions`).auth(teacherA.token);
    expect(res.status).toBe(404);
  });

  test('Teacher A cannot access analytics of school B', async () => {
    const res = await api
      .get('/analytics/director/dashboard')
      .query({ school_id: schoolB.id })
      .auth(teacherA.token);
    expect(res.status).toBe(403);
  });

  // ── DIRECT DB ACCESS (обход middleware) ───────────────────

  test('RLS blocks cross-school query even without middleware context', async () => {
    // Прямой SQL без установки app.school_id
    const rows = await db.query(
      'SELECT * FROM tests WHERE id = $1',
      [testFromA.id]
    );
    // Без контекста RLS вернёт 0 строк
    expect(rows).toHaveLength(0);
  });

  test('RLS blocks cross-school query with wrong school_id in context', async () => {
    await db.execute(`SET LOCAL app.school_id = '${schoolB.id}'`);
    const rows = await db.query('SELECT * FROM tests WHERE id = $1', [testFromA.id]);
    expect(rows).toHaveLength(0);
  });

  // ── AUDIT LOG ─────────────────────────────────────────────

  test('Cross-school attempt is recorded in audit_log', async () => {
    await api.get(`/tests/${testFromA.id}`).auth(teacherB.token);

    const log = await db.queryOne(
      `SELECT * FROM audit_logs
       WHERE user_id = $1 AND event_type = 'cross_school_access_attempt'
       ORDER BY created_at DESC LIMIT 1`,
      [teacherB.userId]
    );
    expect(log).toBeDefined();
    expect(log.user_school_id).toBe(schoolB.id);
    expect(log.target_school_id).toBe(schoolA.id);
    expect(log.error_code).toBe('404');
  });

  // ── FILE STORAGE ──────────────────────────────────────────

  test('Pre-signed URL from school A is not accessible for school B user', async () => {
    const urlResponse = await api
      .get(`/questions/${testFromA.questions[0].id}/image-url`)
      .auth(teacherA.token);
    const presignedUrl = urlResponse.body.url;

    // Попытка использовать URL от имени teacherB — R2 отклонит по подписи
    // (в тесте мокируем R2 validation)
    const fileResponse = await fetch(presignedUrl, {
      headers: { 'X-School-Id': schoolB.id }
    });
    // Pre-signed URL не содержит school_id в заголовках — подпись уже содержит owner
    // Но TTL и подпись гарантируют что URL нельзя переиспользовать
    expect(fileResponse.status).not.toBe(200); // должен быть 403 или 403 от R2
  });

  // ── РОНО INSPECTOR ────────────────────────────────────────

  test('ROONO inspector sees only schools of own district', async () => {
    const districtA = await createDistrict();
    const districtB = await createDistrict();
    const schoolInDistrictA = await createSchool({ district: districtA });
    const schoolInDistrictB = await createSchool({ district: districtB });
    const roono = await loginAs({ district: districtA, role: 'roono_inspector' });

    const res = await api.get('/analytics/roono/dashboard').auth(roono.token);
    const schoolIds = res.body.schools_ranking.map(s => s.school_id);

    expect(schoolIds).toContain(schoolInDistrictA.id);
    expect(schoolIds).not.toContain(schoolInDistrictB.id);
  });

  afterAll(async () => {
    await cleanup([schoolA, schoolB]);
  });
});
```

### Penetration test checklist (перед каждым major релизом)

```
□ IDOR (Insecure Direct Object Reference):
  - Перебор UUID тестов другой школы в URL
  - Подмена school_id в query params
  - Подмена school_id в request body

□ JWT manipulation:
  - Изменение school_id в payload без пересоздания подписи
  - Использование токена истёкшего пользователя
  - Токен пользователя из удалённой школы

□ Mass assignment:
  - POST /tests с явным school_id чужой школы в теле
  - PATCH /users/{id} с изменением school_id

□ SQL Injection:
  - Ввод специальных символов в поля, используемые в запросах
  - Попытка escape из параметризованного запроса

□ GraphQL/REST parameter pollution:
  - Дублирование параметров school_id с разными значениями

□ RLS bypass:
  - Прямое подключение к PostgreSQL без app.school_id
  - Сброс контекста внутри транзакции

□ File path traversal:
  - ../../../schools/other_school_uuid/ в путях к файлам
```

---

## Граничные случаи

**Пользователь с ролью в двух школах (учитель переходит в другую школу):**
- В системе: один `users.school_id` — всегда одна активная школа
- При переводе: `school_id` обновляется, старый JWT инвалидируется в Redis
- Исторические данные (результаты учеников из старой школы) остаются привязанными к старой школе
- Пользователь после обновления не может видеть данные старой школы

**Учитель назначен в несколько классов разных школ (не предусмотрено архитектурой):**
- Не поддерживается в MVP: один пользователь = одна школа
- Если понадобится в будущем: отдельная таблица `user_school_assignments` с отдельным JWT-flow

**Тест из Marketplace (виден всем школам):**
- Marketplace тесты хранятся с `school_id = NULL` и отдельным флагом `is_marketplace = true`
- RLS policy для marketplace:
  ```sql
  CREATE POLICY tests_marketplace_read ON tests
    FOR SELECT
    USING (
      school_id = current_setting('app.school_id', true)::uuid
      OR (is_marketplace = true AND school_id IS NULL)
    );
  ```
- Учитель может видеть marketplace-тест, но не может его редактировать (проверка school_id при UPDATE)
- При копировании теста из marketplace: создаётся новая запись с `school_id` учителя

**Межшкольный челлендж (две школы видят агрегированные результаты друг друга):**
- Персональные данные учеников НЕ передаются другой школе
- Передаётся только: `school_name`, `avg_score`, `rank`
- Отдельная таблица `challenge_results` со своей RLS — видна обеим школам-участникам
  ```sql
  CREATE POLICY challenge_results_participants ON challenge_results
    FOR SELECT
    USING (school_a_id = current_setting('app.school_id', true)::uuid
           OR school_b_id = current_setting('app.school_id', true)::uuid);
  ```

**Сертификат ученика верифицируется работодателем (без авторизации):**
- Публичный endpoint: `GET /api/v1/public/certificates/{qr_code_token}`
- Возвращает ТОЛЬКО: имя ученика, название теста, дата, балл, школа
- Не требует авторизации, не проверяет school_id
- QR-code token — одноразовый UUID, не раскрывает структуру БД
- Rate limit: 30 запросов/мин на IP (защита от сканирования)

---

## Acceptance Criteria

### AC-1: Учитель не может прочитать тест другой школы

```
Given: teacherA (school_A) и testB (school_B) существуют в системе
When: GET /api/v1/tests/{testB.id} с JWT teacherA
Then:
  - Ответ: 404 Not Found
  - Тело не содержит данных теста (ни частичных)
  - audit_log содержит запись event_type='cross_school_access_attempt'
  - RLS в PostgreSQL не вернул строку даже на уровне БД
```

### AC-2: Middleware не позволяет подменить school_id в теле запроса

```
Given: teacherA (school_A) авторизован
When: POST /api/v1/tests с body: { title: "...", school_id: "school_B_uuid" }
Then:
  - Тест создаётся с school_id из JWT (school_A), не из тела запроса
  - Ответ: 201 с { school_id: school_A_uuid }
  - school_B_uuid из тела игнорируется
```

### AC-3: RLS работает без middleware контекста

```
Given: прямое подключение к PostgreSQL от имени app_user (без SET LOCAL app.school_id)
When: SELECT * FROM tests WHERE id = '{test_from_school_A}'
Then:
  - Результат: 0 строк (RLS возвращает пустоту, не ошибку)
  - Поведение идентично для tables: questions, test_sessions, answers, users
```

### AC-4: РОНО-инспектор видит только школы своего района

```
Given: roono_inspector_X (district_X), schools: school_X1, school_X2 (district_X), school_Y1 (district_Y)
When: GET /api/v1/analytics/roono/dashboard с JWT roono_inspector_X
Then:
  - Ответ содержит данные school_X1 и school_X2
  - Ответ НЕ содержит данных school_Y1
  - school_Y1 отсутствует в списке schools_ranking
```

### AC-5: Cross-school попытка генерирует алерт

```
Given: один IP адрес совершает 11 cross-school access attempts в течение 5 минут
When: 11-я попытка обрабатывается
Then:
  - IP добавляется в blocklist на 24 часа
  - Telegram-алерт отправлен в security chat команды
  - 12-я попытка с того же IP: 429 Too Many Requests (или 403 blocked)
  - Все 11 попыток записаны в audit_log
```

### AC-6: Pre-signed URL недоступен после TTL

```
Given: teacherA получил pre-signed URL для изображения вопроса (TTL 1 час)
When: teacherA пытается использовать URL через 61 минуту
Then:
  - Cloudflare R2 возвращает 403 (подпись истекла)
  - teacherA должен запросить новый URL через API
  - Другой пользователь с тем же URL также получает 403
```

### AC-7: Marketplace тест виден всем, но редактируется только владельцем

```
Given: marketplace тест опубликован (school_id = NULL, is_marketplace = true)
When 1: GET /api/v1/tests/marketplace — от teacherA (school_A)
Then 1: тест присутствует в результатах (RLS разрешает)

When 2: PATCH /api/v1/tests/{marketplace_test_id} от teacherA
Then 2: 404 Not Found (учитель не является владельцем — school_id не совпадает)
```

### AC-8: Сертификат верифицируется без раскрытия структуры данных

```
Given: сертификат с qr_code_token = 'abc123' существует
When: GET /api/v1/public/certificates/abc123 (без авторизации)
Then:
  - Ответ 200: { student_name, test_title, issued_at, score_percent, school_name }
  - Ответ НЕ содержит: student_id, school_id, test_id, session_id (UUID не раскрываются)
  - 31-й запрос с одного IP в течение минуты: 429 Too Many Requests
```

### AC-9: Межшкольный челлендж не раскрывает персональные данные

```
Given: школа A и школа B участвуют в челлендже
When: teacherA запрашивает результаты челленджа
Then:
  - Ответ содержит: school_B.name, school_B.avg_score, school_B.rank
  - Ответ НЕ содержит: список учеников school_B, индивидуальные баллы учеников school_B
  - teacherB видит аналогичную агрегированную информацию о school_A
```

### AC-10: Isolation regression suite блокирует деплой при нарушении

```
Given: разработчик добавил код, нарушающий изоляцию (например, запрос без RLS контекста)
When: CI/CD pipeline запускает isolation.spec.ts
Then:
  - Хотя бы один тест из suite завершается с ошибкой
  - Деплой в production блокируется
  - Pull Request не может быть смержен до исправления
```

---

## Зависимости на другие модули

| Модуль | Тип | Детали |
|---|---|---|
| `auth_spec.md` | Входящая | JWT структура, school_id в payload, механизм инвалидации |
| `test_engine_spec.md` | Разделяемая | RLS на `tests`, `questions`, `test_sessions`, `answers` |
| `analytics_engine_spec.md` | Разделяемая | RLS на `analytics_snapshots`, `report_jobs`; исключения для `analytics_worker_role` |
| `09_permissions/permissions_matrix.md` | Разделяемая | Роли и scope изоляции для РОНО, Министерства |
| `11_security/security_policy.md` | Разделяемая | Шифрование, retention логов, pentest |
| `08_data_model/entities.md` | Входящая | Все таблицы с `school_id`, партиционирование `audit_logs` |

---

## Потенциальные несоответствия — проверить при следующем батче

1. `audit_logs` партиционирован по месяцам — структура должна совпадать с `08_data_model/entities.md`
2. `challenge_results` — новая таблица, описана здесь впервые; добавить в `08_data_model/entities.md` и `03_features/school_challenge.md`
3. Marketplace тесты с `school_id = NULL` — специальная RLS policy должна быть продублирована в `03_features/ai_test_generation.md` (там описан marketplace)
4. `analytics_worker_role` и `report_generator_role` — PostgreSQL роли для обхода RLS; добавить в `09_permissions/permissions_matrix.md` как сервисные аккаунты
5. Сертификат: публичный endpoint без авторизации — добавить в `07_api/certificates_api.md` с документацией rate-limit и структуры ответа
