// careerModule.test.js
// Тесты для профориентационного модуля

const request = require('supertest');
const app = require('../server');

describe('Career Module API', () => {
    it('SchoolAdmin can create a career test', async () => {
        // ...mock SchoolAdmin JWT, send POST /api/career/tests
    });
    it('Student can attempt a career test', async () => {
        // ...mock Student JWT, send POST /api/career/attempt/:testId
    });
    it('Student cannot retake test if not allowed', async () => {
        // ...check retake restriction
    });
    it('SchoolAdmin can view results for their school', async () => {
        // ...GET /api/career/results
    });
    it('SuperAdmin can view global stats', async () => {
        // ...GET /api/career/global-stats
    });
});
