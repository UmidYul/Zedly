# Consistency Audit (2026-02-27)

> Статус: **Resolved in docs v1.1**. Первичные расхождения устранены в связанных спецификациях.

## Что исправлено

1. **RBAC terminology alignment**
   - Добавлен канонический словарь permission-key и алиасы в `docs/09_permissions/permissions_matrix.md`.
   - В role-документы добавлена пометка, что каноника берётся из permission matrix.
   - Для директора явно зафиксировано платное ограничение на школьную аналитику.

2. **User flow vs acceptance (Telegram onboarding)**
   - Onboarding учителя приведён к жизненному циклу `pending_approval -> active` до выдачи JWT.
   - Сценарий «школа не найдена» синхронизирован: инструкция + поддержка, без обходного demo-пути.

3. **Backend tables vs canonical entities**
   - В `docs/08_data_model/entities.md` добавлена таблица `report_jobs`.

4. **API endpoints coverage in acceptance**
   - В acceptance criteria добавлена матрица покрытия endpoint’ов и доп. сценарии AC-17..AC-21 для auth/users/marketplace/reports status-download.

5. **KPI vs metrics dictionary**
   - В `docs/10_analytics/metrics_definition.md` добавлен нормализованный реестр продуктовых KPI с metric-key и формулами.

## Следующий шаг

Для поддержки консистентности при будущих изменениях: любые новые permission-key, endpoint’ы и KPI сначала добавлять в канонические реестры (`permissions_matrix.md`, `core_scenarios.md`, `metrics_definition.md`), затем в feature/role документы.
## 1) Роли (`docs/02_roles/*`) vs матрица (`docs/09_permissions/permissions_matrix.md`)

### Найденные несоответствия

1. **Несовпадение словаря permission-key между role-файлами и матрицей.**
   - В role-файлах используются ключи, которых нет в матрице (пример: `use_ai_generation`, `assign_test_to_own_class`, `view_school_aggregate_analytics`, `view_district_aggregate_analytics`).
   - В матрице используются другие ключи (пример: `create_test_ai_generation`, `assign_test_to_class`, `view_school_analytics`, `view_district_analytics`).

2. **Конфликт по условиям доступа директора к школьной аналитике.**
   - В матрице `view_school_analytics` и `view_school_teacher_activity` отмечены как `🔒` (доступ только на платном плане).
   - В `docs/02_roles/director.md` соответствующие возможности перечислены как безусловно доступные в секции «Что директор МОЖЕТ делать», без явного платного ограничения на сами permission-key.

3. **Несовпадение role-name для РОНО.**
   - В матрице роль называется `inspector`.
   - В acceptance критериях и API/flow местах используется `district_admin`.
   - В role-файле: «РОНО-инспектор» с собственным набором ключей (`view_district_aggregate_analytics`, `generate_district_report`), не совпадающим с матрицей.

---

## 2) User flows (`docs/04_user_flows/*`) vs acceptance criteria (`docs/14_acceptance_criteria/core_scenarios.md`)

### Найденные несоответствия

1. **Новый учитель через Telegram: статус аккаунта.**
   - Acceptance (сценарий 7): аккаунт создаётся как `pending_approval`, затем активируется после подтверждения администратором.
   - User flow onboarding: после Telegram OAuth сразу выдаются JWT/refresh и переход на следующий шаг, без явного `pending_approval`.

2. **Если школа не найдена.**
   - Acceptance (сценарий 7): пользователь получает инструкцию по добавлению школы и контакт поддержки.
   - User flow onboarding: предлагается «сообщить директору» или «продолжить без школы (демо-режим)».

---

## 3) Таблицы из backend-спеков (`docs/05_backend/*`) vs `docs/08_data_model/entities.md`

### Найденные несоответствия

1. **Отсутствует таблица `report_jobs` в entities.md.**
   - `docs/05_backend/analytics_engine_spec.md` явно задаёт `CREATE TABLE report_jobs`.
   - В `docs/08_data_model/entities.md` секции/описания таблицы `report_jobs` нет.

---

## 4) API endpoints (`docs/07_api/*`) vs acceptance criteria (`docs/14_acceptance_criteria/core_scenarios.md`)

### Найденные несоответствия

1. **Acceptance criteria покрывают только часть API-поверхности.**
   - Покрыты в основном сценарии создания/прохождения тестов, Telegram onboarding, отчётов РОНО.
   - **Не покрыты отдельными acceptance-сценариями** (как минимум):
     - `POST /auth/refresh`
     - `POST /auth/logout`
     - `GET /users/me`
     - `PATCH /users/me`
     - `GET /schools/{school_id}/users`
     - Полный блок marketplace endpoint’ов (`GET /marketplace/tests`, `GET /marketplace/tests/{test_id}`, `POST /marketplace/tests/{test_id}/publish|rate|copy`)
     - `GET /reports/{report_id}/status`
     - `GET /reports/{report_id}/download`

2. **Отсутствует явная трассировка «endpoint → acceptance ID».**
   - В текущем наборе AC нет таблицы покрытия API, поэтому невозможно подтвердить 100% полноту покрытия по endpoint’ам.

---

## 5) KPI в `docs/03_features/*` vs метрики в `docs/10_analytics/metrics_definition.md`

### Найденные несоответствия

1. **KPI в feature-файлах во многом не нормализованы под metric-key из metrics_definition.**
   - Примеры KPI из features: «время создания теста», «retention использования AI», «acceptance rate челленджа», «% привязки Telegram», «время доставки уведомления».
   - В `metrics_definition.md` эти KPI не заведены как формальные метрики с единым key/formula (как `average_score`, `completion_rate`, `coverage_rate` и т.д.).

2. **Смешение продуктовых KPI и аналитических метрик без единого словаря.**
   - В features KPI часто заданы в бизнес-терминах.
   - В metrics_definition описан отдельный набор вычисляемых метрик; прямой 1:1 маппинг отсутствует.

---

## Короткий итог

Основные системные проблемы консистентности:
- Нет единого канонического словаря permission-key (RBAC в role docs и permission matrix расходится по именованию и частично по условиям доступа).
- User-flow и acceptance по Telegram onboarding расходятся в жизненном цикле пользователя.
- Data model отстаёт от backend-спеков минимум на `report_jobs`.
- Acceptance criteria не покрывают весь API-контракт.
- KPI в feature-доках не синхронизированы с официальным словарём метрик.
