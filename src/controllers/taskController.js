const db = require('../db/database');
const fs = require('fs');
const path = require('path');

// Helper to wrap DB calls in Promises (cleaner async/await)
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

// --- GET TASKS (The Fix for "Unassigned") ---
exports.getProjectTasks = async (req, res) => {
    const { projectId } = req.params;
    
    try {
        // 1. Fetch Basic Task Data
        const tasks = await dbQuery(`
            SELECT t.*, u.username as owner_name 
            FROM tasks t 
            LEFT JOIN users u ON t.assigned_to_id = u.id 
            WHERE t.project_id = ? ORDER BY t.due_date ASC
        `, [projectId]);

        if (tasks.length === 0) return res.json([]);

        // 2. Fetch ALL Assignees for these tasks in one simple query
        // This avoids complex JOIN aggregation bugs
        const taskIds = tasks.map(t => t.id).join(',');
        
        const assignees = await dbQuery(`
            SELECT ta.task_id, u.id, u.username 
            FROM task_assignees ta
            JOIN users u ON ta.user_id = u.id
            WHERE ta.task_id IN (${taskIds})
        `);

        // 3. Merge in Javascript (100% reliable)
        const tasksWithAssignees = tasks.map(task => {
            // Find all rows in 'assignees' that match this task_id
            task.assignees = assignees.filter(a => a.task_id === task.id).map(a => ({
                id: a.id,
                username: a.username
            }));
            return task;
        });

        res.json(tasksWithAssignees);

    } catch (err) {
        console.error("Get Tasks Error:", err);
        res.status(500).json({ error: 'Failed to load tasks' });
    }
};

// --- CREATE TASK ---
exports.createTask = async (req, res) => {
    const { project_id, name, description, due_date, external_link, youtube_link, assigneeIds } = req.body;
    
    let attachmentPath = null;
    let attachmentName = null;
    if (req.file) {
        attachmentPath = '/uploads/' + req.file.filename;
        attachmentName = req.file.originalname;
    }

    try {
        // Insert Task
        const result = await dbRun(`
            INSERT INTO tasks (project_id, name, description, due_date, status, external_link, youtube_link, attachment_path, attachment_name) 
            VALUES (?, ?, ?, ?, 'Todo', ?, ?, ?, ?)
        `, [project_id, name, description, due_date, external_link, youtube_link, attachmentPath, attachmentName]);
        
        const taskId = result.lastID;

        // Insert Assignees
        if (assigneeIds) {
            const ids = JSON.parse(assigneeIds); // Expecting JSON string from frontend
            if (Array.isArray(ids) && ids.length > 0) {
                const placeholders = ids.map(() => '(?, ?)').join(',');
                const values = ids.flatMap(uid => [taskId, uid]);
                await dbRun(`INSERT INTO task_assignees (task_id, user_id) VALUES ${placeholders}`, values);
            }
        }

        req.io.emit('task:update', { projectId: project_id });
        res.status(201).json({ message: 'Task created', taskId });

    } catch (err) {
        console.error("Create Task Error:", err);
        res.status(500).json({ error: err.message });
    }
};

// --- UPDATE TASK (The Fix for Edit/File/Members) ---
exports.updateTaskDetails = async (req, res) => {
    const { id } = req.params;
    const { name, description, due_date, external_link, youtube_link, assigneeIds } = req.body;

    console.log(`[UPDATE] Task ${id} | Files:`, req.file ? 'Yes' : 'No', '| Assignees:', assigneeIds);

    try {
        // 1. Update Basic Fields
        let sql = `UPDATE tasks SET name=?, description=?, due_date=?, external_link=?, youtube_link=?`;
        let params = [name, description, due_date, external_link, youtube_link];

        // 2. Handle File Overwrite
        if (req.file) {
            // Optional: Fetch old file to delete it (cleanup)
            const oldTask = await dbQuery("SELECT attachment_path FROM tasks WHERE id = ?", [id]);
            if (oldTask[0] && oldTask[0].attachment_path) {
                const oldPath = path.join(__dirname, '../../public', oldTask[0].attachment_path);
                if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
            }

            sql += `, attachment_path=?, attachment_name=?`;
            params.push('/uploads/' + req.file.filename, req.file.originalname);
        }

        sql += ` WHERE id=?`;
        params.push(id);

        await dbRun(sql, params);

        // 3. Handle Assignees Update (Clear All -> Re-insert)
        // Always delete existing first to avoid duplicates or stale data
        await dbRun("DELETE FROM task_assignees WHERE task_id = ?", [id]);

        if (assigneeIds) {
            const ids = JSON.parse(assigneeIds);
            if (Array.isArray(ids) && ids.length > 0) {
                const placeholders = ids.map(() => '(?, ?)').join(',');
                const values = ids.flatMap(uid => [id, uid]);
                await dbRun(`INSERT INTO task_assignees (task_id, user_id) VALUES ${placeholders}`, values);
            }
        }

        // 4. Notify Clients
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
        
        if (row[0].attachment_path) {
            const p = path.join(__dirname, '../../public', row[0].attachment_path);
            if (fs.existsSync(p)) fs.unlinkSync(p);
        }

        await dbRun("DELETE FROM tasks WHERE id = ?", [id]);
        req.io.emit('task:update', { projectId: row[0].project_id });
        res.json({ message: 'Deleted' });
    } catch(e) { res.status(500).json({error:e.message}); }
};