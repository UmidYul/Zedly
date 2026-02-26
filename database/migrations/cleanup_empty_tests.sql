-- Clean up attempts without questions
-- Run this to remove test attempts that have no questions

DELETE FROM test_attempts 
WHERE test_id IN (
    SELECT t.id 
    FROM tests t 
    LEFT JOIN test_questions tq ON t.id = tq.test_id 
    GROUP BY t.id 
    HAVING COUNT(tq.id) = 0
);

-- Optional: Also delete assignments for tests without questions
DELETE FROM test_assignments 
WHERE test_id IN (
    SELECT t.id 
    FROM tests t 
    LEFT JOIN test_questions tq ON t.id = tq.test_id 
    GROUP BY t.id 
    HAVING COUNT(tq.id) = 0
);

-- Check remaining tests and their question counts
SELECT 
    t.id,
    t.title_ru as title,
    COUNT(tq.id) as question_count
FROM tests t
LEFT JOIN test_questions tq ON t.id = tq.test_id
GROUP BY t.id, t.title_ru
ORDER BY t.id;
