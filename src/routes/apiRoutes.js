// src/routes/apiRoutes.js
const express = require('express');
const router = express.Router();
const { isAuthenticated, isAdmin } = require('../middleware/authMiddleware');
const userController = require('../controllers/userController');
const projectController = require('../controllers/projectController');
const taskController = require('../controllers/taskController');
const announcementController = require('../controllers/announcementController');
const ganttController = require('../controllers/ganttController');
const logController = require('../controllers/logController');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure upload directories exist
const uploadDir = path.join(__dirname, '../../public/uploads');
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir, { recursive: true });
}

// 1. Storage for DB Restore (Existing)
const storageRestore = multer.diskStorage({
    destination: function (req, file, cb) { cb(null, 'data/') },
    filename: function (req, file, cb) { cb(null, 'apex_restore.db') }
});
const uploadRestore = multer({ storage: storageRestore });

// 2. Storage for Task Attachments (NEW)
const storageTasks = multer.diskStorage({
    destination: function (req, file, cb) { 
        cb(null, 'public/uploads/') 
    },
    filename: function (req, file, cb) {
        // Unique filename: timestamp-originalName
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

// Filter to allow Docs and PDF
const fileFilter = (req, file, cb) => {
    const allowed = [
        'application/pdf', 
        'application/msword', 
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    if (allowed.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(null, false); // Reject file
    }
};

const uploadTask = multer({ 
    storage: storageTasks, 
    fileFilter: fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Configure Upload Storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'data/') // Save to data folder
    },
    filename: function (req, file, cb) {
        // We temporarily save it as 'apex_restore.db'
        cb(null, 'apex_restore.db') 
    }
});
const upload = multer({ storage: storage });

// All routes defined in this file require authentication
router.use(isAuthenticated); 



// --- USER (ACCOUNT) Management (ADMIN ONLY) ---
router.route('/admin/users')
    .get(isAdmin, userController.getAllUsers)
    .post(isAdmin, userController.createUser);
router.get('/admin/backup', isAdmin, userController.downloadBackup);
// [ADMIN] Restore Database
router.post('/admin/restore', isAdmin, upload.single('database'), (req, res) => {
    const dbPath = path.join(__dirname, '../../data/apex.db');
    const restorePath = path.join(__dirname, '../../data/apex_restore.db');

    // 1. Close the current DB connection (Safe measure)
    const db = require('../db/database');
    db.close((err) => {
        if (err) console.error("Error closing DB:", err);

        // 2. Overwrite the old DB with the new one
        try {
            fs.copyFileSync(restorePath, dbPath);
            fs.unlinkSync(restorePath); // Delete temp file
            
            // 3. Send success and exit process (Node managers like pm2/nodemon will restart it)
            // If running manually, user needs to restart node.
            res.json({ message: "Database restored! The server will now restart." });
            
            setTimeout(() => {
                process.exit(1); // Force restart to reload DB connection
            }, 1000);

        } catch (error) {
            console.error(error);
            res.status(500).json({ error: "Failed to restore database file." });
        }
    });
});

router.route('/admin/users/:id')
    .put(isAdmin, userController.updateUser)
    .delete(isAdmin, userController.deleteUser);
router.get('/projects/:projectId/members/stats', userController.getMemberStats);
router.put('/users/password', userController.changePassword);
router.put('/admin/users/:id', isAdmin, userController.updateUser);

router.get('/dashboard/stats', userController.getDashboardStats);


// --- PROJECT Management (Mostly ADMIN, GET is AUTH) ---

router.get('/projects', projectController.getAllProjects);
router.post('/projects', isAdmin, projectController.createProject);
router.put('/projects/:id', isAdmin, projectController.updateProject);

// ==================================================================
// FIXED: Project Deletion Logic
// The old code was too simple and failed if a project had roadmap events.
// This new code ensures all related data is deleted safely within a transaction.
// ==================================================================
router.delete('/projects/:id', isAdmin, (req, res) => {
    const db = require('../db/database');
    const projectId = req.params.id;

    db.serialize(() => {
        db.run("BEGIN TRANSACTION;");

        // Step 1: Delete from tables that DON'T have "ON DELETE CASCADE" in the schema.
        // This prevents foreign key constraint errors. For us, that's 'project_events'.
        db.run("DELETE FROM project_events WHERE project_id = ?", [projectId]);

        // Step 2: Delete the main project. The database will automatically delete related
        // tasks, members, and logs because they are set up with "ON DELETE CASCADE".
        db.run("DELETE FROM projects WHERE id = ?", [projectId], function(err) {
            if (err) {
                db.run("ROLLBACK;"); // Undo changes if an error occurs
                console.error("Error deleting project:", err.message);
                return res.status(500).json({ error: "Database error during project deletion." });
            }

            if (this.changes > 0) {
                // Success: The project was found and deleted.
                db.run("COMMIT;", (commitErr) => {
                    if (commitErr) {
                         console.error("Error committing transaction:", commitErr.message);
                         return res.status(500).json({ error: "Failed to finalize project deletion." });
                    }
                    // Notify all connected clients that a project was removed
                    req.io.emit('project:delete', { projectId });
                    res.json({ message: "Project and all related data deleted successfully." });
                });
            } else {
                // The project ID was not found.
                db.run("ROLLBACK;");
                res.status(404).json({ error: "Project not found." });
            }
        });
    });
});
// ==================================================================

router.put('/projects/:projectId/members', isAdmin, projectController.manageProjectMembers);



// --- DASHBOARD/CORE API (Placeholder) ---
router.get('/dashboard', (req, res) => {
    // Basic authenticated endpoint check
    res.json({ message: `Welcome ${req.user.username}! Your role ID is ${req.user.role_id}.` });
});

router.get('/announcements', announcementController.getAnnouncements);
router.post('/announcements', isAdmin, announcementController.createAnnouncement);
router.delete('/announcements/:id', isAdmin, announcementController.deleteAnnouncement);


router.delete('/tasks/:id', taskController.deleteTask);
router.get('/projects/:projectId/tasks', taskController.getProjectTasks);
router.post('/tasks', uploadTask.single('attachment'), taskController.createTask);
router.put('/tasks/:id', isAdmin, uploadTask.single('attachment'), taskController.updateTaskDetails); 
router.put('/tasks/:id/status', taskController.updateTaskStatus);


// --- GANTT EVENTS (New Module) ---
router.get('/projects/:projectId/events', ganttController.getEvents);
router.post('/events', isAdmin, ganttController.createEvent);
router.put('/events/:id', isAdmin, ganttController.updateEvent);
router.delete('/events/:id', isAdmin, ganttController.deleteEvent);

router.get('/projects/:projectId/logs', logController.getLogs);
router.post('/logs', logController.createLog);
router.put('/logs/:id', logController.updateLog);
router.delete('/logs/:id', logController.deleteLog);

module.exports = router;