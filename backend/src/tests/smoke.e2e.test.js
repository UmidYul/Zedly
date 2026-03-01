const request = require('supertest');
process.env.NODE_ENV = 'test';
process.env.COOKIE_SECURE = 'false';
process.env.COOKIE_DOMAIN = '';
process.env.COOKIE_SAME_SITE = process.env.COOKIE_SAME_SITE || 'Lax';

const app = require('../server');
const { pool } = require('../config/database');

const DEFAULT_PASSWORD = process.env.SMOKE_PASSWORD || 'admin123';

function credentialCandidates(role) {
    const map = {
        school_admin: {
            usernames: [
                'admin1',
                process.env.SMOKE_ADMIN_USERNAME,
                process.env.SMOKE_SCHOOL_ADMIN_USERNAME,
            ],
            passwords: [
                DEFAULT_PASSWORD,
                process.env.SMOKE_ADMIN_PASSWORD,
                process.env.SMOKE_SCHOOL_ADMIN_PASSWORD,
            ]
        },
        teacher: {
            usernames: ['teacher1', process.env.SMOKE_TEACHER_USERNAME],
            passwords: [DEFAULT_PASSWORD, process.env.SMOKE_TEACHER_PASSWORD]
        },
        student: {
            usernames: ['student1', process.env.SMOKE_STUDENT_USERNAME],
            passwords: [DEFAULT_PASSWORD, process.env.SMOKE_STUDENT_PASSWORD]
        }
    };

    const cfg = map[role] || { usernames: [], passwords: [] };
    return {
        usernames: Array.from(new Set(cfg.usernames.filter(Boolean))),
        passwords: Array.from(new Set(cfg.passwords.filter(Boolean)))
    };
}

const context = {
    users: {},
    agents: {},
    loginError: null
};

jest.setTimeout(120000);

async function getCsrfToken(role) {
    const response = await context.agents[role]
        .get('/api/auth/csrf-token');

    if (response.status !== 200 || !response.body?.csrf_token) {
        throw new Error(`Failed to get CSRF token for role=${role}: status=${response.status}`);
    }

    return response.body.csrf_token;
}

async function loginWithFallback(role) {
    const { usernames, passwords } = credentialCandidates(role);
    const errors = [];

    if (!usernames.length || !passwords.length) {
        throw new Error(`Missing smoke credentials for role=${role}`);
    }

    for (const username of usernames) {
        for (const password of passwords) {
            const agent = request.agent(app);

            const loginResponse = await agent
                .post('/api/auth/login')
                .send({ username, password });

            if (loginResponse.status !== 200) {
                errors.push(`${username}:${loginResponse.status}`);
                continue;
            }

            if (loginResponse.body?.must_change_password) {
                errors.push(`${username}:must_change_password`);
                continue;
            }

            const meResponse = await agent.get('/api/auth/me');
            if (meResponse.status !== 200 || !meResponse.body?.user?.id) {
                errors.push(`${username}:auth_me_${meResponse.status}`);
                continue;
            }

            context.agents[role] = agent;
            context.users[role] = meResponse.body.user;
            return;
        }
    }

    throw new Error(`Unable to login as ${role}. Tried: ${errors.join(', ')}`);
}

describe('E2E smoke: auth/core flows', () => {
    beforeAll(async () => {
        try {
            await loginWithFallback('school_admin');
            await loginWithFallback('teacher');
            await loginWithFallback('student');
        } catch (error) {
            context.loginError = error;
        }
    });

    afterAll(async () => {
        try {
            await pool.end();
        } catch (_) {
            // ignore pool close errors
        }
    });

    function ensureLogin() {
        if (context.loginError) {
            throw context.loginError;
        }
    }

    test('login session established for core roles', () => {
        ensureLogin();
        expect(context.agents.school_admin).toBeTruthy();
        expect(context.agents.teacher).toBeTruthy();
        expect(context.agents.student).toBeTruthy();
    });

    test('auth/me works via cookie sessions', async () => {
        ensureLogin();
        const roles = ['school_admin', 'teacher', 'student'];

        for (const role of roles) {
            const response = await context.agents[role]
                .get('/api/auth/me');

            expect(response.status).toBe(200);
            expect(response.body?.user?.id).toBeTruthy();
            expect(response.body?.user?.role).toBeTruthy();
        }
    });

    test('import/export endpoints smoke for school admin', async () => {
        ensureLogin();
        const agent = context.agents.school_admin;

        const templateRes = await agent
            .get('/api/admin/import/template/users?type=student');
        expect(templateRes.status).toBe(200);
        expect(String(templateRes.headers['content-type'] || '')).toContain('spreadsheetml');

        const exportRes = await agent
            .get('/api/admin/export/users');
        expect(exportRes.status).toBe(200);
        expect(String(exportRes.headers['content-type'] || '')).toContain('spreadsheetml');
    });

    test('teacher assignment create/update smoke', async () => {
        ensureLogin();
        const agent = context.agents.teacher;

        const testsRes = await agent.get('/api/teacher/tests?status=active&limit=20');
        expect(testsRes.status).toBe(200);
        const tests = testsRes.body?.tests || [];
        if (!tests.length) return;

        const selectedTest = tests.find((row) => row.subject_id) || tests[0];
        if (!selectedTest?.id || !selectedTest?.subject_id) return;

        const classesRes = await agent
            .get(`/api/teacher/classes-by-subject?subject_id=${encodeURIComponent(selectedTest.subject_id)}`);
        expect(classesRes.status).toBe(200);
        const classes = classesRes.body?.classes || [];
        if (!classes.length) return;

        const targetClass = classes[0];
        const now = new Date();
        const startDate = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
        const endDate = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
        const csrfToken = await getCsrfToken('teacher');

        const assignRes = await agent
            .post('/api/teacher/assignments')
            .set('X-CSRF-Token', csrfToken)
            .send({
                test_id: selectedTest.id,
                class_ids: [targetClass.id],
                start_date: startDate,
                end_date: endDate
            });

        expect([201, 400]).toContain(assignRes.status);
    });

    test('student start attempt smoke', async () => {
        ensureLogin();
        const agent = context.agents.student;
        const assignmentsRes = await agent
            .get('/api/student/assignments?status=active');

        expect(assignmentsRes.status).toBe(200);
        const assignments = assignmentsRes.body?.assignments || [];
        if (!assignments.length) return;

        const assignmentId = assignments[0]?.id;
        if (!assignmentId) return;

        const csrfToken = await getCsrfToken('student');
        const startRes = await agent
            .post('/api/student/attempts')
            .set('X-CSRF-Token', csrfToken)
            .send({ assignment_id: assignmentId });

        expect([200, 201, 400]).toContain(startRes.status);
    });

    test('student report flow smoke', async () => {
        ensureLogin();
        const agent = context.agents.student;
        const studentId = context.users.student?.id;
        expect(studentId).toBeTruthy();

        const reportRes = await agent
            .get(`/api/analytics/student/${encodeURIComponent(studentId)}/report`);

        expect(reportRes.status).toBe(200);
        expect(reportRes.body?.student?.id).toBeTruthy();
        expect(reportRes.body?.overall).toBeTruthy();
    });
});
