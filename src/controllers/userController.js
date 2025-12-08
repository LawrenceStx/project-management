// src/controllers/userController.js
const db = require('../db/database');
const bcrypt = require('bcryptjs');

exports.checkSetupStatus = (req, res) => {
    db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
        if (err) return res.status(500).json({ error: 'DB Error' });
        // If count > 0, system is initialized
        res.json({ isInitialized: row.count > 0 });
    });
};

// 2. Perform the initial Admin creation
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
            const hashedPassword = await bcrypt.hash(password, 10);
            
            // Force Role ID 1 (Admin)
            const stmt = db.prepare("INSERT INTO users (username, email, password, role_id) VALUES (?, ?, ?, 1)");
            stmt.run(username, email, hashedPassword, function(err) {
                if (err) return res.status(500).json({ error: 'Failed to create admin.' });
                res.json({ message: 'System initialized successfully.' });
            });
            stmt.finalize();
        } catch (e) {
            res.status(500).json({ error: 'Server error' });
        }
    });
};

/**
 * [ADMIN] Get a list of all users/accounts.
 */
exports.getAllUsers = (req, res) => {
    const query = `SELECT u.id, u.username, u.email, r.name AS role FROM users u JOIN roles r ON u.role_id = r.id ORDER BY u.id`;
    db.all(query, [], (err, rows) => { if (err) return res.status(500).json({ error: 'DB Error' }); res.json(rows); });
};

/**
 * [ADMIN] Create a new user (Assigns member role by default).
 */
exports.createUser = async (req, res) => {
    const { username, email, password, role_id } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({ error: "All fields are required." });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        
        db.run("INSERT INTO users (username, email, password, role_id) VALUES (?, ?, ?, ?)", 
            [username, email, hashedPassword, role_id || 2], 
            function(err) {
                if (err) {
                    console.error("❌ Database Error:", err.message);
                    
                    // Check for duplicate entry
                    if (err.message.includes('UNIQUE constraint failed')) {
                        if (err.message.includes('users.email')) {
                            return res.status(409).json({ error: 'This Email is already registered.' });
                        }
                        if (err.message.includes('users.username')) {
                            return res.status(409).json({ error: 'This Username is already taken.' });
                        }
                        return res.status(409).json({ error: 'User already exists.' });
                    }
                    
                    return res.status(500).json({ error: 'Database creation failed: ' + err.message });
                }
                res.status(201).json({ message: 'User created successfully', id: this.lastID });
            }
        );
    } catch (e) {
        console.error("Server Error:", e);
        res.status(500).json({ error: 'Internal server error processing password.' });
    }
};


/**
 * [ADMIN] Update user details (e.g., role, active status).
 */
exports.updateUser = async (req, res) => {
    const { id } = req.params;
    const { username, email, role_id, password } = req.body;
    
    // Dynamic SQL generation
    const fields = [];
    const values = [];

    if (username) { fields.push("username = ?"); values.push(username); }
    if (email) { fields.push("email = ?"); values.push(email); }
    if (role_id) { fields.push("role_id = ?"); values.push(role_id); }
    
    // Only hash and update password if it's provided (not empty)
    if (password && password.trim() !== "") {
        try {
            const hashedPassword = await bcrypt.hash(password, 10);
            fields.push("password = ?");
            values.push(hashedPassword);
        } catch (e) {
            return res.status(500).json({ error: "Password hashing failed" });
        }
    }

    if (fields.length === 0) {
        return res.status(400).json({ error: 'No fields provided for update.' });
    }
    
    const query = `UPDATE users SET ${fields.join(', ')} WHERE id = ?`;
    values.push(id);

    db.run(query, values, function(err) {
        if (err) {
            if(err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Username or Email already taken.' });
            return res.status(500).json({ error: 'Failed to update user.' });
        }
        res.json({ message: `User updated successfully.` });
    });
};

/**
 * [ADMIN] Delete a user.
 */
exports.deleteUser = (req, res) => {
    db.run("DELETE FROM users WHERE id = ?", [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: 'Delete failed' });
        res.json({ message: 'Deleted' });
    });
};

// [SELF] Endpoint for a user to change their own password (part of settings)
exports.changePassword = async (req, res) => {
    // Implementation needed later, but this is a personal setting, not Admin CRUD
};
exports.getMemberStats = (req, res) => {
    const { projectId } = req.params;
    const query = `
        SELECT 
            u.id, u.username, pm.role_in_project,
            COUNT(t.id) as total_tasks,
            SUM(CASE WHEN t.status = 'Done' THEN 1 ELSE 0 END) as completed_tasks
        FROM users u
        JOIN project_members pm ON u.id = pm.user_id
        LEFT JOIN tasks t ON u.id = t.assigned_to_id AND t.project_id = pm.project_id
        WHERE pm.project_id = ?
        GROUP BY u.id
    `;
    db.all(query, [projectId], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Failed to fetch stats.' });
        res.json(rows);
    });
};

// [SELF] Change Password
exports.changePassword = async (req, res) => {
    const userId = req.session.user.id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'All fields are required.' });
    }

    try {
        // 1. Get current password hash
        db.get("SELECT password FROM users WHERE id = ?", [userId], async (err, row) => {
            if (err || !row) return res.status(500).json({ error: 'User not found.' });

            // 2. Verify Current Password
            const match = await bcrypt.compare(currentPassword, row.password);
            if (!match) {
                return res.status(401).json({ error: 'Incorrect current password.' });
            }

            // 3. Hash New Password
            const hashedPassword = await bcrypt.hash(newPassword, 10);

            // 4. Update Database
            db.run("UPDATE users SET password = ? WHERE id = ?", [hashedPassword, userId], function(err) {
                if (err) return res.status(500).json({ error: 'Failed to update password.' });
                res.json({ message: 'Password updated successfully.' });
            });
        });
    } catch (e) {
        res.status(500).json({ error: 'Server error.' });
    }
};

exports.getDashboardStats = (req, res) => {
    const userId = req.session.user.id;
    const roleId = req.session.user.role_id;
    
    // Existing Counts Logic
    const qProjects = roleId === 1 ? "SELECT COUNT(*) as c FROM projects" : "SELECT COUNT(*) as c FROM project_members WHERE user_id = ?";
    const pParams = roleId === 1 ? [] : [userId];
    const qTasks = "SELECT COUNT(*) as c FROM tasks WHERE assigned_to_id = ? AND status != 'Done'";
    const qUsers = "SELECT COUNT(*) as c FROM users";
    
    // NEW: Query for deadlines (Tasks assigned to user, not done, ordered by date)
    const qDeadlines = `
        SELECT t.name, t.due_date, p.name as project_name 
        FROM tasks t
        JOIN projects p ON t.project_id = p.id
        WHERE t.assigned_to_id = ? 
        AND t.status != 'Done' 
        AND t.due_date IS NOT NULL
        ORDER BY t.due_date ASC 
        LIMIT 5
    `;

    db.serialize(() => {
        let stats = { projects: 0, myTasks: 0, users: 0, deadlines: [] };
        
        db.get(qProjects, pParams, (e, r) => {
            if(!e && r) stats.projects = r.c;
            
            db.get(qTasks, [userId], (e2, r2) => {
                if(!e2 && r2) stats.myTasks = r2.c;
                
                db.get(qUsers, [], (e3, r3) => {
                    if(!e3 && r3) stats.users = r3.c;
                    
                    // NEW: Execute Deadline Query
                    db.all(qDeadlines, [userId], (e4, rows) => {
                        if(!e4 && rows) stats.deadlines = rows;
                        res.json(stats);
                    });
                });
            });
        });
    });
};