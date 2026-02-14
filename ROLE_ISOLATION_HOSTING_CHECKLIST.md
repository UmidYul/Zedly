# Role Isolation Hosting Checklist

Use this checklist on production/staging host where DB and real `.env` are available.

## 1. Preparation

1. Get 3 valid users and tokens:
- `school_admin` (same school as teacher)
- `teacher` (with at least one assigned class)
- `student` (from teacher class)

2. Optional negative users:
- `student_other` (not in teacher scope)
- `teacher_other_school` or data from another school

3. Set base URL and tokens:

```bash
BASE_URL="https://your-domain.com"
ADMIN_TOKEN="..."
TEACHER_TOKEN="..."
STUDENT_TOKEN="..."
STUDENT_ID_IN_SCOPE="..."
STUDENT_ID_OUT_OF_SCOPE="..."
CLASS_ID_IN_SCOPE="..."
CLASS_ID_OUT_OF_SCOPE="..."
ASSIGNMENT_ID_TEACHER="..."
ATTEMPT_ID_TEACHER="..."
```

## 2. Quick API Checks (Expected Status)

1. Teacher can access own class analytics (`200`):

```bash
curl -i -H "Authorization: Bearer $TEACHER_TOKEN" \
  "$BASE_URL/api/analytics/class/$CLASS_ID_IN_SCOPE/detailed"
```

2. Teacher cannot access foreign class analytics (`403` or `404`):

```bash
curl -i -H "Authorization: Bearer $TEACHER_TOKEN" \
  "$BASE_URL/api/analytics/class/$CLASS_ID_OUT_OF_SCOPE/detailed"
```

3. Teacher can access in-scope student report (`200`):

```bash
curl -i -H "Authorization: Bearer $TEACHER_TOKEN" \
  "$BASE_URL/api/analytics/student/$STUDENT_ID_IN_SCOPE/report"
```

4. Teacher cannot access out-of-scope student report (`403`):

```bash
curl -i -H "Authorization: Bearer $TEACHER_TOKEN" \
  "$BASE_URL/api/analytics/student/$STUDENT_ID_OUT_OF_SCOPE/report"
```

5. Student can access only own report (`200`):

```bash
curl -i -H "Authorization: Bearer $STUDENT_TOKEN" \
  "$BASE_URL/api/analytics/student/$STUDENT_ID_IN_SCOPE/report"
```

6. Student cannot access another student report (`403`):

```bash
curl -i -H "Authorization: Bearer $STUDENT_TOKEN" \
  "$BASE_URL/api/analytics/student/$STUDENT_ID_OUT_OF_SCOPE/report"
```

7. Teacher export is limited to teacher scope (`200`, file downloaded):

```bash
curl -i -H "Authorization: Bearer $TEACHER_TOKEN" \
  "$BASE_URL/api/analytics/export/school" -o teacher_export.xlsx
```

8. Teacher assignment results only for own assignment (`200` for own, `404` for foreign):

```bash
curl -i -H "Authorization: Bearer $TEACHER_TOKEN" \
  "$BASE_URL/api/teacher/assignments/$ASSIGNMENT_ID_TEACHER/results"
```

9. Teacher attempt details only for own assignment chain (`200` for own, `404` for foreign):

```bash
curl -i -H "Authorization: Bearer $TEACHER_TOKEN" \
  "$BASE_URL/api/teacher/attempts/$ATTEMPT_ID_TEACHER"
```

10. School admin sees school-wide analytics (`200`):

```bash
curl -i -H "Authorization: Bearer $ADMIN_TOKEN" \
  "$BASE_URL/api/analytics/school/overview?period=30"
```

## 3. Data Leakage Guard Checks

1. Log in as teacher and open:
- `Reports`
- `Advanced Analytics`
- `Assignments`

2. Verify:
- no students/classes from another school,
- no assignments not created by this teacher,
- no attempts from classes outside teacher scope.

3. Download teacher export and confirm:
- only teacher-related classes/students,
- no foreign school rows.

## 4. Pass Criteria

- All access checks return expected status.
- No cross-school or out-of-scope records in JSON/UI/export.
- Any failed check is documented with endpoint, role, response status, and sample payload.

## 5. Failure Template

```text
Date:
Endpoint:
Role:
Expected:
Actual:
Token user:
School ID:
Notes:
```

