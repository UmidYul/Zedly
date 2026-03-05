(function () {
    'use strict';

    const API_URL = '/api';
    const i18n = window.ZedlyI18n || { translate: (k) => k };

    let currentUser = null;
    let profileUser = null;
    let isOwnProfile = false;
    let performanceChart = null;
    let careerChart = null;
    let careerThemeObserver = null;
    let phoneRequestPollTimer = null;
    let activePhoneRequestId = '';
    let contactVerifyModalType = 'email';
    let contactVerifyModalValue = '';
    const PROFILE_ACTIVITY_LIMIT = 10;
    function setProfileLoading(loading) {
        const stats = document.getElementById('statsContent');
        const activity = document.getElementById('activityList');

        if (loading && stats) {
            stats.innerHTML = `
                <div class="skeleton-card"><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line lg" style="width:60%;"></div></div>
                <div class="skeleton-card"><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line lg" style="width:60%;"></div></div>
                <div class="skeleton-card"><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line lg" style="width:60%;"></div></div>
                <div class="skeleton-card"><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line lg" style="width:60%;"></div></div>
            `;
        }

        if (loading && activity) {
            activity.innerHTML = `
                <div class="skeleton skeleton-table-row"></div>
                <div class="skeleton skeleton-table-row"></div>
                <div class="skeleton skeleton-table-row"></div>
            `;
        }
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    async function showAlert(message, title = 'Информация') {
        if (window.ZedlyDialog?.alert) {
            return window.ZedlyDialog.alert(message, { title });
        }
        alert(message);
        return Promise.resolve(true);
    }

    async function showConfirm(message, title = 'Подтверждение') {
        if (window.ZedlyDialog?.confirm) {
            return window.ZedlyDialog.confirm(message, { title });
        }
        return Promise.resolve(confirm(message));
    }

    async function apiFetch(url, options = {}) {
        const response = await fetch(url, options);
        let data = {};
        try {
            data = await response.json();
        } catch (error) {
            data = {};
        }

        if (!response.ok) {
            const err = new Error(data.message || 'Request failed');
            err.status = response.status;
            err.data = data;
            throw err;
        }

        return data;
    }

    function formatDate(dateString) {
        if (!dateString) return '-';
        const date = new Date(dateString);
        if (Number.isNaN(date.getTime())) return '-';
        return date.toLocaleDateString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function toDateInputValue(value) {
        if (!value) return '';
        const date = new Date(value);
        if (!Number.isNaN(date.getTime())) {
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        }

        if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
            return String(value);
        }

        return '';
    }

    function getInitials(firstName, lastName) {
        const first = firstName ? String(firstName).charAt(0).toUpperCase() : '';
        const last = lastName ? String(lastName).charAt(0).toUpperCase() : '';
        return first + last || 'U';
    }

    function roleLabel(role) {
        const map = {
            superadmin: 'Супер Администратор',
            super_admin: 'Супер Администратор',
            school_admin: 'Администратор Школы',
            teacher: 'Учитель',
            student: 'Ученик',
            psychologist: 'Психолог'
        };
        return map[role] || role || '-';
    }

    function setMiniStat(index, value, label) {
        const valueEl = document.getElementById(`statMini${index}Value`);
        const labelEl = document.getElementById(`statMini${index}Label`);
        if (valueEl) valueEl.textContent = value;
        if (labelEl) labelEl.textContent = label;
    }

    function formatPercent(value) {
        const num = Number(value);
        if (!Number.isFinite(num)) return '0%';
        const rounded = Math.round(num * 10) / 10;
        return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}%`;
    }

    function wrapRadarLabel(value, maxLineLen = 13) {
        const text = String(value || '').trim();
        if (!text) return ['-'];
        if (text.length <= maxLineLen) return [text];
        const words = text.split(/\s+/).filter(Boolean);
        if (words.length <= 1) return [text];

        const lines = [];
        let current = '';
        words.forEach((word) => {
            if (!current) {
                current = word;
                return;
            }
            if ((current.length + 1 + word.length) <= maxLineLen) {
                current += ` ${word}`;
                return;
            }
            lines.push(current);
            current = word;
        });
        if (current) lines.push(current);
        return lines.length ? lines : [text];
    }

    function getCareerRadarPalette() {
        const isLight = document.documentElement.getAttribute('data-theme') === 'light';
        if (isLight) {
            return {
                borderColor: 'rgba(2, 132, 199, 1)',
                backgroundColor: 'rgba(14, 116, 144, 0.20)',
                pointBackgroundColor: 'rgba(3, 105, 161, 1)',
                ticksColor: '#334155',
                pointLabelsColor: '#0f172a',
                gridColor: 'rgba(100, 116, 139, 0.35)',
                angleLinesColor: 'rgba(100, 116, 139, 0.30)'
            };
        }

        return {
            borderColor: 'rgba(56, 189, 248, 1)',
            backgroundColor: 'rgba(59, 130, 246, 0.24)',
            pointBackgroundColor: 'rgba(14, 165, 233, 1)',
            ticksColor: '#93c5fd',
            pointLabelsColor: '#dbeafe',
            gridColor: 'rgba(148, 163, 184, 0.25)',
            angleLinesColor: 'rgba(148, 163, 184, 0.22)'
        };
    }

    function getOverviewEndpoint(role) {
        const endpoints = {
            superadmin: '/api/superadmin/dashboard/overview',
            super_admin: '/api/superadmin/dashboard/overview',
            school_admin: '/api/admin/dashboard/overview',
            teacher: '/api/teacher/dashboard/overview',
            psychologist: '/api/psychologist/dashboard/overview',
            student: '/api/student/dashboard/overview'
        };
        return endpoints[role] || null;
    }

    async function loadProfileStats(role) {
        const endpoint = getOverviewEndpoint(role);
        if (!endpoint) return null;
        try {
            return await apiFetch(endpoint);
        } catch (error) {
            console.error('Profile stats load error:', error);
            return null;
        }
    }

    function renderProfileHeader(user) {
        const firstName = user.first_name || '';
        const lastName = user.last_name || '';

        document.getElementById('profileAvatarText').textContent = getInitials(firstName, lastName);
        document.getElementById('profileName').textContent = `${firstName} ${lastName}`.trim() || user.username || 'Пользователь';
        document.getElementById('profileRole').textContent = roleLabel(user.role);
        document.getElementById('profileSchool').textContent = user.school_name || '';

        if (!user.school_name) {
            document.getElementById('profileSchool').style.display = 'none';
        }
    }

    function renderProfileInfo(user) {
        const genderLabels = {
            male: i18n.translate('profile.genderMale'),
            female: i18n.translate('profile.genderFemale'),
            other: i18n.translate('profile.genderOther')
        };
        document.getElementById('profileUsername').textContent = user.username || '-';
        document.getElementById('profileEmail').textContent = user.email || '-';
        document.getElementById('profilePhone').textContent = user.phone || '-';
        document.getElementById('profileDOB').textContent = user.date_of_birth ? formatDate(user.date_of_birth) : '-';
        document.getElementById('profileGender').textContent = genderLabels[user.gender] || '-';
        document.getElementById('profileCreatedAt').textContent = formatDate(user.created_at);
        document.getElementById('profileLastLogin').textContent = user.last_login ? formatDate(user.last_login) : 'Никогда';
    }

    function showRoleSpecificCard(title, items) {
        const card = document.getElementById('profileRoleInfoCard');
        const titleEl = document.getElementById('roleSpecificTitle');
        const content = document.getElementById('roleSpecificContent');
        if (!card || !titleEl || !content) return;

        titleEl.textContent = title;
        content.innerHTML = items.map((item) => `
            <div class="info-row">
                <span>${escapeHtml(item.label)}</span>
                <strong>${escapeHtml(item.value)}</strong>
            </div>
        `).join('');
        card.style.display = 'block';
    }

    async function renderStatsByRole(user) {
        const stats = document.getElementById('statsContent');
        if (!stats) return;

        const statsResponse = await loadProfileStats(user.role);
        const apiStats = statsResponse?.stats || {};
        let cards = [];
        if (user.role === 'student') {
            cards = [
                { value: String(apiStats.tests_completed ?? '-'), label: i18n.translate('profile.testsCompleted') },
                { value: String(apiStats.class_rank ?? '-'), label: i18n.translate('profile.classRank') },
                { value: apiStats.avg_score !== undefined ? formatPercent(apiStats.avg_score) : '-', label: i18n.translate('profile.avgScore') },
                { value: String(apiStats.tests_assigned ?? '-'), label: i18n.translate('profile.testsAssigned') }
            ];
            document.getElementById('chartsCard').style.display = 'block';
            const subjectSeries = Array.isArray(statsResponse?.subjects)
                ? statsResponse.subjects.map((subject) => ({
                    label: subject.subject_name || '-',
                    value: Number(subject.avg_score || 0)
                }))
                : [];
            renderPerformanceChart(subjectSeries);
        } else if (user.role === 'teacher') {
            cards = [
                { value: String(apiStats.tests_created ?? '-'), label: i18n.translate('profile.testsCreated') },
                { value: String(apiStats.assignments_total ?? '-'), label: i18n.translate('profile.testsAssigned') },
                { value: String(apiStats.student_count ?? '-'), label: i18n.translate('profile.studentsCount') },
                { value: apiStats.avg_percentage !== undefined ? formatPercent(apiStats.avg_percentage) : '-', label: i18n.translate('profile.avgClassScore') }
            ];
            document.getElementById('chartsCard').style.display = 'block';
            renderPerformanceChart([]);
        } else if (user.role === 'school_admin') {
            const studentsCount = Number(apiStats.students || 0);
            const teachersCount = Number(apiStats.teachers || 0);
            const adminsCount = Number(apiStats.admins || 0);
            const totalUsers = studentsCount + teachersCount + adminsCount;
            cards = [
                { value: String(studentsCount), label: i18n.translate('profile.totalStudents') },
                { value: String(teachersCount), label: i18n.translate('profile.totalTeachers') },
                { value: String(adminsCount), label: i18n.translate('profile.totalAdmins') || 'Всего администраторов' },
                { value: String(totalUsers), label: i18n.translate('profile.totalUsers') },
                { value: String(apiStats.classes ?? '-'), label: i18n.translate('profile.totalClasses') },
                { value: String(apiStats.subjects ?? '-'), label: i18n.translate('profile.totalSubjects') },
                { value: String(apiStats.tests ?? '-'), label: i18n.translate('profile.totalTests') }
            ];
        } else if (user.role === 'psychologist') {
            cards = [
                { value: String(apiStats.students ?? 0), label: i18n.translate('profile.totalStudents') },
                { value: String(apiStats.career_attempts ?? 0), label: 'Попытки профориентации' },
                { value: String(apiStats.students_with_results ?? 0), label: 'Учеников с результатами' },
                { value: String((statsResponse?.recent_activity || []).length), label: 'Активность (посл. 5)' }
            ];
        } else {
            cards = [
                { value: String(apiStats.schools ?? '-'), label: i18n.translate('profile.totalSchools') },
                { value: String((apiStats.students || 0) + (apiStats.teachers || 0)), label: i18n.translate('profile.totalUsers') },
                { value: String(apiStats.students ?? '-'), label: i18n.translate('profile.totalStudents') },
                { value: String(apiStats.teachers ?? '-'), label: i18n.translate('profile.totalTeachers') }
            ];
        }

        stats.innerHTML = cards.map((item) => `
            <div class="stat-item">
                <div class="stat-item-value">${escapeHtml(item.value)}</div>
                <div class="stat-item-label">${escapeHtml(item.label)}</div>
            </div>
        `).join('');

        setMiniStat(1, cards[0]?.value || '-', cards[0]?.label || 'Показатель 1');
        setMiniStat(2, cards[1]?.value || '-', cards[1]?.label || 'Показатель 2');
        setMiniStat(3, cards[2]?.value || '-', cards[2]?.label || 'Показатель 3');

        const roleItems = [];
        if (user.subjects) {
            roleItems.push({ label: i18n.translate('profile.subjects'), value: Array.isArray(user.subjects) ? user.subjects.join(', ') : String(user.subjects) });
        }
        if (user.classes) {
            roleItems.push({ label: i18n.translate('profile.classes'), value: Array.isArray(user.classes) ? user.classes.join(', ') : String(user.classes) });
        }
        if (user.class_name) {
            roleItems.push({ label: i18n.translate('profile.class'), value: user.class_name });
        }

        if (roleItems.length) {
            showRoleSpecificCard('Дополнительная информация', roleItems);
        }
    }

    function renderPerformanceChart(values) {
        const canvas = document.getElementById('performanceChart');
        if (!canvas || !window.Chart) return;

        if (performanceChart) {
            performanceChart.destroy();
        }

        const labels = values.map((v) => v.label);
        const data = values.map((v) => v.value);
        const chartWrap = canvas.parentElement;
        if (chartWrap) {
            chartWrap.style.overflowX = '';
            chartWrap.style.overflowY = '';
        }
        canvas.style.minWidth = '';
        canvas.style.height = '';
        // Always render subjects as vertical list (Y axis).
        canvas.style.height = `${Math.max(300, labels.length * 34)}px`;
        if (chartWrap) {
            chartWrap.style.maxHeight = '520px';
            chartWrap.style.overflowY = 'auto';
            chartWrap.style.webkitOverflowScrolling = 'touch';
        }

        performanceChart = new Chart(canvas, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: i18n.translate('profile.avgScore'),
                    data,
                    borderColor: 'rgb(74, 144, 226)',
                    backgroundColor: 'rgba(74, 144, 226, 0.15)',
                    borderRadius: 8,
                    barPercentage: 0.62,
                    categoryPercentage: 0.72
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                indexAxis: 'y',
                scales: {
                    x: {
                        beginAtZero: true,
                        max: 100,
                        ticks: {
                            autoSkip: false
                        }
                    },
                    y: {
                        ticks: {
                            autoSkip: false,
                            padding: 10
                        }
                    }
                }
            }
        });
    }

    async function loadCareerResults() {
        const card = document.getElementById('careerSummaryCard');
        const emptyEl = document.getElementById('careerSummaryEmpty');
        const topEl = document.getElementById('careerTopInterestsSummary');
        const recEl = document.getElementById('careerRecommendedSubjectsSummary');
        const openBtn = document.getElementById('profileCareerOpenBtn');
        const pdfBtn = document.getElementById('profileCareerPdfBtn');
        const canvas = document.getElementById('careerRadarChart');

        if (!card || !emptyEl || !topEl || !recEl || !canvas) return;
        if (!profileUser || profileUser.role !== 'student') {
            card.style.display = 'none';
            return;
        }

        card.style.display = 'block';

        if (pdfBtn) {
            pdfBtn.onclick = () => {
                window.open(`${API_URL}/analytics/student/${encodeURIComponent(profileUser.id)}/career/report.pdf`, '_blank');
            };
        }

        if (openBtn) {
            if (isOwnProfile && currentUser?.role === 'student') {
                openBtn.style.display = 'inline-flex';
                openBtn.onclick = () => {
                    window.location.href = '/dashboard#career';
                };
            } else {
                openBtn.style.display = 'none';
            }
        }

        try {
            const data = await apiFetch(`${API_URL}/analytics/student/${encodeURIComponent(profileUser.id)}/report`);
            const latest = data?.career?.latest || null;
            if (!latest) {
                emptyEl.textContent = 'Ученик еще не проходил профориентацию.';
                emptyEl.style.display = 'block';
                canvas.style.display = 'none';
                topEl.innerHTML = '<span class="profile-career-tag">Нет данных</span>';
                recEl.innerHTML = '<span class="profile-career-tag">Нет рекомендаций</span>';
                return;
            }

            const lang = window.ZedlyI18n?.getCurrentLang?.() || 'ru';
            const interests = Array.isArray(latest.interests) ? latest.interests : [];
            const labels = interests.map((it) => lang === 'uz' ? (it.name_uz || it.name_ru || '-') : (it.name_ru || it.name_uz || '-'));
            const scores = interests.map((it) => Number(it.score || 0));

            const top = Array.isArray(latest.top_interests) ? latest.top_interests.slice(0, 3) : [];
            const recommended = Array.isArray(latest.recommended_subjects)
                ? latest.recommended_subjects
                : (lang === 'uz'
                    ? (latest.recommended_subjects?.uz || [])
                    : (latest.recommended_subjects?.ru || []));

            topEl.innerHTML = top.length
                ? top.map((item) => `<span class="profile-career-tag">${escapeHtml(item)}</span>`).join('')
                : '<span class="profile-career-tag">Нет данных</span>';
            recEl.innerHTML = recommended.length
                ? recommended.map((item) => `<span class="profile-career-tag">${escapeHtml(item)}</span>`).join('')
                : '<span class="profile-career-tag">Нет рекомендаций</span>';

            emptyEl.style.display = 'none';

            renderCareerRadarChart(labels, scores);
        } catch (error) {
            emptyEl.textContent = 'Не удалось загрузить результаты профориентации.';
            emptyEl.style.display = 'block';
            canvas.style.display = 'none';
        }
    }

    function renderCareerRadarChart(labels, values) {
        const canvas = document.getElementById('careerRadarChart');
        if (!canvas || !window.Chart) return;

        if (careerChart) {
            careerChart.destroy();
        }

        if (!Array.isArray(labels) || !labels.length) {
            canvas.style.display = 'none';
            return;
        }

        canvas.style.display = 'block';
        const wrappedLabels = labels.map((label) => wrapRadarLabel(label, 13));
        const palette = getCareerRadarPalette();

        careerChart = new Chart(canvas, {
            type: 'radar',
            data: {
                labels: wrappedLabels,
                datasets: [{
                    label: i18n.translate('profile.interests'),
                    data: values,
                    borderColor: palette.borderColor,
                    backgroundColor: palette.backgroundColor,
                    pointBackgroundColor: palette.pointBackgroundColor
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: {
                        beginAtZero: true,
                        max: 100,
                        ticks: {
                            stepSize: 20,
                            color: palette.ticksColor,
                            showLabelBackdrop: false,
                            z: 1,
                            font: {
                                size: 12,
                                family: 'Inter, Segoe UI, Arial, sans-serif',
                                weight: '600'
                            }
                        },
                        pointLabels: {
                            color: palette.pointLabelsColor,
                            font: {
                                size: 12,
                                family: 'Inter, Segoe UI, Arial, sans-serif',
                                weight: '500'
                            }
                        },
                        grid: {
                            color: palette.gridColor
                        },
                        angleLines: {
                            color: palette.angleLinesColor
                        }
                    }
                },
                plugins: {
                    legend: { display: false }
                }
            }
        });
    }

    function bindThemeRefresh() {
        if (careerThemeObserver) {
            careerThemeObserver.disconnect();
        }

        careerThemeObserver = new MutationObserver(() => {
            if (!careerChart) return;
            const palette = getCareerRadarPalette();
            const chartDataset = careerChart.data?.datasets?.[0];
            if (!chartDataset) return;

            chartDataset.borderColor = palette.borderColor;
            chartDataset.backgroundColor = palette.backgroundColor;
            chartDataset.pointBackgroundColor = palette.pointBackgroundColor;

            if (careerChart.options?.scales?.r?.ticks) {
                careerChart.options.scales.r.ticks.color = palette.ticksColor;
            }
            if (careerChart.options?.scales?.r?.pointLabels) {
                careerChart.options.scales.r.pointLabels.color = palette.pointLabelsColor;
            }
            if (careerChart.options?.scales?.r?.grid) {
                careerChart.options.scales.r.grid.color = palette.gridColor;
            }
            if (careerChart.options?.scales?.r?.angleLines) {
                careerChart.options.scales.r.angleLines.color = palette.angleLinesColor;
            }

            careerChart.update('none');
        });

        careerThemeObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-theme']
        });
    }

    function getProfileSettings(user) {
        const settings = user?.settings;
        if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return {};
        return settings.profile && typeof settings.profile === 'object' ? settings.profile : {};
    }

    function setVerificationStatus(type, isVerified) {
        const el = document.getElementById(type === 'email' ? 'emailStatusText' : 'phoneStatusText');
        if (!el) return;
        if (type === 'email') {
            el.textContent = isVerified ? 'Email подтвержден' : 'Email не подтвержден';
        } else {
            el.textContent = isVerified ? 'Телефон подтвержден' : 'Телефон не подтвержден';
        }
        el.style.color = isVerified ? '#16a34a' : '';
    }

    function updateContactVerificationBanner(user) {
        const banner = document.getElementById('contactVerificationBanner');
        if (!banner) return;

        const missing = [];
        if (String(user?.email || '').trim() && !user?.email_verified) {
            missing.push('Email');
        }
        if (String(user?.phone || '').trim() && !user?.phone_verified) {
            missing.push('Телефон');
        }

        if (!missing.length) {
            banner.style.display = 'none';
            banner.textContent = '';
            return;
        }

        banner.textContent = `Не подтверждены: ${missing.join(', ')}. Доступ к системе не ограничен, но рекомендуем подтвердить контакты.`;
        banner.style.display = 'block';
    }

    function parseActivityDetails(rawDetails) {
        if (!rawDetails) return {};
        if (typeof rawDetails === 'object') return rawDetails;
        if (typeof rawDetails !== 'string') return {};
        try {
            return JSON.parse(rawDetails);
        } catch (error) {
            return {};
        }
    }

    function getEntityLabel(entity) {
        const map = {
            user: 'пользователь',
            users: 'пользователь',
            profile: 'профиль',
            test: 'тест',
            tests: 'тест',
            subject: 'предмет',
            subjects: 'предмет',
            class: 'класс',
            classes: 'класс',
            assignment: 'назначение',
            result: 'результат',
            login: 'вход'
        };
        return map[String(entity || '').toLowerCase()] || 'запись';
    }

    function describeActivity(item, details) {
        const action = String(item.action || '').toLowerCase();
        const actionType = String(details.action_type || '').toLowerCase();
        const entityLabel = getEntityLabel(item.entity_type);

        if (actionType === 'login' || action === 'login') return 'Вход в аккаунт';
        if (actionType === 'logout' || action === 'logout') return 'Выход из аккаунта';
        if (actionType === 'password_change') return 'Изменение пароля';
        if (actionType === 'email_change') return 'Изменение email';
        if (actionType === 'phone_change') return 'Изменение телефона';

        if (action === 'create') return `Создан: ${entityLabel}`;
        if (action === 'update') return `Обновлен: ${entityLabel}`;
        if (action === 'delete') return `Удален: ${entityLabel}`;
        if (action === 'assign') return `Назначен: ${entityLabel}`;
        if (action === 'export') return 'Экспорт данных';
        if (action === 'import') return 'Импорт данных';

        return 'Действие в системе';
    }

    function summarizeActivityDetails(details) {
        if (!details || typeof details !== 'object') return '';
        const parts = [];

        if (details.target_name) {
            parts.push(`Объект: ${details.target_name}`);
        }

        return parts.join(' • ');
    }

    function fillOwnForms(user) {
        const profile = getProfileSettings(user);
        const prefs = profile.notification_preferences || {};
        const channels = prefs.channels || {};
        const events = prefs.events || {};

        const setVal = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.value = value || '';
        };
        const setChecked = (id, value, fallback) => {
            const el = document.getElementById(id);
            if (el) el.checked = value !== undefined ? !!value : fallback;
        };

        setVal('emailInput', user.email);
        setVal('phoneInput', user.phone);
        setVal('dobInput', toDateInputValue(user.date_of_birth));
        setVal('genderInput', user.gender || '');
        setChecked('channelInApp', channels.in_app, true);
        setChecked('channelEmail', channels.email, true);
        setChecked('channelTelegram', channels.telegram, true);

        setChecked('eventNewTest', events.new_test, true);
        setChecked('eventTestResults', events.test_results, true);
        setChecked('eventAssignmentDeadline', events.assignment_deadline, true);
        setChecked('eventPasswordReset', events.password_reset, true);
        setChecked('eventProfileUpdates', events.profile_updates, true);
        setChecked('eventSystemUpdates', events.system_updates, false);

        setVerificationStatus('email', !!user.email_verified);
        setVerificationStatus('phone', !!user.phone_verified);
        updateContactVerificationBanner(user);
    }
    function normalizeContactValue(type, value) {
        const raw = String(value || '').trim();
        if (type === 'email') return raw.toLowerCase();
        if (type === 'phone') return raw.replace(/\s+/g, '');
        return raw;
    }

    function isContactAlreadyConnected(type, value) {
        if (!profileUser) return false;

        const normalizedInput = normalizeContactValue(type, value);
        const current = normalizeContactValue(type, profileUser[type]);

        if (!normalizedInput || !current) return false;
        if (normalizedInput !== current) return false;

        if (type === 'email') return !!profileUser.email_verified;
        if (type === 'phone') return !!profileUser.phone_verified;
        return false;
    }

    function ensureContactVerifyModal() {
        if (document.getElementById('contactVerifyModal')) return;

        const backdrop = document.createElement('div');
        backdrop.id = 'contactVerifyModal';
        backdrop.className = 'contact-verify-backdrop';
        backdrop.innerHTML = `
            <div class="contact-verify-modal" role="dialog" aria-modal="true" aria-labelledby="contactVerifyTitle">
                <div class="contact-verify-header">
                    <h3 id="contactVerifyTitle">Подтверждение email</h3>
                    <button type="button" id="closeContactVerifyModalBtn" class="contact-verify-close" aria-label="Close">&times;</button>
                </div>
                <div class="contact-verify-body">
                    <p id="contactVerifyTargetText" class="contact-verify-target"></p>
                    <input id="contactVerifyCodeInput" class="contact-verify-input" type="text" maxlength="6" inputmode="numeric" placeholder="Код подтверждения">
                    <p id="contactVerifyHint" class="contact-verify-hint"></p>
                    <div class="contact-verify-actions">
                        <button type="button" id="cancelContactVerifyBtn" class="btn btn-outline">Отмена</button>
                        <button type="button" id="submitContactVerifyBtn" class="btn btn-primary">Подтвердить</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(backdrop);

        const closeModal = () => {
            backdrop.classList.remove('is-open');
            const codeInput = document.getElementById('contactVerifyCodeInput');
            if (codeInput) codeInput.value = '';
        };

        backdrop.addEventListener('click', (event) => {
            if (event.target === backdrop) {
                closeModal();
            }
        });

        document.getElementById('closeContactVerifyModalBtn')?.addEventListener('click', closeModal);
        document.getElementById('cancelContactVerifyBtn')?.addEventListener('click', closeModal);

        document.getElementById('submitContactVerifyBtn')?.addEventListener('click', async () => {
            const code = document.getElementById('contactVerifyCodeInput')?.value?.trim() || '';
            await verifyContactCode(contactVerifyModalType, code);
        });

        document.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape') return;
            if (backdrop.classList.contains('is-open')) {
                closeModal();
            }
        });
    }

    function openContactVerifyModal({ type, value }) {
        ensureContactVerifyModal();
        contactVerifyModalType = type;
        contactVerifyModalValue = value;

        const title = document.getElementById('contactVerifyTitle');
        const targetText = document.getElementById('contactVerifyTargetText');
        const hint = document.getElementById('contactVerifyHint');
        const codeInput = document.getElementById('contactVerifyCodeInput');
        const backdrop = document.getElementById('contactVerifyModal');

        if (title) {
            title.textContent = type === 'email' ? 'Подтверждение email' : 'Подтверждение телефона';
        }
        if (targetText) {
            targetText.textContent = `Код отправлен на: ${value}`;
        }
        if (hint) {
            hint.textContent = 'Код действует 10 минут';
        }
        if (codeInput) {
            codeInput.value = '';
            codeInput.focus();
        }
        if (backdrop) {
            backdrop.classList.add('is-open');
        }
    }

    function closeContactVerifyModal() {
        const backdrop = document.getElementById('contactVerifyModal');
        if (!backdrop) return;
        backdrop.classList.remove('is-open');
    }

    async function requestContactCode(type) {
        if (type !== 'email') {
            await showAlert('Код подтверждения можно получить только по email', 'Информация');
            return;
        }

        const inputId = type === 'email' ? 'emailInput' : 'phoneInput';
        const value = document.getElementById(inputId)?.value?.trim() || '';

        if (!value) {
            await showAlert(`Введите ${type === 'email' ? 'email' : 'телефон'}`);
            return;
        }

        if (isContactAlreadyConnected(type, value)) {
            await showAlert(type === 'email'
                ? 'Этот email уже привязан к вашему аккаунту'
                : 'Этот телефон уже привязан к вашему аккаунту', 'Информация');
            return;
        }

        try {
            const data = await apiFetch('/api/auth/profile/contact/request-change', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, value })
            });

            openContactVerifyModal({
                type,
                value
            });
        } catch (error) {
            await showAlert(error.message || 'Не удалось отправить код', 'Ошибка');
        }
    }

    async function verifyContactCode(type, codeArg = '') {
        const code = String(codeArg || '').trim();

        if (!code) {
            await showAlert('Введите код подтверждения', 'Ошибка');
            return;
        }

        try {
            const data = await apiFetch('/api/auth/profile/contact/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, code })
            });

            if (type === 'email') {
                const nextEmail = data.email || contactVerifyModalValue || document.getElementById('emailInput')?.value || '-';
                document.getElementById('profileEmail').textContent = nextEmail;
                const emailInput = document.getElementById('emailInput');
                if (emailInput && nextEmail !== '-') emailInput.value = nextEmail;
                profileUser.email = nextEmail === '-' ? '' : nextEmail;
                profileUser.email_verified = true;
            } else {
                const nextPhone = data.phone || contactVerifyModalValue || document.getElementById('phoneInput')?.value || '-';
                document.getElementById('profilePhone').textContent = nextPhone;
                const phoneInput = document.getElementById('phoneInput');
                if (phoneInput && nextPhone !== '-') phoneInput.value = nextPhone;
                profileUser.phone = nextPhone === '-' ? '' : nextPhone;
                profileUser.phone_verified = true;
            }

            setVerificationStatus(type, true);
            updateContactVerificationBanner(profileUser);
            closeContactVerifyModal();
            await showAlert(data.message || 'Контакт подтвержден', 'Успешно');
        } catch (error) {
            await showAlert(error.message || 'Ошибка подтверждения', 'Ошибка');
        }
    }

    function stopPhoneRequestPolling() {
        if (phoneRequestPollTimer) {
            clearInterval(phoneRequestPollTimer);
            phoneRequestPollTimer = null;
        }
    }

    async function pollPhoneRequestStatus() {
        if (!activePhoneRequestId) return;
        try {
            const statusUrl = activePhoneRequestId === '__AUTO__'
                ? '/api/telegram/me/phone/status'
                : `/api/telegram/me/phone/status?request_id=${encodeURIComponent(activePhoneRequestId)}`;
            const status = await apiFetch(statusUrl);
            if (!status?.found) {
                if (activePhoneRequestId === '__AUTO__') {
                    return;
                }
                stopPhoneRequestPolling();
                activePhoneRequestId = '';
                return;
            }

            if (status.status === 'pending') {
                return;
            }

            stopPhoneRequestPolling();

            if (status.status === 'completed' && status.phone) {
                const phoneValue = String(status.phone);
                profileUser.phone = phoneValue;
                profileUser.phone_verified = true;

                const phoneInput = document.getElementById('phoneInput');
                if (phoneInput) phoneInput.value = phoneValue;
                document.getElementById('profilePhone').textContent = phoneValue;
                setVerificationStatus('phone', true);
                updateContactVerificationBanner(profileUser);

                await showAlert('Номер телефона обновлен через Telegram', 'Успешно');
            } else {
                await showAlert('Не удалось подтвердить номер через Telegram. Повторите попытку.', 'Ошибка');
            }

            activePhoneRequestId = '';
        } catch (error) {
            console.error('Phone request status polling error:', error);
        }
    }

    async function requestPhoneFromTelegram() {
        try {
            const btn = document.getElementById('requestPhoneFromTelegramBtn');
            if (btn) btn.disabled = true;
            console.log('[TG_PHONE_UI] requestPhoneFromTelegram:click');

            let forceRelink = false;
            const hasLinkedTelegram = !!profileUser?.telegram_id;
            const hasPhoneToReplace = !!String(profileUser?.phone || '').trim();

            if (hasLinkedTelegram && hasPhoneToReplace) {
                const confirmed = await showConfirm(
                    'При смене номера текущий Telegram-аккаунт будет отвязан, и нужно будет привязать новый аккаунт в боте. Продолжить?',
                    'Смена Telegram аккаунта'
                );

                if (!confirmed) {
                    return;
                }

                forceRelink = true;
            }

            const data = await apiFetch('/api/telegram/me/phone/request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ force_relink: forceRelink })
            });
            console.log('[TG_PHONE_UI] requestPhoneFromTelegram:response', data);

            activePhoneRequestId = String(data?.request_id || '').trim() || '__AUTO__';
            stopPhoneRequestPolling();
            if (activePhoneRequestId) {
                phoneRequestPollTimer = setInterval(pollPhoneRequestStatus, 2500);
            }

            const tgLink = String(data?.link || '').trim();
            if (tgLink) {
                console.log('[TG_PHONE_UI] requestPhoneFromTelegram:redirect', { link: tgLink });
                window.location.href = tgLink;
            }
        } catch (error) {
            console.error('[TG_PHONE_UI] requestPhoneFromTelegram:error', error);
            await showAlert(
                error.message || 'Не удалось отправить запрос в Telegram',
                'Ошибка'
            );
        } finally {
            const btn = document.getElementById('requestPhoneFromTelegramBtn');
            if (btn) btn.disabled = false;
        }
    }

    async function saveNotificationSettings() {
        const notification_preferences = {
            channels: {
                in_app: !!document.getElementById('channelInApp')?.checked,
                email: !!document.getElementById('channelEmail')?.checked,
                telegram: !!document.getElementById('channelTelegram')?.checked
            },
            events: {
                new_test: !!document.getElementById('eventNewTest')?.checked,
                test_results: !!document.getElementById('eventTestResults')?.checked,
                assignment_deadline: !!document.getElementById('eventAssignmentDeadline')?.checked,
                password_reset: !!document.getElementById('eventPasswordReset')?.checked,
                profile_updates: !!document.getElementById('eventProfileUpdates')?.checked,
                system_updates: !!document.getElementById('eventSystemUpdates')?.checked
            },
            frequency: 'instant'
        };

        try {
            const data = await apiFetch('/api/auth/profile/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notification_preferences })
            });

            await showAlert(data.message || 'Настройки сохранены', 'Успешно');
        } catch (error) {
            await showAlert(error.message || 'Не удалось сохранить настройки', 'Ошибка');
        }
    }

    async function savePersonalInfo() {
        const date_of_birth = document.getElementById('dobInput')?.value || null;
        const gender = document.getElementById('genderInput')?.value || null;

        try {
            const data = await apiFetch('/api/auth/profile/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    personal_info: {
                        date_of_birth,
                        gender
                    }
                })
            });

            profileUser.date_of_birth = data?.profile?.personal_info?.date_of_birth || date_of_birth;
            profileUser.gender = data?.profile?.personal_info?.gender || gender;
            renderProfileInfo(profileUser);

            await showAlert('Личные данные сохранены', 'Успешно');
        } catch (error) {
            await showAlert(error.message || 'Не удалось сохранить личные данные', 'Ошибка');
        }
    }

    async function loadActivity() {
        const list = document.getElementById('activityList');
        if (!list) return;

        try {
            const data = await apiFetch(`/api/auth/profile/activity?limit=${PROFILE_ACTIVITY_LIMIT}`);
            const activity = Array.isArray(data.activity) ? data.activity : [];
            if (!activity.length) {
                list.innerHTML = '<p class="no-data">Нет активности</p>';
                return;
            }

            list.innerHTML = activity.map((item) => {
                const details = parseActivityDetails(item.details);
                const actionText = describeActivity(item, details);
                const detailsText = summarizeActivityDetails(details);

                return `
                    <div class="activity-item">
                        <div class="activity-head">
                            <span class="activity-action">${escapeHtml(actionText)}</span>
                            <span class="activity-time">${escapeHtml(formatDate(item.created_at))}</span>
                        </div>
                        ${detailsText ? `<div class="activity-details">${escapeHtml(detailsText)}</div>` : ''}
                    </div>
                `;
            }).join('');
        } catch (error) {
            list.innerHTML = '<p class="no-data">Не удалось загрузить активность</p>';
        }
    }

    function bindOwnActions() {
        ensureContactVerifyModal();
        document.getElementById('requestEmailCodeBtn')?.addEventListener('click', () => requestContactCode('email'));
        document.getElementById('requestPhoneFromTelegramBtn')?.addEventListener('click', requestPhoneFromTelegram);
        document.getElementById('saveNotificationsBtn')?.addEventListener('click', saveNotificationSettings);
        document.getElementById('savePersonalBtn')?.addEventListener('click', savePersonalInfo);
    }

    function bindLanguageRefresh() {
        const langButtons = document.querySelectorAll('.lang-btn');
        langButtons.forEach((btn) => {
            btn.addEventListener('click', () => {
                setTimeout(async () => {
                    if (!profileUser) return;
                    renderProfileInfo(profileUser);
                    await renderStatsByRole(profileUser);
                    await loadCareerResults();
                }, 120);
            });
        });
    }

    async function fetchCurrentUser() {
        const data = await apiFetch('/api/auth/me');
        return data.user || data;
    }

    async function fetchProfileUserById(userId) {
        if (currentUser.role === 'superadmin' || currentUser.role === 'super_admin') {
            const data = await apiFetch(`/api/superadmin/users/${userId}`);
            return data.user || data;
        }

        if (currentUser.role === 'school_admin') {
            const data = await apiFetch(`/api/admin/users/${userId}`);
            return data.user || data;
        }

        if (currentUser.role === 'teacher' || currentUser.role === 'psychologist') {
            const report = await apiFetch(`/api/analytics/student/${encodeURIComponent(userId)}/report`);
            const student = report?.student || {};
            return {
                id: student.id || userId,
                role: 'student',
                username: student.username || '',
                first_name: student.first_name || '',
                last_name: student.last_name || '',
                email: student.email || '',
                class_name: student.class_name || '',
                school_name: currentUser.school_name || ''
            };
        }

        throw new Error('Просмотр чужого профиля недоступен для этой роли');
    }

    async function init() {
        if (!document.getElementById('profileName')) {
            return;
        }
        try {
            setProfileLoading(true);
            currentUser = await fetchCurrentUser();

            const urlParams = new URLSearchParams(window.location.search);
            const requestedId = urlParams.get('id');
            isOwnProfile = !requestedId || String(requestedId) === String(currentUser.id);

            if (isOwnProfile) {
                profileUser = currentUser;
            } else {
                try {
                    profileUser = await fetchProfileUserById(requestedId);
                } catch (error) {
                    await showAlert(error.message || 'Не удалось загрузить профиль, открыт ваш профиль', 'Ошибка');
                    isOwnProfile = true;
                    profileUser = currentUser;
                }
            }

            renderProfileHeader(profileUser);
            renderProfileInfo(profileUser);
            await renderStatsByRole(profileUser);
            await loadCareerResults();
            bindThemeRefresh();

            if (isOwnProfile) {
                document.getElementById('profileActionsCard').style.display = 'block';
                document.getElementById('profilePersonalCard').style.display = 'block';
                document.getElementById('profileNotificationsCard').style.display = 'block';
                document.getElementById('profileActivityCard').style.display = 'block';

                fillOwnForms(profileUser);
                bindOwnActions();
                await loadActivity();
            }

            bindLanguageRefresh();
            setProfileLoading(false);
        } catch (error) {
            console.error('Profile init error:', error);
            setProfileLoading(false);
            await showAlert('Не удалось загрузить профиль', 'Ошибка');
        }
    }

    window.ProfilePage = { init };

    if (window.location.pathname.includes('profile.html')) {
        document.addEventListener('DOMContentLoaded', init);
    }
})();
