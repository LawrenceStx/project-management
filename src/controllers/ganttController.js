// REPLACE THE ENTIRE FILE WITH THIS: src/controllers/ganttController.js

const db = require('../db/database');

// Helper function to manage assignee updates to avoid repeating code
const updateEventAssignees = (eventId, assigneeIds = [], callback) => {
    db.serialize(() => {
        // 1. Clear existing assignees for this event
        db.run("DELETE FROM event_assignees WHERE event_id = ?", [eventId]);

        // 2. If new assignees are provided, insert them
        if (assigneeIds && assigneeIds.length > 0) {
            const placeholders = assigneeIds.map(() => '(?, ?)').join(',');
            const values = assigneeIds.flatMap(userId => [eventId, userId]);
            const stmt = `INSERT INTO event_assignees (event_id, user_id) VALUES ${placeholders}`;
            db.run(stmt, values, callback);
        } else {
            // If no assignees, just callback
            callback(null);
        }
    });
};

exports.getEvents = (req, res) => {
    // UPDATED QUERY: Joins with assignees table and groups results
    const query = `
        SELECT 
            pe.*, 
            '[' || GROUP_CONCAT(
                CASE 
                    WHEN u.id IS NOT NULL THEN
                    '{ "id": ' || u.id || ', "username": "' || REPLACE(u.username, '"', '""') || '" }'
                    ELSE NULL 
                END
            ) || ']' as assignees_json
        FROM project_events pe
        LEFT JOIN event_assignees ea ON pe.id = ea.event_id
        LEFT JOIN users u ON ea.user_id = u.id
        WHERE pe.project_id = ?
        GROUP BY pe.id
        ORDER BY pe.start_date ASC
    `;
    
    db.all(query, [req.params.projectId], (err, rows) => {
        if (err) return res.status(500).json({ error: 'DB Error', details: err.message });
        
        // Safely parse the JSON string for each row
        rows.forEach(row => {
            try {
                // The GROUP_CONCAT might result in '[null]' if no assignees. Filter that out.
                const assignees = JSON.parse(row.assignees_json);
                row.assignees = assignees.filter(a => a !== null);
            } catch (e) {
                row.assignees = [];
            }
            delete row.assignees_json; // Clean up the raw field
        });
        
        res.json(rows);
    });
};

exports.createEvent = (req, res) => {
    // Added 'assigneeIds' to destructuring
    const { project_id, name, start_date, end_date, color, description, assigneeIds } = req.body;
    
    db.run("INSERT INTO project_events (project_id, name, start_date, end_date, color, description) VALUES (?, ?, ?, ?, ?, ?)", 
    [project_id, name, start_date, end_date, color || '#ffc107', description || ''], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        
        const eventId = this.lastID;
        updateEventAssignees(eventId, assigneeIds, (assignErr) => {
            if (assignErr) return res.status(500).json({ error: 'Failed to assign members' });
            res.json({ id: eventId, message: 'Event created' });
        });
    });
};

exports.updateEvent = (req, res) => {
    const eventId = req.params.id;
    // Added 'assigneeIds' to destructuring
    const { name, start_date, end_date, color, description, assigneeIds } = req.body;
    
    db.run("UPDATE project_events SET name=?, start_date=?, end_date=?, color=?, description=? WHERE id=?", 
    [name, start_date, end_date, color, description, eventId], (err) => {
        if (err) return res.status(500).json({ error: 'Update failed' });
        
        updateEventAssignees(eventId, assigneeIds, (assignErr) => {
            if (assignErr) return res.status(500).json({ error: 'Failed to update members' });
            res.json({ message: 'Event updated' });
        });
    });
};

exports.deleteEvent = (req, res) => {
    // No change needed here. ON DELETE CASCADE in the DB handles deleting assignees automatically.
    db.run("DELETE FROM project_events WHERE id = ?", [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: 'Delete failed' });
        res.json({ message: 'Event deleted' });
    });
};