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
router.delete('/projects/:id', isAdmin, (req, res) => {
    // Quick inline controller for delete to save file space, or move to controller
    const db = require('../db/database');
    db.run("DELETE FROM projects WHERE id = ?", [req.params.id], (err) => {
        if(err) return res.status(500).json({error: "DB Error"});
        res.json({message: "Project deleted"});
    });
});
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
router.post('/tasks', taskController.createTask);
router.put('/tasks/:id', isAdmin, taskController.updateTaskDetails); // Full edit for Admin
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