// src/routes/apiRoutes.js
const express = require('express');
const router = express.Router();
const { isAuthenticated, isAdmin } = require('../middleware/authMiddleware');
const userController = require('../controllers/userController');
const projectController = require('../controllers/projectController');
const taskController = require('../controllers/taskController');
const announcementController = require('../controllers/announcementController');
const ganttController = require('../controllers/ganttController');

// All routes defined in this file require authentication
router.use(isAuthenticated); 



// --- USER (ACCOUNT) Management (ADMIN ONLY) ---
router.route('/admin/users')
    .get(isAdmin, userController.getAllUsers)
    .post(isAdmin, userController.createUser);

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

// ADD THIS LINE:
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

module.exports = router;