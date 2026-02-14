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

    function resolveIcon(action, entityType) {
        const key = `${action || ''}:${entityType || ''}`.toLowerCase();
        if (key.includes('password') || key.includes('reset')) return '??';
        if (key.includes('login')) return '??';
        if (key.includes('test')) return '??';
        if (key.includes('assignment')) return '??';
        if (key.includes('user') || key.includes('profile')) return '??';
        return '??';
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
            notifications = activity.map(mapActivityToNotification);
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

        if (!dropdown) {
            dropdown = document.createElement('div');
            dropdown.id = 'notificationsDropdown';
            dropdown.className = 'notifications-dropdown';
            dropdown.style.display = 'none';

            const notificationsBtn = document.getElementById('notificationsBtn');
            if (notificationsBtn && notificationsBtn.parentElement) {
                notificationsBtn.parentElement.appendChild(dropdown);
            }
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
        const dropdown = document.getElementById('notificationsDropdown');

        if (notificationsBtn && dropdown) {
            notificationsBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await loadNotifications();
                toggleDropdown();
            });

            document.addEventListener('click', (e) => {
                if (dropdown.style.display === 'block' && !dropdown.contains(e.target)) {
                    closeDropdown();
                }
            });
        }

        listenersAttached = true;
    }

    function toggleDropdown() {
        const dropdown = document.getElementById('notificationsDropdown');
        if (dropdown) {
            const isVisible = dropdown.style.display === 'block';
            dropdown.style.display = isVisible ? 'none' : 'block';
        }
    }

    function closeDropdown() {
        const dropdown = document.getElementById('notificationsDropdown');
        if (dropdown) {
            dropdown.style.display = 'none';
        }
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
            icon: notification.icon || '??'
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
