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

    checkExistingSession();

    async function checkExistingSession() {
        const token = localStorage.getItem('access_token');
        if (!token) return;

        try {
            const response = await fetch('/api/auth/me', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                window.location.href = '/dashboard';
            }
        } catch (error) {
            console.warn('Session check failed on login page:', error);
        }
    }

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
                console.log('📡 Sending login request...');
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ username, password, remember })
                });

                const data = await response.json();
                console.log('Login response status:', response.status);
                console.log('Login response data:', data);

                if (response.ok) {
                    // Check if user must change password
                    if (data.must_change_password) {
                        console.log('⚠️ User must change password');
                        
                        // Store temporary token
                        localStorage.setItem('temp_token', data.temp_token);
                        
                        // Store basic user info
                        localStorage.setItem('user', JSON.stringify(data.user));
                        
                        // Redirect to change password page
                        window.location.href = '/change-password.html';
                        return;
                    }

                    console.log('✅ Login successful');
                    console.log('Access token:', data.access_token ? 'received' : 'missing');
                    console.log('Refresh token:', data.refresh_token ? 'received' : 'missing');
                    console.log('User data:', data.user);
                    
                    // Store tokens
                    localStorage.setItem('access_token', data.access_token);
                    console.log('✓ Access token stored');
                    
                    if (data.refresh_token) {
                        localStorage.setItem('refresh_token', data.refresh_token);
                        console.log('✓ Refresh token stored');
                    }

                    // Store user info
                    localStorage.setItem('user', JSON.stringify(data.user));
                    console.log('✓ User info stored');
                    
                    // Verify storage
                    console.log('Verifying localStorage:');
                    console.log('- access_token:', localStorage.getItem('access_token') ? 'EXISTS' : 'MISSING');
                    console.log('- refresh_token:', localStorage.getItem('refresh_token') ? 'EXISTS' : 'MISSING');
                    console.log('- user:', localStorage.getItem('user') ? 'EXISTS' : 'MISSING');

                    // Redirect based on role
                    console.log('🔄 Redirecting to dashboard...');
                    redirectToDashboard(data.user.role);
                } else {
                    // Show error from server
                    console.error('❌ Login failed:', data);
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
        // All roles use the same /dashboard page
        // The dashboard.js will dynamically load content based on user role
        console.log('🔄 Redirecting to dashboard for role:', role);
        
        // Add small delay to ensure localStorage is written
        setTimeout(() => {
            window.location.href = '/dashboard';
        }, 100);
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
