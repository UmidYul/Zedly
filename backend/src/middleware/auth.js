const { verifyAccessToken } = require('../utils/jwt');

/**
 * Authentication middleware
 * Verifies JWT token and attaches user info to request
 */
function authenticate(req, res, next) {
    try {
        // Get token from Authorization header
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return res.status(401).json({
                error: 'No token provided',
                message: 'Authentication required'
            });
        }

        // Check if header starts with 'Bearer '
        if (!authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                error: 'Invalid token format',
                message: 'Token must be in format: Bearer <token>'
            });
        }

        // Extract token
        const token = authHeader.substring(7);

        // Verify token
        const decoded = verifyAccessToken(token);

        const isTempToken = decoded && decoded.temp === true;
        if (isTempToken) {
            const isAllowedTempRoute = req.baseUrl === '/api/auth'
                && (req.path === '/change-password' || req.path === '/logout');

            if (!isAllowedTempRoute) {
                return res.status(403).json({
                    error: 'password_change_required',
                    message: 'You must change your password before accessing this resource'
                });
            }
        }

        // Attach user info to request
        req.user = {
            id: decoded.id,
            username: decoded.username,
            role: decoded.role,
            school_id: decoded.school_id,
            temp: isTempToken,
            token_version: decoded.token_version
        };

        next();
    } catch (error) {
        if (error.message === 'Access token expired') {
            return res.status(401).json({
                error: 'token_expired',
                message: 'Access token has expired. Please refresh your token.'
            });
        }

        return res.status(401).json({
            error: 'invalid_token',
            message: error.message || 'Invalid token'
        });
    }
}

/**
 * Role-based authorization middleware
 * @param {string[]} allowedRoles - Array of allowed roles
 */
function authorize(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Authentication required'
            });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                error: 'Forbidden',
                message: 'You do not have permission to access this resource'
            });
        }

        next();
    };
}

/**
 * School isolation middleware
 * Ensures users can only access data from their own school
 * SuperAdmin can access all schools
 */
function enforceSchoolIsolation(req, res, next) {
    if (req.user.role === 'superadmin') {
        // SuperAdmin can access all schools
        return next();
    }

    // For other roles, ensure they can only access their school's data
    if (req.params.school_id && req.params.school_id !== req.user.school_id.toString()) {
        return res.status(403).json({
            error: 'Forbidden',
            message: 'You can only access data from your own school'
        });
    }

    next();
}

module.exports = {
    authenticate,
    authorize,
    enforceSchoolIsolation
};
