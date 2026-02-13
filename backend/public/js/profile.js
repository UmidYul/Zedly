// Profile Page JavaScript
(function () {
    'use strict';

    const API_URL = '/api';
    const i18n = window.ZedlyI18n || { translate: (key) => key };
    let currentUser = null;
    let profileUserId = null; // ID of the profile being viewed
    let isOwnProfile = false;
    let performanceChart = null;
    let careerChart = null;

    function showAlert(message, title = 'Ошибка') {
        if (window.ZedlyDialog?.alert) {
            return window.ZedlyDialog.alert(message, { title });
        }
        alert(message);
        return Promise.resolve(true);
    }

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

    // Initialize
    document.addEventListener('DOMContentLoaded', init);

    async function init() {
        try {
            // Get current user
            currentUser = await fetchCurrentUser();

            // Get user ID from URL params (if viewing another user's profile)
            const urlParams = new URLSearchParams(window.location.search);
            profileUserId = urlParams.get('id') || currentUser.id;

            // Check permissions
            if (!canViewProfile(profileUserId)) {
                showError('У вас нет прав для просмотра этого профиля');
                setTimeout(() => window.location.href = 'dashboard.html', 2000);
                return;
            }

            // Load profile data
            await loadProfileData();
        } catch (error) {
            console.error('Error initializing profile:', error);
            showError('Ошибка загрузки профиля');
        }
    }

    // Fetch current user
    async function fetchCurrentUser() {
        const response = await fetch(`${API_URL}/auth/me`, {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch user');
        }

        const data = await response.json();
        return data.user || data;
    }

    // Check if current user can view this profile
    function canViewProfile(userId) {
        // User can always view their own profile
        if (userId === currentUser.id || userId === String(currentUser.id)) {
            return true;
        }

        // SuperAdmin can view all profiles
        if (currentUser.role === 'super_admin') {
            return true;
        }

        // SchoolAdmin can view profiles in their school
        if (currentUser.role === 'school_admin') {
            return true; // We'll verify school_id on the backend
        }

        // Teachers can view student profiles in their classes
        if (currentUser.role === 'teacher') {
            return true; // We'll verify on the backend
        }

        return false;
    }

    // Load profile data
    async function loadProfileData() {
        try {
            isOwnProfile = profileUserId === currentUser.id || profileUserId === String(currentUser.id);

            let profileData;
            if (isOwnProfile) {
                // Use /me endpoint for own profile
                profileData = currentUser;
            } else {
                // Fetch other user's profile
                profileData = await fetchUserProfile(profileUserId);
            }

            // Render profile
            renderProfile(profileData);

            if (isOwnProfile) {
                initOwnProfileFeatures(profileData);
            }

            // Load role-specific data
            await loadRoleSpecificData(profileData);
        } catch (error) {
            console.error('Error loading profile:', error);
            showError('Ошибка загрузки данных профиля');
        }
    }

    // Fetch user profile by ID
    async function fetchUserProfile(userId) {
        const endpoint = currentUser.role === 'super_admin'
            ? `${API_URL}/superadmin/users/${userId}`
            : `${API_URL}/admin/users/${userId}`;

        const response = await fetch(endpoint, {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch user profile');
        }

        const data = await response.json();
        return data.user || data;
    }

    // Render profile basic info
    function renderProfile(user) {
        // Avatar
        const initials = getInitials(user.first_name, user.last_name);
        document.getElementById('profileAvatarText').textContent = initials;

        // Header
        document.getElementById('profileName').textContent = `${user.first_name} ${user.last_name}`;
        document.getElementById('profileRole').textContent = getRoleDisplayName(user.role);

        if (user.school_name) {
            document.getElementById('profileSchool').textContent = user.school_name;
            document.getElementById('profileSchool').style.display = 'block';
        } else {
            document.getElementById('profileSchool').style.display = 'none';
        }

        // Personal info
        document.getElementById('profileUsername').textContent = user.username;
        document.getElementById('profileEmail').textContent = user.email || '-';
        document.getElementById('profilePhone').textContent = user.phone || '-';
        document.getElementById('profileDOB').textContent = user.date_of_birth ? formatDate(user.date_of_birth) : '-';
        document.getElementById('profileGender').textContent = user.gender ? getGenderDisplayName(user.gender) : '-';
        document.getElementById('profileCreatedAt').textContent = formatDate(user.created_at);
        document.getElementById('profileLastLogin').textContent = user.last_login ? formatDate(user.last_login) : 'Никогда';
    }

    // Load role-specific data
    async function loadRoleSpecificData(user) {
        switch (user.role) {
            case 'student':
                await loadStudentData(user);
                break;
            case 'teacher':
                await loadTeacherData(user);
                break;
            case 'school_admin':
                await loadSchoolAdminData(user);
                break;
            case 'super_admin':
                await loadSuperAdminData(user);
                break;
        }
    }

    // Load student-specific data
    async function loadStudentData(user) {
        try {
            // Mini stats
            updateMiniStats([
                { value: '-', label: i18n.translate('profile.testsCompleted') },
                { value: '-', label: i18n.translate('profile.classRank') },
                { value: '-', label: i18n.translate('profile.avgScore') }
            ]);

            // Role-specific info (class info)
            if (user.class_name) {
                showRoleSpecificCard(i18n.translate('profile.classInfo'), [
                    { label: i18n.translate('profile.class'), value: user.class_name },
                    { label: i18n.translate('profile.classTeacher'), value: user.class_teacher || '-' }
                ]);
            }

            // Statistics
            const statsContent = document.getElementById('statsContent');
            statsContent.innerHTML = `
                <div class="stat-item">
                    <div class="stat-item-value">-</div>
                    <div class="stat-item-label">${i18n.translate('profile.testsAssigned')}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-item-value">-</div>
                    <div class="stat-item-label">${i18n.translate('profile.testsCompleted')}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-item-value">-</div>
                    <div class="stat-item-label">${i18n.translate('profile.testsPassed')}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-item-value">-</div>
                    <div class="stat-item-label">${i18n.translate('profile.avgScore')}</div>
                </div>
            `;

            // Performance chart (placeholder)
            document.getElementById('chartsCard').style.display = 'block';
            renderPerformanceChart([]);

            // Career test results
            document.getElementById('careerTestCard').style.display = 'block';
            await loadCareerResults(isOwnProfile);
        } catch (error) {
            console.error('Error loading student data:', error);
        }
    }

    async function loadCareerResults(isOwnProfile) {
        const content = document.getElementById('careerTestContent');
        const emptyState = content?.querySelector('.no-data');

        if (!isOwnProfile || currentUser.role !== 'student') {
            return;
        }

        try {
            const response = await fetch(`${API_URL}/student/career/results`);
            if (!response.ok) {
                throw new Error('Failed to fetch career results');
            }

            const data = await response.json();
            if (!data.result) {
                return;
            }

            if (emptyState) {
                emptyState.style.display = 'none';
            }

            const lang = window.ZedlyI18n?.getCurrentLang?.() || 'ru';
            const labels = data.result.interests.map((interest) => (lang === 'uz' ? interest.name_uz : interest.name_ru));
            const values = data.result.interests.map((interest) => interest.score);
            const topInterests = [...data.result.interests]
                .sort((a, b) => b.score - a.score)
                .slice(0, 3)
                .map((interest) => (lang === 'uz' ? interest.name_uz : interest.name_ru));

            renderCareerRadarChart({ labels, values });

            const recommended = data.result.recommended_subjects || {};
            const recommendedList = Array.isArray(recommended)
                ? recommended
                : (lang === 'uz' ? recommended.uz : recommended.ru) || [];

            content.innerHTML = `
                <div class="career-summary">
                    <p><strong>${i18n.translate('profile.careerTopInterests')}</strong></p>
                    <p>${topInterests.join(', ')}</p>
                    <p><strong>${i18n.translate('profile.careerRecommendations')}</strong></p>
                    ${recommendedList.length
                    ? `<ul>${recommendedList.map((item) => `<li>${item}</li>`).join('')}</ul>`
                    : `<p>${i18n.translate('profile.noCareerRecommendations')}</p>`
                }
                </div>
            `;
        } catch (error) {
            console.error('Career results error:', error);
        }
    }

    // Load teacher-specific data
    async function loadTeacherData(user) {
        try {
            // Mini stats
            updateMiniStats([
                { value: '-', label: i18n.translate('profile.testsCreated') },
                { value: '-', label: i18n.translate('profile.studentsCount') },
                { value: '-', label: i18n.translate('profile.teacherRank') }
            ]);

            // Role-specific info (subjects & classes)
            const roleSpecificData = [];

            if (user.subjects) {
                roleSpecificData.push({
                    label: i18n.translate('profile.subjects'),
                    value: Array.isArray(user.subjects) ? user.subjects.join(', ') : user.subjects
                });
            }

            if (user.classes) {
                roleSpecificData.push({
                    label: i18n.translate('profile.classes'),
                    value: Array.isArray(user.classes) ? user.classes.join(', ') : user.classes
                });
            }

            if (roleSpecificData.length > 0) {
                showRoleSpecificCard(i18n.translate('profile.teachingInfo'), roleSpecificData);
            }

            // Statistics
            const statsContent = document.getElementById('statsContent');
            statsContent.innerHTML = `
                <div class="stat-item">
                    <div class="stat-item-value">-</div>
                    <div class="stat-item-label">${i18n.translate('profile.testsCreated')}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-item-value">-</div>
                    <div class="stat-item-label">${i18n.translate('profile.testsAssigned')}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-item-value">-</div>
                    <div class="stat-item-label">${i18n.translate('profile.studentsCount')}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-item-value">-</div>
                    <div class="stat-item-label">${i18n.translate('profile.avgClassScore')}</div>
                    <div class="stat-item-sublabel">${i18n.translate('profile.avgClassScoreSub')}</div>
                </div>
            `;

            // Performance chart (placeholder)
            document.getElementById('chartsCard').style.display = 'block';
            renderPerformanceChart([]);
        } catch (error) {
            console.error('Error loading teacher data:', error);
        }
    }

    // Load school admin data
    async function loadSchoolAdminData(user) {
        try {
            // Mini stats
            updateMiniStats([
                { value: '-', label: i18n.translate('profile.totalStudents') },
                { value: '-', label: i18n.translate('profile.totalTeachers') },
                { value: '-', label: i18n.translate('profile.totalClasses') }
            ]);

            // Statistics
            const statsContent = document.getElementById('statsContent');
            statsContent.innerHTML = `
                <div class="stat-item">
                    <div class="stat-item-value">-</div>
                    <div class="stat-item-label">${i18n.translate('profile.totalUsers')}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-item-value">-</div>
                    <div class="stat-item-label">${i18n.translate('profile.totalClasses')}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-item-value">-</div>
                    <div class="stat-item-label">${i18n.translate('profile.totalSubjects')}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-item-value">-</div>
                    <div class="stat-item-label">${i18n.translate('profile.totalTests')}</div>
                </div>
            `;
        } catch (error) {
            console.error('Error loading school admin data:', error);
        }
    }

    // Load super admin data
    async function loadSuperAdminData(user) {
        try {
            // Mini stats
            updateMiniStats([
                { value: '-', label: i18n.translate('profile.totalSchools') },
                { value: '-', label: i18n.translate('profile.totalUsers') },
                { value: '-', label: i18n.translate('profile.totalTests') }
            ]);

            // Statistics
            const statsContent = document.getElementById('statsContent');
            statsContent.innerHTML = `
                <div class="stat-item">
                    <div class="stat-item-value">-</div>
                    <div class="stat-item-label">${i18n.translate('profile.totalSchools')}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-item-value">-</div>
                    <div class="stat-item-label">${i18n.translate('profile.totalUsers')}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-item-value">-</div>
                    <div class="stat-item-label">${i18n.translate('profile.totalStudents')}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-item-value">-</div>
                    <div class="stat-item-label">${i18n.translate('profile.totalTeachers')}</div>
                </div>
            `;
        } catch (error) {
            console.error('Error loading super admin data:', error);
        }
    }

    // Update mini stats in header
    function updateMiniStats(stats) {
        stats.forEach((stat, index) => {
            const element = document.getElementById(`statMini${index + 1}`);
            if (element) {
                element.querySelector('.stat-mini-value').textContent = stat.value;
                element.querySelector('.stat-mini-label').textContent = stat.label;
            }
        });
    }

    // Show role-specific card
    function showRoleSpecificCard(title, items) {
        const card = document.getElementById('roleSpecificCard');
        const titleEl = document.getElementById('roleSpecificTitle');
        const content = document.getElementById('roleSpecificContent');

        titleEl.textContent = title;
        content.innerHTML = items.map(item => `
            <div class="info-item">
                <span class="info-label">${item.label}:</span>
                <span class="info-value">${item.value}</span>
            </div>
        `).join('');

        card.style.display = 'block';
    }

    function getProfileSettings(user) {
        const settings = user?.settings && typeof user.settings === 'object' ? user.settings : {};
        return settings.profile && typeof settings.profile === 'object' ? settings.profile : {};
    }

    function setVerificationStatusText(type, verified) {
        const el = document.getElementById(type === 'email' ? 'emailStatusText' : 'phoneStatusText');
        if (!el) return;
        el.textContent = verified ? 'Статус: подтвержден' : 'Статус: не подтвержден';
        el.style.color = verified ? '#16a34a' : '';
    }

    function fillOwnProfileSettings(user) {
        const profileSettings = getProfileSettings(user);
        const social = profileSettings.social_links || {};
        const prefs = profileSettings.notification_preferences || {};
        const channels = prefs.channels || {};
        const events = prefs.events || {};

        const emailInput = document.getElementById('emailInput');
        const phoneInput = document.getElementById('phoneInput');
        if (emailInput) emailInput.value = user.email || '';
        if (phoneInput) phoneInput.value = user.phone || '';

        const socialTelegramInput = document.getElementById('socialTelegramInput');
        const socialInstagramInput = document.getElementById('socialInstagramInput');
        const socialWebsiteInput = document.getElementById('socialWebsiteInput');
        if (socialTelegramInput) socialTelegramInput.value = social.telegram || '';
        if (socialInstagramInput) socialInstagramInput.value = social.instagram || '';
        if (socialWebsiteInput) socialWebsiteInput.value = social.website || '';

        const notificationFrequency = document.getElementById('notificationFrequency');
        if (notificationFrequency) {
            notificationFrequency.value = prefs.frequency || 'instant';
        }

        const setChecked = (id, value, fallback = true) => {
            const el = document.getElementById(id);
            if (el) el.checked = value !== undefined ? !!value : fallback;
        };

        setChecked('channelInApp', channels.in_app, true);
        setChecked('channelEmail', channels.email, true);
        setChecked('channelTelegram', channels.telegram, true);
        setChecked('eventNewTest', events.new_test, true);
        setChecked('eventAssignmentDeadline', events.assignment_deadline, true);
        setChecked('eventPasswordReset', events.password_reset, true);
        setChecked('eventProfileUpdates', events.profile_updates, true);
        setChecked('eventSystemUpdates', events.system_updates, false);

        setVerificationStatusText('email', !!user.email_verified);
        setVerificationStatusText('phone', !!user.phone_verified);
    }

    async function requestContactChange(type) {
        const inputId = type === 'email' ? 'emailInput' : 'phoneInput';
        const inputEl = document.getElementById(inputId);
        const value = inputEl?.value?.trim() || '';

        if (!value) {
            showAlert(`Введите ${type === 'email' ? 'email' : 'телефон'}`);
            return;
        }

        const response = await fetch('/api/auth/profile/contact/request-change', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({ type, value })
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            showAlert(data.message || 'Не удалось запросить код');
            return;
        }

        const devCode = data.dev_verification_code ? ` (dev code: ${data.dev_verification_code})` : '';
        showAlert(`${data.message || 'Код отправлен'}${devCode}`, 'Успешно');
    }

    async function verifyContactChange(type) {
        const codeInputId = type === 'email' ? 'emailCodeInput' : 'phoneCodeInput';
        const codeEl = document.getElementById(codeInputId);
        const code = codeEl?.value?.trim() || '';

        if (!code) {
            showAlert('Введите код подтверждения');
            return;
        }

        const response = await fetch('/api/auth/profile/contact/verify', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({ type, code })
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            showAlert(data.message || 'Не удалось подтвердить контакт');
            return;
        }

        if (type === 'email') {
            const emailValue = document.getElementById('emailInput')?.value?.trim() || data.email || '-';
            document.getElementById('profileEmail').textContent = emailValue;
        } else {
            const phoneValue = document.getElementById('phoneInput')?.value?.trim() || data.phone || '-';
            document.getElementById('profilePhone').textContent = phoneValue;
        }
        setVerificationStatusText(type, true);
        showAlert(data.message || 'Контакт подтвержден', 'Успешно');
    }

    async function saveOwnProfileSettings() {
        const socialLinks = {
            telegram: document.getElementById('socialTelegramInput')?.value?.trim() || '',
            instagram: document.getElementById('socialInstagramInput')?.value?.trim() || '',
            website: document.getElementById('socialWebsiteInput')?.value?.trim() || ''
        };

        const notificationPreferences = {
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

        const response = await fetch('/api/auth/profile/settings', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({
                social_links: socialLinks,
                notification_preferences: notificationPreferences
            })
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            showAlert(data.message || 'Не удалось сохранить настройки профиля');
            return;
        }

        showAlert(data.message || 'Настройки сохранены', 'Успешно');
    }

    function renderActivityHistory(items) {
        const list = document.getElementById('activityList');
        if (!list) return;

        if (!items || items.length === 0) {
            list.innerHTML = '<p class="no-data">Нет активности</p>';
            return;
        }

        list.innerHTML = items.map((item) => {
            let details = '';
            if (item.details && typeof item.details === 'object') {
                details = JSON.stringify(item.details);
            } else if (typeof item.details === 'string') {
                details = item.details;
            }

            return `
                <div class="activity-item">
                    <div class="activity-item-header">
                        <span class="activity-action">${escapeHtml(item.action || 'action')} / ${escapeHtml(item.entity_type || '-')}</span>
                        <span class="activity-time">${escapeHtml(formatDate(item.created_at))}</span>
                    </div>
                    ${details ? `<div class="activity-details">${escapeHtml(details)}</div>` : ''}
                </div>
            `;
        }).join('');
    }

    async function loadOwnActivity() {
        const response = await fetch('/api/auth/profile/activity?limit=30', {
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            renderActivityHistory([]);
            return;
        }

        renderActivityHistory(data.activity || []);
    }

    function initOwnProfileFeatures(user) {
        const advancedCard = document.getElementById('profileAdvancedCard');
        const socialsCard = document.getElementById('profileSocialsCard');
        const notificationsCard = document.getElementById('profileNotificationsCard');
        const activityCard = document.getElementById('profileActivityCard');

        if (advancedCard) advancedCard.style.display = 'block';
        if (socialsCard) socialsCard.style.display = 'block';
        if (notificationsCard) notificationsCard.style.display = 'block';
        if (activityCard) activityCard.style.display = 'block';

        fillOwnProfileSettings(user);

        document.getElementById('requestEmailCodeBtn')?.addEventListener('click', () => requestContactChange('email'));
        document.getElementById('verifyEmailBtn')?.addEventListener('click', () => verifyContactChange('email'));
        document.getElementById('requestPhoneCodeBtn')?.addEventListener('click', () => requestContactChange('phone'));
        document.getElementById('verifyPhoneBtn')?.addEventListener('click', () => verifyContactChange('phone'));
        document.getElementById('saveSocialsBtn')?.addEventListener('click', saveOwnProfileSettings);
        document.getElementById('saveNotificationsBtn')?.addEventListener('click', saveOwnProfileSettings);

        loadOwnActivity().catch((error) => {
            console.error('Failed to load activity', error);
        });
    }

    // Render performance chart
    function renderPerformanceChart(data) {
        const ctx = document.getElementById('performanceChart');

        if (performanceChart) {
            performanceChart.destroy();
        }

        // Placeholder data
        const labels = ['Математика', 'Физика', 'Химия', 'Биология', 'Информатика'];
        const values = [0, 0, 0, 0, 0];

        performanceChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: i18n.translate('profile.avgScore'),
                    data: values,
                    borderColor: 'rgb(74, 144, 226)',
                    backgroundColor: 'rgba(74, 144, 226, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100
                    }
                }
            }
        });
    }

    // Render career radar chart
    function renderCareerRadarChart(data) {
        const ctx = document.getElementById('careerRadarChart');

        if (careerChart) {
            careerChart.destroy();
        }

        ctx.style.display = 'block';
        document.querySelector('#careerTestContent .no-data').style.display = 'none';

        careerChart = new Chart(ctx, {
            type: 'radar',
            data: {
                labels: data.labels,
                datasets: [{
                    label: i18n.translate('profile.interests'),
                    data: data.values,
                    borderColor: 'rgb(74, 144, 226)',
                    backgroundColor: 'rgba(74, 144, 226, 0.2)',
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                scales: {
                    r: {
                        beginAtZero: true,
                        max: 100
                    }
                }
            }
        });
    }

    // Utility functions
    function getInitials(firstName, lastName) {
        const first = firstName ? firstName.charAt(0).toUpperCase() : '';
        const last = lastName ? lastName.charAt(0).toUpperCase() : '';
        return first + last || 'U';
    }

    function getRoleDisplayName(role) {
        const roles = {
            'super_admin': 'Супер Администратор',
            'school_admin': 'Администратор Школы',
            'teacher': 'Учитель',
            'student': 'Ученик'
        };
        return roles[role] || role;
    }

    function getGenderDisplayName(gender) {
        const genders = {
            'male': 'Мужской',
            'female': 'Женский',
            'other': 'Другой'
        };
        return genders[gender] || gender;
    }

    function formatDate(dateString) {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleDateString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function showError(message) {
        showAlert(message);
    }
})();
