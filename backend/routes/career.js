// Профориентация: API endpoints

/** RBAC: SchoolAdmin, Student, SuperAdmin (только статистика) */

const express = require('express');
const router = express.Router();
const rbac = require('../src/middleware/rbac');
const careerHandlers = require('../src/routes/careerHandlers');

// --- SchoolAdmin ---
// Создать тест
// Редактировать тест
// Публикация/скрытие теста
// Получить все тесты своей школы
// Получить результаты учеников
// Агрегированная статистика
router.post('/career/tests', rbac(['SchoolAdmin']), careerHandlers.createCareerTest);
router.put('/career/tests/:id', rbac(['SchoolAdmin']), careerHandlers.updateCareerTest);
router.patch('/career/tests/:id/publish', rbac(['SchoolAdmin']), careerHandlers.publishCareerTest);
router.get('/career/tests', rbac(['SchoolAdmin']), careerHandlers.getCareerTests);
router.get('/career/results', rbac(['SchoolAdmin']), careerHandlers.getCareerResults);
router.get('/career/stats', rbac(['SchoolAdmin']), careerHandlers.getCareerStats);

// --- Student ---
// Получить доступные тесты
// Пройти тест
// Получить свой результат
router.get('/career/available', rbac(['Student']), careerHandlers.getAvailableCareerTests);
router.post('/career/attempt/:testId', rbac(['Student']), careerHandlers.attemptCareerTest);
router.get('/career/my-result/:testId', rbac(['Student']), careerHandlers.getMyCareerResult);

// --- SuperAdmin ---
// Глобальная статистика (без редактирования)
router.get('/career/global-stats', rbac(['SuperAdmin']), careerHandlers.getGlobalCareerStats);

module.exports = router;

// ...handlers реализовать отдельно
