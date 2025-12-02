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


// --- PROJECT Management (Mostly ADMIN, GET is AUTH) ---

// Get all projects the user can see
router.get('/projects', projectController.getAllProjects); 
// Create a new project (Admin only)
router.post('/projects', isAdmin, projectController.createProject); 

router.route('/projects/:id')
    .put(isAdmin, projectController.updateProject); 
    // Delete project route could be added here (isAdmin)

// Project Members Management (Admin only)
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
router.put('/tasks/:id/status', isAdmin, taskController.updateTaskStatus); 


// --- GANTT EVENTS (New Module) ---
router.get('/projects/:projectId/events', ganttController.getEvents);
router.post('/events', isAdmin, ganttController.createEvent);
router.put('/events/:id', isAdmin, ganttController.updateEvent);
router.delete('/events/:id', isAdmin, ganttController.deleteEvent);

module.exports = router;