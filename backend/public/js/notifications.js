// Notifications System
(function () {
    'use strict';

    let notifications = [];
    let unreadCount = 0;

    // Sample notifications data (later will come from API)
    const mockNotifications = [
        {
            id: 1,
            type: 'test',
            title: 'Новый тест по математике',
            message: 'Учитель Иванов И.И. создал новый тест для 10А класса',
            timestamp: Date.now() - 1000 * 60 * 15, // 15 minutes ago
            read: false,
            icon: '📝'
        },
        {
            id: 2,
            type: 'password_reset',
            title: 'Пароль был сброшен',
            message: 'Ваш пароль был сброшен администратором. Используйте временный пароль для входа.',
            timestamp: Date.now() - 1000 * 60 * 60 * 2, // 2 hours ago
            read: false,
            icon: '🔑'
        },
        {
            id: 3,
            type: 'achievement',
            title: 'Отличный результат!',
            message: 'Вы набрали 95% на тесте по физике',
            timestamp: Date.now() - 1000 * 60 * 60 * 24, // 1 day ago
            read: true,
            icon: '🎉'
        },
        {
            id: 4,
            type: 'info',
            title: 'Обновление системы',
            message: 'Система будет недоступна завтра с 02:00 до 04:00',
            timestamp: Date.now() - 1000 * 60 * 60 * 48, // 2 days ago
            read: true,
            icon: 'ℹ️'
        }
    ];

    function initNotifications() {
        notifications = mockNotifications;
        updateUnreadCount();
        renderNotifications();
        attachEventListeners();
    }

    function updateUnreadCount() {
        unreadCount = notifications.filter(n => !n.read).length;
        const badge = document.getElementById('notificationBadge');
        if (badge) {
            badge.textContent = unreadCount;
            badge.style.display = unreadCount > 0 ? 'flex' : 'none';
        }
    }

    function renderNotifications() {
        let dropdown = document.getElementById('notificationsDropdown');

        // Create dropdown if it doesn't exist
        if (!dropdown) {
            dropdown = document.createElement('div');
            dropdown.id = 'notificationsDropdown';
            dropdown.className = 'notifications-dropdown';
            dropdown.style.display = 'none';

            const notificationsBtn = document.getElementById('notificationsBtn');
            if (notificationsBtn) {
                notificationsBtn.parentElement.appendChild(dropdown);
            }
        }

        const translate = window.ZedlyI18n?.translate || (key => key);

        dropdown.innerHTML = `
            <div class="notifications-header">
                <h3>${translate('notifications.title')}</h3>
                ${unreadCount > 0 ? `<button class="mark-all-read" onclick="window.ZedlyNotifications.markAllAsRead()">${translate('notifications.markAllRead')}</button>` : ''}
            </div>
            <div class="notifications-list">
                ${notifications.length > 0
                ? notifications.map(notification => `
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

        const translate = window.ZedlyI18n?.translate || (key => key);

        if (minutes < 1) return translate('time.justNow');
        if (minutes < 60) return `${minutes} ${translate('time.minutesAgo')}`;
        if (hours < 24) return `${hours} ${translate('time.hoursAgo')}`;
        if (days < 7) return `${days} ${translate('time.daysAgo')}`;

        return new Date(timestamp).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    }

    function attachEventListeners() {
        const notificationsBtn = document.getElementById('notificationsBtn');
        const dropdown = document.getElementById('notificationsDropdown');

        if (notificationsBtn && dropdown) {
            notificationsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleDropdown();
            });

            // Close dropdown when clicking outside
            document.addEventListener('click', (e) => {
                if (dropdown.style.display === 'block' && !dropdown.contains(e.target)) {
                    closeDropdown();
                }
            });
        }
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
        const notification = notifications.find(n => n.id === notificationId);
        if (notification) {
            notification.read = true;
            updateUnreadCount();
            renderNotifications();
        }
    }

    function markAllAsRead() {
        notifications.forEach(n => n.read = true);
        updateUnreadCount();
        renderNotifications();
    }

    function viewAll() {
        closeDropdown();
        // Navigate to full notifications page (to be implemented)
        console.log('Navigate to all notifications');
    }

    function addNotification(notification) {
        notifications.unshift({
            ...notification,
            id: Date.now(),
            timestamp: Date.now(),
            read: false
        });
        updateUnreadCount();
        renderNotifications();
    }

    // Expose public API
    window.ZedlyNotifications = {
        init: initNotifications,
        markAsRead: markAsRead,
        markAllAsRead: markAllAsRead,
        viewAll: viewAll,
        add: addNotification,
        close: closeDropdown
    };

    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initNotifications);
    } else {
        initNotifications();
    }

})();
