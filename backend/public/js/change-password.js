// Change Password functionality
(function () {
    'use strict';

    const form = document.getElementById('changePasswordForm');
    const oldPasswordInput = document.getElementById('old_password');
    const newPasswordInput = document.getElementById('new_password');
    const confirmPasswordInput = document.getElementById('confirm_password');
    const errorMessage = document.getElementById('error-message');
    const submitBtn = document.getElementById('changePasswordBtn');

    // Check if user has temp_token
    const tempToken = localStorage.getItem('temp_token');
    if (!tempToken) {
        // If no temp token, redirect to login
        window.location.href = '/login.html';
        return;
    }

    // Password validation requirements
    const requirements = {
        length: { element: document.getElementById('req-length'), test: (pwd) => pwd.length >= 8 },
        uppercase: { element: document.getElementById('req-uppercase'), test: (pwd) => /[A-Z]/.test(pwd) },
        lowercase: { element: document.getElementById('req-lowercase'), test: (pwd) => /[a-z]/.test(pwd) },
        number: { element: document.getElementById('req-number'), test: (pwd) => /[0-9]/.test(pwd) },
        match: {
            element: document.getElementById('req-match'), test: () => {
                const newPwd = newPasswordInput.value;
                const confirmPwd = confirmPasswordInput.value;
                return newPwd && confirmPwd && newPwd === confirmPwd;
            }
        }
    };

    // Check icon SVG
    const checkIcon = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
    `;

    // Circle icon SVG
    const circleIcon = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
        </svg>
    `;

    // Update requirement status
    function updateRequirement(key) {
        const req = requirements[key];
        const met = req.test(newPasswordInput.value);

        if (met) {
            req.element.classList.add('met');
            req.element.querySelector('svg').outerHTML = checkIcon;
        } else {
            req.element.classList.remove('met');
            req.element.querySelector('svg').outerHTML = circleIcon;
        }
    }

    // Validate all requirements
    function validatePassword() {
        Object.keys(requirements).forEach(key => updateRequirement(key));
        // Check if all requirements are met (match uses both fields)
        const allMet =
            requirements.length.test(newPasswordInput.value) &&
            requirements.uppercase.test(newPasswordInput.value) &&
            requirements.lowercase.test(newPasswordInput.value) &&
            requirements.number.test(newPasswordInput.value) &&
            requirements.match.test();
        submitBtn.disabled = !allMet;
        return allMet;
    }

    // Listen to password input changes
    newPasswordInput.addEventListener('input', validatePassword);
    confirmPasswordInput.addEventListener('input', validatePassword);

    // Form submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Hide previous errors
        errorMessage.style.display = 'none';

        // Validate
        if (!validatePassword()) {
            showError('Пожалуйста, убедитесь, что все требования выполнены');
            return;
        }

        const oldPassword = oldPasswordInput.value;
        const newPassword = newPasswordInput.value;
        const confirmPassword = confirmPasswordInput.value;

        if (newPassword !== confirmPassword) {
            showError('Пароли не совпадают');
            return;
        }

        // Disable submit button
        submitBtn.disabled = true;
        submitBtn.textContent = 'Изменение...';

        try {
            const response = await fetch('/api/auth/change-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${tempToken}`
                },
                body: JSON.stringify({
                    old_password: oldPassword,
                    new_password: newPassword
                })
            });

            const data = await response.json();

            if (response.ok) {
                // Store new tokens
                localStorage.setItem('token', data.access_token);
                localStorage.setItem('refresh_token', data.refresh_token);

                // Remove temp token
                localStorage.removeItem('temp_token');

                // Show success message
                showSuccess('Пароль успешно изменен! Перенаправление...');

                // Redirect to dashboard after 1 second
                setTimeout(() => {
                    window.location.href = '/dashboard.html';
                }, 1000);
            } else {
                // Show error
                const errorMsg = data.message || 'Не удалось изменить пароль';
                showError(errorMsg);

                submitBtn.disabled = false;
                submitBtn.textContent = 'Изменить пароль';
            }
        } catch (error) {
            console.error('Change password error:', error);
            showError('Произошла ошибка. Пожалуйста, попробуйте снова.');

            submitBtn.disabled = false;
            submitBtn.textContent = 'Изменить пароль';
        }
    });

    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
        errorMessage.style.color = 'var(--error)';
    }

    function showSuccess(message) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
        errorMessage.style.color = 'var(--success)';
    }

    // Initial validation state
    submitBtn.disabled = true;
})();
