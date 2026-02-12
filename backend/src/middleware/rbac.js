// RBAC middleware for Express
// Usage: app.use(rbac(['admin', 'teacher']))

module.exports = function rbac(allowedRoles = []) {
    return function (req, res, next) {
        // Example: req.user.role should be set by auth middleware
        const userRole = req.user && req.user.role;
        if (!userRole) {
            return res.status(401).json({ error: 'User role not found' });
        }
        if (!allowedRoles.includes(userRole)) {
            return res.status(403).json({ error: 'Access denied' });
        }
        next();
    };
};
