<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <title>AimXContrra | Admin Dashboard</title>

  <style>
    * {
      box-sizing: border-box;
    }

    :root {
      --bg: #020603;
      --panel: rgba(5, 18, 10, .86);
      --panel2: rgba(8, 25, 14, .75);
      --green: #00ff55;
      --lime: #b7ff00;
      --yellow: #ffe600;
      --blue: #00aaff;
      --text: #f4fff6;
      --muted: #91a69a;
      --danger: #ff5252;
      --border: rgba(0, 255, 85, .18);
    }

    body {
      margin: 0;
      min-height: 100vh;
      color: var(--text);
      background:
        radial-gradient(circle at 10% 10%, rgba(0,255,85,.12), transparent 30%),
        radial-gradient(circle at 90% 80%, rgba(255,230,0,.08), transparent 30%),
        #010301;
      font-family: Inter, Segoe UI, Arial, sans-serif;
    }

    button {
      font: inherit;
    }

    .background {
      position: fixed;
      inset: 0;
      overflow: hidden;
      pointer-events: none;
    }

    .orb {
      position: absolute;
      width: 350px;
      height: 350px;
      border-radius: 50%;
      filter: blur(100px);
      opacity: .12;
    }

    .orb.green {
      background: var(--green);
      top: -150px;
      left: -120px;
    }

    .orb.yellow {
      background: var(--yellow);
      right: -150px;
      bottom: -150px;
    }

    .app {
      position: relative;
      z-index: 2;
      display: grid;
      grid-template-columns: 240px 1fr;
      min-height: 100vh;
    }

    .sidebar {
      padding: 25px 18px;
      border-right: 1px solid var(--border);
      background: rgba(0, 8, 4, .82);
      backdrop-filter: blur(20px);
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 35px;
      font-weight: 900;
      letter-spacing: 1px;
    }

    .brand img {
      width: 45px;
      height: 45px;
      object-fit: cover;
      border-radius: 50%;
      border: 2px solid var(--green);
      box-shadow: 0 0 20px rgba(0,255,85,.3);
    }

    .brand span {
      color: var(--lime);
    }

    .nav {
      display: grid;
      gap: 8px;
    }

    .nav button {
      width: 100%;
      padding: 13px 15px;
      text-align: left;
      border: 1px solid transparent;
      border-radius: 12px;
      color: var(--muted);
      background: transparent;
      cursor: pointer;
    }

    .nav button:hover,
    .nav button.active {
      color: white;
      border-color: var(--border);
      background: rgba(0,255,85,.07);
    }

    .sidebar-bottom {
      margin-top: 35px;
    }

    .logout {
      width: 100%;
      padding: 13px;
      border: 1px solid rgba(255,82,82,.25);
      border-radius: 12px;
      color: #ffb5b5;
      background: rgba(255,50,50,.06);
      cursor: pointer;
    }

    .main {
      padding: 30px;
      min-width: 0;
    }

    .topbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 20px;
      margin-bottom: 30px;
    }

    .topbar h1 {
      margin: 0;
      font-size: clamp(25px, 4vw, 38px);
    }

    .topbar p {
      margin: 7px 0 0;
      color: var(--muted);
    }

    .admin-badge {
      padding: 10px 15px;
      border: 1px solid rgba(183,255,0,.25);
      border-radius: 999px;
      color: var(--lime);
      background: rgba(183,255,0,.06);
      font-size: 12px;
      font-weight: 800;
    }

    .stats {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 15px;
      margin-bottom: 25px;
    }

    .stat {
      padding: 22px;
      border: 1px solid var(--border);
      border-radius: 18px;
      background: var(--panel);
      box-shadow: 0 20px 50px rgba(0,0,0,.25);
    }

    .stat small {
      color: var(--muted);
    }

    .stat strong {
      display: block;
      margin-top: 10px;
      font-size: 30px;
    }

    .section {
      display: none;
    }

    .section.active {
      display: block;
    }

    .panel {
      overflow: hidden;
      border: 1px solid var(--border);
      border-radius: 20px;
      background: var(--panel);
      box-shadow: 0 25px 70px rgba(0,0,0,.3);
    }

    .panel-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px;
      border-bottom: 1px solid rgba(255,255,255,.06);
    }

    .panel-head h2 {
      margin: 0;
      font-size: 18px;
    }

    .refresh {
      padding: 8px 13px;
      border: 1px solid var(--border);
      border-radius: 9px;
      color: var(--lime);
      background: transparent;
      cursor: pointer;
    }

    .table-wrap {
      overflow-x: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 650px;
    }

    th,
    td {
      padding: 15px 18px;
      text-align: left;
      border-bottom: 1px solid rgba(255,255,255,.05);
      font-size: 13px;
    }

    th {
      color: var(--lime);
      font-size: 11px;
      letter-spacing: 1px;
      text-transform: uppercase;
    }

    td {
      color: #dce8df;
    }

    .status {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 5px 9px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 900;
    }

    .status::before {
      content: "";
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: currentColor;
    }

    .online,
    .success {
      color: #00ff77;
      background: rgba(0,255,85,.07);
    }

    .offline,
    .failed {
      color: #ff7272;
      background: rgba(255,50,50,.07);
    }

    .register {
      color: var(--blue);
      background: rgba(0,170,255,.07);
    }

    .muted {
      color: var(--muted);
      font-size: 11px;
    }

    .empty {
      padding: 35px;
      text-align: center;
      color: var(--muted);
    }

    @media (max-width: 1000px) {
      .stats {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    @media (max-width: 750px) {
      .app {
        grid-template-columns: 1fr;
      }

      .sidebar {
        border-right: 0;
        border-bottom: 1px solid var(--border);
      }

      .nav {
        grid-template-columns: repeat(3, 1fr);
      }

      .sidebar-bottom {
        margin-top: 12px;
      }

      .main {
        padding: 18px;
      }
    }

    @media (max-width: 500px) {
      .stats {
        grid-template-columns: 1fr;
      }

      .nav {
        grid-template-columns: 1fr 1fr;
      }

      .topbar {
        align-items: flex-start;
        flex-direction: column;
      }
    }
  </style>
</head>

<body>

<div class="background">
  <div class="orb green"></div>
  <div class="orb yellow"></div>
</div>

<div class="app">

  <aside class="sidebar">

    <div class="brand">
      <img src="/assets/aimx-logo.png" alt="AimXContrra">
      <div>AIMX<span>CONTRRA</span></div>
    </div>

    <nav class="nav">
      <button class="active" data-section="overview">⚡ Overview</button>
      <button data-section="users">👥 Users</button>
      <button data-section="history">🔐 Login History</button>
      <button data-section="sessions">🟢 Active Sessions</button>
    </nav>

    <div class="sidebar-bottom">
      <button class="logout" id="logout">LOG OUT</button>
    </div>

  </aside>

  <main class="main">

    <div class="topbar">
      <div>
        <h1>Admin Dashboard</h1>
        <p>Welcome, <span id="adminName">Admin</span></p>
      </div>

      <div class="admin-badge">
        ADMIN ACCESS
      </div>
    </div>

    <!-- STATS -->

    <div class="stats">

      <div class="stat">
        <small>TOTAL USERS</small>
        <strong id="totalUsers">0</strong>
      </div>

      <div class="stat">
        <small>SUCCESSFUL LOGINS</small>
        <strong id="totalLogins">0</strong>
      </div>

      <div class="stat">
        <small>FAILED LOGINS</small>
        <strong id="failedLogins">0</strong>
      </div>

      <div class="stat">
        <small>ACTIVE USERS</small>
        <strong id="activeUsers">0</strong>
      </div>

    </div>

    <!-- OVERVIEW -->

    <section class="section active" id="overview">

      <div class="panel">

        <div class="panel-head">
          <h2>System Overview</h2>
          <button class="refresh" onclick="loadAll()">Refresh</button>
        </div>

        <div class="empty">
          AimXContrra authentication system is running.
          <br><br>
          Use the sidebar to manage users and inspect login activity.
        </div>

      </div>

    </section>

    <!-- USERS -->

    <section class="section" id="users">

      <div class="panel">

        <div class="panel-head">
          <h2>Registered Users</h2>
          <button class="refresh" onclick="loadUsers()">Refresh</button>
        </div>

        <div class="table-wrap">

          <table>

            <thead>
              <tr>
                <th>ID</th>
                <th>User</th>
                <th>Email</th>
                <th>Created</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody id="usersTable"></tbody>

          </table>

        </div>

      </div>

    </section>

    <!-- LOGIN HISTORY -->

    <section class="section" id="history">

      <div class="panel">

        <div class="panel-head">
          <h2>Login History</h2>
          <button class="refresh" onclick="loadHistory()">Refresh</button>
        </div>

        <div class="table-wrap">

          <table>

            <thead>
              <tr>
                <th>Email</th>
                <th>Status</th>
                <th>IP</th>
                <th>Time</th>
                <th>Browser</th>
              </tr>
            </thead>

            <tbody id="historyTable"></tbody>

          </table>

        </div>

      </div>

    </section>

    <!-- ACTIVE SESSIONS -->

    <section class="section" id="sessions">

      <div class="panel">

        <div class="panel-head">
          <h2>Currently Active Sessions</h2>
          <button class="refresh" onclick="loadSessions()">Refresh</button>
        </div>

        <div class="table-wrap">

          <table>

            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Login Time</th>
                <th>Last Seen</th>
                <th>Status</th>
              </tr>
            </thead>

            <tbody id="sessionsTable"></tbody>

          </table>

        </div>

      </div>

    </section>

  </main>

</div>

<script>

  // =====================================================
  // AUTH CHECK
  // =====================================================

  async function checkAdmin() {

    try {

      const response = await fetch("/api/admin/me", {
        credentials: "same-origin"
      });

      if (!response.ok) {
        window.location.href = "/";
        return;
      }

      const data = await response.json();

      document.getElementById("adminName").textContent =
        data.user.name;

      await loadAll();

    } catch (error) {

      window.location.href = "/";

    }

  }

  // =====================================================
  // STATS
  // =====================================================

  async function loadStats() {

    const response = await fetch("/api/admin/stats", {
      credentials: "same-origin"
    });

    if (!response.ok) return;

    const data = await response.json();

    document.getElementById("totalUsers").textContent =
      data.totalUsers;

    document.getElementById("totalLogins").textContent =
      data.totalLogins;

    document.getElementById("failedLogins").textContent =
      data.failedLogins;

    document.getElementById("activeUsers").textContent =
      data.activeUsers;

  }

  // =====================================================
  // USERS
  // =====================================================

  async function loadUsers() {

    const response = await fetch("/api/admin/users", {
      credentials: "same-origin"
    });

    if (!response.ok) return;

    const data = await response.json();

    const table = document.getElementById("usersTable");

    if (!data.users.length) {

      table.innerHTML = `
        <tr>
          <td colspan="5" class="empty">
            No users registered yet.
          </td>
        </tr>
      `;

      return;
    }

    table.innerHTML = data.users.map(user => `

      <tr>

        <td>#${user.id}</td>

        <td>
          <strong>${escapeHtml(user.name)}</strong>
        </td>

        <td>
          ${escapeHtml(user.email)}
        </td>

        <td>
          ${formatDate(user.created_at)}
        </td>

        <td>

          ${
            user.online
              ? `<span class="status online">ONLINE</span>`
              : `<span class="status offline">OFFLINE</span>`
          }

        </td>

      </tr>

    `).join("");

  }

  // =====================================================
  // LOGIN HISTORY
  // =====================================================

  async function loadHistory() {

    const response = await fetch(
      "/api/admin/login-history?limit=100",
      {
        credentials: "same-origin"
      }
    );

    if (!response.ok) return;

    const data = await response.json();

    const table = document.getElementById("historyTable");

    if (!data.history.length) {

      table.innerHTML = `
        <tr>
          <td colspan="5" class="empty">
            No login history yet.
          </td>
        </tr>
      `;

      return;
    }

    table.innerHTML = data.history.map(item => {

      let statusClass = "failed";

      if (item.status === "SUCCESS") {
        statusClass = "success";
      }

      if (item.status === "REGISTER") {
        statusClass = "register";
      }

      return `

        <tr>

          <td>
            ${escapeHtml(item.email)}
          </td>

          <td>
            <span class="status ${statusClass}">
              ${escapeHtml(item.status)}
            </span>
          </td>

          <td>
            ${escapeHtml(item.ip_address || "unknown")}
          </td>

          <td>
            ${formatDate(item.created_at)}
          </td>

          <td>
            <span class="muted">
              ${escapeHtml(shortBrowser(item.user_agent))}
            </span>
          </td>

        </tr>

      `;

    }).join("");

  }

  // =====================================================
  // ACTIVE SESSIONS
  // =====================================================

  async function loadSessions() {

    const response = await fetch(
      "/api/admin/active-sessions",
      {
        credentials: "same-origin"
      }
    );

    if (!response.ok) return;

    const data = await response.json();

    const table = document.getElementById("sessionsTable");

    if (!data.sessions.length) {

      table.innerHTML = `
        <tr>
          <td colspan="5" class="empty">
            No active sessions.
          </td>
        </tr>
      `;

      return;
    }

    table.innerHTML = data.sessions.map(session => `

      <tr>

        <td>
          <strong>${escapeHtml(session.name)}</strong>
        </td>

        <td>
          ${escapeHtml(session.email)}
        </td>

        <td>
          ${formatDate(session.login_at)}
        </td>

        <td>
          ${formatDate(session.last_seen_at)}
        </td>

        <td>
          <span class="status online">ACTIVE</span>
        </td>

      </tr>

    `).join("");

  }

  // =====================================================
  // LOAD EVERYTHING
  // =====================================================

  async function loadAll() {

    await Promise.all([
      loadStats(),
      loadUsers(),
      loadHistory(),
      loadSessions()
    ]);

  }

  // =====================================================
  // NAVIGATION
  // =====================================================

  document.querySelectorAll(".nav button").forEach(button => {

    button.addEventListener("click", () => {

      document
        .querySelectorAll(".nav button")
        .forEach(item => item.classList.remove("active"));

      button.classList.add("active");

      document
        .querySelectorAll(".section")
        .forEach(section => section.classList.remove("active"));

      document
        .getElementById(button.dataset.section)
        .classList.add("active");

    });

  });

  // =====================================================
  // LOGOUT
  // =====================================================

  document
    .getElementById("logout")
    .addEventListener("click", async () => {

      await fetch("/api/logout", {
        method: "POST",
        credentials: "same-origin"
      });

      window.location.href = "/";

    });

  // =====================================================
  // HELPERS
  // =====================================================

  function escapeHtml(value) {

    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  }

  function formatDate(value) {

    if (!value) return "—";

    const date = new Date(
      value.replace(" ", "T") + "Z"
    );

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleString();

  }

  function shortBrowser(value) {

    if (!value) return "Unknown";

    if (value.includes("Edg")) return "Microsoft Edge";
    if (value.includes("Chrome")) return "Chrome";
    if (value.includes("Firefox")) return "Firefox";
    if (value.includes("Safari")) return "Safari";

    return "Other";

  }

  checkAdmin();

</script>

</body>
</html>