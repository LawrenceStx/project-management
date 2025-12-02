// src/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Check if authController loaded correctly
if (!authController.checkSetupStatus || !authController.initialSetup) {
    console.error("❌ CRITICAL ERROR: Auth Controller functions are undefined. Check src/controllers/authController.js exports.");
}

// --- NEW SETUP ROUTES ---
router.get('/setup-status', authController.checkSetupStatus);
router.post('/setup', authController.initialSetup);

// --- AUTH ROUTES ---
router.post('/register', authController.registerUser);
router.post('/login', authController.loginUser);

router.post('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).json({ error: 'Could not log out.' });
        }
        res.status(200).json({ message: 'Logged out successfully.' });
    });
});

// Endpoint to check current session status
router.get('/status', (req, res) => {
    if (req.session.user) {
        res.json({ authenticated: true, user: req.session.user });
    } else {
        res.json({ authenticated: false });
    }
});

module.exports = router;