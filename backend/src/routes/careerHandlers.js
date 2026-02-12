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
    // ...редактирование теста
}
async function publishCareerTest(req, res) {
    // ...публикация/скрытие теста
}
async function getCareerTests(req, res) {
    // ...получить тесты своей школы
}
async function getCareerResults(req, res) {
    // ...результаты учеников
}
async function getCareerStats(req, res) {
    // ...агрегированная статистика
}

// --- Student ---
async function getAvailableCareerTests(req, res) {
    // ...доступные тесты
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
    // ...получить свой результат
}

// --- SuperAdmin ---
async function getGlobalCareerStats(req, res) {
    // ...глобальная статистика
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
