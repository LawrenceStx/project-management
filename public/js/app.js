// public/js/app.js

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
        taskFilter: 'All'
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
            userDisplay.textContent = state.user.username;
            
            // Handle Admin Roles for Sidebar
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
    // 2. PROJECT MANAGEMENT & ROUTER
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

            if (state.user.role_id === 1) {
                const createOpt = document.createElement('option');
                createOpt.value = 'NEW_PROJECT_TRIGGER';
                createOpt.textContent = '+ Create New Project';
                createOpt.style.fontWeight = 'bold';
                projectSelect.appendChild(createOpt);
            }

            const savedProject = localStorage.getItem('currentProjectId');
            if (savedProject && projects.find(p => p.id == savedProject)) {
                projectSelect.value = savedProject;
                handleProjectChange(savedProject);
            } else {
                renderDashboard();
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
            projectDisplay.textContent = project.name;
            const activePage = document.querySelector('.nav-link.active').dataset.page;
            // Only reload if we aren't on dashboard (dashboard is global)
            loadPage(activePage);
        }
    };

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
        mainContent.classList.remove('fade-in'); // Reset animation
        void mainContent.offsetWidth; // Trigger reflow
        mainContent.classList.add('fade-in');
        
        mainContent.innerHTML = '';
        
        // Middleware-like check for Project Selection
        const needsProject = ['tasks', 'gantt', 'members'];
        if(needsProject.includes(pageName) && !state.currentProject) {
            mainContent.innerHTML = `
                <div class="card text-center" style="padding: 50px;">
                    <i class="bi bi-folder-x" style="font-size: 3rem; color: var(--text-muted);"></i>
                    <h3 class="mt-2">No Project Selected</h3>
                    <p style="color: var(--text-muted)">Please select a project from the sidebar.</p>
                </div>`;
            return;
        }

        switch(pageName) {
            case 'dashboard': renderDashboard(); break;
            case 'tasks': renderTasksPage(); break;
            case 'gantt': renderGanttPage(); break;
            case 'members': renderMembersPage(); break;
            case 'projects': renderProjectsList(); break;
            case 'announcements': renderAnnouncementsPage(); break;
            case 'settings': renderSettingsPage(); break;
            case 'logout':
                fetch('/api/auth/logout', {method: 'POST'}).then(() => window.location.href = '/login.html');
                break;
            default: mainContent.innerHTML = `<h3>Page not found</h3>`;
        }
    }

    // ==========================================
    // PAGE RENDERING FUNCTIONS (UPDATED UI)
    // ==========================================

    function renderDashboard() {
        // Welcome Header
        const h = new Date().getHours();
        const greeting = h < 12 ? 'Good Morning' : h < 18 ? 'Good Afternoon' : 'Good Evening';
        const projectCount = state.projects ? state.projects.length : 0;
        
        mainContent.innerHTML = `
            <div class="flex-between mb-2">
                <div>
                    <h2>${greeting}, ${state.user.username.split(' ')[0]}</h2>
                    <p style="color:var(--text-muted)">Here's what's happening today.</p>
                </div>
                <button class="btn btn-primary"><i class="bi bi-download"></i> Export Report</button>
            </div>

            <div class="grid-3 mt-2">
                <!-- Stat Card 1 -->
                <div class="card stat-card">
                    <div class="stat-icon green"><i class="bi bi-folder-check"></i></div>
                    <div class="stat-info">
                        <h3>Active Projects</h3>
                        <h1>${projectCount}</h1>
                        <span class="stat-change pos"><i class="bi bi-arrow-up-short"></i> Current</span>
                    </div>
                </div>

                <!-- Stat Card 2 -->
                <div class="card stat-card">
                    <div class="stat-icon blue"><i class="bi bi-list-task"></i></div>
                    <div class="stat-info">
                        <h3>Pending Tasks</h3>
                        <h1>12</h1>
                        <span class="stat-change" style="background:#eff6ff; color:#3b82f6">Assign to me</span>
                    </div>
                </div>

                <!-- Stat Card 3 -->
                <div class="card stat-card">
                    <div class="stat-icon purple"><i class="bi bi-people-fill"></i></div>
                    <div class="stat-info">
                        <h3>Team Members</h3>
                        <h1>${state.user.role_id === 1 ? 'Admin' : 'Member'}</h1>
                        <span class="stat-change" style="background:#f5f3ff; color:#8b5cf6">Role</span>
                    </div>
                </div>
            </div>

            <div class="card mt-2">
                <div class="flex-between mb-2">
                    <h3>Project Overview</h3>
                    <i class="bi bi-three-dots"></i>
                </div>
                <div style="height: 200px; display:flex; align-items:center; justify-content:center; color: var(--text-muted); background: #f9fafb; border-radius: var(--radius-sm);">
                    Chart Placeholder (Chart.js would go here)
                </div>
            </div>
        `;
    }

    async function renderTasksPage() {
        const projectId = state.currentProject;
        
        mainContent.innerHTML = `
            <div class="flex-between mb-2">
                <h2>Tasks</h2>
                <div style="display:flex; gap:10px;">
                     <select id="task-filter" style="width: auto; margin:0;">
                        <option value="All">All Status</option>
                        <option value="Todo">Todo</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Done">Done</option>
                    </select>
                    <button class="btn btn-primary" onclick="openCreateTaskModal()"><i class="bi bi-plus-lg"></i> New Task</button>
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
                container.innerHTML = `<div style="grid-column: 1/-1; padding: 40px; text-align:center; color: var(--text-muted);">No tasks found.</div>`;
                return;
            }

            tasks.forEach(task => {
                const isAdmin = state.user.role_id === 1;
                const statusClass = task.status.startsWith('In') ? 'status-In' : `status-${task.status}`;
                
                const card = document.createElement('div');
                card.className = 'card fade-up';
                
                card.innerHTML = `
                    <div class="flex-between">
                        <span class="task-status-badge ${statusClass}">${task.status}</span>
                        ${isAdmin ? `<button class="btn-icon" style="color:#ef4444; font-size:0.9rem;" onclick="deleteTask(${task.id})"><i class="bi bi-trash"></i></button>` : ''}
                    </div>
                    <h4 class="mt-2" style="font-size: 1.1rem; font-weight:600;">${task.name}</h4>
                    <p class="mb-2" style="font-size:0.85rem; color:var(--text-muted); line-height:1.5;">${task.description || 'No description provided.'}</p>
                    
                    <div style="border-top:1px solid var(--border); margin-top:15px; padding-top:15px; display:flex; justify-content:space-between; align-items:center;">
                        <div style="display:flex; align-items:center; gap:8px; font-size:0.8rem; color: var(--text-light);">
                            <i class="bi bi-calendar"></i> ${task.due_date || 'No Date'}
                        </div>
                         
                         <select style="width:auto; margin:0; padding:5px 10px; font-size:0.8rem;" ${isAdmin ? '' : 'disabled'} onchange="updateTaskStatus(${task.id}, this.value)">
                            <option value="Todo" ${task.status === 'Todo' ? 'selected' : ''}>Todo</option>
                            <option value="In Progress" ${task.status === 'In Progress' ? 'selected' : ''}>Doing</option>
                            <option value="Done" ${task.status === 'Done' ? 'selected' : ''}>Done</option>
                        </select>
                    </div>
                    <div style="margin-top:10px; font-size:0.8rem;">
                        <span style="display:flex; align-items:center; gap:5px;">
                            <div class="avatar" style="width:24px; height:24px; font-size:0.7rem;">${(task.assigned_to_name || 'U').charAt(0)}</div>
                            ${task.assigned_to_name || 'Unassigned'}
                        </span>
                    </div>
                `;
                container.appendChild(card);
            });
        } catch (e) { console.error(e); }
    }

    // ==========================================
    // HELPER: GANTT CHART
    // ==========================================
    async function renderGanttPage() {
        const isAdmin = state.user.role_id === 1;

        mainContent.innerHTML = `
            <div class="flex-between mb-2">
                <h2>Roadmap</h2>
                ${isAdmin ? `<button class="btn btn-primary" onclick="openNewEventModal()"><i class="bi bi-calendar-plus"></i> Add Event</button>` : ''}
            </div>
            <div class="card" style="overflow-x: auto; min-height: 400px; padding: 20px;" id="gantt-container">
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
            container.innerHTML = '<div class="text-center" style="padding:50px; color: #9ca3af;"><i class="bi bi-calendar-x" style="font-size:2rem; margin-bottom:10px; display:block;"></i>No events scheduled yet.</div>'; 
            return; 
        }

        const dates = events.map(e => [new Date(e.start_date), new Date(e.end_date)]).flat();
        let minDate = new Date(Math.min.apply(null, dates));
        let maxDate = new Date(Math.max.apply(null, dates));
        minDate.setDate(minDate.getDate() - 5);
        maxDate.setDate(maxDate.getDate() + 10);
        
        const totalDays = (maxDate - minDate) / (1000 * 60 * 60 * 24);
        const pxPerDay = 45; // Wider for better visibility
        
        // Header
        const header = document.createElement('div');
        header.style.display = 'flex';
        header.style.borderBottom = '1px solid #eee';
        header.style.paddingBottom = '10px';
        header.style.marginBottom = '20px';
        
        for(let i=0; i <= totalDays; i++) {
            const d = new Date(minDate);
            d.setDate(d.getDate() + i);
            const cell = document.createElement('div');
            cell.style.minWidth = `${pxPerDay}px`;
            cell.style.fontSize = '11px';
            cell.style.color = '#9ca3af';
            cell.style.textAlign = 'center';
            cell.innerText = `${d.getDate()}`;
            header.appendChild(cell);
        }
        container.appendChild(header);

        // Events
        events.forEach(ev => {
            const row = document.createElement('div');
            row.style.position = 'relative';
            row.style.height = '50px';
            row.style.marginBottom = '10px';

            const start = new Date(ev.start_date);
            const end = new Date(ev.end_date);
            const duration = (end - start) / (1000 * 60 * 60 * 24) + 1;
            const offset = (start - minDate) / (1000 * 60 * 60 * 24);

            const bar = document.createElement('div');
            bar.className = 'gantt-bar';
            bar.innerHTML = `<span style="font-weight:600;">${ev.name}</span>`;
            bar.style.position = 'absolute';
            bar.style.left = `${offset * pxPerDay}px`;
            bar.style.width = `${Math.max(duration * pxPerDay, 40)}px`;
            bar.style.height = '36px';
            bar.style.backgroundColor = ev.color;
            bar.style.opacity = '0.9';
            bar.style.borderRadius = '8px';
            bar.style.padding = '0 10px';
            bar.style.display = 'flex';
            bar.style.alignItems = 'center';
            bar.style.fontSize = '12px';
            bar.style.color = '#fff'; 
            bar.style.cursor = 'pointer';
            
            bar.onclick = () => openEditEventModal(ev);
            row.appendChild(bar);
            container.appendChild(row);
        });
    }

    // ==========================================
    // OTHER PAGES
    // ==========================================
    
    async function renderMembersPage() {
        const projectId = state.currentProject;
        const isAdmin = state.user.role_id === 1;

        mainContent.innerHTML = `
            <div class="flex-between mb-2">
                <h2>Team Members</h2>
                ${isAdmin ? `<button class="btn btn-primary" onclick="openManageMembersModal()"><i class="bi bi-people"></i> Manage Team</button>` : ''}
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
            card.className = 'card text-center fade-up';
            card.innerHTML = `
                <img src="https://ui-avatars.com/api/?name=${m.username}&background=random&color=fff" style="border-radius:50%; width:60px; height:60px; margin-bottom:15px; box-shadow:0 5px 15px rgba(0,0,0,0.1);">
                <h3>${m.username}</h3>
                <span style="background:#f3f4f6; color:#6b7280; padding:4px 12px; border-radius:15px; font-size:0.8rem; display:inline-block; margin: 8px 0;">${m.role_in_project || 'Member'}</span>
                
                <div style="margin-top:20px; background:#e5e7eb; height:6px; border-radius:3px; overflow:hidden;">
                    <div style="width:${rate}%; background:var(--primary); height:100%;"></div>
                </div>
                <div class="flex-between mt-2" style="font-size:0.8rem; color:var(--text-light);">
                    <span>Tasks Completed</span>
                    <strong>${rate}%</strong>
                </div>
            `;
            container.appendChild(card);
        });
    }

    async function renderProjectsList() {
        mainContent.innerHTML = `
            <div class="flex-between mb-2">
                <h2>All Projects</h2>
                <button class="btn btn-primary" onclick="openModal('createProjectModal')"><i class="bi bi-plus-lg"></i> New Project</button>
            </div>
            <div id="proj-list" class="grid-3"></div>
        `;
        const res = await fetch('/api/projects');
        const projs = await res.json();
        const list = document.getElementById('proj-list');
        projs.forEach(p => {
            const div = document.createElement('div');
            div.className = 'card fade-up';
            div.innerHTML = `
                <div class="flex-between">
                    <div class="stat-icon green" style="width:40px; height:40px; font-size:1.1rem;"><i class="bi bi-folder"></i></div>
                    <i class="bi bi-three-dots"></i>
                </div>
                <h3 class="mt-2">${p.name}</h3>
                <p style="color:var(--text-light); font-size:0.9rem; margin-bottom:15px;">${p.status}</p>
                <button class="btn btn-outline" style="width:100%" onclick="handleProjectChange(${p.id})">Open Dashboard</button>
            `;
            list.appendChild(div);
        });
    }

    async function renderAnnouncementsPage() {
        const isAdmin = state.user.role_id === 1;

        mainContent.innerHTML = `
            <div class="flex-between mb-2">
                <h2>Announcements</h2>
                ${isAdmin ? `<button class="btn btn-primary" onclick="document.getElementById('announce-form-box').classList.toggle('hidden')">Post New</button>` : ''}
            </div>

            <div id="announce-form-box" class="card hidden mb-2 fade-in">
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
             // Attach listener
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
        if(data.length === 0) feed.innerHTML = '<div class="text-center" style="color:#999">No news yet.</div>';
        
        data.forEach(item => renderAnnouncementItem(item, isAdmin));
    }

    function renderSettingsPage() {
        mainContent.innerHTML = `
            <div class="flex-between mb-2">
                <h2>Settings</h2>
            </div>
            <div class="card fade-up" style="max-width: 600px;">
                <h3 class="mb-2">Security</h3>
                <p style="color:var(--text-muted); margin-bottom: 20px;">Manage your password and account security.</p>
                
                <form id="pw-form">
                    <label>Current Password</label>
                    <input type="password" id="pw-old" placeholder="Enter current password" required>
                    
                    <label>New Password</label>
                    <input type="password" id="pw-new" placeholder="Enter new password" required>
                    
                    <div style="text-align: right;">
                        <button type="submit" class="btn btn-primary mt-2">Update Password</button>
                    </div>
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
                
                if(res.ok) { 
                    alert("Password Updated Successfully"); 
                    document.getElementById('pw-form').reset(); 
                } else { 
                    alert("Failed to update password. Please check your current password.");
                }
            });
        }, 0);
    }

    function renderAnnouncementItem(item, isAdmin) {
        const feed = document.getElementById('announcement-feed');
        if(!feed) return;
        if (feed.innerText === 'No news yet.') feed.innerHTML = '';

        const el = document.createElement('div');
        el.className = 'card fade-up';
        el.id = `ann-${item.id}`;
        // Style specific to announcements
        el.style.borderLeft = '5px solid var(--primary)';
        
        el.innerHTML = `
            <div class="flex-between">
                <h3 style="color: var(--primary)">${item.title}</h3>
                <small style="color:var(--text-muted)">${new Date(item.created_at).toLocaleDateString()}</small>
            </div>
            <p class="mt-2" style="line-height:1.6;">${item.message}</p>
            <div class="flex-between mt-2" style="border-top:1px solid #eee; padding-top:10px;">
                <small style="color:var(--text-light);">Posted by <strong>${item.author}</strong></small>
                ${isAdmin ? `<button class="btn-icon" style="color:#ef4444" onclick="deleteAnnouncement(${item.id})"><i class="bi bi-trash"></i></button>` : ''}
            </div>
        `;
        feed.prepend(el);
    }
    
    // ==========================================
    // EXPORTED FUNCTIONS (FOR HTML ONCLICK)
    // ==========================================

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

    window.openCreateTaskModal = async () => {
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
    };

    window.deleteTask = async (id) => {
        if(!confirm("Delete this task?")) return;
        await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
    };

    window.deleteAnnouncement = async (id) => {
        if(!confirm("Remove this announcement?")) return;
        await fetch(`/api/announcements/${id}`, { method: 'DELETE' });
    };
    
    // Function to delete event
    window.deleteEvent = async () => {
        const id = document.getElementById('ev-id').value;
        if(confirm("Delete this event?")) {
            await fetch(`/api/events/${id}`, { method: 'DELETE' });
            closeModal('eventModal');
            renderGanttPage();
        }
    };

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
                        <input type="checkbox" class="mem-chk" value="${u.id}" ${isChecked ? 'checked' : ''} style="width:auto; margin-right:10px; margin-bottom:0;">
                        <span>${u.username}</span>
                    </div>
                    <input type="text" class="mem-role" value="${roleVal}" placeholder="Role" style="width:100px; margin:0;" ${isChecked ? '' : 'disabled'}>
                `;
                
                const chk = row.querySelector('.mem-chk');
                const inp = row.querySelector('.mem-role');
                chk.addEventListener('change', () => { inp.disabled = !chk.checked; });
                
                list.appendChild(row);
            });
        } catch(e) { console.error(e); }
    };

    // ==========================================
    // GLOBAL LISTENERS & FORMS
    // ==========================================

    socket.on('task:update', (data) => {
        if (state.currentProject == data.projectId && document.querySelector('.nav-link[data-page="tasks"]').classList.contains('active')) renderTasksPage();
    });
    
    socket.on('announcement:new', (data) => {
         const btn = document.querySelector('[data-page="announcements"]');
         if(btn) {
             btn.innerHTML = `<i class="bi bi-megaphone-fill" style="color:red"></i> News <span style="background:red; color:white; border-radius:50%; width:8px; height:8px; display:inline-block; margin-left:5px;"></span>`;
         }
         if (document.querySelector('.nav-link[data-page="announcements"]').classList.contains('active')) renderAnnouncementsPage();
    });
    
    socket.on('announcement:delete', (data) => {
        const el = document.getElementById(`ann-${data.id}`);
        if(el) el.remove();
    });

    // Form Submissions
    const eventForm = document.getElementById('event-form');
    if(eventForm) eventForm.addEventListener('submit', async (e) => {
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
        await fetch(url, { method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
        closeModal('eventModal');
        renderGanttPage();
    });

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

    const mmForm = document.getElementById('manage-members-form');
    if(mmForm) mmForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const rows = document.querySelectorAll('#members-list-container .flex-between');
        const selectedMembers = [];
        rows.forEach(row => {
            const chk = row.querySelector('.mem-chk');
            const inp = row.querySelector('.mem-role');
            if(chk.checked) selectedMembers.push({ id: chk.value, role: inp.value });
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