// Notifications System
(function () {
    'use strict';

    let notifications = [];
    let unreadCount = 0;
    const READ_STATE_KEY = 'zedly_notifications_read_v1';
    let readIds = new Set();
    let listenersAttached = false;
    let lastLoadedAt = 0;
    const REFRESH_INTERVAL_MS = 30 * 1000;
    const MOBILE_MEDIA_QUERY = '(max-width: 968px)';

    function getReadState() {
        try {
            const raw = localStorage.getItem(READ_STATE_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(parsed)) return new Set();
            return new Set(parsed.map((id) => String(id)));
        } catch (error) {
            console.warn('Failed to parse notification read state:', error);
            return new Set();
        }
    }

    function saveReadState() {
        try {
            localStorage.setItem(READ_STATE_KEY, JSON.stringify(Array.from(readIds)));
        } catch (error) {
            console.warn('Failed to save notification read state:', error);
        }
    }

    function parseDetails(rawDetails) {
        if (!rawDetails) return {};
        if (typeof rawDetails === 'object') return rawDetails;
        if (typeof rawDetails === 'string') {
            try {
                return JSON.parse(rawDetails);
            } catch (error) {
                return {};
            }
        }
        return {};
    }

    const ICONS = {
        password: `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M12 15v4"></path>
                <path d="M8 11V8a4 4 0 0 1 8 0v3"></path>
                <rect x="5" y="11" width="14" height="10" rx="2"></rect>
            </svg>
        `,
        login: `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M10 17l5-5-5-5"></path>
                <path d="M15 12H3"></path>
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
            </svg>
        `,
        logout: `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M14 17l5-5-5-5"></path>
                <path d="M19 12H7"></path>
                <path d="M11 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6"></path>
            </svg>
        `,
        test: `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M9 3h6"></path>
                <path d="M10 8h4"></path>
                <path d="M6 3h12v18H6z"></path>
            </svg>
        `,
        assignment: `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M8 7h8"></path>
                <path d="M8 12h8"></path>
                <path d="M8 17h5"></path>
                <rect x="4" y="3" width="16" height="18" rx="2"></rect>
            </svg>
        `,
        user: `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <circle cx="12" cy="8" r="4"></circle>
                <path d="M4 20a8 8 0 0 1 16 0"></path>
            </svg>
        `,
        default: `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M12 8v4"></path>
                <path d="M12 16h.01"></path>
            </svg>
        `,
        deadline: `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <circle cx="12" cy="13" r="8"></circle>
                <path d="M12 9v4l2.5 2.5"></path>
                <path d="M9 2h6"></path>
            </svg>
        `
    };

    function resolveIcon(action, entityType) {
        const key = `${action || ''}:${entityType || ''}`.toLowerCase();
        if (key.includes('password') || key.includes('reset')) return ICONS.password;
        if (key.includes('login')) return ICONS.login;
        if (key.includes('logout')) return ICONS.logout;
        if (key.includes('test')) return ICONS.test;
        if (key.includes('assignment')) return ICONS.assignment;
        if (key.includes('user') || key.includes('profile')) return ICONS.user;
        return ICONS.default;
    }

    function buildMessage(item, details) {
        const parts = [];
        if (details.username) parts.push(`user: ${details.username}`);
        if (details.role) parts.push(`role: ${details.role}`);
        if (details.action_type) parts.push(`type: ${details.action_type}`);
        if (details.entityName) parts.push(`entity: ${details.entityName}`);
        if (details.id) parts.push(`id: ${details.id}`);
        if (parts.length > 0) return parts.join(' · ');

        const entity = item.entity_type ? String(item.entity_type) : 'system';
        return `Action on ${entity}`;
    }

    function mapActivityToNotification(item) {
        const details = parseDetails(item.details);
        const id = String(item.id);
        const action = String(item.action || '').replace(/_/g, ' ').trim() || 'activity';
        const title = action.charAt(0).toUpperCase() + action.slice(1);

        return {
            id,
            type: item.entity_type || 'system',
            title,
            message: buildMessage(item, details),
            timestamp: item.created_at ? new Date(item.created_at).getTime() : Date.now(),
            read: readIds.has(id),
            icon: resolveIcon(item.action, item.entity_type)
        };
    }
    function getCurrentUserRole() {
        try {
            const raw = localStorage.getItem('user');
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return parsed && parsed.role ? parsed.role : null;
        } catch (error) {
            return null;
        }
    }

    function mapDeadlineToNotification(item, role) {
        const endDateRaw = item && (item.end_date || item.deadline) ? (item.end_date || item.deadline) : null;
        const endDate = endDateRaw ? new Date(endDateRaw) : null;
        const now = new Date();
        const msLeft = endDate ? (endDate.getTime() - now.getTime()) : null;
        const hoursLeft = msLeft !== null ? Math.max(0, Math.floor(msLeft / (1000 * 60 * 60))) : null;

        const title = role === 'student' ? 'Assignment deadline' : 'Class deadline';
        const testTitle = (item && (item.test_title || item.title)) ? (item.test_title || item.title) : 'Test';
        const className = item && item.class_name ? ' | ' + item.class_name : '';
        const deadlineText = endDate ? ('Due: ' + endDate.toLocaleString()) : 'Due date is not set';
        const etaText = hoursLeft !== null ? (' | ' + hoursLeft + 'h left') : '';

        return {
            id: 'deadline:' + String(item && item.id ? item.id : testTitle) + ':' + String(endDateRaw || ''),
            type: 'deadline',
            title: title,
            message: testTitle + className + ' | ' + deadlineText + etaText,
            timestamp: endDate ? endDate.getTime() : Date.now(),
            read: false,
            icon: ICONS.deadline
        };
    }

    async function loadDeadlineNotifications(token) {
        const role = getCurrentUserRole();
        if (!role || !['student', 'teacher'].includes(role)) {
            return [];
        }

        const endpoint = role === 'student'
            ? '/api/student/assignments?status=active'
            : '/api/teacher/assignments?status=active&page=1&limit=20';

        const response = await fetch(endpoint, {
            headers: { Authorization: 'Bearer ' + token }
        });
        if (!response.ok) {
            throw new Error('Failed to fetch deadline notifications: ' + response.status);
        }

        const data = await response.json();
        const rawItems = Array.isArray(data.assignments) ? data.assignments : [];

        const now = Date.now();
        const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

        return rawItems
            .filter((item) => !!(item && item.end_date))
            .filter((item) => {
                const ts = new Date(item.end_date).getTime();
                if (!Number.isFinite(ts)) return false;
                const diff = ts - now;
                return diff <= sevenDaysMs;
            })
            .sort((a, b) => new Date(a.end_date).getTime() - new Date(b.end_date).getTime())
            .slice(0, 10)
            .map((item) => mapDeadlineToNotification(item, role));
    }

    async function loadNotifications(force = false) {
        const now = Date.now();
        if (!force && now - lastLoadedAt < REFRESH_INTERVAL_MS) {
            return;
        }

        const token = localStorage.getItem('access_token');
        if (!token) {
            notifications = [];
            updateUnreadCount();
            renderNotifications();
            return;
        }

        try {
            const response = await fetch('/api/auth/profile/activity?limit=20', {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch notifications: ${response.status}`);
            }

            const data = await response.json();
            const activity = Array.isArray(data.activity) ? data.activity : [];
            const activityNotifications = activity.map(mapActivityToNotification);
            let deadlineNotifications = [];
            try {
                deadlineNotifications = await loadDeadlineNotifications(token);
            } catch (deadlineError) {
                console.warn('Deadline notifications load error:', deadlineError);
            }

            const merged = [...deadlineNotifications, ...activityNotifications];
            notifications = merged.map((item) => ({
                ...item,
                read: readIds.has(String(item.id))
            }));
            lastLoadedAt = now;
        } catch (error) {
            console.error('Notifications load error:', error);
            notifications = [];
        }

        updateUnreadCount();
        renderNotifications();
    }

    async function initNotifications() {
        readIds = getReadState();
        await loadNotifications(true);
        attachEventListeners();
    }

    function updateUnreadCount() {
        unreadCount = notifications.filter((n) => !n.read).length;
        const badge = document.getElementById('notificationBadge');
        if (badge) {
            badge.textContent = String(unreadCount);
            badge.style.display = unreadCount > 0 ? 'flex' : 'none';
        }
    }

    function renderNotifications() {
        let dropdown = document.getElementById('notificationsDropdown');
        let backdrop = document.getElementById('notificationsBackdrop');

        if (!dropdown) {
            dropdown = document.createElement('div');
            dropdown.id = 'notificationsDropdown';
            dropdown.className = 'notifications-dropdown';
            dropdown.style.display = 'none';
        }
        if (dropdown.parentElement !== document.body) {
            document.body.appendChild(dropdown);
        }
        if (!backdrop) {
            backdrop = document.createElement('div');
            backdrop.id = 'notificationsBackdrop';
            backdrop.className = 'notifications-backdrop';
            backdrop.style.display = 'none';
            backdrop.addEventListener('click', closeDropdown);
            document.body.appendChild(backdrop);
        }

        const translate = window.ZedlyI18n?.translate || ((key) => key);

        dropdown.innerHTML = `
            <div class="notifications-header">
                <h3>${translate('notifications.title')}</h3>
                ${unreadCount > 0 ? `<button class="mark-all-read" onclick="window.ZedlyNotifications.markAllAsRead()">${translate('notifications.markAllRead')}</button>` : ''}
            </div>
            <div class="notifications-list">
                ${notifications.length > 0
                    ? notifications.map((notification) => `
                        <div class="notification-item ${notification.read ? 'read' : 'unread'}" data-id="${notification.id}">
                            <div class="notification-icon">${notification.icon}</div>
                            <div class="notification-content">
                                <div class="notification-title">${notification.title}</div>
                                <div class="notification-message">${notification.message}</div>
                                <div class="notification-time">${formatTime(notification.timestamp)}</div>
                            </div>
                            ${!notification.read ? `<button class="mark-read-btn" onclick="window.ZedlyNotifications.markAsRead('${notification.id}')" title="${translate('notifications.markRead')}">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="20 6 9 17 4 12"></polyline>
                                </svg>
                            </button>` : ''}
                        </div>
                    `).join('')
                    : `<div class="notifications-empty">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                            <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                        </svg>
                        <p>${translate('notifications.empty')}</p>
                    </div>`
                }
            </div>
            ${notifications.length > 0 ? `
                <div class="notifications-footer">
                    <button onclick="window.ZedlyNotifications.viewAll()">${translate('notifications.viewAll')}</button>
                </div>
            ` : ''}
        `;

        positionDropdown();
    }

    function isDropdownOpen() {
        const dropdown = document.getElementById('notificationsDropdown');
        return !!dropdown && dropdown.style.display === 'block';
    }

    function positionDropdown() {
        const dropdown = document.getElementById('notificationsDropdown');
        const notificationsBtn = document.getElementById('notificationsBtn');
        if (!dropdown || !notificationsBtn) return;

        const isMobile = window.matchMedia(MOBILE_MEDIA_QUERY).matches;
        if (isMobile) {
            dropdown.style.left = '';
            dropdown.style.right = '';
            dropdown.style.top = '';
            dropdown.style.bottom = '';
            dropdown.style.width = '';
            dropdown.style.maxHeight = '';
            dropdown.style.position = '';
            return;
        }

        const rect = notificationsBtn.getBoundingClientRect();
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
        const desiredWidth = 380;
        const minGap = 8;
        const width = Math.min(desiredWidth, Math.max(260, viewportWidth - minGap * 2));
        const left = Math.max(minGap, Math.min(rect.right - width, viewportWidth - width - minGap));

        dropdown.style.position = 'fixed';
        dropdown.style.top = `${Math.round(rect.bottom + 10)}px`;
        dropdown.style.left = `${Math.round(left)}px`;
        dropdown.style.right = 'auto';
        dropdown.style.bottom = 'auto';
        dropdown.style.width = `${Math.round(width)}px`;
        dropdown.style.maxHeight = '500px';
    }

    function formatTime(timestamp) {
        const now = Date.now();
        const diff = now - timestamp;
        const minutes = Math.floor(diff / 1000 / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        const translate = window.ZedlyI18n?.translate || ((key) => key);

        if (minutes < 1) return translate('time.justNow');
        if (minutes < 60) return `${minutes} ${translate('time.minutesAgo')}`;
        if (hours < 24) return `${hours} ${translate('time.hoursAgo')}`;
        if (days < 7) return `${days} ${translate('time.daysAgo')}`;

        return new Date(timestamp).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    }

    function attachEventListeners() {
        if (listenersAttached) return;

        const notificationsBtn = document.getElementById('notificationsBtn');
        if (notificationsBtn) {
            notificationsBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await loadNotifications();
                toggleDropdown();
            });

            document.addEventListener('click', (e) => {
                const dropdown = document.getElementById('notificationsDropdown');
                if (!dropdown) return;
                if (dropdown.style.display === 'block' && !dropdown.contains(e.target)) {
                    closeDropdown();
                }
            });

            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    closeDropdown();
                }
            });

            window.addEventListener('resize', () => {
                if (isDropdownOpen()) {
                    positionDropdown();
                }
            });

            window.addEventListener('scroll', () => {
                if (isDropdownOpen()) {
                    positionDropdown();
                }
            }, { passive: true });
        }

        listenersAttached = true;
    }

    function toggleDropdown() {
        const dropdown = document.getElementById('notificationsDropdown');
        const backdrop = document.getElementById('notificationsBackdrop');
        if (dropdown) {
            const isVisible = dropdown.style.display === 'block';
            dropdown.style.display = isVisible ? 'none' : 'block';
            const isMobile = window.matchMedia(MOBILE_MEDIA_QUERY).matches;
            if (!isVisible) {
                positionDropdown();
            }
            if (backdrop) {
                backdrop.style.display = !isVisible && isMobile ? 'block' : 'none';
            }
            document.body.classList.toggle('notifications-open', !isVisible && isMobile);
        }
    }

    function closeDropdown() {
        const dropdown = document.getElementById('notificationsDropdown');
        const backdrop = document.getElementById('notificationsBackdrop');
        if (dropdown) {
            dropdown.style.display = 'none';
        }
        if (backdrop) {
            backdrop.style.display = 'none';
        }
        document.body.classList.remove('notifications-open');
    }

    function markAsRead(notificationId) {
        const targetId = String(notificationId);
        readIds.add(targetId);
        saveReadState();

        const notification = notifications.find((n) => String(n.id) === targetId);
        if (notification) {
            notification.read = true;
            updateUnreadCount();
            renderNotifications();
        }
    }

    function markAllAsRead() {
        notifications.forEach((n) => {
            n.read = true;
            readIds.add(String(n.id));
        });
        saveReadState();
        updateUnreadCount();
        renderNotifications();
    }

    function viewAll() {
        closeDropdown();
        window.location.hash = 'profile';
    }

    function addNotification(notification) {
        const id = String(Date.now());
        notifications.unshift({
            ...notification,
            id,
            timestamp: Date.now(),
            read: false,
            icon: notification.icon || ICONS.default
        });
        updateUnreadCount();
        renderNotifications();
    }

    window.ZedlyNotifications = {
        init: initNotifications,
        markAsRead,
        markAllAsRead,
        viewAll,
        add: addNotification,
        close: closeDropdown,
        refresh: () => loadNotifications(true)
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initNotifications);
    } else {
        initNotifications();
    }
})();
