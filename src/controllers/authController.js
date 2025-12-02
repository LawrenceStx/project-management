// src/controllers/authController.js
const db = require('../db/database');
const bcrypt = require('bcryptjs');

const saltRounds = 10;

/**
 * Handles user registration and creation of the initial Admin account.
 * (Note: In a real app, only the first user registered would be auto-Admin, 
 * subsequent users would be registered by an Admin.)
 */
exports.registerUser = async (req, res) => {
    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
        return res.status(400).json({ error: 'Missing required fields.' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Check if this is the first user (make them Admin)
        db.get("SELECT COUNT(*) as count FROM users", async (err, row) => {
            if (err) return res.status(500).json({ error: 'Database check failed.' });
            
            const role_id = row.count === 0 ? 1 : 2; // 1=Admin, 2=Member

            const stmt = db.prepare("INSERT INTO users (username, email, password, role_id) VALUES (?, ?, ?, ?)");
            stmt.run(username, email, hashedPassword, role_id, function(err) {
                if (err) {
                    console.error('Registration error:', err.message);
                    return res.status(409).json({ error: 'Username or email already exists.' });
                }
                
                // For demonstration, we automatically log them in after registration
                const userId = this.lastID;
                // NOTE: Session management setup is needed here in the next step.
                
                res.status(201).json({ 
                    message: 'User registered successfully.', 
                    userId,
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

/**
 * Handles user login.
 */
exports.loginUser = (req, res) => {
    const { email, password } = req.body;

    db.get("SELECT * FROM users WHERE email = ?", [email], async (err, user) => {
        if (err) return res.status(500).json({ error: 'Database error.' });
        if (!user) return res.status(401).json({ error: 'Invalid email or password.' });
        
        const match = await bcrypt.compare(password, user.password);

        if (match) {
            // Success: Attach user info to session/cookie here (TBD in server.js updates)
            // For now, return basic info
            req.session.user = { 
                id: user.id, 
                username: user.username, 
                role_id: user.role_id 
            };
            const roleName = user.role_id === 1 ? 'Admin' : 'Member';
            
            // NOTE: In the next step, we will use Express-Session middleware
            // req.session.user = { id: user.id, role_id: user.role_id, username: user.username };

            res.status(200).json({ 
                message: 'Login successful', 
                user: { id: user.id, username: user.username, role: roleName } 
            });
        } else {
            res.status(401).json({ error: 'Invalid email or password.' });
        }
    });
};