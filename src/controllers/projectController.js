// src/controllers/projectController.js
const db = require('../db/database');
const io = require('../../server').io; // Access the Socket.io instance

/**
 * [AUTH] Get all projects (Accessible by Admin) OR projects a user is a member of (Accessible by Member).
 */
exports.getAllProjects = (req, res) => {
    const userId = req.session.user.id;
    const roleId = req.session.user.role_id;

    let query = `
        SELECT p.*, u.username as created_by_name
        FROM projects p
        JOIN users u ON p.created_by_id = u.id
    `;
    let params = [];

    // If not Admin (roleId = 2), filter by membership
    if (roleId === 2) {
        query += `
            JOIN project_members pm ON p.id = pm.project_id
            WHERE pm.user_id = ?
        `;
        params.push(userId);
    }
    
    query += ` ORDER BY p.start_date DESC;`;

    db.all(query, params, (err, rows) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Failed to fetch projects.' });
        }
        res.json(rows);
    });
};

/**
 * [ADMIN] Create a new project.
 */
exports.createProject = (req, res) => {
    const { name, description, start_date, end_date, members } = req.body;
    const created_by_id = req.session.user.id;

    if (!name || !start_date || !end_date) {
        return res.status(400).json({ error: 'Name, start date, and end date are required.' });
    }

    db.run(
        "INSERT INTO projects (name, description, start_date, end_date, created_by_id) VALUES (?, ?, ?, ?, ?)",
        [name, description, start_date, end_date, created_by_id],
        function(err) {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Failed to create project.' });
            }
            const projectId = this.lastID;

            // Add members if provided
            if (members && members.length > 0) {
                const memberInserts = members.map(m => `(${projectId}, ${m.id}, '${m.role || 'Member'}')`).join(', ');
                db.run(`INSERT INTO project_members (project_id, user_id, role_in_project) VALUES ${memberInserts}`, (memberErr) => {
                    if (memberErr) console.warn('Error adding project members:', memberErr.message);
                });
            }
            
            // --- FIX: Use req.io instead of io ---
            req.io.emit('project:new', { id: projectId, name, created_by_id });
            // -------------------------------------

            res.status(201).json({ message: 'Project created successfully.', projectId });
        }
    );
};

exports.updateProject = (req, res) => {
    const { id } = req.params;
    const { name, description, status, start_date, end_date } = req.body;
    
    const fields = [];
    const values = [];
    if (name) { fields.push("name = ?"); values.push(name); }
    if (description) { fields.push("description = ?"); values.push(description); }
    if (status) { fields.push("status = ?"); values.push(status); }
    if (start_date) { fields.push("start_date = ?"); values.push(start_date); }
    if (end_date) { fields.push("end_date = ?"); values.push(end_date); }
    
    // Safety check just to prevent error if empty
    if (fields.length === 0) return res.status(400).json({error: "No fields"});

    const query = `UPDATE projects SET ${fields.join(', ')} WHERE id = ?`;
    values.push(id);

    db.run(query, values, function(err) {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Failed to update project.' });
        }
        
        // --- FIX: Use req.io ---
        req.io.emit('project:update', { projectId: id, status });
        // -----------------------
        
        res.json({ message: `Project ${id} updated successfully.` });
    });
};

/**
 * [ADMIN] Manage Project Members (Add/Remove/Update Role).
 * This endpoint replaces ALL current members with the list provided in req.body.members
 * For simplicity, we delete and recreate memberships.
 */
exports.manageProjectMembers = (req, res) => {
    const { projectId } = req.params;
    const { members } = req.body;

    db.serialize(() => {
        // 1. Delete existing members
        db.run("DELETE FROM project_members WHERE project_id = ?", [projectId], (err) => {
            if (err) return res.status(500).json({ error: 'Failed to clear old members.' });

            if (!members || members.length === 0) {
                 return res.json({ message: 'Project members cleared.' });
            }

            // 2. Insert new members
            const placeholders = members.map(() => '(?, ?, ?)').join(', ');
            let insertValues = [];
            members.forEach(m => {
                insertValues.push(projectId, m.id, m.role || 'Member');
            });

            const insertQuery = `INSERT INTO project_members (project_id, user_id, role_in_project) VALUES ${placeholders}`;
            
            db.run(insertQuery, insertValues, function(err) {
                if (err) {
                    console.error('Error inserting new members:', err);
                    return res.status(500).json({ error: 'Failed to add new members.' });
                }
                req.io.emit('project:members_changed', { projectId });
                res.json({ message: `Project members updated successfully.` });
            });
        });
    });
};

exports.getAllProjects = (req, res) => {
    const userId = req.session.user.id;
    const roleId = req.session.user.role_id;
    let query = `
        SELECT p.*, u.username as created_by_name
        FROM projects p
        JOIN users u ON p.created_by_id = u.id
    `;
    let params = [];
    if (roleId === 2) {
        query += ` JOIN project_members pm ON p.id = pm.project_id WHERE pm.user_id = ?`;
        params.push(userId);
    }
    query += ` ORDER BY p.start_date DESC;`;
    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: 'Failed to fetch projects.' });
        res.json(rows);
    });
};