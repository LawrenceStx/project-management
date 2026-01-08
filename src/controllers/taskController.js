const db = require('../db/database');
const fs = require('fs');
const path = require('path');
const emailService = require('../services/emailService'); // Import Email Service

// Helper for Promisified DB
const dbQuery = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

const dbRun = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
};

// --- GET TASKS (Filtered by Role) ---
exports.getProjectTasks = async (req, res) => {
    const { projectId } = req.params;
    const userId = req.session.user.id;
    const roleId = req.session.user.role_id; // 1 = Admin, 2 = Member
    
    try {
        let sql = `
            SELECT t.*, u.username as owner_name, u.email as owner_email
            FROM tasks t 
            LEFT JOIN users u ON t.assigned_to_id = u.id 
            WHERE t.project_id = ? 
        `;
        
        const params = [projectId];

        // LOGIC: If Member (Role 2), ONLY show tasks assigned to them
        if (roleId === 2) {
            sql += ` AND t.assigned_to_id = ?`;
            params.push(userId);
        }

        sql += ` ORDER BY t.due_date ASC`;

        const tasks = await dbQuery(sql, params);

        // Format for frontend (Frontend expects 'assignees' array even if it's just 1 person)
        const formattedTasks = tasks.map(t => ({
            ...t,
            assignees: t.owner_name ? [{ id: t.assigned_to_id, username: t.owner_name }] : []
        }));

        res.json(formattedTasks);

    } catch (err) {
        console.error("Get Tasks Error:", err);
        res.status(500).json({ error: 'Failed to load tasks' });
    }
};

// --- CREATE TASK (Duplicate for each Assignee) ---
exports.createTask = async (req, res) => {
    const { project_id, name, description, due_date, external_link, youtube_link, assigneeIds } = req.body;
    
    // 1. Handle File Upload (Done once, path shared across duplicates)
    let attachmentPath = null;
    let attachmentName = null;
    if (req.file) {
        attachmentPath = '/uploads/' + req.file.filename;
        attachmentName = req.file.originalname;
    }

    try {
        // 2. Parse Assignees
        let userIds = [];
        try {
            userIds = JSON.parse(assigneeIds);
        } catch (e) {
            // If strictly one ID coming as string
            userIds = [assigneeIds];
        }

        // If no one assigned, assign to Creator or leave NULL (logic for just 1 task)
        if (!userIds || userIds.length === 0) {
            await dbRun(`
                INSERT INTO tasks (project_id, name, description, due_date, status, external_link, youtube_link, attachment_path, attachment_name) 
                VALUES (?, ?, ?, ?, 'Todo', ?, ?, ?, ?)
            `, [project_id, name, description, due_date, external_link, youtube_link, attachmentPath, attachmentName]);
        } else {
            // 3. Fetch Project Name (For Email Context)
            const projectRow = await dbQuery("SELECT name FROM projects WHERE id = ?", [project_id]);
            const projectName = projectRow[0] ? projectRow[0].name : "Project";

            // 4. LOOP: Create Separate Task for EACH User
            const promises = userIds.map(async (uid) => {
                // A. Insert Task
                await dbRun(`
                    INSERT INTO tasks (project_id, assigned_to_id, name, description, due_date, status, external_link, youtube_link, attachment_path, attachment_name) 
                    VALUES (?, ?, ?, ?, ?, 'Todo', ?, ?, ?, ?)
                `, [project_id, uid, name, description, due_date, external_link, youtube_link, attachmentPath, attachmentName]);

                // B. Fetch User Email for Notification
                const userRow = await dbQuery("SELECT username, email FROM users WHERE id = ?", [uid]);
                
                // C. Send Brevo Email
                if (userRow[0] && userRow[0].email) {
                    // We don't await this so it doesn't slow down the UI
                    emailService.sendTaskAssignmentEmail(
                        userRow[0].email, 
                        userRow[0].username, 
                        name, 
                        projectName, 
                        due_date
                    ).catch(err => console.error("Email failed for " + userRow[0].username, err));
                }
            });

            // Wait for all DB insertions to finish
            await Promise.all(promises);
        }

        // 5. Notify Socket
        req.io.emit('task:update', { projectId: project_id });
        res.status(201).json({ message: 'Tasks created and emails sending...' });

    } catch (err) {
        console.error("Create Task Error:", err);
        res.status(500).json({ error: err.message });
    }
};

// --- UPDATE TASK ---
// Note: In this "Split" model, updating a task only updates THAT specific user's copy.
// This is usually desired behavior once tasks are split (User A might have different notes than User B).
exports.updateTaskDetails = async (req, res) => {
    const { id } = req.params;
    const { name, description, due_date, external_link, youtube_link, assigneeIds } = req.body;

    try {
        let sql = `UPDATE tasks SET name=?, description=?, due_date=?, external_link=?, youtube_link=?`;
        let params = [name, description, due_date, external_link, youtube_link];

        // 1. Handle File Update
        if (req.file) {
            sql += `, attachment_path=?, attachment_name=?`;
            params.push('/uploads/' + req.file.filename, req.file.originalname);
        }

        // 2. Handle Re-assignment (Fix)
        // Since tasks are now individual rows, if the user selects a person in the edit modal,
        // we assume they want to move THIS task to that person.
        if (assigneeIds) {
            let userIds = [];
            try { userIds = JSON.parse(assigneeIds); } catch(e) { userIds = [assigneeIds]; }
            
            // We take the first ID because we are editing a single task row
            if (userIds.length > 0) {
                sql += `, assigned_to_id=?`;
                params.push(userIds[0]);
            }
        }

        sql += ` WHERE id=?`;
        params.push(id);

        await dbRun(sql, params);

        // Notify Clients
        const taskRow = await dbQuery("SELECT project_id FROM tasks WHERE id = ?", [id]);
        if (taskRow[0]) {
            req.io.emit('task:update', { projectId: taskRow[0].project_id });
        }

        res.json({ message: 'Updated successfully' });

    } catch (err) {
        console.error("Update Task Error:", err);
        res.status(500).json({ error: 'Update failed' });
    }
};

exports.updateTaskStatus = async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    try {
        await dbRun("UPDATE tasks SET status = ? WHERE id = ?", [status, id]);
        const r = await dbQuery("SELECT project_id FROM tasks WHERE id = ?", [id]);
        if(r[0]) req.io.emit('task:update', { projectId: r[0].project_id });
        res.json({message: 'Status updated'});
    } catch(e) { res.status(500).json({error:e.message}); }
};

exports.deleteTask = async (req, res) => {
    const { id } = req.params;
    try {
        const row = await dbQuery("SELECT project_id, attachment_path FROM tasks WHERE id = ?", [id]);
        if (!row[0]) return res.status(404).json({error: 'Not found'});
        
        // Note: In a split system, we probably shouldn't delete the physical file 
        // immediately if other tasks (duplicates) are using it. 
        // For safety, we keep the file, or you need a check if other tasks use this path.
        
        await dbRun("DELETE FROM tasks WHERE id = ?", [id]);
        req.io.emit('task:update', { projectId: row[0].project_id });
        res.json({ message: 'Deleted' });
    } catch(e) { res.status(500).json({error:e.message}); }
};