// src/controllers/authController.js
const db = require('../db/database');
const bcrypt = require('bcryptjs');

const saltRounds = 10;

// --- 1. NEW: Check if System is Fresh (No Users) ---
exports.checkSetupStatus = (req, res) => {
    db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'DB Error' });
        }
        // If count > 0, system is initialized (true). If 0, it needs setup (false).
        res.json({ isInitialized: row.count > 0 });
    });
};

// --- 2. NEW: Initial Admin Setup ---
exports.initialSetup = async (req, res) => {
    // Security Check: ONLY allow this if 0 users exist
    db.get("SELECT COUNT(*) as count FROM users", async (err, row) => {
        if (err) return res.status(500).json({ error: 'DB Error' });
        
        if (row.count > 0) {
            return res.status(403).json({ error: 'System is already initialized. Cannot create admin.' });
        }

        const { username, email, password } = req.body;
        if (!username || !email || !password) return res.status(400).json({ error: 'All fields required.' });

        try {
            const hashedPassword = await bcrypt.hash(password, saltRounds);
            
            // Force Role ID 1 (Admin)
            const stmt = db.prepare("INSERT INTO users (username, email, password, role_id) VALUES (?, ?, ?, 1)");
            stmt.run(username, email, hashedPassword, function(err) {
                if (err) return res.status(500).json({ error: 'Failed to create admin.' });
                res.json({ message: 'System initialized successfully.' });
            });
            stmt.finalize();
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: 'Server error' });
        }
    });
};

// --- 3. EXISTING: Register (General) ---
exports.registerUser = async (req, res) => {
    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
        return res.status(400).json({ error: 'Missing required fields.' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Check if first user (Auto-Admin logic backup)
        db.get("SELECT COUNT(*) as count FROM users", async (err, row) => {
            if (err) return res.status(500).json({ error: 'Database check failed.' });
            
            const role_id = row.count === 0 ? 1 : 2; // 1=Admin, 2=Member

            const stmt = db.prepare("INSERT INTO users (username, email, password, role_id) VALUES (?, ?, ?, ?)");
            stmt.run(username, email, hashedPassword, role_id, function(err) {
                if (err) {
                    console.error('Registration error:', err.message);
                    return res.status(409).json({ error: 'Username or email already exists.' });
                }
                
                res.status(201).json({ 
                    message: 'User registered successfully.', 
                    userId: this.lastID,
                    role: role_id === 1 ? 'Admin' : 'Member'
                });
            });
            stmt.finalize();
        });

    } catch (error) {
        console.error('Hashing error:', error);
        res.status(500).json({ error: 'Internal server error during registration.' });
    }
};

// --- 4. EXISTING: Login ---
exports.loginUser = (req, res) => {
    const { email, password } = req.body;

    db.get("SELECT * FROM users WHERE email = ?", [email], async (err, user) => {
        if (err) return res.status(500).json({ error: 'Database error.' });
        if (!user) return res.status(401).json({ error: 'Invalid email or password.' });
        
        const match = await bcrypt.compare(password, user.password);

        if (match) {
            req.session.user = { 
                id: user.id, 
                username: user.username, 
                role_id: user.role_id 
            };
            const roleName = user.role_id === 1 ? 'Admin' : 'Member';

            res.status(200).json({ 
                message: 'Login successful', 
                user: { id: user.id, username: user.username, role: roleName } 
            });
        } else {
            res.status(401).json({ error: 'Invalid email or password.' });
        }
    });
};