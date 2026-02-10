// Theme Toggle Functionality
(function () {
    'use strict';

    const THEME_KEY = 'zedly-theme';
    const THEME_TOGGLE_BTN = 'themeToggle';

    // Get current theme from localStorage or default to 'light'
    function getCurrentTheme() {
        return localStorage.getItem(THEME_KEY) || 'light';
    }

    // Set theme
    function setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem(THEME_KEY, theme);
    }

    // Toggle theme
    function toggleTheme() {
        const currentTheme = getCurrentTheme();
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        setTheme(newTheme);
    }

    // Initialize theme on page load
    function initTheme() {
        const theme = getCurrentTheme();
        setTheme(theme);

        // Add event listener to theme toggle button
        const themeToggleBtn = document.getElementById(THEME_TOGGLE_BTN);
        if (themeToggleBtn) {
            themeToggleBtn.addEventListener('click', toggleTheme);
        }
    }

    // Run on DOM load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTheme);
    } else {
        initTheme();
    }
})();
