-- Migration: Change school_id in career_tests to UUID

-- 1. Add new UUID column
ALTER TABLE career_tests ADD COLUMN school_id_uuid UUID;

-- 2. Update new column with converted values (assuming mapping exists in schools table)
UPDATE career_tests SET school_id_uuid = s.uuid
FROM schools s
WHERE career_tests.school_id = s.id;

-- 3. Set NOT NULL if all values are filled
ALTER TABLE career_tests ALTER COLUMN school_id_uuid SET NOT NULL;

-- 4. Drop old integer column and rename new one
ALTER TABLE career_tests DROP COLUMN school_id;
ALTER TABLE career_tests RENAME COLUMN school_id_uuid TO school_id;

-- 5. (Optional) Add foreign key constraint
ALTER TABLE career_tests ADD CONSTRAINT fk_career_tests_school_id FOREIGN KEY (school_id) REFERENCES schools(id);
