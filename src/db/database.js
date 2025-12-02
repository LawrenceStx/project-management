// src/db/database.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// --- RAILWAY VOLUME FIX ---
// process.cwd() gets the root folder of the app (/app)
// We join it with 'data' to get /app/data
const DATA_FOLDER = path.join(process.cwd(), 'data');

// 1. Ensure the 'data' folder exists (Vital for Railway)
if (!fs.existsSync(DATA_FOLDER)) {
    fs.mkdirSync(DATA_FOLDER, { recursive: true });
    console.log(`Created database folder at: ${DATA_FOLDER}`);
}

// 2. Define path to apex.db inside the volume
const DB_PATH = path.join(DATA_FOLDER, 'apex.db');
console.log(`Connecting to database at: ${DB_PATH}`);

// Connect to the database
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('Error connecting to database:', err.message);
        throw err;
    }
    console.log('Connected to the SQLite database.');
});

// Function to initialize tables
const initDb = () => {
    db.serialize(() => {
        db.run("PRAGMA foreign_keys = ON;");

        // 1. Users Table
        db.run(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                role_id INTEGER NOT NULL DEFAULT 2,
                is_active BOOLEAN NOT NULL DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 2. Roles Table
        db.run(`
            CREATE TABLE IF NOT EXISTS roles (
                id INTEGER PRIMARY KEY,
                name TEXT UNIQUE NOT NULL
            );
        `, (err) => {
            if (!err) {
                db.run(`INSERT OR IGNORE INTO roles (id, name) VALUES (1, 'Admin')`);
                db.run(`INSERT OR IGNORE INTO roles (id, name) VALUES (2, 'Member')`);
            }
        });

        // 3. Projects Table
        db.run(`
            CREATE TABLE IF NOT EXISTS projects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                status TEXT NOT NULL DEFAULT 'Planning',
                start_date DATE,
                end_date DATE,
                created_by_id INTEGER,
                FOREIGN KEY (created_by_id) REFERENCES users(id)
            );
        `);

        // 4. Project Members
        db.run(`
            CREATE TABLE IF NOT EXISTS project_members (
                project_id INTEGER,
                user_id INTEGER,
                role_in_project TEXT,
                PRIMARY KEY (project_id, user_id),
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
        `);

        // 5. Tasks
        db.run(`
            CREATE TABLE IF NOT EXISTS tasks (
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
            );
        `);

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
            FOREIGN KEY(project_id) REFERENCES projects(id)
        )`);

        console.log('Database schema initialized.');
    });
};

initDb();

module.exports = db;