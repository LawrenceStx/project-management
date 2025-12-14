// FILE: src/controllers/logController.js
const db = require('../db/database');

exports.getLogs = (req, res) => {
    const { projectId } = req.params;
    const query = `
        SELECT l.*, u.username as author 
        FROM project_logs l
        JOIN users u ON l.created_by_id = u.id
        WHERE l.project_id = ?
        ORDER BY l.log_date DESC, l.created_at DESC 
    `;
    db.all(query, [projectId], (err, rows) => {
        if (err) return res.status(500).json({ error: 'DB Error' });
        res.json(rows);
    });
};

exports.createLog = (req, res) => {
    const { project_id, content, log_date } = req.body; // Added log_date
    const userId = req.session.user.id;

    if (!content) return res.status(400).json({ error: 'Content is required' });

    // Default to today if no date provided
    const dateToSave = log_date || new Date().toISOString().split('T')[0];

    const stmt = db.prepare("INSERT INTO project_logs (project_id, content, created_by_id, log_date) VALUES (?, ?, ?, ?)");
    stmt.run(project_id, content, userId, dateToSave, function(err) {
        if (err) return res.status(500).json({ error: 'Failed to create log' });
        req.io.emit('log:update', { projectId: project_id });
        res.json({ message: 'Log added', id: this.lastID });
    });
    stmt.finalize();
};

exports.updateLog = (req, res) => {
    const { content, log_date } = req.body; // Added log_date
    const { id } = req.params;

    // We need to fetch the existing date if one isn't provided, or just update what we have.
    // For simplicity, we assume frontend always sends the date on edit.
    db.run("UPDATE project_logs SET content = ?, log_date = ? WHERE id = ?", [content, log_date, id], function(err) {
        if (err) return res.status(500).json({ error: 'Update failed' });
        
        db.get("SELECT project_id FROM project_logs WHERE id = ?", [id], (e, r) => {
            if (r) req.io.emit('log:update', { projectId: r.project_id });
        });
        
        res.json({ message: 'Log updated' });
    });
};

exports.deleteLog = (req, res) => {
    const { id } = req.params;
    
    db.get("SELECT project_id FROM project_logs WHERE id = ?", [id], (e, r) => {
        if (!r) return res.status(404).json({ error: 'Log not found' });
        
        db.run("DELETE FROM project_logs WHERE id = ?", [id], (err) => {
            if (err) return res.status(500).json({ error: 'Delete failed' });
            req.io.emit('log:update', { projectId: r.project_id });
            res.json({ message: 'Log deleted' });
        });
    });
};