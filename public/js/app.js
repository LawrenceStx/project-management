// public/js/app.js

document.addEventListener('DOMContentLoaded', async () => {
    const socket = io();
    
    // Application State
    const state = {
        user: null,         // Stores current user info
        projects: [],       // List of available projects
        currentProject: null // Currently selected project ID
    };

    // DOM Elements
    const projectSelect = document.getElementById('global-project-selector');
    const mainContent = document.getElementById('main-content');
    const projectDisplay = document.getElementById('current-project-display');
    const navLinks = document.querySelectorAll('.nav-link');

    // --- 1. INITIALIZATION ---

    // Check Auth Status & Load Initial Data
    try {
        const authRes = await fetch('/api/auth/status');
        const authData = await authRes.json();

        if (authData.authenticated) {
            state.user = authData.user;
            console.log('Logged in as:', state.user.username);
            
            // Adjust sidebar based on role (Hide Admin links for members)
            if(state.user.role_id !== 1) {
                document.querySelectorAll('[data-page="projects"], [data-page="accounts"]').forEach(el => {
                    el.closest('.nav-item').style.display = 'none';
                });
            }

            loadProjects();
        } else {
            window.location.href = '/login.html';
        }
    } catch (e) {
        console.error('Auth check failed', e);
    }

    // --- 2. PROJECT MANAGEMENT ---

    async function loadProjects() {
        try {
            const res = await fetch('/api/projects');
            const projects = await res.json();
            state.projects = projects;
            
            // Populate Dropdown
            projectSelect.innerHTML = '<option disabled selected>Select Project...</option>';
            
            projects.forEach(p => {
                const option = document.createElement('option');
                option.value = p.id;
                option.textContent = p.name;
                projectSelect.appendChild(option);
            });

            // Add "Create New" option for Admins
            if (state.user.role_id === 1) {
                const createOpt = document.createElement('option');
                createOpt.value = 'NEW_PROJECT_TRIGGER';
                createOpt.textContent = '+ Create New Project';
                createOpt.style.color = '#ffc107';
                createOpt.style.fontWeight = 'bold';
                projectSelect.appendChild(createOpt);
            }

            // Restore selection
            const savedProject = localStorage.getItem('currentProjectId');
            if (savedProject && projects.find(p => p.id == savedProject)) {
                projectSelect.value = savedProject;
                handleProjectChange(savedProject);
            } else {
                // If no project selected, ensure Dashboard updates with the project count
                // Check if we are currently ON the dashboard page
                if (document.querySelector('.nav-link[data-page="dashboard"]').classList.contains('active')) {
                    renderDashboard();
                }
            }

        } catch (e) {
            console.error('Failed to load projects', e);
        }
    }

    projectSelect.addEventListener('change', (e) => {
        const value = e.target.value;
        if (value === 'NEW_PROJECT_TRIGGER') {
            const modal = new bootstrap.Modal(document.getElementById('createProjectModal'));
            modal.show();
            // Reset dropdown
            projectSelect.value = state.currentProject || '';
        } else {
            handleProjectChange(value);
        }
    });

    function handleProjectChange(projectId) {
        state.currentProject = projectId;
        localStorage.setItem('currentProjectId', projectId);
        
        const project = state.projects.find(p => p.id == projectId);
        if (project) {
            projectDisplay.textContent = `Project: ${project.name}`;
            projectDisplay.classList.add('text-warning');
            projectDisplay.classList.remove('text-white-50');
            
            // Reload current view with new project context
            const activePage = document.querySelector('.nav-link.active').dataset.page;
            loadPage(activePage);
        }
    }

    // Handle Create Project Form
    document.getElementById('create-project-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = {
            name: document.getElementById('cp-name').value,
            description: document.getElementById('cp-desc').value,
            start_date: document.getElementById('cp-start').value,
            end_date: document.getElementById('cp-end').value
        };

        const res = await fetch('/api/projects', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        });

        if (res.ok) {
            bootstrap.Modal.getInstance(document.getElementById('createProjectModal')).hide();
            loadProjects(); // Reload list
            alert('Project created!');
        }
    });


    // --- 3. NAVIGATION & PAGE ROUTING ---

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            // Update UI Active State
            navLinks.forEach(n => n.classList.remove('active'));
            const targetLink = e.target.closest('.nav-link');
            targetLink.classList.add('active');

            const page = targetLink.dataset.page;
            loadPage(page);
        });
    });

    function loadPage(pageName) {
        // Clear Content
        mainContent.innerHTML = '';

        switch(pageName) {
            case 'dashboard':
                renderDashboard();
                break;
            case 'accounts':
                renderAccountsPage();
                break;
            case 'projects':
                renderProjectsList();
                break;
            case 'tasks':
                if (!state.currentProject) { showSelectProjectAlert(); return; }
                renderTasksPage();
                break;
            // --- NEW CASES ---
            case 'gantt':
                if (!state.currentProject) { showSelectProjectAlert(); return; }
                renderGanttPage();
                break;
            case 'members':
                if (!state.currentProject) { showSelectProjectAlert(); return; }
                renderMembersPage();
                break;
            // -----------------
            case 'logout':
                fetch('/api/auth/logout', {method: 'POST'}).then(() => window.location.href = '/login.html');
                break;
            default:
                mainContent.innerHTML = `<h3>Page not found</h3>`;
        }
    }
    
    function showSelectProjectAlert() {
        mainContent.innerHTML = `<div class="alert alert-warning">Please select a project from the sidebar to view this page.</div>`;
    }

    async function renderGanttPage() {
        const projectId = state.currentProject;
        mainContent.innerHTML = `
            <div class="d-flex justify-content-between align-items-center mb-4">
                <h2>Project Timeline</h2>
            </div>
            <div class="card p-3 border-secondary bg-dark" style="overflow-x: auto;">
                <div id="gantt-chart-wrapper" style="min-width: 800px; min-height: 400px; position: relative;">
                    <div class="text-center text-muted mt-5">Loading Timeline...</div>
                </div>
            </div>
        `;
        try {
            const [tasksRes, projectRes] = await Promise.all([
                fetch(`/api/projects/${projectId}/tasks`),
                fetch('/api/projects') 
            ]);
            const tasks = await tasksRes.json();
            const projects = await projectRes.json();
            const currentProject = projects.find(p => p.id == projectId);

            if (!tasks.length || !currentProject) {
                document.getElementById('gantt-chart-wrapper').innerHTML = '<div class="alert alert-info">No data available.</div>';
                return;
            }
            drawGanttChart(currentProject, tasks);
        } catch (e) { console.error(e); }
    }

    function drawGanttChart(project, tasks) {
        const wrapper = document.getElementById('gantt-chart-wrapper');
        wrapper.innerHTML = '';
        
        // Timeline Calculation
        const start = new Date(project.start_date);
        const end = new Date(project.end_date);
        const timelineStart = new Date(start); timelineStart.setDate(start.getDate() - 2);
        const timelineEnd = new Date(end); timelineEnd.setDate(end.getDate() + 5);
        const totalDays = Math.ceil((timelineEnd - timelineStart) / (1000 * 60 * 60 * 24));
        const dayWidth = 40; 
        
        // Header
        const headerRow = document.createElement('div');
        headerRow.style.cssText = `display: flex; height: 40px; border-bottom: 1px solid #555; margin-bottom: 10px;`;
        const spacer = document.createElement('div');
        spacer.style.cssText = "width: 200px; flex-shrink: 0; border-right: 1px solid #555; padding: 10px; font-weight: bold; color: #ffc107;";
        spacer.textContent = "Task Name";
        headerRow.appendChild(spacer);

        for(let i=0; i<totalDays; i++) {
            const d = new Date(timelineStart);
            d.setDate(timelineStart.getDate() + i);
            const cell = document.createElement('div');
            cell.style.cssText = `width: ${dayWidth}px; flex-shrink: 0; border-right: 1px solid #333; font-size: 10px; text-align: center; color: #888; padding-top: 5px;`;
            cell.textContent = `${d.getDate()}/${d.getMonth()+1}`;
            headerRow.appendChild(cell);
        }
        wrapper.appendChild(headerRow);

        // Rows
        tasks.forEach(task => {
            if(!task.due_date) return;
            const row = document.createElement('div');
            row.style.cssText = `display: flex; height: 45px; border-bottom: 1px solid #333; align-items: center; position: relative;`;
            
            const nameCol = document.createElement('div');
            nameCol.style.cssText = "width: 200px; flex-shrink: 0; border-right: 1px solid #555; padding: 0 10px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: #fff;";
            nameCol.textContent = task.name;
            row.appendChild(nameCol);

            const dueDate = new Date(task.due_date);
            const startDate = new Date(task.due_date); startDate.setDate(dueDate.getDate() - 3); 
            const daysFromStart = Math.ceil((startDate - timelineStart) / (1000 * 60 * 60 * 24));
            const duration = Math.max(1, Math.ceil((dueDate - startDate) / (1000 * 60 * 60 * 24)));
            
            const color = task.status === 'Done' ? '#198754' : (task.status === 'In Progress' ? '#ffc107' : '#6c757d');
            const textColor = task.status === 'In Progress' ? '#000' : '#fff';

            const bar = document.createElement('div');
            bar.style.cssText = `position: absolute; left: ${200 + (daysFromStart * dayWidth)}px; width: ${duration * dayWidth}px; height: 25px; background: ${color}; color: ${textColor}; border-radius: 4px; font-size: 11px; display: flex; align-items: center; justify-content: center; box-shadow: 2px 2px 5px rgba(0,0,0,0.5);`;
            bar.textContent = task.status;
            bar.title = `Due: ${task.due_date}`;
            row.appendChild(bar);
            wrapper.appendChild(row);
        });
    }

    // --- RENDER MEMBERS PAGE ---
    async function renderMembersPage() {
        const projectId = state.currentProject;
        mainContent.innerHTML = `
            <h2>Team Performance</h2>
            <div class="row" id="members-container"><div class="col-12 text-center mt-5">Loading...</div></div>
        `;
        try {
            const res = await fetch(`/api/projects/${projectId}/members/stats`);
            const members = await res.json();
            const container = document.getElementById('members-container');
            container.innerHTML = '';

            members.forEach(m => {
                const total = m.total_tasks || 0;
                const done = m.completed_tasks || 0;
                const rate = total === 0 ? 0 : Math.round((done / total) * 100);
                let statusColor = 'text-muted';
                let statusText = 'No Tasks';
                let border = 'border-secondary';

                if (total > 0) {
                    if (rate >= 80) { statusText = 'Excellent'; statusColor = 'text-success'; border = 'border-success'; }
                    else if (rate >= 50) { statusText = 'Good'; statusColor = 'text-warning'; border = 'border-warning'; }
                    else { statusText = 'Needs Improvement'; statusColor = 'text-danger'; border = 'border-danger'; }
                }

                container.innerHTML += `
                <div class="col-md-4 mb-3">
                    <div class="card h-100 ${border} border-top border-3 bg-dark">
                        <div class="card-body text-center">
                            <h5 class="card-title text-light">${m.username}</h5>
                            <span class="badge bg-secondary mb-3">${m.role_in_project || 'Member'}</span>
                            <div class="progress mb-2" style="height: 6px;">
                                <div class="progress-bar bg-warning" style="width: ${rate}%"></div>
                            </div>
                            <p class="${statusColor} fw-bold">${statusText} (${rate}%)</p>
                            <small class="text-muted">${done} / ${total} Tasks Completed</small>
                        </div>
                    </div>
                </div>`;
            });
        } catch (e) { console.error(e); }
    }

    // --- 4. PAGE RENDERERS ---

    function renderDashboard() {
        // If state.projects is not yet loaded, show 0
        const projectCount = state.projects ? state.projects.length : 0;
        const roleName = state.user.role_id === 1 ? 'Administrator' : 'Team Member';

        mainContent.innerHTML = `
            <h2 class="mb-4">Dashboard</h2>
            <div class="row">
                <div class="col-md-4">
                    <div class="card p-4 text-center border-warning">
                        <h1 class="text-warning display-4">${projectCount}</h1>
                        <p class="text-muted">Active Projects</p>
                    </div>
                </div>
                <div class="col-md-8">
                    <div class="card p-4">
                        <h5 class="text-white">Welcome, <span class="text-warning">${state.user.username}</span></h5>
                        <p class="text-white-50">Role: ${roleName}</p>
                        <hr class="border-secondary">
                        <p class="text-muted small">
                            Select a project from the sidebar dropdown to manage tasks, view timelines, and collaborate with your team.
                        </p>
                    </div>
                </div>
            </div>
        `;
    }

    async function renderAccountsPage() {
        // Only fetch if admin
        if (state.user.role_id !== 1) return;

        mainContent.innerHTML = `
            <div class="d-flex justify-content-between align-items-center mb-3">
                <h2>Manage Accounts</h2>
                <button class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#createUserModal">
                    <i class="bi bi-person-plus"></i> Add User
                </button>
            </div>
            <div class="card p-0 overflow-hidden">
                <table class="table table-dark table-hover mb-0">
                    <thead>
                        <tr>
                            <th>ID</th><th>Username</th><th>Email</th><th>Role</th><th>Status</th><th>Action</th>
                        </tr>
                    </thead>
                    <tbody id="users-table-body"><tr><td colspan="6">Loading...</td></tr></tbody>
                </table>
            </div>
        `;

        // Fetch Users
        const res = await fetch('/api/admin/users');
        const users = await res.json();
        
        const tbody = document.getElementById('users-table-body');
        tbody.innerHTML = '';
        
        users.forEach(u => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${u.id}</td>
                <td>${u.username}</td>
                <td>${u.email}</td>
                <td><span class="badge ${u.role === 'Admin' ? 'text-bg-warning' : 'text-bg-secondary'}">${u.role}</span></td>
                <td>${u.is_active ? '<span class="text-success">Active</span>' : '<span class="text-danger">Inactive</span>'}</td>
                <td>
                    <button class="btn btn-sm btn-outline-danger" onclick="deleteUser(${u.id})"><i class="bi bi-trash"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // Initialize User Creation Form logic
        const form = document.getElementById('create-user-form');
        // Remove old listeners to prevent duplicates (simple hack for SPA)
        const newForm = form.cloneNode(true);
        form.parentNode.replaceChild(newForm, form);
        
        newForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                username: document.getElementById('cu-username').value,
                email: document.getElementById('cu-email').value,
                password: document.getElementById('cu-password').value,
                role_id: document.getElementById('cu-role').value
            };
            
            await fetch('/api/admin/users', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload)
            });
            
            bootstrap.Modal.getInstance(document.getElementById('createUserModal')).hide();
            renderAccountsPage(); // Refresh table
        });
    }

    // Global filter state (add this near the top of app.js with other state)
    state.taskFilter = 'All'; 
    state.taskSort = 'Date';

    async function renderTasksPage() {
        const projectId = state.currentProject;
        
        // 1. Header with Filter & Sort Controls
        mainContent.innerHTML = `
            <div class="d-flex flex-wrap justify-content-between align-items-center mb-4 gap-3">
                <h2>Project Tasks</h2>
                
                <div class="d-flex gap-2">
                    <!-- Filter Dropdown -->
                    <select id="task-filter" class="form-select bg-dark text-light border-secondary" style="width: auto;">
                        <option value="All" ${state.taskFilter === 'All' ? 'selected' : ''}>All Status</option>
                        <option value="Todo" ${state.taskFilter === 'Todo' ? 'selected' : ''}>Todo</option>
                        <option value="In Progress" ${state.taskFilter === 'In Progress' ? 'selected' : ''}>In Progress</option>
                        <option value="Done" ${state.taskFilter === 'Done' ? 'selected' : ''}>Done</option>
                    </select>

                    <!-- Sort Dropdown -->
                    <select id="task-sort" class="form-select bg-dark text-light border-secondary" style="width: auto;">
                        <option value="Date" ${state.taskSort === 'Date' ? 'selected' : ''}>Sort by Date</option>
                        <option value="Name" ${state.taskSort === 'Name' ? 'selected' : ''}>Sort by Name</option>
                    </select>

                    <button class="btn btn-primary" onclick="openTaskModal()">
                        <i class="bi bi-plus-lg"></i> New Task
                    </button>
                </div>
            </div>
            
            <div class="row" id="task-container">
                <div class="col-12 text-center text-muted">Loading tasks...</div>
            </div>
        `;

        // Listeners for Filter/Sort
        document.getElementById('task-filter').addEventListener('change', (e) => {
            state.taskFilter = e.target.value;
            renderTasksPage(); // Re-render
        });
        document.getElementById('task-sort').addEventListener('change', (e) => {
            state.taskSort = e.target.value;
            renderTasksPage(); // Re-render
        });

        try {
            const res = await fetch(`/api/projects/${projectId}/tasks`);
            let tasks = await res.json();
            
            const container = document.getElementById('task-container');
            container.innerHTML = '';

            // 2. Client-Side Filtering
            if (state.taskFilter !== 'All') {
                tasks = tasks.filter(t => t.status === state.taskFilter);
            }

            // 3. Client-Side Sorting
            tasks.sort((a, b) => {
                if (state.taskSort === 'Date') {
                    return new Date(a.due_date) - new Date(b.due_date);
                } else {
                    return a.name.localeCompare(b.name);
                }
            });

            if (tasks.length === 0) {
                container.innerHTML = '<div class="col-12"><div class="alert alert-secondary">No tasks found matching your criteria.</div></div>';
                return;
            }

            // 4. Render Cards with DELETE button
            tasks.forEach(task => {
                const badgeClass = task.status === 'Done' ? 'bg-success' : (task.status === 'In Progress' ? 'bg-warning text-dark' : 'bg-secondary');
                
                const card = document.createElement('div');
                card.className = 'col-md-4 mb-3 fade-in'; // Added animation class logic if you have CSS for it
                card.innerHTML = `
                    <div class="card h-100 border-start border-4 ${task.status === 'Done' ? 'border-success' : 'border-warning'}">
                        <div class="card-body position-relative">
                            
                            <!-- DELETE BUTTON (Top Right) -->
                            <button class="btn btn-sm btn-link text-danger position-absolute top-0 end-0 m-2" 
                                onclick="deleteTask(${task.id})" title="Delete Task">
                                <i class="bi bi-trash-fill"></i>
                            </button>

                            <div class="d-flex justify-content-between mb-2 me-4">
                                <span class="badge ${badgeClass}">${task.status}</span>
                            </div>
                            
                            <h5 class="card-title text-light">${task.name}</h5>
                            <small class="text-muted d-block mb-2"><i class="bi bi-calendar"></i> ${task.due_date || 'No Date'}</small>
                            <p class="card-text text-white-50 small">${task.description || ''}</p>
                            
                            <div class="d-flex justify-content-between align-items-end mt-3 border-top border-secondary pt-2">
                                <small class="text-warning text-truncate" style="max-width: 120px;">
                                    <i class="bi bi-person-circle"></i> ${task.assigned_to_name || 'Unassigned'}
                                </small>
                                <select class="form-select form-select-sm bg-dark text-light border-secondary w-auto" onchange="updateTaskStatus(${task.id}, this.value)">
                                    <option value="Todo" ${task.status === 'Todo' ? 'selected' : ''}>Todo</option>
                                    <option value="In Progress" ${task.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
                                    <option value="Done" ${task.status === 'Done' ? 'selected' : ''}>Done</option>
                                </select>
                            </div>
                        </div>
                    </div>
                `;
                container.appendChild(card);
            });
        } catch (e) {
            console.error(e);
        }
    }

    // Add this Helper Function to app.js
    window.deleteTask = async (id) => {
        if(!confirm("Are you sure you want to permanently delete this task?")) return;
        
        try {
            const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
            if (!res.ok) alert("Failed to delete task");
            // Socket will handle the UI refresh, or we can force it:
            // renderTasksPage();
        } catch(e) {
            console.error(e);
        }
    };

    // --- RENDER PROJECTS LIST (Admin View) ---
    async function renderProjectsList() {
        if (state.user.role_id !== 1) return;

        mainContent.innerHTML = `
            <div class="d-flex justify-content-between align-items-center mb-3">
                <h2>All Projects</h2>
                <button class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#createProjectModal">
                    <i class="bi bi-folder-plus"></i> New Project
                </button>
            </div>
            <div class="table-responsive">
                <table class="table table-dark table-hover align-middle">
                    <thead>
                        <tr>
                            <th>ID</th><th>Project Name</th><th>Status</th><th>Start Date</th><th>End Date</th><th>Creator</th><th>Action</th>
                        </tr>
                    </thead>
                    <tbody id="projects-table-body"><tr><td colspan="7">Loading...</td></tr></tbody>
                </table>
            </div>
        `;

        const res = await fetch('/api/projects');
        const projects = await res.json();
        
        const tbody = document.getElementById('projects-table-body');
        tbody.innerHTML = '';

        if (projects.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No projects found.</td></tr>';
            return;
        }
        
        projects.forEach(p => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${p.id}</td>
                <td class="fw-bold text-warning">${p.name}</td>
                <td><span class="badge ${p.status === 'Completed' ? 'bg-success' : 'bg-secondary'}">${p.status}</span></td>
                <td>${p.start_date}</td>
                <td>${p.end_date}</td>
                <td>${p.created_by_name || 'System'}</td>
                <td>
                    <button class="btn btn-sm btn-outline-info" onclick="handleProjectChange(${p.id})">Select</button>
                    <!-- Edit/Delete buttons could go here -->
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    window.openTaskModal = async () => {
        // Fetch project members to populate the dropdown
        // Note: For simplicity, we are fetching all users. 
        // Ideally, create an endpoint /api/projects/:id/members
        const res = await fetch('/api/admin/users'); 
        const users = await res.json();
        
        const select = document.getElementById('ct-assignee');
        select.innerHTML = '<option value="">Unassigned</option>';
        users.forEach(u => {
            select.innerHTML += `<option value="${u.id}">${u.username}</option>`;
        });

        const modal = new bootstrap.Modal(document.getElementById('createTaskModal'));
        modal.show();
    };

    window.updateTaskStatus = async (taskId, newStatus) => {
        await fetch(`/api/tasks/${taskId}/status`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ status: newStatus })
        });
        // UI update handled by socket
    };

    // Handle Task Creation
    document.getElementById('create-task-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
            project_id: state.currentProject,
            name: document.getElementById('ct-name').value,
            description: document.getElementById('ct-desc').value,
            due_date: document.getElementById('ct-due').value,
            assigned_to_id: document.getElementById('ct-assignee').value || null
        };

        const res = await fetch('/api/tasks', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });

        if(res.ok) {
            bootstrap.Modal.getInstance(document.getElementById('createTaskModal')).hide();
            document.getElementById('create-task-form').reset();
        }
    });

    // --- SOCKET UPDATES ---
    socket.on('task:update', (data) => {
        // If we are viewing the project that was updated, refresh the list
        if (state.currentProject == data.projectId && document.querySelector('.nav-link[data-page="tasks"]').classList.contains('active')) {
            renderTasksPage();
        }
    });

    // Make deleteUser globally accessible
    window.deleteUser = async (id) => {
        if(confirm('Are you sure you want to delete this user?')) {
            await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
            renderAccountsPage();
        }
    };
    
    // --- 5. SOCKET LISTENERS ---
    socket.on('project:new', (data) => {
        console.log('New project created:', data);
        loadProjects(); // Refresh dropdown
    });

});