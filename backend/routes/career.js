const express = require('express');
const { authenticate, authorize } = require('../src/middleware/auth');
const careerHandlers = require('../src/routes/careerHandlers');

const router = express.Router();

router.use(authenticate);

// School admin scope
router.post('/tests', authorize('school_admin'), careerHandlers.createCareerTest);
router.put('/tests/:id', authorize('school_admin'), careerHandlers.updateCareerTest);
router.patch('/tests/:id/publish', authorize('school_admin'), careerHandlers.publishCareerTest);
router.get('/tests', authorize('school_admin'), careerHandlers.getCareerTests);
router.get('/results', authorize('school_admin'), careerHandlers.getCareerResults);
router.get('/stats', authorize('school_admin'), careerHandlers.getCareerStats);

// Student scope
router.get('/available', authorize('student'), careerHandlers.getAvailableCareerTests);
router.post('/attempt/:testId', authorize('student'), careerHandlers.attemptCareerTest);
router.get('/my-result/:testId', authorize('student'), careerHandlers.getMyCareerResult);

// Superadmin scope
router.get('/global-stats', authorize('superadmin'), careerHandlers.getGlobalCareerStats);

module.exports = router;
