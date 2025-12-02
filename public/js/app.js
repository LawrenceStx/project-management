// public/js/app.js

// --- Global Modal Helpers (Vanilla JS) ---
window.openModal = (id) => {
    const el = document.getElementById(id);
    if(el) el.classList.add('open');
};

window.closeModal = (id) => {
    const el = document.getElementById(id);
    if(el) el.classList.remove('open');
};

document.addEventListener('DOMContentLoaded', async () => {
    const socket = io();
    
    // Application State
    const state = {
        user: null,
        projects: [],
        currentProject: null,
        taskFilter: 'All',
        taskSort: 'Date'
    };

    // DOM Elements
    const projectSelect = document.getElementById('global-project-selector');
    const mainContent = document.getElementById('main-content');
    const projectDisplay = document.getElementById('current-project-display');
    const userDisplay = document.getElementById('user-display');
    const navLinks = document.querySelectorAll('.nav-link');

    // ==========================================
    // 1. INITIALIZATION & AUTH
    // ==========================================

    try {
        const authRes = await fetch('/api/auth/status');
        const authData = await authRes.json();

        if (authData.authenticated) {
            state.user = authData.user;
            userDisplay.textContent = `${state.user.username} (${state.user.role_id === 1 ? 'Admin' : 'Member'})`;
            
            // Sidebar: Hide Admin links for standard members
            if(state.user.role_id !== 1) {
                document.querySelectorAll('[data-page="projects"], [data-page="accounts"]').forEach(el => {
                    if(el.closest('.nav-item')) el.closest('.nav-item').style.display = 'none';
                });
            }
            loadProjects();
        } else {
            window.location.href = '/login.html';
        }
    } catch (e) {
        console.error('Auth check failed', e);
    }

    // ==========================================
    // 2. PROJECT MANAGEMENT
    // ==========================================

    async function loadProjects() {
        try {
            const res = await fetch('/api/projects');
            const projects = await res.json();
            state.projects = projects;
            
            projectSelect.innerHTML = '<option disabled selected>Select Project...</option>';
            
            projects.forEach(p => {
                const option = document.createElement('option');
                option.value = p.id;
                option.textContent = p.name;
                projectSelect.appendChild(option);
            });

            // Admin "Create New" option
            if (state.user.role_id === 1) {
                const createOpt = document.createElement('option');
                createOpt.value = 'NEW_PROJECT_TRIGGER';
                createOpt.textContent = '+ Create New Project';
                createOpt.style.fontWeight = 'bold';
                projectSelect.appendChild(createOpt);
            }

            // Restore selection
            const savedProject = localStorage.getItem('currentProjectId');
            if (savedProject && projects.find(p => p.id == savedProject)) {
                projectSelect.value = savedProject;
                handleProjectChange(savedProject);
            } else {
                // Default to Dashboard if no project selected
                if (document.querySelector('.nav-link.active') && document.querySelector('.nav-link.active').dataset.page === 'dashboard') {
                    renderDashboard();
                }
            }
        } catch (e) { console.error(e); }
    }

    projectSelect.addEventListener('change', (e) => {
        const value = e.target.value;
        if (value === 'NEW_PROJECT_TRIGGER') {
            openModal('createProjectModal'); 
            projectSelect.value = state.currentProject || '';
        } else {
            handleProjectChange(value);
        }
    });

    window.handleProjectChange = function(projectId) {
        state.currentProject = projectId;
        localStorage.setItem('currentProjectId', projectId);
        
        const project = state.projects.find(p => p.id == projectId);
        if (project) {
            projectDisplay.textContent = `Project: ${project.name}`;
            const activePage = document.querySelector('.nav-link.active').dataset.page;
            loadPage(activePage);
        }
    };

    // ==========================================
    // 3. NAVIGATION ROUTER
    // ==========================================

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            navLinks.forEach(n => n.classList.remove('active'));
            const targetLink = e.target.closest('.nav-link');
            targetLink.classList.add('active');
            loadPage(targetLink.dataset.page);
        });
    });

    function loadPage(pageName) {
        mainContent.innerHTML = '';
        switch(pageName) {
            case 'dashboard': renderDashboard(); break;
            case 'accounts': renderAccountsPage(); break;
            case 'projects': renderProjectsList(); break;
            case 'tasks': 
                if (!state.currentProject) { showSelectProjectAlert(); return; }
                renderTasksPage(); 
                break;
            case 'gantt':
                if (!state.currentProject) { showSelectProjectAlert(); return; }
                renderGanttPage(); 
                break;
            case 'members':
                if (!state.currentProject) { showSelectProjectAlert(); return; }
                renderMembersPage();
                break;
            case 'settings': renderSettingsPage(); break;
            case 'announcements': renderAnnouncementsPage(); break;
            case 'logout':
                fetch('/api/auth/logout', {method: 'POST'}).then(() => window.location.href = '/login.html');
                break;
            default: mainContent.innerHTML = `<h3>Page not found</h3>`;
        }
    }
    
    function showSelectProjectAlert() {
        mainContent.innerHTML = `<div style="padding: 20px; background: #fff3cd; color: #856404; border-radius: 8px;">Please select a project from the sidebar to view this page.</div>`;
    }

    // ==========================================
    // 4. GANTT CHART (EVENTS MODULE)
    // ==========================================
    
    async function renderGanttPage() {
        const isAdmin = state.user.role_id === 1;

        mainContent.innerHTML = `
            <div class="flex-between mb-2">
                <h2>Project Roadmap</h2>
                ${isAdmin ? `<button class="btn btn-primary" onclick="openNewEventModal()">+ Add Event</button>` : ''}
            </div>
            <div class="card" style="overflow-x: auto; position: relative; min-height: 400px;" id="gantt-container">
                <div class="text-center mt-2">Loading Timeline...</div>
            </div>
        `;

        try {
            const res = await fetch(`/api/projects/${state.currentProject}/events`);
            const events = await res.json();
            drawGanttEvents(events);
        } catch (e) { console.error(e); }
    }

    function drawGanttEvents(events) {
        const container = document.getElementById('gantt-container');
        container.innerHTML = '';
        
        if(events.length === 0) { 
            container.innerHTML = '<div class="text-center" style="padding:50px; color: #777;">No events scheduled.</div>'; 
            return; 
        }

        // Calculate Range
        const dates = events.map(e => [new Date(e.start_date), new Date(e.end_date)]).flat();
        let minDate = new Date(Math.min.apply(null, dates));
        let maxDate = new Date(Math.max.apply(null, dates));
        
        // Pad dates
        minDate.setDate(minDate.getDate() - 5);
        maxDate.setDate(maxDate.getDate() + 10);
        
        const totalDays = (maxDate - minDate) / (1000 * 60 * 60 * 24);
        const pxPerDay = 40; 
        
        // Draw Header
        const header = document.createElement('div');
        header.style.display = 'flex';
        header.style.borderBottom = '1px solid #eee';
        header.style.marginBottom = '20px';
        
        for(let i=0; i <= totalDays; i++) {
            const d = new Date(minDate);
            d.setDate(d.getDate() + i);
            const cell = document.createElement('div');
            cell.style.minWidth = `${pxPerDay}px`;
            cell.style.fontSize = '10px';
            cell.style.color = '#777';
            cell.style.borderRight = '1px solid #f0f0f0';
            cell.innerText = `${d.getDate()}/${d.getMonth()+1}`;
            header.appendChild(cell);
        }
        container.appendChild(header);

        // Draw Events
        events.forEach(ev => {
            const row = document.createElement('div');
            row.style.position = 'relative';
            row.style.height = '40px';
            row.style.marginBottom = '10px';

            const start = new Date(ev.start_date);
            const end = new Date(ev.end_date);
            const duration = (end - start) / (1000 * 60 * 60 * 24) + 1;
            const offset = (start - minDate) / (1000 * 60 * 60 * 24);

            const bar = document.createElement('div');
            bar.innerText = ev.name;
            bar.style.position = 'absolute';
            bar.style.left = `${offset * pxPerDay}px`;
            bar.style.width = `${duration * pxPerDay}px`;
            bar.style.height = '30px';
            bar.style.backgroundColor = ev.color;
            bar.style.borderRadius = '4px';
            bar.style.padding = '5px 10px';
            bar.style.fontSize = '12px';
            bar.style.color = '#000'; 
            bar.style.whiteSpace = 'nowrap';
            bar.style.overflow = 'hidden';
            bar.style.cursor = 'pointer';
            bar.style.boxShadow = '2px 2px 5px rgba(0,0,0,0.1)';
            
            // Interaction: Click to Edit
            bar.onclick = () => openEditEventModal(ev);

            row.appendChild(bar);
            container.appendChild(row);
        });
    }

    // Gantt Modals Exposed to Window
    window.openNewEventModal = () => {
        document.getElementById('event-form').reset();
        document.getElementById('ev-id').value = ''; 
        const delBtn = document.getElementById('btn-delete-event');
        if(delBtn) delBtn.classList.add('hidden');
        openModal('eventModal');
    };

    window.openEditEventModal = (ev) => {
        document.getElementById('ev-id').value = ev.id;
        document.getElementById('ev-name').value = ev.name;
        document.getElementById('ev-start').value = ev.start_date;
        document.getElementById('ev-end').value = ev.end_date;
        document.getElementById('ev-color').value = ev.color;
        
        const delBtn = document.getElementById('btn-delete-event');
        if(state.user.role_id === 1) {
            if(delBtn) delBtn.classList.remove('hidden');
        } else {
            if(delBtn) delBtn.classList.add('hidden');
        }
        openModal('eventModal');
    };

    // Gantt Form Submit
    const eventForm = document.getElementById('event-form');
    if(eventForm) {
        eventForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('ev-id').value;
            const payload = {
                project_id: state.currentProject,
                name: document.getElementById('ev-name').value,
                start_date: document.getElementById('ev-start').value,
                end_date: document.getElementById('ev-end').value,
                color: document.getElementById('ev-color').value
            };
    
            const method = id ? 'PUT' : 'POST';
            const url = id ? `/api/events/${id}` : '/api/events';
    
            await fetch(url, {
                method: method,
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload)
            });
    
            closeModal('eventModal');
            renderGanttPage();
        });
    }

    window.deleteEvent = async () => {
        const id = document.getElementById('ev-id').value;
        if(confirm("Delete this event?")) {
            await fetch(`/api/events/${id}`, { method: 'DELETE' });
            closeModal('eventModal');
            renderGanttPage();
        }
    };


    // ==========================================
    // 5. TASKS PAGE (Admin Status Only)
    // ==========================================
    
    async function renderTasksPage() {
        const projectId = state.currentProject;
        
        mainContent.innerHTML = `
            <div class="flex-between mb-2">
                <h2>Project Tasks</h2>
                <div style="display:flex; gap:10px;">
                     <select id="task-filter">
                        <option value="All">All Status</option>
                        <option value="Todo">Todo</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Done">Done</option>
                    </select>
                    <button class="btn btn-primary" onclick="openCreateTaskModal()">+ New Task</button>
                </div>
            </div>
            
            <div id="task-container" class="grid-3">
                <div class="text-center" style="grid-column: 1/-1">Loading tasks...</div>
            </div>
        `;

        document.getElementById('task-filter').addEventListener('change', (e) => {
            state.taskFilter = e.target.value;
            renderTasksPage();
        });

        try {
            const res = await fetch(`/api/projects/${projectId}/tasks`);
            let tasks = await res.json();
            const container = document.getElementById('task-container');
            container.innerHTML = '';

            if (state.taskFilter !== 'All') {
                tasks = tasks.filter(t => t.status === state.taskFilter);
            }

            if (tasks.length === 0) {
                container.innerHTML = '<div style="grid-column: 1/-1; padding: 20px; background: #eee; border-radius: 8px;">No tasks found.</div>';
                return;
            }

            tasks.forEach(task => {
                const isAdmin = state.user.role_id === 1;
                // REQUIREMENT: Admin only can change status
                const disabledAttr = isAdmin ? '' : 'disabled';
                
                const card = document.createElement('div');
                card.className = 'card';
                card.style.borderLeft = `4px solid ${task.status === 'Done' ? 'var(--success)' : 'var(--primary)'}`;
                
                card.innerHTML = `
                    <div class="flex-between">
                        <strong>${task.status}</strong>
                        ${isAdmin ? `<button class="btn btn-outline" style="color:red; border:none;" onclick="deleteTask(${task.id})">🗑️</button>` : ''}
                    </div>
                    <h4 class="mt-2">${task.name}</h4>
                    <p class="mb-2" style="font-size:0.9rem; color:var(--text-muted)">${task.description || ''}</p>
                    <div style="font-size:0.8rem; margin-bottom:10px;">📅 ${task.due_date || 'N/A'}</div>
                    
                    <div class="flex-between" style="border-top:1px solid #eee; padding-top:10px; margin-top:10px;">
                         <span style="font-size:0.8rem;">👤 ${task.assigned_to_name || 'Unassigned'}</span>
                         
                         <select style="width:auto; margin:0; padding:5px;" ${disabledAttr} onchange="updateTaskStatus(${task.id}, this.value)">
                            <option value="Todo" ${task.status === 'Todo' ? 'selected' : ''}>Todo</option>
                            <option value="In Progress" ${task.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
                            <option value="Done" ${task.status === 'Done' ? 'selected' : ''}>Done</option>
                        </select>
                    </div>
                `;
                container.appendChild(card);
            });
        } catch (e) { console.error(e); }
    }

    // Helper to populate user list in Modal
    window.openCreateTaskModal = async () => {
        // Fetch all users to populate assignee list
        const res = await fetch('/api/admin/users');
        const users = await res.json();
        const select = document.getElementById('ct-assignee');
        if(select) {
            select.innerHTML = '<option value="">Unassigned</option>';
            users.forEach(u => {
                const opt = document.createElement('option');
                opt.value = u.id;
                opt.textContent = u.username;
                select.appendChild(opt);
            });
        }
        openModal('createTaskModal');
    };

    window.updateTaskStatus = async (taskId, newStatus) => {
        await fetch(`/api/tasks/${taskId}/status`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ status: newStatus })
        });
        // Socket update handles UI
    };

    window.deleteTask = async (id) => {
        if(!confirm("Delete this task?")) return;
        await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
    };

    // ==========================================
    // 6. MEMBERS & OTHER PAGES
    // ==========================================

    async function renderMembersPage() {
        const projectId = state.currentProject;
        const isAdmin = state.user.role_id === 1;

        mainContent.innerHTML = `
            <div class="flex-between mb-2">
                <h2>Team</h2>
                ${isAdmin ? `<button class="btn btn-primary" onclick="openManageMembersModal()">Manage Team</button>` : ''}
            </div>
            <div id="members-container" class="grid-3">Loading...</div>
        `;

        const res = await fetch(`/api/projects/${projectId}/members/stats`);
        const members = await res.json();
        const container = document.getElementById('members-container');
        container.innerHTML = '';

        if(members.length === 0) { container.innerHTML = 'No members assigned.'; return; }

        members.forEach(m => {
            const total = m.total_tasks || 0;
            const done = m.completed_tasks || 0;
            const rate = total === 0 ? 0 : Math.round((done / total) * 100);

            const card = document.createElement('div');
            card.className = 'card text-center';
            card.innerHTML = `
                <img src="https://ui-avatars.com/api/?name=${m.username}&background=random" style="border-radius:50%; width:50px; margin-bottom:10px;">
                <h3>${m.username}</h3>
                <span style="background:#eee; padding:2px 8px; border-radius:4px; font-size:0.8rem;">${m.role_in_project || 'Member'}</span>
                <div style="margin-top:15px; background:#eee; height:6px; border-radius:3px; overflow:hidden;">
                    <div style="width:${rate}%; background:var(--primary); height:100%;"></div>
                </div>
                <div class="flex-between mt-2" style="font-size:0.8rem;">
                    <span>Success Rate</span>
                    <strong>${rate}%</strong>
                </div>
            `;
            container.appendChild(card);
        });
    }

    async function renderAnnouncementsPage() {
        const isAdmin = state.user.role_id === 1;

        mainContent.innerHTML = `
            <div class="flex-between mb-2">
                <h2>Announcements</h2>
                ${isAdmin ? `<button class="btn btn-primary" onclick="document.getElementById('announce-form-box').classList.toggle('hidden')">Post New</button>` : ''}
            </div>

            <div id="announce-form-box" class="card hidden mb-2">
                <form id="post-announcement-form">
                    <label>Title</label>
                    <input type="text" id="ann-title" required>
                    <label>Message</label>
                    <textarea id="ann-message" required></textarea>
                    <button type="submit" class="btn btn-primary mt-2">Broadcast</button>
                </form>
            </div>

            <div id="announcement-feed" style="display:flex; flex-direction:column; gap:15px;">Loading...</div>
        `;

        if(isAdmin) {
            // Attach listener dynamically
            setTimeout(() => {
                const form = document.getElementById('post-announcement-form');
                if(form) form.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    await fetch('/api/announcements', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({
                            title: document.getElementById('ann-title').value,
                            message: document.getElementById('ann-message').value
                        })
                    });
                    e.target.reset();
                    document.getElementById('announce-form-box').classList.add('hidden');
                });
            }, 0);
        }

        const res = await fetch('/api/announcements');
        const data = await res.json();
        const feed = document.getElementById('announcement-feed');
        feed.innerHTML = '';
        if(data.length === 0) feed.innerHTML = 'No announcements.';
        
        data.forEach(item => renderAnnouncementItem(item, isAdmin));
    }

    function renderAnnouncementItem(item, isAdmin) {
        const feed = document.getElementById('announcement-feed');
        if (!feed) return; 

        // Remove "No announcements" text if present
        if (feed.innerText === 'No announcements.') feed.innerHTML = '';

        const el = document.createElement('div');
        el.className = 'card fade-in';
        el.id = `ann-${item.id}`; // ID for DOM removal
        el.style.borderLeft = '4px solid var(--primary)';
        
        el.innerHTML = `
            <div class="flex-between">
                <h3>${item.title}</h3>
                <div style="display:flex; align-items:center; gap:10px;">
                    <small>${new Date(item.created_at).toLocaleDateString()}</small>
                    ${isAdmin ? `<button class="btn btn-danger" style="padding:2px 8px; font-size:0.8rem;" onclick="deleteAnnouncement(${item.id})">X</button>` : ''}
                </div>
            </div>
            <p class="mt-2">${item.message}</p>
            <div class="mt-2" style="font-size:0.8rem; color:#777;">Posted by ${item.author}</div>
        `;
        // Prepend so newest is top
        feed.prepend(el);
    }

    window.deleteAnnouncement = async (id) => {
        if(!confirm("Remove this announcement?")) return;
        await fetch(`/api/announcements/${id}`, { method: 'DELETE' });
        // UI removal handled by socket below
    };

    // Socket Listener for Deletion
    socket.on('announcement:delete', (data) => {
        const el = document.getElementById(`ann-${data.id}`);
        if (el) el.remove();
        
        // If empty, show message
        const feed = document.getElementById('announcement-feed');
        if (feed && feed.children.length === 0) feed.innerHTML = 'No announcements.';
    });

    // Update the 'new' listener to use the helper too
    socket.on('announcement:new', (data) => {
         if (document.querySelector('.nav-link[data-page="announcements"]').classList.contains('active')) {
             // We can determine if user is admin from state
             const isAdmin = state.user && state.user.role_id === 1;
             renderAnnouncementItem(data, isAdmin);
         } else {
             // Optional Notification
         }
    });

    async function renderAccountsPage() {
        if (state.user.role_id !== 1) return;
        mainContent.innerHTML = `
            <div class="flex-between mb-2">
                <h2>Accounts</h2>
                <button class="btn btn-primary" onclick="openModal('createUserModal')">Add User</button>
            </div>
            <div class="card" style="padding:0; overflow:hidden;">
                <table style="width:100%; border-collapse:collapse;">
                    <thead style="background:#eee;">
                        <tr style="text-align:left;">
                            <th style="padding:10px;">User</th>
                            <th>Email</th>
                            <th>Role</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody id="users-tbody"></tbody>
                </table>
            </div>
        `;
        
        const res = await fetch('/api/admin/users');
        const users = await res.json();
        const tbody = document.getElementById('users-tbody');
        
        users.forEach(u => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid #eee';
            tr.innerHTML = `
                <td style="padding:10px;">${u.username}</td>
                <td>${u.email}</td>
                <td>${u.role}</td>
                <td><button class="btn btn-danger" style="padding:4px 8px; font-size:0.8rem;" onclick="deleteUser(${u.id})">Delete</button></td>
            `;
            tbody.appendChild(tr);
        });
    }

    function renderDashboard() {
        const projectCount = state.projects ? state.projects.length : 0;
        mainContent.innerHTML = `
            <h2>Dashboard</h2>
            <div class="grid-3 mt-2">
                <div class="card" style="background:#333; color:#fff;">
                    <h1>${projectCount}</h1>
                    <div>Active Projects</div>
                </div>
                <div class="card">
                    <h3>Welcome, ${state.user.username}</h3>
                    <p>Select a project from the sidebar to begin.</p>
                </div>
            </div>
        `;
    }

    function renderSettingsPage() {
        mainContent.innerHTML = `
            <h2>Settings</h2>
            <div class="card mt-2" style="max-width:500px;">
                <h3>Change Password</h3>
                <form id="pw-form">
                    <input type="password" id="pw-old" placeholder="Old Password" required>
                    <input type="password" id="pw-new" placeholder="New Password" required>
                    <button type="submit" class="btn btn-primary">Update</button>
                </form>
            </div>
        `;
        // Delay attach to ensure DOM is ready
        setTimeout(() => {
            const form = document.getElementById('pw-form');
            if(form) form.addEventListener('submit', async(e)=>{
                e.preventDefault();
                const res = await fetch('/api/users/password', {
                    method: 'PUT',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        currentPassword: document.getElementById('pw-old').value,
                        newPassword: document.getElementById('pw-new').value
                    })
                });
                if(res.ok) { alert("Password Updated"); document.getElementById('pw-form').reset(); }
                else alert("Failed");
            });
        }, 0);
    }

    async function renderProjectsList() {
        mainContent.innerHTML = `
            <div class="flex-between mb-2">
                <h2>All Projects</h2>
                <button class="btn btn-primary" onclick="openModal('createProjectModal')">New Project</button>
            </div>
            <div id="proj-list" class="grid-3"></div>
        `;
        const res = await fetch('/api/projects');
        const projs = await res.json();
        const list = document.getElementById('proj-list');
        projs.forEach(p => {
            const div = document.createElement('div');
            div.className = 'card';
            div.innerHTML = `<h3>${p.name}</h3><p>${p.status}</p><button class="btn btn-outline mt-2" onclick="handleProjectChange(${p.id})">Open</button>`;
            list.appendChild(div);
        });
    }
    
    // ==========================================
    // 7. GLOBAL LISTENERS & FORMS
    // ==========================================

    socket.on('task:update', (data) => {
        if (state.currentProject == data.projectId && document.querySelector('.nav-link[data-page="tasks"]').classList.contains('active')) renderTasksPage();
    });
    socket.on('project:new', loadProjects);
    socket.on('project:members_changed', (data) => {
        if (state.currentProject == data.projectId && document.querySelector('.nav-link[data-page="members"]').classList.contains('active')) renderMembersPage();
    });
    socket.on('announcement:new', (data) => {
         if (document.querySelector('.nav-link[data-page="announcements"]').classList.contains('active')) renderAnnouncementsPage();
         else alert("New Announcement: " + data.title);
    });

    window.deleteUser = async (id) => {
        if(confirm('Delete?')) { await fetch(`/api/admin/users/${id}`, {method:'DELETE'}); renderAccountsPage(); }
    };
    
    // --- Modals Form Submissions ---
    
    // 1. Project Create
    const cpForm = document.getElementById('create-project-form');
    if(cpForm) cpForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await fetch('/api/projects', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                name: document.getElementById('cp-name').value,
                description: document.getElementById('cp-desc').value,
                start_date: document.getElementById('cp-start').value,
                end_date: document.getElementById('cp-end').value
            })
        });
        closeModal('createProjectModal');
        loadProjects();
    });

    // 2. Task Create
    const ctForm = document.getElementById('create-task-form');
    if(ctForm) ctForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await fetch('/api/tasks', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                project_id: state.currentProject,
                name: document.getElementById('ct-name').value,
                description: document.getElementById('ct-desc').value,
                due_date: document.getElementById('ct-due').value,
                assigned_to_id: document.getElementById('ct-assignee').value
            })
        });
        closeModal('createTaskModal');
    });

    // 3. User Create (Admin)
    const cuForm = document.getElementById('create-user-form');
    if(cuForm) cuForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await fetch('/api/admin/users', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                username: document.getElementById('cu-username').value,
                email: document.getElementById('cu-email').value,
                password: document.getElementById('cu-password').value,
                role_id: document.getElementById('cu-role').value
            })
        });
        closeModal('createUserModal');
        if(document.querySelector('.nav-link[data-page="accounts"]').classList.contains('active')) renderAccountsPage();
    });

    // 4. Manage Members Modal & Form
    window.openManageMembersModal = async () => {
        openModal('manageMembersModal');
        const list = document.getElementById('members-list-container');
        list.innerHTML = 'Loading...';
        
        try {
            const [uRes, mRes] = await Promise.all([
                fetch('/api/admin/users'), 
                fetch(`/api/projects/${state.currentProject}/members/stats`)
            ]);
            const users = await uRes.json();
            const members = await mRes.json();
            
            // Create map of current member IDs to their Roles
            const memberMap = {};
            members.forEach(m => memberMap[m.id] = m.role_in_project);
            
            list.innerHTML = '';
            users.forEach(u => {
                const isChecked = memberMap.hasOwnProperty(u.id);
                const roleVal = memberMap[u.id] || 'Member';
                
                const row = document.createElement('div');
                row.className = 'flex-between mb-2';
                row.style.borderBottom = '1px solid #eee';
                row.style.paddingBottom = '5px';
                
                row.innerHTML = `
                    <div style="display:flex; align-items:center;">
                        <input type="checkbox" class="mem-chk" value="${u.id}" ${isChecked ? 'checked' : ''} style="width:auto; margin-right:10px;">
                        <span>${u.username}</span>
                    </div>
                    <input type="text" class="mem-role" value="${roleVal}" placeholder="Role" style="width:100px; margin:0;" ${isChecked ? '' : 'disabled'}>
                `;
                
                // Toggle input on check
                const chk = row.querySelector('.mem-chk');
                const inp = row.querySelector('.mem-role');
                chk.addEventListener('change', () => { inp.disabled = !chk.checked; });
                
                list.appendChild(row);
            });
        } catch(e) { console.error(e); }
    };
    
    const mmForm = document.getElementById('manage-members-form');
    if(mmForm) mmForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const rows = document.querySelectorAll('#members-list-container .flex-between');
        const selectedMembers = [];
        
        rows.forEach(row => {
            const chk = row.querySelector('.mem-chk');
            const inp = row.querySelector('.mem-role');
            if(chk.checked) {
                selectedMembers.push({ id: chk.value, role: inp.value });
            }
        });

        await fetch(`/api/projects/${state.currentProject}/members`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ members: selectedMembers })
        });
        closeModal('manageMembersModal');
        renderMembersPage();
    });

});