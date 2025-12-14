// public/js/app.js
const state = {
    user: null,
    projects: [],
    allUsers: [],
    currentProject: null,
    taskFilter: 'All',
    taskSearch: '', // <--- ADD THIS
    taskSort: 'Default' // <--- ADD THIS
};

// --- Global Modal Helpers ---
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
    

    // DOM Elements
    const projectSelect = document.getElementById('global-project-selector');
    const mainContent = document.getElementById('main-content');
    const projectDisplay = document.getElementById('current-project-display');
    const userDisplay = document.getElementById('user-display');
    const headerTitle = document.getElementById('header-title');
    const navLinks = document.querySelectorAll('.nav-link');

    // --- MOBILE MENU LOGIC ---
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobile-overlay');
    
    // Check if elements exist (mobile layout might be hidden on desktop)
    const hamburgerBtn = document.getElementById('hamburger-btn');
    if(hamburgerBtn) {
        hamburgerBtn.addEventListener('click', () => {
            sidebar.classList.add('open');
            if(overlay) overlay.classList.add('open');
        });
    }

    const closeMenu = () => {
        sidebar.classList.remove('open');
        if(overlay) overlay.classList.remove('open');
    };

    const closeBtn = document.getElementById('close-sidebar-btn');
    if(closeBtn) closeBtn.addEventListener('click', closeMenu);
    if(overlay) overlay.addEventListener('click', closeMenu);

    // ==========================================
    // 1. INITIALIZATION & AUTH
    // ==========================================

    try {
        const authRes = await fetch('/api/auth/status');
        const authData = await authRes.json();

        if (authData.authenticated) {
            state.user = authData.user;
            if(userDisplay) userDisplay.textContent = state.user.username;
            
            // Handle Admin Roles for Sidebar visibility
            if(state.user.role_id === 1) {
                // Show Admin Links
                const accLink = document.getElementById('nav-accounts');
                if(accLink) accLink.style.display = 'block';
            } else {
                // Hide Admin Links for non-admins
                const accLink = document.getElementById('nav-accounts');
                if(accLink) accLink.style.display = 'none';
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
                // If on dashboard, render it even without project
                const activePage = document.querySelector('.nav-link.active').dataset.page;
                if(activePage === 'dashboard') renderDashboard();
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
            if(projectDisplay) projectDisplay.textContent = project.name;
            const activeLink = document.querySelector('.nav-link.active');
            if(activeLink) loadPage(activeLink.dataset.page);
        }
    };

    // ==========================================
    // 3. ROUTER
    // ==========================================

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            navLinks.forEach(n => n.classList.remove('active'));
            const targetLink = e.target.closest('.nav-link');
            targetLink.classList.add('active');
            
            // Close mobile menu on navigation
            if(window.innerWidth <= 768) closeMenu();
            
            loadPage(targetLink.dataset.page);
        });
    });

    function loadPage(pageName) {
        mainContent.classList.remove('fade-in'); 
        void mainContent.offsetWidth; // Trigger reflow
        mainContent.classList.add('fade-in');
        
        mainContent.innerHTML = '';
        
        // Update Header Title
        if(headerTitle) headerTitle.textContent = pageName.charAt(0).toUpperCase() + pageName.slice(1);

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
            case 'accounts': renderAccountsPage(); break;
            case 'announcements': renderAnnouncementsPage(); break;
            case 'logs': renderLogsPage(); break;
            case 'settings': renderSettingsPage(); break;
            case 'logout':
                fetch('/api/auth/logout', {method: 'POST'}).then(() => window.location.href = '/login.html');
                break;
            default: mainContent.innerHTML = `<h3>Page not found</h3>`;
        }
    }

    // ==========================================
    // 4. PAGE RENDERERS
    // ==========================================

    async function renderDashboard() {
        let stats = { projects: 0, myTasks: 0, users: 0, deadlines: [] }; // Init with array
        try {
            const res = await fetch('/api/dashboard/stats');
            if(res.ok) stats = await res.json();
        } catch(e) { console.error("Stats error", e); }

        const h = new Date().getHours();
        const greeting = h < 12 ? 'Good Morning' : h < 18 ? 'Good Afternoon' : 'Good Evening';

        // Helper to generate deadline HTML
        let deadlinesHtml = '';
        if(stats.deadlines.length === 0) {
            deadlinesHtml = `<div style="text-align:center; color:var(--text-muted); padding:20px;">No upcoming deadlines! 🎉</div>`;
        } else {
            deadlinesHtml = stats.deadlines.map(d => {
                // Simple date formatter
                const dateObj = new Date(d.due_date);
                const today = new Date();
                const diffTime = dateObj - today;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
                
                let timeText = d.due_date;
                let color = 'var(--primary)'; // Green default
                
                if (diffDays < 0) { timeText = "Overdue"; color = "#ef4444"; }
                else if (diffDays === 0) { timeText = "Due Today"; color = "#f59e0b"; }
                else if (diffDays === 1) { timeText = "Tomorrow"; color = "#3b82f6"; }
                else if (diffDays <= 7) { timeText = `In ${diffDays} days`; color = "#3b82f6"; }

                return `
                <div style="padding:12px; background:#f9fafb; border-radius:10px; border-left:4px solid ${color}; margin-bottom:10px;">
                    <div class="flex-between">
                        <strong>${d.name}</strong>
                        <span style="font-size:0.75rem; color:${color}; font-weight:600;">${timeText}</span>
                    </div>
                    <div style="font-size:0.8rem; color:#666; margin-top:4px;">${d.project_name}</div>
                </div>`;
            }).join('');
        }

        mainContent.innerHTML = `
            <div class="flex-between mb-2">
                <div>
                    <h2>${greeting}, ${state.user.username.split(' ')[0]}</h2>
                    <p style="color:var(--text-muted)">Here's what's happening today.</p>
                </div>
            </div>

            <div class="dashboard-grid mt-2">
                <!-- STATS CARDS -->
                <div class="card stat-card span-1 fade-up" style="animation-delay: 0.1s; margin:0;">
                    <div class="stat-icon green"><i class="bi bi-folder-check"></i></div>
                    <div>
                        <h1 style="font-size:1.5rem; margin:0;">${stats.projects}</h1>
                        <small style="color:var(--text-muted)">Active Projects</small>
                    </div>
                </div>
                <div class="card stat-card span-1 fade-up" style="animation-delay: 0.2s; margin:0;">
                    <div class="stat-icon blue"><i class="bi bi-list-task"></i></div>
                    <div>
                        <h1 style="font-size:1.5rem; margin:0;">${stats.myTasks}</h1>
                        <small style="color:var(--text-muted)">My Tasks</small>
                    </div>
                </div>
                <div class="card stat-card span-1 fade-up" style="animation-delay: 0.3s; margin:0;">
                    <div class="stat-icon purple"><i class="bi bi-people-fill"></i></div>
                    <div>
                        <h1 style="font-size:1.5rem; margin:0;">${stats.users}</h1>
                        <small style="color:var(--text-muted)">Team Members</small>
                    </div>
                </div>
                <div class="card stat-card span-1 fade-up" style="animation-delay: 0.4s; margin:0;">
                    <div class="stat-icon" style="background:#ecfccb; color:#84cc16"><i class="bi bi-broadcast"></i></div>
                    <div>
                        <h1 id="online-count-display" style="font-size:1.5rem; margin:0;">-</h1>
                        <small style="color:var(--text-muted)">Online Users</small>
                    </div>
                </div>

                <!-- BENTO GRID ROW 2 -->
                 <div class="card span-2 fade-up" style="margin:0; min-height: 250px; display:flex; flex-direction:column;">
                    <div class="flex-between mb-2">
                        <h3>Project Overview</h3>
                        <i class="bi bi-three-dots"></i>
                    </div>
                    <div style="flex:1; display:flex; align-items:center; justify-content:center; color: var(--text-muted); background: #f9fafb; border-radius: var(--radius-sm);">
                        <p><i class="bi bi-bar-chart-fill"></i> Analytics Placeholder</p>
                    </div>
                </div>

                <!-- UPCOMING DEADLINES (Dynamic) -->
                <div class="card span-2 fade-up" style="margin:0; min-height: 250px;">
                    <div class="flex-between mb-2">
                        <h3>Upcoming Deadlines</h3>
                    </div>
                     <div style="display:flex; flex-direction:column; max-height: 250px; overflow-y: auto;">
                        ${deadlinesHtml}
                    </div>
                </div>
            </div>
        `;
    }

    async function renderProjectsList() {
        const isAdmin = state.user.role_id === 1;
        mainContent.innerHTML = `
            <div class="flex-between mb-2">
                <h2>All Projects</h2>
                ${isAdmin ? `<button class="btn btn-primary" onclick="openModal('createProjectModal')"><i class="bi bi-plus-lg"></i> New Project</button>` : ''}
            </div>
            <div id="proj-list" class="grid-3">Loading...</div>
        `;
        
        try {
            const res = await fetch('/api/projects');
            const projs = await res.json();
            const list = document.getElementById('proj-list');
            list.innerHTML = '';
            
            projs.forEach(p => {
                const div = document.createElement('div');
                div.className = 'card fade-up';
                div.innerHTML = `
                    <div class="flex-between">
                        <div class="stat-icon green" style="width:40px; height:40px; font-size:1.1rem;"><i class="bi bi-folder"></i></div>
                        ${isAdmin ? `
                            <div class="dropdown" style="display:flex; gap:10px;">
                                <button class="btn-icon" onclick="openEditProject(${p.id})"><i class="bi bi-pencil-square"></i></button>
                                <button class="btn-icon" style="color:#ef4444;" onclick="deleteProject(${p.id})"><i class="bi bi-trash"></i></button>
                            </div>
                        ` : '<i class="bi bi-three-dots"></i>'}
                    </div>
                    <h3 class="mt-2">${p.name}</h3>
                    <p style="color:var(--text-light); font-size:0.9rem; margin-bottom:15px;">${p.status}</p>
                    <button class="btn btn-outline" style="width:100%" onclick="handleProjectChange(${p.id})">Open Dashboard</button>
                `;
                list.appendChild(div);
            });
        } catch(e) { console.error(e); }
    }

    async function renderAccountsPage() {
        if (state.user.role_id !== 1) {
            mainContent.innerHTML = `<p class="text-center mt-2">Access Denied</p>`;
            return;
        }

        mainContent.innerHTML = `
            <div class="flex-between mb-2">
                <h2>User Management</h2>
                <button class="btn btn-primary" onclick="openModal('createUserModal')"><i class="bi bi-person-plus"></i> Add User</button>
            </div>
            <div class="card fade-up" style="padding:0; overflow:hidden; overflow-x: auto;">
                <table style="width:100%; border-collapse:collapse; min-width: 600px;">
                    <thead style="background:#f9fafb; border-bottom:1px solid #eee;">
                        <tr style="text-align:left; color: var(--text-light);">
                            <th style="padding:15px;">User</th>
                            <th>Email</th>
                            <th>Role</th>
                            <th style="text-align:right; padding-right:20px;">Action</th>
                        </tr>
                    </thead>
                    <tbody id="users-tbody"></tbody>
                </table>
            </div>
        `;
        
        try {
            const res = await fetch('/api/admin/users');
            const users = await res.json();
            state.allUsers = users; // Store for editing
            const tbody = document.getElementById('users-tbody');
            
            users.forEach(u => {
                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid #eee';
                tr.innerHTML = `
                    <td style="padding:15px; font-weight:600;">${u.username}</td>
                    <td>${u.email}</td>
                    <td><span class="task-status-badge ${u.role === 'Admin' ? 'status-Done' : 'status-Todo'}">${u.role}</span></td>
                    <td style="text-align:right; padding-right:20px;">
                        <button class="btn-icon" onclick="openEditUser(${u.id})"><i class="bi bi-pencil-square"></i></button>
                        <button class="btn-icon" style="color:#ef4444;" onclick="deleteUser(${u.id})"><i class="bi bi-trash"></i></button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        } catch(e) { console.error(e); }
    }

    async function renderTasksPage() {
        const projectId = state.currentProject;
        const isAdmin = state.user.role_id === 1;

        // 1. UPDATE HTML: Added a proper Search Button and removed onkeyup from input
        mainContent.innerHTML = `
            <div class="flex-between mb-2" style="flex-wrap:wrap; gap:10px;">
                <h2>Tasks</h2>
                <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
                    
                    <!-- SEARCH GROUP -->
                    <div style="display:flex; gap:5px;">
                        <input type="text" id="task-search-input" placeholder="Search task or member..." 
                               value="${state.taskSearch}" 
                               style="margin:0; width:200px; padding:8px 12px;">
                        <button class="btn btn-primary" id="btn-do-search" style="padding: 8px 15px;">
                            <i class="bi bi-search"></i>
                        </button>
                    </div>
                    
                    <!-- FILTER STATUS -->
                    <select id="task-filter" style="width: auto; margin:0; padding:8px 12px;">
                        <option value="All" ${state.taskFilter === 'All' ? 'selected' : ''}>All Status</option>
                        <option value="Todo" ${state.taskFilter === 'Todo' ? 'selected' : ''}>Todo</option>
                        <option value="In Progress" ${state.taskFilter === 'In Progress' ? 'selected' : ''}>In Progress</option>
                        <option value="Done" ${state.taskFilter === 'Done' ? 'selected' : ''}>Done</option>
                    </select>

                    <!-- SORT OPTIONS -->
                    <select id="task-sort" style="width: auto; margin:0; padding:8px 12px;">
                        <option value="Default" ${state.taskSort === 'Default' ? 'selected' : ''}>Sort: Todo First</option>
                        <option value="DateAsc" ${state.taskSort === 'DateAsc' ? 'selected' : ''}>Date: Oldest</option>
                        <option value="DateDesc" ${state.taskSort === 'DateDesc' ? 'selected' : ''}>Date: Newest</option>
                    </select>

                    ${isAdmin ? `<button class="btn btn-primary" onclick="openCreateTaskModal()"><i class="bi bi-plus-lg"></i> New</button>` : ''}
                </div>
            </div>
            <div id="task-container" class="grid-3">Loading...</div>
        `;

        // Event Listeners
        document.getElementById('task-filter').addEventListener('change', (e) => { state.taskFilter = e.target.value; renderTasksPage(); });
        document.getElementById('task-sort').addEventListener('change', (e) => { state.taskSort = e.target.value; renderTasksPage(); });
       
        const searchInput = document.getElementById('task-search-input');
        const searchBtn = document.getElementById('btn-do-search');

        const performSearch = () => {
            state.taskSearch = searchInput.value.toLowerCase();
            renderTasksPage(); // Re-render with new filter
        };

        searchBtn.addEventListener('click', performSearch);
        searchInput.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') performSearch();
        });

        try {
            const res = await fetch(`/api/projects/${projectId}/tasks`);
            let tasks = await res.json();

            // Filter by Status
            if (state.taskFilter !== 'All') tasks = tasks.filter(t => t.status === state.taskFilter);

            // 4. FILTER UPDATE: Search by Task Name, Description, OR Assigned Member Name
            if (state.taskSearch) {
                const term = state.taskSearch;
                tasks = tasks.filter(t => 
                    t.name.toLowerCase().includes(term) || 
                    (t.description && t.description.toLowerCase().includes(term)) ||
                    (t.assigned_to_name && t.assigned_to_name.toLowerCase().includes(term)) // <-- Added Member Search
                );
            }

            // Sort Logic
            tasks.sort((a, b) => {
                if (state.taskSort === 'Default') {
                    const statusVal = { 'Todo': 1, 'In Progress': 2, 'Done': 3 };
                    return statusVal[a.status] - statusVal[b.status];
                } else if (state.taskSort === 'DateAsc') {
                    return new Date(a.due_date) - new Date(b.due_date);
                } else if (state.taskSort === 'DateDesc') {
                    return new Date(b.due_date) - new Date(a.due_date);
                }
            });
            
            // Rendering
            const container = document.getElementById('task-container');
            container.innerHTML = '';

            if(tasks.length === 0) { 
                container.innerHTML = `
                <div class="span-4 text-center" style="padding:40px; color:var(--text-muted)">
                    <i class="bi bi-search" style="font-size:2rem; display:block; margin-bottom:10px;"></i>
                    No tasks found matching your criteria.
                </div>`; 
                return; 
            }

            tasks.forEach(t => {
                const statusClass = t.status === 'In Progress' ? 'status-In' : `status-${t.status}`;
                
                let vid = '';
                if(t.youtube_link) {
                    const match = t.youtube_link.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/);
                    if (match && match[2].length === 11) vid = `<div class="video-container"><iframe src="//www.youtube.com/embed/${match[2]}" allowfullscreen></iframe></div>`;
                }
                let link = t.external_link ? `<a href="${t.external_link}" target="_blank" class="task-link-btn"><i class="bi bi-link-45deg"></i> Open Link</a>` : '';

                // NEW: Show Assigned User Avatar/Name
                const assigneeHtml = t.assigned_to_name 
                    ? `<div style="display:flex; align-items:center; gap:5px; margin-top:10px; font-size:0.85rem; color:#666;">
                         <i class="bi bi-person-circle"></i> ${t.assigned_to_name}
                       </div>` 
                    : `<div style="margin-top:10px; font-size:0.85rem; color:#999; font-style:italic;">Unassigned</div>`;

                const div = document.createElement('div');
                div.className = `card task-card fade-up ${statusClass}`;
                div.innerHTML = `
                    <div>
                        <div class="flex-between">
                            <span class="task-status-badge ${statusClass}">${t.status}</span>
                            ${isAdmin ? `
                                <div style="display:flex; gap:5px;">
                                    <button class="btn-icon" onclick='openEditTask(${JSON.stringify(t).replace(/'/g, "&#39;")})'><i class="bi bi-pencil"></i></button>
                                    <button class="btn-icon" style="color:#ef4444" onclick="deleteTask(${t.id})"><i class="bi bi-trash"></i></button>
                                </div>
                            ` : ''}
                        </div>
                        <h4 class="mt-2" style="font-size:1.1rem; margin-bottom:10px;">${t.name}</h4>
                        <p class="preserve-text" style="color:var(--text-muted); font-size:0.9rem; margin-bottom:15px;">${t.description||'No description'}</p>
                        ${link}
                        ${vid}
                        ${assigneeHtml}
                    </div>
                    <div style="margin-top:20px; padding-top:15px; border-top:1px solid rgba(0,0,0,0.05);" class="flex-between">
                        <small style="color:var(--text-light)"><i class="bi bi-calendar"></i> ${t.due_date||'--'}</small>
                        <select onchange="updateTaskStatus(${t.id}, this.value)" style="width:auto; margin:0; padding:2px 8px; font-size:0.8rem; background:transparent; border:1px solid #ddd;">
                            <option value="Todo" ${t.status==='Todo'?'selected':''}>Todo</option>
                            <option value="In Progress" ${t.status==='In Progress'?'selected':''}>In Progress</option>
                            <option value="Done" ${t.status==='Done'?'selected':''}>Done</option>
                        </select>
                    </div>
                `;
                container.appendChild(div);
            });
        } catch(e) { console.error(e); }
    }

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
        const pxPerDay = 45; 
        
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

    async function renderMembersPage() {
        const projectId = state.currentProject;
        const isAdmin = state.user.role_id === 1;

        mainContent.innerHTML = `
            <div class="flex-between mb-2">
                <h2>Team Members</h2>
                <div style="display:flex; gap:10px;">
                    <input type="text" id="mem-search" placeholder="Search..." style="margin:0; width:150px; padding:8px;">
                    ${isAdmin ? `<button class="btn btn-primary" onclick="openManageMembersModal()">Manage</button>` : ''}
                </div>
            </div>
            <div id="members-container" class="grid-3">Loading...</div>
        `;

        const res = await fetch(`/api/projects/${projectId}/members/stats`);
        const allMembers = await res.json();
        const container = document.getElementById('members-container');

        const draw = (list) => {
            container.innerHTML = '';
            if(list.length===0) { container.innerHTML = 'No members.'; return; }
            list.forEach(m => {
                const total = m.total_tasks || 0;
                const done = m.completed_tasks || 0;
                const rate = total === 0 ? 0 : Math.round((done / total) * 100);
                
                const div = document.createElement('div');
                div.className = 'card text-center fade-up';
                // UPDATE: Added stats-text showing the count
                div.innerHTML = `
                    <img src="https://ui-avatars.com/api/?name=${m.username}&background=random" style="width:50px; height:50px; border-radius:50%; margin-bottom:10px;">
                    <h3>${m.username}</h3>
                    <span class="task-status-badge status-Todo">${m.role_in_project}</span>
                    
                    <div class="stats-text" style="margin-top:15px; font-weight:600; color:var(--text-main);">
                        ${done} / ${total} Tasks Done
                    </div>

                    <div style="margin-top:5px; background:#eee; height:5px; border-radius:3px;">
                        <div style="width:${rate}%; background:var(--primary); height:100%;"></div>
                    </div>
                    <small style="color:var(--text-muted)">${rate}% Completed</small>
                `;
                container.appendChild(div);
            });
        };

        draw(allMembers);

        document.getElementById('mem-search').addEventListener('keyup', (e) => {
            const term = e.target.value.toLowerCase();
            draw(allMembers.filter(m => m.username.toLowerCase().includes(term)));
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

    function renderAnnouncementItem(item, isAdmin) {
        const feed = document.getElementById('announcement-feed');
        if(!feed) return;
        if (feed.innerText === 'No news yet.') feed.innerHTML = '';

        const el = document.createElement('div');
        el.className = 'card fade-up';
        el.id = `ann-${item.id}`;
        el.style.borderLeft = '5px solid var(--primary)';
        
        // --- USE THE HELPER FUNCTION HERE ---
        const formattedMessage = formatAnnouncementText(item.message);

        el.innerHTML = `
            <div class="flex-between">
                <h3 style="color: var(--primary)">${item.title}</h3>
                <small style="color:var(--text-muted)">${new Date(item.created_at).toLocaleDateString()}</small>
            </div>
            
            <!-- Message Container -->
            <div class="mt-2" style="line-height:1.6; color: var(--text-main);">
                ${formattedMessage}
            </div>

            <div class="flex-between mt-2" style="border-top:1px solid #eee; padding-top:10px;">
                <small style="color:var(--text-light);">Posted by <strong>${item.author}</strong></small>
                ${isAdmin ? `<button class="btn-icon" style="color:#ef4444" onclick="deleteAnnouncement(${item.id})"><i class="bi bi-trash"></i></button>` : ''}
            </div>
        `;
        feed.prepend(el);
    }

    function renderSettingsPage() {
        mainContent.innerHTML = `
            <div class="flex-between mb-2">
                <h2>Settings</h2>
            </div>

            <!-- BACKUP & RESTORE SECTION (Admin Only) -->
            ${state.user.role_id === 1 ? `
            <div class="card fade-up mb-2" style="max-width: 600px; border-left: 5px solid #3b82f6;">
                <h3 class="mb-2">System Database</h3>
                
                <!-- DOWNLOAD -->
                <div class="flex-between" style="margin-bottom:20px; border-bottom:1px solid #eee; padding-bottom:15px;">
                    <div>
                        <strong>Backup</strong>
                        <p style="color:var(--text-muted); font-size:0.85rem;">Download current .db file</p>
                    </div>
                    <a href="/api/admin/backup" target="_blank" class="btn btn-outline">
                        <i class="bi bi-download"></i> Download
                    </a>
                </div>

                <!-- RESTORE -->
                <div>
                    <strong>Restore</strong>
                    <p style="color:var(--text-muted); font-size:0.85rem; margin-bottom:10px;">
                        Upload a .db file to replace the current system. 
                        <br><strong style="color:#ef4444">Warning: This will overwrite all current data and restart the server.</strong>
                    </p>
                    <form id="restore-form" style="display:flex; gap:10px; align-items:center;">
                        <input type="file" id="db-file" accept=".db" required style="margin:0; background:#fff;">
                        <button type="submit" class="btn btn-danger">Restore</button>
                    </form>
                </div>
            </div>
            ` : ''}


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

        setTimeout(() => {
            // ... existing password form listener ...

            // RESTORE FORM LISTENER
            const restoreForm = document.getElementById('restore-form');
            if(restoreForm) restoreForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                if(!confirm("⚠️ DANGER: This will delete all current data and replace it with the uploaded file. Are you sure?")) return;

                const formData = new FormData();
                const fileField = document.getElementById('db-file');
                formData.append('database', fileField.files[0]);

                const btn = restoreForm.querySelector('button');
                btn.textContent = "Restoring...";
                btn.disabled = true;

                try {
                    const res = await fetch('/api/admin/restore', {
                        method: 'POST',
                        body: formData // No headers needed, fetch handles multipart
                    });

                    if(res.ok) {
                        alert("✅ Restore Successful! The server is restarting. Please refresh the page in 5 seconds.");
                        setTimeout(() => window.location.reload(), 5000);
                    } else {
                        const err = await res.json();
                        alert("Restore Failed: " + err.error);
                        btn.textContent = "Restore";
                        btn.disabled = false;
                    }
                } catch(err) {
                    console.error(err);
                    alert("Connection failed.");
                }
            });
        }, 0);
    }

    // ==========================================
    // EXPORTED FUNCTIONS (Attached to Window)
    // ==========================================

    // --- Project Actions ---
    window.openEditProject = async (id) => {
        const project = state.projects.find(p => p.id === id);
        if(!project) return;
        
        document.getElementById('ep-id').value = project.id;
        document.getElementById('ep-name').value = project.name;
        document.getElementById('ep-desc').value = project.description || '';
        document.getElementById('ep-status').value = project.status;
        document.getElementById('ep-start').value = project.start_date;
        document.getElementById('ep-end').value = project.end_date;
        
        openModal('editProjectModal');
    };

    window.deleteProject = async (id) => {
        if(!confirm("Are you sure? This will delete all tasks and events associated with this project.")) return;
        await fetch(`/api/projects/${id}`, { method: 'DELETE' });
        loadProjects(); 
    };

    // --- Task Actions ---
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

    // --- Event/Gantt Actions ---
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

    window.deleteEvent = async () => {
        const id = document.getElementById('ev-id').value;
        if(confirm("Delete this event?")) {
            await fetch(`/api/events/${id}`, { method: 'DELETE' });
            closeModal('eventModal');
            renderGanttPage();
        }
    };

    // --- Announcement Actions ---
    window.deleteAnnouncement = async (id) => {
        if(!confirm("Remove this announcement?")) return;
        await fetch(`/api/announcements/${id}`, { method: 'DELETE' });
    };

    // --- Member Actions ---
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

    // --- User Management Actions ---
    window.deleteUser = async (id) => { 
        if(confirm('Delete User?')) { 
            await fetch(`/api/admin/users/${id}`, {method:'DELETE'}); 
            renderAccountsPage(); 
        }
    };

    async function renderLogsPage() {
        mainContent.innerHTML = `
            <div class="flex-between mb-2">
                <h2>Project Logs</h2>
                <button class="btn btn-primary" onclick="openLogModal()"><i class="bi bi-pencil-square"></i> Add Entry</button>
            </div>
            <div id="logs-container" style="display:flex; flex-direction:column; gap:15px;">Loading...</div>
        `;

        try {
            const res = await fetch(`/api/projects/${state.currentProject}/logs`);
            const logs = await res.json();
            const container = document.getElementById('logs-container');
            container.innerHTML = '';

            if (logs.length === 0) {
                container.innerHTML = `<div class="text-center" style="color:var(--text-muted); padding:40px;">No logs recorded yet.</div>`;
                return;
            }

            logs.forEach(log => {
                // Reuse the announcement text formatter for logs
                const formattedContent = formatAnnouncementText(log.content); 
                const isMyLog = state.user.role_id === 1 || state.user.username === log.author;

                const div = document.createElement('div');
                div.className = 'card fade-up';
                div.style.borderLeft = '4px solid var(--accent)';
                div.innerHTML = `
                    <div class="flex-between" style="margin-bottom:10px; border-bottom:1px dashed #eee; padding-bottom:10px;">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <i class="bi bi-person-circle" style="color:var(--text-light)"></i>
                            <strong>${log.author}</strong>
                            <small style="color:var(--text-muted)">${new Date(log.created_at).toLocaleString()}</small>
                        </div>
                        ${isMyLog ? `
                            <div style="display:flex; gap:5px;">
                                <button class="btn-icon" onclick='openEditLog(${JSON.stringify(log).replace(/'/g, "&#39;")})'><i class="bi bi-pencil"></i></button>
                                <button class="btn-icon" style="color:#ef4444" onclick="deleteLog(${log.id})"><i class="bi bi-trash"></i></button>
                            </div>
                        ` : ''}
                    </div>
                    <div style="line-height:1.6; color:var(--text-main);">${formattedContent}</div>
                `;
                container.appendChild(div);
            });
        } catch (e) { console.error(e); }
    }

    // --- INSERT EXPORTED FUNCTIONS at the bottom ---

    window.openLogModal = () => {
        document.getElementById('log-form').reset();
        document.getElementById('log-id').value = '';
        openModal('logModal');
    };

    window.openEditLog = (log) => {
        document.getElementById('log-id').value = log.id;
        document.getElementById('log-content').value = log.content;
        openModal('logModal');
    };

    window.deleteLog = async (id) => {
        if(!confirm("Delete this log entry?")) return;
        await fetch(`/api/logs/${id}`, { method: 'DELETE' });
    };

    // --- INSERT FORM LISTENER inside DOMContentLoaded ---
    const logForm = document.getElementById('log-form');
    if(logForm) logForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('log-id').value;
        const content = document.getElementById('log-content').value;
        const url = id ? `/api/logs/${id}` : '/api/logs';
        const method = id ? 'PUT' : 'POST';

        await fetch(url, {
            method: method,
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ project_id: state.currentProject, content })
        });
        closeModal('logModal');
    });

    // --- INSERT SOCKET LISTENER ---
    socket.on('log:update', (data) => {
        if (state.currentProject == data.projectId && document.querySelector('.nav-link[data-page="logs"]').classList.contains('active')) {
            renderLogsPage();
        }
    });

    // ==========================================
    // SOCKET LISTENERS
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

    socket.on('stats:online', (data) => {
        const el = document.getElementById('online-count-display');
        if(el) el.textContent = data.count;
    });

    // ==========================================
    // FORM LISTENERS
    // ==========================================

    // Event Form
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

    // Create User Form
    // Create User Form
    const cuForm = document.getElementById('create-user-form');
    if(cuForm) cuForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const payload = {
            username: document.getElementById('cu-username').value,
            email: document.getElementById('cu-email').value,
            password: document.getElementById('cu-password').value,
            role_id: document.getElementById('cu-role').value
        };

        try {
            const res = await fetch('/api/admin/users', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload)
            });

            const data = await res.json();

            if (res.ok) {
                alert("✅ User Created Successfully!");
                closeModal('createUserModal');
                document.getElementById('create-user-form').reset(); // Clear form
                renderAccountsPage(); // Refresh table
            } else {
                // Show the specific error from the backend
                alert("⚠️ Error: " + data.error);
            }
        } catch (err) {
            console.error(err);
            alert("Connection error. Please try again.");
        }
    });

    // Create Project Form
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

    // Edit Project Form
    const epForm = document.getElementById('edit-project-form');
    if(epForm) epForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('ep-id').value;
        await fetch(`/api/projects/${id}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                name: document.getElementById('ep-name').value,
                description: document.getElementById('ep-desc').value,
                status: document.getElementById('ep-status').value,
                start_date: document.getElementById('ep-start').value,
                end_date: document.getElementById('ep-end').value
            })
        });
        closeModal('editProjectModal');
        loadProjects();
    });

    // Create Task Form
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
                external_link: document.getElementById('ct-link').value,
                youtube_link: document.getElementById('ct-youtube').value,
                due_date: document.getElementById('ct-due').value,
                assigned_to_id: document.getElementById('ct-assignee').value
            })
        });
        closeModal('createTaskModal');
    });

    window.openEditTask = async (task) => {
        document.getElementById('et-id').value = task.id;
        document.getElementById('et-name').value = task.name;
        document.getElementById('et-desc').value = task.description || '';
        document.getElementById('et-link').value = task.external_link || '';
        document.getElementById('et-youtube').value = task.youtube_link || '';
        document.getElementById('et-due').value = task.due_date;

        // Load Assignees
        const res = await fetch('/api/admin/users');
        const users = await res.json();
        const sel = document.getElementById('et-assignee');
        sel.innerHTML = '<option value="">Unassigned</option>';
        users.forEach(u => {
            const op = document.createElement('option');
            op.value = u.id;
            op.innerText = u.username;
            if(u.id == task.assigned_to_id) op.selected = true;
            sel.appendChild(op);
        });
        openModal('editTaskModal');
    };

    const etForm = document.getElementById('edit-task-form');
    if(etForm) etForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('et-id').value;
        await fetch(`/api/tasks/${id}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                name: document.getElementById('et-name').value,
                description: document.getElementById('et-desc').value,
                external_link: document.getElementById('et-link').value,
                youtube_link: document.getElementById('et-youtube').value,
                due_date: document.getElementById('et-due').value,
                assigned_to_id: document.getElementById('et-assignee').value
            })
        });
        closeModal('editTaskModal');
    });

    // Manage Members Form
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
    window.openEditUser = (id) => {
        const user = state.allUsers.find(u => u.id === id);
        if(!user) return;

        document.getElementById('eu-id').value = user.id;
        document.getElementById('eu-username').value = user.username;
        document.getElementById('eu-email').value = user.email;
        // Map Role Name to ID (Admin=1, Member=2)
        document.getElementById('eu-role').value = (user.role === 'Admin') ? '1' : '2';
        document.getElementById('eu-password').value = ''; // Reset password field

        openModal('editUserModal');
    };

    // --- Form Submit Listener ---
    const euForm = document.getElementById('edit-user-form');
    if(euForm) euForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('eu-id').value;
        const payload = {
            username: document.getElementById('eu-username').value,
            email: document.getElementById('eu-email').value,
            role_id: document.getElementById('eu-role').value,
            password: document.getElementById('eu-password').value // Will be empty string if not changed
        };

        try {
            const res = await fetch(`/api/admin/users/${id}`, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            
            if(res.ok) {
                alert("User Updated Successfully");
                closeModal('editUserModal');
                renderAccountsPage();
            } else {
                alert("Error: " + data.error);
            }
        } catch(err) {
            console.error(err);
            alert("Update failed.");
        }
    });

    

    // ==========================================
    // HELPER: Format Text (YouTube, Images, Newlines)
    // ==========================================
    function formatAnnouncementText(text) {
        if (!text) return '';

        // 1. Sanitize HTML (prevent XSS)
        let safeText = text.replace(/</g, "&lt;").replace(/>/g, "&gt;");

        // 2. Convert New Lines to <br> (Essential because we return HTML)
        safeText = safeText.replace(/\n/g, '<br>');

        // 3. Embed YouTube Videos
        const youtubeRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/g;
        safeText = safeText.replace(youtubeRegex, '<div class="video-container" style="margin-top:10px;"><iframe src="https://www.youtube.com/embed/$1" frameborder="0" allowfullscreen></iframe></div>');

        // 4. Embed Images
        const imageRegex = /(https?:\/\/.*\.(?:png|jpg|jpeg|gif))/ig;
        safeText = safeText.replace(imageRegex, '<img src="$1" alt="Image" style="max-width:100%; border-radius:10px; margin-top:10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">');

        return safeText;
    }
});