// careerHandlers.js
// Реализация логики профориентационного модуля

const db = require('../config/database');

// --- SchoolAdmin ---
async function createCareerTest(req, res) {
    // RBAC: только SchoolAdmin своей школы
    let { school_id } = req.user;
    const { title_ru, title_uz, description_ru, description_uz, questions } = req.body;
    // Привести school_id к строке (UUID)
    if (typeof school_id !== 'string') {
        school_id = String(school_id);
    }
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        const result = await client.query(
            'INSERT INTO career_tests (school_id, title_ru, title_uz, description_ru, description_uz) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [school_id, title_ru, title_uz, description_ru, description_uz]
        );
        const test = result.rows[0];
        // Вставка вопросов, если есть
        if (Array.isArray(questions) && questions.length > 0) {
            for (let i = 0; i < questions.length; i++) {
                const q = questions[i];
                await client.query(
                    'INSERT INTO career_test_questions (test_id, question_text_ru, question_text_uz, options, order_number) VALUES ($1, $2, $3, $4, $5)',
                    [test.id, q.question_text_ru, q.question_text_uz, JSON.stringify(q.options), q.order_number ?? (i + 1)]
                );
            }
        }
        // Audit log
        await client.query('INSERT INTO audit_career (action, admin_id, test_id, details) VALUES ($1, $2, $3, $4)',
            ['create', req.user.id, test.id, 'Создан тест']);
        await client.query('COMMIT');
        res.status(201).json({ test });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
}
async function updateCareerTest(req, res) {
    // Обновление теста профориентации
    let { school_id } = req.user;
    const testId = req.params.id;
    const { title_ru, title_uz, description_ru, description_uz } = req.body;
    // Привести school_id к строке (UUID)
    if (typeof school_id !== 'string') {
        school_id = String(school_id);
    }
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
    let { school_id } = req.user;
    const testId = req.params.id;
    const { is_published } = req.body;
    // Привести school_id к строке (UUID)
    if (typeof school_id !== 'string') {
        school_id = String(school_id);
    }
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
    // Проверка school_id
    if (!req.user.school_id) {
        return res.status(403).json({ error: 'Access denied: school_id required' });
    }
    let { school_id } = req.user;
    const { lang } = req.query; // lang=ru или lang=uz
    // Привести school_id к строке (UUID)
    if (typeof school_id !== 'string') {
        school_id = String(school_id);
    }
    // Получить все тесты своей школы с локализацией
    console.log(school_id, typeof school_id);
    // Audit log: просмотр тестов
    await db.query('INSERT INTO audit_career (action, admin_id, details) VALUES ($1, $2, $3)', ['view_tests', req.user.id, 'Просмотр тестов']);

    try {
        const result = await db.query(
            'SELECT * FROM career_tests WHERE school_id = $1 ORDER BY created_at DESC',
            [school_id]
        );
        const tests = result.rows.map(test => ({
            id: test.id,
            title: lang === 'uz' ? test.title_uz : test.title_ru,
            description: lang === 'uz' ? test.description_uz : test.description_ru,
            ...test
        }));
        res.json({ tests });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}
async function getCareerResults(req, res) {
    // Проверка school_id
    if (!req.user.school_id) {
        return res.status(403).json({ error: 'Access denied: school_id required' });
    }
    // Audit log: просмотр результатов
    await db.query('INSERT INTO audit_career (action, admin_id, details) VALUES ($1, $2, $3)', ['view_results', req.user.id, 'Просмотр результатов']);
    // Получить результаты учеников своей школы
    const { school_id } = req.user;
    try {
        const result = await db.query(
            `SELECT ca.*, ct.title_ru, ct.title_uz, ct.description_ru, ct.description_uz
             FROM career_answers ca
             JOIN career_tests ct ON ca.test_id = ct.id
             WHERE ct.school_id = $1
             ORDER BY ca.created_at DESC`,
            [school_id]
        );
        res.json({ results: result.rows });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}
async function getCareerStats(req, res) {
    // Проверка school_id
    if (!req.user.school_id) {
        return res.status(403).json({ error: 'Access denied: school_id required' });
    }
    // Audit log: просмотр статистики
    await db.query('INSERT INTO audit_career (action, admin_id, details) VALUES ($1, $2, $3)', ['view_stats', req.user.id, 'Просмотр статистики']);
    // Аналитика по классам и популярным сферам
    const { school_id } = req.user;
    try {
        // Получить распределение интересов по классам
        const classStats = await db.query(
            `SELECT ca.student_id, ca.domain_scores, c.name AS class_name
             FROM career_answers ca
             JOIN career_tests ct ON ca.test_id = ct.id
             LEFT JOIN class_students cs ON ca.student_id = cs.student_id
             LEFT JOIN classes c ON cs.class_id = c.id
             WHERE ct.school_id = $1`,
            [school_id]
        );
        // Подсчитать топ-сферы по школе
        const domainTotals = {};
        classStats.rows.forEach(row => {
            const scores = row.domain_scores;
            if (scores) {
                Object.entries(scores).forEach(([domain, value]) => {
                    domainTotals[domain] = (domainTotals[domain] || 0) + value;
                });
            }
        });
        const sortedDomains = Object.entries(domainTotals).sort((a, b) => b[1] - a[1]);
        const topDomains = sortedDomains.slice(0, 3).map(([name, value]) => ({ name, value }));
        res.json({
            classStats: classStats.rows,
            topDomains
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

// --- Student ---
async function getAvailableCareerTests(req, res) {
    // Проверка school_id
    if (!req.user.school_id) {
        return res.status(403).json({ error: 'Access denied: school_id required' });
    }
    // Audit log: просмотр доступных тестов
    await db.query('INSERT INTO audit_career (action, student_id, details) VALUES ($1, $2, $3)', ['view_available', req.user.id, 'Просмотр доступных тестов']);
    // Получить опубликованные тесты для студента с локализацией
    const { school_id } = req.user;
    const { lang } = req.query;
    try {
        const result = await db.query(
            'SELECT * FROM career_tests WHERE school_id = $1 AND is_published = TRUE ORDER BY created_at DESC',
            [school_id]
        );
        const tests = result.rows.map(test => ({
            id: test.id,
            title: lang === 'uz' ? test.title_uz : test.title_ru,
            description: lang === 'uz' ? test.description_uz : test.description_ru,
            ...test
        }));
        res.json({ tests });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}
async function attemptCareerTest(req, res) {
    // Проверка school_id
    if (!req.user.school_id) {
        return res.status(403).json({ error: 'Access denied: school_id required' });
    }
    // RBAC: только Student своей школы
    const { id: student_id, school_id } = req.user;
    const { testId } = req.params;
    const { answers } = req.body;
    try {
        // Проверка: тест принадлежит школе и опубликован
        const testRes = await db.query('SELECT * FROM career_tests WHERE id = $1 AND school_id = $2 AND is_published = TRUE', [testId, school_id]);
        if (testRes.rows.length === 0) {
            return res.status(403).json({ error: 'Access denied or test not found' });
        }
        // Проверка: есть ли уже результат
        const historyRes = await db.query('SELECT * FROM career_answers WHERE student_id = $1 AND test_id = $2', [student_id, testId]);
        if (historyRes.rows.length > 0) {
            return res.status(403).json({ error: 'Retake not allowed. Contact school admin.' });
        }
        // --- Расчет баллов по сферам ---
        // answers: [{question_id, value, domains: [{name, weight}], ...}]
        const domains = [
            'IT', 'Медицина', 'Инженерия', 'Экономика', 'Искусство', 'Гуманитарные', 'Право', 'Образование', 'Наука'
        ];
        const domain_scores = {};
        domains.forEach(d => domain_scores[d] = 0);
        answers.forEach(ans => {
            if (ans.domains && Array.isArray(ans.domains)) {
                ans.domains.forEach(dom => {
                    // value: 1 (Да/Согласен/Очень похоже), 0.5 (Иногда/Частично/Не уверен), 0 (Нет/Не про меня/Не согласен)
                    domain_scores[dom.name] += (ans.value * dom.weight);
                });
            }
        });
        // --- Radar chart JSON ---
        const radar_json = {
            labels: domains,
            data: domains.map(d => domain_scores[d]),
        };
        // --- Топ-3 сферы и рекомендации ---
        const sortedDomains = Object.entries(domain_scores).sort((a, b) => b[1] - a[1]);
        const top3 = sortedDomains.slice(0, 3).map(([name, score]) => ({ name, score }));
        const domainToSubjects = {
            'IT': ['Информатика', 'Алгебра', 'Физика'],
            'Медицина': ['Биология', 'Химия'],
            'Инженерия': ['Физика', 'Математика'],
            'Экономика': ['Математика', 'Обществознание'],
            'Искусство': ['Литература', 'Изобразительное искусство'],
            'Гуманитарные': ['История', 'Литература'],
            'Право': ['Обществознание', 'История'],
            'Образование': ['Педагогика', 'Психология'],
            'Наука': ['Физика', 'Химия', 'Математика']
        };
        const recommendations = top3.map(({ name }) => ({
            domain: name,
            subjects: domainToSubjects[name] || []
        }));
        // --- Сохраняем результат ---
        const result = await db.query(
            'INSERT INTO career_answers (student_id, test_id, answers, domain_scores, radar_json) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [student_id, testId, JSON.stringify(answers), JSON.stringify(domain_scores), JSON.stringify(radar_json)]
        );
        // Audit log
        await db.query('INSERT INTO audit_career (action, student_id, test_id, details) VALUES ($1, $2, $3, $4)',
            ['attempt', student_id, testId, 'Прохождение теста']);
        res.status(201).json({
            result: result.rows[0],
            radar: radar_json,
            top3,
            recommendations
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}
async function getMyCareerResult(req, res) {
    // Проверка school_id
    if (!req.user.school_id) {
        return res.status(403).json({ error: 'Access denied: school_id required' });
    }
    // Audit log: просмотр своего результата
    await db.query('INSERT INTO audit_career (action, student_id, details) VALUES ($1, $2, $3)', ['view_my_result', req.user.id, 'Просмотр своего результата']);
    // Получить результат студента по тесту с локализацией
    const { id: student_id } = req.user;
    const testId = req.params.testId;
    const { lang } = req.query;
    try {
        const result = await db.query(
            'SELECT ca.*, ct.title_ru, ct.title_uz, ct.description_ru, ct.description_uz FROM career_answers ca JOIN career_tests ct ON ca.test_id = ct.id WHERE ca.student_id = $1 AND ca.test_id = $2 ORDER BY ca.created_at DESC LIMIT 1',
            [student_id, testId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Result not found' });
        }
        const row = result.rows[0];
        res.json({
            result: {
                ...row,
                title: lang === 'uz' ? row.title_uz : row.title_ru,
                description: lang === 'uz' ? row.description_uz : row.description_ru
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

// --- SuperAdmin ---
async function getGlobalCareerStats(req, res) {
    // Глобальная статистика по всем тестам
    try {
        const result = await db.query(
            `SELECT test_id, COUNT(*) as attempts, AVG((answers->>'score')::float) as avg_score
             FROM career_answers
             GROUP BY test_id`,
            []
        );
        res.json({ stats: result.rows });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
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
