const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
const fs = require("fs");

const app = express();

/* =========================================================
   CONFIG
   ========================================================= */

const PORT = Number(process.env.PORT) || 3000;
const HOST = "0.0.0.0";

const isProduction = process.env.NODE_ENV === "production";

const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, "users.db");
const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

/* =========================================================
   SECURITY CONFIG
   ========================================================= */

if (isProduction && !process.env.SESSION_SECRET) {
  console.error("FATAL: SESSION_SECRET is missing in production.");
  process.exit(1);
}

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  "local-development-secret-change-this";

const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || "")
  .trim()
  .toLowerCase();

if (isProduction && !ADMIN_EMAIL) {
  console.warn(
    "WARNING: ADMIN_EMAIL is not configured. No new admin bootstrap will occur."
  );
}

/*
  Render / reverse-proxy support.
  Only trust proxy headers in production.
*/
if (isProduction) {
  app.set("trust proxy", 1);
}

/* =========================================================
   DATABASE
   ========================================================= */

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
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

/*
  Existing databases created before the role system will not
  have a "role" column.

  Add it safely if necessary.
*/
const userColumns = db.prepare("PRAGMA table_info(users)").all();

const hasRoleColumn = userColumns.some(
  (column) => column.name === "role"
);

if (!hasRoleColumn) {
  db.exec(`
    ALTER TABLE users
    ADD COLUMN role TEXT NOT NULL DEFAULT 'user'
  `);
}

/*
  Normalize any invalid/NULL role values.
*/
db.prepare(`
  UPDATE users
  SET role = 'user'
  WHERE role IS NULL
     OR role NOT IN ('user', 'admin')
`).run();

/*
  ADMIN BOOTSTRAP

  ADMIN_EMAIL is ONLY used to bootstrap an admin account when
  there is currently no admin.

  Once an admin exists, changing ADMIN_EMAIL will NOT transfer
  admin privileges.
*/
if (ADMIN_EMAIL) {
  const adminCount = db
    .prepare(`
      SELECT COUNT(*) AS count
      FROM users
      WHERE role = 'admin'
    `)
    .get().count;

  if (adminCount === 0) {
    const matchingUser = db
      .prepare(`
        SELECT id, email
        FROM users
        WHERE lower(email) = ?
      `)
      .get(ADMIN_EMAIL);

    if (matchingUser) {
      db.prepare(`
        UPDATE users
        SET role = 'admin'
        WHERE id = ?
      `).run(matchingUser.id);

      console.log(
        `Admin bootstrap completed for ${matchingUser.email}`
      );
    } else {
      console.log(
        `Admin bootstrap waiting for account: ${ADMIN_EMAIL}`
      );
    }
  }
}

/* =========================================================
   MIDDLEWARE
   ========================================================= */

app.use(
  helmet({
    contentSecurityPolicy: false
  })
);

app.use(
  express.json({
    limit: "10kb"
  })
);

app.use(
  express.urlencoded({
    extended: false,
    limit: "10kb"
  })
);

/* =========================================================
   SESSION
   ========================================================= */

app.use(
  session({
    name: "sid",
    secret: SESSION_SECRET,

    resave: false,
    saveUninitialized: false,

    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",

      maxAge: 1000 * 60 * 60 * 24
    }
  })
);

/* =========================================================
   STATIC FILES
   ========================================================= */

app.use(
  express.static(
    path.join(__dirname, "public"),
    {
      index: "index.html",
      maxAge: isProduction ? "1h" : 0
    }
  )
);

/* =========================================================
   RATE LIMITERS
   ========================================================= */

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,

  limit: 10,

  standardHeaders: "draft-8",
  legacyHeaders: false,

  message: {
    message:
      "Too many login attempts. Please wait 15 minutes and try again."
  },

  skipSuccessfulRequests: true
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,

  limit: 10,

  standardHeaders: "draft-8",
  legacyHeaders: false,

  message: {
    message:
      "Too many registration attempts. Please try again later."
  }
});

/* =========================================================
   HELPERS
   ========================================================= */

function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getClientIp(req) {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function getUserAgent(req) {
  return String(req.get("user-agent") || "unknown")
    .slice(0, 500);
}

function safeUser(user) {
  if (!user) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.created_at
  };
}

function getCurrentUser(req) {
  if (!req.session || !req.session.userId) {
    return null;
  }

  return db
    .prepare(`
      SELECT
        id,
        name,
        email,
        role,
        created_at
      FROM users
      WHERE id = ?
    `)
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

  if (user.role !== "admin") {
    return res.status(403).json({
      message: "Admin access required."
    });
  }

  next();
}

function createLoginHistory({
  userId = null,
  email = "",
  status,
  ipAddress,
  userAgent
}) {
  db.prepare(`
    INSERT INTO login_history
      (
        user_id,
        email,
        status,
        ip_address,
        user_agent
      )
    VALUES
      (?, ?, ?, ?, ?)
  `).run(
    userId,
    email,
    status,
    ipAddress,
    userAgent
  );
}

function createActiveSession(req, userId) {
  if (!req.sessionID) return;

  db.prepare(`
    INSERT OR REPLACE INTO active_sessions
      (
        session_id,
        user_id,
        login_at,
        last_seen_at,
        active
      )
    VALUES
      (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1)
  `).run(
    req.sessionID,
    userId
  );
}

function updateActiveSession(req) {
  if (!req.sessionID || !req.session.userId) {
    return;
  }

  db.prepare(`
    UPDATE active_sessions
    SET last_seen_at = CURRENT_TIMESTAMP
    WHERE session_id = ?
      AND user_id = ?
      AND active = 1
  `).run(
    req.sessionID,
    req.session.userId
  );
}

function closeActiveSession(req) {
  if (!req.sessionID) return;

  db.prepare(`
    UPDATE active_sessions
    SET
      active = 0,
      last_seen_at = CURRENT_TIMESTAMP
    WHERE session_id = ?
  `).run(req.sessionID);
}

/*
  Mark sessions inactive if they have not been seen for 24 hours.
*/
function cleanupStaleSessions() {
  db.prepare(`
    UPDATE active_sessions
    SET active = 0
    WHERE active = 1
      AND datetime(last_seen_at) <
          datetime('now', '-24 hours')
  `).run();
}

cleanupStaleSessions();

setInterval(
  cleanupStaleSessions,
  15 * 60 * 1000
).unref();

/* =========================================================
   OPTIONAL CSRF / ORIGIN CHECK
   ========================================================= */

function checkSameOrigin(req, res, next) {
  if (!isProduction) {
    return next();
  }

  const origin = req.get("origin");

  /*
    Browsers may omit Origin on some normal requests.
    If it exists, make sure it belongs to our own site.
  */
  if (!origin) {
    return next();
  }

  try {
    const originUrl = new URL(origin);

    const host = req.get("host");

    if (originUrl.host !== host) {
      return res.status(403).json({
        message: "Invalid request origin."
      });
    }
  } catch {
    return res.status(403).json({
      message: "Invalid request origin."
    });
  }

  next();
}

/* =========================================================
   REGISTER
   ========================================================= */

app.post(
  "/api/register",
  registerLimiter,
  checkSameOrigin,
  async (req, res) => {
    try {
      const name = String(req.body.name || "").trim();
      const email = normalizeEmail(req.body.email);
      const password = String(req.body.password || "");

      if (name.length < 2 || name.length > 80) {
        return res.status(400).json({
          message: "Name must be 2–80 characters."
        });
      }

      if (
        !validEmail(email) ||
        email.length > 254
      ) {
        return res.status(400).json({
          message: "Enter a valid email address."
        });
      }

      if (
        password.length < 8 ||
        password.length > 128
      ) {
        return res.status(400).json({
          message:
            "Password must be 8–128 characters."
        });
      }

      const existing = db
        .prepare(`
          SELECT id
          FROM users
          WHERE email = ?
        `)
        .get(email);

      if (existing) {
        return res.status(409).json({
          message:
            "An account with that email already exists."
        });
      }

      const passwordHash = await bcrypt.hash(
        password,
        12
      );

      const result = db
        .prepare(`
          INSERT INTO users
            (
              name,
              email,
              password_hash,
              role
            )
          VALUES
            (?, ?, ?, 'user')
        `)
        .run(
          name,
          email,
          passwordHash
        );

      const user = db
        .prepare(`
          SELECT
            id,
            name,
            email,
            role,
            created_at
          FROM users
          WHERE id = ?
        `)
        .get(result.lastInsertRowid);

      /*
        Regenerate session after registration to prevent
        session fixation.
      */
      req.session.regenerate((err) => {
        if (err) {
          console.error(
            "Registration session error:",
            err
          );

          return res.status(500).json({
            message:
              "Account created, but session could not be created."
          });
        }

        req.session.userId = user.id;

        createActiveSession(
          req,
          user.id
        );

        createLoginHistory({
          userId: user.id,
          email: user.email,
          status: "REGISTER",
          ipAddress: getClientIp(req),
          userAgent: getUserAgent(req)
        });

        return res.status(201).json({
          message:
            "Account created successfully.",
          user: safeUser(user),
          isAdmin: user.role === "admin"
        });
      });
    } catch (error) {
      console.error(
        "Register error:",
        error
      );

      return res.status(500).json({
        message: "Server error."
      });
    }
  }
);

/* =========================================================
   LOGIN
   ========================================================= */

app.post(
  "/api/login",
  loginLimiter,
  checkSameOrigin,
  async (req, res) => {
    try {
      const email = normalizeEmail(
        req.body.email
      );

      const password = String(
        req.body.password || ""
      );

      const ipAddress =
        getClientIp(req);

      const userAgent =
        getUserAgent(req);

      if (
        !validEmail(email) ||
        !password
      ) {
        createLoginHistory({
          email,
          status: "FAILED",
          ipAddress,
          userAgent
        });

        return res.status(400).json({
          message:
            "Email and password are required."
        });
      }

      const user = db
        .prepare(`
          SELECT *
          FROM users
          WHERE email = ?
        `)
        .get(email);

      /*
        Keep the external response identical whether
        the account exists or not.
      */
      if (!user) {
        createLoginHistory({
          email,
          status: "FAILED",
          ipAddress,
          userAgent
        });

        return res.status(401).json({
          message:
            "Invalid email or password."
        });
      }

      const passwordOk =
        await bcrypt.compare(
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
          message:
            "Invalid email or password."
        });
      }

      /*
        Session fixation protection.
        Destroy the old session ID and create a new one.
      */
      req.session.regenerate((err) => {
        if (err) {
          console.error(
            "Session regeneration error:",
            err
          );

          return res.status(500).json({
            message:
              "Could not create secure session."
          });
        }

        req.session.userId =
          user.id;

        createActiveSession(
          req,
          user.id
        );

        createLoginHistory({
          userId: user.id,
          email: user.email,
          status: "SUCCESS",
          ipAddress,
          userAgent
        });

        return res.json({
          message:
            "Login successful.",
          user: safeUser(user),
          isAdmin:
            user.role === "admin"
        });
      });
    } catch (error) {
      console.error(
        "Login error:",
        error
      );

      return res.status(500).json({
        message: "Server error."
      });
    }
  }
);

/* =========================================================
   CURRENT USER
   ========================================================= */

app.get(
  "/api/me",
  (req, res) => {
    const user =
      getCurrentUser(req);

    if (!user) {
      return res.status(401).json({
        authenticated: false
      });
    }

    updateActiveSession(req);

    return res.json({
      authenticated: true,
      user: safeUser(user),
      isAdmin:
        user.role === "admin"
    });
  }
);

/* =========================================================
   LOGOUT
   ========================================================= */

app.post(
  "/api/logout",
  checkSameOrigin,
  (req, res) => {
    closeActiveSession(req);

    req.session.destroy((err) => {
      if (err) {
        console.error(
          "Logout error:",
          err
        );

        return res.status(500).json({
          message:
            "Could not log out."
        });
      }

      res.clearCookie("sid");

      return res.json({
        message: "Logged out."
      });
    });
  }
);

/* =========================================================
   DASHBOARD
   ========================================================= */

app.get(
  "/dashboard",
  (req, res) => {
    if (!req.session.userId) {
      return res.redirect("/");
    }

    res.sendFile(
      path.join(
        __dirname,
        "public",
        "dashboard.html"
      )
    );
  }
);

/* =========================================================
   ADMIN PAGE
   ========================================================= */

app.get(
  "/admin",
  (req, res) => {
    const user =
      getCurrentUser(req);

    if (!user) {
      return res.redirect("/");
    }

    if (user.role !== "admin") {
      return res.redirect("/dashboard");
    }

    res.sendFile(
      path.join(
        __dirname,
        "public",
        "admin.html"
      )
    );
  }
);

/* =========================================================
   ADMIN - ME
   ========================================================= */

app.get(
  "/api/admin/me",
  requireAdmin,
  (req, res) => {
    const user =
      getCurrentUser(req);

    return res.json({
      authenticated: true,
      admin: true,
      user: safeUser(user)
    });
  }
);

/* =========================================================
   ADMIN - STATS
   ========================================================= */

app.get(
  "/api/admin/stats",
  requireAdmin,
  (req, res) => {
    cleanupStaleSessions();

    const totalUsers =
      db.prepare(`
        SELECT COUNT(*) AS count
        FROM users
      `).get().count;

    const totalLogins =
      db.prepare(`
        SELECT COUNT(*) AS count
        FROM login_history
        WHERE status = 'SUCCESS'
      `).get().count;

    const failedLogins =
      db.prepare(`
        SELECT COUNT(*) AS count
        FROM login_history
        WHERE status = 'FAILED'
      `).get().count;

    const activeUsers =
      db.prepare(`
        SELECT COUNT(DISTINCT user_id) AS count
        FROM active_sessions
        WHERE active = 1
      `).get().count;

    return res.json({
      totalUsers,
      totalLogins,
      failedLogins,
      activeUsers
    });
  }
);

/* =========================================================
   ADMIN - USERS
   ========================================================= */

app.get(
  "/api/admin/users",
  requireAdmin,
  (req, res) => {
    cleanupStaleSessions();

    const users =
      db.prepare(`
        SELECT
          u.id,
          u.name,
          u.email,
          u.role,
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
      `).all();

    return res.json({
      users
    });
  }
);

/* =========================================================
   ADMIN - LOGIN HISTORY
   ========================================================= */

app.get(
  "/api/admin/login-history",
  requireAdmin,
  (req, res) => {
    const parsedLimit =
      Number.parseInt(
        req.query.limit || "100",
        10
      );

    const limit =
      Number.isFinite(parsedLimit)
        ? Math.min(
            Math.max(
              parsedLimit,
              1
            ),
            500
          )
        : 100;

    const history =
      db.prepare(`
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
      `).all(limit);

    return res.json({
      history
    });
  }
);

/* =========================================================
   ADMIN - ACTIVE SESSIONS
   ========================================================= */

app.get(
  "/api/admin/active-sessions",
  requireAdmin,
  (req, res) => {
    cleanupStaleSessions();

    const sessions =
      db.prepare(`
        SELECT
          s.id,
          s.user_id,
          u.name,
          u.email,
          u.role,
          s.login_at,
          s.last_seen_at
        FROM active_sessions s

        INNER JOIN users u
          ON u.id = s.user_id

        WHERE s.active = 1

        ORDER BY s.last_seen_at DESC
      `).all();

    return res.json({
      sessions
    });
  }
);

/* =========================================================
   HEALTH CHECK
   ========================================================= */

app.get(
  "/health",
  (req, res) => {
    return res.json({
      status: "ok",
      service:
        "AimXContrra Auth System"
    });
  }
);

/* =========================================================
   404 API HANDLER
   ========================================================= */

app.use(
  "/api",
  (req, res) => {
    return res.status(404).json({
      message: "API endpoint not found."
    });
  }
);

/* =========================================================
   ERROR HANDLER
   ========================================================= */

app.use(
  (err, req, res, next) => {
    console.error(
      "Unhandled error:",
      err
    );

    if (res.headersSent) {
      return next(err);
    }

    return res.status(500).json({
      message: "Internal server error."
    });
  }
);

/* =========================================================
   START SERVER
   ========================================================= */

app.listen(
  PORT,
  HOST,
  () => {
    console.log(
      "========================================"
    );

    console.log(
      "AimXContrra Auth System"
    );

    console.log(
      `Running on http://${HOST}:${PORT}`
    );

    console.log(
      `Database: ${dbPath}`
    );

    console.log(
      `Production: ${isProduction}`
    );

    console.log(
      "========================================"
    );
  }
);