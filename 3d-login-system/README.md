# 3D Login System

## Requirements
- Node.js 20+ recommended
- npm

## Run
1. Open this folder in VS Code.
2. Open the VS Code terminal.
3. Run:
   npm install
4. Start:
   npm start
5. Open:
   http://localhost:3000

The SQLite database is created automatically at data/users.db.

Features:
- Registration
- Login
- bcrypt password hashing
- SQLite user database
- Express API
- HttpOnly session cookie
- Logout
- Protected dashboard
- 3D mouse-following UI
- Responsive design

For production, use a strong SESSION_SECRET, HTTPS, secure cookies, rate limiting, CSRF protection, a persistent session store, and proper account recovery/email verification.
