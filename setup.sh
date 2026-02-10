#!/bin/bash

# ZEDLY - Скрипт быстрой установки для macOS
# Автоматически устанавливает PostgreSQL и настраивает базу данных

set -e  # Остановить при ошибке

echo "======================================"
echo "🚀 ZEDLY - Быстрая установка"
echo "======================================"
echo ""

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Проверка установлен ли Homebrew
echo "📦 Проверка Homebrew..."
if ! command -v brew &> /dev/null; then
    echo -e "${YELLOW}⚠️  Homebrew не установлен${NC}"
    echo "Установить Homebrew? (y/n)"
    read -r response
    if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
        echo "Установка Homebrew..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        
        # Добавить Homebrew в PATH
        echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
        eval "$(/opt/homebrew/bin/brew shellenv)"
    else
        echo -e "${RED}❌ Homebrew необходим для установки. Выход.${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✅ Homebrew установлен${NC}"
fi

# Проверка установлен ли PostgreSQL
echo ""
echo "🐘 Проверка PostgreSQL..."
if ! command -v psql &> /dev/null; then
    echo -e "${YELLOW}⚠️  PostgreSQL не установлен${NC}"
    echo "Установить PostgreSQL? (y/n)"
    read -r response
    if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
        echo "Установка PostgreSQL 16..."
        brew install postgresql@16
        brew services start postgresql@16
        
        # Подождать пока PostgreSQL запустится
        echo "Ожидание запуска PostgreSQL..."
        sleep 5
        
        echo -e "${GREEN}✅ PostgreSQL установлен и запущен${NC}"
    else
        echo -e "${RED}❌ PostgreSQL необходим. Выход.${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✅ PostgreSQL установлен${NC}"
    
    # Проверить запущен ли PostgreSQL
    if ! pg_isready &> /dev/null; then
        echo "Запуск PostgreSQL..."
        brew services start postgresql@16 || brew services start postgresql
    fi
fi

# Создание базы данных
echo ""
echo "💾 Создание базы данных..."

# Удалить старую базу если существует
if psql -U postgres -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw zedly; then
    echo "База данных zedly уже существует. Пересоздать? (y/n)"
    read -r response
    if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
        dropdb zedly 2>/dev/null || dropdb -U postgres zedly 2>/dev/null || echo "Не удалось удалить БД"
        createdb zedly || createdb -U postgres zedly
        echo -e "${GREEN}✅ База данных пересоздана${NC}"
    else
        echo "Используем существующую базу данных"
    fi
else
    createdb zedly || createdb -U postgres zedly
    echo -e "${GREEN}✅ База данных создана${NC}"
fi

# Получить директорию проекта
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATABASE_DIR="$PROJECT_DIR/database"

# Применить схему
echo ""
echo "📄 Применение схемы базы данных..."
if [ -f "$DATABASE_DIR/schema_safe.sql" ]; then
    psql -d zedly -f "$DATABASE_DIR/schema_safe.sql" 2>/dev/null || \
    psql -U postgres -d zedly -f "$DATABASE_DIR/schema_safe.sql"
    echo -e "${GREEN}✅ Схема применена${NC}"
else
    echo -e "${RED}❌ Файл schema_safe.sql не найден${NC}"
    exit 1
fi

# Добавить тестовые данные
echo ""
echo "👥 Добавление тестовых пользователей..."
if [ -f "$DATABASE_DIR/seed_safe.sql" ]; then
    psql -d zedly -f "$DATABASE_DIR/seed_safe.sql" 2>/dev/null || \
    psql -U postgres -d zedly -f "$DATABASE_DIR/seed_safe.sql"
    echo -e "${GREEN}✅ Тестовые пользователи добавлены${NC}"
else
    echo -e "${YELLOW}⚠️  Файл seed_safe.sql не найден (необязательно)${NC}"
fi

# Проверить наличие .env
echo ""
echo "⚙️  Проверка конфигурации..."
ENV_FILE="$PROJECT_DIR/backend/.env"

if [ ! -f "$ENV_FILE" ]; then
    echo -e "${YELLOW}⚠️  Файл .env не найден${NC}"
    echo "Файл .env уже создан скриптом!"
else
    echo -e "${GREEN}✅ Файл .env существует${NC}"
fi

# Установить npm зависимости
echo ""
echo "📦 Установка npm зависимостей..."
cd "$PROJECT_DIR/backend"

if [ ! -d "node_modules" ]; then
    npm install
    echo -e "${GREEN}✅ Зависимости установлены${NC}"
else
    echo -e "${GREEN}✅ Зависимости уже установлены${NC}"
fi

# Проверить подключение к базе данных
echo ""
echo "🔌 Проверка подключения к базе данных..."
if psql -d zedly -c "SELECT COUNT(*) FROM users;" > /dev/null 2>&1 || \
   psql -U postgres -d zedly -c "SELECT COUNT(*) FROM users;" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Подключение к БД успешно${NC}"
    
    # Показать тестовых пользователей
    echo ""
    echo "👥 Тестовые пользователи:"
    psql -d zedly -c "SELECT username, role FROM users ORDER BY role;" 2>/dev/null || \
    psql -U postgres -d zedly -c "SELECT username, role FROM users ORDER BY role;"
else
    echo -e "${RED}❌ Ошибка подключения к БД${NC}"
    exit 1
fi

# Готово!
echo ""
echo "======================================"
echo -e "${GREEN}✅ Установка завершена!${NC}"
echo "======================================"
echo ""
echo "🚀 Для запуска сервера выполните:"
echo "   cd $PROJECT_DIR/backend"
echo "   npm start"
echo ""
echo "🌐 Затем откройте: http://localhost:5000"
echo ""
echo "🔐 Тестовые пользователи:"
echo "   Логин: superadmin  | Пароль: admin123"
echo "   Логин: admin1      | Пароль: admin123"
echo "   Логин: teacher1    | Пароль: admin123"
echo "   Логин: student1    | Пароль: admin123"
echo ""
echo "======================================"
