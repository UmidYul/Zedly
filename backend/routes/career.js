// Профориентация: API endpoints

/** RBAC: SchoolAdmin, Student, SuperAdmin (только статистика) */

const express = require('express');
const router = express.Router();
const { requireRole, requireSchool, requireStudent } = require('../src/middleware/rbac');
const careerHandlers = require('../src/routes/careerHandlers');

// --- SchoolAdmin ---
// Создать тест
// Редактировать тест
// Публикация/скрытие теста
// Получить все тесты своей школы
// Получить результаты учеников
// Агрегированная статистика
router.post('/career/tests', requireRole('SchoolAdmin'), requireSchool, careerHandlers.createCareerTest);
router.put('/career/tests/:id', requireRole('SchoolAdmin'), requireSchool, careerHandlers.updateCareerTest);
router.patch('/career/tests/:id/publish', requireRole('SchoolAdmin'), requireSchool, careerHandlers.publishCareerTest);
router.get('/career/tests', requireRole('SchoolAdmin'), requireSchool, careerHandlers.getCareerTests);
router.get('/career/results', requireRole('SchoolAdmin'), requireSchool, careerHandlers.getCareerResults);
router.get('/career/stats', requireRole('SchoolAdmin'), requireSchool, careerHandlers.getCareerStats);

// --- Student ---
// Получить доступные тесты
// Пройти тест
// Получить свой результат
router.get('/career/available', requireRole('Student'), requireStudent, careerHandlers.getAvailableCareerTests);
router.post('/career/attempt/:testId', requireRole('Student'), requireStudent, careerHandlers.attemptCareerTest);
router.get('/career/my-result/:testId', requireRole('Student'), requireStudent, careerHandlers.getMyCareerResult);

// --- SuperAdmin ---
// Глобальная статистика (без редактирования)
router.get('/career/global-stats', requireRole('SuperAdmin'), careerHandlers.getGlobalCareerStats);

module.exports = router;

// ...handlers реализовать отдельно
