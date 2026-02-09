-- Migration: Initial schema
-- Created: 2026-02-10
-- Description: Creates all core tables for Zedly platform

-- Enable UUID extension

-- ============================================================================
-- SCHOOLS AND USERS
-- ============================================================================

CREATE TABLE schools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('active', 'blocked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_schools_status ON schools(status);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('superadmin', 'admin', 'teacher', 'student')),
  username VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  password_hash TEXT NOT NULL,
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(20) NOT NULL CHECK (status IN ('active', 'blocked')) DEFAULT 'active',
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_school_username UNIQUE (school_id, username),
  CONSTRAINT unique_school_email UNIQUE (school_id, email),
  CONSTRAINT superadmin_no_school CHECK (
    (role = 'superadmin' AND school_id IS NULL) OR
    (role != 'superadmin' AND school_id IS NOT NULL)
  )
);

CREATE INDEX idx_users_school_id ON users(school_id);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_username ON users(username);

-- ============================================================================
-- SCHOOL STRUCTURE
-- ============================================================================

CREATE TABLE classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  grade INTEGER NOT NULL CHECK (grade >= 1 AND grade <= 11),
  letter VARCHAR(10) NOT NULL,
  name TEXT NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('active', 'archived')) DEFAULT 'active',
  CONSTRAINT unique_school_grade_letter UNIQUE (school_id, grade, letter)
);

CREATE INDEX idx_classes_school_id ON classes(school_id);
CREATE INDEX idx_classes_status ON classes(status);

CREATE TABLE class_members (
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (class_id, student_user_id)
);

CREATE INDEX idx_class_members_student ON class_members(student_user_id);

CREATE TABLE teacher_class_access (
  teacher_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  PRIMARY KEY (teacher_user_id, class_id)
);

CREATE INDEX idx_teacher_class_access_class ON teacher_class_access(class_id);

CREATE TABLE subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  grade INTEGER CHECK (grade IS NULL OR (grade >= 1 AND grade <= 11)),
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_subjects_school_id ON subjects(school_id);

CREATE TABLE topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parent_topic_id UUID REFERENCES topics(id) ON DELETE SET NULL
);

CREATE INDEX idx_topics_school_id ON topics(school_id);
CREATE INDEX idx_topics_subject_id ON topics(subject_id);
CREATE INDEX idx_topics_parent ON topics(parent_topic_id);

-- ============================================================================
-- CONTENT (QUESTIONS AND TESTS)
-- ============================================================================

CREATE TABLE questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL CHECK (type IN ('single', 'multi', 'number')),
  text TEXT NOT NULL,
  correct_number NUMERIC,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL CHECK (status IN ('draft', 'published', 'archived')) DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT number_type_has_correct_number CHECK (
    (type = 'number' AND correct_number IS NOT NULL) OR
    (type != 'number' AND correct_number IS NULL)
  )
);

CREATE INDEX idx_questions_school_id ON questions(school_id);
CREATE INDEX idx_questions_subject_id ON questions(subject_id);
CREATE INDEX idx_questions_created_by ON questions(created_by_user_id);
CREATE INDEX idx_questions_status ON questions(status);

CREATE TABLE question_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL
);

CREATE INDEX idx_question_options_question_id ON question_options(question_id);

CREATE TABLE question_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  media_type VARCHAR(20) NOT NULL CHECK (media_type = 'image'),
  url TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);

CREATE INDEX idx_question_media_question_id ON question_media(question_id);

CREATE TABLE tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  CONSTRAINT unique_school_tag UNIQUE (school_id, name)
);

CREATE INDEX idx_tags_school_id ON tags(school_id);

CREATE TABLE question_tags (
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (question_id, tag_id)
);

CREATE TABLE question_topic_map (
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  PRIMARY KEY (question_id, topic_id)
);

CREATE TABLE tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  max_score INTEGER NOT NULL DEFAULT 100,
  attempts_allowed INTEGER NOT NULL CHECK (attempts_allowed >= 1),
  time_limit_minutes INTEGER CHECK (time_limit_minutes IS NULL OR time_limit_minutes >= 1),
  status VARCHAR(20) NOT NULL CHECK (status IN ('draft', 'published', 'archived')) DEFAULT 'draft',
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner_teacher_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tests_school_id ON tests(school_id);
CREATE INDEX idx_tests_subject_id ON tests(subject_id);
CREATE INDEX idx_tests_created_by ON tests(created_by_user_id);
CREATE INDEX idx_tests_owner_teacher ON tests(owner_teacher_user_id);
CREATE INDEX idx_tests_status ON tests(status);

CREATE TABLE test_questions (
  test_id UUID NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  points INTEGER NOT NULL CHECK (points > 0),
  sort_order INTEGER NOT NULL,
  PRIMARY KEY (test_id, question_id)
);

-- ============================================================================
-- ASSIGNMENTS AND ATTEMPTS
-- ============================================================================

CREATE TABLE assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  test_id UUID NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  assigned_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL CHECK (status IN ('active', 'closed')) DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_time_range CHECK (
    (starts_at IS NULL OR ends_at IS NULL) OR (ends_at > starts_at)
  )
);

CREATE INDEX idx_assignments_school_id ON assignments(school_id);
CREATE INDEX idx_assignments_test_id ON assignments(test_id);
CREATE INDEX idx_assignments_class_id ON assignments(class_id);
CREATE INDEX idx_assignments_status ON assignments(status);

CREATE TABLE attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attempt_no INTEGER NOT NULL CHECK (attempt_no >= 1),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL CHECK (status IN ('in_progress', 'submitted', 'expired')) DEFAULT 'in_progress',
  earned_points NUMERIC,
  total_points NUMERIC,
  score NUMERIC CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
  is_timeout BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT unique_assignment_student_attempt UNIQUE (assignment_id, student_user_id, attempt_no)
);

CREATE INDEX idx_attempts_assignment ON attempts(assignment_id);
CREATE INDEX idx_attempts_student ON attempts(student_user_id);
CREATE INDEX idx_attempts_status ON attempts(status);

CREATE TABLE attempt_answers (
  attempt_id UUID NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  answer_payload JSONB NOT NULL,
  is_correct BOOLEAN,
  points_awarded NUMERIC,
  answered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (attempt_id, question_id)
);

CREATE INDEX idx_attempt_answers_attempt ON attempt_answers(attempt_id);

-- ============================================================================
-- SYSTEM TABLES
-- ============================================================================

CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES schools(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action_type VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id UUID,
  meta_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_log_school_id ON audit_log(school_id);
CREATE INDEX idx_audit_log_actor ON audit_log(actor_user_id);
CREATE INDEX idx_audit_log_action_type ON audit_log(action_type);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at DESC);

CREATE TABLE export_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  requested_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL CHECK (type IN ('test_report', 'class_report', 'school_summary')),
  params_json JSONB NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('queued', 'running', 'done', 'failed')) DEFAULT 'queued',
  file_path_or_url TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

CREATE INDEX idx_export_jobs_school_id ON export_jobs(school_id);
CREATE INDEX idx_export_jobs_status ON export_jobs(status);
CREATE INDEX idx_export_jobs_created_at ON export_jobs(created_at DESC);

CREATE TABLE notification_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES schools(id) ON DELETE SET NULL,
  channel VARCHAR(20) NOT NULL CHECK (channel IN ('email', 'telegram')),
  target TEXT NOT NULL,
  template_key VARCHAR(100) NOT NULL,
  payload_json JSONB NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('queued', 'running', 'done', 'failed')) DEFAULT 'queued',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX idx_notification_jobs_status ON notification_jobs(status);
CREATE INDEX idx_notification_jobs_created_at ON notification_jobs(created_at DESC);

CREATE TABLE platform_settings (
  key VARCHAR(255) PRIMARY KEY,
  value_json JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- AUTH TABLES
-- ============================================================================

CREATE TABLE refresh_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  user_agent TEXT,
  ip VARCHAR(45)
);

CREATE INDEX idx_refresh_sessions_user_id ON refresh_sessions(user_id);
CREATE INDEX idx_refresh_sessions_expires_at ON refresh_sessions(expires_at);

CREATE TABLE password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
CREATE INDEX idx_password_reset_tokens_expires_at ON password_reset_tokens(expires_at);

CREATE TABLE telegram_links (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  chat_id VARCHAR(255) NOT NULL UNIQUE,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- SEED DATA (Optional: can run this separately)
-- ============================================================================

-- Create default platform settings
INSERT INTO platform_settings (key, value_json) VALUES
  ('smtp', '{"enabled":false}'::jsonb),
  ('telegram', '{"enabled":false}'::jsonb),
  ('password_policy', '{"minLength":8,"requireUppercase":true,"requireLowercase":true,"requireNumber":true,"requireSpecial":false}'::jsonb);
