const request = require('supertest');
const app = require('../server');

const DEFAULT_PASSWORD = process.env.SMOKE_PASSWORD || 'admin123';

const credentialCandidates = {
    superadmin: [
        process.env.SMOKE_SUPERADMIN_USERNAME,
        'superadmin'
    ].filter(Boolean),
    school_admin: [
        process.env.SMOKE_ADMIN_USERNAME,
        'admin1'
    ].filter(Boolean),
    teacher: [
        process.env.SMOKE_TEACHER_USERNAME,
        'teacher1'
    ].filter(Boolean),
    student: [
        process.env.SMOKE_STUDENT_USERNAME,
        'student1'
    ].filter(Boolean)
};

const context = {
    users: {},
    tokens: {},
    createdAssignmentId: null,
    loginError: null
};

jest.setTimeout(120000);

function authHeader(token) {
    return { Authorization: `Bearer ${token}` };
}

async function loginWithFallback(role) {
    const usernames = credentialCandidates[role] || [];
    const errors = [];

    for (const username of usernames) {
        const response = await request(app)
            .post('/api/auth/login')
            .send({ username, password: DEFAULT_PASSWORD });

        if (response.status !== 200) {
            errors.push(`${username}: ${response.status}`);
            continue;
        }

        const body = response.body || {};
        if (body.must_change_password) {
            errors.push(`${username}: must_change_password`);
            continue;
        }

        if (!body.access_token || !body.user?.id) {
            errors.push(`${username}: missing access token`);
            continue;
        }

        context.tokens[role] = body.access_token;
        context.users[role] = body.user;
        return;
    }

    throw new Error(`Unable to login as ${role}. Tried: ${errors.join(', ')}`);
}

describe('E2E smoke: login/import/assign/take/report', () => {
    beforeAll(async () => {
        try {
            await loginWithFallback('school_admin');
            await loginWithFallback('teacher');
            await loginWithFallback('student');
        } catch (error) {
            context.loginError = error;
        }
    });

    function ensureLogin() {
        if (context.loginError) {
            throw context.loginError;
        }
    }

    test('login flow for core roles', async () => {
        ensureLogin();
        expect(context.tokens.school_admin).toBeTruthy();
        expect(context.tokens.teacher).toBeTruthy();
        expect(context.tokens.student).toBeTruthy();
    });

    test('auth/me works for logged in users', async () => {
        ensureLogin();
        const roles = ['school_admin', 'teacher', 'student'];
        for (const role of roles) {
            const response = await request(app)
                .get('/api/auth/me')
                .set(authHeader(context.tokens[role]));

            expect(response.status).toBe(200);
            expect(response.body?.user?.id).toBeTruthy();
            expect(response.body?.user?.role).toBeTruthy();
        }
    });

    test('import/export endpoints smoke for school admin', async () => {
        ensureLogin();
        const token = context.tokens.school_admin;

        const templateRes = await request(app)
            .get('/api/admin/import/template/users?type=student')
            .set(authHeader(token));
        expect(templateRes.status).toBe(200);
        expect(String(templateRes.headers['content-type'] || '')).toContain('spreadsheetml');

        const exportRes = await request(app)
            .get('/api/admin/export/users')
            .set(authHeader(token));
        expect(exportRes.status).toBe(200);
        expect(String(exportRes.headers['content-type'] || '')).toContain('spreadsheetml');
    });

    test('teacher assignment flow smoke', async () => {
        ensureLogin();
        const token = context.tokens.teacher;
        const testsRes = await request(app)
            .get('/api/teacher/tests?status=active&limit=20')
            .set(authHeader(token));

        expect(testsRes.status).toBe(200);
        const tests = testsRes.body?.tests || [];
        if (!tests.length) {
            return;
        }

        const selectedTest = tests.find((row) => row.subject_id) || tests[0];
        if (!selectedTest?.id || !selectedTest?.subject_id) {
            return;
        }

        const classesRes = await request(app)
            .get(`/api/teacher/classes-by-subject?subject_id=${encodeURIComponent(selectedTest.subject_id)}`)
            .set(authHeader(token));
        expect(classesRes.status).toBe(200);

        const classes = classesRes.body?.classes || [];
        if (!classes.length) {
            return;
        }

        const targetClass = classes[0];
        const now = new Date();
        const startDate = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
        const endDate = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

        const assignRes = await request(app)
            .post('/api/teacher/assignments')
            .set(authHeader(token))
            .send({
                test_id: selectedTest.id,
                class_ids: [targetClass.id],
                start_date: startDate,
                end_date: endDate
            });

        if (assignRes.status === 201) {
            const created = assignRes.body?.assignments || [];
            if (created.length > 0) {
                context.createdAssignmentId = created[0].id;
            }
            expect(assignRes.body?.message).toBeTruthy();
            return;
        }

        expect(assignRes.status).toBe(400);
    });

    test('student take flow smoke', async () => {
        ensureLogin();
        const token = context.tokens.student;
        const assignmentsRes = await request(app)
            .get('/api/student/assignments?status=active')
            .set(authHeader(token));

        expect(assignmentsRes.status).toBe(200);
        const assignments = assignmentsRes.body?.assignments || [];
        if (!assignments.length) {
            return;
        }

        const assignmentId = assignments[0]?.id;
        if (!assignmentId) {
            return;
        }

        const startRes = await request(app)
            .post('/api/student/tests/start')
            .set(authHeader(token))
            .send({ assignment_id: assignmentId });

        expect([200, 400]).toContain(startRes.status);
    });

    test('student report flow smoke', async () => {
        ensureLogin();
        const token = context.tokens.student;
        const studentId = context.users.student?.id;
        expect(studentId).toBeTruthy();

        const reportRes = await request(app)
            .get(`/api/analytics/student/${encodeURIComponent(studentId)}/report`)
            .set(authHeader(token));

        expect(reportRes.status).toBe(200);
        expect(reportRes.body?.student?.id).toBeTruthy();
        expect(reportRes.body?.overall).toBeTruthy();
    });
});
