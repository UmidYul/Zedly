-- ZEDLY Database Schema
-- PostgreSQL 12+

-- No extensions required

-- ==============================================
-- CORE TABLES
-- ==============================================

-- Roles enum
CREATE TYPE user_role AS ENUM ('superAdmin', 'schoolAdmin', 'teacher', 'student');

-- Schools table
CREATE TABLE schools (
    id BIGSERIAL PRIMARY KEY,
    name_ru VARCHAR(255) NOT NULL,
    name_uz VARCHAR(255) NOT NULL,
    address TEXT,
    city VARCHAR(100),
    region VARCHAR(100),
    phone VARCHAR(20),
    email VARCHAR(255),
    website VARCHAR(255),
    logo_url TEXT,
    is_active BOOLEAN DEFAULT true,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Users table
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    school_id BIGINT REFERENCES schools(id) ON DELETE CASCADE,
    role user_role NOT NULL,
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(20),
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    middle_name VARCHAR(100),
    avatar_url TEXT,
    is_otp BOOLEAN DEFAULT false, -- One-Time Password flag
    must_change_password BOOLEAN DEFAULT false,
    telegram_id BIGINT UNIQUE,
    telegram_username VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP,
    login_attempts INT DEFAULT 0,
    locked_until TIMESTAMP,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_school_role CHECK (
        (role = 'superAdmin' AND school_id IS NULL) OR
        (role != 'superAdmin' AND school_id IS NOT NULL)
    )
);

-- Refresh tokens for JWT
CREATE TABLE refresh_tokens (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(500) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    is_revoked BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==============================================
-- ACADEMIC STRUCTURE
-- ==============================================

-- Subjects table
CREATE TABLE subjects (
    id BIGSERIAL PRIMARY KEY,
    school_id BIGINT REFERENCES schools(id) ON DELETE CASCADE,
    name_ru VARCHAR(255) NOT NULL,
    name_uz VARCHAR(255) NOT NULL,
    description_ru TEXT,
    description_uz TEXT,
    color VARCHAR(7) DEFAULT '#4A90E2', -- для визуализации
    icon VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Classes (классы)
CREATE TABLE classes (
    id BIGSERIAL PRIMARY KEY,
    school_id BIGINT REFERENCES schools(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL, -- "10А", "9Б"
    grade INT NOT NULL, -- 1-11
    homeroom_teacher_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    academic_year VARCHAR(20) NOT NULL, -- "2024-2025"
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(school_id, name, academic_year)
);

-- Class students (связь многие-ко-многим)
CREATE TABLE class_students (
    id BIGSERIAL PRIMARY KEY,
    class_id BIGINT REFERENCES classes(id) ON DELETE CASCADE,
    student_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    left_at TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    UNIQUE(class_id, student_id, is_active)
);

-- Teacher subjects (какие предметы преподает учитель)
CREATE TABLE teacher_subjects (
    id BIGSERIAL PRIMARY KEY,
    teacher_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    subject_id BIGINT REFERENCES subjects(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(teacher_id, subject_id)
);

-- Teacher classes (каким классам преподает учитель по предмету)
CREATE TABLE teacher_classes (
    id BIGSERIAL PRIMARY KEY,
    teacher_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    class_id BIGINT REFERENCES classes(id) ON DELETE CASCADE,
    subject_id BIGINT REFERENCES subjects(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(teacher_id, class_id, subject_id)
);

-- ==============================================
-- TESTING SYSTEM
-- ==============================================

-- Question types
CREATE TYPE question_type AS ENUM (
    'single',        -- single choice
    'multi',         -- multiple choice
    'number',        -- numeric answer
    'truefalse',     -- true/false
    'matching',      -- match pairs
    'ordering',      -- order items
    'fillblank',     -- fill in the blank
    'imagebased',    -- select area on image
    'formula'        -- math formula input
);

-- Tests table
CREATE TABLE tests (
    id BIGSERIAL PRIMARY KEY,
    school_id BIGINT REFERENCES schools(id) ON DELETE CASCADE,
    subject_id BIGINT REFERENCES subjects(id) ON DELETE CASCADE,
    creator_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    title_ru VARCHAR(255) NOT NULL,
    title_uz VARCHAR(255) NOT NULL,
    description_ru TEXT,
    description_uz TEXT,
    type VARCHAR(50) NOT NULL, -- 'practice', 'exam', 'career' (профориентация)

    -- Test settings
    duration_minutes INT, -- NULL = unlimited
    passing_score DECIMAL(5,2) DEFAULT 60.00, -- минимальный процент для прохождения
    max_attempts INT DEFAULT 1, -- количество попыток
    shuffle_questions BOOLEAN DEFAULT false,
    shuffle_answers BOOLEAN DEFAULT false,
    show_answers BOOLEAN DEFAULT false, -- показывать правильные ответы после завершения
    fullscreen_required BOOLEAN DEFAULT false, -- требовать полноэкранный режим
    block_copy_paste BOOLEAN DEFAULT true,
    track_tab_switches BOOLEAN DEFAULT true,
    adaptive_testing BOOLEAN DEFAULT false, -- адаптивное тестирование

    -- Grading scale (JSON: {"90": 5, "80": 4, "60": 3, "0": 2})
    grading_scale JSONB DEFAULT '{"90": 5, "80": 4, "60": 3, "0": 2}',

    is_active BOOLEAN DEFAULT true,
    published_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Questions bank
CREATE TABLE questions (
    id BIGSERIAL PRIMARY KEY,
    school_id BIGINT REFERENCES schools(id) ON DELETE CASCADE,
    subject_id BIGINT REFERENCES subjects(id) ON DELETE CASCADE,
    creator_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    type question_type NOT NULL,

    -- Question content
    question_text_ru TEXT NOT NULL,
    question_text_uz TEXT NOT NULL,
    question_image_url TEXT,

    -- Answer data (структура зависит от типа)
    answer_data JSONB NOT NULL,
    /*
    Примеры answer_data:

    single/multi: {
        "options": [
            {"id": "a", "text_ru": "...", "text_uz": "...", "is_correct": true},
            {"id": "b", "text_ru": "...", "text_uz": "...", "is_correct": false}
        ]
    }

    number: {
        "correct_answer": 42,
        "tolerance": 0.1
    }

    truefalse: {
        "correct_answer": true
    }

    matching: {
        "pairs": [
            {"left": "A", "right": "1"},
            {"left": "B", "right": "2"}
        ]
    }

    ordering: {
        "items": ["First", "Second", "Third"],
        "correct_order": [0, 1, 2]
    }

    fillblank: {
        "text": "The capital of France is ___",
        "blanks": [{"position": 0, "answer": "Paris", "case_sensitive": false}]
    }

    imagebased: {
        "image_url": "...",
        "correct_areas": [{"x": 100, "y": 100, "width": 50, "height": 50}]
    }

    formula: {
        "correct_formula": "x^2 + 2x + 1"
    }
    */

    -- Metadata
    points DECIMAL(5,2) DEFAULT 1.00,
    difficulty INT DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 5), -- 1=easy, 5=hard
    explanation_ru TEXT, -- объяснение правильного ответа
    explanation_uz TEXT,
    tags TEXT[], -- теги для поиска

    -- Statistics
    times_used INT DEFAULT 0,
    avg_score DECIMAL(5,2),

    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Test questions (questions in a test)
CREATE TABLE test_questions (
    id BIGSERIAL PRIMARY KEY,
    test_id BIGINT REFERENCES tests(id) ON DELETE CASCADE,
    question_id BIGINT REFERENCES questions(id) ON DELETE CASCADE,
    order_index INT NOT NULL,
    points DECIMAL(5,2) DEFAULT 1.00, -- можно переопределить баллы
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(test_id, question_id),
    UNIQUE(test_id, order_index)
);

-- Test assignments (назначение тестов классам)
CREATE TABLE test_assignments (
    id BIGSERIAL PRIMARY KEY,
    test_id BIGINT REFERENCES tests(id) ON DELETE CASCADE,
    class_id BIGINT REFERENCES classes(id) ON DELETE CASCADE,
    assigned_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    start_date TIMESTAMP,
    due_date TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(test_id, class_id)
);

-- Test attempts (попытки прохождения)
CREATE TABLE test_attempts (
    id BIGSERIAL PRIMARY KEY,
    test_id BIGINT REFERENCES tests(id) ON DELETE CASCADE,
    student_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    attempt_number INT NOT NULL,

    -- Attempt data
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    duration_seconds INT,

    -- Proctoring data
    tab_switches INT DEFAULT 0,
    copy_attempts INT DEFAULT 0,
    suspicious_activity JSONB DEFAULT '[]',

    -- Results
    total_questions INT NOT NULL,
    correct_answers INT DEFAULT 0,
    score DECIMAL(5,2), -- процент правильных ответов
    grade INT, -- оценка по шкале (2-5)
    passed BOOLEAN,

    -- User answers
    answers JSONB DEFAULT '{}', -- {question_id: user_answer}

    is_completed BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(test_id, student_id, attempt_number)
);

-- ==============================================
-- CAREER ORIENTATION (Профориентация)
-- ==============================================

-- Career interests
CREATE TABLE career_interests (
    id BIGSERIAL PRIMARY KEY,
    name_ru VARCHAR(100) NOT NULL,
    name_uz VARCHAR(100) NOT NULL,
    description_ru TEXT,
    description_uz TEXT,
    icon VARCHAR(50),
    color VARCHAR(7),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Student career results
CREATE TABLE student_career_results (
    id BIGSERIAL PRIMARY KEY,
    student_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    test_id BIGINT REFERENCES tests(id) ON DELETE CASCADE,
    attempt_id BIGINT REFERENCES test_attempts(id) ON DELETE CASCADE,

    -- Results (radar chart data)
    interests_scores JSONB NOT NULL, -- {interest_id: score}
    recommended_subjects JSONB DEFAULT '[]', -- [subject_id, ...]

    completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, test_id, attempt_id)
);

-- ==============================================
-- ANALYTICS & STATISTICS
-- ==============================================

-- Student performance cache
CREATE TABLE student_performance (
    id BIGSERIAL PRIMARY KEY,
    student_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    school_id BIGINT REFERENCES schools(id) ON DELETE CASCADE,
    subject_id BIGINT REFERENCES subjects(id) ON DELETE CASCADE,

    -- Aggregated data
    total_tests INT DEFAULT 0,
    completed_tests INT DEFAULT 0,
    avg_score DECIMAL(5,2),
    avg_grade DECIMAL(3,2),

    -- Streak data
    current_streak INT DEFAULT 0,
    longest_streak INT DEFAULT 0,
    last_activity TIMESTAMP,

    -- Rankings
    class_rank INT,
    school_rank INT,

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, subject_id)
);

-- Leaderboard (таблица лидеров)
CREATE TABLE leaderboards (
    id BIGSERIAL PRIMARY KEY,
    school_id BIGINT REFERENCES schools(id) ON DELETE CASCADE,
    class_id BIGINT REFERENCES classes(id) ON DELETE CASCADE,
    student_id BIGINT REFERENCES users(id) ON DELETE CASCADE,

    scope VARCHAR(20) NOT NULL, -- 'class', 'school'
    period VARCHAR(20) NOT NULL, -- 'week', 'month', 'quarter', 'year', 'all'

    total_score DECIMAL(10,2) DEFAULT 0,
    tests_completed INT DEFAULT 0,
    avg_score DECIMAL(5,2),
    rank INT,

    calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(school_id, class_id, student_id, scope, period)
);

-- Teacher statistics cache
CREATE TABLE teacher_statistics (
    id BIGSERIAL PRIMARY KEY,
    teacher_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    school_id BIGINT REFERENCES schools(id) ON DELETE CASCADE,

    -- Aggregated data
    total_tests_created INT DEFAULT 0,
    total_tests_assigned INT DEFAULT 0,
    total_students INT DEFAULT 0,
    avg_student_score DECIMAL(5,2),
    success_rate DECIMAL(5,2), -- процент успешно прошедших тесты

    -- Ranking
    school_rank INT,

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(teacher_id)
);

-- ==============================================
-- NOTIFICATIONS
-- ==============================================

-- Notification types
CREATE TYPE notification_type AS ENUM (
    'test_assigned',
    'test_reminder',
    'test_graded',
    'password_reset',
    'account_created',
    'system_announcement'
);

-- Notification channels
CREATE TYPE notification_channel AS ENUM ('email', 'telegram', 'in_app');

-- Notifications
CREATE TABLE notifications (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    type notification_type NOT NULL,
    channel notification_channel NOT NULL,

    title_ru VARCHAR(255) NOT NULL,
    title_uz VARCHAR(255) NOT NULL,
    message_ru TEXT NOT NULL,
    message_uz TEXT NOT NULL,

    data JSONB DEFAULT '{}', -- дополнительные данные

    is_read BOOLEAN DEFAULT false,
    is_sent BOOLEAN DEFAULT false,
    sent_at TIMESTAMP,
    read_at TIMESTAMP,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Notification preferences
CREATE TABLE notification_preferences (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,

    email_enabled BOOLEAN DEFAULT true,
    telegram_enabled BOOLEAN DEFAULT true,
    in_app_enabled BOOLEAN DEFAULT true,

    test_assigned BOOLEAN DEFAULT true,
    test_reminder BOOLEAN DEFAULT true,
    test_graded BOOLEAN DEFAULT true,
    password_reset BOOLEAN DEFAULT true,
    account_created BOOLEAN DEFAULT true,
    system_announcement BOOLEAN DEFAULT true,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- ==============================================
-- CALENDAR & SCHEDULING
-- ==============================================

-- Calendar events
CREATE TABLE calendar_events (
    id BIGSERIAL PRIMARY KEY,
    school_id BIGINT REFERENCES schools(id) ON DELETE CASCADE,
    test_id BIGINT REFERENCES tests(id) ON DELETE CASCADE,
    class_id BIGINT REFERENCES classes(id) ON DELETE CASCADE,

    title_ru VARCHAR(255) NOT NULL,
    title_uz VARCHAR(255) NOT NULL,
    description_ru TEXT,
    description_uz TEXT,

    event_type VARCHAR(50) NOT NULL, -- 'test', 'exam', 'reminder'

    start_date TIMESTAMP NOT NULL,
    end_date TIMESTAMP,

    reminder_before_minutes INT DEFAULT 60, -- напомнить за N минут

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==============================================
-- REPORTS & EXPORTS
-- ==============================================

-- Scheduled reports
CREATE TABLE scheduled_reports (
    id BIGSERIAL PRIMARY KEY,
    school_id BIGINT REFERENCES schools(id) ON DELETE CASCADE,
    recipient_id BIGINT REFERENCES users(id) ON DELETE CASCADE,

    report_type VARCHAR(50) NOT NULL, -- 'weekly', 'monthly', 'yearly'
    report_scope VARCHAR(50) NOT NULL, -- 'director', 'teacher', 'parent'

    schedule_cron VARCHAR(100) NOT NULL, -- cron expression
    last_sent TIMESTAMP,
    next_run TIMESTAMP NOT NULL,

    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Generated reports archive
CREATE TABLE report_archives (
    id BIGSERIAL PRIMARY KEY,
    school_id BIGINT REFERENCES schools(id) ON DELETE CASCADE,
    generated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,

    report_type VARCHAR(50) NOT NULL,
    report_name VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,
    file_size_bytes BIGINT,

    period_start DATE,
    period_end DATE,

    metadata JSONB DEFAULT '{}',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==============================================
-- KNOWLEDGE BASE
-- ==============================================

-- Knowledge base categories
CREATE TABLE kb_categories (
    id BIGSERIAL PRIMARY KEY,
    school_id BIGINT REFERENCES schools(id) ON DELETE CASCADE,
    parent_id BIGINT REFERENCES kb_categories(id) ON DELETE CASCADE,

    name_ru VARCHAR(255) NOT NULL,
    name_uz VARCHAR(255) NOT NULL,
    description_ru TEXT,
    description_uz TEXT,
    icon VARCHAR(50),

    order_index INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Knowledge base articles
CREATE TABLE kb_articles (
    id BIGSERIAL PRIMARY KEY,
    school_id BIGINT REFERENCES schools(id) ON DELETE CASCADE,
    category_id BIGINT REFERENCES kb_categories(id) ON DELETE CASCADE,
    subject_id BIGINT REFERENCES subjects(id) ON DELETE SET NULL,
    author_id BIGINT REFERENCES users(id) ON DELETE SET NULL,

    title_ru VARCHAR(255) NOT NULL,
    title_uz VARCHAR(255) NOT NULL,
    content_ru TEXT NOT NULL,
    content_uz TEXT NOT NULL,

    type VARCHAR(50) NOT NULL, -- 'article', 'video', 'pdf', 'link'
    url TEXT, -- для внешних ресурсов
    file_url TEXT, -- для загруженных файлов

    tags TEXT[],
    views INT DEFAULT 0,

    is_published BOOLEAN DEFAULT false,
    published_at TIMESTAMP,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==============================================
-- AUDIT LOG
-- ==============================================

-- Audit actions
CREATE TYPE audit_action AS ENUM (
    'create', 'update', 'delete', 'login', 'logout',
    'password_reset', 'password_change', 'test_assign',
    'test_start', 'test_complete', 'bulk_import', 'export'
);

-- Audit log
CREATE TABLE audit_logs (
    id BIGSERIAL PRIMARY KEY,
    school_id BIGINT REFERENCES schools(id) ON DELETE CASCADE,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,

    action audit_action NOT NULL,
    entity_type VARCHAR(50) NOT NULL, -- 'user', 'test', 'class', etc.
    entity_id BIGINT,

    description_ru TEXT,
    description_uz TEXT,

    ip_address INET,
    user_agent TEXT,

    old_data JSONB,
    new_data JSONB,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==============================================
-- SYSTEM SETTINGS
-- ==============================================

-- System settings
CREATE TABLE system_settings (
    id BIGSERIAL PRIMARY KEY,
    school_id BIGINT REFERENCES schools(id) ON DELETE CASCADE,

    key VARCHAR(100) NOT NULL,
    value JSONB NOT NULL,
    description TEXT,

    updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(school_id, key)
);

-- ==============================================
-- BACKUPS
-- ==============================================

-- Backup history
CREATE TABLE backup_history (
    id BIGSERIAL PRIMARY KEY,
    school_id BIGINT REFERENCES schools(id) ON DELETE CASCADE,

    backup_type VARCHAR(50) NOT NULL, -- 'full', 'incremental', 'manual'
    file_path TEXT NOT NULL,
    file_size_bytes BIGINT,

    status VARCHAR(50) NOT NULL, -- 'success', 'failed', 'in_progress'
    error_message TEXT,

    started_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP,

    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ==============================================
-- INDEXES for Performance
-- ==============================================

-- Users indexes
CREATE INDEX idx_users_school_id ON users(school_id);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);

-- Tests indexes
CREATE INDEX idx_tests_school_id ON tests(school_id);
CREATE INDEX idx_tests_subject_id ON tests(subject_id);
CREATE INDEX idx_tests_creator_id ON tests(creator_id);
CREATE INDEX idx_tests_type ON tests(type);

-- Questions indexes
CREATE INDEX idx_questions_school_id ON questions(school_id);
CREATE INDEX idx_questions_subject_id ON questions(subject_id);
CREATE INDEX idx_questions_type ON questions(type);
CREATE INDEX idx_questions_tags ON questions USING gin(tags);

-- Test attempts indexes
CREATE INDEX idx_test_attempts_test_id ON test_attempts(test_id);
CREATE INDEX idx_test_attempts_student_id ON test_attempts(student_id);
CREATE INDEX idx_test_attempts_completed ON test_attempts(is_completed);

-- Audit logs indexes
CREATE INDEX idx_audit_logs_school_id ON audit_logs(school_id);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- Notifications indexes
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);

-- Performance indexes
CREATE INDEX idx_student_performance_student_id ON student_performance(student_id);
CREATE INDEX idx_student_performance_subject_id ON student_performance(subject_id);

-- Leaderboards indexes
CREATE INDEX idx_leaderboards_school_id ON leaderboards(school_id);
CREATE INDEX idx_leaderboards_class_id ON leaderboards(class_id);
CREATE INDEX idx_leaderboards_scope_period ON leaderboards(scope, period);

-- ==============================================
-- TRIGGERS for updated_at
-- ==============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to all relevant tables
CREATE TRIGGER update_schools_updated_at BEFORE UPDATE ON schools
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subjects_updated_at BEFORE UPDATE ON subjects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_classes_updated_at BEFORE UPDATE ON classes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tests_updated_at BEFORE UPDATE ON tests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_questions_updated_at BEFORE UPDATE ON questions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_test_attempts_updated_at BEFORE UPDATE ON test_attempts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==============================================
-- INITIAL DATA
-- ==============================================

-- Insert default SuperAdmin (password: Admin@123456)
INSERT INTO users (role, username, email, password_hash, first_name, last_name, is_active)
VALUES (
    'superAdmin',
    'admin',
    'admin@zedly.uz',
    '$2b$10$rQj5Z3wLqWyP.2xQvX9.qOqKZmGXbXJYG5xQYjX5ZxYqYqYqYqYqY', -- нужно будет заменить на реальный хеш
    'Super',
    'Admin',
    true
);

-- Insert default career interests
INSERT INTO career_interests (name_ru, name_uz, description_ru, description_uz, icon, color) VALUES
    ('Точные науки', 'Aniq fanlar', 'Математика, физика, информатика', 'Matematika, fizika, informatika', 'calculator', '#3498db'),
    ('Естественные науки', 'Tabiiy fanlar', 'Биология, химия, география', 'Biologiya, kimyo, geografiya', 'leaf', '#27ae60'),
    ('Гуманитарные науки', 'Gumanitar fanlar', 'История, литература, языки', 'Tarix, adabiyot, tillar', 'book', '#e74c3c'),
    ('Искусство', 'San''at', 'Музыка, рисование, театр', 'Musiqa, rasm, teatr', 'palette', '#9b59b6'),
    ('Технологии', 'Texnologiya', 'Инженерия, программирование, робототехника', 'Muhandislik, dasturlash, robototexnika', 'cpu', '#1abc9c'),
    ('Социальные науки', 'Ijtimoiy fanlar', 'Психология, социология, экономика', 'Psixologiya, sotsiologiya, iqtisod', 'users', '#f39c12');

-- Create default system settings
INSERT INTO system_settings (key, value, description) VALUES
    ('site_name', '{"ru": "ZEDLY", "uz": "ZEDLY"}', 'Название сайта'),
    ('max_upload_size_mb', '5', 'Максимальный размер загружаемого файла'),
    ('backup_schedule', '"0 2 * * *"', 'Расписание бэкапов (cron)'),
    ('session_timeout_minutes', '120', 'Таймаут сессии'),
    ('max_login_attempts', '5', 'Максимальное количество попыток входа');
