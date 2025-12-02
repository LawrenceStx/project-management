const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// --- NEW SETUP ROUTES ---
router.get('/setup-status', authController.checkSetupStatus);
router.post('/setup', authController.initialSetup);
// ------------------------

router.post('/login', authController.loginUser);

router.post('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).json({ error: 'Could not log out.' });
        }
        res.status(200).json({ message: 'Logged out successfully.' });
    });
});

// Endpoint to check current session status (useful for frontend load)
router.get('/status', (req, res) => {
    if (req.session.user) {
        res.json({ authenticated: true, user: req.session.user });
    } else {
        res.json({ authenticated: false });
    }
});

module.exports = router;