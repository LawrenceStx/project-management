const db = require('../db/database');

exports.getEvents = (req, res) => {
    db.all("SELECT * FROM project_events WHERE project_id = ? ORDER BY start_date ASC", [req.params.projectId], (err, rows) => {
        if (err) return res.status(500).json({ error: 'DB Error' });
        res.json(rows);
    });
};

exports.createEvent = (req, res) => {
    const { project_id, name, start_date, end_date, color } = req.body;
    db.run("INSERT INTO project_events (project_id, name, start_date, end_date, color) VALUES (?, ?, ?, ?, ?)", 
    [project_id, name, start_date, end_date, color || '#ffc107'], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, message: 'Event created' });
    });
};

exports.updateEvent = (req, res) => {
    const { name, start_date, end_date, color } = req.body;
    db.run("UPDATE project_events SET name=?, start_date=?, end_date=?, color=? WHERE id=?", 
    [name, start_date, end_date, color, req.params.id], (err) => {
        if (err) return res.status(500).json({ error: 'Update failed' });
        res.json({ message: 'Event updated' });
    });
};

exports.deleteEvent = (req, res) => {
    db.run("DELETE FROM project_events WHERE id = ?", [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: 'Delete failed' });
        res.json({ message: 'Event deleted' });
    });
};