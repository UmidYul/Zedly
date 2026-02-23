const express = require('express');
const request = require('supertest');

const mockQuery = jest.fn();
const mockGetTableColumns = jest.fn();
const mockGetSchoolNameExpr = jest.fn();

jest.mock('../config/database', () => ({
    query: (...args) => mockQuery(...args)
}));

jest.mock('../middleware/auth', () => ({
    authenticate: (req, res, next) => {
        req.user = {
            id: '00000000-0000-0000-0000-000000000001',
            username: 'superadmin',
            role: 'superadmin'
        };
        next();
    },
    authorize: () => (req, res, next) => next()
}));

jest.mock('../utils/notifications', () => ({
    notifyNewUser: jest.fn(),
    notifyPasswordReset: jest.fn(),
    notifySystemChange: jest.fn(),
    getRoleNotificationDefaultsMap: jest.fn(),
    invalidateNotificationDefaultsCache: jest.fn()
}));

jest.mock('../utils/db', () => ({
    getTableColumns: (...args) => mockGetTableColumns(...args),
    pickColumn: jest.fn(),
    getSchoolNameExpr: (...args) => mockGetSchoolNameExpr(...args)
}));

jest.mock('./careerHandlers', () => ({
    getGlobalCareerStats: jest.fn((req, res) => res.json({ ok: true }))
}));

const superadminRouter = require('./superadmin');

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/superadmin', superadminRouter);
    return app;
}

describe('SuperAdmin geo/profile extensions', () => {
    const app = buildApp();

    beforeEach(() => {
        mockQuery.mockReset();
        mockGetTableColumns.mockReset();
        mockGetSchoolNameExpr.mockReset();

        mockGetSchoolNameExpr.mockResolvedValue('s.name');
        mockGetTableColumns.mockImplementation(async (tableName) => {
            if (tableName === 'schools') {
                return new Set([
                    'id',
                    'name',
                    'address',
                    'phone',
                    'email',
                    'settings',
                    'is_active',
                    'created_at',
                    'updated_at',
                    'region_code',
                    'city_code',
                    'school_type',
                    'ownership',
                    'language_model',
                    'study_shift',
                    'capacity',
                    'opened_year'
                ]);
            }

            if (tableName === 'test_attempts') {
                return new Set(['id', 'assignment_id', 'percentage', 'status', 'submitted_at']);
            }

            if (tableName === 'tests') {
                return new Set(['id', 'school_id', 'title']);
            }

            return new Set();
        });
    });

    test('POST /api/superadmin/schools without region/city returns 400', async () => {
        const response = await request(app)
            .post('/api/superadmin/schools')
            .send({
                name: 'School without geo'
            });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('validation_error');
        expect(response.body.details).toEqual(expect.any(Array));
    });

    test('POST /api/superadmin/schools with city outside region returns 400', async () => {
        const response = await request(app)
            .post('/api/superadmin/schools')
            .send({
                name: 'Invalid geo school',
                region_code: 'samarkand',
                city_code: 'zangiota'
            });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('validation_error');
        expect(response.body.details?.[0]?.code).toBe('city_not_in_region');
    });

    test('POST /api/superadmin/schools with valid geo/profile returns 201 and payload includes new fields', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({
                rows: [{
                    id: '00000000-0000-0000-0000-000000000111',
                    name: 'Geo School',
                    address: 'Address',
                    phone: '+998901234567',
                    email: 'school@example.uz',
                    settings: {},
                    region_code: 'samarkand',
                    city_code: 'urgut',
                    school_type: 'general',
                    ownership: 'state',
                    language_model: 'uzbek',
                    study_shift: 'double',
                    capacity: 1200,
                    opened_year: 1998,
                    is_active: true,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }]
            })
            .mockResolvedValueOnce({ rows: [] });

        const response = await request(app)
            .post('/api/superadmin/schools')
            .send({
                name: 'Geo School',
                address: 'Address',
                phone: '+998901234567',
                email: 'school@example.uz',
                region_code: 'samarkand',
                city_code: 'urgut',
                school_type: 'general',
                ownership: 'state',
                language_model: 'uzbek',
                study_shift: 'double',
                capacity: 1200,
                opened_year: 1998
            });

        expect(response.status).toBe(201);
        expect(response.body.school.region_code).toBe('samarkand');
        expect(response.body.school.city_code).toBe('urgut');
        expect(response.body.school.school_type).toBe('general');
        expect(response.body.school.region_name_ru).toBeTruthy();
        expect(response.body.school.city_name_ru).toBeTruthy();
    });

    test('PUT /api/superadmin/schools/:id updates geo/profile', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [{ id: '00000000-0000-0000-0000-000000000111' }] })
            .mockResolvedValueOnce({
                rows: [{
                    id: '00000000-0000-0000-0000-000000000111',
                    name: 'Updated School',
                    region_code: 'tashkent_region',
                    city_code: 'zangiota',
                    school_type: 'specialized',
                    ownership: 'private',
                    language_model: 'mixed',
                    study_shift: 'single',
                    capacity: 900,
                    opened_year: 2005,
                    settings: {},
                    is_active: true,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }]
            })
            .mockResolvedValueOnce({ rows: [] });

        const response = await request(app)
            .put('/api/superadmin/schools/00000000-0000-0000-0000-000000000111')
            .send({
                region_code: 'tashkent_region',
                city_code: 'zangiota',
                school_type: 'specialized',
                ownership: 'private',
                language_model: 'mixed',
                study_shift: 'single',
                capacity: 900,
                opened_year: 2005
            });

        expect(response.status).toBe(200);
        expect(response.body.school.region_code).toBe('tashkent_region');
        expect(response.body.school.city_code).toBe('zangiota');
        expect(response.body.school.study_shift).toBe('single');
    });

    test('GET /api/superadmin/reference/locations returns locations dictionary', async () => {
        const response = await request(app).get('/api/superadmin/reference/locations');

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body.regions)).toBe(true);
        expect(response.body.regions.length).toBeGreaterThan(0);
        expect(Array.isArray(response.body.regions[0].cities)).toBe(true);
    });

    test('GET /api/superadmin/analytics/geo/overview returns coverage and by_region', async () => {
        mockQuery
            .mockResolvedValueOnce({
                rows: [{
                    total_schools: 10,
                    geo_filled: 8,
                    geo_unknown: 2,
                    profile_filled: 6
                }]
            })
            .mockResolvedValueOnce({
                rows: [{
                    schools: 10,
                    users: 120,
                    tests: 40,
                    attempts: 200,
                    completed_attempts: 170,
                    avg_score: 76.2,
                    completion_rate: 85
                }]
            })
            .mockResolvedValueOnce({
                rows: [{
                    region_code: 'samarkand',
                    schools_count: 5,
                    users_total: 60,
                    students_total: 50,
                    teachers_total: 10,
                    active_schools: 4,
                    attempts_total: 120,
                    completed_attempts: 100,
                    avg_score: 82.3
                }]
            })
            .mockResolvedValueOnce({
                rows: [{
                    region_code: 'samarkand',
                    city_code: 'urgut',
                    schools_count: 2,
                    users_total: 20,
                    attempts_total: 40,
                    completed_attempts: 30,
                    avg_score: 79.5
                }]
            })
            .mockResolvedValueOnce({ rows: [{ value_code: 'general', schools_count: 5 }] })
            .mockResolvedValueOnce({ rows: [{ value_code: 'state', schools_count: 6 }] })
            .mockResolvedValueOnce({ rows: [{ value_code: 'uzbek', schools_count: 7 }] })
            .mockResolvedValueOnce({ rows: [{ value_code: 'single', schools_count: 4 }] });

        const response = await request(app)
            .get('/api/superadmin/analytics/geo/overview?period=30');

        expect(response.status).toBe(200);
        expect(response.body.coverage).toBeTruthy();
        expect(Array.isArray(response.body.by_region)).toBe(true);
        expect(response.body.by_region[0].region_code).toBe('samarkand');
    });

    test('GET /api/superadmin/comparison?dimension=region returns region aggregates', async () => {
        mockQuery.mockResolvedValueOnce({
            rows: [{
                dimension_code: 'samarkand',
                raw_name: 'samarkand',
                region_code: 'samarkand',
                city_code: 'urgut',
                total_attempts: 50,
                completed_attempts: 45,
                avg_score: 84.2
            }]
        });

        const response = await request(app)
            .get('/api/superadmin/comparison?metric=avg_score&period=month&dimension=region');

        expect(response.status).toBe(200);
        expect(response.body.dimension).toBe('region');
        expect(Array.isArray(response.body.schools)).toBe(true);
        expect(response.body.schools[0].dimension_code).toBe('samarkand');
    });
});
