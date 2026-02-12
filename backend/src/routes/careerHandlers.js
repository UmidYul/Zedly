// careerHandlers.js
// Реализация логики профориентационного модуля

const db = require('../config/database');

// --- SchoolAdmin ---
async function createCareerTest(req, res) {
    // RBAC: только SchoolAdmin своей школы
    const { school_id } = req.user;
    const { title_ru, title_uz, description_ru, description_uz } = req.body;
    try {
        const result = await db.query(
            'INSERT INTO career_tests (school_id, title_ru, title_uz, description_ru, description_uz) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [school_id, title_ru, title_uz, description_ru, description_uz]
        );
        // Audit log
        await db.query('INSERT INTO audit_career (action, admin_id, test_id, details) VALUES ($1, $2, $3, $4)',
            ['create', req.user.id, result.rows[0].id, 'Создан тест']);
        res.status(201).json({ test: result.rows[0] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}
async function updateCareerTest(req, res) {
    // Обновление теста профориентации
    const { school_id } = req.user;
    const testId = req.params.id;
    const { title_ru, title_uz, description_ru, description_uz } = req.body;
    try {
        const result = await db.query(
            'UPDATE career_tests SET title_ru = $1, title_uz = $2, description_ru = $3, description_uz = $4, updated_at = NOW() WHERE id = $5 AND school_id = $6 RETURNING *',
            [title_ru, title_uz, description_ru, description_uz, testId, school_id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Test not found or access denied' });
        }
        // Audit log
        await db.query('INSERT INTO audit_career (action, admin_id, test_id, details) VALUES ($1, $2, $3, $4)',
            ['update', req.user.id, testId, 'Тест обновлен']);
        res.json({ test: result.rows[0] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}
async function publishCareerTest(req, res) {
    // Публикация/скрытие теста
    const { school_id } = req.user;
    const testId = req.params.id;
    const { is_published } = req.body;
    try {
        const result = await db.query(
            'UPDATE career_tests SET is_published = $1, updated_at = NOW() WHERE id = $2 AND school_id = $3 RETURNING *',
            [is_published, testId, school_id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Test not found or access denied' });
        }
        // Audit log
        await db.query('INSERT INTO audit_career (action, admin_id, test_id, details) VALUES ($1, $2, $3, $4)',
            ['publish', req.user.id, testId, is_published ? 'Тест опубликован' : 'Тест скрыт']);
        res.json({ test: result.rows[0] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}
async function getCareerTests(req, res) {
    // Stub: get tests for school
    res.json({ message: 'Stub: getCareerTests', tests: [] });
}
async function getCareerResults(req, res) {
    // Stub: get student results
    res.json({ message: 'Stub: getCareerResults', results: [] });
}
async function getCareerStats(req, res) {
    // Stub: aggregated stats
    res.json({ message: 'Stub: getCareerStats', stats: {} });
}

// --- Student ---
async function getAvailableCareerTests(req, res) {
    // Stub: get available tests for student
    res.json({ message: 'Stub: getAvailableCareerTests', tests: [] });
}
async function attemptCareerTest(req, res) {
    // RBAC: только Student своей школы
    const { id: student_id } = req.user;
    const { testId } = req.params;
    const { answers } = req.body;
    try {
        // TODO: расчет баллов по сферам, radar chart
        // Сохраняем результат
        const domain_scores = {}; // stub
        const radar_json = {}; // stub
        const result = await db.query(
            'INSERT INTO career_answers (student_id, test_id, answers, domain_scores, radar_json) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [student_id, testId, answers, domain_scores, radar_json]
        );
        // Audit log
        await db.query('INSERT INTO audit_career (action, student_id, test_id, details) VALUES ($1, $2, $3, $4)',
            ['attempt', student_id, testId, 'Прохождение теста']);
        res.status(201).json({ result: result.rows[0] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}
async function getMyCareerResult(req, res) {
    // Stub: get student's own result
    res.json({ message: 'Stub: getMyCareerResult', testId: req.params.testId, result: {} });
}

// --- SuperAdmin ---
async function getGlobalCareerStats(req, res) {
    // Stub: global stats for SuperAdmin
    res.json({ message: 'Stub: getGlobalCareerStats', stats: {} });
}

module.exports = {
    createCareerTest,
    updateCareerTest,
    publishCareerTest,
    getCareerTests,
    getCareerResults,
    getCareerStats,
    getAvailableCareerTests,
    attemptCareerTest,
    getMyCareerResult,
    getGlobalCareerStats
};
