const db = require('../db/database');
const emailService = require('../services/emailService');

exports.getProjectTasks = (req, res) => {
    const { projectId } = req.params;
    const userId = req.session.user.id;
    const roleId = req.session.user.role_id;
    
    // 1. FILTER: Members see only their tasks, Admins see all
    let query = `
        SELECT t.*, u.username as assigned_to_name
        FROM tasks t
        LEFT JOIN users u ON t.assigned_to_id = u.id
        WHERE t.project_id = ?
    `;
    const params = [projectId];

    if (roleId === 2) { // 2 = Member
        query += ` AND t.assigned_to_id = ?`;
        params.push(userId);
    }
    query += ` ORDER BY t.due_date ASC`;

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: 'DB Error' });
        res.json(rows);
    });
};

exports.createTask = (req, res) => {
    // 2. INPUTS: Capture Link & Youtube
    const { project_id, name, description, assigned_to_id, due_date, external_link, youtube_link } = req.body;

    const stmt = db.prepare(`
        INSERT INTO tasks (project_id, name, description, assigned_to_id, due_date, status, external_link, youtube_link) 
        VALUES (?, ?, ?, ?, ?, 'Todo', ?, ?)
    `);

    stmt.run(project_id, name, description, assigned_to_id, due_date, external_link, youtube_link, function(err) {
        if (err) return res.status(500).json({ error: 'Create failed' });
        
        req.io.emit('task:update', { projectId: project_id });
        
        // Email Notification Logic (Simplified for brevity)
        if (assigned_to_id) {
            db.get(`SELECT u.email, u.username, p.name as pname FROM users u, projects p WHERE u.id=? AND p.id=?`, 
                [assigned_to_id, project_id], (e, r) => {
                if(r) emailService.sendTaskAssignmentEmail(r.email, r.username, name, r.pname, due_date);
            });
        }
        res.status(201).json({ message: 'Task created', taskId: this.lastID });
    });
    stmt.finalize();
};

// 3. EDIT: Full Edit for Admins
exports.updateTaskDetails = (req, res) => {
    const { id } = req.params;
    const { name, description, due_date, assigned_to_id, external_link, youtube_link } = req.body;

    db.run(`UPDATE tasks SET name=?, description=?, due_date=?, assigned_to_id=?, external_link=?, youtube_link=? WHERE id=?`, 
    [name, description, due_date, assigned_to_id, external_link, youtube_link, id], (err) => {
        if(err) return res.status(500).json({error: 'Update failed'});
        
        db.get("SELECT project_id FROM tasks WHERE id = ?", [id], (e, r) => {
            if(r) req.io.emit('task:update', { projectId: r.project_id });
        });
        res.json({message: 'Updated'});
    });
};

// 4. STATUS: Members can edit status
exports.updateTaskStatus = (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    db.run("UPDATE tasks SET status = ? WHERE id = ?", [status, id], (err) => {
        if(err) return res.status(500).json({error: 'Error'});
        db.get("SELECT project_id FROM tasks WHERE id = ?", [id], (e, r) => {
            if(r) req.io.emit('task:update', { projectId: r.project_id });
        });
        res.json({message: 'Status updated'});
    });
};

exports.deleteTask = (req, res) => {
    const { id } = req.params;
    db.get("SELECT project_id FROM tasks WHERE id = ?", [id], (err, row) => {
        if (!row) return res.status(404).json({error: 'Not found'});
        db.run("DELETE FROM tasks WHERE id = ?", [id], () => {
            req.io.emit('task:update', { projectId: row.project_id });
            res.json({ message: 'Deleted' });
        });
    });
};