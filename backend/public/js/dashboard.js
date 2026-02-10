// Dashboard JavaScript
(function () {
    'use strict';

    let currentUser = null;

    // Navigation items for each role
    const navigationConfig = {
        superadmin: [
            {
                section: 'dashboard.nav.main',
                items: [
                    { icon: 'grid', label: 'dashboard.nav.overview', id: 'overview', href: '#overview' },
                    { icon: 'building', label: 'dashboard.nav.schools', id: 'schools', href: '#schools' }
                ]
            },
            {
                section: 'dashboard.nav.analytics',
                items: [
                    { icon: 'chart', label: 'dashboard.nav.statistics', id: 'statistics', href: '#statistics' },
                    { icon: 'file', label: 'dashboard.nav.reports', id: 'reports', href: '#reports' }
                ]
            },
            {
                section: 'dashboard.nav.system',
                items: [
                    { icon: 'settings', label: 'dashboard.nav.settings', id: 'settings', href: '#settings' },
                    { icon: 'shield', label: 'dashboard.nav.audit', id: 'audit', href: '#audit' }
                ]
            }
        ],
        school_admin: [
            {
                section: 'dashboard.nav.main',
                items: [
                    { icon: 'grid', label: 'dashboard.nav.overview', id: 'overview', href: '#overview' },
                    { icon: 'users', label: 'dashboard.nav.users', id: 'users', href: '#users' },
                    { icon: 'class', label: 'dashboard.nav.classes', id: 'classes', href: '#classes' },
                    { icon: 'book', label: 'dashboard.nav.subjects', id: 'subjects', href: '#subjects' }
                ]
            },
            {
                section: 'dashboard.nav.analytics',
                items: [
                    { icon: 'chart', label: 'dashboard.nav.statistics', id: 'statistics', href: '#statistics' },
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
                    { icon: 'clipboard', label: 'dashboard.nav.tests', id: 'tests', href: '#tests' },
                    { icon: 'assignment', label: 'dashboard.nav.assignments', id: 'assignments', href: '#assignments' },
                    { icon: 'class', label: 'dashboard.nav.classes', id: 'classes', href: '#classes' }
                ]
            },
            {
                section: 'dashboard.nav.analytics',
                items: [
                    { icon: 'chart', label: 'dashboard.nav.results', id: 'results', href: '#results' },
                    { icon: 'users', label: 'dashboard.nav.students', id: 'students', href: '#students' }
                ]
            },
            {
                section: 'dashboard.nav.resources',
                items: [
                    { icon: 'book', label: 'dashboard.nav.library', id: 'library', href: '#library' },
                    { icon: 'calendar', label: 'dashboard.nav.calendar', id: 'calendar', href: '#calendar' }
                ]
            }
        ],
        student: [
            {
                section: 'dashboard.nav.main',
                items: [
                    { icon: 'grid', label: 'dashboard.nav.overview', id: 'overview', href: '#overview' },
                    { icon: 'clipboard', label: 'dashboard.nav.tests', id: 'tests', href: '#tests' },
                    { icon: 'star', label: 'dashboard.nav.results', id: 'results', href: '#results' }
                ]
            },
            {
                section: 'dashboard.nav.learning',
                items: [
                    { icon: 'chart', label: 'dashboard.nav.progress', id: 'progress', href: '#progress' },
                    { icon: 'target', label: 'dashboard.nav.career', id: 'career', href: '#career' },
                    { icon: 'trophy', label: 'dashboard.nav.leaderboard', id: 'leaderboard', href: '#leaderboard' }
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
        file: '<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/>',
        settings: '<circle cx="12" cy="12" r="3"/><path d="M12 1v6m0 6v6"/>',
        shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
        clipboard: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>',
        class: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
        book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
        upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
        download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
        star: '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>',
        target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
        trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M6 9h12v4a6 6 0 0 1-12 0V9zM8 22v-3M16 22v-3M10 19h4"/>',
        calendar: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
        assignment: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>'
    };

    // Initialize dashboard
    async function initDashboard() {
        // Check authentication
        const token = localStorage.getItem('access_token');
        if (!token) {
            redirectToLogin();
            return;
        }

        try {
            // Fetch current user info
            const response = await fetch('/api/auth/me', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                if (response.status === 401) {
                    // Token expired, try to refresh
                    await refreshToken();
                    return initDashboard();
                }
                throw new Error('Failed to fetch user info');
            }

            const data = await response.json();
            currentUser = data.user;

            // Update UI
            updateUserInfo();
            renderNavigation();
            loadDashboardContent();

        } catch (error) {
            console.error('Dashboard initialization error:', error);
            redirectToLogin();
        }
    }

    // Update user info in sidebar
    function updateUserInfo() {
        const userAvatar = document.getElementById('userAvatar');
        const userName = document.getElementById('userName');
        const userRole = document.getElementById('userRole');

        if (currentUser) {
            // Set avatar initials
            const initials = `${currentUser.first_name?.[0] || ''}${currentUser.last_name?.[0] || ''}`.toUpperCase() || 'U';
            userAvatar.textContent = initials;

            // Set name
            userName.textContent = `${currentUser.first_name || ''} ${currentUser.last_name || ''}`.trim() || currentUser.username;

            // Set role
            const roleNames = {
                'superadmin': 'SuperAdmin',
                'school_admin': 'School Admin',
                'teacher': 'Teacher',
                'student': 'Student'
            };
            userRole.textContent = roleNames[currentUser.role] || currentUser.role;
        }
    }

    // Render navigation based on role
    function renderNavigation() {
        const sidebarNav = document.getElementById('sidebarNav');
        if (!currentUser || !navigationConfig[currentUser.role]) {
            return;
        }

        const config = navigationConfig[currentUser.role];
        let html = '';

        config.forEach(section => {
            html += `<div class="nav-section">`;
            html += `<div class="nav-section-title" data-i18n="${section.section}">${section.section}</div>`;

            section.items.forEach(item => {
                const iconSvg = icons[item.icon] || icons.grid;
                html += `
                    <a href="${item.href}" class="nav-item" data-page="${item.id}">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            ${iconSvg}
                        </svg>
                        <span data-i18n="${item.label}">${item.label}</span>
                    </a>
                `;
            });

            html += `</div>`;
        });

        sidebarNav.innerHTML = html;

        // Set first item as active
        const firstItem = sidebarNav.querySelector('.nav-item');
        if (firstItem) {
            firstItem.classList.add('active');
        }

        // Add click handlers
        sidebarNav.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', handleNavClick);
        });
    }

    // Handle navigation click
    function handleNavClick(e) {
        e.preventDefault();
        const page = this.dataset.page;

        // Update active state
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        this.classList.add('active');

        // Load content
        loadPageContent(page);

        // Close mobile menu
        closeMobileMenu();
    }

    // Load dashboard content based on role
    function loadDashboardContent() {
        if (!currentUser) return;

        // Load overview page by default
        loadPageContent('overview');
    }

    // Load specific page content
    async function loadPageContent(page) {
        const content = document.getElementById('dashboardContent');

        // Show loading
        content.innerHTML = `
            <div style="text-align: center; padding: var(--spacing-3xl);">
                <div class="spinner" style="display: inline-block; width: 40px; height: 40px;"></div>
                <p style="margin-top: var(--spacing-lg); color: var(--text-secondary);">Loading ${page}...</p>
            </div>
        `;

        // Set page content
        content.innerHTML = getPageContent(page);

        // Load script and initialize if needed
        await loadPageScript(page);
    }

    // Load page-specific script
    async function loadPageScript(page) {
        const scriptMap = {
            'schools': { src: '/js/schools.js', manager: 'SchoolsManager' },
            'users': { src: '/js/users.js', manager: 'UsersManager' },
            'classes': { src: '/js/classes.js', manager: 'ClassesManager' },
            'subjects': { src: '/js/subjects.js', manager: 'SubjectsManager' },
            'tests': {
                src: currentUser && currentUser.role === 'student' ? '/js/student-tests.js' : '/js/tests.js',
                manager: currentUser && currentUser.role === 'student' ? 'StudentTestsManager' : 'TestsManager'
            },
            'assignments': { src: '/js/assignments.js', manager: 'AssignmentsManager' }
        };

        const scriptInfo = scriptMap[page];
        if (!scriptInfo) return;

        // Check if script already loaded and manager exists
        if (window[scriptInfo.manager]) {
            try {
                window[scriptInfo.manager].init();
            } catch (error) {
                console.error(`Failed to initialize ${scriptInfo.manager}:`, error);
            }
            return;
        }

        // Load script dynamically
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = scriptInfo.src;
            script.onload = () => {
                console.log(`✓ Loaded: ${scriptInfo.src}`);
                // Initialize manager after script loads
                try {
                    if (window[scriptInfo.manager]) {
                        window[scriptInfo.manager].init();
                        console.log(`✓ Initialized: ${scriptInfo.manager}`);
                    } else {
                        console.error(`Manager ${scriptInfo.manager} not found after loading script`);
                    }
                } catch (error) {
                    console.error(`Failed to initialize ${scriptInfo.manager}:`, error);
                }
                resolve();
            };
            script.onerror = () => {
                console.error(`Failed to load script: ${scriptInfo.src}`);
                reject();
            };
            document.head.appendChild(script);
        });
    }

    // Get page content (placeholder - will be replaced with actual components)
    function getPageContent(page) {
        const role = currentUser?.role || 'student';

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

        // Users Management (SchoolAdmin)
        if (page === 'users') {
            return `
                <div class="page-toolbar">
                    <div class="search-box">
                        <input
                            type="text"
                            id="usersSearch"
                            class="search-input"
                            placeholder="Search users..."
                        />
                    </div>
                    <div class="toolbar-right">
                        <select id="roleFilter" class="select-input">
                            <option value="all">All Roles</option>
                            <option value="school_admin">School Admin</option>
                            <option value="teacher">Teacher</option>
                            <option value="student">Student</option>
                        </select>
                        <button class="btn btn-primary" id="addUserBtn">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="12" y1="5" x2="12" y2="19"></line>
                                <line x1="5" y1="12" x2="19" y2="12"></line>
                            </svg>
                            Add User
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
                            placeholder="Search classes..."
                        />
                    </div>
                    <div class="toolbar-right">
                        <select id="gradeFilter" class="select-input">
                            <option value="all">All Grades</option>
                            <option value="1">1 класс</option>
                            <option value="2">2 класс</option>
                            <option value="3">3 класс</option>
                            <option value="4">4 класс</option>
                            <option value="5">5 класс</option>
                            <option value="6">6 класс</option>
                            <option value="7">7 класс</option>
                            <option value="8">8 класс</option>
                            <option value="9">9 класс</option>
                            <option value="10">10 класс</option>
                            <option value="11">11 класс</option>
                        </select>
                        <button class="btn btn-primary" id="addClassBtn">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="12" y1="5" x2="12" y2="19"></line>
                                <line x1="5" y1="12" x2="19" y2="12"></line>
                            </svg>
                            Add Class
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
                            placeholder="Search subjects..."
                        />
                    </div>
                    <div class="toolbar-right">
                        <button class="btn btn-primary" id="addSubjectBtn">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="12" y1="5" x2="12" y2="19"></line>
                                <line x1="5" y1="12" x2="19" y2="12"></line>
                            </svg>
                            Add Subject
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
                            <button class="tab active" data-tab="available">Available Tests</button>
                            <button class="tab" data-tab="completed">Completed Tests</button>
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
                                placeholder="Search tests..."
                            />
                        </div>
                        <div class="toolbar-filters">
                            <select id="subjectFilter" class="filter-select">
                                <option value="all">All Subjects</option>
                            </select>
                            <select id="statusFilter" class="filter-select">
                                <option value="all">All Status</option>
                                <option value="active">Active</option>
                                <option value="draft">Drafts</option>
                            </select>
                        </div>
                        <div class="toolbar-right">
                            <button class="btn btn-primary" id="addTestBtn">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="12" y1="5" x2="12" y2="19"></line>
                                    <line x1="5" y1="12" x2="19" y2="12"></line>
                                </svg>
                                Create Test
                            </button>
                        </div>
                    </div>
                    <div id="testsContainer"></div>
                `;
            }
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
                            placeholder="Search assignments..."
                        />
                    </div>
                    <div class="toolbar-filters">
                        <select id="classFilter" class="filter-select">
                            <option value="all">All Classes</option>
                        </select>
                        <select id="statusFilter" class="filter-select">
                            <option value="all">All Statuses</option>
                            <option value="active">Active</option>
                            <option value="completed">Completed</option>
                            <option value="inactive">Inactive</option>
                        </select>
                    </div>
                    <div class="toolbar-right">
                        <button class="btn btn-primary" id="addAssignmentBtn">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="12" y1="5" x2="12" y2="19"></line>
                                <line x1="5" y1="12" x2="19" y2="12"></line>
                            </svg>
                            Create Assignment
                        </button>
                    </div>
                </div>
                <div id="assignmentsContainer"></div>
            `;
        }

        // Overview page with stats
        if (page === 'overview') {
            return `
                <div class="stats-grid">
                    ${getStatsForRole(role)}
                </div>
                <div class="dashboard-section">
                    <div class="section-header">
                        <h2 class="section-title">Recent Activity</h2>
                    </div>
                    <p style="color: var(--text-secondary);">Content coming soon...</p>
                </div>
            `;
        }

        // Default placeholder
        return `
            <div class="dashboard-section">
                <div class="section-header">
                    <h2 class="section-title">${page.charAt(0).toUpperCase() + page.slice(1)}</h2>
                </div>
                <p style="color: var(--text-secondary);">This section is under development.</p>
            </div>
        `;
    }

    // Get stats cards based on role
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
            ]
        };

        const roleStats = stats[role] || stats.student;
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
        const refreshToken = localStorage.getItem('refresh_token');
        if (!refreshToken) {
            redirectToLogin();
            return;
        }

        try {
            const response = await fetch('/api/auth/refresh', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ refresh_token: refreshToken })
            });

            if (response.ok) {
                const data = await response.json();
                localStorage.setItem('access_token', data.access_token);
            } else {
                redirectToLogin();
            }
        } catch (error) {
            console.error('Token refresh error:', error);
            redirectToLogin();
        }
    }

    // Logout
    async function logout() {
        const token = localStorage.getItem('access_token');

        try {
            await fetch('/api/auth/logout', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
        } catch (error) {
            console.error('Logout error:', error);
        }

        // Clear tokens
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
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

        menuToggle.addEventListener('click', () => {
            sidebar.classList.toggle('open');
            overlay.classList.toggle('active');
        });

        overlay.addEventListener('click', closeMobileMenu);
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

        // Logout button
        document.getElementById('logoutBtn').addEventListener('click', logout);

        console.log('Dashboard initialized ✓');
    });
})();
