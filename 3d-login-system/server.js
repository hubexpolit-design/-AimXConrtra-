const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const app = express();

const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";

// -----------------------------
// Database
// -----------------------------

const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, "users.db"));

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

// -----------------------------
// Middleware
// -----------------------------

app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: false }));

const isProduction = process.env.NODE_ENV === "production";

app.set("trust proxy", 1);

app.use(
  session({
    name: "sid",

    secret:
      process.env.SESSION_SECRET ||
      "local-development-secret-change-in-production",

    resave: false,
    saveUninitialized: false,

    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
      maxAge: 1000 * 60 * 60 * 24
    }
  })
);

// -----------------------------
// Static files
// -----------------------------

app.use(express.static(path.join(__dirname, "public")));

// -----------------------------
// Helpers
// -----------------------------

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function safeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.created_at
  };
}

// -----------------------------
// Register
// -----------------------------

app.post("/api/register", async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();

    const password = String(req.body.password || "");

    if (name.length < 2 || name.length > 80) {
      return res
        .status(400)
        .json({ message: "Name must be 2–80 characters." });
    }

    if (!validEmail(email) || email.length > 254) {
      return res
        .status(400)
        .json({ message: "Enter a valid email address." });
    }

    if (password.length < 8 || password.length > 128) {
      return res
        .status(400)
        .json({ message: "Password must be 8–128 characters." });
    }

    const existing = db
      .prepare("SELECT id FROM users WHERE email = ?")
      .get(email);

    if (existing) {
      return res.status(409).json({
        message: "An account with that email already exists."
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = db
      .prepare(`
        INSERT INTO users (name, email, password_hash)
        VALUES (?, ?, ?)
      `)
      .run(name, email, passwordHash);

    const user = db
      .prepare(
        "SELECT id, name, email, created_at FROM users WHERE id = ?"
      )
      .get(result.lastInsertRowid);

    req.session.userId = user.id;

    res.status(201).json({
      message: "Account created successfully.",
      user: safeUser(user)
    });
  } catch (error) {
    console.error("Register error:", error);

    res.status(500).json({
      message: "Server error."
    });
  }
});

// -----------------------------
// Login
// -----------------------------

app.post("/api/login", async (req, res) => {
  try {
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();

    const password = String(req.body.password || "");

    if (!validEmail(email) || !password) {
      return res.status(400).json({
        message: "Email and password are required."
      });
    }

    const user = db
      .prepare("SELECT * FROM users WHERE email = ?")
      .get(email);

    if (!user) {
      return res.status(401).json({
        message: "Invalid email or password."
      });
    }

    const passwordOk = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordOk) {
      return res.status(401).json({
        message: "Invalid email or password."
      });
    }

    req.session.regenerate((err) => {
      if (err) {
        console.error("Session error:", err);

        return res.status(500).json({
          message: "Could not create session."
        });
      }

      req.session.userId = user.id;

      res.json({
        message: "Login successful.",
        user: safeUser(user)
      });
    });
  } catch (error) {
    console.error("Login error:", error);

    res.status(500).json({
      message: "Server error."
    });
  }
});

// -----------------------------
// Current user
// -----------------------------

app.get("/api/me", (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({
      authenticated: false
    });
  }

  const user = db
    .prepare(
      "SELECT id, name, email, created_at FROM users WHERE id = ?"
    )
    .get(req.session.userId);

  if (!user) {
    req.session.destroy(() => {});

    return res.status(401).json({
      authenticated: false
    });
  }

  res.json({
    authenticated: true,
    user: safeUser(user)
  });
});

// -----------------------------
// Logout
// -----------------------------

app.post("/api/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({
        message: "Could not log out."
      });
    }

    res.clearCookie("sid");

    res.json({
      message: "Logged out."
    });
  });
});

// -----------------------------
// Protected dashboard
// -----------------------------

app.get("/dashboard", (req, res) => {
  if (!req.session.userId) {
    return res.redirect("/");
  }

  res.sendFile(
    path.join(__dirname, "public", "dashboard.html")
  );
});

// -----------------------------
// Health check
// -----------------------------

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "3D Login System"
  });
});

// -----------------------------
// Start server
// -----------------------------

app.listen(PORT, HOST, () => {
  console.log(
    `3D Login System running on http://${HOST}:${PORT}`
  );
});