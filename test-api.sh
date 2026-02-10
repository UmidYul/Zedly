#!/bin/bash

# Zedly API Test Script
# Простые curl команды для быстрого тестирования API

BASE_URL="http://167.235.222.200:3001/api/v1"

# Цвета для output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "======================================"
echo "🚀 Zedly API Tests"
echo "======================================"
echo ""

# 1. Health Check
echo -e "${YELLOW}[1/10] Health Check...${NC}"
curl -s http://167.235.222.200:3001/health | jq .
echo ""

# 2. Login as SuperAdmin
echo -e "${YELLOW}[2/10] Login as SuperAdmin...${NC}"
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "Admin123!"
  }')

ACCESS_TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.accessToken')
echo "Access Token: ${ACCESS_TOKEN:0:50}..."
echo ""

# 3. Get All Schools
echo -e "${YELLOW}[3/10] Get All Schools...${NC}"
curl -s -X GET "$BASE_URL/superadmin/schools" \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq .
echo ""

# 4. Create School
echo -e "${YELLOW}[4/10] Create School...${NC}"
SCHOOL_RESPONSE=$(curl -s -X POST "$BASE_URL/superadmin/schools" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{
    "name": "Test School API",
    "adminUsername": "testadmin_api",
    "adminEmail": "testadmin@api.test",
    "adminPassword": "TestPass123"
  }')

SCHOOL_ID=$(echo $SCHOOL_RESPONSE | jq -r '.schoolId // empty')
echo "School ID: $SCHOOL_ID"
echo $SCHOOL_RESPONSE | jq .
echo ""

# 5. Login as School Admin
echo -e "${YELLOW}[5/10] Login as School Admin...${NC}"
ADMIN_LOGIN=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testadmin_api",
    "password": "TestPass123"
  }')

ADMIN_TOKEN=$(echo $ADMIN_LOGIN | jq -r '.accessToken')
echo "Admin Token: ${ADMIN_TOKEN:0:50}..."
echo ""

# 6. Create Class
echo -e "${YELLOW}[6/10] Create Class...${NC}"
CLASS_RESPONSE=$(curl -s -X POST "$BASE_URL/admin/classes" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "name": "9А API Test",
    "parallel": 9,
    "letter": "А"
  }')

CLASS_ID=$(echo $CLASS_RESPONSE | jq -r '.classId // empty')
echo "Class ID: $CLASS_ID"
echo $CLASS_RESPONSE | jq .
echo ""

# 7. Get All Classes
echo -e "${YELLOW}[7/10] Get All Classes...${NC}"
curl -s -X GET "$BASE_URL/admin/classes" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq .
echo ""

# 8. Create Teacher
echo -e "${YELLOW}[8/10] Create Teacher...${NC}"
TEACHER_RESPONSE=$(curl -s -X POST "$BASE_URL/admin/teachers" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "username": "teacher_api_test",
    "email": "teacher_api@test.com",
    "password": "Teacher123",
    "firstName": "Иван",
    "lastName": "Тестов",
    "subject": "API Testing"
  }')

echo $TEACHER_RESPONSE | jq .
echo ""

# 9. Create Student
echo -e "${YELLOW}[9/10] Create Student...${NC}"
STUDENT_RESPONSE=$(curl -s -X POST "$BASE_URL/admin/students" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d "{
    \"username\": \"student_api_test\",
    \"email\": \"student_api@test.com\",
    \"password\": \"Student123\",
    \"firstName\": \"Петр\",
    \"lastName\": \"Тестов\",
    \"classId\": \"$CLASS_ID\"
  }")

echo $STUDENT_RESPONSE | jq .
echo ""

# 10. Get All Students
echo -e "${YELLOW}[10/10] Get All Students...${NC}"
curl -s -X GET "$BASE_URL/admin/students" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq .
echo ""

echo -e "${GREEN}======================================"
echo "✅ All tests completed!"
echo "======================================${NC}"
echo ""
echo "Saved tokens:"
echo "SUPERADMIN_TOKEN=$ACCESS_TOKEN"
echo "ADMIN_TOKEN=$ADMIN_TOKEN"
echo ""
echo "Saved IDs:"
echo "SCHOOL_ID=$SCHOOL_ID"
echo "CLASS_ID=$CLASS_ID"
