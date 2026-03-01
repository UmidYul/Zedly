const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate);
router.use(authorize('psychologist'));

async function tableExists(tableName) {
    const result = await query(
        `SELECT EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name = $1
        ) AS exists`,
        [tableName]
    );
    return !!result.rows[0]?.exists;
}

async function tableHasColumn(tableName, columnName) {
    const result = await query(
        `SELECT 1
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = $1
           AND column_name = $2
         LIMIT 1`,
        [tableName, columnName]
    );
    return result.rows.length > 0;
}

function parseSubjects(raw) {
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
        return raw.split(',').map((v) => v.trim()).filter(Boolean);
    }
    return [];
}

function normalizeText(value) {
    return String(value || '').trim();
}

router.get('/students', async (req, res) => {
    try {
        const schoolId = req.user.school_id;
        const result = await query(
            `SELECT
                u.id,
                u.username,
                u.first_name,
                u.last_name,
                u.email,
                c.id AS class_id,
                c.name AS class_name
             FROM users u
             LEFT JOIN class_students cs ON cs.student_id = u.id AND cs.is_active = true
             LEFT JOIN classes c ON c.id = cs.class_id
             WHERE u.school_id = $1
               AND u.role = 'student'
               AND u.is_active = true
             ORDER BY u.last_name NULLS LAST, u.first_name NULLS LAST, u.username`,
            [schoolId]
        );

        res.json({ students: result.rows });
    } catch (error) {
        console.error('Psychologist students list error:', error);
        res.status(500).json({ error: 'server_error', message: 'Failed to fetch students' });
    }
});

router.get('/subjects', async (req, res) => {
    try {
        const schoolId = req.user.school_id;
        const hasNameRu = await tableHasColumn('subjects', 'name_ru');
        const hasNameUz = await tableHasColumn('subjects', 'name_uz');
        const hasCode = await tableHasColumn('subjects', 'code');
        const hasIsActive = await tableHasColumn('subjects', 'is_active');

        const result = await query(
            `SELECT
                id,
                ${hasNameRu ? 'name_ru' : 'name'} AS name_ru,
                ${hasNameUz ? 'name_uz' : 'name'} AS name_uz,
                ${hasCode ? 'code' : "''::text"} AS code
             FROM subjects
             WHERE school_id = $1
               ${hasIsActive ? 'AND is_active = true' : ''}
             ORDER BY ${hasCode ? 'code ASC NULLS LAST,' : ''} ${hasNameRu ? 'name_ru' : 'name'} ASC NULLS LAST`,
            [schoolId]
        );

        res.json({ subjects: result.rows });
    } catch (error) {
        console.error('Psychologist subjects list error:', error);
        res.status(500).json({ error: 'server_error', message: 'Failed to fetch subjects' });
    }
});

router.get('/dashboard/overview', async (req, res) => {
    try {
        const schoolId = req.user.school_id;
        const hasAttemptNo = await tableHasColumn('student_career_results', 'attempt_no');
        const hasCompletedAt = await tableHasColumn('student_career_results', 'completed_at');
        const hasTakenAt = await tableHasColumn('student_career_results', 'taken_at');
        const activityDateExpr = hasCompletedAt && hasTakenAt
            ? 'COALESCE(scr.completed_at, scr.taken_at)'
            : hasCompletedAt
                ? 'scr.completed_at'
                : hasTakenAt
                    ? 'scr.taken_at'
                    : 'NULL::timestamp';

        const studentsResult = await query(
            `SELECT COUNT(*)::int AS count
             FROM users
             WHERE school_id = $1
               AND role = 'student'
               AND is_active = true`,
            [schoolId]
        );

        const attemptsResult = await query(
            `SELECT COUNT(*)::int AS count
             FROM student_career_results scr
             INNER JOIN users u ON u.id = scr.student_id
             WHERE u.school_id = $1
               AND u.role = 'student'`,
            [schoolId]
        );

        const uniqueStudentsResult = await query(
            `SELECT COUNT(DISTINCT scr.student_id)::int AS count
             FROM student_career_results scr
             INNER JOIN users u ON u.id = scr.student_id
             WHERE u.school_id = $1
               AND u.role = 'student'`,
            [schoolId]
        );

        const recentResult = await query(
            `SELECT
                scr.id,
                ${activityDateExpr} AS date,
                COALESCE(
                    NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''),
                    u.username
                ) AS student_name,
                ${hasAttemptNo ? 'scr.attempt_no' : '1'} AS attempt_no
             FROM student_career_results scr
             INNER JOIN users u ON u.id = scr.student_id
             WHERE u.school_id = $1
               AND u.role = 'student'
             ORDER BY ${activityDateExpr} DESC NULLS LAST, scr.id DESC
             LIMIT 5`,
            [schoolId]
        );

        res.json({
            stats: {
                students: Number(studentsResult.rows[0]?.count || 0),
                career_attempts: Number(attemptsResult.rows[0]?.count || 0),
                students_with_results: Number(uniqueStudentsResult.rows[0]?.count || 0)
            },
            recent_activity: (recentResult.rows || []).map((row) => ({
                type: 'attempt',
                title: 'Профориентация',
                subtitle: `${row.student_name || 'Ученик'} • попытка ${row.attempt_no || 1}`,
                date: row.date
            }))
        });
    } catch (error) {
        console.error('Psychologist overview error:', error);
        res.status(500).json({ error: 'server_error', message: 'Failed to fetch dashboard overview' });
    }
});

router.get('/students/:id/career', async (req, res) => {
    try {
        const schoolId = req.user.school_id;
        const studentId = req.params.id;

        const studentCheck = await query(
            `SELECT id
             FROM users
             WHERE id = $1 AND school_id = $2 AND role = 'student'
             LIMIT 1`,
            [studentId, schoolId]
        );

        if (!studentCheck.rows.length) {
            return res.status(404).json({ error: 'not_found', message: 'Student not found' });
        }

        const result = await query(
            `SELECT
                id,
                attempt_no,
                results,
                interests_scores,
                recommended_subjects,
                top_interests,
                recommendations,
                reliability,
                COALESCE(completed_at, taken_at) AS completed_at
             FROM student_career_results
             WHERE student_id = $1
             ORDER BY COALESCE(completed_at, taken_at) DESC NULLS LAST, id DESC`,
            [studentId]
        );

        res.json({ history: result.rows });
    } catch (error) {
        console.error('Psychologist career history error:', error);
        res.status(500).json({ error: 'server_error', message: 'Failed to fetch career history' });
    }
});

router.get('/career/interests', async (req, res) => {
    try {
        const schoolId = req.user.school_id;
        const hasSchoolId = await tableHasColumn('career_interests', 'school_id');
        const hasNameRu = await tableHasColumn('career_interests', 'name_ru');
        const hasNameUz = await tableHasColumn('career_interests', 'name_uz');
        const hasDescriptionRu = await tableHasColumn('career_interests', 'description_ru');
        const hasDescriptionUz = await tableHasColumn('career_interests', 'description_uz');
        const hasSubjectKeywords = await tableHasColumn('career_interests', 'subject_keywords');
        const hasIcon = await tableHasColumn('career_interests', 'icon');
        const hasColor = await tableHasColumn('career_interests', 'color');

        const where = hasSchoolId ? 'WHERE school_id = $1' : '';
        const params = hasSchoolId ? [schoolId] : [];
        const result = await query(
            `SELECT
                id,
                ${hasNameRu ? 'name_ru' : 'name'} AS name_ru,
                ${hasNameUz ? 'name_uz' : 'name'} AS name_uz,
                ${hasDescriptionRu ? 'description_ru' : 'description'} AS description_ru,
                ${hasDescriptionUz ? 'description_uz' : 'description'} AS description_uz,
                subjects,
                ${hasIcon ? 'icon' : "''::text AS icon"},
                ${hasColor ? 'color' : "'#4A90E2'::text AS color"},
                ${hasSchoolId ? 'school_id' : 'NULL::uuid AS school_id'},
                ${hasSubjectKeywords ? 'subject_keywords' : `'[]'::jsonb AS subject_keywords`}
             FROM career_interests
             ${where}
             ORDER BY created_at DESC NULLS LAST, id DESC`,
            params
        );

        res.json({ interests: result.rows });
    } catch (error) {
        console.error('Psychologist get interests error:', error);
        res.status(500).json({ error: 'server_error', message: 'Failed to fetch interests' });
    }
});

router.post('/career/interests', async (req, res) => {
    try {
        const schoolId = req.user.school_id;
        const {
            name_ru,
            name_uz,
            description_ru = '',
            description_uz = '',
            subjects = [],
            icon = '',
            color = '#4A90E2',
            subject_keywords = []
        } = req.body || {};

        if (!String(name_ru || name_uz || '').trim()) {
            return res.status(400).json({ error: 'validation_error', message: 'name_ru or name_uz is required' });
        }

        const hasSchoolId = await tableHasColumn('career_interests', 'school_id');
        const hasNameRu = await tableHasColumn('career_interests', 'name_ru');
        const hasNameUz = await tableHasColumn('career_interests', 'name_uz');
        const hasDescriptionRu = await tableHasColumn('career_interests', 'description_ru');
        const hasDescriptionUz = await tableHasColumn('career_interests', 'description_uz');
        const hasSubjectKeywords = await tableHasColumn('career_interests', 'subject_keywords');
        const hasIcon = await tableHasColumn('career_interests', 'icon');
        const hasColor = await tableHasColumn('career_interests', 'color');

        const cols = [];
        const vals = [];
        const placeholders = [];
        let idx = 1;

        if (hasSchoolId) {
            cols.push('school_id');
            vals.push(schoolId);
            placeholders.push(`$${idx++}`);
        }

        if (hasNameRu) {
            cols.push('name_ru');
            vals.push(String(name_ru || '').trim());
            placeholders.push(`$${idx++}`);
        } else {
            cols.push('name');
            vals.push(String(name_ru || name_uz || '').trim());
            placeholders.push(`$${idx++}`);
        }

        if (hasNameUz) {
            cols.push('name_uz');
            vals.push(String(name_uz || name_ru || '').trim());
            placeholders.push(`$${idx++}`);
        }

        if (hasDescriptionRu) {
            cols.push('description_ru');
            vals.push(String(description_ru || '').trim());
            placeholders.push(`$${idx++}`);
        } else {
            cols.push('description');
            vals.push(String(description_ru || description_uz || '').trim());
            placeholders.push(`$${idx++}`);
        }

        if (hasDescriptionUz) {
            cols.push('description_uz');
            vals.push(String(description_uz || description_ru || '').trim());
            placeholders.push(`$${idx++}`);
        }

        cols.push('subjects');
        vals.push(parseSubjects(subjects));
        placeholders.push(`$${idx++}`);

        if (hasIcon) {
            cols.push('icon');
            vals.push(String(icon || '').trim());
            placeholders.push(`$${idx++}`);
        }

        if (hasColor) {
            cols.push('color');
            vals.push(String(color || '#4A90E2').trim());
            placeholders.push(`$${idx++}`);
        }

        if (hasSubjectKeywords) {
            cols.push('subject_keywords');
            vals.push(JSON.stringify(Array.isArray(subject_keywords) ? subject_keywords : []));
            placeholders.push(`$${idx++}`);
        }

        const created = await query(
            `INSERT INTO career_interests (${cols.join(', ')})
             VALUES (${placeholders.join(', ')})
             RETURNING *`,
            vals
        );

        res.status(201).json({ interest: created.rows[0] });
    } catch (error) {
        console.error('Psychologist create interest error:', error);
        res.status(500).json({ error: 'server_error', message: 'Failed to create interest' });
    }
});

router.put('/career/interests/:id', async (req, res) => {
    try {
        const schoolId = req.user.school_id;
        const id = req.params.id;
        const {
            name_ru,
            name_uz,
            description_ru,
            description_uz,
            subjects,
            icon,
            color,
            subject_keywords
        } = req.body || {};

        const hasSchoolId = await tableHasColumn('career_interests', 'school_id');
        const hasNameRu = await tableHasColumn('career_interests', 'name_ru');
        const hasNameUz = await tableHasColumn('career_interests', 'name_uz');
        const hasDescriptionRu = await tableHasColumn('career_interests', 'description_ru');
        const hasDescriptionUz = await tableHasColumn('career_interests', 'description_uz');
        const hasSubjectKeywords = await tableHasColumn('career_interests', 'subject_keywords');
        const hasIcon = await tableHasColumn('career_interests', 'icon');
        const hasColor = await tableHasColumn('career_interests', 'color');

        const updates = [];
        const values = [];
        let idx = 1;

        if (name_ru !== undefined) {
            updates.push(`${hasNameRu ? 'name_ru' : 'name'} = $${idx++}`);
            values.push(String(name_ru || '').trim());
        }
        if (hasNameUz && name_uz !== undefined) {
            updates.push(`name_uz = $${idx++}`);
            values.push(String(name_uz || '').trim());
        }
        if (description_ru !== undefined) {
            updates.push(`${hasDescriptionRu ? 'description_ru' : 'description'} = $${idx++}`);
            values.push(String(description_ru || '').trim());
        }
        if (hasDescriptionUz && description_uz !== undefined) {
            updates.push(`description_uz = $${idx++}`);
            values.push(String(description_uz || '').trim());
        }
        if (subjects !== undefined) {
            updates.push(`subjects = $${idx++}`);
            values.push(parseSubjects(subjects));
        }
        if (hasIcon && icon !== undefined) {
            updates.push(`icon = $${idx++}`);
            values.push(String(icon || '').trim());
        }
        if (hasColor && color !== undefined) {
            updates.push(`color = $${idx++}`);
            values.push(String(color || '#4A90E2').trim());
        }
        if (hasSubjectKeywords && subject_keywords !== undefined) {
            updates.push(`subject_keywords = $${idx++}`);
            values.push(JSON.stringify(Array.isArray(subject_keywords) ? subject_keywords : []));
        }

        if (!updates.length) {
            return res.status(400).json({ error: 'validation_error', message: 'No fields to update' });
        }

        values.push(id);
        let where = `id = $${idx++}`;
        if (hasSchoolId) {
            values.push(schoolId);
            where += ` AND school_id = $${idx++}`;
        }

        const updated = await query(
            `UPDATE career_interests
             SET ${updates.join(', ')}
             WHERE ${where}
             RETURNING *`,
            values
        );

        if (!updated.rows.length) {
            return res.status(404).json({ error: 'not_found', message: 'Interest not found' });
        }

        res.json({ interest: updated.rows[0] });
    } catch (error) {
        console.error('Psychologist update interest error:', error);
        res.status(500).json({ error: 'server_error', message: 'Failed to update interest' });
    }
});

router.delete('/career/interests/:id', async (req, res) => {
    try {
        const schoolId = req.user.school_id;
        const id = req.params.id;
        const hasSchoolId = await tableHasColumn('career_interests', 'school_id');
        const params = hasSchoolId ? [id, schoolId] : [id];
        const where = hasSchoolId ? 'id = $1 AND school_id = $2' : 'id = $1';

        const deleted = await query(
            `DELETE FROM career_interests
             WHERE ${where}
             RETURNING id`,
            params
        );

        if (!deleted.rows.length) {
            return res.status(404).json({ error: 'not_found', message: 'Interest not found' });
        }

        res.json({ message: 'Interest deleted' });
    } catch (error) {
        console.error('Psychologist delete interest error:', error);
        res.status(500).json({ error: 'server_error', message: 'Failed to delete interest' });
    }
});

router.get('/career/questions', async (req, res) => {
    try {
        const schoolId = req.user.school_id;
        const exists = await tableExists('career_question_bank');
        if (!exists) {
            return res.json({ questions: [] });
        }

        const result = await query(
            `SELECT
                q.id,
                q.school_id,
                q.interest_id,
                q.text_ru,
                q.text_uz,
                q.order_no,
                q.is_active,
                q.created_at,
                q.updated_at
             FROM career_question_bank q
             WHERE q.school_id = $1
             ORDER BY q.order_no ASC, q.created_at ASC`,
            [schoolId]
        );

        res.json({ questions: result.rows });
    } catch (error) {
        console.error('Psychologist get questions error:', error);
        res.status(500).json({ error: 'server_error', message: 'Failed to fetch questions' });
    }
});

router.post('/career/questions', async (req, res) => {
    try {
        const schoolId = req.user.school_id;
        const exists = await tableExists('career_question_bank');
        if (!exists) {
            return res.status(500).json({ error: 'schema_error', message: 'career_question_bank table is missing' });
        }

        const {
            interest_id,
            text_ru = '',
            text_uz = '',
            order_no = 0,
            is_active = true
        } = req.body || {};

        if (!interest_id) {
            return res.status(400).json({ error: 'validation_error', message: 'interest_id is required' });
        }

        if (!normalizeText(text_ru) && !normalizeText(text_uz)) {
            return res.status(400).json({ error: 'validation_error', message: 'text_ru or text_uz is required' });
        }

        const interestColumns = await tableExists('career_interests')
            ? await tableHasColumn('career_interests', 'school_id')
            : false;
        const interestCheck = interestColumns
            ? await query(
                `SELECT id
                 FROM career_interests
                 WHERE id = $1
                   AND (school_id = $2 OR school_id IS NULL)
                 LIMIT 1`,
                [interest_id, schoolId]
            )
            : await query(
                `SELECT id
                 FROM career_interests
                 WHERE id = $1
                 LIMIT 1`,
                [interest_id]
            );

        if (!interestCheck.rows.length) {
            return res.status(400).json({ error: 'validation_error', message: 'Interest not found for this school' });
        }

        const created = await query(
            `INSERT INTO career_question_bank (
                school_id,
                interest_id,
                text_ru,
                text_uz,
                order_no,
                is_active,
                created_by
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *`,
            [
                schoolId,
                interest_id,
                normalizeText(text_ru),
                normalizeText(text_uz),
                Number.isFinite(Number(order_no)) ? Number(order_no) : 0,
                is_active !== false,
                req.user.id
            ]
        );

        res.status(201).json({ question: created.rows[0] });
    } catch (error) {
        console.error('Psychologist create question error:', error);
        res.status(500).json({ error: 'server_error', message: 'Failed to create question' });
    }
});

router.put('/career/questions/:id', async (req, res) => {
    try {
        const schoolId = req.user.school_id;
        const exists = await tableExists('career_question_bank');
        if (!exists) {
            return res.status(500).json({ error: 'schema_error', message: 'career_question_bank table is missing' });
        }

        const id = req.params.id;
        const {
            interest_id,
            text_ru,
            text_uz,
            order_no,
            is_active
        } = req.body || {};

        const updates = [];
        const values = [];
        let idx = 1;

        if (interest_id !== undefined) {
            updates.push(`interest_id = $${idx++}`);
            values.push(interest_id);
        }
        if (text_ru !== undefined) {
            updates.push(`text_ru = $${idx++}`);
            values.push(normalizeText(text_ru));
        }
        if (text_uz !== undefined) {
            updates.push(`text_uz = $${idx++}`);
            values.push(normalizeText(text_uz));
        }
        if (order_no !== undefined) {
            updates.push(`order_no = $${idx++}`);
            values.push(Number.isFinite(Number(order_no)) ? Number(order_no) : 0);
        }
        if (is_active !== undefined) {
            updates.push(`is_active = $${idx++}`);
            values.push(Boolean(is_active));
        }

        if (!updates.length) {
            return res.status(400).json({ error: 'validation_error', message: 'No fields to update' });
        }

        updates.push('updated_at = NOW()');
        values.push(id);
        values.push(schoolId);

        const updated = await query(
            `UPDATE career_question_bank
             SET ${updates.join(', ')}
             WHERE id = $${idx++}
               AND school_id = $${idx}
             RETURNING *`,
            values
        );

        if (!updated.rows.length) {
            return res.status(404).json({ error: 'not_found', message: 'Question not found' });
        }

        res.json({ question: updated.rows[0] });
    } catch (error) {
        console.error('Psychologist update question error:', error);
        res.status(500).json({ error: 'server_error', message: 'Failed to update question' });
    }
});

router.delete('/career/questions/:id', async (req, res) => {
    try {
        const schoolId = req.user.school_id;
        const exists = await tableExists('career_question_bank');
        if (!exists) {
            return res.status(500).json({ error: 'schema_error', message: 'career_question_bank table is missing' });
        }

        const result = await query(
            `DELETE FROM career_question_bank
             WHERE id = $1
               AND school_id = $2
             RETURNING id`,
            [req.params.id, schoolId]
        );

        if (!result.rows.length) {
            return res.status(404).json({ error: 'not_found', message: 'Question not found' });
        }

        res.json({ message: 'Question deleted' });
    } catch (error) {
        console.error('Psychologist delete question error:', error);
        res.status(500).json({ error: 'server_error', message: 'Failed to delete question' });
    }
});

module.exports = router;
