import { privacyPage } from "./privacy"

let cachedBase64: string | null = null
function getMufasaBase64(): string {
  if (cachedBase64) return cachedBase64
  const privacyHtml = privacyPage("dummy@email.com")
  const match = privacyHtml.match(/background:\s*url\('data:image\/png;base64,([^']+)'\)/)
  cachedBase64 = match ? match[1] : ""
  return cachedBase64
}

export function downloadsPage() {
  const base64 = getMufasaBase64()

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Codyx — Download Center</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --green: #23e17e;
    --blue: #4dbeff;
    --purple: #9b7eff;
    --bg: #090c12;
    --card: rgba(17, 24, 39, 0.72);
    --border: rgba(255,255,255,0.08);
    --text: #d6dce7;
    --muted: #8a97ad;
    --gold: #f5c842;
  }

  html, body {
    min-height: 100%;
    background: var(--bg);
    font-family: 'Inter', system-ui, sans-serif;
    color: var(--text);
    overflow-x: hidden;
  }

  /* ── particle canvas ── */
  #particles {
    position: fixed;
    inset: 0;
    z-index: 0;
    pointer-events: none;
  }

  /* ── animated canvas background ── */
  .bg {
    position: fixed;
    inset: 0;
    z-index: 0;
    overflow: hidden;
  }

  .orb {
    position: absolute;
    border-radius: 50%;
    filter: blur(90px);
    opacity: 0.35;
    animation: drift linear infinite;
  }
  .orb-1 {
    width: 520px; height: 520px;
    background: radial-gradient(circle, #23e17e, transparent 70%);
    top: -120px; left: -120px;
    animation-duration: 18s;
  }
  .orb-2 {
    width: 420px; height: 420px;
    background: radial-gradient(circle, #4dbeff, transparent 70%);
    top: 40%; right: -100px;
    animation-duration: 22s;
    animation-delay: -7s;
  }
  .orb-3 {
    width: 360px; height: 360px;
    background: radial-gradient(circle, #9b7eff, transparent 70%);
    bottom: -80px; left: 30%;
    animation-duration: 26s;
    animation-delay: -13s;
  }
  .orb-4 {
    width: 280px; height: 280px;
    background: radial-gradient(circle, #ff6b9d, transparent 70%);
    top: 20%; left: 55%;
    animation-duration: 20s;
    animation-delay: -4s;
  }

  @keyframes drift {
    0%   { transform: translate(0, 0) scale(1); }
    25%  { transform: translate(40px, 30px) scale(1.06); }
    50%  { transform: translate(-20px, 60px) scale(0.94); }
    75%  { transform: translate(30px, -20px) scale(1.04); }
    100% { transform: translate(0, 0) scale(1); }
  }

  /* star particles */
  .stars {
    position: absolute;
    inset: 0;
    background-image:
      radial-gradient(1px 1px at 10% 15%, rgba(255,255,255,0.6) 0%, transparent 100%),
      radial-gradient(1px 1px at 25% 60%, rgba(255,255,255,0.4) 0%, transparent 100%),
      radial-gradient(1.5px 1.5px at 50% 25%, rgba(255,255,255,0.5) 0%, transparent 100%),
      radial-gradient(1px 1px at 70% 80%, rgba(255,255,255,0.3) 0%, transparent 100%),
      radial-gradient(1px 1px at 85% 40%, rgba(255,255,255,0.5) 0%, transparent 100%),
      radial-gradient(1px 1px at 40% 90%, rgba(255,255,255,0.4) 0%, transparent 100%),
      radial-gradient(1px 1px at 60% 10%, rgba(255,255,255,0.6) 0%, transparent 100%),
      radial-gradient(1.5px 1.5px at 90% 70%, rgba(255,255,255,0.3) 0%, transparent 100%),
      radial-gradient(1px 1px at 5% 50%, rgba(255,255,255,0.4) 0%, transparent 100%),
      radial-gradient(1px 1px at 78% 20%, rgba(255,255,255,0.5) 0%, transparent 100%);
    animation: twinkle 6s ease-in-out infinite alternate;
  }
  @keyframes twinkle {
    from { opacity: 0.6; }
    to   { opacity: 1; }
  }

  .grid {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
    background-size: 48px 48px;
  }

  /* ── layout ── */
  .page {
    position: relative;
    z-index: 2;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    padding: 60px 20px;
  }

  .logo-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-bottom: 40px;
    position: relative;
  }

  /* SVG Crown Logo representing Mufasa */
  .mufasa-logo {
    width: 80px;
    height: 80px;
    fill: none;
    stroke: var(--gold);
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
    filter: drop-shadow(0 0 12px rgba(245, 200, 66, 0.4));
    margin-bottom: 12px;
  }

  .logo-title {
    font-size: 26px;
    font-weight: 800;
    letter-spacing: 2px;
    background: linear-gradient(120deg, var(--gold) 20%, #ff8afd 50%, var(--gold) 80%);
    background-size: 200% auto;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    text-transform: uppercase;
    animation: shine-animation 4s linear infinite;
  }

  @keyframes shine-animation {
    to { background-position: 200% center; }
  }

  .container {
    width: 100%;
    max-width: 1100px;
    display: flex;
    flex-direction: column;
    gap: 40px;
  }

  /* Language Selector styling */
  .lang-selector {
    position: absolute;
    top: 24px;
    right: 24px;
    display: flex;
    gap: 8px;
    z-index: 10;
  }

  .flag-btn {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--border);
    border-radius: 30px;
    padding: 6px 14px;
    color: var(--muted);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.3s ease;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .flag-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255,255,255,0.2);
    color: var(--text);
  }

  .flag-btn.active {
    background: rgba(35, 225, 126, 0.1);
    border-color: var(--green);
    color: var(--green);
  }

  /* Three columns layout */
  .columns {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 28px;
  }

  @media (max-width: 900px) {
    .columns {
      grid-template-columns: 1fr;
    }
  }

  .card {
    background: var(--card);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    border: 1px solid var(--border);
    border-radius: 20px;
    padding: 36px 30px;
    display: flex;
    flex-direction: column;
    align-items: center;
    box-shadow:
      0 0 0 1px rgba(255,255,255,0.04),
      0 20px 50px rgba(0,0,0,0.4);
    transition: transform 0.3s ease, box-shadow 0.3s ease;
  }

  .card:hover {
    transform: translateY(-6px);
    box-shadow:
      0 0 0 1px rgba(255,255,255,0.08),
      0 28px 60px rgba(0,0,0,0.5),
      0 0 40px rgba(35,225,126,0.04);
  }

  /* OS visual mockup placeholder */
  .visual-holder {
    width: 100%;
    height: 140px;
    background: radial-gradient(circle at center, rgba(255, 255, 255, 0.03) 0%, transparent 80%);
    border: 1px dashed rgba(255,255,255,0.06);
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 24px;
    position: relative;
    overflow: hidden;
  }

  .visual-holder::after {
    content: '';
    position: absolute;
    width: 80px;
    height: 80px;
    border-radius: 50%;
    filter: blur(20px);
    opacity: 0.15;
    z-index: 1;
  }

  .card-windows .visual-holder::after { background: var(--blue); }
  .card-linux .visual-holder::after { background: var(--green); }
  .card-android .visual-holder::after { background: var(--purple); }

  .visual-icon {
    width: 48px;
    height: 48px;
    position: relative;
    z-index: 2;
  }

  .card-title {
    font-size: 18px;
    font-weight: 700;
    margin-bottom: 8px;
    color: #fff;
  }

  .card-subtitle {
    font-size: 12px;
    color: var(--muted);
    margin-bottom: 24px;
    text-align: center;
  }

  /* Premium download button */
  .download-btn {
    width: 100%;
    background: linear-gradient(135deg, var(--green) 0%, #15aa58 100%);
    border: none;
    border-radius: 10px;
    padding: 14px;
    color: #000;
    font-weight: 600;
    font-size: 14px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    text-decoration: none;
    transition: opacity 0.2s ease, transform 0.2s ease;
    box-shadow: 0 4px 12px rgba(35, 225, 126, 0.2);
    margin-bottom: 28px;
  }

  .download-btn:hover {
    opacity: 0.95;
    transform: scale(0.98);
  }

  .card-windows .download-btn {
    background: linear-gradient(135deg, var(--blue) 0%, #1e8fcb 100%);
    box-shadow: 0 4px 12px rgba(77, 190, 255, 0.2);
  }

  .card-linux .download-btn {
    background: linear-gradient(135deg, var(--green) 0%, #15aa58 100%);
    box-shadow: 0 4px 12px rgba(35, 225, 126, 0.2);
  }

  .card-android .download-btn {
    background: linear-gradient(135deg, var(--purple) 0%, #7656e3 100%);
    box-shadow: 0 4px 12px rgba(155, 126, 255, 0.2);
  }

  /* How to install list */
  .install-guide {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 16px;
    border-top: 1px solid var(--border);
    padding-top: 24px;
  }

  .guide-title {
    font-size: 13px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text);
    margin-bottom: 4px;
  }

  .step-item {
    display: flex;
    gap: 12px;
    align-items: flex-start;
  }

  .step-number {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: rgba(255,255,255,0.06);
    border: 1px solid var(--border);
    color: var(--muted);
    font-size: 11px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .step-text {
    font-size: 12px;
    color: var(--muted);
    line-height: 1.5;
  }

  .step-text code {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 4px;
    padding: 2px 6px;
    font-family: monospace;
    color: var(--text);
  }

  .sparkle-particle {
    position: fixed;
    pointer-events: none;
    font-size: 14px;
    z-index: 1000;
    user-select: none;
  }

  .mufasa-bg {
    position: fixed;
    bottom: 48px;
    right: 48px;
    z-index: 1;
    width: min(260px, 35vw);
    aspect-ratio: 1;
    mask-image: radial-gradient(circle, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 70%);
    -webkit-mask-image: radial-gradient(circle, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 70%);
    background: url('data:image/png;base64,${base64}');
    background-size: 72%;
    background-position: center;
    background-repeat: no-repeat;
    opacity: 0.18;
  }

  /* credit built by watermark text in down right under mufasa */
  .credit-text {
    position: fixed;
    bottom: 20px;
    right: 48px;
    font-size: 11px;
    color: var(--muted);
    z-index: 2;
    text-shadow: 0 2px 4px rgba(0,0,0,0.5);
    pointer-events: none;
    font-weight: 500;
  }
  .credit-text .name-gold {
    color: var(--gold);
    font-weight: 600;
  }

  /* footer links in the card */
  .footer-links {
    display: flex;
    justify-content: center;
    gap: 24px;
    margin-top: 36px;
    padding-top: 24px;
    border-top: 1px solid var(--border);
    width: 100%;
  }

  .glow-link {
    color: var(--muted);
    font-size: 13px;
    font-weight: 500;
    text-decoration: none;
    transition: color 0.3s ease, text-shadow 0.3s ease;
  }

  .glow-link:hover {
    color: var(--green);
    text-shadow: 0 0 10px rgba(35, 225, 126, 0.8);
  }

  /* RTL settings */
  html[dir="rtl"] .lang-selector {
    right: auto;
    left: 24px;
  }
  html[dir="rtl"] .credit-text {
    right: auto;
    left: 48px;
  }
</style>
</head>
<body>

<canvas id="particles"></canvas>

<div class="bg">
  <div class="stars"></div>
  <div class="grid"></div>
  <div class="orb orb-1"></div>
  <div class="orb orb-2"></div>
  <div class="orb orb-3"></div>
  <div class="orb orb-4"></div>
</div>

<div class="mufasa-bg"></div>
<div class="credit-text" data-i18n="credit_text">Built by M. Farid <span class="name-gold">(Mufasa)</span></div>

<div class="lang-selector">
  <button class="flag-btn active" data-lang="en">
    <span>🇬🇧</span> EN
  </button>
  <button class="flag-btn" data-lang="ar">
    <span>🇸🇦</span> AR
  </button>
  <button class="flag-btn" data-lang="fr">
    <span>🇫🇷</span> FR
  </button>
  <button class="flag-btn" data-lang="de">
    <span>🇩🇪</span> DE
  </button>
</div>

<div class="page">
  <div class="logo-container">
    <!-- SVG Crown Logo representing Mufasa -->
    <svg class="mufasa-logo" viewBox="0 0 24 24">
      <path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z"/>
      <path d="M3 20h18v2H3z"/>
    </svg>
    <div class="logo-title">Codyx Orchestrator</div>
  </div>

  <div class="container">
    <div class="columns">
      
      <!-- Windows Card -->
      <div class="card card-windows">
        <div class="visual-holder">
          <!-- Windows logo SVG -->
          <svg class="visual-icon" viewBox="0 0 24 24" fill="var(--blue)">
            <path d="M0 3.449L9.75 2.1v9.45H0V3.449zM0 12.45h9.75v9.45L0 20.551v-8.1zM10.95 1.95L24 0v11.55H10.95V1.95zM10.95 12.45H24v11.55l-13.05-1.95v-9.6z"/>
          </svg>
        </div>
        <h2 class="card-title" data-i18n="win_title">Windows Installer</h2>
        <span class="card-subtitle" data-i18n="win_sub">Official self-updating bundle for x64</span>
        <a class="download-btn" href="https://github.com/mufasa1611/codyx-orchestrator/releases/latest/download/codyx-installer-launcher-windows-x64.exe" target="_blank">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          <span data-i18n="win_btn">Download (.exe)</span>
        </a>
        <div class="install-guide">
          <h3 class="guide-title" data-i18n="guide_title">How to Install</h3>
          <div class="step-item">
            <div class="step-number">1</div>
            <div class="step-text" data-i18n="win_step1">Download the setup program from the link above.</div>
          </div>
          <div class="step-item">
            <div class="step-number">2</div>
            <div class="step-text" data-i18n="win_step2">Double-click the file to execute the installer.</div>
          </div>
          <div class="step-item">
            <div class="step-number">3</div>
            <div class="step-text" data-i18n="win_step3">If prompted by Windows SmartScreen, click <strong>"More Info"</strong> then <strong>"Run anyway"</strong>.</div>
          </div>
          <div class="step-item">
            <div class="step-number">4</div>
            <div class="step-text" data-i18n="win_step4">Submit your email address when requested to link your profile.</div>
          </div>
        </div>
      </div>

      <!-- Linux Card -->
      <div class="card card-linux">
        <div class="visual-holder">
          <!-- Tux/Linux SVG -->
          <svg class="visual-icon" viewBox="0 0 24 24" fill="var(--green)">
            <path d="M12 2a5 5 0 0 0-5 5c0 2.22 1.25 4.15 3.09 5.09A6 6 0 0 0 6 18v2h12v-2a6 6 0 0 0-4.09-6.09C15.75 11.15 17 9.22 17 7a5 5 0 0 0-5-5zm0 2c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm-4 14h8a4 4 0 0 1-8 0z"/>
          </svg>
        </div>
        <h2 class="card-title" data-i18n="linux_title">Linux Command</h2>
        <span class="card-subtitle" data-i18n="linux_sub">One-liner script for bash shell</span>
        <button class="download-btn" onclick="comingSoon()">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
          <span data-i18n="linux_btn">Copy Command</span>
        </button>
        <div class="install-guide">
          <h3 class="guide-title" data-i18n="guide_title">How to Install</h3>
          <div class="step-item">
            <div class="step-number">1</div>
            <div class="step-text" data-i18n="linux_step1">Open your preferred terminal window.</div>
          </div>
          <div class="step-item">
            <div class="step-number">2</div>
            <div class="step-text" data-i18n="linux_step2">Paste and run the command: <code>curl -fsSL https://install.kingkung.men/install.sh | bash</code></div>
          </div>
          <div class="step-item">
            <div class="step-number">3</div>
            <div class="step-text" data-i18n="linux_step3">Follow the on-screen instructions to verify your email.</div>
          </div>
          <div class="step-item">
            <div class="step-number">4</div>
            <div class="step-text" data-i18n="linux_step4">Launch the server by executing <code>codyx</code> in the shell.</div>
          </div>
        </div>
      </div>

      <!-- Android Card -->
      <div class="card card-android">
        <div class="visual-holder">
          <!-- Android logo SVG -->
          <svg class="visual-icon" viewBox="0 0 24 24" fill="var(--purple)">
            <path d="M12 2a10 10 0 0 0-10 10v1a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-1a5 5 0 0 1 10 0v1a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-1a10 10 0 0 0-10-10zM7 9a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm10 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2zM12 15v5a1 1 0 0 1-2 0v-5a1 1 0 0 1 2 0z"/>
          </svg>
        </div>
        <h2 class="card-title" data-i18n="android_title">Android App</h2>
        <span class="card-subtitle" data-i18n="android_sub">Mobile APK for Trusted Web experience</span>
        <button class="download-btn" onclick="comingSoon()">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          <span data-i18n="android_btn">Download (.apk)</span>
        </button>
        <div class="install-guide">
          <h3 class="guide-title" data-i18n="guide_title">How to Install</h3>
          <div class="step-item">
            <div class="step-number">1</div>
            <div class="step-text" data-i18n="android_step1">Download the APK file directly to your phone.</div>
          </div>
          <div class="step-item">
            <div class="step-number">2</div>
            <div class="step-text" data-i18n="android_step2">Enable <strong>"Unknown Sources"</strong> in settings if prompted.</div>
          </div>
          <div class="step-item">
            <div class="step-number">3</div>
            <div class="step-text" data-i18n="android_step3">Open the downloaded APK to install the application.</div>
          </div>
          <div class="step-item">
            <div class="step-number">4</div>
            <div class="step-text" data-i18n="android_step4">Launch Codyx and connect to your local orchestration proxy.</div>
          </div>
        </div>
      </div>

    </div>

    <!-- Centered footer links with hover glow effects -->
    <div class="footer-links">
      <a href="/license" class="glow-link" data-i18n="license_link">License Agreement</a>
      <a href="/privacy" class="glow-link" data-i18n="privacy_link">Privacy Notice</a>
    </div>
  </div>
</div>

<script>
(function() {
  const canvas = document.getElementById('particles');
  const ctx = canvas.getContext('2d');
  const COLORS = ['#23e17e','#4dbeff','#9b7eff','#ff6b9d','#f5c842'];
  const COUNT = 130;
  const MOUSE = { x: -9999, y: -9999 };
  const REPEL = 110;   // repulsion radius px
  const SPEED = 0.35;

  let W, H, pts;

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function rand(min, max) { return min + Math.random() * (max - min); }

  function init() {
    resize();
    pts = Array.from({ length: COUNT }, () => ({
      x:  rand(0, W),
      y:  rand(0, H),
      vx: rand(-SPEED, SPEED),
      vy: rand(-SPEED, SPEED),
      r:  rand(1.2, 2.8),
      alpha: rand(0.25, 0.75),
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      phase: rand(0, Math.PI * 2),
      freq:  rand(0.004, 0.012),
      amp:   rand(0.15, 0.45),
    }));
  }

  function draw(ts) {
    ctx.clearRect(0, 0, W, H);

    for (const p of pts) {
      // sine-wave breathing on alpha
      const a = p.alpha + Math.sin(ts * p.freq + p.phase) * p.amp;

      // mouse repulsion
      const dx = p.x - MOUSE.x;
      const dy = p.y - MOUSE.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < REPEL && dist > 0) {
        const force = (REPEL - dist) / REPEL * 1.8;
        p.vx += (dx / dist) * force * 0.12;
        p.vy += (dy / dist) * force * 0.12;
      }

      // dampen velocity so it doesn't fly away
      p.vx *= 0.985;
      p.vy *= 0.985;

      // clamp speed
      const spd = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      if (spd > 2.2) { p.vx = p.vx / spd * 2.2; p.vy = p.vy / spd * 2.2; }

      p.x += p.vx;
      p.y += p.vy;

      // wrap around edges
      if (p.x < -10) p.x = W + 10;
      if (p.x > W + 10) p.x = -10;
      if (p.y < -10) p.y = H + 10;
      if (p.y > H + 10) p.y = -10;

      // draw dot with soft glow
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, Math.min(1, a));
      ctx.fill();

      // subtle connection lines between nearby dots
      for (const q of pts) {
        if (q === p) continue;
        const lx = p.x - q.x, ly = p.y - q.y;
        const ld = Math.sqrt(lx * lx + ly * ly);
        if (ld < 80) {
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(q.x, q.y);
          ctx.strokeStyle = p.color;
          ctx.globalAlpha = (1 - ld / 80) * 0.12;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }

    ctx.globalAlpha = 1;
    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', () => { resize(); });
  window.addEventListener('mousemove', e => { MOUSE.x = e.clientX; MOUSE.y = e.clientY; });
  window.addEventListener('mouseleave', () => { MOUSE.x = -9999; MOUSE.y = -9999; });

  init();
  requestAnimationFrame(draw);
}());

(function() {
  const TRANSLATIONS = {
    en: {
      win_title: "Windows Installer",
      win_sub: "Official self-updating bundle for x64",
      win_btn: "Download (.exe)",
      win_step1: "Download the setup program from the link above.",
      win_step2: "Double-click the file to execute the installer.",
      win_step3: "If prompted by Windows SmartScreen, click <strong>'More Info'</strong> then <strong>'Run anyway'</strong>.",
      win_step4: "Submit your email address when requested to link your profile.",
      
      linux_title: "Linux Command",
      linux_sub: "One-liner script for bash shell",
      linux_btn: "Copy Command",
      linux_step1: "Open your preferred terminal window.",
      linux_step2: "Paste and run the command: <code>curl -fsSL https://install.kingkung.men/install.sh | bash</code>",
      linux_step3: "Follow the on-screen instructions to verify your email.",
      linux_step4: "Launch the server by executing <code>codyx</code> in the shell.",

      android_title: "Android App",
      android_sub: "Mobile APK for Trusted Web experience",
      android_btn: "Download (.apk)",
      android_step1: "Download the APK file directly to your phone.",
      android_step2: "Enable <strong>'Unknown Sources'</strong> in settings if prompted.",
      android_step3: "Open the downloaded APK to install the application.",
      android_step4: "Launch Codyx and connect to your local orchestration proxy.",

      guide_title: "How to Install",
      credit_text: "Built by M. Farid <span class='name-gold'>(Mufasa)</span>",
      license_link: "License Agreement",
      privacy_link: "Privacy Notice"
    },
    ar: {
      win_title: "مثبت ويندوز",
      win_sub: "الحزمة الرسمية ذاتية التحديث لأنظمة x64",
      win_btn: "تحميل (.exe)",
      win_step1: "قم بتحميل برنامج التثبيت من الرابط أعلاه.",
      win_step2: "انقر نقرًا مزدوجًا على الملف لتشغيل التثبيت.",
      win_step3: "إذا ظهرت نافذة Windows SmartScreen، انقر فوق <strong>'المزيد من المعلومات'</strong> ثم <strong>'التشغيل على أي حال'</strong>.",
      win_step4: "أدخل بريدك الإلكتروني عندما يُطلب منك ذلك لربط حسابك.",

      linux_title: "أمر لينكس",
      linux_sub: "أمر سطر واحد لتشغيله في موجه bash",
      linux_btn: "نسخ الأمر",
      linux_step1: "افتح نافذة موجه الأوامر (الترمينال).",
      linux_step2: "ألصق وشغّل الأمر التالي: <code>curl -fsSL https://install.kingkung.men/install.sh | bash</code>",
      linux_step3: "اتبع التعليمات التي تظهر على الشاشة لتأكيد بريدك الإلكتروني.",
      linux_step4: "قم بتشغيل الخادم عن طريق كتابة <code>codyx</code> في سطر الأوامر.",

      android_title: "تطبيق أندرويد",
      android_sub: "تطبيق APK لتجربة ويب موثوقة بالكامل",
      android_btn: "تحميل (.apk)",
      android_step1: "قم بتحميل ملف APK مباشرة إلى هاتفك المحمول.",
      android_step2: "قم بتمكين تثبيت التطبيقات من <strong>'مصادر غير معروفة'</strong> في الإعدادات.",
      android_step3: "افتح ملف APK الذي تم تنزيله لبدء تثبيت التطبيق.",
      android_step4: "شغّل تطبيق Codyx واتصل بوكيل التنسيق المحلي الخاص بك.",

      guide_title: "طريقة التثبيت",
      credit_text: "تم التطوير بواسطة محمد فريد <span class='name-gold'>(موفاسا)</span>",
      license_link: "اتفاقية الترخيص",
      privacy_link: "سياسة الخصوصية"
    },
    fr: {
      win_title: "Installateur Windows",
      win_sub: "Pack officiel auto-mis à jour pour x64",
      win_btn: "Télécharger (.exe)",
      win_step1: "Téléchargez le programme d'installation à partir du lien ci-dessus.",
      win_step2: "Double-cliquez sur le fichier pour lancer l'installation.",
      win_step3: "Si Windows SmartScreen s'affiche, cliquez sur <strong>'Plus d'infos'</strong> puis sur <strong>'Exécuter quand même'</strong>.",
      win_step4: "Saisissez votre adresse e-mail lorsque vous y êtes invité pour lier votre profil.",
      
      linux_title: "Commande Linux",
      linux_sub: "Script en une seule ligne pour le shell bash",
      linux_btn: "Copier la Commande",
      linux_step1: "Ouvrez votre fenêtre de terminal préférée.",
      linux_step2: "Copiez et exécutez la commande : <code>curl -fsSL https://install.kingkung.men/install.sh | bash</code>",
      linux_step3: "Suivez les instructions à l'écran pour vérifier votre e-mail.",
      linux_step4: "Lancez le serveur en exécutant <code>codyx</code> dans le shell.",

      android_title: "Application Android",
      android_sub: "Fichier APK pour une expérience Web sécurisée",
      android_btn: "Télécharger (.apk)",
      android_step1: "Téléchargez le fichier APK directement sur votre téléphone.",
      android_step2: "Activez <strong>'Sources inconnues'</strong> dans les paramètres si nécessaire.",
      android_step3: "Ouvrez l'APK téléchargé pour installer l'application.",
      android_step4: "Lancez Codyx et connectez-vous à votre proxy d'orchestration local.",

      guide_title: "Comment Installer",
      credit_text: "Développé par M. Farid <span class='name-gold'>(Mufasa)</span>",
      license_link: "Accord de Licence",
      privacy_link: "Charte de Confidentialité"
    },
    de: {
      win_title: "Windows-Installer",
      win_sub: "Offizielles, selbstaktualisierendes Paket für x64",
      win_btn: "Herunterladen (.exe)",
      win_step1: "Laden Sie das Installationsprogramm über den obigen Link herunter.",
      win_step2: "Doppelklicken Sie auf die Datei, um das Installationsprogramm auszuführen.",
      win_step3: "Wenn Windows SmartScreen angezeigt wird, klicken Sie auf <strong>'Weitere Informationen'</strong> und dann auf <strong>'Trotzdem ausführen'</strong>.",
      win_step4: "Geben Sie Ihre E-Mail-Adresse ein, um Ihr Profil zu verknüpfen.",
      
      linux_title: "Linux-Befehl",
      linux_sub: "Einzeiliges Skript für die Bash-Shell",
      linux_btn: "Befehl kopieren",
      linux_step1: "Öffnen Sie Ihr bevorzugtes Terminal-Fenster.",
      linux_step2: "Kopieren Sie den folgenden Befehl und führen Sie ihn aus: <code>curl -fsSL https://install.kingkung.men/install.sh | bash</code>",
      linux_step3: "Folgen Sie den Anweisungen auf dem Bildschirm, um Ihre E-Mail zu bestätigen.",
      linux_step4: "Starten Sie den Server, indem Sie <code>codyx</code> in der Shell ausführen.",

      android_title: "Android-App",
      android_sub: "Mobile APK für eine vertrauenswürdige Web-Erfahrung",
      android_btn: "Herunterladen (.apk)",
      android_step1: "Laden Sie die APK-Datei direkt auf Ihr Telefon herunter.",
      android_step2: "Aktivieren Sie bei Bedarf <strong>'Unbekannte Quellen'</strong> in den Einstellungen.",
      android_step3: "Öffnen Sie die heruntergeladene APK, um die Anwendung zu installieren.",
      android_step4: "Starten Sie Codyx und verbinden Sie sich mit Ihrem lokalen Orchestrator-Proxy.",

      guide_title: "Installationsanleitung",
      credit_text: "Entwickelt von M. Farid <span class='name-gold'>(Mufasa)</span>",
      license_link: "Lizenzvereinbarung",
      privacy_link: "Datenschutzerklärung"
    }
  };

  function setLanguage(lang) {
    const translation = TRANSLATIONS[lang] || TRANSLATIONS.en;

    if (lang === 'ar') {
      document.documentElement.dir = 'rtl';
    } else {
      document.documentElement.dir = 'ltr';
    }

    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (translation[key]) {
        el.innerHTML = translation[key];
      }
    });

    document.querySelectorAll('.flag-btn').forEach(btn => {
      if (btn.getAttribute('data-lang') === lang) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    localStorage.setItem('installer_lang', lang);
  }

  window.comingSoon = function() {
    const lang = localStorage.getItem('installer_lang') || 'en';
    let msg = 'Coming Soon!';
    if (lang === 'ar') msg = 'قريباً جداً!';
    else if (lang === 'fr') msg = 'Bientôt disponible !';
    else if (lang === 'de') msg = 'Demnächst verfügbar !';
    showToastMessage(msg);
  }

  window.showToastMessage = function(msg) {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.style.position = 'fixed';
      container.style.bottom = '24px';
      container.style.left = '50%';
      container.style.transform = 'translateX(-50%)';
      container.style.zIndex = '99999';
      container.style.display = 'flex';
      container.style.flexDirection = 'column';
      container.style.gap = '8px';
      document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.style.background = 'rgba(17, 24, 39, 0.85)';
    toast.style.backdropFilter = 'blur(12px)';
    toast.style.webkitBackdropFilter = 'blur(12px)';
    toast.style.border = '1px solid rgba(255, 255, 255, 0.1)';
    toast.style.padding = '12px 24px';
    toast.style.borderRadius = '8px';
    toast.style.color = '#fff';
    toast.style.fontSize = '14px';
    toast.style.fontWeight = '500';
    toast.style.boxShadow = '0 10px 25px rgba(0, 0, 0, 0.5)';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(20px)';
    toast.style.transition = 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
    toast.innerText = msg;
    
    container.appendChild(toast);
    
    setTimeout(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    }, 10);
    
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-20px)';
      setTimeout(() => {
        toast.remove();
      }, 300);
    }, 3000);
  }

  function createSparkle(button, isClick = false) {
    const rect = button.getBoundingClientRect();
    const container = document.body;
    const count = isClick ? 14 : 4;

    for (let i = 0; i < count; i++) {
      const sparkle = document.createElement('div');
      sparkle.className = 'sparkle-particle';
      const char = ['✦', '★', '✨', '•'][Math.floor(Math.random() * 4)];
      sparkle.innerText = char;

      const colors = ['#23e17e', '#4dbeff', '#9b7eff', '#ff6b9d', '#f5c842'];
      sparkle.style.color = colors[Math.floor(Math.random() * colors.length)];

      const x = rect.left + rect.width / 2 + (Math.random() - 0.5) * rect.width;
      const y = rect.top + rect.height / 2 + (Math.random() - 0.5) * rect.height;

      sparkle.style.left = x + "px";
      sparkle.style.top = y + "px";

      const angle = Math.random() * Math.PI * 2;
      const speed = isClick ? (2 + Math.random() * 4) : (1 + Math.random() * 2);
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed - 1.0;

      container.appendChild(sparkle);

      let opacity = 1.0;
      let scale = 0.5 + Math.random() * 0.8;
      let posX = x;
      let posY = y;

      const animate = () => {
        if (opacity <= 0.05) {
          sparkle.remove();
          return;
        }
        opacity -= 0.025;
        posX += vx;
        posY += vy;

        sparkle.style.transform = "translate(" + (posX - x) + "px, " + (posY - y) + "px) scale(" + scale + ")";
        sparkle.style.opacity = opacity;

        requestAnimationFrame(animate);
      };

      requestAnimationFrame(animate);
    }
  }

  document.querySelectorAll('.flag-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const lang = btn.getAttribute('data-lang');
      setLanguage(lang);
      createSparkle(btn, true);
    });

    btn.addEventListener('mouseenter', () => {
      createSparkle(btn, false);
    });
  });

  const storedLang = localStorage.getItem('installer_lang');
  if (storedLang && TRANSLATIONS[storedLang]) {
    setLanguage(storedLang);
  } else {
    const browserLang = navigator.language.slice(0, 2);
    if (TRANSLATIONS[browserLang]) {
      setLanguage(browserLang);
    } else {
      setLanguage('en');
    }
  }

  setInterval(() => {
    document.querySelectorAll('.flag-btn').forEach(btn => {
      if (Math.random() < 0.3) {
        createSparkle(btn, false);
      }
    });
  }, 1500);
}());
</script>
</body>
</html>`
}
