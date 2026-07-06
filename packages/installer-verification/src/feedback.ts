import { privacyPage } from "./privacy"

let cachedBase64: string | null = null
function getMufasaBase64(): string {
  if (cachedBase64) return cachedBase64
  const match = privacyPage("dummy@email.com").match(/background:\s*url\('data:image\/png;base64,([^']+)'\)/)
  cachedBase64 = match ? match[1] : ""
  return cachedBase64
}

export function feedbackPage(name?: string, email?: string, sent?: boolean, error?: string) {
  const base64 = getMufasaBase64()

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Codyx - Send Feedback</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --green:#23e17e;
  --blue:#4dbeff;
  --purple:#9b7eff;
  --bg:#090c12;
  --card:rgba(17,24,39,.72);
  --border:rgba(255,255,255,.08);
  --text:#d6dce7;
  --muted:#8a97ad;
  --gold:#f5c842;
  --danger:#ff6b6b;
}
html,body{
  min-height:100%;
  background:var(--bg);
  color:var(--text);
  font-family:'Inter',system-ui,-apple-system,sans-serif;
  overflow-x:hidden;
}
.bg{position:fixed;inset:0;z-index:0;overflow:hidden}
.orb{position:absolute;border-radius:50%;filter:blur(90px);opacity:.35;animation:drift linear infinite}
.orb-1{width:520px;height:520px;background:radial-gradient(circle,var(--green),transparent 70%);top:-120px;left:-120px;animation-duration:18s}
.orb-2{width:420px;height:420px;background:radial-gradient(circle,var(--blue),transparent 70%);top:40%;right:-100px;animation-duration:22s;animation-delay:-7s}
.orb-3{width:360px;height:360px;background:radial-gradient(circle,var(--purple),transparent 70%);bottom:-80px;left:30%;animation-duration:26s;animation-delay:-13s}
.orb-4{width:280px;height:280px;background:radial-gradient(circle,#ff6b9d,transparent 70%);top:20%;left:55%;animation-duration:20s;animation-delay:-4s}
@keyframes drift{
  0%{transform:translate(0,0) scale(1)}
  25%{transform:translate(40px,30px) scale(1.06)}
  50%{transform:translate(-20px,60px) scale(.94)}
  75%{transform:translate(30px,-20px) scale(1.04)}
  100%{transform:translate(0,0) scale(1)}
}
.stars{
  position:absolute;
  inset:0;
  background-image:
    radial-gradient(1px 1px at 10% 15%,rgba(255,255,255,.6) 0%,transparent 100%),
    radial-gradient(1px 1px at 25% 60%,rgba(255,255,255,.4) 0%,transparent 100%),
    radial-gradient(1.5px 1.5px at 50% 25%,rgba(255,255,255,.5) 0%,transparent 100%),
    radial-gradient(1px 1px at 70% 80%,rgba(255,255,255,.3) 0%,transparent 100%),
    radial-gradient(1px 1px at 85% 40%,rgba(255,255,255,.5) 0%,transparent 100%),
    radial-gradient(1px 1px at 40% 90%,rgba(255,255,255,.4) 0%,transparent 100%);
  animation:twinkle 6s ease-in-out infinite alternate;
}
@keyframes twinkle{from{opacity:.6}to{opacity:1}}
.grid{
  position:absolute;
  inset:0;
  background-image:
    linear-gradient(rgba(255,255,255,.03) 1px,transparent 1px),
    linear-gradient(90deg,rgba(255,255,255,.03) 1px,transparent 1px);
  background-size:48px 48px;
}
.mufasa-bg{
  position:fixed;
  bottom:48px;
  right:48px;
  z-index:1;
  width:min(260px,35vw);
  aspect-ratio:1;
  mask-image:radial-gradient(circle,rgba(0,0,0,1) 0%,rgba(0,0,0,0) 70%);
  -webkit-mask-image:radial-gradient(circle,rgba(0,0,0,1) 0%,rgba(0,0,0,0) 70%);
  background:url('data:image/png;base64,${base64}') center/contain no-repeat;
  opacity:.15;
  filter:blur(1px) grayscale(20%);
  pointer-events:none;
}
.credit-text{
  position:fixed;
  right:48px;
  bottom:20px;
  z-index:2;
  color:var(--muted);
  font-size:11px;
  font-weight:500;
  text-shadow:0 2px 4px rgba(0,0,0,.5);
  pointer-events:none;
}
.credit-text .name-gold{color:var(--gold);font-weight:600}
.page{
  position:relative;
  z-index:2;
  min-height:100vh;
  display:flex;
  align-items:center;
  justify-content:center;
  padding:60px 20px;
}
.card{
  width:100%;
  max-width:720px;
  background:var(--card);
  backdrop-filter:blur(24px);
  -webkit-backdrop-filter:blur(24px);
  border:1px solid var(--border);
  border-radius:20px;
  padding:48px;
  box-shadow:
    0 0 0 1px rgba(255,255,255,.04),
    0 32px 80px rgba(0,0,0,.5),
    0 0 60px rgba(35,225,126,.06);
}
.badge{
  display:inline-flex;
  align-items:center;
  gap:8px;
  background:rgba(35,225,126,.1);
  border:1px solid rgba(35,225,126,.25);
  border-radius:100px;
  padding:6px 14px;
  color:var(--green);
  font-size:12px;
  font-weight:700;
  letter-spacing:.08em;
  text-transform:uppercase;
  margin-bottom:22px;
}
.badge-dot{width:6px;height:6px;border-radius:50%;background:var(--green);animation:pulse 2s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.45;transform:scale(.75)}}
h1{
  font-size:clamp(34px,6vw,58px);
  line-height:.98;
  font-weight:800;
  letter-spacing:0;
  margin-bottom:16px;
  background:linear-gradient(135deg,#fff 0%,var(--green) 55%,var(--blue) 100%);
  -webkit-background-clip:text;
  -webkit-text-fill-color:transparent;
  background-clip:text;
}
.subtitle{color:var(--muted);font-size:16px;line-height:1.7;margin-bottom:30px;max-width:580px}
.notice{
  background:rgba(255,255,255,.04);
  border:1px solid var(--border);
  border-radius:14px;
  padding:16px 18px;
  color:var(--muted);
  line-height:1.6;
  margin-bottom:24px;
}
.notice strong{color:var(--text)}
.field-row{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.form-group{margin-bottom:18px}
label{display:block;color:#f3f7fb;font-size:13px;font-weight:700;margin-bottom:8px}
input,textarea{
  width:100%;
  background:rgba(9,12,18,.72);
  border:1px solid var(--border);
  border-radius:12px;
  color:var(--text);
  font:inherit;
  font-size:14px;
  outline:none;
  padding:13px 14px;
  transition:border-color .2s ease,box-shadow .2s ease,background .2s ease;
}
input:focus,textarea:focus{
  border-color:rgba(35,225,126,.65);
  box-shadow:0 0 0 4px rgba(35,225,126,.1);
  background:rgba(9,12,18,.9);
}
textarea{min-height:150px;resize:vertical;line-height:1.55}
.hint{color:var(--muted);font-size:12px;margin-top:6px;text-align:right}
button[type="submit"]{
  width:100%;
  border:0;
  border-radius:14px;
  background:linear-gradient(135deg,var(--green) 0%,#15aa58 100%);
  color:#04150b;
  cursor:pointer;
  font-size:15px;
  font-weight:800;
  padding:15px 22px;
  box-shadow:0 12px 32px rgba(35,225,126,.18);
  transition:transform .2s ease,box-shadow .2s ease,filter .2s ease;
}
button[type="submit"]:hover{transform:translateY(-2px);box-shadow:0 16px 42px rgba(35,225,126,.28)}
button[type="submit"]:disabled{opacity:.65;cursor:not-allowed;transform:none;filter:grayscale(.25)}
.success,.error{
  border-radius:14px;
  padding:16px 18px;
  margin-bottom:24px;
  line-height:1.6;
}
.success{background:rgba(35,225,126,.1);border:1px solid rgba(35,225,126,.25);color:var(--green)}
.error{background:rgba(255,107,107,.1);border:1px solid rgba(255,107,107,.3);color:#ffb4b4}
.footer-links{
  display:flex;
  justify-content:center;
  gap:24px;
  margin-top:32px;
  padding-top:24px;
  border-top:1px solid var(--border);
}
.glow-link{
  color:var(--muted);
  font-size:13px;
  font-weight:600;
  text-decoration:none;
  transition:color .3s ease,text-shadow .3s ease;
}
.glow-link:hover{color:var(--green);text-shadow:0 0 10px rgba(35,225,126,.8)}
#toast{
  position:fixed;
  right:24px;
  bottom:24px;
  z-index:100;
  display:none;
  max-width:420px;
  border-radius:12px;
  padding:13px 18px;
  box-shadow:0 18px 50px rgba(0,0,0,.45);
}
#toast.error{display:block;background:rgba(255,107,107,.95);color:#fff}
@media(max-width:680px){
  .page{align-items:flex-start;padding:44px 16px}
  .card{padding:34px 22px}
  .field-row{grid-template-columns:1fr}
  .footer-links{flex-wrap:wrap;gap:14px}
  .credit-text{right:20px}
  .mufasa-bg{right:20px;bottom:42px;width:min(220px,55vw)}
}
</style>
</head>
<body>
<div class="bg">
  <div class="stars"></div>
  <div class="grid"></div>
  <div class="orb orb-1"></div>
  <div class="orb orb-2"></div>
  <div class="orb orb-3"></div>
  <div class="orb orb-4"></div>
</div>
<div class="mufasa-bg"></div>
<div class="credit-text">Built by M. Farid <span class="name-gold">(Mufasa)</span></div>

<main class="page">
  <section class="card">
    <div class="badge"><span class="badge-dot"></span><span>Feedback Channel</span></div>
    ${sent ? `<div class="success">Thank you for your feedback. We appreciate your input.</div>` : ""}
    ${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}
    ${
      !sent
        ? `
    <h1>Send Feedback</h1>
    <p class="subtitle">Share a bug report, installer issue, policy complaint, or feature suggestion directly with Codyx support.</p>
    <div class="notice"><strong>Privacy note:</strong> this form sends only the name, email, and message you enter. Do not include secrets, passwords, private keys, or project source code.</div>
    <form id="feedback-form" onsubmit="submitFeedback(event)">
      <div class="field-row">
        <div class="form-group">
          <label for="name">Name</label>
          <input type="text" id="name" name="name" maxlength="100" placeholder="Your name" required value="${escapeHtml(name)}">
        </div>
        <div class="form-group">
          <label for="email">Email</label>
          <input type="email" id="email" name="email" maxlength="254" placeholder="you@example.com" required value="${escapeHtml(email)}">
        </div>
      </div>
      <div class="form-group">
        <label for="message">Message</label>
        <textarea id="message" name="message" maxlength="5000" placeholder="Describe your feedback..." required></textarea>
        <div class="hint" id="char-count">0 / 5000</div>
      </div>
      <button type="submit" id="submit-btn">Send Feedback</button>
    </form>
    `
        : `
    <h1>Message Sent</h1>
    <p class="subtitle">Your feedback was received. You will be redirected to the downloads page shortly.</p>
    `
    }
    <nav class="footer-links">
      <a class="glow-link" href="/downloads">Downloads</a>
      <a class="glow-link" href="/privacy">Privacy Notice</a>
      <a class="glow-link" href="/license">License Agreement</a>
    </nav>
  </section>
</main>

<div id="toast" class="toast"></div>

${
  !sent
    ? `
<script>
const API = window.location.origin

function showToast(msg, type) {
  const t = document.getElementById("toast")
  t.textContent = msg
  t.className = "toast " + type
  setTimeout(() => { t.className = "toast" }, 4000)
}

document.getElementById("message").addEventListener("input", function() {
  document.getElementById("char-count").textContent = this.value.length + " / 5000"
})

async function submitFeedback(e) {
  e.preventDefault()
  const btn = document.getElementById("submit-btn")
  const emailInput = document.getElementById("email")
  btn.disabled = true
  btn.textContent = "Sending..."

  const name = document.getElementById("name").value.trim()
  const email = emailInput.value.trim()
  const message = document.getElementById("message").value.trim()

  if (!name) {
    showToast("Please enter your name.", "error")
    btn.disabled = false
    btn.textContent = "Send Feedback"
    return
  }

  if (!email) {
    showToast("Please enter your email.", "error")
    btn.disabled = false
    btn.textContent = "Send Feedback"
    return
  }

  if (!emailInput.checkValidity()) {
    showToast("Please enter a valid email address.", "error")
    btn.disabled = false
    btn.textContent = "Send Feedback"
    return
  }

  if (!message) {
    showToast("Please enter a message.", "error")
    btn.disabled = false
    btn.textContent = "Send Feedback"
    return
  }

  try {
    const res = await fetch(API + "/v1/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, message }),
    })
    if (res.ok) {
      window.location.href = window.location.pathname + "?sent=1"
      return
    }
    const data = await res.json().catch(() => ({}))
    showToast(data.message || "Failed to send feedback.", "error")
    btn.disabled = false
    btn.textContent = "Send Feedback"
  } catch {
    showToast("Network error. Please try again.", "error")
    btn.disabled = false
    btn.textContent = "Send Feedback"
  }
}
</script>
`
    : ""
}
${
  sent
    ? `
<script>
setTimeout(function() {
  window.location.href = "https://install.kingkung.men/downloads";
}, 4000);
</script>
`
    : ""
}
</body>
</html>`
}

function escapeHtml(value: string | undefined) {
  if (!value) return ""
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/'/g, "&#39;")
    .replace(/"/g, "&quot;")
}
