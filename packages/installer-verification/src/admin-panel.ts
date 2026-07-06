export function adminPanel() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width">
<title>Codyx Admin — Installations</title>
<style>
*,:after,:before{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,-apple-system,sans-serif;background:#0d1117;color:#e6edf3;min-height:100vh}
header{background:#161b22;border-bottom:1px solid #30363d;padding:16px 24px;display:flex;align-items:center;justify-content:space-between}
header h1{font-size:20px;font-weight:600;color:#f0f6fc}
header span{color:#8b949e;font-size:14px}
#app{max-width:1400px;margin:0 auto;padding:24px}
#login{max-width:400px;margin:80px auto;background:#161b22;border:1px solid #30363d;border-radius:8px;padding:32px;text-align:center}
#login h2{font-size:18px;margin-bottom:16px}
#login p{color:#8b949e;font-size:14px;margin-bottom:24px}
#login input{width:100%;padding:10px 12px;background:#0d1117;border:1px solid #30363d;border-radius:6px;color:#e6edf3;font-size:14px;margin-bottom:12px;outline:none}
#login input:focus{border-color:#2f81f7}
#login button,#uninstall-all-btn{padding:10px 20px;background:#238636;border:none;border-radius:6px;color:#fff;font-size:14px;font-weight:500;cursor:pointer}
#login button:hover{background:#2ea043}
#login .error{color:#f85149;font-size:13px;margin-top:8px;display:none}
#dashboard{display:none}
.toolbar{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;gap:12px;flex-wrap:wrap}
.toolbar .stats{color:#8b949e;font-size:14px}
.toolbar .stats strong{color:#e6edf3}
.btn-logout{padding:6px 14px;background:transparent;border:1px solid #30363d;border-radius:6px;color:#e6edf3;font-size:13px;cursor:pointer}
.btn-logout:hover{background:#21262d}
.btn-uninstall{padding:6px 14px;background:#1f6feb;border:none;border-radius:6px;color:#fff;font-size:12px;font-weight:500;cursor:pointer;white-space:nowrap}
.btn-uninstall:hover{background:#388bfd}
.btn-uninstall:disabled,.btn-uninstall.disabled{opacity:.5;cursor:not-allowed;background:#1f6feb}
.btn-remove{padding:6px 10px;background:#8e1519;border:none;border-radius:6px;color:#fff;font-size:11px;font-weight:500;cursor:pointer;white-space:nowrap;margin-left:4px}
.btn-remove:hover{background:#da3633}
.badge.pending{background:#d2992222;color:#d29922;border:1px solid #d2992244}
.badge.acknowledged{background:#1f6feb22;color:#58a6ff;border:1px solid #1f6feb44}
.badge.completed{background:#23863622;color:#3fb950;border:1px solid #23863644}
.badge.failed{background:#f8514922;color:#ff7b72;border:1px solid #f8514944}
table{width:100%;border-collapse:collapse;background:#161b22;border:1px solid #30363d;border-radius:8px;overflow:hidden}
th{text-align:left;padding:10px 12px;font-size:12px;font-weight:600;color:#8b949e;text-transform:uppercase;letter-spacing:.5px;background:#0d1117;border-bottom:1px solid #30363d}
td{padding:10px 12px;font-size:13px;border-bottom:1px solid #21262d;vertical-align:middle}
tr:last-child td{border-bottom:none}
tr:hover td{background:#1c2128}
.mono{font-family:ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,monospace;font-size:12px;color:#8b949e}
.copy{background:none;border:none;color:#58a6ff;cursor:pointer;font-size:11px;margin-left:4px;text-decoration:underline}
.copy:hover{color:#79c0ff}
.toast{position:fixed;bottom:24px;right:24px;padding:12px 20px;border-radius:8px;font-size:14px;z-index:100;display:none;max-width:400px;box-shadow:0 8px 24px rgba(0,0,0,.4)}
.toast.success{background:#238636;color:#fff;display:block}
.toast.error{background:#da3633;color:#fff;display:block}
.badge{padding:2px 8px;border-radius:12px;font-size:11px;font-weight:500}
.badge.windows{background:#1f6feb22;color:#58a6ff;border:1px solid #1f6feb44}
.badge.linux{background:#23863622;color:#3fb950;border:1px solid #23863644}
.badge.macos{background:#d2992222;color:#d29922;border:1px solid #d2992244}
.confirm-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);display:none;align-items:center;justify-content:center;z-index:200}
.confirm-box{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:24px;max-width:480px;width:90%;text-align:center}
.confirm-box h3{margin-bottom:8px;font-size:16px}
.confirm-box p{color:#8b949e;font-size:14px;margin-bottom:20px;word-break:break-all}
.confirm-actions{display:flex;gap:8px;justify-content:center}
.confirm-actions button{padding:8px 20px;border-radius:6px;font-size:14px;cursor:pointer;border:none}
.confirm-actions .btn-cancel{background:#21262d;color:#e6edf3}
.confirm-actions .btn-confirm{background:#da3633;color:#fff}
.confirm-actions .btn-confirm:hover{background:#f85149}
.spinner{display:inline-block;width:14px;height:14px;border:2px solid #8b949e;border-top-color:transparent;border-radius:50%;animation:spin .6s linear infinite;vertical-align:middle;margin-right:6px}
@keyframes spin{to{transform:rotate(360deg)}}
.empty{text-align:center;padding:40px;color:#8b949e}
.row-banned td{background:#da363322}
.row-active td{background:#23863612}
.btn-ban{padding:6px 8px;background:#da3633;border:none;border-radius:6px;color:#fff;font-size:11px;font-weight:500;cursor:pointer;white-space:nowrap}
.btn-ban:hover{background:#f85149}
.btn-ban:disabled{background:#484f58;opacity:.6;cursor:not-allowed}
.btn-unban{padding:6px 8px;background:#238636;border:none;border-radius:6px;color:#fff;font-size:11px;font-weight:500;cursor:pointer;white-space:nowrap}
.btn-unban:hover{background:#2ea043}
.badge.banned{background:#da363322;color:#f85149;border:1px solid #da363344}
.badge.active{background:#23863622;color:#3fb950;border:1px solid #23863644}
</style>
</head>
<body>

<header>
<h1>Codyx Installer Admin</h1>
<span id="env-label"></span>
</header>

<div id="app">

<div id="login">
<h2>Admin Access</h2>
<p>Enter your administrator token to manage installations.</p>
<input type="password" id="token-input" placeholder="Administrator token" autocomplete="off">
<button onclick="login()">Authenticate</button>
<div class="error" id="login-error">Invalid token</div>
</div>

<div id="dashboard">
<div id="policy-settings-box" style="margin-bottom: 24px; padding: 16px; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <h3 style="font-size: 15px; font-weight: 600; margin-bottom: 12px; color: #f0f6fc;">Global Policy Settings</h3>
  <div style="display: flex; gap: 16px; flex-wrap: wrap; align-items: flex-end;">
    <div style="display: flex; flex-direction: column; gap: 4px;">
      <label style="font-size: 11px; font-weight: 500; color: #8b949e; text-transform: uppercase;">Max Warnings</label>
      <input type="number" id="max-warnings-input" style="width: 120px; padding: 8px 10px; background: #0d1117; border: 1px solid #30363d; border-radius: 6px; color: #e6edf3; font-size: 13px; outline: none;" min="1" value="5">
    </div>
    <div style="display: flex; flex-direction: column; gap: 4px;">
      <label style="font-size: 11px; font-weight: 500; color: #8b949e; text-transform: uppercase;">Ban Duration (minutes)</label>
      <input type="number" id="ban-duration-input" style="width: 160px; padding: 8px 10px; background: #0d1117; border: 1px solid #30363d; border-radius: 6px; color: #e6edf3; font-size: 13px; outline: none;" min="1" value="5">
    </div>
    <button onclick="savePolicySettings()" style="padding: 8px 16px; background: #238636; border: none; border-radius: 6px; color: #fff; font-size: 13px; font-weight: 500; cursor: pointer;">Save Settings</button>
  </div>
</div>
<div class="toolbar">
<div class="stats">Registrations: <strong id="count">0</strong> &middot; Environment: <strong id="dash-env">-</strong></div>
<div>
<button class="btn-logout" onclick="logout()">Logout</button>
</div>
</div>
<table>
<thead>
<tr>
<th>Display Name</th>
<th>Email</th>
<th>Install ID</th>
<th>Machine ID</th>
<th>Platform</th>
<th>Version</th>
<th>Verified</th>
<th>Uninstall Status</th>
<th>Policy Violations</th>
<th>Banned</th>
<th></th>
</tr>
</thead>
<tbody id="table-body">
<tr><td colspan="11" class="empty"><span class="spinner"></span> Loading...</td></tr>
</tbody>
</table>
</div>

</div>

<div class="confirm-overlay" id="confirm-overlay">
<div class="confirm-box">
<h3 id="confirm-title">Confirm Action</h3>
<p><span id="confirm-message"></span><br><strong id="confirm-name"></strong><br><span class="mono" id="confirm-id"></span></p>
<div class="confirm-actions">
<button class="btn-cancel" onclick="closeConfirm()">Cancel</button>
<button class="btn-confirm" id="confirm-btn" onclick="executeConfirmedAction()">Continue</button>
</div>
</div>
</div>

<div id="toast" class="toast"></div>

<script>
const API = window.location.origin

function getToken() {
  let t = localStorage.getItem("codyx_admin_token")
  if (!t) t = sessionStorage.getItem("codyx_admin_token")
  return t
}

function setToken(token, persist) {
  if (persist) localStorage.setItem("codyx_admin_token", token)
  else sessionStorage.setItem("codyx_admin_token", token)
}

async function apiFetch(path, opts = {}) {
  const token = getToken()
  if (!token) { showLogin(); return }
  const res = await fetch(API + path, {
    ...opts,
    headers: { ...opts.headers, Authorization: "Bearer " + token },
  })
  if (res.status === 401) { localStorage.removeItem("codyx_admin_token"); sessionStorage.removeItem("codyx_admin_token"); showLogin(); return }
  return res
}

function showLogin() {
  document.getElementById("dashboard").style.display = "none"
  document.getElementById("login").style.display = "block"
  document.getElementById("login-error").style.display = "none"
}

function login() {
  const token = document.getElementById("token-input").value.trim()
  if (!token) return
  setToken(token, true)
  loadDashboard()
}

function logout() {
  localStorage.removeItem("codyx_admin_token")
  sessionStorage.removeItem("codyx_admin_token")
  showLogin()
}

function showToast(msg, type) {
  const t = document.getElementById("toast")
  t.textContent = msg
  t.className = "toast " + type
  setTimeout(() => { t.className = "toast" }, 4000)
}

function fmtDate(ts) {
  if (!ts) return "-"
  return new Date(ts).toLocaleString()
}

let targetInstallId = null
let targetAction = "uninstall"
let currentMaxWarnings = 5
let dashboardRefreshTimer = null

function confirmUninstall(id, name) {
  openConfirm("uninstall", id, name)
}

function confirmRemove(id, name) {
  openConfirm("remove", id, name)
}

function openConfirm(action, id, name) {
  targetInstallId = id
  targetAction = action
  const isRemove = action === "remove"
  document.getElementById("confirm-title").textContent = isRemove ? "Remove User Record" : "Confirm Uninstall"
  document.getElementById("confirm-message").textContent = isRemove
    ? "Delete this registration and its installer database records:"
    : "Send uninstall command to:"
  document.getElementById("confirm-name").textContent = name || "Unknown"
  document.getElementById("confirm-id").textContent = id
  document.getElementById("confirm-btn").textContent = isRemove ? "Remove" : "Uninstall"
  document.getElementById("confirm-overlay").style.display = "flex"
}

function closeConfirm() {
  targetInstallId = null
  document.getElementById("confirm-overlay").style.display = "none"
}

async function executeConfirmedAction() {
  const id = targetInstallId
  const action = targetAction
  if (!id) return
  const btn = document.getElementById("confirm-btn")
  btn.disabled = true
  btn.textContent = action === "remove" ? "Removing..." : "Uninstalling..."
  closeConfirm()

  const res = action === "remove"
    ? await apiFetch("/v1/admin/installations/" + id, { method: "DELETE" })
    : await apiFetch("/v1/admin/installations/" + id + "/uninstall", { method: "POST" })
  if (res && res.ok) {
    showToast(action === "remove" ? "Removed database record for " + id : "Uninstall command sent to " + id, "success")
    loadDashboard()
  } else {
    const err = await res?.json().catch(() => ({}))
    showToast(err?.message || (action === "remove" ? "Failed to remove database record" : "Failed to send uninstall command"), "error")
  }
  btn.disabled = false
  btn.textContent = action === "remove" ? "Remove" : "Uninstall"
}

function badge(platform) {
  return '<span class="badge ' + (platform || "windows") + '">' + (platform || "windows") + "</span>"
}

function statusBadge(status) {
  if (!status) return '<span class="badge" style="color:#8b949e">&mdash;</span>'
  if (status === "pending") return '<span class="badge pending">Pending</span>'
  if (status === "acknowledged") return '<span class="badge acknowledged">Processing</span>'
  if (status === "completed") return '<span class="badge completed">Done</span>'
  if (status === "failed") return '<span class="badge failed">Failed</span>'
  return '<span class="badge">' + esc(status) + "</span>"
}

async function banInstall(id) {
  const res = await apiFetch("/v1/admin/installations/" + id + "/ban", { method: "POST" })
  if (res && res.ok) {
    const data = await res.json()
    let msg = "Installation banned"
    if (data.uninstall_triggered) msg += " + uninstall triggered"
    if (!data.banned) msg += " (no machine ID - cannot block re-registration)"
    showToast(msg, "success")
    loadDashboard()
  } else {
    const err = await res.json().catch(() => ({}))
    showToast(err.message || "Failed to ban installation", "error")
  }
}

async function unbanInstall(id) {
  const res = await apiFetch("/v1/admin/installations/" + id + "/unban", { method: "POST" })
  if (res && res.ok) {
    showToast("Unbanned " + id, "success")
    loadDashboard()
  } else {
    showToast("Failed to unban installation", "error")
  }
}

async function resetPolicy(id) {
  const res = await apiFetch("/v1/admin/installations/" + id + "/policy-reset", { method: "POST" })
  if (res && res.ok) {
    showToast("Policy reset command sent for " + id, "success")
    loadDashboard()
  } else {
    showToast("Failed to reset policy", "error")
  }
}

async function savePolicySettings() {
  const max_warnings = parseInt(document.getElementById("max-warnings-input").value, 10)
  const ban_duration_minutes = parseInt(document.getElementById("ban-duration-input").value, 10)
  if (isNaN(max_warnings) || isNaN(ban_duration_minutes)) return

  const res = await apiFetch("/v1/admin/policy-settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ max_warnings, ban_duration_minutes }),
  })
  if (res && res.ok) {
    showToast("Global policy settings updated successfully", "success")
  } else {
    showToast("Failed to update policy settings", "error")
  }
}

async function loadDashboard() {
  const token = getToken()
  if (!token) { showLogin(); return }

  document.getElementById("login").style.display = "none"
  document.getElementById("dashboard").style.display = "block"

  // Load global policy settings
  const settingsRes = await apiFetch("/v1/policy-settings")
  if (settingsRes && settingsRes.ok) {
    const settings = await settingsRes.json()
    currentMaxWarnings = settings.max_warnings || 5
    document.getElementById("max-warnings-input").value = settings.max_warnings
    document.getElementById("ban-duration-input").value = settings.ban_duration_minutes
  }

  document.getElementById("table-body").innerHTML = '<tr><td colspan="11" class="empty"><span class="spinner"></span> Loading...</td></tr>'

  const res = await apiFetch("/v1/admin/installations")
  if (!res) return
  const data = await res.json()
  const installations = data.installations || []
  const tbody = document.getElementById("table-body")
  document.getElementById("count").textContent = installations.length
  document.getElementById("dash-env").textContent = document.getElementById("env-label").textContent || "production"
  renderRows(installations)

  // Auto-refresh every 5s so remote policy/uninstall status is visible quickly.
  if (dashboardRefreshTimer) clearInterval(dashboardRefreshTimer)
  dashboardRefreshTimer = setInterval(async () => {
    const r2 = await apiFetch("/v1/admin/installations")
    if (!r2) return
    const d2 = await r2.json()
    const rows2 = d2.installations || []
    document.getElementById("count").textContent = rows2.length
    renderRows(rows2)
  }, 5000)
}

function renderRows(installations) {
  const tbody = document.getElementById("table-body")
  if (installations.length === 0) {
    tbody.innerHTML = '<tr><td colspan="11" class="empty">No registrations found.</td></tr>'
    return
  }
  tbody.innerHTML = installations.map((r) => {
    const disabled = r.command_status === "acknowledged" || r.command_status === "completed"
    const btnLabel = r.command_status === "completed" ? "Uninstalled" : "Uninstall"
    let rowClass = ""
    if (r.is_banned) rowClass = " class=\\"row-banned\\""
    else if (r.machine_id) rowClass = " class=\\"row-active\\""
    let midCell
    if (r.machine_id) {
      midCell = "<td><span class=\\"mono\\">" + esc(r.machine_id).slice(0, 8) + "&hellip;</span>" +
        "<button class=\\"copy\\" onclick=\\"copyId('" + esc(r.machine_id) + "')\\">copy</button></td>"
    } else {
      midCell = '<td style="color:#8b949e">&mdash;</td>'
    }
    let banCell
    if (r.is_banned) banCell = "<td><span class=\\"badge banned\\">Banned</span></td>"
    else if (r.machine_id) banCell = "<td><span class=\\"badge active\\">Active</span></td>"
    else banCell = '<td style="color:#8b949e">&mdash;</td>'

    let policyCell = ""
    const isPolicyBanned = r.policy_banned_until && Number(r.policy_banned_until) > Date.now()
    if (isPolicyBanned) {
      const remainingSec = Math.max(0, Math.ceil((Number(r.policy_banned_until) - Date.now()) / 1000))
      const m = Math.floor(remainingSec / 60)
      const s = remainingSec % 60
      policyCell = "<td><span class=\\"badge banned\\" style=\\"font-size:11px\\">Locked (" + m + ":" + (s < 10 ? "0" : "") + s + ")</span></td>"
    } else if (r.policy_violations_count > 0) {
      policyCell = "<td><span class=\\"badge pending\\" style=\\"font-size:11px\\">" + r.policy_violations_count + " / " + currentMaxWarnings + "</span></td>"
    } else {
      policyCell = "<td><span class=\\"badge active\\" style=\\"font-size:11px\\">Clean</span></td>"
    }

    let banBtn = ""
    if (r.is_banned) {
      banBtn = " <button class=\\"btn-unban\\" onclick=\\"unbanInstall('" + esc(r.install_id) + "')\\">Unban</button>"
    } else if (r.machine_id) {
      banBtn = " <button class=\\"btn-ban\\" onclick=\\"banInstall('" + esc(r.install_id) + "')\\">Ban</button>"
    } else {
      banBtn = " <button class=\\"btn-ban\\" disabled title=\\"No machine ID on record\\">Ban</button>"
    }
    const removeBtn = " <button class=\\"btn-remove\\" onclick=\\"confirmRemove('" + esc(r.install_id) + "','" + esc(r.display_name) + "')\\">Remove</button>"
    const hasViolations = r.policy_violations_count > 0 || isPolicyBanned
    const resetBtnClass = hasViolations ? "btn-unban" : "btn-unban disabled"
    const resetBtnStyle = hasViolations ? "background:#7c3aed;margin-left:4px" : "background:#484f58;margin-left:4px;cursor:not-allowed;opacity:.5"
    const resetBtnDisabled = hasViolations ? "" : " disabled"
    const resetPolicyBtn = " <button class=\\"" + resetBtnClass + "\\" style=\\"" + resetBtnStyle + "\\" " + resetBtnDisabled + " onclick=\\"resetPolicy('" + esc(r.install_id) + "')\\">Reset Policy</button>"
    return "<tr" + rowClass + ">" +
      "<td><strong>" + esc(r.display_name) + "</strong></td>" +
      "<td>" + esc(r.email) + "</td>" +
      "<td><span class=\\"mono\\">" + esc(r.install_id).slice(0, 8) + "&hellip;</span>" +
      "<button class=\\"copy\\" onclick=\\"copyId('" + esc(r.install_id) + "')\\">copy</button></td>" +
      midCell +
      "<td>" + badge(r.platform) + "</td>" +
      "<td class=\\"mono\\">" + esc(r.installer_version) + "</td>" +
      "<td>" + fmtDate(r.email_verified_at) + "</td>" +
      "<td>" + statusBadge(r.command_status) + "</td>" +
      policyCell +
      banCell +
      '<td><button class="btn-uninstall' + (disabled ? " disabled" : "") + '" onclick="confirmUninstall(' + "'" + esc(r.install_id) + "','" + esc(r.display_name) + "'" + ')"' + (disabled ? " disabled" : "") + ">" + btnLabel + "</button>" + banBtn + resetPolicyBtn + removeBtn + "</td>" +
    "</tr>"
  }).join("")
}

function esc(s) {
  if (!s) return ""
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/'/g,"&#39;").replace(/"/g,"&quot;")
}

function copyId(id) {
  navigator.clipboard.writeText(id).then(() => {
    showToast("Install ID copied", "success")
  })
}

loadDashboard()
</script>
</body>
</html>`
}
