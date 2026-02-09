# School Testing Platform Specification

## Product scope and success criteria

### Goal

Build a secure, multi-tenant (multi-school) web platform for schools in entity["country","Uzbekistan","central asia country"] where:

- Students take auto-graded tests on mobile browser and desktop.
- Teachers and SchoolAdmins have full analytics (by test/class/student/topic/question) and can export XLSX reports.
- SuperAdmin manages the platform and schools (manual school creation), configuration, and global oversight.

### Hard constraints

- Languages: RU and UZ (i18n required).
- Peak load: up to 500 students taking tests concurrently.
- Hosting: entity["company","aHOST","hosting provider"] shared hosting, no Docker.
- Question types in MVP: single choice, multiple choice, numeric input.
- Randomization: not required.
- Media: images only (no audio/video).
- Scoring: 1–100.
- Manual grading: not required.
- Students must not see correct answers.
- Attempts per test: configurable.
- Time limit per test: configurable (`time_limit_minutes`, nullable).
- Teacher access to classes: SchoolAdmin assigns (teachers cannot self-enroll).
- Notifications: Email + entity["company","Telegram","messaging platform"].
- Password reset:
  - If a user has email → allow “forgot password” via email token.
  - If no email → SchoolAdmin resets and issues a temporary password.
- Import users: Excel import; imported users must change password on first login.

### Non-functional success criteria

Data integrity  
All attempts, answers, assignments, and audit events are stored in PostgreSQL; no in-memory-only persistence is acceptable for a pilot.

Security posture  
Backend enforces RBAC + object-level authorization (no “frontend-only security”), aligned to common web risk classes such as broken access control and authentication failures. citeturn0search3

Performance  
Test-taking endpoints remain responsive under 500 concurrent students:
- Start attempt
- Save answer (idempotent upsert)
- Submit attempt  
Indexes and write patterns are designed to keep these calls lightweight.

Observability and traceability  
- Audit log exists for critical actions (users, access, tests, assignments, exports, role changes).
- Export jobs are tracked end-to-end (queued → running → done/failed).

Reliability  
Daily DB backups and a documented restore procedure.

## Roles, permissions, and user journeys

### Roles

- SuperAdmin (platform-level)
- SchoolAdmin (school-level)
- Teacher (school-level)
- Student (school-level)

### User journeys

Student  
Login → Assigned tests list → Start attempt → Answer questions (autosave) → Submit → See score only → History

Teacher  
Login → Dashboard → Question bank (create/edit/filter) → Test builder → Assign to assigned classes → Analytics → Export XLSX

SchoolAdmin  
Login → Users (create/reset/block) → Import Excel → Classes/Subjects/Topics → Assign teachers to classes → Create tests for teachers (owner assignment) → School analytics → Audit log

SuperAdmin  
Login → Schools (create/block/unblock) → Platform settings (SMTP/Telegram/password policy defaults) → Global audit → Jobs monitoring

### Permission matrix summary

SuperAdmin  
- Create schools manually; block/unblock schools.
- Manage platform settings (SMTP, Telegram bot token, password policy defaults).
- View global audit and job monitoring.
- May access any school context, but any access must be logged, and sensitive data exposure should be minimized.

SchoolAdmin  
- Full management within their school: users, classes, subjects/topics, teacher-class assignments.
- Create tests and assign owners (teachers).
- Assign tests to classes.
- View full school analytics and exports.

Teacher  
- Manage question bank and tests within their school.
- Assign tests only to classes they are assigned to.
- View analytics only for their scope (assigned classes + tests they own/maintain).
- Request exports within their scope.

Student  
- Take tests assigned to their class membership.
- Only see their own attempts and score-only results.

### Object-level authorization rules

Every API request must validate, at minimum:
1. authenticated identity
2. role permission
3. school boundary (`school_id`)
4. object ownership/scope (teacher-class access, student owns attempt, etc.)

This is a central control for preventing broken access control. citeturn0search3turn3search2

## System architecture and delivery approach

### Architecture style

A modular monolith:

- Web app (frontend) with role-based routing.
- Backend API (REST) with strict RBAC and tenant isolation.
- PostgreSQL as the source of truth.
- Asynchronous jobs implemented via database-backed job tables + cron-run workers (shared hosting friendly).

### Frontend stack

Recommended (cleaner, more maintainable than “single-file” frontends):

- Next.js (App Router) + TypeScript
- TailwindCSS + shadcn/ui
- TanStack Query (server-state fetching & caching)
- Zustand (minimal local state)
- React Hook Form + Zod (forms + validation)
- next-intl (RU/UZ i18n)
- Apache ECharts (analytics dashboards)
- Vitest + Playwright (unit + e2e)

Routing namespaces:
- `/student/*`
- `/teacher/*`
- `/admin/*`
- `/superadmin/*`

### Backend approach

- Node.js LTS + TypeScript.
- Prefer Fastify; Express acceptable if hosting constraints require.
- Zod validation for all inputs.
- PostgreSQL via `pg` + query layer (Kysely or Knex).
- Auth: access + refresh tokens (JWT access token format per RFC 7519). citeturn2search0
- Email: SMTP.
- Telegram: Bot API (HTTP-based interface). citeturn1search0
- Workers invoked via cron:
  - exportWorker
  - notificationWorker

### Database-backed job queue pattern

Because shared hosting often lacks Redis/queue infra, use PostgreSQL row locking. A standard pattern is:

- select queued jobs using `SELECT ... FOR UPDATE SKIP LOCKED`
- mark running
- process
- mark done/failed

PostgreSQL explicitly documents `SKIP LOCKED` as usable to avoid lock contention for “queue-like” tables. citeturn0search0

## Data model and PostgreSQL schema

### Tenant boundaries

- Every school-scoped table includes `school_id`.
- SuperAdmin users are platform-scoped (`school_id IS NULL`).
- Enforce tenant boundaries at the application layer on every query; database constraints can be added for defense-in-depth.

### Core tables

schools  
- id (uuid pk)  
- name (text)  
- status (active/blocked)  
- created_at (timestamptz)

users  
- id (uuid pk)  
- school_id (uuid fk, nullable only for superadmin)  
- role (superadmin/admin/teacher/student)  
- username (unique within school)  
- email (nullable)  
- password_hash  
- must_change_password (bool)  
- status (active/blocked)  
- last_login_at  
- created_at  
Constraints:
- UNIQUE(school_id, username)
- Optional UNIQUE(school_id, email) WHERE email IS NOT NULL

classes  
- id (uuid pk)  
- school_id (uuid fk)  
- grade (int)  
- letter (text)  
- name (text)  
- status (active/archived)  
Constraint: UNIQUE(school_id, grade, letter)

class_members  
- class_id (uuid fk)  
- student_user_id (uuid fk to users)  
- joined_at  
PK(class_id, student_user_id)

teacher_class_access  
- teacher_user_id (uuid fk to users)  
- class_id (uuid fk to classes)  
PK(teacher_user_id, class_id)

subjects  
- id, school_id, name, grade(nullable), active

topics  
- id, school_id, subject_id, name, parent_topic_id(nullable)

### Content tables

questions  
- id, school_id, subject_id  
- type: single | multi | number  
- text  
- correct_number (numeric nullable; only for “number”)  
- created_by_user_id  
- status: draft | published | archived  
- created_at

question_options (single/multi only)  
- id, question_id, text, is_correct, sort_order

question_media (images only)  
- id, question_id, media_type='image', url, sort_order

tags  
- id, school_id, name (unique per school)

question_tags  
- question_id, tag_id (pk)

question_topic_map  
- question_id, topic_id (pk)

### Tests, assignments, attempts

tests  
- id, school_id, subject_id  
- title, description  
- max_score = 100  
- attempts_allowed (>=1)  
- time_limit_minutes (nullable, >=1 if set)  
- status: draft | published | archived  
- created_by_user_id (admin or teacher)  
- owner_teacher_user_id (nullable; set when admin creates for teacher)  
Rules:
- If Teacher creates → owner_teacher_user_id = created_by_user_id
- If SchoolAdmin creates for a Teacher → owner_teacher_user_id is required and must reference a teacher in same school

test_questions  
- test_id, question_id, points (>0), sort_order  
PK(test_id, question_id)

assignments  
- id, school_id, test_id, class_id  
- assigned_by_user_id  
- starts_at (nullable), ends_at (nullable; if both then ends_at > starts_at)  
- status: active | closed  
- created_at

attempts  
- id, assignment_id, student_user_id  
- attempt_no (>=1)  
- started_at, finished_at(nullable)  
- status: in_progress | submitted | expired  
- earned_points, total_points (nullable)  
- score (0..100 nullable)  
- is_timeout (bool)  
Constraint:
- UNIQUE(assignment_id, student_user_id, attempt_no)

attempt_answers  
- attempt_id, question_id  
- answer_payload (jsonb)  
- is_correct, points_awarded  
- answered_at  
PK(attempt_id, question_id)

Using `jsonb` is appropriate for flexible answer payloads (selectedOptionIds vs numberValue) and is well-supported by PostgreSQL operators and functions. citeturn1search3

### System, auth, jobs

audit_log  
- id  
- school_id (nullable for platform events)  
- actor_user_id  
- action_type, entity_type, entity_id  
- meta_json (jsonb)  
- created_at

export_jobs  
- id, school_id, requested_by_user_id  
- type: test_report | class_report | school_summary  
- params_json (jsonb)  
- status: queued | running | done | failed  
- file_path_or_url, error_message  
- created_at, started_at, finished_at

notification_jobs  
- id, school_id (nullable for platform notifications)  
- channel: email | telegram  
- target (email or chat_id)  
- template_key  
- payload_json  
- status: queued | running | done | failed  
- created_at, finished_at

platform_settings  
- key (pk)  
- value_json  
- updated_at

refresh_sessions  
- id, user_id  
- refresh_token_hash  
- created_at, expires_at, revoked_at(nullable)  
- user_agent, ip (optional)

password_reset_tokens  
- id, user_id  
- token_hash  
- expires_at, used_at(nullable), created_at

telegram_links  
- user_id (pk)  
- chat_id (unique)  
- linked_at

## API contract

### API standards

Base path: `/api/v1`  
Auth: `Authorization: Bearer <access_token>` (JWT per RFC 7519). citeturn2search0

Error model (consistent):
- `code` (string)
- `message` (user-safe)
- `details` (optional, validation fields)

### Auth

POST `/auth/login`  
Request: `{ username, password }`  
Response: `{ accessToken, refreshToken, user: { id, role, schoolId, mustChangePassword } }`

POST `/auth/refresh`  
Request: `{ refreshToken }`  
Response: `{ accessToken }`

POST `/auth/logout`  
Request: `{ refreshToken }`  
Response: `{ ok: true }`

POST `/auth/password/forgot`  
Request: `{ usernameOrEmail }`  
Response: `{ ok: true }`  
Security requirements:
- Return consistent message to prevent user enumeration.
- Use random, single-use tokens with expiration. citeturn3search1

POST `/auth/password/reset`  
Request: `{ token, newPassword }`  
Response: `{ ok: true }`

POST `/auth/password/change`  
Request: `{ oldPassword, newPassword }`  
Response: `{ ok: true }`

### SuperAdmin

GET `/superadmin/schools`  
POST `/superadmin/schools`  
Request: `{ name, initialAdmin: { username, email? } }`  
Response: `{ schoolId, initialAdminTempPassword? }` (returned once; audited)

PATCH `/superadmin/schools/:schoolId`  
Request: `{ status: 'active'|'blocked' }`

GET `/superadmin/settings`  
PUT `/superadmin/settings`  
Request contains SMTP + Telegram bot settings.

GET `/superadmin/audit`  
GET `/superadmin/jobs/exports`  
GET `/superadmin/jobs/notifications`

### SchoolAdmin

Users  
GET `/admin/users?role=&q=&status=`  
POST `/admin/users` (creates temp password, must_change_password=true; email if present)  
PATCH `/admin/users/:userId` (block/unblock/reset password)  
POST `/admin/users/import` (XLSX import; produces import report)

School structure  
GET/POST/PATCH `/admin/classes`  
GET/POST `/admin/subjects`  
GET/POST `/admin/topics`

Teacher-class access  
POST `/admin/teacher-class-access`  
DELETE `/admin/teacher-class-access`

Admin creates tests for teachers (owner assignment)  
POST `/admin/tests`  
Request: `{ title, subjectId, attemptsAllowed, timeLimitMinutes?, ownerTeacherUserId, questions:[{questionId,points,sortOrder}] }`  
PATCH `/admin/tests/:testId`  
GET `/admin/tests?ownerTeacherUserId=`

Assignments  
POST `/admin/assignments`  
Request: `{ testId, classId, startsAt?, endsAt? }`

Analytics  
GET `/admin/analytics/school/summary`  
GET `/admin/analytics/school/by-class`

Audit  
GET `/admin/audit`

Exports  
POST `/admin/exports` (creates export job)  
GET `/admin/exports/:exportId/status`  
GET `/admin/exports/:exportId/download`

### Teacher

GET/POST/PATCH `/teacher/questions`  
GET/POST/PATCH `/teacher/tests`  
GET/POST `/teacher/assignments` (teacher can assign only to assigned classes)

Analytics  
GET `/teacher/analytics/test/:testId`  
GET `/teacher/analytics/class/:classId`  
GET `/teacher/analytics/student/:studentId`  
GET `/teacher/analytics/topic/:topicId`  
GET `/teacher/analytics/question/:questionId`

Exports  
POST `/teacher/exports`  
GET `/teacher/exports/:exportId/status`  
GET `/teacher/exports/:exportId/download`

Telegram linking  
POST `/teacher/telegram/link-code`  
POST `/teacher/telegram/unlink`  
Telegram bot interactions rely on the official Bot API. citeturn1search0

### Student

GET `/student/assignments`  
POST `/student/attempts/start` (enforces attempt limits and class membership)  
PUT `/student/attempts/:attemptId/answer` (idempotent UPSERT)  
POST `/student/attempts/:attemptId/submit` (scoring; timeout handling)  
GET `/student/attempts/history`  
GET `/student/attempts/:attemptId/result` (score only)

### Media

POST `/media/upload`  
Multipart upload; images only; enforce file size + MIME validation.

## Security, jobs, deployment, backlog, and sprint plan

### Security baseline

Security priorities map directly to the top risk categories for web apps, especially broken access control, authentication failures, injection, and insufficient logging. citeturn0search3

Authentication controls must be enforced server-side (never only in the client). citeturn3search2turn3search3

Forgot-password and reset flows must be designed to prevent user enumeration and token abuse; OWASP’s guidance recommends consistent responses and strong, expiring, single-use tokens. citeturn3search1

Session identifiers and token handling should follow secure session management practices (unpredictability, careful handling, protection against leakage). citeturn3search4

### Async jobs on shared hosting

Exports and notifications run as cron-triggered workers using queue-like tables and Postgres row locking with `SKIP LOCKED`. citeturn0search0

Export pipeline:
- API: create `export_jobs` row (queued)
- worker: claim job → generate XLSX → store file → mark done/failed → enqueue notifications
- notification worker: send email + telegram → update status

### Deployment approach for shared hosting

Assumptions to validate with hosting panel:
- Node runtime support for API and (optionally) for Next.js SSR.
- PostgreSQL database provisioning.
- Cron availability for workers.
If Next.js SSR cannot run, deploy frontend as static where possible and keep backend as the primary server-side component (or move API to a small VPS while keeping Postgres stable).

Operational minimum:
- daily backups
- tested restore procedure
- environment variables for secrets (JWT secrets, SMTP, Telegram bot token)

### Backlog and sprint sequencing

The delivery should be staged to reduce risk (security + tenancy first, then core testing, then analytics/export at scale).

Sprint plan  
Sprint 1: foundation + security first  
- PostgreSQL schema + migrations (core + auth + audit + platform settings)
- SuperAdmin: create school, block/unblock, settings
- Auth: login, refresh rotation, logout, must_change_password
- Forgot-password via email (when email exists) + admin reset flow
- RBAC middleware + object-level authorization framework

Sprint 2: school onboarding  
- Classes/subjects/topics
- User CRUD + XLSX import
- Teacher-class assignment
- Audit completeness for admin actions
- Email notifications for reset/import

Sprint 3: core testing  
- Question bank (single/multi/number) with image upload
- Teacher tests + SchoolAdmin creates tests for teachers (owner assignment)
- Assignments
- Student attempt lifecycle: start → autosave → submit
- Scoring rules (including exact numeric match)

Sprint 4: analytics + exports + notifications  
- Teacher analytics (test/class/student/topic/question)
- School analytics (summary + comparisons)
- XLSX exports via jobs + cron workers + download permissions
- Email + Telegram notifications for export completion
- Hardening pass (rate limits, audit, performance verification)

