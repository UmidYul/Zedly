(function () {
    'use strict';

    const API_URL = '/api';
    const i18n = window.ZedlyI18n || { translate: (k) => k };

    let currentUser = null;
    let profileUser = null;
    let isOwnProfile = false;
    let performanceChart = null;
    let careerChart = null;

    function getToken() {
        return localStorage.getItem('access_token') || localStorage.getItem('accessToken') || '';
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

    async function apiFetch(url, options = {}) {
        const headers = {
            ...(options.headers || {}),
            Authorization: `Bearer ${getToken()}`
        };

        const response = await fetch(url, { ...options, headers });
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
            student: 'Ученик'
        };
        return map[role] || role || '-';
    }

    function setMiniStat(index, value, label) {
        const valueEl = document.getElementById(`statMini${index}Value`);
        const labelEl = document.getElementById(`statMini${index}Label`);
        if (valueEl) valueEl.textContent = value;
        if (labelEl) labelEl.textContent = label;
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
        document.getElementById('profileUsername').textContent = user.username || '-';
        document.getElementById('profileEmail').textContent = user.email || '-';
        document.getElementById('profilePhone').textContent = user.phone || '-';
        document.getElementById('profileDOB').textContent = user.date_of_birth ? formatDate(user.date_of_birth) : '-';
        document.getElementById('profileGender').textContent = user.gender || '-';
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

    function renderStatsByRole(user) {
        const stats = document.getElementById('statsContent');
        if (!stats) return;

        let cards = [];
        if (user.role === 'student') {
            cards = [
                { value: '-', label: i18n.translate('profile.testsCompleted') },
                { value: '-', label: i18n.translate('profile.classRank') },
                { value: '-', label: i18n.translate('profile.avgScore') },
                { value: '-', label: i18n.translate('profile.testsAssigned') }
            ];
            document.getElementById('chartsCard').style.display = 'block';
            renderPerformanceChart([]);
            if (isOwnProfile) {
                document.getElementById('careerTestCard').style.display = 'block';
                loadCareerResults().catch((error) => {
                    console.error('Career load error:', error);
                });
            }
        } else if (user.role === 'teacher') {
            cards = [
                { value: '-', label: i18n.translate('profile.testsCreated') },
                { value: '-', label: i18n.translate('profile.testsAssigned') },
                { value: '-', label: i18n.translate('profile.studentsCount') },
                { value: '-', label: i18n.translate('profile.avgClassScore') }
            ];
            document.getElementById('chartsCard').style.display = 'block';
            renderPerformanceChart([]);
        } else if (user.role === 'school_admin') {
            cards = [
                { value: '-', label: i18n.translate('profile.totalUsers') },
                { value: '-', label: i18n.translate('profile.totalClasses') },
                { value: '-', label: i18n.translate('profile.totalSubjects') },
                { value: '-', label: i18n.translate('profile.totalTests') }
            ];
        } else {
            cards = [
                { value: '-', label: i18n.translate('profile.totalSchools') },
                { value: '-', label: i18n.translate('profile.totalUsers') },
                { value: '-', label: i18n.translate('profile.totalStudents') },
                { value: '-', label: i18n.translate('profile.totalTeachers') }
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

        const labels = values.length ? values.map((v) => v.label) : ['Математика', 'Физика', 'Химия', 'Биология', 'Информатика'];
        const data = values.length ? values.map((v) => v.value) : [0, 0, 0, 0, 0];

        performanceChart = new Chart(canvas, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: i18n.translate('profile.avgScore'),
                    data,
                    borderColor: 'rgb(74, 144, 226)',
                    backgroundColor: 'rgba(74, 144, 226, 0.15)',
                    tension: 0.35,
                    fill: true,
                    pointRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, max: 100 }
                }
            }
        });
    }

    async function loadCareerResults() {
        const content = document.getElementById('careerTestContent');
        if (!content) return;

        try {
            const data = await apiFetch(`${API_URL}/student/career/results`);
            if (!data.result) {
                content.innerHTML = '<p class="no-data">Тест не пройден</p>';
                return;
            }

            const result = data.result;
            const lang = window.ZedlyI18n?.getCurrentLang?.() || 'ru';
            const labels = (result.interests || []).map((it) => lang === 'uz' ? it.name_uz : it.name_ru);
            const scores = (result.interests || []).map((it) => it.score);

            content.innerHTML = `
                <div class="info-row"><span>Дата</span><strong>${escapeHtml(formatDate(result.completed_at))}</strong></div>
                <div class="info-row"><span>Интересов</span><strong>${escapeHtml(String(labels.length))}</strong></div>
            `;

            renderCareerRadarChart(labels, scores);
        } catch (error) {
            content.innerHTML = '<p class="no-data">Не удалось загрузить результаты профориентации</p>';
        }
    }

    function renderCareerRadarChart(labels, values) {
        const canvas = document.getElementById('careerRadarChart');
        if (!canvas || !window.Chart) return;

        if (careerChart) {
            careerChart.destroy();
        }

        canvas.style.display = 'block';

        careerChart = new Chart(canvas, {
            type: 'radar',
            data: {
                labels,
                datasets: [{
                    label: i18n.translate('profile.interests'),
                    data: values,
                    borderColor: 'rgb(74, 144, 226)',
                    backgroundColor: 'rgba(74, 144, 226, 0.2)'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                scales: { r: { beginAtZero: true, max: 100 } }
            }
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
        el.textContent = isVerified ? 'Статус: подтвержден' : 'Статус: не подтвержден';
        el.style.color = isVerified ? '#16a34a' : '';
    }

    function fillOwnForms(user) {
        const profile = getProfileSettings(user);
        const socials = profile.social_links || {};
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
        setVal('socialTelegramInput', socials.telegram);
        setVal('socialInstagramInput', socials.instagram);
        setVal('socialWebsiteInput', socials.website);
        setVal('notificationFrequency', prefs.frequency || 'instant');

        setChecked('channelInApp', channels.in_app, true);
        setChecked('channelEmail', channels.email, true);
        setChecked('channelTelegram', channels.telegram, true);

        setChecked('eventNewTest', events.new_test, true);
        setChecked('eventAssignmentDeadline', events.assignment_deadline, true);
        setChecked('eventPasswordReset', events.password_reset, true);
        setChecked('eventProfileUpdates', events.profile_updates, true);
        setChecked('eventSystemUpdates', events.system_updates, false);

        setVerificationStatus('email', !!user.email_verified);
        setVerificationStatus('phone', !!user.phone_verified);
    }

    async function requestContactCode(type) {
        const inputId = type === 'email' ? 'emailInput' : 'phoneInput';
        const value = document.getElementById(inputId)?.value?.trim() || '';

        if (!value) {
            await showAlert(`Введите ${type === 'email' ? 'email' : 'телефон'}`);
            return;
        }

        try {
            const data = await apiFetch('/api/auth/profile/contact/request-change', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, value })
            });

            const codeHint = data.dev_verification_code ? ` (dev code: ${data.dev_verification_code})` : '';
            await showAlert((data.message || 'Код отправлен') + codeHint, 'Успешно');
        } catch (error) {
            await showAlert(error.message || 'Не удалось отправить код', 'Ошибка');
        }
    }

    async function verifyContactCode(type) {
        const codeInputId = type === 'email' ? 'emailCodeInput' : 'phoneCodeInput';
        const code = document.getElementById(codeInputId)?.value?.trim() || '';

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
                document.getElementById('profileEmail').textContent = data.email || document.getElementById('emailInput')?.value || '-';
            } else {
                document.getElementById('profilePhone').textContent = data.phone || document.getElementById('phoneInput')?.value || '-';
            }

            setVerificationStatus(type, true);
            await showAlert(data.message || 'Контакт подтвержден', 'Успешно');
        } catch (error) {
            await showAlert(error.message || 'Ошибка подтверждения', 'Ошибка');
        }
    }

    async function saveProfileSettings() {
        const social_links = {
            telegram: document.getElementById('socialTelegramInput')?.value?.trim() || '',
            instagram: document.getElementById('socialInstagramInput')?.value?.trim() || '',
            website: document.getElementById('socialWebsiteInput')?.value?.trim() || ''
        };

        const notification_preferences = {
            channels: {
                in_app: !!document.getElementById('channelInApp')?.checked,
                email: !!document.getElementById('channelEmail')?.checked,
                telegram: !!document.getElementById('channelTelegram')?.checked
            },
            events: {
                new_test: !!document.getElementById('eventNewTest')?.checked,
                assignment_deadline: !!document.getElementById('eventAssignmentDeadline')?.checked,
                password_reset: !!document.getElementById('eventPasswordReset')?.checked,
                profile_updates: !!document.getElementById('eventProfileUpdates')?.checked,
                system_updates: !!document.getElementById('eventSystemUpdates')?.checked
            },
            frequency: document.getElementById('notificationFrequency')?.value || 'instant'
        };

        try {
            const data = await apiFetch('/api/auth/profile/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ social_links, notification_preferences })
            });

            await showAlert(data.message || 'Настройки сохранены', 'Успешно');
        } catch (error) {
            await showAlert(error.message || 'Не удалось сохранить настройки', 'Ошибка');
        }
    }

    async function loadActivity() {
        const list = document.getElementById('activityList');
        if (!list) return;

        try {
            const data = await apiFetch('/api/auth/profile/activity?limit=30');
            const activity = Array.isArray(data.activity) ? data.activity : [];
            if (!activity.length) {
                list.innerHTML = '<p class="no-data">Нет активности</p>';
                return;
            }

            list.innerHTML = activity.map((item) => {
                const details = item.details
                    ? (typeof item.details === 'string' ? item.details : JSON.stringify(item.details))
                    : '';

                return `
                    <div class="activity-item">
                        <div class="activity-head">
                            <span class="activity-action">${escapeHtml(item.action || 'action')} / ${escapeHtml(item.entity_type || '-')}</span>
                            <span class="activity-time">${escapeHtml(formatDate(item.created_at))}</span>
                        </div>
                        ${details ? `<div class="activity-details">${escapeHtml(details)}</div>` : ''}
                    </div>
                `;
            }).join('');
        } catch (error) {
            list.innerHTML = '<p class="no-data">Не удалось загрузить активность</p>';
        }
    }

    function bindOwnActions() {
        document.getElementById('requestEmailCodeBtn')?.addEventListener('click', () => requestContactCode('email'));
        document.getElementById('verifyEmailBtn')?.addEventListener('click', () => verifyContactCode('email'));
        document.getElementById('requestPhoneCodeBtn')?.addEventListener('click', () => requestContactCode('phone'));
        document.getElementById('verifyPhoneBtn')?.addEventListener('click', () => verifyContactCode('phone'));
        document.getElementById('saveSocialsBtn')?.addEventListener('click', saveProfileSettings);
        document.getElementById('saveNotificationsBtn')?.addEventListener('click', saveProfileSettings);
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

        throw new Error('Просмотр чужого профиля недоступен для этой роли');
    }

    async function init() {
        try {
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
            renderStatsByRole(profileUser);

            if (isOwnProfile) {
                document.getElementById('profileActionsCard').style.display = 'block';
                document.getElementById('profileSocialsCard').style.display = 'block';
                document.getElementById('profileNotificationsCard').style.display = 'block';
                document.getElementById('profileActivityCard').style.display = 'block';

                fillOwnForms(profileUser);
                bindOwnActions();
                await loadActivity();
            }
        } catch (error) {
            console.error('Profile init error:', error);
            await showAlert('Не удалось загрузить профиль', 'Ошибка');
        }
    }

    document.addEventListener('DOMContentLoaded', init);
})();
