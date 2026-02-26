-- Create teacher_class_subjects table
-- This table links teachers to the classes and subjects they teach

CREATE TABLE IF NOT EXISTS teacher_class_subjects (
    id BIGSERIAL PRIMARY KEY,
    teacher_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    class_id BIGINT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    subject_id BIGINT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    academic_year VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(teacher_id, class_id, subject_id, academic_year)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_tcs_teacher ON teacher_class_subjects(teacher_id);
CREATE INDEX IF NOT EXISTS idx_tcs_class ON teacher_class_subjects(class_id);
CREATE INDEX IF NOT EXISTS idx_tcs_subject ON teacher_class_subjects(subject_id);
CREATE INDEX IF NOT EXISTS idx_tcs_year ON teacher_class_subjects(academic_year);

-- Verify table was created
SELECT 'teacher_class_subjects table' as table_name,
       CASE WHEN COUNT(*) > 0 THEN '✓ EXISTS' ELSE '✗ MISSING' END as status
FROM information_schema.tables
WHERE table_name = 'teacher_class_subjects';
