// src/controllers/userController.js
const db = require('../db/database');
const bcrypt = require('bcryptjs');

/**
 * [ADMIN] Get a list of all users/accounts.
 */
exports.getAllUsers = (req, res) => {
    const query = `
        SELECT u.id, u.username, u.email, r.name AS role, u.is_active
        FROM users u 
        JOIN roles r ON u.role_id = r.id 
        ORDER BY u.id
    `;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Failed to fetch users.' });
        res.json(rows);
    });
};

/**
 * [ADMIN] Create a new user (Assigns member role by default).
 */
exports.createUser = async (req, res) => {
    const { username, email, password, role_id = 2 } = req.body;
    
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        
        db.run(
            "INSERT INTO users (username, email, password, role_id, is_active) VALUES (?, ?, ?, ?, 1)",
            [username, email, hashedPassword, role_id],
            function(err) {
                if (err) {
                    return res.status(400).json({ error: 'User creation failed. Email/Username may exist.' });
                }
                res.status(201).json({ message: 'User created successfully.', userId: this.lastID });
            }
        );
    } catch (e) {
        res.status(500).json({ error: 'Internal server error.' });
    }
};

/**
 * [ADMIN] Update user details (e.g., role, active status).
 */
exports.updateUser = (req, res) => {
    const { id } = req.params;
    const { username, email, role_id, is_active } = req.body;
    
    // Check which fields are provided for a dynamic update
    const fields = [];
    const values = [];

    if (username !== undefined) { fields.push("username = ?"); values.push(username); }
    if (email !== undefined) { fields.push("email = ?"); values.push(email); }
    if (role_id !== undefined) { fields.push("role_id = ?"); values.push(role_id); }
    if (is_active !== undefined) { fields.push("is_active = ?"); values.push(is_active); }

    if (fields.length === 0) {
        return res.status(400).json({ error: 'No fields provided for update.' });
    }
    
    const query = `UPDATE users SET ${fields.join(', ')} WHERE id = ?`;
    values.push(id);

    db.run(query, values, function(err) {
        if (err) {
            return res.status(500).json({ error: 'Failed to update user.' });
        }
        res.json({ message: `User ${id} updated successfully.` });
    });
};

/**
 * [ADMIN] Delete a user.
 */
exports.deleteUser = (req, res) => {
    const { id } = req.params;

    db.run("DELETE FROM users WHERE id = ?", [id], function(err) {
        if (err) {
            return res.status(500).json({ error: 'Failed to delete user.' });
        }
        if (this.changes === 0) {
             return res.status(404).json({ error: 'User not found.' });
        }
        res.json({ message: `User ${id} deleted.` });
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