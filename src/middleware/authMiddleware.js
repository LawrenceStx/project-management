// src/middleware/authMiddleware.js

/**
 * Middleware to check if the user is logged in (authenticated).
 */
exports.isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        // Attach user info to the request for easy access in controllers
        req.user = req.session.user; 
        next();
    } else {
        // Return 401 Unauthorized for API requests
        res.status(401).json({ error: 'Authentication required.' });
    }
};

/**
 * Middleware to check if the user is an Admin (role_id = 1).
 * Requires isAuthenticated to run first.
 */
exports.isAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role_id === 1) {
        next();
    } else {
        // Return 403 Forbidden
        res.status(403).json({ error: 'Admin access required.' });
    }
};

/**
 * Middleware to check if a project is selected (required for most Member pages).
 */
exports.isProjectSelected = (req, res, next) => {
    if (req.session.project_id) {
        req.projectId = req.session.project_id;
        next();
    } else {
        res.status(400).json({ error: 'Please select a project first.' });
    }
};