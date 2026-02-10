# Dashboard Документация

## Обзор

Универсальный Dashboard с адаптивной навигацией в зависимости от роли пользователя.

## Файлы

### HTML
- **dashboard.html** - универсальная страница дашборда
  - Sidebar с навигацией
  - Header с переключателями темы/языка
  - Content area для динамического контента
  - User menu в футере sidebar

### CSS
- **dashboard.css** - стили для дашборда
  - Sidebar layout (260px fixed)
  - Responsive design (mobile menu)
  - Card styles (stat-card, dashboard-section)
  - Navigation styles
  - Icon buttons

### JavaScript
- **dashboard.js** - логика дашборда
  - Проверка аутентификации
  - Загрузка пользовательских данных
  - Динамическая навигация по ролям
  - Роутинг между страницами
  - Logout функционал
  - Responsive menu

### i18n
- Добавлено 30+ переводов для дашборда (RU/UZ)
- Поддержка динамической смены языка

## Навигационная структура по ролям

### SuperAdmin
**Основное:**
- Overview (обзор)
- Schools (школы)
- Users (пользователи)

**Аналитика:**
- Statistics (статистика)
- Reports (отчеты)

**Система:**
- Settings (настройки)
- Audit (аудит)

### School Admin
**Основное:**
- Overview
- Users
- Classes (классы)
- Subjects (предметы)

**Аналитика:**
- Statistics
- Reports

**Инструменты:**
- Import (импорт)
- Export (экспорт)

### Teacher
**Основное:**
- Overview
- Tests (тесты)
- Classes

**Аналитика:**
- Results (результаты)
- Students (ученики)

**Ресурсы:**
- Library (библиотека)
- Calendar (календарь)

### Student
**Основное:**
- Overview
- Tests (мои тесты)
- Results

**Обучение:**
- Progress (прогресс)
- Career (профориентация)
- Leaderboard (рейтинг)

## Защита

- ✅ Проверка JWT токена при загрузке
- ✅ Автоматический refresh токена при истечении
- ✅ Редирект на /login если неавторизован
- ✅ Logout с очисткой токенов

## Компоненты

### Stat Cards
Карточки статистики с иконками:
```html
<div class="stat-card">
    <div class="stat-icon blue"><!-- icon --></div>
    <div class="stat-content">
        <div class="stat-label">Label</div>
        <div class="stat-value">Value</div>
    </div>
</div>
```

Цвета: `blue`, `green`, `orange`, `purple`

### Dashboard Section
Секции для контента:
```html
<div class="dashboard-section">
    <div class="section-header">
        <h2 class="section-title">Title</h2>
    </div>
    <!-- content -->
</div>
```

### Navigation Items
```html
<a href="#page" class="nav-item" data-page="page">
    <svg><!-- icon --></svg>
    <span>Label</span>
</a>
```

## Mobile Support

- Hamburger menu на экранах < 968px
- Sidebar overlay
- Touch-friendly элементы
- Скрытие header actions на мобильных

## API Integration

### GET /api/auth/me
Получение данных пользователя:
```javascript
fetch('/api/auth/me', {
    headers: {
        'Authorization': `Bearer ${token}`
    }
})
```

Response:
```json
{
    "user": {
        "id": 1,
        "username": "teacher1",
        "role": "teacher",
        "first_name": "Мария",
        "last_name": "Иванова",
        "email": "teacher@school1.uz"
    }
}
```

### POST /api/auth/logout
```javascript
fetch('/api/auth/logout', {
    method: 'POST',
    headers: {
        'Authorization': `Bearer ${token}`
    }
})
```

## Следующие шаги

Теперь можно создавать специфичные компоненты для каждой страницы:

1. **Schools Management** (SuperAdmin)
2. **User Management** (SuperAdmin, SchoolAdmin)
3. **Test Constructor** (Teacher)
4. **Test Taking** (Student)
5. **Analytics & Reports** (все роли)
6. **Career Orientation** (Student)
7. **Calendar** (Teacher, Student)
8. **Leaderboard** (Student)

## Customization

### Добавление новой страницы

1. Добавить в `navigationConfig`:
```javascript
{
    icon: 'iconName',
    label: 'dashboard.nav.custom',
    id: 'custom',
    href: '#custom'
}
```

2. Добавить обработку в `getPageContent()`:
```javascript
if (page === 'custom') {
    return `<div>Custom content</div>`;
}
```

3. Добавить переводы в i18n.js:
```javascript
'dashboard.nav.custom': 'Custom Page'
```

### Добавление новой stat card

```javascript
stats.role.push({
    icon: 'iconName',
    color: 'blue',
    label: 'My Stat',
    value: '123'
});
```

Доступные иконки в `icons` объекте: grid, building, users, chart, file, settings, shield, clipboard, class, book, upload, download, star, target, trophy, calendar.
