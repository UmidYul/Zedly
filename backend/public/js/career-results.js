// CareerResultsManager: Handles SuperAdmin read-only career analytics UI
const CareerResultsManager = {
    init() {
        CareerResultsManager.loadAnalytics();
    },

    async loadAnalytics() {
        const analytics = document.getElementById('careerResultsAnalytics');
        if (!analytics) return;
        analytics.innerHTML = '<div class="spinner"></div>';
        try {
            const res = await fetch('/api/superadmin/career/analytics', {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }
            });
            if (!res.ok) throw new Error('Failed to load analytics');
            const data = await res.json();
            analytics.innerHTML = CareerResultsManager.renderAnalytics(data);
        } catch (e) {
            analytics.innerHTML = `<p style="color: var(--danger);">Ошибка загрузки аналитики</p>`;
        }
    },

    renderAnalytics(data) {
        // Placeholder: implement analytics rendering (school → class → student)
        return `<div>Результаты профориентации (реализовать графики и таблицы для SuperAdmin)</div>`;
    }
};

window.CareerResultsManager = CareerResultsManager;
