require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const session = require('express-session');
const db = require('./src/db/database');

// Initialize App and Server
const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'supersecretdefaultkey';

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- FIX: Attach IO to every request here ---
app.use((req, res, next) => {
    req.io = io;
    next();
});
// --------------------------------------------

// Session Setup
app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 1000 * 60 * 60 * 24 } // secure: false for localhost
}));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Routes (Must be required AFTER io is initialized)
const authRoutes = require('./src/routes/authRoutes');
const apiRoutes = require('./src/routes/apiRoutes');

app.use('/api/auth', authRoutes);
app.use('/api', apiRoutes);

// Root Route
app.get('/', (req, res) => {
    if (req.session.user) {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    } else {
        res.sendFile(path.join(__dirname, 'public', 'login.html'));
    }
});

let onlineUsersCount = 0;

io.on('connection', (socket) => {
    onlineUsersCount++;
    // Broadcast new count to all clients
    io.emit('stats:online', { count: onlineUsersCount });

    console.log('User connected. Total:', onlineUsersCount);

    socket.on('disconnect', () => {
        onlineUsersCount--;
        io.emit('stats:online', { count: onlineUsersCount });
        console.log('User disconnected. Total:', onlineUsersCount);
    });
});

server.listen(PORT, () => {
    console.log(`Apex Systems server running on http://localhost:${PORT}`);
});