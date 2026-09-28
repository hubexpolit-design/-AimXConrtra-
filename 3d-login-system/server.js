const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const app = express();

const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";

const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, "users.db"));

db.pragma("journal_mode = WAL");

// =====================================================
// DATABASE
// =====================================================

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS login_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    email TEXT NOT NULL,
    status TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS active_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL,
    login_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    active INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// =====================================================
// MIDDLEWARE
// =====================================================

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

// =====================================================
// STATIC FILES
// =====================================================

app.use(express.static(path.join(__dirname, "public")));

// =====================================================
// HELPERS
// =====================================================

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];

  if (forwarded) {
    return String(forwarded).split(",")[0].trim();
  }

  return req.socket.remoteAddress || "unknown";
}

function safeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.created_at
  };
}

function getAdminEmail() {
  return String(process.env.ADMIN_EMAIL || "")
    .trim()
    .toLowerCase();
}

function isAdminUser(user) {
  if (!user) return false;

  const adminEmail = getAdminEmail();

  return Boolean(adminEmail && user.email.toLowerCase() === adminEmail);
}

function getCurrentUser(req) {
  if (!req.session.userId) {
    return null;
  }

  return db
    .prepare(
      `
      SELECT id, name, email, created_at
      FROM users
      WHERE id = ?
      `
    )
    .get(req.session.userId);
}

function requireLogin(req, res, next) {
  const user = getCurrentUser(req);

  if (!user) {
    return res.status(401).json({
      authenticated: false,
      message: "Authentication required."
    });
  }

  next();
}

function requireAdmin(req, res, next) {
  const user = getCurrentUser(req);

  if (!user) {
    return res.status(401).json({
      message: "Authentication required."
    });
  }

  if (!isAdminUser(user)) {
    return res.status(403).json({
      message: "Admin access required."
    });
  }

  next();
}

function createLoginHistory({
  userId = null,
  email,
  status,
  ipAddress,
  userAgent
}) {
  db.prepare(
    `
    INSERT INTO login_history
      (user_id, email, status, ip_address, user_agent)
    VALUES
      (?, ?, ?, ?, ?)
    `
  ).run(
    userId,
    email,
    status,
    ipAddress,
    userAgent
  );
}

function createActiveSession(req, userId) {
  if (!req.sessionID) return;

  db.prepare(
    `
    INSERT OR REPLACE INTO active_sessions
      (session_id, user_id, login_at, last_seen_at, active)
    VALUES
      (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)
    `
  ).run(req.sessionID, userId);
}

function updateActiveSession(req) {
  if (!req.sessionID || !req.session.userId) return;

  db.prepare(
    `
    UPDATE active_sessions
    SET last_seen_at = CURRENT_TIMESTAMP
    WHERE session_id = ?
      AND user_id = ?
      AND active = 1
    `
  ).run(req.sessionID, req.session.userId);
}

function closeActiveSession(req) {
  if (!req.sessionID) return;

  db.prepare(
    `
    UPDATE active_sessions
    SET active = 0,
        last_seen_at = CURRENT_TIMESTAMP
    WHERE session_id = ?
    `
  ).run(req.sessionID);
}

// =====================================================
// REGISTER
// =====================================================

app.post("/api/register", async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();

    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();

    const password = String(req.body.password || "");

    if (name.length < 2 || name.length > 80) {
      return res.status(400).json({
        message: "Name must be 2–80 characters."
      });
    }

    if (!validEmail(email) || email.length > 254) {
      return res.status(400).json({
        message: "Enter a valid email address."
      });
    }

    if (password.length < 8 || password.length > 128) {
      return res.status(400).json({
        message: "Password must be 8–128 characters."
      });
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
      .prepare(
        `
        INSERT INTO users
          (name, email, password_hash)
        VALUES
          (?, ?, ?)
        `
      )
      .run(name, email, passwordHash);

    const user = db
      .prepare(
        `
        SELECT id, name, email, created_at
        FROM users
        WHERE id = ?
        `
      )
      .get(result.lastInsertRowid);

    req.session.userId = user.id;

    createActiveSession(req, user.id);

    createLoginHistory({
      userId: user.id,
      email: user.email,
      status: "REGISTER",
      ipAddress: getClientIp(req),
      userAgent: req.get("user-agent") || "unknown"
    });

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

// =====================================================
// LOGIN
// =====================================================

app.post("/api/login", async (req, res) => {
  try {
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();

    const password = String(req.body.password || "");

    const ipAddress = getClientIp(req);
    const userAgent = req.get("user-agent") || "unknown";

    if (!validEmail(email) || !password) {
      createLoginHistory({
        email,
        status: "FAILED",
        ipAddress,
        userAgent
      });

      return res.status(400).json({
        message: "Email and password are required."
      });
    }

    const user = db
      .prepare("SELECT * FROM users WHERE email = ?")
      .get(email);

    if (!user) {
      createLoginHistory({
        email,
        status: "FAILED",
        ipAddress,
        userAgent
      });

      return res.status(401).json({
        message: "Invalid email or password."
      });
    }

    const passwordOk = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordOk) {
      createLoginHistory({
        userId: user.id,
        email: user.email,
        status: "FAILED",
        ipAddress,
        userAgent
      });

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

      createActiveSession(req, user.id);

      createLoginHistory({
        userId: user.id,
        email: user.email,
        status: "SUCCESS",
        ipAddress,
        userAgent
      });

      res.json({
        message: "Login successful.",
        user: safeUser(user),
        isAdmin: isAdminUser(user)
      });
    });
  } catch (error) {
    console.error("Login error:", error);

    res.status(500).json({
      message: "Server error."
    });
  }
});

// =====================================================
// CURRENT USER
// =====================================================

app.get("/api/me", (req, res) => {
  const user = getCurrentUser(req);

  if (!user) {
    return res.status(401).json({
      authenticated: false
    });
  }

  updateActiveSession(req);

  res.json({
    authenticated: true,
    user: safeUser(user),
    isAdmin: isAdminUser(user)
  });
});

// =====================================================
// LOGOUT
// =====================================================

app.post("/api/logout", (req, res) => {
  closeActiveSession(req);

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

// =====================================================
// USER DASHBOARD
// =====================================================

app.get("/dashboard", (req, res) => {
  if (!req.session.userId) {
    return res.redirect("/");
  }

  res.sendFile(
    path.join(__dirname, "public", "dashboard.html")
  );
});

// =====================================================
// ADMIN PAGE
// =====================================================

app.get("/admin", (req, res) => {
  const user = getCurrentUser(req);

  if (!user) {
    return res.redirect("/");
  }

  if (!isAdminUser(user)) {
    return res.redirect("/dashboard");
  }

  res.sendFile(
    path.join(__dirname, "public", "admin.html")
  );
});

// =====================================================
// ADMIN - CURRENT ADMIN
// =====================================================

app.get("/api/admin/me", requireAdmin, (req, res) => {
  const user = getCurrentUser(req);

  res.json({
    authenticated: true,
    admin: true,
    user: safeUser(user)
  });
});

// =====================================================
// ADMIN - STATS
// =====================================================

app.get("/api/admin/stats", requireAdmin, (req, res) => {
  const totalUsers = db
    .prepare("SELECT COUNT(*) AS count FROM users")
    .get().count;

  const totalLogins = db
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM login_history
      WHERE status = 'SUCCESS'
      `
    )
    .get().count;

  const failedLogins = db
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM login_history
      WHERE status = 'FAILED'
      `
    )
    .get().count;

  const activeUsers = db
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM active_sessions
      WHERE active = 1
      `
    )
    .get().count;

  res.json({
    totalUsers,
    totalLogins,
    failedLogins,
    activeUsers
  });
});

// =====================================================
// ADMIN - USERS LIST
// =====================================================

app.get("/api/admin/users", requireAdmin, (req, res) => {
  const users = db
    .prepare(
      `
      SELECT
        u.id,
        u.name,
        u.email,
        u.created_at,
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM active_sessions s
            WHERE s.user_id = u.id
              AND s.active = 1
          )
          THEN 1
          ELSE 0
        END AS online
      FROM users u
      ORDER BY u.id DESC
      `
    )
    .all();

  res.json({
    users
  });
});

// =====================================================
// ADMIN - LOGIN HISTORY
// =====================================================

app.get("/api/admin/login-history", requireAdmin, (req, res) => {
  const limit = Math.min(
    Math.max(
      Number.parseInt(req.query.limit || "100", 10),
      1
    ),
    500
  );

  const history = db
    .prepare(
      `
      SELECT
        id,
        user_id,
        email,
        status,
        ip_address,
        user_agent,
        created_at
      FROM login_history
      ORDER BY id DESC
      LIMIT ?
      `
    )
    .all(limit);

  res.json({
    history
  });
});

// =====================================================
// ADMIN - ACTIVE SESSIONS
// =====================================================

app.get("/api/admin/active-sessions", requireAdmin, (req, res) => {
  const sessions = db
    .prepare(
      `
      SELECT
        s.id,
        s.user_id,
        u.name,
        u.email,
        s.login_at,
        s.last_seen_at
      FROM active_sessions s
      INNER JOIN users u
        ON u.id = s.user_id
      WHERE s.active = 1
      ORDER BY s.last_seen_at DESC
      `
    )
    .all();

  res.json({
    sessions
  });
});

// =====================================================
// HEALTH
// =====================================================

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "AimXContrra Auth System"
  });
});

// =====================================================
// START
// =====================================================

app.listen(PORT, HOST, () => {
  console.log(
    `AimXContrra Auth System running on http://${HOST}:${PORT}`
  );
});