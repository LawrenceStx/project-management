// src/db/database.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DATA_FOLDER = path.join(process.cwd(), 'data');

if (!fs.existsSync(DATA_FOLDER)) {
    fs.mkdirSync(DATA_FOLDER, { recursive: true });
}

const DB_PATH = path.join(DATA_FOLDER, 'apex.db');
const db = new sqlite3.Database(DB_PATH);

const initDb = () => {
    db.serialize(() => {
        db.run("PRAGMA foreign_keys = ON;");

        // 1. Users
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role_id INTEGER NOT NULL DEFAULT 2,
            is_active BOOLEAN NOT NULL DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // 2. Roles
        db.run(`CREATE TABLE IF NOT EXISTS roles (id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL)`, (err) => {
            if (!err) {
                db.run(`INSERT OR IGNORE INTO roles (id, name) VALUES (1, 'Admin')`);
                db.run(`INSERT OR IGNORE INTO roles (id, name) VALUES (2, 'Member')`);
            }
        });

        // 3. Projects
        db.run(`CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            status TEXT NOT NULL DEFAULT 'Planning',
            start_date DATE,
            end_date DATE,
            created_by_id INTEGER,
            FOREIGN KEY (created_by_id) REFERENCES users(id)
        )`);

        // 4. Project Members
        db.run(`CREATE TABLE IF NOT EXISTS project_members (
            project_id INTEGER,
            user_id INTEGER,
            role_in_project TEXT,
            PRIMARY KEY (project_id, user_id),
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`);

        // 5. Tasks (Original Structure)
        db.run(`CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            assigned_to_id INTEGER,
            name TEXT NOT NULL,
            description TEXT,
            status TEXT DEFAULT 'Todo',
            due_date DATE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
            FOREIGN KEY (assigned_to_id) REFERENCES users(id) ON DELETE SET NULL
        )`);

        // 6. Announcements
        db.run(`CREATE TABLE IF NOT EXISTS announcements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            message TEXT,
            created_by INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(created_by) REFERENCES users(id)
        )`);

        // 7. Gantt Events
        db.run(`CREATE TABLE IF NOT EXISTS project_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER,
            name TEXT,
            start_date TEXT,
            end_date TEXT,
            description TEXT,
            color TEXT DEFAULT '#10b981',
            FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
        )`);


        // 8. Project Logs (Notes)
        db.run(`CREATE TABLE IF NOT EXISTS project_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER,
            content TEXT NOT NULL,
            created_by_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
            FOREIGN KEY(created_by_id) REFERENCES users(id)
        )`);

        // 9. Event Assignees (NEW)
        db.run(`CREATE TABLE IF NOT EXISTS event_assignees (
            event_id INTEGER,
            user_id INTEGER,
            PRIMARY KEY (event_id, user_id),
            FOREIGN KEY (event_id) REFERENCES project_events(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`);

        // ============================================================
        // SAFE MIGRATION: Add new columns if they don't exist
        // ============================================================
        const addColumn = (table, col, type) => {
            db.run(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`, (err) => {
                // Ignore "duplicate column name" error, report others
                if (err && !err.message.includes('duplicate column name')) {
                    console.error(`Migration Error (${col}):`, err.message);
                } else if (!err) {
                    console.log(`MIGRATION SUCCESS: Added ${col} to ${table}`);
                }
            });
        };

        addColumn('tasks', 'external_link', 'TEXT');
        addColumn('tasks', 'youtube_link', 'TEXT');
        addColumn('project_logs', 'log_date', 'DATE');
        // ============================================================

        
        console.log('Database initialized.');
    });
};

initDb();

module.exports = db;