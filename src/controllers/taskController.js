// src/controllers/taskController.js
const db = require('../db/database');
const emailService = require('../services/emailService');

exports.getProjectTasks = (req, res) => {
    const { projectId } = req.params;
    
    const query = `
        SELECT t.*, u.username as assigned_to_name, u.email as assigned_to_email
        FROM tasks t
        LEFT JOIN users u ON t.assigned_to_id = u.id
        WHERE t.project_id = ?
        ORDER BY t.due_date ASC
    `;

    db.all(query, [projectId], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Failed to fetch tasks.' });
        res.json(rows);
    });
};

exports.createTask = (req, res) => {
    const { project_id, name, description, assigned_to_id, due_date } = req.body;

    if (!project_id || !name) {
        return res.status(400).json({ error: 'Project ID and Task Name are required.' });
    }

    const stmt = db.prepare(`
        INSERT INTO tasks (project_id, name, description, assigned_to_id, due_date, status) 
        VALUES (?, ?, ?, ?, ?, 'Todo')
    `);

    stmt.run(project_id, name, description, assigned_to_id, due_date, function(err) {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Failed to create task.' });
        }
        
        const taskId = this.lastID;
        
        // Emit Socket Event
        req.io.emit('task:update', { projectId: project_id });

        // Fetch details for Email Notification
        if (assigned_to_id) {
            db.get(`
                SELECT u.email, u.username, p.name as project_name 
                FROM users u, projects p 
                WHERE u.id = ? AND p.id = ?`, 
                [assigned_to_id, project_id], 
                (err, row) => {
                    if (!err && row) {
                        emailService.sendTaskAssignmentEmail(
                            row.email, 
                            row.username, 
                            name, 
                            row.project_name, 
                            due_date
                        );
                    }
            });
        }

        res.status(201).json({ message: 'Task created.', taskId });
    });
    stmt.finalize();
};

exports.updateTaskStatus = (req, res) => {
    const { id } = req.params;
    const { status } = req.body; // Todo, In Progress, Done

    db.run("UPDATE tasks SET status = ? WHERE id = ?", [status, id], function(err) {
        if (err) return res.status(500).json({ error: 'Failed to update task.' });
        
        // We need the project_id to notify the right clients
        db.get("SELECT project_id FROM tasks WHERE id = ?", [id], (e, row) => {
            if (row) {
                req.io.emit('task:update', { projectId: row.project_id });
            }
        });

        res.json({ message: 'Task status updated.' });
    });
};


exports.deleteTask = (req, res) => {
    const { id } = req.params;

    // First get the project_id to notify the room
    db.get("SELECT project_id FROM tasks WHERE id = ?", [id], (err, row) => {
        if (err || !row) return res.status(404).json({ error: 'Task not found' });

        const projectId = row.project_id;

        db.run("DELETE FROM tasks WHERE id = ?", [id], function(err) {
            if (err) return res.status(500).json({ error: 'Failed to delete task.' });
            
            // Notify clients to refresh
            req.io.emit('task:update', { projectId });
            
            res.json({ message: 'Task deleted.' });
        });
    });
};