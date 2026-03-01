// Dashboard JavaScript
(function () {
    'use strict';

    let currentUser = null;
    let teacherHasHomeroom = false;
    let currentPageId = 'overview';
    const hiddenPages = new Set(['career-results']);

    // Navigation items for each role
    const navigationConfig = {
        superadmin: [
            {
                section: 'dashboard.nav.main',
                items: [
                    { icon: 'grid', label: 'dashboard.nav.overview', id: 'overview', href: '#overview' },
                    { icon: 'profile', label: 'dashboard.profile', id: 'profile', href: '#profile' },
                    { icon: 'building', label: 'dashboard.nav.schools', id: 'schools', href: '#schools' },
                    { icon: 'users', label: 'School Admins', id: 'school-admins', href: '#school-admins' }
                ]
            },
            {
                section: 'dashboard.nav.analytics',
                items: [
                    { icon: 'bar', label: 'dashboard.nav.statistics', id: 'statistics', href: '#statistics' },
                    { icon: 'compare', label: 'School Comparison', id: 'comparison', href: '#comparison' },
                    { icon: 'file', label: 'dashboard.nav.reports', id: 'reports', href: '#reports' }
                ]
            },
            {
                section: 'dashboard.nav.system',
                items: [
                    { icon: 'sliders', label: 'dashboard.nav.settings', id: 'settings', href: '#settings' },
                    { icon: 'shield', label: 'dashboard.nav.audit', id: 'audit', href: '#audit' }
                ]
            }
        ],
        school_admin: [
            {
                section: 'dashboard.nav.main',
                items: [
                    { icon: 'grid', label: 'dashboard.nav.overview', id: 'overview', href: '#overview' },
                    { icon: 'profile', label: 'dashboard.profile', id: 'profile', href: '#profile' },
                    { icon: 'users', label: 'dashboard.nav.users', id: 'users', href: '#users' },
                    { icon: 'class', label: 'dashboard.nav.classes', id: 'classes', href: '#classes' },
                    { icon: 'book', label: 'dashboard.nav.subjects', id: 'subjects', href: '#subjects' }
                    // { icon: 'target', label: 'dashboard.nav.career', id: 'career-admin', href: '#career-admin' } // скрыто
                ]
            },
            {
                section: 'Academic',
                items: [
                    { icon: 'calendar', label: 'Расписание', id: 'schedule-admin', href: '#schedule-admin' },
                    { icon: 'file', label: 'Учебные периоды', id: 'academic-terms', href: '#academic-terms' }
                ]
            },
            {
                section: 'dashboard.nav.analytics',
                items: [
                    { icon: 'chart', label: 'dashboard.nav.advanced', id: 'advanced', href: '#advanced' },
                    { icon: 'file', label: 'dashboard.nav.reports', id: 'reports', href: '#reports' }
                ]
            },
            {
                section: 'dashboard.nav.tools',
                items: [
                    { icon: 'upload', label: 'dashboard.nav.import', id: 'import', href: '#import' },
                    { icon: 'download', label: 'dashboard.nav.export', id: 'export', href: '#export' }
                ]
            }
        ],
        teacher: [
            {
                section: 'dashboard.nav.main',
                items: [
                    { icon: 'grid', label: 'dashboard.nav.overview', id: 'overview', href: '#overview' },
                    { icon: 'profile', label: 'dashboard.profile', id: 'profile', href: '#profile' },
                    { icon: 'book', label: 'Журнал', id: 'gradebook', href: '#gradebook' },
                    { icon: 'calendar', label: 'Расписание', id: 'schedule', href: '#schedule' },
                    { icon: 'assignment', label: 'Домашние задания', id: 'homework', href: '#homework' },
                    { icon: 'check', label: 'Посещаемость', id: 'attendance', href: '#attendance' },
                    { icon: 'message', label: 'Сообщения', id: 'messages', href: '#messages' },
                    { icon: 'clipboard', label: 'dashboard.nav.tests', id: 'tests', href: '#tests' },
                    { icon: 'assignment', label: 'dashboard.nav.assignments', id: 'assignments', href: '#assignments' },
                    { icon: 'class', label: 'dashboard.nav.classes', id: 'classes', href: '#classes' },
                    { icon: 'users', label: 'dashboard.nav.myClass', id: 'my-class', href: '#my-class' }
                ]
            },
            {
                section: 'dashboard.nav.analytics',
                items: [
                    { icon: 'chart', label: 'dashboard.nav.results', id: 'results', href: '#results' },
                    { icon: 'chart', label: 'dashboard.nav.advanced', id: 'advanced', href: '#advanced' },
                    { icon: 'users', label: 'dashboard.nav.students', id: 'students', href: '#students' }
                ]
            },
            {
                section: 'dashboard.nav.resources',
                items: [
                    { icon: 'calendar', label: 'dashboard.nav.calendar', id: 'calendar', href: '#calendar' }
                ]
            }
        ],
        psychologist: [
            {
                section: 'dashboard.nav.main',
                items: [
                    { icon: 'grid', label: 'dashboard.nav.overview', id: 'overview', href: '#overview' },
                    { icon: 'profile', label: 'dashboard.profile', id: 'profile', href: '#profile' },
                    { icon: 'users', label: 'dashboard.nav.students', id: 'students', href: '#students' },
                    { icon: 'target', label: 'dashboard.nav.careerAdmin', id: 'career-admin', href: '#career-admin' }
                ]
            }
        ],
        student: [
            {
                section: 'dashboard.nav.main',
                items: [
                    { icon: 'grid', label: 'dashboard.nav.overview', id: 'overview', href: '#overview' },
                    { icon: 'profile', label: 'dashboard.profile', id: 'profile', href: '#profile' },
                    { icon: 'book', label: 'Дневник', id: 'diary', href: '#diary' },
                    { icon: 'calendar', label: 'Расписание', id: 'schedule', href: '#schedule' },
                    { icon: 'assignment', label: 'Домашние задания', id: 'homework', href: '#homework' },
                    { icon: 'check', label: 'Посещаемость', id: 'attendance', href: '#attendance' },
                    { icon: 'message', label: 'Сообщения', id: 'messages', href: '#messages' },
                    { icon: 'clipboard', label: 'dashboard.nav.tests', id: 'tests', href: '#tests' },
                    { icon: 'star', label: 'dashboard.nav.results', id: 'results', href: '#results' },
                    { icon: 'users', label: 'dashboard.nav.myClass', id: 'my-class', href: '#my-class' },
                    { icon: 'target', label: 'dashboard.nav.career', id: 'career', href: '#career' }
                ]
            },
            {
                section: 'dashboard.nav.learning',
                items: [
                    { icon: 'chart', label: 'dashboard.nav.progress', id: 'progress', href: '#progress' },
                    { icon: 'trophy', label: 'dashboard.nav.leaderboard', id: 'leaderboard', href: '#leaderboard' }
                ]
            },
            {
                section: 'dashboard.nav.resources',
                items: [
                    { icon: 'calendar', label: 'dashboard.nav.calendar', id: 'calendar', href: '#calendar' }
                ]
            }
        ]
    };

    // SVG Icons
    const icons = {
        grid: '<path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z"/>',
        building: '<path d="M3 21h18M3 7v14M21 7v14M9 7v14M15 7v14M3 7h18M9 3v4M15 3v4"/>',
        users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
        chart: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
        bar: '<line x1="4" y1="20" x2="20" y2="20"/><rect x="6" y="11" width="3" height="9"/><rect x="11" y="7" width="3" height="13"/><rect x="16" y="4" width="3" height="16"/>',
        file: '<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/>',
        sliders: '<line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/><circle cx="9" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="11" cy="18" r="2"/>',
        shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
        clipboard: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>',
        class: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
        book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
        upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
        download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
        star: '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>',
        target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
        trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M6 9h12v4a6 6 0 0 1-12 0V9zM8 22v-3M16 22v-3M10 19h4"/>',
        compare: '<path d="M10 3H5a2 2 0 0 0-2 2v5"/><path d="M14 21h5a2 2 0 0 0 2-2v-5"/><path d="M7 21V10"/><path d="M17 3v11"/><polyline points="9 12 7 10 5 12"/><polyline points="15 12 17 14 19 12"/>',
        calendar: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
        profile: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
        assignment: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>',
        edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
        message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
        check: '<polyline points="20 6 9 17 4 12"/>'
    };

    // Initialize dashboard
    async function initDashboard() {
        console.log('[auth] Checking authentication...');

        refreshTranslations();
        try {
            console.log('[auth] Fetching user info from /api/auth/me');
            // Fetch current user info
            const response = await fetch('/api/auth/me', { credentials: 'include' });

            console.log('Response status:', response.status);

            if (!response.ok) {
                if (response.status === 401) {
                    console.log('[warn] Token expired, attempting refresh...');
                    // Token expired, try to refresh
                    await refreshToken();
                    return initDashboard();
                }
                const errorData = await response.json();
                console.error('API error:', errorData);
                throw new Error('Failed to fetch user info');
            }

            const data = await response.json();
            console.log('[ok] User authenticated:', data.user);
            currentUser = data.user;
            const requestedPage = getRequestedPageFromUrl();
            if (requestedPage && isPageAvailableForCurrentUser(requestedPage)) {
                currentPageId = requestedPage;
            }

            try {
                // Update UI (with error handling for each step)
                console.log('[ui] Updating user info...');
                if (currentUser.role === 'teacher') {
                    teacherHasHomeroom = await checkTeacherHomeroom();
                }
                updateUserInfo();

                console.log('[ui] Rendering navigation...');
                renderNavigation();

                console.log('[ui] Loading dashboard content...');
                loadDashboardContent();

                console.log('[ok] Dashboard fully loaded');
            } catch (uiError) {
                console.error('[warn] UI update error (non-critical):', uiError);
                // Don't redirect on UI errors, dashboard might still be usable
            }

        } catch (error) {
            console.error('[error] Dashboard initialization error:', error);
            console.log('Error stack:', error.stack);
            console.log('Redirecting to login...');
            redirectToLogin();
        }
    }

    // Update user info in sidebar
    function updateUserInfo() {
        const userAvatar = document.getElementById('userAvatar');
        const userName = document.getElementById('userName');
        const userRole = document.getElementById('userRole');

        if (currentUser) {
            // Avatar icon is static in markup; no update needed.

            // Set name (only if element exists)
            if (userName) {
                userName.textContent = `${currentUser.first_name || ''} ${currentUser.last_name || ''}`.trim() || currentUser.username;
            }

            // Set role (only if element exists)
            if (userRole) {
                const roleNames = {
                    'superadmin': 'SuperAdmin',
                    'school_admin': 'School Admin',
                    'teacher': 'Teacher',
                    'student': 'Student',
                    'psychologist': 'Psychologist'
                };
                userRole.textContent = roleNames[currentUser.role] || currentUser.role;
            }

        }
    }

    // Render navigation based on role
    function renderNavigation() {
        const sidebarNav = document.getElementById('sidebarNav');
        if (!sidebarNav || !currentUser || !navigationConfig[currentUser.role]) {
            console.warn('[warn] Cannot render navigation: element or config missing');
            return;
        }

        const config = navigationConfig[currentUser.role];
        let html = '';

        // Helper function to get translation
        const t = (key) => {
            return window.ZedlyI18n?.translate(key) || key;
        };

        config.forEach(section => {
            html += `<div class="nav-section">`;
            html += `<div class="nav-section-title" data-i18n="${section.section}">${t(section.section)}</div>`;

            section.items.forEach(item => {
                if (item.id === 'my-class' && currentUser.role === 'teacher' && !teacherHasHomeroom) {
                    return;
                }
                const iconSvg = icons[item.icon] || icons.grid;
                const itemHref = item.href;
                html += `
                    <a href="${itemHref}" class="nav-item" data-page="${item.id}">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            ${iconSvg}
                        </svg>
                        <span data-i18n="${item.label}">${t(item.label)}</span>
                    </a>
                `;
            });

            html += `</div>`;
        });

        sidebarNav.innerHTML = html;

        // Restore active state for current page
        syncActiveNavItem(currentPageId);

        // Add click handlers
        sidebarNav.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', handleNavClick);
        });
    }

    function syncActiveNavItem(pageId) {
        const sidebarNav = document.getElementById('sidebarNav');
        if (!sidebarNav) return;

        const navItems = sidebarNav.querySelectorAll('.nav-item');
        navItems.forEach((item) => item.classList.remove('active'));

        const currentItem = sidebarNav.querySelector(`.nav-item[data-page="${pageId}"]`);
        if (currentItem) {
            currentItem.classList.add('active');
            return;
        }

        const firstItem = sidebarNav.querySelector('.nav-item');
        if (firstItem) {
            firstItem.classList.add('active');
            currentPageId = firstItem.dataset.page || 'overview';
        }
    }

    function refreshTranslations() {
        if (window.ZedlyI18n?.getCurrentLang && window.ZedlyI18n?.setLang) {
            const lang = window.ZedlyI18n.getCurrentLang();
            window.ZedlyI18n.setLang(lang);
        }
    }

    function isPageAvailableForCurrentUser(pageId) {
        if (hiddenPages.has(pageId)) {
            return false;
        }

        if (!currentUser || !navigationConfig[currentUser.role]) {
            return pageId === 'overview';
        }

        return navigationConfig[currentUser.role].some((section) =>
            section.items.some((item) => item.id === pageId)
        );
    }

    function getRequestedPageFromUrl() {
        const hashPage = (window.location.hash || '').replace('#', '').trim();
        if (hashPage) {
            return hashPage;
        }

        const params = new URLSearchParams(window.location.search);
        return (params.get('page') || '').trim();
    }

    async function checkTeacherHomeroom() {
        try {
            const response = await fetch('/api/teacher/homeroom-classes', {
                headers: {
                    'Authorization': `Bearer ${window.ZedlyAuth?.getAuthToken?.() || 'cookie-session'}`
                }
            });
            if (!response.ok) return false;
            const data = await response.json();
            return Array.isArray(data.classes) && data.classes.length > 0;
        } catch (error) {
            console.error('Homeroom check error:', error);
            return false;
        }
    }

    // Handle navigation click
    function handleNavClick(e) {
        const href = this.getAttribute('href');
        const page = this.dataset.page;

        // If href is an external link (starts with /), allow default navigation
        if (href && href.startsWith('/') && !href.startsWith('/#')) {
            // External link - let it navigate normally
            return;
        }

        // Internal navigation - prevent default and load content
        e.preventDefault();

        // Update active state
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        this.classList.add('active');

        // Load content
        loadPageContent(page);
        if (page) {
            window.location.hash = page;
        }

        // Close mobile menu
        closeMobileMenu();
    }

    // Load dashboard content based on role
    function loadDashboardContent() {
        if (!currentUser) {
            console.warn('[warn] No current user, skipping content load');
            return;
        }

        const requestedPage = getRequestedPageFromUrl();
        const initialPage = requestedPage && isPageAvailableForCurrentUser(requestedPage)
            ? requestedPage
            : 'overview';

        loadPageContent(initialPage);
    }

    // Load specific page content
    async function loadPageContent(page) {
        const content = document.getElementById('dashboardContent');
        currentPageId = page || currentPageId;
        syncActiveNavItem(currentPageId);

        if (!content) {
            console.warn('[warn] dashboardContent element not found');
            return;
        }

        // Show skeleton loading (faster visual feedback than spinner-only)
        content.innerHTML = getDashboardSkeletonMarkup();

        // Load stats from API if overview page
        if (page === 'overview' && currentUser) {
            const statsData = await loadStatsFromAPI(currentUser.role);
            if (statsData) {
                // Set page content with API data
                const titles = {
                    superadmin: { title: t('dashboard.role.superadmin.title', 'Админ панель'), subtitle: t('dashboard.role.superadmin.subtitle', 'Управление системой и контроль') },
                    school_admin: { title: t('dashboard.role.school_admin.title', 'Админ панель'), subtitle: t('dashboard.role.school_admin.subtitle', 'Управление школой') },
                    teacher: { title: t('dashboard.role.teacher.title', 'Панель учителя'), subtitle: t('dashboard.role.teacher.subtitle', 'Тесты и аналитика') },
                    psychologist: { title: t('dashboard.role.psychologist.title', 'Панель психолога'), subtitle: t('dashboard.role.psychologist.subtitle', 'Профориентация и профили учеников') },
                    student: { title: t('dashboard.role.student.title', 'Панель ученика'), subtitle: t('dashboard.role.student.subtitle', 'Обучение и результаты') }
                };

                const roleTitle = titles[currentUser.role] || titles.psychologist;

                content.innerHTML = `
                    <div class="page-header-section">
                        <h1 class="page-main-title">${roleTitle.title}</h1>
                        <p class="page-subtitle">${roleTitle.subtitle}</p>
                    </div>
                    <div class="stats-grid">
                        ${buildStatsCards(currentUser.role, statsData)}
                    </div>
                    <div class="dashboard-section">
                        <div class="section-header">
                            <h2 class="section-title">${t('dashboard.activity.recentTitle', 'Недавняя активность')}</h2>
                        </div>
                        ${buildRecentActivity(currentUser.role, statsData)}
                    </div>
                `;
                return;
            }

            const titles = {
                superadmin: { title: t('dashboard.role.superadmin.title', 'Админ панель'), subtitle: t('dashboard.role.superadmin.subtitle', 'Управление системой и контроль') },
                school_admin: { title: t('dashboard.role.school_admin.title', 'Админ панель'), subtitle: t('dashboard.role.school_admin.subtitle', 'Управление школой') },
                teacher: { title: t('dashboard.role.teacher.title', 'Панель учителя'), subtitle: t('dashboard.role.teacher.subtitle', 'Тесты и аналитика') },
                psychologist: { title: t('dashboard.role.psychologist.title', 'Панель психолога'), subtitle: t('dashboard.role.psychologist.subtitle', 'Профориентация и профили учеников') },
                student: { title: t('dashboard.role.student.title', 'Панель ученика'), subtitle: t('dashboard.role.student.subtitle', 'Обучение и результаты') }
            };
            const roleTitle = titles[currentUser.role] || titles.psychologist;
            content.innerHTML = `
                <div class="page-header-section">
                    <h1 class="page-main-title">${roleTitle.title}</h1>
                    <p class="page-subtitle">${roleTitle.subtitle}</p>
                </div>
                <div class="dashboard-section">
                    <p style="color: var(--text-secondary);">${t('dashboard.activity.none', 'Пока нет недавней активности.')}</p>
                    <p style="color: var(--danger, #ef4444); margin-top: 8px;">
                        ${t('dashboard.stats.loadError', 'Не удалось загрузить актуальную статистику. Обновите страницу.')}
                    </p>
                </div>
            `;
            return;
        }

        // Set page content (fallback or non-overview pages)
        content.innerHTML = getPageContent(page);

        // Load script and initialize if needed
        await loadPageScript(page);
    }

    function getDashboardSkeletonMarkup() {
        return `
            <div class="page-header-section">
                <div class="skeleton skeleton-line lg" style="width: 240px;"></div>
                <div class="skeleton skeleton-line" style="width: 360px;"></div>
            </div>
            <div class="stats-grid">
                <div class="skeleton-card">
                    <div class="skeleton skeleton-line" style="width: 120px;"></div>
                    <div class="skeleton skeleton-line lg" style="width: 70px;"></div>
                </div>
                <div class="skeleton-card">
                    <div class="skeleton skeleton-line" style="width: 130px;"></div>
                    <div class="skeleton skeleton-line lg" style="width: 70px;"></div>
                </div>
                <div class="skeleton-card">
                    <div class="skeleton skeleton-line" style="width: 140px;"></div>
                    <div class="skeleton skeleton-line lg" style="width: 70px;"></div>
                </div>
                <div class="skeleton-card">
                    <div class="skeleton skeleton-line" style="width: 150px;"></div>
                    <div class="skeleton skeleton-line lg" style="width: 70px;"></div>
                </div>
            </div>
            <div class="dashboard-section">
                <div class="section-header">
                    <div class="skeleton skeleton-line" style="width: 180px;"></div>
                </div>
                <div class="skeleton skeleton-table-row"></div>
                <div class="skeleton skeleton-table-row"></div>
                <div class="skeleton skeleton-table-row"></div>
            </div>
        `;
    }

    // Load page-specific script
    async function loadPageScript(page) {
        const scriptMap = {
            'schools': { src: '/js/schools.js', manager: 'SchoolsManager' },
            'school-admins': { src: '/js/school-admins.js', manager: 'SchoolAdminsManager' },
            'comparison': { src: '/js/school-comparison.js', manager: 'SchoolComparisonManager' },
            'statistics': { src: '/js/superadmin-stats.js', manager: 'SuperadminStats' },
            'advanced': { src: '/js/advanced-analytics.js', manager: 'AdvancedAnalytics' },
            'users': { src: '/js/users.js', manager: 'UsersManager' },
            'classes': { src: '/js/classes.js', manager: 'ClassesManager' },
            'subjects': { src: '/js/subjects.js', manager: 'SubjectsManager' },
            'results': {
                src: currentUser && currentUser.role === 'teacher'
                    ? '/js/teacher-analytics.js'
                    : (currentUser && currentUser.role === 'student' ? '/js/student-results.js' : null),
                manager: currentUser && currentUser.role === 'teacher' ? 'TeacherAnalytics' : 'StudentResults'
            },
            'tests': {
                src: currentUser && currentUser.role === 'student' ? '/js/student-tests.js' : '/js/tests.js',
                manager: currentUser && currentUser.role === 'student' ? 'StudentTestsManager' : 'TestsManager'
            },
            'assignments': { src: '/js/assignments.js', manager: 'AssignmentsManager' },
            'import': { src: '/js/import-export.js', manager: 'ImportExportManager' },
            'export': { src: '/js/import-export.js', manager: 'ImportExportManager' },
            'progress': { src: '/js/student-progress.js', manager: 'StudentProgress' },
            'leaderboard': { src: '/js/student-leaderboard.js', manager: 'StudentLeaderboard' },
            'career': { src: '/js/career.js', manager: 'CareerManager' },
            'career-admin': { src: '/js/career-admin.js', manager: 'CareerAdminManager' },
            'career-results': { src: '/js/career-results.js', manager: 'CareerResultsManager' },
            'my-class': currentUser && currentUser.role === 'student'
                ? { src: '/js/student-my-class.js', manager: 'StudentMyClassPage' }
                : { src: ['https://cdn.jsdelivr.net/npm/chart.js', '/js/my-class.js'], manager: 'MyClassPage' },
            'students': { src: ['https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js', '/js/students.js'], manager: 'StudentsPage' },
            'calendar': currentUser && currentUser.role === 'student'
                ? { src: '/js/student-calendar.js', manager: 'StudentCalendarPage' }
                : { src: '/js/calendar.js', manager: 'CalendarPage' },
            'reports': { src: ['https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js', '/js/reports.js'], manager: 'ReportsManager' },
            'settings': { src: '/js/settings.js', manager: 'SettingsPage' },
            'audit': { src: '/js/audit.js', manager: 'AuditPage' },
            'profile': { src: ['https://cdn.jsdelivr.net/npm/chart.js', '/js/profile.js'], manager: 'ProfilePage' },
            'gradebook': { src: ['/js/diary-page-utils.js', '/js/gradebook.js'], manager: 'GradebookPage' },
            'schedule': { src: ['/js/diary-page-utils.js', '/js/diary-schedule.js'], manager: 'DiarySchedulePage' },
            'homework': { src: ['/js/diary-page-utils.js', '/js/homework.js'], manager: 'HomeworkPage' },
            'messages': { src: ['/js/diary-page-utils.js', '/js/messages.js'], manager: 'MessagesPage' },
            'attendance': { src: ['/js/diary-page-utils.js', '/js/attendance.js'], manager: 'AttendancePage' },
            'diary': { src: ['/js/diary-page-utils.js', '/js/student-diary.js'], manager: 'StudentDiaryPage' },
            'schedule-admin': { src: ['/js/diary-page-utils.js', '/js/admin-schedule.js'], manager: 'AdminSchedulePage' },
            'academic-terms': { src: ['/js/diary-page-utils.js', '/js/academic-terms.js'], manager: 'AcademicTermsPage' }
        };

        const scriptInfo = scriptMap[page];
        if (!scriptInfo || !scriptInfo.src) return;

        // Check if script already loaded and manager exists
        if (window[scriptInfo.manager]) {
            try {
                window[scriptInfo.manager].init();
            } catch (error) {
                console.error(`Failed to initialize ${scriptInfo.manager}:`, error);
            }
            return;
        }

        const sources = Array.isArray(scriptInfo.src) ? scriptInfo.src : [scriptInfo.src];

        const loadScript = (src) => new Promise((resolve, reject) => {
            const existing = document.querySelector(`script[src="${src}"]`);
            if (existing) {
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = src;
            script.onload = () => {
                console.log(`[ok] Loaded: ${src}`);
                resolve();
            };
            script.onerror = () => {
                console.error(`Failed to load script: ${src}`);
                reject();
            };
            document.head.appendChild(script);
        });

        return sources.reduce((promise, src) => {
            return promise.then(() => loadScript(src));
        }, Promise.resolve()).then(() => {
            try {
                if (window[scriptInfo.manager]) {
                    window[scriptInfo.manager].init();
                    console.log(`Initialized: ${scriptInfo.manager}`);
                } else if (scriptInfo.manager) {
                    console.error(`Manager ${scriptInfo.manager} not found after loading script`);
                }
            } catch (error) {
                console.error(`Failed to initialize ${scriptInfo.manager}:`, error);
            }
        });
    }

    // Get page content (placeholder - will be replaced with actual components)
    function getPageContent(page) {
        const role = currentUser?.role || 'student';
        const renderDiaryPageShell = ({ title, subtitle, toolbar = '', contentId }) => `
            <div class="page-header-section">
                <h1 class="page-main-title">${title}</h1>
                <p class="page-subtitle">${subtitle}</p>
            </div>
            ${toolbar ? `<div class="page-toolbar">${toolbar}</div>` : ''}
            <div class="dashboard-section">
                <div id="${contentId}"></div>
            </div>
        `;

        if (page === 'profile') {
            return `
                <div class="content-wrapper profile-wrapper">
                    <section class="profile-hero card-surface">
                        <div class="profile-avatar" id="profileAvatarText">U</div>
                        <div class="profile-hero-meta">
                            <h1 id="profileName">Имя Фамилия</h1>
                            <p id="profileRole">Роль</p>
                            <p id="profileSchool">Школа</p>
                        </div>
                    </section>

                    <section class="profile-grid">
                        <div class="profile-col">
                            <article class="profile-card card-surface">
                                <h2 data-i18n="profile.yourData">Ваши данные</h2>
                                <div class="profile-info-grid">
                                    <div class="info-row"><span data-i18n="profile.username">Логин</span><strong id="profileUsername">-</strong></div>
                                    <div class="info-row"><span data-i18n="profile.email">Email</span><strong id="profileEmail">-</strong></div>
                                    <div class="info-row"><span data-i18n="profile.phone">Телефон</span><strong id="profilePhone">-</strong></div>
                                    <div class="info-row"><span data-i18n="profile.dateOfBirth">Дата рождения</span><strong id="profileDOB">-</strong></div>
                                    <div class="info-row"><span data-i18n="profile.gender">Пол</span><strong id="profileGender">-</strong></div>
                                    <div class="info-row"><span data-i18n="profile.registered">Регистрация</span><strong id="profileCreatedAt">-</strong></div>
                                    <div class="info-row"><span data-i18n="profile.lastLogin">Последний вход</span><strong id="profileLastLogin">-</strong></div>
                                </div>
                            </article>

                            <article class="profile-card card-surface" id="profileActionsCard" style="display: none;">
                                <h2 data-i18n="profile.contactChanges">Смена контактов</h2>
                                <div id="contactVerificationBanner" class="contact-verification-banner" style="display:none;"></div>
                                <div class="profile-form-grid">
                                    <div class="field-block">
                                        <label for="emailInput" data-i18n="profile.email">Email</label>
                                        <div class="field-inline">
                                            <input id="emailInput" class="field-input" type="email" placeholder="name@example.com">
                                            <button id="requestEmailCodeBtn" class="btn btn-outline" type="button" data-i18n="profile.getCode">Получить код</button>
                                        </div>
                                        <small id="emailStatusText">Email не подтвержден</small>
                                    </div>
                                    <div class="field-block">
                                        <label for="phoneInput" data-i18n="profile.phone">Телефон</label>
                                        <div class="field-inline">
                                            <input id="phoneInput" class="field-input" type="text" placeholder="+998901234567" readonly>
                                            <button id="requestPhoneFromTelegramBtn" class="btn btn-outline" type="button">Запросить через Telegram</button>
                                        </div>
                                        <small id="phoneStatusText">Телефон не подтвержден</small>
                                    </div>
                                </div>
                            </article>

                            <article class="profile-card card-surface" id="profilePersonalCard" style="display: none;">
                                <h2 data-i18n="profile.personalEdit">Личные данные</h2>
                                <div class="profile-form-grid">
                                    <div class="field-block">
                                        <label for="dobInput" data-i18n="profile.dateOfBirth">Дата рождения</label>
                                        <input id="dobInput" class="field-input" type="date">
                                    </div>
                                    <div class="field-block">
                                        <label for="genderInput" data-i18n="profile.gender">Пол</label>
                                        <select id="genderInput" class="field-input">
                                            <option value="" data-i18n="profile.genderNotSpecified">Не указан</option>
                                            <option value="male" data-i18n="profile.genderMale">Мужской</option>
                                            <option value="female" data-i18n="profile.genderFemale">Женский</option>
                                        </select>
                                    </div>
                                </div>
                                <div class="card-actions"><button id="savePersonalBtn" class="btn btn-primary" type="button" data-i18n="users.save">Сохранить</button></div>
                            </article>

                            <article class="profile-card card-surface" id="profileNotificationsCard" style="display: none;">
                                <h2 data-i18n="profile.notifications">Настройка уведомлений</h2>
                                <div class="notification-grid">
                                    <div class="field-block">
                                        <h3 data-i18n="profile.notificationChannels">Каналы</h3>
                                        <label class="check-row"><input type="checkbox" id="channelInApp"> В приложении</label>
                                        <label class="check-row"><input type="checkbox" id="channelEmail"> Email</label>
                                        <label class="check-row"><input type="checkbox" id="channelTelegram"> Telegram</label>
                                    </div>
                                    <div class="field-block">
                                        <h3 data-i18n="profile.notificationEvents">События</h3>
                                        <label class="check-row"><input type="checkbox" id="eventNewTest"> Новые тесты</label>
                                        <label class="check-row"><input type="checkbox" id="eventTestResults"> Результаты тестов</label>
                                        <label class="check-row"><input type="checkbox" id="eventAssignmentDeadline"> Дедлайны</label>
                                        <label class="check-row"><input type="checkbox" id="eventPasswordReset"> Сброс пароля</label>
                                        <label class="check-row"><input type="checkbox" id="eventProfileUpdates"> Изменения профиля</label>
                                        <label class="check-row"><input type="checkbox" id="eventSystemUpdates"> Системные</label>
                                    </div>
                                </div>
                                <div class="card-actions"><button id="saveNotificationsBtn" class="btn btn-primary" type="button" data-i18n="users.save">Сохранить</button></div>
                            </article>
                        </div>

                        <div class="profile-col">
                            <article class="profile-card card-surface" id="profileRoleInfoCard" style="display:none;">
                                <h2 id="roleSpecificTitle">Дополнительная информация</h2>
                                <div class="profile-info-grid" id="roleSpecificContent"></div>
                            </article>

                            <article class="profile-card card-surface">
                                <h2 data-i18n="profile.statistics">Краткая статистика</h2>
                                <div class="stats-grid" id="statsContent"></div>
                            </article>

                            <article class="profile-card card-surface" id="chartsCard" style="display:none;">
                                <h2 data-i18n="profile.performance">Успеваемость</h2>
                                <canvas id="performanceChart"></canvas>
                            </article>

                            <article class="profile-card card-surface" id="careerSummaryCard" style="display:none;">
                                <h2>Профориентация</h2>
                                <div class="career-summary-actions">
                                    <button class="btn btn-outline" id="profileCareerOpenBtn" type="button" style="display:none;">Открыть полную страницу</button>
                                    <button class="btn btn-outline" id="profileCareerPdfBtn" type="button">Экспорт PDF</button>
                                </div>
                                <p class="no-data" id="careerSummaryEmpty">Результатов пока нет.</p>
                                <canvas id="careerRadarChart" style="display:none;"></canvas>
                                <div class="profile-career-grid">
                                    <div class="profile-career-box">
                                        <h3>Топ интересов</h3>
                                        <div class="profile-career-tags" id="careerTopInterestsSummary"></div>
                                    </div>
                                    <div class="profile-career-box">
                                        <h3>Рекомендуемые предметы</h3>
                                        <div class="profile-career-tags" id="careerRecommendedSubjectsSummary"></div>
                                    </div>
                                </div>
                            </article>

                            <article class="profile-card card-surface" id="profileActivityCard" style="display:none;">
                                <h2 data-i18n="profile.recentActions">${t('profile.recentActions', 'Последние действия')}</h2>
                                <div class="activity-list" id="activityList"><p class="no-data">Нет данных</p></div>
                            </article>
                        </div>
                    </section>
                </div>
            `;
        }

        if (page === 'gradebook' && role === 'teacher') {
            return renderDiaryPageShell({
                title: 'Электронный журнал',
                subtitle: 'Оценки по классам и предметам, комментарии и история изменений',
                toolbar: `
                    <div class="toolbar-right">
                        <select id="gradebookClassFilter" class="select-input"></select>
                        <select id="gradebookSubjectFilter" class="select-input"></select>
                        <select id="gradebookTermFilter" class="select-input"></select>
                        <button class="btn btn-primary" id="gradebookAddBtn">Выставить оценку</button>
                    </div>
                `,
                contentId: 'gradebookRoot'
            });
        }

        if (page === 'diary' && role === 'student') {
            return renderDiaryPageShell({
                title: 'Дневник ученика',
                subtitle: 'Текущие и итоговые оценки по предметам',
                toolbar: `
                    <div class="toolbar-right">
                        <select id="studentDiarySubjectFilter" class="select-input"></select>
                        <select id="studentDiaryTermFilter" class="select-input"></select>
                    </div>
                `,
                contentId: 'studentDiaryRoot'
            });
        }

        if (page === 'schedule' && (role === 'teacher' || role === 'student')) {
            return renderDiaryPageShell({
                title: role === 'teacher' ? 'Расписание учителя' : 'Мое расписание',
                subtitle: 'Неделя уроков, кабинеты, изменения и замены',
                toolbar: `
                    <div class="toolbar-right">
                        <button class="btn btn-outline" id="schedulePrevWeekBtn">◀ Неделя</button>
                        <button class="btn btn-secondary" id="scheduleTodayBtn">Текущая неделя</button>
                        <button class="btn btn-outline" id="scheduleNextWeekBtn">Неделя ▶</button>
                    </div>
                `,
                contentId: 'scheduleRoot'
            });
        }

        if (page === 'homework' && (role === 'teacher' || role === 'student')) {
            return renderDiaryPageShell({
                title: role === 'teacher' ? 'Домашние задания' : 'Мои домашние задания',
                subtitle: role === 'teacher'
                    ? 'Публикация, проверка и оценивание работ'
                    : 'Список заданий, статусы сдачи и обратная связь',
                toolbar: `
                    <div class="toolbar-right">
                        <select id="homeworkStatusFilter" class="select-input"></select>
                        ${role === 'teacher' ? '<button class="btn btn-primary" id="homeworkCreateBtn">Новое ДЗ</button>' : ''}
                    </div>
                `,
                contentId: 'homeworkRoot'
            });
        }

        if (page === 'attendance' && (role === 'teacher' || role === 'student')) {
            return renderDiaryPageShell({
                title: role === 'teacher' ? 'Посещаемость' : 'Моя посещаемость',
                subtitle: role === 'teacher'
                    ? 'Отметка присутствия по урокам'
                    : 'История посещения уроков и причины пропусков',
                toolbar: '',
                contentId: 'attendanceRoot'
            });
        }

        if (page === 'messages' && (role === 'teacher' || role === 'student' || role === 'school_admin')) {
            return renderDiaryPageShell({
                title: 'Сообщения',
                subtitle: 'Коммуникация между участниками образовательного процесса',
                toolbar: `
                    <div class="toolbar-right">
                        <input id="messagesSearchInput" class="search-input" type="text" placeholder="Поиск диалогов">
                        <button class="btn btn-primary" id="messagesNewDialogBtn">Новый диалог</button>
                    </div>
                `,
                contentId: 'messagesRoot'
            });
        }

        if (page === 'schedule-admin' && role === 'school_admin') {
            return renderDiaryPageShell({
                title: 'Расписание школы',
                subtitle: 'Управление сеткой уроков, кабинетами и заменами',
                toolbar: `
                    <div class="toolbar-right">
                        <select id="adminScheduleClassFilter" class="select-input"></select>
                        <button class="btn btn-primary" id="adminScheduleAddLessonBtn">Добавить урок</button>
                    </div>
                `,
                contentId: 'adminScheduleRoot'
            });
        }

        if (page === 'academic-terms' && role === 'school_admin') {
            return renderDiaryPageShell({
                title: 'Учебные периоды',
                subtitle: 'Четверти, семестры и каникулы для текущего учебного года',
                toolbar: `
                    <div class="toolbar-right">
                        <button class="btn btn-primary" id="academicTermAddBtn">Добавить период</button>
                    </div>
                `,
                contentId: 'academicTermsRoot'
            });
        }
        // Career Results (SuperAdmin, read-only)
        if (page === 'career-results' && role === 'superadmin') {
            return `
                <div class="page-header-section">
                    <h1 class="page-main-title" data-i18n="career.resultsTitle">Профориентация: результаты</h1>
                    <p class="page-subtitle" data-i18n="career.resultsSubtitle">Просмотр результатов профориентации по школам, классам и ученикам</p>
                </div>
                <div class="dashboard-section">
                    <div class="section-header">
                        <h2 class="section-title" data-i18n="career.resultsAnalytics">Аналитика и результаты</h2>
                    </div>
                    <div id="careerResultsAnalytics"></div>
                </div>
            `;
        }

        if (page === 'my-class' && role === 'teacher') {
            return `
                <div class="my-class-page" id="myClassPage">
                    <section class="my-class-hero" id="heroCard">
                        <div class="hero-info">
                            <p class="hero-label">Мой класс</p>
                            <div class="class-select-row hidden" id="classSelectRow">
                                <label for="classSelect">Класс</label>
                                <select id="classSelect" class="class-select"></select>
                            </div>
                            <h1 id="className">Загрузка...</h1>
                            <p id="classMeta">Подготовка данных</p>
                        </div>
                        <div class="hero-metrics">
                            <div class="metric">
                                <div class="metric-label">Учеников</div>
                                <div class="metric-value" id="studentCount">0</div>
                            </div>
                            <div class="metric">
                                <div class="metric-label">Назначений</div>
                                <div class="metric-value" id="assignmentCount">0</div>
                            </div>
                            <div class="metric">
                                <div class="metric-label">Активные</div>
                                <div class="metric-value" id="activeAssignments">0</div>
                            </div>
                            <div class="metric">
                                <div class="metric-label">Средний балл</div>
                                <div class="metric-value" id="avgScore">0%</div>
                            </div>
                        </div>
                    </section>

                    <section class="dashboard-section my-class-card" id="analyticsCard">
                        <div class="section-header">
                            <div>
                                <h2 class="section-title">Предметная успеваемость</h2>
                                <p class="page-subtitle">Средний результат по предметам вашего класса</p>
                            </div>
                        </div>
                        <div class="chart-wrap">
                            <canvas id="subjectChart" height="120"></canvas>
                        </div>
                        <div class="subject-performance" id="subjectPerformance">
                            <div class="empty-state">Данных пока нет</div>
                        </div>
                    </section>

                    <section class="dashboard-section my-class-card" id="studentsCard">
                        <div class="section-header">
                            <div>
                                <h2 class="section-title">Ученики класса</h2>
                                <p class="page-subtitle">Управляйте доступом и паролями учеников</p>
                            </div>
                            <div class="table-controls">
                                <input class="search-input" id="studentSearch" type="text" placeholder="Поиск по имени или логину">
                            </div>
                        </div>
                        <div class="table-wrap mobile-stack-table">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>Имя</th>
                                        <th>Логин</th>
                                        <th>Тестов пройдено</th>
                                        <th>Средний балл</th>
                                        <th>Действия</th>
                                    </tr>
                                </thead>
                                <tbody id="studentsTableBody">
                                    <tr>
                                        <td colspan="5" class="empty-row">Загрузка...</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <section class="dashboard-section my-class-card hidden" id="emptyState">
                        <div class="empty-state">
                            <h2>Класс не назначен</h2>
                            <p>Пока у вас нет класса в качестве классного руководителя.</p>
                        </div>
                    </section>

                    <div class="modal-overlay hidden" id="passwordModal">
                        <div class="modal">
                            <div class="modal-header">
                                <h3>Временный пароль</h3>
                                <button class="modal-close" type="button" id="modalClose">&#215;</button>
                            </div>
                            <div class="modal-body">
                                <p id="modalStudentName">Пароль для ученика</p>
                                <div class="password-box" id="modalPassword">—</div>
                                <p class="modal-hint">Передайте пароль ученику и попросите сменить его после входа.</p>
                            </div>
                            <div class="modal-actions">
                                <button class="btn btn-outline" type="button" id="modalCopy">Скопировать</button>
                                <button class="btn btn-primary" type="button" id="modalOk">Готово</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        if (page === 'my-class' && role === 'student') {
            return `
                <div class="my-class-page student-my-class-page" id="studentMyClassPage">
                    <section class="my-class-hero">
                        <div class="hero-info">
                            <p class="hero-label">Мой класс</p>
                            <h1 id="studentMyClassName">Загрузка...</h1>
                            <p id="studentMyClassMeta">Подготовка данных</p>
                        </div>
                        <div class="hero-metrics">
                            <div class="metric">
                                <div class="metric-label">Моё место</div>
                                <div class="metric-value" id="studentMyClassRank">-</div>
                            </div>
                            <div class="metric">
                                <div class="metric-label">Средний балл</div>
                                <div class="metric-value" id="studentMyClassAvg">0%</div>
                            </div>
                            <div class="metric">
                                <div class="metric-label">Тестов пройдено</div>
                                <div class="metric-value" id="studentMyClassTests">0</div>
                            </div>
                            <div class="metric">
                                <div class="metric-label">Активных назначений</div>
                                <div class="metric-value" id="studentMyClassActiveAssignments">0</div>
                            </div>
                        </div>
                    </section>

                    <section class="students-grid-top">
                        <div class="dashboard-section students-card">
                            <div class="section-header"><h2 class="section-title">Активные назначения класса</h2></div>
                            <div class="table-responsive mobile-stack-table">
                                <table class="data-table">
                                    <thead>
                                        <tr>
                                            <th>Тест</th>
                                            <th>Предмет</th>
                                            <th>Дедлайн</th>
                                            <th>Мой статус</th>
                                            <th>Действие</th>
                                        </tr>
                                    </thead>
                                    <tbody id="studentMyClassAssignmentsBody">
                                        <tr><td colspan="5" class="empty-row">Загрузка...</td></tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div class="dashboard-section students-card">
                            <div class="section-header"><h2 class="section-title">Прогресс по предметам</h2></div>
                            <div id="studentMyClassSubjects" class="subject-performance">
                                <div class="empty-state">Загрузка...</div>
                            </div>
                        </div>
                    </section>

                    <section class="dashboard-section students-card">
                        <div class="section-header">
                            <h2 class="section-title">Одноклассники</h2>
                        </div>
                        <div class="table-responsive mobile-stack-table">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>№</th>
                                        <th>ФИО</th>
                                        <th>Средний балл</th>
                                        <th>Тестов пройдено</th>
                                    </tr>
                                </thead>
                                <tbody id="studentMyClassStudentsBody">
                                    <tr><td colspan="4" class="empty-row">Загрузка...</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <section class="dashboard-section my-class-card hidden" id="studentMyClassEmpty">
                        <div class="empty-state">
                            <h2>Класс не назначен</h2>
                            <p>Вы пока не назначены в активный класс.</p>
                        </div>
                    </section>
                </div>
            `;
        }

        if (page === 'students' && (role === 'teacher' || role === 'psychologist')) {
            return `
                <div class="students-page" id="studentsPage">
                    <section class="students-hero dashboard-section">
                        <div>
                            <h1 class="section-title">${role === 'psychologist' ? 'Ученики школы' : 'Ученики класса'}</h1>
                            <p class="page-subtitle" id="studentsPageSubtitle">Выберите класс для просмотра учеников</p>
                        </div>
                        <div class="students-hero-actions">
                            <button class="btn btn-secondary" id="studentsRefreshBtn" type="button">Обновить</button>
                            <button class="btn btn-outline" id="studentsExportBtn" type="button">Экспорт CSV</button>
                        </div>
                    </section>

                    <section class="students-toolbar dashboard-section">
                        <div class="students-filter-grid">
                            <div class="filter-group">
                                <label for="studentsSearchInput">Поиск</label>
                                <input id="studentsSearchInput" class="form-input" type="text" placeholder="ФИО или логин">
                            </div>
                            <div class="filter-group">
                                <label for="studentsStatusFilter">Статус</label>
                                <select id="studentsStatusFilter" class="filter-select">
                                    <option value="all">Все</option>
                                    <option value="active">Активен</option>
                                    <option value="inactive">Неактивен</option>
                                </select>
                            </div>
                            <div class="filter-group">
                                <label for="studentsProgressFilter">Прогресс</label>
                                <select id="studentsProgressFilter" class="filter-select">
                                    <option value="all">Все</option>
                                    <option value="with_attempts">Есть попытки</option>
                                    <option value="no_attempts">Без попыток</option>
                                </select>
                            </div>
                            <div class="filter-group">
                                <label for="studentsSortFilter">Сортировка</label>
                                <select id="studentsSortFilter" class="filter-select">
                                    <option value="name_asc">По имени (А-Я)</option>
                                    <option value="score_desc">По среднему баллу</option>
                                    <option value="last_activity_desc">По последней активности</option>
                                </select>
                            </div>
                            <div class="filter-group">
                                <label for="studentsClassFilter">Класс</label>
                                <select id="studentsClassFilter" class="filter-select">
                                    <option value="">Выберите класс</option>
                                </select>
                            </div>
                        </div>
                    </section>

                    <section class="students-kpi-grid" id="studentsKpiGrid">
                        <div class="report-kpi tone-blue"><span>Всего учеников</span><strong id="studentsKpiTotal">0</strong></div>
                        <div class="report-kpi tone-violet"><span>Активных</span><strong id="studentsKpiActive">0</strong></div>
                        <div class="report-kpi tone-rose"><span>В зоне риска</span><strong id="studentsKpiRisk">0</strong></div>
                    </section>

                    <section class="students-grid-bottom">
                        <div class="dashboard-section students-card">
                            <div class="section-header">
                                <h2 class="section-title">Список учеников</h2>
                                <div class="students-bulk" id="studentsBulkPanel">
                                    <button class="btn btn-outline" id="studentsBulkResetBtn" type="button" disabled>Сбросить пароль выбранным</button>
                                </div>
                            </div>
                            <div class="table-responsive mobile-stack-table">
                                <table class="data-table">
                                    <thead>
                                        <tr>
                                            <th class="bulk-checkbox-cell"><input type="checkbox" id="studentsSelectAll"></th>
                                            <th>№</th>
                                            <th>ФИО</th>
                                            <th>Логин</th>
                                            <th>Класс</th>
                                            <th>Тестов пройдено</th>
                                            <th>Средний балл</th>
                                            <th>Последняя активность</th>
                                            <th>Статус</th>
                                            <th>Действия</th>
                                        </tr>
                                    </thead>
                                    <tbody id="studentsTableBody">
                                        <tr><td colspan="10" class="empty-row">Загрузка...</td></tr>
                                    </tbody>
                                </table>
                            </div>
                            <div class="students-pagination" id="studentsPagination"></div>
                        </div>
                    </section>

                    <div class="modal-overlay hidden" id="studentsDetailModal">
                        <div class="modal students-modal">
                            <div class="modal-header">
                                <h3 id="studentsModalTitle">Отчет ученика</h3>
                                <button class="modal-close" type="button" id="studentsModalClose">&#215;</button>
                            </div>
                            <div class="modal-body" id="studentsModalBody"></div>
                            <div class="modal-actions">
                                <button class="btn btn-primary" type="button" id="studentsModalOk">Закрыть</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        if (page === 'calendar' && role === 'teacher') {
            return `
                <div class="calendar-page" id="calendarPage">
                    <section class="calendar-hero dashboard-section">
                        <div>
                            <h1 class="section-title">Календарь</h1>
                            <p class="page-subtitle">План назначений, дедлайнов и активностей по классам</p>
                        </div>
                        <div class="calendar-hero-actions">
                            <button class="btn btn-secondary" id="calendarTodayBtn" type="button">Сегодня</button>
                            <button class="btn btn-outline" id="calendarExportIcsBtn" type="button">Экспорт .ics</button>
                            <button class="btn btn-outline" id="calendarPdfBtn" type="button">Export PDF</button>
                        </div>
                    </section>

                    <section class="calendar-toolbar dashboard-section">
                        <div class="calendar-nav">
                            <button class="btn btn-outline" id="calendarPrevBtn" type="button">&#9664;</button>
                            <h2 id="calendarMonthLabel">Месяц</h2>
                            <button class="btn btn-outline" id="calendarNextBtn" type="button">&#9654;</button>
                        </div>
                        <div class="calendar-filters">
                            <div class="filter-group">
                                <label for="calendarClassFilter">Класс</label>
                                <select id="calendarClassFilter" class="filter-select">
                                    <option value="all">Все классы</option>
                                </select>
                            </div>
                            <div class="filter-group">
                                <label for="calendarStatusFilter">Статус</label>
                                <select id="calendarStatusFilter" class="filter-select">
                                    <option value="all">Все</option>
                                    <option value="upcoming">Предстоит</option>
                                    <option value="active">Активные</option>
                                    <option value="completed">Завершенные</option>
                                    <option value="inactive">Неактивные</option>
                                </select>
                            </div>
                            <div class="filter-group">
                                <label for="calendarSearchInput">Поиск</label>
                                <input id="calendarSearchInput" class="form-input" type="text" placeholder="Тест, класс, предмет">
                            </div>
                        </div>
                    </section>

                    <section class="calendar-kpi-grid">
                        <div class="report-kpi tone-blue"><span>Всего событий</span><strong id="calendarKpiTotal">0</strong></div>
                        <div class="report-kpi tone-green"><span>Активные</span><strong id="calendarKpiActive">0</strong></div>
                        <div class="report-kpi tone-orange"><span>Предстоят</span><strong id="calendarKpiUpcoming">0</strong></div>
                        <div class="report-kpi tone-rose"><span>Завершены</span><strong id="calendarKpiCompleted">0</strong></div>
                    </section>

                    <section class="calendar-layout">
                        <div class="dashboard-section">
                            <div class="calendar-weekdays">
                                <span>Пн</span><span>Вт</span><span>Ср</span><span>Чт</span><span>Пт</span><span>Сб</span><span>Вс</span>
                            </div>
                            <div class="calendar-grid" id="calendarGrid"></div>
                        </div>
                        <div class="dashboard-section calendar-side">
                            <div class="section-header">
                                <h2 class="section-title">События дня</h2>
                                <span id="calendarSelectedDateLabel">-</span>
                            </div>
                            <div class="calendar-day-events" id="calendarDayEvents">
                                <p class="text-secondary">Выберите дату в календаре</p>
                            </div>
                        </div>
                    </section>

                    <section class="dashboard-section">
                        <div class="section-header">
                            <h2 class="section-title">Ближайшие назначения</h2>
                        </div>
                        <div class="table-responsive mobile-stack-table">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>Тест</th>
                                        <th>Класс</th>
                                        <th>Предмет</th>
                                        <th>Начало</th>
                                        <th>Окончание</th>
                                        <th>Статус</th>
                                        <th>Действия</th>
                                    </tr>
                                </thead>
                                <tbody id="calendarUpcomingTableBody">
                                    <tr><td colspan="7" class="empty-row">Загрузка...</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <div class="modal-overlay hidden" id="calendarEventModal">
                        <div class="modal calendar-event-modal">
                            <div class="modal-header">
                                <h3 id="calendarEventModalTitle">Событие</h3>
                                <button class="modal-close" id="calendarEventModalClose" type="button">&#215;</button>
                            </div>
                            <div class="modal-body" id="calendarEventModalBody"></div>
                            </div>
                    </div>
                </div>
            `;
        }

        if (page === 'calendar' && role === 'student') {
            return `
                <div class="calendar-page" id="calendarPage">
                    <section class="calendar-hero dashboard-section">
                        <div>
                            <h1 class="section-title">Календарь</h1>
                            <p class="page-subtitle">Ваши тесты, дедлайны и активные назначения</p>
                        </div>
                        <div class="calendar-hero-actions">
                            <button class="btn btn-secondary" id="calendarTodayBtn" type="button">Сегодня</button>
                            <button class="btn btn-outline" id="calendarExportIcsBtn" type="button">Экспорт .ics</button>
                            <button class="btn btn-outline" id="calendarPdfBtn" type="button">Export PDF</button>
                        </div>
                    </section>

                    <section class="calendar-toolbar dashboard-section">
                        <div class="calendar-nav">
                            <button class="btn btn-outline" id="calendarPrevBtn" type="button">&#9664;</button>
                            <h2 id="calendarMonthLabel">Месяц</h2>
                            <button class="btn btn-outline" id="calendarNextBtn" type="button">&#9654;</button>
                        </div>
                        <div class="calendar-filters">
                            <div class="filter-group">
                                <label for="calendarStatusFilter">Статус</label>
                                <select id="calendarStatusFilter" class="filter-select">
                                    <option value="all">Все</option>
                                    <option value="upcoming">Предстоящие</option>
                                    <option value="active">Активные</option>
                                    <option value="completed">Завершенные</option>
                                    <option value="inactive">Неактивные</option>
                                </select>
                            </div>
                            <div class="filter-group">
                                <label for="calendarSearchInput">Поиск</label>
                                <input id="calendarSearchInput" class="form-input" type="text" placeholder="Тест, предмет">
                            </div>
                        </div>
                    </section>

                    <section class="calendar-kpi-grid">
                        <div class="report-kpi tone-blue"><span>Всего событий</span><strong id="calendarKpiTotal">0</strong></div>
                        <div class="report-kpi tone-green"><span>Активные</span><strong id="calendarKpiActive">0</strong></div>
                        <div class="report-kpi tone-orange"><span>Предстоят</span><strong id="calendarKpiUpcoming">0</strong></div>
                        <div class="report-kpi tone-rose"><span>Завершены</span><strong id="calendarKpiCompleted">0</strong></div>
                    </section>

                    <section class="calendar-layout">
                        <div class="dashboard-section">
                            <div class="calendar-weekdays">
                                <span>Пн</span><span>Вт</span><span>Ср</span><span>Чт</span><span>Пт</span><span>Сб</span><span>Вс</span>
                            </div>
                            <div class="calendar-grid" id="calendarGrid"></div>
                        </div>
                        <div class="dashboard-section calendar-side">
                            <div class="section-header">
                                <h2 class="section-title">События дня</h2>
                                <span id="calendarSelectedDateLabel">-</span>
                            </div>
                            <div class="calendar-day-events" id="calendarDayEvents">
                                <p class="text-secondary">Выберите дату в календаре</p>
                            </div>
                        </div>
                    </section>

                    <section class="dashboard-section">
                        <div class="section-header">
                            <h2 class="section-title">Ближайшие назначения</h2>
                        </div>
                        <div class="table-responsive mobile-stack-table">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>Тест</th>
                                        <th>Предмет</th>
                                        <th>Начало</th>
                                        <th>Окончание</th>
                                        <th>Статус</th>
                                        <th>Действия</th>
                                    </tr>
                                </thead>
                                <tbody id="calendarUpcomingTableBody">
                                    <tr><td colspan="6" class="empty-row">Загрузка...</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <div class="modal-overlay hidden" id="calendarEventModal">
                        <div class="modal calendar-event-modal">
                            <div class="modal-header">
                                <h3 id="calendarEventModalTitle">Событие</h3>
                                <button class="modal-close" id="calendarEventModalClose" type="button">&#215;</button>
                            </div>
                            <div class="modal-body" id="calendarEventModalBody"></div>
                            <div class="modal-actions">
                                <button class="btn btn-primary" type="button" id="calendarEventModalOk">ОК</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        // Schools Management (SuperAdmin)
        if (page === 'schools') {
            return `
                <div class="page-toolbar">
                    <div class="search-box">
                        <input
                            type="text"
                            id="schoolsSearch"
                            class="search-input"
                            placeholder="Search schools..."
                        />
                    </div>
                    <div class="toolbar-right">
                        <select id="statusFilter" class="select-input">
                            <option value="all">All</option>
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                        </select>
                        <button class="btn btn-primary" id="addSchoolBtn">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="12" y1="5" x2="12" y2="19"></line>
                                <line x1="5" y1="12" x2="19" y2="12"></line>
                            </svg>
                            Add School
                        </button>
                    </div>
                </div>
                <div id="schoolsContainer"></div>
            `;
        }

        // School Admins Management (SuperAdmin)
        if (page === 'school-admins') {
            return `
                <div class="page-header-section">
                    <h1 class="page-main-title">School Administrators</h1>
                    <p class="page-subtitle">Manage school directors and administrators</p>
                </div>
                <div class="page-toolbar">
                    <div class="search-box">
                        <input
                            type="text"
                            id="adminsSearch"
                            class="search-input"
                            placeholder="Search administrators..."
                        />
                    </div>
                    <div class="toolbar-right">
                        <select id="schoolFilterAdmins" class="select-input">
                            <option value="all">All Schools</option>
                        </select>
                        <button class="btn btn-secondary" id="exportAdminsBtn">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="7 10 12 15 17 10"></polyline>
                                <line x1="12" y1="15" x2="12" y2="3"></line>
                            </svg>
                            Export
                        </button>
                        <button class="btn btn-primary" id="addAdminBtn">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="12" y1="5" x2="12" y2="19"></line>
                                <line x1="5" y1="12" x2="19" y2="12"></line>
                            </svg>
                            Add School Admin
                        </button>
                    </div>
                </div>
                <div id="adminsContainer">
                    <div class="empty-state">
                        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                            <circle cx="9" cy="7" r="4"></circle>
                            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                        </svg>
                        <p>No school administrators yet. Click "Add School Admin" to get started.</p>
                    </div>
                </div>
            `;
        }

        // Import Users (School Admin)
        if (page === 'import') {
            if (role !== 'school_admin') {
                return `
                    <div class="dashboard-section">
                        <div class="section-header">
                            <h2 class="section-title">${t('dashboard.nav.import', 'Импорт')}</h2>
                        </div>
                        <p style="color: var(--text-secondary);">${t('tools.schoolAdminOnly', 'Этот раздел доступен только для администратора школы.')}</p>
                    </div>
                `;
            }

            return `
                <div class="import-page">
                    <div class="page-header-section import-header">
                        <h1 class="page-main-title" data-i18n="import.title">Import users</h1>
                        <p class="page-subtitle" data-i18n="import.subtitle">Upload Excel files and create users in bulk</p>
                    </div>

                    <div class="import-layout">
                        <div class="dashboard-section import-lane" data-import-lane="student">
                            <div class="section-header">
                                <h2 class="section-title" data-i18n="tools.students">${t('tools.students', 'Ученики')}</h2>
                                <button class="btn btn-secondary download-template-btn" data-import-type="student" data-i18n="import.downloadTemplate">Download template</button>
                            </div>
                            <input type="file" id="importFileStudent" class="import-file-input" data-import-type="student" accept=".xlsx,.xls,.csv" />
                            <div class="import-file-row">
                                <button class="btn btn-outline import-file-trigger" type="button" data-target="importFileStudent" data-i18n="tools.chooseFile">${t('tools.chooseFile', 'Выбрать файл')}</button>
                                <span class="import-file-name" id="importFileStudentName" data-i18n="tools.noFileSelected">${t('tools.noFileSelected', 'Файл не выбран')}</span>
                            </div>
                            <button class="btn btn-primary start-import-btn" type="button" data-import-type="student" data-i18n="import.start">Start import</button>
                        </div>

                        <div class="dashboard-section import-lane" data-import-lane="teacher">
                            <div class="section-header">
                                <h2 class="section-title" data-i18n="tools.teachers">${t('tools.teachers', 'Учителя')}</h2>
                                <button class="btn btn-secondary download-template-btn" data-import-type="teacher" data-i18n="import.downloadTemplate">Download template</button>
                            </div>
                            <input type="file" id="importFileTeacher" class="import-file-input" data-import-type="teacher" accept=".xlsx,.xls,.csv" />
                            <div class="import-file-row">
                                <button class="btn btn-outline import-file-trigger" type="button" data-target="importFileTeacher" data-i18n="tools.chooseFile">${t('tools.chooseFile', 'Выбрать файл')}</button>
                                <span class="import-file-name" id="importFileTeacherName" data-i18n="tools.noFileSelected">${t('tools.noFileSelected', 'Файл не выбран')}</span>
                            </div>
                            <button class="btn btn-primary start-import-btn" type="button" data-import-type="teacher" data-i18n="import.start">Start import</button>
                        </div>

                        <div class="dashboard-section import-lane" data-import-lane="teaching-assignments">
                            <div class="section-header">
                                <h2 class="section-title">${t('tools.teachingAssignmentsImport', 'Назначения преподавания')}</h2>
                                <button class="btn btn-secondary download-template-btn" data-import-type="teaching_assignments">${t('import.downloadTemplate', 'Скачать шаблон')}</button>
                            </div>
                            <input type="file" id="importFileTeachingAssignments" class="import-file-input" data-import-type="teaching_assignments" accept=".xlsx,.xls,.csv" />
                            <div class="import-file-row">
                                <button class="btn btn-outline import-file-trigger" type="button" data-target="importFileTeachingAssignments">${t('tools.chooseFile', 'Выбрать файл')}</button>
                                <span class="import-file-name" id="importFileTeachingAssignmentsName">${t('tools.noFileSelected', 'Файл не выбран')}</span>
                            </div>
                            <button class="btn btn-primary start-import-btn" type="button" data-import-type="teaching_assignments">${t('import.start', 'Начать импорт')}</button>
                            <p class="text-secondary" style="margin-top: 8px;">
                                ${t('tools.teachingAssignmentsImportHint', 'Значение больше 0 означает, что учитель ведет предмет в выбранном классе.')}
                            </p>
                        </div>
                    </div>

                    <div class="dashboard-section import-results" id="importResults"></div>
                </div>
            `;
        }

        // Export Users (School Admin)
        if (page === 'export') {
            if (role !== 'school_admin') {
                return `
                    <div class="dashboard-section">
                        <div class="section-header">
                            <h2 class="section-title">${t('dashboard.nav.export', 'Экспорт')}</h2>
                        </div>
                        <p style="color: var(--text-secondary);">${t('tools.schoolAdminOnly', 'Этот раздел доступен только для администратора школы.')}</p>
                    </div>
                `;
            }

            return `
                <div class="export-page">
                    <div class="page-header-section export-header">
                        <h1 class="page-main-title" data-i18n="export.title">${t('export.title', 'Экспорт данных')}</h1>
                        <p class="page-subtitle" data-i18n="export.subtitle">${t('export.subtitle', 'Скачайте Excel-отчеты для анализа и архивации')}</p>
                    </div>
                    <div class="export-layout">
                        <div class="dashboard-section export-card export-card-main">
                            <div class="section-header">
                                <h2 class="section-title" data-i18n="export.usersTitle">${t('export.usersTitle', 'Экспорт пользователей')}</h2>
                                <span class="export-chip" id="exportStatusChip" data-i18n="tools.readyToExport">${t('tools.readyToExport', 'Готово к экспорту')}</span>
                            </div>
                            <p class="export-hint" data-i18n="export.usersHint">${t('export.usersHint', 'Файл содержит пользователей школы, классы и номера в журнале.')}</p>
                            <div class="export-filters-grid">
                                <div class="filter-group">
                                    <label for="exportRoleFilter" data-i18n="export.filter.roleLabel">${t('export.filter.roleLabel', 'Роль')}</label>
                                    <select id="exportRoleFilter" class="form-input">
                                        <option value="all" data-i18n="export.filter.roleAll">${t('export.filter.roleAll', 'Все роли')}</option>
                                        <option value="student" data-i18n="export.filter.roleStudent">${t('export.filter.roleStudent', 'Ученики')}</option>
                                        <option value="teacher" data-i18n="export.filter.roleTeacher">${t('export.filter.roleTeacher', 'Учителя')}</option>
                                        <option value="school_admin" data-i18n="export.filter.roleAdmin">${t('export.filter.roleAdmin', 'Администраторы')}</option>
                                    </select>
                                </div>
                                <div class="filter-group">
                                    <label for="exportStatusFilter" data-i18n="export.filter.statusLabel">${t('export.filter.statusLabel', 'Статус')}</label>
                                    <select id="exportStatusFilter" class="form-input">
                                        <option value="all" data-i18n="export.filter.statusAll">${t('export.filter.statusAll', 'Все')}</option>
                                        <option value="active" data-i18n="export.filter.statusActive">${t('export.filter.statusActive', 'Активные')}</option>
                                        <option value="inactive" data-i18n="export.filter.statusInactive">${t('export.filter.statusInactive', 'Неактивные')}</option>
                                    </select>
                                </div>
                                <div class="filter-group">
                                    <label for="exportClassFilter" data-i18n="export.filter.classLabel">${t('export.filter.classLabel', 'Класс')}</label>
                                    <select id="exportClassFilter" class="form-input">
                                        <option value="all" data-i18n="export.filter.classAll">${t('export.filter.classAll', 'Все классы')}</option>
                                    </select>
                                </div>
                            </div>
                            <div class="export-actions-row export-filter-actions">
                                <button class="btn btn-outline" id="applyExportFiltersBtn" type="button" data-i18n="export.filter.apply">${t('export.filter.apply', 'Применить фильтры')}</button>
                                <button class="btn btn-outline" id="resetExportFiltersBtn" type="button" data-i18n="export.filter.reset">${t('export.filter.reset', 'Сбросить')}</button>
                            </div>
                            <div class="export-actions-row">
                                <button class="btn btn-primary" id="exportUsersBtn" data-i18n="export.downloadUsers">${t('export.downloadUsers', 'Скачать пользователей')}</button>
                                <button class="btn btn-secondary" id="refreshExportPreviewBtn" type="button" data-i18n="tools.refreshPreview">${t('tools.refreshPreview', 'Обновить превью')}</button>
                            </div>
                            <div class="export-last-meta" id="exportLastMeta" data-i18n="tools.exportHistoryEmpty">
                                ${t('tools.exportHistoryEmpty', 'История экспорта пуста.')}
                            </div>
                        </div>
                        <div class="dashboard-section export-card export-card-preview">
                            <div class="section-header">
                                <h2 class="section-title" data-i18n="tools.dataPreview">${t('tools.dataPreview', 'Предпросмотр данных')}</h2>
                                <span class="export-chip subtle" id="exportPreviewUpdated" data-i18n="tools.notUpdated">${t('tools.notUpdated', 'Не обновлено')}</span>
                            </div>
                            <div class="export-preview-grid">
                                <div class="export-preview-item">
                                    <span data-i18n="common.total">${t('common.total', 'Всего')}</span>
                                    <strong id="exportTotalUsers">-</strong>
                                </div>
                                <div class="export-preview-item">
                                    <span data-i18n="tools.students">${t('tools.students', 'Ученики')}</span>
                                    <strong id="exportStudentUsers">-</strong>
                                </div>
                                <div class="export-preview-item">
                                    <span data-i18n="tools.teachers">${t('tools.teachers', 'Учителя')}</span>
                                    <strong id="exportTeacherUsers">-</strong>
                                </div>
                            </div>
                            <p class="export-hint" data-i18n="tools.checkCountsHint">${t('tools.checkCountsHint', 'Проверьте количество перед скачиванием файла.')}</p>
                        </div>
                    </div>
                </div>
            `;
        }

        // School Comparison (SuperAdmin)
        if (page === 'comparison') {
            return `
                <div class="page-header-section">
                    <h1 class="page-main-title">School Comparison</h1>
                    <p class="page-subtitle">Compare performance across schools</p>
                </div>
                <div class="page-toolbar">
                    <div class="search-box">
                        <select id="comparisonMetric" class="select-input">
                            <option value="avg_score">Average Score</option>
                            <option value="test_completion">Test Completion Rate</option>
                            <option value="student_count">Student Count</option>
                            <option value="teacher_count">Teacher Count</option>
                        </select>
                    </div>
                    <div class="toolbar-right">
                        <select id="timePeriod" class="select-input">
                            <option value="week">Last Week</option>
                            <option value="month">Last Month</option>
                            <option value="quarter">Last Quarter</option>
                            <option value="year">Last Year</option>
                        </select>
                        <button class="btn btn-secondary" id="exportComparisonBtn">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="7 10 12 15 17 10"></polyline>
                                <line x1="12" y1="15" x2="12" y2="3"></line>
                            </svg>
                            Export Report
                        </button>
                    </div>
                </div>
                <div id="comparisonContainer">
                    <div class="stats-grid">
                        <div class="stat-card">
                            <div class="stat-icon blue">
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    ${icons.building}
                                </svg>
                            </div>
                            <div class="stat-content">
                                <div class="stat-label">Top Performer</div>
                                <div class="stat-value">School #1</div>
                            </div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon green">
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    ${icons.chart}
                                </svg>
                            </div>
                            <div class="stat-content">
                                <div class="stat-label">Avg Score</div>
                                <div class="stat-value">87.5%</div>
                            </div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon orange">
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    ${icons.users}
                                </svg>
                            </div>
                            <div class="stat-content">
                                <div class="stat-label">Total Students</div>
                                <div class="stat-value">2,456</div>
                            </div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-icon purple">
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    ${icons.clipboard}
                                </svg>
                            </div>
                            <div class="stat-content">
                                <div class="stat-label">Tests Taken</div>
                                <div class="stat-value">12,345</div>
                            </div>
                        </div>
                    </div>
                    <div class="dashboard-section">
                        <div class="section-header">
                            <h2 class="section-title">School Performance</h2>
                        </div>
                        <div id="comparisonChart" style="min-height: 400px; display: flex; align-items: center; justify-content: center; color: var(--text-secondary);">
                            Performance chart will be displayed here
                        </div>
                    </div>
                </div>
            `;
        }

        // Advanced Analytics (School Admin / Teacher)
        if (page === 'advanced') {
            if (role !== 'school_admin' && role !== 'teacher') {
                return `
                    <div class="dashboard-section">
                        <div class="section-header">
                            <h2 class="section-title" data-i18n="advanced_analytics">Расширенная аналитика</h2>
                        </div>
                        <p style="color: var(--text-secondary);">This section is only available for School Admin and Teacher.</p>
                    </div>
                `;
            }

            return `
                <div class="advanced-analytics" id="advancedAnalyticsRoot">
                    <div class="analytics-container">
                        <div class="page-header-section">
                            <h1 class="page-main-title" data-i18n="advanced_analytics">Расширенная аналитика</h1>
                        </div>

                        <div class="filters" id="advancedFilters">
                            <div class="filter-group">
                                <label data-i18n="period">Период</label>
                                <select id="periodFilter">
                                    <option value="7">Последние 7 дней</option>
                                    <option value="30" selected>Последние 30 дней</option>
                                    <option value="90">Последние 90 дней</option>
                                    <option value="365">Последний год</option>
                                </select>
                            </div>
                            <div class="filter-group">
                                <label data-i18n="grade_level">Параллель</label>
                                <select id="gradeLevelFilter">
                                </select>
                            </div>
                            <div class="filter-group">
                                <label data-i18n="reports.class">Класс</label>
                                <select id="advancedClassFilter">
                                    <option value="">Все классы</option>
                                </select>
                            </div>
                            <div class="filter-group">
                                <label data-i18n="subject">Предмет</label>
                                <select id="subjectFilter">
                                    <option value="">Все предметы</option>
                                </select>
                            </div>
                            <button class="btn btn-outline" type="button" id="exportAdvancedAnalytics" data-i18n="export">Экспорт</button>
                        </div>

                        <div class="analytics-grid" id="overviewStats">
                            <div class="stat-card">
                                <h3 data-i18n="total_students">Всего студентов</h3>
                                <div class="stat-value" id="totalStudents">-</div>
                            </div>
                            <div class="stat-card">
                                <h3 data-i18n="average_score">Средний балл</h3>
                                <div class="stat-value" id="avgScore">-</div>
                            </div>
                            <div class="stat-card">
                                <h3 data-i18n="total_tests">Всего тестов</h3>
                                <div class="stat-value" id="totalTests">-</div>
                            </div>
                            <div class="stat-card">
                                <h3 data-i18n="total_attempts">Всего попыток</h3>
                                <div class="stat-value" id="totalAttempts">-</div>
                            </div>
                        </div>

                        <div class="tabs">
                            <button class="tab active" type="button" data-tab="heatmap">
                                <span data-i18n="heatmap">Тепловая карта</span>
                            </button>
                            <button class="tab" type="button" data-tab="comparison">
                                <span data-i18n="comparison">Сравнение</span>
                            </button>
                            <button class="tab" type="button" data-tab="trends">
                                <span data-i18n="trends">Тренды</span>
                            </button>
                            <button class="tab" type="button" data-tab="subjects">
                                <span data-i18n="subjects">По предметам</span>
                            </button>
                        </div>

                        <div class="tab-content active" id="heatmap-content">
                            <div class="chart-card">
                                <h2>
                                    <span data-i18n="performance_heatmap">Тепловая карта успеваемости</span>
                                </h2>
                                <p class="chart-subtitle" data-i18n="heatmap_description">
                                    Визуализация средних баллов по предметам и неделям
                                </p>
                                <div class="heatmap-legend">
                                    <span class="legend-title">Легенда:</span>
                                    <div class="legend-item">
                                        <div class="legend-color" style="background: linear-gradient(to right, #ef4444, #f97316);"></div>
                                        <span>0-50%</span>
                                    </div>
                                    <div class="legend-item">
                                        <div class="legend-color" style="background: linear-gradient(to right, #f97316, #fbbf24);"></div>
                                        <span>50-70%</span>
                                    </div>
                                    <div class="legend-item">
                                        <div class="legend-color" style="background: linear-gradient(to right, #fbbf24, #84cc16);"></div>
                                        <span>70-85%</span>
                                    </div>
                                    <div class="legend-item">
                                        <div class="legend-color" style="background: linear-gradient(to right, #84cc16, #22c55e);"></div>
                                        <span>85-100%</span>
                                    </div>
                                </div>
                                <div class="heatmap-container">
                                    <div id="heatmapCanvas" class="loading">
                                        <div class="spinner"></div>
                                        <span>Загрузка данных...</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="tab-content" id="comparison-content">
                            <div class="chart-card">
                                <h2>
                                    <span data-i18n="class_comparison">Сравнение классов</span>
                                    <select id="comparisonType">
                                        <option value="classes">По классам</option>
                                        <option value="subjects">По предметам</option>
                                        <option value="students">По ученикам</option>
                                    </select>
                                </h2>
                                <div class="chart-container">
                                    <canvas id="comparisonChart"></canvas>
                                </div>
                            </div>

                            <div class="chart-card">
                                <h2 data-i18n="detailed_comparison">Детальное сравнение</h2>
                                <div class="table-container">
                                    <table class="comparison-table" id="comparisonTable">
                                        <thead>
                                            <tr>
                                                <th>Название</th>
                                                <th>Попыток</th>
                                                <th>Средний балл</th>
                                                <th>Мин балл</th>
                                                <th>Макс балл</th>
                                                <th>Прогресс</th>
                                            </tr>
                                        </thead>
                                        <tbody id="comparisonTableBody">
                                            <tr>
                                                <td colspan="6" class="loading">
                                                    <div class="spinner"></div>
                                                    <span>Загрузка данных...</span>
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        <div class="tab-content" id="trends-content">
                            <div class="chart-card">
                                <h2 data-i18n="activity_trends">Тренды активности</h2>
                                <div class="chart-container">
                                    <canvas id="trendsChart"></canvas>
                                </div>
                            </div>

                            <div class="analytics-grid">
                                <div class="chart-card">
                                    <h2 data-i18n="top_classes">Лучшие классы</h2>
                                    <div id="topClassesList"></div>
                                </div>
                                <div class="chart-card">
                                    <h2 data-i18n="needs_attention">Требуют внимания</h2>
                                    <div id="needsAttentionList"></div>
                                </div>
                            </div>
                        </div>

                        <div class="tab-content" id="subjects-content">
                            <div class="chart-card">
                                <h2 data-i18n="subject_performance">Успеваемость по предметам</h2>
                                <div class="chart-container">
                                    <canvas id="subjectsChart"></canvas>
                                </div>
                            </div>

                            <div class="chart-card">
                                <h2 data-i18n="subject_stats">Статистика по предметам</h2>
                                <div class="table-container">
                                    <table class="comparison-table">
                                        <thead>
                                            <tr>
                                                <th>Предмет</th>
                                                <th>Тестов</th>
                                                <th>Попыток</th>
                                                <th>Средний балл</th>
                                                <th>Среднее время (мин)</th>
                                            </tr>
                                        </thead>
                                        <tbody id="subjectsTableBody">
                                            <tr>
                                                <td colspan="5" class="loading">
                                                    <div class="spinner"></div>
                                                    <span>Загрузка данных...</span>
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        // Users Management (SchoolAdmin)
        if (page === 'users') {
            return `
                <div class="page-toolbar">
                    <div class="search-box">
                        <input
                            type="text"
                            id="usersSearch"
                            class="search-input"
                            placeholder="${t('users.searchPlaceholder', 'Поиск пользователей...')}"
                        />
                    </div>
                    <div class="toolbar-right">
                        <div class="page-size-control">
                            <label for="usersPerPage" class="page-size-label">${t('users.rows', 'Строк:')}</label>
                            <select id="usersPerPage" class="select-input page-size-select">
                                <option value="10">10</option>
                                <option value="20">20</option>
                                <option value="50">50</option>
                                <option value="100">100</option>
                            </select>
                        </div>
                        <select id="roleFilter" class="select-input">
                            <option value="all">${t('users.allRoles', 'Все роли')}</option>
                            <option value="school_admin">${t('settings.role.school_admin', 'Администратор школы')}</option>
                            <option value="teacher">${t('settings.role.teacher', 'Учитель')}</option>
                            <option value="student">${t('settings.role.student', 'Ученик')}</option>
                        </select>
                        <button class="btn btn-primary" id="addUserBtn">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="12" y1="5" x2="12" y2="19"></line>
                                <line x1="5" y1="12" x2="19" y2="12"></line>
                            </svg>
                            ${t('users.addUser', 'Добавить пользователя')}
                        </button>
                    </div>
                </div>
                <div id="usersContainer"></div>
            `;
        }

        // Classes Management (SchoolAdmin)
        if (page === 'classes') {
            return `
                <div class="page-toolbar">
                    <div class="search-box">
                        <input
                            type="text"
                            id="classesSearch"
                            class="search-input"
                            placeholder="${t('classes.searchPlaceholder', 'РџРѕРёСЃРє РєР»Р°СЃСЃРѕРІ...')}"
                        />
                    </div>
                    <div class="toolbar-right">
                        <div class="page-size-control">
                            <label for="classesPerPage" class="page-size-label">${t('classes.rows', 'РЎС‚СЂРѕРє:')}</label>
                            <select id="classesPerPage" class="select-input page-size-select">
                                <option value="10">10</option>
                                <option value="20">20</option>
                                <option value="50">50</option>
                                <option value="100">100</option>
                            </select>
                        </div>
                        <select id="gradeFilter" class="select-input">
                            <option value="all">${t('classes.allGrades', 'Р’СЃРµ РїР°СЂР°Р»Р»РµР»Рё')}</option>
                            ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
                                .map((grade) => `<option value="${grade}">${grade} ${t('results.grade', 'класс')}</option>`)
                                .join('')}
                        </select>
                        <button class="btn btn-primary" id="addClassBtn">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="12" y1="5" x2="12" y2="19"></line>
                                <line x1="5" y1="12" x2="19" y2="12"></line>
                            </svg>
                            ${t('classes.addClass', 'Р”РѕР±Р°РІРёС‚СЊ РєР»Р°СЃСЃ')}
                        </button>
                    </div>
                </div>
                <div id="classesContainer"></div>
            `;
        }

        // Subjects Management (SchoolAdmin)
        if (page === 'subjects') {
            return `
                <div class="page-toolbar">
                    <div class="search-box">
                        <input
                            type="text"
                            id="subjectsSearch"
                            class="search-input"
                            placeholder="${t('subjects.searchPlaceholder', 'Поиск предметов...')}"
                        />
                    </div>
                    <div class="toolbar-right">
                        <div class="page-size-control">
                            <label for="subjectsPerPage" class="page-size-label">${t('subjects.rows', 'Строк:')}</label>
                            <select id="subjectsPerPage" class="select-input page-size-select">
                                <option value="10">10</option>
                                <option value="20">20</option>
                                <option value="50">50</option>
                                <option value="100">100</option>
                            </select>
                        </div>
                        <button class="btn btn-primary" id="addSubjectBtn">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="12" y1="5" x2="12" y2="19"></line>
                                <line x1="5" y1="12" x2="19" y2="12"></line>
                            </svg>
                            ${t('subjects.addSubject', 'Добавить предмет')}
                        </button>
                    </div>
                </div>
                <div id="subjectsContainer"></div>
            `;
        }

        // Tests Management (Teacher/Student)
        if (page === 'tests') {
            if (role === 'student') {
                return `
                    <div class="page-tabs">
                        <div class="tabs">
                            <button class="tab active" data-tab="available">${t('tests.availableTests', 'Доступные тесты')}</button>
                            <button class="tab" data-tab="completed">${t('tests.completedTests', 'Завершенные тесты')}</button>
                        </div>
                    </div>
                    <div id="testsContainer"></div>
                `;
            } else {
                return `
                    <div class="page-toolbar">
                        <div class="search-box">
                            <input
                                type="text"
                                id="testsSearch"
                                class="search-input"
                                placeholder="${t('tests.searchPlaceholder', 'РџРѕРёСЃРє С‚РµСЃС‚РѕРІ...')}"
                            />
                        </div>
                        <div class="toolbar-filters">
                            <select id="subjectFilter" class="filter-select">
                                <option value="all">${t('tests.allSubjects', 'Р’СЃРµ РїСЂРµРґРјРµС‚С‹')}</option>
                            </select>
                            <select id="statusFilter" class="filter-select">
                                <option value="all">${t('tests.allStatus', 'Все статусы')}</option>
                                <option value="active">${t('tests.statusActive', 'Активный')}</option>
                                <option value="draft">${t('tests.statusDraft', 'Черновик')}</option>
                            </select>
                        </div>
                        <div class="toolbar-right">
                            <button class="btn btn-primary" id="addTestBtn">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="12" y1="5" x2="12" y2="19"></line>
                                    <line x1="5" y1="12" x2="19" y2="12"></line>
                                </svg>
                                ${t('tests.createTest', 'РЎРѕР·РґР°С‚СЊ С‚РµСЃС‚')}
                            </button>
                        </div>
                    </div>
                    <div id="testsContainer"></div>
                `;
            }
        }

        // Teacher Class Analytics
        if (page === 'results' && role === 'teacher') {
            return `
                <div class="page-toolbar">
                    <div class="search-box">
                        <select id="classAnalyticsSelect" class="select-input" style="width: 100%;">
                            <option value="">${t('results.selectClass', 'Выберите класс...')}</option>
                        </select>
                    </div>
                    <div class="toolbar-right">
                        <button class="btn btn-outline" id="refreshAnalyticsBtn">${t('common.refresh', 'РћР±РЅРѕРІРёС‚СЊ')}</button>
                    </div>
                </div>
                <div class="stats-grid" id="classAnalyticsStats"></div>
                <div class="dashboard-section">
                    <div class="section-header">
                        <h2 class="section-title">${t('results.recentAssignments', 'Недавние назначения')}</h2>
                    </div>
                    <div id="classAnalyticsAssignments"></div>
                </div>
                <div class="dashboard-section" id="classAnalyticsNotes"></div>
            `;
        }

        // Student Results
        if (page === 'results' && role === 'student') {
            return `
                <div class="page-toolbar">
                    <div class="search-box">
                        <input
                            type="text"
                            id="studentResultsSearch"
                            class="search-input"
                            placeholder="${t('results.searchPlaceholder', 'РџРѕРёСЃРє СЂРµР·СѓР»СЊС‚Р°С‚РѕРІ...')}"
                        />
                    </div>
                    <div class="toolbar-right">
                        <button class="btn btn-outline" id="studentResultsRefresh">${t('common.refresh', 'РћР±РЅРѕРІРёС‚СЊ')}</button>
                    </div>
                </div>
                <div class="stats-grid" id="studentResultsStats"></div>
                <div class="dashboard-section">
                    <div class="section-header">
                        <h2 class="section-title">${t('results.testHistory', 'РСЃС‚РѕСЂРёСЏ С‚РµСЃС‚РѕРІ')}</h2>
                    </div>
                    <div id="studentResultsTable"></div>
                </div>
            `;
        }

        if (page === 'progress' && role === 'student') {
            return `
                <div class="page-toolbar">
                    <div class="toolbar-right">
                        <button class="btn btn-outline" id="studentProgressRefresh">${t('common.refresh', 'РћР±РЅРѕРІРёС‚СЊ')}</button>
                    </div>
                </div>
                <div class="stats-grid" id="studentProgressStats"></div>
                <div class="dashboard-section">
                    <div class="section-header">
                        <h2 class="section-title">${t('progress.trendTitle', 'Р”РёРЅР°РјРёРєР° РїСЂРѕРіСЂРµСЃСЃР°')}</h2>
                    </div>
                    <div id="studentProgressTrend"></div>
                </div>
                <div class="dashboard-section">
                    <div class="section-header">
                        <h2 class="section-title">${t('progress.bySubjectTitle', 'РџРѕ РїСЂРµРґРјРµС‚Р°Рј')}</h2>
                    </div>
                    <div id="studentProgressSubjects"></div>
                </div>
            `;
        }

        if (page === 'leaderboard' && role === 'student') {
            return `
                <div class="page-toolbar">
                    <div class="toolbar-filters">
                        <select id="leaderboardScope" class="filter-select">
                            <option value="class">${t('leaderboard.scopeClass', 'РљР»Р°СЃСЃ')}</option>
                            <option value="school">${t('leaderboard.scopeSchool', 'РЁРєРѕР»Р°')}</option>
                            <option value="subject">${t('leaderboard.scopeSubject', 'РџСЂРµРґРјРµС‚')}</option>
                        </select>
                        <select id="leaderboardClass" class="filter-select" style="display: none;"></select>
                        <select id="leaderboardSubject" class="filter-select" style="display: none;"></select>
                    </div>
                    <div class="toolbar-right">
                        <button class="btn btn-outline" id="leaderboardRefresh">${t('common.refresh', 'РћР±РЅРѕРІРёС‚СЊ')}</button>
                    </div>
                </div>
                <div class="stats-grid" id="leaderboardStats"></div>
                <div class="dashboard-section">
                    <div class="section-header">
                        <h2 class="section-title">${t('leaderboard.title', 'Р РµР№С‚РёРЅРі')}</h2>
                    </div>
                    <div id="leaderboardTable"></div>
                </div>
            `;
        }

        // Career Orientation (Student)
        if (page === 'career' && role === 'student') {
            return `
                <div class="page-header-section">
                    <h1 class="page-main-title" data-i18n="career.title">Профориентация</h1>
                    <p class="page-subtitle" data-i18n="career.subtitle">Тест интересов и рекомендации по предметам</p>
                </div>
                <div class="career-hub" id="careerHub">
                    <div class="card career-hero-card" id="careerEmptyState">
                        <div class="career-hero-icon" aria-hidden="true">🎯</div>
                        <h2 class="career-hero-title">Определи свои сильные стороны и профессиональные интересы</h2>
                        <p class="career-hero-text">
                            Пройди короткий тест и получи персональные рекомендации по предметам и направлениям.
                            Это поможет выбрать учебный фокус и будущую профессию.
                        </p>
                        <div class="career-hero-actions">
                            <button class="btn btn-primary" id="careerStartBtn" type="button">Пройти тест профориентации</button>
                        </div>
                    </div>

                    <div class="card career-results-card" id="careerResultsState" style="display:none;">
                        <div class="career-results-header">
                            <div>
                                <h2 class="career-results-title">Ваш результат профориентации</h2>
                                <p class="career-results-subtitle">Текущие интересы и рекомендации по предметам</p>
                            </div>
                            <div class="career-results-actions">
                                <button class="btn btn-outline" id="careerRetakeBtn" type="button">Пройти тест заново</button>
                                <button class="btn btn-outline" id="careerPdfExportBtn" type="button">Экспорт PDF</button>
                            </div>
                        </div>

                        <div class="career-meta-strip">
                            <span class="career-reliability" id="careerReliabilityBadge"></span>
                            <span class="career-status" id="careerLastDate"></span>
                        </div>

                        <div class="career-chart-card">
                            <canvas id="careerRadarChart" class="career-radar" style="display:none;"></canvas>
                            <div id="careerResultsEmpty" class="career-chart-empty">Результатов пока нет. Пройдите тест, чтобы увидеть профиль интересов.</div>
                        </div>

                        <section class="career-section">
                            <h3 class="career-section-title">Топ-3 сферы интересов</h3>
                            <div id="careerTopInterestsCards" class="career-top-grid"></div>
                        </section>

                        <section class="career-section">
                            <h3 class="career-section-title">Рекомендуемые предметы</h3>
                            <div id="careerRecommendedCards" class="career-subject-grid"></div>
                        </section>
                    </div>

                </div>
            `;
        }

        // Career Management (SchoolAdmin)
        if (page === 'career-admin' && (role === 'school_admin' || role === 'psychologist')) {
            return `
                <div class="page-header-section">
                    <h1 class="page-main-title">Профориентация: управление</h1>
                    <p class="page-subtitle">Направления интересов и банк вопросов профориентации</p>
                </div>
                <div class="dashboard-section">
                    <div class="section-header">
                        <h2 class="section-title">Направления</h2>
                        <button class="btn btn-primary" id="addCareerInterestBtn" type="button">Добавить направление</button>
                    </div>
                    <div id="careerInterestsTable"></div>
                </div>
                <div class="dashboard-section">
                    <div class="section-header">
                        <h2 class="section-title">Вопросы профориентации</h2>
                        <button class="btn btn-primary" id="addCareerQuestionBtn" type="button">Добавить вопрос</button>
                    </div>
                    <div id="careerQuestionsTable"></div>
                </div>
            `;
        }

        // Test Assignments Management (Teacher)
        if (page === 'assignments') {
            return `
                <div class="page-toolbar">
                    <div class="search-box">
                        <input
                            type="text"
                            id="assignmentsSearch"
                            class="search-input"
                            placeholder="${t('assignments.searchPlaceholder', 'РџРѕРёСЃРє РЅР°Р·РЅР°С‡РµРЅРёР№...')}"
                        />
                    </div>
                    <div class="toolbar-filters">
                        <select id="classFilter" class="filter-select">
                            <option value="all">${t('assignments.allClasses', 'Р’СЃРµ РєР»Р°СЃСЃС‹')}</option>
                        </select>
                        <select id="statusFilter" class="filter-select">
                            <option value="all">${t('assignments.allStatuses', 'Р’СЃРµ СЃС‚Р°С‚СѓСЃС‹')}</option>
                            <option value="active">${t('assignments.statusActive', 'РђРєС‚РёРІРЅРѕ')}</option>
                            <option value="completed">${t('assignments.statusCompleted', 'Р—Р°РІРµСЂС€РµРЅРѕ')}</option>
                            <option value="inactive">${t('assignments.statusInactive', 'РќРµР°РєС‚РёРІРЅРѕ')}</option>
                        </select>
                    </div>
                    <div class="toolbar-right">
                        <button class="btn btn-primary" id="addAssignmentBtn">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="12" y1="5" x2="12" y2="19"></line>
                                <line x1="5" y1="12" x2="19" y2="12"></line>
                            </svg>
                            ${t('assignments.createAssignment', 'РЎРѕР·РґР°С‚СЊ РЅР°Р·РЅР°С‡РµРЅРёРµ')}
                        </button>
                    </div>
                </div>
                <div id="assignmentsContainer"></div>
            `;
        }

        // Career Interests Management (SuperAdmin) - удалено по требованиям RBAC

        // Global Statistics (SuperAdmin) / School Statistics (School Admin)
        if (page === 'statistics') {
            if (role !== 'superadmin') {
                return `
                    <div class="dashboard-section">
                        <div class="section-header">
                            <h2 class="section-title">${t('dashboard.statistics.title', 'Statistics')}</h2>
                        </div>
                        <p style="color: var(--text-secondary);">${t('dashboard.statistics.superadminOnly', 'This section is only available for SuperAdmin.')}</p>
                    </div>
                `;
            }

            return `
                <div class="page-header-section">
                    <h1 class="page-main-title">${t('dashboard.statistics.title', 'Статистика')}</h1>
                    <p class="page-subtitle">${t('statistics.geoFirstSubtitle', 'Geo-first аналитика по регионам, городам и сегментам школ')}</p>
                </div>
                <div class="dashboard-section">
                    <div class="reports-toolbar">
                        <div class="toolbar-filters">
                            <div class="filter-group">
                                <label for="superadminStatsPeriod">${t('reports.period', 'Период')}</label>
                                <select id="superadminStatsPeriod" class="filter-select">
                                    <option value="7">${t('reports.last7Days', 'Последние 7 дней')}</option>
                                    <option value="30" selected>${t('reports.last30Days', 'Последние 30 дней')}</option>
                                    <option value="90">${t('reports.last90Days', 'Последние 90 дней')}</option>
                                    <option value="365">${t('reports.lastYear', 'Последний год')}</option>
                                </select>
                            </div>
                            <div class="filter-group">
                                <label for="superadminStatsRegion">${t('schools.region', 'Область')}</label>
                                <select id="superadminStatsRegion" class="filter-select"></select>
                            </div>
                            <div class="filter-group">
                                <label for="superadminStatsCity">${t('schools.city', 'Город / район')}</label>
                                <select id="superadminStatsCity" class="filter-select" disabled></select>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="stats-grid" id="superadminStatsCards"></div>
                <div class="dashboard-section">
                    <div class="section-header">
                        <h2 class="section-title">${t('statistics.coverageTitle', 'Покрытие данных')}</h2>
                    </div>
                    <div id="superadminStatsCoverage"></div>
                </div>
                <div class="superadmin-geo-charts">
                    <div class="dashboard-section">
                        <div class="section-header">
                            <h2 class="section-title">${t('statistics.regionRanking', 'Рейтинг регионов')}</h2>
                        </div>
                        <div class="superadmin-chart-wrap">
                            <canvas id="superadminRegionChart"></canvas>
                        </div>
                    </div>
                    <div class="dashboard-section">
                        <div class="section-header">
                            <h2 class="section-title">${t('statistics.schoolTypeDistribution', 'Распределение по типам школ')}</h2>
                        </div>
                        <div class="superadmin-chart-wrap">
                            <canvas id="superadminSchoolTypeChart"></canvas>
                        </div>
                    </div>
                    <div class="dashboard-section">
                        <div class="section-header">
                            <h2 class="section-title">${t('statistics.geoCoverageChart', 'Geo coverage')}</h2>
                        </div>
                        <div class="superadmin-chart-wrap">
                            <canvas id="superadminCoverageChart"></canvas>
                        </div>
                    </div>
                </div>
                <div class="dashboard-section">
                    <div class="section-header">
                        <h2 class="section-title">${t('statistics.regionTableTitle', 'Таблица регионов')}</h2>
                    </div>
                    <div id="superadminStatsBreakdown"></div>
                </div>
            `;
        }

        if (page === 'settings') {
            if (role !== 'superadmin') {
                return `
                    <div class="dashboard-section">
                        <div class="section-header">
                            <h2 class="section-title">${t('settings.pageTitle', 'РќР°СЃС‚СЂРѕР№РєРё')}</h2>
                        </div>
                        <p style="color: var(--text-secondary);">${t('settings.superadminOnly', 'Р­С‚РѕС‚ СЂР°Р·РґРµР» РґРѕСЃС‚СѓРїРµРЅ С‚РѕР»СЊРєРѕ РґР»СЏ SuperAdmin.')}</p>
                    </div>
                `;
            }

            return `
                <div class="page-header-section">
                    <h1 class="page-main-title">${t('settings.notificationDefaults.title', 'Р”РµС„РѕР»С‚РЅС‹Рµ СѓРІРµРґРѕРјР»РµРЅРёСЏ')}</h1>
                    <p class="page-subtitle">${t('settings.notificationDefaults.subtitle', 'Р РѕР»РµРІС‹Рµ РЅР°СЃС‚СЂРѕР№РєРё РєР°РЅР°Р»РѕРІ Рё СЃРѕР±С‹С‚РёР№ РґР»СЏ РЅРѕРІС‹С… СѓРІРµРґРѕРјР»РµРЅРёР№')}</p>
                </div>
                <div class="dashboard-section">
                    <div class="section-header">
                        <h2 class="section-title">${t('settings.notificationDefaults.roleMatrix', 'РњР°С‚СЂРёС†Р° СЂРѕР»РµР№')}</h2>
                        <button class="btn btn-primary" id="settingsSaveNotificationDefaultsBtn" type="button">${t('settings.notificationDefaults.saveDefaults', 'РЎРѕС…СЂР°РЅРёС‚СЊ РЅР°СЃС‚СЂРѕР№РєРё')}</button>
                    </div>
                    <div id="settingsNotificationDefaultsStatus" class="text-secondary" style="margin-bottom:10px;"></div>
                    <div id="settingsNotificationDefaultsMatrix"></div>
                </div>
            `;
        }

        if (page === 'reports') {
            return `
                <div class="reports-page">
                    <div class="page-header-section reports-header">
                        <h1 class="page-main-title">${t('reports.pageTitle', 'Р¦РµРЅС‚СЂ РѕС‚С‡РµС‚РѕРІ')}</h1>
                        <p class="page-subtitle">${t('reports.subtitle', 'РРЅС‚РµСЂР°РєС‚РёРІРЅС‹Рµ РѕС‚С‡РµС‚С‹, СЃСЂР°РІРЅРµРЅРёСЏ Рё СЌРєСЃРїРѕСЂС‚ РіРѕС‚РѕРІС‹С… СЃРІРѕРґРѕРє')}</p>
                    </div>

                    <div class="reports-toolbar dashboard-section">
                        <div class="toolbar-filters">
                            <div class="filter-group">
                                <label for="reportsPeriodFilter">${t('reports.period', 'РџРµСЂРёРѕРґ')}</label>
                                <select id="reportsPeriodFilter" class="filter-select">
                                    <option value="7">${t('reports.last7Days', 'РџРѕСЃР»РµРґРЅРёРµ 7 РґРЅРµР№')}</option>
                                    <option value="30" selected>${t('reports.last30Days', 'РџРѕСЃР»РµРґРЅРёРµ 30 РґРЅРµР№')}</option>
                                    <option value="90">${t('reports.last90Days', 'РџРѕСЃР»РµРґРЅРёРµ 90 РґРЅРµР№')}</option>
                                    <option value="365">${t('reports.lastYear', 'РџРѕСЃР»РµРґРЅРёР№ РіРѕРґ')}</option>
                                </select>
                            </div>
                            <div class="filter-group" id="reportsMetricWrap" style="display:none;">
                                <label for="reportsMetricFilter">${t('reports.metric', 'РњРµС‚СЂРёРєР°')}</label>
                                <select id="reportsMetricFilter" class="filter-select">
                                    <option value="avg_score">${t('reports.avgScore', 'РЎСЂРµРґРЅРёР№ Р±Р°Р»Р»')}</option>
                                    <option value="test_completion">${t('reports.completionRate', 'РџСЂРѕС†РµРЅС‚ Р·Р°РІРµСЂС€РµРЅРёСЏ')}</option>
                                    <option value="student_count">${t('reports.students', 'РЈС‡РµРЅРёРєРё')}</option>
                                    <option value="teacher_count">${t('reports.teachers', 'РЈС‡РёС‚РµР»СЏ')}</option>
                                </select>
                            </div>
                            <div class="filter-group" id="reportsDimensionWrap" style="display:none;">
                                <label for="reportsDimensionFilter">${t('reports.dimension', 'Измерение')}</label>
                                <select id="reportsDimensionFilter" class="filter-select">
                                    <option value="school">${t('reports.dimension.school', 'Школа')}</option>
                                    <option value="region">${t('reports.dimension.region', 'Область')}</option>
                                    <option value="city">${t('reports.dimension.city', 'Город / район')}</option>
                                    <option value="school_type">${t('reports.dimension.schoolType', 'Тип школы')}</option>
                                    <option value="ownership">${t('reports.dimension.ownership', 'Собственность')}</option>
                                    <option value="language_model">${t('reports.dimension.languageModel', 'Языковая модель')}</option>
                                    <option value="study_shift">${t('reports.dimension.studyShift', 'Сменность')}</option>
                                </select>
                            </div>
                            <div class="filter-group" id="reportsRegionWrap" style="display:none;">
                                <label for="reportsRegionFilter">${t('schools.region', 'Область')}</label>
                                <select id="reportsRegionFilter" class="filter-select"></select>
                            </div>
                            <div class="filter-group" id="reportsCityWrap" style="display:none;">
                                <label for="reportsCityFilter">${t('schools.city', 'Город / район')}</label>
                                <select id="reportsCityFilter" class="filter-select" disabled></select>
                            </div>
                        </div>
                        <div class="toolbar-right">
                            <button class="btn btn-secondary" id="reportsRefreshBtn" type="button">${t('common.refresh', 'РћР±РЅРѕРІРёС‚СЊ')}</button>
                            <button class="btn btn-secondary" id="reportsPdfBtn" type="button">${t('reports.exportPdf', 'Р­РєСЃРїРѕСЂС‚ PDF')}</button>
                            <button class="btn btn-primary" id="reportsExportBtn" type="button">${t('reports.exportData', 'Р­РєСЃРїРѕСЂС‚ РґР°РЅРЅС‹С…')}</button>
                        </div>
                    </div>

                    <div class="reports-grid-kpi" id="reportsSummaryGrid"></div>

                    <div class="reports-grid-main">
                        <div class="dashboard-section reports-card">
                            <div class="section-header">
                                <h2 class="section-title">${t('reports.topEntities', 'РўРѕРї СЃСѓС‰РЅРѕСЃС‚РµР№')}</h2>
                            </div>
                            <div id="reportsTopTable"></div>
                        </div>

                        <div class="dashboard-section reports-card">
                            <div class="section-header">
                                <h2 class="section-title">${t('reports.recentActivity', 'РќРµРґР°РІРЅСЏСЏ Р°РєС‚РёРІРЅРѕСЃС‚СЊ')}</h2>
                            </div>
                            <div id="reportsActivityList"></div>
                        </div>
                    </div>

                    <div class="dashboard-section reports-card">
                        <div class="section-header">
                            <h2 class="section-title">${t('reports.trends', 'РўСЂРµРЅРґС‹')}</h2>
                        </div>
                        <div class="reports-trends-wrap">
                            <canvas id="reportsTrendsChart" height="110"></canvas>
                            <div class="reports-trends-empty" id="reportsTrendsEmpty" style="display:none;">${t('reports.noTrendData', 'РќРµС‚ РґР°РЅРЅС‹С… С‚СЂРµРЅРґР° РґР»СЏ РІС‹Р±СЂР°РЅРЅС‹С… С„РёР»СЊС‚СЂРѕРІ')}</div>
                        </div>
                    </div>

                    <div class="dashboard-section reports-card">
                        <div class="section-header">
                            <h2 class="section-title">${t('reports.comparisonBreakdown', 'Сравнительная сводка')}</h2>
                        </div>
                        <div id="reportsCompareTable"></div>
                    </div>

                    <div class="dashboard-section reports-card">
                        <div class="section-header">
                            <h2 class="section-title">${t('reports.insights', 'РРЅСЃР°Р№С‚С‹')}</h2>
                        </div>
                        <div id="reportsInsights"></div>
                    </div>

                    <div class="dashboard-section reports-card" id="reportsNotificationsCard" style="display:none;">
                        <div class="section-header">
                            <h2 class="section-title">${t('reports.notificationLog', 'Р›РѕРі РґРѕСЃС‚Р°РІРєРё СѓРІРµРґРѕРјР»РµРЅРёР№')}</h2>
                        </div>
                        <div class="reports-notification-filters">
                            <div class="filter-group">
                                <label for="reportsNotificationChannel">${t('common.channel', 'РљР°РЅР°Р»')}</label>
                                <select id="reportsNotificationChannel" class="filter-select">
                                    <option value="">${t('common.all', 'Р’СЃРµ')}</option>
                                    <option value="email">Email</option>
                                    <option value="telegram">Telegram</option>
                                </select>
                            </div>
                            <div class="filter-group">
                                <label for="reportsNotificationEvent">${t('common.event', 'РЎРѕР±С‹С‚РёРµ')}</label>
                                <select id="reportsNotificationEvent" class="filter-select">
                                    <option value="">${t('common.all', 'Р’СЃРµ')}</option>
                                    <option value="welcome">${t('settings.event.welcome', 'РџСЂРёРІРµС‚СЃС‚РІРёРµ')}</option>
                                    <option value="password_reset">${t('settings.event.password_reset', 'РЎР±СЂРѕСЃ РїР°СЂРѕР»СЏ')}</option>
                                    <option value="new_test">${t('settings.event.new_test', 'РќРѕРІС‹Р№ С‚РµСЃС‚')}</option>
                                    <option value="test_results">${t('settings.event.test_results', 'Результаты тестов')}</option>
                                </select>
                            </div>
                            <div class="filter-group">
                                <label for="reportsNotificationStatus">${t('common.status', 'РЎС‚Р°С‚СѓСЃ')}</label>
                                <select id="reportsNotificationStatus" class="filter-select">
                                    <option value="">${t('common.all', 'Р’СЃРµ')}</option>
                                    <option value="sent">${t('reports.statusSent', 'РћС‚РїСЂР°РІР»РµРЅРѕ')}</option>
                                    <option value="failed">${t('reports.statusFailed', 'РћС€РёР±РєР°')}</option>
                                </select>
                            </div>
                            <div class="filter-group">
                                <label for="reportsNotificationFrom">${t('common.from', 'РћС‚')}</label>
                                <input id="reportsNotificationFrom" class="form-control" type="datetime-local">
                            </div>
                            <div class="filter-group">
                                <label for="reportsNotificationTo">${t('common.to', 'Р”Рѕ')}</label>
                                <input id="reportsNotificationTo" class="form-control" type="datetime-local">
                            </div>
                            <div class="filter-group">
                                <label for="reportsNotificationLimit">${t('common.perPage', 'РќР° СЃС‚СЂР°РЅРёС†Рµ')}</label>
                                <select id="reportsNotificationLimit" class="filter-select">
                                    <option value="20">20</option>
                                    <option value="50">50</option>
                                    <option value="100">100</option>
                                </select>
                            </div>
                        </div>
                        <div id="reportsNotificationsTable"></div>
                    </div>

                    <div class="dashboard-section reports-card">
                        <div class="section-header">
                            <h2 class="section-title">${t('reports.atRiskStudents', 'РЈС‡РµРЅРёРєРё РІ Р·РѕРЅРµ СЂРёСЃРєР°')}</h2>
                        </div>
                        <div class="reports-risk-grid">
                            <div id="reportsRiskSummary"></div>
                            <div id="reportsRiskTable"></div>
                        </div>
                    </div>
                </div>
            `;
        }

        if (page === 'audit') {
            if (role !== 'superadmin') {
                return `
                    <div class="dashboard-section">
                        <div class="section-header">
                            <h2 class="section-title">${t('dashboard.nav.audit', 'РђСѓРґРёС‚')}</h2>
                        </div>
                        <p style="color: var(--text-secondary);">${t('settings.superadminOnly', 'Р­С‚РѕС‚ СЂР°Р·РґРµР» РґРѕСЃС‚СѓРїРµРЅ С‚РѕР»СЊРєРѕ РґР»СЏ SuperAdmin.')}</p>
                    </div>
                `;
            }

            return `
                <div class="audit-page">
                    <div class="page-header-section">
                        <h1 class="page-main-title">${t('audit.pageTitle', 'Р¦РµРЅС‚СЂ Р°СѓРґРёС‚Р°')}</h1>
                        <p class="page-subtitle">${t('audit.subtitle', 'РРЅС‚РµСЂР°РєС‚РёРІРЅС‹Р№ РјРѕРЅРёС‚РѕСЂРёРЅРі Р°РєС‚РёРІРЅРѕСЃС‚Рё СЃРёСЃС‚РµРјС‹ Рё forensic-Р°РЅР°Р»РёР·')}</p>
                    </div>

                    <div class="dashboard-section audit-toolbar">
                        <div class="toolbar-filters">
                            <div class="filter-group">
                                <label for="auditSearch">${t('common.search', 'РџРѕРёСЃРє')}</label>
                                <input id="auditSearch" class="form-control" placeholder="${t('audit.searchPlaceholder', 'РґРµР№СЃС‚РІРёРµ, СЃСѓС‰РЅРѕСЃС‚СЊ, РїРѕР»СЊР·РѕРІР°С‚РµР»СЊ, РґРµС‚Р°Р»Рё')}">
                            </div>
                            <div class="filter-group">
                                <label for="auditActionFilter">${t('audit.action', 'Р”РµР№СЃС‚РІРёРµ')}</label>
                                <select id="auditActionFilter" class="filter-select"><option value="">${t('common.all', 'Р’СЃРµ')}</option></select>
                            </div>
                            <div class="filter-group">
                                <label for="auditEntityFilter">${t('audit.entity', 'РЎСѓС‰РЅРѕСЃС‚СЊ')}</label>
                                <select id="auditEntityFilter" class="filter-select"><option value="">${t('common.all', 'Р’СЃРµ')}</option></select>
                            </div>
                            <div class="filter-group">
                                <label for="auditRoleFilter">${t('audit.actorRole', 'Р РѕР»СЊ РёРЅРёС†РёР°С‚РѕСЂР°')}</label>
                                <select id="auditRoleFilter" class="filter-select"><option value="">${t('common.all', 'Р’СЃРµ')}</option></select>
                            </div>
                            <div class="filter-group">
                                <label for="auditStatusFilter">${t('audit.status', 'РЎС‚Р°С‚СѓСЃ')}</label>
                                <select id="auditStatusFilter" class="filter-select">
                                    <option value="">${t('common.all', 'Р’СЃРµ')}</option>
                                    <option value="success">${t('audit.success', 'РЈСЃРїРµС…')}</option>
                                    <option value="failed">${t('audit.failed', 'РћС€РёР±РєР°')}</option>
                                </select>
                            </div>
                            <div class="filter-group">
                                <label for="auditFromFilter">${t('common.from', 'РћС‚')}</label>
                                <input id="auditFromFilter" class="form-control" type="datetime-local">
                            </div>
                            <div class="filter-group">
                                <label for="auditToFilter">${t('common.to', 'Р”Рѕ')}</label>
                                <input id="auditToFilter" class="form-control" type="datetime-local">
                            </div>
                            <div class="filter-group">
                                <label for="auditPageSize">${t('common.perPage', 'РќР° СЃС‚СЂР°РЅРёС†Рµ')}</label>
                                <select id="auditPageSize" class="filter-select">
                                    <option value="25">25</option>
                                    <option value="50">50</option>
                                    <option value="100">100</option>
                                </select>
                            </div>
                        </div>
                        <div class="toolbar-right">
                            <button class="btn btn-outline" id="auditPreset24hBtn" type="button">24h</button>
                            <button class="btn btn-outline" id="auditPreset7dBtn" type="button">7d</button>
                            <button class="btn btn-outline" id="auditPreset30dBtn" type="button">30d</button>
                            <button class="btn btn-outline" id="auditResetFiltersBtn" type="button">${t('users.clear', 'РћС‡РёСЃС‚РёС‚СЊ')}</button>
                            <button class="btn btn-secondary" id="auditRefreshBtn" type="button">${t('common.refresh', 'РћР±РЅРѕРІРёС‚СЊ')}</button>
                            <button class="btn btn-secondary" id="auditAutoRefreshBtn" type="button">${t('audit.autoOff', 'РђРІС‚Рѕ: Р’С‹РєР»')}</button>
                            <button class="btn btn-primary" id="auditExportBtn" type="button">${t('audit.exportCsv', 'Р­РєСЃРїРѕСЂС‚ CSV')}</button>
                        </div>
                    </div>

                    <div class="reports-grid-kpi" id="auditKpiGrid"></div>

                    <div class="reports-grid-main">
                        <div class="dashboard-section reports-card">
                            <div class="section-header"><h2 class="section-title">${t('audit.topActions', 'РўРѕРї РґРµР№СЃС‚РІРёР№')}</h2></div>
                            <div id="auditTopActions"></div>
                        </div>
                        <div class="dashboard-section reports-card">
                            <div class="section-header"><h2 class="section-title">${t('audit.topActors', 'РўРѕРї РёРЅРёС†РёР°С‚РѕСЂРѕРІ')}</h2></div>
                            <div id="auditTopActors"></div>
                        </div>
                    </div>

                    <div class="dashboard-section reports-card">
                        <div class="section-header"><h2 class="section-title">${t('audit.dailyTimeline', 'Р•Р¶РµРґРЅРµРІРЅР°СЏ Р°РєС‚РёРІРЅРѕСЃС‚СЊ')}</h2></div>
                        <div id="auditTimeline"></div>
                    </div>

                    <div class="dashboard-section reports-card">
                        <div class="section-header"><h2 class="section-title">${t('audit.logs', 'Р›РѕРіРё Р°СѓРґРёС‚Р°')}</h2></div>
                        <div id="auditLogsTable"></div>
                    </div>

                    <div class="dashboard-section reports-card" id="auditDetailsCard" style="display:none;">
                        <div class="section-header"><h2 class="section-title">${t('audit.logDetails', 'Р”РµС‚Р°Р»Рё Р»РѕРіР°')}</h2></div>
                        <div id="auditDetailsView"></div>
                    </div>
                </div>
            `;
        }

        // Overview page with stats
        if (page === 'overview') {
            const titles = {
                superadmin: { title: t('dashboard.role.superadmin.title', 'Админ панель'), subtitle: t('dashboard.role.superadmin.subtitle', 'Управление системой и контроль') },
                school_admin: { title: t('dashboard.role.school_admin.title', 'Админ панель'), subtitle: t('dashboard.role.school_admin.subtitle', 'Управление школой') },
                teacher: { title: t('dashboard.role.teacher.title', 'Панель учителя'), subtitle: t('dashboard.role.teacher.subtitle', 'Тесты и аналитика') },
                psychologist: { title: t('dashboard.role.psychologist.title', 'Панель психолога'), subtitle: t('dashboard.role.psychologist.subtitle', 'Профориентация и профили учеников') },
                student: { title: t('dashboard.role.student.title', 'Панель ученика'), subtitle: t('dashboard.role.student.subtitle', 'Обучение и результаты') }
            };

            const roleTitle = titles[role] || titles.psychologist;

            return `
                <div class="page-header-section">
                    <h1 class="page-main-title">${roleTitle.title}</h1>
                    <p class="page-subtitle">${roleTitle.subtitle}</p>
                </div>
                <div class="stats-grid">
                    ${getStatsForRole(role)}
                </div>
                <div class="dashboard-section">
                    <div class="section-header">
                        <h2 class="section-title">${t('dashboard.activity.recentTitle', 'Недавняя активность')}</h2>
                    </div>
                    <p style="color: var(--text-secondary);">${t('dashboard.activity.placeholder', 'Содержимое скоро появится...')}</p>
                </div>
            `;
        }

        // Default placeholder
        return `
            <div class="dashboard-section">
                <div class="section-header">
                    <h2 class="section-title">${page.charAt(0).toUpperCase() + page.slice(1)}</h2>
                </div>
                <p style="color: var(--text-secondary);">${t('dashboard.activity.placeholder', 'Содержимое скоро появится...')}</p>
            </div>
        `;
    }

    // Load stats from API
    async function loadStatsFromAPI(role) {
        try {
            const endpoints = {
                superadmin: '/api/superadmin/dashboard/overview',
                school_admin: '/api/admin/dashboard/overview',
                teacher: '/api/teacher/dashboard/overview',
                psychologist: '/api/psychologist/dashboard/overview',
                student: '/api/student/dashboard/overview'
            };

            const endpoint = endpoints[role];
            if (!endpoint) return null;

            const response = await fetch(endpoint, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${window.ZedlyAuth?.getAuthToken?.() || 'cookie-session'}`
                }
            });

            if (!response.ok) {
                console.error(`Failed to load stats for ${role}`);
                return null;
            }

            return await response.json();
        } catch (error) {
            console.error('Error loading stats:', error);
            return null;
        }
    }

    function looksLikeMojibake(value) {
        if (typeof value !== 'string' || value.length < 4) return false;
        const chunks = value.match(/(?:Р.|С.)/g) || [];
        return chunks.length >= 3 && chunks.length / value.length > 0.2;
    }

    function t(key, fallback) {
        const translated = window.ZedlyI18n?.translate?.(key);
        if (!translated || translated === key || looksLikeMojibake(translated)) {
            return fallback || key;
        }
        return translated;
    }

    function formatPercent(value) {
        const num = Number(value);
        if (!Number.isFinite(num)) {
            return '0';
        }

        const rounded = Math.round(num * 10) / 10;
        if (Number.isInteger(rounded)) {
            return String(rounded);
        }

        return rounded.toFixed(1);
    }

    function formatDateTime(value) {
        if (!value) {
            return '-';
        }
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return '-';
        }
        return date.toLocaleString();
    }

    function buildRecentActivity(role, data) {
        const items = data?.recent_activity || [];
        if (!items.length) {
            return `<p style="color: var(--text-secondary);">${t('dashboard.activity.none', 'Пока нет недавней активности.')}</p>`;
        }

        const typeLabels = {
            attempt: t('dashboard.activity.typeAttempt', 'Попытка'),
            assignment: t('dashboard.activity.typeAssignment', 'Назначение'),
            test: t('dashboard.activity.typeTest', 'Тест'),
            user: t('dashboard.activity.typeUser', 'Пользователь')
        };
        const colType = t('dashboard.activity.type', 'Тип');
        const colTitle = t('dashboard.activity.title', 'Название');
        const colDetails = t('dashboard.activity.details', 'Детали');
        const colScore = t('dashboard.activity.score', 'Балл');
        const colDate = t('dashboard.activity.date', 'Дата');

        const rows = items.map((item) => {
            const typeKey = String(item.type || '').toLowerCase();
            const fallbackType = t('dashboard.activity.typeActivity', 'Активность');
            const type = typeLabels[typeKey]
                || (looksLikeMojibake(item.type) ? fallbackType : (item.type || fallbackType));
            const score = item.percentage !== undefined && item.percentage !== null
                ? `${formatPercent(item.percentage)}%`
                : '-';
            return `
                <tr>
                    <td data-label="${colType}">${type}</td>
                    <td data-label="${colTitle}">${item.title || '-'}</td>
                    <td data-label="${colDetails}">${item.subtitle || '-'}</td>
                    <td data-label="${colScore}">${score}</td>
                    <td data-label="${colDate}">${formatDateTime(item.date)}</td>
                </tr>
            `;
        }).join('');

        return `
            <div class="table-responsive recent-activity-table">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>${colType}</th>
                            <th>${colTitle}</th>
                            <th>${colDetails}</th>
                            <th>${colScore}</th>
                            <th>${colDate}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
            </div>
        `;
    }

    // Build stat cards from API data
    function buildStatsCards(role, data) {
        if (!data || !data.stats) {
            return '';
        }

        const stats = data.stats;
        const cards = [];

        if (role === 'superadmin') {
            cards.push(
                { icon: 'building', label: t('dashboard.stats.schools', 'Школы'), value: stats.schools },
                { icon: 'users', label: t('dashboard.stats.students', 'Ученики'), value: stats.students },
                { icon: 'clipboard', label: t('dashboard.stats.tests', 'Тесты'), value: stats.tests },
                { icon: 'star', label: t('dashboard.stats.avgScore', 'Средний балл'), value: `${formatPercent(stats.avg_score)}%` }
            );
        } else if (role === 'school_admin') {
            cards.push(
                { icon: 'users', label: t('dashboard.stats.students', 'Ученики'), value: stats.students },
                { icon: 'class', label: t('dashboard.stats.classes', 'Классы'), value: stats.classes },
                { icon: 'clipboard', label: t('dashboard.stats.tests', 'Тесты'), value: stats.tests },
                { icon: 'star', label: t('dashboard.stats.avgScore', 'Средний балл'), value: `${formatPercent(stats.avg_score)}%` }
            );
        } else if (role === 'teacher') {
            cards.push(
                { icon: 'clipboard', label: t('dashboard.stats.testsCreated', 'Создано тестов'), value: stats.tests_created },
                { icon: 'users', label: t('dashboard.stats.students', 'Ученики'), value: stats.student_count },
                { icon: 'clipboard', label: t('dashboard.stats.assignments', 'Назначения'), value: stats.assignments_total },
                { icon: 'star', label: t('dashboard.stats.avgScore', 'Средний балл'), value: `${formatPercent(stats.avg_percentage)}%` }
            );
        } else if (role === 'student') {
            cards.push(
                { icon: 'clipboard', label: t('dashboard.stats.testsAssigned', 'Назначено тестов'), value: stats.tests_assigned },
                { icon: 'star', label: t('dashboard.stats.testsCompleted', 'Завершено тестов'), value: stats.tests_completed },
                { icon: 'trophy', label: t('dashboard.stats.avgScore', 'Средний балл'), value: `${formatPercent(stats.avg_score)}%` },
                { icon: 'target', label: t('dashboard.stats.careerTest', 'Профориентация'), value: stats.career_test_completed ? t('dashboard.stats.careerDone', 'Пройдено') : t('dashboard.stats.careerPending', 'Не пройдено') }
            );
        } else if (role === 'psychologist') {
            cards.push(
                { icon: 'users', label: t('dashboard.stats.students', 'Ученики'), value: stats.students || 0 },
                { icon: 'target', label: t('dashboard.stats.careerAttempts', 'Попытки профориентации'), value: stats.career_attempts || 0 },
                { icon: 'star', label: t('dashboard.stats.studentsWithResults', 'Учеников с результатами'), value: stats.students_with_results || 0 }
            );
        }

        const colors = ['blue', 'green', 'orange', 'purple'];
        return cards.map((card, i) => `
            <div class="stat-card">
                <div class="stat-icon ${colors[i]}">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        ${icons[card.icon]}
                    </svg>
                </div>
                <div class="stat-content">
                    <div class="stat-label">${card.label}</div>
                    <div class="stat-value">${card.value}</div>
                </div>
            </div>
        `).join('');
    }

    // Get stats cards based on role (fallback with placeholder data)
    function getStatsForRole(role) {
        const stats = {
            superadmin: [
                { icon: 'building', color: 'blue', label: 'Total Schools', value: '24' },
                { icon: 'users', color: 'green', label: 'Total Users', value: '1,234' },
                { icon: 'clipboard', color: 'orange', label: 'Tests Created', value: '567' },
                { icon: 'star', color: 'purple', label: 'Active Today', value: '89' }
            ],
            school_admin: [
                { icon: 'users', color: 'blue', label: 'Total Users', value: '156' },
                { icon: 'class', color: 'green', label: 'Classes', value: '12' },
                { icon: 'clipboard', color: 'orange', label: 'Active Tests', value: '23' },
                { icon: 'star', color: 'purple', label: 'Avg. Score', value: '85%' }
            ],
            teacher: [
                { icon: 'clipboard', color: 'blue', label: 'My Tests', value: '15' },
                { icon: 'users', color: 'green', label: 'Students', value: '87' },
                { icon: 'star', color: 'orange', label: 'Avg. Score', value: '82%' },
                { icon: 'trophy', color: 'purple', label: 'Completed', value: '234' }
            ],
            student: [
                { icon: 'clipboard', color: 'blue', label: 'Available Tests', value: '5' },
                { icon: 'star', color: 'green', label: 'Completed', value: '12' },
                { icon: 'trophy', color: 'orange', label: 'Avg. Score', value: '88%' },
                { icon: 'target', color: 'purple', label: 'Rank', value: '#7' }
            ],
            psychologist: [
                { icon: 'users', color: 'blue', label: 'Students', value: '0' },
                { icon: 'target', color: 'green', label: 'Career Attempts', value: '0' },
                { icon: 'star', color: 'orange', label: 'With Results', value: '0' }
            ]
        };

        const roleStats = stats[role] || stats.psychologist;
        return roleStats.map(stat => `
            <div class="stat-card">
                <div class="stat-icon ${stat.color}">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        ${icons[stat.icon]}
                    </svg>
                </div>
                <div class="stat-content">
                    <div class="stat-label">${stat.label}</div>
                    <div class="stat-value">${stat.value}</div>
                </div>
            </div>
        `).join('');
    }

    // Refresh token
    async function refreshToken() {
        console.log('[auth] Attempting to refresh token...');

        try {
            console.log('[auth] Calling /api/auth/refresh');
            const response = await fetch('/api/auth/refresh', {
                method: 'POST',
                credentials: 'include'
            });

            console.log('Refresh response status:', response.status);

            if (response.ok) {
                console.log('[ok] Token refreshed successfully');
            } else {
                const errorData = await response.json();
                console.error('[error] Refresh failed:', errorData);
                redirectToLogin();
            }
        } catch (error) {
            console.error('Token refresh error:', error);
            redirectToLogin();
        }
    }

    function getCookie(name) {
        const escaped = String(name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
        return match ? decodeURIComponent(match[1]) : '';
    }

    async function ensureCsrfToken() {
        const existing = getCookie('zedly_csrf_token');
        if (existing) return existing;

        try {
            const response = await fetch('/api/auth/csrf-token', {
                method: 'GET',
                credentials: 'include'
            });

            if (!response.ok) return '';
            const data = await response.json().catch(() => ({}));
            return data?.csrf_token || getCookie('zedly_csrf_token') || '';
        } catch (_) {
            return '';
        }
    }

    // Logout
    async function logout() {
        let response = null;

        try {
            const csrfToken = await ensureCsrfToken();
            const headers = {};
            const legacyToken = window.ZedlyAuth?.getAuthToken?.();

            if (legacyToken && legacyToken !== 'cookie-session') {
                headers.Authorization = `Bearer ${legacyToken}`;
            }
            if (csrfToken) {
                headers['X-CSRF-Token'] = csrfToken;
            }

            response = await fetch('/api/auth/logout', {
                method: 'POST',
                credentials: 'include',
                headers
            });

            // Backward compatibility for deployments exposing only v1 session auth paths.
            if (!response.ok && (response.status === 404 || response.status === 405)) {
                response = await fetch('/api/v1/auth/session/logout', {
                    method: 'POST',
                    credentials: 'include',
                    headers
                });
            }

            if (!response.ok) {
                console.warn('Logout request returned non-OK status:', response.status);
            }
        } catch (error) {
            console.error('Logout error:', error);
        }

        // Clear stale client-side auth data
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('temp_token');
        localStorage.removeItem('user');

        // Redirect to login
        redirectToLogin();
    }

    // Redirect to login
    function redirectToLogin() {
        window.location.href = '/login';
    }

    // Mobile menu toggle
    function initMobileMenu() {
        const menuToggle = document.getElementById('menuToggle');
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlay');

        // Check if elements exist before adding listeners
        if (menuToggle && sidebar && overlay) {
            menuToggle.addEventListener('click', () => {
                sidebar.classList.toggle('open');
                overlay.classList.toggle('active');
            });

            overlay.addEventListener('click', closeMobileMenu);
        }
    }

    function closeMobileMenu() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlay');
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
    }

    // Initialize on load
    document.addEventListener('DOMContentLoaded', () => {
        initDashboard();
        initMobileMenu();

        // Logout button in sidebar
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                logout();
            });
        }

        // Logout link in dropdown menu (if exists)
        const logoutLink = document.getElementById('logoutLink');
        if (logoutLink) {
            logoutLink.addEventListener('click', (e) => {
                e.preventDefault();
                logout();
            });
        }

        // Language switcher - re-render navigation when language changes
        const langButtons = document.querySelectorAll('.lang-btn');
        langButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                // Wait for i18n to update, then re-render navigation and current page content
                setTimeout(async () => {
                    if (currentUser) {
                        renderNavigation();
                        await loadPageContent(currentPageId || 'overview');
                    }
                    refreshTranslations();
                }, 100);
            });
        });

        console.log('Dashboard initialized [ok]');
    });
})();
