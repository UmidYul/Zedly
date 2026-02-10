// Theme Toggle Functionality
(function () {
    'use strict';

    const THEME_KEY = 'zedly-theme';
    const THEME_TOGGLE_BTN = 'themeToggle';

    // Get current theme from localStorage or default to 'dark'
    function getCurrentTheme() {
        return localStorage.getItem(THEME_KEY) || 'dark';
    }

    // Set theme
    function setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem(THEME_KEY, theme);
        updateThemeIcon(theme);
    }

    // Update theme icon
    function updateThemeIcon(theme) {
        const themeToggleBtn = document.getElementById(THEME_TOGGLE_BTN);
        if (!themeToggleBtn) return;

        const sunIcon = themeToggleBtn.querySelector('.sun');
        const moonIcon = themeToggleBtn.querySelector('.moon');

        if (sunIcon && moonIcon) {
            if (theme === 'dark') {
                sunIcon.style.display = 'block';
                moonIcon.style.display = 'none';
            } else {
                sunIcon.style.display = 'none';
                moonIcon.style.display = 'block';
            }
        }
    }

    // Toggle theme
    function toggleTheme() {
        const currentTheme = getCurrentTheme();
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        setTheme(newTheme);
        console.log('🎨 Theme switched to:', newTheme);
    }

    // Initialize theme on page load
    function initTheme() {
        const theme = getCurrentTheme();
        setTheme(theme);
        console.log('🎨 Theme initialized:', theme);

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

    // Export for use in other scripts
    window.ZedlyTheme = {
        setTheme,
        getCurrentTheme,
        toggleTheme
    };
})();
