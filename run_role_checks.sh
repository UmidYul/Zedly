#!/usr/bin/env bash

set -u

BASE_URL="${BASE_URL:-}"
ADMIN_TOKEN="${ADMIN_TOKEN:-}"
TEACHER_TOKEN="${TEACHER_TOKEN:-}"
STUDENT_TOKEN="${STUDENT_TOKEN:-}"

STUDENT_ID_IN_SCOPE="${STUDENT_ID_IN_SCOPE:-}"
STUDENT_ID_OUT_OF_SCOPE="${STUDENT_ID_OUT_OF_SCOPE:-}"
CLASS_ID_IN_SCOPE="${CLASS_ID_IN_SCOPE:-}"
CLASS_ID_OUT_OF_SCOPE="${CLASS_ID_OUT_OF_SCOPE:-}"
ASSIGNMENT_ID_TEACHER="${ASSIGNMENT_ID_TEACHER:-}"
ATTEMPT_ID_TEACHER="${ATTEMPT_ID_TEACHER:-}"

if [[ -z "$BASE_URL" || -z "$ADMIN_TOKEN" || -z "$TEACHER_TOKEN" || -z "$STUDENT_TOKEN" ]]; then
  echo "Missing required env vars."
  echo "Required: BASE_URL, ADMIN_TOKEN, TEACHER_TOKEN, STUDENT_TOKEN"
  exit 1
fi

if [[ -z "$STUDENT_ID_IN_SCOPE" || -z "$STUDENT_ID_OUT_OF_SCOPE" || -z "$CLASS_ID_IN_SCOPE" || -z "$CLASS_ID_OUT_OF_SCOPE" || -z "$ASSIGNMENT_ID_TEACHER" || -z "$ATTEMPT_ID_TEACHER" ]]; then
  echo "Missing entity IDs."
  echo "Required: STUDENT_ID_IN_SCOPE, STUDENT_ID_OUT_OF_SCOPE, CLASS_ID_IN_SCOPE, CLASS_ID_OUT_OF_SCOPE, ASSIGNMENT_ID_TEACHER, ATTEMPT_ID_TEACHER"
  exit 1
fi

pass_count=0
fail_count=0

check_status() {
  local name="$1"
  local expected="$2"
  local token="$3"
  local path="$4"

  local url="${BASE_URL}${path}"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer ${token}" "$url")

  if [[ "$code" == "$expected" ]]; then
    echo "PASS | ${name} | expected=${expected} got=${code}"
    pass_count=$((pass_count + 1))
  else
    echo "FAIL | ${name} | expected=${expected} got=${code} | ${url}"
    fail_count=$((fail_count + 1))
  fi
}

check_status "Teacher class in scope" "200" "$TEACHER_TOKEN" "/api/analytics/class/${CLASS_ID_IN_SCOPE}/detailed"
check_status "Teacher class out of scope" "403" "$TEACHER_TOKEN" "/api/analytics/class/${CLASS_ID_OUT_OF_SCOPE}/detailed"
check_status "Teacher student in scope" "200" "$TEACHER_TOKEN" "/api/analytics/student/${STUDENT_ID_IN_SCOPE}/report"
check_status "Teacher student out of scope" "403" "$TEACHER_TOKEN" "/api/analytics/student/${STUDENT_ID_OUT_OF_SCOPE}/report"
check_status "Student own report" "200" "$STUDENT_TOKEN" "/api/analytics/student/${STUDENT_ID_IN_SCOPE}/report"
check_status "Student other report" "403" "$STUDENT_TOKEN" "/api/analytics/student/${STUDENT_ID_OUT_OF_SCOPE}/report"
check_status "Teacher assignment results own" "200" "$TEACHER_TOKEN" "/api/teacher/assignments/${ASSIGNMENT_ID_TEACHER}/results"
check_status "Teacher attempt own chain" "200" "$TEACHER_TOKEN" "/api/teacher/attempts/${ATTEMPT_ID_TEACHER}"
check_status "School admin school overview" "200" "$ADMIN_TOKEN" "/api/analytics/school/overview?period=30"

echo
echo "Summary: PASS=${pass_count}, FAIL=${fail_count}"

if [[ "$fail_count" -gt 0 ]]; then
  exit 2
fi

exit 0
