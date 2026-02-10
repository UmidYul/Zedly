// Login Page JavaScript
(function () {
    'use strict';

    const loginForm = document.getElementById('loginForm');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const passwordToggle = document.getElementById('passwordToggle');
    const rememberCheckbox = document.getElementById('remember');
    const errorMessage = document.getElementById('errorMessage');
    const loginBtn = document.getElementById('loginBtn');

    // Password toggle
    if (passwordToggle) {
        passwordToggle.addEventListener('click', function () {
            const type = passwordInput.type === 'password' ? 'text' : 'password';
            passwordInput.type = type;
            this.classList.toggle('active');
        });
    }

    // Form submission
    if (loginForm) {
        loginForm.addEventListener('submit', async function (e) {
            e.preventDefault();

            // Clear previous error
            hideError();

            // Get form data
            const username = usernameInput.value.trim();
            const password = passwordInput.value;
            const remember = rememberCheckbox.checked;

            // Basic validation
            if (!username || !password) {
                showError(getTranslation('login.error.empty'));
                return;
            }

            if (username.length < 3) {
                showError(getTranslation('login.error.usernameShort'));
                return;
            }

            if (password.length < 6) {
                showError(getTranslation('login.error.passwordShort'));
                return;
            }

            // Show loading state
            setLoading(true);

            try {
                // Send login request
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ username, password, remember })
                });

                const data = await response.json();

                if (response.ok) {
                    // Store tokens
                    localStorage.setItem('access_token', data.access_token);
                    if (data.refresh_token) {
                        localStorage.setItem('refresh_token', data.refresh_token);
                    }

                    // Store user info
                    localStorage.setItem('user', JSON.stringify(data.user));

                    // Redirect based on role
                    redirectToDashboard(data.user.role);
                } else {
                    // Show error from server
                    showError(data.message || getTranslation('login.error.failed'));
                }
            } catch (error) {
                console.error('Login error:', error);
                showError(getTranslation('login.error.network'));
            } finally {
                setLoading(false);
            }
        });
    }

    // Show error message
    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.classList.remove('hidden');

        // Auto-hide after 5 seconds
        setTimeout(hideError, 5000);
    }

    // Hide error message
    function hideError() {
        errorMessage.classList.add('hidden');
    }

    // Set loading state
    function setLoading(loading) {
        if (loading) {
            loginBtn.classList.add('loading');
            loginBtn.disabled = true;
            loginBtn.querySelector('.spinner').classList.remove('hidden');
        } else {
            loginBtn.classList.remove('loading');
            loginBtn.disabled = false;
            loginBtn.querySelector('.spinner').classList.add('hidden');
        }
    }

    // Redirect to appropriate dashboard based on role
    function redirectToDashboard(role) {
        const dashboards = {
            'superadmin': '/dashboard/superadmin',
            'school_admin': '/dashboard/school-admin',
            'teacher': '/dashboard/teacher',
            'student': '/dashboard/student'
        };

        const dashboard = dashboards[role] || '/dashboard';
        window.location.href = dashboard;
    }

    // Get translation from i18n
    function getTranslation(key) {
        const lang = localStorage.getItem('zedly-lang') || 'ru';
        const translations = window.translations || {};

        if (translations[lang] && translations[lang][key]) {
            return translations[lang][key];
        }

        // Fallback translations
        const fallback = {
            'login.error.empty': {
                ru: 'Пожалуйста, заполните все поля',
                uz: 'Iltimos, barcha maydonlarni to\'ldiring'
            },
            'login.error.usernameShort': {
                ru: 'Логин должен содержать минимум 3 символа',
                uz: 'Login kamida 3 ta belgidan iborat bo\'lishi kerak'
            },
            'login.error.passwordShort': {
                ru: 'Пароль должен содержать минимум 6 символов',
                uz: 'Parol kamida 6 ta belgidan iborat bo\'lishi kerak'
            },
            'login.error.failed': {
                ru: 'Неверный логин или пароль',
                uz: 'Login yoki parol noto\'g\'ri'
            },
            'login.error.network': {
                ru: 'Ошибка сети. Попробуйте позже',
                uz: 'Tarmoq xatosi. Keyinroq urinib ko\'ring'
            }
        };

        return fallback[key] ? fallback[key][lang] : 'Error';
    }

    // Auto-fill from localStorage if "Remember me" was checked
    function checkRememberedUser() {
        const rememberedUsername = localStorage.getItem('remembered_username');
        if (rememberedUsername) {
            usernameInput.value = rememberedUsername;
            rememberCheckbox.checked = true;
        }
    }

    // Initialize
    checkRememberedUser();

    console.log('Login page initialized ✓');
})();
