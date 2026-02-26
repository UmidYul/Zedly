-- Миграция: перевод career_tests.school_id с integer на UUID
-- 1. Добавить временный столбец для UUID
ALTER TABLE career_tests ADD COLUMN school_id_uuid UUID;

-- 2. Заполнить school_id_uuid по соответствию с schools (integer id -> uuid id)
UPDATE career_tests ct
SET school_id_uuid = s.id
FROM schools s
WHERE ct.school_id::text = s.id::text OR ct.school_id = (SELECT row_number FROM (
    SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as row_number FROM schools
) t WHERE t.id = s.id);

-- 3. Проверить, что все строки заполнены
-- SELECT * FROM career_tests WHERE school_id_uuid IS NULL;

-- 4. Удалить внешний ключ и столбец integer
ALTER TABLE career_tests DROP CONSTRAINT IF EXISTS career_tests_school_id_fkey;
ALTER TABLE career_tests DROP COLUMN school_id;

-- 5. Переименовать school_id_uuid в school_id
ALTER TABLE career_tests RENAME COLUMN school_id_uuid TO school_id;

-- 6. Добавить внешний ключ на schools(id)
ALTER TABLE career_tests ADD CONSTRAINT career_tests_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;

-- 7. Готово!