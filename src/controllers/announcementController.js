const db = require('../db/database');

exports.getAnnouncements = (req, res) => {
    const query = `
        SELECT a.*, u.username as author 
        FROM announcements a
        JOIN users u ON a.created_by = u.id
        ORDER BY a.created_at DESC
    `;
    db.all(query, [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Database error.' });
        res.json(rows);
    });
};

exports.createAnnouncement = (req, res) => {
    const { title, message } = req.body;
    const userId = req.session.user.id;

    if (!title || !message) return res.status(400).json({ error: 'Missing fields.' });

    const stmt = db.prepare("INSERT INTO announcements (title, message, created_by) VALUES (?, ?, ?)");
    stmt.run(title, message, userId, function(err) {
        if (err) return res.status(500).json({ error: 'Failed to post.' });
        
        const newAnnouncement = {
            id: this.lastID,
            title,
            message,
            author: req.session.user.username,
            created_at: new Date().toISOString()
        };

        // Broadcast to ALL connected clients
        req.io.emit('announcement:new', newAnnouncement);

        res.status(201).json(newAnnouncement);
    });
    stmt.finalize();
};

exports.deleteAnnouncement = (req, res) => {
    const { id } = req.params;
    
    db.run("DELETE FROM announcements WHERE id = ?", [id], function(err) {
        if (err) return res.status(500).json({ error: 'Database error.' });
        
        // Notify all clients to remove this ID from DOM
        req.io.emit('announcement:delete', { id });
        
        res.json({ message: 'Announcement deleted.' });
    });
};