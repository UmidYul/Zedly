// Authentication Interceptor - Auto token refresh
(function () {
    'use strict';

    // Store original fetch
    const originalFetch = window.fetch;

    // Flag to prevent multiple refresh attempts
    let isRefreshing = false;
    let refreshPromise = null;

    /**
     * Refresh access token using refresh token
     */
    async function refreshAccessToken() {
        const refreshToken = localStorage.getItem('refresh_token');

        if (!refreshToken) {
            throw new Error('No refresh token available');
        }

        const response = await originalFetch('/api/auth/refresh', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ refresh_token: refreshToken })
        });

        if (!response.ok) {
            // Refresh failed, clear tokens and redirect to login
            localStorage.removeItem('access_token');
            localStorage.removeItem('refresh_token');
            localStorage.removeItem('user');
            throw new Error('Token refresh failed');
        }

        const data = await response.json();

        // Store new access token
        localStorage.setItem('access_token', data.access_token);

        return data.access_token;
    }

    /**
     * Override fetch to add automatic token refresh
     */
    window.fetch = async function (...args) {
        let [url, options = {}] = args;

        // Skip interceptor for login, refresh, and static resources
        if (
            url.includes('/api/auth/login') ||
            url.includes('/api/auth/refresh') ||
            !url.includes('/api/')
        ) {
            return originalFetch.apply(this, args);
        }

        try {
            // Add access token to request if available
            const accessToken = localStorage.getItem('access_token');
            if (accessToken) {
                options.headers = {
                    ...options.headers,
                    'Authorization': `Bearer ${accessToken}`
                };
            }

            // Make the request
            let response = await originalFetch(url, options);

            // If 401, try to refresh token and retry
            if (response.status === 401 && !url.includes('/api/auth/')) {
                try {
                    // If already refreshing, wait for that to complete
                    if (isRefreshing) {
                        await refreshPromise;
                    } else {
                        // Start refresh process
                        isRefreshing = true;
                        refreshPromise = refreshAccessToken();
                        await refreshPromise;
                        isRefreshing = false;
                        refreshPromise = null;
                    }

                    // Get new access token
                    const newAccessToken = localStorage.getItem('access_token');

                    // Retry original request with new token
                    options.headers = {
                        ...options.headers,
                        'Authorization': `Bearer ${newAccessToken}`
                    };

                    response = await originalFetch(url, options);

                } catch (error) {
                    console.error('Token refresh failed:', error);

                    // Redirect to login page
                    window.location.href = '/login.html';

                    // Return error response
                    return response;
                }
            }

            return response;

        } catch (error) {
            // Network error or other fetch error - just rethrow
            console.error('Fetch error:', error);
            throw error;
        }
    };

    console.log('Auth interceptor initialized ✓');
})();
