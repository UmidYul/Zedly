-- Seed script for ZEDLY
-- Creates test users for each role
-- Password for all users: admin123

-- Insert a test school with predefined UUID
INSERT INTO schools (id, name, address, phone, email, settings)
VALUES (
    '11111111-1111-1111-1111-111111111111',
    'Школа № 1',
    'г. Ташкент, ул. Тестовая, 123',
    '+998901234567',
    'school1@test.uz',
    '{"academic_year": "2024-2025"}'::jsonb
);

-- Insert SuperAdmin (password: admin123)
-- Password hash for 'admin123' with bcrypt rounds=10
INSERT INTO users (id, school_id, role, username, password_hash, first_name, last_name, email, is_active)
VALUES (
    '22222222-2222-2222-2222-222222222222',
    NULL,
    'superadmin',
    'superadmin',
    '$2b$10$cxITXexFzm/mESd8PO6H9ewDpF7xxTLzN7HYMLCUJHvuzwajNZVgG',
    'Супер',
    'Администратор',
    'superadmin@zedly.uz',
    true
);

-- Get school_id for following inserts
DO $$
DECLARE
    v_school_id UUID := '11111111-1111-1111-1111-111111111111';
    v_admin_id UUID := '33333333-3333-3333-3333-333333333333';
    v_teacher_id UUID := '44444444-4444-4444-4444-444444444444';
    v_student_id UUID := '55555555-5555-5555-5555-555555555555';
    v_subject_id UUID := '66666666-6666-6666-6666-666666666666';
    v_class_id UUID := '77777777-7777-7777-7777-777777777777';
BEGIN

    -- Insert SchoolAdmin (password: admin123)
    INSERT INTO users (id, school_id, role, username, password_hash, first_name, last_name, email, is_active)
    VALUES (
        v_admin_id,
        v_school_id,
        'school_admin',
        'admin1',
        '$2b$10$cxITXexFzm/mESd8PO6H9ewDpF7xxTLzN7HYMLCUJHvuzwajNZVgG',
        'Иван',
        'Петров',
        'admin@school1.uz',
        true
    );

    -- Insert Teacher (password: admin123)
    INSERT INTO users (id, school_id, role, username, password_hash, first_name, last_name, email, is_active)
    VALUES (
        v_teacher_id,
        v_school_id,
        'teacher',
        'teacher1',
        '$2b$10$cxITXexFzm/mESd8PO6H9ewDpF7xxTLzN7HYMLCUJHvuzwajNZVgG',
        'Мария',
        'Иванова',
        'teacher@school1.uz',
        true
    );

    -- Insert subject (Mathematics)
    INSERT INTO subjects (id, school_id, name, code, color, description, is_active)
    VALUES (
        v_subject_id,
        v_school_id,
        'Математика',
        'MATH',
        '#4A90E2',
        'Основы математики, алгебра и геометрия',
        true
    );

    -- Insert a class
    INSERT INTO classes (id, school_id, name, grade_level, academic_year, is_active)
    VALUES (
        v_class_id,
        v_school_id,
        '9А',
        9,
        '2024-2025',
        true
    );

    -- Insert Student (password: admin123)
    INSERT INTO users (id, school_id, role, username, password_hash, first_name, last_name, email, is_active)
    VALUES (
        v_student_id,
        v_school_id,
        'student',
        'student1',
        '$2b$10$cxITXexFzm/mESd8PO6H9ewDpF7xxTLzN7HYMLCUJHvuzwajNZVgG',
        'Алексей',
        'Сидоров',
        'student@school1.uz',
        true
    );

    -- Assign student to class
    INSERT INTO class_students (class_id, student_id)
    VALUES (v_class_id, v_student_id);

    -- Insert some career interests for testing
    INSERT INTO career_interests (name, description, subjects, icon)
    VALUES
        ('Точные науки', 'Математика, физика, информатика', ARRAY['Математика', 'Физика', 'Информатика'], 'calculator'),
        ('Гуманитарные науки', 'Литература, история, обществознание', ARRAY['Литература', 'История', 'Обществознание'], 'book'),
        ('Естественные науки', 'Биология, химия, география', ARRAY['Биология', 'Химия', 'География'], 'flask'),
        ('Искусство и творчество', 'Музыка, изобразительное искусство', ARRAY['Музыка', 'ИЗО'], 'palette'),
        ('Иностранные языки', 'Английский, немецкий, французский', ARRAY['Английский', 'Немецкий'], 'globe');

    RAISE NOTICE '========================================';
    RAISE NOTICE 'Test data created successfully!';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'School ID: %', v_school_id;
    RAISE NOTICE 'Class: 9А (ID: %)', v_class_id;
    RAISE NOTICE '';
    RAISE NOTICE 'Test users (password: admin123):';
    RAISE NOTICE '  SuperAdmin:   superadmin';
    RAISE NOTICE '  SchoolAdmin:  admin1';
    RAISE NOTICE '  Teacher:      teacher1';
    RAISE NOTICE '  Student:      student1';
    RAISE NOTICE '========================================';
END $$;
